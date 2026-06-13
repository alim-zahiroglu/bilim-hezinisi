// ai.js — main-process Gemini client + content-type-aware prompts.
// Ported from the mobile app's js/ai.js (BilimHezinisi-Mobile).
//
// WHY THE MAIN PROCESS
// --------------------
// The renderer's CSP is `connect-src 'self'` (src/index.html) and must stay
// that way — the offline app's renderer never talks to the network. All
// Gemini traffic therefore happens here, in the Electron main process, using
// Node 18's global fetch (undici, supports streaming bodies). The renderer
// reaches this module only through the IPC handlers wired in main.js.
//
// WHY GEMINI SPECIFICALLY
// -----------------------
// The app's userbase is Uyghur-speaking and reading classical religious /
// literary texts that often blend Arabic and Uyghur. Of the free-tier API
// providers, Google Gemini gives the best Uyghur output quality by a wide
// margin and has a generous free quota from https://aistudio.google.com —
// keys begin with "AIza...".
//
// Default model: gemini-3.5-flash (May 2026 flagship). Older Gemini models
// are deliberately excluded because their Uyghur output quality is too low
// to be useful for classical religious-text scholarship.
//
// STORAGE: all settings go through database.getSetting / setSetting (the
// existing key/value settings table — no schema change). The API key is the
// user's own, stored locally, lightly obfuscated at rest, and never logged.

const database = require('./database');

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

// gemini-3.5-flash (released 2026-05-19) is the current flagship Flash
// model — frontier reasoning quality with the speed we need for an
// inline Q&A flow. The user can override the choice in Settings.
//
// Older Gemini models (1.5, 2.0, 2.5) are intentionally EXCLUDED
// because their Uyghur quality is too low to be useful for this app's
// classical-religious-text userbase.
//
// STRICT MODEL SELECTION: the model the user picked in Settings is the
// ONLY model ask()/askStream()/test() ever call. Nothing substitutes a
// different model and nothing rewrites the stored preference behind the
// user's back — if the chosen model fails (retired ID, paid tier on a
// free key, quota), a clear Uyghur error is surfaced and the USER decides
// whether to switch models or enable billing. MODEL_FALLBACKS and
// selfHealModel below are retained for reference/diagnostics only; they
// must NEVER be used to change the model the user picked.
const DEFAULT_MODEL  = 'gemini-3.5-flash';
const MODEL_FALLBACKS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];
// Models offered in the Settings selector. The two flash tiers run on the
// free quota; gemini-3.1-pro-preview is the expensive PAID tier (needs
// billing — on a free key it gets a clear error, never a silent switch).
// NOTE: model IDs change over time — if 'gemini-3.1-pro-preview' stops
// matching a live ID, adjust it HERE and in src/ai-client.js
// (SELECTABLE_MODELS + MODEL_INFO).
const SELECTABLE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite'
];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const PREF_API_KEY = 'ai_gemini_api_key';
const PREF_MODEL   = 'ai_gemini_model';
const PREF_ENABLED = 'ai_enabled';

// Retry/backoff for transient 429/5xx errors.
const MAX_TRIES = 3;
const BACKOFF_MS = [400, 1200, 3000];

// Safety ceiling for a single whole-book request. gemini-3.5-flash handles
// very large inputs, so normal books/articles are sent in FULL — we never
// pre-emptively warn about size. This 1M-char cap is only a last-resort
// guard against a pathological payload; if the API still rejects on size,
// the UI degrades reactively (tooLargeFallback).
const MAX_CONTEXT_CHARS = 1000000;

// Network watchdog: fetch() has no built-in timeout. 60s is generous
// enough for slow networks but short enough that a wedged request
// can't pin things forever.
const REQUEST_TIMEOUT_MS = 60000;

// ----------------------------------------------------------------
// Key / prefs storage (database.getSetting / setSetting — synchronous
// better-sqlite3, same settings table the rest of the app uses)
// ----------------------------------------------------------------

let cachedKey = null;
let cachedKeyLoaded = false;

// Light obfuscation for the stored key. This is NOT real security — the
// SQLite db lives in the user's own profile and nothing client-side can
// protect a secret from the machine's owner. The goal is only to keep the
// key from sitting in plain sight (e.g. in a casual db dump). Format:
// "obf1:" + base64 of the key XOR'd with a fixed app secret. Legacy
// plaintext keys (no prefix) are read transparently and migrated on load.
const KEY_OBFS_PREFIX = 'obf1:';
const KEY_OBFS_SECRET = 'BilimHezinisi/v3/ai';

function xorWithSecret(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += String.fromCharCode(s.charCodeAt(i) ^ KEY_OBFS_SECRET.charCodeAt(i % KEY_OBFS_SECRET.length));
  }
  return out;
}
function obfuscateKey(plain) {
  try { return KEY_OBFS_PREFIX + Buffer.from(xorWithSecret(String(plain)), 'latin1').toString('base64'); }
  catch (_) { return String(plain); }
}
function deobfuscateKey(stored) {
  const s = String(stored || '');
  if (s.indexOf(KEY_OBFS_PREFIX) !== 0) return s; // legacy plaintext
  try { return xorWithSecret(Buffer.from(s.slice(KEY_OBFS_PREFIX.length), 'base64').toString('latin1')); }
  catch (_) { return ''; }
}

function loadKey() {
  if (cachedKeyLoaded) return cachedKey;
  try {
    const raw = database.getSetting(PREF_API_KEY, '');
    const plain = deobfuscateKey(raw).trim();
    cachedKey = plain;
    // Lazy migration: re-store any legacy plaintext key in obfuscated form.
    if (plain && String(raw).indexOf(KEY_OBFS_PREFIX) !== 0) {
      try { database.setSetting(PREF_API_KEY, obfuscateKey(plain)); } catch (_) {}
    }
  } catch (e) {
    console.warn('[ai] loadKey failed:', e && e.message);
    cachedKey = '';
  }
  cachedKeyLoaded = true;
  return cachedKey;
}

function getApiKey() { return loadKey(); }

function hasApiKey() {
  const k = loadKey();
  return !!(k && k.length > 8);
}

// Masked form for any UI/getter that crosses into the renderer: the real key
// never leaves the main process. "AIza…XXXX" (first 4 + last 4).
function getApiKeyMasked() {
  const k = loadKey();
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return k.slice(0, 4) + '…' + k.slice(-4);
}

function setApiKey(key) {
  const trimmed = String(key || '').trim();
  try {
    database.setSetting(PREF_API_KEY, trimmed ? obfuscateKey(trimmed) : '');
  } catch (e) {
    console.warn('[ai] setApiKey persist failed:', e && e.message);
  }
  cachedKey = trimmed;
  cachedKeyLoaded = true;
}

function getModel() {
  try {
    const v = database.getSetting(PREF_MODEL, DEFAULT_MODEL);
    return String(v || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  } catch (_) {
    return DEFAULT_MODEL;
  }
}

function setModel(name) {
  const m = String(name || '').trim() || DEFAULT_MODEL;
  try { database.setSetting(PREF_MODEL, m); }
  catch (e) { console.warn('[ai] setModel persist failed:', e && e.message); }
}

function isEnabled() {
  try {
    const v = database.getSetting(PREF_ENABLED, '1');
    return String(v) !== '0';
  } catch (_) {
    return true;
  }
}

function setEnabled(on) {
  try {
    database.setSetting(PREF_ENABLED, on ? '1' : '0');
  } catch (e) {
    console.warn('[ai] setEnabled persist failed:', e && e.message);
  }
}

// ----------------------------------------------------------------
// Per-day usage counter
// ----------------------------------------------------------------

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return 'ai_usage_' + y + '-' + m + '-' + day;
}

function getTodayUsage() {
  try {
    const v = database.getSetting(todayKey(), '0');
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_) { return 0; }
}

