"use strict";

const { finished } = require("stream/promises");

let mongodb;
try {
  mongodb = require("mongodb");
} catch (error) {
  console.error(
    "[mongo-postgres-migration] missing mongodb package. Install it in a temp prefix and run with NODE_PATH, e.g. `npm install --prefix /tmp/chatcenterai-migration-tools mongodb@6.21.0`.",
  );
  throw error;
}

const { GridFSBucket, MongoClient } = mongodb;
const {
  createMigrationContext,
  normalizeForJson,
  resolveAppDocumentId,
  serializeDocId,
} = require("./lib/migrationContext");

const DEFAULT_BATCH_SIZE = Math.max(
  1,
  Number.parseInt(process.env.MIGRATION_BATCH_SIZE || "500", 10) || 500,
);
const PROGRESS_EVERY = Math.max(
  1,
  Number.parseInt(process.env.MIGRATION_PROGRESS_EVERY || "1000", 10) || 1000,
);
const GRIDFS_BUCKETS = [
  { bucketName: "instructionAssets", scope: "instruction_assets" },
  { bucketName: "followupAssets", scope: "follow_up_assets" },
  { bucketName: "broadcastAssets", scope: "broadcast_assets" },
];
const SKIP_COLLECTIONS = new Set(["chat_history"]);

function parseArgs(argv) {
  const args = {
    verifyOnly: argv.includes("--verify-only"),
    migrateOnly: argv.includes("--migrate-only"),
    chatHistoryWindow: (process.env.MIGRATION_CHAT_HISTORY_WINDOW || "all").trim() || "all",
    chatHistorySince: (process.env.MIGRATION_CHAT_HISTORY_SINCE || "").trim(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--chat-history-window") {
      args.chatHistoryWindow = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--chat-history-since") {
      args.chatHistorySince = argv[index + 1] || "";
      index += 1;
    }
  }
  if (!["all", "latest-month"].includes(args.chatHistoryWindow)) {
    throw new Error("--chat-history-window must be all or latest-month");
  }
  return args;
}

function getMongoUri() {
  return (
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_PUBLIC_URL ||
    process.env.MONGO_URL ||
    ""
  ).trim();
}

function getMongoDatabaseName() {
  const configured = (process.env.MONGODB_DATABASE || process.env.MONGO_DATABASE || "").trim();
  if (configured) return configured;
  return "chatbot";
}

function isGridFsCollection(collectionName) {
  return GRIDFS_BUCKETS.some(({ bucketName }) =>
    collectionName === `${bucketName}.files` ||
    collectionName === `${bucketName}.chunks`
  );
}

function shouldMigrateCollection(collectionName) {
  if (!collectionName || collectionName.startsWith("system.")) return false;
  if (SKIP_COLLECTIONS.has(collectionName)) return false;
  if (isGridFsCollection(collectionName)) return false;
  if (collectionName.endsWith(".files") || collectionName.endsWith(".chunks")) {
    return false;
  }
  return true;
}

function toDateOrNull(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function objectIdTimestamp(value) {
  if (value && typeof value.getTimestamp === "function") {
    const timestamp = value.getTimestamp();
    if (timestamp instanceof Date && !Number.isNaN(timestamp.getTime())) {
      return timestamp;
    }
  }
  return null;
}

function resolveCreatedAt(doc = {}) {
  return (
    toDateOrNull(doc.createdAt) ||
    toDateOrNull(doc.created_at) ||
    toDateOrNull(doc.timestamp) ||
    objectIdTimestamp(doc._id) ||
    new Date()
  );
}

function resolveUpdatedAt(doc = {}, createdAt = new Date()) {
  return (
    toDateOrNull(doc.updatedAt) ||
    toDateOrNull(doc.updated_at) ||
    toDateOrNull(doc.timestamp) ||
    createdAt
  );
}

function normalizeMessageDoc(doc = {}) {
  const next = { ...doc };
  if (
    (next.senderId === null || typeof next.senderId === "undefined" || next.senderId === "") &&
    next.userId !== null &&
    typeof next.userId !== "undefined" &&
    next.userId !== ""
  ) {
    next.senderId = String(next.userId);
  }
  return next;
}

function safeJsonParse(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return null;
  }
}

