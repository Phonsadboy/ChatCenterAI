require("dotenv").config();

const { MongoClient } = require("mongodb");
const { headObject, isBucketConfigured } = require("../infra/storage/bucketStorage");

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "chatbot";

const ASSET_GROUPS = [
  {
    collectionName: "instruction_assets",
    storagePrefix: "instructions",
    variants: [
      { label: "main", fileNameField: "fileName", storageKeyField: "storageKey" },
      { label: "thumb", fileNameField: "thumbFileName", storageKeyField: "thumbStorageKey" },
    ],
  },
  {
    collectionName: "follow_up_assets",
    storagePrefix: "followup",
    variants: [
      { label: "main", fileNameField: "fileName", storageKeyField: "storageKey" },
      { label: "thumb", fileNameField: "thumbFileName", storageKeyField: "thumbStorageKey" },
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
    return "";
  }
  return normalizedPrefix
    ? `${normalizedPrefix}/${normalizedFileName}`
    : normalizedFileName;
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

async function verifyAssetCollection(db, config) {
  const coll = db.collection(config.collectionName);
  const docs = await coll.find({}).toArray();
  const summary = {
    target: config.collectionName,
    total: docs.length,
    checked: 0,
    ok: 0,
    missing: 0,
  };

  for (const doc of docs) {
    for (const variant of config.variants) {
      const fileName = doc?.[variant.fileNameField] || null;
      const storageKey =
        doc?.[variant.storageKeyField] ||
        buildAssetStorageKey(config.storagePrefix, fileName);
      if (!storageKey) {
        continue;
      }

      summary.checked += 1;
      const exists = await bucketObjectExists(storageKey);
      if (exists) {
        summary.ok += 1;
      } else {
        summary.missing += 1;
        console.warn(
          `[BucketVerify] Missing ${config.collectionName}:${doc?._id?.toString?.() || doc?._id} (${variant.label}) -> ${storageKey}`,
        );
      }
    }
  }

  return summary;
}

async function verifyBroadcastAssets(db) {
  const files = await db.collection("broadcastAssets.files").find({}).toArray();
  const summary = {
    target: "broadcastAssets.files",
    total: files.length,
    checked: files.length,
    ok: 0,
    missing: 0,
  };

  for (const file of files) {
    const storageKey = buildAssetStorageKey("broadcast", file.filename);
    const exists = await bucketObjectExists(storageKey);
    if (exists) {
      summary.ok += 1;
    } else {
      summary.missing += 1;
      console.warn(
        `[BucketVerify] Missing broadcast asset ${file?._id?.toString?.() || file?._id} -> ${storageKey}`,
      );
    }
  }

  return summary;
}

async function verifyBucketAssets(options = {}) {
  const mongoUri = String(options.mongoUri || MONGO_URI || "").trim();
  const dbName = String(options.mongoDbName || DB_NAME || "chatbot").trim() || "chatbot";

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
      results.push(await verifyAssetCollection(db, config));
    }
    results.push(await verifyBroadcastAssets(db));

    console.table(results);

    const totalMissing = results.reduce(
      (sum, item) => sum + (item.missing || 0),
      0,
    );
    if (totalMissing > 0) {
      return {
        ok: false,
        totalMissing,
        results,
      };
    }
    return {
      ok: true,
      totalMissing: 0,
      results,
    };
  } finally {
    await mongo.close();
  }
}

module.exports = {
  verifyBucketAssets,
};

if (require.main === module) {
  verifyBucketAssets()
    .then((summary) => {
      if (summary && !summary.ok) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error("[BucketVerify] Verification failed:", err);
      process.exit(1);
    });
}
