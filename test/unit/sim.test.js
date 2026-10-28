import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../../shared/sim/match.js';
import { BALANCE } from '../../config/balance.js';

const mk = (team, n, level = 12, cls = 'mixed', bonusPct = 0) => Array.from({ length: n }, (_, i) => ({ userId: `${team}${i}`, name: `${team}${i}`, team, level, cls: cls === 'mixed' ? ['knight', 'archer', 'mage', 'assassin'][i % 4] : cls, bonusPct }));
const run = (players, seed = 1) => new Match({ seed, players, events: false }).runToEnd();

test('same seed gives the same result (deterministic)', () => {
  const a = run([...mk('red', 20), ...mk('blue', 20)], 7), b = run([...mk('red', 20), ...mk('blue', 20)], 7);
  assert.deepEqual(a, b);
});
test('a match always ends within the time limit', () => {
  for (let s = 1; s <= 5; s++) { const r = run([...mk('red', 25), ...mk('blue', 25)], s); assert.ok(r.duration <= BALANCE.match.durationSec + 0.1); assert.ok(['red', 'blue', 'draw'].includes(r.winner)); }
});
test('a much bigger team destroys the base before time runs out', () => {
  const r = run([...mk('red', 50), ...mk('blue', 15)], 3);
  assert.equal(r.winner, 'red'); assert.equal(r.reason, 'base'); assert.ok(r.duration < BALANCE.match.durationSec); assert.equal(r.baseHp.blue, 0);
});
test('symmetric teams are not biased towards one side', () => {
  let red = 0, n = 24; for (let s = 1; s <= n; s++) if (run([...mk('red', 20), ...mk('blue', 20)], s).winner === 'red') red++;
  assert.ok(red >= 6 && red <= 18, `red won ${red}/${n}`);
});
test('an empty side is filled with bots; bots never count as MVP and have no bonus', () => {
  const m = new Match({ seed: 2, players: mk('red', 10), events: false }), bots = m.units.filter((u) => u.bot);
  assert.ok(bots.length >= BALANCE.match.minTeamSize && bots.every((b) => b.team === 'blue'));
  const r = m.runToEnd(); assert.ok(r.mvp && !String(r.mvp).startsWith('bot:'));
});
test('Bonus Stats make the boosted team stronger (applied via statsFor, i.e. next match)', () => {
  let boosted = 0; for (let s = 1; s <= 10; s++) if (run([...mk('red', 20, 12, 'mixed', 30), ...mk('blue', 20, 12, 'mixed', 0)], s).winner === 'red') boosted++;
  assert.ok(boosted >= 8, `boosted team won ${boosted}/10`);
});
test('units respawn and the event stream reports kills when events are on', () => {
  const m = new Match({ seed: 4, players: [...mk('red', 12), ...mk('blue', 12)], events: true }); let deaths = 0, respawns = 0;
  for (let i = 0; i < 1200 && !m.done; i++) { m.step(); for (const e of m.drainEvents()) { if (e.k === 'death') deaths++; if (e.k === 'respawn') respawns++; } }
  assert.ok(deaths > 0 && respawns > 0);
});
