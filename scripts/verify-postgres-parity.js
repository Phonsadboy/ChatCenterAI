#!/usr/bin/env node
require("dotenv").config();

const { MongoClient } = require("mongodb");
const { closePgPool, query } = require("../infra/postgres");

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "chatbot";
const SAMPLE_LIMIT = Math.max(
  10,
  Math.min(parseInt(process.env.PARITY_SAMPLE_LIMIT || "200", 10) || 200, 1000),
);

function safeStringify(value) {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch (_) {
    return JSON.stringify(String(value));
  }
}

function toLegacyId(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value.trim();
  if (value && typeof value.toString === "function") {
    return value.toString().trim();
  }
  return String(value).trim();
}

function normalizePlatform(platform, fallback = "line") {
  if (typeof platform !== "string") return fallback;
  const normalized = platform.trim().toLowerCase();
  return ["line", "facebook", "instagram", "whatsapp"].includes(normalized)
    ? normalized
    : fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function summarizeMapDiff(mongoMap, pgMap, limit = 20) {
  const missingInPg = [];
  const missingInMongo = [];
  const mismatches = [];

  for (const [key, mongoValue] of mongoMap.entries()) {
    if (!pgMap.has(key)) {
      missingInPg.push(key);
      continue;
    }
    const pgValue = pgMap.get(key);
    if (safeStringify(mongoValue) !== safeStringify(pgValue)) {
      mismatches.push({
        key,
        mongo: mongoValue,
        postgres: pgValue,
      });
    }
  }

  for (const key of pgMap.keys()) {
    if (!mongoMap.has(key)) {
      missingInMongo.push(key);
    }
  }

  return {
    ok:
      missingInPg.length === 0 &&
      missingInMongo.length === 0 &&
      mismatches.length === 0,
    missingInPg: missingInPg.slice(0, limit),
    missingInMongo: missingInMongo.slice(0, limit),
    mismatches: mismatches.slice(0, limit),
    counts: {
      mongo: mongoMap.size,
      postgres: pgMap.size,
      missingInPg: missingInPg.length,
      missingInMongo: missingInMongo.length,
      mismatches: mismatches.length,
    },
  };
}

function buildChatSenderKeyAddFields() {
  return {
    senderKey: {
      $let: {
        vars: {
          raw: {
            $cond: [
              {
                $or: [
                  { $eq: ["$senderId", null] },
                  { $eq: ["$senderId", ""] },
                ],
              },
              "$userId",
              "$senderId",
            ],
          },
        },
        in: {
          $cond: [
            {
              $or: [
                { $eq: ["$$raw", null] },
                { $eq: ["$$raw", ""] },
              ],
            },
            null,
            { $toString: "$$raw" },
          ],
        },
      },
    },
  };
}

function normalizeChatUserSummary(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    _id: toLegacyId(doc._id),
    lastMessage:
      Object.prototype.hasOwnProperty.call(doc, "lastMessage")
        ? doc.lastMessage
        : doc.last_message,
    lastTimestamp: normalizeDate(doc.lastTimestamp || doc.last_timestamp),
    messageCount: Number(doc.messageCount || doc.message_count || 0),
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
  };
}

function normalizeChatHistoryDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const metadata =
    doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
  return {
    _id: toLegacyId(doc._id || doc.legacy_message_id || doc.message_row_id),
    senderId: toLegacyId(doc.senderId || doc.userId || doc.legacy_contact_id),
    role: doc.role || "user",
    source: doc.source || null,
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    timestamp: normalizeDate(doc.timestamp || doc.created_at),
    content:
      Object.prototype.hasOwnProperty.call(doc, "content")
        ? doc.content
        : null,
    orderExtractionRoundId:
      doc.orderExtractionRoundId || metadata.orderExtractionRoundId || null,
    orderId: toLegacyId(doc.orderId || metadata.orderId),
  };
}

function normalizeFollowUpStatusDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    senderId: toLegacyId(doc.senderId || doc.legacy_contact_id),
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    hasFollowUp: Boolean(doc.hasFollowUp),
    followUpReason:
      typeof doc.followUpReason === "string" ? doc.followUpReason : "",
    followUpUpdatedAt: normalizeDate(doc.followUpUpdatedAt || doc.updated_at),
    lastAnalyzedAt: normalizeDate(doc.lastAnalyzedAt),
  };
}

function normalizeFollowUpTaskDoc(doc) {
  const payload =
    doc?.payload && typeof doc.payload === "object" ? doc.payload : {};
  return {
    _id: toLegacyId(doc._id || doc.legacy_task_id || doc.id),
    userId: toLegacyId(doc.userId || doc.legacy_contact_id),
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    dateKey: doc.dateKey || payload.dateKey || null,
    status: doc.status || payload.status || null,
    canceled:
      typeof doc.canceled === "boolean"
        ? doc.canceled
        : typeof payload.canceled === "boolean"
          ? payload.canceled
          : false,
    completed:
      typeof doc.completed === "boolean"
        ? doc.completed
        : typeof payload.completed === "boolean"
          ? payload.completed
          : false,
    cancelReason: doc.cancelReason || payload.cancelReason || null,
    nextScheduledAt: normalizeDate(doc.nextScheduledAt || doc.next_scheduled_at),
    nextRoundIndex:
      typeof doc.nextRoundIndex === "number"
        ? doc.nextRoundIndex
        : typeof payload.nextRoundIndex === "number"
          ? payload.nextRoundIndex
          : null,
    updatedAt: normalizeDate(doc.updatedAt || doc.updated_at),
  };
}

function normalizeFollowUpPageSettingsDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const settings =
    doc?.settings && typeof doc.settings === "object" ? { ...doc.settings } : {};
  if (
    typeof doc.orderExtractionEnabled === "boolean" &&
    typeof settings.orderExtractionEnabled !== "boolean"
  ) {
    settings.orderExtractionEnabled = doc.orderExtractionEnabled;
  }
  if (
    typeof doc.orderModel === "string" &&
    doc.orderModel.trim() &&
    typeof settings.orderModel !== "string"
  ) {
    settings.orderModel = doc.orderModel.trim();
  }
  if (
    typeof doc.model === "string" &&
    doc.model.trim() &&
    typeof settings.model !== "string"
  ) {
    settings.model = doc.model.trim();
  }
  return {
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    settings,
    createdAt: normalizeDate(doc.createdAt || doc.created_at),
    updatedAt: normalizeDate(doc.updatedAt || doc.updated_at),
  };
}

function normalizeAiStatusDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    senderId: toLegacyId(doc.senderId || doc.legacy_contact_id),
    aiEnabled:
      typeof doc.aiEnabled === "boolean"
        ? doc.aiEnabled
        : typeof doc.ai_enabled === "boolean"
          ? doc.ai_enabled
          : true,
    updatedAt: normalizeDate(doc.updatedAt || doc.updated_at),
  };
}

function normalizeUserTagsDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    userId: toLegacyId(doc.userId || doc.legacy_contact_id),
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    updatedAt: normalizeDate(doc.updatedAt || doc.updated_at),
  };
}

function normalizePurchaseStatusDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    userId: toLegacyId(doc.userId || doc.legacy_contact_id),
    hasPurchased:
      typeof doc.hasPurchased === "boolean"
        ? doc.hasPurchased
        : typeof doc.has_purchased === "boolean"
          ? doc.has_purchased
          : false,
    updatedBy: doc.updatedBy || doc.updated_by || null,
    updatedAt: normalizeDate(doc.updatedAt || doc.updated_at),
  };
}

function normalizeFeedbackDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    messageIdString: toLegacyId(doc.messageIdString || doc.message_legacy_id),
    userId: toLegacyId(doc.userId || doc.legacy_contact_id),
    senderId: toLegacyId(doc.senderId || doc.sender_id),
    senderRole: doc.senderRole || doc.sender_role || null,
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    feedback: doc.feedback || null,
    notes: typeof doc.notes === "string" ? doc.notes : "",
    updatedAt: normalizeDate(doc.updatedAt || doc.updated_at),
  };
}

function normalizeProfileDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const profileData =
    doc?.profileData && typeof doc.profileData === "object"
      ? doc.profileData
      : doc?.profile_data && typeof doc.profile_data === "object"
        ? doc.profile_data
        : {};
  return {
    userId: toLegacyId(doc.userId || doc.legacy_contact_id || profileData.userId),
    platform: normalizePlatform(doc.platform || profileData.platform),
    displayName:
      doc.displayName ||
      doc.display_name ||
      profileData.displayName ||
      null,
    pictureUrl: doc.pictureUrl || profileData.pictureUrl || null,
    statusMessage: doc.statusMessage || profileData.statusMessage || null,
    profileFetchDisabled:
      typeof doc.profileFetchDisabled === "boolean"
        ? doc.profileFetchDisabled
        : typeof profileData.profileFetchDisabled === "boolean"
          ? profileData.profileFetchDisabled
          : false,
    profileFetchDisabledReason:
      doc.profileFetchDisabledReason ||
      profileData.profileFetchDisabledReason ||
      null,
    profileFetchFailedAt: normalizeDate(
      doc.profileFetchFailedAt || profileData.profileFetchFailedAt,
    ),
    profileFetchLastError:
      doc.profileFetchLastError ||
      profileData.profileFetchLastError ||
      null,
    createdAt: normalizeDate(doc.createdAt || doc.created_at || profileData.createdAt),
    updatedAt: normalizeDate(doc.updatedAt || doc.updated_at || profileData.updatedAt),
  };
}

function normalizeNotificationChannelDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const config =
    doc?.config && typeof doc.config === "object" ? doc.config : {};
  return {
    _id: toLegacyId(doc._id || doc.legacy_channel_id),
    name: doc.name || "",
    type: doc.type || doc.channel_type || config.type || "line_group",
    isActive:
      typeof doc.isActive === "boolean"
        ? doc.isActive
        : typeof doc.is_active === "boolean"
          ? doc.is_active
          : true,
    senderBotId: toLegacyId(doc.senderBotId || config.senderBotId || config.botId),
    groupId: toLegacyId(doc.groupId || config.groupId || config.lineGroupId),
    receiveFromAllBots:
      typeof doc.receiveFromAllBots === "boolean"
        ? doc.receiveFromAllBots
        : config.receiveFromAllBots === true,
    eventTypes: Array.isArray(doc.eventTypes)
      ? doc.eventTypes
      : Array.isArray(config.eventTypes)
        ? config.eventTypes
        : [],
    deliveryMode:
      typeof doc.deliveryMode === "string"
        ? doc.deliveryMode
        : typeof config.deliveryMode === "string"
          ? config.deliveryMode
          : "instant",
    summaryTimes: Array.isArray(doc.summaryTimes)
      ? doc.summaryTimes
      : Array.isArray(config.summaryTimes)
        ? config.summaryTimes
        : [],
    summaryTimezone:
      typeof doc.summaryTimezone === "string"
        ? doc.summaryTimezone
        : typeof config.summaryTimezone === "string"
          ? config.summaryTimezone
          : "Asia/Bangkok",
    settings:
      doc?.settings && typeof doc.settings === "object"
        ? doc.settings
        : config?.settings && typeof config.settings === "object"
          ? config.settings
          : {},
    lastSummaryAt: normalizeDate(doc.lastSummaryAt || config.lastSummaryAt),
    lastSummarySlotKey:
      doc.lastSummarySlotKey || config.lastSummarySlotKey || null,
    createdAt: normalizeDate(doc.createdAt || doc.created_at || config.createdAt),
    updatedAt: normalizeDate(doc.updatedAt || doc.updated_at || config.updatedAt),
  };
}

function normalizeNotificationLogDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const payload =
    doc?.payload && typeof doc.payload === "object" ? doc.payload : {};
  return {
    _id: toLegacyId(doc._id || doc.legacy_log_id || doc.id),
    channelId: toLegacyId(
      doc.channelId || doc.legacy_channel_id || payload.channelId,
    ),
    orderId: toLegacyId(doc.orderId || payload.orderId),
    eventType: doc.eventType || payload.eventType || null,
    status: doc.status || payload.status || "failed",
    errorMessage: doc.errorMessage || payload.errorMessage || null,
    createdAt: normalizeDate(doc.createdAt || doc.created_at || payload.createdAt),
  };
}

async function countMongo(db, collectionName) {
  return db.collection(collectionName).countDocuments({});
}

async function buildSettingsParity(db) {
  const [mongoDocs, pgRows] = await Promise.all([
    db.collection("settings").find({}).toArray(),
    query("SELECT key, value FROM settings ORDER BY key ASC"),
  ]);

  const mongoMap = new Map(
    mongoDocs.map((doc) => [doc.key, doc.value]),
  );
  const pgMap = new Map(
    pgRows.rows.map((row) => [row.key, row.value]),
  );

  return summarizeMapDiff(mongoMap, pgMap);
}

async function buildBotsParity(db) {
  const mongoCollections = [
    { platform: "line", collection: "line_bots" },
    { platform: "facebook", collection: "facebook_bots" },
    { platform: "instagram", collection: "instagram_bots" },
    { platform: "whatsapp", collection: "whatsapp_bots" },
  ];

  const mongoDocs = [];
  for (const item of mongoCollections) {
    const docs = await db.collection(item.collection).find({}).toArray();
    docs.forEach((doc) => {
      mongoDocs.push({
        platform: item.platform,
        legacyBotId: toLegacyId(doc._id),
        comparable: {
          name: doc.name || doc.pageName || null,
          status: doc.status || "active",
          aiModel: doc.aiModel || null,
          webhookUrl: doc.webhookUrl || null,
          selectedInstructions: Array.isArray(doc.selectedInstructions)
            ? doc.selectedInstructions
            : [],
          selectedImageCollections: Array.isArray(doc.selectedImageCollections)
            ? doc.selectedImageCollections
            : [],
        },
      });
    });
  }

  const pgRows = await query(
    `
      SELECT
        b.platform,
        b.legacy_bot_id,
        b.name,
        b.status,
        b.ai_model,
        b.selected_instructions,
        b.selected_image_collections,
        b.config
      FROM bots b
      ORDER BY b.platform, b.legacy_bot_id
    `,
  );

  const mongoMap = new Map(
    mongoDocs.map((doc) => [
      `${doc.platform}:${doc.legacyBotId}`,
      doc.comparable,
    ]),
  );
  const pgMap = new Map(
    pgRows.rows.map((row) => [
      `${row.platform}:${row.legacy_bot_id}`,
      {
        name: row.name || row.config?.name || row.config?.pageName || null,
        status: row.status || "active",
        aiModel: row.ai_model || null,
        webhookUrl: row.config?.webhookUrl || null,
        selectedInstructions: Array.isArray(row.selected_instructions)
          ? row.selected_instructions
          : [],
        selectedImageCollections: Array.isArray(row.selected_image_collections)
          ? row.selected_image_collections
          : [],
      },
    ]),
  );

  return summarizeMapDiff(mongoMap, pgMap);
}

