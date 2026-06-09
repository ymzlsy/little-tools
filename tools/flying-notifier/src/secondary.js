// 副屏飞行层：超大飞机沿平滑样条路径(小角度转弯)缓缓飞过，用软绳拖着 LOGO，
// 拖一条长长的橙色半透明飞机云，无横幅。
const AIRCRAFT = { claude: '✈️', feishu: '🚁', codex: '🛩️', idle: '✈️', default: '✈️' };
const HAS_LOGO = { claude: 1, feishu: 1, codex: 1 };
const TYPE = {
  auth:    { cls: 't-auth',    label: '需授权' },
  confirm: { cls: 't-confirm', label: '需确认' },
  stuck:   { cls: 't-stuck',   label: '卡住/等待' },
  done:    { cls: 't-done',    label: '已完成' },
  default: { cls: '',          label: '通知' },
};
const ROT_BASE = { claude: ' 45deg', codex: ' -55deg', feishu: '', idle: ' 45deg', default: ' 45deg' };

const DUR = 13000;     // 飞行时长
const ROPE_LEN = 330;  // 机尾到被拖物的绳长（横幅更长）
// 机身中心到机尾的距离（绳子系在这里），按机型不同
const TAIL_OFF = { claude: 96, codex: 96, feishu: 64, idle: 96, default: 96 };
// 软绳物理（Verlet）：质点数 / 每帧重力 / 阻尼(越接近1越飘越爱摆)
const ROPE_SEG = 9;
const ROPE_GRAV = 0;     // 无重量 → 不下垂，像飘带顺着飞机轨迹拖在身后
const ROPE_DAMP = 0.9;   // 适度惯性 → 紧贴轨迹平滑跟随、转弯顺滑

// 经质点拟合一条平滑曲线(Catmull-Rom)
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
const PUFF_MS = 75;    // 撒云间隔
const SVGNS = 'http://www.w3.org/2000/svg';

const stage = document.getElementById('stage');
let active = 0;

// 平滑样条路径（Catmull-Rom→Bezier，切线连续，无急转）；纵向限步长 → 小角度转弯
function buildPath(W, H) {
  const N = 7;
  const pts = [];
  let y = H * (0.3 + Math.random() * 0.4);
  for (let i = 0; i <= N; i++) {
    const x = -0.08 * W + 1.16 * W * (i / N);
    pts.push([x, y]);
    y += (Math.random() - 0.5) * 0.42 * H;            // 每步纵向变化有限 → 缓坡
    y = Math.max(H * 0.14, Math.min(H * 0.86, y));     // 限制在屏幕范围内
  }
  let d = `M ${pts[0][0].toFixed(0)} ${pts[0][1].toFixed(0)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(0)} ${c1y.toFixed(0)}, ${c2x.toFixed(0)} ${c2y.toFixed(0)}, ${p2[0].toFixed(0)} ${p2[1].toFixed(0)}`;
  }
  return d;
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function spawnPuff(x, y) {
  const p = document.createElement('div');
  p.className = 'puff';
  const s = 28 + Math.random() * 34;
  p.style.width = s + 'px';
  p.style.height = s + 'px';
  p.style.left = x + 'px';
  p.style.top = y + 'px';
  stage.appendChild(p);
  p.addEventListener('animationend', () => p.remove());
}

