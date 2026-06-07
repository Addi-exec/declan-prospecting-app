const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const ExcelJS = require('exceljs');
const { autoUpdater } = require('electron-updater');

// GitHub repo that hosts releases (must match build.publish in package.json).
const GH_OWNER = 'Addi-exec';
const GH_REPO = 'declan-prospecting-app';

let mainWin = null;
let manualCheck = false; // true when the user clicked "Check for updates"

const DATA_FILENAME = 'prospecting-data.json';
function configFile() { return path.join(app.getPath('userData'), 'app-config.json'); }
function readConfig() { try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')) || {}; } catch (e) { return {}; }
}
function writeConfig(cfg) { try { fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2)); return true; } catch (e) { return false; } }
// Read the config, let the caller mutate it, then persist — the read/modify/write
// dance was repeated in many handlers, so this keeps them to one line and consistent.
function updateConfig(mutate) { const cfg = readConfig(); mutate(cfg); writeConfig(cfg); return cfg; }
// Where contacts live: a user-chosen shared folder (e.g. Dropbox/iCloud) or the default userData dir.
function dataDir() { const c = readConfig(); return (c.dataDir && fs.existsSync(c.dataDir)) ? c.dataDir : app.getPath('userData'); }
function dataFile() { return path.join(dataDir(), DATA_FILENAME); }

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 380,
    title: 'Declan Prospecting App',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

/* ---------------- Auto-update (GitHub Releases) ---------------- */
function wireAutoUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (manualCheck && mainWin) {
      dialog.showMessageBox(mainWin, {
        type: 'info',
        message: 'Update available',
        detail: 'Version ' + info.version + ' is downloading now. You\u2019ll be asked to restart when it\u2019s ready.'
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (manualCheck && mainWin) {
      dialog.showMessageBox(mainWin, {
        type: 'info',
        message: 'You\u2019re up to date',
        detail: 'You already have the latest version.'
      });
    }
    manualCheck = false;
  });

  autoUpdater.on('error', (err) => {
    if (manualCheck && mainWin) {
      dialog.showMessageBox(mainWin, {
        type: 'error',
        message: 'Update check failed',
        detail: String(err)
      });
    }
    manualCheck = false;
  });

  autoUpdater.on('update-downloaded', (info) => {
    manualCheck = false;
    if (!mainWin) return;
    dialog.showMessageBox(mainWin, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: 'Version ' + info.version + ' downloaded',
      detail: 'Restart the app to finish updating. Your data is kept.'
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
}

/* ---------------- Mac manual update (unsigned app) ----------------
   On macOS an unsigned app cannot auto-apply updates (Squirrel.Mac needs a
   code signature), so instead of electron-updater we ask GitHub for the latest
   release, compare versions, and offer to open the .dmg download. The user then
   drags the new app into Applications. Contacts live outside the app bundle, so
   nothing is lost. No extra dependencies — just the built-in https client. */
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: '/repos/' + GH_OWNER + '/' + GH_REPO + '/releases/latest',
      method: 'GET',
      headers: { 'User-Agent': GH_REPO, 'Accept': 'application/vnd.github+json' }
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('GitHub returned ' + res.statusCode)); return; }
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const version = String(json.tag_name || json.name || '').replace(/^v/i, '');
          const dmg = (json.assets || []).find((a) => /\.dmg$/i.test(a.name));
          resolve({ version, htmlUrl: json.html_url, dmgUrl: dmg ? dmg.browser_download_url : null });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Update check timed out')));
    req.end();
  });
}

