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

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

let failed = false;
FILES.forEach(({ src, dest, hint }) => {
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
