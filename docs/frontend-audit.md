# เอกสารตรวจ Frontend ChatCenter AI

## ส่วนที่ 1: จุดร่วม/ภาพรวมระบบ
- โทนสี/แบรนด์ไม่สอดคล้องกัน (style.css ใช้เขียว, orders ใช้น้ำเงิน, settings v2 ใช้ม่วง indigo) ทำให้ประสบการณ์ข้ามหน้าไม่ต่อเนื่อง ควรล็อกชุดสี/ตัวอักษรหลักเดียวกันแล้วผูกด้วย CSS variables
- ปุ่มและการ์ดถูกกำหนดซ้ำหลายชุด (.btn ใน style.css มีหลายเวอร์ชัน, gradients คละ) รวมถึง inline style ในหลายหน้า ส่งผลให้ความหนา-เงา-รัศมีไม่คงที่ ควรยกเลิก inline/ซ้ำซ้อนแล้วใช้ design tokens เดียว
- ฟอนต์/ขนาดตัวอักษรไม่สม่ำเสมอ (บางหน้าบังคับ Inter, บางหน้าติด Mali + base 14px ที่เล็ก) และ contrast สีเทาบางจุดต่ำ ควรปรับสเกลตัวอักษร/น้ำหนัก/contrast ให้ผ่านเกณฑ์ AA
- โครงสร้างหน้าไม่มี layout กลาง ทุกหน้าดึง Bootstrap/FA จาก CDN เอง ไม่มี SRI/เวอร์ชันล็อก และขาดองค์ประกอบคงที่ เช่น toast/loading/empty state มาตรฐาน ควรทำ layout partial + component library รวม
- การเข้าถึง (a11y): หลายจุดใช้ div/selection-card เป็นปุ่ม, badge ที่อ่านไม่ได้ด้วย screen reader, focus state ไม่ชัด ควรใช้ element เชิง semantics + focus ring สม่ำเสมอ
- การตอบสนองมือถือยังไม่เสมอ (ตารางใหญ่, แถบด้านข้าง, sidebar sticky สูงเต็มจอ) และไม่มี safe-area/keyboard awareness บางส่วน ควรวาง responsive spec (breakpoint, stack order, collapse pattern) กลาง

## ส่วนที่ 2: รายละเอียดรายหน้า

### Login (`views/admin-login.ejs`)
- หน้าเรียบมาก ขาดบริบทแบรนด์/ความปลอดภัย (env, เวอร์ชัน, ช่องทางติดต่อ) และไม่มี toggle แสดงรหัสผ่านหรือป้องกัน Caps Lock
- ข้อผิดพลาดแสดงเพียงกล่องเดียว ควรแยกสถานะ “รหัสหมดอายุ/ป้อนผิด/ระบบล้มเหลว” พร้อม feedback แบบ toast และ state บนปุ่ม
- ปุ่ม/ฟอร์มยังไม่ครอบ safe-area/mobiles (ยังไม่รองรับคีย์บอร์ด iOS และไม่มี remember/timeout indicator)

### แดชบอร์ด Instruction (`views/admin-dashboard-v2.ejs`)
- ใช้ inline CSS จำนวนมากและสไตล์ไม่ตรง design system หลัก ทำให้โทนและ spacing ต่างจากหน้าอื่น
- โครงสร้างเป็น list ยาว ไม่มี panel คงที่สำหรับรายละเอียด/preview ทำให้ต้อง scroll กลับขึ้นลงเมื่อแก้ไขหลายชุด
- ปุ่ม action ซ้ำสี่ปุ่มในทุกการ์ด ส่งผลให้หน้าดูรก ควรจัดเป็นเมนู/ชอร์ตคัตแบบ hover หรือ kebab menu
- ไม่มีตัวบ่งชี้สภาพการซิงก์/บันทึก (dirty state แสดงเฉพาะข้อความเล็ก) และไม่มี toast เตือนเมื่อบันทึก/ล้มเหลว
- Empty state / Loading state ใช้ข้อความธรรมดา ควรมี skeleton + CTA สร้างชุดแรก, filter chip ตามประเภท/วันที่, และ quick stats (จำนวน char/token) แปะบนหัวการ์ด

