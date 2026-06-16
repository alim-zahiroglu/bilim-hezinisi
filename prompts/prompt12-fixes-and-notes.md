# Claude Code Task — "Bilim Hezinisi" UI: library fixes + Notes/AI workspace redesign

Continue on the UI-redesign branch. **Restyle only — preserve every feature, section, label, and handler** (see `prompt11-ui-redesign.md` §0). Commit per phase; don't merge to master.

**Pixel reference (open these):** `prompts/ui-design-reference/bilim-ui-preview.html` (library + covers), `…/bilim-ui-notes.html` (this task's target), `…/bilim-ui-quran.html`, plus the per-screen briefs `05/06_Notes_AI_Writing_Workspace_*.txt` and `11/12_Note_Editor_Header_Toolbar_*.txt`. Match them.

---

## Phase 1 — Fix the book-cover system (esp. hadith) to match the preview
**Problem:** in the shipped library, hadith-category books render with a wrong/plain cover; the covers don't match the quality of `bilim-ui-preview.html`.
**Fix:**
- Re-implement the cover so it **matches `bilim-ui-preview.html` exactly** — same gradients, gold double-frame, sheen, binding spine, centered title, and format badge (the `.cover` / `.c-*` / `.doc` styles in that file).
- **Drive the cover by CATEGORY, not by file format.** A DOCX/PDF/WEB hadith book must still get a real leather **book cover**, never the plain document-page style. Category → material color (match the preview): قۇرئان ۋە تەپسىر → teal; ھەدىسلەر → walnut; فىقھ → parchment; تارىخ → navy; ئەدەبىيات → oxblood; ئومۇمىي/uncategorized → ink-gold. Vary subtly by hashing the title.
- Reserve the **document-page** (parchment + faint lines + folded corner) style **only** for genuinely generic/uncategorized text files — i.e. the look the preview gives the «باشقا» item. (The owner specifically wants the hadith books to use the refined book cover, not that plain page.)
- Keep the format badge (PDF/DOCX/EPUB/TXT/WEB) and the title on the cover.

**Acceptance:** every hadith book shows the refined walnut book cover (title + gold frame), matching the preview; no plain/mismatched icon anywhere; all covers look like `bilim-ui-preview.html`.

## Phase 2 — Restore meaningful category icons (سىيرەت = Prophet's-Mosque)
When emoji were replaced by line icons, category-specific meaning was lost. Give each category an **apt** line icon and keep the meanings the app had before. In particular:
- **«سىيرەت» → a stylized Prophet's-Mosque (مەسجىدى نەبەۋى) icon** (dome + minaret), as before.
- قۇرئان ۋە تەپسىر → open-book/Quran; ھەدىسلەر → book; فىقھ → scales; تارىخ → column/monument; ئەدەبىيات → quill; سىيرەت → mosque; etc.
Use inline SVG, `stroke="currentColor"`. Do not regress to generic identical icons.

**Acceptance:** the سىيرەت row shows a mosque icon; each category has a fitting, distinct icon.

## Phase 3 — Typography, legibility & fonts (BOTH themes)
The redesign left several texts **too small and too faint** (the sidebar category list, the notes editor toolbar, card meta, menu rows). Fix legibility globally — in **Day and Night**.

**3a. Size & weight (raise the scale).** Comfortable minimums: nav + category items ≥ **14px**; section headers ≥ **12.5px**; card title ≥ 14px / subtitle ≥ 12px; toolbar button labels ≥ **13px**. Keep label weight 500–600 so nothing looks thin.

**3b. Contrast.** Use `--text` for primary labels (nav, category names, card titles, toolbar) and `--text2` for secondary — **not** `--text3` (reserve `--text3` for the faintest hints only). This was the main cause of the faint sidebar/cards in both themes. Night-mode tokens (raise contrast):
```
--text:#F3E9D2; --text2:#D8C195; --text3:#AC9468;
--am:#E0B85E; --ab:rgba(224,184,94,.18); --ab2:rgba(224,184,94,.30);
--border:rgba(224,184,94,.16); --border2:rgba(224,184,94,.30); --gold:#E8C879;
```
Also verify Day (the light-mode category list / card subtitles were faint too). Target WCAG AA. Never hard-code a color — use tokens.

**3b-bis. Never put gold text on the gold tint.** Gold text (`--am`) on the gold tint (`--ab`) blends — this is what made the AI-trigger button «✨ سۈنئىي ئىدراك ئىقتىدارلىرى …» and the note category tags (تەفسىر/ھەدىس/پلان) unreadable. Rules: gold text (`--am`) belongs on a **neutral** surface (`--bg`/`--bg2`/`--bg3`) — e.g. the AI trigger = neutral `--bg3` fill + `--am` border + `--am` text. On the gold tint (`--ab`) use `--text`/`--text2` for text. For a solid gold pill/badge use `--am` fill with `--at` text. Audit every chip, tag, badge, count pill, and active state for this.

**3c. Specific fonts (already declared as `@font-face` in `src/index.html` — just apply them):**
- The **«تۈرلەر» section header** → `font-family:'UKIJ Esliye'`, a touch larger, gold (`--am`).
- The **category-list item labels** → `font-family:'UKIJ Tuz Tom'`, ≥ 14px, color `--text` (counts stay in their pill).
- (Files exist at `assets/fonts/UKIJEsliye.ttf` and `assets/fonts/UKIJTuzTom.ttf`; `@font-face` for `'UKIJ Esliye'` and `'UKIJ Tuz Tom'` are already in `index.html`.)

**Acceptance:** in both Day and Night, the «تۈرلەر» header renders in UKIJ Esliye, the category items in UKIJ Tuz Tom (clearly larger, full contrast), and the card meta + notes toolbar are legible — nothing faint or cramped.

## Phase 4 — Notes / AI Writing Workspace redesign (next screen)
Apply the redesign to «خاتىرە دەپتىرىم», matching `bilim-ui-notes.html` and briefs 05/06 + 11/12. **Keep every existing notebook feature and handler** — this is restyle only.
- **Notes list (right):** «خاتىرە دەپتىرىم» header + «+ يېڭى خاتىرە» button + search; note rows with title, snippet, time, a colored category dot/tag; selected = gold accent. (Real list/CRUD untouched.)
- **Editor (center):** header with title, ✓ save status, save, close, and the **«Word» (DOCX export)** button; the full **formatting toolbar** — B/I/U, alignment (→ ≡ ←), quote, bullet/numbered list, font + size selectors, **format-painter**, undo/redo — restyled as grouped rounded buttons with separators; the AI trigger «✨ سۈنئىي ئىدراك ئىقتىدارلىرى (Gemini API — تور ھالىتىدە) ▾»; the offline toggles «كىتاب ئامبىرىدىن ئىزدەش (تورسىز)» / «ئىملانى تەكشۈرۈش (تورسىز)»; find/replace + word-count bars; a parchment writing canvas with comfortable measure and line-height.
- **AI panel (left):** the three docked tabs «📖 قۇرئان (تورسىز) / 🔗 مەنبە (تورسىز) / ✨ AI (تورلۇق)»; AI answer cards with a model line and copy / insert-to-note actions; the AI flyout menu items each with the leading gold bullet (تەرجىمە قىلىش ◂ / تىنىش بەلگىلىرى ۋە ئىملانى توغرىلاش / سۈنئىي ئىدراكتىن سوراش / كۆرۈنمە بەت ھەققىدە سوئال سوراش ◂). Keep the draggable splitters, panel collapse, and all `nai*` wiring.

**Acceptance:** the notebook matches `bilim-ui-notes.html` in Day + Night; every existing tool (format painter, find/replace, word count, DOCX export, the AI tabs/menu, collapse, splitters) still works.

## Phase 5 — Verify
`node --check` changed inline `<script>`; CRLF preserved; `npm run dev`; walk library + notebook (and the other screens) in **Day and Night**; confirm covers (hadith fixed), سىيرەت mosque icon, night-mode legibility, and that **no feature/section/label was removed or renamed**. DevTools→Network empty. Commit per phase; before/after screenshots (Day + Night).

> Language: English instructions; Uyghur «...» strings are live UI — keep verbatim. Don't touch the `ai.js` Uyghur prompt templates.
