> Historical pre-PostgreSQL planning note. Archived after MongoDB runtime removal.

# แผนพัฒนา: ระบบเช็กสลิป SlipOK ในกลุ่มออเดอร์ (LINE)

> **Last updated:** 2025-12-17  
> **Status:** Draft  
> **Priority:** High  
> **Related:** `docs/notification-channels-development-plan.md`, `SlipOK API Guide.md`

## เป้าหมาย
- เมื่อมีคนส่ง **รูปภาพ** เข้า “กลุ่ม/ห้องออเดอร์” (LINE group/room) ที่ตั้งค่าไว้ → ระบบตรวจสลิปผ่าน **SlipOK** แล้วตอบกลับในกลุ่ม
- ถ้าสลิป “ผ่านการยืนยัน” → ตอบกลับอย่างน้อย: **สลิปถูกต้อง / จำนวนเงิน / คนโอน / คนรับเงิน / เวลาในสลิป**
- ถ้าสลิป “ไม่ถูกต้อง” หรือ “ไม่ใช่สลิป” → ตอบกลับพร้อมเหตุผลแบบสั้น ๆ
- ถ้าเป็น **ข้อความ** (text) ในกลุ่ม → **ไม่ตอบ**
- เปิดใช้งานได้แบบ **เลือกได้ต่อช่องทางแจ้งเตือนออเดอร์** (ไม่เปิดเป็นค่าเริ่มต้น)

## ให้สอดคล้องกับโปรเจ็กปัจจุบัน (จุดอ้างอิง)
- LINE Webhook: `POST /webhook/line/:botId` → loop `events` → `handleLineEvent(event, queueOptions)` (`index.js`)
- ปัจจุบัน group/room event ใน `handleLineEvent()` ทำแค่ `captureLineGroupEvent()` แล้ว `return;` (เพื่อลดการตอบในกลุ่ม)
- ระบบแจ้งเตือนออเดอร์: `notification_channels` + `services/notificationService.js` (ส่ง `pushMessage` ไปยัง groupId)
- หน้าแอดมินตั้งค่าช่องทางแจ้งเตือน:  
  - UI modal: `views/partials/modals/notification-channel-modal.ejs`  
  - Logic: `public/js/notification-channels.js`  
  - Backend CRUD: `/admin/api/notification-channels*` ใน `index.js`

## ขอบเขตงาน (MVP)
1. เพิ่มตัวเลือก “เปิดตรวจสลิป SlipOK ในกลุ่มนี้” ในการสร้าง/แก้ไข Notification Channel (Order Notifications)
2. เมื่อ LINE bot ได้รับ event ประเภท `message:image` จาก group/room ที่เปิดตัวเลือกนี้:
   - ดาวน์โหลดรูปจาก LINE (`lineClient.getMessageContent(message.id)`)
   - ส่งรูปไปตรวจที่ SlipOK (Check Slip API)
   - ตอบกลับผลในกลุ่ม (ใช้ `replyMessage` เป็นหลัก)
3. ไม่ตอบกลับเมื่อ event เป็น `message:text` หรือ message type อื่น ๆ ในกลุ่ม

## นอกขอบเขต (เลื่อนไป Phase 2+)
- Flex Message / ปุ่มยืนยันคำสั่งซื้อ
- Auto-match สลิปกับออเดอร์ (เช่นเทียบยอดกับออเดอร์ล่าสุด)
- Dashboard สรุปสลิป/โควต้า/สถิติในหน้าแอดมิน
- รองรับการตรวจสลิปบน Facebook/ช่องทางอื่น

## SlipOK API ที่ใช้ (อิง `SlipOK API Guide.md`)
### Check Slip
- **Method:** `POST`
- **URL:** `https://api.slipok.com/api/line/apikey/<YOUR_BRANCH_ID>`
- **Header:** `x-authorization: <YOUR_API_KEY>`
- **Body:** ส่งอย่างใดอย่างหนึ่ง: `data` (QR string) / `files` (รูป) / `url` (ลิงก์รูป)
- สำหรับกรณี LINE group/room จะใช้ **ไฟล์รูป** (`files`) เป็นหลัก
- การตั้งค่า **SlipOK API URL + API Key** ให้กรอกในหน้าแอดมิน (ไม่ใช้ env)

