const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map();
const clients = new Set();

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function roster(room) {
  return [...room.players.entries()].map(([id, p]) => ({ id, n: p.n, c: p.c }));
}
function broadcast(room, data, except = null) {
  for (const p of room.players.values()) if (p.ws !== except) send(p.ws, data);
}
function updateRoster(room) {
  const list = roster(room);
  broadcast(room, { t: 'roster', list });
}
function cleanName(value) {
  return String(value || 'Player').replace(/[^\p{L}\p{N} _.\-!?]/gu, '').trim().slice(0, 14) || 'Player';
}
function cleanColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : '#e2d17d';
}
function makeCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  return code;
}
function removePlayer(ws) {
  const info = ws.roomInfo;
  if (!info) return;
  ws.roomInfo = null;
  const room = rooms.get(info.code);
  if (!room) return;
  room.players.delete(info.id);
  if (info.id === 0) {
    broadcast(room, { t: 'closed' });
    for (const p of room.players.values()) {
      p.ws.roomInfo = null;
      try { p.ws.close(); } catch {}
    }
    rooms.delete(info.code);
    return;
  }
  if (room.players.size === 0) rooms.delete(info.code);
  else updateRoster(room);
}

function handleMessage(ws, raw) {
  if (raw.length > 4096) return;
  let m;
  try { m = JSON.parse(raw.toString()); } catch { return; }
  if (!m || typeof m.t !== 'string') return;

  if (m.t === 'host') {
    if (ws.roomInfo) return;
    const code = makeCode();
    const room = { code, players: new Map(), started: false };
    room.players.set(0, { ws, n: cleanName(m.n), c: cleanColor(m.c) });
    rooms.set(code, room);
    ws.roomInfo = { code, id: 0 };
    send(ws, { t: 'hosted', code, id: 0 });
    updateRoster(room);
    return;
  }

  if (m.t === 'join') {
    if (ws.roomInfo) return;
    const code = String(m.code || '');
    const room = rooms.get(code);
    if (!/^\d{4}$/.test(code) || !room) return send(ws, { t: 'err', m: 'Room not found. Check the 4 digit code.' });
    if (room.started) return send(ws, { t: 'err', m: 'That game has already started.' });
    if (room.players.size >= 4) return send(ws, { t: 'err', m: 'That room is full (4 players maximum).' });
    let id = 1;
    while (room.players.has(id)) id++;
    room.players.set(id, { ws, n: cleanName(m.n), c: cleanColor(m.c) });
    ws.roomInfo = { code, id };
    send(ws, { t: 'joined', code, id });
    updateRoster(room);
    return;
  }

  const info = ws.roomInfo;
  if (!info) return;
  const room = rooms.get(info.code);
  if (!room || !room.players.has(info.id)) return;

  if (m.t === 'start') {
    if (info.id !== 0 || room.started) return;
    const seed = Number(m.seed);
    const cfg = m.cfg && typeof m.cfg === 'object' ? {
      mz: clampInt(m.cfg.mz, 0, 8), sz: clampInt(m.cfg.sz, 0, 8), coin: clampInt(m.cfg.coin, 0, 8)
    } : { mz: 0, sz: 0, coin: 0 };
    if (!Number.isFinite(seed)) return;
    room.started = true;
    broadcast(room, { t: 'start', seed: seed >>> 0, cfg, mode: m.mode === 'race' ? 'race' : 'coop' });
    return;
  }
  if (m.t === 'p') {
    const x = Number(m.x), y = Number(m.y), r = Number(m.r), c = Number(m.c) || 0;
    if (![x, y, r, c].every(Number.isFinite)) return;
    broadcast(room, { t: 'p', id: info.id, x, y, r, c }, ws);
    return;
  }
  if (m.t === 'shot') {
    if (![m.x, m.y, m.dx, m.dz, m.d].every(v => Number.isFinite(Number(v)))) return;
    broadcast(room, { t: 'shot', id: info.id, x: +m.x, y: +m.y, dx: +m.dx, dz: +m.dz, d: Math.max(1, Math.min(120, +m.d)) }, ws);
    return;
  }
  if (m.t === 'ev') {
    if (m.e !== 'dead' && m.e !== 'win') return;
    broadcast(room, { t: 'ev', id: info.id, e: m.e }, ws);
    return;
  }
  if (m.t === 'admin') {
    if (info.id !== 0) return;
    const to = Number(m.to);
    const target = room.players.get(to);
    if (target) send(target.ws, { t: 'admin', type: clampInt(m.type, 0, 2), name: cleanName(m.name) });
  }
}
function clampInt(v, min, max) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : min;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  // Lightweight endpoint for hosting-provider health checks.
  const pathnameRaw = (req.url || '/').split('?')[0];
  if (pathnameRaw === '/health' || pathnameRaw === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(pathnameRaw);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(PUBLIC, '.' + requested);
  if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', ws => {
  clients.add(ws);
  ws.on('message', raw => handleMessage(ws, raw));
  ws.on('close', () => { clients.delete(ws); removePlayer(ws); });
  ws.on('error', () => { clients.delete(ws); removePlayer(ws); });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Backrooms Online server listening on port ${PORT}`));
