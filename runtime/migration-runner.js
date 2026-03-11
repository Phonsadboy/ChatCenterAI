process.env.CCAI_RUNTIME_MODE = process.env.CCAI_RUNTIME_MODE || "migration-runner";
require("dotenv").config();

const {
  closePgPool,
  runSqlMigrationsWithLock,
  isPostgresConfigured,
} = require("../infra/postgres");
const { closeRedisConnections } = require("../infra/redis");
const { parseBoolean } = require("../infra/runtimeConfig");
const {
  resolveMigrationPipelineOptions,
  runDataMigrationPipeline,
} = require("./migration-pipeline");

function resolvePipelineOptions() {
  return {
    runSqlMigrations: parseBoolean(
      process.env.CCAI_MIGRATION_RUN_SQL_MIGRATIONS,
      true,
    ),
    ...resolveMigrationPipelineOptions(),
  };
}

(async () => {
  const options = resolvePipelineOptions();

  if (!isPostgresConfigured()) {
    throw new Error("PostgreSQL is not configured");
  }

  console.log("[Runtime:migration-runner] Pipeline options:", options);

  if (options.runSqlMigrations) {
    const applied = await runSqlMigrationsWithLock(undefined, {
      lockId: Number(process.env.CCAI_PG_MIGRATION_LOCK_ID || 7482301),
      waitTimeoutMs: Number(process.env.CCAI_PG_MIGRATION_LOCK_TIMEOUT_MS || 120000),
      pollMs: Number(process.env.CCAI_PG_MIGRATION_LOCK_POLL_MS || 1000),
    });
    console.log(
      "[Runtime:migration-runner] Applied SQL migrations:",
      applied.length > 0 ? applied.join(", ") : "none",
    );
  }

  await runDataMigrationPipeline({
    pipelineOptions: options,
    logger: console,
  });

  console.log("[Runtime:migration-runner] Migration pipeline completed");
})()
  .then(async () => {
    await Promise.allSettled([
      closePgPool(),
      closeRedisConnections(),
    ]);
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[Runtime:migration-runner]", error);
    await Promise.allSettled([
      closePgPool(),
      closeRedisConnections(),
    ]);
    process.exit(1);
  });
