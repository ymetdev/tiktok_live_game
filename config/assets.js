// Which KayKit model / weapon / animation each class uses (edit here to re-skin the game).  Node names come from the KayKit glTF files.
export const ASSETS = {
  base: '/assets/models/',
  anim: { idle: 'Idle', run: 'Running_A', hit: 'Hit_A', death: 'Death_A', cheer: 'Cheer' },
  models: { // every optional weapon/prop node of a model: all are hidden unless a class lists it in `show`
    Knight:       { cape: 'Knight_Cape',  props: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword'] },
    Barbarian:    { cape: 'Barbarian_Cape', props: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug'] },
    Mage:         { cape: 'Mage_Cape',    props: ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff'] },
    Rogue:        { cape: 'Rogue_Cape',   props: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'] },
    Rogue_Hooded: { cape: 'Rogue_Cape',   props: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'] },
    Skeleton_Warrior: { cape: 'Skeleton_Warrior_Cloak', props: [] }, Skeleton_Mage: { cape: null, props: [] }, Skeleton_Rogue: { cape: null, props: [] }, Skeleton_Minion: { cape: null, props: [] },
  },
  classes: {
    novice:   { model: 'Barbarian',    show: ['1H_Axe'],                 attack: '1H_Melee_Attack_Chop',          skill: '2H_Melee_Attack_Spin' },
    knight:   { model: 'Knight',       show: ['1H_Sword', 'Badge_Shield'], attack: '1H_Melee_Attack_Slice_Diagonal', skill: 'Block' },
    archer:   { model: 'Rogue_Hooded', show: ['1H_Crossbow'],            attack: '1H_Ranged_Shoot',               skill: 'Throw' },
    mage:     { model: 'Mage',         show: ['2H_Staff'],               attack: 'Spellcast_Shoot',               skill: 'Spellcast_Raise' },
    assassin: { model: 'Rogue',        show: ['Knife', 'Knife_Offhand'], attack: 'Dualwield_Melee_Attack_Slice',  skill: 'Dodge_Forward' },
  },
  bots: [ // filler bots look like skeletons so nobody mistakes them for viewers
    { model: 'Skeleton_Warrior', show: [], attack: '1H_Melee_Attack_Slice_Diagonal', skill: 'Block' },
    { model: 'Skeleton_Minion',  show: [], attack: '1H_Melee_Attack_Chop',           skill: '2H_Melee_Attack_Spin' },
    { model: 'Skeleton_Rogue',   show: [], attack: 'Dualwield_Melee_Attack_Slice',   skill: 'Dodge_Forward' },
    { model: 'Skeleton_Mage',    show: [], attack: 'Spellcast_Shoot',                skill: 'Spellcast_Raise' },
  ],
  teamColors: { red: 0xff4b4b, blue: 0x4b8bff },
};
