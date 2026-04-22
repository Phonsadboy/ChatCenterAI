require("dotenv").config();

const { createQueueWorker, getQueue } = require("../infra/queues");
const { JOB_NAMES, QUEUE_NAMES } = require("../infra/queueNames");
const { getRuntimeConfig, parseBoolean } = require("../infra/runtimeConfig");
const { runPostgresMaintenance } = require("../services/postgresMaintenanceService");
const {
  evaluateNotificationSummarySchedules,
  FOLLOW_UP_TASK_INTERVAL_MS,
  initializeApplicationDataRuntime,
  NOTIFICATION_SUMMARY_INTERVAL_MS,
  processDueFollowUpTasks,
} = require("../index");

const POSTGRES_MAINTENANCE_ENABLED = parseBoolean(
  process.env.CCAI_POSTGRES_MAINTENANCE_ENABLED,
  true,
);
const POSTGRES_MAINTENANCE_INTERVAL_MS = Math.max(
  15 * 60 * 1000,
  Number(process.env.CCAI_POSTGRES_MAINTENANCE_INTERVAL_MS || 60 * 60 * 1000),
);
const POSTGRES_MAINTENANCE_STARTUP_JOB_ID = `${JOB_NAMES.POSTGRES_MAINTENANCE_TICK}-startup`;

async function enqueueStartupPostgresMaintenance(statsQueue) {
  if (!POSTGRES_MAINTENANCE_ENABLED) {
    return false;
  }

  await statsQueue.add(
    JOB_NAMES.POSTGRES_MAINTENANCE_TICK,
    {
      source: "startup",
    },
    {
      jobId: POSTGRES_MAINTENANCE_STARTUP_JOB_ID,
    },
  );

  return true;
}

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

  if (POSTGRES_MAINTENANCE_ENABLED) {
    await statsQueue.upsertJobScheduler(
      "postgres-maintenance-scheduler",
      {
        every: POSTGRES_MAINTENANCE_INTERVAL_MS,
      },
      {
        name: JOB_NAMES.POSTGRES_MAINTENANCE_TICK,
        data: {},
        opts: {
          jobId: JOB_NAMES.POSTGRES_MAINTENANCE_TICK,
        },
      },
    );

    await enqueueStartupPostgresMaintenance(statsQueue);
  }
}

async function startBatchWorkers() {
  const runtimeConfig = getRuntimeConfig();
  await initializeApplicationDataRuntime({
    runMigrations: false,
    loadLegacyContent: false,
  });

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
      if (job.name === JOB_NAMES.POSTGRES_MAINTENANCE_TICK) {
        console.log(
          `[Worker:batch] Running PostgreSQL maintenance (source=${job.data?.source || "scheduled"})`,
        );
        const summary = await runPostgresMaintenance();
        console.log("[Worker:batch] PostgreSQL maintenance finished", summary);
        return { processed: true, job: job.name, summary };
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
