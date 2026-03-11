const crypto = require("crypto");
const { getRedis, isRedisConfigured } = require("./redis");

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const RENEW_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLockPart(value, fallback = "unknown") {
  if (value === null || typeof value === "undefined") {
    return fallback;
  }
  const asString = String(value).trim();
  if (!asString) {
    return fallback;
  }
  return asString.replace(/\s+/g, "_");
}

function buildConversationLockId({ platform, botId, senderId, queueKey } = {}) {
  if (queueKey) {
    return normalizeLockPart(queueKey, "queue");
  }
  return [
    normalizeLockPart(platform, "unknown"),
    normalizeLockPart(botId, "default"),
    normalizeLockPart(senderId, "unknown"),
  ].join(":");
}

function parseConversationIdentity(queueKey) {
  if (typeof queueKey !== "string" || !queueKey.trim()) {
    return {
      platform: "unknown",
      botId: "default",
      senderId: "unknown",
      queueKey: "unknown:default:unknown",
    };
  }

  const normalized = queueKey.trim();
  const parts = normalized.split(":");
  if (parts.length >= 3) {
    return {
      platform: normalizeLockPart(parts[0], "unknown"),
      botId: normalizeLockPart(parts[1], "default"),
      senderId: normalizeLockPart(parts.slice(2).join(":"), "unknown"),
      queueKey: normalized,
    };
  }

  return {
    platform: "unknown",
    botId: "default",
    senderId: normalizeLockPart(normalized, "unknown"),
    queueKey: normalized,
  };
}

function buildLockKey(lockId) {
  return `ccai:conversation-lock:${lockId}`;
}

async function acquireConversationLock(
  identity,
  {
    ttlMs = Number(process.env.CCAI_QUEUE_CONVERSATION_LOCK_TTL_MS || 120000),
    waitTimeoutMs = Number(process.env.CCAI_QUEUE_CONVERSATION_LOCK_WAIT_TIMEOUT_MS || 10000),
    pollMs = Number(process.env.CCAI_QUEUE_CONVERSATION_LOCK_POLL_MS || 120),
  } = {},
) {
  if (!isRedisConfigured()) {
    throw new Error("Redis is required for conversation locking");
  }

  const lockId = buildConversationLockId(identity);
  const lockKey = buildLockKey(lockId);
  const ownerToken = `${process.pid}:${Date.now()}:${crypto.randomUUID()}`;
  const redis = getRedis();
  const startedAt = Date.now();

  while (Date.now() - startedAt <= waitTimeoutMs) {
    const acquired = await redis.set(
      lockKey,
      ownerToken,
      "PX",
      ttlMs,
      "NX",
    );
    if (acquired === "OK") {
      return {
        lockId,
        lockKey,
        ownerToken,
        ttlMs,
      };
    }
    await sleep(Math.max(25, pollMs));
  }

  return null;
}

async function renewConversationLock(lock) {
  if (!lock?.lockKey || !lock?.ownerToken) {
    return false;
  }
  const redis = getRedis();
  const renewed = await redis.eval(
    RENEW_LOCK_SCRIPT,
    1,
    lock.lockKey,
    lock.ownerToken,
    String(lock.ttlMs),
  );
  return renewed === 1;
}

async function releaseConversationLock(lock) {
  if (!lock?.lockKey || !lock?.ownerToken) {
    return false;
  }
  const redis = getRedis();
  const released = await redis.eval(
    RELEASE_LOCK_SCRIPT,
    1,
    lock.lockKey,
    lock.ownerToken,
  );
  return released === 1;
}

async function runWithConversationLock(identity, handler, options = {}) {
  const lock = await acquireConversationLock(identity, options);
  if (!lock) {
    return {
      acquired: false,
      result: null,
    };
  }

  const heartbeatMs = Math.max(
    1000,
    Math.floor(Number(lock.ttlMs || 120000) / 3),
  );
  const heartbeat = setInterval(() => {
    renewConversationLock(lock).catch((error) => {
      console.warn(
        `[ConversationLock] renew failed for ${lock.lockId}:`,
        error?.message || error,
      );
    });
  }, heartbeatMs);
  heartbeat.unref?.();

  try {
    const result = await handler(lock);
    return {
      acquired: true,
      result,
    };
  } finally {
    clearInterval(heartbeat);
    await releaseConversationLock(lock).catch((error) => {
      console.warn(
        `[ConversationLock] release failed for ${lock.lockId}:`,
        error?.message || error,
      );
    });
  }
}

module.exports = {
  acquireConversationLock,
  buildConversationLockId,
  parseConversationIdentity,
  releaseConversationLock,
  renewConversationLock,
  runWithConversationLock,
};
