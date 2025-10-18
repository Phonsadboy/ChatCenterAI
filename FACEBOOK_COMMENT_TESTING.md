# 📋 คู่มือการทดสอบระบบตอบคอมเมนต์ Facebook

เอกสารนี้อธิบายวิธีการทดสอบและตรวจสอบระบบตอบคอมเมนต์ Facebook อัตโนมัติใน ChatCenter AI

---

## 📚 สารบัญ

1. [ภาพรวมระบบ](#ภาพรวมระบบ)
2. [การตั้งค่าเบื้องต้น](#การตั้งค่าเบื้องต้น)
3. [การทดสอบด้วย Script](#การทดสอบด้วย-script)
4. [การทดสอบด้วยตัวเอง](#การทดสอบด้วยตัวเอง)
5. [การตรวจสอบ Logs](#การตรวจสอบ-logs)
6. [การแก้ปัญหา](#การแก้ปัญหา)

---

## 🎯 ภาพรวมระบบ

ระบบตอบคอมเมนต์ Facebook ประกอบด้วย 4 ส่วนหลัก:

### 1. **Webhook Handler**
- รับ comment events จาก Facebook
- อยู่ที่: `POST /webhook/facebook/:botId`
- ตรวจสอบ: `entry.changes[].field === "feed"`

### 2. **Comment Reply Logic**
- ฟังก์ชัน: `handleFacebookComment()`
- รองรับ 2 แบบ:
  - ✅ **Custom Message**: ตอบด้วยข้อความที่กำหนดไว้
  - 🤖 **AI Generated**: ใช้ OpenAI ตอบอัตโนมัติ

### 3. **Pull to Chat**
- ดึงผู้คอมเมนต์เข้าแชท Messenger
- ส่ง private message ผ่าน Facebook API
- บันทึกลง `chat_history`

### 4. **Logging System**
- บันทึกทุก comment interaction
- Collection: `facebook_comment_logs`
- ใช้สำหรับ analytics และ debugging

---

## ⚙️ การตั้งค่าเบื้องต้น

### ขั้นตอนที่ 1: เตรียม Facebook Page

1. ไปที่ **Facebook Developers** → สร้างหรือเลือก App
2. เพิ่ม Product: **Messenger** และ **Webhooks**
3. สร้าง Page Access Token สำหรับเพจที่ต้องการ
4. บันทึก Page Access Token ไว้

### ขั้นตอนที่ 2: เพิ่ม Facebook Bot ในระบบ

1. เข้า ChatCenter AI → Dashboard
2. คลิก **"เพิ่ม Facebook Bot"**
3. กรอกข้อมูล:
   - ชื่อบอท
   - Page ID
   - Page Access Token
   - โมเดล AI (เช่น gpt-4o)
4. คลิก **"สร้าง Webhook URL"**
5. คัดลอก **Webhook URL** และ **Verify Token**

### ขั้นตอนที่ 3: ตั้งค่า Webhook ใน Facebook

1. ใน Facebook Developers → Products → Webhooks
2. คลิก **"Edit Subscription"** สำหรับ Page
3. Subscribe to fields:
   - ✅ `feed` (สำหรับ comments)
   - ✅ `messages` (สำหรับ Messenger - ถ้าต้องการ)
4. ใส่:
   - **Callback URL**: Webhook URL จากระบบ
   - **Verify Token**: Verify Token จากระบบ
5. คลิก **"Verify and Save"**

### ขั้นตอนที่ 4: ตั้งค่าการตอบคอมเมนต์

1. ไปที่ **ตอบคอมเมนต์ FB** ในเมนู
2. เลือกเพจที่ต้องการ
3. คลิก **"เพิ่มโพสต์"**
4. กรอกข้อมูล:
   - **Post ID**: ระบุ Post ID (เช่น `123456789_987654321`)
   - **ประเภทการตอบ**:
     - Custom Message: ข้อความที่กำหนดเอง
     - AI: เลือกโมเดลและ System Prompt
   - **ดึงเข้าแชท**: เปิด/ปิด
   - **เปิดใช้งาน**: เปิดทันที (แนะนำให้ปิดก่อนจนกว่าจะทดสอบเสร็จ)
5. คลิก **"บันทึกการตั้งค่า"**

---

## 🧪 การทดสอบด้วย Script

### วิธีใช้งาน Test Script

1. **แก้ไขไฟล์ `test-comment-system.js`**

```javascript
const TEST_CONFIG = {
  pageId: "YOUR_PAGE_ID",        // เปลี่ยนเป็น Page ID จริง
  postId: "123456789_987654321", // เปลี่ยนเป็น Post ID จริง
  sendRealAPI: false,             // ตั้งเป็น true ถ้าต้องการส่ง API จริง
};
```

2. **รัน Test Script**

```bash
cd ChatCenterAI
node test-comment-system.js
```

3. **ตรวจสอบผลลัพธ์**

Script จะทดสอบ 9 ส่วน:
- ✅ Database Connection
- ✅ Facebook Bot Exists
- ✅ Comment Config Exists
- ✅ Custom Message Reply
- ✅ AI Reply
- ✅ Pull to Chat
- ✅ Save Comment Log
- ✅ Webhook Structure
- ✅ Webhook Configuration

### ตัวอย่างผลลัพธ์ที่ถูกต้อง

```
============================================================
🧪 เริ่มทดสอบระบบตอบคอมเมนต์ Facebook
============================================================

📊 [TEST 1] ทดสอบการเชื่อมต่อ Database...
✅ เชื่อมต่อ Database สำเร็จ

🤖 [TEST 2] ทดสอบการดึงข้อมูล Facebook Bot...
✅ พบ Facebook Bot: My Shop Page
   - Page ID: 123456789
   - Status: active
   - Has Access Token: true

⚙️  [TEST 3] ทดสอบการดึง Comment Config...
✅ พบ Comment Config:
   - Post ID: 123456789_987654321
   - Reply Type: ai
   - Pull to Chat: Yes
   - Is Active: Yes

...

============================================================
📊 สรุปผลการทดสอบ
============================================================
✅ Database Connection
✅ Facebook Bot Exists
✅ Comment Config Exists
✅ Custom Message Reply
✅ AI Reply
✅ Pull to Chat
✅ Save Comment Log
✅ Webhook Structure
✅ Webhook Configuration

============================================================
ผลรวม: 9/9 ทดสอบผ่าน
🎉 ระบบพร้อมใช้งาน!
============================================================
```

---

## 🔬 การทดสอบด้วยตัวเอง

### ขั้นตอนที่ 1: ทดสอบ Webhook Verification

1. เปิด Terminal/Command Prompt
2. ทดสอบ GET request:

```bash
curl "https://your-domain.com/webhook/facebook/YOUR_BOT_ID?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

**ผลลัพธ์ที่คาดหวัง:**
```
test123
```

### ขั้นตอนที่ 2: ทดสอบการตอบคอมเมนต์

#### วิธีที่ 1: ทดสอบจริงบน Facebook

1. ไปที่โพสต์ที่ตั้งค่าไว้
2. แสดงความคิดเห็น
3. รอ 3-5 วินาที
4. ตรวจสอบว่าระบบตอบคอมเมนต์หรือไม่

#### วิธีที่ 2: จำลอง Webhook Event

ส่ง POST request ไปที่ webhook endpoint:

```bash
curl -X POST https://your-domain.com/webhook/facebook/YOUR_BOT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [
      {
        "id": "PAGE_ID",
        "time": 1234567890,
        "changes": [
          {
            "field": "feed",
            "value": {
              "item": "comment",
              "verb": "add",
              "post_id": "123456789_987654321",
              "comment_id": "test_comment_123",
              "message": "สินค้าราคาเท่าไหร่คะ",
              "from": {
                "id": "test_user_456",
                "name": "ลูกค้าทดสอบ"
              }
            }
          }
        ]
      }
    ]
  }'
```

### ขั้นตอนที่ 3: ตรวจสอบระบบดึงเข้าแชท

1. คอมเมนต์บนโพสต์ที่เปิด "ดึงเข้าแชท"
2. ตรวจสอบ Messenger ว่าได้รับข้อความ private message หรือไม่
3. ไปที่หน้า **แชท** ในระบบ
4. ตรวจสอบว่ามีผู้ใช้ใหม่ปรากฏหรือไม่

---

## 📊 การตรวจสอบ Logs

### 1. ตรวจสอบ Server Logs

```bash
# ดู logs แบบ real-time
tail -f logs/app.log

# หรือใช้ pm2 (ถ้ามี)
pm2 logs chatcenter
```

**คำสำคัญที่ควรหา:**
- `[Facebook Comment] Processing comment from`
- `[Facebook Comment] Replied to comment`
- `[Facebook Comment] Sent private message to pull`

### 2. ตรวจสอบ Database Logs

เชื่อมต่อ MongoDB และตรวจสอบ collection:

```javascript
// MongoDB Shell
use chatbot

// ดู comment logs ล่าสุด
db.facebook_comment_logs.find().sort({timestamp: -1}).limit(10).pretty()

// นับจำนวน comments ที่ตอบแล้ว
db.facebook_comment_logs.countDocuments({replyMessage: {$exists: true}})

// ดู comments ที่ pull to chat แล้ว
db.facebook_comment_logs.find({pulledToChat: true}).pretty()
```

### 3. ตรวจสอบใน Admin UI

1. ไปที่หน้า **ตอบคอมเมนต์ FB**
2. ตรวจสอบสถานะของแต่ละโพสต์:
   - 🟢 เปิดใช้งาน = กำลังทำงาน
   - 🔴 ปิดใช้งาน = ไม่ทำงาน

---

## 🔧 การแก้ปัญหา

### ปัญหา 1: ระบบไม่ตอบคอมเมนต์

**สาเหตุที่เป็นไปได้:**

1. **Config ไม่ได้เปิดใช้งาน**
   - ✅ ตรวจสอบ: ไปที่หน้า "ตอบคอมเมนต์ FB" → ดูสถานะ
   - 🔧 แก้ไข: คลิกปุ่ม "เปิดใช้งาน"

2. **Post ID ไม่ถูกต้อง**
   - ✅ ตรวจสอบ: Post ID ต้องเป็นรูปแบบ `PAGE_ID_POST_ID`
   - 🔧 หา Post ID: คลิกขวาที่โพสต์ → "Copy link" → ดูตัวเลขท้าย URL

3. **Webhook ไม่ได้ subscribe field `feed`**
   - ✅ ตรวจสอบ: Facebook Developers → Webhooks → Page Subscriptions
   - 🔧 แก้ไข: Subscribe to `feed` field

4. **Access Token หมดอายุ**
   - ✅ ตรวจสอบ: ทดสอบ API ด้วย Graph API Explorer
   - 🔧 แก้ไข: สร้าง Long-lived Token ใหม่และอัปเดตในระบบ

### ปัญหา 2: AI ตอบไม่ถูกต้อง

**สาเหตุที่เป็นไปได้:**

1. **System Prompt ไม่เหมาะสม**
   - 🔧 แก้ไข: แก้ไข System Prompt ให้ชัดเจนขึ้น
   - 💡 ตัวอย่างที่ดี:
     ```
     คุณคือผู้ช่วยตอบคอมเมนต์ของร้านขายเสื้อผ้า
     - ตอบสั้น ไม่เกิน 2 ประโยค
     - ใช้ภาษาเป็นกันเอง
     - ราคาเสื้อ 299 บาท กางเกง 399 บาท
     - ส่งฟรีเมื่อซื้อครบ 1000 บาท
     ```

2. **โมเดล AI ไม่เหมาะกับงาน**
   - 🔧 แนะนำ:
     - `gpt-4o`: ความแม่นยำสูง แต่ช้ากว่า
     - `gpt-4o-mini`: เร็วและถูก เหมาะกับงานทั่วไป ✅

3. **OPENAI_API_KEY ไม่ถูกต้อง**
   - ✅ ตรวจสอบ: ไฟล์ `.env` → `OPENAI_API_KEY=sk-...`
   - 🔧 แก้ไข: สร้าง API Key ใหม่จาก OpenAI Platform

### ปัญหา 3: ระบบดึงเข้าแชทไม่ทำงาน

**สาเหตุที่เป็นไปได้:**

1. **Permission ไม่ครบ**
   - ✅ ตรวจสอบ: Facebook App → Permissions
   - 🔧 ต้องมี:
     - `pages_messaging`
     - `pages_read_engagement`
     - `pages_manage_metadata`

2. **User เคยมี chat history แล้ว**
   - ℹ️ ระบบจะดึงเฉพาะ user ที่ยังไม่เคยคุยเท่านั้น
   - ✅ ตรวจสอบ: Query database
     ```javascript
     db.chat_history.findOne({senderId: "USER_ID"})
     ```

3. **Facebook API Error**
   - ✅ ตรวจสอบ: Server logs → หาคำว่า `Error sending private message`
   - 🔧 แก้ไข: อ่าน error message จาก Facebook API

### ปัญหา 4: Webhook ไม่ทำงาน

**วิธีตรวจสอบ:**

1. **ทดสอบ Webhook Verification**
   ```bash
   curl "https://your-domain.com/webhook/facebook/BOT_ID?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test"
   ```
   - ✅ ผลลัพธ์: ต้องได้ `test`
   - ❌ ถ้าไม่ได้: server ไม่ทำงานหรือ verify token ผิด

2. **ตรวจสอบ SSL Certificate**
   - Facebook ต้องการ HTTPS และ SSL certificate ที่ valid
   - 🔧 ใช้ Let's Encrypt หรือ Cloudflare

3. **ตรวจสอบ Firewall**
   - ตรวจสอบว่า Facebook สามารถเข้าถึง server ได้
   - Port ต้องเปิด (โดยปกติคือ 443 สำหรับ HTTPS)

---

## 📝 Checklist ก่อนใช้งานจริง

### ✅ เตรียมการ

- [ ] เพิ่ม Facebook Bot ในระบบแล้ว
- [ ] สร้าง Webhook URL และ Verify Token แล้ว
- [ ] ตั้งค่า Webhook ใน Facebook Developers แล้ว
- [ ] Subscribe to `feed` field แล้ว
- [ ] Page Access Token ถูกต้องและไม่หมดอายุ

### ✅ การตั้งค่า

- [ ] ตั้งค่าการตอบคอมเมนต์สำหรับโพสต์แล้ว
- [ ] Post ID ถูกต้อง (รูปแบบ `PAGE_ID_POST_ID`)
- [ ] เลือกประเภทการตอบ (Custom หรือ AI)
- [ ] ถ้าใช้ AI: ตั้งค่า System Prompt แล้ว
- [ ] เลือกเปิด/ปิด "ดึงเข้าแชท" ตามต้องการ

### ✅ การทดสอบ

- [ ] รัน test script แล้ว: `node test-comment-system.js`
- [ ] ทดสอบคอมเมนต์บน Facebook แล้ว
- [ ] ระบบตอบคอมเมนต์สำเร็จ
- [ ] (ถ้าเปิด) ระบบดึงเข้าแชทสำเร็จ
- [ ] ตรวจสอบ logs ใน database แล้ว

### ✅ ความปลอดภัย

- [ ] ไม่ share Access Token กับคนอื่น
- [ ] เก็บ `.env` ไว้ใน `.gitignore`
- [ ] Webhook URL ต้องใช้ HTTPS
- [ ] ตั้งค่า rate limiting (ถ้าจำเป็น)

---

## 🎯 ข้อแนะนำเพิ่มเติม

### 1. การใช้ AI อย่างมีประสิทธิภาพ

- ✅ **System Prompt ควรชัดเจน**: ระบุบุคลิก ข้อจำกัด และข้อมูลสำคัญ
- ✅ **เลือกโมเดลให้เหมาะสม**: gpt-4o-mini เร็วและถูกพอ
- ✅ **ทดสอบก่อนเปิดใช้งาน**: ตั้งค่าเป็น "ปิดใช้งาน" และทดสอบก่อน
- ⚠️ **ระวัง Token Usage**: AI จะมีค่าใช้จ่ายตาม usage

### 2. การจัดการ Comments

- 💡 แนะนำให้ตอบด้วย Custom Message สำหรับคำถามที่ซ้ำๆ บ่อยๆ
- 💡 ใช้ AI สำหรับคำถามที่หลากหลายและต้องการความยืดหยุ่น
- 💡 เปิด "ดึงเข้าแชท" เมื่อต้องการติดตามลูกค้าต่อ

### 3. การ Monitor

- 📊 ตรวจสอบ `facebook_comment_logs` เป็นประจำ
- 📊 ดู error logs ใน server
- 📊 Monitor OpenAI usage (ถ้าใช้ AI)

### 4. Performance

- ⚡ ระบบจะตอบคอมเมนต์ภายใน 3-5 วินาที
- ⚡ ถ้าใช้ AI อาจช้ากว่า (5-10 วินาที) ขึ้นกับโมเดล
- ⚡ Pull to chat จะทำงานพื้นหลัง ไม่กระทบความเร็วในการตอบ

---

## 📞 ติดต่อและขอความช่วยเหลือ

หากพบปัญหาหรือต้องการความช่วยเหลือ:

1. ตรวจสอบเอกสารนี้อีกครั้ง
2. ดู error logs ใน server
3. ตรวจสอบ Facebook Webhook Logs ใน Developers Dashboard
4. ติดต่อทีมพัฒนา

---

## 🔄 Version History

- **v1.0** (2024): เอกสารฉบับแรก
  - ครอบคลุมการทดสอบพื้นฐาน
  - รองรับ Custom Message และ AI Reply
  - รองรับ Pull to Chat

---

**หมายเหตุ:** เอกสารนี้อาจมีการอัปเดตตามการพัฒนาระบบ กรุณาตรวจสอบเวอร์ชันล่าสุด