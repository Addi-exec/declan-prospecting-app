# CLAUDE.md — Declan Prospecting App

Context for Claude Code. Read this before making changes.

## What this is
A desktop app for **Declan Addison**, a real estate agent in Melbourne / Victoria,
Australia. Two jobs in one app:
1. **Prospecting scripts** — cold-calling scripts (openers, objections, closes,
   follow-ups, nurture) for four prospecting methods.
2. **Contact tracker (CRM)** — log contacts after calls; the app computes when
   each person is due for their next follow-up/nurture touch, and exports to Excel.

Built with **Electron, all JavaScript**. **Cross-platform: Windows + macOS.**
Declan's own machine is Windows. Dev mode (`npm start`) and the installer build
work on both; keep any platform-specific code branched on `process.platform`.

## Tech stack
- **Electron** (main + preload + renderer). No framework — the UI is one big
  hand-written `renderer/index.html` (HTML + inline CSS + vanilla JS).
- **exceljs** for native Excel/CSV import/export (pure JS, no native deps).
- **Local JSON database** for contacts (no SQLite yet — see Roadmap).
- **Updates** are ENABLED and platform-split (signed Windows can self-install;
  unsigned macOS cannot, so it does a manual check):
  - **Windows**: `main.js` runs `autoUpdater.checkForUpdates()` (electron-updater)
    on launch when packaged (silent; no-ops in dev or if no release is reachable).
    A found update downloads in the background and offers a restart-to-install.
  - **macOS**: `main.js` queries the GitHub Releases API directly (built-in
    `https`, no deps), compares versions, and if newer opens the `.dmg` download
    in the browser via `shell.openExternal` — the user drags the new app into
    Applications. Runs silently on launch (packaged) + via the About-page button.
  Needs GitHub `publish` config (owner/repo — already set) + releases published
  via `npm run release`. See README "PUBLISHING UPDATES VIA GITHUB".

## Run / build
```
npm install        # one time
npm start          # run in dev (Windows + Mac)
npm run build:win  # -> dist/*.exe  (nsis installer; unsigned, SmartScreen warns first run)
npm run build:mac  # -> dist/*.dmg  (build on a Mac; unsigned, right-click->Open first time)
npm run build      # builds for the current platform
```
Double-click launchers: `Start (Windows).bat` / `Start (Mac).command` (run `npm start`).
First-time Windows install: `Setup (Windows).bat` (downloads the Electron binary
via an npm mirror; see the Windows setup note below).

### Windows setup gotcha (important)
The Electron binary download/extract can silently no-op on **Node v24** (the
post-install extract step finishes with exit 0 but leaves `node_modules/electron/dist`
empty — no `electron.exe`, no `path.txt`). Symptom: `npm start` fails with
"Electron failed to install correctly". Fixes, in order of preference:
1. Use Node **LTS (v22)**, not v24 — most reliable.
2. Re-run `Setup (Windows).bat` (sets `ELECTRON_MIRROR`, clears the cache).
3. Manual recovery: extract the cached zip
   `%LOCALAPPDATA%\electron\Cache\<hash>\electron-v<ver>-win32-x64.zip` into
   `node_modules\electron\dist`, then write `electron.exe` into
   `node_modules\electron\path.txt`.
The `.npmrc` pins `electron_mirror` to npmmirror.com to dodge blocked GitHub downloads.

### `npm run build:win` gotcha (winCodeSign symlinks)
On a non-admin box without Developer Mode, the first `build:win` dies extracting
`winCodeSign-2.6.0.7z` ("Cannot create symbolic link : A required privilege is not
held by the client" for `darwin/.../libcrypto.dylib`/`libssl.dylib` — macOS libs the
Windows build never uses). Permanent fixes: enable Windows Developer Mode, or run the
build elevated. No-admin workaround — pre-extract excluding the symlink folder so
app-builder finds the cache ready:
```
cd "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"   # delete the numeric temp dirs first
node_modules\7zip-bin\win\x64\7za.exe x <name>.7z -o"winCodeSign-2.6.0" -xr!darwin -y
del *.7z   # then re-run build:win
```
Once the `winCodeSign-2.6.0` cache dir exists, subsequent builds just work.
Output: `dist/Declan Prospecting App Setup <ver>.exe` (NSIS).

