const crypto = require("crypto");

const BOT_COLLECTION_BY_PLATFORM = {
  line: "line_bots",
  facebook: "facebook_bots",
  instagram: "instagram_bots",
  whatsapp: "whatsapp_bots",
};
const primaryReadWarningTimestamps = new Map();
const PRIMARY_READ_WARNING_TTL_MS = 30_000;
const MAX_PRIMARY_WARNING_KEYS = 5000;

function normalizePlatform(platform, fallback = "line") {
  if (typeof platform !== "string") return fallback;
  const normalized = platform.trim().toLowerCase();
  return BOT_COLLECTION_BY_PLATFORM[normalized] ? normalized : fallback;
}

function getBotCollectionName(platform, fallbackCollection = "line_bots") {
  const normalized = normalizePlatform(platform);
  return BOT_COLLECTION_BY_PLATFORM[normalized] || fallbackCollection;
}

function isMongoObjectIdLike(id) {
  if (typeof id !== "string") return false;
  return /^[0-9a-f]{24}$/i.test(id.trim());
}

function toObjectId(id) {
  const legacyId = toLegacyId(id);
  if (!legacyId || !isMongoObjectIdLike(legacyId)) return null;
  return legacyId;
}

function buildMongoIdQuery(id) {
  const legacyId = toLegacyId(id);
  return { _id: toObjectId(legacyId) || legacyId || null };
}

function toLegacyId(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value.trim();
  if (value && typeof value.toString === "function") {
    return value.toString().trim();
  }
  return String(value).trim();
}

function generateLegacyObjectIdString() {
  return crypto.randomBytes(12).toString("hex");
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

function warnPrimaryReadFailure({
  repository,
  operation,
  identifier = "",
  canUseMongo = true,
  error,
}) {
  const repositoryName = String(repository || "Repository").trim() || "Repository";
  const operationName = String(operation || "read").trim() || "read";
  const target = String(identifier || "").trim();
  const errorMessage = error?.message || String(error || "unknown error");
  const warningKey = `${repositoryName}:${operationName}:${target}:${errorMessage}`;
  const now = Date.now();
  const previous = primaryReadWarningTimestamps.get(warningKey);
  if (previous && now - previous < PRIMARY_READ_WARNING_TTL_MS) {
    return;
  }
  primaryReadWarningTimestamps.set(warningKey, now);
  if (primaryReadWarningTimestamps.size > MAX_PRIMARY_WARNING_KEYS) {
    primaryReadWarningTimestamps.clear();
  }

  const targetSuffix = target ? ` for ${target}` : "";
  if (canUseMongo) {
    console.warn(
      `[${repositoryName}] Primary ${operationName} failed${targetSuffix}, falling back to Mongo:`,
      errorMessage,
    );
    return;
  }

  console.warn(
    `[${repositoryName}] Primary ${operationName} failed${targetSuffix}; Mongo fallback disabled:`,
    errorMessage,
  );
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
  generateLegacyObjectIdString,
  getBotCollectionName,
  isMongoObjectIdLike,
  normalizeJson,
  normalizePlatform,
  safeStringify,
  toLegacyId,
  toObjectId,
  toText,
  warnPrimaryReadFailure,
};
