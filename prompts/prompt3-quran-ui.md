# PROMPT 3 — Quran UI: Sura List, Aya Rendering & Uthmanic Font

**Only run this after Prompt 2 is verified.**

---

You are continuing **Bilim Hezinisi 2.4.1**, step **3 of 6**. Build the Quran module's main UI: a 114-sura sidebar list with filter, a main reading area showing ayas with Uthmanic Hafs Arabic + UKIJ Ekran Uyghur translation, a search bar, and a "jump to sura:aya" input.

## Prerequisites (verify before starting)

- Prompt 1 completed: mode tabs exist, stubs work.
- Prompt 2 completed: SQLite has 114 suras and 6236 ayas. `window.electron.quranGetSuras()` returns data.

## Deliverables

Fill in two files completely — replace their stub content:
1. `src/quran.css` — all Quran module styles
2. `src/quran.js` — all Quran rendering logic (sidebar + main view + search)

**Do not** modify `main.js`, `database.js`, `preload.js`, or `src/index.html` in this prompt — they're already wired up.

## Task 3.1 — Replace src/quran.css with this complete file

```css
/* Quran module — layout, typography, interactions. */

.quran-layout { display: flex; flex: 1; overflow: hidden; height: 100%; }

.quran-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* Toolbar */
.quran-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px; border-bottom: 0.5px solid var(--border);
  background: var(--bg); flex-shrink: 0; flex-wrap: wrap;
}
.quran-search-wrap {
  display: flex; align-items: center; gap: 6px; flex: 1; min-width: 220px;
  background: var(--bg2); border: 0.5px solid var(--border);
  border-radius: 22px; padding: 4px 12px;
}
.quran-search {
  flex: 1; background: none; border: none; outline: none;
  font-family: var(--jf); font-size: 13px; color: var(--text);
  padding: 4px 0; direction: rtl;
}
.quran-search::placeholder { color: var(--text3); }
.quran-search-clear {
  background: none; border: none; color: var(--text3);
  cursor: pointer; font-size: 13px; padding: 2px 6px;
}
.quran-lang {
  background: var(--bg2); border: 0.5px solid var(--border2);
  border-radius: var(--radius2); padding: 5px 10px;
  font-family: var(--jf); font-size: 12px; color: var(--text2); cursor: pointer;
}
.quran-toggle {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--text2); cursor: pointer; user-select: none;
  white-space: nowrap;
}
.quran-toggle input { accent-color: var(--am); }
.quran-jump { display: flex; gap: 4px; align-items: center; }
.quran-jump input {
  width: 58px; padding: 5px 6px;
  border: 0.5px solid var(--border2); border-radius: var(--radius2);
  background: var(--bg2); color: var(--text);
  text-align: center; font-family: monospace; font-size: 12px;
}
.quran-jump button {
  padding: 5px 12px; font-size: 12px;
  background: var(--am); color: #fff; border: none;
  border-radius: var(--radius2); cursor: pointer; font-family: var(--jf);
}

/* Content area */
.quran-content { flex: 1; overflow-y: auto; padding: 28px 40px; }
.quran-content-inner { max-width: 860px; margin: 0 auto; }

/* Sura header */
.quran-sura-header {
  text-align: center; padding: 14px 0 22px;
  border-bottom: 0.5px solid var(--border); margin-bottom: 22px;
}
.quran-sura-header-ar {
  font-family: 'UthmanicHafs', serif;
  font-size: 30px; color: var(--am); margin-bottom: 6px;
  line-height: 1.5;
}
.quran-sura-header-ug { font-size: 14px; color: var(--text2); }
.quran-sura-header-meta {
  font-size: 11px; color: var(--text3); margin-top: 4px; font-family: sans-serif;
}
.quran-basmala {
  font-family: 'UthmanicHafs', serif;
  text-align: center; font-size: 28px; color: var(--text);
  margin-bottom: 22px; line-height: 2;
}

/* Individual aya */
.quran-aya {
  padding: 16px 14px; margin-bottom: 10px;
  border-radius: var(--radius2);
  transition: background .15s, border-color .15s;
  cursor: pointer; border: 0.5px solid transparent;
  position: relative;
}
.quran-aya:hover { background: var(--bg2); border-color: var(--border); }
.quran-aya.selected { background: var(--ab); border-color: var(--ab2); }
.quran-aya-ar {
  font-family: 'UthmanicHafs', serif;
  font-size: 28px; line-height: 2.2; color: var(--text);
  direction: rtl; text-align: justify; text-align-last: right;
  word-spacing: 0.1em;
}
.quran-aya-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; margin: 0 6px;
  font-size: 15px; font-family: 'UthmanicHafs', serif;
  color: var(--am); background: var(--ab);
  border-radius: 50%; vertical-align: middle;
}
.quran-aya-ug {
  font-family: 'UKIJ Ekran', var(--jf);
  font-size: 15px; line-height: 1.9; color: var(--text2);
  direction: rtl; text-align: justify;
  margin-top: 10px; padding-top: 10px;
  border-top: 0.5px dashed var(--border);
}
.quran-aya-ug-prefix {
  font-size: 10px; color: var(--text3); font-family: sans-serif;
  letter-spacing: 0.5px; text-transform: uppercase; margin-left: 8px;
}

/* Inline aya menu (popover after click) */
.quran-aya-menu {
  position: absolute; z-index: 1000;
  background: var(--bg); border: 0.5px solid var(--border2);
  border-radius: var(--radius2); box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  display: flex; flex-direction: column;
  min-width: 240px; padding: 4px 0;
}
.quran-aya-menu button {
  background: none; border: none;
  padding: 10px 14px; text-align: right;
  font-family: var(--jf); font-size: 13px; color: var(--text);
  cursor: pointer; transition: background .1s; direction: rtl;
}
.quran-aya-menu button:hover { background: var(--ab); color: var(--at); }

/* Sidebar (sura list) */
.quran-sidebar-inner { display: flex; flex-direction: column; height: 100%; }
.quran-sidebar-search {
  padding: 10px; border-bottom: 0.5px solid var(--border); flex-shrink: 0;
}
.quran-sidebar-search input {
  width: 100%; padding: 7px 10px;
  background: var(--bg); border: 0.5px solid var(--border2);
  border-radius: var(--radius2); color: var(--text);
  font-family: var(--jf); font-size: 12px; direction: rtl; outline: none;
}
.quran-sura-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.quran-sura-item {
  display: grid; grid-template-columns: 30px 1fr auto;
  align-items: center; gap: 8px; padding: 8px 12px;
  cursor: pointer; border-right: 2.5px solid transparent;
  transition: background .12s; font-size: 13px;
}
.quran-sura-item:hover { background: var(--bg3); }
.quran-sura-item.active { background: var(--ab); color: var(--at); border-right-color: var(--am); }
.quran-sura-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  background: var(--bg); border: 0.5px solid var(--border);
  border-radius: 50%;
  font-size: 10px; font-family: monospace; color: var(--text2);
}
.quran-sura-item.active .quran-sura-num { background: var(--am); color: #fff; border-color: var(--am); }
.quran-sura-names { min-width: 0; overflow: hidden; }
.quran-sura-name-ar {
  font-family: 'UthmanicHafs', serif; font-size: 16px; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.quran-sura-name-ug { font-size: 11px; color: var(--text3); margin-top: 2px; }
.quran-sura-count { font-size: 10px; color: var(--text3); font-family: monospace; }

/* Search results */
.quran-search-result {
  padding: 14px; margin-bottom: 8px;
  border: 0.5px solid var(--border); border-radius: var(--radius2);
  cursor: pointer; background: var(--bg);
  transition: border-color .12s, background .12s;
}
.quran-search-result:hover { border-color: var(--am); background: var(--bg2); }
.quran-search-meta { font-size: 11px; color: var(--am); margin-bottom: 6px; font-weight: 600; }
.quran-search-result-ar {
  font-family: 'UthmanicHafs', serif;
  font-size: 20px; line-height: 1.9; direction: rtl;
  color: var(--text); margin-bottom: 6px;
}
.quran-search-result-ug {
  font-size: 13px; color: var(--text2); line-height: 1.6; direction: rtl;
}
.quran-search-result mark {
  background: var(--ab2); color: var(--am);
  padding: 0 2px; border-radius: 2px;
}
.quran-no-results { text-align: center; padding: 60px 20px; color: var(--text3); font-size: 14px; }
.quran-result-count {
  font-size: 11px; color: var(--text3);
  margin-bottom: 14px; font-family: sans-serif;
}

/* Responsive */
@media (max-width: 900px) {
  .quran-content { padding: 18px 20px; }
  .quran-aya-ar { font-size: 24px; line-height: 2; }
  .quran-sura-header-ar { font-size: 24px; }
  .quran-basmala { font-size: 22px; }
}
```

