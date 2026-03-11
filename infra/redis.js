const Redis = require("ioredis");
const { getRuntimeConfig } = require("./runtimeConfig");

let sharedClient = null;
let publisherClient = null;
let subscriberClient = null;

function isRedisConfigured() {
  const config = getRuntimeConfig();
  return Boolean(config.features.redisInfra && config.redisUrl);
}

function createRedisClient(options = {}) {
  const config = getRuntimeConfig();
  if (!config.redisUrl) {
    throw new Error("REDIS_URL is not configured");
  }

  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...options,
  });
}

function attachRedisLogging(client, label) {
  client.on("error", (error) => {
    console.error(`[Redis:${label}]`, error?.message || error);
  });
  return client;
}

function getRedis() {
  if (!sharedClient) {
    sharedClient = attachRedisLogging(createRedisClient(), "main");
  }
  return sharedClient;
}

function getRedisPublisher() {
  if (!publisherClient) {
    publisherClient = attachRedisLogging(createRedisClient(), "publisher");
  }
  return publisherClient;
}

function getRedisSubscriber() {
  if (!subscriberClient) {
    subscriberClient = attachRedisLogging(createRedisClient(), "subscriber");
  }
  return subscriberClient;
}

function createBullRedisConnection() {
  return attachRedisLogging(createRedisClient(), "bullmq");
}

async function closeRedisConnections() {
  await Promise.all(
    [sharedClient, publisherClient, subscriberClient]
      .filter(Boolean)
      .map((client) => client.quit().catch(() => client.disconnect())),
  );
  sharedClient = null;
  publisherClient = null;
  subscriberClient = null;
}

module.exports = {
  closeRedisConnections,
  createBullRedisConnection,
  createRedisClient,
  getRedis,
  getRedisPublisher,
  getRedisSubscriber,
  isRedisConfigured,
};
