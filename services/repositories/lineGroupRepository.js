const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const { toLegacyId } = require("./shared");

function normalizeLineGroupDoc(doc = {}) {
  const metadata =
    doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
  return {
    botId: toLegacyId(doc.botId || doc.legacy_bot_id) || null,
    groupId: toLegacyId(doc.groupId) || null,
    sourceType:
      typeof doc.sourceType === "string"
        ? doc.sourceType
        : typeof doc.source_type === "string"
          ? doc.source_type
          : metadata.sourceType || null,
    groupName:
      typeof doc.groupName === "string"
        ? doc.groupName
        : typeof doc.group_name === "string"
          ? doc.group_name
          : metadata.groupName || null,
    pictureUrl:
      typeof doc.pictureUrl === "string"
        ? doc.pictureUrl
        : typeof doc.picture_url === "string"
          ? doc.picture_url
          : metadata.pictureUrl || null,
    memberCount:
      Number.isFinite(Number(doc.memberCount))
        ? Number(doc.memberCount)
        : Number.isFinite(Number(doc.member_count))
          ? Number(doc.member_count)
          : metadata.memberCount ?? null,
    status:
      typeof doc.status === "string"
        ? doc.status
        : metadata.status || "active",
    joinedAt: doc.joinedAt || doc.joined_at || metadata.joinedAt || null,
    leftAt: doc.leftAt || doc.left_at || metadata.leftAt || null,
    lastEventAt: doc.lastEventAt || doc.last_event_at || metadata.lastEventAt || null,
    createdAt: doc.createdAt || doc.created_at || metadata.createdAt || null,
    updatedAt: doc.updatedAt || doc.updated_at || metadata.updatedAt || null,
    metadata,
  };
}

