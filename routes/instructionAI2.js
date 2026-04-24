const express = require("express");
const multer = require("multer");
const { ObjectId } = require("mongodb");
const {
  InstructionAI2Service,
  buildRetailTemplateDataItems,
  computeContentHash,
} = require("../services/instructionAI2Service");

const DEFAULT_AI2_MODEL = "gpt-5.4-mini";
const DEFAULT_AI2_THINKING = "low";
const MAX_AI2_TOOL_ITERATIONS = 16;
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
});

const THINKING_MAP = {
  off: "none",
  none: "none",
  low: "low",
  medium: "medium",
  med: "medium",
  high: "high",
  max: "xhigh",
  xhigh: "xhigh",
};

function resolveReasoningEffort(thinking) {
  return THINKING_MAP[String(thinking || DEFAULT_AI2_THINKING).trim().toLowerCase()] || DEFAULT_AI2_THINKING;
}

function mapUsage(usage = {}) {
  return {
    prompt_tokens: usage.input_tokens || usage.prompt_tokens || 0,
    completion_tokens: usage.output_tokens || usage.completion_tokens || 0,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens || usage.completion_tokens_details?.reasoning_tokens || 0,
    total_tokens: usage.total_tokens || ((usage.input_tokens || usage.prompt_tokens || 0) + (usage.output_tokens || usage.completion_tokens || 0)),
  };
}

function addUsage(total, next) {
  const mapped = mapUsage(next);
  for (const key of Object.keys(total)) total[key] = (total[key] || 0) + (mapped[key] || 0);
}

function extractResponseText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  let text = "";
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && typeof part.text === "string") text += part.text;
      if (part?.type === "text" && typeof part.text === "string") text += part.text;
    }
  }
  return text;
}

function extractFunctionCalls(response) {
  return (Array.isArray(response?.output) ? response.output : [])
    .filter((item) => item?.type === "function_call" && item.name && item.call_id)
    .map((item) => ({
      type: "function_call",
      call_id: item.call_id,
      name: item.name,
      arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments || {}),
    }));
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-30).map((entry) => {
    const role = entry?.role === "assistant" ? "assistant" : "user";
    const content = typeof entry?.content === "string" ? entry.content : "";
    return content.trim() ? { role, content } : null;
  }).filter(Boolean);
}

function buildUserContent(message, images = []) {
  const parts = [];
  const text = typeof message === "string" ? message : "";
  if (text.trim()) parts.push({ type: "input_text", text });
  for (const image of Array.isArray(images) ? images : []) {
    const imageUrl = image?.data || image?.dataUrl || image?.imageData || image?.url || "";
    if (typeof imageUrl === "string" && imageUrl.startsWith("data:image/")) {
      parts.push({ type: "input_image", image_url: imageUrl });
    }
  }
  return parts.length ? parts : [{ type: "input_text", text: "" }];
}

function buildInventorySummary(inventory) {
  if (!inventory) return "";
  const items = (inventory.dataItems || [])
    .map((item) => `- ${item.title} (${item.type}, ${item.semanticRole}, rows=${item.rowCount || 0})`)
    .join("\n");
  const pages = (inventory.pages || [])
    .filter((page) => page.linkedToActiveInstruction)
    .map((page) => `${page.pageKey} ${page.name}`)
    .join(", ");
  const warnings = (inventory.warnings || []).map((warning) => `- ${warning.type}: ${warning.message}`).join("\n");
  return [
    `Data items:\n${items || "- none"}`,
    `Linked pages: ${pages || "none"}`,
    `Image collections: ${(inventory.imageCollections || []).length}`,
    warnings ? `Warnings:\n${warnings}` : "",
  ].filter(Boolean).join("\n\n");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === "function") res.flush();
}

