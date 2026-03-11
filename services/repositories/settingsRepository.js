const { isPostgresConfigured, query } = require("../../infra/postgres");
const { normalizeJson, safeStringify } = require("./shared");

function createSettingsRepository({
  connectDB,
  dbName = "chatbot",
  runtimeConfig,
  cacheTtlMs = 30_000,
}) {
  const cache = new Map();

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
      runtimeConfig?.features?.postgresReadPrimarySettings && canUsePostgres(),
    );
  }

  async function getCollection() {
    const client = await connectDB();
    return client.db(dbName).collection("settings");
  }

  async function readPostgresValue(key) {
    const result = await query("SELECT value FROM settings WHERE key = $1", [key]);
    return result.rows[0]?.value;
  }

  async function readPostgresAll() {
    const result = await query(
      "SELECT key, value, updated_at FROM settings ORDER BY key ASC",
    );
    return result.rows.map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
    }));
  }

  async function writePostgresValue(key, value, updatedAt = new Date()) {
    await query(
      `
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
      `,
      [key, safeStringify(normalizeJson(value, null)), updatedAt],
    );
  }

  function startShadowRead(key, mongoValue, defaultValue) {
    if (!shouldShadowRead()) return;
    void (async () => {
      try {
        const pgValue = await readPostgresValue(key);
        const normalizedPgValue =
          typeof pgValue === "undefined" ? defaultValue : pgValue;
        if (safeStringify(mongoValue) !== safeStringify(normalizedPgValue)) {
          console.warn(`[SettingsRepository] Shadow read mismatch for key "${key}"`);
        }
      } catch (error) {
        console.warn(
          `[SettingsRepository] Shadow read failed for "${key}":`,
          error?.message || error,
        );
      }
    })();
  }

  async function ensureDefaults(defaultSettings = []) {
    const coll = await getCollection();
    for (const setting of defaultSettings) {
      if (!setting || typeof setting.key !== "string") continue;
      const existing = await coll.findOne({ key: setting.key });
      if (existing) {
        if (shouldDualWrite()) {
          await writePostgresValue(
            setting.key,
            existing.value,
            existing.updatedAt || new Date(),
          ).catch((error) => {
            console.warn(
              `[SettingsRepository] Dual-write failed for "${setting.key}":`,
              error?.message || error,
            );
          });
        }
        continue;
      }

      const now = new Date();
      await coll.insertOne({
        key: setting.key,
        value: setting.value,
        updatedAt: now,
      });

      if (shouldDualWrite()) {
        await writePostgresValue(setting.key, setting.value, now).catch((error) => {
          console.warn(
            `[SettingsRepository] Dual-write failed for "${setting.key}":`,
            error?.message || error,
          );
        });
      }
    }
  }

  async function getAll() {
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPostgresAll();
        if (pgDocs.length > 0) {
          return pgDocs;
        }
      } catch (error) {
        console.warn(
          "[SettingsRepository] Primary read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const coll = await getCollection();
    return coll.find({}).toArray();
  }

  async function getValue(key, defaultValue) {
    const cached = cache.get(key);
    if (cached && Date.now() < cached.expireAt) {
      return cached.value;
    }

    if (shouldReadPrimary()) {
      try {
        const pgValue = await readPostgresValue(key);
        if (typeof pgValue !== "undefined") {
          cache.set(key, { value: pgValue, expireAt: Date.now() + cacheTtlMs });
          return pgValue;
        }
      } catch (error) {
        console.warn(
          `[SettingsRepository] Primary read failed for "${key}", falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const coll = await getCollection();
    const doc = await coll.findOne({ key });
    const value =
      !doc || typeof doc.value === "undefined" ? defaultValue : doc.value;
    cache.set(key, { value, expireAt: Date.now() + cacheTtlMs });
    startShadowRead(key, value, defaultValue);
    return value;
  }

  async function setValue(key, value) {
    const coll = await getCollection();
    const updatedAt = new Date();
    await coll.updateOne(
      { key },
      { $set: { value, updatedAt } },
      { upsert: true },
    );
    cache.delete(key);

    if (shouldDualWrite()) {
      await writePostgresValue(key, value, updatedAt).catch((error) => {
        console.warn(
          `[SettingsRepository] Dual-write failed for "${key}":`,
          error?.message || error,
        );
      });
    }

    return true;
  }

  async function setMany(entries = []) {
    const updates = entries.filter(
      (entry) => entry && typeof entry.key === "string",
    );
    if (updates.length === 0) return true;

    const coll = await getCollection();
    const updatedAt = new Date();
    await coll.bulkWrite(
      updates.map((entry) => ({
        updateOne: {
          filter: { key: entry.key },
          update: { $set: { value: entry.value, updatedAt } },
          upsert: true,
        },
      })),
      { ordered: true },
    );

    for (const entry of updates) {
      cache.delete(entry.key);
    }

    if (shouldDualWrite()) {
      await Promise.all(
        updates.map((entry) =>
          writePostgresValue(entry.key, entry.value, updatedAt).catch((error) => {
            console.warn(
              `[SettingsRepository] Dual-write failed for "${entry.key}":`,
              error?.message || error,
            );
          }),
        ),
      );
    }

    return true;
  }

  function invalidateKeys(keys = []) {
    if (!Array.isArray(keys)) return;
    for (const key of keys) {
      if (typeof key === "string" && key.trim()) {
        cache.delete(key.trim());
      }
    }
  }

  function clearCache() {
    cache.clear();
  }

  return {
    clearCache,
    ensureDefaults,
    getAll,
    getValue,
    invalidateKeys,
    setMany,
    setValue,
  };
}

module.exports = {
  createSettingsRepository,
};
