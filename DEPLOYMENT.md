# 🚀 การ Deploy ChatCenterAI บน Railway

## 📋 ขั้นตอนการ Deploy

### 1. เตรียม Repository
```bash
# Fork หรือ clone repository
git clone https://github.com/your-username/chatcenterai.git
cd chatcenterai

# Push ไปยัง GitHub repository ของคุณ
git add .
git commit -m "Initial commit for Railway deployment"
git push origin main
```

### 2. สร้าง Railway Account
1. ไปที่ [Railway.app](https://railway.app)
2. สร้างบัญชีใหม่ (ใช้ GitHub login)
3. สร้างโปรเจคใหม่

### 3. Deploy บน Railway
1. ใน Railway Dashboard คลิก "New Project"
2. เลือก "Deploy from GitHub repo"
3. เลือก repository `chatcenterai`
4. Railway จะ detect เป็น Node.js project อัตโนมัติ
5. คลิก "Deploy Now"

### 4. ตั้งค่า Environment Variables

ใน Railway Dashboard > Your Project > Variables tab:

#### 🔐 Required Variables (ต้องตั้งค่า)
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatcenterai
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
OPENAI_API_KEY=sk-your-openai-api-key-here
```

#### 🌐 Optional Variables (เลือกตั้งค่า)
```
# Facebook Integration
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_PAGE_ACCESS_TOKEN=your-facebook-page-access-token

# LINE Integration
LINE_CHANNEL_ID=your-line-channel-id
LINE_CHANNEL_SECRET=your-line-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token

# Telegram Integration
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Instagram Integration
INSTAGRAM_APP_ID=your-instagram-app-id
INSTAGRAM_APP_SECRET=your-instagram-app-secret
INSTAGRAM_ACCESS_TOKEN=your-instagram-access-token
```

### 5. ตั้งค่าฐานข้อมูล MongoDB

#### วิธีที่ 1: ใช้ MongoDB Atlas (แนะนำ)
1. ไปที่ [MongoDB Atlas](https://cloud.mongodb.com)
2. สร้าง cluster ใหม่
3. สร้าง database user
4. ตั้งค่า Network Access (0.0.0.0/0)
5. Copy connection string
6. ใส่ใน `MONGODB_URI` variable

#### วิธีที่ 2: ใช้ Railway MongoDB
1. ใน Railway Dashboard คลิก "New Service"
2. เลือก "Database" > "MongoDB"
3. Railway จะสร้าง MongoDB service
4. Copy connection string จาก Variables
5. ใส่ใน `MONGODB_URI` variable

### 6. ตรวจสอบการ Deploy
1. ไปที่ "Deployments" tab
2. ตรวจสอบว่า build สำเร็จ
3. ตรวจสอบ logs หากมีปัญหา
4. ไปที่ "Settings" tab เพื่อดู domain URL

## 🔧 การตั้งค่าเพิ่มเติม

### Custom Domain (Optional)
1. ไปที่ "Settings" tab
2. คลิก "Custom Domains"
3. เพิ่ม domain ของคุณ
4. ตั้งค่า DNS records ตามที่ Railway บอก

### Environment Variables สำหรับ Production
```
NODE_ENV=production
PORT=3000
```

### Monitoring และ Logs
- ดู logs ได้ใน "Deployments" tab
- ตั้งค่า alerts ใน "Settings" tab
- ใช้ Railway CLI สำหรับ local development

## 🚨 การแก้ไขปัญหา

### Build Failed
- ตรวจสอบ `package.json` scripts
- ตรวจสอบ dependencies
- ดู build logs ใน Railway

### Database Connection Error
- ตรวจสอบ `MONGODB_URI` format
- ตรวจสอบ MongoDB Atlas Network Access
- ตรวจสอบ database user permissions

### JWT Error
- ตรวจสอบ `JWT_SECRET` ว่าตั้งค่าแล้ว
- ตรวจสอบ JWT token format

### OpenAI API Error
- ตรวจสอบ `OPENAI_API_KEY` ว่าถูกต้อง
- ตรวจสอบ API key permissions
- ตรวจสอบ billing status

## 📊 การ Monitor

### Health Check
- URL: `https://your-app.railway.app/api/health`
- ควร return: `{"status":"OK","timestamp":"...","uptime":...}`

### Logs
- ดู logs ได้ใน Railway Dashboard
- ใช้ `railway logs` command

### Metrics
- Railway จะแสดง CPU, Memory usage
- ตรวจสอบใน "Metrics" tab

## 🔄 การ Update

### Automatic Deploy
- Railway จะ auto-deploy เมื่อ push ไป GitHub
- ตรวจสอบ "Deployments" tab

### Manual Deploy
```bash
# ใช้ Railway CLI
railway login
railway link
railway up
```

## 💰 Pricing

- Railway มี free tier สำหรับ development
- Production ใช้ pay-as-you-go pricing
- ตรวจสอบ pricing ใน Railway Dashboard

## 📞 Support

- Railway Documentation: https://docs.railway.app
- MongoDB Atlas Documentation: https://docs.atlas.mongodb.com
- OpenAI API Documentation: https://platform.openai.com/docs

## ✅ Checklist

- [ ] Repository pushed to GitHub
- [ ] Railway project created
- [ ] Environment variables set
- [ ] MongoDB connected
- [ ] Build successful
- [ ] Health check passing
- [ ] Frontend accessible
- [ ] API endpoints working
- [ ] Socket.IO connected
- [ ] Custom domain configured (optional)
