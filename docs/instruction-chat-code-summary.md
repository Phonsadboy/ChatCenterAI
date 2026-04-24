# Instruction Chat Editor — Code Summary

> สร้างเมื่อ: 2026-02-22 | ผู้เขียน: AI Pair Programming
> สถานะ: ✅ เสร็จสมบูรณ์ — Phase 1 + 2 + 3

---

## 📁 ไฟล์ที่สร้างใหม่ (5 ไฟล์)

### 1. `services/instructionRAGService.js` (335 บรรทัด)

**หน้าที่**: Hybrid RAG search — Keyword + Semantic Embedding

```
Class: InstructionRAGService

Constructor(openaiClient)
  props: openai, index[], embeddings[], EMBEDDING_MODEL, EMBEDDING_DIMENSIONS

Methods:
  buildIndex(instruction)          → สร้าง keyword index จาก dataItems (table rows + text chunks)
  buildEmbeddings()                → สร้าง embedding vectors ด้วย text-embedding-3-large (async, batched)
  startEmbeddingBuild()            → เริ่มสร้าง embedding แบบ background (non-blocking)
  waitForEmbeddings(timeoutMs)     → รอ embedding สร้างเสร็จ (timeout ได้)
  searchKeyword(query, limit)      → ค้นด้วย keyword matching + fuzzy
  searchSemantic(query, limit)     → ค้นด้วย cosine similarity (embedding)
  search(query, limit)             → Hybrid search: keyword + semantic → Reciprocal Rank Fusion (RRF)

Internal:
  _embedBatch(texts)               → เรียก OpenAI Embeddings API (batch, max 512)
  _embedQuery(query)               → embed query เดี่ยว
  _cosineSimilarity(a, b)          → คำนวณ cosine similarity
  _resultKey(result)               → สร้าง unique key สำหรับ dedup
  _formatResult(entry, score, method) → จัด format ผลลัพธ์
```

**Config**:
- Model: `text-embedding-3-large`
- Dimensions: `256` (compact, ลดค่าใช้จ่าย)
- Batch Size: `512`
- Similarity Threshold: `0.25`
- RRF Constant: `K=60`

---

### 2. `services/instructionChatService.js` (585 บรรทัด)

**หน้าที่**: AI Tool executor — granular read/write operations on instructions

```
Class: InstructionChatService

Constructor(db, openaiClient)
  props: db, openai, collection (instructions_v2), changelogCollection, rag (InstructionRAGService)

─── READ TOOLS (6) ───
  get_instruction_overview(instructionId)
    → ชื่อ, description, data items summary (type, columns, row count)

  get_data_item_detail(instructionId, { itemId })
    → columns + preview 5 rows (table) / content preview 500 chars (text)

  get_rows(instructionId, { itemId, startRow, limit, columns })
    → paginated rows, max 50 per page, column filtering

  get_text_content(instructionId, { itemId, startChar, length })
    → chunked text content, max 2000 chars

  search_in_table(instructionId, { itemId, keyword, column, matchMode, limit })
    → keyword search within specific table (contains/exact/startsWith)

  search_content(instructionId, { query, limit })
    → hybrid search across ALL data items (keyword + semantic embedding)

─── WRITE TOOLS (7) ───
  update_cell(instructionId, { itemId, rowIndex, column, newValue }, sessionId)
    → แก้ไข cell เดียว → changelog

  update_rows_bulk(instructionId, { itemId, updates[] }, sessionId)
    → แก้ไขหลาย cell พร้อมกัน → changelog

  add_row(instructionId, { itemId, rowData, position, afterRowIndex }, sessionId)
    → เพิ่มแถว (start/end/after) → changelog

  delete_row(instructionId, { itemId, rowIndex }, sessionId)
    → ลบแถวเดียว → changelog

  update_text_content(instructionId, { itemId, mode, content, find, replaceWith }, sessionId)
    → แก้ text (replace_all/append/prepend/find_replace) → changelog

  add_column(instructionId, { itemId, columnName, defaultValue, position, afterColumn }, sessionId)
    → เพิ่มคอลัมน์ → changelog

  delete_rows_bulk(instructionId, { itemId, confirmToken }, sessionId)
    → ลบหลายแถว (ต้องมี confirmToken) → changelog

─── SAFETY TOOL (1) ───
  delete_rows_bulk_confirm(instructionId, { itemId, rowIndices })
    → preview แถวที่จะลบ + สร้าง confirmToken (หมดอายุ 60 วินาที)

─── HELPER ───
  buildDataItemsSummary(instruction) → สรุป data items สำหรับ system prompt
  getToolDefinitions()              → 14 tool definitions สำหรับ OpenAI function calling
  executeTool(toolName, args, instructionId, sessionId) → tool dispatch
```

**Changelog**:
- Collection: `instruction_chat_changelog`
- Fields: changeId, sessionId, instructionId, timestamp, tool, params, before, after, undone

---

### 3. `views/admin-instruction-chat.ejs` (~610 บรรทัด)

