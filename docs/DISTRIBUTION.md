# Distribution guide — «بىلىم خەزىنىسى»

Four channels, in the order they can realistically ship:

| Channel | Signing | Review | Cost |
|---|---|---|---|
| GitHub Releases (Windows + macOS) | none / Developer ID | none | free |
| macOS DMG, direct download | Developer ID + notarization | none | included in Apple account |
| Microsoft Store (MSIX) | Microsoft signs it | 1–3 days | ~$19 one-time |
| Mac App Store | Apple Distribution + provisioning profile | days–weeks | included in Apple account |

Everything is built by `.github/workflows/release.yml` on a `v*` tag. The Windows build runs
on a GitHub-hosted Windows runner, so no Windows machine is needed.

---

## 1. GitHub Releases

One-time:

```bash
gh repo create bilim-hezinisi --public --source=. --remote=origin --push
```

Each release:

```bash
# bump "version" in package.json first
git tag v3.1.0
git push origin v3.1.0
```

The workflow builds both platforms and creates a **draft** release
(`build.publish.releaseType: "draft"`), so release notes can be written in Uyghur before
anything goes public. Publish it from the GitHub Releases page.

Windows builds on this channel are unsigned. First-run shows a SmartScreen prompt; users
choose **More info → Run anyway**. Document this next to the download link:

> ⚠️ Windows «SmartScreen» ئاگاھلاندۇرۇشى چىقسا: «More info» ← «Run anyway» نى بېسىڭ.

## 2. macOS DMG (Developer ID)

Needed once, in the Apple Developer portal:

1. Create a **Developer ID Application** certificate and install it into the login keychain.
   Verify with `security find-identity -v -p codesigning` — it must list
   `Developer ID Application: … (TEAMID)`. It currently lists none.
2. Create an app-specific password at <https://account.apple.com> → Sign-In and Security →
   App-Specific Passwords.

Local signed + notarized build:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOURTEAMID"
npm run dist-mac-release
```

For CI, add these repository secrets: `MAC_CSC_LINK` (the `.p12` base64-encoded),
`MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

Verify the result:

```bash
spctl -a -vvv --type install "dist/mac-arm64/Bilim Hezinisi.app"
# expect: accepted / source=Notarized Developer ID
```

`npm run dist-mac` (no `-release`) skips signing entirely — useful for testing packaging.
Note that an unsigned build will not launch via Finder/`open` on Apple Silicon; run the
binary inside `Contents/MacOS/` directly to test it.

## 3. Microsoft Store (MSIX)

1. Register at <https://partner.microsoft.com/dashboard> as an **individual** (~$19 one-time).
2. Reserve the app name, then open **Product → Product identity** and copy:
   `Package/Identity/Name`, `Package/Identity/Publisher`, and `Publisher display name`.
3. Put those three values into `build.appx` in `package.json`, replacing the
   `REPLACE-WITH-…` placeholders.
4. Build on Windows (or let CI do it): `npm run dist-win-store`
5. Upload `dist/BilimHezinisi-<version>-store.appx` to Partner Center.

Microsoft re-signs MSIX packages during certification, so **no code-signing certificate
purchase is required**. Submitting the NSIS `.exe` instead *would* require buying one —
that is why this route uses MSIX.

MSIX does not virtualize the user profile for app data, so the library keeps living at
`%USERPROFILE%\JamiyKutupxana` exactly as it does today.

## 4. Mac App Store

1. Register the App ID `com.bilim.hezinisi` in **Certificates, Identifiers & Profiles**.
2. Create these, in the portal:
   - **Apple Distribution** certificate
   - **Mac Installer Distribution** certificate
   - a **Mac App Store** provisioning profile for the App ID
3. Save the profile as `build/embedded.provisionprofile` (already referenced by
   `build.mas.provisioningProfile`; the file is gitignored — never commit it).
4. Build and upload:
   ```bash
   npm run dist-mas
   xcrun altool --upload-app -f "dist/mas/Bilim Hezinisi.pkg" -t macos \
     -u "$APPLE_ID" -p "$APPLE_APP_SPECIFIC_PASSWORD"
   ```

### Listing requirements

- **Icon 1024×1024.** `assets/icon.png` is only 512×512 and `assets/icon.icns` was generated
  by upscaling it, so the largest slot is soft. Supply a true 1024px original and regenerate
  before submitting.
- **Privacy policy URL is mandatory.** With AI enabled the app sends user-selected text to
  Google Gemini (`ai.js`). Disclose this and answer the App Privacy questionnaire accordingly.
- **Review notes** should state plainly:
  - the core library, search, reader, Quran, notebook, and OCR are fully offline;
  - AI is opt-in and requires the user's own Gemini API key, so the reviewer can evaluate the
    whole app without one;
  - how to reach the AI settings if they do want to test it.

### Sandbox behavior

The App Store build is sandboxed (`build/entitlements.mas.plist`). `main.js` therefore puts
the library under `app.getPath('appData')` on macOS — `~/Library/Application
Support/JamiyKutupxana` — which resolves correctly both inside and outside the sandbox.
Windows and Linux keep the original `os.homedir()` layout.

---

## Release checklist

1. Bump `version` in `package.json`.
2. `node --check` every changed `.js` (and the inline `<script>` in `src/index.html`).
3. Test locally: `npm run dev` (uses the separate `JamiyKutupxana-DEV` library).
4. Commit, tag `v<version>`, push the tag.
5. Wait for CI, then verify the draft release has: `.dmg` ×2 (arm64 + x64), `Setup .exe`,
   `Portable .exe`.
6. **Confirm OCR works in a packaged build.** The `.traineddata` models are gitignored and
   fetched at build time; if that step is ever skipped the app ships with OCR that silently
   does nothing.
7. Write Uyghur release notes and publish.
