# Review PostgreSQL Cutover

สาขานี้เป็น migration foundation สำหรับ `review` โดยยึด baseline จาก `main` เท่านั้น
และเปลี่ยนเฉพาะ chat storage/read path ไปเป็น `PostgreSQL + Railway Bucket`
แบบค่อยเป็นค่อยไป

## Runtime Modes

- `CHAT_STORAGE_MODE=mongo`
  - อ่าน/เขียน Mongo แบบเดิม
- `CHAT_STORAGE_MODE=dual`
  - เขียน Mongo แบบเดิม และ mirror chat ไป PostgreSQL/Bucket
  - หน้าแชทยังอ่านจาก Mongo
- `CHAT_STORAGE_MODE=shadow`
  - เขียนแบบ `dual`
  - หน้าแชทยังอ่านจาก Mongo
  - ฝั่ง server จะ compare Mongo กับ PostgreSQL แล้ว log mismatch
- `CHAT_STORAGE_MODE=postgres`
  - หน้าแชทอ่านจาก PostgreSQL
  - write path ยัง mirror ไป PostgreSQL โดยไม่เปลี่ยน route เดิม

## Session Store

- `SESSION_STORE_MODE=mongo`
  - ใช้ `connect-mongo`
- `SESSION_STORE_MODE=postgres`
  - ใช้ `connect-pg-simple`

## App Document Modes

- `APP_DOCUMENT_MODE=mongo`
  - อ่านข้อมูล non-chat จาก Mongo แบบเดิม
- `APP_DOCUMENT_MODE=dual`
  - ใช้ Mongo เป็น primary และ mirror runtime writes ไป `app_documents`
- `APP_DOCUMENT_MODE=shadow`
  - อ่าน Mongo แบบเดิม และ log mismatch กับ `app_documents` ใน read path ที่รองรับ
- `APP_DOCUMENT_MODE=postgres`
  - read path ที่รองรับจะอ่านจาก `app_documents`
  - ใช้หลังจาก backfill และ shadow-read ผ่านแล้วเท่านั้น

## Review Canary Rollout

1. Provision `PostgreSQL` และ `Railway Bucket` ให้โปรเจ็ก `review`
2. ตั้ง env:
   - `DATABASE_URL`
   - `CHAT_STORAGE_MODE=dual`
   - `APP_DOCUMENT_MODE=dual`
   - `SESSION_STORE_MODE=postgres`
   - bucket credentials
   - `CHAT_HOT_RETENTION_DAYS=60`
3. deploy branch `codex/postgres-cutover-v1`
4. รัน:
   - `npm run migrate:pg:schema`
   - `npm run migrate:chat:hot`
   - `npm run migrate:chat:archive`
   - `npm run migrate:pg:docs`
   - `npm run migrate:assets`
5. ตั้ง `CHAT_STORAGE_MODE=shadow` และ `APP_DOCUMENT_MODE=shadow` แล้วสังเกต server logs
6. รัน `npm run verify:pg:cutover`
7. ถ้าตรงทั้งหมดค่อยสลับ `CHAT_STORAGE_MODE=postgres`
8. หลังตรวจ read path non-chat ที่รองรับแล้วค่อยสลับ `APP_DOCUMENT_MODE=postgres`

## Current Scope

- เปลี่ยน chat read path สำหรับ:
  - `/admin/chat/users`
  - `/admin/chat/history/:userId`
  - `getChatHistory()`
  - `getAIHistory()`
  - `/assets/chat-images/:messageId/:imageIndex`
- asset route เดิมรองรับ bucket fallback แล้ว:
  - `/assets/instructions/:fileName`
  - `/assets/followup/:fileName`
  - `/broadcast/assets/:filename`
- write path chat หลักถูก mirror ไป PostgreSQL แล้ว:
  - `saveChatHistory()`
  - admin chat send/control
  - Facebook admin echo
  - follow-up assistant messages
- upload asset ใหม่จะ mirror ไป bucket แล้วสำหรับ:
  - instruction assets
  - follow-up assets
  - starter assets
  - broadcast uploads
- metadata สำคัญที่ถูก mirror ไป `app_documents` แล้ว:
  - `settings`
  - `instructions_v2` บน CRUD path หลัก
  - `instruction_assets`
  - `follow_up_assets`
  - `image_collections`
  - `follow_up_page_settings`
- non-chat collections มี migration script ไป `app_documents`
  - read path ที่รองรับ `APP_DOCUMENT_MODE=postgres` แล้ว:
    - settings / AI enable
    - follow-up base config และ page settings
    - bot runtime snapshot และ OpenAI API key lookup
    - instruction list/latest lookup และ instruction assets
    - chat user metadata: profiles, tags, unread counts, purchase status, follow-up status/tasks, orders
    - user order lookup สำหรับ chat และ AI tool context
  - write path ของ admin CRUD บางส่วนยังใช้ Mongo เป็น primary ใน phase นี้ จึงต้อง rollout แบบ dual-write + shadow ก่อน final cutover

## Notes

- inline base64 chat images จะถูก rewrite เป็น route เดิม `/assets/chat-images/:messageId/:imageIndex`
- hot chat ใช้ retention 60 วันใน PostgreSQL
- archive เก่ากว่า 60 วันจะถูก export เป็น `jsonl.gz` ลง bucket
