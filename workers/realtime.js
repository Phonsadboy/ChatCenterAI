require("dotenv").config();

const { createQueueWorker, enqueueJob } = require("../infra/queues");
const { drainConversationBuffer } = require("../infra/conversationBuffer");
const {
  parseConversationIdentity,
  runWithConversationLock,
} = require("../infra/conversationLock");
const { JOB_NAMES, QUEUE_NAMES } = require("../infra/queueNames");
const { getRuntimeConfig } = require("../infra/runtimeConfig");
const { connectDB, processFlushedMessages } = require("../index");

async function startRealtimeWorkers() {
  await connectDB();

  const runtimeConfig = getRuntimeConfig();
  const lockOptions = {
    ttlMs: runtimeConfig.queues.conversationLockTtlMs,
    waitTimeoutMs: runtimeConfig.queues.conversationLockWaitTimeoutMs,
    pollMs: runtimeConfig.queues.conversationLockPollMs,
  };
  const worker = createQueueWorker(
    QUEUE_NAMES.CONVERSATION_FLUSH,
    async (job) => {
      if (job.name !== JOB_NAMES.CONVERSATION_FLUSH) {
        return { skipped: true, reason: "unknown_job" };
      }

      const { queueKey } = job.data || {};
      if (!queueKey) {
        return { skipped: true, reason: "missing_queue_key" };
      }

      const identity = parseConversationIdentity(queueKey);
      const lockResult = await runWithConversationLock(
        identity,
        async () => {
          const drained = await drainConversationBuffer(queueKey);
          if (
            !drained.userId ||
            !Array.isArray(drained.messages) ||
            drained.messages.length === 0
          ) {
            return { skipped: true, reason: "empty_buffer" };
          }

          await processFlushedMessages(
            drained.userId,
            drained.messages,
            drained.context || {},
          );

          return {
            processed: true,
            queueKey,
            messageCount: drained.messages.length,
          };
        },
        lockOptions,
      );

      if (!lockResult.acquired) {
        const retryDelayMs = Math.max(
          50,
          Number(runtimeConfig.queues.conversationLockRetryDelayMs || 250),
        );
        await enqueueJob(
          QUEUE_NAMES.CONVERSATION_FLUSH,
          JOB_NAMES.CONVERSATION_FLUSH,
          { queueKey, userId: identity.senderId },
          {
            delay: retryDelayMs,
            attempts: Math.max(
              1,
              Number(runtimeConfig.queues.conversationLockRetryAttempts || 20),
            ),
            backoff: {
              type: "exponential",
              delay: retryDelayMs,
            },
          },
        );
        return {
          skipped: true,
          reason: "conversation_lock_busy_requeued",
          queueKey,
        };
      }

      return lockResult.result || { processed: false, queueKey };
    },
    {
      concurrency: runtimeConfig.queues.realtimeConcurrency,
    },
  );

  console.log(
    `[Worker:realtime] started with concurrency ${runtimeConfig.queues.realtimeConcurrency}`,
  );

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return worker;
}

module.exports = {
  startRealtimeWorkers,
};
