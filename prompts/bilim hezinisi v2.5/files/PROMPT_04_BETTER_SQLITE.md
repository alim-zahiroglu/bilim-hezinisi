# Prompt 04 — Migrate from `sql.js` to `better-sqlite3` (Performance Critical)

**Goal:** `sql.js` is a WebAssembly SQLite that loads the entire database into RAM and rewrites the whole file on every save. For 500+ books this is unusable. `better-sqlite3` is a native binding with WAL mode — it writes only changed pages, runs queries 100× faster, and removes the need for `saveDB()` calls.

**This is the highest-impact change in the whole upgrade.** Test carefully.

**Paste everything below this line into Claude Code:**

---

You are working on the "Bilim Hezinisi" Electron app. Read these files first:

1. `package.json` — see current `sql.js` dependency and Electron version
2. `database.js` — uses `sql.js`-specific API (`db.exec(sql, params)` returns `[{columns, values}]`, `db.prepare().run([...])` takes array)
3. `main.js` — calls `database.saveDB(DATA_DIR)` after every mutation

## Migration Strategy

`better-sqlite3` is API-compatible with `sql.js` for SOME operations but different for others. We will:

1. Install `better-sqlite3` and `electron-rebuild`
2. Rebuild it for the Electron version
3. Rewrite `database.js` to use the new API
4. Make `saveDB()` a no-op (better-sqlite3 writes immediately)
5. Verify everything works

## Your task

### Step 1 — Check Electron version

```bash
node -e "const pkg=require('./package.json'); console.log('electron:', pkg.devDependencies.electron); console.log('node:', process.version);"
```

Show me the output. We need to know the Electron major version (e.g. 28).

### Step 2 — Install better-sqlite3

```bash
npm install better-sqlite3@^11.5.0
npm install --save-dev @electron/rebuild
```

If `npm install` fails with errors about Python or C++ compilers, tell me the exact error. On Windows you may need:

```bash
npm install --global --production windows-build-tools
```

(But try the install first — it usually works without this on modern Windows.)

### Step 3 — Rebuild for Electron

```bash
npx electron-rebuild -f -w better-sqlite3
```

This rebuilds the native module against Electron's Node.js version. Show me the output. It should end with success.

### Step 4 — Verify the rebuild

```bash
node -e "try { require('better-sqlite3'); console.log('Note: better-sqlite3 loaded in Node.js but may need rebuild for Electron'); } catch(e) { console.log('Expected: Node.js version mismatch — this is OK if Electron version was rebuilt'); console.log(e.message); }"
```

Don't worry if this fails — we use `better-sqlite3` only inside Electron, which has its own Node.js version.

### Step 5 — Add a postinstall hook to package.json

In `package.json`, in the `"scripts"` section, add this entry:

```json
"postinstall": "electron-rebuild -f -w better-sqlite3"
```

So that running `npm install` automatically rebuilds for Electron.

### Step 6 — Update package.json build configuration

Open `package.json`. In the `"build"` section, find the `"files"` array. **Remove** this line:

```json
"node_modules/sql.js/dist/sql-wasm.wasm"
```

(It's no longer needed because we're not using sql.js.)

In the `"build"` section, add or update `"asarUnpack"` to ensure `better-sqlite3` native binaries are not packed in asar:

```json
"build": {
  ...existing fields...,
  "asarUnpack": [
    "node_modules/better-sqlite3/**/*"
  ],
  ...
}
```

Also change `"nodeGypRebuild": false` to `"nodeGypRebuild": false` (keep as is — electron-rebuild handles it via postinstall).

### Step 7 — Rewrite `database.js` core for better-sqlite3

Open `database.js`. We will rewrite the API layer but keep all business logic identical.

**Replace the top of `database.js`** (lines 1 through the end of `createTables` function) with the new better-sqlite3 version. Specifically, replace from the comment block at the top through the end of `createTables()`.

The new top of `database.js` should be:

