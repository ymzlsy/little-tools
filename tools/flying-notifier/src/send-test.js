// 发测试事件让飞机飞起来：
//   node src/send-test.js [scenario] [type] [message] [actionTarget]
// actionTarget 可选：是网址(http/含 ://)→点击打开网址；是路径→点击打开目录/文件
const http = require('http');

const [, , scenario = 'claude', type = 'auth', message = '', actionTarget] = process.argv;

let action;
if (actionTarget) {
  action = /^https?:|:\/\//.test(actionTarget)
    ? { type: 'url', target: actionTarget }
    : { type: 'open', target: actionTarget };
} else if (scenario === 'feishu') {
  action = { type: 'app', target: 'Lark' }; // 飞书默认点击激活 Lark
}

const payload = {
  scenario,
  type,
  message: message || '沈阳客运 · 测试横幅内容',
  ...(action ? { action } : {}),
};

const data = JSON.stringify(payload);
const req = http.request(
  { host: '127.0.0.1', port: 47800, path: '/notify', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
  (res) => {
    let b = '';
    res.on('data', (c) => (b += c));
    res.on('end', () => console.log('sent:', payload, '->', b));
  }
);
req.on('error', (e) => console.error('发送失败（程序在跑吗？）:', e.message));
req.write(data);
req.end();
