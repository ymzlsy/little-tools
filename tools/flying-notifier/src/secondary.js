// 副屏飞行层：超大飞机沿平滑样条路径(小角度转弯)缓缓飞过，用软绳拖着 LOGO，
// 拖一条长长的橙色半透明飞机云，无横幅。
const AIRCRAFT = { claude: '✈️', feishu: '🚁', codex: '🛩️', idle: '✈️', default: '✈️' };
const HAS_LOGO = { claude: 1, feishu: 1, codex: 1 };
const ROT_BASE = { claude: ' 45deg', codex: ' -55deg', feishu: '', idle: ' 45deg', default: ' 45deg' };

const DUR = 13000;     // 飞行时长
const ROPE_LEN = 330;  // 机尾到被拖物的绳长（横幅更长）
const ROPE_SAG = 0.5;  // 下垂量占绳长比例（越大越软）
const TAIL_OFF = 96;   // 机身中心到机尾尖的距离（绳子系在这里）
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
  let running = true, prev = null, lastPuff = 0;
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
        const lx = tx - dx * ropeLen, ly = ty - dy * ropeLen; // 被拖物在机尾后方
        towEl.style.left = lx + 'px';
        towEl.style.top = ly + 'px';
        // 软绳：三次贝塞尔，两控制点向下拉 → 悬链线式自然深垂；起点=机尾尖
        const sag = ropeLen * ROPE_SAG;
        const rdx = lx - tx, rdy = ly - ty;
        const c1x = tx + rdx / 3, c1y = ty + rdy / 3 + sag;
        const c2x = tx + rdx * 2 / 3, c2y = ty + rdy * 2 / 3 + sag;
        ropePath.setAttribute('d',
          `M ${tx.toFixed(0)} ${ty.toFixed(0)} C ${c1x.toFixed(0)} ${c1y.toFixed(0)}, ${c2x.toFixed(0)} ${c2y.toFixed(0)}, ${lx.toFixed(0)} ${ly.toFixed(0)}`);
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
