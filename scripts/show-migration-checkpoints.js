#!/usr/bin/env node
require("dotenv").config();

const { closePgPool, query } = require("../infra/postgres");

async function showMigrationCheckpoints() {
  const { rows } = await query(
    `
      SELECT
        checkpoint_name,
        status,
        metadata,
        completed_at
      FROM migration_checkpoints
      ORDER BY completed_at DESC NULLS LAST, checkpoint_name ASC
    `,
  );

  const tableRows = rows.map((row) => ({
    checkpoint: row.checkpoint_name,
    status: row.status,
    rowCount:
      row?.metadata &&
      typeof row.metadata === "object" &&
      Number.isFinite(Number(row.metadata.rowCount))
        ? Number(row.metadata.rowCount)
        : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  }));

  if (tableRows.length === 0) {
    console.log("[Migration] No checkpoints found.");
    return;
  }

  console.table(tableRows);
}

async function showKeyTableCounts() {
  const tables = [
    "settings",
    "bots",
    "instructions",
    "instruction_versions",
    "instruction_assets",
    "image_collections",
    "orders",
    "follow_up_status",
    "follow_up_page_settings",
    "follow_up_tasks",
    "active_user_status",
    "user_tags",
    "user_purchase_status",
    "contacts",
    "threads",
    "messages",
    "short_links",
  ];

  const summary = [];
  for (const tableName of tables) {
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, "");
    const { rows } = await query(
      `SELECT COUNT(*)::bigint AS count FROM ${safeTableName}`,
    );
    summary.push({
      table: safeTableName,
      count: Number(rows[0]?.count || 0),
    });
  }

  console.table(summary);
}

async function main() {
  try {
    await showMigrationCheckpoints();
    await showKeyTableCounts();
  } finally {
    await closePgPool();
  }
}

main().catch((error) => {
  console.error("[Migration] Failed to read checkpoints:", error);
  process.exit(1);
});
