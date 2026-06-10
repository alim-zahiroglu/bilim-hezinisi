# PROMPT 6 — Auto-Reference Matching: 3-Gram Index + Live Detection

**Only run after Prompt 5 is verified.**

---

You are completing **Bilim Hezinisi 2.4.1**, step **6 of 6** — the final step. Add live auto-reference matching: when the user types in the Notes editor, words that exist in their previously-imported library books get subtly highlighted. Clicking a highlighted word opens a side panel showing where it was found with "insert snippet" buttons. All offline.

## Prerequisites

- Prompt 5 completed: Notes editor is working, `window.NotesInternal` is exposed.
- Prompt 2 completed: `database.ngramIndexBook()`, `ngramFindWord()`, `hasNgramIndex()` all defined. IPC handlers `ngram-find-word` and `book-content-snippet` registered.

## Goals

1. Write the 3-gram matcher (`src/ngram.js`) — replaces the stub.
2. Hook into `main.js` book add/delete flow so new books get n-gram-indexed automatically.
3. Backfill n-grams for books imported before this update.
4. Extend `src/notes.js` with the scan/wrap/panel logic.
5. Filter stop-phrases (the 6 Uyghur phrases the user specified) from matching.

## Task 6.1 — Replace src/ngram.js with the complete implementation

```javascript
// N-gram indexing + matching for auto-reference detection.
// This runs entirely in the renderer; all DB queries go through IPC.
(function(){
  'use strict';

  // Phrases the user explicitly excluded — redacted before tokenization.
  // If any part of a phrase appears in the text, we skip it whole.
  const STOP_PHRASES = [
    'ئاللاھ تائالا مۇنداق دەيدۇ',
    'ئاللاھ تائالا مۇنداق دېگەن',
    'پەيغەمبەر ئەلەيھىسسالام مۇنداق دېگەن',
    'پەيغەمبەر ئەلەيھىسسالام مۇنداق دەيدۇ',
    'رەسۇلۇللاھ سەللاللاھۇ ئەلەيھى ۋەسەللەم',
    'رەزىيەللاھۇ ئەنھۇ'
  ];

  // Individual words common to the stop-phrases above, plus generic high-frequency
  // Uyghur function words. These are tokenized-out even when not part of a phrase.
  const STOP_WORDS = new Set([
    // From user's stop-phrases
    'ئاللاھ','تائالا','مۇنداق','دەيدۇ','دېگەن','دېدى','دەپ',
    'پەيغەمبەر','ئەلەيھىسسالام',
    'رەسۇلۇللاھ','سەللاللاھۇ','ئەلەيھى','ۋەسەللەم',
    'رەزىيەللاھۇ','ئەنھۇ','ئەنھا','ئەنھۇما',
    // Generic high-frequency words unlikely to yield useful matches
    'بولىدۇ','بولدى','بولسۇن','قىلدى','قىلىنىدۇ','دېيىلگەن','كەلدى',
    'بۇنىڭ','شۇنىڭ','بۇنىڭدىن','شۇنداقلا','ئۇنىڭدىن','مۇشۇنداق',
    'دېگەنلىك','دېگۈچى','يەنى','بارچە','ھەممە','كۆپىنچە'
  ]);

  const MIN_WORD_LEN = 5;        // skip very short words
  const MAX_CANDIDATES = 50;     // cap per scan to keep IPC cost bounded

  /**
   * Redact stop-phrases by replacing them with spaces (preserves positions).
   */
  function stripStopPhrases(text) {
    let out = String(text || '');
    for (const phrase of STOP_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      out = out.replace(re, m => ' '.repeat(m.length));
    }
    return out;
  }

  /**
   * Tokenize into distinct candidate words. Unicode-aware.
   */
  function extractCandidates(text) {
    const cleaned = stripStopPhrases(text);
    const seen = new Set();
    const out = [];
    const re = /[\p{L}\p{M}\p{N}]+/gu;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      const w = m[0];
      if (w.length < MIN_WORD_LEN) continue;
      if (STOP_WORDS.has(w)) continue;
      if (seen.has(w)) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= MAX_CANDIDATES) break;
    }
    return out;
  }

  /**
   * For each candidate word:
   *   1. Query ngramFindWord() — tells us which books *might* contain the word.
   *      (3-gram matches are a superset — a book containing "abc" matches any
   *      word starting with "abc", so we must verify.)
   *   2. For each candidate book, call bookContentSnippet() which does the
   *      actual substring search and returns verified context snippets.
   *
   * Yields to the event loop every 5 words to keep UI responsive.
   *
   * @param {string[]} words
   * @param {{perWordSnippets?:number, maxBooks?:number}} [opts]
   * @returns {Promise<Map<string, Array<{bookId:number, snippets:Array<{snip:string,pos:number}>}>>>}
   */
  async function findReferences(words, opts) {
    opts = opts || {};
    const perWordSnippets = opts.perWordSnippets || 3;
    const maxBooks = opts.maxBooks || 10;
    const matches = new Map();

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // Yield every 5 words so typing stays responsive
      if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 0));

      let probe;
      try {
        probe = await window.electron.ngramFindWord(word);
      } catch(e) { continue; }
      if (!probe || !probe.success || !probe.hits || !probe.hits.length) continue;

      // Verify each candidate book with a real substring snippet query
      const bookMatches = [];
      const limited = probe.hits.slice(0, maxBooks);
      for (const hit of limited) {
        try {
          const snipR = await window.electron.bookContentSnippet(hit.bookId, word, perWordSnippets, 80);
          if (snipR && snipR.success && snipR.snippets && snipR.snippets.length) {
            bookMatches.push({ bookId: hit.bookId, snippets: snipR.snippets });
          }
        } catch(e) { /* skip this book */ }
      }
      if (bookMatches.length) matches.set(word, bookMatches);
    }
    return matches;
  }

  window.NGram = {
    extractCandidates,
    findReferences,
    STOP_PHRASES, STOP_WORDS, MIN_WORD_LEN
  };
})();
```

