# Claude Code بۇيرۇقى — «بىلىم خەزىنىسى» كومپيۇتىر نۇسخىسىغا AI ۋە يېڭى ھۆججەت تۈرلىرى قوشۇش

> بۇ ھۆججەتنىڭ پۈتۈن مەزمۇنىنى كۆچۈرۈپ Claude Code گە چاپلاڭ. ئۇ مۇشۇ project (`bilim hezinisi pc`) نىڭ ئىچىدە ئىجرا بولىدۇ.
> مەقسەت: تېلېفون نۇسخىسى (`BilimHezinisi-Mobile`) دىكى **Gemini AI ئىقتىدارى** بىلەن **HTML / Markdown ھۆججەت ئەكىرىش** ئىقتىدارىنى بۇ كومپيۇتىر نۇسخىسىغا، ئەسلىدىكى تورسىز (offline) ئىقتىدارلارنى **قىلچە بۇزماي** قوشۇش.

---

## 0. ئەڭ مۇھىم قائىدىلەر (HARD CONSTRAINTS — READ FIRST)

You are extending an existing, working Electron app. Treat the current behaviour as sacred.

1. **Offline-first is non-negotiable.** The app MUST keep working with zero internet, exactly as today. AI is purely additive. If there is no API key, or AI is disabled, or there is no network, every existing feature still works and the UI shows no errors.
2. **Do not break or remove ANY existing feature.** Library, reader + pagination, search (ngram/FTS), notes, Quran, spellcheck/symspell, import (PDF/TXT/DOCX/DOC), export (DOCX/PDF), categories, bookmarks, recent, OCR, stats, themes — all must still pass the regression checklist in §7.
3. **Keep the security model.** `contextIsolation: true`, `nodeIntegration: false` stay as-is. The renderer CSP in `src/index.html` line 6 is `connect-src 'self'` — **do NOT weaken it**. Therefore **all network calls (Gemini + any web fetch) MUST happen in the Electron MAIN process**, never in the renderer.
4. **No database schema migration.** Store all AI settings as key/value via the existing `database.getSetting(key, default)` / `database.setSetting(key, value)`. Do not alter table definitions.
5. **Do not touch the data directory logic.** `DATA_DIR` / `JamiyKutupxana` / `JamiyKutupxana-DEV` in `main.js` stays exactly as written.
6. **The API key is the user's own.** Never hard-code a key. Never ship a key. Store it locally, obfuscated at rest (mirror the mobile approach). Never log the full key.
7. **Work on a branch, commit per phase.** `git checkout -b feature/ai-integration`. After each phase: run the app, run the regression checklist, then `git commit`. Never start a new phase before the previous one runs cleanly.
8. **Match the existing code style.** Plain ES5/ES6 functions like the current files, CRLF line endings, Uyghur UI strings, same naming conventions. Do not introduce a framework or a bundler.

If any instruction here would force you to violate one of these rules, STOP and explain instead of guessing.

---

## 1. پايدىلىنىش مەنبەسى (REFERENCE SOURCE — read before coding)

The phone app already implements everything we want. Its relevant source has been copied into this repo for you to study (it is gitignored and never shipped):

```
_mobile-ai-reference/
  js/ai.js          ← THE Gemini client (key mgmt, prompts, type detection, streaming, model fallback, usage). Port this.
  js/settings.js    ← AI settings UI (key field, enable switch, model, test, daily usage)
  js/reader.js      ← reader AI panel UX (#ai-sheet): scope, type pill, quick actions, question, streaming answer
  js/library.js     ← "add web page by URL" import (Readability → markdown)
  js/markdown.js    ← markdown helper
  js/parsers/*.js   ← file-type extraction (text/html/docx/doc/pdf)
  mobile-index.html ← DOM of the AI sheet + settings tab (for structure reference)
  styles/*.css      ← AI sheet / settings styling reference
```

