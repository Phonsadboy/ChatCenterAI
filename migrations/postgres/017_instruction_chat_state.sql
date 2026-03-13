CREATE TABLE IF NOT EXISTS instruction_chat_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  instruction_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tool TEXT NOT NULL DEFAULT '',
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_state JSONB,
  after_state JSONB,
  undone BOOLEAN NOT NULL DEFAULT FALSE,
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instruction_chat_changelog_session_timestamp
  ON instruction_chat_changelog (session_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_instruction_chat_changelog_instruction_timestamp
  ON instruction_chat_changelog (instruction_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS instruction_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  instruction_id TEXT NOT NULL,
  instruction_name TEXT NOT NULL DEFAULT '',
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  thinking TEXT,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_changes INTEGER NOT NULL DEFAULT 0,
  username TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instruction_chat_sessions_instruction_updated
  ON instruction_chat_sessions (instruction_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS instruction_chat_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  instruction_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT 'admin',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message TEXT NOT NULL DEFAULT '',
  model TEXT,
  thinking TEXT,
  effort TEXT,
  tools_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_length INTEGER NOT NULL DEFAULT 0,
  version_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instruction_chat_audit_instruction_timestamp
  ON instruction_chat_audit (instruction_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_instruction_chat_audit_session_timestamp
  ON instruction_chat_audit (session_id, timestamp DESC);
