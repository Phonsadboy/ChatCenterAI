process.env.CCAI_RUNTIME_MODE = process.env.CCAI_RUNTIME_MODE || "worker-batch";
require("dotenv").config();

const { ensureRuntimeReady } = require("./bootstrap-runtime");
const { startBatchWorkers } = require("../workers/batch");

(async () => {
  await ensureRuntimeReady("Runtime:worker-batch");
  await startBatchWorkers();
  console.log("[Runtime:worker-batch] Batch workers started");
})().catch((error) => {
  console.error("[Runtime:worker-batch]", error);
  process.exit(1);
});
