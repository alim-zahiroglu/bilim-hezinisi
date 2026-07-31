const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const database = require('./database');
const ai = require('./ai');
const { cleanOcrPage } = require('./ocr-postprocess');
const { seedQuran } = require('./scripts/seed-quran');
const windowStateKeeper = require('electron-window-state');

/**
 * Coarse server-side HTML sanitizer. The renderer already runs DOMPurify;
 * this is a second line of defense against direct DB tampering.
 */
function coarseSanitizeHtml(html) {
  if (!html) return '';
  return String(html)
    // Remove <script> ... </script> blocks
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove <iframe>, <object>, <embed>, <link>, <meta>, <style>, <base>, <form>
    .replace(/<\/?(iframe|object|embed|link|meta|style|base|form|input|button|textarea|select)\b[^>]*>/gi, '')
    // Remove inline event handlers: onerror=, onclick=, etc.
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    // Remove javascript: and data: URIs in href/src
    .replace(/(href|src)\s*=\s*["']?\s*javascript:/gi, '$1=""')
    .replace(/(href|src)\s*=\s*["']?\s*data:(?!image\/)/gi, '$1=""');
}

// Data directory - stored in the user's home folder (C:\\Users\\<you>\\JamiyKutupxana).
// Normal runs (npm start) AND any built .exe use this REAL library, so you
// always see your real books. Only `npm run dev` (the --dev flag) switches to a
// separate empty sandbox (JamiyKutupxana-DEV) for testing risky changes safely.
//
// macOS is the exception. The Mac App Store build is sandboxed, which silently
// rewrites os.homedir() to ~/Library/Containers/<bundle-id>/Data — the library
// would still work but land somewhere users cannot find, and it would differ
// between the sandboxed (App Store) and unsandboxed (DMG) builds of the same
// app. app.getPath('userData') resolves to one stable, correct location under
// both. Windows and Linux keep the historical home-folder layout untouched.
const IS_DEV = process.argv.includes('--dev');
const DATA_FOLDER_NAME = IS_DEV ? 'JamiyKutupxana-DEV' : 'JamiyKutupxana';
const DATA_DIR = process.platform === 'darwin'
  ? path.join(app.getPath('appData'), DATA_FOLDER_NAME)
  : path.join(os.homedir(), DATA_FOLDER_NAME);
const DATA_FILE = path.join(DATA_DIR, 'library.json');
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const DB_PATH = path.join(DATA_DIR, 'library.db');

// Ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
}

function defaultCats() {
  return [
    'قۇرئان ۋە تەپسىر', 'ھەدىسلەر', 'فىقھى كىتابلار', 'تەۋھىد ۋە ئەقىدە',
    'تارىخ', 'ئەدەبىي ئەسەرلەر', 'تىل-ئەدەبىيات', 'سىيرەت',
    'ئۇيغۇرچە ئوقۇشلۇق كىتابلار', 'بالىلار كىتابلىرى', 'لازىملىق كىتابلار',
    'مۇھىم ئەسەرلەر', 'باشقا'
  ];
}

// Compute SHA-256 hash of file content
function computeHash(content) {
  if (!content) return '';
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Clean up content files from disk when a book is deleted
function cleanupBookFiles(bookId) {
  try {
    const contentFile = path.join(CONTENT_DIR, `${bookId}.txt`);
    if (fs.existsSync(contentFile)) {
      fs.unlinkSync(contentFile);
      console.log('Cleaned up content file:', contentFile);
    }
  } catch(e) {
    console.error('Failed to clean up file for book', bookId, e);
  }
}

let mainWindow;
let dbReady = false;

async function initDatabase() {
  ensureDirs();
  await database.initDB(DATA_DIR);

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

  // Ensure default categories exist
  database.ensureDefaultCategories(defaultCats());

  // Seed Quran data (no-op if already seeded).
  //
  // Earlier versions stripped inline markers like (1) and [12] out of the
  // Uyghur translation before storing it. QuranEnc.com's terms of use forbid
  // modifying the translation, so the text is now stored verbatim — and
  // existing libraries, which would otherwise never re-seed, are refreshed
  // once so they hold the published text too.
  let forceReseed = false;
  try {
    forceReseed = !database.getSetting('quran_verbatim_translation_v1', false);
  } catch(e) {
    console.warn('[seed-quran] Could not read re-seed flag:', e.message);
  }

  try {
    await seedQuran(__dirname, database, { force: forceReseed });
    if (forceReseed) database.setSetting('quran_verbatim_translation_v1', true);
    database.saveDB(DATA_DIR);
  } catch(e) {
    console.error('[seed-quran] Seed failed:', e.message);
    // App continues even if seed fails; user will see a warning when entering Quran mode
  }

  // One-shot migration: strip duplicated basmala from ayah 1 of suras 2..114
  // (v2.5 users have populated DBs that won't re-seed; this fixes them in-place).
  try {
    const done = database.getSetting('basmala_strip_v1', false);
    if (!done) {
      database.migrationStripBasmalaAyah1();
      database.setSetting('basmala_strip_v1', true);
      database.saveDB(DATA_DIR);
    }
  } catch(e) {
    console.warn('[migration] basmala-ayah1 failed:', e.message);
  }

  // Migrate from JSON if old library.json exists and database is empty
  if (fs.existsSync(DATA_FILE)) {
    try {
      const jsonData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      const migrated = database.migrateFromJSON(jsonData, CONTENT_DIR);
      if (migrated) {
        database.saveDB(DATA_DIR);
        // Rename old JSON file as backup
        const backupPath = DATA_FILE + '.backup';
        fs.renameSync(DATA_FILE, backupPath);
        console.log('JSON data migrated to SQLite. Old file backed up to:', backupPath);
      }
    } catch(e) {
      console.error('Migration error:', e);
    }
  }

  dbReady = true;
}

function createWindow() {
  // Restore previous window position and size
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
    file: 'window-state.json',
    path: DATA_DIR
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 900,
    minHeight: 600,
    title: 'بىلىم خەزىنىسى',
    backgroundColor: '#FFFBF5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false
  });

  // Track resize/move/maximize and persist state
  mainWindowState.manage(mainWindow);

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // In dev/source mode, keep a visible DEV marker in the window title so this
  // development copy can never be confused with the installed app.
  if (IS_DEV) {
    const devTitle = 'بىلىم خەزىنىسى \u2014 DEV';
    mainWindow.on('page-title-updated', (e) => {
      e.preventDefault();
      mainWindow.setTitle(devTitle);
    });
    mainWindow.setTitle(devTitle);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/**
 * macOS routes the standard editing shortcuts (Cmd+C/V/X/A/Z, Cmd+Q, Cmd+W)
 * through the application menu, so a null menu leaves them dead and an app
 * without an Edit menu fails App Store review. Windows keeps no menu bar at
 * all, which is the intended look there.
 */
function applyApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  const appName = app.getName();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: appName,
      submenu: [
        { role: 'about', label: `${appName} ھەققىدە` },
        { type: 'separator' },
        { role: 'hide', label: 'يوشۇرۇش' },
        { role: 'hideOthers', label: 'باشقىلىرىنى يوشۇرۇش' },
        { role: 'unhide', label: 'ھەممىنى كۆرسىتىش' },
        { type: 'separator' },
        { role: 'quit', label: 'چېكىنىش' }
      ]
    },
    {
      label: 'تەھرىرلەش',
      submenu: [
        { role: 'undo', label: 'يېنىۋېلىش' },
        { role: 'redo', label: 'قايتا قىلىش' },
        { type: 'separator' },
        { role: 'cut', label: 'كېسىش' },
        { role: 'copy', label: 'كۆچۈرۈش' },
        { role: 'paste', label: 'چاپلاش' },
        { role: 'selectAll', label: 'ھەممىنى تاللاش' }
      ]
    },
    {
      label: 'كۆرۈنۈش',
      submenu: [
        { role: 'resetZoom', label: 'ئەسلىگە قايتۇرۇش' },
        { role: 'zoomIn', label: 'چوڭايتىش' },
        { role: 'zoomOut', label: 'كىچىكلىتىش' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'پۈتۈن ئېكران' }
      ]
    },
    {
      label: 'كۆزنەك',
      submenu: [
        { role: 'minimize', label: 'كىچىكلىتىش' },
        { role: 'close', label: 'تاقاش' }
      ]
    }
  ]));
}

