// Server-side game logic: viewer events -> team / class / gifts, match lifecycle, progression, post-match cutscene queue.
// The browser game page only renders; every rule that changes progression lives here (and in shared/rules.js).
import { tx } from './db.js';
import { BALANCE } from '../config/balance.js';
import { statsFor, roundStats, expToNext, addExp, auraFor, giftPoints, battleExp, likeExp, evoTier, classUnlocked, CLASS_KEYS } from '../shared/rules.js';
import { parseChat } from '../shared/commands.js';
import { normalizeEvent } from '../shared/events.js';
import { CutsceneQueue } from '../shared/queue.js';

const MAX_PLAYERS = 3000;
export class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const need = (c, code, msg) => { if (!c) throw new HttpError(code, msg); };

export class Game {
  constructor(pool, hub, B = BALANCE) { this.pool = pool; this.hub = hub; this.B = B; this.st = new Map(); }

  state(channel) {
    let s = this.st.get(channel);
    if (!s) { s = { phase: 'idle', sessionId: null, matchId: null, likes: new Map(), queue: null, seen: new Set() }; this.st.set(channel, s); }
    return s;
  }
  pub(r) {
    const level = r.level, bonusPct = Number(r.bonus_pct) || 0;
    return { userId: r.user_id, nickname: r.nickname || r.user_id, handle: r.handle, avatarUrl: r.avatar_url, level, exp: r.exp, expNext: expToNext(level, this.B), cls: r.class, evo: r.evo_tier,
      auraTier: r.aura_tier, aura: auraFor(r.aura_points, this.B), auraPoints: r.aura_points, bonusPct, stats: roundStats(statsFor({ level, cls: r.class, bonusPct }, this.B)), wins: r.wins, matches: r.matches };
  }
  statsOf(level, cls, bonusPct) { return roundStats(statsFor({ level, cls, bonusPct }, this.B)); }

  async channelRow(id) { const r = (await this.pool.query('SELECT * FROM channels WHERE id = $1', [id])).rows[0]; need(r, 404, 'Unknown channel'); return r; }

  async ensureSession(channel) {
    const s = this.state(channel); if (s.sessionId) return s.sessionId;
    const open = (await this.pool.query('SELECT id FROM live_sessions WHERE channel = $1 AND ended_at IS NULL ORDER BY id DESC LIMIT 1', [channel])).rows[0];
    if (open) { s.sessionId = open.id; return open.id; }
    const ch = await this.channelRow(channel);
    s.sessionId = (await this.pool.query('INSERT INTO live_sessions (channel, season) VALUES ($1, $2) RETURNING id', [channel, ch.season])).rows[0].id;
    return s.sessionId;
  }
  async endSession(channel) {
    const s = this.state(channel); if (s.sessionId) await this.pool.query('UPDATE live_sessions SET ended_at = now() WHERE id = $1', [s.sessionId]);
    await this.pool.query('UPDATE live_sessions SET ended_at = now() WHERE channel = $1 AND ended_at IS NULL', [channel]);
    Object.assign(s, { phase: 'idle', sessionId: null, matchId: null, queue: null }); s.likes.clear(); this.hub.publish(channel, { type: 'phase', phase: 'idle' });
  }
  async newSeason(channel) { const r = await this.pool.query('UPDATE channels SET season = season + 1 WHERE id = $1 RETURNING season', [channel]); need(r.rowCount, 404, 'Unknown channel'); return r.rows[0].season; }

  // ---- players ----
  async touch(db, ev, season) {
    const r = (await db.query(`INSERT INTO players (user_id, handle, nickname, avatar_url, season) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET nickname = CASE WHEN EXCLUDED.nickname <> '' THEN EXCLUDED.nickname ELSE players.nickname END,
        handle = CASE WHEN EXCLUDED.handle <> '' THEN EXCLUDED.handle ELSE players.handle END,
        avatar_url = CASE WHEN EXCLUDED.avatar_url <> '' THEN EXCLUDED.avatar_url ELSE players.avatar_url END, last_seen = now() RETURNING *`,
      [ev.userId, ev.handle || '', ev.nickname || '', ev.avatarUrl || '', season])).rows[0];
    if (this.B.gifts.bonusLifetime === 'season' && r.season < season) { // new season: aura and gift bonus start over (level/class stay)
      return (await db.query('UPDATE players SET aura_points = 0, aura_tier = 0, bonus_pct = 0, season = $2 WHERE user_id = $1 RETURNING *', [ev.userId, season])).rows[0];
    }
    return r;
  }
  async profile(userId) { const r = (await this.pool.query('SELECT * FROM players WHERE user_id = $1', [userId])).rows[0]; need(r, 404, 'Player not found'); return this.pub(r); }
  async leaderboard(limit = 20) { return (await this.pool.query('SELECT * FROM players ORDER BY level DESC, exp DESC, wins DESC LIMIT $1', [Math.min(100, Math.max(1, limit | 0))])).rows.map((r) => this.pub(r)); }
  async roster(sessionId) {
    const rows = (await this.pool.query('SELECT p.*, sp.team FROM session_players sp JOIN players p ON p.user_id = sp.user_id WHERE sp.session_id = $1 ORDER BY p.level DESC, p.user_id LIMIT $2', [sessionId, MAX_PLAYERS])).rows;
    return rows.map((r) => ({ ...this.pub(r), team: r.team }));
  }

