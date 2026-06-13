// Notes module (renderer-side). Offline rich-text editor with Quran quick-insert.
// Auto-reference matching is added in Prompt 6 — this file exposes a hook for it.
(function(){
  'use strict';

  // Ensure global state is reachable on window (index.html declares S as const)
  try { if (!window.S && typeof S !== 'undefined') window.S = S; } catch(e) {}

  function _s() { return window.S.notes; }

  let saveTimer = null;
  let editorEl = null;

  // Save coordination: prevents data loss when user edits during in-flight save.
  // Each markDirty() bumps saveVersion. saveNow() snapshots the version when it
  // starts; only clears the dirty flag if no newer edits happened during await.
  let saveVersion = 0;
  let saveInFlight = false;
  let pendingSaveAfterFlight = false;

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
    // Restore the persisted collapse state for the two side panels before
    // building the layout (Phase 2 — collapsible panels).
    await loadCollapseState();
    main.innerHTML = `<div class="notes-layout">
      ${renderNotesMainColumn()}
      ${renderRightPanel()}
      ${renderNaiPanel()}
    </div>
    <!-- Floating edge handles to re-open a collapsed panel (Claude-desktop style).
         RTL: notes list (#side) sits on the physical RIGHT, the قۇرئان/مەنبە
         panel on the physical LEFT — so pick the edge + arrow by physical side. -->
    <div class="notes-edge-handle notes-edge-right" id="notes-edge-list"
      onclick="window.notesToggleList()" title="خاتىرىلەر تىزىملىكىنى ئېچىش (Ctrl+\\)">❮</div>
    <div class="notes-edge-handle notes-edge-left" id="notes-edge-panel"
      onclick="window.notesTogglePanel()" title="قۇرئان/مەنبە تاختىسىنى ئېچىش (Ctrl+Shift+\\)">❯</div>
    <!-- Reopen handle for the AI Q&A drawer (offset so it never overlaps the
         قۇرئان/مەنبە handle). Shown only when the drawer was closed. -->
    <div class="notes-edge-handle notes-edge-left" id="nai-edge" style="top:34%;display:none"
      onclick="window.naiReopen()" title="سۈنئىي ئىدراك تاختىسىنى ئېچىش">❯</div>`;
    applyCollapseState();
    if (_s().curDoc) {
      await mountEditor();
    }
  };

  // ========== COLLAPSIBLE SIDE PANELS (Phase 2) ==========
  // Two panels collapse/expand with a smooth width animation: the notes list
  // (the GLOBAL #side sidebar, only while in notes mode) and the .notes-right-
  // panel (قۇرئان/مەنبە). State persists across restarts via the settings IPC.

  async function loadCollapseState() {
    const read = async (key) => {
      try {
        const r = await window.electron.dbGetSetting(key, '0');
        const v = (r && typeof r === 'object' && 'value' in r) ? r.value : r;
        return (v === '1' || v === 1 || v === true);
      } catch (e) { return false; }
    };
    _s().listCollapsed = await read('notes_list_collapsed');
    _s().panelCollapsed = await read('notes_panel_collapsed');
  }

  function applyListCollapsed(collapsed) {
    const side = document.getElementById('side');
    if (side) side.classList.toggle('side-collapsed', !!collapsed);
    const handle = document.getElementById('notes-edge-list');
    if (handle) handle.style.display = collapsed ? 'flex' : 'none';
    const btn = document.getElementById('notes-collapse-list-btn');
    if (btn) btn.classList.toggle('active', !!collapsed);
  }

  function applyPanelCollapsed(collapsed) {
    const panel = document.querySelector('.notes-right-panel');
    if (panel) panel.classList.toggle('collapsed', !!collapsed);
    const handle = document.getElementById('notes-edge-panel');
    if (handle) handle.style.display = collapsed ? 'flex' : 'none';
    const btn = document.getElementById('notes-collapse-panel-btn');
    if (btn) btn.classList.toggle('active', !!collapsed);
  }

  function applyCollapseState() {
    applyListCollapsed(_s().listCollapsed);
    applyPanelCollapsed(_s().panelCollapsed);
  }
  // Exposed so setMode() can re-apply the saved state when (re-)entering notes.
  window.notesApplyCollapseState = applyCollapseState;

  window.notesToggleList = function notesToggleList() {
    const st = _s();
    st.listCollapsed = !st.listCollapsed;
    applyListCollapsed(st.listCollapsed);
    try { window.electron.dbSetSetting('notes_list_collapsed', st.listCollapsed ? '1' : '0'); } catch (e) {}
  };

  window.notesTogglePanel = function notesTogglePanel() {
    const st = _s();
    st.panelCollapsed = !st.panelCollapsed;
    applyPanelCollapsed(st.panelCollapsed);
    try { window.electron.dbSetSetting('notes_panel_collapsed', st.panelCollapsed ? '1' : '0'); } catch (e) {}
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
        <button class="notes-collapse-btn" id="notes-collapse-list-btn" type="button"
          onclick="window.notesToggleList()"
          title="خاتىرىلەر تىزىملىكىنى يىغىش/ئېچىش (Ctrl+\\)">◨</button>
        <input type="text" class="notes-title-input" id="notes-title"
          value="${escAttr(d.title || '')}"
          placeholder="خاتىرە نامى..."
          oninput="window.notesOnTitleInput(this.value)">
        <span class="notes-status saved" id="notes-status">ساقلاندى</span>
        <button class="notes-collapse-btn" id="notes-collapse-panel-btn" type="button"
          onclick="window.notesTogglePanel()"
          title="قۇرئان/مەنبە تاختىسىنى يىغىش/ئېچىش (Ctrl+Shift+\\)">◧</button>
      </div>
      ${renderToolbar()}
      <div class="notes-toggle-bar">
        <label class="notes-toggle-label">
          <input type="checkbox" id="notes-toggle-refscan" onchange="window.notesToggleRefScan(this.checked)">
          <span>كىتاب ئامبىرىدىن ئىزدەش (تورسىز)</span>
        </label>
        <label class="notes-toggle-label">
          <input type="checkbox" id="notes-toggle-spellcheck" onchange="window.notesToggleSpellCheck(this.checked)">
          <span>ئىملانى تەكشۈرۈش (تورسىز)</span>
        </label>
        <div class="notes-ai-menu-wrap" id="notes-ai-menu-wrap">
          <button type="button" class="notes-ai-trigger" id="notes-ai-trigger" onclick="window.naiToggleMenu(event)">✨ سۈنئىي ئىدراك ئىقتىدارلىرى (Gemini API — تور ھالىتىدە) ▾</button>
          <div class="notes-ai-flyout" id="notes-ai-flyout">
            <div class="notes-ai-item notes-ai-has-sub">
              <span class="notes-ai-item-label">تەرجىمە قىلىش ◂</span>
              <div class="notes-ai-submenu">
                <button type="button" onclick="window.naiTranslate('uy','ar')">ئۇيغۇرچىدىن ئەرەبچىگە</button>
                <button type="button" onclick="window.naiTranslate('ar','uy')">ئەرەبچىدىن ئۇيغۇرچىگە</button>
                <button type="button" onclick="window.naiTranslate('uy','en')">ئۇيغۇرچىدىن ئىنگلىزچىگە</button>
                <button type="button" onclick="window.naiTranslate('en','uy')">ئىنگلىزچىدىن ئۇيغۇرچىگە</button>
                <button type="button" onclick="window.naiTranslate('uy','tr')">ئۇيغۇرچىدىن تۈركچىگە</button>
                <button type="button" onclick="window.naiTranslate('tr','uy')">تۈركچىدىن ئۇيغۇرچىگە</button>
              </div>
            </div>
            <button type="button" class="notes-ai-item" onclick="window.naiProofread()">تىنىش بەلگىلىرى ۋە ئىملانى توغرىلاش</button>
            <button type="button" class="notes-ai-item" onclick="window.naiChatOpen()">سۈنئىي ئىدراكتىن سوراش</button>
            <div class="notes-ai-item notes-ai-has-sub">
              <span class="notes-ai-item-label">كۆرۈنمە بەت ھەققىدە سوئال سوراش ◂</span>
              <div class="notes-ai-submenu">
                <button type="button" onclick="window.naiPageQA('summary')">خۇلاسىلەش</button>
                <button type="button" onclick="window.naiPageQA('explain')">ئاددىي چۈشەندۈرۈش</button>
                <button type="button" onclick="window.naiPageQA('other')">باشقا...</button>
              </div>
            </div>
          </div>
        </div>
      </div>
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
        <button id="notes-fp-btn" type="button" onmousedown="window.notesFpPress(event)"
          title="فورمات سۈپۈرگىسى (Alt+Ctrl+C / Alt+Ctrl+V)">🖌</button>
      </div>
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('removeFormat')" title="فورماتنى ئۆچۈرۈش">✕</button>
        <button onclick="window.notesSaveNow()" title="ھازىرلا ساقلاش (Ctrl+S)">💾</button>
      </div>
    </div>`;
  }

  // Notebook AI drawer (Phase 4). Rendered as the LAST child of .notes-layout
  // so in RTL it sits on the physical LEFT edge (where the owner wants the Q&A
  // window). Hidden until an AI function opens it; the nai* logic lives in
  // index.html (window.AI.askStream/chatStream → main process). Clones the
  // reader drawer's look (#rai-panel).
  function renderNaiPanel() {
    return `<div id="nai-panel">
      <div id="nai-header">
        <span id="nai-title">✨ سۈنئىي ئىدراك</span>
        <button type="button" class="nai-x" onclick="window.naiClose()" title="تاقاش">✕</button>
      </div>
      <div id="nai-body">
        <div id="nai-status"></div>
        <div id="nai-result"></div>
        <div id="nai-extra" style="display:none"></div>
        <div id="nai-actions" style="display:none"></div>
        <div id="nai-chatbar" style="display:none">
          <textarea id="nai-chat-input" placeholder="سوئالىڭىزنى يېزىڭ..."
            onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();window.naiChatSend();}"></textarea>
          <button type="button" onclick="window.naiChatSend()">ئەۋەت</button>
        </div>
      </div>
    </div>`;
  }

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

  async function mountEditor() {
    // Load toggle preferences (default: ref-scan ON, spell-check OFF)
    try {
      const refRes = await window.electron.dbGetSetting('notes_ref_scan', 'on');
      const refVal = (refRes && typeof refRes === 'object' && 'value' in refRes) ? refRes.value : refRes;
      _s().refScanEnabled = (refVal !== 'off');

      const spRes = await window.electron.dbGetSetting('notes_spell_check', 'off');
      const spVal = (spRes && typeof spRes === 'object' && 'value' in spRes) ? spRes.value : spRes;
      _s().spellCheckEnabled = (spVal === 'on');
    } catch (e) {
      _s().refScanEnabled = true;
      _s().spellCheckEnabled = false;
    }

    // Reflect loaded prefs into the toggle-bar checkboxes (rendered with the main column)
    const refCb = document.getElementById('notes-toggle-refscan');
    if (refCb) refCb.checked = !!_s().refScanEnabled;
    const spCb = document.getElementById('notes-toggle-spellcheck');
    if (spCb) spCb.checked = !!_s().spellCheckEnabled;

    // Switching documents (re-mounting the editor) always disarms the format
    // painter (its captured format belonged to the previous editor) and aborts
    // any in-flight notebook AI stream that targeted the old drawer.
    fpDisarm();
    if (typeof window.naiAbort === 'function') window.naiAbort();

    editorEl = document.getElementById('notes-editor');
    if (!editorEl) return;
    const safeHtml = (window.SafeHTML && window.SafeHTML.sanitize)
      ? window.SafeHTML.sanitize(_s().curDoc.content_html || '')
      : (_s().curDoc.content_html || '');
    editorEl.innerHTML = safeHtml || '<p><br></p>';

    editorEl.addEventListener('input', () => {
      markDirty();
      // Hook for Prompt 6 — n-gram reference scanner
      if (typeof window.notesScanReferences === 'function') {
        window.notesScanReferences();
      }
      // Spell check (debounced)
      if (_s().spellCheckEnabled && typeof window.notesRunSpellCheck === 'function') {
        clearTimeout(_s()._spellTimer);
        _s()._spellTimer = setTimeout(() => window.notesRunSpellCheck(), 800);
      }
    });

    editorEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow();
        return;
      }
      // Format painter (Word parity): Alt+Ctrl+C captures + arms (one-shot);
      // Alt+Ctrl+V applies the captured format to the selection. Legacy
      // Ctrl+Shift+C / Ctrl+Shift+V also accepted. Esc always disarms.
      const k = e.key.toLowerCase();
      const fpMod = (e.ctrlKey || e.metaKey) && (e.altKey || e.shiftKey);
      if (fpMod && k === 'c') {
        e.preventDefault();
        fpFormat = fpCaptureFormat();
        fpArm(false);
        return;
      }
      if (fpMod && k === 'v') {
        e.preventDefault();
        if (!fpFormat) return;
        fpApplyFormat();
        if (!fpSticky) fpDisarm();
        return;
      }
      if (e.key === 'Escape' && fpArmed) {
        e.preventDefault();
        fpDisarm();
        return;
      }
    });

    // One-shot paint: while armed, the next non-collapsed selection the user
    // makes in the editor receives the captured format, then disarms (unless
    // sticky). Deferred so the selection is finalized after mouseup.
    editorEl.addEventListener('mouseup', () => {
      if (!fpArmed) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.anchorNode && editorEl.contains(sel.anchorNode)) {
          fpApplyFormat();
          if (!fpSticky) fpDisarm();
        }
      }, 0);
    });

    // Sanitize pasted HTML — XSS defense-in-depth
    editorEl.addEventListener('paste', (e) => {
      // Only intercept HTML clipboard data; plain text is already safe
      const html = e.clipboardData && e.clipboardData.getData('text/html');
      if (!html) return; // let the browser paste plain text normally

      e.preventDefault();
      const safeHtml = (window.SafeHTML && window.SafeHTML.sanitize)
        ? window.SafeHTML.sanitize(html)
        : '';

      if (safeHtml) {
        document.execCommand('insertHTML', false, safeHtml);
      } else {
        // Fall back to plain text
        const text = e.clipboardData.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
      }
      markDirty();
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

  // ========== FORMAT PAINTER (Phase 3) — Word's «سۈپۈرگە» ==========
  // Capture the formatting at the caret/selection, then paint it onto the next
  // selection. One-shot by default; double-click the toolbar button for sticky
  // mode. State is module-local and resets on doc switch / leaving notes.

  let fpArmed = false;     // paint mode active
  let fpSticky = false;    // keep painting until Esc / button click
  let fpFormat = null;     // captured format descriptor
  let fpPressTimer = null; // single- vs double-click discrimination

  // Map a pixel size onto execCommand fontSize's 1–7 scale (as notesSetSize uses).
  function fpPxToSize(px) {
    const table = [10, 13, 16, 18, 24, 32, 48]; // sizes 1..7
    let best = 3, bestD = Infinity;
    for (let i = 0; i < table.length; i++) {
      const d = Math.abs(px - table[i]);
      if (d < bestD) { bestD = d; best = i + 1; }
    }
    return best;
  }
  function fpRgbToHex(c) {
    const m = String(c || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return c;
    const h = (n) => ('0' + parseInt(n, 10).toString(16)).slice(-2);
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }
  function fpIsTransparent(c) {
    const s = String(c || '').replace(/\s/g, '');
    return !s || s === 'transparent' || /rgba\(\d+,\d+,\d+,0(\.0+)?\)/.test(s);
  }

  // Read the computed format at the current selection's anchor element.
  function fpCaptureFormat() {
    if (!editorEl) return null;
    const sel = window.getSelection();
    let node = (sel && sel.rangeCount) ? sel.getRangeAt(0).startContainer : null;
    let el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el || !editorEl.contains(el)) el = editorEl;
    const cs = window.getComputedStyle(el);
    // Nearest block ancestor for text-align + blockquote.
    let block = el;
    while (block && block !== editorEl && !/^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(block.tagName || '')) {
      block = block.parentElement;
    }
    const bcs = block && block !== editorEl ? window.getComputedStyle(block) : cs;
    const td = (cs.textDecorationLine || cs.textDecoration || '');
    return {
      bold: parseInt(cs.fontWeight, 10) >= 600,
      italic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
      underline: /underline/.test(td),
      strike: /line-through/.test(td),
      fontFamily: (cs.fontFamily || '').split(',')[0].replace(/^["']|["']$/g, '').trim(),
      fontSizePx: parseFloat(cs.fontSize) || 0,
      color: cs.color,
      background: cs.backgroundColor,
      align: bcs.textAlign,
      blockquote: !!(block && block.tagName === 'BLOCKQUOTE')
    };
  }

  // Apply the captured format to the current (non-collapsed) selection.
  function fpApplyFormat() {
    if (!editorEl || !fpFormat) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode || !editorEl.contains(sel.anchorNode)) return;
    editorEl.focus();
    const f = fpFormat;
    // Toggle inline marks to MATCH the source — painting from plain text REMOVES
    // bold/italic/etc on the target (Word parity).
    if (document.queryCommandState('bold') !== f.bold) document.execCommand('bold');
    if (document.queryCommandState('italic') !== f.italic) document.execCommand('italic');
    if (document.queryCommandState('underline') !== f.underline) document.execCommand('underline');
    if (document.queryCommandState('strikeThrough') !== f.strike) document.execCommand('strikeThrough');
    if (f.fontFamily) document.execCommand('fontName', false, f.fontFamily);
    if (f.fontSizePx) document.execCommand('fontSize', false, String(fpPxToSize(f.fontSizePx)));
    if (f.color) document.execCommand('foreColor', false, fpRgbToHex(f.color));
    if (f.background && !fpIsTransparent(f.background)) {
      document.execCommand('hiliteColor', false, fpRgbToHex(f.background));
    }
    // Block-level bits.
    if (f.align === 'center') document.execCommand('justifyCenter');
    else if (f.align === 'left') document.execCommand('justifyLeft');
    else if (f.align === 'right' || f.align === 'start') document.execCommand('justifyRight');
    document.execCommand('formatBlock', false, f.blockquote ? 'blockquote' : 'p');
    markDirty();
  }

  function fpArm(sticky) {
    if (!editorEl || !fpFormat) return;
    fpArmed = true;
    fpSticky = !!sticky;
    editorEl.classList.add('fp-armed');
    const btn = document.getElementById('notes-fp-btn');
    if (btn) btn.classList.add('active');
    if (typeof window.toast === 'function') {
      window.toast(sticky ? 'سۈپۈرگە: ئۈزلۈكسىز (Esc توختىتىدۇ)' : 'سۈپۈرگە: بىر قېتىملىق', 'i');
    }
  }

  function fpDisarm() {
    fpArmed = false;
    fpSticky = false;
    if (editorEl) editorEl.classList.remove('fp-armed');
    const btn = document.getElementById('notes-fp-btn');
    if (btn) btn.classList.remove('active');
  }

  // Toolbar button press (mousedown, default-prevented so the editor keeps its
  // selection). One press = one-shot (or toggle off if already armed); two
  // quick presses = sticky.
  window.notesFpPress = function notesFpPress(ev) {
    if (ev) ev.preventDefault();
    if (!editorEl) return;
    if (fpPressTimer) {                       // second press → sticky
      clearTimeout(fpPressTimer); fpPressTimer = null;
      fpFormat = fpCaptureFormat();
      fpArm(true);
      return;
    }
    const captured = fpCaptureFormat();
    fpPressTimer = setTimeout(() => {
      fpPressTimer = null;
      if (fpArmed) { fpDisarm(); return; }    // armed → clicking again disarms
      fpFormat = captured;
      fpArm(false);
    }, 220);
  };

  // Exposed so setMode() can disarm when leaving notes mode.
  window.notesDisarmFormatPainter = fpDisarm;

  function markDirty() {
    if (!_s().curDoc) return;
    _s().dirty = true;
    saveVersion++;
    setStatus('saving', 'ساقلىنىۋاتىدۇ...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 3000);
  }

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
    const safeInsert = (window.SafeHTML && window.SafeHTML.sanitize)
      ? window.SafeHTML.sanitize(insertHtml)
      : insertHtml;
    document.execCommand('insertHTML', false, safeInsert);
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

  // ========== REFERENCE SCANNING (Prompt 6) ==========

  let scanTimer = null;
  let lastScannedText = '';

  function scheduleScan() {
    if (!_s().refScanEnabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(runScan, 400);
  }

  window.notesToggleRefScan = async function(checked) {
    _s().refScanEnabled = !!checked;
    try { await window.electron.dbSetSetting('notes_ref_scan', checked ? 'on' : 'off'); } catch(e) {}
    if (!checked) {
      _s().matches = new Map();
      unwrapAllRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
    } else {
      lastScannedText = '';
      scheduleScan();
    }
  };

  window.notesToggleSpellCheck = async function(checked) {
    _s().spellCheckEnabled = !!checked;
    try { await window.electron.dbSetSetting('notes_spell_check', checked ? 'on' : 'off'); } catch(e) {}
    if (checked && typeof window.notesRunSpellCheck === 'function') {
      // First-time load is heavy (~10–20 s to build the SymSpell index over
      // 441K words). Surface a toast so the user knows something is happening.
      const sc = window.SpellCheck;
      const ready = sc && typeof sc.isReady === 'function' && sc.isReady();
      if (!ready && typeof showToast === 'function') {
        showToast('ئىملا لۇغىتى يۈكلىنىۋاتىدۇ...', 'i');
      }
      window.notesRunSpellCheck();
    } else if (!checked && typeof window.notesClearSpellCheck === 'function') {
      window.notesClearSpellCheck();
    }
  };

  // The hook that notes.js editor input listener calls
  window.notesScanReferences = scheduleScan;

  // Returns the plain text of the editor MINUS any inserted reference
  // blockquotes ([data-ref-insert="1"]). Inserted quotes must not feed the
  // scanner — otherwise every word in them would re-match the source book.
  function getScannableText() {
    if (!editorEl) return '';
    const clone = editorEl.cloneNode(true);
    clone.querySelectorAll('[data-ref-insert="1"], .notes-inserted-ref').forEach(n => n.remove());
    return clone.innerText || '';
  }

  async function runScan() {
    if (!editorEl || !window.NGram) return;
    const text = getScannableText();
    if (text === lastScannedText) return;
    lastScannedText = text;

    if (!text.trim() || text.length < 10) {
      _s().matches = new Map();
      unwrapAllRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
      return;
    }

    const candidates = window.NGram.extractCandidates(text);
    if (!candidates.length) {
      _s().matches = new Map();
      unwrapAllRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
      return;
    }

    try {
      const matches = await window.NGram.findReferences(candidates, {
        perWordSnippets: 3,
        maxBooks: 10
      });
      // If the user edited during the async scan, our results may be stale.
      // Check again before applying.
      if (getScannableText() !== lastScannedText) return;
      _s().matches = matches;
      wrapRefMatchesInEditor();
      // Update cache AFTER wrapping so span insertion doesn't trigger a redundant re-scan
      lastScannedText = getScannableText();
      if (_s().rightTab === 'refs') renderRefsPanel();
    } catch(e) {
      console.error('[notes] reference scan failed:', e);
    }
  }

  /**
   * Walk editor text nodes and wrap any match-word occurrences with
   * <span class="ref-match" data-ref-word="…">. Preserves caret position
   * as best as possible (text-node mutations may drift by 1-2 chars in
   * rare cases, which is acceptable).
   */
  function wrapRefMatchesInEditor() {
    if (!editorEl) return;
    if (!_s().matches || !_s().matches.size) {
      unwrapAllRefMatches();
      return;
    }

    // Save caret
    const sel = window.getSelection();
    let caretNode = null, caretOffset = -1;
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      if (editorEl.contains(range.startContainer)) {
        caretNode = range.startContainer;
        caretOffset = range.startOffset;
      }
    }

    // Rebuild from scratch: unwrap existing, then re-wrap.
    unwrapAllRefMatches();

    const wordSet = new Set(_s().matches.keys());
    if (!wordSet.size) return;

    // Collect text nodes (skip nodes already under a .ref-match — there
    // shouldn't be any after unwrap, but be defensive)
    const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.parentElement && n.parentElement.closest('.ref-match')) continue;
      // Never wrap text inside an inserted reference blockquote
      if (n.parentElement && n.parentElement.closest('[data-ref-insert="1"]')) continue;
      // Need room for at least a bigram (≈ MIN_WORD_LEN*2 + 1 chars)
      if (!n.nodeValue || n.nodeValue.length < window.NGram.MIN_WORD_LEN * 2 + 1) continue;
      textNodes.push(n);
    }

    for (const tn of textNodes) {
      const txt = tn.nodeValue;
      const matches = [];

      // Find all occurrences of all match-words in this text node
      for (const w of wordSet) {
        let idx = 0;
        while ((idx = txt.indexOf(w, idx)) !== -1) {
          matches.push({ start: idx, end: idx + w.length, word: w });
          idx += w.length;
        }
      }
      if (!matches.length) continue;

      // Sort by start; if ties, prefer the longer span
      matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

      // Remove overlaps: greedy, keep earliest non-overlapping
      const clean = [];
      let lastEnd = 0;
      for (const m of matches) {
        if (m.start >= lastEnd) { clean.push(m); lastEnd = m.end; }
      }

      // Build a fragment: plain text | <span> | plain text | …
      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const m of clean) {
        if (m.start > cursor) {
          frag.appendChild(document.createTextNode(txt.slice(cursor, m.start)));
        }
        const span = document.createElement('span');
        span.className = 'ref-match';
        span.setAttribute('data-ref-word', m.word);
        span.textContent = txt.slice(m.start, m.end);
        span.title = 'كىتابلاردىن تېپىلدى — چېكىپ مەنبىلەرنى كۆرۈڭ';
        span.addEventListener('click', onRefMatchClick);
        frag.appendChild(span);
        cursor = m.end;
      }
      if (cursor < txt.length) {
        frag.appendChild(document.createTextNode(txt.slice(cursor)));
      }

      if (tn.parentNode) tn.parentNode.replaceChild(frag, tn);
    }

    // Restore caret (best effort)
    try {
      if (caretNode && caretNode.nodeType === Node.TEXT_NODE && caretNode.parentNode) {
        const range = document.createRange();
        const safe = Math.min(caretOffset, caretNode.nodeValue.length);
        range.setStart(caretNode, safe);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch(e) { /* caret may drift; acceptable */ }
  }

  function onRefMatchClick(e) {
    e.stopPropagation();
    const word = this.getAttribute('data-ref-word');
    if (!word) return;
    window.notesShowRefFor(word);
  }

  function unwrapAllRefMatches() {
    if (!editorEl) return;
    const spans = editorEl.querySelectorAll('.ref-match');
    for (const s of spans) {
      const parent = s.parentNode;
      if (!parent) continue;
      while (s.firstChild) parent.insertBefore(s.firstChild, s);
      parent.removeChild(s);
    }
    editorEl.normalize();
  }

  // ========== REFS PANEL RENDERING ==========

  function renderRefsPanel() {
    const container = document.getElementById('notes-refs-content');
    if (!container) return;

    const matches = _s().matches || new Map();
    const filter = _s().refsFilter || null;

    if (!matches.size) {
      container.innerHTML = `<div class="notes-ref-empty">
        ھازىرچە مەنبە يوق<br><br>
        تەھرىرلىگۈچكە يازسىڭىز<br>ئاپتوماتىك چىقىدۇ
      </div>`;
      return;
    }

    const entries = (filter && matches.has(filter))
      ? [[filter, matches.get(filter)]]
      : Array.from(matches.entries());

    const header = filter
      ? `<div style="padding:6px 10px;background:var(--bg);border-radius:var(--radius2);margin-bottom:10px;font-size:11px;color:var(--text3);font-family:sans-serif;display:flex;justify-content:space-between;align-items:center;gap:8px">
           <span>فىلتر: <b style="color:var(--am)">${escHtml(filter)}</b></span>
           <button onclick="window.notesClearRefFilter()" style="background:none;border:0.5px solid var(--border2);color:var(--text2);border-radius:var(--radius2);padding:2px 10px;font-family:var(--jf);cursor:pointer;font-size:11px;white-space:nowrap">ھەممىسىنى كۆرۈش</button>
         </div>`
      : `<div style="padding:4px 2px;margin-bottom:8px;font-size:11px;color:var(--text3);font-family:sans-serif">${entries.length} سۆز ئۈچۈن مەنبە تېپىلدى</div>`;

    let i = 0;
    let html = header;
    for (const [word, books] of entries) {
      for (const bm of books) {
        const isQuran = bm.isQuran || bm.bookId === -1 || bm.bookId === -2;
        let bookTitle;
        if (isQuran) {
          bookTitle = 'قۇرئان كەرىم';
        } else {
          const book = (window.S.books || []).find(b => b.id === bm.bookId);
          bookTitle = book ? book.title : `كىتاب #${bm.bookId}`;
        }
        for (const sn of bm.snippets) {
          // Snippet comes with §MARK_OPEN§ / §MARK_CLOSE§ markers from database.js
          const snipHtml = String(sn.snip || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/§MARK_OPEN§/g, '<mark>')
            .replace(/§MARK_CLOSE§/g, '</mark>');
          // Pass raw snippet (with markers) to insert; we'll strip markers there.
          const encSnip = encodeURIComponent(sn.snip || '');
          const itemId = `ref_${bm.bookId}_${(sn.pos|0)}_${i++}`;

          // "Go to" button: Quran → switch to Quran mode at sura:aya; Book → openReader
          let gotoBtn;
          if (isQuran && sn.sura && sn.aya) {
            gotoBtn = `<button class="notes-ref-act notes-ref-goto"
              onclick="window.notesGoToQuranAya(${sn.sura}, ${sn.aya})">📖 ئايەتكە بېرىش (${sn.sura}:${sn.aya})</button>`;
          } else {
            gotoBtn = `<button class="notes-ref-act notes-ref-goto"
              onclick="window.notesGoToBook(${bm.bookId}, '${encodeURIComponent(word)}')">📖 كىتابقا بېرىش</button>`;
          }

          // Source label includes sura:aya for Quran
          const sourceLabel = isQuran
            ? `📖 ${escHtml(bookTitle)}${(sn.sura && sn.aya) ? ` · ${sn.sura}:${sn.aya}` : ''}${sn.lang === 'ar' ? ' (عربي)' : ''}`
            : `📘 ${escHtml(bookTitle)}`;

          html += `<div class="notes-ref-item" id="${itemId}">
            <div class="notes-ref-word">${escHtml(word)}</div>
            <div class="notes-ref-source">${sourceLabel}</div>
            <div class="notes-ref-snippet" data-snip-id="${itemId}">${snipHtml}</div>
            <div class="notes-ref-actions">
              <button class="notes-ref-act notes-ref-expand" title="تولۇق ئابزاسنى كۆرۈش"
                onclick="window.notesToggleSnippet('${itemId}')">＋</button>
              ${gotoBtn}
              <button class="notes-ref-act notes-ref-insert"
                onclick="window.notesInsertRef(${bm.bookId}, '${encSnip}')">📝 قىستۇرۇش</button>
            </div>
          </div>`;
        }
      }
    }
    container.innerHTML = html;
  }

  window.notesToggleSnippet = function (itemId) {
    const el = document.querySelector(`.notes-ref-snippet[data-snip-id="${itemId}"]`);
    if (!el) return;
    const expanded = el.classList.toggle('expanded');
    const btn = document.querySelector(`#${itemId} .notes-ref-expand`);
    if (btn) btn.textContent = expanded ? '－' : '＋';
  };

  window.notesGoToBook = async function (bookId, encodedHighlight) {
    if (window.S && window.S.notes && window.S.notes.dirty && window.S.notes.curDoc) {
      try { await saveNow(); } catch(e) {}
    }
    let highlight = '';
    try { highlight = decodeURIComponent(encodedHighlight || ''); } catch(e) {}
    if (typeof window.openReader === 'function') {
      // Switch back to library mode first so the reader UI is mounted.
      if (typeof window.setMode === 'function' && window.S.mode !== 'library') {
        window.setMode('library');
      }
      window.openReader(bookId, highlight);
    }
  };

  window.notesGoToQuranAya = async function (sura, aya) {
    // Save current note if dirty
    if (window.S && window.S.notes && window.S.notes.dirty && window.S.notes.curDoc) {
      try { await saveNow(); } catch(e) {}
    }
    // Update Quran state so the view opens at the requested aya
    if (window.S && window.S.quran) {
      window.S.quran.curSura = sura;
      window.S.quran.curAya = aya;
      // Clear any active search so the sura view (not the search list) renders
      window.S.quran.searchResults = null;
      window.S.quran.searchQuery = '';
    }
    if (typeof window.setMode === 'function') {
      window.setMode('quran');
    }
    // If the dedicated nav helper exists, prefer it
    if (typeof window.quranGoToAya === 'function') {
      window.quranGoToAya(sura, aya);
    } else if (typeof window.renderQuranView === 'function') {
      window.renderQuranView();
    }
  };

  // Exposed for the tab-switch handler in Prompt 5
  window.notesRenderRefsPanel = renderRefsPanel;

  window.notesShowRefFor = function(word) {
    _s().refsFilter = word;
    _s().rightTab = 'refs';

    // Update right-panel UI: switch tabs, replace content with refs list container
    const tabs = document.querySelectorAll('.notes-right-panel-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'refs'));
    const rightContent = document.getElementById('notes-right-content');
    if (rightContent) {
      rightContent.innerHTML = `<div id="notes-refs-content" class="notes-ref-list"></div>`;
    }
    renderRefsPanel();
  };

  window.notesClearRefFilter = function() {
    _s().refsFilter = null;
    renderRefsPanel();
  };

  window.notesInsertRef = function(bookId, encodedSnip) {
    if (!editorEl) return;
    let snip = '';
    try { snip = decodeURIComponent(encodedSnip); } catch(e) {}
    // Strip internal markers (we keep plain text in the inserted blockquote)
    snip = snip.replace(/§MARK_OPEN§|§MARK_CLOSE§/g, '');

    const book = (window.S.books || []).find(b => b.id === bookId);
    const bookTitle = book ? book.title : '';

    const insertHtml = `<blockquote class="notes-inserted-ref" data-ref-insert="1" dir="rtl" contenteditable="true">` +
      `<span>${escHtml(snip)}</span>` +
      (bookTitle ? `<br><span style="font-size:0.85em;color:#888">— ${escHtml(bookTitle)}</span>` : '') +
    `</blockquote><p><br></p>`;

    editorEl.focus();
    const safeInsert = (window.SafeHTML && window.SafeHTML.sanitize)
      ? window.SafeHTML.sanitize(insertHtml)
      : insertHtml;
    document.execCommand('insertHTML', false, safeInsert);
    markDirty();
    if (typeof showToast === 'function') showToast('مەنبە قىستۇرۇلدى', 's');
  };

  // Expose internals for Prompt 6
  window.NotesInternal = {
    getEditor: () => editorEl,
    getState: _s,
    markDirty,
    escHtml
  };
  window.notesMarkDirty = markDirty;
})();
