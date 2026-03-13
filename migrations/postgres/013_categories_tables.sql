CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id TEXT NOT NULL UNIQUE,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_bot_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_active_name
  ON categories (legacy_bot_id, platform, LOWER(name))
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_categories_bot_created_at
  ON categories (legacy_bot_id, platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_categories_active_created_at
  ON categories (is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS category_tables (
  category_id TEXT PRIMARY KEY REFERENCES categories(category_id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  legacy_bot_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_category_tables_bot_updated_at
  ON category_tables (legacy_bot_id, platform, updated_at DESC);
