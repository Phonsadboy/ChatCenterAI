const { Queue, Worker } = require("bullmq");
const { createBullRedisConnection, isRedisConfigured } = require("./redis");
const { getRuntimeConfig } = require("./runtimeConfig");

const queueCache = new Map();

function getQueue(name) {
  if (queueCache.has(name)) {
    return queueCache.get(name);
  }

  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured for BullMQ");
  }

  const runtimeConfig = getRuntimeConfig();
  const queue = new Queue(name, {
    connection: createBullRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: runtimeConfig.queues.defaultRemoveOnComplete,
      removeOnFail: runtimeConfig.queues.defaultRemoveOnFail,
    },
  });
  queueCache.set(name, queue);
  return queue;
}

async function enqueueJob(queueName, jobName, payload, options = {}) {
  const queue = getQueue(queueName);
  return queue.add(jobName, payload, options);
}

function createQueueWorker(queueName, processor, options = {}) {
  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured for BullMQ workers");
  }

  const worker = new Worker(queueName, processor, {
    connection: createBullRedisConnection(),
    concurrency: options.concurrency || 1,
    lockDuration: options.lockDuration || 300000,
  });

  worker.on("error", (error) => {
    console.error(`[BullMQ:${queueName}]`, error?.message || error);
  });

  return worker;
}

async function closeAllQueues() {
  await Promise.all(
    Array.from(queueCache.values()).map((queue) => queue.close()),
  );
  queueCache.clear();
}

module.exports = {
  closeAllQueues,
  createQueueWorker,
  enqueueJob,
  getQueue,
};
