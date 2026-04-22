const { getPgPool, isPostgresConfigured, query } = require("../infra/postgres");
const { parseBoolean } = require("../infra/runtimeConfig");

const PARTITIONED_TABLES = [
  {
    parentTable: "messages",
    prefix: "messages",
    timeColumn: "created_at",
  },
  {
    parentTable: "webhook_events",
    prefix: "webhook_events",
    timeColumn: "received_at",
  },
  {
    parentTable: "usage_logs",
    prefix: "usage_logs",
    timeColumn: "created_at",
  },
];

function parsePositiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function parseNonNegativeInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return numeric;
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function qualifyTable(schemaName, tableName) {
  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
}

function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function resolvePostgresMaintenanceConfig(overrides = {}) {
  return {
    enabled: parseBoolean(
      process.env.CCAI_POSTGRES_MAINTENANCE_ENABLED,
      true,
    ),
    partitionMonthsAhead: Math.max(
      0,
      parseNonNegativeInteger(
        overrides.partitionMonthsAhead
          || process.env.CCAI_POSTGRES_PARTITION_MONTHS_AHEAD,
        2,
      ),
    ),
    partitionLockTimeoutMs: Math.max(
      250,
      parsePositiveInteger(
        overrides.partitionLockTimeoutMs
          || process.env.CCAI_POSTGRES_PARTITION_LOCK_TIMEOUT_MS,
        2000,
      ),
    ),
    deleteBatchSize: Math.max(
      500,
      parsePositiveInteger(
        overrides.deleteBatchSize
          || process.env.CCAI_POSTGRES_MAINTENANCE_DELETE_BATCH_SIZE,
        5000,
      ),
    ),
    webhookEventRetentionDays: Math.max(
      1,
      parsePositiveInteger(
        overrides.webhookEventRetentionDays
          || process.env.CCAI_WEBHOOK_EVENT_RETENTION_DAYS,
        30,
      ),
    ),
    webhookIdempotencyRetentionDays: Math.max(
      1,
      parsePositiveInteger(
        overrides.webhookIdempotencyRetentionDays
          || process.env.CCAI_WEBHOOK_IDEMPOTENCY_RETENTION_DAYS,
        7,
      ),
    ),
  };
}

