#!/usr/bin/env node
// Bridge: TikTok LIVE  ->  POST /api/ingest of the game server.  Run on the streamer's own PC (own IP, fewer blocks):
//   npm run bridge -- --user @yourname --server https://your-app.onrender.com --token <CHANNEL_TOKEN>
// (or env TIKTOK_USER / SERVER_URL / CHANNEL_TOKEN, optional EULER_SIGN_API_KEY)
import { connectTikTok } from './tiktok-live-connector.js';

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const user = (arg('user') || process.env.TIKTOK_USER || '').replace(/^@/, ''), server = (arg('server') || process.env.SERVER_URL || 'http://localhost:3000').replace(/\/$/, ''), token = arg('token') || process.env.CHANNEL_TOKEN;
if (!user || !token) { console.error('Usage: bridge --user @name --server URL --token CHANNEL_TOKEN'); process.exit(1); }

let buf = [], inflight = false, dropped = 0;
async function flush() {
  if (inflight || !buf.length) return; inflight = true; const batch = buf.splice(0, 200);
  try { const r = await fetch(`${server}/api/ingest`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-channel-token': token }, body: JSON.stringify(batch) }); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { if (buf.length < 5000) buf.unshift(...batch); else dropped += batch.length; console.error(`[bridge] send failed (${e.message}); ${buf.length} queued, ${dropped} dropped`); }
  inflight = false;
}
setInterval(flush, 300);
const push = (e) => { buf.push(e); if (buf.length > 5000) { buf.shift(); dropped++; } };

let handle, stopping = false;
async function run(attempt = 0) {
  try { handle = await connectTikTok({ user, signApiKey: process.env.EULER_SIGN_API_KEY, onEvent: push, onStatus: (s) => { console.log('[tiktok]', s); if (s === 'disconnected' && !stopping) setTimeout(() => run(0), 5000); } }); }
  catch (e) { const wait = Math.min(60000, 3000 * 2 ** attempt); console.error(`[bridge] connect failed: ${e.message} — retry in ${wait / 1000}s`); setTimeout(() => run(attempt + 1), wait); }
}
process.on('SIGINT', () => { stopping = true; handle?.stop(); flush().finally(() => process.exit(0)); });
console.log(`[bridge] @${user} -> ${server}`); run();
