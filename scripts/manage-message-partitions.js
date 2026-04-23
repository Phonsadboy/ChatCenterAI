const { query } = require("../infra/postgres");

function assertSafePartitionName(tableName) {
  if (!/^messages_(default|\d{6})$/.test(tableName)) {
    throw new Error(`unsafe_partition_name:${tableName}`);
  }
  return tableName;
}

async function listPartitions() {
  const result = await query(`
    SELECT child.relname AS table_name
    FROM pg_inherits i
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_class child ON child.oid = i.inhrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    WHERE parent_ns.nspname = 'public'
      AND child_ns.nspname = 'public'
      AND parent.relname = 'messages'
    ORDER BY child.relname
  `);
  return result.rows;
}

async function showSizes() {
  const result = await query(`
    SELECT
      c.relname,
      pg_total_relation_size(c.oid) AS bytes,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('messages_202603', 'messages_default', 'messages')
    ORDER BY bytes DESC
  `);
  return result.rows;
}

async function summarizeDefaultPartition() {
  const result = await query(`
    SELECT
      min(created_at) AS min_created_at,
      max(created_at) AS max_created_at,
      count(*)::bigint AS rows
    FROM public.messages_default
  `);
  return result.rows[0] || null;
}

async function summarizeDefaultPartitionByMonth() {
  const result = await query(`
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM-01') AS month_start,
      count(*)::bigint AS rows
    FROM public.messages_default
    GROUP BY 1
    ORDER BY 1
  `);
  return result.rows;
}

async function summarizeMessageMedia() {
  const result = await query(`
    SELECT
      count(*)::bigint AS rows,
      pg_total_relation_size('public.message_media') AS bytes,
      pg_size_pretty(pg_total_relation_size('public.message_media')) AS size
    FROM public.message_media
  `);
  return result.rows[0] || null;
}

async function pruneDefaultBefore(cutoffIso) {
  const cutoff = new Date(cutoffIso);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error(`invalid_cutoff:${cutoffIso}`);
  }
  const result = await query(
    `
      DELETE FROM public.messages_default
      WHERE created_at < $1
    `,
    [cutoff.toISOString()],
  );
  return {
    cutoff: cutoff.toISOString(),
    deletedRows: Number(result.rowCount || 0),
  };
}

async function vacuumDefaultPartition() {
  const result = await query("VACUUM ANALYZE public.messages_default");
  return {
    command: "VACUUM ANALYZE public.messages_default",
    rowCount: result.rowCount,
  };
}

async function dropPartition(tableName) {
  const safeName = assertSafePartitionName(tableName);
  await query(`DROP TABLE IF EXISTS public."${safeName}"`);
  return { dropped: safeName };
}

async function main() {
  const command = (process.argv[2] || "").trim();
  const arg = (process.argv[3] || "").trim();

  if (!command || command === "help" || command === "--help") {
    console.error(
      "Usage: node scripts/manage-message-partitions.js <list|sizes|drop> [partition_name]",
    );
    process.exit(1);
  }

  let output;
  if (command === "list") {
    output = await listPartitions();
  } else if (command === "sizes") {
    output = await showSizes();
  } else if (command === "default-summary") {
    output = await summarizeDefaultPartition();
  } else if (command === "default-months") {
    output = await summarizeDefaultPartitionByMonth();
  } else if (command === "message-media-summary") {
    output = await summarizeMessageMedia();
  } else if (command === "prune-default-before") {
    if (!arg) {
      throw new Error("cutoff_required");
    }
    output = await pruneDefaultBefore(arg);
  } else if (command === "vacuum-default") {
    output = await vacuumDefaultPartition();
  } else if (command === "drop") {
    if (!arg) {
      throw new Error("partition_name_required");
    }
    output = await dropPartition(arg);
  } else {
    throw new Error(`unknown_command:${command}`);
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
