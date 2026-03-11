const os = require("os");

const VALID_RUNTIME_MODES = new Set([
  "legacy",
  "admin-app",
  "public-ingest",
  "worker-realtime",
  "worker-batch",
  "migration-runner",
]);

function parseBoolean(value, defaultValue = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseInteger(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function resolveRuntimeMode() {
  const requested = String(process.env.CCAI_RUNTIME_MODE || "legacy").trim();
  return VALID_RUNTIME_MODES.has(requested) ? requested : "legacy";
}

function resolveRedisUrl() {
  return (
    process.env.REDIS_URL ||
    process.env.REDIS_PUBLIC_URL ||
    process.env.REDIS_PRIVATE_URL ||
    process.env.RAILWAY_REDIS_URL ||
    ""
  ).trim();
}

function resolvePostgresConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.PG_URL ||
    process.env.PG_CONNECTION_STRING ||
    ""
  ).trim();
}

function getRuntimeConfig() {
  const runtimeMode = resolveRuntimeMode();
  const redisUrl = resolveRedisUrl();
  const postgresConnectionString = resolvePostgresConnectionString();
  const runtimeId =
    process.env.CCAI_RUNTIME_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    `${os.hostname()}:${process.pid}`;

  return {
    runtimeMode,
    runtimeId,
    mongoDatabaseName: (process.env.MONGO_DB_NAME || "chatbot").trim() || "chatbot",
    redisUrl,
    postgresConnectionString,
    features: {
      redisInfra: parseBoolean(
        process.env.CCAI_USE_REDIS_INFRA,
        Boolean(redisUrl),
      ),
      redisSessions: parseBoolean(
        process.env.CCAI_SESSION_STORE_REDIS,
        Boolean(redisUrl),
      ),
      redisQueue: parseBoolean(
        process.env.CCAI_QUEUE_BACKEND_REDIS,
        Boolean(redisUrl),
      ),
      redisDedupe: parseBoolean(
        process.env.CCAI_DEDUPE_STORE_REDIS,
        Boolean(redisUrl),
      ),
      runtimeRouteGuards: parseBoolean(
        process.env.CCAI_RUNTIME_ROUTE_GUARDS,
        runtimeMode !== "legacy",
      ),
      postgresEnabled: parseBoolean(
        process.env.CCAI_POSTGRES_ENABLED,
        Boolean(postgresConnectionString),
      ),
      postgresAutoMigrateOnBoot: parseBoolean(
        process.env.CCAI_RUN_POSTGRES_MIGRATIONS_ON_BOOT,
        Boolean(postgresConnectionString),
      ),
      postgresDualWrite: parseBoolean(
        process.env.CCAI_PG_DUAL_WRITE,
        false,
      ),
      postgresShadowRead: parseBoolean(
        process.env.CCAI_PG_SHADOW_READ,
        false,
      ),
      postgresReadPrimarySettings: parseBoolean(
        process.env.CCAI_PG_PRIMARY_READ_SETTINGS,
        false,
      ),
      postgresReadPrimaryBots: parseBoolean(
        process.env.CCAI_PG_PRIMARY_READ_BOTS,
        false,
      ),
      postgresReadPrimaryOrders: parseBoolean(
        process.env.CCAI_PG_PRIMARY_READ_ORDERS,
        false,
      ),
      postgresReadPrimaryChat: parseBoolean(
        process.env.CCAI_PG_PRIMARY_READ_CHAT,
        false,
      ),
      postgresReadPrimaryFollowUp: parseBoolean(
        process.env.CCAI_PG_PRIMARY_READ_FOLLOWUP,
        false,
      ),
      postgresReadPrimaryNotifications: parseBoolean(
        process.env.CCAI_PG_PRIMARY_READ_NOTIFICATIONS,
        false,
      ),
      legacyBackgroundJobs: parseBoolean(
        process.env.CCAI_ENABLE_LEGACY_BACKGROUND_JOBS,
        runtimeMode === "legacy",
      ),
    },
    queues: {
      realtimeConcurrency: parseInteger(
        process.env.CCAI_WORKER_REALTIME_CONCURRENCY,
        10,
      ),
      batchConcurrency: parseInteger(
        process.env.CCAI_WORKER_BATCH_CONCURRENCY,
        2,
      ),
      defaultRemoveOnComplete: parseInteger(
        process.env.CCAI_QUEUE_REMOVE_ON_COMPLETE,
        1000,
      ),
      defaultRemoveOnFail: parseInteger(
        process.env.CCAI_QUEUE_REMOVE_ON_FAIL,
        5000,
      ),
      flushKeyTtlMs: parseInteger(
        process.env.CCAI_QUEUE_FLUSH_KEY_TTL_MS,
        120000,
      ),
      conversationFlushAttempts: parseInteger(
        process.env.CCAI_QUEUE_CONVERSATION_FLUSH_ATTEMPTS,
        8,
      ),
      conversationFlushBackoffMs: parseInteger(
        process.env.CCAI_QUEUE_CONVERSATION_FLUSH_BACKOFF_MS,
        250,
      ),
      conversationLockTtlMs: parseInteger(
        process.env.CCAI_QUEUE_CONVERSATION_LOCK_TTL_MS,
        120000,
      ),
      conversationLockWaitTimeoutMs: parseInteger(
        process.env.CCAI_QUEUE_CONVERSATION_LOCK_WAIT_TIMEOUT_MS,
        10000,
      ),
      conversationLockPollMs: parseInteger(
        process.env.CCAI_QUEUE_CONVERSATION_LOCK_POLL_MS,
        120,
      ),
      conversationLockRetryDelayMs: parseInteger(
        process.env.CCAI_QUEUE_CONVERSATION_LOCK_RETRY_DELAY_MS,
        250,
      ),
      conversationLockRetryAttempts: parseInteger(
        process.env.CCAI_QUEUE_CONVERSATION_LOCK_RETRY_ATTEMPTS,
        20,
      ),
    },
    storage: {
      bucketName: (process.env.STORAGE_BUCKET_NAME || "").trim(),
      endpoint: (process.env.STORAGE_S3_ENDPOINT || "").trim(),
      region: (process.env.STORAGE_REGION || "ap-southeast-1").trim(),
      accessKeyId: (process.env.STORAGE_ACCESS_KEY_ID || "").trim(),
      secretAccessKey: (process.env.STORAGE_SECRET_ACCESS_KEY || "").trim(),
      forcePathStyle: parseBoolean(
        process.env.STORAGE_FORCE_PATH_STYLE,
        true,
      ),
    },
  };
}

module.exports = {
  VALID_RUNTIME_MODES,
  getRuntimeConfig,
  parseBoolean,
  parseInteger,
  resolveRedisUrl,
  resolvePostgresConnectionString,
};
