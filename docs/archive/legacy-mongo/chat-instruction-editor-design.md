> Historical pre-PostgreSQL design note. Archived after MongoDB runtime removal.

# Chat-based Instruction Editor (Demo)

## เอกสารออกแบบระบบ — ฉบับเต็ม

> **วันที่**: 22 กุมภาพันธ์ 2026  
> **สถานะ**: Draft — Design Document  
> **เป้าหมาย**: สร้างหน้าแชทที่ผู้ใช้สามารถ **เลือก Instruction → สนทนาสั่งตรวจสอบ / สอบถาม / แก้ไข** ผ่าน AI Agent

---

## 1. ภาพรวมระบบ (Overview)

### 1.1 แนวคิดหลัก

ระบบนี้เป็น **AI Agent** ที่มี tool เรียกดู/แก้ไขข้อมูล Instruction อย่างละเอียด ผู้ใช้สามารถ:

1. **เลือก Instruction** ที่ต้องการจัดการ
2. **แชทสั่งงาน** — สอบถาม ตรวจสอบ หรือสั่งแก้ไขเนื้อหา
3. AI จะใช้ **Tool Calling** เพื่อดึง/แก้ข้อมูลแบบ granular (ไม่ส่ง instruction ทั้งหมดทีเดียว)
4. มีระบบ **RAG** เพื่อค้นหาส่วนที่เกี่ยวข้องได้อย่างแม่นยำ

### 1.2 ทำไมต้อง Agent + Tools (ไม่ส่งทั้งหมด)

| ปัญหาแบบส่งทั้งหมด | แก้ด้วย Agent + Tools |
|---|---|
| Instruction อาจมีข้อมูลหลายพัน rows → เกิน context limit | ดึงเฉพาะส่วนที่ต้องการ (rows, columns, search) |
| ส่ง token มากเกินไป → ค่าใช้จ่ายสูง | ดึงแค่ที่จำเป็น → ประหยัด token |
| AI อาจ hallucinate เมื่อเจอข้อมูลมาก | โฟกัสข้อมูลที่เกี่ยวข้อง → ตอบแม่นยำกว่า |
| แก้ไขทั้ง instruction → เสี่ยง overwrite ข้อมูล | แก้ทีละ row/cell → ปลอดภัย, ย้อนกลับได้ |

### 1.3 Data Model อ้างอิง (ของเดิมใน `instructions_v2`)

```
Instruction {
  _id, instructionId, name, description,
  dataItems: [
    {
      itemId, title, type: "text" | "table",
      content: string,         // สำหรับ type=text
      data: { columns, rows }, // สำหรับ type=table
      order, createdAt, updatedAt
    }
  ],
  usageCount, isActive, createdAt, updatedAt
}
```

---

## 2. สถาปัตยกรรม (Architecture)

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Browser)                    │
│                                                         │
│  ┌──────────────┐  ┌──────────────────────────────────┐ │
│  │ Instruction  │  │         Chat Panel               │ │
│  │  Selector    │  │  ┌────────────────────────────┐  │ │
│  │              │  │  │    Message History          │  │ │
│  │ - List       │  │  │    (user + AI messages)     │  │ │
│  │ - Search     │  │  │    + Tool result cards      │  │ │
│  │ - Preview    │  │  └────────────────────────────┘  │ │
│  │              │  │  ┌────────────────────────────┐  │ │
│  │              │  │  │    Input + Send Button      │  │ │
│  │              │  │  └────────────────────────────┘  │ │
│  └──────────────┘  └──────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────┘
                            │ POST /api/instruction-chat
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend (Node.js)                      │
│                                                         │
│  ┌─────────────────┐   ┌──────────────────────────┐    │
│  │ Chat Controller │──▶│  OpenAI API (Tool Loop)   │    │
│  │                 │   │  - System Prompt           │    │
│  │  - Session mgmt │   │  - Tool definitions        │   │
│  │  - History mgmt │   │  - Max 8 tool iterations    │   │
│  └─────────────────┘   └──────────┬───────────────┘    │
│                                   │ tool_calls          │
│                                   ▼                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Tool Executor                        │   │
│  │                                                   │   │
│  │  READ Tools          WRITE Tools     RAG Tools    │   │
│  │  ─────────           ───────────     ─────────    │   │
│  │  get_overview        update_cell     search_content│  │
│  │  get_data_item       add_row         find_similar  │  │
│  │  get_rows            delete_row                    │  │
│  │  get_columns         update_text                   │  │
│  │  search_in_table     add_data_item                 │  │
│  │  get_text_content    rename_item                   │  │
│  └──────────────────────────┬───────────────────────┘   │
│                             ▼                           │
│  ┌────────────────────┐  ┌────────────────────────┐    │
│  │   MongoDB          │  │  RAG Index (In-Memory)  │    │
│  │   instructions_v2  │  │  - Chunk + Embedding    │    │
│  └────────────────────┘  └────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Flow หลัก

```
1. ผู้ใช้เลือก Instruction จาก sidebar
2. Frontend โหลด overview (ชื่อ, จำนวน data items, สรุป)
3. ผู้ใช้พิมพ์คำสั่ง เช่น "ดูราคาสินค้า A"
4. Backend ส่ง message + history → OpenAI (พร้อม tools)
5. AI ตัดสินใจเรียก tool เช่น search_in_table(keyword="สินค้า A")
6. Backend execute tool → return ผลลัพธ์ให้ AI
7. AI สรุปผลตอบผู้ใช้
8. (ถ้าสั่งแก้) AI เรียก update_cell(...) → Backend แก้ DB → ยืนยันกลับ
```

---

## 3. AI Tools — รายละเอียดทั้งหมด

### 3.1 READ Tools (อ่านข้อมูล)

#### `get_instruction_overview`
> **จุดประสงค์**: ดูภาพรวมของ instruction ที่เลือก (ไม่ดึงเนื้อหาทั้งหมด)

