const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  toLegacyId,
  safeStringify,
} = require("./shared");

function buildDefaultReplyProfile() {
  return {
    mode: "off",
    templateMessage: "",
    aiModel: "",
    systemPrompt: "",
    privateReplyTemplate: "",
    pullToChat: false,
    sendPrivateReply: false,
    isActive: false,
    status: "off",
    overridePageDefault: false,
  };
}

function normalizeReplyProfile(profile = {}) {
  const safeProfile = profile && typeof profile === "object" ? profile : {};
  return {
    ...buildDefaultReplyProfile(),
    ...safeProfile,
    mode:
      typeof safeProfile.mode === "string" && safeProfile.mode.trim()
        ? safeProfile.mode.trim()
        : "off",
    templateMessage:
      typeof safeProfile.templateMessage === "string"
        ? safeProfile.templateMessage
        : "",
    aiModel:
      typeof safeProfile.aiModel === "string" ? safeProfile.aiModel : "",
    systemPrompt:
      typeof safeProfile.systemPrompt === "string" ? safeProfile.systemPrompt : "",
    privateReplyTemplate:
      typeof safeProfile.privateReplyTemplate === "string"
        ? safeProfile.privateReplyTemplate
        : "",
    pullToChat: safeProfile.pullToChat === true,
    sendPrivateReply: safeProfile.sendPrivateReply === true,
    isActive:
      safeProfile.isActive === true || safeProfile.status === "active",
    status:
      safeProfile.isActive === true || safeProfile.status === "active"
        ? "active"
        : typeof safeProfile.status === "string" && safeProfile.status.trim()
          ? safeProfile.status.trim()
          : "off",
    overridePageDefault: safeProfile.overridePageDefault === true,
  };
}

function normalizeFacebookPostDoc(doc = {}) {
  const metadata =
    doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
  const replyProfile = normalizeReplyProfile(
    doc.replyProfile || doc.reply_profile || metadata.replyProfile || {},
  );
  return {
    _id: toLegacyId(doc._id || doc.id || doc.postId || doc.post_id),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    pageId:
      typeof doc.pageId === "string"
        ? doc.pageId
        : typeof doc.page_id === "string"
          ? doc.page_id
          : typeof metadata.pageId === "string"
            ? metadata.pageId
            : "",
    postId: toLegacyId(doc.postId || doc.post_id),
    message: typeof doc.message === "string" ? doc.message : "",
    permalink:
      typeof doc.permalink === "string"
        ? doc.permalink
        : typeof metadata.permalink === "string"
          ? metadata.permalink
          : "",
    createdTime: doc.createdTime || doc.created_time || metadata.createdTime || null,
    attachments: Array.isArray(doc.attachments)
      ? doc.attachments
      : Array.isArray(metadata.attachments)
        ? metadata.attachments
        : [],
    statusType:
      typeof doc.statusType === "string"
        ? doc.statusType
        : typeof doc.status_type === "string"
          ? doc.status_type
          : metadata.statusType || null,
    fullPicture:
      typeof doc.fullPicture === "string"
        ? doc.fullPicture
        : typeof doc.full_picture === "string"
          ? doc.full_picture
          : metadata.fullPicture || null,
    replyProfile,
    commentCount:
      Number.isFinite(Number(doc.commentCount))
        ? Number(doc.commentCount)
        : Number.isFinite(Number(doc.comment_count))
          ? Number(doc.comment_count)
          : 0,
    capturedFrom:
      typeof doc.capturedFrom === "string"
        ? doc.capturedFrom
        : typeof doc.captured_from === "string"
          ? doc.captured_from
          : "webhook",
    pulledToChat:
      doc.pulledToChat === true
      || doc.pulled_to_chat === true
      || metadata.pulledToChat === true,
    lastCommentAt:
      doc.lastCommentAt || doc.last_comment_at || metadata.lastCommentAt || null,
    lastReplyAt:
      doc.lastReplyAt || doc.last_reply_at || metadata.lastReplyAt || null,
    syncedAt: doc.syncedAt || doc.synced_at || metadata.syncedAt || null,
    createdAt: doc.createdAt || doc.created_at || metadata.createdAt || null,
    updatedAt: doc.updatedAt || doc.updated_at || metadata.updatedAt || null,
    metadata,
  };
}

