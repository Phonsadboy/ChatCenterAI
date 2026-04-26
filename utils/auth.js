const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { ObjectId } = require("bson");

const PASSCODE_COLLECTION = "admin_passcodes";
const DEFAULT_SALT_ROUNDS = Number(
  process.env.ADMIN_PASSCODE_SALT_ROUNDS || 12,
);
const ADMIN_ROLES = ["agent", "team_leader", "admin", "superadmin"];
const ADMIN_PERMISSIONS_VERSION = 4;
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
  "dashboard:view",
  "settings:bot",
  "settings:image-library",
  "settings:data-forms",
  "settings:file-library",
  "settings:chat",
  "settings:notifications",
  "settings:general",
  "settings:security-filter",
  "settings:api-key",
  "audit:view",
  "filter:test",
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
  "instructions:view",
  "instructions:create",
  "instructions:update",
  "instructions:delete",
  "instructions:manage",
  "instructions:import",
  "instructions:export",
  "instruction-ai:use",
  "agent-forge:manage",
  "api-usage:view",
  "orders:view",
  "orders:update",
  "orders:delete",
  "orders:export",
  "orders:print",
  "broadcast:view",
  "broadcast:preview",
  "broadcast:send",
  "broadcast:cancel",
  "followup:view",
  "followup:manage",
  "followup:assets",
  "facebook-posts:view",
  "facebook-posts:sync",
  "facebook-posts:update",
  "customer-stats:view",
  "image-library:view",
  "image-library:manage",
  "data-forms:view",
  "data-forms:manage",
  "data-forms:export",
  "file-assets:view",
  "file-assets:manage",
  "notifications:view",
  "notifications:manage",
  "categories:view",
  "categories:import",
  "categories:export",
  "categories:manage",
  "bots:view",
  "bots:create",
  "bots:update",
  "bots:delete",
  "bots:secrets",
  "bots:manage",
  "api-keys:view",
  "api-keys:manage",
];
const ADMIN_PERMISSION_SET = new Set(ADMIN_PERMISSIONS);
const ADMIN_FULL_PERMISSIONS = Object.freeze([...ADMIN_PERMISSIONS]);
const STANDARD_PERMISSION_IMPLICATIONS = Object.freeze({
  "settings:bot": ["bots:view", "bots:create", "bots:update", "bots:delete"],
  "settings:image-library": ["image-library:view", "image-library:manage"],
  "settings:data-forms": ["data-forms:view", "data-forms:manage"],
  "settings:file-library": ["file-assets:view", "file-assets:manage"],
  "settings:notifications": ["notifications:view", "notifications:manage"],
  "settings:security-filter": ["audit:view", "filter:test"],
  "settings:api-key": ["api-keys:view"],
  "instructions:manage": [
    "instructions:view",
    "instructions:create",
    "instructions:update",
    "instructions:delete",
    "instructions:import",
    "instructions:export",
  ],
  "instructions:create": ["instructions:view"],
  "instructions:update": ["instructions:view"],
  "instructions:delete": ["instructions:view"],
  "instructions:import": ["instructions:view"],
  "instructions:export": ["instructions:view"],
  "instruction-ai:use": ["instructions:view"],
  "orders:update": ["orders:view"],
  "orders:delete": ["orders:view"],
  "orders:export": ["orders:view"],
  "orders:print": ["orders:view"],
  "broadcast:preview": ["broadcast:view"],
  "broadcast:send": ["broadcast:view"],
  "broadcast:cancel": ["broadcast:view"],
  "followup:manage": ["followup:view"],
  "followup:assets": ["followup:view"],
  "facebook-posts:sync": ["facebook-posts:view"],
  "facebook-posts:update": ["facebook-posts:view"],
  "image-library:manage": ["image-library:view"],
  "data-forms:manage": ["data-forms:view"],
  "data-forms:export": ["data-forms:view"],
  "file-assets:manage": ["file-assets:view"],
  "notifications:manage": ["notifications:view"],
  "categories:manage": ["categories:view", "categories:import", "categories:export"],
  "categories:import": ["categories:view"],
  "categories:export": ["categories:view"],
  "bots:create": ["bots:view"],
  "bots:update": ["bots:view"],
  "bots:delete": ["bots:view"],
  "bots:secrets": ["bots:view"],
  "bots:manage": ["bots:view", "bots:create", "bots:update", "bots:delete"],
  "api-keys:manage": ["api-keys:view"],
});
const LEGACY_PERMISSION_IMPLICATIONS = Object.freeze({
  "menu:dashboard": [
    "dashboard:view",
    "instructions:view",
    "instructions:manage",
    "instructions:import",
    "instructions:export",
  ],
  "menu:settings": ["settings:bot", "settings:chat"],
  "menu:instruction-ai": [
    "instruction-ai:use",
    "instructions:view",
    "instructions:manage",
    "instructions:import",
    "instructions:export",
    "agent-forge:manage",
  ],
  "menu:api-usage": ["api-usage:view"],
  "menu:orders": [
    "orders:view",
    "orders:update",
    "orders:delete",
    "orders:export",
    "orders:print",
  ],
  "menu:followup": ["followup:view", "followup:manage", "followup:assets"],
  "menu:broadcast": [
    "broadcast:view",
    "broadcast:preview",
    "broadcast:send",
    "broadcast:cancel",
  ],
  "menu:facebook-posts": [
    "facebook-posts:view",
    "facebook-posts:sync",
    "facebook-posts:update",
  ],
  "menu:customer-stats": ["customer-stats:view"],
  "menu:categories": ["categories:view"],
  "settings:image-library": ["image-library:view", "image-library:manage"],
  "settings:data-forms": ["data-forms:view", "data-forms:manage", "data-forms:export"],
  "settings:file-library": ["file-assets:view", "file-assets:manage"],
  "settings:notifications": ["notifications:view", "notifications:manage"],
  "settings:security-filter": ["audit:view", "filter:test"],
  "settings:api-key": ["api-keys:view"],
  "chat:orders": ["orders:view"],
  "instructions:manage": [
    "instructions:view",
    "instructions:create",
    "instructions:update",
    "instructions:delete",
    "instructions:import",
    "instructions:export",
  ],
  "data-forms:manage": ["data-forms:view", "data-forms:export"],
  "file-assets:manage": ["file-assets:view"],
  "notifications:manage": ["notifications:view"],
  "categories:manage": ["categories:view", "categories:import", "categories:export"],
  "bots:manage": ["bots:view", "bots:create", "bots:update", "bots:delete", "bots:secrets"],
  "api-keys:manage": ["api-keys:view"],
});
const TEAM_LEADER_EXCLUDED_DEFAULT_PERMISSIONS = new Set([
  "settings:general",
  "settings:security-filter",
  "settings:api-key",
  "audit:view",
  "filter:test",
  "bots:secrets",
  "api-keys:view",
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

function expandPermissionImplications(permissions, implicationMap) {
  const expanded = uniqueStrings(permissions).filter((permission) =>
    ADMIN_PERMISSION_SET.has(permission),
  );
  const seen = new Set(expanded);
  for (let index = 0; index < expanded.length; index += 1) {
    const implied = implicationMap[expanded[index]] || [];
    implied.forEach((permission) => {
      if (!ADMIN_PERMISSION_SET.has(permission) || seen.has(permission)) return;
      seen.add(permission);
      expanded.push(permission);
    });
  }
  return expanded;
}

function expandLegacyPermissions(permissions) {
  return expandPermissionImplications(permissions, LEGACY_PERMISSION_IMPLICATIONS);
}

function normalizePermissionList(
  permissions,
  role,
  legacyFullAccess = false,
  legacyPermissionExpansion = false,
) {
  const normalizedRole = normalizeRole(role);
  if (legacyFullAccess || normalizedRole === "superadmin") {
    return [...ADMIN_FULL_PERMISSIONS];
  }
  if (!Array.isArray(permissions)) {
    return getDefaultPermissionsForRole(normalizedRole);
  }
  const list = uniqueStrings(permissions).filter((permission) =>
    ADMIN_PERMISSION_SET.has(permission),
  );
  const expanded = legacyPermissionExpansion ? expandLegacyPermissions(list) : list;
  return expandPermissionImplications(expanded, STANDARD_PERMISSION_IMPLICATIONS);
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

function normalizeInstructionAccess(input, { role = "admin", legacyFullAccess = false } = {}) {
  const normalizedRole = normalizeRole(role);
  const defaultAll =
    legacyFullAccess ||
    normalizedRole === "superadmin" ||
    normalizedRole === "admin" ||
    normalizedRole === "team_leader";
  if (!input || typeof input !== "object") {
    return defaultAll
      ? { mode: "all", instructionIds: [] }
      : { mode: "selected", instructionIds: [] };
  }
  const mode = input.mode === "all" ? "all" : "selected";
  if (mode === "all") {
    return { mode: "all", instructionIds: [] };
  }
  const rawIds = Array.isArray(input)
    ? input
    : Array.isArray(input.instructionIds)
      ? input.instructionIds
      : Array.isArray(input.ids)
        ? input.ids
        : [];
  return {
    mode: "selected",
    instructionIds: uniqueStrings(rawIds),
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
      : input.mode === "overview_only"
        ? "overview_only"
        : input.mode === "custom"
          ? "custom"
          : "full";
  if (mode === "full") {
    return { mode: "full", allowedTabs: [...ADMIN_CHAT_CONTEXT_TABS] };
  }
  if (mode === "overview_only") {
    return { mode: "overview_only", allowedTabs: ["overview"] };
  }
  const tabs = uniqueStrings(input.allowedTabs).filter((tab) =>
    allowedTabs.has(tab),
  );
  return {
    mode,
    allowedTabs: mode === "forms_only" && !tabs.length ? ["forms"] : tabs,
  };
}

function hasExplicitAccessConfig(doc = {}) {
  return Boolean(
    doc.role ||
      Array.isArray(doc.permissions) ||
      doc.instructionAccess ||
      doc.inboxAccess ||
      doc.chatLayout,
  );
}

function normalizePasscodeAccessConfig(input = {}, options = {}) {
  const role = normalizeRole(input.role, options.fallbackRole || "admin");
  const legacyFullAccess = Boolean(options.legacyFullAccess);
  const legacyPermissionExpansion = Boolean(options.legacyPermissionExpansion);
  return {
    role,
    permissionsVersion: ADMIN_PERMISSIONS_VERSION,
    permissions: normalizePermissionList(
      input.permissions,
      role,
      legacyFullAccess,
      legacyPermissionExpansion,
    ),
    instructionAccess: normalizeInstructionAccess(input.instructionAccess, {
      role,
      legacyFullAccess,
    }),
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
  const legacyPermissionExpansion =
    Boolean(passcodeDoc) &&
    passcodeDoc.permissionsVersion !== ADMIN_PERMISSIONS_VERSION;
  return normalizePasscodeAccessConfig(passcodeDoc || { role: normalizedRole }, {
    fallbackRole: normalizedRole,
    legacyFullAccess,
    legacyPermissionExpansion,
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
  const legacyPermissionExpansion = doc.permissionsVersion !== ADMIN_PERMISSIONS_VERSION;
  const accessConfig = normalizePasscodeAccessConfig(doc, {
    fallbackRole: doc.role || "admin",
    legacyFullAccess,
    legacyPermissionExpansion,
  });
  return {
    id: String(doc._id),
    label: doc.label || "",
    role: accessConfig.role,
    permissionsVersion: ADMIN_PERMISSIONS_VERSION,
    permissions: accessConfig.permissions,
    instructionAccess: accessConfig.instructionAccess,
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
  instructionAccess,
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
    { role, permissions, instructionAccess, inboxAccess, chatLayout },
    { fallbackRole: role || "admin" },
  );
  const doc = {
    label: sanitizedLabel,
    codeHash: hashed,
    ...accessConfig,
    permissionsVersion: ADMIN_PERMISSIONS_VERSION,
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
    instructionAccess: Object.prototype.hasOwnProperty.call(payload, "instructionAccess")
      ? payload.instructionAccess
      : roleProvided
        ? null
        : existing.instructionAccess,
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
  update.permissionsVersion = ADMIN_PERMISSIONS_VERSION;

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
