const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  deletePostgresBotByLegacyId,
  upsertPostgresBotDocument,
} = require("./postgresBotSync");
const {
  applyProjection,
  escapeRegex,
  generateLegacyObjectIdString,
  normalizePlatform,
  safeStringify,
  toLegacyId,
} = require("./shared");

function createBotRepository({ runtimeConfig }) {
  const cachedBotsById = new Map();
  const cachedBotsByPlatform = new Map();

  function isStorageReady() {
    return Boolean(
      runtimeConfig?.features?.postgresEnabled && isPostgresConfigured(),
    );
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
        return (
          Array.isArray(expected)
          && expected.some((entry) => matchesFilter(doc, entry))
        );
      }
      if (key === "$and") {
        return (
          Array.isArray(expected)
          && expected.every((entry) => matchesFilter(doc, entry))
        );
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
          const regex =
            pattern instanceof RegExp ? pattern : new RegExp(pattern, flags);
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

  function cacheBot(doc) {
    const normalizedPlatform = normalizePlatform(doc?.platform);
    const legacyId = toLegacyId(doc?._id);
    if (!normalizedPlatform || !legacyId) return;

    cachedBotsById.set(`${normalizedPlatform}:${legacyId}`, doc);
    const current = cachedBotsByPlatform.get(normalizedPlatform) || [];
    cachedBotsByPlatform.set(
      normalizedPlatform,
      [doc, ...current.filter((entry) => toLegacyId(entry?._id) !== legacyId)],
    );
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

    const docs = result.rows.map((row) => hydratePostgresBot(row));
    cachedBotsByPlatform.set(normalizedPlatform, docs);
    docs.forEach((doc) => cacheBot(doc));
    return docs;
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

    const doc = hydratePostgresBot(result.rows[0]);
    if (doc) {
      cacheBot(doc);
    }
    return doc;
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
      [
        normalizedPlatform,
        normalizedIdentifier,
        `${escapeRegex(normalizedIdentifier)}$`,
      ],
    );

    const doc = hydratePostgresBot(result.rows[0]);
    if (doc) {
      cacheBot(doc);
    }
    return doc;
  }

  function readCachedBotById(platform, botId) {
    const normalizedPlatform = normalizePlatform(platform);
    const legacyId = toLegacyId(botId);
    if (!legacyId) return null;
    return cachedBotsById.get(`${normalizedPlatform}:${legacyId}`) || null;
  }

  function readCachedBots(platform) {
    return cachedBotsByPlatform.get(normalizePlatform(platform)) || [];
  }

  function readCachedBotByIdentifier(platform, identifier) {
    const normalizedPlatform = normalizePlatform(platform);
    const normalizedIdentifier = String(identifier || "").trim();
    if (!normalizedIdentifier) return null;

    const byId = readCachedBotById(normalizedPlatform, normalizedIdentifier);
    if (byId) return byId;

    const lookupRegex =
      normalizedPlatform === "facebook"
        ? null
        : new RegExp(`${escapeRegex(normalizedIdentifier)}$`, "i");
    return (
      readCachedBots(normalizedPlatform).find((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (
          normalizedPlatform === "facebook"
          && toLegacyId(entry?._id) === normalizedIdentifier
        ) {
          return true;
        }
        const webhookUrl =
          typeof entry.webhookUrl === "string" ? entry.webhookUrl.trim() : "";
        return Boolean(lookupRegex && webhookUrl && lookupRegex.test(webhookUrl));
      }) || null
    );
  }

  function normalizeUpdateDocument(update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      return { $set: {} };
    }
    const hasOperator = Object.keys(update).some((key) => key.startsWith("$"));
    return hasOperator ? update : { $set: update };
  }

  function applyDocumentUpdate(target, normalizedUpdate) {
    const next = target && typeof target === "object" ? { ...target } : {};
    const applyPath = (object, path, value, remove = false) => {
      const parts = String(path || "")
        .split(".")
        .filter(Boolean);
      if (parts.length === 0) return;
      let cursor = object;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];
        if (
          !cursor[part]
          || typeof cursor[part] !== "object"
          || Array.isArray(cursor[part])
        ) {
          cursor[part] = {};
        }
        cursor = cursor[part];
      }
      const leaf = parts[parts.length - 1];
      if (remove) {
        delete cursor[leaf];
      } else {
        cursor[leaf] = value;
      }
    };

    if (normalizedUpdate.$set && typeof normalizedUpdate.$set === "object") {
      Object.entries(normalizedUpdate.$set).forEach(([key, value]) =>
        applyPath(next, key, value));
    }
    if (normalizedUpdate.$unset && typeof normalizedUpdate.$unset === "object") {
      Object.keys(normalizedUpdate.$unset).forEach((key) =>
        applyPath(next, key, undefined, true));
    }
    if (normalizedUpdate.$inc && typeof normalizedUpdate.$inc === "object") {
      Object.entries(normalizedUpdate.$inc).forEach(([key, value]) => {
        const current = Number(getValueByPath(next, key) || 0);
        const delta = Number(value || 0);
        applyPath(next, key, current + delta);
      });
    }
    if (normalizedUpdate.$push && typeof normalizedUpdate.$push === "object") {
      Object.entries(normalizedUpdate.$push).forEach(([key, value]) => {
        const current = getValueByPath(next, key);
        const currentArray = Array.isArray(current) ? [...current] : [];
        if (value && typeof value === "object" && Array.isArray(value.$each)) {
          currentArray.push(...value.$each);
        } else {
          currentArray.push(value);
        }
        applyPath(next, key, currentArray);
      });
    }
    return next;
  }

  async function list(platform, options = {}) {
    try {
      if (!isStorageReady()) {
        return applyListOptions(readCachedBots(platform), options);
      }
      return applyListOptions(await readPostgresAll(platform), options);
    } catch (error) {
      console.warn(
        `[BotRepository] list failed for ${platform}:`,
        error?.message || error,
      );
      return applyListOptions(readCachedBots(platform), options);
    }
  }

  async function insertOne(platform, document) {
    if (!isStorageReady()) {
      throw new Error("bot_storage_not_configured");
    }

    const legacyId =
      toLegacyId(document?._id)
      || toLegacyId(document?.pageId)
      || toLegacyId(document?.phoneNumberId)
      || toLegacyId(document?.instagramBusinessAccountId)
      || generateLegacyObjectIdString();
    const now = new Date();
    const pgDoc = {
      ...document,
      _id: legacyId,
      createdAt: document?.createdAt || now,
      updatedAt: document?.updatedAt || now,
    };

    await upsertPostgresBotDocument({ query }, platform, pgDoc);
    const saved = await readPostgresByLegacyId(platform, legacyId);
    return saved || pgDoc;
  }

  async function updateById(platform, botId, update) {
    if (!isStorageReady()) {
      throw new Error("bot_storage_not_configured");
    }

    const existingDoc = await readPostgresByLegacyId(platform, botId);
    if (!existingDoc) {
      return { matchedCount: 0, modifiedCount: 0, document: null };
    }

    const updatedDoc = applyDocumentUpdate(
      existingDoc,
      normalizeUpdateDocument(update),
    );
    updatedDoc._id = toLegacyId(existingDoc._id) || toLegacyId(botId);
    updatedDoc.updatedAt = new Date();

    await upsertPostgresBotDocument({ query }, platform, updatedDoc);
    const savedDoc = await readPostgresByLegacyId(platform, updatedDoc._id);
    return {
      matchedCount: 1,
      modifiedCount: 1,
      document: savedDoc || updatedDoc,
    };
  }

  async function clearDefaultFlag(platform, excludeBotId = null) {
    if (!isStorageReady()) {
      throw new Error("bot_storage_not_configured");
    }

    const docs = await readPostgresAll(platform);
    const excluded = toLegacyId(excludeBotId);
    let modifiedCount = 0;
    for (const doc of docs) {
      const legacyId = toLegacyId(doc?._id);
      if (!legacyId || (excluded && legacyId === excluded)) continue;
      if (!doc.isDefault) continue;
      await upsertPostgresBotDocument({
        query,
      }, platform, {
        ...doc,
        _id: legacyId,
        isDefault: false,
        updatedAt: new Date(),
      });
      modifiedCount += 1;
    }
    return {
      acknowledged: true,
      matchedCount: modifiedCount,
      modifiedCount,
    };
  }

  async function findById(platform, botId, options = {}) {
    try {
      const doc = isStorageReady()
        ? await readPostgresByLegacyId(platform, botId)
        : readCachedBotById(platform, botId);
      return options.projection ? applyProjection(doc, options.projection) : doc;
    } catch (error) {
      console.warn(
        `[BotRepository] read failed for ${platform}:${botId}:`,
        error?.message || error,
      );
      const cachedDoc = readCachedBotById(platform, botId);
      return options.projection ? applyProjection(cachedDoc, options.projection) : cachedDoc;
    }
  }

  async function findByIdentifier(platform, identifier, options = {}) {
    try {
      const doc = isStorageReady()
        ? await readPostgresByIdentifier(platform, identifier)
        : readCachedBotByIdentifier(platform, identifier);
      return options.projection ? applyProjection(doc, options.projection) : doc;
    } catch (error) {
      console.warn(
        `[BotRepository] identifier read failed for ${platform}:${identifier}:`,
        error?.message || error,
      );
      const cachedDoc = readCachedBotByIdentifier(platform, identifier);
      return options.projection ? applyProjection(cachedDoc, options.projection) : cachedDoc;
    }
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
      aiConfig:
        bot.aiConfig && typeof bot.aiConfig === "object" ? bot.aiConfig : {},
      openaiApiKeyId: bot.openaiApiKeyId || null,
    };
  }

  async function deleteById(platform, botId) {
    const normalizedPlatform = normalizePlatform(platform);
    const legacyId = toLegacyId(botId);

    if (!isStorageReady()) {
      return { deletedCount: 0 };
    }

    const existingDoc = await readPostgresByLegacyId(platform, botId).catch(() => null);
    if (!existingDoc) {
      return { deletedCount: 0 };
    }

    await deletePostgresBotByLegacyId({ query }, platform, botId).catch((error) => {
      console.warn(
        `[BotRepository] Delete failed for ${platform}:${botId}:`,
        error?.message || error,
      );
    });

    if (legacyId) {
      cachedBotsById.delete(`${normalizedPlatform}:${legacyId}`);
      const current = cachedBotsByPlatform.get(normalizedPlatform) || [];
      cachedBotsByPlatform.set(
        normalizedPlatform,
        current.filter((doc) => toLegacyId(doc?._id) !== legacyId),
      );
    }
    return { deletedCount: 1 };
  }

  async function syncById(platform, botId) {
    return findById(platform, botId);
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
