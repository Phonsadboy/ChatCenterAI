const { parseBoolean } = require("../infra/runtimeConfig");

function resolveMigrationPipelineOptions(env = process.env) {
  return {
    runMongoToPg: false,
    runGridFsToBucket: false,
    verifyParity: false,
    verifyBucket: false,
    failOnVerifyMismatch: parseBoolean(
      env.CCAI_MIGRATION_FAIL_ON_VERIFY_MISMATCH,
      true,
    ),
    gridFsDryRun: parseBoolean(
      env.CCAI_MIGRATION_GRIDFS_DRY_RUN,
      false,
    ),
    gridFsOverwrite: parseBoolean(
      env.CCAI_MIGRATION_GRIDFS_OVERWRITE,
      false,
    ),
  };
}

async function runDataMigrationPipeline(options = {}) {
  const logger = options.logger || console;
  const pipelineOptions = options.pipelineOptions || resolveMigrationPipelineOptions();
  const summary = {
    runMongoToPg: "retired",
    runGridFsToBucket: "retired",
    verifyParity: {
      skipped: true,
      reason: "retired_from_runtime_mainline",
    },
    verifyBucket: {
      skipped: true,
      reason: "retired_from_runtime_mainline",
    },
  };

  if (
    options.pipelineOptions ||
    pipelineOptions.runMongoToPg ||
    pipelineOptions.runGridFsToBucket ||
    pipelineOptions.verifyParity ||
    pipelineOptions.verifyBucket
  ) {
    logger.warn(
      "[MigrationPipeline] Mongo/GridFS migration tooling has been retired from runtime mainline. Use archived/manual tooling outside the application runtime if historical validation is still required.",
    );
  }

  return summary;
}

module.exports = {
  resolveMigrationPipelineOptions,
  runDataMigrationPipeline,
};
