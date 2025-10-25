# หน้าแชทใหม่ - ChatCenter AI

## 📋 ภาพรวม

หน้าแชทใหม่ที่ออกแบบมาเพื่อการจัดการแชทกับลูกค้าแบบ Real-time พร้อมฟีเจอร์ครบครัน

## 📁 ไฟล์ที่รวมอยู่

### 1. **admin-chat.ejs** (32 KB)
ไฟล์ HTML/EJS Template สำหรับหน้าแชท

**ฟีเจอร์หลัก:**
- User List Sidebar พร้อมการค้นหาและกรอง
- Chat Area แบบ Real-time
- Message Input พร้อม Character Counter
- Modals สำหรับรูปภาพ, แท็ก, และฟีเจอร์อื่นๆ
- Responsive Design สำหรับ Mobile และ Desktop

### 2. **chat-new.js** (102 KB, 2,590 บรรทัด)
JavaScript สำหรับการจัดการหน้าแชท

**คลาสหลัก: ChatManager**

**ฟีเจอร์หลัก:**
- Socket.IO Integration สำหรับ Real-time Updates
- User List Management พร้อมการกรองและค้นหา
- Chat History Display
- Message Sending/Receiving
- Tag Management
- Purchase Status Management
- AI Control (Per-User และ Global)
- Follow-up Integration
- Image Support (Display, Modal, Download, Copy)
- Quick Replies & Templates
- Chat Search
- Message Forwarding
- Statistics & Export
- Keyboard Shortcuts
- Performance Optimizations (Lazy Loading, Debouncing, Smart Polling)

**เมธอดสำคัญ:**
- `init()` - เริ่มต้นระบบ
- `initializeSocket()` - เชื่อมต่อ Socket.IO
- `loadUsers()` - โหลดรายชื่อผู้ใช้
- `selectUser(userId)` - เลือกผู้ใช้เพื่อแชท
- `loadChatHistory(userId)` - โหลดประวัติการสนทนา
- `sendMessage()` - ส่งข้อความ
- `handleNewMessage(data)` - รับข้อความใหม่
- `applyFilters()` - กรองรายชื่อผู้ใช้
- `togglePurchaseStatus()` - เปลี่ยนสถานะการซื้อ
- `toggleAiForCurrent()` - เปิด/ปิด AI สำหรับผู้ใช้
- `openTagModal()` - เปิด Modal จัดการแท็ก
- `openTemplateModal()` - เปิด Modal Template
- `openChatSearch()` - เปิดการค้นหาในแชท
- `openForwardModal()` - เปิด Modal ส่งต่อข้อความ

### 3. **chat-new.css** (52 KB, 2,380 บรรทัด)
CSS สำหรับการจัดรูปแบบหน้าแชท

**ส่วนประกอบหลัก:**
- CSS Variables สำหรับ Theme
- Layout Styles (Sidebar, Chat Area)
- User List Styles
- Message Styles
- Modal Styles
- Filter & Search Styles
- Tag Styles
- Mobile Responsive Styles
- Animation & Transitions
- Loading States
- Error States

**CSS Variables:**
```css
--primary: #0084ff
--secondary: #6c757d
--success: #28a745
--danger: #dc3545
--warning: #ffc107
--info: #17a2b8
--light: #f8f9fa
--dark: #343a40
--bg-primary: #ffffff
--bg-secondary: #f5f7fa
--text-primary: #1c1e21
--text-secondary: #65676b
--border-color: #e4e6eb
--shadow: rgba(0, 0, 0, 0.1)
```

## 🚀 การติดตั้งและใช้งาน

### 1. วางไฟล์ในตำแหน่งที่ถูกต้อง

```bash
# EJS Template
cp admin-chat.ejs /path/to/project/views/

# JavaScript
cp chat-new.js /path/to/project/public/js/

# CSS
cp chat-new.css /path/to/project/public/css/
```

### 2. ตรวจสอบ Dependencies

**ไฟล์ที่ต้องมี:**
- `/css/style.css` - CSS หลักของโปรเจค
- `/css/mobile-improvements.css` - CSS สำหรับ Mobile
- `/css/loading-states.css` - CSS สำหรับ Loading States
- `/css/error-handler.css` - CSS สำหรับ Error Handling
- `/css/animations.css` - CSS สำหรับ Animations
- `/js/performance-utils.js` - JavaScript Utilities สำหรับ Performance
- `/js/loading-states.js` - JavaScript สำหรับ Loading States
- `/js/error-handler.js` - JavaScript สำหรับ Error Handling

**External Libraries:**
- Bootstrap 5.3.0
- Font Awesome 6.4.0
- Socket.IO Client

