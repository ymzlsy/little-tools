#!/usr/bin/env node
/**
 * Codex notify 转发包装。
 *
 * Codex 的 notify 槽原本被 "Codex Computer Use" 占用。本包装：
 *   1) 原样把参数转发给 Computer Use（绝不影响它）
 *   2) 解析事件，任务完成时额外通知小飞机（scenario=codex, type=done）
 *
 * 在 ~/.codex/config.toml 里：
 *   notify = ["node", "/绝对路径/adapters/codex-notify.js", "turn-ended"]
 * Codex 会在末尾追加事件 JSON 作为最后一个参数。
 */
const http = require('http');
const { spawn } = require('child_process');

// 原 Computer Use 程序（保持其功能）
const ORIG = '/Users/apple/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient';

const args = process.argv.slice(2); // 例如 ["turn-ended", "<json>"]

// 1) 先转发给原 Computer Use，出错也不影响后续
try { spawn(ORIG, args, { detached: true, stdio: 'ignore' }).unref(); } catch (e) {}

// 2) 解析事件，完成则通知小飞机
try {
  const ev = JSON.parse(args[args.length - 1] || '{}');
  const t = String(ev.type || '');
  if (t.includes('turn-complete') || t.includes('turn-ended') || t === 'agent-turn-complete') {
    post({ scenario: 'codex', type: 'done', message: 'codex · 任务完成', action: { type: 'app', target: 'Codex' } });
  } else {
    process.exit(0);
  }
} catch (e) { process.exit(0); }

function post(evt) {
  const data = JSON.stringify(evt);
  const req = http.request(
    { host: '127.0.0.1', port: 47800, path: '/notify', method: 'POST', timeout: 800,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    (r) => { r.resume(); r.on('end', () => process.exit(0)); }
  );
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.write(data);
  req.end();
}
