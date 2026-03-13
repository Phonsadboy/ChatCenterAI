const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  normalizePlatform,
  safeStringify,
  toLegacyId,
  warnPrimaryReadFailure,
} = require("./shared");

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStats(value = {}) {
  const stats = value && typeof value === "object" ? value : {};
  return {
    totalMessages: Number(stats.totalMessages || 0),
    userMessages: Number(stats.userMessages || 0),
    assistantMessages: Number(stats.assistantMessages || 0),
    firstMessageAt: stats.firstMessageAt || null,
    lastMessageAt: stats.lastMessageAt || null,
    durationMinutes: Number(stats.durationMinutes || 0),
  };
}

function normalizeThreadDoc(doc = {}) {
  return {
    _id: toLegacyId(doc.id || doc._id || doc.threadId || doc.thread_id),
    threadId: toLegacyId(doc.threadId || doc.thread_id),
    senderId: toLegacyId(doc.senderId || doc.sender_id),
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id) || null,
    botName:
      typeof doc.botName === "string"
        ? doc.botName
        : typeof doc.bot_name === "string"
          ? doc.bot_name
          : null,
    instructionRefs: normalizeArray(doc.instructionRefs || doc.instruction_refs),
    instructionMeta: normalizeArray(doc.instructionMeta || doc.instruction_meta),
    stats: normalizeStats(doc.stats),
    hasOrder: doc.hasOrder === true || doc.has_order === true,
    orderIds: normalizeArray(doc.orderIds || doc.order_ids),
    orderedProducts: normalizeArray(doc.orderedProducts || doc.ordered_products),
    orderStatus:
      typeof doc.orderStatus === "string"
        ? doc.orderStatus
        : typeof doc.order_status === "string"
          ? doc.order_status
          : null,
    totalOrderAmount: Number(doc.totalOrderAmount || doc.total_order_amount || 0),
    outcome:
      typeof doc.outcome === "string" && doc.outcome.trim()
        ? doc.outcome.trim()
        : "unknown",
    tags: normalizeArray(doc.tags),
    createdAt: doc.createdAt || doc.created_at || null,
    updatedAt: doc.updatedAt || doc.updated_at || null,
  };
}

