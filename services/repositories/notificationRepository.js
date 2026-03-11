const { isPostgresConfigured, query } = require("../../infra/postgres");
const { ObjectId } = require("mongodb");
const {
  applyProjection,
  buildMongoIdQuery,
  safeStringify,
  toLegacyId,
} = require("./shared");

function normalizeChannelType(value) {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!type) return "line_group";
  return type;
}

function normalizeChannelDoc(doc = {}) {
  const config = doc?.config && typeof doc.config === "object" ? doc.config : {};
  const resolvedType = normalizeChannelType(
    doc.type || doc.channel_type || config.type || "line_group",
  );
  const resolvedIsActive =
    typeof doc.isActive === "boolean"
      ? doc.isActive
      : typeof doc.is_active === "boolean"
        ? doc.is_active
        : true;

  return {
    _id: toLegacyId(doc._id || doc.legacy_channel_id),
    name: doc.name || config.name || "",
    type: resolvedType,
    senderBotId:
      toLegacyId(doc.senderBotId || config.senderBotId || config.botId) || null,
    botId: toLegacyId(doc.botId || config.botId) || null,
    groupId: toLegacyId(doc.groupId || config.groupId || config.lineGroupId) || null,
    lineGroupId:
      toLegacyId(doc.lineGroupId || config.lineGroupId || config.groupId) || null,
    receiveFromAllBots:
      typeof doc.receiveFromAllBots === "boolean"
        ? doc.receiveFromAllBots
        : config.receiveFromAllBots === true,
    sources: Array.isArray(doc.sources)
      ? doc.sources
      : Array.isArray(config.sources)
        ? config.sources
        : [],
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
      doc.settings && typeof doc.settings === "object"
        ? doc.settings
        : config.settings && typeof config.settings === "object"
          ? config.settings
          : {},
    lastSummaryAt: doc.lastSummaryAt || config.lastSummaryAt || null,
    lastSummarySlotKey:
      typeof doc.lastSummarySlotKey === "string"
        ? doc.lastSummarySlotKey
        : typeof config.lastSummarySlotKey === "string"
          ? config.lastSummarySlotKey
          : null,
    isActive: resolvedIsActive,
    createdAt: doc.createdAt || doc.created_at || config.createdAt || null,
    updatedAt: doc.updatedAt || doc.updated_at || config.updatedAt || null,
  };
}

function normalizeLogDoc(doc = {}) {
  const payload = doc?.payload && typeof doc.payload === "object" ? doc.payload : {};
  return {
    _id: toLegacyId(doc._id || doc.legacy_log_id || doc.id),
    channelId:
      toLegacyId(
        doc.channelId
        || doc.channel_id
        || doc.legacy_channel_id
        || payload.channelId,
      ) || null,
    orderId: toLegacyId(doc.orderId || payload.orderId) || null,
    eventType:
      typeof doc.eventType === "string"
        ? doc.eventType
        : typeof payload.eventType === "string"
          ? payload.eventType
          : null,
    status:
      typeof doc.status === "string"
        ? doc.status
        : typeof payload.status === "string"
          ? payload.status
          : "failed",
    errorMessage:
      typeof doc.errorMessage === "string"
        ? doc.errorMessage
        : typeof payload.errorMessage === "string"
          ? payload.errorMessage
          : null,
    response:
      Object.prototype.hasOwnProperty.call(doc, "response")
        ? doc.response
        : Object.prototype.hasOwnProperty.call(payload, "response")
          ? payload.response
          : null,
    createdAt: doc.createdAt || doc.created_at || payload.createdAt || null,
  };
}

function buildChannelComparable(doc = {}) {
  const normalized = normalizeChannelDoc(doc);
  return {
    _id: normalized._id,
    name: normalized.name,
    type: normalized.type,
    senderBotId: normalized.senderBotId,
    groupId: normalized.groupId,
    receiveFromAllBots: normalized.receiveFromAllBots,
    sources: normalized.sources,
    eventTypes: normalized.eventTypes,
    deliveryMode: normalized.deliveryMode,
    summaryTimes: normalized.summaryTimes,
    summaryTimezone: normalized.summaryTimezone,
    settings: normalized.settings,
    lastSummaryAt: normalized.lastSummaryAt,
    lastSummarySlotKey: normalized.lastSummarySlotKey,
    isActive: normalized.isActive,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  };
}

function buildLogComparable(doc = {}) {
  const normalized = normalizeLogDoc(doc);
  return {
    _id: normalized._id,
    channelId: normalized.channelId,
    orderId: normalized.orderId,
    eventType: normalized.eventType,
    status: normalized.status,
    errorMessage: normalized.errorMessage,
    createdAt: normalized.createdAt,
  };
}

