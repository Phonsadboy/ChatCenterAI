const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  applyProjection,
  generateLegacyObjectIdString,
  toLegacyId,
} = require("./shared");

function normalizeChannelType(value) {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";
  return type || "line_group";
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

function createNotificationRepository({ runtimeConfig }) {
  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
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
    if (!canUsePostgres()) return [];
    return readPostgresChannels(filter, options);
  }

  async function findChannelById(channelId, options = {}) {
    const normalizedId = toLegacyId(channelId);
    if (!normalizedId || !canUsePostgres()) return null;
    const pgDocs = await readPostgresChannels({ id: normalizedId }, { limit: 1 });
    const pgDoc = pgDocs[0] || null;
    return options.projection ? applyProjection(pgDoc, options.projection) : pgDoc;
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
      _id: toLegacyId(doc?._id) || generateLegacyObjectIdString(),
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || doc.createdAt || new Date(),
    };

    if (!canUsePostgres()) return payload;

    await upsertPostgresChannel(payload);
    const stored = await readPostgresChannels({ id: payload._id }, { limit: 1 });
    return stored[0] || payload;
  }

  async function updateChannelById(channelId, setDoc = {}) {
    const normalizedId = toLegacyId(channelId);
    if (!normalizedId || !canUsePostgres()) return null;

    const existingDocs = await readPostgresChannels({ id: normalizedId }, { limit: 1 });
    const existing = existingDocs[0] || null;
    if (!existing) return null;

    const updatedDoc = {
      ...existing,
      ...setDoc,
      _id: normalizedId,
      updatedAt: setDoc.updatedAt || new Date(),
    };
    await upsertPostgresChannel(updatedDoc);
    const refreshed = await readPostgresChannels({ id: normalizedId }, { limit: 1 });
    return refreshed[0] || updatedDoc;
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
    if (!normalizedId || !canUsePostgres()) {
      return { deletedCount: 0 };
    }
    const existingDocs = await readPostgresChannels({ id: normalizedId }, { limit: 1 });
    if (existingDocs.length === 0) {
      return { deletedCount: 0 };
    }
    await deletePostgresChannel(normalizedId);
    return { deletedCount: 1 };
  }

  async function insertLog(payload = {}) {
    const now = payload.createdAt || new Date();
    const doc = {
      _id: toLegacyId(payload._id) || generateLegacyObjectIdString(),
      channelId: payload.channelId || null,
      orderId: payload.orderId || null,
      eventType: payload.eventType || null,
      status: payload.status || "failed",
      errorMessage: payload.errorMessage || null,
      response: payload.response || null,
      createdAt: now,
    };

    if (canUsePostgres()) {
      await upsertPostgresLog(doc);
    }
    return doc;
  }

  async function listLogs(filter = {}, options = {}) {
    if (!canUsePostgres()) return [];
    return readPostgresLogs(filter, options);
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
