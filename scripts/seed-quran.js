/**
 * Quran seeder.
 * On first app launch (or if quran_suras is empty), this:
 *  - Reads the Uyghur translation from _resources/uyghur_saleh_v1.0.2-xml.1.xml
 *  - Downloads the Arabic Uthmani Hafs text from Tanzil (or reuses cached copy in assets/seed/)
 *  - Calls database.quranSeedBulk() with all 114 suras and 6236 ayas
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

const SURA_META = [
  { n:1, ar:'الفاتحة', ug:'فاتىھە', tr:'Al-Fatiha', rev:'meccan', count:7 },
  { n:2, ar:'البقرة', ug:'بەقەرە', tr:'Al-Baqara', rev:'medinan', count:286 },
  { n:3, ar:'آل عمران', ug:'ئال ئىمران', tr:'Al-Imran', rev:'medinan', count:200 },
  { n:4, ar:'النساء', ug:'نىسا', tr:'An-Nisa', rev:'medinan', count:176 },
  { n:5, ar:'المائدة', ug:'مائىدە', tr:'Al-Maida', rev:'medinan', count:120 },
  { n:6, ar:'الأنعام', ug:'ئەنئام', tr:'Al-Anam', rev:'meccan', count:165 },
  { n:7, ar:'الأعراف', ug:'ئەئراف', tr:'Al-Araf', rev:'meccan', count:206 },
  { n:8, ar:'الأنفال', ug:'ئەنفال', tr:'Al-Anfal', rev:'medinan', count:75 },
  { n:9, ar:'التوبة', ug:'تەۋبە', tr:'At-Tawba', rev:'medinan', count:129 },
  { n:10, ar:'يونس', ug:'يۇنۇس', tr:'Yunus', rev:'meccan', count:109 },
  { n:11, ar:'هود', ug:'ھۇد', tr:'Hud', rev:'meccan', count:123 },
  { n:12, ar:'يوسف', ug:'يۇسۇف', tr:'Yusuf', rev:'meccan', count:111 },
  { n:13, ar:'الرعد', ug:'رەئد', tr:'Ar-Rad', rev:'medinan', count:43 },
  { n:14, ar:'إبراهيم', ug:'ئىبراھىم', tr:'Ibrahim', rev:'meccan', count:52 },
  { n:15, ar:'الحجر', ug:'ھىجر', tr:'Al-Hijr', rev:'meccan', count:99 },
  { n:16, ar:'النحل', ug:'نەھل', tr:'An-Nahl', rev:'meccan', count:128 },
  { n:17, ar:'الإسراء', ug:'ئىسرا', tr:'Al-Isra', rev:'meccan', count:111 },
  { n:18, ar:'الكهف', ug:'كەھف', tr:'Al-Kahf', rev:'meccan', count:110 },
  { n:19, ar:'مريم', ug:'مەريەم', tr:'Maryam', rev:'meccan', count:98 },
  { n:20, ar:'طه', ug:'تاھا', tr:'Taha', rev:'meccan', count:135 },
  { n:21, ar:'الأنبياء', ug:'ئەنبىيا', tr:'Al-Anbiya', rev:'meccan', count:112 },
  { n:22, ar:'الحج', ug:'ھەج', tr:'Al-Hajj', rev:'medinan', count:78 },
  { n:23, ar:'المؤمنون', ug:'مۆئمىنۇن', tr:'Al-Muminun', rev:'meccan', count:118 },
  { n:24, ar:'النور', ug:'نۇر', tr:'An-Nur', rev:'medinan', count:64 },
  { n:25, ar:'الفرقان', ug:'فۇرقان', tr:'Al-Furqan', rev:'meccan', count:77 },
  { n:26, ar:'الشعراء', ug:'شۇئەرا', tr:'Ash-Shuara', rev:'meccan', count:227 },
  { n:27, ar:'النمل', ug:'نەمل', tr:'An-Naml', rev:'meccan', count:93 },
  { n:28, ar:'القصص', ug:'قەسەس', tr:'Al-Qasas', rev:'meccan', count:88 },
  { n:29, ar:'العنكبوت', ug:'ئەنكەبۇت', tr:'Al-Ankabut', rev:'meccan', count:69 },
  { n:30, ar:'الروم', ug:'رۇم', tr:'Ar-Rum', rev:'meccan', count:60 },
  { n:31, ar:'لقمان', ug:'لوقمان', tr:'Luqman', rev:'meccan', count:34 },
  { n:32, ar:'السجدة', ug:'سەجدە', tr:'As-Sajda', rev:'meccan', count:30 },
  { n:33, ar:'الأحزاب', ug:'ئەھزاب', tr:'Al-Ahzab', rev:'medinan', count:73 },
  { n:34, ar:'سبأ', ug:'سەبەئ', tr:'Saba', rev:'meccan', count:54 },
  { n:35, ar:'فاطر', ug:'فاتىر', tr:'Fatir', rev:'meccan', count:45 },
  { n:36, ar:'يس', ug:'ياسىن', tr:'Yasin', rev:'meccan', count:83 },
  { n:37, ar:'الصافات', ug:'سافات', tr:'As-Saffat', rev:'meccan', count:182 },
  { n:38, ar:'ص', ug:'ساد', tr:'Sad', rev:'meccan', count:88 },
  { n:39, ar:'الزمر', ug:'زۇمەر', tr:'Az-Zumar', rev:'meccan', count:75 },
  { n:40, ar:'غافر', ug:'غافىر', tr:'Ghafir', rev:'meccan', count:85 },
  { n:41, ar:'فصلت', ug:'فۇسسىلەت', tr:'Fussilat', rev:'meccan', count:54 },
  { n:42, ar:'الشورى', ug:'شۇرا', tr:'Ash-Shura', rev:'meccan', count:53 },
  { n:43, ar:'الزخرف', ug:'زۇخرۇف', tr:'Az-Zukhruf', rev:'meccan', count:89 },
  { n:44, ar:'الدخان', ug:'دۇخان', tr:'Ad-Dukhan', rev:'meccan', count:59 },
  { n:45, ar:'الجاثية', ug:'جاسىيە', tr:'Al-Jathiya', rev:'meccan', count:37 },
  { n:46, ar:'الأحقاف', ug:'ئەھقاف', tr:'Al-Ahqaf', rev:'meccan', count:35 },
  { n:47, ar:'محمد', ug:'مۇھەممەد', tr:'Muhammad', rev:'medinan', count:38 },
  { n:48, ar:'الفتح', ug:'فەتىھ', tr:'Al-Fath', rev:'medinan', count:29 },
  { n:49, ar:'الحجرات', ug:'ھۇجۇرات', tr:'Al-Hujurat', rev:'medinan', count:18 },
  { n:50, ar:'ق', ug:'قاف', tr:'Qaf', rev:'meccan', count:45 },
  { n:51, ar:'الذاريات', ug:'زارىيات', tr:'Adh-Dhariyat', rev:'meccan', count:60 },
  { n:52, ar:'الطور', ug:'تۇر', tr:'At-Tur', rev:'meccan', count:49 },
  { n:53, ar:'النجم', ug:'نەجم', tr:'An-Najm', rev:'meccan', count:62 },
  { n:54, ar:'القمر', ug:'قەمەر', tr:'Al-Qamar', rev:'meccan', count:55 },
  { n:55, ar:'الرحمن', ug:'رەھمان', tr:'Ar-Rahman', rev:'medinan', count:78 },
  { n:56, ar:'الواقعة', ug:'ۋاقىئە', tr:'Al-Waqia', rev:'meccan', count:96 },
  { n:57, ar:'الحديد', ug:'ھەدىد', tr:'Al-Hadid', rev:'medinan', count:29 },
  { n:58, ar:'المجادلة', ug:'مۇجادەلە', tr:'Al-Mujadila', rev:'medinan', count:22 },
  { n:59, ar:'الحشر', ug:'ھەشر', tr:'Al-Hashr', rev:'medinan', count:24 },
  { n:60, ar:'الممتحنة', ug:'مۇمتەھىنە', tr:'Al-Mumtahina', rev:'medinan', count:13 },
  { n:61, ar:'الصف', ug:'سەف', tr:'As-Saff', rev:'medinan', count:14 },
  { n:62, ar:'الجمعة', ug:'جۈمە', tr:'Al-Jumua', rev:'medinan', count:11 },
  { n:63, ar:'المنافقون', ug:'مۇنافىقۇن', tr:'Al-Munafiqun', rev:'medinan', count:11 },
  { n:64, ar:'التغابن', ug:'تەغابۇن', tr:'At-Taghabun', rev:'medinan', count:18 },
  { n:65, ar:'الطلاق', ug:'تالاق', tr:'At-Talaq', rev:'medinan', count:12 },
  { n:66, ar:'التحريم', ug:'تەھرىم', tr:'At-Tahrim', rev:'medinan', count:12 },
  { n:67, ar:'الملك', ug:'مۈلك', tr:'Al-Mulk', rev:'meccan', count:30 },
  { n:68, ar:'القلم', ug:'قەلەم', tr:'Al-Qalam', rev:'meccan', count:52 },
  { n:69, ar:'الحاقة', ug:'ھاققە', tr:'Al-Haqqa', rev:'meccan', count:52 },
  { n:70, ar:'المعارج', ug:'مەئارىج', tr:'Al-Maarij', rev:'meccan', count:44 },
  { n:71, ar:'نوح', ug:'نۇھ', tr:'Nuh', rev:'meccan', count:28 },
  { n:72, ar:'الجن', ug:'جىن', tr:'Al-Jinn', rev:'meccan', count:28 },
  { n:73, ar:'المزمل', ug:'مۇززەممىل', tr:'Al-Muzzammil', rev:'meccan', count:20 },
  { n:74, ar:'المدثر', ug:'مۇددەسسىر', tr:'Al-Muddaththir', rev:'meccan', count:56 },
  { n:75, ar:'القيامة', ug:'قىيامە', tr:'Al-Qiyama', rev:'meccan', count:40 },
  { n:76, ar:'الإنسان', ug:'ئىنسان', tr:'Al-Insan', rev:'medinan', count:31 },
  { n:77, ar:'المرسلات', ug:'مۇرسەلات', tr:'Al-Mursalat', rev:'meccan', count:50 },
  { n:78, ar:'النبأ', ug:'نەبەئ', tr:'An-Naba', rev:'meccan', count:40 },
  { n:79, ar:'النازعات', ug:'نازىئات', tr:'An-Naziat', rev:'meccan', count:46 },
  { n:80, ar:'عبس', ug:'ئەبەسە', tr:'Abasa', rev:'meccan', count:42 },
  { n:81, ar:'التكوير', ug:'تەكۋىر', tr:'At-Takwir', rev:'meccan', count:29 },
  { n:82, ar:'الانفطار', ug:'ئىنفىتار', tr:'Al-Infitar', rev:'meccan', count:19 },
  { n:83, ar:'المطففين', ug:'مۇتەففىفىن', tr:'Al-Mutaffifin', rev:'meccan', count:36 },
  { n:84, ar:'الانشقاق', ug:'ئىنشىقاق', tr:'Al-Inshiqaq', rev:'meccan', count:25 },
  { n:85, ar:'البروج', ug:'بۇرۇج', tr:'Al-Buruj', rev:'meccan', count:22 },
  { n:86, ar:'الطارق', ug:'تارىق', tr:'At-Tariq', rev:'meccan', count:17 },
  { n:87, ar:'الأعلى', ug:'ئەئلا', tr:'Al-Ala', rev:'meccan', count:19 },
  { n:88, ar:'الغاشية', ug:'غاشىيە', tr:'Al-Ghashiya', rev:'meccan', count:26 },
  { n:89, ar:'الفجر', ug:'فەجر', tr:'Al-Fajr', rev:'meccan', count:30 },
  { n:90, ar:'البلد', ug:'بەلەد', tr:'Al-Balad', rev:'meccan', count:20 },
  { n:91, ar:'الشمس', ug:'شەمس', tr:'Ash-Shams', rev:'meccan', count:15 },
  { n:92, ar:'الليل', ug:'لەيل', tr:'Al-Layl', rev:'meccan', count:21 },
  { n:93, ar:'الضحى', ug:'زۇھا', tr:'Ad-Duha', rev:'meccan', count:11 },
  { n:94, ar:'الشرح', ug:'ئىنشىراھ', tr:'Ash-Sharh', rev:'meccan', count:8 },
  { n:95, ar:'التين', ug:'تىن', tr:'At-Tin', rev:'meccan', count:8 },
  { n:96, ar:'العلق', ug:'ئەلەق', tr:'Al-Alaq', rev:'meccan', count:19 },
  { n:97, ar:'القدر', ug:'قەدر', tr:'Al-Qadr', rev:'meccan', count:5 },
  { n:98, ar:'البينة', ug:'بەييىنە', tr:'Al-Bayyina', rev:'medinan', count:8 },
  { n:99, ar:'الزلزلة', ug:'زەلزەلە', tr:'Az-Zalzala', rev:'medinan', count:8 },
  { n:100, ar:'العاديات', ug:'ئادىيات', tr:'Al-Adiyat', rev:'meccan', count:11 },
  { n:101, ar:'القارعة', ug:'قارىئە', tr:'Al-Qaria', rev:'meccan', count:11 },
  { n:102, ar:'التكاثر', ug:'تەكاسۇر', tr:'At-Takathur', rev:'meccan', count:8 },
  { n:103, ar:'العصر', ug:'ئەسر', tr:'Al-Asr', rev:'meccan', count:3 },
  { n:104, ar:'الهمزة', ug:'ھۇمەزە', tr:'Al-Humaza', rev:'meccan', count:9 },
  { n:105, ar:'الفيل', ug:'فىل', tr:'Al-Fil', rev:'meccan', count:5 },
  { n:106, ar:'قريش', ug:'قۇرەيش', tr:'Quraysh', rev:'meccan', count:4 },
  { n:107, ar:'الماعون', ug:'ماھۇن', tr:'Al-Maun', rev:'meccan', count:7 },
  { n:108, ar:'الكوثر', ug:'كەۋسەر', tr:'Al-Kawthar', rev:'meccan', count:3 },
  { n:109, ar:'الكافرون', ug:'كافىرۇن', tr:'Al-Kafirun', rev:'meccan', count:6 },
  { n:110, ar:'النصر', ug:'نەسر', tr:'An-Nasr', rev:'medinan', count:3 },
  { n:111, ar:'المسد', ug:'مەسەد', tr:'Al-Masad', rev:'meccan', count:5 },
  { n:112, ar:'الإخلاص', ug:'ئىخلاس', tr:'Al-Ikhlas', rev:'meccan', count:4 },
  { n:113, ar:'الفلق', ug:'فەلەق', tr:'Al-Falaq', rev:'meccan', count:5 },
  { n:114, ar:'الناس', ug:'ناس', tr:'An-Nas', rev:'meccan', count:6 }
];

function stripTashkil(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '')
    // Normalize alif variants to plain alif so LIKE search matches user input.
    .replace(/[\u0671\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects whether `arabicAyahText` begins with the basmala
 * (\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u064E\u0651\u0647\u0650 \u0671\u0644\u0631\u064E\u0651\u062D\u0652\u0645\u064E\u0670\u0646\u0650 \u0671\u0644\u0631\u064E\u0651\u062D\u0650\u064A\u0645\u0650) and, if so, returns the rest
 * of the ayah with the basmala (and any trailing whitespace/separators) removed.
 * If no basmala prefix, returns the input unchanged.
 *
 * Handles all encoding variants by comparing on the tashkil/alif-normalized form.
 */
