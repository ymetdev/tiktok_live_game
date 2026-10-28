// RED vs BLUE server: static files, SSE hub, ingest API, match/progression API (Postgres).  Zero framework, Node 22.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connect, migrate } from './db.js';
import { Hub } from './hub.js';
import { Game, HttpError } from './game.js';
import { Simulator } from '../adapters/simulator.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.wasm': 'application/wasm' };
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function createApp({ databaseUrl = process.env.DATABASE_URL, operatorToken = process.env.OPERATOR_TOKEN, channelToken = process.env.CHANNEL_TOKEN, log = console.log } = {}) {
  const pool = connect(databaseUrl); await migrate(pool);
  const hub = new Hub(), game = new Game(pool, hub), sims = new Map();
  if (!operatorToken) { operatorToken = crypto.randomBytes(16).toString('hex'); log(`OPERATOR_TOKEN not set — generated for this run: ${operatorToken}`); }
  if (!channelToken) { channelToken = crypto.randomBytes(16).toString('hex'); log(`CHANNEL_TOKEN not set — generated for this run: ${channelToken}`); }
  await pool.query('INSERT INTO channels (id, name, token_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash', ['main', 'Main channel', sha(channelToken)]);
  const hb = setInterval(() => hub.heartbeat(), 20000); hb.unref?.();

  const channelAuth = async (req, url) => { // channel token: header x-channel-token (adapters, game page)
    const tok = req.headers['x-channel-token'] || url.searchParams.get('token') || '';
    const r = (await pool.query('SELECT id FROM channels WHERE token_hash = $1', [sha(tok)])).rows[0];
    if (!r) throw new HttpError(401, 'Missing or invalid channel token'); return r.id;
  };
  const operatorAuth = (req) => { if (!safeEq(req.headers['x-operator-token'] || '', operatorToken)) throw new HttpError(401, 'Missing or invalid operator token'); };
  const readBody = (req) => new Promise((resolve, reject) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) { reject(new HttpError(413, 'Body too large')); req.destroy(); } }); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new HttpError(400, 'Invalid JSON')); } }); });
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1), m = req.method, body = m === 'GET' ? {} : await readBody(req), ch = url.searchParams.get('channel') || 'main';
    // ---- public read ----
    if (parts[0] === 'stream' && m === 'GET') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.write('retry: 2000\n\n'); hub.add(ch, res); return; }
    if (parts[0] === 'leaderboard' && m === 'GET') return send(res, 200, await game.leaderboard(+url.searchParams.get('limit') || 20));
    if (parts[0] === 'players' && parts[1] && m === 'GET') return send(res, 200, await game.profile(decodeURIComponent(parts[1])));
    if (parts[0] === 'config' && m === 'GET') return send(res, 200, { name: 'RED vs BLUE', channel: 'main' });
    // ---- operator ----
    if (parts[0] === 'operator') {
      operatorAuth(req);
      if (parts[1] === 'channel-token' && m === 'GET') return send(res, 200, { channel: 'main', token: channelToken });
      if (parts[1] === 'session' && parts[2] === 'end' && m === 'POST') { sims.get(ch)?.stop(); await game.endSession(ch); return send(res, 200, { ok: true }); }
      if (parts[1] === 'season' && m === 'POST') return send(res, 200, { season: await game.newSeason(ch) });
      if (parts[1] === 'phase' && m === 'POST') return send(res, 200, game.setPhase(ch, body.phase));
      if (parts[1] === 'sim') {
        let sim = sims.get(ch); if (!sim) { sim = new Simulator((evs) => game.ingest(ch, evs)); sims.set(ch, sim); }
        if (m === 'GET') return send(res, 200, sim.status());
        return send(res, 200, await sim.command(body));
      }
      throw new HttpError(404, 'Not found');
    }
    // ---- channel-token endpoints (adapters + game page) ----
    const channel = await channelAuth(req, url);
    if (parts[0] === 'ingest' && m === 'POST') return send(res, 200, await game.ingest(channel, Array.isArray(body) ? body : body.events));
    if (parts[0] === 'state' && m === 'GET') return send(res, 200, await game.snapshot(channel));
    if (parts[0] === 'match' && parts[1] === 'start' && m === 'POST') return send(res, 200, await game.matchStart(channel, body.seed));
    if (parts[0] === 'match' && parts[1] === 'commit' && m === 'POST') return send(res, 200, await game.matchCommit(channel, { matchId: body.matchId, result: body.result }));
    if (parts[0] === 'post' && parts[1] === 'close' && m === 'POST') return send(res, 200, game.postClose(channel));
    if (parts[0] === 'post' && parts[1] === 'next' && m === 'POST') return send(res, 200, game.postNext(channel));
    if (parts[0] === 'phase' && m === 'POST') return send(res, 200, game.setPhase(channel, body.phase));
    throw new HttpError(404, 'Not found');
  }

  function serveStatic(req, res, url) {
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
    const base = p.startsWith('/shared/') ? root : p.startsWith('/config/') ? root : path.join(root, 'public'), file = path.normalize(path.join(base, p));
    if (!file.startsWith(base + path.sep) && file !== base) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      const ext = path.extname(file).toLowerCase(); res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.glb' || ext === '.png' ? 'public, max-age=86400' : 'no-cache' }); res.end(buf);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      serveStatic(req, res, url);
    } catch (e) {
      if (res.headersSent) return res.end();
      const code = e instanceof HttpError ? e.code : e.code === '23505' ? 409 : 500; if (code === 500) console.error(e);
      send(res, code, { error: code === 500 ? 'Server error' : e.message });
    }
  });
  const close = async () => { clearInterval(hb); for (const s of sims.values()) s.stop(); await new Promise((r) => { server.close(r); server.closeAllConnections?.(); }); await pool.end(); };
  return { server, pool, game, hub, sims, operatorToken, channelToken, close };
}

// run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3000, app = await createApp();
  app.server.listen(port, () => console.log(`RED vs BLUE running at http://localhost:${port}  (game: /game.html?token=<CHANNEL_TOKEN>, operator: /operator.html)`));
}
