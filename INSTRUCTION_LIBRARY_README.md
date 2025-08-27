# ระบบ Instruction Library

## ภาพรวม

ระบบ Instruction Library ได้รับการพัฒนาจากระบบ Backup Instructions เดิม เพื่อให้มีความยืดหยุ่นและใช้งานง่ายมากขึ้น โดยเปลี่ยนจากการ "สำรองข้อมูล" เป็นการ "จัดเก็บในคลัง" ที่สามารถเลือกใช้ได้ตามต้องการ

## การเปลี่ยนแปลงหลัก

### 1. เปลี่ยนชื่อ Collection
- **เดิม**: `instruction_backups` → **ใหม่**: `instruction_library`
- **เดิม**: `backedUpAt` → **ใหม่**: `savedAt`

### 2. เพิ่มฟิลด์ใหม่
- `name`: ชื่อคลัง instruction (เช่น "คลัง 2024-01-15", "คลังฝ่ายขาย")
- `description`: คำอธิบายคลัง instruction

### 3. เปลี่ยนชื่อฟังก์ชัน
- `backupInstructionsForDate()` → `saveInstructionsToLibrary()`
- `scheduleDailyInstructionBackup()` → `scheduleDailyInstructionLibrary()`

### 4. อัปเดต API Endpoints
- `/admin/instructions/backups` → `/admin/instructions/library`
- `/admin/instructions/backup-now` → `/admin/instructions/library-now`
- `/admin/instructions/backup/:date` → `/admin/instructions/library/:date`

## ฟีเจอร์ใหม่

### การเลือกใช้ Instructions สำหรับ Line Bot
- แต่ละ Line Bot สามารถเลือกใช้ instructions จากคลังได้
- สามารถเปลี่ยนการเลือกใช้ได้ตลอดเวลา
- รองรับการเลือกหลายคลังพร้อมกัน

### การจัดการ Instruction Library
- สามารถเปลี่ยนชื่อและคำอธิบายของคลังได้
- สามารถลบคลังที่ไม่ต้องการออกจากระบบได้

### API ใหม่
- `PUT /api/line-bots/:id/instructions` - อัปเดต instructions ที่เลือกใช้
- `GET /api/instructions/library` - ดึงรายการคลัง instructions
- `GET /api/instructions/library/:date/details` - ดึงรายละเอียดคลังพร้อม instructions
- `PUT /admin/instructions/library/:date` - เปลี่ยนชื่อหรือคำอธิบายของคลัง
- `DELETE /admin/instructions/library/:date` - ลบคลัง instruction

## การใช้งาน

### 1. สร้าง Instruction Library
```javascript
// สร้างด้วยตนเอง
POST /admin/instructions/library-now
{
  "name": "คลังฝ่ายขาย",
  "description": "Instructions สำหรับฝ่ายขาย"
}

// สร้างอัตโนมัติ (ทุกวันเวลา 00:00 น.)
// ระบบจะสร้างคลังอัตโนมัติทุกวัน
```

### 1.1 แก้ไข/ลบ Instruction Library
```javascript
// เปลี่ยนชื่อหรือคำอธิบายของคลัง
PUT /admin/instructions/library/:date
{
  "name": "ชื่อใหม่",
  "description": "คำอธิบายใหม่"
}

// ลบคลังที่ไม่ต้องการ
DELETE /admin/instructions/library/:date
```

### 2. จัดการ Instructions ใน Line Bot
```javascript
// อัปเดต instructions ที่เลือกใช้
PUT /api/line-bots/:id/instructions
{
  "selectedInstructions": ["2024-01-15", "2024-01-10_manual_14-30-00"]
}
```

```javascript
// สร้าง Line Bot พร้อมกำหนด instructions จากคลังทันที
POST /api/line-bots
{
  "name": "My Bot",
  "channelAccessToken": "...",
  "channelSecret": "...",
  "selectedInstructions": ["2024-01-15"]
}
```

### 2.1 จัดการ Instructions ใน Facebook Bot
```javascript
// อัปเดต instructions ที่เลือกใช้
PUT /api/facebook-bots/:id/instructions
{
  "selectedInstructions": ["2024-01-15"]
}

// สร้าง Facebook Bot พร้อมเลือก instructions จากคลัง
POST /api/facebook-bots
{
  "name": "My FB Bot",
  "pageId": "...",
  "accessToken": "...",
  "selectedInstructions": ["2024-01-15"]
}
```

