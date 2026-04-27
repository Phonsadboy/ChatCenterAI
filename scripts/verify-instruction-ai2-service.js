const assert = require("assert");
const {
  InstructionAI2Service,
  normalizeImageLabel,
  detectSemanticRoles,
  computeContentHash,
  buildRetailTemplateDataItems,
  buildRetailEvalSuite,
  extractImageTokensFromInstruction,
} = require("../services/instructionAI2Service");
const {
  normalizeInstructionAttributionRefs,
} = require("../services/instructionAI2AttributionService");

class FakeCursor {
  constructor(rows) {
    this.rows = rows || [];
  }
  project() { return this; }
  sort() { return this; }
  limit(n) { this.rows = this.rows.slice(0, n); return this; }
  async toArray() { return this.rows; }
  async next() { return this.rows[0] || null; }
}

class FakeCollection {
  constructor(rows = []) {
    this.rows = rows;
  }
  matches(row, query = {}) {
    if (!query || Object.keys(query).length === 0) return true;
    if (Array.isArray(query.$or)) return query.$or.some((part) => this.matches(row, part));
    for (const [key, expected] of Object.entries(query)) {
      if (key === "$or") continue;
      const actual = key.split(".").reduce((value, part) => {
        if (Array.isArray(value)) return value.map((entry) => entry?.[part]);
        return value?.[part];
      }, row);
      if (expected && typeof expected === "object" && expected.$in) {
        const actualValues = Array.isArray(actual) ? actual.flat() : [actual];
        if (!actualValues.some((value) => expected.$in.some((candidate) => String(candidate) === String(value)))) return false;
        continue;
      }
      if (expected && typeof expected === "object" && Object.prototype.hasOwnProperty.call(expected, "$exists")) {
        const exists = actual !== undefined && actual !== null;
        if (expected.$exists !== exists) return false;
        continue;
      }
      if (Array.isArray(actual)) {
        if (!actual.some((value) => String(value) === String(expected))) return false;
        continue;
      }
      if (String(actual) !== String(expected)) return false;
    }
    return true;
  }
  find(query = {}) {
    return new FakeCursor(this.rows.filter((row) => this.matches(row, query)));
  }
  async findOne(query = {}) {
    return (await this.find(query).toArray())[0] || null;
  }
  async insertOne(doc = {}) {
    const inserted = { ...doc, _id: doc._id || `fake_${this.rows.length + 1}` };
    this.rows.push(inserted);
    return { insertedId: inserted._id };
  }
  async updateOne(query = {}, update = {}, options = {}) {
    const row = this.rows.find((candidate) => this.matches(candidate, query));
    if (!row) {
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0 };
      const inserted = {};
      for (const [key, value] of Object.entries(query || {})) {
        if (key.includes(".") || key.startsWith("$") || (value && typeof value === "object")) continue;
        inserted[key] = value;
      }
      if (update.$setOnInsert) Object.assign(inserted, update.$setOnInsert);
      if (update.$set) Object.assign(inserted, update.$set);
      inserted._id = inserted._id || `fake_${this.rows.length + 1}`;
      this.rows.push(inserted);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: inserted._id };
    }
    if (update.$set) Object.assign(row, update.$set);
    if (update.$setOnInsert) {
      for (const [key, value] of Object.entries(update.$setOnInsert)) {
        if (row[key] === undefined) row[key] = value;
      }
    }
    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc)) {
        row[key] = (Number(row[key]) || 0) + Number(value || 0);
      }
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }
  async findOneAndUpdate(query = {}, update = {}) {
    const row = this.rows.find((candidate) => this.matches(candidate, query));
    if (!row) return { value: null };
    await this.updateOne(query, update);
    return { value: row };
  }
  async countDocuments(query = {}) { return this.rows.filter((row) => this.matches(row, query)).length; }
  async deleteMany(query = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !this.matches(row, query));
    return { deletedCount: before - this.rows.length };
  }
  async deleteOne(query = {}) {
    const index = this.rows.findIndex((row) => this.matches(row, query));
    if (index < 0) return { deletedCount: 0 };
    this.rows.splice(index, 1);
    return { deletedCount: 1 };
  }
  aggregate() { return new FakeCursor([]); }
  async createIndex() { return "ok"; }
}

class FakeDb {
  constructor(collections = {}) {
    this.collections = collections;
  }
  collection(name) {
    if (!this.collections[name]) this.collections[name] = new FakeCollection([]);
    return this.collections[name];
  }
}