  // ---- ingest ----
  async ingest(channel, raws) {
    need(Array.isArray(raws) && raws.length <= 200, 400, 'Send an array of at most 200 events');
    const s = this.state(channel), out = { accepted: 0, duplicates: 0, rejected: [] };
    for (let i = 0; i < raws.length; i++) {
      const n = normalizeEvent(raws[i]); if (!n.ok) { out.rejected.push({ i, error: n.error }); continue; }
      const ev = n.event;
      if (s.seen.has(ev.id)) { out.duplicates++; continue; }
      s.seen.add(ev.id); if (s.seen.size > 20000) for (const k of [...s.seen].slice(0, 5000)) s.seen.delete(k);
      await this.handle(channel, ev) === 'dup' ? out.duplicates++ : out.accepted++;
    }
    return out;
  }
  async handle(channel, ev) {
    const sid = await this.ensureSession(channel), ch = await this.channelRow(channel), s = this.state(channel);
    const row = await this.touch(this.pool, ev, ch.season);
    if (ev.type === 'chat') {
      this.hub.publish(channel, { type: 'chat', userId: ev.userId, nickname: row.nickname, text: ev.text });
      const cmd = parseChat(ev.text); if (!cmd) return 'ok';
      if (cmd.kind === 'team') await this.teamCommand(channel, s, sid, row, cmd.team); else await this.classCommand(channel, s, row, cmd.cls);
    } else if (ev.type === 'like') {
      s.likes.set(ev.userId, (s.likes.get(ev.userId) || 0) + ev.count); this.hub.publish(channel, { type: 'like', userId: ev.userId, count: ev.count });
    } else if (ev.type === 'gift') {
      if (!ev.streakEnd) return 'ok'; // streakable gifts are counted once, when the streak ends
      const ins = await this.pool.query('INSERT INTO gift_events (event_id, channel, session_id, user_id, gift_id, gift_name, diamonds, repeat_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (event_id) DO NOTHING',
        [ev.id, channel, sid, ev.userId, ev.giftId, ev.giftName, ev.diamonds, ev.repeatCount]);
      if (!ins.rowCount) return 'dup';
      this.hub.publish(channel, { type: 'gift', userId: ev.userId, nickname: row.nickname, giftName: ev.giftName, diamonds: ev.diamonds });
    }
    return 'ok';
  }
  async teamCommand(channel, s, sid, row, team) {
    const ex = (await this.pool.query('SELECT team FROM session_players WHERE session_id = $1 AND user_id = $2', [sid, row.user_id])).rows[0];
    if (ex && ex.team === team) return;
    if (ex && s.phase === 'fight') return; // switching teams is only possible between matches
    if (ex) await this.pool.query('UPDATE session_players SET team = $3 WHERE session_id = $1 AND user_id = $2', [sid, row.user_id, team]);
    else await this.pool.query('INSERT INTO session_players (session_id, user_id, team) VALUES ($1, $2, $3)', [sid, row.user_id, team]);
    this.hub.publish(channel, { type: 'join', switched: !!ex, ...this.pub(row), team });
  }
  async classCommand(channel, s, row, cls) {
    if (!CLASS_KEYS.includes(cls) || !classUnlocked(row.level, row.class, this.B) || s.phase === 'fight') return;
    const before = { cls: row.class, stats: this.statsOf(row.level, row.class, row.bonus_pct) }, evo = evoTier(row.level, cls, this.B);
    const open = s.phase === 'post' && s.queue && !s.queue.closed, after = { cls, stats: this.statsOf(row.level, cls, row.bonus_pct) };
    await this.pool.query('UPDATE players SET class = $2, evo_tier = $3, pending_class = $4 WHERE user_id = $1', [row.user_id, cls, evo, !open]);
    if (open) s.queue.add(row.user_id, 'class', { nickname: row.nickname, avatarUrl: row.avatar_url, level: row.level, before, after });
    this.hub.publish(channel, { type: 'classPicked', userId: row.user_id, nickname: row.nickname, cls, late: !open });
  }

