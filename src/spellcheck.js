// ============================================================================
// Uyghur spell checker for Bilim Hezinisi (renderer-side).
//
// Algorithm — port of Gheyret Kenji's UyghurSpell (https://github.com/gheyret/UyghurSpell)
// translated from C# to JavaScript. Source files studied:
//   _reference/UyghurSpell/UyghurSpell.cs   (TST-based dictionary engine)
//   _reference/UyghurSpell/Uyghur.cs        (UEY alphabet, Sozghuch, IsSozuq vowel set)
//   _reference/UyghurEditPP/ImlaBoya.cs     (live highlighting; word regex)
//   _reference/UyghurEditPP/MainForm.cs     (popup wiring; word-finder regex)
//
// Notes
//   1. IsListed is an exact lookup of the lower-cased word, with Sozghuch (ـ,
//      U+0640) stripped, against the dictionary. The reference uses a Ternary
//      Search Tree because it also wants wildcard-pattern walks; in JS we just
//      use a Set for IsListed and a length-bucketed array for wildcard
//      suggestions — same asymptotic behavior, far simpler to maintain.
//   2. The dictionary is the FULLY INFLECTED form list shipped with
//      UyghurEditPP (~441k entries — every grammatical form is its own entry).
//      Because of that the spell checker does NO suffix stripping or
//      morphological analysis at lookup time. That matches what UyghurSpell
//      does: it has no morphology code at all.
//   3. GetSuggestions / Lookup is wildcard-based, not edit-distance-based:
//        a. all vowels → '?'        (vowel-set comes from Uyghur.IsSozuq)
//        b. for each position i:
//             - insert '?'                (length+1, missed letter)
//             - replace with '?'          (length, one wrong letter)
//             - insert+replace with '?'   (length+1, transposed/inserted)
//             - adjacent pair '??'        (length, two wrong letters)
//             - pair at distance 2,3 '?…?'(length, two non-adjacent letters)
//      Candidates are then re-ranked by Damerau–Levenshtein distance to the
//      original word (smaller = better) — that's the only place edit distance
//      is used.
//   4. Stem fallback: if no candidates were found via wildcards, the reference
//      truncates the word from the end (lengths n-1, n-2, … down to 3) and
//      returns the first prefix that exists in the dictionary. We do the same.
//   5. Word boundary regex matches the UyghurEditPP "WordFinder" pattern:
//        [<UEY-letters>]+([-]?[<UEY-letters>]+)*
//      so compound words joined with "-" are treated as one token and the
//      Tatweel/Sozghuch is included in the alphabet for matching purposes.
// ============================================================================