async function ensureMonthlyPartition(parentTable, prefix, monthStart, lockTimeoutMs) {
  const partitionName = `${prefix}_${formatDateOnly(monthStart).slice(0, 7).replace("-", "")}`;
  const nextMonth = addUtcMonths(monthStart, 1);
  const client = await getPgPool().connect();
  try {
    await client.query(`SET lock_timeout TO '${lockTimeoutMs}ms'`);
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS ${quoteIdentifier(partitionName)}
        PARTITION OF ${quoteIdentifier(parentTable)}
        FOR VALUES FROM ('${formatDateOnly(monthStart)}') TO ('${formatDateOnly(nextMonth)}')
      `,
    );
    return {
      partitionName,
      created: true,
      skippedReason: null,
    };
  } catch (error) {
    const message = error?.message || "";
    if (message.includes('updated partition constraint for default partition')) {
      return {
        partitionName,
        created: false,
        skippedReason: "default_partition_conflict",
      };
    }
    if (
      error?.code === "55P03"
      || message.toLowerCase().includes("lock timeout")
      || message.toLowerCase().includes("canceling statement due to lock timeout")
    ) {
      return {
        partitionName,
        created: false,
        skippedReason: "lock_timeout",
      };
    }
    throw error;
  } finally {
    await client.query("RESET lock_timeout").catch(() => {});
    client.release();
  }
}

async function ensureFuturePartitions(monthsAhead = 2, lockTimeoutMs = 2000) {
  const monthStart = startOfUtcMonth(new Date());
  const createdPartitions = [];
  const skippedPartitions = [];

  for (const tableConfig of PARTITIONED_TABLES) {
    for (let offset = 0; offset <= monthsAhead; offset += 1) {
      const result = await ensureMonthlyPartition(
        tableConfig.parentTable,
        tableConfig.prefix,
        addUtcMonths(monthStart, offset),
        lockTimeoutMs,
      );
      if (result.created) {
        createdPartitions.push(`${tableConfig.parentTable}:${result.partitionName}`);
      } else if (result.skippedReason) {
        skippedPartitions.push(
          `${tableConfig.parentTable}:${result.partitionName}:${result.skippedReason}`,
        );
      }
    }
  }

  return {
    createdPartitions,
    skippedPartitions,
  };
}

async function listPartitions(parentTable) {
  const result = await query(
    `
      SELECT
        child_ns.nspname AS schema_name,
        child.relname AS table_name
      FROM pg_inherits
      INNER JOIN pg_class parent
        ON parent.oid = pg_inherits.inhparent
      INNER JOIN pg_namespace parent_ns
        ON parent_ns.oid = parent.relnamespace
      INNER JOIN pg_class child
        ON child.oid = pg_inherits.inhrelid
      INNER JOIN pg_namespace child_ns
        ON child_ns.oid = child.relnamespace
      WHERE parent.relname = $1
        AND parent_ns.nspname = 'public'
      ORDER BY child.relname ASC
    `,
    [parentTable],
  );
  return result.rows;
}

function parsePartitionMonthRange(tableName, prefix) {
  const match = new RegExp(`^${prefix}_(\\d{4})(\\d{2})$`).exec(tableName);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  return {
    start,
    end: addUtcMonths(start, 1),
  };
}

async function deleteRowsInBatches(schemaName, tableName, timeColumn, cutoff, batchSize) {
  const qualifiedTable = qualifyTable(schemaName, tableName);
  const quotedTimeColumn = quoteIdentifier(timeColumn);
  let totalDeleted = 0;

  while (true) {
    const result = await query(
      `
        WITH doomed AS (
          SELECT ctid
          FROM ${qualifiedTable}
          WHERE ${quotedTimeColumn} < $1
          LIMIT $2
        )
        DELETE FROM ${qualifiedTable} target
        USING doomed
        WHERE target.ctid = doomed.ctid
      `,
      [cutoff, batchSize],
    );
    const deletedRows = Number(result.rowCount || 0);
    totalDeleted += deletedRows;
    if (deletedRows < batchSize) {
      break;
    }
  }

  return totalDeleted;
}

async function vacuumAnalyzeTable(schemaName, tableName) {
  const client = await getPgPool().connect();
  try {
    await client.query(`VACUUM ANALYZE ${qualifyTable(schemaName, tableName)}`);
  } finally {
    client.release();
  }
}

async function prunePartitionedTable(parentTable, prefix, timeColumn, cutoff, batchSize) {
  const partitions = await listPartitions(parentTable);
  const touchedTables = [];
  const droppedPartitions = [];
  let totalDeleted = 0;

  for (const partition of partitions) {
    const range = parsePartitionMonthRange(partition.table_name, prefix);
    if (range && range.end <= cutoff) {
      await query(`DROP TABLE IF EXISTS ${qualifyTable(partition.schema_name, partition.table_name)}`);
      droppedPartitions.push(`${partition.schema_name}.${partition.table_name}`);
      continue;
    }

    const deletedRows = await deleteRowsInBatches(
      partition.schema_name,
      partition.table_name,
      timeColumn,
      cutoff,
      batchSize,
    );
    if (deletedRows > 0) {
      totalDeleted += deletedRows;
      touchedTables.push({
        schemaName: partition.schema_name,
        tableName: partition.table_name,
      });
    }
  }

  return {
    deletedRows: totalDeleted,
    droppedPartitions,
    touchedTables,
  };
}

async function pruneStandardTable(tableName, timeColumn, cutoff, batchSize) {
  const deletedRows = await deleteRowsInBatches(
    "public",
    tableName,
    timeColumn,
    cutoff,
    batchSize,
  );
  return {
    deletedRows,
    touchedTables: deletedRows > 0
      ? [{ schemaName: "public", tableName }]
      : [],
  };
}

async function runPostgresMaintenance(overrides = {}) {
  const config = resolvePostgresMaintenanceConfig(overrides);
  if (!config.enabled) {
    return { skipped: true, reason: "disabled" };
  }
  if (!isPostgresConfigured()) {
    return { skipped: true, reason: "postgres_not_configured" };
  }

  const partitionSummary = await ensureFuturePartitions(
    config.partitionMonthsAhead,
    config.partitionLockTimeoutMs,
  );
  const touchedTables = [];

  const webhookEventCutoff = new Date(
    Date.now() - config.webhookEventRetentionDays * 24 * 60 * 60 * 1000,
  );
  const webhookEventCleanup = await prunePartitionedTable(
    "webhook_events",
    "webhook_events",
    "received_at",
    webhookEventCutoff,
    config.deleteBatchSize,
  );
  touchedTables.push(...webhookEventCleanup.touchedTables);

  const webhookIdempotencyCutoff = new Date(
    Date.now() - config.webhookIdempotencyRetentionDays * 24 * 60 * 60 * 1000,
  );
  const webhookIdempotencyCleanup = await pruneStandardTable(
    "webhook_event_idempotency",
    "last_received_at",
    webhookIdempotencyCutoff,
    config.deleteBatchSize,
  );
  touchedTables.push(...webhookIdempotencyCleanup.touchedTables);

  const seenTables = new Set();
  for (const table of touchedTables) {
    const tableKey = `${table.schemaName}.${table.tableName}`;
    if (seenTables.has(tableKey)) continue;
    seenTables.add(tableKey);
    await vacuumAnalyzeTable(table.schemaName, table.tableName);
  }

  const summary = {
    skipped: false,
    config: {
      partitionMonthsAhead: config.partitionMonthsAhead,
      partitionLockTimeoutMs: config.partitionLockTimeoutMs,
      webhookEventRetentionDays: config.webhookEventRetentionDays,
      webhookIdempotencyRetentionDays: config.webhookIdempotencyRetentionDays,
      deleteBatchSize: config.deleteBatchSize,
    },
    createdPartitions: partitionSummary.createdPartitions,
    skippedPartitions: partitionSummary.skippedPartitions,
    webhookEvents: {
      deletedRows: webhookEventCleanup.deletedRows,
      droppedPartitions: webhookEventCleanup.droppedPartitions,
      cutoff: webhookEventCutoff.toISOString(),
    },
    webhookIdempotency: {
      deletedRows: webhookIdempotencyCleanup.deletedRows,
      cutoff: webhookIdempotencyCutoff.toISOString(),
    },
    vacuumedTables: Array.from(seenTables),
  };

  console.log("[PostgresMaintenance]", summary);
  return summary;
}

module.exports = {
  resolvePostgresMaintenanceConfig,
  runPostgresMaintenance,
};
