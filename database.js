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
 * Normalize Arabic text for search: strip diacritics, unify alif variants,
 * unify hamza, normalize ya/alif maqsura, ta marbuta. Mirrors the same
 * normalization that stripTashkil() in scripts/seed-quran.js applies to
 * the indexed text_ar_simple column.
 */
function normalizeArabicQuery(text) {
  if (!text) return '';
  return String(text)
    // Remove all Arabic diacritics, marks, and tatweel
    .replace(/[ً-ٰٟۖ-ۭ࣓-ࣿـ]/g, '')
    // Alif variants → plain alif
    .replace(/[ٱآأإ]/g, 'ا')
    // Alif maqsura → ya (helpful for cross-region spellings)
    // Note: keep this CONSISTENT with seed normalization. Currently seed
    // does NOT do this, so we shouldn't either. Comment kept for reference.
    // .replace(/ى/g, 'ي')
    // Ta marbuta → ha is debatable. Saleh translation has both. Skip.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect whether a query is Arabic-script. Used to decide whether to
 * apply Arabic normalization. Uyghur uses Arabic script too, but with
 * additional letters; we detect those to differentiate.
 */
function isArabicScript(text) {
  if (!text) return false;
  // Has any Arabic-script char
  if (!/[؀-ۿ]/.test(text)) return false;
  // If it has Uyghur-specific chars, treat as Uyghur (not pure Arabic)
  // ې=06D0 ە=06D5 ۆ=06C6 ۇ=06C7 ۈ=06C8 ۋ=06CB ڭ=06AD گ=06AF پ=067E چ=0686 ك=06A9 ھ=06BE
  if (/[ېەۆۇۈۋڭگپچکھ]/.test(text)) {
    return false;
  }
  return true;
}

// Virtual book IDs for Quran (used by the Notes auto-reference scanner).
const QURAN_BOOK_ID_UG = -1;
const QURAN_BOOK_ID_AR = -2;

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

/**
 * No-op kept for backward compatibility.
 * better-sqlite3 with WAL writes immediately; no manual flush needed.
 */
function saveDB(dataDir) {
  // Intentionally empty
  return;
}

function vacuum() {
  if (!db) return;
  try {
    db.exec('VACUUM');
  } catch (e) {
    console.warn('[vacuum] failed:', e.message);
  }
}

function close() {
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.warn('[close] failed:', e.message);
    }
    db = null;
  }
}

// ========== BOOKS ==========

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

// ========== BOOK CONTENT (LRU-cached) ==========

const contentCache = new Map();
const CACHE_MAX = 20;

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

