# 🤖 ChatCenter AI

ระบบจัดการแชทบอท AI อัจฉริยะที่รองรับ LINE และ Facebook พร้อมฟีเจอร์ครบครัน

## ✨ ฟีเจอร์หลัก

### 🎯 Multi-Platform Chatbot
- **LINE Bot** - รองรับหลาย Bot พร้อม Webhook แยกต่างหาก
- **Facebook Messenger Bot** - จัดการแชทผ่าน Messenger
- **Facebook Comment Auto-Reply** - ตอบคอมเมนต์อัตโนมัติด้วย Custom Message หรือ AI

### 💬 Chat Management
- **Admin Chat Dashboard** - แชทแบบ Real-time ผ่าน Socket.IO
- **Multi-User Support** - จัดการแชทหลายผู้ใช้พร้อมกัน
- **Chat History** - บันทึกประวัติการสนทนาทั้งหมด
- **Image Support** - รองรับการส่งและแสดงรูปภาพ

### 🤖 AI Features
- **OpenAI Integration** - ใช้ GPT-4, GPT-4o, GPT-4o-mini
- **Custom Instructions** - กำหนดคำสั่งและบุคลิกของ AI
- **Image Recognition** - วิเคราะห์รูปภาพด้วย AI
- **Flexible Settings** - ปรับแต่งพารามิเตอร์ AI ได้หลากหลาย

### 📢 Broadcasting & Follow-up
- **Broadcast System** - ส่งข้อความถึงผู้ใช้หลายคนพร้อมกัน
- **Follow-up Tasks** - ติดตามและแจ้งเตือนลูกค้าอัตโนมัติ
- **Scheduled Messages** - กำหนดเวลาส่งข้อความล่วงหน้า

### 📚 Content Management
- **Instructions Library** - จัดเก็บและจัดการคำสั่งเป็นชุดๆ
- **Image Collections** - จัดกลุ่มรูปภาพแยกตาม Bot
- **Excel Import** - นำเข้าข้อมูลจากไฟล์ Excel
- **Export Functions** - ส่งออกเป็น JSON, Markdown, Excel

### ⚙️ System Features
- **Settings Dashboard** - จัดการค่าต่างๆ ของระบบ
- **MongoDB Backup** - สำรองข้อมูลอัตโนมัติ
- **Health Check** - ตรวจสอบสถานะระบบ
- **Google Sheets Integration** - เชื่อมต่อกับ Google Sheets

---

## 🚀 การติดตั้ง

### ข้อกำหนดระบบ
- **Node.js** >= 18.0.0
- **MongoDB** (Local หรือ Cloud)
- **OpenAI API Key**
- **LINE/Facebook Credentials** (ถ้าต้องการใช้งาน)

### ขั้นตอนการติดตั้ง

#### 1. Clone โปรเจค
```bash
git clone <repository-url>
cd ChatCenterAI
```

#### 2. ติดตั้ง Dependencies
```bash
npm install
```

#### 3. ตั้งค่า Environment Variables
สร้างไฟล์ `.env` จาก `env.example`:

```bash
cp env.example .env
```

แก้ไขค่าใน `.env`:
```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/chatbot

# OpenAI API Key (จำเป็น)
OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# Public URL (สำหรับ Webhook)
PUBLIC_BASE_URL=https://your-domain.com

# Admin Security (ใส่เมื่ออยากให้ระบบบังคับล็อกอิน)
ADMIN_MASTER_PASSCODE=your_master_passcode
ADMIN_SESSION_SECRET=replace_with_random_session_secret
# ADMIN_SESSION_TTL_SECONDS=43200  # (ไม่บังคับ) เวลา session มีผล (วินาที)
```

**หมายเหตุ:** LINE และ Facebook Bot สามารถตั้งค่าผ่านหน้า Admin ได้ ไม่จำเป็นต้องใส่ใน `.env`

#### 4. เริ่มแอปพลิเคชัน

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

#### 5. เข้าใช้งาน
- **Admin Panel:** http://localhost:3000/admin
- **Health Check:** http://localhost:3000/health

**Login:**
- หากไม่ได้ตั้งค่า `ADMIN_MASTER_PASSCODE` สามารถเข้า `/admin` ได้ทันที
- หากตั้งค่า `ADMIN_MASTER_PASSCODE` ระบบจะพาไปหน้าใส่รหัสผ่าน (ใช้รหัสหลักจาก `.env` หรือรหัสทีมที่สร้างในแท็บ “ความปลอดภัย”)

---

## 📖 คู่มือการใช้งาน

### การจัดการ LINE Bot

#### เพิ่ม LINE Bot
1. ไปที่ **Dashboard** → **จัดการ Bot**
2. คลิก **"เพิ่ม LINE Bot"**
3. กรอกข้อมูล:
   - ชื่อ Bot
   - Channel Access Token (จาก LINE Developers)
   - Channel Secret (จาก LINE Developers)
   - โมเดล AI ที่ต้องการใช้
