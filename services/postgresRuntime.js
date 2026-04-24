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
        CREATE TABLE IF NOT EXISTS chat_conversation_heads (
          platform text NOT NULL DEFAULT 'line',
          bot_id text NOT NULL DEFAULT 'default',
          user_id text NOT NULL,
          last_message_id text,
          last_message_at timestamptz,
          last_message_content text,
          last_message_preview text,
          last_role text,
          message_count integer NOT NULL DEFAULT 0,
          unread_count integer NOT NULL DEFAULT 0,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (platform, bot_id, user_id)
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
        CREATE TABLE IF NOT EXISTS orders (
          id text PRIMARY KEY,
          user_id text,
          platform text NOT NULL DEFAULT 'line',
          bot_id text,
          status text NOT NULL DEFAULT 'pending',
          total_amount numeric(14, 2),
          shipping_cost numeric(14, 2),
          order_data jsonb NOT NULL DEFAULT '{}'::jsonb,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          notes text,
          is_manual_extraction boolean NOT NULL DEFAULT false,
          extracted_from text,
          extracted_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          user_id text NOT NULL,
          platform text NOT NULL DEFAULT 'line',
          display_name text,
          picture_url text,
          status_message text,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, platform)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS user_tags (
          user_id text PRIMARY KEY,
          tags jsonb NOT NULL DEFAULT '[]'::jsonb,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS user_purchase_status (
          user_id text PRIMARY KEY,
          has_purchased boolean NOT NULL DEFAULT false,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS user_unread_counts (
          user_id text PRIMARY KEY,
          unread_count integer NOT NULL DEFAULT 0,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS active_user_status (
          sender_id text PRIMARY KEY,
          ai_enabled boolean NOT NULL DEFAULT true,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS follow_up_status (
          sender_id text PRIMARY KEY,
          has_follow_up boolean NOT NULL DEFAULT false,
          follow_up_reason text,
          last_analyzed_at timestamptz,
          follow_up_updated_at timestamptz,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS follow_up_tasks (
          id text PRIMARY KEY,
          user_id text,
          platform text NOT NULL DEFAULT 'line',
          bot_id text,
          next_scheduled_at timestamptz,
          next_round_index integer,
          canceled boolean NOT NULL DEFAULT false,
          completed boolean NOT NULL DEFAULT false,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS openai_usage_logs (
          id text PRIMARY KEY,
          api_key_id text,
          bot_id text,
          platform text,
          provider text,
          model text,
          function_name text,
          prompt_tokens bigint NOT NULL DEFAULT 0,
          completion_tokens bigint NOT NULL DEFAULT 0,
          cached_prompt_tokens bigint NOT NULL DEFAULT 0,
          reasoning_tokens bigint NOT NULL DEFAULT 0,
          total_tokens bigint NOT NULL DEFAULT 0,
          estimated_cost numeric(18, 8),
          usage_at timestamptz NOT NULL,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS instruction_headers (
          id text PRIMARY KEY,
          title text,
          status text,
          is_active boolean,
          is_default boolean,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS instruction_data_items (
          id text PRIMARY KEY,
          instruction_id text,
          item_type text,
          title text,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS order_daily_metrics (
          metric_date date NOT NULL,
          platform text NOT NULL DEFAULT 'line',
          bot_id text NOT NULL DEFAULT 'default',
          status text NOT NULL DEFAULT 'unknown',
          order_count bigint NOT NULL DEFAULT 0,
          total_amount numeric(18, 2) NOT NULL DEFAULT 0,
          total_shipping numeric(18, 2) NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (metric_date, platform, bot_id, status)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS order_page_metrics (
          platform text NOT NULL DEFAULT 'line',
          bot_id text NOT NULL DEFAULT 'default',
          first_order_at timestamptz,
          last_order_at timestamptz,
          order_count bigint NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (platform, bot_id)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS openai_usage_daily (
          usage_date date NOT NULL,
          provider text NOT NULL DEFAULT 'openai',
          model text NOT NULL DEFAULT 'unknown',
          platform text NOT NULL DEFAULT 'unknown',
          bot_id text NOT NULL DEFAULT 'default',
          call_count bigint NOT NULL DEFAULT 0,
          prompt_tokens bigint NOT NULL DEFAULT 0,
          completion_tokens bigint NOT NULL DEFAULT 0,
          total_tokens bigint NOT NULL DEFAULT 0,
          estimated_cost numeric(18, 8) NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (usage_date, provider, model, platform, bot_id)
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
        CREATE INDEX IF NOT EXISTS idx_chat_conversation_heads_last_message_at
          ON chat_conversation_heads (last_message_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_chat_conversation_heads_last_message_at_nulls_last
          ON chat_conversation_heads (last_message_at DESC NULLS LAST)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_chat_conversation_heads_user_last
          ON chat_conversation_heads (user_id, last_message_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_orders_extracted_at
          ON orders (extracted_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_orders_extracted_at_nulls_last
          ON orders (extracted_at DESC NULLS LAST)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_orders_status_extracted_at
          ON orders (status, extracted_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_orders_user_extracted_at
          ON orders (user_id, extracted_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_orders_platform_bot_extracted_at
          ON orders (platform, bot_id, extracted_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_active_user_next
          ON follow_up_tasks (user_id, next_scheduled_at ASC, updated_at DESC)
          WHERE canceled = false AND completed = false
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_openai_usage_logs_usage_at
          ON openai_usage_logs (usage_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_openai_usage_logs_key_usage_at
          ON openai_usage_logs (api_key_id, usage_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_openai_usage_logs_bot_usage_at
          ON openai_usage_logs (platform, bot_id, usage_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_openai_usage_logs_model_usage_at
          ON openai_usage_logs (provider, model, usage_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_instruction_headers_updated
          ON instruction_headers (updated_at DESC)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_instruction_data_items_instruction_updated
          ON instruction_data_items (instruction_id, updated_at DESC)
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
