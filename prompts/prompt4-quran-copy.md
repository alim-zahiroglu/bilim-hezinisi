# PROMPT 4 — Quran Clipboard: Copy with Translation, Word-Compatible Format

**Only run after Prompt 3 is verified.**

---

You are continuing **Bilim Hezinisi 2.4.1**, step **4 of 6**. Add the clipboard functionality that was stubbed in Prompt 3: when a user clicks an aya, a popover menu appears with copy options. Multi-select (Ctrl+Click) plus Ctrl+C is also supported. The copied content must paste correctly into MS Word with fonts preserved.

## Prerequisites

- Prompt 3 completed: clicking an aya highlights it and calls `window.quranShowAyaMenu()` (currently undefined — we define it here).

## Deliverables

Append to `src/quran.js` — do NOT replace it. Add new code inside the existing IIFE, right before the closing `})();`. Also make one additional CSS rule clear (already in Prompt 3's CSS, verify `.quran-aya-menu` styles exist).

**Do not** modify any other file.

## Task 4.1 — Append Clipboard Logic to src/quran.js

Open `src/quran.js`. Find the line `window.QuranHelpers = { escHtml, escAttr, toArabicNumerals };` near the bottom. **Immediately before it**, insert this entire block:

```javascript
  // ========== CLIPBOARD / COPY ==========

  // Font stacks for rich HTML. Fallbacks cover common systems.
  const FONT_STACK_AR = "'UthmanicHafs','KFGQPC Uthmanic Script HAFS','Traditional Arabic','Amiri',serif";
  const FONT_STACK_UG = "'UKIJ Ekran','UKIJ Tuz','Microsoft Uighur','Arial',sans-serif";

  /**
   * Show the per-aya popover menu with copy options.
   * Called by quranOnAyaClick when user single-clicks an aya.
   */
  window.quranShowAyaMenu = function(targetEl, sura, aya) {
    // Remove any existing menu
    document.querySelectorAll('.quran-aya-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'quran-aya-menu';
    menu.innerHTML = `
      <button onclick="window.quranMenuCopy(${sura}, ${aya}, false, event)">📋 يالغۇز ئايەتنى كۆچۈرۈش</button>
      <button onclick="window.quranMenuCopy(${sura}, ${aya}, true, event)">📋 تەرجىمىسى بىلەن كۆچۈرۈش</button>
    `;

    const rect = targetEl.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 6;
    const left = Math.max(8, rect.left + 12);
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    document.body.appendChild(menu);

    // Close menu on outside click (install handler after the current click event)
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 10);
  };

  /**
   * Menu button handler: copy a single aya.
   */
  window.quranMenuCopy = async function(sura, aya, withTranslation, ev) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    document.querySelectorAll('.quran-aya-menu').forEach(el => el.remove());

    const r = await window.electron.quranGetAya(sura, aya);
    if (!r.success || !r.aya) {
      if (typeof showToast === 'function') showToast('ئايەت تېپىلمىدى', 'e');
      return;
    }

    const ok = await copyAyaToClipboard([r.aya], withTranslation);
    if (typeof showToast === 'function') {
      showToast(
        ok ? (withTranslation ? 'ئايەت تەرجىمىسى بىلەن كۆچۈرۈلدى' : 'ئايەت كۆچۈرۈلدى') : 'كۆچۈرۈش مۇۋەپپەقىيەتسىز بولدى',
        ok ? 's' : 'e'
      );
    }
  };

  /**
   * Copy one or more ayas to the clipboard.
   * Writes BOTH text/html (with font-family set inline) and text/plain.
   * Word / Google Docs / Pages will honor the font-family if the font is
   * installed on the target system. Plain-text fallback always works.
   *
   * @param {Array<{sura,aya,text_ar,text_ug}>} ayas
   * @param {boolean} withTranslation
   * @returns {Promise<boolean>} success
   */
  async function copyAyaToClipboard(ayas, withTranslation) {
    if (!ayas || !ayas.length) return false;

    const htmlParts = [];
    const textParts = [];

    for (const a of ayas) {
      // Arabic inside ﴿ ﴾ ornate brackets (U+FD3E, U+FD3F)
      // Uyghur translation inside « » angle quotes
      const arSafe = escHtml(a.text_ar);
      if (withTranslation && a.text_ug) {
        const ugSafe = escHtml(a.text_ug);
        htmlParts.push(
          `<p dir="rtl" style="text-align:right;margin:0 0 12pt 0;">` +
            `<span style="font-family:${FONT_STACK_AR};font-size:20pt;line-height:1.9">` +
              `&#xFD3F;${arSafe}&#xFD3E;` +
            `</span>` +
            `<br>` +
            `<span style="font-family:${FONT_STACK_UG};font-size:13pt;line-height:1.7;color:#333">` +
              `&#x00AB;${ugSafe}&#x00BB;` +
            `</span>` +
          `</p>`
        );
        textParts.push(`\uFD3F${a.text_ar}\uFD3E \u00AB${a.text_ug}\u00BB`);
      } else {
        htmlParts.push(
          `<p dir="rtl" style="text-align:right;margin:0 0 12pt 0;">` +
            `<span style="font-family:${FONT_STACK_AR};font-size:20pt;line-height:1.9">` +
              `&#xFD3F;${arSafe}&#xFD3E;` +
            `</span>` +
          `</p>`
        );
        textParts.push(`\uFD3F${a.text_ar}\uFD3E`);
      }
    }

    const html = `<html><head><meta charset="utf-8"></head><body>${htmlParts.join('\n')}</body></html>`;
    const text = textParts.join('\n\n');

    // Primary: modern async Clipboard API with both MIME types
    try {
      if (navigator.clipboard && typeof window.ClipboardItem === 'function') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html':  new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' })
          })
        ]);
        return true;
      }
    } catch(e) {
      console.warn('ClipboardItem write failed:', e);
    }

    // Secondary: plain-text navigator.clipboard.writeText
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch(e) {
      console.warn('writeText failed:', e);
    }

    // Last resort: execCommand('copy') with a temporary textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch(e) {
      console.error('All clipboard methods failed:', e);
      return false;
    }
  }

  /**
   * Global Ctrl+C handler for multi-selected ayas.
   * - If user has a normal text selection (e.g. selected text within one aya),
   *   let the browser handle default copy — don't interfere.
   * - Otherwise, if any ayas are .selected (via Ctrl+Click), copy them in order
   *   using the current "with translation" toggle.
   */
  document.addEventListener('keydown', async (e) => {
    if (window.S.mode !== 'quran') return;
    const key = (e.key || '').toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || key !== 'c') return;

    // Respect normal text selections — browser should copy that.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;

    const selectedEls = Array.from(document.querySelectorAll('.quran-aya.selected'));
    if (!selectedEls.length) return;

    e.preventDefault();

    // Fetch aya data in order
    const ayas = [];
    for (const el of selectedEls) {
      const sura = parseInt(el.dataset.sura, 10);
      const aya = parseInt(el.dataset.aya, 10);
      if (!sura || !aya) continue;
      const r = await window.electron.quranGetAya(sura, aya);
      if (r.success && r.aya) ayas.push(r.aya);
    }

    if (!ayas.length) return;

    const withTr = _s().showTranslation !== false;
    const ok = await copyAyaToClipboard(ayas, withTr);
    if (typeof showToast === 'function') {
      showToast(
        ok ? `${ayas.length} ئايەت كۆچۈرۈلدى` : 'كۆچۈرۈش مۇۋەپپەقىيەتسىز بولدى',
        ok ? 's' : 'e'
      );
    }
  });

  // Expose copy function for Notes module (Prompt 5) reuse
  window.QuranCopy = { copyAyaToClipboard, FONT_STACK_AR, FONT_STACK_UG };
