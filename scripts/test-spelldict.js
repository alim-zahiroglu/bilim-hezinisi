// Offline harness for spellcheck.js logic — validates the test cases listed
// in the prompt without needing the Electron GUI. Inlines the dictionary load
// + isCorrect + lookup so we can run the same algorithm under plain node.
//
// Usage: node scripts/test-spelldict.js

const fs = require('fs');
const path = require('path');

const SOZGHUCH = 'ـ';
const UEY_LETTERS = 'ـئابتجخدرزسشغفقكلمنوىيپچژڭگھۆۇۈۋېەلا';
const VOWELS = new Set(['ا','ە','و','ۇ','ۆ','ۈ','ې','ى']);

const wordsText = fs.readFileSync(path.join(__dirname, '..', 'assets', 'spellcheck', 'uyghur_words.txt'), 'utf8');
const corrJSON  = fs.readFileSync(path.join(__dirname, '..', 'assets', 'spellcheck', 'uyghur_corrections.json'), 'utf8');

const dict = new Set();
const dictByLength = new Map();
for (const raw of wordsText.split('\n')) {
  const w = raw.replace(/\r$/, '').trim();
  if (!w) continue;
  if (dict.has(w)) continue;
  dict.add(w);
  let bucket = dictByLength.get(w.length);
  if (!bucket) { bucket = []; dictByLength.set(w.length, bucket); }
  bucket.push(w);
}
const corrections = new Map();
for (const [k,v] of Object.entries(JSON.parse(corrJSON))) corrections.set(k, v);
console.log(`loaded ${dict.size} words, ${corrections.size} corrections`);

