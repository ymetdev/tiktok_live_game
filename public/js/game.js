// Game page: boots, then loops  lobby -> fight -> result (+class picks) -> cutscene queue -> lobby ...
// The server owns progression; this page owns the simulation (shared/sim) and the presentation.
import * as THREE from 'three';
import { Match } from '/shared/sim/match.js';
import { Battlefield } from '/js/render3d.js';
import { Stage } from '/js/stage.js';
import { Net } from '/js/net.js';

const q = new URLSearchParams(location.search), $ = (id) => document.getElementById(id), root = $('root');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CLS_TH = { novice: 'Novice', knight: 'อัศวิน', archer: 'นักธนู', mage: 'จอมเวท', assassin: 'นักฆ่า' }, TEAM_TH = { red: 'แดง', blue: 'น้ำเงิน' };
const token = q.get('token') || localStorage.getItem('rb_token') || ''; if (q.get('token')) try { localStorage.setItem('rb_token', token); } catch { /* ignore */ }
const speed = Math.max(1, +q.get('speed') || 1); // e2e/debug only: run the match clock faster
const net = new Net(token), status = (t) => { $('status').textContent = t || ''; };
let phaseCfg = { cutsceneSec: 4, classPickWindowSec: 12, lobbySec: 10, resultHoldSec: 3, maxCutsceneTotalSec: 120 };
const setPhase = (p) => { root.className = 'phase-' + p; window.__phase = p; };

// scale the 1080x1920 stage into whatever window / OBS source it is in
const fit = () => { root.style.transform = `scale(${Math.min(innerWidth / 1080, innerHeight / 1920)})`; }; addEventListener('resize', fit); fit();

const field = new Battlefield($('field'), { width: 1080, height: 1920, maxDetailed: +q.get('cap') || 160, antialias: q.get('aa') === '1' });
let stage = null;
const roster = new Map(); // userId -> public profile + team (session roster as the page knows it)
const joined = { red: 0, blue: 0 };
const recount = () => { joined.red = joined.blue = 0; for (const p of roster.values()) joined[p.team]++; };

// ---------- live events ----------
function toast(html, ms = 2600) { const t = $('toast'); t.innerHTML = html; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms); }
function feed(html) { const d = document.createElement('div'); d.innerHTML = html; $('feed').appendChild(d); setTimeout(() => d.remove(), 6000); while ($('feed').children.length > 6) $('feed').firstChild.remove(); }
function chatLine(n, text) { const d = document.createElement('div'); d.textContent = `${n}: ${text}`; $('chat').appendChild(d); setTimeout(() => d.remove(), 8000); while ($('chat').children.length > 5) $('chat').firstChild.remove(); }
let phase = 'boot', picks = new Set();
net.on((e) => {
  if (e.type === 'chat') { if (phase === 'fight' || phase === 'lobby') chatLine(e.nickname, e.text); }
  else if (e.type === 'join') { const old = roster.get(e.userId); roster.set(e.userId, { ...(old || {}), ...e }); recount(); (phase === 'fight' ? feed : toast)(`<span class="${e.team === 'red' ? 'r' : 'b'}">${esc(e.nickname)}</span> ${e.switched ? 'ย้ายไปทีม' : 'เข้าร่วมทีม'}${TEAM_TH[e.team]}${phase === 'fight' ? ' (รอบหน้า)' : ''}`); }
  else if (e.type === 'classPicked') { if (e.late) toast(`${esc(e.nickname)} เลือก ${CLS_TH[e.cls]} — ใช้รอบหน้า`); else { picks.add(e.userId); renderPicks(); } const p = roster.get(e.userId); if (p) p.cls = e.cls; }
  else if (e.type === 'gift') feed(`🎁 ${esc(e.nickname)} ส่ง ${esc(e.giftName)} — อัปเกรดหลังจบรอบ`);
});

// ---------- lobby ----------
async function lobby(sec) {
  setPhase('lobby'); phase = 'lobby'; field.resetUnits();
  const end = Date.now() + sec * 1000 / speed;
  while (Date.now() < end) { $('lobbyMsg').innerHTML = `<span class="r">แดง ${joined.red}</span> · <span class="b">น้ำเงิน ${joined.blue}</span><br>พิมพ์ <span class="r">แดง</span> / <span class="b">น้ำเงิน</span> เพื่อเข้าร่วม`; $('lobbyCount').textContent = Math.ceil((end - Date.now()) * speed / 1000); await sleep(200); }
}

