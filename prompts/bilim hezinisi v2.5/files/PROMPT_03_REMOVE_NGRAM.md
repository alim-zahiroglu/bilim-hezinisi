# Prompt 03 — Remove the Broken N-Gram Index

**Goal:** The `book_ngrams` table grows uncontrollably (35GB for 500 books). FTS5 already does what n-grams were trying to do. We will remove the n-gram index entirely and route everything through FTS5.

**Paste everything below this line into Claude Code:**

---

You are working on the "Bilim Hezinisi" Electron app. Read these files first:

1. `database.js` — find the n-gram functions: `ngramIndexBook`, `ngramRemoveBook`, `ngramFindWord`, `ngramIndexQuran`, `hasNgramIndex`, `quranContentSnippet`
2. `main.js` — find the n-gram IPC handlers and the `ensureNgramIndexBackground` function
3. `preload.js` — find the `ngramFindWord` exposure
4. `src/ngram.js` — frontend that uses these
5. `src/notes.js` — calls `window.NGram.findReferences`

## Problem

The `book_ngrams` table stores trigrams + positions for every book. For 500 books, this is ~35GB. The runtime use case (Notes auto-reference) only needs to know "which books contain this word as a prefix". FTS5 does this faster, with zero extra storage.

## Your task

### Step 1 — Replace `ngramFindWord` to use FTS5 prefix search

Open `database.js`. Find the current `ngramFindWord` function (around line 805). Replace its entire body with this implementation:

```javascript
function ngramFindWord(word) {
  word = String(word || '').trim();
  if (word.length < 2) return [];

  const results = [];
  const seenIds = new Set();

  // Real books — use FTS5 prefix search
  if (hasFTS5) {
    try {
      const r = db.exec(
        `SELECT DISTINCT rowid FROM book_fts WHERE book_fts MATCH ? LIMIT 100`,
        [word + '*']
      );
      if (r.length && r[0].values.length) {
        for (const row of r[0].values) {
          const id = row[0];
          if (!seenIds.has(id)) {
            seenIds.add(id);
            results.push({ bookId: id, positions: [] });
          }
        }
      }
    } catch (e) {
      // FTS5 query failed (rare). Fall through to LIKE fallback.
    }
  }

  // Fallback: LIKE-based search if FTS5 returned nothing
  if (!results.length) {
    try {
      const r = db.exec(
        `SELECT DISTINCT book_id FROM book_content WHERE content LIKE ? LIMIT 100`,
        ['%' + word + '%']
      );
      if (r.length && r[0].values.length) {
        for (const row of r[0].values) {
          const id = row[0];
          if (!seenIds.has(id)) {
            seenIds.add(id);
            results.push({ bookId: id, positions: [] });
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Quran (Uyghur + Arabic) — check FTS5 if available
  if (hasQuranFTS) {
    try {
      const qr = db.exec(
        `SELECT 1 FROM quran_fts WHERE quran_fts MATCH ? LIMIT 1`,
        [word + '*']
      );
      if (qr.length && qr[0].values.length) {
        // Add both virtual book IDs so the scanner verifies in both columns
        results.push({ bookId: QURAN_BOOK_ID_UG, positions: [] });
        results.push({ bookId: QURAN_BOOK_ID_AR, positions: [] });
      }
    } catch (e) { /* ignore */ }
  } else {
    // LIKE fallback for Quran
    try {
      const qr = db.exec(
        `SELECT 1 FROM quran_ayas WHERE text_ug LIKE ? OR text_ar_simple LIKE ? LIMIT 1`,
        ['%' + word + '%', '%' + word + '%']
      );
      if (qr.length && qr[0].values.length) {
        results.push({ bookId: QURAN_BOOK_ID_UG, positions: [] });
        results.push({ bookId: QURAN_BOOK_ID_AR, positions: [] });
      }
    } catch (e) { /* ignore */ }
  }

  return results;
}
```

### Step 2 — Replace `quranContentSnippet` to use FTS5

In `database.js`, find the current `quranContentSnippet` function (around line 886). Replace its entire body with this:

