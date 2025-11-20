# แผนพัฒนา: ระบบตอบคอมเมนต์ + ดึงโพสต์อัตโนมัติ (ChatCenterAI-5)

## เป้าหมาย
- ระบบตอบคอมเมนต์ Facebook อัตโนมัติ (ข้อความคงที่หรือ AI) ทำงานได้ทันทีหลังมี webhook
- ดึงข้อมูลโพสต์จาก webhook แล้วบันทึกแยกรายเพจ (ไม่ต้องกรอก Post ID เอง)
- เคลียร์ของเดิมที่เกี่ยวกับระบบตอบคอมเมนต์ (ข้อมูล/โค้ด/หน้าจอ) แล้วใช้โครงสร้างใหม่

## ภาพรวมสถานะปัจจุบัน (จุดตรวจสอบ)
- `index.js` มีฟังก์ชัน `handleFacebookComment` และ webhook `/webhook/facebook/:botId` ที่ตอบเฉพาะ event คอมเมนต์ (`entry.changes` item=comment/verb=add)
- Config ตอบคอมเมนต์ใช้คอลเลกชัน `facebook_comment_configs` (ระบุ `pageId` เป็น `_id` ของ bot และ `postId` ต้องกรอกเอง) มี placeholder auto-created เมื่อเจอคอมเมนต์ที่ไม่รู้จัก แต่ไม่ดึงข้อมูลโพสต์จริง
- UI จัดการอยู่ที่ `views/admin-facebook-comment.ejs` (สร้าง/แก้ไข/เปิดปิด config ตาม Post ID ที่แอดมินกรอกเอง)
- ไม่มีคอลเลกชันเก็บโพสต์แยกรายเพจ, ไม่มีดัชนี/การ dedupe คอมเมนต์, ไม่มี page-level default policy
- `facebook_bots` ใช้ฟิลด์ `accessToken` และ `pageId` (ID จริงของเพจ) แต่การแมปในเว็บฮุคใช้ `_id` เป็นคีย์หลัก

## ข้อกำหนด/ประเด็นที่ต้องแก้ให้ตรงโจทย์
- Auto-fetch: เมื่อมี webhook (comment หรือ feed event) ต้องดึงข้อมูลโพสต์จาก Graph API แล้วเก็บเป็นรายการโพสต์ของเพจนั้น
- Separation by page: โพสต์ต้องถูกจัดกลุ่ม/สืบค้นตามเพจ (รวมทั้ง `_id` ของ bot และ `pageId` จริงของเพจ)
- Auto-reply: คอมเมนต์ใหม่ต้องถูกตอบตาม policy ที่กำหนด (page-default หรือ post-specific) โดยไม่ต้องตั้งค่าล่วงหน้า
- Cleanup: โครงสร้างและข้อมูลเดิมของระบบตอบคอมเมนต์ต้องถูกล้าง/เลิกใช้ (ตามคำสั่ง “ถ้ามีก็ลบออกเลย”)
- Observability: ต้องบันทึก log/สถานะการตอบ, กันการตอบซ้ำ, จัดการ error/timeout ของ Graph ได้

## แนวทางออกแบบที่เสนอ

### 1) โครงสร้างข้อมูลใหม่
- `facebook_page_posts`
  - `botId` (ObjectId ref `facebook_bots`), `pageId` (ID จริงของเพจ), `postId` (Graph Post ID เช่น `PAGEID_POSTID`)
  - `message`, `permalink`, `createdTime`, `attachments` (type/url), `statusType`, `capturedFrom` (`webhook` | `manual`), `syncedAt`, `lastCommentAt`, `lastReplyAt`, `commentCount`
  - `replyProfile` (โครงสร้าง policy ที่ผูกกับโพสต์: `mode` = `ai` | `template` | `off`, `templateMessage`, `aiModel`, `systemPrompt`, `pullToChat`, `sendPrivateReply`, `isActive`)
  - ดัชนีที่ต้องมี: unique `(botId, postId)`, ดัชนี `pageId`, `lastCommentAt`
- `facebook_comment_policies` (page-level default)
  - `botId`, `pageId`, `scope` = `page_default`, `mode`, `templateMessage`, `aiModel`, `systemPrompt`, `pullToChat`, `sendPrivateReply`, `status`
- `facebook_comment_events` (แทน/ขยาย `facebook_comment_logs`)
  - `commentId`, `postId`, `botId`, `pageId`, `fromUser`, `commentText`, `replyMode`, `replyText`, `action` (`replied` | `skipped` | `failed`), `reason`, `createdAt`
- หมายเหตุ cleanup: หลังย้าย logic ให้ drop/เลิกใช้ `facebook_comment_configs` และ UI/route เดิม

### 2) Webhook ingestion & การดึงโพสต์อัตโนมัติ
- Subscribe/รองรับ `entry.changes` field=`feed` ทั้งกรณี `item=post|status|photo|video|share` (โพสต์ใหม่) และ `item=comment`
- ทุก event ที่มี `post_id` ให้เรียก `upsertFacebookPost(post_id, bot)`:
  - ยิง Graph API (`/{post_id}?fields=id,from,message,permalink_url,created_time,full_picture,attachments{media_type,type,url,media},status_type`) ด้วย page access token
  - เก็บ/อัปเดตลง `facebook_page_posts` (mark `capturedFrom: webhook`)
  - ตั้งค่าเริ่มต้น `replyProfile.status = pending` เพื่อให้ UI เห็นโพสต์ที่ถูกจับเอง
- สำหรับคอมเมนต์: ก่อนตอบให้ ensure post ถูก upsert และบันทึก `lastCommentAt`

