const { ObjectId } = require("mongodb");
const { normalizePageKey, normalizePageKeys } = require("./agentForgeService");

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
}

function parsePageKey(pageKey) {
  const normalized = normalizePageKey(pageKey);
  if (!normalized) return null;
  const [platform, ...rest] = normalized.split(":");
  return {
    pageKey: normalized,
    platform,
    botId: rest.join(":") || null,
  };
}

function buildPageFilters(pageKeys = []) {
  const parsed = normalizePageKeys(pageKeys).map(parsePageKey).filter(Boolean);
  if (!parsed.length) {
    return [];
  }
  return parsed.map((item) => ({
    platform: item.platform,
    ...(item.botId ? { botId: item.botId } : {}),
  }));
}

function buildMongoPageFilter(filters = []) {
  if (!Array.isArray(filters) || filters.length === 0) {
    return null;
  }

  const conditions = filters.map((item) => {
    const condition = { platform: item.platform };
    if (item.botId) {
      const candidates = [String(item.botId)];
      const objectId = toObjectId(item.botId);
      if (objectId) {
        candidates.push(objectId);
      }
      condition.botId = { $in: candidates };
    }
    return condition;
  });

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
}

function matchesPageFilters(doc = {}, filters = []) {
  if (!Array.isArray(filters) || filters.length === 0) return true;
  const platform = String(doc.platform || "line").toLowerCase();
  const botId = doc.botId ? String(doc.botId) : null;
  return filters.some((filter) => {
    if (String(filter.platform || "line").toLowerCase() !== platform) {
      return false;
    }
    if (!filter.botId) return true;
    return String(filter.botId) === String(botId || "");
  });
}

function applySinglePageFilter(filter = {}, pageFilters = []) {
  if (!Array.isArray(pageFilters) || pageFilters.length !== 1) return filter;
  const page = pageFilters[0];
  if (page.platform) filter.platform = page.platform;
  if (page.botId) filter.botId = page.botId;
  return filter;
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function enforceWriteContract(input = {}) {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) {
    throw new Error("reason_required");
  }
  if (reason.length > 500) {
    throw new Error("reason_too_long");
  }
  return {
    reason,
    dryRun: !!input.dryRun,
    requestId: input.requestId ? String(input.requestId) : null,
  };
}

function parseMessageContent(content) {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function extractImageUrls(content) {
  const result = [];
  if (!content) return result;
  if (typeof content === "string") {
    const matches = content.match(/https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s"']*)?/gi) || [];
    return matches.slice(0, 10);
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item) continue;
      const nested = extractImageUrls(item);
      result.push(...nested);
      if (result.length >= 10) break;
    }
    return result.slice(0, 10);
  }

  if (typeof content === "object") {
    for (const [key, value] of Object.entries(content)) {
      if (["url", "image", "imageUrl", "thumbUrl", "fileUrl"].includes(key) && typeof value === "string") {
        if (/^https?:\/\//i.test(value)) {
          result.push(value);
        }
      } else {
        result.push(...extractImageUrls(value));
      }
      if (result.length >= 10) break;
    }
  }

  return result.slice(0, 10);
}

class AgentForgeTools {
  constructor(db, options = {}) {
    this.db = db;
    this.chatRepository = options.chatRepository || null;
    if (!this.chatRepository) {
      throw new Error("AgentForgeTools requires chatRepository");
    }
    this.threadsColl = db.collection("conversation_threads");
    this.assetsColl = db.collection("instruction_assets");
    this.collectionsColl = db.collection("image_collections");
    this.botsLineColl = db.collection("line_bots");
    this.botsFbColl = db.collection("facebook_bots");
    this.followUpAssetsColl = db.collection("follow_up_assets");
    this.agentImageImportColl = db.collection("agent_image_import_log");
  }