// Character-level diacritic detector (does NOT trim or collapse whitespace \u2014
// safe to use during a position-by-position walk).
function _isStrippableDiacritic(ch) {
  const code = ch.charCodeAt(0);
  return (code >= 0x064B && code <= 0x065F)
      || code === 0x0670
      || (code >= 0x06D6 && code <= 0x06ED)
      || (code >= 0x08D3 && code <= 0x08FF)
      || code === 0x0640;
}

function _normalizeCharForBasmala(ch) {
  if (_isStrippableDiacritic(ch)) return '';
  if (ch === '\u0671' || ch === '\u0622' || ch === '\u0623' || ch === '\u0625') {
    return '\u0627';
  }
  return ch;
}

function stripBasmalaPrefix(text) {
  if (!text) return text;

  // Build normalized form and a map back to the original index of each
  // contributing char. Avoids the trim/collapse hazards of stripTashkil.
  let normalized = '';
  const origIndexAt = [];
  for (let i = 0; i < text.length; i++) {
    const n = _normalizeCharForBasmala(text[i]);
    if (n) {
      normalized += n;
      origIndexAt.push(i);
    }
  }

  const BASMALA_NORMALIZED = '\u0628\u0633\u0645 \u0627\u0644\u0644\u0647 \u0627\u0644\u0631\u062D\u0645\u0646 \u0627\u0644\u0631\u062D\u064A\u0645';
  const idx = normalized.indexOf(BASMALA_NORMALIZED);
  if (idx === -1 || idx > 5) return text;

  const cutNormEnd = idx + BASMALA_NORMALIZED.length;
  const cutOrig = cutNormEnd >= origIndexAt.length
    ? text.length
    : origIndexAt[cutNormEnd];

  // Skip leading whitespace, RLM/LRM, NBSP, and ayah-pause marks that sat
  // between the basmala and the actual ayah text.
  return text.slice(cutOrig).replace(/^[\s\u200F\u200E\u00A0\u2009\u06DA\u06D6\u06D7\u06D8\u06D9\u06DB]+/, '');
}

