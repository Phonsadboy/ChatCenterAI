const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { getRuntimeConfig } = require("./runtimeConfig");

let pool = null;
const DEFAULT_MIGRATION_LOCK_ID = 7482301;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPostgresConfigured() {
  const config = getRuntimeConfig();
  return Boolean(config.features.postgresEnabled && config.postgresConnectionString);
}

function getPgPool() {
  if (!pool) {
    const config = getRuntimeConfig();
    if (!config.postgresConnectionString) {
      throw new Error("DATABASE_URL is not configured");
    }

    pool = new Pool({
      connectionString: config.postgresConnectionString,
      max: Number(process.env.CCAI_PG_POOL_MAX || 20),
      idleTimeoutMillis: Number(process.env.CCAI_PG_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(
        process.env.CCAI_PG_CONNECTION_TIMEOUT_MS || 5000,
      ),
      ssl:
        process.env.PGSSLMODE === "disable"
          ? false
          : process.env.CCAI_PG_SSL_REJECT_UNAUTHORIZED === "false"
            ? { rejectUnauthorized: false }
            : undefined,
    });

    pool.on("error", (error) => {
      console.error("[Postgres] Pool error:", error?.message || error);
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPgPool().query(text, params);
}

async function withTransaction(callback) {
  const client = await getPgPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureMigrationsTableWithClient(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function calculateChecksum(content) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function runSqlMigrations(dirPath, options = {}) {
  const client = options?.client || null;
  const migrationsDir = dirPath || path.join(__dirname, "..", "migrations", "postgres");
  if (!fs.existsSync(migrationsDir)) return [];

  if (client) {
    await ensureMigrationsTableWithClient(client);
  } else {
    await ensureMigrationsTable();
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const applied = [];

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    const checksum = calculateChecksum(sql);
    const existing = client
      ? await client.query(
        "SELECT filename, checksum FROM schema_migrations WHERE filename = $1",
        [file],
      )
      : await query(
        "SELECT filename, checksum FROM schema_migrations WHERE filename = $1",
        [file],
      );
    if (existing.rowCount > 0) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Migration checksum mismatch for ${file}`);
      }
      continue;
    }

    if (client) {
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } else {
      await withTransaction(async (txClient) => {
        await txClient.query(sql);
        await txClient.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
      });
    }
    applied.push(file);
  }

  return applied;
}

async function acquireMigrationLock(
  client,
  {
    lockId = DEFAULT_MIGRATION_LOCK_ID,
    waitTimeoutMs = Number(process.env.CCAI_PG_MIGRATION_LOCK_TIMEOUT_MS || 120000),
    pollMs = Number(process.env.CCAI_PG_MIGRATION_LOCK_POLL_MS || 1000),
  } = {},
) {
  const startedAt = Date.now();
  while (true) {
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [lockId],
    );
    if (result.rows[0]?.locked) {
      return lockId;
    }

    if (Date.now() - startedAt >= waitTimeoutMs) {
      throw new Error(
        `Timed out waiting for PostgreSQL migration lock ${lockId} after ${waitTimeoutMs}ms`,
      );
    }

    await sleep(pollMs);
  }
}

async function releaseMigrationLock(client, lockId = DEFAULT_MIGRATION_LOCK_ID) {
  await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
}

async function runSqlMigrationsWithLock(dirPath, options = {}) {
  const ownClient = !options?.client;
  const client = options?.client || await getPgPool().connect();
  let acquiredLockId = null;

  try {
    acquiredLockId = await acquireMigrationLock(client, options);
    return await runSqlMigrations(dirPath, { client });
  } finally {
    if (acquiredLockId !== null) {
      try {
        await releaseMigrationLock(client, acquiredLockId);
      } catch (error) {
        console.warn(
          "[Postgres] Failed to release migration lock:",
          error?.message || error,
        );
      }
    }

    if (ownClient) {
      client.release();
    }
  }
}

async function closePgPool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  closePgPool,
  getPgPool,
  isPostgresConfigured,
  query,
  runSqlMigrations,
  runSqlMigrationsWithLock,
  withTransaction,
};
