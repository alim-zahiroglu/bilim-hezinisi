# Claude Code Task — "Bilim Hezinisi" Desktop: full UI/UX polish & visual-design pass

This is a **visual polish / design-system pass — NOT a feature change and NOT a rewrite.** The goal: make the app look professional, cohesive, and premium while keeping every existing feature, element `id`, and JS hook working exactly as before. Work **surface by surface**, test after each, and **commit per phase**. Do not merge to `master`.

## 0. Hard constraints (critical for a UI pass)
1. **Do not change app logic, IPC, database, or feature behavior.** Edit CSS, add class names, and add only minimal markup wrappers. **Preserve every existing `id`, `onclick`, `data-*`, and JS hook** — the renderer JS depends on them. If you must restructure markup, keep the same IDs/handlers.
2. Keep the renderer **offline** and CSP `connect-src 'self'`. **No external fonts or CDNs** — use only bundled assets. No new network requests.
3. **RTL is mandatory.** Use logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline`, `text-align: start`) so spacing/alignment stay correct in RTL.
4. **Preserve all THREE themes** — light (`:root`), dark (`html.dark`), and sepia (the third token block, lines ~58–62 of `src/index.html`). Every change must look right in all three. **Always use the CSS variables — never hard-code a color.**
5. Preserve CRLF. Run `node --check` on any changed inline `<script>`, and confirm the app boots clean after each phase.
6. Minimal, reviewable diffs. Keep all UI text in Uyghur (do not translate visible strings).

## Current design system (build on this — do NOT reinvent the palette)
- **Tokens** (`src/index.html` `:root` / `html.dark` / sepia): accent `--am` (#BA7517 amber) + tints `--ab`,`--ab2`,`--at`; surfaces `--bg`,`--bg2`,`--bg3`; text `--text`,`--text2`,`--text3`; `--border`,`--border2`; `--radius`(10px),`--radius2`(6px); Uyghur font `--jf` ('UKIJ Ekran').
- **Components:** `.card`/`.cico`/`.cfmt`/`.cbac` (book cards), `.row` (list), `.sr` (search result), `.hbtn` (buttons), `#side` (category sidebar), `#hd`/`#sb`/`#titlebar` (chrome), `.mbox`/`.inp`/`.fz` (modals), `#rai-panel`/`#rnotes-panel` (reader panels). Notebook styles in `src/notes.css`; Quran in `src/quran.css`.
- The warm **amber-gold-on-cream "manuscript" palette is good** and fits an Uyghur Islamic classical library. **Refine and apply it consistently — keep the hues.**

---

## Phase 1 — Design-system foundation
- At the top of the CSS, consolidate/document the scale: a consistent **spacing** rhythm (4 / 8 / 12 / 16 / 24), the existing radii, and **shadow tokens** — add `--shadow-1` (subtle card) and `--shadow-2` (popover/modal) if missing, defined per theme.
- Add a global **`:focus-visible`** ring (keyboard accessibility) using `--am`; add themed, **thin custom scrollbars**; normalize `transition` timing (~.15s).
- Ensure **every token used is defined in all three themes**. Verify text contrast (WCAG AA) for `--text`/`--text2` on `--bg`/`--bg2` in each theme; nudge token values only if a contrast fails.

## Phase 2 — Book cover system (replace the emoji placeholders — highest visual impact)
Today `.cico` renders a 30px emoji (🌙/🌷/🕌…); most DOC/DOCX books show an identical moon, so the grid looks broken. Replace with an elegant, **theme-aware inline-SVG cover** generated in JS (no external images required):
- Each cover is quiet card-art: a soft amber gradient or subtle **Islamic-geometric** motif; the book's **category** sets a small accent color/glyph; vary the motif/hue deterministically by hashing the title so the grid feels rich, not repetitive.
- Keep and restyle the `.cfmt` **format badge** (PDF/DOCX/DOC/TXT/WEB) as a small, refined chip.
- **If** the designed PNGs from the Claude Design brief exist at `assets/covers/<category>.png`, prefer them; otherwise use the SVG covers. Render crisply on hi-DPI.

## Phase 3 — Iconography unification & app icon
- Replace ad-hoc **emoji in the chrome** (card action buttons, sidebar category icons, menu items, panel headers) with **one consistent inline-SVG icon set** (lucide-style, `stroke="currentColor"` so it themes). Especially the card actions (delete / edit / open) and the category-sidebar icons. Keep emoji only where deliberately decorative.
- Integrate the new **app icon** from the Claude Design brief into `assets/icon.ico` / `icon.png` / `installer-icon.ico` and the titlebar brand lockup.

## Phase 4 — Polish each surface (one commit per surface)
- **Top chrome:** a clean brand lockup (icon + «بىلىم خەزىنىسى» + a subtle version chip), tidy menu-bar hover/active, the rounded search field `#sb` (focus ring + clear button), and the primary «+ كىتاب قوشۇش» button. Balance the heights of `#titlebar`/`#hd`.
- **Library grid & list:** strong card hierarchy (cover → title → author → category chip → format badge), refined hover/active elevation, the `.cbac` action row, the `.row` list density, pagination, and the «بارلىق كىتابلار (N)» header with the view-toggle + sort controls.
- **Category sidebar `#side`:** consistent SVG icons, counts as subtle pills, a clear active/hover state, and quiet section headers («تۈرلەر» etc.).
- **Reader + `#rai-panel`:** a comfortable reading measure and line-height for `--jf`; refined AI panel — the three scope buttons (تاللانغان / بۇ بەت / پۈتۈن كىتاب), the quick buttons (خۇلاسىلەش · تەرجىمە · مەركىزىي ئىدىيەسى · ئاتالغۇ چۈشەندۈرۈش), answer typography, and the «✨ Gemini ئىملا تۈزىتىش (تور)» state.
- **Quran mushaf:** dignified ayah typography (Uthmanic), a refined ayah-number medallion, clean translation block, surah-list rows, and the search bar.
- **Notebook:** grouped editor toolbar, the three AI-panel tabs «📖 قۇرئان (تورسىز) / 🔗 مەنبە (تورسىز) / ✨ AI (تورلۇق)», notes-list cards, and the find/replace bar.
- **Modals, toasts, empty & loading states:** calm, consistent, on-brand (e.g., a tasteful empty-library welcome).

## Phase 5 — Verification
- Boot with `npm run dev`; walk **every** screen in **all three themes**; confirm nothing functional broke (import, search, reader, Quran, notebook, AI functions, the scanned-PDF OCR offer), RTL is correct, no console errors, and DevTools → Network stays empty.
- Capture before/after screenshots of the main screens.
- Commit per phase; leave merging to the owner.

> Language note: instructions here are English; the Uyghur strings in «...» are live UI text — keep them verbatim.
