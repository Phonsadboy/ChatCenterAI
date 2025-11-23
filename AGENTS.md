# Repository Guidelines

## Project Structure & Module Organization
- `index.js` คือแอป Express/Socket.IO หลัก เชื่อม MongoDB, OpenAI, LINE/Facebook; ใช้ EJS ใน `views/` สำหรับ admin UI
- `public/` เก็บ asset ทั้งหมด (`css`, `js`, `assets/`); สี/ตัวแปรอยู่ใน `public/css/theme.css`, คอมโพเนนต์พื้นฐานใน `public/css/components.css`
- `services/` รวมอินทิเกรชันภายนอก, `utils/` เป็น helper ทั่วไป, `scripts/` สำหรับงานดูแล (เช่น cleanup legacy)
- `docs/` มีบันทึกการออกแบบและธีม (`docs/frontend-theme-spec.md`)

## Build, Test, and Development Commands
- `npm install` ติดตั้ง dependency (ต้องใช้ Node >=18)
- `npm run dev` รันเซิร์ฟเวอร์พร้อม auto-reload ผ่าน `nodemon`
- `npm start` โหมด production พื้นฐาน
- `npm run build` ปัจจุบันไม่มีขั้นตอน build (placeholder)
- `node scripts/drop-legacy-facebook-comment.js` ลบข้อมูลคอมเมนต์เก่า (ใช้เมื่อจำเป็นเท่านั้น)

## Coding Style & Naming Conventions
- JavaScript ใช้ semicolon, ย่อหน้า 2 ช่องว่าง, `const/let` แทน `var`, ใช้ `async/await` แทน promise chain
- ชื่อไฟล์ asset ใช้ kebab-case, ฟังก์ชัน/ตัวแปรใช้ camelCase, คลาส/คอนสตรักเตอร์ใช้ PascalCase
- UI: อ้างอิงตัวแปรสีจาก `theme.css` (`var(--color-primary-500)` เป็นต้น) และคอมโพเนนต์จาก `components.css`; แยกสไตล์เฉพาะหน้าเป็นไฟล์ย่อยใน `public/css/`
- EJS แยก partials ใน `views/admin/partials/` เมื่อเป็น layout หรือเมนูร่วม

## Testing Guidelines
- ยังไม่มี test suite กลาง; ถ้าเพิ่ม logic สำคัญ แนะนำวาง unit/integration test ใกล้ไฟล์ที่เกี่ยวข้อง (เช่น `services/__tests__/service.test.js` ด้วย Jest)
- สำหรับงาน UI ตรวจด้วยตนเองผ่าน `npm run dev` และทดสอบ flow หลัก (แชท, broadcast, orders, settings); แนบสกรีนช็อต/ขั้นตอนทดสอบใน PR

## Commit & Pull Request Guidelines
- คอมมิตปัจจุบันเป็นคำสั้น ๆ (ไทย/อังกฤษ); ให้อยู่ในรูปคำสั่งสั้นและชัด เช่น `ปรับ theme chat ใหม่`, `fix follow-up timezone`
- หนึ่งฟีเจอร์หรือแก้บั๊กต่อหนึ่งคอมมิต; อธิบายการเปลี่ยนแปลง/ผลกระทบ config ในข้อความ PR
- PR ควรระบุ: วัตถุประสงค์, การเปลี่ยนแปลง schema/สคริปต์, env ที่ต้องตั้งเพิ่ม, ขั้นตอนทดสอบ, สกรีนช็อต UI ที่เกี่ยวข้อง
- หลีกเลี่ยงการ commit ความลับ; ใช้ `.env` ตาม `env.example` และตรวจสอบค่าใน `index.js` ก่อนเผย endpoints ใหม่

## Security & Configuration Tips
- ใช้ค่า `.env` สำหรับคีย์ทั้งหมด (OpenAI, Mongo, LINE/Facebook); ห้ามฝังคีย์ในโค้ดหรือ EJS
- ตรวจสอบการ sanitization ของ input ทุกจุด (ObjectId, path, file upload) และคง middleware `helmet`/rate-limit เมื่อเพิ่ม route ใหม่
- Assets ภายใน `public/assets/*` สามารถตั้งค่า base URL ผ่าน `PUBLIC_BASE_URL`; ถ้าเสิร์ฟจาก CDN ให้กำหนด SRI/เวอร์ชันคงที่
