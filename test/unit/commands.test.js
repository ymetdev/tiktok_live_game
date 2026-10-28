import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChat } from '../../shared/commands.js';
import { normalizeEvent } from '../../shared/events.js';
import { CutsceneQueue } from '../../shared/queue.js';

test('team commands in Thai and English, with spelling variants', () => {
  for (const t of ['แดง', ' แดง ', 'ทีมแดง', 'red', 'RED!', 'r']) assert.deepEqual(parseChat(t), { kind: 'team', team: 'red' }, t);
  for (const t of ['น้ำเงิน', 'นํ้าเงิน', 'ทีมน้ำเงิน', 'ฟ้า', 'Blue', 'b']) assert.deepEqual(parseChat(t), { kind: 'team', team: 'blue' }, t);
});
test('class commands: ASCII, Thai and full-width digits, names', () => {
  assert.equal(parseChat('1').cls, 'knight'); assert.equal(parseChat('๒').cls, 'archer'); assert.equal(parseChat('３').cls, 'mage'); assert.equal(parseChat('4').cls, 'assassin'); assert.equal(parseChat('Mage').cls, 'mage');
});
test('normal chatter is ignored', () => {
  for (const t of ['สวัสดีครับ แดงชนะแน่', '5', '', '   ', 'อยากเล่นทีมแดงจังเลยนะ', '12']) assert.equal(parseChat(t), null, t);
});
test('events are validated and normalized', () => {
  assert.equal(normalizeEvent({ type: 'nope', userId: 'u' }).ok, false);
  assert.equal(normalizeEvent({ type: 'chat', userId: '' , text: 'x' }).ok, false);
  assert.equal(normalizeEvent({ type: 'chat', userId: 'u1' }).ok, false);
  const g = normalizeEvent({ type: 'gift', userId: 'u1', diamonds: '30', repeatCount: 3, avatarUrl: 'javascript:alert(1)' }).event;
  assert.equal(g.diamonds, 30); assert.equal(g.streakEnd, true); assert.equal(g.avatarUrl, undefined);
  assert.equal(normalizeEvent({ type: 'like', userId: 'u', count: 99999 }).event.count, 1000);
});
test('cutscene queue merges reasons per viewer and refuses entries after close', () => {
  const q = new CutsceneQueue();
  assert.ok(q.add('a', 'class')); assert.ok(q.add('b', 'gift')); assert.ok(q.add('a', 'gift', { aura: 2 }));
  assert.equal(q.size, 2);
  q.close(); assert.equal(q.add('c', 'class'), false);
  const first = q.next(); assert.equal(first.userId, 'a'); assert.deepEqual(first.reasons.sort(), ['class', 'gift']); assert.equal(first.data.aura, 2);
  assert.equal(q.next().userId, 'b'); assert.equal(q.next(), null);
});
