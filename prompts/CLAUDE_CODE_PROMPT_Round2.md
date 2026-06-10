# Claude Code Fix Prompt — Bilim Hezinisi 2.4.2 — Round 2 (3 remaining bugs)

You are continuing work on **Bilim Hezinisi**, an Electron + sql.js Uyghur digital library. The previous round (Bug 1–4) was partially successful: the adaptive ngram matcher and the inserted-quote exclusion were correctly implemented. However, three issues remain. Read each file listed below **in full** before editing. UI strings: Uyghur. Code/comments: English.

Relevant files:
```
src/index.html   ← mode switching, main area DOM, setCat, setMode, renderBooks
src/notes.js     ← notes editor, reference scan, wrapRefMatchesInEditor
src/notes.css
src/ngram.js     ← adaptive candidate extractor (already correct, do NOT touch)
main.js          ← IPC handlers, ngram backfill, Quran seeding
preload.js       ← IPC bridge
database.js      ← SQLite wrapper, book_ngrams, quran_ayas, quran_fts
```

---

## BUG A — Mode switching from خاتىرە/قۇرئان back to كىتابلار is visually broken

### Symptom (confirmed by video)
1. User is in «خاتىرە دەپتىرىم» (notes mode). They click the «📚 كىتابلار» mode tab.
2. The **sidebar** correctly switches to library mode (category list with book counts is visible).
3. **But the main content area (center of the screen) still shows the notes editor.** The books grid never appears.
4. Clicking a category (e.g. «ھەدىسلەر») changes the sidebar to show it's selected, but the main area stays frozen on the notes editor.
5. The user can only recover by restarting the app.

### Root cause (verified by reading the code)

`renderNotesView()` (notes.js line 74) does:
```js
const main = document.getElementById('main');
main.innerHTML = `<div class="notes-layout">...</div>`;
```

This **destroys** the library's DOM structure inside `#main` — specifically the elements `#bd` (book grid container), `#vtitle`, `#pagination`, and the toolbar with sort/view buttons. These elements are defined in `src/index.html` as static HTML (lines 334–350).

When the user clicks «📚 كىتابلار», `setMode('library')` is called (line 784). It does:
1. `S.mode = 'library'` ✓
2. Shows `#hd` (top search bar) ✓
3. `renderSide()` → sidebar re-renders with categories ✓
4. `renderBooks()` → tries `document.getElementById('bd')` → **returns `null`** because `#bd` was destroyed → **silently fails, main area unchanged** ✗

Same problem with `setCat()` (line 888) — it was correctly updated to set `S.mode='library'` but still calls `renderBooks()` which needs the destroyed `#bd`.

### Fix

The fix must **restore the library's main-area DOM** when switching back to library mode. The cleanest approach: save the original HTML once, and restore it in `setMode`.

In `src/index.html`, make these changes:

**Step 1:** After the `S` state declaration (around line 610), add a variable to cache the library main HTML:

```js
let libraryMainHTML = '';
```

**Step 2:** In the `init()` function (around line 621), after `renderBooks()` completes but before the end of `init`, cache the main area HTML:

```js
// Cache the library main area HTML so we can restore it after mode switches
libraryMainHTML = document.getElementById('main').innerHTML;
```

**Step 3:** In `setMode()` (line 784), when switching to library mode, restore the cached DOM first:

```js
function setMode(mode) {
  if (mode === S.mode) return;
  S.mode = mode;
  const hd = document.getElementById('hd');
  if (hd) hd.style.display = (mode === 'library') ? 'flex' : 'none';
  renderSide();
  if (mode === 'library') {
    // Restore the library's main-area DOM that was destroyed by notes/quran views
    const main = document.getElementById('main');
    if (main && libraryMainHTML) {
      main.innerHTML = libraryMainHTML;
    }
    renderBooks();
  } else if (mode === 'quran' && typeof renderQuranView === 'function') {
    renderQuranView();
  } else if (mode === 'notes' && typeof renderNotesView === 'function') {
    renderNotesView();
  }
}
```

**Step 4:** Similarly update `setCat()` (line 888). When it switches from a non-library mode, it must also restore the DOM:

```js
function setCat(c) {
  if (S.mode !== 'library') {
    S.mode = 'library';
    const hd = document.getElementById('hd');
    if (hd) hd.style.display = 'flex';
    // Restore destroyed library DOM
    const main = document.getElementById('main');
    if (main && libraryMainHTML) {
      main.innerHTML = libraryMainHTML;
    }
  }

  S.cat = c;
  S.srch = false;
  S.page = 1;

  const si = document.getElementById('si');
  const clr = document.getElementById('clr');
  if (si) {
    si.value = '';
    si.placeholder = (c === 'all')
      ? 'بارلىق كىتابلاردىن ئىزدەش...'
      : sanitize(c) + ' ئىچىدىن ئىزدەش...';
  }
  if (clr) clr.style.display = 'none';

  renderSide();
  renderBooks();
}
```

### Why this works
- `libraryMainHTML` is cached once at startup, after the initial `renderBooks()` call populates `#bd`. It contains the toolbar, `#bd`, and `#pagination`.
- When notes/quran view replaces `#main`'s innerHTML, the library DOM is lost from the live document but preserved in the string.
- Restoring it before `renderBooks()` means `#bd` exists again and books render correctly.
- `renderBooks()` then fills `#bd` with the current category's book grid.

### Verification
1. Open «خاتىرە دەپتىرىم», type some notes → click «📚 كىتابلار» → **books grid appears in the main area**. ✓
2. From library → open «قۇرئان كەرىم» → switch back to «📚 كىتابلار» → **books grid appears**. ✓
3. From notes → click «ھەدىسلەر» category → **library shows filtered to ھەدىسلەر**. ✓
4. From library → switch to notes → switch back → **notes state was saved, books show again**. ✓
5. No console errors at any step.

---

## BUG B — Reference scanner only finds the first matching phrase, ignores others

### Symptom
The user types multiple lines, each containing phrases that exist in books:
- «لەختە قاندىن ياراتتى» → ✅ found, underlined
- «مەقبۇل ئىسلام دىنىدۇر» → ❌ NOT found
- «ئاخىرەتتە زىيان تارتقۇچىدۇر» → ❌ NOT found
- «زامان بىلەن قەسەمكى» → ❌ NOT found

The right panel only shows snippets for the first phrase.

### Root cause (verified by reading notes.js)

The problem is in `wrapRefMatchesInEditor()` (notes.js around line 530). After the first successful wrap cycle, the function does `tn.parentNode.replaceChild(frag, tn)` — this replaces the original text node with a DocumentFragment containing `<span class="ref-match">` wrappers. **The issue is subtle**: after wrapping the first line's text node, the *other* text nodes' references become stale if the DOM mutation affected the walker. But the walker has already collected `textNodes[]` before mutation, so that should be fine.

**The real problem is different.** Look at the flow:

1. `getScannableText()` extracts all text from the editor (excluding inserted refs).
2. `extractCandidates(text)` tokenizes ALL the text and generates trigrams/bigrams from ALL lines.
3. `findReferences(candidates)` looks up EACH candidate in the book ngram index via IPC.
4. The `Map<phrase, bookMatches>` is stored in `_s().matches`.
5. `wrapRefMatchesInEditor()` walks text nodes and wraps occurrences of each phrase.

If `_s().matches` contains only one phrase, then only one phrase was verified by `findReferences`. This means either:
- (a) `extractCandidates` only generated one trigram/bigram (tokenization issue), OR
- (b) `findReferences` dropped the other candidates because the 3-gram probe found no hits, OR
- (c) the substring verification (`bookContentSnippet`) returned empty for the other phrases.

The most likely cause is **(b)**: the `ngramFindWord(firstWord)` probe uses the first 3 characters of the first word. **For Uyghur text with diacritics and Unicode combining marks, `substr(0,3)` can split a character incorrectly.** The 3-gram index was built by `ngramIndexBook()` which also uses `substr(i,3)` — so both sides make the same mistake. However, the mismatch can occur when the **editor text uses slightly different Unicode normalization** than what was stored in the book content.

