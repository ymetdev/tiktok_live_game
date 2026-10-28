// Normalized viewer events (what every adapter — simulator, TikTok bridge, official API — must produce).
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const int = (v, lo, hi, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
export const EVENT_TYPES = ['chat', 'join', 'like', 'gift'];

export function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'event must be an object' };
  const type = str(raw.type, 10).toLowerCase(); if (!EVENT_TYPES.includes(type)) return { ok: false, error: `unknown type "${type}"` };
  const userId = str(raw.userId, 64); if (!userId) return { ok: false, error: 'userId required' };
  const e = { type, userId, nickname: str(raw.nickname || raw.handle || userId, 40) || userId, handle: str(raw.handle, 40), ts: int(raw.ts, 0, 4e12, Date.now()) };
  const av = str(raw.avatarUrl, 300); if (/^https?:\/\//i.test(av)) e.avatarUrl = av;
  e.id = str(raw.id, 80) || `${type}:${userId}:${e.ts}:${str(raw.text, 20)}`;
  if (type === 'chat') { e.text = str(raw.text, 200); if (!e.text) return { ok: false, error: 'text required' }; }
  if (type === 'like') e.count = int(raw.count, 1, 1000, 1);
  if (type === 'gift') {
    e.giftId = str(raw.giftId, 40); e.giftName = str(raw.giftName, 60); e.diamonds = int(raw.diamonds, 0, 1e7); e.repeatCount = int(raw.repeatCount, 1, 1e5, 1);
    e.streakEnd = raw.streakEnd === undefined ? true : !!raw.streakEnd; // streakable gifts only count when the streak ends
  }
  return { ok: true, event: e };
}