function bumpUsage() {
  const cur = getTodayUsage();
  try { database.setSetting(todayKey(), String(cur + 1)); } catch (_) {}
}

// ----------------------------------------------------------------
// Prompt templates (per content type) — ported VERBATIM from mobile.
//
// Design principles common to every prompt:
//   1. Uyghur output, simple/clear vocabulary.
//   2. Multi-scholar / multi-view answers — never a single verdict.
//   3. No fabricated citations.
//   4. Mainstream Sunni scholarship for Islamic questions.
//   5. No personal verdicts on contested fiqh/political questions.
// ----------------------------------------------------------------

const SYSTEM_BASE =
  'سىز ئۇيغۇر تىلىدا جاۋاب بېرىدىغان ئىختىساسلىق ياردەمچىسىز. ھەردائىم:\n' +
  '- ساپ، چۈشىنىشلىك ئۇيغۇر تىلىدا (ئۇيغۇر يېزىقىدا) جاۋاب بېرىڭ.\n' +
  '- ساغلام پىكىر، ئوبيېكتىپلىق، ئوتتۇرا يولنى ساقلاڭ.\n' +
  '- مەنبە ياكى كىشى نامىنى ئاتاپ تەكلىپ بەرسىڭىز، چوقۇم راست مەلۇم\n' +
  '  ئالىم ياكى مەنبە بولسۇن. تەخمىنىي / ئويدۇرما مەنبە ئاتىماڭ.\n' +
  '- بىلمىسىڭىز «بۇ ھەقتە ئېنىق مەلۇمات تېپىلمىدى» دەڭ.\n' +
  '- جاۋابنى Markdown شەكلىدە تۇزۇپ، تۈرلەرنى ## كىچىك سەرلەۋھە بىلەن\n' +
  '  ئاجراتسىڭىز بولىدۇ.';

// System instruction for the free-form notebook chatbot (Phase 4 — NOT tied to
// the library). Sent as Gemini `systemInstruction`, so it is NOT overridden by
// SYSTEM_BASE.
const CHAT_SYSTEM =
  'سىز بىلىمى كەڭ، سەمىمىي ياردەمچىسىز. قائىدىلەر:\n' +
  '- سوئال قايسى تىلدا بولسا شۇ تىلدا، ئادەتتە ئۇيغۇر تىلىدا (ئۇيغۇر يېزىقىدا) جاۋاب بېرىڭ.\n' +
  '- ھەدىس، ئايەت ياكى ئالىم سۆزىنى نەقىل قىلسىڭىز، پەقەت راست مەنبەدىنلا نەقىل قىلىڭ؛ مەنبەسىنى (توپلام، كىتاب) كۆرسىتىڭ. ئېنىق بىلمىسىڭىز «بۇ ھەقتە ئېنىق مەنبە تاپالمىدىم» دەڭ — ئويدۇرماڭ.\n' +
  '- جاۋابنى Markdown بىلەن رەتلىك تۈزۈڭ.\n' +
  '- ھېكايە، شېئىر قاتارلىق ئىجادىي تەلەپلەرنى خۇشاللىق بىلەن ئورۇنداڭ.';

