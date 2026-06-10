// Build the runtime Uyghur spell-check assets.
//
// Primary source — the inflected-form word list shipped with UyghurEditPP:
//   _reference/UyghurEditPP/uyghur_imla.txt    "word frequency" per line, ~441k entries
//   _reference/UyghurEditPP/imla_xatatoghra.txt   "wrong=correct" pairs
//
// Fallback (if _reference/ is absent — e.g. on a fresh clone where the
// reference repos haven't been pulled): use the previously-staged raw files at
//   assets/spellcheck/raw/imla_xatatoghra.txt
// (the imla_ocr_*.txt files in there are stems and would produce too many
// false errors, so we only use them as a last-resort word source.)
//
// Outputs (under assets/spellcheck/):
//   uyghur_words.txt          one lowercased word per line, sorted
//   uyghur_corrections.json   { wrong: correct, ... }
//
// Run with:  npm run build-spelldict

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'spellcheck');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const REF_PP  = path.join(ROOT, '_reference', 'UyghurEditPP');

const OUT_WORDS = path.join(OUT_DIR, 'uyghur_words.txt');
const OUT_CORR  = path.join(OUT_DIR, 'uyghur_corrections.json');

// Uyghur Arabic-script alphabet + tatweel + apostrophes used in compounds.
// Same character class UyghurEditPP uses to find words for spell checking.
const UEY_CHAR_CLASS = "ـئابتجخدرزسشغفقكلمنوىيپچژڭگھۆۇۈۋېەلا'’\\-";
const UEY_RE = new RegExp('^[' + UEY_CHAR_CLASS + ']+$');
const SOZGHUCH = 'ـ'; // Arabic Tatweel — stripped before lookup.

function stripBom(s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function isUyghurWord(s) {
  return s.length >= 2 && UEY_RE.test(s);
}

function buildWordList() {
  const ppFile = path.join(REF_PP, 'uyghur_imla.txt');
  if (!fs.existsSync(ppFile)) {
    console.error('[build-spelldict] missing source dictionary:', ppFile);
    console.error('[build-spelldict] clone https://github.com/gheyret/UyghurEditPP into _reference/');
    process.exit(1);
  }

  const words = new Set();
  const text = fs.readFileSync(ppFile, 'utf8');
  let total = 0, kept = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripBom(rawLine).trim();
    if (!line) continue;
    total++;
    // Format: "word frequency" — split on first whitespace; we ignore the freq.
    const sp = line.search(/\s/);
    const word = (sp > 0 ? line.slice(0, sp) : line).trim().replace(new RegExp(SOZGHUCH, 'g'), '').toLowerCase();
    if (!isUyghurWord(word)) continue;
    words.add(word);
    kept++;
  }
  console.log('[build-spelldict] read', total, 'lines from uyghur_imla.txt; kept', kept);
  return Array.from(words).sort((a, b) => a.localeCompare(b));
}

function buildCorrections() {
  // Prefer the version in _reference (matches the dictionary's vintage),
  // fall back to the raw staged copy if the reference clone isn't present.
  const candidates = [
    path.join(REF_PP, 'imla_xatatoghra.txt'),
    path.join(RAW_DIR, 'imla_xatatoghra.txt')
  ];
  const file = candidates.find(p => fs.existsSync(p));
  const out = {};
  if (!file) {
    console.warn('[build-spelldict] no imla_xatatoghra.txt found — corrections will be empty');
    return out;
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripBom(rawLine).trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const wrong = line.slice(0, eq).trim().replace(new RegExp(SOZGHUCH, 'g'), '').toLowerCase();
    const right = line.slice(eq + 1).trim().replace(new RegExp(SOZGHUCH, 'g'), '');
    if (!wrong || !right) continue;
    if (!out[wrong]) out[wrong] = right;
  }
  console.log('[build-spelldict] read corrections from', path.relative(ROOT, file));
  return out;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const words = buildWordList();
  fs.writeFileSync(OUT_WORDS, words.join('\n') + '\n', 'utf8');
  console.log('[build-spelldict] wrote', path.relative(ROOT, OUT_WORDS), '—', words.length, 'words');

  const corr = buildCorrections();
  fs.writeFileSync(OUT_CORR, JSON.stringify(corr, null, 0), 'utf8');
  console.log('[build-spelldict] wrote', path.relative(ROOT, OUT_CORR), '—', Object.keys(corr).length, 'corrections');
}

main();
