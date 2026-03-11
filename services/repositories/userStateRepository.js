const { isPostgresConfigured, query } = require("../../infra/postgres");
const { safeStringify, toLegacyId } = require("./shared");

function createUserStateRepository({
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

  function startShadowCompare(label, mongoValue, pgValue) {
    if (!shouldShadowRead() || shouldReadPrimary()) return;
    if (safeStringify(mongoValue) !== safeStringify(pgValue)) {
      console.warn(`[UserStateRepository] Shadow read mismatch for ${label}`);
    }
  }

  function normalizeAiStatusDoc(doc = {}) {
    return {
      senderId: toLegacyId(doc.senderId || doc.legacy_contact_id),
      aiEnabled:
        typeof doc.aiEnabled === "boolean"
          ? doc.aiEnabled
          : typeof doc.ai_enabled === "boolean"
            ? doc.ai_enabled
            : true,
      updatedAt: doc.updatedAt || doc.updated_at || null,
    };
  }

  function normalizeTagsDoc(doc = {}) {
    return {
      userId: toLegacyId(doc.userId || doc.legacy_contact_id),
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      updatedAt: doc.updatedAt || doc.updated_at || null,
    };
  }

  function normalizePurchaseStatusDoc(doc = {}) {
    return {
      userId: toLegacyId(doc.userId || doc.legacy_contact_id),
      hasPurchased:
        typeof doc.hasPurchased === "boolean"
          ? doc.hasPurchased
          : typeof doc.has_purchased === "boolean"
            ? doc.has_purchased
            : false,
      updatedAt: doc.updatedAt || doc.updated_at || null,
      updatedBy: doc.updatedBy || doc.updated_by || null,
    };
  }

  async function writePgAiStatus(userId, aiEnabled, updatedAt = new Date()) {
    await query(
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
      [toLegacyId(userId), Boolean(aiEnabled), updatedAt],
    );
  }

  async function writePgTags(userId, tags, updatedAt = new Date()) {
    await query(
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
      [toLegacyId(userId), JSON.stringify(Array.isArray(tags) ? tags : []), updatedAt],
    );
  }

  async function writePgPurchaseStatus(
    userId,
    hasPurchased,
    updatedAt = new Date(),
    updatedBy = null,
  ) {
    await query(
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
      [toLegacyId(userId), Boolean(hasPurchased), updatedBy || null, updatedAt],
    );
  }

  async function readPgAiStatus(userId) {
    const result = await query(
      `
        SELECT legacy_contact_id, ai_enabled, updated_at
        FROM active_user_status
        WHERE legacy_contact_id = $1
        LIMIT 1
      `,
      [toLegacyId(userId)],
    );
    return result.rows[0] ? normalizeAiStatusDoc(result.rows[0]) : null;
  }

  async function readPgAiStatuses(userIds = []) {
    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];

    const result = await query(
      `
        SELECT legacy_contact_id, ai_enabled, updated_at
        FROM active_user_status
        WHERE legacy_contact_id = ANY($1::text[])
      `,
      [normalizedIds],
    );
    return result.rows.map((row) => normalizeAiStatusDoc(row));
  }

  async function readPgTags(userId) {
    const result = await query(
      `
        SELECT legacy_contact_id, tags, updated_at
        FROM user_tags
        WHERE legacy_contact_id = $1
        LIMIT 1
      `,
      [toLegacyId(userId)],
    );
    return result.rows[0] ? normalizeTagsDoc(result.rows[0]) : null;
  }

  async function readPgTagsByUsers(userIds = []) {
    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];

    const result = await query(
      `
        SELECT legacy_contact_id, tags, updated_at
        FROM user_tags
        WHERE legacy_contact_id = ANY($1::text[])
      `,
      [normalizedIds],
    );
    return result.rows.map((row) => normalizeTagsDoc(row));
  }

  async function readPgAvailableTags(limit = 50) {
    const result = await query(
      `
        SELECT
          tag,
          COUNT(*)::int AS count
        FROM (
          SELECT jsonb_array_elements_text(tags) AS tag
          FROM user_tags
        ) expanded
        GROUP BY tag
        ORDER BY count DESC, tag ASC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map((row) => ({
      tag: row.tag,
      count: Number(row.count || 0),
    }));
  }

  async function readPgPurchaseStatus(userId) {
    const result = await query(
      `
        SELECT legacy_contact_id, has_purchased, updated_by, updated_at
        FROM user_purchase_status
        WHERE legacy_contact_id = $1
        LIMIT 1
      `,
      [toLegacyId(userId)],
    );
    return result.rows[0] ? normalizePurchaseStatusDoc(result.rows[0]) : null;
  }

  async function readPgPurchaseStatuses(userIds = []) {
    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];

    const result = await query(
      `
        SELECT legacy_contact_id, has_purchased, updated_by, updated_at
        FROM user_purchase_status
        WHERE legacy_contact_id = ANY($1::text[])
      `,
      [normalizedIds],
    );
    return result.rows.map((row) => normalizePurchaseStatusDoc(row));
  }

  async function getAiStatus(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) {
      return { senderId: "", aiEnabled: true, updatedAt: new Date() };
    }

    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPgAiStatus(normalizedUserId);
        if (pgDoc || !canUseMongo()) {
          return pgDoc || {
            senderId: normalizedUserId,
            aiEnabled: true,
            updatedAt: new Date(),
          };
        }
      } catch (error) {
        console.warn(
          `[UserStateRepository] Primary AI status read failed for ${normalizedUserId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return { senderId: normalizedUserId, aiEnabled: true, updatedAt: new Date() };
    }

    const db = await getDb();
    const coll = db.collection("active_user_status");
    let mongoDoc = await coll.findOne({ senderId: normalizedUserId });
    if (!mongoDoc) {
      mongoDoc = { senderId: normalizedUserId, aiEnabled: true, updatedAt: new Date() };
      await coll.insertOne(mongoDoc);
      if (canUsePostgres() && (shouldDualWrite() || !canUseMongo())) {
        await writePgAiStatus(normalizedUserId, true, mongoDoc.updatedAt).catch((error) => {
          console.warn(
            `[UserStateRepository] AI status dual-write failed for ${normalizedUserId}:`,
            error?.message || error,
          );
        });
      }
    } else if (shouldShadowRead()) {
      void readPgAiStatus(normalizedUserId)
        .then((pgDoc) =>
          startShadowCompare(
            `aiStatus:${normalizedUserId}`,
            normalizeAiStatusDoc(mongoDoc),
            pgDoc,
          ),
        )
        .catch((error) => {
          console.warn(
            `[UserStateRepository] Shadow AI status read failed for ${normalizedUserId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function listAiStatuses(userIds = []) {
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPgAiStatuses(userIds);
        if (pgDocs.length > 0 || !canUseMongo()) return pgDocs;
      } catch (error) {
        console.warn(
          "[UserStateRepository] Primary AI status list failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];
    if (!canUseMongo()) return [];
    const db = await getDb();
    const mongoDocs = await db.collection("active_user_status")
      .find({ senderId: { $in: normalizedIds } })
      .toArray();

    if (shouldShadowRead()) {
      void readPgAiStatuses(normalizedIds)
        .then((pgDocs) =>
          startShadowCompare(
            `aiStatusList:${safeStringify(normalizedIds)}`,
            mongoDocs.map((doc) => normalizeAiStatusDoc(doc)),
            pgDocs,
          ),
        )
        .catch((error) => {
          console.warn(
            "[UserStateRepository] Shadow AI status list failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function setAiStatus(userId, aiEnabled) {
    const normalizedUserId = toLegacyId(userId);
    const updatedAt = new Date();
    if (canUseMongo()) {
      const db = await getDb();
      await db.collection("active_user_status").updateOne(
        { senderId: normalizedUserId },
        { $set: { aiEnabled: Boolean(aiEnabled), updatedAt } },
        { upsert: true },
      );
    }

    if (canUsePostgres() && (shouldDualWrite() || !canUseMongo())) {
      await writePgAiStatus(normalizedUserId, aiEnabled, updatedAt).catch((error) => {
        console.warn(
          `[UserStateRepository] AI status dual-write failed for ${normalizedUserId}:`,
          error?.message || error,
        );
      });
    }

    return true;
  }

  async function getTags(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) {
      return { userId: "", tags: [], updatedAt: null };
    }

    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPgTags(normalizedUserId);
        if (pgDoc || !canUseMongo()) {
          return pgDoc || { userId: normalizedUserId, tags: [], updatedAt: null };
        }
      } catch (error) {
        console.warn(
          `[UserStateRepository] Primary tags read failed for ${normalizedUserId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return { userId: normalizedUserId, tags: [] };
    }
    const db = await getDb();
    const mongoDoc = await db.collection("user_tags").findOne({ userId: normalizedUserId });
    if (shouldShadowRead()) {
      void readPgTags(normalizedUserId)
        .then((pgDoc) =>
          startShadowCompare(
            `tags:${normalizedUserId}`,
            normalizeTagsDoc(mongoDoc || { userId: normalizedUserId, tags: [] }),
            pgDoc || { userId: normalizedUserId, tags: [] },
          ),
        )
        .catch((error) => {
          console.warn(
            `[UserStateRepository] Shadow tags read failed for ${normalizedUserId}:`,
            error?.message || error,
          );
        });
    }
    return mongoDoc || { userId: normalizedUserId, tags: [] };
  }

  async function listTagsByUsers(userIds = []) {
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPgTagsByUsers(userIds);
        if (pgDocs.length > 0 || !canUseMongo()) return pgDocs;
      } catch (error) {
        console.warn(
          "[UserStateRepository] Primary tags list failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];
    if (!canUseMongo()) return [];
    const db = await getDb();
    const mongoDocs = await db.collection("user_tags")
      .find({ userId: { $in: normalizedIds } })
      .toArray();

    if (shouldShadowRead()) {
      void readPgTagsByUsers(normalizedIds)
        .then((pgDocs) =>
          startShadowCompare(
            `tagsList:${safeStringify(normalizedIds)}`,
            mongoDocs.map((doc) => normalizeTagsDoc(doc)),
            pgDocs,
          ),
        )
        .catch((error) => {
          console.warn(
            "[UserStateRepository] Shadow tags list failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function setTags(userId, tags = []) {
    const normalizedUserId = toLegacyId(userId);
    const updatedAt = new Date();
    const cleanTags = Array.isArray(tags) ? tags : [];
    if (canUseMongo()) {
      const db = await getDb();
      await db.collection("user_tags").updateOne(
        { userId: normalizedUserId },
        {
          $set: {
            tags: cleanTags,
            updatedAt,
          },
        },
        { upsert: true },
      );
    }

    if (canUsePostgres() && (shouldDualWrite() || !canUseMongo())) {
      await writePgTags(normalizedUserId, cleanTags, updatedAt).catch((error) => {
        console.warn(
          `[UserStateRepository] Tags dual-write failed for ${normalizedUserId}:`,
          error?.message || error,
        );
      });
    }

    return { userId: normalizedUserId, tags: cleanTags, updatedAt };
  }

  async function listAvailableTags(limit = 50) {
    if (shouldReadPrimary()) {
      try {
        const pgTags = await readPgAvailableTags(limit);
        if (pgTags.length > 0 || !canUseMongo()) return pgTags;
      } catch (error) {
        console.warn(
          "[UserStateRepository] Primary available-tags read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return [];
    }
    const db = await getDb();
    const allUserTags = await db.collection("user_tags").find({}).toArray();
    const tagCount = {};
    allUserTags.forEach((userTag) => {
      if (!Array.isArray(userTag?.tags)) return;
      userTag.tags.forEach((tag) => {
        if (!tag) return;
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });
    const mongoTags = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
      .slice(0, limit);

    if (shouldShadowRead()) {
      void readPgAvailableTags(limit)
        .then((pgTags) => startShadowCompare("availableTags", mongoTags, pgTags))
        .catch((error) => {
          console.warn(
            "[UserStateRepository] Shadow available-tags read failed:",
            error?.message || error,
          );
        });
    }

    return mongoTags;
  }

  async function getPurchaseStatus(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) {
      return { userId: "", hasPurchased: false, updatedAt: null, updatedBy: null };
    }

    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPgPurchaseStatus(normalizedUserId);
        if (pgDoc || !canUseMongo()) {
          return pgDoc || {
            userId: normalizedUserId,
            hasPurchased: false,
            updatedAt: null,
            updatedBy: null,
          };
        }
      } catch (error) {
        console.warn(
          `[UserStateRepository] Primary purchase-status read failed for ${normalizedUserId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    if (!canUseMongo()) {
      return { userId: normalizedUserId, hasPurchased: false };
    }
    const db = await getDb();
    const mongoDoc = await db.collection("user_purchase_status").findOne({ userId: normalizedUserId });

    if (shouldShadowRead()) {
      void readPgPurchaseStatus(normalizedUserId)
        .then((pgDoc) =>
          startShadowCompare(
            `purchaseStatus:${normalizedUserId}`,
            normalizePurchaseStatusDoc(mongoDoc || { userId: normalizedUserId, hasPurchased: false }),
            pgDoc || { userId: normalizedUserId, hasPurchased: false },
          ),
        )
        .catch((error) => {
          console.warn(
            `[UserStateRepository] Shadow purchase-status read failed for ${normalizedUserId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc || { userId: normalizedUserId, hasPurchased: false };
  }

  async function listPurchaseStatuses(userIds = []) {
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPgPurchaseStatuses(userIds);
        if (pgDocs.length > 0 || !canUseMongo()) return pgDocs;
      } catch (error) {
        console.warn(
          "[UserStateRepository] Primary purchase-status list failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];
    if (!canUseMongo()) return [];
    const db = await getDb();
    const mongoDocs = await db.collection("user_purchase_status")
      .find({ userId: { $in: normalizedIds } })
      .toArray();

    if (shouldShadowRead()) {
      void readPgPurchaseStatuses(normalizedIds)
        .then((pgDocs) =>
          startShadowCompare(
            `purchaseStatusList:${safeStringify(normalizedIds)}`,
            mongoDocs.map((doc) => normalizePurchaseStatusDoc(doc)),
            pgDocs,
          ),
        )
        .catch((error) => {
          console.warn(
            "[UserStateRepository] Shadow purchase-status list failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function setPurchaseStatus(userId, hasPurchased, updatedBy = "admin") {
    const normalizedUserId = toLegacyId(userId);
    const updatedAt = new Date();
    if (canUseMongo()) {
      const db = await getDb();
      await db.collection("user_purchase_status").updateOne(
        { userId: normalizedUserId },
        {
          $set: {
            hasPurchased: Boolean(hasPurchased),
            updatedAt,
            updatedBy: updatedBy || null,
          },
        },
        { upsert: true },
      );
    }

    if (canUsePostgres() && (shouldDualWrite() || !canUseMongo())) {
      await writePgPurchaseStatus(
        normalizedUserId,
        hasPurchased,
        updatedAt,
        updatedBy,
      ).catch((error) => {
        console.warn(
          `[UserStateRepository] Purchase-status dual-write failed for ${normalizedUserId}:`,
          error?.message || error,
        );
      });
    }

    return {
      userId: normalizedUserId,
      hasPurchased: Boolean(hasPurchased),
      updatedAt,
      updatedBy: updatedBy || null,
    };
  }

  return {
    getAiStatus,
    getPurchaseStatus,
    getTags,
    listAiStatuses,
    listAvailableTags,
    listPurchaseStatuses,
    listTagsByUsers,
    setAiStatus,
    setPurchaseStatus,
    setTags,
  };
}

module.exports = {
  createUserStateRepository,
};
