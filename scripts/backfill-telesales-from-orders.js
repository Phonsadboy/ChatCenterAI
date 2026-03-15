#!/usr/bin/env node

require("dotenv").config();

const { MongoClient } = require("mongodb");
const { TeleSalesService } = require("../services/telesalesService");

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "chatbot";
const DEFAULT_TIMEZONE = process.env.TZ || "Asia/Bangkok";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [rawKey, inlineValue] = token.split("=");
    const key = rawKey.replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
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
  return options;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function usage() {
  console.log(`Backfill TeleSales leads from historical orders

Usage:
  node scripts/backfill-telesales-from-orders.js [--limit 100] [--force]

Options:
  --limit <n>             Process only the first n orders
  --include-cancelled     Include cancelled orders (default: false)
  --force                 Allow running even when TeleSales collections already contain data
  --dry-run               Print counts only, do not write data

Railway:
  railway ssh node scripts/backfill-telesales-from-orders.js
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.h) {
    usage();
    return;
  }

  const includeCancelled = parseBoolean(options.includeCancelled, false);
  const force = parseBoolean(options.force, false);
  const dryRun = parseBoolean(options.dryRun, false);
  const limit = parsePositiveInt(options.limit);

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const [leadCount, checkpointCount, callLogCount] = await Promise.all([
      db.collection("telesales_leads").countDocuments(),
      db.collection("telesales_checkpoints").countDocuments(),
      db.collection("telesales_call_logs").countDocuments(),
    ]);

    if (!force && (leadCount > 0 || checkpointCount > 0 || callLogCount > 0)) {
      throw new Error(
        `TeleSales collections are not empty (leads=${leadCount}, checkpoints=${checkpointCount}, callLogs=${callLogCount}). Re-run with --force if you really want to continue.`,
      );
    }

    const orderQuery = includeCancelled ? {} : { status: { $ne: "cancelled" } };
    const totalOrders = await db.collection("orders").countDocuments(orderQuery);
    const pipeline = [
      { $match: orderQuery },
      {
        $addFields: {
          __teleSalesSortAt: {
            $ifNull: [
              "$extractedAt",
              {
                $ifNull: [
                  "$createdAt",
                  {
                    $ifNull: ["$updatedAt", { $toDate: "$_id" }],
                  },
                ],
              },
            ],
          },
        },
      },
      { $sort: { __teleSalesSortAt: 1, _id: 1 } },
      { $project: { __teleSalesSortAt: 0 } },
    ];

    if (limit) {
      pipeline.push({ $limit: limit });
    }

    const estimatedTargetOrders = limit ? Math.min(totalOrders, limit) : totalOrders;
    console.log(
      JSON.stringify(
        {
          dryRun,
          includeCancelled,
          force,
          totalOrders,
          targetOrders: estimatedTargetOrders,
          existingTeleSales: {
            leads: leadCount,
            checkpoints: checkpointCount,
            callLogs: callLogCount,
          },
        },
        null,
        2,
      ),
    );

    if (dryRun) {
      return;
    }

    const connectDB = async () => client;
    const teleSalesService = new TeleSalesService({
      connectDB,
      timezone: DEFAULT_TIMEZONE,
    });
    await teleSalesService.ensureIndexes();

    const cursor = db.collection("orders").aggregate(pipeline, {
      allowDiskUse: true,
    });

    let processed = 0;
    let lastOrderId = null;
    for await (const order of cursor) {
      await teleSalesService.syncOrderDocument(order);
      processed += 1;
      lastOrderId = String(order._id);

      if (processed % 100 === 0) {
        console.log(
          JSON.stringify({
            processed,
            targetOrders: estimatedTargetOrders,
            lastOrderId,
          }),
        );
      }
    }

    const [finalLeadCount, finalCheckpointCount, finalOpenCheckpointCount] = await Promise.all([
      db.collection("telesales_leads").countDocuments(),
      db.collection("telesales_checkpoints").countDocuments(),
      db.collection("telesales_checkpoints").countDocuments({ status: "open" }),
    ]);

    console.log(
      JSON.stringify(
        {
          success: true,
          processed,
          lastOrderId,
          finalLeadCount,
          finalCheckpointCount,
          finalOpenCheckpointCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error?.message || error);
  process.exitCode = 1;
});
