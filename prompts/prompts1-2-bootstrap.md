# Claude Code Prompts (English) — Step-by-Step Execution Guide

# Bilim Hezinisi 2.4.1 — Quran \& Notes Modules

> \*\*Usage:\*\* Paste each `PROMPT` block (everything between the opening `---` and closing `---`) into Claude Code \*\*one at a time\*\*. Wait for Claude Code to finish, run `npm start`, verify the acceptance criteria, then paste the next prompt.
>
> \*\*UI text\*\* (buttons, labels, toasts) is intentionally in Uyghur. \*\*Code comments, variable names, commit messages\*\* should stay in English.

\---

## 📋 Execution Checklist

Before you start, open a terminal in the project root (the folder containing `package.json`, `main.js`, etc.) and verify:

```bash
# Check Node.js version (must be ≥ 18)
node -v

# Install existing deps if not done
npm install

# Make sure the \_resources/ folder exists and contains:
#   \_resources/uyghur\_saleh\_v1.0.2-xml.1.xml
#   \_resources/quran-arabic.doc
#   \_resources/UthmanicHafs1 Ex1 Ver12.otf
#   \_resources/UthmanicHafs1B Ex1 Ver12.otf
#   \_resources/قوشۇلىدىغان فونتلار/\*.ttf (9 files)
ls \_resources/

# Launch Claude Code
claude
```

Then paste Prompt 1 below.

\---

# 🚀 PROMPT 1 — Bootstrap, Mode Switcher \& Font Setup

**Paste the block below (starting from `You are working on...`) into Claude Code.**

\---

You are working on **Bilim Hezinisi 2.4.1**, an Electron + sql.js (WASM SQLite) based Uyghur digital library app. This is step **1 of 6** for adding two new modules: **Quran Karim** and **My Notes (Xatire Depterim)**.

## Existing Codebase (do not break any of it)

* `main.js` (\~797 lines) — Electron main process, IPC handlers
* `database.js` (\~1019 lines) — sql.js wrapper with FTS5
* `preload.js` — contextBridge exposing `window.electron.\*` API
* `src/index.html` (\~2130 lines) — all HTML/CSS/JS in one file, global state object `S = {...}`, imperative DOM render pattern
* `assets/` — existing fonts and pdf.js
* `package.json` — Electron 28, `sql.js`, `docx`, `mammoth`, `tesseract.js`

## Your Goal for Step 1

Set up the shared foundation: copy fonts into place, add module tabs to the sidebar, create stub files for the two new modules, and wire up a mode switcher — **without breaking any existing library functionality**.

## Tasks

### Task 1.1 — Copy font files

Create `assets/fonts/` if it doesn't exist, then copy fonts from `\_resources/` to `assets/fonts/` with these exact target names:

|Source (in `\_resources/`)|Target (in `assets/fonts/`)|
|-|-|
|`UthmanicHafs1 Ex1 Ver12.otf`|`UthmanicHafs1.otf`|
|`UthmanicHafs1B Ex1 Ver12.otf`|`UthmanicHafs1B.otf`|
|`قوشۇلىدىغان فونتلار/UKIJEs.ttf`|`UKIJEsliye.ttf`|
|`قوشۇلىدىغان فونتلار/ukijesbold.ttf`|`UKIJEsliyeBold.ttf`|
|`قوشۇلىدىغان فونتلار/ukijtuz.ttf`|`UKIJTuz.ttf`|
|`قوشۇلىدىغان فونتلار/ukijtuzb.ttf`|`UKIJTuzBold.ttf`|
|`قوشۇلىدىغان فونتلار/ukijtuzbold.ttf`|`UKIJTuzHeavy.ttf`|
|`قوشۇلىدىغان فونتلار/ukijtuzbb.ttf`|`UKIJTuzHeavyBold.ttf`|
|`قوشۇلىدىغان فونتلار/ukijtuzk.ttf`|`UKIJTuzKitab.ttf`|
|`قوشۇلىدىغان فونتلار/ukijtuzkb.ttf`|`UKIJTuzKitabBold.ttf`|
|`قوشۇلىدىغان فونتلار/UKIJTuT.ttf`|`UKIJTuzTom.ttf`|

### Task 1.2 — Update package.json

In the `build.files` array, append (preserve all existing entries):

* `"assets/fonts/\*\*/\*"`
* `"assets/seed/\*\*/\*"`
* `"src/quran.js"`
* `"src/quran.css"`
* `"src/notes.js"`
* `"src/notes.css"`
* `"src/ngram.js"`
* `"scripts/\*\*/\*"`

In `dependencies`, add:

* `"node-html-parser": "^6.1.13"`

Then run `npm install`.

### Task 1.3 — Update src/index.html

**a. Add @font-face rules.** Inside the existing `<style>` block in `<head>`, after the existing `@font-face` declarations (around line 11-35), append:

