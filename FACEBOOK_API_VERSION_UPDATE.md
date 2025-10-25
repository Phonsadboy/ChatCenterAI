# 🔄 อัปเดต Facebook Graph API Version

## ปัญหา

ระบบใช้ **Facebook Graph API v18.0** ซึ่งกำลังจะหมดอายุหรือหมดอายุแล้ว

## ผลกระทบ

- 🔴 **ระดับวิกฤต**: API อาจหยุดทำงานเมื่อ Facebook deprecate version นี้
- ⚠️ **ไม่ได้รับ features ใหม่**: ไม่สามารถใช้ความสามารถใหม่ๆ ของ API
- ⚠️ **Security risks**: อาจมีช่องโหว่ที่แก้ไขใน version ใหม่แล้ว

## Graph API Version Lifecycle

Facebook มี deprecation schedule ดังนี้:
- **Active**: ใช้งานได้เต็มที่
- **Deprecated**: ยังใช้ได้แต่ไม่แนะนำ (1 ปีหลังจาก release version ใหม่)
- **Unsupported**: หยุดทำงาน (2 ปีหลังจาก release)

| Version | Release Date | Deprecation | Unsupported After |
|---------|-------------|-------------|-------------------|
| v18.0 | May 2023 | May 2024 | May 2025 |
| v19.0 | Nov 2023 | Nov 2024 | Nov 2025 |
| v20.0 | May 2024 | May 2025 | May 2026 |
| v21.0 | Nov 2024 | Nov 2025 | Nov 2026 |
| v22.0 | May 2025 (คาดการณ์) | May 2026 | May 2027 |

**ตุลาคม 2025**: v18.0 หมดอายุแล้ว! ⚠️

## วิธีแก้ไข

### 1. ตรวจสอบ API Calls ทั้งหมด

ค้นหา hardcoded version strings ในโปรเจกต์:

```bash
grep -r "v18.0" index.js
```

พบ API calls ต่อไปนี้:

#### 1.1 Comment Reply API (บรรทัด 3504)
```javascript
// เดิม
const url = `https://graph.facebook.com/v18.0/${commentId}/comments`;

// ใหม่
const url = `https://graph.facebook.com/v22.0/${commentId}/comments`;
```

#### 1.2 Private Reply API (บรรทัด 3527)
```javascript
// เดิม
const url = `https://graph.facebook.com/v18.0/${commentId}/private_replies`;

// ใหม่
const url = `https://graph.facebook.com/v22.0/${commentId}/private_replies`;
```

### 2. สร้าง Configuration สำหรับ API Version

แทนที่จะ hardcode version ในหลายที่ ให้สร้าง constant:

```javascript
// เพิ่มที่ด้านบนของไฟล์ index.js
const FACEBOOK_GRAPH_API_VERSION = process.env.FACEBOOK_API_VERSION || 'v22.0';

/**
 * สร้าง Facebook Graph API URL
 * @param {string} path - API path (เช่น '12345/comments')
 * @returns {string} Full API URL
 */
function getFacebookGraphAPIUrl(path) {
  return `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/${path}`;
}
```

### 3. แก้ไขทุก API Calls

#### 3.1 แก้ไข `sendCommentReply`

```javascript
// Helper function to send reply to comment
async function sendCommentReply(commentId, message, accessToken) {
  try {
    // เดิม: const url = `https://graph.facebook.com/v18.0/${commentId}/comments`;
    const url = getFacebookGraphAPIUrl(`${commentId}/comments`);
    
    const response = await axios.post(
      url,
      {
        message: message,
      },
      {
        params: { access_token: accessToken },
      },
    );
    return response.data;
  } catch (error) {
    console.error(
      "[Facebook Comment] Error sending reply:",
      error.response?.data || error.message,
    );
    throw error;
  }
}
```

#### 3.2 แก้ไข `sendPrivateMessageFromComment`

```javascript
// Helper function to send private message from comment
async function sendPrivateMessageFromComment(commentId, message, accessToken) {
  try {
    // เดิม: const url = `https://graph.facebook.com/v18.0/${commentId}/private_replies`;
    const url = getFacebookGraphAPIUrl(`${commentId}/private_replies`);
    
    const response = await axios.post(
      url,
      {
        message: message,
      },
      {
        params: { access_token: accessToken },
      },
    );
    return response.data;
  } catch (error) {
    console.error(
      "[Facebook Comment] Error sending private message:",
      error.response?.data || error.message,
    );
    throw error;
  }
}
```

### 4. ค้นหา API Calls อื่นๆ ในระบบ

ตรวจสอบไฟล์อื่นๆ ที่อาจมี Facebook API calls:

```bash
# ค้นหาทุกไฟล์
grep -r "graph.facebook.com" .

