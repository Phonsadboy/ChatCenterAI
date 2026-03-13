const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  generateLegacyObjectIdString,
  normalizeJson,
  normalizePlatform,
  toLegacyId,
} = require("./shared");

function createFollowUpRepository({
  dbName = "chatbot",
  runtimeConfig,
}) {
  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  function normalizeBotFilter(botId, defaultBotOnly = false) {
    if (defaultBotOnly) {
      return { defaultBotOnly: true, botId: null };
    }
    const normalizedBotId = toLegacyId(botId);
    return { defaultBotOnly: false, botId: normalizedBotId || null };
  }

  function ensurePostgresAvailable() {
    if (canUsePostgres()) return;
    throw new Error(`followup_repository_requires_postgres:${dbName}`);
  }

  async function syncStatusDoc(doc = {}, options = {}) {
    if (!doc) return null;
    const platform =
      typeof doc?.platform === "string" && doc.platform.trim()
        ? normalizePlatform(doc.platform)
        : null;
    const legacyBotId = toLegacyId(doc?.botId) || null;
    const pgBotId = await resolvePgBotId({ query }, platform, doc?.botId);
    await query(
      `
        INSERT INTO follow_up_status (
          platform,
          bot_id,
          legacy_bot_id,
          bot_scope,
          legacy_contact_id,
          status,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
        ON CONFLICT (platform, bot_scope, legacy_contact_id) DO UPDATE SET
          status = EXCLUDED.status,
          bot_id = EXCLUDED.bot_id,
          legacy_bot_id = EXCLUDED.legacy_bot_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        platform,
        pgBotId,
        legacyBotId,
        legacyBotId || "",
        toLegacyId(doc?.senderId),
        JSON.stringify(normalizeJson(doc, {})),
        doc?.lastAnalyzedAt || doc?.followUpUpdatedAt || doc?.updatedAt || new Date(),
      ],
    );
    return true;
  }

  async function syncTaskDoc(doc = {}, options = {}) {
    if (!doc) return null;
    const platform =
      typeof doc?.platform === "string" && doc.platform.trim()
        ? normalizePlatform(doc.platform)
        : null;
    const pgBotId = await resolvePgBotId({ query }, platform, doc?.botId);
    const normalizedStatus =
      typeof doc?.status === "string" ? doc.status.trim().toLowerCase() : "";
    const status = doc?.completed
      ? "completed"
      : doc?.canceled
        ? "canceled"
        : normalizedStatus === "sent"
          ? "sent"
          : normalizedStatus === "failed"
            ? "failed"
            : "pending";
    await query(
      `
        INSERT INTO follow_up_tasks (
          legacy_task_id,
          platform,
          bot_id,
          legacy_contact_id,
          status,
          payload,
          next_scheduled_at,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
        ON CONFLICT (legacy_task_id) DO UPDATE SET
          platform = EXCLUDED.platform,
          bot_id = EXCLUDED.bot_id,
          legacy_contact_id = EXCLUDED.legacy_contact_id,
          status = EXCLUDED.status,
          payload = EXCLUDED.payload,
          next_scheduled_at = EXCLUDED.next_scheduled_at,
          updated_at = EXCLUDED.updated_at
      `,
      [
        toLegacyId(doc?._id),
        platform,
        pgBotId,
        toLegacyId(doc?.userId),
        status,
        JSON.stringify(normalizeJson(doc, {})),
        doc?.nextScheduledAt || null,
        doc?.createdAt || new Date(),
        doc?.updatedAt || doc?.createdAt || new Date(),
      ],
    );
    return true;
  }

  function hydratePostgresStatus(row = {}) {
    const payload =
      row?.status && typeof row.status === "object" ? row.status : {};
    return {
      ...payload,
      senderId: row.legacy_contact_id || payload.senderId || "",
      platform: row.platform || payload.platform || null,
      botId: row.legacy_bot_id || payload.botId || null,
      updatedAt: row.updated_at || payload.updatedAt || null,
    };
  }

  function hydratePostgresTask(row = {}) {
    const payload =
      row?.payload && typeof row.payload === "object" ? row.payload : {};
    const baseStatus = row.status || payload.status || "pending";
    return {
      ...payload,
      _id: row.legacy_task_id || row.id || payload._id || null,
      userId: row.legacy_contact_id || payload.userId || "",
      platform: row.platform || payload.platform || null,
      botId: row.legacy_bot_id || payload.botId || null,
      status: baseStatus,
      nextScheduledAt:
        row.next_scheduled_at || payload.nextScheduledAt || null,
      createdAt: row.created_at || payload.createdAt || null,
      updatedAt: row.updated_at || payload.updatedAt || null,
      canceled:
        typeof payload.canceled === "boolean"
          ? payload.canceled
          : baseStatus === "canceled",
      completed:
        typeof payload.completed === "boolean"
          ? payload.completed
          : baseStatus === "completed",
    };
  }

  function buildPostgresStatusFilter(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    if (typeof filter.platform === "string" && filter.platform.trim()) {
      push("s.platform =", normalizePlatform(filter.platform));
    }

    const userId = toLegacyId(filter.userId);
    if (userId) {
      push("s.legacy_contact_id =", userId);
    }

    const userIds = Array.isArray(filter.userIds)
      ? filter.userIds.map((value) => toLegacyId(value)).filter(Boolean)
      : [];
    if (userIds.length > 0) {
      params.push(userIds);
      conditions.push(`s.legacy_contact_id = ANY($${params.length})`);
    }

    const normalizedBot = normalizeBotFilter(filter.botId, Boolean(filter.defaultBotOnly));
    if (normalizedBot.defaultBotOnly) {
      conditions.push("COALESCE(s.bot_scope, '') = ''");
    } else if (normalizedBot.botId) {
      push("COALESCE(s.bot_scope, '') =", normalizedBot.botId);
    }

    if (typeof filter.hasFollowUp === "boolean") {
      params.push(filter.hasFollowUp);
      conditions.push(`COALESCE((s.status->>'hasFollowUp')::boolean, false) = $${params.length}`);
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  function buildPostgresTaskFilter(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    if (typeof filter.platform === "string" && filter.platform.trim()) {
      push("t.platform =", normalizePlatform(filter.platform));
    }

    const userId = toLegacyId(filter.userId);
    if (userId) {
      push("t.legacy_contact_id =", userId);
    }

    const userIds = Array.isArray(filter.userIds)
      ? filter.userIds.map((value) => toLegacyId(value)).filter(Boolean)
      : [];
    if (userIds.length > 0) {
      params.push(userIds);
      conditions.push(`t.legacy_contact_id = ANY($${params.length})`);
    }

    const normalizedBot = normalizeBotFilter(filter.botId, Boolean(filter.defaultBotOnly));
    if (normalizedBot.defaultBotOnly) {
      conditions.push("t.bot_id IS NULL");
    } else if (normalizedBot.botId) {
      push("COALESCE(b.legacy_bot_id, '') =", normalizedBot.botId);
    }

    if (typeof filter.dateKey === "string" && filter.dateKey.trim()) {
      push("COALESCE(t.payload->>'dateKey', '') =", filter.dateKey.trim());
    }

    if (filter.dateKeyRange && typeof filter.dateKeyRange === "object") {
      if (filter.dateKeyRange.gte) {
        push("COALESCE(t.payload->>'dateKey', '') >=", filter.dateKeyRange.gte);
      }
      if (filter.dateKeyRange.lte) {
        push("COALESCE(t.payload->>'dateKey', '') <=", filter.dateKeyRange.lte);
      }
    }

    if (filter.activeOnly) {
      conditions.push(
        "COALESCE((t.payload->>'canceled')::boolean, false) = false AND COALESCE((t.payload->>'completed')::boolean, false) = false",
      );
    }

    if (filter.dueOnly) {
      push("t.next_scheduled_at <=", filter.now || new Date());
    }

    if (filter.nextScheduledAtNotNull) {
      conditions.push("t.next_scheduled_at IS NOT NULL");
    }

    if (typeof filter.completed === "boolean") {
      params.push(filter.completed);
      conditions.push(`COALESCE((t.payload->>'completed')::boolean, false) = $${params.length}`);
    }

    if (typeof filter.canceled === "boolean") {
      params.push(filter.canceled);
      conditions.push(`COALESCE((t.payload->>'canceled')::boolean, false) = $${params.length}`);
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  async function readPostgresStatuses(filter = {}, options = {}) {
    const { whereSql, params } = buildPostgresStatusFilter(filter);
    const limitSql =
      Number.isFinite(options.limit) && options.limit > 0
        ? `LIMIT $${params.length + 1}`
        : "";
    const queryParams =
      limitSql.length > 0 ? [...params, options.limit] : params;
    const result = await query(
      `
        SELECT
          s.platform,
          s.legacy_contact_id,
          s.status,
          s.updated_at,
          COALESCE(s.legacy_bot_id, b.legacy_bot_id) AS legacy_bot_id
        FROM follow_up_status s
        LEFT JOIN bots b ON b.id = s.bot_id
        ${whereSql}
        ORDER BY s.updated_at DESC, s.legacy_contact_id ASC
        ${limitSql}
      `,
      queryParams,
    );
    return result.rows.map((row) => hydratePostgresStatus(row));
  }

  async function readPostgresTasks(filter = {}, options = {}) {
    const { whereSql, params } = buildPostgresTaskFilter(filter);
    const sort = options.sort || { nextScheduledAt: 1, createdAt: -1 };
    const orderBy = [];
    if (Number(sort.nextScheduledAt) < 0) {
      orderBy.push("t.next_scheduled_at DESC NULLS LAST");
    } else if (Object.prototype.hasOwnProperty.call(sort, "nextScheduledAt")) {
      orderBy.push("t.next_scheduled_at ASC NULLS LAST");
    }
    if (Number(sort.createdAt) < 0) {
      orderBy.push("t.created_at DESC");
    } else if (Object.prototype.hasOwnProperty.call(sort, "createdAt")) {
      orderBy.push("t.created_at ASC");
    }
    if (orderBy.length === 0) {
      orderBy.push("t.next_scheduled_at ASC NULLS LAST", "t.created_at DESC");
    }
    const limitSql =
      Number.isFinite(options.limit) && options.limit > 0
        ? `LIMIT $${params.length + 1}`
        : "";
    const queryParams =
      limitSql.length > 0 ? [...params, options.limit] : params;
    const result = await query(
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
        ${whereSql}
        ORDER BY ${orderBy.join(", ")}
        ${limitSql}
      `,
      queryParams,
    );
    return result.rows.map((row) => hydratePostgresTask(row));
  }

  async function readPostgresTaskById(taskId) {
    const normalizedTaskId = toLegacyId(taskId);
    if (!normalizedTaskId) return null;
    const result = await query(
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
        WHERE t.legacy_task_id = $1 OR t.id::text = $1
        ORDER BY
          CASE WHEN t.legacy_task_id = $1 THEN 0 ELSE 1 END,
          t.updated_at DESC,
          t.id DESC
        LIMIT 1
      `,
      [normalizedTaskId],
    );
    return result.rows[0] ? hydratePostgresTask(result.rows[0]) : null;
  }

  async function getStatus(userId) {
    ensurePostgresAvailable();
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) return null;
    const docs = await readPostgresStatuses({ userId: normalizedUserId }, { limit: 1 });
    return docs[0] || null;
  }

  async function listStatuses(filter = {}, options = {}) {
    ensurePostgresAvailable();
    return readPostgresStatuses(filter, options);
  }

  async function upsertStatus(userId, setFields = {}) {
    ensurePostgresAvailable();
    const existing =
      (await readPostgresStatuses({ userId: toLegacyId(userId) }, { limit: 1 }))[0]
      || {};
    const now = new Date();
    const doc = {
      ...existing,
      senderId: toLegacyId(userId),
      ...setFields,
      updatedAt: setFields.updatedAt || now,
    };
    await syncStatusDoc(doc, { force: true });
    const refreshed = await readPostgresStatuses({ userId: toLegacyId(userId) }, { limit: 1 });
    return refreshed[0] || doc;
  }

  async function findTaskByDate(userId, platform, botId, dateKey) {
    ensurePostgresAvailable();
    const normalizedUserId = toLegacyId(userId);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedBotId = toLegacyId(botId);
    const defaultBotOnly = !normalizedBotId;
    const docs = await readPostgresTasks(
      {
        userId: normalizedUserId,
        platform: normalizedPlatform,
        botId: normalizedBotId,
        defaultBotOnly,
        dateKey,
      },
      {
        sort: { createdAt: -1 },
        limit: 1,
      },
    );
    return docs[0] || null;
  }

  async function findLatestTaskByUser(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) return null;

    const docs = await listTasks(
      { userId: normalizedUserId },
      {
        sort: { createdAt: -1 },
        limit: 1,
      },
    );
    return docs[0] || null;
  }

  async function listTasks(filter = {}, options = {}) {
    ensurePostgresAvailable();
    return readPostgresTasks(filter, options);
  }

  async function insertTask(taskDoc) {
    ensurePostgresAvailable();
    const preparedDoc = {
      ...taskDoc,
      _id: toLegacyId(taskDoc?._id) || generateLegacyObjectIdString(),
      createdAt: taskDoc?.createdAt || new Date(),
      updatedAt: taskDoc?.updatedAt || new Date(),
    };
    await syncTaskDoc(preparedDoc, { force: true });
    return (await readPostgresTaskById(preparedDoc._id)) || preparedDoc;
  }

  async function updateTaskById(taskId, update, options = {}) {
    ensurePostgresAvailable();
    const existingDoc = await readPostgresTaskById(taskId);
    if (!existingDoc) {
      return { matchedCount: 0, modifiedCount: 0, document: null };
    }
    const normalizedUpdate =
      update && typeof update === "object" && !Array.isArray(update)
        ? Object.keys(update).some((key) => key.startsWith("$"))
          ? update
          : { $set: update }
        : { $set: {} };
    const nextDoc = { ...existingDoc };
    if (normalizedUpdate.$set && typeof normalizedUpdate.$set === "object") {
      Object.assign(nextDoc, normalizedUpdate.$set);
    }
    if (normalizedUpdate.$unset && typeof normalizedUpdate.$unset === "object") {
      Object.keys(normalizedUpdate.$unset).forEach((key) => delete nextDoc[key]);
    }
    nextDoc._id = toLegacyId(existingDoc._id) || toLegacyId(taskId);
    nextDoc.updatedAt = new Date();
    await syncTaskDoc(nextDoc, { force: true });
    const refreshedDoc = await readPostgresTaskById(nextDoc._id);
    return {
      matchedCount: 1,
      modifiedCount: 1,
      document: refreshedDoc || nextDoc,
    };
  }

  async function cancelActiveTasks(queryFilter = {}, setFields = {}) {
    ensurePostgresAvailable();
    const normalizedFilter = {
      userId: queryFilter?.userId,
      platform: queryFilter?.platform,
      botId: queryFilter?.botId,
      dateKey: queryFilter?.dateKey,
      activeOnly: true,
    };
    const docs = await listTasks(normalizedFilter, { limit: 5000 });
    if (docs.length === 0) {
      return { matchedCount: 0, modifiedCount: 0 };
    }
    let modifiedCount = 0;
    for (const doc of docs) {
      const nextDoc = {
        ...doc,
        ...setFields,
        _id: toLegacyId(doc._id),
        updatedAt: setFields.updatedAt || new Date(),
      };
      await syncTaskDoc(nextDoc, { force: true });
      modifiedCount += 1;
    }
    return { matchedCount: docs.length, modifiedCount };
  }

  async function getDueTasks(limit = 10) {
    return listTasks(
      {
        activeOnly: true,
        dueOnly: true,
        now: new Date(),
      },
      {
        sort: { nextScheduledAt: 1, createdAt: 1 },
        limit,
      },
    );
  }

  return {
    cancelActiveTasks,
    findLatestTaskByUser,
    findTaskByDate,
    getDueTasks,
    getStatus,
    insertTask,
    listStatuses,
    listTasks,
    updateTaskById,
    upsertStatus,
  };
}

module.exports = {
  createFollowUpRepository,
};
