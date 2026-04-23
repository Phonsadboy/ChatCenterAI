const { isPostgresConfigured, query, withTransaction } = require("../../infra/postgres");
const {
  normalizeJson,
  normalizePlatform,
  safeStringify,
  toLegacyId,
} = require("./shared");

function parseEnvBoolean(value, defaultValue = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseWebhookAuditMode(value, defaultValue = "all") {
  if (typeof value !== "string") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["all", "fallback_only", "none"].includes(normalized)) {
    return normalized;
  }
  return defaultValue;
}

const WEBHOOK_EVENT_STORE_RAW_PAYLOAD = parseEnvBoolean(
  process.env.CCAI_WEBHOOK_EVENT_STORE_RAW_PAYLOAD,
  false,
);
const WEBHOOK_EVENT_AUDIT_MODE = parseWebhookAuditMode(
  process.env.CCAI_WEBHOOK_EVENT_AUDIT_MODE,
  "all",
);
const WEBHOOK_EVENT_PAYLOAD_MAX_BYTES = Math.max(
  512,
  Number(process.env.CCAI_WEBHOOK_EVENT_PAYLOAD_MAX_BYTES || 4096),
);

function summarizeWebhookPayload(payload = {}) {
  const normalized = normalizeJson(payload, {});
  if (WEBHOOK_EVENT_STORE_RAW_PAYLOAD) {
    return normalized;
  }

  const serialized = safeStringify(normalized);
  const topLevelKeys =
    normalized && typeof normalized === "object" && !Array.isArray(normalized)
      ? Object.keys(normalized).slice(0, 32)
      : [];

  return {
    summarized: true,
    serializedBytes: Buffer.byteLength(serialized || "", "utf8"),
    topLevelKeys,
    object:
      typeof normalized?.object === "string" ? normalized.object : null,
    entryCount: Array.isArray(normalized?.entry) ? normalized.entry.length : null,
    preview: serialized.slice(0, WEBHOOK_EVENT_PAYLOAD_MAX_BYTES),
  };
}

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
    useDatabaseDedupe = false,
  }) {
    if (!canUsePostgres()) return false;
    if (!idempotencyKey) return false;

    const pgBotId = await resolvePgBotId(platform, botId).catch(() => null);
    const normalizedPlatform = normalizePlatform(platform);
    const storedPayload = JSON.stringify(summarizeWebhookPayload(payload));
    const shouldWriteAuditRow =
      WEBHOOK_EVENT_AUDIT_MODE === "all"
      || (
        useDatabaseDedupe
        && WEBHOOK_EVENT_AUDIT_MODE === "fallback_only"
      );

    if (!useDatabaseDedupe) {
      if (!shouldWriteAuditRow) {
        return true;
      }
      await query(
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
          normalizedPlatform,
          pgBotId,
          eventType,
          storedPayload,
          receivedAt,
        ],
      );
      return true;
    }

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

      if (shouldWriteAuditRow) {
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
            normalizedPlatform,
            pgBotId,
            eventType,
            storedPayload,
            receivedAt,
          ],
        );
      }
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