```javascript
/**
 * SQLite Database Layer for Bilim Hezinisi
 * Uses better-sqlite3 (native, synchronous, WAL mode).
 * Migrated from sql.js for ~100x performance and instant disk writes.
 */
const path = require('path');
const fs = require('fs');

let db = null;
let hasFTS5 = false;
let hasQuranFTS = false;

const DB_FILENAME = 'library.db';

/**
 * Initialize the database
 * @param {string} dataDir - Directory to store the database
 * @returns {Promise<void>}
 */
async function initDB(dataDir) {
  if (db) return; // Already initialized

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    throw new Error(
      'better-sqlite3 is not loaded. The native module may need rebuilding for Electron. ' +
      'Run: npx electron-rebuild -f -w better-sqlite3\nOriginal error: ' + e.message
    );
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, DB_FILENAME);
  db = new Database(dbPath);

  // Performance pragmas
  db.pragma('journal_mode = WAL');         // Write-Ahead Log: faster + crash-safe
  db.pragma('synchronous = NORMAL');       // Safe with WAL, ~2x faster than FULL
  db.pragma('cache_size = -65536');        // 64 MB page cache (negative = KB)
  db.pragma('temp_store = MEMORY');        // Temp tables in RAM
  db.pragma('mmap_size = 268435456');      // 256 MB memory-mapped I/O
  db.pragma('foreign_keys = ON');

  createTables();
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      category TEXT DEFAULT '',
      format TEXT DEFAULT 'TXT',
      date TEXT DEFAULT '',
      description TEXT DEFAULT '',
      file_hash TEXT DEFAULT '',
      original_path TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      parent_id INTEGER DEFAULT NULL,
      sort_order INTEGER DEFAULT 0,
      icon TEXT DEFAULT '',
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      name TEXT DEFAULT '',
      position REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      position REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      book_id INTEGER PRIMARY KEY,
      position REAL DEFAULT 0,
      page INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recent_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      read_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS book_content (
      book_id INTEGER PRIMARY KEY,
      content TEXT DEFAULT '',
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_count INTEGER DEFAULT 0,
      searched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quran_suras (
      number INTEGER PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_ug TEXT NOT NULL,
      name_translit TEXT DEFAULT '',
      revelation TEXT DEFAULT 'meccan',
      aya_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quran_ayas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sura INTEGER NOT NULL,
      aya INTEGER NOT NULL,
      text_ar TEXT NOT NULL,
      text_ar_simple TEXT NOT NULL,
      text_ug TEXT NOT NULL DEFAULT '',
      UNIQUE(sura, aya),
      FOREIGN KEY(sura) REFERENCES quran_suras(number)
    );

    CREATE INDEX IF NOT EXISTS idx_quran_sura ON quran_ayas(sura);

    CREATE TABLE IF NOT EXISTS note_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'يېڭى خاتىرە',
      content_html TEXT NOT NULL DEFAULT '',
      content_text TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_note_updated ON note_documents(updated_at DESC);
  `);

  // Book FTS5
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS book_fts USING fts5(
        title, author, content,
        content_rowid='book_id',
        tokenize='unicode61'
      )
    `);
    hasFTS5 = true;
    console.log('FTS5 full-text search enabled');
  } catch (e) {
    hasFTS5 = false;
    console.log('FTS5 not available, using LIKE-based search fallback');
  }

  // Quran FTS5
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS quran_fts USING fts5(
        text_ar_simple, text_ug,
        content='quran_ayas', content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS quran_fts_ai AFTER INSERT ON quran_ayas BEGIN
        INSERT INTO quran_fts(rowid, text_ar_simple, text_ug)
        VALUES (new.id, new.text_ar_simple, new.text_ug);
      END;
      CREATE TRIGGER IF NOT EXISTS quran_fts_ad AFTER DELETE ON quran_ayas BEGIN
        INSERT INTO quran_fts(quran_fts, rowid, text_ar_simple, text_ug)
        VALUES ('delete', old.id, old.text_ar_simple, old.text_ug);
      END;
    `);
    hasQuranFTS = true;
    console.log('Quran FTS5 enabled');
  } catch (e) {
    hasQuranFTS = false;
    console.log('Quran FTS5 not available, using LIKE fallback');
  }

  // LEGACY: book_ngrams table is no longer used. Drop it if it exists.
  try {
    db.exec('DROP TABLE IF EXISTS book_ngrams');
    db.exec('DROP INDEX IF EXISTS idx_ngram_gram');
  } catch (e) {
    console.warn('[migration] could not drop book_ngrams:', e.message);
  }
}
```

### Step 8 — Update `saveDB` and `vacuum`

In `database.js`, find the `saveDB` function. Replace it with a no-op (better-sqlite3 writes immediately):

```javascript
/**
 * No-op kept for backward compatibility.
 * better-sqlite3 with WAL writes immediately; no manual flush needed.
 */
