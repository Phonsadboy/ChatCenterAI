CREATE INDEX IF NOT EXISTS idx_contacts_legacy_contact_updated
  ON contacts (legacy_contact_id, updated_at DESC);
