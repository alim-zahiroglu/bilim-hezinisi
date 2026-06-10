# PROMPT 5 — Notes Module: Rich-Text Editor, Document CRUD

**Only run after Prompt 4 is verified.**

---

You are continuing **Bilim Hezinisi 2.4.1**, step **5 of 6**. Build the Notes module UI: sidebar document list, rich-text editor (Bold/Italic/Font/Lists), auto-save, and a Quran quick-insert panel on the right. Auto-reference matching comes in Prompt 6 — do NOT build it yet.

## Prerequisites

- Prompt 2 done: `window.electron.notesGetAll()`, `notesGet()`, `notesCreate()`, `notesUpdate()`, `notesDelete()` all work.
- Prompt 4 done: `window.QuranCopy.copyAyaToClipboard()` is available for the right panel's "copy" button.

## Deliverables

Fill in two files completely — replace their stub content:
1. `src/notes.css` — all Notes module styles
2. `src/notes.js` — all Notes rendering logic

**Do not** modify `main.js`, `database.js`, `preload.js`, or `src/index.html`.

## Task 5.1 — Replace src/notes.css

```css
/* Notes module — three-column layout: doc list, editor, right panel. */

.notes-layout { display: flex; flex: 1; overflow: hidden; height: 100%; }

/* Document list sidebar */
.notes-sidebar-inner { display: flex; flex-direction: column; height: 100%; }
.notes-sidebar-header {
  padding: 10px; border-bottom: 0.5px solid var(--border);
  display: flex; gap: 6px; align-items: center; flex-shrink: 0;
}
.notes-sidebar-header button {
  background: var(--am); color: #fff; border: none;
  border-radius: var(--radius2); padding: 7px 12px;
  cursor: pointer; font-family: var(--jf); font-size: 12px;
  flex: 1; transition: opacity .12s;
}
.notes-sidebar-header button:hover { opacity: 0.9; }
.notes-list { flex: 1; overflow-y: auto; padding: 4px; }
.notes-item {
  padding: 9px 10px; cursor: pointer;
  border-radius: var(--radius2); margin-bottom: 3px;
  transition: background .12s;
  font-size: 12.5px; color: var(--text2);
  position: relative; border: 0.5px solid transparent;
}
.notes-item:hover { background: var(--bg3); color: var(--text); }
.notes-item.active { background: var(--ab); color: var(--at); border-color: var(--ab2); }
.notes-item-title {
  font-weight: 600; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; margin-bottom: 3px;
}
.notes-item-meta { font-size: 10px; color: var(--text3); font-family: sans-serif; }
.notes-item.active .notes-item-meta { color: var(--at); opacity: 0.7; }
.notes-item-delete {
  position: absolute; top: 50%; left: 8px; transform: translateY(-50%);
  background: none; border: none; color: var(--text3);
  font-size: 13px; cursor: pointer; opacity: 0;
  transition: opacity .12s; padding: 2px 4px;
}
.notes-item:hover .notes-item-delete { opacity: 1; }
.notes-item-delete:hover { color: #A32D2D; }
.notes-sidebar-empty {
  padding: 30px 12px; text-align: center;
  color: var(--text3); font-size: 12px; line-height: 1.7;
}

/* Main editor column */
.notes-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.notes-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: var(--text3);
}
.notes-empty-icon { font-size: 54px; margin-bottom: 14px; opacity: 0.35; }

/* Toolbar */
.notes-toolbar {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 14px; border-bottom: 0.5px solid var(--border);
  background: var(--bg); flex-wrap: wrap; flex-shrink: 0;
}
.notes-toolbar-group {
  display: flex; gap: 2px; padding: 0 6px;
  border-left: 0.5px solid var(--border);
}
.notes-toolbar-group:first-child { border-left: none; padding-left: 0; }
.notes-toolbar button, .notes-toolbar select {
  background: var(--bg2); border: 0.5px solid var(--border);
  color: var(--text2); padding: 5px 10px;
  border-radius: var(--radius2); cursor: pointer;
  font-family: var(--jf); font-size: 12px;
  transition: background .12s, color .12s, border-color .12s;
  min-width: 28px; height: 28px;
}
.notes-toolbar button:hover, .notes-toolbar select:hover {
  background: var(--bg3); color: var(--text); border-color: var(--border2);
}
.notes-toolbar button.active { background: var(--am); color: #fff; border-color: var(--am); }

/* Title bar */
.notes-title-bar {
  padding: 10px 20px; border-bottom: 0.5px solid var(--border);
  background: var(--bg); flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
}
.notes-title-input {
  flex: 1; background: none; border: none; outline: none;
  font-family: var(--jf); font-size: 18px; font-weight: 600;
  color: var(--text); padding: 4px 0; direction: rtl;
}
.notes-status { font-size: 10px; color: var(--text3); font-family: sans-serif; white-space: nowrap; }
.notes-status.saving { color: var(--am); }
.notes-status.saved { color: #3B6D11; }
.notes-status.error { color: #A32D2D; }

/* Editor */
.notes-editor-wrap { flex: 1; display: flex; overflow: hidden; min-height: 0; }
.notes-editor {
  flex: 1; overflow-y: auto;
  padding: 28px 36px; background: var(--bg);
  outline: none; color: var(--text);
  font-family: 'UKIJ Ekran', var(--jf);
  font-size: 15px; line-height: 1.9;
  direction: rtl; text-align: right;
}
.notes-editor:focus { outline: none; }
.notes-editor p { margin: 0 0 0.6em 0; }
.notes-editor ul, .notes-editor ol {
  padding-right: 24px; padding-left: 0; margin: 0.4em 0;
}
.notes-editor li { margin-bottom: 0.2em; }
.notes-editor blockquote {
  border-right: 3px solid var(--am);
  margin: 0.8em 0; padding: 0.3em 12px;
  color: var(--text2); background: var(--bg2);
}
.notes-editor mark { background: var(--ab2); color: var(--at); padding: 0 2px; border-radius: 2px; }
.notes-editor .ref-match {
  background: rgba(186,117,23,0.12);
  border-bottom: 1.5px dotted var(--am);
  cursor: help; padding: 0 1px;
}
.notes-editor .ref-match:hover { background: rgba(186,117,23,0.22); }

/* Right panel */
.notes-right-panel {
  width: 320px; background: var(--bg2);
  border-right: 0.5px solid var(--border);
  overflow: hidden; flex-shrink: 0;
  display: flex; flex-direction: column;
}
.notes-right-panel-tabs { display: flex; border-bottom: 0.5px solid var(--border); }
.notes-right-panel-tab {
  flex: 1; padding: 10px 10px; text-align: center;
  cursor: pointer; font-size: 12px; color: var(--text2);
  transition: background .12s, color .12s;
  border-bottom: 2px solid transparent; user-select: none;
}
.notes-right-panel-tab:hover { background: var(--bg3); }
.notes-right-panel-tab.active {
  color: var(--am); border-bottom-color: var(--am); font-weight: 600;
}
.notes-right-panel-content { flex: 1; overflow-y: auto; padding: 10px; }

/* Quran picker */
.notes-quran-picker {
  display: flex; gap: 6px; align-items: center;
  padding: 8px; background: var(--bg);
  border-radius: var(--radius2); margin-bottom: 10px;
}
.notes-quran-picker input {
  flex: 1; min-width: 0;
  background: var(--bg2); border: 0.5px solid var(--border);
  border-radius: var(--radius2); padding: 5px 8px;
  font-family: monospace; font-size: 12px;
  color: var(--text); text-align: center;
}
.notes-quran-picker button {
  background: var(--am); color: #fff; border: none;
  border-radius: var(--radius2); padding: 5px 10px;
  cursor: pointer; font-family: var(--jf); font-size: 12px;
  white-space: nowrap;
}
.notes-quran-preview {
  padding: 10px; background: var(--bg);
  border: 0.5px solid var(--border);
  border-radius: var(--radius2); margin-bottom: 8px;
}
.notes-quran-preview-ar {
  font-family: 'UthmanicHafs', serif;
  font-size: 18px; line-height: 1.8;
  direction: rtl; color: var(--text); margin-bottom: 6px;
}
.notes-quran-preview-ug {
  font-size: 12px; color: var(--text2);
  direction: rtl; margin-bottom: 8px; line-height: 1.6;
}
.notes-quran-preview-actions { display: flex; gap: 5px; }
.notes-quran-preview-actions button {
  flex: 1; padding: 4px 8px; font-size: 11px;
  background: var(--bg2); border: 0.5px solid var(--border);
  border-radius: var(--radius2); cursor: pointer;
  color: var(--text2); font-family: var(--jf);
  transition: background .12s;
}
.notes-quran-preview-actions button:hover {
  background: var(--ab); color: var(--at); border-color: var(--am);
}

/* References list (Prompt 6 populates it) */
.notes-ref-list { }
.notes-ref-item {
  padding: 10px; background: var(--bg);
  border: 0.5px solid var(--border);
  border-radius: var(--radius2); margin-bottom: 8px;
}
.notes-ref-word { font-size: 11px; color: var(--am); font-weight: 600; margin-bottom: 4px; direction: rtl; }
.notes-ref-source { font-size: 10px; color: var(--text3); margin-bottom: 6px; font-family: sans-serif; }
.notes-ref-snippet {
  font-size: 12px; color: var(--text2); line-height: 1.6;
  direction: rtl; max-height: 90px; overflow: hidden; margin-bottom: 6px;
}
.notes-ref-snippet mark { background: var(--ab2); color: var(--am); padding: 0 2px; }
.notes-ref-insert {
  background: var(--am); color: #fff; border: none;
  border-radius: var(--radius2); padding: 4px 10px;
  font-size: 11px; cursor: pointer; font-family: var(--jf);
}
.notes-ref-empty {
  text-align: center; color: var(--text3);
  font-size: 12px; padding: 40px 10px; line-height: 1.7;
}

/* Responsive */
@media (max-width: 1100px) { .notes-right-panel { width: 260px; } }
@media (max-width: 900px) { .notes-right-panel { display: none; } }
```