```json
{
  "name": "get_instruction_overview",
  "description": "ดูภาพรวมของ instruction: ชื่อ, description, จำนวน data items, สรุปแต่ละ item (title, type, row count, column names) — ไม่ดึงเนื้อหาจริง",
  "parameters": {}
}
```

**Response ตัวอย่าง:**
```json
{
  "name": "รายการสินค้า ปี 2026",
  "description": "ข้อมูลสินค้าทุกหมวดหมู่",
  "dataItems": [
    { "itemId": "item_abc123", "title": "สินค้าหมวด A", "type": "table", "rowCount": 250, "columns": ["ชื่อ", "รหัส", "ราคา", "สต็อก"] },
    { "itemId": "item_def456", "title": "นโยบายการขาย", "type": "text", "charCount": 1200 },
    { "itemId": "item_ghi789", "title": "สินค้าหมวด B", "type": "table", "rowCount": 180, "columns": ["ชื่อ", "ขนาด", "น้ำหนัก", "ราคา"] }
  ]
}
```

#### `get_data_item_detail`
> **จุดประสงค์**: ดูรายละเอียดของ data item ตัวเดียว

```json
{
  "name": "get_data_item_detail",
  "description": "ดูข้อมูลของ data item: ถ้าเป็น text ดึง content บางส่วน, ถ้าเป็น table ดึง columns + preview 5 rows แรก",
  "parameters": {
    "itemId": { "type": "string", "description": "ID ของ data item" }
  }
}
```

#### `get_rows`
> **จุดประสงค์**: ดึงแถวจากตาราง (pagination)

```json
{
  "name": "get_rows",
  "description": "ดึงแถวจาก data item ประเภทตาราง แบบแบ่งหน้า",
  "parameters": {
    "itemId": { "type": "string" },
    "startRow": { "type": "number", "description": "แถวเริ่มต้น (0-indexed)" },
    "limit": { "type": "number", "description": "จำนวนแถว (max 50, default 20)" },
    "columns": {
      "type": "array", "items": { "type": "string" },
      "description": "เลือกเฉพาะคอลัมน์ที่ต้องการ (optional, default=ทุกคอลัมน์)"
    }
  }
}
```

#### `get_text_content`
> **จุดประสงค์**: ดึงเนื้อหา text แบบ chunk

```json
{
  "name": "get_text_content",
  "description": "ดึงเนื้อหาของ data item ประเภท text แบบแบ่ง chunk",
  "parameters": {
    "itemId": { "type": "string" },
    "startChar": { "type": "number", "description": "ตำแหน่งเริ่มต้น (default 0)" },
    "length": { "type": "number", "description": "จำนวนตัวอักษร (max 2000, default 1000)" }
  }
}
```

#### `search_in_table`
> **จุดประสงค์**: ค้นหาข้อมูลในตาราง

```json
{
  "name": "search_in_table",
  "description": "ค้นหาแถวในตารางที่มี keyword ตรงกับคอลัมน์ที่ระบุ (หรือทุกคอลัมน์)",
  "parameters": {
    "itemId": { "type": "string" },
    "keyword": { "type": "string" },
    "column": { "type": "string", "description": "ค้นเฉพาะคอลัมน์นี้ (optional)" },
    "matchMode": {
      "type": "string", "enum": ["contains", "exact", "startsWith"],
      "description": "วิธีจับคู่ (default: contains)"
    },
    "limit": { "type": "number", "description": "จำกัดผลลัพธ์ (max 30, default 10)" }
  }
}
```

### 3.2 WRITE Tools (แก้ไขข้อมูล)

#### `update_cell`
> **จุดประสงค์**: แก้ไขค่าใน cell เดียว

```json
{
  "name": "update_cell",
  "description": "แก้ไขค่าของ cell ในตาราง ระบุแถวและคอลัมน์",
  "parameters": {
    "itemId": { "type": "string" },
    "rowIndex": { "type": "number", "description": "ลำดับแถว (0-indexed)" },
    "column": { "type": "string", "description": "ชื่อคอลัมน์" },
    "newValue": { "type": "string", "description": "ค่าใหม่" }
  }
}
```

#### `update_rows_bulk`
> **จุดประสงค์**: แก้ไขหลาย cell พร้อมกัน

```json
{
  "name": "update_rows_bulk",
  "description": "แก้ไขหลาย cell ในตารางพร้อมกัน",
  "parameters": {
    "itemId": { "type": "string" },
    "updates": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "rowIndex": { "type": "number" },
          "column": { "type": "string" },
          "newValue": { "type": "string" }
        }
      }
    }
  }
}
```

#### `add_row`
> **จุดประสงค์**: เพิ่มแถวใหม่ในตาราง

```json
{
  "name": "add_row",
  "description": "เพิ่มแถวใหม่ในตาราง",
  "parameters": {
    "itemId": { "type": "string" },
    "rowData": {
      "type": "object",
      "description": "ข้อมูลแถว key=ชื่อคอลัมน์ value=ค่า"
    },
    "position": {
      "type": "string", "enum": ["start", "end", "after"],
      "description": "ตำแหน่ง (default: end)"
    },
    "afterRowIndex": { "type": "number", "description": "ถ้า position=after ให้ใส่ index" }
  }
}
```

#### `delete_row`
```json
{
  "name": "delete_row",
  "description": "ลบแถวในตาราง",
  "parameters": {
    "itemId": { "type": "string" },
    "rowIndex": { "type": "number" }
  }
}
```

#### `update_text_content`
> **จุดประสงค์**: แก้ไขเนื้อหา text

```json
{
  "name": "update_text_content",
  "description": "แก้ไขเนื้อหาของ data item ประเภท text — รองรับ replace, append, prepend",
  "parameters": {
    "itemId": { "type": "string" },
    "mode": { "type": "string", "enum": ["replace_all", "find_replace", "append", "prepend"] },
    "content": { "type": "string", "description": "เนื้อหาใหม่ (สำหรับ replace_all, append, prepend)" },
    "find": { "type": "string", "description": "ข้อความที่จะหา (สำหรับ find_replace)" },
    "replaceWith": { "type": "string", "description": "ข้อความแทนที่ (สำหรับ find_replace)" }
  }
}
```

