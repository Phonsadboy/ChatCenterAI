# การปรับปรุงระบบ Instruction Management เป็นโหมด Single-Select

## 📋 สรุปการเปลี่ยนแปลง

ระบบ Instruction Management ได้รับการปรับปรุงจาก **Multi-Select** (เลือกได้หลายอัน) เป็น **Single-Select** (เลือกได้เพียง 1 อัน) เพื่อให้แต่ละเพจ/ไลน์สามารถเลือกใช้ Instruction ได้เพียงอันเดียว และสามารถเปลี่ยนได้ทันทีโดยไม่ต้องเอาอันเก่าออกก่อน

---

## ✨ คุณสมบัติใหม่

### 1. **โหมดเลือกเดี่ยว (Single-Select Mode)**
- ✅ แต่ละเพจ/ไลน์เลือก Instruction ได้เพียง **1 อัน** เท่านั้น
- ✅ คลิกเลือก Instruction ใหม่แทนที่อันเก่าอัตโนมัติ
- ✅ ไม่ต้องยกเลิกอันเก่าก่อนเลือกอันใหม่
- ✅ UI แสดงผลแบบ Radio Button (ไอคอน dot-circle)

### 2. **UI/UX ที่ดีขึ้น**
- 🎨 ไอคอนเปลี่ยนจาก Checkbox → Radio Button
- 🎨 เพิ่ม Badge แสดงสถานะ "ใช้งานอยู่"
- 🎨 เพิ่มตัวนับจำนวน Instruction (0 / 1)
- 🎨 แสดงข้อมูลที่เลือกอย่างชัดเจนพร้อมรายละเอียด
- 🎨 เพิ่ม Hover Effect เมื่อเลื่อนเมาส์
- 🎨 Alert แจ้งเตือนโหมด Single-Select ที่ชัดเจน

### 3. **คำแนะนำที่ชัดเจน**
- 📝 อัพเดทคำแนะนำในโมดอลให้ตรงกับโหมดใหม่
- 📝 แสดง Tooltip และ Helper Text ที่เหมาะสม
- 📝 แจ้งเตือนการทำงานของระบบอย่างชัดเจน

---

## 🔧 ไฟล์ที่มีการเปลี่ยนแปลง

### 1. `/public/js/instructions-management.js`

#### ฟังก์ชันที่แก้ไข:

**`toggleLibrarySelection(date)`** (บรรทัด 333-353)
```javascript
// เปลี่ยนจาก toggle แบบ multi-select เป็น replace แบบ single-select
function toggleLibrarySelection(date) {
  // Single-select mode: Replace the current selection with new one
  if (currentBotInstructions.length === 1 && currentBotInstructions[0] === date) {
    // If clicking the already selected item, deselect it
    currentBotInstructions = [];
  } else {
    // Replace with new selection (only one item)
    currentBotInstructions = [date];
  }
  // ...
}
```

**`displayInstructionLibraries()`** (บรรทัด 189-264)
- เปลี่ยนไอคอนเป็น Radio Button style (`fa-dot-circle` / `far fa-circle`)
- เพิ่ม Badge "ใช้งานอยู่"
- เพิ่ม Hover Effect
- เพิ่มข้อความแนะนำ "เลือกได้เพียง 1 อัน"

**`displaySelectedInstructions()`** (บรรทัด 266-331)
- แสดงเฉพาะ 1 รายการที่เลือก (ไม่ใช่ list)
- เพิ่มรายละเอียดครบถ้วน
- เปลี่ยนปุ่มจาก "ลบ" เป็น "ยกเลิก"
- เพิ่ม Alert แจ้งข้อมูลการใช้งาน

#### ฟังก์ชันใหม่:

**`updateInstructionCounts()`** (บรรทัด 369-391)
```javascript
// แสดงตัวนับจำนวน Instruction ใน Badge
function updateInstructionCounts() {
  // อัพเดทจำนวน libraries
  // อัพเดทจำนวนที่เลือก (0 / 1)
  // เปลี่ยนสี Badge ตามสถานะ
}
```

### 2. `/views/partials/modals/instructions-modal.ejs`

#### การเปลี่ยนแปลง:

**เพิ่ม Alert แจ้งโหมด Single-Select** (บรรทัด 12-21)
```html
<div class="alert alert-primary border-primary" role="alert">
    <div class="d-flex align-items-center">
        <i class="fas fa-info-circle fa-lg me-3"></i>
        <div>
            <strong>โหมดเลือกเดี่ยว (Single-Select Mode)</strong>
            <div class="small mt-1">แต่ละเพจ/ไลน์สามารถเลือก Instruction ได้เพียง <strong>1 อัน</strong> เท่านั้น</div>
        </div>
    </div>
</div>
```

**เพิ่ม Badge ตัวนับ** (บรรทัด 25-37)
- แสดงจำนวน Instructions ที่มีทั้งหมด
- แสดงจำนวนที่เลือก (0 / 1)