function createLineGroupRepository({
  connectDB,
  dbName = "chatbot",
  runtimeConfig,
}) {
  function canUseMongo() {
    return runtimeConfig?.features?.mongoEnabled !== false;
  }

  function canUsePostgres() {
    return Boolean(isPostgresConfigured());
  }

  function shouldReadPrimary() {
    return canUsePostgres();
  }

  async function getDb() {
    if (!canUseMongo()) {
      throw new Error("MongoDB is disabled");
    }
    const client = await connectDB();
    return client.db(dbName);
  }

  function buildMongoFilter(filter = {}) {
    const queryFilter = {};
    const botId = toLegacyId(filter.botId);
    if (botId) {
      queryFilter.botId = botId;
    }
    const botIds = Array.isArray(filter.botIds)
      ? filter.botIds.map((value) => toLegacyId(value)).filter(Boolean)
      : [];
    if (!botId && botIds.length > 0) {
      queryFilter.botId = { $in: botIds };
    }
    const groupId = toLegacyId(filter.groupId);
    if (groupId) {
      queryFilter.groupId = groupId;
    }
    const excludedStatuses = Array.isArray(filter.excludeStatuses)
      ? filter.excludeStatuses.filter(Boolean)
      : filter.excludeStatus
        ? [filter.excludeStatus]
        : [];
    if (excludedStatuses.length === 1) {
      queryFilter.status = { $ne: excludedStatuses[0] };
    } else if (excludedStatuses.length > 1) {
      queryFilter.status = { $nin: excludedStatuses };
    }
    const status = typeof filter.status === "string" ? filter.status.trim() : "";
    if (status) {
      queryFilter.status = status;
    }
    return queryFilter;
  }

  function buildPostgresFilter(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    const botId = toLegacyId(filter.botId);
    if (botId) {
      push("legacy_bot_id =", botId);
    }
    const botIds = Array.isArray(filter.botIds)
      ? filter.botIds.map((value) => toLegacyId(value)).filter(Boolean)
      : [];
    if (!botId && botIds.length > 0) {
      params.push(botIds);
      conditions.push(`legacy_bot_id = ANY($${params.length})`);
    }
    const groupId = toLegacyId(filter.groupId);
    if (groupId) {
      push("group_id =", groupId);
    }
    const status = typeof filter.status === "string" ? filter.status.trim() : "";
    if (status) {
      push("status =", status);
    }
    const excludedStatuses = Array.isArray(filter.excludeStatuses)
      ? filter.excludeStatuses.filter(Boolean)
      : filter.excludeStatus
        ? [filter.excludeStatus]
        : [];
    if (excludedStatuses.length > 0) {
      params.push(excludedStatuses);
      conditions.push(`COALESCE(status, '') <> ALL($${params.length})`);
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  async function readPostgresGroups(filter = {}, options = {}) {
    const { whereSql, params } = buildPostgresFilter(filter);
    const sortDirection = Number(options?.sort?.lastEventAt) >= 0 ? "ASC" : "DESC";
    const result = await query(
      `
        SELECT
          id::text,
          legacy_bot_id,
          group_id,
          source_type,
          group_name,
          picture_url,
          member_count,
          status,
          joined_at,
          left_at,
          last_event_at,
          created_at,
          updated_at,
          metadata
        FROM line_bot_groups
        ${whereSql}
        ORDER BY last_event_at ${sortDirection} NULLS LAST, updated_at ${sortDirection}, id ${sortDirection}
      `,
      params,
    );
    return result.rows.map((row) => normalizeLineGroupDoc(row));
  }

  async function readMongoGroups(filter = {}, options = {}) {
    if (!canUseMongo()) return [];
    const db = await getDb();
    const cursor = db
      .collection("line_bot_groups")
      .find(buildMongoFilter(filter))
      .sort(options.sort || { lastEventAt: -1 });
    return cursor.toArray();
  }

  async function upsertPostgresGroup(doc = {}) {
    const normalized = normalizeLineGroupDoc(doc);
    if (!normalized.botId || !normalized.groupId) {
      throw new Error("line_group_requires_bot_and_group_id");
    }
    const pgBotId = await resolvePgBotId({ query }, "line", normalized.botId).catch(() => null);
    const createdAt = normalized.createdAt || new Date();
    const updatedAt = normalized.updatedAt || new Date();
    await query(
      `
        INSERT INTO line_bot_groups (
          bot_id,
          legacy_bot_id,
          group_id,
          source_type,
          group_name,
          picture_url,
          member_count,
          status,
          joined_at,
          left_at,
          last_event_at,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14
        )
        ON CONFLICT (legacy_bot_id, group_id) DO UPDATE SET
          bot_id = EXCLUDED.bot_id,
          source_type = EXCLUDED.source_type,
          group_name = EXCLUDED.group_name,
          picture_url = EXCLUDED.picture_url,
          member_count = EXCLUDED.member_count,
          status = EXCLUDED.status,
          joined_at = COALESCE(EXCLUDED.joined_at, line_bot_groups.joined_at),
          left_at = EXCLUDED.left_at,
          last_event_at = EXCLUDED.last_event_at,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `,
      [
        pgBotId,
        normalized.botId,
        normalized.groupId,
        normalized.sourceType,
        normalized.groupName,
        normalized.pictureUrl,
        Number.isFinite(normalized.memberCount) ? normalized.memberCount : null,
        normalized.status || "active",
        normalized.joinedAt,
        normalized.leftAt,
        normalized.lastEventAt,
        JSON.stringify({
          ...normalized.metadata,
          sourceType: normalized.sourceType,
          groupName: normalized.groupName,
          pictureUrl: normalized.pictureUrl,
          memberCount: Number.isFinite(normalized.memberCount)
            ? normalized.memberCount
            : null,
          status: normalized.status || "active",
          joinedAt: normalized.joinedAt,
          leftAt: normalized.leftAt,
          lastEventAt: normalized.lastEventAt,
        }),
        createdAt,
        updatedAt,
      ],
    );
  }

  async function upsertMongoGroup(doc = {}) {
    if (!canUseMongo()) return null;
    const normalized = normalizeLineGroupDoc(doc);
    if (!normalized.botId || !normalized.groupId) return null;
    const db = await getDb();
    const setDoc = {
      sourceType: normalized.sourceType,
      groupName: normalized.groupName,
      pictureUrl: normalized.pictureUrl,
      memberCount: Number.isFinite(normalized.memberCount)
        ? normalized.memberCount
        : null,
      status: normalized.status || "active",
      lastEventAt: normalized.lastEventAt || new Date(),
      updatedAt: normalized.updatedAt || new Date(),
    };
    if (normalized.joinedAt) {
      setDoc.joinedAt = normalized.joinedAt;
    }
    if (normalized.leftAt) {
      setDoc.leftAt = normalized.leftAt;
    }
    await db.collection("line_bot_groups").updateOne(
      { botId: normalized.botId, groupId: normalized.groupId },
      {
        $setOnInsert: {
          botId: normalized.botId,
          groupId: normalized.groupId,
          createdAt: normalized.createdAt || new Date(),
        },
        $set: setDoc,
      },
      { upsert: true },
    );
    return true;
  }

  async function upsertGroup(doc = {}) {
    const normalized = normalizeLineGroupDoc(doc);
    if (!normalized.botId || !normalized.groupId) {
      throw new Error("line_group_requires_bot_and_group_id");
    }

    if (canUsePostgres()) {
      await upsertPostgresGroup(normalized);
      const [saved] = await readPostgresGroups(
        { botId: normalized.botId, groupId: normalized.groupId },
        { sort: { lastEventAt: -1 } },
      );
      return saved || normalized;
    }
    if (canUseMongo()) {
      await upsertMongoGroup(normalized);
      const [saved] = await readMongoGroups(
        { botId: normalized.botId, groupId: normalized.groupId },
        { sort: { lastEventAt: -1 } },
      );
      return saved || normalized;
    }
    return normalized;
  }

  async function listGroups(filter = {}, options = {}) {
    if (shouldReadPrimary()) {
      return readPostgresGroups(filter, options);
    }
    return readMongoGroups(filter, options);
  }

  async function findGroup(filter = {}, options = {}) {
    const docs = await listGroups(filter, options);
    return docs[0] || null;
  }

  return {
    findGroup,
    listGroups,
    upsertGroup,
  };
}

module.exports = {
  createLineGroupRepository,
};
