# 📸 Image Collections System

ระบบจัดกลุ่มรูปภาพเป็นชุดๆ (Collections) สำหรับใช้กับ Bot ต่างๆ

## 🎯 ความสามารถ

- ✅ จัดกลุ่มรูปภาพเป็นชุดๆ (Collections)
- ✅ เลือกใช้ชุดภาพกับ Bot ต่างๆ ได้ (LINE และ Facebook)
- ✅ เลือกได้หลายชุด หรือไม่เลือกก็ได้
- ✅ รองรับระบบเดิมที่มีรูปอยู่แล้ว (Auto Migration)
- ✅ Backward Compatible กับโค้ดเดิม 100%

## 🗄️ Database Schema

### Collection: `image_collections`
```javascript
{
  _id: String,                  // "collection-{timestamp}-{random}"
  name: String,                 // ชื่อชุดภาพ
  description: String,          // คำอธิบาย
  images: [                     // รายการรูปภาพในชุด
    {
      label: String,            // ชื่อรูป (unique key)
      slug: String,             // URL-friendly slug
      url: String,              // URL รูปภาพต้นฉบับ
      thumbUrl: String,         // URL รูป thumbnail
      description: String,      // คำอธิบายรูป
      fileName: String,         // ชื่อไฟล์
      assetId: String           // ref: instruction_assets._id
    }
  ],
  isDefault: Boolean,           // เป็น default collection หรือไม่
  createdAt: Date,
  updatedAt: Date
}
```

### Bot Collections (LINE & Facebook)
```javascript
{
  // ... ฟิลด์เดิมทั้งหมด
  selectedImageCollections: [String]  // array ของ collection IDs
}
```

## 🔧 API Routes

### GET `/admin/image-collections`
ดึงรายการ Image Collections ทั้งหมด

**Response:**
```json
{
  "success": true,
  "collections": [...]
}
```

### GET `/admin/image-collections/:id`
ดึง Image Collection เดียว

**Response:**
```json
{
  "success": true,
  "collection": {...}
}
```

### POST `/admin/image-collections`
สร้าง Image Collection ใหม่

**Body:**
```json
{
  "name": "ชุดภาพสินค้า",
  "description": "รูปภาพสินค้าทั้งหมด",
  "imageLabels": ["สินค้า A", "สินค้า B", "QR Code"]
}
```

**Response:**
```json
{
  "success": true,
  "collection": {...},
  "message": "สร้าง Collection ... สำเร็จ (3 รูป)"
}
```

### PUT `/admin/image-collections/:id`
แก้ไข Image Collection

**Body:**
```json
{
  "name": "ชุดภาพใหม่",
  "description": "คำอธิบายใหม่",
  "imageLabels": ["รูป 1", "รูป 2"]
}
```

### DELETE `/admin/image-collections/:id`
ลบ Image Collection (ไม่สามารถลบ Default Collection ได้)

**Response:**
```json
{
  "success": true,
  "message": "ลบ Collection ... สำเร็จ"
}
```

## 🔄 Migration System

### Auto Migration ตอนเริ่มระบบ
เมื่อเซิร์ฟเวอร์เริ่มต้น ระบบจะรัน `migrateAssetsToCollections()` อัตโนมัติ:

1. ✅ ตรวจสอบว่ามี default collection อยู่แล้วหรือไม่
2. ✅ ถ้ายังไม่มี → ดึงรูปภาพทั้งหมดจาก `instruction_assets`
3. ✅ สร้าง Default Collection ชื่อ "รูปภาพทั้งหมด (ระบบเดิม)"
4. ✅ Assign default collection ให้ทุก Bot (LINE + Facebook)

**ผลลัพธ์:**
- ระบบเดิมทำงานได้เหมือนเดิม 100%
- รูปภาพทั้งหมดจะอยู่ใน default collection
- ทุก Bot จะใช้รูปภาพเดิมได้ทันที

## 🎨 Backend Logic

### Functions

#### `getImageCollections()`
ดึงรายการ Image Collections ทั้งหมดจาก database

#### `getImagesFromSelectedCollections(selectedCollectionIds)`
ดึงรูปภาพจาก collections ที่เลือก (merge หลาย collections, ป้องกันรูปซ้ำ)

**Parameters:**
- `selectedCollectionIds`: Array of collection IDs

**Returns:**
```javascript
[
  {
    label: "สินค้า A",
    slug: "product-a",
    url: "...",
    thumbUrl: "...",
    description: "...",
    fileName: "...",
    assetId: "..."
  }
]
```

#### `getAssetsInstructionsText(selectedCollectionIds)`
สร้างข้อความคำแนะนำการใช้รูปภาพสำหรับ AI (ปรับให้รองรับ collections)

**Backward Compatible:**
- ถ้าไม่ส่ง `selectedCollectionIds` → ใช้รูปทั้งหมด (เหมือนเดิม)
- ถ้าส่ง `selectedCollectionIds` → ใช้เฉพาะรูปจาก collections ที่เลือก

