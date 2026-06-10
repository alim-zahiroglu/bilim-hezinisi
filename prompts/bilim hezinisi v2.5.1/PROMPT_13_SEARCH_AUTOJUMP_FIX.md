# PROMPT 13 — Make Global Search Result Click Auto-Jump to Match

**Paste everything below this line into Claude Code:**

---

## Context

In the «بىلىم خەزىنىسى» main library, when the user types in the top-right search box (e.g. «مەسؤال») and gets a result list with hit items like «مەنبە: 'مەسؤال' — بارلىق كىتابلار (6 نەتىجە)»:

- **Current behavior (bug):** Clicking a result item opens the source book to its **first page** (position 0). The match is NOT scrolled to. The user must then manually click the «↓» (down-arrow / "scroll to next match") button at the top-left of the reader for the highlight to actually become visible. This makes the search nearly unusable for long books because the user can't see where the match is.

- **Desired behavior:** Clicking a result item must (a) open the book, (b) scroll directly to the matched position, and (c) flash/highlight the match so the user sees it immediately. No manual «↓» press required.

The reader already has the underlying machinery — `openReader(id, hl)` accepts a highlight string, the «↓» button proves the highlight engine works. The bug is in the **wiring between the search-result click and the reader open call**: either the position is not being passed, or the post-load scroll-to-highlight is not firing on the initial open.

## Read first (do not modify yet)

1. `src/index.html` (or wherever the search-results renderer lives) — find the function that renders global search results (probably named something like `renderSearchResults`, `renderGlobalSearch`, or inside a `searchBooks`/`searchAll` flow). Paste the result-item HTML template (the line that creates each clickable hit row).

2. Find the click handler for those result items. Paste it. Specifically I want to see the call to `openReader` (or whichever function opens the reader) — what arguments are being passed?

3. Find the `openReader` function definition. Paste its **signature only** (`function openReader(id, hl, pos)` — whatever it is) plus the first ~20 lines of its body. We need to see whether it accepts a `pos` parameter, and whether it triggers a scroll-to-highlight on initial render.

4. Find the «↓» button handler — the one the user currently has to click manually. Paste its `onclick` handler / event listener. This tells us *how* scroll-to-next-highlight is implemented; we need to call the same code path automatically on initial open when a position is supplied.

5. Look at the search backend — find `bookContentSnippet` or `searchBooks` or whichever function returns the result list. Confirm it returns a `pos` (byte/char offset) field for each snippet. Paste one example result object so we know the field name (`pos`, `position`, `offset`, etc.).

After reading, **report back to me**:
- The exact function name + file that renders search-result rows
- The exact `onclick` (or addEventListener) wiring on a result row, verbatim
- The full signature of `openReader`
- The field name returned by the snippet API (`pos` vs `position` vs `offset`)
- Your one-line theory of why the click currently lands on page 1 instead of the match position
- Whether the «↓» button uses a global function (e.g. `gotoNextHighlight()`) or inline code we'd need to extract

Wait for my **"go"** before any code change.

## Likely root causes (one of these will match)

1. **Position not passed.** The result-item click calls `openReader(bookId, hl)` but omits `pos` (or passes `0`). Fix: pass the snippet's `pos` and have `openReader` honor it.
2. **Position passed but not honored.** `openReader` accepts `pos` but ignores it on first render — the scroll-to-highlight only fires when the user manually clicks «↓». Fix: invoke the same scroll-to-highlight code automatically once content has rendered.
3. **Race condition.** `openReader` triggers async content load (PDF page render, DOCX parse, etc.) and the scroll runs *before* content is in the DOM, so it has nothing to scroll to. Fix: defer the scroll to after the content-rendered event/promise.
4. **Highlight string mismatch.** `hl` is being passed but the reader's highlighter normalizes text (lowercase, strip punctuation) while the search did not, so `find` returns nothing. Fix: normalize once, in one place.

We'll know which one applies after step 1's report.

## Implementation plan (after I say go)

### Step 1 — Pick the correct fix branch

Based on your "Read first" report I'll tell you which of the four root causes above applies. The implementation differs slightly per cause; the rest of this prompt assumes the most likely cause: **position is passed but the scroll fires before content is rendered (race condition)**. If your report shows a different cause, I'll send a follow-up prompt.

### Step 2 — Centralize "open reader and jump to highlight" as one operation

In whichever file holds `openReader`, add (or refactor toward) a single canonical helper:

```javascript
/**
 * Open a book in the reader and, optionally, scroll/flash a specific match.
 * @param {number} bookId
 * @param {object} [target]
 *   @param {string} [target.hl]    Phrase to highlight (the search query)
 *   @param {number} [target.pos]   Character offset of the match in the book content
 *   @param {string} [target.snippet] Optional surrounding-text snippet for disambiguation
 *                                  (helps when the same `hl` appears multiple times — we scroll
 *                                   to the occurrence that best matches `snippet`)
 * @returns {Promise<void>}  Resolves after the match is in view.
 */
async function openReaderAt(bookId, target) {
  target = target || {};

  // Make sure we're in a mode where the reader UI is mounted
  if (typeof window.setMode === 'function' && window.S && window.S.mode !== 'library') {
    window.setMode('library');
  }

  // Stash the desired target on a module-scoped slot so the post-render hook can find it.
  // We use a slot rather than passing through the call chain because openReader is
  // already called from many places and we want one well-defined extension point.
  window.__pendingReaderJump = {
    bookId: bookId,
    hl: target.hl || '',
    pos: typeof target.pos === 'number' ? target.pos : null,
    snippet: target.snippet || '',
    requestedAt: Date.now(),
  };

  // Call the existing reader open (signature preserved). It will:
  //  1) start loading the book
  //  2) eventually fire the existing "content rendered" hook
  // We do NOT scroll here — the rendered-hook below will do that, once the DOM exists.
  if (typeof window.openReader === 'function') {
    window.openReader(bookId, target.hl || '');
  }
}

window.openReaderAt = openReaderAt;
```

### Step 3 — Hook the post-render scroll

Find the place where book content finishes rendering inside the reader. (Look for a function that runs **after** the book HTML is inserted into the reader pane — e.g. `renderBookContent`, `mountBook`, `onBookContentReady`, or the `.then(...)` chain of the loader.) At its **end**, add:

```javascript
// After content is fully in the DOM, honor any pending "jump-to-match" request.
// We use queueMicrotask + a rAF to give the browser a tick to layout the inserted nodes.
if (window.__pendingReaderJump && window.__pendingReaderJump.bookId === currentBookId) {
  const jump = window.__pendingReaderJump;
  window.__pendingReaderJump = null;     // single-use

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        if (jump.pos != null && jump.pos > 0) {
          // Path A: precise position-based scroll. Reuse the same code the «↓»
          // button uses — locate it in your "Read first" report and call it
          // here. Example placeholder:
          if (typeof window.readerScrollToPosition === 'function') {
            window.readerScrollToPosition(jump.pos, { flash: true, snippet: jump.snippet });
          } else if (typeof window.gotoNextHighlight === 'function') {
            // Fallback: use the «↓»-button code path
            window.gotoNextHighlight();
          }
        } else if (jump.hl) {
          // Path B: highlight-string-based scroll (no precise position known)
          if (typeof window.gotoNextHighlight === 'function') {
            window.gotoNextHighlight();
          }
        }
      } catch (e) {
        console.warn('[reader] jump-to-match failed:', e);
      }
    });
  });
}
```

**You must replace** `window.readerScrollToPosition` and `window.gotoNextHighlight` with the **actual** function names you find in steps 4 of the "Read first" stage. Do not invent new function names — reuse the existing «↓»-button machinery. The whole point of this fix is *the engine already works; we just need to fire it automatically*.

### Step 4 — Wire the search-result click to pass position + snippet

Find the search-result-row click handler (step 1 of "Read first"). Currently it probably looks like:

```javascript
onclick="openReader(${bookId}, '${escAttr(hl)}')"
```

Change it to pass position + snippet:

```javascript
onclick="window.openReaderAt(${bookId}, { hl: '${escAttr(hl)}', pos: ${pos|0}, snippet: '${escAttr(snippetText)}' })"
```

Where:
- `bookId`, `hl` — same as before
- `pos` — comes from the search-result object (whatever field you confirmed in step 5 of "Read first": `pos`, `position`, or `offset`)
- `snippetText` — the surrounding text the search returned for this hit; used to disambiguate when the same phrase appears multiple times in one book

If the search-result render uses `addEventListener` instead of inline `onclick`, do the equivalent change in JavaScript:

```javascript
row.addEventListener('click', () => {
  window.openReaderAt(bookId, { hl, pos: hit.pos | 0, snippet: hit.snip || '' });
});
```

### Step 5 — Make sure other call sites of `openReader` aren't broken

