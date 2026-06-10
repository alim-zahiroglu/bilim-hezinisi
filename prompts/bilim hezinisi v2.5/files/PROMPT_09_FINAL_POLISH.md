# Prompt 09 — Final UX Polish

**Goal:** Apply the remaining low-risk UX improvements identified in the audit:
1. Persist window size/position across launches
2. Add Ctrl+1/2/3 shortcuts for mode switching
3. Make Notes tabs use `data-tab` attributes (more robust than index-based)
4. Add viewport boundary checks to the Quran aya menu (prevents off-screen menus)
5. Add tooltips that mention keyboard shortcuts

**Paste everything below this line into Claude Code:**

---

You are working on the "Bilim Hezinisi" Electron app. This is the final upgrade prompt.

## Your task

### Step 1 — Install electron-window-state

```bash
npm install electron-window-state@^5.0.3
```

### Step 2 — Wire window state persistence in main.js

Open `main.js`. At the top, after the existing `require` statements, ADD:

```javascript
const windowStateKeeper = require('electron-window-state');
```

Find the `createWindow` function:

```javascript
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'بىلىم خەزىنىسى',
    backgroundColor: '#FFFBF5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false
  });
  // ...
}
```

**Replace** the `createWindow` function with this version:

```javascript
function createWindow() {
  // Restore previous window position and size
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
    file: 'window-state.json',
    path: DATA_DIR
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 900,
    minHeight: 600,
    title: 'بىلىم خەزىنىسى',
    backgroundColor: '#FFFBF5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false
  });

  // Track resize/move/maximize and persist state
  mainWindowState.manage(mainWindow);

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}
```

### Step 3 — Add Ctrl+1/2/3 mode-switching keyboard shortcuts

Open `src/index.html`. Find the `setupKeyboardShortcuts` function:

```javascript
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      showAdd();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      document.getElementById('si').focus();
    }
    if (e.key === 'Escape') {
      // ...
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
      e.preventDefault();
      chFS(-2);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
      e.preventDefault();
      chFS(2);
    }
  });
}
```

**Add inside the `keydown` handler** (anywhere among the other `if` blocks):

```javascript
    // Ctrl+1 / Ctrl+2 / Ctrl+3 — switch between modes
    if ((e.ctrlKey || e.metaKey) && (e.key === '1' || e.key === '2' || e.key === '3')) {
      // Only switch if focus is not in an input/textarea/contenteditable
      const t = e.target;
      const isEditing = t && (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable
      );
      if (isEditing) return; // let the input handle it
      e.preventDefault();
      const modeMap = { '1': 'library', '2': 'quran', '3': 'notes' };
      const target = modeMap[e.key];
      if (target && target !== S.mode) setMode(target);
    }
```

### Step 4 — Add tooltips with shortcuts to mode tabs

Open `src/index.html`. Find the `renderSide()` function. Find this block:

```javascript
let h = `<div class="mode-tabs">
  <div class="mt ${S.mode==='library'?'on':''}" onclick="setMode('library')">📚 كىتابلار</div>
  <div class="mt ${S.mode==='quran'?'on':''}" onclick="setMode('quran')">📖 قۇرئان كەرىم</div>
  <div class="mt ${S.mode==='notes'?'on':''}" onclick="setMode('notes')">📝 خاتىرە دەپتىرىم</div>
</div>`;
```

**Replace** with:

```javascript
let h = `<div class="mode-tabs">
  <div class="mt ${S.mode==='library'?'on':''}" onclick="setMode('library')" title="كىتابلار كۇتۇپخانىسى (Ctrl+1)">📚 كىتابلار</div>
  <div class="mt ${S.mode==='quran'?'on':''}" onclick="setMode('quran')" title="قۇرئان كەرىم ئوقۇش (Ctrl+2)">📖 قۇرئان كەرىم</div>
  <div class="mt ${S.mode==='notes'?'on':''}" onclick="setMode('notes')" title="خاتىرە دەپتىرى (Ctrl+3)">📝 خاتىرە دەپتىرىم</div>
</div>`;
```

### Step 5 — Make Notes right-panel tabs use `data-tab` attributes

Open `src/notes.js`. Find the `renderRightPanel` function:

```javascript
function renderRightPanel() {
  const tab = _s().rightTab || 'quran';
  return `<div class="notes-right-panel">
    <div class="notes-right-panel-tabs">
      <div class="notes-right-panel-tab ${tab==='quran'?'active':''}" onclick="window.notesSetTab('quran')">📖 قۇرئان</div>
      <div class="notes-right-panel-tab ${tab==='refs'?'active':''}" onclick="window.notesSetTab('refs')">🔗 مەنبە</div>
    </div>
    <div class="notes-right-panel-content" id="notes-right-content">
      ${tab === 'quran' ? renderQuranPicker() : renderRefsEmpty()}
    </div>
  </div>`;
}
```

**Replace** with:

```javascript
function renderRightPanel() {
  const tab = _s().rightTab || 'quran';
  return `<div class="notes-right-panel">
    <div class="notes-right-panel-tabs">
      <div class="notes-right-panel-tab ${tab==='quran'?'active':''}" data-tab="quran" onclick="window.notesSetTab('quran')">📖 قۇرئان</div>
      <div class="notes-right-panel-tab ${tab==='refs'?'active':''}" data-tab="refs" onclick="window.notesSetTab('refs')">🔗 مەنبە</div>
    </div>
    <div class="notes-right-panel-content" id="notes-right-content">
      ${tab === 'quran' ? renderQuranPicker() : renderRefsEmpty()}
    </div>
  </div>`;
}
```

Now find the `notesSetTab` function:

```javascript
window.notesSetTab = function(tab) {
  _s().rightTab = tab;
  const tabs = document.querySelectorAll('.notes-right-panel-tab');
  tabs.forEach((t, i) => {
    const match = (i === 0 && tab === 'quran') || (i === 1 && tab === 'refs');
    t.classList.toggle('active', match);
  });
  const content = document.getElementById('notes-right-content');
  if (content) content.innerHTML = (tab === 'quran') ? renderQuranPicker() : renderRefsEmpty();
  // Prompt 6 will populate references when switching to 'refs' tab
  if (tab === 'refs' && typeof window.notesRenderRefsPanel === 'function') {
    window.notesRenderRefsPanel();
  }
};
```

**Replace** with:

```javascript
window.notesSetTab = function(tab) {
  _s().rightTab = tab;
  // Use data-tab attribute (robust to tab order changes)
  const tabs = document.querySelectorAll('.notes-right-panel-tab');
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  const content = document.getElementById('notes-right-content');
  if (content) content.innerHTML = (tab === 'quran') ? renderQuranPicker() : renderRefsEmpty();
  if (tab === 'refs' && typeof window.notesRenderRefsPanel === 'function') {
    window.notesRenderRefsPanel();
  }
};
```

Also find `notesShowRefFor`:

```javascript
window.notesShowRefFor = function(word) {
  _s().refsFilter = word;
  _s().rightTab = 'refs';

  const tabs = document.querySelectorAll('.notes-right-panel-tab');
  tabs.forEach((t, i) => t.classList.toggle('active', i === 1));
  const rightContent = document.getElementById('notes-right-content');
  if (rightContent) {
    rightContent.innerHTML = `<div id="notes-refs-content" class="notes-ref-list"></div>`;
  }
  renderRefsPanel();
};
```

**Replace** with:

```javascript
window.notesShowRefFor = function(word) {
  _s().refsFilter = word;
  _s().rightTab = 'refs';

  const tabs = document.querySelectorAll('.notes-right-panel-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'refs'));
  const rightContent = document.getElementById('notes-right-content');
  if (rightContent) {
    rightContent.innerHTML = `<div id="notes-refs-content" class="notes-ref-list"></div>`;
  }
  renderRefsPanel();
};
```

### Step 6 — Add viewport boundary checks to Quran aya menu

Open `src/quran.js`. Find the `quranShowAyaMenu` function:

```javascript
window.quranShowAyaMenu = function(targetEl, sura, aya) {
  document.querySelectorAll('.quran-aya-menu').forEach(el => el.remove());

  const menu = document.createElement('div');
  menu.className = 'quran-aya-menu';
  menu.innerHTML = `
    <button onclick="window.quranMenuCopy(${sura}, ${aya}, false, event)">📋 يالغۇز ئايەتنى كۆچۈرۈش</button>
    <button onclick="window.quranMenuCopy(${sura}, ${aya}, true, event)">📋 تەرجىمىسى بىلەن كۆچۈرۈش</button>
  `;

  const rect = targetEl.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  const left = Math.max(8, rect.left + 12);
  menu.style.top = top + 'px';
  menu.style.left = left + 'px';
  document.body.appendChild(menu);

  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler, true), 10);
};
```

**Replace** with:

```javascript
window.quranShowAyaMenu = function(targetEl, sura, aya) {
  document.querySelectorAll('.quran-aya-menu').forEach(el => el.remove());

  const menu = document.createElement('div');
  menu.className = 'quran-aya-menu';
  menu.innerHTML = `
    <button onclick="window.quranMenuCopy(${sura}, ${aya}, false, event)">📋 يالغۇز ئايەتنى كۆچۈرۈش</button>
    <button onclick="window.quranMenuCopy(${sura}, ${aya}, true, event)">📋 تەرجىمىسى بىلەن كۆچۈرۈش</button>
  `;

  // Append first so we can measure its real size
  document.body.appendChild(menu);
  // Off-screen initially so the user doesn't see a flicker at (0,0)
  menu.style.visibility = 'hidden';
  menu.style.position = 'absolute';
  menu.style.top = '-9999px';
  menu.style.left = '-9999px';

  // Force layout, then measure
  // eslint-disable-next-line
  void menu.offsetHeight;

  const rect = targetEl.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 240;
  const menuHeight = menu.offsetHeight || 80;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const margin = 8;

  // Vertical: prefer below the aya, but flip above if it would go off-screen.
  let top = rect.bottom + window.scrollY + 6;
  if (rect.bottom + menuHeight + margin > viewportH) {
    // Flip above
    top = rect.top + window.scrollY - menuHeight - 6;
    if (top < window.scrollY + margin) {
      // Doesn't fit either way; clamp to top of viewport
      top = window.scrollY + margin;
    }
  }

  // Horizontal: clamp to viewport
  let left = rect.left + 12;
  if (left + menuWidth + margin > viewportW) {
    left = viewportW - menuWidth - margin;
  }
  if (left < margin) left = margin;

  menu.style.top = top + 'px';
  menu.style.left = left + 'px';
  menu.style.visibility = 'visible';

  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler, true), 10);
};
```

### Step 7 — Add an `Esc` close handler to the Quran aya menu

Right after the closing `setTimeout(() => document.addEventListener('click', closeHandler, true), 10);` line in `quranShowAyaMenu`, **add** these lines (still inside the function, before the closing `};`):

Find the line:

```javascript
  setTimeout(() => document.addEventListener('click', closeHandler, true), 10);
};
```

**Replace** with:

```javascript
  setTimeout(() => document.addEventListener('click', closeHandler, true), 10);

  // Escape key closes the menu
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      menu.remove();
      document.removeEventListener('click', closeHandler, true);
      document.removeEventListener('keydown', escHandler, true);
    }
  };
  document.addEventListener('keydown', escHandler, true);
};
```

### Step 8 — Improve mode-tabs visual feedback hint (first-time user help)

Open `src/index.html`. Find the `showWelcome()` function. Inside the welcome HTML, find the "قىسقىچە قوللانما" section. Within the line-list, **add** a line about mode tabs.

Find:

```html
<div style="font-size:12px;color:var(--text2);line-height:2.4">
  📥 يۇقىرىدىكى «كىتاب قوشۇش» كۇنۇپكىسىنى بېسىپ كىتاب قوشالايسىز<br>
  📁 «توپلاپ قوشۇش» ئارقىلىق بىرنەچچە كىتابنى بىراقلا قوشالايسىز<br>
  🔍 ئىزدەش رامكىسىدىن مەزمۇن ئىچىدىن ئىزدىيەلەيسىز<br>
  📖 كىتابنى چېكىپ بىۋاسىتە ئوقۇيالايسىز
</div>
```

**Replace** with:

```html
<div style="font-size:12px;color:var(--text2);line-height:2.4">
  📥 يۇقىرىدىكى «كىتاب قوشۇش» كۇنۇپكىسىنى بېسىپ كىتاب قوشالايسىز<br>
  📁 «توپلاپ قوشۇش» ئارقىلىق بىرنەچچە كىتابنى بىراقلا قوشالايسىز<br>
  🔍 ئىزدەش رامكىسىدىن مەزمۇن ئىچىدىن ئىزدىيەلەيسىز<br>
  📖 كىتابنى چېكىپ بىۋاسىتە ئوقۇيالايسىز<br>
  ⌨️ <b>Ctrl+1</b> كىتابلار، <b>Ctrl+2</b> قۇرئان، <b>Ctrl+3</b> خاتىرە — تېز ئالمىشىش
</div>
```

### Step 9 — Test all the polish features

```bash
npm start
```

Test each feature:

#### Window state persistence
1. Resize the window to a non-default size (e.g. drag a corner)
2. Move it to a corner of the screen
3. Close the app
4. Reopen — it should restore the same position and size

#### Keyboard shortcuts
1. With the library open, press `Ctrl+1` — should stay/switch to Library
2. Press `Ctrl+2` — should switch to Quran
3. Press `Ctrl+3` — should switch to Notes
4. Click into the search box (Library) and type "1", "2", "3" — should type the digits, NOT switch modes (because focus is in input)
5. In Notes, click into the editor and type "1", "2", "3" — should type the digits, NOT switch modes

#### Notes tab data-tab
1. In Notes mode, click "📖 قۇرئان" tab — should activate
2. Click "🔗 مەنبە" tab — should activate
3. Type a referenced word, click on the dotted underline — should also activate the refs tab

#### Quran aya menu boundary
1. Open Quran, navigate to a long sura
2. Scroll to near the bottom of the page
3. Click the LAST visible aya (one near the screen bottom)
4. The menu should appear ABOVE the aya, not be cut off below
5. Press Escape — menu should close

### Step 10 — Verify no regressions

Run through this final checklist:

```bash
npm start
```

- [ ] App launches without errors in console
- [ ] Library shows books
- [ ] Open a book — content reads with proper RTL layout
- [ ] Search for a word — results appear
- [ ] Click "+ بۇ كىتابتىكى بارلىق ئورۇنلار..." — expands inline
- [ ] Add a bookmark — saves
- [ ] Add a note (book annotation) — saves
- [ ] Switch to Quran — sura list loads
- [ ] Click a sura — ayas display
- [ ] Click an aya — menu opens, copy works
- [ ] Quran search Arabic — finds results
- [ ] Quran search Uyghur — finds results
- [ ] Switch to Notes — sidebar shows existing notes
- [ ] Create a new note — opens editor
- [ ] Type text — auto-save fires, "ساقلاندى" indicator appears
- [ ] Insert a Quran ayat from right panel — appears in editor
- [ ] Type words that match a book in your library — references show in 🔗 tab
- [ ] Toggle dark/sepia/light theme via 🌙 button — works
- [ ] Restart app — last opened state still feels right

### Step 11 — Final commit

```bash
git add -A
git status
git commit -m "feat(ux): window state, keyboard shortcuts, and viewport polish"
git tag v2.5.0
git log --oneline
```

### Step 12 — Build the installer

```bash
npm run dist
```

The `.exe` will be in the `dist/` folder. Test it on a clean machine if possible (or at least run it from `dist/` to confirm it works).

### Step 13 — Final report

Give me a complete summary of the entire upgrade journey:

- ✅ Prompt 01 (Backup): commit hash + tag
- ✅ Prompt 02 (Quran offline): commit hash
- ✅ Prompt 03 (N-gram removed): commit hash
- ✅ Prompt 04 (better-sqlite3): commit hash
- ✅ Prompt 05 (Notes XSS): commit hash
- ✅ Prompt 06 (Quran search normalize): commit hash
- ✅ Prompt 07 (Notes race fix): commit hash
- ✅ Prompt 08 (Batch import): commit hash
- ✅ Prompt 09 (UX polish): commit hash + tag v2.5.0
- ✅ `npm run dist` produces working installer

Run `git log --oneline` and paste the full output so I can see the upgrade history at a glance.

Then say: **"Final polish complete. Upgrade fully complete. v2.5.0 is ready to ship."**
