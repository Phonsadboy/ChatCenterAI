# Routes ที่ต้องลบออกจาก index.js

ตามแผน Phase 1 เราได้แยก routes ออกไปแล้วที่ `/routes/*.js` 
ดังนั้น routes เหล่านี้ใน `index.js` สามารถลบออกได้:

## 1. Asset Routes (บรรทัด ~133-240) ✅ ลบแล้ว
- GET /assets/instructions/:fileName
- GET /assets/followup/:fileName  
- GET /favicon.ico

## 2. Health & Root (บรรทัด ~5360-5380) ✅ ลบแล้ว
- GET /health
- GET / (redirect)

## 3. Instruction Library Routes (บรรทัด ~5365-5730)
- GET /admin/instructions/library
- GET /admin/instructions/library/:date
- POST /admin/instructions/library-now
- PUT /admin/instructions/library/:date
- DELETE /admin/instructions/library/:date
- POST /admin/instructions/restore/:date
- POST /admin/instructions/upload-excel
- POST /admin/instructions/preview-excel

## 4. Admin Root (บรรทัด ~5728)
- GET /admin (redirect)

## 5. LINE Webhook (บรรทัด ~5735-5800)
- POST /webhook/line/:botId

## 6. Facebook Webhook (บรรทัด ~5820-6180)
- GET /webhook/facebook/:botId
- POST /webhook/facebook/:botId

## 7. LINE Bot API (บรรทัด ~6850-7175)
- GET /api/line-bots
- GET /api/line-bots/:id
- POST /api/line-bots
- PUT /api/line-bots/:id
- DELETE /api/line-bots/:id
- POST /api/line-bots/:id/test
- PUT /api/line-bots/:id/instructions
- PUT /api/line-bots/:id/keywords

## 8. Facebook Bot API (บรรทัด ~7176-7555)
- POST /api/facebook-bots/init
- GET /api/facebook-bots
- GET /api/facebook-bots/:id
- POST /api/facebook-bots
- PUT /api/facebook-bots/:id
- DELETE /api/facebook-bots/:id
- POST /api/facebook-bots/:id/test
- PUT /api/facebook-bots/:id/instructions
- PUT /api/facebook-bots/:id/keywords

## 9. Instructions API (บรรทัด ~7556-7775)
- GET /api/instructions/library
- GET /api/instructions/library/:date/details
- GET /api/instructions
- GET /api/instructions/:instructionId/versions/:version

## 10. Admin Pages (บรรทัด ~7780-8850)
- GET /admin/dashboard
- GET /admin/settings
- POST /admin/ai-toggle
- POST /admin/instructions
- POST /admin/instructions/:id/delete
- GET /admin/instructions/:id/edit
- POST /admin/instructions/:id/edit
- GET /admin/instructions/export/json
- GET /admin/instructions/export/markdown
- GET /admin/instructions/export/excel
- GET /admin/instructions/preview
- POST /admin/instructions/reorder
- POST /admin/instructions/reorder/drag
- GET /admin/instructions/list
- GET /admin/instructions/assets
- POST /admin/instructions/assets/upload
- DELETE /admin/instructions/assets/:label

## 11. Image Collections (บรรทัด ~8572-8846)
- GET /admin/image-collections
- GET /admin/image-collections/:id
- POST /admin/image-collections
- PUT /admin/image-collections/:id
- DELETE /admin/image-collections/:id

## 12. Instructions Detail (บรรทัด ~8850-8910)
- DELETE /admin/instructions/:id
- GET /admin/instructions/:id/json

## 13. Broadcast (บรรทัด ~8910-9020)
- GET /admin/broadcast
- POST /admin/broadcast

## 14. Follow-up (บรรทัด ~9020-9400)
- GET /admin/followup
- GET /admin/followup/status
- GET /admin/followup/overview
- GET /admin/followup/users
- POST /admin/followup/clear
- GET /admin/followup/page-settings
- POST /admin/followup/page-settings
- DELETE /admin/followup/page-settings
- POST /admin/followup/assets/upload

## 15. Chat System (บรรทัด ~9410-9760)
- GET /admin/chat
- GET /admin/chat/users
- GET /admin/chat/user-status/:userId
- POST /admin/chat/user-status
- GET /admin/chat/history/:userId
- POST /admin/chat/send
- DELETE /admin/chat/clear/:userId
- GET /admin/chat/unread-count

## 16. Settings API (บรรทัด ~9790-10135)
- GET /api/settings
- POST /api/settings/chat
- POST /api/settings/ai
- POST /api/settings/system
- POST /api/settings/filter
- POST /api/filter/test

## 17. Facebook Comment (บรรทัด ~3570-3810)
- GET /admin/facebook-comment
- POST /admin/facebook-comment/create
- GET /admin/facebook-comment/get/:id
- POST /admin/facebook-comment/update
- POST /admin/facebook-comment/toggle/:id
- POST /admin/facebook-comment/delete/:id

## สรุป
รวมประมาณ **93 routes** ที่ต้องลบ/comment ออกจาก index.js
ประมาณ **5,000-6,000 บรรทัด** ที่จะลดลง

## วิธีการลบที่ปลอดภัย

เนื่องจากเรา register routes ใหม่ไว้แล้ว routes เก่าจะไม่ถูกใช้งาน
แต่การลบออกจะช่วยลดขนาดไฟล์และทำให้ code สะอาดขึ้น

### ขั้นตอนที่แนะนำ:
1. ✅ Backup ไฟล์เดิม (ทำผ่าน git)
2. ✅ Routes ใหม่ทำงานแล้ว (registered ใน index.js)
3. ⏳ ลบ routes เก่าทีละส่วน
4. ⏳ Test หลังแต่ละส่วน
5. ⏳ Verify ว่าทุกอย่างทำงานถูกต้อง