// Compare dotted versions; true if remote > local.
function isNewer(remote, local) {
  const a = String(remote).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(local).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

async function macUpdateCheck(manual) {
  try {
    const rel = await fetchLatestRelease();
    if (rel.version && isNewer(rel.version, app.getVersion())) {
      const r = await dialog.showMessageBox(mainWin, {
        type: 'info',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update available',
        message: 'Version ' + rel.version + ' is available',
        detail: 'You have v' + app.getVersion() + '. Click Download to get the new version, then open the .dmg '
          + 'and drag the app into your Applications folder (replacing the old one). Your contacts are kept safe.'
      });
      if (r.response === 0) shell.openExternal(rel.dmgUrl || rel.htmlUrl);
      return { ok: true, handled: true, updateAvailable: true, version: rel.version };
    }
    if (manual) {
      await dialog.showMessageBox(mainWin, {
        type: 'info',
        message: 'You’re up to date',
        detail: 'You already have the latest version (v' + app.getVersion() + ').'
      });
    }
    return { ok: true, handled: true, updateAvailable: false };
  } catch (e) {
    if (manual) {
      await dialog.showMessageBox(mainWin, {
        type: 'error',
        message: 'Update check failed',
        detail: 'Could not reach GitHub to check for updates. Please try again later.\n\n' + String(e)
      });
    }
    return { ok: false, handled: true, error: String(e) };
  }
}

app.whenReady().then(() => {
  createWindow();
  if (process.platform === 'darwin') {
    // Mac: unsigned build can't auto-apply, so silently check GitHub on launch and
    // only prompt (with a Download button) if a newer version exists.
    if (app.isPackaged) macUpdateCheck(false);
  } else {
    // Windows + Linux: electron-updater. Windows (signed) self-installs; Linux
    // auto-updates when run as an AppImage (a .deb install simply no-ops the check).
    // Silent on launch; no-ops cleanly in dev or if no release/repo is reachable.
    wireAutoUpdate();
    if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------- App info + manual update check ---------------- */
ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('update:check', async () => {
  // Mac: query GitHub directly and offer a manual download (works in dev too).
  if (process.platform === 'darwin') return macUpdateCheck(true);
  if (!app.isPackaged) return { ok: false, dev: true };
  manualCheck = true;
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (e) { manualCheck = false; return { ok: false, error: String(e) }; }
});

/* ---------------- Google Sheets integration ----------------
   googleapis is a runtime dependency (npm install googleapis).
   All gsheets:* handlers degrade gracefully if the package is absent. */

const GS_REDIRECT_PORT = 42813;
const GS_REDIRECT_URI = 'http://localhost:' + GS_REDIRECT_PORT;
const GS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CONTACT_HEADERS = ['id','method','outcome','first','last','address','mobile','email','callDate','stepsDone','branchDate','archived','notes'];
// Per-request timeout so a hung network never freezes contacts:load / contacts:save —
// the callers all fall back to the local JSON file when a Sheets call rejects.
const GS_REQ_OPTS = { timeout: 20000 };

function requireGoogle() {
  try { return require('googleapis'); } catch(e) { return null; }
}

// One place that builds the Sheets v4 client (was duplicated across four handlers).
function gsApi(auth) { return requireGoogle().google.sheets({ version: 'v4', auth }); }

function makeOAuth2Client(cfg) {
  const gapis = requireGoogle();
  if (!gapis || !cfg.gClientId || !cfg.gClientSecret) return null;
  const client = new gapis.google.auth.OAuth2(cfg.gClientId, cfg.gClientSecret, GS_REDIRECT_URI);
  if (cfg.gTokens) {
    client.setCredentials(cfg.gTokens);
    // Persist refreshed access/refresh tokens so the user stays signed in across launches.
    client.on('tokens', (t) => updateConfig((c) => { c.gTokens = Object.assign({}, c.gTokens, t); }));
  }
  return client;
}

function getAuthClient() {
  const cfg = readConfig();
  if (!cfg.gTokens) return null;
  return makeOAuth2Client(cfg);
}

async function gsLoadFromSheet(auth, sheetId) {
  const api = gsApi(auth);
  const res = await api.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Contacts!A:N' }, GS_REQ_OPTS);
  const rows = res.data.values || [];
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => String(h).trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v != null && v !== ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = r[i] != null ? String(r[i]) : ''; });
      obj.stepsDone = parseInt(obj.stepsDone, 10) || 0;
      obj.archived = obj.archived === 'true';
      return obj;
    });
}

async function gsSaveToSheet(auth, sheetId, contacts) {
  const api = gsApi(auth);
  const values = [
    CONTACT_HEADERS,
    ...contacts.map((c) => CONTACT_HEADERS.map((h) => (c[h] == null ? '' : String(c[h]))))
  ];
  await api.spreadsheets.values.clear({ spreadsheetId: sheetId, range: 'Contacts!A:N' }, GS_REQ_OPTS);
  await api.spreadsheets.values.update({
    spreadsheetId: sheetId, range: 'Contacts!A1',
    valueInputOption: 'RAW', requestBody: { values }
  }, GS_REQ_OPTS);
}

/* ---------------- Contacts: load / save (local + optional Google Sheets) ---------------- */
ipcMain.handle('contacts:load', async () => {
  try {
    const cfg = readConfig();
    if (cfg.gTokens && cfg.gSheetId) {
      const auth = getAuthClient();
      if (auth) {
        try {
          const contacts = await gsLoadFromSheet(auth, cfg.gSheetId);
          // Keep a local mirror so the app still works offline; a failed mirror write
          // shouldn't hide the freshly-fetched contacts, but it's worth surfacing.
          try { fs.writeFileSync(dataFile(), JSON.stringify(contacts, null, 2)); }
          catch(e) { console.warn('Could not write local contacts mirror:', String(e)); }
          return contacts;
        } catch(e) { /* fall through to local file */ }
      }
    }
    const p = dataFile();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8') || '[]');
  } catch (e) { return []; }
});

