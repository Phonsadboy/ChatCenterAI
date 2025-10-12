# การติดตั้งและตั้งค่าแอปพลิเคชัน

## ขั้นตอนการติดตั้ง

### 1. สร้างไฟล์ .env
คัดลอกและสร้างไฟล์ `.env` ในโฟลเดอร์หลักของโปรเจ็กต์:

```bash
# LINE Bot Configuration
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token_here
LINE_CHANNEL_SECRET=your_line_channel_secret_here

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/chatbot

# Admin Configuration
ADMIN_PASSWORD=admin123

# Port Configuration
PORT=3000

# Public Base URL (โดเมนที่ Facebook เข้าถึงได้)
PUBLIC_BASE_URL=https://your.domain.com
```

### 2. แก้ไขค่าตัวแปร

**สำหรับการทดสอบ (ไม่ต้องการ LINE Bot และ OpenAI):**
```bash
LINE_CHANNEL_ACCESS_TOKEN=dummy_token
LINE_CHANNEL_SECRET=dummy_secret
OPENAI_API_KEY=dummy_key
MONGO_URI=mongodb://localhost:27017/chatbot
ADMIN_PASSWORD=admin123
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
```

**สำหรับการใช้งานจริง:**
- `LINE_CHANNEL_ACCESS_TOKEN` - รับจาก LINE Developers Console
- `LINE_CHANNEL_SECRET` - รับจาก LINE Developers Console
- `OPENAI_API_KEY` - รับจาก OpenAI Platform
- `MONGO_URI` - Connection string ของ MongoDB
- `ADMIN_PASSWORD` - รหัสผ่านสำหรับเข้าระบบ Admin
- `PORT` - Port ที่ต้องการให้แอปรัน (default: 3000)
- `PUBLIC_BASE_URL` - โดเมน https ที่ Facebook เข้าถึงได้ (เช่น https://your.domain.com)

### 3. ติดตั้ง Dependencies
```bash
npm install
```

### 4. เริ่มแอปพลิเคชัน
```bash
node index.js
```

### 5. สำรองฐานข้อมูล MongoDB

เพื่อให้ระบบพร้อมกู้คืนได้แม้มีการรีสตาร์ทเซิร์ฟเวอร์ ให้ใช้สคริปต์ `scripts/mongo-backup.sh` ซึ่งจะเรียก `mongodump` เพื่อสำรองทั้งฐานข้อมูล (รวม GridFS ที่เก็บรูปภาพ)

1. ตรวจสอบว่ามี `mongodump` ใน PATH (`mongodump --version`)
2. ตั้งค่า environment ตามต้องการก่อนรัน เช่น
   ```bash
   export MONGO_URI="mongodb://user:pass@host:27017/chatbot"
   export BACKUP_ROOT="/var/backups/chatcenter"
   export BACKUP_RETENTION_DAYS=14
   ```
3. รันสคริปต์ด้วยสิทธิ์ที่สามารถเขียนโฟลเดอร์ backup ได้
   ```bash
   ./scripts/mongo-backup.sh
   ```
4. ตั้ง Cron หรือ systemd timer ให้รันสคริปต์สม่ำเสมอ เช่นทุกวันตอนตี 2
   ```
   0 2 * * * /path/to/repo/scripts/mongo-backup.sh >> /var/log/chatcenter-backup.log 2>&1
   ```

> หมายเหตุ: สคริปต์จะสร้างไดเรกทอรีตามเวลาแบบ `YYYYMMDD-HHMMSS` และลบโฟลเดอร์เก่าที่อายุมากกว่า `BACKUP_RETENTION_DAYS`

### 6. เข้าใช้งาน
- **Admin Panel**: http://localhost:3000/admin
- **Username**: (ไม่ต้องใส่)
- **Password**: ตามที่ตั้งค่าใน `ADMIN_PASSWORD`

## ฟีเจอร์ Excel Upload

หลังจากเข้าสู่ระบบ Admin แล้ว:
1. คลิกปุ่ม **"อัพโหลด Excel"** (สีเขียว)
2. เลือกไฟล์ Excel (.xlsx หรือ .xls)
3. คลิก **"ดูตัวอย่าง"** เพื่อดูข้อมูลที่จะถูกสร้าง
4. คลิก **"อัพโหลดและบันทึก"** เพื่อบันทึกจริง

### รูปแบบไฟล์ Excel
- **แต่ละแท็บ** จะกลายเป็น 1 instruction
- **แท็บที่มีหลายแถว** = instruction แบบตาราง
- **แท็บที่มี 1 แถว** = instruction แบบข้อความ
- **ชื่อแท็บ** = หัวข้อของ instruction 
