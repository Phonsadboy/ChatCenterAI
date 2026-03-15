# คู่มือระบบแจ้งเตือนออเดอร์: LINE + Telegram Group

## 1) ขอบเขตของฟีเจอร์
เอกสารนี้ครอบคลุมระบบ "แจ้งเตือนออเดอร์" ที่รองรับปลายทาง 2 แบบ:
- `line_group`
- `telegram_group`

รองรับครบ 3 โหมดเหมือนกัน:
- Realtime (`new_order`)
- Scheduled Summary (`order_summary`)
- Test (`test`)

> หมายเหตุ: ฟีเจอร์ **SlipOK** ยังเป็นความสามารถเฉพาะ `line_group` เท่านั้น

---

## 2) ผลการตรวจสอบแบบละเอียด (รอบนี้)

ตรวจผ่านแล้ว:
- โค้ด backend endpoint/admin API/scheduler/service สำหรับ Telegram
- ความเข้ากันได้ย้อนหลังของ channel เก่าที่ไม่มี `type` (ตีความเป็น `line_group`)
- การซ่อน/ปิด SlipOK เมื่อเลือกปลายทาง Telegram ใน UI
- syntax check
  - `node --check index.js`
  - `node --check services/notificationService.js`
  - `node --check public/js/notification-channels.js`

ข้อจำกัดการทดสอบในเครื่องที่ต้องรู้:
- ยังไม่ได้ยิง Telegram webhook และส่งข้อความจริงกับ bot token/group จริง
- การทดสอบ end-to-end ต้องมี `PUBLIC_BASE_URL` ที่เป็น HTTPS และเข้าจากภายนอกได้

---

## 3) โครงสร้างระบบ (ภาพรวม)

1. แอดมินสร้าง Telegram Sender Bot ที่หน้า `settings2 > แจ้งเตือนออเดอร์`
2. ระบบเรียก `getMe` และ `setWebhook` อัตโนมัติ
3. Telegram ส่ง update เข้า `/webhook/telegram/:botId`
4. ระบบตรวจ header `X-Telegram-Bot-Api-Secret-Token`
5. ระบบเก็บกลุ่ม/แชนแนลที่พบลง `telegram_bot_groups`
6. แอดมินสร้าง Notification Channel แบบ `telegram_group`
7. เมื่อมีออเดอร์ใหม่หรือถึงเวลาสรุป ระบบส่งข้อความ/รูปไป Telegram Group
8. บันทึกผลส่งลง `notification_logs`

---

## 4) สิ่งที่ต้องเตรียมก่อนใช้งาน

- ตั้งค่า `.env`
  - `PUBLIC_BASE_URL` ต้องเป็น HTTPS
  - URL ต้องเข้าถึงได้จากอินเทอร์เน็ต
- เซิร์ฟเวอร์ต้องเปิดรับเส้นทาง:
  - `POST /webhook/telegram/:botId`
- มี Telegram bot token จาก BotFather
- เพิ่ม bot เข้า group เป้าหมาย (หรือ channel ถ้าต้องการ)

แนะนำตรวจค่า `PUBLIC_BASE_URL`:
- ต้องไม่เป็น `http://`
- ตัวอย่างที่ถูกต้อง: `https://your-domain.com`

---

## 5) ขั้นตอนใช้งาน (สำหรับแอดมิน)

### 5.1 เพิ่ม Telegram Sender Bot
ไปหน้า `settings2 > แจ้งเตือนออเดอร์ > Telegram Sender Bots`

1. กด `เพิ่ม Telegram Bot`
2. กรอก:
   - ชื่อบอท
   - Telegram Bot Token
   - สถานะ
3. กดบันทึก

ผลที่ถูกต้อง:
- ระบบบันทึกสำเร็จ
- webhook ถูกตั้งอัตโนมัติ
- ถ้า `setWebhook` ไม่สำเร็จ: ระบบจะไม่บันทึก bot

### 5.2 ให้ระบบจับกลุ่ม Telegram อัตโนมัติ
1. เพิ่ม bot เข้ากลุ่ม Telegram
2. ส่งข้อความในกลุ่ม 1 ครั้ง (หรือให้เกิด event ที่ระบบจับได้)
3. กด `รีเฟรช` ในส่วน Telegram Sender Bots/หน้าสร้าง channel

ระบบจะจับ update จากชนิดต่อไปนี้:
- `message`
- `edited_message`
- `channel_post`
- `my_chat_member`

### 5.3 สร้างช่องทางแจ้งเตือนแบบ Telegram
ไปที่ `ช่องทางแจ้งเตือน > สร้างช่องทาง`

1. เลือกปลายทาง `Telegram Group`
2. เลือก `Telegram Bot (ผู้ส่ง)`
3. เลือก `Telegram Group (ปลายทาง)`
4. ตั้งค่า source filter / delivery mode / summary times / message settings
5. บันทึก

---

## 6) การตั้งค่า Delivery Mode

### Realtime
- ส่งทันทีเมื่อเกิดออเดอร์ใหม่
- รองรับแนบรูปทั้งหมดที่ระบบดึงได้จากแชท

### Scheduled Summary
- ส่งตามเวลาที่กำหนด (`HH:mm`)
- ใช้ logic สรุปเวลาเดิมร่วมกับ LINE
- รองรับแนบรูปทั้งหมดที่พบในรอบสรุป

### Test
- กดปุ่มทดสอบจากรายการ channel
- ระบบส่งข้อความทดสอบไปยังปลายทางที่ตั้งไว้

---

## 7) พฤติกรรมสำคัญที่ต้องรู้

