# Claude Code Task — "Bilim Hezinisi" Desktop: restructure the Reader & Notebook AI functions

Continue on the current branch. **Phased; run each Acceptance check; commit per phase; do NOT merge to `master`.**

## 0. Hard constraints (unchanged)
Offline core never breaks; renderer CSP stays `connect-src 'self'` (Gemini only in main process); preserve CRLF; `node --check` on every changed `.js` + inline `<script>`; never expose the key; English code/comments, Uyghur only in UI strings; minimal diffs; **read before editing — line numbers are approximate.**

## Language convention (read this)
All **instructions** in this document are in English and should be followed as written. **Uyghur text appears only in two places, and must be copied verbatim — do not translate it:**
1. **Literal UI strings** shown inside «...» — button labels, menu items, placeholders. They render in the app's Uyghur RTL UI.
2. **The `PROMPTS` role/task templates** (the multi-line Uyghur strings in Phase 1) — these are the instructions sent to Gemini that must *produce* Uyghur output, matching the existing templates in `ai.js`. Keep them in Uyghur exactly as given.
Everything else (what to change, where, and how to wire it) is English.

## How these AI functions are wired today (so you change the right place)
- **Reader AI panel** (`src/index.html`, `#rai-panel`): quick buttons call `raiQuick(kind)` (~line 2364) which sets the content-type `<select id="rai-type">` and/or a canned question, then `raiAsk()` (~2404) → `raiExecute({type, context, question, deepThink})` → `window.AI.askStream` → main process → **`ai.js → buildPrompt(opts)`** (~line 503), which renders `PROMPTS[opts.type]` (role + task) with `SYSTEM_BASE`, the scope text (`opts.context`), and the optional `opts.question`.
- **Scope** (`تاللانغان` / `بۇ بەت` / `پۈتۈن كىتاب`) is handled by `raiSetScope` and stored in `RAI.context` — already correct; reuse it.
- **Notebook page-Q&A** (`src/index.html`, `naiPageQA(kind)` ~line 2900) calls `naiStream({type, context:noteText, question})`. The menu lives in `src/notes.js` (~lines 216–223). The notebook free chat is `naiChatOpen` / `#nai-chat-input`.

> ⚠️ Gotcha: `raiQuick` currently does `sel.value = '<type>'` then `raiAsk()`. The new function-types below (`summary`, `central_idea`) are **not** options in `#rai-type`, so setting `sel.value` to them would silently fail. For these, call `raiExecute(...)` **directly** with the type (after `raiSetScope(RAI.scope)`), bypassing the select.

---

## Phase 1 — `ai.js`: add high-quality prompt templates for the new/!changed functions

Add these entries to the `PROMPTS` object (same role/task shape as the existing ones). Keep Uyghur task text (these drive Uyghur output).

### 1.1 `summary` (خۇلاسىلەش) — new dedicated template (replaces the old `type:'general' + canned question`)
```js
summary: {
  role: 'سىز تېكىستنى دەل، ئوبيېكتىپ ۋە رەتلىك خۇلاسىلەيدىغان ماھىر ياردەمچىسىز.',
  task:
    'تۆۋەندىكى تېكىستنى (ئوقۇرمەن تاللىغان بۆلەك، ياكى بۇ بەت، ياكى پۈتۈن كىتاب) ئوقۇپ،\n' +
    'ئەڭ مۇھىم نۇقتىلىرىنى ئاجرىتىپ خۇلاسىلەپ بېرىڭ. تەرتىپ:\n' +
    '1. ئومۇمىي مەزمۇننىڭ قىسقىچە بايانى (1–2 جۈملە).\n' +
    '2. ئەڭ مۇھىم نۇقتىلار — رەتلىك، ئېنىق، ھەر بىرى قىسقا.\n' +
    '3. بار بولسا، ئاساسلىق خۇلاسە ياكى نەتىجە.\n' +
    'دىققەت: ئەسلىي مەزمۇنغا تولۇق سادىق بولۇڭ؛ يېڭى مەزمۇن قوشماڭ، تەخمىن قىلماڭ. تېكىست\n' +
    'قايسى ساھەگە (دىنىي، ئەدەبىي، تارىخىي قاتارلىق) تەۋە بولسا شۇ ئاھاڭدا، ساپ ھەم\n' +
    'چۈشىنىشلىك ھازىرقى زامان ئۇيغۇر تىلىدا يېزىڭ.'
}
```