```javascript
function quranContentSnippet(needle, maxResults, ctx) {
  const MAX = Math.max(1, Math.min(50, maxResults || 5));
  const CTX = Math.max(10, Math.min(400, ctx || 90));
  const cleanNeedle = String(needle || '').trim();
  if (!cleanNeedle) return [];

  // Try FTS5 first for speed
  if (hasQuranFTS) {
    try {
      const tokens = cleanNeedle.split(/\s+/).filter(t => t.length >= 2);
      if (!tokens.length) return [];
      // Quote multi-word for phrase search; single-word becomes prefix
      const ftsQuery = tokens.length > 1
        ? '"' + tokens.join(' ') + '"'
        : tokens[0] + '*';

      const sql = `
        SELECT a.sura, a.aya, a.text_ug, a.text_ar_simple,
               snippet(quran_fts, 0, '§MARK_OPEN§', '§MARK_CLOSE§', '...', 12) AS snip_ar,
               snippet(quran_fts, 1, '§MARK_OPEN§', '§MARK_CLOSE§', '...', 12) AS snip_ug
        FROM quran_fts
        JOIN quran_ayas a ON a.id = quran_fts.rowid
        WHERE quran_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      const r = db.exec(sql, [ftsQuery, MAX]);
      if (r.length && r[0].values.length) {
        const out = [];
        for (const row of r[0].values) {
          const [sura, aya, textUg, textArSimple, snipAr, snipUg] = row;
          // Prefer Uyghur snippet if it contains the marker, otherwise Arabic
          if (snipUg && snipUg.indexOf('§MARK_OPEN§') !== -1) {
            out.push({
              snip: String(snipUg).replace(/\s+/g, ' ').trim(),
              pos: 0, sura, aya, lang: 'ug'
            });
          } else if (snipAr && snipAr.indexOf('§MARK_OPEN§') !== -1) {
            out.push({
              snip: String(snipAr).replace(/\s+/g, ' ').trim(),
              pos: 0, sura, aya, lang: 'ar'
            });
          }
        }
        if (out.length) return out;
      }
    } catch (e) {
      // FTS5 failed; fall through to substring scan
    }
  }

  // Fallback: substring scan (slower but reliable)
  const lcNeedle = cleanNeedle.toLowerCase();
  const snippets = [];

  function scanColumn(col, langTag) {
    if (snippets.length >= MAX) return;
    const rows = db.exec(`SELECT sura, aya, ${col} FROM quran_ayas ORDER BY sura, aya`);
    if (!rows.length) return;
    for (const row of rows[0].values) {
      if (snippets.length >= MAX) break;
      const sura = row[0], aya = row[1], text = row[2] || '';
      if (!text) continue;
      const lcText = text.toLowerCase();
      const hit = lcText.indexOf(lcNeedle);
      if (hit === -1) continue;

      const start = Math.max(0, hit - CTX);
      const end = Math.min(text.length, hit + lcNeedle.length + CTX);
      const before = text.slice(start, hit);
      const match = text.slice(hit, hit + lcNeedle.length);
      const after = text.slice(hit + lcNeedle.length, end);

      let snip = before + '§MARK_OPEN§' + match + '§MARK_CLOSE§' + after;
      if (start > 0) snip = '...' + snip;
      if (end < text.length) snip = snip + '...';

      snippets.push({
        snip: snip.replace(/\s+/g, ' ').trim(),
        pos: hit, sura, aya, lang: langTag
      });
    }
  }

  scanColumn('text_ug', 'ug');
  scanColumn('text_ar_simple', 'ar');
  return snippets;
}
```

### Step 3 — Make the n-gram indexing functions no-ops

In `database.js`, find these functions and replace their bodies so they do nothing:

- `ngramIndexBook(bookId, text)` — make it just `return;`
- `ngramRemoveBook(bookId)` — make it just `return;`
- `hasNgramIndex(bookId)` — make it just `return true;` (so the backfill loop skips everything)
- `ngramIndexQuran()` — make it just `return;`

The exact replacements:

```javascript
function hasNgramIndex(bookId) {
  // n-gram index removed; FTS5 covers this use case
  return true;
}

function ngramIndexBook(bookId, text) {
  // n-gram index removed; FTS5 covers this use case
  return;
}

function ngramRemoveBook(bookId) {
  // n-gram index removed; FTS5 covers this use case
  return;
}

