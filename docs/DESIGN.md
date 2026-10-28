# RED vs BLUE — TikTok LIVE Game Design (Draft V1)

> เอกสารสรุปแนวคิดและข้อตกลงจากการออกแบบร่วมกัน ณ ปัจจุบัน สำหรับนำไปพัฒนาต่อ

## 1. ภาพรวมเกม

เกมสงครามสองทีม **RED vs BLUE** สำหรับ TikTok LIVE แนวตั้ง 9:16 ผู้ชมแต่ละคนมีทหารประจำตัว 1 ตัว เลือกทีมผ่านแชต แล้วทหารต่อสู้อัตโนมัติ เป้าหมายคือบุกทำลายฐานอีกฝ่าย แต่ละ Match ใช้เวลาสั้นและเล่นวนต่อเนื่อง

หลักการ:
- เข้าร่วมง่าย ไม่ต้องใช้เว็บไซต์ เมนู Inventory หรือควบคุมทหารเอง
- ตัวละครมี Level, Stats, Class และการเปลี่ยนร่าง
- ผู้เล่นฟรีพัฒนาและปลดล็อกทุก Class ได้
- Gift ใช้เพิ่ม **Bonus Stats + Aura** โดยสะสมระหว่าง Match แล้วแสดงผลหลัง Match
- ไม่จำเป็นต้องทำให้สองทีมมีพลังเท่ากัน แต่ต้องรักษาความสนุกและความอ่านง่ายของรายการ

## 2. วงจรหลักของเกม

1. ผู้ชมพิมพ์ `แดง` หรือ `น้ำเงิน` เพื่อเข้าทีมและมีทหารของตัวเอง
2. ระหว่าง Match ทหารเดินและโจมตีอัตโนมัติ; ผู้ชมเชียร์และกดหัวใจเพื่อฝึกทหาร
3. ระบบสะสม EXP และเหตุการณ์ Gift ตามตัวละคร
4. จบ Match ประกาศผู้ชนะและผลงานเด่น
5. แสดงรายชื่อและ Stats ของผู้เล่นในครึ่งจอบน; ครึ่งจอล่างเล่น Cutscene ของผู้ที่เปลี่ยน Class / Evolve / ได้ Aura ตามคิว
6. เมื่อเล่น Cutscene ครบแล้ว จึงเริ่ม Match ถัดไป

## 3. ตัวละครและ Stats

ทุกผู้ชมมีทหารหนึ่งตัวซึ่งมีความก้าวหน้าข้าม LIVE

| Stat | ความหมาย |
|---|---|
| ATK | พลังโจมตี |
| HP | พลังชีวิต |
| DEF | พลังป้องกัน |
| ASPD | ความเร็วโจมตี |

ค่าตั้งต้น สูตรดาเมจ การเพิ่ม Stat ต่อ Level และอัตรา EXP **ยังไม่ล็อก** ต้องทดสอบใน Combat Simulation

## 4. การเติบโตฟรี: Hearts / Battle EXP / Level

- กดหัวใจ ❤️ เพื่อรับ **Training EXP** หากช่องทางเชื่อมต่อสามารถระบุผู้กด Like เป็นรายบุคคลได้จริง
- ต่อสู้เพื่อรับ **Battle EXP** แม้ไม่ได้กดหัวใจ
- EXP เพิ่ม Level และ Base Stats อัตโนมัติ
- ควรมีข้อจำกัด EXP จากการกดหัวใจต่อช่วงเวลา/Match เพื่อลดการสแปม และไม่บังคับให้ต้องกดตลอด
- ถ้าเชื่อมต่อแล้วเห็นได้เฉพาะยอดหัวใจรวม ต้องใช้กติกาสำรอง เช่น โบนัสฝึกส่วนรวม **ห้ามแอบอ้างว่าเป็น EXP รายบุคคล**

## 5. ระบบ Class สำหรับผู้เล่นฟรี

ทุกคนเริ่มต้นเป็น **Novice** เมื่อถึง **Lv.10** จะปลดล็อกการเลือก Class ผ่านแชต โดยพิมพ์ครั้งเดียว:

| คำสั่ง | Class | บทบาท |
|---|---|---|
| `1` | Knight | แนวหน้า รับดาเมจ |
| `2` | Archer | ยิงไกล โจมตีต่อเนื่อง |
| `3` | Mage | เวทมนตร์ โจมตีหมู่ |
| `4` | Assassin | โจมตีเร็ว จัดการเป้าหมาย |

