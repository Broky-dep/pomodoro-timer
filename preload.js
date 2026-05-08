const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  toggleMax: () => ipcRenderer.send('window-toggle-max'),

  saveNotes: (notes) => ipcRenderer.invoke('save-notes', notes),
  loadNotes: () => ipcRenderer.invoke('load-notes'),
  showNotification: (opts) => ipcRenderer.invoke('show-notification', opts),
});
