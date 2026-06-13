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
 * UyghurOCR 2.0 ships its models inside the release ZIP, so we download and
 * extract that first; if it is unreachable we fall back to the raw per-file
 * URLs. These large binaries are deliberately NOT committed (see .gitignore).
 * Run once on a networked machine:  npm run fetch-ocr-models
 * (re-running is safe; existing files are skipped unless --force is passed).
 *
 * This is a BUILD-TIME helper run from Node, not the app. The app itself never
 * downloads anything — runtime OCR reads these files from disk offline.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const DEST_DIR = path.join(__dirname, '..', 'assets', 'ocr', 'tessdata');
const FORCE = process.argv.includes('--force');

const ZIP_URL = 'https://github.com/gheyret/UyghurOCR/releases/download/2.0/UyghurOCR.zip';
// Raw per-file fallback (same models): try the 2.0 tag, then master.
const BASES = [
  'https://raw.githubusercontent.com/gheyret/UyghurOCR/2.0/tessdata/',
  'https://raw.githubusercontent.com/gheyret/UyghurOCR/master/tessdata/'
];
const MODELS = ['ukij.traineddata', 'uig.traineddata', 'eng.traineddata', 'tur.traineddata'];

// --- HTTP helpers (redirect-following) --------------------------------------
function httpGetBuffer(url, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if (depth > 6) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'bilim-hezinisi-ocr-fetch' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return httpGetBuffer(res.headers.location, depth + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      const chunks = []; let got = 0;
      res.on('data', (c) => {
        chunks.push(c); got += c.length;
        if (total) process.stdout.write('\r  downloading: ' + Math.round((got / total) * 100) + '%   ');
      });
      res.on('end', () => { process.stdout.write('\r  downloaded ' + Math.round(got / 1024) + ' KB        \n'); resolve(Buffer.concat(chunks)); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    httpGetBuffer(url).then((buf) => {
      fs.writeFileSync(dest, buf);
      resolve(buf.length);
    }, reject);
  });
}

// --- minimal ZIP reader (central-directory based; deflate + stored) ---------
function findEOCD(buf) {
  const SIG = 0x06054b50;
  const start = Math.max(0, buf.length - 22 - 0xFFFF);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG) return i;
  }
  return -1;
}
function extractZip(buf, wantBasenames) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('not a ZIP (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);   // central directory offset
  const out = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;   // central file header sig
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    const base = name.split('/').pop();
    if (wantBasenames.indexOf(base) === -1) continue;
    if (buf.readUInt32LE(localOff) !== 0x04034b50) continue;   // local file header sig
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.slice(dataStart, dataStart + compSize);
    if (method === 0) out[base] = comp;
    else if (method === 8) out[base] = zlib.inflateRawSync(comp);
    else throw new Error('unsupported zip compression method ' + method + ' for ' + base);
  }
  return out;
}

function present(name) {
  const dest = path.join(DEST_DIR, name);
  return !FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 100000;
}

async function main() {
  if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log('Fetching UyghurOCR 2.0 models into', DEST_DIR);

  if (MODELS.every(present)) {
    console.log('All models already present (use --force to refresh).');
    return;
  }

  // 1) Try the release ZIP and extract the models from it.
  let fromZip = {};
  try {
    console.log('Downloading release ZIP:', ZIP_URL);
    const zipBuf = await httpGetBuffer(ZIP_URL);
    fromZip = extractZip(zipBuf, MODELS);
    console.log('Extracted from ZIP:', Object.keys(fromZip).join(', ') || '(none matched)');
  } catch (e) {
    console.warn('ZIP path failed (' + e.message + ') — falling back to raw URLs.');
  }

  // 2) Write each model: from the ZIP if present, else download the raw file.
  let failed = 0;
  for (const m of MODELS) {
    const dest = path.join(DEST_DIR, m);
    if (present(m)) { console.log('  ' + m + ': already present, skipping'); continue; }
    if (fromZip[m] && fromZip[m].length > 100000) {
      fs.writeFileSync(dest, fromZip[m]);
      console.log('  ' + m + ': written from ZIP (' + Math.round(fromZip[m].length / 1024) + ' KB)');
      continue;
    }
    let ok = false;
    for (const base of BASES) {
      try { const n = await downloadToFile(base + m, dest); console.log('  ' + m + ': downloaded raw (' + Math.round(n / 1024) + ' KB)'); ok = true; break; }
      catch (e) { console.warn('  ' + m + ': ' + e.message + ' — trying next source...'); }
    }
    if (!ok) { failed++; console.error('  ' + m + ': FAILED'); }
  }

  if (failed) {
    console.error('\n' + failed + ' model(s) failed. Re-run `npm run fetch-ocr-models`, or download them');
    console.error('manually from ' + ZIP_URL + ' (tessdata/) into:\n  ' + DEST_DIR);
    process.exit(1);
  }
  console.log('\nAll OCR models ready. UKIJ OCR now works fully offline.');
}

// Run only when invoked directly; export the ZIP reader for unit tests.
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { extractZip: extractZip, findEOCD: findEOCD };
