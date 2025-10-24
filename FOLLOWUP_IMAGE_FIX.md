# 🔧 การแก้ไขระบบติดตามส่งภาพ (Follow-up Image Tracking Fix)

## 📋 สรุปปัญหา

ระบบติดตามส่งภาพไม่สำเร็จเนื่องจาก **URL ของรูปภาพไม่สมบูรณ์** ทำให้ LINE API ไม่สามารถเข้าถึงรูปภาพได้

### ปัญหาที่พบ:
- เมื่อ `PUBLIC_BASE_URL` ไม่ได้ตั้งค่าใน environment variables
- `urlBase` จะเป็นค่าว่าง `""` 
- URL ที่สร้างขึ้นจะเป็น `/assets/followup/filename.jpg` (relative path)
- LINE API ต้องการ **absolute URL ที่เข้าถึงได้จากภายนอก** เช่น `https://yourdomain.com/assets/followup/filename.jpg`

## ✅ การแก้ไข

### 1. แก้ไขการสร้าง URL ในการอัพโหลดรูป (บรรทัด 9165-9167)

**ก่อนแก้ไข:**
```javascript
const urlBase = PUBLIC_BASE_URL ? PUBLIC_BASE_URL.replace(/\/$/, "") : "";
```

**หลังแก้ไข:**
```javascript
const urlBase = PUBLIC_BASE_URL 
  ? PUBLIC_BASE_URL.replace(/\/$/, "") 
  : (req.get("host") ? `https://${req.get("host")}` : "");
```

**ผลลัพธ์:**
- ถ้ามี `PUBLIC_BASE_URL` → ใช้ค่าที่ตั้งไว้
- ถ้าไม่มี → ใช้ host จาก request (เช่น `https://yourdomain.com`)
- URL ที่สร้างจะเป็น absolute URL เสมอ

### 2. เพิ่ม Debug Logging (บรรทัด 1823-1860, 1867-1907)

เพิ่ม console.log เพื่อติดตามการทำงาน:

```javascript
// Log เมื่อเรียกใช้ฟังก์ชัน
console.log("[FollowUp Debug] sendLineFollowUpMessage called:", {
  userId,
  hasMessage: !!message,
  imageCount: Array.isArray(images) ? images.length : 0,
  botId,
});

// Log รูปภาพที่ sanitize แล้ว
console.log("[FollowUp Debug] Sanitized images:", {
  inputCount: Array.isArray(images) ? images.length : 0,
  outputCount: media.length,
  urls: media.map((img) => ({
    url: img.url,
    previewUrl: img.previewUrl,
  })),
});

// Log payload ที่จะส่ง
console.log("[FollowUp Debug] Payloads to send:", {
  count: payloads.length,
  types: payloads.map((p) => p.type),
});

// Log การส่งแต่ละ chunk
console.log(`[FollowUp Debug] Sending chunk ${i + 1}/${chunks.length}:`, {
  itemCount: chunk.length,
  types: chunk.map((item) => item.type),
});
```

## 🔍 วิธีตรวจสอบว่าแก้ไขสำเร็จ

### 1. ตรวจสอบ URL ที่สร้างขึ้น
ดู log เมื่ออัพโหลดรูป:
```
[FollowUp Debug] Sanitized images: {
  inputCount: 1,
  outputCount: 1,
  urls: [
    {
      url: 'https://yourdomain.com/assets/followup/followup_1234567890_abc123.jpg',
      previewUrl: 'https://yourdomain.com/assets/followup/followup_1234567890_abc123_thumb.jpg'
    }
  ]
}
```

✅ URL ต้องเริ่มด้วย `https://` และมี domain name

### 2. ตรวจสอบการส่งข้อความ
ดู log เมื่อส่งข้อความติดตาม:
```
[FollowUp Debug] sendLineFollowUpMessage called: { userId: 'U1234...', hasMessage: true, imageCount: 1, botId: '...' }
[FollowUp Debug] Payloads to send: { count: 2, types: ['text', 'image'] }
[FollowUp Debug] Sending chunk 1/1: { itemCount: 2, types: ['text', 'image'] }
[FollowUp Debug] Chunk 1 sent successfully
[FollowUp Debug] All chunks sent successfully
```

✅ ต้องไม่มี error และมีข้อความ "sent successfully"

### 3. ตรวจสอบใน LINE
- ผู้ใช้ควรได้รับข้อความพร้อมรูปภาพ
- รูปภาพต้องแสดงได้ปกติ (ไม่ broken)

## 🛠️ การตั้งค่า Environment Variable (แนะนำ)

เพื่อความแน่นอน ควรตั้งค่า `PUBLIC_BASE_URL` ใน `.env`:

```bash
PUBLIC_BASE_URL=https://yourdomain.com
```

หรือใน Railway/Heroku:
```bash
railway variables set PUBLIC_BASE_URL=https://yourdomain.com
```

## 📊 เปรียบเทียบระบบส่งรูป

### ระบบส่งรูปปกติ (Facebook)
- ใช้ `parseMessageSegmentsByImageTokens()` แยก text และ image
- ส่งผ่าน Facebook Graph API
- รองรับ `#[IMAGE:label]` token

### ระบบติดตามส่งภาพ (LINE Follow-up)
- ใช้ `sanitizeFollowUpImages()` ตรวจสอบ URL
- ส่งผ่าน LINE Messaging API
- ใช้ `originalContentUrl` และ `previewImageUrl`
- **ต้องการ absolute URL ที่เข้าถึงได้จากภายนอก**

## 🎯 ไฟล์ที่แก้ไข

- `index.js` (บรรทัด 1815-1910, 9165-9167)

## 📝 หมายเหตุ

1. รูปภาพจะถูกเก็บใน MongoDB GridFS (collection: `followupAssets`)
2. ระบบจะสร้าง thumbnail อัตโนมัติ (ขนาด 512x512)
3. รูปภาพจะถูก optimize เป็น JPEG (quality 88%)
4. รองรับการส่งรูปหลายรูปพร้อมกัน (แบ่งเป็น chunks ละไม่เกิน 5 items)
5. URL จะถูก cache ด้วย `Cache-Control: public, max-age=604800, immutable`

## 🚀 การทดสอบ

1. เข้าหน้า Follow-up Dashboard
2. เลือกเพจ/บอท
3. คลิก "แก้ไข" เพื่อตั้งค่าข้อความติดตาม
4. เพิ่มรอบการติดตาม และอัพโหลดรูปภาพ
5. บันทึกการตั้งค่า
6. รอให้ระบบส่งข้อความติดตามตามเวลาที่กำหนด
7. ตรวจสอบใน LINE ว่าได้รับรูปภาพหรือไม่

## ✨ ผลลัพธ์ที่คาดหวัง

- ✅ URL ของรูปภาพเป็น absolute URL
- ✅ LINE API สามารถเข้าถึงรูปภาพได้
- ✅ ผู้ใช้ได้รับข้อความพร้อมรูปภาพ
- ✅ มี debug log ครบถ้วนสำหรับการตรวจสอบปัญหา
- ✅ ไม่มี linter errors

---

**วันที่แก้ไข:** 24 ตุลาคม 2025  
**ผู้แก้ไข:** AI Assistant  
**สถานะ:** ✅ เสร็จสมบูรณ์

