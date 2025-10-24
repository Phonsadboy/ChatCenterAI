# ⚠️ ต้องตั้งค่า PUBLIC_BASE_URL เพื่อให้ระบบติดตามส่งภาพทำงาน!

## 🚨 ปัญหาที่พบ

จาก log ที่แสดง:
```
url: '/assets/followup/followup_1761224423487_195c96c2b23fea42.jpg'
previewUrl: '/assets/followup/followup_1761224423487_195c96c2b23fea42_thumb.jpg'
```

URL เป็น **relative path** (`/assets/...`) ไม่ใช่ **absolute URL** (`https://yourdomain.com/assets/...`)

**ผลลัพธ์:** Facebook และ LINE API **ไม่สามารถเข้าถึงรูปภาพได้** เพราะต้องการ absolute HTTPS URL

## ✅ วิธีแก้ไข (จำเป็น)

### ขั้นตอนที่ 1: ตั้งค่า PUBLIC_BASE_URL

#### สำหรับ Railway:
```bash
railway variables set PUBLIC_BASE_URL=https://yourdomain.railway.app
```

หรือผ่าน Railway Dashboard:
1. เข้า Project → Variables
2. เพิ่ม variable ใหม่:
   - Name: `PUBLIC_BASE_URL`
   - Value: `https://yourdomain.railway.app` (แทนด้วย domain จริงของคุณ)

#### สำหรับ Heroku:
```bash
heroku config:set PUBLIC_BASE_URL=https://yourapp.herokuapp.com
```

#### สำหรับ Local Development:
สร้างไฟล์ `.env`:
```env
PUBLIC_BASE_URL=https://yourdomain.com
```

หรือถ้าใช้ ngrok:
```env
PUBLIC_BASE_URL=https://abc123.ngrok.io
```

### ขั้นตอนที่ 2: Restart Application

หลังจากตั้งค่า environment variable แล้ว ต้อง restart application:

```bash
# Railway
railway up

# Heroku
heroku restart

# Local
npm restart
```

### ขั้นตอนที่ 3: ทดสอบ

1. ลอง upload รูปใหม่ในระบบติดตาม
2. ตรวจสอบ log ว่า URL เปลี่ยนเป็น absolute URL แล้ว:

```
[FollowUp Debug] Round data: {
  hasPublicBaseUrl: true,
  sampleUrl: 'https://yourdomain.com/assets/followup/...'  <-- ต้องเป็น https://
}
```

## 🔍 การตรวจสอบว่าตั้งค่าสำเร็จ

### 1. ตรวจสอบ Environment Variable

```bash
# Railway
railway variables

# Heroku
heroku config

# Local
echo $PUBLIC_BASE_URL
```

### 2. ดู Log เมื่อส่งข้อความติดตาม

**ถ้าตั้งค่าถูกต้อง จะเห็น:**
```
[FollowUp Debug] Round data: {
  hasPublicBaseUrl: true,
  sampleUrl: 'https://yourdomain.com/assets/followup/followup_xxx.jpg'
}
```

**ถ้ายังไม่ได้ตั้งค่า จะเห็น:**
```
[FollowUp Warning] PUBLIC_BASE_URL is not set. Images with relative URLs may fail.
[FollowUp Debug] Round data: {
  hasPublicBaseUrl: false,
  sampleUrl: '/assets/followup/followup_xxx.jpg'
}
```

## 🛠️ การแก้ไขที่ทำไปแล้ว

### 1. เพิ่มการแปลง URL ใน `sendFollowUpMessage` (บรรทัด 1758-1772)

```javascript
// แปลง relative URLs เป็น absolute URLs ถ้า PUBLIC_BASE_URL มี
if (PUBLIC_BASE_URL) {
  images = images.map(img => {
    const fixed = { ...img };
    if (img.url && img.url.startsWith("/")) {
      fixed.url = PUBLIC_BASE_URL.replace(/\/$/, "") + img.url;
    }
    if (img.previewUrl && img.previewUrl.startsWith("/")) {
      fixed.previewUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + img.previewUrl;
    }
    if (img.thumbUrl && img.thumbUrl.startsWith("/")) {
      fixed.thumbUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + img.thumbUrl;
    }
    return fixed;
  });
}
```

