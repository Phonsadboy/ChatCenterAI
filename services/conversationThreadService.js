/**
 * Conversation Thread Service
 * Aggregates and manages conversation threads for InstructionAI analytics.
 * Threads group chat_history messages by senderId+botId+platform,
 * enriched with instruction refs, order data, and auto-tags.
 */

const crypto = require("crypto");

class ConversationThreadService {
  constructor(db, options = {}) {
    this.db = db || null;
    this.threadRepository = options.conversationThreadRepository || null;
    this.chatRepository = options.chatRepository || null;
    this.orderRepository = options.orderRepository || null;
    this.botRepository = options.botRepository || null;

    if (!this.threadRepository) {
      throw new Error(
        "ConversationThreadService requires conversationThreadRepository",
      );
    }
    if (!this.chatRepository || !this.orderRepository || !this.botRepository) {
      throw new Error(
        "ConversationThreadService requires chatRepository, orderRepository, and botRepository",
      );
    }
  }

  _generateThreadId(senderId, botId, platform) {
    const raw = `${senderId}::${botId || "default"}::${platform || "line"}`;
    return "thread_" + crypto.createHash("md5").update(raw).digest("hex").substring(0, 16);
  }

  _toLegacyId(value) {
    if (value === null || typeof value === "undefined") return "";
    if (typeof value === "string") return value.trim();
    if (value && typeof value.toString === "function") {
      return value.toString().trim();
    }
    return String(value).trim();
  }

  _normalizeInstructionMeta(instructionMeta = [], instructionRefs = []) {
    const normalized = [];
    const seen = new Set();

    const pushMeta = (candidate = {}) => {
      const instructionId =
        typeof candidate.instructionId === "string"
          ? candidate.instructionId.trim()
          : "";
      if (!instructionId) return;
      const versionNumber =
        Number.isInteger(candidate.versionNumber) && candidate.versionNumber > 0
          ? candidate.versionNumber
          : Number.isInteger(candidate.version) && candidate.version > 0
            ? candidate.version
            : null;
      const versionLabel =
        typeof candidate.versionLabel === "string" && candidate.versionLabel.trim()
          ? candidate.versionLabel.trim()
          : versionNumber != null
            ? `v${versionNumber}`
            : "legacy";
      const source =
        typeof candidate.source === "string" && candidate.source.trim()
          ? candidate.source.trim()
          : versionNumber != null
            ? "resolved"
            : "legacy";
      const key = `${instructionId}::${versionLabel}`;
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push({
        instructionId,
        versionNumber,
        versionLabel,
        source,
      });
    };

    if (Array.isArray(instructionMeta)) {
      instructionMeta.forEach((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
        pushMeta(entry);
      });
    }
    if (Array.isArray(instructionRefs)) {
      instructionRefs.forEach((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
        if (!entry.instructionId) return;
        pushMeta({
          instructionId: entry.instructionId,
          versionNumber: Number.isInteger(entry.version) ? entry.version : null,
          source: Number.isInteger(entry.version) ? "resolved" : "legacy",
        });
      });
    }

    return normalized;
  }