function normalizeFacebookCommentEventDoc(doc = {}) {
  const metadata =
    doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
  return {
    _id: toLegacyId(doc._id || doc.id || doc.commentId || doc.comment_id),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    pageId:
      typeof doc.pageId === "string"
        ? doc.pageId
        : typeof doc.page_id === "string"
          ? doc.page_id
          : "",
    postId: toLegacyId(doc.postId || doc.post_id),
    commentId: toLegacyId(doc.commentId || doc.comment_id),
    commentText:
      typeof doc.commentText === "string"
        ? doc.commentText
        : typeof doc.comment_text === "string"
          ? doc.comment_text
          : "",
    commenterId: toLegacyId(doc.commenterId || doc.commenter_id),
    commenterName:
      typeof doc.commenterName === "string"
        ? doc.commenterName
        : typeof doc.commenter_name === "string"
          ? doc.commenter_name
          : "",
    replyMode:
      typeof doc.replyMode === "string"
        ? doc.replyMode
        : typeof doc.reply_mode === "string"
          ? doc.reply_mode
          : null,
    replyText:
      typeof doc.replyText === "string"
        ? doc.replyText
        : typeof doc.reply_text === "string"
          ? doc.reply_text
          : "",
    action:
      typeof doc.action === "string" ? doc.action : metadata.action || "",
    reason:
      typeof doc.reason === "string" ? doc.reason : metadata.reason || "",
    createdAt: doc.createdAt || doc.created_at || metadata.createdAt || null,
    updatedAt: doc.updatedAt || doc.updated_at || metadata.updatedAt || null,
    metadata,
  };
}

