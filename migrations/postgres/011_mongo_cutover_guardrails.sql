ALTER TABLE short_links
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hit_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_short_links_target_url
  ON short_links (target_url);

CREATE TABLE IF NOT EXISTS line_bot_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_bot_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  source_type TEXT,
  group_name TEXT,
  picture_url TEXT,
  member_count INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_bot_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_line_bot_groups_bot_status_event
  ON line_bot_groups (legacy_bot_id, status, last_event_at DESC);

ALTER TABLE follow_up_status
  ADD COLUMN IF NOT EXISTS legacy_bot_id TEXT,
  ADD COLUMN IF NOT EXISTS bot_scope TEXT NOT NULL DEFAULT '';

UPDATE follow_up_status s
SET
  legacy_bot_id = COALESCE(s.legacy_bot_id, b.legacy_bot_id),
  bot_scope = COALESCE(s.legacy_bot_id, b.legacy_bot_id, '')
FROM bots b
WHERE s.bot_id = b.id;

UPDATE follow_up_status
SET bot_scope = COALESCE(legacy_bot_id, '')
WHERE bot_scope = '';

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY platform, bot_scope, legacy_contact_id
      ORDER BY updated_at DESC, id DESC
    ) AS row_number
  FROM follow_up_status
)
DELETE FROM follow_up_status
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE row_number > 1
);

ALTER TABLE follow_up_status
  DROP CONSTRAINT IF EXISTS follow_up_status_platform_bot_id_legacy_contact_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_status_scope
  ON follow_up_status (platform, bot_scope, legacy_contact_id);
