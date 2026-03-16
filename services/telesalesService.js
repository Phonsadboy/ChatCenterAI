const moment = require("moment-timezone");
const { ObjectId } = require("mongodb");

const DEFAULT_TIMEZONE = "Asia/Bangkok";
const REPORT_INTERVAL_MS = 60 * 1000;
const DEFAULT_REPORT_TIME = "18:30";

const LEAD_COLLECTION = "telesales_leads";
const CHECKPOINT_COLLECTION = "telesales_checkpoints";
const CALL_LOG_COLLECTION = "telesales_call_logs";
const REPORT_COLLECTION = "telesales_daily_reports";

const LEAD_STATUSES = new Set(["active", "paused", "dnc", "archived"]);
const CHECKPOINT_TYPES = new Set([
  "reorder",
  "callback",
  "manual_reopen",
  "system_reorder",
]);
const CHECKPOINT_STATUSES = new Set(["open", "done", "canceled", "overdue"]);
const CALL_OUTCOMES = new Set([
  "no_answer",
  "busy",
  "call_back",
  "interested",
  "not_interested",
  "already_bought_elsewhere",
  "wrong_number",
  "do_not_call",
  "closed_won",
  "purchased_via_ai",
]);
const CONTACTED_OUTCOMES = new Set([
  "call_back",
  "interested",
  "not_interested",
  "already_bought_elsewhere",
  "wrong_number",
  "do_not_call",
  "closed_won",
]);
const NEXT_CHECKPOINT_REQUIRED_OUTCOMES = new Set([
  "no_answer",
  "busy",
  "call_back",
  "interested",
  "not_interested",
]);

