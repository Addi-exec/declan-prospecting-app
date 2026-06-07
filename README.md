# Declan Prospecting App

Prospecting scripts + contact tracker, as a desktop app (Electron).
Runs on **Windows**, **macOS**, and **Linux** (e.g. Linux Mint).

==================================================
QUICK START — WINDOWS (the easy way)
==================================================

STEP 1 (one time): Install Node.js
  - https://nodejs.org -> install the "LTS" version. You only do this once.
  - Tip: the LTS version (currently v22) is the most reliable. Very new
    versions (e.g. v24) can occasionally trip up the one-time setup download.

STEP 2 (one time): Double-click "Setup (Windows).bat".
  - This downloads the app engine (~100MB). Leave it running until it says
    "Setup complete!" and the app opens. Needs internet this one time.

STEP 3 (every time after): Double-click "Start (Windows).bat".
  - It just opens the app.

If Setup can't download the engine, it's almost always antivirus or a
firewall blocking it — add this folder as an exclusion (or try a phone
hotspot) and run Setup again. The launcher uses a mirror to make the
download more reliable.

==================================================
QUICK START — MAC
==================================================

STEP 1 (one time): Install Node.js
  - https://nodejs.org -> install the "LTS" version.

STEP 2 (one time): Unlock the launcher (Mac security):
  - Open Terminal (Cmd+Space, type "Terminal", Enter).
  - Type:  chmod +x       (the word chmod, a space, +x, a space)
  - Drag "Start (Mac).command" from Finder into the Terminal window, press Enter.
  - That's the only time you'll need Terminal.

STEP 3: Double-click "Start (Mac).command".
  - First launch installs the app automatically (needs internet once), then opens.
  - After that, it just opens.

Your contacts auto-save to a local database and are never affected by updates.

==================================================
QUICK START — LINUX (Linux Mint / Ubuntu)
==================================================

STEP 1 (one time): Install Node.js
  - Install the LTS version. On Linux Mint / Ubuntu:
        sudo apt update && sudo apt install nodejs npm
    (or get the "LTS" installer from https://nodejs.org). LTS (v22) is the
    most reliable; very new versions (v24) can trip up the one-time setup.

STEP 2 (one time): Make the launcher executable:
  - Open a terminal in this folder and run:
        chmod +x "Start (Linux).sh"

STEP 3: Run "Start (Linux).sh" (double-click → "Run", or ./"Start (Linux).sh").
  - First launch installs the app automatically (needs internet once), then opens.
  - After that, it just opens.

If npm start ever fails with "Electron failed to install correctly", run:
      node .claude/skills/electron-install-fix/scripts/fix-electron.js
(the cached Linux binary lives in ~/.cache/electron/).

==================================================
HOW UPDATES WORK
==================================================

The INSTALLED app auto-updates: on launch it checks GitHub Releases, downloads
any new version in the background, and asks to restart to finish. Your contacts
are never touched. (Requires the GitHub publishing setup below.)

If you run from the launcher in dev mode instead, updating is manual: replace
renderer/index.html with the new file and reopen. The About page always shows
the version you're on.

==================================================
OPTIONAL: build a real installed app
==================================================

For an installed app with its own icon (instead of the launcher):
  npm install        # one time

  Windows:  npm run build:win     # -> dist/*.exe installer
  Mac:      npm run build:mac      # -> dist/*.dmg
  Linux:    npm run build:linux    # -> dist/*.AppImage and dist/*.deb

Windows: run the .exe installer in dist/. Unsigned by default, so Windows
SmartScreen may warn the first time — click "More info" -> "Run anyway".
(To sign it and remove the warning, see "SIGNING THE WINDOWS INSTALLER" below.)

Mac: open the .dmg, drag the app to Applications, then right-click it -> Open
the first time (clears the "unidentified developer" warning, since it's
unsigned).

Note: updating a built app means re-running the build once.

==================================================
SIGNING THE WINDOWS INSTALLER
==================================================

By default `npm run build:win` produces an UNSIGNED installer (SmartScreen warns
the first time). There are two ways to get rid of that warning:

A) SELF-SIGNED (free; removes the warning only on machines that trust the cert —
   e.g. Declan's own PC). A self-signed cert already lives in the `signing/`
   folder (declan-codesign.pfx + .cer). To build a SIGNED installer with it,
   set two environment variables, then build:

     Windows PowerShell:
       $env:CSC_LINK = "signing\declan-codesign.pfx"
       $env:CSC_KEY_PASSWORD = "declan-prospecting"
       npm run build:win

   That signs the app, the uninstaller and the installer. To make a machine
   TRUST the signature (so the "unknown publisher" warning disappears),
   double-click "Trust Cert (Windows).bat" once on that machine, or import
   signing\declan-codesign.cer into "Trusted Root" + "Trusted Publishers".
   (Declan's current PC is already set up.)

   Note: a self-signed cert is NOT trusted on random third-party PCs — it only
   helps on machines where you've installed the .cer.

B) REAL CERTIFICATE (paid; removes the warning everywhere). Buy an Authenticode
   code-signing certificate from a CA (e.g. DigiCert, Sectigo). An OV cert needs
   to build "reputation" before SmartScreen goes quiet; an EV cert clears it
   immediately. Then point the same CSC_LINK / CSC_KEY_PASSWORD env vars at your
   purchased .pfx and run `npm run build:win` — no code changes needed.

The `signing/` folder and any *.pfx are gitignored (never commit a private key).

==================================================
BUILDING THE MAC .DMG (must be done ON a Mac)
==================================================

electron-builder cannot cross-build a macOS .dmg from Windows — the .dmg has to
be produced on an actual Mac (it needs macOS-only tools like hdiutil). Steps:

  1. Copy this whole prospecting-app folder onto a Mac (USB, cloud, or git).
  2. Install Node.js LTS from https://nodejs.org
  3. In Terminal, inside the folder:
       npm install
       npm run build:mac
  4. The result is dist/Declan Prospecting App-<version>.dmg
       (plus dist/mac/ with the .app, and latest-mac.yml).

UNSIGNED (free, simplest):
  The .dmg works, but the first launch shows "unidentified developer".
  Fix per machine: right-click the app -> Open -> Open (only needed once).

SIGNED + NOTARIZED (no warning, needs a paid Apple Developer account — US$99/yr):
  This is the Mac equivalent of a real Windows code-signing cert. With an
  Apple "Developer ID Application" certificate installed in the Mac's Keychain:

    a) Tell electron-builder to harden + notarize. In package.json under
       "build", set:
           "mac": {
             "target": "dmg",
             "category": "public.app-category.business",
             "icon": "assets/icon.icns",
             "hardenedRuntime": true,
             "gatekeeperAssess": false,
             "notarize": { "teamId": "YOUR_APPLE_TEAM_ID" }
           }
    b) Provide Apple credentials as environment variables before building:
           export APPLE_ID="you@example.com"
           export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # appleid.apple.com
           export APPLE_TEAM_ID="YOUR_APPLE_TEAM_ID"
           npm run build:mac
    c) electron-builder signs with your Developer ID cert and uploads the app
       to Apple for notarization automatically. The finished .dmg opens with no
       warning on any Mac.

  (Leave the "notarize" block OUT for an unsigned build — adding it without an
   Apple account/cert will make the build fail.)

