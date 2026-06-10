# PROMPT 11 — Make Quran Search Box Actually Work

**Paste everything below this line into Claude Code:**

---

## Context

In v2.5 the Quran tab has a search box (top of the panel) that shows the placeholder «سۈرە نامى، ئەرەبچە ئايەت ياكى ئۇيغۇرچە تەرجىمە بويىچە ئىزدەش...» but pressing Enter or clicking the search-icon button produces no visible result. The backend search functions `quranSearch` and `quranSearchSimple` already exist (we wrote them in PROMPT_06). The bug is in the renderer — either the event handler is missing, the IPC route is not exposed, or the result rendering function is missing/silent.

**Goal:** Wire the search end-to-end. User types a query → presses Enter or clicks the search icon → sees a result list with sura name, ayah number, and a snippet (Arabic + Uyghur as toggled), each item clickable to jump to that ayah in the reader.

The search must support **three input modes**, auto-detected:

1. **Sura name** (Uyghur or Arabic, e.g. «نىسا» or «النساء») → list all ayahs of that sura, or jump straight to it.
2. **Arabic ayah text** (e.g. «إيمان» or «الذين آمنوا») → use `quranSearch` (FTS5) with the Arabic-normalization we added in PROMPT_06.
3. **Uyghur translation text** (e.g. «ئىمان كەلتۈرگەنلەر») → same `quranSearch` but the Uyghur column.

The existing language toggle («ئىككىسى» / «ئەرەب» / «ئۇيغۇر») already constrains *what is shown*; we keep its behavior. When set to «ئىككىسى» (both), search both columns.

## Read first (do not modify yet)

1. `src/quran.js` — find the search input element, its event listener (or lack thereof), and the result rendering function. Quote what you find.
2. `src/preload.js` — confirm whether `quranSearch` is exposed on `window.electron`. If yes, paste the binding line. If no, this is part of why the search is broken.
3. `main.js` — find the IPC handler `ipcMain.handle('quran-search', …)`. Paste it. If missing, that's another part of the bug.
4. `database.js` — confirm `quranSearch` and `quranSearchSimple` exist and accept `(query, opts)` with `opts.lang` ∈ `{'ar','ug','auto'}`. They were added in PROMPT_06.
5. `src/index.html` — find the Quran panel markup. Confirm the IDs of: the search input, the search button, the language toggle, the results container, and the ayah-list container. Paste these IDs.

After reading, **report back to me**:
- Which IDs the search input/button/results-container have
- Whether the IPC route exists (yes/no)
- Whether the preload binding exists (yes/no)
- Whether there is a renderer function for search results (yes/no — name it if yes)
- Your one-line theory of why the search currently does nothing

Wait for my **"go"**.

## Implementation plan

### Step 1 — Add a `quranLookupSura` helper to `database.js`

For sura-name searches we need a small utility that maps a name (Uyghur or Arabic, with or without diacritics) to a sura number. Add this near `quranSearch`:

```javascript
/**
 * Resolve a sura by name (Arabic or Uyghur) or by number.
 * Returns the matching sura row {sura, name_ar, name_ug, total_ayas} or null.
 * Matching: exact (case-insensitive, normalized) or unique startsWith.
 */
function quranLookupSura(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Numeric input?
  const asNum = parseInt(raw, 10);
  if (Number.isFinite(asNum) && String(asNum) === raw && asNum >= 1 && asNum <= 114) {
    return db.prepare(
      `SELECT sura, name_ar, name_ug, total_ayas FROM quran_suras WHERE sura = ?`
    ).get(asNum) || null;
  }

  const isAr = isArabicScript(raw);
  const needle = isAr ? normalizeArabicQuery(raw) : raw.toLowerCase();

  // Try exact match first on the appropriate column
  const allSuras = db.prepare(
    `SELECT sura, name_ar, name_ug, total_ayas FROM quran_suras`
  ).all();

  // Helpers — apply the same normalization to stored names
  const norm = (s) => isAr ? normalizeArabicQuery(s || '') : String(s || '').toLowerCase();

  // Exact
  for (const s of allSuras) {
    const candidate = isAr ? s.name_ar : s.name_ug;
    if (norm(candidate) === needle) return s;
  }

  // StartsWith (only return if unique)
  const prefixHits = allSuras.filter(s => {
    const candidate = isAr ? s.name_ar : s.name_ug;
    return norm(candidate).startsWith(needle);
  });
  if (prefixHits.length === 1) return prefixHits[0];

  // Substring fallback (only return if unique)
  const substrHits = allSuras.filter(s => {
    const candidate = isAr ? s.name_ar : s.name_ug;
    return norm(candidate).includes(needle);
  });
  if (substrHits.length === 1) return substrHits[0];

  return null;
}
```

Export it in the existing `module.exports` block.

### Step 2 — Expose IPC routes (if missing)

