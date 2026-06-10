# Claude Code Fix Prompt — Bilim Hezinisi 2.4.2 (revised)

You are working on **Bilim Hezinisi**, an Electron + sql.js Uyghur digital library app. The codebase is already built; we are fixing four specific defects that have been verified by source-reading and a screenshot. Do NOT redesign anything that is not listed below. UI strings stay in Uyghur; code/identifiers/comments stay in English.

Project layout (relevant files):
```
main.js
preload.js
database.js
src/
  index.html      ← top-level UI, mode tabs, sidebar, library view
  notes.js        ← notes editor + reference scanning
  notes.css
  ngram.js        ← candidate-word extractor + DB lookup orchestrator
  quran.js / quran.css
```

Read each file in full before editing. After all four fixes, run `npm start` and confirm there are no console errors.

---

## BUG 1 — Switching modes is broken

### Symptom
The user is in **خاتىرە دەپتىرىم** (`S.mode === 'notes'`) or **قۇرئان كەرىم** (`S.mode === 'quran'`). They click a category in the **تۈرلەر** list (e.g. «قۇرئان ۋە تەپسىر»). Nothing happens. The only way to get back to the library category is to fully close and reopen the app.

### Root cause (verified)
1. In `src/index.html` the mode-tabs are rendered inside `renderSide()` BEFORE the `if (S.mode === 'library')` branch — so the tabs are visible in every mode. Good. But the **categories list (`<div class="ci">`) is only rendered inside the `library` branch.** When the user is in `notes`/`quran` mode they cannot see the categories anyway — *unless they expanded them earlier and the previously-rendered DOM is still on screen because `renderSide()` is being called but failing midway*. Confirm by reading `renderSide()` around line 743–782.
2. `setCat(c)` (line 888 in `src/index.html`) does:
   ```js
   document.getElementById('si').value=''
   document.getElementById('clr').style.display='none'
   document.getElementById('si').placeholder = ...
   ```
   In non-library modes the search bar `#hd` is hidden via `display:none` (set by `setMode`). The element nodes still exist, so those lines do not throw — meaning `setCat` runs to completion **but it never sets `S.mode = 'library'`.** Consequently `renderSide()` is invoked while `S.mode` is still `'notes'`/`'quran'`, the sidebar re-renders the *notes/quran* sidebar, and the user sees no change.
3. There is also no defensive null-check: if `#si` or `#clr` is ever absent the function would throw and `renderSide()` would never run.

### Fix (in `src/index.html`)

**Change `setCat`** so that:
- It first switches to library mode if needed (re-using the existing `setMode` logic so the top search bar is shown again and the books grid is rendered).
- It guards every `getElementById` call.
- After mode switching it still applies the category filter and re-renders.

Replace the entire one-liner `setCat` (around line 888) with:

