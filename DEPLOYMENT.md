# การ Deploy ChatCenterAI บน Railway

## ข้อกำหนดเบื้องต้น

- GitHub repository ที่มีโค้ดโปรเจค
- บัญชี Railway (https://railway.app)
- MongoDB database (สามารถใช้ MongoDB Atlas หรือ Railway MongoDB)

## ขั้นตอนการ Deploy

### 1. เตรียม Environment Variables

สร้างไฟล์ `.env` ใน backend directory หรือตั้งค่าใน Railway dashboard:

```env
# Database
MONGODB_URI=your_mongodb_connection_string

# JWT
JWT_SECRET=your_jwt_secret_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Frontend URL (สำหรับ CORS)
FRONTEND_URL=https://your-frontend-domain.com

# Environment
NODE_ENV=production
PORT=3001
```

### 2. Deploy บน Railway

#### วิธีที่ 1: ใช้ Railway CLI
```bash
# ติดตั้ง Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
railway up
```

#### วิธีที่ 2: ใช้ Railway Dashboard
1. ไปที่ https://railway.app
2. คลิก "New Project"
3. เลือก "Deploy from GitHub repo"
4. เลือก repository ของคุณ
5. Railway จะ detect Dockerfile และ build อัตโนมัติ

### 3. ตั้งค่า Environment Variables

ใน Railway dashboard:
1. ไปที่ "Variables" tab
2. เพิ่ม environment variables ที่จำเป็น
3. คลิก "Deploy" เพื่อ restart application

### 4. ตรวจสอบ Deployment

1. ไปที่ "Deployments" tab
2. ตรวจสอบ build logs
3. ตรวจสอบ application logs
4. ทดสอบ health check endpoint: `https://your-app.railway.app/api/health`

## โครงสร้างไฟล์ที่สำคัญ

```
ChatCenterAI-1/
├── Dockerfile              # Docker configuration
├── railway.json            # Railway configuration
├── .dockerignore           # Docker ignore files
├── backend/
│   ├── dist/               # Compiled JavaScript
│   ├── src/                # TypeScript source
│   ├── package.json        # Backend dependencies
│   └── railway.json        # Backend Railway config
└── frontend/
    ├── dist/               # Built frontend
    ├── src/                # React source
    └── package.json        # Frontend dependencies
```

## การแก้ไขปัญหา

### Build Errors
- ตรวจสอบ TypeScript compilation: `npm run build`
- ตรวจสอบ Docker build: `docker build -t test .`

### Runtime Errors
- ตรวจสอบ application logs ใน Railway dashboard
- ตรวจสอบ environment variables
- ตรวจสอบ database connection

### CORS Errors
- ตั้งค่า `FRONTEND_URL` ให้ถูกต้อง
- ตรวจสอบ CORS configuration ใน backend

## การ Monitor และ Maintenance

### Health Check
- Endpoint: `/api/health`
- ตรวจสอบ uptime และ environment

### Logs
- ใช้ Railway dashboard เพื่อดู logs
- ตั้งค่า log retention ตามความเหมาะสม

### Database
- ใช้ MongoDB Atlas หรือ Railway MongoDB
- ตั้งค่า backup และ monitoring

## การ Update Application

1. Push changes ไป GitHub
2. Railway จะ auto-deploy
3. ตรวจสอบ deployment logs
4. ทดสอบ application

## Security Considerations

- ใช้ strong JWT secret
- ตั้งค่า CORS ให้เหมาะสม
- ใช้ environment variables สำหรับ sensitive data
- เปิดใช้ rate limiting
- ใช้ HTTPS (Railway จัดการให้)

## Performance Optimization

- ใช้ CDN สำหรับ static files
- ตั้งค่า caching headers
- Optimize database queries
- ใช้ connection pooling
- Monitor memory usage