(function () {
  'use strict';

  // -----  Uyghur alphabet & helpers (from Uyghur.cs)  -----
  const SOZGHUCH = 'ـ'; // ـ — Arabic Tatweel
  // UEYHerpler from Uyghur.cs line 301
  const UEY_LETTERS = 'ـئابتجخدرزسشغفقكلمنوىيپچژڭگھۆۇۈۋېەلا';
  // IsSozuq → vowels for the wildcard-replacement step
  const VOWELS = new Set(['ا','ە','و','ۇ','ۆ','ۈ','ې','ى']);
  // Word regex from MainForm.cs line 93: [<UEY>]+([-]?[<UEY>]+)*
  const WORD_RE = new RegExp('[' + UEY_LETTERS + "'’]+(?:[-]?[" + UEY_LETTERS + "'’]+)*", 'gu');
  // Cap dictionary suggestions exactly the way Lookup() does (line 313)
  const MAX_SUGGESTIONS = 10;

  // -----  Loaded data  -----
  let dict = null;                 // Set<string>  — kept for fast IsListed checks
  let engine = null;               // SymSpell instance — backs lookup() suggestions
  let corrections = null;          // Map<string, string>  (Toghrisi)
  let userWords = null;            // Set<string>
  let isLoaded = false;
  let loadingPromise = null;

  // dbGetSetting returns {success, value} in this app — unwrap.
  function unwrapSetting(res, fallback) {
    if (res == null) return fallback;
    if (typeof res === 'object' && 'value' in res) return res.value != null ? res.value : fallback;
    return res;
  }

  function normalizeForLookup(word) {
    return String(word || '').replace(new RegExp(SOZGHUCH, 'g'), '').trim().toLowerCase();
  }

  async function loadDictionary() {
    if (isLoaded) return;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const wordsText = await window.electron.loadSpellDict();
        if (!wordsText) { console.error('Spell dictionary not found'); return; }

        // Build the IsListed Set + the SymSpell engine in a single pass.
        if (typeof window.SymSpell !== 'function') {
          console.error('[spellcheck] SymSpell engine not loaded — check that symspell.js is loaded before spellcheck.js');
          return;
        }
        dict = new Set();
        engine = new window.SymSpell({ maxEditDistance: 2, prefixLength: 7 });

        let p = 0;
        const len = wordsText.length;
        while (p < len) {
          let nl = wordsText.indexOf('\n', p);
          if (nl < 0) nl = len;
          let w = wordsText.slice(p, nl);
          p = nl + 1;
          if (!w) continue;
          if (w.charCodeAt(w.length - 1) === 13) w = w.slice(0, -1); // CR
          w = w.trim();
          if (!w) continue;
          if (dict.has(w)) continue;
          dict.add(w);
          engine.createDictionaryEntry(w, 1);
        }

        const corrJSON = await window.electron.loadSpellCorrections();
        corrections = new Map();
        if (corrJSON) {
          try {
            const obj = JSON.parse(corrJSON);
            for (const [k, v] of Object.entries(obj)) corrections.set(k, v);
          } catch (e) { console.error('Spell corrections JSON parse failed:', e); }
        }

        const userRaw = await window.electron.dbGetSetting('spell_user_words', '');
        const userStr = unwrapSetting(userRaw, '') || '';
        userWords = new Set(String(userStr).split(',').map(s => s.trim()).filter(Boolean));

        isLoaded = true;
        const dt = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0).toFixed(0);
        console.log(`[spellcheck] loaded ${dict.size} words + ${corrections.size} corrections in ${dt} ms`);
      } catch (e) {
        console.error('Failed to load spell dictionary:', e);
      } finally {
        loadingPromise = null;
      }
    })();
    return loadingPromise;
  }

  // -----  IsListed (UyghurSpell.cs:87)  -----
  function isCorrect(word) {
    if (!isLoaded || !dict) return true;       // fail open while loading
    const w = normalizeForLookup(word);
    if (!w || w.length < 2) return true;
    // Pure digits / pure Latin → don't spell-check.
    if (/^[\d\s]+$/.test(w)) return true;
    if (/^[a-zA-Z'’-]+$/.test(w)) return true;
    // Anything that contains a non-Uyghur letter → leave alone (e.g. Arabic
    // text inserted from Quran picker, Cyrillic, etc).
    if (!new RegExp('^[' + UEY_LETTERS + "'’-]+$", 'u').test(w)) return true;

    if (dict.has(w)) return true;
    if (userWords && userWords.has(w)) return true;
    // Compound word ("foo-bar"): each half must exist independently.
    if (w.indexOf('-') !== -1) {
      const parts = w.split('-').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2 && parts.every(p =>
            dict.has(p) || (userWords && userWords.has(p)))) return true;
    }
    return false;
  }

  // -----  Lookup — backed by SymSpell (Symmetric Delete) for proper edit-
  //        distance suggestions including insertions, deletions, substitutions
  //        and transpositions. Replaces the previous wildcard-pattern engine,
  //        which missed insertion typos like ئەۋىج → ئەۋج.  -----
  function lookup(soz) {
    if (!isLoaded || !engine) return [];
    const original = normalizeForLookup(soz);
    if (!original || original.length < 2) return [];

    const sugs = engine.lookup(original, window.SymSpellVerbosity.ALL, 2);

    const out = [];
    for (const s of sugs) {
      if (s.term === original) continue;
      out.push(s.term);
      if (out.length >= MAX_SUGGESTIONS) break;
    }

    // Stem fallback (kept from the original UyghurSpell behavior) — if no
    // candidates within edit distance 2, try shorter prefixes.
    if (out.length === 0) {
      let n = original.length - 1;
      while (n >= 3) {
        const stem = original.slice(0, n);
        if (dict.has(stem) && !out.includes(stem)) {
          out.push(stem);
          break;
        }
        n--;
      }
    }
    return out;
  }

  // -----  GetSuggestions (called from popup) — corrections + lookup  -----
  function getSuggestions(word, maxSuggestions) {
    if (!isLoaded) return [];
    maxSuggestions = maxSuggestions || MAX_SUGGESTIONS;
    const lower = normalizeForLookup(word);
    const seen = new Set();
    const out = [];

    // 1. corrections.json — Toghrisi() in MainForm.cs:560
    if (corrections && corrections.has(lower)) {
      const fix = corrections.get(lower);
      if (fix && !seen.has(fix)) { seen.add(fix); out.push(fix); }
    }

    // 2. Lookup() candidates
    for (const cand of lookup(lower)) {
      if (out.length >= maxSuggestions) break;
      if (!seen.has(cand)) { seen.add(cand); out.push(cand); }
    }
    return out;
  }

  // ============================================================================
  // Editor integration
  // ============================================================================

  window.notesRunSpellCheck = async function () {
    if (!window.S || !window.S.notes || !window.S.notes.spellCheckEnabled) return;
    await loadDictionary();
    if (!isLoaded) return;

    const editor = document.getElementById('notes-editor');
    if (!editor) return;

    // Strip prior marks, then re-scan from clean state.
    notesClearSpellCheckInternal(editor);

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) {
      const pe = n.parentElement;
      if (pe && (pe.closest('.spell-popup') ||
                 pe.closest('[data-ref-insert="1"]') ||
                 pe.closest('.spell-error'))) continue;
      if (!n.nodeValue || n.nodeValue.trim().length < 2) continue;
      textNodes.push(n);
    }

    for (const tn of textNodes) {
      const text = tn.nodeValue;
      const errors = [];
      WORD_RE.lastIndex = 0;
      let m;
      while ((m = WORD_RE.exec(text)) !== null) {
        const word = m[0];
        if (word.length < 2) continue;
        if (!isCorrect(word)) {
          errors.push({ start: m.index, end: m.index + word.length, word });
        }
      }
      if (!errors.length) continue;

      const parent = tn.parentNode;
      if (!parent) continue;
      let currentNode = tn;

      // Walk errors end → start so offsets stay valid.
      for (let i = errors.length - 1; i >= 0; i--) {
        const err = errors[i];
        const before = currentNode.nodeValue.slice(0, err.start);
        const middle = currentNode.nodeValue.slice(err.start, err.end);
        const after  = currentNode.nodeValue.slice(err.end);

        const span = document.createElement('span');
        span.className = 'spell-error';
        span.setAttribute('data-spell-word', err.word);
        span.textContent = middle;
        // mousedown (not click) — contenteditable steals click events for
        // caret placement before our handler runs.
        span.addEventListener('mousedown', onSpellErrorMouseDown);

        if (after) {
          const afterNode = document.createTextNode(after);
          parent.insertBefore(afterNode, currentNode.nextSibling);
        }
        parent.insertBefore(span, currentNode.nextSibling);
        currentNode.nodeValue = before;
      }
    }
  };

  function notesClearSpellCheckInternal(editor) {
    if (!editor) return;
    const spans = editor.querySelectorAll('.spell-error');
    for (const s of spans) {
      s.removeEventListener('mousedown', onSpellErrorMouseDown);
      const parent = s.parentNode;
      if (!parent) continue;
      while (s.firstChild) parent.insertBefore(s.firstChild, s);
      parent.removeChild(s);
    }
    editor.normalize();
    closePopup();
  }

  window.notesClearSpellCheck = function () {
    const editor = document.getElementById('notes-editor');
    if (editor) notesClearSpellCheckInternal(editor);
  };

  // ============================================================================
  // Popup
  // ============================================================================

  let activePopup = null;
  let activeOutsideHandler = null;

  function closePopup() {
    if (activePopup && activePopup.parentNode) activePopup.parentNode.removeChild(activePopup);
    activePopup = null;
    if (activeOutsideHandler) {
      document.removeEventListener('mousedown', activeOutsideHandler, true);
      activeOutsideHandler = null;
    }
  }

  function unwrapSpan(span) {
    span.removeEventListener('mousedown', onSpellErrorMouseDown);
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  }

  function onSpellErrorMouseDown(e) {
    // contenteditable will otherwise place the caret inside the span and
    // potentially scroll, hiding our popup. Block that.
    e.preventDefault();
    e.stopPropagation();

    const span = e.currentTarget;
    const word = span.getAttribute('data-spell-word');
    if (!word) return;

    closePopup();

    const suggestions = getSuggestions(word);

    const popup = document.createElement('div');
    popup.className = 'spell-popup';
    popup.setAttribute('dir', 'rtl');

    let html = `<div class="spell-popup-header">«${escHtml(word)}» ئۈچۈن تەۋسىيە:</div>`;
    if (suggestions.length) {
      for (const sug of suggestions) {
        html += `<div class="spell-popup-item" data-correction="${escAttr(sug)}">${escHtml(sug)}</div>`;
      }
    } else {
      html += `<div class="spell-popup-empty">تەۋسىيە تېپىلمىدى</div>`;
    }
    html += `<div class="spell-popup-item spell-popup-ignore" data-action="ignore">بۇ سۆزنى ئاتلاش</div>`;
    html += `<div class="spell-popup-item spell-popup-addword" data-action="addword">لۇغەتكە قوشۇش</div>`;
    popup.innerHTML = html;

    // Position: fixed, anchored to bottom-right of the misspelled word for RTL.
    const rect = span.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
    document.body.appendChild(popup);
    activePopup = popup;

    popup.addEventListener('mousedown', ev => ev.stopPropagation());

    popup.querySelectorAll('.spell-popup-item').forEach(item => {
      item.addEventListener('mousedown', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const action = item.getAttribute('data-action');
        const correction = item.getAttribute('data-correction');

        if (correction) {
          span.textContent = correction;
          span.classList.remove('spell-error');
          unwrapSpan(span);
          if (typeof window.notesMarkDirty === 'function') window.notesMarkDirty();
        } else if (action === 'ignore') {
          span.classList.remove('spell-error');
          unwrapSpan(span);
        } else if (action === 'addword') {
          const w = normalizeForLookup(word);
          if (!userWords) userWords = new Set();
          userWords.add(w);
          try {
            await window.electron.dbSetSetting('spell_user_words', Array.from(userWords).join(','));
          } catch (e) { /* persistence is best-effort */ }
          span.classList.remove('spell-error');
          unwrapSpan(span);
        }
        closePopup();
      });
    });

    activeOutsideHandler = function (ev) {
      if (!popup.contains(ev.target)) closePopup();
    };
    setTimeout(() => {
      if (activeOutsideHandler) document.addEventListener('mousedown', activeOutsideHandler, true);
    }, 10);
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function escAttr(s) { return escHtml(s); }

  function isReady() { return isLoaded; }
  window.SpellCheck = { loadDictionary, isCorrect, getSuggestions, isReady };
})();
