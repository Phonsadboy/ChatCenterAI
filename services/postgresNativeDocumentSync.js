"use strict";

function normalizeString(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value.trim();
  if (typeof value.toString === "function") return value.toString().trim();
  return String(value).trim();
}

function nullableString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizePlatform(value, fallback = "line") {
  const normalized = normalizeString(value).toLowerCase();
  return normalized || fallback;
}

function normalizeNumber(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function normalizeJsonObject(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return value;
}

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolvePayloadId(documentId, payload = {}) {
  return (
    nullableString(documentId) ||
    nullableString(payload._id) ||
    nullableString(payload.id)
  );
}

function createPostgresNativeDocumentSync({ postgresRuntime, logger = console } = {}) {
  function isConfigured() {
    return !!(postgresRuntime && postgresRuntime.isConfigured());
  }

  async function upsertOrder(documentId, payload = {}) {
    const id = resolvePayloadId(documentId, payload);
    if (!id) return;
    const orderData = normalizeJsonObject(payload.orderData);
    const totalAmount =
      normalizeNumber(orderData.totalAmount) ?? normalizeNumber(payload.totalAmount);
    const shippingCost =
      normalizeNumber(orderData.shippingCost) ?? normalizeNumber(payload.shippingCost);
    await postgresRuntime.query(
      `
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
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12,
          COALESCE($13::timestamptz, now()),
          COALESCE($14::timestamptz, now()),
          now()
        )
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
      `,
      [
        id,
        nullableString(payload.userId),
        normalizePlatform(payload.platform),
        nullableString(payload.botId),
        nullableString(payload.status) || "pending",
        totalAmount,
        shippingCost,
        JSON.stringify(orderData),
        JSON.stringify(payload || {}),
        nullableString(payload.notes || orderData.notes),
        normalizeBoolean(payload.isManualExtraction, false),
        nullableString(payload.extractedFrom),
        normalizeDate(payload.extractedAt || payload.createdAt || payload.updatedAt),
        normalizeDate(payload.createdAt || payload.extractedAt || payload.updatedAt),
      ],
    );
  }

  async function upsertUserProfile(documentId, payload = {}) {
    const userId = nullableString(payload.userId) || nullableString(documentId).split(":")[0];
    if (!userId) return;
    const platform = normalizePlatform(payload.platform);
    await postgresRuntime.query(
      `
        INSERT INTO user_profiles (
          user_id,
          platform,
          display_name,
          picture_url,
          status_message,
          payload,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
        ON CONFLICT (user_id, platform) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          picture_url = EXCLUDED.picture_url,
          status_message = EXCLUDED.status_message,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        userId,
        platform,
        nullableString(payload.displayName || payload.name),
        nullableString(payload.pictureUrl || payload.profilePicUrl),
        nullableString(payload.statusMessage),
        JSON.stringify(payload || {}),
      ],
    );
  }

  async function upsertUserTags(documentId, payload = {}) {
    const userId = nullableString(payload.userId) || nullableString(documentId);
    if (!userId) return;
    await postgresRuntime.query(
      `
        INSERT INTO user_tags (user_id, tags, payload, updated_at)
        VALUES ($1, $2::jsonb, $3::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE SET
          tags = EXCLUDED.tags,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        userId,
        JSON.stringify(normalizeJsonArray(payload.tags)),
        JSON.stringify(payload || {}),
      ],
    );
  }

  async function upsertPurchaseStatus(documentId, payload = {}) {
    const userId = nullableString(payload.userId) || nullableString(documentId);
    if (!userId) return;
    await postgresRuntime.query(
      `
        INSERT INTO user_purchase_status (
          user_id,
          has_purchased,
          payload,
          updated_at
        ) VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE SET
          has_purchased = EXCLUDED.has_purchased,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        userId,
        normalizeBoolean(payload.hasPurchased, false),
        JSON.stringify(payload || {}),
      ],
    );
  }

  async function upsertUnreadCount(documentId, payload = {}) {
    const userId = nullableString(payload.userId) || nullableString(documentId);
    if (!userId) return;
    await postgresRuntime.query(
      `
        INSERT INTO user_unread_counts (
          user_id,
          unread_count,
          payload,
          updated_at
        ) VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE SET
          unread_count = EXCLUDED.unread_count,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        userId,
        Math.max(0, normalizeInteger(payload.unreadCount, 0)),
        JSON.stringify(payload || {}),
      ],
    );
  }

  async function upsertActiveUserStatus(documentId, payload = {}) {
    const senderId = nullableString(payload.senderId) || nullableString(documentId);
    if (!senderId) return;
    await postgresRuntime.query(
      `
        INSERT INTO active_user_status (
          sender_id,
          ai_enabled,
          payload,
          updated_at
        ) VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (sender_id) DO UPDATE SET
          ai_enabled = EXCLUDED.ai_enabled,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        senderId,
        normalizeBoolean(payload.aiEnabled, true),
        JSON.stringify(payload || {}),
      ],
    );
  }

  async function upsertFollowUpStatus(documentId, payload = {}) {
    const senderId = nullableString(payload.senderId) || nullableString(documentId);
    if (!senderId) return;
    await postgresRuntime.query(
      `
        INSERT INTO follow_up_status (
          sender_id,
          has_follow_up,
          follow_up_reason,
          last_analyzed_at,
          follow_up_updated_at,
          payload,
          updated_at
        ) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::jsonb, now())
        ON CONFLICT (sender_id) DO UPDATE SET
          has_follow_up = EXCLUDED.has_follow_up,
          follow_up_reason = EXCLUDED.follow_up_reason,
          last_analyzed_at = EXCLUDED.last_analyzed_at,
          follow_up_updated_at = EXCLUDED.follow_up_updated_at,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        senderId,
        normalizeBoolean(payload.hasFollowUp, false),
        nullableString(payload.followUpReason),
        normalizeDate(payload.lastAnalyzedAt),
        normalizeDate(payload.followUpUpdatedAt || payload.updatedAt),
        JSON.stringify(payload || {}),
      ],
    );
  }

  async function upsertFollowUpTask(documentId, payload = {}) {
    const id = resolvePayloadId(documentId, payload);
    if (!id) return;
    await postgresRuntime.query(
      `
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
        ) VALUES (
          $1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9::jsonb,
          COALESCE($10::timestamptz, now()),
          now()
        )
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
      `,
      [
        id,
        nullableString(payload.userId),
        normalizePlatform(payload.platform),
        nullableString(payload.botId),
        normalizeDate(payload.nextScheduledAt),
        normalizeInteger(payload.nextRoundIndex, 0),
        normalizeBoolean(payload.canceled, false),
        normalizeBoolean(payload.completed, false),
        JSON.stringify(payload || {}),
        normalizeDate(payload.createdAt || payload.updatedAt),
      ],
    );
  }

  async function upsertOpenAiUsage(documentId, payload = {}) {
    const id = resolvePayloadId(documentId, payload);
    const usageAt = normalizeDate(payload.timestamp || payload.createdAt || payload.updatedAt);
    if (!id || !usageAt) return;
    await postgresRuntime.query(
      `
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
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz,
          $15::jsonb, COALESCE($16::timestamptz, now()), now()
        )
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
      `,
      [
        id,
        nullableString(payload.apiKeyId),
        nullableString(payload.botId),
        nullableString(payload.platform),
        nullableString(payload.provider) || "openai",
        nullableString(payload.model) || "unknown",
        nullableString(payload.functionName),
        normalizeInteger(payload.promptTokens, 0),
        normalizeInteger(payload.completionTokens, 0),
        normalizeInteger(payload.cachedPromptTokens, 0),
        normalizeInteger(payload.reasoningTokens, 0),
        normalizeInteger(payload.totalTokens, 0),
        normalizeNumber(payload.estimatedCost),
        usageAt,
        JSON.stringify(payload || {}),
        normalizeDate(payload.createdAt || payload.timestamp),
      ],
    );
  }

  async function upsertInstructionHeader(documentId, payload = {}) {
    const id = resolvePayloadId(documentId, payload);
    if (!id) return;
    await postgresRuntime.query(
      `
        INSERT INTO instruction_headers (
          id,
          title,
          status,
          is_active,
          is_default,
          payload,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          status = EXCLUDED.status,
          is_active = EXCLUDED.is_active,
          is_default = EXCLUDED.is_default,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        id,
        nullableString(payload.title || payload.name),
        nullableString(payload.status),
        payload.isActive === undefined ? null : normalizeBoolean(payload.isActive, false),
        payload.isDefault === undefined ? null : normalizeBoolean(payload.isDefault, false),
        JSON.stringify(payload || {}),
      ],
    );
  }

  async function upsertInstructionDataItem(documentId, payload = {}) {
    const id = resolvePayloadId(documentId, payload);
    if (!id) return;
    await postgresRuntime.query(
      `
        INSERT INTO instruction_data_items (
          id,
          instruction_id,
          item_type,
          title,
          payload,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          instruction_id = EXCLUDED.instruction_id,
          item_type = EXCLUDED.item_type,
          title = EXCLUDED.title,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        id,
        nullableString(payload.instructionId),
        nullableString(payload.type || payload.itemType),
        nullableString(payload.title || payload.name),
        JSON.stringify(payload || {}),
      ],
    );
  }

  async function upsertDocument(collectionName, documentId, payload = {}) {
    if (!isConfigured()) return;
    switch (collectionName) {
      case "orders":
        await upsertOrder(documentId, payload);
        break;
      case "user_profiles":
        await upsertUserProfile(documentId, payload);
        break;
      case "user_tags":
        await upsertUserTags(documentId, payload);
        break;
      case "user_purchase_status":
        await upsertPurchaseStatus(documentId, payload);
        break;
      case "user_unread_counts":
        await upsertUnreadCount(documentId, payload);
        break;
      case "active_user_status":
        await upsertActiveUserStatus(documentId, payload);
        break;
      case "follow_up_status":
        await upsertFollowUpStatus(documentId, payload);
        break;
      case "follow_up_tasks":
        await upsertFollowUpTask(documentId, payload);
        break;
      case "openai_usage_logs":
        await upsertOpenAiUsage(documentId, payload);
        break;
      case "instructions_v2":
      case "instruction_library":
        await upsertInstructionHeader(documentId, payload);
        break;
      case "instruction_data_items":
      case "instruction_assets":
        await upsertInstructionDataItem(documentId, payload);
        break;
      default:
        break;
    }
  }

  async function deleteDocument(collectionName, documentId) {
    if (!isConfigured()) return;
    const id = nullableString(documentId);
    if (!id) return;
    const deleteMap = {
      active_user_status: ["active_user_status", "sender_id"],
      follow_up_status: ["follow_up_status", "sender_id"],
      follow_up_tasks: ["follow_up_tasks", "id"],
      instruction_assets: ["instruction_data_items", "id"],
      instruction_data_items: ["instruction_data_items", "id"],
      instruction_library: ["instruction_headers", "id"],
      instructions_v2: ["instruction_headers", "id"],
      openai_usage_logs: ["openai_usage_logs", "id"],
      orders: ["orders", "id"],
      user_profiles: ["user_profiles", null],
      user_purchase_status: ["user_purchase_status", "user_id"],
      user_tags: ["user_tags", "user_id"],
      user_unread_counts: ["user_unread_counts", "user_id"],
    };
    const target = deleteMap[collectionName];
    if (!target) return;
    if (collectionName === "user_profiles") {
      const [userId, platform = "line"] = id.split(":");
      if (!userId) return;
      await postgresRuntime.query(
        `DELETE FROM user_profiles WHERE user_id = $1 AND platform = $2`,
        [userId, platform || "line"],
      );
      return;
    }
    const [tableName, columnName] = target;
    if (!/^[a-z_]+$/.test(tableName) || !/^[a-z_]+$/.test(columnName)) return;
    await postgresRuntime.query(
      `DELETE FROM ${tableName} WHERE ${columnName} = $1`,
      [id],
    );
  }

  async function safelyUpsertDocument(collectionName, documentId, payload = {}) {
    try {
      await upsertDocument(collectionName, documentId, payload);
    } catch (error) {
      logger.warn?.(
        `[NativeSync] upsert failed ${collectionName}/${documentId}:`,
        error?.message || error,
      );
    }
  }

  async function safelyDeleteDocument(collectionName, documentId) {
    try {
      await deleteDocument(collectionName, documentId);
    } catch (error) {
      logger.warn?.(
        `[NativeSync] delete failed ${collectionName}/${documentId}:`,
        error?.message || error,
      );
    }
  }

  return {
    deleteDocument,
    safelyDeleteDocument,
    safelyUpsertDocument,
    upsertDocument,
  };
}

module.exports = {
  createPostgresNativeDocumentSync,
};