function parseTanzil(content) {
  const map = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\d+)\|(\d+)\|(.+)$/);
    if (!m) continue;
    const sura = parseInt(m[1], 10);
    const aya = parseInt(m[2], 10);
    const text = m[3].trim();
    if (!map[sura]) map[sura] = {};
    map[sura][aya] = text;
  }
  return map;
}

function parseUyghurXml(xmlContent) {
  const root = parse(xmlContent);
  const suras = root.querySelectorAll('sura');
  const map = {};
  for (const suraEl of suras) {
    const suraNum = parseInt(suraEl.getAttribute('number'), 10);
    if (!suraNum) continue;
    map[suraNum] = {};
    for (const ayaEl of suraEl.querySelectorAll('aya')) {
      const ayaNum = parseInt(ayaEl.getAttribute('number'), 10);
      const trEl = ayaEl.querySelector('translation');
      if (!ayaNum || !trEl) continue;
      let text = trEl.text.trim();
      // Strip CDATA wrappers that node-html-parser doesn't unwrap automatically.
      // This is an artefact of the parser, not part of the published text.
      text = text.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
      // Nothing else is removed: QuranEnc.com's terms forbid modifying the
      // translation, so the trailing verse markers it publishes are kept.
      map[suraNum][ayaNum] = text;
    }
  }
  return map;
}

