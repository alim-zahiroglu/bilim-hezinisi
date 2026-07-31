# Mac App Store listing — «بىلىم خەزىنىسى»

Primary Language is **English**. Apple's App Store has no Uyghur localization, so the
English listing is the fallback every Uyghur user will actually see. Uyghur text is still
allowed inside the fields, so each one leads with Uyghur and repeats in English.

## New App form (Step 5)

| Field | Value |
|---|---|
| Platform | macOS |
| Name | `Bilim Hezinisi` |
| Primary Language | English (U.S.) |
| Bundle ID | `com.bilim.hezinisi` |
| SKU | `bilim-hezinisi-001` |
| User Access | Full Access |

`Name` has a 30-character limit. The Latin spelling is used so the app is findable by people
typing on a Latin keyboard; the Uyghur name appears in the subtitle and description.

## Subtitle (30 characters max)

```
ئۇيغۇرچە كۇتۇپخانا · Library
```

## Promotional text (170 max)

```
ئىنتېرنېتسىز ئىشلەيدىغان ئۇيغۇرچە رەقەملىك كۇتۇپخانا — كىتاب، ئىزدەش، قۇرئان، خاتىرە ۋە OCR.
An offline Uyghur digital library: books, search, Quran, notebook and OCR.
```

## Description

```
بىلىم خەزىنىسى — ئۇيغۇرچە رەقەملىك كۇتۇپخانا

كىتابلىرىڭىزنى بىر يەرگە يىغىڭ، تېز ئىزدەڭ ۋە راھەت ئوقۇڭ. ھەممە ئىقتىدار
ئىنتېرنېتسىز ئىشلەيدۇ — سانلىق مەلۇماتلىرىڭىز پەقەت ئۆز كومپيۇتېرىڭىزدا ساقلىنىدۇ.

ئاساسلىق ئىقتىدارلار:
• كىتاب ئىمپورت قىلىش — PDF، DOCX، DOC، TXT، HTML، Markdown ۋە تور بېتى
• تېز ئىزدەش — بارلىق كىتابلار ئىچىدە تولۇق تېكىست ئىزدەش
• رەسىمدىن خەت تونۇش (OCR) — ئىنتېرنېتسىز ئۇيغۇرچە تونۇش
• قۇرئان كەرىم — مۇسھەف كۆرۈنۈشى، تەرجىمە ۋە ئىزدەش
• خاتىرە دەپتەر — تېكىست تەھرىرلەش ۋە DOCX قىلىپ ساقلاش
• ئىملا تەكشۈرۈش — ئۇيغۇرچە لۇغەت ئاساسىدا
• تۈر-تۈرگە ئايرىش، بەلگە قويۇش، خاتىرە يېزىش

ئىختىيارىي AI ياردەمچىسى:
سىز ئۆزىڭىزنىڭ Google Gemini ئاچقۇچىنى كىرگۈزسىڭىز، تەرجىمە، خۇلاسە،
چۈشەندۈرۈش ۋە ئىملا تۈزىتىش ئىقتىدارلىرىنى ئىشلىتەلەيسىز. بۇ ئىقتىدار
سۈكۈتتە ئېتىك بولۇپ، ئىشلەتمىسىڭىزمۇ دېتال تولۇق ئىشلەيدۇ.

────────────────────────────────

Bilim Hezinisi — an Uyghur digital library

Collect your books in one place, search them instantly, and read comfortably.
Everything works offline; your data stays on your own Mac.

Features:
• Import books — PDF, DOCX, DOC, TXT, HTML, Markdown, and web pages
• Fast full-text search across your whole library
• Offline Uyghur OCR for scanned books and images
• Quran module with mushaf view, translation and search
• Notebook with rich-text editing and DOCX export
• Uyghur spellchecking
• Categories, tags, bookmarks and notes

Optional AI assistant:
Add your own Google Gemini API key to unlock translation, summarizing,
explanation and proofreading. It is off by default, and the entire app
works without it.

No account. No tracking. No ads.
```

## Keywords (100 characters max, comma-separated)

```
uyghur,uygur,kitab,kutupxana,library,quran,ocr,islamic,turkic,ebook,reader,offline
```

## URLs

| Field | Value |
|---|---|
| Support URL | https://my.etlasturizm.com/bilim-hezinisi/privacy-policy |
| Marketing URL | *(optional — leave blank)* |
| Privacy Policy URL | https://my.etlasturizm.com/bilim-hezinisi/privacy-policy |

A dedicated support page would be better than reusing the privacy policy, but Apple only
requires a reachable URL.

## Category

- **Primary:** Reference — matches `LSApplicationCategoryType = public.app-category.reference`
  already set in the build.
- **Secondary:** Education

## Copyright

```
2026 Jamiy Kutupxana
```

## App Privacy questionnaire

Answer **"Data Not Collected"**. The app has no analytics, telemetry, accounts or trackers —
verified against the source. The Gemini calls do not count as collection *by you*, because
the user supplies their own API key and the traffic goes directly to Google; disclose it in
the privacy policy (already done) rather than as data you collect.

## Age rating

Expected **4+**. Two questions need thought:

- **Unrestricted Web Access** — answer **No**. The app has no browser. Web import fetches a
  URL the user pastes and converts it to text; there is no browsing UI.
- **Religious themes** — the Quran module is reference content, not objectionable material.

## Review notes (paste into App Review Information)

```
Bilim Hezinisi is an offline digital library for Uyghur-language books.
The interface is in Uyghur (right-to-left).

WHAT WORKS WITHOUT ANY SETUP
Everything except the optional AI assistant. You can import a PDF/DOCX/TXT
book, search across the library, browse the bundled Quran module, use the
notebook, and run offline OCR. No account, no login, no API key needed.

OPTIONAL AI ASSISTANT
The app has an optional AI layer powered by Google Gemini. It is disabled by
default and requires the user's OWN Gemini API key (obtained free from
Google AI Studio). It is not required to evaluate the app — every other
feature works without it. If you wish to test it, the key is entered in
Settings > AI. We do not supply a key because each user brings their own,
and the app never proxies traffic through our servers (we operate none).

NETWORK USE
Only two features touch the network, both user-initiated: the optional AI
assistant (to Google's Gemini API), and importing a web page as a book (to
the URL the user pastes). Everything else, including OCR, runs locally.

BUNDLED CONTENT
The Uyghur Quran translation is from QuranEnc.com (Sheikh Muhammad Saleh,
v1.0.2), reproduced verbatim and credited in-app as their terms of use
require.
```

## Screenshots

macOS screenshots must be 2880×1800, 2560×1600, 1440×900 or 1280×800. Suggested set:

1. Library with several books and the category tree
2. Reader showing an Uyghur book (RTL)
3. Search results across books
4. Quran module (mushaf view — includes the QuranEnc credit line)
5. Notebook
6. OCR in progress on a scanned page

Take them on this Mac with ⇧⌘4 then Space to capture the window, then crop to a supported
size. Avoid showing any real API key.
