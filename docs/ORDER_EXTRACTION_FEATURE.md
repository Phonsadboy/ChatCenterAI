# ระบบสกัดออเดอร์อัตโนมัติด้วย AI

## 📋 ภาพรวม

ระบบสกัดออเดอร์จากแชทด้วย AI (OpenAI) ที่เพิ่มเข้ามาในหน้าแชทแอดมิน ช่วยให้แอดมินสามารถวิเคราะห์และจัดการออเดอร์ของลูกค้าได้อย่างมีประสิทธิภาพ

## ✨ ฟีเจอร์หลัก

### 1. **Order Sidebar (คอลัมน์ทางขวา)**
- แสดงออเดอร์ทั้งหมดของลูกค้าที่เลือก
- แสดงจำนวนออเดอร์ในแบดจ์
- รายละเอียดออเดอร์:
  - สถานะ (รอดำเนินการ, ยืนยันแล้ว, จัดส่งแล้ว, เสร็จสิ้น, ยกเลิก)
  - รายการสินค้า (ชื่อ, จำนวน, ราคา)
  - ยอดรวม
  - ที่อยู่จัดส่ง (ถ้ามี)
  - เบอร์โทรศัพท์ (ถ้ามี)
  - วิธีชำระเงิน (ถ้ามี)
  - วันที่สกัดออเดอร์

### 2. **ปุ่มสกัดออเดอร์แบบแมนนวล**
- ปุ่มในพื้นที่ Input Message
- คลิกเพื่อเรียกใช้ AI วิเคราะห์บทสนทนาทันที
- แสดงผลลัพธ์ทันทีหลังวิเคราะห์เสร็จ

### 3. **แท็ก "มีออเดอร์" ในรายชื่อลูกค้า**
- แสดงแบดจ์สีเหลือง "มีออเดอร์" ข้างชื่อลูกค้าที่มีออเดอร์
- อัปเดตอัตโนมัติเมื่อมีการสกัดหรือลบออเดอร์

### 4. **การแก้ไขออเดอร์**
- คลิกปุ่ม "แก้ไข" ในการ์ดออเดอร์
- แก้ไขได้:
  - สถานะออเดอร์
  - หมายเหตุ
  - รายการสินค้า (เพิ่ม/ลบ/แก้ไข)
  - ที่อยู่จัดส่ง
  - เบอร์โทรศัพท์
  - วิธีชำระเงิน
- บันทึกและอัปเดตทันที

### 5. **การลบออเดอร์**
- คลิกปุ่ม "ลบ" ในการ์ดออเดอร์
- ยืนยันก่อนลบ
- อัปเดตรายชื่อลูกค้าทันที

### 6. **Real-time Updates ด้วย Socket.IO**
- อัปเดตออเดอร์แบบ real-time
- Events:
  - `orderExtracted` - เมื่อสกัดออเดอร์ใหม่
  - `orderUpdated` - เมื่อแก้ไขออเดอร์
  - `orderDeleted` - เมื่อลบออเดอร์

## 🎯 การใช้งาน

### สกัดออเดอร์
1. เลือกลูกค้าจากรายชื่อทางซ้าย
2. คลิกปุ่ม 🛒 (สกัดออเดอร์) ในพื้นที่ Input Message
3. รอ AI วิเคราะห์บทสนทนา (ประมาณ 2-5 วินาที)
4. ออเดอร์จะแสดงในคอลัมน์ทางขวาทันที

### แก้ไขออเดอร์
1. คลิกปุ่ม "แก้ไข" ในการ์ดออเดอร์
2. แก้ไขข้อมูลในฟอร์ม
3. คลิก "บันทึก"

### ลบออเดอร์
1. คลิกปุ่ม "ลบ" ในการ์ดออเดอร์
2. ยืนยันการลบ

## 🔧 เทคนิค

### Frontend
- **ไฟล์ที่เกี่ยวข้อง:**
  - `/public/css/chat-redesign.css` - CSS สำหรับ Order Sidebar
  - `/public/js/chat-redesign.js` - JavaScript สำหรับจัดการออเดอร์
  - `/views/admin-chat.ejs` - HTML Template
  - `/views/admin-orders.ejs`, `/public/js/orders-dashboard.js`, `/public/css/orders.css` - หน้ารายงานออเดอร์และการตั้งค่าตัดรอบ