## Task 5.2 — Replace src/notes.js

```javascript
// Notes module (renderer-side). Offline rich-text editor with Quran quick-insert.
// Auto-reference matching is added in Prompt 6 — this file exposes a hook for it.
(function(){
  'use strict';

  function _s() { return window.S.notes; }

  let saveTimer = null;
  let editorEl = null;

  // ========== SIDEBAR ==========

  window.renderNotesSidebar = function renderNotesSidebar() {
    const h = `<div class="notes-sidebar-inner">
      <div class="notes-sidebar-header">
        <button onclick="window.notesCreate()">+ يېڭى خاتىرە</button>
      </div>
      <div class="notes-list" id="notes-list-inner">
        <div class="notes-sidebar-empty">يۈكلىنىۋاتىدۇ...</div>
      </div>
    </div>`;
    // Trigger async refresh after the HTML is inserted
    setTimeout(refreshNotesList, 50);
    return h;
  };

  async function refreshNotesList() {
    const list = document.getElementById('notes-list-inner');
    if (!list) return;

    const r = await window.electron.notesGetAll();
    if (!r.success) {
      list.innerHTML = `<div class="notes-sidebar-empty" style="color:#A32D2D">خاتالىق: ${escHtml(r.error || '')}</div>`;
      return;
    }

    _s().docs = r.docs;

    if (!r.docs.length) {
      list.innerHTML = `<div class="notes-sidebar-empty">
        ھازىرغىچە خاتىرە يوق<br><br>
        «+ يېڭى خاتىرە» بىلەن باشلاڭ
      </div>`;
      return;
    }

    let h = '';
    for (const d of r.docs) {
      const active = (_s().curDoc && d.id === _s().curDoc.id) ? 'active' : '';
      const updated = formatDate(d.updated_at);
      h += `<div class="notes-item ${active}" onclick="window.notesOpen(${d.id})">
        <div class="notes-item-title">${escHtml(d.title || 'يېڭى خاتىرە')}</div>
        <div class="notes-item-meta">${updated} · ${d.size} ھەرپ</div>
        <button class="notes-item-delete" onclick="window.notesDelete(${d.id}, event)" title="ئۆچۈرۈش">🗑</button>
      </div>`;
    }
    list.innerHTML = h;
  }

  function formatDate(iso) {
    try {
      const d = new Date((iso || '').replace(' ', 'T') + 'Z');
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString();
    } catch(e) { return ''; }
  }

  // ========== MAIN VIEW ==========

  window.renderNotesView = async function renderNotesView() {
    const main = document.getElementById('main');
    if (!main) return;
    main.innerHTML = `<div class="notes-layout">
      ${renderNotesMainColumn()}
      ${renderRightPanel()}
    </div>`;
    if (_s().curDoc) {
      mountEditor();
    }
  };

  function renderNotesMainColumn() {
    if (!_s().curDoc) {
      return `<div class="notes-main">
        <div class="notes-empty">
          <div class="notes-empty-icon">📝</div>
          <h3 style="font-size:16px;font-weight:600;color:var(--text2);margin-bottom:8px">خاتىرە يوق</h3>
          <p style="font-size:13px">يان تەرەپتىن بىر خاتىرە تاللاڭ<br>ياكى «+ يېڭى خاتىرە» بىلەن باشلاڭ</p>
        </div>
      </div>`;
    }

    const d = _s().curDoc;
    return `<div class="notes-main">
      <div class="notes-title-bar">
        <input type="text" class="notes-title-input" id="notes-title"
          value="${escAttr(d.title || '')}"
          placeholder="خاتىرە نامى..."
          oninput="window.notesOnTitleInput(this.value)">
        <span class="notes-status saved" id="notes-status">ساقلاندى</span>
      </div>
      ${renderToolbar()}
      <div class="notes-editor-wrap">
        <div class="notes-editor" id="notes-editor"
          contenteditable="true" spellcheck="false"></div>
      </div>
    </div>`;
  }

  function renderToolbar() {
    return `<div class="notes-toolbar">
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('bold')" title="توم (Ctrl+B)"><b>B</b></button>
        <button onclick="window.notesExec('italic')" title="يانتۇ (Ctrl+I)"><i>I</i></button>
        <button onclick="window.notesExec('underline')" title="ئاستى سىزىق (Ctrl+U)"><u>U</u></button>
      </div>
      <div class="notes-toolbar-group">
        <select onchange="window.notesSetFont(this.value);this.value=''" title="خەت نۇسخىسى">
          <option value="" disabled selected>فونت</option>
          <option value="UKIJ Ekran">UKIJ Ekran</option>
          <option value="UKIJ Tuz">UKIJ Tuz</option>
          <option value="UKIJ Tuz Tom">UKIJ Tuz Tom</option>
          <option value="UKIJ Tuz Kitab">UKIJ Tuz Kitab</option>
          <option value="UKIJ Esliye">UKIJ Esliye</option>
          <option value="UthmanicHafs">Uthmanic Hafs</option>
          <option value="Bahij Nazanin">Bahij Nazanin</option>
        </select>
        <select onchange="window.notesSetSize(this.value);this.value=''" title="خەت چوڭلۇقى">
          <option value="" disabled selected>چوڭلۇق</option>
          <option value="2">كىچىك</option>
          <option value="3">نورمال</option>
          <option value="4">چوڭ</option>
          <option value="5">ناھايىتى چوڭ</option>
          <option value="6">قاتتىق چوڭ</option>
        </select>
      </div>
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('insertUnorderedList')" title="نۇقتىلىق تىزىملىك">•</button>
        <button onclick="window.notesExec('insertOrderedList')" title="نومۇرلۇق تىزىملىك">1.</button>
        <button onclick="window.notesExec('formatBlock','blockquote')" title="نەقىل">❝</button>
      </div>
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('justifyRight')" title="ئوڭغا">⟹</button>
        <button onclick="window.notesExec('justifyCenter')" title="ئوتتۇرىدا">≡</button>
        <button onclick="window.notesExec('justifyLeft')" title="سولغا">⟸</button>
      </div>
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('removeFormat')" title="فورماتنى ئۆچۈرۈش">✕</button>
        <button onclick="window.notesSaveNow()" title="ھازىرلا ساقلاش (Ctrl+S)">💾</button>
      </div>
    </div>`;
  }

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

  function renderQuranPicker() {
    const sura = _s().quickSura || '';
    const aya = _s().quickAya || '';
    const withTr = _s().quickWithTr !== false;
    return `<div>
      <div class="notes-quran-picker">
        <input type="number" id="notes-q-sura" min="1" max="114" placeholder="سۈرە" value="${sura}"
          onkeydown="if(event.key==='Enter')window.notesQuranPreview()">
        <span style="color:var(--text3);font-size:12px">:</span>
        <input type="number" id="notes-q-aya" min="1" placeholder="ئايەت" value="${aya}"
          onkeydown="if(event.key==='Enter')window.notesQuranPreview()">
        <button onclick="window.notesQuranPreview()">كۆرۈش</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);margin-bottom:12px;cursor:pointer">
        <input type="checkbox" id="notes-q-tr" ${withTr?'checked':''} onchange="window.notesToggleQuickTr(this.checked)">
        <span>تەرجىمىسى بىلەن</span>
      </label>
      <div id="notes-q-preview"></div>
    </div>`;
  }

  function renderRefsEmpty() {
    return `<div id="notes-refs-content" class="notes-ref-list">
      <div class="notes-ref-empty">
        كىتابلاردىن تېپىلغان<br>
        مەنبىلەر بۇ يەردە كۆرۈنىدۇ<br><br>
        تەھرىرلىگۈچكە يازسىڭىز<br>ئاپتوماتىك چىقىدۇ
      </div>
    </div>`;
  }

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

  window.notesToggleQuickTr = function(checked) {
    _s().quickWithTr = !!checked;
  };

  // ========== DOCUMENT CRUD ==========

  window.notesCreate = async function() {
    // Save current first if dirty
    if (_s().dirty && _s().curDoc) await saveNow();

    const r = await window.electron.notesCreate('يېڭى خاتىرە');
    if (!r.success) {
      if (typeof showToast === 'function') showToast('ياساش مۇۋەپپەقىيەتسىز بولدى', 'e');
      return;
    }
    await refreshNotesList();
    await window.notesOpen(r.id);
  };

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

  window.notesDelete = async function(id, ev) {
    if (ev) ev.stopPropagation();
    const doc = _s().docs.find(d => d.id === id);
    const title = doc ? doc.title : '';
    if (!confirm(`«${title}» دېگەن خاتىرىنى ئۆچۈرەمسىز؟\nبۇ ئىش قايتۇرۇپ بولمايدۇ.`)) return;

    const r = await window.electron.notesDelete(id);
    if (!r.success) {
      if (typeof showToast === 'function') showToast('ئۆچۈرۈش مۇۋەپپەقىيەتسىز', 'e');
      return;
    }
    if (_s().curDoc && _s().curDoc.id === id) {
      _s().curDoc = null;
      _s().matches = new Map();
    }
    await refreshNotesList();
    if (!_s().curDoc) await window.renderNotesView();
    if (typeof showToast === 'function') showToast('ئۆچۈرۈلدى', 's');
  };

  window.notesOnTitleInput = function(val) {
    if (!_s().curDoc) return;
    _s().curDoc.title = val;
    markDirty();
  };

  // ========== EDITOR ==========

  function mountEditor() {
    editorEl = document.getElementById('notes-editor');
    if (!editorEl) return;
    editorEl.innerHTML = _s().curDoc.content_html || '<p><br></p>';

    editorEl.addEventListener('input', () => {
      markDirty();
      // Hook for Prompt 6 — n-gram reference scanner
      if (typeof window.notesScanReferences === 'function') {
        window.notesScanReferences();
      }
    });

    editorEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow();
      }
    });

    // Focus at end of content
    placeCaretAtEnd(editorEl);
  }

  function placeCaretAtEnd(el) {
    try {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e) {}
  }

  window.notesExec = function(cmd, arg) {
    if (!editorEl) return;
    editorEl.focus();
    document.execCommand(cmd, false, arg);
    markDirty();
  };

  window.notesSetFont = function(font) {
    if (!editorEl || !font) return;
    editorEl.focus();
    document.execCommand('fontName', false, font);
    markDirty();
  };

  window.notesSetSize = function(size) {
    if (!editorEl || !size) return;
    editorEl.focus();
    document.execCommand('fontSize', false, size);
    markDirty();
  };

  window.notesSaveNow = function() { saveNow(); };

  function markDirty() {
    if (!_s().curDoc) return;
    _s().dirty = true;
    setStatus('saving', 'ساقلىنىۋاتىدۇ...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 3000);
  }

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

  function setStatus(cls, text) {
    const el = document.getElementById('notes-status');
    if (!el) return;
    el.className = 'notes-status ' + cls;
    el.textContent = text;
  }

  // ========== QURAN QUICK-INSERT ==========

  window.notesQuranPreview = async function() {
    const suraEl = document.getElementById('notes-q-sura');
    const ayaEl = document.getElementById('notes-q-aya');
    const trEl = document.getElementById('notes-q-tr');
    const sura = parseInt(suraEl ? suraEl.value : '', 10);
    const aya = parseInt(ayaEl ? ayaEl.value : '', 10);
    const withTr = trEl ? trEl.checked : true;

    if (!sura || sura < 1 || sura > 114 || !aya || aya < 1) {
      if (typeof showToast === 'function') showToast('توغرا سۈرە/ئايەت نومۇرى كىرگۈزۈڭ', 'e');
      return;
    }
    _s().quickSura = sura;
    _s().quickAya = aya;
    _s().quickWithTr = withTr;

    const r = await window.electron.quranGetAya(sura, aya);
    const preview = document.getElementById('notes-q-preview');
    if (!preview) return;

    if (!r.success || !r.aya) {
      preview.innerHTML = `<div style="padding:10px;color:#A32D2D;font-size:12px">بۇ ئايەت تېپىلمىدى</div>`;
      return;
    }
    const a = r.aya;
    preview.innerHTML = `
      <div class="notes-quran-preview">
        <div class="notes-quran-preview-ar">${escHtml(a.text_ar)}</div>
        ${a.text_ug && withTr ? `<div class="notes-quran-preview-ug">${escHtml(a.text_ug)}</div>` : ''}
        <div class="notes-quran-preview-actions">
          <button onclick="window.notesInsertAya(${sura}, ${aya}, ${withTr})">📝 قىستۇرۇش</button>
          <button onclick="window.notesCopyAya(${sura}, ${aya}, ${withTr})">📋 كۆچۈرۈش</button>
        </div>
      </div>`;
  };

  window.notesInsertAya = async function(sura, aya, withTr) {
    if (!editorEl) {
      if (typeof showToast === 'function') showToast('تەھرىرلىگۈچ ئېچىلمىغان', 'e');
      return;
    }
    const r = await window.electron.quranGetAya(sura, aya);
    if (!r.success || !r.aya) return;
    const a = r.aya;

    const AR_STYLE = "font-family:'UthmanicHafs',serif;font-size:18pt;line-height:1.9";
    const UG_STYLE = "font-family:'UKIJ Ekran',sans-serif;font-size:13pt;line-height:1.7;color:#555";

    let insertHtml;
    if (withTr && a.text_ug) {
      insertHtml = `<p dir="rtl">` +
        `<span style="${AR_STYLE}">\uFD3F${escHtml(a.text_ar)}\uFD3E</span>` +
        `<br>` +
        `<span style="${UG_STYLE}">\u00AB${escHtml(a.text_ug)}\u00BB</span>` +
      `</p><p><br></p>`;
    } else {
      insertHtml = `<p dir="rtl">` +
        `<span style="${AR_STYLE}">\uFD3F${escHtml(a.text_ar)}\uFD3E</span>` +
      `</p><p><br></p>`;
    }

    editorEl.focus();
    document.execCommand('insertHTML', false, insertHtml);
    markDirty();
    if (typeof showToast === 'function') showToast('ئايەت قىستۇرۇلدى', 's');
  };

  window.notesCopyAya = async function(sura, aya, withTr) {
    if (!window.QuranCopy || typeof window.QuranCopy.copyAyaToClipboard !== 'function') {
      if (typeof showToast === 'function') showToast('كۆچۈرۈش مودۇلى تېپىلمىدى', 'e');
      return;
    }
    const r = await window.electron.quranGetAya(sura, aya);
    if (!r.success || !r.aya) return;
    const ok = await window.QuranCopy.copyAyaToClipboard([r.aya], withTr);
    if (typeof showToast === 'function') {
      showToast(ok ? 'كۆچۈرۈلدى' : 'كۆچۈرۈش مۇۋەپپەقىيەتسىز', ok ? 's' : 'e');
    }
  };

  // ========== HELPERS ==========

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escAttr(s) { return escHtml(s); }

  // Expose internals for Prompt 6
  window.NotesInternal = {
    getEditor: () => editorEl,
    getState: _s,
    markDirty,
    escHtml
  };
})();
```