### แก้ไข Instruction (`views/edit-instruction.ejs`)
- UI ตารางยังเป็นตารางดิบ (resize มือ, scroll สูง) ไม่มี sticky toolbar หรือ preview แบบสองคอลัมน์ ทำให้แก้ยากเมื่อข้อมูลยาว
- ไม่มี autosave/unsaved confirmation เมื่อออกหน้า และไม่มีตัวนับ token/char ในโหมดตาราง
- ปุ่มควบคุมตาราง (เพิ่มคอลัมน์/แถว) ซ่อนในด้านบน ไม่มีป้ายบอกจำนวน/ข้อจำกัด ควรมีสรุปโครงสร้าง + ปุ่มย่อส่วน

### แก้ไข Data Item v2 (`views/edit-data-item-v2.ejs`)
- โทน gradient/เงาหนักและ inline style จำนวนมาก ไม่สอดคล้องกับหน้าหลัก และให้ความรู้สึก “แอปใหม่” แยกจากระบบ
- การเลื่อน/scroll ในตารางกึ่ง Excel ยังไม่ชัดเจนบนจอเล็ก และไม่มี sticky footer สำหรับปุ่มบันทึก/ย้อนกลับ
- ขาด state เตือนเมื่อมีการลบ/ยกเลิก, ไม่มี keyboard shortcut hint, ไม่มี preview โทเคน/ความยาวเนื้อหา

### บรอดแคสต์ (`views/admin-broadcast.ejs`)
- เลย์เอาต์ฟอร์มเรียงยาว ไม่มีขั้นตอนหรือสรุปด้านข้าง ทำให้ผู้ใช้ไม่เห็นภาพรวม (กลุ่มเป้าหมาย + ช่องทาง + ตัวอย่าง) พร้อมกัน
- การ์ดเลือกกลุ่มใช้งาน div + JS เพิ่ม class ไม่มี aria/focus, badge “จำนวนผู้รับ” ไม่ผูกข้อมูลจริง
- ไม่มีสรุปจำนวนผู้รับ/ช่องทางที่เลือก, ไม่มีตัวนับข้อความต่อช่องทาง, ไม่มีตั้งเวลาส่ง/ข้อจำกัดข้อความ
- Preview เป็นเพียงกล่องข้อความเดียว ไม่แยกตามแพลตฟอร์ม (LINE/Facebook) และไม่มี mock bubble

### แชทแอดมิน (`views/admin-chat.ejs` + `css/chat-redesign.css`)
- โทน/องค์ประกอบดีขึ้นแต่ยังขาดความสม่ำเสมอกับธีมหลัก (ใช้โทนเขียว/เทาเฉพาะหน้า) และไม่มี brand/header รวม
- Sidebar ผู้ใช้ไม่มี summary ต่อเพจ/ช่องทาง, badge unread ใช้พื้นหลังเต็มแถว (อ่านยาก) และ filter panel เปิด/ปิดแบบ display:none ไม่มี transition/a11y
- ส่วนข้อความไม่มี time separator/วันที่, ไม่มี typing/ส่งกำลังโหลด/สถานะส่ง, message feedback เป็นปุ่มเล็กไม่สอดคล้องกับ bubble
- Order sidebar ถูกซ่อนบน mobile โดยไม่มีปุ่มเรียก ทำให้ใช้บนมือถือไม่ได้
- Input bar ไม่มีป้ายสถานะ AI on/off, ช่องทาง, และไม่มี quick reply/template ชัดเจน (modal แยกทำให้ flow ขาด)

### ออเดอร์ (`views/admin-orders.ejs` + `css/orders.css`)
- พาเลตต์น้ำเงินคนละชุดกับธีมหลัก และตาราง/การ์ดใช้เงาหนัก ไม่ตรงหน้าอื่น
- ฟิลเตอร์จำนวนมากในบรรทัดเดียว ขาด grouping/ขั้นตอน (เช่น ฟิลเตอร์หลัก > ฟิลเตอร์เสริม) และไม่มี preset เช่น “วันนี้/7 วัน”
- ตารางไม่มี summary แถว/วันที่ติดกัน (delineation), sorting ไม่มีไอคอนชัดเจน, การกระทำไม่ sticky เมื่อ scroll ยาว
- Bulk action bar ลอยใต้หน้าจออาจบังเนื้อหา และไม่มีตัวบ่งชี้ผลลัพธ์การส่งออก/ล้างตัวกรองที่ชัดเจน
- Mobile view ยังเป็น table responsive ธรรมดา ไม่มีการ์ดรายการต่อแถวหรือ quick action สำหรับจอแคบ

