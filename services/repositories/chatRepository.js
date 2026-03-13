const { isPostgresConfigured, query, withTransaction } = require("../../infra/postgres");
const {
  applyProjection,
  normalizeJson,
  normalizePlatform,
  toLegacyId,
  toText,
} = require("./shared");

function buildThreadKey(platform, botId, userId) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedBotId = toLegacyId(botId) || "default";
  const normalizedUserId = toLegacyId(userId);
  return `${normalizedPlatform}:${normalizedBotId}:${normalizedUserId}`;
}

function buildThreadStats(messages = []) {
  const latestMessage = messages[messages.length - 1] || null;
  if (!latestMessage) return {};
  const preview = toText(latestMessage.content).slice(0, 500);
  return {
    messageCount: messages.length,
    lastMessageAt: latestMessage.timestamp || new Date(),
    lastRole: latestMessage.role || "user",
    lastSource: latestMessage.source || null,
    lastPreview: preview,
    botName: latestMessage.botName || null,
  };
}

function normalizeSortDirection(sort = {}, fallback = 1) {
  if (!sort || typeof sort !== "object") return fallback;
  const key = ["timestamp", "createdAt", "updatedAt"].find((field) =>
    Object.prototype.hasOwnProperty.call(sort, field),
  );
  if (!key) return fallback;
  return Number(sort[key]) >= 0 ? 1 : -1;
}

function normalizeSkip(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
}

function parsePositiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function createChatRepository({
  runtimeConfig,
}) {
  const pgBotIdCache = new Map();
  const userSummaryCacheTtlMs = parsePositiveInteger(
    process.env.CCAI_CHAT_USER_SUMMARY_CACHE_MS,
    5000,
  );
  const userSummaryRecentThreadScanLimit = parsePositiveInteger(
    process.env.CCAI_CHAT_USER_SUMMARY_SCAN_LIMIT,
    5000,
  );
  const userSummariesCache = {
    docs: [],
    updatedAt: 0,
  };
  const createGeneratedId = () =>
    `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  function ensurePostgresAvailable(operation) {
    if (!canUsePostgres()) {
      throw new Error(`postgres_chat_storage_not_configured:${operation}`);
    }
  }

  async function resolveBotRecordId(platform, botId) {
    const normalizedPlatform = normalizePlatform(platform);
    const legacyBotId = toLegacyId(botId);
    if (!legacyBotId) return null;

    const cacheKey = `${normalizedPlatform}:${legacyBotId}`;
    if (pgBotIdCache.has(cacheKey)) {
      return pgBotIdCache.get(cacheKey);
    }

    const result = await query(
      "SELECT id FROM bots WHERE platform = $1 AND legacy_bot_id = $2 LIMIT 1",
      [normalizedPlatform, legacyBotId],
    );
    const pgBotId = result.rows[0]?.id || null;
    pgBotIdCache.set(cacheKey, pgBotId);
    return pgBotId;
  }

  async function upsertPgContact(client, userId, platform, profile = {}) {
    const normalizedProfile = normalizeJson(profile, {});
    const hasProfilePayload =
      normalizedProfile
      && typeof normalizedProfile === "object"
      && Object.keys(normalizedProfile).length > 0;

    const result = await client.query(
      `
        INSERT INTO contacts (
          platform,
          legacy_contact_id,
          display_name,
          profile_data,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
        ON CONFLICT (platform, legacy_contact_id) DO UPDATE SET
          display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
          profile_data = CASE
            WHEN $7::boolean THEN EXCLUDED.profile_data
            ELSE contacts.profile_data
          END,
          updated_at = EXCLUDED.updated_at
        RETURNING id
      `,
      [
        normalizePlatform(platform),
        toLegacyId(userId),
        profile?.displayName || null,
        JSON.stringify(normalizedProfile),
        profile?.createdAt || new Date(),
        profile?.updatedAt || profile?.createdAt || new Date(),
        hasProfilePayload,
      ],
    );
    return result.rows[0].id;
  }

  async function upsertPgThread(
    client,
    platform,
    pgBotId,
    contactId,
    legacyThreadKey,
    stats,
    updatedAt,
  ) {
    const result = await client.query(
      `
        INSERT INTO threads (
          platform,
          bot_id,
          contact_id,
          legacy_thread_key,
          stats,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
        ON CONFLICT (legacy_thread_key) DO UPDATE SET
          bot_id = COALESCE(EXCLUDED.bot_id, threads.bot_id),
          stats = jsonb_set(
            COALESCE(threads.stats, '{}'::jsonb) || (EXCLUDED.stats - 'messageCount'),
            '{messageCount}',
            to_jsonb(
              GREATEST(
                CASE
                  WHEN COALESCE(threads.stats->>'messageCount', '') ~ '^[0-9]+$'
                    THEN (threads.stats->>'messageCount')::int
                  ELSE 0
                END +
                CASE
                  WHEN COALESCE(EXCLUDED.stats->>'messageCount', '') ~ '^[0-9]+$'
                    THEN (EXCLUDED.stats->>'messageCount')::int
                  ELSE 0
                END,
                0
              )
            ),
            true
          ),
          updated_at = EXCLUDED.updated_at
        RETURNING id
      `,
      [
        normalizePlatform(platform),
        pgBotId,
        contactId,
        legacyThreadKey,
        JSON.stringify(normalizeJson(stats, {})),
        updatedAt,
        updatedAt,
      ],
    );
    return result.rows[0].id;
  }

  async function insertPgMessage(client, context, messageDoc) {
    await client.query(
      `
        INSERT INTO messages (
          thread_id,
          contact_id,
          bot_id,
          legacy_message_id,
          direction,
          role,
          source,
          content_text,
          content,
          instruction_refs,
          instruction_meta,
          metadata,
          created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13
        )
        ON CONFLICT (legacy_message_id, created_at) DO NOTHING
      `,
      [
        context.threadId,
        context.contactId,
        context.pgBotId,
        toLegacyId(messageDoc?._id) || null,
        messageDoc?.role === "user" ? "inbound" : "outbound",
        messageDoc?.role || "user",
        messageDoc?.source || null,
        toText(messageDoc?.content),
        JSON.stringify(normalizeJson(messageDoc?.content, null)),
        JSON.stringify(normalizeJson(messageDoc?.instructionRefs, [])),
        JSON.stringify(normalizeJson(messageDoc?.instructionMeta, [])),
        JSON.stringify({
          botName: messageDoc?.botName || null,
          platform: normalizePlatform(messageDoc?.platform),
          senderId: toLegacyId(messageDoc?.senderId),
          assistantSource: messageDoc?.assistantSource || null,
          orderExtractionRoundId: messageDoc?.orderExtractionRoundId || null,
          orderExtractionMarkedAt: messageDoc?.orderExtractionMarkedAt || null,
          orderId: messageDoc?.orderId ? toLegacyId(messageDoc.orderId) : null,
        }),
        messageDoc?.timestamp || new Date(),
      ],
    );
  }

  function hydratePostgresMessage(row = {}) {
    const metadata =
      row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return {
      _id: row.legacy_message_id || row.message_row_id || null,
      senderId: row.legacy_contact_id || "",
      userId: row.legacy_contact_id || "",
      role: row.role || "user",
      content:
        typeof row.content === "undefined" || row.content === null
          ? row.content_text || ""
          : row.content,
      timestamp: row.created_at || new Date(),
      source: row.source || null,
      metadata: row.metadata || null,
      instructionRefs: Array.isArray(row.instruction_refs) ? row.instruction_refs : [],
      instructionMeta: Array.isArray(row.instruction_meta) ? row.instruction_meta : [],
      platform: normalizePlatform(row.platform),
      botId: row.legacy_bot_id || null,
      botName: metadata.botName || null,
      assistantSource: metadata.assistantSource || null,
      orderExtractionRoundId: metadata.orderExtractionRoundId || null,
      orderExtractionMarkedAt: metadata.orderExtractionMarkedAt || null,
      orderId: metadata.orderId || null,
    };
  }

  async function readPostgresHistoryDocs(userId, options = {}) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) return [];

    const sortDirection = normalizeSortDirection(options.sort, 1) >= 0
      ? "ASC"
      : "DESC";
    const params = [normalizedUserId];
    let limitSql = "";
    if (Number.isFinite(options.limit) && options.limit > 0) {
      params.push(options.limit);
      limitSql = `LIMIT $${params.length}`;
    }

    const result = await query(
      `
        SELECT
          m.id::text AS message_row_id,
          m.legacy_message_id,
          m.role,
          m.source,
          m.content_text,
          m.content,
          m.metadata,
          m.instruction_refs,
          m.instruction_meta,
          m.created_at,
          c.legacy_contact_id,
          t.platform,
          b.legacy_bot_id
        FROM messages m
        INNER JOIN contacts c ON c.id = m.contact_id
        INNER JOIN threads t ON t.id = m.thread_id
        LEFT JOIN bots b ON b.id = m.bot_id
        WHERE c.legacy_contact_id = $1
        ORDER BY m.created_at ${sortDirection}, m.id ${sortDirection}
        ${limitSql}
      `,
      params,
    );

    return result.rows.map((row) => hydratePostgresMessage(row));
  }

  async function readPostgresLatestContext(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) return null;

    const result = await query(
      `
        SELECT
          t.platform,
          b.legacy_bot_id,
          m.created_at
        FROM messages m
        INNER JOIN contacts c ON c.id = m.contact_id
        INNER JOIN threads t ON t.id = m.thread_id
        LEFT JOIN bots b ON b.id = m.bot_id
        WHERE c.legacy_contact_id = $1
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      `,
      [normalizedUserId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      platform: normalizePlatform(row.platform),
      botId: row.legacy_bot_id || null,
      timestamp: row.created_at || null,
    };
  }

  function hydratePostgresUserSummary(row = {}) {
    return {
      _id: row.legacy_contact_id || "",
      lastMessage:
        typeof row.last_message === "undefined" || row.last_message === null
          ? ""
          : row.last_message,
      lastTimestamp: row.last_timestamp || null,
      messageCount: Number(row.message_count || 0),
      platform: normalizePlatform(row.platform),
      botId: row.legacy_bot_id || null,
    };
  }

  async function readPostgresUserSummaries(options = {}) {
    const limit =
      Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 50;
    const focusUserId = toLegacyId(options.focusUserId) || null;
    const scanLimit = Math.max(userSummaryRecentThreadScanLimit, limit * 40);

    const result = await query(
      `
        WITH recent_threads AS (
          SELECT
            t.contact_id,
            t.platform,
            t.bot_id,
            t.stats,
            t.updated_at,
            t.id
          FROM threads t
          ORDER BY t.updated_at DESC, t.id DESC
          LIMIT $3
        ),
        latest_per_contact AS (
          SELECT DISTINCT ON (rt.contact_id)
            rt.contact_id,
            rt.platform,
            rt.bot_id,
            COALESCE(NULLIF(rt.stats->>'lastPreview', ''), '') AS last_message,
            CASE
              WHEN COALESCE(rt.stats->>'lastMessageAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
                THEN (rt.stats->>'lastMessageAt')::timestamptz
              ELSE rt.updated_at
            END AS last_timestamp,
            CASE
              WHEN COALESCE(rt.stats->>'messageCount', '') ~ '^[0-9]+$'
                THEN (rt.stats->>'messageCount')::int
              ELSE 0
            END AS message_count
          FROM recent_threads rt
          ORDER BY
            rt.contact_id,
            rt.updated_at DESC,
            rt.id DESC
        )
        SELECT
          c.legacy_contact_id,
          l.last_message,
          l.last_timestamp,
          l.message_count,
          l.platform,
          b.legacy_bot_id
        FROM latest_per_contact l
        INNER JOIN contacts c ON c.id = l.contact_id
        LEFT JOIN bots b ON b.id = l.bot_id
        ORDER BY
          CASE
            WHEN $1::text IS NOT NULL AND c.legacy_contact_id = $1 THEN 0
            ELSE 1
          END,
          l.last_timestamp DESC NULLS LAST,
          c.legacy_contact_id ASC
        LIMIT $2
      `,
      [focusUserId, limit, scanLimit],
    );

    const docs = result.rows.map((row) => hydratePostgresUserSummary(row));
    if (!focusUserId || docs.some((doc) => toLegacyId(doc?._id) === focusUserId)) {
      return docs;
    }

    const focusResult = await query(
      `
        SELECT
          c.legacy_contact_id,
          COALESCE(NULLIF(t.stats->>'lastPreview', ''), '') AS last_message,
          CASE
            WHEN COALESCE(t.stats->>'lastMessageAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
              THEN (t.stats->>'lastMessageAt')::timestamptz
            ELSE t.updated_at
          END AS last_timestamp,
          CASE
            WHEN COALESCE(t.stats->>'messageCount', '') ~ '^[0-9]+$'
              THEN (t.stats->>'messageCount')::int
            ELSE 0
          END AS message_count,
          t.platform,
          b.legacy_bot_id
        FROM threads t
        INNER JOIN contacts c ON c.id = t.contact_id
        LEFT JOIN bots b ON b.id = t.bot_id
        WHERE c.legacy_contact_id = $1
        ORDER BY t.updated_at DESC, t.id DESC
        LIMIT 1
      `,
      [focusUserId],
    );
    if (focusResult.rowCount === 0) {
      return docs;
    }
    const focusDoc = hydratePostgresUserSummary(focusResult.rows[0]);
    return [focusDoc, ...docs].slice(0, limit);
  }

  function buildPostgresMessageFilter(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };
    const escapeLike = (value = "") => String(value).replace(/[\\%_]/g, "\\$&");

    if (typeof filter.platform === "string" && filter.platform.trim()) {
      push("t.platform =", normalizePlatform(filter.platform));
    }

    if (typeof filter.role === "string" && filter.role.trim()) {
      push("m.role =", filter.role.trim());
    }

    if (typeof filter.source === "string" && filter.source.trim()) {
      push("m.source =", filter.source.trim());
    } else {
      const sourceIn = Array.isArray(filter.sourceIn)
        ? filter.sourceIn
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
        : [];
      if (sourceIn.length > 0) {
        params.push(sourceIn);
        conditions.push(`m.source = ANY($${params.length})`);
      }
    }

    const userId = toLegacyId(filter.userId);
    if (userId) {
      push("c.legacy_contact_id =", userId);
    }

    const userIds = Array.isArray(filter.userIds)
      ? filter.userIds.map((value) => toLegacyId(value)).filter(Boolean)
      : [];
    if (userIds.length > 0) {
      params.push(userIds);
      conditions.push(`c.legacy_contact_id = ANY($${params.length})`);
    }

    if (filter.defaultBotOnly) {
      conditions.push("t.bot_id IS NULL");
    } else {
      const botId = toLegacyId(filter.botId);
      if (botId) {
        push("COALESCE(b.legacy_bot_id, '') =", botId);
      }
    }

    if (filter.start) {
      push("m.created_at >=", filter.start);
    }
    if (filter.end) {
      push("m.created_at <=", filter.end);
    }
    if (filter.before) {
      push("m.created_at <", filter.before);
    }

    const contentRegex =
      typeof filter.contentRegex === "string" ? filter.contentRegex.trim() : "";
    if (contentRegex) {
      params.push(`%${escapeLike(contentRegex)}%`);
      conditions.push(
        `COALESCE(m.content_text, m.content::text, '') ILIKE $${params.length} ESCAPE '\\'`,
      );
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  async function readPostgresActivityDocs(filter = {}, options = {}) {
    const { whereSql, params } = buildPostgresMessageFilter(filter);
    const sortDirection = normalizeSortDirection(options.sort, 1) >= 0
      ? "ASC"
      : "DESC";
    let limitSql = "";
    let offsetSql = "";
    const queryParams = [...params];
    const skip = normalizeSkip(options.skip, 0);
    if (Number.isFinite(options.limit) && options.limit > 0) {
      queryParams.push(options.limit);
      limitSql = `LIMIT $${queryParams.length}`;
    }
    if (skip > 0) {
      queryParams.push(skip);
      offsetSql = `OFFSET $${queryParams.length}`;
    }

    const result = await query(
      `
        SELECT
          m.id::text AS message_row_id,
          m.legacy_message_id,
          m.role,
          m.source,
          m.content_text,
          m.content,
          m.metadata,
          m.instruction_refs,
          m.instruction_meta,
          m.created_at,
          c.legacy_contact_id,
          t.platform,
          b.legacy_bot_id
        FROM messages m
        INNER JOIN contacts c ON c.id = m.contact_id
        INNER JOIN threads t ON t.id = m.thread_id
        LEFT JOIN bots b ON b.id = m.bot_id
        ${whereSql}
        ORDER BY m.created_at ${sortDirection}, m.id ${sortDirection}
        ${limitSql}
        ${offsetSql}
      `,
      queryParams,
    );

    let docs = result.rows.map((row) => hydratePostgresMessage(row));
    const projection =
      options.projection && typeof options.projection === "object"
        ? options.projection
        : null;
    if (projection) {
      docs = docs.map((doc) => applyProjection(doc, projection));
    }

    return docs;
  }

  async function readPostgresActivityCount(filter = {}) {
    const { whereSql, params } = buildPostgresMessageFilter(filter);
    const result = await query(
      `
        SELECT COUNT(*)::bigint AS total
        FROM messages m
        INNER JOIN contacts c ON c.id = m.contact_id
        INNER JOIN threads t ON t.id = m.thread_id
        LEFT JOIN bots b ON b.id = m.bot_id
        ${whereSql}
      `,
      params,
    );

    return Number(result.rows[0]?.total || 0);
  }

  async function readPostgresDistinctUserIds(filter = {}) {
    const { whereSql, params } = buildPostgresMessageFilter(filter);
    const result = await query(
      `
        SELECT DISTINCT c.legacy_contact_id AS user_id
        FROM messages m
        INNER JOIN contacts c ON c.id = m.contact_id
        INNER JOIN threads t ON t.id = m.thread_id
        LEFT JOIN bots b ON b.id = m.bot_id
        ${whereSql}
        ORDER BY c.legacy_contact_id ASC
      `,
      params,
    );

    return result.rows
      .map((row) => toLegacyId(row.user_id))
      .filter(Boolean);
  }

  async function readPostgresMessageById(messageId) {
    const normalizedMessageId = toLegacyId(messageId);
    if (!normalizedMessageId) return null;

    const result = await query(
      `
        SELECT
          m.id::text AS message_row_id,
          m.legacy_message_id,
          m.role,
          m.source,
          m.content_text,
          m.content,
          m.metadata,
          m.instruction_refs,
          m.instruction_meta,
          m.created_at,
          c.legacy_contact_id,
          t.platform,
          b.legacy_bot_id
        FROM messages m
        INNER JOIN contacts c ON c.id = m.contact_id
        INNER JOIN threads t ON t.id = m.thread_id
        LEFT JOIN bots b ON b.id = m.bot_id
        WHERE m.legacy_message_id = $1 OR m.id::text = $1
        ORDER BY
          CASE WHEN m.legacy_message_id = $1 THEN 0 ELSE 1 END,
          m.created_at DESC,
          m.id DESC
        LIMIT 1
      `,
      [normalizedMessageId],
    );

    const row = result.rows[0];
    return row ? hydratePostgresMessage(row) : null;
  }

  async function insertMessages(messageDocs = []) {
    ensurePostgresAvailable("insertMessages");
    const docs = Array.isArray(messageDocs) ? messageDocs.filter(Boolean) : [];
    if (docs.length === 0) return [];

    const preparedDocs = docs.map((doc) => ({
      ...doc,
      _id: toLegacyId(doc?._id) || createGeneratedId(),
    }));

    const primary = preparedDocs[0];
    const userId = toLegacyId(primary?.senderId || primary?.userId);
    if (!userId) return preparedDocs;

    const platform = normalizePlatform(primary?.platform);
    const pgBotId = await resolveBotRecordId(platform, primary?.botId);
    const legacyThreadKey = buildThreadKey(platform, primary?.botId, userId);
    const stats = buildThreadStats(preparedDocs);
    const updatedAt = preparedDocs[preparedDocs.length - 1]?.timestamp || new Date();

    await withTransaction(async (client) => {
      const contactId = await upsertPgContact(client, userId, platform, {});
      const threadId = await upsertPgThread(
        client,
        platform,
        pgBotId,
        contactId,
        legacyThreadKey,
        stats,
        updatedAt,
      );

      for (const messageDoc of preparedDocs) {
        await insertPgMessage(client, { contactId, pgBotId, threadId }, messageDoc);
      }
    });

    return preparedDocs;
  }

  async function insertMessage(messageDoc) {
    const [savedDoc] = await insertMessages([messageDoc]);
    return savedDoc || null;
  }

  async function findMessageById(messageId) {
    ensurePostgresAvailable("findMessageById");
    return readPostgresMessageById(messageId);
  }

  async function hasMessages(filter = {}) {
    ensurePostgresAvailable("hasMessages");
    const rows = await readPostgresActivityDocs(filter, {
      limit: 1,
      sort: { timestamp: -1 },
    });
    return rows.length > 0;
  }

  async function clearHistory(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) return;
    ensurePostgresAvailable("clearHistory");
    await query("DELETE FROM contacts WHERE legacy_contact_id = $1", [normalizedUserId]);
    userSummariesCache.docs = userSummariesCache.docs.filter(
      (doc) => toLegacyId(doc?._id) !== normalizedUserId,
    );
    userSummariesCache.updatedAt = Date.now();
  }

  async function listDistinctUserIds(filter = {}) {
    ensurePostgresAvailable("listDistinctUserIds");
    return readPostgresDistinctUserIds(filter);
  }

  async function listActivityMessages(filter = {}, options = {}) {
    ensurePostgresAvailable("listActivityMessages");
    return readPostgresActivityDocs(filter, options);
  }

  async function countActivityMessages(filter = {}) {
    ensurePostgresAvailable("countActivityMessages");
    return readPostgresActivityCount(filter);
  }

  async function markMessagesAsOrderExtracted(
    userId,
    messageIds = [],
    extractionRoundId,
    orderId = null,
  ) {
    const normalizedUserId = toLegacyId(userId);
    const normalizedMessageIds = Array.isArray(messageIds)
      ? messageIds.map((messageId) => toLegacyId(messageId)).filter(Boolean)
      : [];
    if (!normalizedUserId || normalizedMessageIds.length === 0) {
      return;
    }

    ensurePostgresAvailable("markMessagesAsOrderExtracted");
    await query(
      `
        UPDATE messages m
        SET metadata = jsonb_strip_nulls(
          COALESCE(m.metadata, '{}'::jsonb) ||
          jsonb_build_object(
            'orderExtractionRoundId', $3::text,
            'orderExtractionMarkedAt', $4::text,
            'orderId', $5::text
          )
        )
        FROM contacts c
        WHERE m.contact_id = c.id
          AND c.legacy_contact_id = $1
          AND (
            m.legacy_message_id = ANY($2::text[])
            OR m.id::text = ANY($2::text[])
          )
      `,
      [
        normalizedUserId,
        normalizedMessageIds,
        extractionRoundId ? String(extractionRoundId) : null,
        new Date().toISOString(),
        orderId ? toLegacyId(orderId) : null,
      ],
    );
  }

  async function getHistory(userId, options = {}) {
    ensurePostgresAvailable("getHistory");
    return readPostgresHistoryDocs(userId, options);
  }

  async function getLatestContext(userId) {
    ensurePostgresAvailable("getLatestContext");
    return readPostgresLatestContext(userId);
  }

  function getCachedUserSummaries(options = {}, allowStale = false) {
    if (!Array.isArray(userSummariesCache.docs) || userSummariesCache.docs.length === 0) {
      return null;
    }

    const now = Date.now();
    if (
      !allowStale
      && userSummaryCacheTtlMs > 0
      && now - userSummariesCache.updatedAt > userSummaryCacheTtlMs
    ) {
      return null;
    }

    const limit =
      Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 50;
    const focusUserId = toLegacyId(options.focusUserId);
    const docs = [...userSummariesCache.docs];
    if (focusUserId) {
      const focusExists = docs.some((doc) => toLegacyId(doc?._id) === focusUserId);
      if (!focusExists && !allowStale) {
        return null;
      }
      docs.sort((left, right) => {
        const leftPriority = toLegacyId(left?._id) === focusUserId ? 0 : 1;
        const rightPriority = toLegacyId(right?._id) === focusUserId ? 0 : 1;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return 0;
      });
    }
    return docs.slice(0, limit);
  }

  async function listUsers(options = {}) {
    const cachedDocs = getCachedUserSummaries(options);
    if (cachedDocs) {
      return cachedDocs;
    }

    ensurePostgresAvailable("listUsers");
    try {
      const pgDocs = await readPostgresUserSummaries(options);
      if (Array.isArray(pgDocs) && pgDocs.length > 0) {
        userSummariesCache.docs = pgDocs;
        userSummariesCache.updatedAt = Date.now();
      }
      return pgDocs;
    } catch (error) {
      const staleCache = getCachedUserSummaries(options, true);
      if (staleCache) {
        return staleCache;
      }
      throw error;
    }
  }

  return {
    clearHistory,
    countActivityMessages,
    findMessageById,
    getHistory,
    getLatestContext,
    hasMessages,
    insertMessage,
    insertMessages,
    listActivityMessages,
    listDistinctUserIds,
    listUsers,
    markMessagesAsOrderExtracted,
  };
}

module.exports = {
  createChatRepository,
};
