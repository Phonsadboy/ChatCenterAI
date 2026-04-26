const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { ObjectId } = require("bson");

const PASSCODE_COLLECTION = "admin_passcodes";
const DEFAULT_SALT_ROUNDS = Number(
  process.env.ADMIN_PASSCODE_SALT_ROUNDS || 12,
);
const ADMIN_ROLES = ["agent", "team_leader", "admin", "superadmin"];
const ADMIN_CHAT_CONTEXT_TABS = [
  "overview",
  "tags",
  "forms",
  "orders",
  "files",
  "notes",
  "tools",
];
const ADMIN_PERMISSIONS = [
  "menu:dashboard",
  "menu:settings",
  "menu:instruction-ai",
  "menu:api-usage",
  "menu:chat",
  "menu:orders",
  "menu:followup",
  "menu:broadcast",
  "menu:facebook-posts",
  "menu:customer-stats",
  "menu:categories",
  "settings:bot",
  "settings:image-library",
  "settings:data-forms",
  "settings:file-library",
  "settings:chat",
  "settings:notifications",
  "settings:general",
  "settings:security-filter",
  "settings:api-key",
  "chat:view",
  "chat:send",
  "chat:forms",
  "chat:files",
  "chat:notes",
  "chat:tags",
  "chat:orders",
  "chat:templates",
  "chat:forward",
  "chat:assign",
  "chat:debug",
  "chat:clear",
  "chat:ai-control",
  "chat:purchase-status",
  "chat:profile-refresh",
  "chat:export",
  "data-forms:manage",
  "file-assets:manage",
  "notifications:manage",
  "categories:manage",
  "bots:manage",
  "api-keys:manage",
];
const ADMIN_PERMISSION_SET = new Set(ADMIN_PERMISSIONS);
const ADMIN_FULL_PERMISSIONS = Object.freeze([...ADMIN_PERMISSIONS]);
const TEAM_LEADER_EXCLUDED_DEFAULT_PERMISSIONS = new Set([
  "settings:general",
  "settings:security-filter",
  "settings:api-key",
  "api-keys:manage",
]);
const AGENT_DEFAULT_PERMISSIONS = Object.freeze([
  "menu:chat",
  "chat:view",
  "chat:send",
  "chat:forms",
]);

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    output.push(normalized);
  });
  return output;
}

function normalizeRole(role, fallback = "admin") {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (ADMIN_ROLES.includes(normalized)) return normalized;
  return ADMIN_ROLES.includes(fallback) ? fallback : "admin";
}

function getDefaultPermissionsForRole(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "superadmin" || normalizedRole === "admin") {
    return [...ADMIN_FULL_PERMISSIONS];
  }
  if (normalizedRole === "team_leader") {
    return ADMIN_FULL_PERMISSIONS.filter(
      (permission) => !TEAM_LEADER_EXCLUDED_DEFAULT_PERMISSIONS.has(permission),
    );
  }
  return [...AGENT_DEFAULT_PERMISSIONS];
}

function normalizePermissionList(permissions, role, legacyFullAccess = false) {
  const normalizedRole = normalizeRole(role);
  if (legacyFullAccess || normalizedRole === "superadmin") {
    return [...ADMIN_FULL_PERMISSIONS];
  }
  const list = uniqueStrings(permissions).filter((permission) =>
    ADMIN_PERMISSION_SET.has(permission),
  );
  return list.length ? list : getDefaultPermissionsForRole(normalizedRole);
}

function normalizeInboxKey(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || !text.includes(":")) return "";
  const [platformPart, ...botParts] = text.split(":");
  const platform = platformPart.trim().toLowerCase();
  const botId = botParts.join(":").trim() || "default";
  if (!platform) return "";
  return `${platform}:${botId}`;
}

