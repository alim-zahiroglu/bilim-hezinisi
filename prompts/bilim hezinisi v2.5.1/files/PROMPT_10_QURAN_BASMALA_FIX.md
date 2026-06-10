# PROMPT 10 — Remove Duplicated Basmala from Ayah 1 of Every Sura (Except Al-Fatiha)

**Paste everything below this line into Claude Code:**

---

## Context

You are working on the «بىلىم خەزىنىسى» Electron app. The Quran data has a content bug: **every Sura's first ayah text begins with the basmala** (`بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ`), even though the basmala is only canonically part of ayah 1 in Surat Al-Fatiha (sura 1). The basmala is also rendered as a standalone block under the Sura title, so users see it twice.

**Goal:** Strip the basmala prefix from ayah 1 of every Sura **except sura 1**, both in the seeded JSON files and in the database `quran_ayas` table.

## Read first (do not modify yet)

1. `database.js` — find the `seedQuranIfNeeded` function and the `quran_ayas` table schema
2. `scripts/seed-quran.js` — find `stripTashkil` and the JSON-loading logic
3. `assets/quran/quran-ar.json` (and `quran-ug.json` if a separate file exists) — read the first 3 entries of suras 1, 2, 9, 114 to confirm the structure
4. `src/quran.js` — find the ayah-rendering function so we can confirm rendering is unchanged

After reading, **list back to me**:
- The exact path/shape of the Arabic ayah JSON (array of objects? what keys?)
- Whether translations live in the same file or a separate one
- The exact string in `quran-ar.json` for sura 2 ayah 1 (paste it)
- The exact string for sura 9 ayah 1 (paste it — note that sura 9 At-Tawba does **not** start with basmala in any standard mushaf, so this is a sanity check)
- Whether the seed pipeline is "JSON-as-built file → DB" or "JSON parsed at runtime → DB"

Wait for my **"go"** before making changes.

## Implementation plan (after I say go)

### Step 1 — Define the basmala-detection logic

The basmala has many encoded variants depending on which mushaf source the JSON came from. Build a normalizer that handles all of them. Add this helper to `scripts/seed-quran.js`, near `stripTashkil`:

```javascript
/**
 * Detects whether `arabicAyahText` begins with the basmala
 * (بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ) and, if so, returns the rest
 * of the ayah with the basmala (and any trailing whitespace) removed.
 * If no basmala prefix, returns the input unchanged.
 *
 * Tolerates: dagger alif vs. plain alif on الله, presence/absence of
 * shadda on the lam, alif-wasla (ٱ) vs. plain alif (ا), trailing
 * U+200F (RLM) and U+0020 / U+00A0 / U+2009 spaces, optional ayah
 * separator chars (e.g. ۝, ﴿﴾) appearing before the actual ayah text.
 */
function stripBasmalaPrefix(text) {
  if (!text) return text;
  const stripped = stripTashkil(text);          // already removes harakat & unifies alif
  // After stripTashkil "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" becomes "بسم الله الرحمن الرحيم"
  const BASMALA_NORMALIZED = 'بسم الله الرحمن الرحيم';
  const idx = stripped.indexOf(BASMALA_NORMALIZED);
  if (idx === -1 || idx > 5) return text;       // not at start (allow up to 5 chars of leading punctuation)

  // Walk the original text in lockstep with the normalized text, counting
  // how many original chars correspond to (idx + BASMALA_NORMALIZED.length)
  // normalized chars. We can't just slice the original by the normalized
  // length because tashkil removal changes lengths.
  const targetNormLen = idx + BASMALA_NORMALIZED.length;
  let consumedNorm = 0, origPos = 0;
  while (origPos < text.length && consumedNorm < targetNormLen) {
    const ch = text[origPos];
    const chNorm = stripTashkil(ch);
    consumedNorm += chNorm.length;
    origPos++;
  }
  // Trim any trailing whitespace, RLM, or ayah separator that sat between
  // the basmala and the actual ayah text
  let rest = text.slice(origPos).replace(/^[\s\u200F\u200E\u00A0\u2009ۚۖۗۘۙۛ]+/, '');
  return rest;
}
```

### Step 2 — Apply at seed time (preferred path)

In `scripts/seed-quran.js`, find the loop that inserts ayahs into `quran_ayas`. For each row where `aya === 1 && sura !== 1`, run `text_ar = stripBasmalaPrefix(text_ar)` **before** the INSERT. **Do not** touch the Uyghur translation column — translations almost never include a duplicate basmala (they typically just have the translation of the ayah). If your reading of the Uyghur JSON in step 0 above shows that it *does* include a translated basmala on ayah 1 of every Sura, tell me before changing anything — we'll handle that separately.