```

## Task 4.2 — Verify CSS

Open `src/quran.css` and verify these rules from Prompt 3 are present (they should be). If missing, append:

```css
.quran-aya-menu {
  position: absolute; z-index: 1000;
  background: var(--bg); border: 0.5px solid var(--border2);
  border-radius: var(--radius2); box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  display: flex; flex-direction: column;
  min-width: 240px; padding: 4px 0;
}
.quran-aya-menu button {
  background: none; border: none;
  padding: 10px 14px; text-align: right;
  font-family: var(--jf); font-size: 13px; color: var(--text);
  cursor: pointer; transition: background .1s; direction: rtl;
}
.quran-aya-menu button:hover { background: var(--ab); color: var(--at); }
```

## Acceptance Criteria

Open the app in Quran mode (Fatiha, sura 1):

### Single-copy tests
1. Click aya 1 (بِسۡمِ ٱللَّهِ...) — popover menu appears below the aya with two buttons.
2. Click "يالغۇز ئايەتنى كۆچۈرۈش" — toast says "ئايەت كۆچۈرۈلدى".
3. Open MS Word → Ctrl+V. Result shows `﴿بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ﴾` in large Uthmanic-style font (if Uthmanic Hafs is installed on the system — otherwise a close fallback).
4. Click aya 2. Click "تەرجىمىسى بىلەن كۆچۈرۈش". Paste into Word:
   ```
   ﴿ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ﴾
   «جىمى ھەمدۇ سانا ئالەملەرنىڭ پەرۋەردىگارى ئاللاھقا خاستۇر»
   ```
   Arabic shows in Uthmanic Hafs, Uyghur in UKIJ Ekran, both right-aligned, RTL direction preserved.
5. Click outside the menu — menu disappears.
6. Re-click the same aya — menu re-appears.

### Multi-select tests
7. Go to sura 2, aya 1 (الٓمٓ). Ctrl+Click aya 1, aya 2, aya 3. All three get the `.selected` highlight (no menu shown, since it's Ctrl+Click).
8. Press Ctrl+C. Toast: "3 ئايەت كۆچۈرۈلدى".
9. Paste into Word — three ayas in order, each as its own paragraph, with translation because the "تەرجىمىسى بىلەن كۆچۈرۈش" toggle is checked by default.
10. Uncheck the toggle in toolbar. Repeat Ctrl+Click + Ctrl+C — this time only Arabic copied.

### Selection-respect test
11. Select a few words inside an aya with your mouse (normal text selection). Press Ctrl+C. Browser copies just your selection — toast does NOT appear. This confirms we don't interfere with normal text copy.

### Format preservation test
12. Paste into **MS Word** — ornate brackets ﴿ ﴾ intact, font-family is Uthmanic Hafs (verify by clicking text — Word's font panel should show "UthmanicHafs" as primary).
13. Paste into **Notepad** (plain text) — shows `﴿...﴾ «...»` correctly.

## Rules

- Do not touch `main.js`, `database.js`, `preload.js`, `src/index.html`, or any other file.
- Reuse `_s()`, `escHtml()`, `showToast()` — they're already in scope from Prompt 3 / existing code.
- The aya click handler (`quranOnAyaClick`) from Prompt 3 must already call `window.quranShowAyaMenu` when not Ctrl+Click. Verify that's still wired.
- After finishing, report which files you modified, then ask me to test.

## Troubleshooting if copy fails

- **"ClipboardItem is not defined" error:** Happening on old Electron. Fallback chain catches this — `writeText` runs instead.
- **Fonts not preserved in Word:** The Uthmanic Hafs OTF must be installed on the OS (not just bundled in the app). Clipboard API cannot embed fonts. Users need to install the font system-wide once.
- **Menu appears but buttons don't copy:** Check DevTools Console. If "Not allowed" error, it means the click event context was lost. The inline onclick handlers must pass `event` — verify.
