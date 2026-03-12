CREATE INDEX IF NOT EXISTS idx_messages_thread_time
  ON messages (thread_id, created_at DESC, id DESC);
