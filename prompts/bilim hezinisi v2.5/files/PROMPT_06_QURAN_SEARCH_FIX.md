# Prompt 06 — Quran Search Arabic Normalization Fix

**Goal:** When users search for Arabic words like "إيمان" (with hamza-under-alif), they should also match "ايمان" (plain alif). Currently the FTS5 tokenizer only strips diacritics, not alif variants. We add backend query normalization.

**Paste everything below this line into Claude Code:**

---

You are working on the "Bilim Hezinisi" Electron app. Read these files first:

1. `database.js` — find `quranSearch` and `quranSearchSimple`
2. `scripts/seed-quran.js` — find `stripTashkil` (which already normalizes seeded text)

## Problem

The Quran data is normalized at seed time: `stripTashkil` removes diacritics and converts `أ إ آ ٱ` → `ا`. So `text_ar_simple` always contains plain alif. But the user's search query is sent verbatim. If a user types "إيمان", FTS5 looks for "إيمان" which won't match the normalized "ايمان" in the index.

We must normalize the **query** the same way as the indexed text.

## Your task

### Step 1 — Add a normalization helper to database.js

Open `database.js`. Near the top of the file, after the existing `let hasFTS5 = false; let hasQuranFTS = false;` declarations, ADD this helper:

```javascript
/**
 * Normalize Arabic text for search: strip diacritics, unify alif variants,
 * unify hamza, normalize ya/alif maqsura, ta marbuta. Mirrors the same
 * normalization that stripTashkil() in scripts/seed-quran.js applies to
 * the indexed text_ar_simple column.
 */
function normalizeArabicQuery(text) {
  if (!text) return '';
  return String(text)
    // Remove all Arabic diacritics, marks, and tatweel
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '')
    // Alif variants → plain alif
    .replace(/[\u0671\u0622\u0623\u0625]/g, '\u0627')
    // Alif maqsura → ya (helpful for cross-region spellings)
    // Note: keep this CONSISTENT with seed normalization. Currently seed
    // does NOT do this, so we shouldn't either. Comment kept for reference.
    // .replace(/\u0649/g, '\u064A')
    // Ta marbuta → ha is debatable. Saleh translation has both. Skip.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect whether a query is Arabic-script. Used to decide whether to
 * apply Arabic normalization. Uyghur uses Arabic script too, but with
 * additional letters; we detect those to differentiate.
 */
function isArabicScript(text) {
  if (!text) return false;
  // Has any Arabic-script char
  if (!/[\u0600-\u06FF]/.test(text)) return false;
  // If it has Uyghur-specific chars, treat as Uyghur (not pure Arabic)
  // ې=06D0 ە=06D5 ۆ=06C6 ۇ=06C7 ۈ=06C8 ۋ=06CB ڭ=06AD گ=06AF پ=067E چ=0686 ك=06A9 ھ=06BE
  if (/[\u06D0\u06D5\u06C6\u06C7\u06C8\u06CB\u06AD\u06AF\u067E\u0686\u06A9\u06BE]/.test(text)) {
    return false;
  }
  return true;
}
```

### Step 2 — Update `quranSearch` to normalize the query

Find the `quranSearch` function in `database.js`. At the very beginning of the function, after these lines:

```javascript
function quranSearch(query, opts) {
  opts = opts || {};
  const lang = opts.lang || 'auto';
  const limit = Math.max(1, Math.min(500, opts.limit || 200));
  if (!query || !String(query).trim()) return [];
  const q = String(query).trim();
```

**Add immediately after** `const q = String(query).trim();`:

```javascript
  // Normalize Arabic queries to match the seeded text_ar_simple normalization
  const isAr = isArabicScript(q);
  const qForArabicCols = isAr ? normalizeArabicQuery(q) : q;
  const qForUyghurCol = q; // Uyghur is not normalized at seed time
```

Then in the FTS5 branch, find this line:

```javascript
const tokens = q.split(/\s+/).map(w => w.replace(/["'*:]/g, '')).filter(Boolean);
```

**Replace** with:

```javascript
// Use Arabic-normalized query for Arabic search; raw query for Uyghur
const qToTokenize = (lang === 'ar' || (lang === 'auto' && isAr)) ? qForArabicCols : qForUyghurCol;
const tokens = qToTokenize.split(/\s+/).map(w => w.replace(/["'*:]/g, '')).filter(Boolean);
```

### Step 3 — Update `quranSearchSimple` (LIKE fallback) to normalize

Find `quranSearchSimple`. Replace it entirely with:

