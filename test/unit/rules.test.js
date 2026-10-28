import test from 'node:test';
import assert from 'node:assert/strict';
import { statsFor, expToNext, addExp, auraFor, giftPoints, battleExp, likeExp, evoTier, classUnlocked } from '../../shared/rules.js';
import { BALANCE } from '../../config/balance.js';

test('stats grow with level and class multipliers apply', () => {
  const a = statsFor({ level: 1, cls: 'novice' }), b = statsFor({ level: 20, cls: 'novice' });
  assert.ok(b.atk > a.atk && b.hp > a.hp && b.def > a.def && b.aspd > a.aspd);
  assert.ok(statsFor({ level: 10, cls: 'knight' }).hp > statsFor({ level: 10, cls: 'mage' }).hp);
});
test('evolution tiers follow the configured levels', () => {
  assert.equal(evoTier(9, 'knight'), 0); assert.equal(evoTier(10, 'knight'), 1); assert.equal(evoTier(25, 'mage'), 2); assert.equal(evoTier(40, 'archer'), 3); assert.equal(evoTier(50, 'novice'), 0);
});
test('aura bonus raises stats; bots (0 bonus) are unchanged', () => {
  const base = statsFor({ level: 10, cls: 'knight', bonusPct: 0 }), boosted = statsFor({ level: 10, cls: 'knight', bonusPct: 20 });
  assert.ok(boosted.atk > base.atk * 1.19 && boosted.hp > base.hp * 1.19);
});
test('addExp levels up, carries the remainder and respects the cap', () => {
  const need = expToNext(1), r = addExp(1, 0, need + 5);
  assert.equal(r.level, 2); assert.equal(r.exp, 5); assert.equal(r.levelsGained, 1);
  const big = addExp(1, 0, 1e9); assert.equal(big.level, BALANCE.stats.levelCap); assert.equal(big.exp, 0);
  assert.equal(addExp(5, 3, -50).exp, 3); // negative gains are ignored
});
test('aura tiers by cumulative points; gifts can be disabled by policy switch', () => {
  assert.equal(auraFor(0).tier, 0); assert.equal(auraFor(49).tier, 0); assert.equal(auraFor(50).tier, 1); assert.equal(auraFor(1e9).tier, 5);
  assert.equal(giftPoints(100), 100);
  assert.equal(giftPoints(100, { ...BALANCE, gifts: { ...BALANCE.gifts, enabled: false } }), 0);
});
test('battle and like EXP', () => {
  assert.ok(battleExp({ damage: 400, kills: 2, survived: true, won: true }) > battleExp({ damage: 0 }));
  assert.equal(likeExp(500, 0), BALANCE.exp.likeCapPerMatch); assert.equal(likeExp(5, 18), 2); assert.equal(likeExp(5, 20), 0);
});
test('class pick unlocks at Lv.10 for novices only', () => {
  assert.equal(classUnlocked(9, 'novice'), false); assert.equal(classUnlocked(10, 'novice'), true); assert.equal(classUnlocked(30, 'knight'), false);
});
