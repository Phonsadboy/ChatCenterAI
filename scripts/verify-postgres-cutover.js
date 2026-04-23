"use strict";

const {
  extractBase64ImagesFromContent,
} = require("../utils/chatImageUtils");
const { createMigrationContext } = require("./lib/migrationContext");

const DEFAULT_COLLECTIONS = [
  "active_admin_sessions",
  "admin_passcodes",
  "agent_profiles",
  "agent_runs",
  "agent_run_events",
  "agent_openai_snapshots",
  "agent_processing_cursors",
  "agent_eval_cases",
  "agent_eval_results",
  "agent_decision_journal",
  "agent_image_import_log",
  "agent_log_access_audit",
  "categories",
  "category_tables",
  "conversation_threads",
  "instruction_chat_audit",
  "instruction_chat_changelog",
  "instruction_chat_sessions",
  "instruction_library",
  "instruction_versions",
  "migration_logs",
  "notification_logs",
  "openai_usage_logs",
  "order_extraction_buffers",
  "orders",
  "short_links",
  "user_flow_history",
  "line_bots",
  "facebook_bots",
  "instagram_bots",
  "whatsapp_bots",
  "telegram_notification_bots",
  "telegram_bot_groups",
  "line_bot_groups",
  "openai_api_keys",
  "facebook_page_posts",
  "facebook_comment_policies",
  "facebook_comment_events",
  "instructions_v2",
  "settings",
  "notification_channels",
  "user_profiles",
  "user_tags",
  "user_notes",
  "image_collections",
  "follow_up_status",
  "follow_up_page_settings",
  "follow_up_tasks",
  "active_user_status",
  "user_purchase_status",
  "user_unread_counts",
  "instruction_assets",
  "follow_up_assets",
];

function shouldSkipCollectionName(collectionName) {
  if (!collectionName || typeof collectionName !== "string") return true;
  if (collectionName === "chat_history") return true;
  if (collectionName.startsWith("system.")) return true;
  if (collectionName.endsWith(".files")) return true;
  if (collectionName.endsWith(".chunks")) return true;
  return false;
}

function isTruthyEnv(name) {
  return ["1", "true", "yes", "on"].includes(
    String(process.env[name] || "").trim().toLowerCase(),
  );
}

async function resolveCollectionNames(db) {
  const raw = process.env.MIGRATE_COLLECTIONS || DEFAULT_COLLECTIONS.join(",");
  const requested = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    requested.length === 1 &&
    ["all", "*", "__all__"].includes(requested[0].toLowerCase())
  ) {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    return collections
      .map((collection) => collection.name)
      .filter((name) => !shouldSkipCollectionName(name))
      .sort();
  }
  return requested.filter((name) => !shouldSkipCollectionName(name));
}

async function countMongoLogicalDocuments(db, context, collectionName) {
  const coll = db.collection(collectionName);
  if (
    ![
      "settings",
      "user_profiles",
      "follow_up_status",
      "follow_up_page_settings",
      "user_tags",
      "user_notes",
      "user_purchase_status",
      "user_unread_counts",
      "active_user_status",
    ].includes(collectionName)
  ) {
    return coll.countDocuments({});
  }

  const cursor = coll.find({});
  const ids = new Set();
  let fallbackCount = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const logicalId = context.resolveAppDocumentId(collectionName, doc);
    if (logicalId) {
      ids.add(logicalId);
    } else {
      fallbackCount += 1;
    }
  }
  return ids.size + fallbackCount;
}

async function findMissingChatMessageIds(context, db, cutoff) {
  const batchSize = Math.max(
    100,
    Number.parseInt(process.env.VERIFY_ID_BATCH_SIZE || "1000", 10),
  );
  const cursor = db.collection("chat_history")
    .find({ timestamp: { $gte: cutoff } })
    .project({ _id: 1 })
    .batchSize(batchSize);
  let checked = 0;
  let missingCount = 0;
  const examples = [];

  while (await cursor.hasNext()) {
    const ids = [];
    while (ids.length < batchSize && await cursor.hasNext()) {
      const doc = await cursor.next();
      const id = context.serializeDocId(doc?._id);
      if (id) ids.push(id);
    }
    if (!ids.length) continue;

    const result = await context.postgresRuntime.query(
      `SELECT id FROM chat_messages WHERE id = ANY($1::text[])`,
      [ids],
    );
    const found = new Set(result.rows.map((row) => String(row.id)));
    ids.forEach((id) => {
      checked += 1;
      if (!found.has(id)) {
        missingCount += 1;
        if (examples.length < 5) examples.push(id);
      }
    });
  }

  return { checked, examples, missingCount };
}

async function findMissingAppDocumentIds(context, db, collectionName) {
  const batchSize = Math.max(
    100,
    Number.parseInt(process.env.VERIFY_ID_BATCH_SIZE || "1000", 10),
  );
  const cursor = db.collection(collectionName).find({}).batchSize(batchSize);
  let checked = 0;
  let missingCount = 0;
  const examples = [];

  while (await cursor.hasNext()) {
    const ids = [];
    while (ids.length < batchSize && await cursor.hasNext()) {
      const doc = await cursor.next();
      const id =
        context.resolveAppDocumentId(collectionName, doc) ||
        context.serializeDocId(doc?._id);
      if (id) ids.push(id);
    }
    if (!ids.length) continue;

    const result = await context.postgresRuntime.query(
      `
        SELECT document_id
        FROM app_documents
        WHERE collection_name = $1
          AND document_id = ANY($2::text[])
      `,
      [collectionName, ids],
    );
    const found = new Set(result.rows.map((row) => String(row.document_id)));
    ids.forEach((id) => {
      checked += 1;
      if (!found.has(id)) {
        missingCount += 1;
        if (examples.length < 5) examples.push(id);
      }
    });
  }

  return { checked, examples, missingCount };
}

