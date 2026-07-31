# Bilim Hezinisi — UI / Editor Improvements (6 tasks)

You are working on **Bilim Hezinisi**, an offline-first Uyghur desktop library app built with **Electron 28 + plain JavaScript** (NO build / transpile step). Before changing anything, read `CLAUDE.md`, then locate the exact code for each task and write a short plan. Do the 6 tasks one at a time.

## Project conventions (must follow)
- **No transpile.** Preserve **CRLF** line endings. `node --check` must pass on every changed `.js` file and on the inline `<script>` blocks inside `src/index.html`.
- UI is **RTL Uyghur**. Write code and comments in **English**; only user-facing strings stay in Uyghur.
- **Do NOT touch** the renderer security model / CSP (`connect-src 'self'`) or any AI / Gemini logic.
- Change only what a task requires. After each task, test with `npm start`, then make a **separate commit**.
- The contentEditable editor uses `document.execCommand`. Prefer it (and `styleWithCSS`) so the native undo stack keeps working. Always guard against a collapsed/empty selection before acting.

## Key files & facts
- `src/index.html` — app shell + ALL inline CSS/JS. The **Book Reader** ("كىتاب ئوقۇش") and **Settings** live here. Relevant CSS vars: `--bg` = `#FBF6EC` (cream), `--bg2`/`--bg3`, `--paper` = `#FFFDF8` (the near-white "page" surface), `--paper-bd`. `@font-face` blocks are near the top (~lines 12–32).
- `src/notes.js` — the **Notebook** ("خاتىرە دەپتىرىم") rich-text editor.
- `src/quran.js` — the **Quran** ("قۇرئان كەرىم") module.
- Font files: `assets/fonts/` (UKIJEsliye, UKIJTuz, UKIJTuzKitab, UKIJTuzTom, UKIJTuzHeavy, UthmanicHafs…) and `assets/` (Bahij_Nazanin-Regular, trad-arabic, ukijekran, UthmanicHafs…).

---

## Task 1 — Update the backup-key help text (Settings)
**File:** `src/index.html`

In the Settings panel, under the **"زاپاس Gemini API ئاچقۇچلىرى"** heading, find the descriptive `<p>` paragraph beneath it. Replace ONLY its text with exactly:

> ئەگەر يۇقىرىدىكى Gemini API ئاچقۇچى ئالدىراش بولۇپ قالسا، زاپاس ئاچقۇچقا ئاپتوماتىك ئالمىشىدۇ. ھەر بىر زاپاس ئاچقۇچنى ھاسىل قىلغاندا چوقۇم «Choose an imported project» دىن ئوخشىمىغان «project» بەلگىلەپ ھاسىل قىلىڭ. شۇنداق بولغاندا، ھەربىر Gemini API مۇستەقىل ھەققى بولىدۇ.

Keep `<b>` emphasis on «Choose an imported project» and «project». Do not change layout or any other text.

---

## Task 2 — Whiten the Quran ayah background to match Reader/Notebook
**Files:** `src/quran.js`, `src/index.html`

The Book Reader and Notebook content surfaces already use the near-white `--paper` (`#FFFDF8`). The Quran ayah area still uses the cream `--bg`. 
- Find the container that renders the ayah rows (ayah + translation) and set its background to the SAME surface the Reader/Notebook content panel uses (`var(--paper)`). Verify what the reader/notebook content actually uses and match it (so light/dark themes stay consistent — use the variable, not a hard-coded hex).
- ONLY the ayah-content surface changes. Do NOT alter the Arabic ayah text color/font, the translation text, dividers, the header, or surrounding chrome.

---

## Task 3 — Make the Notebook Format Painter full-fidelity + fix its shortcuts
**File:** `src/notes.js` — `fpCaptureFormat` (~line 782), `fpApplyFormat` (~line 800), and the keyboard handler using `fpMod` (~line 626). The toolbar brush button (~line 379) already advertises "Alt+Ctrl+C / Alt+Ctrl+V".

The painter must work like Microsoft Word: copy the COMPLETE formatting of the source selection and apply ALL of it to the target.

