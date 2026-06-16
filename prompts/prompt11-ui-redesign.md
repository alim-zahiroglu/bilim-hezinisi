# Claude Code Task — "Bilim Hezinisi" Desktop: premium UI redesign (Day + Night)

Implement the **approved redesign** across the whole app. This is a **visual + light structural** pass — NOT a feature rewrite. Reproduce the look defined by the approved mockups and the 12 per-screen design briefs in **`prompts/ui-design-reference/*.txt`** (Day + Night for: Library Dashboard, File-Menu Dropdown, Notes/AI Workspace, Quran Reader, Quran Search Toolbar, Note Editor Toolbar). Read those briefs — they are the visual north star; this document maps them onto the real code and adds the system-level detail.

> ⚠️ **Do this on a NEW branch** (e.g. `feat/ui-redesign`). A full source backup already exists (`BilimHezinisi-Source-2.8.0.zip`). Work **phase by phase**, build after each, screenshot, and **commit per phase**. Do not merge to `master`.

> 🔒 **RESTYLE ONLY — preserve every feature.** This task changes *appearance*, never behavior. Every existing button, menu item, section, category, label, mode, and keyboard shortcut must remain present and fully functional with its real Uyghur name. Do not remove, rename, merge, hide, or fake any control in the name of "tidying" the layout. If a redesign element seems to drop something that exists today, keep it.

## 0. Hard constraints (non-negotiable)
1. **Never break a feature.** Edit CSS, add classes, and reorganize/restyle markup — but **preserve every existing element `id`, `onclick`, `data-*`, and global JS function/hook.** When you move an element, keep its id and handler. If unsure whether something is referenced by JS, grep first.
2. **Offline + security:** renderer stays CSP `connect-src 'self'`; **no external fonts, icons, images, or CDNs** — everything inline or from bundled `assets/`. No new network calls.
3. **RTL mandatory.** Use logical properties (`margin-inline`, `padding-inline`, `inset-inline-*`, `text-align:start/end`). Test every screen in RTL.
4. **Two complete themes — Day and Night — must both be flawless.** Drive everything through CSS variables; never hard-code a color. (The app currently has `:root` light, `html.dark`, and a sepia block — re-tune these: `:root` = Day, `html.dark` = Night; keep sepia only if it still looks intentional, otherwise align it to Day.)
5. Preserve **CRLF**; run `node --check` on every changed inline `<script>`; confirm a clean boot after each phase.
6. **All visible text stays Uyghur** (verbatim). Instructions in this doc are English.
7. Minimal logic changes. If a mockup element has **no backing feature** (e.g. "downloads"), either omit it or wire it to the nearest real feature — **never fake** a control that does nothing.

## Aesthetic summary (from the briefs)
- **Day:** warm ivory background, parchment panels, faint paper grain, walnut-brown accents, muted antique-gold highlights, ink-black type. Calm, scholarly, book-centered. Soft light from upper-left; delicate shadows; faint gold edge-reflections.
- **Night:** deep charcoal-black, dark leather panels, walnut surfaces, antique-gold accents, warm-ivory type. A private study room at night; soft cinematic light, gentle gold rim-light on the selected card.
- Realistic **book covers** (leather/cloth/parchment, embossed gold frame, title on the cover), refined **line icons**, generous spacing, soft layered shadows, gold used sparingly for emphasis.

---

## Phase 1 — Design-system foundation (`src/index.html` token blocks)
Re-tune the CSS variables to these target values (adjust ±slightly for contrast). Keep the variable **names**.

**Day (`:root`):**
```
--bg:#FBF6EC; --bg2:#F4EAD7; --bg3:#EADFC8;
--text:#2A2012; --text2:#6B5840; --text3:#9A8A70;
--am:#B0832F; --at:#5A4327; --ab:rgba(176,131,47,0.14); --ab2:rgba(176,131,47,0.24);
--border:rgba(90,70,40,0.16); --border2:rgba(90,70,40,0.30);
--gold:#C9A24B; --walnut:#5A4632;
```
**Night (`html.dark`):**
```
--bg:#15120C; --bg2:#1F1A11; --bg3:#2A2216;
--text:#EFE4CC; --text2:#C2AA7E; --text3:#8A7858;
--am:#CDA24E; --at:#241C12; --ab:rgba(205,162,78,0.16); --ab2:rgba(205,162,78,0.26);
--border:rgba(205,162,78,0.14); --border2:rgba(205,162,78,0.28);
--gold:#E0B85E; --walnut:#3E2F1E;
```
Also add, per theme:
- **Shadow tokens:** `--shadow-1` (soft card, e.g. Day `0 2px 10px rgba(70,50,20,.08)`, Night `0 2px 12px rgba(0,0,0,.45)`), `--shadow-2` (popovers/modals, deeper), `--glow` (selected gold rim, e.g. `0 0 0 2px var(--am), 0 6px 20px rgba(201,162,75,.25)`).
- **Spacing scale** (comment): 4 / 8 / 12 / 16 / 24 / 32. **Radii:** keep `--radius`(10) `--radius2`(6) and add `--radius-lg`(14) for cards/panels.
- **Paper grain:** a faint tiling texture via an inline SVG `feTurbulence` data-URI, applied very low-opacity (~3–5%) as a layered `background-image` on `--bg`/panels. Offline, no asset. One helper class `.grain`.
- Global **`:focus-visible`** ring using `--am`; **thin themed scrollbars**; consistent `transition:.15s`.

