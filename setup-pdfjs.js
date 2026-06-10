/**
 * Setup script to download pdf.js locally for offline support.
 * Run this once before building: node setup-pdfjs.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const PDFJS_VERSION = '3.11.174';
const PDFJS_DIR = path.join(__dirname, 'assets', 'pdfjs');

const FILES = [
  {
    url: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`,
    dest: path.join(PDFJS_DIR, 'pdf.min.js')
  },
  {
    url: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`,
    dest: path.join(PDFJS_DIR, 'pdf.worker.min.js')
  }
];

if (!fs.existsSync(PDFJS_DIR)) {
  fs.mkdirSync(PDFJS_DIR, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${path.basename(dest)} (${fs.statSync(dest).size} bytes)`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log(`Downloading pdf.js v${PDFJS_VERSION} for offline support...`);
  for (const f of FILES) {
    try {
      await download(f.url, f.dest);
    } catch(e) {
      console.error(`Failed to download ${f.url}:`, e.message);
      process.exit(1);
    }
  }
  console.log('\nDone! pdf.js is now available for offline use.');
}

main();
