process.env.CCAI_RUNTIME_MODE = process.env.CCAI_RUNTIME_MODE || "worker-realtime";
require("dotenv").config();

const { ensureRuntimeReady } = require("./bootstrap-runtime");
const { startRuntimeHealthServer } = require("./health-server");
const { startRealtimeWorkers } = require("../workers/realtime");

(async () => {
  const healthServer = startRuntimeHealthServer("Runtime:worker-realtime");
  await ensureRuntimeReady("Runtime:worker-realtime");
  const worker = await startRealtimeWorkers();

  const shutdown = async () => {
    await Promise.allSettled([
      worker?.close?.(),
      healthServer.close(),
    ]);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})().catch((error) => {
  console.error("[Runtime:worker-realtime]", error);
  process.exit(1);
});
