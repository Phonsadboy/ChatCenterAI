const express = require("express");
const { GridFSBucket } = require("mongodb");

// Assets Routes
// Static asset serving routes for instructions and follow-up images
const router = express.Router();

// Import dependencies from index.js
// These will be passed in from index.js to maintain backward compatibility
let connectDB, toObjectId;

// Initialize function to receive dependencies from index.js
function initAssetRoutes(deps) {
  connectDB = deps.connectDB;
  toObjectId = deps.toObjectId;
}

// GET /assets/instructions/:fileName
// Serve instruction asset files from GridFS
router.get("/assets/instructions/:fileName", async (req, res, next) => {
  try {
    const { fileName } = req.params;
    if (!fileName) return next();

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");
    const doc = await coll.findOne({
      $or: [
        { fileName },
        { thumbFileName: fileName },
        { label: fileName.replace(/\.[^/.]+$/, "") },
        { label: fileName.replace(/_thumb\.[^/.]+$/, "") },
      ],
    });

    if (!doc) return next();

    const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });
    const isThumb =
      fileName === doc.thumbFileName ||
      fileName.endsWith("_thumb.jpg") ||
      fileName.endsWith("_thumb.jpeg");
    const targetName = isThumb
      ? doc.thumbFileName || `${doc.label}_thumb.jpg`
      : doc.fileName || `${doc.label}.jpg`;
    const targetId = isThumb ? doc.thumbFileId : doc.fileId;
    if (!targetName) return next();
    let fileObjectId = toObjectId(targetId);

    if (!fileObjectId) {
      const files = await bucket
        .find({ filename: targetName })
        .sort({ uploadDate: -1 })
        .limit(1)
        .toArray();
      if (!files.length) return next();
      fileObjectId = files[0]._id;
    }

    const stream = bucket.openDownloadStream(fileObjectId);

    res.set("Content-Type", doc.mime || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    stream.on("error", (err) => {
      if (err.code === "FileNotFound") return next();
      next(err);
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// GET /assets/followup/:fileName
// Serve follow-up asset files from GridFS
router.get("/assets/followup/:fileName", async (req, res, next) => {
  try {
    const { fileName } = req.params;
    if (!fileName) return next();

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_assets");
    const doc = await coll.findOne({
      $or: [{ fileName }, { thumbName: fileName }, { thumbFileName: fileName }],
    });

    if (!doc) return next();

    const bucket = new GridFSBucket(db, { bucketName: "followupAssets" });
    const isThumb =
      fileName === doc.thumbName ||
      fileName === doc.thumbFileName ||
      fileName.endsWith("_thumb.jpg") ||
      fileName.endsWith("_thumb.jpeg");
    const targetName = isThumb
      ? doc.thumbFileName || doc.thumbName
      : doc.fileName;
    const targetId = isThumb ? doc.thumbFileId || null : doc.fileId || null;
    if (!targetName) return next();
    let fileObjectId = toObjectId(targetId);

    if (!fileObjectId) {
      const files = await bucket
        .find({ filename: targetName })
        .sort({ uploadDate: -1 })
        .limit(1)
        .toArray();
      if (!files.length) return next();
      fileObjectId = files[0]._id;
    }

    const stream = bucket.openDownloadStream(fileObjectId);

    res.set("Content-Type", doc.mime || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    stream.on("error", (err) => {
      if (err.code === "FileNotFound") return next();
      next(err);
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// GET /favicon.ico
// Avoid favicon 404s in environments without a favicon
router.get("/favicon.ico", (req, res) => res.sendStatus(204));

module.exports = { router, initAssetRoutes };