const PROMPTS = {
  hadith: {
    role: 'سىز ئىسلام ھەدىس ئىلمى بويىچە چوڭقۇر ساۋادلىق ئالىمسىز.',
    task:
      'تۆۋەندىكى ھەدىسكە ئائىت كونتېكستنى تەھلىل قىلىپ، تارىختا داڭلىق\n' +
      'بولغان ھەدىسشۇناس ئالىملار (ئىمام بۇخارى، مۇسلىم، تىرمىزى، ئەبۇ\n' +
      'داۋۇد، نەسەئى، ئىبنى ماجاھ، ئەھمەد ئىبنى ھەنبەل، ئىبنى ھەجەر\n' +
      'ئەلئەسقالانى، ئىمام نەۋەۋى، ئىبنى رەجەب، شەۋكانى ۋە باشقىلار) نىڭ\n' +
      'شەرھى ۋە چۈشەنچىلىرىنى ئوتتۇرىغا قويۇپ بېرىڭ. تۆۋەندىكى تەرتىپ:\n' +
      '1. ھەدىستىن قىسقىچە ئۇيغۇرچە مەنا.\n' +
      '2. ھەدىسنىڭ سەھىھلىك دەرىجىسى (سەھىھ / ھەسەن / زەئىف) ۋە مەنبە.\n' +
      '3. ئاساسلىق پەند-نەسىھەتلىرى.\n' +
      '4. كلاسسىك ئالىملارنىڭ شەرھى / كۆز قارىشى. ئىختىلاپ بولسا، ئۈچ-\n' +
      '   تۆتنىڭ پىكرىنى نەقىل قىلىپ ئېيتىڭ.\n' +
      '5. زامانىۋىي مۇسۇلمانلارغا ماس كېلىدىغان ساغلام نەسىھەت.\n' +
      'دىققەت: ئۆزىڭىزدىن ھۆكۈم چىقارماڭ، شەخسىي پەتىۋا بەرمەڭ.'
  },
  tafsir: {
    role: 'سىز قۇرئان كەرىم تەپسىرى ۋە تەفسىرلار ئىلمى بويىچە چوڭقۇر ساۋادلىق ئالىمسىز.',
    task:
      'تۆۋەندىكى ئايەت ياكى ئايەتلەرنى كلاسسىك تەپسىرشۇناس ئالىملار\n' +
      '(ئىبنى كەسىر، تەبەرى، قۇرتۇبى، رازى، بەغەۋى، سەئىدى، ئىبنى ئاشۇر،\n' +
      'شەۋكانى، ئالۇسى ۋە باشقىلار) نىڭ تەپسىرلىرى ئاساسىدا تونۇشتۇرۇپ\n' +
      'بېرىڭ. تۆۋەندىكى تەرتىپ:\n' +
      '1. ئايەتنىڭ ئاددىي ئۇيغۇرچە مەنىسى.\n' +
      '2. ئەگەر بار بولسا، ئايەتنىڭ نۇزۇل (چۈشۈش) سەۋەبى.\n' +
      '3. كلاسسىك تەپسىرشۇناسلارنىڭ ئاساسلىق چۈشەندۈرۈشلىرى. ئىختىلاپ\n' +
      '   بولسا ھەر تەرەپنىڭ پىكرىنى ئادالەتلىك بايان قىلىڭ.\n' +
      '4. ئايەتتىن ئېلىش مۇمكىن بولغان پەند-ھېكمەتلەر.\n' +
      '5. زامانىمىزغا ماس كېلىدىغان نەسىھەت ياكى تەپەككۇر نۇقتىسى.\n' +
      'دىققەت: ھۆكۈم چىقارماڭ، شەخسىي ئىجتىھاد بەرمەڭ.'
  },
  fiqh: {
    role: 'سىز ئىسلام فىقھى بويىچە چوڭقۇر ساۋادلىق ئالىمسىز.',
    task:
      'تۆۋەندىكى فىقھى مەسىلىنى ئوتتۇرىغا قويۇپ، تۆت ئاساسلىق مەزھەب\n' +
      '(ھەنەفىي، مالىكىي، شافىئىي، ھەنبەلىي) نىڭ كۆز قارىشلىرىنى\n' +
      'تونۇشتۇرۇڭ. تەرتىپ:\n' +
      '1. مەسىلىنىڭ ئاددىي ئۇيغۇرچە بايانى.\n' +
      '2. ھەر بىر مەزھەبنىڭ ھۆكمى ۋە دەلىلى. ئىختىلاپ بولسا سەۋەبىنى\n' +
      '   ئېنىق ئېيتىڭ.\n' +
      '3. زامانىۋىي پەتىۋا ھەيئەتلىرى (ئىسلام فىقھى ئاكادېمىيىسى، مىسىر\n' +
      '   ئەلئەزھەر، سەئۇدى دائىمى ھەيئەت قاتارلىقلار) نىڭ كۆز قارىشى.\n' +
      '4. ئاخىرىدا ساغلام ئوتتۇرا يول.\n' +
      'دىققەت: شەخسىي پەتىۋا بەرمەڭ — ئالىملارنىڭ كۆز قاراشلىرىنىڭ\n' +
      'تەسۋىرى. مۇئەييەن مەزھەبنى تەركىپ قىلماڭ.'
  },
  poetry: {
    role: 'سىز ئۇيغۇر، پارىس ۋە ئەرەب شېئىرىيىتى بويىچە ئەدەبىيات تەنقىدچىسىز.',
    task:
      'تۆۋەندىكى شېئىرنى ئەدەبىي جەھەتتە تەھلىل قىلىڭ. تەرتىپ:\n' +
      '1. شائىر ھەققىدە قىسقىچە مەلۇمات (ئېنىق بولسا).\n' +
      '2. شېئىرنىڭ ئومۇمىي مەنا ۋە ئۇچۇرى.\n' +
      '3. شېئىردا ئىشلىتىلگەن ئوبراز، تەشبىھ، ئىستىئارە، كىنايە كەبى\n' +
      '   ئەدەبىي سەنئەت ئۇسۇللىرى.\n' +
      '4. ۋەزىن، قاپىيە ۋە رادىف (مۇۋاپىق بولسا).\n' +
      '5. شېئىردىكى مەنىۋىي / ئەخلاقىي / ئىسلامى قىممەت.\n' +
      'دىققەت: شائىر ئېنىق ئەمەس بولسا تەخمىن قىلماڭ.'
  },
  political: {
    role: 'سىز ئومۇمىي مەلۇمات ۋە ئوبيېكتىپ تەھلىل بويىچە ياردەمچىسىز.',
    task:
      'تۆۋەندىكى سىياسىي / ئىجتىمائىي تېكىستنى تەھلىل قىلىپ بېرىڭ.\n' +
      'مۇتلەق ئادىل، ئوبيېكتىپ بولۇڭ. تەرتىپ:\n' +
      '1. تېكىستتىكى ئاساسلىق پىكىر ۋە دەلىللەرنى خۇلاسىلەش.\n' +
      '2. تېكىستنىڭ ئارقىسىدىكى تارىخىي / ئىجتىمائىي فون.\n' +
      '3. ئوخشىمىغان كۆز قاراشلار (ھەر تەرەپنىڭ پىكرى).\n' +
      '4. ئېنىق بولسا مۇتەخەسسىسلەرنىڭ كۆز قارىشى.\n' +
      '5. ئاخىرىدا «بۇ پەقەت قاراشلارنىڭ تەسۋىرى» دەپ ئەسكەرتىڭ.'
  },
  literary: {
    role: 'سىز ئۇيغۇر، تۈركى ۋە ئەرەب ئەدەبىياتى بويىچە تەنقىدچىسىز.',
    task:
      'تۆۋەندىكى ئەدەبىي پارچىنى تەھلىل قىلىڭ:\n' +
      '1. پارچىنىڭ ئومۇمىي مەزمۇنى ۋە ئۇچۇرى.\n' +
      '2. ئۇسلۇب، تىل ئىشلىتىش ۋە بەدىئىي ئالاھىدىلىكى.\n' +
      '3. شەخسلەر، ۋەقەلىك، يەرلىك (بار بولسا).\n' +
      '4. مەنىۋىي ياكى ئەخلاقىي تېمىلار.\n' +
      '5. ئۇيغۇر / ئىسلام / تۈركى ئەدەبىياتىدىكى ئورنى.'
  },
  general: {
    role: 'سىز ھەرتەرەپلىمە ساۋادلىق، ئوبيېكتىپ ياردەمچىسىز.',
    task:
      'تۆۋەندىكى مەزمۇن ھەققىدە ئوقۇرمەننىڭ سوئالىغا ساغلام پىكىر بىلەن\n' +
      'جاۋاب بېرىڭ:\n' +
      '1. سوئالنىڭ نېمىنى سوراۋاتقانلىقىنى ئېنىق چۈشىنىش.\n' +
      '2. ئىشەنچلىك ئۇچۇر ئاساسىدا جاۋاب.\n' +
      '3. تەخمىن ئەمەس — بىلمىسىڭىز ئاشكارا ئېيتىڭ.\n' +
      '4. ئادىل، ئوبيېكتىپ.'
  },
  // Literary / multilingual translation into Uyghur.
  translation: {
    role: 'سىز كلاسسىك ئۇيغۇر، ئەرەب، پارىس ئەدەبىياتى ۋە دىنىي تېكىست ' +
          'ئىشلىرى بويىچە كۆپ تىللىق تەرجىمانسىز.',
    task:
      'تۆۋەندىكى تېكىستنى ئەسلىي مەنا، ئەدەبىي گۈزەللىك ۋە كونتېكستنى ' +
      'ساقلىغان ھالدا ئۇيغۇر يېزىقىغا تەرجىمە قىلىڭ. تەرتىپ:\n' +
      '1. ئۇيغۇرچە چىگ تەرجىمە (ئۇچۇر سادىقلىقى ئاساس).\n' +
      '2. ئەدەبىي ياكى شېئىرىي تەرجىمە (ماس بولسا).\n' +
      '3. مۇھىم سۆز / ئاتالغۇ / ئوبرازنىڭ چۈشەندۈرۈلۈشى.\n' +
      '4. تارىخىي ياكى دىنىي كونتېكست (مۇۋاپىق بولسا).\n' +
      'دىققەت: تەخمىنى توقۇپ چىقماڭ. ئېنىق بولمىغان جايلارنى ئېيتىڭ.'
  },
  // Find content about a topic inside the supplied book passages. In RAG
  // mode the context arrives pre-tagged with [N-ئورۇن] markers; the prompt
  // below works in both modes.
  topic_search: {
    role: 'سىز كىتاب مەزمۇنى ئىچىدىن ئۇچۇر تېپىپ بېرىدىغان ئىزدەش ياردەمچىسىز.',
    task:
      'تۆۋەندىكى كىتاب پارچىلىرى ئىچىدىن ئوقۇرمەنگە لازىم بولغان مەزمۇننى\n' +
      'تېپىپ بېرىڭ. ئەگەر پارچىلارنىڭ بېشىدا [N-ئورۇن] بەلگىسى بولسا\n' +
      'ئۇنى نەقىلنىڭ مەنبەسى سۈپىتىدە ئىشلىتىڭ. تەرتىپ:\n' +
      '1. تېپىلغان نەقىلنى مۇلاھىزىسى بىلەن كۆچۈرۈڭ.\n' +
      '2. ھەربىر نەقىلنىڭ ئاخىرىدا [N-ئورۇن] بولسا ئۇنى كۆرسىتىڭ.\n' +
      '3. ھېچنېمە تېپىلمىسا، ئاشكارا ئېيتىڭ — توقۇماڭ.'
  },
  // Explain a single term / person / place the reader picked.
  term_explain: {
    role: 'سىز ئاتالغۇ، كىشى ۋە ئورۇن ناملىرىنى چۈشەندۈرىدىغان بىلىمدار ياردەمچىسىز.',
    task:
      'ئوقۇرمەن تاللىغان ئاتالغۇ / كىشى ئىسمى / ئورۇن نامىنى چۈشەندۈرۈپ\n' +
      'بېرىڭ. تەرتىپ:\n' +
      '1. قىسقا ئېنىقلىما (نېمە / كىم / نەدە).\n' +
      '2. تارىخىي، دىنىي ياكى ئەدەبىي ئەھمىيىتى (مۇۋاپىق بولسا).\n' +
      '3. ئوقۇلۇۋاتقان تېكىست بىلەن بولغان مۇناسىۋىتى.\n' +
      '4. ئېنىق بولمىسا تەخمىن قىلماي «ئېنىق مەلۇمات تېپىلمىدى» دەڭ.'
  }
};

