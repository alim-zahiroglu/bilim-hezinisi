# Prompt 02 — Make Quran Truly Offline

**Goal:** Currently, on first launch, the app downloads the Arabic Quran text from `tanzil.net`. This breaks the "offline-first" promise. We will ship the Arabic text inside the installer.

**Paste everything below this line into Claude Code:**

---

You are working on the "Bilim Hezinisi" Electron app. Read these files first to understand the current state:

1. `scripts/seed-quran.js` — current seeder that downloads from Tanzil
2. `main.js` — to see how `seedQuran` is invoked
3. `package.json` — to see the build configuration

## Problem

The function `downloadTanzil()` in `scripts/seed-quran.js` requires internet on first launch. We must ship the Arabic Quran text bundled with the app so it works fully offline.

## Your task

### Step 1 — Pre-fetch the Arabic Quran text NOW (build-time, one-time)

Create a new file `scripts/fetch-quran-data.js` with this exact content:

```javascript
/**
 * Build-time script: downloads the Arabic Quran text from Tanzil
 * and saves it to assets/seed/ so it can be shipped in the installer.
 *
 * Run ONCE before building: node scripts/fetch-quran-data.js
 *
 * After running, the file assets/seed/quran-uthmani-hafs.txt will exist
 * and the runtime seeder no longer needs internet access.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

const TANZIL_URL = 'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true&marks=true';
const ROOT = path.join(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'assets', 'seed');
const TARGET = path.join(SEED_DIR, 'quran-uthmani-hafs.txt');

if (!fs.existsSync(SEED_DIR)) {
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

console.log('Downloading Arabic Quran text from Tanzil...');
console.log('URL:', TANZIL_URL);
console.log('Target:', TARGET);

const file = fs.createWriteStream(TARGET);
const req = https.get(TANZIL_URL, { timeout: 60000 }, (res) => {
  if (res.statusCode !== 200) {
    file.close();
    try { fs.unlinkSync(TARGET); } catch(e) {}
    console.error('HTTP error:', res.statusCode);
    process.exit(1);
  }
  res.pipe(file);
  file.on('finish', () => {
    file.close(() => {
      const stats = fs.statSync(TARGET);
      const buffer = fs.readFileSync(TARGET);
      const sha = crypto.createHash('sha256').update(buffer).digest('hex');

      // Sanity check: count lines that match the Tanzil format "sura|aya|text"
      const text = buffer.toString('utf-8');
      const ayaLines = text.split(/\r?\n/).filter(l => /^\d+\|\d+\|/.test(l));

      console.log('');
      console.log('=== DOWNLOAD COMPLETE ===');
      console.log('File size:', stats.size, 'bytes');
      console.log('SHA-256:  ', sha);
      console.log('Aya lines:', ayaLines.length);
      console.log('');

      if (ayaLines.length !== 6236) {
        console.error('WARNING: Expected 6236 ayas, got', ayaLines.length);
        console.error('The download may be corrupted. Re-run this script.');
        process.exit(1);
      }

      console.log('SUCCESS: quran-uthmani-hafs.txt is ready to ship.');
      console.log('Now add this SHA-256 to seed-quran.js for integrity verification:');
      console.log('  ' + sha);
    });
  });
  file.on('error', (err) => {
    console.error('Write error:', err.message);
    process.exit(1);
  });
});
req.on('error', (err) => {
  console.error('Network error:', err.message);
  process.exit(1);
});
req.on('timeout', () => {
  req.destroy(new Error('Timed out after 60s'));
});
```

### Step 2 — Run the fetch script

```bash
node scripts/fetch-quran-data.js
```

Show me the full output. It MUST end with "SUCCESS: quran-uthmani-hafs.txt is ready to ship." and print a SHA-256 hash. **Save that SHA-256 hash** — we will use it in the next step.

If the download fails (e.g., no internet on this machine), tell me — we'll need a different approach.

### Step 3 — Verify the file exists

```bash
ls -la assets/seed/quran-uthmani-hafs.txt
```

Confirm the file is approximately 700KB-900KB.

### Step 4 — Update `scripts/seed-quran.js` to refuse network access

Open `scripts/seed-quran.js`. Replace the entire `seedQuran` function (the function near the bottom that takes `projectRoot` and `database`) with this new version. Also remove the `downloadTanzil` function entirely since it's no longer needed:

Replace the function `seedQuran` and **remove** the function `downloadTanzil` and its `TANZIL_URL` constant. The new `seedQuran` function should be:

```javascript
async function seedQuran(projectRoot, database) {
  if (database.quranSuraExists && database.quranSuraExists()) {
    console.log('[seed-quran] Already seeded, skipping.');
    return { skipped: true };
  }

  // First check the installed location, then fall back to dev location
  const seedPaths = [
    path.join(projectRoot, 'assets', 'seed', 'quran-uthmani-hafs.txt'),
    // electron-builder places extraResources at process.resourcesPath
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'assets', 'seed', 'quran-uthmani-hafs.txt') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'seed', 'quran-uthmani-hafs.txt') : null
  ].filter(Boolean);

  let arabicPath = null;
  for (const p of seedPaths) {
    if (fs.existsSync(p)) { arabicPath = p; break; }
  }

  if (!arabicPath) {
    throw new Error(
      'Bundled Arabic Quran text is missing. The installer is corrupted. ' +
      'Reinstall the app from the original .exe.'
    );
  }

  const uyghurPath = findUyghurXml(projectRoot);
  if (!uyghurPath) {
    throw new Error(
      'Bundled Uyghur Quran translation XML is missing. The installer is corrupted. ' +
      'Reinstall the app from the original .exe.'
    );
  }

  console.log('[seed-quran] Reading bundled data...');
  console.log('[seed-quran] Arabic:', arabicPath);
  console.log('[seed-quran] Uyghur:', uyghurPath);

  const arContent = fs.readFileSync(arabicPath, 'utf-8');
  const ugContent = fs.readFileSync(uyghurPath, 'utf-8');
  const arMap = parseTanzil(arContent);
  const ugMap = parseUyghurXml(ugContent);

  let totalAr = 0, totalUg = 0;
  for (const s in arMap) totalAr += Object.keys(arMap[s]).length;
  for (const s in ugMap) totalUg += Object.keys(ugMap[s]).length;
  console.log(`[seed-quran] Parsed: ${totalAr} Arabic ayas, ${totalUg} Uyghur ayas`);

  // Hard data integrity checks
  const errors = [];
  if (totalAr !== 6236) {
    errors.push(`Arabic: expected 6236 ayas, got ${totalAr}`);
  }
  if (totalUg < 6000) {
    errors.push(`Uyghur: too few ayas (${totalUg}), data appears corrupt`);
  }
  for (let sn = 1; sn <= 114; sn++) {
    const meta = SURA_META[sn - 1];
    const arCount = arMap[sn] ? Object.keys(arMap[sn]).length : 0;
    if (arCount !== meta.count) {
      errors.push(`Sura ${sn} (${meta.ar}): expected ${meta.count} ayas, got ${arCount}`);
    }
  }
  if (errors.length) {
    throw new Error('Quran data integrity check failed:\n  - ' + errors.join('\n  - '));
  }

  const suras = SURA_META.map(s => ({
    number: s.n, name_ar: s.ar, name_ug: s.ug,
    name_translit: s.tr, revelation: s.rev, aya_count: s.count
  }));

  const ayas = [];
  for (let sn = 1; sn <= 114; sn++) {
    const expectedCount = SURA_META[sn - 1].count;
    for (let an = 1; an <= expectedCount; an++) {
      const ar = (arMap[sn] && arMap[sn][an]) ? arMap[sn][an] : '';
      const ug = (ugMap[sn] && ugMap[sn][an]) ? ugMap[sn][an] : '';
      if (!ar) throw new Error(`Missing Arabic text for ${sn}:${an}`);
      ayas.push({
        sura: sn, aya: an,
        text_ar: ar,
        text_ar_simple: stripTashkil(ar),
        text_ug: cleanUyghurTranslation(ug)
      });
    }
  }

  const result = database.quranSeedBulk(suras, ayas);
  console.log(`[seed-quran] Seeded: ${result.suras} suras, ${result.ayas} ayas.`);
  return result;
}

/**
 * Cleans Uyghur translation text by removing tafsir citation markers
 * like (1), (2،3), [12] that appear inline in the Saleh translation.
 */
function cleanUyghurTranslation(text) {
  if (!text) return '';
  return String(text)
    .replace(/\([\d،,\s\-]+\)/g, '')
    .replace(/\[[\d،,\s\-]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

Also update the `module.exports` line at the bottom of `scripts/seed-quran.js` to include `cleanUyghurTranslation`:

```javascript
module.exports = { seedQuran, stripTashkil, cleanUyghurTranslation, SURA_META };
```

### Step 5 — Verify `seed-quran.js` no longer references downloadTanzil

```bash
grep -n "downloadTanzil\|TANZIL_URL\|require.*https" scripts/seed-quran.js
```

The grep should return **no results**. If it does, those references are stale and must be removed.

### Step 6 — Verify package.json already includes the seed in the build

Open `package.json`. Look at the `"build"` → `"files"` array. It should already contain `"assets/seed/**/*"`. If it does NOT, add it. Show me the relevant section after editing.

### Step 7 — Add a script entry to package.json

In `package.json`, in the `"scripts"` section, add this new entry (don't remove any existing entries):

```json
"fetch-quran": "node scripts/fetch-quran-data.js"
```

So the scripts section becomes (showing context):

```json
"scripts": {
  "setup": "node setup-pdfjs.js",
  "fetch-quran": "node scripts/fetch-quran-data.js",
  "build-spelldict": "node scripts/build-spelldict.js",
  "start": "electron .",
  "dev": "electron . --dev",
  "dist-win": "electron-builder --win --x64",
  "dist-mac": "electron-builder --mac",
  "dist-linux": "electron-builder --linux",
  "dist": "electron-builder --win --x64"
},
```

### Step 8 — Test the app

Delete the user's local SQLite database so the seeder runs fresh:

```bash
node -e "const fs=require('fs'),path=require('path'),os=require('os');const dbPath=path.join(os.homedir(),'JamiyKutupxana','library.db');if(fs.existsSync(dbPath)){fs.unlinkSync(dbPath);console.log('Deleted old DB:',dbPath);}else{console.log('No old DB to delete');}"
```

Then start the app:

```bash
npm start
```

The app should launch. Open the "قۇرئان كەرىم" tab. It should display all 114 suras. Click on سۈرە الفاتحة and verify all 7 ayas appear.

If the Quran tab shows an error, tell me what the error message is.

### Step 9 — Test offline scenario

Close the app. Disable your network if possible (or just trust the test). Start the app again:

```bash
npm start
```

It should still work without internet because the data is now bundled.

### Step 10 — Commit

```bash
git add -A
git status
git commit -m "feat(quran): bundle Arabic text in installer for true offline support"
```

### Step 11 — Final report

Tell me:
- ✅ `assets/seed/quran-uthmani-hafs.txt` size in bytes
- ✅ `seed-quran.js` no longer references network
- ✅ App launches and Quran loads
- ✅ Git commit hash

Then say: **"Quran offline complete. Safe to proceed to PROMPT_03."**