The authoritative original also lives at:
`E:\ditallar\men yasigan ditallar\BilimHezinisi-Mobile(2026.5.17)\src\js\`

**First action:** read `_mobile-ai-reference/js/ai.js` in full, plus the AI sections of `settings.js` and `reader.js`. Understand `window.AI`'s shape:
`hasApiKey, getApiKey, setApiKey, getModel, setModel, isEnabled, setEnabled, getTodayUsage, detectType, typeLabel, ask, askStream, test, MAX_CONTEXT_CHARS`.

---

## 2. بۇ project نىڭ قۇرۇلمىسى (DESKTOP ARCHITECTURE — what you are editing)

- **Main process:** `main.js` (~990 lines) — all `ipcMain.handle(...)`. Settings via `database.getSetting/setSetting`. Import handlers near line 651: `open-file` dialog (filters: pdf/txt/docx/doc), `read-txt`, `read-pdf-buffer`, `read-docx`, `read-doc`.
- **Bridge:** `preload.js` — `contextBridge.exposeInMainWorld('electron', { ... })`, ~60 methods, each `ipcRenderer.invoke(...)`.
- **Renderer:** `src/index.html` (~2500 lines, monolithic inline `<script>` with a global state object `S`; reader content in `S.readerContent` / `S.readerPages`). Plus modules: `src/notes.js`, `src/quran.js`, `src/spellcheck.js`, `src/symspell.js`, `src/ngram.js`, `src/sanitize.js`.
- **DB:** `database.js` (better-sqlite3). `getSetting/setSetting` already exist.
- **Existing deps you can reuse:** `mammoth` (docx), `node-html-parser` (HTML), `dompurify` (sanitize), `word-extractor` (.doc), `tesseract.js` (OCR).
- **New deps to add (Phase 1/2):** `marked` (render Markdown), `turndown` (HTML→Markdown), `@mozilla/readability` (article extraction for web import). Add with `npm install marked turndown @mozilla/readability`.

**Architecture decision (follow this):**
- The pure, synchronous helpers from mobile `ai.js` — `detectType`, `typeLabel`, `MAX_CONTEXT_CHARS`, example-chip lists — go into a NEW renderer file `src/ai-client.js`, which also defines `window.AI` as a thin bridge that forwards the network methods to the main process via `preload`.
- The networked logic — `PROMPTS`, `buildPrompt`, `buildBody`, `callGemini`, streaming, model fallback/self-heal, usage tracking, key storage/obfuscation — goes into a NEW main-process module `ai.js` (required by `main.js`), using the global `fetch` available in Electron 28's main process (Node 18 / undici, supports streaming via `ReadableStream`).
- This keeps the CSP intact and the key out of the renderer.

---

## 3. باسقۇچلار (PHASED PLAN)

Do the phases in order. Each phase = small, runnable, committed.

### Phase 0 — Safety baseline
- `git checkout -b feature/ai-integration`.
- Run `npm start`, confirm the app opens with the real library and all current features work. This is your regression baseline.
- Read the reference files in §1.

### Phase 1 — Expand import file types: HTML + Markdown  *(low risk, do first)*
Goal: the Add-Book / import flow accepts `.html`, `.htm`, `.md`, `.markdown` in addition to today's PDF/TXT/DOCX/DOC.
- `main.js` `open-file` dialog (~line 651): add the new extensions to the filters (a combined "كىتاب ھۆججەتلىرى" entry + individual entries).
- Add main handlers + preload methods:
  - `read-md` → read file as UTF-8 text, return raw markdown.
  - `read-html` → read file, extract readable content. Use the existing `node-html-parser` (or `@mozilla/readability` + `turndown` if you added them in Phase 2) to strip scripts/styles/nav and return clean text/markdown. Sanitize with the existing DOMPurify before display.
- Rendering: the reader currently shows `S.readerContent`. For Markdown books, render with `marked` then sanitize with DOMPurify before inserting. Keep plain-text books behaving exactly as now. Match how DOCX/PDF books are currently stored (extract text for FTS + store display content) — do not invent a new storage path.
- Acceptance: import a `.md` and a `.html` file → they appear in the library, open in the reader, are searchable, exportable, and existing PDF/DOCX/TXT/DOC imports are unchanged.
- Commit: `feat(import): support HTML and Markdown files`.

### Phase 2 — AI backend in the main process
Create `ai.js` (main process), porting from `_mobile-ai-reference/js/ai.js`:
- Replace every `window.DB.getPref/setPref` with `database.getSetting/setSetting` (keys: `ai_gemini_api_key`, `ai_gemini_model`, `ai_enabled`, `ai_usage_<YYYY-MM-DD>`). Keep the light XOR key-obfuscation on read/write.
- Keep: `API_BASE = 'https://generativelanguage.googleapis.com/v1beta'`, default model `gemini-3.5-flash`, fallback `gemini-3.1-flash-lite`, `PROMPTS`, `buildPrompt`, `buildBody`, `callGemini`, model fallback + `selfHealModel`, `fetchWithTimeout` (60s), quota/size error handling, `getTodayUsage`/`bumpUsage`, token logging.
- Use Electron main's global `fetch`. Implement both non-streaming (`generateContent`) and streaming (`streamGenerateContent`).
- Wire IPC in `main.js`:
  - `ai-has-key`, `ai-get-key-masked`, `ai-set-key`, `ai-get-model`, `ai-set-model`, `ai-is-enabled`, `ai-set-enabled`, `ai-get-usage`, `ai-test`, `ai-ask`.
  - Streaming: `ai-ask-stream` accepts a `requestId`; main streams chunks with `event.sender.send('ai-chunk-' + requestId, delta)` and ends with `ai-done-' + requestId` / `ai-error-' + requestId`. Add `ai-cancel` (requestId) using an `AbortController`.
- `preload.js`: expose these under `window.electron` AND a convenience `window.AI` shape so ported renderer code stays close to mobile. `askStream(opts, onChunk, onDone, onError)` wraps the requestId + `ipcRenderer.on` listeners and returns an `abort()` function. `detectType`/`typeLabel`/`MAX_CONTEXT_CHARS` come from `src/ai-client.js` (next phase), not from IPC.
- Acceptance: from DevTools console, `await window.electron.aiTest()` with a real key returns ok; with no key returns a clean "no key" result, never throws. App still launches with no key set.
- Commit: `feat(ai): main-process Gemini client + IPC bridge`.

### Phase 3 — AI settings UI
- Add `src/ai-client.js` with the pure helpers (`detectType`, `typeLabel`, `MAX_CONTEXT_CHARS`, example chips) ported from mobile `ai.js`, and the `window.AI` bridge wrappers. Include it via `<script>` in `index.html`.
- Add an **AI section** to the desktop settings UI (mirror mobile `settings.js`): 
  - Enable AI checkbox (`ai_enabled`).
  - API key input (`type=password`, placeholder `AIza...`), Save button.
  - Test button (calls `ai-test`, shows result + resolved model).
  - Model info + daily usage count.
  - A short Uyghur hint: get a free key from `aistudio.google.com` → "Get API key".
- If the desktop has no settings modal yet, add a small one reachable from the header; otherwise extend the existing settings area. Keep it consistent with current modals (Add Book, Stats, etc.).
- Acceptance: user can paste a key, Save, Test, toggle enable, pick model — all persisted across restarts via settings. With AI disabled/no key, nothing else changes.
- Commit: `feat(ai): settings UI for key, model, enable, usage`.

### Phase 4 — Reader AI panel (the main feature)
Port the mobile AI sheet UX (`#ai-sheet` in mobile-index.html + logic in reader.js) into the desktop reader, adapted for a desktop window (a right-side drawer or a modal, not a phone bottom-sheet).
- Trigger: an **"AI" button** in the reader toolbar, AND when the user selects text in the reader content, offer AI actions on that selection (`window.getSelection()` over the reader content container).
- Panel contents (reuse mobile logic):
  - **Scope**: selected text / current page / whole book (cap context at `MAX_CONTEXT_CHARS`).
  - **Type pill**: auto-set via `window.AI.detectType(context)`; user can override (hadith / tafsir / fiqh / general / translation / term_explain).
  - **Quick actions**: خۇلاسىلەش (summary), ئاددىي چۈشەندۈرۈش (explain), تەرجىمە (translate, with direction submenu), ئاتالغۇ چۈشەندۈرۈش (term explain).
  - **Question box** + example chips per type (copy the Uyghur chip texts from mobile reader.js).
  - **Streaming answer** area; **Deep-think** toggle; Stop button (calls `ai-cancel`).
  - **Answer actions**: copy, and **save as note** (reuse the existing notes feature for the current book).