### 1.2 `central_idea` (مەركىزىي ئىدىيەسى) — NEW
```js
central_idea: {
  role: 'سىز ئەسەرنىڭ ماھىيىتى ۋە ئاپتورنىڭ غايىسىنى چوڭقۇر يېشىپ بېرىدىغان ئەدەبىيات ۋە تەپەككۇر تەھلىلچىسىز.',
  task:
    'تۆۋەندىكى تېكىستنىڭ (تاللانغان بۆلەك، بۇ بەت ياكى پۈتۈن كىتاب) مەركىزىي ئىدىيەسىنى\n' +
    'چوڭقۇر تەھلىل قىلىپ بېرىڭ. ئاپتورنىڭ ئورنىدا تۇرۇپ، ئۇنىڭ ئوقۇرمەنگە يەتكۈزمەكچى\n' +
    'بولغان ئاساسلىق ئىدىيە ۋە مەقسىتىنى ئېچىپ بېرىڭ. تەرتىپ:\n' +
    '1. مەركىزىي ئىدىيە — بىر-ئىككى ئېنىق جۈملىدە.\n' +
    '2. ئاپتور بۇ ئەسەر/بۆلەك ئارقىلىق نېمىنى ئىپادىلىمەكچى؟ (مەقسەت، كۆزقاراش، روھ).\n' +
    '3. بۇ ئىدىيە تېكىستتە قانداق ئىپادىلەنگەن — ئاساس ۋە دەلىللەر.\n' +
    '4. ئاساسلىق تېما ۋە ئۇقۇملار (بار بولسا).\n' +
    '5. مۇۋاپىق بولسا، ئىدىيەنىڭ ئەدەبىي / مەنىۋىي / ئىجتىمائىي قىممىتى.\n' +
    'دىققەت: پۈتۈنلەй تېكىستكە ئاساسلىنىپ تەھلىل قىلىڭ، قۇرۇق تەخمىن قىلماڭ. ئاپتور ياكى\n' +
    'مەنبە ئېنىق بولمىسا، ئىدىيەنى تېكىستنىڭ ئۆزىدىن چىقىرىپ بايان قىلىڭ. ساپ، چوڭقۇر،\n' +
    'كەسپىي ھازىرقى زامان ئۇيغۇر تىلىدا يېزىڭ.'
}
```

### 1.3 `term_explain` (ئاتالغۇ چۈشەندۈرۈش) — make it handle BOTH a user-typed term and automatic
Replace the existing `term_explain` task so one template serves both modes (the mode is decided by whether `opts.question` carries a term):
```js
term_explain: {
  role: 'سىز ئاتالغۇ، ئۇقۇم ۋە ئىسىملارنى كونتېكستكە ئۇيغۇن، ئېنىق چۈشەندۈرىدىغان كەسپىي ياردەمچىسىز.',
  task:
    'تۆۋەندىكى تېكىستكە ئاساسلىنىپ ئاتالغۇ چۈشەندۈرۈڭ. ئىككى ئەھۋال بار:\n' +
    '• ئەگەر تۆۋەندە «ئوقۇرمەننىڭ سوئالى» دا مەلۇم بىر ئاتالغۇ كۆرسىتىلگەن بولسا — دەل شۇ\n' +
    '  ئاتالغۇنى، تېكىستتە قايسى مەنىدە كەلگەن بولسا شۇ كونتېكست بويىچە چۈشەندۈرۈڭ، ئاندىن\n' +
    '  (مۇۋاپىق بولسا) ئومۇمىي/كەسپىي مەنىسىنى قوشۇڭ.\n' +
    '• ئەگەر ئاتالغۇ كۆرسىتىلمىگەن بولسا — تېكىستتىن چۈشىنىشكە تەس، ئىزاھاتقا ئەرزىيدىغان\n' +
    '  مۇھىم ئاتالغۇ، ئۇقۇم، ئىسىم ياكى جاي ناملىرىنى ئۆزىڭىز تاللاپ، ھەربىرىنى\n' +
    '  «ئاتالغۇ — ئىزاھات» شەكلىدە تىزىپ چۈشەندۈرۈڭ.\n' +
    'ئىزاھاتلار ئىنتايىن مۇۋاپىق، يىغقان، ئەмма تېكىست كونتېكستىگە ئۇيغۇن بولسۇن؛ ھازىرقى\n' +
    'زامان ئۇيغۇر تىلىدا، كەسپىي ۋە ئەدەبىي ئۇسلۇبتا يېزىلسۇن.\n' +
    'دىققەت: ئەھمىيەتسىز ئادەتتىكى سۆزلەرنى ئالماڭ؛ تەخمىن قىلماڭ، بىلمىگەننى ئاشكارا ئېيتىڭ.'
}
```
(`translation` stays exactly as-is. The old generic “explain” path is no longer used by the reader — see Phase 2.)

**Acceptance:** `buildPrompt({type:'summary'|'central_idea'|'term_explain', context, question})` renders the correct role+task; with a term in `question`, `term_explain` explains that term; with none, it auto-picks terms.

---

## Phase 2 — Reader AI panel (`#rai-panel`): the four functions become خۇلاسىلەش · تەرجىمە · مەركىزىي ئىدىيەسى · ئاتالغۇ چۈشەندۈرۈش