**Acceptance:** toggling Day/Night recolors the entire app cohesively; paper grain is subtle; contrast passes for body text in both.

---

## Phase 2 — Brand lockup & iconography
- **Brand lockup** (top-start of the chrome): the app icon + «بىلىم خەزىنىسى» (primary) with «BILIM HEZINISI» beneath (note the spelling: **HEZINISI**, not XEZINESI), plus a subtle version chip («v2.8.0»). Match the mockup proportions.
- **App icon — use the owner's provided artwork; do NOT redesign or replace it.** The in-app brand mark + desktop icon = the *golden-light open book on deep green* (owner-provided). The installer icon = the *“bilim hezinisi”-titled* mark (owner-provided). They live at `assets/icon.*` / `assets/installer-icon.ico` (owner supplies the final PNG/ICO); the header brand lockup uses the golden-light book icon.
- **Replace ALL emoji** in chrome (sidebar items, card actions, menu items, panel headers, toggles) with **one refined inline-SVG line-icon set** (lucide-style, `stroke="currentColor"`, ~1.6 stroke). Keep a single `<svg><symbol>` sprite or small JS icon map. No emoji in the redesigned UI.

**Acceptance:** consistent line icons everywhere; brand lockup looks premium in both themes.

---

## Phase 3 — Realistic book-cover system (centerpiece — replaces emoji placeholders)
Today `.cico` shows a 30px emoji. Replace it with a **portrait, theme-aware, inline-SVG book cover** generated in JS per book. Restructure `.card` so the cover is a portrait thumbnail (≈ 3:4, e.g. 150×196) above the title block.

**Cover SVG spec (build a `bookCoverSVG(book)` helper):**
- **Material background:** a leather/cloth gradient in a **category color** — choose from a curated set: oxblood `#6E2B2B`, teal `#1F5A4E`, walnut `#4A3320`, navy `#21314F`, parchment `#E8DBBE` (with dark text), ink-gold `#1E1A14`. Pick by category; if unknown, hash the title to pick deterministically so the grid looks varied.
- **Embossed gold frame:** a double inset rule + small corner ornaments (simple gold rules/diamonds — **no multi-pointed stars, no overlapping squares**), using `--gold`.
- **Title on the cover:** the book's real title in Uyghur, gold, centered, RTL, in the UI font (`var(--jf)`), 2–3 lines max with ellipsis; a smaller author/subtitle line if present.
- **Binding & sheen:** a subtle darker spine strip on the binding edge (RTL → the right edge) and a soft top-left sheen highlight.
- **Format badge:** keep `.cfmt` (PDF/DOCX/EPUB/TXT/WEB) as a small refined chip, bottom-corner.
- **Document-preview variant:** for plain text-like docs (e.g. a generic DOCX/TXT with no "book" identity), render a *parchment page* cover instead — faint horizontal text-lines on parchment, a folded corner, and the title — matching the document-preview card in the mockup.
- Crisp on hi-DPI; cheap to render for ~100+ cards (generate once, cache markup per book id).
- If finalized cover PNGs exist at `assets/covers/<category>.png`, you may use them as the material layer; otherwise the SVG is the default.

**Card chrome:** title (1–2 lines), author·category·date row, the `.cbac` action buttons as icon buttons (open/edit/delete/favorite), hover = lift + `--shadow-1` + faint gold edge; the **selected** card = `--glow` gold rim (matches the highlighted card in the mockup).

**Acceptance:** the library grid looks like a shelf of real books (varied, premium) in both themes; no emoji; the one selected card glows gold; document-type files show a tasteful page preview.

---

## Phase 4 — Navigation (RESTYLE ONLY — keep the real structure, names, and every control)
This is a **re-presentation** of the existing navigation — do NOT invent, rename, merge, or remove items. Use the app's exact Uyghur labels and existing handlers.
- **Right nav rail** (restyle the existing `#side`; in RTL it must sit on the **right** edge of the window): premium vertical nav, line icons, gold active state, footer metric. Contents = the app's real navigation, top→bottom:
  - **Modes** — the existing `.mt` tabs; keep `setMode(...)` and `Ctrl+1/2/3`: «كىتابخانا» · «قۇرئان كەرىم» · «خاتىرە دەپتىرىم».
  - **«تۈرلەر»** — the real category list with live counts, rendered from real data and driving the existing category filter (`S.cat` → `renderBooks()`): بارلىق كىتابلار، قۇرئان ۋە تەپسىر، ھەدىسلەر، فىقھى كىتابلار، تەۋھىد ۋە ئەقىدە، تارىخ، ئەدەبىي ئەسەرلەر، … (use the actual categories present).
  - **«يېقىندا ئوقۇلغانلار»** — the real recent list (`S.recent`).
  - Footer: a real metric (e.g. «جەمئىي N كىتاب»). Do not fabricate disk/storage usage.