async function run() {
  assert.strictEqual(normalizeImageLabel("  โปรเซ็ทคู่  "), "โปรเซ็ทคู่");
  assert.strictEqual(normalizeImageLabel("QR   Code"), "qr code");

  const template = buildRetailTemplateDataItems({
    assistantName: "น้องทิพย์",
    pageName: "น้ำมันทิพยมนต์",
  });
  assert.strictEqual(template.length, 3);
  assert.strictEqual(template[0].type, "text");
  assert.strictEqual(template[1].type, "table");
  assert.strictEqual(template[2].type, "table");

  const roles = detectSemanticRoles(template);
  assert.ok(roles.role);
  assert.strictEqual(roles.catalog.length, 1);
  assert.strictEqual(roles.scenarios.length, 1);

  const instruction = {
    dataItems: [
      {
        itemId: "p1",
        title: "สินค้า",
        type: "table",
        data: {
          columns: ["ชื่อสินค้า", "รูปสินค้า"],
          rows: [["โปร A", "#[IMAGE:โปรเซ็ทคู่]"], ["โปร B", "QR Code"]],
        },
      },
    ],
  };
  const tokens = extractImageTokensFromInstruction(instruction);
  assert.deepStrictEqual(tokens.map((token) => token.label), ["โปรเซ็ทคู่", "QR Code"]);

  assert.strictEqual(
    computeContentHash({ b: 2, a: 1 }),
    computeContentHash({ a: 1, b: 2 }),
  );

  const refs = normalizeInstructionAttributionRefs(
    [{ instructionId: "inst_1", versionNumber: 2 }],
    [{ instructionId: "inst_1", version: 2 }, { instructionId: "inst_2" }],
  );
  assert.strictEqual(refs.length, 2);
  assert.strictEqual(refs[0].instructionVersion, 2);

  const fakeDb = new FakeDb({
    instructions_v2: new FakeCollection([{
      _id: "507f1f77bcf86cd799439011",
      instructionId: "inst_1",
      name: "Retail",
      dataItems: template,
      conversationStarter: { enabled: true, messages: [{ id: "s1", type: "text", content: "สวัสดี" }] },
      version: 1,
      revision: 1,
    }]),
    instruction_assets: new FakeCollection([
      { _id: "507f1f77bcf86cd799439012", label: "โปรเซ็ทคู่", url: "https://example.com/a.jpg" },
    ]),
    image_collections: new FakeCollection([
      { _id: "col_a", name: "คลัง A", images: [{ assetId: "asset_a", label: "โปรเซ็ทคู่", url: "https://example.com/a.jpg" }] },
      { _id: "col_b", name: "คลัง B", images: [{ assetId: "asset_b", label: "โปรเซ็ทคู่", url: "https://example.com/b.jpg" }] },
    ]),
    instruction_versions: new FakeCollection([{ instructionId: "inst_1", version: 1, source: "test" }]),
    line_bots: new FakeCollection([{
      _id: "507f1f77bcf86cd799439013",
      name: "Line Retail",
      selectedInstructions: [{ instructionId: "inst_1" }],
      selectedImageCollections: ["col_a"],
    }]),
    facebook_bots: new FakeCollection([]),
    instagram_bots: new FakeCollection([]),
    whatsapp_bots: new FakeCollection([]),
    follow_up_page_settings: new FakeCollection([]),
    image_asset_usage: new FakeCollection([]),
    message_instruction_usage: new FakeCollection([]),
    conversation_episodes: new FakeCollection([]),
    instruction_ai2_batches: new FakeCollection([]),
    instruction_ai2_audit: new FakeCollection([]),
    instruction_ai2_runs: new FakeCollection([]),
  });
  const service = new InstructionAI2Service(fakeDb);
  const inventory = await service.buildInventory("507f1f77bcf86cd799439011");
  assert.strictEqual(inventory.instruction.instructionId, "inst_1");
  assert.ok(inventory.sections.role.length >= 1);
  assert.ok(inventory.sections.catalog.length >= 1);
  assert.ok(inventory.sections.scenario.length >= 1);
  assert.ok(inventory.sections.readiness.success);
  assert.ok(inventory.sections.eval.suite.success);
  assert.ok(inventory.sections.eval.suite.cases.length >= 15);
  assert.ok(inventory.sections.toolRegistry.tools.some((tool) => tool.name === "propose_update_semantic_mapping"));
  assert.strictEqual(inventory.sections.starter.enabled, true);
  assert.ok(Array.isArray(inventory.sections.model.catalog));
  assert.ok(service.readTrace.some((entry) => entry.type === "inventory"));

  const evalSuite = buildRetailEvalSuite(fakeDb.collection("instructions_v2").rows[0], template);
  assert.strictEqual(evalSuite.success, true);
  assert.ok(evalSuite.summary.total >= 15);

  const readiness = await service.getReadinessDashboard("507f1f77bcf86cd799439011");
  assert.strictEqual(readiness.success, true);
  assert.ok(readiness.checklist.some((item) => item.key === "semantic_mapping"));

  const recommendations = await service.getRecommendations("507f1f77bcf86cd799439011");
  assert.strictEqual(recommendations.success, true);
  assert.ok(Array.isArray(recommendations.recommendations));

  const semanticProposal = await service.proposal_update_semantic_mapping(
    "507f1f77bcf86cd799439011",
    { roleItemId: template[0].itemId, catalogItemIds: [template[1].itemId], scenarioItemIds: [template[2].itemId] },
  );
  assert.strictEqual(semanticProposal.operation, "instruction.updateSemanticMapping");
  assert.strictEqual(semanticProposal.requiredPermission, "instruction_ai2:write");
  const semanticPreflight = await service.preflightBatch({ changes: [semanticProposal] });
  assert.strictEqual(semanticPreflight.ok, true);

  const pageImageProposal = await service.proposal_update_page_image_collections(
    "507f1f77bcf86cd799439011",
    { pageKeys: ["line:507f1f77bcf86cd799439013"], collectionIds: ["col_a", "col_b"] },
  );
  assert.strictEqual(pageImageProposal.operation, "page.updateImageCollections");
  assert.ok(pageImageProposal.warnings.some((warning) => warning.type === "duplicate_visible_image_labels"));
  const pageImagePreflight = await service.preflightBatch({ changes: [pageImageProposal] });
  assert.strictEqual(pageImagePreflight.ok, false);
  assert.ok(pageImagePreflight.errors.some((error) => error.error === "duplicate_visible_image_labels"));

  const missingImageProposal = await service.proposal_add_row(
    "507f1f77bcf86cd799439011",
    {
      itemId: template[1].itemId,
      rowData: { "ชื่อสินค้า": "โปรใหม่", "รูปสินค้า": "#[IMAGE:รูปที่ไม่มี]" },
    },
  );
  const missingImagePreflight = await service.preflightBatch({ changes: [missingImageProposal] });
  assert.strictEqual(missingImagePreflight.ok, false);
  assert.ok(missingImagePreflight.errors.some((error) => error.error === "invalid_image_references"));

  service.proposals = [await service.createProposalBase(
    "507f1f77bcf86cd799439011",
    "instruction.updateText",
    { type: "data_item_text", itemId: template[0].itemId },
    "old",
    "new",
  )];
  const batch = await service.finalizeBatch({
    instructionId: "507f1f77bcf86cd799439011",
    sessionId: "session_1",
    requestId: "request_1",
    message: "แก้ role",
  });
  assert.ok(batch.confirmationToken);
  const invalidCommit = await service.commitBatch(batch.batchId, "tester", { confirmationToken: "wrong" });
  assert.strictEqual(invalidCommit.success, false);
  assert.strictEqual(invalidCommit.blocked, true);

  await fakeDb.collection("instruction_ai2_audit").insertOne({
    auditId: "audit_1",
    batchId: "batch_done",
    changeId: "chg_done",
    operation: "instruction.updateText",
    target: { type: "data_item_text", itemId: template[0].itemId, instructionObjectId: "507f1f77bcf86cd799439011", instructionId: "inst_1" },
    before: "old role",
    after: "new role",
    risk: "safe_write",
    affectedScope: ["instruction"],
  });
  const revertProposal = await service.proposal_revert_audit_change(
    "507f1f77bcf86cd799439011",
    { auditId: "audit_1" },
  );
  assert.strictEqual(revertProposal.operation, "instruction.updateText");
  assert.strictEqual(revertProposal.after, "old role");

  const usageProposal = await service.proposal_rebuild_image_asset_usage_registry(
    "507f1f77bcf86cd799439011",
    { scope: "instruction" },
  );
  assert.strictEqual(usageProposal.operation, "imageUsage.rebuildRegistry");
  const usageResult = await service.applyImageUsageRebuild(usageProposal);
  assert.strictEqual(usageResult.rebuilt, true);

  assert.deepStrictEqual(service.modelValidator("gpt-5.5", "medium").ok, true);
  assert.deepStrictEqual(service.modelValidator("gpt-5.4-mini", "low").ok, true);
  assert.deepStrictEqual(service.modelValidator("not-real", "low").ok, false);

  console.log("InstructionAI2 helper verification passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
