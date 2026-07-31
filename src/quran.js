// Quran module (renderer-side). Provides sidebar (114 sura list), main view,
// search with FTS5, and per-aya click → inline popover menu.
(function(){
  'use strict';

  // Ensure global state is reachable on window (index.html declares S as const)
  try { if (!window.S && typeof S !== 'undefined') window.S = S; } catch(e) {}

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
          ${renderTranslationCredit()}
        </div>
      </div>
    </div>`;

    if (_s().searchResults) {
      renderSearchResults();
    } else {
      await renderSura(_s().curSura || 1);
    }
  };

  // QuranEnc.com's terms of use require the publisher, the source and the
  // version number to be shown wherever the translation is republished.
  // The translation itself is stored and displayed verbatim.
  function renderTranslationCredit() {
    return `<div class="quran-credit">
      ئۇيغۇرچە تەرجىمە مەنبەسى: <span class="quran-credit-src">QuranEnc.com</span>
      — «قۇرئان كەرىم تەرجىمىسى» (شەيخ محمد صالح) · نۇسخا v1.0.2
    </div>`;
  }

  function renderToolbar() {
    const q = _s().searchQuery || '';
    const lang = _s().searchLang || 'auto';
    const showTr = _s().showTranslation !== false;

    return `<div class="quran-toolbar">
      <div class="quran-search-wrap">
        <button class="quran-search-icon" id="quran-search-btn" onclick="window.quranRunSearchNow()"
          title="ئىزدەش">${icon('search')}</button>
        <input type="text" class="quran-search" id="quran-search"
          placeholder="سۈرە نامى، ئەرەبچە ئايەت ياكى ئۇيغۇرچە تەرجىمە بويىچە ئىزدەش..."
          value="${escAttr(q)}"
          oninput="window.quranOnSearchInput(this.value)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();window.quranRunSearchNow();}else if(event.key==='Escape'){window.quranClearSearch();}">
        <button class="quran-search-clear" onclick="window.quranClearSearch()"
          style="display:${q?'inline-flex':'none'}" id="quran-search-clear">${icon('x','ic-sm')}</button>
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

  // Stable navigation API used from outside the Quran module (e.g. notes.js).
  // Caller is expected to have already switched mode via setMode('quran').
  window.quranGoToAya = function(sura, aya) {
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

  async function runSearch(opts) {
    opts = opts || {};
    const q = _s().searchQuery;
    if (!q || !q.trim()) return;
    const trimmed = q.trim();

    // For single-word queries on Enter / button click, attempt sura-name
    // resolution first. If a unique match is found, jump to that sura
    // instead of running an FTS hit-list. (Multi-word queries are almost
    // always ayah-text searches.)
    if (opts.tryJump && !/\s/.test(trimmed) && window.electron.quranLookupSura) {
      try {
        const lr = await window.electron.quranLookupSura(trimmed);
        if (lr && lr.success && lr.sura) {
          _s().searchResults = null;
          _s().searchQuery = '';
          const si = document.getElementById('quran-search');
          if (si) si.value = '';
          const sc = document.getElementById('quran-search-clear');
          if (sc) sc.style.display = 'none';
          window.quranOpenSura(lr.sura.number);
          return;
        }
      } catch (e) { /* fall through to FTS */ }
    }

    const r = await window.electron.quranSearch(q, { lang: _s().searchLang || 'auto', limit: 200 });
    _s().searchResults = r.success ? r.results : [];
    renderSearchResults();
  }

  // Triggered by Enter key or the search-icon button — runs immediately
  // (skipping the debounce) and tries sura-name jump first.
  window.quranRunSearchNow = function() {
    clearTimeout(searchDebounceTimer);
    if (!_s().searchQuery || !_s().searchQuery.trim()) return;
    runSearch({ tryJump: true });
  };

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
      const arHtml = r.snip_ar ? r.snip_ar : escHtml(r.text_ar);
      const ugHtml = r.snip_ug ? r.snip_ug : escHtml(r.text_ug);
      h += `<div class="quran-search-result" onclick="window.quranOpenAya(${r.sura}, ${r.aya})">
        <div class="quran-search-meta">${icon('book-open')} ${escHtml(suraLabel)} — ئايەت ${r.aya}</div>
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

    if (ev.ctrlKey || ev.metaKey) {
      target.classList.toggle('selected');
      return;
    }

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

  // ========== CLIPBOARD / COPY ==========

  const FONT_STACK_AR = "'UthmanicHafs','KFGQPC Uthmanic Script HAFS','Traditional Arabic','Amiri',serif";
  const FONT_STACK_UG = "'UKIJ Ekran','UKIJ Tuz','Microsoft Uighur','Arial',sans-serif";

  window.quranShowAyaMenu = function(targetEl, sura, aya) {
    document.querySelectorAll('.quran-aya-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'quran-aya-menu';
    menu.innerHTML = `
      <button onclick="window.quranMenuCopy(${sura}, ${aya}, false, event)">${icon('copy')}يالغۇز ئايەتنى كۆچۈرۈش</button>
      <button onclick="window.quranMenuCopy(${sura}, ${aya}, true, event)">${icon('copy')}تەرجىمىسى بىلەن كۆچۈرۈش</button>
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

  window.quranMenuCopy = async function(sura, aya, withTranslation, ev) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    document.querySelectorAll('.quran-aya-menu').forEach(el => el.remove());

    const r = await window.electron.quranGetAya(sura, aya);
    if (!r.success || !r.aya) {
      if (typeof showToast === 'function') showToast('ئايەت تېپىلمىدى', 'e');
      return;
    }

    const ok = await copyAyaToClipboard([r.aya], withTranslation);
    if (typeof showToast === 'function') {
      showToast(
        ok ? (withTranslation ? 'ئايەت تەرجىمىسى بىلەن كۆچۈرۈلدى' : 'ئايەت كۆچۈرۈلدى') : 'كۆچۈرۈش مۇۋەپپەقىيەتسىز بولدى',
        ok ? 's' : 'e'
      );
    }
  };

  async function copyAyaToClipboard(ayas, withTranslation) {
    if (!ayas || !ayas.length) return false;

    const htmlParts = [];
    const textParts = [];

    for (const a of ayas) {
      const arSafe = escHtml(a.text_ar);
      if (withTranslation && a.text_ug) {
        const ugSafe = escHtml(a.text_ug);
        htmlParts.push(
          `<p dir="rtl" style="text-align:right;margin:0 0 12pt 0;">` +
            `<span style="font-family:${FONT_STACK_AR};font-size:20pt;line-height:1.9">` +
              `&#xFD3F;${arSafe}&#xFD3E;` +
            `</span>` +
            `<br>` +
            `<span style="font-family:${FONT_STACK_UG};font-size:13pt;line-height:1.7;color:#333">` +
              `&#x00AB;${ugSafe}&#x00BB;` +
            `</span>` +
          `</p>`
        );
        textParts.push(`\uFD3F${a.text_ar}\uFD3E \u00AB${a.text_ug}\u00BB`);
      } else {
        htmlParts.push(
          `<p dir="rtl" style="text-align:right;margin:0 0 12pt 0;">` +
            `<span style="font-family:${FONT_STACK_AR};font-size:20pt;line-height:1.9">` +
              `&#xFD3F;${arSafe}&#xFD3E;` +
            `</span>` +
          `</p>`
        );
        textParts.push(`\uFD3F${a.text_ar}\uFD3E`);
      }
    }

    const html = `<html><head><meta charset="utf-8"></head><body>${htmlParts.join('\n')}</body></html>`;
    const text = textParts.join('\n\n');

    try {
      if (navigator.clipboard && typeof window.ClipboardItem === 'function') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html':  new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' })
          })
        ]);
        return true;
      }
    } catch(e) {
      console.warn('ClipboardItem write failed:', e);
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch(e) {
      console.warn('writeText failed:', e);
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch(e) {
      console.error('All clipboard methods failed:', e);
      return false;
    }
  }

  document.addEventListener('keydown', async (e) => {
    if (window.S.mode !== 'quran') return;
    const key = (e.key || '').toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || key !== 'c') return;

    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;

    const selectedEls = Array.from(document.querySelectorAll('.quran-aya.selected'));
    if (!selectedEls.length) return;

    e.preventDefault();

    const ayas = [];
    for (const el of selectedEls) {
      const sura = parseInt(el.dataset.sura, 10);
      const aya = parseInt(el.dataset.aya, 10);
      if (!sura || !aya) continue;
      const r = await window.electron.quranGetAya(sura, aya);
      if (r.success && r.aya) ayas.push(r.aya);
    }

    if (!ayas.length) return;

    const withTr = _s().showTranslation !== false;
    const ok = await copyAyaToClipboard(ayas, withTr);
    if (typeof showToast === 'function') {
      showToast(
        ok ? `${ayas.length} ئايەت كۆچۈرۈلدى` : 'كۆچۈرۈش مۇۋەپپەقىيەتسىز بولدى',
        ok ? 's' : 'e'
      );
    }
  });

  window.QuranCopy = { copyAyaToClipboard, FONT_STACK_AR, FONT_STACK_UG };

  window.QuranHelpers = { escHtml, escAttr, toArabicNumerals };
})();
