// emoji 机型（朝向已用截图实测校正，见 style.css 的 .p-* 旋转）
const AIRCRAFT = {
  claude: '✈️', // 战斗机（主力）
  feishu: '🚁', // 直升机
  codex: '🛩️',  // 客机
  default: '✈️',
};

// 类型 → 横幅样式类 + 中文标签
const TYPE = {
  auth:    { cls: 't-auth',    label: '需授权' },
  confirm: { cls: 't-confirm', label: '需确认' },
  stuck:   { cls: 't-stuck',   label: '卡住/等待' },
  done:    { cls: 't-done',    label: '已完成' },
  default: { cls: '',          label: '通知' },
};

const SCENE_LABEL = { claude: 'Claude Code', feishu: '飞书', codex: 'codex' };

const DEFAULT_TIMING = { cross: 8000, exit: 900 };

// 多航道布局
const LANE_TOP = 24;      // 第一条距屏幕顶部
const LANE_H = 74;        // 每条航道高度（含间隔）
const PAD_BOTTOM = 18;
const RIGHT_GAP = 6;      // 停靠时机头距右边缘留白，贴边但不被切

const stage = document.getElementById('stage');
const flights = new Map(); // laneIndex -> flight 对象（始终紧凑排列 0..n-1）
const waitQueue = [];      // 放不下时排队，不让任务掉到屏幕外

// 航道数按主屏高度封顶（留一行给"还有N个"角标）
const MAX_LANES = Math.max(1, Math.min(8,
  Math.floor((screen.availHeight - LANE_TOP - PAD_BOTTOM - 42) / LANE_H)));

function laneTop(lane) { return LANE_TOP + lane * LANE_H; }
function neededHeight() { return LANE_TOP + flights.size * LANE_H + PAD_BOTTOM + (waitQueue.length ? 30 : 0); }

function updateRect(f) {
  if (!f.parked) return;
  const top = laneTop(f.lane);
  f.rect = { left: f.restX, right: f.restX + f.w, top, bottom: top + f.h };
}

// 处理掉一条后，剩下的全部紧凑上移补位
function reflow() {
  const arr = [...flights.values()].sort((a, b) => a.lane - b.lane);
  flights.clear();
  arr.forEach((f, i) => {
    f.lane = i;
    flights.set(i, f);
    if (f.el) {
      f.el.style.transition = 'top .35s cubic-bezier(.22,.61,.36,1)';
      f.el.style.top = laneTop(i) + 'px';
      updateRect(f);
    }
  });
}

// 屏上角标：还有多少未处理任务在排队（屏幕外不再藏东西）
let badgeEl = null;
function updateBadge() {
  if (waitQueue.length > 0) {
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.className = 'more-badge';
      stage.appendChild(badgeEl);
    }
    badgeEl.textContent = `还有 ${waitQueue.length} 个未处理 ↓`;
    badgeEl.style.top = (laneTop(flights.size) + 2) + 'px';
    badgeEl.style.display = 'block';
  } else if (badgeEl) {
    badgeEl.style.display = 'none';
  }
}

// ---- 合成喷气飞过音效（无需音频文件）----
let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playJet() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const dur = 2.8;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.5, now + dur * 0.45);
  master.gain.exponentialRampToValueAtTime(0.28, now + dur * 0.7);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(360, now);
  bp.frequency.linearRampToValueAtTime(1500, now + dur * 0.45);
  bp.frequency.linearRampToValueAtTime(680, now + dur);
  const nGain = ctx.createGain(); nGain.gain.value = 0.85;
  noise.connect(bp); bp.connect(nGain); nGain.connect(master);
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(250, now);
  osc.frequency.linearRampToValueAtTime(620, now + dur * 0.45);
  osc.frequency.linearRampToValueAtTime(350, now + dur);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  const oGain = ctx.createGain(); oGain.gain.value = 0.12;
  osc.connect(lp); lp.connect(oGain); oGain.connect(master);
  noise.start(now); osc.start(now); noise.stop(now + dur); osc.stop(now + dur);
}

