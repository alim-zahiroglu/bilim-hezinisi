# Bilim Hezinisi — Fix two bugs: (A) API key auto-switch on "model busy", (B) Format Painter background color

App = **Electron 28 + plain JavaScript**, no build/transpile. Read `CLAUDE.md` first, then locate the exact code and make a short plan.

**Constraints (must follow):** preserve **CRLF**; `node --check` must pass on every changed `.js` and on the inline `<script>` blocks of `src/index.html`; RTL Uyghur UI; **do NOT touch** the renderer CSP / security model; English code & comments, Uyghur only for UI strings; after each part test with `npm start` and make a **separate commit**.

---

## Part A — Auto-switch the API key on "model busy" (HTTP 503), not only on quota (HTTP 429)

**File:** `ai.js`

**Problem.** The automatic backup-key failover currently advances to the next key ONLY on HTTP **429** (quota / rate-limit). But the Gemini free tier's most common "بۇ مودېل بەك ئالدىراش" error is HTTP **503** (model overloaded). On 503 the code does NOT switch keys — it just shows the busy message — so from the user's side the auto-switch "does not work." A backup key from a *different* Google Cloud project frequently DOES get through on 503, so we must fail over on 503/5xx as well.

**Goal.** Treat both **429** and **503 / 5xx "server busy"** as "try the next key." Keep STRICT model selection (only the key changes, never the model). The busy/quota message must fire ONLY after every key has failed.

Make these three edits (search for the exact lines):

1. In `callGemini(model, key, body, opts)`, the retryable branch has:
   ```js
   if (resp.status === 429 && opts.quotaFastFail) break;
   ```
   Replace with (a non-last key also fails fast on 5xx so we move on quickly instead of spending the whole backoff):
   ```js
   if (opts.quotaFastFail && (resp.status === 429 || (resp.status >= 500 && resp.status < 600))) break;
   ```

2. In `callGeminiFailover(model, body)`, the advance condition:
   ```js
   if (isQuotaError(e) && !isLast) {
   ```
   Replace with:
   ```js
   if ((isQuotaError(e) || isServerBusyError(e)) && !isLast) {
   ```

3. In `askStream(...)`, inside the per-key streaming loop, the HTTP-error branch has:
   ```js
   if (resp.status === 429 && !isLastKey) continue;
   ```
   Replace with:
   ```js
   if ((resp.status === 429 || (resp.status >= 500 && resp.status < 600)) && !isLastKey) continue;
   ```

Leave `SERVER_BUSY_MESSAGE` and `QUOTA_ALL_MSG` unchanged — they still appear only after ALL keys fail. `chatStream`, `translateStream`, and `ocrImages` already route their non-stream fallback through `callGeminiFailover`, so they inherit this fix automatically. (Optionally reword the failover `console.warn` from "quota-limited" to "busy/quota-limited".)

**Acceptance.** When the primary key is busy (429 OR 503) and a backup key works, the answer comes from the backup automatically, with no error shown. DevTools console shows `[ai] STREAM … (key #2)`. The busy/"switch key" message appears only when EVERY key is busy.

---

## Part B — Format Painter must reliably copy the text BACKGROUND (highlight) color

**File:** `src/notes.js` — `fpCaptureFormat` (~line 861), `fpApplyFormat` (~line 917), helper `fpIsTransparent` (~line 855), `selectedBlocks` (~line 898).

**Problem.** The painter already runs `styleWithCSS` + `hiliteColor`, yet the highlight/background still doesn't transfer. Two root causes:
- **Capture:** `fpCaptureFormat` reads `getComputedStyle(anchorEl).backgroundColor`. Depending on where the selection starts, the anchor can be the paragraph (transparent) instead of the highlighted `<span>`, so it captures `rgba(0,0,0,0)` and the paste skips the background.
- **Apply:** the long sequence of `execCommand` calls (`foreColor`/`hiliteColor` mixed with `formatBlock`, justify, etc.) is unreliable in this contentEditable — the highlight is the piece that drops.

**Definitive fix:**

1. **Robust capture** in `fpCaptureFormat`: after resolving the anchor element, walk UP the ancestors (stop at the editor root) and use the FIRST **non-transparent** `background-color` as the captured `background` (so a highlighted span/ancestor is picked up even when the selection starts at a text boundary). Read `color`, font-family, font-size, weight, style, and text-decoration from the anchor element. Keep the existing block-level metrics (lineHeight, textIndent, margins, align, blockquote).

2. **Deterministic apply** in `fpApplyFormat`: do NOT use `foreColor`/`hiliteColor` anymore. Capture the target blocks and the selected text FIRST (before the DOM changes), then wrap the selected text in ONE inline-styled span inserted via `insertHTML` (this is undoable via Ctrl+Z AND guarantees the background sticks). Replace the inline-formatting portion of the function with:
   ```js
   const blocks = selectedBlocks();            // capture BEFORE insertHTML collapses the selection
   const text = sel.toString();
   if (!text) return;
   const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   const st = [];
   if (f.fontFamily) st.push("font-family:'" + f.fontFamily + "'");
   if (f.fontSizePx) st.push('font-size:' + Math.round(f.fontSizePx) + 'px');
   if (f.color) st.push('color:' + f.color);
   if (f.background && !fpIsTransparent(f.background)) st.push('background-color:' + f.background);
   st.push('font-weight:' + (f.bold ? '700' : '400'));
   st.push('font-style:' + (f.italic ? 'italic' : 'normal'));
   const deco = [f.underline ? 'underline' : '', f.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
   st.push('text-decoration:' + deco);
   document.execCommand('styleWithCSS', false, true);
   document.execCommand('insertHTML', false, '<span style="' + st.join(';') + '">' + esc(text) + '</span>');
   ```
   Then KEEP the block-level part, but apply it to the `blocks` captured above: alignment (`text-align`) and the direct `style` assignments for `line-height`, `text-indent`, `margin-top/bottom`. Remove the now-redundant `bold/italic/underline/strikeThrough/fontName/fontSize` execCommands from the painter — their result is already baked into the span's inline style (this also removes the brittle `queryCommandState` toggling).

   Note: this makes the painter apply ONE uniform character format to the whole selection (Word's Format Painter behaves the same — it overrides). Links/images inside the selection are not expected in normal notes; if that matters later, special-case them, but do not block this fix on it.

3. Leave the toolbar **highlight picker** (`notesSetHighlight`) and **text-color picker** (`notesSetColor`) as they are — they already work; this change only touches the painter.

**Acceptance.** Highlight text green via the toolbar → `Ctrl+Alt+C` on it → select other text → `Ctrl+Alt+V` (or click the brush): the target receives the SAME green background plus the source's font family, size, color, bold/italic/underline, alignment, line spacing, and first-line indent. `Ctrl+Z` undoes the paint in one step.

---

## Finish

For each part: `node --check` the changed `.js` (and the inline `<script>` blocks of `src/index.html` if touched), run `npm start` and verify, then commit separately. When both are done, bump `version` in `package.json` and run `npm run dist-win`.