  async listCustomersBatch({
    pageKeys = [],
    limit = 20,
    cursor = null,
    since = null,
    until = null,
  } = {}) {
    const safeLimit = Math.max(1, Math.min(40, Number(limit) || 20));
    const filters = buildPageFilters(pageKeys);
    const parsedCursor = decodeCursor(cursor) || { offset: 0 };
    const offset = Math.max(0, Number(parsedCursor.offset) || 0);

    const query = {
      "stats.userMessages": { $gt: 0 },
    };
    const pageFilter = buildMongoPageFilter(filters);
    if (pageFilter) {
      Object.assign(query, pageFilter);
    }

    if (since || until) {
      const dateQuery = {};
      if (since) {
        const sinceDate = new Date(since);
        if (!Number.isNaN(sinceDate.getTime())) {
          dateQuery.$gte = sinceDate;
        }
      }
      if (until) {
        const untilDate = new Date(until);
        if (!Number.isNaN(untilDate.getTime())) {
          dateQuery.$lte = untilDate;
        }
      }
      if (Object.keys(dateQuery).length > 0) {
        query["stats.lastMessageAt"] = dateQuery;
      }
    }

    const [rows, total] = await Promise.all([
      this.threadsColl
        .find(query, {
          projection: {
            senderId: 1,
            platform: 1,
            botId: 1,
            "stats.firstMessageAt": 1,
            "stats.lastMessageAt": 1,
            "stats.userMessages": 1,
          },
        })
        .sort({ "stats.lastMessageAt": 1, senderId: 1, _id: 1 })
        .skip(offset)
        .limit(safeLimit)
        .toArray(),
      this.threadsColl.countDocuments(query),
    ]);

    const customers = rows.map((row) => {
      const platform = row.platform || "line";
      const botId = row.botId ? String(row.botId) : null;
      return {
        senderId: row.senderId || null,
        platform,
        botId,
        pageKey: `${platform}:${botId || "default"}`,
        lastMessageAt: row?.stats?.lastMessageAt || null,
        firstMessageAt: row?.stats?.firstMessageAt || null,
        userMessageCount: Number(row?.stats?.userMessages || 0),
      };
    });
    const nextOffset = offset + customers.length;

    return {
      customers,
      total,
      limit: safeLimit,
      offset,
      hasMore: nextOffset < total,
      nextCursor: nextOffset < total ? encodeCursor({ offset: nextOffset }) : null,
      toolStatus: "ok",
      latencyMs: 0,
      dataSizeBytes: Buffer.byteLength(JSON.stringify(customers), "utf8"),
      truncated: false,
    };
  }

  async getCustomerConversation({
    senderId,
    pageKey,
    platform,
    botId,
    maxMessages = 20,
    before = null,
    after = null,
  } = {}) {
    const safeMaxMessages = Math.max(1, Math.min(200, Number(maxMessages) || 20));

    if (!senderId) {
      return {
        toolStatus: "error",
        error: "senderId_required",
      };
    }

    let finalPlatform = platform;
    let finalBotId = botId;
    if (pageKey) {
      const parsed = parsePageKey(pageKey);
      if (parsed) {
        finalPlatform = parsed.platform;
        finalBotId = parsed.botId;
      }
    }

    const activityFilter = {
      userId: senderId,
    };
    if (finalPlatform) activityFilter.platform = finalPlatform;
    if (finalBotId) activityFilter.botId = finalBotId;
    if (before) {
      const parsedBefore = new Date(before);
      if (!Number.isNaN(parsedBefore.getTime())) {
        activityFilter.before = parsedBefore;
      }
    }
    if (after) {
      const parsedAfter = new Date(after);
      if (!Number.isNaN(parsedAfter.getTime())) {
        activityFilter.start = parsedAfter;
      }
    }

    const rawMessages = await this.chatRepository.listActivityMessages(activityFilter, {
      projection: {
        _id: 1,
        senderId: 1,
        role: 1,
        content: 1,
        timestamp: 1,
        platform: 1,
        botId: 1,
        source: 1,
      },
      sort: { timestamp: -1 },
      limit: safeMaxMessages,
    });

    const messages = rawMessages
      .reverse()
      .map((msg) => ({
        id: String(msg?._id || ""),
        senderId: msg.senderId,
        role: msg.role || "user",
        content: parseMessageContent(msg.content),
        timestamp: msg.timestamp,
        platform: msg.platform || null,
        botId: msg.botId ? String(msg.botId) : null,
        source: msg.source || null,
      }));

    const dataSizeBytes = Buffer.byteLength(JSON.stringify(messages), "utf8");

    return {
      senderId,
      pageKey: finalPlatform ? `${finalPlatform}:${finalBotId || "default"}` : null,
      messages,
      maxMessages: safeMaxMessages,
      toolStatus: "ok",
      latencyMs: 0,
      dataSizeBytes,
      truncated: rawMessages.length >= safeMaxMessages,
    };
  }

