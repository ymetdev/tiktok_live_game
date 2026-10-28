// Prepare the KayKit (CC0) character models for the game: copy + keep only the animation clips we use (files shrink ~5x).
//   node tools/fetch-assets.mjs                      (uses ../kaykit-game-assets/* if present, otherwise git-clones the official repos)
//   KAYKIT_DIR=/path/with/the/packs node tools/fetch-assets.mjs
// itch.io downloads are click-through, so the official GitHub mirrors are used; or unzip a pack into assets/incoming/ yourself.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'public/assets/models');
const srcRoots = [process.env.KAYKIT_DIR, path.join(root, 'assets/incoming'), path.join(root, '../kaykit-game-assets')].filter(Boolean);
const PACKS = [
  { repo: 'kaykit-character-pack-adventures-1.0', dir: 'kaykit_character_pack_adventures', files: ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded'] },
  { repo: 'kaykit-character-pack-skeletons-1.0', dir: 'kaykit_character_pack_skeletons', files: ['Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue', 'Skeleton_Minion'] },
];
// clips the game uses (see config/assets.json): everything else (sitting, jumping, lying down…) is dropped
const KEEP = new Set(['Idle', 'Running_A', 'Hit_A', 'Death_A', 'Cheer', 'Block', 'Spellcast_Raise', 'Spellcast_Shoot', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Spin',
  '1H_Ranged_Shoot', 'Dualwield_Melee_Attack_Slice', 'Dodge_Forward', 'Unarmed_Melee_Attack_Punch_A', 'Throw']);

function findPack(p) {
  for (const r of srcRoots) for (const cand of [path.join(r, p.repo), r]) { const d = path.join(cand, 'addons', p.dir, 'Characters/gltf'); if (fs.existsSync(d)) return path.join(cand); }
  const dest = path.join(root, '../kaykit-game-assets'); fs.mkdirSync(dest, { recursive: true });
  console.log('cloning', p.repo); execFileSync('git', ['clone', '--depth', '1', `https://github.com/KayKit-Game-Assets/${p.repo}`, path.join(dest, p.repo)], { stdio: 'inherit', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } });
  return path.join(dest, p.repo);
}

fs.mkdirSync(out, { recursive: true });
const io = new NodeIO(); let total = 0;
for (const p of PACKS) {
  const base = findPack(p), gl = path.join(base, 'addons', p.dir, 'Characters/gltf');
  for (const f of p.files) {
    const doc = await io.read(path.join(gl, f + '.glb')), kept = [];
    for (const a of doc.getRoot().listAnimations()) { if (KEEP.has(a.getName())) kept.push(a.getName()); else a.dispose(); }
    await doc.transform(resample(), prune(), dedup()); await io.write(path.join(out, f + '.glb'), doc);
    const sz = fs.statSync(path.join(out, f + '.glb')).size; total += sz; console.log(f.padEnd(18), (sz / 1e6).toFixed(2) + ' MB', kept.length + ' clips');
  }
  fs.copyFileSync(path.join(base, 'LICENSE.txt'), path.join(root, 'public/assets', `LICENSE-${p.dir}.txt`));
}
fs.writeFileSync(path.join(root, 'public/assets/CREDITS.txt'), 'Character models: KayKit — Character Pack: Adventurers 1.0 and Skeletons 1.0 by Kay Lousberg (www.kaylousberg.com), License CC0 1.0 (see LICENSE-*.txt).\nModels were repackaged (unused animation clips removed); not otherwise modified.\n');
console.log('total', (total / 1e6).toFixed(1), 'MB →', path.relative(root, out));
