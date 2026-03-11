require("dotenv").config();

const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");
const {
  headObject,
  isBucketConfigured,
  putObject,
} = require("../infra/storage/bucketStorage");

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "chatbot";

const ASSET_GROUPS = [
  {
    collectionName: "instruction_assets",
    bucketName: "instructionAssets",
    storagePrefix: "instructions",
    variants: [
      {
        label: "main",
        fileNameField: "fileName",
        fileIdField: "fileId",
        storageKeyField: "storageKey",
        contentTypeField: "mime",
      },
      {
        label: "thumb",
        fileNameField: "thumbFileName",
        fileIdField: "thumbFileId",
        storageKeyField: "thumbStorageKey",
        contentTypeField: "thumbMime",
      },
    ],
  },
  {
    collectionName: "follow_up_assets",
    bucketName: "followupAssets",
    storagePrefix: "followup",
    variants: [
      {
        label: "main",
        fileNameField: "fileName",
        fileIdField: "fileId",
        storageKeyField: "storageKey",
        contentTypeField: "mime",
      },
      {
        label: "thumb",
        fileNameField: "thumbFileName",
        fileIdField: "thumbFileId",
        storageKeyField: "thumbStorageKey",
        contentTypeField: "thumbMime",
      },
    ],
  },
];

function buildAssetStorageKey(prefix, filename) {
  const normalizedPrefix = String(prefix || "assets")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const normalizedFileName = String(filename || "")
    .trim()
    .replace(/^\/+/, "");
  if (!normalizedFileName) {
    throw new Error("Missing filename for asset storage key");
  }
  return normalizedPrefix
    ? `${normalizedPrefix}/${normalizedFileName}`
    : normalizedFileName;
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(id);
  } catch (_) {
    return null;
  }
}

function isBucketNotFoundError(err) {
  const statusCode = err?.$metadata?.httpStatusCode;
  const errorName = err?.name || err?.Code || err?.code || "";
  return (
    statusCode === 404 ||
    errorName === "NotFound" ||
    errorName === "NoSuchKey" ||
    errorName === "NoSuchBucket"
  );
}

