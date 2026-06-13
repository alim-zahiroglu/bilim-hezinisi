// ocr-postprocess.js — pure, unit-testable post-processing for OCR output,
// ported from Gheyret Kenji's UyghurOCR 2.0 (MainForm.cs). Used by the
// main-process OCR handler (main.js → ocr-recognize). No Electron/Node-only
// deps so it can be required from a plain `node` test.
//
// Two stages, applied per page in this order:
//   1. normalizeOcrChars — the character fixes UyghurOCR applies:
//        ی  U+06CC (FARSI YEH)  → ي  U+064A (ARABIC YEH)
//        ه  U+0647 (HEH)        → ە  U+06D5 (AE / Uyghur final-e)
//      These are the two intrusions Arabic/Persian-trained recognition leaves
//      in Uyghur text; UyghurOCR replaces them globally.
//   2. reflowParagraphs — UyghurOCR's abzasla() paragraph reflow: Tesseract
//      emits one line per print line; we merge wrapped lines back into
//      paragraphs. A line noticeably shorter than the average line length is
//      treated as a paragraph end; hyphenated line-break splits are rejoined.
'use strict';

function normalizeOcrChars(s) {
  return String(s == null ? '' : s)
    .replace(/ی/g, 'ي')   // ی → ي
    .replace(/ه/g, 'ە');  // ه → ە
}

// Port of UyghurOCR's abzasla(): rebuild paragraphs from per-line OCR output.
// Heuristic:
//   - average visible line length is computed over non-blank lines;
//   - a line whose length is below ~75% of the average ends its paragraph
//     (typical of the short last line of a wrapped paragraph);
//   - a blank line is a hard paragraph break;
//   - a line ending with '-' is a hyphen-split word: join to the next line
//     with no space; otherwise lines join with a single space.
// Output paragraphs are separated by a blank line ("\n\n").
function reflowParagraphs(text) {
  const raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  const lines = raw.split('\n').map((l) => l.replace(/[ \t]+$/g, ''));

  const lens = lines.filter((l) => l.trim().length > 0).map((l) => l.trim().length);
  if (!lens.length) return '';
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  // Single-line / uniform pages: avoid an over-eager threshold splitting every
  // line. With one line the threshold is irrelevant (handled by the loop end).
  const threshold = avg * 0.75;

  const paras = [];
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) {                       // blank line → hard paragraph break
      if (cur) { paras.push(cur); cur = ''; }
      continue;
    }
    const isHyphen = /[-­]$/.test(t);  // this line continues into the next word
    if (!cur) {
      cur = t;
    } else if (/[-­]$/.test(cur)) {  // previous line was a hyphen split — rejoin
      cur = cur.replace(/[-­]$/, '') + t;
    } else {
      cur += ' ' + t;
    }
    // A short line ends the current paragraph — UNLESS it is a hyphen
    // continuation (which must rejoin the next line first) and never for a
    // lone line.
    if (lines.length > 1 && !isHyphen && t.length < threshold) {
      paras.push(cur);
      cur = '';
    }
  }
  if (cur) paras.push(cur);
  return paras.join('\n\n');
}

// Convenience: full UyghurOCR-style cleanup for one page of raw OCR text.
function cleanOcrPage(text) {
  return reflowParagraphs(normalizeOcrChars(text));
}

module.exports = { normalizeOcrChars, reflowParagraphs, cleanOcrPage };
