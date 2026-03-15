#!/usr/bin/env node

require("dotenv").config();

const { MongoClient, ObjectId } = require("mongodb");
const {
  SALES_USER_COLLECTION,
  SALES_ROLES,
  createSalesUser,
  listSalesUsers,
  updateSalesUser,
  ensureSalesUserIndexes,
  sanitizeSalesCode,
} = require("../utils/salesAuth");

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "chatbot";
const DEFAULT_PASSWORD_ENV_NAME = "SALES_USER_PASSWORD";

function showUsage() {
  console.log(`Sales user management

Usage:
  node scripts/manage-sales-user.js list [--role sales] [--active=true]
  node scripts/manage-sales-user.js create --name "Alice" --code sale01 --password "1234" [--role sales]
  node scripts/manage-sales-user.js update --code sale01 [--name "Alice"] [--password "5678"] [--active=false]

Options:
  --name             Sales user display name
  --code             Login code (stored lowercase)
  --password         Password for create/update
  --role             sales | sales_manager
  --phone            Optional phone number
  --team-id          Optional team id
  --active           true | false
  --id               Target user id for update

Password fallback:
  Create uses ${DEFAULT_PASSWORD_ENV_NAME} when --password is omitted.
  Update changes password only when --password is passed.

Railway examples:
  railway run node scripts/manage-sales-user.js list
  railway run node scripts/manage-sales-user.js create --name "Alice" --code sale01 --role sales --phone 0890000000
  ${DEFAULT_PASSWORD_ENV_NAME}=supersecret railway run node scripts/manage-sales-user.js create --name "Alice" --code sale01 --role sales
`);
}

function toCamelCaseKey(key) {
  return String(key || "")
    .trim()
    .replace(/^--/, "")
    .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function parseArgs(argv) {
  const args = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.split("=");
    const key = toCamelCaseKey(rawKey);

    if (typeof inlineValue === "string") {
      options[key] = inlineValue;
      continue;
    }

    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = nextToken;
    index += 1;
  }

  return { args, options };
}

function parseBoolean(value, fallback = undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parseOptionalString(value, maxLength = 255) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function buildPatchFromOptions(options) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(options, "name")) {
    patch.name = options.name;
  }
  if (Object.prototype.hasOwnProperty.call(options, "password")) {
    patch.password = options.password;
  }
  if (Object.prototype.hasOwnProperty.call(options, "role")) {
    patch.role = options.role;
  }
  if (Object.prototype.hasOwnProperty.call(options, "phone")) {
    patch.phone = options.phone;
  }
  if (Object.prototype.hasOwnProperty.call(options, "teamId")) {
    patch.teamId = options.teamId;
  }
  if (Object.prototype.hasOwnProperty.call(options, "active")) {
    patch.isActive = parseBoolean(options.active);
  }

  return patch;
}

async function withDatabase(work) {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    await ensureSalesUserIndexes(db);
    return await work(db);
  } finally {
    await client.close();
  }
}

async function listCommand(options) {
  const filter = {};
  if (typeof options.role === "string") {
    filter.role = options.role;
  }

  const active = parseBoolean(options.active);
  if (typeof active === "boolean") {
    filter.isActive = active;
  }

  const salesUsers = await withDatabase((db) => listSalesUsers(db, filter));
  if (!salesUsers.length) {
    console.log("No sales users found.");
    return;
  }

  console.table(
    salesUsers.map((user) => ({
      id: user.id,
      code: user.code,
      name: user.name,
      role: user.role,
      active: user.isActive,
      phone: user.phone || "",
      teamId: user.teamId || "",
      lastLoginAt: user.lastLoginAt || "",
    })),
  );
}

async function createCommand(options) {
  const password = parseOptionalString(options.password) || process.env[DEFAULT_PASSWORD_ENV_NAME];

  const payload = {
    name: options.name,
    code: options.code,
    password,
    role: options.role,
    teamId: parseOptionalString(options.teamId, 80),
    phone: parseOptionalString(options.phone, 40),
    isActive: parseBoolean(options.active, true),
  };

  const salesUser = await withDatabase((db) => createSalesUser(db, payload));
  console.log("Sales user created:");
  console.log(JSON.stringify(salesUser, null, 2));
}

async function resolveTargetUser(db, options) {
  if (typeof options.id === "string" && ObjectId.isValid(options.id)) {
    return db.collection(SALES_USER_COLLECTION).findOne({ _id: new ObjectId(options.id) });
  }

  const normalizedCode = sanitizeSalesCode(options.code);
  if (!normalizedCode) {
    throw new Error("Provide --id or --code for update.");
  }

  return db.collection(SALES_USER_COLLECTION).findOne({ code: normalizedCode });
}

async function updateCommand(options) {
  const patch = buildPatchFromOptions(options);
  if (!Object.keys(patch).length) {
    throw new Error("No fields provided for update. Pass --password only if you want to change it.");
  }

  const salesUser = await withDatabase(async (db) => {
    const target = await resolveTargetUser(db, options);
    if (!target?._id) {
      throw new Error("Sales user not found.");
    }
    return updateSalesUser(db, String(target._id), patch);
  });

  console.log("Sales user updated:");
  console.log(JSON.stringify(salesUser, null, 2));
}

async function main() {
  const { args, options } = parseArgs(process.argv.slice(2));
  const command = String(args[0] || "").trim().toLowerCase();

  if (!command || options.help || options.h) {
    showUsage();
    return;
  }

  if (!MONGO_URI) {
    throw new Error("MONGO_URI or MONGODB_URI is required.");
  }

  if (options.role && !SALES_ROLES.has(String(options.role).trim().toLowerCase())) {
    throw new Error(`Invalid role. Allowed values: ${Array.from(SALES_ROLES).join(", ")}`);
  }

  switch (command) {
    case "list":
      await listCommand(options);
      return;
    case "create":
      await createCommand(options);
      return;
    case "update":
      await updateCommand(options);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error("Failed to manage sales user:", error?.message || error);
  process.exitCode = 1;
});
