CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  legacy_bot_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  ai_model TEXT,
  ai_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  keyword_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_image_collections JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, legacy_bot_id)
);

CREATE TABLE IF NOT EXISTS bot_secrets (
  bot_id UUID PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
  secrets JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  legacy_contact_id TEXT NOT NULL,
  display_name TEXT,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, legacy_contact_id)
);

CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  legacy_thread_key TEXT NOT NULL UNIQUE,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_message_id TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  role TEXT NOT NULL,
  source TEXT,
  content_text TEXT,
  content JSONB,
  instruction_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  instruction_meta JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, created_at),
  UNIQUE (legacy_message_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS messages_default PARTITION OF messages DEFAULT;

DO $$
DECLARE
  month_start DATE := date_trunc('month', NOW())::date;
  next_month DATE := (date_trunc('month', NOW()) + interval '1 month')::date;
  partition_name TEXT := 'messages_' || to_char(month_start, 'YYYYMM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF messages FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    month_start,
    next_month
  );
END $$;

CREATE TABLE IF NOT EXISTS message_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  message_created_at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  storage_key TEXT,
  url TEXT,
  mime_type TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (message_id, message_created_at) REFERENCES messages(id, created_at) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_order_id TEXT NOT NULL UNIQUE,
  legacy_user_id TEXT,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL DEFAULT 0,
  product_name TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(18, 2) NOT NULL DEFAULT 0,
  price NUMERIC(18, 2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_instruction_id TEXT UNIQUE,
  source_kind TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'instruction',
  content TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  conversation_starter JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruction_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_version_id TEXT UNIQUE,
  legacy_instruction_id TEXT,
  instruction_id UUID REFERENCES instructions(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruction_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_asset_id TEXT UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  slug TEXT,
  description TEXT NOT NULL DEFAULT '',
  storage_key TEXT,
  thumb_storage_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_collection_id TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_collection_items (
  id BIGSERIAL PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES image_collections(id) ON DELETE CASCADE,
  legacy_asset_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_task_id TEXT UNIQUE,
  platform TEXT,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_contact_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follow_up_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_contact_id TEXT NOT NULL,
  status JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, bot_id, legacy_contact_id)
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_channel_id TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  channel_type TEXT NOT NULL DEFAULT 'line',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_log_id TEXT UNIQUE,
  channel_id UUID REFERENCES notification_channels(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_key_id TEXT UNIQUE,
  provider TEXT NOT NULL DEFAULT 'openai',
  name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  platform TEXT,
  legacy_log_id TEXT,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS usage_logs_default PARTITION OF usage_logs DEFAULT;

DO $$
DECLARE
  month_start DATE := date_trunc('month', NOW())::date;
  next_month DATE := (date_trunc('month', NOW()) + interval '1 month')::date;
  partition_name TEXT := 'usage_logs_' || to_char(month_start, 'YYYYMM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF usage_logs FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    month_start,
    next_month
  );
END $$;

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  platform TEXT NOT NULL,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);

CREATE TABLE IF NOT EXISTS webhook_events_default PARTITION OF webhook_events DEFAULT;

CREATE TABLE IF NOT EXISTS webhook_event_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  first_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  month_start DATE := date_trunc('month', NOW())::date;
  next_month DATE := (date_trunc('month', NOW()) + interval '1 month')::date;
  partition_name TEXT := 'webhook_events_' || to_char(month_start, 'YYYYMM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF webhook_events FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    month_start,
    next_month
  );
END $$;

CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  legacy_contact_id TEXT,
  transport TEXT NOT NULL DEFAULT 'platform-api',
  status TEXT NOT NULL DEFAULT 'queued',
  message_text TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS short_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migration_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threads_contact ON threads(contact_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread_time ON messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_platform_time ON orders(platform, extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_bot_time ON usage_logs(bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_platform_time ON webhook_events(platform, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency_key ON webhook_events(idempotency_key);
