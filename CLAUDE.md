# CLAUDE.md — Declan Prospecting App

Context for Claude Code. Read this before making changes.

## What this is
A desktop app for **Declan Addison**, a real estate agent in Melbourne / Victoria,
Australia. Two jobs in one app:
1. **Prospecting scripts** — cold-calling scripts (openers, objections, closes,
   follow-ups, nurture) for four prospecting methods.
2. **Contact tracker (CRM)** — log contacts after calls; the app computes when
   each person is due for their next follow-up/nurture touch, and exports to Excel.

Built with **Electron, all JavaScript**. **Cross-platform: Windows, macOS, and
Linux** (Linux Mint). Declan's own machine is Windows; he also runs Linux Mint.
Dev mode (`npm start`) and the installer builds work on all three; keep any
platform-specific code branched on `process.platform` ('darwin' | 'win32' | 'linux').

## Tech stack
- **Electron** (main + preload + renderer). No framework — the UI is one big
  hand-written `renderer/index.html` (HTML + inline CSS + vanilla JS).
- **exceljs** for native Excel/CSV import/export (pure JS, no native deps).
- **googleapis** for optional Google Sheets sync of contacts (runtime dep; all
  `gsheets:*` handlers degrade gracefully if it's absent). See the Google Sheets
  section below and the `google-sheets-integration` skill.
- **Local JSON database** for contacts (no SQLite yet — see Roadmap); when Google
  Sheets is connected the sheet is the source of truth, mirrored to the local file.
- **Updates** are ENABLED and platform-split (signed Windows + Linux AppImage can
  self-install; unsigned macOS cannot, so it does a manual check):
  - **Windows**: `main.js` runs `autoUpdater.checkForUpdates()` (electron-updater)
    on launch when packaged (silent; no-ops in dev or if no release is reachable).
    A found update downloads in the background and offers a restart-to-install.
  - **Linux**: same `electron-updater` path as Windows. Auto-updates when run as an
    **AppImage**; the `.deb` build can't self-update (the check just no-ops, caught
    by `.catch`), so .deb users reinstall the latest download.
  - **macOS**: `main.js` queries the GitHub Releases API directly (built-in
    `https`, no deps), compares versions, and if newer opens the `.dmg` download
    in the browser via `shell.openExternal` — the user drags the new app into
    Applications. Runs silently on launch (packaged) + via the About-page button.
  Platform branch lives in `app.whenReady()`: `darwin` → manual check; else
  (`win32`/`linux`) → `electron-updater`. Needs GitHub `publish` config (owner/repo
  — already set) + releases published via `npm run release`.

## Run / build
```
npm install         # one time
npm start           # run in dev (Windows + Mac + Linux)
npm run build:win   # -> dist/*.exe  (nsis installer; unsigned, SmartScreen warns first run)
npm run build:mac   # -> dist/*.dmg  (build on a Mac; unsigned, right-click->Open first time)
npm run build:linux # -> dist/*.AppImage + dist/*.deb  (build on Linux)
npm run build       # builds for the current platform
```
Double-click launchers: `Start (Windows).bat` / `Start (Mac).command` /
`Start (Linux).sh` (run `npm start`; the Linux one needs `chmod +x` once).
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

