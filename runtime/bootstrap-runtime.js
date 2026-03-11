const { getRuntimeConfig, parseBoolean } = require("../infra/runtimeConfig");
const {
  attachPgClientErrorLogger,
  getPgPool,
  isPostgresConfigured,
  runSqlMigrationsWithLock,
} = require("../infra/postgres");
const {
  resolveMigrationPipelineOptions,
  runDataMigrationPipeline,
} = require("./migration-pipeline");

const DEFAULT_DEPLOY_MIGRATION_LOCK_ID = 7482302;

function parseModeList(value, fallback = []) {
  if (typeof value !== "string") {
    return new Set(fallback);
  }
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function resolveDeployId() {
  const candidates = [
    process.env.CCAI_MIGRATION_DEPLOY_ID,
    process.env.RAILWAY_DEPLOYMENT_ID,
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.RAILWAY_GIT_COMMIT_ID,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function shouldRunAutoDeployMigration(runtimeConfig) {
  const enabled = parseBoolean(
    process.env.CCAI_MIGRATION_AUTO_RUN_ON_DEPLOY,
    true,
  );
  if (!enabled) {
    return false;
  }

  const defaultModes = ["admin-app"];
  const configuredModes = parseModeList(
    process.env.CCAI_MIGRATION_AUTO_RUN_MODES,
    defaultModes,
  );
  return configuredModes.has(runtimeConfig.runtimeMode);
}

async function writeDeployMigrationCheckpoint(client, checkpointName, status, metadata = {}) {
  await client.query(
    `
      INSERT INTO migration_checkpoints (
        checkpoint_name,
        status,
        metadata,
        completed_at,
        updated_at
      ) VALUES (
        $1,
        $2,
        $3::jsonb,
        CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END,
        NOW()
      )
      ON CONFLICT (checkpoint_name) DO UPDATE SET
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        completed_at = CASE
          WHEN EXCLUDED.status = 'completed' THEN NOW()
          ELSE migration_checkpoints.completed_at
        END,
        updated_at = NOW()
    `,
    [checkpointName, status, JSON.stringify(metadata || {})],
  );
}

async function ensureAutoDeployMigration(runtimeLabel, runtimeConfig) {
  if (!shouldRunAutoDeployMigration(runtimeConfig)) {
    return { skipped: true, reason: "disabled_or_mode_not_allowed" };
  }

  const deployId = resolveDeployId();
  if (!deployId) {
    console.warn(
      `[${runtimeLabel}] Auto deploy migration skipped because deploy id is unavailable (set CCAI_MIGRATION_DEPLOY_ID or use Railway deployment metadata)`,
    );
    return { skipped: true, reason: "missing_deploy_id" };
  }

  const checkpointName = `deploy:auto:${deployId}`;
  const lockId = Number(
    process.env.CCAI_MIGRATION_DEPLOY_LOCK_ID || DEFAULT_DEPLOY_MIGRATION_LOCK_ID,
  );
  const client = await getPgPool().connect();
  const detachClientErrorLogger = attachPgClientErrorLogger(
    client,
    `auto deploy migration client (${runtimeLabel})`,
  );

  try {
    await client.query("SELECT pg_advisory_lock($1)", [lockId]);

    let existing = null;
    try {
      existing = await client.query(
        `
          SELECT status, completed_at
          FROM migration_checkpoints
          WHERE checkpoint_name = $1
        `,
        [checkpointName],
      );
    } catch (error) {
      if (error?.code === "42P01") {
        throw new Error(
          "migration_checkpoints table is missing. Enable CCAI_RUN_POSTGRES_MIGRATIONS_ON_BOOT=true before auto deploy migration.",
        );
      }
      throw error;
    }

    if (existing.rowCount > 0 && existing.rows[0]?.status === "completed") {
      console.log(
        `[${runtimeLabel}] Auto deploy migration already completed for deploy ${deployId}`,
      );
      return { skipped: true, reason: "already_completed", deployId };
    }

    const pipelineOptions = resolveMigrationPipelineOptions();
    console.log(
      `[${runtimeLabel}] Auto deploy migration started for deploy ${deployId}`,
    );

    await writeDeployMigrationCheckpoint(client, checkpointName, "running", {
      runtimeMode: runtimeConfig.runtimeMode,
      runtimeId: runtimeConfig.runtimeId,
      pipelineOptions,
      startedAt: new Date().toISOString(),
    });

    const summary = await runDataMigrationPipeline({
      pipelineOptions,
      logger: console,
    });

    await writeDeployMigrationCheckpoint(client, checkpointName, "completed", {
      runtimeMode: runtimeConfig.runtimeMode,
      runtimeId: runtimeConfig.runtimeId,
      pipelineOptions,
      summary,
      finishedAt: new Date().toISOString(),
    });

    console.log(
      `[${runtimeLabel}] Auto deploy migration completed for deploy ${deployId}`,
    );
    return { skipped: false, deployId, summary };
  } catch (error) {
    await writeDeployMigrationCheckpoint(client, checkpointName, "failed", {
      runtimeMode: runtimeConfig.runtimeMode,
      runtimeId: runtimeConfig.runtimeId,
      error: error?.message || String(error),
      failedAt: new Date().toISOString(),
    }).catch(() => {});
    throw error;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
    } catch (error) {
      console.warn(
        `[${runtimeLabel}] Failed to release auto deploy migration lock ${lockId}:`,
        error?.message || error,
      );
    }
    detachClientErrorLogger();
    client.release();
  }
}

async function ensureRuntimeReady(runtimeLabel = "runtime") {
  const runtimeConfig = getRuntimeConfig();
  const features = runtimeConfig?.features || {};

  if (!features.postgresEnabled) {
    return [];
  }

  if (!isPostgresConfigured()) {
    console.warn(
      `[${runtimeLabel}] PostgreSQL auto-migration skipped because DATABASE_URL is not configured`,
    );
    return [];
  }

  let applied = [];
  if (features.postgresAutoMigrateOnBoot) {
    applied = await runSqlMigrationsWithLock(undefined, {
      lockId: Number(process.env.CCAI_PG_MIGRATION_LOCK_ID || 7482301),
      waitTimeoutMs: Number(process.env.CCAI_PG_MIGRATION_LOCK_TIMEOUT_MS || 120000),
      pollMs: Number(process.env.CCAI_PG_MIGRATION_LOCK_POLL_MS || 1000),
    });

    console.log(
      `[${runtimeLabel}] PostgreSQL migrations ready: ${applied.length > 0 ? applied.join(", ") : "none"}`,
    );
  } else {
    console.log(
      `[${runtimeLabel}] PostgreSQL auto-migration on boot disabled (CCAI_RUN_POSTGRES_MIGRATIONS_ON_BOOT=false)`,
    );
  }

  const runAutoDeployMigrationAsync = parseBoolean(
    process.env.CCAI_MIGRATION_AUTO_RUN_ASYNC,
    true,
  );

  if (runAutoDeployMigrationAsync) {
    setImmediate(() => {
      ensureAutoDeployMigration(runtimeLabel, runtimeConfig).catch((error) => {
        console.error(
          `[${runtimeLabel}] Auto deploy migration failed:`,
          error?.message || error,
        );
      });
    });
    console.log(
      `[${runtimeLabel}] Auto deploy migration scheduled in background (CCAI_MIGRATION_AUTO_RUN_ASYNC=true)`,
    );
  } else {
    await ensureAutoDeployMigration(runtimeLabel, runtimeConfig);
  }

  return applied;
}

module.exports = {
  ensureAutoDeployMigration,
  ensureRuntimeReady,
};