function normalize(w) { return String(w || '').replace(new RegExp(SOZGHUCH,'g'), '').trim().toLowerCase(); }
function isCorrect(word) {
  const w = normalize(word);
  if (!w || w.length < 2) return true;
  if (/^[\d\s]+$/.test(w)) return true;
  if (/^[a-zA-Z'’-]+$/.test(w)) return true;
  if (!new RegExp('^[' + UEY_LETTERS + "'’-]+$", 'u').test(w)) return true;
  if (dict.has(w)) return true;
  if (w.indexOf('-') !== -1) {
    const parts = w.split('-').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every(p => dict.has(p))) return true;
  }
  return false;
}
function matchWildcard(word, pattern) {
  if (word.length !== pattern.length) return false;
  for (let i = 0; i < pattern.length; i++) if (pattern[i] !== '?' && pattern[i] !== word[i]) return false;
  return true;
}
function collect(p, sink) {
  const b = dictByLength.get(p.length); if (!b) return;
  for (const w of b) if (matchWildcard(w, p)) sink.add(w);
}
function dl(a, b) {
  const al=a.length, bl=b.length;
  if(!al)return bl; if(!bl)return al;
  const W=bl+1, m=new Array((al+1)*W);
  for(let i=0;i<=al;i++)m[i*W]=i; for(let j=0;j<=bl;j++)m[j]=j;
  for(let i=1;i<=al;i++) for(let j=1;j<=bl;j++){
    const c=(a.charCodeAt(i-1)===b.charCodeAt(j-1))?0:1;
    let v=Math.min(m[(i-1)*W+j]+1, m[i*W+(j-1)]+1, m[(i-1)*W+(j-1)]+c);
    if(i>1&&j>1&&a.charCodeAt(i-1)===b.charCodeAt(j-2)&&a.charCodeAt(i-2)===b.charCodeAt(j-1))
      v=Math.min(v, m[(i-2)*W+(j-2)]+c);
    m[i*W+j]=v;
  }
  return m[al*W+bl];
}
function generatePatterns(soz) {
  const len = soz.length, chars = soz.split(''), out = [];
  { const buf = chars.slice(); let any=false;
    for (let i=0;i<len;i++) if (VOWELS.has(buf[i])) { buf[i]='?'; any=true; }
    if (any) out.push(buf.join('')); }
  for (let i=len-1;i>=0;i--) {
    out.push(soz.slice(0,i)+'?'+soz.slice(i));
    const r=chars.slice(); r[i]='?'; out.push(r.join(''));
    out.push(r.slice(0,i).join('')+'?'+r.slice(i).join(''));
    if (i-1>=0){const r2=chars.slice();r2[i]='?';r2[i-1]='?';out.push(r2.join(''));}
    if (i-2>=0){const r2=chars.slice();r2[i]='?';r2[i-2]='?';out.push(r2.join(''));}
    if (i-3>=0){const r2=chars.slice();r2[i]='?';r2[i-3]='?';out.push(r2.join(''));}
  }
  out.push(soz+'?');
  return out;
}
function lookup(soz) {
  const original = normalize(soz);
  const cands = new Set();
  for (const p of generatePatterns(original)) collect(p, cands);
  const ranked = [];
  for (const c of cands) if (c !== original) ranked.push({ w: c, d: dl(original, c) });
  ranked.sort((a,b) => a.d - b.d);
  const out = ranked.slice(0, 10).map(r => r.w);
  if (!out.length) {
    let n = original.length - 1;
    while (n >= 3) {
      const stem = original.slice(0, n);
      if (dict.has(stem)) { out.push(stem); break; }
      n--;
    }
  }
  return out;
}
function getSuggestions(w) {
  const lower = normalize(w), seen = new Set(), out = [];
  if (corrections.has(lower)) { const f = corrections.get(lower); seen.add(f); out.push(f); }
  for (const c of lookup(lower)) { if (out.length>=10) break; if (!seen.has(c)) { seen.add(c); out.push(c); } }
  return out;
}

// ----- Tests -----
let pass = 0, fail = 0;
function expect(label, cond) {
  if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗ FAIL', label); }
}

console.log('\nTest 1 — common words NOT flagged:');
for (const w of ['بىلەن','ھەممە','كىتاب','بولغان','قىلىپ','ياشاش','ئادەم','شەھەر']) {
  expect(`${w} correct`, isCorrect(w));
}

console.log('\nTest 2 — inflected forms NOT flagged:');
for (const w of ['كىتابلار','كىتابلارنىڭ','بولۇپتۇ','يازغان','ئوقۇغۇچىلار']) {
  expect(`${w} correct`, isCorrect(w));
}

console.log('\nTest 3 — known misspellings ARE flagged & give a suggestion:');
const testMisspellings = [['مۈمكىن','مۇمكىن'],['سوال','سوئال'],['لىكىن','لېكىن']];
for (const [bad, good] of testMisspellings) {
  expect(`${bad} flagged`, !isCorrect(bad));
  const sug = getSuggestions(bad);
  console.log(`     ${bad} → suggestions:`, sug);
  expect(`${bad} → suggestion includes ${good}`, sug.includes(good));
}

console.log('\nTest 8 — performance: scan 2000 chars in <500ms:');
let bigText = '';
const sample = 'ھەممە كىتابلارنى ئوقۇغۇچىلار بىلەن مۇئەللىمنىڭ ياردىمى ئارقىلىق ئوقۇپ بولدى. ' +
               'بۇ ئىش ھەممىمىزنى خۇشال قىلدى. شەھەرنىڭ ھەر بىر ئۈجىرىدە بۇنىڭ ئەكسى ئاڭلاندى. ';
while (bigText.length < 2000) bigText += sample;
const wordRe = new RegExp('[' + UEY_LETTERS + "'’]+(?:[-]?[" + UEY_LETTERS + "'’]+)*", 'gu');
const t0 = Date.now();
let scanned = 0, flagged = 0;
let m; wordRe.lastIndex = 0;
while ((m = wordRe.exec(bigText)) !== null) { scanned++; if (!isCorrect(m[0])) flagged++; }
const elapsed = Date.now() - t0;
console.log(`     scanned ${scanned} words in ${elapsed}ms, flagged ${flagged}`);
expect('scan under 500ms', elapsed < 500);

console.log('\nSummary:', pass, 'pass /', fail, 'fail');
process.exit(fail ? 1 : 0);
