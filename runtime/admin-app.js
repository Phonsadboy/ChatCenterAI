process.env.CCAI_RUNTIME_MODE = process.env.CCAI_RUNTIME_MODE || "admin-app";
require("dotenv").config();

const { ensureRuntimeReady } = require("./bootstrap-runtime");
const { startServer } = require("../index");

(async () => {
  await ensureRuntimeReady("Runtime:admin-app");
  await startServer();
})().catch((error) => {
  console.error("[Runtime:admin-app]", error);
  process.exit(1);
});