#### `add_column` / `rename_column` / `delete_column`
```json
{
  "name": "add_column",
  "parameters": {
    "itemId": { "type": "string" },
    "columnName": { "type": "string" },
    "defaultValue": { "type": "string" },
    "position": { "type": "string", "enum": ["start", "end", "after"] },
    "afterColumn": { "type": "string" }
  }
}
```

### 3.3 RAG Tools (ค้นหาอัจฉริยะ)

#### `search_content`
> **จุดประสงค์**: ค้นหาเนื้อหาทั้ง instruction (ทุก data item) ด้วย keyword/semantic

```json
{
  "name": "search_content",
  "description": "ค้นหาเนื้อหาเกี่ยวข้องทั้ง instruction — ค้นทั้ง text content และ table data ทุก item — ส่งคืน snippet + ตำแหน่ง",
  "parameters": {
    "query": { "type": "string", "description": "สิ่งที่ต้องการค้นหา" },
    "limit": { "type": "number", "description": "จำนวนผลลัพธ์สูงสุด (default 5)" }
  }
}
```

**Response ตัวอย่าง:**
```json
{
  "results": [
    {
      "itemId": "item_abc123",
      "itemTitle": "สินค้าหมวด A",
      "type": "table",
      "matchType": "row",
      "rowIndex": 42,
      "snippet": { "ชื่อ": "โฟม PU 3 นิ้ว", "ราคา": "2,350" },
      "relevanceScore": 0.92
    },
    {
      "itemId": "item_def456",
      "itemTitle": "นโยบายการขาย",
      "type": "text",
      "matchType": "text_chunk",
      "charRange": [200, 450],
      "snippet": "...สินค้าโฟม PU ทุกรุ่นมีส่วนลด 10% เมื่อสั่ง...",
      "relevanceScore": 0.85
    }
  ]
}
```

---

## 3.4 ตัวอย่าง Tool Response ที่ AI เห็น (ทุก Tool)

> ข้อมูลด้านล่างคือ JSON ที่ AI ได้รับกลับมาจาก tool แต่ละตัว (role: `tool` message)

### READ Tools

#### `get_instruction_overview` → AI เห็น:
```json
{
  "name": "รายการสินค้า ปี 2026",
  "description": "ข้อมูลสินค้าทุกหมวดหมู่",
  "totalDataItems": 3,
  "dataItems": [
    { "itemId": "item_abc123", "title": "สินค้าหมวด A", "type": "table", "rowCount": 250, "columns": ["ชื่อ", "รหัส", "ราคา", "สต็อก"] },
    { "itemId": "item_def456", "title": "นโยบายการขาย", "type": "text", "charCount": 1200, "preview": "นโยบายส่วนลดสำหรับลูกค้าที่สั่ง..." },
    { "itemId": "item_ghi789", "title": "สินค้าหมวด B", "type": "table", "rowCount": 180, "columns": ["ชื่อ", "ขนาด", "น้ำหนัก", "ราคา"] }
  ]
}
```

#### `get_data_item_detail` → AI เห็น (table):
```json
{
  "itemId": "item_abc123",
  "title": "สินค้าหมวด A",
  "type": "table",
  "rowCount": 250,
  "columns": ["ชื่อ", "รหัส", "ราคา", "สต็อก"],
  "previewRows": [
    { "rowIndex": 0, "ชื่อ": "โฟม PU 2 นิ้ว", "รหัส": "PU-002", "ราคา": "1,850", "สต็อก": "120" },
    { "rowIndex": 1, "ชื่อ": "โฟม PU 3 นิ้ว", "รหัส": "PU-003", "ราคา": "2,350", "สต็อก": "45" },
    { "rowIndex": 2, "ชื่อ": "โฟม PU 4 นิ้ว", "รหัส": "PU-004", "ราคา": "2,900", "สต็อก": "78" },
    { "rowIndex": 3, "ชื่อ": "โฟม PE 2 นิ้ว", "รหัส": "PE-002", "ราคา": "980", "สต็อก": "200" },
    { "rowIndex": 4, "ชื่อ": "โฟม PE 3 นิ้ว", "รหัส": "PE-003", "ราคา": "1,250", "สต็อก": "150" }
  ],
  "hasMore": true,
  "note": "แสดง 5 แถวแรกจาก 250 แถว — ใช้ get_rows เพื่อดูเพิ่มเติม"
}
```

#### `get_data_item_detail` → AI เห็น (text):
```json
{
  "itemId": "item_def456",
  "title": "นโยบายการขาย",
  "type": "text",
  "charCount": 1200,
  "preview": "นโยบายส่วนลดสำหรับลูกค้าที่สั่งซื้อสินค้า:\n\n1. สั่งซื้อ 10 ชิ้นขึ้นไป ลด 5%\n2. สั่งซื้อ 50 ชิ้นขึ้นไป ลด 10%\n3. สั่งซื้อ 100 ชิ้นขึ้นไป ลด 15%\n\nหมายเหตุ: ส่วนลดนี้ไม่สามารถใช้ร่วมกับโปรโมชั่นอื่น...",
  "hasMore": true,
  "note": "แสดง 500 ตัวอักษรแรกจาก 1,200 — ใช้ get_text_content เพื่อดูเพิ่มเติม"
}
```

