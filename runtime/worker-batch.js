process.env.CCAI_RUNTIME_MODE = process.env.CCAI_RUNTIME_MODE || "worker-batch";
require("dotenv").config();

const { ensureRuntimeReady } = require("./bootstrap-runtime");
const { startRuntimeHealthServer } = require("./health-server");
const { startBatchWorkers } = require("../workers/batch");

(async () => {
  const healthServer = startRuntimeHealthServer("Runtime:worker-batch");
  await ensureRuntimeReady("Runtime:worker-batch");
  const workers = await startBatchWorkers();
  console.log("[Runtime:worker-batch] Batch workers started");

  const shutdown = async () => {
    await Promise.allSettled([
      workers?.followUpWorker?.close?.(),
      workers?.statsWorker?.close?.(),
      healthServer.close(),
    ]);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})().catch((error) => {
  console.error("[Runtime:worker-batch]", error);
  process.exit(1);
});
