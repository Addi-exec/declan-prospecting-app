const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { autoUpdater } = require('electron-updater');

let mainWin = null;
let manualCheck = false; // true when the user clicked "Check for updates"

const DATA_FILENAME = 'prospecting-data.json';
function configFile() { return path.join(app.getPath('userData'), 'app-config.json'); }
function readConfig() { try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')) || {}; } catch (e) { return {}; }
}
function writeConfig(cfg) { try { fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2)); return true; } catch (e) { return false; } }
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

app.whenReady().then(() => {
  createWindow();
  wireAutoUpdate();
  // Auto-update via GitHub Releases. Silent on launch; only acts if an update is found.
  // No-ops cleanly in dev (not packaged) and if no release/repo is reachable.
  if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
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
  if (!app.isPackaged) return { ok: false, dev: true };
  manualCheck = true;
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (e) { manualCheck = false; return { ok: false, error: String(e) }; }
});

/* ---------------- Contacts: load / save (local database) ---------------- */
ipcMain.handle('contacts:load', async () => {
  try {
    const p = dataFile();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8') || '[]');
  } catch (e) { return []; }
});

ipcMain.handle('contacts:save', async (_e, arr) => {
  try { fs.writeFileSync(dataFile(), JSON.stringify(arr, null, 2)); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
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
    const cfg = readConfig(); cfg.dataDir = newDir; writeConfig(cfg);
    return { ok: true, path: newFile, dir: newDir, adopted };
  } catch (err) { return { ok: false, error: String(err) }; }
});

// Go back to this computer's default location (copies the data back if needed).
ipcMain.handle('data:useDefault', async () => {
  const oldFile = dataFile();
  try {
    const cfg = readConfig(); delete cfg.dataDir; writeConfig(cfg);
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