function findUyghurXml(projectRoot) {
  const candidates = [
    // Bundled inside asar (assets/seed/ is included by electron-builder "files")
    path.join(projectRoot, 'assets', 'seed', 'uyghur_saleh_v1.0.2-xml.1.xml'),
    // Dev / legacy locations
    path.join(projectRoot, '_resources', 'uyghur_saleh_v1.0.2-xml.1.xml'),
    path.join(projectRoot, '_resources', 'uyghur_saleh_v1.0.2-xml.1 (1).xml'),
    path.join(projectRoot, 'assets', 'seed', 'uyghur_saleh.xml'),
    // electron-builder extraResources (if assets/seed is unpacked)
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'assets', 'seed', 'uyghur_saleh_v1.0.2-xml.1.xml') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'seed', 'uyghur_saleh_v1.0.2-xml.1.xml') : null
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // Fallback: scan _resources directory for any matching XML
  const resDir = path.join(projectRoot, '_resources');
  if (fs.existsSync(resDir)) {
    try {
      for (const f of fs.readdirSync(resDir)) {
        if (/uyghur.*\.xml$/i.test(f)) return path.join(resDir, f);
      }
    } catch(e) { /* ignore read errors on asar paths */ }
  }
  // Fallback: scan assets/seed directory
  const seedDir = path.join(projectRoot, 'assets', 'seed');
  if (fs.existsSync(seedDir)) {
    try {
      for (const f of fs.readdirSync(seedDir)) {
        if (/uyghur.*\.xml$/i.test(f)) return path.join(seedDir, f);
      }
    } catch(e) { /* ignore read errors on asar paths */ }
  }
  return null;
}

