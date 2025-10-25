# API Documentation - Chat System

## 📋 สารบัญ

1. [ภาพรวม](#ภาพรวม)
2. [Authentication](#authentication)
3. [User Management APIs](#user-management-apis)
4. [Chat APIs](#chat-apis)
5. [Tag Management APIs](#tag-management-apis)
6. [Quick Reply APIs](#quick-reply-apis)
7. [Statistics APIs](#statistics-apis)
8. [Socket.IO Events](#socketio-events)
9. [Error Handling](#error-handling)

---

## ภาพรวม

Base URL: `http://localhost:3000` (หรือ domain ของคุณ)

**Response Format:**
```json
{
    "success": true,
    "data": {},
    "message": "Success message"
}
```

**Error Response Format:**
```json
{
    "success": false,
    "error": "Error message",
    "code": "ERROR_CODE"
}
```

---

## Authentication

ทุก API endpoint ต้องการ Authentication ผ่าน Session หรือ JWT Token

**Headers:**
```
Cookie: connect.sid=<session_id>
```

หรือ

```
Authorization: Bearer <jwt_token>
```

---

## User Management APIs

### 1. Get All Users

ดึงรายชื่อผู้ใช้ทั้งหมดที่เคยแชท

**Endpoint:** `GET /admin/chat/users`

**Query Parameters:**
- `status` (optional): `all`, `unread`, `followup`, `purchased`
- `tags` (optional): comma-separated tags, e.g., `VIP,ลูกค้าใหม่`
- `search` (optional): ค้นหาตามชื่อหรือ User ID

**Request Example:**
```bash
curl -X GET "http://localhost:3000/admin/chat/users?status=unread&tags=VIP" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "users": [
        {
            "userId": "user123",
            "displayName": "สมชาย ใจดี",
            "lastMessage": "สวัสดีครับ",
            "lastMessageTime": "2024-10-25T10:30:00.000Z",
            "unreadCount": 3,
            "aiEnabled": true,
            "hasPurchased": false,
            "tags": ["VIP", "ลูกค้าใหม่"],
            "followUp": {
                "isFollowUp": false,
                "reason": null,
                "updatedAt": null
            }
        }
    ],
    "total": 1
}
```

### 2. Get User Status

ดึงสถานะ AI ของผู้ใช้

**Endpoint:** `GET /admin/chat/user-status/:userId`

**Request Example:**
```bash
curl -X GET "http://localhost:3000/admin/chat/user-status/user123" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "aiEnabled": true
}
```

### 3. Update User Status

อัปเดตสถานะ AI ของผู้ใช้

**Endpoint:** `POST /admin/chat/user-status`

**Request Body:**
```json
{
    "userId": "user123",
    "aiEnabled": false
}
```

**Request Example:**
```bash
curl -X POST "http://localhost:3000/admin/chat/user-status" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<session_id>" \
  -d '{"userId":"user123","aiEnabled":false}'
```

**Response:**
```json
{
    "success": true,
    "message": "อัปเดตสถานะ AI สำเร็จ"
}
```

### 4. Update Purchase Status

อัปเดตสถานะการซื้อของผู้ใช้

**Endpoint:** `POST /admin/chat/purchase-status`

**Request Body:**
```json
{
    "userId": "user123",
    "hasPurchased": true
}
```

**Request Example:**
```bash
curl -X POST "http://localhost:3000/admin/chat/purchase-status" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<session_id>" \
  -d '{"userId":"user123","hasPurchased":true}'
```

**Response:**
```json
{
    "success": true,
    "message": "อัปเดตสถานะการซื้อสำเร็จ"
}
```

---

## Chat APIs

### 1. Get Chat History

ดึงประวัติการสนทนาของผู้ใช้

**Endpoint:** `GET /admin/chat/history/:userId`

**Query Parameters:**
- `limit` (optional): จำนวนข้อความที่ต้องการ (default: 100)
- `before` (optional): ดึงข้อความก่อนหน้า timestamp นี้

**Request Example:**
```bash
curl -X GET "http://localhost:3000/admin/chat/history/user123?limit=50" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "messages": [
        {
            "id": "msg123",
            "role": "user",
            "content": "สวัสดีครับ",
            "images": [],
            "timestamp": "2024-10-25T10:30:00.000Z"
        },
        {
            "id": "msg124",
            "role": "assistant",
            "content": "สวัสดีครับ มีอะไรให้ช่วยไหมครับ",
            "images": [],
            "timestamp": "2024-10-25T10:30:05.000Z"
        },
        {
            "id": "msg125",
            "role": "admin",
            "content": "ขอบคุณที่ติดต่อเราครับ",
            "images": [],
            "timestamp": "2024-10-25T10:31:00.000Z"
        }
    ],
    "total": 3,
    "hasMore": false
}
```

### 2. Send Message

ส่งข้อความถึงผู้ใช้

**Endpoint:** `POST /admin/chat/send`

**Request Body:**
```json
{
    "userId": "user123",
    "message": "ขอบคุณที่ติดต่อเราครับ",
    "images": []
}
```

**Request Example:**
```bash
curl -X POST "http://localhost:3000/admin/chat/send" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<session_id>" \
  -d '{"userId":"user123","message":"ขอบคุณที่ติดต่อเราครับ"}'
```

**Response:**
```json
{
    "success": true,
    "message": {
        "id": "msg126",
        "role": "admin",
        "content": "ขอบคุณที่ติดต่อเราครับ",
        "images": [],
        "timestamp": "2024-10-25T10:32:00.000Z"
    }
}
```

### 3. Clear Chat History

ล้างประวัติการสนทนาของผู้ใช้

**Endpoint:** `POST /admin/chat/clear/:userId`

**Request Example:**
```bash
curl -X POST "http://localhost:3000/admin/chat/clear/user123" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "message": "ล้างประวัติการสนทนาสำเร็จ"
}
```

### 4. Mark as Read

ทำเครื่องหมายข้อความว่าอ่านแล้ว

**Endpoint:** `POST /admin/chat/mark-read/:userId`

**Request Example:**
```bash
curl -X POST "http://localhost:3000/admin/chat/mark-read/user123" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "message": "ทำเครื่องหมายว่าอ่านแล้ว"
}
```

---

## Tag Management APIs

### 1. Get All Tags

ดึงแท็กทั้งหมดในระบบ

**Endpoint:** `GET /admin/chat/tags`

**Request Example:**
```bash
curl -X GET "http://localhost:3000/admin/chat/tags" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "tags": [
        {
            "name": "VIP",
            "count": 15,
            "color": "#0084ff"
        },
        {
            "name": "ลูกค้าใหม่",
            "count": 23,
            "color": "#28a745"
        }
    ]
}
```

### 2. Update User Tags

อัปเดตแท็กของผู้ใช้

**Endpoint:** `POST /admin/chat/tags`

**Request Body:**
```json
{
    "userId": "user123",
    "tags": ["VIP", "ลูกค้าใหม่", "สนใจสินค้า A"]
}
```

**Request Example:**
```bash
curl -X POST "http://localhost:3000/admin/chat/tags" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<session_id>" \
  -d '{"userId":"user123","tags":["VIP","ลูกค้าใหม่"]}'
```

**Response:**
```json
{
    "success": true,
    "message": "อัปเดตแท็กสำเร็จ",
    "tags": ["VIP", "ลูกค้าใหม่"]
}
```

---

## Quick Reply APIs

### 1. Get Quick Replies

ดึง Quick Replies ทั้งหมด

**Endpoint:** `GET /admin/chat/quick-replies`

**Request Example:**
```bash
curl -X GET "http://localhost:3000/admin/chat/quick-replies" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "replies": [
        {
            "id": "qr123",
            "title": "ขอบคุณ",
            "content": "ขอบคุณที่ติดต่อเราครับ",
            "createdAt": "2024-10-25T10:00:00.000Z"
        },
        {
            "id": "qr124",
            "title": "สอบถามข้อมูล",
            "content": "ขอสอบถามข้อมูลเพิ่มเติมหน่อยได้ไหมครับ",
            "createdAt": "2024-10-25T10:05:00.000Z"
        }
    ]
}
```

### 2. Create Quick Reply

สร้าง Quick Reply ใหม่

**Endpoint:** `POST /admin/chat/quick-reply`

**Request Body:**
```json
{
    "title": "ขอบคุณ",
    "content": "ขอบคุณที่ติดต่อเราครับ"
}
```

**Request Example:**
```bash
curl -X POST "http://localhost:3000/admin/chat/quick-reply" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<session_id>" \
  -d '{"title":"ขอบคุณ","content":"ขอบคุณที่ติดต่อเราครับ"}'
```

**Response:**
```json
{
    "success": true,
    "reply": {
        "id": "qr125",
        "title": "ขอบคุณ",
        "content": "ขอบคุณที่ติดต่อเราครับ",
        "createdAt": "2024-10-25T10:35:00.000Z"
    }
}
```

### 3. Update Quick Reply

อัปเดต Quick Reply

**Endpoint:** `PUT /admin/chat/quick-reply/:id`

**Request Body:**
```json
{
    "title": "ขอบคุณมาก",
    "content": "ขอบคุณมากที่ติดต่อเราครับ"
}
```

**Request Example:**
```bash
curl -X PUT "http://localhost:3000/admin/chat/quick-reply/qr125" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<session_id>" \
  -d '{"title":"ขอบคุณมาก","content":"ขอบคุณมากที่ติดต่อเราครับ"}'
```

**Response:**
```json
{
    "success": true,
    "message": "อัปเดต Quick Reply สำเร็จ"
}
```

### 4. Delete Quick Reply

ลบ Quick Reply

**Endpoint:** `DELETE /admin/chat/quick-reply/:id`

**Request Example:**
```bash
curl -X DELETE "http://localhost:3000/admin/chat/quick-reply/qr125" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "message": "ลบ Quick Reply สำเร็จ"
}
```

---

## Statistics APIs

### 1. Get User Statistics

ดึงสถิติการสนทนาของผู้ใช้

**Endpoint:** `GET /admin/chat/statistics/:userId`

**Request Example:**
```bash
curl -X GET "http://localhost:3000/admin/chat/statistics/user123" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "statistics": {
        "totalMessages": 150,
        "userMessages": 75,
        "assistantMessages": 60,
        "adminMessages": 15,
        "firstMessageAt": "2024-10-01T10:00:00.000Z",
        "lastMessageAt": "2024-10-25T10:30:00.000Z",
        "averageResponseTime": 120,
        "tags": ["VIP", "ลูกค้าใหม่"],
        "hasPurchased": true
    }
}
```

### 2. Get Overall Statistics

ดึงสถิติรวมของระบบ

**Endpoint:** `GET /admin/chat/statistics`

**Query Parameters:**
- `startDate` (optional): วันที่เริ่มต้น (ISO 8601)
- `endDate` (optional): วันที่สิ้นสุด (ISO 8601)

**Request Example:**
```bash
curl -X GET "http://localhost:3000/admin/chat/statistics?startDate=2024-10-01&endDate=2024-10-31" \
  -H "Cookie: connect.sid=<session_id>"
```

**Response:**
```json
{
    "success": true,
    "statistics": {
        "totalUsers": 500,
        "totalMessages": 15000,
        "activeUsers": 250,
        "purchasedUsers": 75,
        "averageMessagesPerUser": 30,
        "averageResponseTime": 150,
        "topTags": [
            { "name": "VIP", "count": 50 },
            { "name": "ลูกค้าใหม่", "count": 100 }
        ]
    }
}
```

---

## Socket.IO Events

### Client → Server

ไม่มี (ใช้ HTTP API แทน)

### Server → Client

#### 1. newMessage

ส่งเมื่อมีข้อความใหม่

**Event Name:** `newMessage`

**Payload:**
```json
{
    "userId": "user123",
    "message": {
        "id": "msg126",
        "role": "user",
        "content": "สวัสดีครับ",
        "images": [],
        "timestamp": "2024-10-25T10:30:00.000Z"
    }
}
```

**Client Handling:**
```javascript
socket.on('newMessage', (data) => {
    console.log('New message:', data);
    // อัปเดต UI
});
```

#### 2. followUpTagged

ส่งเมื่อมีการอัปเดตสถานะติดตาม

**Event Name:** `followUpTagged`

**Payload:**
```json
{
    "userId": "user123",
    "followUp": {
        "isFollowUp": true,
        "reason": "ลูกค้ายืนยันสั่งซื้อแล้ว",
        "updatedAt": "2024-10-25T10:30:00.000Z"
    }
}
```

#### 3. chatCleared

ส่งเมื่อมีการล้างประวัติการสนทนา

**Event Name:** `chatCleared`

**Payload:**
```json
{
    "userId": "user123"
}
```

#### 4. userTagsUpdated

ส่งเมื่อมีการอัปเดตแท็ก

**Event Name:** `userTagsUpdated`

**Payload:**
```json
{
    "userId": "user123",
    "tags": ["VIP", "ลูกค้าใหม่"]
}
```

#### 5. userPurchaseStatusUpdated

ส่งเมื่อมีการอัปเดตสถานะการซื้อ

**Event Name:** `userPurchaseStatusUpdated`

**Payload:**
```json
{
    "userId": "user123",
    "hasPurchased": true
}
```

---

## Error Handling

### Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `UNAUTHORIZED` | ไม่ได้รับอนุญาต | 401 |
| `FORBIDDEN` | ไม่มีสิทธิ์เข้าถึง | 403 |
| `NOT_FOUND` | ไม่พบข้อมูล | 404 |
| `VALIDATION_ERROR` | ข้อมูลไม่ถูกต้อง | 400 |
| `INTERNAL_ERROR` | เกิดข้อผิดพลาดภายใน | 500 |
| `DATABASE_ERROR` | เกิดข้อผิดพลาดกับฐานข้อมูล | 500 |
| `SOCKET_ERROR` | เกิดข้อผิดพลาดกับ Socket.IO | 500 |

### Error Response Examples

#### 1. Unauthorized
```json
{
    "success": false,
    "error": "กรุณาเข้าสู่ระบบ",
    "code": "UNAUTHORIZED"
}
```

#### 2. Not Found
```json
{
    "success": false,
    "error": "ไม่พบผู้ใช้",
    "code": "NOT_FOUND"
}
```

#### 3. Validation Error
```json
{
    "success": false,
    "error": "ข้อมูลไม่ครบถ้วน",
    "code": "VALIDATION_ERROR",
    "details": {
        "userId": "userId is required",
        "message": "message is required"
    }
}
```

#### 4. Internal Error
```json
{
    "success": false,
    "error": "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
    "code": "INTERNAL_ERROR"
}
```

---

## Rate Limiting

API มีการจำกัดจำนวนคำขอ:

- **GET requests**: 100 requests/minute
- **POST requests**: 30 requests/minute
- **DELETE requests**: 10 requests/minute

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1635158400
```

---

## Webhooks (Optional)

คุณสามารถตั้งค่า Webhook เพื่อรับการแจ้งเตือนเมื่อมีเหตุการณ์สำคัญ

**Webhook Events:**
- `message.received` - เมื่อมีข้อความใหม่จากผู้ใช้
- `message.sent` - เมื่อส่งข้อความถึงผู้ใช้
- `user.purchased` - เมื่อผู้ใช้ซื้อสินค้า
- `user.tagged` - เมื่อมีการเพิ่มแท็กให้ผู้ใช้

**Webhook Payload Example:**
```json
{
    "event": "message.received",
    "timestamp": "2024-10-25T10:30:00.000Z",
    "data": {
        "userId": "user123",
        "message": {
            "id": "msg126",
            "role": "user",
            "content": "สวัสดีครับ",
            "timestamp": "2024-10-25T10:30:00.000Z"
        }
    }
}
```

---

## Testing

### Using cURL

```bash
# Get users
curl -X GET "http://localhost:3000/admin/chat/users" \
  -H "Cookie: connect.sid=<session_id>"

# Send message
curl -X POST "http://localhost:3000/admin/chat/send" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<session_id>" \
  -d '{"userId":"user123","message":"Hello"}'
```

### Using Postman

1. Import collection จาก `postman_collection.json`
2. ตั้งค่า Environment Variables:
   - `base_url`: `http://localhost:3000`
   - `session_id`: `<your_session_id>`
3. Run tests

### Using JavaScript

```javascript
// Get users
const response = await fetch('/admin/chat/users', {
    method: 'GET',
    credentials: 'include'
});
const data = await response.json();
console.log(data);

// Send message
const response = await fetch('/admin/chat/send', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
        userId: 'user123',
        message: 'Hello'
    })
});
const data = await response.json();
console.log(data);
```

---

## Changelog

### Version 1.0.0 (2024-10-25)
- Initial release
- User management APIs
- Chat APIs
- Tag management APIs
- Quick Reply APIs
- Statistics APIs
- Socket.IO events

---

## Support

หากมีปัญหาหรือข้อสงสัยเกี่ยวกับ API กรุณาติดต่อทีมพัฒนา

**Email:** support@chatcenterai.com  
**Documentation:** https://docs.chatcenterai.com  
**GitHub:** https://github.com/chatcenterai/api

