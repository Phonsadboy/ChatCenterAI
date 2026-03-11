const { normalizePlatform, toLegacyId } = require("./shared");

async function resolvePgBotId(executor, platform, botId) {
  if (!platform) return null;
  const legacyBotId = toLegacyId(botId);
  if (!legacyBotId) return null;

  const result = await executor.query(
    "SELECT id FROM bots WHERE platform = $1 AND legacy_bot_id = $2 LIMIT 1",
    [normalizePlatform(platform), legacyBotId],
  );
  return result.rows[0]?.id || null;
}

module.exports = {
  resolvePgBotId,
};