Grep the codebase for `openReader(` to find every existing call site. None of them should break — `openReader` itself is unchanged. The only callers we *upgrade* to `openReaderAt` are:
- The global search results (this fix's primary target)
- Optional: the Notes module's «📖 كىتابقا بېرىش» button (it currently calls `openReader(bookId, highlight)` — switching it to `openReaderAt(bookId, { hl: highlight, pos: snippetPos })` would also benefit it, **but only if** the Notes ref-panel actually has a `pos` to pass. If it does, upgrade it. If not, leave it alone.)

Paste a list of every call site of `openReader` you found, mark which ones you upgraded and which ones you left alone, and explain why.

### Step 6 — Visual flash on arrival

When the user lands on a match, the existing highlighter probably colors the match permanently (until the next «↓» press). Improve UX: add a **brief flash** (1.5s yellow pulse) so the eye catches it immediately. In the reader's CSS file, add:

```css
@keyframes readerHitFlash {
  0%   { background: var(--accent, #c4a45a); color: #fff; }
  60%  { background: var(--accent, #c4a45a); color: #fff; }
  100% { background: transparent; color: inherit; }
}
.reader-hit-flash {
  animation: readerHitFlash 1.5s ease-out 1;
  border-radius: 3px;
  padding: 0 2px;
}
```

In the scroll-to-position code (the post-render hook from step 3), after locating the target node, add the class then remove it after the animation:

```javascript
function flashHit(node) {
  if (!node) return;
  node.classList.add('reader-hit-flash');
  setTimeout(() => { node.classList.remove('reader-hit-flash'); }, 1600);
}
```

Match the project's existing CSS variable names — if `--accent` doesn't exist, use whatever the project uses for the highlight color (it's the same color as the «↓» highlight already applies). Don't invent new variables.

### Step 7 — Handle "no-pos" gracefully

Some snippet results might not have a `pos` value (older indices, edge cases). When `pos == null`, the post-render hook falls back to `gotoNextHighlight()` — i.e. the user lands on the **first** occurrence of `hl` in the book, which is the same behavior as today's «↓» button. Confirm this fallback works by manually testing a result row that has no `pos`.

### Step 8 — Test

```bash
npm start
```

1. Open the library, type **«مەسؤال»** (or any word the user reported) in the global search box.
2. The result list appears. Click the result item «مەنبە: 'مەسؤال' — بارلىق كىتابلار (6 نەتىجە)» — or whichever the report case shows.
3. **Expected:** book opens, page scrolls directly to the match, the match flashes briefly, and the «↓» button **was not pressed manually**.
4. Press «↓» — should now jump to the *second* occurrence (existing behavior preserved).
5. Press «↑» — should jump back to the first occurrence.
6. Open another book result. Verify each book lands at its own match.
7. Try a search where the term appears in a long PDF book — confirm scroll lands within the visible viewport, not just "page 1 with a tiny highlighted dot below the fold".
8. Try a search where the term appears multiple times in the same book — confirm we land on the occurrence corresponding to the **clicked** result, not always the first.
9. Test the Notes «📖 كىتابقا بېرىش» button (if you upgraded it in step 5) — should also auto-jump.

### Step 9 — Console sanity

Open DevTools console. There should be **no** new warnings or errors from the changes. Specifically watch for:
- `Cannot read property of null` (means `__pendingReaderJump` slot management is wrong)
- `gotoNextHighlight is not a function` (means you used a placeholder name and didn't replace it with the real one)

If you see either, the prompt was applied incompletely — stop and fix.

### Step 10 — Commit

```bash
git add -A
git status
git commit -m "fix(reader): auto-jump to match position on global-search result click"
```

### Step 11 — Final report

- ✅ `openReaderAt` helper added (file: …)
- ✅ Post-render hook in reader content-load path scrolls + flashes the match
- ✅ Search-result click upgraded to call `openReaderAt` with `pos` + `snippet`
- ✅ Notes «📖 كىتابقا بېرىش» upgraded? (yes/no — and why)
- ✅ Existing «↓» / «↑» buttons still work (test result: …)
- ✅ Same-term-multiple-occurrences case lands on the *clicked* occurrence (test result: …)
- ✅ No new console errors/warnings
- ✅ Git commit hash: …
- ✅ Test cases that passed (paste short summary of items 1–9)

Then say: **"Search-result auto-jump fix complete."**

If at any step the actual code doesn't match the assumptions in this prompt (e.g. `openReader` is structured differently than expected, or the «↓» button's logic isn't extractable), STOP after step 1 and report what you found before making any change. We may need a different approach.
