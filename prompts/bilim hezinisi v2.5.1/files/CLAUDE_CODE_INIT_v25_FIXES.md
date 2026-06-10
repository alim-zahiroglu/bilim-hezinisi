# Claude Code — v2.5 Bug Fixes (Init Prompt)

You are continuing work on the **«بىلىم خەزىنىسى»** (Bilim Hezinisi) Electron desktop application. The user has reported **three bugs** in the v2.5 release that must be fixed in the order given.

## App context (refresher)

- **Stack:** Electron + vanilla JavaScript (no React/Vue) + better-sqlite3 + FTS5
- **Layout:** RTL (right-to-left), all UI strings in Uyghur
- **Modules involved in this fix series:**
  - `src/notes.js` + `src/spellcheck.js` (Notes module + spell-checker)
  - `src/quran.js` + `database.js` (Quran reader + Quran search)
  - `scripts/seed-quran.js` + `assets/quran/*.json` (Quran data seeding)
  - `assets/spellcheck/uyghur_words.txt` and `uyghur_corrections.json` (dictionary)

## The three bugs

### Bug 1 — Spell-checker gives poor / missing suggestions
The user typed «ئەۋىج» (a misspelling of «ئەۋج», meaning "peak" / "zenith"). The current spell-checker did **not** suggest «ئەۋج» at all. When the same typo is fed to **UyghurEdit++** (Gheyret Kenji's reference editor), «ئەۋج» appears as the **first** suggestion.

Root cause: the current implementation uses naive wildcard / length-bucket matching with edit-distance 1 that is too restrictive for a 4-letter word against a 441K dictionary. It also has no frequency weighting, so even when candidates are found their order is arbitrary.

Fix direction: replace it with a proper **SymSpell** (Symmetric Delete) implementation — same algorithm UyghurEdit++ uses — with proper frequency weighting and a wider edit-distance budget for short words.

### Bug 2 — Every Sura's first ayah has a duplicated «بِسْمِ ٱللَّهِ»
In every Sura the first ayah currently shows `بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ يَا أَيُّهَا...` even though the basmala is **not** part of ayah 1 in any Sura except Al-Fatiha. The basmala is also shown separately under the Sura title (which is correct and should be kept).

Fix direction: at seed time (or with a one-shot migration), strip the basmala prefix from ayah 1 of every Sura **except Al-Fatiha (sura 1)**. Display logic stays untouched.

### Bug 3 — Quran search box does nothing
The search box shows the placeholder «سۈرە نامى، ئەرەبچە ئايەت ياكى ئۇيغۇرچە تەرجىمە بويىچە ئىزدەش...» but pressing Enter or clicking the search icon produces no results.

Fix direction: wire up the missing event handler / IPC route, render results in the same view, support sura-name search (Uyghur or Arabic) in addition to ayah-text search, and respect the existing «ئىككىسى» / «ئەرەب» / «ئۇيغۇر» language toggle.

## Execution order

| # | File | Bug | Risk | Time |
|---|------|-----|------|------|
| 10 | `PROMPT_10_QURAN_BASMALA_FIX.md` | Bug 2 | Low | 10 min |
| 11 | `PROMPT_11_QURAN_SEARCH_FIX.md`  | Bug 3 | Medium | 20 min |
| 12 | `PROMPT_12_SPELLCHECK_SYMSPELL.md` | Bug 1 | High (largest change) | 45 min |

I'm running them in this order because Bug 2 is a pure data fix that landed on top of v2.5, Bug 3 needs only a small wiring change, and Bug 12 is a substantial replacement of the spell-checker engine and benefits from being last (no other fix depends on it).

## Rules (same as previous prompt series)

1. **Outline before coding.** Before each prompt, read the files mentioned in its "Read first" section and tell me which files you'll change and what the change is. Do **not** modify any file the prompt does not name.
2. **All UI strings stay in Uyghur (RTL).** Never translate Uyghur strings. Never invent new Uyghur strings — copy them exactly as I provide.
3. **Code, comments, variable names → English.** Never inject Uyghur into source code identifiers.
4. **Test after every prompt.** Run `npm start`, exercise the relevant feature, and report what you saw.
5. **If something breaks, stop and ask.** Don't keep stacking changes on top of a broken state.
6. **Commit after each prompt** with a message I'll specify in the prompt itself. One commit per prompt unless I tell you otherwise.
7. **Do not run multiple prompts in parallel.** Wait for me to paste the next one.

Confirm you understand, then I'll paste **PROMPT_10**.
