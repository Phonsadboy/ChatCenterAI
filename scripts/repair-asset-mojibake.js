#!/usr/bin/env node
require("dotenv").config();

const { Pool } = require("pg");

function resolveConnectionString() {
  return (
    process.env.DATABASE_URL
    || process.env.DATABASE_PUBLIC_URL
    || process.env.POSTGRES_URL
    || process.env.PG_URL
    || ""
  ).trim();
}

function decodePotentialUtf8Mojibake(value) {
  if (typeof value !== "string" || !value) return value;
  const looksMojibake = /(?:Ã.|Â|à¸|à¹|ðŸ|â€|ã.)/.test(value);
  if (!looksMojibake) return value;
  try {
    const decoded = Buffer.from(value, "latin1").toString("utf8");
    if (!decoded || decoded.includes("�")) return value;
    if (/[\u0080-\u009f]/.test(decoded)) return value;
    return decoded;
  } catch (_) {
    return value;
  }
}

function normalizeDecodedText(value) {
  if (typeof value !== "string") return value;
  return decodePotentialUtf8Mojibake(value).trim();
}

function buildRepairPlan(rows = []) {
  const repairs = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...row.metadata }
        : {};

    const oldLabel = typeof row.label === "string" ? row.label : "";
    const oldDescription = typeof row.description === "string" ? row.description : "";

    const decodedLabel = normalizeDecodedText(oldLabel);
    const decodedDescription = normalizeDecodedText(oldDescription);
    const nextLabel = decodedLabel || oldLabel;
    const nextDescription = decodedDescription || oldDescription;

    const textKeys = ["label", "originalName", "description", "alt"];
    let metadataChanged = false;
    for (const key of textKeys) {
      if (typeof metadata[key] !== "string") continue;
      const decoded = normalizeDecodedText(metadata[key]);
      if (decoded !== metadata[key]) {
        metadata[key] = decoded;
        metadataChanged = true;
      }
    }

    const changed =
      nextLabel !== oldLabel
      || nextDescription !== oldDescription
      || metadataChanged;
    if (!changed) continue;

    repairs.push({
      id: String(row.id || "").trim(),
      legacyAssetId: String(row.legacy_asset_id || "").trim(),
      oldLabel,
      nextLabel,
      nextDescription,
      nextMetadata: metadata,
    });
  }

  return repairs;
}

async function loadInstructionAssets(pool) {
  const result = await pool.query(
    `
      SELECT
        id::text AS id,
        legacy_asset_id,
        label,
        description,
        metadata
      FROM instruction_assets
      ORDER BY updated_at DESC, created_at DESC
    `,
  );
  return Array.isArray(result.rows) ? result.rows : [];
}

async function applyRepair(pool, repair) {
  await pool.query(
    `
      UPDATE instruction_assets
      SET
        label = $2,
        description = $3,
        metadata = $4::jsonb,
        updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [
      repair.id,
      repair.nextLabel,
      repair.nextDescription,
      JSON.stringify(repair.nextMetadata || {}),
    ],
  );

  if (repair.nextLabel === repair.oldLabel) {
    return;
  }

  await pool.query(
    `
      UPDATE image_collection_items
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{label}',
        to_jsonb($2::text),
        true
      )
      WHERE
        (
          $1::text <> ''
          AND (
            COALESCE(legacy_asset_id, '') = $1
            OR COALESCE(metadata->>'assetId', '') = $1
          )
        )
        OR (
          $3::text <> ''
          AND COALESCE(metadata->>'label', '') = $3
        )
    `,
    [repair.legacyAssetId, repair.nextLabel, repair.oldLabel],
  );
}

async function run() {
  const applyChanges = process.argv.includes("--apply");
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error("DATABASE_URL (or DATABASE_PUBLIC_URL) is required");
  }

  const pool = new Pool({
    connectionString,
    ssl:
      process.env.PGSSLMODE === "disable"
        ? false
        : { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: Number(
      process.env.CCAI_REPAIR_ASSET_MOJIBAKE_CONNECT_TIMEOUT_MS || 30000,
    ),
  });

  try {
    const rows = await loadInstructionAssets(pool);
    const repairs = buildRepairPlan(rows);
    if (repairs.length === 0) {
      console.log("[RepairAssetMojibake] No mojibake labels found.");
      return;
    }

    console.log(`[RepairAssetMojibake] Found ${repairs.length} rows to repair.`);
    repairs.slice(0, 20).forEach((repair, index) => {
      console.log(
        `[RepairAssetMojibake] ${index + 1}. ${repair.oldLabel} -> ${repair.nextLabel}`,
      );
    });
    if (repairs.length > 20) {
      console.log(
        `[RepairAssetMojibake] ... and ${repairs.length - 20} more rows`,
      );
    }

    if (!applyChanges) {
      console.log("[RepairAssetMojibake] Dry run only. Re-run with --apply to persist changes.");
      return;
    }

    await pool.query("BEGIN");
    try {
      for (const repair of repairs) {
        await applyRepair(pool, repair);
      }
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    console.log(`[RepairAssetMojibake] Applied ${repairs.length} repairs.`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error("[RepairAssetMojibake] failed:", error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  run,
  buildRepairPlan,
  decodePotentialUtf8Mojibake,
};
