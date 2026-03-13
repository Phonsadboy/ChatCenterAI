const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  normalizePlatform,
  toLegacyId,
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

function createConversationThreadRepository() {
  function ensurePostgres() {
    if (!isPostgresConfigured()) {
      throw new Error("conversation_thread_storage_requires_postgres");
    }
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
      conditions.push(`COALESCE(${versionIntExpr("stats->>'userMessages'")}, 0) >= ${value}`);
    }
    if (filters.maxUserMessages != null) {
      const value = push(Number(filters.maxUserMessages));
      conditions.push(`COALESCE(${versionIntExpr("stats->>'userMessages'")}, 0) <= ${value}`);
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
      const value = push(filters.tags.map((item) => String(item).trim()).filter(Boolean));
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM unnest(${value}::text[]) AS tag(value)
          WHERE NOT COALESCE(tags, '[]'::jsonb) ? tag.value
        ) = FALSE
      `);
    }
    if (filters.platform && filters.platform !== "all") {
      const value = push(normalizePlatform(filters.platform));
      conditions.push(`platform = ${value}`);
    }
    if (filters.botId) {
      const value = push(toLegacyId(filters.botId));
      conditions.push(`legacy_bot_id = ${value}`);
    }
    if (filters.dateFrom) {
      const value = push(filters.dateFrom);
      conditions.push(`COALESCE((stats->>'lastMessageAt')::timestamptz, updated_at) >= ${value}`);
    }
    if (filters.dateTo) {
      const value = push(filters.dateTo);
      conditions.push(`COALESCE((stats->>'lastMessageAt')::timestamptz, updated_at) <= ${value}`);
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  function buildOrderClause(sortBy) {
    const sortMap = {
      newest: "COALESCE((stats->>'lastMessageAt')::timestamptz, updated_at) DESC, id DESC",
      oldest: "COALESCE((stats->>'lastMessageAt')::timestamptz, updated_at) ASC, id ASC",
      most_messages: "COALESCE((stats->>'userMessages')::int, 0) DESC, id DESC",
      highest_order: "COALESCE(total_order_amount, 0) DESC, id DESC",
    };
    return sortMap[sortBy] || sortMap.newest;
  }

  async function readPostgresThread(threadId) {
    ensurePostgres();
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
    ensurePostgres();
    const normalized = normalizeThreadDoc(thread);
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
        JSON.stringify(normalized.instructionRefs),
        JSON.stringify(normalized.instructionMeta),
        JSON.stringify(normalized.stats),
        normalized.hasOrder,
        JSON.stringify(normalized.orderIds),
        JSON.stringify(normalized.orderedProducts),
        normalized.orderStatus,
        normalized.totalOrderAmount,
        normalized.outcome,
        JSON.stringify(normalized.tags),
        createdAt,
        updatedAt,
      ],
    );
    return readPostgresThread(normalized.threadId);
  }

  async function listPostgresByInstruction(instructionId, version = null, filters = {}, pagination = {}, options = {}) {
    ensurePostgres();
    const { whereSql, params } = buildPostgresMatch(instructionId, version, filters);
    const disablePagination = options?.disablePagination === true;
    const limit = Math.max(1, Number(pagination.limit) || 20);
    const skip = Math.max(0, Number(pagination.skip) || 0);
    const orderClause = buildOrderClause(pagination.sortBy);
    const pageSql = disablePagination ? "" : `LIMIT ${limit} OFFSET ${skip}`;
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
        ${whereSql}
        ORDER BY ${orderClause}
        ${pageSql}
      `,
      params,
    );
    const countResult = await query(
      `SELECT COUNT(*)::int AS count FROM conversation_threads ${whereSql}`,
      params,
    );
    return {
      threads: result.rows.map((row) => normalizeThreadDoc(row)),
      totalCount: countResult.rows[0]?.count || 0,
    };
  }

  async function getByThreadId(threadId) {
    return readPostgresThread(threadId);
  }

  async function upsert(thread = {}) {
    const normalized = normalizeThreadDoc(thread);
    if (!normalized.threadId || !normalized.senderId) {
      throw new Error("threadId and senderId are required");
    }
    return writePostgresThread(normalized);
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
    return listPostgresByInstruction(instructionId, version, filters, pagination);
  }

  async function listAllByInstruction(instructionId, version = null, filters = {}) {
    const result = await listPostgresByInstruction(
      instructionId,
      version,
      filters,
      {},
      { disablePagination: true },
    );
    return result.threads;
  }

  async function ensureIndexes() {
    return;
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