### Code signing (Windows)
`build:win` is UNSIGNED unless `CSC_LINK` (path to a .pfx) and `CSC_KEY_PASSWORD`
env vars are set — electron-builder picks them up automatically (no package.json
change). A self-signed cert is checked in under `signing/` (gitignored):
`declan-codesign.pfx` (password `declan-prospecting`) + `declan-codesign.cer`.
Signed builds: set those two env vars, run `build:win` → app + uninstaller +
installer all signed. A machine TRUSTS it via `Trust Cert (Windows).bat` (imports
the .cer to per-user Root + TrustedPublisher); Declan's PC is already trusted, so
`Get-AuthenticodeSignature` reports `Valid`. Self-signed only removes the warning
on machines that trust the cert — for all PCs, swap in a CA-issued (OV/EV) cert
via the same env vars. Mac signing/notarization: see README (needs Apple Dev acct).

## File map
```
package.json          app + build config (win nsis + mac dmg targets)
electron/main.js      BrowserWindow; IPC: contacts load/save, Excel import/export,
                      app version, update check. Update path is platform-split:
                      Windows = electron-updater auto-install; macOS = manual
                      (queries GitHub Releases, opens the .dmg download)
electron/preload.js   contextBridge -> window.api (the only renderer<->main surface)
renderer/index.html   THE ENTIRE APP (UI, styles, all logic). ~1800 lines.
assets/               icon.ico (Win), icon.icns (Mac), icon.png/icon_512.png, make_icon.py
Start (Windows).bat   dev-mode launcher (Windows)
Setup (Windows).bat   one-time Windows installer (downloads Electron via mirror)
Trust Cert (Windows).bat  trusts the self-signed code-signing cert (per-user)
Start (Mac).command   dev-mode launcher (Mac)
signing/              self-signed code-signing cert (.pfx/.cer); GITIGNORED
.npmrc                pins Electron download mirror
CLAUDE.md             this file
```

## window.api (preload bridge)
The renderer NEVER touches Node/fs directly. Everything goes through:
- `loadContacts()` -> array
- `saveContacts(arr)`
- `getDataLocation()` -> { path, dir, custom } — where contacts are stored
- `setDataLocation()` -> picks a folder (use a cloud-synced one to share across
  computers); adopts an existing file there or migrates the current one. Returns { ok, path, adopted }