- **Top bar — keep ALL FOUR add/import controls**, wired to their existing handlers; just restyle them (swap the leading emoji for line icons): «تۈرلەر» → `showCatsMgr()`, «توپلاپ قوشۇش» → `showBatchImport()`, «تور بەت قوشۇش» → `showWebImport()`, «+ كىتاب قوشۇش» (gold primary) → `showAdd()`. Do not drop or merge any of them.
- Keep the format filter, sort, and view-toggles with their existing logic.
- **Do NOT add invented sections** (no "favorites/downloads/search" rail items unless that feature already exists). Every existing way to reach a feature must remain.

**Acceptance:** the rail (on the right) shows the real كىتابخانا/قۇرئان كەرىم/خاتىرە دەپتىرىم + تۈرلەر (with counts) + يېقىندا ئوقۇلغانلار; all four add/import buttons present and working; category/format/sort/view all work; nothing removed or renamed.

---

## Phase 5 — Per-surface styling (one commit each; read the matching reference brief)
For each, apply the Day/Night system, spacing, shadows, gold accents, and line icons. Map to the real components.

1. **Library dashboard** (`#hd`/`#sb`/`#titlebar`, `.card`/`.row`, pagination) — ref 01/02. Polished top bar (brand, search with magnifier + internal-text search, «+ كىتاب قوشۇش» gold button, folder/filter/view-toggles, settings/notification/avatar), spacious grid, refined list view.
2. **Top menus / File dropdown** (the `ھۆججەت` etc. menus) — ref 03/04. A floating **parchment-glass** panel: `--radius-lg`, `--shadow-2`, thin gold border, line-icon rows, muted shortcut hints (Ctrl+N / Ctrl+Q), gold hover, RTL alignment, gentle glow on the active menu button.
3. **Notes & AI workspace** (`src/notes.css`, the three-tab panel «📖 قۇرئان (تورسىز) / 🔗 مەنبە (تورسىز) / ✨ AI (تورلۇق)», notes list, editor) — ref 05/06. Parchment editor surface, refined right notes-list (selected = gold accent), left AI/source panel with tag-like action chips (خۇلاسىلەش / تەرجىمە / مەركىزىي ئىدىيەسى / …), model selector, status.
4. **Note editor header & toolbar** — ref 11/12. Title + save + close; grouped formatting toolbar (font dropdown, alignment, B/I/U, quote, list, undo/redo, format-painter), AI selector, toggles — rounded buttons, soft shadows, selected states, compact and aligned.
5. **Quran reader** (`src/quran.css`) — ref 07/08. Sacred calm: parchment reading column, large Uthmanic Arabic, refined **circular gold verse markers**, Uyghur translation beneath each ayah, delicate separators, generous vertical rhythm; right Surah list with circular number badges + selected highlight; soft scroll indicators.
6. **Quran search / translation toolbar** — ref 09/10. Large search field + magnifier, translation toggle, language dropdown, Surah selector, Ayah input, gold «ئىزدەش» button; rounded, delicate borders, refined hover/active.
7. **Book reader + `#rai-panel`** — comfortable measure & line-height; the AI panel (scope buttons تاللانغان/بۇ بەت/پۈتۈن كىتاب; quick actions خۇلاسىلەش·تەرجىمە·مەركىزىي ئىدىيەسى·ئاتالغۇ چۈشەندۈرۈش; «✨ Gemini ئىملا تۈزىتىش (تور)») styled as refined cards; the page-image annotation toolbar (pens/colors) as a floating glass bar like the mockup.
8. **Settings, modals (`.mbox`/`.inp`/`.fz`), toasts, empty & loading states** — consistent parchment-glass panels, calm empty-library welcome with the brand mark, refined inputs/file-dropzone, gold primary buttons.

**Acceptance:** each screen visibly matches its reference brief in both themes; all controls keep working.

---

## Phase 6 — Verification
1. `node --check` on changed inline `<script>`; CRLF preserved.
2. Build/boot (`npm run dev`); walk **every** surface in **Day and Night**: library grid+list, filters/sort/search, reader, Quran, notebook + AI tabs, OCR offer, settings, dialogs. Confirm: no feature lost, RTL correct, no console errors, DevTools→Network empty.
3. Capture **before/after** screenshots (Day + Night) of each main screen.
4. Commit per phase. Leave merging to the owner.

---

### Notes
- The 12 design briefs in `prompts/ui-design-reference/` are the authoritative look per screen; this document is the engineering plan that maps them to the codebase and guarantees nothing breaks.
- Language convention: English instructions; Uyghur «...» strings are live UI — keep verbatim. The Uyghur prompt templates in `ai.js` are unrelated to this task — don't touch them.
