# Claude Code Task — "Bilim Hezinisi" Desktop
## Uyghur OCR quality (UKIJ + Gemini) · in-reader PDF spell-correction · UI refinements

Continue on the current branch (or a new branch off it). **Phased; run each Acceptance check; commit per phase; do NOT merge to `master`** (leave it for the owner).

---

## 0. Hard constraints (never violate)
1. **The offline core keeps working with no network and no API key.** Only the Gemini features need the network.
2. Renderer CSP stays `connect-src 'self'`; **all Gemini traffic is main-process only** (`ai.js`), reached via IPC.
3. Never relocate/rewrite the user library at `%USERPROFILE%\JamiyKutupxana`.
4. Preserve CRLF; no transpile; `node --check` passes on every changed `.js` and inline `<script>`.
5. Never log/expose the API key beyond a masked form.
6. Code/comments in English; Uyghur only in UI strings. Minimal diffs. **Read before editing; confirm names/lines** (line numbers below are approximate).

## Current state & problem report
- Text-layer PDFs extract correctly now (cMaps fix shipped).
- Scanned PDFs offer two OCR engines: **UKIJ** (offline Tesseract — `main.js → ocr-recognize`, models in `assets/ocr/tessdata`, post-proc `ocr-postprocess.js`, page→PNG render in `src/index.html → startPdfOcr`) and **Gemini** (online — `ai.js → ocrImages`, `main.js → ocr-gemini`).
- Reported bugs: (1) **UKIJ yields empty text** → the imported book opens blank (`addBook` saves `S.tempContent`; empty OCR ⇒ blank book). (2) **Gemini OCR has systematic Uyghur-orthography errors** (`ڭ→ك`, `ۋە→ژ`, `ە→ه`, spurious intra-word spaces) — it transcribes as Arabic/Persian.
- Confirmed in code: `ukij.traineddata` and `uig.traineddata` are LSTM models (OEM 1 is correct — blank is NOT an OEM issue). Gheyret Kenji's UyghurOCR 2.0 desktop tool handles these scans well = Tesseract + `ukij` LSTM model + **image binarization** + tuned config. **Goal: match it.**

## Recommended strategy (priority order)
1. **UKIJ offline = primary engine** — fix to Gheyret-parity (Phase 1). Free, unlimited size, fully offline.
2. **AI text-cleanup = quality booster** (Phase 3 + 4) — send recognized *text* (not images) to Gemini to fix orthography. Small payload ⇒ no free-tier image limits.
3. **Gemini image-OCR = alternative** (Phase 2) for small/clean docs, with a far stronger Uyghur prompt.

---

## Phase 1 — Fix UKIJ (offline) to Gheyret-parity *(primary; highest impact)*

**1.1 Diagnose first.** In `main.js → ocr-recognize`, temporarily set `logger: m => console.log('[ocr]', m.status, m.progress)` and log `(data.text||'').length` per page (and any thrown error). Run a known scanned PDF via `npm run dev`; confirm whether `worker.recognize` returns empty or the text is lost downstream.

**1.2 Default to `ukij` ALONE** (not `ukij+uig`). Mixing a second model with the custom LSTM model commonly degrades/empties LSTM output. In `src/index.html`, leave `#ocrLangUig` **unchecked by default**; the default engine call sends `langs = 'ukij'`.

**1.3 Add image preprocessing before OCR** (in `startPdfOcr`, after `page.render`, before `toDataURL`) — the biggest accuracy lever and the likely cure for empty output:
- Raise OCR render `SCALE` to ~3.0–3.5 (≈300+ DPI).
- Grayscale + **binarize** (Otsu or adaptive/global threshold) via `getImageData`/`putImageData`, then `toDataURL`. Pure JS, no deps, no network.

**1.4 Confirm config.** Keep OEM 1 (LSTM). Compare PSM 6 (uniform block) vs current PSM 3 on book pages; keep whichever reads better. Only if 1.1 shows OEM 1 yields empty *despite* LSTM data, fall back to OEM 3 (default) as a guard.

**1.5** Keep `ocr-postprocess.js` (ی→ي / ه→ە + paragraph reflow); verify it doesn't over-merge after preprocessing.

