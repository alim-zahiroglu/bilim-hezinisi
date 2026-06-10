# Bilim Hezinisi v2.4.1 → v2.5.0 — Upgrade Prompts

This is a **sequence of 9 prompts** to be pasted into Claude Code one at a time.

## How to Use

1. Open your project folder in Claude Code (the `BilimHezinisi-SourceCode-2_4_1` folder).
2. Open `PROMPT_01_BACKUP.md`. Copy its **entire contents**. Paste into Claude Code. Wait for completion.
3. **Test the app** — run `npm start` and confirm it still works.
4. Move to `PROMPT_02_*.md` and repeat.
5. **Do not skip prompts** — each builds on the previous one.

## Prompt Order (DO NOT REORDER)

| # | File | What It Does | Risk | Time |
|---|------|--------------|------|------|
| 01 | `PROMPT_01_BACKUP.md` | Create backup + git baseline | None | 2 min |
| 02 | `PROMPT_02_QURAN_OFFLINE.md` | Ship Quran Arabic text in installer (no internet needed) | Low | 5 min |
| 03 | `PROMPT_03_REMOVE_NGRAM.md` | Remove the broken n-gram index, use FTS5 instead | Medium | 10 min |
| 04 | `PROMPT_04_BETTER_SQLITE.md` | Replace `sql.js` with `better-sqlite3` (100x faster) | High | 20 min |
| 05 | `PROMPT_05_NOTES_XSS_FIX.md` | Add HTML sanitization to Notes (security fix) | Low | 5 min |
| 06 | `PROMPT_06_QURAN_SEARCH_FIX.md` | Fix Arabic alif normalization in Quran search | Low | 5 min |
| 07 | `PROMPT_07_NOTES_RACE_FIX.md` | Fix data-loss race condition in Notes auto-save | Low | 5 min |
| 08 | `PROMPT_08_BATCH_IMPORT_FIX.md` | Make batch import 100x faster | Low | 5 min |
| 09 | `PROMPT_09_FINAL_POLISH.md` | UX polish: window state, keyboard shortcuts, etc. | Low | 5 min |

## Critical Rules

1. **After each prompt finishes, test the app:**
   ```
   npm start
   ```
   - Open a book — does it read?
   - Open Quran — does it display?
   - Open Notes — does the editor work?
   - Search for something — does it find results?

2. **If something breaks** after a prompt, tell Claude Code:
   ```
   The previous change broke [describe what broke]. Roll back the changes you made and try a different approach.
   ```

3. **Do not run multiple prompts in parallel.** Wait for one to finish.

4. **Each prompt is independent in scope** but **dependent in order** — prompt 04 assumes prompts 01-03 already ran.

## Final Verification (after all 9 prompts)

Run these commands in order:
```
npm install
npm start                    # Should launch and work normally
npm run dist                 # Should build a working .exe in dist/
```

If anything fails, paste the error to Claude Code and ask it to fix.