**But there's also a simpler explanation.** Look more carefully at the screenshot — the phrases «مەقبۇل ئىسلام دىنىدۇر», «ئاخىرەتتە زىيان تارتقۇچىدۇر», «زامان بىلەن قەسەمكى» — these are Quran-related phrases. They likely appear in **Quran aya translations (quran_ayas table), NOT in regular books (book_content table)**. The ngram index only covers `book_content`. **This is actually Bug C (below), not a separate scanner bug.**

However, there is also a real wrapping issue that should be fixed: after `wrapRefMatchesInEditor` wraps phrases in text nodes, `editorEl.innerText` changes (because `<span>` elements are added). This means the `lastScannedText` cache is now stale — the next `input` event will re-scan the new text, but the new text includes the `<span>` markers. This can interfere with subsequent scans.

### Fix — prevent stale cache after wrapping

In `runScan()`, after `wrapRefMatchesInEditor()`, update `lastScannedText` to the current scannable text so the next input event doesn't redundantly re-scan:

```js
_s().matches = matches;
wrapRefMatchesInEditor();
// Update cache AFTER wrapping so span insertion doesn't trigger a redundant re-scan
lastScannedText = getScannableText();
if (_s().rightTab === 'refs') renderRefsPanel();
```

This is a minor fix — the main issue is Bug C below.

---

## BUG C — Quran ayas (Arabic text + Uyghur translation) are not searchable by the reference scanner

### Symptom
When typing in the notes editor, phrases from **Quran ayas** are never matched. The scanner only finds matches in **imported books** (book_content table). Quran translations like «مەقبۇل ئىسلام دىنىدۇر» or Arabic text like «إِنَّكَ أَنتَ الْوَهَّابُ» are never detected, even though they exist verbatim in the `quran_ayas` table.

### Root cause (verified)

1. The ngram backfill (`main.js` lines 99–126) iterates `database.getAllBooks()` which queries the `books` table. Quran ayas are stored in `quran_ayas` — a completely separate table. They are never indexed into `book_ngrams`.

2. `bookContentSnippet()` searches `book_content` via `getBookContent(bookId)`. There is no equivalent function for searching quran aya text.

3. Therefore the entire ngram pipeline (probe → verify) has zero visibility into Quran content.

### Design for the fix

We need to make Quran ayas searchable by the same reference scanner, without disrupting the existing book pipeline. The approach:

1. **Create a virtual "Quran book" entry** in the ngram index. During backfill, concatenate ALL Quran aya translations (Uyghur text, `text_ug`) into one long string, and index it under a special book ID (e.g., -1 or a constant like 999999). Also concatenate the simplified Arabic text (`text_ar_simple`) separately and index it under book ID -2.

2. **Add a Quran snippet function** `quranContentSnippet(needle, maxResults, ctx)` to `database.js` that searches both `text_ug` and `text_ar_simple` columns in `quran_ayas` for the exact substring, and returns snippets with sura:aya metadata.

3. **In the renderer**, when `findReferences()` gets hits for a Quran virtual book ID (-1 or -2), display them with a «📖 قۇرئان كەرىم» source label instead of a regular book title, and the «كىتابقا بېرىش» button should navigate to the Quran reader at that sura:aya.

### Implementation

#### C1. Add constants and a Quran indexing function to `database.js`

Add near the top of the ngram section (around line 748):

