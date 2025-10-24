# 🔧 การแก้ไขระบบติดตามส่งภาพ Facebook (Facebook Follow-up Image Fix)

## 📋 สรุปปัญหา

ระบบติดตามส่งภาพใน **Facebook** ไม่สำเร็จ แต่ไม่ทราบสาเหตุที่แน่ชัดเนื่องจากขาด **debug logging**

## ✅ การแก้ไข

### 1. เพิ่ม Debug Logging ในฟังก์ชัน `sendFollowUpMessage` (บรรทัด 1744-1781)

เพิ่ม log เพื่อติดตามการส่งข้อความและรูปภาพ:

```javascript
if (task.platform === "facebook") {
  console.log("[FollowUp Debug] Sending Facebook follow-up:", {
    userId: task.userId,
    hasMessage: !!message,
    imageCount: images.length,
    botId: task.botId,
  });

  // ... ตรวจสอบ bot ...

  if (message) {
    console.log("[FollowUp Debug] Sending Facebook text message");
    await sendFacebookMessage(task.userId, message, fbBot.accessToken, {
      metadata,
    });
  }
  
  console.log(`[FollowUp Debug] Sending ${images.length} Facebook images`);
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    console.log(`[FollowUp Debug] Sending image ${i + 1}/${images.length}:`, {
      url: image.url,
      hasPreview: !!(image.previewUrl || image.thumbUrl),
    });
    await sendFacebookImageMessage(task.userId, image, fbBot.accessToken, {
      metadata,
    });
  }
  console.log("[FollowUp Debug] Facebook follow-up sent successfully");
}
```

### 2. เพิ่ม Debug Logging ในฟังก์ชัน `sendFacebookImageMessage` (บรรทัด 6279-6335)

เพิ่ม log เพื่อติดตาม URL และ error ที่เกิดขึ้น:

```javascript
async function sendFacebookImageMessage(recipientId, image, accessToken, options = {}) {
  // ... validation ...

  console.log("[FollowUp Debug] Sending Facebook image:", {
    recipientId,
    imageUrl: image.url,
    previewUrl: image.previewUrl || image.thumbUrl,
    hasMetadata: !!metadata,
  });

  try {
    // ... send image ...
    console.log(
      "[FollowUp Debug] Facebook image sent successfully:",
      response.data?.message_id || "ok",
    );
  } catch (error) {
    const status = error.response?.status;
    const fbMessage = error.response?.data?.error?.message || error.message;
    const fbErrorCode = error.response?.data?.error?.code;
    
    console.error("[FollowUp Error] Facebook image send failed:", {
      recipientId,
      imageUrl: image.url,
      status,
      errorCode: fbErrorCode,
      message: fbMessage,
    });
    throw new Error(conciseError);
  }
}
```

## 🔍 วิธีตรวจสอบปัญหา

### 1. ดู Log เมื่อส่งข้อความติดตาม

**Log ที่คาดหวัง (สำเร็จ):**
```
[FollowUp Debug] Sending Facebook follow-up: {
  userId: '123456789',
  hasMessage: true,
  imageCount: 1,
  botId: '...'
}
[FollowUp Debug] Sending Facebook text message
[FollowUp Debug] Sending 1 Facebook images
[FollowUp Debug] Sending image 1/1: {
  url: 'https://yourdomain.com/assets/followup/followup_1234567890_abc123.jpg',
  hasPreview: true
}
[FollowUp Debug] Sending Facebook image: {
  recipientId: '123456789',
  imageUrl: 'https://yourdomain.com/assets/followup/followup_1234567890_abc123.jpg',
  previewUrl: 'https://yourdomain.com/assets/followup/followup_1234567890_abc123_thumb.jpg',
  hasMetadata: true
}
[FollowUp Debug] Facebook image sent successfully: mid.xxxxx
[FollowUp Debug] Facebook follow-up sent successfully
```

**Log ที่ระบุปัญหา (ล้มเหลว):**
```
[FollowUp Debug] Sending Facebook follow-up: { ... }
[FollowUp Debug] Sending 1 Facebook images
[FollowUp Debug] Sending image 1/1: { url: '/assets/followup/...', hasPreview: true }
[FollowUp Debug] Sending Facebook image: { imageUrl: '/assets/followup/...', ... }
[FollowUp Error] Facebook image send failed: {
  recipientId: '123456789',
  imageUrl: '/assets/followup/followup_1234567890_abc123.jpg',
  status: 400,
  errorCode: 100,
  message: 'Invalid image URL'
}
```

### 2. ปัญหาที่อาจพบและวิธีแก้

#### ปัญหา 1: URL เป็น Relative Path
**อาการ:** `imageUrl: '/assets/followup/...'` (ไม่มี `https://`)

**สาเหตุ:** `PUBLIC_BASE_URL` ไม่ได้ตั้งค่า หรือ fallback ไม่ทำงาน

