<div dir="rtl">

# بىلىم خەزىنىسى

ئۇيغۇرچە رەقەملىك كۇتۇپخانا — كىتاب ساقلاش، ئىزدەش، ئوقۇش ۋە خاتىرە يېزىش دېتالى.
ئىنتېرنېتسىز ئىشلەيدۇ.

## چۈشۈرۈش

**[⬇️ ئەڭ يېڭى نۇسخىنى چۈشۈرۈش](../../releases/latest)**

| سىستېما | ھۆججەت |
|---|---|
| Windows (قاچىلىغۇچ) | `Bilim Hezinisi Setup <نۇسخا>.exe` |
| Windows (قاچىلىمايلا ئىشلىتىش) | `BilimHezinisi-Portable-<نۇسخا>.exe` |
| macOS (Apple Silicon) | `BilimHezinisi-<نۇسخا>-mac-arm64.dmg` |
| macOS (Intel) | `BilimHezinisi-<نۇسخا>-mac-x64.dmg` |

### Windows ئاگاھلاندۇرۇشى

قاچىلىغاندا «Windows protected your PC» دېگەن كۆك رەڭلىك ئاگاھلاندۇرۇش چىقىشى مۇمكىن.
بۇ دېتالدا مەسىلە بارلىقىدىن ئەمەس — پەقەت رەسمىي ئىمزا (code signing) سېتىۋېلىنمىغانلىقتىن.

**«More info» ← «Run anyway»** نى بېسىڭ.

### macOS ئاگاھلاندۇرۇشى

«ئېچىلمىدى» دېگەن ئۇچۇر چىقسا: `System Settings` ← `Privacy & Security` گە كىرىپ،
ئاستىدىكى **«Open Anyway»** نى بېسىڭ.

## ئىقتىدارلىرى

- كىتاب باشقۇرۇش — PDF، DOCX، DOC، TXT، HTML، Markdown ۋە تور بېتى ئىمپورت قىلىش
- ئىزدەش — بارلىق كىتابلار ئىچىدە تېز تولۇق تېكىست ئىزدەش
- OCR — رەسىملىك PDF لارنى ئىنتېرنېتسىز ئۇيغۇرچە تونۇش
- قۇرئان بۆلۈمى — مۇسھەف كۆرۈنۈشى ۋە ئىزدەش
- خاتىرە دەپتەر — تېكىست تەھرىرلەش، DOCX قىلىپ ساقلاش
- ئىملا تەكشۈرۈش — ئۇيغۇرچە لۇغەت ئاساسىدا
- AI ياردەمچىسى (ئىختىيارىي) — ئۆزىڭىزنىڭ Gemini ئاچقۇچى بىلەن

AI دىن باشقا ھەممە ئىقتىدار **ئىنتېرنېتسىز** ئىشلەيدۇ.

</div>

---

## For developers

Electron 28→43 desktop app, plain JavaScript (no transpile step), better-sqlite3 + FTS5.

```bash
npm install
npm run setup              # local pdf.js
npm run fetch-ocr-models   # REQUIRED before packaging — models are gitignored
npm run dev                # runs against a separate JamiyKutupxana-DEV library
```

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml) on a
`v*` tag, for Windows and macOS. See [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md) for
signing, the Microsoft Store (MSIX) route, and Mac App Store submission.

License: MIT
