const { isPostgresConfigured, query } = require("../../infra/postgres");
const { ObjectId } = require("mongodb");
const { resolvePgBotId } = require("./postgresRefs");
const {
  buildMongoIdQuery,
  normalizeJson,
  normalizePlatform,
  safeStringify,
  toLegacyId,
  toObjectId,
} = require("./shared");

function createFollowUpRepository({
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
        && (runtimeConfig?.features?.postgresReadPrimaryFollowUp || !canUseMongo()),
    );
  }

  async function getDb() {
    if (!canUseMongo()) {
      throw new Error("MongoDB is disabled");
    }
    const client = await connectDB();
    return client.db(dbName);
  }

  function normalizeBotFilter(botId, defaultBotOnly = false) {
    if (defaultBotOnly) {
      return { defaultBotOnly: true, botId: null };
    }
    const normalizedBotId = toLegacyId(botId);
    return { defaultBotOnly: false, botId: normalizedBotId || null };
  }

  function normalizeStatusComparable(doc) {
    if (!doc || typeof doc !== "object") return doc;
    return {
      senderId: toLegacyId(doc.senderId),
      platform: normalizePlatform(doc.platform),
      botId: toLegacyId(doc.botId),
      hasFollowUp: Boolean(doc.hasFollowUp),
      followUpReason:
        typeof doc.followUpReason === "string" ? doc.followUpReason : "",
      followUpUpdatedAt: doc.followUpUpdatedAt
        ? new Date(doc.followUpUpdatedAt).toISOString()
        : null,
      lastAnalyzedAt: doc.lastAnalyzedAt
        ? new Date(doc.lastAnalyzedAt).toISOString()
        : null,
    };
  }

  function normalizeTaskComparable(doc) {
    if (!doc || typeof doc !== "object") return doc;
    return {
      _id: toLegacyId(doc._id),
      userId: toLegacyId(doc.userId),
      platform: normalizePlatform(doc.platform),
      botId: toLegacyId(doc.botId),
      dateKey: doc.dateKey || null,
      canceled: Boolean(doc.canceled),
      completed: Boolean(doc.completed),
      cancelReason: doc.cancelReason || null,
      status: doc.status || null,
      nextScheduledAt: doc.nextScheduledAt
        ? new Date(doc.nextScheduledAt).toISOString()
        : null,
      nextRoundIndex:
        typeof doc.nextRoundIndex === "number" ? doc.nextRoundIndex : null,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    };
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
      console.warn(`[FollowUpRepository] Shadow read mismatch for ${label}`);
    }
  }

  async function syncStatusDoc(doc = {}, options = {}) {
    if (!doc) return null;
    if (!options.force && !shouldDualWrite()) return null;
    const platform =
      typeof doc?.platform === "string" && doc.platform.trim()
        ? normalizePlatform(doc.platform)
        : null;
    const pgBotId = await resolvePgBotId({ query }, platform, doc?.botId);
    await query(
      `
        INSERT INTO follow_up_status (
          platform,
          bot_id,
          legacy_contact_id,
          status,
          updated_at
        ) VALUES ($1,$2,$3,$4::jsonb,$5)
        ON CONFLICT (platform, bot_id, legacy_contact_id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
      `,
      [
        platform,
        pgBotId,
        toLegacyId(doc?.senderId),
        JSON.stringify(normalizeJson(doc, {})),
        doc?.lastAnalyzedAt || doc?.followUpUpdatedAt || doc?.updatedAt || new Date(),
      ],
    );
    return true;
  }

  async function syncTaskDoc(doc = {}, options = {}) {
    if (!doc) return null;
    if (!options.force && !shouldDualWrite()) return null;
    const platform =
      typeof doc?.platform === "string" && doc.platform.trim()
        ? normalizePlatform(doc.platform)
        : null;
    const pgBotId = await resolvePgBotId({ query }, platform, doc?.botId);
    const status = doc?.completed
      ? "completed"
      : doc?.canceled
        ? "canceled"
        : doc?.status || "pending";
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

  function buildMongoBotMatch(botId, defaultBotOnly = false) {
    if (defaultBotOnly) {
      return {
        $or: [
          { botId: null },
          { botId: "" },
          { botId: { $exists: false } },
        ],
      };
    }

    const normalizedBotId = toLegacyId(botId);
    if (!normalizedBotId) return null;
    const candidates = [normalizedBotId];
    const objectId = toObjectId(normalizedBotId);
    if (objectId) candidates.push(objectId);
    return { botId: { $in: candidates } };
  }

  function buildMongoStatusFilter(filter = {}) {
    const conditions = [];
    const userId = toLegacyId(filter.userId);
    if (userId) {
      conditions.push({ senderId: userId });
    }

    const userIds = Array.isArray(filter.userIds)
      ? filter.userIds.map((value) => toLegacyId(value)).filter(Boolean)
      : [];
    if (userIds.length > 0) {
      conditions.push({ senderId: { $in: userIds } });
    }

    if (typeof filter.platform === "string" && filter.platform.trim()) {
      conditions.push({ platform: normalizePlatform(filter.platform) });
    }

    const botMatch = buildMongoBotMatch(filter.botId, Boolean(filter.defaultBotOnly));
    if (botMatch) {
      conditions.push(botMatch);
    }

    if (typeof filter.hasFollowUp === "boolean") {
      conditions.push({ hasFollowUp: filter.hasFollowUp });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }

  function buildMongoTaskFilter(filter = {}) {
    const conditions = [];
    const userId = toLegacyId(filter.userId);
    if (userId) {
      conditions.push({ userId });
    }

    const userIds = Array.isArray(filter.userIds)
      ? filter.userIds.map((value) => toLegacyId(value)).filter(Boolean)
      : [];
    if (userIds.length > 0) {
      conditions.push({ userId: { $in: userIds } });
    }

    if (typeof filter.platform === "string" && filter.platform.trim()) {
      conditions.push({ platform: normalizePlatform(filter.platform) });
    }

    const botMatch = buildMongoBotMatch(filter.botId, Boolean(filter.defaultBotOnly));
    if (botMatch) {
      conditions.push(botMatch);
    }

    if (typeof filter.dateKey === "string" && filter.dateKey.trim()) {
      conditions.push({ dateKey: filter.dateKey.trim() });
    }

    if (filter.dateKeyRange && typeof filter.dateKeyRange === "object") {
      const range = {};
      if (filter.dateKeyRange.gte) range.$gte = filter.dateKeyRange.gte;
      if (filter.dateKeyRange.lte) range.$lte = filter.dateKeyRange.lte;
      if (Object.keys(range).length > 0) {
        conditions.push({ dateKey: range });
      }
    }

    if (filter.activeOnly) {
      conditions.push({
        canceled: { $ne: true },
        completed: { $ne: true },
      });
    }

    if (filter.dueOnly) {
      conditions.push({
        nextScheduledAt: { $lte: filter.now || new Date() },
      });
    }

    if (filter.nextScheduledAtNotNull) {
      conditions.push({ nextScheduledAt: { $ne: null } });
    }

    if (typeof filter.completed === "boolean") {
      conditions.push({ completed: filter.completed });
    }

    if (typeof filter.canceled === "boolean") {
      conditions.push({ canceled: filter.canceled });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }

  async function readMongoStatuses(filter = {}, options = {}) {
    if (!canUseMongo()) return [];
    const db = await getDb();
    let cursor = db.collection("follow_up_status")
      .find(buildMongoStatusFilter(filter))
      .sort(options.sort || { followUpUpdatedAt: -1, lastAnalyzedAt: -1 });

    if (Number.isFinite(options.limit) && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }

    return cursor.toArray();
  }

  async function readMongoTasks(filter = {}, options = {}) {
    if (!canUseMongo()) return [];
    const db = await getDb();
    let cursor = db.collection("follow_up_tasks")
      .find(buildMongoTaskFilter(filter))
      .sort(options.sort || { nextScheduledAt: 1, createdAt: -1 });

    if (Number.isFinite(options.limit) && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }

    return cursor.toArray();
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
      conditions.push("s.bot_id IS NULL");
    } else if (normalizedBot.botId) {
      push("COALESCE(b.legacy_bot_id, '') =", normalizedBot.botId);
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
          b.legacy_bot_id
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
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) return null;

    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresStatuses({ userId: normalizedUserId }, { limit: 1 });
        if (docs.length > 0 || !canUseMongo()) return docs[0] || null;
      } catch (error) {
        console.warn(
          `[FollowUpRepository] Primary status read failed for ${normalizedUserId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return null;
    }

    const db = await getDb();
    const mongoDoc = await db.collection("follow_up_status").findOne({ senderId: normalizedUserId });

    if (shouldShadowRead()) {
      void readPostgresStatuses({ userId: normalizedUserId }, { limit: 1 })
        .then((docs) =>
          startShadowCompare(
            `status:${normalizedUserId}`,
            mongoDoc,
            docs[0] || null,
            normalizeStatusComparable,
          ),
        )
        .catch((error) => {
          console.warn(
            `[FollowUpRepository] Shadow status read failed for ${normalizedUserId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function listStatuses(filter = {}, options = {}) {
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresStatuses(filter, options);
        if (docs.length > 0 || !canUseMongo()) {
          return docs;
        }
      } catch (error) {
        console.warn(
          "[FollowUpRepository] Primary status list failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const mongoDocs = await readMongoStatuses(filter, options);

    if (shouldShadowRead()) {
      void readPostgresStatuses(filter, options)
        .then((pgDocs) =>
          startShadowCompare(
            `statusList:${safeStringify(filter)}`,
            mongoDocs,
            pgDocs,
            normalizeStatusComparable,
          ),
        )
        .catch((error) => {
          console.warn(
            "[FollowUpRepository] Shadow status list failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function upsertStatus(userId, setFields = {}) {
    if (!canUseMongo()) {
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
      await syncStatusDoc(doc, { force: true }).catch((error) => {
        console.warn("[FollowUpRepository] Status write failed:", error?.message || error);
      });
      const refreshed = await readPostgresStatuses({ userId: toLegacyId(userId) }, { limit: 1 });
      return refreshed[0] || doc;
    }

    const db = await getDb();
    const coll = db.collection("follow_up_status");
    const result = await coll.findOneAndUpdate(
      { senderId: userId },
      { $set: { senderId: userId, ...setFields } },
      { upsert: true, returnDocument: "after" },
    );
    const doc = result?.value || (await coll.findOne({ senderId: userId }));
    await syncStatusDoc(doc).catch((error) => {
      console.warn("[FollowUpRepository] Status dual-write failed:", error?.message || error);
    });
    return doc;
  }

  async function findTaskByDate(userId, platform, botId, dateKey) {
    const normalizedUserId = toLegacyId(userId);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedBotId = toLegacyId(botId);
    const defaultBotOnly = !normalizedBotId;

    if (shouldReadPrimary()) {
      try {
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
        if (docs.length > 0 || !canUseMongo()) return docs[0] || null;
      } catch (error) {
        console.warn(
          `[FollowUpRepository] Primary task-by-date read failed for ${normalizedUserId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return null;
    }
    const db = await getDb();
    const mongoDoc = await db.collection("follow_up_tasks").findOne(
      {
        userId: normalizedUserId,
        platform: normalizedPlatform,
        botId: normalizedBotId || null,
        dateKey,
      },
      { sort: { createdAt: -1 } },
    );

    if (shouldShadowRead()) {
      void readPostgresTasks(
        {
          userId: normalizedUserId,
          platform: normalizedPlatform,
          botId: normalizedBotId,
          defaultBotOnly,
          dateKey,
        },
        { sort: { createdAt: -1 }, limit: 1 },
      )
        .then((docs) =>
          startShadowCompare(
            `taskByDate:${normalizedUserId}:${normalizedPlatform}:${normalizedBotId || "default"}:${dateKey}`,
            mongoDoc,
            docs[0] || null,
            normalizeTaskComparable,
          ),
        )
        .catch((error) => {
          console.warn(
            "[FollowUpRepository] Shadow task-by-date read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDoc;
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
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresTasks(filter, options);
        if (docs.length > 0 || !canUseMongo()) {
          return docs;
        }
      } catch (error) {
        console.warn(
          "[FollowUpRepository] Primary task list failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const mongoDocs = await readMongoTasks(filter, options);

    if (shouldShadowRead()) {
      void readPostgresTasks(filter, options)
        .then((pgDocs) =>
          startShadowCompare(
            `taskList:${safeStringify(filter)}`,
            mongoDocs,
            pgDocs,
            normalizeTaskComparable,
          ),
        )
        .catch((error) => {
          console.warn(
            "[FollowUpRepository] Shadow task list failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function insertTask(taskDoc) {
    if (!canUseMongo()) {
      const preparedDoc = {
        ...taskDoc,
        _id: toLegacyId(taskDoc?._id) || new ObjectId().toString(),
        createdAt: taskDoc?.createdAt || new Date(),
        updatedAt: taskDoc?.updatedAt || new Date(),
      };
      await syncTaskDoc(preparedDoc, { force: true }).catch((error) => {
        console.warn("[FollowUpRepository] Task write failed:", error?.message || error);
      });
      return (await readPostgresTaskById(preparedDoc._id)) || preparedDoc;
    }

    const db = await getDb();
    const coll = db.collection("follow_up_tasks");
    const result = await coll.insertOne(taskDoc);
    const savedDoc = { ...taskDoc, _id: result.insertedId };
    await syncTaskDoc(savedDoc).catch((error) => {
      console.warn("[FollowUpRepository] Task dual-write failed:", error?.message || error);
    });
    return savedDoc;
  }

  async function updateTaskById(taskId, update, options = {}) {
    if (!canUseMongo()) {
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
      await syncTaskDoc(nextDoc, { force: true }).catch((error) => {
        console.warn("[FollowUpRepository] Task update write failed:", error?.message || error);
      });
      const refreshedDoc = await readPostgresTaskById(nextDoc._id);
      return {
        matchedCount: 1,
        modifiedCount: 1,
        document: refreshedDoc || nextDoc,
      };
    }

    const db = await getDb();
    const coll = db.collection("follow_up_tasks");
    const filter = buildMongoIdQuery(taskId);
    const result = await coll.updateOne(filter, update, options);
    if (result.matchedCount === 0) {
      return { matchedCount: 0, modifiedCount: 0, document: null };
    }
    const updatedDoc = await coll.findOne(filter);
    await syncTaskDoc(updatedDoc).catch((error) => {
      console.warn("[FollowUpRepository] Task update dual-write failed:", error?.message || error);
    });
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      document: updatedDoc,
    };
  }

  async function cancelActiveTasks(queryFilter = {}, setFields = {}) {
    if (!canUseMongo()) {
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
        await syncTaskDoc(nextDoc, { force: true }).catch((error) => {
          console.warn(
            "[FollowUpRepository] Task cancel write failed:",
            error?.message || error,
          );
        });
        modifiedCount += 1;
      }
      return { matchedCount: docs.length, modifiedCount };
    }

    const db = await getDb();
    const coll = db.collection("follow_up_tasks");
    const filter = {
      ...queryFilter,
      canceled: { $ne: true },
      completed: { $ne: true },
    };
    const affectedIds = await coll
      .find(filter, { projection: { _id: 1 } })
      .toArray();

    const result = await coll.updateMany(filter, { $set: setFields });
    if (affectedIds.length > 0 && shouldDualWrite()) {
      await Promise.all(
        affectedIds.map((doc) =>
          coll.findOne({ _id: doc._id })
            .then((taskDoc) => syncTaskDoc(taskDoc))
            .catch((error) => {
              console.warn(
                "[FollowUpRepository] Task cancel dual-write failed:",
                error?.message || error,
              );
            }),
        ),
      );
    }
    return result;
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
