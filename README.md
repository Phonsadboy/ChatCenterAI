# ChatCenterAI - ระบบเว็บรวมแชทพร้อม AI ช่วยตอบลูกค้า

ระบบเว็บรวมแชทจากหลายแพลตฟอร์ม (Facebook, LINE, Telegram, Instagram) พร้อม AI ช่วยตอบลูกค้า

## 🚀 การ Deploy บน Railway

### 1. Fork หรือ Clone โปรเจค
```bash
git clone https://github.com/your-username/chatcenterai.git
cd chatcenterai
```

### 2. Deploy บน Railway
1. ไปที่ [Railway.app](https://railway.app)
2. สร้างโปรเจคใหม่
3. เลือก "Deploy from GitHub repo"
4. เลือก repository นี้
5. Railway จะ detect เป็น Node.js project และ deploy อัตโนมัติ

### 3. ตั้งค่า Environment Variables

ใน Railway Dashboard > Your Project > Variables tab ให้เพิ่ม:

#### Database Configuration
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatcenterai
```

#### JWT Configuration
```
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

#### OpenAI Configuration
```
OPENAI_API_KEY=sk-your-openai-api-key-here
```

#### Platform Configuration (Optional)
```
# Facebook
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_PAGE_ACCESS_TOKEN=your-facebook-page-access-token

# LINE
LINE_CHANNEL_ID=your-line-channel-id
LINE_CHANNEL_SECRET=your-line-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token

# Telegram
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Instagram
INSTAGRAM_APP_ID=your-instagram-app-id
INSTAGRAM_APP_SECRET=your-instagram-app-secret
INSTAGRAM_ACCESS_TOKEN=your-instagram-access-token
```

### 4. ตั้งค่า Build Command
Railway จะใช้ build command จาก `package.json` อัตโนมัติ

### 5. ตั้งค่า Start Command
Railway จะใช้ start command จาก `package.json` อัตโนมัติ

## 🛠️ การพัฒนา Local

### Prerequisites
- Node.js 18+
- npm หรือ yarn
- MongoDB (local หรือ MongoDB Atlas)

### Installation
```bash
# Install all dependencies
npm run install:all

# Copy environment file
cp backend/env.example backend/.env

# Edit .env file with your configuration
```

### Development
```bash
# Run both frontend and backend
npm run dev

# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend
```

## 📁 โครงสร้างโปรเจค

```
chatcenterai/
├── backend/                 # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Express middleware
│   │   ├── services/       # Business logic
│   │   ├── socket/         # Socket.IO handlers
│   │   └── config/         # Configuration
│   └── package.json
├── frontend/               # React + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── contexts/       # React contexts
│   │   └── hooks/          # Custom hooks
│   └── package.json
└── package.json            # Root package.json
```

## 🔧 ฟีเจอร์หลัก

- ✅ **Authentication System** - Login/Register ด้วย JWT
- ✅ **Dashboard** - แสดงสถิติแชทและข้อมูลสำคัญ
- ✅ **AI Instructions Management** - จัดการคำสั่ง AI แบบตาราง
- ✅ **Chat Interface** - หน้าต่างแชทพร้อม AI ช่วยตอบ
- ✅ **Real-time Messaging** - Socket.IO สำหรับการสื่อสารแบบ real-time
- ✅ **Multi-platform Support** - รองรับ Facebook, LINE, Telegram, Instagram
- ✅ **Responsive Design** - Tailwind CSS สำหรับ UI ที่สวยงาม

## 🌐 URLs

- **Frontend**: https://your-app.railway.app
- **Backend API**: https://your-app.railway.app/api
- **WebSocket**: wss://your-app.railway.app

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register` - ลงทะเบียน
- `POST /api/auth/login` - เข้าสู่ระบบ
- `GET /api/auth/me` - ข้อมูลผู้ใช้ปัจจุบัน

### Instructions
- `GET /api/instructions` - ดึงคำสั่ง AI ทั้งหมด
- `POST /api/instructions` - สร้างคำสั่ง AI ใหม่
- `PUT /api/instructions/:id` - แก้ไขคำสั่ง AI
- `DELETE /api/instructions/:id` - ลบคำสั่ง AI

### Chats
- `GET /api/chats` - ดึงแชททั้งหมด
- `GET /api/chats/:id` - ดึงแชทเฉพาะ
- `POST /api/chats/:id/messages` - ส่งข้อความในแชท

## 🔐 Security

- JWT Authentication
- Password hashing ด้วย bcrypt
- CORS protection
- Rate limiting
- Helmet.js security headers

## 📊 Database Schema

### Users
- name, email, password, role, avatar, isActive, lastLogin

### Instructions
- name, description, content, category, platforms, isActive, priority

### Chats
- customerId, customerName, platform, platformId, status, messages

## 🚀 Production Deployment

1. ตั้งค่า `NODE_ENV=production` ใน Railway
2. ใช้ MongoDB Atlas สำหรับ production database
3. ตั้งค่า JWT_SECRET ที่ปลอดภัย
4. เพิ่ม OpenAI API key
5. ตั้งค่า platform credentials ตามต้องการ

## 📞 Support

หากมีปัญหาหรือคำถาม กรุณาสร้าง issue ใน GitHub repository
