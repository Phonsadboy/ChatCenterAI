const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const { normalizeJson, normalizePlatform, toLegacyId } = require("./shared");

function createOutboundMessageRepository({ runtimeConfig }) {
  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  async function enqueue(entry = {}) {
    if (!canUsePostgres()) return null;

    const platform = normalizePlatform(entry?.platform);
    const pgBotId = await resolvePgBotId({ query }, platform, entry?.botId).catch(() => null);
    const result = await query(
      `
        INSERT INTO outbound_messages (
          bot_id,
          platform,
          legacy_contact_id,
          transport,
          status,
          message_text,
          payload,
          queued_at
        ) VALUES ($1,$2,$3,$4,'queued',$5,$6::jsonb,$7)
        RETURNING id
      `,
      [
        pgBotId,
        platform,
        toLegacyId(entry?.userId || entry?.recipientId),
        entry?.transport || "platform-api",
        entry?.messageText || null,
        JSON.stringify(normalizeJson(entry?.payload, {})),
        entry?.queuedAt || new Date(),
      ],
    );
    return result.rows[0] || null;
  }

  async function markSent(id, details = {}) {
    if (!canUsePostgres() || !id) return false;
    await query(
      `
        UPDATE outbound_messages
        SET
          status = 'sent',
          provider_message_id = COALESCE($2, provider_message_id),
          payload = CASE
            WHEN $3::jsonb IS NULL THEN payload
            ELSE payload || $3::jsonb
          END,
          sent_at = NOW()
        WHERE id = $1
      `,
      [id, details?.providerMessageId || null, details?.payload ? JSON.stringify(details.payload) : null],
    );
    return true;
  }

  async function markFailed(id, details = {}) {
    if (!canUsePostgres() || !id) return false;
    await query(
      `
        UPDATE outbound_messages
        SET
          status = 'failed',
          retry_count = retry_count + 1,
          payload = payload || $2::jsonb,
          failed_at = NOW()
        WHERE id = $1
      `,
      [
        id,
        JSON.stringify({
          error: details?.error || "unknown_error",
          failedAt: new Date().toISOString(),
        }),
      ],
    );
    return true;
  }

  return {
    enqueue,
    markFailed,
    markSent,
  };
}

module.exports = {
  createOutboundMessageRepository,
};
