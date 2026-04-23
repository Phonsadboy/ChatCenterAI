"use strict";

const zlib = require("zlib");
const { createMigrationContext } = require("./lib/migrationContext");

async function main() {
  const context = createMigrationContext();
  try {
    if (!context.projectBucket.isConfigured()) {
      throw new Error("Bucket is not configured");
    }
    if (!context.postgresRuntime.isConfigured()) {
      throw new Error("DATABASE_URL is not configured");
    }

    await context.chatStorageService.ensureReady();
    const db = await context.getMongoDb();
    const cutoff = context.createHotCutoff(
      context.runtimeConfig.chatHotRetentionDays,
    );

    const months = await db.collection("chat_history")
      .aggregate([
        { $match: { timestamp: { $lt: cutoff } } },
        {
          $project: {
            archiveMonth: {
              $dateToString: {
                format: "%Y-%m",
                date: "$timestamp",
                timezone: "Asia/Bangkok",
              },
            },
          },
        },
        { $group: { _id: "$archiveMonth" } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    for (const month of months) {
      const monthKey = month?._id;
      if (!monthKey) continue;

      const { start, end } = context.monthWindowFromKey(monthKey);
      const docs = await db.collection("chat_history")
        .find({
          timestamp: {
            $gte: start,
            $lt: end,
            $lt: cutoff,
          },
        })
        .sort({ timestamp: 1 })
        .toArray();

      if (!docs.length) continue;

      const jsonl = docs
        .map((doc) => JSON.stringify(context.normalizeForJson(doc)))
        .join("\n");
      const gzipBuffer = zlib.gzipSync(Buffer.from(`${jsonl}\n`, "utf8"));
      const objectKey = context.projectBucket.buildKey(
        "chat-archive",
        `${monthKey}.jsonl.gz`,
      );
      await context.projectBucket.putBuffer(objectKey, gzipBuffer, {
        contentType: "application/gzip",
        cacheControl: "private, max-age=31536000, immutable",
        metadata: {
          archiveMonth: monthKey,
          rowCount: String(docs.length),
          format: "jsonl.gz",
        },
      });

      await context.postgresRuntime.query(
        `
          INSERT INTO chat_archive_exports (
            archive_month,
            export_path,
            status,
            row_count,
            checksum,
            started_at,
            completed_at
          ) VALUES ($1, $2, 'completed', $3, $4, now(), now())
          ON CONFLICT (archive_month, export_path) DO UPDATE SET
            status = EXCLUDED.status,
            row_count = EXCLUDED.row_count,
            checksum = EXCLUDED.checksum,
            completed_at = EXCLUDED.completed_at
        `,
        [
          `${monthKey}-01`,
          objectKey,
          docs.length,
          require("crypto")
            .createHash("sha256")
            .update(gzipBuffer)
            .digest("hex"),
        ],
      );

      console.log(
        `[export-chat-archive] exported month=${monthKey} rows=${docs.length} key=${objectKey}`,
      );
    }
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error("[export-chat-archive] failed:", error?.message || error);
  process.exitCode = 1;
});
