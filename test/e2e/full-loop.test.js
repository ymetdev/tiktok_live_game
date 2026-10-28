// End-to-end: real server + Postgres + headless Chromium running the game page at 12x speed with 40 simulated viewers.
// Needs TEST_DATABASE_URL and Playwright (PLAYWRIGHT_MODULE=/path/to/node_modules, default: the sandbox global). Software GL = correctness only, NOT performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createApp } from '../../server/index.js';

const DB = process.env.TEST_DATABASE_URL; let chromium;
try { chromium = createRequire((process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules') + '/')('playwright').chromium; } catch { /* skipped below */ }

test('40 viewers: lobby -> fight -> result -> cutscenes -> DB progression, gifts applied once', { skip: !DB || !chromium, timeout: 300000 }, async () => {
  const app = await createApp({ databaseUrl: DB, log: () => {}, operatorToken: 'op', channelToken: 'ch' });
  await app.pool.query('TRUNCATE gift_events, match_players, matches, session_players, live_sessions, players CASCADE');
  await new Promise((r) => app.server.listen(0, r)); const base = `http://localhost:${app.server.address().port}`;
  const sim = (body) => fetch(`${base}/api/operator/sim`, { method: 'POST', headers: { 'x-operator-token': 'op', 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const pg = await browser.newPage({ viewport: { width: 540, height: 960 } }), errors = []; pg.on('pageerror', (e) => errors.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await pg.goto(`${base}/game.html?token=ch&speed=12`); await pg.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    assert.equal((await sim({ action: 'spawn', count: 40 })).accepted, 40);
    await sim({ action: 'duplicate' }); // same event twice => counted once
    await pg.waitForFunction(() => window.__phase === 'fight', null, { timeout: 60000 });
    await sim({ action: 'gifts', count: 4, diamonds: 400 });
    await pg.waitForFunction(() => (window.__rounds || 0) >= 1, null, { timeout: 240000, polling: 500 });
    assert.deepEqual(errors, []);
    assert.ok((await pg.evaluate(() => window.__cutscenes)) >= 1, 'gift receivers get a cutscene');
    const g = (await app.pool.query("SELECT status, COUNT(*)::int AS n FROM gift_events GROUP BY 1")).rows; assert.ok(g.every((r) => r.status === 'applied'), JSON.stringify(g));
    assert.equal((await app.pool.query("SELECT COUNT(*)::int AS n FROM gift_events WHERE gift_name = 'Rose'")).rows[0].n, 1, 'duplicate gift event counted once');
    assert.ok((await app.pool.query('SELECT COUNT(*)::int AS n FROM players WHERE aura_tier > 0')).rows[0].n >= 1);
    assert.ok((await app.pool.query('SELECT COUNT(*)::int AS n FROM players WHERE level > 1 OR exp > 0')).rows[0].n >= 30, 'EXP committed for participants');
  } finally { await browser.close(); await app.close(); }
});
