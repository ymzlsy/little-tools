#!/usr/bin/env node
/**
 * 飞书会议提醒轮询器。
 *
 * 每分钟拉一次飞书日程(lark-cli calendar +agenda)，对每个会议在开始前
 * 20 分钟、5 分钟各提醒一次(去重)，POST 给小飞机(scenario=feishu)。
 * 点击横幅打开该会议(app_link)。
 *
 * 由独立 LaunchAgent 经登录 shell 启动，以继承 lark-cli 的 PATH 与鉴权。
 */
const http = require('http');
const { execFile } = require('child_process');

const MARKS = (process.env.FN_MEET_MARKS || '20,5').split(',').map(Number).sort((a, b) => b - a);
const POLL_MS = Number(process.env.FN_MEET_POLL_MS) || 60 * 1000;
const fired = new Set();

function nextLowerMark(m) {
  const lower = MARKS.filter((x) => x < m);
  return lower.length ? Math.max(...lower) : 0;
}

function getAgenda(cb) {
  if (process.env.FN_MEET_MOCK) {
    try { cb(JSON.parse(process.env.FN_MEET_MOCK)); } catch (e) { cb(null); }
    return;
  }
  execFile('lark-cli', ['calendar', '+agenda', '--json'],
    { timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
    (err, stdout) => {
      if (err) return cb(null);
      try { cb(JSON.parse(stdout)); } catch (e) { cb(null); }
    });
}

function tick() {
  getAgenda((d) => {
    if (!d || !Array.isArray(d.data)) return;
    const now = Date.now();
    for (const e of d.data) {
      const dt = e.start_time && e.start_time.datetime;
      if (!dt) continue; // 跳过全天/无具体时间
      const start = Date.parse(dt);
      if (isNaN(start)) continue;
      const mins = (start - now) / 60000;
      if (mins <= 0) continue; // 已开始
      for (const m of MARKS) {
        const key = e.event_id + '@' + m;
        if (mins <= m && mins > nextLowerMark(m) && !fired.has(key)) {
          fired.add(key);
          post({
            scenario: 'feishu',
            type: 'confirm',
            message: `${e.summary || '会议'} · ${Math.max(1, Math.round(mins))}分钟后开始`,
            action: e.app_link ? { type: 'url', target: e.app_link } : undefined,
          });
        }
      }
    }
  });
}

function post(evt) {
  const data = JSON.stringify(evt);
  const req = http.request(
    { host: '127.0.0.1', port: 47800, path: '/notify', method: 'POST', timeout: 1500,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    (r) => r.resume()
  );
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.write(data);
  req.end();
}

tick();
setInterval(tick, POLL_MS);
console.log('[feishu-poller] started, marks =', MARKS.join('/'), 'min');
