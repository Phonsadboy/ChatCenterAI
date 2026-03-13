const MIGRATION_NAME = "chat_history_sender_id_backfill";

async function migrateChatHistorySenderId(db, options = {}) {
  return {
    skipped: true,
    retired: true,
    reason: "legacy chat_history migration retired after PostgreSQL cutover",
  };
}

module.exports = { migrateChatHistorySenderId, MIGRATION_NAME };
