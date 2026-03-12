require("dotenv").config();

const { Pool } = require("pg");

function resolveConnectionString() {
  return (
    process.env.DATABASE_URL
    || process.env.DATABASE_PUBLIC_URL
    || process.env.POSTGRES_URL
    || process.env.PG_URL
    || ""
  ).trim();
}

async function ensureSupportIndex(pool) {
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_thread_time
    ON messages (thread_id, created_at DESC, id DESC)
  `);
}

async function loadThreadBatch(pool, cursor, batchSize) {
  const result = await pool.query(
    `
      SELECT id
      FROM threads
      WHERE ($1::uuid IS NULL OR id > $1::uuid)
      ORDER BY id ASC
      LIMIT $2
    `,
    [cursor, batchSize],
  );
  return result.rows.map((row) => row.id);
}

async function backfillBatch(pool, threadIds) {
  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return 0;
  }

  const result = await pool.query(
    `
      WITH target AS (
        SELECT unnest($1::uuid[]) AS thread_id
      ),
      message_rollup AS (
        SELECT
          m.thread_id,
          COUNT(*)::int AS message_count,
          MAX(m.created_at) AS last_message_at
        FROM messages m
        INNER JOIN target t ON t.thread_id = m.thread_id
        GROUP BY m.thread_id
      ),
      latest_message AS (
        SELECT DISTINCT ON (m.thread_id)
          m.thread_id,
          LEFT(COALESCE(m.content_text, m.content::text, ''), 500) AS last_preview,
          m.role AS last_role,
          m.source AS last_source,
          m.created_at AS last_message_at
        FROM messages m
        INNER JOIN target t ON t.thread_id = m.thread_id
        ORDER BY m.thread_id, m.created_at DESC, m.id DESC
      ),
      merged AS (
        SELECT
          t.thread_id,
          COALESCE(r.message_count, 0) AS message_count,
          COALESCE(l.last_message_at, r.last_message_at) AS last_message_at,
          l.last_preview,
          l.last_role,
          l.last_source
        FROM target t
        LEFT JOIN message_rollup r ON r.thread_id = t.thread_id
        LEFT JOIN latest_message l ON l.thread_id = t.thread_id
      )
      UPDATE threads th
      SET
        stats = jsonb_strip_nulls(
          COALESCE(th.stats, '{}'::jsonb) ||
          jsonb_build_object(
            'messageCount', merged.message_count,
            'lastMessageAt', COALESCE(merged.last_message_at, th.updated_at),
            'lastPreview', COALESCE(merged.last_preview, NULLIF(th.stats->>'lastPreview', '')),
            'lastRole', COALESCE(merged.last_role, NULLIF(th.stats->>'lastRole', '')),
            'lastSource', COALESCE(merged.last_source, NULLIF(th.stats->>'lastSource', ''))
          )
        ),
        updated_at = GREATEST(
          th.updated_at,
          COALESCE(merged.last_message_at, th.updated_at)
        )
      FROM merged
      WHERE th.id = merged.thread_id
    `,
    [threadIds],
  );

  return Number(result.rowCount || 0);
}

async function backfillThreadStats() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error("DATABASE_URL (or DATABASE_PUBLIC_URL) is required");
  }

  const batchSize = Math.max(
    100,
    Number.parseInt(process.env.CCAI_THREAD_STATS_BACKFILL_BATCH_SIZE || "1000", 10) || 1000,
  );

  const pool = new Pool({
    connectionString,
    ssl:
      process.env.PGSSLMODE === "disable"
        ? false
        : { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: Number(
      process.env.CCAI_THREAD_STATS_BACKFILL_CONNECT_TIMEOUT_MS || 30000,
    ),
  });

  const startedAt = Date.now();
  let cursor = null;
  let totalThreads = 0;
  let totalUpdated = 0;
  let batchNo = 0;

  try {
    console.log("[ThreadStatsBackfill] Ensuring support index...");
    await ensureSupportIndex(pool);

    while (true) {
      const threadIds = await loadThreadBatch(pool, cursor, batchSize);
      if (threadIds.length === 0) {
        break;
      }

      batchNo += 1;
      totalThreads += threadIds.length;
      cursor = threadIds[threadIds.length - 1];

      const updated = await backfillBatch(pool, threadIds);
      totalUpdated += updated;

      console.log(
        `[ThreadStatsBackfill] batch=${batchNo} threads=${threadIds.length} updated=${updated} totalThreads=${totalThreads}`,
      );
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[ThreadStatsBackfill] done totalThreads=${totalThreads} totalUpdated=${totalUpdated} elapsedSec=${elapsedSec}`,
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  backfillThreadStats().catch((error) => {
    console.error("[ThreadStatsBackfill] failed:", error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  backfillThreadStats,
};
