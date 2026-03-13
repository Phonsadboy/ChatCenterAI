const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { isPostgresConfigured, query } = require("../infra/postgres");

const PASSCODE_COLLECTION = "admin_passcodes";
const DEFAULT_SALT_ROUNDS = Number(
  process.env.ADMIN_PASSCODE_SALT_ROUNDS || 12,
);
let passcodesTableReadyPromise = null;

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
  if (canUsePostgresPasscodes()) {
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

  const coll = db.collection(PASSCODE_COLLECTION);
  const doc = {
    label: sanitizedLabel,
    codeHash: hashed,
    isActive: true,
    createdAt: now,
    createdBy: createdBy || null,
    lastUsedAt: null,
    usageCount: 0,
  };
  const { insertedId } = await coll.insertOne(doc);
  return mapPasscodeDoc({ ...doc, _id: insertedId });
}

async function listPasscodes(db) {
  if (canUsePostgresPasscodes()) {
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

  const coll = db.collection(PASSCODE_COLLECTION);
  const docs = await coll
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(mapPasscodeDoc);
}

async function togglePasscode(db, id, isActive) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  if (canUsePostgresPasscodes()) {
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

  const coll = db.collection(PASSCODE_COLLECTION);
  const docs = await coll.find({}).project({ _id: 1 }).toArray();
  const matched = docs.find((doc) => String(doc?._id || "") === normalizedId);
  if (!matched?._id) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการปรับสถานะ");
  }
  const { value } = await coll.findOneAndUpdate(
    { _id: matched._id },
    {
      $set: {
        isActive: !!isActive,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!value) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการปรับสถานะ");
  }
  return mapPasscodeDoc(value);
}

async function deletePasscode(db, id) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  if (canUsePostgresPasscodes()) {
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
  const coll = db.collection(PASSCODE_COLLECTION);
  const docs = await coll.find({}).project({ _id: 1 }).toArray();
  const matched = docs.find((doc) => String(doc?._id || "") === normalizedId);
  if (!matched?._id) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการลบ");
  }
  const result = await coll.deleteOne({ _id: matched._id });
  if (!result.deletedCount) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการลบ");
  }
  return true;
}

async function findActivePasscode(db, passcode) {
  if (canUsePostgresPasscodes()) {
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

  const coll = db.collection(PASSCODE_COLLECTION);
  const cursor = coll.find({ isActive: { $ne: false } });
  // ตรวจรหัสทีละรายการ เพราะเก็บเป็น hash
  // จำนวนรหัสที่จัดการผ่าน UI มีน้อย จึงไม่กระทบประสิทธิภาพ
  // ถ้าจำนวนเยอะควรเพิ่ม field fingerprint เพื่อค้นหาได้เร็วขึ้น
  // แต่ตอนนี้ยังไม่จำเป็น
  const docs = await cursor.toArray();
  for (const doc of docs) {
    const matched = await comparePasscode(passcode, doc.codeHash);
    if (matched) {
      return doc;
    }
  }
  return null;
}

async function recordPasscodeUsage(db, id, meta = {}) {
  if (!id) return;
  if (canUsePostgresPasscodes()) {
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
    return;
  }
  const coll = db.collection(PASSCODE_COLLECTION);
  const docs = await coll.find({}).project({ _id: 1 }).toArray();
  const matched = docs.find((doc) => String(doc?._id || "") === String(id));
  if (!matched?._id) {
    return;
  }
  const update = {
    $set: {
      lastUsedAt: new Date(),
      lastUsedFrom: meta.ipAddress || null,
    },
    $inc: { usageCount: 1 },
  };
  await coll.updateOne({ _id: matched._id }, update);
}

async function ensurePasscodeIndexes(db) {
  if (canUsePostgresPasscodes()) {
    await ensurePasscodesTable();
    await Promise.all([
      query(
        "CREATE INDEX IF NOT EXISTS idx_admin_passcodes_active ON admin_passcodes (is_active)",
      ),
      query(
        "CREATE INDEX IF NOT EXISTS idx_admin_passcodes_created_at ON admin_passcodes (created_at DESC)",
      ),
    ]);
    return;
  }
  try {
    const coll = db.collection(PASSCODE_COLLECTION);
    await coll.createIndex({ isActive: 1 });
    await coll.createIndex({ createdAt: -1 });
  } catch (err) {
    console.warn("[Auth] cannot ensure passcode indexes:", err?.message || err);
  }
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