**Acceptance:** a scanned Uyghur PDF that Gheyret's tool handles now yields full readable text via UKIJ (offline); the imported book is no longer blank.

---

## Phase 2 — Improve Gemini (online) image-OCR quality

**2.1** Replace the weak `OCR_IMAGE_INSTRUCTION` in `ai.js` with a strong, Uyghur-specific prompt stating: the text is **Uyghur in the Uyghur Arabic alphabet (kona yëziq)**; transcribe exactly in Uyghur orthography; **do NOT normalize to Arabic/Persian**; preserve the Uyghur letters exactly — `ئـ ھ ڭ گ ق ك خ غ ژ چ پ` and vowels `ا ە و ۇ ۆ ۈ ې ى ي`; never replace `ڭ`→`ك`, `ۋە`→`ژ`, `ە`→`ه`; **no spaces inside words**; output plain Unicode only, preserve paragraph breaks, no commentary.

**2.2** Raise resolution sent to Gemini (SCALE ~3.0) and reduce batch to ~2 pages/request (stay within free-tier payload while improving legibility).

**2.3** Keep STRICT model selection; comment that vision quality is best on the Pro model.

**Acceptance:** on the same scan, Gemini keeps `ڭ`/`ۋە`/`ە` correct and stops inserting intra-word spaces.

---

## Phase 3 — Strengthen the AI text-cleanup engine (`ocr_cleanup`) — shared by import AND the reader feature

`ai.js` already has an `ocr_cleanup` task (`buildOcrCleanupPrompt`). Make it the single high-quality Uyghur corrector used both at import time and by the new in-reader feature (Phase 4).

**3.1** Strengthen the `ocr_cleanup` prompt with the same Uyghur-orthography rules as 2.1 (fix `ڭ/ك`, `ۋە/ژ`, `ە/ه`, intra-word spaces, common OCR confusions). It must **change only recognition/orthography errors — never reword, summarize, translate, or add/remove content.** Output corrected text only.

**Acceptance:** feeding the sample error text returns it with `ڭ`/`ۋە`/`ە`/spacing fixed and nothing reworded.

---

## Phase 4 — NEW: in-reader "Gemini ئىملا تۈزىتىش" for **PDF-derived books only**

**Goal.** While reading a PDF-derived book, let the user run a deep Gemini Uyghur spell/orthography correction on the **current page**, review it in the reader's AI panel, and either hand-edit then apply, or apply directly with a warning. **Strictly limited to PDF books** so it can never corrupt text-origin books (Word / URL / TXT / DOCX / DOC / HTML / MD).

**Confirmed hooks (verify before editing):**
- Book origin: `books.format` (e.g. `'PDF'`). **Scope guard:** feature available ONLY when the open book's `format` is PDF (compare case-insensitively to be safe).
- Reader pagination: `S.readerPages` (array of page strings); current page = `S.readerPages[S.readerPage - 1]` (`S.readerPage` is 1-based). Re-render with `renderReaderPage()`.
- Persist: `dbSaveContent(bookId, content)` → `database.js → saveBookContent`, which **already rebuilds the `book_fts` search index** (so search stays correct after edits).
- Reader AI panel: `#rai-panel` with the existing reader AI functions (summarize / explain / translate / term-explain / ask).

**4.1 Menu item.** Add «✨ Gemini ئىملا تۈزىتىش (تور)» to the reader AI panel's function list. Show it **only when** the open book is PDF **and** AI is enabled + a key is set (online, gated). For non-PDF books it must not appear at all.

**4.2 Run.** On click: take ONLY the current page text (`S.readerPages[S.readerPage - 1]`) and send it to Gemini via the strengthened `ocr_cleanup` (Phase 3) — a deep, comprehensive Uyghur orthography correction, changing only errors. Render the corrected result in `#rai-panel` (the left-side panel) **only** — do NOT modify the main reader text yet. Stream if convenient. (One page = small payload = free-tier friendly.)

