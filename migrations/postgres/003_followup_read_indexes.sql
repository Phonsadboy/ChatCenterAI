CREATE INDEX IF NOT EXISTS idx_follow_up_status_contact_updated
  ON follow_up_status (legacy_contact_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_contact_updated
  ON follow_up_tasks (legacy_contact_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_next_scheduled
  ON follow_up_tasks (next_scheduled_at, status);

CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_date_key
  ON follow_up_tasks ((payload->>'dateKey'));