function createConversationThreadRepository({
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

  function shouldReadPrimary() {
    return canUsePostgres();
  }

  async function getCollection() {
    if (!canUseMongo()) {
      throw new Error("MongoDB is disabled");
    }
    const client = await connectDB();
    return client.db(dbName).collection("conversation_threads");
  }

  function buildInstructionMongoQuery(instructionId, version = null) {
    const normalizedInstructionId = toLegacyId(instructionId);
    if (!normalizedInstructionId) return {};

    const parsedVersion = Number(version);
    if (Number.isInteger(parsedVersion) && parsedVersion > 0) {
      return {
        $or: [
          {
            instructionRefs: {
              $elemMatch: {
                instructionId: normalizedInstructionId,
                version: parsedVersion,
              },
            },
          },
          {
            instructionMeta: {
              $elemMatch: {
                instructionId: normalizedInstructionId,
                versionNumber: parsedVersion,
              },
            },
          },
          {
            instructionMeta: {
              $elemMatch: {
                instructionId: normalizedInstructionId,
                versionLabel: `v${parsedVersion}`,
              },
            },
          },
        ],
      };
    }

    return {
      $or: [
        { "instructionRefs.instructionId": normalizedInstructionId },
        { "instructionMeta.instructionId": normalizedInstructionId },
      ],
    };
  }

  function applyMongoFilters(queryFilter = {}, filters = {}) {
    const query = { ...queryFilter };

    if (Array.isArray(filters.outcome) && filters.outcome.length > 0) {
      query.outcome = { $in: filters.outcome };
    }
    if (filters.minUserMessages != null || filters.maxUserMessages != null) {
      query["stats.userMessages"] = {};
      if (filters.minUserMessages != null) {
        query["stats.userMessages"].$gte = Number(filters.minUserMessages);
      }
      if (filters.maxUserMessages != null) {
        query["stats.userMessages"].$lte = Number(filters.maxUserMessages);
      }
    }
    if (Array.isArray(filters.products) && filters.products.length > 0) {
      query.orderedProducts = { $in: filters.products };
    }
    if (Array.isArray(filters.tags) && filters.tags.length > 0) {
      query.tags = { $all: filters.tags };
    }
    if (filters.platform && filters.platform !== "all") {
      query.platform = normalizePlatform(filters.platform);
    }
    if (filters.botId) {
      query.botId = toLegacyId(filters.botId);
    }
    if (filters.dateFrom || filters.dateTo) {
      query["stats.lastMessageAt"] = {};
      if (filters.dateFrom) {
        query["stats.lastMessageAt"].$gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        query["stats.lastMessageAt"].$lte = new Date(filters.dateTo);
      }
    }

    return query;
  }

  function buildMongoSort(sortBy) {
    const sortMap = {
      newest: { "stats.lastMessageAt": -1 },
      oldest: { "stats.lastMessageAt": 1 },
      most_messages: { "stats.userMessages": -1 },
      highest_order: { totalOrderAmount: -1 },
    };
    return sortMap[sortBy] || sortMap.newest;
  }

  function buildPostgresMatch(instructionId, version = null, filters = {}) {
    const params = [];
    const conditions = [];
    const push = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const versionIntExpr = (jsonExpr) =>
      `CASE WHEN (${jsonExpr}) ~ '^[0-9]+$' THEN (${jsonExpr})::int ELSE NULL END`;

    const normalizedInstructionId = toLegacyId(instructionId);
    if (!normalizedInstructionId) {
      return { whereSql: "WHERE FALSE", params };
    }

    const instructionParam = push(normalizedInstructionId);
    const parsedVersion = Number(version);
    if (Number.isInteger(parsedVersion) && parsedVersion > 0) {
      const versionParam = push(parsedVersion);
      const versionLabelParam = push(`v${parsedVersion}`);
      conditions.push(`
        (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(instruction_refs, '[]'::jsonb)) AS ref
            WHERE ref->>'instructionId' = ${instructionParam}
              AND ${versionIntExpr("ref->>'version'")} = ${versionParam}
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(instruction_meta, '[]'::jsonb)) AS meta
            WHERE meta->>'instructionId' = ${instructionParam}
              AND (
                ${versionIntExpr("meta->>'versionNumber'")} = ${versionParam}
                OR meta->>'versionLabel' = ${versionLabelParam}
              )
          )
        )
      `);
    } else {
      conditions.push(`
        (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(instruction_refs, '[]'::jsonb)) AS ref
            WHERE ref->>'instructionId' = ${instructionParam}
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(instruction_meta, '[]'::jsonb)) AS meta
            WHERE meta->>'instructionId' = ${instructionParam}
          )
        )
      `);
    }

    if (Array.isArray(filters.outcome) && filters.outcome.length > 0) {
      const value = push(filters.outcome.map((item) => String(item).trim()).filter(Boolean));
      conditions.push(`outcome = ANY(${value}::text[])`);
    }
    if (filters.minUserMessages != null) {
      const value = push(Number(filters.minUserMessages));
      conditions.push(`
        COALESCE(${versionIntExpr("stats->>'userMessages'")}, 0) >= ${value}
      `);
    }
    if (filters.maxUserMessages != null) {
      const value = push(Number(filters.maxUserMessages));
      conditions.push(`
        COALESCE(${versionIntExpr("stats->>'userMessages'")}, 0) <= ${value}
      `);
    }
    if (Array.isArray(filters.products) && filters.products.length > 0) {
      const value = push(filters.products.map((item) => String(item).trim()).filter(Boolean));
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(ordered_products, '[]'::jsonb)) AS product(value)
          WHERE product.value = ANY(${value}::text[])
        )
      `);
    }
    if (Array.isArray(filters.tags) && filters.tags.length > 0) {
      const value = push(safeStringify(filters.tags.map((item) => String(item).trim()).filter(Boolean)));
      conditions.push(`COALESCE(tags, '[]'::jsonb) @> ${value}::jsonb`);
    }
    if (filters.platform && filters.platform !== "all") {
      const value = push(normalizePlatform(filters.platform));
      conditions.push(`platform = ${value}`);
    }
    if (filters.botId) {
      const value = push(toLegacyId(filters.botId));
      conditions.push(`COALESCE(legacy_bot_id, '') = ${value}`);
    }
    if (filters.dateFrom) {
      const value = push(new Date(filters.dateFrom));
      conditions.push(`
        CASE
          WHEN NULLIF(stats->>'lastMessageAt', '') IS NULL THEN NULL
          ELSE (stats->>'lastMessageAt')::timestamptz
        END >= ${value}
      `);
    }
    if (filters.dateTo) {
      const value = push(new Date(filters.dateTo));
      conditions.push(`
        CASE
          WHEN NULLIF(stats->>'lastMessageAt', '') IS NULL THEN NULL
          ELSE (stats->>'lastMessageAt')::timestamptz
        END <= ${value}
      `);
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  function buildPostgresSort(sortBy) {
    const lastMessageExpr = `
      CASE
        WHEN NULLIF(stats->>'lastMessageAt', '') IS NULL THEN updated_at
        ELSE (stats->>'lastMessageAt')::timestamptz
      END
    `;
    const userMessagesExpr = `
      COALESCE(
        CASE WHEN (stats->>'userMessages') ~ '^[0-9]+$'
          THEN (stats->>'userMessages')::int
          ELSE 0
        END,
        0
      )
    `;
    switch (sortBy) {
      case "oldest":
        return `${lastMessageExpr} ASC, thread_id ASC`;
      case "most_messages":
        return `${userMessagesExpr} DESC, ${lastMessageExpr} DESC, thread_id ASC`;
      case "highest_order":
        return `total_order_amount DESC, ${lastMessageExpr} DESC, thread_id ASC`;
      case "newest":
      default:
        return `${lastMessageExpr} DESC, thread_id ASC`;
    }
  }

  async function readPostgresThread(threadId) {
    const normalizedThreadId = toLegacyId(threadId);
    if (!normalizedThreadId) return null;
    const result = await query(
      `
        SELECT
          id::text AS id,
          thread_id,
          sender_id,
          platform,
          legacy_bot_id,
          bot_name,
          instruction_refs,
          instruction_meta,
          stats,
          has_order,
          order_ids,
          ordered_products,
          order_status,
          total_order_amount,
          outcome,
          tags,
          created_at,
          updated_at
        FROM conversation_threads
        WHERE thread_id = $1
        LIMIT 1
      `,
      [normalizedThreadId],
    );
    return result.rows[0] ? normalizeThreadDoc(result.rows[0]) : null;
  }

  async function writePostgresThread(thread = {}) {
    const normalized = normalizeThreadDoc(thread);
    if (!normalized.threadId || !normalized.senderId) {
      throw new Error("threadId and senderId are required");
    }
    const createdAt = normalized.createdAt || new Date();
    const updatedAt = normalized.updatedAt || new Date();
    await query(
      `
        INSERT INTO conversation_threads (
          thread_id,
          sender_id,
          platform,
          legacy_bot_id,
          bot_name,
          instruction_refs,
          instruction_meta,
          stats,
          has_order,
          order_ids,
          ordered_products,
          order_status,
          total_order_amount,
          outcome,
          tags,
          created_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15::jsonb,$16,$17
        )
        ON CONFLICT (thread_id) DO UPDATE SET
          sender_id = EXCLUDED.sender_id,
          platform = EXCLUDED.platform,
          legacy_bot_id = EXCLUDED.legacy_bot_id,
          bot_name = EXCLUDED.bot_name,
          instruction_refs = EXCLUDED.instruction_refs,
          instruction_meta = EXCLUDED.instruction_meta,
          stats = EXCLUDED.stats,
          has_order = EXCLUDED.has_order,
          order_ids = EXCLUDED.order_ids,
          ordered_products = EXCLUDED.ordered_products,
          order_status = EXCLUDED.order_status,
          total_order_amount = EXCLUDED.total_order_amount,
          outcome = EXCLUDED.outcome,
          tags = EXCLUDED.tags,
          updated_at = EXCLUDED.updated_at
      `,
      [
        normalized.threadId,
        normalized.senderId,
        normalized.platform,
        normalized.botId,
        normalized.botName,
        safeStringify(normalized.instructionRefs),
        safeStringify(normalized.instructionMeta),
        safeStringify(normalized.stats),
        normalized.hasOrder,
        safeStringify(normalized.orderIds),
        safeStringify(normalized.orderedProducts),
        normalized.orderStatus,
        normalized.totalOrderAmount,
        normalized.outcome,
        safeStringify(normalized.tags),
        createdAt,
        updatedAt,
      ],
    );
    return readPostgresThread(normalized.threadId);
  }

  async function listPostgresByInstruction(
    instructionId,
    version = null,
    filters = {},
    pagination = {},
    { disablePagination = false } = {},
  ) {
    const { whereSql, params } = buildPostgresMatch(instructionId, version, filters);
    const sortSql = buildPostgresSort(filters?.sortBy);
    const limit = disablePagination
      ? null
      : Math.min(200, Math.max(1, Number(pagination.limit) || 20));
    const offset = disablePagination
      ? null
      : Math.max(0, (Math.max(1, Number(pagination.page) || 1) - 1) * limit);
    const pagedParams = [...params];
    let pagingSql = "";
    if (!disablePagination) {
      pagedParams.push(limit);
      pagingSql += ` LIMIT $${pagedParams.length}`;
      pagedParams.push(offset);
      pagingSql += ` OFFSET $${pagedParams.length}`;
    }

    const [rowsResult, countResult] = await Promise.all([
      query(
        `
          SELECT
            id::text AS id,
            thread_id,
            sender_id,
            platform,
            legacy_bot_id,
            bot_name,
            instruction_refs,
            instruction_meta,
            stats,
            has_order,
            order_ids,
            ordered_products,
            order_status,
            total_order_amount,
            outcome,
            tags,
            created_at,
            updated_at
          FROM conversation_threads
          ${whereSql}
          ORDER BY ${sortSql}
          ${pagingSql}
        `,
        pagedParams,
      ),
      query(
        `
          SELECT COUNT(*)::int AS total_count
          FROM conversation_threads
          ${whereSql}
        `,
        params,
      ),
    ]);

    return {
      threads: rowsResult.rows.map((row) => normalizeThreadDoc(row)),
      totalCount: Number(countResult.rows[0]?.total_count || 0),
    };
  }

  async function listMongoByInstruction(
    instructionId,
    version = null,
    filters = {},
    pagination = {},
    { disablePagination = false } = {},
  ) {
    const coll = await getCollection();
    const queryFilter = applyMongoFilters(
      buildInstructionMongoQuery(instructionId, version),
      filters,
    );
    const sort = buildMongoSort(filters?.sortBy);
    const page = Math.max(1, Number(pagination.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(pagination.limit) || 20));
    const cursor = coll.find(queryFilter).sort(sort);
    if (!disablePagination) {
      cursor.skip((page - 1) * limit).limit(limit);
    }
    const [docs, totalCount] = await Promise.all([
      cursor.toArray(),
      coll.countDocuments(queryFilter),
    ]);
    return {
      threads: docs.map((doc) => normalizeThreadDoc(doc)),
      totalCount,
    };
  }

  async function getByThreadId(threadId) {
    const normalizedThreadId = toLegacyId(threadId);
    if (!normalizedThreadId) return null;

    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPostgresThread(normalizedThreadId);
        if (pgDoc || !canUseMongo()) {
          return pgDoc;
        }
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "ConversationThreadRepository",
          operation: "read",
          identifier: normalizedThreadId,
          canUseMongo: canUseMongo(),
          error,
        });
        if (!canUseMongo()) {
          return null;
        }
      }
    }

    if (!canUseMongo()) return null;
    const coll = await getCollection();
    const doc = await coll.findOne({ threadId: normalizedThreadId });
    return doc ? normalizeThreadDoc(doc) : null;
  }

  async function upsert(thread = {}) {
    const normalized = normalizeThreadDoc(thread);
    if (!normalized.threadId || !normalized.senderId) {
      throw new Error("threadId and senderId are required");
    }

    if (canUsePostgres()) {
      try {
        return await writePostgresThread(normalized);
      } catch (error) {
        if (!canUseMongo()) throw error;
        console.warn(
          "[ConversationThreadRepository] PostgreSQL upsert failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      throw new Error("ConversationThreadRepository requires PostgreSQL or MongoDB");
    }

    const coll = await getCollection();
    const createdAt = normalized.createdAt || new Date();
    const updatedAt = normalized.updatedAt || new Date();
    await coll.updateOne(
      { threadId: normalized.threadId },
      {
        $set: {
          threadId: normalized.threadId,
          senderId: normalized.senderId,
          platform: normalized.platform,
          botId: normalized.botId,
          botName: normalized.botName,
          instructionRefs: normalized.instructionRefs,
          instructionMeta: normalized.instructionMeta,
          stats: normalized.stats,
          hasOrder: normalized.hasOrder,
          orderIds: normalized.orderIds,
          orderedProducts: normalized.orderedProducts,
          orderStatus: normalized.orderStatus,
          totalOrderAmount: normalized.totalOrderAmount,
          outcome: normalized.outcome,
          tags: normalized.tags,
          updatedAt,
        },
        $setOnInsert: {
          createdAt,
        },
      },
      { upsert: true },
    );
    return getByThreadId(normalized.threadId);
  }

  async function updateFields(threadId, fields = {}) {
    const existing = await getByThreadId(threadId);
    if (!existing) return null;
    return upsert({
      ...existing,
      ...fields,
      threadId: existing.threadId,
      senderId: fields.senderId || existing.senderId,
      createdAt: existing.createdAt,
      updatedAt: fields.updatedAt || new Date(),
    });
  }

  async function listByInstruction(instructionId, version = null, filters = {}, pagination = {}) {
    if (shouldReadPrimary()) {
      try {
        return await listPostgresByInstruction(instructionId, version, filters, pagination);
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "ConversationThreadRepository",
          operation: "read",
          identifier: toLegacyId(instructionId),
          canUseMongo: canUseMongo(),
          error,
        });
        if (!canUseMongo()) {
          return { threads: [], totalCount: 0 };
        }
      }
    }

    if (!canUseMongo()) {
      return { threads: [], totalCount: 0 };
    }

    return listMongoByInstruction(instructionId, version, filters, pagination);
  }

  async function listAllByInstruction(instructionId, version = null, filters = {}) {
    if (shouldReadPrimary()) {
      try {
        const result = await listPostgresByInstruction(
          instructionId,
          version,
          filters,
          {},
          { disablePagination: true },
        );
        return result.threads;
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "ConversationThreadRepository",
          operation: "read",
          identifier: toLegacyId(instructionId),
          canUseMongo: canUseMongo(),
          error,
        });
        if (!canUseMongo()) {
          return [];
        }
      }
    }

    if (!canUseMongo()) return [];
    const result = await listMongoByInstruction(
      instructionId,
      version,
      filters,
      {},
      { disablePagination: true },
    );
    return result.threads;
  }

  async function ensureIndexes() {
    if (!canUseMongo()) {
      return;
    }
    const coll = await getCollection();
    try {
      await coll.createIndex({ threadId: 1 }, { unique: true });
      await coll.createIndex({
        "instructionRefs.instructionId": 1,
        "instructionRefs.version": 1,
        updatedAt: -1,
      });
      await coll.createIndex({
        "instructionMeta.instructionId": 1,
        "instructionMeta.versionNumber": 1,
        updatedAt: -1,
      });
      await coll.createIndex({ senderId: 1, botId: 1, platform: 1 });
      await coll.createIndex({ outcome: 1 });
      await coll.createIndex({ "stats.userMessages": 1 });
      await coll.createIndex({ tags: 1 });
      await coll.createIndex({ orderedProducts: 1 });
    } catch (error) {
      console.warn(
        "[ConversationThreadRepository] Mongo index creation warning:",
        error?.message || error,
      );
    }
  }

  return {
    ensureIndexes,
    getByThreadId,
    listAllByInstruction,
    listByInstruction,
    normalizeThreadDoc,
    updateFields,
    upsert,
  };
}

module.exports = {
  createConversationThreadRepository,
  normalizeThreadDoc,
};