## Task 6.2 — Extend src/notes.js with scan/wrap/panel logic

Open `src/notes.js`. Find the line `window.NotesInternal = { ... };` near the bottom. **Immediately before it**, insert this entire block:

```javascript
  // ========== REFERENCE SCANNING (Prompt 6) ==========

  let scanTimer = null;
  let lastScannedText = '';

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(runScan, 400);
  }

  // The hook that notes.js editor input listener calls
  window.notesScanReferences = scheduleScan;

  async function runScan() {
    if (!editorEl || !window.NGram) return;
    const text = editorEl.innerText || '';
    if (text === lastScannedText) return;
    lastScannedText = text;

    if (!text.trim() || text.length < 10) {
      _s().matches = new Map();
      unwrapAllRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
      return;
    }

    const candidates = window.NGram.extractCandidates(text);
    if (!candidates.length) {
      _s().matches = new Map();
      unwrapAllRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
      return;
    }

    try {
      const matches = await window.NGram.findReferences(candidates, {
        perWordSnippets: 3,
        maxBooks: 10
      });
      // If the user edited during the async scan, our results may be stale.
      // Check again before applying.
      if ((editorEl.innerText || '') !== lastScannedText) return;
      _s().matches = matches;
      wrapRefMatchesInEditor();
      if (_s().rightTab === 'refs') renderRefsPanel();
    } catch(e) {
      console.error('[notes] reference scan failed:', e);
    }
  }

  /**
   * Walk editor text nodes and wrap any match-word occurrences with
   * <span class="ref-match" data-ref-word="…">. Preserves caret position
   * as best as possible (text-node mutations may drift by 1-2 chars in
   * rare cases, which is acceptable).
   */
  function wrapRefMatchesInEditor() {
    if (!editorEl) return;
    if (!_s().matches || !_s().matches.size) {
      unwrapAllRefMatches();
      return;
    }

    // Save caret
    const sel = window.getSelection();
    let caretNode = null, caretOffset = -1;
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      if (editorEl.contains(range.startContainer)) {
        caretNode = range.startContainer;
        caretOffset = range.startOffset;
      }
    }

    // Rebuild from scratch: unwrap existing, then re-wrap.
    unwrapAllRefMatches();

    const wordSet = new Set(_s().matches.keys());
    if (!wordSet.size) return;

    // Collect text nodes (skip nodes already under a .ref-match — there
    // shouldn't be any after unwrap, but be defensive)
    const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.parentElement && n.parentElement.closest('.ref-match')) continue;
      if (!n.nodeValue || n.nodeValue.length < window.NGram.MIN_WORD_LEN) continue;
      textNodes.push(n);
    }

    for (const tn of textNodes) {
      const txt = tn.nodeValue;
      const matches = [];

      // Find all occurrences of all match-words in this text node
      for (const w of wordSet) {
        let idx = 0;
        while ((idx = txt.indexOf(w, idx)) !== -1) {
          matches.push({ start: idx, end: idx + w.length, word: w });
          idx += w.length;
        }
      }
      if (!matches.length) continue;

      // Sort by start; if ties, prefer the longer span
      matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

      // Remove overlaps: greedy, keep earliest non-overlapping
      const clean = [];
      let lastEnd = 0;
      for (const m of matches) {
        if (m.start >= lastEnd) { clean.push(m); lastEnd = m.end; }
      }

      // Build a fragment: plain text | <span> | plain text | …
      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const m of clean) {
        if (m.start > cursor) {
          frag.appendChild(document.createTextNode(txt.slice(cursor, m.start)));
        }
        const span = document.createElement('span');
        span.className = 'ref-match';
        span.setAttribute('data-ref-word', m.word);
        span.textContent = txt.slice(m.start, m.end);
        span.title = 'كىتابلاردىن تېپىلدى — چېكىپ مەنبىلەرنى كۆرۈڭ';
        span.addEventListener('click', onRefMatchClick);
        frag.appendChild(span);
        cursor = m.end;
      }
      if (cursor < txt.length) {
        frag.appendChild(document.createTextNode(txt.slice(cursor)));
      }

      if (tn.parentNode) tn.parentNode.replaceChild(frag, tn);
    }

    // Restore caret (best effort)
    try {
      if (caretNode && caretNode.nodeType === Node.TEXT_NODE && caretNode.parentNode) {
        const range = document.createRange();
        const safe = Math.min(caretOffset, caretNode.nodeValue.length);
        range.setStart(caretNode, safe);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch(e) { /* caret may drift; acceptable */ }
  }

  function onRefMatchClick(e) {
    e.stopPropagation();
    const word = this.getAttribute('data-ref-word');
    if (!word) return;
    window.notesShowRefFor(word);
  }

  function unwrapAllRefMatches() {
    if (!editorEl) return;
    const spans = editorEl.querySelectorAll('.ref-match');
    for (const s of spans) {
      const parent = s.parentNode;
      if (!parent) continue;
      while (s.firstChild) parent.insertBefore(s.firstChild, s);
      parent.removeChild(s);
    }
    editorEl.normalize();
  }

  // ========== REFS PANEL RENDERING ==========

  function renderRefsPanel() {
    const container = document.getElementById('notes-refs-content');
    if (!container) return;

    const matches = _s().matches || new Map();
    const filter = _s().refsFilter || null;

    if (!matches.size) {
      container.innerHTML = `<div class="notes-ref-empty">
        ھازىرچە مەنبە يوق<br><br>
        تەھرىرلىگۈچكە يازسىڭىز<br>ئاپتوماتىك چىقىدۇ
      </div>`;
      return;
    }

    const entries = (filter && matches.has(filter))
      ? [[filter, matches.get(filter)]]
      : Array.from(matches.entries());

    const header = filter
      ? `<div style="padding:6px 10px;background:var(--bg);border-radius:var(--radius2);margin-bottom:10px;font-size:11px;color:var(--text3);font-family:sans-serif;display:flex;justify-content:space-between;align-items:center;gap:8px">
           <span>فىلتر: <b style="color:var(--am)">${escHtml(filter)}</b></span>
           <button onclick="window.notesClearRefFilter()" style="background:none;border:0.5px solid var(--border2);color:var(--text2);border-radius:var(--radius2);padding:2px 10px;font-family:var(--jf);cursor:pointer;font-size:11px;white-space:nowrap">ھەممىسىنى كۆرۈش</button>
         </div>`
      : `<div style="padding:4px 2px;margin-bottom:8px;font-size:11px;color:var(--text3);font-family:sans-serif">${entries.length} سۆز ئۈچۈن مەنبە تېپىلدى</div>`;

    let html = header;
    for (const [word, books] of entries) {
      for (const bm of books) {
        const book = (window.S.books || []).find(b => b.id === bm.bookId);
        const bookTitle = book ? book.title : `كىتاب #${bm.bookId}`;
        for (const sn of bm.snippets) {
          // Snippet comes with §MARK_OPEN§ / §MARK_CLOSE§ markers from database.js
          const snipHtml = String(sn.snip || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/§MARK_OPEN§/g, '<mark>')
            .replace(/§MARK_CLOSE§/g, '</mark>');
          // Pass raw snippet (with markers) to insert; we'll strip markers there.
          const encSnip = encodeURIComponent(sn.snip || '');
          html += `<div class="notes-ref-item">
            <div class="notes-ref-word">${escHtml(word)}</div>
            <div class="notes-ref-source">📘 ${escHtml(bookTitle)}</div>
            <div class="notes-ref-snippet">${snipHtml}</div>
            <button class="notes-ref-insert" onclick="window.notesInsertRef(${bm.bookId}, '${encSnip}')">📝 قىستۇرۇش</button>
          </div>`;
        }
      }
    }
    container.innerHTML = html;
  }

  // Exposed for the tab-switch handler in Prompt 5
  window.notesRenderRefsPanel = renderRefsPanel;

  window.notesShowRefFor = function(word) {
    _s().refsFilter = word;
    _s().rightTab = 'refs';

    // Update right-panel UI: switch tabs, replace content with refs list container
    const tabs = document.querySelectorAll('.notes-right-panel-tab');
    tabs.forEach((t, i) => t.classList.toggle('active', i === 1));
    const rightContent = document.getElementById('notes-right-content');
    if (rightContent) {
      rightContent.innerHTML = `<div id="notes-refs-content" class="notes-ref-list"></div>`;
    }
    renderRefsPanel();
  };

  window.notesClearRefFilter = function() {
    _s().refsFilter = null;
    renderRefsPanel();
  };

  window.notesInsertRef = function(bookId, encodedSnip) {
    if (!editorEl) return;
    let snip = '';
    try { snip = decodeURIComponent(encodedSnip); } catch(e) {}
    // Strip internal markers (we keep plain text in the inserted blockquote)
    snip = snip.replace(/§MARK_OPEN§|§MARK_CLOSE§/g, '');

    const book = (window.S.books || []).find(b => b.id === bookId);
    const bookTitle = book ? book.title : '';

    const insertHtml = `<blockquote dir="rtl">` +
      `<span>${escHtml(snip)}</span>` +
      (bookTitle ? `<br><span style="font-size:0.85em;color:#888">— ${escHtml(bookTitle)}</span>` : '') +
    `</blockquote><p><br></p>`;

    editorEl.focus();
    document.execCommand('insertHTML', false, insertHtml);
    markDirty();
    if (typeof showToast === 'function') showToast('مەنبە قىستۇرۇلدى', 's');
  };
