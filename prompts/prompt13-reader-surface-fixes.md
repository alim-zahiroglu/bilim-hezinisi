# Claude Code Task — "Bilim Hezinisi" UI: reader divider, lighter reading surfaces, contrast/size fixes

Continue on the UI branch. **Restyle only — preserve every feature, label, and handler.** Drive everything through CSS tokens (never hard-code colors); keep RTL; both Day + Night must stay correct; `node --check` changed inline `<script>`; preserve CRLF; commit per phase; don't merge to master.

---

## Phase 1 — Reader: draggable left divider (like the notebook)
In the **book reader**, the left panel (the AI panel `#rai-panel`, and the notes panel `#rnotes-panel` if shown) must be **resizable by dragging its divider left/right**, exactly like the notebook's panels.
- Reuse the existing notebook splitter mechanism (the `.notes-splitter` / pointer-drag + clamp + persist logic added for the notebook). Add the same draggable splitter between the reader's main reading area and the left `#rai-panel`.
- Clamp to a sensible range (e.g. 280–560px); persist the width via `dbSetSetting('reader_ai_panel_width', …)` and restore on open; keep the existing collapse behavior.

**Acceptance:** the reader's left divider drags smoothly to resize the AI panel; width persists across restarts; collapse still works.

## Phase 2 — Lighten the reading / writing surfaces (keep the warm theme)
Keep the overall warm parchment background as-is. But the surfaces where text is **read or written** should be **lighter / closer to white** (Day), so text is crisp and restful — close to the Claude-desktop feel. Introduce a dedicated surface token and apply it:
- Add per theme:
  - Day: `--paper:#FFFDF8;` (near-white warm) and `--paper-bd:rgba(90,70,40,.14);`
  - Night: `--paper:#221B11;` (a touch lighter than `--bg`, for an elevated reading surface) and `--paper-bd:rgba(224,184,94,.14);`
- Apply `--paper` as the background of: the **book reader content/page**, the **note editor canvas**, the **AI answer area**, and the **AI question / chat input** fields. Keep all chrome, side panels, cards, and the library grid on the existing `--bg`/`--bg2` (the warm look must NOT change overall).
- Text on `--paper` uses `--text` (primary) — so book content and AI answers read crisply.

**Acceptance:** the overall app still feels warm/parchment, but the reading text, AI answers, and the note canvas sit on a noticeably lighter surface; text is clearly sharper. Night mode stays comfortable (no glaring white).

## Phase 3 — AI answer area background + answer legibility
The AI answer region (reader `#rai-answer` / notebook AI tab result) must use the new `--paper` surface (near-white in Day) with `--text` body — so the streamed answer is high-contrast and clean (per the owner's screenshot). Give it comfortable padding and line-height (~1.9).

**Acceptance:** AI answers render as dark text on a near-white card (Day) — crisp and easy to read.

## Phase 4 — Notebook: toggle labels + AI-trigger color
- The two offline toggles «كىتاب ئامبىرىدىن ئىزدەش (تورسىز)» and «ئىملانى تەكشۈرۈش (تورسىز)» are too small — raise to **≥ 13px**, color `--text2`, with the checkbox sized to match.
- The AI trigger «✨ سۈنئىي ئىدراك ئىقتىدارلىرى (Gemini API — تور ھالىتىدە) ▾» label currently blends into the background. Set its **text color to `--text`** (near-black in Day, ivory in Night — high contrast), keep the gold ✨ icon and a thin gold border on a neutral surface so it stays distinct. **Do not** use gold text on a gold tint.

**Acceptance:** both toggle labels are comfortably readable; the AI-trigger text is clearly legible (dark in Day) and no longer merges with the background.

## Phase 5 — Quran search labels «سۈرە» / «ئايەت»
In the Quran search toolbar the «سۈرە» and «ئايەت» input labels/placeholders look lifeless/faint. Set their font to **`'UKIJ Tuz Kitab'`** (already declared as `@font-face` in `index.html`; file `assets/fonts/UKIJTuzKitab.ttf`), raise the color to `--text2` (not `--text3`), and bump size slightly so they read as solid, intentional labels.

**Acceptance:** the «سۈرە»/«ئايەت» fields look crisp and alive in UKIJ Tuz Kitab, clearly legible in both themes.

## Phase 6 — Verify
`npm run dev`; walk reader, notebook, Quran in **Day + Night**: reader divider drags + persists; reading/AI/editor surfaces are lighter and text is crisp; AI answer is near-white with dark text; notebook toggles + AI-trigger legible; Quran سۈرە/ئايەت labels in UKIJ Tuz Kitab. No feature lost; DevTools→Network empty. Commit per phase; before/after screenshots (Day + Night).

> Language: English instructions; Uyghur «...» strings are live UI — keep verbatim. Don't touch the `ai.js` Uyghur prompt templates.
