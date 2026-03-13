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
} = require("../index");

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

}

async function startBatchWorkers() {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.features.mongoEnabled) {
    await connectDB();
    await initializeMongoRuntime({
      runMigrations: false,
      loadLegacyContent: false,
    });
  } else {
    await initializeMongoRuntime({
      runMigrations: false,
      loadLegacyContent: false,
    });
  }

  await registerBatchSchedulers();

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
      return { skipped: true, reason: "unknown_job" };
    },
    {
      concurrency: 1,
    },
  );

  console.log(
    `[Worker:batch] started with scheduler workers (configured batch concurrency ${runtimeConfig.queues.batchConcurrency})`,
  );

  return {
    followUpWorker,
    statsWorker,
  };
}

module.exports = {
  startBatchWorkers,
};