/**
 * Main entry. Called from main.js at startup.
 * @param {string} projectRoot
 * @param {object} database
 * @param {{force?: boolean}} [options] force re-seeds an already-populated DB.
 *   quranSeedBulk clears both Quran tables first, so this is safe to repeat.
 */
async function seedQuran(projectRoot, database, options = {}) {
  if (!options.force && database.quranSuraExists && database.quranSuraExists()) {
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
      let ar = (arMap[sn] && arMap[sn][an]) ? arMap[sn][an] : '';
      const ug = (ugMap[sn] && ugMap[sn][an]) ? ugMap[sn][an] : '';
      if (!ar) throw new Error(`Missing Arabic text for ${sn}:${an}`);
      // Strip duplicated basmala from ayah 1 of every Sura except Al-Fatiha.
      if (an === 1 && sn !== 1) {
        ar = stripBasmalaPrefix(ar);
      }
      ayas.push({
        sura: sn, aya: an,
        text_ar: ar,
        text_ar_simple: stripTashkil(ar),
        // Stored verbatim. QuranEnc.com's terms of use forbid modification,
        // addition, or deletion of the translation, so the inline markers the
        // Saleh translation carries are kept exactly as published.
        text_ug: String(ug || '').trim()
      });
    }
  }

  const result = database.quranSeedBulk(suras, ayas);
  console.log(`[seed-quran] Seeded: ${result.suras} suras, ${result.ayas} ayas.`);
  return result;
}

module.exports = { seedQuran, stripTashkil, stripBasmalaPrefix, SURA_META };