// ---------- fight ----------
const matchPlayers = (rows) => rows.map((p) => ({ userId: p.userId, name: p.nickname, team: p.team, level: p.level, cls: p.cls, bonusPct: p.bonusPct || 0 }));
async function fight() {
  const start = await net.retry('match/start', {}); Object.assign(phaseCfg, start.post || {});
  roster.clear(); for (const p of start.roster) roster.set(p.userId, p); recount();
  const match = new Match({ seed: start.seed, players: matchPlayers(start.roster), balance: { ...(await balanceFor(start)) } });
  for (const u of match.units) { const p = roster.get(u.userId); u.auraTier = p?.auraTier || 0; u.auraColor = p?.aura?.color; }
  field.resetUnits(); setPhase('fight'); phase = 'fight'; $('feed').innerHTML = ''; $('join').style.display = '';
  const names = new Map(match.units.map((u) => [u.id, u]));
  const tags = []; for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 't'; d.style.display = 'none'; $('tags').appendChild(d); tags.push(d); }
  const v = new THREE.Vector3(); let acc = 0, last = performance.now(), lastTag = 0, endAt = null;
  await new Promise((resolve) => {
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000) * speed; last = now; acc += dt; const sd = match.dt;
      while (acc >= sd) { acc -= sd; if (!match.done) { match.step(); const evs = match.drainEvents(); field.onEvents(evs, match); for (const e of evs) if (e.k === 'death') { const a = names.get(e.by), b = names.get(e.id); if (a && b && (!a.bot || !b.bot) && (a.level >= 10 || !a.bot)) feed(`<span class="${a.team === 'red' ? 'r' : 'b'}">${esc(a.name)}</span> ⚔ <span class="${b.team === 'red' ? 'r' : 'b'}">${esc(b.name)}</span>`); } } }
      field.update(match, dt, match.done ? 1 : acc / sd); field.render(); hud(match);
      if (now - lastTag > 250) { lastTag = now; labels(match, tags, v); }
      if (match.done && endAt === null) { endAt = now + 1200 / speed; }
      if (endAt !== null && now > endAt) { for (const t of tags) t.remove(); return resolve(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  return match;
}
async function balanceFor(start) { const { BALANCE } = await import('/config/balance.js'); return { ...BALANCE, match: { ...BALANCE.match, ...(start.balance || {}) } }; }
function hud(m) {
  const r = m.bases.red, b = m.bases.blue, left = Math.max(0, m.B.match.durationSec - m.t);
  $('redHp').style.width = (100 * r.hp / r.maxHp) + '%'; $('blueHp').style.width = (100 * b.hp / b.maxHp) + '%'; $('redTxt').textContent = `RED ${Math.ceil(r.hp)}`; $('blueTxt').textContent = `BLUE ${Math.ceil(b.hp)}`;
  $('timer').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  if (m.tick % 10 === 0) { let rc = 0, bc = 0, ra = 0, ba = 0; for (const u of m.units) if (!u.bot) { if (u.team === 'red') { rc++; if (!u.dead) ra++; } else { bc++; if (!u.dead) ba++; } } $('counts').innerHTML = `<span class="r">${ra}/${rc} 🔴</span><span class="b">🔵 ${ba}/${bc}</span>`; }
}
// name tags only for the strongest living viewers (readability at hundreds of units)
function labels(m, tags, v) {
  const top = m.units.filter((u) => !u.bot && !u.dead).sort((a, b) => b.level - a.level || a.id - b.id).slice(0, tags.length);
  tags.forEach((d, i) => { const u = top[i]; if (!u) { d.style.display = 'none'; return; } v.set(u.x, 3.4, u.y).project(field.camera); d.style.display = 'block'; d.className = 't ' + u.team; d.textContent = `Lv.${u.level} ${u.name}`; d.style.left = ((v.x + 1) / 2 * 1080) + 'px'; d.style.top = ((1 - v.y) / 2 * 1920) + 'px'; });
}

// ---------- result + class picks ----------
function renderPicks() {
  const can = [...roster.values()].filter((p) => p.canPickClass); const done = can.filter((p) => picks.has(p.userId)).length;
  $('picks').style.display = can.length ? '' : 'none';
  $('pickList').innerHTML = can.slice(0, 24).map((p) => `<span class="${picks.has(p.userId) ? 'done' : ''}">${esc(p.nickname)} Lv.${p.level}${picks.has(p.userId) ? ' ✓' : ''}</span>`).join('') + (can.length > 24 ? `<span>+${can.length - 24}</span>` : '') + `<span>เลือกแล้ว ${done}/${can.length}</span>`;
}
async function resultScreen(res) {
  roster.clear(); for (const p of res.roster) roster.set(p.userId, { ...p, auraTier: roster.get(p.userId)?.auraTier }); picks = new Set();
  const w = res.match.winner; setPhase('resultA'); phase = 'resultA';
  $('resWin').innerHTML = w === 'draw' ? 'เสมอ!' : `<span class="${w === 'red' ? 'r' : 'b'}">ทีม${TEAM_TH[w]}</span> ชนะ!`;
  $('resSub').textContent = `${res.match.reason === 'timeout' ? 'หมดเวลา — ตัดสินด้วยพลังชีวิตฐาน' : 'ทำลายฐานศัตรูสำเร็จ'} · ${Math.round(res.match.duration)} วินาที`;
  const m = res.match.mvp; $('resMvp').innerHTML = m ? `⭐ MVP: ${esc(m.nickname)} — ${m.kills} คิล · ${m.damage.toLocaleString()} ดาเมจ` : '';
  renderPicks(); const end = Date.now() + (res.classPickWindowSec || phaseCfg.classPickWindowSec) * 1000 / speed;
  await sleep((phaseCfg.resultHoldSec || 3) * 1000 / speed);
  while (Date.now() < end) { $('pickTimer').textContent = `ปิดรับภายใน ${Math.ceil((end - Date.now()) * speed / 1000)} วินาที`; await sleep(250); }
  await net.retry('post/close', {});
}

// ---------- cutscene phase ----------
const clsName = (c) => CLS_TH[c] || c;
function rosterView(page, hiId) {
  const rows = [...roster.values()].sort((a, b) => b.level - a.level || (b.damage || 0) - (a.damage || 0)), per = 11, pages = Math.max(1, Math.ceil(rows.length / per));
  if (hiId) { const i = rows.findIndex((r) => r.userId === hiId); if (i >= 0) page = Math.floor(i / per); } page = ((page % pages) + pages) % pages;
  $('rosterHead').innerHTML = `<span>รายชื่อผู้เล่น</span><span style="color:var(--dim)">${page + 1}/${pages}</span>`;
  $('rosterRows').innerHTML = rows.slice(page * per, page * per + per).map((p) => `<div class="row ${p.team} ${p.userId === hiId ? 'hi' : ''}"><span>Lv.${p.level}</span><span class="nm">${esc(p.nickname)}</span><span>${clsName(p.cls)}</span><span class="st">${p.auraTier ? '✨' + p.auraTier : ''}</span><span class="st">ATK ${p.stats.atk} · HP ${p.stats.hp} · DEF ${p.stats.def} · ASPD ${p.stats.aspd}</span></div>`).join('');
  return page;
}
function cutsceneInfo(e) {
  const d = e.data, ch = [], a = d.after, b = d.before; if (e.reasons.includes('class')) ch.push('เลือกอาชีพ'); if (e.reasons.includes('evolve')) ch.push('วิวัฒนาการ'); if (e.reasons.includes('gift')) ch.push('ของขวัญ · ออร่า');
  const cell = (k, l) => { const x = b?.stats?.[k], y = a?.stats?.[k]; return `<span>${l}</span><span>${x ?? '-'}</span><span>→</span><span class="${y > x ? 'up' : ''}">${y ?? '-'}${y > x ? ' ▲' : ''}</span>`; };
  const auraLine = d.aura ? `<div class="aura" style="color:${d.aura.after.color}">✨ ออร่า ${esc(d.aura.after.name)}${d.aura.after.tier > d.aura.before.tier ? ' (อัปเกรด!)' : ''} · โบนัส +${d.aura.after.bonusPct}%</div>` : '';
  const lv = a && b && a.level !== b.level ? `Lv.${b.level} → Lv.${a.level}` : a?.level ? `Lv.${a.level}` : '';
  return `<h3>${esc(d.nickname)}</h3><div class="chips">${ch.map((c) => `<span class="chip">${c}</span>`).join('')}</div>${auraLine}<div style="font-size:34px">${b && a && b.cls !== a.cls ? `${clsName(b.cls)} → <b>${clsName(a.cls)}</b>` : clsName(a?.cls)} ${lv ? ' · ' + lv : ''}</div><div class="ba">${cell('atk', 'ATK')}${cell('hp', 'HP')}${cell('def', 'DEF')}${cell('aspd', 'ASPD')}</div>`;
}
async function cutscenes(res) {
  let { entry } = await net.retry('post/next', {}); window.__cutscenes = 0; if (!entry) return; // nobody changed: skip the cutscene part
  setPhase('resultB'); phase = 'resultB';
  const total = res.queueSize + 1; let page = 0, n = 0;
  const dur = Math.max(1.5, Math.min(phaseCfg.cutsceneSec, phaseCfg.maxCutsceneTotalSec / Math.max(1, total))) * 1000 / speed;
  page = rosterView(page);
  for (; entry; entry = (await net.retry('post/next', {})).entry) { n++;
    const d = entry.data, p = roster.get(entry.userId), cls = d.after?.cls || p?.cls || 'novice', team = p?.team || 'red', auraCol = d.aura?.after.color || p?.aura?.color, tier = d.aura?.after.tier ?? p?.auraTier ?? 0;
    if (p) { if (d.after?.stats) p.stats = d.after.stats; p.cls = cls; p.level = d.after?.level ?? p.level; if (d.aura) p.auraTier = d.aura.after.tier; }
    page = rosterView(page, entry.userId); $('cutInfo').innerHTML = cutsceneInfo(entry); status('');
    stage.set(d.before && d.before.cls !== cls ? d.before.cls : cls, team, auraCol, tier); const t0 = performance.now(); let swapped = !(d.before && d.before.cls !== cls);
    await new Promise((resolve) => { let last = t0; const f = (now) => { const dt = (now - last) / 1000; last = now; const k = (now - t0) / dur; if (!swapped && k > 0.4) { swapped = true; stage.set(cls, team, auraCol, tier); stage.burst(); } if (k > 0.25 && !f.b && tier > 0) { f.b = true; stage.burst(); } stage.update(dt); stage.render(); if (now - t0 >= dur) return resolve(); requestAnimationFrame(f); }; requestAnimationFrame(f); });
  }
  stage.clear(); $('cutInfo').innerHTML = ''; window.__cutscenes = n;
}

// ---------- main loop ----------
async function main() {
  if (!token) { status('ไม่มี token — เปิดหน้านี้ด้วย /game.html?token=<CHANNEL_TOKEN>'); return; }
  net.start(); field.load().then(() => { window.__assets = true; });
  while (!window.__assets) await sleep(100);
  stage = new Stage($('stage'), field);
  const snap = await net.retry('state'); Object.assign(phaseCfg, snap.post || {}); for (const p of snap.roster) roster.set(p.userId, p); recount();
  window.__ready = true; let first = true;
  for (;;) {
    try {
      await lobby(first ? phaseCfg.lobbySec + 5 : phaseCfg.lobbySec); first = false;
      const match = await fight();
      const res = await net.retry('match/commit', { matchId: String(lastMatchId), result: match.result() });
      window.__lastResult = res; await resultScreen(res); await cutscenes(res);
      window.__rounds = (window.__rounds || 0) + 1;
    } catch (e) { console.error(e); status('เชื่อมต่อมีปัญหา: ' + e.message + ' — ลองใหม่…'); await sleep(3000); }
  }
}
let lastMatchId = null;
const _start = net.api.bind(net); net.api = async (path, body, method) => { const r = await _start(path, body, method); if (path === 'match/start') lastMatchId = r.matchId; return r; };
main();
