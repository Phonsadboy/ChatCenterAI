CREATE TABLE IF NOT EXISTS facebook_comment_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_bot_id TEXT NOT NULL,
  page_id TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'page_default',
  mode TEXT NOT NULL DEFAULT 'off',
  template_message TEXT NOT NULL DEFAULT '',
  ai_model TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  private_reply_template TEXT NOT NULL DEFAULT '',
  pull_to_chat BOOLEAN NOT NULL DEFAULT FALSE,
  send_private_reply BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'off',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_bot_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_facebook_comment_policies_bot_status
  ON facebook_comment_policies (legacy_bot_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_facebook_comment_policies_page_scope
  ON facebook_comment_policies (page_id, scope);
