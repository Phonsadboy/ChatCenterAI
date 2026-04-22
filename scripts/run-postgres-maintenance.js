#!/usr/bin/env node

require("dotenv").config();

if (process.env.DATABASE_PUBLIC_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
  if (!process.env.CCAI_PG_SSL_REJECT_UNAUTHORIZED) {
    process.env.CCAI_PG_SSL_REJECT_UNAUTHORIZED = "false";
  }
}

const { closePgPool } = require("../infra/postgres");
const { runPostgresMaintenance } = require("../services/postgresMaintenanceService");

(async () => {
  const summary = await runPostgresMaintenance();
  console.log(JSON.stringify(summary, null, 2));
})()
  .catch((error) => {
    console.error("[PostgresMaintenance]", error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPool().catch(() => {});
  });
