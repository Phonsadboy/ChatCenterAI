#!/usr/bin/env node
require("dotenv").config();

const { MongoClient } = require("mongodb");
const { Pool } = require("pg");

const FOLLOW_UP_SETTING_KEYS = [
  { key: "enableFollowUpAnalysis", value: false },
  { key: "followUpShowInChat", value: false },
  { key: "followUpShowInDashboard", value: false },
  { key: "followUpAutoEnabled", value: false },
  { key: "followUpEmergencyStop", value: true },
];

function resolveEnv(keys = []) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolvePostgresUrl() {
  return resolveEnv([
    "DATABASE_URL",
    "DATABASE_PUBLIC_URL",
    "POSTGRES_URL",
    "PG_URL",
  ]);
}

function resolveMongoUrl() {
  const value = resolveEnv(["MONGO_URI", "MONGODB_URI"]);
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "disabled_mongo_uri"
    || normalized === "disabled"
    || normalized === "none"
  ) {
    return "";
  }
  if (!/^mongodb(\+srv)?:\/\//i.test(value)) {
    return "";
  }
  return value;
}

async function disableFollowUpInPostgres(pool) {
  const now = new Date();
  const updatedSettings = [];

  for (const entry of FOLLOW_UP_SETTING_KEYS) {
    await pool.query(
      `
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
      `,
      [entry.key, JSON.stringify(entry.value), now],
    );
    updatedSettings.push(entry.key);
  }

  const pageSettingsResult = await pool.query(
    `
      UPDATE follow_up_page_settings
      SET
        settings = COALESCE(settings, $1::jsonb) || jsonb_build_object(
          $2::text, false,
          $3::text, false,
          $4::text, false,
          $5::text, false
        ),
        updated_at = $6
    `,
    [
      JSON.stringify({}),
      "autoFollowUpEnabled",
      "analysisEnabled",
      "showInChat",
      "showInDashboard",
      now,
    ],
  );

  const canceledTasksResult = await pool.query(
    `
      UPDATE follow_up_tasks
      SET
        status = $1,
        payload = COALESCE(payload, $2::jsonb) || jsonb_build_object(
          $3::text, true,
          $4::text, $5::text,
          $6::text, $7::timestamptz,
          $8::text, $7::timestamptz
        ),
        next_scheduled_at = NULL,
        updated_at = $7
      WHERE
        COALESCE((payload->>$3)::boolean, false) = false
        AND COALESCE((payload->>$9)::boolean, false) = false
    `,
    [
      "canceled",
      JSON.stringify({}),
      "canceled",
      "cancelReason",
      "emergency_stop",
      "canceledAt",
      now,
      "updatedAt",
      "completed",
    ],
  );

  return {
    updatedSettings,
    updatedPageSettings: Number(pageSettingsResult.rowCount || 0),
    canceledActiveTasks: Number(canceledTasksResult.rowCount || 0),
  };
}

async function disableFollowUpInMongo(client, dbName) {
  const now = new Date();
  const db = client.db(dbName);
  const settingsCollection = db.collection("settings");
  const pageSettingsCollection = db.collection("follow_up_page_settings");
  const tasksCollection = db.collection("follow_up_tasks");

  await settingsCollection.bulkWrite(
    FOLLOW_UP_SETTING_KEYS.map((entry) => ({
      updateOne: {
        filter: { key: entry.key },
        update: { $set: { key: entry.key, value: entry.value, updatedAt: now } },
        upsert: true,
      },
    })),
    { ordered: true },
  );

  const pageSettingsResult = await pageSettingsCollection.updateMany(
    {},
    {
      $set: {
        "settings.autoFollowUpEnabled": false,
        "settings.analysisEnabled": false,
        "settings.showInChat": false,
        "settings.showInDashboard": false,
        updatedAt: now,
      },
    },
  );

  const canceledTasksResult = await tasksCollection.updateMany(
    {
      canceled: { $ne: true },
      completed: { $ne: true },
    },
    {
      $set: {
        canceled: true,
        cancelReason: "emergency_stop",
        canceledAt: now,
        updatedAt: now,
        nextScheduledAt: null,
      },
    },
  );

  return {
    updatedSettings: FOLLOW_UP_SETTING_KEYS.map((entry) => entry.key),
    updatedPageSettings: Number(pageSettingsResult.modifiedCount || 0),
    canceledActiveTasks: Number(canceledTasksResult.modifiedCount || 0),
  };
}

async function main() {
  const postgresUrl = resolvePostgresUrl();
  const mongoUrl = resolveMongoUrl();
  const mongoDbName = process.env.MONGO_DB_NAME || "chatbot";

  if (!postgresUrl && !mongoUrl) {
    throw new Error("No database connection found. Set DATABASE_URL and/or MONGO_URI.");
  }

  const summary = {
    postgres: null,
    mongo: null,
  };

  if (postgresUrl) {
    const pool = new Pool({
      connectionString: postgresUrl,
      ssl:
        process.env.PGSSLMODE === "disable"
          ? false
          : { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: Number(
        process.env.CCAI_DISABLE_FOLLOWUP_CONNECT_TIMEOUT_MS || 30000,
      ),
    });
    try {
      summary.postgres = await disableFollowUpInPostgres(pool);
    } finally {
      await pool.end();
    }
  }

  if (mongoUrl) {
    const mongo = new MongoClient(mongoUrl);
    try {
      await mongo.connect();
      summary.mongo = await disableFollowUpInMongo(mongo, mongoDbName);
    } finally {
      await mongo.close();
    }
  }

  console.log("[FollowUpDisable] done");
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[FollowUpDisable] failed:", error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  disableFollowUpInMongo,
  disableFollowUpInPostgres,
};
