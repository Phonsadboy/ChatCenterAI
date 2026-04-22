ALTER TABLE IF EXISTS instruction_chat_sessions
  ADD COLUMN IF NOT EXISTS last_response_id TEXT;
