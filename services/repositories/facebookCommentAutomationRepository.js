const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  safeStringify,
  toLegacyId,
  toObjectId,
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
  connectDB,
  dbName = "chatbot",
  runtimeConfig,
}) {
  function canUseMongo() {
    return runtimeConfig?.features?.mongoEnabled !== false;
  }

  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  function shouldReadPrimary() {
    return canUsePostgres();
  }

  async function getDb() {
    if (!canUseMongo()) {
      throw new Error("MongoDB is disabled");
    }
    const client = await connectDB();
    return client.db(dbName);
  }

  function toMongoBotId(botId) {
    const legacyBotId = toLegacyId(botId);
    const objectId = toObjectId(legacyBotId);
    return objectId || legacyBotId;
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

  async function readMongoPost(filter = {}) {
    const postId = toLegacyId(filter.postId);
    if (!postId) return null;
    const queryFilter = { postId };
    const legacyBotId = toLegacyId(filter.botId);
    if (legacyBotId) {
      queryFilter.botId = toMongoBotId(legacyBotId);
    }
    const db = await getDb();
    return db.collection("facebook_page_posts").findOne(queryFilter);
  }

  async function listPosts(filter = {}, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
    const legacyBotId = toLegacyId(filter.botId);

    if (shouldReadPrimary()) {
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

    if (!canUseMongo()) {
      return [];
    }

    const db = await getDb();
    const queryFilter = {};
    if (legacyBotId) {
      queryFilter.botId = toMongoBotId(legacyBotId);
    }
    const docs = await db
      .collection("facebook_page_posts")
      .find(queryFilter)
      .sort({ createdTime: -1, syncedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((doc) => normalizeFacebookPostDoc(doc));
  }

  async function findPost(filter = {}) {
    if (shouldReadPrimary()) {
      return readPostgresPost(filter);
    }

    if (!canUseMongo()) {
      return null;
    }

    const mongoDoc = await readMongoPost(filter);
    return mongoDoc ? normalizeFacebookPostDoc(mongoDoc) : null;
  }

  async function upsertPost(doc = {}) {
    const normalized = normalizeFacebookPostDoc(doc);
    if (!normalized.botId || !normalized.postId) {
      throw new Error("facebook_post_requires_bot_id_and_post_id");
    }

    if (canUsePostgres()) {
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

    if (!canUseMongo()) {
      throw new Error("facebook_post_storage_unavailable");
    }

    const db = await getDb();
    const mongoBotId = toMongoBotId(normalized.botId);
    await db.collection("facebook_page_posts").updateOne(
      { botId: mongoBotId, postId: normalized.postId },
      {
        $set: {
          botId: mongoBotId,
          pageId: normalized.pageId || "",
          postId: normalized.postId,
          message: normalized.message || "",
          permalink: normalized.permalink || "",
          createdTime: normalized.createdTime,
          attachments: normalized.attachments || [],
          statusType: normalized.statusType || null,
          fullPicture: normalized.fullPicture || null,
          capturedFrom: normalized.capturedFrom || "webhook",
          syncedAt: normalized.syncedAt || null,
          updatedAt: normalized.updatedAt || new Date(),
        },
        $setOnInsert: {
          replyProfile: normalized.replyProfile || buildDefaultReplyProfile(),
          createdAt: normalized.createdAt || new Date(),
          commentCount: Number.isFinite(normalized.commentCount)
            ? normalized.commentCount
            : 0,
        },
      },
      { upsert: true },
    );
    const updated = await db.collection("facebook_page_posts").findOne({
      botId: mongoBotId,
      postId: normalized.postId,
    });
    return updated ? normalizeFacebookPostDoc(updated) : null;
  }

  async function updateReplyProfile(filter = {}, replyProfile = {}) {
    const postId = toLegacyId(filter.postId);
    const legacyBotId = toLegacyId(filter.botId);
    if (!postId) return null;
    const normalizedProfile = normalizeReplyProfile(replyProfile);
    const updatedAt = new Date();

    if (canUsePostgres()) {
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

    if (!canUseMongo()) {
      throw new Error("facebook_post_storage_unavailable");
    }

    const db = await getDb();
    const queryFilter = { postId };
    if (legacyBotId) {
      queryFilter.botId = toMongoBotId(legacyBotId);
    }
    await db.collection("facebook_page_posts").updateOne(
      queryFilter,
      {
        $set: {
          replyProfile: normalizedProfile,
          updatedAt,
        },
      },
    );
    const updated = await db.collection("facebook_page_posts").findOne(queryFilter);
    return updated ? normalizeFacebookPostDoc(updated) : null;
  }

  async function touchPostComment(filter = {}, touchedAt = new Date()) {
    const postId = toLegacyId(filter.postId);
    const legacyBotId = toLegacyId(filter.botId);
    if (!postId || !legacyBotId) return null;

    if (canUsePostgres()) {
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

    if (!canUseMongo()) {
      throw new Error("facebook_post_storage_unavailable");
    }

    const db = await getDb();
    const mongoBotId = toMongoBotId(legacyBotId);
    await db.collection("facebook_page_posts").updateOne(
      { botId: mongoBotId, postId },
      { $set: { lastCommentAt: touchedAt, updatedAt: touchedAt } },
    );
    const updated = await db.collection("facebook_page_posts").findOne({
      botId: mongoBotId,
      postId,
    });
    return updated ? normalizeFacebookPostDoc(updated) : null;
  }

  async function applyCommentResult(filter = {}, { action = "", privateSent = false, occurredAt = new Date() } = {}) {
    const postId = toLegacyId(filter.postId);
    const legacyBotId = toLegacyId(filter.botId);
    if (!postId || !legacyBotId) return null;
    const replied = action === "replied";

    if (canUsePostgres()) {
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

    if (!canUseMongo()) {
      throw new Error("facebook_post_storage_unavailable");
    }

    const db = await getDb();
    const mongoBotId = toMongoBotId(legacyBotId);
    const updatePayload = {
      $set: { updatedAt: occurredAt },
      $inc: { commentCount: 1 },
    };
    if (replied) {
      updatePayload.$set.lastReplyAt = occurredAt;
      updatePayload.$set.lastCommentAt = occurredAt;
      if (privateSent === true) {
        updatePayload.$set.pulledToChat = true;
      }
    }
    await db.collection("facebook_page_posts").updateOne(
      { botId: mongoBotId, postId },
      updatePayload,
    );
    const updated = await db.collection("facebook_page_posts").findOne({
      botId: mongoBotId,
      postId,
    });
    return updated ? normalizeFacebookPostDoc(updated) : null;
  }

  async function findEventByCommentId(commentId) {
    const normalizedCommentId = toLegacyId(commentId);
    if (!normalizedCommentId) return null;

    if (shouldReadPrimary()) {
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

    if (!canUseMongo()) {
      return null;
    }

    const db = await getDb();
    const doc = await db.collection("facebook_comment_events").findOne({
      commentId: normalizedCommentId,
    });
    return doc ? normalizeFacebookCommentEventDoc(doc) : null;
  }

  async function recordEvent(eventDoc = {}) {
    const normalized = normalizeFacebookCommentEventDoc({
      ...eventDoc,
      updatedAt: eventDoc.updatedAt || eventDoc.createdAt || new Date(),
    });
    if (!normalized.commentId) {
      throw new Error("facebook_comment_event_requires_comment_id");
    }

    if (canUsePostgres()) {
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

    if (!canUseMongo()) {
      throw new Error("facebook_comment_event_storage_unavailable");
    }

    const db = await getDb();
    const mongoDoc = {
      ...eventDoc,
      botId: normalized.botId ? toMongoBotId(normalized.botId) : "",
      pageId: normalized.pageId || "",
      postId: normalized.postId || "",
      commentId: normalized.commentId,
      commentText: normalized.commentText || "",
      commenterId: normalized.commenterId || "",
      commenterName: normalized.commenterName || "",
      replyMode: normalized.replyMode,
      replyText: normalized.replyText || "",
      action: normalized.action || "",
      reason: normalized.reason || "",
      createdAt: normalized.createdAt || new Date(),
      updatedAt: normalized.updatedAt || normalized.createdAt || new Date(),
    };
    await db.collection("facebook_comment_events").updateOne(
      { commentId: normalized.commentId },
      { $setOnInsert: mongoDoc },
      { upsert: true },
    );
    const saved = await db.collection("facebook_comment_events").findOne({
      commentId: normalized.commentId,
    });
    return saved ? normalizeFacebookCommentEventDoc(saved) : null;
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