```css
@font-face{font-family:'UthmanicHafs';src:url('../assets/fonts/UthmanicHafs1.otf') format('opentype');font-weight:normal;font-display:swap;}
@font-face{font-family:'UthmanicHafs';src:url('../assets/fonts/UthmanicHafs1B.otf') format('opentype');font-weight:bold;font-display:swap;}
@font-face{font-family:'UKIJ Esliye';src:url('../assets/fonts/UKIJEsliye.ttf') format('truetype');font-weight:normal;font-display:swap;}
@font-face{font-family:'UKIJ Esliye';src:url('../assets/fonts/UKIJEsliyeBold.ttf') format('truetype');font-weight:bold;font-display:swap;}
@font-face{font-family:'UKIJ Tuz';src:url('../assets/fonts/UKIJTuz.ttf') format('truetype');font-weight:normal;font-display:swap;}
@font-face{font-family:'UKIJ Tuz';src:url('../assets/fonts/UKIJTuzBold.ttf') format('truetype');font-weight:bold;font-display:swap;}
@font-face{font-family:'UKIJ Tuz Kitab';src:url('../assets/fonts/UKIJTuzKitab.ttf') format('truetype');font-weight:normal;font-display:swap;}
@font-face{font-family:'UKIJ Tuz Kitab';src:url('../assets/fonts/UKIJTuzKitabBold.ttf') format('truetype');font-weight:bold;font-display:swap;}
@font-face{font-family:'UKIJ Tuz Tom';src:url('../assets/fonts/UKIJTuzTom.ttf') format('truetype');font-weight:normal;font-display:swap;}
```

**b. Add mode-tabs CSS.** Inside the same `<style>` block, at the bottom, append:

```css
.mode-tabs { display:flex; flex-direction:column; padding:8px; gap:4px; border-bottom:0.5px solid var(--border); margin-bottom:6px; }
.mt { padding:8px 12px; border-radius:var(--radius2); cursor:pointer; font-size:13px; color:var(--text2); transition:background .12s; display:flex; align-items:center; gap:8px; user-select:none; }
.mt:hover { background:var(--bg3); color:var(--text); }
.mt.on { background:var(--am); color:#fff; font-weight:600; }
```

**c. Add state fields.** Find the `const S = { ... }` declaration (around line 582). Add these fields to that object:

```javascript
mode: 'library',
quran: { suras:\[], curSura:1, curAya:1, searchResults:null, searchQuery:'', searchLang:'auto', sidebarFilter:'', showTranslation:true },
notes: { docs:\[], curDoc:null, dirty:false, matches:new Map(), rightTab:'quran', quickSura:null, quickAya:null, quickWithTr:true, refsFilter:null }
```

**d. Refactor `renderSide()`.** Find the existing `function renderSide()` (around line 720). Replace it with a version that renders mode tabs at the top, and then delegates to different sidebars per mode. The existing library sidebar code (categories, recent reads) must be preserved inside the `'library'` branch:

```javascript
function renderSide() {
  let h = `<div class="mode-tabs">
    <div class="mt ${S.mode==='library'?'on':''}" onclick="setMode('library')">📚 كىتابلار</div>
    <div class="mt ${S.mode==='quran'?'on':''}" onclick="setMode('quran')">📖 قۇرئان كەرىم</div>
    <div class="mt ${S.mode==='notes'?'on':''}" onclick="setMode('notes')">📝 خاتىرە دەپتىرىم</div>
  </div>`;

  if (S.mode === 'library') {
    // --- EXISTING LIBRARY SIDEBAR CODE GOES HERE ---
    // (Move all the existing counts + categories + recent-reads HTML from the old renderSide into this branch)
    const counts = {};
    S.books.forEach(b => counts\[b.category] = (counts\[b.category]||0)+1);
    h += `<div class="sec">تۈرلەر</div>`;
    h += `<div class="ci ${S.cat==='all'?'on':''}" onclick="setCat('all')">
      <span>📚 بارلىق كىتابلار</span><span class="cn">${S.books.length}</span></div>`;
    S.cats.forEach(c => {
      const n = counts\[c]||0;
      const ic = ICONS\[c]||'📚';
      h += `<div class="ci ${S.cat===c?'on':''}" onclick="setCat('${sanitize(c).replace(/'/g,"\\\\'")}')">
        <span>${ic} ${sanitize(c)}</span><span class="cn">${n}</span></div>`;
    });
    if (S.recent.length > 0) {
      h += `<div class="sec" style="margin-top:14px">يېقىندا ئوقۇلغانلار</div>`;
      S.recent.forEach(r => {
        const b = S.books.find(x => x.id === r.id);
        if (b) {
          const ic = ICONS\[b.category] || '📚';
          h += `<div class="ci" onclick="openReader(${b.id})">
            <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ic} ${sanitize(b.title)}</span>
          </div>`;
        }
      });
    }
  } else if (S.mode === 'quran') {
    h += (typeof renderQuranSidebar === 'function') ? renderQuranSidebar() : '<div style="padding:20px;color:var(--text3)">يۈكلىنىۋاتىدۇ...</div>';
  } else if (S.mode === 'notes') {
    h += (typeof renderNotesSidebar === 'function') ? renderNotesSidebar() : '<div style="padding:20px;color:var(--text3)">يۈكلىنىۋاتىدۇ...</div>';
  }

  document.getElementById('side').innerHTML = h;
}

function setMode(mode) {
  if (mode === S.mode) return;
  S.mode = mode;
  // Hide/show the top search bar (#hd) — only library mode needs it
  const hd = document.getElementById('hd');
  if (hd) hd.style.display = (mode === 'library') ? 'flex' : 'none';
  renderSide();
  if (mode === 'library') {
    renderBooks();
  } else if (mode === 'quran' \&\& typeof renderQuranView === 'function') {
    renderQuranView();
  } else if (mode === 'notes' \&\& typeof renderNotesView === 'function') {
    renderNotesView();
  }
}
```

**e. Include new module files.** Before the closing `</body>` tag, add:

