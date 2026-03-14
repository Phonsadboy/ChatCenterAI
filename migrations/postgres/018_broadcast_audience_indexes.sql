CREATE INDEX IF NOT EXISTS idx_orders_platform_user
  ON orders (platform, legacy_user_id);

CREATE INDEX IF NOT EXISTS idx_orders_user
  ON orders (legacy_user_id);

CREATE INDEX IF NOT EXISTS idx_orders_bot_user
  ON orders (bot_id, legacy_user_id);
