#!/usr/bin/env node
/**
 * 状态栏 tee：从 stdin 读取 Claude Code 状态栏负载，把其中的 rate_limits（5h/周额度）
 * 原样存到 flying-notifier-app/ratelimits.json，供"摸鱼督察"横幅读取。
 * 只读不改，绝不影响状态栏渲染（由包装脚本另起一路喂给 claude-hud）。
 */
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(input || '{}');
    if (d && d.rate_limits) {
      const out = path.join(__dirname, '..', 'ratelimits.json');
      fs.writeFileSync(out, JSON.stringify({ rate_limits: d.rate_limits, at: Date.now() }));
    }
  } catch (e) { /* 忽略，绝不影响状态栏 */ }
});
