// Event simulator: pretends to be a TikTok LIVE audience (chat / likes / gifts) by feeding the SAME ingest path a real adapter uses.
// Used by the operator panel and by tests. Viewer ids are stable (sim-1, sim-2, …) so their progression persists between runs.
const NAMES = ['น้องมะลิ', 'พี่เก่ง', 'Mint', 'Zero', 'หมีพูห์', 'Kuma', 'นักรบแดง', 'BlueWolf', 'ลุงตู่', 'Nova', 'แพนด้า', 'Rex', 'ฟ้าใส', 'Kaito', 'ต้นกล้า', 'Luna', 'พี่ปอ', 'Orion', 'ส้มโอ', 'Ghost'];
const GIFTS = [['Rose', 1], ['TikTok', 1], ['Finger Heart', 5], ['Hand Hearts', 100], ['Galaxy', 1000], ['Lion', 29999]];
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];

export class Simulator {
  constructor(ingest) { this.ingest = ingest; this.viewers = []; this.timer = null; this.counter = 0; this.sent = 0; }
  viewer(i) { return { userId: `sim-${i}`, nickname: `${NAMES[i % NAMES.length]}${i}`, handle: `sim${i}`, avatarUrl: '' }; }
  ensure(n) { while (this.viewers.length < n) this.viewers.push(this.viewer(this.viewers.length + 1)); return this.viewers; }
  ev(v, extra) { return { id: `sim:${Date.now()}:${++this.counter}:${v.userId}`, ts: Date.now(), userId: v.userId, nickname: v.nickname, handle: v.handle, avatarUrl: v.avatarUrl, ...extra }; }
  async push(events) { let r = { accepted: 0, duplicates: 0, rejected: [] }; for (let i = 0; i < events.length; i += 200) { const x = await this.ingest(events.slice(i, i + 200)); r.accepted += x.accepted; r.duplicates += x.duplicates; r.rejected.push(...x.rejected); } this.sent += events.length; return r; }
  sample(count) { const n = Math.min(count, this.viewers.length), idx = new Set(); while (idx.size < n) idx.add(rnd(this.viewers.length)); return [...idx].map((i) => this.viewers[i]); }

  async command(c = {}) {
    const n = Math.max(0, Math.min(5000, c.count | 0));
    switch (c.action) {
      case 'spawn': { // N viewers join a team through chat (red/blue/random)
        const had = this.viewers.length; this.ensure(had + n); const fresh = this.viewers.slice(had);
        return this.push(fresh.map((v, i) => this.ev(v, { type: 'chat', text: (c.team === 'red' ? 'แดง' : c.team === 'blue' ? 'น้ำเงิน' : i % 2 ? 'แดง' : 'น้ำเงิน') })));
      }
      case 'join': { this.ensure(n); return this.push(this.viewers.slice(0, n).map((v, i) => this.ev(v, { type: 'chat', text: c.team === 'red' ? 'แดง' : c.team === 'blue' ? 'น้ำเงิน' : i % 2 ? 'แดง' : 'น้ำเงิน' }))); }
      case 'likes': return this.push(this.sample(n || 20).map((v) => this.ev(v, { type: 'like', count: 1 + rnd(15) })));
      case 'gifts': return this.push(this.sample(n || 5).map((v) => { const [name, d] = c.diamonds ? [c.giftName || 'Gift', +c.diamonds] : pick(GIFTS); return this.ev(v, { type: 'gift', giftId: name, giftName: name, diamonds: d, repeatCount: 1, streakEnd: true }); }));
      case 'classes': return this.push(this.sample(n || 10).map((v) => this.ev(v, { type: 'chat', text: String(1 + rnd(4)) })));
      case 'chat': return this.push(this.sample(n || 10).map((v) => this.ev(v, { type: 'chat', text: pick(['สู้ๆ', 'GO RED!', 'น้ำเงินชนะแน่', 'lol', '555', 'ใครก็ได้ช่วยที']) })));
      case 'duplicate': { const v = this.ensure(1)[0], e = this.ev(v, { type: 'gift', giftId: 'Rose', giftName: 'Rose', diamonds: 1, repeatCount: 1, streakEnd: true }); return this.push([e, e]); }
      case 'giftstorm': return this.push(this.ensure(Math.max(n, 30)).slice(0, Math.max(n, 30)).map((v) => { const [name, d] = pick(GIFTS); return this.ev(v, { type: 'gift', giftId: name, giftName: name, diamonds: d, repeatCount: 1, streakEnd: true }); }));
      case 'auto': this.stop(); if (c.on !== false) this.timer = setInterval(() => { this.command({ action: 'likes', count: 10 }).catch(() => {}); if (Math.random() < 0.25) this.command({ action: 'gifts', count: 1 }).catch(() => {}); if (Math.random() < 0.2) this.command({ action: 'chat', count: 2 }).catch(() => {}); }, Math.max(500, c.intervalMs | 0 || 2000)); return this.status();
      case 'stop': this.stop(); return this.status();
      default: throw Object.assign(new Error('Unknown simulator action'), { code: 400 });
    }
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  status() { return { viewers: this.viewers.length, sent: this.sent, auto: !!this.timer }; }
}
