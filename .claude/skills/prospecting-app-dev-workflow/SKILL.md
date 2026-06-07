---
name: prospecting-app-dev-workflow
description: >-
  The house rules for changing the Declan Prospecting App (the Electron real-estate
  prospecting/CRM desktop app in this repo). Use this WHENEVER you add a feature, fix
  a bug, edit scripts/copy, touch the UI, or prep a release here — it covers the
  versioning-in-three-places ritual, the changelog entry, light+dark theming via CSS
  variables, the calls/SMS-only rule, warm opener tone, the data-layer boundaries, and
  the validate-before-you-ship checks. Trigger it before editing `renderer/index.html`,
  `electron/main.js`, or `electron/preload.js`, even for "small" changes — the renderer
  is one ~2000-line file and is easy to break silently.
---

# Prospecting App — dev workflow

This app is an Electron desktop tool for **Declan Addison**, a Melbourne real-estate
agent. Two jobs: cold-calling **scripts** (4 methods × openers/objections/closes/
follow-up/nurture) and a **contact tracker (CRM)** that schedules follow-ups and
exports to Excel / syncs to Google Sheets. Cross-platform: Windows, macOS, Linux.

Read `CLAUDE.md` (technical source of truth) and `HANDOFF.md` (history + goals) before
non-trivial work. This skill is the short, enforceable checklist that sits on top of them.

## The non-negotiables

1. **Version bump in THREE places, every shippable change.** They must match
   `package.json`'s `version`, or it looks broken:
   - `package.json` → `"version"`
   - `renderer/index.html` → header span `id="app-version"` (e.g. `v0.24.0`)
   - `renderer/index.html` → About page `id="about-version"` (e.g. `Version 0.24.0`)

   Convention: **feature → bump the decimal** (`0.23.0 → 0.24.0`); **bug fix → add a
   third number** (`0.24.0 → 0.24.1`). The header/about text is also set at runtime from
   `window.api.getVersion()`, but keep the literals correct too (they're the fallback).

2. **Add a changelog entry on the About page.** In `renderer/index.html`, the "Version
   history" list is one long line of `<div>` rows. Prepend a new row (newest first) in
   the SAME format as the existing ones, written in plain, friendly language for Declan
   — what changed and why it helps, not jargon.

3. **Every colour is a CSS variable defined in BOTH themes.** Never hardcode a hex value
   in markup or JS. Add new colours to `:root { }` AND `[data-theme="dark"] { }` near the
   top of `renderer/index.html`, then reference `var(--name)`. Dark mode is a header
   toggle persisted in `localStorage['declan-theme']`; a change that only looks right in
   one theme is a bug.

4. **Outreach is calls + SMS only — never email.** All openers/objections/closes/
   follow-ups/nurture use phone calls and text messages. The contact record keeps an
   `email` field as stored data, but no script step may send email.

5. **Opener tone: genuine, warm, eased-in.** Never announce "this is a cold call." Keep
   the research/psychology backing (Cialdini, Gong call data, loss aversion, etc.). If
   you write or edit script copy, read it back as if you were the homeowner answering.

6. **Don't touch the data layer casually.** Storage flows through exactly two places:
   `crmLoad()` / `crmSave()` in the renderer, and the `contacts:load` / `contacts:save`
   IPC handlers in `electron/main.js`. The renderer NEVER touches `fs`/Node directly —
   everything goes through `window.api` (defined in `electron/preload.js`). If you add an
   IPC channel, add it in BOTH `main.js` (handler) and `preload.js` (bridge), or it won't
   exist to the renderer.

## Validate before you deliver

The renderer is a single file with inline `<script>` blocks, so a typo silently breaks
the whole UI. After any edit, run these from the project root and confirm a clean result:

```bash
# 1) Main-process + bridge syntax
node --check electron/main.js && node --check electron/preload.js

# 2) Renderer: every inline <script> parses, no duplicate element IDs, no stray hex
node -e '
const fs=require("fs"),html=fs.readFileSync("renderer/index.html","utf8");
let m,i=0,bad=0,re=/<script>([\s\S]*?)<\/script>/g;
while((m=re.exec(html))){i++;try{new Function(m[1])}catch(e){bad++;console.log("SCRIPT "+i+":",e.message)}}
const ids={},idre=/\sid="([^"]+)"/g;while((m=idre.exec(html)))ids[m[1]]=(ids[m[1]]||0)+1;
const dup=Object.entries(ids).filter(([,v])=>v>1);
const hex=html.split("\n").map((l,n)=>[n+1,l]).filter(([,l])=>/#[0-9a-fA-F]{3,6}\b/.test(l)&&!/--[a-z-]+\s*:/.test(l)&&!/color:\s*\$\{/.test(l));
console.log("scripts:",i,"parse-errors:",bad,"| dup-ids:",dup.length?JSON.stringify(dup):"none","| stray-hex:",hex.length?hex.map(h=>h[0]).join(","):"none");
'
```

Expect: `0` parse errors, `dup-ids: none`, `stray-hex: none`. Anything else, fix before
shipping. When feasible, also launch the app (`npm start`) and toggle dark mode to eye
the change in both themes — there's no automated visual test.

## Releasing (only when the user asks to ship)

1. Bump the 3 version spots + add the changelog row (above).
2. Build for the target OS: `npm run build:mac` / `build:win` / `build:linux` (or
   `npm run build` for the current platform).
3. Publish to GitHub Releases with `npm run release` (needs `GH_TOKEN`; Windows builds
   want `CSC_LINK` / `CSC_KEY_PASSWORD` for signing). See `HANDOFF.md` §6 for the full
   publish dance and per-OS auto-update behaviour.

## Map of the codebase

| File | What's in it |
|------|--------------|
| `electron/main.js` | Main process: `BrowserWindow`, all `ipcMain.handle` channels (contacts load/save, Excel import/export, data-location, Google Sheets OAuth + sync, version, update check), platform-split auto-update. |
| `electron/preload.js` | `contextBridge` → `window.api` — the ONLY renderer↔main surface. Each method maps to one IPC channel. |
| `renderer/index.html` | The entire UI: HTML + inline CSS (`:root` + `[data-theme="dark"]`) + vanilla JS (CRM engine `METHODS`/`nextMilestone`/`crmRenderAll`, tab system `showPanel`/`makeTabFn`/`showJsfTab`/`showJsnTab`, export/import, theme toggle, Google Sheets UI). |
| `package.json` | App metadata + electron-builder config (mac dmg, win nsis, linux AppImage/deb) + scripts. |
| `CLAUDE.md` / `HANDOFF.md` | Conventions, history, gotchas, publish steps. |

## Related skills

- **electron-install-fix** — when `npm start` fails with "Electron failed to install
  correctly" / missing `path.txt`.
- **google-sheets-integration** — when working on or troubleshooting the Google Sheets
  sync (OAuth setup, `gsheets:*` handlers, the consent-screen / API-enabling errors).
