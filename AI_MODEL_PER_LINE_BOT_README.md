# AI Model per Line Bot - การปรับปรุงระบบ

## ภาพรวมการเปลี่ยนแปลง

ระบบได้รับการปรับปรุงให้แต่ละ Line Bot สามารถตั้งค่า AI Model เฉพาะได้ แทนการตั้งค่าแบบรวม (global settings) เดิม

## การเปลี่ยนแปลงหลัก

### 1. โครงสร้างข้อมูล Line Bot

เพิ่มฟิลด์ `aiModel` ใน Line Bot schema:

```javascript
const lineBot = {
  name: "ชื่อ Line Bot",
  description: "คำอธิบาย",
  channelAccessToken: "token",
  channelSecret: "secret",
  webhookUrl: "webhook url",
  status: "active",
  isDefault: false,
  aiModel: "gpt-5", // ใหม่: AI Model เฉพาะสำหรับ Line Bot นี้
  selectedInstructions: [], // Instructions ที่เลือกจากคลัง
  createdAt: new Date(),
  updatedAt: new Date()
};
```

### 2. AI Models ที่รองรับ

ระบบรองรับ AI Models ต่อไปนี้:

- **GPT-5 Series:**
  - `gpt-5` - GPT-5 มาตรฐาน
  - `gpt-5-mini` - GPT-5 Mini (ประหยัด)
  - `gpt-5-chat-latest` - GPT-5 Chat เวอร์ชันล่าสุด
  - `gpt-5-nano` - GPT-5 Nano (เร็วที่สุด)

- **GPT-4.1 Series:**
  - `gpt-4.1` - GPT-4.1 มาตรฐาน
  - `gpt-4.1-mini` - GPT-4.1 Mini (ประหยัด)

- **O3 Series:**
  - `o3` - O3 Model

### 3. การทำงานของระบบ

#### การประมวลผลข้อความ
```javascript
// ใช้ AI Model เฉพาะของ Line Bot
const aiModel = lineBot.aiModel || 'gpt-5';

// ดึง system prompt จาก instructions ที่เลือก
let systemPrompt = 'คุณเป็น AI Assistant ที่ช่วยตอบคำถามผู้ใช้';
if (lineBot.selectedInstructions && lineBot.selectedInstructions.length > 0) {
  // ดึง instructions จากคลังและแปลงเป็นข้อความ
  const libraries = await instructionColl.find({
    _id: { $in: lineBot.selectedInstructions.map(id => new ObjectId(id)) }
  }).toArray();

  const allInstr = libraries.flatMap(lib => lib.instructions || []);
  const instrTexts = allInstr
    .map(i => i.type === 'table' ? tableInstructionToJSON(i) : i.content)
    .filter(Boolean);
  if (instrTexts.length > 0) {
    systemPrompt = instrTexts.join('\n\n');
  }
}

// เรียก OpenAI API ด้วย model เฉพาะ
const response = await openai.chat.completions.create({
  model: aiModel,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: message }
  ]
});
```

#### การประมวลผลรูปภาพ
```javascript
// ใช้ AI Model เฉพาะของ Line Bot สำหรับ vision
const visionModel = aiModel || await getSettingValue('visionModel', 'gpt-5');

const response = await openai.chat.completions.create({
  model: visionModel,
  messages: [
    { role: "system", content: systemInstructions },
    ...history,
    { role: "user", content: finalContent }
  ]
});
```

### 4. การตั้งค่าใน UI

#### แบบฟอร์มเพิ่ม/แก้ไข Line Bot
- เพิ่มฟิลด์ "AI Model" เป็น dropdown
- เลือก model จากรายการที่รองรับ
- ตั้งค่าเริ่มต้นเป็น "gpt-5"

#### การแสดงผลในรายการ Line Bot
- แสดง AI Model ที่ใช้ในแต่ละ Line Bot
- แสดงเป็น badge สีน้ำเงิน
- จัดเรียงข้อมูลให้อ่านง่าย

#### ข้อมูลสรุปในส่วนการตั้งค่า AI
- แสดง AI Model ที่ใช้ในแต่ละ Line Bot
- แสดงสถานะการใช้งาน
- อัปเดตข้อมูลแบบ real-time

### 5. API Endpoints

#### อัปเดต Line Bot
```http
PUT /api/line-bots/:id
{
  "name": "ชื่อ Line Bot",
  "description": "คำอธิบาย",
  "channelAccessToken": "token",
  "channelSecret": "secret",
  "webhookUrl": "webhook url",
  "status": "active",
  "aiModel": "gpt-5", // ใหม่
  "isDefault": false
}
```

#### สร้าง Line Bot ใหม่
```http
POST /api/line-bots
{
  "name": "ชื่อ Line Bot",
  "description": "คำอธิบาย",
  "channelAccessToken": "token",
  "channelSecret": "secret",
  "webhookUrl": "webhook url",
  "status": "active",
  "aiModel": "gpt-5", // ใหม่
  "isDefault": false
}
```

### 6. การจัดการ Instructions

แต่ละ Line Bot สามารถ:
- เลือก instructions จากคลัง
- ใช้ instructions เป็น system prompt
- เปลี่ยน instructions ได้ตามต้องการ
- มี instructions เฉพาะสำหรับแต่ละ bot

### 7. การ Fallback