### รูปแบบผลลัพธ์ที่ต้องรองรับ
- Success: `HTTP 200` → `{ success: true, data: { success: true, ... } }`
- Fail: มักเป็น `HTTP 400/401` → `{ code, message, data? }` (บางกรณีมี `data` แนบรายละเอียดสลิปกลับมา)
- โค้ดที่เจอบ่อย (คาดการณ์จากเอกสาร): `1006, 1007, 1008, 1010, 1012, 1013, 1014, 1002, 1004`

## Data Model (MongoDB)
> ยึด pattern เดิม: เก็บ config ใน `notification_channels.settings` เพื่อให้ “เปิด/ปิดต่อกลุ่ม” ได้ และไม่กระทบโครงสร้างหลัก

### `notification_channels.settings` (เพิ่มฟิลด์)
ตัวอย่างโครงสร้างที่แนะนำ:
```js
{
  // ของเดิม (ข้อความแจ้งเตือนออเดอร์)
  template: "simple",
  includeCustomer: true,
  includeItemsCount: true,
  includeItemsDetail: true,
  includeAddress: true,
  includePhone: true,
  includePaymentMethod: true,
  includeTotalAmount: true,
  includeOrderLink: false,

  // เพิ่มใหม่ (SlipOK)
  slipOkEnabled: false,     // เปิดตรวจสลิปในกลุ่มนี้หรือไม่
  slipOkApiUrl: "",         // เช่น https://api.slipok.com/api/line/apikey/57824
  slipOkApiKey: ""          // เช่น SLIPOKWU4P56T
}
```

> หมายเหตุ: จะอัปเดต `normalizeNotificationChannelSettings()` (`index.js`) ให้รองรับค่าใหม่ + default

## Config
- ไม่ใช้ env สำหรับ SlipOK
- ตั้งค่า `SlipOK API URL` และ `SlipOK API Key` ในหน้าแอดมิน ต่อ “ช่องทางแจ้งเตือน” ที่ต้องการเปิดตรวจสลิป

## Flow การทำงาน (Runtime)
1. LINE ส่ง webhook event เข้ามาที่ `POST /webhook/line/:botId`
2. `handleLineEvent()` ตรวจว่าเป็น group/room:
   - ยังเรียก `captureLineGroupEvent()` เหมือนเดิม (เพื่อให้ UI เห็นกลุ่ม)
   - ยังคง `return` เพื่อไม่ประมวลผลแชทกลุ่ม แต่ถ้าเป็น `message:image` จะ trigger งานตรวจสลิปแบบ async แล้วค่อยตอบกลับ
3. เงื่อนไขก่อนตรวจสลิป
   - event ต้องเป็น `message` และ `message.type === "image"`
   - ต้องหา Notification Channel ที่ `isActive:true`, `type:"line_group"`, `senderBotId == botId`, `groupId == (event.source.groupId/roomId)` และ `settings.slipOkEnabled:true`
   - ต้องมี `settings.slipOkApiUrl` + `settings.slipOkApiKey`
   - ถ้าไม่เข้าเงื่อนไข → ignore (ไม่ตอบ)
4. ดาวน์โหลดรูปจาก LINE แล้ว call SlipOK
   - `lineClient.getMessageContent(message.id)` → Buffer
   - `POST` ไป SlipOK ด้วย `multipart/form-data` (`form-data` + `axios`) โดยใส่ field:
     - `files`: <image buffer>
5. ตอบกลับในกลุ่ม
   - ใช้ `lineClient.replyMessage(replyToken, { type:"text", text })` เป็นหลัก (ลด push quota)
   - ถ้าไม่มี `replyToken` (กรณี edge) ค่อย fallback เป็น `pushMessage(groupId, ...)`

## รูปแบบข้อความตอบกลับ (ตัวอย่าง)
### กรณีสลิปถูกต้อง
```
✅ สลิปถูกต้อง
💰 จำนวนเงิน: ฿1,000
👤 ผู้โอน: นาย A
🏦 ผู้รับ: ร้าน B
🕒 เวลา: 01/04/2020 10:15:07
```

