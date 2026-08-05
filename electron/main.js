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

// The data file holds three collections. Older versions stored a bare ARRAY of
// contacts, so migrate that shape on read. Always read-modify-write the whole
// object so saving one collection never clobbers the others.
function readData() {
  try {
    const p = dataFile();
    if (!fs.existsSync(p)) return { contacts: [], buyers: [], properties: [], inspections: [], drops: [], activity: [] };
    const raw = JSON.parse(fs.readFileSync(p, 'utf8') || '{}');
    if (Array.isArray(raw)) return { contacts: raw, buyers: [], properties: [], inspections: [], drops: [], activity: [] };
    return { contacts: raw.contacts || [], buyers: raw.buyers || [], properties: raw.properties || [], inspections: raw.inspections || [], drops: raw.drops || [], activity: raw.activity || [] };
  } catch (e) { return { contacts: [], buyers: [], properties: [], inspections: [], drops: [], activity: [] }; }
}
function updateData(mutate) {
  const d = readData(); mutate(d);
  fs.writeFileSync(dataFile(), JSON.stringify(d, null, 2));
  return d;
}

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

// Force en-AU so native <input type=date> renders dd/mm/yyyy (the app-wide format).
// --lang sets the UI/ICU locale; --accept-lang backs it up, because on a machine whose
// system locale is en-US Chromium has been known to fall back to the OS format for the
// date picker even with --lang set. Both are cheap and must run before app is ready.
app.commandLine.appendSwitch('lang', 'en-AU');
app.commandLine.appendSwitch('accept-lang', 'en-AU,en');

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
const CONTACT_HEADERS = ['id','method','outcome','first','last','address','mobile','email','callDate','stepsDone','branchDate','snoozeUntil','archived','notes'];
const BUYER_HEADERS = ['id','first','last','mobile','email','buyerType','budgetMin','budgetMax','types','bedsMin','bathsMin','carMin','landMin','suburbs','enquiries','archived','notes'];
const PROPERTY_HEADERS = ['id','status','archiveReason','address','suburb','postcode','type','price','priceType','priceMax','beds','baths','car','land','salePrice','saleDate','listingUrl','listedDate','listingMeta','notes'];
const INSPECTION_HEADERS = ['id','propertyId','date','startTime','attendees','notes','createdAt','archived'];
const DROP_HEADERS = ['id','type','address','lastDropped','intervalDays','timesDropped','archived','notes','lat','lng','geoAddr'];
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

/* Generalized per-tab read/write. Array fields (types/suburbs/enquiries) live in a
   single comma-separated cell; numeric/boolean fields are coerced back on load.
   gsLoadTab THROWS on a missing tab or API error so callers fall back to local
   data instead of mirroring an empty result over it. */
const GS_TABS = ['Contacts', 'Buyers', 'Properties', 'Inspections', 'Drops'];
const GS_ARRAY_FIELDS = { types: 1, suburbs: 1 };
const GS_JSON_FIELDS = { enquiries: 1, attendees: 1 }; // arrays of objects → stored as JSON in one cell
const GS_JSON_OBJ_FIELDS = { listingMeta: 1 }; // single objects → stored as JSON in one cell ('' when absent)
const GS_NUM_FIELDS = { stepsDone:1, budgetMin:1, budgetMax:1, bedsMin:1, bathsMin:1, carMin:1, landMin:1, price:1, priceMax:1, beds:1, baths:1, car:1, land:1, salePrice:1, intervalDays:1, timesDropped:1, lat:1, lng:1 };
const GS_BOOL_FIELDS = { archived: 1 };

/* Sync state (v6.1) — a failed sheet push used to be silent: the save returned
   {synced:false} and every caller dropped it, so the app kept saying "Syncing to Google
   Sheets" while nothing landed for days. We now remember, per collection, that the local
   file holds changes the sheet never got (`gsPending`), plus the last error, so the UI can
   say so, a retry can push them, and — importantly — a LOAD never mirrors a stale sheet
   over newer local data. Never store tokens or secrets in these fields. */
function gsMarkPending(key, err) {
  const info = gsErrInfo(err);
  updateConfig((c) => {
    c.gsPending = Object.assign({}, c.gsPending); c.gsPending[key] = true;
    c.gsLastError = info.message;
    // Sticky while anything is still pending: one dead token breaks every collection, and a
    // later network blip must not downgrade "sign in again" to a generic failure.
    c.gsNeedsReauth = !!c.gsNeedsReauth || info.needsReauth;
    c.gsLastErrorAt = Date.now();
  });
  return info;
}
function gsClearPending(key) {
  updateConfig((c) => {
    if (c.gsPending) delete c.gsPending[key];
    c.gsLastOkAt = Date.now();
    // Only declare all-clear once nothing is still waiting to go up.
    if (!c.gsPending || !Object.keys(c.gsPending).length) { c.gsLastError = ''; c.gsNeedsReauth = false; c.gsLastErrorAt = 0; }
  });
}
function gsPendingKeys() { const c = readConfig(); return Object.keys(c.gsPending || {}); }

