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
  checkForUpdates: () => ipcRenderer.invoke('update:check')
});