function saveDB(dataDir) {
  // Intentionally empty
  return;
}
```

Replace the `vacuum` function with:

```javascript
function vacuum() {
  if (!db) return;
  try {
    db.exec('VACUUM');
  } catch (e) {
    console.warn('[vacuum] failed:', e.message);
  }
}
```

### Step 9 — Convert all data access functions to better-sqlite3 API

This is the largest part. Read **every** function in `database.js` and convert from sql.js to better-sqlite3.

**API differences:**

| sql.js | better-sqlite3 |
|---|---|
| `db.run(sql)` | `db.exec(sql)` (no params) OR `db.prepare(sql).run()` (with params) |
| `db.run(sql, [a, b])` | `db.prepare(sql).run(a, b)` (spread, not array) |
| `const stmt = db.prepare(sql); stmt.run([a, b]); stmt.free();` | `db.prepare(sql).run(a, b);` |
| `db.exec(sql)` returns `[{columns, values: [[r1c1, r1c2], ...]}]` | `db.prepare(sql).all(...)` returns `[{col1: r1c1, col2: r1c2}, ...]` |
| `db.exec(sql, params)` | `db.prepare(sql).all(...params)` |
| `db.exec('SELECT last_insert_rowid()')[0].values[0][0]` | `result.lastInsertRowid` from `.run()` |

**Critical:** `db.run('BEGIN TRANSACTION')` / `db.run('COMMIT')` should be replaced with `better-sqlite3` transactions:

```javascript
const tx = db.transaction((items) => {
  for (const item of items) {
    insertStmt.run(item.a, item.b);
  }
});
tx(allItems);
```

**Now do this systematically.** Go through `database.js` from top to bottom (after `createTables`) and convert every function. Here are the exact replacements for the most important functions:

#### addBook

```javascript
function addBook(title, author, category, format, date, description, content, fileHash) {
  const stmt = db.prepare(`
    INSERT INTO books (title, author, category, format, date, description, file_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    title,
    author || '',
    category || '',
    format || 'TXT',
    date || new Date().toISOString().slice(0, 10),
    description || '',
    fileHash || ''
  );
  const bookId = info.lastInsertRowid;

  if (content) {
    db.prepare('INSERT OR REPLACE INTO book_content (book_id, content) VALUES (?, ?)')
      .run(bookId, content);

    if (hasFTS5) {
      try {
        db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
          .run(bookId, title, author || '', content);
      } catch (e) { /* ignore FTS5 errors */ }
    }
  }

  return bookId;
}
```

#### updateBook

```javascript
function updateBook(id, title, author, category, description) {
  db.prepare(`
    UPDATE books SET title=?, author=?, category=?, description=?, updated_at=datetime('now')
    WHERE id=?
  `).run(title, author || '', category || '', description || '', id);

  if (hasFTS5) {
    try {
      db.prepare('DELETE FROM book_fts WHERE rowid=?').run(id);
      const content = getBookContent(id);
      if (content) {
        db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
          .run(id, title, author || '', content);
      }
    } catch (e) { /* ignore */ }
  }
}
```

#### deleteBook

```javascript
function deleteBook(id) {
  contentCache.delete(id);
  if (hasFTS5) {
    try { db.prepare('DELETE FROM book_fts WHERE rowid=?').run(id); } catch (e) {}
  }
  db.prepare('DELETE FROM book_content WHERE book_id=?').run(id);
  db.prepare('DELETE FROM bookmarks WHERE book_id=?').run(id);
  db.prepare('DELETE FROM notes WHERE book_id=?').run(id);
  db.prepare('DELETE FROM reading_progress WHERE book_id=?').run(id);
  db.prepare('DELETE FROM recent_reads WHERE book_id=?').run(id);
  db.prepare('DELETE FROM books WHERE id=?').run(id);
}
```

#### getBook / getAllBooks / getBooksByCategory

```javascript
function getBook(id) {
  const row = db.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!row) return null;
  return rowToBook(row);
}

function getAllBooks() {
  const rows = db.prepare('SELECT * FROM books ORDER BY date DESC').all();
  return rows.map(rowToBook);
}

function getBooksByCategory(category) {
  const rows = db.prepare('SELECT * FROM books WHERE category=? ORDER BY date DESC').all(category);
  return rows.map(rowToBook);
}

function rowToBook(row) {
  // better-sqlite3 returns plain objects
  const book = { ...row };
  book.desc = book.description || '';
  return book;
}
```

#### getBookContent / saveBookContent

```javascript
function getBookContent(bookId) {
  if (contentCache.has(bookId)) {
    const v = contentCache.get(bookId);
    contentCache.delete(bookId);
    contentCache.set(bookId, v);
    return v;
  }
  const row = db.prepare('SELECT content FROM book_content WHERE book_id=?').get(bookId);
  const content = row ? (row.content || '') : '';

  if (contentCache.size >= CACHE_MAX) {
    const firstKey = contentCache.keys().next().value;
    contentCache.delete(firstKey);
  }
  contentCache.set(bookId, content);
  return content;
}

function saveBookContent(bookId, content) {
  contentCache.delete(bookId);
  db.prepare('INSERT OR REPLACE INTO book_content (book_id, content) VALUES (?, ?)')
    .run(bookId, content);

  if (hasFTS5) {
    try {
      db.prepare('DELETE FROM book_fts WHERE rowid=?').run(bookId);
      const book = getBook(bookId);
      if (book) {
        db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
          .run(bookId, book.title || '', book.author || '', content);
      }
    } catch (e) { /* ignore */ }
  }
}

function checkDuplicateHash(hash) {
  if (!hash) return false;
  const row = db.prepare('SELECT id FROM books WHERE file_hash=?').get(hash);
  return !!row;
}
```

#### searchBooks (FTS5 + LIKE fallback merge)

```javascript
function searchBooks(query, category) {
  if (!hasFTS5) return searchBooksSimple(query, category);

  const results = [];

  try {
    let ftsQuery = query;
    if (!ftsQuery.includes('"')) {
      ftsQuery = ftsQuery.split(/\s+/).filter(Boolean).map(w => w + '*').join(' ');
    }

    let sql = `
      SELECT b.*, snippet(book_fts, 2, '<mark>', '</mark>', '...', 40) as snippet, rank
      FROM book_fts
      JOIN books b ON b.id = book_fts.rowid
      WHERE book_fts MATCH ?
    `;
    const params = [ftsQuery];

    if (category && category !== 'all') {
      sql += ' AND b.category = ?';
      params.push(category);
    }
    sql += ' ORDER BY rank LIMIT 200';

    const rows = db.prepare(sql).all(...params);
    for (const row of rows) {
      const book = { ...row };
      book.desc = book.description || '';
      results.push({
        book,
        snip: book.snippet || '',
        inT: (book.title || '').toLowerCase().includes(query.toLowerCase()),
        inA: (book.author || '').toLowerCase().includes(query.toLowerCase()),
        inC: true
      });
    }
  } catch (e) {
    return searchBooksSimple(query, category);
  }

  // Title/author matches FTS5 might miss
  try {
    let likeSql = 'SELECT * FROM books WHERE (title LIKE ? OR author LIKE ?)';
    const likeParams = ['%' + query + '%', '%' + query + '%'];
    if (category && category !== 'all') {
      likeSql += ' AND category = ?';
      likeParams.push(category);
    }
    const rows = db.prepare(likeSql).all(...likeParams);
    const existingIds = new Set(results.map(r => r.book.id));
    for (const row of rows) {
      const book = rowToBook(row);
      if (!existingIds.has(book.id)) {
        results.push({
          book,
          snip: '',
          inT: (book.title || '').toLowerCase().includes(query.toLowerCase()),
          inA: (book.author || '').toLowerCase().includes(query.toLowerCase()),
          inC: false
        });
      }
    }
  } catch (e) { /* ignore */ }

  return results;
}

function searchBooksSimple(query, category) {
  const results = [];
  const lq = query.toLowerCase();

  let sql = 'SELECT * FROM books';
  const params = [];
  if (category && category !== 'all') {
    sql += ' WHERE category = ?';
    params.push(category);
  }

  const rows = db.prepare(sql).all(...params);
  for (const row of rows) {
    const book = rowToBook(row);
    const inT = (book.title || '').toLowerCase().includes(lq);
    const inA = (book.author || '').toLowerCase().includes(lq);

    let inC = false;
    let snip = '';
    const content = getBookContent(book.id);
    if (content) {
      const lcContent = content.toLowerCase();
      const idx = lcContent.indexOf(lq);
      if (idx !== -1) {
        inC = true;
        const s = Math.max(0, idx - 60);
        const e = Math.min(content.length, idx + query.length + 60);
        snip = content.slice(s, e).replace(/\n/g, ' ');
      }
    }

    if (inT || inA || inC) {
      results.push({ book, snip, inT, inA, inC });
    }
  }
  return results;
}
```

#### getAllSnippetsForBook (KEEP — pure JavaScript, no DB API used in body)

The function body uses only string operations. Just verify it still works — no changes needed.

#### Quran functions

```javascript
function quranSuraExists() {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM quran_suras').get();
  return row && row.cnt > 0;
}

function quranSeedBulk(suras, ayas) {
  if (!Array.isArray(suras) || !Array.isArray(ayas)) {
    throw new Error('quranSeedBulk: suras and ayas must be arrays');
  }

  const insertSura = db.prepare(
    `INSERT INTO quran_suras (number, name_ar, name_ug, name_translit, revelation, aya_count) VALUES (?,?,?,?,?,?)`
  );
  const insertAya = db.prepare(
    `INSERT INTO quran_ayas (sura, aya, text_ar, text_ar_simple, text_ug) VALUES (?,?,?,?,?)`
  );

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM quran_ayas').run();
    db.prepare('DELETE FROM quran_suras').run();

    for (const s of suras) {
      insertSura.run(s.number, s.name_ar, s.name_ug, s.name_translit || '', s.revelation || 'meccan', s.aya_count);
    }
    for (const a of ayas) {
      insertAya.run(a.sura, a.aya, a.text_ar, a.text_ar_simple, a.text_ug || '');
    }
  });

  tx();
  return { suras: suras.length, ayas: ayas.length };
}

function quranGetSuras() {
  return db.prepare(`
    SELECT number, name_ar, name_ug, name_translit, revelation, aya_count
    FROM quran_suras ORDER BY number
  `).all();
}

function quranGetAyas(suraNumber) {
  return db.prepare(`
    SELECT id, sura, aya, text_ar, text_ar_simple, text_ug
    FROM quran_ayas WHERE sura=? ORDER BY aya
  `).all(suraNumber);
}

function quranGetAya(sura, aya) {
  return db.prepare(`
    SELECT id, sura, aya, text_ar, text_ar_simple, text_ug
    FROM quran_ayas WHERE sura=? AND aya=?
  `).get(sura, aya) || null;
}

function quranSearch(query, opts) {
  opts = opts || {};
  const lang = opts.lang || 'auto';
  const limit = Math.max(1, Math.min(500, opts.limit || 200));
  if (!query || !String(query).trim()) return [];
  const q = String(query).trim();

  if (hasQuranFTS) {
    try {
      const tokens = q.split(/\s+/).map(w => w.replace(/["'*:]/g, '')).filter(Boolean);
      if (!tokens.length) return [];
      const ftsQuery = tokens.map(t => t + '*').join(' ');

      let sql;
      if (lang === 'ar') {
        sql = `SELECT a.id, a.sura, a.aya, a.text_ar, a.text_ug,
               snippet(quran_fts, 0, '<mark>', '</mark>', '...', 10) AS snip_ar,
               '' AS snip_ug
               FROM quran_fts JOIN quran_ayas a ON a.id=quran_fts.rowid
               WHERE quran_fts.text_ar_simple MATCH ? ORDER BY rank LIMIT ?`;
      } else if (lang === 'ug') {
        sql = `SELECT a.id, a.sura, a.aya, a.text_ar, a.text_ug,
               '' AS snip_ar,
               snippet(quran_fts, 1, '<mark>', '</mark>', '...', 10) AS snip_ug
               FROM quran_fts JOIN quran_ayas a ON a.id=quran_fts.rowid
               WHERE quran_fts.text_ug MATCH ? ORDER BY rank LIMIT ?`;
      } else {
        sql = `SELECT a.id, a.sura, a.aya, a.text_ar, a.text_ug,
               snippet(quran_fts, 0, '<mark>', '</mark>', '...', 10) AS snip_ar,
               snippet(quran_fts, 1, '<mark>', '</mark>', '...', 10) AS snip_ug
               FROM quran_fts JOIN quran_ayas a ON a.id=quran_fts.rowid
               WHERE quran_fts MATCH ? ORDER BY rank LIMIT ?`;
      }
      return db.prepare(sql).all(ftsQuery, limit);
    } catch (e) {
      console.log('Quran FTS5 query failed, using LIKE fallback:', e.message);
    }
  }

  return quranSearchSimple(q, lang, limit);
}

function quranSearchSimple(q, lang, limit) {
  let sql, params;
  if (lang === 'ar') {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ar_simple LIKE ? OR text_ar LIKE ? LIMIT ?`;
    params = ['%' + q + '%', '%' + q + '%', limit];
  } else if (lang === 'ug') {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ug LIKE ? LIMIT ?`;
    params = ['%' + q + '%', limit];
  } else {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ar_simple LIKE ? OR text_ar LIKE ? OR text_ug LIKE ? LIMIT ?`;
    params = ['%' + q + '%', '%' + q + '%', '%' + q + '%', limit];
  }
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({ ...r, snip_ar: '', snip_ug: '' }));
}
```

#### Notes (documents) functions

```javascript
function notesGetAll() {
  return db.prepare(`
    SELECT id, title, created_at, updated_at, length(content_text) AS size
    FROM note_documents ORDER BY updated_at DESC
  `).all();
}

