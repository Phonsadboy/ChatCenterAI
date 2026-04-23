"use strict";

const { createMigrationContext } = require("./lib/migrationContext");
const {
  buildMessageId,
} = require("../services/chatStorageService");
const { extractBase64ImagesFromContent } = require("../utils/chatImageUtils");

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
    return {
      contentText: "",
      contentJson: null,
    };
  }
  return {
    contentText: JSON.stringify(rawValue),
    contentJson: rawValue,
  };
}

function normalizeTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeUserId(doc = {}) {
  if (typeof doc.senderId === "string" && doc.senderId.trim()) {
    return doc.senderId.trim();
  }
  if (typeof doc.userId === "string" && doc.userId.trim()) {
    return doc.userId.trim();
  }
  return "";
}

function hasInlineImage(content) {
  try {
    return extractBase64ImagesFromContent(content).length > 0;
  } catch (_) {
    return false;
  }
}

function resolveMigrationCutoff(context) {
  const startAt = String(process.env.MIGRATE_CHAT_START_AT || "").trim();
  if (startAt) {
    const parsed = new Date(startAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid MIGRATE_CHAT_START_AT: ${startAt}`);
    }
    return parsed;
  }

  const sinceMinutes = Number.parseInt(
    process.env.MIGRATE_CHAT_SINCE_MINUTES || "",
    10,
  );
  if (Number.isFinite(sinceMinutes) && sinceMinutes > 0) {
    return new Date(Date.now() - sinceMinutes * 60 * 1000);
  }

  return context.createHotCutoff(context.runtimeConfig.chatHotRetentionDays);
}

async function bulkInsertTextMessages(context, docs) {
  if (!docs.length) return 0;

  const columns = [
    "id",
    "user_id",
    "role",
    "content_text",
    "content_json",
    "source",
    "platform",
    "bot_id",
    "instruction_refs",
    "instruction_meta",
    "tool_calls",
    "tool_call_id",
    "tool_name",
    "metadata",
    "legacy_sender_id",
    "legacy_user_id",
    "order_extraction_round_id",
    "order_extraction_marked_at",
    "order_id",
    "message_at",
  ];
  const params = [];
  const values = [];

  docs.forEach((doc, docIndex) => {
    const messageId = buildMessageId(doc._id);
    const userId = normalizeUserId(doc);
    const timestamp = normalizeTimestamp(doc.timestamp);
    const serialized = serializeContent(doc.content);
    const row = [
      messageId,
      userId,
      doc.role || "user",
      serialized.contentText,
      serialized.contentJson ? JSON.stringify(serialized.contentJson) : null,
      doc.source || null,
      doc.platform || "line",
      doc.botId || null,
      Array.isArray(doc.instructionRefs) ? JSON.stringify(doc.instructionRefs) : null,
      Array.isArray(doc.instructionMeta) ? JSON.stringify(doc.instructionMeta) : null,
      Array.isArray(doc.tool_calls) ? JSON.stringify(doc.tool_calls) : null,
      doc.tool_call_id || null,
      doc.name || null,
      doc.metadata && typeof doc.metadata === "object" && !Array.isArray(doc.metadata)
        ? JSON.stringify(doc.metadata)
        : null,
      doc.senderId || null,
      doc.userId || null,
      doc.orderExtractionRoundId ? String(doc.orderExtractionRoundId) : null,
      doc.orderExtractionMarkedAt || null,
      doc.orderId ? doc.orderId.toString?.() || String(doc.orderId) : null,
      timestamp.toISOString(),
    ];
    const offset = docIndex * columns.length;
    values.push(
      `(${row.map((_, rowIndex) => `$${offset + rowIndex + 1}`).join(", ")})`,
    );
    params.push(...row);
  });

  const result = await context.postgresRuntime.query(
    `
      INSERT INTO chat_messages (${columns.join(", ")})
      VALUES ${values.join(", ")}
      ON CONFLICT (id, message_at) DO NOTHING
    `,
    params,
  );
  return result.rowCount || 0;
}

async function rebuildConversations(context) {
  await context.postgresRuntime.query(`TRUNCATE chat_conversations`);
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
      latest.user_id,
      latest.id,
      latest.message_at,
      latest.content_text,
      latest.preview_text,
      latest.role,
      latest.platform,
      latest.bot_id,
      counts.message_count,
      now()
    FROM (
      SELECT DISTINCT ON (user_id)
        user_id,
        id,
        message_at,
        content_text,
        role,
        platform,
        bot_id,
        left(coalesce(content_text, ''), 240) AS preview_text
      FROM chat_messages
      ORDER BY user_id, message_at DESC
    ) latest
    JOIN (
      SELECT user_id, COUNT(*)::integer AS message_count
      FROM chat_messages
      GROUP BY user_id
    ) counts ON counts.user_id = latest.user_id
  `);
}

async function main() {
  const context = createMigrationContext();
  try {
    if (!context.postgresRuntime.isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }

    await context.chatStorageService.ensureReady();
    const db = await context.getMongoDb();
    const cutoff = resolveMigrationCutoff(context);
    const batchSize = Math.max(
      100,
      Number.parseInt(process.env.MIGRATE_CHAT_BATCH_SIZE || "1000", 10),
    );
    const imageConcurrency = Math.max(
      1,
      Number.parseInt(process.env.MIGRATE_CHAT_IMAGE_CONCURRENCY || "8", 10),
    );

    const cursor = db.collection("chat_history")
      .find({ timestamp: { $gte: cutoff } })
      .sort({ timestamp: 1 })
      .batchSize(batchSize);

    let processed = 0;
    let inserted = 0;
    let imageInserted = 0;
    let skipped = 0;
    let imageDocs = 0;
    let batch = [];
    const imageTasks = new Set();

    const flushBatch = async () => {
      if (!batch.length) return;
      const insertedCount = await bulkInsertTextMessages(context, batch);
      inserted += insertedCount;
      skipped += batch.length - insertedCount;
      batch = [];
    };

    const enqueueImageDoc = async (doc) => {
      const task = context.chatStorageService
        .mirrorMessage(doc, {
          messageId: context.serializeDocId(doc?._id),
        })
        .then((result) => {
          if (result?.inserted) {
            inserted += 1;
            imageInserted += 1;
          } else {
            skipped += 1;
          }
        })
        .finally(() => {
          imageTasks.delete(task);
        });
      imageTasks.add(task);
      if (imageTasks.size >= imageConcurrency) {
        await Promise.race(imageTasks);
      }
    };

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      processed += 1;

      if (!normalizeUserId(doc)) {
        skipped += 1;
      } else if (hasInlineImage(doc.content)) {
        imageDocs += 1;
        await enqueueImageDoc(doc);
      } else {
        batch.push(doc);
        if (batch.length >= batchSize) {
          await flushBatch();
        }
      }

      if (processed % batchSize === 0) {
        console.log(
          `[migrate-chat-hot] processed=${processed} inserted=${inserted} imageDocs=${imageDocs} imageInserted=${imageInserted} skipped=${skipped}`,
        );
      }
    }

    await flushBatch();
    await Promise.all(imageTasks);
    await rebuildConversations(context);

    console.log(
      `[migrate-chat-hot] done processed=${processed} inserted=${inserted} imageDocs=${imageDocs} imageInserted=${imageInserted} skipped=${skipped} cutoff=${cutoff.toISOString()}`,
    );
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error("[migrate-chat-hot] failed:", error?.message || error);
  process.exitCode = 1;
});
