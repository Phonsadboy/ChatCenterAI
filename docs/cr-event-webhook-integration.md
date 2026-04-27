# CR Event Webhook Integration

ChatCenterAI ส่ง event ไป CRM/CR ด้วย HTTP POST webhook

## Admin Settings

หน้า: `/admin/settings2` > `ตั้งค่าระบบ` > `ส่ง Event ไป CRM/CR`

| Setting | ใช้ทำอะไร |
| --- | --- |
| เปิดส่ง Event ไป CRM/CR | เปิด/ปิด webhook ทั้งระบบ |
| Webhook URL | URL ปลายทางที่ CRM/CR รับ `POST` |
| Signing Secret | ใช้สร้าง `X-ChatCenter-Signature` |
| ส่งเนื้อหาแชทจริง | ปิดแล้ว field ข้อความจะเป็น `[omitted]` |
| เปิด Auto Export | อนุญาต mode `auto` และ auto sync ของ `dynamic` |
| เปิด Manual Export | อนุญาต mode `manual` และปุ่ม manual ของ `dynamic` |
| ทดสอบส่ง | ส่ง `system.webhook_test` ไป URL ที่กรอก |

Config เก็บที่ collection `settings`, key `crEventWebhook`

## Data Form CRM Export

หน้า: `/admin/settings2` > `Data Forms` > สร้าง/แก้ไขฟอร์ม > `CRM Export Mode`

Backend อ่านจาก `data_forms.crmExportMode` เท่านั้น

| Mode | Label ใน UI | ผลลัพธ์ |
| --- | --- | --- |
| `none` | ไม่ส่งเข้า CRM | เก็บ submission ในระบบ ไม่ส่ง export |
| `auto` | Auto - ส่งอัตโนมัติเมื่อฟอร์มครบ | เมื่อ submission เป็น `submitted` ส่ง CRM ทันที |
| `manual` | Manual - ให้ Agent ตรวจแล้วกดส่ง | เมื่อ submission เป็น `submitted` ให้ Agent ตรวจ แล้วกดส่งเอง |
| `dynamic` | Dynamic - Sync อัตโนมัติและกดส่งเองได้ | ส่งสถานะครบ/ไม่ครบให้ CRM; ถ้าครบใช้ auto หรือ manual ตาม setting ที่เปิด |

ค่า default ของฟอร์มใหม่และฟอร์มเก่าที่ไม่มี field นี้คือ `none`

ตัวอย่างการตั้งค่า:

| Use case | Mode |
| --- | --- |
| Incident Form ที่ AI เก็บครบแล้วส่งได้เลย | `auto` |
| Order Form ที่ต้องตรวจยอดชำระเงิน/สลิปก่อน | `manual` |
| ฟอร์มที่ CRM ต้องเห็นข้อมูลระหว่างกรอกและรู้ว่าครบหรือยัง | `dynamic` |
| Internal note หรือฟอร์มที่ไม่เข้า CRM | `none` |

### Manual Export Button

ตำแหน่ง: `/admin/chat` > เลือกลูกค้า > Data Form submission card

ปุ่ม `ส่งเข้า CRM` แสดงเมื่อ:

| เงื่อนไข | ค่า |
| --- | --- |
| Form mode | `crmExportMode = manual` หรือ `dynamic` |
| Submission status | `submitted` |
| CRM export status | ว่าง, `manual`, `waiting_review`, หรือ `failed` |
| Global setting | เปิด Manual Export |

Endpoint ที่ปุ่มเรียก:

```http
POST /admin/chat/data-form-submissions/:id/export-crm
```

## HTTP Contract

CRM/CR ต้องรับ request:

```http
POST /your-webhook-path
Content-Type: application/json
```

| รายการ | ค่า |
| --- | --- |
| Success | HTTP `2xx` |
| Failed | non-2xx, timeout, network error |
| Timeout default | `8000ms` |
| Timeout max | `30000ms` |
| Failed log | collection `cr_event_logs` |
| Retry worker | ยังไม่มี retry อัตโนมัติ |

## Headers

| Header | ตัวอย่าง |
| --- | --- |
| `Content-Type` | `application/json` |
| `User-Agent` | `ChatCenterAI-6 CR Event Webhook` |
| `X-ChatCenter-Event` | `data_form.exported` |
| `X-ChatCenter-Event-Id` | `fdfef611-2d9d-4a45-b1d5-b9f25b0ad9de` |
| `X-ChatCenter-Signature` | `sha256=<hex>` |

`X-ChatCenter-Signature` มีเมื่อใส่ Signing Secret

```js
const expected = "sha256=" + crypto
  .createHmac("sha256", signingSecret)
  .update(rawRequestBody)
  .digest("hex");
```

ฝั่ง CRM ควรตรวจ signature ด้วย timing-safe compare