/* Turn a googleapis error into something Declan can act on (and a needsReauth flag). */
function gsErrInfo(e) {
  const d = (e && e.response && e.response.data) || {};
  // Match on EVERY part Google might use — an expired refresh token arrives as
  // {error:'invalid_grant', error_description:'Token has been expired or revoked.'},
  // so reading error_description alone would miss the invalid_grant marker entirely.
  const errField = d.error && (typeof d.error === 'string' ? d.error : (d.error.message || d.error.status || ''));
  const parts = [d.error_description, errField, e && e.message, e && (e.code || e.status)].filter(Boolean).map(String);
  const s = String(d.error_description || errField || (e && e.message) || e);
  const low = parts.join(' | ').toLowerCase(), code = (e && (e.code || e.status)) || 0;
  if (low.indexOf('invalid_grant') > -1 || low.indexOf('invalid credentials') > -1 || low.indexOf('invalid_token') > -1 ||
      low.indexOf('expired or revoked') > -1 || low.indexOf('token has been expired') > -1 ||
      low.indexOf('unauthenticated') > -1 || code === 401)
    return { needsReauth: true, message: 'Google signed the app out — the sign-in expired or was revoked. Hit “Sign in with Google” again and your data will go straight up.' };
  if (low.indexOf('has not been used') > -1 || low.indexOf('is disabled') > -1)
    return { needsReauth: false, message: 'The Google Sheets API is switched off for this Google Cloud project. Enable it, wait a minute, then retry.' };
  if (low.indexOf('permission') > -1 || code === 403)
    return { needsReauth: false, message: 'This Google account isn’t allowed to edit that sheet (permission denied).' };
  if (low.indexOf('not found') > -1 || low.indexOf('unable to parse range') > -1 || code === 404)
    return { needsReauth: false, message: 'The linked sheet (or one of its tabs) can’t be found — it may have been deleted, renamed, or moved to another account.' };
  if (low.indexOf('timeout') > -1 || low.indexOf('etimedout') > -1 || low.indexOf('enotfound') > -1 || low.indexOf('econnreset') > -1 || low.indexOf('network') > -1)
    return { needsReauth: false, message: 'Couldn’t reach Google — no internet, or the request timed out.' };
  return { needsReauth: false, message: s };
}

async function gsLoadTab(auth, sheetId, tab) {
  const api = gsApi(auth);
  const res = await api.spreadsheets.values.get({ spreadsheetId: sheetId, range: tab + '!A:ZZ' }, GS_REQ_OPTS);
  const rows = res.data.values || [];
  if (rows.length < 2) return [];
  const hdr = rows[0].map((h) => String(h).trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v != null && v !== ''))
    .map((r) => {
      const o = {};
      hdr.forEach((h, i) => {
        const v = r[i] != null ? String(r[i]) : '';
        if (GS_ARRAY_FIELDS[h]) o[h] = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
        else if (GS_JSON_FIELDS[h]) {
          try { const j = JSON.parse(v); o[h] = Array.isArray(j) ? j : []; }
          catch (e) { o[h] = v ? v.split(',').map((s) => ({ id: s.trim(), active: true, notes: '' })).filter((x) => x.id) : []; }
        }
        else if (GS_JSON_OBJ_FIELDS[h]) {
          try { const j = JSON.parse(v); o[h] = (j && typeof j === 'object' && !Array.isArray(j)) ? j : ''; }
          catch (e) { o[h] = ''; }
        }
        else if (GS_NUM_FIELDS[h]) { const n = parseFloat(v); o[h] = Number.isFinite(n) ? n : ''; } // unparseable cell → '' (never a bogus 0 — a 0,0 lat/lng would pin off Africa)
        else if (GS_BOOL_FIELDS[h]) o[h] = v === 'true';
        else o[h] = v;
      });
      return o;
    });
}

