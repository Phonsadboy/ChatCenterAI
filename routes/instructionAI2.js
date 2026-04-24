const express = require("express");
const multer = require("multer");
const { ObjectId } = require("bson");
const {
  InstructionAI2Service,
  buildRetailTemplateDataItems,
  computeContentHash,
} = require("../services/instructionAI2Service");

const DEFAULT_AI2_MODEL = "gpt-5.4";
const DEFAULT_AI2_THINKING = "medium";
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

const activeAI2Requests = new Map();
let ai2IndexesPromise = null;

function makeSsePayload(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sanitizeBatchForPersistence(batch) {
  if (!batch || typeof batch !== "object") return batch;
  const clone = { ...batch };
  delete clone.confirmationToken;
  delete clone.confirmationExpiresAt;
  return clone;
}

function sanitizeEventDataForPersistence(data = {}) {
  if (!data || typeof data !== "object") return data;
  const clone = { ...data };
  if (clone.batch) clone.batch = sanitizeBatchForPersistence(clone.batch);
  return clone;
}

function cleanupAI2Request(requestId) {
  setTimeout(() => activeAI2Requests.delete(requestId), 2 * 60 * 1000);
}

function buildAI2RequestSnapshot(state = {}) {
  return {
    success: true,
    requestId: state.requestId,
    sessionId: state.sessionId || null,
    status: state.status || "running",
    phase: state.phase || "working",
    iteration: state.iteration || 1,
    tool: state.tool || null,
    elapsedSec: Math.floor((Date.now() - (state.createdAt || Date.now())) / 1000),
    tools: state.tools || [],
    toolsUsed: state.toolsUsed || [],
    changes: state.changes || [],
    usage: state.usage || {},
    partialContent: state.answerContent || "",
    commentaryText: state.commentaryText || "",
    assistantMessages: state.assistantMessages || [],
    batch: state.batch || null,
    error: state.error || null,
  };
}

function buildAI2RunSnapshot(run = {}, batch = null) {
  const createdAt = run.createdAt ? new Date(run.createdAt).getTime() : Date.now();
  return {
    success: true,
    requestId: run.requestId,
    sessionId: run.sessionId || null,
    status: run.status || "complete",
    phase: run.phase || (run.status === "error" ? "error" : "done"),
    iteration: run.iterations || 1,
    tool: null,
    elapsedSec: Math.floor((Date.now() - createdAt) / 1000),
    tools: run.toolStates || [],
    toolsUsed: run.toolsUsed || [],
    changes: Array.isArray(batch?.changes) ? batch.changes.map((change) => ({ changeId: change.changeId, tool: change.operation })) : [],
    usage: run.usage || {},
    partialContent: run.finalText || "",
    commentaryText: run.commentaryText || "",
    assistantMessages: run.finalText ? [{ role: "assistant", content: run.finalText }] : [],
    batch,
    error: run.error || null,
  };
}

function ensureAI2Indexes(db) {
  if (!ai2IndexesPromise) {
    ai2IndexesPromise = new InstructionAI2Service(db).ensureIndexes().catch((error) => {
      console.warn("[InstructionAI2] ensure indexes failed:", error?.message || error);
    });
  }
  return ai2IndexesPromise;
}

function createInstructionAI2Router(deps = {}) {
  const {
    requireAdmin,
    connectDB,
    getOpenAIApiKeyForBot,
    buildLLMClientFromKey,
    resolveModelForProvider,
    invalidateAllRuntimeCaches,
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
    let runColl = null;
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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

  router.get("/api/instruction-ai2/stream/state", requireAdmin, async (req, res) => {
    const requestId = String(req.query.requestId || "");
    const state = activeAI2Requests.get(requestId);
    if (state) return res.json(buildAI2RequestSnapshot(state));
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const run = await db.collection("instruction_ai2_runs").findOne({ requestId });
      if (!run) return res.status(404).json({ success: false, error: "not_found" });
      let batch = null;
      if (run.batchId) {
        const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
        batch = await service.refreshBatchConfirmationToken(run.batchId);
      }
      return res.json(buildAI2RunSnapshot(run, batch));
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/stream/resume", requireAdmin, async (req, res) => {
    const requestId = String(req.query.requestId || "");
    const state = activeAI2Requests.get(requestId);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("X-Instruction-AI2-Request-Id", requestId);
    if (typeof res.flushHeaders === "function") res.flushHeaders();
    if (!state) {
      try {
        const client = await connectDB();
        const db = client.db("chatbot");
        const run = await db.collection("instruction_ai2_runs").findOne({ requestId });
        if (!run) {
          res.write(makeSsePayload("error", { error: "not_found" }));
          res.end();
          return;
        }
        for (const event of Array.isArray(run.events) ? run.events : []) {
          const payload = event.payload || makeSsePayload(event.event || "status", event.data || {});
          try { res.write(payload); } catch (_) { res.end(); return; }
        }
        if (run.status === "complete" || run.status === "error") {
          if (run.status === "complete") {
            let batch = null;
            if (run.batchId) {
              const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
              batch = await service.refreshBatchConfirmationToken(run.batchId);
            }
            res.write(makeSsePayload("done", {
              success: true,
              requestId,
              sessionId: run.sessionId || null,
              assistantMessages: run.finalText ? [{ role: "assistant", content: run.finalText }] : [],
              usage: run.usage || {},
              toolsUsed: run.toolsUsed || [],
              batch,
            }));
          }
          res.end();
          return;
        }
        res.write(makeSsePayload("error", { error: "stream_not_active" }));
        res.end();
        return;
      } catch (error) {
        res.write(makeSsePayload("error", { error: error.message }));
        res.end();
        return;
      }
    }
    for (const event of state.events || []) {
      try { res.write(event.payload); } catch (_) { res.end(); return; }
    }
    if (state.status === "complete" || state.status === "error") {
      res.end();
      return;
    }
    state.listeners.add(res);
    req.on("close", () => state.listeners.delete(res));
  });

  router.post("/api/instruction-ai2/stream", requireAdmin, async (req, res) => {
    const requestId = `ai2_req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    let runColl = null;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("X-Instruction-AI2-Request-Id", requestId);
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const requestState = {
      requestId,
      sessionId: null,
      status: "running",
      phase: "starting",
      iteration: 1,
      tool: null,
      createdAt: startedAt,
      updatedAt: Date.now(),
      events: [],
      listeners: new Set([res]),
      tools: [],
      toolsUsed: [],
      changes: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 },
      answerContent: "",
      commentaryText: "",
      assistantMessages: [],
      batch: null,
      error: null,
    };
    activeAI2Requests.set(requestId, requestState);
    req.on("close", () => {
      requestState.listeners.delete(res);
    });

    const persistEvent = (event, data = {}, payload = "") => {
      if (!runColl) return;
      const persistedData = sanitizeEventDataForPersistence(data);
      const persistedPayload = makeSsePayload(event, persistedData);
      runColl.updateOne(
        { requestId },
        {
          $push: {
            events: {
              $each: [{
                event,
                data: persistedData,
                payload: persistedPayload || payload,
                at: new Date(),
              }],
              $slice: -500,
            },
          },
          $set: {
            lastEvent: event,
            lastEventAt: new Date(),
            updatedAt: new Date(),
          },
          $setOnInsert: { requestId, createdAt: new Date(startedAt) },
        },
        { upsert: true },
      ).catch(() => {});
    };

    const sendEvent = (event, data = {}) => {
      const payload = makeSsePayload(event, data);
      requestState.events.push({ event, data, payload, at: Date.now() });
      requestState.updatedAt = Date.now();
      persistEvent(event, data, payload);
      for (const listener of Array.from(requestState.listeners)) {
        try {
          listener.write(payload);
          if (typeof listener.flush === "function") listener.flush();
        } catch (_) {
          requestState.listeners.delete(listener);
        }
      }
    };

    const updateState = (patch = {}) => {
      Object.assign(requestState, patch, { updatedAt: Date.now() });
    };

    const heartbeat = setInterval(() => {
      sendEvent("status", { phase: requestState.phase || "working", requestId, elapsedSec: Math.floor((Date.now() - startedAt) / 1000), heartbeat: true });
    }, 5000);

    const finish = () => {
      clearInterval(heartbeat);
      for (const listener of Array.from(requestState.listeners)) {
        try { listener.end(); } catch (_) { }
      }
      requestState.listeners.clear();
      cleanupAI2Request(requestId);
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
        updateState({ status: "error", error: "ต้องเลือก Instruction ก่อน" });
        sendEvent("error", { error: "ต้องเลือก Instruction ก่อน" });
        finish();
        return;
      }
      if (!String(message || "").trim() && !(Array.isArray(images) && images.length)) {
        updateState({ status: "error", error: "ต้องพิมพ์ข้อความหรือแนบรูป" });
        sendEvent("error", { error: "ต้องพิมพ์ข้อความหรือแนบรูป" });
        finish();
        return;
      }

      const sessionId = typeof clientSessionId === "string" && clientSessionId.trim()
        ? clientSessionId.trim()
        : `ai2_ses_${Date.now().toString(36)}`;
      updateState({ sessionId });
      sendEvent("session", { sessionId, requestId });

      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      runColl = db.collection("instruction_ai2_runs");
      const username = req.session?.user?.username || "admin";
      const apiKeyToUse = await getOpenAIApiKeyForBot(null, null);
      if (!apiKeyToUse?.apiKey) {
        updateState({ status: "error", error: "ยังไม่พบ OpenAI API Key ในระบบหรือ Environment" });
        sendEvent("error", { error: "ยังไม่พบ OpenAI API Key ในระบบหรือ Environment" });
        finish();
        return;
      }
      const openai = buildLLMClientFromKey(apiKeyToUse);
      if (!openai?.responses?.create) {
        updateState({ status: "error", error: "ไม่สามารถสร้าง Responses API client ได้" });
        sendEvent("error", { error: "ไม่สามารถสร้าง Responses API client ได้" });
        finish();
        return;
      }
      const resolved = resolveModelForProvider(model, apiKeyToUse.provider);
      if (!resolved.ok) {
        updateState({ status: "error", error: resolved.error });
        sendEvent("error", { error: resolved.error });
        finish();
        return;
      }

      const service = new InstructionAI2Service(db, {
        user: username,
        modelValidator: (candidateModel, candidateEffort) => {
          const resolvedCandidate = resolveModelForProvider(candidateModel, apiKeyToUse.provider);
          if (!resolvedCandidate.ok) return { ok: false, error: resolvedCandidate.error };
          return { ok: true, model: resolvedCandidate.model, reasoningEffort: resolveReasoningEffort(candidateEffort || DEFAULT_AI2_THINKING) };
        },
      });
      const instruction = await service.loadInstruction(instructionId);
      if (!instruction) {
        updateState({ status: "error", error: "ไม่พบ Instruction" });
        sendEvent("error", { error: "ไม่พบ Instruction" });
        finish();
        return;
      }
      await runColl.updateOne(
        { requestId },
        {
          $setOnInsert: { requestId, createdAt: new Date(startedAt) },
          $set: {
            sessionId,
            instructionObjectId: instructionId,
            instructionId: instruction.instructionId || "",
            username,
            message,
            model: resolved.model,
            thinking: resolveReasoningEffort(thinking),
            status: "running",
            phase: "inventory",
            events: requestState.events.map((event) => ({
              event: event.event,
              data: event.data,
              payload: event.payload,
              at: new Date(event.at || Date.now()),
            })),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      const totalUsage = { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 };
      const toolsUsed = [];
      updateState({ phase: "tool", tool: "get_instruction_inventory", iteration: 0 });
      const inventoryToolState = {
        tool: "get_instruction_inventory",
        callId: `${requestId}_inventory`,
        args: {},
        status: "running",
        startedAt: Date.now(),
        updatedAt: Date.now(),
      };
      requestState.tools.push(inventoryToolState);
      sendEvent("tool_start", { tool: "get_instruction_inventory", args: {}, callId: inventoryToolState.callId, iteration: 0 });
      const inventory = await service.buildInventory(instructionId);
      inventoryToolState.status = "done";
      inventoryToolState.summary = "inventory loaded";
      inventoryToolState.endedAt = Date.now();
      inventoryToolState.updatedAt = Date.now();
      toolsUsed.push({ tool: "get_instruction_inventory", args: {}, resultSummary: "inventory loaded" });
      updateState({ toolsUsed });
      sendEvent("tool_end", { tool: "get_instruction_inventory", args: {}, callId: inventoryToolState.callId, result: "inventory loaded", summary: "inventory loaded" });

      const systemPrompt = service.buildSystemPrompt(instruction, buildInventorySummary(inventory));
      const tools = service.getToolDefinitions();
      const effort = resolveReasoningEffort(thinking);

      const input = normalizeHistory(history);
      input.push({ role: "user", content: buildUserContent(message, images) });

      let finalText = "";
      let iterations = 0;

      updateState({ phase: "thinking", tool: null, usage: totalUsage });
      sendEvent("status", { phase: "thinking", requestId, model: resolved.model, thinking: effort });

      for (let i = 0; i < MAX_AI2_TOOL_ITERATIONS; i += 1) {
        iterations = i + 1;
        updateState({ phase: "thinking", iteration: iterations, tool: null });
        const response = await openai.responses.create({
          model: resolved.model,
          instructions: systemPrompt,
          input,
          tools,
          tool_choice: "auto",
          reasoning: { effort },
        });
        addUsage(totalUsage, response?.usage || {});
        updateState({ usage: totalUsage });

        const iterationText = extractResponseText(response).trim();
        const calls = extractFunctionCalls(response);
        if (!calls.length) {
          finalText = iterationText || finalText || "ประมวลผลเสร็จแล้ว";
          break;
        }

        if (iterationText) {
          requestState.commentaryText += iterationText;
          sendEvent("commentary_delta", { text: iterationText, iteration: i + 1 });
        }

        input.push(...calls.map((call) => ({
          type: "function_call",
          call_id: call.call_id,
          name: call.name,
          arguments: call.arguments,
        })));

        for (const call of calls) {
          const args = safeJsonParse(call.arguments);
          const toolState = {
            tool: call.name,
            callId: call.call_id,
            args,
            argumentsText: call.arguments || "",
            status: "running",
            startedAt: Date.now(),
            updatedAt: Date.now(),
          };
          requestState.tools.push(toolState);
          updateState({ phase: "tool", iteration: i + 1, tool: call.name });
          sendEvent("tool_start", { tool: call.name, args, callId: call.call_id, argumentsText: call.arguments || "", iteration: i + 1 });
          const result = await service.executeTool(instructionId, call.name, args);
          const resultSummary = result?.error || result?.message || result?.title || "ok";
          toolsUsed.push({ tool: call.name, args, resultSummary });
          toolState.status = result?.error ? "error" : "done";
          toolState.summary = resultSummary;
          toolState.result = resultSummary;
          toolState.endedAt = Date.now();
          toolState.updatedAt = Date.now();
          updateState({ toolsUsed });
          sendEvent("tool_end", { tool: call.name, args, callId: call.call_id, result: resultSummary, summary: resultSummary, proposed: !!result?.proposed });
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
      const changes = batch?.changes?.map((change) => ({ changeId: change.changeId, tool: change.operation })) || [];
      updateState({
        phase: "final_answer",
        tool: null,
        answerContent: finalText,
        assistantMessages: [{ role: "assistant", content: finalText }],
        batch,
        changes,
      });
      await runColl.updateOne(
        { requestId },
        {
          $set: {
            sessionId,
            instructionObjectId: instructionId,
            instructionId: instruction.instructionId || "",
            username,
            message,
            model: resolved.model,
            thinking: effort,
            status: "complete",
            phase: "done",
            toolsUsed,
            toolStates: requestState.tools,
            batchId: batch?.batchId || null,
            usage: totalUsage,
            iterations,
            finalText,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(startedAt) },
        },
        { upsert: true },
      );

      sendEvent("answer_delta", { text: finalText });
      updateState({ status: "complete" });
      sendEvent("done", {
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
      if (runColl) {
        runColl.updateOne(
          { requestId },
          {
            $set: {
              status: "error",
              phase: "error",
              error: error.message || "เกิดข้อผิดพลาด",
              toolStates: requestState.tools,
              updatedAt: new Date(),
            },
            $setOnInsert: { requestId, createdAt: new Date(startedAt) },
          },
          { upsert: true },
        ).catch(() => {});
      }
      updateState({ status: "error", error: error.message || "เกิดข้อผิดพลาด" });
      sendEvent("error", { error: error.message || "เกิดข้อผิดพลาด" });
      finish();
    }
  });

  router.post("/api/instruction-ai2/batches/:batchId/commit", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      const result = await service.commitBatch(req.params.batchId, req.session?.user?.username || "admin", {
        confirmationToken: req.body?.confirmationToken || "",
        commitRequestId: req.body?.commitRequestId || "",
      });
      if (result?.success && typeof invalidateAllRuntimeCaches === "function") {
        invalidateAllRuntimeCaches();
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/batches/:batchId/preflight", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      const batch = await db.collection("instruction_ai2_batches").findOne({ batchId: req.params.batchId });
      if (!batch) return res.status(404).json({ success: false, error: "ไม่พบ batch" });
      const preflight = await service.preflightBatch(batch);
      res.json({ success: true, preflight });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post("/api/instruction-ai2/batches/:batchId/reject", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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
      void ensureAI2Indexes(db);
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

  router.get("/api/instruction-ai2/tool-registry", requireAdmin, async (req, res) => {
    try {
      const service = new InstructionAI2Service({ collection: () => ({}) }, { user: req.session?.user?.username || "admin" });
      res.json(service.getToolRegistry());
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/eval/:instructionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      res.json(await service.runRegressionEvalSuite(req.params.instructionId));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/readiness/:instructionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      res.json(await service.getReadinessDashboard(req.params.instructionId));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/recommendations/:instructionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      res.json(await service.getRecommendations(req.params.instructionId));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/analytics/:instructionId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      res.json(await service.getAnalytics(req.params.instructionId));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/analytics/:instructionId/episodes", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      res.json(await service.getEpisodeAnalytics(req.params.instructionId, { limit: req.query.limit }));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/api/instruction-ai2/analytics/:instructionId/episodes/:episodeId", requireAdmin, async (req, res) => {
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      void ensureAI2Indexes(db);
      const service = new InstructionAI2Service(db, { user: req.session?.user?.username || "admin" });
      res.json(await service.getEpisodeDetail(req.params.instructionId, { episodeId: req.params.episodeId }));
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createInstructionAI2Router;