## Envelope

ทุก event ใช้ envelope เดียวกัน:

```json
{
  "eventId": "fdfef611-2d9d-4a45-b1d5-b9f25b0ad9de",
  "eventType": "data_form.exported",
  "schemaVersion": "1.0",
  "sourceSystem": "ChatCenterAI-6",
  "sourceBaseUrl": "https://example.com",
  "occurredAt": "2026-04-27T10:20:30.000Z",
  "entityType": "data_form_submission",
  "entityId": "662f0c8f0f35b0a8a9c2d111",
  "customerId": "Uxxxxxxxx",
  "platform": "line",
  "botId": "662f0c8f0f35b0a8a9c2d222",
  "inboxKey": "line:662f0c8f0f35b0a8a9c2d222",
  "actor": {
    "id": "admin-id",
    "label": "Admin Name",
    "role": "superadmin"
  },
  "idempotencyKey": "data_form_submission:662f0c8f0f35b0a8a9c2d111:export:dynamic",
  "payload": {}
}
```

| Field | ความหมาย |
| --- | --- |
| `eventId` | ID ของ event ใช้ dedupe |
| `eventType` | ชนิด event |
| `schemaVersion` | ปัจจุบัน `1.0` |
| `sourceSystem` | `ChatCenterAI-6` |
| `sourceBaseUrl` | ค่า `PUBLIC_BASE_URL` ถ้ามี |
| `occurredAt` | เวลาที่สร้าง event |
| `entityType` | entity หลัก เช่น `order`, `chat_message`, `data_form_submission` |
| `entityId` | ID ของ entity |
| `customerId` | user id ลูกค้า |
| `platform` | `line`, `facebook`, `instagram`, `whatsapp` |
| `botId` | bot/page id |
| `inboxKey` | key ของ inbox |
| `actor` | ผู้กระทำ เช่น system, AI, admin |
| `idempotencyKey` | key กันประมวลผลซ้ำ โดยเฉพาะ export |
| `payload` | ข้อมูลตาม event type |

## Privacy

ระบบ redact key ที่เป็น secret เช่น `token`, `secret`, `password`, `passcode`, `authorization`, `apiKey`

ถ้าปิด `ส่งเนื้อหาแชทจริง` field เช่น `content`, `text`, `reply`, `rawText` จะเป็น `[omitted]`

## Data Form Payload

Data Form event (`data_form.updated`, `data_form.export_requested`, `data_form.exported`) ใช้ payload หลักแบบเดียวกัน:

```json
{
  "eventType": "data_form.exported",
  "entityType": "data_form_submission",
  "entityId": "662f0c8f0f35b0a8a9c2d111",
  "customerId": "Uxxxxxxxx",
  "platform": "line",
  "botId": "662f0c8f0f35b0a8a9c2d222",
  "idempotencyKey": "data_form_submission:662f0c8f0f35b0a8a9c2d111:export:dynamic",
  "payload": {
    "form": {
      "id": "662f0c8f0f35b0a8a9c2d100",
      "name": "Incident Form",
      "description": "Incident intake",
      "crmExportMode": "dynamic",
      "fields": [
        {
          "id": "field1",
          "key": "incident_type",
          "label": "ประเภทปัญหา",
          "type": "select",
          "required": true,
          "options": ["สินค้าเสียหาย", "จัดส่งล่าช้า"],
          "helpText": ""
        }
      ]
    },
    "submission": {
      "id": "662f0c8f0f35b0a8a9c2d111",
      "status": "submitted",
      "isComplete": true,
      "completionStatus": "complete",
      "values": {
        "incident_type": "สินค้าเสียหาย",
        "detail": "กล่องบุบ"
      },
      "summary": "ประเภทปัญหา: สินค้าเสียหาย | รายละเอียด: กล่องบุบ",
      "source": "ai",
      "createdAt": "2026-04-27T10:20:30.000Z",
      "updatedAt": "2026-04-27T10:20:30.000Z"
    },
    "completion": {
      "isComplete": true,
      "status": "complete",
      "submissionStatus": "submitted",
      "totalFieldCount": 2,
      "completedFieldCount": 2,
      "requiredFieldCount": 1,
      "completedRequiredFieldCount": 1,
      "missingRequiredFields": [],
      "completionRate": 1
    },
    "export": {
      "mode": "dynamic",
      "trigger": "auto_complete",
      "requestedAt": "2026-04-27T10:20:31.000Z"
    },
    "userId": "Uxxxxxxxx",
    "platform": "line",
    "botId": "662f0c8f0f35b0a8a9c2d222"
  }
}
```

`payload.completion` คือ field ที่ CRM ใช้ดูว่าฟอร์มครบหรือยัง:

| Field | ความหมาย |
| --- | --- |
| `isComplete` | `true` เมื่อ submission status เป็น `submitted` และ required fields ครบ |
| `status` | `complete` หรือ `incomplete` |
| `missingRequiredFields` | รายการ required fields ที่ยังไม่มีค่า |
| `completionRate` | สัดส่วน field ที่มีค่า เทียบกับจำนวน field ทั้งหมด |

ค่า `crmExport.status`:

| Status | ความหมาย |
| --- | --- |
| `waiting_config` | เข้าเงื่อนไข export แต่ยังไม่มี webhook URL หรือปิดระบบ |
| `waiting_completion` | Dynamic manual รอข้อมูล required ครบ |
| `waiting_review` | รอ Agent ตรวจ |
| `sending` | กำลังส่ง |
| `synced` | Dynamic sync สำเร็จ แต่ฟอร์มยังไม่ครบ |
| `exported` | CRM ตอบ `2xx` |
| `failed` | ส่งไม่สำเร็จ |

## Data Form Workflow

| Flow | ขั้นตอน |
| --- | --- |
| Auto | `submitted` -> ส่ง `data_form.exported` -> set `crmExport.status = exported` หรือ `failed` |
| Manual | `submitted` -> set `waiting_review` -> ส่ง `data_form.export_requested` -> Agent กดปุ่ม -> ส่ง `data_form.exported` |
| Dynamic + Auto เปิด | draft/incomplete -> `data_form.updated` พร้อม `completion.isComplete=false`; complete -> `data_form.exported` พร้อม `completion.isComplete=true` |
| Dynamic + Manual เปิด | incomplete -> `waiting_completion`; complete -> `waiting_review` -> Agent กดปุ่ม -> `data_form.exported` |

## Event Catalog

| Event | เกิดเมื่อ | Payload หลัก |
| --- | --- | --- |
| `system.webhook_test` | แอดมินกดทดสอบส่ง | `message`, `testedAt` |
| `admin.audit_logged` | audit log ทั่วไป | `auditLog`, `actor` |
| `auth.login_succeeded` | แอดมิน login สำเร็จ | `user`, `ipAddress`, `userAgent` |
| `auth.login_failed` | login ไม่สำเร็จ | `ipAddress`, `userAgent`, `reason` |
| `auth.logout` | แอดมิน logout | `actor`, `ipAddress`, `userAgent` |
| `security.admin_user_changed` | เปลี่ยน admin/passcode | `auditLog`, `actor` |
| `security.permission_changed` | เปลี่ยน permission | `auditLog`, `actor` |
| `conversation.message_received` | รับข้อความลูกค้า | `userId`, `platform`, `botId`, `message`, `instructionRefs` |
| `conversation.message_sent` | AI/Admin ส่งข้อความ | `userId`, `platform`, `botId`, `message`, `actor` |
| `conversation.handoff_requested` | ส่งต่อให้ human | `userId`, `reason`, `summary`, `chatUrl` |
| `conversation.ai_stuck` | AI ตอบต่อไม่ได้มั่นใจ | `userId`, `reason`, `summary`, `chatUrl` |
| `chat.assignment_changed` | เปลี่ยน assignment | `auditLog`, `actor` |
| `chat.queue_status_changed` | เปลี่ยน queue/status | `auditLog`, `actor` |
| `message.feedback_recorded` | บันทึก feedback ข้อความ | `auditLog`, `actor` |
| `note.updated` | แก้ note ลูกค้า | `auditLog`, `actor` |
| `data_form.submitted` | Data Form submit ครบ | `form`, `submission`, `completion`, `userId`, `platform`, `botId` |
| `data_form.updated` | แก้ submission หรือ Dynamic sync | `form`, `submission`, `completion`, `export` หรือ `auditLog`, `actor` |
| `data_form.export_requested` | Manual export รอ Agent | `form`, `submission`, `export`, `userId`, `platform`, `botId` |
| `data_form.exported` | ส่ง Data Form ไป CRM แล้ว | `form`, `submission`, `completion`, `export`, `userId`, `platform`, `botId` |
| `data_form.export_failed` | ส่ง Data Form ไม่สำเร็จ | `form`, `submission`, `completion`, `export`, `error` |
| `order.created` | สร้าง order | `order`, `userId`, `platform`, `botId` |
| `order.updated` | แก้ order | `order`, `previousStatus`, `changedFields` |
| `order.status_changed` | เปลี่ยนสถานะ order | `order`, `previousStatus`, `changedFields` |
| `order.deleted` | ลบ order | `auditLog`, `actor` |
| `order.bulk_status_changed` | เปลี่ยนสถานะหลาย order | `auditLog`, `actor` |
| `order.bulk_deleted` | ลบหลาย order | `auditLog`, `actor` |
| `customer.profile_updated` | แก้โปรไฟล์ลูกค้า | `customer`, `changedFields` |
| `customer.purchase_status_changed` | เปลี่ยนสถานะซื้อแล้ว | `auditLog`, `actor` |
| `customer.tags_changed` | เพิ่ม/ลบ tag ลูกค้า | `auditLog`, `actor` |
| `customer.ai_status_changed` | เปิด/ปิด AI รายลูกค้า | `auditLog`, `actor` |
| `system_tag.changed` | สร้าง/แก้/ลบ system tag | `auditLog`, `actor` |
| `followup.scheduled` | ตั้ง follow-up | `taskId`, `userId`, `platform`, `botId`, `nextScheduledAt`, `roundCount` |
| `followup.sent` | ส่ง follow-up แล้ว | `taskId`, `currentRound`, `nextRound`, `nextScheduledAt` |
| `followup.completed` | follow-up จบ | `taskId`, `userId`, `platform`, `botId` |
| `followup.cancelled` | ยกเลิก follow-up | `taskId`, `reason` |
| `followup.failed` | follow-up ล้มเหลว | `taskId`, `reason`, `error` |
| `payment.slip_checked` | SlipOK ตรวจสลิป | `provider`, `ok`, `code`, `message`, `slip`, `groupId`, `sourceType`, `messageId` |
| `broadcast.started` | เริ่ม broadcast | `jobId`, `stats`, `channels`, `targetCount`, `messageCount` |
| `broadcast.progress` | progress broadcast | `jobId`, `stats` |
| `broadcast.completed` | broadcast สำเร็จ | `jobId`, `stats` |
| `broadcast.cancelled` | cancel broadcast | `jobId`, `stats`, `reason` |
| `broadcast.failed` | broadcast failed | `jobId`, `stats` |
| `notification.delivery_attempted` | พยายามส่ง notification | `channel`, `success`, `status`, `result`, `order` |
| `asset.sent` | AI ส่ง image asset | `userId`, `platform`, `botId`, `messageId`, `assetIds` |
| `file.sent` | Admin ส่ง file | `userId`, `platform`, `botId`, `messageId`, `message`, `source` |
| `bot.status_changed` | เปลี่ยนสถานะ bot | `auditLog`, `actor` |
| `bot.config_changed` | แก้ config bot | `auditLog`, `actor` |
| `instruction.version_created` | สร้าง instruction version | `instructionId`, `version`, `note`, `source` |
| `instruction.batch_committed` | commit batch InstructionAI2 | `batchId`, `result` |
| `instruction.batch_rejected` | reject batch InstructionAI2 | `batchId`, `reason`, `batch` |
| `ai.usage_logged` | บันทึก AI usage | `usage`, `platform`, `botId` |
| `ai.response_generated` | AI สร้างคำตอบ | `response`, `platform`, `botId` |