app.whenReady().then(async () => {
  applyApplicationMenu();
  await initDatabase();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // saveDB is now a no-op (better-sqlite3 writes immediately)
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    if (database && typeof database.close === 'function') {
      database.close();
    }
  } catch (e) {
    console.error('[shutdown] database close failed:', e);
  }
});

// ========== IPC HANDLERS ==========

// Load all books
ipcMain.handle('db-get-books', () => {
  try {
    return { success: true, books: database.getAllBooks() };
  } catch(e) {
    return { success: false, error: e.message, books: [] };
  }
});

// Get books by category
ipcMain.handle('db-get-books-by-category', (event, category) => {
  try {
    return { success: true, books: database.getBooksByCategory(category) };
  } catch(e) {
    return { success: false, error: e.message, books: [] };
  }
});

// Add a book
ipcMain.handle('db-add-book', (event, bookData) => {
  try {
    const { title, author, category, format, date, description, content, fileHash } = bookData;

    // Check for duplicate
    if (fileHash && database.checkDuplicateHash(fileHash)) {
      return { success: false, error: 'duplicate', message: 'بۇ كىتاب مەۋجۇت' };
    }

    const id = database.addBook(title, author, category, format, date, description, content, fileHash);
    if (content) {
      try {
        database.ngramIndexBook(id, content);
      } catch(e) {
        console.error('[ngram] index on add failed for book', id, e);
        // Book is still added; index just won't be available for this one yet
      }
    }
    database.saveDB(DATA_DIR);
    return { success: true, id };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

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

// Update a book
ipcMain.handle('db-update-book', (event, id, bookData) => {
  try {
    database.updateBook(id, bookData.title, bookData.author, bookData.category, bookData.description);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Delete a book
ipcMain.handle('db-delete-book', (event, id) => {
  try {
    database.deleteBook(id);
    try { database.ngramRemoveBook(id); } catch(e) { /* best effort */ }
    cleanupBookFiles(id);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Get book content
ipcMain.handle('db-get-content', (event, bookId) => {
  try {
    const content = database.getBookContent(bookId);
    return { success: true, content };
  } catch(e) {
    return { success: false, error: e.message, content: '' };
  }
});

// Save book content
ipcMain.handle('db-save-content', (event, bookId, content) => {
  try {
    database.saveBookContent(bookId, content);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Search books with FTS5
ipcMain.handle('db-search', (event, query, category) => {
  try {
    const results = database.searchBooks(query, category);
    // Save search history
    database.addSearchHistory(query, results.length);
    database.saveDB(DATA_DIR);
    return { success: true, results };
  } catch(e) {
    return { success: false, error: e.message, results: [] };
  }
});

// Get ALL occurrences of a query inside ONE book (for the "+" expand feature)
ipcMain.handle('db-get-all-snippets', (event, bookId, query) => {
  try {
    const snippets = database.getAllSnippetsForBook(bookId, query, 200, 70);
    return { success: true, snippets };
  } catch(e) {
    return { success: false, error: e.message, snippets: [] };
  }
});

// Get search history
ipcMain.handle('db-search-history', () => {
  try {
    return { success: true, history: database.getSearchHistory(20) };
  } catch(e) {
    return { success: false, history: [] };
  }
});

// Categories
ipcMain.handle('db-get-categories', () => {
  try {
    return { success: true, categories: database.getCategoryNames() };
  } catch(e) {
    return { success: false, categories: defaultCats() };
  }
});

ipcMain.handle('db-add-category', (event, name, parentId) => {
  try {
    database.addCategory(name, parentId);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db-rename-category', (event, oldName, newName) => {
  try {
    database.renameCategory(oldName, newName);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db-delete-category', (event, name) => {
  try {
    database.deleteCategory(name);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Bookmarks
ipcMain.handle('db-get-bookmarks', (event, bookId) => {
  try {
    return { success: true, bookmarks: database.getBookmarks(bookId) };
  } catch(e) {
    return { success: false, bookmarks: [] };
  }
});

ipcMain.handle('db-add-bookmark', (event, bookId, name, position) => {
  try {
    const id = database.addBookmark(bookId, name, position);
    database.saveDB(DATA_DIR);
    return { success: true, id };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db-delete-bookmark', (event, id) => {
  try {
    database.deleteBookmark(id);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Notes
ipcMain.handle('db-get-notes', (event, bookId) => {
  try {
    return { success: true, notes: database.getNotes(bookId) };
  } catch(e) {
    return { success: false, notes: [] };
  }
});

ipcMain.handle('db-add-note', (event, bookId, text, position) => {
  try {
    const id = database.addNoteDB(bookId, text, position);
    database.saveDB(DATA_DIR);
    return { success: true, id };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db-delete-note', (event, id) => {
  try {
    database.deleteNoteDB(id);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Reading progress
ipcMain.handle('db-get-progress', (event, bookId) => {
  try {
    return { success: true, ...database.getReadingProgress(bookId) };
  } catch(e) {
    return { success: false, position: 0, page: 1 };
  }
});

ipcMain.handle('db-save-progress', (event, bookId, position, page) => {
  try {
    database.saveReadingProgress(bookId, position, page);
    return { success: true };
  } catch(e) {
    return { success: false };
  }
});

// Recent reads
ipcMain.handle('db-add-recent', (event, bookId) => {
  try {
    database.addRecentRead(bookId);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false };
  }
});

ipcMain.handle('db-get-recent', () => {
  try {
    return { success: true, recent: database.getRecentReads() };
  } catch(e) {
    return { success: false, recent: [] };
  }
});

// Settings
ipcMain.handle('db-get-setting', (event, key, defaultValue) => {
  try {
    return { success: true, value: database.getSetting(key, defaultValue) };
  } catch(e) {
    return { success: false, value: defaultValue };
  }
});

ipcMain.handle('db-set-setting', (event, key, value) => {
  try {
    database.setSetting(key, value);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false };
  }
});

// Statistics
ipcMain.handle('db-get-stats', () => {
  try {
    return { success: true, ...database.getStats() };
  } catch(e) {
    return { success: false, total: 0, catBars: [], formatBars: [] };
  }
});

// Compute file hash
ipcMain.handle('compute-hash', (event, content) => {
  return computeHash(content);
});

// ========== LEGACY IPC (kept for backward compatibility) ==========

// Load library (returns all data for frontend state)
ipcMain.handle('load-library', () => {
  try {
    const books = database.getAllBooks();
    const cats = database.getCategoryNames();
    const theme = database.getSetting('theme', 'light');
    const nid = database.getMaxBookId() + 1;
    const bookmarks = database.getAllBookmarksGrouped();
    const notes = database.getAllNotesGrouped();
    const readPos = database.getAllReadingProgress();
    const recent = database.getRecentForFrontend();
    return { books, cats, theme, nid, bookmarks, notes, readPos, recent };
  } catch(e) {
    console.error('load-library error:', e);
    return { books: [], cats: defaultCats(), theme: 'light', nid: 1, bookmarks: {}, notes: {}, readPos: {}, recent: [] };
  }
});

// Save library (syncs all frontend state to SQLite)
ipcMain.handle('save-library', (event, data) => {
  try {
    // Save theme
    if (data.theme) database.setSetting('theme', data.theme);

    // Sync books metadata (and clean up disk files for deleted books)
    if (data.books) {
      // Find books that will be deleted during sync
      const existingBooks = database.getAllBooks();
      const incomingIds = new Set(data.books.map(b => b.id));
      for (const eb of existingBooks) {
        if (!incomingIds.has(eb.id)) {
          cleanupBookFiles(eb.id);
        }
      }
      database.syncBooks(data.books);
    }

    // Sync categories
    if (data.cats) database.syncCategories(data.cats);

    // Sync bookmarks
    if (data.bookmarks) database.syncBookmarks(data.bookmarks);

    // Sync notes
    if (data.notes) database.syncNotes(data.notes);

    // Sync reading progress
    if (data.readPos) database.syncReadingProgress(data.readPos);

    // Sync recent reads
    if (data.recent) database.syncRecent(data.recent);

    // Update nid in settings
    if (data.nid) database.setSetting('nid', data.nid);

    database.saveDB(DATA_DIR);
  } catch(e) {
    console.error('save-library error:', e);
  }
  return true;
});

// Save book content (legacy)
ipcMain.handle('save-book-content', (event, id, content) => {
  try {
    database.saveBookContent(id, content);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Load book content (legacy)
ipcMain.handle('load-book-content', (event, id) => {
  try {
    const content = database.getBookContent(id);
    return { success: true, content };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Get content size
ipcMain.handle('get-content-size', () => {
  try {
    ensureDirs();
    let totalBytes = 0;
    // Calculate from SQLite DB file
    if (fs.existsSync(DB_PATH)) {
      totalBytes += fs.statSync(DB_PATH).size;
    }
    // Also check content directory
    if (fs.existsSync(CONTENT_DIR)) {
      const files = fs.readdirSync(CONTENT_DIR);
      files.forEach(f => {
        try { totalBytes += fs.statSync(path.join(CONTENT_DIR, f)).size; } catch(e) {}
      });
    }
    return { success: true, totalBytes };
  } catch(e) {
    return { success: false, totalBytes: 0 };
  }
});

// ========== FILE OPERATIONS ==========

// ===== OFFLINE OCR (UyghurOCR 2.0 models + bundled tesseract.js) =====
// All OCR runs HERE in the main process (Node), so the renderer never touches
// the network or the filesystem for it — it only ships base64 PNGs in and gets
// text back. tesseract.js v5 in Node spawns a worker_threads worker from a real
// file path and loads the WASM core via require('tesseract.js-core/...'); when
// packaged, both modules (and assets/ocr) are asarUnpack'd so those real paths
// resolve. Engine: LSTM-only (OEM 1), PSM Auto, models default 'ukij+uig'.

// Rewrite an app.asar path to its app.asar.unpacked sibling (no-op in dev).
function unpackedPath(p) {
  return String(p).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}
// tessdata directory holding the *.traineddata models (see fetch-ocr-models).
function ocrTessdataDir() {
  return unpackedPath(path.join(__dirname, 'assets', 'ocr', 'tessdata'));
}
// The Node worker script worker_threads must load from a real file.
function ocrWorkerPath() {
  return unpackedPath(require.resolve('tesseract.js/src/worker-script/node/index.js'));
}

// Cancellation is cooperative: ocr-cancel sets this flag; the per-page loop
// checks it between pages and stops, keeping whatever pages already finished.
let ocrCancelRequested = false;

ipcMain.handle('ocr-recognize', async (event, opts) => {
  opts = opts || {};
  const images = Array.isArray(opts.images) ? opts.images : [];
  // Default to the custom UKIJ LSTM model ALONE — mixing a second model with a
  // custom LSTM model commonly degrades or empties LSTM output (Gheyret parity).
  let langs = (typeof opts.langs === 'string' && opts.langs.trim()) ? opts.langs.trim() : 'ukij';
  if (!images.length) return { success: false, error: 'رەسىم تېپىلمىدى' };

  // Verify at least the first requested model exists, else fail clearly
  // (offline-friendly: tells the user to fetch the models, never a stack trace).
  const firstLang = langs.split('+')[0];
  const tessdata = ocrTessdataDir();
  if (!fs.existsSync(path.join(tessdata, firstLang + '.traineddata'))) {
    return { success: false, error: 'OCR مودېلى تېپىلمىدى. تەرەققىياتچى: «npm run fetch-ocr-models» نى ئىجرا قىلىڭ.' };
  }

  ocrCancelRequested = false;
  let worker = null;
  const pages = [];
  try {
    const { createWorker } = require('tesseract.js');
    // LSTM-only (OEM 1). Local langPath + cacheMethod:'none' + gzip:false ⇒
    // models are read straight from disk, never fetched or cached over network.
    worker = await createWorker(langs, 1, {
      workerPath: ocrWorkerPath(),
      langPath: tessdata,
      cacheMethod: 'none',
      gzip: false,
      logger: () => {}
    });
    // PSM 3 (auto) by default — matches UyghurOCR's "PSM Auto for full pages".
    // Overridable (e.g. '6' = uniform block) via opts.psm for experimentation.
    const psm = (opts.psm && /^\d+$/.test(String(opts.psm))) ? String(opts.psm) : '3';
    await worker.setParameters({ tessedit_pageseg_mode: psm });

    const total = images.length;
    for (let i = 0; i < total; i++) {
      if (ocrCancelRequested) break;
      const raw = String(images[i] || '').replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      const { data } = await worker.recognize(buf);
      const rawText = (data && data.text) || '';
      // Per-page length — the key diagnostic for "blank book" (empty OCR).
      console.log('[ocr] ' + langs + ' page ' + (i + 1) + '/' + total + ' chars=' + rawText.length);
      pages.push(cleanOcrPage(rawText));
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('ocr-progress', { page: i + 1, total, progress: (i + 1) / total });
        }
      } catch (_) {}
    }
    return { success: true, pages, cancelled: ocrCancelRequested };
  } catch (e) {
    return { success: false, error: (e && e.message) || String(e) };
  } finally {
    if (worker) { try { await worker.terminate(); } catch (_) {} }
  }
});

ipcMain.handle('ocr-cancel', () => {
  ocrCancelRequested = true;
  return { success: true };
});

// Gemini (online) OCR engine (Phase 7B). Gated on AI enabled + key — never
// blocks the offline UKIJ engine. Emits ocr-progress like ocr-recognize.
ipcMain.handle('ocr-gemini', async (event, images, opts) => {
  if (!ai.isEnabled() || !ai.hasApiKey()) return { success: false, unavailable: true };
  const wc = event.sender;
  try {
    const res = await ai.ocrImages(images || [], Object.assign({}, opts || {}, {
      onProgress: (done, total) => {
        try { if (!wc.isDestroyed()) wc.send('ocr-progress', { page: done, total: total, progress: total ? done / total : 0 }); } catch (_) {}
      }
    }));
    if (res && res.ok) return { success: true, text: res.text };
    return {
      success: false,
      freeTierLimit: !!(res && res.freeTierLimit),
      busy: !!(res && res.busy),
      error: (res && res.error) || 'Gemini OCR مەغلۇپ بولدى',
      pages: (res && res.pages) || []
    };
  } catch (e) {
    return { success: false, error: (e && e.message) || 'Gemini OCR مەغلۇپ بولدى' };
  }
});

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'كىتاب ھۆججەتلىرى (PDF, TXT, DOCX, DOC, MD)', extensions: ['pdf', 'txt', 'docx', 'doc', 'md', 'markdown'] },
      { name: 'PDF ھۆججىتى', extensions: ['pdf'] },
      { name: 'تېكىست ھۆججىتى (TXT)', extensions: ['txt'] },
      { name: 'Word ھۆججىتى (DOCX, DOC)', extensions: ['docx', 'doc'] },
      { name: 'Markdown ھۆججىتى (MD)', extensions: ['md', 'markdown'] },
      { name: 'بارلىق ھۆججەتلەر', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const stats = fs.statSync(filePath);
  return { filePath, fileName, ext, size: stats.size };
});

ipcMain.handle('read-txt', (event, filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-pdf-buffer', (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { success: true, data: buffer.toString('base64') };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-docx', async (event, filePath) => {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return { success: true, content: result.value };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-doc', async (event, filePath) => {
  try {
    const WordExtractor = require('word-extractor');
    const extractor = new WordExtractor();
    const doc = await extractor.extract(filePath);
    return { success: true, content: doc.getBody() };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Markdown: read the raw .md/.markdown text. We store the markdown source as the
// book content (same plain-text storage path as TXT/DOCX) so it stays fully
// searchable (FTS), paginated and exportable. Markdown is human-readable as-is.
ipcMain.handle('read-md', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// HTML: extract clean, readable text from an .html/.htm file. We strip the
// non-content elements (scripts, styles, nav/header/footer, forms…) so their
// JS/CSS/menu text never leaks in, then take the body's structured text. The
// result is plain text — it flows through the existing reader exactly like a
// TXT/DOCX book, so there is no new rendering path and no HTML reaches innerHTML.
ipcMain.handle('read-html', (event, filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { parse } = require('node-html-parser');
    const root = parse(raw);
    root.querySelectorAll('script,style,noscript,iframe,svg,nav,header,footer,aside,form,button,input,select,textarea')
        .forEach(el => el.set_content(''));
    const body = root.querySelector('body') || root;
    const content = (body.structuredText || '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n\n');
    return { success: true, content };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Web-page fetch for "تور بەت قوشۇش" (import article by URL). Runs in the MAIN
// process so the renderer CSP (connect-src 'self') stays intact — the renderer
// never touches the network. Returns { ok, html, finalUrl, status } on success,
// { ok:false, status?, error } with a calm Uyghur message on any failure.
// Never throws to the renderer.
ipcMain.handle('fetch-url-html', async (event, url) => {
  let target = String(url || '').trim();
  if (!target) return { ok: false, error: 'تور ئادرېسى قۇرۇق' };
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
  try { new URL(target); } catch (e) {
    return { ok: false, error: 'تور ئادرېسى خاتا — ئادرېسنى تەكشۈرۈڭ' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Some publishers refuse requests without a browser-like UA.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: 'تور بەت قايتۇردى: HTTP ' + res.status + ' — ئادرېسنى تەكشۈرۈڭ' };
    }
    const html = await res.text();
    if (!html || !html.trim()) {
      return { ok: false, status: res.status, error: 'تور بەت قۇرۇق مەزمۇن قايتۇردى' };
    }
    return { ok: true, html, finalUrl: res.url || target, status: res.status };
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
    if (aborted) {
      return { ok: false, error: 'ۋاقىت ھالقىپ كەتتى (30s) — تور ئاستا ياكى بەت ئېچىلمايدۇ' };
    }
    return { ok: false, error: 'تورغا ئۇلىنىش مەغلۇپ بولدى — تور ئۇلىنىشى ۋە ئادرېسنى تەكشۈرۈڭ' };
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle('save-file-dialog', async (event, defaultName, content) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'كىتابنى ساقلاش',
      defaultPath: defaultName,
      filters: [
        { name: 'تېكىست ھۆججىتى (TXT)', extensions: ['txt'] },
        { name: 'بارلىق ھۆججەتلەر', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { success: false };
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('export-as-docx', async (event, title, author, content) => {
  try {
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');
    const paragraphs = content.split('\n').map(line =>
      new Paragraph({
        children: [new TextRun({ text: line, font: 'UKIJ Ekran', size: 28 })],
        alignment: AlignmentType.RIGHT, bidirectional: true
      })
    );
    const doc = new Document({
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 } } },
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, bold: true, font: 'UKIJ Ekran', size: 36 })],
            alignment: AlignmentType.CENTER, bidirectional: true, spacing: { after: 200 }
          }),
          new Paragraph({
            children: [new TextRun({ text: author || '', font: 'UKIJ Ekran', size: 24, color: '666666' })],
            alignment: AlignmentType.CENTER, bidirectional: true, spacing: { after: 400 }
          }),
          ...paragraphs
        ]
      }]
    });
    const buffer = await Packer.toBuffer(doc);
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: title + '.docx',
      filters: [{ name: 'Word ھۆججىتى', extensions: ['docx'] }]
    });
    if (result.canceled) return { success: false };
    fs.writeFileSync(result.filePath, buffer);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('export-as-pdf', async (event, title, author, content) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: title + '.pdf',
      filters: [{ name: 'PDF ھۆججىتى', extensions: ['pdf'] }]
    });
    if (result.canceled) return { success: false };
    const pdfWin = new BrowserWindow({ show: false, width: 800, height: 600 });
    const escapedTitle = title.replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const escapedAuthor = (author||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const escapedContent = content.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const fontPath = path.join(__dirname, 'assets', 'ukijekran.ttf').replace(/\\/g, '/');
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
      <style>
        @font-face { font-family: 'UKIJ Ekran'; src: url('file:///${fontPath}'); }
        body { font-family: 'UKIJ Ekran', serif; font-size: 14px; direction: rtl; padding: 40px; line-height: 2.2; }
        h1 { text-align: center; font-size: 22px; margin-bottom: 5px; }
        .author { text-align: center; color: #666; font-size: 12px; margin-bottom: 30px; }
      </style></head>
      <body><h1>${escapedTitle}</h1><div class="author">${escapedAuthor}</div><div>${escapedContent}</div></body></html>`;
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdfData = await pdfWin.webContents.printToPDF({
      pageSize: 'A4',
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
    });
    fs.writeFileSync(result.filePath, pdfData);
    pdfWin.close();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'كىتابلار بولغان ھۆججەتخانىنى تاللاڭ'
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-folder', (event, folderPath) => {
  try {
    const supported = ['.pdf', '.txt', '.docx', '.doc', '.html', '.htm', '.md', '.markdown'];
    const files = [];
    const items = fs.readdirSync(folderPath);
    items.forEach(item => {
      const ext = path.extname(item).toLowerCase();
      if (supported.includes(ext)) {
        const fullPath = path.join(folderPath, item);
        const stats = fs.statSync(fullPath);
        files.push({ filePath: fullPath, fileName: item, ext: ext.slice(1), size: stats.size });
      }
    });
    return { success: true, files };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('open-data-folder', () => {
  shell.openPath(DATA_DIR);
});

// Clean up orphaned content files that no longer have a book entry
ipcMain.handle('cleanup-orphans', () => {
  try {
    const allBooks = database.getAllBooks();
    const bookIds = new Set(allBooks.map(b => b.id));
    let cleaned = 0;
    if (fs.existsSync(CONTENT_DIR)) {
      const files = fs.readdirSync(CONTENT_DIR);
      files.forEach(f => {
        const match = f.match(/^(\d+)\.txt$/);
        if (match) {
          const fileId = parseInt(match[1]);
          if (!bookIds.has(fileId)) {
            try {
              fs.unlinkSync(path.join(CONTENT_DIR, f));
              cleaned++;
            } catch(e) {}
          }
        }
      });
    }
    // Compact the database
    try { database.saveDB(DATA_DIR); } catch(e) {}
    return { success: true, cleaned };
  } catch(e) {
    return { success: false, error: e.message, cleaned: 0 };
  }
});

// Bulk export books by category to a folder
ipcMain.handle('bulk-export', async (event, category) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'كىتابلارنى چۈشۈرىدىغان ھۆججەتخانىنى تاللاڭ'
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const targetDir = result.filePaths[0];

    // Get books in category (or all)
    let books;
    if (category === 'all') {
      books = database.getAllBooks();
    } else {
      books = database.getBooksByCategory(category);
    }

    if (books.length === 0) return { success: false, error: 'no_books' };

    // Create category subfolder
    const catFolderName = (category === 'all' ? 'بارلىق كىتابلار' : category).replace(/[<>:"/\\|?*]/g, '_');
    const catDir = path.join(targetDir, catFolderName);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

    let exported = 0;
    for (const book of books) {
      try {
        const content = database.getBookContent(book.id);
        if (!content) continue;
        // Sanitize file name
        const safeName = (book.title || 'book_' + book.id).replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
        const filePath = path.join(catDir, safeName + '.txt');
        fs.writeFileSync(filePath, content, 'utf-8');
        exported++;
      } catch(e) {
        console.error('Export failed for book', book.id, e);
      }
    }

    // Open the folder for the user
    shell.openPath(catDir);
    return { success: true, exported, total: books.length, folder: catDir };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// ========== QURAN IPC ==========
ipcMain.handle('quran-get-suras', () => {
  try { return { success: true, suras: database.quranGetSuras() }; }
  catch(e) { return { success: false, suras: [], error: e.message }; }
});
ipcMain.handle('quran-get-ayas', (e, suraNumber) => {
  try { return { success: true, ayas: database.quranGetAyas(suraNumber) }; }
  catch(err) { return { success: false, ayas: [], error: err.message }; }
});
ipcMain.handle('quran-get-aya', (e, sura, aya) => {
  try { return { success: true, aya: database.quranGetAya(sura, aya) }; }
  catch(err) { return { success: false, aya: null, error: err.message }; }
});
ipcMain.handle('quran-search', (e, query, opts) => {
  try { return { success: true, results: database.quranSearch(query, opts) }; }
  catch(err) { return { success: false, results: [], error: err.message }; }
});
ipcMain.handle('quran-lookup-sura', (e, input) => {
  try { return { success: true, sura: database.quranLookupSura(input) }; }
  catch(err) { return { success: false, sura: null, error: err.message }; }
});

// ========== NOTES IPC ==========
ipcMain.handle('notes-get-all', () => {
  try { return { success: true, docs: database.notesGetAll() }; }
  catch(e) { return { success: false, docs: [], error: e.message }; }
});
ipcMain.handle('notes-get', (e, id) => {
  try { return { success: true, doc: database.notesGet(id) }; }
  catch(err) { return { success: false, doc: null, error: err.message }; }
});
ipcMain.handle('notes-create', (e, title) => {
  try {
    const id = database.notesCreate(title);
    database.saveDB(DATA_DIR);
    return { success: true, id };
  } catch(err) { return { success: false, error: err.message }; }
});
ipcMain.handle('notes-update', (e, id, title, html, text) => {
  try {
    const safeHtml = coarseSanitizeHtml(html || '');
    const safeTitle = String(title || '').slice(0, 500); // length cap
    const safeText = String(text || '');
    database.notesUpdate(id, safeTitle, safeHtml, safeText);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
});
ipcMain.handle('notes-delete', (e, id) => {
  try {
    database.notesDelete(id);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
});

// ========== NGRAM IPC ==========
ipcMain.handle('ngram-find-word', (e, word) => {
  try { return { success: true, hits: database.ngramFindWord(word) }; }
  catch(err) { return { success: false, hits: [], error: err.message }; }
});
ipcMain.handle('book-content-snippet', (e, bookId, needle, maxResults, ctx) => {
  try {
    const snippets = database.getAllSnippetsForBook(bookId, needle, maxResults || 3, ctx || 80);
    return { success: true, snippets };
  } catch(err) { return { success: false, snippets: [], error: err.message }; }
});

ipcMain.handle('book-content-snippet-batch', (e, requests, maxResults, ctx) => {
  try {
    const results = [];
    for (const req of (requests || [])) {
      try {
        const snippets = database.getAllSnippetsForBook(req.bookId, req.needle, maxResults || 3, ctx || 80);
        results.push({ bookId: req.bookId, needle: req.needle, success: true, snippets });
      } catch(innerErr) {
        results.push({ bookId: req.bookId, needle: req.needle, success: false, snippets: [], error: innerErr.message });
      }
    }
    return { success: true, results };
  } catch(err) { return { success: false, results: [], error: err.message }; }
});

ipcMain.handle('quran-content-snippet', (e, needle, maxResults, ctx) => {
  try {
    const snippets = database.quranContentSnippet(needle, maxResults || 5, ctx || 90);
    return { success: true, snippets };
  } catch(err) { return { success: false, snippets: [], error: err.message }; }
});

// ========== SPELL-CHECK DICTIONARY ==========
ipcMain.handle('load-spell-dict', () => {
  try {
    const p = path.join(__dirname, 'assets', 'spellcheck', 'uyghur_words.txt');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    return null;
  } catch(e) { return null; }
});

ipcMain.handle('load-spell-corrections', () => {
  try {
    const p = path.join(__dirname, 'assets', 'spellcheck', 'uyghur_corrections.json');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    return null;
  } catch(e) { return null; }
});

// ========== AI (GEMINI) — see ai.js ==========
// All Gemini network traffic happens in THIS process (the renderer CSP is
// connect-src 'self' and stays that way). Every handler returns a plain
// result object and never throws to the renderer.

ipcMain.handle('ai-has-key', () => {
  try { return ai.hasApiKey(); } catch (e) { return false; }
});

ipcMain.handle('ai-get-key-masked', () => {
  try { return ai.getApiKeyMasked(); } catch (e) { return ''; }
});

ipcMain.handle('ai-set-key', (event, key) => {
  try { ai.setApiKey(key); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('ai-get-backup-keys', () => {
  try { return ai.getBackupKeysMasked(); } catch (e) { return ['', '', '']; }
});

ipcMain.handle('ai-set-backup-keys', (event, arr) => {
  try { ai.setBackupKeys(arr); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('ai-test-key-slot', async (event, index) => {
  try { return await ai.testKeySlot(index); }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('ai-get-model', () => {
  try { return ai.getModel(); } catch (e) { return ai.DEFAULT_MODEL; }
});

ipcMain.handle('ai-set-model', (event, name) => {
  try { ai.setModel(name); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('ai-is-enabled', () => {
  try { return ai.isEnabled(); } catch (e) { return false; }
});

ipcMain.handle('ai-set-enabled', (event, on) => {
  try { ai.setEnabled(!!on); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('ai-get-usage', () => {
  try { return ai.getTodayUsage(); } catch (e) { return 0; }
});

ipcMain.handle('ai-test', async () => {
  try { return await ai.test(); }
  catch (e) { return { ok: false, message: (e && e.message) || 'سىناشتا خاتالىق' }; }
});

ipcMain.handle('ai-ask', async (event, opts) => {
  try { return await ai.ask(opts || {}); }
  catch (e) { return { ok: false, error: (e && e.message) || 'نامەلۇم خاتالىق' }; }
});

// Streaming: the renderer invokes 'ai-ask-stream' with a requestId it made
// up; chunks flow back over 'ai-chunk-<id>' / 'ai-done-<id>' / 'ai-error-<id>'
// on the SAME webContents, and 'ai-cancel' aborts mid-stream. The invoke
// resolves immediately ({started:true}) — delivery is event-based.
const activeAiStreams = new Map();

ipcMain.handle('ai-ask-stream', (event, requestId, opts) => {
  const id = String(requestId || '');
  if (!id) return { ok: false, error: 'requestId يوق' };
  const wc = event.sender;
  const safeSend = (channel, payload) => {
    try { if (!wc.isDestroyed()) wc.send(channel, payload); } catch (_) {}
  };
  try {
    const handle = ai.askStream(opts || {},
      (delta) => safeSend('ai-chunk-' + id, delta),
      (fullText, model, usage) => {
        activeAiStreams.delete(id);
        safeSend('ai-done-' + id, { text: fullText, model: model, usage: usage || null });
      },
      (err) => {
        activeAiStreams.delete(id);
        safeSend('ai-error-' + id, err || { ok: false, error: 'نامەلۇم خاتالىق' });
      }
    );
    activeAiStreams.set(id, handle);
    return { ok: true, started: true };
  } catch (e) {
    activeAiStreams.delete(id);
    return { ok: false, error: (e && e.message) || 'نامەلۇم خاتالىق' };
  }
});

// Free-form notebook chat stream (Phase 4). Same per-request channel protocol
// as ai-ask-stream and the SAME ai-cancel for aborting. `messages` is an array
// of { role:'user'|'model', text }.
ipcMain.handle('ai-chat-stream', (event, requestId, messages) => {
  const id = String(requestId || '');
  if (!id) return { ok: false, error: 'requestId يوق' };
  const wc = event.sender;
  const safeSend = (channel, payload) => {
    try { if (!wc.isDestroyed()) wc.send(channel, payload); } catch (_) {}
  };
  try {
    const handle = ai.chatStream(messages || [],
      (delta) => safeSend('ai-chunk-' + id, delta),
      (fullText, model, usage) => {
        activeAiStreams.delete(id);
        safeSend('ai-done-' + id, { text: fullText, model: model, usage: usage || null });
      },
      (err) => {
        activeAiStreams.delete(id);
        safeSend('ai-error-' + id, err || { ok: false, error: 'نامەلۇم خاتالىق' });
      }
    );
    activeAiStreams.set(id, handle);
    return { ok: true, started: true };
  } catch (e) {
    activeAiStreams.delete(id);
    return { ok: false, error: (e && e.message) || 'نامەلۇم خاتالىق' };
  }
});

ipcMain.handle('ai-cancel', (event, requestId) => {
  const id = String(requestId || '');
  const handle = activeAiStreams.get(id);
  if (handle) {
    try { handle.abort(); } catch (_) {}
    activeAiStreams.delete(id);
    return { ok: true, cancelled: true };
  }
  return { ok: true, cancelled: false };
});