// ========== SEARCH ==========

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
    const lcQuery = query.toLowerCase();
    for (const row of rows) {
      const book = { ...row };
      book.desc = book.description || '';
      // First-occurrence char offset, used by the reader to scroll directly
      // to the match on click. Cached content reads make this cheap.
      let pos = -1;
      try {
        const content = getBookContent(book.id);
        if (content) pos = content.toLowerCase().indexOf(lcQuery);
      } catch(e) {}
      results.push({
        book,
        snip: book.snippet || '',
        pos: pos >= 0 ? pos : null,
        inT: (book.title || '').toLowerCase().includes(lcQuery),
        inA: (book.author || '').toLowerCase().includes(lcQuery),
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
    let pos = null;
    const content = getBookContent(book.id);
    if (content) {
      const lcContent = content.toLowerCase();
      const idx = lcContent.indexOf(lq);
      if (idx !== -1) {
        inC = true;
        pos = idx;
        const s = Math.max(0, idx - 60);
        const e = Math.min(content.length, idx + query.length + 60);
        snip = content.slice(s, e).replace(/\n/g, ' ');
      }
    }

    if (inT || inA || inC) {
      results.push({ book, snip, pos, inT, inA, inC });
    }
  }
  return results;
}

/**
 * Pure JS string-scan: returns marked snippets for every occurrence of `query`
 * in the book content. Used by the Notes auto-reference scanner.
 */
function getAllSnippetsForBook(bookId, query, maxResults, ctx) {
  const MAX = Math.max(1, Math.min(1000, maxResults || 200));
  const CTX = Math.max(10, Math.min(400, ctx || 70));

  const content = getBookContent(bookId);
  if (!content || !query) return [];

  // Strip FTS5 operators so we have a clean needle for substring search.
  // User types: مىسۋاك  →  FTS5 sends: مىسۋاك*  →  here we want: مىسۋاك
  // Also tolerate quoted phrases: "مىسۋاكلارنى"  →  مىسۋاكلارنى
  let needle = String(query).trim().replace(/^"(.*)"$/, '$1').replace(/\*/g, '').trim();
  if (!needle) return [];

  const lcNeedle  = needle.toLowerCase();
  const lcContent = content.toLowerCase();
  const nLen = needle.length;

  const snippets = [];
  let cursor = 0;
  while (snippets.length < MAX) {
    const hit = lcContent.indexOf(lcNeedle, cursor);
    if (hit === -1) break;

    // Expand context outward to the nearest whitespace/newline for a clean cut.
    let start = Math.max(0, hit - CTX);
    let end   = Math.min(content.length, hit + nLen + CTX);
    while (start > 0 && !/\s/.test(content[start - 1]) && hit - start < CTX + 20) start--;
    while (end < content.length && !/\s/.test(content[end]) && end - (hit + nLen) < CTX + 20) end++;

    const before = content.slice(start, hit);
    const match  = content.slice(hit, hit + nLen);
    const after  = content.slice(hit + nLen, end);

    let snip = (before + '§MARK_OPEN§' + match + '§MARK_CLOSE§' + after)
      .replace(/\s+/g, ' ')
      .trim();
    if (start > 0) snip = '...' + snip;
    if (end < content.length) snip = snip + '...';

    snippets.push({ snip, pos: hit });
    cursor = hit + nLen;
  }

  return snippets;
}

// ========== QURAN ==========

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

/**
 * One-shot migration: strips the duplicated basmala prefix from ayah 1 of
 * every Sura except Al-Fatiha. Idempotent — safe to run on already-fixed DBs
 * (the prefix detector simply won't match anything).
 *
 * Returns the number of rows actually modified.
 */
function migrationStripBasmalaAyah1() {
  if (!db) return 0;
  // Lazy require to avoid circulars at module load time.
  const { stripBasmalaPrefix, stripTashkil: stripTashkilSeed } = require('./scripts/seed-quran');

  const rows = db.prepare(
    `SELECT id, sura, aya, text_ar FROM quran_ayas WHERE aya = 1 AND sura != 1`
  ).all();
  if (!rows.length) return 0;

  const update = db.prepare(
    `UPDATE quran_ayas SET text_ar = ?, text_ar_simple = ? WHERE id = ?`
  );
  let fixed = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const newAr = stripBasmalaPrefix(r.text_ar);
      if (newAr && newAr !== r.text_ar) {
        update.run(newAr, stripTashkilSeed(newAr), r.id);
        fixed++;
      }
    }
  });
  tx();

  // Refresh the FTS index — the existing triggers cover INSERT/DELETE only,
  // not UPDATE, so we rebuild from the (now-corrected) content table.
  if (fixed > 0 && hasQuranFTS) {
    try {
      db.exec(`INSERT INTO quran_fts(quran_fts) VALUES('rebuild')`);
    } catch (e) {
      console.warn('[migration] quran_fts rebuild failed:', e.message);
    }
  }
  console.log(`[migration] basmala-ayah1: cleaned ${fixed}/${rows.length} rows`);
  return fixed;
}

/**
 * Resolve a sura by name (Arabic or Uyghur) or by number.
 * Returns the matching sura row or null. Matching strategies, in order:
 *   1. Numeric input (1-114)
 *   2. Exact match (after Arabic normalization for AR / lowercase for UG)
 *   3. Unique startsWith match
 *   4. Unique substring match
 */
