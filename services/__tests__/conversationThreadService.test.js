const test = require("node:test");
const assert = require("node:assert/strict");

const ConversationThreadService = require("../conversationThreadService");

function createService({
  threadRepositoryOverrides = {},
  chatRepositoryOverrides = {},
  orderRepositoryOverrides = {},
  botRepositoryOverrides = {},
} = {}) {
  return new ConversationThreadService(null, {
    conversationThreadRepository: {
      async listByInstruction() {
        return { threads: [], totalCount: 0 };
      },
      async listAllByInstruction() {
        return [];
      },
      async upsert() {
        return null;
      },
      async updateFields() {
        return null;
      },
      ...threadRepositoryOverrides,
    },
    chatRepository: {
      async listActivityMessages() {
        return [];
      },
      ...chatRepositoryOverrides,
    },
    orderRepository: {
      async list() {
        return [];
      },
      ...orderRepositoryOverrides,
    },
    botRepository: {
      async list() {
        return [];
      },
      ...botRepositoryOverrides,
    },
  });
}

test("getThreadsByInstruction forwards sortBy to repository pagination", async () => {
  let capturedPagination = null;
  const service = createService({
    threadRepositoryOverrides: {
      async listByInstruction(_instructionId, _version, _filters, pagination) {
        capturedPagination = pagination;
        return { threads: [], totalCount: 0 };
      },
    },
  });

  await service.getThreadsByInstruction("inst-001", 4, {}, {
    page: 2,
    limit: 15,
    sortBy: "highest_order",
  });

  assert.deepEqual(capturedPagination, {
    page: 2,
    limit: 15,
    sortBy: "highest_order",
  });
});

test("getConversationAnalytics accepts generic filters alongside legacy dateRange shape", async () => {
  let capturedFilters = null;
  const service = createService({
    threadRepositoryOverrides: {
      async listAllByInstruction(_instructionId, _version, filters) {
        capturedFilters = filters;
        return [];
      },
    },
  });

  await service.getConversationAnalytics("inst-001", 2, {
    from: "2026-04-01",
    to: "2026-04-30",
    platform: "line",
    outcome: ["purchased"],
  });

  assert.deepEqual(capturedFilters, {
    dateFrom: "2026-04-01",
    dateTo: "2026-04-30",
    platform: "line",
    outcome: ["purchased"],
  });
});

test("rebuildAllThreads prefers instruction refs from message history over current bot config", async () => {
  const upserts = [];
  const service = createService({
    threadRepositoryOverrides: {
      async upsert(doc) {
        upserts.push(doc);
        return doc;
      },
    },
    chatRepositoryOverrides: {
      async listActivityMessages() {
        return [
          {
            senderId: "user-1",
            role: "user",
            timestamp: "2026-04-01T10:00:00.000Z",
            platform: "line",
            botId: "bot-1",
            botName: "Sales Bot",
            instructionRefs: [{ instructionId: "inst-history", version: 7 }],
            instructionMeta: [
              {
                instructionId: "inst-history",
                versionNumber: 7,
                versionLabel: "v7",
                source: "resolved",
              },
            ],
          },
          {
            senderId: "user-1",
            role: "assistant",
            timestamp: "2026-04-01T10:05:00.000Z",
            platform: "line",
            botId: "bot-1",
            instructionRefs: [{ instructionId: "inst-history", version: 7 }],
            instructionMeta: [],
          },
        ];
      },
    },
    botRepositoryOverrides: {
      async list() {
        return [
          {
            _id: "bot-1",
            name: "Sales Bot",
            selectedInstructions: [{ instructionId: "inst-current", version: 99 }],
          },
        ];
      },
    },
  });
  service.updateThreadOrderInfo = async () => {};
  service.autoTagThread = async () => {};

  const result = await service.rebuildAllThreads();

  assert.equal(result.processedThreads, 1);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].instructionRefs, [
    { instructionId: "inst-history", version: 7 },
  ]);
  assert.deepEqual(upserts[0].instructionMeta, [
    {
      instructionId: "inst-history",
      versionNumber: 7,
      versionLabel: "v7",
      source: "resolved",
    },
  ]);
});