In `src/index.html` `#rai-quick` (~lines 678–683):
1. **Keep** «خۇلاسىلەش» → but route it to the new type. In `raiQuick('summary')`: `raiSetScope(RAI.scope); raiExecute({ type:'summary', context: RAI.context, question:'', deepThink: <#rai-deep> });` (do **not** set `sel.value`).
2. **Remove** the «ئاددىي چۈشەندۈرۈش» button (`raiQuick('explain')`) entirely.
3. **Keep** «تەرجىمە ▾» exactly as-is.
4. **Add** «مەركىزىي ئىدىيەسى» → `raiQuick('central_idea')` → `raiSetScope(RAI.scope); raiExecute({ type:'central_idea', context: RAI.context, question:'', deepThink });`.
5. **«ئاتالغۇ چۈشەندۈرۈش» → two modes** (mirror the translate submenu `#rai-tr-menu` pattern). Clicking it reveals two options:
   - «ئاتالغۇنى يېزىڭ» → focus `#rai-question`, set its placeholder to «چۈشەندۈرمەكچى بولغان ئاتالغۇنى يېزىڭ», set `#rai-type` to `term_explain` (it IS a select option) so the existing `raiAsk()` sends `{type:'term_explain', question:<typed term>}` (manual mode) when the user presses سوراش.
   - «ئاپتوماتىك» → `raiSetScope(RAI.scope); raiExecute({ type:'term_explain', context: RAI.context, question:'', deepThink });` (auto mode).
6. Leave the «✨ Gemini ئىملا تۈزىتىش (تور)» button and the `#rai-type` advanced select as they are.

**Acceptance:** the reader shows exactly خۇلاسىلەش · تەرجىمە ▾ · مەركىزىي ئىدىيەسى · ئاتالغۇ چۈشەندۈرۈش; each works with all three scopes (تاللانغان / بۇ بەت / پۈتۈن كىتاب); term explainer offers manual-term vs automatic; «ئاددىي چۈشەندۈرۈش» is gone.

---

## Phase 3 — Notebook AI (`خاتىرە دەپتىرىم`): differentiate the two “ask” items and add مەركىزىي ئىدىيەسى

1. **Free chat — «سۈنئىي ئىدراكتىن سوراش» (`naiChatOpen` / `#nai-chat-input`):** change the textarea placeholder to
   «سۈنئىي ئىدراكتىن خالىغان سوئالنى سوراڭ. مەزكۇر بەت مەزمۇنى بىلەن مۇناسىۋەتسىز»
   and make the box a bit larger (raise its rows / min-height, keep the existing auto-grow). This is general chat (already uses `chatStream`) — the new placeholder makes that explicit.
2. **«كۆرۈنمە بەت ھەققىدە سوئال سوراش» → «باشقا»:** keep its placeholder «بۇ بەت ھەققىدە سوئالىڭىزنى يېزىڭ...» (no change) — it stays page-scoped.
3. **Add «مەركىزىي ئىدىيەسى» to the page-Q&A submenu** (`src/notes.js`, the submenu currently «خۇلاسىلەش / ئاددىي چۈشەندۈرۈش / باشقا» ~lines 219–223). Add a button → `window.naiPageQA('central_idea')`. Keep خۇلاسىلەش and ئاددىي چۈشەندۈرۈش.
4. Wire it in `naiPageQA(kind)` (`src/index.html` ~line 2900) using the **same new prompt types** as the reader for consistency:
   - `summary` → `naiStream({ type:'summary', context:noteText }, 'كۆرۈنمە بەت', naiPageActions)`
   - `central_idea` → `naiStream({ type:'central_idea', context:noteText }, 'كۆرۈنمە بەت', naiPageActions)`
   - `explain` → keep as today (`type:'general'` + the explain question).
   - `other` → unchanged.

**Acceptance:** «سۈنئىي ئىدراكتىن سوراش» shows the new “any question, unrelated to this page” placeholder in a slightly larger box; the page-Q&A submenu shows خۇلاسىلەش · ئاددىي چۈشەندۈرۈش · مەركىزىي ئىدىيەسى · باشقا, each producing the expected result; «باشقا» still says «بۇ بەت ھەققىدە سوئالىڭىزنى يېزىڭ».

---

## Phase 4 — Verification
1. `node --check` on every changed `.js` + inline `<script>`; CRLF preserved.
2. `npm run dev` GUI pass: reader four functions correct and scope-aware; term manual vs auto; central-idea gives deep authorial-intent analysis; notebook chat placeholder + size; notebook page-Q&A has مەركىزىي ئىدىيەسى; offline core unaffected; DevTools → Network empty.
3. Commit per phase. Leave merging to the owner.

---

### Optional consistency note (only if the owner wants it)
For visual consistency you *could* also remove «ئاددىي چۈشەندۈرۈش» from the notebook page-Q&A submenu (the owner kept it there intentionally). Do **not** change it unless asked.
