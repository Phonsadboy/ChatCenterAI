CREATE TABLE IF NOT EXISTS facebook_page_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_bot_id TEXT NOT NULL,
  page_id TEXT NOT NULL DEFAULT '',
  post_id TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  permalink TEXT NOT NULL DEFAULT '',
  created_time TIMESTAMPTZ,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_type TEXT,
  full_picture TEXT,
  reply_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  comment_count INTEGER NOT NULL DEFAULT 0,
  captured_from TEXT NOT NULL DEFAULT 'webhook',
  pulled_to_chat BOOLEAN NOT NULL DEFAULT FALSE,
  last_comment_at TIMESTAMPTZ,
  last_reply_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_bot_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_facebook_page_posts_bot_created
  ON facebook_page_posts (legacy_bot_id, created_time DESC, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_facebook_page_posts_page_comment
  ON facebook_page_posts (page_id, last_comment_at DESC);

CREATE TABLE IF NOT EXISTS facebook_comment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_bot_id TEXT NOT NULL DEFAULT '',
  page_id TEXT NOT NULL DEFAULT '',
  post_id TEXT NOT NULL DEFAULT '',
  comment_id TEXT NOT NULL UNIQUE,
  comment_text TEXT NOT NULL DEFAULT '',
  commenter_id TEXT NOT NULL DEFAULT '',
  commenter_name TEXT NOT NULL DEFAULT '',
  reply_mode TEXT,
  reply_text TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facebook_comment_events_post_created
  ON facebook_comment_events (post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_facebook_comment_events_bot_action
  ON facebook_comment_events (legacy_bot_id, action, created_at DESC);
