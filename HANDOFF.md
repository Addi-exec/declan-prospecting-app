# HANDOFF / WORKSPACE BRIEF — Declan Prospecting App

Single source for **what this project is, the decisions made, current status, and how to
continue in a new session.** Read this + `CLAUDE.md` first. `CLAUDE.md` = the technical
source of truth (architecture, data shapes, conventions) and is kept current — when this
file and CLAUDE.md overlap, trust CLAUDE.md for code detail.

---

## ⏭ NEXT SESSION — v6.0.0 LAYOUT redesign (approved direction, not yet started)

The v5.0.0 redesign changed the SKIN (Claude-app minimal: greys/whites + state colours, Times New
Roman, SVG sprite icons, a11y pass — see `design-system/declan-prospecting-app/MASTER.md`). The
owner wants the next step to change the LAYOUT/STRUCTURE. All features and the data layer stay
exactly as they are — this is rearrangement, not a rewrite.

### Target layout ("workbench")
1. **Left sidebar navigation** replaces the topbar: icon+label items (use the existing `#i-*`
   sprite), collapsible to icons-only; Prospecting's 4 methods become an expandable nav GROUP
   (kills the hover dropdown); bottom of sidebar = Settings · About · light/dark · Calm mode ·
   version chip. Quick search stays Ctrl/Cmd+K + a sidebar button. Frees horizontal width for
   tables on Declan's wide screen; collapses gracefully <900px.
2. **Add/edit forms become a right-side DRAWER** (slide-over, reuse .modal focus-trap pattern),
   opened from ONE "+ New …" primary button per screen — forms no longer permanently sit between
   the page title and the list (today they push every list ~2 screens down). CRITICAL: MOVE the
   existing form DOM nodes into the drawer shell at open (appendChild — ids stay unique, all
   existing JS keeps working); never duplicate the markup.
3. **Tracker becomes a dashboard**: wide windows get a 2-column grid — LEFT: "Due now & overdue"
   queue + call session; RIGHT rail (sticky): 4 due stats, "This week", sync pill, "+ Log contact"
   (opens the drawer). "All contacts" table below full-width. Narrow = stacked (current order).
4. **Buyers / Properties / Inspections go master-detail**: list (left, compact rows) + DETAIL pane
   (right) showing the selected record's info + its expandable sub-panels (enquiries / offer tiers /
   attendees) instead of inline row-expansion; row "Match" stays a modal. Falls back to the current
   stacked behaviour <1100px. Selection = .active row (blue tint + weight, noir-safe).
5. **Drops**: wide = map LEFT (sticky) + due-checklist RIGHT side-by-side; log-drop via the drawer;
   all-drops table below.
6. **Script pages (4 methods)**: keep content untouched; make the method sub-tab row STICKY under
   the top of the sheet while scrolling scripts.

### Phasing (one commit per phase; app must boot cleanly after each)
- **A — Shell**: sidebar + main grid, retire topbar (keep `showPanel` API + panel ids +
  `METHOD_PANELS` untouched; nav re-renders active state from the same calls). Move topbar-only
  CSS to a historical layer. ~Also: `prospSetLabel` becomes the sidebar group header state.
- **B — Drawer**: one shared drawer component (open/close/focus-trap/Escape, 320-420px, solid
  surface) + convert the 5 add/edit forms (crm/buyer/prop/insp/drop) + edit-banner inside it.
- **C — Tracker dashboard** grid + right rail.
- **D — Master-detail** for Buyers/Properties/Inspections (renderers split list/detail; the
  detail pane re-renders on selection id — derive from existing row-expand functions).
- **E — Drops split + sticky script tabs + responsive passes + pre-delivery checklist
  (MASTER.md gates) in all 5 palettes × light/dark → version 6.0.0 ×3 spots + changelog + docs.**

### Hard rules for the session
Read `CLAUDE.md` + `design-system/declan-prospecting-app/MASTER.md` first. Keep ALL features;
storage only via window.api; every colour a var (5 palettes × light/dark); SVG sprite icons only;
dd/mm dates; validate (node --check + parse/dup-id/stray-hex script in CLAUDE.md) + live-check
light/dark before each commit; version bump ×3 + changelog only in the final phase-E commit.
Biggest risks: duplicate ids if form markup is copied instead of MOVED; breaking `showPanel`
callers (grep all `showPanel(` sites); the single-file renderer — small validated commits.

