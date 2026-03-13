const crypto = require("crypto");
const { isPostgresConfigured, query } = require("../infra/postgres");

const SHORT_LINK_COLLECTION = "short_links";
const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_REGEX = /^[0-9A-Za-z]{5,20}$/;
const DEFAULT_CODE_LENGTH = 7;
const DEFAULT_MAX_ATTEMPTS = 6;

function normalizeBaseUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/$/, "");
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value);
}

function isValidShortCode(code) {
  if (typeof code !== "string") return false;
  return CODE_REGEX.test(code.trim());
}

function generateShortCode(length = DEFAULT_CODE_LENGTH) {
  const safeLength =
    Number.isInteger(length) && length >= 5 ? length : DEFAULT_CODE_LENGTH;
  const bytes = crypto.randomBytes(safeLength);
  let out = "";
  for (let i = 0; i < safeLength; i += 1) {
    out += BASE62[bytes[i] % BASE62.length];
  }
  return out;
}

function buildShortLinkUrl(baseUrl, code) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !code) return "";
  return `${base}/s/${code}`;
}

function canUsePostgresShortLinks() {
  try {
    return isPostgresConfigured();
  } catch (_) {
    return false;
  }
}

function isMongoDbHandle(db) {
  return Boolean(db && typeof db.collection === "function");
}

function hydratePostgresShortLink(row = {}) {
  const metadata =
    row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    _id: row.id || null,
    code: row.code || null,
    targetUrl: row.target_url || metadata.targetUrl || null,
    expiresAt: row.expires_at || metadata.expiresAt || null,
    hitCount: Number(row.hit_count || metadata.hitCount || 0),
    lastAccessedAt: row.last_accessed_at || metadata.lastAccessedAt || null,
    createdAt: row.created_at || metadata.createdAt || null,
    updatedAt: row.updated_at || metadata.updatedAt || null,
    metadata,
  };
}

async function findPostgresShortLinkByTargetUrl(targetUrl) {
  const result = await query(
    `
      SELECT
        id::text,
        code,
        target_url,
        metadata,
        expires_at,
        hit_count,
        last_accessed_at,
        created_at,
        updated_at
      FROM short_links
      WHERE target_url = $1
      ORDER BY updated_at DESC, created_at DESC, id DESC
      LIMIT 1
    `,
    [targetUrl],
  );
  return result.rows[0] ? hydratePostgresShortLink(result.rows[0]) : null;
}

async function createPostgresShortLink(targetUrl, options = {}) {
  const normalizedUrl = typeof targetUrl === "string" ? targetUrl.trim() : "";
  if (!normalizedUrl || !isHttpUrl(normalizedUrl)) return null;

  const codeLength = Number.isInteger(options.codeLength)
    ? options.codeLength
    : DEFAULT_CODE_LENGTH;
  const maxAttempts = Number.isInteger(options.maxAttempts)
    ? options.maxAttempts
    : DEFAULT_MAX_ATTEMPTS;
  const expiresAt = options.expiresAt instanceof Date ? options.expiresAt : null;
  const existing = await findPostgresShortLinkByTargetUrl(normalizedUrl);
  if (
    existing?.code
    && (!existing.expiresAt || new Date(existing.expiresAt) > new Date())
  ) {
    return existing.code;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateShortCode(codeLength);
    try {
      await query(
        `
          INSERT INTO short_links (
            code,
            target_url,
            metadata,
            expires_at,
            created_at,
            updated_at,
            hit_count,
            last_accessed_at
          ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,0,NULL)
        `,
        [
          code,
          normalizedUrl,
          JSON.stringify({
            targetUrl: normalizedUrl,
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
          }),
          expiresAt,
          new Date(),
          new Date(),
        ],
      );
      return code;
    } catch (err) {
      if (err?.code === "23505") {
        const duplicate = await findPostgresShortLinkByTargetUrl(normalizedUrl);
        if (
          duplicate?.code
          && (!duplicate.expiresAt || new Date(duplicate.expiresAt) > new Date())
        ) {
          return duplicate.code;
        }
        continue;
      }
      throw err;
    }
  }

  return null;
}