**4.3 Two actions at the bottom of the panel:**
- **«قولدا تەھرىرلەش» (manual edit):** turn the corrected text into an editable textarea inside the panel; show the **original page text alongside** (or a toggle/diff) so the user can compare. Provide a **«جەزملەش»** button that applies the edited text to the current page (→ 4.4).
- **«بەت يۈزىگە جەزملەش» (apply to page):** on click, show a confirm dialog — **«دىققەت: ئەسلىي بەت يۈزىدىكى ئىملا مۇشۇنىڭغا ئالمىشىدۇ.»** — and only on confirm, apply (→ 4.4).

**4.4 Apply (both paths):**
1. Replace `S.readerPages[S.readerPage - 1]` with the (edited or corrected) text.
2. Rebuild `S.readerContent` by joining `S.readerPages` **with the exact same separator the reader used to split** — so other pages are byte-for-byte unchanged (confirm the split logic — paragraph join under `CHARS_PER_PAGE` — and make the rebuild lossless).
3. Persist via `dbSaveContent(currentBook.id, S.readerContent)` (re-indexes FTS automatically).
4. `renderReaderPage()` to refresh the visible page.
5. Toast confirmation.

**4.5 Safety / revert (addresses the corruption concern):**
- Before the FIRST AI edit to a book in a session, keep a recoverable copy of the original content in memory; add **«ئەسلىگە قايتۇرۇش»** (revert this page) so a bad correction is never permanent.
- Optional: a one-time full-book content backup before the first edit, for hard recovery.

**4.6 Cautions:**
- Position-anchored bookmarks/notes may drift if a page's length changes — re-anchor if feasible, or accept minor drift (corrections are small) and note it.
- The "page" here is the reader's page (`CHARS_PER_PAGE` split), not the original PDF page — that matches what the user sees on screen.

**Acceptance:**
- PDF book → reader AI panel shows «Gemini ئىملا تۈزىتىش»; click corrects the current page (shown only in the panel); «قولدا تەھرىرلەش» → edit → «جەزملەش» applies; «بەت يۈزىگە جەزملەش» warns then applies; the main page updates, persists, and search still works; «ئەسلىگە قايتۇرۇش» restores.
- Non-PDF book (Word / URL / TXT / …) → the item does NOT appear and the text is never modified by this feature.
- Offline core unaffected; DevTools → Network empty (Gemini is main-process only).

---

## Phase 5 — Three UI refinements
**5.1** `#ocrLangUig` loads `uig.traineddata` — a **secondary Uyghur Tesseract model**, separate from Gheyret's `ukij`. Relabel «ئۇيغۇرچە (يەنە بىر مودېل)» → «ئۇيغۇرچە (uig — قوشۇمچە مودېل)» and leave it **unchecked by default** (per 1.2).
**5.2** Update the Gemini free-tier message in **both** `ai.js` `FREE_TIER_MSG` (~line 1388) and `src/index.html` default `geminiMsg` (~line 3411) to:
> «ھەقسىز API بۇ كىتابنى ئايلاندۇرالمىدى. UKIJ OCR (تورسىز) نى تاللاڭ ياكى سەل تۇرۇپ قايتا سىناڭ»
**5.3** Put offline/online words in parentheses on the notebook right-panel tabs (`notes.js → renderRightPanel`): «📖 قۇرئان (تورسىز)» · «🔗 مەنبە (تورسىز)» · «✨ AI (تورلۇق)».

---

## Phase 6 — Verification
1. `node --check` on every changed `.js` + inline `<script>`; confirm CRLF preserved.
2. `npm run dev` GUI pass: UKIJ produces full text (book not blank); Gemini errors reduced; import-time AI cleanup corrects text; in-reader «Gemini ئىملا تۈزىتىش» works on a PDF book (panel-only preview, manual edit + apply, apply-to-page warning, revert) and is **absent** on a non-PDF book; uig label / fallback message / parenthesized tabs correct; offline core fully works; DevTools → Network empty.
3. Commit per phase. Leave merging to the owner.

---

### Test material
Use a real scanned Uyghur PDF. The owner's sample Gemini output showed `توركنىك` for `توركنىڭ`, `سە ككىز` for `سەككىز`, `ژه` for `ۋە`. Success = those error classes disappear via UKIJ (after binarization), via the stronger Gemini prompt, or via UKIJ + the text-cleanup correction.
