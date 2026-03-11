CREATE TABLE IF NOT EXISTS follow_up_page_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  legacy_bot_id TEXT NOT NULL DEFAULT '',
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, legacy_bot_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_up_page_settings_platform_updated
  ON follow_up_page_settings (platform, updated_at DESC);
