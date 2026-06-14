---
name: bilim-desktop
description: >-
  Build, run, and package the Windows DESKTOP (Electron) edition of «بىلىم
  خەزىنىسى» (Bilim Hezinisi). Use this skill WHENEVER the user wants to run the
  desktop app, start it in dev mode, rebuild after code changes, produce the
  .exe, make the NSIS installer or portable build, cut a release, refresh the
  offline OCR models, or fix a native-module / better-sqlite3 build error.
  Trigger on short or indirect requests too — "run the app", "build the exe",
  "make a new installer", "cut a release", "package it", or Uyghur equivalents
  like «دېتالنى ئاچ»، «exe ياسا»، «قاچىلىغۇچ ياسا»، «يېڭى نۇسخا چىقار»،
  «installer چىقار». This skill knows which steps run in Claude's Linux sandbox
  versus on the user's Windows machine, plus the Electron-specific gotchas
  (native rebuild, OCR-before-dist), so prefer it over guessing commands.
---

# Build, run & package — «بىلىم خەزىنىسى» desktop (Electron)

This skill runs, rebuilds, and packages the desktop edition: an **Electron 28 +
plain-JavaScript** Windows app (no transpile step). Packaging produces a **NSIS
installer + a portable .exe** via electron-builder. The current version is in
`package.json` (`version`). The CORE app is fully offline; Gemini AI is an
optional, opt-in online layer.

## Critical: where each step can run

The toolchain is split across two machines. Settle this first or you'll waste
time:

| Step | Needs | In Claude's sandbox? | Where it runs |
|------|-------|----------------------|---------------|
| Edit code | file tools | ✅ yes | sandbox / file tools |
| `node --check <file>` (syntax gate) | Node | ✅ yes | run it yourself |
| `npm install` (+ `electron-rebuild`) | Windows build tools | ❌ no | user's Windows machine |
| `npm start` / `npm run dev` (GUI) | Electron + a display | ❌ no | user's Windows machine |
| `npm run fetch-ocr-models` | network | ❌ no¹ | user's networked machine |
| `npm run dist-win` (electron-builder) | Windows + native modules | ❌ no | user's Windows machine |

Claude's sandbox has Node but **no Electron, no Windows build chain, no display,
and no Windows-native `better-sqlite3`**, so Claude **cannot run or package the
app itself.** Claude's real job: (1) make the code change, (2) `node --check`
it in the sandbox, then (3) hand the user one copy-paste command to run/build on
their own machine.

¹ `fetch-ocr-models` is plain Node + HTTPS and *could* run in the sandbox, but
the models must land in the user's working copy that actually gets packaged, so
have the user run it on their machine.

The user is **not a programmer.** Every command you give them must be a single
copy-paste-ready block with a one-line Uyghur explanation.

## Standard workflow

### 1. Make + validate the change (Claude, in the sandbox)

- Edit source in place. **Preserve CRLF line endings** — there is no build step
  and inconsistent endings cause noisy diffs and the occasional parser hiccup.
- Run the syntax gate over every changed file (and the inline `<script>` in
  `src/index.html`). In the sandbox you can check everything at once:
  ```bash
  ok=1; for f in *.js src/*.js scripts/*.js; do node --check "$f" || { echo "FAIL: $f"; ok=0; }; done; [ $ok -eq 1 ] && echo "All JS OK"
  ```
  Why this matters: the app is loaded straight from source, so a single syntax
  error ships as a hard crash. Never hand off a build without a clean check.
- Change **only what's necessary** and respect the hard constraints in
  *DO-NOT-TOUCH* below.

### 2. Run / test on the user's machine

Safest test command — `dev` uses a **separate** library
(`%USERPROFILE%\JamiyKutupxana-DEV`), so it can't harm the real one:

```
cd "E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc"
npm run dev
```

Uyghur note: «بۇ سىناق ھالىتى — ئايرىم سانداش ئىشلىتىدۇ، ئەسلى كىتابخانىڭىزغا تەگمەيدۇ.»

`npm start` runs against the **real** library (`%USERPROFILE%\JamiyKutupxana`) —
use it only for a final check.

> Adjust the folder path if the user keeps the project elsewhere. The right
> folder is the one containing `package.json` and `main.js`.

### 3. Cut a release (NSIS installer + portable .exe)

Give the user this, in order. The first run on a fresh copy regenerates
everything that isn't committed (node_modules, the native module, OCR engine
files, pdf.js assets) — so don't skip steps on a new machine.

