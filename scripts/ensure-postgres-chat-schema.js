"use strict";

const { createMigrationContext } = require("./lib/migrationContext");

async function main() {
  const context = createMigrationContext();
  try {
    if (!context.postgresRuntime.isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }
    await context.chatStorageService.ensureReady();
    console.log(
      `[Postgres] chat schema ready (hot retention ${context.runtimeConfig.chatHotRetentionDays} days)`,
    );
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error("[ensure-postgres-chat-schema] failed:", error?.message || error);
  process.exitCode = 1;
});
