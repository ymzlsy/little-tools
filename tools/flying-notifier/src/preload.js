const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fn', {
  onNotify: (cb) => ipcRenderer.on('notify', (_e, evt) => cb(evt)),
});
