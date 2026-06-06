# HANDOFF / WORKSPACE BRIEF — Declan Prospecting App

This file is the single place that captures **what this project is, every goal and
decision we've made, the current status, and exactly how to continue on a Mac.**
Read this + `CLAUDE.md` first. (`CLAUDE.md` = technical source of truth; this file =
goals, history, and the Mac to-do.)

---

## 0) How to get this workspace onto your Mac

Everything (except secrets) is on GitHub. On the Mac:

```bash
# 1. Install Node.js LTS (v22) from https://nodejs.org  (v24 can cause setup quirks)
# 2. Clone the project:
git clone https://github.com/Addi-exec/declan-prospecting-app.git
cd declan-prospecting-app
# 3. Install + run:
npm install
npm start
```

Then open this folder in Claude Code on the Mac and paste the prompt in section 7.

> NOTE: the Windows code-signing certificate (`signing/`) is intentionally NOT in
> the repo (private key). Mac uses Apple signing instead — see section 5.

---

## 1) What the app is (goals)

A cross-platform desktop app (Electron, all vanilla JS) for **Declan Addison**, a
Melbourne real-estate agent. Two jobs in one:
1. **Prospecting scripts** — cold-call scripts (openers/objections/closes/follow-up/
   nurture) for 4 methods: Just sold, Just listed, Buyer database, Steal listings.
   Calls + SMS only, never email. Warm openers (never announce "cold call").
2. **Contact tracker (CRM)** — log a contact after a call; the app schedules the
   next follow-up/nurture touch and shows what's due. Excel/CSV export + import.

The whole UI is one file: `renderer/index.html` (HTML + inline CSS + vanilla JS).
Main process: `electron/main.js`. Secure bridge: `electron/preload.js`.

---

## 2) Everything we've built (status: DONE)

- **Cross-platform**: runs on Windows + macOS. Build targets for both
  (`npm run build:win` → NSIS .exe, `npm run build:mac` → .dmg).
- **Shared data folder (cross-device sync)**: contacts can be stored in a
  cloud-synced folder (Dropbox / iCloud / OneDrive / Google Drive) so the SAME
  database is used on Mac + PC. In the app: Contacts tab → "Storage" box →
  "☁ Use a shared folder…", pick the same synced folder on each computer.
  (Tech: `userData/app-config.json` holds `{dataDir}`; `data:setLocation` /
  `data:useDefault` IPC; it adopts an existing file in the folder or migrates.)
- **Windows code signing**: self-signed cert (in `signing/`, gitignored) wired via
  `CSC_LINK` / `CSC_KEY_PASSWORD`. Installer is signed + trusted on Declan's PC.
- **Auto-update via GitHub**: enabled (`electron-updater` checks on launch).
  Public repo, signed **v0.22.0** baseline release published.
- **Data privacy**: contacts NEVER go to GitHub. They live outside the repo, and
  `.gitignore` hard-blocks `prospecting-data.json`, `app-config.json`, and any
  `*.csv` / `*.xlsx` even if they land in the folder. Verified.

Current version: **0.22.0**. Repo: https://github.com/Addi-exec/declan-prospecting-app

---

## 3) Key decisions we made

- **GitHub repo is PUBLIC** — chosen because public = simplest, token-free
  auto-update on both Mac and PC. Safe because no contacts data is ever in the repo
  (only app code/config/docs).
