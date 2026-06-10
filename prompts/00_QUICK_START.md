# 🚀 قەدەممۇقەدەم ئىجرا قوللانمىسى
# «بىلىم خەزىنىسى 2.4.1» ئۈچۈن قۇرئان ۋە خاتىرە مودۇللىرىنى قوشۇش

> بۇ قوللانما **سىز ئۆزىڭىز قەدەممۇقەدەم ئىجرا قىلىدىغان** قوللانما. ھەر قەدەمدە terminal دا قايسى بۇيرۇقنى ئىجرا قىلىدىغانلىقى، Claude Code غا قايسى PROMPT نى يوللايدىغانلىقى، نېمىنى سىنايدىغانلىقى ئېنىق كۆرسىتىلگەن.

---

## 📋 بۇ ھۆججەتخانا ئىچىدىكى ھۆججەتلەر

| ھۆججەت | مەزمۇنى |
|---|---|
| `prompts1-2-bootstrap.md` | **PROMPT 1** (ئورۇنلاشتۇرۇش) + **PROMPT 2** (ساندان/seed) |
| `prompt3-quran-ui.md` | **PROMPT 3** (قۇرئان UI) |
| `prompt4-quran-copy.md` | **PROMPT 4** (قۇرئان كۆچۈرۈش + Clipboard) |
| `prompt5-notes-editor.md` | **PROMPT 5** (خاتىرە تەھرىرلىگۈچ) |
| `prompt6-notes-autoref.md` | **PROMPT 6** (ئاپتوماتىك مەنبە بايقاش) |

**بارلىق PROMPT لار ئىنگلىزچە** (Claude Code بۇنىڭغا توغرا ئىنكاس قايتۇرىدۇ)، ئەمما UI تېكىستلىرى (button، toast، label) **ئۇيغۇرچە**.

---

## ⚙️ ئالدى تەييارلىق (بىر قېتىم)

### قەدەم 0.1 ــ زۆرۈر قوراللارنى ئورنىتىش

```powershell
# Node.js نەشرىنى تەكشۈرۈڭ (18 ياكى ئۇنىڭدىن يۇقىرى بولسۇن)
node -v

# Claude Code ئورنىتىلغانمۇ تەكشۈرۈڭ
claude --version
```

ئەگەر Node.js يوق بولسا: https://nodejs.org دىن چۈشۈرۈڭ.
ئەگەر Claude Code يوق بولسا: https://docs.claude.com/en/docs/claude-code دىن قاراڭ.

### قەدەم 0.2 ــ فونتلارنى سىستېمىغا ئورنىتىش (ئىنتايىن مۇھىم!)

MS Word غا چاپلىغاندا فونت ساقلىنىشى ئۈچۈن، تۆۋەندىكى فونتلار **Windows سىستېمىسىغا ئورنىتىلغان** بولۇشى لازىم:

```
_resources/UthmanicHafs1 Ex1 Ver12.otf       ← double-click → Install
_resources/UthmanicHafs1B Ex1 Ver12.otf      ← double-click → Install
_resources/قوشۇلىدىغان فونتلار/*.ttf         ← ھەممىسىنى تاللاپ → right-click → Install
```

**ئەگەر فونت ئورنىتىلمىسا:** Word دا يامان فونت چىقىدۇ (ئەمما دېتال ئىچىدە كۆرۈنىدۇ ــ چۈنكى `@font-face` بىلەن embedded).

### قەدەم 0.3 ــ لايىھە ھۆججەتخانىسىنى تەييارلاش

Windows PowerShell دا:

```powershell
# 1. يېڭى بوش folder ياساڭ (مىسالغا قارىتىلغان يول)
cd C:\
mkdir bilim-hezinisi-v242
cd bilim-hezinisi-v242

# 2. bilim-hezinisi-2_4_1-source.zip ئىچىنى شۇ ئورۇنغا extract قىلىڭ
# (Windows Explorer دا zip نى right-click → Extract All → بۇ folder نى تاللاڭ)

# 3. تەكشۈرۈڭ ــ main.js, database.js، src/index.html... بولۇشى لازىم
dir
```

### قەدەم 0.4 ــ `_resources/` ھۆججەتخانىسىنى ياساش

