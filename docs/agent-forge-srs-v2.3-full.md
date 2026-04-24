# SRS v2.3 (Full) — ระบบโรงหลอมเอเจนต์ (Agent Forge)

วันที่อัปเดต: 24 กุมภาพันธ์ 2026  
สถานะ: Final Draft for Dev Implement

## 0) สิ่งที่เคยคุยและ "ตกหล่น" จากฉบับก่อน (รวบเข้าฉบับเต็มแล้ว)

1. ต้องมี `KB parity` กับระบบ `instruction-ai` เดิมแบบครบถ้วน และห้ามข้อมูล fact ตกหล่นก่อน publish
2. `Instruction selector` ต้องเป็น dropdown ที่แสดง "ชื่อ Instruction" เท่านั้น (ไม่โชว์ PostgreSQL `_id` บน UI)
3. `Customer reply model` ต้องเป็น dropdown แบบเลือกชัดเจน (UI บังคับเลือก)
4. มี 2 workflow ชัดเจน: `ปรับปรุง` และ `สร้างใหม่` พร้อมกฎ auto-transition
5. โหมด `สร้างใหม่` ใช้ได้เฉพาะตอน `human-only` และรอบแรกทำงานครั้งเดียว จากนั้นสลับเป็น `ปรับปรุง` อัตโนมัติ
6. การแก้ `instruction/model` ต้องมีผลทันทีต่อ page/line config ที่ผูกอยู่
7. Batch history policy: runner ใช้งานทีละ 10–40 ลูกค้า, final batch อนุญาต <10, tool รับได้ 1–40, และต้องวนจนกว่าจะครบ
8. Context compaction ต้องใช้ "โมเดล" ทำ compaction โดยตรงเท่านั้น (ไม่ใช้ truncate heuristic แทน)
9. Self-test ต้องมีอย่างน้อย 5 เคสต่างหมวด และผู้ตัดสินใจวนต่อ/หยุดคือ Agent
10. ผู้เล่นบทลูกค้าใน self-test คือ frontend simulator (no-side-effect)
11. Logs ต้องเห็นแบบละเอียดในหน้า frontend ใหม่ ทั้ง real-time + replay + resume หลังกลับเข้าหน้า
12. OpenAI logs ต้องเห็นโครงสร้าง request/response/tool graph/chunks; default เป็น masked; unmask ต้องมี audit
13. เพิ่มความสามารถ image governance ครบวงจร รวม import รูปที่แอดมินใช้ตอบ, ตั้งชื่อ/คำอธิบาย, link ข้าม pageKeys
14. ต้องมี "ตัวอย่าง instruction แบบง่าย" ให้ agent ใช้เป็น bootstrap template

---

## 1) วัตถุประสงค์ระบบ

1. เพิ่ม conversion และคุณภาพการปิดการขาย
2. ลดความสับสน, ลดบทสนทนาที่ไม่จำเป็น, ลดลูกค้าคุยแล้วหาย
3. ทำให้ agent ปรับปรุง instruction ได้เองจากข้อมูลรอบล่าสุดแบบ incremental
4. ให้แอดมินตรวจสอบย้อนหลังได้ระดับ forensic

## 2) ขอบเขต

1. รองรับหลาย agent
2. หนึ่ง agent ดูแลหลาย `pageKeys` ได้
3. หนึ่ง instruction ใช้ร่วมหลายเพจได้
4. runtime mode มี 2 แบบ
- `human-only`
- `ai-live-reply`
5. agent ใหม่ค่าเริ่มต้น = `human-only`

## 3) Runtime Priority Chain (ล็อกใช้งาน)

ลำดับบังคับ:
1. `emergency_stop`
2. `maintenance_mode`
3. `agent.mode`
4. `user_level_ai_toggle`
5. `system_aiEnabled`
6. `bot.status` (monitoring/alert only สำหรับ managed pages)

กติกา:
1. เพจที่ผูก agent จะไม่ใช้ `bot.status` เป็น hard gate
2. `human-only` = รับข้อความได้ แต่ AI ไม่ตอบ
3. `ai-live-reply` = AI ตอบได้
4. ถ้าส่งข้อความออก channel ไม่สำเร็จ ให้ fallback เป็น no-reply + alert + ส่งเข้า human queue

## 4) โหมดการทำงานหลัก

