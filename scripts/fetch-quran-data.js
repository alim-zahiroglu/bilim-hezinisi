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
