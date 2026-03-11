const { isPostgresConfigured, query, withTransaction } = require("../../infra/postgres");
const { upsertPostgresBotDocument } = require("./postgresBotSync");
const {
  applyProjection,
  buildMongoIdQuery,
  escapeRegex,
  normalizeJson,
  normalizePlatform,
  safeStringify,
  toLegacyId,
  toObjectId,
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
    lastMessageAt: latestMessage.timestamp || new Date(),
    lastRole: latestMessage.role || "user",
    lastSource: latestMessage.source || null,
    lastPreview: preview,
    botName: latestMessage.botName || null,
  };
}

function buildMongoUserMatch(userId) {
  const normalizedUserId = toLegacyId(userId);
  if (!normalizedUserId) {
    return { senderId: null };
  }
  return {
    $or: [
      { senderId: normalizedUserId },
      { userId: normalizedUserId },
    ],
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

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeComparableHistory(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    _id: toLegacyId(doc._id),
    senderId: toLegacyId(doc.senderId || doc.userId),
    role: doc.role || "user",
    source: doc.source || null,
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId),
    timestamp: normalizeDate(doc.timestamp),
    content: normalizeJson(doc.content, null),
    instructionRefs: Array.isArray(doc.instructionRefs) ? doc.instructionRefs : [],
    instructionMeta: Array.isArray(doc.instructionMeta) ? doc.instructionMeta : [],
    orderExtractionRoundId: doc.orderExtractionRoundId || null,
    orderId: toLegacyId(doc.orderId),
  };
}

function normalizeComparableContext(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId),
    timestamp: normalizeDate(doc.timestamp || doc.createdAt || doc.updatedAt),
  };
}

function normalizeComparableUserSummary(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    _id: toLegacyId(doc._id),
    lastMessage: normalizeJson(doc.lastMessage, null),
    lastTimestamp: normalizeDate(doc.lastTimestamp),
    messageCount: Number(doc.messageCount || 0),
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId),
  };
}

function normalizeComparableActivityDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  return {
    senderId: toLegacyId(doc.senderId || doc.userId),
    role: doc.role || null,
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId),
    timestamp: normalizeDate(doc.timestamp || doc.createdAt),
  };
}

