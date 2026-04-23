"use strict";

const {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");

function sanitizeKeySegment(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-");
}

async function streamBodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createProjectBucket(config = {}) {
  const {
    bucketName = "",
    endpoint = "",
    region = "auto",
    accessKeyId = "",
    secretAccessKey = "",
    forcePathStyle = true,
    keyPrefix = "",
  } = config;

  let client = null;

  function isConfigured() {
    return !!(
      bucketName &&
      endpoint &&
      accessKeyId &&
      secretAccessKey
    );
  }

  function getClient() {
    if (!isConfigured()) {
      throw new Error("Bucket is not configured");
    }
    if (!client) {
      client = new S3Client({
        endpoint,
        region,
        forcePathStyle,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
    return client;
  }

  function buildKey(...segments) {
    const parts = [];
    if (keyPrefix) parts.push(sanitizeKeySegment(keyPrefix));
    segments
      .map(sanitizeKeySegment)
      .filter(Boolean)
      .forEach((part) => parts.push(part));
    return parts.join("/");
  }

  async function putBuffer(key, buffer, options = {}) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("putBuffer expects a Buffer");
    }
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
        Metadata: options.metadata,
      }),
    );
    return {
      bucketName,
      key,
      sizeBytes: buffer.length,
    };
  }

  async function getObject(key) {
    const response = await getClient().send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    return response;
  }

  async function getObjectBuffer(key) {
    const response = await getObject(key);
    return {
      buffer: await streamBodyToBuffer(response.Body),
      contentType: response.ContentType || null,
      metadata: response.Metadata || {},
    };
  }

  async function headObject(key) {
    return getClient().send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
  }

  async function deleteObject(key) {
    return getClient().send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
  }

  return {
    buildKey,
    bucketName,
    deleteObject,
    getClient,
    getObject,
    getObjectBuffer,
    headObject,
    isConfigured,
    putBuffer,
  };
}

module.exports = {
  createProjectBucket,
  sanitizeKeySegment,
  streamBodyToBuffer,
};