- `useDefaultDataLocation()` -> revert to this computer's userData dir
- `exportExcel(sheets, suggestedName)` — sheets = [{name, header:[...], rows:[[...]]}]
- `saveTextFile(text, suggestedName)` — used for CSV export
- `importExcel()` -> { ok, sheets:[{name, rows:[{Header:value}]}] }
- `getVersion()` -> app version string
- `checkForUpdates()` — manual update check (wired to the About-page button).
  Windows: triggers electron-updater. macOS: queries GitHub Releases and offers
  to open the .dmg download (unsigned apps can't auto-apply on Mac).

## Data
- Contacts persist to `<dataDir>/prospecting-data.json`. `dataDir` defaults to
  `userData` (Win: `%APPDATA%\Declan Prospecting App\`; Mac:
  `~/Library/Application Support/Declan Prospecting App/`) but can be redirected to
  a user-chosen cloud-synced folder for cross-computer sharing. The choice is stored
  in `userData/app-config.json` (`{ dataDir }`); `main.js` `dataDir()`/`dataFile()`
  read it. Set/clear it via the `data:setLocation` / `data:useDefault` IPC.
- In the renderer they live in an in-memory cache `CRM_CACHE`; `crmLoad()` returns it,
  `crmSave(arr)` updates it AND calls `window.api.saveContacts`. On launch the init
  loads from `window.api.loadContacts()` into `CRM_CACHE`.

### Contact record shape
```js
{ id, method, outcome, first, last, address, mobile, email,
  callDate /* yyyy-mm-dd */, stepsDone /* int */, branchDate /* optional yyyy-mm-dd */,
  archived /* bool */, notes }
```
- `method`: 'justsold' | 'listed' | 'buyerdb' | 'steallist'
- `outcome`: 'noanswer' | 'interested' | 'notinterested'  (drives the reminder schedule)

## The four prospect methods
Each is a top-level `.panel` with 5 sub-tabs: Openers, Objections, Closes,
Follow-up, Nurture.
| id          | label             | accent var   |
|-------------|-------------------|--------------|
| justsold    | Just sold street  | --blue       |
| listed      | Just listed       | --green      |
| buyerdb     | Buyer database    | --teal       |
| steallist   | Steal listings    | --coral/danger |

- **Follow-up** sub-tab = three branches: **No answer** (voicemail + SMS),
  **Answered – interested** (call + SMS), **Answered – not interested** (call + SMS).
  Every call is paired with an "SMS if no answer".
- **Nurture** sub-tab = three temperature tracks: **HOT / WARM / COLD** (SMS + calls).

## Tab system (JS functions in renderer)
- `showPanel(id, el)` — switches top-level panels (contacts, justsold, listed,
  buyerdb, steallist, about) + nav/mobile highlight.
- `showJsTab/showJlTab/showBdTab/showSlTab` — method sub-tabs (built by `makeTabFn`).
- `showJsfTab(id, el)` — follow-up BRANCH tabs. Generalised: derives the group
  prefix from the id (`jsf`/`jlf`/`bdf`/`slf`) and toggles `.{prefix}-track` /
  `.{prefix}-tab`. ids look like `jlf-noanswer`, `bdf-interested`, etc.
- `showJsnTab(id, el)` — nurture TEMPERATURE tabs. Same generalisation
  (`jsn`/`jln`/`bdn`/`sln`); ids like `jln-hot`, `sln-cold`.
- Branch/temperature track classes follow `{prefix}-track`, tabs `{prefix}-tab`.

## CRM engine (renderer)
- `METHODS` config object: per method `{ label, sheet, chipBg, chipFg, ms }`
  where `ms = { noanswer:[...], interested:[...], notinterested:[...] }` and each
  milestone is `{ d: dayOffsetFromStart, t: 'label' }`.
- `sinceDate(c)` = `branchDate || callDate`. `schedFor(c)` = `METHODS[method].ms[outcome]`.
- `nextMilestone(c)` = next uncompleted milestone + its due date (sinceDate + d days).
- Dashboard "Due now & overdue" shows anything due within 7 days; ✓ Done = `crmMarkDone`
  (stepsDone++), Stop = `crmArchive`.
- `crmSetOutcome(id, value)` resets `stepsDone=0` and sets `branchDate=today` so the
  schedule restarts on the new branch.
- Search box: `crmSearch` filters table across name/mobile/email/address/notes.
- Export: `crmExportXlsx` (one sheet per method), `crmExportCsv`; Import: `crmImport`.
  All go through `window.api`.

## CONVENTIONS — follow these for any change
1. **Versioning**: feature = bump the decimal (…0.9 -> 0.10 -> 0.11…); bug fix =
   add a third number (e.g. 0.20.1). Update it in THREE places when you ship:
   the header `#app-version` span, the About page `#about-version`, and
   `package.json` "version". Add a changelog entry on the About page. Current: **0.23.0**.
2. **Theming**: every colour MUST be a CSS variable defined in BOTH `:root` and
   `[data-theme="dark"]`. Never hardcode hex in markup/JS — new UI must work in
   light AND dark automatically. Dark mode is a header toggle, persisted in
   `localStorage` key `declan-theme`.
3. **No emails in scripts**: all openers/objections/closes/follow-ups/nurture use
   **calls + SMS only**. No email steps anywhere. (The contact record keeps an
   `email` field as stored data, but outreach is never email.)
4. **Opener tone**: genuine, warm, eased-in. NEVER announce "this is a cold call".
   Keep the research/psychology backing (Cialdini, Gong call data, loss aversion, etc.).
5. **Validate before delivering**: JS must parse (e.g. `node --check`, or
   `new Function` on each inline `<script>`), and there must be **no duplicate
   element IDs**. The renderer is one file — large edits are easy to break.
6. **Don't touch the data layer casually**: `crmLoad`/`crmSave` + the `main.js`
   IPC handlers are the only storage touch points. Keep them in sync.

## Roadmap (planned, not built yet)
- **AI assistant** over emails + listing data: add `@anthropic-ai/sdk`, call it
  from `electron/main.js` (main process), key in a local `.env` (gitignored),
  read via `process.env`. Never put the key in the renderer.
- **Email access**: Gmail API / Microsoft Graph (OAuth) or IMAP (`imapflow`) in main.js.
- **SQLite**: swap the JSON store for `better-sqlite3` when data/RAG grows. Only the
  `contacts:load` / `contacts:save` handlers in main.js touch storage, so it's contained.
- **Auto-update**: ENABLED (electron-updater checks on launch). Remaining to make
  it live: fill `publish.owner` in package.json, push to GitHub, and publish a
  release with `npm run release` (needs `GH_TOKEN`). Each shipped version must bump
  the 3 version spots. Code signing (self-signed cert in `signing/`, or a CA cert)
  keeps the publisher consistent so electron-updater's signature check passes.

## Brand
Primary blue `#1a5fb4`, amber accent `#e3ad4f`. Icon: white house + amber chat
bubble on a blue gradient (regenerate via `assets/make_icon.py`).
