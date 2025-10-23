# 🚀 คู่มือการ Deploy ChatCenter AI

เอกสารนี้อธิบายวิธีการ Deploy ChatCenter AI บนแพลตฟอร์มต่างๆ

---

## 📋 สารบัญ

1. [การเตรียมความพร้อม](#การเตรียมความพร้อม)
2. [Deploy บน Railway](#deploy-บน-railway)
3. [Deploy บน Heroku](#deploy-บน-heroku)
4. [Deploy ด้วย Docker](#deploy-ด้วย-docker)
5. [Deploy บน VPS/Cloud](#deploy-บน-vpscloud)
6. [การตั้งค่า MongoDB](#การตั้งค่า-mongodb)
7. [การตั้งค่า SSL/HTTPS](#การตั้งค่า-sslhttps)
8. [การ Monitor และ Maintenance](#การ-monitor-และ-maintenance)

---

## 🎯 การเตรียมความพร้อม

### สิ่งที่ต้องเตรียม

#### 1. API Keys และ Credentials
```
✓ OpenAI API Key
✓ MongoDB Connection String (Cloud หรือ Local)
✓ LINE Channel Credentials (ถ้าใช้)
✓ Facebook App Credentials (ถ้าใช้)
✓ Domain/URL สำหรับ Webhook (HTTPS)
```

#### 2. Environment Variables ที่จำเป็น
```env
# จำเป็น
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/database
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
PUBLIC_BASE_URL=https://your-domain.com

# ไม่บังคับ
PORT=3000
ADMIN_PASSWORD=your_secure_password
```

#### 3. ตรวจสอบความพร้อม
```bash
# ทดสอบ Local ก่อน Deploy
npm install
npm start

# เปิดบราวเซอร์
http://localhost:3000/health
# ควรได้ {"status":"ok"}
```

---

## 🚂 Deploy บน Railway

Railway เป็นแพลตฟอร์มที่ Deploy ง่ายที่สุด มี Free Tier และรองรับ Auto Deploy

### ขั้นตอนการ Deploy

#### 1. เตรียม Railway Account
1. ไปที่ [railway.app](https://railway.app)
2. Sign up ด้วย GitHub
3. ยืนยัน Email

#### 2. ติดตั้ง Railway CLI (ไม่บังคับ)
```bash
npm install -g @railway/cli
```

#### 3. Deploy แบบ GitHub (แนะนำ)

**ผ่าน Railway Dashboard:**
1. Login เข้า Railway
2. คลิก **"New Project"**
3. เลือก **"Deploy from GitHub repo"**
4. เลือก Repository ของคุณ
5. Railway จะ Auto-detect และ Deploy

**ผ่าน CLI:**
```bash
# Login
railway login

# Link กับโปรเจค (ในโฟลเดอร์โปรเจค)
railway init

# Deploy
railway up
```

#### 4. ตั้งค่า Environment Variables

**ผ่าน Dashboard:**
1. เลือกโปรเจคใน Railway
2. ไปที่แท็บ **"Variables"**
3. เพิ่มตัวแปรต่อไปนี้:

```env
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/chatbot
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
PUBLIC_BASE_URL=https://your-app.railway.app
ADMIN_PASSWORD=your_secure_password
```

**ผ่าน CLI:**
```bash
railway variables set MONGO_URI="mongodb+srv://..."
railway variables set OPENAI_API_KEY="sk-..."
railway variables set PUBLIC_BASE_URL="https://your-app.railway.app"
railway variables set ADMIN_PASSWORD="your_password"
```

#### 5. ตั้งค่า Custom Domain (ไม่บังคับ)

1. ไปที่ **Settings** → **Domains**
2. คลิก **"Custom Domain"**
3. เพิ่มโดเมนของคุณ
4. ตั้งค่า DNS ตามที่ Railway แนะนำ
5. อัพเดท `PUBLIC_BASE_URL` ให้ตรงกับโดเมนใหม่

#### 6. ตรวจสอบ Deployment

```bash
# ดู logs
railway logs

# เปิดแอป
railway open

# ตรวจสอบ health
curl https://your-app.railway.app/health
```

### คุณสมบัติของ Railway

✅ **ข้อดี:**
- Deploy ง่าย Auto-detect
- Free Tier มีให้ใช้
- Auto Deploy จาก GitHub
- Built-in SSL/HTTPS
- Managed Environment

⚠️ **ข้อควรระวัง:**
- Free Tier มีข้อจำกัดเวลา (500 ชม./เดือน)
- ไม่มี built-in database (ต้องใช้ MongoDB Atlas)

---

## 🔴 Deploy บน Heroku

Heroku เป็นแพลตฟอร์มที่ใช้งานง่าย แต่ Free Tier ถูกยกเลิกแล้ว

### ขั้นตอนการ Deploy

#### 1. เตรียม Heroku Account
1. ไปที่ [heroku.com](https://heroku.com)
2. Sign up และยืนยัน Email
3. เลือก Plan (Eco Dynos ขั้นต่ำ $5/เดือน)

#### 2. ติดตั้ง Heroku CLI
```bash
# macOS (Homebrew)
brew tap heroku/brew && brew install heroku

# Windows (Chocolatey)
choco install heroku-cli

# Ubuntu/Debian
curl https://cli-assets.heroku.com/install.sh | sh
```

#### 3. Login และสร้าง App
```bash
# Login
heroku login

# สร้าง App (ในโฟลเดอร์โปรเจค)
heroku create your-app-name
```

#### 4. ตั้งค่า Environment Variables
```bash
heroku config:set MONGO_URI="mongodb+srv://..."
heroku config:set OPENAI_API_KEY="sk-..."
heroku config:set PUBLIC_BASE_URL="https://your-app.herokuapp.com"
heroku config:set ADMIN_PASSWORD="your_password"
```

#### 5. Deploy
```bash
# Push to Heroku
git push heroku main

# หรือถ้า branch ของคุณชื่ออื่น
git push heroku your-branch:main
```

#### 6. ตรวจสอบ
```bash
# ดู logs
heroku logs --tail

# เปิดแอป
heroku open

# ตรวจสอบ status
heroku ps
```

### ไฟล์ที่จำเป็นสำหรับ Heroku

โปรเจคมีไฟล์ `Procfile` อยู่แล้ว:
```
web: npm start
```

---

## 🐳 Deploy ด้วย Docker

Docker ทำให้ Deploy บน Server ใดก็ได้ง่ายขึ้น

### ขั้นตอนการ Deploy

#### 1. ติดตั้ง Docker
```bash
# macOS/Windows
# ดาวน์โหลด Docker Desktop จาก docker.com

# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

#### 2. Build Docker Image
```bash
# Build image
docker build -t chatcenter-ai .

# ตรวจสอบ
docker images
```

#### 3. Run Container

**แบบง่าย:**
```bash
docker run -d \
  -p 3000:3000 \
  -e MONGO_URI="mongodb+srv://..." \
  -e OPENAI_API_KEY="sk-..." \
  -e PUBLIC_BASE_URL="https://your-domain.com" \
  --name chatcenter \
  chatcenter-ai
```

**แบบใช้ .env file:**
```bash
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name chatcenter \
  chatcenter-ai
```

#### 4. จัดการ Container
```bash
# ดู logs
docker logs -f chatcenter

# Stop container
docker stop chatcenter

# Start container
docker start chatcenter

# Restart container
docker restart chatcenter

# Remove container
docker rm -f chatcenter
```

### Docker Compose (แนะนำ)

สร้างไฟล์ `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGO_URI=${MONGO_URI}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    restart: unless-stopped
    depends_on:
      - mongodb
    volumes:
      - ./public/assets:/app/public/assets

  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    restart: unless-stopped

volumes:
  mongodb_data:
```

**รัน Docker Compose:**
```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f

# Restart
docker-compose restart
```

---

## 🖥️ Deploy บน VPS/Cloud

Deploy แบบ Traditional บน Ubuntu Server

### ขั้นตอนการ Deploy

#### 1. เตรียม Server
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# ติดตั้ง Node.js (18.x)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# ติดตั้ง MongoDB (ถ้าต้องการ Local)
curl -fsSL https://www.mongodb.org/static/pgp/server-6.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-6.0.gpg
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# ติดตั้ง PM2 (Process Manager)
sudo npm install -g pm2

# ติดตั้ง Nginx (Reverse Proxy)
sudo apt install -y nginx
```

#### 2. Clone และตั้งค่าโปรเจค
```bash
# Clone repository
cd /var/www
sudo git clone <repository-url> chatcenter-ai
cd chatcenter-ai

# ติดตั้ง dependencies
sudo npm install --production

# สร้าง .env file
sudo nano .env
```

เพิ่มค่าใน `.env`:
```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/chatbot
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
PUBLIC_BASE_URL=https://your-domain.com
ADMIN_PASSWORD=your_secure_password
```

#### 3. ตั้งค่า PM2
```bash
# Start application
pm2 start index.js --name chatcenter-ai

# Save PM2 config
pm2 save

# Auto-start on boot
pm2 startup
# ทำตามคำสั่งที่แสดง

# จัดการ PM2
pm2 status          # ดูสถานะ
pm2 logs            # ดู logs
pm2 restart all     # Restart
pm2 stop all        # Stop
```

#### 4. ตั้งค่า Nginx

สร้างไฟล์ config:
```bash
sudo nano /etc/nginx/sites-available/chatcenter-ai
```

เพิ่ม configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/chatcenter-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 5. ตั้งค่า SSL ด้วย Certbot
```bash
# ติดตั้ง Certbot
sudo apt install -y certbot python3-certbot-nginx

# สร้าง SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (ตั้งค่าอัตโนมัติ)
sudo certbot renew --dry-run
```

#### 6. ตั้งค่า Firewall
```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

---

## 🗄️ การตั้งค่า MongoDB

### MongoDB Atlas (Cloud - แนะนำ)

#### 1. สร้าง Cluster
1. ไปที่ [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)
2. Sign up และ Login
3. คลิก **"Build a Database"**
4. เลือก **"Shared"** (Free Tier)
5. เลือก Region ใกล้ที่สุด
6. ตั้งชื่อ Cluster

#### 2. ตั้งค่า Access
```
1. Database Access → Add New Database User
   - Username: chatbot_user
   - Password: <strong-password>
   - Privileges: Read and write to any database

2. Network Access → Add IP Address
   - Allow Access from Anywhere (0.0.0.0/0)
   หรือกำหนด IP ของ Server
```

#### 3. Get Connection String
```
1. คลิก "Connect" ใน Cluster
2. เลือก "Connect your application"
3. คัดลอก Connection String:
   mongodb+srv://chatbot_user:<password>@cluster.mongodb.net/chatbot
4. แทนที่ <password> ด้วยรหัสผ่านจริง
```

### MongoDB Local

#### ติดตั้งบน Ubuntu
```bash
# ติดตั้ง
sudo apt install -y mongodb-org

# Start service
sudo systemctl start mongod
sudo systemctl enable mongod

# Connection String
MONGO_URI=mongodb://localhost:27017/chatbot
```

#### การสำรองข้อมูล
```bash
# Manual backup
mongodump --uri="mongodb://localhost:27017/chatbot" --out=./backup

# Restore
mongorestore --uri="mongodb://localhost:27017/chatbot" ./backup/chatbot

# ใช้ Script อัตโนมัติ
./scripts/mongo-backup.sh
```

#### ตั้งค่า Cron สำหรับ Auto Backup
```bash
# Edit crontab
crontab -e

# เพิ่มบรรทัดนี้ (สำรองทุกวันตอนตี 2)
0 2 * * * /path/to/chatcenter-ai/scripts/mongo-backup.sh >> /var/log/mongo-backup.log 2>&1
```

---

## 🔒 การตั้งค่า SSL/HTTPS

HTTPS จำเป็นสำหรับ Webhook ของ LINE และ Facebook

### Option 1: Certbot (Free)

```bash
# ติดตั้ง
sudo apt install certbot python3-certbot-nginx

# สร้าง certificate
sudo certbot --nginx -d your-domain.com

# Certificate จะ auto-renew
```

### Option 2: Cloudflare (Free)

1. สมัครใช้งาน [Cloudflare](https://cloudflare.com)
2. เพิ่มโดเมนของคุณ
3. ชี้ DNS A Record ไปที่ Server IP
4. เปิด SSL/TLS Mode: **"Full"** หรือ **"Full (strict)"**
5. Cloudflare จะจัดการ SSL ให้อัตโนมัติ

### Option 3: Let's Encrypt Manual

```bash
# ติดตั้ง Certbot
sudo apt install certbot

# สร้าง certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificate จะอยู่ที่
/etc/letsencrypt/live/your-domain.com/fullchain.pem
/etc/letsencrypt/live/your-domain.com/privkey.pem
```

---

## 📊 การ Monitor และ Maintenance

### Monitoring Tools

#### PM2 Monitoring
```bash
# Status
pm2 status

# Logs
pm2 logs

# Metrics
pm2 monit

# Web dashboard (ไม่บังคับ)
pm2 plus
```

#### Application Monitoring
```bash
# Health check
curl https://your-domain.com/health

# Test webhook
curl https://your-domain.com/webhook/line/YOUR_BOT_ID
```

### Logs Management

#### ตรวจสอบ Logs
```bash
# PM2 logs
pm2 logs chatcenter-ai

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# MongoDB logs (ถ้า local)
sudo tail -f /var/log/mongodb/mongod.log
```

#### Rotate Logs
```bash
# PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Maintenance Tasks

#### อัพเดทแอปพลิเคชัน
```bash
cd /var/www/chatcenter-ai
sudo git pull
sudo npm install
pm2 restart chatcenter-ai
```

#### อัพเดท Dependencies
```bash
# Check outdated
npm outdated

# Update
sudo npm update

# Restart
pm2 restart chatcenter-ai
```

#### Database Maintenance
```bash
# Backup
./scripts/mongo-backup.sh

# Check size
mongo chatbot --eval "db.stats()"

# Compact (ถ้าจำเป็น)
mongo chatbot --eval "db.runCommand({compact: 'chat_history'})"
```

---

## 🚨 Troubleshooting

### Application ไม่ Start

```bash
# ตรวจสอบ logs
pm2 logs

# ตรวจสอบ .env
cat .env

# ตรวจสอบ permissions
ls -la /var/www/chatcenter-ai

# Restart
pm2 restart all
```

### MongoDB Connection Failed

```bash
# ตรวจสอบ MongoDB
sudo systemctl status mongod

# Restart MongoDB
sudo systemctl restart mongod

# ตรวจสอบ connection string
echo $MONGO_URI
```

### Nginx Error

```bash
# ตรวจสอบ config
sudo nginx -t

# ตรวจสอบ logs
sudo tail -f /var/log/nginx/error.log

# Restart nginx
sudo systemctl restart nginx
```

### SSL Certificate Issues

```bash
# ตรวจสอบ certificate
sudo certbot certificates

# Renew certificate
sudo certbot renew --dry-run
sudo certbot renew

# Reload nginx
sudo systemctl reload nginx
```

---

## 📋 Deployment Checklist

### ก่อน Deploy

- [ ] ทดสอบ Local ให้ทำงานได้
- [ ] เตรียม Environment Variables ครบ
- [ ] เตรียม MongoDB (Cloud หรือ Local)
- [ ] เตรียมโดเมน (ถ้ามี)
- [ ] Backup database (ถ้ามีข้อมูลเก่า)

### หลัง Deploy

- [ ] ทดสอบ Health Check
- [ ] ทดสอบ Admin Login
- [ ] ตั้งค่า LINE/Facebook Webhook
- [ ] ทดสอบส่งข้อความ
- [ ] ตั้งค่า SSL/HTTPS
- [ ] ตั้งค่า Auto Backup
- [ ] ตั้งค่า Monitoring

### Security

- [ ] เปลี่ยน ADMIN_PASSWORD
- [ ] ใช้ Strong Password สำหรับ MongoDB
- [ ] เปิด HTTPS
- [ ] ตั้งค่า Firewall
- [ ] จำกัด IP Access (ถ้าเป็นไปได้)
- [ ] ไม่ commit .env เข้า Git

---

## 📞 ติดต่อและการสนับสนุน

หากพบปัญหาหรือต้องการความช่วยเหลือ:

1. ตรวจสอบ logs ก่อนเสมอ
2. อ่าน [README.md](./README.md) ประกอบ
3. ตรวจสอบ Environment Variables
4. ลอง Restart แอปพลิเคชัน

---

**สุดท้าย:** อย่าลืม Backup ข้อมูลเป็นประจำ! 💾

**เวอร์ชัน:** 1.0.0  
**อัพเดทล่าสุด:** ตุลาคม 2025

