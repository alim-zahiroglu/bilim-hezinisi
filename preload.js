const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Database operations (new SQLite-based)
  dbGetBooks: () => ipcRenderer.invoke('db-get-books'),
  dbGetBooksByCategory: (cat) => ipcRenderer.invoke('db-get-books-by-category', cat),
  dbAddBook: (bookData) => ipcRenderer.invoke('db-add-book', bookData),
  dbAddBooksBatch: (booksArray) => ipcRenderer.invoke('db-add-books-batch', booksArray),
  dbUpdateBook: (id, data) => ipcRenderer.invoke('db-update-book', id, data),
  dbDeleteBook: (id) => ipcRenderer.invoke('db-delete-book', id),
  dbGetContent: (bookId) => ipcRenderer.invoke('db-get-content', bookId),
  dbSaveContent: (bookId, content) => ipcRenderer.invoke('db-save-content', bookId, content),
  dbSearch: (query, category) => ipcRenderer.invoke('db-search', query, category),
  dbGetAllSnippets: (bookId, query) => ipcRenderer.invoke('db-get-all-snippets', bookId, query),
  dbSearchHistory: () => ipcRenderer.invoke('db-search-history'),
  dbGetCategories: () => ipcRenderer.invoke('db-get-categories'),
  dbAddCategory: (name, parentId) => ipcRenderer.invoke('db-add-category', name, parentId),
  dbRenameCategory: (oldName, newName) => ipcRenderer.invoke('db-rename-category', oldName, newName),
  dbDeleteCategory: (name) => ipcRenderer.invoke('db-delete-category', name),
  dbGetBookmarks: (bookId) => ipcRenderer.invoke('db-get-bookmarks', bookId),
  dbAddBookmark: (bookId, name, position) => ipcRenderer.invoke('db-add-bookmark', bookId, name, position),
  dbDeleteBookmark: (id) => ipcRenderer.invoke('db-delete-bookmark', id),
  dbGetNotes: (bookId) => ipcRenderer.invoke('db-get-notes', bookId),
  dbAddNote: (bookId, text, position) => ipcRenderer.invoke('db-add-note', bookId, text, position),
  dbDeleteNote: (id) => ipcRenderer.invoke('db-delete-note', id),
  dbGetProgress: (bookId) => ipcRenderer.invoke('db-get-progress', bookId),
  dbSaveProgress: (bookId, position, page) => ipcRenderer.invoke('db-save-progress', bookId, position, page),
  dbAddRecent: (bookId) => ipcRenderer.invoke('db-add-recent', bookId),
  dbGetRecent: () => ipcRenderer.invoke('db-get-recent'),
  dbGetSetting: (key, defaultVal) => ipcRenderer.invoke('db-get-setting', key, defaultVal),
  dbSetSetting: (key, value) => ipcRenderer.invoke('db-set-setting', key, value),
  dbGetStats: () => ipcRenderer.invoke('db-get-stats'),
  computeHash: (content) => ipcRenderer.invoke('compute-hash', content),

  // Legacy operations (kept for backward compatibility)
  loadLibrary: () => ipcRenderer.invoke('load-library'),
  saveLibrary: (data) => ipcRenderer.invoke('save-library', data),
  saveBookContent: (id, content) => ipcRenderer.invoke('save-book-content', id, content),
  loadBookContent: (id) => ipcRenderer.invoke('load-book-content', id),

  // File operations
  openFile: () => ipcRenderer.invoke('open-file'),
  readTxt: (filePath) => ipcRenderer.invoke('read-txt', filePath),
  readPdfBuffer: (filePath) => ipcRenderer.invoke('read-pdf-buffer', filePath),
  readDocx: (filePath) => ipcRenderer.invoke('read-docx', filePath),
  readDoc: (filePath) => ipcRenderer.invoke('read-doc', filePath),
  readMd: (filePath) => ipcRenderer.invoke('read-md', filePath),
  readHtml: (filePath) => ipcRenderer.invoke('read-html', filePath),
  fetchUrlHtml: (url) => ipcRenderer.invoke('fetch-url-html', url),
  saveFileDialog: (name, content) => ipcRenderer.invoke('save-file-dialog', name, content),
  exportAsDocx: (title, author, content) => ipcRenderer.invoke('export-as-docx', title, author, content),
  exportAsPdf: (title, author, content) => ipcRenderer.invoke('export-as-pdf', title, author, content),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  readFolder: (folderPath) => ipcRenderer.invoke('read-folder', folderPath),
  ocrImage: (base64data) => ipcRenderer.invoke('ocr-image', base64data),
  onOcrProgress: (callback) => ipcRenderer.on('ocr-progress', (event, data) => callback(data)),
  getVersion: () => ipcRenderer.invoke('get-version'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  getContentSize: () => ipcRenderer.invoke('get-content-size'),
  cleanupOrphans: () => ipcRenderer.invoke('cleanup-orphans'),
  bulkExport: (category) => ipcRenderer.invoke('bulk-export', category),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),

  // Quran API
  quranGetSuras: () => ipcRenderer.invoke('quran-get-suras'),
  quranGetAyas: (n) => ipcRenderer.invoke('quran-get-ayas', n),
  quranGetAya: (sura, aya) => ipcRenderer.invoke('quran-get-aya', sura, aya),
  quranSearch: (q, opts) => ipcRenderer.invoke('quran-search', q, opts),
  quranLookupSura: (input) => ipcRenderer.invoke('quran-lookup-sura', input),
  // Notes API (new documents module)
  notesGetAll: () => ipcRenderer.invoke('notes-get-all'),
  notesGet: (id) => ipcRenderer.invoke('notes-get', id),
  notesCreate: (title) => ipcRenderer.invoke('notes-create', title),
  notesUpdate: (id, title, html, text) => ipcRenderer.invoke('notes-update', id, title, html, text),
  notesDelete: (id) => ipcRenderer.invoke('notes-delete', id),
  // Ngram API
  ngramFindWord: (word) => ipcRenderer.invoke('ngram-find-word', word),
  bookContentSnippet: (bookId, needle, max, ctx) => ipcRenderer.invoke('book-content-snippet', bookId, needle, max, ctx),
  bookContentSnippetBatch: (requests, max, ctx) => ipcRenderer.invoke('book-content-snippet-batch', requests, max, ctx),
  quranContentSnippet: (needle, max, ctx) => ipcRenderer.invoke('quran-content-snippet', needle, max, ctx),
  // Spell-check dictionary
  loadSpellDict: () => ipcRenderer.invoke('load-spell-dict'),
  loadSpellCorrections: () => ipcRenderer.invoke('load-spell-corrections'),

  // AI (Gemini) — all network happens in the main process (see ai.js).
  // The real API key never crosses into the renderer; only a masked form.
  aiHasKey: () => ipcRenderer.invoke('ai-has-key'),
  aiGetKeyMasked: () => ipcRenderer.invoke('ai-get-key-masked'),
  aiSetKey: (key) => ipcRenderer.invoke('ai-set-key', key),
  aiGetModel: () => ipcRenderer.invoke('ai-get-model'),
  aiSetModel: (name) => ipcRenderer.invoke('ai-set-model', name),
  aiIsEnabled: () => ipcRenderer.invoke('ai-is-enabled'),
  aiSetEnabled: (on) => ipcRenderer.invoke('ai-set-enabled', on),
  aiGetUsage: () => ipcRenderer.invoke('ai-get-usage'),
  aiTest: () => ipcRenderer.invoke('ai-test'),
  aiAsk: (opts) => ipcRenderer.invoke('ai-ask', opts),
  aiCancel: (requestId) => ipcRenderer.invoke('ai-cancel', requestId)
});