In `main.js`, ensure these exist (add only the ones missing — don't duplicate):

```javascript
ipcMain.handle('quran-search', (_e, query, opts) => {
  try { return { success: true, results: db.quranSearch(query, opts || {}) }; }
  catch (e) { return { success: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('quran-lookup-sura', (_e, input) => {
  try { return { success: true, sura: db.quranLookupSura(input) }; }
  catch (e) { return { success: false, error: String(e && e.message || e) }; }
});
```

In `src/preload.js`, ensure these are exposed on `window.electron`:

```javascript
quranSearch: (query, opts) => ipcRenderer.invoke('quran-search', query, opts),
quranLookupSura: (input) => ipcRenderer.invoke('quran-lookup-sura', input),
```

### Step 3 — Wire the search in `src/quran.js`

Find the existing search-input element. Add (or fix) the event handlers:

```javascript
// At module init, after the input element is captured:
const searchInput = document.getElementById('quran-search-input');   // <-- replace with the actual ID you reported in step 0
const searchBtn   = document.getElementById('quran-search-btn');     //     (same)

if (searchInput && !searchInput.__bound) {
  searchInput.__bound = true;
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runQuranSearch(); }
    if (e.key === 'Escape') { clearQuranSearch(); }
  });
}
if (searchBtn && !searchBtn.__bound) {
  searchBtn.__bound = true;
  searchBtn.addEventListener('click', () => runQuranSearch());
}

async function runQuranSearch() {
  const q = (searchInput.value || '').trim();
  if (!q) { clearQuranSearch(); return; }

  // Read the current language toggle: 'ar' | 'ug' | 'auto' (= both)
  const lang = getQuranSearchLang();   // implement using whatever the existing toggle stores

  // Step A: try sura-name resolution. If it matches uniquely, jump there.
  // We only treat the input as a sura name if it has no whitespace AND the
  // language-toggle isn't forcing the user into an ayah-text mode. (A multi-word
  // query is almost certainly an ayah search.)
  if (!/\s/.test(q)) {
    const lr = await window.electron.quranLookupSura(q);
    if (lr && lr.success && lr.sura) {
      // Render the whole sura instead of a hit list
      hideSearchResults();
      openSura(lr.sura.sura, /* ayah= */ 1);
      return;
    }
  }

  // Step B: full-text search across ayahs
  const r = await window.electron.quranSearch(q, { lang, limit: 200 });
  if (!r || !r.success) {
    showSearchError(r && r.error || 'ئىزدەش جەريانىدا خاتالىق كۆرۈلدى');
    return;
  }
  renderSearchResults(r.results, q, lang);
}

function clearQuranSearch() {
  if (searchInput) searchInput.value = '';
  hideSearchResults();
}
```

Add the result rendering function. Keep markup identical in spirit to existing list rendering — match the app's visual conventions (RTL, sura name + aya number, snippet with a subtle highlight). Pseudo-template:

```javascript
function renderSearchResults(results, query, lang) {
  const host = document.getElementById('quran-search-results');     // create this element in index.html if missing
  if (!host) return;
  if (!results.length) {
    host.innerHTML = `<div class="quran-search-empty">«${escapeHtml(query)}» بويىچە نەتىجە تېپىلمىدى</div>`;
    host.style.display = '';
    return;
  }
  // results items have shape: { id, sura, aya, text_ar, text_ug, snip_ar, snip_ug }
  // (snip_* may be empty strings if FTS5 wasn't used.)
  const html = results.map(r => {
    const showAr = (lang === 'ar' || lang === 'auto');
    const showUg = (lang === 'ug' || lang === 'auto');
    const snipAr = r.snip_ar && r.snip_ar.trim() ? r.snip_ar : escapeHtml(r.text_ar || '');
    const snipUg = r.snip_ug && r.snip_ug.trim() ? r.snip_ug : escapeHtml(r.text_ug || '');
    return `
      <div class="quran-search-hit" data-sura="${r.sura}" data-aya="${r.aya}">
        <div class="quran-search-hit-meta">${suraDisplayName(r.sura)} · ${r.aya}-ئايەت</div>
        ${showAr ? `<div class="quran-search-hit-ar" dir="rtl">${snipAr}</div>` : ''}
        ${showUg ? `<div class="quran-search-hit-ug" dir="rtl">${snipUg}</div>` : ''}
      </div>`;
  }).join('');
  host.innerHTML = `<div class="quran-search-summary">${results.length} نەتىجە تېپىلدى</div>${html}`;
  host.style.display = '';

  // Click → jump to that ayah in the reader
  host.querySelectorAll('.quran-search-hit').forEach(el => {
    el.addEventListener('click', () => {
      const s = parseInt(el.getAttribute('data-sura'), 10);
      const a = parseInt(el.getAttribute('data-aya'), 10);
      hideSearchResults();
      openSura(s, a);
    });
  });
}

function hideSearchResults() {
  const host = document.getElementById('quran-search-results');
  if (host) { host.innerHTML = ''; host.style.display = 'none'; }
}

function showSearchError(msg) {
  const host = document.getElementById('quran-search-results');
  if (!host) return;
  host.innerHTML = `<div class="quran-search-error">${escapeHtml(msg)}</div>`;
  host.style.display = '';
}
```

`escapeHtml`, `openSura`, and `suraDisplayName` already exist somewhere in the module — reuse them. If `openSura` doesn't accept an ayah argument, extend it (it should scroll to and visually flash the target ayah after rendering).

The search-result HTML uses `r.snip_ar` and `r.snip_ug`. These come from FTS5's `snippet()` function via `quranSearch`, which wraps matches in `<mark>` tags or similar. **DO NOT** re-escape the snippets if `quranSearch` already returns safe HTML — instead, sanitize: pass them through `window.SafeHTML.sanitize` (added in PROMPT_05) before injecting. Use `SafeHTML.sanitize(snipAr)` not `escapeHtml(snipAr)`. For the fallback (no snippet) branch, use `escapeHtml(text_ar)` because that's raw text.

### Step 4 — Add styles (only if missing)

If the result list classes have no styles in the existing CSS, add a minimal block to the Quran-section stylesheet:

```css
.quran-search-results { padding: 12px; max-height: 60vh; overflow-y: auto; }
.quran-search-summary { font-size: 13px; opacity: 0.7; margin-bottom: 8px; }
.quran-search-hit { padding: 10px 12px; border-bottom: 1px solid var(--border, #e5e2da); cursor: pointer; transition: background 0.15s; }
.quran-search-hit:hover { background: var(--hover-bg, rgba(196,164,90,0.08)); }
.quran-search-hit-meta { font-size: 12px; color: var(--accent, #c4a45a); margin-bottom: 4px; }
.quran-search-hit-ar { font-family: var(--font-arabic, "Amiri Quran", serif); font-size: 18px; line-height: 1.9; }
.quran-search-hit-ug { font-family: var(--font-uyghur, "UKIJ Tuz", sans-serif); font-size: 14px; line-height: 1.8; opacity: 0.85; margin-top: 4px; }
.quran-search-hit mark, .quran-search-hit b { background: transparent; color: var(--accent, #c4a45a); font-weight: 700; }
.quran-search-empty, .quran-search-error { padding: 16px; text-align: center; opacity: 0.7; }
.quran-search-error { color: var(--error, #b54545); }
```

Use the project's existing CSS variables — match exactly, don't invent new ones. If the project has no CSS variables for the quran section, hardcode similar values to existing elements.

### Step 5 — Make sure the result container exists in HTML

In `src/index.html`, find the Quran panel. If `<div id="quran-search-results">` doesn't already exist, add it directly **below** the search-input row and **above** the ayah list:

```html
<div id="quran-search-results" class="quran-search-results" style="display:none"></div>
```

Do not move the existing ayah list. Do not change the search input's placeholder or the language-toggle markup.

### Step 6 — Test

```bash
npm start
```

1. Open Quran tab.
2. Type **`نىسا`** in the search box → press Enter. Should jump to Surat An-Nisa (sura 4) ayah 1.
3. Type **`النساء`** in the search box → press Enter. Same result.
4. Type **`4`** → Enter. Same result (numeric sura lookup).
5. Type **`إيمان`** → Enter. Should show a list of ayahs containing the word "ايمان" (after Arabic normalization from PROMPT_06). Click one → reader jumps to that ayah, highlights it.
6. Switch the language toggle to «ئۇيغۇر». Type **`ئىمان كەلتۈرگەنلەر`** → Enter. Should find translation matches.
7. Type a word that doesn't exist (e.g. **`xxxxxx`**) → Enter. Should show "نەتىجە تېپىلمىدى" message, not a blank.
8. Press **Escape** in the search box → clears it and hides the result list, returning to normal sura view.

### Step 7 — Commit

```bash
git add -A
git status
git commit -m "fix(quran): wire up search box (sura name, Arabic, Uyghur translation)"
```

### Step 8 — Final report

- ✅ `quranLookupSura` added in database.js
- ✅ IPC routes `quran-search` and `quran-lookup-sura` confirmed/added
- ✅ Preload bindings confirmed/added
- ✅ Search input and button event handlers wired
- ✅ Result rendering with click-to-jump
- ✅ Sura name search (UG/AR/numeric) works
- ✅ Arabic ayah text search works
- ✅ Uyghur translation search works
- ✅ Empty-result and error states handled
- ✅ Escape clears search
- ✅ Git commit hash: …

Then say: **"Quran search wiring complete. Safe to proceed to PROMPT_12."**
