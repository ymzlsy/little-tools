// 副屏飞行层：超大飞机沿平滑样条路径(小角度转弯)缓缓飞过，用软绳拖着 LOGO，
// 拖一条长长的橙色半透明飞机云，无横幅。
const AIRCRAFT = { claude: '✈️', feishu: '🚁', codex: '🛩️', idle: '✈️', default: '✈️' };
const HAS_LOGO = { claude: 1, feishu: 1, codex: 1 };
const ROT_BASE = { claude: ' 45deg', codex: ' -55deg', feishu: '', idle: ' 45deg', default: ' 45deg' };

const DUR = 13000;     // 飞行时长
const ROPE_LEN = 330;  // 机尾到被拖物的绳长（横幅更长）
const TAIL_OFF = 96;   // 机身中心到机尾尖的距离（绳子系在这里）
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

  const planeEl = document.createElement('div');
  planeEl.className = 'sec-plane';
  planeEl.textContent = plane;
  planeEl.style.offsetPath = `path('${d}')`;
  planeEl.style.offsetRotate = 'auto' + (ROT_BASE[s] || ROT_BASE.default);
  if (s === 'feishu') planeEl.style.transform = 'scaleX(-1)'; // 🚁 默认朝左 → 水平翻转使机头朝前
  stage.appendChild(planeEl);

  // 被拖的东西：摸鱼督察拖横幅，普通通知拖 LOGO
  let towEl = null, ropeSvg = null, ropePath = null;
  let ropeLen = ROPE_LEN;
  if (evt.banner) {
    towEl = document.createElement('div');
    towEl.className = 'sec-banner';
    towEl.textContent = evt.banner;
    ropeLen = 460; // 横幅大，绳子放长免得压到机身
    stage.appendChild(towEl);
  } else if (HAS_LOGO[s]) {
    towEl = document.createElement('img');
    towEl.className = 'sec-logo';
    towEl.src = `../assets/logos/${s}.png`;
    stage.appendChild(towEl);
  }
  if (towEl) {
    ropeSvg = document.createElementNS(SVGNS, 'svg');
    ropeSvg.setAttribute('class', 'sec-rope-svg');
    ropeSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    ropeSvg.setAttribute('preserveAspectRatio', 'none');
    ropePath = document.createElementNS(SVGNS, 'path');
    ropePath.setAttribute('class', 'sec-rope-path');
    ropeSvg.appendChild(ropePath);
    stage.appendChild(ropeSvg);
  }

  const pAnim = planeEl.animate(
    [{ offsetDistance: '0%' }, { offsetDistance: '100%' }],
    { duration: DUR, easing: 'linear', fill: 'forwards' } // 匀速 → 转弯更顺
  );

  // 每帧：按飞行方向用软绳把 LOGO 挂在机尾；按节奏撒橙色云
  let running = true, prev = null, lastPuff = 0, ropePts = null;
  function frame(ts) {
    if (!running) return;
    const pc = center(planeEl);
    let tx = pc.x, ty = pc.y; // 机尾尖（绳子/尾焰的起点）
    if (prev) {
      let dx = pc.x - prev.x, dy = pc.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      tx = pc.x - dx * TAIL_OFF; ty = pc.y - dy * TAIL_OFF; // 沿飞行反方向退到机尾
      if (towEl) {
        const seg = ropeLen / ROPE_SEG;
        if (!ropePts) { // 初始化：沿机尾后方一字排开
          ropePts = [];
          for (let i = 0; i <= ROPE_SEG; i++) {
            const x = tx - dx * seg * i, y = ty - dy * seg * i;
            ropePts.push({ x, y, px: x, py: y });
          }
        }
        // Verlet 积分：惯性 + 重力（首点钉在机尾）
        ropePts[0].x = tx; ropePts[0].y = ty; ropePts[0].px = tx; ropePts[0].py = ty;
        for (let i = 1; i <= ROPE_SEG; i++) {
          const p = ropePts[i];
          const vx = (p.x - p.px) * ROPE_DAMP, vy = (p.y - p.py) * ROPE_DAMP;
          p.px = p.x; p.py = p.y;
          p.x += vx; p.y += vy + ROPE_GRAV; // ROPE_GRAV=0 → 整条绳无重量
        }
        // 长度约束（多次松弛收敛），首点保持钉住
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
        const end = ropePts[ROPE_SEG]; // 被拖物挂在绳子自由端 → 随之自然摆动
        towEl.style.left = end.x + 'px';
        towEl.style.top = end.y + 'px';
        ropePath.setAttribute('d', smoothPath(ropePts));
      }
    }
    prev = pc;
    if (ts - lastPuff > PUFF_MS) { lastPuff = ts; spawnPuff(tx, ty); } // 尾焰从机尾喷
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  pAnim.onfinish = () => {
    running = false;
    planeEl.remove();
    if (ropeSvg) ropeSvg.remove();
    if (towEl) towEl.remove();
    active = Math.max(0, active - 1);
    if (active === 0) setTimeout(() => { if (active === 0) window.fn.secIdle(); }, 2800);
  };
}

window.fn.onFly(fly);