function notesGet(id) {
  return db.prepare(`
    SELECT id, title, content_html, content_text, created_at, updated_at
    FROM note_documents WHERE id=?
  `).get(id) || null;
}

function notesCreate(title) {
  const info = db.prepare('INSERT INTO note_documents (title) VALUES (?)').run(title || 'يېڭى خاتىرە');
  return info.lastInsertRowid;
}

function notesUpdate(id, title, contentHtml, contentText) {
  db.prepare(`
    UPDATE note_documents
    SET title=?, content_html=?, content_text=?, updated_at=datetime('now')
    WHERE id=?
  `).run(title || 'يېڭى خاتىرە', contentHtml || '', contentText || '', id);
}

function notesDelete(id) {
  db.prepare('DELETE FROM note_documents WHERE id=?').run(id);
}
```

#### Categories

```javascript
function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
}

function getCategoryNames() {
  return db.prepare('SELECT name FROM categories ORDER BY sort_order, id').all().map(r => r.name);
}

function addCategory(name, parentId) {
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get();
  const order = (max ? max.m : 0) + 1;
  db.prepare('INSERT OR IGNORE INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)')
    .run(name, parentId || null, order);
}

function renameCategory(oldName, newName) {
  const tx = db.transaction(() => {
    db.prepare('UPDATE categories SET name=? WHERE name=?').run(newName, oldName);
    db.prepare('UPDATE books SET category=? WHERE category=?').run(newName, oldName);
  });
  tx();
}

