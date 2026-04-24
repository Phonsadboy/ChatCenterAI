"use strict";

const crypto = require("crypto");
const { ObjectId } = require("bson");
const {
  detectImageMimeType,
} = require("../utils/chatImageUtils");
const {
  createPostgresNativeDocumentSync,
} = require("./postgresNativeDocumentSync");

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

function normalizeBase64ImageValue(value) {
  if (typeof value !== "string") return null;
  let trimmed = value.trim();
  if (!trimmed) return null;

  let mime = "";
  const dataUrlMatch = trimmed.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/,
  );
  if (dataUrlMatch) {
    mime = dataUrlMatch[1];
    trimmed = dataUrlMatch[2] || "";
  }

  const compact = trimmed.replace(/\s+/g, "");
  if (!compact) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return null;

  return { base64: compact, mime: mime || null };
}

function buildMessageId(rawId) {
  if (rawId && typeof rawId.toString === "function") {
    const serialized = rawId.toString();
    if (serialized) return serialized;
  }
  return new ObjectId().toString();
}

function normalizeMessageTimestamp(rawValue) {
  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return rawValue;
  }
  if (typeof rawValue === "string" || typeof rawValue === "number") {
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function buildChatImageRoute(messageId, attachmentIndex) {
  return `/assets/chat-images/${encodeURIComponent(messageId)}/${attachmentIndex}`;
}

function contentTypeToExtension(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function buildPreviewText(value) {
  if (typeof value === "string") {
    const parsed = safeJsonParse(value);
    if (parsed !== null) {
      return buildPreviewText(parsed);
    }
    return value.trim();
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => buildPreviewText(entry))
      .filter((entry) => typeof entry === "string" && entry.trim().length > 0);
    return parts.join("\n").trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (value.type === "text") {
    const rawText =
      typeof value.content === "string"
        ? value.content
        : typeof value.text === "string"
          ? value.text
          : "";
    return rawText.trim();
  }

  if (value.type === "image") {
    return value.caption || value.alt || value.description || "[รูปภาพ]";
  }

  if (value.type === "audio") {
    return value.description || value.text || "[ไฟล์เสียง]";
  }

  if (value.data && typeof value.data === "object") {
    return buildPreviewText(value.data);
  }

  return Object.values(value)
    .map((entry) => buildPreviewText(entry))
    .find((entry) => typeof entry === "string" && entry.trim().length > 0) || "";
}

function serializeContent(rawValue) {
  if (typeof rawValue === "string") {
    const parsed = safeJsonParse(rawValue);
    return {
      contentText: rawValue,
      contentJson: parsed,
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

function cloneWithoutBinaryImageFields(node, sourceUrl) {
  const cloned = { ...node };
  delete cloned.base64;
  delete cloned.content;
  cloned.url = sourceUrl;
  cloned.previewUrl = cloned.previewUrl || sourceUrl;
  return cloned;
}

function normalizeAssetObjectRow(row) {
  if (!row) return null;
  return {
    assetScope: row.asset_scope,
    assetId: row.asset_id,
    fileName: row.file_name || null,
    bucketKey: row.bucket_key || null,
    mimeType: row.mime_type || null,
    sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeAppDocumentRow(row) {
  if (!row) return null;
  return {
    collectionName: row.collection_name,
    documentId: row.document_id,
    payload:
      row.payload && typeof row.payload === "object" ? row.payload : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function createChatStorageService({
  postgresRuntime,
  bucketClient,
  hotRetentionDays = 60,
  useConversationHeads = false,
  logger = console,
} = {}) {
  let ensureReadyPromise = null;
  const nativeDocumentSync = createPostgresNativeDocumentSync({
    postgresRuntime,
    logger,
  });

  async function ensureReady() {
    if (!postgresRuntime || !postgresRuntime.isConfigured()) return;
    if (!ensureReadyPromise) {
      ensureReadyPromise = postgresRuntime.ensureSchema({ hotRetentionDays });
    }
    await ensureReadyPromise;
  }

  function isConfigured() {
    return !!(postgresRuntime && postgresRuntime.isConfigured());
  }

  async function rewriteContentAndCollectAttachments(messageId, rawContent) {
    const parsedValue =
      typeof rawContent === "string" ? safeJsonParse(rawContent) : rawContent;
    if (parsedValue === null) {
      return {
        storedContent: rawContent,
        attachments: [],
      };
    }

    const attachments = [];

    const visit = async (node) => {
      if (Array.isArray(node)) {
        const result = [];
        for (const entry of node) {
          result.push(await visit(entry));
        }
        return result;
      }

      if (!node || typeof node !== "object") {
        return node;
      }

      if (node.type === "image") {
        const payload = normalizeBase64ImageValue(node.base64 || node.content);
        if (!payload || !bucketClient || !bucketClient.isConfigured()) {
          return node;
        }

        const attachmentIndex = attachments.length;
        const contentType = payload.mime || detectImageMimeType(payload.base64);
        const buffer = Buffer.from(payload.base64, "base64");
        const extension = contentTypeToExtension(contentType);
        const checksum = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex")
          .slice(0, 24);
        const objectKey = bucketClient.buildKey(
          "chat-images",
          messageId,
          `${attachmentIndex}-${checksum}.${extension}`,
        );
        await bucketClient.putBuffer(objectKey, buffer, {
          contentType,
          cacheControl: "private, max-age=31536000, immutable",
          metadata: {
            messageId,
            attachmentIndex: String(attachmentIndex),
            checksum,
          },
        });

        const sourceUrl = buildChatImageRoute(messageId, attachmentIndex);
        attachments.push({
          attachmentIndex,
          bucketKey: objectKey,
          contentType,
          sizeBytes: buffer.length,
          sourceUrl,
          previewUrl: sourceUrl,
          metadata: {
            checksum,
            migratedFrom: "inline_base64",
          },
        });

        return cloneWithoutBinaryImageFields(node, sourceUrl);
      }

      const nextNode = Array.isArray(node) ? [] : { ...node };
      for (const [key, value] of Object.entries(node)) {
        nextNode[key] = await visit(value);
      }
      return nextNode;
    };

    const transformed = await visit(parsedValue);
    if (!attachments.length) {
      return {
        storedContent: rawContent,
        attachments,
      };
    }

    return {
      storedContent:
        typeof rawContent === "string" ? JSON.stringify(transformed) : transformed,
      attachments,
    };
  }

  async function mirrorMessage(messageDoc = {}, options = {}) {
    if (!isConfigured()) return null;
    await ensureReady();

    const messageId = buildMessageId(messageDoc._id || options.messageId);
    const userId =
      typeof options.userId === "string" && options.userId.trim()
        ? options.userId.trim()
        : typeof messageDoc.senderId === "string" && messageDoc.senderId.trim()
          ? messageDoc.senderId.trim()
          : typeof messageDoc.userId === "string" && messageDoc.userId.trim()
            ? messageDoc.userId.trim()
            : "";

    if (!userId) {
      return null;
    }

    const timestamp = normalizeMessageTimestamp(messageDoc.timestamp);
    const prepared = await rewriteContentAndCollectAttachments(
      messageId,
      messageDoc.content,
    );
    const serialized = serializeContent(prepared.storedContent);
    const previewText = buildPreviewText(prepared.storedContent);
    const client = await postgresRuntime.getPool().connect();

    try {
      await client.query("BEGIN");

      const insertResult = await client.query(
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
          ) VALUES (
            $1, $2, $3, $4, $5::jsonb, $6, $7, $8,
            $9::jsonb, $10::jsonb, $11::jsonb, $12, $13,
            $14::jsonb, $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (id, message_at) DO NOTHING
          RETURNING id
        `,
        [
          messageId,
          userId,
          messageDoc.role || "user",
          serialized.contentText,
          serialized.contentJson ? JSON.stringify(serialized.contentJson) : null,
          messageDoc.source || null,
          messageDoc.platform || "line",
          messageDoc.botId || null,
          Array.isArray(messageDoc.instructionRefs)
            ? JSON.stringify(messageDoc.instructionRefs)
            : null,
          Array.isArray(messageDoc.instructionMeta)
            ? JSON.stringify(messageDoc.instructionMeta)
            : null,
          Array.isArray(messageDoc.tool_calls)
            ? JSON.stringify(messageDoc.tool_calls)
            : null,
          messageDoc.tool_call_id || null,
          messageDoc.name || null,
          messageDoc.metadata &&
            typeof messageDoc.metadata === "object" &&
            !Array.isArray(messageDoc.metadata)
            ? JSON.stringify(messageDoc.metadata)
            : null,
          messageDoc.senderId || null,
          messageDoc.userId || null,
          messageDoc.orderExtractionRoundId
            ? String(messageDoc.orderExtractionRoundId)
            : null,
          messageDoc.orderExtractionMarkedAt || null,
          messageDoc.orderId
            ? messageDoc.orderId.toString?.() || String(messageDoc.orderId)
            : null,
          timestamp.toISOString(),
        ],
      );

      if (!insertResult.rowCount) {
        await client.query("ROLLBACK");
        return { messageId, inserted: false };
      }

      for (const attachment of prepared.attachments) {
        await client.query(
          `
            INSERT INTO chat_message_attachments (
              message_id,
              attachment_index,
              kind,
              bucket_key,
              content_type,
              size_bytes,
              source_url,
              preview_url,
              metadata
            ) VALUES (
              $1, $2, 'image', $3, $4, $5, $6, $7, $8::jsonb
            )
            ON CONFLICT (message_id, attachment_index) DO UPDATE SET
              bucket_key = EXCLUDED.bucket_key,
              content_type = EXCLUDED.content_type,
              size_bytes = EXCLUDED.size_bytes,
              source_url = EXCLUDED.source_url,
              preview_url = EXCLUDED.preview_url,
              metadata = EXCLUDED.metadata
          `,
          [
            messageId,
            attachment.attachmentIndex,
            attachment.bucketKey || null,
            attachment.contentType || null,
            attachment.sizeBytes || null,
            attachment.sourceUrl || null,
            attachment.previewUrl || null,
            attachment.metadata ? JSON.stringify(attachment.metadata) : null,
          ],
        );
      }

      await client.query(
        `
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
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, now())
          ON CONFLICT (user_id) DO UPDATE SET
            last_message_id = CASE
              WHEN chat_conversations.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversations.last_message_at
              THEN EXCLUDED.last_message_id
              ELSE chat_conversations.last_message_id
            END,
            last_message_at = GREATEST(
              COALESCE(chat_conversations.last_message_at, EXCLUDED.last_message_at),
              EXCLUDED.last_message_at
            ),
            last_message_content = CASE
              WHEN chat_conversations.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversations.last_message_at
              THEN EXCLUDED.last_message_content
              ELSE chat_conversations.last_message_content
            END,
            last_message_preview = CASE
              WHEN chat_conversations.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversations.last_message_at
              THEN EXCLUDED.last_message_preview
              ELSE chat_conversations.last_message_preview
            END,
            last_role = CASE
              WHEN chat_conversations.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversations.last_message_at
              THEN EXCLUDED.last_role
              ELSE chat_conversations.last_role
            END,
            platform = CASE
              WHEN chat_conversations.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversations.last_message_at
              THEN EXCLUDED.platform
              ELSE chat_conversations.platform
            END,
            bot_id = CASE
              WHEN chat_conversations.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversations.last_message_at
              THEN EXCLUDED.bot_id
              ELSE chat_conversations.bot_id
            END,
            message_count = chat_conversations.message_count + 1,
            updated_at = now()
        `,
        [
          userId,
          messageId,
          timestamp.toISOString(),
          serialized.contentText,
          previewText,
          messageDoc.role || "user",
          messageDoc.platform || "line",
          messageDoc.botId || null,
        ],
      );

      await client.query(
        `
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
          ) VALUES (
            $1, COALESCE(NULLIF($2, ''), 'default'), $3, $4, $5, $6, $7, $8, 1, now()
          )
          ON CONFLICT (platform, bot_id, user_id) DO UPDATE SET
            last_message_id = CASE
              WHEN chat_conversation_heads.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversation_heads.last_message_at
              THEN EXCLUDED.last_message_id
              ELSE chat_conversation_heads.last_message_id
            END,
            last_message_at = GREATEST(
              COALESCE(chat_conversation_heads.last_message_at, EXCLUDED.last_message_at),
              EXCLUDED.last_message_at
            ),
            last_message_content = CASE
              WHEN chat_conversation_heads.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversation_heads.last_message_at
              THEN EXCLUDED.last_message_content
              ELSE chat_conversation_heads.last_message_content
            END,
            last_message_preview = CASE
              WHEN chat_conversation_heads.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversation_heads.last_message_at
              THEN EXCLUDED.last_message_preview
              ELSE chat_conversation_heads.last_message_preview
            END,
            last_role = CASE
              WHEN chat_conversation_heads.last_message_at IS NULL
                OR EXCLUDED.last_message_at >= chat_conversation_heads.last_message_at
              THEN EXCLUDED.last_role
              ELSE chat_conversation_heads.last_role
            END,
            message_count = chat_conversation_heads.message_count + 1,
            updated_at = now()
        `,
        [
          messageDoc.platform || "line",
          messageDoc.botId || null,
          userId,
          messageId,
          timestamp.toISOString(),
          serialized.contentText,
          previewText,
          messageDoc.role || "user",
        ],
      );

      await client.query("COMMIT");
      return {
        attachments: prepared.attachments,
        inserted: true,
        messageId,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function listMessagesForUser(userId, options = {}) {
    if (!isConfigured()) return [];
    await ensureReady();

    const limit =
      typeof options.limit === "number" && Number.isFinite(options.limit)
        ? options.limit
        : null;
    const order = options.order === "desc" ? "DESC" : "ASC";
    const params = [userId];
    const limitClause = limit && limit > 0 ? ` LIMIT $${params.length + 1}` : "";
    if (limit && limit > 0) {
      params.push(limit);
    }
    const result = await postgresRuntime.query(
      `
        SELECT
          id,
          user_id,
          role,
          content_text,
          source,
          platform,
          bot_id,
          message_at,
          order_extraction_round_id
        FROM chat_messages
        WHERE user_id = $1
        ORDER BY message_at ${order}${limitClause}
      `,
      params,
    );

    return result.rows.map((row) => ({
      _id: row.id,
      senderId: row.user_id,
      role: row.role,
      content: row.content_text || "",
      source: row.source || null,
      platform: row.platform || "line",
      botId: row.bot_id || null,
      timestamp: row.message_at,
      orderExtractionRoundId: row.order_extraction_round_id || null,
    }));
  }

  async function listConversationUsers(options = {}) {
    if (!isConfigured()) return [];
    await ensureReady();

    const limit = Number.isFinite(options.limit) ? options.limit : 50;
    const focusUserId =
      typeof options.focusUserId === "string" ? options.focusUserId.trim() : "";

    if (useConversationHeads) {
      const headsResult = await postgresRuntime.query(
        `
          SELECT
            user_id,
            last_message_content,
            last_message_at,
            message_count,
            platform,
            NULLIF(bot_id, 'default') AS bot_id
          FROM chat_conversation_heads
          ORDER BY last_message_at DESC NULLS LAST
          LIMIT $1
        `,
        [limit],
      );
      const headRows = headsResult.rows.map((row) => ({
        _id: row.user_id,
        lastMessage: row.last_message_content || "",
        lastTimestamp: row.last_message_at,
        messageCount: Number(row.message_count || 0),
        platform: row.platform || "line",
        botId: row.bot_id || null,
      }));

      if (
        focusUserId &&
        !headRows.some((row) => String(row._id || "") === focusUserId)
      ) {
        const focusResult = await postgresRuntime.query(
          `
            SELECT
              user_id,
              last_message_content,
              last_message_at,
              message_count,
              platform,
              NULLIF(bot_id, 'default') AS bot_id
            FROM chat_conversation_heads
            WHERE user_id = $1
            ORDER BY last_message_at DESC NULLS LAST
            LIMIT 1
          `,
          [focusUserId],
        );
        if (focusResult.rows[0]) {
          headRows.unshift({
            _id: focusResult.rows[0].user_id,
            lastMessage: focusResult.rows[0].last_message_content || "",
            lastTimestamp: focusResult.rows[0].last_message_at,
            messageCount: Number(focusResult.rows[0].message_count || 0),
            platform: focusResult.rows[0].platform || "line",
            botId: focusResult.rows[0].bot_id || null,
          });
        }
      }

      if (headRows.length > 0) {
        return headRows;
      }
    }

    const usersResult = await postgresRuntime.query(
      `
        SELECT
          user_id,
          last_message_content,
          last_message_at,
          message_count,
          platform,
          bot_id
        FROM chat_conversations
        ORDER BY last_message_at DESC NULLS LAST
        LIMIT $1
      `,
      [limit],
    );

    const rows = usersResult.rows.map((row) => ({
      _id: row.user_id,
      lastMessage: row.last_message_content || "",
      lastTimestamp: row.last_message_at,
      messageCount: Number(row.message_count || 0),
      platform: row.platform || "line",
      botId: row.bot_id || null,
    }));

    if (
      focusUserId &&
      !rows.some((row) => String(row._id || "") === focusUserId)
    ) {
      const focusResult = await postgresRuntime.query(
        `
          SELECT
            user_id,
            last_message_content,
            last_message_at,
            message_count,
            platform,
            bot_id
          FROM chat_conversations
          WHERE user_id = $1
          LIMIT 1
        `,
        [focusUserId],
      );
      if (focusResult.rows[0]) {
        rows.unshift({
          _id: focusResult.rows[0].user_id,
          lastMessage: focusResult.rows[0].last_message_content || "",
          lastTimestamp: focusResult.rows[0].last_message_at,
          messageCount: Number(focusResult.rows[0].message_count || 0),
          platform: focusResult.rows[0].platform || "line",
          botId: focusResult.rows[0].bot_id || null,
        });
      }
    }

    return rows;
  }

  async function getAttachment(messageId, attachmentIndex) {
    if (!isConfigured()) return null;
    await ensureReady();

    const result = await postgresRuntime.query(
      `
        SELECT bucket_key, content_type, source_url, preview_url, size_bytes
        FROM chat_message_attachments
        WHERE message_id = $1 AND attachment_index = $2
        LIMIT 1
      `,
      [messageId, attachmentIndex],
    );
    return result.rows[0] || null;
  }

  async function listAttachmentsForMessages(messageIds = []) {
    if (!isConfigured() || !Array.isArray(messageIds) || !messageIds.length) {
      return new Map();
    }
    await ensureReady();

    const ids = [...new Set(
      messageIds
        .map((id) => (id && typeof id.toString === "function" ? id.toString() : ""))
        .map((id) => id.trim())
        .filter(Boolean),
    )];
    if (!ids.length) return new Map();

    const result = await postgresRuntime.query(
      `
        SELECT
          message_id,
          attachment_index,
          kind,
          bucket_key,
          content_type,
          source_url,
          preview_url,
          size_bytes
        FROM chat_message_attachments
        WHERE message_id = ANY($1::text[])
        ORDER BY message_id ASC, attachment_index ASC
      `,
      [ids],
    );

    const grouped = new Map();
    for (const row of result.rows) {
      const key = row.message_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }
    return grouped;
  }

  async function getMessageById(messageId) {
    if (!isConfigured()) return null;
    await ensureReady();

    const result = await postgresRuntime.query(
      `
        SELECT
          id,
          user_id,
          role,
          content_text,
          source,
          platform,
          bot_id,
          message_at
        FROM chat_messages
        WHERE id = $1
        ORDER BY message_at DESC
        LIMIT 1
      `,
      [messageId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      _id: row.id,
      senderId: row.user_id,
      role: row.role,
      content: row.content_text || "",
      source: row.source || null,
      platform: row.platform || "line",
      botId: row.bot_id || null,
      timestamp: row.message_at,
    };
  }

  async function deleteUserHistory(userId) {
    if (!isConfigured()) return;
    await ensureReady();

    await postgresRuntime.query(
      `
        DELETE FROM chat_message_attachments
        WHERE message_id IN (
          SELECT id FROM chat_messages WHERE user_id = $1
        )
      `,
      [userId],
    );
    await postgresRuntime.query(
      `DELETE FROM chat_messages WHERE user_id = $1`,
      [userId],
    );
    await postgresRuntime.query(
      `DELETE FROM chat_conversations WHERE user_id = $1`,
      [userId],
    );
    await postgresRuntime.query(
      `DELETE FROM chat_conversation_heads WHERE user_id = $1`,
      [userId],
    );
  }

  async function updateMessagesMetadata(userId, messageIds = [], patch = {}) {
    if (!isConfigured() || !Array.isArray(messageIds) || !messageIds.length) {
      return;
    }
    await ensureReady();

    await postgresRuntime.query(
      `
        UPDATE chat_messages
        SET
          order_extraction_round_id = COALESCE($3, order_extraction_round_id),
          order_extraction_marked_at = CASE
            WHEN $3 IS NULL THEN order_extraction_marked_at
            ELSE now()
          END,
          order_id = COALESCE($4, order_id)
        WHERE user_id = $1
          AND id = ANY($2::text[])
      `,
      [
        userId,
        messageIds,
        patch.orderExtractionRoundId
          ? String(patch.orderExtractionRoundId)
          : null,
        patch.orderId ? String(patch.orderId) : null,
      ],
    );
  }

  async function upsertDocument(collectionName, documentId, payload = {}) {
    if (!isConfigured()) return;
    await ensureReady();

    await postgresRuntime.query(
      `
        INSERT INTO app_documents (
          collection_name,
          document_id,
          payload,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3::jsonb, now(), now())
        ON CONFLICT (collection_name, document_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [collectionName, documentId, JSON.stringify(payload || {})],
    );
    await nativeDocumentSync.safelyUpsertDocument(
      collectionName,
      documentId,
      payload || {},
    );
  }

  async function getDocument(collectionName, documentId) {
    if (!isConfigured()) return null;
    await ensureReady();

    const result = await postgresRuntime.query(
      `
        SELECT
          collection_name,
          document_id,
          payload,
          created_at,
          updated_at
        FROM app_documents
        WHERE collection_name = $1 AND document_id = $2
        LIMIT 1
      `,
      [collectionName, documentId],
    );

    return normalizeAppDocumentRow(result.rows[0]);
  }

  async function getDocuments(collectionName, documentIds = []) {
    if (!isConfigured()) return [];
    await ensureReady();

    const uniqueIds = Array.from(
      new Set(
        (Array.isArray(documentIds) ? documentIds : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );
    if (!uniqueIds.length) return [];

    const result = await postgresRuntime.query(
      `
        SELECT
          collection_name,
          document_id,
          payload,
          created_at,
          updated_at
        FROM app_documents
        WHERE collection_name = $1
          AND document_id = ANY($2::text[])
      `,
      [collectionName, uniqueIds],
    );

    return result.rows.map((row) => normalizeAppDocumentRow(row));
  }

  async function listDocuments(collectionName, options = {}) {
    if (!isConfigured()) return [];
    await ensureReady();

    const rawLimit = Number(options.limit || 100);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 1000))
      : 100;
    const orderDirection = options.order === "asc" ? "ASC" : "DESC";
    const result = await postgresRuntime.query(
      `
        SELECT
          collection_name,
          document_id,
          payload,
          created_at,
          updated_at
        FROM app_documents
        WHERE collection_name = $1
        ORDER BY updated_at ${orderDirection}
        LIMIT $2
      `,
      [collectionName, limit],
    );

    return result.rows.map((row) => normalizeAppDocumentRow(row));
  }

  async function findDocumentsByPayloadField(
    collectionName,
    fieldName,
    fieldValue,
    options = {},
  ) {
    if (!isConfigured()) return [];
    await ensureReady();
    if (!/^[a-zA-Z0-9_.-]+$/.test(String(fieldName || ""))) {
      throw new Error(`Unsupported app document field name: ${fieldName}`);
    }

    const rawLimit = Number(options.limit || 100);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 1000))
      : 100;
    const orderDirection = options.order === "asc" ? "ASC" : "DESC";
    const result = await postgresRuntime.query(
      `
        SELECT
          collection_name,
          document_id,
          payload,
          created_at,
          updated_at
        FROM app_documents
        WHERE collection_name = $1
          AND payload->>$2 = $3
        ORDER BY updated_at ${orderDirection}
        LIMIT $4
      `,
      [collectionName, fieldName, String(fieldValue), limit],
    );

    return result.rows.map((row) => normalizeAppDocumentRow(row));
  }

  async function countDocumentsByPayloadFieldValues(
    collectionName,
    fieldName,
    fieldValues = [],
  ) {
    if (!isConfigured()) return [];
    await ensureReady();
    if (!/^[a-zA-Z0-9_.-]+$/.test(String(fieldName || ""))) {
      throw new Error(`Unsupported app document field name: ${fieldName}`);
    }

    const uniqueValues = Array.from(
      new Set(
        (Array.isArray(fieldValues) ? fieldValues : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );
    if (!uniqueValues.length) return [];

    const result = await postgresRuntime.query(
      `
        SELECT
          payload->>$2 AS field_value,
          COUNT(*)::integer AS document_count
        FROM app_documents
        WHERE collection_name = $1
          AND payload->>$2 = ANY($3::text[])
        GROUP BY payload->>$2
      `,
      [collectionName, fieldName, uniqueValues],
    );

    return result.rows.map((row) => ({
      value: row.field_value,
      count: Number(row.document_count || 0),
    }));
  }

  async function findActiveFollowUpTasksForUsers(userIds = [], options = {}) {
    if (!isConfigured()) return [];
    await ensureReady();

    const uniqueUserIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );
    if (!uniqueUserIds.length) return [];

    const rawLimit = Number(options.limit || uniqueUserIds.length);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(rawLimit, Math.max(uniqueUserIds.length, 1000)))
      : uniqueUserIds.length;

    const result = await postgresRuntime.query(
      `
        SELECT DISTINCT ON (payload->>'userId')
          collection_name,
          document_id,
          payload,
          created_at,
          updated_at
        FROM app_documents
        WHERE collection_name = 'follow_up_tasks'
          AND payload->>'userId' = ANY($1::text[])
          AND (payload->>'canceled' IS NULL OR payload->>'canceled' <> 'true')
          AND (payload->>'completed' IS NULL OR payload->>'completed' <> 'true')
          AND NULLIF(payload->>'nextScheduledAt', '') IS NOT NULL
        ORDER BY
          payload->>'userId',
          payload->>'nextScheduledAt' ASC,
          updated_at DESC
        LIMIT $2
      `,
      [uniqueUserIds, limit],
    );

    return result.rows.map((row) => normalizeAppDocumentRow(row));
  }

  async function listTopDocumentArrayValues(
    collectionName,
    fieldName,
    options = {},
  ) {
    if (!isConfigured()) return [];
    await ensureReady();
    if (!/^[a-zA-Z0-9_.-]+$/.test(String(fieldName || ""))) {
      throw new Error(`Unsupported app document field name: ${fieldName}`);
    }

    const rawLimit = Number(options.limit || 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 200))
      : 50;

    const result = await postgresRuntime.query(
      `
        SELECT
          tag_value,
          COUNT(*)::integer AS value_count
        FROM app_documents
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(payload->$2) = 'array' THEN payload->$2
            ELSE '[]'::jsonb
          END
        ) AS tag(tag_value)
        WHERE collection_name = $1
          AND NULLIF(tag_value, '') IS NOT NULL
        GROUP BY tag_value
        ORDER BY value_count DESC, tag_value ASC
        LIMIT $3
      `,
      [collectionName, fieldName, limit],
    );

    return result.rows.map((row) => ({
      value: row.tag_value,
      count: Number(row.value_count || 0),
    }));
  }

  async function deleteDocument(collectionName, documentId) {
    if (!isConfigured()) return;
    await ensureReady();

    await postgresRuntime.query(
      `
        DELETE FROM app_documents
        WHERE collection_name = $1 AND document_id = $2
      `,
      [collectionName, documentId],
    );
    await nativeDocumentSync.safelyDeleteDocument(collectionName, documentId);
  }

  async function upsertAssetObject(scope, assetId, payload = {}) {
    if (!isConfigured()) return;
    await ensureReady();

    await postgresRuntime.query(
      `
        INSERT INTO asset_objects (
          asset_scope,
          asset_id,
          file_name,
          bucket_key,
          mime_type,
          size_bytes,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now())
        ON CONFLICT (asset_scope, asset_id) DO UPDATE SET
          file_name = EXCLUDED.file_name,
          bucket_key = EXCLUDED.bucket_key,
          mime_type = EXCLUDED.mime_type,
          size_bytes = EXCLUDED.size_bytes,
          metadata = EXCLUDED.metadata,
          updated_at = now()
      `,
      [
        scope,
        assetId,
        payload.fileName || null,
        payload.bucketKey || null,
        payload.mimeType || null,
        payload.sizeBytes || null,
        JSON.stringify(payload.metadata || {}),
      ],
    );
  }

  async function getAssetObject(scope, assetId) {
    if (!isConfigured()) return null;
    await ensureReady();

    const result = await postgresRuntime.query(
      `
        SELECT
          asset_scope,
          asset_id,
          file_name,
          bucket_key,
          mime_type,
          size_bytes,
          metadata,
          created_at,
          updated_at
        FROM asset_objects
        WHERE asset_scope = $1 AND asset_id = $2
        LIMIT 1
      `,
      [scope, assetId],
    );

    return normalizeAssetObjectRow(result.rows[0]);
  }

  async function findAssetObjectByFileName(scope, fileName) {
    if (!isConfigured()) return null;
    await ensureReady();

    const result = await postgresRuntime.query(
      `
        SELECT
          asset_scope,
          asset_id,
          file_name,
          bucket_key,
          mime_type,
          size_bytes,
        metadata,
        created_at,
        updated_at
        FROM asset_objects
        WHERE asset_scope = $1
          AND (
            file_name = $2
            OR metadata->>'thumbFileName' = $2
            OR metadata->>'thumbName' = $2
            OR metadata->>'fileName' = $2
          )
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [scope, fileName],
    );

    return normalizeAssetObjectRow(result.rows[0]);
  }

  async function deleteAssetObject(scope, assetId) {
    if (!isConfigured()) return;
    await ensureReady();

    await postgresRuntime.query(
      `
        DELETE FROM asset_objects
        WHERE asset_scope = $1 AND asset_id = $2
      `,
      [scope, assetId],
    );
  }

  function logMirrorFailure(context, error) {
    logger.error?.(
      `[ChatStorage] ${context}:`,
      error?.message || error,
    );
  }

  return {
    buildChatImageRoute,
    countDocumentsByPayloadFieldValues,
    deleteAssetObject,
    deleteDocument,
    deleteUserHistory,
    ensureReady,
    findActiveFollowUpTasksForUsers,
    findDocumentsByPayloadField,
    findAssetObjectByFileName,
    getAttachment,
    getAssetObject,
    getDocument,
    getDocuments,
    listAttachmentsForMessages,
    listTopDocumentArrayValues,
    getMessageById,
    isConfigured,
    listConversationUsers,
    listDocuments,
    listMessagesForUser,
    logMirrorFailure,
    mirrorMessage,
    updateMessagesMetadata,
    upsertAssetObject,
    upsertDocument,
  };
}

module.exports = {
  buildChatImageRoute,
  buildMessageId,
  buildPreviewText,
  createChatStorageService,
};