### Paste this to start the session
> Read HANDOFF.md ("NEXT SESSION — v6 layout redesign") and CLAUDE.md, then implement the v6
> workbench layout phase by phase (A→E) exactly as planned, committing after each phase.

---

## 0) CURRENT STATUS (June 2026)

- **Version: currently 5.0.0.** Semver throughout (see §5). `CLAUDE.md` is the live technical
  source of truth and tracks the current version + full feature set — trust it over this file
  for code detail.
- **Repo:** https://github.com/Addi-exec/declan-prospecting-app (public). This project folder is
  a normal git clone of it, on branch `main`, **in sync** with origin. The folder is
  location-independent — it works wherever you keep it (see "Moving the folder" below).
- **GitHub auth:** `gh auth login` is done on the working machine, so **`git push` works from the
  command line / from Claude** (no GitHub Desktop step needed). macOS credential helper = osxkeychain.
- **GitHub Release `v1.0.0`** is published (milestone notes) but has **no installer binaries
  attached yet**, and no release exists for later versions — auto-update has nothing to fetch
  until installers are published (see §4).
- **Everything is built, validated (parse / no dup IDs / no stray hex / clean Electron boot /
  live-browser checks in light+dark), committed, and pushed.** Next up: the v6 LAYOUT redesign —
  full plan in the section above.

### Moving the folder (or to a new machine)
- **Same machine, new location:** just move it. Git (remote URL is absolute), `.claude/` config,
  and `node_modules` all travel with the folder and keep working — nothing references the old path.
