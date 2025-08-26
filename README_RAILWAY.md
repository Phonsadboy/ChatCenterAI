# การ Deploy บน Railway

## ขั้นตอนการ Deploy

### 1. ติดตั้ง Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Login เข้า Railway
```bash
railway login
```

### 3. สร้างโปรเจคใหม่บน Railway
```bash
railway init
```

### 4. เพิ่ม Environment Variables
ตั้งค่า environment variables ต่อไปนี้ใน Railway Dashboard:

#### จำเป็น:
- `PORT` - Railway จะตั้งให้อัตโนมัติ
- `MONGO_URI` - MongoDB connection string
- `OPENAI_API_KEY` - OpenAI API key

#### ไม่บังคับ:
- `LINE_CHANNEL_ACCESS_TOKEN` - Line Bot access token (ตั้งค่าผ่านเว็บได้)
- `LINE_CHANNEL_SECRET` - Line Bot secret (ตั้งค่าผ่านเว็บได้)

#### ไม่บังคับ (มีค่าเริ่มต้น):
- `ADMIN_PASSWORD` - รหัสผ่าน admin (default: admin123)

### 5. Deploy
```bash
railway up
```

### 6. เปิดใช้งาน
```bash
railway open
```

## การตั้งค่า Environment Variables

### ผ่าน Railway CLI:
```bash
railway variables set MONGO_URI="your_mongodb_connection_string"
railway variables set OPENAI_API_KEY="your_openai_key"
```

**หมายเหตุ:** Line Bot สามารถตั้งค่าผ่านเว็บได้ ไม่จำเป็นต้องตั้งค่าใน environment variables

### ผ่าน Railway Dashboard:
1. ไปที่โปรเจคใน Railway Dashboard
2. เลือกแท็บ "Variables"
3. เพิ่ม variables ที่จำเป็น

## การตรวจสอบ Logs
```bash
railway logs
```

## การ Restart
```bash
railway service restart
```

## หมายเหตุสำคัญ

- Railway จะใช้ `PORT` environment variable อัตโนมัติ
- ระบบจะ restart อัตโนมัติเมื่อเกิดข้อผิดพลาด
- Health check จะตรวจสอบที่ path `/health`
- หน้าแรกรีไปแดชบอร์ดโดยตรง (ไม่ต้องล็อกอิน)
- **Line Bot สามารถตั้งค่าได้หลายตัวผ่านเว็บ** - ไม่ต้องตั้งค่าใน environment variables
- รองรับการตั้งชื่อและคำอธิบายสำหรับแต่ละ Line Bot
- มีระบบ webhook แยกสำหรับแต่ละ Line Bot
- ใช้ Node.js version 18 หรือสูงกว่า
