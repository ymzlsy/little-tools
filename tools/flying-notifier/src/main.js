const { app, BrowserWindow, screen } = require('electron');
const http = require('http');
const path = require('path');

const PORT = 47800; // 本地事件接口端口

let win = null;

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    // 关键：盖在所有应用上层
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', // 允许无交互播放合成音效
    },
  });

  // 置顶到最高层级 + 在所有桌面/全屏空间可见
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 鼠标全程穿透（forward:true 让窗口仍能收到移动事件以便将来扩展）
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, 'overlay.html'));
}

// 本地事件服务：任何适配器（Claude Code hook / 飞书 / codex）POST 到这里
function startEventServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/notify') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let evt;
        try {
          evt = JSON.parse(body || '{}');
        } catch (e) {
          res.writeHead(400);
          return res.end('bad json');
        }
        if (win && !win.isDestroyed()) {
          win.webContents.send('notify', evt);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[flying-notifier] event server on http://127.0.0.1:${PORT}/notify`);
  });
}

app.whenReady().then(() => {
  // 不在 Dock 显示，纯后台常驻
  if (app.dock) app.dock.hide();
  createOverlay();
  startEventServer();
});

// 后台常驻：所有窗口关闭也不退出
app.on('window-all-closed', () => {});
