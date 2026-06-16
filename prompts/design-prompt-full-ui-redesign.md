# Claude Design Brief — "Bilim Hezinisi" (بىلىم خەزىنىسى) — full app UI redesign

> Paste this whole brief into Claude and attach the 8 app screenshots (7 day screens + 1 night screen).
> Your job is to design the most premium, cohesive visual identity for this app and deliver it as a
> single self-contained interactive HTML preview that I can open and judge. **Design freely — you decide
> the layout, hierarchy, and treatment at your highest level.** The only things you may NOT change are
> listed under "Hard rules" (they protect the app's offline engine and its features). Everything else —
> spacing, shadows, shapes, motion, the book-cover art, the way panels feel — is yours to elevate.

---

## 1. What you are designing (the soul of the app)

**بىلىم خەزىنىسى — "Bilim Hezinisi" / "Knowledge Treasury"** is an **offline Uyghur Islamic digital
library** for Windows. Think of it as a *private digital manuscript library* a scholar keeps on their own
machine: Qur'an, tafsir, hadith, fiqh, ʿaqīdah, history, and literature — hundreds of books, fully
searchable, fully usable with no internet.

The personality is **scholarly, warm, timeless, trustworthy** — a quiet study room lined with bound
books, not a cold "tech" dashboard. It is **right-to-left Uyghur (Arabic script)** first. It already has a
deliberate aesthetic — warm ivory parchment, walnut brown, antique gold, ink-black type, faint paper
grain — and your redesign should *deepen and perfect* that identity, not throw it away. Make it feel like
a real, expensive, finished desktop product.

Cultural guardrails: respectful Islamic aesthetic; **no figurative depiction of people or prophets**;
tasteful Islamic-geometric / Uyghur ornament only, used sparingly; a crescent may appear but avoid cliché.

## 2. The surfaces you must cover (from the 8 screenshots)

Reproduce **every** screen and the major states, in **both Day and Night**:

1. **Library dashboard** — top title bar (brand lockup + RTL menu bar + settings/theme toggles), a search
   header with add/import buttons, a **right-hand vertical sidebar** (mode tabs, category list with live
   counts, "recently opened" list), and a spacious grid of **book-cover cards** (with a list-view variant).
   One card is "selected" and glows gold.
2. **Qur'an reader** — mushaf-style ayah cards with the Arabic verse and the Uyghur translation beneath,
   a sūrah list on the right, and a search/translation toolbar.
3. **Notebook / "خاتىرە دەپتىرىم"** — a rich-text editor with a formatting toolbar, a left AI panel
   (Qur'an / sources / AI tabs), a right list of saved notes, word/char counters, and a "Word" export.
4. **Notebook AI menu open** — the "Gemini" AI dropdown (translate, proofread, rewrite, page Q&A).
5. **Book reader** — a centered reading page on parchment, a top bar with font picker, A−/A+ size,
   PDF/DOCX/TXT export, AI, bookmark and in-book search.
6. **Book reader + AI assistant panel** — the right "سۈنئىي ئىدراك ياردەمچىسى" panel: scope buttons
   (selection / page / whole book), text-type selector, quick actions (summarize, translate, central idea,
   term-explain), a question box, and answer area.
7. **A title-bar dropdown menu** (e.g. the File menu) — custom RTL menu with line icons + shortcuts.
8. **Night mode** — the same world after dark: deep charcoal, dark leather panels, gold rim-light.

Also design the **modal/dialog family** (add book, edit, batch import, web import, settings/AI key, category
manager, stats, about), **toasts**, the **drag-and-drop file zone**, **progress bars**, **empty states**,
and the **line-icon set** — they all belong to the same system.

## 3. Your creative mandate

I am **not** going to tell you which area to lay out where or how. Use your strongest design judgment.
Decide the spatial system, the type scale, the card anatomy, the shadow and light model, the way the gold
is used, the book-cover art direction, the micro-interactions. Surprise me with the most refined,
production-grade result you can make from this app's content and feeling. Show range across all screens so
the system reads as one designed product.

---

## 4. Hard rules (do not break these — they keep the app working)

These are the *only* limits on your freedom. They are about the engine and the language, never about taste.

1. **Restyle, never re-feature.** Keep **every** control, menu item, tab, category, badge, toggle, and
   label that appears in the screenshots — with its **exact Uyghur text, verbatim**. Do not remove, rename,
   merge, hide, or invent features to "tidy up." If something looks redundant, keep it and make it elegant.
   Never add a control that wouldn't do anything.
2. **All visible text stays Uyghur (Arabic script), exactly as shown.** Copy the labels from the
   screenshots. Your notes/rationale to me can be in English; nothing in the UI may be.
3. **Right-to-left is mandatory.** Build the whole thing `dir="rtl"`. Use logical CSS properties
   (`margin-inline`, `padding-inline`, `inset-inline-*`, `text-align:start/end`) so it mirrors correctly.
4. **Fully offline — no network of any kind.** No Google Fonts, no CDN CSS/JS, no remote icons or images,
   no `<link>` to anything external. Everything must be inline or use the bundled local fonts named below.
   (The real app runs under a strict Content-Security-Policy that blocks all external requests; an external
   reference would simply fail to load.)
5. **Drive everything through CSS custom properties — never hard-code a color.** The app already themes
   itself by swapping one set of variables. **Reuse these exact variable names** so your output drops
   straight into the codebase, and supply a complete value set for each theme. The current values are:

   **Day (`:root`):**
   ```
   --am:#B0832F; --at:#5A4327; --ab:rgba(176,131,47,.14); --ab2:rgba(176,131,47,.24);
   --bg:#FBF6EC; --bg2:#F4EAD7; --bg3:#EADFC8;
   --text:#2A2012; --text2:#6B5840; --text3:#9A8A70;
   --border:rgba(90,70,40,.16); --border2:rgba(90,70,40,.30);
   --gold:#C9A24B; --walnut:#5A4632; --paper:#FFFDF8; --paper-bd:rgba(90,70,40,.14);
   --shadow-1:0 2px 10px rgba(70,50,20,.08); --shadow-2:0 14px 38px rgba(70,50,20,.18);
   --glow:0 0 0 2px var(--am),0 6px 20px rgba(201,162,75,.25);
   --radius:10px; --radius2:6px; --radius-lg:14px;
   --jf:'UKIJ Ekran','Traditional Arabic','Arabic Typesetting',serif;
   ```
   **Night (`html.dark`):**
   ```
   --am:#E0B85E; --at:#241C12; --ab:rgba(224,184,94,.18); --ab2:rgba(224,184,94,.30);
   --bg:#14110B; --bg2:#1E1910; --bg3:#2A2215;
   --text:#F3E9D2; --text2:#D8C195; --text3:#AC9468;
   --border:rgba(224,184,94,.16); --border2:rgba(224,184,94,.30);
   --gold:#E8C879; --walnut:#3E2F1E; --paper:#221B11; --paper-bd:rgba(224,184,94,.14);
   --shadow-1:0 2px 12px rgba(0,0,0,.45); --shadow-2:0 16px 44px rgba(0,0,0,.6);
   --glow:0 0 0 2px var(--am),0 6px 22px rgba(224,184,94,.3);
   ```
   You may **re-tune** these values for a better look, **add new variables** (e.g. more spacing or
   elevation tokens), and improve the **paper-grain** texture (it's an inline `feTurbulence` SVG data-URI,
   ~3–5% opacity) — but keep the existing names so nothing downstream breaks. There is also a third theme
   `html.sepia` (warm reading mode); give it a value set too, aligned to the Day family.
6. **Local fonts only** (already bundled, reference by these family names):
   - UI / Uyghur body: **`'UKIJ Ekran'`** (plus `'UKIJ Esliye'`, `'UKIJ Tuz Tom'` for headings if useful).
   - Qur'an / Arabic text: **`'Traditional Arabic'` / `'trad-arabic'`**, and the mushaf uses **UthmanicHafs**.
   - Reader's selectable fonts: **UKIJ Ekran · Traditional Arabic · Bahij Nazanin** (keep this choice).
   In the preview you can `@font-face` them from the same filenames or fall back to a system serif, but the
   design must assume these families.
7. **One inline line-icon set — no emoji.** The app uses a single lucide-style inline `<svg><symbol>` sprite
   (`stroke="currentColor"`, ~1.6 stroke width): book, book-open, scroll, mosque, feather, sparkles,
   folder, search, settings, moon/sun, bookmark, trash, pencil, download, etc. Refine/extend this one
   coherent set; never use emoji or raster icons in the chrome.
8. **Keep the markup mappable.** This preview will be hand-ported onto the real app, which wires hundreds of
   functions to specific element IDs/classes and `onclick`s. So organize your HTML into the **same regions**
   (title bar, header, sidebar, main grid, reader, the AI panels, each modal) and use **clear, stable class
   names**. Don't obfuscate structure or collapse distinct controls into one. Visual layer only — assume the
   real IDs and event handlers get reattached during integration.

---

## 5. Aesthetic direction (build on what exists; raise it)

- **Day:** warm ivory ground, parchment panels, faint paper grain, walnut accents, muted antique-gold
  highlights, ink-black type. Soft daylight from the upper-start; delicate layered shadows; gold used
  sparingly for emphasis and the selected state.
- **Night:** deep charcoal-black, dark-leather panels, walnut surfaces, antique-gold accents, warm-ivory
  type. A private study at night; gentle cinematic light; a soft gold rim on the selected card.
- **Book covers are the centerpiece.** Replace any flat/emoji placeholders with **portrait, theme-aware,
  inline-SVG book covers** (≈3:4): a leather/cloth/parchment material in a per-category color (oxblood,
  teal, walnut, navy, parchment, ink-gold), an embossed double gold frame with small corner ornaments, the
  real Uyghur title in gold centered on the cover, a subtle spine strip on the binding edge (right edge in
  RTL) and a top-start sheen, plus a small format badge (PDF/DOCX/TXT/WEB). Plain documents get a tasteful
  *parchment-page* preview instead. The grid should look like a shelf of real, varied books.
- Generous spacing, a clear type hierarchy, soft focus rings (`--glow`), thin themed scrollbars, and quiet
  ~.15s transitions. Avoid clutter, cartoon styling, harsh pure-white or pure-black, and heavy gradients.

## 6. What to deliver

1. **A single self-contained `.html` file** (one file, no external requests) that renders the redesigned
   app: at minimum the **Library dashboard, Book reader (+ AI panel), Qur'an reader, and Notebook**, plus
   the modal family — each in a switchable view, with a **Day/Night toggle** that recolors everything by
   swapping the variables. Use the **real Uyghur labels** from the screenshots. This is the visual north
   star I will approve from.
2. **The redesigned design system, copy-pasteable:** the full `:root` / `html.dark` / `html.sepia` token
   blocks, and the restyled component CSS (cards, sidebar, toolbar, buttons, inputs, modals, reader, AI
   panels, icons), organized so it can be ported into the real `index.html`, `quran.css`, and `notes.css`.
3. **A short English design rationale** (a few paragraphs): the ideas behind the layout, the type scale,
   the cover system, how Day/Night differ, and anything you'd refine next.

Keep iterating with me until the look is right; then I'll hand the approved system to be integrated into the
real code with all functionality preserved.
