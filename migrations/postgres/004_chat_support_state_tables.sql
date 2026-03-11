CREATE TABLE IF NOT EXISTS active_user_status (
  legacy_contact_id TEXT PRIMARY KEY,
  ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_tags (
  legacy_contact_id TEXT PRIMARY KEY,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_purchase_status (
  legacy_contact_id TEXT PRIMARY KEY,
  has_purchased BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_legacy_id TEXT NOT NULL UNIQUE,
  legacy_contact_id TEXT,
  sender_id TEXT,
  sender_role TEXT,
  platform TEXT,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  feedback TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_user_status_updated
  ON active_user_status (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_purchase_status_updated
  ON user_purchase_status (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_feedback_contact_updated
  ON chat_feedback (legacy_contact_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_feedback_platform_updated
  ON chat_feedback (platform, updated_at DESC);
