# OCR trained models (tessdata)

This folder holds the Tesseract trained models the offline Uyghur OCR uses.
The model files are **not committed** (each is several MB) — fetch them once:

```
npm run fetch-ocr-models
```

That downloads four models into this folder:

| file | purpose |
|------|---------|
| `ukij.traineddata` | Gheyret Kenji's custom Uyghur model — the default |
| `uig.traineddata`  | secondary Uyghur model |
| `eng.traineddata`  | English (mixed texts) |
| `tur.traineddata`  | Turkish (mixed texts) |

Source: **UyghurOCR 2.0** by غەيرەت كەنجى (Gheyret Kenji), MIT licensed —
<https://github.com/gheyret/UyghurOCR>. We do not ship UyghurOCR's C# app;
we reuse only its trained models with the bundled `tesseract.js` engine.

If the automatic fetch fails (e.g. no network on the build machine), download
the four files manually from the repo's `tessdata/` folder and drop them here.
At runtime the app reads these files from disk — OCR is fully offline.