function normalizeInboxAccess(input, { role = "admin", legacyFullAccess = false } = {}) {
  const normalizedRole = normalizeRole(role);
  const defaultAll =
    legacyFullAccess ||
    normalizedRole === "superadmin" ||
    normalizedRole === "admin";
  if (!input || typeof input !== "object") {
    return defaultAll
      ? { mode: "all", inboxKeys: [] }
      : { mode: "selected", inboxKeys: [] };
  }
  const mode = input.mode === "all" ? "all" : "selected";
  if (mode === "all") {
    return { mode: "all", inboxKeys: [] };
  }
  const rawKeys = Array.isArray(input)
    ? input
    : Array.isArray(input.inboxKeys)
      ? input.inboxKeys
      : [];
  return {
    mode: "selected",
    inboxKeys: uniqueStrings(rawKeys.map(normalizeInboxKey).filter(Boolean)),
  };
}

function normalizeChatLayout(input, role = "admin") {
  const normalizedRole = normalizeRole(role);
  const allowedTabs = new Set(ADMIN_CHAT_CONTEXT_TABS);
  if (!input || typeof input !== "object") {
    if (normalizedRole === "agent") {
      return { mode: "forms_only", allowedTabs: ["forms"] };
    }
    return { mode: "full", allowedTabs: [...ADMIN_CHAT_CONTEXT_TABS] };
  }
  const mode =
    input.mode === "forms_only" || input.mode === "agent"
      ? "forms_only"
      : input.mode === "custom"
        ? "custom"
        : "full";
  if (mode === "full") {
    return { mode: "full", allowedTabs: [...ADMIN_CHAT_CONTEXT_TABS] };
  }
  const tabs = uniqueStrings(input.allowedTabs).filter((tab) =>
    allowedTabs.has(tab),
  );
  return {
    mode,
    allowedTabs: tabs.length ? tabs : ["forms"],
  };
}

function hasExplicitAccessConfig(doc = {}) {
  return Boolean(
    doc.role ||
      Array.isArray(doc.permissions) ||
      doc.inboxAccess ||
      doc.chatLayout,
  );
}

function normalizePasscodeAccessConfig(input = {}, options = {}) {
  const role = normalizeRole(input.role, options.fallbackRole || "admin");
  const legacyFullAccess = Boolean(options.legacyFullAccess);
  return {
    role,
    permissions: normalizePermissionList(
      input.permissions,
      role,
      legacyFullAccess,
    ),
    inboxAccess: normalizeInboxAccess(input.inboxAccess, {
      role,
      legacyFullAccess,
    }),
    chatLayout: normalizeChatLayout(input.chatLayout, role),
  };
}

function buildAdminAccessContext({ role, passcodeDoc } = {}) {
  const normalizedRole = normalizeRole(role, "admin");
  if (normalizedRole === "superadmin") {
    return normalizePasscodeAccessConfig(
      { role: "superadmin" },
      { fallbackRole: "superadmin", legacyFullAccess: true },
    );
  }
  const legacyFullAccess = passcodeDoc ? !hasExplicitAccessConfig(passcodeDoc) : false;
  return normalizePasscodeAccessConfig(passcodeDoc || { role: normalizedRole }, {
    fallbackRole: normalizedRole,
    legacyFullAccess,
  });
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
  const legacyFullAccess = !hasExplicitAccessConfig(doc);
  const accessConfig = normalizePasscodeAccessConfig(doc, {
    fallbackRole: doc.role || "admin",
    legacyFullAccess,
  });
  return {
    id: String(doc._id),
    label: doc.label || "",
    role: accessConfig.role,
    permissions: accessConfig.permissions,
    inboxAccess: accessConfig.inboxAccess,
    chatLayout: accessConfig.chatLayout,
    isLegacyAccess: legacyFullAccess,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt || null,
    createdBy: doc.createdBy || null,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy || null,
    lastUsedAt: doc.lastUsedAt || null,
    usageCount: typeof doc.usageCount === "number" ? doc.usageCount : 0,
  };
}

async function createPasscode(db, {
  label,
  passcode,
  role,
  permissions,
  inboxAccess,
  chatLayout,
  createdBy,
}) {
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

  const coll = db.collection(PASSCODE_COLLECTION);
  const hashed = await hashPasscode(sanitizedPasscode);
  const now = new Date();
  const accessConfig = normalizePasscodeAccessConfig(
    { role, permissions, inboxAccess, chatLayout },
    { fallbackRole: role || "admin" },
  );
  const doc = {
    label: sanitizedLabel,
    codeHash: hashed,
    ...accessConfig,
    isActive: true,
    createdAt: now,
    createdBy: createdBy || null,
    updatedAt: now,
    updatedBy: createdBy || null,
    lastUsedAt: null,
    usageCount: 0,
  };
  const { insertedId } = await coll.insertOne(doc);
  return mapPasscodeDoc({ ...doc, _id: insertedId });
}

