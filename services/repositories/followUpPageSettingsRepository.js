const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  normalizePlatform,
  safeStringify,
  toLegacyId,
  warnPrimaryReadFailure,
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

function buildComparablePageSettings(doc = {}) {
  const normalized = normalizeFollowUpPageSettingsDoc(doc);
  return {
    platform: normalized.platform,
    botId: normalized.botId,
    settings: normalized.settings,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  };
}

function buildSettingsKey(platform, botId = null) {
  return `${normalizePlatform(platform)}:${toLegacyId(botId) || "default"}`;
}

function createFollowUpPageSettingsRepository({
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
        && (runtimeConfig?.features?.postgresReadPrimaryFollowUp || !canUseMongo()),
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
    const normalize = (value) =>
      Array.isArray(value)
        ? value.map((item) => buildComparablePageSettings(item))
        : buildComparablePageSettings(value);
    if (safeStringify(normalize(mongoValue)) !== safeStringify(normalize(pgValue))) {
      console.warn(`[FollowUpPageSettingsRepository] Shadow read mismatch for ${label}`);
    }
  }

  async function readPgExact(platform, botId = null) {
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
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPgListAll();
        if (pgDocs.length > 0 || !canUseMongo()) return pgDocs;
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "FollowUpPageSettingsRepository",
          operation: "listAll read",
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const db = await getDb();
    const mongoDocs = await db.collection("follow_up_page_settings")
      .find({})
      .sort({ platform: 1, botId: 1 })
      .toArray();

    if (shouldShadowRead()) {
      void readPgListAll()
        .then((pgDocs) => {
          const mongoMap = new Map(
            mongoDocs.map((doc) => {
              const normalized = normalizeFollowUpPageSettingsDoc(doc);
              return [buildSettingsKey(normalized.platform, normalized.botId), normalized];
            }),
          );
          const pgMap = new Map(
            pgDocs.map((doc) => [buildSettingsKey(doc.platform, doc.botId), doc]),
          );
          startShadowCompare(
            "listAll",
            Array.from(mongoMap.values()),
            Array.from(pgMap.values()),
          );
        })
        .catch((error) => {
          console.warn(
            "[FollowUpPageSettingsRepository] Shadow listAll read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function listByPlatform(platform) {
    const normalizedPlatform = normalizePlatform(platform);
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPgByPlatform(normalizedPlatform);
        if (pgDocs.length > 0 || !canUseMongo()) return pgDocs;
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "FollowUpPageSettingsRepository",
          operation: "platform read",
          identifier: normalizedPlatform,
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const db = await getDb();
    const mongoDocs = await db.collection("follow_up_page_settings")
      .find({ platform: normalizedPlatform })
      .sort({ botId: 1 })
      .toArray();

    if (shouldShadowRead()) {
      void readPgByPlatform(normalizedPlatform)
        .then((pgDocs) => startShadowCompare(
          `platform:${normalizedPlatform}`,
          mongoDocs,
          pgDocs,
        ))
        .catch((error) => {
          console.warn(
            `[FollowUpPageSettingsRepository] Shadow platform read failed for ${normalizedPlatform}:`,
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function getExact(platform, botId = null) {
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedBotId = toLegacyId(botId) || null;

    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPgExact(normalizedPlatform, normalizedBotId);
        if (pgDoc || !canUseMongo()) return pgDoc;
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "FollowUpPageSettingsRepository",
          operation: "exact read",
          identifier: buildSettingsKey(normalizedPlatform, normalizedBotId),
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return null;
    }

    const db = await getDb();
    const mongoDoc = await db.collection("follow_up_page_settings").findOne({
      platform: normalizedPlatform,
      botId: normalizedBotId,
    });

    if (shouldShadowRead()) {
      void readPgExact(normalizedPlatform, normalizedBotId)
        .then((pgDoc) => startShadowCompare(
          `exact:${buildSettingsKey(normalizedPlatform, normalizedBotId)}`,
          mongoDoc,
          pgDoc,
        ))
        .catch((error) => {
          console.warn(
            `[FollowUpPageSettingsRepository] Shadow exact read failed for ${buildSettingsKey(normalizedPlatform, normalizedBotId)}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function upsert(platform, botId = null, settings = {}) {
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedBotId = toLegacyId(botId) || null;
    const normalizedSettings = normalizeSettingsPayload(settings);
    const now = new Date();

    let savedDoc = null;
    if (canUseMongo()) {
      const db = await getDb();
      await db.collection("follow_up_page_settings").updateOne(
        { platform: normalizedPlatform, botId: normalizedBotId },
        {
          $set: {
            platform: normalizedPlatform,
            botId: normalizedBotId,
            settings: normalizedSettings,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true },
      );

      savedDoc = await db.collection("follow_up_page_settings").findOne({
        platform: normalizedPlatform,
        botId: normalizedBotId,
      });
    }

    if (canUsePostgres() && (shouldDualWrite() || !canUseMongo())) {
      await writePgDoc(savedDoc || {
        platform: normalizedPlatform,
        botId: normalizedBotId,
        settings: normalizedSettings,
        createdAt: now,
        updatedAt: now,
      }).catch((error) => {
        console.warn(
          `[FollowUpPageSettingsRepository] Dual-write failed for ${buildSettingsKey(normalizedPlatform, normalizedBotId)}:`,
          error?.message || error,
        );
      });
    }

    if (!savedDoc && canUsePostgres()) {
      savedDoc = await readPgExact(normalizedPlatform, normalizedBotId);
    }

    return savedDoc || {
      platform: normalizedPlatform,
      botId: normalizedBotId,
      settings: normalizedSettings,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function deleteOne(platform, botId = null) {
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedBotId = toLegacyId(botId) || null;
    if (canUseMongo()) {
      const db = await getDb();
      await db.collection("follow_up_page_settings").deleteOne({
        platform: normalizedPlatform,
        botId: normalizedBotId,
      });
    }

    if (canUsePostgres()) {
      await query(
        `
          DELETE FROM follow_up_page_settings
          WHERE platform = $1
            AND COALESCE(legacy_bot_id, '') = COALESCE($2, '')
        `,
        [normalizedPlatform, normalizedBotId || ""],
      ).catch((error) => {
        console.warn(
          `[FollowUpPageSettingsRepository] PostgreSQL delete failed for ${buildSettingsKey(normalizedPlatform, normalizedBotId)}:`,
          error?.message || error,
        );
      });
    }
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