### 4.1 โหมด `ปรับปรุง` (Improve)
1. เลือก Instruction เป้าหมายจาก dropdown (แสดงชื่อเท่านั้น)
2. ระบบติ๊ก pageKeys ที่กำลังใช้งาน instruction นี้ให้อัตโนมัติ
3. runner วิเคราะห์แชทรอบล่าสุดแล้ว patch instruction เดิม

### 4.2 โหมด `สร้างใหม่` (Create New)
1. ใช้ได้เฉพาะ agent ที่เป็น `human-only`
2. เลือกเฉพาะเพจที่ต้องการเริ่มใช้งาน
3. ระบบสร้าง instruction ใหม่ 1 ครั้ง (one-time bootstrap)
4. รอบถัดไป auto-switch เป็น `Improve` โดยชี้ instruction ที่เพิ่งสร้าง
5. หลังสลับยังคง `human-only` จนกว่าแอดมินจะเปิด `ai-live-reply` เอง

## 5) Scheduling และ Processing Window

1. schedule default: ทุกวันเวลา `00:00` (`Asia/Bangkok`)
2. มีปุ่ม `Process Now`
3. processing ทุก `N` วันต้องตั้งค่าได้ (default `1`)
4. evaluation window ตั้งค่าได้ (แนะนำ 1/2/3/7 วัน; default `3`)
5. ใช้ incremental cursor: ดึงเฉพาะข้อมูลหลังรอบล่าสุด

## 6) Chat History Ingestion Policy

1. ห้ามโยนประวัติทั้งหมดเข้า context ตรง ๆ
2. ต้องดึงผ่าน tool เท่านั้น
3. รอบ batch ลูกค้า:
- ปกติ 10–40 คน/ครั้ง
- final batch <10 ได้เมื่อเหลือน้อย
- tool รับ `1–40` ได้ แต่ runner ต้อง enforce policy ด้านบน
4. ต้อง loop ดึงจนกว่าจะครบทั้งช่วงประเมิน
5. ต้องมีเครื่องมือค้น history รายคนทั้งแบบ keyword และ RAG

## 7) Context Compaction Policy (Model-Only)

1. trigger เมื่อ context estimate > `220,000` tokens
2. compaction ต้องทำโดยโมเดลโดยตรงเท่านั้น
3. ห้ามใช้ heuristic truncation เป็นตัวแทน compaction
4. ต้องสร้าง `compactionManifest` ทุกครั้ง โดยมี:
- `customersProcessed[]`
- `toolCallsSummary`
- `lastProcessedCursor`
5. ต้อง inject manifest กลับเข้า context หลัง compact
6. `ghostThresholdHours` = `24`

## 8) Model Policy

1. runner model = `gpt-5.2` (thinking `xhigh`)
2. customer reply model = เลือกผ่าน dropdown ใน UI
3. UI ต้องบังคับให้เลือกโมเดลอย่างชัดเจนก่อนบันทึก (ไม่มีการโชว์ internal id)
4. การเปลี่ยนโมเดล/Instruction ส่งผลทันทีต่อ config ของ page/line ที่ผูก

## 9) KB Governance (บังคับก่อน publish)

1. ต้องมี KB ครบเทียบเท่า `instruction-ai` เดิม
2. `Create-New` ต้อง clone KB snapshot จาก source ก่อน แล้วค่อย optimize strategy
3. `Improve` ต้อง preserve facts ทั้งหมด
4. ส่วนที่แก้ได้: wording, flow, upsell, choice-close, response efficiency
5. ส่วนที่ห้ามเดา/ห้ามแก้อัตโนมัติ: ราคา, ขนาด, ค่าส่ง, โปร, วิธีชำระ, policy fact
6. `KB Completeness Gate` = 100%
7. `KB Consistency Gate` = ไม่มี conflict กับ source of truth
8. ไม่ผ่าน gate ต้อง iterate ต่อ ห้าม publish

## 10) Self-Test และ Scoring

1. ต่อ iteration ต้องทดสอบอย่างน้อย 5 เคส และต่าง category
2. customer role ในการทดสอบใช้ frontend simulator
3. simulator ต้อง no-side-effect (ไม่ส่งจริงไป channel)
4. rubrics:
- Task Completion 30%
- Factual Accuracy 25%
- Tone & Style Fit 15%
- Response Length Efficiency 10%
- No Hallucination / Policy Safety 20%
5. เงื่อนไขผ่าน:
- test cases >= 5
- factual completeness = 100%
- critical violation = 0
- total score >= admin baseline window
6. คนตัดสินใจหยุด/วนต่อ = Agent

