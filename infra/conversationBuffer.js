const { enqueueJob } = require("./queues");
const { getRedis } = require("./redis");
const { getRuntimeConfig } = require("./runtimeConfig");
const { JOB_NAMES, QUEUE_NAMES } = require("./queueNames");

function buildConversationBufferKeys(queueKey) {
  return {
    messages: `ccai:conversation:${queueKey}:messages`,
    context: `ccai:conversation:${queueKey}:context`,
    userId: `ccai:conversation:${queueKey}:user`,
    scheduled: `ccai:conversation:${queueKey}:scheduled`,
  };
}

async function scheduleConversationFlush(queueKey, userId, delayMs, immediate = false) {
  const redis = getRedis();
  const runtimeConfig = getRuntimeConfig();
  const keys = buildConversationBufferKeys(queueKey);
  const attempts = Math.max(
    1,
    Number(runtimeConfig.queues.conversationFlushAttempts || 1),
  );
  const backoffDelay = Math.max(
    0,
    Number(runtimeConfig.queues.conversationFlushBackoffMs || 0),
  );
  const retryOptions =
    backoffDelay > 0
      ? { attempts, backoff: { type: "exponential", delay: backoffDelay } }
      : { attempts };

  if (immediate) {
    await redis.del(keys.scheduled);
    await enqueueJob(
      QUEUE_NAMES.CONVERSATION_FLUSH,
      JOB_NAMES.CONVERSATION_FLUSH,
      { queueKey, userId },
      { ...retryOptions, delay: 0 },
    );
    return true;
  }

  const scheduleWindowMs = Math.max(
    delayMs + runtimeConfig.queues.flushKeyTtlMs,
    runtimeConfig.queues.flushKeyTtlMs,
  );
  const scheduled = await redis.set(
    keys.scheduled,
    String(Date.now() + delayMs),
    "PX",
    scheduleWindowMs,
    "NX",
  );
  if (scheduled !== "OK") {
    return false;
  }

  await enqueueJob(
    QUEUE_NAMES.CONVERSATION_FLUSH,
    JOB_NAMES.CONVERSATION_FLUSH,
    { queueKey, userId },
    { ...retryOptions, delay: Math.max(0, delayMs) },
  );
  return true;
}

async function appendConversationBuffer(queueKey, userId, incomingItem, context, options = {}) {
  const redis = getRedis();
  const keys = buildConversationBufferKeys(queueKey);
  const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, options.delayMs) : 0;
  const maxMessages = Number.isFinite(options.maxMessages) && options.maxMessages > 0
    ? Math.floor(options.maxMessages)
    : 10;
  const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0
    ? Math.floor(options.ttlMs)
    : 15 * 60 * 1000;

  const serializedContext = JSON.stringify(context || {});
  const serializedItem = JSON.stringify(incomingItem || {});

  const results = await redis
    .multi()
    .rpush(keys.messages, serializedItem)
    .set(keys.context, serializedContext, "PX", ttlMs)
    .set(keys.userId, String(userId || ""), "PX", ttlMs)
    .pexpire(keys.messages, ttlMs)
    .exec();

  const size = Number(results?.[0]?.[1] || 0);
  const immediate = size >= maxMessages || delayMs === 0;
  await scheduleConversationFlush(queueKey, userId, delayMs, immediate);

  return { size, immediate };
}

async function drainConversationBuffer(queueKey) {
  const redis = getRedis();
  const keys = buildConversationBufferKeys(queueKey);
  const result = await redis
    .multi()
    .lrange(keys.messages, 0, -1)
    .get(keys.context)
    .get(keys.userId)
    .del(keys.messages)
    .del(keys.context)
    .del(keys.userId)
    .del(keys.scheduled)
    .exec();

  const serializedMessages = Array.isArray(result?.[0]?.[1]) ? result[0][1] : [];
  const serializedContext = typeof result?.[1]?.[1] === "string" ? result[1][1] : "{}";
  const userId = typeof result?.[2]?.[1] === "string" ? result[2][1] : "";

  return {
    userId,
    context: JSON.parse(serializedContext || "{}"),
    messages: serializedMessages
      .map((entry) => {
        try {
          return JSON.parse(entry);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean),
  };
}

module.exports = {
  appendConversationBuffer,
  buildConversationBufferKeys,
  drainConversationBuffer,
};