#### `getAssetsMapForBot(selectedCollectionIds)`
สร้าง Map (label → asset) สำหรับใช้ใน `parseMessageSegmentsByImageTokens()`

**Backward Compatible:**
- Fallback ไปใช้ `getInstructionAssets()` ถ้าไม่มี collections

### Queue Context Updates

เพิ่ม `selectedImageCollections` ใน queue context:

```javascript
// LINE Webhook
const queueOptions = {
  botType: "line",
  platform: "line",
  botId: lineBot._id,
  selectedInstructions: lineBot.selectedInstructions || [],
  selectedImageCollections: lineBot.selectedImageCollections || null,
  // ... ฟิลด์อื่นๆ
};

// Facebook Webhook
const queueOptionsBase = {
  botType: "facebook",
  platform: "facebook",
  botId: facebookBot._id,
  selectedInstructions: facebookBot.selectedInstructions || [],
  selectedImageCollections: facebookBot.selectedImageCollections || null,
  // ... ฟิลด์อื่นๆ
};
```

### Message Sending Updates

#### `sendFacebookMessage()`
เพิ่ม parameter `selectedImageCollections` ใน options:

```javascript
await sendFacebookMessage(
  userId,
  message,
  accessToken,
  { 
    metadata: "ai_generated",
    selectedImageCollections: queueContext.selectedImageCollections || null
  }
);
```

#### `buildSystemInstructionsWithContext()`
ดึง `selectedImageCollections` จาก bot config และส่งไปยัง `getAssetsInstructionsText()`:

```javascript
// ดึง selectedImageCollections จาก bot config
const botCollection = botKind === "facebook" ? "facebook_bots" : "line_bots";
const botDoc = await db.collection(botCollection).findOne({ 
  _id: queueContext.botId 
});

if (botDoc && botDoc.selectedImageCollections) {
  selectedImageCollections = botDoc.selectedImageCollections;
}

// ส่งไปยัง getAssetsInstructionsText
const assetsText = await getAssetsInstructionsText(selectedImageCollections);
```

## 📝 TODO: UI Implementation

### 1. หน้าจัดการ Image Collections (`/admin/image-collections`)
- [ ] แสดงรายการ Collections ทั้งหมด
- [ ] สร้าง Collection ใหม่ (เลือกรูปจาก instruction_assets)
- [ ] แก้ไข Collection (เปลี่ยนชื่อ, เพิ่ม/ลบรูป)
- [ ] ลบ Collection (ไม่สามารถลบ default ได้)
- [ ] แสดงจำนวนรูปในแต่ละ Collection
- [ ] แสดง Bots ที่ใช้ Collection นั้น

### 2. Bot Settings - เพิ่มส่วนเลือก Collections
ในหน้า Settings ของแต่ละ Bot (LINE/Facebook):

```html
<div class="mb-3">
  <label class="form-label">Image Collections</label>
  <select multiple class="form-select" id="botImageCollections">
    <option value="collection-1">รูปภาพทั้งหมด (ระบบเดิม)</option>
    <option value="collection-2">ชุดภาพสินค้า</option>
    <option value="collection-3">ชุดภาพโปรโมชัน</option>
  </select>
  <div class="form-text">
    เลือก Image Collections ที่ต้องการใช้กับ Bot นี้ (เลือกได้หลายชุด)
  </div>
</div>
```

### 3. JavaScript สำหรับ UI

#### Image Collections Management
```javascript
// Load collections list
async function loadImageCollections() {
  const res = await fetch('/admin/image-collections');
  const data = await res.json();
  displayCollections(data.collections);
}

// Create collection
async function createCollection(name, description, imageLabels) {
  const res = await fetch('/admin/image-collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, imageLabels })
  });
  return res.json();
}

// Update collection
async function updateCollection(id, name, description, imageLabels) {
  const res = await fetch(`/admin/image-collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, imageLabels })
  });
  return res.json();
}