  async searchConversationsKeyword({
    keyword,
    pageKeys = [],
    limit = 50,
    senderId = null,
  } = {}) {
    const q = typeof keyword === "string" ? keyword.trim() : "";
    if (!q) {
      return {
        toolStatus: "error",
        error: "keyword_required",
      };
    }

    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const filters = buildPageFilters(pageKeys);

    const activityFilter = {
      contentRegex: q,
    };
    if (senderId) activityFilter.userId = senderId;
    applySinglePageFilter(activityFilter, filters);

    const fetchLimit = Math.max(safeLimit, Math.min(2000, safeLimit * 6));
    const rows = await this.chatRepository.listActivityMessages(activityFilter, {
      projection: {
        _id: 1,
        senderId: 1,
        role: 1,
        content: 1,
        timestamp: 1,
        platform: 1,
        botId: 1,
      },
      sort: { timestamp: -1 },
      limit: fetchLimit,
    });
    const filteredRows = (Array.isArray(rows) ? rows : [])
      .filter((row) => matchesPageFilters(row, filters))
      .slice(0, safeLimit);

    const results = filteredRows.map((row) => ({
      id: String(row?._id || ""),
      senderId: row.senderId,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      platform: row.platform,
      botId: row.botId || null,
      pageKey: `${row.platform || "line"}:${row.botId || "default"}`,
    }));

    return {
      keyword: q,
      results,
      count: results.length,
      toolStatus: "ok",
      latencyMs: 0,
      dataSizeBytes: Buffer.byteLength(JSON.stringify(results), "utf8"),
      truncated: filteredRows.length >= safeLimit,
    };
  }

  async searchConversationsRag({
    query,
    pageKeys = [],
    limit = 30,
  } = {}) {
    const q = typeof query === "string" ? query.trim() : "";
    if (!q) {
      return {
        toolStatus: "error",
        error: "query_required",
      };
    }

    const tokens = q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8);

    if (!tokens.length) {
      return {
        toolStatus: "error",
        error: "query_required",
      };
    }

    const filters = buildPageFilters(pageKeys);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const anchorToken = [...tokens].sort((left, right) => right.length - left.length)[0] || q;
    const activityFilter = {
      role: "user",
      contentRegex: anchorToken,
    };
    applySinglePageFilter(activityFilter, filters);

    const fetchLimit = Math.max(safeLimit, Math.min(2000, safeLimit * 8));
    const rows = await this.chatRepository.listActivityMessages(activityFilter, {
      projection: {
        _id: 1,
        senderId: 1,
        content: 1,
        timestamp: 1,
        platform: 1,
        botId: 1,
      },
      sort: { timestamp: -1 },
      limit: fetchLimit,
    });

