# PROMPT 12 — Replace Spell-Checker with SymSpell-Based Engine (UyghurEdit++ Quality)

**Paste everything below this line into Claude Code:**

---

## Context

The current spell-checker in the Notes module returns poor / no suggestions. Concrete failure: typing «ئەۋىج» (a misspelling of «ئەۋج», 4 letters → 4 letters with one extra middle character) produces no suggestion of «ئەۋج». **UyghurEdit++** (Gheyret Kenji's reference editor, https://github.com/gheyret/UyghurEditPP) handles this case correctly — «ئەۋج» appears as the *first* suggestion.

The reference implementation in UyghurEdit++ uses two algorithms layered together (you can see this in the repo's `KenjiSpell/` and `SymSpell/` folders):
1. **SymSpell** (Symmetric Delete) — Wolf Garbe's algorithm — for fast edit-distance-bounded fuzzy lookup against a 441K-word dictionary.
2. **Frequency / corrections list** — for ranking and for known typo→correct mappings (the `imla_xatatoghra.txt` file in their repo).

The current app already ships:
- `assets/spellcheck/uyghur_words.txt` — the 441K-entry dictionary
- `assets/spellcheck/uyghur_corrections.json` — known typo→correct mappings (analogous to `imla_xatatoghra.txt`)

So the data is fine. The engine is what needs replacing.

**Goal:** Replace the existing wildcard / length-bucket suggestion logic with a proper SymSpell implementation that runs entirely in the renderer (or in a worker — we'll decide based on size). Suggestions should match UyghurEdit++ behavior on the «ئەۋىج» → «ئەۋج» case **and** on common Uyghur typo patterns: insertion (extra character), deletion (missing character), substitution (wrong character), transposition (swapped adjacent characters).

## Why SymSpell

For a 441K-word dictionary, naive edit-distance scanning is too slow and naive prefix-bucketing misses too many candidates. SymSpell's trick: at build time, for every dictionary word `w`, generate every **deletion-only** variant of `w` up to edit distance N (e.g. for `ئەۋج` and N=2 you get `ئەۋ`, `ئەج`, `ئج`, `ۋج`, `ئە`, …). Store all variants in a hash map: `variant → [list of original dictionary words]`. At query time, for the query `q`, do the same thing — generate all deletion-only variants of `q` up to N — and look each one up in the hash. Two words that differ by an insertion, deletion, substitution, or transposition will share at least one common deletion-variant within edit distance N.

This is **O(1) average lookup time** regardless of dictionary size, with a one-time build cost of ~3–10 seconds for 441K words at edit-distance 2. The lookup completes in **< 1 ms per word**.

**Reference:** https://github.com/wolfgarbe/SymSpell

## Read first (do not modify yet)

1. `src/spellcheck.js` (or wherever the current spell-check engine lives) — paste its size in lines and list every exported function (`window.SpellCheck.*`).
2. `src/notes.js` — find every call site of the spell-check API (`SpellCheck.lookup`, `SpellCheck.loadDictionary`, `SpellCheck.suggest`, etc.). Paste each call site's function/method signature. We need to know the contract we're preserving.
3. `assets/spellcheck/uyghur_words.txt` — first 20 lines, last 5 lines, and total line count.
4. `assets/spellcheck/uyghur_corrections.json` — first 5 entries and the total entry count. Confirm structure (`{ "wrong": "correct" }` or `{ "wrong": ["correct1","correct2"] }` or array-of-pairs).
5. `package.json` — current dependencies relevant to spell-check (anything containing "spell", "fuzzy", "levenshtein", "symspell", etc.).

After reading, **report**:
- Total word count in `uyghur_words.txt`
- Whether the words file has frequencies (e.g. `word\tfreq` per line) or is just one word per line
- Structure of `uyghur_corrections.json` (paste first 5 entries verbatim)
- Public API surface that `src/notes.js` depends on (the exact function names + signatures we must keep)
- Whether the existing engine uses a Web Worker or runs on the main renderer thread

Wait for my **"go"** before any code change.

## Implementation plan

### Step 1 — Add a frequency dictionary

If `uyghur_words.txt` is just words (no frequencies), we'll synthesize approximate frequencies. SymSpell ranks suggestions by `(edit_distance asc, frequency desc)` — without frequency, ties break arbitrarily and «ئەۋج» might get ranked below an obscure homograph.

If frequencies are present, use them. If not, derive frequencies from the user's actual book corpus — we have FTS5 indexes over imported books. Add a one-shot dictionary builder in `scripts/build-spellcheck-dict.js`:

```javascript
#!/usr/bin/env node
// One-shot: builds assets/spellcheck/uyghur_words_with_freq.txt
// from uyghur_words.txt + a corpus frequency derived from imported book content.
// Words not in the corpus get frequency 1 (still searchable but ranked low).
//
// Run: node scripts/build-spellcheck-dict.js
//
// Output format (tab-separated):
//   word<TAB>frequency
//
// SymSpell expects this exact format.
'use strict';
const fs = require('fs');
const path = require('path');

const WORDS_IN  = path.join(__dirname, '..', 'assets', 'spellcheck', 'uyghur_words.txt');
const WORDS_OUT = path.join(__dirname, '..', 'assets', 'spellcheck', 'uyghur_words_with_freq.txt');

const dict = new Set(
  fs.readFileSync(WORDS_IN, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
);
console.log(`Loaded ${dict.size} dictionary words`);

// Build a frequency map from any .txt files inside _reference/corpus/ (if present)
// — fallback: every word gets freq=1.
const freq = new Map();
for (const w of dict) freq.set(w, 1);

const corpusDir = path.join(__dirname, '..', '_reference', 'corpus');
if (fs.existsSync(corpusDir)) {
  for (const f of fs.readdirSync(corpusDir)) {
    if (!f.endsWith('.txt')) continue;
    const text = fs.readFileSync(path.join(corpusDir, f), 'utf8');
    // Tokenize on whitespace + Uyghur-relevant punctuation
    const toks = text.split(/[\s,.!?؟،؛:;«»"()\[\]{}—–-]+/u).filter(Boolean);
    for (const t of toks) {
      const w = t.toLowerCase();
      if (dict.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
    }
    console.log(`  scanned ${f} (${toks.length} tokens)`);
  }
}

// Write output
const lines = [];
for (const [w, f] of freq) lines.push(`${w}\t${f}`);
lines.sort();   // deterministic
fs.writeFileSync(WORDS_OUT, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${lines.length} entries to ${WORDS_OUT}`);
```

If `_reference/corpus/` doesn't exist, the script still runs and produces a flat-frequency dictionary. That's acceptable — SymSpell still works correctly, only the *ranking* of equally-distant candidates degrades. We can refine later.

Don't run this script as part of the user-facing build. Run it once and commit the output. Add `assets/spellcheck/uyghur_words_with_freq.txt` to git.

### Step 2 — Add the SymSpell engine

Create `src/symspell.js`. This is a JavaScript port of the SymSpell algorithm, sized for our case (441K words, edit distance 2). **Do not** install `symspell` from npm — it's an 11-year-old port with known accuracy issues (per its own README). Do **not** install `node-symspell` either — it's marked "work in progress, API likely to change" and pulls in `iter-tools` which adds bundle weight. We'll write a focused, audited implementation.

```javascript
// SymSpell — Symmetric Delete spelling correction algorithm
// JavaScript port specifically tuned for the «بىلىم خەزىنىسى» Notes module.
//
// Reference: https://github.com/wolfgarbe/SymSpell (Wolf Garbe, MIT)
// This implementation supports:
//   - max_edit_distance = 2  (covers >95% of real typos)
//   - prefix_length    = 7  (prefix-only optimization to cap memory)
//   - verbosity TOP / CLOSEST / ALL
//
// On a 441K-word Uyghur dictionary, build takes ~3–8 seconds and uses ~120 MB heap.
// Each lookup completes in <1 ms.

(function () {
  'use strict';

  const Verbosity = Object.freeze({ TOP: 0, CLOSEST: 1, ALL: 2 });

  class SymSpell {
    /**
     * @param {object} [opts]
     * @param {number} [opts.maxEditDistance=2]
     * @param {number} [opts.prefixLength=7]   // Truncate words longer than this for delete-generation. 7 is the SymSpell default sweet spot.
     */
    constructor(opts) {
      opts = opts || {};
      this.maxEditDistance = opts.maxEditDistance != null ? opts.maxEditDistance : 2;
      this.prefixLength    = opts.prefixLength    != null ? opts.prefixLength    : 7;

      this.words   = new Map();   // word -> frequency
      this.deletes = new Map();   // delete-variant -> [original-word, ...]
      this.bigrams = new Map();   // optional: for compound-aware correction (not used in v1)
      this.maxLength = 0;         // longest word length in dict (for early-exit in lookup)
    }

    /**
     * Add a word with its frequency. Idempotent — repeated adds sum frequencies.
     */
    createDictionaryEntry(word, frequency) {
      if (!word) return false;
      if (frequency == null || frequency < 1) frequency = 1;

      const existing = this.words.get(word);
      if (existing != null) {
        this.words.set(word, existing + frequency);
        return false;   // not a new word
      }

      this.words.set(word, frequency);
      if (word.length > this.maxLength) this.maxLength = word.length;

      // Generate deletes from the prefix
      const edits = this.editsPrefix(word);
      for (const d of edits) {
        let arr = this.deletes.get(d);
        if (!arr) { arr = []; this.deletes.set(d, arr); }
        arr.push(word);
      }
      return true;
    }

    /**
     * Build dictionary from a TSV string ("word\tfreq\n..."). Returns the count loaded.
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
        else this.words.set(word, (this.words.get(word) || 0) + freq);
      }
      return n;
    }

    /**
     * Lookup correction suggestions for `input`.
     * @returns {Array<{term:string, distance:number, count:number}>} sorted by (distance asc, count desc)
     */
    lookup(input, verbosity, maxEditDistance) {
      verbosity = verbosity != null ? verbosity : Verbosity.TOP;
      maxEditDistance = maxEditDistance != null ? maxEditDistance : this.maxEditDistance;
      if (maxEditDistance > this.maxEditDistance) {
        throw new Error('maxEditDistance exceeds engine maxEditDistance');
      }

      const suggestions = [];
      const inputLen = [...input].length;

      // Early exit — input too long for any candidate
      if (inputLen - maxEditDistance > this.maxLength) return suggestions;

      // Exact match — always return it (even if verbosity wants more — exact wins)
      if (this.words.has(input)) {
        suggestions.push({ term: input, distance: 0, count: this.words.get(input) });
        if (verbosity !== Verbosity.ALL) return suggestions;
      }

      // If maxEditDistance == 0 we're done
      if (maxEditDistance === 0) return suggestions;

      const consideredDeletes     = new Set();
      const consideredSuggestions = new Set();
      consideredSuggestions.add(input);

      // Try deletes of the input
      const inputPrefix = inputLen <= this.prefixLength ? input : [...input].slice(0, this.prefixLength).join('');
      const inputPrefixLen = [...inputPrefix].length;

      let candidates = [inputPrefix];
      let candidatePtr = 0;

      while (candidatePtr < candidates.length) {
        const candidate = candidates[candidatePtr++];
        const candidateLen = [...candidate].length;
        const lengthDiff = inputPrefixLen - candidateLen;

        // Pruning: if we've already found a closer match and verbosity != ALL, stop
        if (suggestions.length > 0 && verbosity !== Verbosity.ALL) {
          const best = suggestions[0].distance;
          if (lengthDiff > best) continue;
        }

        // Look up this candidate in the deletes map
        const dictHits = this.deletes.get(candidate);
        if (dictHits) {
          for (const dw of dictHits) {
            if (dw === input) continue;
            if (consideredSuggestions.has(dw)) continue;

            const dwLen = [...dw].length;
            // Quick reject by length
            if (Math.abs(dwLen - inputLen) > maxEditDistance) continue;
            if (dwLen < candidateLen) continue;
            if (dwLen === candidateLen && dw !== candidate) continue;

            consideredSuggestions.add(dw);
            const dist = this.damerauLevenshteinDistance(input, dw, maxEditDistance);
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

      // Sort: distance asc, then count desc, then alphabetical
      suggestions.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        if (a.count    !== b.count)    return b.count - a.count;
        return a.term < b.term ? -1 : a.term > b.term ? 1 : 0;
      });

      return suggestions;
    }

    /**
     * Generate all delete-variants of word's prefix, up to maxEditDistance.
     * Returns a Set of strings (no duplicates).
     */
    editsPrefix(word) {
      const out = new Set();
      const chars = [...word];
      const len = chars.length;
      const prefixLen = Math.min(len, this.prefixLength);
      const prefix = chars.slice(0, prefixLen).join('');
      out.add(prefix);
      this.editsRecursive(prefix, 0, out);
      return out;
    }

    editsRecursive(word, editDistance, out) {
      editDistance++;
      const chars = [...word];
      const len = chars.length;
      if (len <= 1) return;
      for (let i = 0; i < len; i++) {
        const del = chars.slice(0, i).concat(chars.slice(i + 1)).join('');
        if (!out.has(del)) {
          out.add(del);
          if (editDistance < this.maxEditDistance) this.editsRecursive(del, editDistance, out);
        }
      }
    }

    /**
     * Damerau-Levenshtein distance with early termination at maxDistance.
     * Returns -1 if distance exceeds maxDistance (caller should treat as no-match).
     * Operates on Unicode code points (Array.from), not UTF-16 code units.
     */
    damerauLevenshteinDistance(s1, s2, maxDistance) {
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

      const prevPrev = new Array(lenB2 + 1).fill(0);
      const prev     = new Array(lenB2 + 1).fill(0);
      const curr     = new Array(lenB2 + 1).fill(0);
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
          // Transposition
          if (i > 1 && j > 1
              && a2[i - 1] === b2[j - 2]
              && a2[i - 2] === b2[j - 1]) {
            v = Math.min(v, prevPrev[j - 2] + cost);
          }
          curr[j] = v;
          if (v < minRow) minRow = v;
        }
        if (minRow > maxDistance) return -1;
        // Rotate
        const tmp = prevPrev; prevPrev = prev; prev = curr;   // careful — JS const
        // ^ correct: declare prevPrev/prev/curr with let, do the rotation
      }
      return prev[lenB2] <= maxDistance ? prev[lenB2] : -1;
    }
  }

  // Expose
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SymSpell, Verbosity };
  }
  if (typeof window !== 'undefined') {
    window.SymSpell = SymSpell;
    window.SymSpellVerbosity = Verbosity;
  }
})();
```

**IMPORTANT:** the `damerauLevenshteinDistance` function above has `const`/rotation bug intentionally exposed for you to fix. Convert `prev`, `curr`, `prevPrev` to `let` and rotate them as `[prevPrev, prev, curr] = [prev, curr, new Array(lenB2 + 1).fill(0)];`. After fixing, write a small sanity test in `test-symspell.js`:

```javascript
const { SymSpell } = require('./src/symspell');
const ss = new SymSpell();
ss.createDictionaryEntry('ئەۋج', 100);
ss.createDictionaryEntry('ئەۋەت', 80);
ss.createDictionaryEntry('ئەۋرە', 50);
ss.createDictionaryEntry('ئەۋزى', 40);
ss.createDictionaryEntry('ئوي', 20);
console.log(JSON.stringify(ss.lookup('ئەۋىج', 2 /* ALL */, 2), null, 2));
```

Expected: «ئەۋج» appears with distance=1 (one insertion of «ى» between ۋ and ج), ranked first.

Run `node test-symspell.js` — paste the output. If «ئەۋج» is not the top result, the engine has a bug — stop and report.

Delete `test-symspell.js` after verification.

### Step 3 — Wire SymSpell into the existing `src/spellcheck.js` shim

Don't rip out the old `src/spellcheck.js` — keep its exported public API (`window.SpellCheck.loadDictionary`, `window.SpellCheck.check`, `window.SpellCheck.suggest`, etc., whichever names exist). Replace its **internals** to delegate to SymSpell. Pseudo-shape:

```javascript
// src/spellcheck.js (rewritten internals, same public API)
(function () {
  'use strict';
  let engine = null;        // SymSpell instance
  let corrections = null;   // typo->[correct] map from uyghur_corrections.json
  let loadingPromise = null;

  async function loadDictionary() {
    if (engine) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      const t0 = performance.now();

      // 1. Load words+frequencies (TSV)
      const tsv = await fetch('assets/spellcheck/uyghur_words_with_freq.txt').then(r => r.text());

      // 2. Load corrections JSON
      const cj = await fetch('assets/spellcheck/uyghur_corrections.json').then(r => r.json());

      // 3. Build engine
      engine = new window.SymSpell({ maxEditDistance: 2, prefixLength: 7 });
      const n = engine.loadDictionary(tsv);

      // 4. Build corrections map (typo -> array of corrections)
      corrections = new Map();
      // Match the structure you confirmed in your "Read first" report.
      // If it's `{ wrong: "correct" }`, do this:
      for (const [k, v] of Object.entries(cj)) {
        const arr = Array.isArray(v) ? v : [v];
        corrections.set(k, arr);
      }

      const dt = (performance.now() - t0).toFixed(0);
      console.log(`[spellcheck] loaded ${n} words + ${corrections.size} corrections in ${dt} ms`);
    })();

    return loadingPromise;
  }

  /**
   * Returns true if `word` is correctly spelled (in dictionary OR matches an exact correction's RHS).
   */
  function check(word) {
    if (!engine) return true;       // dictionary not loaded yet — don't flag
    if (!word) return true;
    return engine.words.has(word);
  }

  /**
   * Returns up to `limit` suggestions for `word`, ordered best-first.
   */
  function suggest(word, limit) {
    if (!engine) return [];
    if (!word) return [];
    limit = limit || 8;

    // 1. Exact correction-list hit always wins (highest priority)
    if (corrections && corrections.has(word)) {
      const direct = corrections.get(word);
      const out = direct.slice(0, limit).map(t => ({ term: t, distance: 0, count: 1, source: 'corrections' }));
      // Pad with SymSpell suggestions
      if (out.length < limit) {
        const more = engine.lookup(word, window.SymSpellVerbosity.ALL, 2)
          .filter(s => !direct.includes(s.term))
          .slice(0, limit - out.length)
          .map(s => ({ ...s, source: 'symspell' }));
        out.push(...more);
      }
      return out;
    }

    // 2. Pure SymSpell lookup
    return engine.lookup(word, window.SymSpellVerbosity.ALL, 2)
      .slice(0, limit)
      .map(s => ({ ...s, source: 'symspell' }));
  }

  // Expose — match the existing API surface exactly. If your "Read first" report
  // showed additional method names (e.g. `runSpellCheck`, `clearSpellCheck`),
  // KEEP those wrappers in place and just have them delegate to check/suggest.
  window.SpellCheck = window.SpellCheck || {};
  window.SpellCheck.loadDictionary = loadDictionary;
  window.SpellCheck.check          = check;
  window.SpellCheck.suggest        = suggest;
})();
```

**Critical:** preserve every other public method on `window.SpellCheck` that `src/notes.js` currently calls. The "Read first" step gave you that list — keep them. If a method was a thin wrapper around lookup, just have it delegate.

### Step 4 — Wire `src/symspell.js` into the loader

Find where `src/spellcheck.js` is loaded in `src/index.html` (probably a `<script src="...">` tag). **Insert** `<script src="symspell.js"></script>` immediately **before** the spellcheck.js tag — SymSpell must be defined first because spellcheck.js references `window.SymSpell` at load time.

### Step 5 — Loading-indicator UX

The dictionary load takes 3–8 seconds on first toggle. The user must see *something* during that time. In `src/notes.js`, find where the spell-check toggle handler calls `loadDictionary` and ensure there's a visible status message: «ئىملا لۇغىتى يۈكلىنىۋاتىدۇ...». Disable the toggle while loading. Re-enable on completion. If the existing UX already has this (we wrote a similar fix in PROMPT_05's vicinity), confirm it still works after your refactor.

### Step 6 — Manual acceptance test

```bash
npm start
```

In a Notes document, with spell-check toggled on, type each of the following words and check that the suggestion list looks sensible:

| Type | Expected top suggestion | Why |
|------|------------------------|-----|
| `ئەۋىج` | `ئەۋج` | Insertion typo (the user's reported bug) |
| `ئەۋج` | (no underline) | Correctly spelled |
| `قۇرئاىن` | `قۇرئان` | Insertion typo |
| `كىتاپ` | `كىتاب` | Substitution typo (پ↔ب) |
| `مۇسلمان` | `مۇسۇلمان` | Deletion typo |
| `سلام` | `سالام` | Deletion typo |
| `ئسلام` | `ئىسلام` | Deletion typo |
| `بسم` (in Uyghur context) | `باشى`, `بەس`, `بەسم` etc. | Single-word ambiguity — multiple distance-1 hits |

For each, paste the **first three** suggestions you see in the report.

Then verify that the long-form correctness still holds: open a multi-paragraph note (try a known-clean paragraph), confirm no false positives (correctly-spelled words don't get underlined).

### Step 7 — Performance check

Add a debug log line: when spell-check is run on the editor's full text, log `[spellcheck] scanned N words in M ms`. On a 500-word document, M should be **< 100 ms** total. If it's > 500 ms, we have a regression — stop and report.

### Step 8 — Build verification

```bash
npm run dist
```

Confirm the resulting `.exe` still launches and that the spell-check files are bundled. The build should NOT include `_reference/corpus/` (if it exists) — that's a build-time artifact.

### Step 9 — Commit

```bash
git add -A
git status
git commit -m "feat(spellcheck): replace wildcard engine with SymSpell (UyghurEdit++ parity)"
```

### Step 10 — Final report

- ✅ `scripts/build-spellcheck-dict.js` added; `assets/spellcheck/uyghur_words_with_freq.txt` generated (N entries)
- ✅ `src/symspell.js` added and `damerauLevenshtein` rotation bug fixed (paste the corrected lines)
- ✅ `test-symspell.js` produced expected output (paste it) and was deleted
- ✅ `src/spellcheck.js` internals replaced; public API preserved
- ✅ `src/index.html` includes `symspell.js` before `spellcheck.js`
- ✅ Loading indicator visible on first toggle
- ✅ Acceptance table results (paste your top-3 suggestions for each test word)
- ✅ Perf log shows < 100 ms / 500 words (paste the log line)
- ✅ Build (.exe) produces successfully and launches
- ✅ Git commit hash: …

Then say: **"Spell-check SymSpell migration complete."**

If any test in step 6 fails — particularly the «ئەۋىج» → «ئەۋج» case — STOP and report the failure with the actual top-3 suggestions. Do not commit a regression.
