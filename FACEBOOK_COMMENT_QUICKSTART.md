# 🚀 Quick Start: ระบบตอบคอมเมนต์ Facebook

คู่มือเริ่มต้นใช้งานระบบตอบคอมเมนต์ Facebook อัตโนมัติ

---

## 📋 ขั้นตอนการตั้งค่า (5 นาที)

### 1️⃣ เพิ่ม Facebook Bot

```
Dashboard → เพิ่ม Facebook Bot
├── ชื่อบอท: "My Shop"
├── Page ID: จาก Facebook Page
├── Access Token: จาก Facebook Developers
└── โมเดล AI: gpt-4o-mini (แนะนำ)
```

### 2️⃣ สร้าง Webhook

```
Dashboard → Facebook Bot → สร้าง Webhook URL
├── คัดลอก Webhook URL
├── คัดลอก Verify Token
└── นำไปตั้งค่าใน Facebook Developers
```

### 3️⃣ ตั้งค่า Facebook Webhook

```
Facebook Developers → Webhooks → Page
├── Callback URL: วาง Webhook URL
├── Verify Token: วาง Verify Token
├── Subscribe Fields: ✅ feed (สำคัญ!)
└── คลิก Verify and Save
```

### 4️⃣ ตั้งค่าการตอบคอมเมนต์

```
เมนู "ตอบคอมเมนต์ FB" → เลือกเพจ → เพิ่มโพสต์
├── Post ID: 123456789_987654321
├── ประเภทการตอบ:
│   ├── Custom Message: ข้อความคงที่
│   └── AI: ตอบอัตโนมัติด้วย AI ✨
├── ดึงเข้าแชท: เปิด/ปิด
└── เปิดใช้งาน: ปิดไว้ก่อน (ทดสอบก่อน)
```

### 5️⃣ ทดสอบระบบ

```bash
# วิธีที่ 1: ใช้ Test Script
cd ChatCenterAI
node test-comment-system.js

# วิธีที่ 2: ทดสอบจริงบน Facebook
# → ไปคอมเมนต์บนโพสต์
# → รอ 3-5 วินาที
# → ตรวจสอบว่าระบบตอบหรือไม่
```

---

## 🎯 วิธีหา Post ID

### วิธีที่ 1: จาก URL
```
URL: https://www.facebook.com/123456789/posts/987654321
Post ID: 123456789_987654321
```

### วิธีที่ 2: จาก Share Link
```
1. คลิกขวาที่โพสต์ → Copy Link
2. Paste ใน Browser
3. ดู URL ที่ถูก redirect → เอาตัวเลข 2 ชุดมาต่อด้วย _
```

### วิธีที่ 3: ใช้ Graph API Explorer
```
https://developers.facebook.com/tools/explorer/
GET: /me/posts
ดู id ของแต่ละโพสต์
```

---

## 💡 เคล็ดลับการใช้งาน

### ✅ Custom Message (แนะนำสำหรับ)
- คำถามที่ซ้ำๆ บ่อยๆ
- ข้อมูลที่ต้องการความแม่นยำ 100%
- ประหยัดค่าใช้จ่าย

**ตัวอย่าง:**
```
ขอบคุณที่สนใจนะคะ ✨
📱 ราคา: 299 บาท
🚚 ส่งฟรีเมื่อซื้อครบ 1,000 บาท
💬 สั่งซื้อได้ที่ Inbox เลยค่ะ
```

### 🤖 AI Reply (แนะนำสำหรับ)
- คำถามที่หลากหลาย
- ต้องการตอบตามบริบท
- ต้องการความยืดหยุ่น

**System Prompt ตัวอย่าง:**
```
คุณคือผู้ช่วยตอบคอมเมนต์ของร้านขายเสื้อผ้า "My Shop"
- ตอบสั้น ไม่เกิน 2-3 ประโยค
- ใช้ภาษาเป็นกันเอง มี emoji เล็กน้อย
- ข้อมูลสินค้า:
  • เสื้อ: 299 บาท
  • กางเกง: 399 บาท
  • ส่งฟรีเมื่อซื้อครบ 1,000 บาท
- หากมีคำถามซับซ้อน แนะนำให้ inbox
```

### 💼 ดึงเข้าแชท (Pull to Chat)
- เปิด: เมื่อต้องการติดตามลูกค้าต่อ
- ปิด: เมื่อต้องการตอบเฉพาะในคอมเมนต์

**กลไก:**
```
1. มีคนคอมเมนต์
2. ระบบตรวจสอบว่าเคยคุยหรือยัง
3. ถ้ายังไม่เคย → ส่ง private message
4. บันทึกลง chat_history
```

---

## 🔍 การตรวจสอบระบบ

### Server Logs
```bash
# ดู logs
tail -f logs/app.log

# หาคำสำคัญ
grep "Facebook Comment" logs/app.log
```

### Database Logs
```javascript
// MongoDB Shell
use chatbot

// ดู comment logs ล่าสุด
db.facebook_comment_logs.find().sort({timestamp: -1}).limit(5)

// นับจำนวนที่ตอบแล้ว
db.facebook_comment_logs.countDocuments()
```

### ตรวจสอบใน UI
```
ตอบคอมเมนต์ FB → ดูสถานะ
🟢 เปิดใช้งาน = กำลังทำงาน
🔴 ปิดใช้งาน = หยุดทำงาน
```

---

## 🚨 แก้ปัญหาเบื้องต้น