## 11) Logs / Trace / Visibility

1. ต้องมีหน้า frontend ใหม่สำหรับ run trace
2. แสดง real-time + replay จาก DB (source of truth)
3. ปิดหน้าแล้วกลับมาใหม่ยังเห็นครบ และ resume ต่อด้วย `afterSeq`
4. tabs บังคับ:
- Run Timeline
- Agent Saw
- Agent Thought
- Tools
- OpenAI Payload
- Compaction
- Self-Test
- Instruction Diff
- KB Diff & Coverage
5. log policy = `Forensic+Mask`
6. unmask ได้โดย admin ที่ล็อกอิน แต่ทุกครั้งต้อง audit
7. OpenAI snapshots ต้องเก็บ request/response/chunks/usage/tool graph
8. ข้อจำกัดแพลตฟอร์ม: ไม่แสดง raw chain-of-thought ดิบ ให้ reasoning summary + decision journal แทน

## 12) Image Governance

1. create/edit/delete(soft) image collections
2. add/edit/delete(soft) assets
3. แก้ชื่อ/คำอธิบายรูปได้
4. import รูปที่แอดมินใช้ตอบ (system echo + facebook echo) พร้อมกำหนดชื่อ/คำอธิบาย
5. link collections เข้าหลาย `pageKeys`/LINE ที่ดูแล
6. delete ต้องผ่าน approval
7. ผู้อนุมัติ = logged-in admins
8. เริ่มเก็บตั้งแต่ go-live (ไม่ backfill)

## 13) Tooling ของ Agent (ครอบคลุม)

1. history tools: batch customers, per-customer conversation, keyword search, RAG search
2. KB tools: overview/read/search/coverage/conflict check
3. instruction tools: read/write granular แบบปลอดภัย (แนวเดียว instruction-ai และเพิ่ม guardrails)
4. image tools: collection/asset CRUD + link/unlink + import echo
5. write tools contract บังคับ:
- `reason` required, max 500 chars
- `dryRun` default false
- `requestId` for trace
6. ทุก tool response ต้องคืน:
- `toolStatus`
- `latencyMs`
- `dataSizeBytes`
- `truncated`

## 14) Runner Workflow (Canonical)

1. acquire run lock (atomic)
2. load profile + cursor + eval config
3. fetch customer batches ตาม policy
4. fetch bounded conversations per customer
5. analyze/cluster pain points
6. generate patch plan + dry preview
7. apply patch with optimistic lock
8. run self-tests (>=5)
9. score vs admin baseline
10. agent decides continue/stop
11. pass แล้ว publish
12. publish + cursor commit + run complete ใน transaction เดียว
13. release lock

## 15) Data Model (PostgreSQL)

1. `agent_profiles`
2. `agent_runs`
3. `agent_run_events`
4. `agent_openai_snapshots`
5. `agent_processing_cursors`
6. `agent_eval_cases`
7. `agent_eval_results`
8. `agent_decision_journal`
9. `agent_image_import_log`
10. `agent_log_access_audit`

ข้อกำหนด:
1. `agent_run_events.seq` ใช้ per-run atomic counter จาก `agent_runs._seqCounter`
2. run lock ต้องเป็น atomic update เงื่อนไข status/expiry
3. stale lock TTL default 4 ชั่วโมง
4. instruction publish ต้อง optimistic locking (`version` match)

## 16) Atomicity / Consistency

ต้องใช้ PostgreSQL transaction ครอบพร้อมกัน:
1. `publish_instruction_version`
2. `commit_processing_cursor`
3. `mark_run_completed`

ถ้าจุดใด fail ต้อง rollback ทั้งชุด

## 17) API Surface (ต้องมี)

### 17.1 Agent Management
1. `POST /api/agent-forge/agents`
2. `GET /api/agent-forge/agents`
3. `GET /api/agent-forge/agents/:agentId`
4. `PATCH /api/agent-forge/agents/:agentId`
5. `POST /api/agent-forge/agents/:agentId/mode`

### 17.2 Run Control
1. `POST /api/agent-forge/agents/:agentId/run` (รองรับ `dryRun`)
2. `POST /api/agent-forge/runs/:runId/stop`
3. `GET /api/agent-forge/agents/:agentId/runs`
4. `GET /api/agent-forge/runs/:runId`

