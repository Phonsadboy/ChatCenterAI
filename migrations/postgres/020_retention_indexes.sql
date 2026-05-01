CREATE INDEX IF NOT EXISTS idx_outbound_messages_retention
  ON outbound_messages ((COALESCE(sent_at, failed_at, queued_at)))
  WHERE status IN ('sent', 'failed');

CREATE INDEX IF NOT EXISTS idx_active_user_status_disabled_updated
  ON active_user_status (updated_at, legacy_contact_id)
  WHERE ai_enabled = false;

CREATE INDEX IF NOT EXISTS idx_messages_default_contact_created
  ON messages_default (contact_id, created_at ASC, id ASC);