```js
const QURAN_BOOK_ID_UG = -1;  // Virtual book ID for Quran Uyghur translations
const QURAN_BOOK_ID_AR = -2;  // Virtual book ID for Quran Arabic text

function ngramIndexQuran() {
  // Concatenate all Uyghur translations into one searchable block
  const ugRows = db.exec('SELECT sura, aya, text_ug FROM quran_ayas ORDER BY sura, aya');
  if (!ugRows.length) return;

  let ugText = '';
  for (const row of ugRows[0].values) {
    const text = row[2] || '';
    if (text) ugText += text + ' ';
  }

  if (ugText.length > 10) {
    db.run('DELETE FROM book_ngrams WHERE book_id=?', [QURAN_BOOK_ID_UG]);
    ngramIndexBook(QURAN_BOOK_ID_UG, ugText);
  }

  // Concatenate all Arabic simple text
  const arRows = db.exec('SELECT sura, aya, text_ar_simple FROM quran_ayas ORDER BY sura, aya');
  if (!arRows.length) return;

  let arText = '';
  for (const row of arRows[0].values) {
    const text = row[2] || '';
    if (text) arText += text + ' ';
  }

  if (arText.length > 10) {
    db.run('DELETE FROM book_ngrams WHERE book_id=?', [QURAN_BOOK_ID_AR]);
    ngramIndexBook(QURAN_BOOK_ID_AR, arText);
  }
}
```

#### C2. Add a Quran snippet search function to `database.js`

```js
/**
 * Search Quran ayas for an exact substring match and return context snippets
 * with sura:aya metadata. Searches both text_ug and text_ar_simple.
 *
 * @param {string} needle - The search phrase
 * @param {number} [maxResults=5] - Max snippets to return
 * @param {number} [ctx=90] - Characters of context around each match
 * @returns {Array<{snip: string, pos: number, sura: number, aya: number, lang: string}>}
 */
function quranContentSnippet(needle, maxResults, ctx) {
  const MAX = Math.max(1, Math.min(50, maxResults || 5));
  const CTX = Math.max(10, Math.min(400, ctx || 90));
  const lcNeedle = String(needle || '').toLowerCase();
  if (!lcNeedle) return [];

  const snippets = [];

  // Search Uyghur translations
  const ugRows = db.exec('SELECT sura, aya, text_ug FROM quran_ayas ORDER BY sura, aya');
  if (ugRows.length) {
    for (const row of ugRows[0].values) {
      if (snippets.length >= MAX) break;
      const sura = row[0], aya = row[1], text = row[2] || '';
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

      snippets.push({ snip: snip.replace(/\s+/g, ' ').trim(), pos: hit, sura, aya, lang: 'ug' });
    }
  }

  // Search Arabic simple text
  if (snippets.length < MAX) {
    const arRows = db.exec('SELECT sura, aya, text_ar_simple FROM quran_ayas ORDER BY sura, aya');
    if (arRows.length) {
      for (const row of arRows[0].values) {
        if (snippets.length >= MAX) break;
        const sura = row[0], aya = row[1], text = row[2] || '';
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

        snippets.push({ snip: snip.replace(/\s+/g, ' ').trim(), pos: hit, sura, aya, lang: 'ar' });
      }
    }
  }

  return snippets;
}
```

#### C3. Export the new functions from `database.js`

In the `module.exports` block at the bottom of `database.js`, add:

```js
ngramIndexQuran, quranContentSnippet, QURAN_BOOK_ID_UG, QURAN_BOOK_ID_AR
```

#### C4. Call `ngramIndexQuran()` during backfill in `main.js`

In `ensureNgramIndexBackground()` (main.js around line 99), **after** the book indexing loop and before the final save, add:

```js
// Also index Quran ayas for auto-reference in notes
try {
  if (!database.hasNgramIndex(database.QURAN_BOOK_ID_UG)) {
    database.ngramIndexQuran();
    indexed++;
    console.log('[ngram] indexed Quran ayas for reference matching');
  }
} catch(e) {
  console.error('[ngram] Quran indexing failed:', e);
}
```

#### C5. Add IPC handler for Quran snippet search in `main.js`

After the existing `book-content-snippet` handler (around line 916), add:

```js
ipcMain.handle('quran-content-snippet', (e, needle, maxResults, ctx) => {
  try {
    const snippets = database.quranContentSnippet(needle, maxResults || 5, ctx || 90);
    return { success: true, snippets };
  } catch(err) { return { success: false, snippets: [], error: err.message }; }
});
```

#### C6. Add the bridge in `preload.js`

In the `electron` object exposed by `contextBridge`, add:

```js
quranContentSnippet: (needle, max, ctx) => ipcRenderer.invoke('quran-content-snippet', needle, max, ctx),
```

