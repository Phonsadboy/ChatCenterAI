# 🔧 แก้ไขระบบ Facebook Comment Webhook

## ปัญหาที่พบ

ระบบมีฟังก์ชัน `handleFacebookComment` แต่ไม่มี webhook endpoint เพื่อรับ events จาก Facebook

## วิธีแก้ไข

### 1. เพิ่ม Dependencies ที่จำเป็น

```bash
npm install crypto body-parser
```

### 2. เพิ่มโค้ดใน `index.js`

#### 2.1 เพิ่ม Middleware สำหรับ raw body (สำคัญสำหรับ signature verification)

```javascript
// เพิ่มหลังจาก const app = express();
app.use('/webhooks/facebook', express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
```

#### 2.2 เพิ่มฟังก์ชัน Signature Verification

```javascript
// เพิ่มใกล้ๆ กับฟังก์ชัน handleFacebookComment
const crypto = require('crypto');

/**
 * ตรวจสอบว่า webhook request มาจาก Facebook จริง
 * @param {string} rawBody - Request body ในรูปแบบ string
 * @param {string} signature - X-Hub-Signature-256 header
 * @returns {boolean}
 */
function verifyFacebookSignature(rawBody, signature) {
  if (!signature) {
    console.error('[Facebook Webhook] No signature provided');
    return false;
  }
  
  const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
  if (!APP_SECRET) {
    console.error('[Facebook Webhook] FACEBOOK_APP_SECRET not configured');
    return false;
  }

  try {
    // Facebook ส่งมาในรูปแบบ "sha256=..."
    const signatureHash = signature.split('=')[1];
    
    // คำนวณ signature ที่คาดหวัง
    const expectedHash = crypto
      .createHmac('sha256', APP_SECRET)
      .update(rawBody)
      .digest('hex');

    // เปรียบเทียบแบบ timing-safe เพื่อป้องกัน timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signatureHash),
      Buffer.from(expectedHash)
    );
  } catch (error) {
    console.error('[Facebook Webhook] Error verifying signature:', error.message);
    return false;
  }
}
```

#### 2.3 เพิ่ม GET Endpoint สำหรับ Webhook Verification

```javascript
/**
 * Webhook Verification Endpoint
 * Facebook เรียกใช้ตอนตั้งค่า Webhook ครั้งแรก
 */
app.get('/webhooks/facebook', (req, res) => {
  // อ่านค่าจาก query parameters
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[Facebook Webhook] Verification request:', {
    mode,
    token: token ? '***' : 'missing',
    challenge: challenge ? '***' : 'missing'
  });

  // Token สำหรับ verification (ตั้งค่าเอง)
  const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || 'chatcenterai_verify_token_2025';

  // ตรวจสอบว่า mode และ token ถูกต้อง
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[Facebook Webhook] ✅ Verification successful');
      // ส่ง challenge กลับไปให้ Facebook
      res.status(200).send(challenge);
    } else {
      console.error('[Facebook Webhook] ❌ Verification failed: Invalid token');
      res.sendStatus(403);
    }
  } else {
    console.error('[Facebook Webhook] ❌ Verification failed: Missing parameters');
    res.sendStatus(400);
  }
});
```

#### 2.4 เพิ่ม POST Endpoint สำหรับรับ Events

