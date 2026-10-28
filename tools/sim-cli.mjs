// Combat Simulation: run many headless matches to tune config/balance.js.
//   node tools/sim-cli.mjs --runs 100 --red 30 --blue 30 --level 12 --seed 1
//   node tools/sim-cli.mjs --matrix --runs 40 --level 25      (class vs class win-rate matrix)
import { Match } from '../shared/sim/match.js';
import { BALANCE } from '../config/balance.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : isNaN(+process.argv[i + 1]) ? process.argv[i + 1] : +process.argv[i + 1]); };
// --set match.baseHpBase=2000 --set exp.winBonus=40 ... overrides balance values for this run (to try numbers before editing config/balance.js)
process.argv.forEach((a, i) => { if (a === '--set' && process.argv[i + 1]) { const [p, v] = process.argv[i + 1].split('='); const ks = p.split('.'); let o = BALANCE; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)] = isNaN(+v) ? v : +v; } });
const runs = arg('runs', 50), level = arg('level', 12), seed0 = arg('seed', 1);
const mk = (team, n, cls, lvl) => Array.from({ length: n }, (_, i) => ({ userId: `${team}${i}`, name: `${team}${i}`, team, level: lvl, cls: cls === 'mixed' ? ['knight', 'archer', 'mage', 'assassin'][i % 4] : cls, bonusPct: 0 }));
const classOf = (lvl) => (lvl >= BALANCE.classUnlockLevel ? 'mixed' : 'novice');

function batch(red, blue, n) {
  const s = { red: 0, blue: 0, draw: 0, dur: 0, base: 0 };
  for (let i = 0; i < n; i++) { const r = new Match({ seed: seed0 + i, players: [...red, ...blue], events: false }).runToEnd(); s[r.winner]++; s.dur += r.duration; if (r.reason === 'base') s.base++; }
  return { redWin: s.red / n, blueWin: s.blue / n, draw: s.draw / n, avgDur: s.dur / n, baseKillRate: s.base / n };
}
if (arg('matrix', false)) {
  const cs = ['novice', 'knight', 'archer', 'mage', 'assassin'], size = arg('size', 20), lvl = level < 10 ? 10 : level;
  console.log(`class vs class — ${size} v ${size}, level ${lvl}, ${runs} runs each (row = RED class win-rate; sides alternate)`);
  console.log(['        ', ...cs.map((c) => c.padEnd(9))].join(''));
  for (const a of cs) { const row = [a.padEnd(8)]; for (const b of cs) { const half = Math.ceil(runs / 2); const x = batch(mk('red', size, a, lvl), mk('blue', size, b, lvl), half), y = batch(mk('red', size, b, lvl), mk('blue', size, a, lvl), half); row.push((((x.redWin + y.blueWin) / 2) * 100).toFixed(0).padStart(4) + '%    '); } console.log(row.join(' ')); }
} else {
  const R = arg('red', 30), Bn = arg('blue', 30), cls = arg('class', classOf(level)), r = batch(mk('red', R, cls, level), mk('blue', Bn, cls, level), runs);
  console.log(`${R} red vs ${Bn} blue, level ${level}, class ${cls}, ${runs} runs`);
  console.log(`RED wins ${(r.redWin * 100).toFixed(0)}% | BLUE wins ${(r.blueWin * 100).toFixed(0)}% | draws ${(r.draw * 100).toFixed(0)}% | avg length ${r.avgDur.toFixed(0)}s | base destroyed in ${(r.baseKillRate * 100).toFixed(0)}% of matches`);
}
