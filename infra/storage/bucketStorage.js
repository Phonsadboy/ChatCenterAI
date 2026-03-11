const { Readable } = require("stream");
const {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const { getRuntimeConfig } = require("../runtimeConfig");

let s3Client = null;

function isBucketConfigured() {
  const config = getRuntimeConfig();
  return Boolean(
    config.storage.bucketName &&
      config.storage.endpoint &&
      config.storage.accessKeyId &&
      config.storage.secretAccessKey,
  );
}

function getBucketClient() {
  if (!s3Client) {
    const config = getRuntimeConfig();
    s3Client = new S3Client({
      region: config.storage.region,
      endpoint: config.storage.endpoint,
      forcePathStyle: config.storage.forcePathStyle,
      credentials: {
        accessKeyId: config.storage.accessKeyId,
        secretAccessKey: config.storage.secretAccessKey,
      },
    });
  }
  return s3Client;
}

async function putObject(key, body, options = {}) {
  const config = getRuntimeConfig();
  return getBucketClient().send(
    new PutObjectCommand({
      Bucket: config.storage.bucketName,
      Key: key,
      Body: body,
      ContentType: options.contentType || "application/octet-stream",
      Metadata: options.metadata || {},
    }),
  );
}

async function deleteObject(key) {
  const config = getRuntimeConfig();
  return getBucketClient().send(
    new DeleteObjectCommand({
      Bucket: config.storage.bucketName,
      Key: key,
    }),
  );
}

async function headObject(key) {
  const config = getRuntimeConfig();
  return getBucketClient().send(
    new HeadObjectCommand({
      Bucket: config.storage.bucketName,
      Key: key,
    }),
  );
}

async function getObjectStream(key) {
  const config = getRuntimeConfig();
  const result = await getBucketClient().send(
    new GetObjectCommand({
      Bucket: config.storage.bucketName,
      Key: key,
    }),
  );

  if (result.Body instanceof Readable) {
    return result.Body;
  }
  throw new Error("Storage body is not readable");
}

module.exports = {
  deleteObject,
  getBucketClient,
  getObjectStream,
  headObject,
  isBucketConfigured,
  putObject,
};
