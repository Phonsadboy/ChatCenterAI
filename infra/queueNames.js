const QUEUE_NAMES = {
  WEBHOOK_INGEST: "webhook-ingest",
  CONVERSATION_FLUSH: "conversation-flush",
  OUTBOUND_SEND: "outbound-send",
  FOLLOWUP: "followup",
  BROADCAST: "broadcast",
  STATS_ROLLUP: "stats-rollup",
  MIGRATION_BACKFILL: "migration-backfill",
};

const JOB_NAMES = {
  CONVERSATION_FLUSH: "conversation-flush",
  WEBHOOK_EVENT: "webhook-event",
  FOLLOWUP_TICK: "followup-tick",
  BROADCAST_SEND: "broadcast-send",
  STATS_ROLLUP: "stats-rollup",
  NOTIFICATION_SUMMARY_TICK: "notification-summary-tick",
  AGENT_FORGE_TICK: "agent-forge-tick",
  MIGRATION_BATCH: "migration-batch",
};

module.exports = {
  JOB_NAMES,
  QUEUE_NAMES,
};