**หน้าที่**: Premium dark theme UI หน้า chat editor

```
Layout:
  ├── Sidebar (300px)
  │   ├── Header + Search
  │   └── Instruction List (scrollable)
  │
  └── Chat Area (flex: 1)
      ├── Header
      │   ├── Active Instruction Name
      │   ├── Model Selector Dropdown (GPT-5.2, 5.2-Codex, 5.1, 5)
      │   ├── Thinking Level Controls (Off/Low/Med/High/Max)
      │   └── New Chat Button
      ├── Messages Area (scrollable)
      │   ├── User Messages
      │   ├── AI Messages (streaming)
      │   ├── Thinking Blocks (collapsible)
      │   └── Tool Cards (search/edit/add/delete)
      ├── Input Area
      │   ├── Textarea (auto-resize, Enter to send)
      │   ├── Send Button
      │   └── Quick Actions (chips)
      └── Status Bar
          ├── Model
          ├── Thinking Level
          ├── Token Count
          └── Changes Count
```

**Dependencies**: Font Awesome 6.4, Google Fonts (Inter)

---

### 4. `public/css/instruction-chat.css` (777 บรรทัด)

**หน้าที่**: Premium dark theme CSS — ChatGPT / Vercel inspired

```
Design System:
  Colors: #0a0a0a (bg), #141414 (surface), #7c5cfc (accent)
  Font: Inter (Google Fonts)
  Border Radius: 12px / 8px / 6px
  Transition: 0.2s cubic-bezier

Sections:
  ├── Layout (sidebar + chat flex)
  ├── Sidebar (search, list, active highlight)
  ├── Chat Header (model selector dropdown)
  ├── Messages (fade-in animation)
  ├── Thinking Block (collapsible, border-left accent)
  ├── Tool Cards (4 variants: search=blue, edit=yellow, add=green, delete=red)
  ├── Typing Indicator (3-dot bounce animation)
  ├── Input Area (focus glow, auto-resize textarea)
  ├── Quick Actions (pill chips with hover)
  ├── Status Bar
  ├── Empty State
  └── Responsive (mobile: sidebar overlay, smaller padding)
```

---

### 5. `public/js/instruction-chat.js` (569 บรรทัด)

**หน้าที่**: Frontend logic — SSE streaming, session management, UI interactions

```
IIFE Module:

State:
  instructions[], selectedId, selectedName, sessionId,
  model, thinking, history[], totalTokens, totalChanges, sending

─── Init ───
  loadInstructions()              → GET /api/instructions-v2 → render list

─── Chat (SSE Streaming) ───
  sendMessage(text)               → POST /api/instruction-chat/stream
    → ReadableStream + TextDecoder
    → Parse SSE events: session, content, thinking, tool_start, tool_end, done, error
    → Render content chunk-by-chunk (streaming effect)
    → Auto-save session after each response

─── Session Persistence ───
  generateSessionId()             → ses_<timestamp>_<random>
  saveSession()                   → POST /api/instruction-chat/sessions
  loadLatestSession(instructionId) → GET /api/instruction-chat/sessions?instructionId=

─── Render ───
  renderInstructionList(filter)   → sidebar instruction cards (active highlight)
  selectInstruction(id, name)     → load session, show welcome message
  appendMessage(role, content)    → user/AI message bubble
  appendStreamingMessage()        → AI bubble with typing indicator (ถูกแทนที่ด้วย content)
  appendThinking(content, time)   → collapsible thinking block
  appendToolCard(tool)            → tool card (search/edit/add/delete)
  updateStatusBar()               → model, thinking, tokens, changes
  updateThinkingUI()              → enable/disable thinking levels per model

─── Event Listeners ───
  Sidebar toggle (mobile)
  Instruction selection (click)
  Instruction search (input)
  Send message (click + Enter)
  Model dropdown (click to toggle)
  Model selection (click)
  Thinking level (click)
  Quick actions (click → fill input)
  New Chat (click → reset state)

─── Helpers ───
  escapeHtml, formatContent (bold + newlines), scrollToBottom, autoResize
```

---

## 📝 ไฟล์ที่แก้ไข (1 ไฟล์)

### `index.js` — เพิ่ม ~460 บรรทัด

```
บรรทัด 19:  + const InstructionChatService = require("./services/instructionChatService");

─── Routes เพิ่ม (~460 บรรทัด ตั้งแต่ ~17975) ───

Page Route:
  GET  /admin/instruction-chat          → render "admin-instruction-chat" (requireAdmin)

Chat API (Non-Streaming):
  POST /api/instruction-chat            → Tool loop (max 8 iterations)
    • System prompt with data items summary
    • Model-specific reasoning: GPT-5.2/Codex (off→xhigh), GPT-5.1 (off→high), GPT-5 (low→high)
    • THINKING_MAP: off→none, low, medium, high, max→xhigh
    • Returns: content, toolsUsed, changes, reasoning_content, usage

Chat API (SSE Streaming):
  POST /api/instruction-chat/stream     → Same logic + SSE events
    • Events: session, thinking, tool_start, tool_end, content (20-char chunks), done, error
    • Auto audit log on completion

Changelog + Undo:
  GET  /api/instruction-chat/changelog/:sessionId → list changelog entries
  POST /api/instruction-chat/undo/:changeId       → reverse operation

Session Persistence:
  POST   /api/instruction-chat/sessions            → upsert session (history max 50)
  GET    /api/instruction-chat/sessions             → list sessions (filter by instructionId)
  GET    /api/instruction-chat/sessions/:sessionId  → load session
  DELETE /api/instruction-chat/sessions/:sessionId  → delete session

Audit Log:
  GET  /api/instruction-chat/audit      → list audit entries (filter by instructionId)
```

