# Prompt 07 — Notes Auto-Save Race Condition Fix

**Goal:** The current `saveNow()` in Notes can lose user edits. If the user types while a save is in flight, the save's `await` completes and sets `dirty = false`, even though new edits exist. We fix this with a save-version counter.

**Paste everything below this line into Claude Code:**

---

You are working on the "Bilim Hezinisi" Electron app. Read this file first:

1. `src/notes.js` — find `markDirty`, `saveNow`, `notesOpen`, and the editor `input` listener inside `mountEditor`

## Problem (concrete scenario)

1. User types "Hello"
2. `markDirty()` schedules `saveNow` for 3 seconds later
3. After 3s, `saveNow()` reads `editorEl.innerHTML` = `"Hello"` and starts the IPC call
4. While the IPC is in flight (50–500ms), the user types " World"
5. `markDirty()` is called → `dirty = true`, schedules another save
6. The IPC from step 3 returns success → sets `dirty = false`
7. The save scheduled in step 5 may be cancelled by the next debounce, OR may run with stale logic
8. User edits "World" might be lost on app close

We add:
- A monotonically increasing `saveVersion` counter
- Track which version of the editor was sent to the backend
- Only mark `dirty = false` if no new edit happened during the save

We also fix the related issue where `lastScannedText` (in the reference scanner) is module-level and persists across `notesOpen`, causing the new note's first scan to be skipped.

## Your task

### Step 1 — Add a saveVersion counter to the notes module

Open `src/notes.js`. Near the top of the IIFE (around the `function _s() { return window.S.notes; }` line), find this section:

```javascript
function _s() { return window.S.notes; }

let saveTimer = null;
let editorEl = null;
```

**Replace** with:

```javascript
function _s() { return window.S.notes; }

let saveTimer = null;
let editorEl = null;

// Save coordination: prevents data loss when user edits during in-flight save.
// Each markDirty() bumps saveVersion. saveNow() snapshots the version when it
// starts; only clears the dirty flag if no newer edits happened during await.
let saveVersion = 0;
let saveInFlight = false;
let pendingSaveAfterFlight = false;
```

### Step 2 — Replace `markDirty`

Find the existing `markDirty` function:

```javascript
function markDirty() {
  if (!_s().curDoc) return;
  _s().dirty = true;
  setStatus('saving', 'ساقلىنىۋاتىدۇ...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 3000);
}
```

**Replace** with:

```javascript
function markDirty() {
  if (!_s().curDoc) return;
  _s().dirty = true;
  saveVersion++;
  setStatus('saving', 'ساقلىنىۋاتىدۇ...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 3000);
}
```

### Step 3 — Replace `saveNow`

Find the existing `saveNow` function:

```javascript
async function saveNow() {
  if (!_s().curDoc || !editorEl) return;
  const html = editorEl.innerHTML;
  const text = editorEl.innerText || '';
  _s().curDoc.content_html = html;
  _s().curDoc.content_text = text;

  const r = await window.electron.notesUpdate(
    _s().curDoc.id, _s().curDoc.title, html, text
  );
  if (r.success) {
    _s().dirty = false;
    setStatus('saved', 'ساقلاندى');
  } else {
    setStatus('error', 'ساقلاش خاتالىقى');
  }
}
```

**Replace** with:

```javascript
async function saveNow() {
  if (!_s().curDoc || !editorEl) return;

  // If a save is already in flight, mark that another one is needed
  // and return — saveNow will be re-invoked when the current one finishes.
  if (saveInFlight) {
    pendingSaveAfterFlight = true;
    return;
  }

  saveInFlight = true;
  const versionAtStart = saveVersion;
  const docId = _s().curDoc.id;

  // Snapshot editor content. Sanitize before sending to backend.
  const rawHtml = editorEl.innerHTML;
  const html = (window.SafeHTML && window.SafeHTML.sanitize)
    ? window.SafeHTML.sanitize(rawHtml)
    : rawHtml;
  const text = editorEl.innerText || '';

  // Update local state. Will roll back if save fails.
  _s().curDoc.content_html = html;
  _s().curDoc.content_text = text;

  let result = null;
  try {
    result = await window.electron.notesUpdate(docId, _s().curDoc.title, html, text);
  } catch (e) {
    console.error('[notes] save failed:', e);
    result = { success: false, error: e.message };
  } finally {
    saveInFlight = false;
  }

  // If the document was switched/closed while saving, don't update UI for it
  if (!_s().curDoc || _s().curDoc.id !== docId) {
    if (pendingSaveAfterFlight) {
      pendingSaveAfterFlight = false;
      // The user navigated away; nothing to do.
    }
    return;
  }

  if (result && result.success) {
    // Only clear dirty if no edits happened during the save.
    if (saveVersion === versionAtStart) {
      _s().dirty = false;
      setStatus('saved', 'ساقلاندى');
    } else {
      // User edited during save — keep dirty, schedule another save soon
      setStatus('saving', 'ساقلىنىۋاتىدۇ...');
    }
  } else {
    setStatus('error', 'ساقلاش خاتالىقى');
  }

  // If a save was requested while one was in flight, run it now
  if (pendingSaveAfterFlight) {
    pendingSaveAfterFlight = false;
    // Small delay so we don't hammer the backend
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  } else if (_s().dirty) {
    // Still dirty (user edited during save) — schedule another save
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1500);
  }
}
```

### Step 4 — Reset scanner state when switching notes

