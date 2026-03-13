> Historical pre-PostgreSQL implementation note. Archived after MongoDB runtime removal.

# สรุปการพัฒนา: ระบบเช็กสลิป SlipOK ในกลุ่มออเดอร์ (LINE)

> อัปเดตล่าสุด: 2025-12-17

## ภาพรวม
ระบบนี้ช่วยตรวจสลิปแบบ “ง่าย ๆ” ใน **LINE Group/Room** สำหรับกลุ่มออเดอร์ โดย:
- ตอบกลับ **เฉพาะเมื่อมีรูปภาพ (image)** ถูกส่งในกลุ่ม/ห้องที่เปิดใช้งานไว้
- ถ้าเป็น **ข้อความ (text)** ในกลุ่ม/ห้อง → **ไม่ตอบ**
- ผลตรวจใช้ SlipOK API และตอบกลับในกลุ่มด้วยข้อมูลที่ API ส่งกลับ (ถ้ามี)

## วิธีใช้งาน (สำหรับแอดมิน)
1. ไปหน้า `/admin/settings2` → แท็บ “แจ้งเตือนออเดอร์”
2. สร้าง/แก้ไข “ช่องทางแจ้งเตือน” ที่ชี้ไปกลุ่ม/ห้องออเดอร์ (Sender Bot + ปลายทาง)
3. เปิด “ตรวจสลิป SlipOK” แล้วกรอก:
   - `SlipOK API URL` (เช่น `https://api.slipok.com/api/line/apikey/57824`)
   - `SlipOK API Key` (เช่น `SLIPOKWU4P56T`)
4. ในกลุ่ม/ห้องนั้น เมื่อมีคนส่ง “รูปภาพ” เข้ามา ระบบจะตรวจและตอบกลับผลอัตโนมัติ

## รูปแบบข้อความตอบกลับ (ตามข้อมูลที่ API ส่งกลับ)
### สลิปถูกต้อง
- “✅ สลิปถูกต้อง”
- “💰 จำนวนเงิน” (ถ้ามี)
- “👤 ผู้โอน” (ถ้ามี)
- “🏦 ผู้รับ” (ถ้ามี)
- “🕒 เวลา” (ถ้ามี)
- “🏛️ ธนาคารผู้โอน/ผู้รับ” จะแสดงเป็น “bank code” ถ้า API ส่งมา (เช่น `004`)

### สลิปไม่ถูกต้อง/ตรวจไม่ได้
- “❌ ตรวจสลิปไม่ผ่าน (code)” (ถ้ามี code)
- ข้อความ error จาก SlipOK (`message`)
- ถ้า SlipOK แนบ `data` กลับมา ระบบจะแสดงข้อมูลที่มีในสลิปเท่าที่มีให้ (เช่น amount/time)

## โครงสร้างข้อมูล (MongoDB)
เก็บไว้ใน `notification_channels.settings` (ต่อ “ช่องทางแจ้งเตือน”)
```js
{
  slipOkEnabled: Boolean,
  slipOkApiUrl: String,
  slipOkApiKey: String
}
```

## การทำงานฝั่งระบบ (สรุป)
- เมื่อ LINE webhook ได้ event จาก `group|room`:
  - ยัง capture กลุ่ม/ห้องเข้า `line_bot_groups` เหมือนเดิม
  - ถ้าเป็น `message:image` → ตรวจว่ามี `notification_channels` ที่เปิด `slipOkEnabled` สำหรับ `senderBotId + groupId` หรือไม่
  - ถ้ามี → ดาวน์โหลดรูปจาก LINE (`getMessageContent`) → เรียก SlipOK → ตอบกลับด้วย `replyMessage` (fallback เป็น `pushMessage` เมื่อไม่มี replyToken)

## ไฟล์ที่เกี่ยวข้อง
- Backend:
  - `index.js`
  - `services/slipOkService.js`
- Admin UI:
  - `views/partials/modals/notification-channel-modal.ejs`
  - `public/js/notification-channels.js`
- เอกสาร:
  - `docs/slipok-slip-check-plan.md`