### กรณีสลิปไม่ถูกต้อง/ไม่ใช่สลิป
```
❌ ตรวจสลิปไม่ผ่าน (1007)
รูปภาพไม่มี QR code
```

> หมายเหตุ: สามารถเพิ่ม “ธนาคารผู้โอน/ผู้รับ” จาก `sendingBank/receivingBank` (bank code) ได้ใน Phase 2
> (MVP: แสดงเฉพาะข้อมูลที่ SlipOK ส่งกลับ ถ้า field ไม่มีไม่ต้องแสดง)

## Error Handling (แนวทาง)
- `1006/1007/1008`: ตอบว่าไม่พบสลิป/ตรวจไม่ได้ พร้อม message สั้น ๆ
- `1010`: ตอบให้รอตามเวลาที่ SlipOK แจ้ง (ข้อความจาก API)
- `1012`: ตอบว่า “สลิปซ้ำ” พร้อมเวลาที่เคยส่ง (จาก `message`)
- `1013/1014`: ตอบว่าไม่ผ่านเงื่อนไข (ยอดไม่ตรง/บัญชีผู้รับไม่ตรง) และแสดงเหตุผล
- `1002/1003/1004`: ตอบว่า “ระบบตรวจสลิปไม่พร้อม/โควต้าไม่พอ” (พร้อม log ฝั่ง server)
- ตั้ง `timeout` และจับ error กรณี SlipOK ล่ม: ตอบ “ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่”

## แผนดำเนินงาน (สั้น + ตรวจรับได้)
### Phase 1 (MVP) — เปิดตรวจสลิปในกลุ่มออเดอร์
- [ ] เพิ่มฟิลด์ใน UI (toggle + SlipOK API URL + API Key) ต่อช่องทางแจ้งเตือน
- [ ] เพิ่ม `services/slipOkService.js` (call SlipOK + normalize response/error)
- [ ] เพิ่ม logic ใน `handleLineEvent()` สำหรับ group `message:image` เฉพาะกลุ่มที่เปิด `settings.slipOkEnabled`
- [ ] เพิ่มฟิลด์ใน UI modal + ส่งค่าไป backend (`views/partials/modals/notification-channel-modal.ejs`, `public/js/notification-channels.js`)
- [ ] อัปเดต `normalizeNotificationChannelSettings()` + mapping ใน `mapNotificationChannelDoc()` ให้คืนค่ากลับ UI ได้ถูกต้อง

**Acceptance (ทดสอบมือ)**
- เปิด “ตรวจสลิป SlipOK” ในช่องทางที่ชี้ไป group/room หนึ่ง
- ส่งข้อความในกลุ่ม → บอทไม่ตอบ
- ส่งรูปสลิปถูกต้อง → บอทตอบสลิปถูกต้อง + amount/sender/receiver/time
- ส่งรูปทั่วไป/สลิปไม่ถูกต้อง → บอทตอบว่าไม่ผ่านพร้อมเหตุผล

### Phase 2 — UX/ความแม่นยำ
- [ ] แยก template ข้อความตอบกลับ + จำกัดความยาวให้ปลอดภัย
- [ ] (optional) บันทึก log การตรวจสลิปลง DB เพื่อค้นย้อนกลับ
- [ ] (optional) ปุ่ม “เช็คโควต้า SlipOK” (เรียก quota endpoint) ในหน้าแอดมิน

## ความเสี่ยง/ข้อควรระวัง
- ความเร็วตอบกลับ: SlipOK call อาจทำให้ webhook ช้า → ควรทำแบบไม่ block เส้นทางหลัก (เช่นทำงาน async แล้วค่อย reply/push)
- Privacy: หลีกเลี่ยงการเก็บรูปสลิปลง DB หากไม่จำเป็น
- Secrets: ห้าม log API key และจำกัดการเข้าถึงหน้า config เฉพาะแอดมิน
- Rate/Quota: อาจต้องมีการกัน spam (ในอนาคต) หากมีการส่งรูปจำนวนมากในกลุ่ม

## Open Questions (ขอคอนเฟิร์ม)
ไม่มี (คอนเฟิร์มแล้ว: ตั้งค่า API ใน UI, ไม่ต้องมี config log/group-only, แสดงข้อมูลเท่าที่ API ส่งกลับ)