- **ฟังก์ชันหลัก:**
  - `loadOrders()` - โหลดออเดอร์ของลูกค้า
  - `renderOrders()` - แสดงออเดอร์ใน UI
  - `extractOrder()` - สกัดออเดอร์ด้วย AI
  - `editOrder(orderId)` - แก้ไขออเดอร์
  - `deleteOrder(orderId)` - ลบออเดอร์
  - `saveOrder()` - บันทึกการแก้ไขออเดอร์

### Backend
- **API Endpoints:**
  - `GET /admin/chat/orders/:userId` - ดึงออเดอร์ของลูกค้า
  - `POST /admin/chat/orders/extract` - สกัดออเดอร์ด้วย AI
  - `PUT /admin/chat/orders/:orderId` - แก้ไขออเดอร์
  - `DELETE /admin/chat/orders/:orderId` - ลบออเดอร์
  - `GET /admin/chat/orders` - ดึงออเดอร์ทั้งหมด (สำหรับรายงาน)
  - `GET /admin/orders/pages` - ดึงรายการเพจพร้อมเวลาตัดรอบ
  - `POST /admin/orders/pages/cutoff` - บันทึกเวลาตัดรอบต่อเพจ
  - `POST /admin/orders/settings/scheduling` - เปิด/ปิดการสแกนอัตโนมัติ

- **ฟังก์ชันหลัก:**
  - `analyzeOrderFromChat(userId, messages)` - วิเคราะห์ออเดอร์ด้วย OpenAI
  - `saveOrderToDatabase(...)` - บันทึกออเดอร์ลงฐานข้อมูล
  - `getUserOrders(userId)` - ดึงออเดอร์ของลูกค้า
  - `appendOrderExtractionMessage(doc)` - เก็บสำเนาประวัติแชทลงบัฟเฟอร์สำหรับการสกัด
  - `processOrderCutoffForPage(pageConfig)` - ประมวลผลออเดอร์ตามรอบที่ตั้งไว้
  - `startOrderCutoffScheduler()` - ตั้ง scheduler ให้สแกนออเดอร์อัตโนมัติทุก ๆ นาที

### Database
- **Collection:** `orders`
- **Schema:**
```javascript
{
  _id: ObjectId,
  userId: String,
  platform: String, // "line" หรือ "facebook"
  botId: String,
  orderData: {
    items: [
      {
        product: String,
        quantity: Number,
        price: Number
      }
    ],
    totalAmount: Number,
    shippingAddress: String | null,
    phone: String | null,
    paymentMethod: String | null
  },
  status: String, // "pending", "confirmed", "shipped", "completed", "cancelled"
  extractedAt: Date,
  extractedFrom: String, // "manual_extraction" หรือ "auto_extraction"
  isManualExtraction: Boolean,
  updatedAt: Date,
  notes: String
}
```
- **Collection:** `order_extraction_buffers` เก็บข้อความที่ใช้ในการสกัดสำหรับแต่ละเพจ/ผู้ใช้
- **Collection:** `order_cutoff_settings` เก็บเวลาตัดรอบและสรุปผลการสแกนของแต่ละเพจ

## 🕒 ระบบตัดรอบออเดอร์อัตโนมัติ

- สามารถตั้งเวลา cutoff สำหรับแต่ละเพจได้ที่หน้า "รายงานออเดอร์" (ค่าเริ่มต้น 23:59)
- ระบบจะเก็บประวัติการสนทนาไว้ 2 ที่: `chat_history` (สำหรับแสดงผล/ตอบกลับ) และ `order_extraction_buffers` (สำหรับตัดรอบ)
- เมื่อถึงเวลาตัดรอบ ระบบจะตรวจเฉพาะผู้ใช้ที่มีข้อความใหม่หลังรอบก่อนหน้า วิเคราะห์ และบันทึกออเดอร์ให้โดยอัตโนมัติ
- หากสกัดสำเร็จ ข้อความใน buffer ของผู้ใช้นั้นจะถูกล้าง เพื่อให้รอบถัดไปเริ่มต้นจากบทสนทนาใหม่
- หากไม่พบออเดอร์ ระบบจะเก็บ buffer ไว้และรอให้ผู้ใช้คุยใหม่ในรอบต่อไป
- สามารถเปิด/ปิด scheduler ได้จากสวิตช์บนหน้า "รายงานออเดอร์"

