// 自绘 SVG 机型（暂不用，保留机制供以后扩展）
const AIRCRAFT_IMG = {};

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

const SCENE_LABEL = {
  claude: 'Claude Code',
  feishu: '飞书',
  codex: 'codex',
};

const DEFAULT_TIMING = { cross: 8000, exit: 900 };

const stage = document.getElementById('stage');
const queue = [];
let busy = false;

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
  // 音量包络：由远及近渐强 → 掠过 → 远去
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.5, now + dur * 0.45);
  master.gain.exponentialRampToValueAtTime(0.28, now + dur * 0.7);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  // 1) 宽频轰鸣：白噪声过带通，频率扫动模拟多普勒
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(360, now);
  bp.frequency.linearRampToValueAtTime(1500, now + dur * 0.45);
  bp.frequency.linearRampToValueAtTime(680, now + dur);
  const nGain = ctx.createGain();
  nGain.gain.value = 0.85;
  noise.connect(bp); bp.connect(nGain); nGain.connect(master);

  // 2) 涡轮啸叫：锯齿波同样做多普勒扫频
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(250, now);
  osc.frequency.linearRampToValueAtTime(620, now + dur * 0.45);
  osc.frequency.linearRampToValueAtTime(350, now + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  const oGain = ctx.createGain();
  oGain.gain.value = 0.12;
  osc.connect(lp); lp.connect(oGain); oGain.connect(master);

  noise.start(now); osc.start(now);
  noise.stop(now + dur); osc.stop(now + dur);
}

// 当前停在右侧、等待"悬停再移开"才飞走的飞行
let parked = null; // { rect, entered, dismiss }

// 只在「有飞机停住等你挥手」时才监听鼠标，平时不挂全局监听，省掉整天的空耗
function onMouseMove(e) {
  if (!parked) return;
  const r = parked.rect;
  const inside =
    e.clientX >= r.left && e.clientX <= r.right &&
    e.clientY >= r.top && e.clientY <= r.bottom;
  if (inside) {
    parked.entered = true; // 光标移上去了
    // 移到飞机/横幅上 → 临时关掉鼠标穿透，使其可点击
    if (!parked.interactive) { parked.interactive = true; window.fn.setInteractive(true); }
  } else {
    // 离开 → 恢复穿透
    if (parked.interactive) { parked.interactive = false; window.fn.setInteractive(false); }
    if (parked.entered) {
      const p = parked;
      parked = null;
      window.removeEventListener('mousemove', onMouseMove);
      p.dismiss();
    }
  }
}

// 关掉当前停留的飞机（点击跳转后或挥手后调用）
function clearParked() {
  if (!parked) return;
  const p = parked;
  parked = null;
  window.removeEventListener('mousemove', onMouseMove);
  if (p.interactive) window.fn.setInteractive(false);
  p.dismiss();
}

function enqueue(evt) {
  queue.push(evt);
  pump();
}

function pump() {
  if (busy) return;
  if (queue.length === 0) {
    // 队列清空且无飞机停留 → 通知主进程销毁窗口，回到休眠
    if (!parked) window.fn.setIdle();
    return;
  }
  busy = true;
  play(queue.shift()).then(() => {
    busy = false;
    pump();
  });
}

function play(evt) {
  return new Promise((resolve) => {
    const scenario = evt.scenario || 'default';
    const typ = TYPE[evt.type] || TYPE.default;
    const planeImg = AIRCRAFT_IMG[scenario];
    const planeHtml = planeImg
      ? `<img class="plane-img" src="${planeImg}" alt="">`
      : `<div class="plane p-${scenario}">${AIRCRAFT[scenario] || AIRCRAFT.default}</div>`;
    const timing = { ...DEFAULT_TIMING, ...(evt.timing || {}) };

    // 场景不用文字，用左侧 LOGO 表示
    const title = evt.title || typ.label;
    const msg = evt.message || '';
    const hasLogo = SCENE_LABEL[scenario] !== undefined;

    const flight = document.createElement('div');
    flight.className = 'flight';
    flight.innerHTML = `
      ${hasLogo ? `<img class="logo" src="../assets/logos/${scenario}.png" alt="">` : ''}
      <div class="banner ${typ.cls}">
        <div class="b-title"></div>
        ${msg ? '<div class="b-msg"></div>' : ''}
      </div>
      <div class="rope"></div>
      ${planeHtml}
    `;
    flight.querySelector('.b-title').textContent = title;
    if (msg) flight.querySelector('.b-msg').textContent = msg;

    // 点击横幅/飞机 → 跳转到对应场景，然后飞走
    flight.style.cursor = 'pointer';
    flight.addEventListener('click', () => {
      if (evt.action) window.fn.jump(evt.action);
      clearParked();
    });

    stage.appendChild(flight);

    requestAnimationFrame(() => {
      const w = flight.offsetWidth;
      const W = window.innerWidth;
      const restX = W - w; // 停在右侧：整体右缘贴屏幕右边

      playJet(); // 飞过音效

      // 阶段一：从左飞入，停在右侧（保持不动）
      const enter = flight.animate(
        [
          { transform: `translateX(${-w}px)` },
          { transform: `translateX(${restX}px)` },
        ],
        { duration: timing.cross, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' }
      );

      enter.onfinish = () => {
        // 阶段二：停住，直到"光标移上去再移开"才飞走
        const dismiss = () => {
          const exit = flight.animate(
            [
              { transform: `translateX(${restX}px)` },
              { transform: `translateX(${W}px)` },
            ],
            { duration: timing.exit, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
          );
          exit.onfinish = () => {
            flight.remove();
            resolve();
          };
        };
        parked = { rect: flight.getBoundingClientRect(), entered: false, interactive: false, dismiss };
        window.addEventListener('mousemove', onMouseMove); // 仅停留期间监听鼠标
      };
    });
  });
}

window.fn.onNotify(enqueue);
