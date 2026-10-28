// TikTok LIVE adapter (UNOFFICIAL connector).  Maps tiktok-live-connector v2 events to the normalized event schema (shared/events.js).
// The mapping is unit-tested against the library's published message types, but a REAL LIVE connection has never been run in development.
// Risks: unofficial/reverse-engineered => can break any time; uses a 3rd-party sign server; check TikTok's terms before binding gifts to in-game benefits.
export const mapUser = (u = {}) => ({ userId: String(u.userId || u.uniqueId || ''), nickname: u.nickname || u.uniqueId || '', handle: u.uniqueId || '', avatarUrl: u.profilePicture?.urls?.[0] || '' });
const msgId = (d, fallback) => d?.event?.msgId ? String(d.event.msgId) : fallback;
const rnd = () => Math.random().toString(36).slice(2, 8);

// kind: 'chat' | 'like' | 'gift' | 'member'; data: the library's decoded message.  Returns a normalized event or null.
export function mapEvent(kind, d) {
  const u = mapUser(d?.user); if (!u.userId) return null;
  if (kind === 'chat') return d.comment ? { id: msgId(d, `chat:${u.userId}:${Date.now()}:${rnd()}`), type: 'chat', ...u, text: d.comment } : null;
  if (kind === 'like') return { id: msgId(d, `like:${u.userId}:${Date.now()}:${rnd()}`), type: 'like', ...u, count: Math.max(1, d.likeCount | 0) }; // likeCount = taps in this message, per user
  if (kind === 'gift') {
    const g = d.giftDetails || {}, streakable = g.giftType === 1, end = !streakable || d.repeatEnd === 1 || d.repeatEnd === true;
    const repeat = Math.max(1, d.repeatCount | 0), diamonds = (g.diamondCount | 0) * repeat; // total value of the whole streak (the final message carries the final repeatCount)
    return { id: streakable ? `gift:${d.groupId || msgId(d, rnd())}:${u.userId}` : msgId(d, `gift:${u.userId}:${Date.now()}:${rnd()}`), type: 'gift', ...u, giftId: String(d.giftId ?? ''), giftName: g.giftName || String(d.giftId ?? ''), diamonds, repeatCount: repeat, streakEnd: end };
  }
  if (kind === 'member') return { id: msgId(d, `join:${u.userId}:${Date.now()}`), type: 'join', ...u };
  return null;
}

// Connects to a LIVE and calls onEvent(normalizedEvent).  Resolves to a handle { stop() }.
export async function connectTikTok({ user, signApiKey, onEvent, onStatus = () => {} }) {
  const lib = await import('tiktok-live-connector').catch(() => { throw new Error('tiktok-live-connector is not installed (npm i tiktok-live-connector)'); });
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
  const conn = new TikTokLiveConnection(user, signApiKey ? { signApiKey } : {}), pass = (k) => (d) => { try { const e = mapEvent(k, d); if (e) onEvent(e); } catch (err) { onStatus('map error: ' + err.message); } };
  conn.on(WebcastEvent.CHAT, pass('chat')); conn.on(WebcastEvent.LIKE, pass('like')); conn.on(WebcastEvent.GIFT, pass('gift')); conn.on(WebcastEvent.MEMBER, pass('member'));
  conn.on(ControlEvent.CONNECTED, () => onStatus('connected')); conn.on(ControlEvent.DISCONNECTED, () => onStatus('disconnected')); conn.on(ControlEvent.ERROR, (e) => onStatus('error: ' + (e?.message || e)));
  const state = await conn.connect(); onStatus(`connected to room ${state.roomId}`);
  return { stop: () => conn.disconnect() };
}
