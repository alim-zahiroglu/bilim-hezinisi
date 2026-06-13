/**
 * Copies the browser builds of @mozilla/readability (article extraction) and
 * turndown (HTML → Markdown) from node_modules into assets/vendor so they can
 * be loaded by index.html as plain <script> tags (CSP: script-src 'self', no
 * CDN, offline-first). Run via: node scripts/copy-vendor.js
 *
 * This is also wired into "postinstall" so a fresh `npm install` reproduces
 * the vendored files (same pattern as scripts/copy-dompurify.js).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST_DIR = path.join(ROOT, 'assets', 'vendor');

const FILES = [
  {
    // Classic script: declares a global `Readability` constructor.
    src: path.join(ROOT, 'node_modules', '@mozilla', 'readability', 'Readability.js'),
    dest: path.join(DEST_DIR, 'Readability.js'),
    hint: 'npm install @mozilla/readability'
  },
  {
    // UMD build: sets window.TurndownService.
    src: path.join(ROOT, 'node_modules', 'turndown', 'lib', 'turndown.browser.umd.js'),
    dest: path.join(DEST_DIR, 'turndown.js'),
    hint: 'npm install turndown'
  }
];

// --- Offline OCR vendoring (Phase 1) -------------------------------------
// Bundle tesseract.js' worker + the WASM core into assets/ocr so the OCR
// pipeline is fully self-contained and offline. The MAIN-process Node OCR
// handler (main.js → ocr-recognize) actually loads the core via
// `require('tesseract.js-core/...')` and the worker via worker_threads, so
// these copies are the portable offline asset bundle (also usable from a
// browser context). The Uyghur trained models (ukij/uig/eng/tur) are NOT
// shipped in the repo — fetch them once with `npm run fetch-ocr-models`.
const OCR_DEST_DIR = path.join(ROOT, 'assets', 'ocr');
const TJS_CORE = path.join(ROOT, 'node_modules', 'tesseract.js-core');
const OCR_FILES = [
  {
    src: path.join(ROOT, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    dest: path.join(OCR_DEST_DIR, 'worker.min.js'),
    hint: 'npm install tesseract.js'
  }
];
// LSTM-only mode (OEM 1) uses the *-lstm core; tesseract.js-core picks the
// SIMD build when the CPU supports it, else the plain LSTM build. Copy both
// (.js glue + .wasm) so either is available offline.
['tesseract-core-simd-lstm', 'tesseract-core-lstm'].forEach((base) => {
  ['.wasm.js', '.wasm', '.js'].forEach((ext) => {
    const src = path.join(TJS_CORE, base + ext);
    if (fs.existsSync(src)) {
      OCR_FILES.push({ src, dest: path.join(OCR_DEST_DIR, base + ext), hint: 'npm install tesseract.js-core' });
    }
  });
});

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}
if (!fs.existsSync(OCR_DEST_DIR)) {
  fs.mkdirSync(OCR_DEST_DIR, { recursive: true });
}
// Keep the tessdata folder present even before models are fetched.
const TESSDATA_DIR = path.join(OCR_DEST_DIR, 'tessdata');
if (!fs.existsSync(TESSDATA_DIR)) {
  fs.mkdirSync(TESSDATA_DIR, { recursive: true });
}

let failed = false;
FILES.concat(OCR_FILES).forEach(({ src, dest, hint }) => {
  if (!fs.existsSync(src)) {
    console.error('[copy-vendor] Not found:', src);
    console.error('[copy-vendor] Run:', hint);
    failed = true;
    return;
  }
  fs.copyFileSync(src, dest);
  console.log('[copy-vendor] Copied to', dest, '—', fs.statSync(dest).size, 'bytes');
});

if (failed) process.exit(1);
