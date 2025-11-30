# 🚀 ChatCenter-AI Deployment Guide

## วิธีอัพเดท Docker Image บน Docker Hub

เนื่องจากมีปัญหา network ในการ build บน Mac สามารถใช้ **GitHub Actions** แทนได้!

---

## ✅ วิธีที่ 1: ใช้ GitHub Actions (แนะนำ!)

### ขั้นตอนที่ 1: ตั้งค่า Docker Hub Secrets

1. ไปที่ GitHub Repository: https://github.com/Phonsadboy/ChatCenterAI
2. ไปที่ **Settings** → **Secrets and variables** → **Actions**
3. กด **New repository secret** และเพิ่ม:

   - **DOCKER_USERNAME** = `xianta456`
   - **DOCKER_PASSWORD** = `<your-docker-hub-password-or-token>`

### ขั้นตอนที่ 2: Push Code ไป GitHub

```bash
cd /Users/mac/pp/ChatCenterAI-9

# Add ไฟล์ที่เพิ่มใหม่
git add .github/workflows/docker-publish.yml
git add docker-deploy.sh
git add docker-compose.yml
git add DOCKER.md
git add DEPLOYMENT.md
git add .dockerignore
git add package.json

# Commit
git commit -m "feat: add Docker deployment automation

- Add GitHub Actions workflow for auto Docker build & push
- Update version to 1.0.1
- Add docker-compose.yml for easy deployment
- Add comprehensive Docker documentation
- Improve .dockerignore"

# Push to GitHub
git push origin main
```

### ขั้นตอนที่ 3: ดูผลการ Build

1. ไปที่ **Actions** tab ใน GitHub Repository
2. คุณจะเห็น workflow "Docker Build and Push" กำลังทำงาน
3. รอประมาณ 2-5 นาที จนกว่า build เสร็จ
4. Docker image จะถูก push ไปที่ https://hub.docker.com/r/xianta456/chatcenter-ai อัตโนมัติ!

---

## 🔄 วิธีที่ 2: Build บน Mac (ถ้า Docker ทำงานปกติ)

### ตรวจสอบ Docker

```bash
# ตรวจสอบว่า Docker ทำงานหรือไม่
docker info

# ถ้าไม่ทำงาน ให้รีสตาร์ท Docker Desktop
# หรือตรวจสอบ Network Settings
```

### Build และ Push

```bash
# วิธีที่ 1: ใช้ script (ง่ายที่สุด)
./docker-deploy.sh

# วิธีที่ 2: Manual
docker login
docker build -t xianta456/chatcenter-ai:1.0.1 -t xianta456/chatcenter-ai:latest .
docker push xianta456/chatcenter-ai:1.0.1
docker push xianta456/chatcenter-ai:latest
```

---

## 🐛 แก้ไขปัญหา Docker Network

ถ้า Docker มีปัญหา network timeout:

### 1. ตรวจสอบ DNS

```bash
# ใน Docker Desktop Settings:
# Settings → Resources → Network
# ลอง change DNS เป็น:
# - 8.8.8.8, 8.8.4.4 (Google DNS)
# - 1.1.1.1, 1.0.0.1 (Cloudflare DNS)
```

### 2. รีสตาร์ท Docker

```bash
osascript -e 'quit app "Docker"'
sleep 5
open -a Docker
sleep 30
docker info
```

### 3. ตรวจสอบ VPN/Proxy

- ปิด VPN ชั่วคราว
- ตรวจสอบ Proxy settings ใน Docker Desktop

### 4. ลองใช้ Docker CLI login

```bash
# แทนที่จะใช้ web-based login
docker login -u xianta456
# จากนั้นใส่ password
```

---

## 📦 วิธีใช้งาน Docker Image (สำหรับผู้ใช้)

### Pull และ Run

```bash
# Pull image ล่าสุด
docker pull xianta456/chatcenter-ai:latest

# Run with environment file
docker run -d \
  --name chatcenter-ai \
  -p 3000:3000 \
  --env-file .env \
  xianta456/chatcenter-ai:latest

# หรือใช้ docker-compose
docker-compose up -d
```

### ตรวจสอบ Logs

```bash
docker logs chatcenter-ai
docker logs -f chatcenter-ai  # Follow mode
```

### ตรวจสอบ Health

```bash
curl http://localhost:3000/health
```

---

## 🎉 สรุป

**วิธีที่แนะนำสำหรับคุณ:**

1. ✅ ตั้งค่า Docker Hub Secrets ใน GitHub (ทำครั้งเดียว)
2. ✅ Push code ไป GitHub
3. ✅ GitHub Actions จะ build และ push Docker image ให้อัตโนมัติ
4. ✅ ทุกครั้งที่ push code ใหม่ จะมี Docker image ใหม่ถูกสร้างโดยอัตโนมัติ!

**ไม่ต้องกังวลเรื่อง network หรือ build บน Mac อีกต่อไป!** 🚀
