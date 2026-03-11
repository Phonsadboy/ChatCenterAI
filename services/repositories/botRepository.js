const { isPostgresConfigured, query } = require("../../infra/postgres");
const { deletePostgresBotByLegacyId, upsertPostgresBotDocument } = require("./postgresBotSync");
const {
  applyProjection,
  buildMongoIdQuery,
  escapeRegex,
  getBotCollectionName,
  normalizePlatform,
  safeStringify,
  toLegacyId,
  toObjectId,
} = require("./shared");

function createBotRepository({
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
    return Boolean(
      runtimeConfig?.features?.postgresReadPrimaryBots && canUsePostgres(),
    );
  }

  async function getCollection(platform) {
    const client = await connectDB();
    return client.db(dbName).collection(getBotCollectionName(platform));
  }

  function buildLookupQuery(platform, identifier) {
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedIdentifier = String(identifier || "").trim();
    if (!normalizedIdentifier) return null;

    if (normalizedPlatform === "facebook") {
      return buildMongoIdQuery(normalizedIdentifier);
    }

    const queryConditions = [
      {
        webhookUrl: {
          $regex: `${escapeRegex(normalizedIdentifier)}$`,
          $options: "i",
        },
      },
    ];

    const idQuery = buildMongoIdQuery(normalizedIdentifier);
    if (idQuery && idQuery._id) {
      queryConditions.push(idQuery);
    }

    return { $or: queryConditions };
  }

  function hydratePostgresBot(row) {
    if (!row) return null;
    const config = row.config || {};
    const secrets = row.secrets || {};
    const selectedInstructions = Array.isArray(row.selected_instructions)
      ? row.selected_instructions
      : Array.isArray(config.selectedInstructions)
        ? config.selectedInstructions
        : [];
    const selectedImageCollections = Array.isArray(row.selected_image_collections)
      ? row.selected_image_collections
      : Array.isArray(config.selectedImageCollections)
        ? config.selectedImageCollections
        : [];

    return {
      ...config,
      ...secrets,
      _id: row.legacy_bot_id,
      pgBotId: row.pg_bot_id,
      platform: row.platform,
      name: row.name || config.name || config.pageName || null,
      status: row.status || config.status || "active",
      aiModel: row.ai_model || config.aiModel || null,
      aiConfig: row.ai_config || config.aiConfig || {},
      keywordSettings: row.keyword_settings || config.keywordSettings || {},
      selectedInstructions,
      selectedImageCollections,
      createdAt: row.created_at || config.createdAt || null,
      updatedAt: row.updated_at || config.updatedAt || null,
    };
  }

  function getValueByPath(doc, path) {
    if (!doc || typeof doc !== "object" || !path) return undefined;
    return String(path)
      .split(".")
      .reduce((value, key) => {
        if (value === null || typeof value === "undefined") return undefined;
        return value[key];
      }, doc);
  }

  function valuesEqual(left, right) {
    if (left === right) return true;
    return safeStringify(left) === safeStringify(right);
  }

  function matchesFilter(doc, filter) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      return true;
    }

    return Object.entries(filter).every(([key, expected]) => {
      if (key === "$or") {
        return Array.isArray(expected)
          && expected.some((entry) => matchesFilter(doc, entry));
      }
      if (key === "$and") {
        return Array.isArray(expected)
          && expected.every((entry) => matchesFilter(doc, entry));
      }

      const actual = key === "_id" ? toLegacyId(doc?._id) : getValueByPath(doc, key);

      if (expected && typeof expected === "object" && !Array.isArray(expected)) {
        if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
          const values = Array.isArray(expected.$in) ? expected.$in : [];
          return values.some((value) =>
            key === "_id"
              ? valuesEqual(actual, toLegacyId(value))
              : valuesEqual(actual, value),
          );
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$ne")) {
          return key === "_id"
            ? !valuesEqual(actual, toLegacyId(expected.$ne))
            : !valuesEqual(actual, expected.$ne);
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$exists")) {
          const exists = actual !== null && typeof actual !== "undefined";
          return Boolean(expected.$exists) === exists;
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$regex")) {
          const pattern = expected.$regex;
          const flags = expected.$options || "";
          const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, flags);
          return regex.test(String(actual || ""));
        }
      }

      return key === "_id"
        ? valuesEqual(actual, toLegacyId(expected))
        : valuesEqual(actual, expected);
    });
  }

  function compareValues(left, right) {
    if (left === right) return 0;
    if (left === null || typeof left === "undefined") return -1;
    if (right === null || typeof right === "undefined") return 1;

    const leftTime = left instanceof Date ? left.getTime() : null;
    const rightTime = right instanceof Date ? right.getTime() : null;
    if (leftTime !== null || rightTime !== null) {
      return Number(leftTime || 0) - Number(rightTime || 0);
    }

    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }

    return String(left).localeCompare(String(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function applyListOptions(docs, options = {}) {
    const filter =
      options.filter && typeof options.filter === "object" ? options.filter : null;
    const projection =
      options.projection && typeof options.projection === "object"
        ? options.projection
        : null;
    const sort =
      options.sort && typeof options.sort === "object" ? options.sort : null;

    let results = Array.isArray(docs) ? [...docs] : [];
    if (filter) {
      results = results.filter((doc) => matchesFilter(doc, filter));
    }
    if (sort) {
      const sortEntries = Object.entries(sort);
      results.sort((left, right) => {
        for (const [field, direction] of sortEntries) {
          const comparison = compareValues(
            getValueByPath(left, field),
            getValueByPath(right, field),
          );
          if (comparison !== 0) {
            return comparison * (Number(direction) >= 0 ? 1 : -1);
          }
        }
        return 0;
      });
    }
    if (projection) {
      results = results.map((doc) => applyProjection(doc, projection));
    }
    if (Number.isFinite(options.limit) && options.limit > 0) {
      results = results.slice(0, options.limit);
    }
    return results;
  }

  async function readPostgresAll(platform) {
    const normalizedPlatform = normalizePlatform(platform);
    const result = await query(
      `
        SELECT
          b.id AS pg_bot_id,
          b.platform,
          b.legacy_bot_id,
          b.name,
          b.status,
          b.ai_model,
          b.ai_config,
          b.keyword_settings,
          b.selected_instructions,
          b.selected_image_collections,
          b.config,
          b.created_at,
          b.updated_at,
          s.secrets
        FROM bots b
        LEFT JOIN bot_secrets s ON s.bot_id = b.id
        WHERE b.platform = $1
      `,
      [normalizedPlatform],
    );

    return result.rows.map((row) => hydratePostgresBot(row));
  }

  async function readPostgresByLegacyId(platform, botId) {
    const normalizedPlatform = normalizePlatform(platform);
    const legacyBotId = toLegacyId(botId);
    if (!legacyBotId) return null;

    const result = await query(
      `
        SELECT
          b.id AS pg_bot_id,
          b.platform,
          b.legacy_bot_id,
          b.name,
          b.status,
          b.ai_model,
          b.ai_config,
          b.keyword_settings,
          b.selected_instructions,
          b.selected_image_collections,
          b.config,
          b.created_at,
          b.updated_at,
          s.secrets
        FROM bots b
        LEFT JOIN bot_secrets s ON s.bot_id = b.id
        WHERE b.platform = $1 AND b.legacy_bot_id = $2
        LIMIT 1
      `,
      [normalizedPlatform, legacyBotId],
    );

    return hydratePostgresBot(result.rows[0]);
  }

  async function readPostgresByIdentifier(platform, identifier) {
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedIdentifier = String(identifier || "").trim();
    if (!normalizedIdentifier) return null;

    const result = await query(
      `
        SELECT
          b.id AS pg_bot_id,
          b.platform,
          b.legacy_bot_id,
          b.name,
          b.status,
          b.ai_model,
          b.ai_config,
          b.keyword_settings,
          b.selected_instructions,
          b.selected_image_collections,
          b.config,
          b.created_at,
          b.updated_at,
          s.secrets
        FROM bots b
        LEFT JOIN bot_secrets s ON s.bot_id = b.id
        WHERE b.platform = $1
          AND (
            b.legacy_bot_id = $2
            OR COALESCE(b.config->>'webhookUrl', '') ~* $3
          )
        LIMIT 1
      `,
      [normalizedPlatform, normalizedIdentifier, `${escapeRegex(normalizedIdentifier)}$`],
    );

    return hydratePostgresBot(result.rows[0]);
  }

  function startShadowCompare(platform, identifier, mongoDoc, pgDoc) {
    if (!shouldShadowRead()) return;
    const comparableMongo = mongoDoc
      ? {
        status: mongoDoc.status || "active",
        aiModel: mongoDoc.aiModel || null,
        webhookUrl: mongoDoc.webhookUrl || null,
        selectedInstructions: Array.isArray(mongoDoc.selectedInstructions)
          ? mongoDoc.selectedInstructions
          : [],
        selectedImageCollections: Array.isArray(mongoDoc.selectedImageCollections)
          ? mongoDoc.selectedImageCollections
          : [],
      }
      : null;
    const comparablePg = pgDoc
      ? {
        status: pgDoc.status || "active",
        aiModel: pgDoc.aiModel || null,
        webhookUrl: pgDoc.webhookUrl || null,
        selectedInstructions: Array.isArray(pgDoc.selectedInstructions)
          ? pgDoc.selectedInstructions
          : [],
        selectedImageCollections: Array.isArray(pgDoc.selectedImageCollections)
          ? pgDoc.selectedImageCollections
          : [],
      }
      : null;

    if (safeStringify(comparableMongo) !== safeStringify(comparablePg)) {
      console.warn(
        `[BotRepository] Shadow read mismatch for ${platform}:${identifier}`,
      );
    }
  }

  async function syncDocumentToPostgres(platform, mongoDoc) {
    if (!mongoDoc || !shouldDualWrite()) return null;
    return upsertPostgresBotDocument({ query }, platform, mongoDoc);
  }

  async function syncDocumentById(platform, botId) {
    const coll = await getCollection(platform);
    const mongoDoc = await coll.findOne(buildMongoIdQuery(botId));
    if (!mongoDoc) return null;
    await syncDocumentToPostgres(platform, mongoDoc).catch((error) => {
      console.warn(
        `[BotRepository] Sync failed for ${platform}:${botId}:`,
        error?.message || error,
      );
    });
    return mongoDoc;
  }

  async function list(platform, options = {}) {
    if (shouldReadPrimary()) {
      try {
        const pgDocs = await readPostgresAll(platform);
        if (pgDocs.length > 0) {
          return applyListOptions(pgDocs, options);
        }
      } catch (error) {
        console.warn(
          `[BotRepository] Primary list read failed for ${platform}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const coll = await getCollection(platform);
    const filter =
      options.filter && typeof options.filter === "object" ? options.filter : {};
    const findOptions = {};
    if (options.projection && typeof options.projection === "object") {
      findOptions.projection = options.projection;
    }
    let cursor = coll.find(filter, findOptions);
    if (options.sort && typeof options.sort === "object") {
      cursor = cursor.sort(options.sort);
    }
    if (Number.isFinite(options.limit) && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }
    const docs = await cursor.toArray();

    if (shouldDualWrite()) {
      await Promise.all(
        docs.map((doc) =>
          syncDocumentToPostgres(platform, doc).catch((error) => {
            console.warn(
              `[BotRepository] Dual-write sync failed for ${platform}:${toLegacyId(doc?._id)}:`,
              error?.message || error,
            );
          }),
        ),
      );
    }

    return docs;
  }

  async function insertOne(platform, document) {
    const coll = await getCollection(platform);
    const result = await coll.insertOne(document);
    const savedDoc = { ...document, _id: result.insertedId };
    if (shouldDualWrite()) {
      await syncDocumentToPostgres(platform, savedDoc).catch((error) => {
        console.warn(
          `[BotRepository] Insert dual-write failed for ${platform}:${toLegacyId(result.insertedId)}:`,
          error?.message || error,
        );
      });
    }
    return savedDoc;
  }

  function normalizeUpdateDocument(update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      return { $set: {} };
    }
    const hasOperator = Object.keys(update).some((key) => key.startsWith("$"));
    return hasOperator ? update : { $set: update };
  }

  async function updateById(platform, botId, update, options = {}) {
    const coll = await getCollection(platform);
    const normalizedUpdate = normalizeUpdateDocument(update);
    const filter = buildMongoIdQuery(botId);
    const result = await coll.updateOne(filter, normalizedUpdate, options);
    if (result.matchedCount === 0) {
      return { matchedCount: 0, modifiedCount: 0, document: null };
    }

    const updatedDoc = await coll.findOne(filter);
    if (updatedDoc && shouldDualWrite()) {
      await syncDocumentToPostgres(platform, updatedDoc).catch((error) => {
        console.warn(
          `[BotRepository] Update dual-write failed for ${platform}:${botId}:`,
          error?.message || error,
        );
      });
    }

    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      document: updatedDoc,
    };
  }

  async function clearDefaultFlag(platform, excludeBotId = null) {
    const coll = await getCollection(platform);
    const filter = { isDefault: true };
    const objectId = toObjectId(excludeBotId);
    const legacyId = toLegacyId(excludeBotId);
    if (excludeBotId) {
      filter._id = { $ne: objectId || legacyId };
    }

    const affectedIds = await coll
      .find(filter, { projection: { _id: 1 } })
      .toArray();

    if (affectedIds.length === 0) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    const result = await coll.updateMany(
      filter,
      { $set: { isDefault: false, updatedAt: new Date() } },
    );

    if (shouldDualWrite()) {
      await Promise.all(
        affectedIds.map((doc) =>
          syncDocumentById(platform, doc?._id).catch((error) => {
            console.warn(
              `[BotRepository] Default reset dual-write failed for ${platform}:${toLegacyId(doc?._id)}:`,
              error?.message || error,
            );
          }),
        ),
      );
    }

    return result;
  }

  async function findById(platform, botId, options = {}) {
    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPostgresByLegacyId(platform, botId);
        if (pgDoc) {
          return options.projection ? applyProjection(pgDoc, options.projection) : pgDoc;
        }
      } catch (error) {
        console.warn(
          `[BotRepository] Primary read failed for ${platform}:${botId}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const coll = await getCollection(platform);
    const mongoDoc = await coll.findOne(buildMongoIdQuery(botId), options);
    if (mongoDoc && shouldDualWrite()) {
      await syncDocumentToPostgres(platform, mongoDoc).catch((error) => {
        console.warn(
          `[BotRepository] Dual-write sync failed for ${platform}:${botId}:`,
          error?.message || error,
        );
      });
    }

    if (shouldShadowRead()) {
      void readPostgresByLegacyId(platform, botId)
        .then((pgDoc) => startShadowCompare(platform, botId, mongoDoc, pgDoc))
        .catch((error) => {
          console.warn(
            `[BotRepository] Shadow read failed for ${platform}:${botId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function findByIdentifier(platform, identifier, options = {}) {
    if (shouldReadPrimary()) {
      try {
        const pgDoc = await readPostgresByIdentifier(platform, identifier);
        if (pgDoc) {
          return options.projection ? applyProjection(pgDoc, options.projection) : pgDoc;
        }
      } catch (error) {
        console.warn(
          `[BotRepository] Primary identifier read failed for ${platform}:${identifier}, falling back to Mongo:`,
          error?.message || error,
        );
      }
    }

    const queryObject = buildLookupQuery(platform, identifier);
    if (!queryObject) return null;

    const coll = await getCollection(platform);
    const mongoDoc = await coll.findOne(queryObject, options);
    if (mongoDoc && shouldDualWrite()) {
      await syncDocumentToPostgres(platform, mongoDoc).catch((error) => {
        console.warn(
          `[BotRepository] Dual-write sync failed for ${platform}:${identifier}:`,
          error?.message || error,
        );
      });
    }

    if (shouldShadowRead()) {
      void readPostgresByIdentifier(platform, identifier)
        .then((pgDoc) => startShadowCompare(platform, identifier, mongoDoc, pgDoc))
        .catch((error) => {
          console.warn(
            `[BotRepository] Shadow read failed for ${platform}:${identifier}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function getRuntimeSnapshot(platform, botId) {
    const bot = await findById(platform, botId, {
      projection: {
        selectedInstructions: 1,
        selectedImageCollections: 1,
        aiConfig: 1,
        openaiApiKeyId: 1,
      },
    });
    if (!bot) return null;

    return {
      selectedInstructions: Array.isArray(bot.selectedInstructions)
        ? bot.selectedInstructions
        : [],
      selectedImageCollections: Array.isArray(bot.selectedImageCollections)
        ? bot.selectedImageCollections
        : [],
      aiConfig: bot.aiConfig && typeof bot.aiConfig === "object" ? bot.aiConfig : {},
      openaiApiKeyId: bot.openaiApiKeyId || null,
    };
  }

  async function deleteById(platform, botId) {
    const coll = await getCollection(platform);
    const result = await coll.deleteOne(buildMongoIdQuery(botId));
    if (result.deletedCount > 0 && shouldDualWrite()) {
      await deletePostgresBotByLegacyId({ query }, platform, botId).catch((error) => {
        console.warn(
          `[BotRepository] Delete dual-write failed for ${platform}:${botId}:`,
          error?.message || error,
        );
      });
    }
    return result;
  }

  async function syncById(platform, botId) {
    const bot = await findById(platform, botId);
    if (!bot) return null;
    if (!shouldDualWrite()) return bot;
    return syncDocumentById(platform, botId);
  }

  return {
    clearDefaultFlag,
    deleteById,
    findById,
    findByIdentifier,
    getRuntimeSnapshot,
    insertOne,
    list,
    syncById,
    updateById,
  };
}

module.exports = {
  createBotRepository,
};
