const bcrypt = require("bcryptjs");
const { ObjectId } = require("mongodb");

const SALES_USER_COLLECTION = "sales_users";
const SALES_DEFAULT_SALT_ROUNDS = Number(
  process.env.SALES_USER_SALT_ROUNDS || 12,
);
const SALES_ROLES = new Set(["sales", "sales_manager"]);

function sanitizeSalesString(value, maxLength = 255) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function sanitizeSalesCode(value) {
  return sanitizeSalesString(value, 80).toLowerCase();
}

function sanitizeSalesRole(value) {
  const normalized = sanitizeSalesString(value, 32).toLowerCase();
  return SALES_ROLES.has(normalized) ? normalized : "sales";
}

async function hashSalesPassword(password, saltRounds = SALES_DEFAULT_SALT_ROUNDS) {
  return bcrypt.hash(password, saltRounds);
}

async function compareSalesPassword(candidate, hashValue) {
  try {
    return await bcrypt.compare(candidate, hashValue);
  } catch (err) {
    console.warn("[SalesAuth] cannot compare password:", err?.message || err);
    return false;
  }
}

function mapSalesUserDoc(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.name || "",
    code: doc.code || "",
    role: sanitizeSalesRole(doc.role),
    teamId: doc.teamId || null,
    phone: doc.phone || null,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    lastLoginAt: doc.lastLoginAt || null,
  };
}

async function createSalesUser(
  db,
  { name, code, password, role, teamId, phone, isActive = true } = {},
) {
  const sanitizedName = sanitizeSalesString(name, 120);
  const sanitizedCode = sanitizeSalesCode(code);
  const sanitizedPassword = sanitizeSalesString(password, 255);
  const sanitizedRole = sanitizeSalesRole(role);
  const sanitizedTeamId = sanitizeSalesString(teamId, 80) || null;
  const sanitizedPhone = sanitizeSalesString(phone, 40) || null;

  if (!sanitizedName) {
    throw new Error("กรุณากรอกชื่อพนักงานขาย");
  }
  if (!sanitizedCode) {
    throw new Error("กรุณากรอกรหัสล็อกอิน");
  }
  if (!sanitizedPassword || sanitizedPassword.length < 4) {
    throw new Error("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร");
  }

  const coll = db.collection(SALES_USER_COLLECTION);
  const existing = await coll.findOne({ code: sanitizedCode });
  if (existing) {
    throw new Error("รหัสล็อกอินนี้ถูกใช้แล้ว");
  }

  const now = new Date();
  const doc = {
    name: sanitizedName,
    code: sanitizedCode,
    passwordHash: await hashSalesPassword(sanitizedPassword),
    role: sanitizedRole,
    teamId: sanitizedTeamId,
    phone: sanitizedPhone,
    isActive: isActive !== false,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };

  const result = await coll.insertOne(doc);
  return mapSalesUserDoc({ ...doc, _id: result.insertedId });
}

async function listSalesUsers(db, filter = {}) {
  const coll = db.collection(SALES_USER_COLLECTION);
  const query = {};
  if (typeof filter.isActive === "boolean") {
    query.isActive = filter.isActive;
  }
  if (filter.role) {
    query.role = sanitizeSalesRole(filter.role);
  }
  const docs = await coll.find(query).sort({ role: 1, name: 1, createdAt: -1 }).toArray();
  return docs.map(mapSalesUserDoc);
}

async function getSalesUserById(db, id) {
  if (!ObjectId.isValid(id)) return null;
  const coll = db.collection(SALES_USER_COLLECTION);
  const doc = await coll.findOne({ _id: new ObjectId(id) });
  return mapSalesUserDoc(doc);
}

async function updateSalesUser(db, id, patch = {}) {
  if (!ObjectId.isValid(id)) {
    throw new Error("salesUserId ไม่ถูกต้อง");
  }

  const update = {};
  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    const value = sanitizeSalesString(patch.name, 120);
    if (!value) throw new Error("กรุณากรอกชื่อพนักงานขาย");
    update.name = value;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "role")) {
    update.role = sanitizeSalesRole(patch.role);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "teamId")) {
    update.teamId = sanitizeSalesString(patch.teamId, 80) || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "phone")) {
    update.phone = sanitizeSalesString(patch.phone, 40) || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "isActive")) {
    update.isActive = patch.isActive !== false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "password")) {
    const password = sanitizeSalesString(patch.password, 255);
    if (!password || password.length < 4) {
      throw new Error("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร");
    }
    update.passwordHash = await hashSalesPassword(password);
  }

  if (!Object.keys(update).length) {
    throw new Error("ไม่มีข้อมูลสำหรับอัปเดต");
  }

  update.updatedAt = new Date();

  const coll = db.collection(SALES_USER_COLLECTION);
  const updatedDoc = await coll.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" },
  );
  if (!updatedDoc) {
    throw new Error("ไม่พบพนักงานขายที่ระบุ");
  }
  return mapSalesUserDoc(updatedDoc);
}

async function findActiveSalesUserByCode(db, code) {
  const sanitizedCode = sanitizeSalesCode(code);
  if (!sanitizedCode) return null;
  const coll = db.collection(SALES_USER_COLLECTION);
  return coll.findOne({
    code: sanitizedCode,
    isActive: { $ne: false },
  });
}

async function verifySalesUser(db, { code, password } = {}) {
  const sanitizedCode = sanitizeSalesCode(code);
  const sanitizedPassword = sanitizeSalesString(password, 255);
  if (!sanitizedCode || !sanitizedPassword) {
    return { valid: false };
  }

  const doc = await findActiveSalesUserByCode(db, sanitizedCode);
  if (!doc) {
    return { valid: false };
  }

  const matched = await compareSalesPassword(sanitizedPassword, doc.passwordHash);
  if (!matched) {
    return { valid: false };
  }

  const now = new Date();
  await db.collection(SALES_USER_COLLECTION).updateOne(
    { _id: doc._id },
    { $set: { lastLoginAt: now, updatedAt: now } },
  );

  return {
    valid: true,
    salesUser: mapSalesUserDoc({
      ...doc,
      lastLoginAt: now,
      updatedAt: now,
    }),
  };
}

async function ensureSalesUserIndexes(db) {
  try {
    const coll = db.collection(SALES_USER_COLLECTION);
    await coll.createIndex({ code: 1 }, { unique: true });
    await coll.createIndex({ role: 1, isActive: 1 });
    await coll.createIndex({ createdAt: -1 });
  } catch (err) {
    console.warn("[SalesAuth] cannot ensure indexes:", err?.message || err);
  }
}

module.exports = {
  SALES_USER_COLLECTION,
  SALES_ROLES,
  sanitizeSalesCode,
  sanitizeSalesRole,
  mapSalesUserDoc,
  createSalesUser,
  listSalesUsers,
  getSalesUserById,
  updateSalesUser,
  verifySalesUser,
  ensureSalesUserIndexes,
};
