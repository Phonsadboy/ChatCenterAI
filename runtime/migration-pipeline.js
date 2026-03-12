const { parseBoolean } = require("../infra/runtimeConfig");
const { migrateMongoToPostgres } = require("../scripts/migrate-mongo-to-postgres");
const { migrateGridFsToBucket } = require("../scripts/migrate-gridfs-to-bucket");
const { verifyPostgresParity } = require("../scripts/verify-postgres-parity");
const { verifyBucketAssets } = require("../scripts/verify-bucket-assets");

function resolveMigrationPipelineOptions(env = process.env) {
  return {
    runMongoToPg: parseBoolean(
      env.CCAI_MIGRATION_RUN_MONGO_TO_PG,
      true,
    ),
    runGridFsToBucket: parseBoolean(
      env.CCAI_MIGRATION_RUN_GRIDFS_TO_BUCKET,
      true,
    ),
    verifyParity: parseBoolean(
      env.CCAI_MIGRATION_VERIFY_PARITY,
      false,
    ),
    verifyBucket: parseBoolean(
      env.CCAI_MIGRATION_VERIFY_BUCKET,
      false,
    ),
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

function shouldSkipMongoMigration() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  const mongoEnabled = parseBoolean(
    process.env.CCAI_MONGO_ENABLED,
    Boolean(mongoUri),
  );
  const respectMongoEnabled = parseBoolean(
    process.env.CCAI_MIGRATION_RESPECT_MONGO_ENABLED,
    true,
  );

  if (!mongoUri) return true;
  if (/disabled_mongo_uri/i.test(mongoUri)) return true;
  if (respectMongoEnabled && !mongoEnabled) return true;
  return false;
}

function isMongoUnavailableError(error) {
  const message = String(error?.message || error || "");
  return /(mongo.*not configured|MongoDB runtime is disabled|MongoServerSelectionError|MongoNetworkError|ECONNREFUSED|ENOTFOUND|authentication failed|timed out)/i.test(
    message,
  );
}

async function runDataMigrationPipeline(options = {}) {
  const logger = options.logger || console;
  const pipelineOptions = options.pipelineOptions || resolveMigrationPipelineOptions();
  const summary = {
    runMongoToPg: false,
    runGridFsToBucket: false,
    verifyParity: null,
    verifyBucket: null,
  };

  if (pipelineOptions.runMongoToPg) {
    if (shouldSkipMongoMigration()) {
      summary.runMongoToPg = "skipped_mongo_disabled_or_missing";
      logger.log(
        "[MigrationPipeline] MongoDB -> PostgreSQL migration skipped (Mongo disabled or MONGO_URI missing)",
      );
    } else {
      try {
        await migrateMongoToPostgres({
          skipSqlMigrations: true,
        });
        summary.runMongoToPg = true;
        logger.log("[MigrationPipeline] MongoDB -> PostgreSQL migration completed");
      } catch (error) {
        const skipOnUnavailable = parseBoolean(
          process.env.CCAI_MIGRATION_SKIP_ON_MONGO_UNAVAILABLE,
          true,
        );
        if (skipOnUnavailable && isMongoUnavailableError(error)) {
          summary.runMongoToPg = "skipped_mongo_unavailable";
          logger.warn(
            "[MigrationPipeline] MongoDB -> PostgreSQL migration skipped because Mongo is unavailable:",
            error?.message || error,
          );
        } else {
          throw error;
        }
      }
    }
  }

  if (pipelineOptions.runGridFsToBucket) {
    await migrateGridFsToBucket({
      dryRun: pipelineOptions.gridFsDryRun,
      overwrite: pipelineOptions.gridFsOverwrite,
    });
    summary.runGridFsToBucket = true;
    logger.log("[MigrationPipeline] GridFS -> Bucket migration completed");
  }

  if (pipelineOptions.verifyParity) {
    const paritySummary = await verifyPostgresParity();
    summary.verifyParity = paritySummary;
    if (paritySummary?.hasMismatch && pipelineOptions.failOnVerifyMismatch) {
      throw new Error("PostgreSQL parity verification failed");
    }
    logger.log(
      "[MigrationPipeline] PostgreSQL parity verification:",
      paritySummary?.hasMismatch ? "mismatch-detected" : "ok",
    );
  }

  if (pipelineOptions.verifyBucket) {
    const bucketSummary = await verifyBucketAssets();
    summary.verifyBucket = bucketSummary;
    if (bucketSummary?.totalMissing > 0 && pipelineOptions.failOnVerifyMismatch) {
      throw new Error("Bucket asset verification failed");
    }
    logger.log(
      "[MigrationPipeline] Bucket verification:",
      bucketSummary?.totalMissing > 0
        ? `missing=${bucketSummary.totalMissing}`
        : "ok",
    );
  }

  return summary;
}

module.exports = {
  resolveMigrationPipelineOptions,
  runDataMigrationPipeline,
};
