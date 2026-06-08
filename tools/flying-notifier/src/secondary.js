// 副屏飞行层：飞机 + LOGO 沿不规则路径转几圈飞过，带飞机云拖尾，无横幅。
const AIRCRAFT = { claude: '✈️', feishu: '🚁', codex: '🛩️', default: '✈️' };
const HAS_LOGO = { claude: 1, feishu: 1, codex: 1 };
// 各 emoji 默认朝向不同，offset-rotate 在切线基础上加这个角度让机头朝前
const ROT_BASE = { claude: ' 45deg', codex: ' 35deg', feishu: '', default: ' 45deg' };

const stage = document.getElementById('stage');
let active = 0;

// 生成横跨屏幕、含 2 个回环的不规则路径
function buildPath(W, H) {
  const N = 4;
  const xs = [], ys = [];
  for (let i = 0; i <= N; i++) {
    xs.push(Math.round(-0.12 * W + 1.24 * W * (i / N)));
    ys.push(Math.round(H * (0.28 + Math.random() * 0.44)));
  }
  let d = `M ${xs[0]} ${ys[0]}`;
  const r = Math.round(H * 0.09); // 回环半径
  for (let i = 1; i <= N; i++) {
    const cx = Math.round((xs[i - 1] + xs[i]) / 2);
    d += ` C ${cx} ${ys[i - 1]}, ${cx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
    if (i === 2 || i === 3) {
      const dir = i === 2 ? 1 : 0; // 两个环方向相反，更"乱"
      d += ` a ${r} ${r} 0 1 ${dir} 0 ${2 * r} a ${r} ${r} 0 1 ${dir} 0 ${-2 * r}`;
    }
  }
  return d;
}

function spawnPuff(x, y) {
  const p = document.createElement('div');
  p.className = 'puff';
  const s = 14 + Math.random() * 16;
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
  const DUR = 6500;

  const planeEl = document.createElement('div');
  planeEl.className = 'sec-plane';
  planeEl.textContent = plane;
  planeEl.style.offsetPath = `path('${d}')`;
  planeEl.style.offsetRotate = 'auto' + (ROT_BASE[s] || ROT_BASE.default);
  stage.appendChild(planeEl);

  let logoEl = null;
  if (HAS_LOGO[s]) {
    logoEl = document.createElement('img');
    logoEl.className = 'sec-logo';
    logoEl.src = `../assets/logos/${s}.png`;
    logoEl.style.offsetPath = `path('${d}')`;
    logoEl.style.offsetRotate = '0deg'; // LOGO 始终正立
    stage.appendChild(logoEl);
  }

  const pAnim = planeEl.animate(
    [{ offsetDistance: '0%' }, { offsetDistance: '100%' }],
    { duration: DUR, easing: 'ease-in-out', fill: 'forwards' }
  );
  if (logoEl) {
    logoEl.animate(
      [{ offsetDistance: '0%' }, { offsetDistance: '100%' }],
      { duration: DUR, easing: 'ease-in-out', fill: 'forwards', delay: 200 } // 略滞后，跟在机尾
    );
  }

  // 拖尾：周期性在机身位置撒云
  let spawning = true;
  function tick() {
    if (!spawning) return;
    const r = planeEl.getBoundingClientRect();
    spawnPuff(r.left + r.width / 2, r.top + r.height / 2);
    setTimeout(() => requestAnimationFrame(tick), 55);
  }
  requestAnimationFrame(tick);

  pAnim.onfinish = () => {
    spawning = false;
    planeEl.remove();
    if (logoEl) setTimeout(() => logoEl.remove(), 260);
    active = Math.max(0, active - 1);
    if (active === 0) setTimeout(() => { if (active === 0) window.fn.secIdle(); }, 1400); // 等云散尽再休眠
  };
}

window.fn.onFly(fly);
