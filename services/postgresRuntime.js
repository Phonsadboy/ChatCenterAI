"use strict";

const { Pool } = require("pg");

function createMonthRange(anchorDate = new Date()) {
  const start = new Date(
    Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() + 1, 1, 0, 0, 0),
  );
  const name = `chat_messages_${start.toISOString().slice(0, 7).replace("-", "_")}`;
  return { start, end, name };
}

function addUtcMonths(date, offset) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + offset,
      1,
      0,
      0,
      0,
    ),
  );
}

function escapePgLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function createPostgresRuntime(config = {}) {
  const {
    connectionString = "",
    ssl = false,
    applicationName = "chatcenter-ai",
    maxPoolSize = 10,
    statementTimeoutMs = 10000,
    idleTimeoutMs = 10000,
    connectionTimeoutMs = 10000,
  } = config;

  let pool = null;
  let ensureSchemaPromise = null;

  function isConfigured() {
    return typeof connectionString === "string" && connectionString.trim().length > 0;
  }

  function getPool() {
    if (!isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }
    if (!pool) {
      pool = new Pool({
        connectionString,
        max: maxPoolSize,
        statement_timeout: statementTimeoutMs,
        idleTimeoutMillis: idleTimeoutMs,
        connectionTimeoutMillis: connectionTimeoutMs,
        application_name: applicationName,
        ssl: ssl ? { rejectUnauthorized: false } : false,
      });
      pool.on("error", (error) => {
        console.error("[Postgres] Pool error:", error?.message || error);
      });
    }
    return pool;
  }

  async function query(text, params = []) {
    return getPool().query(text, params);
  }

  async function ensureSchema(options = {}) {
    if (!isConfigured()) return;
    if (ensureSchemaPromise) return ensureSchemaPromise;
    ensureSchemaPromise = (async () => {
      const hotRetentionDays = Number.isFinite(options.hotRetentionDays)
        ? options.hotRetentionDays
        : 60;

      await query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id text NOT NULL,
          user_id text NOT NULL,
          role text NOT NULL,
          content_text text,
          content_json jsonb,
          source text,
          platform text,
          bot_id text,
          instruction_refs jsonb,
          instruction_meta jsonb,
          tool_calls jsonb,
          tool_call_id text,
          tool_name text,
          metadata jsonb,
          legacy_sender_id text,
          legacy_user_id text,
          order_extraction_round_id text,
          order_extraction_marked_at timestamptz,
          order_id text,
          message_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (id, message_at)
        ) PARTITION BY RANGE (message_at)
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS chat_message_attachments (
          message_id text NOT NULL,
          attachment_index integer NOT NULL,
          kind text NOT NULL DEFAULT 'image',
          bucket_key text,
          content_type text,
          size_bytes bigint,
          source_url text,
          preview_url text,
          metadata jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (message_id, attachment_index)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS chat_conversations (
          user_id text PRIMARY KEY,
          last_message_id text,
          last_message_at timestamptz,
          last_message_content text,
          last_message_preview text,
          last_role text,
          platform text,
          bot_id text,
          message_count integer NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS chat_archive_exports (
          archive_month date NOT NULL,
          export_path text NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          row_count bigint NOT NULL DEFAULT 0,
          checksum text,
          started_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          PRIMARY KEY (archive_month, export_path)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS app_documents (
          collection_name text NOT NULL,
          document_id text NOT NULL,
          payload jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (collection_name, document_id)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS asset_objects (
          asset_scope text NOT NULL,
          asset_id text NOT NULL,
          file_name text,
          bucket_key text,
          mime_type text,
          size_bytes bigint,
          metadata jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (asset_scope, asset_id)
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_chat_messages_user_time
          ON chat_messages (user_id, message_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_chat_messages_id
          ON chat_messages (id)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_chat_messages_platform_bot_time
          ON chat_messages (platform, bot_id, message_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at
          ON chat_conversations (last_message_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_chat_message_attachments_bucket_key
          ON chat_message_attachments (bucket_key)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_updated
          ON app_documents (collection_name, updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_openai_usage_timestamp
          ON app_documents ((payload->>'timestamp') DESC)
          WHERE collection_name = 'openai_usage_logs'
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_user_id_updated
          ON app_documents (collection_name, (payload->>'userId'), updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_sender_id_updated
          ON app_documents (collection_name, (payload->>'senderId'), updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_platform_updated
          ON app_documents (collection_name, (payload->>'platform'), updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_bot_id_updated
          ON app_documents (collection_name, (payload->>'botId'), updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_instruction_id_updated
          ON app_documents (collection_name, (payload->>'instructionId'), updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_active_updated
          ON app_documents (collection_name, (payload->>'isActive'), updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_default_updated
          ON app_documents (collection_name, (payload->>'isDefault'), updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_asset_objects_scope_updated
          ON asset_objects (asset_scope, updated_at DESC)
      `);

      const currentMonth = createMonthRange(new Date()).start;
      const startMonth = addUtcMonths(
        currentMonth,
        -Math.max(2, Math.ceil(hotRetentionDays / 30) + 1),
      );
      const endMonth = addUtcMonths(currentMonth, 3);
      const months = [];
      for (
        let cursor = new Date(startMonth);
        cursor < endMonth;
        cursor = addUtcMonths(cursor, 1)
      ) {
        months.push(createMonthRange(cursor));
      }

      for (const month of months) {
        await query(`
          CREATE TABLE IF NOT EXISTS ${month.name}
          PARTITION OF chat_messages
          FOR VALUES FROM ('${escapePgLiteral(month.start.toISOString())}')
          TO ('${escapePgLiteral(month.end.toISOString())}')
        `);
      }
    })().finally(() => {
      ensureSchemaPromise = null;
    });

    return ensureSchemaPromise;
  }

  async function close() {
    if (!pool) return;
    const currentPool = pool;
    pool = null;
    await currentPool.end();
  }

  return {
    close,
    ensureSchema,
    getPool,
    isConfigured,
    query,
  };
}

module.exports = {
  createMonthRange,
  createPostgresRuntime,
};