function createChatRepository({
  connectDB,
  dbName = "chatbot",
  runtimeConfig,
}) {
  const pgBotIdCache = new Map();

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
      runtimeConfig?.features?.postgresReadPrimaryChat && canUsePostgres(),
    );
  }

  async function getMongoDb() {
    const client = await connectDB();
    return client.db(dbName);
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
      console.warn(`[ChatRepository] Shadow read mismatch for ${label}`);
    }
  }

  async function resolvePgBotId(platform, botId, mongoDb) {
    const normalizedPlatform = normalizePlatform(platform);
    const legacyBotId = toLegacyId(botId);
    if (!legacyBotId) return null;

    const cacheKey = `${normalizedPlatform}:${legacyBotId}`;
    if (pgBotIdCache.has(cacheKey)) {
      return pgBotIdCache.get(cacheKey);
    }

    let result = await query(
      "SELECT id FROM bots WHERE platform = $1 AND legacy_bot_id = $2 LIMIT 1",
      [normalizedPlatform, legacyBotId],
    );

    if (result.rows[0]?.id) {
      pgBotIdCache.set(cacheKey, result.rows[0].id);
      return result.rows[0].id;
    }

    const botCollection = mongoDb.collection(
      normalizedPlatform === "line"
        ? "line_bots"
        : normalizedPlatform === "facebook"
          ? "facebook_bots"
          : normalizedPlatform === "instagram"
            ? "instagram_bots"
            : "whatsapp_bots",
    );
    const botDoc = await botCollection.findOne({
      $or: [buildMongoIdQuery(botId), buildMongoIdQuery(legacyBotId)],
    });
    if (!botDoc) return null;

    const pgBotId = await upsertPostgresBotDocument({ query }, normalizedPlatform, botDoc);
    pgBotIdCache.set(cacheKey, pgBotId);
    return pgBotId;
  }

  async function loadProfile(mongoDb, userId, platform) {
    const normalizedUserId = toLegacyId(userId);
    const normalizedPlatform = normalizePlatform(platform);
    const normalizeProfileDoc = (doc = {}) => ({
      displayName:
        doc.displayName ||
        doc.display_name ||
        doc?.profile_data?.displayName ||
        null,
      pictureUrl:
        doc.pictureUrl ||
        doc?.profile_data?.pictureUrl ||
        null,
      profileFetchDisabled:
        typeof doc.profileFetchDisabled === "boolean"
          ? doc.profileFetchDisabled
          : typeof doc?.profile_data?.profileFetchDisabled === "boolean"
            ? doc.profile_data.profileFetchDisabled
            : false,
      updatedAt: doc.updatedAt || doc.updated_at || doc?.profile_data?.updatedAt || null,
      createdAt: doc.createdAt || doc.created_at || doc?.profile_data?.createdAt || null,
    });

    async function readPgProfile() {
      const result = await query(
        `
          SELECT display_name, profile_data, created_at, updated_at
          FROM contacts
          WHERE legacy_contact_id = $1
            AND platform = $2
          LIMIT 1
        `,
        [normalizedUserId, normalizedPlatform],
      );
      return result.rows[0] ? normalizeProfileDoc(result.rows[0]) : null;
    }

    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPgProfile();
        if (pgDoc) return pgDoc;
      } catch (error) {
        console.warn(
          `[ChatRepository] Primary profile read failed for ${normalizedPlatform}:${normalizedUserId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const mongoDoc = (
      await mongoDb.collection("user_profiles").findOne(
        {
          userId: normalizedUserId,
          platform: normalizedPlatform,
        },
        {
          projection: {
            displayName: 1,
            pictureUrl: 1,
            profileFetchDisabled: 1,
            updatedAt: 1,
            createdAt: 1,
          },
        },
      )
    ) || {};

    if (shouldShadowRead()) {
      void readPgProfile()
        .then((pgDoc) =>
          startShadowCompare(
            `profile:${normalizedPlatform}:${normalizedUserId}`,
            mongoDoc,
            pgDoc || {},
            normalizeProfileDoc,
          ),
        )
        .catch((error) => {
          console.warn(
            `[ChatRepository] Shadow profile read failed for ${normalizedPlatform}:${normalizedUserId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function upsertPgContact(client, userId, platform, profile = {}) {
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
          profile_data = EXCLUDED.profile_data,
          updated_at = EXCLUDED.updated_at
        RETURNING id
      `,
      [
        normalizePlatform(platform),
        toLegacyId(userId),
        profile?.displayName || null,
        JSON.stringify(normalizeJson(profile, {})),
        profile?.createdAt || new Date(),
        profile?.updatedAt || profile?.createdAt || new Date(),
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
          stats = EXCLUDED.stats,
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
          orderId: messageDoc?.orderId
            ? toLegacyId(messageDoc.orderId)
            : null,
        }),
        messageDoc?.timestamp || new Date(),
      ],
    );
  }

  async function dualWriteMessages(savedDocs) {
    if (!shouldDualWrite() || savedDocs.length === 0) return;

    const primary = savedDocs[0];
    const userId = toLegacyId(primary?.senderId || primary?.userId);
    if (!userId) return;

    const platform = normalizePlatform(primary?.platform);
    const mongoDb = await getMongoDb();
    const profile = await loadProfile(mongoDb, userId, platform);
    const pgBotId = await resolvePgBotId(platform, primary?.botId, mongoDb);
    const legacyThreadKey = buildThreadKey(platform, primary?.botId, userId);
    const stats = buildThreadStats(savedDocs);
    const updatedAt =
      savedDocs[savedDocs.length - 1]?.timestamp || new Date();

    await withTransaction(async (client) => {
      const contactId = await upsertPgContact(client, userId, platform, profile);
      const threadId = await upsertPgThread(
        client,
        platform,
        pgBotId,
        contactId,
        legacyThreadKey,
        stats,
        updatedAt,
      );

      for (const messageDoc of savedDocs) {
        await insertPgMessage(
          client,
          { contactId, pgBotId, threadId },
          messageDoc,
        );
      }
    });
  }

  async function readMongoHistoryDocs(userId, options = {}) {
    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const sortDirection = normalizeSortDirection(options.sort, 1);
    let cursor = coll
      .find(buildMongoUserMatch(userId))
      .sort({ timestamp: sortDirection });

    if (Number.isFinite(options.limit) && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }

    return cursor.toArray();
  }

  function buildMongoBotQuery(filter = {}) {
    if (filter.defaultBotOnly) {
      return {
        $or: [
          { botId: null },
          { botId: "" },
          { botId: { $exists: false } },
        ],
      };
    }

    const normalizedBotId = toLegacyId(filter.botId);
    if (!normalizedBotId) return null;

    const candidates = [normalizedBotId];
    const objectId = toObjectId(normalizedBotId);
    if (objectId) candidates.push(objectId);
    return { botId: { $in: candidates } };
  }

  function buildMongoMessageFilter(filter = {}) {
    const conditions = [];
    const userId = toLegacyId(filter.userId);
    if (userId) {
      conditions.push(buildMongoUserMatch(userId));
    }

    const userIds = Array.isArray(filter.userIds)
      ? filter.userIds.map((value) => toLegacyId(value)).filter(Boolean)
      : [];
    if (userIds.length > 0) {
      conditions.push({
        $or: [
          { senderId: { $in: userIds } },
          { userId: { $in: userIds } },
        ],
      });
    }

    if (typeof filter.role === "string" && filter.role.trim()) {
      conditions.push({ role: filter.role.trim() });
    }

    if (typeof filter.source === "string" && filter.source.trim()) {
      conditions.push({ source: filter.source.trim() });
    } else {
      const sourceIn = Array.isArray(filter.sourceIn)
        ? filter.sourceIn
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
        : [];
      if (sourceIn.length > 0) {
        conditions.push({ source: { $in: sourceIn } });
      }
    }

    if (typeof filter.platform === "string" && filter.platform.trim()) {
      conditions.push({ platform: normalizePlatform(filter.platform) });
    }

    const botQuery = buildMongoBotQuery(filter);
    if (botQuery) {
      conditions.push(botQuery);
    }

    const timestampQuery = {};
    if (filter.start) timestampQuery.$gte = filter.start;
    if (filter.end) timestampQuery.$lte = filter.end;
    if (filter.before) timestampQuery.$lt = filter.before;
    if (Object.keys(timestampQuery).length > 0) {
      conditions.push({ timestamp: timestampQuery });
    }

    const contentRegex =
      typeof filter.contentRegex === "string" ? filter.contentRegex.trim() : "";
    if (contentRegex) {
      conditions.push({
        content: {
          $regex: escapeRegex(contentRegex),
          $options: "i",
        },
      });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
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

  async function readMongoLatestContext(userId) {
    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const doc = await coll.findOne(
      buildMongoUserMatch(userId),
      {
        sort: { timestamp: -1 },
        projection: { platform: 1, botId: 1, timestamp: 1 },
      },
    );
    if (!doc) return null;
    return {
      platform: normalizePlatform(doc.platform),
      botId: doc.botId || null,
      timestamp: doc.timestamp || null,
    };
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

  async function readMongoUserSummaries(options = {}) {
    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const limit =
      Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 50;
    const focusUserId = toLegacyId(options.focusUserId);

    const buildPipeline = (match = null, pipelineLimit = limit) => {
      const pipeline = [
        {
          $addFields: {
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
          },
        },
        { $match: { senderKey: { $nin: [null, ""] } } },
      ];

      if (match) {
        pipeline.push({ $match: { senderKey: match } });
      }

      pipeline.push(
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
        { $limit: pipelineLimit },
      );

      return pipeline;
    };

    const users = await coll.aggregate(buildPipeline()).toArray();
    if (!focusUserId) {
      return users;
    }

    const exists = users.some((user) => toLegacyId(user?._id) === focusUserId);
    if (exists) {
      return users;
    }

    const focusUsers = await coll.aggregate(buildPipeline(focusUserId, 1)).toArray();
    if (focusUsers.length === 0) {
      return users;
    }

    return [focusUsers[0], ...users].slice(0, limit);
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

    const result = await query(
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
        ORDER BY
          CASE
            WHEN $1::text IS NOT NULL AND l.legacy_contact_id = $1 THEN 0
            ELSE 1
          END,
          l.last_timestamp DESC NULLS LAST,
          l.legacy_contact_id ASC
        LIMIT $2
      `,
      [focusUserId, limit],
    );

    return result.rows.map((row) => hydratePostgresUserSummary(row));
  }

  function buildPostgresMessageFilter(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };
    const escapeLike = (value = "") =>
      String(value).replace(/[\\%_]/g, "\\$&");

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

  async function readMongoActivityDocs(filter = {}, options = {}) {
    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const projection =
      options.projection && typeof options.projection === "object"
        ? options.projection
        : {
          senderId: 1,
          userId: 1,
          timestamp: 1,
          platform: 1,
          botId: 1,
          role: 1,
        };
    let cursor = coll
      .find(buildMongoMessageFilter(filter), { projection })
      .sort(options.sort || { timestamp: 1, _id: 1 });

    const skip = normalizeSkip(options.skip, 0);
    if (skip > 0) {
      cursor = cursor.skip(skip);
    }

    if (Number.isFinite(options.limit) && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }

    return cursor.toArray();
  }

  async function readMongoActivityCount(filter = {}) {
    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    return coll.countDocuments(buildMongoMessageFilter(filter));
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

  async function readMongoDistinctUserIds(filter = {}) {
    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const result = await coll.aggregate([
      { $match: buildMongoMessageFilter(filter) },
      {
        $addFields: {
          userKey: {
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
        },
      },
      { $match: { userKey: { $nin: [null, ""] } } },
      { $group: { _id: "$userKey" } },
      { $sort: { _id: 1 } },
    ]).toArray();

    return result.map((row) => row._id).filter(Boolean);
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
    const docs = Array.isArray(messageDocs)
      ? messageDocs.filter(Boolean)
      : [];
    if (docs.length === 0) return [];

    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const result = await coll.insertMany(docs, { ordered: true });

    const savedDocs = docs.map((doc, index) => ({
      ...doc,
      _id: result.insertedIds[index] || doc._id,
    }));

    if (shouldDualWrite()) {
      await dualWriteMessages(savedDocs).catch((error) => {
        console.warn(
          "[ChatRepository] Dual-write failed:",
          error?.message || error,
        );
      });
    }

    return savedDocs;
  }

  async function insertMessage(messageDoc) {
    const [savedDoc] = await insertMessages([messageDoc]);
    return savedDoc || null;
  }

  async function findMessageById(messageId) {
    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPostgresMessageById(messageId);
        if (pgDoc) return pgDoc;
      } catch (error) {
        console.warn(
          `[ChatRepository] Primary message read failed for ${toLegacyId(messageId)}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const mongoDoc = await coll.findOne(buildMongoIdQuery(messageId));

    if (shouldShadowRead()) {
      void readPostgresMessageById(messageId)
        .then((pgDoc) =>
          startShadowCompare(
            `message:${toLegacyId(messageId)}`,
            mongoDoc,
            pgDoc,
            normalizeComparableHistory,
          ),
        )
        .catch((error) => {
          console.warn(
            `[ChatRepository] Shadow message read failed for ${toLegacyId(messageId)}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function hasMessages(filter = {}) {
    if (shouldReadPrimary()) {
      try {
        const rows = await readPostgresActivityDocs(filter, { limit: 1, sort: { timestamp: -1 } });
        return rows.length > 0;
      } catch (error) {
        console.warn(
          "[ChatRepository] Primary has-messages read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const mongoDoc = await coll.findOne(buildMongoMessageFilter(filter), {
      projection: { _id: 1 },
      sort: { timestamp: -1 },
    });
    const mongoValue = Boolean(mongoDoc);

    if (shouldShadowRead()) {
      void readPostgresActivityDocs(filter, { limit: 1, sort: { timestamp: -1 } })
        .then((rows) =>
          startShadowCompare(
            `hasMessages:${safeStringify(filter)}`,
            mongoValue,
            rows.length > 0,
          ),
        )
        .catch((error) => {
          console.warn(
            "[ChatRepository] Shadow has-messages read failed:",
            error?.message || error,
          );
        });
    }

    return mongoValue;
  }

  async function clearHistory(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) return;

    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    await coll.deleteMany(buildMongoUserMatch(normalizedUserId));

    if (canUsePostgres()) {
      await query(
        "DELETE FROM contacts WHERE legacy_contact_id = $1",
        [normalizedUserId],
      ).catch((error) => {
        console.warn(
          `[ChatRepository] Postgres clear history failed for ${normalizedUserId}:`,
          error?.message || error,
        );
      });
    }
  }

  async function listDistinctUserIds(filter = {}) {
    if (shouldReadPrimary()) {
      try {
        return await readPostgresDistinctUserIds(filter);
      } catch (error) {
        console.warn(
          "[ChatRepository] Primary distinct-user read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const mongoIds = await readMongoDistinctUserIds(filter);

    if (shouldShadowRead()) {
      void readPostgresDistinctUserIds(filter)
        .then((pgIds) =>
          startShadowCompare(
            `distinctUsers:${safeStringify(filter)}`,
            mongoIds,
            pgIds,
          ),
        )
        .catch((error) => {
          console.warn(
            "[ChatRepository] Shadow distinct-user read failed:",
            error?.message || error,
          );
        });
    }

    return mongoIds;
  }

  async function listActivityMessages(filter = {}, options = {}) {
    if (shouldReadPrimary()) {
      try {
        return await readPostgresActivityDocs(filter, options);
      } catch (error) {
        console.warn(
          "[ChatRepository] Primary activity read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const mongoDocs = await readMongoActivityDocs(filter, options);

    if (shouldShadowRead()) {
      void readPostgresActivityDocs(filter, options)
        .then((pgDocs) =>
          startShadowCompare(
            `activity:${safeStringify(filter)}`,
            mongoDocs,
            pgDocs,
            normalizeComparableActivityDoc,
          ),
        )
        .catch((error) => {
          console.warn(
            "[ChatRepository] Shadow activity read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function countActivityMessages(filter = {}) {
    if (shouldReadPrimary()) {
      try {
        return await readPostgresActivityCount(filter);
      } catch (error) {
        console.warn(
          "[ChatRepository] Primary activity-count read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const mongoCount = await readMongoActivityCount(filter);

    if (shouldShadowRead()) {
      void readPostgresActivityCount(filter)
        .then((pgCount) =>
          startShadowCompare(
            `activityCount:${safeStringify(filter)}`,
            mongoCount,
            pgCount,
          ),
        )
        .catch((error) => {
          console.warn(
            "[ChatRepository] Shadow activity-count read failed:",
            error?.message || error,
          );
        });
    }

    return mongoCount;
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

    const objectIds = normalizedMessageIds
      .map((messageId) => toObjectId(messageId))
      .filter(Boolean);
    const mongoDb = await getMongoDb();
    const coll = mongoDb.collection("chat_history");
    const mongoMatchConditions = [buildMongoUserMatch(normalizedUserId)];

    if (objectIds.length > 0) {
      mongoMatchConditions.push({ _id: { $in: objectIds } });
    } else {
      mongoMatchConditions.push({ _id: { $in: normalizedMessageIds } });
    }

    const updateDoc = {
      orderExtractionRoundId: extractionRoundId,
      orderExtractionMarkedAt: new Date(),
    };
    if (orderId) {
      const normalizedOrderId = toLegacyId(orderId);
      const objectId = toObjectId(normalizedOrderId);
      updateDoc.orderId = objectId || normalizedOrderId;
    }

    await coll.updateMany(
      mongoMatchConditions.length === 1
        ? mongoMatchConditions[0]
        : { $and: mongoMatchConditions },
      { $set: updateDoc },
    );

    if (!canUsePostgres()) return;

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
        updateDoc.orderExtractionMarkedAt.toISOString(),
        orderId ? toLegacyId(orderId) : null,
      ],
    ).catch((error) => {
      console.warn(
        `[ChatRepository] Postgres order-extraction mark failed for ${normalizedUserId}:`,
        error?.message || error,
      );
    });
  }

  async function getHistory(userId, options = {}) {
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPostgresHistoryDocs(userId, options);
        if (pgDocs.length > 0) {
          return pgDocs;
        }
      } catch (error) {
        console.warn(
          `[ChatRepository] Primary history read failed for ${toLegacyId(userId)}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const mongoDocs = await readMongoHistoryDocs(userId, options);

    if (shouldShadowRead()) {
      void readPostgresHistoryDocs(userId, options)
        .then((pgDocs) =>
          startShadowCompare(
            `history:${toLegacyId(userId)}`,
            mongoDocs,
            pgDocs,
            normalizeComparableHistory,
          ),
        )
        .catch((error) => {
          console.warn(
            `[ChatRepository] Shadow history read failed for ${toLegacyId(userId)}:`,
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function getLatestContext(userId) {
    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPostgresLatestContext(userId);
        if (pgDoc) return pgDoc;
      } catch (error) {
        console.warn(
          `[ChatRepository] Primary latest-context read failed for ${toLegacyId(userId)}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const mongoDoc = await readMongoLatestContext(userId);

    if (shouldShadowRead()) {
      void readPostgresLatestContext(userId)
        .then((pgDoc) =>
          startShadowCompare(
            `latestContext:${toLegacyId(userId)}`,
            mongoDoc,
            pgDoc,
            normalizeComparableContext,
          ),
        )
        .catch((error) => {
          console.warn(
            `[ChatRepository] Shadow latest-context read failed for ${toLegacyId(userId)}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function listUsers(options = {}) {
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPostgresUserSummaries(options);
        if (pgDocs.length > 0) {
          return pgDocs;
        }
      } catch (error) {
        console.warn(
          "[ChatRepository] Primary user-list read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const mongoDocs = await readMongoUserSummaries(options);

    if (shouldShadowRead()) {
      void readPostgresUserSummaries(options)
        .then((pgDocs) =>
          startShadowCompare(
            `users:${toLegacyId(options.focusUserId) || "default"}`,
            mongoDocs,
            pgDocs,
            normalizeComparableUserSummary,
          ),
        )
        .catch((error) => {
          console.warn(
            "[ChatRepository] Shadow user-list read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
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
