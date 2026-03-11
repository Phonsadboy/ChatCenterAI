#!/usr/bin/env node
require("dotenv").config();

const {
  closePgPool,
  isPostgresConfigured,
  runSqlMigrationsWithLock,
} = require("../infra/postgres");

(async () => {
  if (!isPostgresConfigured()) {
    throw new Error("PostgreSQL is not configured");
  }

  const applied = await runSqlMigrationsWithLock(undefined, {
    lockId: Number(process.env.CCAI_PG_MIGRATION_LOCK_ID || 7482301),
    waitTimeoutMs: Number(process.env.CCAI_PG_MIGRATION_LOCK_TIMEOUT_MS || 120000),
    pollMs: Number(process.env.CCAI_PG_MIGRATION_LOCK_POLL_MS || 1000),
  });
  console.log("[Postgres] Applied migrations:", applied.length > 0 ? applied.join(", ") : "none");
})()
  .then(async () => {
    await closePgPool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[Postgres] Migration failed:", error);
    await closePgPool();
    process.exit(1);
  });