```js
function setCat(c) {
  // Always force library mode first — categories only make sense there.
  // This also restores the top search bar (#hd) and re-renders the books grid.
  if (S.mode !== 'library') {
    S.mode = 'library';
    const hd = document.getElementById('hd');
    if (hd) hd.style.display = 'flex';
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

Do NOT touch the existing `setMode()` function. Do NOT change `renderSide()`’s structure — the sidebar already correctly renders mode-tabs above the per-mode content.

### Verification
1. Start in `library` → open «خاتىرە دەپتىرىم» → click «📚 كىتابلار» tab → library returns. ✓
2. Start in `library` → open «خاتىرە دەپتىرىم» → **click «قۇرئان كەرىم» mode tab** → quran view. ✓
3. **Open DevTools console**. Open «خاتىرە دەپتىرىم». Then call `setCat('قۇرئان ۋە تەپسىر')` directly from console. Sidebar must switch back to library mode AND filter to that category.
4. No JS errors at any step.

---

## BUG 2 — Reference matcher must be **adaptive (3-gram + rare bigram)**, not 1-word

### Symptom
While typing in the notes editor, any single word that exists in any book is underlined as a reference. The user originally asked for **two-word matching** but, on reflection, realized that two-word phrases like «بۇ كىتاب» / «شۇ ئادەم» occur in dozens of books and would still flood the editor with noise. The user now asks for **three consecutive matching words**, OR a smarter alternative if one exists.

### Design — adaptive matcher (recommended; what we implement)

A pure 3-word rule is **too strict**: the user must literally copy a verbatim 3-word run from a book to get a hit. A pure 2-word rule is **too noisy**: common pairs flood the panel. The right answer is **adaptive**, the same trick classic IR systems (TF-IDF, BM25) use: emit a phrase as a candidate when it is *distinctive enough* to be worth matching.

Concretely we use these rules in priority order:

1. **Trigram (3 consecutive content words)** is **always** a candidate. Three real words in a row is rare enough that any verbatim 3-run match in a book is meaningful.
2. **Bigram (2 consecutive content words)** is a candidate **only if it is rare** — meaning the cheap document-frequency probe says it appears in **≤ 3 distinct books**. This catches distinctive pairs like «ئاتومنىڭ تۈزۈلۈشى» while suppressing common pairs like «بۇ كىتاب».
3. **Single word** is **never** a candidate. (This kills the original noise problem.)

The implementation reuses the existing 3-gram DB index (`book_ngrams`) for the cheap DF probe — no schema changes, no extra DB columns, no extra startup cost. We probe with the FIRST word's first 3 chars; the count of distinct books returned is our DF estimate. Verification of the actual phrase is still a real substring search via `bookContentSnippet`, so precision stays exact.

### Implementation — replace the whole body of `src/ngram.js`

Keep the same `STOP_PHRASES` and `STOP_WORDS` lists unchanged. Replace the **logic** as follows:

```js
// Adaptive reference matcher.
//
// A "candidate phrase" is one of:
//   • a trigram (3 consecutive content words)        — always emitted
//   • a rare bigram (2 consecutive content words)    — emitted only when the
//                                                      cheap DF probe says
//                                                      ≤ RARE_BIGRAM_DF_MAX
//                                                      books contain the
//                                                      first word's 3-gram
//
// Single words are never emitted. Stop-words and stop-phrases create gaps
// in the token stream so phrases never bridge across them.
(function () {
  'use strict';

  const STOP_PHRASES = [
    'ئاللاھ تائالا مۇنداق دەيدۇ',
    'ئاللاھ تائالا مۇنداق دېگەن',
    'پەيغەمبەر ئەلەيھىسسالام مۇنداق دېگەن',
    'پەيغەمبەر ئەلەيھىسسالام مۇنداق دەيدۇ',
    'رەسۇلۇللاھ سەللاللاھۇ ئەلەيھى ۋەسەللەم',
    'رەزىيەللاھۇ ئەنھۇ'
  ];
  const STOP_WORDS = new Set([
    'ئاللاھ','تائالا','مۇنداق','دەيدۇ','دېگەن','دېدى','دەپ',
    'پەيغەمبەر','ئەلەيھىسسالام',
    'رەسۇلۇللاھ','سەللاللاھۇ','ئەلەيھى','ۋەسەللەم',
    'رەزىيەللاھۇ','ئەنھۇ','ئەنھا','ئەنھۇما',
    'بولىدۇ','بولدى','بولسۇن','قىلدى','قىلىنىدۇ','دېيىلگەن','كەلدى',
    'بۇنىڭ','شۇنىڭ','بۇنىڭدىن','شۇنداقلا','ئۇنىڭدىن','مۇشۇنداق',
    'دېگەنلىك','دېگۈچى','يەنى','بارچە','ھەممە','كۆپىنچە'
  ]);

  const MIN_WORD_LEN       = 4;   // each token must be ≥4 chars to count
  const MAX_CANDIDATES     = 60;  // cap distinct phrases per scan
  const MAX_BOOKS_PER_PHR  = 8;   // cap books to verify per phrase
  const RARE_BIGRAM_DF_MAX = 3;   // bigram is "rare" if ≤ this many books contain its 3-gram probe

  function stripStopPhrases(text) {
    let out = String(text || '');
    for (const phrase of STOP_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'g'), m => ' '.repeat(m.length));
    }
    return out;
  }

  /**
   * Returns an ordered list of usable tokens. Filtered tokens (too short,
   * stop-word, redacted region) become `null` so phrases never bridge across
   * them. This is what makes "ئاللاھ تائالا" act as a hard barrier even when
   * its individual words are filtered.
   */
  function tokenize(text) {
    const cleaned = stripStopPhrases(text);
    const tokens = [];
    const re = /[\p{L}\p{M}\p{N}]+/gu;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      const w = m[0];
      tokens.push(
        (w.length < MIN_WORD_LEN || STOP_WORDS.has(w)) ? null : w
      );
    }
    return tokens;
  }

  /**
   * Build candidate phrases. Returns an array of {phrase, kind} where
   * kind is 'trigram' or 'bigram'. Trigrams are emitted unconditionally;
   * bigrams will be filtered later (during DF probe) to keep only rare ones.
   *
   * Producer logic:
   *   for each window i: tokens[i], tokens[i+1], tokens[i+2]
   *     if all three are non-null → emit trigram "a b c"
   *     else if first two are non-null → emit candidate bigram "a b"
   *
   * Both kinds are deduped against each other (a trigram supersedes its
   * leading bigram so we don't double-show the same region).
   */
  function extractCandidates(text) {
    const tokens = tokenize(text);
    const seenTri = new Set();
    const seenBi  = new Set();
    const triPrefixes = new Set();   // bigrams that are a trigram's prefix → suppress
    const out = [];

    // First pass: collect trigrams.
    for (let i = 0; i + 2 < tokens.length; i++) {
      const a = tokens[i], b = tokens[i + 1], c = tokens[i + 2];
      if (!a || !b || !c) continue;
      const tri = a + ' ' + b + ' ' + c;
      if (seenTri.has(tri)) continue;
      seenTri.add(tri);
      triPrefixes.add(a + ' ' + b);
      out.push({ phrase: tri, kind: 'trigram' });
      if (out.length >= MAX_CANDIDATES) return out;
    }

    // Second pass: collect bigrams that are NOT already covered by a trigram.
    // These will be filtered by DF probe later — only rare ones survive.
    for (let i = 0; i + 1 < tokens.length; i++) {
      const a = tokens[i], b = tokens[i + 1];
      if (!a || !b) continue;
      const bi = a + ' ' + b;
      if (triPrefixes.has(bi)) continue;
      if (seenBi.has(bi)) continue;
      seenBi.add(bi);
      out.push({ phrase: bi, kind: 'bigram' });
      if (out.length >= MAX_CANDIDATES) return out;
    }

    return out;
  }

  /**
   * For each candidate, probe the 3-gram index with the first word's first
   * 3 chars. The number of distinct books returned is our DF estimate.
   *
   *   • Trigrams: always proceed to the substring verification step.
   *   • Bigrams:  proceed ONLY if DF ≤ RARE_BIGRAM_DF_MAX. Otherwise drop.
   *
   * Then verify each candidate book by substring-searching for the EXACT
   * phrase via bookContentSnippet (which already lower-cases both sides).
   *
   * Returns Map<phrase, Array<{bookId, snippets:[{snip,pos}]}>>.
   */
  async function findReferences(candidates, opts) {
    opts = opts || {};
    const perWordSnippets = opts.perWordSnippets || 3;
    const maxBooks = opts.maxBooks || MAX_BOOKS_PER_PHR;
    const matches = new Map();

    for (let i = 0; i < candidates.length; i++) {
      const { phrase, kind } = candidates[i];
      if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 0));

      const firstWord = phrase.split(' ')[0];
      let probe;
      try { probe = await window.electron.ngramFindWord(firstWord); }
      catch (e) { continue; }
      if (!probe || !probe.success || !probe.hits || !probe.hits.length) continue;

      // DF gate for bigrams: drop common bigrams entirely.
      if (kind === 'bigram' && probe.hits.length > RARE_BIGRAM_DF_MAX) continue;

      const bookMatches = [];
      for (const hit of probe.hits.slice(0, maxBooks)) {
        try {
          const snipR = await window.electron.bookContentSnippet(
            hit.bookId, phrase, perWordSnippets, 90
          );
          if (snipR && snipR.success && snipR.snippets && snipR.snippets.length) {
            bookMatches.push({ bookId: hit.bookId, snippets: snipR.snippets });
          }
        } catch (e) { /* skip this book */ }
      }
      if (bookMatches.length) matches.set(phrase, bookMatches);
    }
    return matches;
  }

  window.NGram = {
    extractCandidates,
    findReferences,
    STOP_PHRASES, STOP_WORDS, MIN_WORD_LEN, RARE_BIGRAM_DF_MAX
  };
})();
```

### Side-effect on `src/notes.js` — wrap-as-phrase in the editor

`wrapRefMatchesInEditor()` currently iterates each match-key and uses `txt.indexOf(w)` to wrap individual word matches. Now the keys are multi-word strings (with one or two spaces), and the editor's text node `nodeValue` contains real spaces, so `indexOf("جىمى ھەمدۇ سانا")` will find them correctly **only when the words happen to land in a single text node**. They usually do, because contenteditable typically stores plain typed text in one text node per inline run. For caret-edit edge cases where a phrase straddles multiple text nodes (rare during fast edits), the wrap simply skips it on this pass and picks it up on the next debounced scan.

**One change is required:** the `MIN_WORD_LEN` check
```js
if (!n.nodeValue || n.nodeValue.length < window.NGram.MIN_WORD_LEN) continue;
```
is now too restrictive (we want nodes that can hold at least a bigram, ≈9 chars, but ideally a trigram, ≈14 chars; using bigram-length is the safe lower bound). Change it to:

```js
if (!n.nodeValue || n.nodeValue.length < window.NGram.MIN_WORD_LEN * 2 + 1) continue;
```

Everything else in the wrap function is correct as-is — `indexOf` finds the multi-word string just like a single word, and the existing overlap-resolution sort already prefers the longer span when a trigram and a bigram share a left edge (which is also why `extractCandidates` suppresses bigrams that are a trigram's prefix — defense in depth).

### Verification
1. Open a note. Type **a single word** that appears in many books (e.g. «ئاسمان») — **no underline**. ✓
2. Type **a common 2-word phrase** (e.g. «بۇ كىتاب», «شۇ ئادەم») that appears in dozens of books — **no underline** (DF gate drops it). ✓
3. Type **a rare 2-word phrase** (e.g. «ئاتومنىڭ تۈزۈلۈشى» if it exists in only 1–2 books) — **underline appears**. ✓
4. Type **any 3-word run** that exists verbatim in some book (e.g. «جىمى ھەمدۇ سانا») — **underline appears across all three words as one span**. ✓
5. Click an underlined span → right-panel shows snippets only from books containing that exact phrase (substring-verified, not 3-gram probabilistic). ✓
6. Add a stop-phrase like «ئاللاھ تائالا مۇنداق دەيدۇ» mid-sentence — phrases inside it are never emitted (gap-token rule). ✓

### Tunability note for the user
If after living with the app the user feels matches are still too few or too many, the only knob to turn is `RARE_BIGRAM_DF_MAX` in `src/ngram.js` (default 3). Raise it to allow more bigrams; lower it to be even stricter. No other change is needed.

---

## BUG 3 — Right-panel snippet card needs an Expand (+) and a “Go to Book” action

### Symptom
The snippet preview is clipped to 90 px. The user wants to:
1. Click a **«+»** button to expand the snippet to show the surrounding paragraph (or the full snippet without the height clip).
2. Click a **«كىتابقا بېرىش»** button to open the book reader directly at that snippet, with the phrase highlighted.

### Implementation — `src/notes.js`

In `renderRefsPanel()`, the current per-snippet HTML is:

```js
html += `<div class="notes-ref-item">
  <div class="notes-ref-word">${escHtml(word)}</div>
  <div class="notes-ref-source">📘 ${escHtml(bookTitle)}</div>
  <div class="notes-ref-snippet">${snipHtml}</div>
  <button class="notes-ref-insert" onclick="window.notesInsertRef(${bm.bookId}, '${encSnip}')">📝 قىستۇرۇش</button>
</div>`;
```

Replace it with the version below. Note the use of stable item IDs and a small actions row. **Do not introduce `localStorage`** — keep state on `window.S.notes`.

```js
const itemId = `ref_${bm.bookId}_${(sn.pos|0)}_${i++}`; // i declared once before the loops below
html += `<div class="notes-ref-item" id="${itemId}">
  <div class="notes-ref-word">${escHtml(word)}</div>
  <div class="notes-ref-source">📘 ${escHtml(bookTitle)}</div>
  <div class="notes-ref-snippet" data-snip-id="${itemId}">${snipHtml}</div>
  <div class="notes-ref-actions">
    <button class="notes-ref-act notes-ref-expand" title="تولۇق ئابزاسنى كۆرۈش"
      onclick="window.notesToggleSnippet('${itemId}')">＋</button>
    <button class="notes-ref-act notes-ref-goto"
      onclick="window.notesGoToBook(${bm.bookId}, '${encodeURIComponent(word)}')">📖 كىتابقا بېرىش</button>
    <button class="notes-ref-act notes-ref-insert"
      onclick="window.notesInsertRef(${bm.bookId}, '${encSnip}')">📝 قىستۇرۇش</button>
  </div>
</div>`;
```

Declare the counter before the outer `for` loops in `renderRefsPanel`:
```js
let i = 0;
let html = header;
```

Add the two new window functions inside the same IIFE (near `notesInsertRef`):

```js
window.notesToggleSnippet = function (itemId) {
  const el = document.querySelector(`.notes-ref-snippet[data-snip-id="${itemId}"]`);
  if (!el) return;
  const expanded = el.classList.toggle('expanded');
  const btn = document.querySelector(`#${itemId} .notes-ref-expand`);
  if (btn) btn.textContent = expanded ? '－' : '＋';
};