### Step 3 — Backfill existing installs (one-shot migration)

Users on v2.5 already have a populated `quran_ayas` table. They won't re-seed. Add a migration block that runs on every startup, idempotent. In `database.js`, near the other migration blocks (search for `PRAGMA user_version` or look for the schema-bump pattern), add:

```javascript
// Migration: strip duplicated basmala from ayah 1 of suras 2..114.
// Idempotent — safe to run on already-fixed databases (regex won't match anything).
function migrationStripBasmalaAyah1() {
  const rows = db.prepare(
    `SELECT id, sura, aya, text_ar FROM quran_ayas WHERE aya = 1 AND sura != 1`
  ).all();
  if (!rows.length) return 0;

  const update = db.prepare(`UPDATE quran_ayas SET text_ar = ?, text_ar_simple = ? WHERE id = ?`);
  let fixed = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const newAr = stripBasmalaPrefix(r.text_ar);
      if (newAr !== r.text_ar) {
        update.run(newAr, stripTashkil(newAr), r.id);
        fixed++;
      }
    }
  });
  tx();
  console.log(`[migration] basmala-ayah1: cleaned ${fixed}/${rows.length} rows`);
  return fixed;
}
```

You'll need to import `stripBasmalaPrefix` and `stripTashkil` into `database.js` (or duplicate them — they're tiny). Pick whichever is cleaner given the current module layout. **Tell me which you chose** in your report.

Wire the migration into the existing startup path so it runs once on app launch (it's idempotent so re-running is harmless, but gate it on a version flag if the existing pattern uses one — match the existing convention exactly).

### Step 4 — Refresh the FTS index for the affected rows

The FTS table `quran_fts` (if it exists in this build — check) was indexed from the old `text_ar` / `text_ar_simple`. After the migration updates those columns, you must re-index those rows. Two options:

- **A.** If the FTS table is built with content-table triggers, the UPDATE in step 3 will automatically refresh the index. Verify by checking for a `CREATE TRIGGER ... AFTER UPDATE ON quran_ayas` block in the schema.
- **B.** If no trigger exists, after the migration loop, run:
  ```sql
  INSERT INTO quran_fts(quran_fts) VALUES('rebuild');
  ```
  This is expensive (1–3 seconds) but only happens once per user.

Pick the right option based on the schema. **Tell me which.**

### Step 5 — Sanity check the rendering layer

Open `src/quran.js`. Find where ayah 1 is rendered. Confirm there is **no** logic that *adds* a basmala to ayah 1 — if there is, the visible duplicate would come from rendering, not data, and the migration alone wouldn't fix it. The standalone basmala block under the Sura title is **separate** and must remain.

If you find rendering-side basmala injection, **stop and tell me** — we may need a different fix.

### Step 6 — Test

```bash
npm start
```

1. Open Quran tab.
2. Navigate to **Sura 2 (Al-Baqara)**. First ayah should be `الٓمٓ` only — no basmala prefix.
3. Navigate to **Sura 1 (Al-Fatiha)**. First ayah should still be `بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ` (this Sura is the exception — basmala IS ayah 1 here).
4. Navigate to **Sura 9 (At-Tawba)**. First ayah should be `بَرَآءَةٌ مِّنَ ٱللَّهِ...` — no basmala prefix (At-Tawba never had one).
5. Navigate to **Sura 4 (An-Nisa)** — the screenshot the user reported. First ayah should now be `يَٰٓأَيُّهَا ٱلنَّاسُ ٱتَّقُواْ رَبَّكُمُ...` without the leading basmala.
6. The standalone basmala block under each Sura title should still appear (untouched).

### Step 7 — Commit

```bash
git add -A
git status
git commit -m "fix(quran): remove duplicated basmala from ayah 1 of suras 2-114"
```

### Step 8 — Final report

- ✅ `stripBasmalaPrefix` added (location: …)
- ✅ Seed-time path applies the strip (file & line: …)
- ✅ Migration `migrationStripBasmalaAyah1` added and wired into startup
- ✅ FTS strategy used: trigger-based / explicit rebuild
- ✅ Sura 1 ayah 1 unchanged (basmala kept)
- ✅ Sura 2/4/9 ayah 1 cleaned
- ✅ Standalone basmala block under Sura title still rendering
- ✅ Migration log line on startup: `[migration] basmala-ayah1: cleaned N/113 rows`
- ✅ Git commit hash: …

Then say: **"Quran basmala fix complete. Safe to proceed to PROMPT_11."**
