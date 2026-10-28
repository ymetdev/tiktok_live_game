// Deterministic auto-battle of one match. Pure logic (no DOM, no I/O): used by the game page, the server tests and tools/sim-cli.mjs.
import { BALANCE } from '../../config/balance.js';
import { mulberry32 } from '../rng.js';
import { statsFor, evoTier } from '../rules.js';

const CELL = 4;
const key = (cx, cy) => cx * 4096 + cy;
const other = (team) => (team === 'red' ? 'blue' : 'red');

export class Match {
  // players: [{ userId, name, team, level, cls, bonusPct }]
  constructor({ seed = 1, players = [], balance = BALANCE, bots = true, events = true } = {}) {
    this.B = balance; this.rng = mulberry32(seed); this.emit = events; this.events = [];
    const M = balance.match, { w, h } = M.field;
    this.W = w; this.H = h; this.t = 0; this.tick = 0; this.done = false; this.winner = null; this.reason = null; this.dt = 1 / M.tickHz;
    const count = { red: 0, blue: 0 }; for (const p of players) count[p.team]++;
    this.bases = {};
    for (const team of ['red', 'blue']) {
      const maxHp = M.baseHpBase + M.baseHpPerPlayer * Math.max(count[team], M.minTeamSize);
      this.bases[team] = { team, x: w / 2, y: team === 'red' ? 4.5 : h - 4.5, r: M.baseRadius, hp: maxHp, maxHp };
    }
    this.units = []; let uid = 0;
    for (const p of players) this.units.push(this._unit(++uid, p));
    if (bots) { // filler bots so a side is never empty; they never get gift bonuses
      const real = players.length ? players.reduce((s, p) => s + p.level, 0) / players.length : 1, lvl = Math.max(1, Math.round(real * M.botLevelFactor));
      for (const team of ['red', 'blue']) for (let i = count[team]; i < M.minTeamSize; i++) {
        const cls = lvl >= balance.classUnlockLevel ? ['knight', 'archer', 'mage', 'assassin'][Math.floor(this.rng() * 4)] : 'novice';
        this.units.push(this._unit(++uid, { userId: `bot:${team}:${i}`, name: 'Skeleton', team, level: lvl, cls, bonusPct: 0, bot: true }));
      }
    }
    this._grid();
  }

  _unit(id, p) {
    const stats = statsFor({ level: p.level, cls: p.cls, bonusPct: p.bonusPct || 0 }, this.B), c = this.B.classes[p.cls] || this.B.classes.novice;
    const u = { id, userId: p.userId, name: p.name, team: p.team, cls: p.cls, level: p.level, bot: !!p.bot, evo: evoTier(p.level, p.cls, this.B), stats, maxHp: stats.hp, hp: stats.hp, c,
      x: 0, y: 0, face: p.team === 'red' ? 1 : -1, dead: false, respawnAt: 0, atkCd: this.rng() * 0.5, skillCd: 3 + this.rng() * 5, target: null, retargetAt: 0,
      kills: 0, damage: 0, baseDamage: 0, deaths: 0, shieldUntil: 0, moving: false, hitAt: -9, atkAt: -9, px: 0, py: 0, hx: 0, hy: p.team === 'red' ? 1 : -1, skillAt: -9 };
    this._spawn(u); return u;
  }
  _spawn(u) { const jitter = this.rng(); u.x = 3 + this.rng() * (this.W - 6); u.y = u.team === 'red' ? 8 + jitter * 5 : this.H - 8 - jitter * 5; u.px = u.x; u.py = u.y; u.hp = u.maxHp; u.dead = false; u.target = null; u.shieldUntil = this.t + 1; }

