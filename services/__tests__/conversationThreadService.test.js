const test = require("node:test");
const assert = require("node:assert/strict");

const ConversationThreadService = require("../conversationThreadService");

function createService(repositoryOverrides = {}) {
  return new ConversationThreadService(null, {
    conversationThreadRepository: {
      async listByInstruction() {
        return { threads: [], totalCount: 0 };
      },
      async listAllByInstruction() {
        return [];
      },
      ...repositoryOverrides,
    },
    chatRepository: {},
    orderRepository: {},
    botRepository: {},
  });
}

test("getThreadsByInstruction forwards sortBy to repository pagination", async () => {
  let capturedPagination = null;
  const service = createService({
    async listByInstruction(_instructionId, _version, _filters, pagination) {
      capturedPagination = pagination;
      return { threads: [], totalCount: 0 };
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
    async listAllByInstruction(_instructionId, _version, filters) {
      capturedFilters = filters;
      return [];
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
