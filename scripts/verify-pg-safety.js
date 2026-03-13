const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const TARGET_PATHS = [
  "index.js",
  "infra",
  "runtime",
  "services",
  "utils",
  "workers",
];

const FORBIDDEN_PATTERNS = [
  {
    label: "legacy follow_up_status ON CONFLICT target",
    regex: /ON\s+CONFLICT\s*\(\s*platform\s*,\s*bot_id\s*,\s*legacy_contact_id\s*\)/i,
  },
];

function walkFiles(entryPath, files = []) {
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) {
    files.push(entryPath);
    return files;
  }
  const entries = fs.readdirSync(entryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function getRuntimeFiles() {
  const files = [];
  for (const relativePath of TARGET_PATHS) {
    const fullPath = path.join(ROOT, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    walkFiles(fullPath, files);
  }
  return files;
}

function main() {
  const files = getRuntimeFiles();
  const violations = [];

  for (const filePath of files) {
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (_) {
      continue;
    }

    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (!pattern.regex.test(line)) continue;
        violations.push({
          filePath,
          line: index + 1,
          label: pattern.label,
          text: line.trim(),
        });
      }
    });
  }

  if (violations.length === 0) {
    console.log("verify:pg-safety passed");
    return;
  }

  console.error("verify:pg-safety failed. Forbidden PostgreSQL patterns found:");
  for (const violation of violations) {
    const relative = path.relative(ROOT, violation.filePath) || violation.filePath;
    console.error(
      `${relative}:${violation.line} matched ${violation.label} -> ${violation.text}`,
    );
  }
  process.exit(1);
}

main();