  // ---- match lifecycle ----
  async matchStart(channel, seed) {
    const sid = await this.ensureSession(channel), s = this.state(channel);
    const idx = ((await this.pool.query('SELECT COALESCE(MAX(idx), 0) + 1 AS n FROM matches WHERE session_id = $1', [sid])).rows[0]).n;
    seed = Number.isFinite(+seed) ? Math.floor(+seed) : Math.floor(Math.random() * 2 ** 31);
    const matchId = (await this.pool.query('INSERT INTO matches (session_id, idx, seed) VALUES ($1, $2, $3) RETURNING id', [sid, idx, seed])).rows[0].id;
    s.matchId = matchId; s.phase = 'fight'; s.queue = null; s.likes.clear();
    this.hub.publish(channel, { type: 'phase', phase: 'fight', matchId });
    return { matchId, idx, seed, sessionId: sid, roster: await this.roster(sid), balance: this.B.match };
  }

  async matchCommit(channel, { matchId, result }) {
    need(result && Array.isArray(result.players), 400, 'result.players required'); need(['red', 'blue', 'draw'].includes(result.winner), 400, 'bad winner');
    const s = this.state(channel), B = this.B;
    const out = await tx(this.pool, async (db) => {
      const m = (await db.query('SELECT m.*, ls.channel FROM matches m JOIN live_sessions ls ON ls.id = m.session_id WHERE m.id = $1 FOR UPDATE OF m', [matchId])).rows[0];
      need(m && m.channel === channel, 404, 'Unknown match');
      if (m.committed) return { response: m.stats.response, replay: true };
      const members = new Map((await db.query('SELECT user_id, team FROM session_players WHERE session_id = $1', [m.session_id])).rows.map((r) => [r.user_id, r.team]));
      const parts = result.players.filter((p) => !p.bot && members.has(String(p.userId))).slice(0, MAX_PLAYERS)
        .map((p) => ({ userId: String(p.userId), kills: Math.max(0, Math.min(1e5, p.kills | 0)), damage: Math.max(0, Math.min(1e8, Math.round(+p.damage || 0))), survived: !!p.survived, won: result.winner !== 'draw' && members.get(String(p.userId)) === result.winner }));
      const queue = [], respRoster = [];
      const rows = new Map((await db.query('SELECT * FROM players WHERE user_id = ANY($1) ORDER BY user_id FOR UPDATE', [parts.map((p) => p.userId)])).rows.map((r) => [r.user_id, r]));
      const entries = new Map(); // userId -> { reasons:Set, data }
      const note = (r, reason, data) => { const e = entries.get(r.user_id) || entries.set(r.user_id, { reasons: new Set(), data: { nickname: r.nickname, avatarUrl: r.avatar_url } }).get(r.user_id); e.reasons.add(reason); Object.assign(e.data, data); };
      for (const p of parts) {
        const r = rows.get(p.userId); if (!r) continue;
        const gain = battleExp(p, B) + likeExp(s.likes.get(p.userId) || 0, 0, B), a = addExp(r.level, r.exp, gain, B), evo = evoTier(a.level, r.class, B);
        const before = { level: r.level, cls: r.class, stats: this.statsOf(r.level, r.class, r.bonus_pct) }, after = { level: a.level, cls: r.class, stats: this.statsOf(a.level, r.class, r.bonus_pct) };
        await db.query('UPDATE players SET level = $2, exp = $3, evo_tier = $4, wins = wins + $5, matches = matches + 1, kills = kills + $6, damage = damage + $7 WHERE user_id = $1', [p.userId, a.level, a.exp, evo, p.won ? 1 : 0, p.kills, p.damage]);
        await db.query('INSERT INTO match_players (match_id, user_id, team, class, level_before, level_after, exp_gain, kills, damage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING', [matchId, p.userId, members.get(p.userId), r.class, r.level, a.level, gain, p.kills, p.damage]);
        if (evo > r.evo_tier) note(r, 'evolve', { before, after });
        respRoster.push({ userId: p.userId, nickname: r.nickname, avatarUrl: r.avatar_url, team: members.get(p.userId), cls: r.class, level: a.level, levelsGained: a.levelsGained, expGain: gain, kills: p.kills, damage: p.damage, stats: after.stats, won: p.won, canPickClass: classUnlocked(a.level, r.class, B) });
        r.level = a.level; r.exp = a.exp; r.evo_tier = evo;
      }
      // gifts received since the last commit become Bonus Stats / Aura now (they never affect a match in progress)
      const gifts = (await db.query("SELECT user_id, SUM(diamonds)::int AS d FROM (SELECT user_id, diamonds FROM gift_events WHERE channel = $1 AND status = 'pending' FOR UPDATE) g GROUP BY user_id ORDER BY user_id", [channel])).rows;
      for (const g of gifts) {
        const r = rows.get(g.user_id) || (await db.query('SELECT * FROM players WHERE user_id = $1 FOR UPDATE', [g.user_id])).rows[0]; if (!r) continue;
        const pts = giftPoints(g.d, B); if (pts <= 0) continue;
        const total = r.aura_points + pts, tier = auraFor(total, B), tierBefore = auraFor(r.aura_points, B);
        await db.query('UPDATE players SET aura_points = $2, aura_tier = $3, bonus_pct = $4 WHERE user_id = $1', [g.user_id, total, tier.tier, tier.bonusPct]);
        note(r, 'gift', { points: pts, aura: { before: tierBefore, after: tier }, before: { level: r.level, cls: r.class, stats: this.statsOf(r.level, r.class, r.bonus_pct) }, after: { level: r.level, cls: r.class, stats: this.statsOf(r.level, r.class, tier.bonusPct) } });
        r.aura_points = total; r.aura_tier = tier.tier; r.bonus_pct = tier.bonusPct;
        const rr = respRoster.find((x) => x.userId === g.user_id); if (rr) rr.stats = this.statsOf(r.level, r.class, tier.bonusPct);
      }
      await db.query("UPDATE gift_events SET status = 'applied', match_id = $2 WHERE channel = $1 AND status = 'pending'", [channel, matchId]);
      // classes picked after the previous queue closed: their cutscene plays now
      const late = (await db.query('SELECT p.* FROM players p JOIN session_players sp ON sp.user_id = p.user_id WHERE sp.session_id = $1 AND p.pending_class ORDER BY p.user_id', [m.session_id])).rows;
      for (const r of late) { note(r, 'class', { before: { level: r.level, cls: 'novice', stats: this.statsOf(r.level, 'novice', r.bonus_pct) }, after: { level: r.level, cls: r.class, stats: this.statsOf(r.level, r.class, r.bonus_pct) } }); }
      if (late.length) await db.query('UPDATE players SET pending_class = false WHERE user_id = ANY($1)', [late.map((r) => r.user_id)]);
      for (const [uid, e] of entries) queue.push({ userId: uid, reasons: [...e.reasons], data: e.data });
      const mvp = parts.find((p) => p.userId === result.mvp) ? result.mvp : null, mvpRow = mvp ? rows.get(mvp) : null;
      respRoster.sort((a, b) => b.level - a.level || b.damage - a.damage);
      const response = { match: { id: String(matchId), winner: result.winner, reason: result.reason, duration: result.duration, baseHp: result.baseHp, mvp: mvpRow ? { userId: mvp, nickname: mvpRow.nickname, avatarUrl: mvpRow.avatar_url, cls: mvpRow.class, kills: parts.find((p) => p.userId === mvp).kills, damage: parts.find((p) => p.userId === mvp).damage } : null },
        roster: respRoster, queueSize: queue.length, classPickWindowSec: B.post.classPickWindowSec, cutsceneSec: B.post.cutsceneSec };
      await db.query('UPDATE matches SET committed = true, winner = $2, reason = $3, mvp_user = $4, ended_at = now(), stats = $5 WHERE id = $1', [matchId, result.winner, result.reason || null, mvp, JSON.stringify({ response, summary: { duration: result.duration, baseHp: result.baseHp } })]);
      return { response, queue };
    });
    if (!out.replay) {
      const q = new CutsceneQueue(); for (const e of out.queue) q.add(e.userId, e.reasons[0], e.data), e.reasons.slice(1).forEach((r) => q.add(e.userId, r));
      s.queue = q; s.phase = 'post'; s.likes.clear();
      this.hub.publish(channel, { type: 'phase', phase: 'post', matchId });
    }
    return out.response;
  }
  postClose(channel) { const s = this.state(channel); need(s.queue, 409, 'No post-match phase running'); s.queue.close(); this.hub.publish(channel, { type: 'queueClosed' }); return { size: s.queue.size }; }
  postNext(channel) { const s = this.state(channel); need(s.queue, 409, 'No post-match phase running'); const e = s.queue.next(); return e ? { entry: e, remaining: s.queue.size } : { entry: null, remaining: 0 }; }
  setPhase(channel, phase) { need(['idle', 'fight', 'post'].includes(phase), 400, 'bad phase'); const s = this.state(channel); s.phase = phase; if (phase !== 'post') s.queue = null; this.hub.publish(channel, { type: 'phase', phase }); return { phase }; }

  async snapshot(channel) { // for a game page that (re)loads in the middle of a LIVE
    const s = this.state(channel), ch = await this.channelRow(channel); let roster = [];
    const open = s.sessionId || (await this.pool.query('SELECT id FROM live_sessions WHERE channel = $1 AND ended_at IS NULL ORDER BY id DESC LIMIT 1', [channel])).rows[0]?.id;
    if (open) { s.sessionId = open; roster = await this.roster(open); }
    return { phase: s.phase, sessionId: open || null, matchId: s.matchId, season: ch.season, roster, queueSize: s.queue?.size || 0, queueClosed: !!s.queue?.closed, balance: this.B.match };
  }
}
