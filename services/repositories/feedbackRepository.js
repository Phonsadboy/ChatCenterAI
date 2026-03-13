const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  toLegacyId,
} = require("./shared");

function createFeedbackRepository() {
  function ensurePostgres() {
    if (!isPostgresConfigured()) {
      throw new Error("feedback_storage_requires_postgres");
    }
  }

  function normalizeFeedbackDoc(doc = {}) {
    return {
      messageId: doc.messageId || null,
      messageIdString: toLegacyId(doc.messageIdString || doc.message_legacy_id),
      userId: toLegacyId(doc.userId || doc.legacy_contact_id),
      senderId: toLegacyId(doc.senderId || doc.sender_id),
      senderRole: doc.senderRole || doc.sender_role || null,
      platform: doc.platform || null,
      botId: toLegacyId(doc.botId || doc.legacy_bot_id),
      feedback: doc.feedback || null,
      notes: typeof doc.notes === "string" ? doc.notes : "",
      createdAt: doc.createdAt || doc.created_at || null,
      updatedAt: doc.updatedAt || doc.updated_at || null,
    };
  }

  async function readPgByMessageIds(messageIds = []) {
    ensurePostgres();
    const normalizedIds = Array.isArray(messageIds)
      ? messageIds.map((messageId) => toLegacyId(messageId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];

    const result = await query(
      `
        SELECT
          f.message_legacy_id,
          f.legacy_contact_id,
          f.sender_id,
          f.sender_role,
          f.platform,
          f.feedback,
          f.notes,
          f.created_at,
          f.updated_at,
          b.legacy_bot_id
        FROM chat_feedback f
        LEFT JOIN bots b ON b.id = f.bot_id
        WHERE f.message_legacy_id = ANY($1::text[])
      `,
      [normalizedIds],
    );

    return result.rows.map((row) => normalizeFeedbackDoc(row));
  }

  async function writePgFeedback(doc = {}) {
    ensurePostgres();
    const platform =
      typeof doc?.platform === "string" && doc.platform.trim()
        ? doc.platform.trim().toLowerCase()
        : null;
    const pgBotId = await resolvePgBotId({ query }, platform, doc?.botId);
    await query(
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
        toLegacyId(doc.messageIdString),
        toLegacyId(doc.userId),
        toLegacyId(doc.senderId),
        doc.senderRole || null,
        platform,
        pgBotId,
        doc.feedback || null,
        doc.notes || "",
        doc.createdAt || new Date(),
        doc.updatedAt || doc.createdAt || new Date(),
      ],
    );
  }

  async function getByMessageIds(messageIds = []) {
    return readPgByMessageIds(messageIds);
  }

  async function upsertFeedback(doc = {}) {
    const messageIdString = toLegacyId(doc.messageIdString);
    if (!messageIdString) {
      throw new Error("messageIdString is required");
    }

    const now = doc.updatedAt || new Date();
    const savedDoc = {
      messageId: null,
      messageIdString,
      userId: toLegacyId(doc.userId),
      senderId: toLegacyId(doc.senderId),
      senderRole: doc.senderRole || null,
      platform: doc.platform || null,
      botId: doc.botId || null,
      feedback: doc.feedback || null,
      notes: doc.notes || "",
      createdAt: doc.createdAt || now,
      updatedAt: now,
    };

    await writePgFeedback(savedDoc);
    return savedDoc;
  }

  async function clearFeedback(messageId) {
    ensurePostgres();
    const messageIdString = toLegacyId(messageId);
    await query(
      "DELETE FROM chat_feedback WHERE message_legacy_id = $1",
      [messageIdString],
    );
  }

  return {
    clearFeedback,
    getByMessageIds,
    upsertFeedback,
  };
}

module.exports = {
  createFeedbackRepository,
};
