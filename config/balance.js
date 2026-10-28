// ALL game numbers live here (the design doc leaves them open — tune with `npm run sim`). Works in Node and in the browser.
export const BALANCE = {
  match: {
    durationSec: 150,        // hard time limit of one match
    tickHz: 20,              // simulation steps per second
    field: { w: 36, h: 64 }, // world units (9:16)
    baseHpBase: 3000,        // base HP = baseHpBase + baseHpPerPlayer * players on that team
    baseHpPerPlayer: 90,
    baseRadius: 3.6,
    baseDamageMult: 0.55,    // units hit bases for a fraction of normal damage
    respawnSec: 6,
    escalateAfterSec: 35,    // after this, respawn delay grows by respawnGrowth seconds per second (breaks stalemates)
    respawnGrowth: 0.2,
    minTeamSize: 6,          // filler bots keep both sides at least this big
    botLevelFactor: 0.8,     // bot level = average player level * factor (never gets gift bonuses)
    aggroRange: 11,
    retargetSec: 0.4,
  },
  stats: { // Lv.1 values and growth per level
    base: { atk: 10, hp: 100, def: 2, aspd: 1.0 },
    perLevel: { atk: 1.3, hp: 15, def: 0.4, aspd: 0.008 },
    levelCap: 60,
  },
  classes: { // multipliers on top of the level curve; range/speed in world units
    novice:   { name: 'Novice',   atk: 1.0,  hp: 1.0,  def: 1.0, aspd: 1.0,  range: 1.8, speed: 3.0, splash: 0 },
    knight:   { name: 'Knight',   atk: 0.9,  hp: 1.7,  def: 1.7, aspd: 0.9,  range: 1.9, speed: 2.8, splash: 0 },
    archer:   { name: 'Archer',   atk: 1.1,  hp: 0.81, def: 0.7,  aspd: 1.15, range: 9.0, speed: 3.0, splash: 0 },
    mage:     { name: 'Mage',     atk: 1.1,  hp: 0.8,  def: 0.65, aspd: 0.75, range: 7.0, speed: 2.8, splash: 2.0, splashMult: 0.35 },
    assassin: { name: 'Assassin', atk: 1.45, hp: 0.97, def: 0.96, aspd: 1.3,  range: 1.7, speed: 4.3, splash: 0, crit: 0.25, critMult: 2.0 },
  },
  skills: { // one signature skill per class (placeholders until the design is final)
    knight:   { cd: 12, kind: 'guard',  durationSec: 3, taken: 0.4, healPct: 0.1 },
    archer:   { cd: 9,  kind: 'volley', targets: 3, mult: 0.8 },
    mage:     { cd: 11, kind: 'meteor', radius: 4.5, mult: 2.4 },
    assassin: { cd: 8,  kind: 'dash',   mult: 2.6 },
  },
  evolution: [ // placeholder tiers: level needed and multiplier on all stats
    { level: 10, mult: 1.0 }, { level: 25, mult: 1.15 }, { level: 40, mult: 1.3 },
  ],
  classUnlockLevel: 10,
  damage: { defK: 40 },     // damage = atk * (1 - def / (def + defK)), min 1
  exp: {
    toNextBase: 40, toNextPow: 1.35,   // exp to go from level L to L+1 = round(base * L^pow)
    participation: 25, perKill: 15, perDamageDivisor: 20, survive: 10, winBonus: 30,
    likePerLike: 1, likeCapPerMatch: 20, // training EXP from hearts
  },
  gifts: {
    enabled: true,                     // policy switch: false = gifts give nothing in game
    auraTiers: [ // cumulative diamonds -> aura tier, bonus % applied to stats from the next match
      { tier: 0, name: 'None',     minPoints: 0,     color: '#9aa4b2', bonusPct: 0 },
      { tier: 1, name: 'Spark',    minPoints: 50,    color: '#7ee787', bonusPct: 2 },
      { tier: 2, name: 'Flame',    minPoints: 300,   color: '#ffa657', bonusPct: 5 },
      { tier: 3, name: 'Radiance', minPoints: 1500,  color: '#79c0ff', bonusPct: 9 },
      { tier: 4, name: 'Nova',     minPoints: 8000,  color: '#d2a8ff', bonusPct: 14 },
      { tier: 5, name: 'Mythic',   minPoints: 40000, color: '#ffd33d', bonusPct: 20 },
    ],
    bonusLifetime: 'permanent',        // 'permanent' | 'season' (reset when the season number changes)
  },
  post: { cutsceneSec: 4, classPickWindowSec: 12, queueCloseBeforeEndSec: 0 },
};