// Directed-pair literary translation.
const LANGS = {
  uy: { name: 'Uyghur',                              script: 'the Uyghur Arabic script' },
  ar: { name: 'Arabic (Modern Standard / فصحى)',     script: 'Arabic script' },
  en: { name: 'English',                             script: 'Latin script' },
  tr: { name: 'Turkish (modern İstanbul Turkish)',   script: 'Latin script' }
};

// Self-contained translation prompt. CRITICAL: it does NOT include
// SYSTEM_BASE (which forces Uyghur output) — otherwise translating INTO
// Arabic/English/Turkish would come back in Uyghur.
function buildTranslationPrompt(from, to, text) {
  const S = LANGS[from] || LANGS.uy;
  const T = LANGS[to] || LANGS.uy;
  return [
    // State the target language up front AND at the end so it is enforced
    // beyond doubt (the model must never echo the source language).
    'TASK: Translate FROM ' + S.name + ' INTO ' + T.name + '. The entire output must be written in ' + T.name + ' (' + T.script + ').',
    '',
    'You are a master literary translator with native-level command of ' + S.name + ' and',
    T.name + ', expert across classical, religious, and literary registers.',
    'Translate the passage delimited by <<< >>> from ' + S.name + ' into ' + T.name + '.',
    'Rules:',
    '1. Convey the full meaning faithfully and precisely — no additions, omissions, or distortion.',
    '2. Write natural, fluent, idiomatic ' + T.name + ' as an educated native writer would —',
    '   never a word-for-word calque. Match the register and tone (formal→formal,',
    '   poetic→poetic, archaic→dignified classical).',
    '3. Preserve literary beauty — rhythm, imagery, and rhetorical figures — recreated with',
    "   the target language's own devices.",
    '4. Proper nouns and technical/religious terms: use the established ' + T.name + ' form;',
    '   if none exists, render faithfully and keep the original once in parentheses.',
    '5. Quran verses, hadith, or famous classical quotations: translate the meaning',
    '   faithfully and accurately; never paraphrase loosely.',
    '6. Resolve ambiguity from context; pick the most contextually apt reading.',
    '7. Output ONLY the finished translation, written entirely in ' + T.name,
    '   (' + T.script + '). No notes, no preamble, no source text, no explanation.',
    '<<<',
    String(text || ''),
    '>>>',
    '',
    'The ENTIRE response must be written in ' + T.name + ' (' + T.script + '). Do not output any text in ' + S.name + '. Do not transliterate; translate.'
  ].join('\n');
}

// Uyghur proofreading prompt (Phase 4). Fixes ONLY spelling/orthography/
// punctuation on numbered ⟦N⟧ segments, returning the SAME markers in order.
// English meta-instructions (Gemini follows them most reliably); the content
// rules are Uyghur-specific.
function buildProofreadPrompt(segmented) {
  return [
'TASK: Proofread modern Uyghur text (Arabic script). Fix ONLY spelling, orthography, and punctuation. Output the corrected text and NOTHING else.',
'',
'You are an expert editor of modern standard Uyghur (ھازىرقى زامان ئۇيغۇر ئەدەبىي تىلى) with complete command of the current official orthography and punctuation rules.',
'',
'The input consists of numbered segments. Each segment starts with a marker like ⟦1⟧, ⟦2⟧ … on its own line region. You MUST return the SAME segments with the SAME markers in the SAME order — one corrected segment per marker, no segments added, merged, split, or dropped.',
'',
'CORRECT (and nothing more):',
'1. Spelling per current Uyghur orthography: correct hemze (ئ) usage at word/syllable starts; correct Uyghur vowel letters (ا ە ې ى و ۇ ۆ ۈ); vowel-harmony-consistent suffix forms; commonly confused consonants (ق/ك، غ/خ، ھ/خ) judged by the intended word.',
'2. Character-level intrusions from Arabic/Persian keyboards: ی→ي، ك variants→ك، ه used as a vowel→ە، ة→ت where the word is Uyghur. Never "correct" genuinely Arabic quotations (Quran, hadith, duas) — leave Arabic passages exactly as written.',
'3. Punctuation per Uyghur rules: sentence-final «.», question «؟», exclamation «!», comma «،», semicolon «؛», colon «:», quotes «...» for quotations; no space BEFORE punctuation, exactly one space AFTER; paired punctuation balanced.',
'4. Spacing: collapse double spaces; fix spaces around parentheses and dashes; fix wrongly joined or split words ONLY when the correct form is unambiguous.',
'',
'NEVER:',
'- Rephrase, reorder, summarize, expand, or "improve" wording. Word choice belongs to the author.',
'- Change names, numbers, dates, Latin-script words, or Arabic quotations.',
'- Add or remove sentences. If a word is ambiguous and context does not decide it, leave it unchanged.',
'',
'OUTPUT: only the corrected segments with their ⟦N⟧ markers. No preamble, no explanations, no diff.',
'',
'INPUT SEGMENTS:',
String(segmented || '')
  ].join('\n');
}

function buildPrompt(opts) {
  // Translation bypasses SYSTEM_BASE entirely.
  if (opts.type === 'translation' && opts.translateFrom && opts.translateTo) {
    return buildTranslationPrompt(opts.translateFrom, opts.translateTo,
      String(opts.context || '').slice(0, MAX_CONTEXT_CHARS));
  }
  // Uyghur proofread — segmented ⟦N⟧ protocol, also bypasses SYSTEM_BASE.
  if (opts.type === 'uy_proofread') {
    return buildProofreadPrompt(String(opts.context || '').slice(0, MAX_CONTEXT_CHARS));
  }
  const type = opts.type || 'general';
  const tmpl = PROMPTS[type] || PROMPTS.general;
  const ctx = String(opts.context || '').slice(0, MAX_CONTEXT_CHARS);
  const question = String(opts.question || '').trim();

  const sections = [
    SYSTEM_BASE,
    '',
    'تۈر: ' + type,
    'رول: ' + tmpl.role,
    '',
    'ۋەزىپە:',
    tmpl.task,
    ''
  ];

  if (ctx) {
    sections.push('--- تېكىست (ھازىر ئوقۇلۇۋاتقان مەزمۇن) ---');
    sections.push(ctx);
    sections.push('--- تېكىست ئاخىرى ---');
    sections.push('');
  }

  if (question) {
    sections.push('ئوقۇرمەننىڭ سوئالى:');
    sections.push(question);
  } else {
    sections.push('ئوقۇرمەن ئېنىق سوئال سورىمىدى. يۇقىرىدىكى ۋەزىپە بويىچە');
    sections.push('تېكىست ھەققىدە ئەڭ پايدىلىق چۈشەندۈرۈشنى بېرىڭ.');
  }

  return sections.join('\n');
}

// ----------------------------------------------------------------
// Low-level fetch with timeout
// ----------------------------------------------------------------

function fetchWithTimeout(url, opts, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const controller = new AbortController();
    const fetchOpts = Object.assign({}, opts || {});
    fetchOpts.signal = controller.signal;
    const t = setTimeout(function () {
      try { controller.abort(); } catch (_) {}
      reject(new Error('بەلگىلەنگەن ۋاقىتتا جاۋاب چىقمىدى (' + timeoutMs + 'ms)'));
    }, timeoutMs);
    fetch(url, fetchOpts).then(function (r) {
      clearTimeout(t);
      resolve(r);
    }).catch(function (e) {
      clearTimeout(t);
      reject(e);
    });
  });
}

// ----------------------------------------------------------------
// Main API call
// ----------------------------------------------------------------