function serializeContent(rawValue) {
  if (typeof rawValue === "string") {
    return {
      contentText: rawValue,
      contentJson: safeJsonParse(rawValue),
    };
  }
  if (typeof rawValue === "undefined") {
    return { contentText: "", contentJson: null };
  }
  return {
    contentText: JSON.stringify(rawValue),
    contentJson: rawValue,
  };
}

function hasChatUserId(doc = {}) {
  return !!(
    (typeof doc.senderId === "string" && doc.senderId.trim()) ||
    (typeof doc.userId === "string" && doc.userId.trim()) ||
    (doc.senderId && typeof doc.senderId.toString === "function" && doc.senderId.toString().trim()) ||
    (doc.userId && typeof doc.userId.toString === "function" && doc.userId.toString().trim())
  );
}

function monthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

function addUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
}

function chatPartitionName(month) {
  return `chat_messages_${month.toISOString().slice(0, 7).replace("-", "_")}`;
}

function escapePgLiteral(value) {
  return String(value).replace(/'/g, "''");
}

async function resolveChatHistoryScope(mongoDb, args = {}) {
  if (args.chatHistorySince) {
    const start = new Date(args.chatHistorySince);
    if (Number.isNaN(start.getTime())) {
      throw new Error(`Invalid --chat-history-since value: ${args.chatHistorySince}`);
    }
    return {
      filter: { timestamp: { $gte: start } },
      start,
      end: null,
      mode: "since",
      description: `since ${start.toISOString()}`,
    };
  }

  if (args.chatHistoryWindow === "latest-month") {
    const [range] = await mongoDb
      .collection("chat_history")
      .aggregate([
        { $match: { timestamp: { $type: "date" } } },
        { $group: { _id: null, maxTimestamp: { $max: "$timestamp" } } },
      ])
      .toArray();
    const maxTimestamp = toDateOrNull(range?.maxTimestamp);
    if (!maxTimestamp) {
      console.warn(
        "[mongo-postgres-migration] chat_history latest-month scope found no dated messages; falling back to all chat_history",
      );
      return { filter: {}, start: null, end: null, mode: "all", description: "all" };
    }
    const start = monthStart(maxTimestamp);
    const end = addUtcMonth(start);
    return {
      filter: { timestamp: { $gte: start, $lt: end } },
      start,
      end,
      mode: "latest-month",
      description: `${start.toISOString()} to ${end.toISOString()}`,
    };
  }

  return { filter: {}, start: null, end: null, mode: "all", description: "all" };
}

async function streamToBuffer(stream) {
  const chunks = [];
  stream.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  await finished(stream);
  return Buffer.concat(chunks);
}

async function fetchCollectionNames(mongoDb) {
  const collections = await mongoDb.listCollections({}, { nameOnly: true }).toArray();
  return collections.map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

async function upsertAppDocumentBatch(context, rows) {
  if (!rows.length) return;

  const uniqueRows = Array.from(
    rows
      .reduce((map, row) => {
        map.set(`${row.collectionName}\u0000${row.documentId}`, row);
        return map;
      }, new Map())
      .values(),
  );

  const params = [];
  const valueSql = uniqueRows.map((row, index) => {
    const base = index * 5;
    params.push(
      row.collectionName,
      row.documentId,
      JSON.stringify(row.payload || {}),
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}::jsonb, $${base + 4}::timestamptz, $${base + 5}::timestamptz)`;
  });

  await context.postgresRuntime.query(
    `
      INSERT INTO app_documents (
        collection_name,
        document_id,
        payload,
        created_at,
        updated_at
      ) VALUES ${valueSql.join(", ")}
      ON CONFLICT (collection_name, document_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
    `,
    params,
  );
}

async function findDuplicateDocumentIds(mongoDb, collectionName) {
  const counts = new Map();
  const cursor = mongoDb.collection(collectionName).find({}, {
    projection: { _id: 1, key: 1, userId: 1, platform: 1, senderId: 1, botId: 1 },
  });
  for await (const doc of cursor) {
    const documentId =
      resolveAppDocumentId(collectionName, doc) || serializeDocId(doc._id);
    counts.set(documentId, (counts.get(documentId) || 0) + 1);
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([documentId]) => documentId),
  );
}

async function migrateRegularCollections(mongoDb, context, collectionNames) {
  const migrated = {};
  for (const collectionName of collectionNames.filter(shouldMigrateCollection)) {
    const duplicateIds = await findDuplicateDocumentIds(mongoDb, collectionName);
    const cursor = mongoDb.collection(collectionName).find({}, { batchSize: DEFAULT_BATCH_SIZE });
    let rows = [];
    let count = 0;
    let duplicateSourceDocs = 0;

    for await (const doc of cursor) {
      const documentId =
        resolveAppDocumentId(collectionName, doc) || serializeDocId(doc._id);
      if (!documentId) {
        throw new Error(`Unable to resolve document id for ${collectionName}`);
      }
      const createdAt = resolveCreatedAt(doc);
      rows.push({
        collectionName,
        documentId,
        payload: normalizeForJson(doc),
        createdAt,
        updatedAt: resolveUpdatedAt(doc, createdAt),
      });
      if (duplicateIds.has(documentId)) {
        rows.push({
          collectionName: `${collectionName}__source_duplicates`,
          documentId: serializeDocId(doc._id) || `${documentId}:${duplicateSourceDocs + 1}`,
          payload: {
            ...normalizeForJson(doc),
            _sourceCollectionName: collectionName,
            _resolvedDocumentId: documentId,
          },
          createdAt,
          updatedAt: resolveUpdatedAt(doc, createdAt),
        });
        duplicateSourceDocs += 1;
      }
      count += 1;
      if (rows.length >= DEFAULT_BATCH_SIZE) {
        await upsertAppDocumentBatch(context, rows);
        rows = [];
      }
      if (count % PROGRESS_EVERY === 0) {
        console.log(`[mongo-postgres-migration] ${collectionName}: ${count}`);
      }
    }

    await upsertAppDocumentBatch(context, rows);
    migrated[collectionName] = { source: count, duplicateSourceDocs };
    console.log(
      `[mongo-postgres-migration] ${collectionName}: migrated ${count}, duplicate_source_docs ${duplicateSourceDocs}`,
    );
  }
  return migrated;
}

async function migrateChatHistory(mongoDb, context, args) {
  const exists = (await fetchCollectionNames(mongoDb)).includes("chat_history");
  if (!exists) return { migrated: 0, preservedWithoutUser: 0 };

  if (process.env.MIGRATION_MIRROR_CHAT === "true") {
    return migrateChatHistoryWithMirror(mongoDb, context, args);
  }

  const scope = await resolveChatHistoryScope(mongoDb, args);
  console.log(`[mongo-postgres-migration] chat_history scope ${scope.mode}: ${scope.description}`);
  await ensureChatPartitionsForSourceRange(mongoDb, context, scope.filter);
  const cursor = mongoDb
    .collection("chat_history")
    .find(scope.filter, { batchSize: DEFAULT_BATCH_SIZE })
    .sort({ timestamp: 1, _id: 1 });
  let migrated = 0;
  let preservedWithoutUser = 0;
  let chatRows = [];
  let unmigratedRows = [];

  for await (const rawDoc of cursor) {
    const doc = normalizeMessageDoc(rawDoc);
    if (!hasChatUserId(doc)) {
      const documentId = serializeDocId(doc._id);
      const createdAt = resolveCreatedAt(doc);
      unmigratedRows.push({
        collectionName: "chat_history_unmigrated",
        documentId,
        payload: normalizeForJson(doc),
        createdAt,
        updatedAt: resolveUpdatedAt(doc, createdAt),
      });
      preservedWithoutUser += 1;
      if (unmigratedRows.length >= DEFAULT_BATCH_SIZE) {
        await upsertAppDocumentBatch(context, unmigratedRows);
        unmigratedRows = [];
      }
      continue;
    }

    const timestamp = toDateOrNull(doc.timestamp) || resolveCreatedAt(doc);
    const serialized = serializeContent(doc.content);
    chatRows.push({
      id: serializeDocId(doc._id),
      userId: String(doc.senderId || doc.userId || "").trim(),
      role: doc.role || "user",
      contentText: serialized.contentText,
      contentJson: serialized.contentJson,
      source: doc.source || null,
      platform: doc.platform || "line",
      botId: doc.botId || null,
      instructionRefs: Array.isArray(doc.instructionRefs) ? doc.instructionRefs : null,
      instructionMeta: Array.isArray(doc.instructionMeta) ? doc.instructionMeta : null,
      toolCalls: Array.isArray(doc.tool_calls) ? doc.tool_calls : null,
      toolCallId: doc.tool_call_id || null,
      toolName: doc.name || null,
      metadata:
        doc.metadata && typeof doc.metadata === "object" && !Array.isArray(doc.metadata)
          ? doc.metadata
          : null,
      legacySenderId: doc.senderId || null,
      legacyUserId: doc.userId || null,
      orderExtractionRoundId: doc.orderExtractionRoundId
        ? String(doc.orderExtractionRoundId)
        : null,
      orderExtractionMarkedAt: toDateOrNull(doc.orderExtractionMarkedAt),
      orderId: doc.orderId ? serializeDocId(doc.orderId) : null,
      messageAt: timestamp,
    });
    migrated += 1;
    if (chatRows.length >= DEFAULT_BATCH_SIZE) {
      await upsertChatMessageBatch(context, chatRows);
      chatRows = [];
    }
    if (migrated % PROGRESS_EVERY === 0) {
      console.log(`[mongo-postgres-migration] chat_history: ${migrated}`);
    }
  }

  await upsertChatMessageBatch(context, chatRows);
  await upsertAppDocumentBatch(context, unmigratedRows);
  await rebuildChatConversations(context);
  console.log(
    `[mongo-postgres-migration] chat_history: migrated ${migrated}, preserved_without_user ${preservedWithoutUser}`,
  );
  return { migrated, preservedWithoutUser, mode: "bulk", scope: scope.mode };
}

async function ensureChatPartitionsForSourceRange(mongoDb, context, filter = {}) {
  const [range] = await mongoDb
    .collection("chat_history")
    .aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          minTimestamp: { $min: "$timestamp" },
          maxTimestamp: { $max: "$timestamp" },
        },
      },
    ])
    .toArray();
  const minDate = toDateOrNull(range?.minTimestamp) || new Date();
  const maxDate = toDateOrNull(range?.maxTimestamp) || new Date();
  let cursor = monthStart(minDate);
  const end = addUtcMonth(monthStart(maxDate));
  while (cursor <= end) {
    const next = addUtcMonth(cursor);
    const tableName = chatPartitionName(cursor);
    if (!/^chat_messages_[0-9]{4}_[0-9]{2}$/.test(tableName)) {
      throw new Error(`Unsafe chat partition name: ${tableName}`);
    }
    await context.postgresRuntime.query(`
      CREATE TABLE IF NOT EXISTS ${tableName}
      PARTITION OF chat_messages
      FOR VALUES FROM ('${escapePgLiteral(cursor.toISOString())}')
      TO ('${escapePgLiteral(next.toISOString())}')
    `);
    cursor = next;
  }
}

async function upsertChatMessageBatch(context, rows) {
  if (!rows.length) return;
  const uniqueRows = Array.from(
    rows
      .reduce((map, row) => {
        map.set(`${row.id}\u0000${row.messageAt.toISOString()}`, row);
        return map;
      }, new Map())
      .values(),
  );
  const params = [];
  const valueSql = uniqueRows.map((row, index) => {
    const base = index * 20;
    params.push(
      row.id,
      row.userId,
      row.role,
      row.contentText,
      row.contentJson ? JSON.stringify(row.contentJson) : null,
      row.source,
      row.platform,
      row.botId,
      row.instructionRefs ? JSON.stringify(row.instructionRefs) : null,
      row.instructionMeta ? JSON.stringify(row.instructionMeta) : null,
      row.toolCalls ? JSON.stringify(row.toolCalls) : null,
      row.toolCallId,
      row.toolName,
      row.metadata ? JSON.stringify(row.metadata) : null,
      row.legacySenderId,
      row.legacyUserId,
      row.orderExtractionRoundId,
      row.orderExtractionMarkedAt ? row.orderExtractionMarkedAt.toISOString() : null,
      row.orderId,
      row.messageAt.toISOString(),
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}::jsonb, $${base + 10}::jsonb, $${base + 11}::jsonb, $${base + 12}, $${base + 13}, $${base + 14}::jsonb, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}::timestamptz, $${base + 19}, $${base + 20}::timestamptz)`;
  });
  await context.postgresRuntime.query(
    `
      INSERT INTO chat_messages (
        id,
        user_id,
        role,
        content_text,
        content_json,
        source,
        platform,
        bot_id,
        instruction_refs,
        instruction_meta,
        tool_calls,
        tool_call_id,
        tool_name,
        metadata,
        legacy_sender_id,
        legacy_user_id,
        order_extraction_round_id,
        order_extraction_marked_at,
        order_id,
        message_at
      ) VALUES ${valueSql.join(", ")}
      ON CONFLICT (id, message_at) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        role = EXCLUDED.role,
        content_text = EXCLUDED.content_text,
        content_json = EXCLUDED.content_json,
        source = EXCLUDED.source,
        platform = EXCLUDED.platform,
        bot_id = EXCLUDED.bot_id,
        instruction_refs = EXCLUDED.instruction_refs,
        instruction_meta = EXCLUDED.instruction_meta,
        tool_calls = EXCLUDED.tool_calls,
        tool_call_id = EXCLUDED.tool_call_id,
        tool_name = EXCLUDED.tool_name,
        metadata = EXCLUDED.metadata,
        legacy_sender_id = EXCLUDED.legacy_sender_id,
        legacy_user_id = EXCLUDED.legacy_user_id,
        order_extraction_round_id = EXCLUDED.order_extraction_round_id,
        order_extraction_marked_at = EXCLUDED.order_extraction_marked_at,
        order_id = EXCLUDED.order_id
    `,
    params,
  );
}

async function rebuildChatConversations(context) {
  await context.postgresRuntime.query(`
    INSERT INTO chat_conversations (
      user_id,
      last_message_id,
      last_message_at,
      last_message_content,
      last_message_preview,
      last_role,
      platform,
      bot_id,
      message_count,
      updated_at
    )
    SELECT
      user_id,
      (ARRAY_AGG(id ORDER BY message_at DESC))[1],
      MAX(message_at),
      (ARRAY_AGG(content_text ORDER BY message_at DESC))[1],
      (ARRAY_AGG(content_text ORDER BY message_at DESC))[1],
      (ARRAY_AGG(role ORDER BY message_at DESC))[1],
      (ARRAY_AGG(platform ORDER BY message_at DESC))[1],
      (ARRAY_AGG(bot_id ORDER BY message_at DESC))[1],
      COUNT(*)::integer,
      now()
    FROM chat_messages
    WHERE user_id IS NOT NULL AND user_id <> ''
    GROUP BY user_id
    ON CONFLICT (user_id) DO UPDATE SET
      last_message_id = EXCLUDED.last_message_id,
      last_message_at = EXCLUDED.last_message_at,
      last_message_content = EXCLUDED.last_message_content,
      last_message_preview = EXCLUDED.last_message_preview,
      last_role = EXCLUDED.last_role,
      platform = EXCLUDED.platform,
      bot_id = EXCLUDED.bot_id,
      message_count = EXCLUDED.message_count,
      updated_at = now()
  `);
}

async function migrateChatHistoryWithMirror(mongoDb, context, args) {
  const scope = await resolveChatHistoryScope(mongoDb, args);
  console.log(`[mongo-postgres-migration] chat_history scope ${scope.mode}: ${scope.description}`);
  const cursor = mongoDb
    .collection("chat_history")
    .find(scope.filter, { batchSize: DEFAULT_BATCH_SIZE })
    .sort({ timestamp: 1, _id: 1 });
  let migrated = 0;
  let preservedWithoutUser = 0;
  let unmigratedRows = [];

  for await (const rawDoc of cursor) {
    const doc = normalizeMessageDoc(rawDoc);
    if (!hasChatUserId(doc)) {
      const documentId = serializeDocId(doc._id);
      const createdAt = resolveCreatedAt(doc);
      unmigratedRows.push({
        collectionName: "chat_history_unmigrated",
        documentId,
        payload: normalizeForJson(doc),
        createdAt,
        updatedAt: resolveUpdatedAt(doc, createdAt),
      });
      preservedWithoutUser += 1;
      if (unmigratedRows.length >= DEFAULT_BATCH_SIZE) {
        await upsertAppDocumentBatch(context, unmigratedRows);
        unmigratedRows = [];
      }
      continue;
    }

    await context.chatStorageService.mirrorMessage(doc);
    migrated += 1;
    if (migrated % PROGRESS_EVERY === 0) {
      console.log(`[mongo-postgres-migration] chat_history: ${migrated}`);
    }
  }

  await upsertAppDocumentBatch(context, unmigratedRows);
  console.log(
    `[mongo-postgres-migration] chat_history: migrated ${migrated}, preserved_without_user ${preservedWithoutUser}`,
  );
  return { migrated, preservedWithoutUser, mode: "mirror", scope: scope.mode };
}

async function migrateGridFsBucket(mongoDb, context, bucketSpec) {
  const collectionNames = await fetchCollectionNames(mongoDb);
  if (!collectionNames.includes(`${bucketSpec.bucketName}.files`)) {
    return { migrated: 0, skippedExisting: 0 };
  }
  if (!context.projectBucket.isConfigured()) {
    throw new Error(`Bucket env is required to migrate GridFS bucket ${bucketSpec.bucketName}`);
  }

  const bucket = new GridFSBucket(mongoDb, { bucketName: bucketSpec.bucketName });
  const files = mongoDb.collection(`${bucketSpec.bucketName}.files`);
  const cursor = files.find({}, { batchSize: 50 }).sort({ uploadDate: 1, _id: 1 });
  let migrated = 0;
  let skippedExisting = 0;

  for await (const file of cursor) {
    const assetId = serializeDocId(file._id);
    const existing = await context.chatStorageService.getAssetObject(bucketSpec.scope, assetId);
    if (
      existing?.bucketKey &&
      Number(existing.sizeBytes || 0) === Number(file.length || 0) &&
      process.env.MIGRATION_REUPLOAD_ASSETS !== "true"
    ) {
      skippedExisting += 1;
      continue;
    }

    const download = bucket.openDownloadStream(file._id);
    const buffer = await streamToBuffer(download);
    const fileName = file.filename || assetId;
    const objectKey = context.projectBucket.buildKey(
      "asset_objects",
      bucketSpec.scope,
      assetId,
      fileName,
    );
    const mimeType =
      file.contentType ||
      file.metadata?.contentType ||
      file.metadata?.mimeType ||
      null;

    await context.projectBucket.putBuffer(objectKey, buffer, {
      contentType: mimeType || undefined,
      metadata: {
        migratedFrom: bucketSpec.bucketName,
        sourceFileId: assetId,
      },
    });
    await context.chatStorageService.upsertAssetObject(bucketSpec.scope, assetId, {
      fileName,
      bucketKey: objectKey,
      mimeType,
      sizeBytes: buffer.length,
      metadata: normalizeForJson({
        ...(file.metadata || {}),
        migratedFrom: bucketSpec.bucketName,
        sourceUploadDate: file.uploadDate || null,
      }),
    });

    migrated += 1;
    if (migrated % 100 === 0) {
      console.log(`[mongo-postgres-migration] ${bucketSpec.bucketName}: ${migrated}`);
    }
  }

  console.log(
    `[mongo-postgres-migration] ${bucketSpec.bucketName}: migrated ${migrated}, skipped_existing ${skippedExisting}`,
  );
  return { migrated, skippedExisting };
}

async function migrateAssets(mongoDb, context) {
  const result = {};
  for (const bucketSpec of GRIDFS_BUCKETS) {
    result[bucketSpec.scope] = await migrateGridFsBucket(mongoDb, context, bucketSpec);
  }
  return result;
}

async function countPostgresAppDocuments(context, collectionName) {
  const result = await context.postgresRuntime.query(
    `
      SELECT COUNT(*)::bigint AS count
      FROM app_documents
      WHERE collection_name = $1
    `,
    [collectionName],
  );
  return Number(result.rows[0]?.count || 0);
}

async function targetIdSet(context, collectionName) {
  const result = await context.postgresRuntime.query(
    `
      SELECT document_id
      FROM app_documents
      WHERE collection_name = $1
    `,
    [collectionName],
  );
  return new Set(result.rows.map((row) => row.document_id));
}

async function verifyRegularCollection(mongoDb, context, collectionName) {
  const sourceIds = [];
  const sourceIdCounts = new Map();
  const cursor = mongoDb.collection(collectionName).find({}, { projection: { _id: 1, key: 1, userId: 1, platform: 1, senderId: 1, botId: 1 } });
  for await (const doc of cursor) {
    const documentId = resolveAppDocumentId(collectionName, doc) || serializeDocId(doc._id);
    sourceIds.push(documentId);
    sourceIdCounts.set(documentId, (sourceIdCounts.get(documentId) || 0) + 1);
  }
  const duplicateSourceDocCount = Array.from(sourceIdCounts.values())
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);
  const targetIds = await targetIdSet(context, collectionName);
  const uniqueSourceIds = Array.from(new Set(sourceIds));
  const missing = uniqueSourceIds.filter((id) => !targetIds.has(id));
  const duplicateTargetCount = duplicateSourceDocCount
    ? await countPostgresAppDocuments(context, `${collectionName}__source_duplicates`)
    : 0;
  const allowTargetExtras = process.env.MIGRATION_ALLOW_TARGET_EXTRAS === "true";
  return {
    collectionName,
    source: sourceIds.length,
    sourceUnique: uniqueSourceIds.length,
    duplicateSourceDocCount,
    duplicateTargetCount,
    target: await countPostgresAppDocuments(context, collectionName),
    missingCount: missing.length,
    missingSample: missing.slice(0, 20),
    ok:
      missing.length === 0 &&
      (allowTargetExtras || uniqueSourceIds.length === targetIds.size) &&
      duplicateTargetCount === duplicateSourceDocCount,
  };
}

async function verifyChatHistory(mongoDb, context, args) {
  const collectionNames = await fetchCollectionNames(mongoDb);
  if (!collectionNames.includes("chat_history")) {
    return { source: 0, target: 0, preservedWithoutUser: 0, missingCount: 0, ok: true };
  }

  const scope = await resolveChatHistoryScope(mongoDb, args);
  const eligibleIds = [];
  const ineligibleIds = [];
  const cursor = mongoDb.collection("chat_history").find(scope.filter, {
    projection: { _id: 1, senderId: 1, userId: 1 },
  });
  for await (const rawDoc of cursor) {
    const doc = normalizeMessageDoc(rawDoc);
    if (hasChatUserId(doc)) eligibleIds.push(serializeDocId(doc._id));
    else ineligibleIds.push(serializeDocId(doc._id));
  }

  const sqlParams = [];
  const conditions = [];
  if (scope.start) {
    sqlParams.push(scope.start);
    conditions.push(`message_at >= $${sqlParams.length}`);
  }
  if (scope.end) {
    sqlParams.push(scope.end);
    conditions.push(`message_at < $${sqlParams.length}`);
  }
  const chatRows = await context.postgresRuntime.query(
    `SELECT id FROM chat_messages${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""}`,
    sqlParams,
  );
  const targetChatIds = new Set(chatRows.rows.map((row) => row.id));
  const unmigratedIds = await targetIdSet(context, "chat_history_unmigrated");
  const missingEligible = eligibleIds.filter((id) => !targetChatIds.has(id));
  const missingIneligible = ineligibleIds.filter((id) => !unmigratedIds.has(id));
  const allowTargetExtras =
    scope.mode !== "all" || process.env.MIGRATION_ALLOW_TARGET_EXTRAS === "true";

  return {
    scope: scope.mode,
    scopeDescription: scope.description,
    source: eligibleIds.length + ineligibleIds.length,
    sourceEligible: eligibleIds.length,
    sourceWithoutUser: ineligibleIds.length,
    target: targetChatIds.size,
    preservedWithoutUser: unmigratedIds.size,
    missingCount: missingEligible.length + missingIneligible.length,
    missingSample: [...missingEligible, ...missingIneligible].slice(0, 20),
    ok:
      missingEligible.length === 0 &&
      missingIneligible.length === 0 &&
      (allowTargetExtras || eligibleIds.length === targetChatIds.size) &&
      (allowTargetExtras || ineligibleIds.length === unmigratedIds.size),
  };
}

async function verifyGridFsBucket(mongoDb, context, bucketSpec) {
  const collectionNames = await fetchCollectionNames(mongoDb);
  if (!collectionNames.includes(`${bucketSpec.bucketName}.files`)) {
    return { bucketName: bucketSpec.bucketName, source: 0, target: 0, missingCount: 0, sizeMismatchCount: 0, ok: true };
  }

  const source = new Map();
  const cursor = mongoDb.collection(`${bucketSpec.bucketName}.files`).find({}, { projection: { _id: 1, length: 1 } });
  for await (const file of cursor) {
    source.set(serializeDocId(file._id), Number(file.length || 0));
  }

  const result = await context.postgresRuntime.query(
    `
      SELECT asset_id, size_bytes
      FROM asset_objects
      WHERE asset_scope = $1
    `,
    [bucketSpec.scope],
  );
  const target = new Map(
    result.rows.map((row) => [row.asset_id, Number(row.size_bytes || 0)]),
  );
  const missing = [];
  const sizeMismatch = [];
  for (const [id, size] of source.entries()) {
    if (!target.has(id)) missing.push(id);
    else if (target.get(id) !== size) sizeMismatch.push(id);
  }
  return {
    bucketName: bucketSpec.bucketName,
    scope: bucketSpec.scope,
    source: source.size,
    target: target.size,
    missingCount: missing.length,
    missingSample: missing.slice(0, 20),
    sizeMismatchCount: sizeMismatch.length,
    sizeMismatchSample: sizeMismatch.slice(0, 20),
    ok: missing.length === 0 && sizeMismatch.length === 0 && source.size === target.size,
  };
}

async function verifyAll(mongoDb, context, args) {
  const collectionNames = await fetchCollectionNames(mongoDb);
  const regularCollections = collectionNames.filter(shouldMigrateCollection);
  const regular = [];
  for (const collectionName of regularCollections) {
    regular.push(await verifyRegularCollection(mongoDb, context, collectionName));
  }
  const chat = await verifyChatHistory(mongoDb, context, args);
  const assets = [];
  for (const bucketSpec of GRIDFS_BUCKETS) {
    assets.push(await verifyGridFsBucket(mongoDb, context, bucketSpec));
  }

  const failedRegular = regular.filter((entry) => !entry.ok);
  const failedAssets = assets.filter((entry) => !entry.ok);
  const ok = failedRegular.length === 0 && chat.ok && failedAssets.length === 0;

  return {
    ok,
    regular,
    chat,
    assets,
    failed: {
      regular: failedRegular,
      chat: chat.ok ? null : chat,
      assets: failedAssets,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mongoUri = getMongoUri();
  if (!mongoUri) throw new Error("MONGODB_URI or MONGO_URI is required");

  const context = createMigrationContext();
  if (!context.postgresRuntime.isConfigured()) {
    throw new Error("DATABASE_URL is not configured");
  }

  const mongoClient = new MongoClient(mongoUri, {
    maxPoolSize: Math.max(1, Number.parseInt(process.env.MONGO_MAX_POOL_SIZE || "10", 10) || 10),
  });

  try {
    await mongoClient.connect();
    const mongoDb = mongoClient.db(getMongoDatabaseName());
    await context.chatStorageService.ensureReady();

    if (!args.verifyOnly) {
      const collectionNames = await fetchCollectionNames(mongoDb);
      const regular = await migrateRegularCollections(mongoDb, context, collectionNames);
      const chat = await migrateChatHistory(mongoDb, context, args);
      const assets = await migrateAssets(mongoDb, context);
      console.log(
        `[mongo-postgres-migration] migration summary ${JSON.stringify({ regular, chat, assets })}`,
      );
    }

    if (!args.migrateOnly) {
      const verification = await verifyAll(mongoDb, context, args);
      console.log(
        `[mongo-postgres-migration] verification ${JSON.stringify(verification)}`,
      );
      if (!verification.ok) {
        process.exitCode = 1;
      }
    }
  } finally {
    await mongoClient.close().catch(() => {});
    await context.close();
  }
}

main().catch((error) => {
  console.error("[mongo-postgres-migration] failed:", error?.message || error);
  process.exitCode = 1;
});