// ---- 鼠标命中：只在有飞机停留时处理，多架则逐一判定 ----
let interactiveNow = false;
function setInteractive(on) {
  if (on !== interactiveNow) { interactiveNow = on; window.fn.setInteractive(on); }
}
function onMouseMove(e) {
  let overAny = false;
  for (const f of flights.values()) {
    if (!f.parked) continue;
    const r = f.rect;
    const inside = e.clientX >= r.left && e.clientX <= r.right &&
                   e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside) { f.entered = true; overAny = true; }
    else if (f.entered) { flyAway(f); }   // 移上去之后又离开 → 飞走
  }
  setInteractive(overAny);
}

function flyAway(f) {
  if (f.leaving) return;
  f.leaving = true;
  f.parked = false;
  const ex = f.el.animate(
    [{ transform: `translate3d(${f.restX}px,0,0)` }, { transform: `translate3d(${f.W}px,0,0)` }],
    { duration: DEFAULT_TIMING.exit, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
  );
  ex.onfinish = () => {
    f.el.remove();
    flights.delete(f.lane);
    reflow(); // 剩下的紧凑上移补位
    // 有空位就把排队的下一个拉进来（飞入最底一条）
    if (waitQueue.length && flights.size < MAX_LANES) {
      const next = waitQueue.shift();
      spawn(next);
    }
    updateBadge();
    if (flights.size === 0 && waitQueue.length === 0) { setInteractive(false); window.fn.setIdle(); }
    else window.fn.setHeight(neededHeight());
  };
}

function spawn(evt) {
  const lane = flights.size; // 紧凑排列：新机挂在最底一条
  const f = { lane, parked: false, entered: false, leaving: false,
              sessionId: evt.sessionId, type: evt.type, action: evt.action };
  flights.set(lane, f);
  window.fn.setHeight(neededHeight());
  requestAnimationFrame(() => animate(f, evt));
}

function enqueue(evt) {
  if (flights.size >= MAX_LANES) { // 放不下 → 排队 + 屏上提示，绝不掉到屏幕外
    waitQueue.push(evt);
    updateBadge();
    return;
  }
  spawn(evt);
}

function animate(f, evt) {
  const scenario = evt.scenario || 'default';
  const typ = TYPE[evt.type] || TYPE.default;
  const plane = AIRCRAFT[scenario] || AIRCRAFT.default;
  const title = evt.title || typ.label;
  const msg = evt.message || '';
  const hasLogo = SCENE_LABEL[scenario] !== undefined;

  const el = document.createElement('div');
  el.className = 'flight';
  el.style.top = (LANE_TOP + f.lane * LANE_H) + 'px';
  el.innerHTML = `
    ${hasLogo ? `<img class="logo" src="../assets/logos/${scenario}.png" alt="">` : ''}
    <div class="banner ${typ.cls}"><div class="b-title"></div>${msg ? '<div class="b-msg"></div>' : ''}</div>
    <div class="rope"></div>
    <div class="plane p-${scenario}">${plane}</div>`;
  el.querySelector('.b-title').textContent = title;
  if (msg) el.querySelector('.b-msg').textContent = msg;
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => {
    if (f.action) window.fn.jump(f.action);
    if (f.sessionId) window.fn.opened(f.sessionId); // 点开即视为已处理，取消后续提醒
    // 不立即飞走；光标离开后才飞走
  });
  stage.appendChild(el);
  f.el = el;

  requestAnimationFrame(() => {
    const w = el.offsetWidth;
    const W = window.innerWidth;
    const restX = W - w - RIGHT_GAP; // 停靠位：机头距右缘留白
    f.W = W; f.restX = restX;
    playJet();
    const enter = el.animate(
      [{ transform: `translate3d(${-w}px,0,0)` }, { transform: `translate3d(${restX}px,0,0)` }],
      { duration: DEFAULT_TIMING.cross, easing: 'linear', fill: 'forwards' }
    );
    enter.onfinish = () => {
      f.w = el.offsetWidth; f.h = el.offsetHeight;
      f.parked = true;
      f.entered = false;
      updateRect(f);
      updateBadge();
    };
  });
}

window.addEventListener('mousemove', onMouseMove);
window.fn.onNotify(enqueue);