async function createMongoShortLink(db, targetUrl, options = {}) {
  if (!isMongoDbHandle(db)) return null;
  const normalizedUrl = typeof targetUrl === "string" ? targetUrl.trim() : "";
  if (!normalizedUrl || !isHttpUrl(normalizedUrl)) return null;

  const codeLength = Number.isInteger(options.codeLength)
    ? options.codeLength
    : DEFAULT_CODE_LENGTH;
  const maxAttempts = Number.isInteger(options.maxAttempts)
    ? options.maxAttempts
    : DEFAULT_MAX_ATTEMPTS;
  const expiresAt = options.expiresAt instanceof Date ? options.expiresAt : null;

  const coll = db.collection(SHORT_LINK_COLLECTION);
  const existing = await coll.findOne(
    { targetUrl: normalizedUrl },
    { projection: { code: 1, expiresAt: 1 } },
  );
  if (
    existing?.code
    && (!(existing.expiresAt instanceof Date) || existing.expiresAt > new Date())
  ) {
    return existing.code;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateShortCode(codeLength);
    try {
      const doc = {
        code,
        targetUrl: normalizedUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (expiresAt) doc.expiresAt = expiresAt;
      await coll.insertOne(doc);
      return code;
    } catch (err) {
      if (err?.code === 11000) {
        const duplicate = await coll.findOne(
          { targetUrl: normalizedUrl },
          { projection: { code: 1, expiresAt: 1 } },
        );
        if (
          duplicate?.code
          && (!(duplicate.expiresAt instanceof Date) || duplicate.expiresAt > new Date())
        ) {
          return duplicate.code;
        }
        continue;
      }
      throw err;
    }
  }

  return null;
}

async function createShortLink(db, targetUrl, options = {}) {
  if (canUsePostgresShortLinks()) {
    return createPostgresShortLink(targetUrl, options);
  }
  return createMongoShortLink(db, targetUrl, options);
}

async function resolvePostgresShortLink(code) {
  const normalized = typeof code === "string" ? code.trim() : "";
  if (!isValidShortCode(normalized)) return null;
  const result = await query(
    `
      SELECT
        id::text,
        code,
        target_url,
        metadata,
        expires_at,
        hit_count,
        last_accessed_at,
        created_at,
        updated_at
      FROM short_links
      WHERE code = $1
      LIMIT 1
    `,
    [normalized],
  );
  const doc = result.rows[0] ? hydratePostgresShortLink(result.rows[0]) : null;
  if (!doc) return null;
  if (doc.expiresAt && new Date(doc.expiresAt) <= new Date()) return null;
  return doc;
}

async function resolveMongoShortLink(db, code) {
  if (!isMongoDbHandle(db)) return null;
  const normalized = typeof code === "string" ? code.trim() : "";
  if (!isValidShortCode(normalized)) return null;
  const coll = db.collection(SHORT_LINK_COLLECTION);
  const doc = await coll.findOne({ code: normalized });
  if (!doc) return null;
  if (doc.expiresAt instanceof Date && doc.expiresAt <= new Date()) return null;
  return doc;
}

async function resolveShortLink(db, code) {
  if (canUsePostgresShortLinks()) {
    return resolvePostgresShortLink(code);
  }
  return resolveMongoShortLink(db, code);
}

async function registerShortLinkHit(db, code) {
  const normalized = typeof code === "string" ? code.trim() : "";
  if (!isValidShortCode(normalized)) return false;

  if (canUsePostgresShortLinks()) {
    const result = await query(
      `
        UPDATE short_links
        SET
          hit_count = COALESCE(hit_count, 0) + 1,
          last_accessed_at = NOW(),
          updated_at = NOW(),
          metadata = jsonb_strip_nulls(
            COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'hitCount', COALESCE(hit_count, 0) + 1,
              'lastAccessedAt', NOW()
            )
          )
        WHERE code = $1
      `,
      [normalized],
    );
    return result.rowCount > 0;
  }

  if (!isMongoDbHandle(db)) return false;
  const result = await db.collection(SHORT_LINK_COLLECTION).updateOne(
    { code: normalized },
    { $inc: { hitCount: 1 }, $set: { lastAccessedAt: new Date() } },
  );
  return result?.matchedCount > 0;
}

module.exports = {
  SHORT_LINK_COLLECTION,
  buildShortLinkUrl,
  createShortLink,
  generateShortCode,
  isValidShortCode,
  normalizeBaseUrl,
  registerShortLinkHit,
  resolveShortLink,
};
