const { isPostgresConfigured, query } = require("../../infra/postgres");
const { toLegacyId } = require("./shared");

function createUserStateRepository({ runtimeConfig }) {
  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
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
    if (!canUsePostgres()) {
      return { senderId: normalizedUserId, aiEnabled: true, updatedAt: new Date() };
    }
    const pgDoc = await readPgAiStatus(normalizedUserId);
    return pgDoc || {
      senderId: normalizedUserId,
      aiEnabled: true,
      updatedAt: new Date(),
    };
  }

  async function listAiStatuses(userIds = []) {
    if (!canUsePostgres()) return [];
    return readPgAiStatuses(userIds);
  }

  async function setAiStatus(userId, aiEnabled) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) return false;
    const updatedAt = new Date();
    if (canUsePostgres()) {
      await writePgAiStatus(normalizedUserId, aiEnabled, updatedAt);
    }
    return true;
  }

  async function getTags(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) {
      return { userId: "", tags: [], updatedAt: null };
    }
    if (!canUsePostgres()) {
      return { userId: normalizedUserId, tags: [], updatedAt: null };
    }
    const pgDoc = await readPgTags(normalizedUserId);
    return pgDoc || { userId: normalizedUserId, tags: [], updatedAt: null };
  }

  async function listTagsByUsers(userIds = []) {
    if (!canUsePostgres()) return [];
    return readPgTagsByUsers(userIds);
  }

  async function setTags(userId, tags = []) {
    const normalizedUserId = toLegacyId(userId);
    const updatedAt = new Date();
    const cleanTags = Array.isArray(tags) ? tags : [];
    if (canUsePostgres() && normalizedUserId) {
      await writePgTags(normalizedUserId, cleanTags, updatedAt);
    }
    return { userId: normalizedUserId, tags: cleanTags, updatedAt };
  }

  async function listAvailableTags(limit = 50) {
    if (!canUsePostgres()) return [];
    return readPgAvailableTags(limit);
  }

  async function getPurchaseStatus(userId) {
    const normalizedUserId = toLegacyId(userId);
    if (!normalizedUserId) {
      return { userId: "", hasPurchased: false, updatedAt: null, updatedBy: null };
    }
    if (!canUsePostgres()) {
      return {
        userId: normalizedUserId,
        hasPurchased: false,
        updatedAt: null,
        updatedBy: null,
      };
    }
    const pgDoc = await readPgPurchaseStatus(normalizedUserId);
    return pgDoc || {
      userId: normalizedUserId,
      hasPurchased: false,
      updatedAt: null,
      updatedBy: null,
    };
  }

  async function listPurchaseStatuses(userIds = []) {
    if (!canUsePostgres()) return [];
    return readPgPurchaseStatuses(userIds);
  }

  async function setPurchaseStatus(userId, hasPurchased, updatedBy = "admin") {
    const normalizedUserId = toLegacyId(userId);
    const updatedAt = new Date();
    if (canUsePostgres() && normalizedUserId) {
      await writePgPurchaseStatus(
        normalizedUserId,
        hasPurchased,
        updatedAt,
        updatedBy,
      );
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
