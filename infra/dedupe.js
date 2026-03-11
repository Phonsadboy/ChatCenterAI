const { getRedis, isRedisConfigured } = require("./redis");
const { getRuntimeConfig } = require("./runtimeConfig");

const localProcessedIds = new Map();

function sweepLocalProcessedIds() {
  const now = Date.now();
  for (const [key, expireAt] of localProcessedIds.entries()) {
    if (expireAt <= now) {
      localProcessedIds.delete(key);
    }
  }
}

setInterval(sweepLocalProcessedIds, 60000).unref?.();

async function claimProcessedEvent(eventId, ttlSeconds = 24 * 60 * 60) {
  if (!eventId) return false;

  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.features.redisDedupe && isRedisConfigured()) {
    const redis = getRedis();
    const result = await redis.set(
      `ccai:processed-event:${eventId}`,
      "1",
      "EX",
      ttlSeconds,
      "NX",
    );
    return result === "OK";
  }

  if (localProcessedIds.has(eventId)) {
    return false;
  }
  localProcessedIds.set(eventId, Date.now() + ttlSeconds * 1000);
  return true;
}

module.exports = {
  claimProcessedEvent,
};
