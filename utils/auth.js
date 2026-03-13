const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { isPostgresConfigured, query } = require("../infra/postgres");

const PASSCODE_COLLECTION = "admin_passcodes";
const DEFAULT_SALT_ROUNDS = Number(
  process.env.ADMIN_PASSCODE_SALT_ROUNDS || 12,
);
let passcodesTableReadyPromise = null;

function requirePostgresPasscodes() {
  if (!canUsePostgresPasscodes()) {
    throw new Error("PostgreSQL is required for admin passcodes");
  }
}

function isPasscodeFeatureEnabled(masterPasscode) {
  return typeof masterPasscode === "string" && masterPasscode.trim().length > 0;
}

function sanitizePasscodeInput(passcode) {
  if (typeof passcode !== "string") {
    return "";
  }
  return passcode.trim();
}

function sanitizeLabelInput(label) {
  if (typeof label !== "string") {
    return "";
  }
  return label.trim();
}

async function hashPasscode(passcode, saltRounds = DEFAULT_SALT_ROUNDS) {
  return bcrypt.hash(passcode, saltRounds);
}

async function comparePasscode(candidate, hashValue) {
  try {
    return await bcrypt.compare(candidate, hashValue);
  } catch (err) {
    console.warn("[Auth] cannot compare passcode:", err?.message || err);
    return false;
  }
}

