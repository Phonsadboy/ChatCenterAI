const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  applyProjection,
  normalizePlatform,
  toLegacyId,
} = require("./shared");

function buildPairKey(platform, userId) {
  return `${normalizePlatform(platform)}:${toLegacyId(userId)}`;
}

function dedupePairs(pairs = []) {
  const seen = new Set();
  return pairs.filter((pair) => {
    const key = buildPairKey(pair?.platform, pair?.userId);
    if (!pair?.userId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeProfileDoc(doc = {}) {
  const profileData =
    doc?.profileData && typeof doc.profileData === "object"
      ? doc.profileData
      : doc?.profile_data && typeof doc.profile_data === "object"
        ? doc.profile_data
        : {};

  const merged = {
    ...profileData,
    userId: toLegacyId(doc.userId || doc.legacy_contact_id),
    platform: normalizePlatform(doc.platform),
    displayName:
      doc.displayName ||
      doc.display_name ||
      profileData.displayName ||
      null,
    pictureUrl: doc.pictureUrl || profileData.pictureUrl || null,
    statusMessage: doc.statusMessage || profileData.statusMessage || null,
    profileFetchDisabled:
      typeof doc.profileFetchDisabled === "boolean"
        ? doc.profileFetchDisabled
        : typeof profileData.profileFetchDisabled === "boolean"
          ? profileData.profileFetchDisabled
          : false,
    profileFetchDisabledReason:
      doc.profileFetchDisabledReason ||
      profileData.profileFetchDisabledReason ||
      null,
    profileFetchFailedAt:
      doc.profileFetchFailedAt ||
      profileData.profileFetchFailedAt ||
      null,
    profileFetchLastError:
      doc.profileFetchLastError ||
      profileData.profileFetchLastError ||
      null,
    createdAt: doc.createdAt || doc.created_at || profileData.createdAt || null,
    updatedAt: doc.updatedAt || doc.updated_at || profileData.updatedAt || null,
  };

  return merged;
}

function createProfileRepository({
  dbName = "chatbot",
  runtimeConfig,
}) {
  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  function ensurePostgresAvailable() {
    if (canUsePostgres()) return;
    throw new Error(`profile_repository_requires_postgres:${dbName}`);
  }

  async function readPgProfile(userId, platform) {
    const result = await query(
      `
        SELECT
          legacy_contact_id,
          platform,
          display_name,
          profile_data,
          created_at,
          updated_at
        FROM contacts
        WHERE legacy_contact_id = $1
          AND platform = $2
        LIMIT 1
      `,
      [toLegacyId(userId), normalizePlatform(platform)],
    );
    return result.rows[0] ? normalizeProfileDoc(result.rows[0]) : null;
  }

  async function readPgProfilesByPairs(pairs = []) {
    const normalizedPairs = dedupePairs(Array.isArray(pairs)
      ? pairs
        .map((pair) => ({
          userId: toLegacyId(pair?.userId),
          platform: normalizePlatform(pair?.platform),
        }))
        .filter((pair) => pair.userId)
      : []);
    if (normalizedPairs.length === 0) return [];

    const params = [];
    const valuesSql = normalizedPairs
      .map((pair, index) => {
        params.push(pair.platform, pair.userId);
        const base = index * 2;
        return `($${base + 1}, $${base + 2})`;
      })
      .join(", ");

    const result = await query(
      `
        WITH requested(platform, legacy_contact_id) AS (
          VALUES ${valuesSql}
        )
        SELECT
          c.legacy_contact_id,
          c.platform,
          c.display_name,
          c.profile_data,
          c.created_at,
          c.updated_at
        FROM contacts c
        INNER JOIN requested r
          ON r.platform = c.platform
         AND r.legacy_contact_id = c.legacy_contact_id
      `,
      params,
    );

    return result.rows.map((row) => normalizeProfileDoc(row));
  }

  async function readPgProfilesByUserIds(userIds = []) {
    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) return [];

    const result = await query(
      `
        WITH ranked AS (
          SELECT
            c.legacy_contact_id,
            c.platform,
            c.display_name,
            c.profile_data,
            c.created_at,
            c.updated_at,
            ROW_NUMBER() OVER (
              PARTITION BY c.legacy_contact_id
              ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
            ) AS row_no
          FROM contacts c
          WHERE c.legacy_contact_id = ANY($1::text[])
        )
        SELECT
          legacy_contact_id,
          platform,
          display_name,
          profile_data,
          created_at,
          updated_at
        FROM ranked
        WHERE row_no = 1
      `,
      [normalizedIds],
    );

    return result.rows.map((row) => normalizeProfileDoc(row));
  }

  async function writePgProfile(profile = {}) {
    const normalized = normalizeProfileDoc(profile);
    const profileData = { ...normalized };
    delete profileData.userId;
    delete profileData.platform;

    await query(
      `
        INSERT INTO contacts (
          platform,
          legacy_contact_id,
          display_name,
          profile_data,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
        ON CONFLICT (platform, legacy_contact_id) DO UPDATE SET
          display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
          profile_data = EXCLUDED.profile_data,
          updated_at = EXCLUDED.updated_at
      `,
      [
        normalized.platform,
        normalized.userId,
        normalized.displayName || null,
        JSON.stringify(profileData),
        normalized.createdAt || new Date(),
        normalized.updatedAt || normalized.createdAt || new Date(),
      ],
    );
  }

  async function getProfile(userId, platform, options = {}) {
    ensurePostgresAvailable();
    const normalizedUserId = toLegacyId(userId);
    const normalizedPlatform = normalizePlatform(platform);
    const projection = options?.projection || null;

    if (!normalizedUserId) {
      return null;
    }

    const pgDoc = await readPgProfile(normalizedUserId, normalizedPlatform);
    return applyProjection(pgDoc, projection);
  }

  async function listProfilesByPairs(pairs = [], options = {}) {
    ensurePostgresAvailable();
    const normalizedPairs = dedupePairs(Array.isArray(pairs)
      ? pairs
        .map((pair) => ({
          userId: toLegacyId(pair?.userId),
          platform: normalizePlatform(pair?.platform),
        }))
        .filter((pair) => pair.userId)
      : []);
    const projection = options?.projection || null;
    if (normalizedPairs.length === 0) return [];
    const pgDocs = await readPgProfilesByPairs(normalizedPairs);
    return projection
      ? pgDocs.map((doc) => applyProjection(doc, projection))
      : pgDocs;
  }

  async function listProfilesByUserIds(userIds = [], options = {}) {
    ensurePostgresAvailable();
    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    const projection = options?.projection || null;
    if (normalizedIds.length === 0) return [];
    const pgDocs = await readPgProfilesByUserIds(normalizedIds);
    return projection
      ? pgDocs.map((doc) => applyProjection(doc, projection))
      : pgDocs;
  }

  async function upsertProfile(profile = {}, options = {}) {
    ensurePostgresAvailable();
    const normalized = normalizeProfileDoc(profile);
    if (!normalized.userId) {
      throw new Error("userId is required");
    }

    const unsetFields = Array.isArray(options?.unsetFields)
      ? options.unsetFields.filter(Boolean)
      : [];
    const updateFields = { ...profile };
    delete updateFields._id;
    delete updateFields.userId;
    delete updateFields.platform;
    delete updateFields.createdAt;

    const now = normalized.updatedAt || new Date();

    const fallbackDoc = {
      ...profile,
      userId: normalized.userId,
      platform: normalized.platform,
      updatedAt: now,
      createdAt: normalized.createdAt || now,
    };
    unsetFields.forEach((field) => {
      delete fallbackDoc[field];
    });

    await writePgProfile(fallbackDoc);
    return (await readPgProfile(normalized.userId, normalized.platform)) || fallbackDoc;
  }

  return {
    getProfile,
    listProfilesByPairs,
    listProfilesByUserIds,
    normalizeProfileDoc,
    upsertProfile,
  };
}

module.exports = {
  createProfileRepository,
};
