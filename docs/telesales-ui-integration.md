# TeleSales UI Integration Guide

เอกสารนี้สรุปสิ่งที่ frontend ต้องรู้เพื่อทำ UI สำหรับระบบ Tele-sales ที่เพิ่งเพิ่มเข้าไป

## Scope
- เอกสารนี้ครอบคลุมเฉพาะ UI integration กับ backend ที่มีอยู่แล้ว
- ไม่กำหนดหน้าตา design
- อ้างอิง endpoint จาก `index.js` และ shape จาก `services/telesalesService.js`

## Roles
- `sales`: เห็นเฉพาะงานของตัวเอง
- `sales_manager`: เห็น queue ทั้งหมด, assign/pause/reopen ได้, ดู report ได้
- `admin`: ใช้ manager APIs ได้เหมือน `sales_manager`

## Auth
### Sales login
- `POST /sales/login`
- body:
```json
{
  "code": "sale01",
  "password": "1234"
}
```
- success:
```json
{
  "success": true,
  "user": {
    "id": "sales_user_id",
    "name": "Alice",
    "code": "sale01",
    "role": "sales",
    "teamId": null,
    "loggedInAt": "2026-03-16T10:00:00.000Z"
  }
}
```

### Current sales session
- `GET /api/sales/me`

### Logout
- `POST /sales/logout`

## Recommended Screens
### 1. Sales Login
- ฟอร์ม `code` + `password`
- หลัง login สำเร็จให้เรียก `GET /api/sales/me`

### 2. My Queue
- endpoint: `GET /api/telesales/my-queue`
- query ที่รองรับ: `status`, `limit`
- response หลัก:
```json
{
  "success": true,
  "items": [
    {
      "checkpoint": {
        "id": "checkpoint_id",
        "leadId": "lead_id",
        "seq": 3,
        "type": "callback",
        "dueAt": "2026-03-20T03:00:00.000Z",
        "status": "open",
        "assignedToSalesUserId": "sales_user_id",
        "sourceOrderIds": ["order_id"],
        "dueReasons": []
      },
      "lead": {
        "id": "lead_id",
        "userId": "customer_user_id",
        "platform": "line",
        "botId": "bot_id",
        "displayName": "ลูกค้า A",
        "phone": "089xxxxxxx",
        "ownerSalesUserId": "sales_user_id",
        "status": "active",
        "currentCheckpointId": "checkpoint_id",
        "nextDueAt": "2026-03-20T03:00:00.000Z",
        "overdueSince": null,
        "latestOrderId": "order_id",
        "sourceOrderIds": ["order_id"],
        "dueReasons": [],
        "needsCycle": false,
        "needsCycleOrderIds": []
      }
    }
  ],
  "summary": {
    "due_today": 4,
    "overdue": 2,
    "callback_pending": 1
  }
}
```
- หน้า My Queue ควรโชว์อย่างน้อย: ชื่อลูกค้า, เบอร์, dueAt, ประเภท checkpoint, overdue badge, จำนวน order ที่เคยมี

### 3. Lead Detail
- endpoint: `GET /api/telesales/leads/:leadId`
- response มี 4 ส่วน:
- `lead`
- `checkpoints`
- `callLogs`
- `orders`
- หน้า detail ควรมี 4 tab หรือ 4 section:
- Summary ของลูกค้า
- Timeline checkpoint
- Call log history
- Order history

### 4. Manager Queue
- endpoint: `GET /api/telesales/manager/queue`
- query ที่รองรับ: `salesUserId`, `status`, `limit`
- ใช้ทำหน้า queue รวมของทีม หรือเจาะดูรายคน

### 5. Manager Lead List
- endpoint: `GET /api/telesales/manager/leads`
- query ที่รองรับ: `status`, `ownerSalesUserId`, `needsCycle`, `limit`
- สำคัญมากสำหรับหน้า `needs cycle`
- ใช้ `?needsCycle=true` เพื่อดึง lead ที่มี order แต่ยังไม่ได้ตั้ง `teleSalesCycleDays`

### 6. Sales User Management
- `GET /api/telesales/sales-users`
- `POST /api/telesales/sales-users`
- `PATCH /api/telesales/sales-users/:id`
- body ตอน create:
```json
{
  "name": "Alice",
  "code": "sale01",
  "password": "1234",
  "role": "sales",
  "teamId": null,
  "phone": "089xxxxxxx",
  "isActive": true
}
```

### 7. Daily Reports
- `GET /api/telesales/reports/daily`
- `POST /api/telesales/reports/daily/run`
- ใช้สำหรับหน้า manager report หรือปุ่ม manual run

### 8. Order Tele-sales Settings
- endpoint: `PATCH /admin/orders/:orderId/telesales-settings`
- body:
```json
{
  "teleSalesEnabled": true,
  "teleSalesCycleDays": 10
}
```
- ใช้ในหน้า order detail หรือ side panel ของ order