### 3) กระบวนการตอบคอมเมนต์
- Resolver policy: post-level `replyProfile` ถ้ามี/active > รองรับ fallback ไป page-default (`facebook_comment_policies`), ถ้าไม่มีหรือ `mode=off` ให้ skip และ log
- Dedupe: บันทึก `facebook_comment_events` ด้วย unique `commentId` เพื่อกันยิงซ้ำ
- Reply engine:
  - `mode=template` ส่งข้อความคงที่ (รองรับ placeholder ชื่อคนคอมเมนต์ใน phase ถัดไปได้)
  - `mode=ai` ใช้ `processCommentWithAI` (reuse/ปรับให้รองรับโมเดลจาก policy) แล้วส่งด้วย Graph `/comments` (reply) และ `/private_replies` เมื่อ `sendPrivateReply/pullToChat` = true
  - เก็บ `lastReplyAt`, อัปเดตสถิติใน `facebook_page_posts`
- Error handling: retry minimal/จับ error code quota, rate limit, permission; mark event `failed` พร้อมเหตุผล

### 4) Admin/API
- API ใหม่สำหรับ:
  - ดึงโพสต์ตามเพจ (`GET /api/facebook-posts?botId=...` filter ตามสถานะ/จับอัตโนมัติ)
  - ตั้งค่า page-default policy (`facebook_comment_policies`)
  - ตั้ง/อัปเดต replyProfile ต่อโพสต์ (toggle active/off, เลือก AI/Template, ตั้ง prompt/message, pull-to-chat)
  - ลบ/ignore โพสต์ (soft delete หรือ `status=archived`)
- UI `admin/facebook-comment` ปรับให้:
  - แสดงโพสต์ที่ระบบจับอัตโนมัติแยกตามเพจ (ค้นหา/กรองตามสถานะ)
  - ตั้งค่า default ของเพจ + override ต่อโพสต์จากหน้ารายการ (ไม่ต้องพิมพ์ Post ID)
  - ปุ่มล้างข้อมูลเดิม (drop config/log เก่า) เพื่อป้องกันสับสน

### 5) กลยุทธ์ cleanup/การเปลี่ยนผ่าน
- สร้างสคริปต์/endpoint maintenance สำหรับ drop คอลเลกชันเดิม (`facebook_comment_configs`, log เก่า) หลังยืนยันแบ็กอัป
- ลบ/ปิดการใช้งาน route/UI เดิม (`/admin/facebook-comment` เวอร์ชันเดิม, API `/admin/facebook-comment/*`)
- ปรับ webhook ให้ชี้ไป pipeline ใหม่ก่อนเปิดใช้งานจริง

### 6) Observability & ความเสี่ยง
- เพิ่ม log แบบมี context (postId, commentId, botId, reply mode, latency OpenAI/Graph)
- Metric พื้นฐาน: จำนวนโพสต์ auto-captured, success/fail rate ของการตอบ, time-to-reply
- ความเสี่ยง: token สิทธิ์ไม่พอสำหรับ fields post/comment, rate limit Graph, quota OpenAI, comment event บางแบบไม่มี `message` -> ต้องเฝ้าระวังและ log

## แผนดำเนินการทีละเฟส
1) เตรียม/ลบของเดิม
   - แบ็กอัป (ถ้าต้องการ) แล้ว drop `facebook_comment_configs` + route/UI เดิม, ล้าง log เก่า
   - วาง index/สคีมาใหม่ (`facebook_page_posts`, `facebook_comment_policies`, `facebook_comment_events`)
2) Data layer & helper
   - ฟังก์ชัน `upsertFacebookPost` + ตัว parse field, normalizer pageId/botId, unique index
   - ฟังก์ชัน policy resolver + guard no-policy/off
   - ฟังก์ชัน reply sender (comment / private reply) + dedupe guard
3) ปรับ webhook `/webhook/facebook/:botId`
   - รองรับ event post + comment, ผูกกับ data layer ใหม่, บันทึก event/log, update stats
   - ปรับการใช้คีย์ page ให้ชัด (ใช้ทั้ง `_id` ของ bot และ `pageId` จริง)
4) Admin/API ใหม่
   - Endpoint CRUD สำหรับ posts, page default policy, post override
   - UI แสดงโพสต์ที่จับอัตโนมัติ, panel ตั้งค่า default/override, ปุ่ม clear data เก่า
5) QA/ตรวจสอบ
   - ทดสอบ webhook จำลอง: post ใหม่, comment ใหม่, comment ซ้ำ, policy off, AI/template
   - ตรวจ log/metrics, ตรวจการเก็บ post per page และการตอบกลับ

## การทดสอบที่ต้องมี
- Unit-ish: policy resolver, upsert post, dedupe commentId, reply formatter
- Integration (mock Graph/OpenAI): webhook event → post stored → comment answered → event logged
- UI/manual: ตรวจหน้า admin ใหม่ (list/filter), ตั้งค่า page-default + override, ปุ่มลบ data เก่า

## สมมติฐาน/ข้อกำหนดที่ยืนยันแล้ว
- การตั้งค่าควบคุมระดับโพสต์: ต้องแสดงและตั้งค่าแยกแต่ละโพสต์ได้ชัดเจน
- ค่าเริ่มต้นต่อโพสต์: ปิดการตอบไว้ก่อน (ต้องกดเปิดเอง)
- ล้างระบบเดิม: ให้ลบทิ้ง (คอลเลกชัน/route/UI เดิมเกี่ยวกับตอบคอมเมนต์)
- ไม่ต้องดึงโพสต์ย้อนหลัง เริ่มเก็บจาก event webhook ใหม่เท่านั้น
- ให้ drop คอลเลกชันเดิมทันทีโดยไม่สำรอง (ยืนยันแล้ว)