**วิธีแก้:** 
- ตรวจสอบว่า `PUBLIC_BASE_URL` ตั้งค่าใน environment variables แล้วหรือยัง
- ตรวจสอบว่า fallback `req.get("host")` ทำงานหรือไม่ (ดูที่บรรทัด 9165-9167)

#### ปัญหา 2: URL ถูกต้องแต่ Facebook เข้าถึงไม่ได้
**อาการ:** 
```
status: 400,
errorCode: 100,
message: 'Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request'
```
หรือ
```
message: 'Invalid image URL'
```

**สาเหตุ:** 
- Server อยู่หลัง firewall หรือ localhost
- SSL certificate ไม่ valid
- URL ต้อง whitelist ใน Facebook App Settings

**วิธีแก้:**
1. ตรวจสอบว่า URL เข้าถึงได้จากภายนอก (ลองเปิดใน browser ที่ไม่ได้ login)
2. ตรวจสอบ SSL certificate (Facebook ต้องการ HTTPS)
3. เพิ่ม domain ใน Facebook App Settings → Settings → Basic → App Domains

#### ปัญหา 3: Image Size หรือ Format ไม่รองรับ
**อาการ:**
```
message: 'Image is too large' 
หรือ 
'Unsupported image format'
```

**สาเหตุ:** Facebook จำกัดขนาดและ format ของรูป

**วิธีแก้:** 
- ระบบมี image optimization อยู่แล้ว (JPEG quality 88%, thumbnail 512x512)
- ตรวจสอบว่ารูปต้นฉบับไม่เกิน 8MB

#### ปัญหา 4: Rate Limiting
**อาการ:**
```
status: 429,
message: 'Too many messages sent'
```

**สาเหตุ:** ส่งข้อความเร็วเกินไป

**วิธีแก้:** 
- Facebook มี rate limit สำหรับการส่งข้อความ
- ระบบจะส่งรูปทีละรูป (await) เพื่อหลีกเลี่ยงปัญหานี้
- ถ้ายังเจอ ให้เพิ่ม delay ระหว่างการส่ง

## 📊 การทำงานของระบบ

### Flow การส่งข้อความติดตาม Facebook:

1. **`processDueFollowUpTasks()`** → ตรวจสอบ task ที่ถึงเวลา
2. **`sendFollowUpMessage(task, round, db)`** → เตรียมข้อความและรูป
3. **`sanitizeFollowUpImages(round?.images)`** → ตรวจสอบและทำความสะอาด URL
4. **`sendFacebookMessage()`** → ส่งข้อความ text (ถ้ามี)
5. **`sendFacebookImageMessage()`** → ส่งรูปภาพทีละรูป
6. **Facebook Graph API** → ส่งข้อความไปยังผู้ใช้

### Facebook Graph API Endpoint:
```
POST https://graph.facebook.com/v18.0/me/messages
```

**Payload สำหรับรูปภาพ:**
```json
{
  "recipient": { "id": "USER_ID" },
  "message": {
    "attachment": {
      "type": "image",
      "payload": {
        "url": "https://yourdomain.com/assets/followup/image.jpg",
        "is_reusable": true
      }
    },
    "metadata": "follow_up_auto"
  }
}
```

## 🎯 ความแตกต่างระหว่าง LINE และ Facebook

| Feature | LINE | Facebook |
|---------|------|----------|
| **API** | LINE Messaging API | Facebook Graph API |
| **Image Field** | `originalContentUrl` + `previewImageUrl` | `payload.url` |
| **Multiple Images** | ส่งพร้อมกันใน array (max 5) | ส่งทีละรูป (separate messages) |
| **URL Requirements** | HTTPS, accessible | HTTPS, accessible, whitelisted |
| **Rate Limit** | Moderate | Stricter |
| **Preview** | Required (separate URL) | Optional (same URL) |

## ✨ ผลลัพธ์ที่คาดหวัง

หลังจากแก้ไข:
- ✅ มี debug log ครบถ้วนสำหรับการส่งรูป Facebook
- ✅ สามารถระบุปัญหาได้ทันทีจาก log
- ✅ แสดง URL, error code, และ error message อย่างชัดเจน
- ✅ ง่ายต่อการ debug และแก้ไขปัญหา

## 🔧 การทดสอบ

1. เข้าหน้า Follow-up Dashboard
2. เลือก Facebook Page
3. ตั้งค่าข้อความติดตามพร้อมรูปภาพ
4. รอให้ระบบส่งข้อความติดตาม
5. ตรวจสอบ console log:
   - ดู URL ที่ส่งไป (ต้องเป็น absolute URL)
   - ดู response จาก Facebook API
   - ดู error (ถ้ามี) พร้อม error code
6. ตรวจสอบใน Facebook Messenger ว่าได้รับรูปหรือไม่

## 📝 ไฟล์ที่แก้ไข

- `index.js` (บรรทัด 1744-1781, 6279-6335)

---

**วันที่แก้ไข:** 24 ตุลาคม 2025  
**ผู้แก้ไข:** AI Assistant  
**สถานะ:** ✅ เพิ่ม Debug Logging เสร็จสมบูรณ์