## Lead / Checkpoint / Call Log Semantics
### Lead
- 1 lead ต่อลูกค้า 1 คน ต่อ 1 platform/bot
- ถ้าลูกค้ากลับมาซื้อใหม่ จะไม่สร้าง lead ใหม่
- owner จะคงเป็นเซลล์คนเดิม ถ้ามี owner อยู่แล้ว

### Checkpoint
- 1 lead มี `open checkpoint` ได้ทีละ 1 ตัว
- type ที่มีตอนนี้:
- `reorder`
- `callback`
- `manual_reopen`
- `system_reorder`

### Call log outcomes
- `no_answer`
- `busy`
- `call_back`
- `interested`
- `not_interested`
- `already_bought_elsewhere`
- `wrong_number`
- `do_not_call`
- `closed_won`
- `purchased_via_ai`

## Action Rules For UI
### Log Call
- endpoint: `POST /api/telesales/checkpoints/:checkpointId/log-call`
- body:
```json
{
  "outcome": "no_answer",
  "note": "โทรแล้วไม่มีคนรับ",
  "nextCheckpointAt": "2026-03-21T10:30:00.000Z"
}
```
- ต้องบังคับกรอก `note` ทุกครั้ง
- outcome ที่ต้องบังคับกรอก `nextCheckpointAt`:
- `no_answer`
- `busy`
- `call_back`
- `interested`
- `not_interested`
- outcome `wrong_number` และ `do_not_call` จะไม่เปิด checkpoint ใหม่ แต่จะเปลี่ยน lead ไปเป็น `paused` หรือ `dnc`
- outcome `closed_won` ห้ามใช้ endpoint นี้ ให้ใช้ create-order endpoint

### Create Order From Checkpoint
- endpoint: `POST /api/telesales/checkpoints/:checkpointId/create-order`
- body:
```json
{
  "callNote": "ลูกค้าตกลงรับเพิ่ม 1 ขวด",
  "status": "pending",
  "notes": "เทเลเซลล์ปิดการขาย",
  "teleSalesEnabled": true,
  "teleSalesCycleDays": 10,
  "orderData": {
    "items": [
      {
        "product": "Serum A",
        "quantity": 1,
        "price": 590
      }
    ],
    "totalAmount": 590,
    "customerName": "ลูกค้า A",
    "recipientName": "ลูกค้า A",
    "phone": "089xxxxxxx",
    "shippingAddress": "Bangkok",
    "paymentMethod": "เก็บเงินปลายทาง"
  }
}
```
- endpoint นี้จะ:
- สร้าง order ใหม่ใน `orders`
- mark call outcome เป็น `closed_won`
- ปิด checkpoint เดิม
- สร้าง checkpoint รอบใหม่จาก `teleSalesCycleDays`
- ยิง notification ออเดอร์ให้กลุ่มเดิม

### Assign Lead
- endpoint: `POST /api/telesales/leads/:leadId/assign`
- body:
```json
{
  "salesUserId": "sales_user_id"
}
```

### Pause Lead
- endpoint: `POST /api/telesales/leads/:leadId/pause`
- body:
```json
{
  "status": "paused",
  "reason": "ลูกค้าขอพักก่อน"
}
```

### Reopen Lead
- endpoint: `POST /api/telesales/leads/:leadId/reopen`
- body:
```json
{
  "dueAt": "2026-03-22T03:00:00.000Z",
  "assignedToSalesUserId": "sales_user_id"
}
```

## Important UI Edge Cases
- ถ้าลูกค้าซื้อผ่าน AI ขณะมี checkpoint ค้าง ระบบจะปิด checkpoint เดิมเป็น `purchased_via_ai` อัตโนมัติ
- `assisted_reorder` ไม่ใช่ `direct_closed_won` ต้องแสดงแยกใน report
- ถ้า order ไม่มี `teleSalesCycleDays` แต่ `teleSalesEnabled=true` lead จะขึ้นเป็น `needsCycle=true`
- sales ธรรมดาห้ามเห็น lead คนอื่น
- manager/admin ควรมี filter อย่างน้อย: owner, needsCycle, overdue, status

## Suggested UI State Names
- Lead badge: `active`, `paused`, `dnc`, `archived`
- Checkpoint badge: `open`, `done`, `canceled`, `overdue`
- Queue groups: `due_today`, `overdue`, `callback_pending`, `needs_cycle`

## Suggested Frontend Build Order
- ทำ Sales Login ก่อน
- ทำ My Queue ก่อน
- ทำ Lead Detail + Log Call ก่อน
- ทำ Create Order From Checkpoint ต่อ
- ทำ Manager Lead List / Queue / Assign หลังจากนั้น
- ปิดท้ายด้วย Reports และ Order Tele-sales Settings