function timingSafeEqualString(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function mapPasscodeDoc(doc) {
  if (!doc) return null;
  return {
    id: String(doc.legacy_passcode_id || doc._id || doc.id || ""),
    label: doc.label || "",
    isActive:
      typeof doc.isActive === "boolean"
        ? doc.isActive
        : doc.is_active !== false,
    createdAt: doc.createdAt || doc.created_at || null,
    createdBy: doc.createdBy || doc.created_by || null,
    lastUsedAt: doc.lastUsedAt || doc.last_used_at || null,
    usageCount:
      typeof doc.usageCount === "number"
        ? doc.usageCount
        : Number(doc.usage_count || 0),
  };
}

function canUsePostgresPasscodes() {
  try {
    return isPostgresConfigured();
  } catch (_) {
    return false;
  }
}

function generateLegacyPasscodeId() {
  return crypto.randomBytes(12).toString("hex");
}

async function ensurePasscodesTable() {
  if (!canUsePostgresPasscodes()) return;
  if (!passcodesTableReadyPromise) {
    passcodesTableReadyPromise = query(
      `
        CREATE TABLE IF NOT EXISTS admin_passcodes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          legacy_passcode_id TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL DEFAULT '',
          code_hash TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_by TEXT,
          last_used_at TIMESTAMPTZ,
          last_used_from TEXT,
          usage_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
    ).catch((error) => {
      passcodesTableReadyPromise = null;
      throw error;
    });
  }
  await passcodesTableReadyPromise;
}

async function createPasscode(db, { label, passcode, createdBy }) {
  const sanitizedLabel = sanitizeLabelInput(label);
  const sanitizedPasscode = sanitizePasscodeInput(passcode);
  if (!sanitizedPasscode) {
    throw new Error("กรุณากรอกรหัสผ่าน");
  }
  if (sanitizedPasscode.length < 4) {
    throw new Error("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร");
  }
  if (!sanitizedLabel) {
    throw new Error("กรุณาตั้งชื่อรหัสผ่าน");
  }

  const hashed = await hashPasscode(sanitizedPasscode);
  const now = new Date();
  requirePostgresPasscodes();
  await ensurePasscodesTable();
  const legacyPasscodeId = generateLegacyPasscodeId();
  const result = await query(
      `
        INSERT INTO admin_passcodes (
          legacy_passcode_id,
          label,
          code_hash,
          is_active,
          created_by,
          last_used_at,
          usage_count,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,TRUE,$4,NULL,0,$5,$5)
        RETURNING
          id::text AS id,
          legacy_passcode_id,
          label,
          is_active,
          created_by,
          last_used_at,
          usage_count,
          created_at,
          updated_at
      `,
      [legacyPasscodeId, sanitizedLabel, hashed, createdBy || null, now],
  );
  return mapPasscodeDoc(result.rows[0]);
}

async function listPasscodes(db) {
  requirePostgresPasscodes();
  await ensurePasscodesTable();
  const result = await query(
      `
        SELECT
          id::text AS id,
          legacy_passcode_id,
          label,
          is_active,
          created_by,
          last_used_at,
          usage_count,
          created_at,
          updated_at
        FROM admin_passcodes
        ORDER BY created_at DESC, id DESC
      `,
  );
  return result.rows.map(mapPasscodeDoc);
}

async function togglePasscode(db, id, isActive) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  requirePostgresPasscodes();
  await ensurePasscodesTable();
  const result = await query(
      `
        UPDATE admin_passcodes
        SET
          is_active = $2,
          updated_at = NOW()
        WHERE id::text = $1 OR legacy_passcode_id = $1
        RETURNING
          id::text AS id,
          legacy_passcode_id,
          label,
          is_active,
          created_by,
          last_used_at,
          usage_count,
          created_at,
          updated_at
      `,
      [normalizedId, Boolean(isActive)],
  );
  if (result.rowCount === 0) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการปรับสถานะ");
  }
  return mapPasscodeDoc(result.rows[0]);
}

async function deletePasscode(db, id) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  requirePostgresPasscodes();
  await ensurePasscodesTable();
  const result = await query(
    `
      DELETE FROM admin_passcodes
      WHERE id::text = $1 OR legacy_passcode_id = $1
    `,
    [normalizedId],
  );
  if (!result.rowCount) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการลบ");
  }
  return true;
}

async function findActivePasscode(db, passcode) {
  requirePostgresPasscodes();
  await ensurePasscodesTable();
  const result = await query(
      `
        SELECT
          id::text AS id,
          legacy_passcode_id,
          label,
          code_hash,
          is_active,
          created_by,
          last_used_at,
          last_used_from,
          usage_count,
          created_at,
          updated_at
        FROM admin_passcodes
        WHERE is_active = TRUE
        ORDER BY created_at DESC, id DESC
      `,
  );
  for (const row of result.rows) {
    const matched = await comparePasscode(passcode, row.code_hash);
    if (matched) {
      return {
        ...row,
        _id: row.legacy_passcode_id || row.id,
        codeHash: row.code_hash,
      };
    }
  }
  return null;
}

async function recordPasscodeUsage(db, id, meta = {}) {
  if (!id) return;
  requirePostgresPasscodes();
  await ensurePasscodesTable();
  await query(
      `
        UPDATE admin_passcodes
        SET
          last_used_at = NOW(),
          last_used_from = $2,
          usage_count = COALESCE(usage_count, 0) + 1,
          updated_at = NOW()
        WHERE id::text = $1 OR legacy_passcode_id = $1
      `,
      [String(id), meta.ipAddress || null],
  );
}

async function ensurePasscodeIndexes(db) {
  requirePostgresPasscodes();
  await ensurePasscodesTable();
  await Promise.all([
    query(
      "CREATE INDEX IF NOT EXISTS idx_admin_passcodes_active ON admin_passcodes (is_active)",
    ),
    query(
      "CREATE INDEX IF NOT EXISTS idx_admin_passcodes_created_at ON admin_passcodes (created_at DESC)",
    ),
  ]);
}

async function verifyPasscode({
  db,
  passcode,
  masterPasscode,
  ipAddress,
}) {
  const sanitizedPasscode = sanitizePasscodeInput(passcode);
  if (!sanitizedPasscode) {
    return { valid: false };
  }

  if (
    isPasscodeFeatureEnabled(masterPasscode) &&
    timingSafeEqualString(masterPasscode, sanitizedPasscode)
  ) {
    return {
      valid: true,
      role: "superadmin",
      passcodeDoc: null,
    };
  }

  const doc = await findActivePasscode(db, sanitizedPasscode);
  if (!doc) {
    return { valid: false };
  }

  await recordPasscodeUsage(db, doc._id, { ipAddress });

  return {
    valid: true,
    role: "admin",
    passcodeDoc: doc,
  };
}

module.exports = {
  PASSCODE_COLLECTION,
  isPasscodeFeatureEnabled,
  sanitizePasscodeInput,
  sanitizeLabelInput,
  createPasscode,
  listPasscodes,
  togglePasscode,
  deletePasscode,
  ensurePasscodeIndexes,
  verifyPasscode,
  mapPasscodeDoc,
};