- **Your DATA is NOT in this folder.** Contacts/buyers/properties/inspections/drops live in the OS
  app-data dir (`~/Library/Application Support/Declan Prospecting App/` on Mac;
  `%APPDATA%\Declan Prospecting App\` on Windows; `~/.config/Declan Prospecting App/` on Linux),
  or in a cloud folder if you pointed it there (Settings → data location). Moving the project
  folder does **not** touch your data. The Google Sheet (if connected) is the cross-device source
  of truth regardless.
- **New machine:** install Node **LTS v22**, `npm install`, then `npm start`. If you hit "Electron
  failed to install", run `node .claude/skills/electron-install-fix/scripts/fix-electron.js`. Run
  `gh auth login` (or set up git creds) to push. Re-connect Google Sheets from Settings if used.

---

## 1) WHAT THE APP IS

Cross-platform **Electron desktop app (all vanilla JS)** for **Declan Addison**, a Melbourne
real-estate agent. Runs on **Windows, macOS, and Linux (Linux Mint)**. The whole UI is one file:
`renderer/index.html` (HTML + inline CSS + vanilla JS, ~3800 lines). Main process: `electron/main.js`.
Secure bridge: `electron/preload.js`. Local JSON database, optional Google Sheets sync.

Two jobs, now grown into a full CRM:
1. **Prospecting scripts** — cold-call scripts (openers/objections/closes/follow-up/nurture) for 4
   methods (Just sold / Just listed / Buyer database / Steal listings). Calls + SMS only, warm openers.
2. **CRM** — Tracker, Buyers, Properties, Inspections, Drops (see §2).

---

## 2) EVERYTHING BUILT (status: DONE & shipped)

**Platforms & infra**
- Windows + macOS + **Linux** (AppImage + .deb, `npm run build:linux`, `Start (Linux).sh`).
- Auto-update split by OS: Windows + Linux-AppImage via electron-updater; macOS manual (opens .dmg).
- Shared-folder data sync (cloud folder) AND **Google Sheets sync** (4 tabs: Contacts/Buyers/
  Properties/Inspections; OAuth Desktop flow; secrets only in `userData/app-config.json`).
- **v1.0.1:** the Google Sheets card shows the connected **Client ID + secret** (secret behind a
  Show toggle) with Copy buttons.

**Tracker (smart Due list)** — log a contact; the Due cards show **exactly what to send/say** for
each person's current step, pulled LIVE from the Follow-up/Nurture script pages (`scriptForDue`),
with one-tap **Copy SMS**. Stats strip (overdue/today/week/active). Excel/CSV export + import.

**Buyers database** — budget range, types wanted, bed/bath/car/land minimums, preferred suburbs,
buyer type, notes; **enquiries** per buyer↔property (object `{id,active,notes}`) editable inline
on the property; **buyer↔property matching** (`fitScore`, ranked, no hard exclusions).

**Properties inventory** — On Market / Off Market / Archived; address/suburb/type/price/specs/
listing link/sale price+date; expandable **Enquiries panel** (per-buyer notes + Active toggle +
add/remove).

**Inspections (open homes)** — create an inspection (property + date/time); add **attendees** via a
typeahead that **searches existing buyers to link, or creates a new buyer (with duplicate warning)** —
one buyer record everywhere; per-attendee **notes + follow-up flag**; **email-ready report** (per
inspection or combined over the filter, copy/save); **merge duplicate buyers** tool (re-points their
enquiries + inspection attendances); filter by property/buyer/date; inspection history shows on each
buyer and property row.

**Properties offer pipeline (v1.1)** — each property's expandable Buyers panel tiers enquirers into
**Offer candidates / Inspected (auto from Inspections) / Enquired only**, each with a fit-score badge;
the row shows an "N offering" count.

**Drops (v3.2) — letterbox-drop tracker** — log each targeted **address** you've dropped + the type
(**Pocket appraisal** / **New listing** / **Stale listing**); the app reminds you when each is due for
another drop, with the right play per type. Cadence is a fixed per-type rule (pocket 30 days / new 14 /
stale 14); "Dropped again" resets the timer + counts hits. Own nav tab + `Drops` Google-Sheet tab.

**Agent power tools (v2.0)** — **Call session** dialer (walks the due list one contact at a time with
the live script + one-tap done/outcome/snooze); **click-to-call / click-to-text** (`tel:`/`sms:` with
the SMS pre-filled); **Snooze**; **"This week" stats** (calls/texts/new/interested, local-only activity
log); **Quick search** (🔍 or Ctrl/Cmd+K across contacts/buyers/properties); **Backup & restore**
(Settings → Data, one JSON of everything); duplicate-mobile warning on log. **Contact editing (v1.4)** —
edit any tracked contact in place (incl. moving it to another method).

**Themes + look (v1.2 → v3.1)** — **Settings ⚙️ → Appearance** theme picker with **5 palettes**
(Claude / Racing Green / Noir / Espresso / Classic Blue), each light+dark; `data-palette` on `<html>`
composes with the `data-theme="dark"` toggle. **v3.0 sharp modern UI**: boxy 0-radius everywhere, motion
layer (panel/card animations, hover lift + accent glow, count-up stats), frosted-glass topbar, a
mouse-following accent spotlight on a dot-grid background. **v3.1 readability**: every panel is a solid
sheet (text never on the dotted backdrop), bigger type scale. All effect colours via `color-mix`+theme
vars so every palette × light/dark works.

**Listing previews (v3.0)** — paste an REA/Domain link on a property → `listing:fetch` IPC pulls the
OpenGraph **photo/title/description**; thumbnail in the list opens a full preview card. Some sites (REA)
gate bots → degrades to the plain link.

**Dates (v3.1.1)** — stored ISO `yyyy-mm-dd`, always **displayed dd/mm/yyyy** (`fmtDate`/`fmtDMY`);
import accepts both. **Import safety (v1.3.2)** — re-importing a full Excel export no longer turns
Buyers/Properties rows into junk contacts (non-contact sheets skipped; zero-contact files leave the
tracker untouched).

**Version history (high level):** 0.24–0.28 Linux/Sheets/Buyers/Properties/Inspections · **1.0.0 Claude
colours + first release** · 1.0.1 Sheets creds · 1.1 property offer pipeline · 1.2 theme picker (+Racing
Green) · 1.3 Noir theme + topbar fix · 1.3.1 dd/mm/yyyy dates · 1.3.2 import fix · 1.4 contact editing ·
2.0 call session/snooze/links/week-stats/quick-search/backup · 3.0 sharp UI + listing previews · 3.1
readability · 3.2 Drops · 3.2.1 drop cadences + address · 3.2.2 simplified drop form · 3.3 living UI
(aurora background, tactile tilt/glow cards, click ripple, toast) · 3.4 inspections auto-archive after
reporting (+ Active/Archived/All filter) · 3.5 Drops duplicate-proof (address+type identity, live hint,
retro-merge) + interactive Leaflet/OSM map (vendored, geocoded pins) · **3.6.0 (current)** review-pass
polish: drops in backup/restore + Excel, map keeps your view, Victoria-St geocoding, failed lookups
retry, tilt fixed on due cards, batched geocode saves · **4.0.0 (current)** Liquid Glass redesign —
research-backed (multi-agent usability/HIG research + app audit): glass chrome (frosted topbar/menus/
modal/toast), rounded capsule design system via tokens, one selection language for all tabs/filters,
setup cards moved to Settings → Data & sync, edit-mode banners, progressive-disclosure property form,
search ✕ everywhere, labelled call-session buttons, Calm mode, reduced-transparency fallbacks ·
4.2 buyer-details modal from inspections · **5.0.0 (current)** ui-ux-pro-max redesign: Claude-app
minimal (neutral greys/whites + state hues), Times New Roman, full SVG icon sprite (no emoji in
controls), a11y pass (keyboard menus/typeahead/modal trap, 4.5:1 text3 in all palettes, hit
targets, en-AU date inputs). Design system: design-system/declan-prospecting-app/.

---

## 3) ARCHITECTURE POINTERS (detail in CLAUDE.md)

- **Data file** `<dataDir>/prospecting-data.json` = `{ contacts, buyers, properties, inspections, drops }`
  (+ a local-only `activity` array; auto-migrates older shapes). `readData`/`updateData` in `main.js`;
  IPC generated by `makeCollectionHandlers(key, tab, headers)` for all five collections.
- **Renderer caches:** `CRM_CACHE` (contacts), `BUYERS_CACHE`, `PROPS_CACHE`, `INSPECTIONS_CACHE`,
  `DROPS_CACHE`, plus `ACT_CACHE` (activity log, local-only); each has load/save; loaded on `DOMContentLoaded`.
- **Object-array fields** stored as JSON in Google Sheets (`GS_JSON_FIELDS`): buyer `enquiries`,
  inspection `attendees`; single-object fields (`GS_JSON_OBJ_FIELDS`): property `listingMeta`. Arrays
  like `types`/`suburbs` are comma-separated cells. GS tabs: Contacts/Buyers/Properties/Inspections/Drops.
- **The 3 project skills** live in `.claude/skills/`: `prospecting-app-dev-workflow`,
  `electron-install-fix` (+ `scripts/fix-electron.js`), `google-sheets-integration`.
- **Preview/test helpers** `.claude/launch.json` + `.claude/serve-renderer.js` (a tiny static server
  for live-browser checks). `.claude/*` is gitignored except `.claude/skills/`.

---

## 4) GIT & RELEASE WORKFLOW

- **Commit/push:** normal git; `git push origin main` works (gh auth). Bump version in 3 places
  (package.json, `#app-version`, `#about-version`) + a changelog row on the About page every ship.
- **GitHub release:** `gh release create vX.Y.Z --target main --title … --notes …`.
- **Publish installers + enable in-app auto-update (the remaining manual step):** run
  `npm run release` **on each OS** (Mac/Win/Linux) so the built `.dmg`/`.exe`/`.AppImage`/`.deb` and
  the update manifests (`latest-mac.yml`, etc.) attach to the GitHub release. Windows wants
  `CSC_LINK`/`CSC_KEY_PASSWORD` for signing; all need `GH_TOKEN` (or gh). Until this is done, the
  v1.0.0 release has source only and auto-update has nothing to fetch.

---

## 5) VERSIONING (semver, from v1.0.0)

`MAJOR.MINOR.PATCH` — **MAJOR** = big overhauls / breaking changes · **MINOR** = small new features ·
**PATCH** = fixes/tweaks. Update all 3 version spots + add a changelog entry each ship.

---

## 6) DEV / VALIDATE / RUN

```
npm install          # one time (Node LTS v22 recommended — see gotcha below)
npm start            # run in dev (Win/Mac/Linux)
npm run build:win|build:mac|build:linux   # installers
```
**Validate before shipping** (renderer is one file, easy to break silently):
```
node --check electron/main.js electron/preload.js
# each inline <script> parses, no duplicate element IDs, no stray hex outside :root/[data-theme]:
node -e 'const fs=require("fs"),h=fs.readFileSync("renderer/index.html","utf8");let m,i=0,b=0,re=/<script>([\s\S]*?)<\/script>/g;while((m=re.exec(h))){i++;try{new Function(m[1])}catch(e){b++;console.log(i,e.message)}}const id={},r=/\sid="([^"]+)"/g;while((m=r.exec(h)))id[m[1]]=(id[m[1]]||0)+1;console.log("scripts",i,"errs",b,"dups",Object.entries(id).filter(x=>x[1]>1))'
```
**Live-browser check:** `.claude/serve-renderer.js` serves `renderer/` on :8765 (window.api is absent
over http, so data calls no-op — fine for checking layout/JS/tabs in light + dark).

---

## 7) KNOWN GOTCHAS / TODO

- **Node v24 "Electron failed to install":** run `node .claude/skills/electron-install-fix/scripts/fix-electron.js`
  (cross-platform; extracts the cached binary, writes `path.txt` w/ no trailing newline). Best fix: use Node LTS v22.
- **macOS Gatekeeper** on the built .dmg (unsigned): right-click → Open, or `xattr -cr "/Applications/Declan Prospecting App.app"`.
- ~~Top tabs wrap onto the page on very narrow windows~~ FIXED in v1.3.0: the bar shrinks its
  tabs below 980px/700px and grows downward (min-height + wrap) if a second row is still needed.
- **Installers/auto-update** not yet published (see §4).
- **Top bar wraps to a 2nd row** once there are 6 tabs on a narrow window — it grows downward (no
  overlap), so it's cosmetic. Tighten the tab layout if it bugs Declan at his usual width.
- Contacts/data NEVER go to GitHub (`.gitignore` blocks `prospecting-data.json`, `app-config.json`, `*.csv`, `*.xlsx`, `signing/`).

---

## 8) CONTINUE IN A NEW SESSION — paste this

> I'm continuing the Declan Prospecting App (Electron, vanilla JS, repo
> github.com/Addi-exec/declan-prospecting-app, currently v3.2.2). Read `HANDOFF.md` and `CLAUDE.md`
> first — they have the full context, architecture, data shapes, conventions and status. `git push`
> works from here (gh authed). Use the project skills in `.claude/skills/`. Follow conventions:
> semver + version in 3 places + About changelog; every colour a themed CSS var across all 5 palettes
> (light+dark); calls/SMS-only scripts; dates displayed dd/mm/yyyy; validate (node --check + the
> renderer parse/dup-id/hex check) and do a live-browser check in both themes before committing. My
> next task is: [DESCRIBE].

---

## 9) QUICK REFERENCE

| Thing | Value |
|------|------|
| Repo | https://github.com/Addi-exec/declan-prospecting-app (public) |
| Current version | 5.0.0 |
| Push | `git push origin main` (gh authed) · release: `gh release create vX.Y.Z` |
| Data file | `<dataDir>/prospecting-data.json` = `{contacts,buyers,properties,inspections,drops}` (+local `activity`) |
| Default data path | Win `%APPDATA%\Declan Prospecting App\` · Mac `~/Library/Application Support/Declan Prospecting App/` · Linux `~/.config/Declan Prospecting App/` |
| Run dev / build | `npm start` · `npm run build:win\|build:mac\|build:linux` |
| Electron install fix | `node .claude/skills/electron-install-fix/scripts/fix-electron.js` |
| Skills | `.claude/skills/`: prospecting-app-dev-workflow, electron-install-fix, google-sheets-integration |
