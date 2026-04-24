"use strict";

function normalizeKeySegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_|.-]+/g, "_")
    .slice(0, 180);
}

function createRedisCacheService({
  url = "",
  keyPrefix = "chatcenter-ai",
  defaultTtlSeconds = 45,
  logger = console,
} = {}) {
  let client = null;
  let connectPromise = null;
  let redisModule = null;
  let disabled = false;

  function isConfigured() {
    return typeof url === "string" && url.trim().length > 0 && !disabled;
  }

  function buildKey(parts = []) {
    const normalizedPrefix = normalizeKeySegment(keyPrefix) || "chatcenter-ai";
    const normalizedParts = (Array.isArray(parts) ? parts : [parts])
      .map((part) => normalizeKeySegment(part))
      .filter(Boolean);
    return [normalizedPrefix, ...normalizedParts].join(":");
  }

  async function getClient() {
    if (!isConfigured()) return null;
    if (client?.isOpen) return client;
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
      try {
        if (!redisModule) {
          redisModule = require("redis");
        }
        client = redisModule.createClient({ url });
        client.on("error", (error) => {
          logger.warn?.("[Redis] cache client error:", error?.message || error);
        });
        await client.connect();
        return client;
      } catch (error) {
        disabled = true;
        logger.warn?.(
          "[Redis] cache disabled:",
          error?.message || error,
        );
        return null;
      } finally {
        connectPromise = null;
      }
    })();

    return connectPromise;
  }

  async function getJson(key) {
    const activeClient = await getClient();
    if (!activeClient) return null;
    try {
      const raw = await activeClient.get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      logger.warn?.("[Redis] getJson failed:", error?.message || error);
      return null;
    }
  }

  async function setJson(key, value, ttlSeconds = defaultTtlSeconds) {
    const activeClient = await getClient();
    if (!activeClient) return false;
    const ttl = Number(ttlSeconds);
    if (!Number.isFinite(ttl) || ttl <= 0) return false;
    try {
      await activeClient.set(key, JSON.stringify(value), { EX: Math.floor(ttl) });
      return true;
    } catch (error) {
      logger.warn?.("[Redis] setJson failed:", error?.message || error);
      return false;
    }
  }

  async function del(key) {
    const activeClient = await getClient();
    if (!activeClient) return false;
    try {
      await activeClient.del(key);
      return true;
    } catch (error) {
      logger.warn?.("[Redis] del failed:", error?.message || error);
      return false;
    }
  }

  async function close() {
    if (!client) return;
    const currentClient = client;
    client = null;
    try {
      await currentClient.quit();
    } catch (_) {
      try {
        currentClient.disconnect();
      } catch (__) {}
    }
  }

  return {
    buildKey,
    close,
    del,
    getJson,
    isConfigured,
    setJson,
  };
}

module.exports = {
  createRedisCacheService,
};
