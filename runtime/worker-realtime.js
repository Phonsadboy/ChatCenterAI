process.env.CCAI_RUNTIME_MODE = process.env.CCAI_RUNTIME_MODE || "worker-realtime";
require("dotenv").config();

const { ensureRuntimeReady } = require("./bootstrap-runtime");
const { startRealtimeWorkers } = require("../workers/realtime");

(async () => {
  await ensureRuntimeReady("Runtime:worker-realtime");
  await startRealtimeWorkers();
})().catch((error) => {
  console.error("[Runtime:worker-realtime]", error);
  process.exit(1);
});
