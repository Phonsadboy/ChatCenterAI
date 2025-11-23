# สเปคธีม & แผน rollout (โทนเทา-น้ำเงินหม่น)

## Design Tokens (v1)
- Color
  - `--color-primary`: #4A6FA5
  - `--color-primary-light`: #6F92C2
  - `--color-primary-dark`: #365983
  - `--color-accent`: #E6B75C (ใช้เฉพาะ badge/จุดเน้นรอง)
  - `--color-success`: #2D8F6F
  - `--color-warning`: #DFA94B
  - `--color-danger`: #D2555A
  - `--color-info`: #3D7FC1
  - Neutral: `--bg-body` #F6F7FB, `--bg-card` #FFFFFF, `--border` #E1E5EF, `--text-main` #1E2430, `--text-sub` #5C6372, `--text-muted` #8B92A3
  - Overlay: `--overlay` rgba(18, 25, 38, 0.35)
  - Focus ring: `--focus` #A5B8D9
- Typography
  - Font stack: `"Inter", "Mali", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  - Base size: 15px (0.9375rem), line-height 1.5
  - Scale: h1 28, h2 24, h3 20, h4 18, h5 16, h6 15 (น้ำหนัก 600)
  - Body weight: 400/500, Button weight: 600
- Spacing (4px scale): 4, 8, 12, 16, 20, 24
- Radius: 10px (card), 8px (input/button), 999px (pill)
- Shadow: ปิดเป็นค่าเริ่มต้น; ใช้เฉพาะ `shadow-sm: 0 1px 3px rgba(0,0,0,0.06)`
- Transition: `all 0.2s ease`

## Core Components (มาตรฐาน)
- Buttons: solid (primary/success/danger), ghost (bordered), subtle (text + bg-hover); ไม่มีกราเดียนต์/เงา default; focus ring 2px `--focus`
- Cards: bg card, border 1px `--border`, radius 10px, shadow-sm optional; header 14–16px semi-bold
- Form: input/select/textarea radius 8px, border `--border`, focus ring `--focus`; label 14px/500; helper 12–13px/`--text-muted`
- Navbar: สูง ~56px, bg `--bg-card`, border-bottom `--border`, link ใช้ primary บน hover/active
- Badges/Pills: radius 999px, น้ำหนัก 600, ขนาด 12–13px; ใช้ palette ตามสถานะ
- Toast: card radius 10px, border-left 3px ตามสถานะ, shadow-sm; ปุ่มปิดชัดเจน
- Loading: skeleton 2 สี (border + highlight), spinner ใช้ primary; overlay ใช้ `--overlay`
- Empty state: ไอคอน 48–64px + title 18px + desc 14px + CTA (primary/ghost)
- Tables: header sticky, font 14px, row hover `rgba(primary,0.04)`, responsive card stack บน <768px
- Layout: ใช้ container-fluid + content max 1280px; sticky action bar เมื่อต้องมี CTA หลักบนจอยาว

## A11y & Interaction
- Contrast: สีหลักกับพื้นหลัง ≥ 4.5:1 (ปุ่ม/ลิงก์/ข้อความสำคัญ)
- Focus visible: ring หนา 2px `--focus` ทุก interactive
- Semantics: selection-card/ป้ายที่เป็นปุ่มให้ใช้ `<button>` + `aria-pressed`/`aria-selected`; list ใช้ `<ul>/<li>`; modal trap focus
- Keyboard: Tab/Shift+Tab ครบ, Enter/Space activate, Esc ปิด modal/overlay
- Motion: หลีกเลี่ยง animation เกิน 200ms; provide `prefers-reduced-motion` fallback

## Responsive Patterns (มาตรฐาน)
- Breakpoints: 576 / 768 / 992 / 1200
- Sidebar: fixed overlay บน <992; push-in layout บน ≥992
- Tables: แปลงเป็นการ์ด stack บน <768 พร้อม label (data-label) และ action bar ที่กดง่าย
- Header/CTA: sticky top bar สำหรับฟิลเตอร์/ปุ่มสำคัญบน mobile
- Safe area: padding bottom สำหรับ input/CTA ที่ชิดขอบจอ (iOS)

## Rollout Plan (ลำดับแนะนำ)
1) Foundation
   - สร้างไฟล์ tokens ใหม่ (เช่น `css/theme.css`) แล้ว refactor `style.css` ให้ใช้ตัวแปรชุดนี้
   - ตั้งฟอนต์/ขนาด base + reset shadow/gradient ออกจากปุ่ม/การ์ดทั่วระบบ
2) Partial/Layout กลาง
   - Navbar/Topbar ใหม่ + sticky action bar + toast/loading/empty state component
   - Utilities: spacing, text, flex/grid helper ตามสเกลด้านบน
3) หน้าเสี่ยงสูง/ใช้งานบ่อย
   - แชทแอดมิน: จัด sidebar/responsive, เพิ่ม time separator/typing/send status, ปุ่มเรียก order sidebar บน mobile, badge unread ใหม่
   - แดชบอร์ด Instruction + edit/ data item: ย้าย inline CSS, ทำ preview panel, action menu, skeleton/loading, autosave warning
4) Data-heavy
   - ออเดอร์: ปรับ palette, group filter (หลัก/เสริม), preset วัน, table card mobile, sticky bulk/action bar
   - ติดตามลูกค้า: split selector vs list, summary bar ติดบน, filter pills พร้อม count, timeline ส่งถัดไป
5) ช่องทาง Facebook
   - Posts/Comment: layout คงที่, การ์ดโพสต์มีสถานะ/วันที่/จำนวนคอมเมนต์, reply-type เป็นปุ่ม semantic, state sync/refresh + empty/skeleton
6) Settings
   - Consolidate v1 → v2: ใช้ธีมใหม่, sidebar มี aria/keyboard, skeleton/empty สำหรับ list bot/collection, focus ring toggles

## แนวทางดำเนินการ (สั้น)
- เริ่มจากการเพิ่ม tokens + theme.css แล้ว import ก่อน style.css เพื่อ migrate ทีละกลุ่ม
- เปลี่ยนปุ่ม/การ์ดให้ใช้ class กลาง (btn-solid/btn-ghost/btn-danger/card) ลบเงา/กราเดียนต์
- แทน selection-card ด้วย `<button>`/`<label>` + aria, เพิ่ม focus ring
- ตั้ง responsive table helper (data-label) และ card list component สำหรับ mobile
- ใช้ toast/loading/empty state กลางในทุกหน้า; ตั้ง SRI หรือ self-host CDN เวอร์ชันคงที่
