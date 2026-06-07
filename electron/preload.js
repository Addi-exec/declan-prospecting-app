const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadContacts: () => ipcRenderer.invoke('contacts:load'),
  saveContacts: (arr) => ipcRenderer.invoke('contacts:save', arr),
  getDataLocation: () => ipcRenderer.invoke('data:getLocation'),
  setDataLocation: () => ipcRenderer.invoke('data:setLocation'),
  useDefaultDataLocation: () => ipcRenderer.invoke('data:useDefault'),
  exportExcel: (sheets, suggested) => ipcRenderer.invoke('excel:export', sheets, suggested),
  saveTextFile: (text, suggested) => ipcRenderer.invoke('file:saveText', text, suggested),
  importExcel: () => ipcRenderer.invoke('excel:import'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  gsGetStatus: () => ipcRenderer.invoke('gsheets:getStatus'),
  gsSetCredentials: (id, secret) => ipcRenderer.invoke('gsheets:setCredentials', id, secret),
  gsConnect: () => ipcRenderer.invoke('gsheets:connect'),
  gsCreateSheet: (contacts) => ipcRenderer.invoke('gsheets:createSheet', contacts),
  gsLinkSheet: (url) => ipcRenderer.invoke('gsheets:linkSheet', url),
  gsDisconnect: () => ipcRenderer.invoke('gsheets:disconnect'),
  gsOpenSheet: (url) => ipcRenderer.invoke('gsheets:openSheet', url)
});