- **No emails in scripts** — outreach is calls + SMS only (an `email` field exists
  on contacts as stored data, but it's never used for outreach).
- **Versioning convention**: feature = bump the decimal (0.21 → 0.22); bug fix =
  add a third number (0.22.1). On every release, update the version in THREE places
  (header `#app-version` span, About page `#about-version`, `package.json`) AND add
  a changelog entry on the About page.
- **Theming**: every colour is a CSS var defined in BOTH `:root` and
  `[data-theme="dark"]`. No hardcoded hex. Must work in light + dark.
- **Data layer is sacred**: only `crmLoad`/`crmSave` (renderer) + the
  `contacts:load`/`contacts:save` IPC (main) touch storage.

---

## 4) ⚠️ Mac — what's left / why you may see errors

The Windows side is fully done. On Mac, expect these (all normal, all fixable):

### a) "App is damaged / from an unidentified developer" (running a built .dmg)
The app is UNSIGNED on Mac (no Apple cert yet), so Gatekeeper blocks it.
Fixes:
- Right-click the app → **Open** → **Open** (one time), OR
- `xattr -cr "/Applications/Declan Prospecting App.app"` in Terminal to clear the
  quarantine flag.

### b) `npm start` errors / "Electron failed to install correctly"
Same family as the Windows binary issue. Fixes in order:
1. Use Node **LTS v22**, not v24.
2. `rm -rf node_modules && npm install`
3. If still failing: `node node_modules/electron/install.js`

### c) Build needs Xcode tools
`npm run build:mac` may need: `xcode-select --install` (one time).

### d) Auto-update does NOT work on Mac unless the app is Apple-signed
macOS only applies auto-updates to **signed + notarized** apps. So on Mac:
- Without an Apple Developer account ($99/yr): the app runs fine (via the
  right-click-Open trick) but updates are **manual** (re-download the .dmg).
- With an Apple Developer ID: it auto-updates like Windows. See section 5.

### e) Mac auto-update also needs a Mac build published
The current GitHub release only has Windows assets. For Mac auto-update you must
publish a Mac build too (uploads `latest-mac.yml`): see section 6.

> **TODO for next session on the Mac:** tell Claude the EXACT error text you saw
> (copy/paste it). The fixes above cover the common ones, but the precise message
> determines which applies.

---

## 5) Building the Mac .dmg (must be done ON a Mac)

```bash
npm install
npm run build:mac          # → dist/*.dmg  (unsigned)
```

To sign + notarize (removes the Gatekeeper warning everywhere; needs an Apple
Developer account + a "Developer ID Application" cert in Keychain), add to
`package.json` → `build.mac`:
```json
"hardenedRuntime": true,
"gatekeeperAssess": false,
"notarize": { "teamId": "YOUR_APPLE_TEAM_ID" }
```
then:
```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # appleid.apple.com
export APPLE_TEAM_ID="YOUR_APPLE_TEAM_ID"
npm run build:mac
```
(Leave the `notarize` block OUT for an unsigned build — adding it without an Apple
account makes the build fail.)

---

## 6) Publishing updates (so installed apps auto-update)

Repo publish target is already set in `package.json` (`Addi-exec/declan-prospecting-app`).

To ship a new version:
1. Bump the version in the 3 places + add a changelog entry (section 3).
2. Get a token: `export GH_TOKEN=$(gh auth token)` (after `gh auth login`).
3. Publish:
   - **Windows** (on the PC, signed): set `CSC_LINK`/`CSC_KEY_PASSWORD`, then
     `npm run release`.
   - **Mac** (on the Mac): `npm run release` → uploads the `.dmg` + `latest-mac.yml`
     to the same GitHub release. (Apple-sign first for it to actually apply.)

---

## 7) Copy-paste prompt for Claude Code on the Mac

> I'm continuing the Declan Prospecting App on my Mac. Read `HANDOFF.md` and
> `CLAUDE.md` in this repo first — they have all the context, goals, decisions and
> conventions. The Windows side is done and published (auto-update baseline v0.22.0
> at github.com/Addi-exec/declan-prospecting-app). On Mac I'm getting these errors:
> [PASTE THE EXACT ERROR TEXT HERE]. Please get the app running on my Mac, then help
> me build (and if I have an Apple Developer account, sign + notarize) the .dmg and
> publish a Mac build so Mac auto-update works too. Follow the project conventions
> (versioning in 3 places + changelog, theming via CSS vars, calls/SMS only).

---

## 8) Quick reference

| Thing | Value |
|------|-------|
| Repo | https://github.com/Addi-exec/declan-prospecting-app (public) |
| Current version | 0.22.0 |
| Default data path (Mac) | `~/Library/Application Support/Declan Prospecting App/prospecting-data.json` |
| Default data path (Win) | `%APPDATA%\Declan Prospecting App\prospecting-data.json` |
| Share data | App → Contacts → Storage → "Use a shared folder…" (same cloud folder on each machine) |
| Run dev | `npm start` |
| Build Mac | `npm run build:mac` |
| Build Win | `npm run build:win` |
| Publish release | `npm run release` (needs `GH_TOKEN`) |
