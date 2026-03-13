CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL UNIQUE,
  sender_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'line',
  legacy_bot_id TEXT,
  bot_name TEXT,
  instruction_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  instruction_meta JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  has_order BOOLEAN NOT NULL DEFAULT FALSE,
  order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ordered_products JSONB NOT NULL DEFAULT '[]'::jsonb,
  order_status TEXT,
  total_order_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'unknown',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_instruction_refs
  ON conversation_threads USING GIN (instruction_refs);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_instruction_meta
  ON conversation_threads USING GIN (instruction_meta);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_tags
  ON conversation_threads USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_products
  ON conversation_threads USING GIN (ordered_products);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_sender_bot_platform
  ON conversation_threads (sender_id, legacy_bot_id, platform);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_outcome_updated
  ON conversation_threads (outcome, updated_at DESC);