4. คลิก **"สร้าง"**

#### ตั้งค่า Webhook
1. คลิก **"สร้าง Webhook URL"** ใน Bot ที่สร้าง
2. คัดลอก Webhook URL
3. ไปที่ [LINE Developers Console](https://developers.line.biz/)
4. เลือก Channel → Messaging API → Webhook URL
5. วาง URL และ **Enable Webhook**

### การจัดการ Facebook Bot

#### เพิ่ม Facebook Bot
1. ไปที่ **Dashboard** → **จัดการ Bot**
2. คลิก **"เพิ่ม Facebook Bot"**
3. กรอกข้อมูล:
   - ชื่อ Bot
   - Page ID (จาก Facebook Page)
   - Page Access Token (จาก Facebook Developers)
   - Verify Token (สร้างเอง)
4. คลิก **"สร้าง"**

#### ตั้งค่า Webhook
1. คัดลอก Webhook URL และ Verify Token
2. ไปที่ [Facebook Developers](https://developers.facebook.com/)
3. เลือก App → Products → Messenger → Settings
4. วาง Callback URL และ Verify Token
5. Subscribe to fields: `messages`, `messaging_postbacks`

### การตอบคอมเมนต์ Facebook อัตโนมัติ

#### ตั้งค่าการตอบคอมเมนต์
1. ไปที่ **ตอบคอมเมนต์ FB** ในเมนู
2. เลือก Facebook Page
3. คลิก **"เพิ่มโพสต์"**
4. กรอก Post ID (รูปแบบ: `PAGE_ID_POST_ID`)
5. เลือกประเภทการตอบ:
   - **Custom Message:** ข้อความคงที่
   - **AI Generated:** ตอบด้วย AI (ตั้ง System Prompt ได้)
6. เปิด/ปิด **"ดึงเข้าแชท"** (Pull to Chat)
7. คลิก **"บันทึก"**

**วิธีหา Post ID:**
```
URL: https://www.facebook.com/123456789/posts/987654321
Post ID: 123456789_987654321
```

### การจัดการคำสั่ง AI (Instructions)

#### เพิ่มคำสั่งใหม่
1. ไปที่ **Dashboard** → **คำสั่ง**
2. คลิก **"เพิ่มคำสั่งใหม่"**
3. เลือกประเภท:
   - **ข้อความ (Text)**
   - **ตาราง (Table)**
   - **QR Code**
4. กรอกข้อมูลและคลิก **"บันทึก"**

#### นำเข้าจาก Excel
1. คลิกปุ่ม **"อัพโหลด Excel"**
2. เลือกไฟล์ Excel (.xlsx หรือ .xls)
3. ดูตัวอย่างและคลิก **"อัพโหลดและบันทึก"**

**รูปแบบ Excel:**
- แต่ละแท็บ = 1 คำสั่ง
- ชื่อแท็บ = หัวข้อของคำสั่ง
- หลายแถว = ตาราง
- 1 แถว = ข้อความ

### การส่งข้อความ Broadcast

1. ไปที่ **Broadcast** ในเมนู
2. เลือก Platform (LINE หรือ Facebook)
3. เลือกผู้ใช้ที่ต้องการส่ง
4. พิมพ์ข้อความ
5. คลิก **"ส่ง"**

### การตั้งค่าระบบ

1. ไปที่ **ตั้งค่า** ในเมนู
2. เลือกแท็บที่ต้องการ:
   - **ภาพรวม:** ข้อมูลระบบ
   - **การตั้งค่าแชท:** ระยะเวลาดีเลย์, การรวมข้อความ
   - **AI & Bot:** โมเดล AI, จำนวนรูปภาพสูงสุด
   - **ระบบ:** เปิด/ปิด AI, โหมดการทำงาน
   - **ความปลอดภัย:** ตั้งค่าความปลอดภัย
3. ปรับค่าและคลิก **"บันทึก"**

---

## 🏗️ โครงสร้างโปรเจค

```
ChatCenterAI/
├── index.js                 # Main application file
├── config.js                # Configuration constants
├── package.json             # Dependencies
├── env.example              # Environment variables template
│
├── public/                  # Static assets
│   ├── assets/              # Uploaded files
│   ├── css/                 # Stylesheets
│   └── js/                  # Client-side scripts
│
├── views/                   # EJS templates
│   ├── admin-*.ejs          # Admin pages
│   └── partials/            # Reusable components
│
├── utils/                   # Utility functions
│   └── image.js             # Image processing
│
└── scripts/                 # Helper scripts
    └── mongo-backup.sh      # Database backup script
```

---

## 🗄️ Database Schema

### Collections หลัก

#### `line_bots`
```javascript
{
  _id: ObjectId,
  name: String,
  channelAccessToken: String,
  channelSecret: String,
  aiModel: String,
  selectedInstructions: [String],
  selectedImageCollections: [String],
  isActive: Boolean,
  webhookUrl: String,
  createdAt: Date
}
```

#### `facebook_bots`
```javascript
{
  _id: ObjectId,
  name: String,
  pageId: String,
  pageAccessToken: String,
  verifyToken: String,
  aiModel: String,
  selectedInstructions: [String],
  selectedImageCollections: [String],
  isActive: Boolean,
  webhookUrl: String,
  createdAt: Date
}
```

#### `chat_history`
```javascript
{
  _id: ObjectId,
  senderId: String,
  role: String,              // "user" | "assistant"
  content: String,           // Text or JSON for images
  timestamp: Date,
  platform: String,          // "line" | "facebook"
  botId: String,
  source: String             // "webhook" | "comment_pull" | "admin"
}
```

#### `facebook_comment_configs`
```javascript
{
  _id: ObjectId,
  pageId: ObjectId,          // ref: facebook_bots
  postId: String,            // "PAGE_ID_POST_ID"
  replyType: String,         // "custom" | "ai"
  customMessage: String,
  aiModel: String,
  systemPrompt: String,
  pullToChat: Boolean,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### `instruction_assets`
```javascript
{
  _id: ObjectId,
  label: String,             // Unique identifier
  slug: String,              // URL-friendly name
  url: String,               // Public URL
  thumbUrl: String,
  description: String,
  fileName: String,
  gridfsId: ObjectId,        // GridFS file reference
  createdAt: Date
}
```

#### `image_collections`
```javascript
{
  _id: String,               // "collection-{timestamp}"
  name: String,
  description: String,
  images: [                  // Array of image references
    {
      label: String,
      slug: String,
      url: String,
      thumbUrl: String,
      description: String,
      fileName: String,
      assetId: String
    }
  ],
  isDefault: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### `follow_up_tasks`
```javascript
{
  _id: ObjectId,
  userId: String,
  platform: String,
  message: String,
  scheduledTime: Date,
  status: String,            // "pending" | "sent" | "failed"
  createdAt: Date
}
```

#### `settings`
```javascript
{
  _id: ObjectId,
  category: String,          // "chat" | "ai" | "system"
  key: String,
  value: Mixed,
  updatedAt: Date
}
```

---

## 🔧 API Routes

### Admin Routes
```
GET    /admin                          # Dashboard
GET    /admin/dashboard                # Overview
GET    /admin/chat                     # Chat management
GET    /admin/settings                 # System settings
GET    /admin/broadcast                # Broadcast messages
GET    /admin/followup                 # Follow-up tasks
GET    /admin/facebook-comment         # Comment auto-reply
```

### Bot Management API
```
# LINE Bots
GET    /api/line-bots                  # List all LINE bots
GET    /api/line-bots/:id              # Get bot details
POST   /api/line-bots                  # Create new bot
PUT    /api/line-bots/:id              # Update bot
DELETE /api/line-bots/:id              # Delete bot
POST   /api/line-bots/:id/test         # Test bot

# Facebook Bots
GET    /api/facebook-bots              # List all Facebook bots
GET    /api/facebook-bots/:id          # Get bot details
POST   /api/facebook-bots              # Create new bot
PUT    /api/facebook-bots/:id          # Update bot
DELETE /api/facebook-bots/:id          # Delete bot
POST   /api/facebook-bots/:id/test     # Test bot
```

### Webhook Routes
```
POST   /webhook/line/:botId            # LINE webhook endpoint
GET    /webhook/facebook/:botId        # Facebook webhook verification
POST   /webhook/facebook/:botId        # Facebook webhook endpoint
```

### Settings API
```
GET    /api/settings                   # Get all settings
POST   /api/settings/chat              # Update chat settings
POST   /api/settings/ai                # Update AI settings
POST   /api/settings/system            # Update system settings
```

### Instructions API
```
GET    /api/instructions               # List instructions
POST   /admin/instructions             # Create instruction
PUT    /admin/instructions/:id/edit    # Update instruction
DELETE /admin/instructions/:id         # Delete instruction
GET    /admin/instructions/export/*    # Export (json/markdown/excel)
```

### Chat API
```
GET    /admin/chat/users               # List chat users
GET    /admin/chat/history/:userId     # Get chat history
POST   /admin/chat/send                # Send message as admin
DELETE /admin/chat/clear/:userId       # Clear chat history
GET    /admin/chat/unread-count        # Get unread count
```

---

## 🔐 ความปลอดภัย

### Environment Variables
- ไม่ commit ไฟล์ `.env` เข้า Git
- ใช้ Strong Password สำหรับ Admin
- เก็บ API Keys อย่างปลอดภัย

### Webhook Security
- ใช้ HTTPS สำหรับ Production
- Verify Token สำหรับ Facebook Webhook
- Signature Verification สำหรับ LINE Webhook

### Database
- ใช้ Strong Password สำหรับ MongoDB
- จำกัด IP Access ถ้าเป็นไปได้
- สำรองข้อมูลเป็นประจำ

---

## 🚢 การ Deploy

ดูรายละเอียดการ Deploy ได้ที่ [DEPLOYMENT.md](./DEPLOYMENT.md)

### Platform ที่รองรับ
- **Railway** - Deploy ง่าย มี Free Tier
- **Heroku** - รองรับ Procfile
- **Docker** - มี Dockerfile พร้อมใช้งาน
- **VPS/Cloud** - Deploy แบบ Traditional

---

## 🧪 การทดสอบ

### ทดสอบระบบ Comment
```bash
node test-comment-system.js
```

### Health Check
```bash
curl http://localhost:3000/health
```

### ทดสอบ Webhook (LINE)
```bash
curl -X POST http://localhost:3000/webhook/line/YOUR_BOT_ID \
  -H "Content-Type: application/json" \
  -d '{"events": []}'
```

### ทดสอบ Webhook (Facebook)
```bash
# Verification
curl "http://localhost:3000/webhook/facebook/YOUR_BOT_ID?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

---

## 📦 Dependencies

### Core
- **express** - Web framework
- **mongodb** - Database driver
- **openai** - OpenAI API
- **socket.io** - Real-time communication

### Bot Integration
- **@line/bot-sdk** - LINE Bot SDK
- **axios** - HTTP client (Facebook API)

### Utilities
- **sharp** - Image processing
- **multer** - File upload
- **xlsx** - Excel file handling
- **moment-timezone** - Date/time handling
- **googleapis** - Google Sheets integration

### Security & Middleware
- **helmet** - Security headers
- **cors** - CORS handling
- **dotenv** - Environment variables

---

## 🔧 การแก้ปัญหา

### ปัญหาทั่วไป

#### Bot ไม่ตอบกลับ
1. ตรวจสอบ Webhook URL ว่าถูกต้อง
2. ตรวจสอบว่า Bot เปิดใช้งานอยู่
3. ดู logs ใน server
4. ทดสอบ OpenAI API Key

#### รูปภาพไม่แสดง
1. ตรวจสอบ `PUBLIC_BASE_URL` ใน `.env`
2. ตรวจสอบว่า GridFS ทำงานปกติ
3. ตรวจสอบ permissions ของโฟลเดอร์ public

#### ไม่สามารถ Login Admin
1. ตรวจสอบว่า `ADMIN_MASTER_PASSCODE` ถูกตั้งค่าใน `.env` และเซิร์ฟเวอร์ถูกรีสตาร์ทแล้ว
2. ลองใช้รหัสหลักจาก `.env` หรือรหัสทีมที่สร้างในหน้า **ตั้งค่า > ความปลอดภัย**
3. หากยังเข้าไม่ได้ ให้ให้แอดมินใหญ่สร้างรหัสชุดใหม่แล้วแจกให้ทีมงานล่าสุด

#### MongoDB Connection Failed
1. ตรวจสอบ `MONGO_URI` ใน `.env`
2. ตรวจสอบว่า MongoDB รันอยู่
3. ตรวจสอบ network/firewall settings

---

## 🤝 การพัฒนาต่อ

### ฟีเจอร์ที่อาจเพิ่มในอนาคต
- ✨ Multi-language support
- 📊 Analytics dashboard
- 🔔 Advanced notification system
- 🎯 A/B testing สำหรับ AI responses
- 📱 Mobile app
- 🔗 Integration กับ Platform อื่นๆ (WhatsApp, Telegram)

### การมีส่วนร่วม
1. Fork โปรเจค
2. สร้าง Feature Branch
3. Commit การเปลี่ยนแปลง
4. Push ไปยัง Branch
5. เปิด Pull Request

---

## 📄 License

This project is proprietary software.

---

## 👨‍💻 ผู้พัฒนา

ChatCenter AI - ระบบจัดการแชทบอท AI อัจฉริยะ

---

## 📞 ติดต่อ

หากมีคำถามหรือต้องการความช่วยเหลือ:
- ตรวจสอบเอกสารนี้อีกครั้ง
- ดู error logs ใน console
- ตรวจสอบ [DEPLOYMENT.md](./DEPLOYMENT.md) สำหรับการ deploy

---

**เวอร์ชัน:** 1.0.0  
**อัพเดทล่าสุด:** ตุลาคม 2025  
**Node.js:** >= 18.0.0
