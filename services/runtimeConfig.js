"use strict";

function parseBooleanEnv(rawValue, fallback = false) {
  if (typeof rawValue !== "string") return fallback;
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseIntEnv(rawValue, fallback) {
  const parsed = Number.parseInt(rawValue || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEnum(rawValue, allowedValues, fallback) {
  if (typeof rawValue !== "string") return fallback;
  const normalized = rawValue.trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function readFirstString(env, candidates = []) {
  for (const key of candidates) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildRuntimeConfig(env = process.env) {
  const chatStorageMode = normalizeEnum(
    env.CHAT_STORAGE_MODE || env.DATA_MODE,
    ["postgres"],
    "postgres",
  );

  const appDocumentMode = normalizeEnum(
    env.APP_DOCUMENT_MODE || env.DATA_MODE,
    ["postgres"],
    "postgres",
  );

  const sessionStoreMode = normalizeEnum(
    env.SESSION_STORE_MODE,
    ["auto", "postgres", "memory"],
    "postgres",
  );

  const postgresConnectionString = readFirstString(env, [
    "DATABASE_URL",
    "DATABASE_PUBLIC_URL",
    "POSTGRES_URL",
    "POSTGRES_PUBLIC_URL",
    "PGDATABASE_URL",
  ]);

  const bucketName = readFirstString(env, [
    "BUCKET_NAME",
    "S3_BUCKET_NAME",
    "AWS_BUCKET_NAME",
  ]);

  return {
    appDocumentMode,
    chatStorageMode,
    sessionStoreMode,
    postgresNativeReadsEnabled: parseBooleanEnv(
      env.POSTGRES_NATIVE_READS,
      false,
    ),
    chatHotRetentionDays: Math.max(
      1,
      parseIntEnv(env.CHAT_HOT_RETENTION_DAYS, 60),
    ),
    chatHistoryLimit: Math.max(1, parseIntEnv(env.CHAT_HISTORY_LIMIT, 200)),
    chatArchiveEnabled: parseBooleanEnv(
      env.CHAT_ARCHIVE_EXPORT_ENABLED,
      true,
    ),
    postgres: {
      connectionString: postgresConnectionString,
      ssl: parseBooleanEnv(env.DATABASE_SSL, false),
      applicationName:
        readFirstString(env, ["POSTGRES_APP_NAME"]) || "chatcenter-ai",
      statementTimeoutMs: Math.max(
        0,
        parseIntEnv(env.POSTGRES_STATEMENT_TIMEOUT_MS, 30000),
      ),
      idleTimeoutMs: Math.max(
        1000,
        parseIntEnv(env.POSTGRES_IDLE_TIMEOUT_MS, 10000),
      ),
      connectionTimeoutMs: Math.max(
        1000,
        parseIntEnv(env.POSTGRES_CONNECTION_TIMEOUT_MS, 10000),
      ),
      maxPoolSize: Math.max(1, parseIntEnv(env.POSTGRES_MAX_POOL_SIZE, 20)),
    },
    redis: {
      url: readFirstString(env, ["REDIS_URL", "VALKEY_URL"]),
      keyPrefix:
        readFirstString(env, ["REDIS_KEY_PREFIX"]) || "chatcenter-ai",
      adminCacheTtlSeconds: Math.max(
        0,
        parseIntEnv(env.ADMIN_CACHE_TTL_SECONDS, 45),
      ),
    },
    bucket: {
      bucketName,
      endpoint: readFirstString(env, [
        "BUCKET_ENDPOINT",
        "S3_ENDPOINT",
        "AWS_ENDPOINT_URL_S3",
        "AWS_ENDPOINT_URL",
      ]),
      region: readFirstString(env, [
        "BUCKET_REGION",
        "AWS_REGION",
        "AWS_DEFAULT_REGION",
      ]) || "auto",
      accessKeyId: readFirstString(env, [
        "BUCKET_ACCESS_KEY_ID",
        "AWS_ACCESS_KEY_ID",
      ]),
      secretAccessKey: readFirstString(env, [
        "BUCKET_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
      ]),
      forcePathStyle: parseBooleanEnv(env.BUCKET_FORCE_PATH_STYLE, true),
      keyPrefix: readFirstString(env, ["BUCKET_KEY_PREFIX", "S3_KEY_PREFIX"]),
    },
  };
}

module.exports = {
  buildRuntimeConfig,
  normalizeEnum,
  parseBooleanEnv,
  parseIntEnv,
  readFirstString,
};
