const assert = require("assert");
const { MongoClient, ObjectId } = require("mongodb");
const { buildRuntimeConfig } = require("../services/runtimeConfig");
const { createPostgresRuntime } = require("../services/postgresRuntime");
const { createChatStorageService } = require("../services/chatStorageService");
const { createPostgresMongoCompatClient } = require("../services/postgresMongoCompat");
const {
  InstructionAI2Service,
  buildRetailTemplateDataItems,
  computeContentHash,
} = require("../services/instructionAI2Service");
const {
  recordInstructionAI2MessageUsage,
  attributeOrderToLatestAssistantUsage,
} = require("../services/instructionAI2AttributionService");

const BOT_COLLECTION_BY_PLATFORM = {
  line: "line_bots",
  facebook: "facebook_bots",
  instagram: "instagram_bots",
  whatsapp: "whatsapp_bots",
};

function asStringId(value) {
  return value?._id?.toString?.() || value?.toString?.() || String(value || "");
}

function nowTag() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function connectDb() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (mongoUri) {
    const client = new MongoClient(mongoUri);
    await client.connect();
    return {
      mode: "mongo",
      db: client.db("chatbot"),
      close: () => client.close(),
    };
  }

  const config = buildRuntimeConfig(process.env);
  if (!config.postgres.connectionString) {
    throw new Error("No MONGO_URI/MONGODB_URI/DATABASE_URL available");
  }
  const postgresRuntime = createPostgresRuntime(config.postgres);
  const chatStorageService = createChatStorageService({
    postgresRuntime,
    hotRetentionDays: config.chatHotRetentionDays,
  });
  await chatStorageService.ensureReady();
  const client = createPostgresMongoCompatClient({
    postgresRuntime,
    chatStorageService,
    projectBucket: null,
    scanLimit: Number(process.env.AI2_TEST_SCAN_LIMIT || 10000),
  });
  return {
    mode: "postgres-compat",
    db: client.db("chatbot"),
    close: () => postgresRuntime.close(),
  };
}

function findRetailInstruction(instructions) {
  const normalized = (value) => String(value || "").trim().toLowerCase();
  return instructions.find((item) => normalized(item.name) === "retail instruction") ||
    instructions.find((item) => normalized(item.instructionId) === "retail instruction") ||
    instructions.find((item) => normalized(item.name).includes("retail instruction")) ||
    instructions.find((item) => normalized(item.name).includes("retail"));
}