### 3. ตั้งค่า Backend API Endpoints

หน้าแชทต้องการ API Endpoints ดังนี้:

**GET Endpoints:**
- `/admin/chat/users` - ดึงรายชื่อผู้ใช้ทั้งหมด
- `/admin/chat/history/:userId` - ดึงประวัติการสนทนา
- `/admin/chat/user-status/:userId` - ดึงสถานะ AI ของผู้ใช้
- `/admin/chat/tags` - ดึงแท็กทั้งหมด
- `/admin/chat/quick-replies` - ดึง Quick Replies
- `/admin/chat/statistics/:userId` - ดึงสถิติการสนทนา

**POST Endpoints:**
- `/admin/chat/send` - ส่งข้อความ
- `/admin/chat/clear/:userId` - ล้างประวัติการสนทนา
- `/admin/chat/user-status` - อัปเดตสถานะ AI
- `/admin/chat/purchase-status` - อัปเดตสถานะการซื้อ
- `/admin/chat/tags` - จัดการแท็ก
- `/admin/chat/quick-reply` - บันทึก Quick Reply
- `/admin/chat/forward` - ส่งต่อข้อความ

**DELETE Endpoints:**
- `/admin/chat/quick-reply/:id` - ลบ Quick Reply

### 4. ตั้งค่า Socket.IO Events

**Client Emits:**
- (ไม่มี - ใช้ HTTP API)

**Server Emits:**
- `newMessage` - ข้อความใหม่
- `followUpTagged` - อัปเดตสถานะติดตาม
- `chatCleared` - ล้างแชท
- `userTagsUpdated` - อัปเดตแท็ก
- `userPurchaseStatusUpdated` - อัปเดตสถานะการซื้อ

## 🎨 การปรับแต่ง Theme

แก้ไข CSS Variables ใน `chat-new.css`:

```css
:root {
    /* เปลี่ยนสีหลัก */
    --primary: #0084ff;
    
    /* เปลี่ยนสีพื้นหลัง */
    --bg-primary: #ffffff;
    --bg-secondary: #f5f7fa;
    
    /* เปลี่ยนสีข้อความ */
    --text-primary: #1c1e21;
    --text-secondary: #65676b;
}
```

## 📱 Mobile Support

หน้าแชทรองรับการใช้งานบน Mobile อย่างเต็มรูปแบบ:

- Sidebar แบบ Overlay
- Touch-friendly UI
- Safe Area Support (iOS)
- Responsive Design
- Optimized Touch Targets

## ⌨️ Keyboard Shortcuts

- `Ctrl+K` - เปิดการค้นหาในแชท
- `Ctrl+Shift+F` - เปิด Modal ส่งต่อข้อความ
- `Ctrl+Shift+S` - เปิด Modal สถิติ
- `Ctrl+Shift+E` - เปิด Modal Export
- `Ctrl+/` - เปิด Modal Shortcuts
- `Esc` - ปิด Modal ที่เปิดอยู่
- `Enter` - ส่งข้อความ
- `Shift+Enter` - ขึ้นบรรทัดใหม่
- `/` - เปิด Template Modal (เมื่อ input ว่าง)

## 🔧 Performance Optimizations

- **Lazy Loading** - โหลดรูปภาพแบบ Lazy
- **Debouncing** - ค้นหาแบบ Debounce (300ms)
- **Smart Polling** - หยุด Polling เมื่อ Tab ไม่ active
- **Optimized Fetch** - Cache API Requests
- **Virtual Scrolling** - (Planned)

## 📊 Data Models

### User Object
```javascript
{
    userId: String,
    displayName: String,
    lastMessage: String,
    lastMessageTime: Date,
    unreadCount: Number,
    aiEnabled: Boolean,
    hasPurchased: Boolean,
    tags: [String],
    followUp: {
        isFollowUp: Boolean,
        reason: String,
        updatedAt: Date
    }
}
```

### Message Object
```javascript
{
    role: 'user' | 'assistant' | 'admin',
    content: String,
    images: [String],
    timestamp: Date
}
```

### Quick Reply Object
```javascript
{
    id: String,
    title: String,
    content: String,
    createdAt: Date
}
```

## 🐛 Known Issues

1. Virtual Scrolling ยังไม่ได้ implement
2. Image Upload ยังไม่รองรับ
3. Voice Message ยังไม่รองรับ
4. Video Call ยังไม่รองรับ

## 📝 License

Copyright © 2024 ChatCenter AI. All rights reserved.

## 👥 Author

ChatCenter AI Development Team

## 📧 Support

หากมีปัญหาหรือข้อสงสัย กรุณาติดต่อทีมพัฒนา