#### C7. Update `ngram.js` `findReferences` to also search Quran

In `src/ngram.js`, the `findReferences()` function currently only probes `ngramFindWord` → `bookContentSnippet`. We need to also call `quranContentSnippet` when the probe returns Quran virtual book IDs (-1 or -2).

**Replace the `findReferences` function** in `src/ngram.js`:

```js
async function findReferences(candidates, opts) {
  opts = opts || {};
  const perWordSnippets = opts.perWordSnippets || 3;
  const maxBooks = opts.maxBooks || MAX_BOOKS_PER_PHR;
  const matches = new Map();

  const QURAN_IDS = new Set([-1, -2]);

  for (let i = 0; i < candidates.length; i++) {
    const { phrase, kind } = candidates[i];
    if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 0));

    const firstWord = phrase.split(' ')[0];
    let probe;
    try { probe = await window.electron.ngramFindWord(firstWord); }
    catch (e) { continue; }
    if (!probe || !probe.success || !probe.hits || !probe.hits.length) continue;

    // Separate Quran virtual hits from regular book hits
    const quranHits = probe.hits.filter(h => QURAN_IDS.has(h.bookId));
    const bookHits  = probe.hits.filter(h => !QURAN_IDS.has(h.bookId));

    // DF gate for bigrams: count only real books (exclude Quran virtual entries)
    if (kind === 'bigram' && bookHits.length > RARE_BIGRAM_DF_MAX) continue;

    const bookMatches = [];

    // Verify in regular books
    for (const hit of bookHits.slice(0, maxBooks)) {
      try {
        const snipR = await window.electron.bookContentSnippet(
          hit.bookId, phrase, perWordSnippets, 90
        );
        if (snipR && snipR.success && snipR.snippets && snipR.snippets.length) {
          bookMatches.push({ bookId: hit.bookId, snippets: snipR.snippets });
        }
      } catch (e) { /* skip */ }
    }

    // Verify in Quran ayas (if the 3-gram probe found Quran hits)
    if (quranHits.length > 0) {
      try {
        const qSnipR = await window.electron.quranContentSnippet(phrase, perWordSnippets, 90);
        if (qSnipR && qSnipR.success && qSnipR.snippets && qSnipR.snippets.length) {
          // Use a special bookId so the panel knows it's Quran
          bookMatches.push({
            bookId: -1,
            isQuran: true,
            snippets: qSnipR.snippets
          });
        }
      } catch (e) { /* skip */ }
    }

    if (bookMatches.length) matches.set(phrase, bookMatches);
  }
  return matches;
}
```

#### C8. Update `notes.js` `renderRefsPanel` to handle Quran results

In `renderRefsPanel()`, where the snippet card is built, detect `bm.isQuran` and render accordingly:

