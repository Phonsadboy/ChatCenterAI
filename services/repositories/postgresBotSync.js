const { normalizeJson, normalizePlatform, toLegacyId } = require("./shared");

function resolveBotName(platform, doc = {}) {
  const normalizedPlatform = normalizePlatform(platform);
  if (normalizedPlatform === "facebook") {
    return doc.pageName || doc.name || doc.displayName || "";
  }
  if (normalizedPlatform === "instagram") {
    return (
      doc.name ||
      doc.instagramUsername ||
      doc.username ||
      doc.instagramUserId ||
      doc.igUserId ||
      ""
    );
  }
  if (normalizedPlatform === "whatsapp") {
    return doc.name || doc.displayName || doc.phoneNumber || doc.phoneNumberId || "";
  }
  return doc.name || doc.displayName || doc.botName || "";
}

function resolveLegacyBotId(doc = {}) {
  return (
    toLegacyId(doc?._id) ||
    toLegacyId(doc?.pageId) ||
    toLegacyId(doc?.phoneNumberId) ||
    toLegacyId(doc?.instagramBusinessAccountId)
  );
}

function extractBotSecrets(doc = {}) {
  const secrets = {};
  for (const [key, value] of Object.entries(doc || {})) {
    if (!/(token|secret)/i.test(key)) continue;
    secrets[key] = value ?? null;
  }
  if (typeof doc.verifyToken === "string" && doc.verifyToken.trim()) {
    secrets.verifyToken = doc.verifyToken.trim();
  }
  return secrets;
}

async function upsertPostgresBotDocument(executor, platform, doc = {}) {
  const normalizedPlatform = normalizePlatform(platform);
  const legacyBotId = resolveLegacyBotId(doc);
  if (!legacyBotId) return null;

  const name = resolveBotName(normalizedPlatform, doc) || legacyBotId;
  const result = await executor.query(
    `
      INSERT INTO bots (
        platform,
        legacy_bot_id,
        name,
        status,
        ai_model,
        ai_config,
        keyword_settings,
        selected_instructions,
        selected_image_collections,
        config,
        created_at,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12
      )
      ON CONFLICT (platform, legacy_bot_id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        ai_model = EXCLUDED.ai_model,
        ai_config = EXCLUDED.ai_config,
        keyword_settings = EXCLUDED.keyword_settings,
        selected_instructions = EXCLUDED.selected_instructions,
        selected_image_collections = EXCLUDED.selected_image_collections,
        config = EXCLUDED.config,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
    [
      normalizedPlatform,
      legacyBotId,
      name,
      doc?.status || "active",
      doc?.aiModel || null,
      JSON.stringify(normalizeJson(doc?.aiConfig, {})),
      JSON.stringify(normalizeJson(doc?.keywordSettings, {})),
      JSON.stringify(Array.isArray(doc?.selectedInstructions) ? doc.selectedInstructions : []),
      JSON.stringify(
        Array.isArray(doc?.selectedImageCollections)
          ? doc.selectedImageCollections
          : [],
      ),
      JSON.stringify(normalizeJson(doc, {})),
      doc?.createdAt || new Date(),
      doc?.updatedAt || doc?.createdAt || new Date(),
    ],
  );

  await executor.query(
    `
      INSERT INTO bot_secrets (bot_id, secrets, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (bot_id) DO UPDATE SET
        secrets = EXCLUDED.secrets,
        updated_at = EXCLUDED.updated_at
    `,
    [result.rows[0].id, JSON.stringify(extractBotSecrets(doc))],
  );

  return result.rows[0].id;
}

async function deletePostgresBotByLegacyId(executor, platform, botId) {
  const normalizedPlatform = normalizePlatform(platform);
  const legacyBotId = toLegacyId(botId);
  if (!legacyBotId) return;
  await executor.query(
    "DELETE FROM bots WHERE platform = $1 AND legacy_bot_id = $2",
    [normalizedPlatform, legacyBotId],
  );
}

module.exports = {
  deletePostgresBotByLegacyId,
  extractBotSecrets,
  resolveBotName,
  resolveLegacyBotId,
  upsertPostgresBotDocument,
};