#### `get_rows` → AI เห็น:
```json
{
  "itemId": "item_abc123",
  "totalRows": 250,
  "startRow": 40,
  "endRow": 44,
  "columns": ["ชื่อ", "รหัส", "ราคา", "สต็อก"],
  "rows": [
    { "rowIndex": 40, "ชื่อ": "แผ่นอะคริลิค 3mm", "รหัส": "AC-003", "ราคา": "450", "สต็อก": "300" },
    { "rowIndex": 41, "ชื่อ": "แผ่นอะคริลิค 5mm", "รหัส": "AC-005", "ราคา": "780", "สต็อก": "180" },
    { "rowIndex": 42, "ชื่อ": "โฟม PU 3 นิ้ว พรีเมียม", "รหัส": "PUP-003", "ราคา": "3,200", "สต็อก": "22" },
    { "rowIndex": 43, "ชื่อ": "โฟม PU 4 นิ้ว พรีเมียม", "รหัส": "PUP-004", "ราคา": "4,100", "สต็อก": "15" },
    { "rowIndex": 44, "ชื่อ": "แผ่นโพลีคาร์บอเนต", "รหัส": "PC-001", "ราคา": "1,200", "สต็อก": "90" }
  ],
  "hasMore": true
}
```

#### `get_text_content` → AI เห็น:
```json
{
  "itemId": "item_def456",
  "totalChars": 1200,
  "startChar": 0,
  "endChar": 500,
  "content": "นโยบายส่วนลดสำหรับลูกค้าที่สั่งซื้อสินค้า:\n\n1. สั่งซื้อ 10 ชิ้นขึ้นไป ลด 5%\n2. สั่งซื้อ 50 ชิ้นขึ้นไป ลด 10%\n3. สั่งซื้อ 100 ชิ้นขึ้นไป ลด 15%\n\nหมายเหตุ: ส่วนลดนี้ไม่สามารถใช้ร่วมกับโปรโมชั่นอื่น...",
  "hasMore": true
}
```

#### `search_in_table` → AI เห็น:
```json
{
  "itemId": "item_abc123",
  "keyword": "โฟม PU",
  "matchMode": "contains",
  "totalMatches": 4,
  "results": [
    { "rowIndex": 0, "ชื่อ": "โฟม PU 2 นิ้ว", "รหัส": "PU-002", "ราคา": "1,850", "สต็อก": "120" },
    { "rowIndex": 1, "ชื่อ": "โฟม PU 3 นิ้ว", "รหัส": "PU-003", "ราคา": "2,350", "สต็อก": "45" },
    { "rowIndex": 2, "ชื่อ": "โฟม PU 4 นิ้ว", "รหัส": "PU-004", "ราคา": "2,900", "สต็อก": "78" },
    { "rowIndex": 42, "ชื่อ": "โฟม PU 3 นิ้ว พรีเมียม", "รหัส": "PUP-003", "ราคา": "3,200", "สต็อก": "22" }
  ]
}
```

### WRITE Tools

#### `update_cell` → AI เห็น:
```json
{
  "success": true,
  "itemId": "item_abc123",
  "rowIndex": 1,
  "column": "ราคา",
  "before": "2,350",
  "after": "2,500",
  "changeId": "chg_a1b2c3"
}
```

#### `update_rows_bulk` → AI เห็น:
```json
{
  "success": true,
  "itemId": "item_abc123",
  "updatedCount": 3,
  "changes": [
    { "rowIndex": 0, "column": "ราคา", "before": "1,850", "after": "1,950" },
    { "rowIndex": 1, "column": "ราคา", "before": "2,500", "after": "2,600" },
    { "rowIndex": 2, "column": "ราคา", "before": "2,900", "after": "3,000" }
  ],
  "changeId": "chg_d4e5f6"
}
```

#### `add_row` → AI เห็น:
```json
{
  "success": true,
  "itemId": "item_abc123",
  "newRowIndex": 250,
  "rowData": { "ชื่อ": "Foam XL", "รหัส": "FXL-001", "ราคา": "4,500", "สต็อก": "20" },
  "newTotalRows": 251,
  "changeId": "chg_g7h8i9"
}
```

#### `delete_row` → AI เห็น:
```json
{
  "success": true,
  "itemId": "item_abc123",
  "deletedRowIndex": 42,
  "deletedData": { "ชื่อ": "โฟม PU 3 นิ้ว พรีเมียม", "รหัส": "PUP-003", "ราคา": "3,200", "สต็อก": "22" },
  "newTotalRows": 249,
  "changeId": "chg_j0k1l2"
}
```

#### `update_text_content` → AI เห็น (find_replace):
```json
{
  "success": true,
  "itemId": "item_def456",
  "mode": "find_replace",
  "find": "ลด 10%",
  "replaceWith": "ลด 12%",
  "matchesReplaced": 1,
  "changeId": "chg_m3n4o5"
}
```

### RAG Tool

#### `search_content` → AI เห็น:
```json
{
  "query": "ส่วนลดโปรโมชั่น",
  "totalResults": 3,
  "results": [
    {
      "itemId": "item_def456",
      "itemTitle": "นโยบายการขาย",
      "type": "text",
      "matchType": "text_chunk",
      "charRange": [0, 350],
      "snippet": "นโยบายส่วนลดสำหรับลูกค้าที่สั่งซื้อสินค้า:\n1. สั่งซื้อ 10 ชิ้นขึ้นไป ลด 5%...",
      "relevanceScore": 0.95
    },
    {
      "itemId": "item_abc123",
      "itemTitle": "สินค้าหมวด A",
      "type": "table",
      "matchType": "row",
      "rowIndex": 15,
      "snippet": { "ชื่อ": "โปรโมชั่นเซ็ต A+B", "ราคา": "5,500", "สต็อก": "50" },
      "relevanceScore": 0.78
    }
  ]
}
```

> **สรุป**: ทุก tool จะ return ข้อมูลแบบ **structured JSON** ที่มี:
> - ข้อมูลที่ดึง/แก้ไขจริง (ไม่ใช่ข้อมูลทั้งหมด)
> - `rowIndex` เพื่อ reference ตำแหน่งที่แน่นอน
> - `before`/`after` สำหรับ write tools เพื่อ confirm การเปลี่ยนแปลง
> - `changeId` สำหรับ undo
> - `hasMore` flag สำหรับ pagination

## 4. ระบบ RAG (Retrieval-Augmented Generation)