```html
<link rel="stylesheet" href="quran.css">
<link rel="stylesheet" href="notes.css">
<script src="ngram.js"></script>
<script src="quran.js"></script>
<script src="notes.js"></script>
```

**f. Update CSP.** Find the existing `<meta http-equiv="Content-Security-Policy"...>` tag. Ensure `style-src` allows the font URLs. The existing `'self' 'unsafe-inline'` already covers it; verify no changes are needed.

### Task 1.4 — Create stub files

Create these five files with the minimum skeleton below. Real implementations come in later prompts.

**`src/quran.js`:**

```javascript
// Quran module (renderer-side). Populated in Prompts 3 \& 4.
(function(){
  'use strict';
  window.renderQuranSidebar = function() {
    return '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">قۇرئان مودۇلى 3-باسقۇچتا تولدۇرۇلىدۇ</div>';
  };
  window.renderQuranView = function() {
    const main = document.getElementById('main');
    if (main) main.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text3)">📖 قۇرئان كەرىم — 3-باسقۇچتا تولدۇرۇلىدۇ</div>';
  };
})();
```

**`src/notes.js`:**

```javascript
// Notes module (renderer-side). Populated in Prompts 5 \& 6.
(function(){
  'use strict';
  window.renderNotesSidebar = function() {
    return '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">خاتىرە مودۇلى 5-باسقۇچتا تولدۇرۇلىدۇ</div>';
  };
  window.renderNotesView = function() {
    const main = document.getElementById('main');
    if (main) main.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text3)">📝 خاتىرە دەپتىرىم — 5-باسقۇچتا تولدۇرۇلىدۇ</div>';
  };
})();
```

**`src/ngram.js`:**

```javascript
// N-gram indexer/matcher for auto-reference. Populated in Prompt 6.
(function(){
  'use strict';
  window.NGram = {
    extractCandidates: () => \[],
    findReferences: async () => new Map()
  };
})();
```

**`src/quran.css`** and **`src/notes.css`**: create as empty files (they'll be filled in later prompts). Add a single `/\* Quran styles — populated in Prompt 3 \*/` or `/\* Notes styles — populated in Prompt 5 \*/` placeholder comment.

### Task 1.5 — Initialize default mode on startup

Find the `init()` function (around line 601). At the end of `init()`, after the existing `renderSide()` / `renderBooks()` calls, ensure `setMode('library')` is called so the mode tabs render correctly on startup.

## Acceptance Criteria

After you finish:

1. Run `npm start`. App opens without errors.
2. Sidebar shows 3 mode tabs at the top: 📚 كىتابلار / 📖 قۇرئان كەرىم / 📝 خاتىرە دەپتىرىم.
3. "كىتابلار" tab is active by default. All existing library functionality works (books list, search, categories, reader, add book, etc.). No existing test case is broken.
4. Clicking "قۇرئان كەرىم" shows the placeholder message and the stub sidebar message.
5. Clicking "خاتىرە دەپتىرىم" shows the other placeholder.
6. Switching back to "كىتابلار" restores the full library view exactly as before.
7. DevTools Console (Ctrl+Shift+I) has no errors (only the expected FTS5 / migration log lines).

## Rules

* **Production-grade code only.** No TODO comments. No stubs other than the five listed above.
* **Do not modify `database.js` or `preload.js`** in this prompt — they stay untouched. Those come in Prompt 2.
* **Uyghur text only for UI.** Code comments and variable names must be English.
* **Do not change existing function behavior.** Only add new code paths and the `renderSide` refactor.
* After finishing, list every file you created or modified with a one-line summary for each. Then ask me to test.

\---

# 🚀 PROMPT 2 — Database Schema \& Quran Seed Loader

**After Prompt 1 is verified, paste the block below into Claude Code.**

\---

You are continuing **Bilim Hezinisi 2.4.1** work. Step **2 of 6**: add SQLite tables for Quran, Notes, and the n-gram index; write the Quran seed loader that reads the Uyghur translation XML and downloads the Arabic Uthmani Hafs text from Tanzil.net on first launch.

## Goals

1. Add new tables to `database.js` (Quran data, Notes, n-gram) — non-destructive (`CREATE TABLE IF NOT EXISTS`).
2. Add database functions: quranSeedBulk, quranGetSuras, quranGetAyas, quranGetAya, quranSearch (FTS5 + LIKE fallback), quranSuraExists, notesGetAll/Get/Create/Update/Delete, ngramIndexBook/RemoveBook/FindWord, hasNgramIndex.
3. Write `scripts/seed-quran.js` that:

   * Parses the Uyghur translation XML from `\_resources/uyghur\_saleh\_v1.0.2-xml.1.xml`
   * Downloads the Arabic Uthmani Hafs pipe-delimited text from `https://tanzil.net/res/text/quran-uthmani-hafs.txt` (if not cached in `assets/seed/`)
   * Combines them and calls `database.quranSeedBulk()` with all 114 suras × 6236 ayas
4. Hook the seeder into `main.js` startup flow (only runs if `quran\_suras` table is empty).
5. Add IPC handlers and expose them via `preload.js`.

## Task 2.1 — Update database.js

**a. Add new tables.** At the end of `createTables()` (after the existing `CREATE TABLE` calls and the `search\_history` table), append:

```javascript
// ========== QURAN TABLES ==========
db.run(`
  CREATE TABLE IF NOT EXISTS quran\_suras (
    number INTEGER PRIMARY KEY,
    name\_ar TEXT NOT NULL,
    name\_ug TEXT NOT NULL,
    name\_translit TEXT DEFAULT '',
    revelation TEXT DEFAULT 'meccan',
    aya\_count INTEGER NOT NULL
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS quran\_ayas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sura INTEGER NOT NULL,
    aya INTEGER NOT NULL,
    text\_ar TEXT NOT NULL,
    text\_ar\_simple TEXT NOT NULL,
    text\_ug TEXT NOT NULL DEFAULT '',
    UNIQUE(sura, aya),
    FOREIGN KEY(sura) REFERENCES quran\_suras(number)
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx\_quran\_sura ON quran\_ayas(sura)`);

// FTS5 Quran index (graceful fallback)
let hasQuranFTS = false;
try {
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS quran\_fts USING fts5(
      text\_ar\_simple, text\_ug,
      content='quran\_ayas', content\_rowid='id',
      tokenize='unicode61 remove\_diacritics 2'
    )
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS quran\_fts\_ai AFTER INSERT ON quran\_ayas BEGIN
      INSERT INTO quran\_fts(rowid, text\_ar\_simple, text\_ug)
      VALUES (new.id, new.text\_ar\_simple, new.text\_ug);
    END
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS quran\_fts\_ad AFTER DELETE ON quran\_ayas BEGIN
      INSERT INTO quran\_fts(quran\_fts, rowid, text\_ar\_simple, text\_ug)
      VALUES ('delete', old.id, old.text\_ar\_simple, old.text\_ug);
    END
  `);
  hasQuranFTS = true;
} catch(e) {
  console.log('Quran FTS5 not available, using LIKE fallback');
}
module.hasQuranFTS = hasQuranFTS;  // read via closure below

