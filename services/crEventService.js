"use strict";

const axios = require("axios");
const crypto = require("crypto");

const SETTINGS_KEY = "crEventWebhook";
const LOG_COLLECTION = "cr_event_logs";
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 30000;
const MAX_PAYLOAD_BYTES = 64 * 1024;

const DEFAULT_EVENT_TYPES = Object.freeze([
  "admin.audit_logged",
  "system.webhook_test",
  "auth.login_succeeded",
  "auth.login_failed",
  "auth.logout",
  "conversation.message_received",
  "conversation.message_sent",
  "conversation.handoff_requested",
  "conversation.ai_stuck",
  "order.created",
  "order.updated",
  "order.status_changed",
  "order.deleted",
  "order.bulk_status_changed",
  "order.bulk_deleted",
  "payment.slip_checked",
  "customer.profile_updated",
  "customer.purchase_status_changed",
  "customer.tags_changed",
  "customer.ai_status_changed",
  "followup.scheduled",
  "followup.sent",
  "followup.cancelled",
  "followup.failed",
  "followup.completed",
  "chat.assignment_changed",
  "chat.queue_status_changed",
  "system_tag.changed",
  "data_form.submitted",
  "data_form.updated",
  "data_form.export_requested",
  "data_form.exported",
  "data_form.export_failed",
  "note.updated",
  "message.feedback_recorded",
  "bot.status_changed",
  "bot.config_changed",
  "instruction.version_created",
  "instruction.batch_committed",
  "instruction.batch_rejected",
  "ai.response_generated",
  "ai.usage_logged",
  "broadcast.started",
  "broadcast.progress",
  "broadcast.completed",
  "broadcast.cancelled",
  "broadcast.failed",
  "notification.delivery_attempted",
  "asset.sent",
  "file.sent",
  "agent_forge.agent_changed",
  "agent_forge.run_started",
  "agent_forge.run_stopped",
  "security.admin_user_changed",
  "security.permission_changed",
]);

function nowDate() {
  return new Date();
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

function normalizeTimeoutMs(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(parsed, 1000), MAX_TIMEOUT_MS);
}

function normalizeEventTypes(value) {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  input.forEach((entry) => {
    const eventType = String(entry || "").trim().slice(0, 120);
    if (!eventType || seen.has(eventType)) return;
    seen.add(eventType);
    out.push(eventType);
  });
  return out;
}

function normalizeConfig(raw = {}) {
  const config = isPlainObject(raw) ? raw : {};
  return {
    enabled: parseBoolean(config.enabled, false),
    url: normalizeUrl(config.url),
    secret: typeof config.secret === "string" ? config.secret.trim().slice(0, 500) : "",
    timeoutMs: normalizeTimeoutMs(config.timeoutMs),
    includeMessageContent: parseBoolean(config.includeMessageContent, false),
    eventTypes: normalizeEventTypes(config.eventTypes),
    dataFormAutoExportEnabled: parseBoolean(config.dataFormAutoExportEnabled, true),
    dataFormManualExportEnabled: parseBoolean(config.dataFormManualExportEnabled, true),
    updatedAt: config.updatedAt || null,
    updatedBy: typeof config.updatedBy === "string" ? config.updatedBy.slice(0, 200) : "",
  };
}

function publicConfig(config) {
  const normalized = normalizeConfig(config);
  return {
    ...normalized,
    secret: normalized.secret ? "********" : "",
    hasSecret: Boolean(normalized.secret),
    knownEventTypes: DEFAULT_EVENT_TYPES,
  };
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!isPlainObject(value)) return value;
  const out = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (/token|secret|password|passcode|authorization|api[-_]?key/i.test(key)) {
      out[key] = entry ? "[redacted]" : "";
      return;
    }
    out[key] = redactSensitive(entry);
  });
  return out;
}