หาก Line Bot ไม่ได้ตั้งค่า `aiModel`:
- ระบบจะใช้ global setting เป็นค่าเริ่มต้น
- `textModel` สำหรับข้อความธรรมดา
- `visionModel` สำหรับรูปภาพ

## ประโยชน์ของการเปลี่ยนแปลง

### 1. ความยืดหยุ่น
- แต่ละ Line Bot สามารถใช้ AI Model ที่เหมาะสมกับงาน
- ตั้งค่า model ตามงบประมาณและความต้องการ

### 2. การควบคุมต้นทุน
- ใช้ model ที่ประหยัดสำหรับงานง่าย
- ใช้ model ที่มีประสิทธิภาพสูงสำหรับงานซับซ้อน

### 3. การแยกงาน
- Line Bot แต่ละตัวมี personality และความสามารถเฉพาะ
- ใช้ instructions ที่เหมาะสมกับแต่ละ bot

### 4. การขยายระบบ
- เพิ่ม Line Bot ใหม่ได้ง่าย
- ตั้งค่า AI Model ได้ทันที

## การใช้งาน

### 1. สร้าง Line Bot ใหม่
1. ไปที่ "การตั้งค่า" > "จัดการ Line Bot"
2. คลิก "เพิ่ม Line Bot ใหม่"
3. กรอกข้อมูลพื้นฐาน
4. เลือก AI Model ที่ต้องการ
5. บันทึก

### 2. แก้ไข AI Model
1. คลิก "แก้ไข" ใน Line Bot ที่ต้องการ
2. เปลี่ยน AI Model ใน dropdown
3. บันทึกการเปลี่ยนแปลง

### 3. จัดการ Instructions
1. คลิก "จัดการ Instructions" ใน Line Bot
2. เลือก instructions จากคลัง
3. บันทึกการเลือก

### 4. ดูข้อมูลสรุป
- ไปที่ "การตั้งค่า" > "การตั้งค่า AI Model"
- ดูข้อมูล AI Model ที่ใช้ในแต่ละ Line Bot

## การทดสอบ

### 1. ทดสอบการเชื่อมต่อ
- คลิก "ทดสอบ" ในแต่ละ Line Bot
- ตรวจสอบการเชื่อมต่อกับ LINE

### 2. ทดสอบการตอบกลับ
- ส่งข้อความไปยัง Line Bot
- ตรวจสอบการตอบกลับด้วย AI Model ที่ตั้งไว้

### 3. ทดสอบการประมวลผลรูปภาพ
- ส่งรูปภาพไปยัง Line Bot
- ตรวจสอบการประมวลผลด้วย Vision Model

## หมายเหตุสำคัญ

1. **การเปลี่ยนแปลงนี้ไม่กระทบกับ Line Bot ที่มีอยู่** - ระบบจะใช้ `gpt-5` เป็นค่าเริ่มต้น
2. **Global settings ยังคงใช้งานได้** - เป็น fallback สำหรับ Line Bot ที่ไม่ได้ตั้งค่า
3. **Instructions ต้องถูกเลือกก่อน** - ระบบจะใช้ default prompt หากไม่มีการเลือก instructions
4. **การเปลี่ยนแปลงจะมีผลทันที** - ไม่ต้อง restart ระบบ

## การแก้ไขปัญหา

### ปัญหาที่พบบ่อย

1. **Line Bot ไม่ตอบกลับ**
   - ตรวจสอบ AI Model ที่ตั้งไว้
   - ตรวจสอบ Instructions ที่เลือก
   - ตรวจสอบสถานะของ Line Bot

2. **AI Model ไม่ถูกต้อง**
   - ตรวจสอบรายการ model ที่รองรับ
   - ตรวจสอบการตั้งค่าในฐานข้อมูล

3. **Instructions ไม่ทำงาน**
   - ตรวจสอบการเลือก instructions
   - ตรวจสอบข้อมูลในคลัง instructions

### การตรวจสอบ Log

```bash
# ตรวจสอบการทำงานของ Line Bot
tail -f logs/line-bot.log

# ตรวจสอบการเรียก OpenAI API
grep "OpenAI" logs/app.log

# ตรวจสอบการตั้งค่า
grep "aiModel" logs/app.log
```

## การพัฒนาต่อ

### ฟีเจอร์ที่อาจเพิ่มในอนาคต

1. **Model Performance Tracking**
   - ติดตามประสิทธิภาพของแต่ละ model
   - แนะนำ model ที่เหมาะสม

2. **Cost Optimization**
   - คำนวณต้นทุนตาม model ที่ใช้
   - แจ้งเตือนเมื่อต้นทุนเกินงบประมาณ

3. **Model A/B Testing**
   - ทดสอบ model หลายตัว
   - เปรียบเทียบผลลัพธ์

4. **Dynamic Model Selection**
   - เลือก model ตามประเภทงาน
   - ปรับเปลี่ยน model อัตโนมัติ

## สรุป

การปรับปรุงนี้ทำให้ระบบมีความยืดหยุ่นและประสิทธิภาพมากขึ้น โดยแต่ละ Line Bot สามารถ:

- ใช้ AI Model เฉพาะที่เหมาะสมกับงาน
- มี Instructions เฉพาะที่กำหนด personality
- ควบคุมต้นทุนได้ตามความต้องการ
- ขยายระบบได้ง่ายและรวดเร็ว

ระบบยังคงรักษาความเข้ากันได้กับ Line Bot ที่มีอยู่ และมี fallback mechanism ที่ดีเพื่อความเสถียรในการทำงาน