## Acceptance Criteria

Open app → click 📝 خاتىرە دەپتىرىم:

### Document CRUD
1. Sidebar shows "+ يېڭى خاتىرە" button and empty state message.
2. Click "+ يېڭى خاتىرە" → new doc "يېڭى خاتىرە" appears in sidebar and opens with empty editor. Status is "ساقلاندى".
3. In title input, type "سىناق 1". After 3 seconds, status shows "ساقلاندى" again, sidebar title updates.
4. In editor, type a few paragraphs of Uyghur text. Status goes to "ساقلىنىۋاتىدۇ..." then "ساقلاندى".
5. Create 2 more notes. All 3 appear in sidebar sorted by most-recently-updated.
6. Click another note → current is saved first, then the selected opens.
7. Delete a note via trash icon → confirmation dialog, then removed.

### Editor formatting
8. Select some text → click **B** → becomes bold. Click again → bold removed.
9. Italic, Underline work similarly.
10. Font dropdown: select "UKIJ Tuz Kitab" → selected text changes font. Select "Uthmanic Hafs" → font changes.
11. Size dropdown: try "چوڭ" and "كىچىك" — size changes.
12. Bullet list, numbered list, blockquote buttons work.
13. Alignment buttons work.
14. Ctrl+Z (undo), Ctrl+Y (redo) work (browser default).
15. Ctrl+S → immediate save, status flashes "ساقلىنىۋاتىدۇ..." → "ساقلاندى".

