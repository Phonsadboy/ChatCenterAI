CREATE INDEX IF NOT EXISTS idx_notification_channels_type_active
  ON notification_channels(channel_type, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_channels_sender_bot
  ON notification_channels((config->>'senderBotId'));

CREATE INDEX IF NOT EXISTS idx_notification_channels_group_id
  ON notification_channels((COALESCE(config->>'groupId', config->>'lineGroupId')));

CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at
  ON notification_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_status_created_at
  ON notification_logs(status, created_at DESC);
