const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  normalizeJson,
  safeStringify,
} = require("./shared");

function createSettingsRepository({
  cacheTtlMs = 30_000,
} = {}) {
  const cache = new Map();

  function ensurePostgres() {
    if (!isPostgresConfigured()) {
      throw new Error("settings_storage_requires_postgres");
    }
  }

  async function readPostgresValue(key) {
    ensurePostgres();
    const result = await query("SELECT value FROM settings WHERE key = $1", [key]);
    return result.rows[0]?.value;
  }

  async function readPostgresAll() {
    ensurePostgres();
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
    ensurePostgres();
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

  async function ensureDefaults(defaultSettings = []) {
    ensurePostgres();
    for (const setting of defaultSettings) {
      if (!setting || typeof setting.key !== "string") continue;
      const existing = await readPostgresValue(setting.key);
      if (typeof existing !== "undefined") continue;
      await writePostgresValue(setting.key, setting.value, new Date());
    }
  }

  async function getAll() {
    const pgDocs = await readPostgresAll();
    const expireAt = Date.now() + cacheTtlMs;
    pgDocs.forEach((doc) => {
      if (doc && typeof doc.key === "string") {
        cache.set(doc.key, { value: doc.value, expireAt });
      }
    });
    return pgDocs;
  }

  async function getValue(key, defaultValue) {
    const cached = cache.get(key);
    if (cached && Date.now() < cached.expireAt) {
      return cached.value;
    }

    const pgValue = await readPostgresValue(key);
    const value =
      typeof pgValue === "undefined" ? defaultValue : pgValue;
    cache.set(key, { value, expireAt: Date.now() + cacheTtlMs });
    return value;
  }

  async function setValue(key, value) {
    const updatedAt = new Date();
    await writePostgresValue(key, value, updatedAt);
    cache.delete(key);
    return true;
  }

  async function setMany(entries = []) {
    const updates = entries.filter(
      (entry) => entry && typeof entry.key === "string",
    );
    if (updates.length === 0) return true;

    const updatedAt = new Date();
    await Promise.all(
      updates.map((entry) => writePostgresValue(entry.key, entry.value, updatedAt)),
    );

    for (const entry of updates) {
      cache.delete(entry.key);
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