### 3. คืนค่า Instructions จากคลัง
```javascript
POST /admin/instructions/restore/:date
{
  "createLibraryBefore": true  // บันทึกข้อมูลปัจจุบันลงคลังก่อนคืนค่า
}
```

## หน้าตั้งค่า

### Line Bot Settings
- เพิ่มปุ่ม "จัดการ Instructions" สำหรับแต่ละ Line Bot
- แสดงรายการคลัง instructions ที่มีอยู่
- แสดง instructions ที่เลือกใช้ใน Line Bot นั้น
- สามารถเลือก/ยกเลิกการเลือกใช้ได้

### Instruction Library Modal
- แสดงรายการคลัง instructions ทั้งหมด
- แสดงรายละเอียดแต่ละคลัง (ชื่อ, คำอธิบาย, วันที่, เวลา, ประเภท)
- สามารถเลือกใช้หลายคลังพร้อมกัน

## ข้อดีของการเปลี่ยนแปลง

1. **ความยืดหยุ่น**: สามารถเลือกใช้ instructions จากหลายคลังได้
2. **การจัดการที่ดีขึ้น**: มีชื่อและคำอธิบายสำหรับแต่ละคลัง
3. **การใช้งานที่ง่ายขึ้น**: UI ที่เข้าใจง่ายและใช้งานสะดวก
4. **การขยายตัว**: รองรับการเพิ่มฟีเจอร์ใหม่ในอนาคต

## การอัปเกรด

### สำหรับผู้ใช้เดิม
- ข้อมูล backup เดิมจะยังคงอยู่ แต่จะไม่ถูกใช้งาน
- ระบบจะสร้างคลังใหม่อัตโนมัติทุกวัน
- สามารถสร้างคลังใหม่ด้วยตนเองได้

### สำหรับผู้ใช้ใหม่
- เริ่มต้นด้วยระบบ Instruction Library
- ไม่มีผลกระทบจากระบบเดิม

## การตั้งค่า

### Environment Variables
```bash
# ไม่มีการเปลี่ยนแปลงจากเดิม
MONGO_URI=mongodb://localhost:27017
ADMIN_PASSWORD=admin123
```

### Database Collections
```javascript
// Collection ใหม่
instruction_library: {
  date: String,           // วันที่สร้างคลัง
  name: String,           // ชื่อคลัง
  description: String,    // คำอธิบาย
  instructions: Array,    // รายการ instructions
  savedAt: Date,         // วันที่บันทึก
  type: String,          // ประเภท (auto, manual, before_restore)
  displayDate: String,   // วันที่แสดงผล
  displayTime: String    // เวลาที่แสดงผล
}

// Collection ที่อัปเดต
line_bots: {
  // ... ฟิลด์เดิม ...
  selectedInstructions: Array  // รายการคลัง instructions ที่เลือกใช้
}
```

## การแก้ไขปัญหา

### ปัญหาที่พบบ่อย
1. **ไม่สามารถสร้างคลังได้**: ตรวจสอบสิทธิ์การเขียนฐานข้อมูล
2. **ไม่สามารถเลือกใช้ instructions ได้**: ตรวจสอบการเชื่อมต่อ API
3. **ข้อมูลไม่แสดง**: ตรวจสอบการโหลด JavaScript และ CSS

### การ Debug
```javascript
// ตรวจสอบ Console ใน Browser
console.log('Available libraries:', availableLibraries);
console.log('Selected instructions:', currentLineBotInstructions);

// ตรวจสอบ Network Tab ใน Developer Tools
// ดู API calls และ responses
```

## การพัฒนาต่อ

### ฟีเจอร์ที่อาจเพิ่มในอนาคต
1. **การแบ่งหมวดหมู่**: จัดกลุ่มคลังตามประเภทหรือฝ่าย
2. **การค้นหา**: ค้นหาคลังตามชื่อหรือคำอธิบาย
3. **การแชร์**: แชร์คลังระหว่าง Line Bot หลายตัว
4. **การสำรองคลัง**: สำรองคลังทั้งหมดไปยังไฟล์หรือระบบอื่น

### การปรับปรุงประสิทธิภาพ
1. **การ Cache**: Cache ข้อมูลคลังในหน่วยความจำ
2. **การ Pagination**: แบ่งหน้าแสดงผลสำหรับคลังจำนวนมาก
3. **การ Index**: เพิ่ม index ในฐานข้อมูลเพื่อการค้นหาที่เร็วขึ้น
