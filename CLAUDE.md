# Al-Maktaba Al-Shamila — Uyghur Edition ("بىلىم خەزىنىسى" / Bilim Hezinisi)

## Project Overview
Full-featured Uyghur desktop library application inspired by المكتبة الشاملة.
Standalone Windows app (NSIS installer + portable .exe). The CORE is fully
offline; AI is an OPTIONAL, opt-in online layer (see Architecture).

## Core Principles
- Production-grade, fully functional, error-free code. Outline architecture before coding; modify ONLY what is necessary.
- Development and code comments in English; Uyghur ONLY in UI strings and content.
- Offline-first: every CORE feature must work with no network and no API key.
- No transpile step — preserve CRLF line endings; `node --check` must pass on every changed `.js` file and on inline `<script>` blocks.
- Never break the renderer security model (see DO-NOT-TOUCH).

## Architecture (actual — supersedes any "React/TypeScript" assumption)
- **Electron 28 + plain JavaScript** (NOT React, NOT TypeScript; app code is not built/transpiled).
  - Main process: `main.js`, `database.js`, `ai.js`, `ocr-postprocess.js`; secure IPC bridge in `preload.js` (contextBridge).
  - Renderer: single `src/index.html` + vanilla JS modules (`notes.js`, `quran.js`, `spellcheck.js`, `symspell.js`, `ngram.js`, `sanitize.js`, `ai-client.js`).
- **Data:** better-sqlite3 + SQLite FTS5 (unicode61). The library lives OUTSIDE the source tree at `%USERPROFILE%\JamiyKutupxana\library.db` (WAL mode); `npm run dev` uses a separate `JamiyKutupxana-DEV`. Tables include `book_content`/`book_fts`, `quran_ayas`/`quran_fts`, and a key/value `settings` table.
- **Parsing:** PDF (pdfjs-dist, local), DOCX (mammoth), DOC (word-extractor), TXT, HTML/Markdown + web-page import (@mozilla/readability + turndown + node-html-parser).
- **OCR (offline):** tesseract.js + tesseract.js-core with bundled UyghurOCR 2.0 LSTM models (ukij + uig) under `assets/ocr`; `ocr-postprocess.js` reflows paragraphs and normalizes characters. Models are downloaded via `npm run fetch-ocr-models` and shipped asar-unpacked.
- **AI (optional, online):** Google Gemini, called ONLY from the main process (`ai.js`) via Node fetch; the renderer reaches it through IPC. Default model `gemini-3.5-flash`; also `gemini-3.1-flash-lite` (free) and `gemini-3.1-pro-preview` (paid). The user supplies their OWN key (`AIza…`), stored obfuscated in the `settings` table and never logged. STRICT model selection — never silently switch the user's chosen model. SSE streaming for chat/translate/ask; 60s timeout, retry/backoff, ~1M-char cap.
- **Packaging:** electron-builder → NSIS installer + portable .exe (x64). `asarUnpack` covers better-sqlite3, tesseract.js(+core), and `assets/ocr`.
- A companion **mobile app** (BilimHezinisi-Mobile) shares this AI/parser logic; `_mobile-ai-reference/` is the read-only port source.

## Feature Set
1. Book Management — single/bulk import, metadata edit, export. Formats: PDF, TXT, DOCX, DOC, HTML, Markdown, web URL.
2. OCR — auto-detect scanned PDFs → offline Uyghur OCR; image & clipboard OCR; optional AI cleanup of recognition errors.
3. Category System — hierarchical tree, drag-and-drop, tags.
4. Search Engine — cross-book FTS5, phrase/wildcard/Boolean operators; target <3s over 500 books.
5. Book Reader — RTL, themes, bookmarks, notes, print; plus AI panel (summarize, explain, translate, term-explain, ask).
6. Quran Module — mushaf view, FTS over ayas, copy.
7. Notebook — rich-text editor, format painter, find/replace, word count, DOCX export, collapsible panels; plus AI menu (translate, Uyghur proofread, chat, page Q&A).
8. Spellcheck — SymSpell + n-gram over a Uyghur dictionary.
9. Optional Gemini AI — bring-your-own-key, content-type-aware prompts, OCR cleanup, metadata autofill; fully gated/hidden when disabled or no key.
10. .EXE Installer — NSIS + portable.

## Language & Content
Primary UI = Uyghur, **RTL mandatory**. Content languages: Uyghur, Arabic, English, Turkish.

## Performance Targets
Startup <3s · Import <10s · Search (500 books) <3s · AI responses stream incrementally.

## DO-NOT-TOUCH (hard constraints)
- Renderer CSP stays `connect-src 'self'` — the renderer NEVER talks to the network; ALL AI traffic is main-process only.
- CORE features must keep working with no network and no AI key. AI is always opt-in and gated.
- Never log or expose the API key beyond a masked form; it stays in the main process.
- Do not relocate, rename, or rewrite the user library at `JamiyKutupxana`.

## Build / Release Workflow
Edit only in the source folder → `node --check` changed files → test with `npm start` (or `npm run dev` for risky tests) → bump `version` in `package.json` → `npm run fetch-ocr-models` on a networked machine (BEFORE dist, so models ship) → `npm run dist-win` → commit per change.

## Roadmap / Future Direction
- Desktop ↔ mobile feature parity from shared AI/parser logic.
- Deepen AI usefulness for classical Uyghur/Arabic texts; add usage/quota visibility; investigate an offline/local model option to restore fully-offline AI.
- Reliable single-step (native) undo for AI-applied text edits (proofread / OCR-cleanup).
- More import formats (e.g. EPUB) and expanded OCR coverage.
- Optional backup/sync for the library and notes.