```
cd "E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc"
npm install
npm run setup
npm run fetch-ocr-models
npm run dist-win
```

What each line does (tell the user in Uyghur as needed):
- `npm install` — installs packages **and** (via `postinstall`) rebuilds
  `better-sqlite3` for Electron's ABI and copies the OCR engine + pdf.js assets.
- `npm run setup` — sets up the local pdf.js (`setup-pdfjs.js`).
- `npm run fetch-ocr-models` — **downloads the offline OCR models** (ukij / uig /
  eng / tur) into `assets/ocr/tessdata/`. **This MUST happen before `dist`** —
  the models are not committed, so a build without this step ships an app whose
  offline OCR silently does nothing. Re-running is safe (existing files skipped;
  `--force` to redownload).
- `npm run dist-win` — electron-builder packages the Windows installer + portable
  .exe.

If everything is already installed and OCR models are present, a rebuild is just:
```
cd "E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc"
npm run dist-win
```

**Before a real release**, bump `version` in `package.json` (the output
filenames and the installer use it), then commit.

### 4. Output

After `dist-win`, the `dist/` folder holds (with the current `version`):
- `Bilim Hezinisi Setup <version>.exe` — NSIS installer (desktop + Start-menu
  shortcut «بىلىم خەزىنىسى»).
- `BilimHezinisi-Portable-<version>.exe` — no-install portable build.

These are unsigned, so Windows SmartScreen / antivirus may warn on first run —
tell users to choose "More info → Run anyway" (SmartScreen) or allow it in their
antivirus.

## npm scripts (source of truth — see package.json)

| Command | Does | Where |
|---------|------|-------|
| `node --check <f>` | syntax-check one JS file | sandbox ✅ |
| `npm install` | deps + `postinstall` (electron-rebuild better-sqlite3, copy-dompurify, copy-vendor) | Windows |
| `npm run setup` | local pdf.js (`setup-pdfjs.js`) | Windows |
| `npm run fetch-ocr-models` | download offline OCR models → `assets/ocr/tessdata/` | networked |
| `npm run fetch-quran` | (re)build Quran data | Windows |
| `npm run build-spelldict` | (re)build the spell dictionary | Windows |
| `npm start` | run against the **real** library | Windows |
| `npm run dev` | run against the **DEV** library (safe) | Windows |
| `npm run dist-win` / `dist` | electron-builder → NSIS + portable (x64) | Windows |

## DO-NOT-TOUCH (hard constraints — breaking these is a regression)

- **Renderer CSP stays `connect-src 'self'`.** The renderer never talks to the
  network; **all** AI traffic goes through the main process (`ai.js`) over IPC.
  Don't add network calls or relax the CSP in `src/index.html`.
- **The CORE must keep working with no network and no API key.** AI is always
  opt-in and fully gated/hidden when disabled.
- **Never log or expose the Gemini API key** beyond a masked form; it lives in
  the main process / `settings` table only.
- **Never relocate, rename, or rewrite the user library** at
  `%USERPROFILE%\JamiyKutupxana`. Use `npm run dev` for risky testing.
- **Never silently switch the user's chosen AI model** — surface a clear Uyghur
  error instead (e.g. a Pro model needing billing).

## Troubleshooting

- **App crashes on launch with `NODE_MODULE_VERSION` / "compiled against a
  different Node.js version"** → the `better-sqlite3` native module isn't built
  for this Electron. Fix:
  ```
  npx electron-rebuild -f -w better-sqlite3
  ```
  (or just re-run `npm install`). This is the #1 desktop build failure, usually
  after changing Node/Electron versions or copying `node_modules` between
  machines.
- **OCR does nothing in the packaged app** → `fetch-ocr-models` wasn't run
  before `dist`. Run it, then `npm run dist-win` again.
- **`BUILD.cmd` errors / looks wrong** → it's stale (old version label, and it
  calls a removed `make-source-zip.js`). Don't use it. Use `npm run dist`
  (or `Build-Installer.cmd`) instead.
- **Verify before declaring success** → the build only "worked" if the expected
  `Setup <version>.exe` and `Portable-<version>.exe` exist in `dist/` with the
  bumped version number.

## First response when this skill triggers

Identify which task the user wants (run/dev · rebuild after a change · full
release · refresh OCR · fix a native-module error), do the sandbox-side
`node --check` yourself, then give exactly the command block(s) they must run on
their Windows machine — each with a short Uyghur note — and remind them about
`fetch-ocr-models` before any release.
