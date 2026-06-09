const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// 即时落盘的调试日志（FN_DEBUG=1 时开启；console.log 在 launchd 下被块缓冲不可靠）
function dbg(...a) {
  if (!process.env.FN_DEBUG) return;
  try { fs.appendFileSync('/tmp/fn-main.log', new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch (e) {}
}

const PORT = 47800; // 本地事件接口端口

// 单实例锁：已有一个在跑时，第二个直接退出，绝不再抢端口崩溃
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// 注：曾关闭硬件加速省内存，但全屏透明窗口上软件合成动画会卡，故保留 GPU 加速。
// 空闲时窗口销毁，GPU 进程随之闲置，活跃期多占约 40MB 换取流畅，值得。

// ---- 覆盖层窗口：按需创建、空闲销毁，平时完全不占渲染资源 ----
let win = null;
let ready = false;
let pending = []; // 窗口加载完成前暂存的事件

function applyOverlayFlags(w) {
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.setIgnoreMouseEvents(true, { forward: true });
}

// 每次显示都重新强制最高层级 + 顶到最前（防止被后聚焦的 App 盖住）
function raise(w) {
  if (!w || w.isDestroyed()) return;
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.showInactive();
  w.moveTop();
}

function ensureOverlay() {
  if (win && !win.isDestroyed()) {
    raise(win);
    return;
  }
  // 固定显示在主屏（带菜单栏的那块）。
  // 只用顶部一条窄带，而不是整屏——大幅减少透明层合成开销，动画更顺。
  const b = screen.getPrimaryDisplay().bounds;
  const BAND_H = 120; // 只够飞机本身——透明层是软件合成，面积越小越流畅
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: BAND_H,
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
    raise(win); // 显示并强制置顶（不抢焦点）
    const q = pending;
    pending = [];
    q.forEach((e) => win.webContents.send('notify', e));
  });
  win.loadFile(path.join(__dirname, 'overlay.html'));
}

function deliverToOverlay(evt) {
  dbg('SHOW', evt.type, evt.sessionId || '');
  ensureOverlay();
  if (ready && win && !win.isDestroyed()) win.webContents.send('notify', evt);
  else pending.push(evt);
  deliverSecondary(evt); // 副屏同步飞一架（转圈+拖尾，无横幅）
}

// ---- 副屏飞行层：每块副屏一个全屏覆盖窗，按需创建、飞完销毁 ----
const secWins = new Map(); // displayId -> { win, ready, pending }

function secondaryDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().filter((d) => d.id !== primaryId);
}

function ensureSecOverlay(d) {
  let s = secWins.get(d.id);
  if (s && s.win && !s.win.isDestroyed()) { raise(s.win); return s; }
  const b = d.bounds;
  const w = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    show: false, transparent: true, frame: false, hasShadow: false,
    resizable: false, movable: false, focusable: false, skipTaskbar: true,
    fullscreenable: false, alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false,
    },
  });
  applyOverlayFlags(w);
  s = { win: w, ready: false, pending: [] };
  w.webContents.once('did-finish-load', () => {
    s.ready = true;
    raise(w);
    s.pending.splice(0).forEach((e) => w.webContents.send('fly', e));
  });
  w.loadFile(path.join(__dirname, 'secondary.html'));
  secWins.set(d.id, s);
  return s;
}

function deliverSecondary(evt) {
  for (const d of secondaryDisplays()) {
    const s = ensureSecOverlay(d);
    if (s.ready && s.win && !s.win.isDestroyed()) s.win.webContents.send('fly', evt);
    else s.pending.push(evt);
  }
}

// 副屏飞行结束（无在飞）→ 销毁该副屏窗
ipcMain.on('sec-idle', (e) => {
  for (const [id, s] of secWins) {
    if (s.win && !s.win.isDestroyed() && s.win.webContents === e.sender) {
      s.win.destroy();
      secWins.delete(id);
      break;
    }
  }
});

