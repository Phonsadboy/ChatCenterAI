#!/usr/bin/env node
require("dotenv").config();

const { MongoClient } = require("mongodb");
const {
  attachPgClientErrorLogger,
  closePgPool,
  getPgPool,
  query,
  runSqlMigrationsWithLock,
} = require("../infra/postgres");
const { resolvePostgresConnectionString } = require("../infra/runtimeConfig");

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "chatbot";

function normalizeJson(value, fallback = {}) {
  if (value === null || typeof value === "undefined") return fallback;
  return value;
}

function toText(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

async function upsertBot(client, platform, doc) {
  const legacyBotId =
    (doc?._id && typeof doc._id.toString === "function" ? doc._id.toString() : String(doc?._id || "")).trim() ||
    (typeof doc?.pageId === "string" ? doc.pageId.trim() : "") ||
    (typeof doc?.phoneNumberId === "string" ? doc.phoneNumberId.trim() : "");
  const name =
    doc?.name ||
    doc?.pageName ||
    doc?.displayName ||
    doc?.botName ||
    doc?.instagramUsername ||
    doc?.phoneNumber ||
    legacyBotId;

  const result = await client.query(
    `
      INSERT INTO bots (
        platform,
        legacy_bot_id,
        name,
        status,
        ai_model,
        ai_config,
        keyword_settings,
        selected_instructions,
        selected_image_collections,
        config,
        created_at,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12
      )
      ON CONFLICT (platform, legacy_bot_id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        ai_model = EXCLUDED.ai_model,
        ai_config = EXCLUDED.ai_config,
        keyword_settings = EXCLUDED.keyword_settings,
        selected_instructions = EXCLUDED.selected_instructions,
        selected_image_collections = EXCLUDED.selected_image_collections,
        config = EXCLUDED.config,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
    [
      platform,
      legacyBotId,
      name,
      doc?.status || "active",
      doc?.aiModel || null,
      JSON.stringify(normalizeJson(doc?.aiConfig, {})),
      JSON.stringify(normalizeJson(doc?.keywordSettings, {})),
      JSON.stringify(Array.isArray(doc?.selectedInstructions) ? doc.selectedInstructions : []),
      JSON.stringify(Array.isArray(doc?.selectedImageCollections) ? doc.selectedImageCollections : []),
      JSON.stringify(normalizeJson(doc, {})),
      doc?.createdAt || new Date(),
      doc?.updatedAt || doc?.createdAt || new Date(),
    ],
  );

  await client.query(
    `
      INSERT INTO bot_secrets (bot_id, secrets, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (bot_id) DO UPDATE SET
        secrets = EXCLUDED.secrets,
        updated_at = EXCLUDED.updated_at
    `,
    [
      result.rows[0].id,
      JSON.stringify({
        accessToken: doc?.accessToken || null,
        channelAccessToken: doc?.channelAccessToken || null,
        channelSecret: doc?.channelSecret || null,
        verifyToken: doc?.verifyToken || null,
      }),
    ],
  );

  return result.rows[0].id;
}

async function upsertContact(client, userId, platform, profile = {}) {
  const legacyContactId = String(userId || "").trim();
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
      platform,
      legacyContactId,
      profile?.displayName || null,
      JSON.stringify(normalizeJson(profile, {})),
      profile?.createdAt || new Date(),
      profile?.updatedAt || profile?.createdAt || new Date(),
    ],
  );
  return result.rows[0].id;
}

async function upsertThread(client, platform, botId, contactId, legacyThreadKey, stats = {}) {
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
      ) VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),NOW())
      ON CONFLICT (legacy_thread_key) DO UPDATE SET
        stats = EXCLUDED.stats,
        updated_at = NOW()
      RETURNING id
    `,
    [
      platform,
      botId,
      contactId,
      legacyThreadKey,
      JSON.stringify(normalizeJson(stats, {})),
    ],
  );
  return result.rows[0].id;
}

async function writeCheckpoint(name, rowCount) {
  await query(
    `
      INSERT INTO migration_checkpoints (checkpoint_name, status, metadata, completed_at)
      VALUES ($1, 'completed', $2::jsonb, NOW())
      ON CONFLICT (checkpoint_name) DO UPDATE SET
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        completed_at = EXCLUDED.completed_at
    `,
    [name, JSON.stringify({ rowCount })],
  );
}

async function migrateMongoToPostgres(options = {}) {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }
  if (!resolvePostgresConnectionString()) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!options.skipSqlMigrations) {
    await runSqlMigrationsWithLock(undefined, {
      lockId: Number(process.env.CCAI_PG_MIGRATION_LOCK_ID || 7482301),
      waitTimeoutMs: Number(process.env.CCAI_PG_MIGRATION_LOCK_TIMEOUT_MS || 120000),
      pollMs: Number(process.env.CCAI_PG_MIGRATION_LOCK_POLL_MS || 1000),
    });
  }

  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const db = mongo.db(MONGO_DB_NAME);
  const pgClient = await getPgPool().connect();
  const detachClientErrorLogger = attachPgClientErrorLogger(
    pgClient,
    "mongo-to-postgres migration client",
  );

  try {
    const client = pgClient;
      const settings = await db.collection("settings").find({}).toArray();
      for (const setting of settings) {
        await client.query(
          `
            INSERT INTO settings (key, value, updated_at)
            VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (key) DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = EXCLUDED.updated_at
          `,
          [
            setting.key,
            JSON.stringify(normalizeJson(setting.value, null)),
            setting.updatedAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("settings", settings.length);

      const botCollections = [
        ["line", "line_bots"],
        ["facebook", "facebook_bots"],
        ["instagram", "instagram_bots"],
        ["whatsapp", "whatsapp_bots"],
      ];
      const botIdMap = new Map();
      for (const [platform, collectionName] of botCollections) {
        const docs = await db.collection(collectionName).find({}).toArray();
        for (const doc of docs) {
          const botId = await upsertBot(client, platform, doc);
          const legacyId = doc?._id?.toString?.() || String(doc?._id || "");
          botIdMap.set(`${platform}:${legacyId}`, botId);
        }
        await writeCheckpoint(collectionName, docs.length);
      }

      const instructionDocs = await db.collection("instructions_v2").find({}).toArray();
      for (const doc of instructionDocs) {
        await client.query(
          `
            INSERT INTO instructions (
              legacy_instruction_id,
              source_kind,
              name,
              description,
              type,
              content,
              data,
              conversation_starter,
              current_version,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)
            ON CONFLICT (legacy_instruction_id) DO UPDATE SET
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              type = EXCLUDED.type,
              content = EXCLUDED.content,
              data = EXCLUDED.data,
              conversation_starter = EXCLUDED.conversation_starter,
              current_version = EXCLUDED.current_version,
              updated_at = EXCLUDED.updated_at
          `,
          [
            doc?.instructionId || doc?._id?.toString?.() || null,
            "instructions_v2",
            doc?.name || "",
            doc?.description || "",
            doc?.type || "instruction",
            doc?.content || "",
            JSON.stringify(normalizeJson(doc?.dataItems, [])),
            JSON.stringify(normalizeJson(doc?.conversationStarter, {})),
            Number.isInteger(doc?.version) ? doc.version : 1,
            doc?.createdAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("instructions_v2", instructionDocs.length);

      const versionDocs = await db.collection("instruction_versions").find({}).toArray();
      for (const doc of versionDocs) {
        await client.query(
          `
            INSERT INTO instruction_versions (
              legacy_version_id,
              legacy_instruction_id,
              version,
              snapshot,
              note,
              snapshot_at,
              saved_by,
              created_at
            ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
            ON CONFLICT (legacy_version_id) DO UPDATE SET
              snapshot = EXCLUDED.snapshot,
              note = EXCLUDED.note,
              snapshot_at = EXCLUDED.snapshot_at,
              saved_by = EXCLUDED.saved_by
          `,
          [
            doc?._id?.toString?.() || null,
            doc?.instructionId || null,
            doc?.version || 1,
            JSON.stringify(normalizeJson(doc, {})),
            doc?.note || "",
            doc?.snapshotAt || new Date(),
            doc?.savedBy || "migration",
            doc?.snapshotAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("instruction_versions", versionDocs.length);

      const assetDocs = await db.collection("instruction_assets").find({}).toArray();
      for (const doc of assetDocs) {
        await client.query(
          `
            INSERT INTO instruction_assets (
              legacy_asset_id,
              label,
              slug,
              description,
              storage_key,
              thumb_storage_key,
              metadata,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
            ON CONFLICT (legacy_asset_id) DO UPDATE SET
              label = EXCLUDED.label,
              slug = EXCLUDED.slug,
              description = EXCLUDED.description,
              storage_key = EXCLUDED.storage_key,
              thumb_storage_key = EXCLUDED.thumb_storage_key,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
          `,
          [
            doc?._id?.toString?.() || null,
            doc?.label || "",
            doc?.slug || null,
            doc?.description || "",
            doc?.storageKey || doc?.fileName || null,
            doc?.thumbStorageKey || doc?.thumbFileName || null,
            JSON.stringify(normalizeJson(doc, {})),
            doc?.createdAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("instruction_assets", assetDocs.length);

      const imageCollections = await db.collection("image_collections").find({}).toArray();
      for (const doc of imageCollections) {
        const collectionResult = await client.query(
          `
            INSERT INTO image_collections (
              legacy_collection_id,
              name,
              description,
              metadata,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
            ON CONFLICT (legacy_collection_id) DO UPDATE SET
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
            RETURNING id
          `,
          [
            doc?._id?.toString?.() || null,
            doc?.name || "",
            doc?.description || "",
            JSON.stringify(normalizeJson(doc, {})),
            doc?.createdAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );

        await client.query(
          "DELETE FROM image_collection_items WHERE collection_id = $1",
          [collectionResult.rows[0].id],
        );
        const items = Array.isArray(doc?.images) ? doc.images : [];
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          await client.query(
            `
              INSERT INTO image_collection_items (
                collection_id,
                legacy_asset_id,
                sort_order,
                metadata
              ) VALUES ($1,$2,$3,$4::jsonb)
            `,
            [
              collectionResult.rows[0].id,
              item?.assetId || item?._id?.toString?.() || null,
              index,
              JSON.stringify(normalizeJson(item, {})),
            ],
          );
        }
      }
      await writeCheckpoint("image_collections", imageCollections.length);

      const apiKeys = await db.collection("openai_api_keys").find({}).toArray();
      for (const doc of apiKeys) {
        await client.query(
          `
            INSERT INTO api_keys (
              legacy_key_id,
              provider,
              name,
              is_active,
              is_default,
              metadata,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
            ON CONFLICT (legacy_key_id) DO UPDATE SET
              provider = EXCLUDED.provider,
              name = EXCLUDED.name,
              is_active = EXCLUDED.is_active,
              is_default = EXCLUDED.is_default,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
          `,
          [
            doc?._id?.toString?.() || null,
            doc?.provider || "openai",
            doc?.name || "",
            doc?.isActive !== false,
            doc?.isDefault === true,
            JSON.stringify(normalizeJson(doc, {})),
            doc?.createdAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("openai_api_keys", apiKeys.length);

      const orders = await db.collection("orders").find({}).toArray();
      for (const doc of orders) {
        const legacyBotId = doc?.botId ? String(doc.botId) : "";
        const botId = botIdMap.get(`${doc?.platform || "line"}:${legacyBotId}`) || null;
        const orderResult = await client.query(
          `
            INSERT INTO orders (
              legacy_order_id,
              legacy_user_id,
              bot_id,
              platform,
              status,
              totals,
              order_data,
              extracted_at,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
            ON CONFLICT (legacy_order_id) DO UPDATE SET
              status = EXCLUDED.status,
              totals = EXCLUDED.totals,
              order_data = EXCLUDED.order_data,
              extracted_at = EXCLUDED.extracted_at,
              updated_at = EXCLUDED.updated_at
            RETURNING id
          `,
          [
            doc?._id?.toString?.() || null,
            doc?.userId || doc?.senderId || null,
            botId,
            doc?.platform || "line",
            doc?.status || "pending",
            JSON.stringify({
              totalAmount: doc?.orderData?.totalAmount || null,
              shippingCost: doc?.orderData?.shippingCost || null,
            }),
            JSON.stringify(normalizeJson(doc?.orderData, {})),
            doc?.extractedAt || doc?.createdAt || new Date(),
            doc?.createdAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );

        await client.query("DELETE FROM order_items WHERE order_id = $1", [
          orderResult.rows[0].id,
        ]);
        const items = Array.isArray(doc?.orderData?.items) ? doc.orderData.items : [];
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          await client.query(
            `
              INSERT INTO order_items (
                order_id,
                line_number,
                product_name,
                quantity,
                price,
                payload
              ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
            `,
            [
              orderResult.rows[0].id,
              index,
              item?.product || "",
              Number(item?.quantity || 0),
              Number(item?.price || 0),
              JSON.stringify(normalizeJson(item, {})),
            ],
          );
        }
      }
      await writeCheckpoint("orders", orders.length);

      const followUpStatuses = await db.collection("follow_up_status").find({}).toArray().catch(() => []);
      for (const doc of followUpStatuses) {
        const platform =
          typeof doc?.platform === "string" && doc.platform.trim()
            ? doc.platform.trim().toLowerCase()
            : null;
        const legacyBotId = doc?.botId ? String(doc.botId) : "";
        const botId = platform
          ? botIdMap.get(`${platform}:${legacyBotId}`) || null
          : null;
        await client.query(
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
            botId,
            doc?.senderId || null,
            JSON.stringify(normalizeJson(doc, {})),
            doc?.lastAnalyzedAt || doc?.followUpUpdatedAt || doc?.updatedAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("follow_up_status", followUpStatuses.length);

      const followUpPageSettings = await db.collection("follow_up_page_settings").find({}).toArray().catch(() => []);
      for (const doc of followUpPageSettings) {
        const platform =
          typeof doc?.platform === "string" && doc.platform.trim()
            ? doc.platform.trim().toLowerCase()
            : "line";
        const legacyBotId = doc?.botId ? String(doc.botId) : "";
        const botId = legacyBotId
          ? botIdMap.get(`${platform}:${legacyBotId}`) || null
          : null;
        await client.query(
          `
            INSERT INTO follow_up_page_settings (
              platform,
              legacy_bot_id,
              bot_id,
              settings,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
            ON CONFLICT (platform, legacy_bot_id) DO UPDATE SET
              bot_id = EXCLUDED.bot_id,
              settings = EXCLUDED.settings,
              updated_at = EXCLUDED.updated_at
          `,
          [
            platform,
            legacyBotId,
            botId,
            JSON.stringify(normalizeJson(doc?.settings, {})),
            doc?.createdAt || doc?.updatedAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("follow_up_page_settings", followUpPageSettings.length);

      const followUpTasks = await db.collection("follow_up_tasks").find({}).toArray().catch(() => []);
      for (const doc of followUpTasks) {
        const platform =
          typeof doc?.platform === "string" && doc.platform.trim()
            ? doc.platform.trim().toLowerCase()
            : null;
        const legacyBotId = doc?.botId ? String(doc.botId) : "";
        const botId = platform
          ? botIdMap.get(`${platform}:${legacyBotId}`) || null
          : null;
        const status = doc?.completed
          ? "completed"
          : doc?.canceled
            ? "canceled"
            : doc?.status || "pending";
        await client.query(
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
            doc?._id?.toString?.() || null,
            platform,
            botId,
            doc?.userId || null,
            status,
            JSON.stringify(normalizeJson(doc, {})),
            doc?.nextScheduledAt || null,
            doc?.createdAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("follow_up_tasks", followUpTasks.length);

      const notificationChannels = await db.collection("notification_channels").find({}).toArray().catch(() => []);
      for (const doc of notificationChannels) {
        const legacyChannelId = doc?._id?.toString?.() || String(doc?._id || "");
        if (!legacyChannelId) continue;
        await client.query(
          `
            INSERT INTO notification_channels (
              legacy_channel_id,
              name,
              channel_type,
              is_active,
              config,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
            ON CONFLICT (legacy_channel_id) DO UPDATE SET
              name = EXCLUDED.name,
              channel_type = EXCLUDED.channel_type,
              is_active = EXCLUDED.is_active,
              config = EXCLUDED.config,
              updated_at = EXCLUDED.updated_at
          `,
          [
            legacyChannelId,
            doc?.name || "",
            doc?.type || "line_group",
            doc?.isActive !== false,
            JSON.stringify({
              senderBotId: doc?.senderBotId || null,
              botId: doc?.botId || null,
              groupId: doc?.groupId || null,
              lineGroupId: doc?.lineGroupId || null,
              receiveFromAllBots: doc?.receiveFromAllBots === true,
              sources: Array.isArray(doc?.sources) ? doc.sources : [],
              eventTypes: Array.isArray(doc?.eventTypes) ? doc.eventTypes : [],
              deliveryMode: doc?.deliveryMode || "instant",
              summaryTimes: Array.isArray(doc?.summaryTimes) ? doc.summaryTimes : [],
              summaryTimezone: doc?.summaryTimezone || "Asia/Bangkok",
              settings: normalizeJson(doc?.settings, {}),
              lastSummaryAt: doc?.lastSummaryAt || null,
              lastSummarySlotKey: doc?.lastSummarySlotKey || null,
              createdAt: doc?.createdAt || null,
              updatedAt: doc?.updatedAt || null,
            }),
            doc?.createdAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("notification_channels", notificationChannels.length);

      const notificationLogs = await db.collection("notification_logs").find({}).toArray().catch(() => []);
      for (const doc of notificationLogs) {
        const legacyLogId = doc?._id?.toString?.() || String(doc?._id || "");
        if (!legacyLogId) continue;
        await client.query(
          `
            INSERT INTO notification_logs (
              legacy_log_id,
              channel_id,
              status,
              payload,
              created_at
            ) VALUES (
              $1,
              (SELECT id FROM notification_channels WHERE legacy_channel_id = $2 LIMIT 1),
              $3,
              $4::jsonb,
              $5
            )
            ON CONFLICT (legacy_log_id) DO UPDATE SET
              channel_id = EXCLUDED.channel_id,
              status = EXCLUDED.status,
              payload = EXCLUDED.payload,
              created_at = EXCLUDED.created_at
          `,
          [
            legacyLogId,
            doc?.channelId || null,
            doc?.status || "failed",
            JSON.stringify({
              channelId: doc?.channelId || null,
              orderId: doc?.orderId || null,
              eventType: doc?.eventType || null,
              errorMessage: doc?.errorMessage || null,
              response: doc?.response || null,
            }),
            doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("notification_logs", notificationLogs.length);

      const activeUserStatuses = await db.collection("active_user_status").find({}).toArray().catch(() => []);
      for (const doc of activeUserStatuses) {
        await client.query(
          `
            INSERT INTO active_user_status (
              legacy_contact_id,
              ai_enabled,
              updated_at
            ) VALUES ($1,$2,$3)
            ON CONFLICT (legacy_contact_id) DO UPDATE SET
              ai_enabled = EXCLUDED.ai_enabled,
              updated_at = EXCLUDED.updated_at
          `,
          [
            doc?.senderId || null,
            doc?.aiEnabled !== false,
            doc?.updatedAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("active_user_status", activeUserStatuses.length);

      const userTags = await db.collection("user_tags").find({}).toArray().catch(() => []);
      for (const doc of userTags) {
        await client.query(
          `
            INSERT INTO user_tags (
              legacy_contact_id,
              tags,
              updated_at
            ) VALUES ($1,$2::jsonb,$3)
            ON CONFLICT (legacy_contact_id) DO UPDATE SET
              tags = EXCLUDED.tags,
              updated_at = EXCLUDED.updated_at
          `,
          [
            doc?.userId || null,
            JSON.stringify(Array.isArray(doc?.tags) ? doc.tags : []),
            doc?.updatedAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("user_tags", userTags.length);

      const purchaseStatuses = await db.collection("user_purchase_status").find({}).toArray().catch(() => []);
      for (const doc of purchaseStatuses) {
        await client.query(
          `
            INSERT INTO user_purchase_status (
              legacy_contact_id,
              has_purchased,
              updated_by,
              updated_at
            ) VALUES ($1,$2,$3,$4)
            ON CONFLICT (legacy_contact_id) DO UPDATE SET
              has_purchased = EXCLUDED.has_purchased,
              updated_by = EXCLUDED.updated_by,
              updated_at = EXCLUDED.updated_at
          `,
          [
            doc?.userId || null,
            doc?.hasPurchased === true,
            doc?.updatedBy || null,
            doc?.updatedAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("user_purchase_status", purchaseStatuses.length);

      const feedbackDocs = await db.collection("chat_feedback").find({}).toArray().catch(() => []);
      for (const doc of feedbackDocs) {
        const messageLegacyId =
          doc?.messageIdString ||
          doc?.messageId?.toString?.() ||
          null;
        if (!messageLegacyId) continue;
        const platform =
          typeof doc?.platform === "string" && doc.platform.trim()
            ? doc.platform.trim().toLowerCase()
            : null;
        const legacyBotId = doc?.botId ? String(doc.botId) : "";
        const botId = platform
          ? botIdMap.get(`${platform}:${legacyBotId}`) || null
          : null;
        await client.query(
          `
            INSERT INTO chat_feedback (
              message_legacy_id,
              legacy_contact_id,
              sender_id,
              sender_role,
              platform,
              bot_id,
              feedback,
              notes,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (message_legacy_id) DO UPDATE SET
              legacy_contact_id = EXCLUDED.legacy_contact_id,
              sender_id = EXCLUDED.sender_id,
              sender_role = EXCLUDED.sender_role,
              platform = EXCLUDED.platform,
              bot_id = EXCLUDED.bot_id,
              feedback = EXCLUDED.feedback,
              notes = EXCLUDED.notes,
              updated_at = EXCLUDED.updated_at
          `,
          [
            messageLegacyId,
            doc?.userId || null,
            doc?.senderId || null,
            doc?.senderRole || null,
            platform,
            botId,
            doc?.feedback || null,
            doc?.notes || "",
            doc?.createdAt || doc?.updatedAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("chat_feedback", feedbackDocs.length);

      const profiles = await db.collection("user_profiles").find({}).toArray();
      const profileMap = new Map();
      for (const profile of profiles) {
        const platform = profile?.platform || "line";
        const userId = profile?.userId || "";
        profileMap.set(`${platform}:${userId}`, profile);
        if (!userId) continue;
        await upsertContact(client, userId, platform, profile);
      }
      await writeCheckpoint("user_profiles", profiles.length);

      const messages = await db.collection("chat_history").find({}).sort({ timestamp: 1 }).toArray();
      let migratedMessages = 0;
      for (const doc of messages) {
        const platform = doc?.platform || "line";
        const legacyUserId = String(doc?.senderId || doc?.userId || "").trim();
        if (!legacyUserId) continue;

        const profile = profileMap.get(`${platform}:${legacyUserId}`) || {};
        const contactId = await upsertContact(client, legacyUserId, platform, profile);
        const legacyBotId = doc?.botId ? String(doc.botId) : "";
        const botId = botIdMap.get(`${platform}:${legacyBotId}`) || null;
        const legacyThreadKey = `${platform}:${legacyBotId || "default"}:${legacyUserId}`;
        const threadId = await upsertThread(
          client,
          platform,
          botId,
          contactId,
          legacyThreadKey,
          {},
        );

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
            threadId,
            contactId,
            botId,
            doc?._id?.toString?.() || null,
            doc?.role === "user" ? "inbound" : "outbound",
            doc?.role || "user",
            doc?.source || null,
            toText(doc?.content),
            JSON.stringify(normalizeJson(doc?.content, null)),
            JSON.stringify(normalizeJson(doc?.instructionRefs, [])),
            JSON.stringify(normalizeJson(doc?.instructionMeta, [])),
            JSON.stringify({
              botName: doc?.botName || null,
              assistantSource: doc?.assistantSource || null,
              orderExtractionRoundId: doc?.orderExtractionRoundId || null,
              orderExtractionMarkedAt: doc?.orderExtractionMarkedAt || null,
              orderId: doc?.orderId?.toString?.() || doc?.orderId || null,
            }),
            doc?.timestamp || new Date(),
          ],
        );
        migratedMessages += 1;
      }
      await writeCheckpoint("chat_history", migratedMessages);

      const shortLinks = await db.collection("short_links").find({}).toArray().catch(() => []);
      for (const doc of shortLinks) {
        await client.query(
          `
            INSERT INTO short_links (
              code,
              target_url,
              metadata,
              created_at,
              updated_at
            ) VALUES ($1,$2,$3::jsonb,$4,$5)
            ON CONFLICT (code) DO UPDATE SET
              target_url = EXCLUDED.target_url,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
          `,
          [
            doc?.code,
            doc?.targetUrl,
            JSON.stringify(normalizeJson(doc, {})),
            doc?.createdAt || new Date(),
            doc?.updatedAt || doc?.createdAt || new Date(),
          ],
        );
      }
      await writeCheckpoint("short_links", shortLinks.length);
  } finally {
    detachClientErrorLogger();
    pgClient.release();
    await mongo.close();
  }

  console.log("[Migration] MongoDB -> PostgreSQL completed");
}

module.exports = {
  migrateMongoToPostgres,
};

if (require.main === module) {
  migrateMongoToPostgres()
    .then(async () => {
      await closePgPool();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("[Migration] Failed:", error);
      await closePgPool();
      process.exit(1);
    });
}