// ========== NOTES TABLE ==========
db.run(`
  CREATE TABLE IF NOT EXISTS note\_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'يېڭى خاتىرە',
    content\_html TEXT NOT NULL DEFAULT '',
    content\_text TEXT NOT NULL DEFAULT '',
    created\_at TEXT DEFAULT (datetime('now')),
    updated\_at TEXT DEFAULT (datetime('now'))
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx\_note\_updated ON note\_documents(updated\_at DESC)`);

// ========== N-GRAM INDEX ==========
db.run(`
  CREATE TABLE IF NOT EXISTS book\_ngrams (
    gram TEXT NOT NULL,
    book\_id INTEGER NOT NULL,
    positions TEXT NOT NULL,
    PRIMARY KEY(gram, book\_id)
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx\_ngram\_gram ON book\_ngrams(gram)`);
```

Also move `hasQuranFTS` to a module-level `let` variable (alongside the existing `hasFTS5`), so other functions can read it:

```javascript
let hasQuranFTS = false;
```

(and assign `hasQuranFTS = true;` inside the successful branch, replacing the `module.hasQuranFTS` hack.)

**b. Add Quran functions** (place these after the existing `searchBooksSimple` function, before the category functions):

```javascript
// ========== QURAN FUNCTIONS ==========

function quranSuraExists() {
  const r = db.exec('SELECT COUNT(\*) FROM quran\_suras');
  return r.length \&\& r\[0].values\[0]\[0] > 0;
}

function quranSeedBulk(suras, ayas) {
  if (!Array.isArray(suras) || !Array.isArray(ayas)) {
    throw new Error('quranSeedBulk: suras and ayas must be arrays');
  }
  db.run('BEGIN TRANSACTION');
  try {
    db.run('DELETE FROM quran\_ayas');
    db.run('DELETE FROM quran\_suras');

    const sStmt = db.prepare(
      `INSERT INTO quran\_suras (number, name\_ar, name\_ug, name\_translit, revelation, aya\_count) VALUES (?,?,?,?,?,?)`
    );
    for (const s of suras) {
      sStmt.run(\[s.number, s.name\_ar, s.name\_ug, s.name\_translit || '', s.revelation || 'meccan', s.aya\_count]);
    }
    sStmt.free();

    const aStmt = db.prepare(
      `INSERT INTO quran\_ayas (sura, aya, text\_ar, text\_ar\_simple, text\_ug) VALUES (?,?,?,?,?)`
    );
    for (const a of ayas) {
      aStmt.run(\[a.sura, a.aya, a.text\_ar, a.text\_ar\_simple, a.text\_ug || '']);
    }
    aStmt.free();

    db.run('COMMIT');
    return { suras: suras.length, ayas: ayas.length };
  } catch(e) {
    db.run('ROLLBACK');
    throw e;
  }
}

function quranGetSuras() {
  const r = db.exec('SELECT number, name\_ar, name\_ug, name\_translit, revelation, aya\_count FROM quran\_suras ORDER BY number');
  if (!r.length) return \[];
  return r\[0].values.map(row => ({
    number: row\[0], name\_ar: row\[1], name\_ug: row\[2],
    name\_translit: row\[3], revelation: row\[4], aya\_count: row\[5]
  }));
}

function quranGetAyas(suraNumber) {
  const r = db.exec(
    'SELECT id, sura, aya, text\_ar, text\_ar\_simple, text\_ug FROM quran\_ayas WHERE sura=? ORDER BY aya',
    \[suraNumber]
  );
  if (!r.length) return \[];
  return r\[0].values.map(row => ({
    id: row\[0], sura: row\[1], aya: row\[2],
    text\_ar: row\[3], text\_ar\_simple: row\[4], text\_ug: row\[5]
  }));
}