function stripMessageContent(payload) {
  if (Array.isArray(payload)) return payload.map(stripMessageContent);
  if (!isPlainObject(payload)) return payload;
  const out = {};
  Object.entries(payload).forEach(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "message" && isPlainObject(value)) {
      out[key] = stripMessageContent(value);
      return;
    }
    if (["content", "message", "reply", "text", "rawtext"].includes(normalizedKey)) {
      out[key] = value ? "[omitted]" : value;
      return;
    }
    out[key] = stripMessageContent(value);
  });
  return out;
}

function compactPayload(payload, includeMessageContent) {
  const redacted = redactSensitive(payload || {});
  const sanitized = includeMessageContent ? redacted : stripMessageContent(redacted);
  let json = JSON.stringify(sanitized);
  if (Buffer.byteLength(json, "utf8") <= MAX_PAYLOAD_BYTES) return sanitized;
  return {
    truncated: true,
    preview: json.slice(0, MAX_PAYLOAD_BYTES),
  };
}

function buildActor(actor = {}) {
  if (!isPlainObject(actor)) return {};
  return {
    id: actor.id || actor.codeId || null,
    label: actor.label || actor.name || actor.username || "",
    role: actor.role || "",
  };
}

function normalizeDataFormExportMode(value) {
  return ["none", "auto", "manual", "dynamic"].includes(value) ? value : "none";
}