function deleteCategory(name) {
  db.prepare('DELETE FROM categories WHERE name=?').run(name);
}

function ensureDefaultCategories(defaultCats) {
  const existing = new Set(getCategoryNames());
  const stmt = db.prepare('INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)');
  defaultCats.forEach((cat, i) => {
    if (!existing.has(cat)) stmt.run(cat, i);
  });
}
```

#### Bookmarks / Notes (book annotations)

```javascript
function getBookmarks(bookId) {
  return db.prepare('SELECT * FROM bookmarks WHERE book_id=? ORDER BY position').all(bookId);
}

function addBookmark(bookId, name, position) {
  const info = db.prepare('INSERT INTO bookmarks (book_id, name, position) VALUES (?, ?, ?)')
    .run(bookId, name, position);
  return info.lastInsertRowid;
}

function deleteBookmark(id) {
  db.prepare('DELETE FROM bookmarks WHERE id=?').run(id);
}

function getNotes(bookId) {
  return db.prepare('SELECT * FROM notes WHERE book_id=? ORDER BY created_at DESC').all(bookId);
}

function addNoteDB(bookId, text, position) {
  const info = db.prepare('INSERT INTO notes (book_id, text, position) VALUES (?, ?, ?)')
    .run(bookId, text, position);
  return info.lastInsertRowid;
}

function deleteNoteDB(id) {
  db.prepare('DELETE FROM notes WHERE id=?').run(id);
}
```

#### Reading progress / recent / settings

```javascript
function getReadingProgress(bookId) {
  const row = db.prepare('SELECT * FROM reading_progress WHERE book_id=?').get(bookId);
  return row || { position: 0, page: 1 };
}