```powershell
# Project root ئىچىدە _resources folder ياساڭ
mkdir _resources
mkdir "_resources\قوشۇلىدىغان فونتلار"
```

ئاندىن Windows Explorer دا:
1. `بىلىم_خەزىنىسى_لازىملىق.rar` ئىچىنى بىر ۋاقىتلىق folder غا extract قىلىڭ
2. ئىچىدىن:
   - `uyghur_saleh_v1.0.2-xml.1.xml` → `C:\bilim-hezinisi-v242\_resources\` غا كۆچۈرۈڭ
   - `UthmanicHafs1-Ex1-Ver12-browser/UthmanicHafs1 Ex1 Ver12.otf` → `_resources/` غا
   - `UthmanicHafs1-Ex1-Ver12-browser/UthmanicHafs1B Ex1 Ver12.otf` → `_resources/` غا
   - `قوشۇلىدىغان فونتلار/` ئىچىدىكى **بارلىق 9 TTF** نى → `_resources/قوشۇلىدىغان فونتلار/` غا
3. `UthmanicHafs1_Ex1_Ver12.doc` نى (ئۆتكۈنچى ھەم ئىختىيارى) `_resources/quran-arabic.doc` نامى بىلەن قويۇڭ

### قەدەم 0.5 ــ تۆۋەندىكىدەك كۆرۈنۈشى كېرەك

```powershell
# تەكشۈرۈش
dir _resources

# كۆرۈنۈشى:
#   uyghur_saleh_v1.0.2-xml.1.xml
#   UthmanicHafs1 Ex1 Ver12.otf
#   UthmanicHafs1B Ex1 Ver12.otf
#   قوشۇلىدىغان فونتلار/  (9 TTF ئىچىدە)
#   quran-arabic.doc (ئىختىيارى)
```

### قەدەم 0.6 ــ Dependencies قاچىلاش

```powershell
# يەنىلا C:\bilim-hezinisi-v242 ئىچىدە
npm install