- **Capture (`fpCaptureFormat`)** today returns: bold, italic, underline, strike, fontFamily, fontSizePx, color, background, align, blockquote. **Add** to it: `lineHeight`, `textIndent`, and paragraph `marginTop` / `marginBottom` — read these from the containing block's computed style (the code already resolves a `block` element; reuse it). Make sure `color` and `background` are read from the actual inline node under the selection.
- **Apply (`fpApplyFormat`)**:
  - Call `document.execCommand('styleWithCSS', false, true)` **before** the color/background commands. This is almost certainly why text color & highlight currently do NOT transfer (the user reports exactly this) — without styleWithCSS, `foreColor`/`hiliteColor` may emit `<font>` tags that don't stick. Keep the existing bold/italic/underline/strike, `fontName`, `fontSize`, `foreColor`, `hiliteColor`, alignment, and `formatBlock` calls.
  - For the new block-level properties (`line-height`, `text-indent`, `margin`), `execCommand` has no command — set them directly via `.style` on every block element that intersects the current selection.
- **Fix the shortcuts.** `Ctrl+Alt+C` must COPY the current selection's format (call the capture function), and `Ctrl+Alt+V` must APPLY it (call the apply function). The current `fpMod` condition `((e.ctrlKey||e.metaKey) && (e.altKey||e.shiftKey))` and/or the key test isn't firing — correct it so the two combos work. `preventDefault()` on them, only act when focus is inside the notebook editor, and don't break existing shortcuts (Ctrl+S, Ctrl+F, Ctrl+H).

**Acceptance:** select formatted text → `Ctrl+Alt+C` → select other text → `Ctrl+Alt+V` (and the brush button) transfers font family, size, **text color, highlight/background color**, bold/italic/underline, alignment, line spacing, and first-line indent. Native undo (Ctrl+Z) still works.

---

## Task 4 — Add Notebook formatting controls
**Files:** `src/notes.js`, `src/index.html` (notebook toolbar)

Add controls (applied to the current selection / paragraph). Reuse the format painter's block-resolution logic to find the target paragraph(s); guard against a collapsed selection.
1. **Text color** — color picker → `styleWithCSS(true)` then `foreColor`.
2. **Highlight / background color** — color picker → `styleWithCSS(true)` then `hiliteColor`.
3. **First-line indent in cm** (like Word) — a small numeric input in **cm** (e.g. `0.7`, `1.2`); set the target block(s)' `style.textIndent` to that value + `'cm'`.
4. **Line spacing** — a selector or numeric input (e.g. 1.0 / 1.15 / 1.5 / 2.0); set the target block(s)' `style.lineHeight`.

Match the existing toolbar's look and RTL layout.

---

## Task 5 — Fix the Quran search "سۈرە" / "ئايەت" field font
**File:** `src/index.html` (Quran search bar)

The "سۈرە" (sura) and "ئايەت" (ayah) search inputs and their placeholder text look faint/blurry. Set their `font-family` to **'UKIJ Ekran'** (the `@font-face` already exists at the top of the file; if missing, add one for `assets/ukijekran.ttf`). Ensure the placeholder uses the same font and reads clearly.

---

## Task 6 — Mirror all Notebook fonts into the Book Reader font selector
**Files:** `src/index.html` (Reader font selector); reference list in `src/notes.js` ~lines 348–356.

The Notebook font dropdown offers: **UKIJ Ekran, UKIJ Tuz, UKIJ Tuz Tom, UKIJ Tuz Kitab, UKIJ Esliye, Uthmanic Hafs, Bahij Nazanin**. The Reader currently offers only ~3 (Auto / "ئاپتوماتىك", UKIJ Ekran, Traditional Arabic, Bahij Nazanin).
- Add the SAME font options the Notebook has into the Reader's font selector, keeping the Reader's existing "ئاپتوماتىك" (Auto) option. `@font-face` rules are global in `src/index.html`, so the Reader can use them directly. **Verify** every font name resolves to a loaded face — if any (UKIJ Tuz / UKIJ Esliye / Uthmanic Hafs) is not defined, add an `@font-face` pointing to the matching file in `assets/fonts/`.
- Make sure picking a font in the Reader actually applies it to the book text (use the Reader's existing font-apply mechanism).

---

## Finish every task with
1. `node --check` on each changed `.js` and on the inline `<script>` blocks of `src/index.html`.
2. `npm start`; verify behavior and appearance (light AND dark theme for Task 2).
3. One commit per task.

When all 6 are complete: bump `version` in `package.json`, then `npm run dist-win`.
