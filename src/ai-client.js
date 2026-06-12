// src/ai-client.js — renderer-side AI helpers + the final window.AI surface.
//
// The networked half of window.AI (ask/askStream/test/key/model/enabled/
// usage) lives in the MAIN process (ai.js) and reaches the renderer as the
// frozen contextBridge object window.AIBridge (see preload.js). This file
// adds the PURE, synchronous helpers ported verbatim from the mobile app's
// js/ai.js — content-type detection, type labels, the context-size budget
// and the per-type example-question chips — and composes everything into a
// single window.AI object so renderer code ported from mobile works
// unchanged. No network, no IPC, no DOM access here.
(function (window) {
  'use strict';

  // Safety ceiling for a single whole-book request — mirrors MAX_CONTEXT_CHARS
  // in ai.js (main process). The reader aligns its "send whole book" threshold
  // with this budget.
  const MAX_CONTEXT_CHARS = 1000000;

  // Mirrors DEFAULT_MODEL / MODEL_FALLBACKS / SELECTABLE_MODELS in ai.js.
  // The authoritative copies live in the main process. STRICT model
  // selection: the main process only ever calls the model the user picked —
  // MODEL_FALLBACKS is kept as mirrored data only and is never used to
  // substitute another model.
  const DEFAULT_MODEL = 'gemini-3.5-flash';
  const MODEL_FALLBACKS = [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite'
  ];
  // Offered in the settings selector. The two flash tiers run on the free
  // quota; gemini-3.1-pro-preview is the PAID tier (needs billing — a free
  // key gets a clear error, never a silent model switch). If an ID changes
  // upstream, adjust here AND in ai.js.
  const SELECTABLE_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite'
  ];
  // Short Uyghur descriptions shown under the settings model selector.
  // Each line ends with the free/paid label — (ھەقسىز) = free,
  // (پۇللۇق …) = paid; the selector derives its option tags from these.
  const MODEL_INFO = {
    'gemini-3.5-flash':       'تەۋسىيە · ئۈنۈمى ياخشى · سۈرئىتى تېز · باھاسى مۇۋاپىق · (ھەقسىز)',
    'gemini-3.1-pro-preview': 'ئۈنۈمى ناھايىتى سۈپەتلىك · سۈرئىتى ئاستا · (پۇللۇق · سېتىۋېلىشىڭىز كېرەك)',
    'gemini-3.1-flash-lite':  'ئۈنۈمى ئادەتتىكىدەك · سۈرئىتى تېز · ئىنتايىن ئەرزان · (ھەقسىز)'
  };

  // ----------------------------------------------------------------
  // Content-type detection (ported verbatim from mobile js/ai.js)
  // ----------------------------------------------------------------

  function detectType(text) {
    const t = String(text || '');
    if (!t.trim()) return 'general';

    // Hadith: Arabic chain words + canonical collection names + Uyghur
    // signals (پەيغەمبىرىمىز / ھەدىس).
    if (/حدثنا\s|أخبرنا\s|أنبأنا\s|عن\s+أبي|عن\s+ابن|روى\s+ع|قال\s+رسول\s+الله/.test(t)
        || /(صحيح\s+(البخاري|مسلم)|سنن\s+(أبي\s+داود|الترمذي|النسائي|ابن\s+ماجه))/.test(t)
        || /پەيغەمبىرىمىز.*ئەلەيھىسسالام|پەيغەمبەر.*ئەلەيھىسسالام|ھەدىس|بۇخارى|تىرمىزى/.test(t)) {
      return 'hadith';
    }

    // Tafsir: explicit Quranic citation + commentary clues.
    if (/﴿[\s\S]*﴾|قال\s+الله\s+تعالى|قول\s+الله\s+تعالى|تعالى\s+قال|سورة\s+/.test(t)
        || /قۇرئان\s+كەرىم|قۇرئاندا|ئايەت|سۈرە|تەپسىر/.test(t)) {
      return 'tafsir';
    }

    // Fiqh: jurisprudence vocabulary in Arabic OR Uyghur.
    if (/مسألة|الحكم\s+الشرعي|اختلف\s+(العلماء|الفقهاء)|الحلال|الحرام|الواجب|المكروه|المباح|مذهب|الإمام/.test(t)
        || /مەسىلە|ھۆكۈم|ھالال|ھارام|پەرز|كىراھەت|مەكروھ|مەزھەب|فىقھ|ئىمام/.test(t)) {
      return 'fiqh';
    }

    // Poetry: heuristic — many short lines suggesting verse layout.
    const lines = t.split('\n').filter(function (l) { return l.trim(); });
    if (lines.length >= 4) {
      const lens = lines.map(function (l) { return l.trim().length; });
      const avg = lens.reduce(function (a, b) { return a + b; }, 0) / lens.length;
      const shortish = lens.filter(function (n) { return n < 60; }).length;
      if (avg < 50 && shortish / lens.length > 0.7) return 'poetry';
    }

    // Political: contemporary politics / current-affairs vocabulary.
    if (/سياسة|حكومة|انتخابات|الحزب|الدولة|الرئيس|الوزير|البرلمان|ئىقتىساد|ھۆكۈمەت|پارتىيە|سايلام|سىياسەت/.test(t)) {
      return 'political';
    }

    // Literary fallback for narrative prose; else general.
    if (/قىسسە|ھېكايە|رومان|ئەدەبىيات|شائىر|يازغۇچى|قىصة|رواية|الأدب/.test(t)) {
      return 'literary';
    }
    return 'general';
  }

  // Human-readable Uyghur label per content type (ported verbatim).
  function typeLabel(t) {
    return ({
      hadith:       'ھەدىس',
      tafsir:       'تەپسىر',
      fiqh:         'فىقھ',
      poetry:       'شېئىر',
      political:    'سىياسىي',
      literary:     'ئەدەبىي',
      translation:  'تەرجىمە',
      topic_search: 'كىتابتىن ئىزدەش',
      term_explain: 'چۈشەندۈرۈش',
      general:      'ئادەتتىكى'
    })[t] || 'ئادەتتىكى';
  }

  // Example questions shown as tappable chips, keyed by the resolved content
  // type (ported verbatim from mobile js/reader.js). The reader panel shows
  // at most two when the question box is focused and empty.
  const EXAMPLE_QUESTIONS = {
    hadith:       ['بۇ ھەدىسنىڭ راۋىيىلىرى كىملەر؟', 'پەند-نەسىھەتى نېمە؟'],
    tafsir:       ['بۇ ئايەتنىڭ نازىل بولۇش سەۋەبى؟', 'قانداق ئەمەلىي ھېكمەت بار؟'],
    fiqh:         ['مەزھەبلەرنىڭ كۆز قارىشى نېمە؟', 'بۇ ھۆكۈمنىڭ دەلىلى نېمە؟'],
    poetry:       ['بۇ شېئىرنىڭ مەنىسى نېمە؟', 'قانداق ئەدەبىي سەنئەت ئىشلىتىلگەن؟'],
    political:    ['ئاساسلىق پىكىر نېمە؟', 'ھەر تەرەپنىڭ كۆز قارىشى قانداق؟'],
    literary:     ['بۇ پارچىنىڭ ئۇچۇرى نېمە؟', 'ئۇسلۇب ئالاھىدىلىكى قانداق؟'],
    translation:  ['ئاددىي ئۇيغۇرچىغا تەرجىمە', 'ئەدەبىي گۈزەل ئۇيغۇرچىغا تەرجىمە'],
    topic_search: ['بۇ تېمىغا مۇناسىۋەتلىك نەقىللەرنى تېپىپ بەر', 'بۇ ھەقتە نېمە دېيىلگەن؟'],
    term_explain: ['بۇ ئاتالغۇنىڭ مەنىسى نېمە؟', 'بۇ كىشى / ئورۇن ھەققىدە چۈشەندۈرۈپ بەر'],
    general:      ['خۇلاسىلەپ بەر', 'ئاددىي قىلىپ چۈشەندۈرۈپ بەر']
  };

  // ----------------------------------------------------------------
  // Compose the final window.AI: the frozen IPC bridge + pure helpers.
  // (contextBridge objects can't be extended, but their function proxies
  // keep working when copied into a plain object.)
  // ----------------------------------------------------------------

  const bridge = window.AIBridge || {};
  window.AI = Object.assign({}, bridge, {
    detectType: detectType,
    typeLabel: typeLabel,
    MAX_CONTEXT_CHARS: MAX_CONTEXT_CHARS,
    DEFAULT_MODEL: DEFAULT_MODEL,
    MODEL_FALLBACKS: MODEL_FALLBACKS,
    SELECTABLE_MODELS: SELECTABLE_MODELS,
    MODEL_INFO: MODEL_INFO,
    EXAMPLE_QUESTIONS: EXAMPLE_QUESTIONS
  });

  if (!window.AIBridge) {
    console.warn('[ai-client] AIBridge not found — AI IPC methods unavailable (preload not loaded?)');
  }
})(window);
