const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(html, /font-family:VT323,PixFB,monospace/);
assert.match(html, /font-family:PixFB/);
assert.match(html, /class="glitch-title"/);
assert.match(html, /pixelTitleJitter/);
assert.match(html, /new WebSocket\(u\)/);
assert.match(server, /WebSocketServer/);
assert.match(server, /path: '\/ws'/);
assert.match(server, /m\.t === 'host'/);
assert.match(server, /m\.t === 'join'/);
assert.equal(pkg.scripts.start, 'node server.js');
console.log('Backrooms Online checks passed.');