Find the line:
```js
const book = (window.S.books || []).find(b => b.id === bm.bookId);
const bookTitle = book ? book.title : `كىتاب #${bm.bookId}`;
```

Replace with:
```js
let bookTitle;
let isQuran = bm.isQuran || bm.bookId === -1 || bm.bookId === -2;
if (isQuran) {
  bookTitle = '📖 قۇرئان كەرىم';
} else {
  const book = (window.S.books || []).find(b => b.id === bm.bookId);
  bookTitle = book ? book.title : `كىتاب #${bm.bookId}`;
}
```

And for the action buttons, update the «كىتابقا بېرىش» button to navigate to the Quran reader when the source is Quran. Each Quran snippet has `sura` and `aya` metadata. Update the snippet loop to check:

```js
for (const sn of bm.snippets) {
  const snipHtml = String(sn.snip || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/§MARK_OPEN§/g, '<mark>')
    .replace(/§MARK_CLOSE§/g, '</mark>');
  const encSnip = encodeURIComponent(sn.snip || '');
  const itemId = `ref_${bm.bookId}_${(sn.pos|0)}_${i++}`;

  // Build "Go to" button: Quran → switch to Quran mode at sura:aya; Book → openReader
  let gotoBtn;
  if (isQuran && sn.sura && sn.aya) {
    gotoBtn = `<button class="notes-ref-act notes-ref-goto"
      onclick="window.notesGoToQuranAya(${sn.sura}, ${sn.aya})">📖 ئايەتكە بېرىش (${sn.sura}:${sn.aya})</button>`;
  } else {
    gotoBtn = `<button class="notes-ref-act notes-ref-goto"
      onclick="window.notesGoToBook(${bm.bookId}, '${encodeURIComponent(word)}')">📖 كىتابقا بېرىش</button>`;
  }

  html += `<div class="notes-ref-item" id="${itemId}">
    <div class="notes-ref-word">${escHtml(word)}</div>
    <div class="notes-ref-source">${isQuran ? '📖' : '📘'} ${escHtml(bookTitle)}</div>
    <div class="notes-ref-snippet" data-snip-id="${itemId}">${snipHtml}</div>
    <div class="notes-ref-actions">
      <button class="notes-ref-act notes-ref-expand" title="تولۇق ئابزاسنى كۆرۈش"
        onclick="window.notesToggleSnippet('${itemId}')">＋</button>
      ${gotoBtn}
      <button class="notes-ref-act notes-ref-insert"
        onclick="window.notesInsertRef(${bm.bookId}, '${encSnip}')">📝 قىستۇرۇش</button>
    </div>
  </div>`;
}
```

#### C9. Add `notesGoToQuranAya` function in `notes.js`

Near `notesGoToBook`, add:

```js
window.notesGoToQuranAya = async function (sura, aya) {
  // Save current note if dirty
  if (window.S && window.S.notes && window.S.notes.dirty && window.S.notes.curDoc) {
    try { await saveNow(); } catch(e) {}
  }
  // Switch to Quran mode and navigate to the aya
  if (typeof window.setMode === 'function') {
    window.setMode('quran');
  }
  // Use the Quran module's navigation if available
  if (typeof window.quranGoToAya === 'function') {
    window.quranGoToAya(sura, aya);
  } else {
    // Fallback: set the state and re-render
    if (window.S && window.S.quran) {
      window.S.quran.curSura = sura;
      window.S.quran.curAya = aya;
    }
    if (typeof window.renderQuranView === 'function') {
      window.renderQuranView();
    }
  }
};
```

Also check if `quran.js` exports a `quranGoToAya` function. If not, add one in `src/quran.js`:

```js
window.quranGoToAya = function(sura, aya) {
  if (!window.S || !window.S.quran) return;
  window.S.quran.curSura = sura;
  window.S.quran.curAya = aya;
  if (typeof renderQuranView === 'function') renderQuranView();
};
```

---

## Final verification — all 9 steps

Run `npm start`, then:

1. **DevTools console — zero errors at startup.** Check for `[ngram] indexed Quran ayas` in the terminal.
2. **Mode switching**: notes → كىتابلار → **books grid appears in center**. quran → كىتابلار → **books grid appears**. Any category click → filtered books show. ✓ (Bug A)
3. **Mode persistence**: notes → كىتابلار → notes → **editor shows previous note, cursor position may differ but content is there**. ✓
4. **Multi-phrase matching**: type 3+ lines in a note, each containing a different 3-word phrase from a book → **all phrases get underlined, not just the first one**. ✓ (Bug B + C)
5. **Quran Uyghur match**: type «مەقبۇل ئىسلام دىنىدۇر» (from Quran Uyghur translation) → **underlined**, right panel shows «📖 قۇرئان كەرىم» as source with sura:aya info. ✓ (Bug C)
6. **Quran Arabic match**: type an Arabic phrase from a Quran aya → **underlined if 3+ words appear verbatim in text_ar_simple**. ✓ (Bug C)
7. **ئايەتكە بېرىش button**: click it → app switches to Quran mode and navigates to that sura:aya. ✓ (Bug C)
8. **كىتابقا بېرىش button** for regular books: still works — opens reader with highlight. ✓
9. **Inserted-ref exclusion**: insert a Quran snippet → blockquote appears with «📘 نەقىل» label → **no self-referencing**. ✓ (previous fix preserved)

When all 9 pass, list changed files and stop.
