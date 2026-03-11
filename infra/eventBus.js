const crypto = require("crypto");
const { getRedisPublisher, getRedisSubscriber, isRedisConfigured } = require("./redis");
const { getRuntimeConfig } = require("./runtimeConfig");

const ADMIN_EVENT_CHANNEL = "ccai:admin-events";
const listeners = new Set();
const sourceId = crypto.randomUUID();
let subscribed = false;

async function publishAdminEvent(eventName, payload) {
  const runtimeConfig = getRuntimeConfig();
  if (!runtimeConfig.features.redisInfra || !isRedisConfigured()) {
    return false;
  }

  const publisher = getRedisPublisher();
  await publisher.publish(
    ADMIN_EVENT_CHANNEL,
    JSON.stringify({
      sourceId,
      eventName,
      payload,
      publishedAt: new Date().toISOString(),
    }),
  );
  return true;
}

async function ensureAdminSubscription() {
  if (subscribed || !isRedisConfigured()) {
    return;
  }

  const subscriber = getRedisSubscriber();
  subscriber.on("message", (_channel, rawMessage) => {
    try {
      const parsed = JSON.parse(rawMessage);
      if (!parsed || parsed.sourceId === sourceId) {
        return;
      }

      listeners.forEach((listener) => {
        try {
          listener(parsed);
        } catch (error) {
          console.error("[EventBus] listener error:", error?.message || error);
        }
      });
    } catch (error) {
      console.error("[EventBus] parse error:", error?.message || error);
    }
  });

  await subscriber.subscribe(ADMIN_EVENT_CHANNEL);
  subscribed = true;
}

async function subscribeAdminEvents(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  if (isRedisConfigured()) {
    await ensureAdminSubscription();
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

module.exports = {
  publishAdminEvent,
  subscribeAdminEvents,
};