## Task 3.2 — Replace src/quran.js with this complete file

```javascript
// Quran module (renderer-side). Provides sidebar (114 sura list), main view,
// search with FTS5, and per-aya click → inline popover menu.
(function(){
  'use strict';

  function _s() { return window.S.quran; }

  let searchDebounceTimer = null;

  // ========== DATA LOADING ==========

  async function ensureSurasLoaded() {
    if (_s().suras.length) return true;
    const r = await window.electron.quranGetSuras();
    if (r.success && r.suras.length) {
      _s().suras = r.suras;
      return true;
    }
    return false;
  }

  // ========== SIDEBAR ==========

  window.renderQuranSidebar = function renderQuranSidebar() {
    // If suras not loaded yet, trigger async load and return placeholder.
    if (!_s().suras.length) {
      ensureSurasLoaded().then(ok => {
        if (ok && window.S.mode === 'quran' && typeof renderSide === 'function') {
          renderSide();
        }
      });
      return `<div class="quran-sidebar-inner"><div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">يۈكلىنىۋاتىدۇ...</div></div>`;
    }

    const filter = (_s().sidebarFilter || '').trim();
    const filtered = filterSuras(_s().suras, filter);

    let h = `<div class="quran-sidebar-inner">
      <div class="quran-sidebar-search">
        <input type="text" id="quran-sidebar-filter" value="${escAttr(filter)}"
          placeholder="سۈرە ئىزدەش..."
          oninput="window.quranOnSidebarFilterInput(this.value)">
      </div>
      <div class="quran-sura-list">`;

    for (const s of filtered) {
      const active = (s.number === _s().curSura && !_s().searchResults) ? 'active' : '';
      h += `<div class="quran-sura-item ${active}" onclick="window.quranOpenSura(${s.number})">
        <span class="quran-sura-num">${s.number}</span>
        <div class="quran-sura-names">
          <div class="quran-sura-name-ar">${escHtml(s.name_ar)}</div>
          <div class="quran-sura-name-ug">${escHtml(s.name_ug)}</div>
        </div>
        <span class="quran-sura-count">${s.aya_count}</span>
      </div>`;
    }

    if (!filtered.length) {
      h += `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">نەتىجە يوق</div>`;
    }

    h += `</div></div>`;
    return h;
  };

  function filterSuras(suras, filter) {
    if (!filter) return suras;
    const f = filter.toLowerCase();
    return suras.filter(s =>
      s.name_ar.includes(filter) ||
      (s.name_ug || '').toLowerCase().includes(f) ||
      (s.name_translit || '').toLowerCase().includes(f) ||
      String(s.number).includes(filter)
    );
  }

  window.quranOnSidebarFilterInput = function(val) {
    _s().sidebarFilter = val;
    if (typeof renderSide === 'function') renderSide();
    // Restore focus to input after re-render
    setTimeout(() => {
      const el = document.getElementById('quran-sidebar-filter');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  };

  // ========== MAIN VIEW ==========

  window.renderQuranView = async function renderQuranView() {
    const loaded = await ensureSurasLoaded();
    const main = document.getElementById('main');
    if (!main) return;

    if (!loaded) {
      main.innerHTML = `<div class="quran-layout"><div class="quran-main">
        <div class="quran-no-results">
          ⚠️ قۇرئان ساندانى تېپىلمىدى<br>
          <small style="color:var(--text3);font-size:11px">
            Internet بار ۋاقىتتا دېتالنى قايتا ئېچىڭ، ياكى _resources/ ھۆججەتخانىسىنى تەكشۈرۈڭ
          </small>
        </div>
      </div></div>`;
      return;
    }

    main.innerHTML = `<div class="quran-layout">
      <div class="quran-main">
        ${renderToolbar()}
        <div class="quran-content" id="quran-content">
          <div class="quran-content-inner" id="quran-content-inner">
            <div class="quran-no-results">يۈكلىنىۋاتىدۇ...</div>
          </div>
        </div>
      </div>
    </div>`;

    if (_s().searchResults) {
      renderSearchResults();
    } else {
      await renderSura(_s().curSura || 1);
    }
  };

  function renderToolbar() {
    const q = _s().searchQuery || '';
    const lang = _s().searchLang || 'auto';
    const showTr = _s().showTranslation !== false;

    return `<div class="quran-toolbar">
      <div class="quran-search-wrap">
        <span style="font-size:13px;color:var(--text3)">🔍</span>
        <input type="text" class="quran-search" id="quran-search"
          placeholder="سۈرە نامى، ئەرەبچە ئايەت ياكى ئۇيغۇرچە تەرجىمە بويىچە ئىزدەش..."
          value="${escAttr(q)}"
          oninput="window.quranOnSearchInput(this.value)"
          onkeydown="if(event.key==='Escape')window.quranClearSearch()">
        <button class="quran-search-clear" onclick="window.quranClearSearch()"
          style="display:${q?'inline':'none'}" id="quran-search-clear">✕</button>
      </div>

      <select class="quran-lang" id="quran-lang" onchange="window.quranSetSearchLang(this.value)" title="ئىزدەش تىلى">
        <option value="auto" ${lang==='auto'?'selected':''}>ئىككىسى</option>
        <option value="ar" ${lang==='ar'?'selected':''}>ئەرەبچە</option>
        <option value="ug" ${lang==='ug'?'selected':''}>ئۇيغۇرچە</option>
      </select>

      <label class="quran-toggle">
        <input type="checkbox" ${showTr?'checked':''} onchange="window.quranToggleTranslation(this.checked)">
        <span>تەرجىمىسى بىلەن كۆچۈرۈش</span>
      </label>

      <div class="quran-jump">
        <input type="number" id="quran-jump-sura" min="1" max="114" placeholder="سۈرە"
          onkeydown="if(event.key==='Enter')window.quranJump()">
        <span style="color:var(--text3)">:</span>
        <input type="number" id="quran-jump-aya" min="1" placeholder="ئايەت"
          onkeydown="if(event.key==='Enter')window.quranJump()">
        <button onclick="window.quranJump()">ئاتلاش</button>
      </div>
    </div>`;
  }

  async function renderSura(suraNumber) {
    const container = document.getElementById('quran-content-inner');
    if (!container) return;

    const r = await window.electron.quranGetAyas(suraNumber);
    if (!r.success || !r.ayas.length) {
      container.innerHTML = `<div class="quran-no-results">ئايەتلەر تېپىلمىدى.</div>`;
      return;
    }

    const sura = _s().suras.find(s => s.number === suraNumber);
    if (!sura) return;

    let h = `<div class="quran-sura-header">
      <div class="quran-sura-header-ar">سورة ${escHtml(sura.name_ar)}</div>
      <div class="quran-sura-header-ug">${escHtml(sura.name_ug)} — ${sura.aya_count} ئايەت</div>
      <div class="quran-sura-header-meta">
        ${sura.revelation === 'meccan' ? 'مەككىدە چۈشۈرۈلگەن' : 'مەدىنىدە چۈشۈرۈلگەن'}
      </div>
    </div>`;

    // Show basmala for all suras except Fatiha (already in its first aya) and Tawba (no basmala)
    if (suraNumber !== 1 && suraNumber !== 9) {
      h += `<div class="quran-basmala">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>`;
    }

    for (const a of r.ayas) {
      const numDisplay = toArabicNumerals(a.aya);
      h += `<div class="quran-aya" data-sura="${a.sura}" data-aya="${a.aya}"
        onclick="window.quranOnAyaClick(event, ${a.sura}, ${a.aya})">
        <div class="quran-aya-ar">${escHtml(a.text_ar)}<span class="quran-aya-num">${numDisplay}</span></div>
        ${a.text_ug ? `<div class="quran-aya-ug"><span class="quran-aya-ug-prefix">تەرجىمە</span>${escHtml(a.text_ug)}</div>` : ''}
      </div>`;
    }

    container.innerHTML = h;

    // Scroll to target aya if specified
    const targetAya = _s().curAya || 1;
    if (targetAya > 1) {
      setTimeout(() => {
        const el = container.querySelector(`.quran-aya[data-aya="${targetAya}"]`);
        if (el) {
          el.classList.add('selected');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    } else {
      const scroll = document.getElementById('quran-content');
      if (scroll) scroll.scrollTop = 0;
    }
  }

  window.quranOpenSura = async function(suraNumber) {
    _s().curSura = suraNumber;
    _s().curAya = 1;
    _s().searchResults = null;
    _s().searchQuery = '';
    const si = document.getElementById('quran-search');
    if (si) si.value = '';
    const sc = document.getElementById('quran-search-clear');
    if (sc) sc.style.display = 'none';
    if (typeof renderSide === 'function') renderSide();
    await renderSura(suraNumber);
  };

  window.quranOpenAya = function(sura, aya) {
    _s().curSura = sura;
    _s().curAya = aya;
    _s().searchResults = null;
    _s().searchQuery = '';
    if (typeof renderSide === 'function') renderSide();
    renderSura(sura);
  };

  // ========== SEARCH ==========

  window.quranOnSearchInput = function(q) {
    _s().searchQuery = q;
    const clearBtn = document.getElementById('quran-search-clear');
    if (clearBtn) clearBtn.style.display = q ? 'inline' : 'none';

    clearTimeout(searchDebounceTimer);
    if (!q.trim()) {
      _s().searchResults = null;
      renderSura(_s().curSura || 1);
      return;
    }
    searchDebounceTimer = setTimeout(runSearch, 180);
  };

  async function runSearch() {
    const q = _s().searchQuery;
    if (!q || !q.trim()) return;
    const r = await window.electron.quranSearch(q, { lang: _s().searchLang || 'auto', limit: 200 });
    _s().searchResults = r.success ? r.results : [];
    renderSearchResults();
  }

  window.quranClearSearch = function() {
    _s().searchQuery = '';
    _s().searchResults = null;
    const si = document.getElementById('quran-search');
    if (si) { si.value = ''; si.focus(); }
    const sc = document.getElementById('quran-search-clear');
    if (sc) sc.style.display = 'none';
    renderSura(_s().curSura || 1);
  };

  window.quranSetSearchLang = function(lang) {
    _s().searchLang = lang;
    if (_s().searchQuery) runSearch();
  };

  window.quranToggleTranslation = function(checked) {
    _s().showTranslation = !!checked;
  };

  function renderSearchResults() {
    const container = document.getElementById('quran-content-inner');
    if (!container) return;
    const results = _s().searchResults || [];
    if (!results.length) {
      container.innerHTML = `<div class="quran-no-results">نەتىجە تېپىلمىدى</div>`;
      return;
    }

    let h = `<div class="quran-result-count">${results.length} نەتىجە تېپىلدى</div>`;
    for (const r of results) {
      const sura = _s().suras.find(s => s.number === r.sura);
      const suraLabel = sura ? `${sura.name_ar} / ${sura.name_ug}` : `سۈرە ${r.sura}`;
      // Snippets come pre-marked from FTS5 with <mark>. If empty (LIKE fallback), show escaped full text.
      const arHtml = r.snip_ar ? r.snip_ar : escHtml(r.text_ar);
      const ugHtml = r.snip_ug ? r.snip_ug : escHtml(r.text_ug);
      h += `<div class="quran-search-result" onclick="window.quranOpenAya(${r.sura}, ${r.aya})">
        <div class="quran-search-meta">📖 ${escHtml(suraLabel)} — ئايەت ${r.aya}</div>
        <div class="quran-search-result-ar">${arHtml}</div>
        ${ugHtml ? `<div class="quran-search-result-ug">${ugHtml}</div>` : ''}
      </div>`;
    }
    container.innerHTML = h;
  }

  // ========== JUMP ==========

  window.quranJump = function() {
    const sEl = document.getElementById('quran-jump-sura');
    const aEl = document.getElementById('quran-jump-aya');
    const s = parseInt(sEl ? sEl.value : '', 10);
    const a = parseInt(aEl ? aEl.value : '', 10);

    if (!s || s < 1 || s > 114) {
      if (typeof showToast === 'function') showToast('1-114 ئارىلىقىدىكى سۈرە نومۇرى كىرگۈزۈڭ', 'e');
      return;
    }
    const sura = _s().suras.find(x => x.number === s);
    if (!sura) return;
    const targetAya = (a && a >= 1 && a <= sura.aya_count) ? a : 1;
    window.quranOpenAya(s, targetAya);

    if (sEl) sEl.value = '';
    if (aEl) aEl.value = '';
  };

  // ========== AYA CLICK → MENU ==========
  // Menu actions (copy etc.) implemented in Prompt 4.

  window.quranOnAyaClick = function(ev, sura, aya) {
    ev.stopPropagation();
    const target = document.querySelector(`.quran-aya[data-sura="${sura}"][data-aya="${aya}"]`);
    if (!target) return;

    // Ctrl/Cmd+click = toggle multi-select, no menu
    if (ev.ctrlKey || ev.metaKey) {
      target.classList.toggle('selected');
      return;
    }

    // Single-select + show menu
    document.querySelectorAll('.quran-aya.selected').forEach(el => el.classList.remove('selected'));
    target.classList.add('selected');
    _s().curAya = aya;

    if (typeof window.quranShowAyaMenu === 'function') {
      window.quranShowAyaMenu(target, sura, aya);
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
  function toArabicNumerals(n) {
    const d = '٠١٢٣٤٥٦٧٨٩';
    return String(n).split('').map(c => /\d/.test(c) ? d[parseInt(c, 10)] : c).join('');
  }

  // Expose helpers for Prompt 4 & Prompt 5 reuse
  window.QuranHelpers = { escHtml, escAttr, toArabicNumerals };
})();
```

## Acceptance Criteria

1. Run `npm start`. Click 📖 قۇرئان كەرىم.
2. Sidebar shows 114 suras with Arabic + Uyghur names and aya counts. First sura (Fatiha) is active.
3. Main area shows Fatiha: header with "سورة الفاتحة", 7 ayas rendered with Uthmanic Hafs Arabic (large, clear script) and Uyghur translation below each.
4. Fatiha must NOT show basmala at top (it's already its own verse 1). Open sura 2 → basmala shows. Open sura 9 (Tawba) → no basmala.
5. Click sura 2 (Baqara) — opens, scroll to top. Click sura 36 (Yasin), sura 112 (Ikhlas) — all work.
6. Type `بقرە` in sidebar filter — only Baqara remains. Type `2` — sura 2 shown. Clear filter.
7. Type `Baqara` (translit) in sidebar filter — Baqara shows.
8. Jump: enter 2 / 255 / click "ئاتلاش" — opens Baqara, scrolls to Ayat al-Kursi, highlights it.
9. Toolbar search: type `الحمد`, lang=ئەرەبچە → ≥30 results with yellow `<mark>` highlighting. Click a result → opens that aya.
10. Type `مۇسا`, lang=ئۇيغۇرچە → results in Uyghur translation with highlighting.
11. Lang=ئىككىسى, type `الحمد` → results with both Arabic and Uyghur snippets.
12. ESC in search box clears the search.
13. Arabic text uses a heavy, traditional, Uthmani-style script (the font is loaded). If it looks like plain serif, fonts aren't loading — check `assets/fonts/UthmanicHafs1.otf` exists.

## Rules

- Pure UI code only — no IPC added, no DB changes.
- All rendering is synchronous-looking from the user's point of view. Debounce search at 180ms.
- Uyghur UI strings only; English code comments.
- XSS: use `escHtml()` for any user/data text inserted via innerHTML. Search snippets are server-generated with `<mark>` tags and are trusted (already safe since SQLite tokenizer produced them; text inside is escaped by FTS5 itself is NOT — but the indexed text_ar/text_ug never contains HTML, so this is fine).
- After finishing, report which files you created or modified, then ask me to test.