// window.AIBridge — the IPC half of the mobile app's window.AI shape.
// contextBridge-exposed objects are frozen (non-writable, non-configurable),
// so the renderer cannot attach the pure helpers (detectType / typeLabel /
// MAX_CONTEXT_CHARS / example chips) onto this object directly. Instead,
// src/ai-client.js composes the final window.AI = bridge methods + pure
// helpers, giving ported mobile code the exact window.AI surface it expects.
// getApiKey deliberately returns the MASKED key — the real key lives only
// in the main process.
contextBridge.exposeInMainWorld('AIBridge', {
  hasApiKey: () => ipcRenderer.invoke('ai-has-key'),
  getApiKey: () => ipcRenderer.invoke('ai-get-key-masked'),
  setApiKey: (key) => ipcRenderer.invoke('ai-set-key', key),
  getModel: () => ipcRenderer.invoke('ai-get-model'),
  setModel: (name) => ipcRenderer.invoke('ai-set-model', name),
  isEnabled: () => ipcRenderer.invoke('ai-is-enabled'),
  setEnabled: (on) => ipcRenderer.invoke('ai-set-enabled', on),
  getTodayUsage: () => ipcRenderer.invoke('ai-get-usage'),
  test: () => ipcRenderer.invoke('ai-test'),
  ask: (opts) => ipcRenderer.invoke('ai-ask', opts),

  // Streaming ask with the mobile callback contract:
  //   onChunk(delta), onDone(fullText, model, usage), onError(resultObj)
  // Returns { abort } just like mobile. The requestId + per-request channels
  // ('ai-chunk-<id>' / 'ai-done-<id>' / 'ai-error-<id>') are wired here so
  // the renderer never needs raw ipcRenderer access.
  askStream: (opts, onChunk, onDone, onError) => {
    const requestId = 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const chunkCh = 'ai-chunk-' + requestId;
    const doneCh = 'ai-done-' + requestId;
    const errCh = 'ai-error-' + requestId;

    const onChunkWrap = (event, delta) => {
      try { if (onChunk) onChunk(delta); } catch (_) {}
    };
    const cleanup = () => {
      ipcRenderer.removeListener(chunkCh, onChunkWrap);
      ipcRenderer.removeAllListeners(doneCh);
      ipcRenderer.removeAllListeners(errCh);
    };
    ipcRenderer.on(chunkCh, onChunkWrap);
    ipcRenderer.once(doneCh, (event, result) => {
      cleanup();
      try { if (onDone) onDone(result && result.text, result && result.model, result && result.usage); } catch (_) {}
    });
    ipcRenderer.once(errCh, (event, err) => {
      cleanup();
      try { if (onError) onError(err); } catch (_) {}
    });

    ipcRenderer.invoke('ai-ask-stream', requestId, opts).then((res) => {
      // The handler refused to start (e.g. bad requestId) — surface it.
      if (res && res.ok === false) {
        cleanup();
        try { if (onError) onError(res); } catch (_) {}
      }
    }).catch((err) => {
      cleanup();
      try { if (onError) onError({ ok: false, error: String((err && err.message) || err) }); } catch (_) {}
    });

    return {
      // Abort fires no callback (mobile contract) — clean the per-request
      // listeners here so cancelled streams don't leave them registered.
      abort: () => {
        cleanup();
        ipcRenderer.invoke('ai-cancel', requestId).catch(() => {});
      }
    };
  }
});
