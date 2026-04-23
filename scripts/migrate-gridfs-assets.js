"use strict";

const { GridFSBucket } = require("mongodb");
const { createMigrationContext } = require("./lib/migrationContext");

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function uploadGridFsObject({
  bucket,
  fileId,
  fileName,
  objectKey,
  projectBucket,
  contentType,
}) {
  const buffer = await streamToBuffer(bucket.openDownloadStream(fileId));
  await projectBucket.putBuffer(objectKey, buffer, {
    contentType: contentType || "application/octet-stream",
    cacheControl: "private, max-age=31536000, immutable",
    metadata: {
      sourceFileName: fileName || "",
      sourceBucket: bucket.s.options.bucketName || "",
    },
  });
  return buffer.length;
}

async function main() {
  const context = createMigrationContext();
  try {
    if (!context.projectBucket.isConfigured()) {
      throw new Error("Bucket is not configured");
    }
    if (!context.postgresRuntime.isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }

    await context.chatStorageService.ensureReady();
    const db = await context.getMongoDb();

    const assetConfigs = [
      {
        collectionName: "instruction_assets",
        bucketName: "instructionAssets",
        scope: "instruction_assets",
      },
      {
        collectionName: "follow_up_assets",
        bucketName: "followupAssets",
        scope: "follow_up_assets",
      },
    ];

    for (const assetConfig of assetConfigs) {
      const coll = db.collection(assetConfig.collectionName);
      const gridFsBucket = new GridFSBucket(db, {
        bucketName: assetConfig.bucketName,
      });
      const docs = await coll.find({}).toArray();

      for (const doc of docs) {
        const assetId = context.serializeDocId(doc?._id);
        if (!assetId) continue;

        let originalKey = null;
        let originalSize = null;
        if (doc.fileId) {
          originalKey = context.projectBucket.buildKey(
            "assets",
            assetConfig.scope,
            assetId,
            doc.fileName || "original",
          );
          originalSize = await uploadGridFsObject({
            bucket: gridFsBucket,
            fileId: doc.fileId,
            fileName: doc.fileName,
            objectKey: originalKey,
            projectBucket: context.projectBucket,
            contentType: doc.mime || "image/jpeg",
          });
        }

        let thumbKey = null;
        if (doc.thumbFileId) {
          thumbKey = context.projectBucket.buildKey(
            "assets",
            assetConfig.scope,
            assetId,
            doc.thumbFileName || doc.thumbName || "thumb",
          );
          await uploadGridFsObject({
            bucket: gridFsBucket,
            fileId: doc.thumbFileId,
            fileName: doc.thumbFileName || doc.thumbName,
            objectKey: thumbKey,
            projectBucket: context.projectBucket,
            contentType: doc.mime || "image/jpeg",
          });
        }

        await context.chatStorageService.upsertAssetObject(
          assetConfig.scope,
          assetId,
          {
            fileName: doc.fileName || null,
            bucketKey: originalKey,
            mimeType: doc.mime || null,
            sizeBytes: doc.size || originalSize || null,
            metadata: {
              fileName: doc.fileName || null,
              thumbFileName: doc.thumbFileName || doc.thumbName || null,
              thumbName: doc.thumbName || doc.thumbFileName || null,
              thumbMime: doc.thumbMime || doc.mime || null,
              thumbBucketKey: thumbKey,
              originalDocument: context.normalizeForJson(doc),
              migratedFrom: assetConfig.bucketName,
            },
          },
        );

        await coll.updateOne(
          { _id: doc._id },
          {
            $set: {
              bucketKey: originalKey || null,
              thumbBucketKey: thumbKey || null,
              storage: originalKey || thumbKey ? "hybrid" : doc.storage || "mongo",
              updatedAt: new Date(),
            },
          },
        );
      }

      console.log(
        `[migrate-gridfs-assets] ${assetConfig.collectionName} migrated=${docs.length}`,
      );
    }

    const broadcastBucket = new GridFSBucket(db, { bucketName: "broadcastAssets" });
    const broadcastFiles = await db.collection("broadcastAssets.files").find({}).toArray();
    for (const file of broadcastFiles) {
      const assetId = context.serializeDocId(file?._id);
      const objectKey = context.projectBucket.buildKey(
        "assets",
        "broadcast_assets",
        assetId,
        file.filename || "broadcast",
      );
      const sizeBytes = await uploadGridFsObject({
        bucket: broadcastBucket,
        fileId: file._id,
        fileName: file.filename,
        objectKey,
        projectBucket: context.projectBucket,
        contentType: file.contentType || "application/octet-stream",
      });
      await context.chatStorageService.upsertAssetObject(
        "broadcast_assets",
        assetId,
        {
          fileName: file.filename || null,
          bucketKey: objectKey,
          mimeType: file.contentType || null,
          sizeBytes,
          metadata: {
            originalDocument: context.normalizeForJson(file),
            migratedFrom: "broadcastAssets",
          },
        },
      );
    }
    console.log(
      `[migrate-gridfs-assets] broadcast_assets migrated=${broadcastFiles.length}`,
    );
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error("[migrate-gridfs-assets] failed:", error?.message || error);
  process.exitCode = 1;
});