```

## Task 6.3 — Hook n-gram indexing into book add/delete in main.js

**a. On book add** — find the existing `ipcMain.handle('db-add-book', ...)` handler. Inside the try block, **after** `const id = database.addBook(...)` and before `return { success: true, id };`, add:

```javascript
if (content) {
  try {
    database.ngramIndexBook(id, content);
    database.saveDB(DATA_DIR);
  } catch(e) {
    console.error('[ngram] index on add failed for book', id, e);
    // Book is still added; index just won't be available for this one yet
  }
}
```

**b. On book delete** — find `ipcMain.handle('db-delete-book', ...)`. Inside the try block, **after** `database.deleteBook(id)` and before/alongside `cleanupBookFiles(id)`, add:

```javascript
try { database.ngramRemoveBook(id); } catch(e) { /* best effort */ }
```

**c. Backfill on startup** — find `async function initDatabase()`. At the very end of the function, **after** `dbReady = true;`, add:

```javascript
// Schedule background n-gram backfill so existing books become searchable
// in the Notes auto-reference feature. This runs after the window is ready
// so app startup is not blocked.
setTimeout(() => {
  ensureNgramIndexBackground().catch(e => console.error('[ngram] backfill error:', e));
}, 3000);
```

Then, near the bottom of `main.js` (or anywhere outside other functions but in module scope), add this helper function:

```javascript
/**
 * Backfill n-gram indices for books that don't have them yet.
 * Runs incrementally with yields so the UI stays responsive.
 */
