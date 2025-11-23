# เอกสารการออกแบบระบบ Import / Export ข้อมูล Instruction (ฉบับแก้ไข v2)

## 1. บทนำ (Introduction)

เอกสารฉบับนี้อธิบายแนวทางการปรับปรุงระบบ Import และ Export สำหรับข้อมูล **Instruction (ชุดคำสั่ง)** ภายใน ChatCenterAI Dashboard โดยเน้นความยืดหยุ่นในการนำเข้าข้อมูล ซึ่งยึดหลักการว่า **"1 แท็บ (Sheet) ในไฟล์ Excel เท่ากับ 1 ชุดข้อมูล (Dataset)"** ที่สามารถเลือกปลายทางได้อย่างอิสระ

## 2. วัตถุประสงค์ (Objectives)

1.  **Flexible Mapping:** ผู้ใช้สามารถเลือกจับคู่ (Map) ระหว่าง Sheet ในไฟล์ Excel กับ Instruction ปลายทางได้อย่างอิสระ
2.  **Create or Append:** รองรับทั้งการสร้าง Instruction ใหม่ (ตั้งชื่อใหม่ได้) หรือเพิ่มข้อมูลลงใน Instruction เดิม
3.  **Focus on Content:** จัดการเฉพาะเนื้อหาข้อมูลภายใน (Rows/Columns) ของแต่ละ Instruction
4.  **Visual Confirmation:** มีหน้าจอ Preview ให้ตรวจสอบก่อนยืนยันการนำเข้า

## 3. ขอบเขตข้อมูล (Data Scope)

*   **Input:** ไฟล์ Excel (`.xlsx`) ที่มีหนึ่งหรือหลาย Sheet
*   **Structure:**
    *   1 Sheet = 1 ชุดข้อมูล
    *   Row 1 = Headers (หัวตาราง)
    *   Row 2+ = Data (เนื้อหา)

## 4. ขั้นตอนการทำงาน (Workflow Design)

### 4.1 ขั้นตอนการ Import (ละเอียด)

1.  **Upload:**
    *   ผู้ใช้กดปุ่ม "Import" และเลือกไฟล์ Excel
2.  **Analyze & Preview:**
    *   ระบบอ่านไฟล์และแสดงรายการ Sheet ทั้งหมดที่พบในไฟล์
3.  **Configuration (หัวใจสำคัญ):**
    *   ระบบแสดงตารางรายการ Sheet ที่พบ
    *   ในแต่ละ Sheet ผู้ใช้จะมีตัวเลือก (Dropdown/Input) ดังนี้:
        *   **Source:** ชื่อ Sheet (แสดงผล)
        *   **Action:** เลือก action ที่ต้องการ:
            *   `Create New` (สร้างใหม่) -> แสดงช่อง Input ให้ตั้งชื่อ Instruction (Default = ชื่อ Sheet)
            *   `Add to Existing` (เพิ่มลงในที่มีอยู่) -> แสดง Dropdown รายชื่อ Instruction ที่มีในระบบให้เลือก
            *   `Ignore` (ไม่นำเข้า) -> ข้าม Sheet นี้ไป
        *   **Mode (กรณี Add to Existing):**
            *   `Append` (ต่อท้ายข้อมูลเดิม)
            *   `Replace` (ล้างข้อมูลเดิมแล้วใส่ใหม่)
4.  **Execution:**
    *   เมื่อกด "Confirm Import" ระบบจะประมวลผลตาม Configuration ที่ตั้งไว้ทีละ Sheet
5.  **Result:**
    *   แสดงสรุปผลการทำงาน (เช่น "สร้างใหม่ 1 รายการ, อัปเดต 1 รายการ")

**Scenario ตัวอย่าง:**
*   ไฟล์ `my_shop_data.xlsx` มี 2 Sheets: `Sheet1` และ `Sheet2`
*   **User Action:**
    *   `Sheet1`: เลือก `Add to Existing` -> เลือก Instruction "สินค้าเครื่องใช้ไฟฟ้า" -> Mode `Append` (เพิ่มข้อมูล TV, Fridge เข้าไปในชุดข้อมูลเครื่องใช้ไฟฟ้าที่มีอยู่แล้ว)
    *   `Sheet2`: เลือก `Create New` -> ตั้งชื่อใหม่ว่า "โปรโมชั่นพิเศษสิ้นปี" (สร้าง Instruction ใหม่จากข้อมูลใน Sheet2)

### 4.2 ขั้นตอนการ Export
1.  เลือก Instruction ที่ต้องการ (Checkbox Select)
2.  กดปุ่ม "Export"
3.  ระบบสร้างไฟล์ Excel 1 ไฟล์ โดยแต่ละ Instruction ที่เลือกจะถูกแยกเป็นคนละ Sheet (ชื่อ Sheet = ชื่อ Instruction)

## 5. รายละเอียดทางเทคนิค (Technical Implementation)

### 5.1 API Endpoints
*   `POST /api/instructions/preview-import`
    *   Input: Excel File
    *   Output: JSON List of Sheets + Preview Data (5 rows)
*   `POST /api/instructions/execute-import`
    *   Input:
        ```json
        {
          "mappings": [
            { "sheetName": "Sheet1", "action": "create", "targetName": "New Name" },
            { "sheetName": "Sheet2", "action": "update", "targetId": "inst_123", "mode": "append" }
          ],
          "fileToken": "temp_file_token_from_preview"
        }
        ```

---
*เอกสารนี้เป็นส่วนหนึ่งของโครงการ ChatCenterAI*
