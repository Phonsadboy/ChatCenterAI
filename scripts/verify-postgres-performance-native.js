"use strict";

const { createMigrationContext } = require("./lib/migrationContext");

async function scalar(context, sql, params = []) {
  const result = await context.postgresRuntime.query(sql, params);
  return Number(result.rows[0]?.count || 0);
}

async function compareCounts(context, label, sourceSql, targetSql, params = []) {
  const sourceCount = await scalar(context, sourceSql, params);
  const targetCount = await scalar(context, targetSql, params);
  if (sourceCount !== targetCount) {
    console.error(
      `[verify-native] mismatch ${label}: source=${sourceCount} target=${targetCount}`,
    );
    return false;
  }
  console.log(`[verify-native] ok ${label}: ${sourceCount}`);
  return true;
}

async function main() {
  const context = createMigrationContext();
  let ok = true;
  try {
    if (!context.postgresRuntime.isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }
    await context.chatStorageService.ensureReady();

    ok = (await compareCounts(
      context,
      "orders",
      `
        SELECT COUNT(*)::bigint AS count
        FROM app_documents
        WHERE collection_name = 'orders'
      `,
      "SELECT COUNT(*)::bigint AS count FROM orders",
    )) && ok;

    ok = (await compareCounts(
      context,
      "openai_usage_logs",
      `
        SELECT COUNT(*)::bigint AS count
        FROM app_documents
        WHERE collection_name = 'openai_usage_logs'
      `,
      "SELECT COUNT(*)::bigint AS count FROM openai_usage_logs",
    )) && ok;

    ok = (await compareCounts(
      context,
      "user_profiles",
      `
        SELECT COUNT(*)::bigint AS count
        FROM app_documents
        WHERE collection_name = 'user_profiles'
      `,
      "SELECT COUNT(*)::bigint AS count FROM user_profiles",
    )) && ok;

    ok = (await compareCounts(
      context,
      "follow_up_tasks",
      `
        SELECT COUNT(*)::bigint AS count
        FROM app_documents
        WHERE collection_name = 'follow_up_tasks'
      `,
      "SELECT COUNT(*)::bigint AS count FROM follow_up_tasks",
    )) && ok;

    const missingHeads = await scalar(
      context,
      `
        WITH expected AS (
          SELECT
            COALESCE(NULLIF(platform, ''), 'line') AS platform,
            COALESCE(NULLIF(bot_id, ''), 'default') AS bot_id,
            user_id
          FROM chat_messages
          WHERE user_id IS NOT NULL AND user_id <> ''
          GROUP BY 1, 2, 3
        )
        SELECT COUNT(*)::bigint AS count
        FROM expected e
        LEFT JOIN chat_conversation_heads h
          ON h.platform = e.platform
          AND h.bot_id = e.bot_id
          AND h.user_id = e.user_id
        WHERE h.user_id IS NULL
      `,
    );
    if (missingHeads > 0) {
      console.error(`[verify-native] missing chat heads: ${missingHeads}`);
      ok = false;
    } else {
      console.log("[verify-native] ok chat_conversation_heads");
    }
  } finally {
    await context.close();
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "[verify-postgres-performance-native] failed:",
    error?.message || error,
  );
  process.exitCode = 1;
});