### 17.3 Stream / Replay
1. `GET /api/agent-forge/runs/:runId/stream?afterSeq=...`
2. `GET /api/agent-forge/runs/:runId/events?afterSeq=...`
3. `POST /api/agent-forge/runs/:runId/replay-from-event/:seq`

### 17.4 OpenAI Snapshots
1. `GET /api/agent-forge/runs/:runId/openai-snapshots`
2. `GET /api/agent-forge/runs/:runId/openai-snapshots/:snapshotId`
3. `POST /api/agent-forge/runs/:runId/openai-snapshots/:snapshotId/unmask`

### 17.5 Simulator / Self-Test
1. `POST /api/agent-forge/internal/simulate-reply`
2. `GET /api/agent-forge/runs/:runId/self-tests`
3. `POST /api/agent-forge/runs/:runId/self-tests/replay`

### 17.6 History
1. `POST /api/agent-forge/history/customers/batch`
2. `POST /api/agent-forge/history/customer/conversation`
3. `POST /api/agent-forge/history/search/keyword`
4. `POST /api/agent-forge/history/search/rag`

### 17.7 Images
1. `POST /api/agent-forge/images/import-admin-echo`
2. `POST /api/agent-forge/images/collections/link-pages`
3. `POST /api/agent-forge/images/assets/:assetId/soft-delete`
4. `POST /api/agent-forge/images/assets/:assetId/approve-delete`

## 18) UI/UX Requirements (สำคัญ)

1. หน้าตั้งค่า agent ต้องมี dropdown:
- Instruction (โชว์ชื่อเท่านั้น)
- Customer reply model
2. ถ้าชื่อ instruction ซ้ำ ให้แยกด้วย metadata ที่อ่านง่าย (เช่น version/updatedAt)
3. ห้ามแสดง internal IDs บนหน้าบ้าน
4. หน้า run trace ต้องมี health card, confidence ring, instruction diff viewer
5. ต้องมีส่วนแสดง bootstrap instruction example ที่ใช้งานได้ทันที

## 19) Non-Functional Requirements

1. DB-backed event stream เป็น source of truth
2. ความปลอดภัยต้องคง helmet/rate limit/sanitization
3. secret ผ่าน `.env` เท่านั้น
4. ต้องไม่กระทบ behavior เพจที่ไม่ผูก agent
5. rollout แบบ feature flag per agent

## 20) Acceptance Criteria (รวมครบ)

1. manual + scheduled ซ้อนกัน ต้องเหลือ run เดียว
2. stale lock auto-release ทำงาน
3. publish success แต่ cursor fail ต้อง rollback ทั้งหมด
4. run ถัดไปไม่ reprocess ก่อน cursor
5. batch policy 10–40 (final <10) enforce จริง
6. conversation payload bounded (default maxMessages=20)
7. self-test <5 ห้าม pass
8. score < baseline ต้อง iterate ต่อ
9. managed page + human-only ต้องไม่ตอบ
10. managed page + ai-live-reply ต้องตอบได้
11. replay/resume หลังกลับเข้าหน้าได้ครบ
12. masked view ไม่เปิดเผยความลับ
13. unmask ทุกครั้งมี audit
14. image flow soft-delete/approve-delete/link/unlink ใช้งานครบ
15. KB completeness/consistency ไม่ผ่าน = publish blocked
16. โหมด create-new ต้องสร้างครั้งเดียวและ auto-switch เป็น improve ในรอบถัดไป
17. เปลี่ยน instruction/model แล้ว config เพจที่ผูกต้องอัปเดตทันที

## 21) ค่าเริ่มต้นระบบ (Defaults)

1. timezone: `Asia/Bangkok`
2. schedule: daily `00:00`
3. processingEveryDays: `1`
4. evaluationWindowDays: `3`
5. ghostThresholdHours: `24`
6. compactionTriggerTokens: `220000`
7. runner model: `gpt-5.2` + `xhigh`
8. agent mode default: `human-only`
9. log mode: `Forensic+Mask`
10. unmask role: logged-in admin

## 22) หมายเหตุด้านข้อจำกัด

1. แม้ requirement อยากเห็น "สิ่งที่ agent คิด" แบบละเอียดมาก ระบบต้องสอดคล้อง policy การเปิดเผย reasoning
2. จึงต้องแสดงเป็น reasoning summary + decision journal + tool traces แทน raw internal chain-of-thought