---

## 🗄️ PostgreSQL Collections (3 ใหม่)

| Collection | Schema | หน้าที่ |
|---|---|---|
| `instruction_chat_changelog` | changeId, sessionId, instructionId, timestamp, tool, params, before, after, undone | ประวัติแก้ไข + undo |
| `instruction_chat_sessions` | sessionId, instructionId, instructionName, history[], model, thinking, totalTokens, totalChanges, username, createdAt, updatedAt | บันทึก chat session |
| `instruction_chat_audit` | sessionId, instructionId, username, timestamp, message, model, thinking, effort, toolsUsed[], changes[], usage, responseLength | audit log |

---

## 🔧 AI Tools (14 tools)

| # | Tool | ประเภท | หน้าที่ |
|---|---|---|---|
| 1 | `get_instruction_overview` | READ | ดูภาพรวม instruction |
| 2 | `get_data_item_detail` | READ | ดูรายละเอียด data item |
| 3 | `get_rows` | READ | ดึงแถว (pagination) |
| 4 | `get_text_content` | READ | ดึง text content (chunked) |
| 5 | `search_in_table` | READ | ค้นหาในตารางเฉพาะ |
| 6 | `search_content` | READ | Hybrid search ทั้ง instruction |
| 7 | `update_cell` | WRITE | แก้ไข cell เดียว |
| 8 | `update_rows_bulk` | WRITE | แก้ไขหลาย cells |
| 9 | `add_row` | WRITE | เพิ่มแถว |
| 10 | `delete_row` | WRITE | ลบแถวเดียว |
| 11 | `update_text_content` | WRITE | แก้ไข text content |
| 12 | `add_column` | WRITE | เพิ่มคอลัมน์ |
| 13 | `delete_rows_bulk_confirm` | SAFETY | preview + สร้าง confirmToken |
| 14 | `delete_rows_bulk` | WRITE | ลบหลายแถว (ต้องมี token) |

---

## 🔄 Data Flow

```
User → Frontend (instruction-chat.js)
  ↓ POST /api/instruction-chat/stream (SSE)
Backend (index.js)
  ↓ System Prompt + buildDataItemsSummary()
  ↓ Tool Loop (max 8 iterations)
  │  ├── openai.chat.completions.create()
  │  ├── SSE: thinking, tool_start
  │  ├── chatService.executeTool() → instructionChatService.js
  │  │   ├── READ tools → PostgreSQL query
  │  │   ├── WRITE tools → PostgreSQL update + changelog
  │  │   └── RAG search → instructionRAGService.js
  │  │       ├── Keyword search (always)
  │  │       ├── Embedding search (if ready)
  │  │       │   └── OpenAI text-embedding-3-large (256 dims)
  │  │       └── RRF merge + dedup
  │  └── SSE: tool_end
  ↓ SSE: content (20-char chunks), done
  ↓ Audit log → instruction_chat_audit
Frontend
  ↓ Display streaming content
  ↓ Auto-save session → instruction_chat_sessions
```

---

## ✅ Features Checklist (ทั้งหมดเสร็จ)

### Phase 1: MVP
- [x] Frontend: หน้า chat + instruction selector
- [x] Backend: Chat endpoint + Tool Loop (OpenAI)
- [x] READ Tools (6): overview, detail, rows, text content, table search, content search
- [x] WRITE Tools (3): update_cell, add_row, delete_row
- [x] RAG: Keyword-based search
- [x] Session management (in-memory)
- [x] Model selection (GPT-5.2, GPT-5.2 Codex, GPT-5.1, GPT-5)
- [x] Thinking level configuration (off/low/medium/high/max)

### Phase 2: Enhanced
- [x] WRITE Tools (4): update_rows_bulk, update_text_content, add_column, delete_rows_bulk
- [x] RAG: Embedding-based search (text-embedding-3-large, 256 dims, hybrid RRF)
- [x] Changelog + Undo system
- [x] Streaming responses (SSE)
- [x] Tool result cards (expandable UI)
- [x] Thinking block display (collapsible)
- [x] System prompt auto-injection

### Phase 3: Production Ready
- [x] Session persistence (PostgreSQL)
- [x] Audit log (username, message, tools, changes, token usage)
- [x] Bulk operations safety (2-step confirmation token, 60s expiry, max 50 rows)
