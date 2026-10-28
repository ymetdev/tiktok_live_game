// Parsing of viewer chat messages into game commands (Thai + English, Thai/fullwidth digits).
const THAI_DIGITS = { '๑': '1', '๒': '2', '๓': '3', '๔': '4' };
// Thai vowel/tone marks are stripped for matching so "น้ำเงิน", "นํ้าเงิน" and "นำเงิน" are all the same word.
const norm = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/[\s!.,'"“”‘’~_*]+/g, '').replace(/[ั-ฺ็-๎]/g, '')
  .replace(/[๑๒๓๔]/g, (d) => THAI_DIGITS[d]).replace(/[１２３４]/g, (d) => String('１２３４'.indexOf(d) + 1));
const RED = new Set(['แดง', 'ทมแดง', 'red', 'teamred', 'r']);
const BLUE = new Set(['นเงน', 'ทมนเงน', 'ฟ', 'ทมฟ', 'blue', 'teamblue', 'b']);
const CLASS = { 1: 'knight', 2: 'archer', 3: 'mage', 4: 'assassin', knight: 'knight', archer: 'archer', mage: 'mage', assassin: 'assassin' };

// -> { kind: 'team', team } | { kind: 'class', cls } | null   (exact commands only, so normal chatter is ignored)
export function parseChat(text) {
  const k = norm(text);
  if (!k || k.length > 14) return null;
  if (RED.has(k)) return { kind: 'team', team: 'red' };
  if (BLUE.has(k)) return { kind: 'team', team: 'blue' };
  if (CLASS[k]) return { kind: 'class', cls: CLASS[k] };
  return null;
}
