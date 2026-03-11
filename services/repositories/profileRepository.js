const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  applyProjection,
  normalizePlatform,
  safeStringify,
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

function buildMongoProfileFilter(userId, platform) {
  const normalizedUserId = toLegacyId(userId);
  const normalizedPlatform = normalizePlatform(platform);
  if (normalizedPlatform === "line") {
    return {
      userId: normalizedUserId,
      $or: [
        { platform: "line" },
        { platform: { $exists: false } },
        { platform: null },
      ],
    };
  }
  return {
    userId: normalizedUserId,
    platform: normalizedPlatform,
  };
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

function buildComparableProfile(doc = {}) {
  const normalized = normalizeProfileDoc(doc);
  return {
    userId: normalized.userId,
    platform: normalized.platform,
    displayName: normalized.displayName || null,
    pictureUrl: normalized.pictureUrl || null,
    statusMessage: normalized.statusMessage || null,
    profileFetchDisabled: Boolean(normalized.profileFetchDisabled),
    profileFetchDisabledReason: normalized.profileFetchDisabledReason || null,
    profileFetchFailedAt: normalized.profileFetchFailedAt || null,
    profileFetchLastError: normalized.profileFetchLastError || null,
    createdAt: normalized.createdAt || null,
    updatedAt: normalized.updatedAt || null,
  };
}

function createProfileRepository({
  connectDB,
  dbName = "chatbot",
  runtimeConfig,
}) {
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
    return Boolean(runtimeConfig?.features?.postgresReadPrimaryChat && canUsePostgres());
  }

  async function getDb() {
    const client = await connectDB();
    return client.db(dbName);
  }

  function startShadowCompare(label, mongoValue, pgValue) {
    if (!shouldShadowRead() || shouldReadPrimary()) return;
    const normalizeList = (value) =>
      Array.isArray(value)
        ? value.map((item) => buildComparableProfile(item))
        : buildComparableProfile(value);
    if (safeStringify(normalizeList(mongoValue)) !== safeStringify(normalizeList(pgValue))) {
      console.warn(`[ProfileRepository] Shadow read mismatch for ${label}`);
    }
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
    const normalizedUserId = toLegacyId(userId);
    const normalizedPlatform = normalizePlatform(platform);
    const projection = options?.projection || null;

    if (!normalizedUserId) {
      return null;
    }

    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPgProfile(normalizedUserId, normalizedPlatform);
        if (pgDoc) {
          return applyProjection(pgDoc, projection);
        }
      } catch (error) {
        console.warn(
          `[ProfileRepository] Primary profile read failed for ${normalizedPlatform}:${normalizedUserId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const db = await getDb();
    const mongoDoc = await db.collection("user_profiles").findOne(
      buildMongoProfileFilter(normalizedUserId, normalizedPlatform),
      projection ? { projection } : {},
    );

    if (shouldShadowRead()) {
      void readPgProfile(normalizedUserId, normalizedPlatform)
        .then((pgDoc) => startShadowCompare(
          `profile:${normalizedPlatform}:${normalizedUserId}`,
          mongoDoc,
          pgDoc,
        ))
        .catch((error) => {
          console.warn(
            `[ProfileRepository] Shadow profile read failed for ${normalizedPlatform}:${normalizedUserId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function listProfilesByPairs(pairs = [], options = {}) {
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

    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPgProfilesByPairs(normalizedPairs);
        if (pgDocs.length > 0) {
          const pgMap = new Map(
            pgDocs.map((doc) => [buildPairKey(doc.platform, doc.userId), doc]),
          );
          if (pgMap.size === normalizedPairs.length) {
            return projection
              ? pgDocs.map((doc) => applyProjection(doc, projection))
              : pgDocs;
          }
        }
      } catch (error) {
        console.warn(
          "[ProfileRepository] Primary profile pair-list read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const db = await getDb();
    const mongoDocs = await db.collection("user_profiles")
      .find(
        { $or: normalizedPairs.map((pair) => buildMongoProfileFilter(pair.userId, pair.platform)) },
        projection ? { projection } : {},
      )
      .toArray();

    if (shouldShadowRead()) {
      void readPgProfilesByPairs(normalizedPairs)
        .then((pgDocs) => {
          const mongoMap = new Map(
            mongoDocs.map((doc) => [
              buildPairKey(doc.platform || "line", doc.userId),
              normalizeProfileDoc(doc),
            ]),
          );
          const pgMap = new Map(
            pgDocs.map((doc) => [buildPairKey(doc.platform, doc.userId), doc]),
          );
          startShadowCompare(
            `profilePairs:${safeStringify(normalizedPairs)}`,
            Array.from(mongoMap.values()),
            Array.from(pgMap.values()),
          );
        })
        .catch((error) => {
          console.warn(
            "[ProfileRepository] Shadow profile pair-list read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function listProfilesByUserIds(userIds = [], options = {}) {
    const normalizedIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    const projection = options?.projection || null;
    if (normalizedIds.length === 0) return [];

    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPgProfilesByUserIds(normalizedIds);
        if (pgDocs.length > 0) {
          const pgUserIds = new Set(
            pgDocs.map((doc) => toLegacyId(doc.userId)).filter(Boolean),
          );
          if (pgUserIds.size === new Set(normalizedIds).size) {
            return projection
              ? pgDocs.map((doc) => applyProjection(doc, projection))
              : pgDocs;
          }
        }
      } catch (error) {
        console.warn(
          "[ProfileRepository] Primary profile user-list read failed, falling back to Mongo:",
          error?.message || error,
        );
      }
    }

    const db = await getDb();
    const mongoDocs = await db.collection("user_profiles")
      .find({ userId: { $in: normalizedIds } }, projection ? { projection } : {})
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    const seenUserIds = new Set();
    const dedupedMongoDocs = mongoDocs.filter((doc) => {
      const userId = toLegacyId(doc?.userId);
      if (!userId || seenUserIds.has(userId)) return false;
      seenUserIds.add(userId);
      return true;
    });

    if (shouldShadowRead()) {
      void readPgProfilesByUserIds(normalizedIds)
        .then((pgDocs) => {
          const mongoMap = new Map(
            dedupedMongoDocs.map((doc) => [toLegacyId(doc.userId), normalizeProfileDoc(doc)]),
          );
          const pgMap = new Map(
            pgDocs.map((doc) => [toLegacyId(doc.userId), doc]),
          );
          startShadowCompare(
            `profileUserIds:${safeStringify(normalizedIds)}`,
            Array.from(mongoMap.values()),
            Array.from(pgMap.values()),
          );
        })
        .catch((error) => {
          console.warn(
            "[ProfileRepository] Shadow profile user-list read failed:",
            error?.message || error,
          );
        });
    }

    return dedupedMongoDocs;
  }

  async function upsertProfile(profile = {}, options = {}) {
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
    const db = await getDb();
    const filter = buildMongoProfileFilter(normalized.userId, normalized.platform);
    const setDoc = {
      userId: normalized.userId,
      platform: normalized.platform,
      updatedAt: now,
    };

    Object.entries(updateFields).forEach(([key, value]) => {
      if (typeof value !== "undefined") {
        setDoc[key] = value;
      }
    });

    const unsetDoc = {};
    unsetFields.forEach((field) => {
      unsetDoc[field] = "";
    });

    await db.collection("user_profiles").updateOne(
      filter,
      {
        $set: setDoc,
        ...(unsetFields.length > 0 ? { $unset: unsetDoc } : {}),
        $setOnInsert: {
          createdAt: normalized.createdAt || now,
        },
      },
      { upsert: true },
    );

    const savedDoc = await db.collection("user_profiles").findOne(
      { userId: normalized.userId, platform: normalized.platform },
    );

    if (shouldDualWrite()) {
      await writePgProfile(savedDoc || {
        ...profile,
        userId: normalized.userId,
        platform: normalized.platform,
        updatedAt: now,
        createdAt: normalized.createdAt || now,
      }).catch((error) => {
        console.warn(
          `[ProfileRepository] Dual-write failed for ${normalized.platform}:${normalized.userId}:`,
          error?.message || error,
        );
      });
    }

    return savedDoc || {
      ...profile,
      userId: normalized.userId,
      platform: normalized.platform,
      updatedAt: now,
      createdAt: normalized.createdAt || now,
    };
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