## 23) Appendix A — ตัวอย่าง Bootstrap Instruction (แบบง่าย)

> ใช้เป็น baseline สำหรับ `Create-New` ก่อนให้ Agent ปรับปรุงต่อ

```text
บทบาท:
คุณคือแอดมินเพจ ตอบสุภาพ สั้น กระชับ เน้นช่วยลูกค้าเลือกสินค้าเร็วที่สุด

เป้าหมาย:
- ปิดการขายให้เร็วขึ้น
- ลดความสับสน
- ลดข้อความยืดเยื้อที่ไม่จำเป็น

กติกาหลัก:
1) ยึดข้อมูลจากตารางสินค้า/FAQ เท่านั้น ห้ามเดา
2) เสนอ 2 ตัวเลือกหลักแล้วจบด้วยคำถามเดียว
3) ถ้าข้อมูลสั่งซื้อไม่ครบ ต้องถามเฉพาะส่วนที่ขาด
4) ถ้าข้อมูลครบ ให้สรุปยอด + ขอชื่อ/ที่อยู่/เบอร์ ในข้อความเดียว
5) ค่าเริ่มต้นเสนอเก็บเงินปลายทาง

รูปแบบตอบ:
- ภาษาไทยเป็นหลัก
- สั้น กระชับ อ่านง่าย
- ใช้ [cut] เมื่อต้องแยกหลายประเด็น

ความปลอดภัย:
- ห้ามแต่งเลขบัญชี/พร้อมเพย์
- ห้ามสรุปข้อมูลจากภาพแบบเดา ถ้าไม่ชัดต้องถามย้ำ
```

## 24) Appendix B — ตัวอย่าง Instruction มาตรฐาน (จากผู้ใช้งาน) + นโยบายการใช้

### 24.1 นโยบายการใช้เป็นค่าเริ่มต้น/แนวทาง

1. ถ้า `Create-New` แล้วยังไม่มี seed instruction ให้ระบบใช้ Appendix B นี้เป็นค่าเริ่มต้นทันที
2. ถ้ามี instruction อยู่แล้ว (โหมด Improve) ให้ Agent ใช้ Appendix B เป็น "แนวทางการปรับปรุง" โดยไม่ override facts จาก KB จริง
3. Appendix B ใช้เป็น baseline สำหรับ style/flow/closing strategy ได้ แต่ข้อมูลราคา-เงื่อนไขต้องยึด KB source ปัจจุบันเสมอ
4. ก่อน publish ต้องผ่าน `KB Completeness Gate` และ `KB Consistency Gate` ตามข้อ 9

### 24.2 เนื้อหา Instruction ตัวอย่าง (ฉบับเต็ม)

