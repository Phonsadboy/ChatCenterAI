const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARCHIVE_DIR = path.join(ROOT, "docs", "archive", "legacy-mongo");
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "coverage",
  "dist",
  "build",
]);

const FORBIDDEN_PATTERNS = [
  {
    label: "document-store require",
    regex: new RegExp(String.raw`require\("mongo` + String.raw`db"\)`),
  },
  {
    label: "client symbol",
    regex: new RegExp(String.raw`\bMongo` + String.raw`Client\b`),
  },
  {
    label: "bucket symbol",
    regex: new RegExp(String.raw`\bGrid` + String.raw`FS` + String.raw`Bucket\b`),
  },
  {
    label: "session store package",
    regex: new RegExp(String.raw`\bconnect-` + String.raw`mo` + String.raw`ngo\b`, "i"),
  },
  {
    label: "legacy uri env",
    regex: new RegExp(String.raw`\bMON` + String.raw`GO_URI\b`),
  },
  {
    label: "legacy database uri env",
    regex: new RegExp(String.raw`\bMON` + String.raw`GODB_URI\b`),
  },
  {
    label: "object id validation",
    regex: new RegExp(String.raw`ObjectId\.is` + String.raw`Valid\(`),
  },
  {
    label: "new object id constructor",
    regex: new RegExp(String.raw`new Object` + String.raw`Id\(`),
  },
];

function shouldSkipDirectory(dirPath) {
  const relative = path.relative(ROOT, dirPath);
  if (!relative) return false;
  const first = relative.split(path.sep)[0];
  return SKIP_DIRS.has(first);
}

function isArchivedFile(filePath) {
  return filePath === ARCHIVE_DIR || filePath.startsWith(`${ARCHIVE_DIR}${path.sep}`);
}

function walk(dirPath, files = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(fullPath) || isArchivedFile(fullPath)) continue;
      walk(fullPath, files);
      continue;
    }
    if (isArchivedFile(fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}

function main() {
  const files = walk(ROOT);
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
      FORBIDDEN_PATTERNS.forEach((pattern) => {
        if (pattern.regex.test(line)) {
          violations.push({
            filePath,
            line: index + 1,
            pattern: pattern.label,
            text: line.trim(),
          });
        }
      });
    });
  }

  if (violations.length === 0) {
    console.log("verify:no-mongo passed");
    return;
  }

  console.error("verify:no-mongo failed. Forbidden Mongo leftovers found:");
  violations.forEach((violation) => {
    const relative = path.relative(ROOT, violation.filePath) || violation.filePath;
    console.error(
      `${relative}:${violation.line} matched ${violation.pattern} -> ${violation.text}`,
    );
  });
  process.exit(1);
}

main();
