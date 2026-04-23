const { query } = require("../infra/postgres");

async function main() {
  const args = process.argv.slice(2);
  const paramsIndex = args.indexOf("--params");
  const sqlTokens = paramsIndex === -1 ? args : args.slice(0, paramsIndex);
  const rawParams = paramsIndex === -1 ? null : args[paramsIndex + 1];
  const sql = sqlTokens.join(" ").trim();

  if (!sql) {
    console.error(
      "Usage: node scripts/postgres-query.js SELECT ... [--params '[...]']",
    );
    process.exit(1);
  }

  let params = [];
  if (rawParams) {
    try {
      const parsed = JSON.parse(rawParams);
      params = Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      console.error("Invalid params JSON:", error.message);
      process.exit(1);
    }
  }

  const result = await query(sql, params);
  console.log(JSON.stringify({
    rowCount: result.rowCount,
    rows: result.rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