async function findOrCreateAiTestPage(db, cleanup, summary) {
  const service = new InstructionAI2Service(db, { user: "ai2-integration-test" });
  const pages = await service.listPages(null);
  const found = pages.find((page) => /ai test/i.test(`${page.name || ""} ${page.pageKey || ""}`));
  if (found) {
    const parsed = found.pageKey.split(":");
    const platform = parsed[0];
    const botId = parsed.slice(1).join(":");
    const collName = BOT_COLLECTION_BY_PLATFORM[platform];
    const oid = ObjectId.isValid(botId) ? new ObjectId(botId) : botId;
    const doc = await db.collection(collName).findOne({ _id: oid }) ||
      await db.collection(collName).findOne({ _id: botId });
    assert(doc, `AI TEST page found in listPages but not found in ${collName}`);
    summary.aiTestPageCreated = false;
    return { platform, botId, pageKey: found.pageKey, collName, doc };
  }

  const _id = new ObjectId();
  const doc = {
    _id,
    name: `AI TEST ${nowTag()}`,
    lineBotId: `ai-test-${nowTag()}`,
    selectedInstructions: [],
    selectedImageCollections: [],
    aiModel: "",
    aiConfig: {},
    status: "test",
    source: "instruction_ai2_integration_test",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.collection("line_bots").insertOne(doc);
  cleanup.createdPages.push({ collName: "line_bots", _id });
  summary.aiTestPageCreated = true;
  return { platform: "line", botId: _id.toString(), pageKey: `line:${_id.toString()}`, collName: "line_bots", doc };
}

async function commitServiceBatch(service, instructionId, proposals, label, cleanup) {
  service.proposals = proposals;
  const batch = await service.finalizeBatch({
    instructionId,
    sessionId: `ai2_test_session_${nowTag()}`,
    requestId: `ai2_test_request_${label}_${nowTag()}`,
    message: `integration test ${label}`,
  });
  assert(batch?.batchId, `batch not created for ${label}`);
  cleanup.batchIds.push(batch.batchId);
  assert.strictEqual(batch.confirmation?.required, true, `${label} confirmation required`);
  assert(batch.confirmationToken, `${label} confirmation token missing`);
  assert(batch.preflight?.ok, `${label} preflight failed: ${JSON.stringify(batch.preflight?.errors || [])}`);
  const result = await service.commitBatch(batch.batchId, "ai2-integration-test", {
    confirmationToken: batch.confirmationToken,
    commitRequestId: `ai2_test_commit_${label}_${nowTag()}`,
  });
  assert.strictEqual(result.success, true, `${label} commit failed: ${JSON.stringify(result)}`);
  return { batch, result };
}

async function main() {
  const allowWrites = process.env.AI2_TEST_ALLOW_WRITES === "1";
  if (!allowWrites) {
    throw new Error("Set AI2_TEST_ALLOW_WRITES=1 to run DB write integration tests");
  }

  const summary = {
    mode: "",
    retailInstruction: null,
    aiTestPage: null,
    checks: [],
    cleanup: [],
  };
  const cleanup = {
    tempInstructionIds: [],
    tempInstructionObjectIds: [],
    tempAssetIds: [],
    tempCollectionIds: [],
    batchIds: [],
    usageIds: [],
    episodeIds: [],
    createdPages: [],
  };

  let connection;
  let pageBackup = null;
  let followupBackup = null;
  let tempInstructionObjectId = null;
  let tempInstructionId = "";
  let passed = false;
  let cleanupFailure = null;
  try {
    connection = await connectDb();
    const db = connection.db;
    summary.mode = connection.mode;
    const service = new InstructionAI2Service(db, { user: "ai2-integration-test" });
    await service.ensureIndexes();

    const allInstructions = await db.collection("instructions_v2")
      .find({})
      .project({ name: 1, instructionId: 1, version: 1, revision: 1, dataItems: 1, dataItemRoles: 1, conversationStarter: 1 })
      .limit(5000)
      .toArray();
    const retailInstruction = findRetailInstruction(allInstructions);
    assert(retailInstruction, "Retail Instruction not found");
    const retailObjectId = asStringId(retailInstruction);
    const retailLogicalId = retailInstruction.instructionId || retailObjectId;
    summary.retailInstruction = {
      objectId: retailObjectId,
      instructionId: retailLogicalId,
      name: retailInstruction.name || "",
    };

    const retailInventory = await service.buildInventory(retailObjectId);
    assert.strictEqual(retailInventory.instruction._id, retailObjectId);
    assert(retailInventory.runtimeConventions?.cut?.token === "[cut]");
    assert(retailInventory.runtimeConventions?.imageToken?.token.includes("#[IMAGE:"));
    assert(retailInventory.sections?.readiness?.success, "readiness missing from inventory");
    assert(retailInventory.sections?.eval?.suite?.cases?.length >= 15, "eval suite missing from inventory");
    assert(retailInventory.sections?.toolRegistry?.tools?.some((tool) => tool.name === "get_instruction_inventory"), "tool registry missing inventory tool");
    summary.checks.push("Retail inventory includes runtime conventions, readiness, eval suite, and broad tool registry");

    const retailEval = await service.runRegressionEvalSuite(retailObjectId);
    assert(retailEval.success && retailEval.summary.total >= 15, "retail eval suite did not run");
    summary.checks.push(`Retail eval suite ran: ${retailEval.summary.pass}/${retailEval.summary.total} pass, ${retailEval.summary.warn} warn, ${retailEval.summary.fail} fail`);

    const retailReadiness = await service.getReadinessDashboard(retailObjectId);
    assert(retailReadiness.success && Array.isArray(retailReadiness.checklist), "readiness dashboard failed");
    const retailRecommendations = await service.getRecommendations(retailObjectId);
    assert(retailRecommendations.success && Array.isArray(retailRecommendations.recommendations), "recommendations failed");
    summary.checks.push(`Retail readiness score ${retailReadiness.score}; recommendations ${retailRecommendations.recommendations.length}`);

    const page = await findOrCreateAiTestPage(db, cleanup, summary);
    summary.aiTestPage = { pageKey: page.pageKey, platform: page.platform, botId: page.botId, name: page.doc.name || page.doc.pageName || "" };
    pageBackup = {
      collName: page.collName,
      _id: page.doc._id,
      fields: {
        selectedInstructions: page.doc.selectedInstructions || [],
        selectedImageCollections: page.doc.selectedImageCollections || [],
        imageCollectionIds: page.doc.imageCollectionIds || [],
        aiModel: page.doc.aiModel || "",
        aiConfig: page.doc.aiConfig || {},
        updatedAt: page.doc.updatedAt || null,
      },
    };
    const followupQuery = { pageKey: page.pageKey };
    followupBackup = await db.collection("follow_up_page_settings").findOne(followupQuery);

    tempInstructionObjectId = new ObjectId();
    tempInstructionId = `ai2_test_retail_${nowTag()}_${Math.random().toString(36).slice(2, 7)}`;
    const tempItems = buildRetailTemplateDataItems({
      assistantName: "น้องเทส",
      pageName: "AI TEST",
      persona: "สุภาพ กระชับ สำหรับ integration test",
    });
    tempItems[1].data.rows.push(["ชุดทดสอบ AI2", "สินค้า test สำหรับ integration", "99", ""]);
    tempItems[2].data.rows.push(["ลูกค้าถาม COD", "รับออเดอร์เป็นเก็บเงินปลายทางได้ และขอชื่อ ที่อยู่ เบอร์"]);
    await db.collection("instructions_v2").insertOne({
      _id: tempInstructionObjectId,
      instructionId: tempInstructionId,
      name: `AI2 TEST Retail Clone ${nowTag()}`,
      description: "Temporary instruction for InstructionAI2 integration test",
      dataItems: tempItems,
      dataItemRoles: { role: tempItems[0].itemId, catalog: [tempItems[1].itemId], scenarios: [tempItems[2].itemId] },
      conversationStarter: { enabled: false, messages: [] },
      templateType: "retail_test",
      version: 1,
      revision: 1,
      source: "instruction_ai2_integration_test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cleanup.tempInstructionIds.push(tempInstructionId);
    cleanup.tempInstructionObjectIds.push(tempInstructionObjectId);

    const tempService = new InstructionAI2Service(db, { user: "ai2-integration-test" });
    const tempInventory = await tempService.buildInventory(tempInstructionObjectId.toString());
    assert(tempInventory.sections.catalogRows.length >= 1, "temp catalog rows missing");
    summary.checks.push("Temporary retail instruction created with explicit semantic mapping");

    const semanticProposal = await tempService.proposal_update_semantic_mapping(tempInstructionObjectId.toString(), {
      roleItemId: tempItems[0].itemId,
      catalogItemIds: [tempItems[1].itemId],
      scenarioItemIds: [tempItems[2].itemId],
    });
    assert.strictEqual(semanticProposal.operation, "instruction.updateSemanticMapping");
    assert((await tempService.preflightBatch({ changes: [semanticProposal] })).ok, "semantic mapping preflight failed");
    summary.checks.push("Semantic mapping proposal/preflight passed");

    const rejectProposal = await tempService.proposal_update_page_model(tempInstructionObjectId.toString(), {
      pageKeys: [page.pageKey],
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
    });
    tempService.proposals = [rejectProposal];
    const rejectBatch = await tempService.finalizeBatch({
      instructionId: tempInstructionObjectId.toString(),
      sessionId: "ai2_test_reject_session",
      requestId: "ai2_test_reject_request",
      message: "reject test",
    });
    cleanup.batchIds.push(rejectBatch.batchId);
    const beforeRejectPage = await db.collection(page.collName).findOne({ _id: page.doc._id });
    const rejectResult = await tempService.rejectBatch(rejectBatch.batchId, "integration reject test");
    assert(rejectResult, "reject failed");
    const afterRejectPage = await db.collection(page.collName).findOne({ _id: page.doc._id });
    assert.deepStrictEqual(afterRejectPage.aiConfig || {}, beforeRejectPage.aiConfig || {});
    summary.checks.push("Reject batch left AI TEST page unchanged");

    const invalidProposal = await tempService.proposal_update_page_model(tempInstructionObjectId.toString(), {
      pageKeys: [page.pageKey],
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
    });
    tempService.proposals = [invalidProposal];
    const invalidBatch = await tempService.finalizeBatch({
      instructionId: tempInstructionObjectId.toString(),
      sessionId: "ai2_test_invalid_session",
      requestId: "ai2_test_invalid_request",
      message: "invalid confirmation test",
    });
    cleanup.batchIds.push(invalidBatch.batchId);
    const invalidCommit = await tempService.commitBatch(invalidBatch.batchId, "ai2-integration-test", { confirmationToken: "wrong" });
    assert.strictEqual(invalidCommit.success, false);
    assert.strictEqual(invalidCommit.blocked, true);
    await tempService.rejectBatch(invalidBatch.batchId, "invalid confirmation test complete");
    summary.checks.push("Invalid confirmation token blocked commit");

    const createCollection = await tempService.proposal_create_image_collection(tempInstructionObjectId.toString(), {
      name: `AI2 TEST Collection ${nowTag()}`,
      description: "temporary collection for AI2 integration test",
    });
    const collectionCommit = await commitServiceBatch(tempService, tempInstructionObjectId.toString(), [createCollection], "create_collection", cleanup);
    const collectionId = collectionCommit.result.applied[0].result.collectionId;
    assert(collectionId, "collectionId missing");
    cleanup.tempCollectionIds.push(collectionId);

    const imageLabel = `AI2 TEST IMG ${nowTag()}`;
    const createAsset = await tempService.proposal_create_image_asset(tempInstructionObjectId.toString(), {
      label: imageLabel,
      description: "temporary asset for AI2 integration test",
      dataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      collectionIds: [collectionId],
    });
    const assetCommit = await commitServiceBatch(tempService, tempInstructionObjectId.toString(), [createAsset], "create_asset", cleanup);
    const assetId = assetCommit.result.applied[0].result.assetId;
    assert(assetId, "assetId missing");
    cleanup.tempAssetIds.push(assetId);
    const duplicateAssetProposal = await tempService.proposal_create_image_asset(tempInstructionObjectId.toString(), {
      label: imageLabel.toLowerCase(),
      dataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    });
    assert(duplicateAssetProposal.error === "duplicate_image_label", "duplicate image label was not blocked");
    summary.checks.push("Image collection/asset commit passed and duplicate normalized label was blocked");

    const imageTokenProposal = await tempService.proposal_set_product_image_token(tempInstructionObjectId.toString(), {
      itemId: tempItems[1].itemId,
      rowIndex: 0,
      column: "รูปสินค้า",
      imageLabel,
      useToken: true,
    });
    assert.strictEqual(imageTokenProposal.operation, "catalog.setImageToken");
    await commitServiceBatch(tempService, tempInstructionObjectId.toString(), [imageTokenProposal], "set_product_image_token", cleanup);
    const afterImageInventory = await tempService.buildInventory(tempInstructionObjectId.toString());
    assert(afterImageInventory.sections.catalogRows[0].imageRefs.some((ref) => ref.label === imageLabel), "product image token not visible in inventory");
    summary.checks.push("Product row image token committed and visible as #[IMAGE:...] inventory mapping");

    const pageRuntimeProposals = [
      await tempService.proposal_bind_instruction_to_pages(tempInstructionObjectId.toString(), { pageKeys: [page.pageKey] }),
      await tempService.proposal_update_page_model(tempInstructionObjectId.toString(), { pageKeys: [page.pageKey], model: "gpt-5.4-mini", reasoningEffort: "low" }),
      await tempService.proposal_update_page_image_collections(tempInstructionObjectId.toString(), { pageKeys: [page.pageKey], collectionIds: [collectionId] }),
      await tempService.proposal_update_followup_settings(tempInstructionObjectId.toString(), { pageKeys: [page.pageKey], autoFollowUpEnabled: true }),
      await tempService.proposal_update_followup_round(tempInstructionObjectId.toString(), { pageKeys: [page.pageKey], roundIndex: 0, message: "ยังสนใจสินค้าอยู่ไหมคะ", delayMinutes: 60 }),
    ];
    const pageRuntimePreflight = await tempService.preflightBatch({ changes: pageRuntimeProposals });
    assert(pageRuntimePreflight.ok, `page runtime preflight failed: ${JSON.stringify(pageRuntimePreflight.errors)}`);
    await commitServiceBatch(tempService, tempInstructionObjectId.toString(), pageRuntimeProposals, "page_runtime", cleanup);
    const pageAfterRuntime = await db.collection(page.collName).findOne({ _id: page.doc._id });
    assert.strictEqual(pageAfterRuntime.aiModel, "gpt-5.4-mini");
    assert((pageAfterRuntime.selectedImageCollections || []).map(String).includes(String(collectionId)), "AI TEST collection binding missing");
    summary.checks.push("AI TEST page binding/model/image collections/follow-up committed through batch confirmation");

    const updateText = await tempService.proposal_update_text_content(tempInstructionObjectId.toString(), {
      itemId: tempItems[0].itemId,
      mode: "append",
      content: "\n- integration test append",
    });
    const textCommit = await commitServiceBatch(tempService, tempInstructionObjectId.toString(), [updateText], "text_update", cleanup);
    const audit = await tempService.getAuditLog(tempInstructionObjectId.toString(), { batchId: textCommit.batch.batchId, limit: 10 });
    assert(audit.success && audit.logs.length > 0, "audit missing for text update");
    const revertProposal = await tempService.proposal_revert_audit_change(tempInstructionObjectId.toString(), {
      auditId: audit.logs[0].auditId,
    });
    assert.strictEqual(revertProposal.operation, "instruction.updateText");
    assert((await tempService.preflightBatch({ changes: [revertProposal] })).ok, "audit revert preflight failed");
    summary.checks.push("Audit log was readable and reversible proposal preflight passed");

    const usageRegistryProposal = await tempService.proposal_rebuild_image_asset_usage_registry(tempInstructionObjectId.toString(), { scope: "instruction" });
    assert.strictEqual(usageRegistryProposal.operation, "imageUsage.rebuildRegistry");
    await commitServiceBatch(tempService, tempInstructionObjectId.toString(), [usageRegistryProposal], "usage_registry", cleanup);
    const usageRows = await db.collection("image_asset_usage").find({ instructionId: tempInstructionId }).limit(20).toArray();
    assert(usageRows.length > 0, "image usage registry did not record temp instruction usage");
    summary.checks.push(`Image asset usage registry rebuild committed with ${usageRows.length} rows`);

    const assistantMessageId = new ObjectId();
    const assistantMessageDoc = {
      _id: assistantMessageId,
      senderId: `ai2_test_customer_${nowTag()}`,
      platform: page.platform,
      botId: page.botId,
      source: "ai2_integration_test",
      timestamp: new Date(),
    };
    const usage = await recordInstructionAI2MessageUsage(db, {
      assistantMessageDoc,
      instructionRefs: [{ instructionId: tempInstructionId, version: 1, source: "test" }],
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
      imageAssetIdsSent: [assetId],
      toolCalls: [{ name: "test_tool" }],
    });
    assert(usage?.usageId, "message usage not recorded");
    cleanup.usageIds.push(usage.usageId);
    cleanup.episodeIds.push(usage.episodeId);
    const attributed = await attributeOrderToLatestAssistantUsage(db, {
      _id: new ObjectId(),
      customerId: assistantMessageDoc.senderId,
      platform: page.platform,
      botId: page.botId,
      createdAt: new Date(Date.now() + 1000),
    });
    assert(attributed?.conversionAttributedToVersion === 1 || (attributed?.orderIds || []).length > 0, "order attribution failed");
    const episodeAnalytics = await tempService.getEpisodeAnalytics(tempInstructionObjectId.toString(), { limit: 5 });
    assert(episodeAnalytics.success && episodeAnalytics.episodes.some((ep) => ep.episodeId === usage.episodeId), "episode analytics missing test episode");
    const episodeDetail = await tempService.getEpisodeDetail(tempInstructionObjectId.toString(), { episodeId: usage.episodeId });
    assert(episodeDetail.success && episodeDetail.messages.some((msg) => msg.instructionVersion === 1), "episode detail missing version label");
    summary.checks.push("Message attribution, 48h episode model, order attribution, and version-labeled episode detail passed");

    const finalToolRegistry = tempService.getToolRegistry();
    assert(finalToolRegistry.tools.some((tool) => tool.name === "propose_rebuild_image_asset_usage_registry" && tool.confirmationRequired), "tool registry missing rebuild tool confirmation policy");
    summary.checks.push("Tool registry confirms broad tool access with proposal-only write policy");
    passed = true;
  } finally {
    if (connection?.db) {
      const db = connection.db;
      try {
        if (pageBackup) {
          await db.collection(pageBackup.collName).updateOne(
            { _id: pageBackup._id },
            { $set: { ...pageBackup.fields, updatedAt: pageBackup.fields.updatedAt || new Date() } },
          );
          summary.cleanup.push("AI TEST page restored");
        }
        if (followupBackup) {
          await db.collection("follow_up_page_settings").updateOne(
            { pageKey: followupBackup.pageKey },
            { $set: followupBackup },
            { upsert: true },
          );
          summary.cleanup.push("AI TEST follow-up restored");
        } else if (summary.aiTestPage?.pageKey) {
          await db.collection("follow_up_page_settings").deleteMany({ pageKey: summary.aiTestPage.pageKey });
          summary.cleanup.push("AI TEST follow-up test row deleted");
        }
        for (const page of cleanup.createdPages) {
          await db.collection(page.collName).deleteOne({ _id: page._id });
        }
        if (cleanup.createdPages.length) summary.cleanup.push("created AI TEST page deleted");
        if (cleanup.usageIds.length) {
          await db.collection("message_instruction_usage").deleteMany({ usageId: { $in: cleanup.usageIds } });
          summary.cleanup.push("test message usage deleted");
        }
        if (cleanup.episodeIds.length) {
          await db.collection("conversation_episodes").deleteMany({ episodeId: { $in: cleanup.episodeIds } });
          summary.cleanup.push("test episodes deleted");
        }
        if (tempInstructionId) {
          await db.collection("image_asset_usage").deleteMany({ instructionId: tempInstructionId });
          await db.collection("instruction_versions").deleteMany({ instructionId: tempInstructionId });
        }
        if (cleanup.batchIds.length) {
          await db.collection("instruction_ai2_audit").deleteMany({ batchId: { $in: cleanup.batchIds } });
          await db.collection("instruction_ai2_batches").deleteMany({ batchId: { $in: cleanup.batchIds } });
          summary.cleanup.push("test batches/audit deleted");
        }
        for (const assetId of cleanup.tempAssetIds) {
          const oid = ObjectId.isValid(assetId) ? new ObjectId(assetId) : assetId;
          await db.collection("instruction_assets").deleteOne({ _id: oid });
        }
        if (cleanup.tempAssetIds.length) summary.cleanup.push("test image assets deleted");
        for (const collectionId of cleanup.tempCollectionIds) {
          const oid = ObjectId.isValid(collectionId) ? new ObjectId(collectionId) : collectionId;
          await db.collection("image_collections").deleteOne({ _id: oid });
        }
        if (cleanup.tempCollectionIds.length) summary.cleanup.push("test image collections deleted");
        for (const id of cleanup.tempInstructionObjectIds) {
          await db.collection("instructions_v2").deleteOne({ _id: id });
        }
        if (cleanup.tempInstructionObjectIds.length) summary.cleanup.push("temp instruction deleted");
      } catch (cleanupError) {
        cleanupFailure = cleanupError;
        console.error("[AI2 Test] cleanup error:", cleanupError);
      }
    }
    if (connection?.close) await connection.close();
    if (passed) {
      if (cleanupFailure) {
        console.error(JSON.stringify({
          success: false,
          error: `cleanup failed: ${cleanupFailure.message}`,
          summary,
          stack: cleanupFailure.stack,
        }, null, 2));
        process.exitCode = 1;
      } else {
        console.log(JSON.stringify({ success: true, summary }, null, 2));
      }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
