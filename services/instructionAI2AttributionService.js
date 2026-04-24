const crypto = require("crypto");

const EPISODE_IDLE_MS = 48 * 60 * 60 * 1000;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function computeHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value || {})).digest("hex");
}

function buildThreadId(senderId, botId, platform) {
  const raw = `${senderId || ""}::${botId || "default"}::${platform || "line"}`;
  return "thread_" + crypto.createHash("md5").update(raw).digest("hex").slice(0, 16);
}

function normalizeInstructionAttributionRefs(instructionMeta = [], instructionRefs = []) {
  const merged = [];
  const seen = new Set();
  const push = (entry = {}) => {
    const instructionId = typeof entry.instructionId === "string" ? entry.instructionId.trim() : "";
    if (!instructionId) return;
    const version =
      Number.isInteger(entry.versionNumber) && entry.versionNumber > 0
        ? entry.versionNumber
        : Number.isInteger(entry.version) && entry.version > 0
          ? entry.version
          : null;
    const key = `${instructionId}:${version || "latest"}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({
      instructionId,
      instructionVersion: version,
      source: entry.source || (version ? "resolved" : "legacy"),
    });
  };
  (Array.isArray(instructionMeta) ? instructionMeta : []).forEach(push);
  (Array.isArray(instructionRefs) ? instructionRefs : []).forEach(push);
  return merged;
}

async function getOrCreateEpisode(db, payload = {}) {
  const {
    senderId,
    platform,
    botId,
    instructionId,
    messageAt = new Date(),
  } = payload;
  const episodeColl = db.collection("conversation_episodes");
  const threadId = buildThreadId(senderId, botId, platform);
  const lastEpisode = await episodeColl
    .find({ threadId, platform, botId: botId || null, customerId: senderId })
    .sort({ lastMessageAt: -1 })
    .limit(1)
    .next();
  const ts = messageAt instanceof Date ? messageAt : new Date(messageAt || Date.now());
  const shouldCreate =
    !lastEpisode ||
    !lastEpisode.lastMessageAt ||
    ts.getTime() - new Date(lastEpisode.lastMessageAt).getTime() > EPISODE_IDLE_MS;

  if (shouldCreate) {
    const episodeId = `ep_${crypto.createHash("md5").update(`${threadId}:${ts.getTime()}`).digest("hex").slice(0, 18)}`;
    const doc = {
      episodeId,
      threadId,
      customerId: senderId,
      platform,
      botId: botId || null,
      instructionId: instructionId || null,
      startedAt: ts,
      lastMessageAt: ts,
      messageCount: 0,
      assistantMessageCount: 0,
      userMessageCount: 0,
      finalOutcome: "unknown",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await episodeColl.insertOne(doc);
    return doc;
  }

  await episodeColl.updateOne(
    { episodeId: lastEpisode.episodeId },
    {
      $set: {
        lastMessageAt: ts,
        updatedAt: new Date(),
        ...(instructionId ? { instructionId } : {}),
      },
    },
  );
  return lastEpisode;
}

async function recordInstructionAI2MessageUsage(db, payload = {}) {
  const {
    userMessageDoc,
    assistantMessageDoc,
    instructionRefs = [],
    instructionMeta = [],
    model = null,
    reasoningEffort = null,
    toolCalls = [],
    orderIds = [],
  } = payload;

  if (!db || !assistantMessageDoc || !assistantMessageDoc._id) return null;
  const refs = normalizeInstructionAttributionRefs(instructionMeta, instructionRefs);
  if (!refs.length) return null;

  const primary = refs[0];
  const messageAt = assistantMessageDoc.timestamp || new Date();
  const episode = await getOrCreateEpisode(db, {
    senderId: assistantMessageDoc.senderId,
    platform: assistantMessageDoc.platform || "line",
    botId: assistantMessageDoc.botId || null,
    instructionId: primary.instructionId,
    messageAt,
  });

  let instructionHash = null;
  try {
    const inst = await db.collection("instructions_v2").findOne({ instructionId: primary.instructionId });
    if (inst) {
      instructionHash = computeHash({
        instructionId: inst.instructionId,
        version: inst.version || null,
        dataItems: inst.dataItems || [],
        conversationStarter: inst.conversationStarter || null,
      });
    }
  } catch (_) {
    instructionHash = null;
  }

  const usageDoc = {
    usageId: `usage_${assistantMessageDoc._id.toString()}`,
    threadId: buildThreadId(assistantMessageDoc.senderId, assistantMessageDoc.botId, assistantMessageDoc.platform),
    episodeId: episode.episodeId,
    userMessageId: userMessageDoc?._id?.toString?.() || null,
    messageId: assistantMessageDoc._id.toString(),
    platform: assistantMessageDoc.platform || "line",
    botId: assistantMessageDoc.botId || null,
    pageId: assistantMessageDoc.botId || null,
    customerId: assistantMessageDoc.senderId,
    instructionId: primary.instructionId,
    instructionVersion: primary.instructionVersion,
    instructionHash,
    model,
    reasoningEffort,
    role: "assistant",
    assistantAction: assistantMessageDoc.source || "ai",
    imageAssetIdsSent: [],
    toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
    orderIds: Array.isArray(orderIds) ? orderIds : [],
    outcomeAtMessage: Array.isArray(orderIds) && orderIds.length ? "ordered" : "unknown",
    instructionRefs: refs,
    createdAt: messageAt instanceof Date ? messageAt : new Date(messageAt),
    updatedAt: new Date(),
  };

  await db.collection("message_instruction_usage").updateOne(
    { usageId: usageDoc.usageId },
    { $set: usageDoc, $setOnInsert: { insertedAt: new Date() } },
    { upsert: true },
  );

  await db.collection("conversation_episodes").updateOne(
    { episodeId: episode.episodeId },
    {
      $inc: {
        messageCount: userMessageDoc?._id ? 2 : 1,
        assistantMessageCount: 1,
        userMessageCount: userMessageDoc?._id ? 1 : 0,
      },
      $set: {
        lastMessageAt: usageDoc.createdAt,
        instructionId: primary.instructionId,
        updatedAt: new Date(),
      },
      $addToSet: {
        instructionVersions: {
          instructionId: primary.instructionId,
          version: primary.instructionVersion,
        },
      },
    },
  );

  return usageDoc;
}

async function attributeOrderToLatestAssistantUsage(db, orderDoc = {}) {
  if (!db || !orderDoc) return null;
  const customerId = orderDoc.customerId || orderDoc.senderId || orderDoc.userId;
  const platform = orderDoc.platform || "line";
  const botId = orderDoc.botId || null;
  if (!customerId) return null;
  const createdAt = orderDoc.createdAt || orderDoc.created_at || new Date();
  const usage = await db.collection("message_instruction_usage")
    .find({
      customerId,
      platform,
      botId,
      role: "assistant",
      createdAt: { $lte: createdAt instanceof Date ? createdAt : new Date(createdAt) },
    })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
  if (!usage) return null;
  const orderId = orderDoc._id?.toString?.() || orderDoc.orderId || orderDoc.id || null;
  if (!orderId) return usage;
  await db.collection("message_instruction_usage").updateOne(
    { usageId: usage.usageId },
    {
      $addToSet: { orderIds: orderId },
      $set: {
        outcomeAtMessage: "ordered",
        conversionAttributedToMessageId: usage.messageId,
        conversionAttributedToVersion: usage.instructionVersion,
        updatedAt: new Date(),
      },
    },
  );
  return { ...usage, orderIds: [...(usage.orderIds || []), orderId] };
}

module.exports = {
  EPISODE_IDLE_MS,
  buildThreadId,
  normalizeInstructionAttributionRefs,
  recordInstructionAI2MessageUsage,
  attributeOrderToLatestAssistantUsage,
};
