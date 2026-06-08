#!/usr/bin/env node
/**
 * Claude Code hook 适配器
 *
 * 在 ~/.claude/settings.json 里把本文件挂到 Notification / Stop 两个 hook 上：
 *   Notification → 需授权 / 卡住等待
 *   Stop         → 已完成
 *
 * Claude Code 会把事件 JSON 从 stdin 传进来（含 hook_event_name / cwd / message 等），
 * 本适配器解析后 POST 给本地通知器（:47800）。
 *
 * 设计要点：绝不阻塞 Claude——通知器没开、超时、出错，一律静默退出 0。
 */
const http = require('http');
const path = require('path');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let h = {};
  try { h = JSON.parse(input || '{}'); } catch (e) { process.exit(0); }

  const ev = h.hook_event_name || '';
  const project = path.basename(h.cwd || process.cwd() || '') || 'Claude';

  let type, detail;
  if (ev === 'Stop' || ev === 'SubagentStop') {
    type = 'done';
    detail = '任务已完成';
  } else if (ev === 'Notification') {
    const m = String(h.message || '').toLowerCase();
    if (m.includes('permission') || m.includes('授权') || m.includes('approve')) {
      type = 'auth';
      detail = h.message || '需要授权';
    } else {
      type = 'stuck';
      detail = h.message || '等待你的输入';
    }
  } else {
    process.exit(0); // 其它 hook 不处理
  }

  send({ scenario: 'claude', type, message: `${project} · ${detail}` });
});

function send(evt) {
  const data = JSON.stringify(evt);
  const req = http.request(
    {
      host: '127.0.0.1', port: 47800, path: '/notify', method: 'POST', timeout: 800,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    },
    (res) => { res.resume(); res.on('end', () => process.exit(0)); }
  );
  req.on('error', () => process.exit(0));   // 通知器没开也不阻塞 Claude
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.write(data);
  req.end();
}
