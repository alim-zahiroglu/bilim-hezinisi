/**
 * Fetch the offline Uyghur OCR trained models into assets/ocr/tessdata.
 *
 * Source: Gheyret Kenji's UyghurOCR 2.0 (MIT) — https://github.com/gheyret/UyghurOCR
 * The C# WinForms app is NOT shipped; we reuse only its trained Tesseract
 * models with the bundled tesseract.js engine (see main.js → ocr-recognize).
 *
 *   ukij.traineddata  — Gheyret's custom Uyghur model (UyghurOCR's default)
 *   uig.traineddata   — secondary Uyghur model
 *   eng.traineddata   — English, for mixed texts
 *   tur.traineddata   — Turkish, for mixed texts
 *
 * These are large binaries and are deliberately NOT committed to the repo.
 * Run once on a networked machine:  npm run fetch-ocr-models
 * (re-running is safe; existing files are skipped unless --force is passed).
 *
 * This is a BUILD-TIME helper run from Node, not the app. The app itself
 * never downloads anything — runtime OCR reads these files from disk offline.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEST_DIR = path.join(__dirname, '..', 'assets', 'ocr', 'tessdata');
const FORCE = process.argv.includes('--force');

// Primary: the 2.0 release tessdata. Fallback: the repo master tessdata
// (same models). We try each base URL in order until one succeeds.
const BASES = [
  'https://raw.githubusercontent.com/gheyret/UyghurOCR/2.0/tessdata/',
  'https://raw.githubusercontent.com/gheyret/UyghurOCR/master/tessdata/'
];
const MODELS = ['ukij.traineddata', 'uig.traineddata', 'eng.traineddata', 'tur.traineddata'];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part';
    const file = fs.createWriteStream(tmp);
    const req = https.get(url, { headers: { 'User-Agent': 'bilim-hezinisi-ocr-fetch' } }, (res) => {
      // Follow redirects (GitHub raw → objects.githubusercontent.com).
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(tmp, () => {});
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(tmp, () => {});
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0;
      res.on('data', (c) => {
        got += c.length;
        if (total) process.stdout.write('\r  ' + path.basename(dest) + ': ' + Math.round((got / total) * 100) + '%   ');
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        fs.renameSync(tmp, dest);
        process.stdout.write('\r  ' + path.basename(dest) + ': done (' + Math.round(got / 1024) + ' KB)        \n');
        resolve();
      }));
    });
    req.on('error', (e) => { file.close(); fs.unlink(tmp, () => {}); reject(e); });
  });
}

async function fetchModel(name) {
  const dest = path.join(DEST_DIR, name);
  if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 100000) {
    console.log('  ' + name + ': already present, skipping (use --force to refresh)');
    return;
  }
  let lastErr = null;
  for (const base of BASES) {
    try {
      await download(base + name, dest);
      return;
    } catch (e) {
      lastErr = e;
      console.warn('  ' + name + ': ' + e.message + ' — trying next source...');
    }
  }
  throw lastErr || new Error('all sources failed for ' + name);
}

(async () => {
  if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log('Fetching UyghurOCR 2.0 models into', DEST_DIR);
  let failed = 0;
  for (const m of MODELS) {
    try { await fetchModel(m); }
    catch (e) { failed++; console.error('  ' + m + ': FAILED — ' + e.message); }
  }
  if (failed) {
    console.error('\n' + failed + ' model(s) failed. Re-run `npm run fetch-ocr-models`, or download them');
    console.error('manually from https://github.com/gheyret/UyghurOCR (tessdata/) into:\n  ' + DEST_DIR);
    process.exit(1);
  }
  console.log('\nAll OCR models ready. OCR now works fully offline.');
})();
