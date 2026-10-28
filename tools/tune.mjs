// Tiny random-search tuner for class multipliers: finds numbers where the 4 classes beat each other about equally.
//   node tools/tune.mjs --iters 60 --level 25 --size 12 --runs 6
import { Match } from '../shared/sim/match.js';
import { BALANCE } from '../config/balance.js';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : +process.argv[i + 1]; };
const iters = arg('iters', 60), level = arg('level', 25), size = arg('size', 12), runs = arg('runs', 6);
const CL = ['knight', 'archer', 'mage', 'assassin'];
const team = (t, c) => Array.from({ length: size }, (_, i) => ({ userId: t + i, name: t + i, team: t, level, cls: c, bonusPct: 0 }));
function matrix() {
  const m = {}; let loss = 0;
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    let w = 0; for (let i = 0; i < runs; i++) { const swap = i & 1, r = new Match({ seed: 100 + i, players: swap ? [...team('red', CL[b]), ...team('blue', CL[a])] : [...team('red', CL[a]), ...team('blue', CL[b])], events: false }).runToEnd(); if (r.winner === (swap ? 'blue' : 'red')) w++; else if (r.winner === 'draw') w += 0.5; }
    m[CL[a] + '>' + CL[b]] = w / runs; loss += (w / runs - 0.5) ** 2;
  }
  return { m, loss };
}
const keys = ['atk', 'hp', 'def', 'aspd'];
const snap = () => JSON.stringify(BALANCE.classes);
let best = matrix(), bestSnap = snap();
console.log('start loss', best.loss.toFixed(3));
for (let it = 0; it < iters; it++) {
  const cls = CL[Math.floor(Math.random() * 4)], k = Math.random() < 0.15 && cls === 'mage' ? 'splashMult' : keys[Math.floor(Math.random() * 4)];
  const c = BALANCE.classes[cls], old = c[k]; c[k] = Math.max(0.3, +(old * (0.85 + Math.random() * 0.3)).toFixed(2));
  const r = matrix();
  if (r.loss < best.loss) { best = r; bestSnap = snap(); console.log(`it ${it}: ${cls}.${k} ${old} -> ${c[k]}  loss ${r.loss.toFixed(3)}`); } else c[k] = old;
}
Object.assign(BALANCE.classes, JSON.parse(bestSnap));
console.log('final loss', best.loss.toFixed(3)); console.log(JSON.stringify(best.m)); console.log(JSON.stringify(BALANCE.classes, null, 1));