function normalizeStorageMetadata(metadata = {}) {
  const normalized = {};
  Object.entries(metadata || {}).forEach(([key, value]) => {
    if (value === null || typeof value === "undefined") return;
    normalized[String(key)] =
      typeof value === "string" ? value : JSON.stringify(value);
  });
  return normalized;
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function bucketObjectExists(storageKey) {
  try {
    await headObject(storageKey);
    return true;
  } catch (err) {
    if (isBucketNotFoundError(err)) {
      return false;
    }
    throw err;
  }
}

async function findGridFsFile(bucket, fileId, fileName) {
  const objectId = toObjectId(fileId);
  if (objectId) {
    const files = await bucket.find({ _id: objectId }).limit(1).toArray();
    if (files.length > 0) {
      return files[0];
    }
  }

  if (fileName) {
    const files = await bucket
      .find({ filename: fileName })
      .sort({ uploadDate: -1 })
      .limit(1)
      .toArray();
    if (files.length > 0) {
      return files[0];
    }
  }

  return null;
}

async function readGridFsFile(bucket, fileId, fileName) {
  const fileDoc = await findGridFsFile(bucket, fileId, fileName);
  if (!fileDoc) {
    return null;
  }

  const buffer = await streamToBuffer(bucket.openDownloadStream(fileDoc._id));
  return { fileDoc, buffer };
}

async function migrateAssetCollection(db, config, options = {}) {
  const dryRun = options.dryRun === true;
  const overwrite = options.overwrite === true;
  const coll = db.collection(config.collectionName);
  const gridFsBucket = new GridFSBucket(db, { bucketName: config.bucketName });
  const docs = await coll.find({}).toArray();
  const summary = {
    collectionName: config.collectionName,
    total: docs.length,
    migrated: 0,
    skipped: 0,
    missing: 0,
    updatedMetadata: 0,
  };

  for (const doc of docs) {
    const updates = {
      storage: "bucket",
      migratedToBucketAt: new Date(),
      updatedAt: new Date(),
    };
    let changed = doc?.storage !== "bucket" || !doc?.migratedToBucketAt;
    let hasMigratedVariant = false;

    for (const variant of config.variants) {
      const fileName = doc?.[variant.fileNameField] || null;
      const fileId = doc?.[variant.fileIdField] || null;
      if (!fileName && !fileId) {
        continue;
      }

      const storageKey =
        doc?.[variant.storageKeyField] ||
        buildAssetStorageKey(config.storagePrefix, fileName);

      const exists = await bucketObjectExists(storageKey);
      if (!exists || overwrite) {
        const payload = await readGridFsFile(gridFsBucket, fileId, fileName);
        if (!payload) {
          console.warn(
            `[GridFS->Bucket] Missing source file for ${config.collectionName}:${doc?._id?.toString?.() || doc?._id} (${variant.label})`,
          );
          summary.missing += 1;
          continue;
        }

        if (!dryRun) {
          await putObject(storageKey, payload.buffer, {
            contentType:
              doc?.[variant.contentTypeField] ||
              doc?.mime ||
              payload.fileDoc?.contentType ||
              "application/octet-stream",
            metadata: normalizeStorageMetadata({
              sourceCollection: config.collectionName,
              sourceBucket: config.bucketName,
              legacyAssetId: doc?._id?.toString?.() || "",
              legacyFileId: payload.fileDoc?._id?.toString?.() || "",
              variant: variant.label,
            }),
          });
        }

        summary.migrated += 1;
      } else {
        summary.skipped += 1;
      }

      if (doc?.[variant.storageKeyField] !== storageKey) {
        updates[variant.storageKeyField] = storageKey;
        changed = true;
      }
      hasMigratedVariant = true;
    }

    if (!hasMigratedVariant) {
      continue;
    }

    if (!dryRun && changed) {
      await coll.updateOne({ _id: doc._id }, { $set: updates });
      summary.updatedMetadata += 1;
    }
  }

  return summary;
}

async function migrateBroadcastAssets(db, options = {}) {
  const dryRun = options.dryRun === true;
  const overwrite = options.overwrite === true;
  const gridFsBucket = new GridFSBucket(db, { bucketName: "broadcastAssets" });
  const files = await gridFsBucket.find({}).toArray();
  const summary = {
    collectionName: "broadcastAssets.files",
    total: files.length,
    migrated: 0,
    skipped: 0,
    missing: 0,
  };

  for (const file of files) {
    const storageKey = buildAssetStorageKey("broadcast", file.filename);
    const exists = await bucketObjectExists(storageKey);
    if (exists && !overwrite) {
      summary.skipped += 1;
      continue;
    }

    const payload = await readGridFsFile(gridFsBucket, file._id, file.filename);
    if (!payload) {
      summary.missing += 1;
      continue;
    }

    if (!dryRun) {
      await putObject(storageKey, payload.buffer, {
        contentType: file.contentType || "application/octet-stream",
        metadata: normalizeStorageMetadata({
          sourceCollection: "broadcastAssets.files",
          sourceBucket: "broadcastAssets",
          legacyFileId: file._id?.toString?.() || "",
        }),
      });
    }

    summary.migrated += 1;
  }

  return summary;
}

function parseBooleanOption(value, defaultValue = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return defaultValue;
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const argSet = new Set(argv);
  return {
    dryRun: argSet.has("--dry-run"),
    overwrite: argSet.has("--overwrite"),
  };
}

async function migrateGridFsToBucket(options = {}) {
  const mongoUri = String(options.mongoUri || MONGO_URI || "").trim();
  const dbName = String(options.mongoDbName || DB_NAME || "chatbot").trim() || "chatbot";
  const dryRun = parseBooleanOption(options.dryRun, false);
  const overwrite = parseBooleanOption(options.overwrite, false);

  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }
  if (!isBucketConfigured()) {
    throw new Error("Bucket storage is not configured");
  }

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();

  try {
    const db = mongo.db(dbName);
    const results = [];

    for (const config of ASSET_GROUPS) {
      results.push(
        await migrateAssetCollection(db, config, {
          dryRun,
          overwrite,
        }),
      );
    }
    results.push(
      await migrateBroadcastAssets(db, {
        dryRun,
        overwrite,
      }),
    );

    console.table(
      results.map((item) => ({
        target: item.collectionName,
        total: item.total,
        migrated: item.migrated,
        skipped: item.skipped,
        missing: item.missing,
        updatedMetadata: item.updatedMetadata || 0,
      })),
    );

    if (dryRun) {
      console.log("[GridFS->Bucket] Dry run complete. No metadata was changed.");
    }
    return results;
  } finally {
    await mongo.close();
  }
}

module.exports = {
  migrateGridFsToBucket,
};

if (require.main === module) {
  migrateGridFsToBucket(parseCliArgs()).catch((err) => {
    console.error("[GridFS->Bucket] Migration failed:", err);
    process.exit(1);
  });
}