async function callGemini(model, key, body) {
  const url = API_BASE + '/models/' + encodeURIComponent(model)
            + ':generateContent?key=' + encodeURIComponent(key);
  // NOTE: the key is only ever in the URL we fetch — never in any log line.
  console.log('[ai] POST', API_BASE + '/models/' + model + ':generateContent');

  let lastErr = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, REQUEST_TIMEOUT_MS);

      // 429 / 5xx: retry with backoff.
      if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
        let detail = '';
        try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
        lastErr = new Error('HTTP ' + resp.status + (detail ? ' — ' + detail : ''));
        // Stash the status so ask() can map 429 to a friendly Uyghur
        // "quota exhausted" message instead of the raw Gemini string.
        lastErr.status = resp.status;
        console.warn('[ai] attempt', attempt + 1, 'retryable error:', lastErr.message);
        await sleep(BACKOFF_MS[attempt] || 3000);
        continue;
      }

      // 404 on model name: signal so caller can fall back to another model.
      if (resp.status === 404) {
        let detail = '';
        try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
        const e = new Error('Model not found: ' + (detail || model));
        e.notFound = true;
        throw e;
      }

      if (!resp.ok) {
        let detail = '';
        try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
        throw new Error('HTTP ' + resp.status + (detail ? ' — ' + detail : ''));
      }

      const json = await resp.json();
      return json;
    } catch (e) {
      // Network / abort errors retry; explicit "notFound" doesn't.
      if (e && e.notFound) throw e;
      lastErr = e;
      console.warn('[ai] attempt', attempt + 1, 'failed:', (e && e.message) || e);
      if (attempt === MAX_TRIES - 1) break;
      await sleep(BACKOFF_MS[attempt] || 3000);
    }
  }
  throw lastErr || new Error('سوراش مەغلۇپ بولدى');
}

function extractText(json) {
  if (!json || !json.candidates || !json.candidates.length) return '';
  const cand = json.candidates[0];
  if (!cand.content || !cand.content.parts) return '';
  return cand.content.parts.map(function (p) { return p.text || ''; }).join('').trim();
}

// Streaming variant: like extractText but WITHOUT the trailing trim — each SSE
// chunk is a delta, and trimming would swallow the spaces between consecutive
// chunks (e.g. "...سۆز" + " يەنە..." → "...سۆزيەنە..."). The accumulated text
// is what the UI renders, so inter-chunk whitespace must survive.
function extractDelta(json) {
  if (!json || !json.candidates || !json.candidates.length) return '';
  const cand = json.candidates[0];
  if (!cand.content || !cand.content.parts) return '';
  return cand.content.parts.map(function (p) { return p.text || ''; }).join('');
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ----------------------------------------------------------------
// Request-body builders (shared by ask() + askStream())
// ----------------------------------------------------------------

// Optional multi-turn history. `opts.history` is an array of
// { role:'user'|'model', text } that the UI caps to the last ~3 turns. We map
// it into Gemini `contents` BEFORE the new fully-framed user turn, and clamp
// each prior turn so a long earlier answer can't blow the free-tier token
// budget. With no history this returns exactly the single user turn.
function buildContents(opts) {
  const contents = [];
  const hist = Array.isArray(opts.history) ? opts.history.slice(-6) : [];
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (!h || !h.text) continue;
    const role = (h.role === 'model') ? 'model' : 'user';
    contents.push({ role: role, parts: [{ text: String(h.text).slice(0, 4000) }] });
  }
  contents.push({ role: 'user', parts: [{ text: buildPrompt(opts) }] });
  return contents;
}

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
];

function buildBody(opts) {
  // Deep-reasoning toggle. Default OFF (thinkingBudget=0) so the model spends
  // its whole budget on visible output — critical to avoid empty responses on
  // Gemini 3.x. deepThink grants a 1024-token budget.
  const thinkingBudget = opts.deepThink ? 1024 : 0;
  // Translation favours fidelity (lower temperature) and needs a much larger
  // output budget — a full translation is long, and the default 4096 would
  // truncate it.
  const isTranslate = (opts.type === 'translation');
  return {
    contents: buildContents(opts),
    generationConfig: {
      temperature: isTranslate ? 0.3 : 0.4,
      topP: 0.9,
      thinkingConfig: { thinkingBudget: thinkingBudget },
      maxOutputTokens: isTranslate ? 8192 : 4096
    },
    safetySettings: SAFETY_SETTINGS
  };
}

// STRICT: the user's selected model is the ONLY model we try. We
// deliberately do NOT append MODEL_FALLBACKS — a silent substitution would
// run a model the user didn't choose (different quality AND different
// price). Kept list-shaped so the ask()/askStream() loops stay unchanged.
function modelListFor(requestedModel) {
  return [requestedModel || DEFAULT_MODEL];
}

function isQuotaError(err) {
  return !!(err && (err.status === 429 ||
    /\b429\b|quota|resource has been exhausted|rate.?limit/i.test(String(err.message || ''))));
}

