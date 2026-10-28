// Pure game rules shared by the server, the game page and the balance simulator.
import { BALANCE } from '../config/balance.js';

export const CLASS_KEYS = ['knight', 'archer', 'mage', 'assassin'];
export const TEAMS = ['red', 'blue'];

export const evoTier = (level, cls, B = BALANCE) => (cls === 'novice' || !cls ? 0 : B.evolution.reduce((t, e, i) => (level >= e.level ? i + 1 : t), 0));
export const evoMult = (level, cls, B = BALANCE) => (evoTier(level, cls, B) === 0 ? 1 : B.evolution[evoTier(level, cls, B) - 1].mult);

// Final combat stats of a soldier. bonusPct comes from the Aura tier (gifts) and is 0 for bots.
export function statsFor({ level = 1, cls = 'novice', bonusPct = 0 }, B = BALANCE) {
  const L = Math.max(1, Math.min(level, B.stats.levelCap)), c = B.classes[cls] || B.classes.novice, g = L - 1, e = evoMult(L, cls, B), p = bonusPct / 100;
  return {
    atk: (B.stats.base.atk + B.stats.perLevel.atk * g) * c.atk * e * (1 + p),
    hp: (B.stats.base.hp + B.stats.perLevel.hp * g) * c.hp * e * (1 + p),
    def: (B.stats.base.def + B.stats.perLevel.def * g) * c.def * e * (1 + p / 2),
    aspd: (B.stats.base.aspd + B.stats.perLevel.aspd * g) * c.aspd * (1 + p / 3),
  };
}
export const roundStats = (s) => ({ atk: Math.round(s.atk), hp: Math.round(s.hp), def: +s.def.toFixed(1), aspd: +s.aspd.toFixed(2) });

export const expToNext = (level, B = BALANCE) => Math.round(B.exp.toNextBase * Math.pow(Math.max(1, level), B.exp.toNextPow));
// exp = EXP already collected inside the current level. Returns the new level/exp and how many levels were gained.
export function addExp(level, exp, gain, B = BALANCE) {
  let L = level, e = exp + Math.max(0, Math.round(gain)), up = 0;
  while (L < B.stats.levelCap && e >= expToNext(L, B)) { e -= expToNext(L, B); L++; up++; }
  if (L >= B.stats.levelCap) e = 0;
  return { level: L, exp: e, levelsGained: up };
}

export const auraFor = (points, B = BALANCE) => B.gifts.auraTiers.reduce((best, t) => (points >= t.minPoints ? t : best), B.gifts.auraTiers[0]);
// Gift value -> aura points (1 diamond = 1 point). `diamonds` is the TOTAL of the gift event.
export const giftPoints = (diamonds, B = BALANCE) => (B.gifts.enabled ? Math.max(0, Math.round(diamonds)) : 0);

export function battleExp({ damage = 0, kills = 0, survived = false, won = false }, B = BALANCE) {
  return Math.round(B.exp.participation + kills * B.exp.perKill + damage / B.exp.perDamageDivisor + (survived ? B.exp.survive : 0) + (won ? B.exp.winBonus : 0));
}
// training EXP from hearts, capped per match
export const likeExp = (count, alreadyGiven = 0, B = BALANCE) => Math.max(0, Math.min(Math.round(count * B.exp.likePerLike), B.exp.likeCapPerMatch - alreadyGiven));

export const classUnlocked = (level, cls, B = BALANCE) => cls === 'novice' && level >= B.classUnlockLevel;
