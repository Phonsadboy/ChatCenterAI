CREATE TABLE IF NOT EXISTS admin_passcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_passcode_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  code_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  last_used_at TIMESTAMPTZ,
  last_used_from TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_passcodes_active
  ON admin_passcodes (is_active);

CREATE INDEX IF NOT EXISTS idx_admin_passcodes_created_at
  ON admin_passcodes (created_at DESC);

CREATE TABLE IF NOT EXISTS user_unread_counts (
  user_id TEXT PRIMARY KEY,
  unread_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_flow_history (
  sender_id TEXT PRIMARY KEY,
  flow TEXT,
  product_service_type TEXT,
  existing_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_info JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_steps TEXT,
  last_analyzed TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_job_id TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_history_updated_at
  ON broadcast_history (updated_at DESC);
