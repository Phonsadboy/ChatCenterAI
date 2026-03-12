CREATE TABLE IF NOT EXISTS user_notes (
  user_id TEXT PRIMARY KEY,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_updated_at
  ON user_notes (updated_at DESC);