window.notesGoToBook = async function (bookId, encodedHighlight) {
  if (window.S && window.S.notes && window.S.notes.dirty && window.S.notes.curDoc) {
    try { await saveNow(); } catch(e) {}
  }
  // Use the existing reader — `openReader(id, hl)` accepts a highlight string.
  let highlight = '';
  try { highlight = decodeURIComponent(encodedHighlight || ''); } catch(e) {}
  if (typeof window.openReader === 'function') {
    // Switch back to library mode first so the reader UI is mounted.
    if (typeof window.setMode === 'function' && window.S.mode !== 'library') {
      window.setMode('library');
    }
    window.openReader(bookId, highlight);
  }
};
```

### CSS — append to `src/notes.css`

```css
.notes-ref-actions {
  display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;
}
.notes-ref-act {
  flex: 1 1 auto; min-width: 0;
  background: var(--bg2); color: var(--text2);
  border: 0.5px solid var(--border); border-radius: var(--radius2);
  padding: 4px 8px; font-size: 11px; cursor: pointer;
  font-family: var(--jf); transition: background .12s, color .12s;
  white-space: nowrap;
}
.notes-ref-act:hover { background: var(--ab); color: var(--at); border-color: var(--am); }
.notes-ref-expand {
  flex: 0 0 28px; font-weight: 700; font-size: 14px;
}
.notes-ref-insert { background: var(--am); color: #fff; border-color: var(--am); }
.notes-ref-insert:hover { opacity: 0.9; background: var(--am); color: #fff; }

.notes-ref-snippet.expanded {
  max-height: none;
  background: var(--bg2);
  padding: 8px;
  border-radius: var(--radius2);
}
```

Remove or override the original `.notes-ref-insert` block in the same file so the new one wins (or merge: leave one definition).

### Verification
1. Type a phrase that triggers a match → right panel shows snippet card.
2. Click **«＋»** → snippet expands to full height, button shows «－». Click again → collapses.
3. Click **«📖 كىتابقا بېرىش»** → app switches to library/reader, opens that book, the phrase is highlighted (the existing reader’s `hl` param drives the in-book search highlight).
4. **«📝 قىستۇرۇش»** still works as before (subject to Bug 4 fix).

---

## BUG 4 — Inserted quotes feed back into the reference scanner (infinite self-reference)

### Symptom (this is the user's **most important** complaint)
When the user clicks **«قىستۇرۇش»**, the snippet from a book is inserted into the editor as a `<blockquote>`. Immediately after insertion, **almost every word inside that blockquote is underlined as a reference** (see screenshot). This destroys the editor's character because the user’s own text is no longer the focus — the inserted quote pollutes scanning.

### Root cause (verified)
`runScan()` uses `editorEl.innerText`, which includes ALL text including inserted blockquotes. The scanner has no concept of "this region was pulled from a book — exclude it". So every phrase inside the inserted quote re-matches its source book (and others).

### Design principle for the fix
The user's intent: the notes editor is for **the user's own writing**. Inserted quotes are reference material that must be **scan-excluded** — they remain visible (and copyable) but the phrase scanner treats them as if they were not there.

### Fix — three coordinated changes

#### 4a. Mark inserted blockquotes with `data-ref-insert="1"` and a CSS class

In `src/notes.js` → `notesInsertRef()` (around line 709), change:

```js
const insertHtml = `<blockquote dir="rtl">` +
  `<span>${escHtml(snip)}</span>` +
  (bookTitle ? `<br><span style="font-size:0.85em;color:#888">— ${escHtml(bookTitle)}</span>` : '') +
`</blockquote><p><br></p>`;
```

to:

```js
const insertHtml = `<blockquote class="notes-inserted-ref" data-ref-insert="1" dir="rtl" contenteditable="true">` +
  `<span>${escHtml(snip)}</span>` +
  (bookTitle ? `<br><span style="font-size:0.85em;color:#888">— ${escHtml(bookTitle)}</span>` : '') +
`</blockquote><p><br></p>`;
```

(`contenteditable="true"` is kept so the user can still delete the block; the scan-skip is what changes its behaviour, not its editability.)

#### 4b. Strip inserted-quote regions before tokenizing

In `src/notes.js` → `runScan()` (around line 477), the current code does:

```js
const text = editorEl.innerText || '';
```

Replace it with a helper that clones the editor, removes nodes flagged as inserted refs, and reads the plain text from the clone:

```js
function getScannableText() {
  if (!editorEl) return '';
  const clone = editorEl.cloneNode(true);
  // Drop any inserted-reference blockquotes — they shouldn't feed the scanner.
  clone.querySelectorAll('[data-ref-insert="1"], .notes-inserted-ref').forEach(n => n.remove());
  return clone.innerText || '';
}
```

Then in `runScan` use `const text = getScannableText();` instead.

#### 4c. Skip inserted-ref nodes during the wrap pass

In `wrapRefMatchesInEditor()` the text-node walker collects every text node. Add a skip for nodes inside an inserted quote:

```js
while ((n = walker.nextNode())) {
  if (n.parentElement && n.parentElement.closest('.ref-match')) continue;
  // NEW: never wrap text inside an inserted reference blockquote
  if (n.parentElement && n.parentElement.closest('[data-ref-insert="1"]')) continue;
  if (!n.nodeValue || n.nodeValue.length < window.NGram.MIN_WORD_LEN * 2 + 1) continue;
  textNodes.push(n);
}
```

#### 4d. Style the inserted blockquote so it is visually distinct

Append to `src/notes.css`:

```css
.notes-editor blockquote.notes-inserted-ref {
  border-right: 3px solid var(--am);
  background: var(--bg2);
  padding: 8px 12px;
  margin: 8px 0;
  border-radius: var(--radius2);
  color: var(--text2);
  /* Visual cue: this region is OUTSIDE the user's own text for scan purposes */
}
.notes-editor blockquote.notes-inserted-ref::before {
  content: "📘 نەقىل";
  display: block;
  font-size: 10px;
  color: var(--text3);
  margin-bottom: 4px;
  font-family: sans-serif;
  letter-spacing: 0.3px;
}
```

### Verification (run all four)
1. Open a note. Type some text that triggers two or three phrase matches. Confirm the underlines appear.
2. Click **«📝 قىستۇرۇش»** for one of the snippets. The quote appears as a styled blockquote with a «📘 نەقىل» label and a colored border.
3. **No word inside that blockquote becomes underlined** — including phrases that match other books.
4. Continue typing in the user’s own paragraph: phrase detection still works there.
5. Save the note (Ctrl+S), close the app, reopen, open the note — the inserted blockquote is preserved with its `data-ref-insert="1"` attribute, and on next scan it stays scan-excluded.
6. The right-panel reference list does NOT change just because of an insertion. (Previously each insert spawned new matches; that flow is now eliminated.)

---

## Final checks before declaring done

Run `npm start`, then:

1. **DevTools console — zero errors at startup.**
2. Mode tabs: switch library ↔ quran ↔ notes freely. Click any category from any mode → returns to library with that category filtered. (Bug 1)
3. In notes:
   - Type a single common word → no underline.
   - Type a common 2-word phrase like «بۇ كىتاب» → no underline (rare-bigram gate).
   - Type a rare 2-word phrase that only appears in 1–2 books → underline.
   - Type any verbatim 3-word run from a book → underline. (Bug 2)
4. Click an underlined phrase → right panel populates. Each card has «＋» / «كىتابقا بېرىش» / «قىستۇرۇش». (Bug 3)
5. Click «＋» → snippet expands, click again → collapses.
6. Click «كىتابقا بېرىش» → reader opens to that book with the phrase highlighted.
7. Click «قىستۇرۇش» → blockquote appears in editor with «📘 نەقىل» label, colored border. **No word inside it becomes a reference match.** (Bug 4)
8. Continue typing in user’s own paragraph below the blockquote → matching still works for the user’s text only.
9. Close and reopen the app — every change persists, including the inserted blockquote’s `data-ref-insert="1"` attribute.

When all 9 pass, summarize the changes in `### Changed files` format and stop.