function quranGetAya(sura, aya) {
  const r = db.exec(
    'SELECT id, sura, aya, text\_ar, text\_ar\_simple, text\_ug FROM quran\_ayas WHERE sura=? AND aya=?',
    \[sura, aya]
  );
  if (!r.length || !r\[0].values.length) return null;
  const row = r\[0].values\[0];
  return { id: row\[0], sura: row\[1], aya: row\[2], text\_ar: row\[3], text\_ar\_simple: row\[4], text\_ug: row\[5] };
}

function quranSearch(query, opts) {
  opts = opts || {};
  const lang = opts.lang || 'auto';
  const limit = Math.max(1, Math.min(500, opts.limit || 200));
  if (!query || !String(query).trim()) return \[];
  const q = String(query).trim();

  if (hasQuranFTS) {
    try {
      // Build FTS5 query. Add prefix wildcard for partial matching.
      const tokens = q.split(/\\s+/).map(w => w.replace(/\["'\*:]/g,'')).filter(Boolean);
      if (!tokens.length) return \[];
      const ftsQuery = tokens.map(t => t + '\*').join(' ');

      let sql;
      if (lang === 'ar') {
        sql = `SELECT a.id,a.sura,a.aya,a.text\_ar,a.text\_ug,
               snippet(quran\_fts,0,'<mark>','</mark>','...',10) AS snip\_ar,
               '' AS snip\_ug
               FROM quran\_fts JOIN quran\_ayas a ON a.id=quran\_fts.rowid
               WHERE quran\_fts.text\_ar\_simple MATCH ? ORDER BY rank LIMIT ?`;
      } else if (lang === 'ug') {
        sql = `SELECT a.id,a.sura,a.aya,a.text\_ar,a.text\_ug,
               '' AS snip\_ar,
               snippet(quran\_fts,1,'<mark>','</mark>','...',10) AS snip\_ug
               FROM quran\_fts JOIN quran\_ayas a ON a.id=quran\_fts.rowid
               WHERE quran\_fts.text\_ug MATCH ? ORDER BY rank LIMIT ?`;
      } else {
        sql = `SELECT a.id,a.sura,a.aya,a.text\_ar,a.text\_ug,
               snippet(quran\_fts,0,'<mark>','</mark>','...',10) AS snip\_ar,
               snippet(quran\_fts,1,'<mark>','</mark>','...',10) AS snip\_ug
               FROM quran\_fts JOIN quran\_ayas a ON a.id=quran\_fts.rowid
               WHERE quran\_fts MATCH ? ORDER BY rank LIMIT ?`;
      }
      const r = db.exec(sql, \[ftsQuery, limit]);
      if (!r.length) return \[];
      return r\[0].values.map(row => ({
        id: row\[0], sura: row\[1], aya: row\[2],
        text\_ar: row\[3], text\_ug: row\[4],
        snip\_ar: row\[5] || '', snip\_ug: row\[6] || ''
      }));
    } catch(e) {
      console.log('Quran FTS5 query failed, using LIKE fallback:', e.message);
    }
  }

  return quranSearchSimple(q, lang, limit);
}

function quranSearchSimple(q, lang, limit) {
  let sql, params;
  if (lang === 'ar') {
    sql = `SELECT id,sura,aya,text\_ar,text\_ug FROM quran\_ayas WHERE text\_ar\_simple LIKE ? OR text\_ar LIKE ? LIMIT ?`;
    params = \['%'+q+'%', '%'+q+'%', limit];
  } else if (lang === 'ug') {
    sql = `SELECT id,sura,aya,text\_ar,text\_ug FROM quran\_ayas WHERE text\_ug LIKE ? LIMIT ?`;
    params = \['%'+q+'%', limit];
  } else {
    sql = `SELECT id,sura,aya,text\_ar,text\_ug FROM quran\_ayas WHERE text\_ar\_simple LIKE ? OR text\_ar LIKE ? OR text\_ug LIKE ? LIMIT ?`;
    params = \['%'+q+'%', '%'+q+'%', '%'+q+'%', limit];
  }
  const r = db.exec(sql, params);
  if (!r.length) return \[];
  return r\[0].values.map(row => ({
    id: row\[0], sura: row\[1], aya: row\[2],
    text\_ar: row\[3], text\_ug: row\[4],
    snip\_ar: '', snip\_ug: ''
  }));
}
```

**c. Add Notes functions** (after Quran functions):

```javascript
// ========== NOTES FUNCTIONS ==========

function notesGetAll() {
  const r = db.exec(
    `SELECT id, title, created\_at, updated\_at, length(content\_text) AS sz
     FROM note\_documents ORDER BY updated\_at DESC`
  );
  if (!r.length) return \[];
  return r\[0].values.map(row => ({
    id: row\[0], title: row\[1], created\_at: row\[2], updated\_at: row\[3], size: row\[4] || 0
  }));
}

function notesGet(id) {
  const r = db.exec(
    'SELECT id, title, content\_html, content\_text, created\_at, updated\_at FROM note\_documents WHERE id=?',
    \[id]
  );
  if (!r.length || !r\[0].values.length) return null;
  const row = r\[0].values\[0];
  return {
    id: row\[0], title: row\[1], content\_html: row\[2], content\_text: row\[3],
    created\_at: row\[4], updated\_at: row\[5]
  };
}

function notesCreate(title) {
  const stmt = db.prepare(`INSERT INTO note\_documents (title) VALUES (?)`);
  stmt.run(\[title || 'يېڭى خاتىرە']);
  stmt.free();
  return db.exec('SELECT last\_insert\_rowid()')\[0].values\[0]\[0];
}

function notesUpdate(id, title, contentHtml, contentText) {
  const stmt = db.prepare(
    `UPDATE note\_documents
     SET title=?, content\_html=?, content\_text=?, updated\_at=datetime('now')
     WHERE id=?`
  );
  stmt.run(\[title || 'يېڭى خاتىرە', contentHtml || '', contentText || '', id]);
  stmt.free();
}

function notesDelete(id) {
  db.run('DELETE FROM note\_documents WHERE id=?', \[id]);
}
```

**d. Add N-gram functions** (after Notes functions):

```javascript
// ========== N-GRAM FUNCTIONS ==========

function hasNgramIndex(bookId) {
  const r = db.exec('SELECT 1 FROM book\_ngrams WHERE book\_id=? LIMIT 1', \[bookId]);
  return r.length > 0 \&\& r\[0].values.length > 0;
}

function ngramIndexBook(bookId, text) {
  if (!text) return;
  db.run('DELETE FROM book\_ngrams WHERE book\_id=?', \[bookId]);

  // Normalize: lowercase, collapse whitespace
  const norm = String(text).toLowerCase().replace(/\\s+/g, ' ');
  if (norm.length < 3) return;

  const map = new Map();
  for (let i = 0; i <= norm.length - 3; i++) {
    const g = norm.substr(i, 3);
    if (/^\\s+$/.test(g)) continue;
    if (!map.has(g)) map.set(g, \[]);
    const arr = map.get(g);
    if (arr.length < 50) arr.push(i);  // cap positions per gram
  }

  db.run('BEGIN TRANSACTION');
  try {
    const stmt = db.prepare(`INSERT INTO book\_ngrams (gram, book\_id, positions) VALUES (?,?,?)`);
    for (const \[gram, positions] of map) {
      stmt.run(\[gram, bookId, JSON.stringify(positions)]);
    }
    stmt.free();
    db.run('COMMIT');
  } catch(e) {
    db.run('ROLLBACK');
    throw e;
  }
}

function ngramRemoveBook(bookId) {
  db.run('DELETE FROM book\_ngrams WHERE book\_id=?', \[bookId]);
}

function ngramFindWord(word) {
  word = String(word || '').toLowerCase();
  if (word.length < 3) return \[];
  const gram = word.substr(0, 3);
  const r = db.exec('SELECT book\_id, positions FROM book\_ngrams WHERE gram=?', \[gram]);
  if (!r.length) return \[];
  return r\[0].values.map(row => {
    let positions = \[];
    try { positions = JSON.parse(row\[1]); } catch(e) {}
    return { bookId: row\[0], positions };
  });
}
```

**e. Update `module.exports`** to include all new functions:

```javascript
module.exports = {
  // ...existing exports kept as-is...
  // Quran
  quranSuraExists, quranSeedBulk, quranGetSuras, quranGetAyas, quranGetAya, quranSearch,
  // Notes
  notesGetAll, notesGet, notesCreate, notesUpdate, notesDelete,
  // Ngram
  hasNgramIndex, ngramIndexBook, ngramRemoveBook, ngramFindWord
};
```

## Task 2.2 — Create scripts/seed-quran.js

Create the directory `scripts/` and the file `scripts/seed-quran.js`. This file:

1. Has the hard-coded 114-sura metadata (name\_ar, name\_ug, name\_translit, revelation, aya\_count) — copy the SURA\_META list I provide below verbatim.
2. Provides `stripTashkil()` to remove Arabic diacritics for search normalization.
3. Downloads Tanzil Uthmani Hafs text on first run (if missing), caches it in `assets/seed/quran-uthmani-hafs.txt`.
4. Parses Tanzil pipe-delimited lines (`sura|aya|text`).
5. Parses the Uyghur translation XML using `node-html-parser`.
6. Validates that both sources have 6236 ayas total.
7. Calls `database.quranSeedBulk()` with the merged data.

Write the file as:

```javascript
/\*\*
 \* Quran seeder.
 \* On first app launch (or if quran\_suras is empty), this:
 \*  - Reads the Uyghur translation from \_resources/uyghur\_saleh\_v1.0.2-xml.1.xml
 \*  - Downloads the Arabic Uthmani Hafs text from Tanzil (or reuses cached copy in assets/seed/)
 \*  - Calls database.quranSeedBulk() with all 114 suras and 6236 ayas
 \*/
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

const SURA\_META = \[
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

const TANZIL\_URL = 'https://tanzil.net/res/text/quran-uthmani-hafs.txt';

/\*\*
 \* Strip Arabic diacritics (tashkil/harakat/tanween/shadda/sukun/tatweel) for search normalization.
 \*/
function stripTashkil(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u08D3-\\u08FF\\u0640]/g, '')
    .replace(/\\s+/g, ' ')
    .trim();
}

function downloadTanzil(targetPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(targetPath);
    const req = https.get(TANZIL\_URL, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(targetPath); } catch(e) {}
        reject(new Error(`Tanzil HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Tanzil download timed out')); });
  });
}

function parseTanzil(content) {
  const map = {};
  for (const rawLine of content.split(/\\r?\\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\\d+)\\|(\\d+)\\|(.+)$/);
    if (!m) continue;
    const sura = parseInt(m\[1], 10);
    const aya = parseInt(m\[2], 10);
    const text = m\[3].trim();
    if (!map\[sura]) map\[sura] = {};
    map\[sura]\[aya] = text;
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
    map\[suraNum] = {};
    for (const ayaEl of suraEl.querySelectorAll('aya')) {
      const ayaNum = parseInt(ayaEl.getAttribute('number'), 10);
      const trEl = ayaEl.querySelector('translation');
      if (!ayaNum || !trEl) continue;
      let text = trEl.text.trim();
      // Remove trailing verse-number markers like "(7)." or "(7)"
      text = text.replace(/\\(\\d+\\)\[.。]?\\s\*$/, '').trim();
      map\[suraNum]\[ayaNum] = text;
    }
  }
  return map;
}

function findUyghurXml(projectRoot) {
  const candidates = \[
    path.join(projectRoot, '\_resources', 'uyghur\_saleh\_v1.0.2-xml.1.xml'),
    path.join(projectRoot, '\_resources', 'uyghur\_saleh\_v1.0.2-xml.1 (1).xml'),
    path.join(projectRoot, 'assets', 'seed', 'uyghur\_saleh.xml')
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const resDir = path.join(projectRoot, '\_resources');
  if (fs.existsSync(resDir)) {
    for (const f of fs.readdirSync(resDir)) {
      if (/uyghur.\*\\.xml$/i.test(f)) return path.join(resDir, f);
    }
  }
  return null;
}

/\*\*
 \* Main entry. Called from main.js at startup.
 \* @param {string} projectRoot
 \* @param {object} database
 \*/
async function seedQuran(projectRoot, database) {
  if (database.quranSuraExists \&\& database.quranSuraExists()) {
    console.log('\[seed-quran] Already seeded, skipping.');
    return { skipped: true };
  }

  const seedDir = path.join(projectRoot, 'assets', 'seed');
  if (!fs.existsSync(seedDir)) fs.mkdirSync(seedDir, { recursive: true });

  const arabicPath = path.join(seedDir, 'quran-uthmani-hafs.txt');
  const uyghurPath = findUyghurXml(projectRoot);

  if (!uyghurPath) {
    throw new Error('Uyghur translation XML not found. Place uyghur\_saleh\_v1.0.2-xml.1.xml in \_resources/');
  }

  if (!fs.existsSync(arabicPath)) {
    console.log('\[seed-quran] Downloading Arabic Quran text from Tanzil...');
    try {
      await downloadTanzil(arabicPath);
      console.log('\[seed-quran] Download complete.');
    } catch(e) {
      throw new Error('Tanzil download failed: ' + e.message + ' (First-time setup requires internet)');
    }
  }

  const arContent = fs.readFileSync(arabicPath, 'utf-8');
  const ugContent = fs.readFileSync(uyghurPath, 'utf-8');
  const arMap = parseTanzil(arContent);
  const ugMap = parseUyghurXml(ugContent);

  let totalAr = 0, totalUg = 0;
  for (const s in arMap) totalAr += Object.keys(arMap\[s]).length;
  for (const s in ugMap) totalUg += Object.keys(ugMap\[s]).length;
  console.log(`\[seed-quran] Parsed: ${totalAr} Arabic ayas, ${totalUg} Uyghur ayas`);
  if (totalAr !== 6236) console.warn(`\[seed-quran] Expected 6236 Arabic ayas, got ${totalAr}`);
  if (totalUg !== 6236) console.warn(`\[seed-quran] Expected 6236 Uyghur ayas, got ${totalUg}`);

  const suras = SURA\_META.map(s => ({
    number: s.n, name\_ar: s.ar, name\_ug: s.ug,
    name\_translit: s.tr, revelation: s.rev, aya\_count: s.count
  }));

  const ayas = \[];
  for (let sn = 1; sn <= 114; sn++) {
    const expectedCount = SURA\_META\[sn-1].count;
    for (let an = 1; an <= expectedCount; an++) {
      const ar = (arMap\[sn] \&\& arMap\[sn]\[an]) ? arMap\[sn]\[an] : '';
      const ug = (ugMap\[sn] \&\& ugMap\[sn]\[an]) ? ugMap\[sn]\[an] : '';
      if (!ar) console.warn(`\[seed-quran] Missing Arabic text for ${sn}:${an}`);
      ayas.push({
        sura: sn, aya: an,
        text\_ar: ar,
        text\_ar\_simple: stripTashkil(ar),
        text\_ug: ug
      });
    }
  }

  const result = database.quranSeedBulk(suras, ayas);
  console.log(`\[seed-quran] Seeded: ${result.suras} suras, ${result.ayas} ayas.`);
  return result;
}

module.exports = { seedQuran, stripTashkil, SURA\_META };
```

## Task 2.3 — Update main.js

**a. Import seeder.** Near the top of `main.js`, after `const database = require('./database');`, add:

```javascript
const { seedQuran } = require('./scripts/seed-quran');
```

**b. Hook seed into `initDatabase()`.** Find the `async function initDatabase()` function. After `database.ensureDefaultCategories(defaultCats());` and before `dbReady = true;`, add:

```javascript
try {
  await seedQuran(\_\_dirname, database);
  database.saveDB(DATA\_DIR);
} catch(e) {
  console.error('\[seed-quran] Seed failed:', e.message);
  // App continues even if seed fails; user will see a warning when entering Quran mode
}
```

**c. Add IPC handlers.** Inside the existing IPC handler section (after the last `ipcMain.handle` call near the end), add:

```javascript
// ========== QURAN IPC ==========
ipcMain.handle('quran-get-suras', () => {
  try { return { success: true, suras: database.quranGetSuras() }; }
  catch(e) { return { success: false, suras: \[], error: e.message }; }
});
ipcMain.handle('quran-get-ayas', (e, suraNumber) => {
  try { return { success: true, ayas: database.quranGetAyas(suraNumber) }; }
  catch(err) { return { success: false, ayas: \[], error: err.message }; }
});
ipcMain.handle('quran-get-aya', (e, sura, aya) => {
  try { return { success: true, aya: database.quranGetAya(sura, aya) }; }
  catch(err) { return { success: false, aya: null, error: err.message }; }
});
ipcMain.handle('quran-search', (e, query, opts) => {
  try { return { success: true, results: database.quranSearch(query, opts) }; }
  catch(err) { return { success: false, results: \[], error: err.message }; }
});

// ========== NOTES IPC ==========
ipcMain.handle('notes-get-all', () => {
  try { return { success: true, docs: database.notesGetAll() }; }
  catch(e) { return { success: false, docs: \[], error: e.message }; }
});
ipcMain.handle('notes-get', (e, id) => {
  try { return { success: true, doc: database.notesGet(id) }; }
  catch(err) { return { success: false, doc: null, error: err.message }; }
});
ipcMain.handle('notes-create', (e, title) => {
  try {
    const id = database.notesCreate(title);
    database.saveDB(DATA\_DIR);
    return { success: true, id };
  } catch(err) { return { success: false, error: err.message }; }
});
ipcMain.handle('notes-update', (e, id, title, html, text) => {
  try {
    database.notesUpdate(id, title, html, text);
    database.saveDB(DATA\_DIR);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
});
ipcMain.handle('notes-delete', (e, id) => {
  try {
    database.notesDelete(id);
    database.saveDB(DATA\_DIR);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
});

// ========== NGRAM IPC ==========
ipcMain.handle('ngram-find-word', (e, word) => {
  try { return { success: true, hits: database.ngramFindWord(word) }; }
  catch(err) { return { success: false, hits: \[], error: err.message }; }
});
ipcMain.handle('book-content-snippet', (e, bookId, needle, maxResults, ctx) => {
  try {
    const snippets = database.getAllSnippetsForBook(bookId, needle, maxResults || 3, ctx || 80);
    return { success: true, snippets };
  } catch(err) { return { success: false, snippets: \[], error: err.message }; }
});
```

## Task 2.4 — Update preload.js

Inside the `contextBridge.exposeInMainWorld('electron', { ... })` object, append (preserving existing methods):

```javascript
// Quran API
quranGetSuras: () => ipcRenderer.invoke('quran-get-suras'),
quranGetAyas: (n) => ipcRenderer.invoke('quran-get-ayas', n),
quranGetAya: (sura, aya) => ipcRenderer.invoke('quran-get-aya', sura, aya),
quranSearch: (q, opts) => ipcRenderer.invoke('quran-search', q, opts),
// Notes API
notesGetAll: () => ipcRenderer.invoke('notes-get-all'),
notesGet: (id) => ipcRenderer.invoke('notes-get', id),
notesCreate: (title) => ipcRenderer.invoke('notes-create', title),
notesUpdate: (id, title, html, text) => ipcRenderer.invoke('notes-update', id, title, html, text),
notesDelete: (id) => ipcRenderer.invoke('notes-delete', id),
// Ngram API
ngramFindWord: (word) => ipcRenderer.invoke('ngram-find-word', word),
bookContentSnippet: (bookId, needle, max, ctx) => ipcRenderer.invoke('book-content-snippet', bookId, needle, max, ctx)
```

## Acceptance Criteria

1. Run `npm install` (for `node-html-parser`).
2. Run `npm start`. First launch: console shows `\[seed-quran] Downloading...` then `\[seed-quran] Seeded: 114 suras, 6236 ayas.`
3. Open DevTools (Ctrl+Shift+I) → Console tab. Run:

```js
   (async () => {
     const r = await window.electron.quranGetSuras();
     console.log('suras:', r.suras.length);
     const a = await window.electron.quranGetAyas(1);
     console.log('fatiha ayas:', a.ayas.length);
     const s = await window.electron.quranSearch('الحمد', { lang: 'ar' });
     console.log('search hits:', s.results.length);
     const n = await window.electron.notesGetAll();
     console.log('notes:', n.docs.length);
   })();
   ```

4. Expected output: `suras: 114`, `fatiha ayas: 7`, `search hits: >= 30`, `notes: 0`.
5. Restart app. Console shows `\[seed-quran] Already seeded, skipping.` (no re-download).
6. Library functionality still works 100% — open a book, search, etc.

## Rules

* No changes to `src/\*` files in this prompt.
* Handle Tanzil download failure gracefully: log error, app continues.
* If the Uyghur XML isn't found, throw a clear error message in Uyghur.
* After finishing, list files modified/created with one-line summaries, then ask me to test.

\---

**Proceed to Prompt 3 only after Prompt 2 is verified.**

Prompts 3, 4, 5, and 6 are in separate files:

* **`prompt3-quran-ui.md`** — Quran sidebar, sura view, font rendering
* **`prompt4-quran-copy.md`** — Quran clipboard with translation \& Word formatting
* **`prompt5-notes-editor.md`** — Notes editor, document CRUD, rich-text
* **`prompt6-notes-autoref.md`** — 3-gram indexing + auto-reference matching