- Gating: the AI button/panel is only visible/active when `await window.AI.isEnabled()` AND `await window.AI.hasApiKey()`. Otherwise the reader looks exactly like today. On network failure show a calm Uyghur message ("تورغا ئۇلىنىش مەغلۇپ بولدى…"), never a crash.
- Acceptance: select a passage → ask/translate/explain → streamed Uyghur answer → save as note. Disable AI → reader is identical to baseline.
- Commit: `feat(ai): reader AI panel (ask, translate, explain, summarize)`.

### Phase 5 — (ئىختىيارىي) Add web page by URL
Port mobile `library.js` `addWebPage`: a header/menu action "تور بەت قوشۇش (URL)" → main-process handler fetches the HTML (Node `fetch`, no CORS), runs `@mozilla/readability` to extract the article, `turndown` to Markdown, sanitizes, and saves it as a normal book (category "ئۇيغۇر ئوقۇشلۇق" or "باشقا"). All network in main.
- Acceptance: paste an article URL → it imports as a readable book offline afterwards. Skip gracefully with a Uyghur toast if the page is JS-only or unreachable.
- Commit: `feat(import): add web page by URL`.

### Phase 6 — Verification & polish
- Run `node --check` on every changed `.js` (main `ai.js`, `src/ai-client.js`, and confirm `main.js`/`preload.js` parse).
- Run the full regression checklist (§7) with AI **disabled** — everything must match the Phase 0 baseline.
- Then enable AI and run the AI acceptance tests (§7).
- Update `package.json` version (e.g. `2.5.0` → `2.6.0`), update `BUILD-GUIDE.md` changelog with the new features.
- Final commit + merge note. Do NOT auto-merge to the main branch; leave that to the user.