async function main() {
  const context = createMigrationContext();
  let hasMismatch = false;
  try {
    if (!context.postgresRuntime.isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }

    await context.chatStorageService.ensureReady();
    const db = await context.getMongoDb();
    const allowPostgresAhead = isTruthyEnv("VERIFY_ALLOW_POSTGRES_AHEAD");
    const cutoff = context.createHotCutoff(
      context.runtimeConfig.chatHotRetentionDays,
    );

    const mongoHotCount = await db.collection("chat_history").countDocuments({
      timestamp: { $gte: cutoff },
    });
    const pgHotResult = await context.postgresRuntime.query(
      `SELECT COUNT(*)::bigint AS count FROM chat_messages WHERE message_at >= $1`,
      [cutoff.toISOString()],
    );
    const pgHotCount = Number(pgHotResult.rows[0]?.count || 0);
    if (mongoHotCount !== pgHotCount) {
      if (allowPostgresAhead && pgHotCount >= mongoHotCount) {
        const missing = await findMissingChatMessageIds(context, db, cutoff);
        if (missing.missingCount > 0) {
          hasMismatch = true;
          console.error(
            `[verify] hot chat missing ids count=${missing.missingCount} examples=${missing.examples.join(",")}`,
          );
        } else {
          console.log(
            `[verify] hot chat ok; postgres ahead mongo=${mongoHotCount} postgres=${pgHotCount} checked=${missing.checked}`,
          );
        }
      } else {
        hasMismatch = true;
        console.error(
          `[verify] hot chat count mismatch mongo=${mongoHotCount} postgres=${pgHotCount}`,
        );
      }
    } else {
      console.log(`[verify] hot chat count ok (${mongoHotCount})`);
    }

    const mongoUsers = await db.collection("chat_history")
      .aggregate([
        { $match: { timestamp: { $gte: cutoff } } },
        {
          $addFields: {
            senderKey: {
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
        },
        { $match: { senderKey: { $nin: [null, ""] } } },
        { $group: { _id: "$senderKey", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
      ])
      .toArray();

    for (const user of mongoUsers) {
      const pgCountResult = await context.postgresRuntime.query(
        `SELECT COUNT(*)::bigint AS count FROM chat_messages WHERE user_id = $1 AND message_at >= $2`,
        [String(user._id), cutoff.toISOString()],
      );
      const pgCount = Number(pgCountResult.rows[0]?.count || 0);
      if (Number(user.count || 0) !== pgCount) {
        hasMismatch = true;
        console.error(
          `[verify] user hot count mismatch userId=${user._id} mongo=${user.count} postgres=${pgCount}`,
        );
      }
    }

    const mongoHotDocs = await db.collection("chat_history")
      .find({ timestamp: { $gte: cutoff } })
      .project({ _id: 1, content: 1 })
      .toArray();
    const mongoAttachmentCount = mongoHotDocs.reduce((total, doc) => {
      return total + extractBase64ImagesFromContent(doc.content).length;
    }, 0);
    const pgAttachmentResult = await context.postgresRuntime.query(
      `SELECT COUNT(*)::bigint AS count FROM chat_message_attachments`,
    );
    const pgAttachmentCount = Number(pgAttachmentResult.rows[0]?.count || 0);
    if (mongoAttachmentCount !== pgAttachmentCount) {
      if (allowPostgresAhead && pgAttachmentCount >= mongoAttachmentCount) {
        console.log(
          `[verify] attachment count ok; postgres ahead mongo=${mongoAttachmentCount} postgres=${pgAttachmentCount}`,
        );
      } else {
        hasMismatch = true;
        console.error(
          `[verify] attachment count mismatch mongo=${mongoAttachmentCount} postgres=${pgAttachmentCount}`,
        );
      }
    } else {
      console.log(`[verify] attachment count ok (${mongoAttachmentCount})`);
    }

    const collectionNames = await resolveCollectionNames(db);
    for (const collectionName of collectionNames) {
      const mongoCount = await countMongoLogicalDocuments(
        db,
        context,
        collectionName,
      );
      const pgCountResult = await context.postgresRuntime.query(
        `
          SELECT COUNT(*)::bigint AS count
          FROM app_documents
          WHERE collection_name = $1
        `,
        [collectionName],
      );
      const pgCount = Number(pgCountResult.rows[0]?.count || 0);
      if (mongoCount !== pgCount) {
        if (allowPostgresAhead && pgCount >= mongoCount) {
          const missing = await findMissingAppDocumentIds(
            context,
            db,
            collectionName,
          );
          if (missing.missingCount > 0) {
            hasMismatch = true;
            console.error(
              `[verify] collection missing ids ${collectionName} count=${missing.missingCount} examples=${missing.examples.join(",")}`,
            );
          } else {
            console.log(
              `[verify] collection ok ${collectionName}; postgres ahead mongo=${mongoCount} postgres=${pgCount} checked=${missing.checked}`,
            );
          }
        } else {
          hasMismatch = true;
          console.error(
            `[verify] collection mismatch ${collectionName} mongo=${mongoCount} postgres=${pgCount}`,
          );
        }
      } else {
        console.log(`[verify] collection ok ${collectionName} (${mongoCount})`);
      }
    }
  } finally {
    await context.close();
  }

  if (hasMismatch) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[verify-postgres-cutover] failed:", error?.message || error);
  process.exitCode = 1;
});