กติกาที่ตกลงกัน:
- เลือก Class ได้ **ทุกช่วงยกเว้นระหว่าง Match ที่กำลังต่อสู้**
- ต้อง Lv.10+ และยังไม่ได้เลือก Class
- เลือกแล้วบันทึกทันที และใช้ Class ใหม่ใน Match ถัดไป
- ถ้าเลือกทันคิว Cutscene หลัง Match ปัจจุบัน ให้แสดงรอบนั้น; ถ้าไม่ทันให้แสดงรอบถัดไป โดยไม่เลื่อนสิทธิ์ใช้งาน Class
- ถ้ายังไม่เลือก สามารถเล่นต่อและสะสม EXP ได้
- Class ที่เลือกแล้วเป็นสายหลักของตัวละคร; เส้นทางวิวัฒนาการขั้นสูงเปิดให้ผู้เล่นฟรีทุกคน
- สกิลและรายละเอียดวิวัฒนาการแต่ละ Class **ยังต้องออกแบบต่อ**

## 6. Gift = Bonus Stats + Aura

- Gift เพิ่ม **Bonus Stats** และพัฒนา **Aura** ของตัวละคร
- Gift ที่เข้ามาระหว่าง Match จะถูกบันทึกเป็น **Pending Upgrade** โดย **ยังไม่เปลี่ยนพลังที่ใช้ต่อสู้ใน Match ปัจจุบัน**
- หลัง Match รวม Gift ของผู้เล่นคนเดียวกัน คำนวณ Bonus Stats และ Aura แล้วแสดง Cutscene เปลี่ยนร่าง
- Bonus Stats มีผลในการต่อสู้ตั้งแต่ **Match ถัดไป**
- Gift หลายรายการของผู้เล่นคนเดียวกันใน Match เดียว รวมเป็น Cutscene เดียว
- ผู้สนับสนุนทุกคนที่อยู่ในคิวต้องได้แสดง Cutscene ไม่ข้ามเพียงเพราะ Gift มูลค่าน้อย
- ระดับ Aura, อัตรา Bonus Stats, ความถาวรหรือการรีเซ็ตตามซีซัน **ยังไม่ตัดสินใจ** ต้องประกาศเงื่อนไขชัดเจนก่อนเปิดจริง

## 7. Post-Match Flow — แบบกระชับ

### A. Result + Class Selection

- ประกาศทีมชนะ / MVP
- แสดงรายชื่อผู้เล่นที่ Lv.10+ และยังไม่ได้เลือก Class พร้อมคำอธิบาย `1 Knight / 2 Archer / 3 Mage / 4 Assassin`
- เปิดรับคำสั่งเลือก Class ระหว่างช่วงหลัง Match และก่อนเริ่ม Match ใหม่

### B. Evolution Cutscene

รูปแบบหน้าจอแนวตั้ง:
- **ครึ่งบน:** รายชื่อผู้เล่นทั้งหมด พร้อมชื่อ, Level, Class, Stats; หากคนเยอะให้เลื่อนหรือแบ่งหน้า
- **ครึ่งล่าง:** เล่น Cutscene ของผู้เล่นที่มีการเปลี่ยน Class, Evolution หรือได้รับ Gift Bonus/Aura ทีละคน แสดงชื่อ, Before/After, Stat ที่เปลี่ยน และ Aura
- หากผู้เล่นคนเดียวมีทั้งการเปลี่ยน Class และ Gift Upgrade ให้รวมเป็น Cutscene เดียว
- เล่นคิวครบทุกคนแล้วค่อยเริ่ม Match ใหม่
- ระหว่าง Cutscene ยังเลือก Class ได้ แต่ต้องมีจุดปิดคิวที่ชัดเจนเพื่อไม่ให้เพิ่มคิวไม่สิ้นสุด; คนที่เลือกหลังปิดคิวจะได้ใช้ Class รอบหน้า และฉาย Cutscene ในรอบหลังจากนั้น
- หากไม่มีใครต้องเล่น Cutscene ให้ข้ามช่วงนี้

ระยะเวลา Cutscene เบื้องต้นประมาณ **4 วินาที/คน** (ยังต้องทดสอบความเหมาะสมกับจำนวนผู้ชม)

## 8. สนามรบและจำนวนผู้เล่น