## 🤖 AI Analysis

### OpenAI Prompt
ระบบใช้ OpenAI (รุ่น `gpt-4o-mini` หรือตามการตั้งค่า) เพื่อวิเคราะห์บทสนทนา:

**เกณฑ์การพิจารณา:**
- ✅ ถือว่ามีออเดอร์ = ลูกค้าสั่งซื้อสินค้าชัดเจน พร้อมระบุรายละเอียด
- ❌ ไม่ถือว่ามีออเดอร์ = ถามราคา, ต่อรอง, ลังเล, พิจารณาอยู่

**ข้อมูลที่สกัด:**
- รายการสินค้า (ชื่อ, จำนวน, ราคา)
- ยอดรวม
- ที่อยู่จัดส่ง (ถ้าระบุ)
- เบอร์โทรศัพท์ (ถ้าระบุ)
- วิธีชำระเงิน (ถ้าระบุ, ไม่ระบุ = เก็บเงินปลายทาง)

## 📱 Responsive Design

- **Desktop:** แสดง Order Sidebar ทางขวาเต็มรูปแบบ
- **Tablet/Mobile:** ซ่อน Order Sidebar (อาจเพิ่มปุ่มเปิด/ปิดในอนาคต)

## 🎨 UI/UX

### สี
- แบดจ์ "มีออเดอร์": สีเหลือง (`--chat-warning`)
- สถานะออเดอร์:
  - รอดำเนินการ: สีเหลือง
  - ยืนยันแล้ว: สีฟ้า
  - จัดส่งแล้ว: สีเขียว
  - เสร็จสิ้น: สีเขียวเข้ม
  - ยกเลิก: สีแดง

### Animation
- Fade in เมื่อโหลดออเดอร์
- Hover effect บนการ์ดออเดอร์
- Toast notification สำหรับการดำเนินการ

## 🔐 Security

- ตรวจสอบ `orderId` ด้วย `ObjectId.isValid()`
- ตรวจสอบสิทธิ์แอดมินก่อนเข้าถึง API
- Escape HTML เพื่อป้องกัน XSS
- Validate ข้อมูลก่อนบันทึก

## 🚀 Performance

- โหลดออเดอร์เฉพาะเมื่อเลือกลูกค้า
- Cache ข้อมูลออเดอร์ใน `this.currentOrders`
- Real-time update ด้วย Socket.IO (ไม่ต้อง polling)
- Limit การแสดงผลออเดอร์ (เรียงจากใหม่สุดก่อน)

## 📝 การตั้งค่า

### Environment Variables
- `OPENAI_API_KEY` - API Key สำหรับ OpenAI (จำเป็น)

### Database Settings
ตั้งค่าใน Admin Settings:
- `orderAnalysisEnabled` - เปิด/ปิดการวิเคราะห์ออเดอร์อัตโนมัติ (default: true)
- `orderModel` - โมเดล OpenAI ที่ใช้ (default: "gpt-4o-mini")

## 🐛 Known Issues & Limitations

1. **ภาษา:** ปัจจุบันรองรับเฉพาะภาษาไทย
2. **Mobile:** Order Sidebar ซ่อนบนมือถือ
3. **AI Accuracy:** ความแม่นยำขึ้นอยู่กับความชัดเจนของบทสนทนา
4. **Rate Limit:** ขึ้นอยู่กับ OpenAI API rate limit

## 🔮 Future Improvements

- [ ] เพิ่มการแจ้งเตือนเมื่อมีออเดอร์ใหม่
- [ ] Export ออเดอร์เป็น Excel/PDF
- [ ] Dashboard สรุปออเดอร์
- [ ] Integration กับระบบจัดส่ง (Kerry, Flash, etc.)
- [ ] รองรับหลายภาษา
- [ ] Auto-reply เมื่อสกัดออเดอร์สำเร็จ
- [ ] Order Sidebar บนมือถือ (Modal/Drawer)

## 📞 Support

หากพบปัญหาหรือต้องการความช่วยเหลือ กรุณาติดต่อทีมพัฒนา

---

**เวอร์ชัน:** 1.0.0  
**วันที่อัปเดต:** 26 ตุลาคม 2025  
**ผู้พัฒนา:** ChatCenter AI Team
