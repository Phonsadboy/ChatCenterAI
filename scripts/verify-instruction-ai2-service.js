const assert = require("assert");
const {
  normalizeImageLabel,
  detectSemanticRoles,
  computeContentHash,
  buildRetailTemplateDataItems,
  extractImageTokensFromInstruction,
} = require("../services/instructionAI2Service");
const {
  normalizeInstructionAttributionRefs,
} = require("../services/instructionAI2AttributionService");

function run() {
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

  console.log("InstructionAI2 helper verification passed");
}

run();
