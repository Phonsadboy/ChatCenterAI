require("dotenv").config();

const mode = String(process.env.CCAI_RUNTIME_MODE || "admin-app")
  .trim()
  .toLowerCase();

const modeToModule = {
  legacy: "./admin-app",
  "admin-app": "./admin-app",
  "public-ingest": "./public-ingest",
  "worker-realtime": "./worker-realtime",
  "worker-batch": "./worker-batch",
  "migration-runner": "./migration-runner",
};

const targetModule = modeToModule[mode];

if (!targetModule) {
  console.error(`[Runtime] Unsupported CCAI_RUNTIME_MODE: ${mode}`);
  process.exit(1);
}

require(targetModule);
