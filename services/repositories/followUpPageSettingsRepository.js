const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  normalizePlatform,
  toLegacyId,
} = require("./shared");

function normalizeSettingsPayload(value = {}) {
  return value && typeof value === "object" ? { ...value } : {};
}

function normalizeFollowUpPageSettingsDoc(doc = {}) {
  const settings = normalizeSettingsPayload(doc.settings);

  if (
    typeof doc.orderExtractionEnabled === "boolean" &&
    typeof settings.orderExtractionEnabled !== "boolean"
  ) {
    settings.orderExtractionEnabled = doc.orderExtractionEnabled;
  }
  if (
    typeof doc.orderModel === "string" &&
    doc.orderModel.trim() &&
    typeof settings.orderModel !== "string"
  ) {
    settings.orderModel = doc.orderModel.trim();
  }
  if (
    typeof doc.model === "string" &&
    doc.model.trim() &&
    typeof settings.model !== "string"
  ) {
    settings.model = doc.model.trim();
  }

  return {
    platform: normalizePlatform(doc.platform),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id) || null,
    settings,
    createdAt: doc.createdAt || doc.created_at || null,
    updatedAt: doc.updatedAt || doc.updated_at || null,
  };
}

function createFollowUpPageSettingsRepository() {
  function ensurePostgres() {
    if (!isPostgresConfigured()) {
      throw new Error("follow_up_page_settings_storage_requires_postgres");
    }
  }

  async function readPgExact(platform, botId = null) {
    ensurePostgres();
    const normalizedPlatform = normalizePlatform(platform);
    const legacyBotId = toLegacyId(botId);
    const result = await query(
      `
        SELECT
          platform,
          legacy_bot_id,
          settings,
          created_at,
          updated_at
        FROM follow_up_page_settings
        WHERE platform = $1
          AND COALESCE(legacy_bot_id, '') = COALESCE($2, '')
        LIMIT 1
      `,
      [normalizedPlatform, legacyBotId || ""],
    );
    return result.rows[0] ? normalizeFollowUpPageSettingsDoc(result.rows[0]) : null;
  }

  async function readPgListAll() {
    ensurePostgres();
    const result = await query(
      `
        SELECT
          platform,
          legacy_bot_id,
          settings,
          created_at,
          updated_at
        FROM follow_up_page_settings
        ORDER BY platform ASC, legacy_bot_id ASC
      `,
    );
    return result.rows.map((row) => normalizeFollowUpPageSettingsDoc(row));
  }

  async function readPgByPlatform(platform) {
    ensurePostgres();
    const normalizedPlatform = normalizePlatform(platform);
    const result = await query(
      `
        SELECT
          platform,
          legacy_bot_id,
          settings,
          created_at,
          updated_at
        FROM follow_up_page_settings
        WHERE platform = $1
        ORDER BY legacy_bot_id ASC
      `,
      [normalizedPlatform],
    );
    return result.rows.map((row) => normalizeFollowUpPageSettingsDoc(row));
  }

  async function writePgDoc(doc = {}) {
    ensurePostgres();
    const normalized = normalizeFollowUpPageSettingsDoc(doc);
    const pgBotId = await resolvePgBotId({ query }, normalized.platform, normalized.botId);
    await query(
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
        normalized.platform,
        normalized.botId || "",
        pgBotId,
        JSON.stringify(normalized.settings || {}),
        normalized.createdAt || new Date(),
        normalized.updatedAt || normalized.createdAt || new Date(),
      ],
    );
  }

  async function listAll() {
    return readPgListAll();
  }

  async function listByPlatform(platform) {
    return readPgByPlatform(platform);
  }

  async function getExact(platform, botId = null) {
    return readPgExact(platform, botId);
  }

  async function upsert(platform, botId = null, settings = {}) {
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedBotId = toLegacyId(botId) || null;
    const normalizedSettings = normalizeSettingsPayload(settings);
    const now = new Date();

    await writePgDoc({
      platform: normalizedPlatform,
      botId: normalizedBotId,
      settings: normalizedSettings,
      createdAt: now,
      updatedAt: now,
    });

    return readPgExact(normalizedPlatform, normalizedBotId);
  }

  async function deleteOne(platform, botId = null) {
    ensurePostgres();
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedBotId = toLegacyId(botId) || null;
    await query(
      `
        DELETE FROM follow_up_page_settings
        WHERE platform = $1
          AND COALESCE(legacy_bot_id, '') = COALESCE($2, '')
      `,
      [normalizedPlatform, normalizedBotId || ""],
    );
  }

  return {
    deleteOne,
    getExact,
    listAll,
    listByPlatform,
    normalizeFollowUpPageSettingsDoc,
    upsert,
  };
}

module.exports = {
  createFollowUpPageSettingsRepository,
};