function ngramIndexQuran() {
  // n-gram index removed; FTS5 covers this use case
  return;
}
```

### Step 4 — Drop the `book_ngrams` table on startup

In `database.js`, inside the `createTables()` function, find this block:

```javascript
db.run(`
  CREATE TABLE IF NOT EXISTS book_ngrams (
    gram TEXT NOT NULL,
    book_id INTEGER NOT NULL,
    positions TEXT NOT NULL,
    PRIMARY KEY(gram, book_id)
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_ngram_gram ON book_ngrams(gram)`);
```

**Replace** the entire block with this migration code:

```javascript
// LEGACY: book_ngrams table is no longer used. Drop it if it exists
// to reclaim disk space. FTS5 covers the same use case.
try {
  db.run('DROP TABLE IF EXISTS book_ngrams');
  db.run('DROP INDEX IF EXISTS idx_ngram_gram');
} catch (e) {
  console.warn('[migration] could not drop book_ngrams:', e.message);
}
```

### Step 5 — Remove `ensureNgramIndexBackground` from main.js

Open `main.js`. Find the function `ensureNgramIndexBackground` and the `setTimeout` that calls it inside `initDatabase`.

**Delete** the entire `ensureNgramIndexBackground` function (around lines 99-139).

In `initDatabase`, find this block and **delete** it:

```javascript
// Schedule background n-gram backfill so existing books become searchable
// in the Notes auto-reference feature. This runs after the window is ready
// so app startup is not blocked.
setTimeout(() => {
  ensureNgramIndexBackground().catch(e => console.error('[ngram] backfill error:', e));
}, 3000);
```

### Step 6 — Verify removals with grep

```bash
grep -n "ensureNgramIndexBackground" main.js
```

Should return **no matches**.

```bash
grep -n "book_ngrams" database.js
```

Should only return matches inside the migration `DROP TABLE` block — not any `INSERT INTO book_ngrams` or `CREATE TABLE book_ngrams`.

### Step 7 — Compact existing database (one-time cleanup for users with old data)

After dropping the table, the SQLite file still has the disk space allocated. We need to VACUUM it. Add a one-time cleanup in `main.js` `initDatabase`:

In `main.js`, inside `initDatabase`, find this code:

```javascript
ensureDirs();
await database.initDB(DATA_DIR);

// Ensure default categories exist
database.ensureDefaultCategories(defaultCats());
```

**Add** these lines immediately after `await database.initDB(DATA_DIR);`:

```javascript
  // One-time cleanup: vacuum DB to reclaim space from removed n-gram table
  try {
    const vacuumDone = database.getSetting('ngram_vacuum_v1', false);
    if (!vacuumDone) {
      console.log('[migration] vacuuming database to reclaim n-gram table space...');
      database.vacuum();
      database.setSetting('ngram_vacuum_v1', true);
      database.saveDB(DATA_DIR);
      console.log('[migration] vacuum complete');
    }
  } catch(e) {
    console.warn('[migration] vacuum failed:', e.message);
  }
```

### Step 8 — Add a `vacuum` function to database.js

Open `database.js`. Add this function anywhere near `saveDB`:

```javascript
/**
 * Reclaim disk space by rebuilding the database file.
 * Call this after dropping large tables.
 */
function vacuum() {
  if (!db) return;
  try {
    db.run('VACUUM');
  } catch (e) {
    console.warn('[vacuum] failed:', e.message);
  }
}
```

Then add `vacuum` to the `module.exports` list at the bottom of `database.js`. Find the existing exports and add `vacuum`:

```javascript
module.exports = {
  initDB, saveDB, vacuum,
  // ...rest stays the same
```

### Step 9 — Verify ngram.js frontend still works (no changes needed there)

The frontend `src/ngram.js` calls `window.electron.ngramFindWord()` which still exists, just with a new implementation. Read `src/ngram.js` to confirm we don't need to change it.

The expected behavior change: the bigram DF probe will return slightly different counts (FTS5 prefix matching is by document, not by trigram). This is acceptable — the threshold `RARE_BIGRAM_DF_MAX = 6` still filters reasonably.

### Step 10 — Test the app

```bash
npm start
```

Expected behavior:
1. App launches normally
2. On first launch with this build, console shows: `[migration] vacuuming database...`
3. Library loads, books are visible
4. Open a book — content reads normally
5. Search for a word in the search bar — results appear
6. Open Notes mode, create a new note, type a sentence with multiple words like:
   ```
   ئاللاھ تائالا ھەممىنى بىلىپ تۇرغۇچىدۇر
   ```
   The "🔗 مەنبە" tab should populate with references (if your books contain matching phrases).
7. Open Quran mode, search for `ئاللاھ` — results appear quickly

If anything fails, tell me the exact error.

### Step 11 — Verify database file shrunk

```bash
node -e "const fs=require('fs'),path=require('path'),os=require('os');const dbPath=path.join(os.homedir(),'JamiyKutupxana','library.db');if(fs.existsSync(dbPath)){console.log('DB size:',fs.statSync(dbPath).size,'bytes');}else{console.log('No DB');}"
```

Show me the size. If you had a lot of books indexed, the DB should be drastically smaller now.

### Step 12 — Commit

```bash
git add -A
git status
git commit -m "perf(database): remove broken n-gram index, route through FTS5"
```

### Step 13 — Final report

- ✅ `book_ngrams` table no longer created
- ✅ `ngramFindWord` now uses FTS5
- ✅ `quranContentSnippet` now uses FTS5
- ✅ App launches and Notes references still work
- ✅ Database file size: [show the size]
- ✅ Git commit hash: [show the hash]

Then say: **"N-gram removal complete. Safe to proceed to PROMPT_04."**