```markdown
## บทบาท

คุณคือแอดมิน (หญิง) เพจ "น้ำมันทิพยมนต์" ตอบแชทลูกค้าให้สุภาพ สั้น กระชับ และเน้นปิดการขายให้เร็วขึ้น โดยยึดข้อมูลจากตารางสินค้า + FAQ เท่านั้น (ห้ามเดา/ห้ามแต่งข้อมูล)

เป้าหมายหลัก: ทำให้ลูกค้า “ตัดสินใจเลือก” ได้ง่ายที่สุดใน 1–2 ข้อความ

✅ หลักการตอบเพื่อปิดการขาย (5 ข้อ)
1) ตอบราคาแบบสั้น: โชว์ “2 ตัวเลือกหลัก” (22g คุ้มกว่า / 14g ทดลอง) + ราคาโปร 3/5 ขวด แล้วจบด้วย “คำถามเดียว”
2) ใช้ Choice Close: ให้ลูกค้าตอบง่ายๆ เช่น “พิมพ์ 1 หรือ 2”, “เอา 3 หรือ 5 ขวด”
3) ห้ามเดาขนาด/จำนวน: ถ้าลูกค้าพิมพ์แค่ “3 ขวด/5 ขวด” แต่ไม่บอกขนาด ต้องถามย้ำให้ชัดก่อนสรุปยอด/รับออเดอร์
4) ปิดดีลในข้อความเดียว (เมื่อข้อมูลครบ): ถ้ารู้แล้วว่า “ขนาด + จำนวน” ให้สรุปยอด/ส่งฟรี/วิธีชำระ + ขอชื่อ-ที่อยู่-เบอร์ ในข้อความเดียวทันที
5) การโอนเงิน (สำคัญมาก):
   - ค่าเริ่มต้นเสนอ “เก็บเงินปลายทาง” ✅
   - ห้ามแต่ง/เดาเลขบัญชีหรือพร้อมเพย์ และ “ห้ามใช้เบอร์/เลขที่ลูกค้าให้มา” ไปตอบเป็นบัญชีโอนเด็ดขาด
   - ถ้าลูกค้าขอโอน ให้ส่ง “รูป QR/ข้อมูลโอน” จาก Image Gallery (เลือกภาพที่คำอธิบายระบุว่า QR/ชำระเงิน) ถ้าไม่มีข้อมูลโอน ให้แจ้งขอเวลาตรวจสอบ และเสนอปลายทางแทน

flow การสนทนา (ย่อ)
- ทักครั้งแรก/ถามราคา → ตอบราคาแบบสั้น + Choice Close
- ถ้าลูกค้าขอลอง/รับ 1 ขวด → แจ้งราคา 1 ขวด (รวมส่ง) + เสนอ “โปร 3 ขวดส่งฟรี” ว่าคุ้มกว่าเพราะไม่ต้องจ่ายค่าส่ง (เสนอ 1 ครั้ง ไม่ตื้อ) แล้วให้ลูกค้าเลือก
- ลูกค้าเลือกขนาด/จำนวน → สรุปยอด + ขอข้อมูลจัดส่ง (ชื่อ/ที่อยู่/เบอร์) + ช่องทางชำระ
- ก่อนรับออเดอร์ ต้องแน่ใจว่าข้อมูลครบ: สินค้า, จำนวน, ชื่อ, ที่อยู่, เบอร์, วิธีชำระ
- รับออเดอร์เข้าระบบ และส่งสรุปยอดตามตัวอย่างใน FAQ

คำสั่งพิเศษ
- ใช้ [cut] แยกบับเบิลเมื่อข้อความยาว/มีหลายหัวข้อ (โดยเฉพาะเกินประมาณ 3 บรรทัด)

กฎการตอบ
- ยึดราคากับเงื่อนไขตาม FAQ/ตารางสินค้าเท่านั้น (ห้ามแก้ราคา/เงื่อนไข)
- ตอบให้สั้น กระชับที่สุด
- ถ้าลูกค้าสนใจสินค้า/ขอรายละเอียด ให้ส่งรูปสินค้า 1 รูปที่เกี่ยวข้อง (อย่าส่งรัว)
- อิโมจิใช้ได้เฉพาะ: ✅ 🚚 ‼️ ⭐ 🔥
- คุยภาษาไทยเป็นหลัก แต่ถ้าลูกค้าใช้ภาษาอื่น สามารถตอบตามภาษานั้นได้

✅ กติกาการอ่าน “รูปภาพจากลูกค้า” (สำคัญ)
- เมื่อได้รับรูปภาพจากลูกค้า (เช่น รูปที่อยู่/สลิปโอน) ให้พยายามอ่านข้อความในรูปและสรุปออกมาเป็นข้อความก่อนเสมอ
- ถ้าอ่านได้บางส่วน ให้บอกส่วนที่อ่านได้ + ถามเฉพาะส่วนที่ขาด (เช่น รหัสไปรษณีย์/เบอร์โทร)
- ถ้าอ่านไม่ได้/รูปไม่ชัด ให้ขอให้ลูกค้าพิมพ์ใหม่ในรูปแบบนี้:
  ชื่อผู้รับ:
  ที่อยู่:
  รหัสไปรษณีย์:
  เบอร์โทร:
- ห้ามเดาข้อมูลจากรูปเด็ดขาด ถ้าไม่ชัดต้องถามย้ำ
- หลังได้ข้อมูลครบ ให้ส่งสรุปเพื่อยืนยันอีกครั้งก่อนรับออเดอร์

============================================================

## สินค้า

| ชื่อสินค้า | ราคา | รายละเอียด |
| --- | --- | --- |
| น้ำมันทิพยมนต์ ขนาด 14g (ทดลอง) | 1 ขวด 79.- (ค่าส่ง 30)

•
3 ขวด 199.- (ส่งฟรี 🚚)

•
5 ขวด 299.- (ส่งฟรี 🚚) | สโลแกน: ตำรับน้ำมันสมุนไพรโบราณ เพื่อการผ่อนคลาย บำรุงผิว และสืบสานภูมิปัญญาไทย

•ลักษณะสินค้า: ใช้งานเหมือนยาหม่อง แต่เป็นรูปแบบน้ำมัน ซึมเข้าผิวได้ดีกว่า ไม่เหนียวเหนอะหนะ

•สรรพคุณและอาการที่ใช้ได้:

•เป็นผลิตภัณฑ์สำหรับ ใช้ภายนอกเท่านั้น

•แก้ปวดเมื่อย — ปวดหลัง ปวดคอ ปวดบ่า ปวดไหล่ ปวดเข่า ปวดขา เมื่อยล้าจากการทำงาน

•แมลงกัดต่อย — ทาบริเวณที่ถูกกัด ช่วยลดอาการคัน บวม แดง

•บำรุงผิว — ให้ผิวชุ่มชื้น ไม่แห้งกร้าน จากน้ำมันมะพร้าวและน้ำมันงา

•ผ่อนคลาย / คลายเครียด — กลิ่นหอมสดชื่นจากสมุนไพรธรรมชาติ ช่วยให้รู้สึกสงบ

•วิธีใช้:

•ทาและนวด: หยดน้ำมัน 2-3 หยด ลงบริเวณที่ต้องการ นวดเบาๆ เป็นวงกลม จนน้ำมันซึมเข้าผิว สามารถใช้ได้บ่อยตามต้องการ วันละ 2-3 ครั้ง หรือเมื่อมีอาการ

•สูดดม: เปิดฝาแล้วสูดดมลึกๆ เพื่อบรรเทาอาการคัดจมูก หวัด หรือปวดศีรษะ

•ทาก่อนนอน: ทาบริเวณที่ปวดเมื่อยก่อนนอน ช่วยให้นอนหลับสบายขึ้น

•พกพาสะดวก: ขวดเล็กกะทัดรัด พกไปได้ทุกที่ ใช้ได้ทุกเวลา

•ส่วนประกอบสำคัญ:

•น้ำมันหลัก: น้ำมันมะพร้าว, น้ำมันงา

•สมุนไพรฤทธิ์เย็น: เกล็ดสะระแหน่, พิมเสน, การบูร, เมนทอล

•สมุนไพรอื่นๆ (ตัวอย่าง): ว่านไพล, เปลือกมะกรูด, ว่านทรหด, ก้านพลู, ดีปลี, ขมิ้นอ้อย, ขมิ้นชัน, ทองพันชั่ง, เปราะหอม, กระชายดำ, ว่านชักมดลูก, ฟ้าทะลายโจร, ย่านาง, มะรุม, ชุมเห็ดเทศ, บอระเพ็ด, เสลดพังพอน, บัวบก, ขี้ผึ้ง, น้ำมันแก้ว, และอื่นๆ อีกมากมาย |
| น้ำมันทิพยมนต์ ขนาด 22g (ใหญ่ คุ้มกว่า) | 1 ขวด 99.- (ค่าส่ง 30)

•
3 ขวด 297.- (ส่งฟรี 🚚)

•
5 ขวด 495.- (ส่งฟรี 🚚) | รายละเอียดเหมือนกับอีกขนาด |

============================================================

## FAQ/สถานการณ์ตัวอย่าง

| สถานการณ์ตัวอย่าง/คำถามที่เจอ | คอลัมน์ 2 |
| --- | --- |
| ข้อความเริ่มต้นการสนทนา (ส่งทุกกรณีเมื่อสนทนาครั้งแรก) | สวัสดีค่ะ น้ำมันทิพยมนต์มี 2 ขนาดค่ะ ⭐
1) 22g (คุ้มสุด) โปรส่งฟรี 🚚: 3 ขวด 297 / 5 ขวด 495
2) 14g (ทดลอง) โปรส่งฟรี 🚚: 3 ขวด 199 / 5 ขวด 299
[cut]
สนใจแบบไหนคะ พิมพ์ 1 หรือ 2 พร้อมชื่อ ที่อยู่ เบอร์โทร ได้เลยค่ะ ✅
(เก็บเงินปลายทาง) |
| มีค่าส่งไหม | สั่ง 1 ขวด = ค่าส่ง 30 บาท
สั่ง 2 ขวดขึ้นไป/ชุดโปร = ส่งฟรี 🚚 |
| ตัวอย่างการสรุปยอด | สรุปยอด (ตัวอย่าง) ✅
- 22g 1 ขวด = 129 บาท (รวมส่ง)
ชำระ: เก็บเงินปลายทาง ✅
[cut]
รบกวนยืนยัน **ชื่อ-ที่อยู่-เบอร์โทร** สำหรับจัดส่งอีกครั้งค่ะ |
| ใช้ยังไง | วิธีใช้ ✅
- ทา/นวดบริเวณที่ปวด วันละ 2–3 ครั้ง หรือเมื่อมีอาการ
- สูดดมช่วยคัดจมูก/หวัดได้
- ใช้ภายนอกเท่านั้น
พกพาง่าย ขวดเล็กค่ะ ⭐ |
| ลูกค้าบอกจะรับ 1 ขวด → แนะนำโปร 3/5 ขวด (อัพเซลให้คุ้มค่า) | ได้เลยค่ะ ลอง 1 ขวดได้ค่ะ ✅
⭐ 1) 22g = 129 บาท (รวมส่ง)
⭐ 2) 14g = 109 บาท (รวมส่ง)
[cut]
แต่ถ้าจะให้คุ้มกว่า แนะนำ “โปร 3 ขวด ส่งฟรี 🚚” ค่ะ (ไม่ต้องจ่ายค่าส่ง)
- 22g: 3 ขวด 297
- 14g: 3 ขวด 199
[cut]
สนใจแบบไหนคะ พิมพ์ 1 (22g 1 ขวด) / 2 (14g 1 ขวด) / 3 (โปร 3 ขวดส่งฟรี) ได้เลยค่ะ ✅ |
```

