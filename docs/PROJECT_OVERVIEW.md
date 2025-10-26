# ChatCenter AI - Project Overview

## 📋 สารบัญ

1. [ภาพรวมโปรเจ็กส์](#ภาพรวมโปรเจ็กส์)
2. [สถาปัตยกรรมระบบ](#สถาปัตยกรรมระบบ)
3. [Tech Stack](#tech-stack)
4. [ฟีเจอร์หลัก](#ฟีเจอร์หลัก)
5. [Database Schema](#database-schema)
6. [API Routes](#api-routes)
7. [Socket.IO Events](#socketio-events)
8. [Data Flow](#data-flow)
9. [Security](#security)

---

## ภาพรวมโปรเจ็กส์

**ChatCenter AI** เป็นระบบจัดการแชทบอท AI อัจฉริยะที่รองรับหลาย Platform (LINE, Facebook Messenger) พร้อมฟีเจอร์ครบครัน

### วัตถุประสงค์หลัก
- จัดการแชทบอท AI หลาย Bot พร้อมกัน
- ตอบกลับลูกค้าอัตโนมัติด้วย AI (GPT-5, GPT-5-mini, GPT-5-nano, GPT-4.1, O3)
- ติดตามและดูแลลูกค้าอย่างเป็นระบบ
- ส่งข้อความ Broadcast และตอบคอมเมนต์อัตโนมัติ

### เทคโนโลยีหลัก
- **Backend**: Node.js + Express.js
- **Database**: MongoDB + GridFS
- **AI**: OpenAI API
- **Real-time**: Socket.IO
- **Bot Integration**: LINE Bot SDK, Facebook Graph API

---

## สถาปัตยกรรมระบบ

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐              │
│  │ LINE App │  │ Facebook │  │ Admin Panel  │              │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘              │
└───────┼─────────────┼────────────────┼──────────────────────┘
        │             │                │
        │             │                │ Socket.IO (Real-time)
        │             │                │
┌───────▼─────────────▼────────────────▼──────────────────────┐
│                  Application Layer                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Express.js Server                      │     │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐     │     │
│  │  │ Webhook  │  │ Admin    │  │ Socket.IO   │     │     │
│  │  │ Handlers │  │ Routes   │  │ Server      │     │     │
│  │  └──────────┘  └──────────┘  └─────────────┘     │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │           Business Logic Layer                      │     │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐     │     │
│  │  │ Chat     │  │ AI       │  │ Follow-up   │     │     │
│  │  │ Manager  │  │ Handler  │  │ System      │     │     │
│  │  └──────────┘  └──────────┘  └─────────────┘     │     │
│  └────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
        │                    │                    │
        │                    │                    │
┌───────▼────────────────────▼────────────────────▼───────────┐
│                   Integration Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐              │
│  │ MongoDB  │  │ OpenAI   │  │ External    │              │
│  │ + GridFS │  │ API      │  │ APIs        │              │
│  └──────────┘  └──────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
- **Runtime**: Node.js >= 18.0.0
- **Framework**: Express.js 4.21.2
- **Real-time**: Socket.IO 4.7.5
- **Template Engine**: EJS 3.1.9

### Database
- **Primary Database**: MongoDB 6.12.0
- **File Storage**: GridFS (สำหรับรูปภาพและไฟล์)

### AI & Bot Integration
- **AI Provider**: OpenAI 4.0.0
  - **Text Models**: GPT-5, GPT-5-mini, GPT-5-chat-latest
  - **Vision Models**: GPT-5, GPT-5-mini
  - **Follow-up Model**: GPT-5-nano
  - **Alternative Models**: GPT-4.1, GPT-4.1-mini, O3
  - **Comment Reply Models**: GPT-4o, GPT-4o-mini (เฉพาะ Facebook Comment)
- **LINE Integration**: @line/bot-sdk 7.5.3
- **Facebook Integration**: Axios + Facebook Graph API

### Utilities
- **Image Processing**: Sharp 0.32.5
- **File Upload**: Multer 1.4.5-lts.1
- **Excel Handling**: XLSX 0.18.5
- **Date/Time**: Moment-timezone 0.5.43
- **Google Integration**: googleapis 144.0.0

### Security & Middleware
- **Security Headers**: Helmet 7.0.0
- **CORS**: cors 2.8.5
- **Environment**: dotenv 16.4.7

---

## ฟีเจอร์หลัก

### 1. Multi-Platform Chatbot Management

#### LINE Bot
- รองรับหลาย Bot พร้อมกัน
- Webhook แยกต่างหากสำหรับแต่ละ Bot
- รองรับข้อความ, รูปภาพ, Sticker
- ตั้งค่า AI Model แยกตาม Bot (GPT-5, GPT-5-mini, GPT-5-chat-latest, GPT-5-nano, GPT-4.1, GPT-4.1-mini, O3)

#### Facebook Messenger Bot
- จัดการหลาย Page พร้อมกัน
- Webhook verification และ message handling
- รองรับข้อความ, รูปภาพ, Postback
- ตั้งค่า AI Model แยกตาม Page (GPT-5, GPT-5-mini, GPT-5-chat-latest, GPT-5-nano, GPT-4.1, GPT-4.1-mini, O3)

#### Facebook Comment Auto-Reply
- ตอบคอมเมนต์อัตโนมัติ
- รองรับ 2 โหมด: Custom Message และ AI Generated
- Pull to Chat: ดึงผู้คอมเมนต์เข้าสู่ระบบแชท
- จัดการหลาย Post พร้อมกัน

### 2. Chat Management System

#### Admin Chat Dashboard
- แชทแบบ Real-time ผ่าน Socket.IO
- รายชื่อผู้ใช้พร้อม Unread Count
- Search & Filter (ยังไม่อ่าน, ติดตาม, เคยซื้อ)
- Tag Management (เพิ่ม/ลบแท็กสำหรับลูกค้า)
- Purchase Status (ทำเครื่องหมายลูกค้าที่ซื้อแล้ว)
- AI Toggle (เปิด/ปิด AI สำหรับแต่ละคน)
- รองรับรูปภาพ (แสดง, ดาวน์โหลด, คัดลอก)

#### Chat History
- บันทึกประวัติการสนทนาทั้งหมด
- รองรับข้อความแบบ Text และ Image
- จำกัดจำนวนประวัติที่ส่งให้ AI (ปรับได้)
- ล้างประวัติการสนทนา

### 3. AI Features

#### OpenAI Integration
- **รองรับโมเดลหลัก**:
  - **GPT-5**: โมเดลหลักสำหรับ Text และ Vision
  - **GPT-5-mini**: โมเดลเล็กที่เร็วและประหยัด (แนะนำ)
  - **GPT-5-chat-latest**: โมเดลล่าสุดสำหรับการสนทนา
  - **GPT-5-nano**: โมเดลเล็กสำหรับ Follow-up Analysis
  - **GPT-4.1** / **GPT-4.1-mini**: โมเดลรุ่นก่อน
  - **O3**: โมเดลพิเศษ
  - **GPT-4o** / **GPT-4o-mini**: สำหรับ Facebook Comment Auto-Reply
- Custom Instructions (กำหนดบุคลิกและคำสั่ง AI)
- Image Recognition (วิเคราะห์รูปภาพด้วย Vision Models)
- ปรับแต่งพารามิเตอร์ (Temperature, Max Tokens, etc.)

#### Instruction Management
- จัดเก็บคำสั่งเป็นชุดๆ
- รองรับ 3 ประเภท: Text, Table, QR Code
- Import จาก Excel
- Export เป็น JSON, Markdown, Excel
- แนบรูปภาพประกอบ

#### Image Collections
- จัดกลุ่มรูปภาพแยกตาม Bot
- อัพโหลดหลายรูปพร้อมกัน
- สร้าง Thumbnail อัตโนมัติ
- เก็บใน GridFS

### 4. Follow-up System

#### Automatic Follow-up
- ติดตามลูกค้าอัตโนมัติตามเวลาที่กำหนด
- วิเคราะห์ความสนใจจากการสนทนา
- กำหนดข้อความและรูปภาพสำหรับแต่ละ Page/Bot
- ตั้งเวลาส่งข้อความ (เช่น หลัง 1 ชม., 24 ชม., 3 วัน)

#### Follow-up Status
- ติดตามสถานะการส่งข้อความ
- แสดงสถิติ (กำลังติดตาม, ส่งครบแล้ว, ยกเลิก, ล้มเหลว)
- ยกเลิกการติดตามได้ทุกเมื่อ

### 5. Broadcast System

#### Message Broadcasting
- ส่งข้อความถึงผู้ใช้หลายคนพร้อมกัน
- เลือกกลุ่มเป้าหมาย (ทุกคน, กลุ่มติดตาม, ยังไม่ซื้อ, เคยซื้อ)
- รองรับทั้ง LINE และ Facebook
- แสดงจำนวนผู้รับ

### 6. Settings & Configuration

#### System Settings
- เปิด/ปิด AI ทั้งระบบ
- ตั้งค่า Default AI Model
- ตั้งค่าการบันทึกประวัติ
- ตั้งค่าจำนวนรูปภาพสูงสุด

#### Chat Settings
- ระยะเวลา Delay ระหว่างข้อความ
- การรวมข้อความติดกัน
- จำนวนประวัติที่ส่งให้ AI

#### Follow-up Settings
- เปิด/ปิดการวิเคราะห์อัตโนมัติ
- แสดง/ซ่อนสถานะติดตามในแชท
- กำหนดข้อความและรูปภาพแยกตาม Page

---

## Database Schema

### Collections

#### 1. `chat_history`
เก็บประวัติการสนทนาทั้งหมด

```javascript
{
  _id: ObjectId,
  senderId: String,           // LINE userId หรือ Facebook PSID
  role: String,               // "user" | "assistant"
  content: String | JSON,     // ข้อความหรือ JSON (สำหรับรูปภาพ)
  timestamp: Date,
  platform: String,           // "line" | "facebook"
  botId: String | ObjectId,   // Reference ไปยัง Bot
  source: String              // "webhook" | "comment_pull" | "admin_chat"
}
```

**Indexes:**
- `{ senderId: 1, timestamp: 1 }`
- `{ platform: 1, botId: 1 }`

#### 2. `line_bots`
เก็บข้อมูล LINE Bots

```javascript
{
  _id: ObjectId,
  name: String,                           // ชื่อ Bot
  channelAccessToken: String,             // LINE Channel Access Token
  channelSecret: String,                  // LINE Channel Secret
  aiModel: String,                        // "gpt-5" | "gpt-5-mini" | "gpt-5-chat-latest" | "gpt-5-nano" | "gpt-4.1" | "gpt-4.1-mini" | "o3"
  selectedInstructions: [String],         // Array of instruction IDs
  selectedImageCollections: [String],     // Array of collection IDs
  isActive: Boolean,                      // เปิด/ปิดใช้งาน
  webhookUrl: String,                     // Webhook URL
  keywordSettings: Object,                // ตั้งค่า keywords
  createdAt: Date,
  updatedAt: Date
}
```

#### 3. `facebook_bots`
เก็บข้อมูล Facebook Bots

```javascript
{
  _id: ObjectId,
  name: String,                           // ชื่อ Bot/Page
  pageId: String,                         // Facebook Page ID
  pageAccessToken: String,                // Page Access Token
  verifyToken: String,                    // Webhook Verify Token
  aiModel: String,                        // "gpt-5" | "gpt-5-mini" | "gpt-5-chat-latest" | "gpt-5-nano" | "gpt-4.1" | "gpt-4.1-mini" | "o3"
  selectedInstructions: [String],         // Array of instruction IDs
  selectedImageCollections: [String],     // Array of collection IDs
  isActive: Boolean,                      // เปิด/ปิดใช้งาน
  webhookUrl: String,                     // Webhook URL
  keywordSettings: Object,                // ตั้งค่า keywords
  createdAt: Date,
  updatedAt: Date
}
```

#### 4. `user_tags`
เก็บแท็กของผู้ใช้

```javascript
{
  _id: ObjectId,
  userId: String,             // LINE userId หรือ Facebook PSID
  tags: [String],             // Array of tag names
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1 }` (unique)
- `{ tags: 1 }`

#### 5. `user_purchase_status`
เก็บสถานะการซื้อของผู้ใช้

```javascript
{
  _id: ObjectId,
  userId: String,             // LINE userId หรือ Facebook PSID
  hasPurchased: Boolean,      // เคยซื้อหรือไม่
  purchaseDate: Date,         // วันที่ซื้อ (ถ้ามี)
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1 }` (unique)
- `{ hasPurchased: 1 }`

#### 6. `user_unread_counts`
เก็บจำนวนข้อความที่ยังไม่อ่าน

```javascript
{
  _id: ObjectId,
  userId: String,             // LINE userId หรือ Facebook PSID
  unreadCount: Number,        // จำนวนข้อความที่ยังไม่อ่าน
  lastMessageAt: Date,        // เวลาข้อความล่าสุด
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1 }` (unique)
- `{ unreadCount: 1 }`

#### 7. `active_user_status`
เก็บสถานะ AI ของผู้ใช้แต่ละคน

```javascript
{
  _id: ObjectId,
  userId: String,             // LINE userId หรือ Facebook PSID
  aiEnabled: Boolean,         // เปิด/ปิด AI สำหรับผู้ใช้นี้
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1 }` (unique)

#### 8. `follow_up_status`
เก็บสถานะติดตามของผู้ใช้

```javascript
{
  _id: ObjectId,
  userId: String,             // LINE userId หรือ Facebook PSID
  platform: String,           // "line" | "facebook"
  botId: String | ObjectId,   // Reference ไปยัง Bot
  hasFollowUp: Boolean,       // ต้องติดตามหรือไม่
  followUpReason: String,     // เหตุผลที่ต้องติดตาม
  followUpUpdatedAt: Date,    // เวลาที่อัปเดตสถานะ
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1, platform: 1, botId: 1 }` (unique)
- `{ hasFollowUp: 1 }`

#### 9. `follow_up_tasks`
เก็บงานติดตามที่ต้องส่งข้อความ

```javascript
{
  _id: ObjectId,
  userId: String,             // LINE userId หรือ Facebook PSID
  platform: String,           // "line" | "facebook"
  botId: String | ObjectId,   // Reference ไปยัง Bot
  pageId: String | ObjectId,  // Reference ไปยัง Page (สำหรับ Facebook)
  message: String,            // ข้อความที่จะส่ง
  imageUrls: [String],        // Array of image URLs
  scheduledTime: Date,        // เวลาที่กำหนดส่ง
  status: String,             // "pending" | "sent" | "failed" | "cancelled"
  sentAt: Date,               // เวลาที่ส่งจริง
  error: String,              // ข้อความ error (ถ้ามี)
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1, status: 1 }`
- `{ scheduledTime: 1, status: 1 }`
- `{ platform: 1, botId: 1 }`

#### 10. `follow_up_page_settings`
เก็บการตั้งค่าการติดตามแยกตาม Page/Bot

```javascript
{
  _id: ObjectId,
  platform: String,           // "line" | "facebook"
  pageId: String | ObjectId,  // Reference ไปยัง Bot/Page
  autoSendEnabled: Boolean,   // เปิด/ปิดการส่งอัตโนมัติ
  messages: [                 // ข้อความแต่ละช่วงเวลา
    {
      delay: Number,          // ความล่าช้า (มิลลิวินาที)
      message: String,        // ข้อความ
      imageUrls: [String]     // รูปภาพประกอบ
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ platform: 1, pageId: 1 }` (unique)

#### 11. `user_profiles`
เก็บข้อมูลโปรไฟล์ผู้ใช้

```javascript
{
  _id: ObjectId,
  userId: String,             // LINE userId หรือ Facebook PSID
  platform: String,           // "line" | "facebook"
  displayName: String,        // ชื่อที่แสดง
  pictureUrl: String,         // URL รูปโปรไฟล์
  statusMessage: String,      // สถานะ (LINE)
  language: String,           // ภาษา
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1, platform: 1 }` (unique)

#### 12. `instruction_assets`
เก็บรูปภาพและไฟล์คำสั่ง

```javascript
{
  _id: ObjectId,
  label: String,              // ชื่อเฉพาะ (unique)
  slug: String,               // URL-friendly name
  url: String,                // Public URL
  thumbUrl: String,           // Thumbnail URL
  description: String,        // คำอธิบาย
  fileName: String,           // ชื่อไฟล์
  thumbFileName: String,      // ชื่อไฟล์ thumbnail
  fileId: ObjectId,           // GridFS file ID
  thumbFileId: ObjectId,      // GridFS thumbnail ID
  storage: String,            // "mongo" | "disk"
  sha256: String,             // Hash สำหรับตรวจสอบไฟล์ซ้ำ
  mime: String,               // MIME type
  size: Number,               // ขนาดไฟล์ (bytes)
  width: Number,              // ความกว้างรูปภาพ
  height: Number,             // ความสูงรูปภาพ
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ label: 1 }` (unique)
- `{ sha256: 1 }`

#### 13. `image_collections`
เก็บคอลเลกชันรูปภาพ

```javascript
{
  _id: String,                // "collection-{timestamp}"
  name: String,               // ชื่อคอลเลกชัน
  description: String,        // คำอธิบาย
  images: [                   // Array of images
    {
      label: String,
      slug: String,
      url: String,
      thumbUrl: String,
      description: String,
      fileName: String,
      assetId: String         // Reference to instruction_assets
    }
  ],
  isDefault: Boolean,         // คอลเลกชันเริ่มต้น
  createdAt: Date,
  updatedAt: Date
}
```

#### 14. `instructions`
เก็บคำสั่ง AI

```javascript
{
  _id: ObjectId,
  title: String,              // หัวข้อ
  content: String,            // เนื้อหา
  type: String,               // "text" | "table" | "qr"
  data: Object,               // ข้อมูลเพิ่มเติม (สำหรับ table)
  attachedImages: [           // รูปภาพที่แนบ
    {
      label: String,
      url: String,
      assetId: String
    }
  ],
  order: Number,              // ลำดับการแสดง
  createdAt: Date,
  updatedAt: Date
}
```

#### 15. `facebook_comment_configs`
เก็บการตั้งค่าตอบคอมเมนต์ Facebook

```javascript
{
  _id: ObjectId,
  pageId: ObjectId,           // Reference to facebook_bots
  postId: String,             // "PAGE_ID_POST_ID"
  replyType: String,          // "custom" | "ai"
  customMessage: String,      // ข้อความตอบกลับแบบกำหนดเอง
  aiModel: String,            // AI Model (ถ้าใช้ AI): "gpt-5" | "gpt-5-mini" | "gpt-4o" | "gpt-4o-mini" | etc.
  systemPrompt: String,       // System Prompt (ถ้าใช้ AI)
  pullToChat: Boolean,        // ดึงเข้าแชทหรือไม่
  isActive: Boolean,          // เปิด/ปิดใช้งาน
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ pageId: 1, postId: 1 }` (unique)
- `{ isActive: 1 }`

#### 16. `facebook_comment_logs`
เก็บ log การตอบคอมเมนต์

```javascript
{
  _id: ObjectId,
  postId: String,             // Post ID
  commentId: String,          // Comment ID
  userId: String,             // Facebook User ID
  userName: String,           // ชื่อผู้คอมเมนต์
  commentText: String,        // ข้อความคอมเมนต์
  replyText: String,          // ข้อความตอบกลับ
  replyType: String,          // "custom" | "ai"
  status: String,             // "success" | "error"
  error: String,              // ข้อความ error (ถ้ามี)
  createdAt: Date
}
```

**Indexes:**
- `{ postId: 1, commentId: 1 }`
- `{ createdAt: 1 }`

#### 17. `settings`
เก็บการตั้งค่าระบบ

```javascript
{
  _id: ObjectId,
  category: String,           // "chat" | "ai" | "system" | "followup"
  key: String,                // ชื่อ setting
  value: Mixed,               // ค่า setting (String, Number, Boolean, Object)
  description: String,        // คำอธิบาย
  updatedAt: Date
}
```

**Indexes:**
- `{ category: 1, key: 1 }` (unique)

**ตัวอย่าง Settings:**
- `{ category: "system", key: "aiEnabled", value: true }`
- `{ category: "ai", key: "textModel", value: "gpt-5" }`
- `{ category: "ai", key: "visionModel", value: "gpt-5" }`
- `{ category: "chat", key: "enableChatHistory", value: true }`
- `{ category: "chat", key: "aiHistoryLimit", value: 30 }`
- `{ category: "followup", key: "enableFollowUpAnalysis", value: true }`
- `{ category: "followup", key: "followUpShowInChat", value: true }`

---

## API Routes

### Admin Routes

#### Dashboard & Pages
```
GET  /admin                          # Redirect to dashboard
GET  /admin/dashboard                # Dashboard page
GET  /admin/chat                     # Chat management page
GET  /admin/settings                 # Settings page
GET  /admin/broadcast                # Broadcast page
GET  /admin/followup                 # Follow-up management page
GET  /admin/facebook-comment         # Facebook comment auto-reply page
```

### Bot Management API

#### LINE Bots
```
GET    /api/line-bots                # List all LINE bots
GET    /api/line-bots/:id            # Get bot details
POST   /api/line-bots                # Create new bot
PUT    /api/line-bots/:id            # Update bot
DELETE /api/line-bots/:id            # Delete bot
POST   /api/line-bots/:id/test       # Test bot connection
```

#### Facebook Bots
```
GET    /api/facebook-bots            # List all Facebook bots
GET    /api/facebook-bots/:id        # Get bot details
POST   /api/facebook-bots            # Create new bot
PUT    /api/facebook-bots/:id        # Update bot
DELETE /api/facebook-bots/:id        # Delete bot
POST   /api/facebook-bots/:id/test   # Test bot connection
```

### Chat Management API

#### Chat Users & History
```
GET    /admin/chat/users             # Get list of users who have chatted
GET    /admin/chat/history/:userId   # Get chat history for specific user
POST   /admin/chat/send              # Send message as admin
DELETE /admin/chat/clear/:userId     # Clear chat history for user
GET    /admin/chat/unread-count      # Get total unread count
```

#### User Status & Settings
```
GET    /admin/chat/user-status/:userId    # Get AI status for user
POST   /admin/chat/user-status            # Set AI status for user
```

#### Tags Management
```
GET    /admin/chat/tags/:userId            # Get tags for user
POST   /admin/chat/tags/:userId            # Set tags for user
GET    /admin/chat/available-tags          # Get all available tags in system
```

#### Purchase Status
```
POST   /admin/chat/purchase-status/:userId # Toggle purchase status
```

### Follow-up System API

#### Follow-up Settings
```
GET    /api/followup/page-settings         # Get all page settings
GET    /api/followup/page-settings/:id     # Get specific page settings
POST   /api/followup/page-settings/:id     # Update page settings
```

#### Follow-up Tasks
```
GET    /api/followup/tasks                 # Get all tasks
GET    /api/followup/tasks/:userId         # Get tasks for specific user
POST   /api/followup/tasks/:taskId/cancel  # Cancel task
DELETE /api/followup/tasks/:taskId         # Delete task
```

#### Follow-up Assets
```
POST   /api/followup/upload-images         # Upload images for follow-up
```

### Facebook Comment API

#### Comment Configs
```
GET    /api/facebook-comment/configs       # Get all comment configs
GET    /api/facebook-comment/configs/:id   # Get specific config
POST   /api/facebook-comment/configs       # Create new config
PUT    /api/facebook-comment/configs/:id   # Update config
DELETE /api/facebook-comment/configs/:id   # Delete config
```

#### Comment Logs
```
GET    /api/facebook-comment/logs          # Get comment logs
GET    /api/facebook-comment/logs/:postId  # Get logs for specific post
```

### Instructions Management API

#### Instructions CRUD
```
GET    /api/instructions                   # List all instructions
POST   /admin/instructions                 # Create instruction
GET    /admin/instructions/:id/edit        # Get instruction for editing
PUT    /admin/instructions/:id/edit        # Update instruction
DELETE /admin/instructions/:id             # Delete instruction
```

#### Instructions Export
```
GET    /admin/instructions/export/json     # Export as JSON
GET    /admin/instructions/export/markdown # Export as Markdown
GET    /admin/instructions/export/excel    # Export as Excel
```

#### Instructions Import
```
POST   /admin/instructions/upload-excel    # Import from Excel
```

#### Instruction Assets
```
POST   /admin/instructions/upload-images   # Upload images
GET    /assets/instructions/:fileName      # Serve instruction asset
DELETE /admin/instructions/assets/:assetId # Delete asset
```

#### Image Collections
```
GET    /api/image-collections              # List all collections
POST   /api/image-collections              # Create collection
PUT    /api/image-collections/:id          # Update collection
DELETE /api/image-collections/:id          # Delete collection
```

### Settings API

#### System Settings
```
GET    /api/settings                       # Get all settings
POST   /api/settings/chat                  # Update chat settings
POST   /api/settings/ai                    # Update AI settings
POST   /api/settings/system                # Update system settings
POST   /api/settings/followup              # Update follow-up settings
```

### Webhook Routes

#### LINE Webhook
```
POST   /webhook/line/:botId                # LINE webhook endpoint
```

#### Facebook Webhook
```
GET    /webhook/facebook/:botId            # Facebook webhook verification
POST   /webhook/facebook/:botId            # Facebook webhook endpoint
```

### Broadcast API

```
POST   /admin/broadcast                    # Send broadcast message
```

### Health Check

```
GET    /health                             # System health check
```

---

## Socket.IO Events

### Server → Client Events

#### Chat Events
```javascript
// ข้อความใหม่
socket.emit('newMessage', {
  userId: String,
  message: Object,
  sender: String,        // "user" | "assistant"
  timestamp: Date
});

// แชทถูกล้าง
socket.emit('chatCleared', {
  userId: String
});
```

#### Follow-up Events
```javascript
// สถานะติดตามอัปเดต
socket.emit('followUpTagged', {
  userId: String,
  hasFollowUp: Boolean,
  followUpReason: String,
  followUpUpdatedAt: Date
});
```

#### User Status Events
```javascript
// แท็กของผู้ใช้อัปเดต
socket.emit('userTagsUpdated', {
  userId: String,
  tags: [String]
});

// สถานะการซื้ออัปเดต
socket.emit('userPurchaseStatusUpdated', {
  userId: String,
  hasPurchased: Boolean
});
```

### Client → Server Events

```javascript
// เชื่อมต่อ
socket.on('connect', () => {
  console.log('Connected to server');
});

// ตัดการเชื่อมต่อ
socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

---

## Data Flow

### 1. User Message Flow (LINE/Facebook → AI → Response)

```
┌─────────────┐
│ User sends  │
│ message via │
│ LINE/FB     │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Platform Webhook    │
│ receives message    │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Save to             │
│ chat_history        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Check AI status     │
│ (global + per-user) │
└──────┬──────────────┘
       │
       ├─ AI Disabled ──────────────┐
       │                            │
       ├─ AI Enabled ───────────────┤
       │                            │
       ▼                            ▼
┌─────────────────────┐    ┌────────────────┐
│ Get chat history    │    │ Return early   │
│ + instructions      │    │ (no response)  │
│ + image collections │    └────────────────┘
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Call OpenAI API     │
│ with context        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Parse AI response   │
│ (extract reply)     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Save AI response    │
│ to chat_history     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Send response to    │
│ user via Platform   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Analyze for         │
│ follow-up (if       │
│ enabled)            │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Emit Socket event   │
│ to admin clients    │
└─────────────────────┘
```

### 2. Admin Chat Flow

```
┌─────────────┐
│ Admin opens │
│ /admin/chat │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Load page with      │
│ Socket.IO client    │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ GET /admin/chat/    │
│ users               │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Display user list   │
│ with filters        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Admin selects user  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ GET /admin/chat/    │
│ history/:userId     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Display chat        │
│ history             │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Admin sends message │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ POST /admin/chat/   │
│ send                │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Save to             │
│ chat_history        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Send to user via    │
│ Platform API        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Emit Socket event   │
│ to update UI        │
└─────────────────────┘
```

### 3. Follow-up System Flow

```
┌─────────────┐
│ User chats  │
│ with bot    │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ AI analyzes         │
│ conversation        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Detects purchase    │
│ intent              │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Create follow_up_   │
│ status record       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Create follow_up_   │
│ tasks (multiple)    │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Cron job checks     │
│ scheduled tasks     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Send message at     │
│ scheduled time      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Update task status  │
│ to "sent"           │
└─────────────────────┘
```

### 4. Facebook Comment Auto-Reply Flow

```
┌─────────────┐
│ User posts  │
│ comment on  │
│ Facebook    │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Facebook Webhook    │
│ sends event         │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Find comment config │
│ for this post       │
└──────┬──────────────┘
       │
       ├─ Not found ────────────────┐
       │                            │
       ├─ Found ────────────────────┤
       │                            │
       ▼                            ▼
┌─────────────────────┐    ┌────────────────┐
│ Check reply type    │    │ Ignore comment │
└──────┬──────────────┘    └────────────────┘
       │
       ├─ Custom ───────────────────┐
       │                            │
       ├─ AI ───────────────────────┤
       │                            │
       ▼                            ▼
┌─────────────────────┐    ┌────────────────┐
│ Use custom message  │    │ Call OpenAI    │
└──────┬──────────────┘    │ with prompt    │
       │                    └────────┬───────┘
       │                             │
       └──────────┬──────────────────┘
                  │
                  ▼
       ┌─────────────────────┐
       │ Reply to comment    │
       │ via Facebook API    │
       └──────┬──────────────┘
              │
              ▼
       ┌─────────────────────┐
       │ If pullToChat:      │
       │ Save to chat_history│
       └──────┬──────────────┘
              │
              ▼
       ┌─────────────────────┐
       │ Log to facebook_    │
       │ comment_logs        │
       └─────────────────────┘
```

---

## Security

### Authentication
- **Admin Panel**: Password-based authentication
- **Webhook**: Signature verification (LINE), Verify Token (Facebook)

### Environment Variables
```bash
# Required
MONGO_URI=mongodb://...
OPENAI_API_KEY=sk-...
PUBLIC_BASE_URL=https://...

# Optional
ADMIN_PASSWORD=...           # Default: admin123
PORT=...                     # Default: 3000
```

### Security Headers
- Helmet.js สำหรับ Security Headers
- CSP (Content Security Policy) สำหรับ Script/Style
- CORS enabled

### Data Protection
- Sensitive data (tokens, secrets) เก็บใน MongoDB
- ไม่ commit `.env` file
- GridFS สำหรับเก็บไฟล์ขนาดใหญ่

---

## Performance Optimization

### Database
- Indexes สำหรับ queries ที่ใช้บ่อย
- Limit จำนวนข้อความที่ส่งให้ AI
- GridFS สำหรับไฟล์ขนาดใหญ่

### Frontend
- Lazy loading สำหรับรูปภาพ
- Debounce สำหรับ search
- Virtual scrolling (planned)
- Socket.IO สำหรับ real-time updates

### API
- Caching สำหรับ settings
- Batch operations สำหรับ follow-up tasks
- Async/await สำหรับ non-blocking operations

---

## Deployment

### Supported Platforms
- **Railway**: ใช้ `railway.json` และ `nixpacks.toml`
- **Heroku**: ใช้ `Procfile`
- **Docker**: ใช้ `Dockerfile`
- **VPS/Cloud**: Traditional deployment

### Environment Setup
1. ตั้งค่า Environment Variables
2. ติดตั้ง Dependencies: `npm install`
3. เริ่มแอป: `npm start`

### MongoDB Setup
- Local: `mongodb://localhost:27017/chatbot`
- Cloud: MongoDB Atlas

---

## Monitoring & Logs

### Health Check
```
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-25T...",
  "uptime": 12345,
  "mongodb": "connected"
}
```

### Logs
- Console logs สำหรับ development
- Error logs สำหรับ production
- Socket.IO connection logs

---

## Future Enhancements

### Planned Features
- Multi-language support
- Analytics dashboard
- Advanced notification system
- A/B testing สำหรับ AI responses
- Mobile app
- Integration กับ Platform อื่นๆ (WhatsApp, Telegram)

### Performance Improvements
- Redis caching
- Message queue (Bull, RabbitMQ)
- Load balancing
- CDN สำหรับ static assets

---

## Support & Documentation

### Additional Resources
- `README.md` - Installation และ Quick Start
- `CHAT_TECHNICAL_SPEC.md` - Technical Specification สำหรับหน้าแชท
- Code comments - Inline documentation

### Contact
- ตรวจสอบ error logs ใน console
- ดู health check endpoint
- อ่านเอกสารเพิ่มเติมใน `docs/`

---

**เวอร์ชัน:** 1.0.0  
**อัพเดทล่าสุด:** ตุลาคม 2025  
**Node.js:** >= 18.0.0