// Did the request fail because the SELECTED model itself is unavailable to
// this key? Covers: retired/wrong model ID (404), permission/billing gate
// (403 / PERMISSION_DENIED), and a paid-only model called with a free key —
// Gemini reports that last case as a 429 whose message says the model has
// no free quota tier (limit: 0), so it must be tested BEFORE isQuotaError.
// Strict model selection maps all of these to a "pick another model"
// message instead of silently substituting a different model.
function isModelUnavailableError(err) {
  if (!err) return false;
  if (err.notFound) return true;
  if (err.status === 403 || err.status === 404) return true;
  const msg = String(err.message || '');
  if (/\bHTTP 40[34]\b/.test(msg)) return true;
  if (/PERMISSION_DENIED|permission denied|is not found|was not found|not supported|doesn'?t have access|does not have access/i.test(msg)) return true;
  if (/free quota tier|limit:\s*0\b/i.test(msg)) return true;
  return false;
}

// Uyghur error for an unavailable selected model — names the exact model so
// the user knows which choice failed and what to do (switch model in
// Settings, or enable Google billing for the paid tier).
function modelUnavailableMessage(model) {
  return '«' + model + '» مودېلى ئىشلىمىدى. ئۇ ھەقسىز ئاچقۇچتا يوق بولۇشى مۇمكىن (مەسىلەن Pro مودېلى billing تەلەپ قىلىدۇ). باشقا مودېل تاللاڭ ياكى Google billing نى ئېچىڭ.';
}

// Did Gemini reject the request because the INPUT was too large (token/size
// limit)? Used to drive the reactive "book too large" fallback — never a
// pre-emptive guess. We require a size-related phrase, and for a bare HTTP
// 400 also an INVALID_ARGUMENT + size word, so ordinary 400s (e.g. bad key)
// don't trip it.
function isSizeError(err) {
  const msg = String((err && err.message) || err || '');
  if (/exceeds the maximum number of tokens|maximum input|input token|request payload size|too large|content too long|exceeds the limit/i.test(msg)) return true;
  if (/INVALID_ARGUMENT/i.test(msg) && /token|size|large|payload|long/i.test(msg)) return true;
  return false;
}

function logTokenUsage(model, usageMetadata, deepThink) {
  try {
    const u = usageMetadata || {};
    console.log('[ai] tokens model=' + model +
      ' total=' + (u.totalTokenCount != null ? u.totalTokenCount : '?') +
      ' prompt=' + (u.promptTokenCount != null ? u.promptTokenCount : '?') +
      ' out=' + (u.candidatesTokenCount != null ? u.candidatesTokenCount : '?') +
      (deepThink ? ' (deep)' : ''));
  } catch (_) {}
}

// Defensive model self-heal — RETIRED from the automatic path. STRICT model
// selection means nothing may rewrite the user's chosen model behind their
// back, so ask()/askStream()/test() no longer invoke this. Kept only for
// diagnostics / a possible future explicit "find available models" button
// in Settings. NOTE: it persists a different model via setModel() — never
// wire it back into an automatic error path.
async function selfHealModel(key) {
  try {
    const url = API_BASE + '/models?key=' + encodeURIComponent(key);
    const resp = await fetchWithTimeout(url, { method: 'GET' }, REQUEST_TIMEOUT_MS);
    if (!resp.ok) return false;
    const json = await resp.json();
    const list = (json && json.models) || [];
    const usable = list.filter(function (m) {
      const methods = (m && m.supportedGenerationMethods) || [];
      return methods.indexOf('generateContent') !== -1;
    }).map(function (m) {
      return String((m && m.name) || '').replace(/^models\//, '');
    }).filter(Boolean);
    if (!usable.length) return false;
    // Prefer a flash tier (fast + good Uyghur on 3.x). Lexical desc sort
    // surfaces the highest version name (e.g. 3.5 before 3.1 before 2.x).
    const flash = usable.filter(function (n) { return /flash/i.test(n); });
    const pick = (flash.length ? flash : usable).slice().sort().reverse()[0];
    if (!pick) return false;
    setModel(pick);
    console.log('[ai] self-healed model →', pick);
    return true;
  } catch (e) {
    console.warn('[ai] selfHealModel failed:', e && (e.message || e));
    return false;
  }
}

async function ask(opts) {
  opts = opts || {};
  // RAG mode — the caller supplies context pre-tagged with [N-ئورۇن]
  // markers. Force the topic_search template so the model cites them.
  if (opts.mode === 'rag' && !opts.type) opts.type = 'topic_search';
  const key = loadKey();
  if (!key) {
    return { ok: false, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن. تەڭشەكلەرگە كىرىپ ئاچقۇچىڭىزنى قوشۇڭ.' };
  }
  if (!isEnabled()) {
    return { ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى تەڭشەكلەردە ئېتىلگەن.' };
  }

  const requestedModel = getModel();
  const models = modelListFor(requestedModel);
  // Kept for the usage-log line below; buildBody() computes its own copy.
  const thinkingBudget = opts.deepThink ? 1024 : 0;
  const body = buildBody(opts);

  let lastErr = null;
  for (const m of models) {
    try {
      const json = await callGemini(m, key, body);
      const text = extractText(json);
      if (!text) {
        const reason = (json.promptFeedback && json.promptFeedback.blockReason)
                    || (json.candidates && json.candidates[0] && json.candidates[0].finishReason)
                    || 'unknown';
        // Log the response shape so we can diagnose safety-filter blocks vs.
        // token-budget exhaustion vs. odd response shapes.
        console.warn('[ai] empty response from', m, '— reason:', reason, 'json:',
                     JSON.stringify(json).slice(0, 400));
        return { ok: false, error: 'جاۋاب چىقمىدى — سەۋەب: ' + reason };
      }
      bumpUsage();
      logTokenUsage(m, json.usageMetadata, !!thinkingBudget);
      return { ok: true, text: text, model: m };
    } catch (e) {
      // STRICT: the selected model failed — no fallback to another model
      // and no selfHealModel. The error is mapped to a clear message below
      // and the USER decides what to do (switch model / enable billing).
      lastErr = e;
      break;
    }
  }

  // The API rejected the input on size. Signal the UI to offer the
  // in-book-search fallback instead of dumping a raw 400.
  if (isSizeError(lastErr)) {
    return { ok: false, tooLargeFallback: true, error: 'بۇ كىتاب بەك چوڭ بولۇپ، API نى بىراقلا قوبۇل قىلمىدى.' };
  }

  // The SELECTED model itself is unavailable to this key (retired ID, or a
  // paid tier without billing). Checked BEFORE the quota mapping because a
  // paid-only model on a free key surfaces as a zero-quota 429.
  if (isModelUnavailableError(lastErr)) {
    return { ok: false, error: modelUnavailableMessage(requestedModel) };
  }

  // Map 429 ("quota exhausted" or "rate limited") onto a friendly Uyghur
  // message. Both Gemini's per-minute rate limit and its per-day free-tier
  // quota return 429; we treat both the same from the user's perspective —
  // they should just try again later. Once the quota refreshes on Google's
  // side, the very next request will succeed automatically; we don't
  // persist any "blocked" state locally.
  if (isQuotaError(lastErr)) {
    return {
      ok: false,
      quotaExhausted: true,
      error: 'ھەقسىز ئىشلىتىش ھەققىڭىز توشۇپ قالدى. بىردەمدىن كېيىن قايتا سىناڭ.'
    };
  }

  return {
    ok: false,
    error: 'سوراش مەغلۇپ بولدى: ' + ((lastErr && lastErr.message) || 'نامەلۇم خاتالىق')
  };
}

// Lightweight connectivity probe — sends a one-token prompt, returns ok=true
// if anything comes back. Used by the Settings "test connection" button so
// the user knows their key actually works before opening a book.
// STRICT: probes ONLY the currently-selected model — a ✓ here means THIS
// model works, not that some other model answered in its place.
async function test() {
  const key = loadKey();
  if (!key) return { ok: false, message: 'ئاچقۇچ يوق' };

  const model = getModel();
  try {
    const json = await callGemini(model, key, {
      contents: [{ role: 'user', parts: [{ text: 'سالام دەپ بىر سۆزلا جاۋاب بەر.' }] }],
      generationConfig: {
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 128
      }
    });
    const text = extractText(json);
    if (text) return { ok: true, message: text, model: model };
    // Empty: report why so the Settings UI can show something useful.
    const reason = (json && json.candidates && json.candidates[0] && json.candidates[0].finishReason)
                || (json && json.promptFeedback && json.promptFeedback.blockReason)
                || 'unknown';
    return { ok: false, message: 'جاۋاب بوش (سەۋەب: ' + reason + ')' };
  } catch (e) {
    // STRICT: no fallback probes — the user asked whether THIS model works.
    // Unavailable model (404/403/paid-only) gets the explicit Uyghur
    // explanation; a genuine 429 keeps the friendly quota message.
    if (isModelUnavailableError(e)) {
      return { ok: false, message: modelUnavailableMessage(model) };
    }
    if (isQuotaError(e)) {
      return { ok: false, message: 'ھەقسىز ئىشلىتىش ھەققىڭىز توشۇپ قالدى. بىردەمدىن كېيىن قايتا سىناڭ.' };
    }
    return { ok: false, message: (e && e.message) || 'سىناشتا خاتالىق' };
  }
}

// ----------------------------------------------------------------
// Streaming variant of ask() — Server-Sent Events
//
// Builds the request EXACTLY like ask() (same buildPrompt / STRICT
// single-model list / generationConfig incl. thinkingConfig /
// safetySettings / usage counter / 429→friendly mapping / multi-turn
// history) but hits the SSE endpoint and feeds the answer to the caller
// as it arrives:
//   onChunk(textDelta)            — called as each delta arrives
//   onDone(fullText, model, usage)— called once the stream completes
//   onError({ok:false, error, …}) — called on failure (same shape as ask())
// Returns { abort } so the caller can cancel mid-stream. If the stream fails
// BEFORE any text arrives, it transparently falls back to the non-stream
// ask() so nothing breaks.
// ----------------------------------------------------------------
function askStream(opts, onChunk, onDone, onError) {
  opts = opts || {};
  onChunk = onChunk || function () {};
  onDone  = onDone  || function () {};
  onError = onError || function () {};
  // Parity with ask(): RAG context forces the topic_search template.
  if (opts.mode === 'rag' && !opts.type) opts.type = 'topic_search';

  let aborted = false;
  let controller = null;
  function abort() {
    aborted = true;
    if (controller) { try { controller.abort(); } catch (_) {} }
  }

  (async function run() {
    const key = loadKey();
    if (!key) {
      onError({ ok: false, noKey: true, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن. تەڭشەكلەرگە كىرىپ ئاچقۇچىڭىزنى قوشۇڭ.' });
      return;
    }
    if (!isEnabled()) {
      onError({ ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى تەڭشەكلەردە ئېتىلگەن.' });
      return;
    }
    if (aborted) return;

    const requestedModel = getModel();
    const models = modelListFor(requestedModel);
    const body = buildBody(opts);
    let lastErr = null;
    let emittedAny = false;   // did we hand any text to onChunk?
    let streamed = '';        // accumulated text for the current attempt
    let lastModel = requestedModel;

    for (let mi = 0; mi < models.length; mi++) {
      const m = models[mi];
      lastModel = m;
      if (aborted) return;
      streamed = '';
      try {
        controller = new AbortController();
        const url = API_BASE + '/models/' + encodeURIComponent(m)
                  + ':streamGenerateContent?alt=sse&key=' + encodeURIComponent(key);
        console.log('[ai] STREAM', API_BASE + '/models/' + m + ':streamGenerateContent');
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (resp.status === 404) {
          const e = new Error('Model not found: ' + m); e.notFound = true;
          lastErr = e; break;   // STRICT: no other model to try — mapped below
        }
        if (!resp.ok) {
          let detail = '';
          try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
          lastErr = new Error('HTTP ' + resp.status + (detail ? ' — ' + detail : ''));
          lastErr.status = resp.status;
          break;   // non-404 HTTP error → stop and fall back to ask()
        }
        if (!resp.body || typeof resp.body.getReader !== 'function') {
          throw new Error('NO_STREAM');
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        let usage = null;
        while (true) {
          if (aborted) { try { reader.cancel(); } catch (_) {} return; }
          const piece = await reader.read();
          if (piece.done) break;
          buf += decoder.decode(piece.value, { stream: true });
          // SSE frames are newline-delimited; a "data:" line carries one
          // complete GenerateContentResponse chunk. We only process whole
          // lines so a JSON object split across reads is never half-parsed.
          let nl;
          while ((nl = buf.indexOf('\n')) !== -1) {
            let line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            line = line.replace(/\r$/, '').trim();
            if (!line || line.charAt(0) === ':') continue;       // keepalive/comment
            if (line.indexOf('data:') !== 0) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let j = null;
            try { j = JSON.parse(payload); } catch (_) { continue; }
            const delta = extractDelta(j);   // no trim — preserve inter-chunk spaces
            if (delta) { streamed += delta; emittedAny = true; if (!aborted) onChunk(delta); }
            if (j.usageMetadata) usage = j.usageMetadata;
          }
        }
        if (aborted) return;
        if (!streamed) { lastErr = new Error('EMPTY_STREAM'); break; }

        bumpUsage();
        logTokenUsage(m, usage, !!opts.deepThink);
        onDone(streamed, m, usage);
        return;
      } catch (e) {
        if (aborted) return;
        // STRICT: never retry on a different model — record and map below.
        lastErr = e;
        break;   // network error / NO_STREAM → fall back to ask() (same model)
      }
    }

    if (aborted) return;

    // If we already streamed partial text, finalize with it rather than
    // re-running ask() (which would duplicate the whole answer).
    if (emittedAny && streamed) {
      bumpUsage();
      onDone(streamed, lastModel, null);
      return;
    }

    // If the API rejected the input on size, surface the reactive fallback
    // directly — don't re-send the huge body via ask().
    if (isSizeError(lastErr)) {
      onError({ ok: false, tooLargeFallback: true, error: 'بۇ كىتاب بەك چوڭ بولۇپ، API نى بىراقلا قوبۇل قىلمىدى.' });
      return;
    }

    // STRICT: the selected model itself is unavailable (404/403/paid-only).
    // Re-sending via ask() would just fail the same way on the same model —
    // surface the explicit Uyghur message now.
    if (isModelUnavailableError(lastErr)) {
      onError({ ok: false, error: modelUnavailableMessage(requestedModel) });
      return;
    }

    // Otherwise fall back to the proven non-stream path (SAME model,
    // non-streaming transport) so nothing breaks.
    try {
      const res = await ask(opts);
      if (aborted) return;
      if (res.ok) { onChunk(res.text); onDone(res.text, res.model, null); }
      else onError(res);
    } catch (e2) {
      if (aborted) return;
      if (isQuotaError(lastErr) || isQuotaError(e2)) {
        onError({ ok: false, quotaExhausted: true, error: 'ھەقسىز ئىشلىتىش ھەققىڭىز توشۇپ قالدى. بىردەمدىن كېيىن قايتا سىناڭ.' });
      } else {
        onError({ ok: false, error: 'سوراش مەغلۇپ بولدى: ' + ((lastErr && lastErr.message) || (e2 && e2.message) || 'نامەلۇم خاتالىق') });
      }
    }
  })();

  return { abort: abort };
}

// ----------------------------------------------------------------
// Directed-pair literary translation with streaming.
// ----------------------------------------------------------------

// Split long text into ordered segments ≤ maxLen on paragraph → sentence →
// hard boundaries, so each translation call stays well within the output
// budget (avoids mid-translation truncation). Short text → one segment.
function splitForTranslation(text, maxLen) {
  maxLen = maxLen || 6000;
  text = String(text || '');
  if (text.length <= maxLen) return [text];
  const units = text.split(/\n{2,}/);
  const pieces = [];
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    if (unit.length <= maxLen) { pieces.push(unit); continue; }
    // Oversized paragraph: break on sentence enders / newlines.
    const tokens = unit.match(/[^.!?۔؟\n]*[.!?۔؟\n]?/g) || [unit];
    let bufp = '';
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (!tk) continue;
      if (bufp.length + tk.length > maxLen) {
        if (bufp) pieces.push(bufp);
        if (tk.length > maxLen) {
          for (let k = 0; k < tk.length; k += maxLen) pieces.push(tk.slice(k, k + maxLen));
          bufp = '';
        } else { bufp = tk; }
      } else { bufp += tk; }
    }
    if (bufp) pieces.push(bufp);
  }
  // Merge adjacent pieces back up to maxLen, rejoining paragraphs with \n\n.
  const segs = [];
  let cur = '';
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (!cur) cur = p;
    else if (cur.length + 2 + p.length <= maxLen) cur += '\n\n' + p;
    else { segs.push(cur); cur = p; }
  }
  if (cur) segs.push(cur);
  return segs.length ? segs : [text];
}

// Low-level: stream ONE generateContent request. Calls onDelta(text) as
// chunks arrive; resolves { text, usage }. Throws on HTTP/abort/no-stream
// (e.notFound for 404, e.status for HTTP, e.noStream when unreadable,
// e.aborted when cancelled). Shared SSE core for the translation path.
async function streamOnce(model, key, body, onDelta, isAborted, setController) {
  const controller = new AbortController();
  if (typeof setController === 'function') setController(controller);
  const url = API_BASE + '/models/' + encodeURIComponent(model)
            + ':streamGenerateContent?alt=sse&key=' + encodeURIComponent(key);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal
  });
  if (resp.status === 404) { const e = new Error('Model not found: ' + model); e.notFound = true; throw e; }
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
    const e = new Error('HTTP ' + resp.status + (detail ? ' — ' + detail : '')); e.status = resp.status; throw e;
  }
  if (!resp.body || typeof resp.body.getReader !== 'function') {
    const e = new Error('NO_STREAM'); e.noStream = true; throw e;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '', text = '', usage = null;
  while (true) {
    if (isAborted && isAborted()) { try { reader.cancel(); } catch (_) {} const e = new Error('ABORTED'); e.aborted = true; throw e; }
    const piece = await reader.read();
    if (piece.done) break;
    buf += decoder.decode(piece.value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      line = line.replace(/\r$/, '').trim();
      if (!line || line.charAt(0) === ':') continue;
      if (line.indexOf('data:') !== 0) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let j = null;
      try { j = JSON.parse(payload); } catch (_) { continue; }
      const d = extractDelta(j);
      if (d) { text += d; if (onDelta) onDelta(d); }
      if (j.usageMetadata) usage = j.usageMetadata;
    }
  }
  return { text: text, usage: usage };
}

// Streaming translation. opts: { translateFrom, translateTo, context }.
// Same callback contract as askStream so the reader UI (Stop/copy/share/
// regenerate) works unchanged. Chunks long input and streams each finished
// segment in order; falls back to the non-stream callGemini per segment.
function translateStream(opts, onChunk, onDone, onError) {
  opts = opts || {};
  onChunk = onChunk || function () {};
  onDone  = onDone  || function () {};
  onError = onError || function () {};
  const from = opts.translateFrom, to = opts.translateTo;
  const text = String(opts.context || '');

  let aborted = false;
  let controller = null;
  function abort() { aborted = true; if (controller) { try { controller.abort(); } catch (_) {} } }

  (async function run() {
    const key = loadKey();
    if (!key) { onError({ ok: false, noKey: true, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن. تەڭشەكلەرگە كىرىپ ئاچقۇچىڭىزنى قوشۇڭ.' }); return; }
    if (!isEnabled()) { onError({ ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى تەڭشەكلەردە ئېتىلگەن.' }); return; }
    if (!text.trim()) { onError({ ok: false, error: 'تەرجىمە قىلىدىغان تېكىست تېپىلمىدى.' }); return; }
    if (aborted) return;

    const segments = splitForTranslation(text, 6000);
    const M = segments.length;
    const model = getModel();
    let full = '', lastUsage = null, emittedAny = false;

    for (let i = 0; i < M; i++) {
      if (aborted) return;
      const partNote = (M > 1)
        ? ('\n\n(This is part ' + (i + 1) + ' of ' + M + ' of a longer text; keep terminology and style consistent.)')
        : '';
      const prompt = buildTranslationPrompt(from, to, segments[i]) + partNote;
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, topP: 0.9, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 8192 },
        safetySettings: SAFETY_SETTINGS
      };
      if (i > 0) { full += '\n\n'; onChunk('\n\n'); }   // paragraph break between segments
      try {
        const r = await streamOnce(model, key, body,
          function (d) { if (!aborted) { full += d; emittedAny = true; onChunk(d); } },
          function () { return aborted; },
          function (c) { controller = c; });
        lastUsage = r.usage || lastUsage;
      } catch (e) {
        if (aborted) return;
        if (e && e.aborted) return;
        // Streaming failed for this segment → non-stream fallback.
        try {
          const json = await callGemini(model, key, body);
          if (aborted) return;
          const t = extractText(json);
          if (t) { full += t; emittedAny = true; onChunk(t); }
        } catch (e2) {
          if (aborted) return;
          if (isSizeError(e) || isSizeError(e2)) { onError({ ok: false, tooLargeFallback: true, error: 'بۇ تېكىست بەك چوڭ بولۇپ، API نى بىراقلا قوبۇل قىلمىدى.' }); return; }
          if (isQuotaError(e) || isQuotaError(e2)) { onError({ ok: false, quotaExhausted: true, error: 'ھەقسىز ئىشلىتىش ھەققىڭىز توشۇپ قالدى. بىردەمدىن كېيىن قايتا سىناڭ.' }); return; }
          onError({ ok: false, error: 'تەرجىمە مەغلۇپ بولدى: ' + ((e2 && e2.message) || (e && e.message) || 'نامەلۇم خاتالىق') }); return;
        }
      }
    }

    if (aborted) return;
    if (!emittedAny || !full.trim()) { onError({ ok: false, error: 'تەرجىمە چىقمىدى. قايتا سىناڭ.' }); return; }
    bumpUsage();
    logTokenUsage(model, lastUsage, false);
    onDone(full, model, lastUsage);
  })();

  return { abort: abort };
}

// ----------------------------------------------------------------
// Free-form chat (Phase 4) — multi-turn Gemini chat, NOT tied to the library.
// `messages` is [{ role:'user'|'model', text }]; mapped to Gemini `contents`
// with CHAT_SYSTEM as the systemInstruction. Same SSE core (streamOnce),
// timeout, STRICT model selection, and quota/unavailable error mapping as the
// rest of the file. Callback contract matches askStream.
// ----------------------------------------------------------------
function chatStream(messages, onChunk, onDone, onError) {
  onChunk = onChunk || function () {};
  onDone  = onDone  || function () {};
  onError = onError || function () {};

  let aborted = false;
  let controller = null;
  function abort() { aborted = true; if (controller) { try { controller.abort(); } catch (_) {} } }

  (async function run() {
    const key = loadKey();
    if (!key) { onError({ ok: false, noKey: true, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن. تەڭشەكلەرگە كىرىپ ئاچقۇچىڭىزنى قوشۇڭ.' }); return; }
    if (!isEnabled()) { onError({ ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى تەڭشەكلەردە ئېتىلگەن.' }); return; }

    // Cap history to the last 20 turns; clamp each turn's length.
    const msgs = Array.isArray(messages) ? messages.slice(-20) : [];
    const contents = msgs
      .filter(function (m) { return m && m.text; })
      .map(function (m) { return { role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text).slice(0, 8000) }] }; });
    if (!contents.length) { onError({ ok: false, error: 'سوئال يوق.' }); return; }
    if (aborted) return;

    const model = getModel();
    const body = {
      systemInstruction: { parts: [{ text: CHAT_SYSTEM }] },
      contents: contents,
      generationConfig: { temperature: 0.7, topP: 0.9, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 4096 },
      safetySettings: SAFETY_SETTINGS
    };

    try {
      const r = await streamOnce(model, key, body,
        function (d) { if (!aborted) onChunk(d); },
        function () { return aborted; },
        function (c) { controller = c; });
      if (aborted) return;
      if (!r.text || !r.text.trim()) { onError({ ok: false, error: 'جاۋاب چىقمىدى. قايتا سىناڭ.' }); return; }
      bumpUsage();
      logTokenUsage(model, r.usage, false);
      onDone(r.text, model, r.usage);
    } catch (e) {
      if (aborted || (e && e.aborted)) return;
      // Streaming failed → one non-stream retry on the SAME model (STRICT).
      try {
        const json = await callGemini(model, key, body);
        if (aborted) return;
        const t = extractText(json);
        if (t) { bumpUsage(); onChunk(t); onDone(t, model, json.usageMetadata || null); return; }
        onError({ ok: false, error: 'جاۋاب چىقمىدى. قايتا سىناڭ.' });
      } catch (e2) {
        if (aborted) return;
        if (isModelUnavailableError(e) || isModelUnavailableError(e2)) { onError({ ok: false, error: modelUnavailableMessage(model) }); return; }
        if (isQuotaError(e) || isQuotaError(e2)) { onError({ ok: false, quotaExhausted: true, error: 'ھەقسىز ئىشلىتىش ھەققىڭىز توشۇپ قالدى. بىردەمدىن كېيىن قايتا سىناڭ.' }); return; }
        onError({ ok: false, error: 'سوراش مەغلۇپ بولدى: ' + ((e2 && e2.message) || (e && e.message) || 'نامەلۇم خاتالىق') });
      }
    }
  })();

  return { abort: abort };
}

// ----------------------------------------------------------------
// Public surface (consumed by main.js IPC handlers; the renderer-side
// detectType/typeLabel/MAX_CONTEXT_CHARS helpers arrive in src/ai-client.js)
// ----------------------------------------------------------------

module.exports = {
  hasApiKey: hasApiKey,
  getApiKey: getApiKey,             // main-process internal — never wire to IPC
  getApiKeyMasked: getApiKeyMasked,
  setApiKey: setApiKey,
  getModel: getModel,
  setModel: setModel,
  isEnabled: isEnabled,
  setEnabled: setEnabled,
  getTodayUsage: getTodayUsage,
  ask: ask,
  askStream: askStream,
  translateStream: translateStream,
  chatStream: chatStream,
  test: test,
  DEFAULT_MODEL: DEFAULT_MODEL,
  MODEL_FALLBACKS: MODEL_FALLBACKS,
  SELECTABLE_MODELS: SELECTABLE_MODELS,
  MAX_CONTEXT_CHARS: MAX_CONTEXT_CHARS
};