## 25) Addendum — ประเด็นที่คุยไว้และต้องล็อกเพิ่ม

### 25.1 Agent Creation/Linking

1. ตอนสร้าง agent ไม่บังคับให้มี instruction ตั้งต้นเสมอไป
2. ถ้าไม่มี instruction ให้ใช้ flow `Create-New` และ seed จาก Appendix B อัตโนมัติ
3. `Create-New` เมื่อสำเร็จต้อง auto-link instruction ใหม่เข้ากับ pageKeys ที่เลือกทันที
4. การ auto-link ต้องไม่ auto-enable AI reply (ยังคง `human-only` จนแอดมินเปิดเอง)

### 25.2 History Batch UX Contract

1. history batch API ต้องตอบ `totalCustomers` ของรอบนั้น
2. ต้องตอบช่วงที่กำลังดึง เช่น `rangeStart`, `rangeEnd` (ตัวอย่าง 1–10, 11–20)
3. ต้องตอบ `nextCursor` และ `hasMore` เพื่อให้ runner/frontend ดึงต่อได้จนจบ
4. ต้องมี `returnedCount` เพื่อยืนยันว่ารอบนั้นได้ข้อมูลจริงกี่ราย

### 25.3 Round Labeling / Traceability

1. ทุก conversation ที่ถูกใช้วิเคราะห์ ต้องผูก `runId`
2. ต้องเก็บ `windowStart`, `windowEnd`, `evaluationWindowDays` ของ run
3. UI ต้อง filter ดูผลตาม run รอบใดรอบหนึ่งได้
4. ต้องระบุได้ว่าข้อสรุป/patch มาจากรอบไหน เพื่อไม่ปนกับรอบก่อน

### 25.4 KPI ที่ต้องวัดผลหลังใช้งาน

1. conversion rate ก่อน/หลัง run
2. ghost rate (คุยแล้วหายตาม threshold ที่กำหนด)
3. avg turns to close
4. unnecessary back-and-forth rate
5. response time to first useful answer

### 25.5 OpenAI Snapshot Storage Detail

1. ต้องเก็บ masked payload สำหรับ view ปกติ
2. ต้องเก็บ raw payload แยกแบบ encrypted blob
3. unmask ทุกครั้งต้องบันทึกผู้ใช้ เวลา เหตุผล และ snapshotId ใน `agent_log_access_audit`

### 25.6 Go-Live Quality Gate (เฉพาะระบบใหม่)

1. ต้องมี smoke test UI ของหน้า `/admin/agent-forge` และ `/admin/agent-forge/runs/:runId`
2. ต้องมี API smoke test สำหรับ run/create/mode/stream/replay/history/images
3. ต้องมี regression check ว่าเพจที่ไม่ผูก agent ไม่โดน behavior ใหม่
4. ถ้า fail gate ใด gate หนึ่ง ห้ามเปิด feature flag production
