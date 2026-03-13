const { parseBoolean } = require("../infra/runtimeConfig");

function resolveMigrationPipelineOptions(env = process.env) {
  return {
    runSqlMigrations: parseBoolean(
      env.CCAI_MIGRATION_RUN_SQL_MIGRATIONS,
      true,
    ),
    autoRunOnDeploy: parseBoolean(
      env.CCAI_MIGRATION_AUTO_RUN_ON_DEPLOY,
      true,
    ),
    failOnVerifyMismatch: parseBoolean(
      env.CCAI_MIGRATION_FAIL_ON_VERIFY_MISMATCH,
      true,
    ),
  };
}

async function runDataMigrationPipeline(options = {}) {
  const logger = options.logger || console;
  const pipelineOptions = options.pipelineOptions || resolveMigrationPipelineOptions();
  const summary = {
    runSqlMigrations: pipelineOptions.runSqlMigrations === true ? "handled_by_runtime" : "disabled",
    autoRunOnDeploy: pipelineOptions.autoRunOnDeploy === true ? "enabled" : "disabled",
    verification: {
      skipped: true,
      reason: "manual_validation_outside_runtime",
    },
  };

  if (options.pipelineOptions) {
    logger.warn(
      "[MigrationPipeline] Runtime migration pipeline only tracks PostgreSQL bootstrap options. Historical data validation now runs outside the application runtime.",
    );
  }

  return summary;
}

module.exports = {
  resolveMigrationPipelineOptions,
  runDataMigrationPipeline,
};