---

## 4. ئىقتىدار تەپسىلاتى (FEATURE DETAIL — port faithfully)

From mobile `ai.js` keep these exactly:
- **Content-type-aware prompts** (`PROMPTS`): hadith, tafsir, fiqh, general, translation, topic-search, term_explain — with their Uyghur role/task text and the guardrails already written there (accuracy, cite classical sources, mainstream Sunni scholarship, no personal verdicts on contested fiqh/political questions). Do not water these down.
- **Model fallback / self-heal**: if a model 404s, try the fallback list and persist the working model.
- **Streaming** with a 60s watchdog and abort.
- **Daily usage counter** shown in settings.
- **Key obfuscation** at rest; mask the key in any UI/getter (`AIza…last4`).

---

## 5. ئەسكەرتىش: نېمىلەرنى ئۆزگەرتمەسلىك (DO-NOT-TOUCH LIST)
- `main.js`: the `DATA_DIR` / `IS_DEV` block, the data-seeding/migration code, and every existing `ipcMain.handle`. You may ADD handlers; do not change existing ones' behaviour.
- `database.js`: no schema changes. Only use existing `getSetting/setSetting` (+ existing book/note APIs).
- `src/index.html` CSP meta tag — keep `connect-src 'self'`.
- The existing reader rendering, pagination, search, notes, Quran, spellcheck flows — extend around them, don't rewrite them.

---

## 6. كود سۈپىتى تەلەپلىرى (QUALITY BAR)
- Every new network path handles: no key, no network, HTTP error, quota/429, oversized input, user-cancel — each with a calm Uyghur message and no uncaught exception.
- No secrets in logs. No new global leaks in the renderer beyond `window.AI`.
- Keep bundle/style consistent; CRLF; Uyghur UI text; comments where logic is non-obvious.
- Performance: AI work must never block the UI thread; streaming updates incrementally.

---

## 7. قوبۇل قىلىش سىنىقى (ACCEPTANCE / REGRESSION CHECKLIST)

**A. With AI DISABLED or no key (must equal Phase-0 baseline):**
- [ ] App launches, shows the real library (your books).
- [ ] Open a book, paginate, search (ngram/FTS), highlight hits.
- [ ] Notes: add/edit/delete. Quran mode works. Spellcheck works.
- [ ] Import PDF, TXT, DOCX, DOC — unchanged. Export DOCX/PDF works.
- [ ] Categories, bookmarks, recent, stats, theme toggle — unchanged.
- [ ] No console errors; no AI UI visible.

**B. New file types:**
- [ ] Import `.md` and `.html` → readable, searchable, exportable.

**C. With AI ENABLED + valid key (online):**
- [ ] Settings: save key, Test → ok, model shown, usage increments.
- [ ] Reader: select text → summarize / explain / translate / term-explain / ask → streamed Uyghur answer.
- [ ] Save an AI answer as a note. Stop button cancels a stream.
- [ ] Pull the network mid-request → calm Uyghur error, app stays stable.
- [ ] (If Phase 5) Add a web page by URL → imports and reads offline after.

**D. Offline regression with key present but no network:**
- [ ] Everything in section A still works; AI calls fail gracefully.

---

## 8. تەۋسىيە تەرتىپ (HOW TO RUN THIS)
Paste this whole document into Claude Code. Tell it: *"Implement Phase 0 and Phase 1 only, then stop and show me a diff."* Review, run `npm start`, then continue phase by phase. Commit after each green phase. This keeps every step reversible and the offline app safe.
