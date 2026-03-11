const { isPostgresConfigured, query, withTransaction } = require("../../infra/postgres");
const { normalizeJson, normalizePlatform, toLegacyId } = require("./shared");

function createWebhookEventRepository({ runtimeConfig }) {
  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  async function resolvePgBotId(platform, botId) {
    const normalizedPlatform = normalizePlatform(platform);
    const legacyBotId = toLegacyId(botId);
    if (!legacyBotId) return null;

    const result = await query(
      "SELECT id FROM bots WHERE platform = $1 AND legacy_bot_id = $2 LIMIT 1",
      [normalizedPlatform, legacyBotId],
    );
    return result.rows[0]?.id || null;
  }

  async function recordReceived({
    platform,
    botId = null,
    eventType = "webhook",
    payload = {},
    idempotencyKey,
    receivedAt = new Date(),
  }) {
    if (!canUsePostgres()) return false;
    if (!idempotencyKey) return false;

    const pgBotId = await resolvePgBotId(platform, botId).catch(() => null);
    return withTransaction(async (client) => {
      const dedupeInsert = await client.query(
        `
          INSERT INTO webhook_event_idempotency (
            idempotency_key,
            first_received_at,
            last_received_at
          ) VALUES ($1,$2,$2)
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING idempotency_key
        `,
        [idempotencyKey, receivedAt],
      );

      if (dedupeInsert.rowCount === 0) {
        await client.query(
          `
            UPDATE webhook_event_idempotency
            SET last_received_at = GREATEST(last_received_at, $2)
            WHERE idempotency_key = $1
          `,
          [idempotencyKey, receivedAt],
        );
        return false;
      }

      await client.query(
        `
          INSERT INTO webhook_events (
            idempotency_key,
            platform,
            bot_id,
            event_type,
            raw_payload,
            status,
            received_at
          ) VALUES ($1,$2,$3,$4,$5::jsonb,'received',$6)
        `,
        [
          idempotencyKey,
          normalizePlatform(platform),
          pgBotId,
          eventType,
          JSON.stringify(normalizeJson(payload, {})),
          receivedAt,
        ],
      );
      return true;
    });
  }

  async function markProcessed(idempotencyKey, status = "processed") {
    if (!canUsePostgres()) return false;
    if (!idempotencyKey) return false;

    await query(
      `
        UPDATE webhook_events
        SET status = $2, processed_at = NOW()
        WHERE idempotency_key = $1
      `,
      [idempotencyKey, status],
    );
    return true;
  }

  return {
    markProcessed,
    recordReceived,
  };
}

module.exports = {
  createWebhookEventRepository,
};
