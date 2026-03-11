#!/usr/bin/env node
require("dotenv").config();

const { MongoClient } = require("mongodb");
const { Client } = require("pg");

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "chatbot";
const DATABASE_URL = process.env.DATABASE_URL;

async function getMongoDistinctActiveUserCount(db) {
  const rows = await db.collection("active_user_status").aggregate([
    {
      $match: {
        senderId: { $exists: true, $ne: null, $ne: "" },
      },
    },
    {
      $group: {
        _id: { $toString: "$senderId" },
      },
    },
    {
      $count: "count",
    },
  ], { allowDiskUse: true }).toArray();

  return rows[0]?.count || 0;
}

async function getMongoOrderTotals(db) {
  const rows = await db.collection("orders").aggregate([
    {
      $group: {
        _id: null,
        totalAmount: { $sum: { $ifNull: ["$orderData.totalAmount", 0] } },
        totalShipping: { $sum: { $ifNull: ["$orderData.shippingCost", 0] } },
      },
    },
  ]).toArray();

  return rows[0] || {
    totalAmount: 0,
    totalShipping: 0,
  };
}

async function verifyLite() {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const mongo = new MongoClient(MONGO_URI);
  const pg = new Client({ connectionString: DATABASE_URL });

  await mongo.connect();
  await pg.connect();

  try {
    const db = mongo.db(MONGO_DB_NAME);

    const mongoCounts = {};
    mongoCounts.settings = await db.collection("settings").countDocuments({});
    mongoCounts.bots =
      (await db.collection("line_bots").countDocuments({})) +
      (await db.collection("facebook_bots").countDocuments({})) +
      (await db.collection("instagram_bots").countDocuments({})) +
      (await db.collection("whatsapp_bots").countDocuments({}));
    mongoCounts.instructions = await db.collection("instructions_v2").countDocuments({});
    mongoCounts.instruction_versions = await db.collection("instruction_versions").countDocuments({});
    mongoCounts.instruction_assets = await db.collection("instruction_assets").countDocuments({});
    mongoCounts.image_collections = await db.collection("image_collections").countDocuments({});
    mongoCounts.orders = await db.collection("orders").countDocuments({});
    mongoCounts.follow_up_status = await db.collection("follow_up_status").countDocuments({});
    mongoCounts.follow_up_page_settings = await db.collection("follow_up_page_settings").countDocuments({});
    mongoCounts.follow_up_tasks = await db.collection("follow_up_tasks").countDocuments({});
    mongoCounts.active_user_status = await getMongoDistinctActiveUserCount(db);
    mongoCounts.user_tags = await db.collection("user_tags").countDocuments({});
    mongoCounts.user_purchase_status = await db.collection("user_purchase_status").countDocuments({});
    mongoCounts.user_profiles = await db.collection("user_profiles").countDocuments({});
    mongoCounts.chat_history = await db.collection("chat_history").countDocuments({});
    mongoCounts.short_links = await db.collection("short_links").countDocuments({});

    const pgCountQuery = async (sql) => {
      const result = await pg.query(sql);
      return Number(result.rows[0]?.count || 0);
    };

    const pgCounts = {};
    pgCounts.settings = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM settings");
    pgCounts.bots = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM bots");
    pgCounts.instructions = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM instructions WHERE source_kind = 'instructions_v2'");
    pgCounts.instruction_versions = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM instruction_versions");
    pgCounts.instruction_assets = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM instruction_assets");
    pgCounts.image_collections = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM image_collections");
    pgCounts.orders = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM orders");
    pgCounts.follow_up_status = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM follow_up_status");
    pgCounts.follow_up_page_settings = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM follow_up_page_settings");
    pgCounts.follow_up_tasks = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM follow_up_tasks");
    pgCounts.active_user_status = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM active_user_status");
    pgCounts.user_tags = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM user_tags");
    pgCounts.user_purchase_status = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM user_purchase_status");
    pgCounts.contacts = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM contacts");
    pgCounts.messages = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM messages");
    pgCounts.short_links = await pgCountQuery("SELECT COUNT(*)::bigint AS count FROM short_links");

    const keys = [
      "settings",
      "bots",
      "instructions",
      "instruction_versions",
      "instruction_assets",
      "image_collections",
      "orders",
      "follow_up_status",
      "follow_up_page_settings",
      "follow_up_tasks",
      "active_user_status",
      "user_tags",
      "user_purchase_status",
      "short_links",
    ];

    const table = keys.map((key) => ({
      key,
      mongo: mongoCounts[key] ?? null,
      postgres: pgCounts[key] ?? null,
      delta: (pgCounts[key] ?? 0) - (mongoCounts[key] ?? 0),
      match: (mongoCounts[key] ?? null) === (pgCounts[key] ?? null),
    }));

    table.push({
      key: "chat_history_vs_messages",
      mongo: mongoCounts.chat_history,
      postgres: pgCounts.messages,
      delta: pgCounts.messages - mongoCounts.chat_history,
      match: pgCounts.messages >= mongoCounts.chat_history,
    });

    table.push({
      key: "user_profiles_vs_contacts",
      mongo: mongoCounts.user_profiles,
      postgres: pgCounts.contacts,
      delta: pgCounts.contacts - mongoCounts.user_profiles,
      match: pgCounts.contacts >= mongoCounts.user_profiles,
    });

    const mongoTotals = await getMongoOrderTotals(db);
    const pgTotalsResult = await pg.query(`
      SELECT
        COALESCE(SUM((totals->>'totalAmount')::numeric), 0)::numeric AS total_amount,
        COALESCE(SUM((totals->>'shippingCost')::numeric), 0)::numeric AS total_shipping
      FROM orders
    `);
    const pgTotals = pgTotalsResult.rows[0] || { total_amount: "0", total_shipping: "0" };

    console.table(table);
    console.table([
      {
        source: "mongo",
        totalAmount: Number(mongoTotals.totalAmount || 0),
        totalShipping: Number(mongoTotals.totalShipping || 0),
      },
      {
        source: "postgres",
        totalAmount: Number(pgTotals.total_amount || 0),
        totalShipping: Number(pgTotals.total_shipping || 0),
      },
    ]);

    const hardMismatch = table.some((row) =>
      row.key !== "chat_history_vs_messages" &&
      row.key !== "user_profiles_vs_contacts" &&
      row.match === false,
    );
    return {
      ok: !hardMismatch,
      table,
    };
  } finally {
    await pg.end().catch(() => {});
    await mongo.close().catch(() => {});
  }
}

if (require.main === module) {
  verifyLite()
    .then((result) => {
      if (!result.ok) {
        process.exitCode = 2;
      }
    })
    .catch((error) => {
      console.error("[VerifyLite] Failed:", error);
      process.exit(1);
    });
}

