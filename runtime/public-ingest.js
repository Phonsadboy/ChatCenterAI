process.env.CCAI_RUNTIME_MODE = process.env.CCAI_RUNTIME_MODE || "public-ingest";
require("dotenv").config();

const { ensureRuntimeReady } = require("./bootstrap-runtime");
const { startServer } = require("../index");

(async () => {
  await ensureRuntimeReady("Runtime:public-ingest");
  await startServer();
})().catch((error) => {
  console.error("[Runtime:public-ingest]", error);
  process.exit(1);
});
