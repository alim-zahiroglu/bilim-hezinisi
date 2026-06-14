# Claude Design Brief — "Bilim Hezinisi" (بىلىم خەزىنىسى) visual assets

Create polished, **original** brand art for an offline Uyghur Islamic digital library desktop app. Deliver high-resolution PNGs (transparent where noted). Original work only — do not copy existing logos, brands, or a living artist's style.

## The brand
- **Name:** بىلىم خەزىنىسى — "Knowledge Treasury". A classical Uyghur **Islamic library** app (Qur'an, tafsir, hadith, fiqh, history, literature).
- **Personality:** scholarly, warm, timeless, trustworthy — a *digital manuscript library*. Not cold or "techy".
- **Palette (match the app exactly):**
  - Amber/gold **#BA7517** and warm gold **#EF9F27** (primary)
  - Cream **#FFFBF5** / **#F5F0E8** (backgrounds)
  - Deep brown **#1A1208** / **#633806** (ink/contrast)
- **Motif language:** subtle **Islamic geometric** patterns and tasteful Uyghur ornament; the idea of *a book / a treasury / knowledge*. A crescent may appear but avoid cliché. Aim for **elegant modern-classical**, flat or semi-flat, print-quality.
- **Cultural guardrails:** no figurative depiction of people or prophets; RTL-friendly; respectful Islamic aesthetic.

## Deliverables
1. **App icon (top priority).** A crafted, instantly recognizable mark — e.g. an open book fused with a subtle geometric star/ornament, or a "treasure of knowledge" emblem.
   - 1024×1024 master PNG on a refined rounded-square background suitable as a Windows app icon, **plus** a transparent flat version.
   - Must stay clear and legible at **16–32px**. Test the small size.
   - (This will be converted to a multi-size `.ico` for `assets/icon.ico` and `assets/installer-icon.ico`.)
2. **Logo lockup.** The icon beside the «بىلىم خەزىنىسى» wordmark (Uyghur Arabic script), horizontal, for the app header / About screen. Transparent PNG in **light** and **dark** variants.
3. **Category cover-art set (recommended).** 6–7 cohesive, **text-free** cover designs (~800×1040, portrait) for the main library categories, each in the same style family with the category distinguished by accent color + a small central motif:
   - قۇرئان ۋە تەپسىر · ھەدىسلەر · فىقھ · تەۋھىد ۋە ئەقىدە · تارىخ · ئەدەبىيات · ئومۇمىي
   - These replace the current emoji book placeholders in the library grid.
4. **Welcome / About hero illustration (optional).** A calm ornamental banner or stylized manuscript-shelf scene for the empty-library welcome screen (wide, transparent or cream background).

## Style guardrails (keep the set cohesive)
- One shared palette, stroke weight, corner radius, and motif vocabulary across **all** assets.
- Crisp at small sizes (icon) and clean at large sizes (covers). Avoid heavy gradients that muddy at 16px.
- Deliver each asset as its own PNG; for the icon include both the rounded-background and transparent-flat versions.

## Handoff
Place the exported PNGs where Claude Code can integrate them (see `prompt11-ui-polish.md`): the icon → `assets/icon.*` / `assets/installer-icon.ico`; covers → `assets/covers/<category>.png`; logo/hero → `assets/brand/`. Claude Code wires them into the UI and converts the icon to `.ico`.
