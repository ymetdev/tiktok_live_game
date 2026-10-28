// Integration tests against a real Postgres.  TEST_DATABASE_URL=$(tools/dev-postgres.sh start) npm run test:api
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server/index.js';
import { Match } from '../../shared/sim/match.js';
import { BALANCE } from '../../config/balance.js';

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && 'set TEST_DATABASE_URL (tools/dev-postgres.sh start)';

test('ingest → team/class commands → match → commit → gifts → post-match queue', { skip }, async (t) => {
  const app = await createApp({ databaseUrl: URL_, operatorToken: 'op', channelToken: 'tok', log: () => {} });
  await app.pool.query('TRUNCATE gift_events, match_players, matches, session_players, live_sessions, players RESTART IDENTITY CASCADE');
  await new Promise((r) => app.server.listen(0, r)); const base = `http://localhost:${app.server.address().port}`;
  t.after(() => app.close());
  const call = async (method, path, body, headers = { 'x-channel-token': 'tok' }) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
  const chat = (i, text) => ({ id: `c${i}${text}`, type: 'chat', userId: `u${i}`, nickname: `User${i}`, text });

  assert.equal((await call('POST', '/api/ingest', [], {})).status, 401, 'ingest needs a token');
  assert.equal((await call('POST', '/api/ingest', [chat(1, 'x')], { 'x-channel-token': 'nope' })).status, 401);

  // 12 viewers join: 6 red, 6 blue (Thai + English commands); junk is ignored
  const joins = Array.from({ length: 12 }, (_, i) => chat(i + 1, i % 2 ? 'น้ำเงิน' : 'red'));
  const ing = await call('POST', '/api/ingest', [...joins, chat(99, 'สวัสดีครับ'), { type: 'bogus' }]);
  assert.equal(ing.body.accepted, 13); assert.equal(ing.body.rejected.length, 1);
  assert.equal((await call('POST', '/api/ingest', [joins[0]])).body.duplicates, 1, 'same event id is ignored');

  // a gift arrives BEFORE the match; it must not change stats during the match
  assert.equal((await call('POST', '/api/ingest', [{ id: 'g1', type: 'gift', userId: 'u1', nickname: 'User1', giftName: 'Galaxy', diamonds: 1000 }])).body.accepted, 1);
  assert.equal((await call('POST', '/api/ingest', [{ id: 'g1', type: 'gift', userId: 'u1', diamonds: 1000 }])).body.duplicates, 1, 'gift dedupe');
  assert.equal((await call('POST', '/api/ingest', [{ id: 'g2', type: 'gift', userId: 'u2', diamonds: 500, streakEnd: false }])).body.accepted, 1);
  const prof0 = (await call('GET', '/api/players/u1', null, {})).body; assert.equal(prof0.bonusPct, 0);

  const start = (await call('POST', '/api/match/start', { seed: 5 })).body; assert.equal(start.roster.length, 12); assert.equal((await call('GET', '/api/state')).body.phase, 'fight');
  // class commands are refused mid-match and for low levels
  await call('POST', '/api/ingest', [chat(1, '1')]); assert.equal((await call('GET', '/api/players/u1', null, {})).body.cls, 'novice');

  const m = new Match({ seed: 5, players: start.roster.map((r) => ({ userId: r.userId, name: r.nickname, team: r.team, level: r.level, cls: r.cls, bonusPct: r.bonusPct })), events: false }), result = m.runToEnd();
  const c1 = await call('POST', '/api/match/commit', { matchId: start.matchId, result }); assert.equal(c1.status, 200);
  assert.equal(c1.body.roster.length, 12); assert.ok(c1.body.roster.every((r) => r.expGain >= BALANCE.exp.participation));
  const after = (await call('GET', '/api/players/u1', null, {})).body;
  assert.equal(after.auraPoints, 1000); assert.equal(after.auraTier, 2); assert.equal(after.bonusPct, 5, 'gift applied after the match');
  assert.equal((await call('GET', '/api/players/u2', null, {})).body.auraPoints, 0, 'unfinished gift streak gives nothing');
  const again = await call('POST', '/api/match/commit', { matchId: start.matchId, result }); assert.deepEqual(again.body.roster, c1.body.roster, 'commit is idempotent');
  assert.equal((await call('GET', '/api/players/u1', null, {})).body.matches, 1, 'no double apply');
  assert.equal(c1.body.queueSize, 1, 'only the gifter needs a cutscene');

  // post phase: level a viewer to 10 directly, then pick a class inside the window and after the queue closed
  await app.pool.query("UPDATE players SET level = 10 WHERE user_id IN ('u3','u4')");
  await call('POST', '/api/ingest', [chat(3, '๓')]);
  assert.equal((await call('GET', '/api/players/u3', null, {})).body.cls, 'mage');
  assert.deepEqual(await call('POST', '/api/post/close').then((r) => r.body), { size: 2 });
  await call('POST', '/api/ingest', [chat(4, '2')]); // too late for this round's cutscene, but the class is already active
  assert.equal((await call('GET', '/api/players/u4', null, {})).body.cls, 'archer');
  const e1 = (await call('POST', '/api/post/next')).body; assert.equal(e1.entry.userId, 'u1'); assert.ok(e1.entry.reasons.includes('gift'));
  const e2 = (await call('POST', '/api/post/next')).body; assert.equal(e2.entry.userId, 'u3'); assert.ok(e2.entry.reasons.includes('class'));
  assert.equal((await call('POST', '/api/post/next')).body.entry, null);

  // next round: u4's late class cutscene is queued now; team switch works between matches only
  await call('POST', '/api/ingest', [chat(5, 'น้ำเงิน')]); // u5 was red → blue (allowed in post phase)
  const s2 = (await call('POST', '/api/match/start', {})).body; assert.equal(s2.roster.find((r) => r.userId === 'u5').team, 'blue');
  await call('POST', '/api/ingest', [chat(6, 'red')]); assert.equal((await call('GET', '/api/state')).body.roster.find((r) => r.userId === 'u6').team, 'blue', 'no switching mid-match');
  const m2 = new Match({ seed: 6, players: s2.roster.map((r) => ({ userId: r.userId, name: r.nickname, team: r.team, level: r.level, cls: r.cls, bonusPct: r.bonusPct })), events: false });
  const c2 = (await call('POST', '/api/match/commit', { matchId: s2.matchId, result: m2.runToEnd() })).body; assert.ok(c2.queueSize >= 1);
  const e3 = (await call('POST', '/api/post/next')).body; assert.equal(e3.entry.userId, 'u4'); assert.ok(e3.entry.reasons.includes('class'));

  assert.ok((await call('GET', '/api/leaderboard', null, {})).body.length > 0);
  assert.equal((await call('POST', '/api/operator/season', {}, { 'x-operator-token': 'bad' })).status, 401);
});
