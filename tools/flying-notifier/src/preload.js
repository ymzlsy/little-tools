const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fn', {
  onNotify: (cb) => ipcRenderer.on('notify', (_e, evt) => cb(evt)),
  setIdle: () => ipcRenderer.send('overlay-idle'),
  setInteractive: (on) => ipcRenderer.send('set-interactive', on),
  jump: (action) => ipcRenderer.send('jump', action),
});
