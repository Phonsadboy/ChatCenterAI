const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  safeStringify,
  toLegacyId,
  toObjectId,
  warnPrimaryReadFailure,
} = require("./shared");

function createFeedbackRepository({
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

  function shouldDualWrite() {
    return Boolean(runtimeConfig?.features?.postgresDualWrite && canUsePostgres());
  }

  function shouldShadowRead() {
    return Boolean(runtimeConfig?.features?.postgresShadowRead && canUsePostgres());
  }

  function shouldReadPrimary() {
    return Boolean(
      canUsePostgres()
        && (runtimeConfig?.features?.postgresReadPrimaryChat || !canUseMongo()),
    );
  }

  async function getDb() {
    if (!canUseMongo()) {
      throw new Error("MongoDB is disabled");
    }
    const client = await connectDB();
    return client.db(dbName);
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

  function startShadowCompare(label, mongoValue, pgValue) {
    if (!shouldShadowRead() || shouldReadPrimary()) return;
    if (safeStringify(mongoValue) !== safeStringify(pgValue)) {
      console.warn(`[FeedbackRepository] Shadow read mismatch for ${label}`);
    }
  }

  async function readPgByMessageIds(messageIds = []) {
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
    const normalizedIds = Array.isArray(messageIds)
      ? messageIds.map((messageId) => toLegacyId(messageId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];

    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPgByMessageIds(normalizedIds);
        if (pgDocs.length > 0 || !canUseMongo()) return pgDocs;
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "FeedbackRepository",
          operation: "feedback read",
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const objectIds = normalizedIds
      .map((messageId) => toObjectId(messageId))
      .filter(Boolean);
    const filters = [{ messageIdString: { $in: normalizedIds } }];
    if (objectIds.length > 0) {
      filters.unshift({ messageId: { $in: objectIds } });
    }
    const db = await getDb();
    const mongoDocs = await db.collection("chat_feedback")
      .find({ $or: filters })
      .toArray();

    if (shouldShadowRead()) {
      void readPgByMessageIds(normalizedIds)
        .then((pgDocs) => {
          const mongoMap = new Map(
            mongoDocs.map((doc) => {
              const normalized = normalizeFeedbackDoc(doc);
              return [normalized.messageIdString, normalized];
            }),
          );
          const pgMap = new Map(
            pgDocs.map((doc) => [doc.messageIdString, doc]),
          );
          startShadowCompare(
            `feedback:${safeStringify(normalizedIds)}`,
            Array.from(mongoMap.entries()),
            Array.from(pgMap.entries()),
          );
        })
        .catch((error) => {
          console.warn(
            "[FeedbackRepository] Shadow feedback read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function upsertFeedback(doc = {}) {
    const messageIdString = toLegacyId(doc.messageIdString);
    if (!messageIdString) {
      throw new Error("messageIdString is required");
    }

    const messageObjectId = doc.messageId || toObjectId(messageIdString);
    const filter = messageObjectId
      ? {
        $or: [
          { messageId: messageObjectId },
          { messageIdString },
        ],
      }
      : { messageIdString };

    const now = doc.updatedAt || new Date();
    if (canUseMongo()) {
      const db = await getDb();
      await db.collection("chat_feedback").updateOne(
        filter,
        {
          $set: {
            messageId: messageObjectId || null,
            messageIdString,
            userId: toLegacyId(doc.userId),
            senderId: toLegacyId(doc.senderId),
            senderRole: doc.senderRole || null,
            platform: doc.platform || null,
            botId: doc.botId || null,
            feedback: doc.feedback || null,
            notes: doc.notes || "",
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: doc.createdAt || now,
          },
        },
        { upsert: true },
      );
    }

    const savedDoc = {
      messageId: messageObjectId || null,
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

    if (canUsePostgres() && (shouldDualWrite() || !canUseMongo())) {
      await writePgFeedback(savedDoc).catch((error) => {
        console.warn(
          `[FeedbackRepository] Dual-write failed for ${messageIdString}:`,
          error?.message || error,
        );
      });
    }

    return savedDoc;
  }

  async function clearFeedback(messageId) {
    const messageIdString = toLegacyId(messageId);
    const messageObjectId = toObjectId(messageIdString);
    const filter = messageObjectId
      ? {
        $or: [
          { messageId: messageObjectId },
          { messageIdString },
        ],
      }
      : { messageIdString };
    if (canUseMongo()) {
      const db = await getDb();
      await db.collection("chat_feedback").deleteOne(filter);
    }

    if (canUsePostgres()) {
      await query(
        "DELETE FROM chat_feedback WHERE message_legacy_id = $1",
        [messageIdString],
      ).catch((error) => {
        console.warn(
          `[FeedbackRepository] PostgreSQL clear failed for ${messageIdString}:`,
          error?.message || error,
        );
      });
    }
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
