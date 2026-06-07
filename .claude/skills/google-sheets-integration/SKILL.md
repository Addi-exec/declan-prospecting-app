---
name: google-sheets-integration
description: >-
  How the Declan Prospecting App syncs contacts to Google Sheets, how to set it up,
  and how to fix the setup errors. Use this WHENEVER the work touches Google Sheets
  sync, Google sign-in / OAuth, the `gsheets:*` IPC handlers, or the Google Cloud
  Console setup — and ESPECIALLY when the user reports any of these errors:
  "Access blocked … org_internal" / "can only be used within its organization",
  "Google Sheets API has not been used in project … or it is disabled",
  "Google hasn't verified this app", "Not signed in to Google", "redirect_uri_mismatch",
  "Port 42813 is in use", or contacts not syncing across devices. Trigger even when the
  user just says "connect my google sheet" or "my contacts aren't syncing".
---

# Google Sheets integration

Lets Declan store the CRM contacts in a Google Sheet so they stay in sync across all his
computers (and are viewable/editable in the browser or the Sheets phone app). It is
**free and needs no credit card** — the Sheets API and OAuth credentials don't require
billing.

## How it works (architecture)

All of this lives in `electron/main.js` (the `googleapis` package is a runtime dependency
and every `gsheets:*` handler degrades gracefully if it's missing). The renderer drives it
through `window.api` (see `electron/preload.js`).

- **Auth**: OAuth 2.0 "Desktop app" flow. `gsheets:connect` opens the consent page in the
  user's browser via `shell.openExternal`, and a temporary localhost HTTP server
  (`http://localhost:42813`, `GS_REDIRECT_PORT`) catches the redirect with the auth code,
  exchanges it for tokens, and stores them. A 2-minute timeout closes the server if the
  user never finishes.
- **Where secrets live**: everything is in `userData/app-config.json` (NOT the repo, NOT
  the renderer): `gClientId`, `gClientSecret` (the user pastes these from Google Cloud),
  `gTokens` (access/refresh tokens; auto-refreshed via the OAuth client's `tokens` event),
  `gSheetId`, `gSheetName`. Read/written through `readConfig()` / `writeConfig()` /
  `updateConfig()`.
- **The sheet**: one tab named `Contacts`, columns = `CONTACT_HEADERS`
  (`id,method,outcome,first,last,address,mobile,email,callDate,stepsDone,branchDate,
  archived,notes`). `gsLoadFromSheet` reads `Contacts!A:N`; `gsSaveToSheet` clears and
  rewrites it. Requests use a 20s timeout (`GS_REQ_OPTS`).
- **Sync points**: `contacts:load` reads from the sheet when connected and mirrors to the
  local JSON file (so the app still works offline); `contacts:save` always writes local
  JSON first, THEN pushes to the sheet, returning `{ok:true, synced:false, syncError}` if
  the push fails — local data is never lost to a sync error.
- **Handlers**: `gsheets:getStatus`, `gsheets:setCredentials`, `gsheets:connect`,
  `gsheets:createSheet` (make a fresh sheet), `gsheets:linkSheet` (adopt an existing one by
  URL/ID), `gsheets:disconnect`, `gsheets:openSheet`. Helper `gsApi(auth)` builds the
  Sheets v4 client.

## One-time Google Cloud setup (free, no card)

Walk the user through this in the Google Cloud Console (https://console.cloud.google.com),
making sure the **project picker in the top bar stays on the same project** throughout:

1. **Create a project** (or pick one). No billing needed.
2. **Enable the Sheets API**: APIs & Services → Library → search **Google Sheets API** →
   **Enable**. (Skipping this causes the "API has not been used / is disabled" error.)
3. **Configure the OAuth consent screen** (now under **Google Auth Platform → Audience**):
   set **User type = External**. On a personal Gmail this is the only option; if it shows
   **Internal**, switch it to **External** or sign-ins from outside the org are blocked
   (the `org_internal` error). Add the user's Gmail under **Test users**. Leave the app in
   **Testing** — no verification/publishing needed for just Declan.
4. **Create credentials**: APIs & Services → Credentials → **Create credentials → OAuth
   client ID → Application type: Desktop app**. Copy the **Client ID** and **Client
   secret**.
5. In the app's Storage box, paste the Client ID + secret (→ `gsheets:setCredentials`),
   then **Sign in with Google** (→ `gsheets:connect`). On the "Google hasn't verified this
   app" screen, click **Advanced → Go to … (unsafe)** — it's the user's own app talking to
   their own sheet, so it's safe.
6. **Create new sheet for me** or **Link an existing sheet**. Done — contacts now sync.

To sync a second computer: install the app there, paste the **same** Client ID/secret,
sign in, and **Link** the same sheet (paste its URL).

## Error → fix cheat-sheet

| Error the user sees | Cause | Fix |
|---------------------|-------|-----|
| `Access blocked … org_internal` / "can only be used within its organization" | Consent screen User type = **Internal** | Switch to **External** (Google Auth Platform → Audience), add the Gmail as a Test user, retry. |
| `Google Sheets API has not been used in project <N> … or it is disabled` | Sheets API not enabled | Open the link in the error (or Library → Google Sheets API) → **Enable**, wait 1–2 min, retry. |
| `Google hasn't verified this app` | App is unverified (expected in Testing) | **Advanced → Go to <app> (unsafe)** → allow. Not an error. |
| `redirect_uri_mismatch` | Credential isn't a **Desktop app** type, or redirect differs | Recreate the OAuth client as **Desktop app**. The app uses `http://localhost:42813`. |
| `Port 42813 is in use` | Another process holds the redirect port | Close other apps / retry; the server frees the port after each attempt and on a 2-min timeout. |
| `Not signed in to Google` | No `gTokens` in config | Run **Sign in with Google** first (`gsheets:connect`). |
| Contacts not appearing on another device | Different sheet linked, or not signed in there | Confirm both devices are signed in and **Linked to the same sheet ID** (check `gsheets:getStatus`). |
| `googleapis package not installed` | Dependency missing | `npm install` in the app folder. |

## When editing this integration

- Keep secrets out of the renderer and the repo — they belong only in
  `userData/app-config.json`. Never log tokens.
- Preserve the **local-first** contract: `contacts:save` must write local JSON before the
  sheet push and must not fail the save when the sheet push fails.
- If you change `CONTACT_HEADERS`, the sheet's column order changes — old sheets need a
  re-save. Keep it aligned with the contact record shape in `CLAUDE.md`.
- After edits: `node --check electron/main.js`, and confirm every `gsheets:*` handler in
  `main.js` has a matching method in `preload.js`.
- The OAuth scope is `https://www.googleapis.com/auth/spreadsheets` (`GS_SCOPES`).
