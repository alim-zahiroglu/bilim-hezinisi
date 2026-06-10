# بىلىم خەزىنىسى — بۇ كومپيۇتىردا ئىشلىتىش قوللانمىسى

بۇ ھۆججەتخانا (`...\bilim hezinisi pc`) سىزنىڭ **مەنبە كودىڭىز** — دېتالنى تەھرىرلەيدىغان، يېڭىلايدىغان بىردىنبىر ئەسلى ئورنىڭىز. كودنى پەقەت مۇشۇ يەردە ئۆزگەرتىڭ.

---

## 1. ئىككى نەرسىنى ئارىلاشتۇرماڭ

| نېمە | ئورنى | رولى |
|---|---|---|
| **مەنبە كود** | `E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc` | سىز تەھرىرلەيدىغان ئەسلى لايىھە. ھەممە ئىش مۇشۇ يەردە. |
| **سانلىق مەلۇمات (كۈتۈپخانا)** | `C:\Users\Y\JamiyKutupxana\` | كىتاب، خاتىرە، ساندان (`library.db`). ئەڭ قىممەتلىك ھۆججەتلەر. |

> 🔑 مۇھىم: كۈتۈپخانا (سانلىق مەلۇمات) **مەنبە كودنىڭ ئىچىدە ئەمەس**. ئۇ ئۆيى مۇندەرىجىسىدە (`C:\Users\Y\JamiyKutupxana`) تۇرىدۇ، دېتال ئۇنى **ئۆزى تېپىپ ئوقۇيدۇ**. شۇڭا ئۇنى كۆچۈرۈشنىڭ ھاجىتى يوق.

> قاچىلانغان .exe نى ئۆچۈرسىڭىزمۇ بۇ كۈتۈپخانىغا **تەگمەيدۇ** — كىتابلىرىڭىز ساق قالىدۇ.

---

## 2. كۈتۈپخانا قانداق ئىشلەيدۇ

- `npm start` (نورمال ئىجرا) → **ئەسلى** كۈتۈپخانا `C:\Users\Y\JamiyKutupxana\` نى ئىشلىتىدۇ. **17 كىتابىڭىز كۆرۈنىدۇ.**
- `npm run dev` (سىناش) → **ئايرىم بوش** كۈتۈپخانا `C:\Users\Y\JamiyKutupxana-DEV\` نى ئىشلىتىدۇ، كۆزنەك ئىسمىدا **«— DEV»** كۆرۈنىدۇ. خەتەرلىك سىناشلارنى مۇشۇ يەردە قىلىڭ — ئەسلى كىتابلىرىڭىزغا تەگمەيدۇ.

> ئەسلى كىتابلار بىلەن خەتەرلىك سىناش قىلماقچى بولسىڭىزلا `npm run dev` نى ئىشلىتىڭ. كۈندىلىك خىزمەتتە `npm start`.

---

## 3. بىر قېتىملىق تەييارلىق

ئالدى بىلەن **Node.js (v18+)** ۋە **Git** قاچىلىنىشى كېرەك: https://nodejs.org · https://git-scm.com

ئاندىن CMD ياكى PowerShell ئېچىپ:

```cmd
cd /d "E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc"
npm install
npm run setup
```

> `npm install` `better-sqlite3` نى Electron ئۈچۈن قايتا قۇرىدۇ. ئەگەر خاتالىق بەرسە، **Visual Studio Build Tools** (C++ workload) نى قاچىلاپ قايتا سىناڭ.

---

## 4. مەنبەدىن ئىجرا قىلىش

```cmd
cd /d "E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc"
npm start
```

كۆزنەك ئىسمى **بىلىم خەزىنىسى**، 17 كىتابىڭىز كۆرۈنىدۇ. خەتەرلىك سىناش ئۈچۈن: `npm run dev`.

---

## 5. يېڭى .exe ياساش (build)

1. `package.json` دىكى `"version"` نى ئۆستۈرۈڭ (مەسىلەن `2.5.0` → `2.5.1`).
2. ئاندىن:

```cmd
cd /d "E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc"
npm run dist
```

3. نەتىجە `dist\` ئىچىدە: `Bilim Hezinisi Setup <version>.exe` (قاچىلىغۇچ) ۋە `BilimHezinisi-Portable-<version>.exe`.

> قاچىلانغان .exe مۇ ئوخشاش ئەسلى `JamiyKutupxana` كۈتۈپخانىنى ئىشلىتىدۇ.

---

## 6. Git — «قايسى يېڭى، قايسى كونا» مەسىلىسىنىڭ يېشىمى

**Windows دا بىر قېتىم** تۆۋەندىكىنى ئىجرا قىلىڭ:

```cmd
cd /d "E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc"
rmdir /s /q .git
git init
git add -A
git commit -m "v2.5.0 baseline"
```

ئاندىن ھەر قېتىم بىر ئىش پۈتكەندە: `git add -A` ئاندىن `git commit -m "..."`. تارىخنى كۆرۈش: `git log --oneline`.

---

## 7. ئالتۇن قائىدىلەر

1. كودنى **پەقەت** `...\bilim hezinisi pc` دە تەھرىرلەڭ.
2. كۈتۈپخانا (`JamiyKutupxana`) نى مەنبە كودنىڭ ئىچىگە **كۆچۈرمەڭ** — دېتال ئۇنى ئۆيى مۇندەرىجىسىدىن ئۆزى تاپىدۇ.
3. مۇھىم ئىشتىن (ياكى .exe نى ئۆچۈرۈشتىن) بۇرۇن كۈتۈپخانىنى **backup** قىلىڭ:
   ```cmd
   xcopy /E /I /Y "%USERPROFILE%\JamiyKutupxana" "E:\ditallar\men yasigan ditallar\bilim hezinisi\JamiyKutupxana-backup"
   ```
4. ھەر ئۆزگەرتىشتىن كېيىن `git commit` قىلىڭ.
5. تارقىتىشتىن بۇرۇن `package.json` دىكى version نى ئۆستۈرۈڭ.
