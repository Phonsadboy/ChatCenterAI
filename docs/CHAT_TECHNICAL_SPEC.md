# Chat Page - Technical Specification

## 📋 สารบัญ

1. [ภาพรวม](#ภาพรวม)
2. [Current Features](#current-features)
3. [UI Components](#ui-components)
4. [API Endpoints](#api-endpoints)
5. [Data Models](#data-models)
6. [Socket.IO Events](#socketio-events)
7. [State Management](#state-management)
8. [Performance Optimization](#performance-optimization)
9. [Proposed Improvements](#proposed-improvements)

---

## ภาพรวม

หน้า **Admin Chat** (`/admin/chat`) เป็นหน้าหลักสำหรับการจัดการแชทกับลูกค้า รองรับการแชทแบบ Real-time ผ่าน Socket.IO พร้อมฟีเจอร์ครบครัน

### ไฟล์ที่เกี่ยวข้อง
- **View**: `views/admin-chat.ejs`
- **JavaScript**: `public/js/chat-new.js`
- **CSS**: `public/css/chat-new.css`
- **Supporting CSS**: 
  - `public/css/mobile-improvements.css`
  - `public/css/loading-states.css`
  - `public/css/error-handler.css`
  - `public/css/animations.css`
- **Supporting JS**:
  - `public/js/performance-utils.js`
  - `public/js/loading-states.js`
  - `public/js/error-handler.js`

### Tech Stack
- **Frontend**: Vanilla JavaScript (ES6+), Bootstrap 5.3.0
- **Real-time**: Socket.IO Client
- **Icons**: Font Awesome 6.4.0
- **Architecture**: Class-based (ChatManager)
- **AI Models**: GPT-5, GPT-5-mini, GPT-5-chat-latest, GPT-5-nano, GPT-4.1, GPT-4.1-mini, O3

---

## Current Features

### 1. User List Management

#### 1.1 User List Display
- แสดงรายชื่อผู้ใช้ที่เคยแชท
- แสดงข้อมูล:
  - Avatar (สร้างจากตัวอักษรแรก)
  - Display Name
  - Last Message (50 ตัวอักษร)
  - Timestamp (relative time)
  - Unread Count Badge
  - AI Status Badge
  - Follow-up Badge
  - Purchase Status Icon
  - Tags (แสดงสูงสุด 2 tags)

#### 1.2 Search & Filter
- **Search**: ค้นหาตามชื่อหรือ User ID
- **Status Filters**:
  - ทั้งหมด (all)
  - ยังไม่อ่าน (unread)
  - ติดตาม (followup)
  - เคยซื้อแล้ว (purchased)
- **Tag Filters**: กรองตามแท็ก (OR logic)
- **Filter Badge**: แสดงจำนวน filters ที่ active

#### 1.3 User Count
- แสดงจำนวนผู้ใช้ทั้งหมด
- แสดงจำนวนผู้ใช้หลังกรอง

### 2. Chat Interface

#### 2.1 Chat Header
- แสดงข้อมูลผู้ใช้ปัจจุบัน:
  - Avatar
  - Display Name
  - Message Count
  - AI Status (เปิด/ปิด)
  - Tags
  - Follow-up Status (ถ้ามี)
- **Actions**:
  - Toggle Purchase Status
  - Manage Tags
  - Toggle AI (เปิด/ปิด AI สำหรับผู้ใช้นี้)
  - Clear Chat History

#### 2.2 Messages Display
- แสดงประวัติการสนทนา
- รองรับ 3 ประเภทข้อความ:
  - **User**: ข้อความจากผู้ใช้ (ซ้าย)
  - **Assistant**: ข้อความจาก AI (ขวา)
  - **Admin**: ข้อความจาก Admin (ขวา)
- แสดงข้อมูลแต่ละข้อความ:
  - Sender Label
  - Message Content (รองรับ text และ images)
  - Timestamp
- รองรับรูปภาพ:
  - แสดงรูปภาพเดี่ยว
  - แสดงหลายรูปแบบ Grid
  - คลิกเพื่อดูขนาดใหญ่
- Auto-scroll to bottom เมื่อมีข้อความใหม่

#### 2.3 Message Input
- Textarea แบบ auto-resize
- Character counter (0/1000)
- Keyboard shortcuts:
  - Enter: ส่งข้อความ
  - Shift+Enter: ขึ้นบรรทัดใหม่
- ปุ่มเพิ่มเติม (UI only):
  - แนบไฟล์
  - อิโมจิ
  - ส่งข้อความ

### 3. Tag Management

#### 3.1 Tag Modal
- เปิดผ่านปุ่ม "แท็ก" ใน Chat Header
- แสดงข้อมูล:
  - ชื่อผู้ใช้
  - แท็กปัจจุบัน (พร้อมปุ่มลบ)
  - Input สำหรับเพิ่มแท็กใหม่
  - แท็กที่ใช้บ่อย (quick add)

#### 3.2 Tag Display
- แสดงใน User List (สูงสุด 2 tags)
- แสดงใน Chat Header (สูงสุด 5 tags)
- สีแท็กสุ่มตามชื่อ (consistent)

#### 3.3 Tag Filters
- แสดงแท็กทั้งหมดในระบบ (สูงสุด 10)
- แสดงจำนวนการใช้งาน
- Toggle เพื่อกรอง

### 4. Purchase Status

#### 4.1 Toggle Purchase Status
- ปุ่มใน Chat Header
- เปลี่ยนสถานะ: ยังไม่ซื้อ ↔ เคยซื้อแล้ว
- แสดง Icon ใน User List
- เปลี่ยนสี Avatar เมื่อซื้อแล้ว

#### 4.2 Filter by Purchase Status
- กรองเฉพาะลูกค้าที่เคยซื้อ
- แสดงใน User List

### 5. AI Control

#### 5.1 Global AI Status
- ตั้งค่าผ่านหน้า Settings
- ควบคุม AI ทั้งระบบ

#### 5.2 Per-User AI Status
- Toggle AI สำหรับผู้ใช้แต่ละคน
- แสดงสถานะใน Chat Header
- บันทึกข้อความระบบลง Chat History

### 6. Follow-up Integration

#### 6.1 Follow-up Status Display
- แสดง Badge ใน User List
- แสดงข้อมูลใน Chat Header:
  - Follow-up Reason
  - Updated Time
- กรองเฉพาะผู้ใช้ที่ต้องติดตาม

#### 6.2 Follow-up Configuration
- ตั้งค่าผ่านหน้า Follow-up
- แสดง/ซ่อนสถานะใน Chat (configurable)

### 7. Image Support

#### 7.1 Image Display
- แสดงรูปภาพใน Chat History
- รองรับ Base64 และ URL
- Lazy loading
- Error handling

#### 7.2 Image Modal
- คลิกรูปเพื่อดูขนาดใหญ่
- ปุ่ม Download
- ปุ่ม Copy to Clipboard

### 8. Mobile Support

#### 8.1 Responsive Design
- Sidebar แบบ Overlay บน Mobile
- Toggle button สำหรับเปิด/ปิด Sidebar
- Touch-friendly UI
- Safe area support (iOS)

#### 8.2 Mobile Optimizations
- Prevent zoom on input focus
- Smooth scrolling
- Swipe gestures (planned)
- Optimized touch targets

### 9. Real-time Updates

#### 9.1 Socket.IO Integration
- เชื่อมต่อ Socket.IO เมื่อโหลดหน้า
- รับข้อความใหม่แบบ Real-time
- อัปเดต User List อัตโนมัติ
- แสดงสถานะการเชื่อมต่อ

#### 9.2 Auto-refresh
- รีเฟรช User List ทุก 30 วินาที
- ใช้ Smart Poller (หยุดเมื่อ tab ไม่ active)

---

## UI Components

### 1. Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ Navbar (partials/admin-navbar.ejs)                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────┬─────────────────────────────────┐ │
│ │                 │                                 │ │
│ │  User Sidebar   │      Chat Main Area            │ │
│ │                 │                                 │ │
│ │ ┌─────────────┐ │ ┌─────────────────────────────┐ │ │
│ │ │   Header    │ │ │      Chat Header            │ │ │
│ │ └─────────────┘ │ └─────────────────────────────┘ │ │
│ │                 │                                 │ │
│ │ ┌─────────────┐ │ ┌─────────────────────────────┐ │ │
│ │ │   Search    │ │ │                             │ │ │
│ │ │  & Filter   │ │ │   Messages Container        │ │ │
│ │ └─────────────┘ │ │                             │ │ │
│ │                 │ │                             │ │ │
│ │ ┌─────────────┐ │ └─────────────────────────────┘ │ │
│ │ │             │ │                                 │ │
│ │ │  User List  │ │ ┌─────────────────────────────┐ │ │
│ │ │             │ │ │    Message Input            │ │ │
│ │ │             │ │ └─────────────────────────────┘ │ │
│ │ └─────────────┘ │                                 │ │
│ └─────────────────┴─────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2. Component Breakdown

#### 2.1 User Sidebar
```html
<div class="user-sidebar">
  <!-- Header -->
  <div class="sidebar-header">
    <h4>แชท</h4>
    <div class="user-count">0</div>
  </div>
  
  <!-- Search & Filter -->
  <div class="sidebar-search">
    <input type="text" id="userSearch" placeholder="ค้นหาผู้ใช้...">
    <button id="filterToggle">
      <i class="fas fa-filter"></i>
      <span class="filter-active-badge"></span>
    </button>
    
    <!-- Filter Options (collapsible) -->
    <div class="filter-options">
      <!-- Status filters -->
      <button class="filter-btn active" data-filter="all">ทั้งหมด</button>
      <button class="filter-btn" data-filter="unread">ยังไม่อ่าน</button>
      <button class="filter-btn" data-filter="followup">ติดตาม</button>
      <button class="filter-btn" data-filter="purchased">เคยซื้อแล้ว</button>
      
      <!-- Tag filters -->
      <div id="tagFilters"></div>
    </div>
  </div>
  
  <!-- User List -->
  <div class="user-list" id="userList">
    <!-- User items will be rendered here -->
  </div>
</div>
```

#### 2.2 User Item
```html
<div class="user-item active unread purchased" onclick="chatManager.selectUser('userId')">
  <div class="user-item-content">
    <div class="user-avatar purchased-avatar">
      A
      <i class="fas fa-check-circle purchased-check"></i>
    </div>
    <div class="user-details">
      <div class="user-name">
        Display Name
        <i class="fas fa-shopping-cart text-success"></i>
        <span class="badge bg-success">AI</span>
        <span class="badge followup-badge">ติดตาม</span>
      </div>
      <div class="user-last-message">Last message text...</div>
      <div class="user-tags-row">
        <span class="badge bg-primary">Tag 1</span>
        <span class="badge bg-success">Tag 2</span>
      </div>
      <div class="user-timestamp">5 นาทีที่แล้ว</div>
    </div>
    <div class="unread-badge">3</div>
  </div>
</div>
```

#### 2.3 Chat Header
```html
<div class="chat-header">
  <div class="header-content">
    <div class="user-info">
      <div class="user-avatar">A</div>
      <div class="user-details">
        <h6>Display Name</h6>
        <small>10 ข้อความ • AI กำลังเปิด</small>
        <div class="user-tags">
          <span class="badge bg-primary">Tag 1</span>
        </div>
        <div class="followup-info">
          <span class="badge followup-badge">ติดตามลูกค้า</span>
          <small>ลูกค้ายืนยันสั่งซื้อแล้ว • อัปเดต 1 ชม.ที่แล้ว</small>
        </div>
      </div>
    </div>
    <div class="header-actions">
      <button onclick="chatManager.togglePurchaseStatus()">
        <i class="fas fa-shopping-cart"></i>เคยซื้อแล้ว
      </button>
      <button onclick="chatManager.openTagModal()">
        <i class="fas fa-tags"></i>แท็ก
      </button>
      <button id="toggleAiBtn">
        <i class="fas fa-toggle-on"></i>ปิด AI
      </button>
      <button onclick="chatManager.clearUserChat()">
        <i class="fas fa-trash"></i>ล้าง
      </button>
    </div>
  </div>
</div>
```

#### 2.4 Message
```html
<!-- User Message -->
<div class="message user">
  <div class="message-header">
    <i class="fas fa-user"></i>
    <span>ผู้ใช้</span>
  </div>
  <div class="message-content">
    <div class="message-text">Hello, I need help!</div>
    <!-- Or with image -->
    <div class="message-image">
      <img src="..." onclick="chatManager.openImageModal(this.src)">
    </div>
  </div>
  <div class="message-timestamp">5 นาทีที่แล้ว</div>
</div>

<!-- Assistant/Admin Message -->
<div class="message assistant">
  <div class="message-header">
    <i class="fas fa-user"></i>
    <span>AI Assistant</span>
  </div>
  <div class="message-content">
    <div class="message-text">How can I help you?</div>
  </div>
  <div class="message-timestamp">4 นาทีที่แล้ว</div>
</div>
```

#### 2.5 Message Input
```html
<div class="message-input-container">
  <div class="input-group">
    <button type="button" title="แนบไฟล์">
      <i class="fas fa-plus-circle"></i>
    </button>
    <textarea id="messageInput" placeholder="Aa" maxlength="1000" rows="1"></textarea>
    <button type="button" title="อิโมจิ">
      <i class="far fa-smile"></i>
    </button>
    <button id="sendButton" type="button" title="ส่ง">
      <i class="fas fa-paper-plane"></i>
    </button>
  </div>
  <div class="input-footer">
    <small><span id="charCount">0</span>/1000 ตัวอักษร</small>
    <small>Enter เพื่อส่ง • Shift+Enter เพื่อขึ้นบรรทัดใหม่</small>
  </div>
</div>
```

### 3. Modals

#### 3.1 Tag Modal
```html
<div class="modal" id="tagModal">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5><i class="fas fa-tags"></i>จัดการแท็ก</h5>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label>ผู้ใช้:</label>
          <div id="tagModalUserName"></div>
        </div>
        <div class="mb-3">
          <label>แท็กปัจจุบัน:</label>
          <div id="currentTags">
            <span class="badge tag-pill">
              Tag Name
              <i class="fas fa-times" onclick="chatManager.removeTag('Tag Name')"></i>
            </span>
          </div>
        </div>
        <div class="mb-3">
          <label>เพิ่มแท็กใหม่:</label>
          <div class="input-group">
            <input type="text" id="newTagInput" placeholder="พิมพ์ชื่อแท็ก...">
            <button id="addTagBtn"><i class="fas fa-plus"></i>เพิ่ม</button>
          </div>
        </div>
        <div class="mb-3">
          <label>แท็กที่ใช้บ่อย:</label>
          <div id="popularTags">
            <button onclick="chatManager.quickAddTag('VIP')">
              <i class="fas fa-plus-circle"></i>VIP
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

#### 3.2 Image Modal
```html
<div class="modal" id="imageModal">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5>รูปภาพ</h5>
      </div>
      <div class="modal-body text-center">
        <img id="modalImage" src="" class="img-fluid">
      </div>
      <div class="modal-footer">
        <button id="downloadImage">
          <i class="fas fa-download"></i>ดาวน์โหลด
        </button>
        <button id="copyImage">
          <i class="fas fa-copy"></i>คัดลอก
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## API Endpoints

### 1. Chat Users

#### GET `/admin/chat/users`
ดึงรายชื่อผู้ใช้ที่เคยแชท

**Response:**
```javascript
{
  success: true,
  users: [
    {
      userId: "U1234567890abcdef",
      displayName: "John Doe",
      lastMessage: "Hello, I need help!",
      lastTimestamp: "2025-10-25T10:30:00.000Z",
      unreadCount: 3,
      messageCount: 10,
      platform: "line",
      botId: "507f1f77bcf86cd799439011",
      aiEnabled: true,
      hasFollowUp: true,
      followUpReason: "ลูกค้ายืนยันสั่งซื้อแล้ว",
      followUpUpdatedAt: "2025-10-25T09:00:00.000Z",
      hasPurchased: false,
      tags: ["VIP", "สนใจสินค้า A"]
    }
  ]
}
```

### 2. Chat History

#### GET `/admin/chat/history/:userId`
ดึงประวัติการสนทนาของผู้ใช้

**Response:**
```javascript
{
  success: true,
  messages: [
    {
      _id: "507f1f77bcf86cd799439011",
      senderId: "U1234567890abcdef",
      role: "user",
      content: "Hello!",
      displayContent: "<div class=\"message-text\">Hello!</div>",
      timestamp: "2025-10-25T10:00:00.000Z",
      platform: "line",
      botId: "507f1f77bcf86cd799439011",
      source: "webhook"
    },
    {
      _id: "507f1f77bcf86cd799439012",
      senderId: "U1234567890abcdef",
      role: "assistant",
      content: "Hi! How can I help you?",
      displayContent: "<div class=\"message-text\">Hi! How can I help you?</div>",
      timestamp: "2025-10-25T10:00:05.000Z",
      platform: "line",
      botId: "507f1f77bcf86cd799439011",
      source: "webhook"
    }
  ]
}
```

### 3. Send Message

#### POST `/admin/chat/send`
ส่งข้อความจาก Admin

**Request:**
```javascript
{
  userId: "U1234567890abcdef",
  message: "Thank you for contacting us!"
}
```

**Response:**
```javascript
{
  success: true,
  control: false,              // true ถ้าเป็นคำสั่งควบคุม
  skipEcho: false,             // true ถ้าไม่ต้อง echo ฝั่ง client
  displayMessage: null         // ข้อความแสดงผล (สำหรับคำสั่งควบคุม)
}
```

### 4. Clear Chat

#### DELETE `/admin/chat/clear/:userId`
ล้างประวัติการสนทนา

**Response:**
```javascript
{
  success: true
}
```

### 5. User Status

#### GET `/admin/chat/user-status/:userId`
ดึงสถานะ AI ของผู้ใช้

**Response:**
```javascript
{
  success: true,
  aiEnabled: true,
  updatedAt: "2025-10-25T10:00:00.000Z"
}
```

#### POST `/admin/chat/user-status`
ตั้งค่าสถานะ AI ของผู้ใช้

**Request:**
```javascript
{
  userId: "U1234567890abcdef",
  aiEnabled: false
}
```

**Response:**
```javascript
{
  success: true,
  aiEnabled: false
}
```

### 6. Tags Management

#### GET `/admin/chat/tags/:userId`
ดึงแท็กของผู้ใช้

**Response:**
```javascript
{
  success: true,
  tags: ["VIP", "สนใจสินค้า A"]
}
```

#### POST `/admin/chat/tags/:userId`
ตั้งค่าแท็กของผู้ใช้

**Request:**
```javascript
{
  tags: ["VIP", "สนใจสินค้า A", "ลูกค้าประจำ"]
}
```

**Response:**
```javascript
{
  success: true,
  tags: ["VIP", "สนใจสินค้า A", "ลูกค้าประจำ"]
}
```

#### GET `/admin/chat/available-tags`
ดึงแท็กทั้งหมดในระบบ

**Response:**
```javascript
{
  success: true,
  tags: [
    { tag: "VIP", count: 15 },
    { tag: "สนใจสินค้า A", count: 8 },
    { tag: "ลูกค้าประจำ", count: 5 }
  ]
}
```

### 7. Purchase Status

#### POST `/admin/chat/purchase-status/:userId`
Toggle สถานะการซื้อ

**Request:**
```javascript
{
  hasPurchased: true
}
```

**Response:**
```javascript
{
  success: true
}
```

### 8. Unread Count

#### GET `/admin/chat/unread-count`
ดึงจำนวนข้อความที่ยังไม่อ่านทั้งหมด

**Response:**
```javascript
{
  success: true,
  totalUnread: 25
}
```

---

## Data Models

### 1. User Object (Frontend)

```javascript
{
  userId: String,              // LINE userId หรือ Facebook PSID
  displayName: String,         // ชื่อที่แสดง
  lastMessage: String,         // ข้อความล่าสุด (text only, 50 chars)
  lastTimestamp: String,       // ISO 8601 timestamp
  unreadCount: Number,         // จำนวนข้อความที่ยังไม่อ่าน
  messageCount: Number,        // จำนวนข้อความทั้งหมด
  platform: String,            // "line" | "facebook"
  botId: String,               // Bot/Page ID
  aiEnabled: Boolean,          // สถานะ AI
  hasFollowUp: Boolean,        // ต้องติดตามหรือไม่
  followUpReason: String,      // เหตุผลที่ต้องติดตาม
  followUpUpdatedAt: String,   // เวลาที่อัปเดตสถานะติดตาม
  hasPurchased: Boolean,       // เคยซื้อหรือไม่
  tags: [String],              // แท็ก
  followUp: {                  // ข้อมูล follow-up (optional)
    showInChat: Boolean
  }
}
```

### 2. Message Object (Frontend)

```javascript
{
  _id: String,                 // Message ID
  senderId: String,            // User ID
  role: String,                // "user" | "assistant"
  content: String | Object,    // ข้อความหรือ JSON
  displayContent: String,      // HTML สำหรับแสดงผล (from backend)
  timestamp: String,           // ISO 8601 timestamp
  platform: String,            // "line" | "facebook"
  botId: String,               // Bot/Page ID
  source: String               // "webhook" | "comment_pull" | "admin_chat"
}
```

### 3. ChatManager State

```javascript
{
  socket: Socket,              // Socket.IO instance
  currentUserId: String,       // User ID ที่เลือกอยู่
  users: [User],               // รายชื่อผู้ใช้ (หลังกรอง)
  allUsers: [User],            // รายชื่อผู้ใช้ทั้งหมด (ก่อนกรอง)
  chatHistory: {               // ประวัติการสนทนา (cache)
    [userId]: [Message]
  },
  isLoading: Boolean,          // กำลังโหลดหรือไม่
  availableTags: [             // แท็กทั้งหมดในระบบ
    { tag: String, count: Number }
  ],
  currentFilters: {            // Filters ปัจจุบัน
    status: String,            // "all" | "unread" | "followup" | "purchased"
    tags: [String],            // แท็กที่เลือก
    search: String             // คำค้นหา
  },
  followUpOptions: {           // ตั้งค่า follow-up
    analysisEnabled: Boolean,
    showInChat: Boolean
  }
}
```

---

## Socket.IO Events

### 1. Connection Events

```javascript
// เชื่อมต่อสำเร็จ
socket.on('connect', () => {
  console.log('เชื่อมต่อ Socket.IO สำเร็จ');
  window.showSuccess('เชื่อมต่อสำเร็จ');
});

// การเชื่อมต่อถูกตัด
socket.on('disconnect', () => {
  console.log('การเชื่อมต่อ Socket.IO ถูกตัด');
  window.showWarning('การเชื่อมต่อถูกตัด');
});
```

### 2. Message Events

```javascript
// ข้อความใหม่
socket.on('newMessage', (data) => {
  // data: { userId, message, sender, timestamp }
  chatManager.handleNewMessage(data);
});
```

**Handler:**
```javascript
handleNewMessage(data) {
  // อัปเดต unread count
  const user = this.users.find(u => u.userId === data.userId);
  if (user && data.sender === 'user') {
    user.unreadCount = (user.unreadCount || 0) + 1;
  }
  
  // อัปเดต last message
  user.lastMessage = this.normalizeContentToPreview(data.message?.content);
  user.lastTimestamp = data.timestamp;
  
  // Re-render user list
  this.renderUserList();
  
  // ถ้าเป็นผู้ใช้ที่เลือกอยู่ อัปเดต chat history
  if (data.userId === this.currentUserId) {
    this.chatHistory[this.currentUserId].push(data.message);
    this.renderChatHistory(this.currentUserId);
  }
}
```

### 3. Follow-up Events

```javascript
// สถานะติดตามอัปเดต
socket.on('followUpTagged', (data) => {
  // data: { userId, hasFollowUp, followUpReason, followUpUpdatedAt }
  chatManager.handleFollowUpTagged(data);
});
```

**Handler:**
```javascript
handleFollowUpTagged(data) {
  const user = this.users.find(u => u.userId === data.userId);
  if (user) {
    user.hasFollowUp = data.hasFollowUp;
    user.followUpReason = data.followUpReason;
    user.followUpUpdatedAt = data.followUpUpdatedAt;
    this.renderUserList();
    
    // อัปเดต chat header ถ้าเป็นผู้ใช้ที่เลือกอยู่
    if (this.currentUserId === data.userId) {
      this.updateChatHeader(user);
    }
  }
}
```

### 4. User Status Events

```javascript
// แท็กอัปเดต
socket.on('userTagsUpdated', (data) => {
  // data: { userId, tags }
  const user = this.allUsers.find(u => u.userId === data.userId);
  if (user) {
    user.tags = data.tags || [];
    this.applyFilters();
  }
});

// สถานะการซื้ออัปเดต
socket.on('userPurchaseStatusUpdated', (data) => {
  // data: { userId, hasPurchased }
  const user = this.allUsers.find(u => u.userId === data.userId);
  if (user) {
    user.hasPurchased = data.hasPurchased;
    this.applyFilters();
  }
});
```

### 5. Chat Cleared Event

```javascript
// แชทถูกล้าง
socket.on('chatCleared', (data) => {
  // data: { userId }
  if (data.userId === this.currentUserId) {
    this.clearChatDisplay();
  }
  this.loadUsers();
});
```

---

## State Management

### 1. Initialization Flow

```javascript
// 1. สร้าง ChatManager instance
const chatManager = new ChatManager();

// 2. Initialize
init() {
  this.setupViewportHeightObserver();
  this.initializeSocket();
  this.setupEventListeners();
  this.setupFilterListeners();
  this.setupTagModalListeners();
  this.loadUsers();
  this.loadAvailableTags();
  this.setupAutoRefresh();
}
```

### 2. User Selection Flow

```javascript
// 1. User clicks on user item
selectUser(userId) {
  // ตั้งค่า current user
  this.currentUserId = userId;
  
  // อัปเดต UI (active state)
  // ...
  
  // ปิด sidebar บน mobile
  if (isMobile) {
    this.closeSidebarForMobile();
  }
  
  // ดึงสถานะ AI ล่าสุด
  const status = await fetch(`/admin/chat/user-status/${userId}`);
  
  // อัปเดต chat header
  this.updateChatHeader(user);
  
  // แสดง message input
  document.getElementById('messageInputContainer').style.display = 'block';
  
  // โหลด chat history
  await this.loadChatHistory(userId);
}
```

### 3. Message Sending Flow

```javascript
// 1. User types message and presses Enter
sendMessage() {
  const messageText = messageInput.value.trim();
  if (!messageText || !this.currentUserId) return;
  
  // 2. ส่งไปยัง API
  const response = await fetch('/admin/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: this.currentUserId,
      message: messageText
    })
  });
  
  const data = await response.json();
  
  // 3. ถ้าเป็นคำสั่งควบคุม ให้ข้ามการ echo
  if (data.skipEcho) {
    messageInput.value = '';
    this.loadUsers();
    return;
  }
  
  // 4. เพิ่มข้อความลง chat history (local)
  const newMessage = {
    content: messageText,
    role: 'assistant',
    timestamp: new Date(),
    source: 'admin_chat'
  };
  this.chatHistory[this.currentUserId].push(newMessage);
  
  // 5. Re-render chat
  this.renderChatHistory(this.currentUserId);
  
  // 6. Clear input
  messageInput.value = '';
  
  // 7. Reload user list (อัปเดต last message)
  this.loadUsers();
}
```

### 4. Filter Flow

```javascript
// 1. User selects filter
applyFilters() {
  let filtered = [...this.allUsers];
  
  // 2. Apply search filter
  if (this.currentFilters.search) {
    filtered = filtered.filter(user => {
      const name = user.displayName.toLowerCase();
      const userId = user.userId.toLowerCase();
      const search = this.currentFilters.search.toLowerCase();
      return name.includes(search) || userId.includes(search);
    });
  }
  
  // 3. Apply status filter
  if (this.currentFilters.status === 'unread') {
    filtered = filtered.filter(user => user.unreadCount > 0);
  } else if (this.currentFilters.status === 'followup') {
    filtered = filtered.filter(user => user.hasFollowUp);
  } else if (this.currentFilters.status === 'purchased') {
    filtered = filtered.filter(user => user.hasPurchased);
  }
  
  // 4. Apply tag filters (OR logic)
  if (this.currentFilters.tags.length > 0) {
    filtered = filtered.filter(user => {
      if (!user.tags || user.tags.length === 0) return false;
      return this.currentFilters.tags.some(tag => user.tags.includes(tag));
    });
  }
  
  // 5. Update state
  this.users = filtered;
  
  // 6. Re-render
  this.renderUserList();
  this.updateUserCount();
  this.updateFilterBadge();
}
```

---

## Performance Optimization

### 1. Current Optimizations

#### 1.1 Debounced Search
```javascript
this.debouncedSearch = this.debounce(this.performSearch.bind(this), 300);
```

#### 1.2 Optimized Fetch (with cache)
```javascript
this.optimizedFetch = new window.performanceUtils.OptimizedFetch();
const data = await this.optimizedFetch.fetch('/admin/chat/users');
```

#### 1.3 Lazy Image Loading
```javascript
this.lazyLoader = new window.performanceUtils.LazyImageLoader();
```

#### 1.4 Smart Poller (stops when tab inactive)
```javascript
this.smartPoller = new window.performanceUtils.SmartPoller(
  () => this.loadUsers(),
  30000 // 30 seconds
);
this.smartPoller.start();
```

#### 1.5 Skeleton Loading
```javascript
userList.innerHTML = LoadingStateManager.createSkeleton('userItem', 5);
```

### 2. Planned Optimizations

#### 2.1 Virtual Scrolling
- แสดงเฉพาะ items ที่อยู่ใน viewport
- ลด DOM nodes
- เพิ่มประสิทธิภาพสำหรับ user list ขนาดใหญ่

#### 2.2 Message Pagination
- โหลดข้อความเก่าเมื่อ scroll ถึงด้านบน
- ลดเวลาโหลดเริ่มต้น
- ลด memory usage

#### 2.3 Infinite Scroll
- โหลด users เพิ่มเติมเมื่อ scroll ถึงด้านล่าง
- รองรับ user list ขนาดใหญ่

#### 2.4 WebWorker
- ประมวลผล heavy operations ใน background
- ไม่ block UI thread

---

## Proposed Improvements

### 1. Quick Replies & Templates

#### 1.1 Quick Reply Buttons
- แสดงปุ่มข้อความตอบกลับด่วนเหนือ message input
- คลิกเพื่อแทรกข้อความ
- จัดการ templates ผ่าน modal

#### 1.2 Template Management
- CRUD templates
- จัดหมวดหมู่
- Search templates
- Keyboard shortcuts

**UI Mockup:**
```html
<div class="quick-replies-bar">
  <button class="quick-reply-btn" onclick="insertTemplate('สวัสดีครับ')">
    สวัสดีครับ
  </button>
  <button class="quick-reply-btn" onclick="insertTemplate('ขอบคุณครับ')">
    ขอบคุณครับ
  </button>
  <button class="quick-reply-btn" onclick="openTemplateModal()">
    <i class="fas fa-plus"></i> เพิ่ม
  </button>
</div>
```

### 2. Advanced Search

#### 2.1 Search in Chat History
- ค้นหาข้อความในประวัติการสนทนา
- Highlight ผลลัพธ์
- Jump to message

**UI Mockup:**
```html
<div class="chat-search-bar">
  <input type="text" placeholder="ค้นหาในการสนทนา...">
  <button><i class="fas fa-search"></i></button>
  <div class="search-results">
    <div class="search-result-item" onclick="jumpToMessage('msgId')">
      <div class="result-preview">...found text...</div>
      <div class="result-timestamp">5 นาทีที่แล้ว</div>
    </div>
  </div>
</div>
```

### 3. Typing Indicator

#### 3.1 Show When User is Typing
- แสดง "กำลังพิมพ์..." เมื่อผู้ใช้กำลังพิมพ์
- ใช้ Socket.IO event

**UI Mockup:**
```html
<div class="typing-indicator">
  <div class="typing-dot"></div>
  <div class="typing-dot"></div>
  <div class="typing-dot"></div>
  <span>กำลังพิมพ์...</span>
</div>
```

### 4. Read Receipts

#### 4.1 Show Read Status
- แสดงว่าผู้ใช้อ่านข้อความแล้วหรือยัง
- แสดง checkmark สองอัน (✓✓)

**UI Mockup:**
```html
<div class="message-timestamp">
  4 นาทีที่แล้ว
  <i class="fas fa-check-double read-receipt"></i>
</div>
```

### 5. Voice Messages

#### 5.1 Record & Send Voice
- ปุ่มบันทึกเสียง
- แสดง waveform
- เล่นเสียงใน chat

**UI Mockup:**
```html
<button class="voice-record-btn" onclick="startRecording()">
  <i class="fas fa-microphone"></i>
</button>

<div class="voice-message">
  <button class="play-btn"><i class="fas fa-play"></i></button>
  <div class="waveform"></div>
  <span class="duration">0:15</span>
</div>
```

### 6. Message Forwarding

#### 6.1 Forward Message to Another User
- เลือกข้อความที่ต้องการส่งต่อ
- เลือกผู้รับ
- ส่งข้อความ

**UI Mockup:**
```html
<button class="message-action-btn" onclick="forwardMessage(msgId)">
  <i class="fas fa-share"></i> ส่งต่อ
</button>

<div class="forward-modal">
  <h5>ส่งต่อข้อความไปยัง</h5>
  <input type="text" placeholder="ค้นหาผู้ใช้...">
  <div class="user-select-list">
    <!-- User items -->
  </div>
</div>
```

### 7. Chat Assignment

#### 7.1 Assign Chat to Admin
- มอบหมายแชทให้ Admin คนอื่น
- แสดงว่าใครรับผิดชอบแชทนี้

**UI Mockup:**
```html
<div class="chat-assignment">
  <label>ผู้รับผิดชอบ:</label>
  <select onchange="assignChat(userId, this.value)">
    <option value="">ไม่ระบุ</option>
    <option value="admin1">Admin 1</option>
    <option value="admin2">Admin 2</option>
  </select>
</div>
```

### 8. Canned Responses

#### 8.1 Pre-defined Responses
- คำตอบสำเร็จรูปสำหรับคำถามที่พบบ่อย
- Shortcut: `/` + keyword

**UI Mockup:**
```html
<div class="canned-responses-dropdown">
  <div class="canned-response-item" onclick="insertResponse('สวัสดีครับ...')">
    <div class="response-title">ทักทาย</div>
    <div class="response-preview">สวัสดีครับ ยินดีต้อนรับ...</div>
  </div>
</div>
```

### 9. Chat Statistics

#### 9.1 Per-User Statistics
- จำนวนข้อความทั้งหมด
- เวลาตอบกลับเฉลี่ย
- จำนวนครั้งที่แชท
- ช่วงเวลาที่แชทบ่อย

**UI Mockup:**
```html
<div class="chat-statistics-panel">
  <h6>สถิติการแชท</h6>
  <div class="stat-item">
    <span class="stat-label">จำนวนข้อความ:</span>
    <span class="stat-value">150</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">เวลาตอบกลับเฉลี่ย:</span>
    <span class="stat-value">2 นาที</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">แชทครั้งแรก:</span>
    <span class="stat-value">15 ต.ค. 2025</span>
  </div>
</div>
```

### 10. Export Chat

#### 10.1 Export Conversation
- ส่งออกเป็น PDF
- ส่งออกเป็น Text
- ส่งออกเป็น JSON

**UI Mockup:**
```html
<button class="export-chat-btn" onclick="exportChat(userId)">
  <i class="fas fa-download"></i> ส่งออกการสนทนา
</button>

<div class="export-options-modal">
  <h5>ส่งออกการสนทนา</h5>
  <button onclick="exportAs('pdf')">
    <i class="fas fa-file-pdf"></i> PDF
  </button>
  <button onclick="exportAs('txt')">
    <i class="fas fa-file-alt"></i> Text
  </button>
  <button onclick="exportAs('json')">
    <i class="fas fa-file-code"></i> JSON
  </button>
</div>
```

### 11. Message Pinning

#### 11.1 Pin Important Messages
- ปักหมุดข้อความสำคัญ
- แสดงที่ด้านบนของ chat

**UI Mockup:**
```html
<div class="pinned-messages-bar">
  <div class="pinned-message">
    <i class="fas fa-thumbtack"></i>
    <span>ที่อยู่จัดส่ง: 123 ถนน...</span>
    <button onclick="unpinMessage(msgId)">
      <i class="fas fa-times"></i>
    </button>
  </div>
</div>
```

### 12. User Activity Timeline

#### 12.1 Timeline of User Actions
- แสดง timeline กิจกรรมของลูกค้า
- เช่น: แชทครั้งแรก, ซื้อสินค้า, ติดตาม, etc.

**UI Mockup:**
```html
<div class="user-activity-timeline">
  <h6>กิจกรรมของลูกค้า</h6>
  <div class="timeline-item">
    <div class="timeline-icon bg-success">
      <i class="fas fa-shopping-cart"></i>
    </div>
    <div class="timeline-content">
      <div class="timeline-title">ซื้อสินค้า</div>
      <div class="timeline-time">2 วันที่แล้ว</div>
    </div>
  </div>
  <div class="timeline-item">
    <div class="timeline-icon bg-primary">
      <i class="fas fa-comments"></i>
    </div>
    <div class="timeline-content">
      <div class="timeline-title">แชทครั้งแรก</div>
      <div class="timeline-time">5 วันที่แล้ว</div>
    </div>
  </div>
</div>
```

### 13. Smart Filters

#### 13.1 Advanced Filtering
- กรองตามช่วงเวลา
- กรองตามคีย์เวิร์ด
- บันทึก filters ที่ใช้บ่อย

**UI Mockup:**
```html
<div class="smart-filters">
  <button onclick="filterByTime('today')">วันนี้</button>
  <button onclick="filterByTime('week')">สัปดาห์นี้</button>
  <button onclick="filterByTime('month')">เดือนนี้</button>
  <button onclick="openAdvancedFilters()">
    <i class="fas fa-sliders-h"></i> ขั้นสูง
  </button>
</div>
```

### 14. Keyboard Shortcuts

#### 14.1 Shortcuts for Common Actions
- `Ctrl/Cmd + K`: ค้นหาผู้ใช้
- `Ctrl/Cmd + /`: แสดง shortcuts
- `Esc`: ปิด modal/sidebar
- `↑/↓`: เลือกผู้ใช้
- `Enter`: เปิดแชท

**UI Mockup:**
```html
<div class="keyboard-shortcuts-modal">
  <h5>คีย์ลัด</h5>
  <div class="shortcut-item">
    <kbd>Ctrl</kbd> + <kbd>K</kbd>
    <span>ค้นหาผู้ใช้</span>
  </div>
  <div class="shortcut-item">
    <kbd>Esc</kbd>
    <span>ปิด modal</span>
  </div>
</div>
```

---

## Implementation Priority

### Phase 1 (High Priority)
1. ✅ Quick Replies & Templates
2. ✅ Advanced Search in Chat History
3. ✅ Typing Indicator
4. ✅ Read Receipts

### Phase 2 (Medium Priority)
5. ✅ Message Forwarding
6. ✅ Chat Assignment
7. ✅ Canned Responses
8. ✅ Chat Statistics

### Phase 3 (Low Priority)
9. ✅ Export Chat
10. ✅ Message Pinning
11. ✅ User Activity Timeline
12. ✅ Smart Filters
13. ✅ Keyboard Shortcuts
14. ⏳ Voice Messages (requires backend support)

### Not Included (Out of Scope)
- ❌ Message Reactions
- ❌ File Attachments (PDF, DOCX)
- ❌ Bulk Actions
- ❌ User Notes

---

**เวอร์ชัน:** 2.0.0  
**อัพเดทล่าสุด:** ตุลาคม 2025  
**สถานะ:** In Development