**Same bug, all OSes — one-command fix:** run
`node .claude/skills/electron-install-fix/scripts/fix-electron.js` from the project
root. It auto-detects the platform, finds the cached zip (macOS
`~/Library/Caches/electron/`, Windows `%LOCALAPPDATA%\electron\Cache\`, **Linux
`~/.cache/electron/`**), extracts it, and writes `path.txt` with no trailing newline.
See the `electron-install-fix` skill. (`path.txt` contents per OS: macOS
`Electron.app/Contents/MacOS/Electron`, Windows `electron.exe`, Linux `electron`.)

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
renderer/index.html   THE ENTIRE APP (UI, styles, all logic). ~2600 lines.
assets/               icon.ico (Win), icon.icns (Mac), icon.png/icon_512.png (Linux), make_icon.py
Start (Windows).bat   dev-mode launcher (Windows)
Setup (Windows).bat   one-time Windows installer (downloads Electron via mirror)
Trust Cert (Windows).bat  trusts the self-signed code-signing cert (per-user)
Start (Mac).command   dev-mode launcher (Mac)
Start (Linux).sh      dev-mode launcher (Linux; chmod +x once)
signing/              self-signed code-signing cert (.pfx/.cer); GITIGNORED
.npmrc                pins Electron download mirror
.claude/skills/       project skills: prospecting-app-dev-workflow,
                      electron-install-fix (+ scripts/fix-electron.js),
                      google-sheets-integration
CLAUDE.md             this file
```

## window.api (preload bridge)
The renderer NEVER touches Node/fs directly. Everything goes through:
- `loadContacts()` -> array
- `saveContacts(arr)`
- `loadBuyers()` / `saveBuyers(arr)` — the standalone Buyers database
- `loadProperties()` / `saveProperties(arr)` — the Properties inventory
- `loadInspections()` / `saveInspections(arr)` — the Inspections (open-home attendees)
- `loadActivity()` / `saveActivity(arr)` — the local-only activity log (v2.0; no GS sync)
- `openJsonFile()` -> { ok, data } — file picker for a .json backup (v2.0 restore)
- `fetchListing(url)` -> { ok, meta:{title,image,desc,site,fetchedAt} } | { ok:false, error } —
  fetches a listing page in main (built-in https, browser UA, 4 redirects, 800KB cap) and
  parses OpenGraph meta (v3.0 listing previews)
- `getDataLocation()` -> { path, dir, custom } — where contacts are stored
- `setDataLocation()` -> picks a folder (use a cloud-synced one to share across
  computers); adopts an existing file there or migrates the current one. Returns { ok, path, adopted }
- `useDefaultDataLocation()` -> revert to this computer's userData dir
- `exportExcel(sheets, suggestedName)` — sheets = [{name, header:[...], rows:[[...]]}]
- `saveTextFile(text, suggestedName)` — used for CSV export
- `importExcel()` -> { ok, sheets:[{name, rows:[{Header:value}]}] }
- `getVersion()` -> app version string
- `checkForUpdates()` — manual update check (wired to the About-page button).
  Windows/Linux: triggers electron-updater. macOS: queries GitHub Releases and offers
  to open the .dmg download (unsigned apps can't auto-apply on Mac).
- **Google Sheets sync** (optional; see the `google-sheets-integration` skill):
  - `gsGetStatus()` -> { hasCredentials, authenticated, sheetId, sheetName, sheetUrl }
  - `gsSetCredentials(clientId, clientSecret)` — store the OAuth Desktop creds
  - `gsConnect()` -> runs the browser OAuth flow (localhost:42813 redirect)
  - `gsCreateSheet(contacts)` / `gsLinkSheet(url)` — make or adopt a sheet
  - `gsDisconnect()` / `gsOpenSheet(url)`
  When connected, `loadContacts`/`saveContacts` read/write the sheet (mirrored to
  the local JSON file); a sync failure never loses local data.

## Data
- Persists to `<dataDir>/prospecting-data.json`, an OBJECT `{ contacts, buyers, properties, inspections }`
  (arrays). Older builds stored a bare array of contacts; `readData()` in `main.js`
  auto-migrates `array → {contacts:array, buyers:[], properties:[], inspections:[]}` on read (missing
  keys backfilled). Every save is a read-modify-write via `updateData()` so writing one collection never clobbers the others.
  `dataDir` defaults to `userData` (Win: `%APPDATA%\Declan Prospecting App\`; Mac:
  `~/Library/Application Support/Declan Prospecting App/`; Linux: `~/.config/Declan Prospecting App/`)
  but can be redirected to a user-chosen cloud-synced folder. The choice is stored in
  `userData/app-config.json` (`{ dataDir }`). Set/clear via `data:setLocation` / `data:useDefault`.
- IPC handlers are generated by `makeCollectionHandlers(key, tab, headers)` in `main.js` for
  `contacts`, `buyers`, `properties`, `inspections` (channels `<key>:load` / `<key>:save`), each
  local-first with optional per-tab Google Sheets sync.
- In the renderer each collection has an in-memory cache: contacts in `CRM_CACHE`
  (`crmLoad`/`crmSave`), buyers in `BUYERS_CACHE` (`buyersLoad`/`buyersSaveCache`), properties in
  `PROPS_CACHE` (`propsLoadCache`/`propsSaveCache`). Each save updates the cache AND calls the
  matching `window.api` method. On launch the inits load all three.

### Google Sheets sync (optional cross-device source of truth)
- Config keys in `userData/app-config.json` (never the repo/renderer): `gClientId`,
  `gClientSecret`, `gTokens`, `gSheetId`, `gSheetName`. Read/written via
  `readConfig`/`writeConfig`/`updateConfig` in `main.js`.
- Sheet layout: four tabs — `Contacts` / `Buyers` / `Properties` / `Inspections` — columns =
  `CONTACT_HEADERS` / `BUYER_HEADERS` / `PROPERTY_HEADERS` / `INSPECTION_HEADERS`. Generalized
  `gsLoadTab`/`gsSaveTab` read/write any tab (range `<tab>!A:ZZ`); array fields (`types`,`suburbs`) are
  stored comma-separated; **object-array fields in `GS_JSON_FIELDS` (`enquiries`, `attendees`) are stored
  as JSON in one cell**; `GS_NUM_FIELDS`/`GS_BOOL_FIELDS` coerce types on load. `ensureTabs` adds any
  missing tab (so older sheets gain Buyers/Properties/Inspections on demand).
- When connected, `<key>:load` reads the tab (mirrors to local JSON), `<key>:save` writes local
  JSON first then pushes to the tab — a sync failure returns `{ok:true, synced:false, syncError}`
  and never loses local data. `gsLoadTab` throws on a missing tab so the caller falls back to local.
- Full setup + every Google Cloud error fix: the `google-sheets-integration` skill.

### Contact record shape
```js
{ id, method, outcome, first, last, address, mobile, email,
  callDate /* yyyy-mm-dd */, stepsDone /* int */, branchDate /* optional yyyy-mm-dd */,
  snoozeUntil /* optional yyyy-mm-dd (v2.0) — pushes the due date out; cleared by
                mark-done / outcome change; in CONTACT_HEADERS so it GS-syncs */,
  archived /* bool */, notes }
```
- `method`: 'justsold' | 'listed' | 'buyerdb' | 'steallist'
- `outcome`: 'noanswer' | 'interested' | 'notinterested'  (drives the reminder schedule)

### Buyer record shape (standalone Buyers database — panel `id="buyers"`)
```js
{ id /* 'b…' */, first, last, mobile, email,
  buyerType /* ''|'fhb'|'upgrader'|'downsizer'|'investor' */,
  budgetMin, budgetMax /* numbers */, types /* ['house'|'townhouse'|'unit'|'land', …] */,
  bedsMin, bathsMin, carMin, landMin /* numeric minimums; '' = no preference */,
  suburbs /* [String] preferred areas */,
  enquiries /* [{ id:propertyId, active:bool, notes:String, offerCandidate:bool }] — per
              buyer↔property; offerCandidate (v1.1.0) drives the property panel's offer tier;
              legacy [propertyId] strings auto-migrate via normEnq/normalizeBuyers; GS stores as JSON */,
  archived /* bool */, notes }
```
NB: the new Buyers database (`id="buyers"`) is data-driven and DISTINCT from the cold-calling
scripts method `buyerdb` (`id="buyerdb"`). Don't confuse the two.

### Property record shape (Properties inventory — panel `id="properties"`)
```js
{ id /* 'p…' */, status /* 'onmarket'|'offmarket'|'archived' */, archiveReason /* ''|'sold'|'withdrawn' */,
  address, suburb, postcode, type /* 'house'|'townhouse'|'unit'|'land' */,
  price /* number, used for matching */, priceType /* 'fixed'|'range'|'auction'|'eoi' */, priceMax,
  beds, baths, car, land /* numbers */, salePrice, saleDate /* for sold */,
  listingUrl, listedDate,
  listingMeta /* '' or {title,image,desc,site,fetchedAt} (v3.0) — OpenGraph preview fetched
                 from listingUrl via the listing:fetch IPC (propFetchPreview; auto on save,
                 cleared when the link changes). In PROPERTY_HEADERS + GS_JSON_OBJ_FIELDS
                 (object-as-JSON cell). NOT exported to Excel. Some sites (REA) may block
                 the fetch — UI degrades to the plain link + ↻ Preview button */,
  notes }
```

### Buyer↔property matching (renderer, pure functions)
- `fitScore(buyer, property)` -> `{ score 0-100, why:[], gaps:[] }`. Weighted (price 35, type 20,
  suburb 20, beds 10, baths 6, car 5, land 4); a blank buyer preference is neutral (excluded from the
  denominator) so blanks never penalize; NO hard exclusions — everything is ranked. `fitLabel`/`fitBadge`
  tier it (Great/Good/Fair/Low → green/blue/amber/grey).
- `buyerMatch(id)` ranks `activeProps()` (on+off market; archived excluded) for a buyer;
  `propMatch(id)` ranks active buyers for a property. Both render into the reusable `#modal-overlay`
  (`openModal`/`closeModal`). Enquiries edit from both sides; source of truth = `buyer.enquiries`.

### Inspection record shape (Inspections — panel `id="inspections"`)
```js
{ id /* 'i…' */, propertyId, date /* yyyy-mm-dd */, startTime /* HH:MM */, notes,
  attendees /* [{ buyerId, notes, followUp /*bool*/, ts /*ISO*/ }] */,
  createdAt /* ISO */, archived }
```
- Source of truth for attendance + per-inspection notes = `inspection.attendees`. A buyer's inspection
  history is COMPUTED by scanning inspections: `inspForBuyer(bid)` / `inspForProp(pid)`. Attendees normalise
  via `normalizeInspections`; GS stores `attendees` as JSON (`GS_JSON_FIELDS`).
- **Dedup add‑attendee:** the attendee typeahead (`taSearch`) searches `BUYERS_CACHE`; `taPick` LINKS an
  existing buyer, `taCreateNew` creates one (warns on same mobile/name). One buyer record everywhere.
- **Merge (`mergeBuyers(primaryId, dupId)`):** fills primary blanks from the dup, unions `enquiries`/`types`/
  `suburbs`, joins notes, RE‑POINTS every inspection attendee `buyerId` dup→primary (de‑duping within an
  inspection), then removes the dup. Reached via the "Merge duplicate buyers" button.
- **Email report:** `buildInspectionReport(insp)` → `Property: … / Inspection: … / <Name> + '* ' bullet notes`.
  `inspCopyReport` (one) / `inspReportAll` (combined over the active filter) open `#modal-overlay` with a
  copyable textarea (`crmCopySms`-style clipboard) + Save‑as‑.txt. Filter by property/buyer/date range.

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

## Navigation (v0.26 redesign)
- A horizontal **`.topbar`** (brand + tabs + ? + theme toggle) replaced the old left
  sidebar + mobile tab bar. Tabs: **Tracker** (panel id stays `contacts`), **Prospecting ▾**,
  **Buyers**, **Properties**, **Inspections** (`id="inspections"`); the Prospecting dropdown is JS-driven
  (`prospOpen`/`prospCloseSoon` on `.nav-wrap` hover + `prospectingClick` toggle). Older line follows:
  **Buyers**, **Properties**. The dead sidebar/`.tab-bar-mobile`/`.layout` CSS is left in place.
- **Prospecting** is a `.nav-wrap` containing the `#nav-prospecting` button + a hover/click
  `#prospecting-dd` dropdown of the 4 methods. `prospectingClick()` toggles it (touch);
  `pickMethod(m)` opens a method panel. `showPanel` marks `#nav-prospecting` active for any
  `METHOD_PANELS` id, else matches the `.nav-item` whose onclick names the id; it closes the
  dropdown + scrolls to top. An outside-click handler closes the dropdown.

## Tab system (JS functions in renderer)
- `showPanel(id, el)` — switches top-level panels (contacts, justsold, listed,
  buyerdb, steallist, buyers, properties, about) + top-tab highlight.
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
- Dashboard "Due now & overdue" (the Tracker hero, with a `#due-stats` strip) shows anything
  due within 7 days as rich cards; ✓ Mark done = `crmMarkDone` (stepsDone++), Stop = `crmArchive`.
- **Smart Due cards (v0.26)**: each card shows the actual script for that step, pulled LIVE from
  the existing Follow-up/Nurture pages — `scriptForDue(c, nm)` finds the branch track
  `#<prefix>f-<outcome>` (prefix via `METHOD_PREFIX`) and reads its Nth `.seq-item` (`h4` +
  `.script-block` call + `.sms-bubble` SMS). "Nurture touch" steps resolve a temperature by outcome
  (interested→hot, notinterested→cold, noanswer→warm) and read the Nth `.sms-bubble` of
  `#<prefix>n-<temp>`. `crmCopySms` copies the SMS (navigator.clipboard + textarea fallback). Single
  source = the script DOM, so no drift.
- `crmSetOutcome(id, value)` resets `stepsDone=0` and sets `branchDate=today` so the
  schedule restarts on the new branch.
- `crmEdit(id)` (v1.4.0) loads a row into the log form (hidden `crm-edit-id`, button flips to
  "✓ Update contact"); `crmAdd` updates in place when `crm-edit-id` is set. Editing keeps
  `stepsDone`/`branchDate`/`archived` UNLESS the outcome changed — then it applies the
  `crmSetOutcome` reset semantics. Method/callDate edits keep progress (schedule recomputes).
- **v2.0 agent features** (all in the renderer unless noted):
  - **Call session**: `startCallSession()`/`csRender()` walk `csQueue()` (the due-within-7-days
    list) one contact at a time in `#modal-overlay`, reusing `scriptForDue`; buttons call the
    normal `crmMarkDone`/`crmSetOutcome`/`crmSnooze`; ends with a summary.
  - **Snooze**: `crmSnooze(id, days)` sets `snoozeUntil`; `nextMilestone` returns
    `due=max(computed, snoozeUntil)` + `snoozed:true`; cleared by done/outcome change.
  - **Call/Text links**: `commLinkBtns(c, sc)` → `tel:`/`sms:` (SMS body pre-filled from the
    step's script; `&body=` on Mac, `?body=` elsewhere) via `openComm` → `gsOpenSheet`
    (shell.openExternal). Each click logs activity.
  - **Activity log**: `ACT_CACHE` + `actLog(type)` ({ts, type:'call'|'sms'}, capped 4000),
    persisted via `activity:load/save` IPC — LOCAL ONLY, never synced to Google Sheets.
    Powers `crmRenderWeek()` ("This week" strip: calls, texts, new contacts, interested,
    trend vs last week; weeks start Monday).
  - **Quick search**: `openQuickSearch()` (🔍 button or Ctrl/Cmd+K) searches contacts/buyers/
    properties; `qsGo` jumps to the panel and pre-fills its search box. Escape closes any modal.
  - **Backup/restore**: `dataBackup()` saves one JSON of all collections; `dataRestore()` uses
    the `data:openJson` IPC (file picker) and replaces all collections through the normal
    save paths after a confirm. Settings → Data section.
  - **Duplicate guard**: `crmAdd` (create path) confirms before adding a second contact with
    the same `normMobile` mobile.
- Search box: `crmSearch` filters table across name/mobile/email/address/notes.
- Export: `crmExportXlsx` (one sheet per method), `crmExportCsv`; Import: `crmImport`.
  All go through `window.api`.

## CONVENTIONS — follow these for any change
1. **Versioning** (semver from v1.0.0 on): `MAJOR.MINOR.PATCH` — **MAJOR** = big overhauls /
   breaking changes, **MINOR** = small new features, **PATCH** = fixes/tweaks. (Pre‑1.0 used a
   looser decimal scheme; the 0.x changelog rows are historical.) Update the version in THREE
   places when you ship: the header `#app-version` span, the About page `#about-version`, and
   `package.json` "version". Add a changelog entry on the About page. Current: **3.0.0**.
   NB dates: STORED as ISO `yyyy-mm-dd` (schedule math, sorting, date inputs, GS sync) but
   always DISPLAYED dd/mm/yyyy via `fmtDate`/`fmtDMY` (v1.3.1). `parseDate` + the Excel
   import accept both; never show a raw ISO string in the UI or an export.
2. **Theming**: every colour MUST be a CSS variable. Since v1.2.0 there are selectable
   theme palettes (Settings ⚙️ → Appearance) — five as of v1.3.0: `claude` (default),
   `aston` (Racing Green), `noir` (pure greyscale), `mono` (Espresso), `classic`
   (Classic Blue). The active palette is a `data-palette`
   attribute on `<html>` (absent/`claude` = default), persisted in `localStorage` key
   `declan-palette`; dark mode remains a separate `data-theme="dark"` attribute (header
   toggle, `localStorage` key `declan-theme`) and works WITH every palette. Each palette
   defines the FULL variable set in two blocks: `[data-palette="X"]` (light) and
   `[data-palette="X"][data-theme="dark"]` (dark); the Claude blocks are
   `:root, [data-palette="claude"]` + the dark pair. Never hardcode hex in markup/JS — new
   UI must work in light AND dark across ALL palettes automatically. If you add a NEW CSS
   variable, define it in ALL palette blocks (10 total: 5 palettes × light/dark). New themes:
   add a palette block pair + a row in the `PALETTES` array (theme picker cards render from
   it; swatch chips scope previews via `data-palette`/`data-theme` attributes on the chip).
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

## Look & motion (v3.0 overhaul)
Sharp, modern, boxy: **border-radius is 0 everywhere** (only the 8px wayfinding dots stay
`50%` circles) — keep new UI square. A motion layer at the END of the `<style>` block adds:
panel/card entrance animations, hover lift + accent-glow on `.stat/.due/.theme-card`,
button press states, themed scrollbars, a sharp 1px accent focus ring, a **frosted-glass
topbar** (`color-mix` + backdrop-filter), and `#bg-fx` — a fixed dot-grid background with an
accent spotlight that follows the mouse (`--mx`/`--my` CSS vars set by an rAF-throttled
mousemove listener; `main` is `z-index:1` above it). All effect colours derive from theme
vars via `color-mix(in srgb, var(--x) N%, transparent)` so every palette × light/dark works —
keep using `color-mix`+vars (never hex) for new glows/translucency. `animateStats(hostId)`
counts `.stat-n` numbers up when values change.

## Brand / look (v0.26 redesign)
**Monochrome** UI: warm dark-greys (not black) in dark mode, whites/light-greys in light,
near-black/near-white text. **Primary chrome** = `--primary` (monochrome ink). The single warm
accent is a **stylish brown** (`--accent`/`--accent-bg`/`--accent-strong`), used minimally
(SMS-bubble edges, focus ring, the brand mark, small dots). Per-section colours
(`--blue/green/teal/pink/purple/danger`, muted) are kept ONLY for wayfinding (method chips,
section dots, overdue red). The palette migration kept every legacy token name resolving (e.g.
`--amber`/`--sms-bubble` repointed to the brown accent), so component CSS was re-skinned via the
`:root`/`[data-theme="dark"]` blocks alone. Icon (`assets/make_icon.py`) is unchanged for now.