### 4.1 กลยุทธ์ RAG

เนื่องจาก instruction อาจมีข้อมูลมาก ระบบ RAG จะช่วยให้ AI หาส่วนที่เกี่ยวข้องได้เร็วโดยไม่ต้องดึงทุกอย่าง

```
┌─────────────────────────────────────────┐
│         RAG Pipeline                     │
│                                          │
│  1. Indexing (เมื่อเลือก instruction)    │
│     ├─ Text items → chunk 500 chars     │
│     ├─ Table items → index per row      │
│     └─ Store in memory (per session)    │
│                                          │
│  2. Retrieval (เมื่อ AI เรียก search)    │
│     ├─ Keyword matching (BM25-like)     │
│     ├─ Fuzzy matching (Levenshtein)     │
│     └─ Return top-k + metadata          │
│                                          │
│  3. (Optional) Embedding-based          │
│     ├─ OpenAI text-embedding-3-small    │
│     └─ Cosine similarity ranking        │
└─────────────────────────────────────────┘
```

### 4.2 Indexing Strategy

| ประเภทข้อมูล | วิธีการ Index | Chunk Size |
|---|---|---|
| `text` content | แบ่งเป็น chunk 500 ตัวอักษร overlap 50 | 500 chars |
| `table` row | แต่ละ row เป็น 1 document (stringify key-value) | 1 row |
| `table` column header | Index ชื่อ column เพื่อช่วยระบุตำแหน่ง | — |

### 4.3 Demo vs Production

| Feature | Demo (Phase 1) | Production (Phase 2) |
|---|---|---|
| Search | Keyword-based (string match) | Embedding-based (semantic) |
| Index | In-memory per session | Persistent (Redis/MongoDB) |
| Rebuild | ทุกครั้งที่เลือก instruction | Incremental (on change) |

---

## 5. API Endpoints ใหม่

### 5.1 Chat Endpoint

```
POST /api/instruction-chat
```

