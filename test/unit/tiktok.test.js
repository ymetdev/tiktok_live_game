import test from 'node:test';
import assert from 'node:assert/strict';
import { mapEvent } from '../../adapters/tiktok-live-connector.js';
import { normalizeEvent } from '../../shared/events.js';

// Fixtures follow the field names of tiktok-live-proto (WebcastChatMessage / LikeMessage / GiftMessage); they are NOT recordings of a real LIVE.
const user = { userId: '123', uniqueId: 'somebody', nickname: 'Some Body', profilePicture: { urls: ['https://x/a.png'] } };
test('chat maps and normalizes', () => {
  const e = mapEvent('chat', { event: { msgId: 'm1' }, user, comment: 'แดง' }); assert.equal(e.type, 'chat'); assert.equal(e.userId, '123'); assert.equal(normalizeEvent(e).ok, true);
});
test('like uses per-user likeCount', () => { const e = mapEvent('like', { event: { msgId: 'm2' }, user, likeCount: 7, totalLikeCount: 9000 }); assert.equal(e.count, 7); assert.equal(normalizeEvent(e).ok, true); });
test('non-streakable gift counts immediately; streakable only on repeatEnd, with total value', () => {
  const one = mapEvent('gift', { event: { msgId: 'g1' }, user, giftId: 5655, repeatCount: 1, repeatEnd: 0, giftDetails: { giftType: 2, giftName: 'Rose', diamondCount: 1 } }); assert.equal(one.streakEnd, true);
  const mid = mapEvent('gift', { event: { msgId: 'g2' }, user, giftId: 1, groupId: 'grp', repeatCount: 3, repeatEnd: 0, giftDetails: { giftType: 1, giftName: 'Hearts', diamondCount: 5 } }); assert.equal(mid.streakEnd, false);
  const end = mapEvent('gift', { event: { msgId: 'g3' }, user, giftId: 1, groupId: 'grp', repeatCount: 10, repeatEnd: 1, giftDetails: { giftType: 1, giftName: 'Hearts', diamondCount: 5 } });
  assert.equal(end.streakEnd, true); assert.equal(end.diamonds, 50); assert.equal(mid.id, end.id); // same streak id => dedupes
});
test('events without a user are dropped', () => assert.equal(mapEvent('chat', { comment: 'hi' }), null));