### ติดตามลูกค้า (`views/admin-followup.ejs`)
- ใช้สไตล์จาก style.css เดิม ทำให้การ์ด/ปุ่มต่างจากหน้า orders/chat; palette ไม่นิ่ง
- Selector เพจ/บอทและรายการลูกค้ารวมอยู่หน้าเดียว ทำให้ scroll ยาวและ context สับสน ควรแยกเป็นสองคอลัมน์หรือมี summary bar ติดบน
- Filter pills ไม่มีสถานะนับผลลัพธ์/รวมตัวกรองอื่น (เช่น การแสดงรอบ, media) และไม่มี quick sort (ล่าสุด/เวลาถัดไป)
- Schedule preview และสถานะ auto-send เป็นข้อความเล็ก ไม่มี timeline แสดงเวลาถัดไป/ที่ส่งล่าสุดแบบชัด
- Modal การตั้งค่ามีข้อมูลเยอะ (prompt, rounds, toggles) แต่ไม่มี stepper/แถบสรุปผลลัพธ์ที่จะเกิดขึ้น

### โพสต์/คอมเมนต์ Facebook (`views/admin-facebook-posts.ejs`, `views/admin-facebook-comment.ejs`)
- คำอธิบายยาวใน alert เดียว อ่านยาก ไม่มีการแบ่งขั้นตอน/แผนภาพการทำงาน หรือสรุปสถานะ webhook/sync ล่าสุด
- Layout/สีเป็น bootstrap default + สีพื้นจาง ไม่สอดคล้องกับธีมหลัก, ป้ายสถานะ “จับอัตโนมัติ/เปิดปิด” ใช้ badge เล็กอ่านยาก
- ไม่มีตัวกรอง/ค้นหาโพสต์, ไม่มีวันที่/จำนวนคอมเมนต์/การเปิดใช้งานแสดงในรายการโพสต์
- Form “reply type” ใช้ selection-card ที่ไม่ semantic, ไม่มี preview ข้อความ/AI prompt, ไม่เตือน quota/token หรือเงื่อนไข Meta (rate limit)
- การซิงก์/รีเฟรชไม่มี state (last sync time, loading) และไม่มี empty state เฉพาะกรณีไม่มี page/ไม่มี post

### ตั้งค่า v2 (`views/admin-settings-v2.ejs`)
- โทน indigo/Inter ขัดกับธีมเขียว-Mali เดิม และ sidebar สูงเต็มหน้าจออาจชน navbar; mobile layout ยังไม่ได้กำหนด (ไม่มี toggle/sidebar drawer)
- Section ซ่อนด้วย class d-none ไม่มี aria-controls/focus management ทำให้ navigation ด้วยคีย์บอร์ดยาก
- Toggle switch ทำเอง ไม่มี focus/label ชัดเจน และไม่บันทึกสถานะ/แสดง toast หลังบันทึก
- รายการบอท/คลังรูป/assignment ยังเป็น placeholder ไม่มี skeleton หรือ empty state ชัดเจน, ปุ่มโหลดซ้ำไม่แสดงสถานะกำลังโหลด
- แบบฟอร์มยาวแต่ขาดการจัดกลุ่มตามบริบท (เช่น คิวแชท/AI/แจ้งเตือน) และไม่มี summary bar ที่บอกค่าใช้งานจริง

### ตั้งค่า v1 (`views/admin-settings.ejs`)
- เป็นดีไซน์คนละรุ่นกับ v2 ทำให้ผู้ใช้สับสนว่าจะใช้หน้าใด; nav tabs ไม่มีคำอธิบาย/สรุปผลกระทบต่อระบบ
- ใช้สี/ปุ่มจากสไตล์เดิม มี shadow/spacing ต่างจากหน้าอื่น และ modal หลายตัว (bot/image/instruction) ไม่มี indicator ระดับความคืบหน้า/ผลลัพธ์
- ควรประกาศสถานะหน้าว่า legacy/เตรียมย้าย และรวม content สำคัญไปยัง v2 พร้อมลิงก์ย้าย