ipcMain.handle('contacts:save', async (_e, arr) => {
  try {
    fs.writeFileSync(dataFile(), JSON.stringify(arr, null, 2));
    const cfg = readConfig();
    if (cfg.gTokens && cfg.gSheetId) {
      const auth = getAuthClient();
      if (auth) {
        try {
          await gsSaveToSheet(auth, cfg.gSheetId, arr);
          return { ok: true, synced: true };
        } catch(e) { return { ok: true, synced: false, syncError: String(e) }; }
      }
    }
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err) }; }
});

/* ---------------- Data location (share across computers via a cloud folder) ---------------- */
ipcMain.handle('data:getLocation', () => {
  const c = readConfig();
  return { path: dataFile(), dir: dataDir(), custom: !!(c.dataDir && fs.existsSync(c.dataDir)) };
});

// Pick a folder (ideally a Dropbox/iCloud/OneDrive/Google Drive folder). If that folder
// already has a contacts file (synced from another computer) we ADOPT it; otherwise we
// copy the current contacts into it so nothing is lost. Returns the new file path.
ipcMain.handle('data:setLocation', async () => {
  const res = await dialog.showOpenDialog(mainWin, {
    title: 'Choose a folder to store your contacts (use a cloud-synced folder to share across computers)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false };
  const newDir = res.filePaths[0];
  const newFile = path.join(newDir, DATA_FILENAME);
  const oldFile = dataFile();
  try {
    const adopted = fs.existsSync(newFile);
    if (!adopted) {
      let current = '[]';
      if (fs.existsSync(oldFile)) current = fs.readFileSync(oldFile, 'utf8') || '[]';
      fs.writeFileSync(newFile, current);
    }
    updateConfig((cfg) => { cfg.dataDir = newDir; });
    return { ok: true, path: newFile, dir: newDir, adopted };
  } catch (err) { return { ok: false, error: String(err) }; }
});

// Go back to this computer's default location (copies the data back if needed).
ipcMain.handle('data:useDefault', async () => {
  const oldFile = dataFile();
  try {
    updateConfig((cfg) => { delete cfg.dataDir; });
    const def = dataFile();
    if (oldFile !== def && fs.existsSync(oldFile) && !fs.existsSync(def)) {
      fs.writeFileSync(def, fs.readFileSync(oldFile, 'utf8') || '[]');
    }
    return { ok: true, path: def, dir: dataDir() };
  } catch (err) { return { ok: false, error: String(err) }; }
});

/* ---------------- Excel export (one sheet per method) ---------------- */
ipcMain.handle('excel:export', async (_e, sheets, suggested) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: suggested,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  });
  if (canceled || !filePath) return { ok: false };
  const wb = new ExcelJS.Workbook();
  sheets.forEach((s) => {
    const ws = wb.addWorksheet(s.name);
    ws.addRow(s.header);
    s.rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((col) => { col.width = 18; });
  });
  await wb.xlsx.writeFile(filePath);
  return { ok: true, path: filePath };
});

/* ---------------- Plain text / CSV export ---------------- */
ipcMain.handle('file:saveText', async (_e, text, suggested) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: suggested });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, text);
  return { ok: true, path: filePath };
});

/* ---------------- Excel / CSV import ---------------- */
function sheetToObjects(ws) {
  const rows = [];
  let header = [];
  ws.eachRow((row, idx) => {
    const vals = row.values.slice(1).map((v) => {
      if (v == null) return '';
      if (v instanceof Date) return v;
      if (typeof v === 'object' && v.text != null) return v.text;
      if (typeof v === 'object' && v.result != null) return v.result;
      return v;
    });
    if (idx === 1) header = vals.map((h) => String(h).trim());
    else {
      const obj = {};
      header.forEach((h, i) => { obj[h] = vals[i] == null ? '' : vals[i]; });
      rows.push(obj);
    }
  });
  return { name: ws.name, rows };
}

ipcMain.handle('excel:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Spreadsheet', extensions: ['xlsx', 'xls', 'csv'] }]
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false };
  const fp = filePaths[0];
  const wb = new ExcelJS.Workbook();
  const sheets = [];
  try {
    if (fp.toLowerCase().endsWith('.csv')) await wb.csv.readFile(fp);
    else await wb.xlsx.readFile(fp);
    wb.eachSheet((ws) => sheets.push(sheetToObjects(ws)));
    return { ok: true, sheets };
  } catch (err) {
    return { ok: false, error: 'Could not read that file. Make sure it is a .xlsx or .csv.' };
  }
});

