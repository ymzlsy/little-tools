const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fn', {
  onNotify: (cb) => ipcRenderer.on('notify', (_e, evt) => cb(evt)),
  setIdle: () => ipcRenderer.send('overlay-idle'),
  setInteractive: (on) => ipcRenderer.send('set-interactive', on),
  setHeight: (h) => ipcRenderer.send('set-height', h),
  jump: (action) => ipcRenderer.send('jump', action),
  opened: (sessionId) => ipcRenderer.send('opened', sessionId),
  // 副屏飞行层
  onFly: (cb) => ipcRenderer.on('fly', (_e, evt) => cb(evt)),
  secIdle: () => ipcRenderer.send('sec-idle'),
});