- Channel เก่าที่ไม่มี `type` จะถูกมองเป็น `line_group` อัตโนมัติ
- ตั้งค่า SlipOK ได้เฉพาะ LINE เท่านั้น
- เมื่อปลายทางเป็น Telegram:
  - UI จะซ่อนส่วน SlipOK
  - backend จะบังคับเคลียร์ค่า SlipOK (`enabled=false`, URL/key ว่าง)
- Telegram sender bot มีสถานะ `active/inactive` และเปิด/ปิดใช้งานได้จากหน้าแอดมิน

---

## 8) API ที่เกี่ยวข้อง

### Telegram sender bots
- `GET /admin/api/telegram-notification-bots`
- `POST /admin/api/telegram-notification-bots`
- `PUT /admin/api/telegram-notification-bots/:id`
- `PATCH /admin/api/telegram-notification-bots/:id/toggle`
- `DELETE /admin/api/telegram-notification-bots/:id`
- `GET /admin/api/telegram-notification-bots/:botId/groups`

### Notification channels
- `GET /admin/api/notification-channels`
- `POST /admin/api/notification-channels`
- `PUT /admin/api/notification-channels/:id`
- `PATCH /admin/api/notification-channels/:id/toggle`
- `DELETE /admin/api/notification-channels/:id`
- `POST /admin/api/notification-channels/:id/test`

### Telegram webhook
- `POST /webhook/telegram/:botId`
  - ตรวจ `X-Telegram-Bot-Api-Secret-Token`

---

## 9) โครงสร้างข้อมูลที่เพิ่ม/ใช้

### `telegram_notification_bots`
เก็บ Telegram sender bot สำหรับแจ้งเตือนออเดอร์

ข้อมูลหลัก:
- `_id`
- `name`
- `botToken`
- `botUsername`
- `botUserId`
- `webhookUrl`
- `webhookSecretToken`
- `webhookSetAt`
- `status`
- `isActive`
- `createdAt`, `updatedAt`

### `telegram_bot_groups`
เก็บปลายทางที่ระบบจับได้จาก webhook

ข้อมูลหลัก:
- `botId`
- `chatId`
- `chatType`
- `title`
- `username`
- `status`
- `lastEventType`
- `lastEventAt`
- `joinedAt`, `leftAt`

### `notification_channels`
รองรับทั้ง LINE/Telegram

Telegram fields:
- `type: "telegram_group"`
- `telegramBotId`
- `telegramChatId`

### `notification_logs`
บันทึกผลการส่ง
- `eventType`: `new_order` / `order_summary` / `test`
- `status`: `success` / `failed`

---

## 10) ดัชนี (Indexes)

- `telegram_notification_bots`
  - `{ status: 1, updatedAt: -1 }`
  - `{ isActive: 1, updatedAt: -1 }`
  - `{ botUserId: 1 }`
- `telegram_bot_groups`
  - unique `{ botId: 1, chatId: 1 }`
  - `{ botId: 1, status: 1, lastEventAt: -1 }`
- `notification_channels`
  - `{ telegramBotId: 1, telegramChatId: 1 }`

---

## 11) Test Checklist (แนะนำรันจริงก่อน production)

1. สร้าง Telegram sender bot ด้วย token ถูกต้อง
   - คาดหวัง: บันทึกผ่าน, webhook ถูกตั้ง
2. สร้างด้วย token ผิด/ตั้ง webhook ไม่สำเร็จ
   - คาดหวัง: บันทึกไม่ผ่าน
3. เพิ่มบอทเข้ากลุ่มแล้วส่งข้อความ
   - คาดหวัง: กลุ่มปรากฏใน dropdown
4. สร้าง channel แบบ Telegram (realtime) แล้วกด test
   - คาดหวัง: ได้ข้อความในกลุ่ม
5. สร้างออเดอร์ใหม่ที่มีรูป
   - คาดหวัง: ได้ข้อความ + รูปครบ
6. ตั้ง channel Telegram แบบ scheduled
   - คาดหวัง: ส่งสรุปตรงเวลา + แนบรูป
7. เปิด LINE channel เดิมพร้อมกัน
   - คาดหวัง: LINE ยังส่งได้ปกติ
8. ตรวจ `notification_logs`
   - คาดหวัง: มีทั้ง success/failed ครบทั้ง `line_group` และ `telegram_group`

---

## 12) Troubleshooting

### A) บันทึก Telegram bot ไม่ได้
ตรวจ:
- token ถูกต้องจาก BotFather
- `PUBLIC_BASE_URL` เป็น HTTPS จริง
- domain เข้าจากภายนอกได้
- firewall/reverse proxy เปิด route `/webhook/telegram/:botId`

### B) ไม่เห็นกลุ่ม Telegram ใน dropdown
ตรวจ:
- bot ถูกเพิ่มเข้ากลุ่มแล้ว
- มี event เข้า webhook แล้ว (ส่งข้อความ/เกิด my_chat_member)
- กดรีเฟรชรายการกลุ่ม
- ดู log server ว่ามี `[Telegram Group] Captured ...` หรือไม่

### C) กด Test แล้วไม่ส่ง
ตรวจ:
- channel active
- telegram bot active
- bot ยังอยู่ในกลุ่มปลายทาง
- ดู `notification_logs` สำหรับข้อความ error

### D) รูปไม่ขึ้นใน Telegram
ตรวจ:
- `PUBLIC_BASE_URL` เข้าถึงไฟล์รูปได้จากภายนอก
- URL รูปต้องเป็น HTTP/HTTPS ที่ Telegram เข้าถึงได้

---

## 13) ข้อเสนอแนะก่อน Go-Live

- ตั้ง monitoring ที่ webhook route
- เก็บ log เฉพาะ error สำคัญจาก Telegram API
- สร้าง smoke test รายวัน (test channel 1 ตัว)
- ตรวจ TTL และขนาด `notification_logs` ตามภาระงานจริง