- ใช้สนามแนวตั้ง **เลนกว้างเดียว** ฐานแดงด้านบน ฐานน้ำเงินด้านล่าง
- ทหารผู้เล่นแต่ละคนอยู่ในสนามจริง ต่อสู้อัตโนมัติ ตายแล้วเกิดใหม่ตามกติกา
- ไม่บังคับจำนวนหรือพลังสองทีมให้เท่ากัน
- อาจเติมทหาร AI เมื่อสนามโล่งหรือฝ่ายหนึ่งไม่มีคน เพื่อให้เกิดการต่อสู้ แต่ไม่ใช้ AI แอบลบผลของ Bonus Stats
- เมื่อมีผู้เล่นหลายร้อยคน ต้องจัดการการวาดภาพ/ชื่อให้จออ่านง่าย; ไฮไลต์ชื่อเฉพาะเหตุการณ์สำคัญระหว่างรบ

## 9. สิ่งที่ต้องออกแบบ/ทดสอบต่อ

1. **Combat:** สูตรดาเมจ, ระยะโจมตี, AI, Respawn, การบุกฐาน และสกิล 4 Class
2. **Progression:** สูตร EXP จาก Like/การรบ, Level Curve, Base Stats, ความเร็วในการถึง Lv.10
3. **Evolution:** ขั้นวิวัฒนาการแต่ละ Class, Aura Tier, Bonus Stats, อายุโบนัส และ Cutscene
4. **Broadcast UI:** จอ 9:16 ระหว่างรบและหลังเกม, การเลื่อนรายชื่อ, พื้นที่ไม่โดน TikTok UI บัง
5. **Queue & State:** กำหนดเวลาล็อก Match/ปิดคิว Cutscene, รองรับเหตุการณ์เข้าช้าหรือซ้ำ, บันทึกข้อมูลข้าม LIVE
6. **TikTok Integration:** ยืนยันการเข้าถึง Chat/Like/Gift Event และ User ID ตามช่องทางเชื่อมต่อที่ใช้งานจริง
7. **Policy:** ตรวจสอบข้อกำหนด TikTok LIVE ก่อนผูก Gift กับประโยชน์ในเกม; ไม่ทำระบบเดิมพันหรือรางวัลแลกเงินตามผลแพ้ชนะ
8. **Scale Test:** ทดสอบ 50, 100, 500+ ตัวละคร และจำนวน Cutscene ที่มากในหนึ่ง Match

## 10. สถานะการตัดสินใจ

**ล็อกแนวคิดแล้ว:** RED/BLUE, ทหารส่วนตัว, Auto Combat, Stats 4 ค่า, ฟรี EXP/Level, Lv.10 เลือก Class ผ่าน `1–4`, เลือกได้ทุกช่วงยกเว้นกลาง Match, Gift สะสมเพื่อ Bonus Stats + Aura หลัง Match, Post-Match สองช่วง, Cutscene ทุกคนในคิวก่อนเริ่มรอบใหม่

**ยังเปิดให้ตัดสินใจ:** สูตรและตัวเลข Balance, สกิล Class, Evolution Tree, การจับคู่ Gift กับ Bonus, การคงอยู่ของ Bonus/Aura, เวลาของแต่ละช่วง, รายละเอียด Bot, วิธีรับ Like รายบุคคล และข้อตกลงแพลตฟอร์ม


---

# Implementation decisions (v1 build)

| Topic | Decision |
|---|---|
| Delivery | Web page (Three.js) captured by OBS at 1080×1920; Node server + Postgres |
| Team | Chosen once per LIVE via chat; may switch only when no match is in progress (post-match window / lobby) |
| Match | 150 s limit (`config/balance.js`); win = destroy enemy base, timeout = higher base HP; filler skeleton bots keep each side ≥ 6 and never get Bonus Stats |
| EXP | Battle EXP (participation, kills, damage, survive, win) + Training EXP from per-user Likes capped per match |
| Class | Novice → `1–4` at Lv.10, any time except mid-match; saved at once, active next match; cutscene this round only if picked before the queue closes |
| Gifts | Persisted on arrival (dedupe by event id; streaks counted at streak end); **no effect in the current match**; merged per viewer after the match into Aura tier + Bonus % (permanent by default) |
| Post-match | A: result/MVP + class-pick window · queue close · B: roster paged on top half, cutscene on bottom half (≈4 s each, shortened to fit a 120 s total cap) |
| Open items still placeholders | stat curves, class kits/skills, evolution tiers (Lv.10/25/40 multipliers), aura tier thresholds/percentages, class balance |