**Request Body:**
```json
{
  "instructionId": "ObjectId string",
  "message": "ช่วยดูราคาสินค้า A หน่อย",
  "sessionId": "chat_session_xxx",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response (Streaming):**
```json
{
  "role": "assistant",
  "content": "สินค้า A มีราคา 2,350 บาท อยู่ในหมวด...",
  "toolsUsed": [
    { "tool": "search_in_table", "itemId": "item_abc", "keyword": "สินค้า A", "resultCount": 1 }
  ],
  "changes": []
}
```

### 5.2 Session Management

```
POST   /api/instruction-chat/sessions          — สร้าง session ใหม่
GET    /api/instruction-chat/sessions/:id       — ดึง session + history
DELETE /api/instruction-chat/sessions/:id       — ลบ session
```

### 5.3 Undo/Changelog

```
GET  /api/instruction-chat/sessions/:id/changelog   — ดูประวัติการแก้ไข
POST /api/instruction-chat/sessions/:id/undo/:changeId  — ย้อนกลับการแก้ไข
```

---

## 6. Frontend Design

### 6.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🔧 Instruction Editor Chat                          [≡]   │
├────────────────┬────────────────────────────────────────────┤
│                │                                            │
│ 📋 Instructions│  💬 Chat with AI                          │
│                │                                            │
│ [🔍 Search...] │  ┌──────────────────────────────────────┐ │
│                │  │ 🤖 สวัสดีครับ! เลือก instruction      │ │
│ ▸ รายการสินค้า │  │    แล้วบอกได้เลยว่าต้องการทำอะไร     │ │
│   250 rows     │  │                                      │ │
│                │  │ 👤 ดูราคาสินค้า A หน่อย               │ │
│ ▸ นโยบายขาย   │  │                                      │ │
│   1.2k chars   │  │ 🤖 [🔍 ค้นหา "สินค้า A"...]          │ │
│                │  │    พบสินค้า A ในหมวด "สินค้าหลัก"     │ │
│ ▸ สินค้า B     │  │    ราคา: 2,350 บาท                   │ │
│   180 rows     │  │    สต็อก: 45 ชิ้น                    │ │
│                │  │                                      │ │
│                │  │ 👤 เปลี่ยนราคาเป็น 2,500              │ │
│                │  │                                      │ │
│                │  │ 🤖 [✏️ แก้ไข row 42, col "ราคา"]      │ │
│                │  │    ✅ เปลี่ยนราคาสินค้า A              │ │
│                │  │    จาก 2,350 → 2,500 เรียบร้อย       │ │
│                │  └──────────────────────────────────────┘ │
│                │                                            │
│                │  ┌──────────────────────────────┐ [Send]  │
│                │  │ พิมพ์คำสั่ง...                │         │
│                │  └──────────────────────────────┘         │
├────────────────┴────────────────────────────────────────────┤
│  📝 Changes: 1 edit  │  ↩️ Undo Last  │  📊 Token: 1.2k   │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Tool Result Cards (แสดงใน Chat)

เวลา AI เรียก tool จะแสดง **inline card** ใน chat:

- 🔍 **Search Card**: แสดง keyword + จำนวนผลลัพธ์ + preview
- 📊 **Table View Card**: แสดงตาราง mini (expandable)
- ✏️ **Edit Card**: แสดง before/after + ปุ่ม Undo
- ➕ **Add Card**: แสดงข้อมูลที่เพิ่ม
- 🗑️ **Delete Card**: แสดงข้อมูลที่ลบ + ปุ่ม Restore

### 6.3 Quick Actions (ปุ่มลัด)

ใต้ chat input มี suggestion chips:

```
[ 📋 ดูภาพรวม ] [ 🔍 ค้นหาสินค้า ] [ 📊 ดูตาราง ] [ ✏️ แก้ราคา ] [ ➕ เพิ่มแถว ]
```

### 6.4 Model Selection & Reasoning Configuration

> UI ออกแบบสไตล์มืออาชีพ คล้าย ChatGPT / Vercel AI เลือกโมเดลและ Thinking ได้

#### 6.4.1 โมเดลที่รองรับ (Thinking + Tool Calling)

⚠️ **ข้อจำกัดสำคัญ**: ใช้ได้เฉพาะโมเดลที่รองรับ **ทั้ง** reasoning (thinking) **และ** tool calling เท่านั้น

| โมเดล | Reasoning | Tool Calling | reasoning_effort options | API Mode | หมายเหตุ |
|---|---|---|---|---|---|
| **`gpt-5.2`** ⭐ (default) | ✅ | ✅ | `none`, `low`, `medium`, `high`, `xhigh` | Chat Completions | แนะนำ — ดีที่สุดสำหรับ tool use + reasoning |
| **`gpt-5.2-codex`** | ✅ | ✅ | `none`, `low`, `medium`, `high`, `xhigh` | Chat Completions | เหมาะกับงาน structured data + code |
| `gpt-5.1` | ✅ | ✅ | `none`, `low`, `medium`, `high` | Chat Completions | ไม่มี xhigh แต่เสถียร |
| `gpt-5` | ✅ (router) | ✅ | `low`, `medium`, `high` | Chat Completions | Router model — เลือก sub-model อัตโนมัติ |

> **ไม่รองรับ**: โมเดลที่ไม่มี tool calling (เช่น o1-preview) หรือไม่มี reasoning (เช่น gpt-4o, gpt-4.5)

#### 6.4.2 Reasoning Effort — แต่ละระดับทำอะไร

| Level | คำอธิบาย | Use Case | Token Usage | ความเร็ว |
|---|---|---|---|---|
| `none` | ไม่คิด ตอบทันที | คำถามง่าย, ดูภาพรวม | ต่ำสุด | ⚡ เร็วมาก |
| `low` | คิดน้อย | ค้นหาข้อมูลทั่วไป, อ่าน | ต่ำ | ⚡ เร็ว |
| `medium` | สมดุล (default thinking) | แก้ไขข้อมูล, วิเคราะห์เบื้องต้น | ปานกลาง | ⏱️ ปานกลาง |
| `high` | คิดลึก | วิเคราะห์ข้อมูลซับซ้อน, หาความผิดปกติ | สูง | 🐢 ช้า |
| `xhigh` | คิดลึกที่สุด | ตรวจสอบข้อมูลทั้งหมด, multi-step reasoning | สูงมาก | 🐌 ช้ามาก |

#### 6.4.3 UI — Model Selector (สไตล์ ChatGPT / Vercel)

```
┌─────────────────────────────────────────────────────────────┐
│  🔧 Instruction Editor Chat                          [≡]   │
├────────────────┬────────────────────────────────────────────┤
│                │                                            │
│ 📋 Instructions│  ┌──────────────────────────────────────┐ │
│                │  │  Model: [GPT-5.2 ▾]  Thinking: [ON]  │ │
│ ...            │  │  ─────────────────────────────────── │ │
│                │  │  💬 Chat Messages...                 │ │
│                │  │                                      │ │
│                │  │  🤖 สวัสดีครับ!                       │ │
│                │  │      ┌─ 💭 Thinking ──────────────┐  │ │
│                │  │      │ กำลังค้นหาข้อมูลสินค้า A   │  │ │
│                │  │      │ พบ 2 ผลลัพธ์ในตาราง...     │  │ │
│                │  │      └────────────────────────────┘  │ │
│                │  │    พบสินค้า A ราคา 2,350 บาท         │ │
│                │  │                                      │ │
│                │  └──────────────────────────────────────┘ │
│                │                                            │
│                │  ┌──────────────────────────────┐ [Send]  │
│                │  │ พิมพ์คำสั่ง...                │         │
│                │  └──────────────────────────────┘   ⚡    │
│                │                                            │
├────────────────┴────────────────────────────────────────────┤
│ 🧠 GPT-5.2 │ Thinking: Medium │ 📊 1.2k tokens │ ↩️ Undo │
└─────────────────────────────────────────────────────────────┘
```

#### 6.4.4 Model Selector Dropdown (เปิดขึ้นมาเมื่อกด)

```
┌──────────────────────────────────────┐
│  🧠 เลือกโมเดล                       │
│  ─────────────────────────────────── │
│  ⭐ GPT-5.2              แนะนำ      │
│     ดีที่สุด สมดุลระหว่างความเร็ว      │
│     และความแม่นยำ                     │
│                                      │
│  🔧 GPT-5.2 Codex                   │
│     เหมาะกับ structured data        │
│     และการแก้ไขข้อมูลซ้อน             │
│                                      │
│  ⚡ GPT-5.1                          │
│     เร็วกว่า ประหยัดกว่า               │
│                                      │
│  🔀 GPT-5 (Router)                  │
│     เลือก sub-model อัตโนมัติ         │
│                                      │
│  ─────────────────────────────────── │
│  💭 Thinking                         │
│  ┌─────────────────────────────────┐ │
│  │ [Off] [Low] [Med] [High] [Max] │ │
│  └─────────────────────────────────┘ │
│  Off = none, Low = low, Med = medium │
│  High = high, Max = xhigh            │
│                                      │
│  ⚠️ GPT-5.1 ไม่รองรับ Max (xhigh)   │
│  ⚠️ GPT-5 ไม่รองรับ Off (none)      │
└──────────────────────────────────────┘
```

#### 6.4.5 Thinking Display ใน Chat (สไตล์ ChatGPT)

เมื่อเปิด Thinking จะแสดง **collapsible thinking block** ก่อนคำตอบ:

```
🤖 AI Response:
  ┌─ 💭 Thought for 3.2s ─────────────────── [▾ Collapse] ─┐
  │ 1. ผู้ใช้ต้องการค้นหา "สินค้า A" ในตาราง                 │
  │ 2. ต้องเรียก search_in_table กับ item_abc123             │
  │ 3. พบ 2 ผลลัพธ์ ที่ row 1 และ row 42                    │
  │ 4. จะแสดงราคาและสต็อกของทั้ง 2 รายการ                   │
  └─────────────────────────────────────────────────────────┘

  พบสินค้า A จำนวน 2 รายการ:
  1. โฟม PU 3 นิ้ว (มาตรฐาน) — ราคา 2,350 บาท, สต็อก 45
  2. โฟม PU 3 นิ้ว (พรีเมียม) — ราคา 3,200 บาท, สต็อก 22
