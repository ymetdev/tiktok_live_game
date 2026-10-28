// Stress page: runs the shared sim with N synthetic players and shows FPS / draw calls.  ?auto=1 steps through 50/100/300/500 and logs results.
import { Match } from '/shared/sim/match.js';
import { Battlefield } from '/js/render3d.js';

const q = new URLSearchParams(location.search), $ = (id) => document.getElementById(id);
const W = +q.get('w') || 1080, H = +q.get('h') || 1920, canvas = $('c');
$('n').value = q.get('n') || 100; $('d').value = q.get('cap') || 160; $('aa').checked = q.get('aa') === '1';
const field = new Battlefield(canvas, { width: W, height: H, maxDetailed: +$('d').value, antialias: $('aa').checked, preserveDrawingBuffer: q.get('shot') === '1' });
const CLS = ['novice', 'knight', 'archer', 'mage', 'assassin'];
function makeMatch(n, seed = 7) {
  const players = []; for (let i = 0; i < n; i++) { const lvl = 1 + ((i * 7) % 40), cls = lvl >= 10 ? CLS[1 + (i % 4)] : 'novice'; players.push({ userId: 'u' + i, name: 'P' + i, team: i % 2 ? 'blue' : 'red', level: lvl, cls, bonusPct: i % 9 === 0 ? 20 : 0 }); }
  return new Match({ seed, players });
}
let match, acc = 0, last = performance.now(), frames = 0, fpsT = last, fps = 0, ft = [];
function reset(n) { field.resetUnits(); match = makeMatch(n); $('nv').textContent = n; }
const stepDt = () => match.dt;
await field.load((p) => { $('out').textContent = 'loading ' + Math.round(p * 100) + '%'; });
reset(+$('n').value);
$('n').oninput = () => reset(+$('n').value);
$('d').oninput = () => { field.o.maxDetailed = +$('d').value; field._order = null; $('dv').textContent = $('d').value; };

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; ft.push(dt * 1000); acc += dt;
  while (acc >= stepDt()) { acc -= stepDt(); if (match.done) { reset(+$('n').value); break; } match.step(); field.onEvents(match.drainEvents(), match); }
  field.update(match, dt, acc / stepDt()); const t0 = performance.now(); field.render(); const renderMs = performance.now() - t0;
  frames++; if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; const s = field.stats; const sorted = [...ft].sort((a, b) => a - b); const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0; ft = [];
    window.__stat = { fps, drawCalls: s.drawCalls, units: s.units, detailed: s.detailed, p95, renderMs, tris: field.renderer.info.render.triangles };
    $('out').textContent = `FPS ${fps.toFixed(1)}\nframe p95 ${p95.toFixed(1)} ms\nrender() ${renderMs.toFixed(1)} ms\ndraw calls ${s.drawCalls}\ntriangles ${window.__stat.tris}\nunits ${s.units} (animated ${s.detailed})\nmatch t=${match.t.toFixed(1)}s` }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true; window.__field = field; window.__setN = (n) => { $('n').value = n; reset(n); };