function buildChannelConfig(doc = {}) {
  const normalized = normalizeChannelDoc(doc);
  return {
    senderBotId: normalized.senderBotId,
    botId: normalized.botId,
    groupId: normalized.groupId,
    lineGroupId: normalized.lineGroupId,
    receiveFromAllBots: normalized.receiveFromAllBots,
    sources: normalized.sources,
    eventTypes: normalized.eventTypes,
    deliveryMode: normalized.deliveryMode,
    summaryTimes: normalized.summaryTimes,
    summaryTimezone: normalized.summaryTimezone,
    settings: normalized.settings,
    lastSummaryAt: normalized.lastSummaryAt,
    lastSummarySlotKey: normalized.lastSummarySlotKey,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  };
}

function normalizeSortDirection(sort, field, fallback = -1) {
  if (!sort || typeof sort !== "object") return fallback;
  if (!Object.prototype.hasOwnProperty.call(sort, field)) return fallback;
  return Number(sort[field]) >= 0 ? 1 : -1;
}

function createNotificationRepository({
  connectDB,
  dbName = "chatbot",
  runtimeConfig,
}) {
  function canUseMongo() {
    return runtimeConfig?.features?.mongoEnabled !== false;
  }

  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  function shouldDualWrite() {
    return Boolean(runtimeConfig?.features?.postgresDualWrite && canUsePostgres());
  }

  function shouldShadowRead() {
    return Boolean(runtimeConfig?.features?.postgresShadowRead && canUsePostgres());
  }

  function shouldReadPrimary() {
    return Boolean(
      canUsePostgres()
        && (runtimeConfig?.features?.postgresReadPrimaryNotifications || !canUseMongo()),
    );
  }

  async function getDb() {
    if (!canUseMongo()) {
      throw new Error("MongoDB is disabled");
    }
    const client = await connectDB();
    return client.db(dbName);
  }

  function buildMongoChannelFilter(filter = {}) {
    const conditions = [];
    if (filter.id) {
      conditions.push(buildMongoIdQuery(filter.id));
    }
    if (typeof filter.isActive === "boolean") {
      conditions.push({ isActive: filter.isActive });
    }
    if (typeof filter.type === "string" && filter.type.trim()) {
      conditions.push({ type: normalizeChannelType(filter.type) });
    }
    const senderBotId = toLegacyId(filter.senderBotId);
    if (senderBotId) {
      conditions.push({
        $or: [{ senderBotId }, { botId: senderBotId }],
      });
    }
    const groupId = toLegacyId(filter.groupId || filter.lineGroupId);
    if (groupId) {
      conditions.push({
        $or: [{ groupId }, { lineGroupId: groupId }],
      });
    }
    if (typeof filter.eventType === "string" && filter.eventType.trim()) {
      conditions.push({ eventTypes: filter.eventType.trim() });
    }
    if (Array.isArray(filter.eventTypes) && filter.eventTypes.length > 0) {
      conditions.push({ eventTypes: { $in: filter.eventTypes } });
    }
    if (filter.slipOkEnabled === true) {
      conditions.push({ "settings.slipOkEnabled": true });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }

  function buildMongoLogFilter(filter = {}) {
    const query = {};
    const channelId = toLegacyId(filter.channelId);
    if (channelId) query.channelId = channelId;
    if (typeof filter.status === "string" && filter.status.trim()) {
      query.status = filter.status.trim();
    }

    if (filter.from || filter.to) {
      query.createdAt = {};
      if (filter.from) query.createdAt.$gte = filter.from;
      if (filter.to) query.createdAt.$lte = filter.to;
      if (Object.keys(query.createdAt).length === 0) {
        delete query.createdAt;
      }
    }
    return query;
  }

  function startShadowCompare(label, mongoValue, pgValue, normalizer) {
    if (!shouldShadowRead() || shouldReadPrimary()) return;
    const normalize =
      typeof normalizer === "function"
        ? normalizer
        : (value) => value;

    const normalizedMongo = Array.isArray(mongoValue)
      ? mongoValue.map((item) => normalize(item))
      : normalize(mongoValue);
    const normalizedPg = Array.isArray(pgValue)
      ? pgValue.map((item) => normalize(item))
      : normalize(pgValue);

    if (safeStringify(normalizedMongo) !== safeStringify(normalizedPg)) {
      console.warn(`[NotificationRepository] Shadow read mismatch for ${label}`);
    }
  }

  async function upsertPostgresChannel(doc = {}) {
    const normalized = normalizeChannelDoc(doc);
    if (!normalized._id) return;
    await query(
      `
        INSERT INTO notification_channels (
          legacy_channel_id,
          name,
          channel_type,
          is_active,
          config,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
        ON CONFLICT (legacy_channel_id) DO UPDATE SET
          name = EXCLUDED.name,
          channel_type = EXCLUDED.channel_type,
          is_active = EXCLUDED.is_active,
          config = EXCLUDED.config,
          updated_at = EXCLUDED.updated_at
      `,
      [
        normalized._id,
        normalized.name || "",
        normalizeChannelType(normalized.type),
        normalized.isActive !== false,
        JSON.stringify(buildChannelConfig(normalized)),
        normalized.createdAt || new Date(),
        normalized.updatedAt || normalized.createdAt || new Date(),
      ],
    );
  }

  async function deletePostgresChannel(channelId) {
    const legacyChannelId = toLegacyId(channelId);
    if (!legacyChannelId) return;
    await query(
      "DELETE FROM notification_channels WHERE legacy_channel_id = $1",
      [legacyChannelId],
    );
  }

  async function upsertPostgresLog(doc = {}) {
    const normalized = normalizeLogDoc(doc);
    if (!normalized._id) return;

    await query(
      `
        INSERT INTO notification_logs (
          legacy_log_id,
          channel_id,
          status,
          payload,
          created_at
        ) VALUES (
          $1,
          (SELECT id FROM notification_channels WHERE legacy_channel_id = $2 LIMIT 1),
          $3,
          $4::jsonb,
          $5
        )
        ON CONFLICT (legacy_log_id) DO UPDATE SET
          channel_id = EXCLUDED.channel_id,
          status = EXCLUDED.status,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at
      `,
      [
        normalized._id,
        normalized.channelId,
        normalized.status || "failed",
        JSON.stringify({
          channelId: normalized.channelId,
          orderId: normalized.orderId,
          eventType: normalized.eventType,
          errorMessage: normalized.errorMessage,
          response: normalized.response,
        }),
        normalized.createdAt || new Date(),
      ],
    );
  }

  function buildPostgresChannelFilter(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    const channelId = toLegacyId(filter.id);
    if (channelId) {
      push("legacy_channel_id =", channelId);
    }
    if (typeof filter.isActive === "boolean") {
      push("is_active =", filter.isActive);
    }
    if (typeof filter.type === "string" && filter.type.trim()) {
      push("channel_type =", normalizeChannelType(filter.type));
    }
    const senderBotId = toLegacyId(filter.senderBotId);
    if (senderBotId) {
      params.push(senderBotId);
      conditions.push(
        `((config->>'senderBotId') = $${params.length} OR (config->>'botId') = $${params.length})`,
      );
    }
    const groupId = toLegacyId(filter.groupId || filter.lineGroupId);
    if (groupId) {
      params.push(groupId);
      conditions.push(
        `((config->>'groupId') = $${params.length} OR (config->>'lineGroupId') = $${params.length})`,
      );
    }
    if (typeof filter.eventType === "string" && filter.eventType.trim()) {
      params.push(filter.eventType.trim());
      conditions.push(`(config->'eventTypes') ? $${params.length}`);
    }
    if (Array.isArray(filter.eventTypes) && filter.eventTypes.length > 0) {
      const values = filter.eventTypes
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
      if (values.length > 0) {
        params.push(values);
        conditions.push(`(config->'eventTypes') ?| $${params.length}`);
      }
    }
    if (filter.slipOkEnabled === true) {
      conditions.push("COALESCE((config->'settings'->>'slipOkEnabled')::boolean, false)");
    }

    return {
      whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  async function readPostgresChannels(filter = {}, options = {}) {
    const { whereSql, params } = buildPostgresChannelFilter(filter);
    const sortDirection = normalizeSortDirection(options.sort, "createdAt", -1) >= 0
      ? "ASC"
      : "DESC";
    let limitSql = "";
    const queryParams = [...params];
    if (Number.isFinite(options.limit) && options.limit > 0) {
      queryParams.push(options.limit);
      limitSql = `LIMIT $${queryParams.length}`;
    }
    const result = await query(
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
        ${whereSql}
        ORDER BY created_at ${sortDirection}, id ${sortDirection}
        ${limitSql}
      `,
      queryParams,
    );
    return result.rows.map((row) => normalizeChannelDoc(row));
  }

  function buildPostgresLogFilter(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    const channelId = toLegacyId(filter.channelId);
    if (channelId) {
      push("c.legacy_channel_id =", channelId);
    }
    if (typeof filter.status === "string" && filter.status.trim()) {
      push("l.status =", filter.status.trim());
    }
    if (filter.from) {
      push("l.created_at >=", filter.from);
    }
    if (filter.to) {
      push("l.created_at <=", filter.to);
    }

    return {
      whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  async function readPostgresLogs(filter = {}, options = {}) {
    const { whereSql, params } = buildPostgresLogFilter(filter);
    const sortDirection = normalizeSortDirection(options.sort, "createdAt", -1) >= 0
      ? "ASC"
      : "DESC";
    let limitSql = "";
    const queryParams = [...params];
    if (Number.isFinite(options.limit) && options.limit > 0) {
      queryParams.push(options.limit);
      limitSql = `LIMIT $${queryParams.length}`;
    }
    const result = await query(
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
        ${whereSql}
        ORDER BY l.created_at ${sortDirection}, l.id ${sortDirection}
        ${limitSql}
      `,
      queryParams,
    );
    return result.rows.map((row) => normalizeLogDoc(row));
  }

  async function listChannels(filter = {}, options = {}) {
    if (shouldReadPrimary()) {
      try {
        return await readPostgresChannels(filter, options);
      } catch (error) {
        console.warn(
          "[NotificationRepository] Primary channel list read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const db = await getDb();
    const coll = db.collection("notification_channels");
    let cursor = coll.find(buildMongoChannelFilter(filter));
    cursor = cursor.sort(options.sort || { createdAt: -1 });
    if (Number.isFinite(options.limit) && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }
    const mongoDocs = await cursor.toArray();

    if (shouldShadowRead()) {
      void readPostgresChannels(filter, options)
        .then((pgDocs) =>
          startShadowCompare(
            `channels:list:${safeStringify(filter)}`,
            mongoDocs,
            pgDocs,
            buildChannelComparable,
          ))
        .catch((error) => {
          console.warn(
            "[NotificationRepository] Shadow channel list read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function findChannelById(channelId, options = {}) {
    const normalizedId = toLegacyId(channelId);
    if (!normalizedId) return null;

    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPostgresChannels({ id: normalizedId }, { limit: 1 });
        const pgDoc = pgDocs[0] || null;
        if (pgDoc || !canUseMongo()) {
          return options.projection ? applyProjection(pgDoc, options.projection) : pgDoc;
        }
      } catch (error) {
        console.warn(
          `[NotificationRepository] Primary channel read failed for ${normalizedId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return null;
    }

    const db = await getDb();
    const mongoDoc = await db.collection("notification_channels")
      .findOne(buildMongoIdQuery(normalizedId), options);

    if (shouldShadowRead()) {
      void readPostgresChannels({ id: normalizedId }, { limit: 1 })
        .then((pgDocs) =>
          startShadowCompare(
            `channel:byId:${normalizedId}`,
            mongoDoc,
            pgDocs[0] || null,
            buildChannelComparable,
          ))
        .catch((error) => {
          console.warn(
            `[NotificationRepository] Shadow channel read failed for ${normalizedId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function findChannel(filter = {}, options = {}) {
    const docs = await listChannels(filter, {
      ...options,
      limit: 1,
    });
    return docs[0] || null;
  }

  async function insertChannel(doc = {}) {
    const payload = {
      ...doc,
      _id: toLegacyId(doc?._id) || new ObjectId().toString(),
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || doc.createdAt || new Date(),
    };

    if (canUseMongo()) {
      const db = await getDb();
      const result = await db.collection("notification_channels").insertOne(payload);
      payload._id = result.insertedId;
    }

    if (canUsePostgres() && (shouldDualWrite() || !canUseMongo())) {
      await upsertPostgresChannel(payload).catch((error) => {
        console.warn(
          `[NotificationRepository] Channel dual-write insert failed for ${toLegacyId(payload._id)}:`,
          error?.message || error,
        );
      });
    }

    return payload;
  }

  async function updateChannelById(channelId, setDoc = {}) {
    const normalizedId = toLegacyId(channelId);
    if (!normalizedId) return null;

    if (!canUseMongo()) {
      const existingDocs = await readPostgresChannels({ id: normalizedId }, { limit: 1 });
      const existing = existingDocs[0] || null;
      if (!existing) return null;
      const updatedDoc = {
        ...existing,
        ...setDoc,
        _id: normalizedId,
        updatedAt: setDoc.updatedAt || new Date(),
      };
      await upsertPostgresChannel(updatedDoc).catch((error) => {
        console.warn(
          `[NotificationRepository] Channel update failed for ${normalizedId}:`,
          error?.message || error,
        );
      });
      const refreshed = await readPostgresChannels({ id: normalizedId }, { limit: 1 });
      return refreshed[0] || updatedDoc;
    }

    const db = await getDb();
    await db.collection("notification_channels").updateOne(
      buildMongoIdQuery(normalizedId),
      { $set: setDoc },
    );
    const updated = await db.collection("notification_channels").findOne(
      buildMongoIdQuery(normalizedId),
    );

    if (updated && shouldDualWrite()) {
      await upsertPostgresChannel(updated).catch((error) => {
        console.warn(
          `[NotificationRepository] Channel dual-write update failed for ${normalizedId}:`,
          error?.message || error,
        );
      });
    }

    return updated;
  }

  async function setChannelSummaryState(channelId, state = {}) {
    const updateDoc = {
      updatedAt: state.updatedAt || new Date(),
    };
    if (Object.prototype.hasOwnProperty.call(state, "lastSummaryAt")) {
      updateDoc.lastSummaryAt = state.lastSummaryAt || null;
    }
    if (Object.prototype.hasOwnProperty.call(state, "lastSummarySlotKey")) {
      updateDoc.lastSummarySlotKey = state.lastSummarySlotKey || null;
    }
    return updateChannelById(channelId, updateDoc);
  }

  async function deleteChannelById(channelId) {
    const normalizedId = toLegacyId(channelId);
    if (!normalizedId) {
      return { deletedCount: 0 };
    }

    if (!canUseMongo()) {
      if (!canUsePostgres()) {
        return { deletedCount: 0 };
      }
      const existingDocs = await readPostgresChannels({ id: normalizedId }, { limit: 1 });
      if (existingDocs.length === 0) {
        return { deletedCount: 0 };
      }
      await deletePostgresChannel(normalizedId).catch((error) => {
        console.warn(
          `[NotificationRepository] Channel delete failed for ${normalizedId}:`,
          error?.message || error,
        );
      });
      return { deletedCount: 1 };
    }

    const db = await getDb();
    const coll = db.collection("notification_channels");
    const existing = await coll.findOne(buildMongoIdQuery(normalizedId));
    const result = await coll.deleteOne(buildMongoIdQuery(normalizedId));
    if (result.deletedCount > 0 && shouldDualWrite()) {
      await deletePostgresChannel(existing?._id || normalizedId).catch((error) => {
        console.warn(
          `[NotificationRepository] Channel dual-write delete failed for ${normalizedId}:`,
          error?.message || error,
        );
      });
    }
    return result;
  }

  async function insertLog(payload = {}) {
    const now = payload.createdAt || new Date();
    const doc = {
      _id: toLegacyId(payload._id) || new ObjectId().toString(),
      channelId: payload.channelId || null,
      orderId: payload.orderId || null,
      eventType: payload.eventType || null,
      status: payload.status || "failed",
      errorMessage: payload.errorMessage || null,
      response: payload.response || null,
      createdAt: now,
    };
    if (canUseMongo()) {
      const db = await getDb();
      const result = await db.collection("notification_logs").insertOne(doc);
      doc._id = result.insertedId;
    }

    if (canUsePostgres() && (shouldDualWrite() || !canUseMongo())) {
      await upsertPostgresLog(doc).catch((error) => {
        console.warn(
          `[NotificationRepository] Log dual-write failed for ${toLegacyId(doc._id)}:`,
          error?.message || error,
        );
      });
    }

    return doc;
  }

  async function listLogs(filter = {}, options = {}) {
    if (shouldReadPrimary()) {
      try {
        return await readPostgresLogs(filter, options);
      } catch (error) {
        console.warn(
          "[NotificationRepository] Primary log list read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const db = await getDb();
    const coll = db.collection("notification_logs");
    let cursor = coll.find(buildMongoLogFilter(filter));
    cursor = cursor.sort(options.sort || { createdAt: -1 });
    if (Number.isFinite(options.limit) && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }
    const mongoDocs = await cursor.toArray();

    if (shouldShadowRead()) {
      void readPostgresLogs(filter, options)
        .then((pgDocs) =>
          startShadowCompare(
            `logs:list:${safeStringify(filter)}`,
            mongoDocs,
            pgDocs,
            buildLogComparable,
          ))
        .catch((error) => {
          console.warn(
            "[NotificationRepository] Shadow log list read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  return {
    deleteChannelById,
    findChannel,
    findChannelById,
    insertChannel,
    insertLog,
    listChannels,
    listLogs,
    setChannelSummaryState,
    updateChannelById,
  };
}

module.exports = {
  createNotificationRepository,
};