    const results = (Array.isArray(rows) ? rows : [])
      .filter((row) => matchesPageFilters(row, filters))
      .map((row) => {
      const content = typeof row.content === "string" ? row.content : JSON.stringify(row.content);
      const lc = content.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (lc.includes(token)) score += 1;
      }
      if (score <= 0) return null;
      const normalizedScore = Number((score / tokens.length).toFixed(2));

      return {
        id: String(row?._id || ""),
        senderId: row.senderId,
        content,
        timestamp: row.timestamp,
        platform: row.platform,
        botId: row.botId || null,
        pageKey: `${row.platform || "line"}:${row.botId || "default"}`,
        score: normalizedScore,
      };
    })
      .filter(Boolean);

    results.sort((a, b) => b.score - a.score || new Date(b.timestamp) - new Date(a.timestamp));
    const limitedResults = results.slice(0, safeLimit);

    return {
      query: q,
      results: limitedResults,
      count: limitedResults.length,
      toolStatus: "ok",
      latencyMs: 0,
      dataSizeBytes: Buffer.byteLength(JSON.stringify(limitedResults), "utf8"),
      truncated: results.length > safeLimit,
    };
  }

  async listAdminEchoImages({ pageKeys = [], limit = 100 } = {}) {
    const filters = buildPageFilters(pageKeys);
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const activityFilter = {
      role: "assistant",
      sourceIn: ["admin_chat", "system", "ai", "follow_up"],
    };
    applySinglePageFilter(activityFilter, filters);

    const fetchLimit = Math.max(safeLimit, Math.min(3000, safeLimit * 10));
    const rows = await this.chatRepository.listActivityMessages(activityFilter, {
      projection: {
        _id: 1,
        senderId: 1,
        platform: 1,
        botId: 1,
        timestamp: 1,
        content: 1,
        source: 1,
      },
      sort: { timestamp: -1 },
      limit: fetchLimit,
    });

    const results = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!matchesPageFilters(row, filters)) continue;
      const parsed = parseMessageContent(row.content);
      const urls = extractImageUrls(parsed);
      if (!urls.length) continue;

      for (const url of urls.slice(0, 3)) {
        results.push({
          messageId: String(row?._id || ""),
          senderId: row.senderId,
          platform: row.platform,
          botId: row.botId || null,
          pageKey: `${row.platform || "line"}:${row.botId || "default"}`,
          timestamp: row.timestamp,
          imageUrl: url,
          source: row.source || null,
        });
      }

      if (results.length >= safeLimit) break;
    }

    return {
      results: results.slice(0, safeLimit),
      count: results.length,
      toolStatus: "ok",
      latencyMs: 0,
      dataSizeBytes: Buffer.byteLength(JSON.stringify(results), "utf8"),
      truncated: results.length >= safeLimit,
    };
  }

  async createImageCollection(input = {}) {
    const contract = enforceWriteContract(input);
    const now = new Date();

    const payload = {
      _id: `collection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: typeof input.name === "string" ? input.name.trim() : "",
      description: typeof input.description === "string" ? input.description.trim() : "",
      images: Array.isArray(input.images) ? input.images : [],
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      softDeletedAt: null,
      softDeletedBy: null,
      createdBy: input.createdBy || null,
      lastReason: contract.reason,
      deleteStatus: null,
    };

    if (!payload.name) {
      throw new Error("name_required");
    }

    if (contract.dryRun) {
      return {
        toolStatus: "ok",
        dryRun: true,
        preview: payload,
      };
    }

    await this.collectionsColl.insertOne(payload);
    return {
      toolStatus: "ok",
      collection: payload,
      dryRun: false,
    };
  }

  async updateImageCollection(collectionId, input = {}) {
    const contract = enforceWriteContract(input);
    const query = { _id: String(collectionId) };
    const existing = await this.collectionsColl.findOne(query);
    if (!existing) throw new Error("collection_not_found");

    const setDoc = {
      updatedAt: new Date(),
      lastReason: contract.reason,
    };

    if (typeof input.name === "string" && input.name.trim()) {
      setDoc.name = input.name.trim();
    }
    if (typeof input.description === "string") {
      setDoc.description = input.description.trim();
    }
    if (Array.isArray(input.images)) {
      setDoc.images = input.images;
    }

    if (contract.dryRun) {
      return {
        toolStatus: "ok",
        dryRun: true,
        preview: {
          ...existing,
          ...setDoc,
        },
      };
    }

    await this.collectionsColl.updateOne(query, { $set: setDoc });
    const updated = await this.collectionsColl.findOne(query);
    return {
      toolStatus: "ok",
      collection: updated,
      dryRun: false,
    };
  }

  async softDeleteImageCollection(collectionId, input = {}) {
    const contract = enforceWriteContract(input);
    const query = { _id: String(collectionId) };
    const existing = await this.collectionsColl.findOne(query);
    if (!existing) throw new Error("collection_not_found");

    const patch = {
      softDeletedAt: new Date(),
      softDeletedBy: input.deletedBy || null,
      deleteStatus: "pending",
      updatedAt: new Date(),
      deleteReason: contract.reason,
    };

    if (contract.dryRun) {
      return {
        toolStatus: "ok",
        dryRun: true,
        preview: {
          ...existing,
          ...patch,
        },
      };
    }

    await this.collectionsColl.updateOne(query, { $set: patch });
    return {
      toolStatus: "ok",
      dryRun: false,
      collectionId: String(collectionId),
      deleteStatus: "pending",
    };
  }

  async linkCollectionToPages(collectionId, pageKeys = [], input = {}) {
    const contract = enforceWriteContract(input);
    const normalizedKeys = normalizePageKeys(pageKeys);
    const updates = [];

    if (contract.dryRun) {
      return {
        toolStatus: "ok",
        dryRun: true,
        preview: {
          collectionId,
          pageKeys: normalizedKeys,
        },
      };
    }

    for (const key of normalizedKeys) {
      const parsed = parsePageKey(key);
      if (!parsed) continue;
      if (parsed.platform === "line") {
        await this.botsLineColl.updateOne(
          { _id: toObjectId(parsed.botId) || parsed.botId },
          {
            $addToSet: { selectedImageCollections: String(collectionId) },
            $set: { updatedAt: new Date(), agentForgeReason: contract.reason },
          },
        );
      } else {
        await this.botsFbColl.updateOne(
          { _id: toObjectId(parsed.botId) || parsed.botId },
          {
            $addToSet: { selectedImageCollections: String(collectionId) },
            $set: { updatedAt: new Date(), agentForgeReason: contract.reason },
          },
        );
      }
      updates.push({ pageKey: key, linked: true });
    }

    return {
      toolStatus: "ok",
      dryRun: false,
      updates,
    };
  }

  async importAdminEchoImageToLibrary({
    pageKey,
    messageId,
    name,
    description,
    reason,
    dryRun = false,
  } = {}) {
    const contract = enforceWriteContract({ reason, dryRun });

    const normalizedMessageId =
      typeof messageId === "string" && messageId.trim()
        ? messageId.trim()
        : messageId != null
          ? String(messageId)
          : "";
    if (!normalizedMessageId) throw new Error("invalid_message_id");

    const message = await this.chatRepository.findMessageById(normalizedMessageId);
    if (!message) throw new Error("message_not_found");
    const sourceMessageId = String(message._id || normalizedMessageId);

    const parsedContent = parseMessageContent(message.content);
    const urls = extractImageUrls(parsedContent);
    if (!urls.length) throw new Error("image_not_found_in_message");

    const targetUrl = urls[0];
    const assetDoc = {
      label: typeof name === "string" && name.trim() ? name.trim() : `Imported ${Date.now()}`,
      slug: `agent-import-${Date.now().toString(36)}`,
      description: typeof description === "string" ? description.trim() : "",
      url: targetUrl,
      thumbUrl: targetUrl,
      fileName: null,
      thumbFileName: null,
      importedAt: new Date(),
      importedBy: "agent_forge",
      source: "admin_echo",
      sourceMessageId,
      createdAt: new Date(),
      updatedAt: new Date(),
      deleteStatus: null,
      lastReason: contract.reason,
    };

    if (contract.dryRun) {
      return {
        toolStatus: "ok",
        dryRun: true,
        preview: assetDoc,
      };
    }

    const existing = await this.agentImageImportColl.findOne({
      pageKey: normalizePageKey(pageKey) || null,
      messageId: sourceMessageId,
    });

    if (existing) {
      return {
        toolStatus: "ok",
        dryRun: false,
        deduped: true,
        assetId: existing.assetId,
      };
    }

    const insertResult = await this.assetsColl.insertOne(assetDoc);

    await this.agentImageImportColl.insertOne({
      agentId: null,
      pageKey: normalizePageKey(pageKey) || null,
      messageId: sourceMessageId,
      assetId: insertResult.insertedId.toString(),
      status: "imported",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      toolStatus: "ok",
      dryRun: false,
      assetId: insertResult.insertedId.toString(),
      imageUrl: targetUrl,
    };
  }

  async softDeleteImageAsset(assetId, input = {}) {
    const contract = enforceWriteContract(input);
    const oid = toObjectId(assetId);
    if (!oid) throw new Error("invalid_asset_id");

    const existing = await this.assetsColl.findOne({ _id: oid });
    if (!existing) throw new Error("asset_not_found");

    const patch = {
      deleteStatus: "pending",
      softDeletedAt: new Date(),
      softDeletedBy: input.deletedBy || null,
      deleteReason: contract.reason,
      updatedAt: new Date(),
    };

    if (contract.dryRun) {
      return {
        toolStatus: "ok",
        dryRun: true,
        preview: {
          ...existing,
          ...patch,
        },
      };
    }

    await this.assetsColl.updateOne({ _id: oid }, { $set: patch });
    return {
      toolStatus: "ok",
      dryRun: false,
      assetId: oid.toString(),
      deleteStatus: "pending",
    };
  }

  async approveDeleteImageAsset(assetId, input = {}) {
    const contract = enforceWriteContract(input);
    const oid = toObjectId(assetId);
    if (!oid) throw new Error("invalid_asset_id");

    const existing = await this.assetsColl.findOne({ _id: oid });
    if (!existing) throw new Error("asset_not_found");

    const patch = {
      deleteStatus: "approved",
      approvedDeleteAt: new Date(),
      approvedDeleteBy: input.approvedBy || null,
      updatedAt: new Date(),
      approvalReason: contract.reason,
    };

    if (contract.dryRun) {
      return {
        toolStatus: "ok",
        dryRun: true,
        preview: {
          ...existing,
          ...patch,
        },
      };
    }

    await this.assetsColl.updateOne({ _id: oid }, { $set: patch });

    return {
      toolStatus: "ok",
      dryRun: false,
      assetId: oid.toString(),
      deleteStatus: "approved",
    };
  }

  async getSalesMetrics({ pageKeys = [], dateFrom = null, dateTo = null } = {}) {
    const filters = buildPageFilters(pageKeys);
    const query = filters.length > 0 ? { $or: filters } : {};

    if (dateFrom || dateTo) {
      query["stats.lastMessageAt"] = {};
      if (dateFrom) query["stats.lastMessageAt"].$gte = new Date(dateFrom);
      if (dateTo) query["stats.lastMessageAt"].$lte = new Date(dateTo);
    }

    const [totalConversations, purchasedCount] = await Promise.all([
      this.threadsColl.countDocuments(query),
      this.threadsColl.countDocuments({
        ...query,
        outcome: "purchased",
      }),
    ]);

    const conversionRate = totalConversations > 0
      ? Number(((purchasedCount / totalConversations) * 100).toFixed(2))
      : 0;

    return {
      totalConversations,
      purchasedCount,
      conversionRate,
      toolStatus: "ok",
      latencyMs: 0,
      dataSizeBytes: 0,
      truncated: false,
    };
  }
}

module.exports = {
  AgentForgeTools,
  enforceWriteContract,
  parsePageKey,
  buildPageFilters,
  encodeCursor,
  decodeCursor,
};