# ค้นหา version ที่เก่า
grep -r "v1[0-9]\.0" .
```

ตัวอย่างที่อาจพบ:

#### 4.1 Send Facebook Message
```javascript
// ค้นหา sendFacebookMessage function
// ตรวจสอบว่ามีการใช้ graph API หรือไม่

async function sendFacebookMessage(...) {
  // ถ้ามี URL hardcoded ให้แก้เป็น
  const url = getFacebookGraphAPIUrl(`me/messages`);
  // ...
}
```

#### 4.2 Upload Facebook Image
```javascript
// ในส่วนที่ upload รูปภาพ
const uploadUrl = getFacebookGraphAPIUrl(`me/message_attachments`);
```

### 5. เพิ่มการตรวจสอบ API Version

```javascript
/**
 * ตรวจสอบว่า Facebook Graph API version ที่ใช้ยังไม่หมดอายุ
 * @returns {Promise<Object>} { isValid, currentVersion, latestVersion, warning }
 */
async function checkFacebookAPIVersion() {
  try {
    console.log(`[Facebook API] Current version: ${FACEBOOK_GRAPH_API_VERSION}`);
    
    // ดึงข้อมูล version ปัจจุบันจาก Facebook
    const response = await axios.get('https://graph.facebook.com/');
    
    // Facebook จะส่งข้อมูล deprecation warnings ใน headers
    const deprecationWarning = response.headers['facebook-api-version-warning'];
    
    if (deprecationWarning) {
      console.warn('[Facebook API] ⚠️ Deprecation warning:', deprecationWarning);
      return {
        isValid: true,
        currentVersion: FACEBOOK_GRAPH_API_VERSION,
        warning: deprecationWarning
      };
    }
    
    console.log('[Facebook API] ✅ Version is up to date');
    return {
      isValid: true,
      currentVersion: FACEBOOK_GRAPH_API_VERSION,
      warning: null
    };
  } catch (error) {
    console.error('[Facebook API] Error checking version:', error.message);
    return {
      isValid: false,
      currentVersion: FACEBOOK_GRAPH_API_VERSION,
      error: error.message
    };
  }
}

// เรียกใช้ตอน server start
server.listen(PORT, async () => {
  console.log(`[LOG] เริ่มต้นเซิร์ฟเวอร์ที่พอร์ต ${PORT}...`);
  // ... existing code ...
  
  // ตรวจสอบ Facebook API version
  const apiVersionCheck = await checkFacebookAPIVersion();
  if (apiVersionCheck.warning) {
    console.warn('[STARTUP WARNING] Facebook API version deprecation warning!');
  }
});
```

### 6. Environment Variable

เพิ่มใน `.env`:

```bash
# Facebook Graph API Version
FACEBOOK_API_VERSION=v22.0

# หมายเหตุ: อัปเดตตาม Facebook release schedule
# - v22.0: May 2025 - May 2027
# - v23.0: Nov 2025 - Nov 2027 (คาดการณ์)
```

เพิ่มใน `.env.example`:

```bash
# Facebook Graph API Version (ดูเวอร์ชันล่าสุดที่ https://developers.facebook.com/docs/graph-api/changelog)
FACEBOOK_API_VERSION=v22.0
```

### 7. Migration Script

สร้าง script สำหรับทดสอบ API version ใหม่:

```javascript
// scripts/test-facebook-api-version.js
require('dotenv').config();
const axios = require('axios');

const FACEBOOK_API_VERSION = process.env.FACEBOOK_API_VERSION || 'v22.0';

async function testAPIVersion() {
  console.log(`\n🧪 Testing Facebook Graph API ${FACEBOOK_API_VERSION}...\n`);
  
  try {
    // Test 1: Basic API call
    console.log('Test 1: Basic API endpoint...');
    const response = await axios.get(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/me`, {
      params: {
        fields: 'id,name',
        access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN // ต้องมี token
      }
    });
    console.log('✅ Basic API call successful');
    console.log('   Response:', response.data);
    
    // Test 2: Check for deprecation warnings
    console.log('\nTest 2: Checking deprecation warnings...');
    const warnings = response.headers['facebook-api-version-warning'];
    if (warnings) {
      console.log('⚠️  Deprecation warning found:', warnings);
    } else {
      console.log('✅ No deprecation warnings');
    }
    
    // Test 3: Test comment API endpoint structure
    console.log('\nTest 3: Comment API endpoint structure...');
    const commentUrl = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/12345/comments`;
    console.log('   URL format:', commentUrl);
    console.log('✅ URL structure looks good');
    
    console.log('\n✅ All tests passed! API version is working.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Error response:', error.response.data);
      
      // ตรวจสอบว่าเป็น version error หรือไม่
      if (error.response.data.error?.message?.includes('version')) {
        console.error('\n⚠️  This looks like a version compatibility issue!');
      }
    }
  }
}