/* ---------------- Google Sheets: connect + manage ---------------- */
ipcMain.handle('gsheets:getStatus', () => {
  const cfg = readConfig();
  return {
    hasCredentials: !!(cfg.gClientId && cfg.gClientSecret),
    authenticated: !!(cfg.gTokens),
    sheetId: cfg.gSheetId || null,
    sheetName: cfg.gSheetName || null,
    sheetUrl: cfg.gSheetId ? 'https://docs.google.com/spreadsheets/d/' + cfg.gSheetId : null
  };
});

ipcMain.handle('gsheets:setCredentials', (_e, clientId, clientSecret) => {
  updateConfig((cfg) => {
    cfg.gClientId = String(clientId).trim();
    cfg.gClientSecret = String(clientSecret).trim();
  });
  return { ok: true };
});

ipcMain.handle('gsheets:connect', () => {
  if (!requireGoogle()) return { ok: false, error: 'googleapis package not installed — run npm install in the app folder.' };
  const cfg = readConfig();
  const client = makeOAuth2Client(cfg);
  if (!client) return { ok: false, error: 'No credentials saved yet.' };

  const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: GS_SCOPES, prompt: 'consent' });

  return new Promise((resolve) => {
    let server;
    const timer = setTimeout(() => { server && server.close(); resolve({ ok: false, error: 'Sign-in timed out (2 min). Please try again.' }); }, 120000);

    server = http.createServer(async (req, res) => {
      const q = new URL(req.url, GS_REDIRECT_URI);
      const code = q.searchParams.get('code');
      const err = q.searchParams.get('error');
      const html = (msg, ok) => `<html><body style="font-family:sans-serif;text-align:center;padding:60px 40px"><h2 style="color:${ok ? '#1a5fb4' : '#c01c28'}">${msg}</h2><p style="color:#555">You can close this tab and go back to the app.</p></body></html>`;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (err || !code) {
        res.end(html('Access denied', false));
        clearTimeout(timer); server.close();
        return resolve({ ok: false, error: 'Access was denied.' });
      }
      try {
        const { tokens } = await client.getToken(code);
        updateConfig((c) => { c.gTokens = tokens; });
        res.end(html('Connected to Google Sheets!', true));
        clearTimeout(timer); server.close();
        resolve({ ok: true });
      } catch(e) {
        res.end(html('Error: ' + String(e), false));
        clearTimeout(timer); server.close();
        resolve({ ok: false, error: String(e) });
      }
    });

    server.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: 'Port 42813 is in use. Close other apps and try again.' }); });
    server.listen(GS_REDIRECT_PORT, '127.0.0.1', () => shell.openExternal(authUrl));
  });
});

ipcMain.handle('gsheets:createSheet', async (_e, contacts) => {
  const auth = getAuthClient();
  if (!auth) return { ok: false, error: 'Not signed in to Google.' };
  try {
    const api = gsApi(auth);
    const res = await api.spreadsheets.create({
      requestBody: {
        properties: { title: 'Declan Prospecting Contacts' },
        sheets: [{ properties: { title: 'Contacts' } }]
      }
    }, GS_REQ_OPTS);
    const sheetId = res.data.spreadsheetId;
    await gsSaveToSheet(auth, sheetId, Array.isArray(contacts) ? contacts : []);
    updateConfig((cfg) => { cfg.gSheetId = sheetId; cfg.gSheetName = 'Declan Prospecting Contacts'; });
    return { ok: true, sheetId, sheetName: 'Declan Prospecting Contacts', sheetUrl: 'https://docs.google.com/spreadsheets/d/' + sheetId };
  } catch(e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('gsheets:linkSheet', async (_e, urlOrId) => {
  const auth = getAuthClient();
  if (!auth) return { ok: false, error: 'Not signed in to Google.' };
  let sheetId = String(urlOrId).trim();
  const m = sheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) sheetId = m[1];
  try {
    const api = gsApi(auth);
    const meta = await api.spreadsheets.get({ spreadsheetId: sheetId }, GS_REQ_OPTS);
    const sheetName = meta.data.properties.title;
    const hasTab = (meta.data.sheets || []).some((s) => s.properties.title === 'Contacts');
    if (!hasTab) {
      await api.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: [{ addSheet: { properties: { title: 'Contacts' } } }] } }, GS_REQ_OPTS);
    }
    updateConfig((cfg) => { cfg.gSheetId = sheetId; cfg.gSheetName = sheetName; });
    return { ok: true, sheetId, sheetName };
  } catch(e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('gsheets:disconnect', () => {
  updateConfig((cfg) => { delete cfg.gTokens; delete cfg.gSheetId; delete cfg.gSheetName; });
  return { ok: true };
});

ipcMain.handle('gsheets:openSheet', (_e, url) => {
  shell.openExternal(url);
  return { ok: true };
});