function createFacebookCommentAutomationRepository({
  dbName = "chatbot",
  runtimeConfig,
}) {
  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  function ensurePostgresAvailable() {
    if (canUsePostgres()) return;
    throw new Error(`facebook_comment_automation_requires_postgres:${dbName}`);
  }

  async function readPostgresPost(filter = {}) {
    const params = [];
    const conditions = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    const legacyBotId = toLegacyId(filter.botId);
    if (legacyBotId) {
      push("legacy_bot_id =", legacyBotId);
    }
    const postId = toLegacyId(filter.postId);
    if (postId) {
      push("post_id =", postId);
    }
    if (!conditions.length) {
      return null;
    }

    const result = await query(
      `
        SELECT
          id::text AS id,
          legacy_bot_id,
          page_id,
          post_id,
          message,
          permalink,
          created_time,
          attachments,
          status_type,
          full_picture,
          reply_profile,
          comment_count,
          captured_from,
          pulled_to_chat,
          last_comment_at,
          last_reply_at,
          synced_at,
          metadata,
          created_at,
          updated_at
        FROM facebook_page_posts
        WHERE ${conditions.join(" AND ")}
        LIMIT 1
      `,
      params,
    );
    return result.rows[0] ? normalizeFacebookPostDoc(result.rows[0]) : null;
  }

  async function listPosts(filter = {}, options = {}) {
    ensurePostgresAvailable();
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
    const legacyBotId = toLegacyId(filter.botId);
    const params = [];
    const whereSql = legacyBotId
      ? (() => {
          params.push(legacyBotId);
          return `WHERE legacy_bot_id = $${params.length}`;
        })()
      : "";
    params.push(limit);
    const result = await query(
      `
        SELECT
          id::text AS id,
          legacy_bot_id,
          page_id,
          post_id,
          message,
          permalink,
          created_time,
          attachments,
          status_type,
          full_picture,
          reply_profile,
          comment_count,
          captured_from,
          pulled_to_chat,
          last_comment_at,
          last_reply_at,
          synced_at,
          metadata,
          created_at,
          updated_at
        FROM facebook_page_posts
        ${whereSql}
        ORDER BY created_time DESC NULLS LAST, synced_at DESC NULLS LAST, updated_at DESC
        LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map((row) => normalizeFacebookPostDoc(row));
  }

  async function findPost(filter = {}) {
    ensurePostgresAvailable();
    return readPostgresPost(filter);
  }

  async function upsertPost(doc = {}) {
    ensurePostgresAvailable();
    const normalized = normalizeFacebookPostDoc(doc);
    if (!normalized.botId || !normalized.postId) {
      throw new Error("facebook_post_requires_bot_id_and_post_id");
    }

    const pgBotId = await resolvePgBotId({ query }, "facebook", normalized.botId).catch(() => null);
    const now = normalized.updatedAt || new Date();
    const createdAt = normalized.createdAt || now;
    const result = await query(
        `
          INSERT INTO facebook_page_posts (
            bot_id,
            legacy_bot_id,
            page_id,
            post_id,
            message,
            permalink,
            created_time,
            attachments,
            status_type,
            full_picture,
            reply_profile,
            comment_count,
            captured_from,
            pulled_to_chat,
            last_comment_at,
            last_reply_at,
            synced_at,
            metadata,
            created_at,
            updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20
          )
          ON CONFLICT (legacy_bot_id, post_id) DO UPDATE SET
            bot_id = EXCLUDED.bot_id,
            page_id = EXCLUDED.page_id,
            message = EXCLUDED.message,
            permalink = EXCLUDED.permalink,
            created_time = COALESCE(EXCLUDED.created_time, facebook_page_posts.created_time),
            attachments = EXCLUDED.attachments,
            status_type = EXCLUDED.status_type,
            full_picture = EXCLUDED.full_picture,
            captured_from = EXCLUDED.captured_from,
            synced_at = EXCLUDED.synced_at,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
          RETURNING
            id::text AS id,
            legacy_bot_id,
            page_id,
            post_id,
            message,
            permalink,
            created_time,
            attachments,
            status_type,
            full_picture,
            reply_profile,
            comment_count,
            captured_from,
            pulled_to_chat,
            last_comment_at,
            last_reply_at,
            synced_at,
            metadata,
            created_at,
            updated_at
        `,
        [
          pgBotId,
          normalized.botId,
          normalized.pageId || "",
          normalized.postId,
          normalized.message || "",
          normalized.permalink || "",
          normalized.createdTime,
          safeStringify(normalized.attachments || []),
          normalized.statusType,
          normalized.fullPicture,
          safeStringify(normalized.replyProfile || buildDefaultReplyProfile()),
          Number.isFinite(normalized.commentCount) ? normalized.commentCount : 0,
          normalized.capturedFrom || "webhook",
          normalized.pulledToChat === true,
          normalized.lastCommentAt,
          normalized.lastReplyAt,
          normalized.syncedAt,
          safeStringify(normalized.metadata || {}),
          createdAt,
          now,
        ],
      );
    return normalizeFacebookPostDoc(result.rows[0] || {});
  }

  async function updateReplyProfile(filter = {}, replyProfile = {}) {
    ensurePostgresAvailable();
    const postId = toLegacyId(filter.postId);
    const legacyBotId = toLegacyId(filter.botId);
    if (!postId) return null;
    const normalizedProfile = normalizeReplyProfile(replyProfile);
    const updatedAt = new Date();

    const params = [postId, safeStringify(normalizedProfile), updatedAt];
    let whereSql = "post_id = $1";
    if (legacyBotId) {
      params.push(legacyBotId);
      whereSql += ` AND legacy_bot_id = $${params.length}`;
    }
    const result = await query(
        `
          UPDATE facebook_page_posts
          SET
            reply_profile = $2::jsonb,
            updated_at = $3
          WHERE ${whereSql}
          RETURNING
            id::text AS id,
            legacy_bot_id,
            page_id,
            post_id,
            message,
            permalink,
            created_time,
            attachments,
            status_type,
            full_picture,
            reply_profile,
            comment_count,
            captured_from,
            pulled_to_chat,
            last_comment_at,
            last_reply_at,
            synced_at,
            metadata,
            created_at,
            updated_at
      `,
      params,
    );
    return result.rows[0] ? normalizeFacebookPostDoc(result.rows[0]) : null;
  }

  async function touchPostComment(filter = {}, touchedAt = new Date()) {
    ensurePostgresAvailable();
    const postId = toLegacyId(filter.postId);
    const legacyBotId = toLegacyId(filter.botId);
    if (!postId || !legacyBotId) return null;

    const result = await query(
        `
          UPDATE facebook_page_posts
          SET
            last_comment_at = CASE
              WHEN last_comment_at IS NULL OR last_comment_at < $3 THEN $3
              ELSE last_comment_at
            END,
            updated_at = $3
          WHERE legacy_bot_id = $1
            AND post_id = $2
          RETURNING
            id::text AS id,
            legacy_bot_id,
            page_id,
            post_id,
            message,
            permalink,
            created_time,
            attachments,
            status_type,
            full_picture,
            reply_profile,
            comment_count,
            captured_from,
            pulled_to_chat,
            last_comment_at,
            last_reply_at,
            synced_at,
            metadata,
            created_at,
            updated_at
      `,
      [legacyBotId, postId, touchedAt],
    );
    return result.rows[0] ? normalizeFacebookPostDoc(result.rows[0]) : null;
  }

  async function applyCommentResult(filter = {}, { action = "", privateSent = false, occurredAt = new Date() } = {}) {
    ensurePostgresAvailable();
    const postId = toLegacyId(filter.postId);
    const legacyBotId = toLegacyId(filter.botId);
    if (!postId || !legacyBotId) return null;
    const replied = action === "replied";

    const result = await query(
        `
          UPDATE facebook_page_posts
          SET
            comment_count = COALESCE(comment_count, 0) + 1,
            updated_at = $3,
            last_comment_at = CASE
              WHEN last_comment_at IS NULL OR last_comment_at < $3 THEN $3
              ELSE last_comment_at
            END,
            last_reply_at = CASE
              WHEN $4::boolean THEN $3
              ELSE last_reply_at
            END,
            pulled_to_chat = CASE
              WHEN $5::boolean THEN TRUE
              ELSE pulled_to_chat
            END
          WHERE legacy_bot_id = $1
            AND post_id = $2
          RETURNING
            id::text AS id,
            legacy_bot_id,
            page_id,
            post_id,
            message,
            permalink,
            created_time,
            attachments,
            status_type,
            full_picture,
            reply_profile,
            comment_count,
            captured_from,
            pulled_to_chat,
            last_comment_at,
            last_reply_at,
            synced_at,
            metadata,
            created_at,
            updated_at
      `,
      [legacyBotId, postId, occurredAt, replied, privateSent === true],
    );
    return result.rows[0] ? normalizeFacebookPostDoc(result.rows[0]) : null;
  }

  async function findEventByCommentId(commentId) {
    ensurePostgresAvailable();
    const normalizedCommentId = toLegacyId(commentId);
    if (!normalizedCommentId) return null;

    const result = await query(
      `
        SELECT
          id::text AS id,
          legacy_bot_id,
          page_id,
          post_id,
          comment_id,
          comment_text,
          commenter_id,
          commenter_name,
          reply_mode,
          reply_text,
          action,
          reason,
          metadata,
          created_at,
          updated_at
        FROM facebook_comment_events
        WHERE comment_id = $1
        LIMIT 1
      `,
      [normalizedCommentId],
    );
    return result.rows[0]
      ? normalizeFacebookCommentEventDoc(result.rows[0])
      : null;
  }

  async function recordEvent(eventDoc = {}) {
    ensurePostgresAvailable();
    const normalized = normalizeFacebookCommentEventDoc({
      ...eventDoc,
      updatedAt: eventDoc.updatedAt || eventDoc.createdAt || new Date(),
    });
    if (!normalized.commentId) {
      throw new Error("facebook_comment_event_requires_comment_id");
    }

    const pgBotId = normalized.botId
      ? await resolvePgBotId({ query }, "facebook", normalized.botId).catch(() => null)
      : null;
    const createdAt = normalized.createdAt || new Date();
    const updatedAt = normalized.updatedAt || createdAt;
    const result = await query(
        `
          INSERT INTO facebook_comment_events (
            bot_id,
            legacy_bot_id,
            page_id,
            post_id,
            comment_id,
            comment_text,
            commenter_id,
            commenter_name,
            reply_mode,
            reply_text,
            action,
            reason,
            metadata,
            created_at,
            updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15
          )
          ON CONFLICT (comment_id) DO NOTHING
          RETURNING
            id::text AS id,
            legacy_bot_id,
            page_id,
            post_id,
            comment_id,
            comment_text,
            commenter_id,
            commenter_name,
            reply_mode,
            reply_text,
            action,
            reason,
            metadata,
            created_at,
            updated_at
        `,
        [
          pgBotId,
          normalized.botId || "",
          normalized.pageId || "",
          normalized.postId || "",
          normalized.commentId,
          normalized.commentText || "",
          normalized.commenterId || "",
          normalized.commenterName || "",
          normalized.replyMode,
          normalized.replyText || "",
          normalized.action || "",
          normalized.reason || "",
          safeStringify({
            ...normalized.metadata,
            replyMode: normalized.replyMode,
            replyText: normalized.replyText || "",
            action: normalized.action || "",
            reason: normalized.reason || "",
          }),
          createdAt,
          updatedAt,
        ],
      );
    if (result.rows[0]) {
      return normalizeFacebookCommentEventDoc(result.rows[0]);
    }
    return findEventByCommentId(normalized.commentId);
  }

  return {
    applyCommentResult,
    findEventByCommentId,
    findPost,
    listPosts,
    normalizeFacebookCommentEventDoc,
    normalizeFacebookPostDoc,
    recordEvent,
    touchPostComment,
    updateReplyProfile,
    upsertPost,
  };
}

module.exports = {
  buildDefaultReplyProfile,
  createFacebookCommentAutomationRepository,
  normalizeFacebookCommentEventDoc,
  normalizeFacebookPostDoc,
  normalizeReplyProfile,
};