## CRM Receiver Checklist

1. ตรวจ `X-ChatCenter-Signature` ถ้ามี secret
2. Dedupe ด้วย `eventId`
3. Dedupe Data Form export ด้วย `idempotencyKey`
4. ตอบ `2xx` หลังรับ event สำเร็จ
5. ส่ง non-2xx เฉพาะกรณีต้องการให้ ChatCenterAI บันทึก failed

## Minimal Express Receiver

```js
const crypto = require("crypto");
const express = require("express");

const app = express();
const signingSecret = process.env.CHATCENTER_WEBHOOK_SECRET || "";

app.post("/webhooks/chatcenter", express.raw({ type: "application/json" }), async (req, res) => {
  const rawBody = req.body;
  const signature = req.header("X-ChatCenter-Signature") || "";

  if (signingSecret) {
    const expected = "sha256=" + crypto
      .createHmac("sha256", signingSecret)
      .update(rawBody)
      .digest("hex");

    const valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

    if (!valid) return res.status(401).json({ error: "invalid_signature" });
  }

  const event = JSON.parse(rawBody.toString("utf8"));

  switch (event.eventType) {
    case "data_form.exported":
      await handleDataFormExport(event);
      break;
    case "order.created":
      await handleOrderCreated(event);
      break;
    default:
      await storeGenericEvent(event);
  }

  res.status(204).end();
});
```

## Source Files

| File | หน้าที่ |
| --- | --- |
| `services/crEventService.js` | config, envelope, signing, POST webhook, log |
| `index.js` | hook event หลัก, settings API, Data Form export workflow |
| `views/admin-settings-v2.ejs` | webhook settings UI, Data Form `CRM Export Mode` field |
| `public/js/admin-settings-v2.js` | โหลด/บันทึก/ทดสอบ webhook settings |
| `public/js/voxtron-phase1.js` | โหลด/บันทึก/แสดง `crmExportMode` ของ Data Form |
| `public/js/chat2.js` | ปุ่ม Manual export ในหน้าแชท |
| `routes/instructionAI2.js` | InstructionAI2 events |
