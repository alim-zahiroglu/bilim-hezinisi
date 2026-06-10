// ============================================================================
// SymSpell — Symmetric Delete spelling correction algorithm.
//
// JavaScript port specifically tuned for the Bilim Hezinisi Notes module.
// Reference: https://github.com/wolfgarbe/SymSpell  (Wolf Garbe, MIT)
//
// At build time, every dictionary word generates every deletion-only variant
// of its (length-capped) prefix up to `maxEditDistance` deletions. Variants
// are stored in a Map keyed by the variant, with the originating word(s) in
// the value array. At lookup time, the same deletion-variant generation runs
// over the input word; any dictionary entry that shares a deletion-variant
// with the input is a candidate within edit distance N (insertion / deletion
// / substitution / transposition).
//
// On a 441K-word Uyghur dictionary, build takes ~5–10 s and uses ~150 MB
// heap. Each lookup completes in well under 1 ms.
// ============================================================================

(function () {
  'use strict';

  const Verbosity = Object.freeze({ TOP: 0, CLOSEST: 1, ALL: 2 });

  class SymSpell {
    /**
     * @param {object} [opts]
     * @param {number} [opts.maxEditDistance=2]
     * @param {number} [opts.prefixLength=7]   // Truncate words longer than this for delete-generation. 7 is the SymSpell sweet spot.
     */
    constructor(opts) {
      opts = opts || {};
      this.maxEditDistance = opts.maxEditDistance != null ? opts.maxEditDistance : 2;
      this.prefixLength    = opts.prefixLength    != null ? opts.prefixLength    : 7;

      this.words   = new Map();   // word -> frequency
      this.deletes = new Map();   // delete-variant -> string[] (originating words)
      this.maxLength = 0;
    }

    /**
     * Add a word with its frequency. Idempotent — repeated adds sum frequencies
     * but only generate deletes the first time.
     * @returns {boolean} true iff this was a new word
     */
    createDictionaryEntry(word, frequency) {
      if (!word) return false;
      if (frequency == null || frequency < 1) frequency = 1;

      const existing = this.words.get(word);
      if (existing != null) {
        this.words.set(word, existing + frequency);
        return false;
      }

      this.words.set(word, frequency);
      const wlen = [...word].length;
      if (wlen > this.maxLength) this.maxLength = wlen;

      const edits = this._editsPrefix(word);
      for (const d of edits) {
        let arr = this.deletes.get(d);
        if (!arr) { arr = []; this.deletes.set(d, arr); }
        arr.push(word);
      }
      return true;
    }

    /**
     * Build dictionary from a TSV string ("word\tfreq\n..."). If a line is
     * just a word with no tab, frequency defaults to 1. Returns the count
     * of NEW words added.
     */
    loadDictionary(tsv, termIndex, countIndex) {
      termIndex  = termIndex  != null ? termIndex  : 0;
      countIndex = countIndex != null ? countIndex : 1;
      let n = 0;
      const lines = tsv.split(/\r?\n/);
      for (const ln of lines) {
        if (!ln) continue;
        const parts = ln.split('\t');
        if (parts.length < termIndex + 1) continue;
        const word = parts[termIndex] && parts[termIndex].trim();
        if (!word) continue;
        let freq = 1;
        if (parts.length > countIndex) {
          const f = parseInt(parts[countIndex], 10);
          if (Number.isFinite(f) && f > 0) freq = f;
        }
        if (this.createDictionaryEntry(word, freq)) n++;
      }
      return n;
    }

    /**
     * Lookup correction suggestions for `input`.
     * @param {string} input
     * @param {number} verbosity   one of Verbosity.{TOP, CLOSEST, ALL}
     * @param {number} [maxEditDistance]   defaults to engine's maxEditDistance
     * @returns {Array<{term:string, distance:number, count:number}>} sorted by (distance asc, count desc, alphabetical)
     */
    lookup(input, verbosity, maxEditDistance) {
      if (verbosity == null) verbosity = Verbosity.TOP;
      if (maxEditDistance == null) maxEditDistance = this.maxEditDistance;
      if (maxEditDistance > this.maxEditDistance) {
        throw new Error('maxEditDistance exceeds engine maxEditDistance');
      }

      const suggestions = [];
      const inputChars = [...input];
      const inputLen = inputChars.length;

      if (inputLen - maxEditDistance > this.maxLength) return suggestions;

      // Exact match
      if (this.words.has(input)) {
        suggestions.push({ term: input, distance: 0, count: this.words.get(input) });
        if (verbosity !== Verbosity.ALL) return suggestions;
      }

      if (maxEditDistance === 0) return suggestions;

      const consideredDeletes     = new Set();
      const consideredSuggestions = new Set();
      consideredSuggestions.add(input);

      const inputPrefixChars = inputLen <= this.prefixLength
        ? inputChars
        : inputChars.slice(0, this.prefixLength);
      const inputPrefix = inputPrefixChars.join('');
      const inputPrefixLen = inputPrefixChars.length;

      const candidates = [inputPrefix];
      let candidatePtr = 0;

      while (candidatePtr < candidates.length) {
        const candidate = candidates[candidatePtr++];
        const candidateLen = [...candidate].length;
        const lengthDiff = inputPrefixLen - candidateLen;

        // If we already have a closer match and verbosity != ALL, prune.
        if (suggestions.length > 0 && verbosity !== Verbosity.ALL) {
          const best = suggestions[0].distance;
          if (lengthDiff > best) continue;
        }

        const dictHits = this.deletes.get(candidate);
        if (dictHits) {
          for (const dw of dictHits) {
            if (dw === input) continue;
            if (consideredSuggestions.has(dw)) continue;

            const dwLen = [...dw].length;
            if (Math.abs(dwLen - inputLen) > maxEditDistance) continue;
            if (dwLen < candidateLen) continue;
            if (dwLen === candidateLen && dw !== candidate) continue;

            consideredSuggestions.add(dw);
            const dist = this._damerauLevenshteinDistance(input, dw, maxEditDistance);
            if (dist < 0 || dist > maxEditDistance) continue;

            const count = this.words.get(dw) || 1;
            const sug = { term: dw, distance: dist, count };

            if (verbosity === Verbosity.TOP) {
              if (suggestions.length === 0
                  || dist < suggestions[0].distance
                  || (dist === suggestions[0].distance && count > suggestions[0].count)) {
                suggestions[0] = sug;
              }
            } else if (verbosity === Verbosity.CLOSEST) {
              if (suggestions.length === 0 || dist < suggestions[0].distance) {
                suggestions.length = 0;
                suggestions.push(sug);
              } else if (dist === suggestions[0].distance) {
                suggestions.push(sug);
              }
            } else { // ALL
              suggestions.push(sug);
            }
          }
        }

        // Generate further deletes from this candidate
        if (lengthDiff < maxEditDistance && candidateLen > 1) {
          const chars = [...candidate];
          for (let i = 0; i < chars.length; i++) {
            const next = chars.slice(0, i).concat(chars.slice(i + 1)).join('');
            if (consideredDeletes.has(next)) continue;
            consideredDeletes.add(next);
            candidates.push(next);
          }
        }
      }

      suggestions.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        if (a.count    !== b.count)    return b.count - a.count;
        return a.term < b.term ? -1 : a.term > b.term ? 1 : 0;
      });

      return suggestions;
    }

    // ---------- internals ----------

    _editsPrefix(word) {
      const out = new Set();
      const chars = [...word];
      const prefixLen = Math.min(chars.length, this.prefixLength);
      const prefix = chars.slice(0, prefixLen).join('');
      out.add(prefix);
      this._editsRecursive(prefix, 0, out);
      return out;
    }

    _editsRecursive(word, editDistance, out) {
      editDistance++;
      const chars = [...word];
      const len = chars.length;
      if (len <= 1) return;
      for (let i = 0; i < len; i++) {
        const del = chars.slice(0, i).concat(chars.slice(i + 1)).join('');
        if (!out.has(del)) {
          out.add(del);
          if (editDistance < this.maxEditDistance) {
            this._editsRecursive(del, editDistance, out);
          }
        }
      }
    }

    /**
     * Damerau-Levenshtein distance with early termination at maxDistance.
     * Returns -1 if distance exceeds maxDistance.
     * Operates on Unicode code points (Array.from), not UTF-16 code units.
     */
    _damerauLevenshteinDistance(s1, s2, maxDistance) {
      if (s1 === s2) return 0;
      const a = [...s1], b = [...s2];
      const lenA = a.length, lenB = b.length;
      if (Math.abs(lenA - lenB) > maxDistance) return -1;
      if (lenA === 0) return lenB;
      if (lenB === 0) return lenA;

      // Strip common prefix
      let start = 0;
      while (start < lenA && start < lenB && a[start] === b[start]) start++;

      const a2 = a.slice(start);
      const b2 = b.slice(start);
      const lenA2 = a2.length, lenB2 = b2.length;
      if (lenA2 === 0) return lenB2;
      if (lenB2 === 0) return lenA2;

      let prevPrev = new Array(lenB2 + 1).fill(0);
      let prev     = new Array(lenB2 + 1);
      let curr     = new Array(lenB2 + 1);
      for (let j = 0; j <= lenB2; j++) prev[j] = j;

      for (let i = 1; i <= lenA2; i++) {
        curr[0] = i;
        let minRow = i;
        for (let j = 1; j <= lenB2; j++) {
          const cost = a2[i - 1] === b2[j - 1] ? 0 : 1;
          let v = Math.min(
            curr[j - 1] + 1,        // insertion
            prev[j]     + 1,        // deletion
            prev[j - 1] + cost      // substitution
          );
          if (i > 1 && j > 1
              && a2[i - 1] === b2[j - 2]
              && a2[i - 2] === b2[j - 1]) {
            v = Math.min(v, prevPrev[j - 2] + cost);
          }
          curr[j] = v;
          if (v < minRow) minRow = v;
        }
        if (minRow > maxDistance) return -1;
        // Rotate: prevPrev <- prev, prev <- curr, curr <- (recycled prevPrev)
        const tmp = prevPrev;
        prevPrev = prev;
        prev = curr;
        curr = tmp;
      }
      return prev[lenB2] <= maxDistance ? prev[lenB2] : -1;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SymSpell, Verbosity };
  }
  if (typeof window !== 'undefined') {
    window.SymSpell = SymSpell;
    window.SymSpellVerbosity = Verbosity;
  }
})();
