// 发测试事件让飞机飞起来：node src/send-test.js [scenario] [type] [message]
const http = require('http');

const [, , scenario = 'claude', type = 'auth', message = ''] = process.argv;

const payload = {
  scenario,
  type,
  message: message || '沈阳客运 · 测试横幅内容',
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