```javascript
/**
 * Webhook Event Handler
 * รับ events จาก Facebook เมื่อมีคอมเมนต์ใหม่
 */
app.post('/webhooks/facebook', async (req, res) => {
  try {
    const body = req.body;
    
    console.log('[Facebook Webhook] Event received:', {
      object: body.object,
      entries: body.entry?.length || 0
    });

    // ตรวจสอบว่าเป็น page event
    if (body.object !== 'page') {
      console.log('[Facebook Webhook] Not a page event, ignoring');
      return res.sendStatus(404);
    }

    // ตรวจสอบ signature (สำคัญมาก!)
    const signature = req.headers['x-hub-signature-256'];
    if (!verifyFacebookSignature(req.rawBody, signature)) {
      console.error('[Facebook Webhook] ❌ Invalid signature - possible attack!');
      return res.sendStatus(403);
    }

    // ส่ง 200 OK กลับไปทันที (Facebook ต้องการ response ภายใน 20 วินาที)
    res.status(200).send('EVENT_RECEIVED');

    // ประมวลผล events แบบ async
    console.log('[Facebook Webhook] Processing events asynchronously...');
    
    for (const entry of body.entry) {
      const pageId = entry.id;
      console.log(`[Facebook Webhook] Processing entry for page ${pageId}`);

      // ดึงข้อมูล Facebook Bot จาก database
      const bot = await getFacebookBotByPageId(pageId);
      if (!bot) {
        console.error(`[Facebook Webhook] Bot not found for page ${pageId}`);
        continue;
      }

      if (!bot.accessToken) {
        console.error(`[Facebook Webhook] No access token for page ${pageId}`);
        continue;
      }

      // ประมวลผล changes
      for (const change of entry.changes || []) {
        console.log(`[Facebook Webhook] Change field: ${change.field}, value:`, change.value);

        // ตรวจสอบว่าเป็น comment event
        if (change.field === 'feed' && change.value.item === 'comment') {
          const value = change.value;
          
          // ข้าม parent comments (ตอบแค่ top-level comments)
          if (value.parent_id) {
            console.log('[Facebook Webhook] Skipping reply to comment');
            continue;
          }

          // ข้าม comments ที่ถูกลบ
          if (value.verb === 'remove') {
            console.log('[Facebook Webhook] Skipping removed comment');
            continue;
          }

          const postId = value.post_id;
          const commentData = {
            id: value.comment_id,
            message: value.message || '',
            from: {
              id: value.from?.id,
              name: value.from?.name
            }
          };

          console.log('[Facebook Webhook] Processing comment:', {
            postId,
            commentId: commentData.id,
            from: commentData.from.name,
            messagePreview: commentData.message.substring(0, 50) + '...'
          });

          // เรียกฟังก์ชันที่มีอยู่แล้ว
          try {
            await handleFacebookComment(pageId, postId, commentData, bot.accessToken);
            console.log(`[Facebook Webhook] ✅ Successfully handled comment ${commentData.id}`);
          } catch (error) {
            console.error(`[Facebook Webhook] ❌ Error handling comment ${commentData.id}:`, error.message);
          }
        }
      }
    }

    console.log('[Facebook Webhook] All events processed');
  } catch (error) {
    console.error('[Facebook Webhook] Error processing webhook:', error);
    // ไม่ส่ง error กลับไป เพราะได้ส่ง 200 OK ไปแล้ว
  }
});
```

#### 2.5 เพิ่มฟังก์ชัน Helper

```javascript
/**
 * ดึงข้อมูล Facebook Bot จาก pageId
 * @param {string} pageId - Facebook Page ID
 * @returns {Promise<Object|null>}
 */
async function getFacebookBotByPageId(pageId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const bot = await coll.findOne({ pageId: pageId });
    return bot;
  } catch (error) {
    console.error('[Facebook Webhook] Error fetching bot:', error.message);
    return null;
  }
}
```

### 3. อัปเดต Environment Variables

เพิ่มในไฟล์ `.env`:

```bash
# Facebook Webhook Configuration
FACEBOOK_VERIFY_TOKEN=chatcenterai_verify_token_2025
FACEBOOK_APP_SECRET=your_facebook_app_secret_here

# หมายเหตุ: 
# - FACEBOOK_VERIFY_TOKEN: ตั้งค่าเอง ใช้ตอน setup webhook
# - FACEBOOK_APP_SECRET: หาได้จาก Facebook App Dashboard > Settings > Basic > App Secret
```

### 4. การตั้งค่า Facebook Webhook

#### 4.1 ไปที่ Facebook App Dashboard
1. เข้า https://developers.facebook.com/apps/
2. เลือก App ของคุณ
3. ไปที่ **Products** > **Webhooks**

#### 4.2 Subscribe to Page Events
1. คลิก **Add Subscription** (หรือ Edit Subscription)
2. ใส่ Callback URL: `https://your-domain.com/webhooks/facebook`
3. ใส่ Verify Token: `chatcenterai_verify_token_2025` (ต้องตรงกับใน .env)
4. เลือก Subscription Fields:
   - ☑️ **feed** (สำคัญ - สำหรับ comments)
   - ☑️ **messages** (ถ้าต้องการรับ private messages)
