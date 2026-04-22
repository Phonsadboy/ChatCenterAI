const test = require("node:test");
const assert = require("node:assert/strict");

const InstructionChatService = require("../instructionChatService");

function createService() {
  return new InstructionChatService(null, null, {
    instructionStore: {
      async load() {
        return {
          instructionId: "inst-legacy-001",
          name: "Instruction Test",
        };
      },
    },
  });
}

test("get_conversation_stats normalizes analytics filters and returns applied filters", async () => {
  const service = createService();
  let capturedArgs = null;

  service._createConversationThreadService = () => ({
    async getConversationAnalytics(...args) {
      capturedArgs = args;
      return {
        totalThreads: 8,
        totalUserMessages: 44,
        totalAssistantMessages: 36,
        conversionRate: 37.5,
        avgUserMessages: 5.5,
        avgDurationMinutes: 12,
        purchasedCount: 3,
        notPurchasedCount: 2,
        pendingCount: 2,
        unknownCount: 1,
        threadsWithOrders: 3,
        totalOrderAmount: 12000,
        topProducts: [{ product: "A", count: 2 }],
        platformBreakdown: { line: 5, facebook: 3 },
      };
    },
  });

  const result = await service.get_conversation_stats("db-row-id", {
    version: "2",
    outcomes: ["ซื้อ", "pending"],
    minMessages: "10",
    products: ["A", "B"],
    tags: "manual:vip,auto:high-engagement",
    platform: "line",
    dateFrom: "2026-04-01",
    dateTo: "2026-04-30",
  });

  assert.deepEqual(capturedArgs, [
    "inst-legacy-001",
    2,
    {
      outcome: ["purchased", "pending"],
      minUserMessages: 10,
      products: ["A", "B"],
      tags: ["manual:vip", "auto:high-engagement"],
      platform: "line",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    },
  ]);

  assert.equal(result.totalConversations, 8);
  assert.equal(result.conversionRate, "37.5%");
  assert.deepEqual(result.appliedFilters, {
    version: 2,
    outcomes: ["purchased", "pending"],
    minUserMessages: 10,
    products: ["A", "B"],
    tags: ["manual:vip", "auto:high-engagement"],
    platform: "line",
    dateFrom: "2026-04-01",
    dateTo: "2026-04-30",
  });
});

test("search_conversations forwards normalized filters and sort options", async () => {
  const service = createService();
  let capturedArgs = null;

  service._createConversationThreadService = () => ({
    async getThreadsByInstruction(...args) {
      capturedArgs = args;
      return {
        threads: [
          {
            threadId: "thread_123",
            senderId: "user-1234567890",
            platform: "line",
            botName: "Sales Bot",
            outcome: "not_purchased",
            hasOrder: false,
            orderedProducts: [],
            totalOrderAmount: 0,
            tags: ["manual:vip"],
            stats: {
              userMessages: 20,
              assistantMessages: 18,
              durationMinutes: 9,
              lastMessageAt: "2026-04-22T10:00:00.000Z",
            },
          },
        ],
        pagination: {
          totalCount: 1,
        },
      };
    },
  });

  const result = await service.search_conversations("db-row-id", {
    outcome: "not purchased",
    minMessages: 30,
    maxMessages: 10,
    tags: ["manual:vip"],
    sortBy: "messages_desc",
    limit: 50,
  });

  assert.deepEqual(capturedArgs, [
    "inst-legacy-001",
    null,
    {
      outcome: ["not_purchased"],
      minUserMessages: 10,
      maxUserMessages: 30,
      tags: ["manual:vip"],
    },
    {
      page: 1,
      limit: 20,
      sortBy: "most_messages",
    },
  ]);

  assert.equal(result.totalFound, 1);
  assert.equal(result.returnedCount, 1);
  assert.deepEqual(result.appliedFilters, {
    outcomes: ["not_purchased"],
    minUserMessages: 10,
    maxUserMessages: 30,
    tags: ["manual:vip"],
    sortBy: "most_messages",
    limit: 20,
  });
});

test("get_conversation_detail rejects threads outside the active instruction", async () => {
  const service = createService();

  service._createConversationThreadService = () => ({
    async getThreadMessages() {
      return {
        thread: {
          instructionRefs: [{ instructionId: "other-instruction" }],
          instructionMeta: [],
        },
        messages: [],
        pagination: {},
      };
    },
  });

  const result = await service.get_conversation_detail("db-row-id", {
    threadId: "thread_123",
  });

  assert.deepEqual(result, {
    error: "thread นี้ไม่ได้อยู่ใน instruction ที่เลือก",
  });
});

test("executeTool forwards arguments to get_conversation_stats", async () => {
  const service = createService();
  let capturedArgs = null;

  service.get_conversation_stats = async (...args) => {
    capturedArgs = args;
    return { ok: true };
  };

  const result = await service.executeTool(
    "get_conversation_stats",
    { version: 3 },
    "db-row-id",
    "session-1",
  );

  assert.deepEqual(capturedArgs, ["db-row-id", { version: 3 }]);
  assert.deepEqual(result, { ok: true });
});