function createCrEventService({ connectDB, logger = console, publicBaseUrl = "" } = {}) {
  if (typeof connectDB !== "function") {
    throw new Error("connectDB_required");
  }
  let configCache = null;
  let configCacheAt = 0;
  const configCacheTtlMs = 5000;

  async function getDb() {
    const client = await connectDB();
    return client.db("chatbot");
  }

  async function getConfig() {
    const now = Date.now();
    if (configCache && now - configCacheAt < configCacheTtlMs) {
      return configCache;
    }
    const db = await getDb();
    const doc = await db.collection("settings").findOne({ key: SETTINGS_KEY });
    configCache = normalizeConfig(doc?.value || {});
    configCacheAt = now;
    return configCache;
  }

  async function saveConfig(payload = {}, actor = {}) {
    const current = await getConfig().catch(() => normalizeConfig({}));
    const incoming = isPlainObject(payload) ? payload : {};
    const merged = {
      ...current,
      ...incoming,
      secret:
        typeof incoming.secret === "string" && incoming.secret === "********"
          ? current.secret
          : incoming.secret,
      updatedAt: nowDate(),
      updatedBy: actor.label || actor.role || "admin",
    };
    const normalized = normalizeConfig(merged);
    if (normalized.enabled && !normalized.url) {
      throw new Error("กรุณากรอก URL สำหรับส่ง CR Event");
    }

    const db = await getDb();
    await db.collection("settings").updateOne(
      { key: SETTINGS_KEY },
      { $set: { key: SETTINGS_KEY, value: normalized, updatedAt: nowDate() } },
      { upsert: true },
    );
    configCache = normalized;
    configCacheAt = Date.now();
    return publicConfig(normalized);
  }

  async function writeLog(doc = {}) {
    try {
      const db = await getDb();
      await db.collection(LOG_COLLECTION).insertOne({
        ...doc,
        createdAt: nowDate(),
      });
    } catch (error) {
      logger.warn?.("[CR Event] log write failed:", error?.message || error);
    }
  }

  function shouldSend(config, eventType, force = false) {
    if (force) return true;
    if (!config.enabled || !config.url) return false;
    if (!Array.isArray(config.eventTypes) || config.eventTypes.length === 0) return true;
    return config.eventTypes.includes(eventType);
  }

  async function sendEvent(eventType, payload = {}, options = {}) {
    const type = String(eventType || "").trim();
    if (!type) return { success: false, skipped: true, reason: "missing_event_type" };

    const config = normalizeConfig(options.config || (await getConfig()));
    const force = options.force === true;
    const targetUrl = normalizeUrl(options.url || config.url);
    if (!targetUrl || !shouldSend({ ...config, url: targetUrl }, type, force)) {
      return { success: false, skipped: true, reason: "disabled_or_filtered" };
    }

    const eventId = options.eventId || crypto.randomUUID();
    const occurredAt = options.occurredAt || nowDate();
    const envelope = {
      eventId,
      eventType: type,
      schemaVersion: "1.0",
      sourceSystem: "ChatCenterAI-6",
      sourceBaseUrl: publicBaseUrl || "",
      occurredAt: occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
      entityType: options.entityType || payload.entityType || "",
      entityId: options.entityId || payload.entityId || "",
      customerId: options.customerId || payload.userId || payload.customerId || "",
      platform: options.platform || payload.platform || "",
      botId: options.botId || payload.botId || "",
      inboxKey: options.inboxKey || payload.inboxKey || "",
      actor: buildActor(options.actor || payload.actor || {}),
      idempotencyKey:
        options.idempotencyKey ||
        crypto
          .createHash("sha256")
          .update(`${type}:${options.entityId || payload.entityId || ""}:${eventId}`)
          .digest("hex"),
      payload: compactPayload(payload, config.includeMessageContent || force),
    };

    const body = JSON.stringify(envelope);
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "ChatCenterAI-6 CR Event Webhook",
      "X-ChatCenter-Event": type,
      "X-ChatCenter-Event-Id": eventId,
    };
    if (config.secret) {
      headers["X-ChatCenter-Signature"] =
        "sha256=" + crypto.createHmac("sha256", config.secret).update(body).digest("hex");
    }

    try {
      const response = await axios.post(targetUrl, body, {
        headers,
        timeout: normalizeTimeoutMs(options.timeoutMs || config.timeoutMs),
        validateStatus: () => true,
      });
      const success = response.status >= 200 && response.status < 300;
      await writeLog({
        eventId,
        eventType: type,
        status: success ? "success" : "failed",
        targetUrl,
        responseStatus: response.status,
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        customerId: envelope.customerId,
        platform: envelope.platform,
        botId: envelope.botId,
        errorMessage: success ? "" : String(response.data?.error || response.statusText || "").slice(0, 500),
        payloadPreview: envelope.payload,
      });
      return { success, eventId, status: response.status, data: response.data };
    } catch (error) {
      await writeLog({
        eventId,
        eventType: type,
        status: "failed",
        targetUrl,
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        customerId: envelope.customerId,
        platform: envelope.platform,
        botId: envelope.botId,
        errorMessage: String(error?.message || error).slice(0, 500),
        payloadPreview: envelope.payload,
      });
      return { success: false, eventId, error: error?.message || String(error) };
    }
  }

  async function sendTest(url = "", actor = {}, overrides = {}) {
    const current = await getConfig();
    const incoming = isPlainObject(overrides) ? { ...overrides } : {};
    if (incoming.secret === "********") {
      incoming.secret = current.secret;
    }
    const config = normalizeConfig({
      ...current,
      ...incoming,
    });
    const targetUrl = normalizeUrl(url || config.url);
    if (!targetUrl) {
      throw new Error("กรุณากรอก URL ที่ถูกต้องก่อนทดสอบ");
    }
    return sendEvent(
      "system.webhook_test",
      {
        message: "CR Event webhook test",
        testedAt: nowDate().toISOString(),
      },
      {
        force: true,
        url: targetUrl,
        config: { ...config, enabled: true, url: targetUrl },
        actor,
        entityType: "system",
        entityId: "cr-event-webhook-test",
      },
    );
  }

  function resolveDataFormExportMode(config, form = {}) {
    const normalized = normalizeConfig(config || {});
    const formMode = normalizeDataFormExportMode(form?.crmExportMode);
    if (formMode === "auto" && normalized.dataFormAutoExportEnabled) return "auto";
    if (formMode === "manual" && normalized.dataFormManualExportEnabled) return "manual";
    if (
      formMode === "dynamic" &&
      (normalized.dataFormAutoExportEnabled || normalized.dataFormManualExportEnabled)
    ) {
      return "dynamic";
    }
    return "";
  }

  return {
    SETTINGS_KEY,
    DEFAULT_EVENT_TYPES,
    getConfig,
    saveConfig,
    sendEvent,
    sendTest,
    publicConfig,
    normalizeConfig,
    resolveDataFormExportMode,
  };
}

module.exports = createCrEventService;