function normalizeString(value, maxLength = 255) {
  if (typeof value === "string") return value.trim().slice(0, maxLength);
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function normalizeIdString(value) {
  return normalizeString(value, 80);
}

function normalizePlatform(value) {
  const normalized = normalizeString(value, 40).toLowerCase();
  if (normalized === "facebook") return "facebook";
  if (normalized === "instagram") return "instagram";
  if (normalized === "whatsapp") return "whatsapp";
  return "line";
}

function normalizeLeadStatus(value, fallback = "active") {
  const normalized = normalizeString(value, 40).toLowerCase();
  return LEAD_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeCheckpointType(value, fallback = "callback") {
  const normalized = normalizeString(value, 40).toLowerCase();
  return CHECKPOINT_TYPES.has(normalized) ? normalized : fallback;
}

function normalizeCheckpointStatus(value, fallback = "open") {
  const normalized = normalizeString(value, 40).toLowerCase();
  return CHECKPOINT_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeOutcome(value) {
  const normalized = normalizeString(value, 60).toLowerCase();
  return CALL_OUTCOMES.has(normalized) ? normalized : "";
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toMoment(value, timezone = DEFAULT_TIMEZONE) {
  const date = normalizeDate(value);
  return date ? moment.tz(date, timezone) : moment.tz(timezone);
}

function getDateKey(value = new Date(), timezone = DEFAULT_TIMEZONE) {
  return toMoment(value, timezone).format("YYYY-MM-DD");
}

function addDays(value, days, timezone = DEFAULT_TIMEZONE) {
  return toMoment(value, timezone).add(days, "days").toDate();
}

function parseCycleDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function inferOrderSource(order) {
  const explicit = normalizeString(order?.orderSource, 40).toLowerCase();
  if (explicit === "telesales") return "telesales";
  if (explicit === "manual") return "manual";
  if (explicit === "ai_chat") return "ai_chat";
  const extractedFrom = normalizeString(order?.extractedFrom, 80).toLowerCase();
  if (extractedFrom === "ai_tool") return "ai_chat";
  if (order?.isManualExtraction === true) return "manual";
  return "manual";
}

function buildDisplayName(order = {}) {
  const orderData = order.orderData || {};
  return (
    normalizeString(orderData.customerName, 120) ||
    normalizeString(orderData.recipientName, 120) ||
    normalizeString(order.facebookName, 120) ||
    normalizeString(order.senderName, 120) ||
    ""
  );
}

function buildPhone(order = {}) {
  const orderData = order.orderData || {};
  return (
    normalizeString(orderData.phone, 40) ||
    normalizeString(orderData.customerPhone, 40) ||
    normalizeString(orderData.shippingPhone, 40) ||
    ""
  );
}

function buildDueReasonFromOrder(order, dueAt) {
  const items = Array.isArray(order?.orderData?.items) ? order.orderData.items : [];
  return [
    {
      type: "order_cycle",
      orderId: normalizeIdString(order?._id),
      products: items
        .map((item) => normalizeString(item?.product, 120))
        .filter(Boolean)
        .slice(0, 10),
      teleSalesCycleDays: parseCycleDays(order?.teleSalesCycleDays),
      dueAt: normalizeDate(dueAt),
      orderSource: inferOrderSource(order),
    },
  ];
}

function mapLeadDoc(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    userId: doc.userId || "",
    platform: normalizePlatform(doc.platform),
    botId: doc.botId || null,
    displayName: doc.displayName || "",
    phone: doc.phone || "",
    ownerSalesUserId: doc.ownerSalesUserId || null,
    status: normalizeLeadStatus(doc.status),
    currentCheckpointId: doc.currentCheckpointId || null,
    nextDueAt: doc.nextDueAt || null,
    overdueSince: doc.overdueSince || null,
    latestOrderId: doc.latestOrderId || null,
    sourceOrderIds: Array.isArray(doc.sourceOrderIds) ? doc.sourceOrderIds : [],
    dueReasons: Array.isArray(doc.dueReasons) ? doc.dueReasons : [],
    needsCycle: doc.needsCycle === true,
    needsCycleOrderIds: Array.isArray(doc.needsCycleOrderIds) ? doc.needsCycleOrderIds : [],
    lastOrderAt: doc.lastOrderAt || null,
    lastTeleSalesWonAt: doc.lastTeleSalesWonAt || null,
    lastAiOrderAt: doc.lastAiOrderAt || null,
    lastContactAt: doc.lastContactAt || null,
    pauseReason: doc.pauseReason || null,
    dncReason: doc.dncReason || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function mapCheckpointDoc(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    leadId: doc.leadId || null,
    seq: typeof doc.seq === "number" ? doc.seq : 1,
    type: normalizeCheckpointType(doc.type, "callback"),
    dueAt: doc.dueAt || null,
    status: normalizeCheckpointStatus(doc.status),
    assignedToSalesUserId: doc.assignedToSalesUserId || null,
    sourceOrderIds: Array.isArray(doc.sourceOrderIds) ? doc.sourceOrderIds : [],
    dueReasons: Array.isArray(doc.dueReasons) ? doc.dueReasons : [],
    resolvedOutcome: doc.resolvedOutcome || null,
    resolvedAt: doc.resolvedAt || null,
    resolvedBySalesUserId: doc.resolvedBySalesUserId || null,
    cancelReason: doc.cancelReason || null,
    createdAt: doc.createdAt || null,
    createdBy: doc.createdBy || null,
  };
}

function mapCallLogDoc(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    leadId: doc.leadId || null,
    checkpointId: doc.checkpointId || null,
    salesUserId: doc.salesUserId || null,
    outcome: doc.outcome || null,
    note: doc.note || "",
    nextCheckpointAt: doc.nextCheckpointAt || null,
    createdOrderId: doc.createdOrderId || null,
    loggedByType: doc.loggedByType || "sales_user",
    loggedAt: doc.loggedAt || null,
    metadata: doc.metadata || null,
  };
}

class TeleSalesService {
  constructor(options = {}) {
    this.connectDB = options.connectDB;
    this.timezone = options.timezone || DEFAULT_TIMEZONE;
    this.notificationService = options.notificationService || null;
    this.openaiClient = options.openaiClient || null;
    this.reportModel = options.reportModel || process.env.TELESALES_REPORT_MODEL || "gpt-4.1-mini";
    this.reportTime = normalizeString(
      options.reportTime || process.env.TELESALES_REPORT_TIME || DEFAULT_REPORT_TIME,
      5,
    ) || DEFAULT_REPORT_TIME;
    this.reportTimer = null;
    this.reportProcessing = false;
  }

  async _db() {
    const client = await this.connectDB();
    return client.db("chatbot");
  }

  async ensureIndexes() {
    const db = await this._db();
    await db.collection(LEAD_COLLECTION).createIndexes([
      { key: { userId: 1, platform: 1, botId: 1 }, unique: true },
      { key: { ownerSalesUserId: 1, status: 1, nextDueAt: 1 } },
      { key: { status: 1, nextDueAt: 1 } },
      { key: { needsCycle: 1, updatedAt: -1 } },
      { key: { latestOrderId: 1 } },
    ]);
    await db.collection(CHECKPOINT_COLLECTION).createIndexes([
      { key: { leadId: 1, status: 1, dueAt: 1 } },
      { key: { assignedToSalesUserId: 1, status: 1, dueAt: 1 } },
      {
        key: { leadId: 1, status: 1 },
        unique: true,
        partialFilterExpression: { status: "open" },
      },
      { key: { "sourceOrderIds.0": 1 } },
    ]);
    await db.collection(CALL_LOG_COLLECTION).createIndexes([
      { key: { leadId: 1, loggedAt: -1 } },
      { key: { checkpointId: 1, loggedAt: -1 } },
      { key: { salesUserId: 1, loggedAt: -1 } },
      { key: { outcome: 1, loggedAt: -1 } },
    ]);
    await db.collection(REPORT_COLLECTION).createIndexes([
      { key: { dateKey: 1, scopeType: 1, scopeId: 1 }, unique: true },
      { key: { generatedAt: -1 } },
    ]);
  }

  async _getLeadById(db, leadId) {
    if (!ObjectId.isValid(leadId)) return null;
    return db.collection(LEAD_COLLECTION).findOne({ _id: new ObjectId(leadId) });
  }

  async _getOpenCheckpointForLead(db, leadId) {
    return db.collection(CHECKPOINT_COLLECTION).findOne({
      leadId,
      status: "open",
    });
  }

  async _getCheckpointById(db, checkpointId) {
    if (!ObjectId.isValid(checkpointId)) return null;
    return db.collection(CHECKPOINT_COLLECTION).findOne({
      _id: new ObjectId(checkpointId),
    });
  }

  async _getNextCheckpointSeq(db, leadId) {
    const latest = await db.collection(CHECKPOINT_COLLECTION).findOne(
      { leadId },
      { sort: { seq: -1 } },
    );
    return (latest?.seq || 0) + 1;
  }

  async _refreshLeadState(db, leadId, patch = {}) {
    const lead = await this._getLeadById(db, leadId);
    if (!lead) return null;

    const openCheckpoint = await this._getOpenCheckpointForLead(db, leadId);
    const now = new Date();
    const update = {
      updatedAt: now,
      ...patch,
    };

    if (openCheckpoint) {
      update.currentCheckpointId = openCheckpoint._id.toString();
      update.nextDueAt = openCheckpoint.dueAt || null;
      update.dueReasons = Array.isArray(openCheckpoint.dueReasons)
        ? openCheckpoint.dueReasons
        : [];
      update.overdueSince =
        openCheckpoint.dueAt && new Date(openCheckpoint.dueAt) < now
          ? openCheckpoint.dueAt
          : null;
      const currentStatus = normalizeLeadStatus(lead.status);
      if (currentStatus !== "paused" && currentStatus !== "dnc" && currentStatus !== "archived") {
        update.status = "active";
      }
    } else {
      update.currentCheckpointId = null;
      update.nextDueAt = null;
      update.overdueSince = null;
      update.dueReasons = [];
    }

    await db.collection(LEAD_COLLECTION).updateOne(
      { _id: new ObjectId(leadId) },
      { $set: update },
    );
    return this._getLeadById(db, leadId);
  }

  async _createCheckpoint(db, lead, payload = {}) {
    const leadId = typeof lead === "string" ? lead : lead?._id?.toString?.();
    if (!leadId) {
      throw new Error("leadId จำเป็น");
    }
    const dueAt = normalizeDate(payload.dueAt);
    if (!dueAt) {
      throw new Error("dueAt ไม่ถูกต้อง");
    }

    const now = new Date();
    const seq = await this._getNextCheckpointSeq(db, leadId);
    const doc = {
      leadId,
      seq,
      type: normalizeCheckpointType(payload.type, "callback"),
      dueAt,
      status: "open",
      assignedToSalesUserId: normalizeIdString(payload.assignedToSalesUserId) || null,
      sourceOrderIds: Array.isArray(payload.sourceOrderIds)
        ? payload.sourceOrderIds.map((item) => normalizeIdString(item)).filter(Boolean)
        : [],
      dueReasons: Array.isArray(payload.dueReasons) ? payload.dueReasons : [],
      resolvedOutcome: null,
      resolvedAt: null,
      resolvedBySalesUserId: null,
      cancelReason: null,
      createdAt: now,
      createdBy: normalizeString(payload.createdBy, 80) || "system",
    };
    const result = await db.collection(CHECKPOINT_COLLECTION).insertOne(doc);
    doc._id = result.insertedId;
    return doc;
  }

  async _createCallLog(db, payload = {}) {
    const outcome = normalizeOutcome(payload.outcome);
    if (!outcome) {
      throw new Error("outcome ไม่ถูกต้อง");
    }
    const note = normalizeString(payload.note, 4000);
    if (!note) {
      throw new Error("กรุณากรอก note");
    }

    const doc = {
      leadId: normalizeIdString(payload.leadId),
      checkpointId: normalizeIdString(payload.checkpointId),
      salesUserId: normalizeIdString(payload.salesUserId) || null,
      outcome,
      note,
      nextCheckpointAt: normalizeDate(payload.nextCheckpointAt),
      createdOrderId: normalizeIdString(payload.createdOrderId) || null,
      loggedByType: normalizeString(payload.loggedByType, 40) || "sales_user",
      loggedAt: normalizeDate(payload.loggedAt) || new Date(),
      metadata: payload.metadata && typeof payload.metadata === "object"
        ? payload.metadata
        : null,
    };
    const result = await db.collection(CALL_LOG_COLLECTION).insertOne(doc);
    doc._id = result.insertedId;
    return doc;
  }

  async _resolveCheckpoint(db, checkpoint, payload = {}) {
    const update = {
      status: normalizeCheckpointStatus(payload.status, "done"),
      resolvedOutcome: payload.resolvedOutcome || null,
      resolvedAt: normalizeDate(payload.resolvedAt) || new Date(),
      resolvedBySalesUserId: normalizeIdString(payload.resolvedBySalesUserId) || null,
      cancelReason: payload.cancelReason || null,
    };

    await db.collection(CHECKPOINT_COLLECTION).updateOne(
      { _id: checkpoint._id },
      { $set: update },
    );
  }

  async syncOrderDocument(order, options = {}) {
    if (!order || !order.userId) return null;
    const db = await this._db();
    const orderId = normalizeIdString(order._id);
    if (!orderId) return null;

    const leadQuery = {
      userId: normalizeIdString(order.userId),
      platform: normalizePlatform(order.platform),
      botId: normalizeIdString(order.botId) || null,
    };
    const now = new Date();
    const orderSource = inferOrderSource(order);
    const displayName = buildDisplayName(order);
    const phone = buildPhone(order);
    const orderAt = normalizeDate(order.extractedAt || order.createdAt || order.updatedAt) || now;
    const cycleDays = parseCycleDays(order.teleSalesCycleDays);
    const teleSalesEnabled = order.teleSalesEnabled !== false;

    const lead = await db.collection(LEAD_COLLECTION).findOneAndUpdate(
      leadQuery,
      {
        $setOnInsert: {
          userId: leadQuery.userId,
          platform: leadQuery.platform,
          botId: leadQuery.botId,
          ownerSalesUserId: normalizeIdString(order.sourceSalesUserId) || null,
          status: "active",
          currentCheckpointId: null,
          nextDueAt: null,
          overdueSince: null,
          dueReasons: [],
          needsCycle: false,
          needsCycleOrderIds: [],
          createdAt: now,
        },
        $set: {
          displayName,
          phone,
          latestOrderId: orderId,
          lastOrderAt: orderAt,
          updatedAt: now,
          ...(orderSource === "ai_chat" ? { lastAiOrderAt: orderAt } : {}),
        },
        $addToSet: {
          sourceOrderIds: orderId,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );
    if (!lead) return null;

    const leadId = lead._id.toString();
    const existingOpenCheckpoint = await this._getOpenCheckpointForLead(db, leadId);
    const openCheckpointForOrder = existingOpenCheckpoint &&
      Array.isArray(existingOpenCheckpoint.sourceOrderIds) &&
      existingOpenCheckpoint.sourceOrderIds.includes(orderId)
      ? existingOpenCheckpoint
      : null;

    if (
      orderSource !== "telesales" &&
      existingOpenCheckpoint &&
      !openCheckpointForOrder &&
      options.skipExistingOpenResolution !== true
    ) {
      const attributedSalesUserId =
        normalizeIdString(lead.ownerSalesUserId) ||
        normalizeIdString(existingOpenCheckpoint.assignedToSalesUserId) ||
        null;
      await this._createCallLog(db, {
        leadId,
        checkpointId: existingOpenCheckpoint._id.toString(),
        salesUserId: attributedSalesUserId,
        outcome: "purchased_via_ai",
        note: "ระบบปิดงานเดิมอัตโนมัติ เพราะลูกค้ากลับมาซื้อออเดอร์ใหม่ผ่านระบบ",
        createdOrderId: orderId,
        loggedByType: "system",
        loggedAt: orderAt,
        metadata: {
          orderId,
          orderSource,
        },
      });
      await this._resolveCheckpoint(db, existingOpenCheckpoint, {
        status: "done",
        resolvedOutcome: "purchased_via_ai",
        resolvedAt: orderAt,
        resolvedBySalesUserId: attributedSalesUserId,
      });
    }

    let nextCheckpoint = openCheckpointForOrder;
    if (teleSalesEnabled && cycleDays) {
      const dueAt = addDays(orderAt, cycleDays, this.timezone);
      const dueReasons = buildDueReasonFromOrder(order, dueAt);
      if (nextCheckpoint) {
        await db.collection(CHECKPOINT_COLLECTION).updateOne(
          { _id: nextCheckpoint._id },
          {
            $set: {
              dueAt,
              assignedToSalesUserId:
                normalizeIdString(lead.ownerSalesUserId) ||
                normalizeIdString(nextCheckpoint.assignedToSalesUserId) ||
                null,
              dueReasons,
              updatedAt: now,
            },
          },
        );
      } else {
        nextCheckpoint = await this._createCheckpoint(db, lead, {
          type: orderSource === "ai_chat" ? "system_reorder" : "reorder",
          dueAt,
          assignedToSalesUserId: normalizeIdString(lead.ownerSalesUserId) || null,
          sourceOrderIds: [orderId],
          dueReasons,
          createdBy: "order_sync",
        });
      }
      await db.collection(LEAD_COLLECTION).updateOne(
        { _id: lead._id },
        {
          $set: {
            needsCycle: false,
            updatedAt: now,
          },
          $pull: {
            needsCycleOrderIds: orderId,
          },
        },
      );
    } else if (teleSalesEnabled && !cycleDays) {
      await db.collection(LEAD_COLLECTION).updateOne(
        { _id: lead._id },
        {
          $set: {
            needsCycle: true,
            updatedAt: now,
          },
          $addToSet: {
            needsCycleOrderIds: orderId,
          },
        },
      );
    }

    const leadPatch = {};
    if (orderSource === "telesales") {
      leadPatch.lastTeleSalesWonAt = orderAt;
      if (normalizeIdString(order.sourceSalesUserId)) {
        leadPatch.ownerSalesUserId = normalizeIdString(order.sourceSalesUserId);
      }
    }
    if (Object.keys(leadPatch).length > 0) {
      await db.collection(LEAD_COLLECTION).updateOne(
        { _id: lead._id },
        { $set: { ...leadPatch, updatedAt: now } },
      );
    }

    const refreshed = await this._refreshLeadState(db, leadId);
    return {
      lead: mapLeadDoc(refreshed),
      checkpoint: nextCheckpoint ? mapCheckpointDoc(nextCheckpoint) : null,
    };
  }

  async finalizeClosedWon({ checkpointId, salesUserId, note, order }) {
    const db = await this._db();
    const checkpoint = await this._getCheckpointById(db, checkpointId);
    if (!checkpoint) {
      throw new Error("ไม่พบ checkpoint");
    }
    if (checkpoint.status !== "open") {
      throw new Error("checkpoint นี้ไม่ได้อยู่ในสถานะ open");
    }
    const lead = await this._getLeadById(db, checkpoint.leadId);
    if (!lead) {
      throw new Error("ไม่พบ lead");
    }

    const resolvedAt =
      normalizeDate(order?.extractedAt || order?.createdAt || order?.updatedAt) ||
      new Date();
    const orderId = normalizeIdString(order?._id);
    const cycleDays = parseCycleDays(order?.teleSalesCycleDays);

    await this._createCallLog(db, {
      leadId: checkpoint.leadId,
      checkpointId: checkpoint._id.toString(),
      salesUserId,
      outcome: "closed_won",
      note,
      createdOrderId: orderId,
      loggedByType: "sales_user",
      loggedAt: resolvedAt,
      metadata: {
        orderId,
      },
    });

    await this._resolveCheckpoint(db, checkpoint, {
      status: "done",
      resolvedOutcome: "closed_won",
      resolvedAt,
      resolvedBySalesUserId: salesUserId,
    });

    await db.collection(LEAD_COLLECTION).updateOne(
      { _id: lead._id },
      {
        $set: {
          ownerSalesUserId: salesUserId,
          displayName: buildDisplayName(order) || lead.displayName || "",
          phone: buildPhone(order) || lead.phone || "",
          latestOrderId: orderId,
          lastOrderAt: resolvedAt,
          lastTeleSalesWonAt: resolvedAt,
          lastContactAt: resolvedAt,
          status: "active",
          pauseReason: null,
          dncReason: null,
          updatedAt: new Date(),
        },
        $addToSet: {
          sourceOrderIds: orderId,
        },
      },
    );

    if (cycleDays) {
      const dueAt = addDays(resolvedAt, cycleDays, this.timezone);
      await this._createCheckpoint(db, lead, {
        type: "reorder",
        dueAt,
        assignedToSalesUserId: salesUserId,
        sourceOrderIds: orderId ? [orderId] : [],
        dueReasons: buildDueReasonFromOrder(order, dueAt),
        createdBy: "closed_won",
      });
    }

    const refreshedLead = await this._refreshLeadState(db, checkpoint.leadId, {
      ownerSalesUserId: salesUserId,
      lastContactAt: resolvedAt,
    });
    return mapLeadDoc(refreshedLead);
  }

  async assignLead({ leadId, salesUserId }) {
    const db = await this._db();
    const lead = await this._getLeadById(db, leadId);
    if (!lead) {
      throw new Error("ไม่พบ lead");
    }
    const now = new Date();
    await db.collection(LEAD_COLLECTION).updateOne(
      { _id: lead._id },
      {
        $set: {
          ownerSalesUserId: normalizeIdString(salesUserId) || null,
          updatedAt: now,
        },
      },
    );
    if (lead.currentCheckpointId && ObjectId.isValid(lead.currentCheckpointId)) {
      await db.collection(CHECKPOINT_COLLECTION).updateOne(
        { _id: new ObjectId(lead.currentCheckpointId), status: "open" },
        {
          $set: {
            assignedToSalesUserId: normalizeIdString(salesUserId) || null,
          },
        },
      );
    }
    const refreshed = await this._refreshLeadState(db, leadId, {
      ownerSalesUserId: normalizeIdString(salesUserId) || null,
    });
    return mapLeadDoc(refreshed);
  }

  async pauseLead({ leadId, reason, status = "paused" }) {
    const db = await this._db();
    const lead = await this._getLeadById(db, leadId);
    if (!lead) {
      throw new Error("ไม่พบ lead");
    }
    const normalizedStatus = normalizeLeadStatus(status, "paused");
    const openCheckpoint = await this._getOpenCheckpointForLead(db, leadId);
    if (openCheckpoint) {
      await this._resolveCheckpoint(db, openCheckpoint, {
        status: "canceled",
        cancelReason: normalizedStatus === "dnc" ? "do_not_call" : "lead_paused",
      });
    }
    const update = {
      status: normalizedStatus,
      pauseReason: normalizedStatus === "paused" ? normalizeString(reason, 255) || null : null,
      dncReason: normalizedStatus === "dnc" ? normalizeString(reason, 255) || null : null,
      updatedAt: new Date(),
    };
    await db.collection(LEAD_COLLECTION).updateOne(
      { _id: lead._id },
      { $set: update },
    );
    const refreshed = await this._refreshLeadState(db, leadId, update);
    return mapLeadDoc(refreshed);
  }

  async reopenLead({ leadId, dueAt, assignedToSalesUserId }) {
    const db = await this._db();
    const lead = await this._getLeadById(db, leadId);
    if (!lead) {
      throw new Error("ไม่พบ lead");
    }
    const openCheckpoint = await this._getOpenCheckpointForLead(db, leadId);
    if (!openCheckpoint) {
      await this._createCheckpoint(db, lead, {
        type: "manual_reopen",
        dueAt: normalizeDate(dueAt) || new Date(),
        assignedToSalesUserId:
          normalizeIdString(assignedToSalesUserId) ||
          normalizeIdString(lead.ownerSalesUserId) ||
          null,
        sourceOrderIds: lead.latestOrderId ? [lead.latestOrderId] : [],
        dueReasons: [
          {
            type: "manual_reopen",
            note: "เปิด lead กลับเข้าคิวใหม่",
          },
        ],
        createdBy: "manager",
      });
    }

    const refreshed = await this._refreshLeadState(db, leadId, {
      status: "active",
      pauseReason: null,
      dncReason: null,
    });
    return mapLeadDoc(refreshed);
  }

  async logCallOutcome({ checkpointId, salesUserId, outcome, note, nextCheckpointAt }) {
    const db = await this._db();
    const checkpoint = await this._getCheckpointById(db, checkpointId);
    if (!checkpoint) {
      throw new Error("ไม่พบ checkpoint");
    }
    if (checkpoint.status !== "open") {
      throw new Error("checkpoint นี้ไม่ได้อยู่ในสถานะ open");
    }
    const normalizedOutcome = normalizeOutcome(outcome);
    if (!normalizedOutcome || normalizedOutcome === "closed_won" || normalizedOutcome === "purchased_via_ai") {
      throw new Error("outcome นี้ต้องใช้ endpoint อื่นหรือไม่รองรับ");
    }
    if (
      checkpoint.assignedToSalesUserId &&
      normalizeIdString(checkpoint.assignedToSalesUserId) !== normalizeIdString(salesUserId)
    ) {
      throw new Error("checkpoint นี้ถูก assign ให้เซลล์คนอื่น");
    }
    if (NEXT_CHECKPOINT_REQUIRED_OUTCOMES.has(normalizedOutcome) && !normalizeDate(nextCheckpointAt)) {
      throw new Error("กรุณาระบุ nextCheckpointAt");
    }

    const lead = await this._getLeadById(db, checkpoint.leadId);
    if (!lead) {
      throw new Error("ไม่พบ lead");
    }

    const loggedAt = new Date();
    await this._createCallLog(db, {
      leadId: checkpoint.leadId,
      checkpointId: checkpoint._id.toString(),
      salesUserId,
      outcome: normalizedOutcome,
      note,
      nextCheckpointAt,
      loggedAt,
    });

    await this._resolveCheckpoint(db, checkpoint, {
      status: "done",
      resolvedOutcome: normalizedOutcome,
      resolvedAt: loggedAt,
      resolvedBySalesUserId: salesUserId,
    });

    const leadPatch = {
      lastContactAt: loggedAt,
      updatedAt: loggedAt,
    };

    if (normalizedOutcome === "wrong_number") {
      leadPatch.status = "paused";
      leadPatch.pauseReason = "wrong_number";
    } else if (normalizedOutcome === "do_not_call") {
      leadPatch.status = "dnc";
      leadPatch.dncReason = "do_not_call";
    }

    if (Object.keys(leadPatch).length > 0) {
      await db.collection(LEAD_COLLECTION).updateOne(
        { _id: lead._id },
        { $set: leadPatch },
      );
    }

    if (NEXT_CHECKPOINT_REQUIRED_OUTCOMES.has(normalizedOutcome)) {
      await this._createCheckpoint(db, lead, {
        type: "callback",
        dueAt: normalizeDate(nextCheckpointAt),
        assignedToSalesUserId: normalizeIdString(salesUserId),
        sourceOrderIds: Array.isArray(checkpoint.sourceOrderIds)
          ? checkpoint.sourceOrderIds
          : [],
        dueReasons: [
          {
            type: "callback",
            fromOutcome: normalizedOutcome,
            nextCheckpointAt: normalizeDate(nextCheckpointAt),
          },
        ],
        createdBy: "sales_call",
      });
    }

    const refreshed = await this._refreshLeadState(db, checkpoint.leadId, leadPatch);
    return mapLeadDoc(refreshed);
  }

  async getLeadDetails(leadId) {
    const db = await this._db();
    const lead = await this._getLeadById(db, leadId);
    if (!lead) {
      throw new Error("ไม่พบ lead");
    }

    const [checkpoints, callLogs, orders, salesUsers] = await Promise.all([
      db.collection(CHECKPOINT_COLLECTION)
        .find({ leadId })
        .sort({ seq: -1, createdAt: -1 })
        .limit(100)
        .toArray(),
      db.collection(CALL_LOG_COLLECTION)
        .find({ leadId })
        .sort({ loggedAt: -1 })
        .limit(100)
        .toArray(),
      db.collection("orders")
        .find({
          userId: lead.userId,
          platform: lead.platform,
          botId: lead.botId || null,
        })
        .sort({ extractedAt: -1 })
        .limit(50)
        .toArray(),
      db.collection("sales_users")
        .find({})
        .project({ name: 1, code: 1, role: 1 })
        .toArray(),
    ]);

    const salesMap = new Map(
      salesUsers.map((user) => [user._id.toString(), user]),
    );

    return {
      lead: mapLeadDoc(lead),
      checkpoints: checkpoints.map((item) => ({
        ...mapCheckpointDoc(item),
        assignedToSalesUser:
          salesMap.get(item.assignedToSalesUserId || "") || null,
      })),
      callLogs: callLogs.map((item) => ({
        ...mapCallLogDoc(item),
        salesUser: salesMap.get(item.salesUserId || "") || null,
      })),
      orders,
    };
  }

  async listQueue({ salesUserId = null, scope = "my", status = "open", limit = 100 } = {}) {
    const db = await this._db();
    const checkpointQuery = {};
    const normalizedSalesUserId = normalizeIdString(salesUserId);
    if (scope === "my" && salesUserId) {
      checkpointQuery.assignedToSalesUserId = normalizedSalesUserId;
    }
    checkpointQuery.status = status === "all" ? { $in: ["open", "overdue", "done", "canceled"] } : "open";

    const checkpoints = await db.collection(CHECKPOINT_COLLECTION)
      .find(checkpointQuery)
      .sort({ dueAt: 1, createdAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 5000))
      .toArray();

    const leadIds = [...new Set(checkpoints.map((item) => item.leadId).filter(Boolean))];
    const leadObjectIds = leadIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    const leads = leadObjectIds.length
      ? await db.collection(LEAD_COLLECTION)
        .find({ _id: { $in: leadObjectIds } })
        .toArray()
      : [];
    const leadMap = new Map(leads.map((item) => [item._id.toString(), item]));

    const todayStart = moment.tz(this.timezone).startOf("day");
    const todayEnd = todayStart.clone().endOf("day");

    let dueToday = 0;
    let overdue = 0;
    let callbackPending = 0;

    const items = checkpoints.map((checkpoint) => {
      const dueMoment = checkpoint.dueAt ? moment.tz(checkpoint.dueAt, this.timezone) : null;
      if (dueMoment && dueMoment.isBetween(todayStart, todayEnd, null, "[]")) {
        dueToday += 1;
      }
      if (dueMoment && dueMoment.isBefore(todayStart)) {
        overdue += 1;
      }
      if (checkpoint.type === "callback") {
        callbackPending += 1;
      }
      return {
        checkpoint: mapCheckpointDoc(checkpoint),
        lead: mapLeadDoc(leadMap.get(checkpoint.leadId)),
      };
    });

    let pendingSetupLeads = [];
    if (scope === "my" && normalizedSalesUserId) {
      const queuedLeadIdSet = new Set(items.map((item) => item.lead?.id).filter(Boolean));
      const pendingQuery = {
        ownerSalesUserId: normalizedSalesUserId,
        status: "active",
        _id: {
          $nin: Array.from(queuedLeadIdSet)
            .filter((id) => ObjectId.isValid(id))
            .map((id) => new ObjectId(id)),
        },
        $or: [
          { needsCycle: true },
          { currentCheckpointId: { $exists: false } },
          { currentCheckpointId: null },
          { currentCheckpointId: "" },
        ],
      };

      pendingSetupLeads = await db.collection(LEAD_COLLECTION)
        .find(pendingQuery)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(200)
        .toArray();
    }

    return {
      items,
      pendingSetupLeads: pendingSetupLeads.map(mapLeadDoc),
      summary: {
        due_today: dueToday,
        overdue,
        callback_pending: callbackPending,
        pending_setup: pendingSetupLeads.length,
      },
    };
  }

  async listLeads({
    status,
    ownerSalesUserId,
    needsCycle,
    assignmentState,
    limit = 100,
  } = {}) {
    const db = await this._db();
    const query = {};
    if (status) {
      query.status = normalizeLeadStatus(status);
    }
    if (ownerSalesUserId) {
      query.ownerSalesUserId = normalizeIdString(ownerSalesUserId);
    }
    if (assignmentState === "unassigned") {
      query.$or = [
        { ownerSalesUserId: { $exists: false } },
        { ownerSalesUserId: null },
        { ownerSalesUserId: "" },
      ];
    } else if (assignmentState === "assigned") {
      query.ownerSalesUserId = { $nin: [null, ""] };
    }
    if (typeof needsCycle === "boolean") {
      query.needsCycle = needsCycle;
    }

    const leads = await db.collection(LEAD_COLLECTION)
      .find(query)
      .sort({ nextDueAt: 1, updatedAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 5000))
      .toArray();

    return leads.map(mapLeadDoc);
  }

  async bulkAssignLeads({ leadIds, salesUserId } = {}) {
    const normalizedSalesUserId = normalizeIdString(salesUserId);
    if (!normalizedSalesUserId) {
      throw new Error("กรุณาระบุ salesUserId");
    }

    const uniqueLeadIds = Array.from(
      new Set(
        Array.isArray(leadIds)
          ? leadIds.map((value) => normalizeIdString(value)).filter(Boolean)
          : [],
      ),
    );

    if (!uniqueLeadIds.length) {
      throw new Error("กรุณาระบุ leadIds");
    }

    const results = [];
    for (const leadId of uniqueLeadIds) {
      try {
        const lead = await this.assignLead({
          leadId,
          salesUserId: normalizedSalesUserId,
        });
        results.push({
          leadId,
          ok: true,
          lead,
        });
      } catch (err) {
        results.push({
          leadId,
          ok: false,
          error: err?.message || "assign lead ไม่สำเร็จ",
        });
      }
    }

    return {
      total: uniqueLeadIds.length,
      assignedCount: results.filter((item) => item.ok).length,
      failedCount: results.filter((item) => !item.ok).length,
      results,
    };
  }

  async handleOrderDeleted(order) {
    if (!order || !order.userId || !order._id) return;
    const db = await this._db();
    const orderId = normalizeIdString(order._id);
    const lead = await db.collection(LEAD_COLLECTION).findOne({
      userId: normalizeIdString(order.userId),
      platform: normalizePlatform(order.platform),
      botId: normalizeIdString(order.botId) || null,
    });
    if (!lead) return;

    await db.collection(LEAD_COLLECTION).updateOne(
      { _id: lead._id },
      {
        $pull: { sourceOrderIds: orderId },
        $set: { updatedAt: new Date() },
      },
    );

    const openCheckpoint = await this._getOpenCheckpointForLead(db, lead._id.toString());
    if (
      openCheckpoint &&
      Array.isArray(openCheckpoint.sourceOrderIds) &&
      openCheckpoint.sourceOrderIds.length === 1 &&
      openCheckpoint.sourceOrderIds[0] === orderId
    ) {
      await this._resolveCheckpoint(db, openCheckpoint, {
        status: "canceled",
        cancelReason: "order_deleted",
      });
    }

    await this._refreshLeadState(db, lead._id.toString());
  }

  async _buildStatsForScope(db, { dateKey, scopeType, scopeId }) {
    const start = moment.tz(dateKey, "YYYY-MM-DD", this.timezone).startOf("day");
    const end = start.clone().endOf("day");
    const callQuery = {
      loggedAt: { $gte: start.toDate(), $lte: end.toDate() },
    };
    const checkpointQuery = {
      status: "open",
    };

    if (scopeType === "sales_user" && scopeId) {
      callQuery.salesUserId = scopeId;
      checkpointQuery.assignedToSalesUserId = scopeId;
    }

    const [callLogs, openCheckpoints] = await Promise.all([
      db.collection(CALL_LOG_COLLECTION).find(callQuery).toArray(),
      db.collection(CHECKPOINT_COLLECTION).find(checkpointQuery).toArray(),
    ]);

    const todayStart = start.clone();
    const todayEnd = end.clone();

    let dueToday = 0;
    let overdue = 0;
    let callbackPending = 0;

    openCheckpoints.forEach((checkpoint) => {
      const dueMoment = checkpoint.dueAt ? moment.tz(checkpoint.dueAt, this.timezone) : null;
      if (!dueMoment) return;
      if (dueMoment.isBetween(todayStart, todayEnd, null, "[]")) dueToday += 1;
      if (dueMoment.isBefore(todayStart)) overdue += 1;
      if (checkpoint.type === "callback") callbackPending += 1;
    });

    const manualLogs = callLogs.filter((item) => item.loggedByType !== "system");
    const attempted = manualLogs.length;
    const contacted = manualLogs.filter((item) => CONTACTED_OUTCOMES.has(item.outcome)).length;
    const directClosedWon = manualLogs.filter((item) => item.outcome === "closed_won").length;
    const assistedReorder = callLogs.filter((item) => item.outcome === "purchased_via_ai").length;
    const noAnswerCount = manualLogs.filter((item) => item.outcome === "no_answer").length;
    const noteCoverage = attempted > 0
      ? Number((manualLogs.filter((item) => normalizeString(item.note, 4000).length > 0).length / attempted).toFixed(4))
      : 0;

    const attemptedOrContacted = Math.max(contacted, attempted);
    const closeRate = attemptedOrContacted > 0
      ? Number((directClosedWon / attemptedOrContacted).toFixed(4))
      : 0;
    const noAnswerRate = attempted > 0
      ? Number((noAnswerCount / attempted).toFixed(4))
      : 0;

    return {
      due_today: dueToday,
      overdue,
      attempted,
      contacted,
      direct_closed_won: directClosedWon,
      assisted_reorder: assistedReorder,
      no_answer_rate: noAnswerRate,
      callback_pending: callbackPending,
      note_coverage: noteCoverage,
      close_rate: closeRate,
    };
  }

  _buildFallbackSummary(scopeLabel, stats = {}) {
    const insights = [];
    if ((stats.overdue || 0) > 0) {
      insights.push(`มีงานค้าง ${stats.overdue} ราย`);
    }
    if ((stats.direct_closed_won || 0) > 0) {
      insights.push(`ปิดการขายได้ ${stats.direct_closed_won} ราย`);
    }
    if ((stats.assisted_reorder || 0) > 0) {
      insights.push(`มี assisted reorder ${stats.assisted_reorder} ราย`);
    }
    if ((stats.no_answer_rate || 0) >= 0.5 && (stats.attempted || 0) >= 3) {
      insights.push("อัตราไม่รับสายค่อนข้างสูง");
    }
    if ((stats.note_coverage || 0) < 0.8 && (stats.attempted || 0) > 0) {
      insights.push("การบันทึกโน้ตยังไม่ครบ");
    }
    if (!insights.length) {
      insights.push("ภาพรวมค่อนข้างปกติ");
    }

    return `${scopeLabel}: วันนี้โทร ${stats.attempted || 0} ครั้ง ติดต่อได้ ${stats.contacted || 0} ครั้ง ปิดขายตรง ${stats.direct_closed_won || 0} ครั้ง ${insights.join(" / ")}`;
  }

  async _generateAiSummary(scopeLabel, stats = {}) {
    if (!this.openaiClient) {
      return this._buildFallbackSummary(scopeLabel, stats);
    }

    const systemPrompt =
      "คุณเป็นผู้ช่วยสรุปรายงานเทเลเซลล์ภาษาไทย เขียนสรุปสั้น 3-5 ประโยค เน้น KPI, anomaly, coaching tip ห้ามใช้ markdown";
    const userPrompt = JSON.stringify(
      {
        scopeLabel,
        stats,
      },
      null,
      2,
    );

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: this.reportModel,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const text = normalizeString(
        response?.choices?.[0]?.message?.content,
        4000,
      );
      return text || this._buildFallbackSummary(scopeLabel, stats);
    } catch (error) {
      console.warn("[TeleSales] AI summary fallback:", error?.message || error);
      return this._buildFallbackSummary(scopeLabel, stats);
    }
  }

  async runDailyReports({ dateKey = getDateKey(new Date(), this.timezone), send = true } = {}) {
    const db = await this._db();
    const salesUsers = await db.collection("sales_users")
      .find({ isActive: { $ne: false } })
      .project({ name: 1, code: 1, role: 1 })
      .toArray();

    const scopes = [
      { scopeType: "system", scopeId: "system", label: "ภาพรวมระบบ" },
      ...salesUsers.map((user) => ({
        scopeType: "sales_user",
        scopeId: user._id.toString(),
        label: user.name || user.code || user._id.toString(),
      })),
    ];

    const generated = [];
    for (const scope of scopes) {
      const stats = await this._buildStatsForScope(db, {
        dateKey,
        scopeType: scope.scopeType,
        scopeId: scope.scopeType === "system" ? null : scope.scopeId,
      });
      const aiSummary = await this._generateAiSummary(scope.label, stats);
      const doc = {
        dateKey,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        stats,
        aiSummary,
        insights: [],
        anomalies: [],
        deliveryChannels: [],
        generatedAt: new Date(),
        sentAt: null,
      };

      await db.collection(REPORT_COLLECTION).updateOne(
        {
          dateKey,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
        },
        {
          $set: doc,
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
      generated.push(doc);
    }

    if (send && this.notificationService && typeof this.notificationService.sendEventMessage === "function") {
      const systemReport = generated.find((item) => item.scopeType === "system");
      if (systemReport) {
        const text = [
          `สรุป Tele-sales ประจำวันที่ ${dateKey}`,
          systemReport.aiSummary,
        ].join("\n");
        const delivery = await this.notificationService.sendEventMessage(
          "telesales_daily_summary",
          text,
        );
        if (delivery?.success) {
          await db.collection(REPORT_COLLECTION).updateOne(
            {
              dateKey,
              scopeType: "system",
              scopeId: "system",
            },
            {
              $set: {
                sentAt: new Date(),
                deliveryChannels: Array.isArray(delivery?.channelIds)
                  ? delivery.channelIds
                  : [],
              },
            },
          );
        }
      }
    }

    return generated;
  }

  async listDailyReports({ dateKey, scopeType } = {}) {
    const db = await this._db();
    const query = {};
    if (dateKey) query.dateKey = dateKey;
    if (scopeType) query.scopeType = scopeType;
    const docs = await db.collection(REPORT_COLLECTION)
      .find(query)
      .sort({ dateKey: -1, scopeType: 1, scopeId: 1 })
      .limit(100)
      .toArray();
    return docs;
  }

  async evaluateDailyReportSchedule() {
    if (this.reportProcessing) return;
    this.reportProcessing = true;
    try {
      const [hourStr, minuteStr] = this.reportTime.split(":");
      const hour = Number.parseInt(hourStr, 10);
      const minute = Number.parseInt(minuteStr, 10);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;

      const now = moment.tz(this.timezone);
      if (now.hour() !== hour || now.minute() !== minute) return;

      const dateKey = now.format("YYYY-MM-DD");
      const db = await this._db();
      const existing = await db.collection(REPORT_COLLECTION).findOne({
        dateKey,
        scopeType: "system",
        scopeId: "system",
        sentAt: { $ne: null },
      });
      if (existing) return;

      await this.runDailyReports({ dateKey, send: true });
    } catch (error) {
      console.error("[TeleSales] evaluateDailyReportSchedule error:", error?.message || error);
    } finally {
      this.reportProcessing = false;
    }
  }

  startDailyReportScheduler() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }
    this.reportTimer = setInterval(() => {
      this.evaluateDailyReportSchedule().catch((error) => {
        console.error("[TeleSales] Daily report scheduler error:", error?.message || error);
      });
    }, REPORT_INTERVAL_MS);

    setTimeout(() => {
      this.evaluateDailyReportSchedule().catch((error) => {
        console.error("[TeleSales] Daily report scheduler initial error:", error?.message || error);
      });
    }, 5000);
  }
}

module.exports = {
  TeleSalesService,
  LEAD_COLLECTION,
  CHECKPOINT_COLLECTION,
  CALL_LOG_COLLECTION,
  REPORT_COLLECTION,
  CALL_OUTCOMES,
  NEXT_CHECKPOINT_REQUIRED_OUTCOMES,
  normalizeOutcome,
  parseCycleDays,
  inferOrderSource,
};