function saveReadingProgress(bookId, position, page) {
  db.prepare(`
    INSERT OR REPLACE INTO reading_progress (book_id, position, page, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(bookId, position, page || 1);
}

function addRecentRead(bookId) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM recent_reads WHERE book_id=?').run(bookId);
    db.prepare('INSERT INTO recent_reads (book_id) VALUES (?)').run(bookId);
    db.prepare(`
      DELETE FROM recent_reads
      WHERE id NOT IN (SELECT id FROM recent_reads ORDER BY read_at DESC LIMIT 20)
    `).run();
  });
  tx();
}

function getRecentReads() {
  return db.prepare(`
    SELECT r.*, b.title, b.author, b.category, b.format
    FROM recent_reads r JOIN books b ON b.id = r.book_id
    ORDER BY r.read_at DESC LIMIT 20
  `).all();
}

function getSetting(key, defaultValue) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return defaultValue;
  try { return JSON.parse(row.value); }
  catch (e) { return row.value; }
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, JSON.stringify(value));
}

function addSearchHistory(query, resultCount) {
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO search_history (query, result_count) VALUES (?, ?)')
      .run(query, resultCount);
    db.prepare(`
      DELETE FROM search_history
      WHERE id NOT IN (SELECT id FROM search_history ORDER BY searched_at DESC LIMIT 50)
    `).run();
  });
  tx();
}

function getSearchHistory(limit) {
  return db.prepare('SELECT * FROM search_history ORDER BY searched_at DESC LIMIT ?').all(limit || 20);
}
```

#### Stats

```javascript
function getStats() {
  const total = db.prepare('SELECT COUNT(*) AS c FROM books').get();
  const catCounts = db.prepare(`
    SELECT category, COUNT(*) AS cnt FROM books GROUP BY category ORDER BY cnt DESC
  `).all();
  const formatCounts = db.prepare(`
    SELECT format, COUNT(*) AS cnt FROM books GROUP BY format ORDER BY cnt DESC
  `).all();
  return {
    total: total ? total.c : 0,
    catBars: catCounts.map(r => ({ name: r.category, count: r.cnt })),
    formatBars: formatCounts.map(r => ({ format: r.format, count: r.cnt }))
  };
}
```

#### N-gram functions (now no-ops, but ngramFindWord uses FTS5)

Keep the no-op versions from PROMPT_03. The `ngramFindWord` function from PROMPT_03 uses `db.exec(sql, params)` (sql.js syntax). **Update** `ngramFindWord` to use better-sqlite3:

```javascript
function ngramFindWord(word) {
  word = String(word || '').trim();
  if (word.length < 2) return [];

  const results = [];
  const seenIds = new Set();

  if (hasFTS5) {
    try {
      const rows = db.prepare(
        'SELECT DISTINCT rowid AS id FROM book_fts WHERE book_fts MATCH ? LIMIT 100'
      ).all(word + '*');
      for (const row of rows) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          results.push({ bookId: row.id, positions: [] });
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (!results.length) {
    try {
      const rows = db.prepare(
        'SELECT DISTINCT book_id FROM book_content WHERE content LIKE ? LIMIT 100'
      ).all('%' + word + '%');
      for (const row of rows) {
        if (!seenIds.has(row.book_id)) {
          seenIds.add(row.book_id);
          results.push({ bookId: row.book_id, positions: [] });
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (hasQuranFTS) {
    try {
      const row = db.prepare('SELECT 1 AS x FROM quran_fts WHERE quran_fts MATCH ? LIMIT 1')
        .get(word + '*');
      if (row) {
        results.push({ bookId: QURAN_BOOK_ID_UG, positions: [] });
        results.push({ bookId: QURAN_BOOK_ID_AR, positions: [] });
      }
    } catch (e) { /* ignore */ }
  } else {
    try {
      const row = db.prepare(
        'SELECT 1 AS x FROM quran_ayas WHERE text_ug LIKE ? OR text_ar_simple LIKE ? LIMIT 1'
      ).get('%' + word + '%', '%' + word + '%');
      if (row) {
        results.push({ bookId: QURAN_BOOK_ID_UG, positions: [] });
        results.push({ bookId: QURAN_BOOK_ID_AR, positions: [] });
      }
    } catch (e) { /* ignore */ }
  }

  return results;
}
```

#### quranContentSnippet (update to better-sqlite3)

```javascript
function quranContentSnippet(needle, maxResults, ctx) {
  const MAX = Math.max(1, Math.min(50, maxResults || 5));
  const CTX = Math.max(10, Math.min(400, ctx || 90));
  const cleanNeedle = String(needle || '').trim();
  if (!cleanNeedle) return [];

  if (hasQuranFTS) {
    try {
      const tokens = cleanNeedle.split(/\s+/).filter(t => t.length >= 2);
      if (!tokens.length) return [];
      const ftsQuery = tokens.length > 1
        ? '"' + tokens.join(' ') + '"'
        : tokens[0] + '*';

      const rows = db.prepare(`
        SELECT a.sura, a.aya, a.text_ug, a.text_ar_simple,
               snippet(quran_fts, 0, '§MARK_OPEN§', '§MARK_CLOSE§', '...', 12) AS snip_ar,
               snippet(quran_fts, 1, '§MARK_OPEN§', '§MARK_CLOSE§', '...', 12) AS snip_ug
        FROM quran_fts
        JOIN quran_ayas a ON a.id = quran_fts.rowid
        WHERE quran_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, MAX);

      const out = [];
      for (const row of rows) {
        if (row.snip_ug && row.snip_ug.indexOf('§MARK_OPEN§') !== -1) {
          out.push({
            snip: String(row.snip_ug).replace(/\s+/g, ' ').trim(),
            pos: 0, sura: row.sura, aya: row.aya, lang: 'ug'
          });
        } else if (row.snip_ar && row.snip_ar.indexOf('§MARK_OPEN§') !== -1) {
          out.push({
            snip: String(row.snip_ar).replace(/\s+/g, ' ').trim(),
            pos: 0, sura: row.sura, aya: row.aya, lang: 'ar'
          });
        }
      }
      if (out.length) return out;
    } catch (e) { /* fall through */ }
  }

  // Fallback substring scan
  const lcNeedle = cleanNeedle.toLowerCase();
  const snippets = [];

  function scanColumn(col, langTag) {
    if (snippets.length >= MAX) return;
    const rows = db.prepare(`SELECT sura, aya, ${col} AS txt FROM quran_ayas ORDER BY sura, aya`).all();
    for (const row of rows) {
      if (snippets.length >= MAX) break;
      const text = row.txt || '';
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
        pos: hit, sura: row.sura, aya: row.aya, lang: langTag
      });
    }
  }

  scanColumn('text_ug', 'ug');
  scanColumn('text_ar_simple', 'ar');
  return snippets;
}
```

#### upsertBook / syncBooks / syncCategories / syncBookmarks / syncNotes / syncReadingProgress / syncRecent

```javascript
function upsertBook(id, title, author, category, format, date, description) {
  const existing = getBook(id);
  if (existing) {
    db.prepare(`
      UPDATE books SET title=?, author=?, category=?, format=?, date=?, description=?, updated_at=datetime('now')
      WHERE id=?
    `).run(title, author || '', category || '', format || 'TXT', date || '', description || '', id);
  } else {
    db.prepare(`
      INSERT INTO books (id, title, author, category, format, date, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, author || '', category || '', format || 'TXT', date || '', description || '');
  }
  if (hasFTS5) {
    try {
      db.prepare('DELETE FROM book_fts WHERE rowid=?').run(id);
      const content = getBookContent(id);
      if (content) {
        db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
          .run(id, title, author || '', content);
      }
    } catch (e) { /* ignore */ }
  }
}

function syncBooks(books) {
  if (!Array.isArray(books)) return;
  const tx = db.transaction(() => {
    const existing = getAllBooks();
    const incomingIds = new Set(books.map(b => b.id));
    for (const eb of existing) {
      if (!incomingIds.has(eb.id)) deleteBook(eb.id);
    }
    for (const b of books) {
      upsertBook(b.id, b.title, b.author, b.category, b.format, b.date, b.desc || b.description || '');
    }
  });
  tx();
}

function syncCategories(catNames) {
  if (!Array.isArray(catNames)) return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM categories').run();
    const stmt = db.prepare('INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)');
    catNames.forEach((name, i) => stmt.run(name, i));
  });
  tx();
}

function syncBookmarks(bookmarksObj) {
  if (!bookmarksObj || typeof bookmarksObj !== 'object') return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bookmarks').run();
    const stmt = db.prepare('INSERT INTO bookmarks (book_id, name, position, created_at) VALUES (?, ?, ?, ?)');
    for (const bookIdStr of Object.keys(bookmarksObj)) {
      const bookId = parseInt(bookIdStr);
      for (const bm of (bookmarksObj[bookIdStr] || [])) {
        stmt.run(bookId, bm.name || '', bm.pos || 0, bm.date || new Date().toISOString());
      }
    }
  });
  tx();
}

function syncNotes(notesObj) {
  if (!notesObj || typeof notesObj !== 'object') return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM notes').run();
    const stmt = db.prepare('INSERT INTO notes (book_id, text, position, created_at) VALUES (?, ?, ?, ?)');
    for (const bookIdStr of Object.keys(notesObj)) {
      const bookId = parseInt(bookIdStr);
      for (const note of (notesObj[bookIdStr] || [])) {
        stmt.run(bookId, note.text || '', note.pos || 0, note.date || new Date().toISOString());
      }
    }
  });
  tx();
}

function syncReadingProgress(readPos) {
  if (!readPos || typeof readPos !== 'object') return;
  const tx = db.transaction(() => {
    for (const bookIdStr of Object.keys(readPos)) {
      saveReadingProgress(parseInt(bookIdStr), readPos[bookIdStr], 1);
    }
  });
  tx();
}

function syncRecent(recent) {
  if (!Array.isArray(recent)) return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM recent_reads').run();
    const stmt = db.prepare('INSERT INTO recent_reads (book_id, read_at) VALUES (?, ?)');
    for (const r of recent) {
      stmt.run(r.id, r.time || new Date().toISOString());
    }
  });
  tx();
}

function getAllBookmarksGrouped() {
  const rows = db.prepare('SELECT * FROM bookmarks ORDER BY position').all();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.book_id]) grouped[row.book_id] = [];
    grouped[row.book_id].push({
      id: String(row.id), name: row.name || '',
      pos: row.position || 0, date: row.created_at || new Date().toISOString()
    });
  }
  return grouped;
}

function getAllNotesGrouped() {
  const rows = db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.book_id]) grouped[row.book_id] = [];
    grouped[row.book_id].push({
      id: String(row.id), text: row.text || '',
      pos: row.position || 0, date: row.created_at || new Date().toISOString()
    });
  }
  return grouped;
}

function getAllReadingProgress() {
  const rows = db.prepare('SELECT * FROM reading_progress').all();
  const out = {};
  for (const row of rows) out[row.book_id] = row.position || 0;
  return out;
}

function getRecentForFrontend() {
  return db.prepare(`
    SELECT r.book_id, r.read_at FROM recent_reads r
    JOIN books b ON b.id = r.book_id
    ORDER BY r.read_at DESC LIMIT 20
  `).all().map(r => ({ id: r.book_id, time: r.read_at || new Date().toISOString() }));
}

function getMaxBookId() {
  const row = db.prepare('SELECT MAX(id) AS m FROM books').get();
  return row && row.m !== null ? row.m : 0;
}
```

#### migrateFromJSON (use better-sqlite3 transaction)

```javascript
function migrateFromJSON(jsonData, contentDir) {
  if (!jsonData || !jsonData.books || jsonData.books.length === 0) return false;
  const existing = db.prepare('SELECT COUNT(*) AS c FROM books').get();
  if (existing.c > 0) return false;

  console.log('Migrating', jsonData.books.length, 'books from JSON to SQLite...');

  const tx = db.transaction(() => {
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)');
    (jsonData.cats || []).forEach((cat, i) => insertCat.run(cat, i));

    const insertBook = db.prepare(`
      INSERT INTO books (id, title, author, category, format, date, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertContent = db.prepare('INSERT OR REPLACE INTO book_content (book_id, content) VALUES (?, ?)');
    const insertFts = hasFTS5
      ? db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
      : null;

    for (const book of jsonData.books) {
      insertBook.run(
        book.id, book.title, book.author || '', book.category || '',
        book.format || 'TXT', book.date || '', book.desc || ''
      );
      if (contentDir) {
        const cp = path.join(contentDir, `${book.id}.txt`);
        if (fs.existsSync(cp)) {
          try {
            const content = fs.readFileSync(cp, 'utf-8');
            insertContent.run(book.id, content);
            if (insertFts) {
              try { insertFts.run(book.id, book.title, book.author || '', content); } catch (e) {}
            }
          } catch (e) {}
        }
      }
    }

    if (jsonData.theme) setSetting('theme', jsonData.theme);
    if (jsonData.darkMode !== undefined) setSetting('darkMode', jsonData.darkMode);

    if (jsonData.readPos) {
      const stmt = db.prepare('INSERT OR REPLACE INTO reading_progress (book_id, position) VALUES (?, ?)');
      for (const k of Object.keys(jsonData.readPos)) stmt.run(parseInt(k), jsonData.readPos[k]);
    }

    if (jsonData.bookmarks) {
      const stmt = db.prepare('INSERT INTO bookmarks (book_id, name, position) VALUES (?, ?, ?)');
      for (const k of Object.keys(jsonData.bookmarks)) {
        for (const bm of (jsonData.bookmarks[k] || [])) {
          stmt.run(parseInt(k), bm.name || '', bm.pos || 0);
        }
      }
    }

    if (jsonData.notes) {
      const stmt = db.prepare('INSERT INTO notes (book_id, text, position, created_at) VALUES (?, ?, ?, ?)');
      for (const k of Object.keys(jsonData.notes)) {
        for (const note of (jsonData.notes[k] || [])) {
          stmt.run(parseInt(k), note.text || '', note.pos || 0, note.date || new Date().toISOString());
        }
      }
    }

    if (jsonData.recent) {
      const stmt = db.prepare('INSERT INTO recent_reads (book_id, read_at) VALUES (?, ?)');
      for (const r of jsonData.recent.slice().reverse()) {
        stmt.run(r.id, r.time || new Date().toISOString());
      }
    }

    if (jsonData.nid) {
      try {
        db.prepare(`UPDATE sqlite_sequence SET seq=? WHERE name='books'`).run(jsonData.nid);
      } catch (e) {}
    }
  });

  tx();
  console.log('Migration complete!');
  return true;
}
```

### Step 10 — Verify nothing in `database.js` still uses `db.exec(sql, params)` style

```bash
grep -n "db\.exec\(" database.js
```

Each match should be one of:
- `db.exec(sql_only_no_params)` — multi-statement DDL like `CREATE TABLE`
- No match at all (we converted everything to `.prepare().run/all/get`)

If any matches like `db.exec('SELECT ...', [...])` or `db.exec(sql, params)` exist, those are bugs.

```bash
grep -n "result\[0\]\.values\|result\[0\]\.columns\|stmt\.free\|db\.run.*\[" database.js
```

Each match must be **only inside comments** or inside the `getAllSnippetsForBook` function (which uses pure JS string operations — no DB calls).

### Step 11 — Update main.js to remove unnecessary saveDB calls

In `main.js`, find the auto-save interval near the bottom:

```javascript
// Auto-save database periodically (every 30 seconds)
setInterval(() => {
  if (dbReady) {
    try { database.saveDB(DATA_DIR); } catch(e) {}
  }
}, 30000);
```

**Remove** this entire setInterval. It's no longer needed.

In the `window-all-closed` handler, you can also remove the saveDB call:

```javascript
app.on('window-all-closed', () => {
  // saveDB is now a no-op (better-sqlite3 writes immediately)
  if (process.platform !== 'darwin') app.quit();
});
```

### Step 12 — Test

```bash
npm start
```

The app must launch and:
1. Show the library
2. Open a book — content reads
3. Open Quran — sura list and ayas display
4. Search for a word — fast results
5. Open Notes — editor works, type some text, references update

If you see "Cannot find module 'better-sqlite3'" — the rebuild failed. Run:

```bash
npx electron-rebuild -f -w better-sqlite3
```

Then try again.

If you see "The module was compiled against a different Node.js version" — same fix.

### Step 13 — Compare DB file sizes (optional sanity check)

```bash
node -e "const fs=require('fs'),path=require('path'),os=require('os');const dbPath=path.join(os.homedir(),'JamiyKutupxana','library.db');console.log('DB:',fs.existsSync(dbPath)?fs.statSync(dbPath).size:'no DB');const wal=dbPath+'-wal';console.log('WAL:',fs.existsSync(wal)?fs.statSync(wal).size:'no WAL');"
```

You'll see a `library.db` file plus a `library.db-wal` file (the WAL log). This is normal.

### Step 14 — Commit

```bash
git add -A
git status
git commit -m "perf(database): migrate from sql.js to better-sqlite3 (100x faster)"
```

### Step 15 — Final report

- ✅ better-sqlite3 installed and rebuilt for Electron
- ✅ database.js fully converted to better-sqlite3 API
- ✅ saveDB() is now a no-op
- ✅ Auto-save interval removed
- ✅ App launches, all 3 tabs work (Library, Quran, Notes)
- ✅ Git commit hash: [show the hash]

Then say: **"Database migration complete. Safe to proceed to PROMPT_05."**

If anything failed, copy-paste the exact error and tell me where in the steps you stopped.