// Delete collection
async function deleteCollection(id) {
  const res = await fetch(`/admin/image-collections/${id}`, {
    method: 'DELETE'
  });
  return res.json();
}
```

#### Bot Settings Update
```javascript
// Update bot with selected collections
async function updateBotSettings(botId, settings) {
  // settings.selectedImageCollections = ["collection-1", "collection-2"]
  const res = await fetch(`/api/line-bots/${botId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  return res.json();
}
```

## ✅ สิ่งที่ทำเสร็จแล้ว

- ✅ Database Schema
- ✅ Migration Script (`migrateAssetsToCollections()`)
- ✅ API Routes (CRUD สำหรับ Image Collections)
- ✅ Backend Logic (รองรับ collections ในการดึงรูปภาพ)
- ✅ Queue Context (ส่ง selectedImageCollections ไปกับ message)
- ✅ Backward Compatible (ระบบเดิมทำงานได้ปกติ)

## ⏳ สิ่งที่ต้องทำต่อ

- ⏳ สร้างหน้า UI สำหรับจัดการ Image Collections
- ⏳ แก้ไข Bot Settings UI ให้เลือก Image Collections ได้
- ⏳ ทดสอบระบบและตรวจสอบ compatibility

## 🧪 การทดสอบ

### 1. ทดสอบ Migration
```bash
# รีสตาร์ทเซิร์ฟเวอร์
npm start

# ตรวจสอบ log
# [Migration] พบ X รูปภาพในระบบเดิม
# [Migration] สร้าง default collection สำเร็จ: "รูปภาพทั้งหมด (ระบบเดิม)"
# [Migration] assign default collection ให้ X bots สำเร็จ
```

### 2. ทดสอบ API

```bash
# ดึงรายการ collections
curl http://localhost:3000/admin/image-collections

# สร้าง collection ใหม่
curl -X POST http://localhost:3000/admin/image-collections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ชุดภาพทดสอบ",
    "description": "สำหรับทดสอบระบบ",
    "imageLabels": ["รูป 1", "รูป 2"]
  }'

# แก้ไข collection
curl -X PUT http://localhost:3000/admin/image-collections/collection-xxx \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ชื่อใหม่",
    "description": "คำอธิบายใหม่",
    "imageLabels": ["รูป A", "รูป B", "รูป C"]
  }'

# ลบ collection
curl -X DELETE http://localhost:3000/admin/image-collections/collection-xxx
```

### 3. ทดสอบ Backward Compatibility

```bash
# 1. ทดสอบ Bot ที่ไม่มี selectedImageCollections
#    → ควรใช้รูปทั้งหมด (เหมือนเดิม)

# 2. ทดสอบ Bot ที่มี selectedImageCollections = []
#    → ควรใช้รูปทั้งหมด (fallback)

# 3. ทดสอบ Bot ที่เลือก collections
#    → ควรใช้เฉพาะรูปจาก collections ที่เลือก
```

## 📌 หมายเหตุ

1. **Default Collection**: ไม่สามารถลบได้ (ป้องกันไม่ให้ระบบเสีย)
2. **ลบ Collection**: จะลบ reference จาก bots ทั้งหมดด้วย
3. **รูปซ้ำ**: ถ้าเลือกหลาย collections ที่มีรูปเดียวกัน ระบบจะใช้รูปนั้นครั้งเดียว
4. **Performance**: การดึงรูปจาก collections ทำงานแบบ in-memory (เร็ว)

## 🔍 Troubleshooting

### ปัญหา: Migration ไม่ทำงาน
```javascript
// ตรวจสอบ log เมื่อรันเซิร์ฟเวอร์
// ถ้าเห็น "[Migration] มี default collection อยู่แล้ว" 
// แสดงว่า migration ทำไปแล้ว

// ถ้าต้องการรัน migration ใหม่:
// 1. ลบ collection ที่ isDefault: true ออกจาก database
// 2. รีสตาร์ทเซิร์ฟเวอร์
```

### ปัญหา: Bot ไม่เห็นรูปภาพ
```javascript
// ตรวจสอบ:
// 1. Bot มี selectedImageCollections หรือไม่
// 2. Collections ที่เลือกมีรูปภาพหรือไม่
// 3. รูปภาพใน collection ยังอยู่ใน instruction_assets หรือไม่

// Debug:
const botDoc = await db.collection("line_bots").findOne({ _id: botId });
console.log("Selected Collections:", botDoc.selectedImageCollections);

const collections = await getImagesFromSelectedCollections(
  botDoc.selectedImageCollections
);
console.log("Available Images:", collections.length);
```

### ปัญหา: รูปภาพไม่แสดงใน AI response
```javascript
// ตรวจสอบ:
// 1. AI ได้รับ instructions เกี่ยวกับรูปภาพหรือไม่
// 2. AI ใช้ #[IMAGE:label] ถูกต้องหรือไม่
// 3. label ตรงกับที่มีใน collection หรือไม่

// Debug:
const assetsText = await getAssetsInstructionsText(selectedCollections);
console.log("Assets Instructions:", assetsText);
```

## 🚀 ขั้นตอนถัดไป

1. **สร้าง UI สำหรับจัดการ Image Collections** (หน้าใหม่หรือใน settings)
2. **เพิ่มส่วนเลือก Collections ใน Bot Settings** (LINE และ Facebook)
3. **ทดสอบทุก use case** (มี collections, ไม่มี collections, หลาย collections)
4. **เขียน Documentation สำหรับผู้ใช้** (วิธีใช้งานระบบ)
5. **Monitor Performance** (ถ้ามี collections เยอะ อาจต้อง cache)

---

**สร้างโดย:** AI Assistant  
**วันที่:** 2025-01-23  
**เวอร์ชัน:** 1.0

