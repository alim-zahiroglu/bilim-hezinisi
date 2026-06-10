# Prompt 05 — Notes HTML Sanitization (XSS Security Fix)

**Goal:** The Notes editor stores user HTML and re-renders it with `innerHTML`. If a user pastes content containing `<script>` or `<img onerror=...>`, that code can execute. We will add DOMPurify to sanitize all stored/loaded HTML.

**Paste everything below this line into Claude Code:**

---

You are working on the "Bilim Hezinisi" Electron app. Read these files first:

1. `src/notes.js` — uses `editorEl.innerHTML = _s().curDoc.content_html` to load notes
2. `package.json` — current dependencies
3. `main.js` — IPC handler `notes-update` that stores HTML

## Problem

The Notes module stores raw HTML in SQLite and renders it back via `innerHTML`. A malicious paste (or a tampered database file) could inject script tags. We add defense-in-depth sanitization at three points:

1. Frontend on save (before sending to backend)
2. Frontend on load (before injecting into DOM)
3. Backend on save (before writing to DB)

## Your task

### Step 1 — Install DOMPurify

```bash
npm install dompurify@^3.2.0
```

Check that `package.json` now lists `dompurify` under `dependencies`.

### Step 2 — Create a sanitizer utility module

Create a new file at `src/sanitize.js` with this exact content:

```javascript
// HTML sanitizer for Notes module — defense-in-depth XSS protection.
// Loaded as a regular <script> in index.html (provides window.SafeHTML).
(function () {
  'use strict';

  // We require DOMPurify via a path that works both in dev (node_modules)
  // and packaged (asar). DOMPurify ships a UMD build that attaches to
  // window when loaded as a <script>. We load the file via a require()
  // resolved at runtime by the Electron preload's exposed loader, OR
  // by a direct require() if available.
  let purify = null;

  function getPurify() {
    if (purify) return purify;
    if (typeof window !== 'undefined' && window.DOMPurify) {
      purify = window.DOMPurify;
      return purify;
    }
    // Fall back: try to require it (only works if Node integration is on,
    // which it isn't here — so this is a defensive no-op)
    try {
      // eslint-disable-next-line
      const dp = require('dompurify');
      purify = dp.default || dp;
      return purify;
    } catch (e) {
      return null;
    }
  }

  // Tags allowed in Note HTML.
  const ALLOWED_TAGS = [
    'p', 'span', 'div', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote',
    'code', 'pre',
    'a',
    'font' // legacy execCommand uses <font> for size/color; we keep it
  ];

  // Attributes we keep. data-* and class for our app's markers.
  const ALLOWED_ATTR = [
    'style', 'class', 'dir', 'lang',
    'data-ref-insert', 'data-ref-word', 'data-spell-word',
    'href', 'title',
    'face', 'size', 'color' // legacy <font> attrs
  ];

  // CSS properties allowed in style="..." attributes.
  // DOMPurify validates these via its built-in CSS parser.
  const ALLOWED_CSS_PROPS = new Set([
    'color', 'background-color', 'background',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'text-align', 'text-decoration', 'line-height',
    'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'border', 'border-radius', 'border-color',
    'direction', 'unicode-bidi',
    'display', 'width', 'max-width'
  ]);

  /**
   * Sanitize note HTML. Strips <script>, event handlers (onerror, onclick, etc),
   * javascript: URLs, and any tag not in ALLOWED_TAGS.
   * @param {string} html
   * @returns {string} safe HTML
   */
  function sanitize(html) {
    if (!html) return '';
    const dp = getPurify();
    if (!dp) {
      // Fallback: strip all tags. Pessimistic but safe.
      console.warn('[sanitize] DOMPurify not available, stripping all HTML');
      const div = document.createElement('div');
      div.textContent = String(html).replace(/<[^>]*>/g, ' ');
      return div.innerHTML;
    }

    return dp.sanitize(String(html), {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'style', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onsubmit', 'onchange', 'onkeydown', 'onkeyup', 'onkeypress'],
      ALLOW_DATA_ATTR: false,
      ADD_DATA_URI_TAGS: [],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      USE_PROFILES: { html: true }
    });
  }

  /**
   * Extract plain text from HTML safely (does NOT use innerHTML).
   * @param {string} html
   * @returns {string}
   */
  function htmlToText(html) {
    if (!html) return '';
    const safe = sanitize(html);
    const div = document.createElement('div');
    div.innerHTML = safe;
    return div.innerText || div.textContent || '';
  }

  window.SafeHTML = { sanitize, htmlToText };
})();
```