async function listPasscodes(db) {
  const coll = db.collection(PASSCODE_COLLECTION);
  const docs = await coll
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(mapPasscodeDoc);
}

async function updatePasscode(db, id, payload = {}, updatedBy = null) {
  if (!ObjectId.isValid(id)) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  const coll = db.collection(PASSCODE_COLLECTION);
  const existing = await coll.findOne({ _id: new ObjectId(id) });
  if (!existing) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการแก้ไข");
  }

  const update = {
    updatedAt: new Date(),
    updatedBy: updatedBy || null,
  };
  if (Object.prototype.hasOwnProperty.call(payload, "label")) {
    const sanitizedLabel = sanitizeLabelInput(payload.label);
    if (!sanitizedLabel) {
      throw new Error("กรุณาตั้งชื่อรหัสผ่าน");
    }
    update.label = sanitizedLabel;
  }

  const roleProvided = Object.prototype.hasOwnProperty.call(payload, "role");
  const accessInput = {
    role: roleProvided ? payload.role : existing.role || "admin",
    permissions: Object.prototype.hasOwnProperty.call(payload, "permissions")
      ? payload.permissions
      : roleProvided
        ? null
        : existing.permissions,
    inboxAccess: Object.prototype.hasOwnProperty.call(payload, "inboxAccess")
      ? payload.inboxAccess
      : roleProvided
        ? null
        : existing.inboxAccess,
    chatLayout: Object.prototype.hasOwnProperty.call(payload, "chatLayout")
      ? payload.chatLayout
      : roleProvided
        ? null
        : existing.chatLayout,
  };
  Object.assign(
    update,
    normalizePasscodeAccessConfig(accessInput, {
      fallbackRole: accessInput.role || existing.role || "admin",
    }),
  );

  const { value } = await coll.findOneAndUpdate(
    { _id: existing._id },
    { $set: update },
    { returnDocument: "after" },
  );
  return mapPasscodeDoc(value || { ...existing, ...update });
}

async function togglePasscode(db, id, isActive) {
  if (!ObjectId.isValid(id)) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  const coll = db.collection(PASSCODE_COLLECTION);
  const { value } = await coll.findOneAndUpdate(
    { _id: new ObjectId(id) },
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
  if (!ObjectId.isValid(id)) {
    throw new Error("รหัสรหัสผ่านไม่ถูกต้อง");
  }
  const coll = db.collection(PASSCODE_COLLECTION);
  const result = await coll.deleteOne({ _id: new ObjectId(id) });
  if (!result.deletedCount) {
    throw new Error("ไม่พบรหัสผ่านที่ต้องการลบ");
  }
  return true;
}

async function findActivePasscode(db, passcode) {
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
  const coll = db.collection(PASSCODE_COLLECTION);
  const update = {
    $set: {
      lastUsedAt: new Date(),
      lastUsedFrom: meta.ipAddress || null,
    },
    $inc: { usageCount: 1 },
  };
  await coll.updateOne({ _id: new ObjectId(id) }, update);
}

async function ensurePasscodeIndexes(db) {
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
    role: normalizeRole(doc.role, "admin"),
    passcodeDoc: doc,
  };
}

module.exports = {
  PASSCODE_COLLECTION,
  ADMIN_ROLES,
  ADMIN_PERMISSIONS,
  ADMIN_CHAT_CONTEXT_TABS,
  isPasscodeFeatureEnabled,
  sanitizePasscodeInput,
  sanitizeLabelInput,
  normalizeRole,
  normalizeInboxKey,
  normalizePasscodeAccessConfig,
  buildAdminAccessContext,
  createPasscode,
  listPasscodes,
  updatePasscode,
  togglePasscode,
  deletePasscode,
  ensurePasscodeIndexes,
  verifyPasscode,
  mapPasscodeDoc,
};
