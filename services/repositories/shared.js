const { ObjectId } = require("mongodb");

const BOT_COLLECTION_BY_PLATFORM = {
  line: "line_bots",
  facebook: "facebook_bots",
  instagram: "instagram_bots",
  whatsapp: "whatsapp_bots",
};

function normalizePlatform(platform, fallback = "line") {
  if (typeof platform !== "string") return fallback;
  const normalized = platform.trim().toLowerCase();
  return BOT_COLLECTION_BY_PLATFORM[normalized] ? normalized : fallback;
}

function getBotCollectionName(platform, fallbackCollection = "line_bots") {
  const normalized = normalizePlatform(platform);
  return BOT_COLLECTION_BY_PLATFORM[normalized] || fallbackCollection;
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(id);
  } catch (_) {
    return null;
  }
}

function buildMongoIdQuery(id) {
  const objectId = toObjectId(id);
  if (objectId) {
    return { _id: objectId };
  }
  return { _id: id };
}

function toLegacyId(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value.trim();
  if (value && typeof value.toString === "function") {
    return value.toString().trim();
  }
  return String(value).trim();
}

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeJson(value, fallback = {}) {
  if (value === null || typeof value === "undefined") return fallback;
  return value;
}

function toText(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch (_) {
    try {
      return JSON.stringify(String(value));
    } catch (__) {
      return String(value);
    }
  }
}

function applyProjection(document, projection) {
  if (!document || !projection || typeof projection !== "object") {
    return document;
  }

  const entries = Object.entries(projection).filter(
    ([key, value]) => key !== "_id" && value === 1,
  );

  if (entries.length === 0) {
    if (projection._id === 0) {
      const { _id, ...rest } = document;
      return rest;
    }
    return document;
  }

  const projected = {};
  for (const [key] of entries) {
    if (Object.prototype.hasOwnProperty.call(document, key)) {
      projected[key] = document[key];
    }
  }

  if (projection._id !== 0 && Object.prototype.hasOwnProperty.call(document, "_id")) {
    projected._id = document._id;
  }

  return projected;
}

module.exports = {
  BOT_COLLECTION_BY_PLATFORM,
  applyProjection,
  buildMongoIdQuery,
  escapeRegex,
  getBotCollectionName,
  normalizeJson,
  normalizePlatform,
  safeStringify,
  toLegacyId,
  toObjectId,
  toText,
};
