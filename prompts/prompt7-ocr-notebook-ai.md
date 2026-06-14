# Prompt 7 — Offline UyghurOCR 2.0 + Notebook Upgrade (Collapsible Panels, Format Painter, Gemini AI Menu) + Quality Extras

You are upgrading **Bilim Hezinisi** (بىلىم خەزىنىسى), a production Electron desktop library app for Uyghur readers. Work through the phases below **strictly in order**. Do not start a phase until the previous phase's acceptance checklist passes. Commit after each phase.

---

## Phase 0 — Read the codebase and lock in the ground rules

**Before writing any code**, read these files end to end and build a mental model:

- `main.js` — IPC handlers. Note the existing `ocr-image` handler (tesseract.js, `ara+eng`, downloads traineddata from CDN — it is dead code, never called by the renderer, and broken offline). Note `export-as-docx`, `ai-*` handlers.
- `ai.js` — main-process Gemini client. Note: `SYSTEM_BASE`, `PROMPTS`, `buildTranslationPrompt(from,to,text)`, `ask`, `askStream`, `translateStream`, STRICT model selection (the user-picked model is NEVER substituted), retry/backoff, streaming over IPC, `MAX_CONTEXT_CHARS`.
- `src/ai-client.js` — renderer `window.AI` surface (mirrors of model constants, `detectType`).
- `preload.js` — contextBridge surface (`window.electron`, `window.AIBridge`).
- `src/index.html` — app shell: `#side` global sidebar, `setMode/renderSide`, the reader AI drawer `#rai-panel` (functions prefixed `rai*`), the import flow in `loadFile()` (PDF branch uses pdfjs `getTextContent`), the add-book dialog (`addBook`, fields `btitle/bauth/bcat/bdesc`), settings AI section.
- `src/notes.js` + `src/notes.css` — notebook: `renderNotesView` builds `.notes-layout` = `renderNotesMainColumn()` + `renderRightPanel()` (tabs قۇرئان/مەنبە); the notes-list lives in the GLOBAL `#side` sidebar via `renderNotesSidebar()`; `renderToolbar()`, toggle bar (`notes-toggle-refscan`, `notes-toggle-spellcheck`), `notesExec`, autosave (`markDirty/saveNow`), `mountEditor`.
- `package.json` — `build.files`, `scripts/copy-vendor.js` postinstall step.

### Non-negotiable ground rules (apply to every phase)

1. **Offline-first.** The renderer CSP stays `connect-src 'self'`. The renderer NEVER touches the network. All Gemini traffic stays in `ai.js` (main process). All OCR must work with networking fully disabled.
2. **UI language is Uyghur (RTL).** Use the exact Uyghur strings given in each phase verbatim. Code, comments, commit messages: English.
3. **Do not break existing features.** Explicitly forbidden: removing or altering the reader AI panel (`#rai-panel`) and its translation menu — the notebook gets its own copy of translation, the reader keeps its own. The existing offline «كىتاب ئامبىرىدىن ئىزدەش» (ref-scan) and «ئىملانى تەكشۈرۈش» (spell check) toggles keep working unchanged.
4. **STRICT model selection** stays: never call any Gemini model other than the one the user picked in Settings; on failure surface a clear Uyghur error.
5. **Modify only what each phase requires.** No drive-by refactors. Keep the existing code style of each file (notes.js IIFE + `window.*` exports, index.html inline functions).
6. After each phase: run `npm start`, test manually per the acceptance checklist, then commit with the message given.

---

## Phase 1 — Offline Uyghur OCR via UyghurOCR 2.0 (Gheyret Kenji)

**Goal:** scanned (image-only) PDFs imported into the library are converted to text by a fully offline OCR pipeline built from Gheyret Kenji's UyghurOCR 2.0 (MIT license): https://github.com/gheyret/UyghurOCR — release 2.0 zip: https://github.com/gheyret/UyghurOCR/releases/download/2.0/UyghurOCR.zip

UyghurOCR is a C# WinForms app, so we do NOT ship its exe. We extract what gives it its quality and replicate it with the already-bundled `tesseract.js` v5:

- Its **trained models**: `tessdata/ukij.traineddata` (Gheyret's custom Uyghur model — the default in UyghurOCR) and `tessdata/uig.traineddata`, plus `eng.traineddata` and `tur.traineddata` for mixed texts.
- Its **engine settings**: Tesseract LSTM-only mode (`EngineMode.LstmOnly` → OEM 1), PSM Auto for full pages.
- Its **post-processing** (from `MainForm.cs`): character normalization `ی`(U+06CC)→`ي`(U+064A) and `ه`(U+0647)→`ە`(U+06D5), plus the `abzasla()` paragraph-reflow heuristic (lines shorter than ~average line length end a paragraph; merge other lines with a space; join hyphen-broken words across line breaks).

### Step 1.1 — Acquire the tessdata

- Download the 2.0 release zip and extract `tessdata/ukij.traineddata`, `tessdata/uig.traineddata`, `tessdata/eng.traineddata`, `tessdata/tur.traineddata` into `assets/ocr/tessdata/`.
- If the release zip is unreachable from your environment, fetch the same four files from the repo `master` branch (`tessdata/` folder) — they are the same models.
- Add an attribution line in the Settings/About area: `OCR: UyghurOCR — غەيرەت كەنجى (MIT)`.

### Step 1.2 — Vendor tesseract.js for offline use

- Extend `scripts/copy-vendor.js` to copy, at postinstall time, into `assets/ocr/`:
  - `node_modules/tesseract.js/dist/worker.min.js`
  - the wasm core files from `node_modules/tesseract.js-core/` (copy all `tesseract-core*.wasm.js` / `.wasm` variants the installed version ships).
- Add `assets/ocr/**/*` to `package.json` → `build.files`.
- The traineddata files are plain (not gzipped): always create the worker with `gzip: false`, `cacheMethod: 'none'`, and `langPath`, `workerPath`, `corePath` pointing at the local `assets/ocr/` paths (resolve via `__dirname`; remember `assets/ocr` must also work from inside the packaged asar — if tesseract.js cannot read from asar, add `assets/ocr/**` to `asarUnpack` and resolve through `process.resourcesPath`).

### Step 1.3 — Replace the dead `ocr-image` handler (main.js)

Delete the old handler and implement:

- `ocr-recognize` — `(event, { images: [base64Png...], langs })`:
  - One `tesseract.js` worker per batch, created with the offline paths above, languages default `'ukij+uig'` (joinable with `+eng`, `+tur` when the user ticks them), `OEM 1` (LSTM only), PSM auto.
  - Recognize the images sequentially; after EACH page send `event.sender.send('ocr-progress', { page, total, progress })`.
  - Apply the UyghurOCR post-processing to each page's text: the two character replacements, then `abzasla` paragraph reflow (port the heuristic faithfully; keep it as a small pure function `reflowParagraphs(text)` with unit-testable logic).
  - Return `{ success: true, pages: [text...] }`. On error: `{ success: false, error }` — never throw across IPC.
- `ocr-cancel` — sets a flag the batch loop checks between pages; terminate the worker.
- Expose in `preload.js`: `ocrRecognize`, `ocrCancel`, `onOcrProgress`.

### Step 1.4 — Scanned-PDF detection + OCR flow in the import dialog (src/index.html, `loadFile()` PDF branch)

- After the existing pdfjs text extraction, compute `avgCharsPerPage`. If `< 50` (treat as scanned), keep the (near-empty) text result aside and show an inline offer inside the import dialog (RTL, app styling):
  - Text: `بۇ PDF سىكاننېرلانغان رەسىم شەكلىدە ئىكەن. تورسىز OCR بىلەن تېكىستكە ئايلاندۇرامسىز؟`
  - Language checkboxes: `ئۇيغۇرچە (UKIJ)` (checked), `ئۇيغۇرچە (يەنە بىر مودېل)` (checked), `ئىنگلىزچە`, `تۈركچە`.
  - Buttons: `OCR باشلاش` / `ياق، شۇنداق قوشۇلسۇن`.
- On start: for each page (cap at 300 pages), render with pdfjs to a canvas at `scale ≈ 2.5` (≈300 DPI for A4), export PNG base64, batch them in groups of ~5 pages per `ocr-recognize` call (keeps memory flat; destroy canvases after export). Show a progress bar `OCR: بەت X / Y` with a `توختىتىش` button wired to `ocr-cancel` (cancel keeps the pages already recognized).
- Join page texts with `\n\n`, set `S.tempContent`, update the file-info line to `✓ PDF (OCR): <name> (N بەت)`.
- The rest of the add-book flow (hash, FTS indexing) is untouched and must work on OCR output.

### Acceptance checklist (Phase 1)

- [ ] With Wi-Fi disabled: import a scanned Uyghur PDF → OCR offer appears → text is produced, paragraphs read naturally (no one-line-per-row output), `ی/ه` never appear in output.
- [ ] A normal text PDF imports exactly as before (no OCR offer).
- [ ] Cancel mid-OCR keeps partial text and the app stays responsive.
- [ ] FTS search finds words from the OCR'd book.
- [ ] Packaged build (`npm run dist-win`) performs OCR offline.

Commit: `feat(ocr): offline Uyghur OCR for scanned PDFs using UyghurOCR 2.0 models (ukij+uig, LSTM)`

---

## Phase 2 — Collapsible notebook side panels (Claude-desktop style)

**Goal:** in خاتىرە دەپتىرىم mode, BOTH side panels — the notes-list (global `#side` sidebar) and the `.notes-right-panel` (قۇرئان/مەنبە) — can be collapsed and re-expanded with smooth animation, like the Claude desktop app's sidebar toggle.

Implementation requirements:

1. Add two toggle buttons in the notes title bar row (`.notes-title-bar`), one at each end, using panel icons (e.g. `◧`/`◨` or an inline SVG matching the app's flat style), with tooltips `خاتىرىلەر تىزىملىكىنى يىغىش/ئېچىش` and `قۇرئان/مەنبە تاختىسىنى يىغىش/ئېچىش`.
2. Collapse = animate width to 0 (CSS `width` + `overflow:hidden` transition ~180ms, `flex-shrink:0` preserved); expand restores the prior width. Apply to `#side` ONLY while `S.mode === 'notes'` (leaving notes mode must always restore `#side` to its normal 200px — guard in `setMode`).
3. When a panel is collapsed, show a slim floating edge handle (≈16px wide strip with `❯`/`❮`, vertically centered at the panel's screen edge) to re-open it — mirroring Claude desktop. Mind RTL: `.notes-layout` is RTL, so the right-panel renders on the physical LEFT and `#side` on the physical RIGHT; pick arrow glyphs by physical side, verify visually.
4. Persist both states across restarts via the existing settings IPC (`dbSetSetting('notes_list_collapsed', …)`, `dbSetSetting('notes_panel_collapsed', …)`); restore on `renderNotesView`.
5. Keyboard shortcuts (active only in notes mode): `Ctrl+\` toggles the notes list, `Ctrl+Shift+\` toggles the Quran/refs panel. Add them to the buttons' tooltips.
6. The editor column must reflow smoothly; no horizontal scrollbar flash during the animation.

### Acceptance checklist (Phase 2)

- [ ] Both panels collapse/expand by button, edge handle, and shortcut; state survives app restart.
- [ ] Switching notes → library → notes leaves `#side` correct in both modes.
- [ ] No layout jump in the editor; selection/caret in the editor is preserved through a toggle.

Commit: `feat(notes): collapsible side panels with persisted state`

---

## Phase 3 — Format painter (Word's «Biçim Boyacısı» / سۈپۈرگە)

**Goal:** replicate Microsoft Word's Format Painter in the notebook editor.

1. Add a toolbar button in `renderToolbar()` (its own group, before the removeFormat group): icon `🖌` , title `فورمات سۈپۈرگىسى (Alt+Ctrl+C / Alt+Ctrl+V)`.
2. Behavior — exactly Word's semantics:
   - **Single click** (or `Alt+Ctrl+C` / legacy `Ctrl+Shift+C` with caret/selection in the editor): capture the formatting at the current selection (or caret's parent element) and arm one-shot paint mode.
   - While armed: the button shows an active state (`.active` class) and the editor gets `cursor` swapped to a paintbrush (CSS class `fp-armed` on `.notes-editor`, use a cursor that reads well in RTL — `cell` or a custom cursor is fine).
   - **Next selection** the user makes in the editor (mouseup with non-collapsed selection): apply the captured format to it, then disarm (one-shot).
   - **Double click** the button: sticky mode — keep applying to every subsequent selection until `Esc` or clicking the button again.
   - `Alt+Ctrl+V` (legacy `Ctrl+Shift+V`): apply the captured format to the current selection directly.
   - `Esc` always disarms.
3. Captured format = computed styles of the anchor element inside the editor: `font-weight (≥600 → bold)`, `font-style`, `text-decoration (underline/line-through)`, `font-family`, `font-size`, `color`, `background-color`, and block-level `text-align` plus whether the block is a `blockquote`.
4. Applying: wrap the selection via the editor's existing mechanism (`document.execCommand` is what `notesExec` uses — use `fontName`, `fontSize` (map px to nearest 1–7 as `notesSetSize` does), `foreColor`, `hiliteColor`, `bold/italic/underline` toggled to MATCH the captured state, i.e. clear them on the target when the source lacks them; `justifyLeft/Center/Right` and `formatBlock` for the block bits). After applying, call the editor's `markDirty()` path so autosave runs.
5. Keyboard handler: extend the existing `keydown` listener installed in `mountEditor()` — do not add a second global listener.
6. State lives module-locally in notes.js; leaving the notes mode or switching documents disarms.

### Acceptance checklist (Phase 3)

- [ ] Copy bold+red+UKIJ Tuz from one phrase, paint another phrase: all three attributes transfer; painting from PLAIN text onto bold text REMOVES bold (Word parity).
- [ ] One-shot disarms after one application; double-click sticky persists until Esc; Esc or a mode switch disarms.
- [ ] Both shortcut pairs work; existing Ctrl+B/I/U/S behavior unchanged; autosave triggers after painting.

Commit: `feat(notes): Word-style format painter with one-shot and sticky modes`

---

## Phase 4 — «سۈنئىي ئىدراك ئىقتىدارلىرى» menu in the notebook (Gemini, online)

**Goal:** the notebook's toggle bar gains offline labels and a new AI features menu with four functions. Reuse the existing `ai.js` plumbing (`askStream`, `translateStream`, gating, streaming-over-IPC) — model selection, key storage, CSP rules untouched.

### Step 4.1 — Label the offline toggles

In `renderNotesMainColumn()` change the two toggle labels to:
- `كىتاب ئامبىرىدىن ئىزدەش (تورسىز)`
- `ئىملانى تەكشۈرۈش (تورسىز)`

### Step 4.2 — Menu structure

Next to them add a dropdown trigger styled like the toggle labels but clearly a menu:

`✨ سۈنئىي ئىدراك ئىقتىدارلىرى (Gemini API — تور ھالىتىدە) ▾`

Clicking opens a flyout (RTL, app styling, closes on outside click / Esc) with four items:

1. `تەرجىمە قىلىش ◂` — hover/click opens a submenu with EXACTLY the six directed pairs already used in the reader (`raiTranslate`) — copy the labels character-for-character from the reader's `#rai-tr-menu` markup: ئۇيغۇرچىدىن ئەرەبچىگە، ئەرەبچىدىن ئۇيغۇرچىگە، ئۇيغۇرچىدىن ئىنگلىزچىگە، ئىنگلىزچىدىن ئۇيغۇرچىگە، ئۇيغۇرچىدىن تۈركچىگە، تۈركچىدىن ئۇيغۇرچىغا.
2. `تىنىش بەلگىلىرى ۋە ئىملانى توغرىلاش`
3. `سۈنئىي ئىدراكتىن سوراش`
4. `كۆرۈنمە بەت ھەققىدە سوئال سوراش ◂` — submenu: `خۇلاسىلەش`، `ئاددىي چۈشەندۈرۈش`، `باشقا...`

**Gating:** mirror the reader's pattern (`refreshAiReaderUI`): if AI is disabled or no key, the trigger still renders but clicking shows a toast `ئالدى بىلەن تەڭشەكلەردىن Gemini API ئاچقۇچىنى تەڭشەڭ` and opens the Settings AI section.

### Step 4.3 — The notebook AI drawer (`#nai-panel`)

All four functions output into a NEW drawer column appended inside `.notes-layout` so that it renders on the **physical left edge** of the window (the user explicitly wants the Q&A window on the left). Clone the reader drawer's look (`#rai-panel` CSS) — width 340px, collapsible with the Phase-2 edge-handle mechanism, close button. Contents: scrollable conversation/result area (rendered with the same markdown-to-HTML helper the reader uses — extract `raiMdToHtml` into a shared helper rather than duplicating), status line, stop button during streaming, and action buttons per mode (below). Streaming, abort, and error rendering: port the `raiExecute` pattern (rAF-debounced rendering, partial text kept on stop).

### Step 4.4 — Function behaviors

**(1) Translation** — scope: the current editor selection if non-collapsed, else the whole note's plain text. Call the existing `translateStream` path with the chosen pair (`uy/ar/en/tr` codes as in the reader). Stream into the drawer. Action buttons when done: `كۆچۈرۈش`, `نۇقتىغا قىستۇرۇش` (insert at caret), `تاللانغاننى ئالماشتۇرۇش` (only when scope was a selection — replaces it; single undo step). **Do not touch the reader's translation feature.**

**(2) Punctuation & spelling correction** — scope: selection if any, else the whole note. To preserve the note's rich-text structure, do NOT send raw innerText of the whole document blindly:
- Collect the editor's block elements (`p, div, h1-h6, li, blockquote` direct text blocks) in order; build the payload as numbered segments: `⟦1⟧ first block text`, `⟦2⟧ …` (one per line, markers exactly `⟦N⟧`).
- Send with the `uy_proofread` prompt (verbatim text below — add it to `ai.js` as `buildProofreadPrompt(segmentedText)` and route `type:'uy_proofread'` through `buildPrompt`).
- Parse the response by the `⟦N⟧` markers; replace each block's `textContent` with its corrected segment (formatting of the block survives; inline spans inside a corrected block collapse to the block's base style — acceptable, mention it in a confirm dialog beforehand: `تۈزىتىشتە ئابزاس ئىچىدىكى ئىنچىكە فورماتلار ئاددىيلىشىشى مۇمكىن. داۋاملاشتۇرامسىز؟`).
- Show the corrected text in the drawer FIRST with buttons `قوللىنىش` (apply) / `ۋاز كېچىش`; apply is one undo step and triggers autosave. If any marker is missing from the response, abort with `جاۋاب فورماتى خاتا — قايتا سىناڭ` (never apply partially).

Add to `ai.js` (English meta-instructions deliberately — Gemini follows them most reliably; the content rules are Uyghur-specific):

```js
function buildProofreadPrompt(segmented) {
  return [
'TASK: Proofread modern Uyghur text (Arabic script). Fix ONLY spelling, orthography, and punctuation. Output the corrected text and NOTHING else.',
'',
'You are an expert editor of modern standard Uyghur (ھازىرقى زامان ئۇيغۇر ئەدەبىي تىلى) with complete command of the current official orthography and punctuation rules.',
'',
'The input consists of numbered segments. Each segment starts with a marker like ⟦1⟧, ⟦2⟧ … on its own line region. You MUST return the SAME segments with the SAME markers in the SAME order — one corrected segment per marker, no segments added, merged, split, or dropped.',
'',
'CORRECT (and nothing more):',
'1. Spelling per current Uyghur orthography: correct hemze (ئ) usage at word/syllable starts; correct Uyghur vowel letters (ا ە ې ى و ۇ ۆ ۈ); vowel-harmony-consistent suffix forms; commonly confused consonants (ق/ك، غ/خ، ھ/خ) judged by the intended word.',
'2. Character-level intrusions from Arabic/Persian keyboards: ی→ي، ك variants→ك، ه used as a vowel→ە، ة→ت where the word is Uyghur. Never "correct" genuinely Arabic quotations (Quran, hadith, duas) — leave Arabic passages exactly as written.',
'3. Punctuation per Uyghur rules: sentence-final «.», question «؟», exclamation «!», comma «،», semicolon «؛», colon «:», quotes «...» for quotations; no space BEFORE punctuation, exactly one space AFTER; paired punctuation balanced.',
'4. Spacing: collapse double spaces; fix spaces around parentheses and dashes; fix wrongly joined or split words ONLY when the correct form is unambiguous.',
'',
'NEVER:',
'- Rephrase, reorder, summarize, expand, or "improve" wording. Word choice belongs to the author.',
'- Change names, numbers, dates, Latin-script words, or Arabic quotations.',
'- Add or remove sentences. If a word is ambiguous and context does not decide it, leave it unchanged.',
'',
'OUTPUT: only the corrected segments with their ⟦N⟧ markers. No preamble, no explanations, no diff.',
'',
'INPUT SEGMENTS:',
String(segmented || '')
  ].join('\\n');
}
```

**(3) Free chatbot («سۈنئىي ئىدراكتىن سوراش»)** — a pure Gemini chat, NOT connected to the library. Multi-turn:
- `ai.js`: add `chatStream(messages, callbacks)` — `messages = [{role:'user'|'model', text}]` mapped to the Gemini `contents` array (roles `user`/`model`), reusing the existing SSE streaming core, timeout, retries, STRICT model. System instruction (Uyghur, add as constant `CHAT_SYSTEM`):

```
سىز بىلىمى كەڭ، سەمىمىي ياردەمچىسىز. قائىدىلەر:
- سوئال قايسى تىلدا بولسا شۇ تىلدا، ئادەتتە ئۇيغۇر تىلىدا (ئۇيغۇر يېزىقىدا) جاۋاب بېرىڭ.
- ھەدىس، ئايەت ياكى ئالىم سۆزىنى نەقىل قىلسىڭىز، پەقەت راست مەنبەدىنلا نەقىل قىلىڭ؛ مەنبەسىنى (توپلام، كىتاب) كۆرسىتىڭ. ئېنىق بىلمىسىڭىز «بۇ ھەقتە ئېنىق مەنبە تاپالمىدىم» دەڭ — ئويدۇرماڭ.
- جاۋابنى Markdown بىلەن رەتلىك تۈزۈڭ.
- ھېكايە، شېئىر قاتارلىق ئىجادىي تەلەپلەرنى خۇشاللىق بىلەن ئورۇنداڭ.
```

- New IPC `ai-chat-stream` / reuse `ai-cancel`; expose `chatStream` on `window.AIBridge`/`window.AI`.
- Drawer becomes a chat: input box at the bottom (`سوئالىڭىزنى يېزىڭ...`, Ctrl+Enter sends), bubbles for user/model turns, history kept in `S.notes.chatHistory` for the session (not persisted to db), buttons per answer: `كۆچۈرۈش`, `خاتىرىگە قىستۇرۇش`; header button `سۆھبەتنى تازىلاش`. Cap history sent to the API at the last 20 turns.

**(4) Ask about the current page** — context = the open note's full plain text (`#notes-editor` innerText; if empty → toast `خاتىرە قۇرۇق`). Each option streams into the drawer as a one-shot answer (uses `askStream` with `type:'general'` and the note text as `context`):
- `خۇلاسىلەش` → question: `بۇ تېكىستنىڭ خۇلاسىسىنى تۈزۈپ بەرگىن`
- `ئاددىي چۈشەندۈرۈش` → question: `بۇ تېكىستنى ئاددىي قىلىپ چۈشەندۈرۈپ بەرگىن`
- `باشقا...` → reveals a larger free-text textarea in the drawer (`بۇ بەت ھەققىدە سوئالىڭىزنى يېزىڭ...`) + `سوراش` button; sends the user's question with the note text as context.

### Acceptance checklist (Phase 4)

- [ ] Both offline toggles show `(تورسىز)` and still work.
- [ ] Without an API key the menu prompts to Settings; with a key all four functions work.
- [ ] Translation: all six pairs; selection vs whole-note scopes; insert/replace/copy buttons; reader translation untouched.
- [ ] Proofread: a deliberately misspelled multi-paragraph note comes back with paragraphs intact, only spelling/punctuation changed, preview-then-apply works, malformed response never half-applies.
- [ ] Chat: multi-turn context works (a follow-up question referencing the previous answer is understood); stop button aborts; insert-into-note works.
- [ ] Page-QA: all three options answer about the open note; `باشقا` free question works.
- [ ] All streaming can be cancelled; all errors render in Uyghur; nothing hits the network from the renderer (verify devtools Network tab stays empty).

Commit: `feat(notes): Gemini AI menu — translate, Uyghur proofread, chat, page Q&A`

---

## Phase 5 — Quality extras (approved by the owner)

### 5.1 Image → text in the notebook (offline OCR)

- Toolbar button `📷` title `رەسىمدىن تېكىست (OCR، تورسىز)`: file picker (`png, jpg, jpeg, bmp, tiff`) → run the Phase-1 `ocr-recognize` (default `ukij+uig`) → insert the recognized text at the caret as plain paragraphs; progress toast `OCR ئىجرا بولۇۋاتىدۇ...`.
- Paste support: in the editor's `paste` handler, if the clipboard contains an image (and no text), show a small confirm `چاپلانغان رەسىمنى تېكىستكە ئايلاندۇرامسىز؟ (تورسىز OCR)` → same pipeline. (Plain-text/HTML paste behavior stays untouched.)

### 5.2 OCR result cleanup with AI (online, optional, never automatic)

- Wherever OCR has just produced text (Phase-1 PDF import result, 5.1 insertions), if AI is enabled+keyed, surface a button: `OCR نەتىجىسىنى AI بىلەن تۈزىتىش (تور)`.
- Pipeline: split the text into ≤8000-char chunks on paragraph boundaries; wrap each chunk in the segment protocol (`⟦N⟧` per paragraph); send sequentially with `buildOcrCleanupPrompt` (below, add to `ai.js`); stitch results; show preview-then-apply exactly like Phase 4 (2). Progress: `AI تۈزىتىۋاتىدۇ: بۆلەك X / Y`. Abortable; abort keeps the original text.

```js
function buildOcrCleanupPrompt(segmented) {
  return [
'TASK: Repair OCR errors in modern Uyghur text (Arabic script) recognized by Tesseract. Fix ONLY recognition artifacts. Output the repaired text and NOTHING else.',
'',
'You are an expert in Uyghur orthography and in the typical failure modes of OCR on Arabic-script print: lost or doubled dots (ب/پ/ت/ث، ج/چ/خ، ر/ز)، confused vowel letters (ى/ي، و/ۇ/ۆ/ۈ)، ه/ە confusion، broken ligatures, words split or merged at wrong points, hyphenated line-break splits, stray punctuation/garbage glyphs, Latin lookalikes (l/1, O/0) inside numbers.',
'',
'The input consists of numbered segments marked ⟦1⟧, ⟦2⟧ … Return the SAME segments, SAME markers, SAME order — none added, merged, split, or dropped.',
'',
'RULES:',
'1. Reconstruct the most plausible intended Uyghur word for each garbled token, judged by context. Fix split/merged words and rejoin hyphen-broken words.',
'2. Normalize characters to Uyghur forms: ی→ي، ه as vowel→ە. Keep genuinely Arabic quotations (Quran, hadith) in correct Arabic — repair their OCR damage too, but never translate or alter their wording.',
'3. Fix punctuation damaged by OCR («,»→«،» etc.) per Uyghur conventions.',
'4. NEVER rephrase, modernize, summarize, or add content. If a token is unreadable beyond repair, keep it as-is rather than inventing text.',
'5. Keep numbers, dates, and proper names; repair them only when the OCR error is obvious.',
'',
'OUTPUT: only the repaired segments with their ⟦N⟧ markers. No commentary.',
'',
'INPUT SEGMENTS:',
String(segmented || '')
  ].join('\\n');
}
```

### 5.3 Notebook find & replace + word count + DOCX export (all offline)

- `Ctrl+F` in the editor opens a compact find bar (top of editor, RTL): input `ئىزدەش...`, live highlight (reuse the `<mark>`-style highlighting approach already used by ref-scan, but non-destructive — wrap/unwrap on close), match counter `X / Y`, next/prev (`Enter` / `Shift+Enter`), close on Esc.
- `Ctrl+H` extends it with `ئالماشتۇرۇش...` input + buttons `ئالماشتۇرۇش` / `ھەممىنى ئالماشتۇرۇش` (each a single undo step; counts reported in a toast: `N ئورۇن ئالماشتۇرۇلدى`).
- Status strip at the editor's bottom edge: `سۆز: N · ھەرپ: M` (update debounced on input).
- Title-bar button `Word قا چىقىرىش`: export the open note via the EXISTING `export-as-docx` IPC (title = note title, content = editor text; verify RTL comes out correctly — the handler already does this for books).

### 5.4 AI metadata autofill when adding a book (online, button-triggered)

- In the add-book dialog, after a file is loaded and IF AI is enabled+keyed, show a small button next to the title field: `✨ AI بىلەن ئۇچۇرلارنى تولدۇرۇش`.
- On click: send the first 4000 chars of `S.tempContent` with `buildMetadataPrompt` (below); expect STRICT JSON; fill ONLY fields the user left empty (`btitle`, `bauth`, `bdesc`) and preselect the category ONLY if the returned category exactly matches an existing option in `bcat`. Show `تولدۇرۇلدى — تەكشۈرۈپ بېقىڭ` on success; on parse failure: `AI جاۋابىنى ئوقۇغىلى بولمىدى`.

```js
function buildMetadataPrompt(excerpt, categories) {
  return [
'TASK: Extract bibliographic metadata from the opening excerpt of a book. Respond with ONE JSON object and NOTHING else (no markdown fences, no commentary).',
'',
'JSON shape: {"title": string, "author": string, "category": string, "description": string}',
'Rules:',
'- "title"/"author": as printed in the excerpt; empty string if not determinable. Never guess an author.',
'- "category": choose the single best fit from this exact list (copy it verbatim) or "" if none fits: ' + JSON.stringify(categories) + '.',
'- "description": 1–2 sentences in Uyghur (Arabic script) describing what the book is about, based only on the excerpt.',
'- All values must be plain strings without line breaks.',
'',
'EXCERPT:',
String(excerpt || '').slice(0, 4000)
  ].join('\\n');
}
```

(Pass the live category list from the renderer; route through a new `type:'metadata'` in `buildPrompt` that bypasses `SYSTEM_BASE` — like translation does — so the JSON instruction is not overridden.)

### Acceptance checklist (Phase 5)

- [ ] Image file and pasted screenshot both OCR offline into the note at the caret.
- [ ] OCR cleanup previews, applies, aborts safely; long book chunks correctly (markers verified per chunk).
- [ ] Find/replace works on a 50k-char note without lag; highlights fully removed on close; undo restores replaced text.
- [ ] DOCX export of a formatted RTL note opens correctly in Word.
- [ ] Metadata autofill never overwrites user-typed fields and never auto-runs.

Commit: `feat: image OCR, AI OCR cleanup, find/replace + docx export, AI metadata autofill`

---

## Phase 6 — Integration QA, version, packaging

1. Bump `package.json` version to `2.7.0`; note the new features in `BUILD-GUIDE.md` (one line each).
2. Verify `build.files` (and `asarUnpack` if used in Phase 1) covers: `assets/ocr/**/*` and any new vendor files. Run `npm run dist-win` and test the **portable exe on a machine/VM profile without dev node_modules**.
3. Full regression sweep — with network DISABLED: app starts <3s; library import TXT/PDF/DOCX; scanned-PDF OCR; FTS search; reader (incl. that the AI button simply hides); quran mode; notes: ref-scan, spell check, panels, format painter, find/replace, docx export, image OCR. With network ENABLED + key: reader AI panel incl. translation (must be byte-identical behavior to before this work); all four notebook AI functions; OCR cleanup; metadata autofill.
4. Check `npm start` console for any new warnings/errors introduced; fix all.

Commit: `chore: v2.7.0 — OCR + notebook AI release`

---

## Appendix — deferred ideas (do NOT implement now; for the owner's future consideration)

- **Library-RAG in the notebook chat**: a toggle in the chat drawer «كىتاب ئامبىرىدىن پايدىلىنىپ جاۋاب بەر» that runs FTS5 over the library, feeds top passages with `[N-ئورۇن]` markers to the existing `topic_search` prompt — cited answers from the user's own books.
- **Reading-stats dashboard** (offline): pages read, streaks, most-read categories from the existing `recent`/progress tables.
- **Library backup/restore** (offline): zip `library.db` + content dir to a user-chosen file; restore with integrity check.
- **Gemini Vision OCR fallback** (online): for very poor scans/manuscripts where Tesseract fails, send page images to Gemini multimodal; clearly labeled as online.


