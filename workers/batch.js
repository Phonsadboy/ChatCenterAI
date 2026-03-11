require("dotenv").config();

const { createQueueWorker, getQueue } = require("../infra/queues");
const { JOB_NAMES, QUEUE_NAMES } = require("../infra/queueNames");
const { getRuntimeConfig } = require("../infra/runtimeConfig");
const {
  connectDB,
  evaluateNotificationSummarySchedules,
  FOLLOW_UP_TASK_INTERVAL_MS,
  initializeMongoRuntime,
  NOTIFICATION_SUMMARY_INTERVAL_MS,
  processDueFollowUpTasks,
  runAgentForgeScheduledTick,
} = require("../index");

const AGENT_FORGE_TICK_INTERVAL_MS = 60 * 1000;

async function registerBatchSchedulers() {
  const followUpQueue = getQueue(QUEUE_NAMES.FOLLOWUP);
  const statsQueue = getQueue(QUEUE_NAMES.STATS_ROLLUP);

  await followUpQueue.upsertJobScheduler(
    "followup-tick-scheduler",
    {
      every: FOLLOW_UP_TASK_INTERVAL_MS,
    },
    {
      name: JOB_NAMES.FOLLOWUP_TICK,
      data: {},
      opts: {
        jobId: JOB_NAMES.FOLLOWUP_TICK,
      },
    },
  );

  await statsQueue.upsertJobScheduler(
    "notification-summary-scheduler",
    {
      every: NOTIFICATION_SUMMARY_INTERVAL_MS,
    },
    {
      name: JOB_NAMES.NOTIFICATION_SUMMARY_TICK,
      data: {},
      opts: {
        jobId: JOB_NAMES.NOTIFICATION_SUMMARY_TICK,
      },
    },
  );

  await statsQueue.upsertJobScheduler(
    "agent-forge-scheduler",
    {
      every: AGENT_FORGE_TICK_INTERVAL_MS,
    },
    {
      name: JOB_NAMES.AGENT_FORGE_TICK,
      data: {},
      opts: {
        jobId: JOB_NAMES.AGENT_FORGE_TICK,
      },
    },
  );
}

async function startBatchWorkers() {
  await connectDB();
  await initializeMongoRuntime({
    runMigrations: false,
    loadLegacyContent: false,
  });

  await registerBatchSchedulers();

  const runtimeConfig = getRuntimeConfig();
  const followUpWorker = createQueueWorker(
    QUEUE_NAMES.FOLLOWUP,
    async (job) => {
      if (job.name !== JOB_NAMES.FOLLOWUP_TICK) {
        return { skipped: true, reason: "unknown_job" };
      }
      await processDueFollowUpTasks(10);
      return { processed: true, job: job.name };
    },
    {
      concurrency: 1,
    },
  );

  const statsWorker = createQueueWorker(
    QUEUE_NAMES.STATS_ROLLUP,
    async (job) => {
      if (job.name === JOB_NAMES.NOTIFICATION_SUMMARY_TICK) {
        await evaluateNotificationSummarySchedules();
        return { processed: true, job: job.name };
      }
      if (job.name === JOB_NAMES.AGENT_FORGE_TICK) {
        await runAgentForgeScheduledTick();
        return { processed: true, job: job.name };
      }
      return { skipped: true, reason: "unknown_job" };
    },
    {
      concurrency: 1,
    },
  );

  console.log(
    `[Worker:batch] started with scheduler workers (configured batch concurrency ${runtimeConfig.queues.batchConcurrency})`,
  );

  const shutdown = async () => {
    await Promise.allSettled([
      followUpWorker.close(),
      statsWorker.close(),
    ]);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return {
    followUpWorker,
    statsWorker,
  };
}

module.exports = {
  startBatchWorkers,
};