function quranLookupSura(input) {
  if (!db || !input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const asNum = parseInt(raw, 10);
  if (Number.isFinite(asNum) && String(asNum) === raw && asNum >= 1 && asNum <= 114) {
    return db.prepare(
      `SELECT number, name_ar, name_ug, name_translit, revelation, aya_count
       FROM quran_suras WHERE number = ?`
    ).get(asNum) || null;
  }

  const isAr = isArabicScript(raw);
  const needle = isAr ? normalizeArabicQuery(raw) : raw.toLowerCase();
  if (!needle) return null;

  const allSuras = db.prepare(
    `SELECT number, name_ar, name_ug, name_translit, revelation, aya_count
     FROM quran_suras`
  ).all();

  const norm = (s) => isAr
    ? normalizeArabicQuery(s || '')
    : String(s || '').toLowerCase();

  // Exact
  for (const s of allSuras) {
    const candidate = isAr ? s.name_ar : s.name_ug;
    if (norm(candidate) === needle) return s;
  }

  // StartsWith — only return if unique
  const prefixHits = allSuras.filter(s => {
    const candidate = isAr ? s.name_ar : s.name_ug;
    return norm(candidate).startsWith(needle);
  });
  if (prefixHits.length === 1) return prefixHits[0];

  // Substring — only return if unique
  const substrHits = allSuras.filter(s => {
    const candidate = isAr ? s.name_ar : s.name_ug;
    return norm(candidate).includes(needle);
  });
  if (substrHits.length === 1) return substrHits[0];

  return null;
}

function quranSearch(query, opts) {
  opts = opts || {};
  const lang = opts.lang || 'auto';
  const limit = Math.max(1, Math.min(500, opts.limit || 200));
  if (!query || !String(query).trim()) return [];
  const q = String(query).trim();

  // Normalize Arabic queries to match the seeded text_ar_simple normalization
  const isAr = isArabicScript(q);
  const qForArabicCols = isAr ? normalizeArabicQuery(q) : q;
  const qForUyghurCol = q; // Uyghur is not normalized at seed time

  if (hasQuranFTS) {
    try {
      // Use Arabic-normalized query for Arabic search; raw query for Uyghur
      const qToTokenize = (lang === 'ar' || (lang === 'auto' && isAr)) ? qForArabicCols : qForUyghurCol;
      const tokens = qToTokenize.split(/\s+/).map(w => w.replace(/["'*:]/g, '')).filter(Boolean);
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
  const isAr = isArabicScript(q);
  const qAr = isAr ? normalizeArabicQuery(q) : q;
  const qUg = q;

  let sql, params;
  if (lang === 'ar') {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ar_simple LIKE ? OR text_ar LIKE ? LIMIT ?`;
    params = ['%' + qAr + '%', '%' + qAr + '%', limit];
  } else if (lang === 'ug') {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ug LIKE ? LIMIT ?`;
    params = ['%' + qUg + '%', limit];
  } else {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ar_simple LIKE ? OR text_ar LIKE ? OR text_ug LIKE ? LIMIT ?`;
    params = ['%' + qAr + '%', '%' + qAr + '%', '%' + qUg + '%', limit];
  }
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({ ...r, snip_ar: '', snip_ug: '' }));
}

// ========== NOTES (DOCUMENTS) ==========

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

// ========== N-GRAM (legacy: now FTS5-backed; index funcs are no-ops) ==========

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

function quranContentSnippet(needle, maxResults, ctx) {
  const MAX = Math.max(1, Math.min(50, maxResults || 5));
  const CTX = Math.max(10, Math.min(400, ctx || 90));
  const cleanNeedle = String(needle || '').trim();
  if (!cleanNeedle) return [];

  if (hasQuranFTS) {
    try {
      // Apply Arabic normalization for queries searching the Arabic FTS column
      const isAr = isArabicScript(cleanNeedle);
      const ftsNeedle = isAr ? normalizeArabicQuery(cleanNeedle) : cleanNeedle;
      const tokens = ftsNeedle.split(/\s+/).filter(t => t.length >= 2);
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
  // For Arabic columns: also try the normalized form so "إيمان" matches "ايمان"
  const lcNeedle = cleanNeedle.toLowerCase();
  const lcArNeedle = isArabicScript(cleanNeedle)
    ? normalizeArabicQuery(cleanNeedle).toLowerCase()
    : lcNeedle;
  const snippets = [];

  function scanColumn(col, langTag) {
    if (snippets.length >= MAX) return;
    const rows = db.prepare(`SELECT sura, aya, ${col} AS txt FROM quran_ayas ORDER BY sura, aya`).all();
    for (const row of rows) {
      if (snippets.length >= MAX) break;
      const text = row.txt || '';
      if (!text) continue;
      const lcText = text.toLowerCase();
      // Use Arabic-normalized needle for Arabic columns
      const needle = (langTag === 'ar') ? lcArNeedle : lcNeedle;
      const hit = lcText.indexOf(needle);
      if (hit === -1) continue;

      const start = Math.max(0, hit - CTX);
      const end = Math.min(text.length, hit + needle.length + CTX);
      const before = text.slice(start, hit);
      const match = text.slice(hit, hit + needle.length);
      const after = text.slice(hit + needle.length, end);

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

// ========== CATEGORIES ==========

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

// ========== BOOKMARKS / NOTES (book annotations) ==========

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

// ========== READING PROGRESS / RECENT / SETTINGS ==========

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

// ========== STATS ==========

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

// ========== JSON MIGRATION (one-time, from legacy library.json) ==========

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

// ========== UPSERT / SYNC (frontend compatibility) ==========

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

module.exports = {
  initDB, saveDB, vacuum, close,
  normalizeArabicQuery, isArabicScript,
  addBook, addBooksBatch, updateBook, deleteBook, getBook, getAllBooks, getBooksByCategory,
  getBookContent, saveBookContent, checkDuplicateHash,
  searchBooks, getAllSnippetsForBook,
  getCategories, getCategoryNames, addCategory, renameCategory, deleteCategory, ensureDefaultCategories,
  getBookmarks, addBookmark, deleteBookmark,
  getNotes, addNoteDB, deleteNoteDB,
  getReadingProgress, saveReadingProgress,
  addRecentRead, getRecentReads,
  getSetting, setSetting,
  addSearchHistory, getSearchHistory,
  getStats, migrateFromJSON,
  // Sync functions for frontend compatibility
  upsertBook, syncBooks, syncCategories, syncBookmarks, syncNotes,
  syncReadingProgress, syncRecent,
  getAllBookmarksGrouped, getAllNotesGrouped, getAllReadingProgress,
  getRecentForFrontend, getMaxBookId,
  // Quran
  quranSuraExists, quranSeedBulk, quranGetSuras, quranGetAyas, quranGetAya, quranSearch, quranLookupSura,
  migrationStripBasmalaAyah1,
  // Notes (documents)
  notesGetAll, notesGet, notesCreate, notesUpdate, notesDelete,
  // Ngram
  hasNgramIndex, ngramIndexBook, ngramRemoveBook, ngramFindWord,
  // Quran ngram (virtual books)
  ngramIndexQuran, quranContentSnippet, QURAN_BOOK_ID_UG, QURAN_BOOK_ID_AR
};
