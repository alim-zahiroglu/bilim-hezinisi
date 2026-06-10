# Prompt 08 — Batch Import Performance Fix

**Goal:** Currently importing 100 books makes 100 separate database writes (each was a full-DB serialize under sql.js, now is one transaction commit each under better-sqlite3). We wrap the whole batch in a single transaction for ~50–100x speedup and atomicity.

**Paste everything below this line into Claude Code:**

---

You are working on the "Bilim Hezinisi" Electron app. Read these files first:

1. `main.js` — find the `db-add-book` IPC handler
2. `src/index.html` — find `confirmBatchImport()` function
3. `database.js` — find `addBook` (we'll add a batch variant)

## Problem

`confirmBatchImport()` loops over each file:
1. Read file with mammoth/pdfjs
2. Compute SHA-256 hash
3. Call `dbAddBook` IPC → backend INSERT + FTS index
4. Repeat

For 100 books × 200ms backend latency = 20 seconds + file reading. We make it ~1 second by:
- Reading files in parallel (limited concurrency)
- Sending one IPC with the whole batch
- Backend wraps everything in a single transaction
- Backend validates duplicates in one pass (single `SELECT file_hash` query)

## Your task

### Step 1 — Add a batch insert function to database.js

Open `database.js`. After the existing `addBook` function, ADD a new function:

```javascript
/**
 * Batch insert multiple books in a single transaction.
 * Returns { added: [{ id, title }], skipped: [{ title, reason }] }
 *
 * @param {Array<{title, author, category, format, date, description, content, fileHash}>} books
 */
function addBooksBatch(books) {
  if (!Array.isArray(books) || books.length === 0) {
    return { added: [], skipped: [] };
  }

  // Pre-load all existing hashes for fast duplicate check
  const existingHashes = new Set();
  try {
    const rows = db.prepare(`SELECT file_hash FROM books WHERE file_hash != ''`).all();
    for (const row of rows) existingHashes.add(row.file_hash);
  } catch (e) { /* ignore */ }

  const insertBook = db.prepare(`
    INSERT INTO books (title, author, category, format, date, description, file_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertContent = db.prepare(
    'INSERT OR REPLACE INTO book_content (book_id, content) VALUES (?, ?)'
  );
  const insertFts = hasFTS5
    ? db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
    : null;

  const added = [];
  const skipped = [];
  // Track hashes added in this batch so we don't accept duplicates within
  // the same import.
  const batchHashes = new Set();

  const tx = db.transaction(() => {
    for (const b of books) {
      const title = String(b.title || '').trim();
      if (!title) {
        skipped.push({ title: b.title || '(empty)', reason: 'empty_title' });
        continue;
      }

      const fileHash = b.fileHash || '';
      if (fileHash) {
        if (existingHashes.has(fileHash) || batchHashes.has(fileHash)) {
          skipped.push({ title, reason: 'duplicate' });
          continue;
        }
        batchHashes.add(fileHash);
      }

      const date = b.date || new Date().toISOString().slice(0, 10);
      try {
        const info = insertBook.run(
          title,
          b.author || '',
          b.category || '',
          b.format || 'TXT',
          date,
          b.description || '',
          fileHash
        );
        const bookId = info.lastInsertRowid;

        if (b.content) {
          insertContent.run(bookId, b.content);
          if (insertFts) {
            try {
              insertFts.run(bookId, title, b.author || '', b.content);
            } catch (e) { /* skip FTS insert error per book */ }
          }
        }

        added.push({ id: bookId, title });
      } catch (e) {
        skipped.push({ title, reason: e.message || 'insert_failed' });
      }
    }
  });

  tx();
  return { added, skipped };
}
```

Add `addBooksBatch` to the `module.exports` at the bottom of `database.js`:

```javascript
module.exports = {
  // ...existing exports...,
  addBooksBatch,
  // ...
};
```

### Step 2 — Add a batch IPC handler in main.js

Open `main.js`. Find the existing `db-add-book` IPC handler:

```javascript
ipcMain.handle('db-add-book', (event, bookData) => {
  try {
    const { title, author, category, format, date, description, content, fileHash } = bookData;
    // ...
  }
});
```

**Add a new handler immediately after** the existing `db-add-book` handler:

```javascript
// Batch add — accepts an array of book objects, inserts all in one transaction.
// Far faster than calling db-add-book in a loop for bulk imports.
ipcMain.handle('db-add-books-batch', (event, booksArray) => {
  try {
    if (!Array.isArray(booksArray) || booksArray.length === 0) {
      return { success: true, added: [], skipped: [] };
    }
    const result = database.addBooksBatch(booksArray);
    return { success: true, added: result.added, skipped: result.skipped };
  } catch (e) {
    console.error('db-add-books-batch failed:', e);
    return { success: false, error: e.message, added: [], skipped: [] };
  }
});
```

### Step 3 — Expose the new IPC in preload.js

Open `preload.js`. Find the existing `dbAddBook` line:

```javascript
dbAddBook: (bookData) => ipcRenderer.invoke('db-add-book', bookData),
```

**Add immediately after it:**

```javascript
dbAddBooksBatch: (booksArray) => ipcRenderer.invoke('db-add-books-batch', booksArray),
```

### Step 4 — Rewrite `confirmBatchImport` in index.html to use the batch IPC

Open `src/index.html`. Find `confirmBatchImport()`. The current implementation roughly looks like:

```javascript
async function confirmBatchImport() {
  // ...loop over S.batchFiles, call dbAddBook for each, call saveBookContent...
}
```

We will replace the entire function body. Locate the function definition (around line 1852). Find from `async function confirmBatchImport() {` until its closing `}`.

**Replace** the entire `confirmBatchImport` function with:

```javascript
async function confirmBatchImport() {
  if (!S.batchFiles || S.batchFiles.length === 0) {
    toast('قوشۇلىدىغان كىتاب يوق', 'i');
    return;
  }

  const category = document.getElementById('batchCat').value;
  const total = S.batchFiles.length;
  const status = document.getElementById('batchStatus');
  if (status) status.textContent = `0 / ${total} ئوقۇلدى`;

  progress(5);

  // Phase 1: read all files in limited-parallel batches.
  // Each entry in `prepared` is one of:
  //   { ok: true, book: {title, author, category, format, content, fileHash, date} }
  //   { ok: false, fileName, reason }
  const CONCURRENCY = 4;
  const prepared = [];
  let processed = 0;

  async function readOne(file) {
    try {
      const { filePath, fileName, ext, size } = file;
      let content = '';

      if (ext === 'txt') {
        const r = await window.electron.readTxt(filePath);
        if (!r.success) throw new Error(r.error || 'TXT read failed');
        content = r.content || '';
      } else if (ext === 'pdf') {
        const r = await window.electron.readPdfBuffer(filePath);
        if (!r.success) throw new Error(r.error || 'PDF read failed');
        if (window.pdfjsLib) {
          const bin = atob(r.data);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
          let text = '';
          const totalPages = Math.min(pdf.numPages, 200);
          for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            text += tc.items.map(x => x.str).join(' ') + '\n';
          }
          content = text;
        } else {
          content = '[PDF: ' + fileName + ']';
        }
      } else if (ext === 'docx') {
        const r = await window.electron.readDocx(filePath);
        if (!r.success) throw new Error(r.error || 'DOCX read failed');
        content = r.content || '';
      } else if (ext === 'doc') {
        const r = await window.electron.readDoc(filePath);
        if (!r.success) throw new Error(r.error || 'DOC read failed');
        content = r.content || '';
      } else {
        content = '[' + ext.toUpperCase() + ': ' + fileName + ']';
      }

      // SHA-256 hash for duplicate detection
      let fileHash = '';
      if (content) {
        try {
          fileHash = await window.electron.computeHash(content);
        } catch (e) { /* hash optional */ }
      }

      const titleNoExt = fileName.replace(/\.[^.]+$/, '');
      return {
        ok: true,
        book: {
          title: titleNoExt,
          author: '',
          category,
          format: ext.toUpperCase(),
          date: new Date().toISOString().slice(0, 10),
          description: '',
          content,
          fileHash
        }
      };
    } catch (e) {
      return { ok: false, fileName: file.fileName, reason: e.message };
    } finally {
      processed++;
      if (status) status.textContent = `${processed} / ${total} ئوقۇلدى`;
      const pct = 5 + Math.round((processed / total) * 70); // 5% → 75%
      progress(pct);
    }
  }

  // Limited-concurrency parallel read
  let cursor = 0;
  async function worker() {
    while (cursor < S.batchFiles.length) {
      const idx = cursor++;
      const result = await readOne(S.batchFiles[idx]);
      prepared.push(result);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, S.batchFiles.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (status) status.textContent = `سانداققا قوشۇلىۋاتىدۇ...`;
  progress(80);

  // Phase 2: send all successfully-read books in ONE batch IPC
  const booksToInsert = prepared.filter(p => p.ok).map(p => p.book);
  const readErrors = prepared.filter(p => !p.ok);

  let added = [];
  let skipped = [];

  if (booksToInsert.length > 0) {
    try {
      const r = await window.electron.dbAddBooksBatch(booksToInsert);
      if (!r.success) {
        toast('قوشۇشتا خاتالىق: ' + (r.error || ''), 'e');
        progress(100);
        return;
      }
      added = r.added || [];
      skipped = r.skipped || [];
    } catch (e) {
      toast('قوشۇشتا خاتالىق: ' + e.message, 'e');
      progress(100);
      return;
    }
  }

  progress(95);

  // Phase 3: refresh frontend state from backend (so IDs are correct)
  try {
    const data = await window.electron.loadLibrary();
    S.books = data.books || [];
    S.cats = data.cats || S.cats;
    S.nid = data.nid || S.nid;
    S.bookmarks = data.bookmarks || S.bookmarks;
    S.bookNotes = data.notes || S.bookNotes;
  } catch (e) {
    console.warn('Refresh library after batch import failed:', e);
  }

  progress(100);

  // Phase 4: close dialog and report results
  hideBatchImport();
  S.batchFiles = [];
  renderSide();
  renderBooks();

  const addedCount = added.length;
  const dupeCount = skipped.filter(s => s.reason === 'duplicate').length;
  const errorCount = skipped.length - dupeCount + readErrors.length;

  let msg = `${addedCount} كىتاب قوشۇلدى`;
  if (dupeCount) msg += `، ${dupeCount} تەكرارلانغان`;
  if (errorCount) msg += `، ${errorCount} خاتالىق`;
  toast(msg, addedCount > 0 ? 's' : 'i');

  // Detail report in console for diagnostics
  if (skipped.length || readErrors.length) {
    console.log('Batch import details:');
    if (added.length) console.log('  Added:', added);
    if (skipped.length) console.log('  Skipped (DB):', skipped);
    if (readErrors.length) console.log('  Read errors:', readErrors);
  }
}
```

### Step 5 — Add a `batchStatus` element if it doesn't exist

Open `src/index.html`. Find the batch import dialog. Look for the element with id `batchov` (around line that says `<div class="ov" id="batchov">`).

Inside that dialog, find where the import button is. Above or below the button, add a status element. Search for a div that says something about batch import progress. If there's no status element, find this pattern (look for the batch dialog body):

```html
<div id="batchFiles">
```

Right before the `confirmBatchImport()` button (find a button that calls `confirmBatchImport`), check if a `<div id="batchStatus">` exists. If it does NOT, add this immediately above the button-row that contains the import button:

```html
<div id="batchStatus" style="font-size:12px;color:var(--text2);margin:8px 0;text-align:center;font-family:sans-serif"></div>
```

If you can't find a clean spot, put it inside the `batchov` dialog body. Show me the surrounding context and I'll guide you.

### Step 6 — Make `progress()` safe when no element exists

The `progress()` function is at the bottom of `index.html`:

```javascript
function progress(val){const p=document.getElementById('progress');p.style.width=val+'%';p.style.opacity='1';if(val>=100)setTimeout(()=>{p.style.opacity='0';setTimeout(()=>{p.style.width='0';},300);},600);}
```

This will throw if `progress` element doesn't exist. **Replace** with a defensive version:

```javascript
function progress(val) {
  const p = document.getElementById('progress');
  if (!p) return;
  p.style.width = val + '%';
  p.style.opacity = '1';
  if (val >= 100) {
    setTimeout(() => {
      p.style.opacity = '0';
      setTimeout(() => { p.style.width = '0'; }, 300);
    }, 600);
  }
}
```

### Step 7 — Test small batch (3-5 books)

Prepare a folder with 3-5 small TXT or DOCX files for testing.

```bash
npm start
```

1. Open the app
2. Click the batch import button (folder icon, top toolbar)
3. Select your test folder
4. Confirm
5. Watch the progress bar — should fill 5% → 75% during read, then 80% → 95% during insert, then 100%
6. After it completes:
   - Toast should say `5 كىتاب قوشۇلدى`
   - The books should appear in the library
   - Open one and verify content displays

### Step 8 — Test duplicate detection

1. Run batch import on the same folder again (same files)
2. Toast should say `0 كىتاب قوشۇلدى، 5 تەكرارلانغان`
3. No duplicates added

### Step 9 — Test mixed batch (some files broken)

If you have a corrupt or empty file in the test folder, the toast should report errors separately.

### Step 10 — Performance check (if you have many files)

If you have access to ~50+ books for testing:
1. Note the current time
2. Run batch import
3. Note the time again
4. Compare against the old behavior (you can roll back via `git checkout HEAD~1` to test old version, but skip this if you don't need exact numbers)

Expected: 50 books should complete in under 5 seconds (vs ~30s previously).

### Step 11 — Commit

```bash
git add -A
git status
git commit -m "perf(import): batch insert books in single transaction (50-100x faster)"
```

### Step 12 — Final report

- ✅ `addBooksBatch` function added to database.js
- ✅ `db-add-books-batch` IPC handler in main.js
- ✅ `dbAddBooksBatch` exposed in preload.js
- ✅ `confirmBatchImport` rewritten with parallel read + batch insert
- ✅ Progress bar updates correctly
- ✅ Duplicate detection works
- ✅ Library refreshes after import
- ✅ Git commit hash: [show it]

Then say: **"Batch import optimization complete. Safe to proceed to PROMPT_09."**