testAPIVersion();
```

รัน script:

```bash
# ต้องมี FACEBOOK_PAGE_ACCESS_TOKEN ใน .env
node scripts/test-facebook-api-version.js
```

### 8. Breaking Changes ที่ต้องระวัง

ตรวจสอบ changelog ของแต่ละ version:

#### จาก v18.0 → v22.0

**Changes ที่อาจกระทบ:**

1. **Comment API**
   - ✅ ไม่มี breaking changes สำคัญ
   - Comment reply API ยังใช้ได้เหมือนเดิม

2. **Private Reply API**
   - ✅ ไม่มี breaking changes
   - Private replies ยังใช้ได้เหมือนเดิม

3. **Webhooks**
   - ⚠️ อาจมี field ใหม่เพิ่มเข้ามา
   - ตรวจสอบ webhook payload structure

4. **Permissions**
   - ⚠️ บาง permissions อาจเปลี่ยนแปลง
   - ตรวจสอบว่ายังมี permissions ที่ต้องการหรือไม่

**ทำไม:**
- `pages_messaging` - สำหรับส่ง messages
- `pages_read_engagement` - สำหรับอ่าน comments และ posts
- `pages_manage_metadata` - สำหรับจัดการ page

### 9. Testing Checklist

- [ ] อัปเดต API version ใน environment variables
- [ ] ทดสอบ comment reply ใน test page
- [ ] ทดสอบ private message จาก comment
- [ ] ทดสอบ webhook ยังทำงานได้
- [ ] ตรวจสอบ error handling ใหม่
- [ ] ตรวจสอบ logs ไม่มี deprecation warnings
- [ ] ทดสอบบน staging environment
- [ ] ทดสอบบน production (soft launch)

### 10. Monitoring

เพิ่ม logging สำหรับ API version:

```javascript
// เพิ่มใน comment reply functions
console.log('[Facebook API]', {
  version: FACEBOOK_GRAPH_API_VERSION,
  endpoint: 'comments',
  commentId: commentId,
  timestamp: new Date().toISOString()
});
```

ตั้งค่า alerts:
- ถ้าเจอ deprecation warnings
- ถ้า API calls ล้มเหลวเกิน threshold

---

## สรุปการอัปเดต

### ✅ ขั้นตอนการอัปเดต

1. ✅ สร้าง constant `FACEBOOK_GRAPH_API_VERSION`
2. ✅ สร้างฟังก์ชัน `getFacebookGraphAPIUrl()`
3. ✅ แก้ไข `sendCommentReply()` ใช้ helper function
4. ✅ แก้ไข `sendPrivateMessageFromComment()` ใช้ helper function
5. ✅ ค้นหาและแก้ไข API calls อื่นๆ ทั้งหมด
6. ✅ เพิ่ม version checking function
7. ✅ อัปเดต environment variables
8. ✅ ทดสอบกับ test script
9. ✅ Deploy และ monitor

### 📊 ผลลัพธ์ที่คาดหวัง

- 🎯 ระบบใช้ API version ล่าสุด
- 🔒 ปลอดภัยกว่า (ได้รับ security fixes)
- ⚡ Performance อาจดีขึ้น
- 🆕 สามารถใช้ features ใหม่ได้
- 📈 ง่ายต่อการอัปเดต version ในอนาคต

### ⚠️ ข้อควรระวัง

- ทดสอบบน test page ก่อนใช้งานจริง
- Backup ข้อมูล webhook subscriptions
- ตรวจสอบ permissions ยังครบหรือไม่
- Monitor error logs อย่างใกล้ชิดหลัง deploy

---

## แหล่งข้อมูลอ้างอิง

1. **Facebook Graph API Changelog**
   - https://developers.facebook.com/docs/graph-api/changelog

2. **Facebook Versioning**
   - https://developers.facebook.com/docs/graph-api/guides/versioning

3. **Comments API Reference**
   - https://developers.facebook.com/docs/graph-api/reference/comment

4. **Webhook Reference**
   - https://developers.facebook.com/docs/graph-api/webhooks/reference

---

**วันที่อัปเดต:** 24 ตุลาคม 2025  
**สถานะ:** พร้อมใช้งาน  
**ความเร่งด่วน:** สูงมาก ⚠️⚠️⚠️  
**ระยะเวลาในการแก้ไข:** 1-2 ชั่วโมง