**อัพเดทคำแนะนำ** (บรรทัด 71-80)
- เน้นย้ำว่าเลือกได้เพียง 1 อัน
- อธิบายวิธีการใช้งานที่ถูกต้อง
- ชัดเจนและเข้าใจง่าย

---

## 🎯 วิธีการใช้งาน (User Guide)

### สำหรับผู้ใช้งาน:

1. **เปิดโมดอล Instruction Management**
   - คลิกที่ปุ่ม "จัดการ Instructions" ในรายการ Bot

2. **เลือก Instruction**
   - คลิกที่ Instruction ที่ต้องการใช้จากรายการด้านซ้าย
   - ระบบจะแทนที่ Instruction เก่าอัตโนมัติ (ถ้ามี)
   - ดูรายละเอียดที่เลือกทางด้านขวา

3. **เปลี่ยน Instruction**
   - คลิกเลือก Instruction ใหม่ได้เลย
   - ไม่ต้องยกเลิกอันเก่าก่อน

4. **ยกเลิกการเลือก**
   - คลิกปุ่ม "ยกเลิก" ที่รายการด้านขวา
   - หรือคลิกที่ Instruction เดิมอีกครั้ง

5. **บันทึกการเปลี่ยนแปลง**
   - คลิกปุ่ม "บันทึกการเลือกใช้" เพื่อยืนยัน

---

## 🔄 Backward Compatibility

- ✅ ระบบยังเก็บข้อมูลเป็น Array ในฐานข้อมูล
- ✅ รองรับข้อมูลเก่าที่มี Multiple Instructions (จะแสดงเฉพาะตัวแรก)
- ✅ ไม่กระทบกับ Backend API ที่มีอยู่
- ✅ ไม่ต้อง Migration ฐานข้อมูล

---

## 📊 ข้อดีของการเปลี่ยนแปลง

### ✅ ใช้งานง่ายขึ้น
- ไม่ต้องคิดมากว่าจะเลือกอันไหน
- เปลี่ยน Instruction ได้ทันทีด้วยคลิกเดียว
- UI ชัดเจน ไม่สับสน

### ✅ ลดความซับซ้อน
- แต่ละเพจมี Instruction เดียว → ง่ายต่อการจัดการ
- ลดปัญหา Instruction ขัดแย้งกัน
- Debug และ Troubleshoot ง่ายขึ้น

### ✅ Performance ดีขึ้น
- โหลดข้อมูลน้อยลง (1 instruction แทน N instructions)
- ประมวลผล AI เร็วขึ้น
- ลด Token Usage

### ✅ UX ดีขึ้น
- Visual Feedback ชัดเจน (Radio Button)
- แสดงสถานะที่เข้าใจง่าย
- มี Helper Text และ Tooltip

---

## 🧪 การทดสอบ

### ทดสอบการทำงาน:
1. ✅ เลือก Instruction ใหม่
2. ✅ เปลี่ยน Instruction (แทนที่อันเก่า)
3. ✅ ยกเลิกการเลือก
4. ✅ บันทึกและโหลดข้อมูล
5. ✅ ตัวนับแสดงผลถูกต้อง
6. ✅ Hover Effect ทำงาน
7. ✅ Badge แสดงสถานะถูกต้อง

### ทดสอบ Cross-Platform:
- ✅ Line Bot
- ✅ Facebook Bot

---

## 📝 หมายเหตุสำหรับ Developer

### การเพิ่มฟีเจอร์ในอนาคต:

ถ้าต้องการเปลี่ยนกลับเป็น Multi-Select:
1. ลบเงื่อนไข single-select ใน `toggleLibrarySelection()`
2. เปลี่ยนไอคอนกลับเป็น checkbox
3. แก้ `displaySelectedInstructions()` ให้แสดงเป็น list
4. ลบ Alert โหมด Single-Select

### API Endpoints ที่เกี่ยวข้อง:
- `PUT /api/line-bots/:id/instructions` - บันทึก Line Bot Instructions
- `PUT /api/facebook-bots/:id/instructions` - บันทึก Facebook Bot Instructions
- `GET /api/instructions/library` - ดึงรายการ Instruction Libraries

---

## 🎉 สรุป

การปรับปรุงนี้ทำให้ระบบ Instruction Management:
- **ใช้งานง่ายขึ้นอย่างมาก** - คลิกเดียวเปลี่ยน Instruction
- **ชัดเจนขึ้น** - UI บอกได้ชัดว่าเลือกอันไหน
- **รวดเร็วขึ้น** - ไม่ต้องลบ-เพิ่มแบบเดิม
- **มีประสิทธิภาพมากขึ้น** - 1 Instruction ต่อ 1 Bot

---

**อัพเดทเมื่อ:** วันที่ 25 ตุลาคม 2025  
**Version:** 2.0 (Single-Select Mode)