async function gsSaveTab(auth, sheetId, tab, headers, rows) {
  const api = gsApi(auth);
  const values = [
    headers,
    ...(rows || []).map((rec) => headers.map((h) => {
      const v = rec[h];
      if (v == null) return '';
      if (GS_JSON_FIELDS[h]) return JSON.stringify(v || []);
      if (GS_JSON_OBJ_FIELDS[h]) return v ? JSON.stringify(v) : '';
      if (Array.isArray(v)) return v.join(',');
      return String(v);
    }))
  ];
  await api.spreadsheets.values.clear({ spreadsheetId: sheetId, range: tab + '!A:ZZ' }, GS_REQ_OPTS);
  await api.spreadsheets.values.update({
    spreadsheetId: sheetId, range: tab + '!A1',
    valueInputOption: 'RAW', requestBody: { values }
  }, GS_REQ_OPTS);
}

// Make sure all three tabs exist (sheets created before v0.25 only had 'Contacts').
async function ensureTabs(auth, sheetId) {
  const api = gsApi(auth);
  const meta = await api.spreadsheets.get({ spreadsheetId: sheetId }, GS_REQ_OPTS);
  const have = new Set((meta.data.sheets || []).map((s) => s.properties.title));
  const missing = GS_TABS.filter((t) => !have.has(t));
  if (missing.length) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: missing.map((t) => ({ addSheet: { properties: { title: t } } })) }
    }, GS_REQ_OPTS);
  }
}

/* ---------------- Collections: contacts / buyers / properties ----------------
   Each is a slice of the data object {contacts,buyers,properties}. Saving one slice
   never touches the others (read-modify-write via updateData). When Google Sheets is
   connected, each slice syncs to its own tab, local-first: a sync failure returns
   {ok:true, synced:false} and never loses local data. */
function makeCollectionHandlers(key, tab, headers) {
  ipcMain.handle(key + ':load', async () => {
    try {
      const cfg = readConfig();
      if (cfg.gTokens && cfg.gSheetId) {
        const auth = getAuthClient();
        if (auth) {
          // Changes that never reached the sheet must WIN. Without this, a sheet left
          // stale by days of failed pushes would be mirrored over the newer local file
          // the moment syncing started working again — silently losing that work.
          if (gsPendingKeys().indexOf(key) > -1) {
            const local = readData()[key] || [];
            try {
              await ensureTabs(auth, cfg.gSheetId);
              await gsSaveTab(auth, cfg.gSheetId, tab, headers, local);
              gsClearPending(key);            // caught up — the sheet now matches local
            } catch(e) { gsMarkPending(key, e); }
            return local;
          }
          try {
            const rows = await gsLoadTab(auth, cfg.gSheetId, tab);
            // Mirror to the local file so the app still works offline.
            try { updateData((d) => { d[key] = rows; }); }
            catch(e) { console.warn('Could not write local ' + key + ' mirror:', String(e)); }
            return rows;
          } catch(e) { /* tab missing or sync error → fall back to local */ }
        }
      }
      return readData()[key] || [];
    } catch (e) { return []; }
  });

  ipcMain.handle(key + ':save', async (_e, arr) => {
    try {
      updateData((d) => { d[key] = Array.isArray(arr) ? arr : []; });
      const cfg = readConfig();
      if (cfg.gTokens && cfg.gSheetId) {
        const auth = getAuthClient();
        if (auth) {
          try {
            await ensureTabs(auth, cfg.gSheetId);
            await gsSaveTab(auth, cfg.gSheetId, tab, headers, arr || []);
            gsClearPending(key);
            return { ok: true, synced: true };
          } catch(e) {
            const info = gsMarkPending(key, e);
            return { ok: true, synced: false, syncError: info.message, needsReauth: info.needsReauth };
          }
        }
      }
      return { ok: true };
    } catch (err) { return { ok: false, error: String(err) }; }
  });
}

makeCollectionHandlers('contacts', 'Contacts', CONTACT_HEADERS);
makeCollectionHandlers('buyers', 'Buyers', BUYER_HEADERS);
makeCollectionHandlers('properties', 'Properties', PROPERTY_HEADERS);
makeCollectionHandlers('inspections', 'Inspections', INSPECTION_HEADERS);
makeCollectionHandlers('drops', 'Drops', DROP_HEADERS);

/* The five synced collections, in one place, so syncNow can walk them. */
const GS_COLLECTIONS = [
  { key: 'contacts',    tab: 'Contacts',    headers: CONTACT_HEADERS },
  { key: 'buyers',      tab: 'Buyers',      headers: BUYER_HEADERS },
  { key: 'properties',  tab: 'Properties',  headers: PROPERTY_HEADERS },
  { key: 'inspections', tab: 'Inspections', headers: INSPECTION_HEADERS },
  { key: 'drops',       tab: 'Drops',       headers: DROP_HEADERS }
];