### 2. เพิ่มการแปลง URL ใน `sanitizeFollowUpImage` (บรรทัด 964-978)

```javascript
// แปลง relative URL เป็น absolute URL
if (url.startsWith("/") && PUBLIC_BASE_URL) {
  url = PUBLIC_BASE_URL.replace(/\/$/, "") + url;
}
```

### 3. เพิ่ม Warning เมื่อไม่มี PUBLIC_BASE_URL (บรรทัด 1753-1755)

```javascript
if (!PUBLIC_BASE_URL) {
  console.warn("[FollowUp Warning] PUBLIC_BASE_URL is not set. Images with relative URLs may fail.");
}
```

### 4. เพิ่ม Debug Log แสดงสถานะ URL (บรรทัด 1775-1782, 1033-1043)

```javascript
console.log("[FollowUp Debug] Round data:", {
  hasPublicBaseUrl: !!PUBLIC_BASE_URL,
  sampleUrl: images[0]?.url,
  // ...
});
```

## 📊 ตัวอย่างการทำงาน

### ก่อนตั้งค่า PUBLIC_BASE_URL:
```javascript
Input:  url: '/assets/followup/image.jpg'
Output: url: '/assets/followup/image.jpg'  // ❌ ยังเป็น relative path
Result: Facebook/LINE API ไม่สามารถเข้าถึง
```

### หลังตั้งค่า PUBLIC_BASE_URL:
```javascript
Input:  url: '/assets/followup/image.jpg'
Output: url: 'https://yourdomain.com/assets/followup/image.jpg'  // ✅ เป็น absolute URL
Result: Facebook/LINE API เข้าถึงได้ปกติ
```

## 🎯 ข้อควรระวัง

### 1. Domain ต้องตรงกับที่ใช้จริง
❌ ไม่ถูกต้อง:
```env
PUBLIC_BASE_URL=http://localhost:3000  # ใช้ไม่ได้บน production
PUBLIC_BASE_URL=http://yourdomain.com  # ต้องเป็น https://
```

✅ ถูกต้อง:
```env
PUBLIC_BASE_URL=https://yourdomain.railway.app
PUBLIC_BASE_URL=https://yourdomain.com
```

### 2. ห้ามมี trailing slash
❌ ไม่ถูกต้อง:
```env
PUBLIC_BASE_URL=https://yourdomain.com/  # มี / ท้าย
```

✅ ถูกต้อง:
```env
PUBLIC_BASE_URL=https://yourdomain.com
```

### 3. ต้อง restart หลังเปลี่ยนแปลง
ทุกครั้งที่เปลี่ยน environment variable ต้อง restart application เพื่อให้โหลดค่าใหม่

## 🚀 ขั้นตอนสมบูรณ์

1. ✅ ตั้งค่า `PUBLIC_BASE_URL` environment variable
2. ✅ Restart application
3. ✅ ตรวจสอบ log ว่า `hasPublicBaseUrl: true`
4. ✅ อัพโหลดรูปใหม่ในระบบติดตาม (หรือรอรูปเก่าถูกแปลงอัตโนมัติ)
5. ✅ ทดสอบส่งข้อความติดตาม
6. ✅ ตรวจสอบว่าผู้ใช้ได้รับรูปภาพ

## 💡 ทางเลือกอื่น (ถ้าไม่สามารถตั้งค่า PUBLIC_BASE_URL ได้)

ถ้าไม่สามารถตั้งค่า environment variable ได้ สามารถแก้ไขใน code โดยตรง:

### แก้ไขใน `index.js` (บรรทัด 25):

```javascript
// เดิม
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

// แก้เป็น
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://yourdomain.railway.app";
```

**หมายเหตุ:** วิธีนี้ไม่แนะนำ เพราะต้องแก้ code ทุกครั้งที่เปลี่ยน domain

---

**สรุป:** ต้องตั้งค่า `PUBLIC_BASE_URL` environment variable เพื่อให้ระบบติดตามส่งภาพทำงานได้!

**ตรวจสอบเพิ่มเติม:**
- `FOLLOWUP_IMAGE_FIX.md` - การแก้ไขสำหรับ LINE
- `FACEBOOK_FOLLOWUP_FINAL_FIX.md` - การแก้ไขสำหรับ Facebook

