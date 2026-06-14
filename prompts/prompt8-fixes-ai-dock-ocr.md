# Claude Code Task — "Bilim Hezinisi" (بىلىم خەزىنىسى) Desktop
## AI panel docking · API-key/503 handling · PDF→text + dual-engine OCR · notebook UI fixes

This spec is **phased and ordered for safe, incremental execution**. Do one phase at a time, run its **Acceptance check**, then `git commit` before moving on. **Do not merge to `master`** — leave the work on a branch for the owner to review and merge.

---

## 0. Hard constraints — READ FIRST, never violate

1. **The offline core must never break.** Library, search, reader, Quran, notebook, spellcheck, and PDF/DOCX/TXT text reading all work fully offline. No change may block these or surface a "no network" warning for them. **Only the Gemini AI features require the network** — chat, translate, proofread, page-Q&A, metadata autofill, and the new *Gemini OCR* added in Phase 7.
2. **The renderer never touches the network.** Keep the renderer CSP at `connect-src 'self'`. All Gemini traffic happens only in the main process (`ai.js`) and reaches the renderer through IPC.
3. Never relocate, rename, or rewrite the user library at `%USERPROFILE%\JamiyKutupxana` (`library.db`).
4. **No transpile step. Preserve CRLF line endings.** `node --check` must pass on every changed `.js` file and on every inline `<script>` block in `src/index.html`.
5. Never log or expose the API key beyond a masked form; it stays in the main process.
6. **Code and comments in English; Uyghur only in UI strings.** Touch only what each phase requires. Commit per phase.
7. **Read the relevant file and confirm function/line/selector names before editing** — the line numbers below are approximate guides, not guarantees.

## Environment
- **Source root:** `E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc`
- **Stack:** Electron 28 + plain JavaScript (NOT React/TypeScript). Main process: `main.js`, `ai.js`, `database.js`, `ocr-postprocess.js`, `preload.js`. Renderer: `src/index.html` + `src/*.js` (`notes.js`, `quran.js`, …).
- **Run/test:** `npm start` (real library) or `npm run dev` (separate DEV library) for risky tests.
- **Reference only (do not edit):** the companion mobile app at `_mobile-ai-reference/` and `E:\ditallar\men yasigan ditallar\BilimHezinisi-Mobile(2026.5.17)`.

## Key background — how the mobile app converts PDFs (replicate this; do not reinvent)
The mobile app converts Arabic/Uyghur PDFs cleanly **with no OCR at all**. It uses pdf.js text-mode extraction (`getTextContent()`) **with cMaps and standard_fonts bundled** and passed as `cMapUrl`, `cMapPacked:true`, `standardFontDataUrl` (see `_mobile-ai-reference/js/parsers/pdf.js` and `parsers/extract.js`). That is the entire reason its output is correct: pdf.js resolves CID-keyed Arabic fonts to Unicode, and the browser shapes the RTL text. There is **no Tesseract and no Gemini OCR** anywhere in the mobile code.

**Implication for this task:**
- PDFs that *have a text layer* → fixed purely by the cMaps configuration (Phase 6). This covers the large majority of books and is fully offline.
- PDFs that are *truly scanned* (image-only, no text layer) → the only case that needs OCR. That desktop-only path is extended in Phase 7 into a two-engine choice.

---

## Phase 1 — API-key test: stop treating Google's HTTP 503 as a key failure *(low risk; screenshots 1–2)*

**Root cause.** Saving the key already works — `src/index.html → aiSaveKey()` validates with `/^[A-Za-z0-9._-]{20,}$/`, which accepts the newer `AQ.…` keys. The visible problem is the **"Test connection"** flow: `ai.js → test()` receives a transient **HTTP 503 (model overloaded / `UNAVAILABLE`)** from Google and renders the raw English string as a hard `✗`. A 503 actually means **auth succeeded and the key is valid** — the model was momentarily busy (an invalid key returns 400/403, never 503).