async function ensureNgramIndexBackground() {
  if (!dbReady) return;
  const books = database.getAllBooks();
  let indexed = 0;
  for (const b of books) {
    try {
      if (database.hasNgramIndex(b.id)) continue;
      const content = database.getBookContent(b.id);
      if (!content) continue;
      // Yield to the event loop between books
      await new Promise(resolve => setImmediate(resolve));
      database.ngramIndexBook(b.id, content);
      indexed++;
      // Save periodically so a crash mid-backfill doesn't lose work
      if (indexed % 10 === 0) {
        try { database.saveDB(DATA_DIR); } catch(e) {}
      }
    } catch(e) {
      console.error('[ngram] backfill failed for book', b.id, e);
    }
  }
  if (indexed > 0) {
    try { database.saveDB(DATA_DIR); } catch(e) {}
    console.log(`[ngram] backfill complete: indexed ${indexed} books`);
  } else {
    console.log('[ngram] backfill: nothing to do');
  }
}
```

## Task 6.4 — Verify IPC handlers (should already exist from Prompt 2)

Open `main.js` and confirm these two handlers are present. If not, add them:

```javascript
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
```

Open `preload.js` and confirm these two methods are in the contextBridge object:

```javascript
ngramFindWord: (word) => ipcRenderer.invoke('ngram-find-word', word),
bookContentSnippet: (bookId, needle, max, ctx) => ipcRenderer.invoke('book-content-snippet', bookId, needle, max, ctx)
```

## Acceptance Criteria

### Backfill
1. Add a couple of TXT books to the library first (for example, paste long Uyghur text files or import books you already have).
2. Restart the app. In DevTools Console, you should see within ~10 seconds: `[ngram] backfill complete: indexed N books`.
3. Restart again. Console shows `[ngram] backfill: nothing to do`.

### Live scanning
4. Go to Notes → open an existing doc or create a new one.
5. Type a paragraph that contains at least one word (≥5 characters) that appears inside one of your imported books. Within ~500ms of stopping, that word gets a subtle yellow dotted underline (`ref-match` styling).
6. The word keeps the underline as you continue typing. Adding more text finds more matches.
7. Type one of the stop-phrases exactly, e.g. `ئاللاھ تائالا مۇنداق دەيدۇ` — no matches on the phrase's words.
8. Type a word that is NOT in any book — no underline.

### Panel interaction
9. Click a highlighted word → right panel auto-switches to 🔗 مەنبە tab. Shows filter header with the clicked word, and 1-3 snippets per book where it appeared.
10. Each snippet shows: the word (🟧), the book title (📘), the snippet text with the matched word highlighted in yellow `<mark>`, and a "📝 قىستۇرۇش" button.
11. Click "ھەممىسىنى كۆرۈش" → filter clears, all matches for all scanned words shown.
12. Click "📝 قىستۇرۇش" on a snippet → the snippet (as a blockquote with the book name) is inserted at the editor cursor. Toast "مەنبە قىستۇرۇلدى".
13. After insert, save persists the blockquote.

### Save preservation
14. Close the app, reopen → the note with highlighted words and the inserted blockquote is fully preserved.

### New book integration
15. Import a new book via library mode. Switch back to the note. Type a word from the new book → the match detection now includes the new book within the same session (no restart needed, because the book was indexed on add).

### Deletion integration
16. Delete a book that was being referenced. The inserted blockquotes in notes remain (that's just text), but new scans won't match those words anymore.

## Rules

- All DB operations go through IPC — no direct `database.*` calls from renderer.
- Keep the 400ms debounce. Faster debounce (100ms) will cause N+M+K IPC calls per keystroke and the UI will stutter.
- Preserve caret position in the editor as best as possible. 1-2 char drift after heavy re-wrap is acceptable.
- Do not send stop-phrases to `ngramFindWord` — they're filtered in `NGram.extractCandidates`.
- After finishing, report files touched, then ask me to test.

---

# 🎉 FINAL — End-to-End Acceptance

After Prompt 6 verifies, run this complete smoke test:

1. **Existing library works.** Open a TXT book that you had before this upgrade. Search, read, bookmark, note — all still works.
2. **Quran mode works.** Open Fatiha, Baqara, Ayat al-Kursi (2:255), Ikhlas (112). Search `الحمد` (Arabic), `رەبىم` (Uyghur). Copy an aya both with and without translation, paste into MS Word. Fonts and brackets preserved.
3. **Notes mode works.** Create a note, use Bold/Italic/Font/Lists. Auto-save within 3s. Insert an aya via Quran quick-insert panel. Copy content to Word — formatting preserved.
4. **Auto-reference works.** Type a word from an imported book. See the dotted underline. Click it. Insert a snippet. Save.
5. **No crashes, no visible errors.** Open DevTools Console — only expected log lines: `FTS5 full-text search enabled`, `[seed-quran] Already seeded, skipping.`, `[ngram] backfill: nothing to do`.
6. **Build works.** `npm run dist` → `dist/Bilim Hezinisi Setup 2.4.2.exe`. Install it on a clean Windows machine (with the fonts pre-installed) — everything works offline.

If all 6 pass, the implementation is complete.
