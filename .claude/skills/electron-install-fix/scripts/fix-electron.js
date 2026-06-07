#!/usr/bin/env node
/*
 * fix-electron.js — repair a broken Electron binary install.
 *
 * Symptom this fixes:
 *   npm start  ->  "Electron failed to install correctly"  or
 *   Error: ENOENT ... node_modules/electron/path.txt
 *
 * Cause: on some Node versions (notably v24) Electron's post-install step
 * silently no-ops — it exits 0 but leaves node_modules/electron/dist empty
 * (no binary, no path.txt). The download usually already sits in the local
 * Electron cache, so we don't need the network: we just extract it and write
 * path.txt (WITHOUT a trailing newline — a stray newline breaks the launch).
 *
 * Cross-platform: macOS, Windows, Linux. No network, no extra npm packages —
 * extraction uses the OS's own tools (unzip on macOS/Linux, PowerShell or tar
 * on Windows), which is more reliable here than the bundled extract-zip
 * (whose promise can hang on newer Node versions).
 *
 * Usage:
 *   node fix-electron.js [projectDir]
 * projectDir defaults to the current working directory.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const projectDir = path.resolve(process.argv[2] || process.cwd());
const electronDir = path.join(projectDir, 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const pathTxt = path.join(electronDir, 'path.txt');

function log(msg) { process.stdout.write(msg + '\n'); }
function fail(msg) { process.stderr.write('ERROR: ' + msg + '\n'); process.exit(1); }

// The executable inside dist/, per platform — this is also path.txt's contents.
function binaryRelPath() {
  if (process.platform === 'darwin') return path.join('Electron.app', 'Contents', 'MacOS', 'Electron');
  if (process.platform === 'win32') return 'electron.exe';
  return 'electron'; // linux
}

// path.txt always uses forward slashes inside the dist dir, matching electron's own installer.
function pathTxtContents() {
  if (process.platform === 'darwin') return 'Electron.app/Contents/MacOS/Electron';
  if (process.platform === 'win32') return 'electron.exe';
  return 'electron';
}

function electronCacheRoot() {
  // Mirrors @electron/get's default cache locations.
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'electron');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron', 'Cache');
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'electron');
}

function readVersion() {
  try {
    return require(path.join(electronDir, 'package.json')).version;
  } catch (e) {
    fail('Could not read node_modules/electron/package.json — run `npm install` first, then re-run this.');
  }
}

function alreadyWorking() {
  return fs.existsSync(path.join(distDir, binaryRelPath())) && fs.existsSync(pathTxt);
}

// Find electron-v<ver>-<platform>-<arch>.zip anywhere under the cache root (it lives in a hashed subdir).
function findCachedZip(version) {
  const arch = process.arch; // x64 | arm64 | ia32 ...
  const wanted = `electron-v${version}-${process.platform}-${arch}.zip`;
  const root = electronCacheRoot();
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name === wanted) return full;
    }
  }
  return null;
}

function tryRun(cmd, args) {
  try { execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] }); return true; }
  catch (e) { return false; }
}

// Extract the .zip using the OS's own tools, trying the most reliable first per platform.
// Each candidate is attempted only if the previous left the binary missing.
function extractZip(zip, dest) {
  const ok = () => fs.existsSync(path.join(dest, binaryRelPath()));
  const attempts = process.platform === 'win32'
    ? [
        // Windows 10+ ships both. tar (bsdtar) preserves the layout; Expand-Archive is the fallback.
        () => tryRun('tar', ['-xf', zip, '-C', dest]),
        () => tryRun('powershell', ['-NoProfile', '-Command',
          `Expand-Archive -LiteralPath "${zip}" -DestinationPath "${dest}" -Force`])
      ]
    : [
        // macOS + Linux: unzip preserves the .app symlinks; bsdtar (macOS) is a backup.
        () => tryRun('unzip', ['-q', '-o', zip, '-d', dest]),
        () => tryRun('tar', ['-xf', zip, '-C', dest])
      ];

  for (const attempt of attempts) {
    attempt();
    if (ok()) return;
  }
  fail('Could not extract the Electron zip with the available tools.\n' +
    (process.platform === 'win32'
      ? 'Tried tar and PowerShell Expand-Archive.'
      : 'Tried unzip and tar — install unzip (e.g. `sudo apt install unzip` on Linux Mint) and retry.'));
}

async function main() {
  if (!fs.existsSync(electronDir)) {
    fail('node_modules/electron not found. Run `npm install` in ' + projectDir + ' first.');
  }
  if (alreadyWorking()) {
    log('Electron looks healthy already (binary + path.txt present). Nothing to do.');
    return;
  }

  const version = readVersion();
  log(`Repairing Electron v${version} for ${process.platform}-${process.arch}...`);

  const zip = findCachedZip(version);
  if (!zip) {
    fail(
      'No cached Electron zip found under ' + electronCacheRoot() + '.\n' +
      'The binary was never downloaded. Fix by re-downloading:\n' +
      '  rm -rf node_modules/electron && npm install\n' +
      '(or, best long-term fix, switch to Node LTS v22 which does not hit this bug).'
    );
  }
  log('Found cached binary: ' + zip);

  // Start from a clean dist dir.
  try { fs.rmSync(distDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(distDir, { recursive: true });

  extractZip(zip, distDir);

  // Write path.txt WITHOUT a trailing newline (fs.writeFileSync adds none — do NOT use echo in a shell).
  fs.writeFileSync(pathTxt, pathTxtContents());

  if (!alreadyWorking()) {
    fail('Extraction finished but the binary still is not where expected (' +
      path.join(distDir, binaryRelPath()) + '). The cached zip may be corrupt — ' +
      'delete it and run `npm install` again.');
  }
  log('Done. Electron repaired — `npm start` should work now.');
}

main().catch((e) => fail(String(e && e.stack || e)));