```

#### 6.4.6 API Implementation — Reasoning Configuration

```javascript
// Backend: สร้าง API payload ตามโมเดลที่เลือก
function buildChatPayload(model, messages, tools, thinkingLevel) {

  // Model-specific reasoning_effort mapping
  const REASONING_SUPPORT = {
    'gpt-5.2':       { efforts: ['none', 'low', 'medium', 'high', 'xhigh'], default: 'none' },
    'gpt-5.2-codex': { efforts: ['none', 'low', 'medium', 'high', 'xhigh'], default: 'none' },
    'gpt-5.1':       { efforts: ['none', 'low', 'medium', 'high'],          default: 'none' },
    'gpt-5':         { efforts: ['low', 'medium', 'high'],                  default: 'medium' },
  };

  // UI label → API value mapping
  const THINKING_MAP = {
    'off':    'none',
    'low':    'low',
    'medium': 'medium',
    'high':   'high',
    'max':    'xhigh',
  };

  const modelConfig = REASONING_SUPPORT[model];
  if (!modelConfig) throw new Error(`Unsupported model: ${model}`);

  // Map UI thinking level to API reasoning_effort
  let effort = THINKING_MAP[thinkingLevel] || modelConfig.default;

  // Fallback if model doesn't support the requested level
  if (!modelConfig.efforts.includes(effort)) {
    // ถ้าเลือก level ที่โมเดลไม่รองรับ → fallback ไปที่ max ที่รองรับ
    const maxSupported = modelConfig.efforts[modelConfig.efforts.length - 1];
    console.warn(`Model ${model} doesn't support ${effort}, falling back to ${maxSupported}`);
    effort = maxSupported;
  }

  const payload = {
    model,
    messages,
    tools,
    tool_choice: 'auto',
  };

  // เพิ่ม reasoning config เฉพาะเมื่อ effort ไม่ใช่ 'none'
  if (effort !== 'none') {
    payload.reasoning = { effort };
    // reasoning models จะ return reasoning content (thinking tokens)
    // ที่เราสามารถแสดงใน UI ได้
  }

  return payload;
}
```

#### 6.4.7 Thinking Tokens — การแสดงผล

```javascript
// Response จาก OpenAI เมื่อเปิด reasoning:
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "พบสินค้า A จำนวน 2 รายการ...",
      // Reasoning content (thinking tokens) — แสดงใน collapsible block
      "reasoning_content": "ผู้ใช้ต้องการค้นหา \"สินค้า A\"...",
      "tool_calls": [...]
    }
  }],
  "usage": {
    "prompt_tokens": 450,
    "completion_tokens": 120,
    "reasoning_tokens": 85,     // ← thinking tokens (ไม่นับใน completion)
    "total_tokens": 655
  }
}
```

> **สำคัญ**: `reasoning_tokens` จะถูกคิดค่าใช้จ่ายแยก และเพิ่มขึ้นตาม effort level  
> แสดง badge บอก token usage ที่ status bar ล่าง เพื่อให้ผู้ใช้รู้ต้นทุน

---

## 7. System Prompt (สำหรับ AI Agent)

```markdown
คุณเป็น AI ผู้ช่วยจัดการ Instruction สำหรับระบบ ChatCenter AI
คุณมี tools สำหรับอ่านและแก้ไขข้อมูลใน instruction ที่ผู้ใช้เลือก

## หลักการทำงาน
1. **อ่านก่อนแก้**: เรียก get_instruction_overview ก่อนเสมอถ้ายังไม่เคยดู
2. **ค้นหาก่อนดึง**: ใช้ search_in_table หรือ search_content เพื่อหาตำแหน่งก่อน
3. **แก้ทีละส่วน**: ใช้ update_cell หรือ update_rows_bulk — ห้ามแก้ทั้ง item
4. **ยืนยันก่อนแก้**: แจ้งผู้ใช้ว่าจะแก้อะไร ก่อนเรียก write tool (ยกเว้นผู้ใช้สั่งตรง)
5. **ตอบกลับชัดเจน**: หลังแก้ไข แจ้ง before → after เสมอ

## ข้อห้าม
- ห้ามดึงข้อมูลทั้งหมดทีเดียว (ใช้ pagination)
- ห้ามคาดเดาข้อมูล ให้ค้นหาเสมอ
- ห้ามลบข้อมูลโดยไม่ยืนยันกับผู้ใช้

## Instruction ที่เลือก
ID: {{instructionId}}
ชื่อ: {{instructionName}}
คำอธิบาย: {{instructionDescription}}

