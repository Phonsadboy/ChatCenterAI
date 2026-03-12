const session = require("express-session");
const MongoStore = require("connect-mongo");
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

  if (
    !runtimeConfig.features.mongoEnabled ||
    !runtimeConfig.mongoConnectionString
  ) {
    console.warn("[SessionStore] Mongo session store disabled, using MemoryStore");
    return new session.MemoryStore();
  }

  return MongoStore.create({
    clientPromise: connectDB(),
    dbName,
    collectionName,
    stringify: false,
    ttl,
  });
}

module.exports = {
  createSessionStore,
};