function createInstructionAI2Router(deps = {}) {
  const {
    requireAdmin,
    connectDB,
    getOpenAIApiKeyForBot,
    buildLLMClientFromKey,
    resolveModelForProvider,
  } = deps;

  if (!requireAdmin || !connectDB || !getOpenAIApiKeyForBot || !buildLLMClientFromKey || !resolveModelForProvider) {
    throw new Error("InstructionAI2 router dependencies are incomplete");
  }

  const router = express.Router();

  router.get("/admin/instruction-ai2", requireAdmin, async (req, res) => {
    res.render("admin-instruction-ai2", {
      assetVersion: Date.now().toString(36),
      defaultModel: DEFAULT_AI2_MODEL,
      defaultThinking: DEFAULT_AI2_THINKING,
    });
  });

  router.get("/api/instruction-ai2/inventory/:instructionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      const inventory = await service.buildInventory(req.params.instructionId);
      res.json({ success: true, inventory });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post("/api/instruction-ai2/upload-image", requireAdmin, imageUpload.single("image"), async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: "ไม่พบไฟล์รูปภาพ" });
      }
      const mimeType = req.file.mimetype || "image/jpeg";
      if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) {
        return res.status(400).json({ success: false, error: "รองรับเฉพาะ JPG, PNG, WEBP" });
      }
      const imageData = `data:${mimeType};base64,${req.file.buffer.toString("base64")}`;
      res.json({
        success: true,
        imageData,
        name: req.file.originalname || "image",
        mimeType,
        size: req.file.size || req.file.buffer.length,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post("/api/instruction-ai2/instructions/retail-template", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const now = new Date();
      const name = String(req.body?.name || "Retail Instruction").trim() || "Retail Instruction";
      const instructionId = `inst_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
      const dataItems = buildRetailTemplateDataItems({
        assistantName: req.body?.assistantName || "น้องแอดมิน",
        pageName: req.body?.pageName || name,
        persona: req.body?.persona || "",
      });
      const doc = {
        instructionId,
        name,
        description: req.body?.description || "สร้างจาก InstructionAI2 retail starter template",
        templateType: "retail_sales",
        dataItems,
        dataItemRoles: {
          role: dataItems[0].itemId,
          catalog: [dataItems[1].itemId],
          scenarios: [dataItems[2].itemId],
        },
        retailProfile: {
          defaultPaymentMode: "cod",
          primaryLanguage: "th",
          orderRequiredFields: ["items", "quantity", "name", "address", "phone"],
          allowedEmojis: ["✅", "🚚", "‼️", "⭐", "🔥"],
          cutPolicy: { enabled: true, maxLinesBeforeCut: 3 },
          imagePolicy: { sendProductImageOnInterest: true, maxImagesPerAnswer: 1 },
        },
        version: 1,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        source: "instruction_ai2",
      };
      const insert = await db.collection("instructions_v2").insertOne(doc);
      const contentHash = computeContentHash({
        instructionId,
        name,
        description: doc.description,
        dataItems,
        retailProfile: doc.retailProfile,
      });
      await db.collection("instruction_versions").insertOne({
        instructionId,
        version: 1,
        name,
        description: doc.description,
        dataItems,
        retailProfile: doc.retailProfile,
        contentHash,
        source: "instruction_ai2",
        note: "Initial retail starter template",
        savedBy: req.session?.user?.username || "admin",
        snapshotAt: now,
      });
      res.json({ success: true, instruction: { ...doc, _id: insert.insertedId.toString() } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/versions/:instructionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const inst = ObjectId.isValid(req.params.instructionId)
        ? await db.collection("instructions_v2").findOne({ _id: new ObjectId(req.params.instructionId) })
        : await db.collection("instructions_v2").findOne({ instructionId: req.params.instructionId });
      if (!inst) return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
      const logicalId = inst.instructionId || inst._id.toString();
      const versions = await db.collection("instruction_versions")
        .find({ instructionId: logicalId })
        .project({ _id: 0, version: 1, note: 1, snapshotAt: 1, source: 1, contentHash: 1 })
        .sort({ version: -1 })
        .limit(80)
        .toArray();
      res.json({
        success: true,
        currentVersion: Number.isInteger(inst.version) ? inst.version : 0,
        versions,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post("/api/instruction-ai2/versions/:instructionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const inst = ObjectId.isValid(req.params.instructionId)
        ? await db.collection("instructions_v2").findOne({ _id: new ObjectId(req.params.instructionId) })
        : await db.collection("instructions_v2").findOne({ instructionId: req.params.instructionId });
      if (!inst) return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
      const logicalId = inst.instructionId || inst._id.toString();
      const latest = await db.collection("instruction_versions")
        .find({ instructionId: logicalId })
        .sort({ version: -1 })
        .limit(1)
        .next();
      const nextVersion = latest ? Number(latest.version || 0) + 1 : 1;
      const snapshotAt = new Date();
      const snapshot = {
        instructionId: logicalId,
        version: nextVersion,
        name: inst.name || "",
        description: inst.description || "",
        dataItems: Array.isArray(inst.dataItems) ? inst.dataItems : [],
        conversationStarter: inst.conversationStarter || { enabled: false, messages: [] },
        retailProfile: inst.retailProfile || null,
        contentHash: computeContentHash({
          name: inst.name || "",
          description: inst.description || "",
          dataItems: inst.dataItems || [],
          conversationStarter: inst.conversationStarter || null,
          retailProfile: inst.retailProfile || null,
        }),
        source: "instruction_ai2",
        note: String(req.body?.note || "").slice(0, 500),
        savedBy: req.session?.user?.username || "admin",
        snapshotAt,
      };
      await db.collection("instruction_versions").updateOne(
        { instructionId: logicalId, version: nextVersion },
        { $set: snapshot },
        { upsert: true },
      );
      await db.collection("instructions_v2").updateOne(
        { _id: inst._id },
        { $set: { version: nextVersion, updatedAt: snapshotAt } },
      );
      res.json({ success: true, version: nextVersion, note: snapshot.note, snapshotAt });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/stream/state", requireAdmin, (req, res) => {
    res.status(404).json({
      success: false,
      error: "not_found",
      message: "InstructionAI2 stream state persistence is not active for this request",
    });
  });

  router.get("/api/instruction-ai2/stream/resume", requireAdmin, (req, res) => {
    res.status(404).json({
      success: false,
      error: "not_found",
      message: "InstructionAI2 stream resume is not active for this request",
    });
  });

  router.post("/api/instruction-ai2/stream", requireAdmin, async (req, res) => {
    const requestId = `ai2_req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("X-Instruction-AI2-Request-Id", requestId);
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const heartbeat = setInterval(() => {
      sendSse(res, "status", { phase: "working", requestId, elapsedSec: Math.floor((Date.now() - startedAt) / 1000), heartbeat: true });
    }, 5000);

    const finish = () => {
      clearInterval(heartbeat);
      try { res.end(); } catch (_) { }
    };

    try {
      const {
        instructionId,
        message = "",
        model = DEFAULT_AI2_MODEL,
        thinking = DEFAULT_AI2_THINKING,
        history = [],
        sessionId: clientSessionId,
        images = [],
      } = req.body || {};

      if (!instructionId || !ObjectId.isValid(instructionId)) {
        sendSse(res, "error", { error: "ต้องเลือก Instruction ก่อน" });
        finish();
        return;
      }
      if (!String(message || "").trim() && !(Array.isArray(images) && images.length)) {
        sendSse(res, "error", { error: "ต้องพิมพ์ข้อความหรือแนบรูป" });
        finish();
        return;
      }

      const sessionId = typeof clientSessionId === "string" && clientSessionId.trim()
        ? clientSessionId.trim()
        : `ai2_ses_${Date.now().toString(36)}`;
      sendSse(res, "session", { sessionId, requestId });

      const client = await connectDB();
      const db = client.db("chatbot");
      const username = req.session?.user?.username || "admin";
      const apiKeyToUse = await getOpenAIApiKeyForBot(null, null);
      if (!apiKeyToUse?.apiKey) {
        sendSse(res, "error", { error: "ยังไม่พบ OpenAI API Key ในระบบหรือ Environment" });
        finish();
        return;
      }
      const openai = buildLLMClientFromKey(apiKeyToUse);
      if (!openai?.responses?.create) {
        sendSse(res, "error", { error: "ไม่สามารถสร้าง Responses API client ได้" });
        finish();
        return;
      }
      const resolved = resolveModelForProvider(model, apiKeyToUse.provider);
      if (!resolved.ok) {
        sendSse(res, "error", { error: resolved.error });
        finish();
        return;
      }

      const service = new InstructionAI2Service(db, { user: username });
      const instruction = await service.loadInstruction(instructionId);
      if (!instruction) {
        sendSse(res, "error", { error: "ไม่พบ Instruction" });
        finish();
        return;
      }
      const inventory = await service.buildInventory(instructionId);
      const systemPrompt = service.buildSystemPrompt(instruction, buildInventorySummary(inventory));
      const tools = service.getToolDefinitions();
      const effort = resolveReasoningEffort(thinking);

      const input = normalizeHistory(history);
      input.push({ role: "user", content: buildUserContent(message, images) });

      const totalUsage = { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 };
      const toolsUsed = [];
      let finalText = "";
      let iterations = 0;

      sendSse(res, "status", { phase: "thinking", requestId, model: resolved.model, thinking: effort });

      for (let i = 0; i < MAX_AI2_TOOL_ITERATIONS; i += 1) {
        iterations = i + 1;
        const response = await openai.responses.create({
          model: resolved.model,
          instructions: systemPrompt,
          input,
          tools,
          tool_choice: "auto",
          reasoning: { effort },
        });
        addUsage(totalUsage, response?.usage || {});

        const iterationText = extractResponseText(response).trim();
        const calls = extractFunctionCalls(response);
        if (!calls.length) {
          finalText = iterationText || finalText || "ประมวลผลเสร็จแล้ว";
          break;
        }

        if (iterationText) {
          sendSse(res, "commentary_delta", { text: iterationText, iteration: i + 1 });
        }

        input.push(...calls.map((call) => ({
          type: "function_call",
          call_id: call.call_id,
          name: call.name,
          arguments: call.arguments,
        })));

        for (const call of calls) {
          const args = safeJsonParse(call.arguments);
          sendSse(res, "tool_start", { tool: call.name, args, callId: call.call_id, iteration: i + 1 });
          const result = await service.executeTool(instructionId, call.name, args);
          toolsUsed.push({ tool: call.name, args, resultSummary: result?.error || result?.message || result?.title || "ok" });
          sendSse(res, "tool_end", { tool: call.name, callId: call.call_id, result: result?.error ? result.error : (result?.message || "ok"), proposed: !!result?.proposed });
          input.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(result),
          });
        }
      }

      if (!finalText && service.proposals.length) {
        finalText = "ผมเตรียม batch preview ให้ตรวจแล้ว ยังไม่ได้บันทึกจริงจนกว่าจะกด Approve all";
      }
      if (!finalText) finalText = "ประมวลผลเสร็จแล้ว";

      const batch = await service.finalizeBatch({ instructionId, sessionId, requestId, message });
      await db.collection("instruction_ai2_runs").insertOne({
        requestId,
        sessionId,
        instructionObjectId: instructionId,
        instructionId: instruction.instructionId || "",
        username,
        message,
        model: resolved.model,
        thinking: effort,
        toolsUsed,
        batchId: batch?.batchId || null,
        usage: totalUsage,
        iterations,
        finalText,
        createdAt: new Date(startedAt),
        completedAt: new Date(),
      });

      sendSse(res, "answer_delta", { text: finalText });
      sendSse(res, "done", {
        success: true,
        requestId,
        sessionId,
        assistantMessages: [{ role: "assistant", content: finalText }],
        usage: totalUsage,
        toolsUsed,
        batch,
      });
      finish();
    } catch (error) {
      console.error("[InstructionAI2] stream error:", error);
      sendSse(res, "error", { error: error.message || "เกิดข้อผิดพลาด" });
      finish();
    }
  });

  router.post("/api/instruction-ai2/batches/:batchId/commit", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      const result = await service.commitBatch(req.params.batchId, req.session?.user?.username || "admin");
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post("/api/instruction-ai2/batches/:batchId/reject", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      const batch = await service.rejectBatch(req.params.batchId, req.body?.reason || "");
      res.json({ success: true, batch });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post("/api/instruction-ai2/batches/:batchId/revise", requireAdmin, async (req, res) => {
    try {
      const reason = String(req.body?.reason || "").trim();
      const client = await connectDB();
      const db = client.db("chatbot");
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      const batch = await service.rejectBatch(req.params.batchId, reason);
      res.json({
        success: true,
        batch,
        prompt: reason
          ? `ปรับ batch ใหม่ตามเหตุผลนี้: ${reason}`
          : "ปรับ batch ใหม่อีกครั้ง โดยตรวจ proposal เดิมและทำให้ตรงคำสั่งมากขึ้น",
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post("/api/instruction-ai2/sessions", requireAdmin, async (req, res) => {
    try {
      const { sessionId, instructionId, instructionName, history, model, thinking, totalTokens, totalChanges } = req.body || {};
      if (!sessionId || !instructionId) return res.status(400).json({ success: false, error: "Missing sessionId or instructionId" });
      const client = await connectDB();
      const db = client.db("chatbot");
      await db.collection("instruction_ai2_sessions").updateOne(
        { sessionId },
        {
          $set: {
            sessionId,
            instructionId,
            instructionName: instructionName || "",
            history: Array.isArray(history) ? history.slice(-80) : [],
            model: model || DEFAULT_AI2_MODEL,
            thinking: thinking || DEFAULT_AI2_THINKING,
            totalTokens: totalTokens || 0,
            totalChanges: totalChanges || 0,
            username: req.session?.user?.username || "admin",
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
      res.json({ success: true, sessionId });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/sessions", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const filter = req.query.instructionId ? { instructionId: String(req.query.instructionId) } : {};
      const sessions = await db.collection("instruction_ai2_sessions")
        .find(filter)
        .project({ _id: 0 })
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();
      res.json({ success: true, sessions });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/sessions/:sessionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const session = await db.collection("instruction_ai2_sessions").findOne({ sessionId: req.params.sessionId }, { projection: { _id: 0 } });
      if (!session) return res.status(404).json({ success: false, error: "ไม่พบ session" });
      res.json({ success: true, session });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.delete("/api/instruction-ai2/sessions/:sessionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      if (req.query.instructionId) {
        const result = await db.collection("instruction_ai2_sessions").deleteMany({
          instructionId: String(req.query.instructionId),
        });
        return res.json({ success: true, deletedCount: result.deletedCount || 0 });
      }
      await db.collection("instruction_ai2_sessions").deleteOne({ sessionId: req.params.sessionId });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/audit", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const filter = {};
      if (req.query.batchId) filter.batchId = String(req.query.batchId);
      const logs = await db.collection("instruction_ai2_audit")
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(req.query.limit) || 100, 500))
        .toArray();
      res.json({ success: true, logs });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/analytics/:instructionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      res.json(await service.getAnalytics(req.params.instructionId));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createInstructionAI2Router;