## ชุดข้อมูลที่มี (Data Items Summary)
{{#each dataItems}}
- **{{title}}** (ID: {{itemId}}, ประเภท: {{type}})
  {{#if isTable}}ตาราง {{rowCount}} แถว | คอลัมน์: {{columns}}{{/if}}
  {{#if isText}}ข้อความ {{charCount}} ตัวอักษร{{/if}}
{{/each}}

ใช้ข้อมูลข้างต้นเพื่อตัดสินใจว่าควรค้นหาหรือดึงข้อมูลจาก data item ไหน
ไม่ต้องเรียก get_instruction_overview ซ้ำ ถ้าข้อมูลข้างต้นเพียงพอแล้ว
```

> **หมายเหตุ**: Backend จะ inject summary นี้อัตโนมัติตอนสร้าง system prompt โดยดึงจาก DB เฉพาะ metadata (ไม่ดึงเนื้อหาจริง) เช่น:
> - ชื่อ data item, type, จำนวนแถว, ชื่อคอลัมน์, จำนวนตัวอักษร
> - ทำให้ AI สามารถตอบคำถามเบื้องต้นได้เลย เช่น "มีข้อมูลอะไรบ้าง" โดยไม่ต้องเรียก tool

---

## 8. Changelog & Undo System

### 8.1 โครงสร้าง Change Log

```json
{
  "changeId": "chg_xxx",
  "sessionId": "ses_xxx",
  "instructionId": "ObjectId",
  "timestamp": "2026-02-22T21:50:00Z",
  "tool": "update_cell",
  "params": { "itemId": "item_abc", "rowIndex": 42, "column": "ราคา", "newValue": "2500" },
  "before": { "value": "2350" },
  "after": { "value": "2500" },
  "undone": false
}
```

### 8.2 Undo Flow

1. ผู้ใช้กด "Undo" หรือพิมพ์ "ยกเลิกการแก้ไขล่าสุด"
2. Backend ดึง last change → apply reverse operation
3. Mark change as `undone: true`
4. AI แจ้งผลกลับ

---

## 9. แผนพัฒนา (Implementation Phases)

### Phase 1: MVP (1-2 สัปดาห์)
- [x] Frontend: หน้า chat + instruction selector
- [x] Backend: Chat endpoint + Tool Loop (OpenAI)
- [x] READ Tools: `get_instruction_overview`, `get_data_item_detail`, `get_rows`, `search_in_table`, `get_text_content`
- [x] WRITE Tools: `update_cell`, `add_row`, `delete_row`
- [x] RAG: Keyword-based search (simple string match)
- [x] Session management (in-memory)
- [x] Model selection (GPT-5.2, GPT-5.2 Codex, GPT-5.1, GPT-5)
- [x] Thinking level configuration (off/low/medium/high/max)

### Phase 2: Enhanced (1-2 สัปดาห์เพิ่ม)
- [x] WRITE Tools: `update_rows_bulk`, `update_text_content`, `add_column`
- [x] RAG: Embedding-based search (text-embedding-3-large, 256 dims, hybrid RRF)
- [x] Changelog + Undo system
- [x] Streaming responses (SSE)
- [x] Tool result cards (expandable UI)
- [x] Thinking block display (collapsible)
- [x] System prompt auto-injection (data items summary)

### Phase 3: Production Ready
- [x] Session persistence (MongoDB)
- [x] Audit log (who edited what, when, which tools, token usage)
- [x] Bulk operations safety (delete_rows_bulk with 2-step confirmation token)

---

## 10. Files ที่ต้องสร้าง/แก้ไข

| File | Action | Status | Description |
|---|---|---|---|
| `views/admin-instruction-chat.ejs` | สร้างใหม่ | ✅ Done | หน้า HTML หลัก — dark theme, premium UI |
| `public/js/instruction-chat.js` | สร้างใหม่ | ✅ Done | Frontend logic (chat, tool cards, model selector) |
| `public/css/instruction-chat.css` | สร้างใหม่ | ✅ Done | Styles — ChatGPT/Vercel style |
| `services/instructionChatService.js` | สร้างใหม่ | ✅ Done | Tool executor + changelog |
| `services/instructionRAGService.js` | สร้างใหม่ | ✅ Done | RAG keyword-based search |
| `index.js` | แก้ไข | ✅ Done | เพิ่ม routes + API + tool loop |

---

## 11. ตัวอย่างการใช้งาน (Use Cases)

### Case 1: ตรวจสอบข้อมูล
```
👤 "ตรวจสอบว่ามีสินค้าชื่อ PU Foam 3 นิ้ว อยู่หรือเปล่า ราคาเท่าไร"
🤖 [เรียก search_in_table → พบ 2 ผลลัพธ์]
   "พบ 2 รายการ:
    1. PU Foam 3 นิ้ว (มาตรฐาน) — ราคา 2,350 บาท
    2. PU Foam 3 นิ้ว (พรีเมียม) — ราคา 3,200 บาท"
```

### Case 2: แก้ไขข้อมูล
```
👤 "เปลี่ยนราคา PU Foam 3 นิ้ว มาตรฐาน เป็น 2,500"
🤖 "ยืนยัน: แก้ราคา PU Foam 3 นิ้ว (มาตรฐาน) จาก 2,350 → 2,500 ?"
👤 "ใช่"
🤖 [เรียก update_cell]
   "✅ แก้ไขเรียบร้อย: ราคาเปลี่ยนจาก 2,350 → 2,500"
```

### Case 3: เพิ่มข้อมูลใหม่
```
👤 "เพิ่มสินค้าใหม่ ชื่อ Foam XL ราคา 4,500 สต็อก 20"
🤖 [เรียก add_row]
   "✅ เพิ่มแถวใหม่:
    ชื่อ: Foam XL | ราคา: 4,500 | สต็อก: 20
    (เพิ่มที่แถวสุดท้าย ลำดับที่ 251)"
```

### Case 4: วิเคราะห์ข้อมูล
```
👤 "สินค้าไหนราคาเกิน 5,000 บ้าง"
🤖 [เรียก search_in_table หลายครั้ง หรือ get_rows + filter]
   "พบ 8 สินค้าที่ราคาเกิน 5,000:
    1. Premium Set A — 7,500
    2. Deluxe Package — 12,000
    ..."
```

---

## 12. Security & Guardrails

| มาตรการ | รายละเอียด |
|---|---|
| **Confirmation before write** | AI ต้องยืนยันกับผู้ใช้ก่อน write (ยกเว้นสั่งตรง) |
| **Token budget** | จำกัด 100k tokens ต่อ session |
| **Tool loop limit** | สูงสุด 8 tool calls ต่อ message |
| **Row delete protection** | ลบได้ทีละ 1 แถว ห้าม bulk delete |
| **Backup on first edit** | สร้าง snapshot ก่อนการแก้ไขครั้งแรก |
| **Auth required** | ใช้ได้เฉพาะ admin/manager role |