# بۇ ~1-2 دەقىقە كېتىدۇ. Error بولسا، Node.js نەشرىنى تەكشۈرۈڭ.
```

### قەدەم 0.7 ــ ئەسلى دېتالنىڭ ئىشلەۋاتقانلىقىنى تەكشۈرۈش

```powershell
npm start
```

دېتال ئېچىلسا ــ تامام، ئۆز-ئارا سېلىشتۇرۇلغان. دېتالنى ياپسىڭىز بولىدۇ.

---

## 🎯 1-قەدەم: PROMPT 1 نى ئىجرا قىلىش (Bootstrap)

### 1.1 ــ Claude Code نى ئېچىڭ

```powershell
# Project root ئىچىدە (C:\bilim-hezinisi-v242)
claude
```

### 1.2 ــ PROMPT 1 نى يوللاڭ

1. `prompts1-2-bootstrap.md` ھۆججىتىنى ئېچىڭ
2. **"🚀 PROMPT 1"** بۆلۈمىنىڭ ئىچىدىكى، **"You are working on..."** دىن باشلاپ **"After finishing, list every file..."** غىچە بولغان بارلىق تېكىستنى تاللاپ كۆچۈرۈڭ
3. Claude Code چاقىرتمىسىغا چاپلاپ، Enter بېسىڭ

### 1.3 ــ Claude Code نىڭ ئىشلىشىنى كۈتۈڭ

Claude Code ~5-10 دەقىقە ئىچىدە:
- `assets/fonts/` ياسايدۇ
- فونت ھۆججەتلىرىنى كۆچۈرىدۇ
- `package.json` نى يېڭىلايدۇ
- `src/index.html` غا mode tabs، font CSS، `setMode()` function قوشىدۇ
- 5 stub ھۆججەت ياسايدۇ
- `npm install` نى ئىجرا قىلىدۇ

ئاخىرىدا «تامام، سىناپ كۆرۈڭ» دەپ خەۋەر قايتۇرىدۇ.

### 1.4 ــ سىناپ كۆرۈڭ

```powershell
# يېڭى terminal ئېچىپ (Claude Code نى ساقلاپ قويۇپ)
npm start
```

**تەكشۈرۈش تىزىملىكى:**

- [ ] دېتال ئېچىلدى
- [ ] Sidebar ئۈستىدە 3 tab: **📚 كىتابلار** / **📖 قۇرئان كەرىم** / **📝 خاتىرە دەپتىرىم**
- [ ] «كىتابلار» default active؛ ئەسلى بارلىق ئىقتىدار ئىشلەيدۇ
- [ ] «قۇرئان كەرىم» چەكسە placeholder message كۆرۈنىدۇ
- [ ] «خاتىرە دەپتىرىم» چەكسە placeholder message كۆرۈنىدۇ
- [ ] «كىتابلار» غا قايتسا ئەسلى ھالەت كۆرۈنىدۇ
- [ ] DevTools (Ctrl+Shift+I) → Console → خاتالىق يوق

**ھەممىسى ياخشى بولسا** → دېتالنى يېپىڭ → 2-قەدەمگە ئۆتۈڭ.

**مەسىلە چىقسا** → Claude Code چاقىرتمىسىغا مەسىلىنى ئېيتىڭ، مەسىلەن:
> `npm start` قىلغاندا console دا "Cannot find module 'node-html-parser'" خاتالىقى چىقتى. npm install نى ئىجرا قىلمىغان بولسا، قىلىپ قويغىن.

---

## 🎯 2-قەدەم: PROMPT 2 نى ئىجرا قىلىش (Database + Quran seed)

### 2.1 ــ PROMPT 2 نى يوللاڭ

1. `prompts1-2-bootstrap.md` ھۆججىتىدە **"🚀 PROMPT 2"** بۆلۈمىنى ئېچىڭ
2. **"You are continuing..."** دىن **"ask me to test"** غىچە كۆچۈرۈڭ
3. Claude Code غا چاپلاپ، Enter

### 2.2 ــ Internet ئۇلانغان بولۇشى لازىم

> **دىققەت:** بۇ قەدەم **بىر قېتىم** internet نى تەلەپ قىلىدۇ (Tanzil.net دىن ئەرەبچە قۇرئان تېكىستىنى چۈشۈرۈش ئۈچۈن). چۈشۈرۈلگەندىن كېيىن، `assets/seed/quran-uthmani-hafs.txt` غا بۇنى ساقلىنىدۇ. بۇنىڭدىن كېيىن internet كەرەك ئەمەس.

Claude Code ~10-15 دەقىقە ئىچىدە:
- `database.js` غا 5 يېڭى جەدۋەل قوشىدۇ
- ~400 قۇر يېڭى ساندان فۇنكسىيىسى يازىدۇ
- `scripts/seed-quran.js` ياسايدۇ (114 سۈرە metadata + parser لار)
- `main.js` نى IPC handlers بىلەن يېڭىلايدۇ
- `preload.js` نى يېڭىلايدۇ

### 2.3 ــ سىناپ كۆرۈڭ

```powershell
npm start
```

Terminal دا مۇشۇنىڭدەك log چىقىدۇ:
```
[seed-quran] Downloading Arabic Quran text from Tanzil...
[seed-quran] Download complete.
[seed-quran] Parsed: 6236 Arabic ayas, 6236 Uyghur ayas
[seed-quran] Seeded: 114 suras, 6236 ayas.
FTS5 full-text search enabled
```

دېتال ئېچىلغاندا:
- F12 ياكى Ctrl+Shift+I بىلەن DevTools ئېچىڭ
- Console tab نى تاللاڭ
- تۆۋەندىكى كودنى چاپلاپ، Enter بېسىڭ:

```javascript
(async () => {
  const r = await window.electron.quranGetSuras();
  console.log('suras:', r.suras.length);
  const a = await window.electron.quranGetAyas(1);
  console.log('fatiha ayas:', a.ayas.length);
  const s = await window.electron.quranSearch('الحمد', { lang: 'ar' });
  console.log('search hits:', s.results.length);
  const n = await window.electron.notesGetAll();
  console.log('notes:', n.docs.length);
})();
```

**تەكشۈرۈش تىزىملىكى:**

- [ ] `suras: 114` كۆرۈندى
- [ ] `fatiha ayas: 7` كۆرۈندى
- [ ] `search hits:` 30 ياكى ئۇنىڭدىن يۇقىرى
- [ ] `notes: 0` كۆرۈندى
- [ ] دېتالنى ياپ/ئاچ → terminal دا `[seed-quran] Already seeded, skipping.` چىقىدۇ (قايتا چۈشۈرۈلمەيدۇ)
- [ ] ئەسلى كىتاب فۇنكسىيىسى ئىشلەۋاتىدۇ

**مەسىلە چىقسا:**
- Tanzil چۈشۈرۈلمىسە: `[seed-quran] Tanzil download failed: ...` چىقىدۇ. Firewall/proxy تەكشۈرۈپ قايتا ئۇرۇنۇڭ.
- `Uyghur translation XML not found`: `_resources/uyghur_saleh_v1.0.2-xml.1.xml` ھۆججىتىنىڭ توغرا ئورۇنغا قويۇلغانلىقىنى تەكشۈرۈڭ.

**ھەممىسى ياخشى بولسا** → 3-قەدەمگە.

---

## 🎯 3-قەدەم: PROMPT 3 نى ئىجرا قىلىش (Quran UI)

### 3.1 ــ PROMPT 3 نى يوللاڭ

`prompt3-quran-ui.md` ھۆججىتىنى پۈتۈنلەي كۆچۈرۈپ Claude Code غا چاپلاڭ.

### 3.2 ــ Claude Code ئىشلەيدۇ

- `src/quran.css` نى تولدۇرىدۇ (~200 قۇر)
- `src/quran.js` نى تولدۇرىدۇ (~350 قۇر)

### 3.3 ــ سىناپ كۆرۈڭ

```powershell
npm start
```

**تەكشۈرۈش تىزىملىكى:**

- [ ] «قۇرئان كەرىم» tab نى چېكىڭ
- [ ] Sidebar دا 114 سۈرە كۆرۈنىدۇ (ئەرەبچە + ئۇيغۇرچە ئىسمى)
- [ ] Fatiha default كۆرۈنىدۇ، 7 ئايەت
- [ ] ئايەت Uthmanic Hafs فونت بىلەن چوڭ، ئېنىق كۆرۈنىدۇ
- [ ] ئۇيغۇرچە تەرجىمە UKIJ Ekran فونت بىلەن كۆرۈنىدۇ
- [ ] Fatiha دا بىسمىللاھ يېزىلمايدۇ (چۈنكى ئۇنىڭ 1-ئايىتى)
- [ ] سۈرە 2 (Baqara) نى ئاچسا ــ ئۇنىڭ ئۈستىدە بىسمىللاھ يېزىلىدۇ
- [ ] سۈرە 9 (Tawba) ــ بىسمىللاھ يوق
- [ ] Sidebar دا «بقرە» ياكى «Baqara» ياكى «2» ــ فىلتر ئىشلەيدۇ
- [ ] ئۈستىدىكى jump input ــ 2 / 255 → Ayat al-Kursi گە ئاتلايدۇ
- [ ] ئۈستىدىكى search ــ `الحمد` (ئەرەبچە) → ≥30 نەتىجە، يۇمشاق سېرىق highlighting
- [ ] ئۈستىدىكى search ــ `مۇسا` (ئۇيغۇرچە) → ئۇيغۇرچە تەرجىمىدە نەتىجە

**مەسىلە چىقسا ۋە ئەرەبچە فونت ياخشى كۆرۈنمىسە:**
- `assets/fonts/UthmanicHafs1.otf` بارلىقىنى تەكشۈرۈڭ
- DevTools → Network → Fonts tab دا فونت يۈكلەنگەنلىكىنى تەكشۈرۈڭ

**ھەممىسى ياخشى بولسا** → 4-قەدەمگە.

---

## 🎯 4-قەدەم: PROMPT 4 نى ئىجرا قىلىش (Clipboard)

### 4.1 ــ PROMPT 4 نى يوللاڭ

`prompt4-quran-copy.md` نى پۈتۈنلەي كۆچۈرۈپ Claude Code غا چاپلاڭ.

### 4.2 ــ Claude Code ئىشلەيدۇ

- `src/quran.js` غا ~150 قۇر clipboard فۇنكسىيىسى قوشىدۇ
- `src/quran.css` تەكشۈرۈلۈپ menu ئۈچۈن style ئىشلىتىلىدۇ

### 4.3 ــ سىناپ كۆرۈڭ

```powershell
npm start
```

**تەكشۈرۈش تىزىملىكى:**

- [ ] Fatiha دىكى 1-ئايەتنى چەكسە، ئاستىدا menu چىقىدۇ («يالغۇز»/«تەرجىمىسى بىلەن»)
- [ ] «يالغۇز ئايەتنى كۆچۈرۈش» → toast كۆرۈنىدۇ
- [ ] MS Word ئېچىڭ → Ctrl+V → `﴿بِسۡمِ ٱللَّهِ...﴾` فورماتتا چىقىدۇ
- [ ] 2-ئايەتكە «تەرجىمىسى بىلەن» → Word دا:
  ```
  ﴿ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ﴾
  «جىمى ھەمدۇ سانا ئالەملەرنىڭ پەرۋەردىگارى ئاللاھقا خاستۇر»
  ```
- [ ] Arabic تېكىست Uthmanic Hafs فونتى بىلەن كۆرۈنىدۇ (Word نىڭ فونت panel دا تەكشۈرۈش)
- [ ] سۈرە 2 گە ئۆتۈپ، **Ctrl+Click** بىلەن 3 ئايەتنى تاللاڭ (ھەممىسى سېرىق ھالەتتە)
- [ ] **Ctrl+C** → toast: «3 ئايەت كۆچۈرۈلدى»
- [ ] Word دا Ctrl+V → 3 ئايەت ئايرىم abzats قىلىپ چىقىدۇ

**ھەممىسى ياخشى بولسا** → 5-قەدەمگە.

---

## 🎯 5-قەدەم: PROMPT 5 نى ئىجرا قىلىش (Notes Editor)

### 5.1 ــ PROMPT 5 نى يوللاڭ

`prompt5-notes-editor.md` نى كۆچۈرۈپ Claude Code غا چاپلاڭ.

### 5.2 ــ Claude Code ئىشلەيدۇ

- `src/notes.css` نى تولدۇرىدۇ (~200 قۇر)
- `src/notes.js` نى تولدۇرىدۇ (~600 قۇر)

### 5.3 ــ سىناپ كۆرۈڭ

```powershell
npm start
```

**تەكشۈرۈش تىزىملىكى:**

- [ ] «خاتىرە دەپتىرىم» tab → sidebar دا «+ يېڭى خاتىرە» button
- [ ] Button نى بېسىڭ → يېڭى خاتىرە ئېچىلىدۇ
- [ ] Title input ــ «سىناق 1» يېزىڭ → 3 سىكۇنتتىن كېيىن «ساقلاندى» چىقىدۇ
- [ ] Editor دا 2-3 abzats يېزىڭ
- [ ] Bold / Italic / Underline ئىشلەيدۇ (selection ئۈستىدە)
- [ ] Font dropdown ــ «UKIJ Tuz» تاللاش → فونت ئۆزگىرىدۇ
- [ ] Size dropdown ــ «چوڭ» تاللاش → ئۆلچىمى ئۆزگىرىدۇ
- [ ] Bullet list / numbered list / blockquote button لار ئىشلەيدۇ
- [ ] Ctrl+S → توغرىلا «ساقلاندى» چىقىدۇ
- [ ] Right panel دا 📖 قۇرئان tab ــ 2 / 255 / تەرجىمىسى بىلەن / كۆرۈش → Ayat al-Kursi preview
- [ ] «قىستۇرۇش» button → editor گە قىستۇرۇلىدۇ (ئايەت + تەرجىمە bloki)
- [ ] «كۆچۈرۈش» button → Word دا توغرا
- [ ] دېتالنى ياپ/ئاچ → خاتىرە ساقلانغان
- [ ] 2-3 يېڭى خاتىرە ياساپ، ئالمىشىشنى سىناش

**ھەممىسى ياخشى بولسا** → 6-قەدەمگە (ئاخىرقى).

---

## 🎯 6-قەدەم: PROMPT 6 نى ئىجرا قىلىش (Auto-Reference)

### 6.1 ــ ئالدىن تەييارلىق: 1-2 كىتاب قوشۇڭ

6-قەدەمنى سىناش ئۈچۈن، ئاز دېگەندە 1-2 TXT ياكى DOCX كىتابنىڭ ئاللىبۇرۇن كۇتۇپخانىڭىزدا بولۇشى لازىم. بۇنداق بولمىسا auto-reference تەكشۈرۈشى مۇمكىن ئەمەس.

«كىتابلار» mode دا «+ كىتاب قوشۇش» ئارقىلىق بىر قانچە TXT ياكى DOCX قوشۇپ قويۇڭ.

### 6.2 ــ PROMPT 6 نى يوللاڭ

`prompt6-notes-autoref.md` نى كۆچۈرۈپ Claude Code غا چاپلاڭ.

### 6.3 ــ Claude Code ئىشلەيدۇ

- `src/ngram.js` نى تولدۇرىدۇ (~130 قۇر)
- `src/notes.js` غا ~280 قۇر قوشىدۇ (scan/wrap/panel)
- `main.js` غا backfill + add/delete hook قوشىدۇ

### 6.4 ــ سىناپ كۆرۈڭ (ئۈچ باسقۇچ)

**1-باسقۇچ: Backfill**

```powershell
npm start
```

Terminal دا مۇشۇنداق log چىقىشى كېرەك (10-30 سىكۇنت ئىچىدە):
```
[ngram] backfill complete: indexed N books
```

بۇ بىر قېتىم ئىشلەيدۇ. Nextتە:
```
[ngram] backfill: nothing to do
```

**2-باسقۇچ: Live scanning**

- خاتىرە ئېچىڭ
- Editor ئىچىگە بىر abzats يېزىڭ، شۇ abzats دا كىتابلىرىڭىز ئىچىدە بار بولغان سۆز (5+ ھەرپ) بولسۇن
- 400ms كېيىن شۇ سۆز ئاستىدا **سېرىق نۇقتىلىق سىزىق** كۆرۈنىدۇ

**3-باسقۇچ: Panel interaction**

- سېرىق سۆزنى چەكسە → right panel «🔗 مەنبە» tab غا ئۆتىدۇ
- شۇ سۆزنى ئۆز ئىچىگە ئالغان 1-3 snippet ھەر كىتاب ئۈچۈن كۆرۈنىدۇ
- «ھەممىسىنى كۆرۈش» button → بارلىق match سۆزلەرنى كۆرسىتىدۇ
- «📝 قىستۇرۇش» button → snippet editor گە blockquote قىلىپ قىستۇرۇلىدۇ

**تەكشۈرۈش تىزىملىكى:**

- [ ] Backfill بىر قېتىم ئىشلىدى
- [ ] Live scanning 400ms دېبۇنس بىلەن ئىشلەيدۇ
- [ ] Stop-phrase «ئاللاھ تائالا مۇنداق دەيدۇ» يېزىلسا — match قىلىنمايدۇ
- [ ] 5 ھەرپتىن قىسقا سۆز — match قىلىنمايدۇ
- [ ] Click → panel + snippet + insert ئىشلەيدۇ
- [ ] يېڭى كىتاب قوشۇلسا، شۇ كىتاب ئاپتوماتىك index بولىدۇ
- [ ] يېڭى session دا ھەم insert قىلىنغان snippet لار ساقلىنىدۇ

---

## 🎉 ئاخىرقى سىناق: پۈتۈن end-to-end

6 قەدەم تامام بولغاندا، تۆۋەندىكى ھەممىنى بىرنىڭ ئارقىدىن بىرنى تەكشۈرۈڭ:

```powershell
npm start
```

1. **ئەسلى كۇتۇپخانا ئىشلەيدۇ.** TXT كىتابلار بار، ئوقۇغىلى، ئىزدىگىلى، خەتكۈش قويغىلى بولىدۇ
2. **قۇرئان mode.** Fatiha، Baqara، Ayat al-Kursi (2:255) ئاچقىلى بولىدۇ. Search `الحمد` (ئەرەبچە)، `رەبىم` (ئۇيغۇرچە) ئىشلەيدۇ
3. **ئايەت كۆچۈرۈش.** MS Word دا Ctrl+V → font ساقلانغان، ﴿...﴾ فورماتى ساقلانغان
4. **خاتىرە mode.** Create + Bold + Font + Save + Quran insert + Word ga chaplash ھەممىسى ياخشى
5. **Auto-reference.** بىر كىتابتىكى سۆز يېزىلسا سېرىق سىزىقچە → click → insert
6. **Console خاتالىقى يوق.** Ctrl+Shift+I دا خاتالىق يوق (پەقەت expected log لار)

---

## 📦 ئاخىرقى: Installer ياساش (ئىختىيارى)

```powershell
npm run dist
```

~5-10 دەقىقە كېتىدۇ. نەتىجە:
- `dist\Bilim Hezinisi Setup 2.4.2.exe` — NSIS installer
- `dist\BilimHezinisi-Portable-2.4.2.exe` — portable نەشرى
- `dist\win-unpacked\` — installer-siz نۇسخىسى

---

## ⚠️ مەسىلە ھەل قىلىش (Troubleshooting)

### «Cannot find module 'node-html-parser'» خاتالىقى

```powershell
npm install
# قايتا ئۇرۇنۇش
npm start
```

### Tanzil چۈشۈرۈلمىدى

Firewall/Proxy قاتلىمى. Browser ئارقىلىق https://tanzil.net/res/text/quran-uthmani-hafs.txt نى چۈشۈرۈپ، `assets/seed/quran-uthmani-hafs.txt` غا قويۇڭ. ئاندىن `npm start` قايتا.

### Uthmanic Hafs فونت Word دا كۆرۈنمىدى

`_resources/UthmanicHafs1 Ex1 Ver12.otf` نى double-click قىلىپ Install كۇنۇپكىسىنى بېسىڭ. Word نى قايتا ئېچىپ سىناپ كۆرۈڭ.

### Auto-reference ئىشلىمەيدۇ

- `[ngram] backfill complete` چىقتىمۇ Console دا؟ چىقمىسا ــ `npm start` نى قايتا ئۇرۇنۇڭ.
- Stop-phrase ئەمەسمۇ يېزىۋاتقان؟ `ئاللاھ تائالا مۇنداق دەيدۇ` تىپىدىكى سۆزلەر رەت قىلىنىدۇ.
- سۆز 5 ھەرپ ياكى ئۇنىڭدىن كۆپمۇ؟
- كىتاب كۇتۇپخانىدا بار ھەم shu سۆز ئىچىدە بولۇشى لازىم.

### PROMPT ئىجرا قىلىۋاتقاندا Claude Code خاتالىق قىلدى

Claude Code چاقىرتمىسىغا مەسىلىنى ئېيتىڭ. مىسال:
> bu step دا `src/quran.js` نى ياسىغاندا، `escHtml` ئىككى قېتىم declare قىلىپ قويدۇڭ. تۈزىتىپ قوي.

ياكى ئۆزى توغرىلاپ قويىدۇ. ياكى:
> ئالدىنقى ئىش undo قىلىپ، PROMPT نى قايتا ئىجرا قىل.

### كومپيۇتېر قاتتىق ئاستا ئىشلەۋاتىدۇ

Auto-reference scan ئاستا بولسا:
- Book كۆپ (30+) بولسا، backfill بىر نەچچە دەقىقە كېتىشى مۇمكىن. بىر قېتىم تامام بولسا qaytadan ishlamaydu.
- Editor دا ئۇزۇن abzats يازسىڭىز (10000+ ھەرپ)، candidate لارنى 50 بىلەن چەكلەنگەن.

---

## ✅ نۇسخا (Version) مەلۇماتى

| خاسلىق | قىممىتى |
|---|---|
| Electron | 28.x |
| sql.js | 1.10+ |
| node-html-parser | 6.1+ (يېڭى) |
| Total new lines | ~1800 |
| Modified existing lines | ~400 |
| Required disk space | ~10 MB |

**مۇۋەپپەقىيەت تىلەيمەن!** مەسىلە چىقسا بۇ قوللانمىنىڭ Troubleshooting قىسمىغا قاراڭ ياكى Claude Code غا مەسىلىنى ئايدىڭ يازسىڭىز، قارشىسىنى تاپالايدۇ.
