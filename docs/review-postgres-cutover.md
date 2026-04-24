# Review PostgreSQL Cutover

โปรเจ็ก `review` ตัดมาที่ PostgreSQL-only แล้วสำหรับ runtime หลักทั้งหมด:

- `CHAT_STORAGE_MODE=postgres`
- `APP_DOCUMENT_MODE=postgres`
- `SESSION_STORE_MODE=postgres`
- `DATABASE_URL` เป็น required runtime env
- Railway Bucket ใช้เก็บ asset/object payload ที่ต้องอยู่นอกตารางหลัก

ระบบไม่มี legacy document-store fallback แล้ว ถ้าไม่มี `DATABASE_URL` ให้ถือว่า deploy ไม่สมบูรณ์และต้อง fail fast แทนการ fallback ไป backend อื่น

## Runtime State

- หน้าแชทอ่านจาก PostgreSQL native/read repository เมื่อเปิด `POSTGRES_NATIVE_READS=true`
- chat history และ metadata สำคัญถูกเก็บผ่าน PostgreSQL compatibility layer และ `app_documents`
- session admin ใช้ `connect-pg-simple`
- asset metadata อยู่ใน `asset_objects` และไฟล์อยู่ใน Railway Bucket หรือ fallback static path ที่กำหนดไว้

## Required Env

- `DATABASE_URL`
- `CHAT_STORAGE_MODE=postgres`
- `APP_DOCUMENT_MODE=postgres`
- `SESSION_STORE_MODE=postgres`
- `POSTGRES_NATIVE_READS=true`
- `POSTGRES_STATEMENT_TIMEOUT_MS=30000`
- `POSTGRES_MAX_POOL_SIZE=20`
- Railway Bucket env ถ้าต้องการเก็บ asset ใน object storage

## Operational Checks

หลัง deploy ให้ตรวจ:

1. `/health` ต้องตอบ `status=OK`, `database=connected`, `databaseBackend=postgres`
2. `railway status --json` ต้องมี service production เฉพาะ `web`, `Postgres`, `Redis`
3. `railway volume list` ต้องเหลือเฉพาะ `postgres-volume` และ `redis-volume`
4. `npm run verify:pg:native-performance` ต้องผ่านใน production container
5. Logs ต้องไม่มี `statement timeout` หรือ legacy storage/backend errors

## Notes

- inline base64 chat images ยังเสิร์ฟผ่าน route เดิม `/assets/chat-images/:messageId/:imageIndex`
- hot chat ใช้ retention 60 วันใน PostgreSQL
- เอกสารนี้เป็นสถานะหลัง cutover ไม่ใช่ migration playbook