  _mergeInstructionRefs(existingRefs = [], newRefs = []) {
    const merged = [];
    const seen = new Set();
    [...existingRefs, ...newRefs].forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
      const instructionId =
        typeof entry.instructionId === "string" ? entry.instructionId.trim() : "";
      if (!instructionId) return;
      const version =
        Number.isInteger(entry.version) && entry.version > 0 ? entry.version : null;
      const key = `${instructionId}::${version === null ? "legacy" : version}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({
        instructionId,
        version,
      });
    });
    return merged;
  }

  async _computeStats(senderId, botId, platform) {
    const filter = { userId: senderId };
    if (botId) filter.botId = botId;
    if (platform) filter.platform = platform;

    const messages = await this.chatRepository.listActivityMessages(filter, {
      projection: {
        role: 1,
        timestamp: 1,
      },
      sort: { timestamp: 1 },
    });

    if (!Array.isArray(messages) || messages.length === 0) {
      return {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        firstMessageAt: null,
        lastMessageAt: null,
      };
    }

    let userMessages = 0;
    let assistantMessages = 0;
    let firstMessageAt = null;
    let lastMessageAt = null;

    for (const message of messages) {
      const role = typeof message?.role === "string" ? message.role : "";
      if (role === "user") userMessages += 1;
      if (role === "assistant") assistantMessages += 1;
      const timestamp = message?.timestamp ? new Date(message.timestamp) : null;
      if (!timestamp || Number.isNaN(timestamp.getTime())) continue;
      if (!firstMessageAt || timestamp < firstMessageAt) {
        firstMessageAt = timestamp;
      }
      if (!lastMessageAt || timestamp > lastMessageAt) {
        lastMessageAt = timestamp;
      }
    }

    return {
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      firstMessageAt,
      lastMessageAt,
    };
  }

  async upsertThread(
    senderId,
    platform,
    botId,
    instructionRefs = [],
    botName = null,
    instructionMeta = [],
  ) {
    if (!senderId) return null;

    const threadId = this._generateThreadId(senderId, botId, platform);
    const now = new Date();
    const stats = await this._computeStats(senderId, botId, platform);
    const existing = await this.threadRepository.getByThreadId(threadId);
    const mergedInstructionRefs = this._mergeInstructionRefs(
      existing?.instructionRefs,
      Array.isArray(instructionRefs) ? instructionRefs : [],
    );
    const normalizedInstructionMeta = this._normalizeInstructionMeta(
      [...(existing?.instructionMeta || []), ...(Array.isArray(instructionMeta) ? instructionMeta : [])],
      mergedInstructionRefs,
    );

    const nextStats = {
      ...(existing?.stats || {}),
      totalMessages: stats.totalMessages,
      userMessages: stats.userMessages,
      assistantMessages: stats.assistantMessages,
      lastMessageAt: stats.lastMessageAt || now,
    };
    if (stats.firstMessageAt) {
      nextStats.firstMessageAt = stats.firstMessageAt;
    }
    if (stats.firstMessageAt && stats.lastMessageAt) {
      nextStats.durationMinutes = Math.round(
        (stats.lastMessageAt - stats.firstMessageAt) / 60000,
      );
    }

    try {
      await this.threadRepository.upsert({
        ...(existing || {}),
        threadId,
        senderId,
        platform: platform || "line",
        botId: botId || null,
        botName: botName || existing?.botName || null,
        instructionRefs: mergedInstructionRefs,
        instructionMeta: normalizedInstructionMeta,
        stats: nextStats,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });

      this.updateThreadOrderInfo(threadId, senderId, platform, botId)
        .then(() => this.autoTagThread(threadId).catch(() => {}))
        .catch(() => {});
    } catch (error) {
      console.warn("[ConversationThread] upsert error:", error?.message || error);
    }

    return threadId;
  }

  async updateThreadOrderInfo(threadId, senderId, platform, botId) {
    const orderQuery = { userId: senderId };
    if (platform) orderQuery.platform = platform;
    if (botId) orderQuery.botId = botId;

    const orders = await this.orderRepository.list(orderQuery, {
      sort: { extractedAt: -1 },
    });

    const hasOrder = orders.length > 0;
    const orderIds = orders.map((order) => this._toLegacyId(order._id)).filter(Boolean);
    const orderedProducts = [];
    let totalOrderAmount = 0;
    let latestStatus = "unknown";

    for (const order of orders) {
      if (order.status) latestStatus = order.status;
      const items = order.orderData?.items || [];
      for (const item of items) {
        if (item.product && !orderedProducts.includes(item.product)) {
          orderedProducts.push(item.product);
        }
      }
      if (order.orderData?.totalAmount) {
        totalOrderAmount += Number(order.orderData.totalAmount) || 0;
      }
    }

    let outcome = "unknown";
    if (hasOrder) {
      const hasCompleted = orders.some((order) =>
        ["completed", "confirmed", "shipped"].includes(order.status),
      );
      outcome = hasCompleted ? "purchased" : "pending";
    }

    await this.threadRepository.updateFields(threadId, {
      hasOrder,
      orderIds,
      orderedProducts,
      orderStatus: latestStatus,
      totalOrderAmount,
      outcome,
      updatedAt: new Date(),
    });
  }

  async autoTagThread(threadId) {
    const thread = await this.threadRepository.getByThreadId(threadId);
    if (!thread) return;

    const tags = new Set(
      Array.isArray(thread.tags)
        ? thread.tags.filter((tag) => !String(tag || "").startsWith("auto:"))
        : [],
    );

    if (thread.outcome === "purchased") tags.add("auto:purchased");
    if (thread.outcome === "not_purchased") tags.add("auto:not-purchased");

    const userMsgs = thread.stats?.userMessages || 0;
    if (userMsgs >= 20) tags.add("auto:high-engagement");
    else if (userMsgs >= 5) tags.add("auto:medium-engagement");
    else tags.add("auto:low-engagement");

    if (thread.hasOrder && thread.totalOrderAmount >= 5000) {
      tags.add("auto:high-value");
    }
    if ((thread.stats?.durationMinutes || 0) > 60) {
      tags.add("auto:long-conversation");
    }

    await this.threadRepository.updateFields(threadId, {
      tags: [...tags],
      updatedAt: new Date(),
    });
  }

  async getThreadsByInstruction(instructionId, version, filters = {}, pagination = {}) {
    const page = Math.max(1, Number(pagination.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(pagination.limit) || 20));
    const { threads, totalCount } = await this.threadRepository.listByInstruction(
      instructionId,
      version,
      filters,
      { page, limit },
    );

    return {
      threads: threads.map((thread) => this._formatThread(thread)),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: page * limit < totalCount,
      },
    };
  }

  async getThreadMessages(threadId, pagination = {}) {
    const thread = await this.threadRepository.getByThreadId(threadId);
    if (!thread) return { error: "ไม่พบ thread" };

    const filter = { userId: thread.senderId };
    if (thread.botId) filter.botId = thread.botId;
    if (thread.platform) filter.platform = thread.platform;

    const page = Math.max(1, Number(pagination.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 50));
    const skip = (page - 1) * limit;

    const [messages, totalCount] = await Promise.all([
      this.chatRepository.listActivityMessages(filter, {
        projection: {
          senderId: 1,
          role: 1,
          content: 1,
          timestamp: 1,
          source: 1,
          instructionRefs: 1,
          instructionMeta: 1,
        },
        sort: { timestamp: 1 },
        skip,
        limit,
      }),
      this.chatRepository.countActivityMessages(filter),
    ]);

    const sanitized = messages.map((message) => {
      let content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content || "");
      content = content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[รูปภาพ]");
      if (content.length > 2000) {
        content = `${content.substring(0, 2000)}... (ตัดเหลือ 2,000 ตัวอักษร)`;
      }
      const messageInstructionRefs = Array.isArray(message.instructionRefs)
        ? message.instructionRefs
        : [];
      const messageInstructionMeta = this._normalizeInstructionMeta(
        message.instructionMeta,
        messageInstructionRefs,
      );
      return {
        _id: message._id?.toString?.() || message._id || null,
        role: message.role,
        content,
        timestamp: message.timestamp,
        source: message.source || (message.role === "user" ? "user" : "ai"),
        instructionRefs: messageInstructionRefs,
        instructionMeta: messageInstructionMeta,
      };
    });

    return {
      thread: this._formatThread(thread),
      messages: sanitized,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: page * limit < totalCount,
      },
    };
  }

  async searchInThreads(instructionId, version, keyword, limit = 20) {
    const threads = await this.threadRepository.listAllByInstruction(instructionId, version);
    if (threads.length === 0) {
      return { results: [], totalResults: 0 };
    }

    const senderIds = [...new Set(threads.map((thread) => thread.senderId).filter(Boolean))];
    const searchResults = await this.chatRepository.listActivityMessages(
      {
        userIds: senderIds,
        contentRegex: keyword,
      },
      {
        projection: {
          senderId: 1,
          role: 1,
          content: 1,
          timestamp: 1,
          botId: 1,
          platform: 1,
        },
        sort: { timestamp: -1 },
        limit,
      },
    );

    const threadMap = new Map(
      threads.map((thread) => {
        const key = [
          this._toLegacyId(thread.senderId),
          this._toLegacyId(thread.botId),
          this._toLegacyId(thread.platform || "line"),
        ].join("|");
        return [key, thread.threadId];
      }),
    );

    return {
      results: searchResults.map((message) => ({
        senderId: message.senderId,
        role: message.role,
        content: (message.content || "").substring(0, 500),
        timestamp: message.timestamp,
        threadId:
          threadMap.get([
            this._toLegacyId(message.senderId),
            this._toLegacyId(message.botId),
            this._toLegacyId(message.platform || "line"),
          ].join("|")) || null,
      })),
      totalResults: searchResults.length,
    };
  }

  async getFilterOptions(instructionId, version) {
    const threads = await this.threadRepository.listAllByInstruction(instructionId, version);

    const outcomes = new Set();
    const products = new Map();
    const platforms = new Set();
    const bots = new Map();
    const tags = new Set();

    for (const thread of threads) {
      if (thread.outcome) outcomes.add(thread.outcome);
      if (thread.platform) platforms.add(thread.platform);
      if (thread.botId && thread.botName) bots.set(thread.botId, thread.botName);
      else if (thread.botId) bots.set(thread.botId, thread.botId);
      if (Array.isArray(thread.orderedProducts)) {
        for (const product of thread.orderedProducts) {
          products.set(product, (products.get(product) || 0) + 1);
        }
      }
      if (Array.isArray(thread.tags)) {
        for (const tag of thread.tags) tags.add(tag);
      }
    }

    return {
      outcomes: [...outcomes],
      products: [...products.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      platforms: [...platforms],
      bots: [...bots.entries()].map(([id, name]) => ({ id, name })),
      tags: [...tags].sort(),
      totalThreads: threads.length,
    };
  }

  async getConversationAnalytics(instructionId, version, dateRange = {}) {
    const filters = {};
    if (dateRange.from) filters.dateFrom = dateRange.from;
    if (dateRange.to) filters.dateTo = dateRange.to;
    const threads = await this.threadRepository.listAllByInstruction(instructionId, version, filters);

    const stats = {
      totalThreads: threads.length,
      totalUserMessages: 0,
      totalAssistantMessages: 0,
      avgUserMessages: 0,
      avgDurationMinutes: 0,
      purchasedCount: 0,
      notPurchasedCount: 0,
      pendingCount: 0,
      unknownCount: 0,
      totalOrderAmount: 0,
      threadsWithOrders: 0,
      topProducts: [],
      platformBreakdown: {},
      conversionRate: 0,
    };

    const productCounts = new Map();
    const platformCounts = new Map();

    threads.forEach((thread) => {
      const userMessages = Number(thread.stats?.userMessages || 0);
      const assistantMessages = Number(thread.stats?.assistantMessages || 0);
      const durationMinutes = Number(thread.stats?.durationMinutes || 0);
      stats.totalUserMessages += userMessages;
      stats.totalAssistantMessages += assistantMessages;
      stats.avgUserMessages += userMessages;
      stats.avgDurationMinutes += durationMinutes;
      stats.totalOrderAmount += Number(thread.totalOrderAmount || 0);
      if (thread.hasOrder) stats.threadsWithOrders += 1;

      switch (thread.outcome) {
        case "purchased":
          stats.purchasedCount += 1;
          break;
        case "not_purchased":
          stats.notPurchasedCount += 1;
          break;
        case "pending":
          stats.pendingCount += 1;
          break;
        default:
          stats.unknownCount += 1;
          break;
      }

      if (Array.isArray(thread.orderedProducts)) {
        thread.orderedProducts.forEach((product) => {
          productCounts.set(product, (productCounts.get(product) || 0) + 1);
        });
      }

      const platform = thread.platform || "unknown";
      platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
    });

    const total = stats.totalThreads || 1;
    stats.conversionRate = Math.round((stats.purchasedCount / total) * 10000) / 100;
    stats.avgUserMessages = Math.round((stats.avgUserMessages / total) * 10) / 10;
    stats.avgDurationMinutes = Math.round((stats.avgDurationMinutes / total) * 10) / 10;
    stats.topProducts = [...productCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([product, count]) => ({ product, count }));
    stats.platformBreakdown = Object.fromEntries(platformCounts.entries());

    return stats;
  }

  async manageTags(threadId, addTags = [], removeTags = []) {
    const thread = await this.threadRepository.getByThreadId(threadId);
    if (!thread) return { error: "ไม่พบ thread" };

    const nextTags = new Set(Array.isArray(thread.tags) ? thread.tags : []);
    addTags.forEach((tag) => {
      const normalizedTag = String(tag || "").trim();
      if (!normalizedTag) return;
      nextTags.add(normalizedTag.startsWith("manual:") ? normalizedTag : `manual:${normalizedTag}`);
    });
    removeTags.forEach((tag) => {
      nextTags.delete(String(tag || "").trim());
    });

    const updated = await this.threadRepository.updateFields(threadId, {
      tags: [...nextTags],
      updatedAt: new Date(),
    });
    return { success: true, tags: updated?.tags || [] };
  }

  async rebuildAllThreads(progressCallback = null) {
    const allMessages = await this.chatRepository.listActivityMessages(
      {},
      {
        projection: {
          senderId: 1,
          role: 1,
          timestamp: 1,
          platform: 1,
          botId: 1,
        },
        sort: { timestamp: 1 },
      },
    );

    const groupStats = new Map();
    for (const message of allMessages) {
      const senderId = this._toLegacyId(message.senderId || message.userId);
      if (!senderId) continue;
      const platform = this._toLegacyId(message.platform || "line") || "line";
      const botId = this._toLegacyId(message.botId) || null;
      const key = `${senderId}::${botId || "default"}::${platform}`;
      if (!groupStats.has(key)) {
        groupStats.set(key, {
          _id: { senderId, botId, platform },
          totalMessages: 0,
          userMessages: 0,
          assistantMessages: 0,
          firstMessageAt: null,
          lastMessageAt: null,
        });
      }
      const group = groupStats.get(key);
      group.totalMessages += 1;
      if (message.role === "user") group.userMessages += 1;
      if (message.role === "assistant") group.assistantMessages += 1;
      const timestamp = message?.timestamp ? new Date(message.timestamp) : null;
      if (!timestamp || Number.isNaN(timestamp.getTime())) continue;
      if (!group.firstMessageAt || timestamp < group.firstMessageAt) {
        group.firstMessageAt = timestamp;
      }
      if (!group.lastMessageAt || timestamp > group.lastMessageAt) {
        group.lastMessageAt = timestamp;
      }
    }

    const groups = Array.from(groupStats.values());
    const [lineBots, fbBots] = await Promise.all([
      this.botRepository.list("line", {
        projection: { _id: 1, name: 1, selectedInstructions: 1 },
      }),
      this.botRepository.list("facebook", {
        projection: { _id: 1, name: 1, selectedInstructions: 1 },
      }),
    ]);

    const botMap = new Map();
    [...lineBots, ...fbBots].forEach((bot) => {
      botMap.set(bot._id.toString(), {
        name: bot.name || "",
        selectedInstructions: bot.selectedInstructions || [],
      });
    });

    let processed = 0;
    const total = groups.length;

    for (const group of groups) {
      const { senderId, botId, platform } = group._id;
      const threadId = this._generateThreadId(senderId, botId, platform);

      let instructionRefs = [];
      let instructionMeta = [];
      let botName = null;
      if (botId && botMap.has(botId)) {
        const botInfo = botMap.get(botId);
        botName = botInfo.name;
        instructionRefs = (botInfo.selectedInstructions || [])
          .map((selection) => {
            if (selection && typeof selection === "object" && selection.instructionId) {
              return {
                instructionId: selection.instructionId,
                version: selection.version != null ? selection.version : null,
              };
            }
            if (typeof selection === "string" && selection.trim()) {
              return { instructionId: selection.trim(), version: null };
            }
            return null;
          })
          .filter(Boolean);
        instructionMeta = this._normalizeInstructionMeta([], instructionRefs);
      }

      const durationMinutes =
        group.firstMessageAt && group.lastMessageAt
          ? Math.round((group.lastMessageAt - group.firstMessageAt) / 60000)
          : 0;

      await this.threadRepository.upsert({
        threadId,
        senderId,
        platform: platform || "line",
        botId: botId || null,
        botName,
        instructionRefs,
        instructionMeta,
        stats: {
          totalMessages: group.totalMessages,
          userMessages: group.userMessages,
          assistantMessages: group.assistantMessages,
          firstMessageAt: group.firstMessageAt,
          lastMessageAt: group.lastMessageAt,
          durationMinutes,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      });

      await this.updateThreadOrderInfo(threadId, senderId, platform, botId);
      await this.autoTagThread(threadId);

      processed += 1;
      if (progressCallback && processed % 100 === 0) {
        progressCallback(processed, total);
      }
    }

    return { totalGroups: total, processedThreads: processed };
  }

  _formatThread(thread) {
    if (!thread) return null;
    return {
      threadId: thread.threadId,
      senderId: thread.senderId,
      platform: thread.platform,
      botId: thread.botId,
      botName: thread.botName || null,
      instructionRefs: thread.instructionRefs || [],
      instructionMeta: this._normalizeInstructionMeta(
        thread.instructionMeta,
        thread.instructionRefs,
      ),
      stats: thread.stats || {},
      hasOrder: thread.hasOrder || false,
      orderIds: thread.orderIds || [],
      orderedProducts: thread.orderedProducts || [],
      orderStatus: thread.orderStatus || null,
      totalOrderAmount: thread.totalOrderAmount || 0,
      outcome: thread.outcome || "unknown",
      tags: thread.tags || [],
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  async ensureIndexes() {
    await this.threadRepository.ensureIndexes();
  }
}

module.exports = ConversationThreadService;