/* What the UI needs to tell the truth about syncing (v6.1). */
ipcMain.handle('gsheets:syncState', async () => {
  const c = readConfig();
  return {
    connected: !!(c.gTokens && c.gSheetId),
    pending: Object.keys(c.gsPending || {}),
    lastError: c.gsLastError || '',
    needsReauth: !!c.gsNeedsReauth,
    lastErrorAt: c.gsLastErrorAt || 0,
    lastOkAt: c.gsLastOkAt || 0
  };
});

/* Push every collection from the LOCAL file up to the sheet (local is the newer copy
   whenever a push has been failing). Used by the "Sync everything now" retry. */
ipcMain.handle('gsheets:syncNow', async () => {
  const cfg = readConfig();
  if (!(cfg.gTokens && cfg.gSheetId)) return { ok: false, error: 'Not connected to a Google Sheet.' };
  const auth = getAuthClient();
  if (!auth) return { ok: false, error: 'Not signed in to Google.' };
  const d = readData();
  const results = [];
  try { await ensureTabs(auth, cfg.gSheetId); }
  catch (e) {
    const info = gsErrInfo(e);
    return { ok: false, error: info.message, needsReauth: info.needsReauth };
  }
  for (const col of GS_COLLECTIONS) {
    try {
      await gsSaveTab(auth, cfg.gSheetId, col.tab, col.headers, d[col.key] || []);
      gsClearPending(col.key);
      results.push({ key: col.key, tab: col.tab, ok: true, rows: (d[col.key] || []).length });
    } catch (e) {
      const info = gsMarkPending(col.key, e);
      results.push({ key: col.key, tab: col.tab, ok: false, error: info.message, needsReauth: info.needsReauth });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return {
    ok: !failed.length, results: results,
    error: failed.length ? failed[0].error : '',
    needsReauth: failed.some((r) => r.needsReauth)
  };
});

/* Activity log — LOCAL ONLY (never synced to Google Sheets; per-machine call/SMS
   counters that power the Tracker's "This week" stats). */
ipcMain.handle('activity:load', async () => {
  try { return readData().activity || []; } catch (e) { return []; }
});
ipcMain.handle('activity:save', async (_e, arr) => {
  try { updateData((d) => { d.activity = Array.isArray(arr) ? arr : []; }); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

/* Open a .json backup file (restore is validated and applied renderer-side
   through the normal collection save paths so caches + Sheets stay in step). */
ipcMain.handle('data:openJson', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Restore from backup',
    filters: [{ name: 'JSON backup', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
  try { return { ok: true, data: JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')) }; }
  catch (e) { return { ok: false, error: String(e) }; }
});

/* ---------------- Listing preview (REA / Domain / any listing link) ----------------
   Fetches the page and reads its OpenGraph meta tags (title / image / description).
   No API keys, no scraping libs. Some sites (notably realestate.com.au) gate bots —
   then this returns ok:false and the UI just shows the plain link instead. */
function fetchPage(url, redirectsLeft) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(new Error('Bad URL')); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return reject(new Error('Not a web link'));
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-AU,en;q=0.9'
      },
      timeout: 12000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(fetchPage(new URL(res.headers.location, u).toString(), redirectsLeft - 1));
      }
      if (res.statusCode >= 400) { res.resume(); return resolve({ status: res.statusCode, body: '' }); }
      let body = '', size = 0;
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 800000) { res.destroy(); resolve({ status: res.statusCode, body }); return; }
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(new Error('Timed out')); });
    req.on('error', reject);
  });
}
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
function parseOgMeta(html) {
  const out = {};
  const tags = html.match(/<meta\s[^>]*>/gi) || [];
  for (const tag of tags) {
    const keyM = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const valM = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (!keyM || !valM) continue;
    const key = keyM[1].toLowerCase();
    if (out[key] == null) out[key] = decodeEntities(valM[1]);
  }
  const titleM = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    title: out['og:title'] || (titleM ? decodeEntities(titleM[1]).trim() : ''),
    image: out['og:image'] || out['twitter:image'] || '',
    desc: out['og:description'] || out['description'] || '',
    site: out['og:site_name'] || ''
  };
}
ipcMain.handle('listing:fetch', async (_e, url) => {
  try {
    const { status, body } = await fetchPage(String(url || ''), 4);
    if (status >= 400 || !body) return { ok: false, error: 'The site responded with ' + (status || 'nothing') + ' — it may block previews.' };
    const meta = parseOgMeta(body);
    if (!meta.title && !meta.image) return { ok: false, error: 'No preview details found on that page.' };
    meta.fetchedAt = new Date().toISOString();
    return { ok: true, meta };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

/* ---------------- Geocoding (address → lat/lng for the Drops map) ----------------
   Uses OpenStreetMap's free Nominatim service (no API key). Respects its usage policy:
   a descriptive User-Agent and one request at a time (the renderer throttles to ~1/sec).
   Returns { ok, lat, lng, displayName } or { ok:false, error }. Coordinates get cached on
   each drop record so an address is only ever looked up once. */
function geocodeAddress(query) {
  return new Promise((resolve, reject) => {
    const q = String(query || '').trim();
    if (!q) return reject(new Error('No address'));
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=' + encodeURIComponent(q);
    const req = https.get(url, {
      headers: {
        'User-Agent': 'DeclanProspectingApp/3.5 (real-estate letterbox-drop map; contact via app)',
        'Accept': 'application/json',
        'Accept-Language': 'en-AU,en;q=0.9'
      },
      timeout: 12000
    }, (res) => {
      if (res.statusCode >= 400) { res.resume(); return resolve({ status: res.statusCode, body: '' }); }
      let body = '', size = 0;
      res.setEncoding('utf8');
      res.on('data', (c) => { size += c.length; if (size > 400000) { res.destroy(); return; } body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(new Error('Timed out')); });
    req.on('error', reject);
  });
}
ipcMain.handle('geo:code', async (_e, query) => {
  try {
    const { status, body } = await geocodeAddress(query);
    if (status >= 400 || !body) return { ok: false, error: 'Lookup service responded with ' + (status || 'nothing') + '.' };
    let arr;
    try { arr = JSON.parse(body); } catch (e) { return { ok: false, error: 'Bad response from lookup service.' }; }
    if (!Array.isArray(arr) || !arr.length) return { ok: false, error: 'notfound' };
    const hit = arr[0];
    const lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
    if (isNaN(lat) || isNaN(lng)) return { ok: false, error: 'notfound' };
    return { ok: true, lat, lng, displayName: String(hit.display_name || '') };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
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
    clientId: cfg.gClientId || '',
    clientSecret: cfg.gClientSecret || '',
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
        sheets: GS_TABS.map((t) => ({ properties: { title: t } }))
      }
    }, GS_REQ_OPTS);
    const sheetId = res.data.spreadsheetId;
    const d = readData();
    await gsSaveTab(auth, sheetId, 'Contacts', CONTACT_HEADERS, Array.isArray(contacts) ? contacts : d.contacts);
    await gsSaveTab(auth, sheetId, 'Buyers', BUYER_HEADERS, d.buyers);
    await gsSaveTab(auth, sheetId, 'Properties', PROPERTY_HEADERS, d.properties);
    await gsSaveTab(auth, sheetId, 'Inspections', INSPECTION_HEADERS, d.inspections);
    await gsSaveTab(auth, sheetId, 'Drops', DROP_HEADERS, d.drops);   // was missed — a new sheet got an empty Drops tab
    updateConfig((cfg) => {
      cfg.gSheetId = sheetId; cfg.gSheetName = 'Declan Prospecting Contacts';
      // Everything local just went up, so nothing is waiting any more.
      cfg.gsPending = {}; cfg.gsLastError = ''; cfg.gsNeedsReauth = false; cfg.gsLastErrorAt = 0; cfg.gsLastOkAt = Date.now();
    });
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
    await ensureTabs(auth, sheetId);
    updateConfig((cfg) => {
      cfg.gSheetId = sheetId; cfg.gSheetName = sheetName;
      // Linking is a deliberate "adopt THIS sheet", so drop any pending-push state from a
      // previous sheet — otherwise the next load would push local data over the one just linked.
      cfg.gsPending = {}; cfg.gsLastError = ''; cfg.gsNeedsReauth = false; cfg.gsLastErrorAt = 0;
    });
    return { ok: true, sheetId, sheetName };
  } catch(e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('gsheets:disconnect', () => {
  updateConfig((cfg) => {
    delete cfg.gTokens; delete cfg.gSheetId; delete cfg.gSheetName;
    // No sheet to be behind any more — don't leave a stale warning in the UI.
    delete cfg.gsPending; cfg.gsLastError = ''; cfg.gsNeedsReauth = false; cfg.gsLastErrorAt = 0;
  });
  return { ok: true };
});

ipcMain.handle('gsheets:openSheet', (_e, url) => {
  shell.openExternal(url);
  return { ok: true };
});
