"use strict";

const { createMigrationContext } = require("./lib/migrationContext");

function isDryRun() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.DRY_RUN || process.env.MIGRATION_DRY_RUN || "")
      .trim()
      .toLowerCase(),
  );
}

async function countTable(context, tableName) {
  if (!/^[a-z_]+$/.test(tableName)) {
    throw new Error(`Unsafe table name: ${tableName}`);
  }
  const result = await context.postgresRuntime.query(
    `SELECT COUNT(*)::bigint AS count FROM ${tableName}`,
  );
  return Number(result.rows[0]?.count || 0);
}

async function countCollection(context, collectionName) {
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

async function printDryRun(context) {
  const collections = [
    "orders",
    "user_profiles",
    "user_tags",
    "user_purchase_status",
    "user_unread_counts",
    "active_user_status",
    "follow_up_status",
    "follow_up_tasks",
    "openai_usage_logs",
    "instructions_v2",
    "instruction_library",
    "instruction_data_items",
    "instruction_assets",
  ];
  const chatCount = await countTable(context, "chat_messages");
  console.log(`[dry-run] chat_messages=${chatCount}`);
  for (const collectionName of collections) {
    console.log(
      `[dry-run] app_documents.${collectionName}=${await countCollection(context, collectionName)}`,
    );
  }
}

async function rebuildConversationHeads(context) {
  await context.postgresRuntime.query(`
    INSERT INTO chat_conversation_heads (
      platform,
      bot_id,
      user_id,
      last_message_id,
      last_message_at,
      last_message_content,
      last_message_preview,
      last_role,
      message_count,
      updated_at
    )
    SELECT
      COALESCE(NULLIF(platform, ''), 'line') AS platform,
      COALESCE(NULLIF(bot_id, ''), 'default') AS bot_id,
      user_id,
      (ARRAY_AGG(id ORDER BY message_at DESC))[1] AS last_message_id,
      MAX(message_at) AS last_message_at,
      (ARRAY_AGG(content_text ORDER BY message_at DESC))[1] AS last_message_content,
      (ARRAY_AGG(content_text ORDER BY message_at DESC))[1] AS last_message_preview,
      (ARRAY_AGG(role ORDER BY message_at DESC))[1] AS last_role,
      COUNT(*)::integer AS message_count,
      now() AS updated_at
    FROM chat_messages
    WHERE user_id IS NOT NULL AND user_id <> ''
    GROUP BY COALESCE(NULLIF(platform, ''), 'line'),
      COALESCE(NULLIF(bot_id, ''), 'default'),
      user_id
    ON CONFLICT (platform, bot_id, user_id) DO UPDATE SET
      last_message_id = EXCLUDED.last_message_id,
      last_message_at = EXCLUDED.last_message_at,
      last_message_content = EXCLUDED.last_message_content,
      last_message_preview = EXCLUDED.last_message_preview,
      last_role = EXCLUDED.last_role,
      message_count = EXCLUDED.message_count,
      updated_at = now()
  `);
}

async function migrateOrders(context) {
  await context.postgresRuntime.query(`
    INSERT INTO orders (
      id,
      user_id,
      platform,
      bot_id,
      status,
      total_amount,
      shipping_cost,
      order_data,
      payload,
      notes,
      is_manual_extraction,
      extracted_from,
      extracted_at,
      created_at,
      updated_at
    )
    SELECT
      document_id,
      NULLIF(payload->>'userId', ''),
      COALESCE(NULLIF(payload->>'platform', ''), 'line'),
      NULLIF(payload->>'botId', ''),
      COALESCE(NULLIF(payload->>'status', ''), 'pending'),
      CASE
        WHEN payload #>> '{orderData,totalAmount}' ~ '^-?[0-9]+(\\.[0-9]+)?$'
        THEN (payload #>> '{orderData,totalAmount}')::numeric
        ELSE NULL
      END,
      CASE
        WHEN payload #>> '{orderData,shippingCost}' ~ '^-?[0-9]+(\\.[0-9]+)?$'
        THEN (payload #>> '{orderData,shippingCost}')::numeric
        ELSE NULL
      END,
      CASE
        WHEN jsonb_typeof(payload->'orderData') = 'object' THEN payload->'orderData'
        ELSE '{}'::jsonb
      END,
      payload,
      COALESCE(NULLIF(payload->>'notes', ''), NULLIF(payload #>> '{orderData,notes}', '')),
      CASE
        WHEN lower(payload->>'isManualExtraction') IN ('true', '1', 'yes', 'on') THEN true
        ELSE false
      END,
      NULLIF(payload->>'extractedFrom', ''),
      CASE
        WHEN payload->>'extractedAt' ~ '^\\d{4}-\\d{2}-\\d{2}'
        THEN (payload->>'extractedAt')::timestamptz
        ELSE updated_at
      END,
      created_at,
      updated_at
    FROM app_documents
    WHERE collection_name = 'orders'
    ON CONFLICT (id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      bot_id = EXCLUDED.bot_id,
      status = EXCLUDED.status,
      total_amount = EXCLUDED.total_amount,
      shipping_cost = EXCLUDED.shipping_cost,
      order_data = EXCLUDED.order_data,
      payload = EXCLUDED.payload,
      notes = EXCLUDED.notes,
      is_manual_extraction = EXCLUDED.is_manual_extraction,
      extracted_from = EXCLUDED.extracted_from,
      extracted_at = EXCLUDED.extracted_at,
      updated_at = now()
  `);
}

async function migrateUserState(context) {
  await context.postgresRuntime.query(`
    INSERT INTO user_profiles (
      user_id,
      platform,
      display_name,
      picture_url,
      status_message,
      payload,
      updated_at
    )
    SELECT
      COALESCE(NULLIF(payload->>'userId', ''), split_part(document_id, ':', 1)),
      COALESCE(NULLIF(payload->>'platform', ''), 'line'),
      COALESCE(NULLIF(payload->>'displayName', ''), NULLIF(payload->>'name', '')),
      COALESCE(NULLIF(payload->>'pictureUrl', ''), NULLIF(payload->>'profilePicUrl', '')),
      NULLIF(payload->>'statusMessage', ''),
      payload,
      updated_at
    FROM app_documents
    WHERE collection_name = 'user_profiles'
      AND COALESCE(NULLIF(payload->>'userId', ''), split_part(document_id, ':', 1)) <> ''
    ON CONFLICT (user_id, platform) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      picture_url = EXCLUDED.picture_url,
      status_message = EXCLUDED.status_message,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);

  await context.postgresRuntime.query(`
    INSERT INTO user_tags (user_id, tags, payload, updated_at)
    SELECT
      COALESCE(NULLIF(payload->>'userId', ''), document_id),
      CASE WHEN jsonb_typeof(payload->'tags') = 'array' THEN payload->'tags' ELSE '[]'::jsonb END,
      payload,
      updated_at
    FROM app_documents
    WHERE collection_name = 'user_tags'
      AND COALESCE(NULLIF(payload->>'userId', ''), document_id) <> ''
    ON CONFLICT (user_id) DO UPDATE SET
      tags = EXCLUDED.tags,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);

  await context.postgresRuntime.query(`
    INSERT INTO user_purchase_status (user_id, has_purchased, payload, updated_at)
    SELECT
      COALESCE(NULLIF(payload->>'userId', ''), document_id),
      CASE
        WHEN lower(payload->>'hasPurchased') IN ('true', '1', 'yes', 'on') THEN true
        ELSE false
      END,
      payload,
      updated_at
    FROM app_documents
    WHERE collection_name = 'user_purchase_status'
      AND COALESCE(NULLIF(payload->>'userId', ''), document_id) <> ''
    ON CONFLICT (user_id) DO UPDATE SET
      has_purchased = EXCLUDED.has_purchased,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);

  await context.postgresRuntime.query(`
    INSERT INTO user_unread_counts (user_id, unread_count, payload, updated_at)
    SELECT
      COALESCE(NULLIF(payload->>'userId', ''), document_id),
      CASE
        WHEN payload->>'unreadCount' ~ '^[0-9]+$' THEN (payload->>'unreadCount')::integer
        ELSE 0
      END,
      payload,
      updated_at
    FROM app_documents
    WHERE collection_name = 'user_unread_counts'
      AND COALESCE(NULLIF(payload->>'userId', ''), document_id) <> ''
    ON CONFLICT (user_id) DO UPDATE SET
      unread_count = EXCLUDED.unread_count,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);

  await context.postgresRuntime.query(`
    INSERT INTO active_user_status (sender_id, ai_enabled, payload, updated_at)
    SELECT
      COALESCE(NULLIF(payload->>'senderId', ''), document_id),
      CASE
        WHEN lower(payload->>'aiEnabled') IN ('false', '0', 'no', 'off') THEN false
        ELSE true
      END,
      payload,
      updated_at
    FROM app_documents
    WHERE collection_name = 'active_user_status'
      AND COALESCE(NULLIF(payload->>'senderId', ''), document_id) <> ''
    ON CONFLICT (sender_id) DO UPDATE SET
      ai_enabled = EXCLUDED.ai_enabled,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);
}

async function migrateFollowUp(context) {
  await context.postgresRuntime.query(`
    INSERT INTO follow_up_status (
      sender_id,
      has_follow_up,
      follow_up_reason,
      last_analyzed_at,
      follow_up_updated_at,
      payload,
      updated_at
    )
    SELECT
      COALESCE(NULLIF(payload->>'senderId', ''), document_id),
      CASE
        WHEN lower(payload->>'hasFollowUp') IN ('true', '1', 'yes', 'on') THEN true
        ELSE false
      END,
      NULLIF(payload->>'followUpReason', ''),
      CASE
        WHEN payload->>'lastAnalyzedAt' ~ '^\\d{4}-\\d{2}-\\d{2}'
        THEN (payload->>'lastAnalyzedAt')::timestamptz
        ELSE NULL
      END,
      CASE
        WHEN payload->>'followUpUpdatedAt' ~ '^\\d{4}-\\d{2}-\\d{2}'
        THEN (payload->>'followUpUpdatedAt')::timestamptz
        ELSE updated_at
      END,
      payload,
      updated_at
    FROM app_documents
    WHERE collection_name = 'follow_up_status'
      AND COALESCE(NULLIF(payload->>'senderId', ''), document_id) <> ''
    ON CONFLICT (sender_id) DO UPDATE SET
      has_follow_up = EXCLUDED.has_follow_up,
      follow_up_reason = EXCLUDED.follow_up_reason,
      last_analyzed_at = EXCLUDED.last_analyzed_at,
      follow_up_updated_at = EXCLUDED.follow_up_updated_at,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);

  await context.postgresRuntime.query(`
    INSERT INTO follow_up_tasks (
      id,
      user_id,
      platform,
      bot_id,
      next_scheduled_at,
      next_round_index,
      canceled,
      completed,
      payload,
      created_at,
      updated_at
    )
    SELECT
      document_id,
      NULLIF(payload->>'userId', ''),
      COALESCE(NULLIF(payload->>'platform', ''), 'line'),
      NULLIF(payload->>'botId', ''),
      CASE
        WHEN payload->>'nextScheduledAt' ~ '^\\d{4}-\\d{2}-\\d{2}'
        THEN (payload->>'nextScheduledAt')::timestamptz
        ELSE NULL
      END,
      CASE
        WHEN payload->>'nextRoundIndex' ~ '^-?[0-9]+$' THEN (payload->>'nextRoundIndex')::integer
        ELSE 0
      END,
      CASE
        WHEN lower(payload->>'canceled') IN ('true', '1', 'yes', 'on') THEN true
        ELSE false
      END,
      CASE
        WHEN lower(payload->>'completed') IN ('true', '1', 'yes', 'on') THEN true
        ELSE false
      END,
      payload,
      created_at,
      updated_at
    FROM app_documents
    WHERE collection_name = 'follow_up_tasks'
    ON CONFLICT (id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      bot_id = EXCLUDED.bot_id,
      next_scheduled_at = EXCLUDED.next_scheduled_at,
      next_round_index = EXCLUDED.next_round_index,
      canceled = EXCLUDED.canceled,
      completed = EXCLUDED.completed,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);
}

async function migrateOpenAiUsage(context) {
  await context.postgresRuntime.query(`
    INSERT INTO openai_usage_logs (
      id,
      api_key_id,
      bot_id,
      platform,
      provider,
      model,
      function_name,
      prompt_tokens,
      completion_tokens,
      cached_prompt_tokens,
      reasoning_tokens,
      total_tokens,
      estimated_cost,
      usage_at,
      payload,
      created_at,
      updated_at
    )
    SELECT
      document_id,
      NULLIF(payload->>'apiKeyId', ''),
      NULLIF(payload->>'botId', ''),
      NULLIF(payload->>'platform', ''),
      COALESCE(NULLIF(payload->>'provider', ''), 'openai'),
      COALESCE(NULLIF(payload->>'model', ''), 'unknown'),
      NULLIF(payload->>'functionName', ''),
      CASE WHEN payload->>'promptTokens' ~ '^-?[0-9]+$' THEN (payload->>'promptTokens')::bigint ELSE 0 END,
      CASE WHEN payload->>'completionTokens' ~ '^-?[0-9]+$' THEN (payload->>'completionTokens')::bigint ELSE 0 END,
      CASE WHEN payload->>'cachedPromptTokens' ~ '^-?[0-9]+$' THEN (payload->>'cachedPromptTokens')::bigint ELSE 0 END,
      CASE WHEN payload->>'reasoningTokens' ~ '^-?[0-9]+$' THEN (payload->>'reasoningTokens')::bigint ELSE 0 END,
      CASE WHEN payload->>'totalTokens' ~ '^-?[0-9]+$' THEN (payload->>'totalTokens')::bigint ELSE 0 END,
      CASE WHEN payload->>'estimatedCost' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (payload->>'estimatedCost')::numeric ELSE NULL END,
      CASE
        WHEN payload->>'timestamp' ~ '^\\d{4}-\\d{2}-\\d{2}'
        THEN (payload->>'timestamp')::timestamptz
        ELSE updated_at
      END,
      payload,
      created_at,
      updated_at
    FROM app_documents
    WHERE collection_name = 'openai_usage_logs'
    ON CONFLICT (id) DO UPDATE SET
      api_key_id = EXCLUDED.api_key_id,
      bot_id = EXCLUDED.bot_id,
      platform = EXCLUDED.platform,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      function_name = EXCLUDED.function_name,
      prompt_tokens = EXCLUDED.prompt_tokens,
      completion_tokens = EXCLUDED.completion_tokens,
      cached_prompt_tokens = EXCLUDED.cached_prompt_tokens,
      reasoning_tokens = EXCLUDED.reasoning_tokens,
      total_tokens = EXCLUDED.total_tokens,
      estimated_cost = EXCLUDED.estimated_cost,
      usage_at = EXCLUDED.usage_at,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);
}

async function migrateInstructions(context) {
  await context.postgresRuntime.query(`
    INSERT INTO instruction_headers (
      id,
      title,
      status,
      is_active,
      is_default,
      payload,
      updated_at
    )
    SELECT
      document_id,
      COALESCE(NULLIF(payload->>'title', ''), NULLIF(payload->>'name', '')),
      NULLIF(payload->>'status', ''),
      CASE
        WHEN lower(payload->>'isActive') IN ('true', '1', 'yes', 'on') THEN true
        WHEN lower(payload->>'isActive') IN ('false', '0', 'no', 'off') THEN false
        ELSE NULL
      END,
      CASE
        WHEN lower(payload->>'isDefault') IN ('true', '1', 'yes', 'on') THEN true
        WHEN lower(payload->>'isDefault') IN ('false', '0', 'no', 'off') THEN false
        ELSE NULL
      END,
      payload,
      updated_at
    FROM app_documents
    WHERE collection_name IN ('instructions_v2', 'instruction_library')
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      is_active = EXCLUDED.is_active,
      is_default = EXCLUDED.is_default,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);

  await context.postgresRuntime.query(`
    INSERT INTO instruction_data_items (
      id,
      instruction_id,
      item_type,
      title,
      payload,
      updated_at
    )
    SELECT
      document_id,
      NULLIF(payload->>'instructionId', ''),
      COALESCE(NULLIF(payload->>'type', ''), NULLIF(payload->>'itemType', '')),
      COALESCE(NULLIF(payload->>'title', ''), NULLIF(payload->>'name', '')),
      payload,
      updated_at
    FROM app_documents
    WHERE collection_name IN ('instruction_data_items', 'instruction_assets')
    ON CONFLICT (id) DO UPDATE SET
      instruction_id = EXCLUDED.instruction_id,
      item_type = EXCLUDED.item_type,
      title = EXCLUDED.title,
      payload = EXCLUDED.payload,
      updated_at = now()
  `);
}

async function rebuildRollups(context) {
  await context.postgresRuntime.query("DELETE FROM order_daily_metrics");
  await context.postgresRuntime.query(`
    INSERT INTO order_daily_metrics (
      metric_date,
      platform,
      bot_id,
      status,
      order_count,
      total_amount,
      total_shipping,
      updated_at
    )
    SELECT
      (extracted_at AT TIME ZONE 'Asia/Bangkok')::date,
      COALESCE(NULLIF(platform, ''), 'line'),
      COALESCE(NULLIF(bot_id, ''), 'default'),
      COALESCE(NULLIF(status, ''), 'unknown'),
      COUNT(*)::bigint,
      COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN COALESCE(total_amount, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN COALESCE(shipping_cost, 0) ELSE 0 END), 0),
      now()
    FROM orders
    WHERE extracted_at IS NOT NULL
    GROUP BY 1, 2, 3, 4
  `);

  await context.postgresRuntime.query("DELETE FROM order_page_metrics");
  await context.postgresRuntime.query(`
    INSERT INTO order_page_metrics (
      platform,
      bot_id,
      first_order_at,
      last_order_at,
      order_count,
      updated_at
    )
    SELECT
      COALESCE(NULLIF(platform, ''), 'line'),
      COALESCE(NULLIF(bot_id, ''), 'default'),
      MIN(extracted_at),
      MAX(extracted_at),
      COUNT(*)::bigint,
      now()
    FROM orders
    GROUP BY 1, 2
  `);

  await context.postgresRuntime.query("DELETE FROM openai_usage_daily");
  await context.postgresRuntime.query(`
    INSERT INTO openai_usage_daily (
      usage_date,
      provider,
      model,
      platform,
      bot_id,
      call_count,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      estimated_cost,
      updated_at
    )
    SELECT
      (usage_at AT TIME ZONE 'Asia/Bangkok')::date,
      COALESCE(NULLIF(provider, ''), 'openai'),
      COALESCE(NULLIF(model, ''), 'unknown'),
      COALESCE(NULLIF(platform, ''), 'unknown'),
      COALESCE(NULLIF(bot_id, ''), 'default'),
      COUNT(*)::bigint,
      COALESCE(SUM(prompt_tokens), 0)::bigint,
      COALESCE(SUM(completion_tokens), 0)::bigint,
      COALESCE(SUM(total_tokens), 0)::bigint,
      COALESCE(SUM(estimated_cost), 0),
      now()
    FROM openai_usage_logs
    GROUP BY 1, 2, 3, 4, 5
  `);
}

async function main() {
  const context = createMigrationContext();
  try {
    if (!context.postgresRuntime.isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }
    if (isDryRun()) {
      await printDryRun(context);
      return;
    }

    await context.chatStorageService.ensureReady();

    console.log("[native-migration] rebuilding chat_conversation_heads");
    await rebuildConversationHeads(context);
    console.log("[native-migration] migrating orders");
    await migrateOrders(context);
    console.log("[native-migration] migrating user state");
    await migrateUserState(context);
    console.log("[native-migration] migrating follow-up data");
    await migrateFollowUp(context);
    console.log("[native-migration] migrating OpenAI usage logs");
    await migrateOpenAiUsage(context);
    console.log("[native-migration] migrating instruction indexes");
    await migrateInstructions(context);
    console.log("[native-migration] rebuilding rollups");
    await rebuildRollups(context);

    console.log("[native-migration] done");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(
    "[migrate-postgres-performance-native] failed:",
    error?.message || error,
  );
  process.exitCode = 1;
});