async function getMongoOrderSummary(db) {
  const coll = db.collection("orders");
  const [count, statusRows, totalsRows, latestDocs] = await Promise.all([
    coll.countDocuments({}),
    coll.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    coll.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: {
              $cond: [
                { $ne: ["$status", "cancelled"] },
                {
                  $convert: {
                    input: "$orderData.totalAmount",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
          },
          totalShipping: {
            $sum: {
              $cond: [
                { $ne: ["$status", "cancelled"] },
                {
                  $convert: {
                    input: "$orderData.shippingCost",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
          },
          confirmedOrders: {
            $sum: {
              $cond: [
                { $in: ["$status", ["confirmed", "shipped", "completed"]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).toArray(),
    coll.find({})
      .sort({ extractedAt: -1, updatedAt: -1 })
      .limit(SAMPLE_LIMIT)
      .toArray(),
  ]);

  return {
    count,
    statusRows,
    totals: totalsRows[0] || {
      totalAmount: 0,
      totalShipping: 0,
      confirmedOrders: 0,
    },
    latestDocs: latestDocs.map((doc) => ({
      _id: toLegacyId(doc._id),
      userId: toLegacyId(doc.userId),
      botId: toLegacyId(doc.botId),
      platform: normalizePlatform(doc.platform),
      status: doc.status || "pending",
      extractedAt: normalizeDate(doc.extractedAt),
      orderData: doc.orderData || {},
      notes: doc.notes || null,
    })),
  };
}

async function getPostgresOrderSummary() {
  const [countRows, statusRows, totalsRows, latestRows] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM orders"),
    query(
      "SELECT status AS _id, COUNT(*)::int AS count FROM orders GROUP BY status ORDER BY status ASC",
    ),
    query(
      `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN status <> 'cancelled'
                THEN COALESCE((order_data->>'totalAmount')::double precision, 0)
                ELSE 0
              END
            ),
            0
          ) AS "totalAmount",
          COALESCE(
            SUM(
              CASE
                WHEN status <> 'cancelled'
                THEN COALESCE((order_data->>'shippingCost')::double precision, 0)
                ELSE 0
              END
            ),
            0
          ) AS "totalShipping",
          COALESCE(
            SUM(
              CASE
                WHEN status IN ('confirmed', 'shipped', 'completed')
                THEN 1
                ELSE 0
              END
            ),
            0
          )::int AS "confirmedOrders"
        FROM orders
      `,
    ),
    query(
      `
        SELECT
          o.legacy_order_id,
          o.legacy_user_id,
          b.legacy_bot_id,
          o.platform,
          o.status,
          o.extracted_at,
          o.order_data
        FROM orders o
        LEFT JOIN bots b ON b.id = o.bot_id
        ORDER BY o.extracted_at DESC NULLS LAST, o.updated_at DESC NULLS LAST
        LIMIT $1
      `,
      [SAMPLE_LIMIT],
    ),
  ]);

  return {
    count: countRows.rows[0]?.count || 0,
    statusRows: statusRows.rows,
    totals: totalsRows.rows[0] || {
      totalAmount: 0,
      totalShipping: 0,
      confirmedOrders: 0,
    },
    latestDocs: latestRows.rows.map((row) => ({
      _id: row.legacy_order_id,
      userId: row.legacy_user_id || "",
      botId: row.legacy_bot_id || "",
      platform: normalizePlatform(row.platform),
      status: row.status || "pending",
      extractedAt: normalizeDate(row.extracted_at),
      orderData: row.order_data || {},
      notes: row.order_data?.notes || null,
    })),
  };
}

async function getMongoChatSummary(db) {
  const coll = db.collection("chat_history");
  const senderKey = buildChatSenderKeyAddFields();
  const [count, distinctRows, latestUsers] = await Promise.all([
    coll.countDocuments({}),
    coll.aggregate([
      { $addFields: senderKey },
      { $match: { senderKey: { $nin: [null, ""] } } },
      { $group: { _id: "$senderKey" } },
      { $count: "count" },
    ]).toArray(),
    coll.aggregate([
      { $addFields: senderKey },
      { $match: { senderKey: { $nin: [null, ""] } } },
      { $sort: { timestamp: -1, _id: -1 } },
      {
        $group: {
          _id: "$senderKey",
          lastMessage: { $first: "$content" },
          lastTimestamp: { $first: "$timestamp" },
          messageCount: { $sum: 1 },
          platform: { $first: "$platform" },
          botId: { $first: "$botId" },
        },
      },
      { $sort: { lastTimestamp: -1, _id: 1 } },
      { $limit: SAMPLE_LIMIT },
    ]).toArray(),
  ]);

  return {
    count,
    distinctUsers: distinctRows[0]?.count || 0,
    latestUsers: latestUsers.map((doc) => normalizeChatUserSummary(doc)),
  };
}

async function getPostgresChatSummary() {
  const [countRows, distinctRows, latestRows] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM messages"),
    query(
      `
        SELECT COUNT(DISTINCT c.legacy_contact_id)::int AS count
        FROM messages m
        INNER JOIN contacts c ON c.id = m.contact_id
      `,
    ),
    query(
      `
        WITH latest_per_contact AS (
          SELECT DISTINCT ON (c.legacy_contact_id)
            c.legacy_contact_id,
            t.platform,
            b.legacy_bot_id,
            m.content AS last_message,
            m.created_at AS last_timestamp
          FROM messages m
          INNER JOIN contacts c ON c.id = m.contact_id
          INNER JOIN threads t ON t.id = m.thread_id
          LEFT JOIN bots b ON b.id = m.bot_id
          ORDER BY c.legacy_contact_id, m.created_at DESC, m.id DESC
        ),
        message_counts AS (
          SELECT
            c.legacy_contact_id,
            COUNT(*)::int AS message_count
          FROM messages m
          INNER JOIN contacts c ON c.id = m.contact_id
          GROUP BY c.legacy_contact_id
        )
        SELECT
          l.legacy_contact_id,
          l.last_message,
          l.last_timestamp,
          mc.message_count,
          l.platform,
          l.legacy_bot_id
        FROM latest_per_contact l
        INNER JOIN message_counts mc
          ON mc.legacy_contact_id = l.legacy_contact_id
        ORDER BY l.last_timestamp DESC NULLS LAST, l.legacy_contact_id ASC
        LIMIT $1
      `,
      [SAMPLE_LIMIT],
    ),
  ]);

  return {
    count: countRows.rows[0]?.count || 0,
    distinctUsers: distinctRows.rows[0]?.count || 0,
    latestUsers: latestRows.rows.map((row) => normalizeChatUserSummary(row)),
  };
}

async function getMongoChatHistorySample(db, userId, limit = 25) {
  const coll = db.collection("chat_history");
  const docs = await coll.find({
    $or: [
      { senderId: userId },
      { userId },
    ],
  })
    .sort({ timestamp: -1, _id: -1 })
    .limit(limit)
    .toArray();

  return docs
    .reverse()
    .map((doc) => normalizeChatHistoryDoc(doc));
}

async function getPostgresChatHistorySample(userId, limit = 25) {
  const result = await query(
    `
      SELECT
        m.id::text AS message_row_id,
        m.legacy_message_id,
        m.role,
        m.source,
        m.content,
        m.metadata,
        m.created_at,
        c.legacy_contact_id,
        t.platform,
        b.legacy_bot_id
      FROM messages m
      INNER JOIN contacts c ON c.id = m.contact_id
      INNER JOIN threads t ON t.id = m.thread_id
      LEFT JOIN bots b ON b.id = m.bot_id
      WHERE c.legacy_contact_id = $1
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $2
    `,
    [userId, limit],
  );

  return result.rows
    .reverse()
    .map((row) => normalizeChatHistoryDoc(row));
}

async function buildFollowUpParity(db) {
  const [
    mongoStatuses,
    pgStatusesRows,
    mongoPageSettings,
    pgPageSettingsRows,
    mongoTasks,
    pgTasksRows,
  ] = await Promise.all([
    db.collection("follow_up_status").find({}).toArray().catch(() => []),
    query(
      `
        SELECT
          s.platform,
          s.legacy_contact_id,
          s.status,
          s.updated_at,
          b.legacy_bot_id
        FROM follow_up_status s
        LEFT JOIN bots b ON b.id = s.bot_id
      `,
    ),
    db.collection("follow_up_page_settings").find({}).toArray().catch(() => []),
    query(
      `
        SELECT
          platform,
          legacy_bot_id,
          settings,
          created_at,
          updated_at
        FROM follow_up_page_settings
      `,
    ),
    db.collection("follow_up_tasks").find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(SAMPLE_LIMIT)
      .toArray()
      .catch(() => []),
    query(
      `
        SELECT
          t.id::text,
          t.legacy_task_id,
          t.platform,
          t.legacy_contact_id,
          t.status,
          t.payload,
          t.next_scheduled_at,
          t.created_at,
          t.updated_at,
          b.legacy_bot_id
        FROM follow_up_tasks t
        LEFT JOIN bots b ON b.id = t.bot_id
        ORDER BY t.updated_at DESC, t.created_at DESC
        LIMIT $1
      `,
      [SAMPLE_LIMIT],
    ),
  ]);

  const statusMongoMap = new Map(
    mongoStatuses.map((doc) => {
      const normalized = normalizeFollowUpStatusDoc(doc);
      return [
        `${normalized.platform}:${normalized.botId}:${normalized.senderId}`,
        normalized,
      ];
    }),
  );
  const statusPgMap = new Map(
    pgStatusesRows.rows.map((row) => {
      const normalized = normalizeFollowUpStatusDoc({
        ...row.status,
        platform: row.platform,
        legacy_contact_id: row.legacy_contact_id,
        legacy_bot_id: row.legacy_bot_id,
        updated_at: row.updated_at,
      });
      return [
        `${normalized.platform}:${normalized.botId}:${normalized.senderId}`,
        normalized,
      ];
    }),
  );

  const pageSettingsMongoMap = new Map(
    mongoPageSettings.map((doc) => {
      const normalized = normalizeFollowUpPageSettingsDoc(doc);
      return [
        `${normalized.platform}:${normalized.botId || "default"}`,
        normalized,
      ];
    }),
  );
  const pageSettingsPgMap = new Map(
    pgPageSettingsRows.rows.map((row) => {
      const normalized = normalizeFollowUpPageSettingsDoc(row);
      return [
        `${normalized.platform}:${normalized.botId || "default"}`,
        normalized,
      ];
    }),
  );

  const taskMongoMap = new Map(
    mongoTasks.map((doc) => [toLegacyId(doc._id), normalizeFollowUpTaskDoc(doc)]),
  );
  const taskPgMap = new Map(
    pgTasksRows.rows.map((row) => [
      toLegacyId(row.legacy_task_id || row.id),
      normalizeFollowUpTaskDoc(row),
    ]),
  );

  return {
    statuses: summarizeMapDiff(statusMongoMap, statusPgMap, 20),
    pageSettings: summarizeMapDiff(pageSettingsMongoMap, pageSettingsPgMap, 20),
    tasks: summarizeMapDiff(taskMongoMap, taskPgMap, 20),
  };
}

async function buildUserStateParity(db) {
  const [mongoAi, pgAiRows, mongoTags, pgTagsRows, mongoPurchase, pgPurchaseRows, mongoFeedback, pgFeedbackRows] =
    await Promise.all([
      db.collection("active_user_status").find({}).toArray().catch(() => []),
      query("SELECT legacy_contact_id, ai_enabled, updated_at FROM active_user_status"),
      db.collection("user_tags").find({}).toArray().catch(() => []),
      query("SELECT legacy_contact_id, tags, updated_at FROM user_tags"),
      db.collection("user_purchase_status").find({}).toArray().catch(() => []),
      query("SELECT legacy_contact_id, has_purchased, updated_by, updated_at FROM user_purchase_status"),
      db.collection("chat_feedback").find({}).toArray().catch(() => []),
      query(`
        SELECT
          f.message_legacy_id,
          f.legacy_contact_id,
          f.sender_id,
          f.sender_role,
          f.platform,
          f.feedback,
          f.notes,
          f.updated_at,
          b.legacy_bot_id
        FROM chat_feedback f
        LEFT JOIN bots b ON b.id = f.bot_id
      `),
    ]);

  const aiMongoMap = new Map(
    mongoAi.map((doc) => {
      const normalized = normalizeAiStatusDoc(doc);
      return [normalized.senderId, normalized];
    }),
  );
  const aiPgMap = new Map(
    pgAiRows.rows.map((row) => {
      const normalized = normalizeAiStatusDoc(row);
      return [normalized.senderId, normalized];
    }),
  );

  const tagsMongoMap = new Map(
    mongoTags.map((doc) => {
      const normalized = normalizeUserTagsDoc(doc);
      return [normalized.userId, normalized];
    }),
  );
  const tagsPgMap = new Map(
    pgTagsRows.rows.map((row) => {
      const normalized = normalizeUserTagsDoc(row);
      return [normalized.userId, normalized];
    }),
  );

  const purchaseMongoMap = new Map(
    mongoPurchase.map((doc) => {
      const normalized = normalizePurchaseStatusDoc(doc);
      return [normalized.userId, normalized];
    }),
  );
  const purchasePgMap = new Map(
    pgPurchaseRows.rows.map((row) => {
      const normalized = normalizePurchaseStatusDoc(row);
      return [normalized.userId, normalized];
    }),
  );

  const feedbackMongoMap = new Map(
    mongoFeedback
      .map((doc) => normalizeFeedbackDoc(doc))
      .filter((doc) => doc.messageIdString)
      .map((doc) => [doc.messageIdString, doc]),
  );
  const feedbackPgMap = new Map(
    pgFeedbackRows.rows
      .map((row) => normalizeFeedbackDoc(row))
      .filter((doc) => doc.messageIdString)
      .map((doc) => [doc.messageIdString, doc]),
  );

  return {
    aiStatus: summarizeMapDiff(aiMongoMap, aiPgMap, 20),
    userTags: summarizeMapDiff(tagsMongoMap, tagsPgMap, 20),
    purchaseStatus: summarizeMapDiff(purchaseMongoMap, purchasePgMap, 20),
    chatFeedback: summarizeMapDiff(feedbackMongoMap, feedbackPgMap, 20),
  };
}

async function buildProfilesParity(db) {
  const [mongoProfiles, pgRows] = await Promise.all([
    db.collection("user_profiles").find({}).toArray().catch(() => []),
    query(
      `
        SELECT
          legacy_contact_id,
          platform,
          display_name,
          profile_data,
          created_at,
          updated_at
        FROM contacts
        WHERE display_name IS NOT NULL
           OR profile_data <> '{}'::jsonb
      `,
    ),
  ]);

  const mongoMap = new Map(
    mongoProfiles.map((doc) => {
      const normalized = normalizeProfileDoc(doc);
      return [`${normalized.platform}:${normalized.userId}`, normalized];
    }),
  );
  const pgMap = new Map(
    pgRows.rows
      .map((row) => normalizeProfileDoc(row))
      .filter((row) => mongoMap.has(`${row.platform}:${row.userId}`))
      .map((row) => [`${row.platform}:${row.userId}`, row]),
  );

  return summarizeMapDiff(mongoMap, pgMap, 20);
}

async function buildNotificationsParity(db) {
  const [
    mongoChannels,
    pgChannelRows,
    mongoLogs,
    pgLogRows,
  ] = await Promise.all([
    db.collection("notification_channels").find({}).toArray().catch(() => []),
    query(
      `
        SELECT
          legacy_channel_id,
          name,
          channel_type,
          is_active,
          config,
          created_at,
          updated_at
        FROM notification_channels
      `,
    ),
    db.collection("notification_logs").find({})
      .sort({ createdAt: -1 })
      .limit(SAMPLE_LIMIT)
      .toArray()
      .catch(() => []),
    query(
      `
        SELECT
          l.id::text,
          l.legacy_log_id,
          l.status,
          l.payload,
          l.created_at,
          c.legacy_channel_id
        FROM notification_logs l
        LEFT JOIN notification_channels c ON c.id = l.channel_id
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $1
      `,
      [SAMPLE_LIMIT],
    ),
  ]);

  const channelMongoMap = new Map(
    mongoChannels.map((doc) => {
      const normalized = normalizeNotificationChannelDoc(doc);
      return [normalized._id, normalized];
    }),
  );
  const channelPgMap = new Map(
    pgChannelRows.rows.map((row) => {
      const normalized = normalizeNotificationChannelDoc(row);
      return [normalized._id, normalized];
    }),
  );

  const logMongoMap = new Map(
    mongoLogs.map((doc) => {
      const normalized = normalizeNotificationLogDoc(doc);
      return [normalized._id, normalized];
    }),
  );
  const logPgMap = new Map(
    pgLogRows.rows.map((row) => {
      const normalized = normalizeNotificationLogDoc(row);
      return [normalized._id, normalized];
    }),
  );

  return {
    channels: summarizeMapDiff(channelMongoMap, channelPgMap, 20),
    logs: summarizeMapDiff(logMongoMap, logPgMap, 20),
  };
}

async function buildChatParity(db) {
  const [mongoSummary, pgSummary] = await Promise.all([
    getMongoChatSummary(db),
    getPostgresChatSummary(),
  ]);

  const latestMongoMap = new Map(
    mongoSummary.latestUsers.map((doc) => [doc._id, doc]),
  );
  const latestPgMap = new Map(
    pgSummary.latestUsers.map((doc) => [doc._id, doc]),
  );

  const sampleUserIds = [];
  const seenUserIds = new Set();
  for (const entry of [...mongoSummary.latestUsers, ...pgSummary.latestUsers]) {
    const userId = toLegacyId(entry?._id);
    if (!userId || seenUserIds.has(userId)) continue;
    seenUserIds.add(userId);
    sampleUserIds.push(userId);
    if (sampleUserIds.length >= Math.min(SAMPLE_LIMIT, 25)) {
      break;
    }
  }

  const mongoHistoryMap = new Map();
  const pgHistoryMap = new Map();
  await Promise.all(
    sampleUserIds.map(async (userId) => {
      const [mongoHistory, pgHistory] = await Promise.all([
        getMongoChatHistorySample(db, userId),
        getPostgresChatHistorySample(userId),
      ]);
      mongoHistoryMap.set(userId, mongoHistory);
      pgHistoryMap.set(userId, pgHistory);
    }),
  );

  return {
    mongoCount: mongoSummary.count,
    pgCount: pgSummary.count,
    countsMatch: mongoSummary.count === pgSummary.count,
    distinctUsers: {
      mongo: mongoSummary.distinctUsers,
      postgres: pgSummary.distinctUsers,
      matches: mongoSummary.distinctUsers === pgSummary.distinctUsers,
    },
    latestUsersParity: summarizeMapDiff(latestMongoMap, latestPgMap, 20),
    historySampleParity: summarizeMapDiff(mongoHistoryMap, pgHistoryMap, 20),
  };
}

function buildOrdersParity(mongoSummary, pgSummary) {
  const statusMongo = new Map(
    mongoSummary.statusRows.map((row) => [String(row._id || ""), row.count]),
  );
  const statusPg = new Map(
    pgSummary.statusRows.map((row) => [String(row._id || ""), row.count]),
  );
  const latestMongo = new Map(
    mongoSummary.latestDocs.map((doc) => [doc._id, doc]),
  );
  const latestPg = new Map(
    pgSummary.latestDocs.map((doc) => [doc._id, doc]),
  );

  return {
    countsMatch: mongoSummary.count === pgSummary.count,
    statusParity: summarizeMapDiff(statusMongo, statusPg, 20),
    latestSampleParity: summarizeMapDiff(latestMongo, latestPg, 20),
    totals: {
      mongo: mongoSummary.totals,
      postgres: pgSummary.totals,
      matches:
        Number(mongoSummary.totals.totalAmount || 0) === Number(pgSummary.totals.totalAmount || 0)
        && Number(mongoSummary.totals.totalShipping || 0) === Number(pgSummary.totals.totalShipping || 0)
        && Number(mongoSummary.totals.confirmedOrders || 0) === Number(pgSummary.totals.confirmedOrders || 0),
    },
  };
}

function printDetailedResult(name, result) {
  console.log(`\n[Verify] ${name}`);
  if (typeof result.ok === "boolean") {
    console.log(
      `  counts: mongo=${result.counts.mongo} postgres=${result.counts.postgres} missingInPg=${result.counts.missingInPg} missingInMongo=${result.counts.missingInMongo} mismatches=${result.counts.mismatches} ${result.ok ? "OK" : "MISMATCH"}`,
    );
    if (result.missingInPg.length > 0) {
      console.log(`  missing in postgres: ${result.missingInPg.join(", ")}`);
    }
    if (result.missingInMongo.length > 0) {
      console.log(`  missing in mongo: ${result.missingInMongo.join(", ")}`);
    }
    if (result.mismatches.length > 0) {
      console.log(`  sample mismatches: ${safeStringify(result.mismatches.slice(0, 3))}`);
    }
    return !result.ok;
  }

  let hasMismatch = false;
  console.log(
    `  total count: mongo=${result.mongoCount} postgres=${result.pgCount} ${result.countsMatch ? "OK" : "MISMATCH"}`,
  );
  if (!result.countsMatch) hasMismatch = true;
  console.log(
    `  totals: ${result.totals.matches ? "OK" : "MISMATCH"} mongo=${safeStringify(result.totals.mongo)} postgres=${safeStringify(result.totals.postgres)}`,
  );
  if (!result.totals.matches) hasMismatch = true;
  if (!result.statusParity.ok) {
    hasMismatch = true;
    console.log(
      `  status parity mismatch: ${safeStringify(result.statusParity.counts)}`,
    );
  }
  if (!result.latestSampleParity.ok) {
    hasMismatch = true;
    console.log(
      `  latest sample mismatch: ${safeStringify(result.latestSampleParity.counts)}`,
    );
    if (result.latestSampleParity.mismatches.length > 0) {
      console.log(
        `  sample latest diff: ${safeStringify(result.latestSampleParity.mismatches.slice(0, 3))}`,
      );
    }
  }
  return hasMismatch;
}

function printChatResult(result) {
  let hasMismatch = false;
  console.log(
    `\n[Verify] chat_history total count: mongo=${result.mongoCount} postgres=${result.pgCount} ${result.countsMatch ? "OK" : "MISMATCH"}`,
  );
  if (!result.countsMatch) hasMismatch = true;

  console.log(
    `  distinct users: mongo=${result.distinctUsers.mongo} postgres=${result.distinctUsers.postgres} ${result.distinctUsers.matches ? "OK" : "MISMATCH"}`,
  );
  if (!result.distinctUsers.matches) hasMismatch = true;

  if (!result.latestUsersParity.ok) {
    hasMismatch = true;
    console.log(
      `  latest users mismatch: ${safeStringify(result.latestUsersParity.counts)}`,
    );
    if (result.latestUsersParity.mismatches.length > 0) {
      console.log(
        `  sample latest-user diff: ${safeStringify(result.latestUsersParity.mismatches.slice(0, 3))}`,
      );
    }
  }

  if (!result.historySampleParity.ok) {
    hasMismatch = true;
    console.log(
      `  history sample mismatch: ${safeStringify(result.historySampleParity.counts)}`,
    );
    if (result.historySampleParity.mismatches.length > 0) {
      console.log(
        `  sample history diff: ${safeStringify(result.historySampleParity.mismatches.slice(0, 2))}`,
      );
    }
  }

  return hasMismatch;
}

function printFollowUpResult(result) {
  let hasMismatch = false;
  console.log("\n[Verify] follow_up_status");
  if (!result.statuses.ok) {
    hasMismatch = true;
    console.log(`  mismatch: ${safeStringify(result.statuses.counts)}`);
    if (result.statuses.mismatches.length > 0) {
      console.log(
        `  sample diff: ${safeStringify(result.statuses.mismatches.slice(0, 3))}`,
      );
    }
  } else {
    console.log(
      `  counts: mongo=${result.statuses.counts.mongo} postgres=${result.statuses.counts.postgres} OK`,
    );
  }

  console.log("\n[Verify] follow_up_page_settings");
  if (!result.pageSettings.ok) {
    hasMismatch = true;
    console.log(`  mismatch: ${safeStringify(result.pageSettings.counts)}`);
    if (result.pageSettings.mismatches.length > 0) {
      console.log(
        `  sample diff: ${safeStringify(result.pageSettings.mismatches.slice(0, 3))}`,
      );
    }
  } else {
    console.log(
      `  counts: mongo=${result.pageSettings.counts.mongo} postgres=${result.pageSettings.counts.postgres} OK`,
    );
  }

  console.log("\n[Verify] follow_up_tasks");
  if (!result.tasks.ok) {
    hasMismatch = true;
    console.log(`  mismatch: ${safeStringify(result.tasks.counts)}`);
    if (result.tasks.mismatches.length > 0) {
      console.log(
        `  sample diff: ${safeStringify(result.tasks.mismatches.slice(0, 3))}`,
      );
    }
  } else {
    console.log(
      `  counts: mongo=${result.tasks.counts.mongo} postgres=${result.tasks.counts.postgres} OK`,
    );
  }

  return hasMismatch;
}

function printUserStateResult(result) {
  let hasMismatch = false;
  const sections = [
    ["active_user_status", result.aiStatus],
    ["user_tags", result.userTags],
    ["user_purchase_status", result.purchaseStatus],
    ["chat_feedback", result.chatFeedback],
  ];

  sections.forEach(([label, parity]) => {
    console.log(`\n[Verify] ${label}`);
    if (!parity.ok) {
      hasMismatch = true;
      console.log(`  mismatch: ${safeStringify(parity.counts)}`);
      if (parity.mismatches.length > 0) {
        console.log(`  sample diff: ${safeStringify(parity.mismatches.slice(0, 3))}`);
      }
    } else {
      console.log(
        `  counts: mongo=${parity.counts.mongo} postgres=${parity.counts.postgres} OK`,
      );
    }
  });

  return hasMismatch;
}

function printNotificationsResult(result) {
  let hasMismatch = false;
  const sections = [
    ["notification_channels", result.channels],
    ["notification_logs", result.logs],
  ];

  sections.forEach(([label, parity]) => {
    console.log(`\n[Verify] ${label}`);
    if (!parity.ok) {
      hasMismatch = true;
      console.log(`  mismatch: ${safeStringify(parity.counts)}`);
      if (parity.mismatches.length > 0) {
        console.log(`  sample diff: ${safeStringify(parity.mismatches.slice(0, 3))}`);
      }
    } else {
      console.log(
        `  counts: mongo=${parity.counts.mongo} postgres=${parity.counts.postgres} OK`,
      );
    }
  });

  return hasMismatch;
}

async function verifyPostgresParity(options = {}) {
  const mongoUri = String(options.mongoUri || MONGO_URI || "").trim();
  const mongoDbName = String(options.mongoDbName || MONGO_DB_NAME || "chatbot").trim() || "chatbot";

  if (!mongoUri) {
    throw new Error("MONGO_URI is not configured");
  }

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db(mongoDbName);

  try {
    let hasMismatch = false;

    const [
      settingsParity,
      botsParity,
      mongoOrders,
      pgOrders,
      profilesParity,
      notificationsParity,
      chatParity,
      followUpParity,
      userStateParity,
    ] =
      await Promise.all([
        buildSettingsParity(db),
        buildBotsParity(db),
        getMongoOrderSummary(db),
        getPostgresOrderSummary(),
        buildProfilesParity(db),
        buildNotificationsParity(db),
        buildChatParity(db),
        buildFollowUpParity(db),
        buildUserStateParity(db),
      ]);

    hasMismatch = printDetailedResult("settings", settingsParity) || hasMismatch;
    hasMismatch = printDetailedResult("bots", botsParity) || hasMismatch;
    hasMismatch = printDetailedResult("user_profiles", profilesParity) || hasMismatch;
    hasMismatch = printNotificationsResult(notificationsParity) || hasMismatch;

    const ordersParity = buildOrdersParity(mongoOrders, pgOrders);
    ordersParity.mongoCount = mongoOrders.count;
    ordersParity.pgCount = pgOrders.count;
    hasMismatch = printDetailedResult("orders", ordersParity) || hasMismatch;

    const instructionsMongo = await countMongo(db, "instructions_v2");
    const instructionsPg = (
      await query(
        "SELECT COUNT(*)::int AS count FROM instructions WHERE source_kind = 'instructions_v2'",
      )
    ).rows[0].count;
    const instructionsOk = instructionsMongo === instructionsPg;
    console.log(
      `\n[Verify] instructions_v2: mongo=${instructionsMongo} postgres=${instructionsPg} ${instructionsOk ? "OK" : "MISMATCH"}`,
    );
    if (!instructionsOk) hasMismatch = true;

    hasMismatch = printChatResult(chatParity) || hasMismatch;
    hasMismatch = printFollowUpResult(followUpParity) || hasMismatch;
    hasMismatch = printUserStateResult(userStateParity) || hasMismatch;

    return {
      ok: !hasMismatch,
      hasMismatch,
    };
  } finally {
    await mongo.close();
  }
}

module.exports = {
  verifyPostgresParity,
};

if (require.main === module) {
  verifyPostgresParity()
    .then(async (summary) => {
      if (summary?.hasMismatch) {
        process.exitCode = 2;
      }
      await closePgPool();
    })
    .catch(async (error) => {
      console.error("[Verify] Failed:", error);
      await closePgPool();
      process.exit(1);
    });
}
