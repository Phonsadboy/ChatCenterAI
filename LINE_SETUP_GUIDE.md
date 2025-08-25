# คู่มือการตั้งค่า LINE Official Account

## ภาพรวม

คู่มือนี้จะแนะนำวิธีการตั้งค่า LINE Official Account เพื่อเชื่อมต่อกับระบบ ChatCenterAI

## ขั้นตอนการตั้งค่า

### 1. สร้าง LINE Official Account

1. ไปที่ [LINE Developers Console](https://developers.line.biz/)
2. เข้าสู่ระบบด้วยบัญชี LINE ของคุณ
3. คลิก "Create New Provider" หรือเลือก Provider ที่มีอยู่
4. คลิก "Create Channel" → "Messaging API"
5. กรอกข้อมูล Channel:
   - **Channel name**: ชื่อที่ต้องการแสดง (เช่น "บริษัท ABC")
   - **Channel description**: คำอธิบายสั้นๆ
   - **Category**: เลือกหมวดหมู่ที่เหมาะสม
   - **Subcategory**: เลือกหมวดหมู่ย่อย
   - **Email address**: อีเมลสำหรับติดต่อ
6. คลิก "Create"

### 2. ตั้งค่า Messaging API

1. หลังจากสร้าง Channel แล้ว ให้คลิกเข้าไปใน Channel
2. ไปที่แท็บ "Messaging API"
3. เปิดใช้งาน "Use webhook"
4. ตั้งค่า Webhook URL: `https://your-domain.com/api/webhooks/line`
5. คัดลอก **Channel access token** และ **Channel secret**

### 3. ตั้งค่าในระบบ ChatCenterAI

1. เข้าไปที่หน้า "แพลตฟอร์ม" ในระบบ
2. คลิกที่ "LINE" เพื่อเปิดการตั้งค่า
3. กรอกข้อมูล:
   - **ชื่อเพจ**: ชื่อที่ต้องการแสดงในระบบ
   - **Channel Access Token**: ข้อมูลที่คัดลอกจาก LINE Developers
   - **Channel Secret**: ข้อมูลที่คัดลอกจาก LINE Developers
4. คลิก "บันทึกการตั้งค่า"
5. คลิก "ทดสอบการเชื่อมต่อ" เพื่อตรวจสอบ

### 4. เปิดใช้งาน

1. หลังจากทดสอบการเชื่อมต่อสำเร็จ ให้เปิดใช้งาน LINE
2. ระบบจะพร้อมรับข้อความจาก LINE Official Account

## การทดสอบ

### ทดสอบการส่งข้อความ

1. เพิ่ม LINE Official Account เป็นเพื่อน
2. ส่งข้อความไปยัง Official Account
3. ตรวจสอบว่าข้อความปรากฏในระบบ ChatCenterAI

### ทดสอบการตอบกลับ

1. ตอบกลับข้อความในระบบ ChatCenterAI
2. ตรวจสอบว่าข้อความถูกส่งไปยังผู้ใช้ LINE

## การแก้ไขปัญหา

### ปัญหาที่พบบ่อย

#### 1. Webhook URL ไม่ถูกต้อง
- ตรวจสอบว่า URL เป็น HTTPS
- ตรวจสอบว่า URL ถูกต้องและเข้าถึงได้

#### 2. Channel Access Token ไม่ถูกต้อง
- ตรวจสอบว่า Token ถูกคัดลอกมาครบถ้วน
- ตรวจสอบว่า Token ยังไม่หมดอายุ

#### 3. Channel Secret ไม่ถูกต้อง
- ตรวจสอบว่า Secret ถูกคัดลอกมาครบถ้วน
- ตรวจสอบว่า Secret ไม่มีช่องว่างเพิ่มเติม

#### 4. ข้อความไม่เข้ามาในระบบ
- ตรวจสอบว่า Webhook เปิดใช้งานใน LINE Developers
- ตรวจสอบว่า LINE Official Account เปิดใช้งาน
- ตรวจสอบ Log ในระบบ

### การตรวจสอบ Log

1. ตรวจสอบ Console ใน Browser
2. ตรวจสอบ Network tab เพื่อดู Webhook requests
3. ตรวจสอบ Server logs

## ความปลอดภัย

### การจัดการ Token

- เก็บ Channel Access Token และ Channel Secret ไว้อย่างปลอดภัย
- อย่าแชร์ Token กับผู้อื่น
- เปลี่ยน Token เป็นระยะ

### การตั้งค่า Webhook

- ใช้ HTTPS เท่านั้น
- ตรวจสอบ Signature ของ Webhook
- จำกัดการเข้าถึง Webhook endpoint

## การอัปเดต

### อัปเดต Channel Access Token

1. ไปที่ LINE Developers Console
2. สร้าง Channel Access Token ใหม่
3. อัปเดตในระบบ ChatCenterAI
4. ทดสอบการเชื่อมต่อ

### อัปเดต Webhook URL

1. อัปเดต Webhook URL ใน LINE Developers Console
2. ตรวจสอบว่า URL ใหม่เข้าถึงได้
3. ทดสอบการส่งข้อความ

## การสนับสนุน

หากพบปัญหาหรือต้องการความช่วยเหลือ:

1. ตรวจสอบคู่มือนี้ก่อน
2. ตรวจสอบ Log และ Error messages
3. ติดต่อทีมสนับสนุนพร้อมข้อมูล:
   - Error message
   - Log files
   - ขั้นตอนที่ทำ
   - เวลาที่เกิดปัญหา

## ข้อมูลเพิ่มเติม

- [LINE Messaging API Documentation](https://developers.line.biz/en/docs/messaging-api/)
- [LINE Developers Console](https://developers.line.biz/)
- [LINE Official Account Guidelines](https://developers.line.biz/en/docs/messaging-api/building-bot/)