```javascript
function quranSearchSimple(q, lang, limit) {
  const isAr = isArabicScript(q);
  const qAr = isAr ? normalizeArabicQuery(q) : q;
  const qUg = q;

  let sql, params;
  if (lang === 'ar') {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ar_simple LIKE ? OR text_ar LIKE ? LIMIT ?`;
    params = ['%' + qAr + '%', '%' + qAr + '%', limit];
  } else if (lang === 'ug') {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ug LIKE ? LIMIT ?`;
    params = ['%' + qUg + '%', limit];
  } else {
    sql = `SELECT id, sura, aya, text_ar, text_ug FROM quran_ayas
           WHERE text_ar_simple LIKE ? OR text_ar LIKE ? OR text_ug LIKE ? LIMIT ?`;
    params = ['%' + qAr + '%', '%' + qAr + '%', '%' + qUg + '%', limit];
  }
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({ ...r, snip_ar: '', snip_ug: '' }));
}
```

### Step 4 — Update `quranContentSnippet` to normalize when scanning Arabic columns

Find `quranContentSnippet` in `database.js`. In the FTS5 branch, find:

```javascript
const tokens = cleanNeedle.split(/\s+/).filter(t => t.length >= 2);
```

**Replace** with:

```javascript
// Apply Arabic normalization for queries searching the Arabic FTS column
const isAr = isArabicScript(cleanNeedle);
const ftsNeedle = isAr ? normalizeArabicQuery(cleanNeedle) : cleanNeedle;
const tokens = ftsNeedle.split(/\s+/).filter(t => t.length >= 2);
```

In the same function's substring fallback, find:

```javascript
const lcNeedle = cleanNeedle.toLowerCase();
```

**Replace** with:

```javascript
// For Arabic columns: also try the normalized form so "إيمان" matches "ايمان"
const lcNeedle = cleanNeedle.toLowerCase();
const lcArNeedle = isArabicScript(cleanNeedle)
  ? normalizeArabicQuery(cleanNeedle).toLowerCase()
  : lcNeedle;
```

Then in the `scanColumn` function (inside `quranContentSnippet`), find:

```javascript
const hit = lcText.indexOf(lcNeedle);
```

**Replace** with:

```javascript
// Use Arabic-normalized needle for Arabic columns
const needle = (langTag === 'ar') ? lcArNeedle : lcNeedle;
const hit = lcText.indexOf(needle);
if (hit === -1) continue;
```

And right below that, replace these lines:

```javascript
const start = Math.max(0, hit - CTX);
const end = Math.min(text.length, hit + lcNeedle.length + CTX);
const before = text.slice(start, hit);
const match = text.slice(hit, hit + lcNeedle.length);
const after = text.slice(hit + lcNeedle.length, end);
```

with:

```javascript
const start = Math.max(0, hit - CTX);
const end = Math.min(text.length, hit + needle.length + CTX);
const before = text.slice(start, hit);
const match = text.slice(hit, hit + needle.length);
const after = text.slice(hit + needle.length, end);
```

(Just changing `lcNeedle` → `needle` in three places inside `scanColumn`.)

### Step 5 — Export the helpers (optional, for testing)

At the bottom of `database.js`, find the `module.exports` block. Add `normalizeArabicQuery` and `isArabicScript` so we can test them:

```javascript
module.exports = {
  // ...existing exports...,
  normalizeArabicQuery, isArabicScript,
  // ...rest
};
```

(Just add these two anywhere inside the existing exports object — don't change anything else.)

### Step 6 — Add a quick smoke test

Create a temp file `test-arabic-norm.js` in the project root:

```javascript
const db = require('./database');
console.log('Tests for normalizeArabicQuery:');
console.log('  إيمان →', JSON.stringify(db.normalizeArabicQuery('إيمان')));
console.log('  أحمد →', JSON.stringify(db.normalizeArabicQuery('أحمد')));
console.log('  بِسْمِ ٱللَّهِ →', JSON.stringify(db.normalizeArabicQuery('بِسْمِ ٱللَّهِ')));
console.log('  Pure Uyghur (untouched): ئىمان →', JSON.stringify(db.normalizeArabicQuery('ئىمان')));

console.log('\nTests for isArabicScript:');
console.log('  Arabic إيمان →', db.isArabicScript('إيمان'));
console.log('  Uyghur ئىمان →', db.isArabicScript('ئىمان'));
console.log('  English iman →', db.isArabicScript('iman'));
console.log('  Mixed آلله ئىمان →', db.isArabicScript('آلله ئىمان'));
```

Run it:

```bash
node test-arabic-norm.js
```

Expected output:
- `إيمان → "ايمان"` (alif-with-hamza-below stripped)
- `أحمد → "احمد"`
- `بِسْمِ ٱللَّهِ → "بسم الله"`
- Uyghur `ئىمان → "ئىمان"` (unchanged because we keep ئ — but tashkil cleared)
- Arabic detection: `إيمان → true`, `ئىمان → false`

Delete the test file after verification:

```bash
rm test-arabic-norm.js
```

(On Windows: `del test-arabic-norm.js`)

### Step 7 — Test in the app

```bash
npm start
```

1. Open Quran tab
2. Search box, type: `إيمان` (with hamza-under-alif)
   - Should return matches in suras containing "ايمان"
3. Search box, type: `الله`
   - Should return many matches
4. Search for `بسم الله الرحمن`
   - Should match Surah Al-Fatiha (which has the basmala)

### Step 8 — Test that Uyghur search still works

In the same Quran search:
1. Type: `ئىمان` (with the Uyghur Hamza-on-the-line ئ)
   - Should still find Uyghur translation matches
2. Type a Uyghur translation phrase like `ئاللاھ تائالا`
   - Should find matches

Both languages must work. If Uyghur stopped working, the Arabic-detection logic broke something.

### Step 9 — Commit

```bash
git add -A
git status
git commit -m "fix(quran): normalize alif/hamza variants in search queries"
```

### Step 10 — Final report

- ✅ `normalizeArabicQuery` and `isArabicScript` added
- ✅ `quranSearch` normalizes before FTS5
- ✅ `quranSearchSimple` normalizes before LIKE
- ✅ `quranContentSnippet` normalizes for Notes scanner Arabic matches
- ✅ Search "إيمان" finds "ايمان"
- ✅ Uyghur search still works
- ✅ Git commit hash: [show it]

Then say: **"Quran search normalization complete. Safe to proceed to PROMPT_07."**
