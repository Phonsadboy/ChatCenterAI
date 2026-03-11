CREATE INDEX IF NOT EXISTS idx_messages_contact_time
  ON messages (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_legacy_contact_id
  ON contacts (legacy_contact_id);