### Quran quick-insert
16. Right panel has two tabs: 📖 قۇرئان (default) and 🔗 مەنبە.
17. In Quran tab, type 2 / 255, check "تەرجىمىسى بىلەن", click "كۆرۈش" → Ayat al-Kursi preview appears with Arabic and Uyghur text.
18. Click "قىستۇرۇش" → aya inserted into editor at cursor with format `﴿...﴾` + new line + `«...»`, using Uthmanic Hafs and UKIJ Ekran fonts. Toast "ئايەت قىستۇرۇلدى".
19. Click "كۆچۈرۈش" → Paste in MS Word → font preserved, correct format.
20. Uncheck "تەرجىمىسى بىلەن" → "قىستۇرۇش" → only Arabic inserted.
21. Switch to "🔗 مەنبە" tab → shows empty-state message (Prompt 6 will fill this).

### Persistence
22. Close app, reopen → all notes persist, contents preserved. Fonts, Bold, Italic, lists all preserved.

### Library mode integrity
23. Switch back to 📚 كىتابلار → library still works 100%.

## Rules

- Uyghur UI strings only; English code comments.
- `execCommand` is deprecated in W3C spec but fully functional in Chromium/Electron. Use it.
- `direction: rtl` and `text-align: right` on `.notes-editor` are required.
- Auto-save debounce 3s. Manual save is instant via Ctrl+S.
- Reuse `window.QuranCopy.copyAyaToClipboard` — don't duplicate clipboard logic.
- `window.NotesInternal` is the extension point for Prompt 6 — do not rename it.
- After finishing, report files touched, then ask me to test.