**Do — `ai.js`:**
1. Add a helper `isServerBusyError(err)` → true when `err.status === 503 || err.status === 500`, or the message contains `UNAVAILABLE` / `overloaded` / `high demand`. Place it beside `isQuotaError` / `isModelUnavailableError`; preserve their existing precedence.
2. In `test()`: when this error is caught, return
   `{ ok:false, busy:true, message: '✓ ئاچقۇچىڭىز توغرا قوبۇل قىلىندى. بىراق «'+model+'» مودېلى ھازىر بەك ئالدىراش (HTTP 503). ئاچقۇچىڭىز ساقلاندى — بىردەمدىن كېيىن قايتا سىناڭ.' }`.
3. In `ask()` / `askStream()` / `translateStream()` / `chatStream()`: map server-busy to a friendly Uyghur message ("مودېل ھازىر ئالدىراش، بىردەمدىن كېيىن قايتا سىناڭ") instead of a raw `HTTP 503`. Keep the existing 429/quota handling intact.

**Do — `src/index.html → aiTestConnection()`:** when `r.busy` is true, render with a **⚠ (warning / amber)** style, not `✗`, and make clear the key is saved and valid. Optionally add a "قايتا سىناش" (retry) button next to the result.

**Acceptance:** valid key + busy model → ⚠ "key is correct…" (not ✗); a genuinely invalid key → a clear "key invalid"-class message.

---

## Phase 2 — Bigger leading bullet before the four AI-menu items *(low risk; screenshot 5)*

**Location.** `src/notes.js`, the notebook AI menu (~lines 202–223). The four top-level entries are: «تەرجىمە قىلىش» (`.notes-ai-has-sub > .notes-ai-item-label`), «تىنىش بەلگىلىرى ۋە ئىملانى توغرىلاش» (`.notes-ai-item`), «سۈنئىي ئىدراكتىن سوراش» (`.notes-ai-item`), «كۆرۈنمە بەت ھەققىدە سوئال سوراش» (`.notes-ai-has-sub > .notes-ai-item-label`). The visible menu container is `#notes-ai-flyout`.

**Do — `src/notes.css`:** add a larger bullet to the **top-level items only** (not submenu buttons):
```css
#notes-ai-flyout > .notes-ai-item::before,
#notes-ai-flyout > .notes-ai-has-sub > .notes-ai-item-label::before {
  content: '\25CF';            /* ● */
  color: var(--am);
  font-size: 1.05em;
  margin-inline-end: 8px;
}
```
First read the menu's HTML to confirm `#notes-ai-flyout` is the container and the four items are its direct children (adjust the selector if the structure differs).

**Acceptance:** the four items each show a leading bullet and read as distinct; submenu entries (translation pairs, summary/explain/other) have no bullet.

---

## Phase 3 — Dock AI output into the Quran/Source side panel as a third tab *(medium; screenshots 3, 7, 8)*

**Current behavior.** In the notebook, AI answers open in a floating drawer `#nai-panel` (`notes.js → renderNaiPanel`; CSS `#nai-panel`). On small screens this stacks too many panels. The Quran/Source panel is `.notes-right-panel` (`renderRightPanel`) with tabs `quran` / `refs`, switched by `window.notesSetTab(tab)`. The `nai*` functions live in `src/index.html` (`naiOpenPanel` / `naiClose` / `naiStatus` / `naiResult` / `naiExtra` / `naiActions` / `naiChatbar` / `naiChatOpen` / `naiChatSend` / `naiPageQA`, ~lines 2560–2890).

**Do:**
1. Make `.notes-right-panel-tabs` a three-tab strip, each labelled with its offline/online nature:
   - `📖 قۇرئان · تورسىز` (`data-tab="quran"`)
   - `🔗 مەنبە · تورسىز` (`data-tab="refs"`)
   - `✨ AI · تورلۇق` (`data-tab="ai"`)
