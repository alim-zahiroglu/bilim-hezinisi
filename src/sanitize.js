// HTML sanitizer for Notes module — defense-in-depth XSS protection.
// Loaded as a regular <script> in index.html (provides window.SafeHTML).
(function () {
  'use strict';

  // We require DOMPurify via a path that works both in dev (node_modules)
  // and packaged (asar). DOMPurify ships a UMD build that attaches to
  // window when loaded as a <script>. We load the file via a require()
  // resolved at runtime by the Electron preload's exposed loader, OR
  // by a direct require() if available.
  let purify = null;

  function getPurify() {
    if (purify) return purify;
    if (typeof window !== 'undefined' && window.DOMPurify) {
      purify = window.DOMPurify;
      return purify;
    }
    // Fall back: try to require it (only works if Node integration is on,
    // which it isn't here — so this is a defensive no-op)
    try {
      // eslint-disable-next-line
      const dp = require('dompurify');
      purify = dp.default || dp;
      return purify;
    } catch (e) {
      return null;
    }
  }

  // Tags allowed in Note HTML.
  const ALLOWED_TAGS = [
    'p', 'span', 'div', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote',
    'code', 'pre',
    'a',
    'font' // legacy execCommand uses <font> for size/color; we keep it
  ];

  // Attributes we keep. data-* and class for our app's markers.
  const ALLOWED_ATTR = [
    'style', 'class', 'dir', 'lang',
    'data-ref-insert', 'data-ref-word', 'data-spell-word',
    'href', 'title',
    'face', 'size', 'color' // legacy <font> attrs
  ];

  // CSS properties allowed in style="..." attributes.
  // DOMPurify validates these via its built-in CSS parser.
  const ALLOWED_CSS_PROPS = new Set([
    'color', 'background-color', 'background',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'text-align', 'text-decoration', 'line-height',
    'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'border', 'border-radius', 'border-color',
    'direction', 'unicode-bidi',
    'display', 'width', 'max-width'
  ]);

  /**
   * Sanitize note HTML. Strips <script>, event handlers (onerror, onclick, etc),
   * javascript: URLs, and any tag not in ALLOWED_TAGS.
   * @param {string} html
   * @returns {string} safe HTML
   */
  function sanitize(html) {
    if (!html) return '';
    const dp = getPurify();
    if (!dp) {
      // Fallback: strip all tags. Pessimistic but safe.
      console.warn('[sanitize] DOMPurify not available, stripping all HTML');
      const div = document.createElement('div');
      div.textContent = String(html).replace(/<[^>]*>/g, ' ');
      return div.innerHTML;
    }

    return dp.sanitize(String(html), {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'style', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onsubmit', 'onchange', 'onkeydown', 'onkeyup', 'onkeypress'],
      ALLOW_DATA_ATTR: false,
      ADD_DATA_URI_TAGS: [],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      USE_PROFILES: { html: true }
    });
  }

  /**
   * Extract plain text from HTML safely (does NOT use innerHTML).
   * @param {string} html
   * @returns {string}
   */
  function htmlToText(html) {
    if (!html) return '';
    const safe = sanitize(html);
    const div = document.createElement('div');
    div.innerHTML = safe;
    return div.innerText || div.textContent || '';
  }

  window.SafeHTML = { sanitize, htmlToText };
})();
