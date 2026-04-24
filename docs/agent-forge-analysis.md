# 🔬 รายงานวิเคราะห์เชิงลึก 360° — ระบบโรงหลอมเอเจนต์ (Agent Forge)

> **วันที่วิเคราะห์:** 25 กุมภาพันธ์ 2026
> **Workspace:** `/Users/mac/pp/ChatCenterAI-6/`
> **โดย:** Principal Software Architect & Senior AI Engineer
> **สถานะ:** Draft v1.1 — Post-Review Update

---

## สารบัญ

1. [มิติที่ 1: ความชัดเจนของแผนงาน (Clarity & Architecture Alignment)](#มิติที่-1)
2. [มิติที่ 2: การปรับปรุงระบบและฟีเจอร์ (System & Feature Improvements)](#มิติที่-2)
3. [มิติที่ 3: ฟีเจอร์เสริมที่เสนอเพิ่ม (Feature Additions)](#มิติที่-3)
4. [มิติที่ 4: จุดบอดและ Edge Cases (Blind Spots & Risks)](#มิติที่-4)
5. [สรุปลำดับความสำคัญ](#สรุปลำดับความสำคัญ)
6. [แผนปฏิบัติการเร่งด่วน](#แผนปฏิบัติการเร่งด่วน)

---

## มิติที่ 1: ความชัดเจนของแผนงาน (Clarity & Architecture Alignment) {#มิติที่-1}

### 🔴 CRITICAL — จุดคลุมเครือที่ต้องแก้ก่อนเขียนโค้ด

#### 1.1 ความขัดแย้งของ `disableAiReply` กับ `agent mode`

**โค้ดปัจจุบัน vs. แผนงาน:**

- `index.js` บรรทัด **5752**: `const disableAiReply = !!queueContext.disableAiReply;`
- `index.js` บรรทัด **11500**: `const disableAiReply = !botIsActive;` (Facebook เชื่อมกับ `bot.status`)

**ปัญหา:** แผนฯ ระบุว่า `disableAiReply` จะถูก "ผูกกับ `agent mode` โดยตรง" แต่ไม่ได้อธิบาย **ลำดับความสำคัญ (Priority)** เมื่อ:
- Bot ยัง `inactive` อยู่ แต่ Agent mode เป็น `ai-live-reply` → ใครชนะ?
- Bot `active` แต่ Agent mode เป็น `human-only` → ควรปิด AI ตอบ

**ข้อเสนอ:** ต้องกำหนด **Priority Chain** อย่างชัดเจน:

```
สูงสุด: emergency_stop จาก watchdog
↓ agent mode (human-only = disable)
↓ maintenance mode
↓ botIsActive
↓ userStatus.aiEnabled
ต่ำสุด: ค่า default (ตอบ AI)
```

---

#### 1.2 "Atomic Version Bump" ไม่มีรายละเอียดเพียงพอ

แผนฯ ระบุ step 6 ว่า "apply แล้ว version bump แบบ atomic" แต่ไม่ได้อธิบาย:
- ใช้ PostgreSQL Transactions หรือ `findOneAndUpdate` ด้วย version check?
- ถ้า 2 runs รันพร้อมกัน (manual + scheduled) และเขียน instruction พร้อมกัน จะ handle อย่างไร?
- ระบบมี `instruction_chat_changelog` อยู่แล้ว (ดูจาก `instructionChatService.js` บรรทัด 16) — Agent Forge จะ reuse หรือสร้าง collection ใหม่?

**แนะนำ:** ใช้ Optimistic Locking Pattern:

```javascript
// ใน agentForgeTools.js
await db.collection('instructions_v2').findOneAndUpdate(
  { _id: instructionId, version: currentVersion }, // condition
  { $inc: { version: 1 }, $set: { content: newContent, updatedAt: new Date() } },
  { returnDocument: 'after' }
);
// ถ้า result === null = version conflict → retry หรือ abort
```

---

#### 1.3 "Frontend Simulator Harness" — ไม่ชัดว่าคืออะไร

แผนฯ ระบุ Phase C: "เพิ่ม frontend simulator harness สำหรับ customer-side test" แต่:
- Simulator นี้จำลอง LINE/Facebook webhook โดยตรง หรือเรียก `processFlushedMessages` โดยตรง?
- ถ้าจำลอง webhook จริง → ต้องมี mock ของ `line.Client` และ Facebook Graph API
- ถ้าเรียก `processFlushedMessages` ตรงๆ → ต้องระวัง side effect เช่น การส่งข้อความจริง

**แนะนำ:** กำหนดให้ `self-test` เรียกผ่าน **internal test harness endpoint** ที่ไม่ส่งจริง:

```
POST /api/agent-forge/internal/simulate-reply
  { pageKey, conversationScenario[] }
→ Returns: AI reply, scoring, no side effect
```

---

### 🟠 HIGH — Compatibility & Bottleneck Analysis

#### 1.4 `index.js` ขนาด 26,454 บรรทัด — Monolith ที่ต้อง Refactor

นี่คือ **ความเสี่ยงสูงสุด** ในเชิง Engineering:
- ไฟล์ `index.js` ปัจจุบัน ~914KB มี routes, business logic, DB queries, webhook handlers รวมกันหมด
- แผนฯ บอกให้ "Reuse โครงสร้าง Express + EJS + SSE เดิม" แต่ถ้าการเพิ่ม Agent Forge routes เข้าไปใน `index.js` เดิม จะทำให้ไฟล์ใหญ่ขึ้นอีกอย่างน้อย 30–40%

**แนะนำ:** สร้าง Express Router แยก:

```javascript
// /routes/agentForge.js
const router = express.Router();
// ลง routes ทั้งหมด
module.exports = router;

// index.js
app.use('/api/agent-forge', require('./routes/agentForge'));
app.use('/admin/agent-forge', require('./routes/agentForgeAdmin'));
```

---

#### 1.5 PostgreSQL Collection Design — ปัญหา `agent_run_events` Seq Collision

Collection `agent_run_events` กำหนดว่า append-only ซึ่งดี แต่:
- `seq` field: แผนฯ ไม่ได้บอกว่า generate seq อย่างไร (PostgreSQL ObjectId? Atomic counter?)
- ถ้าใช้ `Date.now()` เป็น seq → อาจ collision เมื่อ events เกิดในมิลลิวินาทีเดียวกัน

**แนะนำ:** ใช้ Atomic Counter ต่อ runId:

```javascript
// ใน agentForgeRunner.js
async function nextSeq(runId) {
  const result = await db.collection('agent_runs').findOneAndUpdate(
    { _id: runId },
    { $inc: { _seqCounter: 1 } },
    { returnDocument: 'after' }
  );
  return result._seqCounter;
}
```

---

#### 1.6 Cursor Incremental ต้องระวัง Transaction Boundary

แผนฯ ระบุ "commit cursor เฉพาะเมื่อ run สำเร็จ" แต่:
- ถ้า run publish instruction สำเร็จแล้ว แต่ cursor commit fail → run ต่อไปจะ reprocess ข้อมูลเก่า → instruction อาจถูก publish ซ้ำ

**แนะนำ:** ใช้ PostgreSQL **Session Transactions** สำหรับ `publish_instruction + cursor_commit` ให้เป็น atomic operation เดียว

---

## มิติที่ 2: การปรับปรุงระบบและฟีเจอร์ (System & Feature Improvements) {#มิติที่-2}

### � HIGH — Tool Contracts & API Surface

#### 2.1 `get_customer_conversation` Tool — ปัญหา Unbounded Payload

ถ้าลูกค้ามีประวัติแชท 500 ข้อความ → tool return อาจใหญ่มาก ซึ่งจะกิน context window อย่างรวดเร็ว

**แนะนำ:** จำกัดที่ **20 ข้อความล่าสุด** เสมอ:

```javascript
// ใน agentForgeTools.js
get_customer_conversation(customerId, {
  maxMessages: 20,         // 20 ข้อความล่าสุดเท่านั้น
  includeAdminReplies: true // สำคัญสำหรับ baseline scoring
})
```

---

#### 2.2 Scoring เทียบ Baseline — ไม่มีคำนิยาม Scoring Formula

`agentForgeScorer.js` ต้องสร้างใหม่ แต่แผนฯ ไม่ได้ระบุ Rubric เลย

**แนะนำ Scoring Rubric:**

| Dimension | Weight | วิธีวัด |
|---|---|---|
| Task Completion | 30% | AI ตอบครบทุก sub-question? |
| Factual Accuracy | 25% | ไม่มี field ที่ไม่อยู่ใน KB? |
| Tone & Style | 15% | Similarity กับ admin baseline |
| Response Length | 10% | ไม่ยาวหรือสั้นเกิน |
| No Hallucination | 20% | ไม่มี invented data |

---

#### 2.3 Tool `reason` Field ไม่มี Schema กำหนด

แผนฯ บอกว่า "ทุก write tool ต้องมี `reason`" แต่ไม่ได้กำหนด max length, required/optional, หรือการใช้ใน audit log

**แนะนำ Tool Contract Standard:**

```typescript
interface WriteToolBase {
  reason: string;      // required, max 500 chars, บันทึก journal
  dryRun?: boolean;    // default false
  requestId?: string;  // trace back ถึง run
}
```

---

## มิติที่ 3: ฟีเจอร์เสริมที่เสนอเพิ่ม (Feature Additions) {#มิติที่-3}

### 🟡 มุมมองผู้ใช้งาน/แอดมิน (UX & Observability)

#### 3.1 🆕 "Agent Health Dashboard" — ภาพรวมในหน้าเดียว

หน้า `/admin/agent-forge` ควรมี **Health Card** ต่อ agent:

```
┌─ Agent: ร้านขนม Premium ──────────────────────┐
│ Mode: 🔴 HUMAN-ONLY     Last Run: 2h ago       │
│ Current Score: 87.3%   Baseline: 82.1% (+6.3%) │
│ Open Conversations: 243  Ghost Rate: 12%        │
│ [Process Now] [View Last Run] [Switch to Live]  │
└────────────────────────────────────────────────┘
```

---

#### 3.2 🆕 "Instruction Diff Viewer" — ก่อน/หลัง Patch

เมื่อ agent patch instruction ควรแสดง diff แบบ GitHub PR:

```diff
- สินค้า: ราคา X บาท (ขั้นต่ำ 3 ชิ้น)
+ สินค้า: ราคา X บาท (ขั้นต่ำ 1 ชิ้น, ซื้อ 3 ลด 10%)
  (เพิ่มจาก: Admin reply วันที่ 24/02/2026 ลูกค้า @userId123)
```

---

#### 3.3 🆕 "Confidence Score Ring" ใน Run UI

แต่ละ self-test case ควรแสดง visual confidence ไม่ใช่แค่ pass/fail:

```
Case: ขอโอนเงิน/QR
Score: ████████░░ 82% | Status: ✅ PASS (threshold: 80%)
Reason: ไม่เดาบัญชีโอนเงิน ✓ แต่การ offer QR ช้าเกิน 2 turns
```

---

### 🟡 มุมมองธุรกิจ (Business)

#### 3.4 🆕 "Conversion Lift Attribution" — วัด ROI ของ Agent

ระบบปัจจุบันมี `conversation_threads` ที่ track `outcome: purchased/not_purchased` แล้ว (ดู `conversationThreadService.js` บรรทัด 172–178) Agent Forge ควรเพิ่ม:

```javascript
// ใน agent_runs collection
conversionMetrics: {
  weekBeforeRun: { conversionRate: 0.18, avgOrderValue: 850 },
  weekAfterRun:  { conversionRate: 0.24, avgOrderValue: 920 },
  lift: { conversionRate: '+33%', revenue: '+8.2%' }
}
```

---

### 🟡 มุมมองนักพัฒนา (Developer Experience)

#### 3.5 🆕 "Full Run Dry Mode" — ขาดในแผน

แผนฯ บอก `dryRun=true` ต่อ tool แต่ไม่มี **Full Run Dry Mode** ที่รัน orchestration ครบแต่ไม่ publish:

```
POST /api/agent-forge/agents/:agentId/run
{ "dryRun": true }

→ รัน orchestration loop ครบทุก step
→ แสดง scoring, patch preview, decisions
→ ไม่ publish, ไม่ commit cursor, ไม่บันทึก event จริง
→ เหมาะสำหรับ CI/CD testing
```

---

#### 3.6 🆕 "Tool Call Replay" — Debug เฉพาะ Step

เมื่อ agent ทำผิดพลาดที่ tool call ที่ 7 ควรสามารถ replay เฉพาะ step นั้นโดยไม่ต้องรันใหม่ทั้งหมด:

```
POST /api/agent-forge/runs/:runId/replay-from-event/:seq
→ ใส่ context จาก event seq นั้น → รันต่อจากจุดนั้น
```

---

## มิติที่ 4: จุดบอดและ Edge Cases (Blind Spots & Risks) {#มิติที่-4}

### 🔴 CRITICAL

#### 4.1 🕳️ Concurrent Run Lock — ไม่มีรายละเอียด Implementation

แผนฯ ระบุ "1 active run ต่อ 1 agent" แต่ไม่บอกกลไก lock ถ้าใช้ `agent_profiles.status = "running"` → **Race condition** ได้ถ้า request 2 ตัวอ่าน status พร้อมกัน

**แนะนำ: Atomic Upsert Lock**

```javascript
const lockResult = await db.collection('agent_profiles').findOneAndUpdate(
  { _id: agentId, status: { $ne: 'running' } }, // atomic condition
  { $set: { status: 'running', runLockedAt: new Date() } },
  { returnDocument: 'after' }
);
if (!lockResult) throw new Error('Agent already running — concurrent lock rejected');
```

เพิ่ม **Stale Lock Detector**: ถ้า `runLockedAt` > 4 ชั่วโมง → auto-release (dead process)

---

#### 4.2 🕳️ Context Compaction ทำลาย Traceability

ถ้า compaction เกิดกลางกระบวนการ Tool results ก่อนหน้าอาจถูก summarize → Agent ไม่รู้ว่าเคย query customer X ไปแล้ว → อาจ re-query customer เดิม

**แนะนำ: Compaction Manifest**

```javascript
// บันทึกก่อน compact แล้ว inject กลับเข้า context หลัง compact
compactionManifest = {
  customersProcessed: ['userId1', 'userId2', ...],
  toolCallsSummary: {
    list_customers_batch: 5,
    get_customer_conversation: 47
  },
  lastProcessedCursor: '2026-02-24T23:59:00Z'
}
```

---

#### 4.3 🕳️ SSE Reconnect — Event Buffer Memory Leak

จากโค้ด SSE ปัจจุบัน (`activeRequests` Map บรรทัด 18974–18980 ใน `index.js`) Events ถูกเก็บใน memory ตลอด Agent run อาจเกิน 2 ชั่วโมง มี events หลายพัน → memory สูงมาก

**แนะนำสำหรับ Agent Forge Run (Long-lived):**

```javascript
// ใช้ PostgreSQL เป็น event buffer แทน in-memory
// (agent_run_events collection มีในแผนอยู่แล้ว — ควร enforce ให้ใช้ DB)
GET /api/agent-forge/runs/:runId/events?afterSeq=450
→ Stream events จาก DB ตั้งแต่ seq 451+
```

> ⚠️ `agent_run_events` collection มีใน Data Model แล้ว ควร **enforce ให้ใช้ DB ไม่ใช่ in-memory** สำหรับ Agent Forge โดยเฉพาะ

---

#### 4.4 🕳️ LINE Bot `reject bot inactive` กับ Agent Mode

จากโค้ด `index.js` บรรทัด 11500: `const disableAiReply = !botIsActive;`

ระบบ LINE ปัจจุบัน **เช็ค `botIsActive` ก่อน** แล้วค่อยตัดสินใจ แต่แผนฯ บอกให้ "inject `disableAiReply=true` เข้า queueContext":
- `botIsActive=false` → **ไม่ queue ข้อความเลย** (พฤติกรรมเดิม)
- Agent `human-only` → **queue ข้อความแต่ไม่ตอบ** (พฤติกรรมใหม่)
- นี่คือ **พฤติกรรมต่างกัน** ต้องแก้ LINE webhook handler ด้วย

**แนะนำ Logic ที่ถูกต้อง:**

```javascript
// LINE webhook handler ใหม่
const agentMode = await getAgentModeForPage(linePageKey); // 'human-only' | 'ai-live-reply'
const botIsActive = lineBot.status === 'active';

// bot ต้อง "appear active" เพื่อให้รับข้อความ แต่ AI ไม่ตอบ
const effectiveActive = botIsActive || (agentMode === 'human-only');
const disableAiReply = !botIsActive || agentMode === 'human-only';
```

---

#### 4.5 🕳️ `_pendingBulkDeletes` Memory Leak ในโค้ดเดิม

พบใน `instructionChatService.js` บรรทัด 534:

```javascript
this._pendingBulkDeletes = this._pendingBulkDeletes || {};
```

นี่เป็น in-memory object ที่ไม่ cleanup เมื่อ confirmToken หมดอายุ → accumulate ได้เมื่อใช้งานนาน Agent Forge ไม่ควรใช้ pattern เดียวกัน และควร fix ของเดิมด้วย

---

## สรุปลำดับความสำคัญ {#สรุปลำดับความสำคัญ}

| Priority | จำนวน Issue | Action |
|---|---|---|
| 🔴 **CRITICAL** | 4 | ต้องแก้ก่อน Phase A เริ่ม |
| 🟠 **HIGH** | 5 | ต้องแก้ก่อน Phase C |
| 🟡 **MEDIUM** | 6 | Feature additions ทำใน Phase ท้าย |
| 🟢 **LOW** | Memory leaks | Technical debt แก้ใน Phase G |

### Issue Summary Matrix

| # | Issue | Priority | Phase ที่กระทบ | ไฟล์อ้างอิง |
|---|---|---|---|---|
| 1.1 | `disableAiReply` Priority Chain | 🔴 CRITICAL | Phase E | `index.js:5752, 11500` |
| 1.2 | Atomic Version Bump | 🔴 CRITICAL | Phase C | `instructionChatService.js:16` |
| 1.3 | Frontend Simulator ไม่ชัด | 🔴 CRITICAL | Phase C | — |
| 1.4 | index.js Monolith | 🟠 HIGH | Phase A | `index.js` |
| 1.5 | Seq Counter Collision | 🟠 HIGH | Phase B | `agent_run_events` |
| 1.6 | Cursor-Publish Transaction | 🟠 HIGH | Phase B | `agent_processing_cursors` |
| 2.1 | Unbounded Tool Payload (20 msg cap) | � HIGH | Phase B | `agentForgeTools.js` |
| 2.2 | Scoring Rubric ไม่มี | 🟠 HIGH | Phase C | `agentForgeScorer.js` |
| 4.1 | Concurrent Run Lock | 🔴 CRITICAL | Phase A | `agent_profiles` |
| 4.2 | Compaction Manifest | � HIGH (แก้ใน Phase B) | Phase B | `agentForgeRunner.js` |
| 4.3 | SSE Memory Leak | 🟠 HIGH | Phase D | `agent_run_events` |
| 4.4 | LINE Bot mode conflict | 🔴 CRITICAL | Phase E | `index.js:11500` |

---

## แผนปฏิบัติการเร่งด่วน — ก่อนเริ่ม Phase A {#แผนปฏิบัติการเร่งด่วน}

### ขั้นตอนที่ต้องทำก่อน

1. **สร้าง `routes/agentForge.js` router** — ไม่ยัดเพิ่มใน `index.js` (แก้ Monolith risk)
2. **เขียน Priority Chain spec** ของ `disableAiReply` เป็น 1 หน้า document ก่อนเขียน code
3. **ออกแบบ Atomic Lock** ใน `agent_profiles` ด้วย `findOneAndUpdate` + `runLockedAt` stale check
4. **กำหนด Scoring Rubric** ทั้ง 5 dimensions ก่อน implement `agentForgeScorer.js`
5. **ย้าย SSE event buffer** ไป `agent_run_events` (PostgreSQL) แทน in-memory `activeRequests` Map
6. **กำหนด `maxMessages: 20`** ใน `get_customer_conversation` tool contract ตั้งแต่ต้น

### Recommended File Structure

```
/Users/mac/pp/ChatCenterAI-6/
├── routes/
│   ├── agentForge.js          ← API routes (NEW)
│   └── agentForgeAdmin.js     ← Admin UI routes (NEW)
├── services/
│   ├── agentForgeRunner.js    ← Orchestration loop (NEW)
│   ├── agentForgeTools.js     ← Tool contracts (NEW)
│   ├── agentForgeScorer.js    ← Scoring engine (NEW)
│   ├── agentForgeScheduler.js ← Cron scheduler (NEW)
│   └── agentForgeService.js   ← Profile CRUD (NEW)
├── views/
│   ├── admin-agent-forge.ejs     ← Control panel (NEW)
│   └── admin-agent-forge-run.ejs ← Trace UI (NEW)
└── public/
    ├── js/
    │   ├── agent-forge.js     (NEW)
    │   └── agent-forge-run.js (NEW)
    └── css/
        ├── agent-forge.css    (NEW)
        └── agent-forge-run.css (NEW)
```

---

> **สรุปความเห็น:** แผนงาน Agent Forge มีคุณภาพสูงและครอบคลุม จุดที่ต้องระวังมากที่สุดคือ **Concurrent Run Lock** (4.1) ซึ่งถ้า implement ผิดอาจทำให้ instruction ถูก publish ซ้ำ และ **LINE Bot mode conflict** (4.4) ซึ่งต้องแก้ webhook handler ให้รับข้อความแม้ bot inactive ควร address ทั้งสองจุดนี้ก่อนเริ่ม implementation ทุก Phase

---

*เอกสารนี้สร้างโดย AI Analysis โดยอ้างอิงโค้ดเบสจริง ณ วันที่ 25 กุมภาพันธ์ 2026 | อัปเดต v1.1 ตาม review รอบสอง*