2. Move the inner content of `#nai-panel` (`nai-status` / `nai-result` / `nai-extra` / `nai-actions` / `nai-chatbar`) into a new `renderAiTab()` rendered inside `.notes-right-panel-content`. Retire the floating drawer `#nai-panel` and its edge handle `#nai-edge`.
3. **Preserve answers across tab switches:** keep all three tab panes in the DOM and toggle visibility (show/hide) instead of re-building `innerHTML`. This guarantees the streaming target `#nai-result` always exists, so switching tabs mid-stream never loses the answer.
4. Update `naiOpenPanel()` to switch the right panel to the **AI** tab (and expand the panel if collapsed) instead of opening a drawer. Update `naiClose()` to abort any running stream (`naiAbort`) and return to the Quran/Source tab.
5. When AI is disabled or no key is set, the AI tab shows a gentle "تەڭشەكتىن AI نى ئېچىڭ" message — but **must not affect the Quran/Source tabs**, which are offline and DB-backed. Keep the existing gating of the AI trigger button.

**Acceptance:** translate / proofread / ask / page-Q&A answers all render in the right panel's **AI** tab; no floating window; switching tabs mid-answer does not lose it; with the network off, Quran and Source work perfectly.

---

## Phase 4 — Auto-grow the AI question / chat textareas *(low risk; screenshots 6, 8)*
*(Do after Phase 3 — these inputs now live inside the AI tab.)*

**Location.** Page-Q&A "other" textarea: `index.html → naiPageQA()` (~line 2855, `#nai-page-q`, `min-height:60px`). Chat input: `#nai-chat-input` (`notes.js` ~line 319; CSS `#nai-chatbar textarea`, `min-height:44px`).

**Do:**
- Raise the default height (`#nai-page-q` → `min-height:120px`).
- Add **auto-grow** on the `input` event:
  ```js
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, maxPx) + 'px';  // maxPx ≈ 240
  ```
  with `overflow-y:auto` past the cap.
- Ensure the textarea and the action buttons («كۆچۈرۈش / نۇقتىغا قىستۇرۇش …») wrap cleanly in the ~320 px tab width.

**Acceptance:** typing a long question grows the box downward and the full text stays visible.

---

## Phase 5 — Draggable dividers to resize the notebook panels *(medium; screenshot 4)*

**Location.** `.notes-layout` is a flex row (`notes.css`). Its children: `.notes-right-panel` (320 px, `flex-shrink:0`), `.notes-main` (`flex:1`, the editor), and `#side` (the notes list). A collapse/expand feature already exists (`applyPanelCollapsed`).

**Do:**
- Insert a thin draggable splitter (`.notes-splitter`, ~5 px, `cursor:col-resize`) between `.notes-main` and `.notes-right-panel`, and between `.notes-main` and `#side`.
- On `pointerdown → pointermove`, adjust the adjacent side panel's `width` by `dx` (clamp `min ≈ 220px`, `max ≈ 560px`). Mind RTL direction when computing the sign of `dx`.
- Persist both widths via `window.electron.dbSetSetting('notes_panel_width' | 'notes_side_width', …)` and restore them on load (follow the existing `read('notes_panel_collapsed')` pattern).
- Don't conflict with collapse/expand; hide a splitter while its panel is collapsed.

**Acceptance:** dragging a divider resizes the panels; widths persist across restarts; collapse/expand still works.

---

## Phase 6 — Fix PDF→text extraction (cMaps + standard_fonts) *(important; the core PDF fix)*

**Root cause.** The desktop calls `pdfjsLib.getDocument({ data: arr })` (`src/index.html` ~lines 3181 and 3581) **without** `cMapUrl` / `cMapPacked` / `standardFontDataUrl`, and `assets/pdfjs/` contains only `pdf.min.js` + `pdf.worker.min.js` (no cmaps). For Arabic/Uyghur CID-font PDFs this makes `getTextContent()` return empty/garbled text, so text-layer PDFs fall below the "< 50 chars/page" threshold and are **misclassified as scanned**, routed to OCR (which then also fails — Phase 7). This is why "PDF→text didn't work at all." The mobile app avoids this by shipping cmaps and passing those options.

