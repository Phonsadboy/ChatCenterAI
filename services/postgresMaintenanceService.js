const {
  isBucketConfigured,
  putObject,
} = require("../infra/storage/bucketStorage");
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

function formatArchiveTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
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
    outboundMessageRetentionEnabled: parseBoolean(
      overrides.outboundMessageRetentionEnabled
        || process.env.CCAI_OUTBOUND_MESSAGE_RETENTION_ENABLED,
      true,
    ),
    outboundMessageRetentionDays: Math.max(
      1,
      parsePositiveInteger(
        overrides.outboundMessageRetentionDays
          || process.env.CCAI_OUTBOUND_MESSAGE_RETENTION_DAYS,
        30,
      ),
    ),
    outboundMessageMaxDeletePerRun: Math.max(
      1000,
      parsePositiveInteger(
        overrides.outboundMessageMaxDeletePerRun
          || process.env.CCAI_OUTBOUND_MESSAGE_MAX_DELETE_PER_RUN,
        100000,
      ),
    ),
    aiDisabledMessageArchiveEnabled: parseBoolean(
      overrides.aiDisabledMessageArchiveEnabled
        || process.env.CCAI_MESSAGES_AI_DISABLED_ARCHIVE_ENABLED,
      false,
    ),
    aiDisabledMessageArchiveAfterDays: Math.max(
      1,
      parsePositiveInteger(
        overrides.aiDisabledMessageArchiveAfterDays
          || process.env.CCAI_MESSAGES_AI_DISABLED_ARCHIVE_AFTER_DAYS,
        14,
      ),
    ),
    aiDisabledMessageArchiveBatchSize: Math.max(
      100,
      parsePositiveInteger(
        overrides.aiDisabledMessageArchiveBatchSize
          || process.env.CCAI_MESSAGES_AI_DISABLED_ARCHIVE_BATCH_SIZE,
        500,
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

async function pruneOutboundMessages(cutoff, batchSize, maxDeletePerRun) {
  let totalDeleted = 0;

  while (totalDeleted < maxDeletePerRun) {
    const currentBatchSize = Math.min(batchSize, maxDeletePerRun - totalDeleted);
    const result = await query(
      `
        WITH doomed AS (
          SELECT ctid
          FROM outbound_messages
          WHERE status IN ('sent', 'failed')
            AND COALESCE(sent_at, failed_at, queued_at) < $1
          ORDER BY COALESCE(sent_at, failed_at, queued_at) ASC
          LIMIT $2
        )
        DELETE FROM outbound_messages target
        USING doomed
        WHERE target.ctid = doomed.ctid
      `,
      [cutoff, currentBatchSize],
    );
    const deletedRows = Number(result.rowCount || 0);
    totalDeleted += deletedRows;
    if (deletedRows < currentBatchSize) {
      break;
    }
  }

  return {
    deletedRows: totalDeleted,
    reachedRunLimit: totalDeleted >= maxDeletePerRun,
    touchedTables: totalDeleted > 0
      ? [{ schemaName: "public", tableName: "outbound_messages" }]
      : [],
  };
}

async function readAiDisabledMessagesDefaultBatch(cutoff, batchSize) {
  const result = await query(
    `
      SELECT
        m.id,
        m.thread_id,
        m.contact_id,
        m.bot_id,
        m.legacy_message_id,
        m.direction,
        m.role,
        m.source,
        m.content_text,
        m.content,
        m.instruction_refs,
        m.instruction_meta,
        m.metadata,
        m.created_at,
        c.platform,
        c.legacy_contact_id,
        t.legacy_thread_key,
        b.legacy_bot_id
      FROM messages_default m
      INNER JOIN contacts c
        ON c.id = m.contact_id
      INNER JOIN active_user_status s
        ON s.legacy_contact_id = c.legacy_contact_id
       AND s.ai_enabled = false
       AND s.updated_at < $1
      LEFT JOIN threads t
        ON t.id = m.thread_id
      LEFT JOIN bots b
        ON b.id = m.bot_id
      WHERE m.created_at < $1
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT $2
    `,
    [cutoff, batchSize],
  );
  return result.rows;
}

async function readMessageMediaForMessages(messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return [];
  }

  const result = await query(
    `
      SELECT
        id,
        message_id,
        message_created_at,
        kind,
        storage_key,
        url,
        mime_type,
        metadata,
        created_at
      FROM message_media
      WHERE message_id = ANY($1::uuid[])
      ORDER BY message_created_at ASC, id ASC
    `,
    [messageIds],
  );
  return result.rows;
}

async function deleteArchivedMessagesDefault(messages) {
  const ids = messages.map((row) => row.id);
  const createdAts = messages.map((row) => row.created_at);
  const result = await query(
    `
      WITH archived AS (
        SELECT *
        FROM unnest($1::uuid[], $2::timestamptz[]) AS item(id, created_at)
      )
      DELETE FROM messages_default target
      USING archived
      WHERE target.id = archived.id
        AND target.created_at = archived.created_at
    `,
    [ids, createdAts],
  );
  return Number(result.rowCount || 0);
}

async function archiveAiDisabledMessagesDefault(cutoff, batchSize) {
  if (!isBucketConfigured()) {
    return {
      skipped: true,
      reason: "bucket_not_configured",
      deletedRows: 0,
      archivedRows: 0,
      archiveKey: null,
      touchedTables: [],
    };
  }

  const messages = await readAiDisabledMessagesDefaultBatch(cutoff, batchSize);
  if (messages.length === 0) {
    return {
      skipped: false,
      deletedRows: 0,
      archivedRows: 0,
      archiveKey: null,
      touchedTables: [],
    };
  }

  const messageIds = messages.map((row) => row.id);
  const media = await readMessageMediaForMessages(messageIds);
  const generatedAt = new Date();
  const firstMessage = messages[0];
  const archiveKey = [
    "archives",
    "messages-default",
    "ai-disabled",
    formatDateOnly(generatedAt),
    `${formatArchiveTimestamp(generatedAt)}-${firstMessage.id}.json`,
  ].join("/");

  const payload = {
    schema: "chatcenter.messages_default.ai_disabled_archive.v1",
    generatedAt: generatedAt.toISOString(),
    cutoff: cutoff.toISOString(),
    rowCount: messages.length,
    mediaRowCount: media.length,
    messages,
    media,
  };

  await putObject(
    archiveKey,
    Buffer.from(JSON.stringify(payload)),
    {
      contentType: "application/json",
      metadata: {
        schema: payload.schema,
        cutoff: payload.cutoff,
        rowCount: String(payload.rowCount),
        mediaRowCount: String(payload.mediaRowCount),
      },
    },
  );

  const deletedRows = await deleteArchivedMessagesDefault(messages);

  return {
    skipped: false,
    deletedRows,
    archivedRows: messages.length,
    mediaRows: media.length,
    archiveKey,
    touchedTables: deletedRows > 0
      ? [
          { schemaName: "public", tableName: "messages_default" },
          { schemaName: "public", tableName: "message_media" },
        ]
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

  const outboundMessageCutoff = new Date(
    Date.now() - config.outboundMessageRetentionDays * 24 * 60 * 60 * 1000,
  );
  const outboundMessageCleanup = config.outboundMessageRetentionEnabled
    ? await pruneOutboundMessages(
        outboundMessageCutoff,
        config.deleteBatchSize,
        config.outboundMessageMaxDeletePerRun,
      )
    : {
        deletedRows: 0,
        reachedRunLimit: false,
        touchedTables: [],
        skipped: true,
        reason: "disabled",
      };
  touchedTables.push(...outboundMessageCleanup.touchedTables);

  const aiDisabledMessageArchiveCutoff = new Date(
    Date.now() - config.aiDisabledMessageArchiveAfterDays * 24 * 60 * 60 * 1000,
  );
  const aiDisabledMessageArchive = config.aiDisabledMessageArchiveEnabled
    ? await archiveAiDisabledMessagesDefault(
        aiDisabledMessageArchiveCutoff,
        config.aiDisabledMessageArchiveBatchSize,
      )
    : {
        skipped: true,
        reason: "disabled",
        deletedRows: 0,
        archivedRows: 0,
        archiveKey: null,
        touchedTables: [],
      };
  touchedTables.push(...aiDisabledMessageArchive.touchedTables);

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
      outboundMessageRetentionEnabled: config.outboundMessageRetentionEnabled,
      outboundMessageRetentionDays: config.outboundMessageRetentionDays,
      outboundMessageMaxDeletePerRun: config.outboundMessageMaxDeletePerRun,
      aiDisabledMessageArchiveEnabled: config.aiDisabledMessageArchiveEnabled,
      aiDisabledMessageArchiveAfterDays: config.aiDisabledMessageArchiveAfterDays,
      aiDisabledMessageArchiveBatchSize: config.aiDisabledMessageArchiveBatchSize,
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
    outboundMessages: {
      skipped: Boolean(outboundMessageCleanup.skipped),
      reason: outboundMessageCleanup.reason || null,
      deletedRows: outboundMessageCleanup.deletedRows,
      reachedRunLimit: Boolean(outboundMessageCleanup.reachedRunLimit),
      cutoff: outboundMessageCutoff.toISOString(),
    },
    aiDisabledMessagesDefaultArchive: {
      skipped: Boolean(aiDisabledMessageArchive.skipped),
      reason: aiDisabledMessageArchive.reason || null,
      archivedRows: aiDisabledMessageArchive.archivedRows,
      deletedRows: aiDisabledMessageArchive.deletedRows,
      mediaRows: aiDisabledMessageArchive.mediaRows || 0,
      archiveKey: aiDisabledMessageArchive.archiveKey,
      cutoff: aiDisabledMessageArchiveCutoff.toISOString(),
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