// ---- 「已完成」延迟提醒调度：完成后 5/10 分钟若仍未回到该会话才弹 ----
const REMIND_1_MS = Number(process.env.FN_REMIND1_MS) || 5 * 60 * 1000;
const REMIND_2_MS = Number(process.env.FN_REMIND2_MS) || 10 * 60 * 1000;
const schedulers = new Map(); // sessionId -> [timeoutId,...]

function cancelScheduler(sid) {
  const t = schedulers.get(sid);
  if (t) { t.forEach(clearTimeout); schedulers.delete(sid); dbg('CANCEL', sid); }
}
function scheduleDone(evt) {
  const sid = evt.sessionId || `anon-${schedulers.size}-${evt.message || ''}`;
  cancelScheduler(sid); // 同一会话再次完成 → 重置计时
  const fire = (n) => () => { dbg('FIRE#' + n, sid); deliverToOverlay(evt); };
  schedulers.set(sid, [setTimeout(fire(1), REMIND_1_MS), setTimeout(fire(2), REMIND_2_MS)]);
  dbg('SCHEDULE', sid, REMIND_1_MS, REMIND_2_MS);
}

// HTTP 收到事件后的路由
function deliver(evt) {
  lastActivity = Date.now(); // 任何事件 = 有活动
  lastNag = 0;
  dbg('RECV', evt.type, evt.sessionId || '');
  if (evt.type === 'active') { cancelScheduler(evt.sessionId); return; } // UserPromptSubmit：只更新活跃度，不弹
  deliverToOverlay(evt);                                                 // 全部即时弹（含已完成）
}

// ---- 摸鱼督察：超过 1 小时无任何活动 → 每 20 分钟在副屏飞一架带横幅来挖苦 ----
const IDLE_MS = Number(process.env.FN_IDLE_MS) || 60 * 60 * 1000;   // 1 小时
const NAG_EVERY_MS = Number(process.env.FN_NAG_MS) || 20 * 60 * 1000; // 20 分钟
let lastActivity = Date.now();
let lastNag = 0;

const NAG_TEMPLATES = [
  '🏆「连续摸鱼 {h} 小时」成就解锁',
  '已 {h} 小时未写一行代码，势头很猛',
  '恭喜达成今日目标：摸鱼 {h} 小时 ✅',
  '{h} 小时 0 提交，GitHub 草都枯了',
  'Claude 在线等你召唤，已苦等 {h} 小时',
  '划水 {h} 小时，这把人生赢家',
  '{h} 小时没营业，老板的刀已出鞘',
  '再不 Coding，飞机都替你尴尬了',
  '今日 KPI：发呆 {h} 小时，超额完成',
  '{h} 小时未 Coding，梦想又远了一点',
];
function makeNagText() {
  const h = Math.max(1, Math.floor((Date.now() - lastActivity) / 3600000));
  const t = NAG_TEMPLATES[Math.floor(Math.random() * NAG_TEMPLATES.length)];
  return t.replace('{h}', h);
}

setInterval(() => {
  const now = Date.now();
  if (now - lastActivity > IDLE_MS && now - lastNag >= NAG_EVERY_MS) {
    lastNag = now;
    const text = makeNagText();
    dbg('NAG', text);
    deliverSecondary({ scenario: 'idle', banner: text }); // 仅副屏，带横幅
  }
}, Number(process.env.FN_CHECK_MS) || 60 * 1000);

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

// 渲染层按当前停靠航道数请求窗口高度（多架堆叠时变高，否则保持窄带）
ipcMain.on('set-height', (_e, h) => {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const want = Math.max(120, Math.round(h || 120));
  if (b.height !== want) win.setBounds({ x: b.x, y: b.y, width: b.width, height: want });
});

// 点开了对应会话（点击飞机/回到会话）→ 取消该会话后续提醒
ipcMain.on('opened', (_e, sid) => cancelScheduler(sid));

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
  server.on('error', (e) => {
    console.error('[flying-notifier] event server error:', e.message); // 端口占用等也不崩溃
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