function fly(evt) {
  active++;
  const s = evt.scenario || 'default';
  const plane = AIRCRAFT[s] || AIRCRAFT.default;
  const W = window.innerWidth, H = window.innerHeight;
  const d = buildPath(W, H);
  const tailOff = TAIL_OFF[s] != null ? TAIL_OFF[s] : TAIL_OFF.default;

  const planeEl = document.createElement('div');
  planeEl.className = 'sec-plane';
  planeEl.textContent = plane;
  planeEl.style.offsetPath = `path('${d}')`;
  planeEl.style.offsetRotate = 'auto' + (ROT_BASE[s] || ROT_BASE.default);
  if (s === 'feishu') planeEl.style.transform = 'scaleX(-1)'; // 🚁 默认朝左 → 水平翻转使机头朝前
  stage.appendChild(planeEl);

  // 被拖的横幅：三种场景都带横幅（含 LOGO + 任务内容，按类型配色）；摸鱼督察是讽刺横幅
  let ropeLen = 400;
  const towEl = document.createElement('div');
  towEl.className = 'sec-banner';
  if (evt.banner) {
    towEl.classList.add('t-nag');
    towEl.textContent = evt.banner;
    ropeLen = 460;
  } else {
    const typ = TYPE[evt.type] || TYPE.default;
    if (typ.cls) towEl.classList.add(typ.cls);
    const logo = HAS_LOGO[s] ? `<img class="sec-banner-logo" src="../assets/logos/${s}.png" alt="">` : '';
    towEl.innerHTML = `${logo}<span class="sec-banner-txt"></span>`;
    towEl.querySelector('.sec-banner-txt').textContent = evt.message || typ.label;
  }
  stage.appendChild(towEl);

  const ropeSvg = document.createElementNS(SVGNS, 'svg');
  ropeSvg.setAttribute('class', 'sec-rope-svg');
  ropeSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  ropeSvg.setAttribute('preserveAspectRatio', 'none');
  const ropePath = document.createElementNS(SVGNS, 'path');
  ropePath.setAttribute('class', 'sec-rope-path');
  ropeSvg.appendChild(ropePath);
  stage.appendChild(ropeSvg);

  const pAnim = planeEl.animate(
    [{ offsetDistance: '0%' }, { offsetDistance: '100%' }],
    { duration: DUR, easing: 'linear', fill: 'forwards' } // 匀速 → 转弯更顺
  );

  // 每帧：软绳把横幅挂在机尾随轨迹摆动；飞机出屏后继续拖横幅出屏
  let running = true, prev = null, lastPuff = 0, ropePts = null;
  let exiting = false, vtail = null, exitVel = { x: 0, y: 0 }, lastVel = { x: 1, y: 0 }, exitFrames = 0;
  const seg = ropeLen / ROPE_SEG;

  function stepRope(tx, ty) {
    if (!ropePts) {
      const l = Math.hypot(lastVel.x, lastVel.y) || 1;
      ropePts = [];
      for (let i = 0; i <= ROPE_SEG; i++) {
        const x = tx - (lastVel.x / l) * seg * i, y = ty - (lastVel.y / l) * seg * i;
        ropePts.push({ x, y, px: x, py: y });
      }
    }
    ropePts[0].x = tx; ropePts[0].y = ty; ropePts[0].px = tx; ropePts[0].py = ty;
    for (let i = 1; i <= ROPE_SEG; i++) {
      const p = ropePts[i];
      const vx = (p.x - p.px) * ROPE_DAMP, vy = (p.y - p.py) * ROPE_DAMP;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + ROPE_GRAV;
    }
    for (let it = 0; it < 8; it++) {
      ropePts[0].x = tx; ropePts[0].y = ty;
      for (let i = 0; i < ROPE_SEG; i++) {
        const a = ropePts[i], b = ropePts[i + 1];
        let ddx = b.x - a.x, ddy = b.y - a.y;
        const dd = Math.hypot(ddx, ddy) || 0.0001;
        const diff = ((dd - seg) / dd) * 0.5;
        const ox = ddx * diff, oy = ddy * diff;
        if (i !== 0) { a.x += ox; a.y += oy; }
        b.x -= ox; b.y -= oy;
      }
    }
    const end = ropePts[ROPE_SEG];
    towEl.style.left = end.x + 'px';
    towEl.style.top = end.y + 'px';
    ropePath.setAttribute('d', smoothPath(ropePts));
    return end;
  }

  function cleanup() {
    running = false;
    planeEl.remove();
    if (ropeSvg) ropeSvg.remove();
    if (towEl) towEl.remove();
    active = Math.max(0, active - 1);
    if (active === 0) setTimeout(() => { if (active === 0) window.fn.secIdle(); }, 800);
  }

  function frame(ts) {
    if (!running) return;
    const W = window.innerWidth, H = window.innerHeight;
    if (!exiting) {
      const pc = center(planeEl);
      if (prev) {
        const dx = pc.x - prev.x, dy = pc.y - prev.y;
        lastVel = { x: dx, y: dy };
        const len = Math.hypot(dx, dy) || 1;
        const tx = pc.x - (dx / len) * tailOff, ty = pc.y - (dy / len) * tailOff;
        stepRope(tx, ty);
        if (ts - lastPuff > PUFF_MS) { lastPuff = ts; spawnPuff(tx, ty); }
      }
      prev = pc;
    } else {
      // 拖尾出屏：飞机已飞出，继续沿原速把机尾推向屏外，把横幅也拖出去
      vtail.x += exitVel.x; vtail.y += exitVel.y;
      const end = stepRope(vtail.x, vtail.y);
      exitFrames++;
      const bw = towEl.offsetWidth, bh = towEl.offsetHeight;
      const off = (end.x - bw > W) || (end.x < 0) || (end.y - bh / 2 > H) || (end.y + bh / 2 < 0);
      if (off || exitFrames > 600) { cleanup(); return; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  pAnim.onfinish = () => {
    // 飞机走完路径(已出屏) → 进入拖尾出屏阶段，继续把横幅拖出，别提前删
    const pc = center(planeEl);
    const l = Math.hypot(lastVel.x, lastVel.y) || 1;
    const sp = Math.max(8, l); // 出屏速度，至少 8px/帧
    exitVel = { x: lastVel.x / l * sp, y: lastVel.y / l * sp };
    vtail = { x: pc.x - lastVel.x / l * tailOff, y: pc.y - lastVel.y / l * tailOff };
    planeEl.remove(); // 飞机已出屏，先移除；绳+横幅继续拖出
    exiting = true;
  };
}

window.fn.onFly(fly);
