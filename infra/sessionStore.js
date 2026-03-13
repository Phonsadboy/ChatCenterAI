const session = require("express-session");
const { RedisStore } = require("connect-redis");
const { getRedis, isRedisConfigured } = require("./redis");
const { getRuntimeConfig } = require("./runtimeConfig");

function createSessionStore({ connectDB, dbName, collectionName, ttl }) {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.features.redisSessions && isRedisConfigured()) {
    return new RedisStore({
      client: getRedis(),
      prefix: "ccai:sess:",
      ttl,
    });
  }

  const allowMemoryStore =
    process.env.NODE_ENV === "test"
    || process.env.CCAI_ALLOW_MEMORY_SESSION_STORE === "true";

  if (allowMemoryStore) {
    console.warn(
      "[SessionStore] Redis session store unavailable; using MemoryStore because CCAI_ALLOW_MEMORY_SESSION_STORE=true or NODE_ENV=test",
    );
    return new session.MemoryStore();
  }

  throw new Error(
    "Redis session store is required. Configure REDIS_URL and CCAI_SESSION_STORE_REDIS=true before removing Mongo runtime.",
  );
}

module.exports = {
  createSessionStore,
};
