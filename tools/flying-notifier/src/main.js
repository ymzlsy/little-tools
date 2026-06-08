const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 47800; // 本地事件接口端口

// 通知动画极轻（单元素平移），软件合成足够，关掉 GPU 进程省内存/电
app.disableHardwareAcceleration();

// ---- 覆盖层窗口：按需创建、空闲销毁，平时完全不占渲染资源 ----
let win = null;
let ready = false;
let pending = []; // 窗口加载完成前暂存的事件

function applyOverlayFlags(w) {
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.setIgnoreMouseEvents(true, { forward: true });
}

function ensureOverlay() {
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.showInactive();
    return;
  }
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
  win = new BrowserWindow({
    x, y, width, height,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  applyOverlayFlags(win);
  ready = false;
  win.webContents.once('did-finish-load', () => {
    ready = true;
    win.showInactive(); // 显示但不抢焦点
    const q = pending;
    pending = [];
    q.forEach((e) => win.webContents.send('notify', e));
  });
  win.loadFile(path.join(__dirname, 'overlay.html'));
}

function deliver(evt) {
  ensureOverlay();
  if (ready && win && !win.isDestroyed()) win.webContents.send('notify', evt);
  else pending.push(evt);
}

function destroyOverlay() {
  ready = false;
  pending = [];
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

// 渲染层在「队列清空、无停留飞机」时通知主进程销毁窗口，回到休眠
ipcMain.on('overlay-idle', () => destroyOverlay());

// 光标移到飞机上 → 临时关穿透使其可点击；离开 → 恢复穿透
ipcMain.on('set-interactive', (_e, on) => {
  if (!win || win.isDestroyed()) return;
  if (on) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

// 点击横幅/飞机 → 跳转到对应场景位置
ipcMain.on('jump', (_e, action) => {
  if (!action || !action.target) return;
  try {
    switch (action.type) {
      case 'url':                       // 网址 / 应用深链（如 lark://…）
        shell.openExternal(action.target); break;
      case 'reveal':                    // 在访达中定位文件/目录
        shell.showItemInFolder(action.target); break;
      case 'app':                       // 激活某个 App（open -a）
        spawn('open', ['-a', action.target]); break;
      case 'exec':                      // 自定义命令（如 code <dir> / cursor <dir>）
        spawn(action.target, action.args || [], { detached: true, stdio: 'ignore' }).unref(); break;
      case 'open':                      // 打开文件/目录（默认程序）
      default:
        shell.openPath(action.target);
    }
  } catch (e) { /* 跳转失败不影响通知器 */ }
});

// ---- 本地事件服务：任何适配器 POST 到这里 ----
function startEventServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/notify') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let evt;
        try { evt = JSON.parse(body || '{}'); }
        catch (e) { res.writeHead(400); return res.end('bad json'); }
        deliver(evt);
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
  if (app.dock) app.dock.hide();
  startEventServer();
  // 注意：不在启动时创建覆盖层，第一条通知到来才拉起
});

app.on('window-all-closed', () => {}); // 后台常驻，无窗口也不退出