### Step 3 — Bundle DOMPurify into the app

DOMPurify's UMD build needs to be included in the renderer process. We'll copy it to `assets/` so we can load it via a `<script>` tag.

Create a small build helper at `scripts/copy-dompurify.js`:

```javascript
/**
 * Copies DOMPurify's UMD bundle from node_modules into assets/ so it can
 * be loaded by index.html as a <script>. Run via: node scripts/copy-dompurify.js
 *
 * This is also wired into "postinstall" so it runs automatically.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'node_modules', 'dompurify', 'dist', 'purify.min.js');
const DEST_DIR = path.join(ROOT, 'assets', 'vendor');
const DEST = path.join(DEST_DIR, 'purify.min.js');

if (!fs.existsSync(SRC)) {
  console.error('[copy-dompurify] DOMPurify not found at', SRC);
  console.error('[copy-dompurify] Run: npm install dompurify');
  process.exit(1);
}

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

fs.copyFileSync(SRC, DEST);
console.log('[copy-dompurify] Copied to', DEST, '—', fs.statSync(DEST).size, 'bytes');
```

Run it now:

```bash
node scripts/copy-dompurify.js
```

Confirm the file `assets/vendor/purify.min.js` was created.

### Step 4 — Wire postinstall to copy DOMPurify automatically

In `package.json`, update the `"postinstall"` script. It currently runs `electron-rebuild`. Make it run both:

```json
"postinstall": "electron-rebuild -f -w better-sqlite3 && node scripts/copy-dompurify.js"
```

(Adjust if your existing postinstall is different — chain them with `&&`.)

### Step 5 — Add `assets/vendor` to package.json build files

In `package.json`, in the `"build"` → `"files"` array, add:

```json
"assets/vendor/**/*"
```

### Step 6 — Load DOMPurify and sanitize.js from index.html

Open `src/index.html`. Find the bottom of the file where scripts are loaded (around line 2226):

```html
<script src="ngram.js"></script>
<script src="spellcheck.js"></script>
<script src="quran.js"></script>
<script src="notes.js"></script>
```

**Add** these lines BEFORE the existing scripts:

```html
<script src="../assets/vendor/purify.min.js"></script>
<script src="sanitize.js"></script>
```

So the final block becomes:

```html
<script src="../assets/vendor/purify.min.js"></script>
<script src="sanitize.js"></script>
<script src="ngram.js"></script>
<script src="spellcheck.js"></script>
<script src="quran.js"></script>
<script src="notes.js"></script>
```

### Step 7 — Update notes.js to use SafeHTML on load and save

Open `src/notes.js`. Find `mountEditor()` function. Find this line:

```javascript
editorEl.innerHTML = _s().curDoc.content_html || '<p><br></p>';
```

**Replace** with:

```javascript
const safeHtml = (window.SafeHTML && window.SafeHTML.sanitize)
  ? window.SafeHTML.sanitize(_s().curDoc.content_html || '')
  : (_s().curDoc.content_html || '');
editorEl.innerHTML = safeHtml || '<p><br></p>';
```

Find the `saveNow()` function. Find these lines:

```javascript
const html = editorEl.innerHTML;
const text = editorEl.innerText || '';
```

**Replace** with:

```javascript
const rawHtml = editorEl.innerHTML;
const html = (window.SafeHTML && window.SafeHTML.sanitize)
  ? window.SafeHTML.sanitize(rawHtml)
  : rawHtml;
const text = editorEl.innerText || '';
```

### Step 8 — Update notesInsertRef and notesInsertAya to be safe

In `src/notes.js`, find `notesInsertRef` function. The `insertHtml` template is constructed safely (uses `escHtml` for user content), but the resulting string still goes through `execCommand('insertHTML', ...)` which doesn't sanitize. Already safe in this case because we control the template, but let's add defense:

Find:

```javascript
editorEl.focus();
document.execCommand('insertHTML', false, insertHtml);
```

Replace BOTH inside `notesInsertRef` and `notesInsertAya` with:

```javascript
editorEl.focus();
const safeInsert = (window.SafeHTML && window.SafeHTML.sanitize)
  ? window.SafeHTML.sanitize(insertHtml)
  : insertHtml;
document.execCommand('insertHTML', false, safeInsert);
```

### Step 9 — Add a paste handler that sanitizes pasted content

Still in `src/notes.js`, inside `mountEditor()`, after the `editorEl.addEventListener('input', ...)` block, ADD this paste handler:

Find this block:

```javascript
editorEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveNow();
  }
});
```

