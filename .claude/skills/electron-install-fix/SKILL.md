---
name: electron-install-fix
description: >-
  Repair a broken Electron binary install in this app (or any Electron project).
  Use this WHENEVER `npm start` fails with "Electron failed to install correctly",
  or a crash referencing a missing `node_modules/electron/path.txt`, or
  `Error: ENOENT ... path.txt`, or the app refuses to launch after `npm install`
  / a Node upgrade. Common on Node v24, and on Windows, macOS, and Linux alike.
  Trigger even if the user just says "the app won't open" / "electron won't start"
  / "I reinstalled and now npm start is broken" — this is almost always the cause.
---

# Fix a broken Electron install

## The symptom

`npm start` (which runs `electron .`) dies with one of:

```
Error: ENOENT: no such file or directory, open '.../node_modules/electron/path.txt'
```
or prints `Downloading Electron binary...` and then `Electron failed to install correctly`.

## Why it happens (so you can explain it)

Electron ships as a tiny npm package plus a large platform binary that a
**post-install** step downloads and unpacks into `node_modules/electron/dist/`,
writing the binary's relative path into `node_modules/electron/path.txt`.

On some Node versions — **notably Node v24** — that post-install step silently
no-ops: it exits 0 but leaves `dist/` empty (often just a `LICENSE` file, no
`Electron.app` / `electron.exe`, no `path.txt`). The binary's `.zip` almost always
already sits in the local Electron cache, so the fix needs **no network** — just
re-extract it and write `path.txt`.

> The single most reliable long-term fix is to use **Node LTS (v22)** instead of
> v24. Mention this to the user, but the script below gets them running right now
> without changing Node.

## Fastest fix: run the bundled script

From the project root (the folder with `package.json`):

```
node .claude/skills/electron-install-fix/scripts/fix-electron.js
```

It is cross-platform (macOS / Windows / Linux) and safe to run repeatedly:
- if the install is already healthy it does nothing,
- otherwise it reads the Electron version, finds the matching cached `.zip`,
  extracts it into `dist/` with the OS's own tools, and writes `path.txt`
  **without a trailing newline** (a stray newline breaks the launch).

After it prints `Done.`, run `npm start` — it should open.

If it reports **no cached zip found**, the binary was never downloaded at all.
Then re-download it (needs internet):

```
rm -rf node_modules/electron && npm install
```

## Manual fix (if you can't run the script)

Do the same steps by hand. The cache location and `path.txt` contents differ per OS:

| OS | Cached zip location | `path.txt` contents |
|----|---------------------|---------------------|
| macOS | `~/Library/Caches/electron/<hash>/electron-v<VER>-darwin-<arch>.zip` | `Electron.app/Contents/MacOS/Electron` |
| Windows | `%LOCALAPPDATA%\electron\Cache\<hash>\electron-v<VER>-win32-<arch>.zip` | `electron.exe` |
| Linux | `~/.cache/electron/<hash>/electron-v<VER>-linux-<arch>.zip` | `electron` |

`<VER>` is the `version` in `node_modules/electron/package.json`; `<arch>` is
`x64` or `arm64`.

**macOS / Linux:**
```bash
rm -rf node_modules/electron/dist && mkdir node_modules/electron/dist
unzip -q "<cached-zip-path>" -d node_modules/electron/dist
printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt   # macOS
# printf 'electron' > node_modules/electron/path.txt                              # Linux
```
Use `printf`, **never** `echo` — `echo` appends a newline that breaks the launch.

**Windows (PowerShell):**
```powershell
Remove-Item -Recurse -Force node_modules\electron\dist; New-Item -ItemType Directory node_modules\electron\dist | Out-Null
Expand-Archive -LiteralPath "<cached-zip-path>" -DestinationPath node_modules\electron\dist -Force
[IO.File]::WriteAllText("node_modules\electron\path.txt", "electron.exe")   # WriteAllText = no trailing newline
```

## Verify the fix

```
node -e "const p=require('electron'),fs=require('fs');console.log(p, fs.existsSync(p))"
```
This should print the path to the Electron binary and `true`. Then `npm start`.

## Notes

- This repo pins an Electron download mirror in `.npmrc` (`electron_mirror`) to
  dodge blocked GitHub downloads — leave it; it's why the cache fills even on
  restricted networks.
- The same bug and fix are documented for this project in `CLAUDE.md` (Windows
  setup gotcha) and `HANDOFF.md` (Mac note). This skill generalises both and adds
  Linux + a one-command script.