### ❌ ระบบไม่ตอบคอมเมนต์

**Check List:**
```
☑️ Config เปิดใช้งานแล้วหรือยัง?
☑️ Post ID ถูกต้องหรือไม่?
☑️ Webhook subscribe "feed" แล้วหรือยัง?
☑️ Access Token ยังใช้ได้หรือไม่?
```

**วิธีแก้:**
```bash
# 1. ทดสอบ Webhook
curl "https://your-domain.com/webhook/facebook/BOT_ID?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test"

# 2. ตรวจสอบ Server Logs
tail -f logs/app.log | grep "Facebook Comment"

# 3. ตรวจสอบ Database
mongo chatbot --eval "db.facebook_comment_configs.find().pretty()"
```

### ❌ AI ตอบไม่เหมาะสม

**วิธีแก้:**
```
1. แก้ไข System Prompt ให้ชัดเจนขึ้น
   - เพิ่มข้อมูลสินค้า
   - กำหนดรูปแบบการตอบ
   - ระบุขีดจำกัด

2. ลองเปลี่ยนโมเดล
   - gpt-4o-mini: เร็ว ถูก
   - gpt-4o: ช้ากว่า แต่แม่นกว่า

3. ทดสอบหลายครั้ง
   - แก้ Prompt → Save → ทดสอบ → Repeat
```

### ❌ ดึงเข้าแชทไม่ทำงาน

**วิธีแก้:**
```
1. ตรวจสอบ Permissions
   Facebook App → Settings → Permissions:
   ✅ pages_messaging
   ✅ pages_read_engagement
   ✅ pages_manage_metadata

2. ตรวจสอบว่า User เคยคุยหรือยัง
   mongo chatbot --eval 'db.chat_history.findOne({senderId: "USER_ID"})'

3. ดู Error ใน Server Logs
   grep "Error sending private message" logs/app.log
```

---

## 📊 ตัวอย่างการใช้งาน

### Use Case 1: ร้านค้าออนไลน์
```yaml
Post ID: โพสต์ขายสินค้า
Reply Type: AI
System Prompt: |
  คุณคือผู้ช่วยขายของร้าน XYZ
  - ตอบคำถามเกี่ยวกับสินค้า
  - แจ้งราคาและโปรโมชัน
  - ชวนลูกค้า inbox เพื่อสั่งซื้อ
Pull to Chat: เปิด (เพื่อติดตามการขาย)
```

### Use Case 2: ประกาศกิจกรรม
```yaml
Post ID: โพสต์ประกาศกิจกรรม
Reply Type: Custom Message
Message: |
  ขอบคุณที่สนใจกิจกรรมนะคะ 🎉
  📅 วันที่: 25 ธ.ค. 2567
  📍 สถานที่: Central World
  🎫 ลงทะเบียนได้ที่: bit.ly/event2024
Pull to Chat: ปิด (ไม่จำเป็น)
```

### Use Case 3: Customer Support
```yaml
Post ID: โพสต์รีวิวสินค้า
Reply Type: AI
System Prompt: |
  คุณคือทีม Support ของบริษัท ABC
  - ตอบคำถามเกี่ยวกับสินค้า
  - ขอโทษหากมีปัญหา
  - แนะนำให้ inbox เพื่อแก้ปัญหา
  - ไม่ให้คำมั่นสัญญาใดๆ
Pull to Chat: เปิด (เพื่อติดตามปัญหา)
```

---

## 🎓 Best Practices

### 1. การตั้งค่าเริ่มต้น
```
✅ ทดสอบด้วย "ปิดใช้งาน" ก่อน
✅ ลองส่งคอมเมนต์ทดสอบหลายแบบ
✅ ตรวจสอบการตอบว่าเหมาะสมหรือไม่
✅ เปิดใช้งานจริงเมื่อพร้อม
```

### 2. การเขียน System Prompt
```
✅ ระบุบทบาท: "คุณคือ..."
✅ กำหนดรูปแบบ: "ตอบสั้น ไม่เกิน..."
✅ ให้ข้อมูล: "ราคา... โปรโมชัน..."
✅ ตั้งขีดจำกัด: "ถ้าไม่รู้ให้..."
```

### 3. การ Monitor
```
✅ ตรวจสอบ logs เป็นประจำ
✅ ดูว่า AI ตอบถูกต้องหรือไม่
✅ ปรับ System Prompt ตามผลลัพธ์
✅ Monitor OpenAI usage (ค่าใช้จ่าย)
```

### 4. ความปลอดภัย
```
✅ เก็บ Access Token ไว้ใน .env
✅ ใช้ HTTPS สำหรับ Webhook
✅ ไม่ share Token กับใคร
✅ สร้าง Long-lived Token
```

---

## 📞 ติดต่อ

- 📖 เอกสารเต็ม: `FACEBOOK_COMMENT_TESTING.md`
- 🧪 Test Script: `test-comment-system.js`
- 💻 Source Code: `index.js` (function `handleFacebookComment`)

---

## ✨ สรุป

```
1. เพิ่ม Facebook Bot → สร้าง Webhook
2. ตั้งค่า Facebook Webhook (subscribe: feed)
3. เพิ่มการตั้งค่าโพสต์ (Post ID + Reply Type)
4. ทดสอบ → เปิดใช้งาน
5. Monitor และปรับแต่งตามผลลัพธ์
```

**เริ่มต้นใช้งานได้เลย! 🚀**