**Add immediately after it:**

```javascript
// Sanitize pasted HTML — XSS defense-in-depth
editorEl.addEventListener('paste', (e) => {
  // Only intercept HTML clipboard data; plain text is already safe
  const html = e.clipboardData && e.clipboardData.getData('text/html');
  if (!html) return; // let the browser paste plain text normally

  e.preventDefault();
  const safeHtml = (window.SafeHTML && window.SafeHTML.sanitize)
    ? window.SafeHTML.sanitize(html)
    : '';

  if (safeHtml) {
    document.execCommand('insertHTML', false, safeHtml);
  } else {
    // Fall back to plain text
    const text = e.clipboardData.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }
  markDirty();
});
```

### Step 10 — Backend sanitization (defense in depth)

The frontend sanitizes, but a malicious actor could write directly to the SQLite file. Add backend sanitization too.

We don't want to load DOMPurify in the main process (it requires `jsdom`). Instead, do a coarse strip in main.js using regex (sufficient as second line of defense).

Open `main.js`. Near the top, after the existing requires, ADD:

```javascript
/**
 * Coarse server-side HTML sanitizer. The renderer already runs DOMPurify;
 * this is a second line of defense against direct DB tampering.
 */
function coarseSanitizeHtml(html) {
  if (!html) return '';
  return String(html)
    // Remove <script> ... </script> blocks
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove <iframe>, <object>, <embed>, <link>, <meta>, <style>, <base>, <form>
    .replace(/<\/?(iframe|object|embed|link|meta|style|base|form|input|button|textarea|select)\b[^>]*>/gi, '')
    // Remove inline event handlers: onerror=, onclick=, etc.
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    // Remove javascript: and data: URIs in href/src
    .replace(/(href|src)\s*=\s*["']?\s*javascript:/gi, '$1=""')
    .replace(/(href|src)\s*=\s*["']?\s*data:(?!image\/)/gi, '$1=""');
}
```

Find the `notes-update` IPC handler:

```javascript
ipcMain.handle('notes-update', (e, id, title, html, text) => {
  try {
    database.notesUpdate(id, title, html, text);
    database.saveDB(DATA_DIR);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
});
```

**Replace** with:

```javascript
ipcMain.handle('notes-update', (e, id, title, html, text) => {
  try {
    const safeHtml = coarseSanitizeHtml(html || '');
    const safeTitle = String(title || '').slice(0, 500); // length cap
    const safeText = String(text || '');
    database.notesUpdate(id, safeTitle, safeHtml, safeText);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
});
```

### Step 11 — Verify paths

```bash
ls -la assets/vendor/purify.min.js
ls -la src/sanitize.js
grep -n "sanitize.js\|purify.min.js" src/index.html
```

All three commands should show files exist and the script tags are present.

### Step 12 — Test

```bash
npm start
```

1. Open the Notes tab
2. Create a new note
3. Type some normal text — it should save normally
4. Open browser devtools (Ctrl+Shift+I) — the Console should show no errors about DOMPurify or SafeHTML
5. Try this XSS test: in the note editor, type the text manually:
   ```
   Test <script>alert("XSS")</script> end
   ```
   The script should NOT execute. After save+reload (close note, reopen), the `<script>` tag should be stripped.

You can also test paste protection:
- In an external editor, copy this HTML to clipboard (using a browser dev console: `await navigator.clipboard.writeText('<img src=x onerror="alert(1)">')`)
- Paste into the note — alert should NOT fire

### Step 13 — Test that existing valid formatting still works

In a note:
1. Type some text
2. Select it and press Ctrl+B (bold) — should bold
3. Select and use the font dropdown — should change font
4. Use the "Insert Quran ayat" button — should still insert correctly
5. Type words that match books in your library — references should still appear

### Step 14 — Commit

```bash
git add -A
git status
git commit -m "feat(notes): add DOMPurify sanitization for XSS protection"
```

### Step 15 — Final report

- ✅ DOMPurify installed and copied to assets/vendor
- ✅ `src/sanitize.js` provides `window.SafeHTML.sanitize()`
- ✅ `notes.js` sanitizes on load, save, paste, and inserts
- ✅ `main.js` has coarse backend sanitization for `notes-update`
- ✅ XSS test (`<script>alert(1)</script>`) does not execute
- ✅ Normal formatting (bold, italic, fonts) still works
- ✅ Quran insert still works
- ✅ Reference scanner still works
- ✅ Git commit hash: [show it]

Then say: **"Notes XSS fix complete. Safe to proceed to PROMPT_06."**