==================================================
WHERE YOUR DATA LIVES
==================================================
  By default, on THIS computer only:
    Windows: %APPDATA%\Declan Prospecting App\prospecting-data.json
    Mac:     ~/Library/Application Support/Declan Prospecting App/prospecting-data.json
  Use Export in the app any time for an Excel/CSV backup.

  SHARE CONTACTS ACROSS YOUR MAC + HOME PC:
   1. On computer #1, open the app -> Contacts tab -> in the "Storage" box click
      "Use a shared folder..." and pick a folder inside Dropbox / iCloud Drive /
      OneDrive / Google Drive. Your contacts move there.
   2. Wait for that folder to finish syncing to the cloud.
   3. On computer #2, do the same and pick the SAME synced folder. The app finds
      the existing contacts file and uses it.
   Now both computers read/write the same file. Tip: only have the app open on
   one computer at a time so the cloud service doesn't get a sync conflict.
   To go back, click "Use this computer only".

==================================================
PUBLISHING UPDATES VIA GITHUB (developer)
==================================================

Auto-update reads from this repo's GitHub Releases. One-time setup:

  1. In package.json -> "build" -> "publish", set "owner" to your GitHub
     username (and "repo" if different from declan-prospecting-app).
  2. Create the GitHub repo and push this folder to it.
  3. Make a GitHub Personal Access Token with "repo" scope and export it:
        Windows PowerShell:  $env:GH_TOKEN = "ghp_xxx"
        Mac/Linux:           export GH_TOKEN=ghp_xxx
  4. Bump the version (3 places: header span, About page, package.json — see
     CONVENTIONS in CLAUDE.md), then publish:
        npm run release        # builds + uploads installer + latest.yml to a Release

To ship signed builds, also set CSC_LINK / CSC_KEY_PASSWORD first (see SIGNING
above) so `npm run release` signs what it uploads.

Installed apps then pick up the new version automatically on next launch. The
baseline version must be installed once manually; everything after is automatic.
(Public repo = simplest. Private repo works too but each app needs the token.)

==================================================
PROJECT STRUCTURE
==================================================
  package.json          app + build config (Windows + Mac)
  electron/main.js      window, local DB, Excel import/export
  electron/preload.js   secure bridge (window.api)
  renderer/index.html   the full app UI
  assets/               app icons (icon.ico for Windows, icon.icns for Mac)
  Start (Windows).bat   double-click launcher (Windows)
  Setup (Windows).bat   one-time installer (Windows)
  Trust Cert (Windows).bat  trust the self-signed code-signing cert (Windows)
  Start (Mac).command   double-click launcher (Mac)
  signing/              self-signed code-signing cert (.pfx/.cer) - gitignored

==================================================
ROADMAP (AI assistant / email / Excel automation)
==================================================
  - AI: add @anthropic-ai/sdk, call it from electron/main.js; keep the API key
    in a local .env (add .env to .gitignore), read via process.env.
  - Email: Gmail API / Microsoft Graph (OAuth) or IMAP (imapflow) in main.js.
  - Heavier data / RAG: swap the JSON store for SQLite (better-sqlite3); the
    load/save handlers in main.js are the only places that touch storage.

  (The auto-update code in electron/main.js is left in place but switched off.)
