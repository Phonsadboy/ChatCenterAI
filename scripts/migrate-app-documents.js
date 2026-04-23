"use strict";

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

async function bulkUpsertDocuments(context, rows) {
  if (!rows.length) return;
  const dedupedMap = new Map();
  rows.forEach((row) => {
    dedupedMap.set(`${row.collectionName}:${row.documentId}`, row);
  });
  const dedupedRows = Array.from(dedupedMap.values());
  const params = [];
  const values = [];
  dedupedRows.forEach((row, index) => {
    const offset = index * 3;
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb, now(), now())`);
    params.push(row.collectionName, row.documentId, JSON.stringify(row.payload || {}));
  });

  await context.postgresRuntime.query(
    `
      INSERT INTO app_documents (
        collection_name,
        document_id,
        payload,
        created_at,
        updated_at
      ) VALUES ${values.join(", ")}
      ON CONFLICT (collection_name, document_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = now()
    `,
    params,
  );
}

async function main() {
  const context = createMigrationContext();
  try {
    if (!context.postgresRuntime.isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }

    await context.chatStorageService.ensureReady();
    const db = await context.getMongoDb();
    const collectionNames = await resolveCollectionNames(db);
    const batchSize = Math.max(
      100,
      Number.parseInt(process.env.MIGRATE_DOC_BATCH_SIZE || "1000", 10),
    );

    for (const collectionName of collectionNames) {
      const coll = db.collection(collectionName);
      const cursor = coll.find({}).batchSize(batchSize);
      let processed = 0;
      let batch = [];

      const flushBatch = async () => {
        if (!batch.length) return;
        await bulkUpsertDocuments(context, batch);
        batch = [];
      };

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const docId =
          context.resolveAppDocumentId(collectionName, doc) ||
          context.serializeDocId(doc?._id) ||
          `${collectionName}:${processed}`;
        batch.push({
          collectionName,
          documentId: docId,
          payload: context.normalizeForJson(doc),
        });
        processed += 1;
        if (batch.length >= batchSize) {
          await flushBatch();
        }
        if (processed % batchSize === 0) {
          console.log(
            `[migrate-app-documents] ${collectionName} processed=${processed}`,
          );
        }
      }

      await flushBatch();

      console.log(
        `[migrate-app-documents] ${collectionName} done processed=${processed}`,
      );
    }
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error("[migrate-app-documents] failed:", error?.message || error);
  process.exitCode = 1;
});
