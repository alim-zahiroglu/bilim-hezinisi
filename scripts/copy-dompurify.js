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