Find `notesOpen` in `src/notes.js`:

```javascript
window.notesOpen = async function(id) {
  if (_s().dirty && _s().curDoc) await saveNow();

  const r = await window.electron.notesGet(id);
  if (!r.success || !r.doc) {
    if (typeof showToast === 'function') showToast('خاتىرە تېپىلمىدى', 'e');
    return;
  }
  _s().curDoc = r.doc;
  _s().dirty = false;
  _s().refsFilter = null;
  _s().matches = new Map();

  await window.renderNotesView();
  await refreshNotesList();
};
```

**Replace** with:

```javascript
window.notesOpen = async function(id) {
  if (_s().dirty && _s().curDoc) await saveNow();

  const r = await window.electron.notesGet(id);
  if (!r.success || !r.doc) {
    if (typeof showToast === 'function') showToast('خاتىرە تېپىلمىدى', 'e');
    return;
  }

  _s().curDoc = r.doc;
  _s().dirty = false;
  _s().refsFilter = null;
  _s().matches = new Map();

  // Reset scanner state — without this, the new note's first scan is skipped
  // because lastScannedText still holds the previous note's text.
  lastScannedText = '\x00INIT\x00';
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }

  // Reset save coordination
  saveVersion = 0;
  pendingSaveAfterFlight = false;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }

  await window.renderNotesView();
  await refreshNotesList();
};
```

### Step 5 — Save-on-close: ensure dirty notes are saved before app exits

Open `src/index.html`. Find the `init()` function or somewhere reasonable to add a `beforeunload` handler. Search for `setupKeyboardShortcuts`. Right after that function, ADD a window beforeunload handler.

Specifically, find this code:

```javascript
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // ...
  });
}
```

**Add immediately after the `setupKeyboardShortcuts` function:**

```javascript
// Flush any pending Notes save before the window closes
window.addEventListener('beforeunload', () => {
  try {
    if (window.S && window.S.notes && window.S.notes.dirty && window.S.notes.curDoc) {
      // Use sync IPC via a synchronous-looking pattern:
      // We can't actually await here, but we can fire-and-forget.
      // The main process auto-save is no longer necessary, but ensure
      // the most recent state is at least dispatched.
      const editorEl = document.getElementById('notes-editor');
      if (editorEl && window.electron && window.electron.notesUpdate) {
        const rawHtml = editorEl.innerHTML;
        const html = (window.SafeHTML && window.SafeHTML.sanitize)
          ? window.SafeHTML.sanitize(rawHtml)
          : rawHtml;
        const text = editorEl.innerText || '';
        // Don't await — beforeunload can't reliably wait, but the IPC
        // is queued and the main process will process it.
        window.electron.notesUpdate(
          window.S.notes.curDoc.id,
          window.S.notes.curDoc.title,
          html,
          text
        );
      }
    }
  } catch (e) {
    // Ignore — best effort save
  }
});
```

### Step 6 — Add a graceful shutdown handler in main.js

Open `main.js`. Find the `window-all-closed` handler:

```javascript
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

We want to ensure the database is closed cleanly. Better-sqlite3 auto-closes on process exit, but explicit close is cleaner. Replace with:

```javascript
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    if (database && typeof database.close === 'function') {
      database.close();
    }
  } catch (e) {
    console.error('[shutdown] database close failed:', e);
  }
});
```

### Step 7 — Add a `close` function to database.js

Open `database.js`. Anywhere near `saveDB` and `vacuum`, ADD:

```javascript
function close() {
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.warn('[close] failed:', e.message);
    }
    db = null;
  }
}
```

Add `close` to the `module.exports` list at the bottom:

```javascript
module.exports = {
  initDB, saveDB, vacuum, close,
  // ...rest stays the same
```

### Step 8 — Test save during typing

```bash
npm start
```

1. Open Notes tab, create a new note
2. Type a long sentence
3. Quickly type more text right after the auto-save indicator changes from "ساقلىنىۋاتىدۇ..." to "ساقلاندى" — make sure to keep typing
4. Watch the indicator: it should re-enter the "saving" state
5. Stop typing for 5+ seconds — indicator should settle on "ساقلاندى"
6. Close the note (open another or restart app)
7. Reopen the note — your full text must be there

### Step 9 — Test note-switching during typing

1. Create note A, type some text
2. Quickly create note B (which triggers save of A first)
3. Type in note B
4. Switch back to note A — its text must be intact
5. Switch back to note B — its text must be intact

### Step 10 — Test app close during typing

1. Open a note, type "this is a test"
2. Wait for auto-save to confirm "ساقلاندى"
3. Now type " more text" — auto-save will be in progress
4. **Immediately close the app** (Alt+F4 or close button)
5. Reopen the app, navigate to that note
6. The full text "this is a test more text" should be present

### Step 11 — Commit

```bash
git add -A
git status
git commit -m "fix(notes): prevent data loss in auto-save race condition"
```

### Step 12 — Final report

- ✅ `saveVersion` counter prevents stale `dirty=false`
- ✅ `saveInFlight`/`pendingSaveAfterFlight` queue concurrent saves
- ✅ `lastScannedText` resets when switching notes
- ✅ `beforeunload` flushes pending saves
- ✅ `before-quit` cleanly closes the database
- ✅ All test scenarios pass
- ✅ Git commit hash: [show it]

Then say: **"Notes save race fix complete. Safe to proceed to PROMPT_08."**