  _grid() {
    this.grid = { red: new Map(), blue: new Map() };
    for (const u of this.units) if (!u.dead) { const g = this.grid[u.team], k = key(Math.floor(u.x / CELL), Math.floor(u.y / CELL)); (g.get(k) || g.set(k, []).get(k)).push(u); }
  }
  _nearest(u, team, range) {
    const g = this.grid[team], cr = Math.ceil(range / CELL), cx = Math.floor(u.x / CELL), cy = Math.floor(u.y / CELL); let best = null, bd = range * range;
    for (let dx = -cr; dx <= cr; dx++) for (let dy = -cr; dy <= cr; dy++) { const a = g.get(key(cx + dx, cy + dy)); if (!a) continue; for (const e of a) { const d = (e.x - u.x) ** 2 + (e.y - u.y) ** 2; if (d < bd) { bd = d; best = e; } } }
    return best;
  }
  _within(x, y, team, radius, fn) {
    const g = this.grid[team], cr = Math.ceil(radius / CELL), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), r2 = radius * radius;
    for (let dx = -cr; dx <= cr; dx++) for (let dy = -cr; dy <= cr; dy++) { const a = g.get(key(cx + dx, cy + dy)); if (!a) continue; for (const e of a) if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2) fn(e); }
  }

  // respawns get slower as the match goes on, so a stalemate in the middle breaks and one side finally pushes through
  _respawnDelay() { const M = this.B.match; return M.respawnSec + Math.max(0, this.t - M.escalateAfterSec) * M.respawnGrowth; }
  _damage(atk, def) { return Math.max(1, atk * (1 - def / (def + this.B.damage.defK))); }
  _hit(att, tgt, mult = 1, crit = false, ranged = false) {
    if (tgt.dead) return;
    let dmg = this._damage(att.stats.atk, tgt.stats.def) * mult; if (tgt.shieldUntil > this.t) dmg *= this.B.skills.knight.taken;
    tgt.hp -= dmg; tgt.hitAt = this.t; att.damage += dmg; att.atkAt = this.t;
    if (this.emit) this.events.push({ k: 'atk', from: att.id, to: tgt.id, dmg: Math.round(dmg), crit, ranged });
    if (tgt.hp <= 0) { tgt.dead = true; tgt.deaths++; tgt.respawnAt = this.t + this._respawnDelay(); att.kills++; if (this.emit) this.events.push({ k: 'death', id: tgt.id, by: att.id }); }
  }
  _hitBase(att, team, mult = 1) {
    const b = this.bases[team], dmg = this._damage(att.stats.atk, 0) * mult * this.B.match.baseDamageMult;
    b.hp -= dmg; att.damage += dmg; att.baseDamage += dmg; att.atkAt = this.t;
    if (this.emit) this.events.push({ k: 'atk', from: att.id, to: 'base:' + team, dmg: Math.round(dmg), ranged: att.c.range > 3 });
    if (b.hp <= 0 && !this.done) { b.hp = 0; this._finish(other(team), 'base'); }
  }

  _skill(u, tgt) {
    const S = this.B.skills[u.cls]; if (!S) return false;
    if (S.kind === 'guard') { u.shieldUntil = this.t + S.durationSec; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * S.healPct); }
    else if (S.kind === 'volley') { const hit = []; this._within(u.x, u.y, other(u.team), u.c.range + 1, (e) => hit.push(e)); hit.sort((a, b) => (a.x - u.x) ** 2 + (a.y - u.y) ** 2 - (b.x - u.x) ** 2 - (b.y - u.y) ** 2); for (const e of hit.slice(0, S.targets)) this._hit(u, e, S.mult, false, true); }
    else if (S.kind === 'meteor') { const list = []; this._within(tgt.x, tgt.y, other(u.team), S.radius, (e) => list.push(e)); for (const e of list) this._hit(u, e, S.mult, false, true); const b = this.bases[other(u.team)]; if (Math.hypot(b.x - tgt.x, b.y - tgt.y) <= S.radius + b.r) this._hitBase(u, other(u.team), S.mult * 0.5); }
    else if (S.kind === 'dash') { const a = Math.atan2(u.y - tgt.y, u.x - tgt.x); u.x = tgt.x + Math.cos(a) * 1.0; u.y = tgt.y + Math.sin(a) * 1.0; this._hit(u, tgt, S.mult, true); }
    u.skillAt = this.t;
    if (this.emit) this.events.push({ k: 'skill', id: u.id, kind: S.kind, x: u.x, y: u.y, tx: tgt ? tgt.x : u.x, ty: tgt ? tgt.y : u.y });
    return true;
  }

  step() {
    if (this.done) return;
    const dt = this.dt, M = this.B.match, rev = this.tick & 1; this.t += dt; this.tick++; this._grid();
    const n = this.units.length;
    for (let i = 0; i < n; i++) {
      const u = this.units[rev ? n - 1 - i : i];
      if (u.dead) { if (this.t >= u.respawnAt) { this._spawn(u); if (this.emit) this.events.push({ k: 'respawn', id: u.id }); } continue; }
      u.atkCd -= dt; u.skillCd -= dt;
      u.px = u.x; u.py = u.y;
      const eb = this.bases[other(u.team)];
      // target: nearest enemy soldier in aggro range, else the enemy base
      if (u.t_unit && u.t_unit.dead) u.t_unit = null;
      if (!u.t_unit || this.t >= u.retargetAt) { u.t_unit = this._nearest(u, other(u.team), M.aggroRange); u.retargetAt = this.t + M.retargetSec * (0.7 + this.rng() * 0.6); }
      const tgt = u.t_unit, range = u.c.range, baseInRange = Math.hypot(eb.x - u.x, eb.y - u.y) <= range + eb.r;
      const unitInRange = tgt && Math.hypot(tgt.x - u.x, tgt.y - u.y) <= range;
      // priority: a soldier I can hit right now > the base if it is in reach > walk to the nearest enemy > walk to the base
      let tx, ty, inRange, hitBase = false;
      if (unitInRange) { tx = tgt.x; ty = tgt.y; inRange = true; }
      else if (baseInRange) { tx = eb.x; ty = eb.y; inRange = true; hitBase = true; }
      else if (tgt) { tx = tgt.x; ty = tgt.y; inRange = false; }
      else { tx = eb.x; ty = eb.y; inRange = false; }
      u.moving = false;
      if (inRange) {
        if (!hitBase && u.skillCd <= 0 && this.B.skills[u.cls]) { this._skill(u, tgt); u.skillCd = this.B.skills[u.cls].cd; u.atkCd = Math.max(u.atkCd, 0.4); }
        else if (u.atkCd <= 0) {
          u.atkCd = 1 / u.stats.aspd; const crit = u.c.crit && this.rng() < u.c.crit, mult = crit ? u.c.critMult : 1;
          if (!hitBase) { this._hit(u, tgt, mult, !!crit, range > 3); if (u.c.splash) this._within(tgt.x, tgt.y, other(u.team), u.c.splash, (e) => { if (e !== tgt) this._hit(u, e, u.c.splashMult, false, true); }); }
          else this._hitBase(u, other(u.team), mult);
        }
        u.face = tx >= u.x ? 1 : -1; { const hd = Math.hypot(tx - u.x, ty - u.y) || 1; u.hx = (tx - u.x) / hd; u.hy = (ty - u.y) / hd; }
      } else {
        const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1; let vx = dx / d, vy = dy / d;
        const sep = this._sep(u); vx += sep[0]; vy += sep[1]; const vl = Math.hypot(vx, vy) || 1;
        u.x += (vx / vl) * u.c.speed * dt; u.y += (vy / vl) * u.c.speed * dt; u.moving = true; u.face = vx >= 0 ? 1 : -1; u.hx = vx / vl; u.hy = vy / vl;
      }
      u.x = Math.max(1, Math.min(this.W - 1, u.x)); u.y = Math.max(1, Math.min(this.H - 1, u.y));
    }
    if (!this.done && this.t >= M.durationSec) this._timeout();
  }
  _sep(u) { // keep allies from stacking on one point
    let sx = 0, sy = 0; const g = this.grid[u.team], cx = Math.floor(u.x / CELL), cy = Math.floor(u.y / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = g.get(key(cx + dx, cy + dy)); if (!a) continue; for (const e of a) { if (e === u) continue; const ex = u.x - e.x, ey = u.y - e.y, d2 = ex * ex + ey * ey; if (d2 < 1.2 && d2 > 0) { const f = (1.2 - d2) / 1.2; sx += (ex / Math.sqrt(d2)) * f; sy += (ey / Math.sqrt(d2)) * f; } } }
    return [sx * 0.8, sy * 0.8];
  }
  _timeout() {
    const r = this.bases.red, b = this.bases.blue, rr = r.hp / r.maxHp, br = b.hp / b.maxHp;
    if (Math.abs(rr - br) > 1e-6) return this._finish(rr > br ? 'red' : 'blue', 'time');
    const k = { red: 0, blue: 0 }; for (const u of this.units) k[u.team] += u.kills;
    this._finish(k.red === k.blue ? 'draw' : k.red > k.blue ? 'red' : 'blue', 'time');
  }
  _finish(winner, reason) { this.done = true; this.winner = winner; this.reason = reason; if (this.emit) this.events.push({ k: 'end', winner, reason }); }

  drainEvents() { const e = this.events; this.events = []; return e; }
  runToEnd(maxTicks = 1e6) { while (!this.done && maxTicks-- > 0) this.step(); return this.result(); }

  result() {
    const players = this.units.map((u) => ({ userId: u.userId, name: u.name, team: u.team, cls: u.cls, level: u.level, bot: u.bot, kills: u.kills, damage: Math.round(u.damage), baseDamage: Math.round(u.baseDamage), deaths: u.deaths, survived: !u.dead, won: u.team === this.winner }));
    const real = players.filter((p) => !p.bot).sort((a, b) => (b.damage + b.kills * 150 + b.baseDamage * 0.4) - (a.damage + a.kills * 150 + a.baseDamage * 0.4));
    return { winner: this.winner, reason: this.reason, duration: +this.t.toFixed(1), baseHp: { red: Math.round(this.bases.red.hp), blue: Math.round(this.bases.blue.hp), redMax: this.bases.red.maxHp, blueMax: this.bases.blue.maxHp }, players, mvp: real[0]?.userId || null };
  }
}