**Do:**
1. Add pdf.js `cmaps/` and `standard_fonts/` (for the current `3.11.174`) into `assets/pdfjs/`. Either update `setup-pdfjs.js` to download them, **or** add `pdfjs-dist@3.11.174` as a devDependency and copy from `node_modules/pdfjs-dist/cmaps` and `…/standard_fonts` (mirroring the mobile app and `scripts/copy-vendor.js`).
2. Pass the options to **both** `getDocument` calls:
   ```js
   pdfjsLib.getDocument({
     data: arr,
     cMapUrl: '../assets/pdfjs/cmaps/',
     cMapPacked: true,
     standardFontDataUrl: '../assets/pdfjs/standard_fonts/'
   })
   ```
   (use a worker path consistent with the existing `'../assets/pdfjs/pdf.worker.min.js'`).
3. Confirm `package.json → build.files` includes `assets/pdfjs/**/*` so cmaps/standard_fonts ship in the installer.

**Acceptance:** a text-layer Arabic/Uyghur PDF imports with correct, shaped text and is **not** misflagged as scanned. With the network off, reading/searching imported books still works.

---

## Phase 7 — Scanned-PDF OCR: offer two engines (UKIJ offline / Gemini online) with graceful fallback *(largest; owner's new feature)*

**Context.** After Phase 6, the "< 50 chars/page" classification is trustworthy and fires only for genuinely image-only PDFs. For those, present the user a choice of OCR engine in the existing scanned-PDF offer (`showOcrOffer` / `startPdfOcr` in `src/index.html` ~3234–3340; offer markup ~408).

### 7A — Make the UKIJ (offline Tesseract) engine actually work: fetch its models
**Root cause.** `assets/ocr/tessdata/` contains only `README.md`; the `.traineddata` models were never downloaded. `scripts/fetch-ocr-models.js` pulls individual files from a repo `tessdata/` path that most likely 404s — UyghurOCR 2.0 ships its models inside the **release ZIP** `https://github.com/gheyret/UyghurOCR/releases/download/2.0/UyghurOCR.zip`. (Note: the previous build environment had **no outbound network**, which is why the fetch failed — GitHub itself is reachable; the failure was no-network plus a wrong URL.)

**Do:**
1. First **verify** which URL actually serves the models (`curl -I` the release-ZIP URL and the raw `…/2.0/tessdata/ukij.traineddata` URL).
2. Rewrite `fetch-ocr-models.js` to download the **release ZIP**, extract `ukij.traineddata` (and `uig`/`eng`/`tur` if present) into `assets/ocr/tessdata/`; keep the raw-URL approach as a fallback. Do not commit the large binaries (check `.gitignore`).
3. Run `npm run fetch-ocr-models` on a networked machine **before** `npm run dist-win`.
4. Keep `main.js → ocr-recognize`'s "model not found" message clear, but ensure a missing model only disables OCR — it must never block the offline core.

### 7B — Add a Gemini OCR engine in the main process (new capability)
`ai.js` currently sends text-only `parts`. Add image support:
1. New function `ocrImages(imagesBase64, opts)` in `ai.js` that builds Gemini `contents` with **image parts** (`{ inlineData: { mimeType:'image/png', data:<base64> } }`) plus a concise OCR instruction: *"Transcribe the Uyghur/Arabic text in these page images exactly. Output only the transcribed text, preserve paragraph breaks, add no commentary."* Use the user's **selected** model (it is multimodal) — keep STRICT model selection. Process pages in **small batches** (≈2–4 per request) and concatenate. Reuse `callGemini()` for retry/error handling.
2. Classify failures so the renderer can fall back: payload-too-large (`isSizeError`) and quota/rate (`isQuotaError`) → return `{ ok:false, freeTierLimit:true, error:… }`. Otherwise `{ ok:true, text }`.
3. `main.js`: add `ipcMain.handle('ocr-gemini', async (e, images, opts) => { if (!ai.isEnabled() || !ai.hasApiKey()) return { success:false, unavailable:true }; return ai.ocrImages(images, opts); })`, mirroring the `ocr-recognize` handler (and emit `ocr-progress`-style events if practical).
4. `preload.js`: expose `ocrGemini(images, opts)` on the bridge, mirroring `ocrRecognize`.