5. คลิก **Verify and Save**

#### 4.3 Subscribe to Specific Page
1. ในส่วน Webhooks
2. คลิก **Add Subscriptions** ใต้ชื่อ Page ที่ต้องการ
3. เลือก **feed**
4. คลิก Subscribe

### 5. การทดสอบ

#### 5.1 ทดสอบ Webhook Verification

```bash
# ทดสอบ GET endpoint
curl "http://localhost:3000/webhooks/facebook?hub.mode=subscribe&hub.verify_token=chatcenterai_verify_token_2025&hub.challenge=test123"

# ควรได้ response: test123
```

#### 5.2 ทดสอบ Event Handling

```bash
# ทดสอบ POST endpoint (จำลอง Facebook webhook)
curl -X POST http://localhost:3000/webhooks/facebook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{
    "object": "page",
    "entry": [
      {
        "id": "PAGE_ID",
        "time": 1234567890,
        "changes": [
          {
            "field": "feed",
            "value": {
              "item": "comment",
              "verb": "add",
              "post_id": "123_456",
              "comment_id": "789",
              "message": "สินค้าราคาเท่าไหร่ครับ",
              "from": {
                "id": "user123",
                "name": "ลูกค้าทดสอบ"
              }
            }
          }
        ]
      }
    ]
  }'
```

#### 5.3 ทดสอบบน Production

1. ไปที่ Facebook App Dashboard > Webhooks > Test
2. เลือก **feed**
3. คลิก **Send to My Server**
4. ตรวจสอบ logs ว่าได้รับ event หรือไม่

### 6. Troubleshooting

#### ปัญหา: Webhook Verification ไม่ผ่าน
**สาเหตุ:** Verify Token ไม่ตรงกัน  
**วิธีแก้:** ตรวจสอบว่า `FACEBOOK_VERIFY_TOKEN` ใน .env ตรงกับที่ใส่ใน Facebook Dashboard

#### ปัญหา: Signature Verification Failed
**สาเหตุ:** `FACEBOOK_APP_SECRET` ไม่ถูกต้อง  
**วิธีแก้:** ตรวจสอบ App Secret จาก Facebook Dashboard

#### ปัญหา: ไม่ได้รับ Events
**สาเหตุ:** ยังไม่ได้ subscribe to page  
**วิธีแก้:** ตรวจสอบว่า subscribe to page แล้วใน Webhooks settings

#### ปัญหา: Response ช้าเกิน 20 วินาที
**สาเหตุ:** ประมวลผลใช้เวลานาน  
**วิธีแก้:** ส่ง 200 OK ก่อน แล้วค่อยประมวลผลแบบ async (ทำไว้แล้วในโค้ด)

### 7. Security Best Practices

1. ✅ **ตรวจสอบ Signature เสมอ** - ป้องกัน unauthorized requests
2. ✅ **ใช้ HTTPS** - Facebook ต้องการ SSL/TLS
3. ✅ **ซ่อน Secrets** - ใช้ environment variables
4. ✅ **Validate Input** - ตรวจสอบข้อมูลที่ได้รับ
5. ✅ **Rate Limiting** - ป้องกัน abuse

### 8. Monitoring

เพิ่ม logging เพื่อติดตาม:

```javascript
// ใน handleFacebookComment
console.log('[Metrics]', {
  event: 'comment_processed',
  pageId,
  postId,
  commentId: commentData.id,
  replyType: config?.replyType,
  timestamp: new Date().toISOString(),
  processingTime: Date.now() - startTime
});
```

---

## สรุป

การแก้ไขนี้จะทำให้ระบบคอมเมนต์ Facebook สามารถ:
1. ✅ รับ webhook events จาก Facebook
2. ✅ ตรวจสอบความปลอดภัยด้วย signature verification
3. ✅ ประมวลผลแบบ async เพื่อ response เร็ว
4. ✅ จัดการ errors อย่างเหมาะสม
5. ✅ ใช้งานได้จริงบน production

**อย่าลืม:** ตั้งค่า environment variables และ Facebook Webhook Subscriptions ก่อนใช้งาน!

