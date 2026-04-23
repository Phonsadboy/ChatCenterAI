"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const { MongoClient } = require("mongodb");
const { buildRuntimeConfig } = require("../../services/runtimeConfig");
const { createPostgresRuntime } = require("../../services/postgresRuntime");
const { createProjectBucket } = require("../../services/projectBucket");
const { createChatStorageService } = require("../../services/chatStorageService");

function getMongoUri(env = process.env) {
  return (
    (typeof env.MONGO_URI === "string" && env.MONGO_URI.trim()) ||
    (typeof env.MONGODB_URI === "string" && env.MONGODB_URI.trim()) ||
    ""
  );
}

function normalizeForJson(value) {
  if (value === null || typeof value === "undefined") return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) {
    return {
      type: "buffer",
      base64: value.toString("base64"),
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForJson(entry));
  }
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") {
      return value.toHexString();
    }
    if (typeof value.toString === "function" && value.constructor?.name === "ObjectId") {
      return value.toString();
    }
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      output[key] = normalizeForJson(entry);
    });
    return output;
  }
  return value;
}

function serializeDocId(rawId) {
  if (!rawId) return "";
  if (typeof rawId.toHexString === "function") return rawId.toHexString();
  if (typeof rawId.toString === "function") return rawId.toString();
  return String(rawId);
}

function normalizeFollowUpBotId(value) {
  if (value === null || typeof value === "undefined") return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function resolveAppDocumentId(collectionName, doc = {}) {
  if (!collectionName || !doc || typeof doc !== "object") return "";

  if (collectionName === "settings") {
    return typeof doc.key === "string" ? doc.key.trim() : "";
  }
  if (collectionName === "user_profiles") {
    const userId = typeof doc.userId === "string" ? doc.userId.trim() : "";
    const platform =
      typeof doc.platform === "string" && doc.platform.trim()
        ? doc.platform.trim()
        : "line";
    return userId ? `${userId}:${platform}` : "";
  }
  if (collectionName === "follow_up_status") {
    return typeof doc.senderId === "string" ? doc.senderId.trim() : "";
  }
  if (collectionName === "follow_up_page_settings") {
    const platform =
      typeof doc.platform === "string" ? doc.platform.trim().toLowerCase() : "";
    const botId = normalizeFollowUpBotId(doc.botId);
    return platform ? `${platform}:${botId || "default"}` : "";
  }
  if (
    collectionName === "user_tags" ||
    collectionName === "user_notes" ||
    collectionName === "user_purchase_status" ||
    collectionName === "user_unread_counts"
  ) {
    return typeof doc.userId === "string" ? doc.userId.trim() : "";
  }
  if (collectionName === "active_user_status") {
    return typeof doc.senderId === "string" ? doc.senderId.trim() : "";
  }
  return serializeDocId(doc._id);
}

function createHotCutoff(days) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(days || 60));
  return cutoff;
}

function monthWindowFromKey(monthKey) {
  const [year, month] = String(monthKey || "")
    .split("-")
    .map((value) => Number.parseInt(value, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}

function createMigrationContext() {
  const runtimeConfig = buildRuntimeConfig(process.env);
  const mongoUri = getMongoUri(process.env);
  const postgresRuntime = createPostgresRuntime(runtimeConfig.postgres);
  const projectBucket = createProjectBucket(runtimeConfig.bucket);
  const chatStorageService = createChatStorageService({
    postgresRuntime,
    bucketClient: projectBucket,
    hotRetentionDays: runtimeConfig.chatHotRetentionDays,
    logger: console,
  });

  let mongoClient = null;

  async function connectMongo() {
    if (!mongoUri) {
      throw new Error("MONGO_URI / MONGODB_URI is not configured");
    }
    if (mongoClient) return mongoClient;
    mongoClient = new MongoClient(mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
    });
    await mongoClient.connect();
    return mongoClient;
  }

  async function getMongoDb() {
    return (await connectMongo()).db("chatbot");
  }

  async function close() {
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null;
    }
    await postgresRuntime.close();
  }

  return {
    chatStorageService,
    close,
    connectMongo,
    createHotCutoff,
    getMongoDb,
    mongoUri,
    monthWindowFromKey,
    normalizeForJson,
    postgresRuntime,
    projectBucket,
    resolveAppDocumentId,
    runtimeConfig,
    serializeDocId,
  };
}

module.exports = {
  createHotCutoff,
  createMigrationContext,
  monthWindowFromKey,
  normalizeForJson,
  resolveAppDocumentId,
  serializeDocId,
};