### 7C — Renderer: two-engine offer + the free-tier fallback
**File:** `src/index.html` (`showOcrOffer` / `startPdfOcr`).
1. Replace the single OCR action with **two clearly labelled buttons**:
   - **«UKIJ OCR (تورسىز)»** — offline Tesseract; always available; recommended for large books. (Keep the existing ukij/uig/eng/tur language checkboxes — they apply to this engine.)
   - **«Gemini OCR (تورلۇق)»** — online; enabled only when AI is enabled **and** a key is saved; otherwise shown disabled with the hint "تەڭشەكتىن AI نى ئېچىڭ". It must **not** block the offline UKIJ option.
2. Refactor `startPdfOcr` so the per-page PNG rendering is shared, then route the images to either `window.electron.ocrRecognize(...)` (UKIJ) or `window.electron.ocrGemini(...)` (Gemini) based on the chosen engine.
3. **Fallback (owner's requirement).** When the user picks **Gemini OCR** and it fails with the free-tier limit (`freeTierLimit` or `unavailable`): stop, keep any already-produced text as fallback, and show a clear message —
   **«ھەقسىز API بۇ كىتابنى ئايلاندۇرالمىدى. UKIJ OCR (تورسىز) نى تاللاڭ.»** — then make the **UKIJ OCR** button the obvious next action (highlight/focus it). The user clicks it to finish offline. **Do not silently auto-switch** — keep AI opt-in.
4. Optional: for large PDFs (e.g. > ~50 pages), show a soft note by the Gemini button that the free tier may not handle big books and UKIJ is recommended.

**Acceptance:**
- Scanned PDF → offer shows both engines.
- UKIJ OCR works fully offline and yields natural Uyghur paragraphs (no `ی`/`ه` artifacts; via `ocr-postprocess.js`).
- With AI enabled + key: Gemini OCR works on a small scanned PDF; on a large one it fails gracefully with the Uyghur "use UKIJ" message, and UKIJ then completes it.
- With AI off / no key: only UKIJ is actionable; nothing offline is blocked.
- DevTools → Network stays empty (Gemini traffic is main-process only).

---

## Phase 8 — Verification & acceptance pass
1. `node --check` on every changed `.js` and inline `<script>`; confirm CRLF preserved (bare-LF count = 0).
2. Manual GUI pass via `npm start`:
   - 503 → ⚠ "key is correct…"; valid/invalid keys distinguished.
   - Translate / proofread / ask / page-Q&A render in the right-panel **AI** tab; no answer lost on tab switch.
   - Panel dividers drag and persist; collapse/expand still works.
   - Question/chat textareas grow with content.
   - Four AI-menu items show leading bullets.
   - Text-layer PDF imports as correct text; scanned PDF offers both OCR engines and both complete (Gemini fallback message verified).
   - Network off → reading, search, Quran, Source, notebook, spellcheck all work; DevTools → Network empty.
3. Commit per phase. **Do not merge to `master`** — leave the branch for the owner.

---

## Appendix — recommended polish (optional, after the phases above)
1. **Unify the offline/online cue** across the app (reader AI panel, notebook AI tab, Settings) with one small consistent badge (e.g. ✦ = online) so users instantly see which features need the network.
2. **A "retry" button** on the 503/busy result (Settings test and normal requests); on a busy model, suggest trying the lighter free model.
3. **Make AI answers comfortable to read in the narrow tab:** a per-answer "copy" button, generous line-height, and (with Phase 5) the ability to widen the panel.
4. **Shorten the long AI trigger label** («✨ سۈنئىي ئىدراك ئىقتىدارلىرى (Gemini API — تور ھالىتىدە) ▾») or wrap it to two lines; render "تور ھالىتىدە" as a small badge.
5. **Don't abort a running stream on tab switch** — only on `naiClose` or a new request.
6. **Allow "force OCR"** on a text-light PDF (some PDFs mix text and images), independent of the automatic <50-chars classification.
7. **Per-note AI chat history** (optional) so each note keeps its own conversation.
8. **Single-step native undo** for proofread / OCR-cleanup edits (currently they set `textContent` directly) — already on the project roadmap.

---

### Quality bar
Production-grade, error-free, minimal-diff. Read before you edit; verify names/lines. Each phase is independent and ends with its acceptance check — do not proceed past a failing check. Commit per phase; leave merging to the owner.
