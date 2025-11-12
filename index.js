// -----------------------------------
// Original code with #DELETEMANY logic added
// -----------------------------------
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const util = require("util");
const { google } = require("googleapis");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");
const { OpenAI } = require("openai");
const line = require("@line/bot-sdk");
const sharp = require("sharp"); // <--- เพิ่มตรงนี้ ตามต้นฉบับ
const axios = require("axios");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
// Middleware & misc packages for UI
const helmet = require("helmet");
const cors = require("cors");
const moment = require("moment-timezone");
const FormData = require("form-data");
const fs = require("fs");
const crypto = require("crypto");
const XLSX = require("xlsx");
const multer = require("multer");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const rateLimit = require("express-rate-limit");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const ASSETS_DIR =
  process.env.ASSETS_DIR ||
  path.join(__dirname, "public", "assets", "instructions");
const FOLLOWUP_ASSETS_DIR =
  process.env.FOLLOWUP_ASSETS_DIR ||
  path.join(__dirname, "public", "assets", "followup");
const DEFAULT_AUDIO_ATTACHMENT_RESPONSE =
  "ขออภัยค่ะ ขณะนี้ระบบยังไม่รองรับไฟล์เสียง กรุณาพิมพ์ข้อความหรือส่งรูปภาพแทน";

const PORT = process.env.PORT || 3000;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_MASTER_PASSCODE = (process.env.ADMIN_MASTER_PASSCODE || "").trim();
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || "change-me-please-admin-session-secret";
const ADMIN_SESSION_TTL_SECONDS = Number(
  process.env.ADMIN_SESSION_TTL_SECONDS || 60 * 60 * 12,
);
const SESSION_COOKIE_NAME =
  process.env.ADMIN_SESSION_COOKIE_NAME || "admin_session";
const GOOGLE_CLIENT_EMAIL =
  "aitar-888@eminent-wares-446512-j8.iam.gserviceaccount.com";
const GOOGLE_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDGhyeINArKZgaV\nitEcK+o89ilPYeRNTNZgJT7VNHB5hgNLLeAcFLJ7IlCIqTLMoJEnnoDQil6aKaz8\nExVL83uSXRrzk4zQvtt3tIP31+9wOCb9D4ZGWfVP1tD0qdD4WJ1qqg1j1/8879pH\nUeQGEMuCnyVbcQ3GbYQjyYb3wEz/Qv7kMVggF+MIaGGw2NQwM0XcufSFtyxvvX2S\nb8uGc1A8R+Dn/tmcgMODhbtEgcMg6yXI5Y26MPfDjVrEbk0lfCr7IGFJX4ASYeKl\n0jhm0RGb+aya2cb55auLN3VPO5MQ+cOp8gHBf5GiC/YgF1gbRgF5b7LgmENBxSfH\nb3WVQodLAgMBAAECggEACKB14M7LdekXZHyAQrZL0EitbzQknLv33Xyw2B3rvJ7M\nr4HM/nC4eBj7y+ciUc8GZQ+CWc2GzTHTa66+mwAia1qdYbPp3LuhGM4Leq5zn/o+\nA3rJuG6PS4qyUMy89msPXW5fSj/oE535QREiFKYP2dtlia2GI4xoag+x9uZwfMUO\nWKEe7tiUoZQEiGhwtjLq9lyST4kGGmlhNee9OyhDJcw4uCt8Cepr++hMDleWUF6c\nX0nbGmoSS0sZ5Boy8ATMhw/3luaOAlTUEz/nVDvbbWlNL9etwLKiAVw+AQXsPHNW\nNWF7gyEIsEi0qSM3PtA1X7IdReRXHqmfiZs0J3qSQQKBgQD1+Yj37Yuqj8hGi5PY\n+M0ieMdGcbUOmJsM1yUmBMV4bfaTiqm504P6DIYAqfDDWeozcHwcdpG1AfFAihEi\nh6lb0qRk8YaGbzvac8mWhwo/jDA5QB97fjFa6uwtlewZ0Er/U3QmOeVVnVC1y1b0\nrbJD5yjvI3ve+gpwAz0glpIMiwKBgQDOnpD7p7ylG4NQunqmzzdozrzZP0L6EZyE\n141st/Hsp9rtO9/ADuH6WhpirQ516l5LLv7mLPA8S9CF/cSdWF/7WlxBPjM8WRs9\nACFNBJIwUfjzPnvECmtsayzRlKuyCAspnNSkzgtdtvf2xI82Z3BGov9goZfu+D4A\n36b1qXsIQQKBgQCO1CojhO0vyjPKOuxL9hTvqmBUWFyBMD4AU8F/dQ/RYVDn1YG+\npMKi5Li/E+75EHH9EpkO0g7Do3AaQNG4UjwWVJcfAlxSHa8Mp2VsIdfilJ2/8KsX\nQ2yXVYh04/Rn/No/ro7oT4AKmcGu/nbstxuncEgFrH4WOOzspATPsn72BwKBgG5N\nBAT0NKbHm0B7bIKkWGYhB3vKY8zvnejk0WDaidHWge7nabkzuLtXYoKO9AtKxG/K\ndNUX5F+r8XO2V0HQLd0XDezecaejwgC8kwp0iD43ZHkmQBgVn+dPB6wSe94coSjj\nyjj4reSnipQ3tmRKsAtldIN3gI5YA3Gf85dtlHqBAoGAD5ePt7cmu3tDZhA3A8f9\no8mNPvqz/WGs7H2Qgjyfc3jUxEGhVt1Su7J1j+TppfkKtJIDKji6rVA9oIjZtpZT\ngxnU6hcYuiwbLh3wGEFIjP1XeYYILudqfWOEbwnxD1RgMkCqfSHf/niWlfiH6p3F\ndnBsLY/qXdKfS/OXyezAm4M=\n-----END PRIVATE KEY-----\n";
const GOOGLE_DOC_ID = "1U-2OPVVI_Gz0-uFonrRNrcFopDqmPGUcJ4qJ1RdAqxY";
const SPREADSHEET_ID = "15nU46XyAh0zLAyD_5DJPfZ2Gog6IOsoedSCCMpnjEJo";
// FLOW_TEXT และรายละเอียด flow ต่าง ๆ ถูกลบออก เนื่องจากไม่ได้ใช้งานแล้ว
const {
  isPasscodeFeatureEnabled,
  ensurePasscodeIndexes,
  verifyPasscode,
  createPasscode,
  listPasscodes,
  togglePasscode,
  deletePasscode,
  sanitizePasscodeInput,
  sanitizeLabelInput,
  mapPasscodeDoc,
} = require("./utils/auth");

function resolveInstructionAssetUrl(url, fallbackFileName) {
  const base =
    typeof PUBLIC_BASE_URL === "string"
      ? PUBLIC_BASE_URL.replace(/\/$/, "")
      : "";
  const candidate = (() => {
    if (typeof url === "string" && url.trim()) {
      return url.trim();
    }
    if (fallbackFileName) {
      return `/assets/instructions/${fallbackFileName}`;
    }
    return null;
  })();
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  const pathPart = candidate.startsWith("/")
    ? candidate
    : `/assets/instructions/${candidate}`;
  if (base) {
    return `${base}${pathPart}`;
  }
  return pathPart;
}

// Line Client จะถูกสร้างเมื่อต้องการใช้งานจริง (ไม่สร้างตั้งแต่เริ่มต้น)
let lineClient = null;

// ฟังก์ชันสำหรับสร้าง Line Client เมื่อต้องการใช้งาน
function createLineClient(channelAccessToken, channelSecret) {
  if (!channelAccessToken || !channelSecret) {
    throw new Error(
      "Channel Access Token และ Channel Secret จำเป็นสำหรับการใช้งาน Line Bot",
    );
  }

  const lineConfig = {
    channelAccessToken,
    channelSecret,
  };

  return new line.Client(lineConfig);
}
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ============================ CSP Helpers ============================
const cspImgSrc = ["'self'", "data:", "blob:"];
const registerCspOrigin = (value) => {
  if (!value || typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  try {
    const url = new URL(trimmed);
    if (url.origin && !cspImgSrc.includes(url.origin)) {
      cspImgSrc.push(url.origin);
    }
  } catch (_) {
    // Ignore non-absolute URLs (self already covers relative paths)
  }
};

registerCspOrigin(PUBLIC_BASE_URL);
registerCspOrigin(process.env.FOLLOWUP_PUBLIC_BASE_URL);
registerCspOrigin(process.env.FOLLOWUP_ASSETS_BASE_URL);
registerCspOrigin(process.env.ASSETS_BASE_URL);

// ============================ UI Middleware ============================
// Security headers (relaxed CSP ให้โหลด resource จาก CDN ได้)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-hashes'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com",
        ],
        imgSrc: cspImgSrc,
        fontSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.gstatic.com",
        ],
        connectSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
      },
    },
  }),
);
app.use(cors());

// Static assets (CSS/JS/img)
app.use(express.static(path.join(__dirname, "public")));
// Serve instruction assets from configurable directory (supports mounted volumes)
try {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }
  app.use("/assets/instructions", express.static(ASSETS_DIR, { maxAge: "7d" }));
  console.log("[Static] Serving instruction assets from:", ASSETS_DIR);

  if (!fs.existsSync(FOLLOWUP_ASSETS_DIR)) {
    fs.mkdirSync(FOLLOWUP_ASSETS_DIR, { recursive: true });
  }
  app.use(
    "/assets/followup",
    express.static(FOLLOWUP_ASSETS_DIR, { maxAge: "7d" }),
  );
  console.log("[Static] Serving follow-up assets from:", FOLLOWUP_ASSETS_DIR);
} catch (e) {
  console.warn("[Static] Could not ensure asset directories:", e?.message || e);
}

app.get("/assets/instructions/:fileName", async (req, res, next) => {
  try {
    const { fileName } = req.params;
    if (!fileName) return next();

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");
    const doc = await coll.findOne({
      $or: [
        { fileName },
        { thumbFileName: fileName },
        { label: fileName.replace(/\.[^/.]+$/, "") },
        { label: fileName.replace(/_thumb\.[^/.]+$/, "") },
      ],
    });

    if (!doc) return next();

    const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });
    const isThumb =
      fileName === doc.thumbFileName ||
      fileName.endsWith("_thumb.jpg") ||
      fileName.endsWith("_thumb.jpeg");
    const targetName = isThumb
      ? doc.thumbFileName || `${doc.label}_thumb.jpg`
      : doc.fileName || `${doc.label}.jpg`;
    const targetId = isThumb ? doc.thumbFileId : doc.fileId;
    if (!targetName) return next();
    let fileObjectId = toObjectId(targetId);

    if (!fileObjectId) {
      const files = await bucket
        .find({ filename: targetName })
        .sort({ uploadDate: -1 })
        .limit(1)
        .toArray();
      if (!files.length) return next();
      fileObjectId = files[0]._id;
    }

    const stream = bucket.openDownloadStream(fileObjectId);

    res.set("Content-Type", doc.mime || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    stream.on("error", (err) => {
      console.error(
        `[Asset Error] Failed to stream instruction asset: ${fileName}`,
        {
          error: err.message,
          code: err.code,
          fileName,
          targetName,
          targetId,
          fileObjectId,
        },
      );
      if (err.code === "FileNotFound") return next();
      next(err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error(
      `[Asset Error] Error in instruction asset route: ${fileName}`,
      {
        error: err.message,
        stack: err.stack,
        fileName,
      },
    );
    next(err);
  }
});

app.get("/assets/followup/:fileName", async (req, res, next) => {
  try {
    const { fileName } = req.params;
    if (!fileName) return next();

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_assets");
    const doc = await coll.findOne({
      $or: [{ fileName }, { thumbName: fileName }, { thumbFileName: fileName }],
    });

    if (!doc) return next();

    const bucket = new GridFSBucket(db, { bucketName: "followupAssets" });
    const isThumb =
      fileName === doc.thumbName ||
      fileName === doc.thumbFileName ||
      fileName.endsWith("_thumb.jpg") ||
      fileName.endsWith("_thumb.jpeg");
    const targetName = isThumb
      ? doc.thumbFileName || doc.thumbName
      : doc.fileName;
    const targetId = isThumb ? doc.thumbFileId || null : doc.fileId || null;
    if (!targetName) return next();
    let fileObjectId = toObjectId(targetId);

    if (!fileObjectId) {
      const files = await bucket
        .find({ filename: targetName })
        .sort({ uploadDate: -1 })
        .limit(1)
        .toArray();
      if (!files.length) return next();
      fileObjectId = files[0]._id;
    }

    const stream = bucket.openDownloadStream(fileObjectId);

    res.set("Content-Type", doc.mime || "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    stream.on("error", (err) => {
      console.error(`[Asset Error] Failed to stream followup asset: ${fileName}`, {
        error: err.message,
        code: err.code,
        fileName,
        targetName,
        targetId,
        fileObjectId,
      });
      if (err.code === "FileNotFound") return next();
      next(err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error(`[Asset Error] Error in followup asset route: ${fileName}`, {
      error: err.message,
      stack: err.stack,
      fileName,
    });
    next(err);
  }
});

// Avoid favicon 404s in environments without a favicon
app.get("/favicon.ico", (req, res) => res.sendStatus(204));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ============================ Multer Configuration ============================
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // ตรวจสอบว่าเป็นไฟล์ Excel หรือไม่
    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.match(/\.(xlsx|xls)$/)
    ) {
      cb(null, true);
    } else {
      cb(new Error("กรุณาเลือกไฟล์ Excel เท่านั้น (.xlsx หรือ .xls)"), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Multer for image uploads (Instruction Assets)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.match(/\.(jpe?g|png|webp)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("กรุณาอัพโหลดเฉพาะไฟล์รูปภาพ (jpg, png, webp)"), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image
  },
});

// ฟังก์ชันสำหรับอ่านไฟล์ Excel และแปลงเป็น instructions
function processExcelToInstructions(buffer, originalName) {
  try {
    console.log(`[Excel] เริ่มประมวลผลไฟล์: ${originalName}`);

    // อ่านไฟล์ Excel
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames;

    console.log(
      `[Excel] พบแท็บใน Excel: ${sheetNames.length} แท็บ (${sheetNames.join(", ")})`,
    );

    const instructions = [];

    sheetNames.forEach((sheetName, index) => {
      try {
        const worksheet = workbook.Sheets[sheetName];

        // แปลงข้อมูลในแท็บเป็น JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) {
          console.log(`[Excel] แท็บ "${sheetName}" ว่างเปล่า ข้าม...`);
          return;
        }

        // ถ้ามีข้อมูลมากกว่า 1 แถว ให้ถือเป็นตาราง
        if (jsonData.length > 1 && jsonData[0] && jsonData[0].length > 0) {
          const headers = jsonData[0];
          const dataRows = jsonData.slice(1);

          // กรองแถวที่มีข้อมูล
          const validRows = dataRows.filter(
            (row) =>
              row &&
              row.some(
                (cell) => cell !== undefined && cell !== null && cell !== "",
              ),
          );

          if (validRows.length > 0) {
            // สร้าง instruction แบบตาราง
            const tableData = {
              columns: headers.map((h) => h || ""),
              rows: validRows
                .map((row) => {
                  const rowObj = {};
                  headers.forEach((header, idx) => {
                    if (
                      header &&
                      row[idx] !== undefined &&
                      row[idx] !== null &&
                      row[idx] !== ""
                    ) {
                      rowObj[header] = String(row[idx]);
                    }
                  });
                  return rowObj;
                })
                .filter((obj) => Object.keys(obj).length > 0),
            };

            instructions.push({
              type: "table",
              title: sheetName,
              content: `ข้อมูลจากแท็บ "${sheetName}" ในไฟล์ ${originalName}`,
              data: tableData,
              source: "excel",
              fileName: originalName,
              sheetName: sheetName,
            });

            console.log(
              `[Excel] สร้าง instruction ตาราง "${sheetName}": ${tableData.rows.length} แถว`,
            );
          }
        } else if (
          jsonData.length === 1 &&
          jsonData[0] &&
          jsonData[0].length > 0
        ) {
          // ถ้ามีแค่ 1 แถว ให้ถือเป็นข้อความ
          const textContent = jsonData[0].join(" ").trim();
          if (textContent) {
            instructions.push({
              type: "text",
              title: sheetName,
              content: textContent,
              source: "excel",
              fileName: originalName,
              sheetName: sheetName,
            });

            console.log(
              `[Excel] สร้าง instruction ข้อความ "${sheetName}": ${textContent.length} อักขระ`,
            );
          }
        }
      } catch (sheetError) {
        console.error(
          `[Excel] ข้อผิดพลาดในการประมวลผลแท็บ "${sheetName}":`,
          sheetError,
        );
      }
    });

    console.log(
      `[Excel] ประมวลผลเสร็จสิ้น: สร้าง ${instructions.length} instructions`,
    );
    return instructions;
  } catch (error) {
    console.error("[Excel] ข้อผิดพลาดในการประมวลผลไฟล์ Excel:", error);
    throw new Error("ไม่สามารถประมวลผลไฟล์ Excel ได้: " + error.message);
  }
}

function sanitizeSheetName(name, fallback) {
  const invalidChars = /[\\/?*\[\]:]/g;
  let sanitized = (name || "").replace(invalidChars, " ").trim();
  if (!sanitized) {
    sanitized = fallback;
  }
  if (sanitized.length > 31) {
    sanitized = sanitized.substring(0, 31).trim();
  }
  return sanitized || fallback;
}

function buildInstructionText(instructions, options = {}) {
  const { tableMode = "placeholder", emptyText = "_ไม่มีเนื้อหา_" } = options;
  const normalizeText = (text) => {
    if (!text) return "";
    return String(text).replace(/\r\n/g, "\n");
  };

  return instructions
    .map((instruction, idx) => {
      const indexLabel = idx + 1;
      const title =
        instruction.title && instruction.title.trim()
          ? instruction.title.trim()
          : `Instruction ${indexLabel}`;
      const lines = [`#${indexLabel} ${title}`];

      if (instruction.type === "table" && instruction.data) {
        const content = normalizeText(instruction.content).trim();
        if (content) {
          lines.push("");
          lines.push(...content.split("\n"));
        }

        if (tableMode === "json") {
          const tableJson = JSON.stringify(instruction.data, null, 2);
          lines.push("");
          lines.push(...tableJson.split("\n"));
        } else if (tableMode === "placeholder") {
          lines.push("");
          lines.push("[TABLE DATA]");
        }
      } else {
        const content = normalizeText(instruction.content).trim();
        lines.push("");
        if (content) {
          lines.push(...content.split("\n"));
        } else if (emptyText) {
          lines.push(emptyText);
        }
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

let mongoClient = null;
async function connectDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    try {
      const db = mongoClient.db("chatbot");
      await ensurePasscodeIndexes(db);
    } catch (err) {
      console.warn(
        "[DB] ไม่สามารถตั้งค่า index สำหรับ passcode ได้:",
        err?.message || err,
      );
    }
  }
  return mongoClient;
}

/**
 * แก้ไขให้ content เป็น string เสมอ
 */
function normalizeRoleContent(role, content) {
  if (typeof content === "string") {
    return { role, content };
  } else {
    // ถ้าไม่ใช่ string => stringify
    return { role, content: JSON.stringify(content) };
  }
}

const sessionStore = MongoStore.create({
  clientPromise: connectDB(),
  dbName: "chatbot",
  collectionName: "admin_sessions",
  stringify: false,
  ttl: ADMIN_SESSION_TTL_SECONDS,
});

const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: ADMIN_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
  },
});

app.use(sessionMiddleware);
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use((req, res, next) => {
  res.locals.adminUser = req.session?.adminUser || null;
  res.locals.isPasscodeRequired = isPasscodeFeatureEnabled(
    ADMIN_MASTER_PASSCODE,
  );
  next();
});

function isAdminAuthenticated(req) {
  return Boolean(req.session && req.session.adminUser);
}

function registerAdminSession(req, { role, passcodeDoc }) {
  req.session.adminUser = {
    role,
    codeId: passcodeDoc ? String(passcodeDoc._id) : null,
    label: passcodeDoc?.label || null,
    loggedInAt: new Date().toISOString(),
  };
}

function destroyAdminSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

function getAdminUserContext(req) {
  if (!isAdminAuthenticated(req)) return null;
  const { role, codeId, label, loggedInAt } = req.session.adminUser;
  return {
    role,
    codeId,
    label,
    loggedInAt,
  };
}

function enforceAdminLogin(req, res, next) {
  if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
    return next();
  }

  const relaxedPaths = ["/login", "/logout", "/passcodes/self-check"];
  if (relaxedPaths.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  if (isAdminAuthenticated(req)) {
    return next();
  }

  const wantsHTML =
    req.headers.accept && req.headers.accept.includes("text/html");
  if (wantsHTML) {
    return res.redirect("/admin/login");
  }

  return res.status(401).json({
    success: false,
    error: "กรุณาล็อกอินก่อนใช้งาน",
  });
}

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ในภายหลัง",
    });
  },
});

function requireSuperadmin(req, res, next) {
  if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
    return res.status(400).json({
      success: false,
      error: "ยังไม่ได้เปิดใช้ระบบรหัสผ่าน",
    });
  }

  if (
    !isAdminAuthenticated(req) ||
    req.session.adminUser.role !== "superadmin"
  ) {
    return res.status(403).json({
      success: false,
      error: "จำเป็นต้องเป็นแอดมินใหญ่ก่อน",
    });
  }

  return next();
}

async function getChatHistory(userId) {
  // ตรวจสอบการตั้งค่าการบันทึกประวัติ
  const enableChatHistory = await getSettingValue("enableChatHistory", true);

  if (!enableChatHistory) {
    console.log(`[LOG] การบันทึกประวัติแชทถูกปิดใช้งานสำหรับผู้ใช้: ${userId}`);
    return [];
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  const chats = await coll
    .find({ senderId: userId })
    .sort({ timestamp: 1 })
    .toArray();
  return chats.map((ch) => {
    try {
      const parsed = JSON.parse(ch.content);
      return normalizeRoleContent(ch.role, parsed);
    } catch {
      return normalizeRoleContent(ch.role, ch.content);
    }
  });
}

/**
 * ดึงประวัติแชทที่ถูกทำให้เหมาะสมสำหรับส่งให้ OpenAI
 * - ตัดข้อมูลรูปภาพ (base64) ออกจากข้อความเก่า
 * - เก็บเฉพาะข้อความตัวอักษร และใส่หมายเหตุว่ามีรูปภาพกี่รูป
 * - จำกัดจำนวนข้อความล่าสุดเพื่อลด token
 */
async function getAIHistory(userId) {
  // หากปิดการบันทึกประวัติ ก็ไม่มีอะไรให้ส่ง
  const enableChatHistory = await getSettingValue("enableChatHistory", true);
  if (!enableChatHistory) return [];

  // จำกัดจำนวนข้อความล่าสุด (ปรับได้จาก settings), ค่าเริ่มต้น 30
  const historyLimit = await getSettingValue("aiHistoryLimit", 30);

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");

  // ดึงเฉพาะข้อความล่าสุดตามจำนวนที่กำหนด แล้วกลับลำดับเป็นเก่าสุด -> ใหม่สุด
  const raw = await coll
    .find({ senderId: userId })
    .sort({ timestamp: -1 })
    .limit(historyLimit)
    .toArray();

  const items = raw.reverse();

  const sanitize = (role, content) => {
    // คืนค่าเป็น string เสมอ และไม่มี base64 ขนาดใหญ่
    const isBase64Like = (str) => {
      if (typeof str !== "string") return false;
      if (str.length < 1024) return false; // เล็กๆ ปล่อยผ่าน
      // รูปแบบพบได้บ่อยของ base64 รูปภาพ
      if (str.startsWith("data:image/")) return true;
      if (str.includes("\n")) return false; // เนื้อความปกติมักมีช่องว่าง/ขึ้นบรรทัด
      const base64Chars = /^[A-Za-z0-9+/=]+$/;
      return base64Chars.test(str.slice(0, Math.min(str.length, 8192)));
    };

    const truncateLong = (str, maxLen = 4000) => {
      if (typeof str !== "string") return "";
      return str.length > maxLen
        ? str.slice(0, maxLen) + "\n[ตัดเนื้อความยาว]"
        : str;
    };

    try {
      // ถ้าเก็บเป็น JSON (เช่น array ของ contentSequence)
      const parsed =
        typeof content === "string" ? JSON.parse(content) : content;

      // กรณีเป็น array: รูปแบบ contentSequence
      if (Array.isArray(parsed)) {
        let textParts = [];
        let imgCount = 0;

        for (const item of parsed) {
          if (!item) continue;
          // รูปแบบใหม่ { type, content, description }
          if (item.type === "text" && typeof item.content === "string") {
            textParts.push(item.content);
          } else if (item.type === "image") {
            imgCount++;
          }
          // รูปแบบเก่า { data: { type, text|base64 } }
          else if (item.data) {
            const d = item.data;
            if (d.type === "text" && typeof d.text === "string") {
              textParts.push(d.text);
            } else if (d.type === "image") {
              imgCount++;
            }
          }
        }

        let text = textParts.join("\n\n");
        if (imgCount > 0) {
          const note = `[มีรูปภาพก่อนหน้า ${imgCount} รูป]`;
          text = text ? `${text}\n\n${note}` : note;
        }
        return truncateLong(text);
      }

      // กรณีเป็น object เดี่ยว (ไม่ใช่ array)
      if (parsed && typeof parsed === "object") {
        // พยายามดึงข้อความถ้ามี
        if (parsed.type === "text" && typeof parsed.content === "string") {
          return truncateLong(parsed.content);
        }
        if (
          parsed.data &&
          parsed.data.type === "text" &&
          typeof parsed.data.text === "string"
        ) {
          return truncateLong(parsed.data.text);
        }
        // ถ้ามีรูปภาพแต่ไม่มีข้อความ ให้ใส่หมายเหตุ
        if (
          parsed.type === "image" ||
          (parsed.data && parsed.data.type === "image")
        ) {
          return "[มีรูปภาพก่อนหน้า 1 รูป]";
        }
        // อย่างอื่นให้ตัดให้สั้นๆ
        return truncateLong(JSON.stringify(parsed));
      }

      // ตกมาที่นี่แปลว่า content เป็น string ปกติ
      if (isBase64Like(content)) {
        return "[ตัดข้อมูลรูปภาพขนาดใหญ่จากประวัติ]";
      }
      return truncateLong(content);
    } catch (_) {
      // parse ไม่ได้: ตรวจจับ base64 แล้วตัดทิ้ง
      if (isBase64Like(content)) {
        return "[ตัดข้อมูลรูปภาพขนาดใหญ่จากประวัติ]";
      }
      return truncateLong(String(content ?? ""));
    }
  };

  const sanitized = items.map((ch) => ({
    role: ch.role,
    content: sanitize(ch.role, ch.content),
  }));

  // ลบข้อความว่างที่ไม่มีประโยชน์ต่อบริบท
  return sanitized.filter(
    (m) => m && typeof m.content === "string" && m.content.trim() !== "",
  );
}

// ฟังก์ชันสำหรับดึงข้อมูลโปรไฟล์จาก LINE API
async function getLineUserProfile(userId) {
  try {
    const profile = await lineClient.getProfile(userId);
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
    };
  } catch (error) {
    console.error(
      `[ERROR] ไม่สามารถดึงข้อมูลโปรไฟล์จาก LINE API สำหรับผู้ใช้ ${userId}:`,
      error.message,
    );

    // ถ้าเป็น error เกี่ยวกับ rate limit หรือ temporary error ให้ retry
    if (error.status === 429 || error.status >= 500) {
      console.log(
        `[LOG] พยายาม retry สำหรับผู้ใช้ ${userId} ในอีก 5 วินาที...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const retryProfile = await lineClient.getProfile(userId);
        return {
          userId: retryProfile.userId,
          displayName: retryProfile.displayName,
          pictureUrl: retryProfile.pictureUrl,
          statusMessage: retryProfile.statusMessage,
        };
      } catch (retryError) {
        console.error(
          `[ERROR] Retry ไม่สำเร็จสำหรับผู้ใช้ ${userId}:`,
          retryError.message,
        );
      }
    }

    return {
      userId: userId,
      displayName: userId.substring(0, 8) + "...",
      pictureUrl: null,
      statusMessage: null,
    };
  }
}

// ฟังก์ชันสำหรับบันทึกหรืออัปเดตข้อมูลผู้ใช้
async function saveOrUpdateUserProfile(userId) {
  try {
    const profile = await getLineUserProfile(userId);
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_profiles");

    await coll.updateOne(
      { userId: profile.userId },
      {
        $set: {
          ...profile,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    return profile;
  } catch (error) {
    console.error(
      `[ERROR] ไม่สามารถบันทึกข้อมูลผู้ใช้ ${userId}:`,
      error.message,
    );
    return null;
  }
}

async function fetchFacebookProfile(psid, accessToken) {
  if (!psid || !accessToken) {
    return null;
  }

  const apiVersion = "v18.0";
  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(
    psid,
  )}`;

  try {
    const { data } = await axios.get(url, {
      params: {
        fields: "name,first_name,last_name,profile_pic",
        access_token: accessToken,
      },
    });

    const fullName =
      data?.name ||
      [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();

    if (!fullName) {
      return null;
    }

    return {
      userId: psid,
      platform: "facebook",
      displayName: fullName,
      pictureUrl: data?.profile_pic || null,
      updatedAt: new Date(),
    };
  } catch (error) {
    const status = error?.response?.status;
    const message =
      error?.response?.data?.error?.message || error?.message || "unknown";
    console.warn(
      `[Facebook] ไม่สามารถดึงโปรไฟล์ ${psid} (${status || "n/a"}): ${message}`,
    );
    return null;
  }
}

async function ensureFacebookProfileDisplayName(psid, accessToken) {
  if (!psid || !accessToken) {
    return null;
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("user_profiles");

  const existing = await coll.findOne(
    { userId: psid, platform: "facebook" },
    { projection: { displayName: 1 } },
  );

  if (existing?.displayName && existing.displayName.trim()) {
    return existing;
  }

  const profile = await fetchFacebookProfile(psid, accessToken);
  if (!profile?.displayName) {
    return existing;
  }

  const now = new Date();
  await coll.updateOne(
    { userId: psid, platform: "facebook" },
    {
      $set: {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: psid,
        platform: "facebook",
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return profile;
}

async function saveChatHistory(
  userId,
  userMsg,
  assistantMsg,
  platform = "line",
  botId = null,
) {
  // ตรวจสอบการตั้งค่าการบันทึกประวัติ
  const enableChatHistory = await getSettingValue("enableChatHistory", true);

  if (!enableChatHistory) {
    console.log(`[LOG] การบันทึกประวัติแชทถูกปิดใช้งานสำหรับผู้ใช้: ${userId}`);
    return;
  }

  // บันทึกหรืออัปเดตข้อมูลผู้ใช้ก่อน (เฉพาะ LINE)
  if (platform === "line") {
    await saveOrUpdateUserProfile(userId);
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  let userMsgToSave =
    typeof userMsg === "string" ? userMsg : JSON.stringify(userMsg);

  // Insert user message and emit to admin chat in realtime
  const userTimestamp = new Date();
  const userMessageDoc = {
    senderId: userId,
    role: "user",
    content: userMsgToSave,
    timestamp: userTimestamp,
    platform,
    botId,
    source: "user",
  };
  const userInsertResult = await coll.insertOne(userMessageDoc);
  if (userInsertResult?.insertedId) {
    userMessageDoc._id = userInsertResult.insertedId;
  }
  await appendOrderExtractionMessage(userMessageDoc);

  try {
    if (typeof io !== "undefined" && io) {
      let emittedUserMessage = userMessageDoc;
      try {
        const normalizedForEmit = normalizeMessageForFrontend(userMessageDoc);
        if (
          normalizedForEmit &&
          normalizedForEmit.role === "user" &&
          normalizedForEmit.contentType === "text" &&
          typeof normalizedForEmit.content === "string" &&
          normalizedForEmit.content.length > 0
        ) {
          const filteredContent = await filterMessage(
            normalizedForEmit.content,
          );
          if (filteredContent !== normalizedForEmit.content) {
            normalizedForEmit.originalContent = normalizedForEmit.content;
          }
          normalizedForEmit.content = filteredContent;
          normalizedForEmit.displayContent = filteredContent;
        }

        emittedUserMessage = {
          ...userMessageDoc,
          ...normalizedForEmit,
        };
      } catch (formatError) {
        emittedUserMessage = { ...userMessageDoc };
      }

      io.emit("newMessage", {
        userId: userId,
        message: emittedUserMessage,
        sender: "user",
        timestamp: emittedUserMessage.timestamp || userTimestamp,
      });
    }
  } catch (_) {
    // non-fatal: socket emit failure should not block saving history
  }

  try {
    const previewText = buildFollowUpPreview(userMsgToSave);
    await scheduleFollowUpForUser(userId, {
      platform,
      botId,
      messageTimestamp: userTimestamp,
      preview: previewText,
    });
  } catch (scheduleError) {
    console.error("[FollowUp] ตั้งเวลาติดตามไม่สำเร็จ:", scheduleError.message);
  }

  // Insert assistant message
  const assistantTimestamp = new Date();
  const assistantMessageDoc = {
    senderId: userId,
    role: "assistant",
    content: assistantMsg,
    timestamp: assistantTimestamp,
    platform,
    botId,
    source: "ai",
  };
  const assistantInsertResult = await coll.insertOne(assistantMessageDoc);
  if (assistantInsertResult?.insertedId) {
    assistantMessageDoc._id = assistantInsertResult.insertedId;
  }
  await appendOrderExtractionMessage(assistantMessageDoc);

  try {
    if (typeof io !== "undefined" && io) {
      io.emit("newMessage", {
        userId,
        message: assistantMessageDoc,
        sender: "assistant",
        timestamp: assistantTimestamp,
      });
    }
  } catch (_) {
    // ไม่ต้องหยุดการทำงานหากไม่สามารถแจ้งเตือนผ่าน socket ได้
  }

  // วิเคราะห์การติดตามลูกค้าหลังจากบันทึกข้อความของผู้ใช้
  const shouldAnalyzeFollowUp =
    typeof userMsgToSave === "string" ? userMsgToSave.trim().length > 0 : true;
  if (shouldAnalyzeFollowUp) {
    maybeAnalyzeFollowUp(userId, platform, botId).catch((error) => {
      console.error("[FollowUp] Background analyze error:", error.message);
    });
  }

  // วิเคราะห์ออเดอร์อัตโนมัติหลังจากบันทึกข้อความของผู้ใช้
  if (shouldAnalyzeFollowUp) {
    maybeAnalyzeOrder(userId, platform, botId).catch((error) => {
      console.error("[Order] Background analyze error:", error.message);
    });
  }
}

async function getUserStatus(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("active_user_status");
  let userStatus = await coll.findOne({ senderId: userId });
  if (!userStatus) {
    userStatus = { senderId: userId, aiEnabled: true, updatedAt: new Date() };
    await coll.insertOne(userStatus);
  }
  return userStatus;
}

async function setUserStatus(userId, aiEnabled) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("active_user_status");
  await coll.updateOne(
    { senderId: userId },
    { $set: { aiEnabled, updatedAt: new Date() } },
    { upsert: true },
  );
}

/**
 * ตรวจจับและดำเนินการตาม keyword ที่ตั้งไว้
 * @param {string} message - ข้อความที่จะตรวจสอบ
 * @param {object} keywordSettings - การตั้งค่า keywords จาก bot config
 * @param {string} userId - User ID ของผู้รับข้อความ
 * @param {string} platform - แพลตฟอร์ม (line/facebook)
 * @param {string} botId - Bot ID
 * @param {boolean} isFromAdmin - เป็นข้อความจากแอดมินหรือไม่
 * @returns {Promise<{action: string|null, message: string, sendResponse: boolean}>} - action ที่ดำเนินการและข้อความตอบกลับ
 */
async function detectKeywordAction(
  message,
  keywordSettings,
  userId,
  platform,
  botId,
  isFromAdmin = false,
) {
  // ต้องเป็นข้อความจากแอดมินเท่านั้น
  if (!isFromAdmin) {
    return { action: null, message: "", sendResponse: false };
  }

  if (!keywordSettings || !message) {
    return { action: null, message: "", sendResponse: false };
  }

  const trimmedMessage = message.trim();

  const normalizeForComparison = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    let normalized = value;
    try {
      normalized = normalized.normalize("NFC");
    } catch (_) {
      // หาก normalize ใช้ไม่ได้ (เช่น environment เก่า) ให้ใช้ค่าดั้งเดิม
    }
    return normalized.trim().replace(/\s+/g, " ").toLowerCase();
  };

  const parseKeywords = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
    }
    if (typeof raw !== "string") {
      return [];
    }
    return raw
      .split(/[\n,|]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  };

  const matchesKeyword = (input, setting) => {
    const candidates =
      Array.isArray(setting.keywords) && setting.keywords.length > 0
        ? setting.keywords
        : setting.keyword
          ? [setting.keyword]
          : [];

    if (!candidates.length) {
      return false;
    }

    const normalizedInput = normalizeForComparison(input);
    if (!normalizedInput) {
      return false;
    }

    return candidates.some((candidate) => {
      const normalizedCandidate = normalizeForComparison(candidate);
      if (!normalizedCandidate) return false;
      return normalizedInput.includes(normalizedCandidate);
    });
  };

  // รองรับทั้งรูปแบบเก่า (string) และรูปแบบใหม่ (object)
  const normalizeKeywordSetting = (setting) => {
    if (!setting) {
      return { keyword: "", keywords: [], response: "" };
    }
    if (typeof setting === "string") {
      const keywords = parseKeywords(setting);
      return {
        keyword: keywords[0] || "",
        keywords,
        response: "",
      };
    }
    if (Array.isArray(setting)) {
      const keywords = parseKeywords(setting);
      return {
        keyword: keywords[0] || "",
        keywords,
        response: "",
      };
    }
    return {
      keyword: setting.keyword || "",
      keywords: parseKeywords(setting.keywords || setting.keyword || ""),
      response: typeof setting.response === "string" ? setting.response : "",
    };
  };

  const enableAI = normalizeKeywordSetting(keywordSettings.enableAI);
  const disableAI = normalizeKeywordSetting(keywordSettings.disableAI);
  const disableFollowUp = normalizeKeywordSetting(
    keywordSettings.disableFollowUp,
  );

  // ตรวจสอบ keyword สำหรับเปิด AI
  if (matchesKeyword(trimmedMessage, enableAI)) {
    await setUserStatus(userId, true);
    console.log(
      `[Keyword] เปิด AI สำหรับผู้ใช้ ${userId} ด้วย keyword: "${trimmedMessage}"`,
    );
    const responseMessage = enableAI.response.trim();
    const sendResponse = responseMessage.length > 0;
    return {
      action: "enableAI",
      message: responseMessage || `✅ เปิดระบบ AI สำหรับผู้ใช้นี้แล้ว`,
      sendResponse: sendResponse,
    };
  }

  // ตรวจสอบ keyword สำหรับปิด AI
  if (matchesKeyword(trimmedMessage, disableAI)) {
    await setUserStatus(userId, false);
    try {
      await cancelFollowUpTasksForUser(userId, platform, botId, {
        reason: "disable_ai_keyword",
      });
    } catch (followUpError) {
      console.error(
        `[Keyword] ไม่สามารถยกเลิกงานติดตามสำหรับผู้ใช้ ${userId} หลังจากปิด AI:`,
        followUpError?.message || followUpError,
      );
    }
    console.log(
      `[Keyword] ปิด AI สำหรับผู้ใช้ ${userId} ด้วย keyword: "${trimmedMessage}"`,
    );
    const responseMessage = disableAI.response.trim();
    const sendResponse = responseMessage.length > 0;
    return {
      action: "disableAI",
      message: responseMessage || `⏸️ ปิดระบบ AI สำหรับผู้ใช้นี้แล้ว`,
      sendResponse: sendResponse,
    };
  }

  // ตรวจสอบ keyword สำหรับปิดระบบติดตาม
  if (matchesKeyword(trimmedMessage, disableFollowUp)) {
    await cancelFollowUpTasksForUser(userId, platform, botId, {
      reason: "keyword_cancel",
    });
    console.log(
      `[Keyword] ปิดระบบติดตามสำหรับผู้ใช้ ${userId} ด้วย keyword: "${trimmedMessage}"`,
    );
    const responseMessage = disableFollowUp.response.trim();
    const sendResponse = responseMessage.length > 0;
    return {
      action: "disableFollowUp",
      message: responseMessage || `🔕 ปิดระบบติดตามสำหรับผู้ใช้นี้แล้ว`,
      sendResponse: sendResponse,
    };
  }

  return { action: null, message: "", sendResponse: false };
}

/**
 * ฟังก์ชันสำหรับลบประวัติการสนทนาทั้งหมดของ user
 */
async function clearUserChatHistory(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  await coll.deleteMany({ senderId: userId });
}

const BANGKOK_TZ = "Asia/Bangkok";
const FOLLOW_UP_BASE_CACHE_TTL = 60 * 1000;
let followUpBaseConfigCache = null;
let followUpBaseCacheTimestamp = 0;
const followUpContextCache = new Map();
let followUpTaskTimer = null;
let followUpProcessing = false;
const FOLLOW_UP_TASK_INTERVAL_MS = 30 * 1000;

function normalizeFollowUpBotId(botId) {
  if (!botId) return null;
  if (typeof botId === "string") return botId;
  try {
    return botId.toString();
  } catch {
    return String(botId);
  }
}

function getBangkokMoment(value = null) {
  if (value instanceof Date) return moment.tz(value, BANGKOK_TZ);
  if (typeof value === "number") return moment.tz(value, BANGKOK_TZ);
  if (typeof value === "string") return moment.tz(new Date(value), BANGKOK_TZ);
  return moment.tz(BANGKOK_TZ);
}

function getDateKey(date = new Date()) {
  return getBangkokMoment(date).format("YYYY-MM-DD");
}

function sanitizeFollowUpImage(image) {
  if (!image) return null;
  let url = typeof image.url === "string" ? image.url.trim() : "";
  if (!url) return null;

  // แปลง relative URL เป็น absolute URL
  if (url.startsWith("/") && PUBLIC_BASE_URL) {
    url = PUBLIC_BASE_URL.replace(/\/$/, "") + url;
  }

  const previewCandidates = [
    typeof image.previewUrl === "string" ? image.previewUrl.trim() : "",
    typeof image.thumbUrl === "string" ? image.thumbUrl.trim() : "",
  ];
  let previewUrl = previewCandidates.find((value) => value) || url;

  // แปลง relative preview URL เป็น absolute URL
  if (previewUrl.startsWith("/") && PUBLIC_BASE_URL) {
    previewUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + previewUrl;
  }

  const sanitized = {
    url,
    previewUrl,
  };

  if (typeof image.thumbUrl === "string" && image.thumbUrl.trim()) {
    let thumbUrl = image.thumbUrl.trim();
    // แปลง relative thumb URL เป็น absolute URL
    if (thumbUrl.startsWith("/") && PUBLIC_BASE_URL) {
      thumbUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + thumbUrl;
    }
    sanitized.thumbUrl = thumbUrl;
  }

  const assignTrimmed = (field, value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) sanitized[field] = trimmed;
    }
  };

  assignTrimmed("alt", image.alt);
  assignTrimmed("caption", image.caption);
  assignTrimmed("fileName", image.fileName);

  const assetId = image.assetId ?? image.id ?? image._id;
  if (assetId !== undefined && assetId !== null) {
    try {
      const value =
        typeof assetId === "string" ? assetId.trim() : assetId.toString();
      if (value) sanitized.assetId = value;
    } catch {
      const fallback = String(assetId);
      if (fallback) sanitized.assetId = fallback;
    }
  }

  ["width", "height", "size"].forEach((key) => {
    const numeric = Number(image[key]);
    if (Number.isFinite(numeric) && numeric > 0) {
      sanitized[key] = Math.round(numeric);
    }
  });

  return sanitized;
}

function sanitizeFollowUpImages(images) {
  if (!Array.isArray(images)) {
    console.log(
      "[FollowUp Debug] sanitizeFollowUpImages: not an array",
      typeof images,
    );
    return [];
  }
  const result = images.map(sanitizeFollowUpImage).filter(Boolean);
  console.log("[FollowUp Debug] sanitizeFollowUpImages:", {
    inputCount: images.length,
    outputCount: result.length,
    sample: result[0],
    allUrls: result.map((img) => ({
      url: img.url,
      isAbsolute: img.url.startsWith("http"),
      previewUrl: img.previewUrl,
      previewIsAbsolute: img.previewUrl?.startsWith("http"),
    })),
  });
  return result;
}

function summarizeFollowUpRound(round) {
  if (!round) return "";
  const message = typeof round.message === "string" ? round.message.trim() : "";
  const imageCount = Array.isArray(round.images) ? round.images.length : 0;

  if (message && imageCount > 0) {
    return `${message} • รูปภาพ ${imageCount} รูป`;
  }
  if (message) return message;
  if (imageCount > 0) {
    return `ส่งรูปภาพ ${imageCount} รูป`;
  }
  return "";
}

function normalizeFollowUpRounds(rounds) {
  if (!Array.isArray(rounds)) return [];
  const normalized = [];
  rounds.forEach((item, idx) => {
    if (!item) return;
    const delay = Number(item.delayMinutes);
    const message = typeof item.message === "string" ? item.message.trim() : "";
    const images = sanitizeFollowUpImages(item.images || item.media);

    // Debug log
    console.log(`[FollowUp Debug] Normalizing round ${idx}:`, {
      hasItem: !!item,
      delay,
      messageLength: message.length,
      rawImages: item.images || item.media,
      imagesCount: images.length,
    });

    if (!Number.isFinite(delay) || delay < 1) return;
    if (!message && images.length === 0) return;
    normalized.push({
      delayMinutes: Math.round(delay),
      message,
      images,
      order: idx,
    });
  });
  normalized.sort((a, b) => {
    if (a.delayMinutes === b.delayMinutes) {
      return (a.order || 0) - (b.order || 0);
    }
    return a.delayMinutes - b.delayMinutes;
  });
  return normalized.map((round) => {
    const { order, ...rest } = round;
    return rest;
  });
}

function resetFollowUpConfigCache() {
  followUpBaseConfigCache = null;
  followUpBaseCacheTimestamp = 0;
  followUpContextCache.clear();
}

async function getFollowUpBaseConfig() {
  const now = Date.now();
  if (
    followUpBaseConfigCache &&
    now - followUpBaseCacheTimestamp < FOLLOW_UP_BASE_CACHE_TTL
  ) {
    return followUpBaseConfigCache;
  }

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("settings");
  const keys = [
    "enableFollowUpAnalysis",
    "followUpShowInChat",
    "followUpShowInDashboard",
    "followUpAutoEnabled",
    "followUpRounds",
  ];
  const docs = await coll.find({ key: { $in: keys } }).toArray();
  const map = {};
  docs.forEach((doc) => {
    map[doc.key] = doc.value;
  });

  const config = {
    analysisEnabled:
      typeof map.enableFollowUpAnalysis === "boolean"
        ? map.enableFollowUpAnalysis
        : true,
    showInChat:
      typeof map.followUpShowInChat === "boolean"
        ? map.followUpShowInChat
        : true,
    showInDashboard:
      typeof map.followUpShowInDashboard === "boolean"
        ? map.followUpShowInDashboard
        : true,
    autoFollowUpEnabled:
      typeof map.followUpAutoEnabled === "boolean"
        ? map.followUpAutoEnabled
        : false,
    rounds: normalizeFollowUpRounds(map.followUpRounds || []),
  };

  followUpBaseConfigCache = config;
  followUpBaseCacheTimestamp = now;
  return config;
}

async function getFollowUpConfigForContext(platform = "line", botId = null) {
  const normalizedPlatform = platform || "line";
  const normalizedBotId = normalizeFollowUpBotId(botId);
  const cacheKey = `${normalizedPlatform}:${normalizedBotId || "default"}`;
  if (followUpContextCache.has(cacheKey)) {
    return followUpContextCache.get(cacheKey);
  }

  const baseConfig = await getFollowUpBaseConfig();
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("follow_up_page_settings");

  let query = { platform: normalizedPlatform };
  if (normalizedBotId === null) {
    query.botId = null;
  } else {
    query.botId = { $in: [null, normalizedBotId] };
  }

  const overrides = await coll.find(query).toArray();
  let platformDefaults = {};
  let specificOverrides = {};
  overrides.forEach((doc) => {
    if (!doc) return;
    const settings = doc.settings || {};
    if (doc.botId === null) {
      platformDefaults = { ...platformDefaults, ...settings };
    } else if (doc.botId === normalizedBotId) {
      specificOverrides = { ...specificOverrides, ...settings };
    }
  });

  const merged = {
    ...baseConfig,
    ...platformDefaults,
    ...specificOverrides,
  };

  merged.rounds = normalizeFollowUpRounds(
    (specificOverrides && specificOverrides.rounds) ||
      (platformDefaults && platformDefaults.rounds) ||
      (baseConfig && baseConfig.rounds) ||
      [],
  );

  if (typeof merged.autoFollowUpEnabled !== "boolean") {
    merged.autoFollowUpEnabled = baseConfig.autoFollowUpEnabled !== false;
  }

  followUpContextCache.set(cacheKey, merged);
  return merged;
}

async function listFollowUpPageSettings() {
  const baseConfig = await getFollowUpBaseConfig();
  const client = await connectDB();
  const db = client.db("chatbot");
  const lineBots = await db
    .collection("line_bots")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  const facebookBots = await db
    .collection("facebook_bots")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  const settingsDocs = await db
    .collection("follow_up_page_settings")
    .find({})
    .toArray();

  const settingsMap = {};
  settingsDocs.forEach((doc) => {
    if (!doc || !doc.platform) return;
    const key = `${doc.platform}:${doc.botId || "default"}`;
    settingsMap[key] = doc;
  });

  const buildConfig = (platform, botId = null) => {
    const normalizedBotId = normalizeFollowUpBotId(botId);
    const platformDefault =
      settingsMap[`${platform}:default`] || settingsMap[`${platform}:null`];
    const specific = normalizedBotId
      ? settingsMap[`${platform}:${normalizedBotId}`]
      : null;
    const config = {
      ...baseConfig,
      ...(platformDefault?.settings || {}),
      ...(specific?.settings || {}),
    };
    config.rounds = normalizeFollowUpRounds(
      specific?.settings?.rounds ||
        platformDefault?.settings?.rounds ||
        baseConfig?.rounds ||
        [],
    );
    if (typeof config.autoFollowUpEnabled !== "boolean") {
      config.autoFollowUpEnabled = baseConfig.autoFollowUpEnabled !== false;
    }
    return config;
  };

  const pages = [];

  lineBots.forEach((bot) => {
    const key = `line:${bot._id.toString()}`;
    const config = buildConfig("line", bot._id.toString());
    const doc = settingsMap[key];
    pages.push({
      id: key,
      platform: "line",
      botId: bot._id.toString(),
      type: "line_bot",
      name:
        bot.name ||
        bot.displayName ||
        bot.botName ||
        `LINE Bot (${bot._id.toString().slice(-4)})`,
      settings: config,
      hasOverride: !!doc,
      updatedAt: doc?.updatedAt || null,
      metadata: {
        status: bot.status || null,
        description: bot.description || "",
      },
    });
  });

  facebookBots.forEach((bot) => {
    const key = `facebook:${bot._id.toString()}`;
    const config = buildConfig("facebook", bot._id.toString());
    const doc = settingsMap[key];
    pages.push({
      id: key,
      platform: "facebook",
      botId: bot._id.toString(),
      type: "facebook_bot",
      name:
        bot.pageName ||
        bot.name ||
        `Facebook Page (${bot._id.toString().slice(-4)})`,
      settings: config,
      hasOverride: !!doc,
      updatedAt: doc?.updatedAt || null,
      metadata: {
        status: bot.status || null,
        pageId: bot.pageId || null,
      },
    });
  });

  return {
    baseConfig,
    pages,
  };
}

function buildFollowUpPreview(rawContent) {
  try {
    if (rawContent === null || typeof rawContent === "undefined") {
      return "";
    }
    const sanitized = sanitizeContentForFollowUp(rawContent);
    if (!sanitized) return "";
    return sanitized.length > 200 ? `${sanitized.slice(0, 197)}…` : sanitized;
  } catch (error) {
    try {
      const asString =
        typeof rawContent === "string"
          ? rawContent.trim()
          : JSON.stringify(rawContent);
      if (!asString) return "";
      return asString.length > 200 ? `${asString.slice(0, 197)}…` : asString;
    } catch {
      return "";
    }
  }
}

function emitFollowUpScheduleUpdate(payload) {
  try {
    if (io) {
      const sanitized = { ...(payload || {}) };
      Object.keys(sanitized).forEach((key) => {
        if (typeof sanitized[key] === "undefined") {
          delete sanitized[key];
        }
      });
      io.emit("followUpScheduleUpdated", sanitized);
    }
  } catch (_) {}
}

async function scheduleFollowUpForUser(userId, options = {}) {
  try {
    const {
      platform = "line",
      botId = null,
      messageTimestamp = new Date(),
      preview = "",
      configOverride = null,
    } = options || {};

    const normalizedPlatform = platform || "line";
    const normalizedBotId = normalizeFollowUpBotId(botId);
    const contextKey = `${normalizedPlatform}:${normalizedBotId || "default"}`;

    const config =
      configOverride ||
      (await getFollowUpConfigForContext(normalizedPlatform, normalizedBotId));
    if (!config) return null;
    if (config.autoFollowUpEnabled === false) return null;

    const roundsConfig = normalizeFollowUpRounds(config.rounds || []);
    if (roundsConfig.length === 0) return null;

    // ข้ามหากลูกค้าซื้อแล้ว
    const status = await getFollowUpStatus(userId);
    if (status?.hasFollowUp) {
      return null;
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_tasks");

    const dateKey = getDateKey(messageTimestamp);
    const existingTask = await coll.findOne(
      { userId, platform: normalizedPlatform, botId: normalizedBotId, dateKey },
      { sort: { createdAt: -1 } },
    );
    const now = new Date();
    const previewText =
      typeof preview === "string" ? preview : buildFollowUpPreview(preview);

    if (existingTask) {
      if (!existingTask.completed && !existingTask.canceled) {
        const nextScheduledAt = existingTask.nextScheduledAt
          ? new Date(existingTask.nextScheduledAt)
          : null;
        const sentRoundsCount = Array.isArray(existingTask.rounds)
          ? existingTask.rounds.reduce(
              (count, round) => (round?.status === "sent" ? count + 1 : count),
              0,
            )
          : Array.isArray(existingTask.sentRounds)
            ? existingTask.sentRounds.length
            : typeof existingTask.nextRoundIndex === "number"
              ? existingTask.nextRoundIndex
              : 0;
        const shouldCancel =
          nextScheduledAt &&
          messageTimestamp < nextScheduledAt &&
          sentRoundsCount > 1;

        if (shouldCancel) {
          await coll.updateOne(
            { _id: existingTask._id },
            {
              $set: {
                canceled: true,
                cancelReason: "user_replied",
                canceledAt: now,
                updatedAt: now,
                lastUserMessageAt: messageTimestamp,
                lastUserMessagePreview:
                  previewText || existingTask.lastUserMessagePreview || "",
                contextKey,
              },
            },
          );
          emitFollowUpScheduleUpdate({
            userId,
            platform: normalizedPlatform,
            botId: normalizedBotId,
            contextKey,
            status: "canceled",
            reason: "user_replied",
          });
        } else {
          await coll.updateOne(
            { _id: existingTask._id },
            {
              $set: {
                lastUserMessageAt: messageTimestamp,
                updatedAt: now,
                lastUserMessagePreview:
                  previewText || existingTask.lastUserMessagePreview || "",
                contextKey,
              },
            },
          );
        }
      }
      return null;
    }

    const baseMoment = getBangkokMoment(messageTimestamp);
    const rounds = roundsConfig.map((round, index) => {
      const scheduledMoment = baseMoment
        .clone()
        .add(round.delayMinutes, "minutes");
      const sanitizedImages = sanitizeFollowUpImages(round.images);

      // Debug log
      console.log(`[FollowUp Debug] Creating round ${index}:`, {
        hasImages: !!round.images,
        imageCount: Array.isArray(round.images) ? round.images.length : 0,
        sanitizedCount: sanitizedImages.length,
        sampleImage: sanitizedImages[0],
      });

      return {
        index,
        delayMinutes: round.delayMinutes,
        message: typeof round.message === "string" ? round.message : "",
        images: sanitizedImages,
        scheduledAt: scheduledMoment.toDate(),
        sentAt: null,
        status: "pending",
      };
    });

    if (rounds.length === 0) return null;

    const taskDoc = {
      userId,
      platform: normalizedPlatform,
      botId: normalizedBotId,
      dateKey,
      contextKey,
      rounds,
      lastUserMessageAt: messageTimestamp,
      lastUserMessagePreview: previewText,
      nextRoundIndex: 0,
      nextScheduledAt: rounds[0]?.scheduledAt || null,
      lastSentAt: null,
      sentRounds: [],
      canceled: false,
      completed: false,
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
      configSnapshot: {
        rounds: roundsConfig.map((item) => ({
          delayMinutes: item.delayMinutes,
          message: typeof item.message === "string" ? item.message : "",
          images: sanitizeFollowUpImages(item.images),
        })),
        autoFollowUpEnabled: config.autoFollowUpEnabled !== false,
      },
    };

    await coll.insertOne(taskDoc);
    emitFollowUpScheduleUpdate({
      userId,
      platform: normalizedPlatform,
      botId: normalizedBotId,
      contextKey,
      status: "scheduled",
      nextScheduledAt: taskDoc.nextScheduledAt,
    });
    return taskDoc;
  } catch (error) {
    console.error(
      "[FollowUp] ไม่สามารถตั้งเวลาส่งข้อความติดตามได้:",
      error.message,
    );
    return null;
  }
}

async function cancelFollowUpTasksForUser(
  userId,
  platform = null,
  botId = undefined,
  options = {},
) {
  try {
    const { reason = "manual", dateKey = null } = options || {};
    const normalizedPlatform = platform || null;
    const normalizedBotId =
      botId === undefined ? undefined : normalizeFollowUpBotId(botId);
    const contextKey =
      normalizedPlatform && normalizedBotId !== undefined
        ? `${normalizedPlatform}:${normalizedBotId || "default"}`
        : null;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_tasks");
    const now = new Date();
    const query = { userId };

    if (normalizedPlatform) {
      query.platform = normalizedPlatform;
    }
    if (normalizedBotId !== undefined) {
      query.botId = normalizedBotId;
    }
    if (dateKey) {
      query.dateKey = dateKey;
    }

    const result = await coll.updateMany(
      {
        ...query,
        canceled: { $ne: true },
        completed: { $ne: true },
      },
      {
        $set: {
          canceled: true,
          cancelReason: reason,
          canceledAt: now,
          updatedAt: now,
        },
      },
    );

    if (result.modifiedCount > 0) {
      emitFollowUpScheduleUpdate({
        userId,
        platform: normalizedPlatform || undefined,
        botId: normalizedBotId === undefined ? undefined : normalizedBotId,
        contextKey: contextKey || undefined,
        status: "canceled",
        reason,
      });
    }
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถยกเลิกงานติดตามได้:", error.message);
  }
}

async function ensureFollowUpIndexes() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_tasks");
    await coll.createIndex({ userId: 1, platform: 1, botId: 1, dateKey: 1 });
    await coll.createIndex({ nextScheduledAt: 1, canceled: 1, completed: 1 });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถสร้างดัชนีได้:", error.message);
  }
}

async function processDueFollowUpTasks(limit = 10) {
  if (followUpProcessing) return;
  followUpProcessing = true;
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_tasks");
    const now = new Date();
    const tasks = await coll
      .find({
        canceled: { $ne: true },
        completed: { $ne: true },
        nextScheduledAt: { $lte: now },
      })
      .sort({ nextScheduledAt: 1 })
      .limit(limit)
      .toArray();

    for (const task of tasks) {
      await handleFollowUpTask(task, db);
    }
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถประมวลผลงานติดตาม:", error.message);
  } finally {
    followUpProcessing = false;
  }
}

async function handleFollowUpTask(task, db) {
  const rounds = Array.isArray(task.rounds) ? task.rounds : [];
  const currentIndex =
    typeof task.nextRoundIndex === "number" ? task.nextRoundIndex : 0;
  const round = rounds[currentIndex];
  const coll = db.collection("follow_up_tasks");
  const now = new Date();
  const derivedContextKey =
    task.contextKey ||
    `${task.platform || "line"}:${normalizeFollowUpBotId(task.botId) || "default"}`;

  // Debug log
  console.log("[FollowUp Debug] Task rounds:", {
    taskId: task._id,
    totalRounds: rounds.length,
    currentIndex,
    hasRound: !!round,
    roundHasImages: !!round?.images,
    roundImagesCount: Array.isArray(round?.images) ? round.images.length : 0,
  });

  if (!round) {
    await coll.updateOne(
      { _id: task._id },
      {
        $set: {
          completed: true,
          nextScheduledAt: null,
          updatedAt: now,
        },
      },
    );
    emitFollowUpScheduleUpdate({
      userId: task.userId,
      platform: task.platform,
      botId: task.botId,
      contextKey: derivedContextKey,
      status: "completed",
    });
    return;
  }

  try {
    await sendFollowUpMessage(task, round, db);

    const nextIndex = currentIndex + 1;
    const hasMore = nextIndex < rounds.length;
    const updateSet = {
      [`rounds.${currentIndex}.sentAt`]: now,
      [`rounds.${currentIndex}.status`]: "sent",
      lastSentAt: now,
      updatedAt: now,
      nextRoundIndex: nextIndex,
      nextScheduledAt: hasMore ? rounds[nextIndex].scheduledAt : null,
      completed: !hasMore,
      contextKey: derivedContextKey,
    };

    await coll.updateOne(
      { _id: task._id },
      {
        $set: updateSet,
        $addToSet: { sentRounds: currentIndex },
      },
    );

    emitFollowUpScheduleUpdate({
      userId: task.userId,
      platform: task.platform,
      botId: task.botId,
      contextKey: derivedContextKey,
      status: updateSet.completed ? "completed" : "progress",
      currentRound: currentIndex,
      nextRound: hasMore ? nextIndex : null,
      nextScheduledAt: updateSet.nextScheduledAt,
    });
  } catch (error) {
    console.error("[FollowUp] ส่งข้อความติดตามไม่สำเร็จ:", error.message);
    await coll.updateOne(
      { _id: task._id },
      {
        $set: {
          [`rounds.${currentIndex}.status`]: "failed",
          [`rounds.${currentIndex}.error`]: error.message,
          canceled: true,
          cancelReason: "send_failed",
          canceledAt: now,
          updatedAt: now,
        },
      },
    );
    emitFollowUpScheduleUpdate({
      userId: task.userId,
      platform: task.platform,
      botId: task.botId,
      contextKey: derivedContextKey,
      status: "failed",
      reason: "send_failed",
    });
  }
}

async function sendFollowUpMessage(task, round, db) {
  const message =
    typeof round?.message === "string" ? round.message.trim() : "";
  let images = sanitizeFollowUpImages(round?.images || []);

  // ถ้า PUBLIC_BASE_URL ไม่ได้ตั้งค่า ให้เตือน
  if (!PUBLIC_BASE_URL) {
    console.warn(
      "[FollowUp Warning] PUBLIC_BASE_URL is not set. Images with relative URLs may fail.",
    );
  }

  // แปลง relative URLs เป็น absolute URLs ถ้า PUBLIC_BASE_URL มี
  if (PUBLIC_BASE_URL) {
    images = images.map((img) => {
      const fixed = { ...img };
      if (img.url && img.url.startsWith("/")) {
        fixed.url = PUBLIC_BASE_URL.replace(/\/$/, "") + img.url;
      }
      if (img.previewUrl && img.previewUrl.startsWith("/")) {
        fixed.previewUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + img.previewUrl;
      }
      if (img.thumbUrl && img.thumbUrl.startsWith("/")) {
        fixed.thumbUrl = PUBLIC_BASE_URL.replace(/\/$/, "") + img.thumbUrl;
      }
      return fixed;
    });
  }

  // Debug log
  console.log("[FollowUp Debug] Round data:", {
    hasRound: !!round,
    roundImages: round?.images,
    sanitizedImages: images,
    imageCount: images.length,
    hasPublicBaseUrl: !!PUBLIC_BASE_URL,
    sampleUrl: images[0]?.url,
  });

  if (!message && images.length === 0) {
    throw new Error("ไม่มีเนื้อหาสำหรับการติดตาม");
  }

  if (task.platform === "facebook") {
    console.log("[FollowUp Debug] Sending Facebook follow-up:", {
      userId: task.userId,
      hasMessage: !!message,
      imageCount: images.length,
      botId: task.botId,
    });

    if (!task.botId) {
      throw new Error("ไม่พบ Facebook Bot สำหรับการส่งข้อความ");
    }
    const query = ObjectId.isValid(task.botId)
      ? { _id: new ObjectId(task.botId) }
      : { _id: task.botId };
    const fbBot = await db.collection("facebook_bots").findOne(query);
    if (!fbBot || !fbBot.accessToken) {
      throw new Error("ไม่พบข้อมูล Facebook Bot");
    }
    const metadata = "follow_up_auto";

    // สร้างข้อความรวม text และรูปภาพ ในรูปแบบที่ sendFacebookMessage รองรับ
    let combinedMessage = message || "";

    // เพิ่ม [cut] เพื่อแยกข้อความถ้ามีทั้ง text และรูป
    if (message && images.length > 0) {
      combinedMessage += "[cut]";
    }

    const followUpAssets = [];
    const followUpLabels = [];
    // เพิ่ม #[IMAGE:...] token สำหรับแต่ละรูป
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const labelSource =
        typeof image.label === "string" && image.label.trim()
          ? image.label.trim()
          : image.fileName || image.alt || `รูปที่ ${i + 1}`;
      combinedMessage += `#[IMAGE:${labelSource}]`;
      if (i < images.length - 1) {
        combinedMessage += "[cut]";
      }
      followUpLabels.push(labelSource);
      followUpAssets.push({
        ...image,
        label: labelSource,
      });
    }

    console.log("[FollowUp Debug] Combined message:", {
      hasText: !!message,
      imageCount: images.length,
      messageLength: combinedMessage.length,
    });

    // สร้าง assetsMap จากรูปภาพที่มี
    const assetsMap = buildAssetsLookup(
      followUpAssets.map((asset) => ({
        ...asset,
        thumbUrl: asset.previewUrl || asset.thumbUrl || asset.url,
        fileName: asset.fileName || "",
      })),
    );

    console.log("[FollowUp Debug] Assets map:", {
      labels: followUpLabels,
      urls: followUpAssets.map((asset) => asset.url),
    });

    // ใช้ sendFacebookMessage ที่มี upload/url mode และ fallback
    await sendFacebookMessage(
      task.userId,
      combinedMessage,
      fbBot.accessToken,
      {
        metadata,
        selectedImageCollections: null, // ไม่ใช้ collections แต่ใช้ assetsMap ที่สร้างเอง
      },
      assetsMap,
    );

    console.log("[FollowUp Debug] Facebook follow-up sent successfully");
  } else {
    await sendLineFollowUpMessage(task.userId, message, task.botId, db, images);
  }

  const historyColl = db.collection("chat_history");
  const timestamp = new Date();
  const historyParts = [];
  if (message) {
    historyParts.push({ type: "text", text: message });
  }
  images.forEach((image) => {
    historyParts.push({
      type: "image",
      url: image.url,
      previewUrl: image.previewUrl || image.thumbUrl || image.url,
      alt: image.alt || "",
      caption: image.caption || "",
    });
  });

  let storedContent = "";
  if (historyParts.length === 1 && historyParts[0].type === "text") {
    storedContent = historyParts[0].text;
  } else if (historyParts.length > 0) {
    storedContent = JSON.stringify(historyParts);
  }

  const messageDoc = {
    senderId: task.userId,
    role: "assistant",
    content: storedContent,
    timestamp,
    platform: task.platform || "line",
    botId: task.botId || null,
    source: "follow_up",
  };
  const historyInsertResult = await historyColl.insertOne(messageDoc);
  if (historyInsertResult?.insertedId) {
    messageDoc._id = historyInsertResult.insertedId;
  }
  await appendOrderExtractionMessage(messageDoc);

  try {
    if (io) {
      io.emit("newMessage", {
        userId: task.userId,
        message: messageDoc,
        sender: "assistant",
        timestamp,
      });
    }
  } catch (_) {}
}

async function sendLineFollowUpMessage(
  userId,
  message,
  botId,
  db,
  images = [],
) {
  try {
    console.log("[FollowUp Debug] sendLineFollowUpMessage called:", {
      userId,
      hasMessage: !!message,
      imageCount: Array.isArray(images) ? images.length : 0,
      botId,
    });

    const payloads = [];
    const trimmed = typeof message === "string" ? message.trim() : "";
    if (trimmed) {
      payloads.push({ type: "text", text: trimmed });
    }
    const media = sanitizeFollowUpImages(images);
    console.log("[FollowUp Debug] Sanitized images:", {
      inputCount: Array.isArray(images) ? images.length : 0,
      outputCount: media.length,
      urls: media.map((img) => ({
        url: img.url,
        previewUrl: img.previewUrl,
      })),
    });

    media.forEach((image) => {
      payloads.push({
        type: "image",
        originalContentUrl: image.url,
        previewImageUrl: image.previewUrl || image.thumbUrl || image.url,
      });
    });

    if (!payloads.length) {
      throw new Error("ไม่มีเนื้อหาสำหรับการติดตาม");
    }

    console.log("[FollowUp Debug] Payloads to send:", {
      count: payloads.length,
      types: payloads.map((p) => p.type),
    });

    const chunks = [];
    for (let i = 0; i < payloads.length; i += 5) {
      chunks.push(payloads.slice(i, i + 5));
    }

    const sendChunks = async (client) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(
          `[FollowUp Debug] Sending chunk ${i + 1}/${chunks.length}:`,
          {
            itemCount: chunk.length,
            types: chunk.map((item) => item.type),
          },
        );
        await client.pushMessage(userId, chunk.length === 1 ? chunk[0] : chunk);
        console.log(`[FollowUp Debug] Chunk ${i + 1} sent successfully`);
      }
    };

    if (botId) {
      const query = ObjectId.isValid(botId)
        ? { _id: new ObjectId(botId) }
        : { _id: botId };
      const botDoc = await db.collection("line_bots").findOne(query);
      if (!botDoc || !botDoc.channelAccessToken || !botDoc.channelSecret) {
        throw new Error("ไม่พบข้อมูล Line Bot สำหรับการส่งข้อความ");
      }
      console.log("[FollowUp Debug] Using bot-specific LINE client");
      const client = createLineClient(
        botDoc.channelAccessToken,
        botDoc.channelSecret,
      );
      await sendChunks(client);
      console.log("[FollowUp Debug] All chunks sent successfully");
      return;
    }
    if (!lineClient) {
      throw new Error("Line Client ยังไม่ถูกตั้งค่า");
    }
    console.log("[FollowUp Debug] Using default LINE client");
    await sendChunks(lineClient);
    console.log("[FollowUp Debug] All chunks sent successfully");
  } catch (error) {
    console.error("[FollowUp Error] Failed to send LINE message:", {
      error: error.message,
      userId,
      botId,
    });
    throw new Error(error.message || "ไม่สามารถส่งข้อความผ่าน LINE ได้");
  }
}

function startFollowUpTaskWorker() {
  if (followUpTaskTimer) return;
  const runner = async () => {
    try {
      await processDueFollowUpTasks();
    } catch (error) {
      console.error("[FollowUp] งานประมวลผลติดตามล้มเหลว:", error.message);
    }
  };
  followUpTaskTimer = setInterval(runner, FOLLOW_UP_TASK_INTERVAL_MS);
  runner();
}

function sanitizeContentForFollowUp(rawContent) {
  if (rawContent === null || typeof rawContent === "undefined") {
    return "";
  }

  const asString =
    typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  const trimmed = asString.trim();
  if (!trimmed) return "";

  // พยายามแปลง JSON เป็นข้อความที่อ่านง่าย
  try {
    const parsed = JSON.parse(trimmed);

    if (Array.isArray(parsed)) {
      const parts = parsed
        .map((item) => {
          if (item && item.data) {
            if (item.data.type === "text" && item.data.text) {
              return String(item.data.text).trim();
            }
            if (item.data.type === "image") {
              const label = item.data.text
                ? String(item.data.text).trim()
                : "ลูกค้าส่งรูปภาพ";
              return `[รูปภาพ] ${label}`;
            }
            if (item.data.type === "audio") {
              const label = item.data.text
                ? String(item.data.text).trim()
                : "ลูกค้าส่งไฟล์เสียง";
              return `[เสียง] ${label}`;
            }
          }
          if (typeof item === "string") return item.trim();
          return "";
        })
        .filter(Boolean);
      if (parts.length > 0) {
        return parts.join(" ").trim();
      }
    } else if (parsed && typeof parsed === "object") {
      if (parsed.type === "text" && parsed.text) {
        return String(parsed.text).trim();
      }
      if (parsed.type === "image") {
        const label = parsed.text
          ? String(parsed.text).trim()
          : "ลูกค้าส่งรูปภาพ";
        return `[รูปภาพ] ${label}`;
      }
      if (parsed.type === "audio") {
        const label = parsed.description
          ? String(parsed.description).trim()
          : "ลูกค้าส่งไฟล์เสียง";
        return `[เสียง] ${label}`;
      }
    }
  } catch (_) {
    // ถ้าไม่สามารถ parse ได้ให้ใช้ข้อความเดิม
  }

  // จำกัดความยาวเพื่อไม่ให้ prompt ยาวเกินไป
  if (trimmed.length > 800) {
    return `${trimmed.slice(0, 790)}…`;
  }
  return trimmed;
}

async function getFollowUpStatus(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("follow_up_status");
  return coll.findOne({ senderId: userId });
}

async function updateFollowUpStatus(userId, fields) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("follow_up_status");
  const now = new Date();
  const sanitizedFields = { ...(fields || {}) };
  const normalizedPlatform = sanitizedFields.platform || null;
  const normalizedBotId = normalizeFollowUpBotId(sanitizedFields.botId);

  sanitizedFields.platform = normalizedPlatform;
  sanitizedFields.botId = normalizedBotId;

  const updateDoc = {
    $set: {
      senderId: userId,
      lastAnalyzedAt: now,
      ...sanitizedFields,
    },
  };
  await coll.updateOne({ senderId: userId }, updateDoc, { upsert: true });
}

async function maybeAnalyzeFollowUp(
  userId,
  platform = "line",
  botId = null,
  options = {},
) {
  try {
    const normalizedPlatform = platform || "line";
    const normalizedBotId = normalizeFollowUpBotId(botId);
    const config = await getFollowUpConfigForContext(
      normalizedPlatform,
      normalizedBotId,
    );
    const {
      reasonOverride,
      followUpUpdatedAt: providedTimestamp,
      forceUpdate = false,
    } = options || {};

    if (!config || (!forceUpdate && !config.analysisEnabled)) {
      return;
    }

    const status = await getFollowUpStatus(userId);
    const payloadBase = {
      platform: normalizedPlatform,
      botId: normalizedBotId,
    };

    const existingOrders = await getUserOrders(userId);
    const latestOrder =
      existingOrders && existingOrders.length > 0 ? existingOrders[0] : null;
    const hasOrders = !!latestOrder;

    if (!hasOrders) {
      const previousUpdatedAt = status?.followUpUpdatedAt || null;
      await updateFollowUpStatus(userId, {
        hasFollowUp: false,
        followUpReason: "",
        followUpUpdatedAt: previousUpdatedAt,
        ...payloadBase,
      });
      return;
    }

    const reasonCandidates = [
      typeof reasonOverride === "string" ? reasonOverride.trim() : "",
      typeof latestOrder.notes === "string" ? latestOrder.notes.trim() : "",
    ].filter(Boolean);

    const reason =
      reasonCandidates.length > 0 ? reasonCandidates[0] : "ลูกค้ามีออเดอร์แล้ว";

    const followUpUpdatedAt = (() => {
      if (providedTimestamp) {
        return new Date(providedTimestamp);
      }
      if (latestOrder.extractedAt) {
        return new Date(latestOrder.extractedAt);
      }
      return new Date();
    })();

    await updateFollowUpStatus(userId, {
      hasFollowUp: true,
      followUpReason: reason,
      followUpUpdatedAt,
      ...payloadBase,
    });

    await cancelFollowUpTasksForUser(
      userId,
      normalizedPlatform,
      normalizedBotId,
      { reason: "order_detected" },
    );

    try {
      if (io) {
        io.emit("followUpTagged", {
          userId,
          hasFollowUp: true,
          followUpReason: reason,
          followUpUpdatedAt,
          platform: normalizedPlatform,
          botId: normalizedBotId,
        });
      }
    } catch (_) {}
  } catch (error) {
    console.error("[FollowUp] วิเคราะห์ไม่สำเร็จ:", error.message);
  }
}

// ============================ Order Analysis Functions ============================

function normalizeShippingCostValue(rawCost) {
  if (typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost >= 0) {
    return rawCost;
  }
  if (typeof rawCost === "string") {
    const parsed = parseFloat(
      rawCost.replace(/[^\d.,-]/g, "").replace(/,/g, ""),
    );
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function normalizeCustomerName(rawName) {
  if (typeof rawName !== "string") {
    return null;
  }
  const trimmed = rawName.trim();
  return trimmed.length ? trimmed : null;
}

// ============================ Order Buffer & Cutoff Helpers ============================

const ORDER_BUFFER_COLLECTION = "order_extraction_buffers";
const ORDER_CUTOFF_SETTINGS_COLLECTION = "order_cutoff_settings";
const ORDER_DEFAULT_CUTOFF_TIME = "23:59";
const ORDER_CUTOFF_TIMEZONE = BANGKOK_TZ || "Asia/Bangkok";
const ORDER_CUTOFF_INTERVAL_MS = 60 * 1000;

let orderCutoffTimer = null;
let orderCutoffProcessing = false;

function normalizeOrderPlatform(platform) {
  if (typeof platform !== "string") return "line";
  const normalized = platform.toLowerCase();
  if (["facebook", "line"].includes(normalized)) {
    return normalized;
  }
  return "line";
}

function normalizeOrderBotId(botId) {
  if (!botId) return null;
  if (typeof botId === "string") {
    const trimmed = botId.trim();
    return trimmed.length ? trimmed : null;
  }
  try {
    const str = botId.toString();
    return str.length ? str : null;
  } catch {
    return null;
  }
}

function buildOrderPageKey(platform, botId = null) {
  const normalizedPlatform = normalizeOrderPlatform(platform);
  const normalizedBotId = normalizeOrderBotId(botId);
  return normalizedBotId
    ? `${normalizedPlatform}:${normalizedBotId}`
    : `${normalizedPlatform}:default`;
}

function parseOrderPageKey(pageKey) {
  if (typeof pageKey !== "string" || !pageKey.includes(":")) {
    return { platform: null, botId: null };
  }
  const [platformPart, ...rest] = pageKey.split(":");
  const botIdPart = rest.join(":");
  const platform = normalizeOrderPlatform(platformPart);
  const botId =
    botIdPart && botIdPart !== "default"
      ? normalizeOrderBotId(botIdPart)
      : null;
  return { platform, botId };
}

function parseCutoffTime(cutoffTime) {
  const fallback = ORDER_DEFAULT_CUTOFF_TIME;
  if (typeof cutoffTime !== "string") return fallback;
  const match = cutoffTime.trim().match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  const hours = match[1].padStart(2, "0");
  const minutes = match[2].padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getCutoffMomentForDay(cutoffTime, baseMoment = null) {
  const safeCutoff = parseCutoffTime(cutoffTime);
  const [hoursStr, minutesStr] = safeCutoff.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  const momentBase = baseMoment ? baseMoment.clone() : getBangkokMoment();
  return momentBase
    .clone()
    .hours(hours)
    .minutes(minutes)
    .seconds(0)
    .milliseconds(0);
}

async function appendOrderExtractionMessage(chatDoc) {
  try {
    if (!chatDoc || typeof chatDoc !== "object") return;
    const senderId = chatDoc.senderId || chatDoc.userId || null;
    if (!senderId) return;
    const role = chatDoc.role || "user";
    if (!["user", "assistant"].includes(role)) {
      return;
    }

    const platform = normalizeOrderPlatform(chatDoc.platform);
    const botId = normalizeOrderBotId(chatDoc.botId);
    const pageKey = buildOrderPageKey(platform, botId);
    const timestamp =
      chatDoc.timestamp instanceof Date
        ? chatDoc.timestamp
        : new Date(chatDoc.timestamp || Date.now());
    const chatMessageId =
      chatDoc._id && typeof chatDoc._id.toString === "function"
        ? chatDoc._id.toString()
        : chatDoc._id || null;

    const bufferDoc = {
      pageKey,
      platform,
      botId,
      userId: senderId,
      role,
      direction: role === "user" ? "inbound" : "outbound",
      source: chatDoc.source || null,
      content: chatDoc.content ?? null,
      timestamp,
      chatMessageId,
      lastMessageAt: timestamp,
      createdAt: new Date(),
    };

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection(ORDER_BUFFER_COLLECTION);
    await coll.insertOne(bufferDoc);
  } catch (error) {
    console.error(
      "[OrderBuffer] เพิ่มข้อความลงบัฟเฟอร์ไม่สำเร็จ:",
      error.message,
    );
  }
}

async function ensureOrderBufferIndexes() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const bufferColl = db.collection(ORDER_BUFFER_COLLECTION);
    const cutoffColl = db.collection(ORDER_CUTOFF_SETTINGS_COLLECTION);

    await bufferColl.createIndex({ pageKey: 1, userId: 1, timestamp: 1 });
    await bufferColl.createIndex({ pageKey: 1, timestamp: 1 });
    await bufferColl.createIndex({ chatMessageId: 1 }, { sparse: true });

    await cutoffColl.createIndex({ pageKey: 1 }, { unique: true });
  } catch (error) {
    console.error("[OrderCutoff] ไม่สามารถสร้างดัชนีได้:", error.message);
  }
}

async function ensureOrderCutoffSetting(platform, botId = null) {
  const normalizedPlatform = normalizeOrderPlatform(platform);
  const normalizedBotId = normalizeOrderBotId(botId);
  const pageKey = buildOrderPageKey(normalizedPlatform, normalizedBotId);

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection(ORDER_CUTOFF_SETTINGS_COLLECTION);

  const existing = await coll.findOne({ pageKey });
  if (existing) {
    return existing;
  }

  const now = new Date();
  const doc = {
    pageKey,
    platform: normalizedPlatform,
    botId: normalizedBotId,
    cutoffTime: ORDER_DEFAULT_CUTOFF_TIME,
    timezone: ORDER_CUTOFF_TIMEZONE,
    lastProcessedAt: null,
    lastCutoffDateKey: null,
    lastRunSummary: null,
    createdAt: now,
    updatedAt: now,
  };

  await coll.insertOne(doc);
  return doc;
}

async function getOrderCutoffSetting(platform, botId = null) {
  const normalizedPlatform = normalizeOrderPlatform(platform);
  const normalizedBotId = normalizeOrderBotId(botId);
  const pageKey = buildOrderPageKey(normalizedPlatform, normalizedBotId);

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection(ORDER_CUTOFF_SETTINGS_COLLECTION);
  const existing = await coll.findOne({ pageKey });
  if (existing) return existing;
  return ensureOrderCutoffSetting(normalizedPlatform, normalizedBotId);
}

async function updateOrderCutoffSetting(platform, botId, updates = {}) {
  const normalizedPlatform = normalizeOrderPlatform(platform);
  const normalizedBotId = normalizeOrderBotId(botId);
  const pageKey = buildOrderPageKey(normalizedPlatform, normalizedBotId);
  const safeUpdates = { ...updates, updatedAt: new Date() };

  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection(ORDER_CUTOFF_SETTINGS_COLLECTION);
  await coll.updateOne({ pageKey }, { $set: safeUpdates }, { upsert: true });
  return coll.findOne({ pageKey });
}

async function listOrderCutoffPages() {
  const client = await connectDB();
  const db = client.db("chatbot");

  const [lineBots, facebookBots, settingsDocs] = await Promise.all([
    db
      .collection("line_bots")
      .find({})
      .project({ _id: 1, name: 1, displayName: 1, botName: 1 })
      .toArray(),
    db
      .collection("facebook_bots")
      .find({})
      .project({ _id: 1, name: 1, pageName: 1 })
      .toArray(),
    db.collection(ORDER_CUTOFF_SETTINGS_COLLECTION).find({}).toArray(),
  ]);

  const settingsMap = new Map();
  settingsDocs.forEach((doc) => {
    if (doc && doc.pageKey) {
      settingsMap.set(doc.pageKey, doc);
    }
  });

  const pages = [];

  lineBots.forEach((bot) => {
    const botId =
      bot?._id && typeof bot._id.toString === "function"
        ? bot._id.toString()
        : bot._id || null;
    const pageKey = buildOrderPageKey("line", botId);
    const settings = settingsMap.get(pageKey) || {
      cutoffTime: ORDER_DEFAULT_CUTOFF_TIME,
      lastProcessedAt: null,
      lastCutoffDateKey: null,
      lastRunSummary: null,
    };
    pages.push({
      pageKey,
      platform: "line",
      botId,
      name:
        bot?.name ||
        bot?.displayName ||
        bot?.botName ||
        `LINE Bot (${botId?.slice(-4) || "N/A"})`,
      cutoffTime: settings.cutoffTime || ORDER_DEFAULT_CUTOFF_TIME,
      lastProcessedAt: settings.lastProcessedAt || null,
      lastCutoffDateKey: settings.lastCutoffDateKey || null,
      lastRunSummary: settings.lastRunSummary || null,
    });
  });

  facebookBots.forEach((bot) => {
    const botId =
      bot?._id && typeof bot._id.toString === "function"
        ? bot._id.toString()
        : bot._id || null;
    const pageKey = buildOrderPageKey("facebook", botId);
    const settings = settingsMap.get(pageKey) || {
      cutoffTime: ORDER_DEFAULT_CUTOFF_TIME,
      lastProcessedAt: null,
      lastCutoffDateKey: null,
      lastRunSummary: null,
    };
    pages.push({
      pageKey,
      platform: "facebook",
      botId,
      name:
        bot?.pageName ||
        bot?.name ||
        `Facebook Page (${botId?.slice(-4) || "N/A"})`,
      cutoffTime: settings.cutoffTime || ORDER_DEFAULT_CUTOFF_TIME,
      lastProcessedAt: settings.lastProcessedAt || null,
      lastCutoffDateKey: settings.lastCutoffDateKey || null,
      lastRunSummary: settings.lastRunSummary || null,
    });
  });

  // Ensure settings existสำหรับเพจใหม่เท่านั้น
  const missingSettings = pages.filter(
    (page) => !settingsMap.has(page.pageKey),
  );
  if (missingSettings.length) {
    await Promise.all(
      missingSettings.map((page) =>
        ensureOrderCutoffSetting(page.platform, page.botId),
      ),
    );
  }

  return pages;
}

async function orderBufferMessagesForUser(pageKey, userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection(ORDER_BUFFER_COLLECTION);
  return coll.find({ pageKey, userId }).sort({ timestamp: 1 }).toArray();
}

async function clearOrderBufferForUser(pageKey, userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection(ORDER_BUFFER_COLLECTION);
  await coll.deleteMany({ pageKey, userId });
}

async function listOrderBufferUsersWithActivity(pageKey, since) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection(ORDER_BUFFER_COLLECTION);

  const match = { pageKey };
  if (since instanceof Date) {
    match.timestamp = { $gt: since };
  }

  const results = await coll
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: "$userId",
          lastMessageAt: { $max: "$timestamp" },
        },
      },
      { $sort: { lastMessageAt: 1 } },
    ])
    .toArray();

  return results.map((entry) => ({
    userId: entry._id,
    lastMessageAt: entry.lastMessageAt,
  }));
}

function findDuplicateOrder(existingOrders, newOrderData) {
  if (!Array.isArray(existingOrders) || !newOrderData) {
    return null;
  }

  const newItems = Array.isArray(newOrderData.items) ? newOrderData.items : [];
  if (!newItems.length) {
    return null;
  }

  return (
    existingOrders.find((order) => {
      const existingItems = Array.isArray(order.orderData?.items)
        ? order.orderData.items
        : [];
      if (existingItems.length !== newItems.length) return false;

      return existingItems.every((existingItem, index) => {
        const newItem = newItems[index];
        if (!newItem) return false;
        return (
          existingItem.product === newItem.product &&
          Number(existingItem.quantity) === Number(newItem.quantity) &&
          Number(existingItem.price) === Number(newItem.price)
        );
      });
    }) || null
  );
}

async function markMessagesAsOrderExtracted(
  userId,
  messageIds,
  extractionRoundId,
  orderId = null,
) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return;
  }

  const objectIds = messageIds
    .map((id) => {
      if (!id) return null;
      try {
        return new ObjectId(id);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);

  if (!objectIds.length) {
    return;
  }

  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");

    const updateDoc = {
      orderExtractionRoundId: extractionRoundId,
      orderExtractionMarkedAt: new Date(),
    };

    if (orderId) {
      try {
        updateDoc.orderId =
          typeof orderId === "string" ? new ObjectId(orderId) : orderId;
      } catch (error) {
        updateDoc.orderId = orderId;
      }
    }

    await coll.updateMany(
      {
        _id: { $in: objectIds },
        senderId: userId,
      },
      { $set: updateDoc },
    );
  } catch (error) {
    console.error(
      "[Order] ไม่สามารถมาร์กข้อความที่สกัดแล้วได้:",
      error.message,
    );
  }
}

function buildOrderQuery(params = {}) {
  const query = {};
  const pageKeyParam = params.pageKey;
  let platformFilter = params.platform;
  let botIdFilter = params.botId;

  if (pageKeyParam && pageKeyParam !== "all") {
    const parsed = parseOrderPageKey(pageKeyParam);
    if (parsed.platform) {
      platformFilter = parsed.platform;
    }
    if (parsed.botId || parsed.botId === null) {
      botIdFilter = parsed.botId === null ? "default" : parsed.botId;
    }
  }

  if (platformFilter && platformFilter !== "all") {
    query.platform = normalizeOrderPlatform(platformFilter);
  }

  if (
    typeof botIdFilter === "string" &&
    botIdFilter.length > 0 &&
    botIdFilter !== "all"
  ) {
    if (botIdFilter === "default") {
      const defaultConditions = [
        { botId: null },
        { botId: { $exists: false } },
        { botId: "" },
      ];
      if (!query.$or) {
        query.$or = defaultConditions;
      } else {
        query.$or.push(...defaultConditions);
      }
    } else {
      query.botId = normalizeOrderBotId(botIdFilter);
    }
  }

  const status = params.status;
  if (status && status !== "all") {
    query.status = status;
  }

  const timezone = "Asia/Bangkok";
  let startMoment = null;
  let endMoment = null;

  if (params.todayOnly === "true") {
    startMoment = moment().tz(timezone).startOf("day");
    endMoment = moment().tz(timezone).endOf("day");
  } else {
    if (params.startDate) {
      const parsedStart = moment.tz(params.startDate, timezone);
      if (parsedStart.isValid()) {
        startMoment = parsedStart.startOf("day");
      }
    }
    if (params.endDate) {
      const parsedEnd = moment.tz(params.endDate, timezone);
      if (parsedEnd.isValid()) {
        endMoment = parsedEnd.endOf("day");
      }
    }
  }

  if (startMoment || endMoment) {
    query.extractedAt = {};
    if (startMoment) query.extractedAt.$gte = startMoment.toDate();
    if (endMoment) query.extractedAt.$lte = endMoment.toDate();
  }

  return { query, dateRange: { start: startMoment, end: endMoment } };
}

async function analyzeOrderFromChat(userId, messages, options = {}) {
  if (!OPENAI_API_KEY) {
    console.warn("[Order] ไม่มี OPENAI_API_KEY ข้ามการวิเคราะห์ออเดอร์");
    return null;
  }

  const {
    modelOverride = null,
    previousAddress = null,
    previousCustomerName = null,
  } = options || {};

  const orderModel =
    modelOverride || (await getSettingValue("orderModel", "gpt-4.1-mini"));
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // จัดรูปแบบการสนทนาให้อ่านง่าย เรียงจากเก่าไปใหม่
  const formattedConversation = messages
    .map((entry, index) => {
      const speaker = entry.role === "user" ? "ลูกค้า" : "เรา";
      const seq = index + 1;
      return `${seq}. ${speaker}: ${entry.content}`;
    })
    .join("\n");

  const systemPrompt = `วิเคราะห์บทสนทนาเพื่อสกัดข้อมูลออเดอร์ โดยให้ความสำคัญกับการสรุปยอดล่าสุดที่สุดในบทสนทนา (ถ้ามีหลายรอบให้ใช้ข้อมูลจากรอบล่าสุดเท่านั้น)

เกณฑ์การพิจารณา:
✅ ถือว่ามีออเดอร์ = ลูกค้าสั่งซื้อสินค้าชัดเจน พร้อมระบุรายละเอียด
❌ ไม่ถือว่ามีออเดอร์ = ถามราคา, ต่อรอง, ลังเล, พิจารณาอยู่

ข้อมูลที่ต้องสกัด:
- items: รายการสินค้า [{product: "ชื่อสินค้า", quantity: จำนวน, price: ราคาต่อชิ้น}]
- totalAmount: ยอดรวมทั้งหมด (ถ้าไม่ระบุให้คำนวณจาก items)
- shippingAddress: ที่อยู่จัดส่ง (จำเป็นต้องมี ถ้าไม่มีให้สรุปว่าไม่มีออเดอร์)
- phone: เบอร์โทรศัพท์ (ถ้าไม่ระบุให้เป็น null)
- paymentMethod: วิธีชำระเงิน ("โอนเงิน", "เก็บเงินปลายทาง", หรือ null)
- shippingCost: ค่าส่ง (ตัวเลข; หากไม่ระบุให้ใช้ 0 และถือว่าส่งฟรี)
- หากได้รับข้อมูลที่อยู่หรือชื่อลูกค้าจากออเดอร์ก่อนหน้า ให้ใช้เป็นค่าเริ่มต้นเมื่อไม่มีข้อมูลใหม่

ตอบเป็น JSON เท่านั้น: {
  "hasOrder": true/false,
  "orderData": {
    "items": [...],
    "totalAmount": จำนวน,
    "shippingAddress": "ที่อยู่หรือ null",
    "phone": "เบอร์โทรหรือ null",
    "paymentMethod": "วิธีชำระหรือ null",
    "shippingCost": จำนวน
  },
  "confidence": 0.0-1.0,
  "reason": "เหตุผลสั้นๆ (หากไม่มีที่อยู่ให้สรุปว่าไม่มีออเดอร์)"
}`;

  const previousContextLines = [];
  if (previousCustomerName) {
    previousContextLines.push(`- ชื่อลูกค้ารอบก่อน: ${previousCustomerName}`);
  }
  if (previousAddress) {
    previousContextLines.push(`- ที่อยู่รอบก่อน: ${previousAddress}`);
  }
  const previousContextText = previousContextLines.length
    ? `ข้อมูลจากออเดอร์ก่อนหน้า:\n${previousContextLines.join("\n")}\nหากลูกค้าไม่ได้ระบุชื่อหรือที่อยู่ใหม่ให้ใช้ข้อมูลก่อนหน้าเป็นค่าเริ่มต้น\n\n`
    : "";

  const userPrompt = `${previousContextText}บทสนทนาทั้งหมด (จากเก่าสุดถึงใหม่สุด):\n\n${formattedConversation}\n\nวิเคราะห์และสกัดข้อมูลออเดอร์:`;

  try {
    const response = await openai.chat.completions.create({
      model: orderModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1, // ลดความสุ่มเพื่อความแม่นยำ
    });

    const content = response.choices?.[0]?.message?.content || "";
    const trimmed = content.trim();
    let parsed = null;

    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      // พยายามดึง JSON จากข้อความที่มีคำอื่นปะปน
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed || typeof parsed.hasOrder === "undefined") {
      console.warn("[Order] รูปแบบคำตอบไม่ถูกต้อง:", trimmed);
      return null;
    }

    // ตรวจสอบความถูกต้องของข้อมูล
    if (parsed.hasOrder && parsed.orderData) {
      const {
        items,
        totalAmount,
        shippingAddress,
        phone,
        paymentMethod,
        shippingCost,
        customerName,
      } = parsed.orderData;

      // ตรวจสอบ items
      if (!Array.isArray(items) || items.length === 0) {
        console.warn("[Order] ไม่มีรายการสินค้า");
        return {
          hasOrder: false,
          orderData: null,
          confidence: 0,
          reason: "ไม่มีรายการสินค้า",
        };
      }

      // ตรวจสอบข้อมูลในแต่ละ item และทำความสะอาดข้อมูล
      const sanitizedItems = [];
      for (const item of items) {
        const productName =
          typeof item.product === "string" ? item.product.trim() : "";
        const quantityNumber = Number(item.quantity);
        const priceNumber = Number(item.price);

        if (!productName) {
          console.warn("[Order] ชื่อสินค้าว่าง:", item);
          return {
            hasOrder: false,
            orderData: null,
            confidence: 0,
            reason: "ข้อมูลสินค้าไม่ครบถ้วน",
          };
        }

        if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
          console.warn("[Order] จำนวนสินค้าไม่ถูกต้อง:", item);
          return {
            hasOrder: false,
            orderData: null,
            confidence: 0,
            reason: "ข้อมูลสินค้าไม่ครบถ้วน",
          };
        }

        if (!Number.isFinite(priceNumber) || priceNumber < 0) {
          console.warn("[Order] ราคาสินค้าไม่ถูกต้อง:", item);
          return {
            hasOrder: false,
            orderData: null,
            confidence: 0,
            reason: "ข้อมูลสินค้าไม่ครบถ้วน",
          };
        }

        sanitizedItems.push({
          product: productName,
          quantity: quantityNumber,
          price: priceNumber,
        });
      }

      // ต้องมีที่อยู่จัดส่ง
      if (
        !shippingAddress ||
        typeof shippingAddress !== "string" ||
        !shippingAddress.trim()
      ) {
        console.warn("[Order] ไม่มีที่อยู่จัดส่ง");
        return {
          hasOrder: false,
          orderData: null,
          confidence: 0,
          reason: "ไม่มีที่อยู่จัดส่ง",
        };
      }

      // คำนวณยอดรวมถ้าไม่ระบุ
      let calculatedTotal = totalAmount;
      if (!calculatedTotal || calculatedTotal <= 0) {
        calculatedTotal = sanitizedItems.reduce(
          (sum, item) => sum + item.quantity * item.price,
          0,
        );
      }

      const normalizedShippingCost = normalizeShippingCostValue(shippingCost);
      const normalizedCustomerName = normalizeCustomerName(customerName);

      return {
        hasOrder: true,
        orderData: {
          items: sanitizedItems,
          totalAmount: calculatedTotal,
          shippingAddress: shippingAddress.trim(),
          phone: phone || null,
          paymentMethod: paymentMethod || "เก็บเงินปลายทาง",
          shippingCost: normalizedShippingCost,
          customerName: normalizedCustomerName,
        },
        confidence: parsed.confidence || 0.8,
        reason: parsed.reason || "พบออเดอร์ในบทสนทนา",
      };
    }

    return {
      hasOrder: false,
      orderData: null,
      confidence: parsed.confidence || 0.1,
      reason: parsed.reason || "ไม่พบออเดอร์ในบทสนทนา",
    };
  } catch (error) {
    console.error("[Order] เกิดข้อผิดพลาดในการเรียก OpenAI:", error.message);
    return null;
  }
}

async function saveOrderToDatabase(
  userId,
  platform,
  botId,
  orderData,
  extractedFrom = null,
  isManualExtraction = false,
) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const normalizedOrderData = {
      ...(orderData || {}),
      shippingCost: normalizeShippingCostValue(orderData?.shippingCost),
      customerName: normalizeCustomerName(orderData?.customerName),
    };

    const orderDoc = {
      userId,
      platform: platform || "line",
      botId: botId || null,
      orderData: normalizedOrderData,
      status: "pending",
      extractedAt: new Date(),
      extractedFrom,
      isManualExtraction,
      updatedAt: new Date(),
      notes: "",
    };

    const result = await coll.insertOne(orderDoc);
    console.log(`[Order] บันทึกออเดอร์สำเร็จ: ${result.insertedId}`);

    return result.insertedId;
  } catch (error) {
    console.error("[Order] บันทึกออเดอร์ไม่สำเร็จ:", error.message);
    return null;
  }
}

async function getUserOrders(userId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const orders = await coll
      .find({ userId })
      .sort({ extractedAt: -1 })
      .toArray();

    return orders;
  } catch (error) {
    console.error("[Order] ดึงออเดอร์ไม่สำเร็จ:", error.message);
    return [];
  }
}

async function maybeAnalyzeOrder(userId, platform = "line", botId = null) {
  try {
    const orderCutoffSchedulingEnabled = await getSettingValue(
      "orderCutoffSchedulingEnabled",
      true,
    );
    if (orderCutoffSchedulingEnabled) {
      return;
    }

    // ตรวจสอบว่ามีการตั้งค่าให้วิเคราะห์ออเดอร์อัตโนมัติหรือไม่
    const orderAnalysisEnabled = await getSettingValue(
      "orderAnalysisEnabled",
      true,
    );
    if (!orderAnalysisEnabled) {
      return;
    }

    const messages = await getNormalizedChatHistory(userId, {
      applyFilter: true,
    });
    if (!messages || messages.length === 0) return;

    const unprocessedMessages = messages.filter(
      (msg) => !msg.orderExtractionRoundId,
    );
    if (!unprocessedMessages.length) {
      return;
    }

    const targetMessages = unprocessedMessages.slice(-20);
    const messageIds = targetMessages
      .map((msg) => msg.messageId)
      .filter(Boolean);
    if (!messageIds.length) {
      return;
    }

    const existingOrders = await getUserOrders(userId);
    const latestOrder = existingOrders?.[0];

    const analysis = await analyzeOrderFromChat(userId, targetMessages, {
      previousAddress: latestOrder?.orderData?.shippingAddress || null,
      previousCustomerName: latestOrder?.orderData?.customerName || null,
    });

    if (!analysis || !analysis.hasOrder) {
      return;
    }

    const duplicateOrder = findDuplicateOrder(
      existingOrders,
      analysis.orderData,
    );

    if (duplicateOrder) {
      console.log(`[Order] พบออเดอร์ซ้ำสำหรับผู้ใช้ ${userId}`);
      const extractionRoundId = new ObjectId().toString();
      await markMessagesAsOrderExtracted(
        userId,
        messageIds,
        extractionRoundId,
        duplicateOrder?._id?.toString?.() || null,
      );
      await maybeAnalyzeFollowUp(userId, platform, botId, {
        reasonOverride: analysis.reason,
        forceUpdate: true,
      });
      return;
    }

    // บันทึกออเดอร์ใหม่
    const orderId = await saveOrderToDatabase(
      userId,
      platform,
      botId,
      analysis.orderData,
      "auto_extraction",
      false,
    );

    if (!orderId) {
      console.error(`[Order] ไม่สามารถบันทึกออเดอร์สำหรับผู้ใช้ ${userId}`);
      return;
    }

    const extractionRoundId = new ObjectId().toString();
    await markMessagesAsOrderExtracted(
      userId,
      messageIds,
      extractionRoundId,
      orderId?.toString?.() || orderId,
    );

    await maybeAnalyzeFollowUp(userId, platform, botId, {
      reasonOverride: analysis.reason,
      followUpUpdatedAt: new Date(),
      forceUpdate: true,
    });

    // Emit socket event
    try {
      if (io) {
        io.emit("orderExtracted", {
          userId,
          orderId,
          orderData: analysis.orderData,
          isManualExtraction: false,
          extractedAt: new Date(),
          confidence: analysis.confidence,
          reason: analysis.reason,
        });
      }
    } catch (_) {}

    console.log(
      `[Order] สกัดออเดอร์อัตโนมัติสำเร็จสำหรับผู้ใช้ ${userId}: ${orderId}`,
    );
  } catch (error) {
    console.error("[Order] วิเคราะห์ออเดอร์อัตโนมัติไม่สำเร็จ:", error.message);
  }
}

async function processOrderCutoffForPage(pageConfig, options = {}) {
  const nowMoment = options.nowMoment || getBangkokMoment();
  const pageKey = pageConfig.pageKey;
  const platform = pageConfig.platform;
  const botId = pageConfig.botId || null;

  const setting = await getOrderCutoffSetting(platform, botId);
  const lastProcessedAt =
    setting.lastProcessedAt instanceof Date
      ? setting.lastProcessedAt
      : setting.lastProcessedAt
        ? new Date(setting.lastProcessedAt)
        : null;

  const users = await listOrderBufferUsersWithActivity(
    pageKey,
    lastProcessedAt || null,
  );

  if (!users.length) {
    await updateOrderCutoffSetting(platform, botId, {
      lastProcessedAt: nowMoment.toDate(),
      lastCutoffDateKey: nowMoment.format("YYYY-MM-DD"),
      lastRunSummary: {
        processedUsers: 0,
        createdOrders: 0,
        duplicates: 0,
        noOrder: 0,
        timestamp: nowMoment.toDate(),
      },
    });
    return;
  }

  let createdOrders = 0;
  let duplicateCount = 0;
  let noOrderCount = 0;

  for (const entry of users) {
    const userId = entry.userId;
    if (!userId) continue;

    try {
      const messageDocs = await orderBufferMessagesForUser(pageKey, userId);
      if (!messageDocs.length) {
        continue;
      }

      const messageIds = messageDocs
        .map((doc) => doc.chatMessageId)
        .filter(Boolean);
      const normalizedMessages = messageDocs
        .map((doc) => {
          return normalizeMessageForFrontend({
            _id: doc.chatMessageId || null,
            role: doc.role || "user",
            content: doc.content ?? "",
            timestamp: doc.timestamp || new Date(),
            source: doc.source || "user",
            platform: doc.platform || platform || "line",
            botId: doc.botId || botId || null,
          });
        })
        .filter((msg) => !!msg && !!msg.content);

      if (!normalizedMessages.length) {
        noOrderCount += 1;
        continue;
      }

      const targetMessages = normalizedMessages.slice(-50).map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === "string" ? msg.content : msg.displayContent,
        messageId: msg.messageId || null,
      }));

      const existingOrders = await getUserOrders(userId);
      const latestOrder = existingOrders?.[0];

      const analysis = await analyzeOrderFromChat(userId, targetMessages, {
        previousAddress: latestOrder?.orderData?.shippingAddress || null,
        previousCustomerName: latestOrder?.orderData?.customerName || null,
      });

      if (!analysis || !analysis.hasOrder) {
        noOrderCount += 1;
        continue;
      }

      const duplicateOrder = findDuplicateOrder(
        existingOrders,
        analysis.orderData,
      );

      const extractionRoundId = new ObjectId().toString();

      if (duplicateOrder) {
        duplicateCount += 1;
        await markMessagesAsOrderExtracted(
          userId,
          messageIds,
          extractionRoundId,
          duplicateOrder?._id?.toString?.() || null,
        );
        await clearOrderBufferForUser(pageKey, userId);
        try {
          if (io) {
            io.emit("orderExtracted", {
              userId,
              orderId: duplicateOrder?._id?.toString?.() || null,
              orderData: duplicateOrder?.orderData || null,
              isManualExtraction: false,
              extractedAt: new Date(),
              duplicate: true,
              source: "scheduled_cutoff",
              reason: analysis.reason,
            });
          }
        } catch (_) {}
        continue;
      }

      const orderId = await saveOrderToDatabase(
        userId,
        platform,
        botId,
        analysis.orderData,
        "scheduled_cutoff",
        false,
      );

      if (!orderId) {
        console.error(
          `[OrderCutoff] ไม่สามารถบันทึกออเดอร์ของผู้ใช้ ${userId} ได้`,
        );
        continue;
      }

      createdOrders += 1;

      await markMessagesAsOrderExtracted(
        userId,
        messageIds,
        extractionRoundId,
        orderId?.toString?.() || orderId,
      );

      await clearOrderBufferForUser(pageKey, userId);

      await maybeAnalyzeFollowUp(userId, platform, botId, {
        reasonOverride: analysis.reason,
        followUpUpdatedAt: new Date(),
        forceUpdate: true,
      });

      try {
        if (io) {
          io.emit("orderExtracted", {
            userId,
            orderId,
            orderData: analysis.orderData,
            isManualExtraction: false,
            extractedAt: new Date(),
            confidence: analysis.confidence,
            reason: analysis.reason,
            source: "scheduled_cutoff",
          });
        }
      } catch (_) {}
    } catch (error) {
      console.error(
        `[OrderCutoff] ประมวลผลผู้ใช้ ${userId} ไม่สำเร็จ:`,
        error.message,
      );
    }
  }

  await updateOrderCutoffSetting(platform, botId, {
    lastProcessedAt: nowMoment.toDate(),
    lastCutoffDateKey: nowMoment.format("YYYY-MM-DD"),
    lastRunSummary: {
      processedUsers: users.length,
      createdOrders,
      duplicates: duplicateCount,
      noOrder: noOrderCount,
      timestamp: nowMoment.toDate(),
    },
  });
}

async function evaluateOrderCutoffSchedules() {
  if (orderCutoffProcessing) {
    return;
  }

  orderCutoffProcessing = true;
  try {
    const schedulingEnabled = await getSettingValue(
      "orderCutoffSchedulingEnabled",
      true,
    );
    if (!schedulingEnabled) {
      return;
    }

    const pages = await listOrderCutoffPages();
    if (!pages.length) return;

    const nowMoment = getBangkokMoment();
    const dateKey = nowMoment.format("YYYY-MM-DD");

    for (const page of pages) {
      try {
        const cutoffMoment = getCutoffMomentForDay(page.cutoffTime, nowMoment);
        if (!cutoffMoment || nowMoment.isBefore(cutoffMoment)) {
          continue;
        }

        const setting = await getOrderCutoffSetting(page.platform, page.botId);
        if (setting.lastCutoffDateKey === dateKey) {
          continue;
        }

        await processOrderCutoffForPage(page, { nowMoment });
      } catch (pageError) {
        console.error(
          `[OrderCutoff] ประมวลผลเพจ ${page.pageKey} ไม่สำเร็จ:`,
          pageError.message,
        );
      }
    }
  } catch (error) {
    console.error(
      "[OrderCutoff] evaluateOrderCutoffSchedules error:",
      error.message,
    );
  } finally {
    orderCutoffProcessing = false;
  }
}

async function startOrderCutoffScheduler() {
  const schedulingEnabled = await getSettingValue(
    "orderCutoffSchedulingEnabled",
    true,
  );

  if (!schedulingEnabled) {
    if (orderCutoffTimer) {
      clearInterval(orderCutoffTimer);
      orderCutoffTimer = null;
    }
    console.log("[OrderCutoff] Scheduler ถูกปิดใช้งานตามการตั้งค่า");
    return;
  }

  if (orderCutoffTimer) {
    clearInterval(orderCutoffTimer);
  }

  orderCutoffTimer = setInterval(() => {
    evaluateOrderCutoffSchedules().catch((err) => {
      console.error("[OrderCutoff] Scheduler loop error:", err.message);
    });
  }, ORDER_CUTOFF_INTERVAL_MS);

  // Trigger first run shortly after startup
  setTimeout(() => {
    evaluateOrderCutoffSchedules().catch((err) => {
      console.error("[OrderCutoff] Initial scheduler run error:", err.message);
    });
  }, 5000);

  console.log(
    `[OrderCutoff] Scheduler เริ่มทำงาน (interval ${
      ORDER_CUTOFF_INTERVAL_MS / 1000
    }s)`,
  );
}

async function getFollowUpUsers(filter = {}) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const taskColl = db.collection("follow_up_tasks");
  const profileColl = db.collection("user_profiles");

  const normalizedPlatform = filter.platform || null;
  const normalizedBotId = filter.botId
    ? normalizeFollowUpBotId(filter.botId)
    : null;
  const dateKey = filter.dateKey || getDateKey();

  const query = { dateKey };
  if (normalizedPlatform) {
    query.platform = normalizedPlatform;
  }
  if (filter.botId) {
    query.botId = normalizedBotId;
  }

  const tasks = await taskColl
    .find(query)
    .sort({ nextScheduledAt: 1, createdAt: -1 })
    .limit(200)
    .toArray();
  if (!tasks.length) {
    return {
      users: [],
      summary: {
        total: 0,
        active: 0,
        completed: 0,
        canceled: 0,
        failed: 0,
        dateKey,
      },
    };
  }

  const contextKeys = [
    ...new Set(
      tasks.map((task) => {
        const contextPlatform = task.platform || "line";
        const contextBotId = normalizeFollowUpBotId(task.botId);
        return `${contextPlatform}:${contextBotId || "default"}`;
      }),
    ),
  ];

  const contextConfigEntries = await Promise.all(
    contextKeys.map(async (key) => {
      const [ctxPlatform, ctxBotId] = key.split(":");
      const config = await getFollowUpConfigForContext(
        ctxPlatform,
        ctxBotId === "default" ? null : ctxBotId,
      );
      return { key, config };
    }),
  );

  const contextConfigMap = new Map();
  contextConfigEntries.forEach((entry) => {
    contextConfigMap.set(entry.key, entry.config || {});
  });

  const userIds = [...new Set(tasks.map((task) => task.userId))];
  const profiles =
    userIds.length > 0
      ? await profileColl.find({ userId: { $in: userIds } }).toArray()
      : [];
  const profileMap = new Map();
  profiles.forEach((profile) => {
    profileMap.set(profile.userId, profile);
  });

  const users = tasks
    .map((task) => {
      const profile = profileMap.get(task.userId);
      const contextPlatform = task.platform || "line";
      const contextBotId = normalizeFollowUpBotId(task.botId);
      const configKey = `${contextPlatform}:${contextBotId || "default"}`;
      const config = contextConfigMap.get(configKey) || {};

      if (config.showInDashboard === false) {
        return null;
      }

      const rawRounds = Array.isArray(task.rounds) ? task.rounds : [];
      const sanitizedRounds = rawRounds.map((r) => ({
        index: r?.index ?? 0,
        message: typeof r?.message === "string" ? r.message : "",
        images: sanitizeFollowUpImages(r?.images || []),
        scheduledAt: r?.scheduledAt || null,
        sentAt: r?.sentAt || null,
        status: r?.status || "pending",
      }));
      const totalRounds = sanitizedRounds.length;
      const sentCount = sanitizedRounds.filter(
        (r) => r && r.status === "sent",
      ).length;
      const hasFailed = sanitizedRounds.some((r) => r && r.status === "failed");
      const nextIndex =
        typeof task.nextRoundIndex === "number" ? task.nextRoundIndex : 0;
      const nextRound =
        nextIndex < sanitizedRounds.length ? sanitizedRounds[nextIndex] : null;

      let status = "active";
      if (hasFailed) {
        status = "failed";
      }
      if (task.canceled) {
        status = "canceled";
      } else if (task.completed) {
        status = "completed";
      }

      const displayName = profile?.displayName || `${task.userId.slice(0, 6)}…`;
      const preview = task.lastUserMessagePreview || "";

      return {
        userId: task.userId,
        displayName,
        pictureUrl: profile?.pictureUrl || null,
        platform: contextPlatform,
        botId: contextBotId,
        contextKey: configKey,
        pageId: configKey,
        status,
        lastUserMessagePreview: preview,
        lastUserMessageAt: task.lastUserMessageAt || null,
        lastFollowUpAt: task.lastSentAt || null,
        nextScheduledAt: task.nextScheduledAt || null,
        nextMessage: summarizeFollowUpRound(nextRound),
        totalRounds,
        sentRounds: sentCount,
        rounds: sanitizedRounds,
        canceledReason: task.cancelReason || null,
        dateKey: task.dateKey,
        lastMessage: preview,
        followUpReason: task.cancelReason || "",
        config: {
          analysisEnabled: config.analysisEnabled !== false,
          showInDashboard: config.showInDashboard !== false,
          autoFollowUpEnabled: config.autoFollowUpEnabled !== false,
          rounds: config.rounds || [],
        },
      };
    })
    .filter(Boolean);

  const summary = {
    total: users.length,
    active: users.filter((user) => user.status === "active").length,
    completed: users.filter((user) => user.status === "completed").length,
    canceled: users.filter((user) => user.status === "canceled").length,
    failed: users.filter((user) => user.status === "failed").length,
    contexts: contextKeys.length,
    dateKey,
  };

  return { users, summary };
}

async function buildFollowUpOverview() {
  const [{ users, summary }, pageSettings] = await Promise.all([
    getFollowUpUsers({}),
    listFollowUpPageSettings(),
  ]);

  const normalizedSummary = {
    total: summary?.total || 0,
    active: summary?.active || 0,
    completed: summary?.completed || 0,
    canceled: summary?.canceled || 0,
    failed: summary?.failed || 0,
    dateKey: summary?.dateKey || getDateKey(),
  };

  const pageMap = new Map();
  (pageSettings.pages || []).forEach((page) => {
    pageMap.set(page.id, page);
  });

  const groupMap = new Map();
  users.forEach((user) => {
    const contextKey =
      user.contextKey ||
      `${user.platform || "line"}:${user.botId || "default"}`;
    if (!groupMap.has(contextKey)) {
      const pageInfo = pageMap.get(contextKey) || null;
      const label =
        pageInfo?.name || (user.platform === "facebook" ? "Facebook" : "LINE");
      groupMap.set(contextKey, {
        contextKey,
        platform: user.platform || "line",
        botId: user.botId || null,
        pageName: label,
        pageInfo,
        config: user.config || {},
        stats: { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 },
        users: [],
      });
    }

    const group = groupMap.get(contextKey);
    group.stats.total += 1;
    if (user.status && group.stats.hasOwnProperty(user.status)) {
      group.stats[user.status] += 1;
    }
    group.users.push(user);
  });

  const groups = Array.from(groupMap.values())
    .map((group) => {
      if (Array.isArray(group.users)) {
        group.users = group.users.sort((a, b) => {
          const aTime = a.nextScheduledAt
            ? new Date(a.nextScheduledAt).getTime()
            : Infinity;
          const bTime = b.nextScheduledAt
            ? new Date(b.nextScheduledAt).getTime()
            : Infinity;
          if (aTime === bTime) {
            return (a.displayName || "").localeCompare(b.displayName || "");
          }
          return aTime - bTime;
        });
      }
      return group;
    })
    .sort((a, b) => a.pageName.localeCompare(b.pageName));
  return { summary: normalizedSummary, groups };
}

async function clearFollowUpStatus(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("follow_up_status");
  const now = new Date();
  const existing = (await coll.findOne({ senderId: userId })) || {};
  await coll.updateOne(
    { senderId: userId },
    {
      $set: {
        senderId: userId,
        hasFollowUp: false,
        followUpReason: "",
        followUpUpdatedAt: now,
        lastAnalyzedAt: now,
        platform: existing.platform || null,
        botId: normalizeFollowUpBotId(existing.botId),
      },
    },
    { upsert: true },
  );
}

// ตัวแปรเก็บ instructions จาก Google Doc
let googleDocInstructions = "";
async function fetchGoogleDocInstructions() {
  try {
    const auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ["https://www.googleapis.com/auth/documents.readonly"],
    });
    const docs = google.docs({ version: "v1", auth });
    const res = await docs.documents.get({ documentId: GOOGLE_DOC_ID });
    const docBody = res.data.body?.content || [];
    let fullText = "";
    docBody.forEach((block) => {
      if (block.paragraph?.elements) {
        block.paragraph.elements.forEach((elem) => {
          if (elem.textRun?.content) {
            fullText += elem.textRun.content;
          }
        });
      }
    });
    googleDocInstructions = fullText.trim();
  } catch {
    googleDocInstructions = "Error fetching system instructions.";
  }
}

async function getSheetsApi() {
  const sheetsAuth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth: sheetsAuth });
}

async function fetchSheetData(spreadsheetId, range) {
  try {
    const sheetsApi = await getSheetsApi();
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];
    return rows;
  } catch {
    return [];
  }
}

/**
 * ข้ามแถวที่ทุก cell ว่าง
 */
function parseSheetRowsToObjects(rows) {
  if (!rows || rows.length < 2) {
    return [];
  }
  const headers = rows[0];
  const dataRows = rows.slice(1);
  return dataRows.reduce((acc, row) => {
    const hasContent = row.some((cell) => cell && cell.trim() !== "");
    if (!hasContent) {
      return acc;
    }
    let obj = {};
    headers.forEach((headerName, colIndex) => {
      obj[headerName] = row[colIndex] || "";
    });
    acc.push(obj);
    return acc;
  }, []);
}

function transformSheetRowsToJSON(rows) {
  return parseSheetRowsToObjects(rows);
}

// ตรงนี้จะเก็บข้อมูล 4 แท็บหลังดึงจาก Google Sheets
let sheetJSON = {
  qnaSteps: [],
  companyDetails: [],
  products: [],
  services: [],
};

// รวม 4 แท็บ ถ้าจะเรียกหลายครั้ง
async function fetchAllSheetsData(spreadsheetId) {
  const [
    rowsQnASteps, // "ลักษณะ/ขั้นตอน การถามตอบ"
    rowsMainFlow, // "Main flow"
    rowsProductFlow, // "Product flow"
    rowsServiceFlow, // "Service flow"
    rowsCompany, // "Company details"
    rowsProducts, // "Products"
    rowsServices, // "Services"
  ] = await Promise.all([
    fetchSheetData(spreadsheetId, "ลักษณะ/ขั้นตอน การถามตอบ!A1:D1000"),
    fetchSheetData(spreadsheetId, "Main flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Product flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Service flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Company details!A1:D30"),
    fetchSheetData(spreadsheetId, "Products!A1:Q40"),
    fetchSheetData(spreadsheetId, "Services!A1:O40"),
  ]);

  return {
    // รวมข้อมูลจาก "ลักษณะ/ขั้นตอน การถามตอบ" + main/product/service flow
    qnaSteps: transformSheetRowsToJSON(rowsQnASteps).concat(
      transformSheetRowsToJSON(rowsMainFlow),
      transformSheetRowsToJSON(rowsProductFlow),
      transformSheetRowsToJSON(rowsServiceFlow),
    ),
    companyDetails: transformSheetRowsToJSON(rowsCompany),
    products: transformSheetRowsToJSON(rowsProducts),
    services: transformSheetRowsToJSON(rowsServices),
  };
}

// === ฟังก์ชันโมเดลเล็ก: วิเคราะห์ Flow และข้อมูลที่ขาด (ฟังก์ชันใหม่ไม่มีการประกาศ openai ซ้ำซ้อน)
// (ลบฟังก์ชัน analyzeFlowGPT4oMini)
// ... existing code ...
// (ลบฟังก์ชัน analyzeImageWithAnotherModel)
// ... existing code ...

// ------------------------
// ระบบคิว (ดีเลย์ 5 วินาที) - ปรับปรุงแล้ว
// ------------------------
const processedIds = new Set();
const userQueues = {}; // { queueKey: { userId, messages: [], timer: null, context: {} } }

function buildQueueKey(userId, options = {}) {
  if (options.queueKey) {
    return options.queueKey;
  }
  const idPart =
    typeof userId === "string" ? userId : String(userId || "unknown");
  const botType = options.botType || options.platform || null;
  const rawBotId = options.botId || options.lineBotId || null;
  if (botType || rawBotId) {
    const botId = rawBotId || "default";
    return `${botType || "bot"}:${botId}:${idPart}`;
  }
  return idPart;
}

function mergeQueueContext(existingContext = {}, newContext = {}) {
  const merged = { ...existingContext, ...newContext };
  if (!merged.botId && merged.lineBotId) {
    merged.botId = merged.lineBotId;
  }
  if (!merged.platform) {
    merged.platform = merged.botType || "line";
  }
  if (!merged.botType) {
    merged.botType = merged.platform || "line";
  }
  if (!merged.platform && merged.botType === "line") {
    merged.platform = "line";
  }
  return merged;
}

// ฟังก์ชันสำหรับวิเคราะห์ประเภทเนื้อหาในคิว
function analyzeQueueContent(messages) {
  const analysis = {
    textCount: 0,
    imageCount: 0,
    hasRecentText: false,
    hasRecentImage: false,
    shouldProcessSeparately: false,
    processingStrategy: "combined", // 'combined', 'text_only', 'image_focused'
  };

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.data?.type === "text") {
      analysis.textCount++;
      if (i >= messages.length - 2) analysis.hasRecentText = true;
    } else if (msg.data?.type === "image") {
      analysis.imageCount++;
      if (i >= messages.length - 2) analysis.hasRecentImage = true;
    }
  }

  // กำหนดกลยุทธ์การประมวลผล
  if (analysis.imageCount === 0) {
    analysis.processingStrategy = "text_only";
  } else if (analysis.textCount === 0) {
    analysis.processingStrategy = "image_focused";
  } else if (
    analysis.imageCount > 2 ||
    (analysis.hasRecentText && analysis.hasRecentImage)
  ) {
    analysis.processingStrategy = "combined";
  } else {
    analysis.processingStrategy = "combined";
  }

  console.log(
    `[LOG] Content Analysis: ${analysis.textCount} texts, ${analysis.imageCount} images, strategy: ${analysis.processingStrategy}`,
  );
  return analysis;
}

function sanitizeTextValue(text, options = {}) {
  if (text === null || text === undefined) {
    return null;
  }

  let sanitized = String(text);
  sanitized = sanitized
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

  if (!sanitized) {
    return null;
  }

  const maxLength =
    typeof options.maxLength === "number" && options.maxLength > 0
      ? Math.floor(options.maxLength)
      : 6000;

  if (sanitized.length > maxLength) {
    if (options.keepTail) {
      sanitized = sanitized.slice(-maxLength);
    } else {
      sanitized = sanitized.slice(0, maxLength);
    }
  }

  return sanitized;
}

function isLikelyValidBase64Image(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 16) {
    return false;
  }

  if (/[^A-Za-z0-9+/=\r\n]/.test(trimmed)) {
    return false;
  }

  return trimmed.length % 4 === 0;
}

function cloneQueueMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const cloned = { ...message };
  if (message.data && typeof message.data === "object") {
    cloned.data = { ...message.data };
  }
  return cloned;
}

function filterMessagesForStrategy(messages, strategy = "original") {
  const meta = {
    droppedImages: 0,
    droppedTexts: 0,
    droppedOthers: 0,
    suspectImages: 0,
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], meta };
  }

  if (strategy === "recent_text_only") {
    for (let i = messages.length - 1; i >= 0; i--) {
      const cloned = cloneQueueMessage(messages[i]);
      if (!cloned) continue;
      const data =
        (cloned.data && typeof cloned.data === "object" && cloned.data) ||
        (typeof cloned === "object" ? cloned : null);
      if (!data || data.type !== "text") {
        meta.droppedOthers++;
        continue;
      }

      const sanitizedText = sanitizeTextValue(
        data.text !== undefined ? data.text : data.content,
      );
      if (!sanitizedText) {
        meta.droppedTexts++;
        continue;
      }

      if (data.text !== undefined) {
        data.text = sanitizedText;
      } else {
        data.content = sanitizedText;
      }
      return { messages: [cloned], meta };
    }
    return { messages: [], meta };
  }

  const result = [];
  for (const original of messages) {
    const cloned = cloneQueueMessage(original);
    if (!cloned) {
      meta.droppedOthers++;
      continue;
    }

    const data =
      (cloned.data && typeof cloned.data === "object" && cloned.data) ||
      (typeof cloned === "object" ? cloned : null);
    if (!data || typeof data !== "object") {
      meta.droppedOthers++;
      continue;
    }

    const type = data.type;

    if (type === "text") {
      const sanitizedText = sanitizeTextValue(
        data.text !== undefined ? data.text : data.content,
      );
      if (!sanitizedText) {
        meta.droppedTexts++;
        continue;
      }

      if (data.text !== undefined) {
        data.text = sanitizedText;
      } else {
        data.content = sanitizedText;
      }
    } else if (type === "image") {
      const base64 =
        typeof data.base64 === "string" ? data.base64 : data.content;
      const hasContent = typeof base64 === "string" && base64.trim().length > 0;
      const validBase64 = hasContent && isLikelyValidBase64Image(base64);

      if (!hasContent) {
        meta.droppedImages++;
        continue;
      }

      if (!validBase64) {
        if (strategy === "drop_invalid_images") {
          meta.droppedImages++;
          continue;
        }
        meta.suspectImages++;
      }
    } else if (typeof type === "string") {
      // ชนิดอื่น ๆ เช่น audio, file
      meta.droppedOthers++;
      continue;
    } else {
      meta.droppedOthers++;
      continue;
    }

    result.push(cloned);
  }

  return { messages: result, meta };
}

function buildContentSequenceFromMessages(messages, enableMessageMerging = true) {
  const contentSequence = [];
  const combinedTextParts = [];

  if (!Array.isArray(messages)) {
    return {
      contentSequence,
      combinedTextParts,
      hasImages: false,
      textSegmentCount: 0,
    };
  }

  for (const message of messages) {
    const data =
      (message.data && typeof message.data === "object" && message.data) ||
      (typeof message === "object" ? message : null);
    if (!data || typeof data !== "object") {
      continue;
    }

    if (data.type === "text") {
      const rawText =
        data.text !== undefined ? data.text : data.content !== undefined
          ? data.content
          : null;
      const sanitizedText = sanitizeTextValue(rawText);
      if (!sanitizedText) {
        continue;
      }

      combinedTextParts.push(sanitizedText);
      contentSequence.push({ type: "text", content: sanitizedText });
    } else if (data.type === "image") {
      const base64 =
        typeof data.base64 === "string" ? data.base64 : data.content;
      if (!base64 || !base64.trim()) {
        continue;
      }

      contentSequence.push({
        type: "image",
        content: base64,
        description:
          data.description || data.text || "ผู้ใช้ส่งรูปภาพมา",
      });
    }
  }

  return {
    contentSequence,
    combinedTextParts,
    hasImages: contentSequence.some((entry) => entry.type === "image"),
    textSegmentCount: combinedTextParts.length,
  };
}

function cloneContentSequenceEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const cloned = { ...entry };
  if (entry.payload && typeof entry.payload === "object") {
    cloned.payload = { ...entry.payload };
  }
  return cloned;
}

function filterContentSequenceForStrategy(sequence, strategy = "original") {
  const meta = {
    droppedImages: 0,
    droppedTexts: 0,
    droppedOthers: 0,
    suspectImages: 0,
  };

  if (!Array.isArray(sequence) || sequence.length === 0) {
    return { sequence: [], textParts: [], meta };
  }

  if (strategy === "recent_text_only") {
    for (let i = sequence.length - 1; i >= 0; i--) {
      const cloned = cloneContentSequenceEntry(sequence[i]);
      if (!cloned) {
        meta.droppedOthers++;
        continue;
      }
      if (cloned.type !== "text") {
        meta.droppedOthers++;
        continue;
      }
      const sanitized = sanitizeTextValue(cloned.content);
      if (!sanitized) {
        meta.droppedTexts++;
        continue;
      }
      cloned.content = sanitized;
      return { sequence: [cloned], textParts: [sanitized], meta };
    }
    return { sequence: [], textParts: [], meta };
  }

  const result = [];
  const textParts = [];

  for (const entry of sequence) {
    const cloned = cloneContentSequenceEntry(entry);
    if (!cloned) {
      meta.droppedOthers++;
      continue;
    }

    if (cloned.type === "text") {
      const sanitized = sanitizeTextValue(cloned.content);
      if (!sanitized) {
        meta.droppedTexts++;
        continue;
      }
      cloned.content = sanitized;
      textParts.push(sanitized);
      result.push(cloned);
    } else if (cloned.type === "image") {
      const base64 = typeof cloned.content === "string" ? cloned.content : "";
      const hasContent = base64.trim().length > 0;
      const validBase64 = hasContent && isLikelyValidBase64Image(base64);

      if (!hasContent) {
        meta.droppedImages++;
        continue;
      }

      if (!validBase64) {
        if (strategy === "drop_invalid_images") {
          meta.droppedImages++;
          continue;
        }
        meta.suspectImages++;
      }

      result.push(cloned);
    } else {
      meta.droppedOthers++;
    }
  }

  return { sequence: result, textParts, meta };
}

async function addToQueue(userId, incomingItem, options = {}) {
  console.log(`[LOG] เพิ่มข้อมูลเข้าคิวสำหรับผู้ใช้: ${userId}`);
  const queueKey = buildQueueKey(userId, options);

  if (!userQueues[queueKey]) {
    console.log(
      `[LOG] สร้างคิวใหม่สำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
    );
    userQueues[queueKey] = {
      userId,
      messages: [],
      timer: null,
      context: {},
    };
  }

  userQueues[queueKey].context = mergeQueueContext(
    userQueues[queueKey].context,
    options,
  );

  const queue = userQueues[queueKey];
  // ตรวจสอบจำนวนข้อความสูงสุดในคิว
  const maxQueueSetting = await getSettingValue("maxQueueMessages", 10);
  const maxQueueMessages = Number(maxQueueSetting);
  const normalizedMax =
    Number.isFinite(maxQueueMessages) && maxQueueMessages > 0
      ? Math.floor(maxQueueMessages)
      : 10;

  if (queue.messages.length >= normalizedMax) {
    console.log(
      `[LOG] จำนวนข้อความในคิวถึงขีดจำกัด (${normalizedMax}) เริ่มประมวลผลทันที (queueKey: ${queueKey})`,
    );
    // ยกเลิกตัวจับเวลาเดิม
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }
    // ประมวลผลทันทีและรอให้เสร็จ ก่อนเพิ่มข้อความใหม่
    await flushQueue(queueKey);
  }

  queue.messages.push(incomingItem);
  console.log(
    `[LOG] คิวของผู้ใช้ ${userId} (queueKey: ${queueKey}) มีข้อความ ${queue.messages.length} ข้อความ`,
  );

  if (queue.timer) {
    console.log(
      `[LOG] ยกเลิกตัวจับเวลาคิวเดิมสำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
    );
    clearTimeout(queue.timer);
    queue.timer = null;
  }

  // ใช้ค่าที่ตั้งไว้ในฐานข้อมูล
  const chatDelaySetting = await getSettingValue("chatDelaySeconds", 0);
  const chatDelay = Number(chatDelaySetting);
  const normalizedDelay =
    Number.isFinite(chatDelay) && chatDelay >= 0 ? chatDelay : 5;
  console.log(
    `[LOG] ตั้งเวลาประมวลผลคิวใน ${normalizedDelay} วินาที สำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
  );
  console.log(
    `[LOG] ระบบจะรอข้อความเพิ่มจากผู้ใช้เป็นเวลา ${normalizedDelay} วินาที`,
  );
  queue.timer = setTimeout(() => {
    console.log(
      `[LOG] ครบเวลา delay (${normalizedDelay} วินาที) เริ่มประมวลผลคิวสำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
    );
    flushQueue(queueKey).catch((err) => {
      console.error(
        `[LOG] เกิดข้อผิดพลาดระหว่างประมวลผลคิวสำหรับผู้ใช้ ${userId} (queueKey: ${queueKey}):`,
        err,
      );
    });
  }, normalizedDelay * 1000);
}

async function flushQueue(queueKey) {
  const queue = userQueues[queueKey];
  if (!queue) {
    console.log(`[LOG] ไม่พบคิวสำหรับ key: ${queueKey}`);
    return;
  }
  const { userId, messages } = queue;
  console.log(
    `[LOG] เริ่มการประมวลผลคิวสำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
  );

  if (!messages || messages.length === 0) {
    console.log(
      `[LOG] ไม่พบข้อความในคิวสำหรับผู้ใช้: ${userId} (queueKey: ${queueKey})`,
    );
    queue.timer = null;
    return;
  }
  const allItems = [...messages];
  console.log(
    `[LOG] มีข้อความ ${allItems.length} ข้อความในคิวของผู้ใช้: ${userId}`,
  );
  queue.messages = [];
  queue.timer = null;

  console.log(`[LOG] เริ่มประมวลผลข้อความทั้งหมดในคิวสำหรับผู้ใช้: ${userId}`);
  await processFlushedMessages(userId, allItems, queue.context);
  console.log(`[LOG] ประมวลผลคิวเสร็จสิ้นสำหรับผู้ใช้: ${userId}`);
}

async function processFlushedMessages(
  userId,
  mergedContent,
  queueContext = {},
) {
  console.log(`[LOG] เริ่มประมวลผลข้อความในคิวสำหรับผู้ใช้: ${userId}`);

  const platform = queueContext.platform || queueContext.botType || "line";
  const botIdForHistory = queueContext.botId || null;
  const aiModelOverride = queueContext.aiModel || null;
  const replyToken =
    mergedContent.length > 0
      ? mergedContent[mergedContent.length - 1].replyToken
      : null;
  const channelAccessToken = queueContext.channelAccessToken;
  const channelSecret = queueContext.channelSecret;
  const lineClientFromContext = queueContext.lineClient;
  const facebookAccessToken =
    queueContext.facebookAccessToken ||
    queueContext.accessToken ||
    queueContext.pageAccessToken ||
    null;
  const isLinePlatform = queueContext.botType === "line" || platform === "line";

  async function replyWithLineText(messageText) {
    if (!isLinePlatform) {
      return false;
    }
    if (!replyToken) {
      console.log(
        `[LOG] ไม่มี replyToken สำหรับผู้ใช้ ${userId} ไม่สามารถส่งข้อความกลับได้`,
      );
      return false;
    }
    if (!messageText) {
      return false;
    }
    try {
      if (channelAccessToken && channelSecret) {
        await sendMessage(
          replyToken,
          messageText,
          userId,
          true,
          channelAccessToken,
          channelSecret,
        );
        return true;
      }
      if (lineClientFromContext) {
        await lineClientFromContext.replyMessage(replyToken, {
          type: "text",
          text: messageText,
        });
        return true;
      }
      console.log(
        `[LOG] ไม่สามารถส่งข้อความได้ - ไม่มีข้อมูล Line Client หรือ Channel Credentials สำหรับผู้ใช้ ${userId}`,
      );
      return false;
    } catch (error) {
      console.error("[LOG] ไม่สามารถส่งข้อความตอบกลับได้:", error);
      return false;
    }
  }

  // ตรวจสอบโหมดระบบ
  const systemMode = await getSettingValue("systemMode", "production");
  if (systemMode === "maintenance") {
    console.log(`[LOG] ระบบอยู่ในโหมดบำรุงรักษา ไม่สามารถประมวลผลข้อความได้`);
    if (isLinePlatform) {
      await replyWithLineText(
        "ขออภัยค่ะ ระบบกำลังอยู่ในโหมดบำรุงรักษา กรุณาลองใหม่อีกครั้ง",
      );
    }
    return;
  }

  const userStatus = await getUserStatus(userId);
  const aiEnabled = userStatus.aiEnabled;
  console.log(
    `[LOG] สถานะการใช้ AI ของผู้ใช้ ${userId}: ${aiEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}`,
  );

  const history = await getAIHistory(userId);
  console.log(
    `[LOG] ดึงประวัติ (สำหรับ AI) ของผู้ใช้ ${userId}: ${history.length} ข้อความ`,
  );

  // ตรวจสอบการตั้งค่า AI ในระดับระบบ
  const systemAiEnabled = await getSettingValue("aiEnabled", true);
  if (!systemAiEnabled) {
    console.log(`[LOG] AI ถูกปิดใช้งานในระดับระบบ`);
    await saveChatHistory(userId, mergedContent, "", platform, botIdForHistory);
    return;
  }

  if (!aiEnabled) {
    // ถ้า AI ปิดอยู่
    console.log(
      `[LOG] AI ปิดใช้งาน, บันทึกข้อความโดยไม่มีการตอบกลับสำหรับผู้ใช้: ${userId}`,
    );
    await saveChatHistory(userId, mergedContent, "", platform, botIdForHistory);
    return;
  }

  // ตรวจสอบการตั้งค่าการรวมข้อความ
  const enableMessageMerging = await getSettingValue(
    "enableMessageMerging",
    true,
  );

  // บันทึกสถานะเนื้อหาต้นฉบับเพื่อช่วยดีบัก
  analyzeQueueContent(mergedContent);

  let assistantMsg = "";
  const recoveryStrategies = [
    { key: "original", label: "ข้อมูลเดิมทั้งหมด" },
    { key: "drop_invalid_images", label: "ลบรูปภาพที่อาจมีปัญหา" },
    { key: "recent_text_only", label: "ใช้เฉพาะข้อความล่าสุดที่ใช้ได้" },
  ];

  for (
    let attemptIndex = 0;
    attemptIndex < recoveryStrategies.length && !assistantMsg;
    attemptIndex++
  ) {
    const strategy = recoveryStrategies[attemptIndex];
    const { messages: sanitizedMessages, meta } = filterMessagesForStrategy(
      mergedContent,
      strategy.key,
    );

    if (!sanitizedMessages.length) {
      console.warn(
        `[LOG] กลยุทธ์ "${strategy.label}" ไม่พบข้อมูลที่พร้อมใช้งานสำหรับผู้ใช้ ${userId} ข้ามไปยังกลยุทธ์ถัดไป`,
      );
      continue;
    }

    const {
      contentSequence,
      combinedTextParts,
      hasImages,
      textSegmentCount,
    } = buildContentSequenceFromMessages(sanitizedMessages, enableMessageMerging);

    const combinedText = combinedTextParts.join("\n\n");
    const imageCount = contentSequence.filter((c) => c.type === "image").length;

    if (!hasImages && !combinedText) {
      console.warn(
        `[LOG] กลยุทธ์ "${strategy.label}" สำหรับผู้ใช้ ${userId} ไม่มีข้อความหรือรูปภาพหลังทำความสะอาด`,
      );
      continue;
    }

    if (
      meta.droppedImages > 0 ||
      meta.droppedTexts > 0 ||
      meta.droppedOthers > 0 ||
      meta.suspectImages > 0
    ) {
      const adjustments = [];
      if (meta.droppedImages > 0) {
        adjustments.push(`ลบรูปภาพ ${meta.droppedImages} รายการ`);
      }
      if (meta.suspectImages > 0) {
        adjustments.push(`พบรูปภาพที่ต้องจับตา ${meta.suspectImages} รายการ`);
      }
      if (meta.droppedTexts > 0) {
        adjustments.push(`ลบข้อความ ${meta.droppedTexts} รายการ`);
      }
      if (meta.droppedOthers > 0) {
        adjustments.push(`ละเว้นข้อมูลอื่น ${meta.droppedOthers} รายการ`);
      }
      console.log(
        `[LOG] กลยุทธ์ "${strategy.label}" มีการปรับข้อมูล: ${adjustments.join(", ")}`,
      );
    }

    console.log(
      `[LOG] เริ่มสร้าง system instructions (กลยุทธ์ ${strategy.label}, รอบที่ ${attemptIndex + 1}/${recoveryStrategies.length})`,
    );
    const systemInstructions = await buildSystemInstructionsWithContext(
      history,
      queueContext,
    );

    if (hasImages) {
      console.log(
        `[LOG] ประมวลผลแบบ multimodal (กลยุทธ์ ${strategy.label}): ข้อความ ${textSegmentCount} ส่วน, รูปภาพ ${imageCount} รูป`,
      );
      assistantMsg = await getAssistantResponseMultimodal(
        systemInstructions,
        history,
        contentSequence,
        aiModelOverride,
      );
    } else {
      const preview = combinedText.substring(0, 100);
      console.log(
        `[LOG] ประมวลผลข้อความอย่างเดียว (กลยุทธ์ ${strategy.label}): ${preview}${combinedText.length > 100 ? "..." : ""}`,
      );
      assistantMsg = await getAssistantResponseTextOnly(
        systemInstructions,
        history,
        combinedText,
        aiModelOverride,
      );
    }

    if (!assistantMsg) {
      console.warn(
        `[LOG] กลยุทธ์ "${strategy.label}" ไม่สามารถสร้างคำตอบได้สำหรับผู้ใช้ ${userId}`,
      );
    }
  }

  if (assistantMsg) {
    console.log(
      `[LOG] ได้รับคำตอบ: ${assistantMsg.substring(0, 100)}${assistantMsg.length > 100 ? "..." : ""}`,
    );
  } else {
    console.warn(
      `[LOG] ไม่สามารถสร้างคำตอบสำหรับผู้ใช้ ${userId} หลังใช้ทุกกลยุทธ์`,
    );
  }

  console.log(`[LOG] บันทึกประวัติการสนทนาสำหรับผู้ใช้: ${userId}`);
  await saveChatHistory(
    userId,
    mergedContent,
    assistantMsg,
    platform,
    botIdForHistory,
  );

  // แจ้งเตือนแอดมินเมื่อมีข้อความใหม่จากผู้ใช้
  try {
    await notifyAdminsNewMessage(userId, {
      content: Array.isArray(mergedContent)
        ? mergedContent.map((item) => item.data?.text || "ไฟล์แนบ").join(" ")
        : mergedContent,
      role: "user",
      timestamp: new Date(),
    });
  } catch (notifyError) {
    console.error("[Socket.IO] ไม่สามารถแจ้งเตือนแอดมินได้:", notifyError);
  }

  if (replyToken && isLinePlatform) {
    console.log(`[LOG] ส่งข้อความตอบกลับให้ผู้ใช้: ${userId}`);

    // กรองข้อความก่อนส่ง
    const filteredMessage = await filterMessage(assistantMsg);
    console.log(
      `[LOG] ข้อความหลังกรอง: ${filteredMessage.substring(0, 100)}${filteredMessage.length > 100 ? "..." : ""}`,
    );

    const sent = await replyWithLineText(filteredMessage);
    if (sent) {
      console.log(`[LOG] ส่งข้อความตอบกลับเรียบร้อยแล้ว`);
    }
  } else if (platform === "facebook") {
    console.log(`[LOG] ส่งข้อความตอบกลับผ่าน Facebook ให้ผู้ใช้: ${userId}`);
    const filteredMessage = await filterMessage(assistantMsg);
    console.log(
      `[LOG] ข้อความหลังกรอง (Facebook): ${filteredMessage.substring(0, 100)}${filteredMessage.length > 100 ? "..." : ""}`,
    );

    if (!facebookAccessToken) {
      console.error("[Facebook] ไม่พบ access token สำหรับการส่งข้อความ");
    } else if (filteredMessage) {
      try {
        await sendFacebookMessage(
          userId,
          filteredMessage,
          facebookAccessToken,
          {
            metadata: "ai_generated",
            selectedImageCollections:
              queueContext.selectedImageCollections || null,
          },
        );
        console.log("[Facebook] ส่งข้อความตอบกลับเรียบร้อยแล้ว");
      } catch (error) {
        console.error("[Facebook] ไม่สามารถส่งข้อความตอบกลับได้:", error);
      }
    }
  }
}

// ------------------------
// webhook
// ------------------------
// Webhook handler จะถูกจัดการผ่าน dynamic webhook routes ที่สร้างขึ้นใหม่
// app.post('/webhook', ...) ถูกลบออกแล้ว

async function handleLineEvent(event, queueOptions = {}) {
  const botIdentifier =
    queueOptions.botId || queueOptions.lineBotId || "default";
  let uniqueId = `${botIdentifier}:${event.eventId || ""}`;
  if (event.message && event.message.id) {
    uniqueId += "_" + event.message.id;
  }

  const channelAccessToken = queueOptions.channelAccessToken;
  const channelSecret = queueOptions.channelSecret;
  const botIdForHistory = queueOptions.botId || queueOptions.lineBotId || null;

  console.log(`[LOG] เริ่มประมวลผล event: ${uniqueId}`);

  if (processedIds.has(uniqueId)) {
    console.log(`[LOG] ข้าม event ที่ประมวลผลแล้ว: ${uniqueId}`);
    return;
  }
  processedIds.add(uniqueId);

  const userId = event.source.userId || "unknownUser";
  console.log(`[LOG] รับคำขอจากผู้ใช้: ${userId}`);

  // กรณีตรวจจับคีย์เวิร์ด #DELETEMANY (ลบประวัติทั้งหมดทันที)
  if (event.type === "message" && event.message.type === "text") {
    const userMsg = event.message.text;
    console.log(
      `[LOG] ข้อความจากผู้ใช้: ${userMsg.substring(0, 100)}${userMsg.length > 100 ? "..." : ""}`,
    );

    if (userMsg.includes("#DELETEMANY")) {
      console.log(`[LOG] พบคำสั่ง #DELETEMANY จากผู้ใช้: ${userId}`);
      // เรียกฟังก์ชันล้างประวัติ
      await clearUserChatHistory(userId);
      // แจ้งผู้ใช้ว่าเราลบประวัติเรียบร้อยแล้ว
      if (event.replyToken) {
        try {
          await sendMessage(
            event.replyToken,
            "ลบประวัติสนทนาเรียบร้อยแล้ว!",
            userId,
            true,
            channelAccessToken,
            channelSecret,
          );
        } catch (error) {
          console.error(
            "[LOG] ไม่สามารถส่งข้อความยืนยันการลบประวัติได้:",
            error,
          );
        }
      }
      console.log(`[LOG] ลบประวัติสนทนาของผู้ใช้ ${userId} เรียบร้อยแล้ว`);
      // ไม่ต้องบันทึกข้อความใหม่ หรือเข้าคิวใด ๆ ทั้งสิ้น -> return ออกได้เลย
      return;
    }

    // toggle แอดมิน (ตอบทันที)
    if (userMsg === "สวัสดีค่า แอดมิน Venus นะคะ จะมาดำเนินเรื่องต่อ") {
      console.log(`[LOG] พบคำสั่งเปลี่ยนเป็นโหมดแอดมินสำหรับผู้ใช้: ${userId}`);
      await setUserStatus(userId, false);
      if (event.replyToken) {
        try {
          await sendMessage(
            event.replyToken,
            "แอดมิน Venus สวัสดีค่ะ",
            userId,
            true,
            channelAccessToken,
            channelSecret,
          );
        } catch (error) {
          console.error("[LOG] ไม่สามารถส่งข้อความโหมดแอดมินได้:", error);
        }
      }
      await saveChatHistory(
        userId,
        userMsg,
        "แอดมิน Venus สวัสดีค่ะ",
        "line",
        botIdForHistory,
      );
      console.log(`[LOG] เปลี่ยนเป็นโหมดแอดมินเรียบร้อยแล้ว`);
      return;
    } else if (userMsg === "ขอนุญาตส่งต่อให้ทางแอดมินประจำสนทนาต่อนะคะ") {
      console.log(`[LOG] พบคำสั่งเปลี่ยนเป็นโหมด AI สำหรับผู้ใช้: ${userId}`);
      await setUserStatus(userId, true);
      if (event.replyToken) {
        try {
          await sendMessage(
            event.replyToken,
            "แอดมิน Venus ขอตัวก่อนนะคะ",
            userId,
            true,
            channelAccessToken,
            channelSecret,
          );
        } catch (error) {
          console.error("[LOG] ไม่สามารถส่งข้อความโหมด AI ได้:", error);
        }
      }
      await saveChatHistory(
        userId,
        userMsg,
        "แอดมิน Venus ขอตัวก่อนนะคะ",
        "line",
        botIdForHistory,
      );
      console.log(`[LOG] เปลี่ยนเป็นโหมด AI เรียบร้อยแล้ว`);
      return;
    }
  }

  // กรณีอื่น -> ใส่คิว
  if (event.type === "message") {
    const message = event.message;
    let itemToQueue = { replyToken: event.replyToken };

    if (message.type === "text") {
      console.log(`[LOG] เพิ่มข้อความเข้าคิว สำหรับผู้ใช้: ${userId}`);
      itemToQueue.data = { type: "text", text: message.text };
      await addToQueue(userId, itemToQueue, {
        ...queueOptions,
        platform: "line",
      });
    } else if (message.type === "image") {
      console.log(`[LOG] ได้รับรูปภาพจากผู้ใช้: ${userId}, กำลังประมวลผล...`);

      try {
        // ดึง stream ของภาพจาก LINE (ต้องมี Line Client ที่ถูกต้อง)
        // เนื่องจากไม่มี Line Client เริ่มต้น ให้ข้ามการประมวลผลรูปภาพ
        console.log(
          `[LOG] ไม่สามารถประมวลผลรูปภาพได้ - ต้องตั้งค่า Line Bot ก่อน`,
        );
        itemToQueue.data = {
          type: "text",
          text: "ขออภัย ระบบยังไม่พร้อมประมวลผลรูปภาพ กรุณาตั้งค่า Line Bot ก่อน",
        };
        await addToQueue(userId, itemToQueue, {
          ...queueOptions,
          platform: "line",
        });
        return;

        // โค้ดเดิม (ถูก comment ออก):
        // const stream = await lineClient.getMessageContent(message.id);
        const buffers = [];
        for await (const chunk of stream) {
          buffers.push(chunk);
        }
        // รวม Buffer ต้นฉบับ
        const originalBuffer = Buffer.concat(buffers);
        console.log(`[LOG] ขนาดรูปภาพต้นฉบับ: ${originalBuffer.length} bytes`);

        let resizedBuffer;
        try {
          console.log(`[LOG] กำลังปรับขนาดและเพิ่มประสิทธิภาพรูปภาพ...`);

          // ปรับขนาดให้เหมาะสมกับ OpenAI Vision API (ลด token cost)
          resizedBuffer = await sharp(originalBuffer)
            .resize({
              width: 1024, // ขนาดที่เหมาะสมสำหรับ Vision API
              height: 1024, // จำกัดขนาดสูงสุด
              fit: "inside", // รักษาอัตราส่วน
              withoutEnlargement: true, // ไม่ขยายรูปเล็ก
            })
            .jpeg({
              quality: 85, // คุณภาพดีแต่ไฟล์ไม่ใหญ่เกินไป
              progressive: true,
            })
            .toBuffer();
          console.log(
            `[LOG] ปรับขนาดรูปภาพเรียบร้อย: ${resizedBuffer.length} bytes (ลดลง ${((1 - resizedBuffer.length / originalBuffer.length) * 100).toFixed(1)}%)`,
          );
        } catch (err) {
          console.error("[ERROR] ไม่สามารถปรับขนาดรูปภาพได้:", err.message);
          resizedBuffer = originalBuffer;
          console.log(`[LOG] ใช้รูปภาพต้นฉบับแทน`);
        }

        // ตรวจสอบขนาดไฟล์หลังการปรับขนาด
        const maxSize = 20 * 1024 * 1024; // 20MB limit
        if (resizedBuffer.length > maxSize) {
          console.log(
            `[LOG] รูปภาพใหญ่เกินไป (${(resizedBuffer.length / 1024 / 1024).toFixed(1)}MB), ปรับคุณภาพลง...`,
          );
          try {
            resizedBuffer = await sharp(resizedBuffer)
              .jpeg({ quality: 60 })
              .toBuffer();
            console.log(
              `[LOG] ปรับคุณภาพลงเรียบร้อย: ${resizedBuffer.length} bytes`,
            );
          } catch (err) {
            console.error("[ERROR] ไม่สามารถปรับคุณภาพรูปภาพได้:", err.message);
          }
        }

        // เปลี่ยนเป็น base64
        const base64Data = resizedBuffer.toString("base64");
        console.log(
          `[LOG] แปลงรูปภาพเป็น base64 เรียบร้อย: ${(base64Data.length / 1024).toFixed(1)}KB`,
        );

        // บันทึกเป็นรูปภาพเพื่อส่งต่อเข้าคิว พร้อมคำอธิบายที่ดีขึ้น
        itemToQueue.data = {
          type: "image",
          base64: base64Data,
          text: "ผู้ใช้ส่งรูปภาพมา โปรดดูรูปภาพและให้คำตอบที่เหมาะสม",
        };
        console.log(`[LOG] เพิ่มรูปภาพเข้าคิว สำหรับผู้ใช้: ${userId}`);
        await addToQueue(userId, itemToQueue, {
          ...queueOptions,
          platform: "line",
        });
      } catch (err) {
        console.error(
          "[ERROR] เกิดข้อผิดพลาดในการประมวลผลรูปภาพ:",
          err.message,
        );
        // ส่งข้อความแจ้งเตือนกลับไปแทน
        itemToQueue.data = {
          type: "text",
          text: "เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองส่งรูปภาพใหม่อีกครั้ง",
        };
        await addToQueue(userId, itemToQueue, {
          ...queueOptions,
          platform: "line",
        });
      }
    } else if (message.type === "audio") {
      console.log(`[LOG] ได้รับไฟล์เสียงจากผู้ใช้: ${userId}`);
      try {
        const audioResponseSetting = await getSettingValue(
          "audioAttachmentResponse",
          DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
        );
        const replyText =
          audioResponseSetting || DEFAULT_AUDIO_ATTACHMENT_RESPONSE;
        const filteredReply = await filterMessage(replyText);

        if (event.replyToken) {
          try {
            await sendMessage(
              event.replyToken,
              filteredReply,
              userId,
              true,
              channelAccessToken,
              channelSecret,
            );
            console.log(
              `[LOG] ส่งข้อความตอบกลับสำหรับไฟล์เสียงให้ผู้ใช้ ${userId} แล้ว`,
            );
          } catch (error) {
            console.error(
              "[LOG] ไม่สามารถส่งข้อความตอบกลับไฟล์เสียงได้:",
              error,
            );
          }
        }

        const audioPayload = {
          type: "audio",
          messageId: message.id || null,
          duration: message.duration || null,
          contentProvider: message.contentProvider || null,
        };

        try {
          await saveChatHistory(
            userId,
            audioPayload,
            filteredReply,
            "line",
            botIdForHistory,
          );
        } catch (historyError) {
          console.error(
            "[LOG] ไม่สามารถบันทึกประวัติไฟล์เสียงได้:",
            historyError,
          );
        }
      } catch (audioError) {
        console.error("[LOG] เกิดข้อผิดพลาดในการจัดการไฟล์เสียง:", audioError);
      }
      return;
    } else if (message.type === "video") {
      console.log(`[LOG] ได้รับวิดีโอจากผู้ใช้: ${userId}`);
      itemToQueue.data = {
        type: "text",
        text: "ผู้ใช้ส่งไฟล์แนบประเภท: video",
      };
      console.log(
        `[LOG] เพิ่มการแจ้งเตือนวิดีโอเข้าคิว สำหรับผู้ใช้: ${userId}`,
      );
      await addToQueue(userId, itemToQueue, {
        ...queueOptions,
        platform: "line",
      });
    }
  }
  console.log(`[LOG] จบการประมวลผล event: ${uniqueId}`);
}

// ------------------------
// 15-min refresh schedule
// ------------------------
let lastUpdatedQuarter = "";
function schedule15MinRefresh() {
  setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const quarter = Math.floor(currentMinute / 15);
    const currentQuarterLabel = `${currentHour}-${quarter}`;

    if (
      currentMinute % 15 === 0 &&
      lastUpdatedQuarter !== currentQuarterLabel
    ) {
      console.log(
        "[DEBUG] It's a new 15-minute interval => refreshing sheet data & doc instructions...",
      );

      try {
        await fetchGoogleDocInstructions();
        sheetJSON = await fetchAllSheetsData(SPREADSHEET_ID);

        lastUpdatedQuarter = currentQuarterLabel;
        console.log(
          `[DEBUG] sheetJSON & googleDocInstructions updated at ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
        );
      } catch (err) {
        console.error("15-minute sheet update error:", err);
      }
    }
  }, 60 * 1000);
}

// ============================ Facebook Comment Reply System ============================

// Helper function to get comment reply config for a specific post
async function getCommentReplyConfig(pageId, postId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("facebook_comment_configs");

  const config = await coll.findOne({
    pageId: ObjectId.isValid(pageId) ? new ObjectId(pageId) : pageId,
    postId: postId,
    isActive: true,
  });

  return config;
}

// Ensure config exists for the post (auto-capture support)
async function ensureCommentConfigExists(pageId, postId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_comment_configs");

    const normalizedPageId = ObjectId.isValid(pageId)
      ? new ObjectId(pageId)
      : pageId;

    const existing = await coll.findOne({
      pageId: normalizedPageId,
      postId,
    });

    if (existing) {
      return existing;
    }

    const placeholder = {
      pageId: normalizedPageId,
      postId,
      replyType: "custom",
      customMessage: null,
      aiModel: null,
      systemPrompt: null,
      pullToChat: false,
      isActive: false,
      autoCreated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await coll.insertOne(placeholder);

    console.log(
      `[Facebook Comment] Auto-created placeholder config for post ${postId}`,
    );

    return { ...placeholder, _id: result.insertedId };
  } catch (err) {
    console.error(
      `[Facebook Comment] Failed to ensure config for post ${postId}:`,
      err.message,
    );
    return null;
  }
}

// Helper function to send reply to comment
async function sendCommentReply(commentId, message, accessToken) {
  try {
    const url = `https://graph.facebook.com/v22.0/${commentId}/comments`;
    const response = await axios.post(
      url,
      {
        message: message,
      },
      {
        params: { access_token: accessToken },
      },
    );
    return response.data;
  } catch (error) {
    console.error(
      "[Facebook Comment] Error sending reply:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

// Helper function to send private message from comment
async function sendPrivateMessageFromComment(commentId, message, accessToken) {
  try {
    const url = `https://graph.facebook.com/v22.0/${commentId}/private_replies`;
    const response = await axios.post(
      url,
      {
        message: message,
      },
      {
        params: { access_token: accessToken },
      },
    );
    return response.data;
  } catch (error) {
    console.error(
      "[Facebook Comment] Error sending private message:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

// Helper function to process comment with AI
async function processCommentWithAI(commentText, systemPrompt, aiModel) {
  const startTime = Date.now();

  try {
    // ตรวจสอบ API Key
    if (!OPENAI_API_KEY) {
      console.error("[Facebook Comment AI] OPENAI_API_KEY not configured");
      return "";
    }

    // ตรวจสอบ input
    if (!commentText || commentText.trim().length === 0) {
      console.warn("[Facebook Comment AI] Empty comment text");
      return "";
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const messages = [
      {
        role: "system",
        content:
          systemPrompt || "คุณคือผู้ช่วยตอบคอมเมนต์ Facebook อย่างเป็นมิตร",
      },
      { role: "user", content: commentText },
    ];

    console.log("[Facebook Comment AI] Calling OpenAI:", {
      model: aiModel || "gpt-4o-mini",
      commentLength: commentText.length,
    });

    const completion = await openai.chat.completions.create({
      model: aiModel || "gpt-4o-mini",
      messages: messages,
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply || reply.trim().length === 0) {
      console.error("[Facebook Comment AI] Empty response from AI");
      return "";
    }

    const processingTime = Date.now() - startTime;
    console.log("[Facebook Comment AI] Success:", {
      model: completion.model,
      tokensUsed: completion.usage?.total_tokens,
      processingTime: `${processingTime}ms`,
    });

    return reply.trim();
  } catch (error) {
    const processingTime = Date.now() - startTime;

    console.error("[Facebook Comment AI] Error:", {
      message: error.message,
      code: error.code,
      processingTime: `${processingTime}ms`,
    });

    // จัดการ error ตามประเภท
    if (error.code === "insufficient_quota") {
      console.error("[Facebook Comment AI] OpenAI quota exceeded");
      return "";
    }

    if (error.code === "rate_limit_exceeded") {
      console.error("[Facebook Comment AI] Rate limit exceeded");
      return "";
    }

    if (error.code === "invalid_api_key") {
      console.error("[Facebook Comment AI] Invalid API key");
      return "";
    }

    // Fallback message ทั่วไป
    return "";
  }
}

// Admin page for managing comment replies
app.get("/admin/facebook-comment", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const facebookBots = await db
      .collection("facebook_bots")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    let commentConfigs = await db
      .collection("facebook_comment_configs")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const configKeySet = new Set(
      commentConfigs.map((config) => {
        const pageKey =
          config.pageId && typeof config.pageId.toString === "function"
            ? config.pageId.toString()
            : String(config.pageId || "");
        return `${pageKey}::${config.postId}`;
      }),
    );

    const logColl = db.collection("facebook_comment_logs");
    const logPostRefs = await logColl
      .aggregate([
        {
          $group: {
            _id: {
              pageId: "$pageId",
              postId: "$postId",
            },
          },
        },
      ])
      .toArray();

    let ensuredFromLogs = false;
    for (const ref of logPostRefs) {
      const rawPageId = ref?._id?.pageId;
      const postId = ref?._id?.postId;

      if (!postId || !rawPageId) {
        continue;
      }

      const normalizedPageKey =
        typeof rawPageId?.toString === "function"
          ? rawPageId.toString()
          : String(rawPageId);
      const configKey = `${normalizedPageKey}::${postId}`;

      if (configKeySet.has(configKey)) {
        continue;
      }

      const ensured = await ensureCommentConfigExists(
        normalizedPageKey,
        postId,
      );
      if (ensured) {
        ensuredFromLogs = true;
        configKeySet.add(configKey);
      }
    }

    if (ensuredFromLogs) {
      commentConfigs = await db
        .collection("facebook_comment_configs")
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
    }

    // Add page name to configs
    for (const config of commentConfigs) {
      const bot = facebookBots.find(
        (b) => b._id.toString() === config.pageId.toString(),
      );
      config.pageName = bot?.name || bot?.pageName || "Unknown Page";
    }

    const autoCapturedCount = commentConfigs.filter(
      (config) => config.autoCreated,
    ).length;

    res.render("admin-facebook-comment", {
      facebookBots,
      commentConfigs,
      autoCapturedCount,
    });
  } catch (err) {
    console.error("Error loading Facebook comment page:", err);
    res.render("admin-facebook-comment", {
      facebookBots: [],
      commentConfigs: [],
      autoCapturedCount: 0,
      error: "ไม่สามารถโหลดข้อมูลได้",
    });
  }
});

// API: Create comment reply config
app.post("/admin/facebook-comment/create", async (req, res) => {
  try {
    const {
      pageId,
      postId,
      replyType,
      customMessage,
      aiModel,
      systemPrompt,
      pullToChat,
      isActive,
    } = req.body;

    if (!pageId || !postId || !replyType) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    if (replyType === "custom" && !customMessage) {
      return res.status(400).json({ error: "กรุณาระบุข้อความตอบกลับ" });
    }

    if (replyType === "ai" && (!aiModel || !systemPrompt)) {
      return res
        .status(400)
        .json({ error: "กรุณาเลือกโมเดลและระบุ System Prompt" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_comment_configs");

    // Check if config already exists for this post
    const existing = await coll.findOne({
      pageId: ObjectId.isValid(pageId) ? new ObjectId(pageId) : pageId,
      postId: postId,
    });

    if (existing) {
      return res
        .status(400)
        .json({ error: "มีการตั้งค่าสำหรับโพสต์นี้อยู่แล้ว" });
    }

    const config = {
      pageId: ObjectId.isValid(pageId) ? new ObjectId(pageId) : pageId,
      postId: postId,
      replyType: replyType,
      customMessage: replyType === "custom" ? customMessage : null,
      aiModel: replyType === "ai" ? aiModel : null,
      systemPrompt: replyType === "ai" ? systemPrompt : null,
      pullToChat: pullToChat === true || pullToChat === "true",
      isActive: isActive !== false && isActive !== "false",
      autoCreated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await coll.insertOne(config);

    res.json({ success: true, config });
  } catch (err) {
    console.error("Error creating comment config:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึก" });
  }
});

// API: Get comment reply config
app.get("/admin/facebook-comment/get/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_comment_configs");

    const config = await coll.findOne({ _id: new ObjectId(id) });

    if (!config) {
      return res.status(404).json({ error: "ไม่พบการตั้งค่า" });
    }

    // Get page name
    const bot = await db
      .collection("facebook_bots")
      .findOne({ _id: config.pageId });
    config.pageName = bot?.name || bot?.pageName || "Unknown Page";

    res.json(config);
  } catch (err) {
    console.error("Error getting comment config:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการโหลดข้อมูล" });
  }
});

// API: Update comment reply config
app.post("/admin/facebook-comment/update", async (req, res) => {
  try {
    const {
      configId,
      postId,
      replyType,
      customMessage,
      aiModel,
      systemPrompt,
      pullToChat,
      isActive,
    } = req.body;

    if (!configId || !postId || !replyType) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    if (replyType === "custom" && !customMessage) {
      return res.status(400).json({ error: "กรุณาระบุข้อความตอบกลับ" });
    }

    if (replyType === "ai" && (!aiModel || !systemPrompt)) {
      return res
        .status(400)
        .json({ error: "กรุณาเลือกโมเดลและระบุ System Prompt" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_comment_configs");

    const updateData = {
      postId: postId,
      replyType: replyType,
      customMessage: replyType === "custom" ? customMessage : null,
      aiModel: replyType === "ai" ? aiModel : null,
      systemPrompt: replyType === "ai" ? systemPrompt : null,
      pullToChat: pullToChat === true || pullToChat === "true",
      isActive: isActive !== false && isActive !== "false",
      autoCreated: false,
      updatedAt: new Date(),
    };

    const result = await coll.updateOne(
      { _id: new ObjectId(configId) },
      { $set: updateData },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบการตั้งค่า" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating comment config:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดต" });
  }
});

// API: Toggle comment reply config
app.post("/admin/facebook-comment/toggle/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_comment_configs");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isActive: isActive === true, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบการตั้งค่า" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error toggling comment config:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการเปลี่ยนสถานะ" });
  }
});

// API: Delete comment reply config
app.post("/admin/facebook-comment/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_comment_configs");

    const result = await coll.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "ไม่พบการตั้งค่า" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting comment config:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการลบ" });
  }
});

// Webhook handler for Facebook comments (needs to be added to webhook subscription)
// This will be called when someone comments on a post
async function handleFacebookComment(pageId, postId, commentData, accessToken) {
  try {
    const config = await getCommentReplyConfig(pageId, postId);

    if (!config) {
      const placeholder = await ensureCommentConfigExists(pageId, postId);
      if (placeholder) {
        const placeholderId =
          typeof placeholder._id?.toString === "function"
            ? placeholder._id.toString()
            : placeholder._id || "";
        console.log(
          `[Facebook Comment] No active config for post ${postId}. Placeholder ${placeholderId} ready for setup.`,
        );
      } else {
        console.log(
          `[Facebook Comment] Unable to ensure config for post ${postId}, skipping reply.`,
        );
      }
      return;
    }

    const commentId = commentData.id;
    const commentText = commentData.message || "";
    const commenterId = commentData.from?.id;
    const commenterName = commentData.from?.name;

    if (commenterId) {
      try {
        await ensureFacebookProfileDisplayName(commenterId, accessToken);
      } catch (profileErr) {
        console.warn(
          `[Facebook Comment] ไม่สามารถอัปเดตโปรไฟล์ ${commenterId}:`,
          profileErr?.message || profileErr,
        );
      }
    }

    console.log(
      `[Facebook Comment] Processing comment from ${commenterName} (${commenterId}): ${commentText.substring(0, 50)}...`,
    );

    let replyMessage = "";

    // Determine reply message
    if (config.replyType === "custom") {
      replyMessage = config.customMessage;
    } else if (config.replyType === "ai") {
      try {
        replyMessage = await processCommentWithAI(
          commentText,
          config.systemPrompt,
          config.aiModel,
        );
      } catch (aiError) {
        console.error(
          "[Facebook Comment] AI processing failed:",
          aiError.message,
        );
        replyMessage = "";
      }
    }

    // Send reply to comment
    if (replyMessage) {
      try {
        await sendCommentReply(commentId, replyMessage, accessToken);
        console.log(`[Facebook Comment] Replied to comment ${commentId}`);
      } catch (replyError) {
        console.error(
          "[Facebook Comment] Failed to reply:",
          replyError.message,
        );
      }
    }

    // Pull to chat if configured and user hasn't been pulled before
    if (config.pullToChat && commenterId) {
      try {
        const client = await connectDB();
        const db = client.db("chatbot");
        const chatColl = db.collection("chat_history");

        // Check if user already has chat history
        const existingChat = await chatColl.findOne({
          senderId: commenterId,
          platform: "facebook",
          botId: pageId,
        });

        if (!existingChat) {
          // Send private message to pull user into chat
          const welcomeMessage = `สวัสดีครับคุณ ${commenterName} 👋\n\nขอบคุณที่แสดงความสนใจ! หากมีคำถามเพิ่มเติม สามารถสอบถามได้เลยครับ`;

          try {
            await sendPrivateMessageFromComment(
              commentId,
              welcomeMessage,
              accessToken,
            );
            console.log(
              `[Facebook Comment] Sent private message to pull ${commenterId} into chat`,
            );

            // Save initial chat history
            const welcomeDoc = {
              senderId: commenterId,
              role: "assistant",
              content: welcomeMessage,
              timestamp: new Date(),
              source: "comment_pull",
              platform: "facebook",
              botId: pageId,
            };
            const welcomeInsert = await chatColl.insertOne(welcomeDoc);
            if (welcomeInsert?.insertedId) {
              welcomeDoc._id = welcomeInsert.insertedId;
            }
            await appendOrderExtractionMessage(welcomeDoc);
          } catch (pmError) {
            console.error(
              "[Facebook Comment] Failed to send private message:",
              pmError.message,
            );
          }
        } else {
          console.log(
            `[Facebook Comment] User ${commenterId} already has chat history, skipping pull`,
          );
        }
      } catch (pullError) {
        console.error(
          "[Facebook Comment] Error in pull to chat:",
          pullError.message,
        );
      }
    }

    // Save comment interaction log
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const logColl = db.collection("facebook_comment_logs");

      await logColl.insertOne({
        pageId: ObjectId.isValid(pageId) ? new ObjectId(pageId) : pageId,
        postId: postId,
        commentId: commentId,
        commentText: commentText,
        commenterId: commenterId,
        commenterName: commenterName,
        replyType: config.replyType,
        replyMessage: replyMessage,
        pulledToChat: config.pullToChat,
        timestamp: new Date(),
      });
    } catch (logError) {
      console.error("[Facebook Comment] Failed to save log:", logError.message);
    }
  } catch (error) {
    console.error("[Facebook Comment] Error handling comment:", error);
  }
}

// ============================================================================
// NEW INSTRUCTION SYSTEM V2 - Instructions with embedded Data Items
// ============================================================================

// Helper: Generate unique item ID
function generateDataItemId() {
  return `item_${crypto.randomBytes(8).toString("hex")}`;
}

// Helper: Get all instructions v2
async function getInstructionsV2() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("instructions_v2");
  const cursor = coll.find({}).sort({ createdAt: -1 });
  const instructions = await cursor.toArray();
  return instructions.map((instruction) => ({
    ...instruction,
    _id: instruction._id.toString(),
  }));
}

// API: List all instructions
app.get("/api/instructions-v2", async (req, res) => {
  try {
    const instructions = await getInstructionsV2();
    res.json({ success: true, instructions });
  } catch (err) {
    console.error("Error fetching instructions v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get one instruction
app.get("/api/instructions-v2/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");
    const instruction = await coll.findOne({ _id: new ObjectId(id) });

    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    res.json({ success: true, instruction: { ...instruction, _id: instruction._id.toString() } });
  } catch (err) {
    console.error("Error fetching instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Create new instruction
app.post("/api/instructions-v2", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, error: "กรุณาระบุชื่อ Instruction" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const now = new Date();
    const instruction = {
      instructionId: generateInstructionId(),
      name: name.trim(),
      description: (description || "").trim(),
      dataItems: [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const result = await coll.insertOne(instruction);
    instruction._id = result.insertedId.toString();

    res.json({ success: true, instruction });
  } catch (err) {
    console.error("Error creating instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Update instruction (name, description only)
app.put("/api/instructions-v2/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const updateData = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    res.json({ success: true, instruction: { ...instruction, _id: instruction._id.toString() } });
  } catch (err) {
    console.error("Error updating instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Delete instruction
app.delete("/api/instructions-v2/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const result = await coll.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Duplicate instruction
app.post("/api/instructions-v2/:id/duplicate", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const original = await coll.findOne({ _id: new ObjectId(id) });
    if (!original) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction ต้นฉบับ" });
    }

    const now = new Date();
    const duplicate = {
      instructionId: generateInstructionId(),
      name: name || `${original.name} (สำเนา)`,
      description: original.description || "",
      dataItems: (original.dataItems || []).map(item => ({
        ...item,
        itemId: generateDataItemId(),
        createdAt: now,
        updatedAt: now
      })),
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const result = await coll.insertOne(duplicate);
    duplicate._id = result.insertedId.toString();

    res.json({ success: true, instruction: duplicate });
  } catch (err) {
    console.error("Error duplicating instruction v2:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Add data item to instruction
app.post("/api/instructions-v2/:id/data-items", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, content, data } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({ success: false, error: "กรุณาระบุชื่อชุดข้อมูล" });
    }

    if (!type || !["text", "table"].includes(type)) {
      return res.status(400).json({ success: false, error: "ประเภทไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    const now = new Date();
    const newItem = {
      itemId: generateDataItemId(),
      title: title.trim(),
      type,
      content: type === "text" ? (content || "") : "",
      data: type === "table" ? (data || { columns: [], rows: [] }) : null,
      order: (instruction.dataItems || []).length + 1,
      createdAt: now,
      updatedAt: now
    };

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { dataItems: newItem },
        $set: { updatedAt: now }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    res.json({ success: true, dataItem: newItem });
  } catch (err) {
    console.error("Error adding data item:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Update data item
app.put("/api/instructions-v2/:id/data-items/:itemId", async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { title, content, data } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    const itemIndex = (instruction.dataItems || []).findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: "ไม่พบชุดข้อมูล" });
    }

    const now = new Date();
    const updateFields = {};
    if (title !== undefined) updateFields[`dataItems.${itemIndex}.title`] = title.trim();
    if (content !== undefined) updateFields[`dataItems.${itemIndex}.content`] = content;
    if (data !== undefined) updateFields[`dataItems.${itemIndex}.data`] = data;
    updateFields[`dataItems.${itemIndex}.updatedAt`] = now;
    updateFields.updatedAt = now;

    await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    const updatedInstruction = await coll.findOne({ _id: new ObjectId(id) });
    const updatedItem = updatedInstruction.dataItems[itemIndex];

    res.json({ success: true, dataItem: updatedItem });
  } catch (err) {
    console.error("Error updating data item:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Delete data item
app.delete("/api/instructions-v2/:id/data-items/:itemId", async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $pull: { dataItems: { itemId } },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting data item:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Duplicate data item
app.post("/api/instructions-v2/:id/data-items/:itemId/duplicate", async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    const originalItem = (instruction.dataItems || []).find(item => item.itemId === itemId);
    if (!originalItem) {
      return res.status(404).json({ success: false, error: "ไม่พบชุดข้อมูล" });
    }

    const now = new Date();
    const duplicateItem = {
      ...originalItem,
      itemId: generateDataItemId(),
      title: `${originalItem.title} (สำเนา)`,
      order: (instruction.dataItems || []).length + 1,
      createdAt: now,
      updatedAt: now
    };

    await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { dataItems: duplicateItem },
        $set: { updatedAt: now }
      }
    );

    res.json({ success: true, dataItem: duplicateItem });
  } catch (err) {
    console.error("Error duplicating data item:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Reorder data items
app.put("/api/instructions-v2/:id/data-items/reorder", async (req, res) => {
  try {
    const { id } = req.params;
    const { itemIds } = req.body; // Array of itemIds in new order

    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ success: false, error: "itemIds ต้องเป็น array" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    // Reorder dataItems based on itemIds array
    const reorderedItems = itemIds.map((itemId, index) => {
      const item = (instruction.dataItems || []).find(i => i.itemId === itemId);
      if (item) {
        return { ...item, order: index + 1 };
      }
      return null;
    }).filter(Boolean);

    await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          dataItems: reorderedItems,
          updatedAt: new Date()
        }
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error reordering data items:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Preview instruction (build system prompt)
app.get("/api/instructions-v2/:id/preview", async (req, res) => {
  try {
    const { id } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction) {
      return res.status(404).json({ success: false, error: "ไม่พบ Instruction" });
    }

    // Build system prompt from data items
    let systemPrompt = "";
    const dataItems = instruction.dataItems || [];

    for (const item of dataItems) {
      systemPrompt += `\n\n${"=".repeat(60)}\n\n`;
      systemPrompt += `## ${item.title}\n\n`;

      if (item.type === "text") {
        systemPrompt += item.content || "";
      } else if (item.type === "table" && item.data) {
        const { columns, rows } = item.data;
        if (Array.isArray(columns) && Array.isArray(rows)) {
          // Build markdown table
          systemPrompt += `| ${columns.join(" | ")} |\n`;
          systemPrompt += `| ${columns.map(() => "---").join(" | ")} |\n`;
          rows.forEach(row => {
            if (Array.isArray(row)) {
              systemPrompt += `| ${row.join(" | ")} |\n`;
            }
          });
        }
      }
    }

    systemPrompt = systemPrompt.trim();

    // Calculate approximate token count (rough estimate: 1 token ≈ 4 characters)
    const charCount = systemPrompt.length;
    const tokenCount = Math.ceil(charCount / 4);

    res.json({
      success: true,
      preview: systemPrompt,
      stats: {
        dataItemCount: dataItems.length,
        charCount,
        tokenCount
      }
    });
  } catch (err) {
    console.error("Error previewing instruction:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// END NEW INSTRUCTION SYSTEM V2
// ============================================================================

// ============================================================================
// AUTO MIGRATION: instructions → instructions_v2
// ============================================================================

async function migrateToInstructionsV2() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const migrationLogsColl = db.collection("migration_logs");
    const libraryColl = db.collection("instruction_library");
    const newColl = db.collection("instructions_v2");

    // ตรวจสอบว่า migrate แล้วหรือยัง
    const migrationLog = await migrationLogsColl.findOne({
      migration: "instructions_to_v2"
    });

    if (migrationLog && migrationLog.completed) {
      console.log("[Migration] Instructions V2: Already migrated ✓");
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔄 Starting Auto-Migration: Instruction Library → Instructions V2");
    console.log("=".repeat(60));

    // ตรวจสอบว่ามีข้อมูลใน instructions_v2 อยู่แล้วหรือไม่
    const v2Count = await newColl.countDocuments();
    if (v2Count > 0) {
      console.log(`[Migration] Instructions V2 already has ${v2Count} documents`);
      console.log("[Migration] Skipping migration to avoid data loss");

      // บันทึกว่า migrate แล้ว
      await migrationLogsColl.updateOne(
        { migration: "instructions_to_v2" },
        {
          $set: {
            migration: "instructions_to_v2",
            completed: true,
            skipped: true,
            reason: "instructions_v2 already has data",
            completedAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log("=".repeat(60) + "\n");
      return;
    }

    // ดึงข้อมูลจาก instruction_library
    const libraries = await libraryColl.find({}).toArray();

    if (libraries.length === 0) {
      console.log("[Migration] No instruction libraries found. Nothing to migrate.");

      // บันทึกว่า migrate แล้ว (แต่ไม่มีข้อมูล)
      await migrationLogsColl.updateOne(
        { migration: "instructions_to_v2" },
        {
          $set: {
            migration: "instructions_to_v2",
            completed: true,
            skipped: true,
            reason: "no data to migrate",
            completedAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log("=".repeat(60) + "\n");
      return;
    }

    console.log(`[Migration] Found ${libraries.length} instruction libraries to migrate`);

    // สร้าง Instruction ใหม่สำหรับแต่ละ library
    const now = new Date();
    const createdInstructions = [];
    let totalDataItems = 0;

    for (const library of libraries) {
      // สร้างชื่อจาก library.name หรือ library.date
      let instructionName = library.name || library.displayDate || library.date;

      // ถ้าไม่มี name ให้สร้างชื่อจาก date
      if (!library.name && library.date) {
        // แปลง date จาก "2024-01-15_manual_14-30-00" เป็นรูปแบบที่อ่านง่าย
        const dateMatch = library.date.match(/^(\d{4})-(\d{2})-(\d{2})_(.+?)_(\d{2})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          const [, year, month, day, type, hour, min, sec] = dateMatch;
          const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                             'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
          const monthName = thaiMonths[parseInt(month) - 1] || month;
          const typeLabel = type === 'manual' ? 'บันทึกเอง' : type === 'auto' ? 'อัตโนมัติ' : type;
          instructionName = `Library: ${day} ${monthName} ${year} - ${hour}:${min} (${typeLabel})`;
        } else {
          instructionName = `Library: ${library.date}`;
        }
      }

      // แปลง library.instructions เป็น dataItems
      const instructions = library.instructions || [];
      const dataItems = instructions.map((old, index) => {
        const item = {
          itemId: generateDataItemId(),
          title: old.title || `ชุดข้อมูลที่ ${index + 1}`,
          type: old.type || "text",
          content: "",
          data: null,
          order: index + 1,
          createdAt: old.createdAt || now,
          updatedAt: old.updatedAt || now
        };

        if (old.type === "text") {
          item.content = old.content || "";
        } else if (old.type === "table") {
          item.data = old.data || { columns: [], rows: [] };
        }

        return item;
      });

      // สร้าง Instruction ใหม่
      const newInstruction = {
        instructionId: generateInstructionId(),
        name: instructionName,
        description: library.description || `Instruction จาก Library: ${library.date}`,
        dataItems: dataItems,
        usageCount: 0,
        libraryDate: library.date, // เก็บ reference ไว้
        createdAt: now,
        updatedAt: now
      };

      // Insert ลง instructions_v2
      const result = await newColl.insertOne(newInstruction);
      createdInstructions.push({
        id: result.insertedId.toString(),
        name: newInstruction.name,
        dataItemCount: dataItems.length
      });
      totalDataItems += dataItems.length;

      console.log(`[Migration] ✓ Created: "${newInstruction.name}"`);
      console.log(`[Migration]   ID: ${result.insertedId}`);
      console.log(`[Migration]   Data Items: ${dataItems.length}`);
    }

    // Backup collection เดิม
    try {
      const backupName = `instruction_library_backup_${Date.now()}`;
      await db.collection("instruction_library").rename(backupName);
      console.log(`[Migration] ✓ Backed up old library as: ${backupName}`);
    } catch (err) {
      console.warn(`[Migration] Could not backup old library:`, err.message);
    }

    // บันทึก migration log
    await migrationLogsColl.insertOne({
      migration: "instructions_to_v2",
      completed: true,
      instructionsCreated: createdInstructions,
      totalInstructions: createdInstructions.length,
      totalDataItems: totalDataItems,
      startedAt: now,
      completedAt: new Date()
    });

    console.log(`\n[Migration] ✓ Migration completed successfully!`);
    console.log(`[Migration] Created ${createdInstructions.length} Instructions with ${totalDataItems} total data items`);
    console.log("\n📝 Next Steps:");
    console.log("   1. Visit /admin/dashboard to see the new interface");
    console.log("   2. Edit or organize instructions as needed");
    console.log("   3. Configure bots to use the new instruction system");
    console.log("=".repeat(60) + "\n");

  } catch (err) {
    console.error("\n❌ [Migration] Failed to migrate instructions:", err);
    console.error("   The old data is still safe in 'instruction_library' collection");
    console.error("=".repeat(60) + "\n");
  }
}

// ============================================================================
// END AUTO MIGRATION
// ============================================================================

// ------------------------
// Start server
// ------------------------
// Migration: แปลง label เก่า (ภาษาอังกฤษ) ให้มี slug
async function migrateInstructionAssetsAddSlug() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");

    // หา assets ที่ยังไม่มี slug
    const assetsWithoutSlug = await coll
      .find({ slug: { $exists: false } })
      .toArray();

    if (assetsWithoutSlug.length === 0) {
      console.log("[Migration] ไม่มี assets ที่ต้อง migrate");
      return;
    }

    console.log(
      `[Migration] กำลัง migrate ${assetsWithoutSlug.length} assets...`,
    );

    for (const asset of assetsWithoutSlug) {
      const label = asset.label || "";
      // ถ้า label เดิมเป็นภาษาอังกฤษอยู่แล้ว ให้ใช้เป็น slug ได้เลย
      const slug = /^[a-z0-9_-]+$/i.test(label)
        ? label
        : generateSlugFromLabel(label);

      await coll.updateOne({ _id: asset._id }, { $set: { slug } });
    }

    console.log(
      `[Migration] migrate assets สำเร็จ: ${assetsWithoutSlug.length} รายการ`,
    );
  } catch (err) {
    console.error("[Migration] ข้อผิดพลาดในการ migrate assets:", err);
  }
}

// Migration: แปลง assets เดิม → สร้าง Default Collection และ assign ให้ทุกเพจ
async function migrateAssetsToCollections() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const assetsColl = db.collection("instruction_assets");
    const collectionsColl = db.collection("image_collections");
    const lineBotsColl = db.collection("line_bots");
    const facebookBotsColl = db.collection("facebook_bots");

    // เช็คว่ามี default collection อยู่แล้วหรือไม่
    const existingDefault = await collectionsColl.findOne({ isDefault: true });
    if (existingDefault) {
      console.log(
        "[Migration] มี default collection อยู่แล้ว ข้าม migration นี้",
      );
      return;
    }

    // ดึง assets ทั้งหมดจากระบบเดิม
    const allAssets = await assetsColl.find({}).toArray();

    if (allAssets.length === 0) {
      console.log("[Migration] ไม่มี assets ในระบบ ข้าม migration นี้");
      return;
    }

    console.log(`[Migration] พบ ${allAssets.length} รูปภาพในระบบเดิม`);

    // สร้าง Default Collection
    const defaultCollectionId = "default-collection-" + Date.now();
    const imageList = allAssets.map((asset) => ({
      label: asset.label,
      slug: asset.slug || asset.label,
      url: asset.url,
      thumbUrl: asset.thumbUrl || asset.url,
      description: asset.description || asset.alt || "",
      fileName: asset.fileName,
      assetId: asset._id.toString(),
    }));

    const defaultCollection = {
      _id: defaultCollectionId,
      name: "รูปภาพทั้งหมด (ระบบเดิม)",
      description: "รูปภาพทั้งหมดจากระบบเดิม - สร้างอัตโนมัติเมื่อ migrate",
      images: imageList,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await collectionsColl.insertOne(defaultCollection);
    console.log(
      `[Migration] สร้าง default collection สำเร็จ: "${defaultCollection.name}"`,
    );

    // Assign collection นี้ให้ทุก bot
    const lineBots = await lineBotsColl.find({}).toArray();
    const facebookBots = await facebookBotsColl.find({}).toArray();

    let assignedCount = 0;

    // Assign ให้ LINE bots
    for (const bot of lineBots) {
      const currentCollections = bot.selectedImageCollections || [];
      if (!currentCollections.includes(defaultCollectionId)) {
        await lineBotsColl.updateOne(
          { _id: bot._id },
          {
            $set: {
              selectedImageCollections: [
                defaultCollectionId,
                ...currentCollections,
              ],
            },
          },
        );
        assignedCount++;
      }
    }

    // Assign ให้ Facebook bots
    for (const bot of facebookBots) {
      const currentCollections = bot.selectedImageCollections || [];
      if (!currentCollections.includes(defaultCollectionId)) {
        await facebookBotsColl.updateOne(
          { _id: bot._id },
          {
            $set: {
              selectedImageCollections: [
                defaultCollectionId,
                ...currentCollections,
              ],
            },
          },
        );
        assignedCount++;
      }
    }

    console.log(
      `[Migration] assign default collection ให้ ${assignedCount} bots สำเร็จ`,
    );
    console.log(`[Migration] ระบบ Image Collections พร้อมใช้งาน!`);
  } catch (err) {
    console.error(
      "[Migration] ข้อผิดพลาดในการ migrate assets to collections:",
      err,
    );
  }
}

// Error handling middleware - must be defined after all routes
app.use((err, req, res, next) => {
  console.error("[Express Error]", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    headers: req.headers,
  });

  // Don't expose internal error details in production
  const isDev = process.env.NODE_ENV === "development";
  res.status(err.status || 500).json({
    error: isDev ? err.message : "Internal Server Error",
    ...(isDev && { stack: err.stack }),
  });
});

server.listen(PORT, async () => {
  console.log(`[LOG] เริ่มต้นเซิร์ฟเวอร์ที่พอร์ต ${PORT}...`);
  try {
    console.log(`[LOG] กำลังเชื่อมต่อฐานข้อมูล MongoDB...`);
    await connectDB();
    console.log(`[LOG] เชื่อมต่อฐานข้อมูลสำเร็จ`);

    // รัน migration อัตโนมัติ
    console.log(`[LOG] กำลังตรวจสอบและ migrate ข้อมูล...`);
    await migrateInstructionAssetsAddSlug();
    await migrateAssetsToCollections();
    await migrateToInstructionsV2(); // Auto-migrate to new instruction system
    console.log(`[LOG] Migration เสร็จสิ้น`);

    console.log(`[LOG] กำลังดึงข้อมูล instructions จาก Google Doc...`);
    await fetchGoogleDocInstructions();
    console.log(
      `[LOG] ดึงข้อมูล instructions สำเร็จ (${googleDocInstructions.length} อักขระ)`,
    );

    // ใช้ฟังก์ชันใหม่ดึงข้อมูลทุกแท็บจาก Google Sheets
    console.log(`[LOG] เริ่มดึงข้อมูลทุกแท็บจาก Google Sheets...`);
    sheetJSON = await fetchAllSheetsDataNew(SPREADSHEET_ID);
    console.log(
      `[LOG] ดึงข้อมูลจาก Google Sheets เสร็จสิ้น ได้ข้อมูลจาก ${Object.keys(sheetJSON).length} แท็บ`,
    );

    // ใช้ฟังก์ชันใหม่สำหรับรีเฟรชข้อมูลทุก 1 วัน
    console.log(`[LOG] ตั้งค่าการรีเฟรชข้อมูลอัตโนมัติ...`);
    scheduleDailyRefresh();

    // ทำให้แน่ใจว่ามีการตั้งค่าเริ่มต้นใน collection settings
    await ensureInstructionIdentifiers();
    await ensureSettings();
    await ensureFollowUpIndexes();
    await ensureOrderBufferIndexes();
    startFollowUpTaskWorker();
    await startOrderCutoffScheduler();

    console.log(`[LOG] เซิร์ฟเวอร์พร้อมให้บริการที่พอร์ต ${PORT}`);
  } catch (err) {
    console.error(`[ERROR] เกิดข้อผิดพลาดขณะเริ่มต้นเซิร์ฟเวอร์:`, err);
  }
});

// เพิ่มฟังก์ชันเพื่อเก็บและดึงประวัติการวิเคราะห์ Flow ของผู้ใช้
async function getUserFlowHistory(userId) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("user_flow_history");
  const flowHistory = await coll.findOne({ senderId: userId });
  if (!flowHistory) {
    return {
      senderId: userId,
      flow: null,
      product_service_type: null,
      existing_info: {},
      last_analyzed: null,
    };
  }
  return flowHistory;
}

/**
 * ฟังก์ชันสำหรับส่งข้อความตอบกลับไปยังผู้ใช้ Line
 * @param {string} replyToken - reply token จาก Line event
 * @param {string} message - ข้อความที่ต้องการส่งตอบกลับ
 * @param {string} userId - ID ของผู้ใช้
 * @param {boolean} splitLongMessage - ควรแบ่งข้อความยาวหรือไม่
 */
async function sendMessage(
  replyToken,
  message,
  userId,
  splitLongMessage = false,
  channelAccessToken = null,
  channelSecret = null,
) {
  try {
    if (!message || message.trim() === "") {
      console.log("[DEBUG] Empty message, no reply needed");
      return;
    }

    // สร้าง Line Client ถ้าไม่มี หรือถ้ามี token ใหม่
    let client = lineClient;
    if (channelAccessToken && channelSecret) {
      client = createLineClient(channelAccessToken, channelSecret);
    } else if (!client) {
      console.error("[ERROR] ไม่มี Line Client และไม่มีการระบุ token");
      return;
    }

    // ตรวจสอบว่าข้อความยาวเกินขีดจำกัดของ Line หรือไม่
    // Line มีขีดจำกัด 5,000 อักขระต่อข้อความ แต่เราจะตั้งที่ 4,000 เพื่อความปลอดภัย
    const MAX_LENGTH = 4000;

    if (splitLongMessage && message.length > MAX_LENGTH) {
      // แบ่งข้อความที่ยาวออกเป็นส่วนๆ
      const parts = [];
      for (let i = 0; i < message.length; i += MAX_LENGTH) {
        parts.push(
          message.substring(i, Math.min(message.length, i + MAX_LENGTH)),
        );
      }

      // ส่งข้อความที่แบ่งเป็นชุด
      await client.replyMessage(
        replyToken,
        parts.map((part) => ({
          type: "text",
          text: part,
        })),
      );
    } else {
      // ส่งข้อความปกติ
      await client.replyMessage(replyToken, {
        type: "text",
        text: message.substring(0, MAX_LENGTH), // ตัดข้อความให้ไม่เกินขีดจำกัด
      });
    }
  } catch (err) {
    console.error(`[ERROR] ไม่สามารถส่งข้อความถึงผู้ใช้ ${userId} ได้:`, err);
  }
}

async function saveUserFlowHistory(userId, flowAnalysis) {
  try {
    // ทำความสะอาด flowAnalysis โดยตัด markdown code block ออก (ถ้ามี)
    let cleanedFlowAnalysis = flowAnalysis;

    // ตรวจสอบว่ามีการเริ่มต้นด้วย ```json หรือ ``` หรือไม่
    if (cleanedFlowAnalysis.trim().startsWith("```")) {
      // ตัด ``` ออกจากตอนเริ่มต้น
      cleanedFlowAnalysis = cleanedFlowAnalysis.replace(
        /^```(?:json)?\s*\n/,
        "",
      );
      // ตัด ``` ออกจากตอนจบ
      cleanedFlowAnalysis = cleanedFlowAnalysis.replace(/\n\s*```\s*$/, "");
    }

    // แปลง flowAnalysis ที่เป็น string json เป็น object
    let flowData;
    try {
      flowData = JSON.parse(cleanedFlowAnalysis);
    } catch (e) {
      console.error("Error parsing flow analysis:", e);
      console.log("Cleaned flow analysis:", cleanedFlowAnalysis);
      return;
    }

    // ดึงข้อมูล Flow เดิมของผู้ใช้ (ถ้ามี)
    const oldFlowHistory = await getUserFlowHistory(userId);

    // เตรียมข้อมูล existing_info โดยรวมจากข้อมูลเดิมและข้อมูลใหม่
    const existingInfo = oldFlowHistory.existing_info || {};

    // อัพเดตข้อมูลจากการวิเคราะห์ใหม่
    if (flowData.existing_info && Array.isArray(flowData.existing_info)) {
      flowData.existing_info.forEach((info) => {
        // แยกข้อมูลในรูปแบบ "key: value" หรือแบบที่มีเฉพาะข้อมูล
        const match = info.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          const [_, key, value] = match;
          existingInfo[key.trim()] = value.trim();
        } else {
          // กรณีมีแค่ข้อมูลโดยไม่ระบุประเภท ใช้ข้อมูลเป็น key
          existingInfo[info.trim()] = true;
        }
      });
    }

    const newFlowHistory = {
      senderId: userId,
      flow: flowData.flow || null,
      product_service_type: flowData.product_service_type || null,
      existing_info: existingInfo,
      missing_info: flowData.missing_info || [],
      next_steps: flowData.next_steps || null,
      last_analyzed: new Date(),
    };

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_flow_history");

    // ถ้ามีข้อมูลเดิมให้อัพเดต ถ้าไม่มีให้เพิ่มใหม่
    if (oldFlowHistory && oldFlowHistory.senderId) {
      await coll.updateOne({ senderId: userId }, { $set: newFlowHistory });
    } else {
      await coll.insertOne(newFlowHistory);
    }
  } catch (err) {
    console.error("Error saving flow history:", err);
  }
}

// === ฟังก์ชันโมเดลเล็ก: วิเคราะห์ Flow และข้อมูลที่ขาด (ฟังก์ชันใหม่ไม่มีการประกาศ openai ซ้ำซ้อน)
// (ลบฟังก์ชัน analyzeFlowGPT4oMini)
// ... existing code ...
// (ลบฟังก์ชัน analyzeImageWithAnotherModel)
// ... existing code ...

// เพิ่มฟังก์ชันใหม่สำหรับดึงข้อมูลทุกแท็บจาก Google Sheets
async function fetchAllSheetsDataNew(spreadsheetId) {
  console.log(
    `[LOG] เริ่มดึงข้อมูลจากทุกแท็บใน spreadsheet ${spreadsheetId}...`,
  );
  try {
    const sheetsApi = await getSheetsApi();
    console.log(`[LOG] เชื่อมต่อ Google Sheets API สำเร็จ`);

    // ดึงข้อมูลทุกแท็บจาก spreadsheet
    const response = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });
    console.log(`[LOG] ดึงข้อมูล metadata ของ spreadsheet สำเร็จ`);

    // ดึงรายชื่อแท็บทั้งหมด
    const allSheets = response.data.sheets.map(
      (sheet) => sheet.properties.title,
    );
    console.log(
      `[LOG] พบแท็บทั้งหมด ${allSheets.length} แท็บ: ${allSheets.join(", ")}`,
    );

    // ดึงข้อมูลจากทุกแท็บ
    const allData = {};

    // ดึงข้อมูลจากทุกแท็บพร้อมกัน
    console.log(`[LOG] เริ่มดึงข้อมูลจากทุกแท็บพร้อมกัน...`);
    const dataPromises = allSheets.map(async (sheetTitle) => {
      try {
        console.log(`[LOG] กำลังดึงข้อมูลจากแท็บ "${sheetTitle}"...`);
        const rows = await fetchSheetData(
          spreadsheetId,
          `${sheetTitle}!A1:Z1000`,
        );
        allData[sheetTitle] = transformSheetRowsToJSON(rows);
        console.log(
          `[LOG] ดึงข้อมูลจากแท็บ "${sheetTitle}" สำเร็จ: ${allData[sheetTitle].length} แถว`,
        );
        return { sheetTitle, success: true };
      } catch (error) {
        console.error(
          `[ERROR] ไม่สามารถดึงข้อมูลจากแท็บ "${sheetTitle}" ได้:`,
          error,
        );
        allData[sheetTitle] = [];
        return { sheetTitle, success: false, error };
      }
    });

    // รอให้ดึงข้อมูลทุกแท็บเสร็จ
    const results = await Promise.all(dataPromises);
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(
      `[LOG] ดึงข้อมูลสำเร็จ ${successCount} แท็บ, ล้มเหลว ${failCount} แท็บ`,
    );
    return allData;
  } catch (error) {
    console.error(`[ERROR] เกิดข้อผิดพลาดในการดึงข้อมูลทุกแท็บ:`, error);
    return {};
  }
}

// เปลี่ยนฟังก์ชันรีเฟรชข้อมูลจาก 15 นาทีเป็น 1 วัน
function scheduleDailyRefresh() {
  console.log(
    `[LOG] เริ่มต้นระบบรีเฟรชข้อมูลประจำวัน (ตั้งเวลาจะรีเฟรชเวลา 00:05 น.)...`,
  );
  let lastRefreshDate = "";

  setInterval(async () => {
    const now = new Date();
    const thaiTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
    );
    const currentDate = thaiTime.toISOString().split("T")[0]; // YYYY-MM-DD

    // แสดง log เฉพาะเมื่อเวลาอยู่ในช่วงที่ต้องการรีเฟรช
    if (
      thaiTime.getHours() === 0 &&
      thaiTime.getMinutes() >= 4 &&
      thaiTime.getMinutes() <= 6
    ) {
      console.log(
        `[LOG] ตรวจสอบเวลารีเฟรชข้อมูลประจำวัน: ${thaiTime.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
      );
    }

    // รีเฟรชที่เวลา 00:05 น. และยังไม่เคยรีเฟรชในวันนี้
    if (
      thaiTime.getHours() === 0 &&
      thaiTime.getMinutes() === 5 &&
      lastRefreshDate !== currentDate
    ) {
      console.log(
        `[LOG] เริ่มรีเฟรชข้อมูลประจำวันที่ ${currentDate} เวลา ${thaiTime.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}...`,
      );

      try {
        console.log(`[LOG] กำลังดึงข้อมูล instructions จาก Google Doc...`);
        await fetchGoogleDocInstructions();
        console.log(
          `[LOG] ดึงข้อมูล instructions สำเร็จ (${googleDocInstructions.length} อักขระ)`,
        );

        console.log(`[LOG] กำลังดึงข้อมูลจากทุกแท็บใน Google Sheets...`);
        // ใช้ฟังก์ชันใหม่ดึงข้อมูลทุกแท็บ
        sheetJSON = await fetchAllSheetsDataNew(SPREADSHEET_ID);

        console.log(
          `[LOG] รีเฟรชข้อมูลเสร็จสมบูรณ์ ได้ข้อมูลจาก ${Object.keys(sheetJSON).length} แท็บ`,
        );
        lastRefreshDate = currentDate;
      } catch (err) {
        console.error(`[ERROR] เกิดข้อผิดพลาดในการรีเฟรชข้อมูลประจำวัน:`, err);
      }
    }
  }, 60 * 1000); // ตรวจสอบทุก 1 นาที เพื่อให้ตรงกับเวลาที่กำหนด
}

async function buildSystemInstructions(history) {
  // ดึง instructions จากฐานข้อมูลเท่านั้น ไม่ใช้ Google Docs/Sheets อีกต่อไป
  const instructions = await getInstructions();
  const assetsText = await getAssetsInstructionsText();

  let systemText = "คุณเป็น AI chatbot ภาษาไทย\n\n";

  for (const inst of instructions) {
    if (inst.type === "text") {
      if (inst.title) systemText += `=== ${inst.title} ===\n`;
      systemText += inst.content + "\n\n";
    } else if (inst.type === "table") {
      if (inst.title) systemText += `=== ${inst.title} ===\n`;
      systemText +=
        "ข้อมูลตารางในรูปแบบ JSON:\n```json\n" +
        JSON.stringify(inst.data, null, 2) +
        "\n```\n\n";
    }
  }

  if (assetsText) {
    systemText += "\n\n" + assetsText + "\n\n";
  }

  // เพิ่มเวลาไทยปัจจุบัน
  const now = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
  systemText += `เวลาปัจจุบัน: ${now}`;

  return systemText.trim();
}

async function buildSystemInstructionsWithContext(history, queueContext = {}) {
  const rawSelections = Array.isArray(queueContext.selectedInstructions)
    ? queueContext.selectedInstructions
    : [];
  const normalizedSelections = normalizeInstructionSelections(rawSelections);
  const botKind = queueContext.botType || queueContext.platform || "line";
  const supportsCustomSelections =
    normalizedSelections.length > 0 && ["line", "facebook"].includes(botKind);

  let systemPrompt = "";
  let client = null;
  let db = null;
  let selectedImageCollections = null;

  if (supportsCustomSelections) {
    try {
      client = await connectDB();
      db = client.db("chatbot");
      systemPrompt = (
        await buildSystemPromptFromSelections(normalizedSelections, db)
      ).trim();
    } catch (error) {
      console.error(
        "[LOG] ไม่สามารถสร้าง system instructions จาก selections:",
        error,
      );
    }
  }

  if (!systemPrompt) {
    try {
      const defaultInstructionKey = await getSettingValue(
        "defaultInstruction",
        "",
      );
      if (defaultInstructionKey) {
        if (!db) {
          client = await connectDB();
          db = client.db("chatbot");
        }
        const fallbackSelections = normalizeInstructionSelections([
          defaultInstructionKey,
        ]);
        systemPrompt = (
          await buildSystemPromptFromSelections(fallbackSelections, db)
        ).trim();
      }
    } catch (error) {
      console.error(
        "[LOG] ไม่สามารถสร้าง system instructions จาก default instruction:",
        error,
      );
    }
  }

  if (!systemPrompt) {
    return await buildSystemInstructions(history);
  }

  // ดึง selectedImageCollections จาก bot config
  try {
    if (queueContext.botId) {
      if (!db) {
        client = await connectDB();
        db = client.db("chatbot");
      }

      const botCollection =
        botKind === "facebook" ? "facebook_bots" : "line_bots";
      const botDoc = await db.collection(botCollection).findOne({
        _id: queueContext.botId,
      });

      if (botDoc && botDoc.selectedImageCollections) {
        selectedImageCollections = botDoc.selectedImageCollections;
      }
    }
  } catch (error) {
    console.error("[LOG] ไม่สามารถดึง selectedImageCollections:", error);
  }

  const assetsText = await getAssetsInstructionsText(selectedImageCollections);
  if (assetsText) {
    systemPrompt = `${systemPrompt}\n\n${assetsText}`;
  }

  const now = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
  systemPrompt += `\n\nเวลาปัจจุบัน: ${now}`;

  return systemPrompt.trim();
}

// ฟังก์ชันสำหรับดึงข้อความจากแท็ก <THAI_REPLY>
function extractThaiReply(aiResponse) {
  const thaiReplyRegex = /<THAI_REPLY>([\s\S]*?)<\/THAI_REPLY>/i;
  const match = aiResponse.match(thaiReplyRegex);

  if (match && match[1]) {
    return match[1].trim();
  }

  // ถ้าไม่มีแท็ก THAI_REPLY ให้ส่งข้อความทั้งหมด
  return aiResponse;
}

// ฟังก์ชันสำหรับจัดการข้อความอย่างเดียว (ไม่มีรูปภาพ)
async function getAssistantResponseTextOnly(
  systemInstructions,
  history,
  userText,
  aiModel = null,
) {
  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    console.log(
      `[LOG] สร้าง messages สำหรับการเรียก OpenAI API (ข้อความอย่างเดียว)...`,
    );

    const messages = [
      { role: "system", content: systemInstructions },
      ...history,
      { role: "user", content: userText },
    ];

    console.log(`[LOG] ส่งคำขอไปยัง OpenAI API (ข้อความ)...`);

    // ใช้โมเดลที่ส่งมา หรือ fallback ไปใช้ global setting
    const textModel = aiModel || (await getSettingValue("textModel", "gpt-5"));

    const response = await openai.chat.completions.create({
      model: textModel,
      messages,
    });

    console.log(`[LOG] ได้รับคำตอบจาก OpenAI API เรียบร้อยแล้ว`);

    let assistantReply = response.choices[0].message.content;
    if (typeof assistantReply !== "string") {
      assistantReply = JSON.stringify(assistantReply);
    }

    assistantReply = assistantReply.replace(/\[cut\]{2,}/g, "[cut]");
    const cutList = assistantReply.split("[cut]");
    if (cutList.length > 10) {
      assistantReply = cutList.slice(0, 10).join("[cut]");
    }

    // เพิ่มข้อมูล token usage ต่อท้ายคำตอบ (ถ้าเปิดใช้งาน)
    if (response.usage) {
      const usage = response.usage;
      const showTokenUsage = await getSettingValue("showTokenUsage", false);

      if (showTokenUsage) {
        const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens`;
        assistantReply += tokenInfo;
      }

      console.log(
        `[LOG] Token usage (text): ${usage.total_tokens} total (${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion)`,
      );
    }

    // ดึงข้อความจากแท็ก THAI_REPLY ถ้ามี
    const finalReply = extractThaiReply(assistantReply);

    return finalReply.trim();
  } catch (err) {
    console.error("OpenAI text error:", err);
    return "";
  }
}

// ฟังก์ชันสำหรับจัดการเนื้อหาแบบ multimodal (ข้อความ + รูปภาพ)
async function getAssistantResponseMultimodal(
  systemInstructions,
  history,
  contentSequence,
  aiModel = null,
) {
  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    console.log(
      `[LOG] สร้าง messages สำหรับการเรียก OpenAI API (multimodal)...`,
    );

    // จัดการเนื้อหาตามลำดับ - แต่จำกัดจำนวนรูปภาพเพื่อควบคุมต้นทุน
    const maxImages = await getSettingValue("maxImagesPerMessage", 3); // ใช้ค่าที่ตั้งไว้
    let imageCount = 0;
    let finalContent = [];
    let textParts = [];

    for (const item of contentSequence) {
      if (item.type === "text") {
        textParts.push(item.content);
      } else if (item.type === "image" && imageCount < maxImages) {
        // รวมข้อความที่สะสมก่อนรูปภาพ
        if (textParts.length > 0) {
          finalContent.push({
            type: "text",
            text: textParts.join("\n\n"),
          });
          textParts = [];
        }

        // เพิ่มรูปภาพ พร้อมตั้งค่า detail ให้เหมาะสมเพื่อประหยัด token
        const imageSize = item.content.length;
        const useHighDetail = imageSize > 100000; // ใช้ high detail เฉพาะรูปที่มีรายละเอียดมาก

        finalContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${item.content}`,
            detail: useHighDetail ? "high" : "low", // ปรับ detail ตามขนาดรูป
          },
        });

        console.log(
          `[LOG] ใช้ detail: ${useHighDetail ? "high" : "low"} สำหรับรูปภาพขนาด ${(imageSize / 1024).toFixed(1)}KB`,
        );

        // เพิ่มคำอธิบายรูปภาพ
        finalContent.push({
          type: "text",
          text: `[รูปภาพที่ ${imageCount + 1}]: ${item.description}`,
        });

        imageCount++;
        console.log(`[LOG] เพิ่มรูปภาพที่ ${imageCount} เข้าไปใน content`);
      } else if (item.type === "image" && imageCount >= maxImages) {
        // ถ้าเกินจำนวนรูปภาพที่กำหนด ให้แจ้งเตือน
        textParts.push(
          `[มีรูปภาพเพิ่มเติมที่ไม่สามารถแสดงได้เนื่องจากข้อจำกัดการประมวลผล]`,
        );
      }
    }

    // รวมข้อความที่เหลือ
    if (textParts.length > 0) {
      finalContent.push({
        type: "text",
        text: textParts.join("\n\n"),
      });
    }

    // หากไม่มีเนื้อหาใด ๆ ให้เพิ่มข้อความขอให้อธิบาย
    if (finalContent.length === 0) {
      finalContent.push({
        type: "text",
        text: "ผู้ใช้ส่งเนื้อหามา โปรดตอบกลับอย่างเหมาะสม",
      });
    }

    const messages = [
      { role: "system", content: systemInstructions },
      ...history,
      { role: "user", content: finalContent },
    ];

    console.log(
      `[LOG] ส่งคำขอไปยัง OpenAI API (multimodal) พร้อมรูปภาพ ${imageCount} รูป...`,
    );

    // ใช้โมเดลที่ส่งมา หรือ fallback ไปใช้ global setting
    const visionModel =
      aiModel || (await getSettingValue("visionModel", "gpt-5"));

    const response = await openai.chat.completions.create({
      model: visionModel,
      messages,
    });

    console.log(`[LOG] ได้รับคำตอบจาก OpenAI API (multimodal) เรียบร้อยแล้ว`);

    let assistantReply = response.choices[0].message.content;
    if (typeof assistantReply !== "string") {
      assistantReply = JSON.stringify(assistantReply);
    }

    assistantReply = assistantReply.replace(/\[cut\]{2,}/g, "[cut]");
    const cutList = assistantReply.split("[cut]");
    if (cutList.length > 10) {
      assistantReply = cutList.slice(0, 10).join("[cut]");
    }

    // เพิ่มข้อมูล token usage ต่อท้ายคำตอบ (ถ้าเปิดใช้งาน)
    if (response.usage) {
      const usage = response.usage;
      const showTokenUsage = await getSettingValue("showTokenUsage", false);

      if (showTokenUsage) {
        const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens (มีรูปภาพ ${imageCount} รูป)`;
        assistantReply += tokenInfo;
      }

      console.log(
        `[LOG] Token usage (multimodal): ${usage.total_tokens} total (${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion) with ${imageCount} images`,
      );
    }

    // ดึงข้อความจากแท็ก THAI_REPLY ถ้ามี
    const finalReply = extractThaiReply(assistantReply);

    return finalReply.trim();
  } catch (err) {
    console.error("OpenAI multimodal error:", err);
    return "";
  }
}

// ============================ Settings & Instructions Helpers ============================
async function ensureSettings() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("settings");

  // ตรวจสอบและสร้างการตั้งค่าเริ่มต้น
  const defaultSettings = [
    { key: "aiEnabled", value: true },
    { key: "chatDelaySeconds", value: 0 },
    { key: "maxQueueMessages", value: 10 },
    { key: "enableMessageMerging", value: true },
    { key: "textModel", value: "gpt-5" },
    { key: "visionModel", value: "gpt-5" },
    { key: "maxImagesPerMessage", value: 3 },
    { key: "defaultInstruction", value: "" },
    { key: "enableChatHistory", value: true },
    { key: "enableAdminNotifications", value: true },
    { key: "systemMode", value: "production" },
    { key: "showTokenUsage", value: false },
    { key: "facebookImageSendMode", value: "upload" },
    { key: "enableFollowUpAnalysis", value: true },
    { key: "followUpShowInChat", value: true },
    { key: "followUpShowInDashboard", value: true },
    { key: "followUpAutoEnabled", value: false },
    { key: "orderAnalysisEnabled", value: true },
    { key: "orderCutoffSchedulingEnabled", value: true },
    {
      key: "audioAttachmentResponse",
      value: DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
    },
    {
      key: "followUpRounds",
      value: [
        { delayMinutes: 10, message: "ยังสนใจไหม" },
        { delayMinutes: 20, message: "เหลืออีกเพียงสิบท่าน" },
      ],
    },
  ];

  for (const setting of defaultSettings) {
    const existing = await coll.findOne({ key: setting.key });
    if (!existing) {
      await coll.insertOne(setting);
      console.log(
        `[SETTINGS] สร้างการตั้งค่าเริ่มต้น: ${setting.key} = ${setting.value}`,
      );
    }
  }
}

// Get setting value with default fallback
async function getSettingValue(key, defaultValue) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    const doc = await coll.findOne({ key: key });
    return doc ? doc.value : defaultValue;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
}

async function setSettingValue(key, value) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    await coll.updateOne({ key }, { $set: { value } }, { upsert: true });
    return true;
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    return false;
  }
}

async function getAiEnabled() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("settings");
  const doc = await coll.findOne({ key: "aiEnabled" });
  return doc ? doc.value : true;
}

async function setAiEnabled(state) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("settings");
  await coll.updateOne(
    { key: "aiEnabled" },
    { $set: { value: !!state } },
    { upsert: true },
  );
}

async function getInstructions() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("instructions");
  const cursor = coll.find({}).sort({ order: 1, createdAt: 1 });
  const instructions = await cursor.toArray();
  return instructions.map((instruction) => {
    const id = instruction?._id;
    const stringId =
      id && typeof id.toHexString === "function"
        ? id.toHexString()
        : id && typeof id.toString === "function"
          ? id.toString()
          : String(id || "");
    return {
      ...instruction,
      _id: stringId,
    };
  });
}

function generateInstructionId() {
  return `inst_${crypto.randomBytes(6).toString("hex")}`;
}

function isInstructionSelectionObject(entry) {
  return (
    !!entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    typeof entry.instructionId === "string" &&
    entry.instructionId.trim() !== ""
  );
}

function normalizeInstructionSelections(selections = []) {
  if (!Array.isArray(selections)) return [];
  const normalized = [];
  const seenObjectKeys = new Set();
  const seenStringKeys = new Set();

  for (const entry of selections) {
    if (isInstructionSelectionObject(entry)) {
      const instructionId = entry.instructionId.trim();
      if (!instructionId) continue;
      const version = Number.isInteger(entry.version) ? entry.version : null;
      const key = `${instructionId}::${version === null ? "latest" : version}`;
      if (seenObjectKeys.has(key)) continue;
      seenObjectKeys.add(key);
      normalized.push({ instructionId, version });
    } else if (typeof entry === "string") {
      const value = entry.trim();
      if (!value) continue;
      if (seenStringKeys.has(value)) continue;
      seenStringKeys.add(value);
      normalized.push(value);
    }
  }

  return normalized;
}

function normalizeImageCollectionSelections(collectionIds = []) {
  if (!Array.isArray(collectionIds)) return [];
  const normalized = [];
  const seen = new Set();
  for (const entry of collectionIds) {
    let value = null;
    if (!entry) continue;
    if (typeof entry === "string") {
      value = entry.trim();
    } else if (entry instanceof ObjectId) {
      value = entry.toHexString();
    } else if (
      typeof entry === "object" &&
      entry._id &&
      typeof entry._id === "string"
    ) {
      value = entry._id.trim();
    } else if (
      typeof entry === "object" &&
      entry._id &&
      entry._id instanceof ObjectId
    ) {
      value = entry._id.toHexString();
    }
    if (!value) continue;
    if (!seen.has(value)) {
      seen.add(value);
      normalized.push(value);
    }
  }
  return normalized;
}

function sanitizeInstructionForSnapshot(instruction) {
  if (!instruction || !instruction.instructionId) return null;
  const now = new Date();
  return {
    instructionId: instruction.instructionId,
    version: Number.isInteger(instruction.version) ? instruction.version : 1,
    type: instruction.type || "text",
    title: instruction.title || "",
    content: instruction.content || "",
    data: instruction.type === "table" ? instruction.data || null : null,
    createdAt: instruction.createdAt || now,
    updatedAt: instruction.updatedAt || instruction.createdAt || now,
    snapshotAt: now,
  };
}

async function recordInstructionVersionSnapshot(
  instruction,
  dbInstance = null,
) {
  const snapshot = sanitizeInstructionForSnapshot(instruction);
  if (!snapshot) return null;
  let db = dbInstance;
  let client = null;
  if (!db) {
    client = await connectDB();
    db = client.db("chatbot");
  }
  const versionColl = db.collection("instruction_versions");
  await versionColl.updateOne(
    { instructionId: snapshot.instructionId, version: snapshot.version },
    { $set: snapshot },
    { upsert: true },
  );
  return snapshot;
}

async function ensureInstructionVersionSnapshot(
  instruction,
  dbInstance = null,
) {
  if (!instruction || !instruction.instructionId) return null;
  let db = dbInstance;
  let client = null;
  if (!db) {
    client = await connectDB();
    db = client.db("chatbot");
  }
  const versionColl = db.collection("instruction_versions");
  const version = Number.isInteger(instruction.version)
    ? instruction.version
    : 1;
  const existing = await versionColl.findOne({
    instructionId: instruction.instructionId,
    version,
  });
  if (existing) return existing;
  return recordInstructionVersionSnapshot(instruction, db);
}

async function ensureInstructionIdentifiers() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("instructions");
  const versionColl = db.collection("instruction_versions");

  try {
    await versionColl.createIndex(
      { instructionId: 1, version: -1 },
      { unique: true },
    );
  } catch (err) {
    console.warn(
      "[Instructions] createIndex error (instruction/version):",
      err?.message || err,
    );
  }
  try {
    await versionColl.createIndex({ instructionId: 1, snapshotAt: -1 });
  } catch (err) {
    console.warn(
      "[Instructions] createIndex error (snapshotAt):",
      err?.message || err,
    );
  }

  const docs = await coll.find({}).toArray();
  for (const doc of docs) {
    if (!doc) continue;
    const instructionId = doc.instructionId || `inst_${doc._id?.toString()}`;
    const version = Number.isInteger(doc.version) ? doc.version : 1;
    const createdAtFallback =
      doc.createdAt ||
      (typeof doc._id?.getTimestamp === "function"
        ? doc._id.getTimestamp()
        : new Date());
    const updatedAtFallback = doc.updatedAt || createdAtFallback;
    const updateFields = {};
    if (doc.instructionId !== instructionId)
      updateFields.instructionId = instructionId;
    if (!Number.isInteger(doc.version)) updateFields.version = version;
    if (!doc.createdAt) updateFields.createdAt = createdAtFallback;
    if (!doc.updatedAt) updateFields.updatedAt = updatedAtFallback;

    if (Object.keys(updateFields).length > 0) {
      await coll.updateOne({ _id: doc._id }, { $set: updateFields });
    }

    const hydratedDoc = {
      ...doc,
      ...updateFields,
      instructionId,
      version,
      createdAt: updateFields.createdAt || doc.createdAt || createdAtFallback,
      updatedAt: updateFields.updatedAt || doc.updatedAt || updatedAtFallback,
    };

    await ensureInstructionVersionSnapshot(hydratedDoc, db);
  }
}

async function resolveInstructionSelections(
  selections = [],
  dbInstance = null,
) {
  if (!Array.isArray(selections) || selections.length === 0) return [];
  const normalized = selections
    .map((entry) => {
      if (isInstructionSelectionObject(entry)) {
        return {
          instructionId: entry.instructionId.trim(),
          version: Number.isInteger(entry.version) ? entry.version : null,
        };
      }
      return null;
    })
    .filter(Boolean);

  if (normalized.length === 0) return [];

  let db = dbInstance;
  let client = null;
  if (!db) {
    client = await connectDB();
    db = client.db("chatbot");
  }

  const instructionIds = [
    ...new Set(normalized.map((item) => item.instructionId)),
  ];
  const versionCriteria = normalized
    .filter((item) => Number.isInteger(item.version))
    .map((item) => ({
      instructionId: item.instructionId,
      version: item.version,
    }));

  const versionQuery =
    versionCriteria.length > 0
      ? { $or: versionCriteria }
      : { instructionId: { $in: instructionIds } };

  const [currentDocs, versionDocs] = await Promise.all([
    db
      .collection("instructions")
      .find({ instructionId: { $in: instructionIds } })
      .toArray(),
    db.collection("instruction_versions").find(versionQuery).toArray(),
  ]);

  const currentMap = new Map();
  currentDocs.forEach((doc) => {
    if (doc && doc.instructionId) currentMap.set(doc.instructionId, doc);
  });

  const versionMap = new Map();
  versionDocs.forEach((doc) => {
    if (!doc || !doc.instructionId) return;
    const key = `${doc.instructionId}::${doc.version}`;
    versionMap.set(key, doc);
  });

  const results = [];
  const seen = new Set();

  for (const entry of normalized) {
    const key = `${entry.instructionId}::${entry.version === null ? "latest" : entry.version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let doc = null;
    if (Number.isInteger(entry.version)) {
      doc = versionMap.get(`${entry.instructionId}::${entry.version}`);
    }
    if (!doc) {
      doc = currentMap.get(entry.instructionId);
    }
    if (!doc) continue;
    if (!doc.instructionId) doc.instructionId = entry.instructionId;
    if (!Number.isInteger(doc.version))
      doc.version = entry.version || doc.version || 1;
    results.push(doc);
  }

  return results;
}

function buildSystemPromptFromInstructionDocs(instructions = []) {
  if (!Array.isArray(instructions) || instructions.length === 0) return "";
  const normalize = (text) => {
    if (!text) return "";
    return String(text).replace(/\r\n/g, "\n");
  };

  const parts = [];
  for (const instruction of instructions) {
    if (!instruction) continue;
    if (instruction.type === "table") {
      const tableText = tableInstructionToJSON(instruction);
      if (tableText && tableText.trim()) {
        parts.push(tableText.trim());
      }
      continue;
    }
    const header = instruction.title ? `=== ${instruction.title} ===\n` : "";
    const body = normalize(instruction.content || "").trim();
    const chunk = `${header}${body}`.trim();
    if (chunk) parts.push(chunk);
  }

  return parts.filter(Boolean).join("\n\n");
}

async function buildSystemPromptFromSelections(
  selectedInstructions = [],
  dbInstance = null,
) {
  if (!Array.isArray(selectedInstructions) || selectedInstructions.length === 0)
    return "";
  const hasObjectSelections = selectedInstructions.some(
    isInstructionSelectionObject,
  );

  let db = dbInstance;
  let client = null;
  if (!db && hasObjectSelections) {
    client = await connectDB();
    db = client.db("chatbot");
  }

  if (hasObjectSelections) {
    const docs = await resolveInstructionSelections(selectedInstructions, db);
    return buildSystemPromptFromInstructionDocs(docs);
  }

  let localDb = db;
  if (!localDb) {
    client = await connectDB();
    localDb = client.db("chatbot");
  }

  const instructionColl = localDb.collection("instruction_library");
  const instructionDocs = await instructionColl
    .find({
      date: { $in: selectedInstructions },
    })
    .toArray();

  return buildSystemPromptFromLibraries(instructionDocs);
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  try {
    return new ObjectId(id);
  } catch (e) {
    return null;
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function uploadBufferToGridFS(bucket, filename, buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, options);
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

async function deleteGridFsEntries(bucket, entries = []) {
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.id) {
      const objectId = toObjectId(entry.id);
      if (!objectId) continue;
      try {
        // Check if file exists before attempting delete
        const files = await bucket.find({ _id: objectId }).toArray();
        if (files.length === 0) {
          // File doesn't exist, skip silently
          continue;
        }
        await bucket.delete(objectId);
      } catch (err) {
        // Only log unexpected errors (not FileNotFound)
        const isFileNotFound =
          err.code === "FileNotFound" ||
          err.code === 26 ||
          err.message?.includes("File not found") ||
          err.message?.includes("FileNotFound");

        if (!isFileNotFound) {
          console.warn("[GridFS] delete by id failed:", err?.message || err);
        }
      }
      continue;
    }
    if (entry.filename) {
      try {
        const files = await bucket.find({ filename: entry.filename }).toArray();
        for (const file of files) {
          try {
            await bucket.delete(file._id);
          } catch (err) {
            const isFileNotFound =
              err.code === "FileNotFound" ||
              err.code === 26 ||
              err.message?.includes("File not found") ||
              err.message?.includes("FileNotFound");

            if (!isFileNotFound) {
              console.warn(
                "[GridFS] delete by filename failed:",
                err?.message || err,
              );
            }
          }
        }
      } catch (err) {
        console.warn("[GridFS] find for delete failed:", err?.message || err);
      }
    }
  }
}

// ============================ Instruction Assets Helpers ============================
async function getInstructionAssets() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");
    const assets = await coll.find({}).sort({ createdAt: -1 }).toArray();
    return assets.map((asset) => ({
      ...asset,
      url: resolveInstructionAssetUrl(asset.url, asset.fileName),
      thumbUrl: resolveInstructionAssetUrl(
        asset.thumbUrl || asset.url,
        asset.thumbFileName || asset.fileName,
      ),
      fileId: asset?.fileId ? asset.fileId.toString() : undefined,
      thumbFileId: asset?.thumbFileId
        ? asset.thumbFileId.toString()
        : undefined,
    }));
  } catch (e) {
    console.error("[Assets] Error fetching assets:", e);
    return [];
  }
}

function stripAssetExtension(name) {
  if (!name || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot > 0) {
    return trimmed.slice(0, lastDot).trim();
  }
  return trimmed;
}

function normalizeAssetKey(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function addAssetToLookup(map, asset) {
  if (!map || !asset || typeof asset !== "object") return;
  const candidates = new Map();
  const register = (text, prefer = false) => {
    if (!text || typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!candidates.has(trimmed)) candidates.set(trimmed, prefer);
    if (prefer) candidates.set(trimmed, true);
    const withoutExt = stripAssetExtension(trimmed);
    if (withoutExt && !candidates.has(withoutExt)) {
      candidates.set(withoutExt, prefer);
    } else if (withoutExt && prefer) {
      candidates.set(withoutExt, true);
    }
  };

  register(asset.label, true);
  register(asset.slug);
  register(asset.fileName);
  register(asset.alt);
  if (Array.isArray(asset.aliases)) {
    for (const alias of asset.aliases) {
      register(alias);
    }
  }
  if (Array.isArray(asset.tags)) {
    for (const tag of asset.tags) {
      register(tag);
    }
  }

  for (const [key, prefer] of candidates.entries()) {
    if (prefer || !map[key]) {
      map[key] = asset;
    }
    const normalizedKey = normalizeAssetKey(key);
    if (normalizedKey && (prefer || !map[normalizedKey])) {
      map[normalizedKey] = asset;
    }
  }
}

function buildAssetsLookup(assets = []) {
  const map = {};
  for (const asset of assets) {
    if (!asset) continue;
    addAssetToLookup(map, asset);
  }
  return map;
}

function findAssetInLookup(map, query) {
  if (!map || !query) return null;
  if (map[query]) return map[query];
  if (typeof query === "string") {
    const trimmed = query.trim();
    if (trimmed && map[trimmed]) return map[trimmed];
    const normalized = normalizeAssetKey(trimmed);
    if (normalized && map[normalized]) return map[normalized];
    const withoutExt = stripAssetExtension(trimmed);
    if (withoutExt) {
      if (map[withoutExt]) return map[withoutExt];
      const normalizedWithoutExt = normalizeAssetKey(withoutExt);
      if (normalizedWithoutExt && map[normalizedWithoutExt]) {
        return map[normalizedWithoutExt];
      }
    }
  }
  return null;
}

async function getInstructionAssetsMap() {
  const assets = await getInstructionAssets();
  return buildAssetsLookup(assets);
}

// ฟังก์ชันใหม่: ดึงรูปภาพจาก collections ที่เลือก (สำหรับ bot context)
async function getAssetsInstructionsText(selectedCollectionIds = null) {
  let assets = [];

  // ถ้ามีการเลือก collections ให้ใช้รูปจาก collections
  if (
    selectedCollectionIds &&
    Array.isArray(selectedCollectionIds) &&
    selectedCollectionIds.length > 0
  ) {
    assets = await getImagesFromSelectedCollections(selectedCollectionIds);
  } else {
    // fallback: ใช้รูปทั้งหมด (backward compatible)
    assets = await getInstructionAssets();
  }

  if (!assets || assets.length === 0) return "";
  const lines = [];
  lines.push(
    'การแทรกรูปภาพในการตอบ: ใช้แท็ก #[IMAGE:<ชื่อรูปภาพ>] ในตำแหน่งที่ต้องการ เช่น ตัวอย่าง: "ยอดชำระ 500 บาท #[IMAGE:QR Code ชำระเงิน] ขอบคุณค่ะ" หรือ "นี่คือสินค้าของเรา #[IMAGE:สินค้า A] ราคา 199 บาท" ระบบจะแยกเป็นข้อความ-รูปภาพ-ข้อความโดยอัตโนมัติ',
  );
  lines.push("รายการรูปที่สามารถใช้ได้ (ชื่อรูปภาพ: คำอธิบาย):");
  for (const a of assets) {
    const label = a.label;
    const desc = a.description || a.alt || "";
    lines.push(`- ${label}: ${desc}`);
  }
  return lines.join("\n");
}

// ฟังก์ชันใหม่: สร้าง assets map จาก collections ที่เลือก
async function getAssetsMapForBot(selectedCollectionIds = null) {
  const hasSelections =
    Array.isArray(selectedCollectionIds) && selectedCollectionIds.length > 0;
  const map = {};
  let primaryAssets = [];

  if (hasSelections) {
    try {
      primaryAssets = await getImagesFromSelectedCollections(
        selectedCollectionIds,
      );
    } catch (err) {
      console.error(
        "[Assets] Error fetching selected collection assets:",
        err?.message || err,
      );
    }
  }

  if (Array.isArray(primaryAssets) && primaryAssets.length > 0) {
    for (const asset of primaryAssets) {
      addAssetToLookup(map, asset);
    }
  }

  let fallbackAssets = [];
  try {
    fallbackAssets = await getInstructionAssets();
  } catch (err) {
    console.error(
      "[Assets] Error fetching fallback instruction assets:",
      err?.message || err,
    );
  }

  if (Array.isArray(fallbackAssets) && fallbackAssets.length > 0) {
    const missingLabels =
      hasSelections && Object.keys(map).length > 0 ? new Set() : null;
    for (const asset of fallbackAssets) {
      if (!asset) continue;
      const alreadyResolvable =
        !hasSelections ||
        !missingLabels ||
        !!findAssetInLookup(map, asset.label || asset.slug || asset.fileName);
      addAssetToLookup(map, asset);
      if (missingLabels && !alreadyResolvable && asset.label) {
        missingLabels.add(asset.label);
      }
    }
    if (missingLabels && missingLabels.size > 0) {
      const sample = Array.from(missingLabels).slice(0, 5);
      console.warn(
        "[Assets] Some instruction assets are not linked to selected collections:",
        sample.join(", "),
        missingLabels.size > sample.length
          ? `(+${missingLabels.size - sample.length})`
          : "",
      );
    }
  }

  return map;
}

// Parse assistant reply into segments of text and images based on #[IMAGE:label]
function parseMessageSegmentsByImageTokens(message, assetsMap) {
  if (!message || typeof message !== "string")
    return [{ type: "text", text: "" }];
  const segments = [];
  const regex = /#\[\s*IMAGE\s*:\s*([^\]]*?)\s*\]/gi;
  const uniquePush = (arr, value) => {
    const candidate = typeof value === "string" ? value.trim() : "";
    if (!candidate) return;
    if (!arr.includes(candidate)) {
      arr.push(candidate);
    }
  };
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(message)) !== null) {
    const idx = match.index;
    const prev = message.slice(lastIndex, idx);
    if (prev && prev.trim() !== "") segments.push({ type: "text", text: prev });
    let rawLabel = (match[1] || "").trim();
    let cleanedLabel = rawLabel
      .replace(/^[“”"'`]+/, "")
      .replace(/[“”"'`]+$/, "");
    const candidates = [];
    uniquePush(candidates, cleanedLabel);
    if (cleanedLabel.endsWith(":")) {
      uniquePush(candidates, cleanedLabel.slice(0, -1));
    }
    const bulletStripped = cleanedLabel.replace(/^[\s]*[-*•●]+\s*/, "");
    if (bulletStripped !== cleanedLabel) {
      uniquePush(candidates, bulletStripped);
    }
    const numberStripped = cleanedLabel.replace(/^[\s]*\d+\s*[\).:-]\s*/, "");
    if (numberStripped !== cleanedLabel) {
      uniquePush(candidates, numberStripped);
    }
    if (cleanedLabel.includes(":")) {
      uniquePush(candidates, cleanedLabel.split(":")[0]);
    }
    if (cleanedLabel.includes(" - ")) {
      uniquePush(candidates, cleanedLabel.split(" - ")[0]);
    }
    if (cleanedLabel.includes("\n")) {
      uniquePush(candidates, cleanedLabel.split("\n")[0]);
    }

    let asset = null;
    let matchedLabel = null;
    for (const candidate of candidates) {
      asset = findAssetInLookup(assetsMap, candidate);
      if (asset) {
        matchedLabel = candidate;
        break;
      }
    }
    if (asset) {
      segments.push({
        type: "image",
        label: asset.label || matchedLabel || rawLabel,
        url: asset.url,
        thumbUrl: asset.thumbUrl || asset.url,
        alt: asset.alt || "",
        fileName: asset.fileName || `${rawLabel}.jpg`,
      });
    } else {
      // If asset not found, keep the literal token as text to avoid losing info
      segments.push({ type: "text", text: ` [รูป ${rawLabel} ไม่พบ] ` });
    }
    lastIndex = regex.lastIndex;
  }
  const tail = message.slice(lastIndex);
  if (tail && tail.trim() !== "") segments.push({ type: "text", text: tail });
  if (segments.length === 0) segments.push({ type: "text", text: message });
  return segments;
}

// ============================ Instruction Library ============================
// Health check endpoint for Railway
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "ChatCenter AI",
    version: "1.0.0",
  });
});

// Root redirects to admin dashboard
app.get("/", (req, res) => {
  res.redirect("/admin/dashboard");
});

// Route: list all instruction libraries
app.get("/admin/instructions/library", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const libraries = await libraryColl
      .find(
        {},
        {
          projection: {
            date: 1,
            savedAt: 1,
            type: 1,
            displayDate: 1,
            displayTime: 1,
            name: 1,
            description: 1,
          },
        },
      )
      .sort({ date: -1 })
      .toArray();
    res.json({ success: true, libraries });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: get instruction library by date (YYYY-MM-DD)
app.get("/admin/instructions/library/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const doc = await libraryColl.findOne({ date });
    if (!doc)
      return res.json({
        success: false,
        error: "ไม่พบคลัง instruction ของวันที่ระบุ",
      });
    res.json({
      success: true,
      instructions: doc.instructions,
      savedAt: doc.savedAt,
      name: doc.name,
      description: doc.description,
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: สร้าง instruction library ด้วยตนเอง
app.post("/admin/instructions/library-now", async (req, res) => {
  try {
    const { name, description } = req.body;
    const now = new Date();
    const thaiNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
    );
    const dateStr = thaiNow.toISOString().split("T")[0];
    const timeStr = thaiNow.toTimeString().split(" ")[0].replace(/:/g, "-");
    const libraryKey = `${dateStr}_manual_${timeStr}`;

    const client = await connectDB();
    const db = client.db("chatbot");
    const instrColl = db.collection("instructions");
    const libraryColl = db.collection("instruction_library");

    const instructions = await instrColl.find({}).toArray();
    await libraryColl.updateOne(
      { date: libraryKey },
      {
        $set: {
          date: libraryKey,
          instructions,
          savedAt: new Date(),
          type: "manual",
          displayDate: dateStr,
          displayTime: thaiNow.toLocaleTimeString("th-TH"),
          name: name || `คลัง ${dateStr} ${timeStr}`,
          description:
            description ||
            `คลัง instruction ที่สร้างด้วยตนเองเมื่อวันที่ ${dateStr} เวลา ${timeStr}`,
        },
      },
      { upsert: true },
    );

    res.json({
      success: true,
      message: `บันทึก instructions ลงคลังเรียบร้อยแล้ว (${instructions.length} instructions)`,
      libraryKey: libraryKey,
      instructionCount: instructions.length,
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: อัปเดตชื่อหรือคำอธิบายของ instruction library
app.put("/admin/instructions/library/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { name, description } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;

    if (Object.keys(updateFields).length === 0) {
      return res.json({ success: false, error: "ไม่มีข้อมูลที่ต้องการอัปเดต" });
    }

    const result = await libraryColl.updateOne(
      { date },
      { $set: updateFields },
    );
    if (result.matchedCount === 0) {
      return res.json({
        success: false,
        error: "ไม่พบคลัง instruction ของวันที่ระบุ",
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: ลบ instruction library ตามวันที่ระบุ
app.delete("/admin/instructions/library/:date", async (req, res) => {
  try {
    const { date } = req.params;

    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");

    const result = await libraryColl.deleteOne({ date });
    if (result.deletedCount === 0) {
      return res.json({
        success: false,
        error: "ไม่พบคลัง instruction ของวันที่ระบุ",
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: คืนค่า instruction library
app.post("/admin/instructions/restore/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { createLibraryBefore } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const instrColl = db.collection("instructions");
    const libraryColl = db.collection("instruction_library");

    // ดึงข้อมูล library ที่ต้องการ restore
    const library = await libraryColl.findOne({ date });
    if (!library) {
      return res.json({
        success: false,
        error: "ไม่พบคลัง instruction ของวันที่ระบุ",
      });
    }

    // บันทึกข้อมูลปัจจุบันลงคลังก่อน restore (ถ้าต้องการ)
    if (createLibraryBefore) {
      const currentInstructions = await instrColl.find({}).toArray();
      const now = new Date();
      const thaiNow = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
      );
      const dateStr = thaiNow.toISOString().split("T")[0];
      const timeStr = thaiNow.toTimeString().split(" ")[0].replace(/:/g, "-");
      const beforeRestoreKey = `${dateStr}_before_restore_${timeStr}`;

      await libraryColl.updateOne(
        { date: beforeRestoreKey },
        {
          $set: {
            date: beforeRestoreKey,
            instructions: currentInstructions,
            savedAt: new Date(),
            type: "before_restore",
            displayDate: dateStr,
            displayTime: thaiNow.toLocaleTimeString("th-TH"),
            name: `คลังก่อนคืนค่า ${dateStr}`,
            description: `คลัง instruction ที่บันทึกก่อนคืนค่าข้อมูลเมื่อวันที่ ${dateStr}`,
          },
        },
        { upsert: true },
      );
    }

    // ลบข้อมูลปัจจุบันทั้งหมด
    await instrColl.deleteMany({});

    // นำเข้าข้อมูลจาก library
    if (library.instructions && library.instructions.length > 0) {
      // ลบ _id เก่าและปรับปรุง timestamps
      const instructionsToInsert = library.instructions.map((instr) => {
        const { _id, ...instructionData } = instr;
        return {
          ...instructionData,
          restoredAt: new Date(),
          restoredFrom: date,
        };
      });

      await instrColl.insertMany(instructionsToInsert);
    }

    res.json({
      success: true,
      message: `คืนค่าข้อมูลจาก ${library.name || library.displayDate || date} เรียบร้อยแล้ว (${library.instructions.length} instructions)`,
      restoredCount: library.instructions.length,
    });
  } catch (err) {
    console.error("Restore error:", err);
    res.json({ success: false, error: err.message });
  }
});

// ============================ Excel Upload Routes ============================

// Route: Upload Excel file และแปลงเป็น instructions
app.post(
  "/admin/instructions/upload-excel",
  upload.single("excelFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาเลือกไฟล์ Excel" });
      }

      console.log(
        `[Excel] เริ่มประมวลผลไฟล์: ${req.file.originalname} (${req.file.size} bytes)`,
      );

      // ประมวลผลไฟล์ Excel
      const instructions = processExcelToInstructions(
        req.file.buffer,
        req.file.originalname,
      );

      if (instructions.length === 0) {
        return res.status(400).json({
          success: false,
          error: "ไม่พบข้อมูลในไฟล์ Excel หรือข้อมูลไม่ถูกต้อง",
        });
      }

      // บันทึก instructions ทั้งหมดลงฐานข้อมูล
      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("instructions");

      const insertPromises = instructions.map((instruction) => {
        instruction.createdAt = new Date();
        instruction.order = Date.now() + Math.random(); // เพื่อให้ไม่ซ้ำกัน
        return coll.insertOne(instruction);
      });

      await Promise.all(insertPromises);

      console.log(
        `[Excel] บันทึก ${instructions.length} instructions เรียบร้อยแล้ว`,
      );

      res.json({
        success: true,
        message: `อัพโหลดและประมวลผลเรียบร้อย! สร้าง ${instructions.length} instruction จาก ${instructions.length} แท็บ`,
        instructionsCount: instructions.length,
        sheets: instructions.map((i) => ({
          title: i.title,
          type: i.type,
          sheetName: i.sheetName,
        })),
      });
    } catch (error) {
      console.error("[Excel] ข้อผิดพลาดในการอัพโหลด:", error);

      let errorMessage = "เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel";
      if (error.message.includes("Unsupported file type")) {
        errorMessage =
          "ประเภทไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls)";
      } else if (error.message.includes("File too large")) {
        errorMessage = "ไฟล์มีขนาดใหญ่เกินไป (ไม่เกิน 10MB)";
      } else if (error.message.includes("กรุณาเลือกไฟล์ Excel เท่านั้น")) {
        errorMessage = error.message;
      }

      res.status(400).json({ success: false, error: errorMessage });
    }
  },
);

// Route: Get preview ของไฟล์ Excel ก่อนอัพโหลด (ไม่บันทึกลงฐานข้อมูล)
app.post(
  "/admin/instructions/preview-excel",
  upload.single("excelFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาเลือกไฟล์ Excel" });
      }

      // ประมวลผลไฟล์ Excel แต่ไม่บันทึก
      const instructions = processExcelToInstructions(
        req.file.buffer,
        req.file.originalname,
      );

      res.json({
        success: true,
        preview: instructions.map((instruction) => ({
          title: instruction.title,
          type: instruction.type,
          sheetName: instruction.sheetName,
          contentPreview:
            instruction.type === "text"
              ? instruction.content.substring(0, 200) +
                (instruction.content.length > 200 ? "..." : "")
              : `ตาราง ${instruction.data.rows ? instruction.data.rows.length : 0} แถว, ${instruction.data.columns ? instruction.data.columns.length : 0} คอลัมน์`,
          rowCount:
            instruction.data && instruction.data.rows
              ? instruction.data.rows.length
              : 0,
          columnCount:
            instruction.data && instruction.data.columns
              ? instruction.data.columns.length
              : 0,
        })),
      });
    } catch (error) {
      console.error("[Excel] ข้อผิดพลาดในการดูตัวอย่าง:", error);
      res.status(400).json({
        success: false,
        error: "ไม่สามารถดูตัวอย่างไฟล์ Excel ได้: " + error.message,
      });
    }
  },
);

// ============================ Admin Authentication ============================

app.get("/api/auth/session", (req, res) => {
  res.json({
    success: true,
    requirePasscode: isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE),
    user: getAdminUserContext(req),
  });
});

app.get("/admin/login", (req, res) => {
  if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
    return res.redirect("/admin/dashboard");
  }

  if (isAdminAuthenticated(req)) {
    return res.redirect("/admin/dashboard");
  }

  res.render("admin-login", {
    requirePasscode: true,
  });
});

app.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    if (!isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE)) {
      return res.status(400).json({
        success: false,
        error: "ยังไม่ได้เปิดใช้ระบบรหัสผ่าน",
      });
    }

    const { passcode } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const verifyResult = await verifyPasscode({
      db,
      passcode,
      masterPasscode: ADMIN_MASTER_PASSCODE,
      ipAddress: req.ip,
    });

    if (!verifyResult.valid) {
      return res.status(401).json({
        success: false,
        error: "รหัสผ่านไม่ถูกต้อง",
      });
    }

    registerAdminSession(req, verifyResult);
    res.json({
      success: true,
      user: getAdminUserContext(req),
    });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง",
    });
  }
});

app.post("/admin/logout", async (req, res) => {
  try {
    await destroyAdminSession(req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่",
    });
  }
});

app.use("/admin", enforceAdminLogin);

// ============================ Admin Passcode Management API ============================

app.get("/api/admin-passcodes", requireSuperadmin, async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const passcodes = await listPasscodes(db);
    res.json({ success: true, passcodes });
  } catch (err) {
    console.error("[Auth] List passcodes error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถโหลดรายการรหัสผ่านได้",
    });
  }
});

app.post("/api/admin-passcodes", requireSuperadmin, async (req, res) => {
  try {
    const { label, passcode } = req.body || {};
    const client = await connectDB();
    const db = client.db("chatbot");

    const sanitizedPasscode = sanitizePasscodeInput(passcode);
    if (
      isPasscodeFeatureEnabled(ADMIN_MASTER_PASSCODE) &&
      sanitizedPasscode &&
      sanitizedPasscode === ADMIN_MASTER_PASSCODE
    ) {
      return res.status(400).json({
        success: false,
        error: "ไม่สามารถใช้รหัสผ่านเดียวกับรหัสหลักของระบบได้",
      });
    }

    const doc = await createPasscode(db, {
      label: sanitizeLabelInput(label),
      passcode: sanitizedPasscode,
      createdBy: getAdminUserContext(req)?.role || "superadmin",
    });
    res.status(201).json({ success: true, passcode: doc });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err?.message || "ไม่สามารถสร้างรหัสผ่านใหม่ได้",
    });
  }
});

app.patch(
  "/api/admin-passcodes/:id/toggle",
  requireSuperadmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body || {};
      const client = await connectDB();
      const db = client.db("chatbot");
      const doc = await togglePasscode(db, id, isActive !== false);
      res.json({ success: true, passcode: doc });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err?.message || "ไม่สามารถปรับสถานะรหัสผ่านได้",
      });
    }
  },
);

app.delete("/api/admin-passcodes/:id", requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    await deletePasscode(db, id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err?.message || "ไม่สามารถลบรหัสผ่านได้",
    });
  }
});

// ============================ Admin UI Routes ============================

// Redirect root admin to dashboard (ตรวจสอบการล็อกอินผ่าน middleware แล้ว)
app.get("/admin", (req, res) => {
  res.redirect("/admin/dashboard");
});

// ============================ Line Bot Management API ============================

// Dynamic Line Bot webhook handler
app.post("/webhook/line/:botId", async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const escapeRegex = (value = "") =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedBotId = escapeRegex(botId);
    const queryConditions = [
      { webhookUrl: { $regex: `${escapedBotId}$`, $options: "i" } },
    ];

    if (ObjectId.isValid(botId)) {
      queryConditions.push({ _id: new ObjectId(botId) });
    }

    const lineBot = await coll.findOne({ $or: queryConditions });

    if (!lineBot || lineBot.status !== "active") {
      return res.status(404).json({ error: "Line Bot ไม่พบหรือไม่เปิดใช้งาน" });
    }

    // Create Line client for this bot
    const lineConfig = {
      channelAccessToken: lineBot.channelAccessToken,
      channelSecret: lineBot.channelSecret,
    };
    const lineClient = new line.Client(lineConfig);

    // Handle Line webhook events
    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    if (events.length === 0) {
      console.warn(
        `[Line Bot Webhook] Received request without events for identifier: ${botId}`,
      );
      return res.status(200).json({ status: "NO_EVENTS" });
    }

    const queueOptions = {
      botType: "line",
      platform: "line",
      botId: lineBot._id ? lineBot._id.toString() : null,
      lineBotId: lineBot._id ? lineBot._id.toString() : botId,
      lineClient,
      channelAccessToken: lineBot.channelAccessToken,
      channelSecret: lineBot.channelSecret,
      aiModel: lineBot.aiModel || null,
      selectedInstructions: lineBot.selectedInstructions || [],
      selectedImageCollections: lineBot.selectedImageCollections || null,
    };

    for (const event of events) {
      try {
        await handleLineEvent(event, queueOptions);
      } catch (eventError) {
        console.error(
          `[Line Bot: ${lineBot.name}] Error handling event:`,
          eventError,
        );
      }
    }

    res.json({ status: "OK" });
  } catch (err) {
    console.error("Error handling Line webhook:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผล webhook" });
  }
});

// ============================ Facebook Bot Webhook Handler ============================

// Facebook Webhook verification (GET) and events (POST)
app.get("/webhook/facebook/:botId", async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // Find the Facebook Bot by ID
    const facebookBot = ObjectId.isValid(botId)
      ? await coll.findOne({ _id: new ObjectId(botId) })
      : null;

    if (!facebookBot || facebookBot.status !== "active") {
      // สำหรับขั้นตอน verify อนุญาต status อื่น ๆ ได้
      if (!facebookBot) {
        return res.status(404).send("Facebook Bot not found");
      }
    }

    // Handle Facebook webhook verification
    if (req.query["hub.mode"] === "subscribe") {
      if (req.query["hub.verify_token"] === facebookBot.verifyToken) {
        return res.status(200).send(req.query["hub.challenge"]);
      } else {
        console.warn(
          `[Facebook Bot: ${facebookBot.name}] Invalid verify token received: ${req.query["hub.verify_token"]}`,
        );
      }
    }

    return res.status(400).send("Invalid verification request");
  } catch (err) {
    console.error("Error handling Facebook webhook verification:", err);
    res.status(500).send("Server error");
  }
});

// Dynamic Facebook Bot webhook handler (POST events)
app.post("/webhook/facebook/:botId", async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // Find the Facebook Bot by ID
    const facebookBot = ObjectId.isValid(botId)
      ? await coll.findOne({ _id: new ObjectId(botId) })
      : null;

    if (!facebookBot || facebookBot.status !== "active") {
      return res
        .status(404)
        .json({ error: "Facebook Bot ไม่พบหรือไม่เปิดใช้งาน" });
    }

    const pageId = facebookBot._id.toString();
    const accessToken = facebookBot.accessToken;

    const queueOptionsBase = {
      botType: "facebook",
      platform: "facebook",
      botId: facebookBot._id ? facebookBot._id.toString() : null,
      facebookAccessToken: facebookBot.accessToken,
      aiModel: facebookBot.aiModel || null,
      selectedInstructions: facebookBot.selectedInstructions || [],
      selectedImageCollections: facebookBot.selectedImageCollections || null,
    };

    // Respond immediately to avoid Facebook retries
    res.status(200).json({ status: "EVENT_RECEIVED" });

    // Process webhook events asynchronously
    if (req.body.object === "page") {
      for (let entry of req.body.entry) {
        // Handle comment events
        if (entry.changes) {
          for (let change of entry.changes) {
            if (change.field === "feed" && change.value) {
              const value = change.value;

              // Handle new comments
              if (value.item === "comment" && value.verb === "add") {
                const postId = value.post_id;
                const commentData = {
                  id: value.comment_id,
                  message: value.message,
                  from: value.from,
                };

                // Process comment asynchronously
                handleFacebookComment(
                  pageId,
                  postId,
                  commentData,
                  accessToken,
                ).catch((err) => {
                  console.error(
                    "[Facebook Webhook] Error processing comment:",
                    err,
                  );
                });
              }
            }
          }
        }

        // Handle messaging events (existing code)
        for (let messagingEvent of entry.messaging) {
          // จัดการข้อความที่ส่งจากเพจเอง (echo) – ถือว่าเป็นข้อความจากแอดมินเพจ
          if (messagingEvent.message?.is_echo) {
            try {
              const targetUserId = messagingEvent.recipient?.id; // ผู้ใช้ปลายทางของข้อความจากเพจ
              const text = messagingEvent.message?.text?.trim();
              const metadata = messagingEvent.message?.metadata || "";

              // ข้ามข้อความที่ระบบส่งอัตโนมัติ (เช่น AI / follow-up) เพื่อหลีกเลี่ยงการบันทึกซ้ำ
              const automatedMetadata = ["ai_generated", "follow_up_auto"];
              if (metadata && automatedMetadata.includes(metadata)) {
                console.log(
                  `[Facebook Bot: ${facebookBot.name}] Skip echo for automated message (${metadata}) to ${targetUserId}`,
                );
                continue;
              }

              if (!targetUserId) {
                continue;
              }

              const client = await connectDB();
              const db = client.db("chatbot");
              const coll = db.collection("chat_history");

              // ตรวจสอบ keyword actions ก่อน (เช่น เปิด/ปิด AI, ปิดระบบติดตาม)
              const keywordResult = await detectKeywordAction(
                text,
                facebookBot.keywordSettings || {},
                targetUserId,
                "facebook",
                facebookBot._id?.toString?.() || null,
                true, // isFromAdmin = true
              );

              if (keywordResult.action) {
                // ถ้ามี keyword action และต้องการส่งข้อความตอบกลับ
                if (keywordResult.sendResponse && keywordResult.message) {
                  const controlDoc = {
                    senderId: targetUserId,
                    role: "assistant",
                    content: `[ระบบ] ${keywordResult.message}`,
                    timestamp: new Date(),
                    source: "admin_chat",
                    platform: "facebook",
                    botId: facebookBot?._id?.toString?.() || null,
                  };
                  const controlInsertResult = await coll.insertOne(controlDoc);
                  if (controlInsertResult?.insertedId) {
                    controlDoc._id = controlInsertResult.insertedId;
                  }
                  await appendOrderExtractionMessage(controlDoc);

                  try {
                    await resetUserUnreadCount(targetUserId);
                  } catch (_) {}

                  // แจ้ง UI แอดมินแบบเรียลไทม์
                  try {
                    io.emit("newMessage", {
                      userId: targetUserId,
                      message: controlDoc,
                      sender: "assistant",
                      timestamp: controlDoc.timestamp,
                    });
                  } catch (_) {}
                }
                continue;
              }

              // คำสั่งควบคุม [ปิด]/[เปิด] (legacy)
              if (text === "[ปิด]" || text === "[เปิด]") {
                const enable = text === "[เปิด]";
                await setUserStatus(targetUserId, enable);

                const controlText = enable
                  ? "เปิด AI สำหรับผู้ใช้นี้แล้ว"
                  : "ปิด AI สำหรับผู้ใช้นี้ชั่วคราวแล้ว";
                const controlDoc = {
                  senderId: targetUserId,
                  role: "assistant",
                  content: `[ระบบ] ${controlText}`,
                  timestamp: new Date(),
                  source: "admin_chat",
                  platform: "facebook",
                  botId: facebookBot?._id?.toString?.() || null,
                };
                const controlInsertResult = await coll.insertOne(controlDoc);
                if (controlInsertResult?.insertedId) {
                  controlDoc._id = controlInsertResult.insertedId;
                }
                await appendOrderExtractionMessage(controlDoc);

                try {
                  await resetUserUnreadCount(targetUserId);
                } catch (_) {}

                // แจ้ง UI แอดมินแบบเรียลไทม์
                try {
                  io.emit("newMessage", {
                    userId: targetUserId,
                    message: controlDoc,
                    sender: "assistant",
                    timestamp: controlDoc.timestamp,
                  });
                } catch (_) {}
              } else {
                // บันทึกข้อความจากแอดมินเพจเป็น assistant (เฉพาะกรณีไม่ใช่คำสั่ง)
                const baseDoc = {
                  senderId: targetUserId,
                  role: "assistant",
                  content: text || "ไฟล์แนบ",
                  timestamp: new Date(),
                  source: "admin_chat", // ใช้ค่าเดียวกับแอดมินหน้าเว็บ เพื่อให้ UI แสดงเป็น "แอดมิน"
                  platform: "facebook",
                  botId: facebookBot?._id?.toString?.() || null,
                };
                const baseInsertResult = await coll.insertOne(baseDoc);
                if (baseInsertResult?.insertedId) {
                  baseDoc._id = baseInsertResult.insertedId;
                }
                await appendOrderExtractionMessage(baseDoc);
                // ข้อความทั่วไปจากแอดมินเพจ – อัปเดต UI และ unread count
                try {
                  await resetUserUnreadCount(targetUserId);
                } catch (_) {}
                try {
                  io.emit("newMessage", {
                    userId: targetUserId,
                    message: baseDoc,
                    sender: "assistant",
                    timestamp: baseDoc.timestamp,
                  });
                } catch (_) {}
              }
            } catch (echoErr) {
              console.error(
                `[Facebook Bot: ${facebookBot.name}] Error handling admin echo:`,
                echoErr.message,
              );
            }
            continue;
          }

          if (messagingEvent.message) {
            const senderId = messagingEvent.sender.id;
            try {
              await ensureFacebookProfileDisplayName(
                senderId,
                facebookBot.accessToken,
              );
            } catch (profileErr) {
              console.warn(
                `[Facebook Bot: ${facebookBot.name}] อัปเดตโปรไฟล์ ${senderId} ไม่สำเร็จ:`,
                profileErr?.message || profileErr,
              );
            }
            const queueOptions = { ...queueOptionsBase };
            const itemsToQueue = [];
            const audioAttachments = [];
            const messageText = messagingEvent.message.text;

            if (messageText) {
              itemsToQueue.push({
                data: { type: "text", text: messageText },
              });
            }

            if (messagingEvent.message.attachments) {
              for (const attachment of messagingEvent.message.attachments) {
                if (attachment.type === "image" && attachment.payload?.url) {
                  try {
                    const base64 = await fetchFacebookImageAsBase64(
                      attachment.payload.url,
                    );
                    itemsToQueue.push({
                      data: {
                        type: "image",
                        base64,
                        text: "ผู้ใช้ส่งรูปภาพมา",
                      },
                    });
                  } catch (imgErr) {
                    console.error(
                      `[Facebook Bot: ${facebookBot.name}] Error fetching image:`,
                      imgErr.message,
                    );
                  }
                } else if (attachment.type === "audio") {
                  audioAttachments.push({
                    type: "audio",
                    payload: {
                      url: attachment.payload?.url || null,
                      id: attachment.payload?.id || null,
                      duration: attachment.payload?.duration || null,
                    },
                  });
                }
              }
            }

            if (audioAttachments.length > 0) {
              try {
                const audioResponseSetting = await getSettingValue(
                  "audioAttachmentResponse",
                  DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
                );
                const replyText =
                  audioResponseSetting || DEFAULT_AUDIO_ATTACHMENT_RESPONSE;
                const filteredReply = await filterMessage(replyText);
                await sendFacebookMessage(
                  senderId,
                  filteredReply,
                  facebookBot.accessToken,
                  { metadata: "ai_generated" },
                );
                try {
                  await saveChatHistory(
                    senderId,
                    { type: "audio", attachments: audioAttachments },
                    filteredReply,
                    "facebook",
                    facebookBot._id ? facebookBot._id.toString() : null,
                  );
                } catch (historyErr) {
                  console.error(
                    `[Facebook Bot: ${facebookBot.name}] ไม่สามารถบันทึกประวัติไฟล์เสียงได้:`,
                    historyErr.message || historyErr,
                  );
                }
              } catch (audioErr) {
                console.error(
                  `[Facebook Bot: ${facebookBot.name}] Error handling audio attachment:`,
                  audioErr.message || audioErr,
                );
              }
            }

            if (itemsToQueue.length === 0) {
              if (audioAttachments.length === 0) {
                await sendFacebookMessage(
                  senderId,
                  "ขออภัย ระบบยังไม่รองรับไฟล์ประเภทนี้",
                  facebookBot.accessToken,
                  { metadata: "ai_generated" },
                );
              }
              continue;
            }

            console.log(
              `[Facebook Bot: ${facebookBot.name}] รับข้อความเข้าคิวจาก ${senderId}: ${messageText || "[มีรูปภาพ]"}`,
            );

            for (const item of itemsToQueue) {
              try {
                await addToQueue(senderId, { ...item }, queueOptions);
              } catch (queueErr) {
                console.error(
                  `[Facebook Bot: ${facebookBot.name}] Error queuing message:`,
                  queueErr,
                );
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error handling Facebook webhook:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผล webhook" });
    }
  }
});

// Helper function to send Facebook message
async function sendFacebookMessage(
  recipientId,
  message,
  accessToken,
  options = {},
  customAssetsMap = null,
) {
  const {
    metadata = null,
    messagingType = null,
    tag = null,
    selectedImageCollections = null,
  } = options || {};
  // แยกข้อความตามตัวแบ่ง [cut] → จากนั้น parse #[IMAGE:<label>] เป็น segments
  const parts = String(message)
    .split("[cut]")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // ใช้ customAssetsMap ถ้ามี ไม่เช่นนั้นดึงจาก database
  const assetsMap =
    customAssetsMap || (await getAssetsMapForBot(selectedImageCollections));
  const maxLength = 2000;

  for (const part of parts) {
    const segments = parseMessageSegmentsByImageTokens(part, assetsMap);
    for (const seg of segments) {
      if (seg.type === "text") {
        const text = seg.text || "";
        // chunk text to maxLength
        for (let i = 0; i < text.length; i += maxLength) {
          const chunk = text.slice(i, i + maxLength);
          if (!chunk.trim()) continue;
          try {
            const payload = { text: chunk };
            if (metadata) {
              payload.metadata = metadata;
            }
            const body = {
              recipient: { id: recipientId },
              message: payload,
            };
            if (messagingType) {
              body.messaging_type = messagingType;
            }
            if (tag) {
              body.tag = tag;
            }
            const response = await axios.post(
              `https://graph.facebook.com/v18.0/me/messages`,
              body,
              {
                params: { access_token: accessToken },
                headers: { "Content-Type": "application/json" },
              },
            );
            console.log(
              "Facebook text sent:",
              response.data?.message_id || "ok",
            );
          } catch (error) {
            const status = error.response?.status;
            const fbMessage =
              error.response?.data?.error?.message || error.message;
            const conciseError = status
              ? `Facebook API ${status}: ${fbMessage}`
              : fbMessage;
            console.error("Error sending Facebook text:", conciseError);
            throw new Error(conciseError);
          }
        }
      } else if (seg.type === "image") {
        const mode = await getSettingValue("facebookImageSendMode", "upload");
        const tryUploadFirst = mode === "upload";
        let sent = false;
        const sendByUrl = async () => {
          const messagePayload = {
            attachment: {
              type: "image",
              payload: { url: seg.url, is_reusable: true },
            },
          };
          if (metadata) {
            messagePayload.metadata = metadata;
          }
          const body = {
            recipient: { id: recipientId },
            message: messagePayload,
          };
          if (messagingType) {
            body.messaging_type = messagingType;
          }
          if (tag) {
            body.tag = tag;
          }
          const response = await axios.post(
            `https://graph.facebook.com/v18.0/me/messages`,
            body,
            {
              params: { access_token: accessToken },
              headers: { "Content-Type": "application/json" },
            },
          );
          console.log(
            "Facebook image sent (url):",
            response.data?.message_id || "ok",
            seg.label,
          );
        };
        const sendByUpload = async () => {
          await sendFacebookImageByUpload(recipientId, seg, accessToken, {
            metadata,
            messagingType,
            tag,
          });
          console.log("Facebook image sent (upload):", seg.label);
        };
        try {
          if (tryUploadFirst) {
            await sendByUpload();
          } else {
            await sendByUrl();
          }
          sent = true;
        } catch (firstErr) {
          console.error(
            `Facebook image ${tryUploadFirst ? "upload" : "url"} mode failed:`,
            firstErr?.message || firstErr,
          );
          try {
            if (tryUploadFirst) {
              await sendByUrl();
            } else {
              await sendByUpload();
            }
            sent = true;
          } catch (secondErr) {
            console.error(
              "Facebook image both modes failed:",
              secondErr?.message || secondErr,
            );
            const alt = seg.alt ? `\n(รูป: ${seg.alt})` : "";
            try {
              const fallbackPayload = {
                text: `[ไม่สามารถส่งรูป ${seg.label}]${alt}`,
              };
              if (metadata) {
                fallbackPayload.metadata = metadata;
              }
              const body = {
                recipient: { id: recipientId },
                message: fallbackPayload,
              };
              if (messagingType) {
                body.messaging_type = messagingType;
              }
              if (tag) {
                body.tag = tag;
              }
              await axios.post(
                `https://graph.facebook.com/v18.0/me/messages`,
                body,
                {
                  params: { access_token: accessToken },
                  headers: { "Content-Type": "application/json" },
                },
              );
            } catch (_) {}
          }
        }
      }
    }
  }
}

// Upload image to Facebook to obtain attachment_id, then send it
async function sendFacebookImageMessage(
  recipientId,
  image,
  accessToken,
  options = {},
) {
  const { metadata = null, messagingType = null, tag = null } = options || {};
  if (!image || !image.url) {
    throw new Error("ไม่มี URL สำหรับรูปภาพ");
  }

  console.log("[FollowUp Debug] Sending Facebook image:", {
    recipientId,
    imageUrl: image.url,
    previewUrl: image.previewUrl || image.thumbUrl,
    hasMetadata: !!metadata,
  });

  try {
    const messagePayload = {
      attachment: {
        type: "image",
        payload: {
          url: image.url,
          is_reusable: true,
        },
      },
    };
    if (metadata) {
      messagePayload.metadata = metadata;
    }
    const body = {
      recipient: { id: recipientId },
      message: messagePayload,
    };
    if (messagingType) {
      body.messaging_type = messagingType;
    }
    if (tag) {
      body.tag = tag;
    }
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      body,
      {
        params: { access_token: accessToken },
        headers: { "Content-Type": "application/json" },
      },
    );
    console.log(
      "[FollowUp Debug] Facebook image sent successfully:",
      response.data?.message_id || "ok",
    );
  } catch (error) {
    const status = error.response?.status;
    const fbMessage = error.response?.data?.error?.message || error.message;
    const fbErrorCode = error.response?.data?.error?.code;
    const conciseError = status
      ? `Facebook API ${status}: ${fbMessage}`
      : fbMessage;
    console.error("[FollowUp Error] Facebook image send failed:", {
      recipientId,
      imageUrl: image.url,
      status,
      errorCode: fbErrorCode,
      message: fbMessage,
    });
    throw new Error(conciseError);
  }
}

async function sendFacebookImageByUpload(
  recipientId,
  seg,
  accessToken,
  options = {},
) {
  const { metadata = null, messagingType = null, tag = null } = options || {};
  const { buffer, filename, contentType } =
    await readInstructionAssetBuffer(seg);

  const form = new FormData();
  form.append(
    "message",
    JSON.stringify({
      attachment: { type: "image", payload: { is_reusable: true } },
    }),
  );
  form.append("filedata", buffer, { filename, contentType });

  // 1) Upload attachment to get attachment_id
  const uploadRes = await axios.post(
    `https://graph.facebook.com/v18.0/me/message_attachments`,
    form,
    {
      params: { access_token: accessToken },
      headers: form.getHeaders(),
    },
  );
  const attachment_id = uploadRes.data?.attachment_id;
  if (!attachment_id) throw new Error("ไม่ได้รับ attachment_id จาก Facebook");

  // 2) Send the message referencing attachment_id
  const messagePayload = {
    attachment: { type: "image", payload: { attachment_id } },
  };
  if (metadata) {
    messagePayload.metadata = metadata;
  }
  const body = {
    recipient: { id: recipientId },
    message: messagePayload,
  };
  if (messagingType) {
    body.messaging_type = messagingType;
  }
  if (tag) {
    body.tag = tag;
  }
  await axios.post(`https://graph.facebook.com/v22.0/me/messages`, body, {
    params: { access_token: accessToken },
    headers: { "Content-Type": "application/json" },
  });
}

// Helper: read local asset buffer robustly (handle ext variants and URL fallback)
async function readInstructionAssetBuffer(seg) {
  const label = seg.label || "";
  const requestedFileName = seg.fileName || "";
  let assetDoc = null;

  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");

    if (label) {
      // ค้นหาด้วย label ก่อน (รองรับทั้งภาษาไทยและอังกฤษ)
      assetDoc = await coll.findOne({ label });

      // ถ้าไม่เจอ ลองค้นหาด้วย slug (กรณีที่ส่ง slug มาแทน label)
      if (!assetDoc) {
        assetDoc = await coll.findOne({ slug: label });
      }
    }
    if (!assetDoc && requestedFileName) {
      assetDoc = await coll.findOne({
        $or: [
          { fileName: requestedFileName },
          { thumbFileName: requestedFileName },
        ],
      });
    }

    if (assetDoc) {
      const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });
      const useThumb =
        requestedFileName &&
        (requestedFileName === assetDoc.thumbFileName ||
          requestedFileName.endsWith("_thumb.jpg"));
      const targetFileName = useThumb
        ? assetDoc.thumbFileName || `${assetDoc.label}_thumb.jpg`
        : assetDoc.fileName || `${assetDoc.label}.jpg`;
      const targetId = useThumb ? assetDoc.thumbFileId : assetDoc.fileId;
      let downloadStream = null;

      if (targetId) {
        const objectId = toObjectId(targetId);
        if (objectId) {
          downloadStream = bucket.openDownloadStream(objectId);
        }
      }

      if (!downloadStream) {
        downloadStream = bucket.openDownloadStreamByName(targetFileName);
      }

      const buffer = await streamToBuffer(downloadStream);
      let contentType = assetDoc.mime || "image/jpeg";
      if (!assetDoc.mime) {
        const ext = path.extname(targetFileName).toLowerCase();
        if (ext === ".png") contentType = "image/png";
        else if (ext === ".webp") contentType = "image/webp";
      }

      return {
        buffer,
        filename: targetFileName,
        contentType,
      };
    }
  } catch (err) {
    console.warn(
      "[Assets] read buffer from MongoDB failed, fallback to filesystem/url:",
      err?.message || err,
    );
  }

  const baseDir = ASSETS_DIR;
  const tryFiles = [];
  if (requestedFileName) tryFiles.push(requestedFileName);
  if (label) {
    tryFiles.push(
      `${label}.jpg`,
      `${label}.jpeg`,
      `${label}.png`,
      `${label}.webp`,
      `${label}_thumb.jpg`,
    );
  }

  for (const name of tryFiles) {
    const p = path.join(baseDir, name);
    try {
      if (fs.existsSync(p)) {
        const b = fs.readFileSync(p);
        const ext = path.extname(p).toLowerCase().replace(".", "") || "jpg";
        const ct =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : "image/jpeg";
        return { buffer: b, filename: name, contentType: ct };
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (seg.url) {
    const resp = await axios.get(seg.url, { responseType: "arraybuffer" });
    const b = Buffer.from(resp.data);
    const urlExt = (seg.url.split(".").pop() || "jpg").toLowerCase();
    const ct = urlExt.startsWith("png")
      ? "image/png"
      : urlExt.startsWith("webp")
        ? "image/webp"
        : "image/jpeg";
    return {
      buffer: b,
      filename: seg.fileName || `${label || "image"}.jpg`,
      contentType: ct,
    };
  }

  throw new Error(
    "อ่านไฟล์รูปภาพไม่สำเร็จ: ไม่พบไฟล์ในระบบและไม่มี URL ให้ดึง",
  );
}

// Helper to download and optimize Facebook image to base64
async function fetchFacebookImageAsBase64(url) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  let buffer = Buffer.from(response.data, "binary");
  try {
    buffer = await sharp(buffer)
      .resize({
        width: 1024,
        height: 1024,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
  } catch (err) {
    console.error("Error processing Facebook image:", err.message);
  }
  return buffer.toString("base64");
}

// Convert table instruction data to a JSON string
function tableInstructionToJSON(instruction) {
  if (!instruction || instruction.type !== "table") return "";

  const columns = Array.isArray(instruction?.data?.columns)
    ? instruction.data.columns
    : [];
  const rowSource = Array.isArray(instruction?.data?.rows)
    ? instruction.data.rows
    : [];

  const normalizedColumns = columns.map((col) => {
    if (col === null || col === undefined) return "";
    return String(col);
  });

  const normalizedRows = rowSource.map((row) => {
    if (Array.isArray(row)) {
      return row.map((cell) => {
        if (cell === null || cell === undefined) return "";
        return String(cell).replace(/\r\n/g, "\n");
      });
    }
    if (row && typeof row === "object") {
      return normalizedColumns.map((col, idx) => {
        const key = col && col.trim() ? col : `column_${idx + 1}`;
        const value = row[col] ?? row[key] ?? row[idx] ?? "";
        return String(value).replace(/\r\n/g, "\n");
      });
    }
    return [String(row ?? "")];
  });

  const toIsoString = (value) => {
    if (!value) return undefined;
    try {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return undefined;
      return date.toISOString();
    } catch {
      return undefined;
    }
  };

  const payload = {
    instructionId:
      instruction.instructionId ||
      (instruction._id ? instruction._id.toString() : undefined),
    version: Number.isInteger(instruction.version)
      ? instruction.version
      : undefined,
    type: "table",
    title: instruction.title || undefined,
    content: instruction.content || undefined,
    createdAt: toIsoString(instruction.createdAt),
    updatedAt: toIsoString(instruction.updatedAt),
    data: {
      columns: normalizedColumns,
      rows: normalizedRows,
    },
  };

  if (!payload.instructionId) {
    delete payload.instructionId;
  }
  if (!payload.title || !payload.title.trim()) {
    delete payload.title;
  }
  if (!payload.content || !payload.content.trim()) {
    delete payload.content;
  }
  if (!payload.createdAt) {
    delete payload.createdAt;
  }
  if (!payload.updatedAt) {
    delete payload.updatedAt;
  }
  if (payload.version === undefined) {
    delete payload.version;
  }

  return JSON.stringify(payload, null, 2);
}

// Build system prompt text from selected instruction libraries
function buildSystemPromptFromLibraries(libraries) {
  const allInstructions = libraries.flatMap((lib) => lib.instructions || []);
  const parts = allInstructions
    .map((inst) => {
      if (inst.type === "table") {
        return tableInstructionToJSON(inst);
      }
      return inst.content || "";
    })
    .filter((text) => text && text.trim() !== "");
  return parts.join("\n\n");
}

// Helper function to process Facebook message with AI
async function processFacebookMessageWithAI(
  contentSequence,
  userId,
  facebookBot,
) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const aiModel = facebookBot.aiModel || "gpt-5";

    let systemPrompt = "คุณเป็น AI Assistant ที่ช่วยตอบคำถามผู้ใช้";
    const fbSelections = normalizeInstructionSelections(
      facebookBot.selectedInstructions || [],
    );
    if (fbSelections.length > 0) {
      const prompt = await buildSystemPromptFromSelections(fbSelections, db);
      if (prompt.trim()) {
        systemPrompt = prompt.trim();
      }
    }

    // เพิ่มคำแนะนำเกี่ยวกับการแทรกรูปภาพด้วยแท็ก #[IMAGE:<label>]
    const assetsText = await getAssetsInstructionsText();
    if (assetsText) {
      systemPrompt = `${systemPrompt}\n\n${assetsText}`;
    }

    const history = await getAIHistory(userId);

    const recoveryStrategies = [
      { key: "original", label: "ข้อมูลเดิมทั้งหมด" },
      { key: "drop_invalid_images", label: "ลบรูปภาพที่อาจมีปัญหา" },
      { key: "recent_text_only", label: "ใช้เฉพาะข้อความล่าสุดที่ใช้ได้" },
    ];

    const baseSequence = Array.isArray(contentSequence)
      ? contentSequence
      : [];

    let assistantReply = "";

    for (
      let attemptIndex = 0;
      attemptIndex < recoveryStrategies.length && !assistantReply;
      attemptIndex++
    ) {
      const strategy = recoveryStrategies[attemptIndex];
      const { sequence: sanitizedSequence, textParts, meta } =
        filterContentSequenceForStrategy(baseSequence, strategy.key);

      if (!sanitizedSequence.length) {
        console.warn(
          `[Facebook AI] กลยุทธ์ "${strategy.label}" ไม่มีข้อมูลสำหรับผู้ใช้ ${userId} ข้ามไปยังกลยุทธ์ถัดไป`,
        );
        continue;
      }

      const hasImages = sanitizedSequence.some((item) => item.type === "image");
      const combinedText = textParts.join("\n\n");

      if (!hasImages && !combinedText) {
        console.warn(
          `[Facebook AI] กลยุทธ์ "${strategy.label}" ไม่เหลือข้อความหรือรูปภาพหลังจัดการสำหรับผู้ใช้ ${userId}`,
        );
        continue;
      }

      if (
        meta.droppedImages > 0 ||
        meta.droppedTexts > 0 ||
        meta.droppedOthers > 0 ||
        meta.suspectImages > 0
      ) {
        const adjustments = [];
        if (meta.droppedImages > 0) {
          adjustments.push(`ลบรูปภาพ ${meta.droppedImages} รายการ`);
        }
        if (meta.suspectImages > 0) {
          adjustments.push(`พบรูปภาพที่ต้องจับตา ${meta.suspectImages} รายการ`);
        }
        if (meta.droppedTexts > 0) {
          adjustments.push(`ลบข้อความ ${meta.droppedTexts} รายการ`);
        }
        if (meta.droppedOthers > 0) {
          adjustments.push(`ละเว้นข้อมูลอื่น ${meta.droppedOthers} รายการ`);
        }
        console.log(
          `[Facebook AI] กลยุทธ์ "${strategy.label}" ปรับข้อมูล: ${adjustments.join(", ")}`,
        );
      }

      if (hasImages) {
        const imageCount = sanitizedSequence.filter((i) => i.type === "image").length;
        console.log(
          `[Facebook AI] ประมวลผลแบบ multimodal (กลยุทธ์ ${strategy.label}, รอบที่ ${attemptIndex + 1}/${recoveryStrategies.length}) ภาพ ${imageCount} รูป`,
        );
        assistantReply = await getAssistantResponseMultimodal(
          systemPrompt,
          history,
          sanitizedSequence,
          aiModel,
        );
      } else {
        const preview = combinedText.substring(0, 100);
        console.log(
          `[Facebook AI] ประมวลผลข้อความ (กลยุทธ์ ${strategy.label}, รอบที่ ${attemptIndex + 1}/${recoveryStrategies.length}): ${preview}${combinedText.length > 100 ? "..." : ""}`,
        );
        assistantReply = await getAssistantResponseTextOnly(
          systemPrompt,
          history,
          combinedText,
          aiModel,
        );
      }

      if (!assistantReply) {
        console.warn(
          `[Facebook AI] กลยุทธ์ "${strategy.label}" ไม่สามารถสร้างคำตอบสำหรับผู้ใช้ ${userId}`,
        );
      }
    }

    assistantReply = await filterMessage(assistantReply);

    // ดึงข้อความจากแท็ก THAI_REPLY ถ้ามี
    const finalReply = extractThaiReply(assistantReply);

    await saveChatHistory(
      userId,
      contentSequence,
      assistantReply,
      "facebook",
      facebookBot._id ? facebookBot._id.toString() : null,
    );

    return finalReply.trim();
  } catch (error) {
    console.error("Error processing Facebook message with AI:", error);
    return "";
  }
}

// Helper function to process message with AI
async function processMessageWithAI(message, userId, lineBot) {
  const aiModel = lineBot.aiModel || "gpt-5";
  const lineSelections = normalizeInstructionSelections(
    lineBot.selectedInstructions || [],
  );

  let systemPrompt = "คุณเป็น AI Assistant ที่ช่วยตอบคำถามผู้ใช้";

  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    if (lineSelections.length > 0) {
      const prompt = await buildSystemPromptFromSelections(lineSelections, db);
      if (prompt.trim()) {
        systemPrompt = prompt.trim();
      }
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const messageVariants = [
      {
        label: "ต้นฉบับ",
        content: sanitizeTextValue(message, { maxLength: 8000 }),
      },
      {
        label: "ตัดครึ่งท้าย",
        content: sanitizeTextValue(message, {
          maxLength: 4000,
          keepTail: true,
        }),
      },
    ].filter((variant, index, arr) => {
      if (!variant.content) {
        return false;
      }
      if (index === 0) {
        return true;
      }
      return variant.content !== arr[index - 1].content;
    });

    if (messageVariants.length === 0) {
      console.warn(
        `[Line AI] ข้อความของผู้ใช้ ${userId} ไม่มีเนื้อหาที่สามารถส่งให้ AI ประมวลผลได้`,
      );
      return "";
    }

    for (let attemptIndex = 0; attemptIndex < messageVariants.length; attemptIndex++) {
      const variant = messageVariants[attemptIndex];
      const payloadMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: variant.content },
      ];

      try {
        console.log(
          `[Line AI] ประมวลผลข้อความ (${variant.label}, รอบที่ ${attemptIndex + 1}/${messageVariants.length}) สำหรับผู้ใช้ ${userId}`,
        );
        const response = await openai.chat.completions.create({
          model: aiModel,
          messages: payloadMessages,
        });

        let assistantReply = response.choices[0].message.content;
        if (typeof assistantReply !== "string") {
          assistantReply = JSON.stringify(assistantReply);
        }

        if (response.usage) {
          const usage = response.usage;
          const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens`;
          assistantReply += tokenInfo;
        }

        const finalReply = extractThaiReply(assistantReply);
        return finalReply.trim();
      } catch (error) {
        console.error(
          `[Line AI] เกิดข้อผิดพลาดระหว่างประมวลผล (${variant.label}, รอบที่ ${attemptIndex + 1}/${messageVariants.length}):`,
          error,
        );
      }
    }

    return "";
  } catch (error) {
    console.error("Error preparing AI request:", error);
    return "";
  }

}

// Get all Line Bots
app.get("/api/line-bots", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    const lineBots = await coll.find({}).sort({ createdAt: -1 }).toArray();
    res.json(lineBots);
  } catch (err) {
    console.error("Error fetching line bots:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Line Bot ได้" });
  }
});

// Get single Line Bot
app.get("/api/line-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    const lineBot = await coll.findOne({ _id: new ObjectId(id) });

    if (!lineBot) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json(lineBot);
  } catch (err) {
    console.error("Error fetching line bot:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Line Bot ได้" });
  }
});

// Create new Line Bot
app.post("/api/line-bots", async (req, res) => {
  try {
    const {
      name,
      description,
      channelAccessToken,
      channelSecret,
      webhookUrl,
      status,
      isDefault,
      selectedInstructions,
      selectedImageCollections,
    } = req.body;

    if (!name || !channelAccessToken || !channelSecret) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany({}, { $set: { isDefault: false } });
    }

    // Generate unique webhook URL if not provided
    let finalWebhookUrl = webhookUrl;
    if (!finalWebhookUrl) {
      const baseUrl =
        process.env.PUBLIC_BASE_URL || "https://" + req.get("host");
      const uniqueId =
        Date.now().toString(36) + Math.random().toString(36).substr(2);
      finalWebhookUrl = `${baseUrl}/webhook/line/${uniqueId}`;
    }

    const normalizedSelections = normalizeInstructionSelections(
      selectedInstructions || [],
    );
    const normalizedCollections = normalizeImageCollectionSelections(
      selectedImageCollections || [],
    );

    const lineBot = {
      name,
      description: description || "",
      channelAccessToken,
      channelSecret,
      webhookUrl: finalWebhookUrl,
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: "gpt-5", // AI Model เฉพาะสำหรับ Line Bot นี้
      selectedInstructions: normalizedSelections,
      selectedImageCollections: normalizedCollections,
      keywordSettings: {
        enableAI: { keyword: "", response: "" },
        disableAI: { keyword: "", response: "" },
        disableFollowUp: { keyword: "", response: "" },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await coll.insertOne(lineBot);
    lineBot._id = result.insertedId;

    res.status(201).json(lineBot);
  } catch (err) {
    console.error("Error creating line bot:", err);
    res.status(500).json({ error: "ไม่สามารถสร้าง Line Bot ได้" });
  }
});

// Update Line Bot
app.put("/api/line-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      channelAccessToken,
      channelSecret,
      webhookUrl,
      status,
      isDefault,
      selectedImageCollections,
    } = req.body;

    if (!name || !channelAccessToken || !channelSecret) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany(
        { _id: { $ne: new ObjectId(id) } },
        { $set: { isDefault: false } },
      );
    }

    const updateData = {
      name,
      description: description || "",
      channelAccessToken,
      channelSecret,
      webhookUrl: webhookUrl || "",
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: req.body.aiModel || "gpt-5", // AI Model เฉพาะสำหรับ Line Bot นี้
      updatedAt: new Date(),
    };

    if (Array.isArray(selectedImageCollections)) {
      updateData.selectedImageCollections = normalizeImageCollectionSelections(
        selectedImageCollections,
      );
    } else if (selectedImageCollections === null) {
      updateData.selectedImageCollections = [];
    }

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({ message: "อัปเดต Line Bot เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error updating line bot:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดต Line Bot ได้" });
  }
});

// Delete Line Bot
app.delete("/api/line-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const result = await coll.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({ message: "ลบ Line Bot เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error deleting line bot:", err);
    res.status(500).json({ error: "ไม่สามารถลบ Line Bot ได้" });
  }
});

// Toggle Line Bot Status (Quick Enable/Disable)
app.patch("/api/line-bots/:id/toggle-status", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    // Get current bot
    const bot = await coll.findOne({ _id: new ObjectId(id) });
    if (!bot) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    // Toggle status: active <-> inactive
    const newStatus = bot.status === "active" ? "inactive" : "active";

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: newStatus, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({
      message: `เปลี่ยนสถานะ Line Bot เป็น ${newStatus === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"} เรียบร้อยแล้ว`,
      status: newStatus,
    });
  } catch (err) {
    console.error("Error toggling line bot status:", err);
    res.status(500).json({ error: "ไม่สามารถเปลี่ยนสถานะ Line Bot ได้" });
  }
});

// Test Line Bot
app.post("/api/line-bots/:id/test", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const lineBot = await coll.findOne({ _id: new ObjectId(id) });
    if (!lineBot) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    // Test Line Bot connection
    try {
      const lineConfig = {
        channelAccessToken: lineBot.channelAccessToken,
        channelSecret: lineBot.channelSecret,
      };
      const testClient = new line.Client(lineConfig);

      // Try to get bot profile (simple test)
      const profile = await testClient.getProfile();

      res.json({
        message: `ทดสอบ Line Bot สำเร็จ: ${profile.displayName}`,
        profile: profile,
      });
    } catch (lineError) {
      res.status(400).json({
        error: "ไม่สามารถเชื่อมต่อ Line Bot ได้: " + lineError.message,
      });
    }
  } catch (err) {
    console.error("Error testing line bot:", err);
    res.status(500).json({ error: "ไม่สามารถทดสอบ Line Bot ได้" });
  }
});

// Route: อัปเดต instruction ที่เลือกใช้ใน Line Bot
app.put("/api/line-bots/:id/instructions", async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedInstructions } = req.body;

    if (!Array.isArray(selectedInstructions)) {
      return res
        .status(400)
        .json({ error: "selectedInstructions ต้องเป็น array" });
    }

    const normalizedSelections =
      normalizeInstructionSelections(selectedInstructions);

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          selectedInstructions: normalizedSelections,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({ message: "อัปเดต instruction ที่เลือกใช้เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error updating line bot instructions:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถอัปเดต instruction ที่เลือกใช้ได้" });
  }
});

app.put("/api/line-bots/:id/image-collections", async (req, res) => {
  try {
    const { id } = req.params;
    let { selectedImageCollections } = req.body;

    if (selectedImageCollections === null) {
      selectedImageCollections = [];
    }

    if (!Array.isArray(selectedImageCollections)) {
      return res
        .status(400)
        .json({ error: "selectedImageCollections ต้องเป็น array หรือ null" });
    }

    const normalizedCollections = normalizeImageCollectionSelections(
      selectedImageCollections,
    );

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          selectedImageCollections: normalizedCollections,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({
      message: "อัปเดตคลังรูปภาพที่เลือกเรียบร้อยแล้ว",
      selectedImageCollections: normalizedCollections,
    });
  } catch (err) {
    console.error("Error updating line bot image collections:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถอัปเดตคลังรูปภาพของ Line Bot ได้" });
  }
});

// Route: อัปเดต keyword settings สำหรับ Line Bot
app.put("/api/line-bots/:id/keywords", async (req, res) => {
  try {
    const { id } = req.params;
    const { keywordSettings } = req.body;

    if (!keywordSettings || typeof keywordSettings !== "object") {
      return res.status(400).json({ error: "keywordSettings ต้องเป็น object" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    // รองรับทั้งรูปแบบเก่า (string) และใหม่ (object with keyword, response)
    const normalizeKeywordSetting = (setting) => {
      if (!setting) return { keyword: "", response: "" };
      if (typeof setting === "string") {
        return { keyword: setting.trim(), response: "" };
      }
      return {
        keyword: (setting.keyword || "").trim(),
        response: (setting.response || "").trim(),
      };
    };

    const normalizedSettings = {
      enableAI: normalizeKeywordSetting(keywordSettings.enableAI),
      disableAI: normalizeKeywordSetting(keywordSettings.disableAI),
      disableFollowUp: normalizeKeywordSetting(keywordSettings.disableFollowUp),
    };

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          keywordSettings: normalizedSettings,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    res.json({
      message: "อัปเดต keyword settings เรียบร้อยแล้ว",
      keywordSettings: normalizedSettings,
    });
  } catch (err) {
    console.error("Error updating line bot keyword settings:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดต keyword settings ได้" });
  }
});

// ============================ Facebook Bot API Endpoints ============================

// Initialize a Facebook Bot stub for webhook verification
app.post("/api/facebook-bots/init", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const providedVerifyToken = (req.body && req.body.verifyToken) || null;
    const verifyToken =
      providedVerifyToken ||
      "vt_" +
        Math.random().toString(36).slice(2, 10) +
        Math.random().toString(36).slice(2, 10);

    // Create minimal bot stub
    const stub = {
      name: "",
      description: "",
      pageId: "",
      accessToken: "",
      webhookUrl: "", // set after _id known
      verifyToken,
      status: "setup",
      isDefault: false,
      aiModel: "gpt-5",
      selectedInstructions: [],
      selectedImageCollections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insert = await coll.insertOne(stub);
    const id = insert.insertedId;

    // Build webhook URL using bot id
    const baseUrl = process.env.PUBLIC_BASE_URL || "https://" + req.get("host");
    const webhookUrl = `${baseUrl}/webhook/facebook/${id.toString()}`;

    await coll.updateOne({ _id: id }, { $set: { webhookUrl } });

    return res.json({ id: id.toString(), webhookUrl, verifyToken });
  } catch (err) {
    console.error("Error initializing facebook bot stub:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถเตรียมข้อมูลสำหรับยืนยัน Webhook ได้" });
  }
});

// Get all Facebook Bots
app.get("/api/facebook-bots", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    const facebookBots = await coll.find({}).sort({ createdAt: -1 }).toArray();
    res.json(facebookBots);
  } catch (err) {
    console.error("Error fetching facebook bots:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Facebook Bot ได้" });
  }
});

// Get single Facebook Bot
app.get("/api/facebook-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    const facebookBot = await coll.findOne({ _id: new ObjectId(id) });

    if (!facebookBot) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json(facebookBot);
  } catch (err) {
    console.error("Error fetching facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Facebook Bot ได้" });
  }
});

// Create new Facebook Bot
app.post("/api/facebook-bots", async (req, res) => {
  try {
    const {
      name,
      description,
      pageId,
      accessToken,
      webhookUrl,
      verifyToken,
      status,
      isDefault,
      aiModel,
      selectedInstructions,
      selectedImageCollections,
    } = req.body;

    if (!name || !pageId || !accessToken) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany({}, { $set: { isDefault: false } });
    }

    // Generate unique webhook URL if not provided
    let finalWebhookUrl = webhookUrl;
    if (!finalWebhookUrl) {
      const baseUrl =
        process.env.PUBLIC_BASE_URL || "https://" + req.get("host");
      const uniqueId =
        Date.now().toString(36) + Math.random().toString(36).substr(2);
      finalWebhookUrl = `${baseUrl}/webhook/facebook/${uniqueId}`;
    }

    const normalizedSelections = normalizeInstructionSelections(
      selectedInstructions || [],
    );
    const normalizedCollections = normalizeImageCollectionSelections(
      selectedImageCollections || [],
    );

    const facebookBot = {
      name,
      description: description || "",
      pageId,
      accessToken,
      webhookUrl: finalWebhookUrl,
      verifyToken: verifyToken || "your_verify_token",
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: aiModel || "gpt-5",
      selectedInstructions: normalizedSelections,
      selectedImageCollections: normalizedCollections,
      keywordSettings: {
        enableAI: { keyword: "", response: "" },
        disableAI: { keyword: "", response: "" },
        disableFollowUp: { keyword: "", response: "" },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await coll.insertOne(facebookBot);
    facebookBot._id = result.insertedId;

    res.status(201).json(facebookBot);
  } catch (err) {
    console.error("Error creating facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถสร้าง Facebook Bot ได้" });
  }
});

// Update Facebook Bot
app.put("/api/facebook-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      pageId,
      accessToken,
      webhookUrl,
      verifyToken,
      status,
      isDefault,
      aiModel,
      selectedImageCollections,
    } = req.body;

    if (!name || !pageId || !accessToken) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany({}, { $set: { isDefault: false } });
    }

    const updateData = {
      name,
      description: description || "",
      pageId,
      accessToken,
      webhookUrl: webhookUrl || "",
      verifyToken: verifyToken || "your_verify_token",
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: aiModel || "gpt-5",
      updatedAt: new Date(),
    };

    if (Array.isArray(selectedImageCollections)) {
      updateData.selectedImageCollections = normalizeImageCollectionSelections(
        selectedImageCollections,
      );
    } else if (selectedImageCollections === null) {
      updateData.selectedImageCollections = [];
    }

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({ message: "อัปเดต Facebook Bot เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error updating facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดต Facebook Bot ได้" });
  }
});

// Delete Facebook Bot
app.delete("/api/facebook-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const result = await coll.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({ message: "ลบ Facebook Bot เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error deleting facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถลบ Facebook Bot ได้" });
  }
});

// Toggle Facebook Bot Status (Quick Enable/Disable)
app.patch("/api/facebook-bots/:id/toggle-status", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // Get current bot
    const bot = await coll.findOne({ _id: new ObjectId(id) });
    if (!bot) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    // Toggle status: active <-> inactive
    const newStatus = bot.status === "active" ? "inactive" : "active";

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: newStatus, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({
      message: `เปลี่ยนสถานะ Facebook Bot เป็น ${newStatus === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"} เรียบร้อยแล้ว`,
      status: newStatus,
    });
  } catch (err) {
    console.error("Error toggling facebook bot status:", err);
    res.status(500).json({ error: "ไม่สามารถเปลี่ยนสถานะ Facebook Bot ได้" });
  }
});

// Test Facebook Bot
app.post("/api/facebook-bots/:id/test", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const facebookBot = await coll.findOne({ _id: new ObjectId(id) });
    if (!facebookBot) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    // Test Facebook Bot connection
    try {
      // Test Facebook Graph API connection
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${facebookBot.pageId}`,
        {
          params: {
            access_token: facebookBot.accessToken,
            fields: "name,id",
          },
        },
      );

      res.json({
        message: `ทดสอบ Facebook Bot สำเร็จ: ${response.data.name}`,
        profile: response.data,
      });
    } catch (fbError) {
      res.status(400).json({
        error: "ไม่สามารถเชื่อมต่อ Facebook Bot ได้: " + fbError.message,
      });
    }
  } catch (err) {
    console.error("Error testing facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถทดสอบ Facebook Bot ได้" });
  }
});

// Route: อัปเดต instruction ที่เลือกใช้ใน Facebook Bot
app.put("/api/facebook-bots/:id/instructions", async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedInstructions } = req.body;

    if (!Array.isArray(selectedInstructions)) {
      return res
        .status(400)
        .json({ error: "selectedInstructions ต้องเป็น array" });
    }

    const normalizedSelections =
      normalizeInstructionSelections(selectedInstructions);

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          selectedInstructions: normalizedSelections,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({ message: "อัปเดต instruction ที่เลือกใช้เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error updating facebook bot instructions:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถอัปเดต instruction ที่เลือกใช้ได้" });
  }
});

app.put("/api/facebook-bots/:id/image-collections", async (req, res) => {
  try {
    const { id } = req.params;
    let { selectedImageCollections } = req.body;

    if (selectedImageCollections === null) {
      selectedImageCollections = [];
    }

    if (!Array.isArray(selectedImageCollections)) {
      return res
        .status(400)
        .json({ error: "selectedImageCollections ต้องเป็น array หรือ null" });
    }

    const normalizedCollections = normalizeImageCollectionSelections(
      selectedImageCollections,
    );

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          selectedImageCollections: normalizedCollections,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({
      message: "อัปเดตคลังรูปภาพที่เลือกเรียบร้อยแล้ว",
      selectedImageCollections: normalizedCollections,
    });
  } catch (err) {
    console.error("Error updating facebook bot image collections:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถอัปเดตคลังรูปภาพของ Facebook Bot ได้" });
  }
});

// Route: อัปเดต keyword settings สำหรับ Facebook Bot
app.put("/api/facebook-bots/:id/keywords", async (req, res) => {
  try {
    const { id } = req.params;
    const { keywordSettings } = req.body;

    if (!keywordSettings || typeof keywordSettings !== "object") {
      return res.status(400).json({ error: "keywordSettings ต้องเป็น object" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // รองรับทั้งรูปแบบเก่า (string) และใหม่ (object with keyword, response)
    const normalizeKeywordSetting = (setting) => {
      if (!setting) return { keyword: "", response: "" };
      if (typeof setting === "string") {
        return { keyword: setting.trim(), response: "" };
      }
      return {
        keyword: (setting.keyword || "").trim(),
        response: (setting.response || "").trim(),
      };
    };

    const normalizedSettings = {
      enableAI: normalizeKeywordSetting(keywordSettings.enableAI),
      disableAI: normalizeKeywordSetting(keywordSettings.disableAI),
      disableFollowUp: normalizeKeywordSetting(keywordSettings.disableFollowUp),
    };

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          keywordSettings: normalizedSettings,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({
      message: "อัปเดต keyword settings เรียบร้อยแล้ว",
      keywordSettings: normalizedSettings,
    });
  } catch (err) {
    console.error("Error updating facebook bot keyword settings:", err);
    res.status(500).json({ error: "ไม่สามารถอัปเดต keyword settings ได้" });
  }
});

// Route: ดึงรายการ instruction library ทั้งหมด
app.get("/api/instructions/library", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const libraries = await libraryColl
      .find(
        {},
        {
          projection: {
            date: 1,
            name: 1,
            description: 1,
            displayDate: 1,
            displayTime: 1,
            type: 1,
            savedAt: 1,
          },
        },
      )
      .sort({ date: -1 })
      .toArray();

    res.json({ success: true, libraries });
  } catch (err) {
    console.error("Error fetching instruction libraries:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถดึงรายการ instruction library ได้" });
  }
});

// Route: ดึงรายละเอียด instruction library พร้อม instructions
app.get("/api/instructions/library/:date/details", async (req, res) => {
  try {
    const { date } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");

    const library = await libraryColl.findOne({ date });
    if (!library) {
      return res.status(404).json({ error: "ไม่พบคลัง instruction ที่ระบุ" });
    }

    res.json({
      success: true,
      library: {
        date: library.date,
        name: library.name,
        description: library.description,
        displayDate: library.displayDate,
        displayTime: library.displayTime,
        type: library.type,
        savedAt: library.savedAt,
        instructions: library.instructions || [],
      },
    });
  } catch (err) {
    console.error("Error fetching library details:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถดึงรายละเอียดคลัง instruction ได้" });
  }
});

// Route: ดึงรายการ instructions พร้อมประวัติเวอร์ชัน
app.get("/api/instructions", async (req, res) => {
  try {
    await ensureInstructionIdentifiers();

    const client = await connectDB();
    const db = client.db("chatbot");
    const instrColl = db.collection("instructions");
    const versionColl = db.collection("instruction_versions");

    const instructions = await instrColl
      .find({})
      .sort({ order: 1, title: 1, createdAt: 1 })
      .toArray();
    const instructionIds = instructions
      .map((instr) => instr.instructionId)
      .filter(Boolean);

    let versionDocs = [];
    if (instructionIds.length > 0) {
      versionDocs = await versionColl
        .find({ instructionId: { $in: instructionIds } })
        .sort({ instructionId: 1, version: -1 })
        .toArray();
    }

    const versionMap = new Map();
    for (const doc of versionDocs) {
      if (!doc || !doc.instructionId) continue;
      if (!versionMap.has(doc.instructionId))
        versionMap.set(doc.instructionId, []);
      versionMap.get(doc.instructionId).push(doc);
    }

    const response = instructions.map((instr) => {
      const currentType = instr.type || "text";
      const historyDocs = versionMap.get(instr.instructionId) || [];
      const versionHistory = historyDocs.map((item) => ({
        version: item.version,
        title: item.title || "",
        type: item.type || "text",
        updatedAt: item.updatedAt || item.snapshotAt || item.createdAt || null,
        snapshotAt: item.snapshotAt || null,
      }));

      let preview = "";
      if (currentType === "table") {
        const rowCount = instr?.data?.rows ? instr.data.rows.length : 0;
        const colCount = instr?.data?.columns ? instr.data.columns.length : 0;
        preview = `ตาราง ${rowCount} แถว ${colCount} คอลัมน์`;
      } else {
        const text = (instr?.content || "").toString();
        preview = text.length > 160 ? `${text.slice(0, 157)}...` : text;
      }

      return {
        _id: instr._id,
        instructionId: instr.instructionId,
        version: instr.version || 1,
        title: instr.title || "",
        type: currentType,
        content: instr.content || "",
        data: currentType === "table" ? instr.data || null : null,
        createdAt: instr.createdAt || null,
        updatedAt: instr.updatedAt || null,
        order: instr.order || null,
        preview,
        versionHistory,
      };
    });

    res.json({ success: true, instructions: response });
  } catch (err) {
    console.error("Error fetching instructions with versions:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงรายการ instructions ได้" });
  }
});

// Route: ดึงรายละเอียด instruction ตาม instructionId และเวอร์ชัน
app.get(
  "/api/instructions/:instructionId/versions/:version",
  async (req, res) => {
    try {
      const { instructionId, version } = req.params;
      if (!instructionId) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาระบุ instructionId" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const instrColl = db.collection("instructions");
      const versionColl = db.collection("instruction_versions");

      const versionParam =
        version?.toLowerCase?.() === "latest" ? "latest" : version;
      let doc = null;
      let source = "version";

      if (versionParam === "latest") {
        doc = await instrColl.findOne({ instructionId });
        source = "current";
      } else {
        const versionNumber = parseInt(versionParam, 10);
        if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
          return res
            .status(400)
            .json({ success: false, error: "เวอร์ชันไม่ถูกต้อง" });
        }
        doc = await versionColl.findOne({
          instructionId,
          version: versionNumber,
        });
        if (!doc) {
          // หากไม่พบในคลังเวอร์ชัน ลองดึงเวอร์ชันปัจจุบันใน instructions
          doc = await instrColl.findOne({
            instructionId,
            version: versionNumber,
          });
          if (doc) source = "current";
        }
      }

      if (!doc) {
        return res
          .status(404)
          .json({ success: false, error: "ไม่พบ instruction เวอร์ชันที่ระบุ" });
      }

      const payload = {
        instructionId: doc.instructionId || instructionId,
        version:
          doc.version || (source === "current" ? doc.version || 1 : null),
        title: doc.title || "",
        type: doc.type || "text",
        content: doc.content || "",
        data: doc.type === "table" ? doc.data || null : null,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null,
        snapshotAt: doc.snapshotAt || null,
        source,
      };

      res.json({ success: true, instruction: payload });
    } catch (err) {
      console.error("Error fetching instruction version detail:", err);
      res.status(500).json({
        success: false,
        error: "ไม่สามารถดึงรายละเอียด instruction ได้",
      });
    }
  },
);

// Dashboard (V2 - New Instruction System)
app.get("/admin/dashboard", async (req, res) => {
  try {
    const instructions = await getInstructionsV2();
    const aiEnabled = await getAiEnabled();
    res.render("admin-dashboard-v2", { instructions, aiEnabled });
  } catch (err) {
    res.render("admin-dashboard-v2", {
      instructions: [],
      aiEnabled: false,
      error: err.message,
    });
  }
});

// Edit Data Item (V2) - Full Page Editor
app.get("/admin/instructions-v2/:instructionId/data-items/:itemId/edit", async (req, res) => {
  try {
    const { instructionId, itemId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    // ดึง instruction
    const instruction = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!instruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
    }

    // หา data item
    const dataItem = (instruction.dataItems || []).find(item => item.itemId === itemId);
    if (!dataItem) {
      return res.redirect("/admin/dashboard?error=ไม่พบชุดข้อมูล");
    }

    // สร้าง instruction object สำหรับ EJS (ใช้ structure แบบเดิม)
    const instructionForEdit = {
      _id: instructionId,
      instructionId: dataItem.itemId,
      type: dataItem.type || 'text',
      title: dataItem.title || '',
      content: dataItem.content || '',
      data: dataItem.data || null,
      createdAt: dataItem.createdAt,
      updatedAt: dataItem.updatedAt,
      parentInstructionName: instruction.name // เพิ่มชื่อ instruction หลักสำหรับแสดง
    };

    res.render("edit-data-item-v2", {
      instruction: instructionForEdit,
      instructionId: instructionId,
      itemId: itemId
    });
  } catch (err) {
    console.error("Error rendering edit data item page:", err);
    res.redirect("/admin/dashboard?error=" + encodeURIComponent(err.message));
  }
});

// Save Data Item (V2) - Full Page Editor
app.post("/admin/instructions-v2/:instructionId/data-items/:itemId/edit", async (req, res) => {
  try {
    const { instructionId, itemId } = req.params;
    const { type, title, content, tableData } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions_v2");

    // ดึง instruction
    const instruction = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!instruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบ Instruction");
    }

    // หา index ของ data item
    const itemIndex = (instruction.dataItems || []).findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
      return res.redirect("/admin/dashboard?error=ไม่พบชุดข้อมูล");
    }

    const now = new Date();
    const updateFields = {};

    // อัปเดต title
    if (title !== undefined) {
      updateFields[`dataItems.${itemIndex}.title`] = title.trim();
    }

    // อัปเดตตาม type
    if (type === 'table') {
      // ตาราง: อัปเดต data field
      if (tableData && tableData.trim() !== "") {
        try {
          const parsedData = JSON.parse(tableData);
          if (parsedData && typeof parsedData === "object") {
            updateFields[`dataItems.${itemIndex}.data`] = parsedData;
            updateFields[`dataItems.${itemIndex}.content`] = ""; // ล้าง content สำหรับตาราง
          }
        } catch (parseErr) {
          console.error("Error parsing table data:", parseErr);
          return res.redirect(`/admin/instructions-v2/${instructionId}/data-items/${itemId}/edit?error=ข้อมูลตารางไม่ถูกต้อง`);
        }
      }
    } else {
      // ข้อความ: อัปเดต content field
      updateFields[`dataItems.${itemIndex}.content`] = content || "";
      updateFields[`dataItems.${itemIndex}.data`] = null; // ล้าง data สำหรับข้อความ
    }

    updateFields[`dataItems.${itemIndex}.type`] = type;
    updateFields[`dataItems.${itemIndex}.updatedAt`] = now;
    updateFields.updatedAt = now;

    // บันทึกลง database
    await coll.updateOne(
      { _id: new ObjectId(instructionId) },
      { $set: updateFields }
    );

    res.redirect("/admin/dashboard?success=แก้ไขชุดข้อมูลเรียบร้อยแล้ว");
  } catch (err) {
    console.error("Error saving data item:", err);
    res.redirect("/admin/dashboard?error=" + encodeURIComponent(err.message));
  }
});

// Admin settings page
app.get("/admin/settings", async (req, res) => {
  try {
    res.render("admin-settings");
  } catch (err) {
    console.error("Error rendering admin settings:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Toggle global AI enabled
app.post("/admin/ai-toggle", async (req, res) => {
  try {
    const { enabled } = req.body;
    await setAiEnabled(enabled === "true" || enabled === true);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Add new instruction
app.post("/admin/instructions", async (req, res) => {
  try {
    const { type, title, content, tableData } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const now = new Date();
    const instr = {
      instructionId: generateInstructionId(),
      version: 1,
      type,
      title: title || "",
      content: content || "",
      createdAt: now,
      updatedAt: now,
      order: Date.now(),
    };

    if (type === "table" && tableData) {
      try {
        instr.data = JSON.parse(tableData);
      } catch {
        instr.data = [];
      }
    } else {
      delete instr.data;
    }

    const result = await coll.insertOne(instr);
    await recordInstructionVersionSnapshot(
      { ...instr, _id: result.insertedId },
      db,
    );
    res.redirect("/admin/dashboard");
  } catch (err) {
    res.redirect("/admin/dashboard?error=ไม่สามารถเพิ่มข้อมูลได้");
  }
});

// Delete instruction
app.post("/admin/instructions/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    await coll.deleteOne({ _id: new ObjectId(id) });
    res.redirect("/admin/dashboard");
  } catch (err) {
    res.redirect("/admin/dashboard?error=ไม่สามารถลบข้อมูลได้");
  }
});

// Edit instruction form
app.get("/admin/instructions/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    res.render("edit-instruction", { instruction });
  } catch (err) {
    res.redirect("/admin/dashboard?error=ไม่พบข้อมูลที่ต้องการแก้ไข");
  }
});

// Handle edit submission
app.post("/admin/instructions/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, content, tableData } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    // ดึงข้อมูลเดิมก่อนเพื่อเป็น fallback
    const existingInstruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!existingInstruction) {
      return res.redirect("/admin/dashboard?error=ไม่พบข้อมูลที่ต้องการแก้ไข");
    }

    const now = new Date();
    const baseInstructionId =
      existingInstruction.instructionId || generateInstructionId();
    const currentVersion = Number.isInteger(existingInstruction.version)
      ? existingInstruction.version
      : 1;
    const newVersion = currentVersion + 1;

    const updateData = {
      instructionId: baseInstructionId,
      version: newVersion,
      type,
      title: title || "",
      content: content || "",
      updatedAt: now,
    };

    console.log("[Edit] Request body keys:", Object.keys(req.body));
    console.log(
      "[Edit] Table data received length:",
      tableData ? tableData.length : 0,
    );

    let unsetData = null;

    if (type === "table") {
      if (tableData && tableData.trim() !== "") {
        try {
          const parsedData = JSON.parse(tableData);
          if (parsedData && typeof parsedData === "object") {
            updateData.data = parsedData;
            console.log("[Edit] Table data parsed successfully");
            console.log(
              "[Edit] Parsed data columns:",
              parsedData.columns ? parsedData.columns.length : 0,
            );
            console.log(
              "[Edit] Parsed data rows:",
              parsedData.rows ? parsedData.rows.length : 0,
            );
          } else {
            console.warn(
              "[Edit] Invalid table data structure, keeping existing data",
            );
            updateData.data = existingInstruction.data || {
              columns: [],
              rows: [],
            };
          }
        } catch (parseError) {
          console.error("[Edit] JSON parse error:", parseError);
          console.log(
            "[Edit] Raw table data preview:",
            tableData.substring(0, 200),
          );
          console.log("[Edit] Keeping existing table data due to parse error");
          updateData.data = existingInstruction.data || {
            columns: [],
            rows: [],
          };
        }
      } else {
        console.warn("[Edit] Empty table data received, keeping existing data");
        updateData.data = existingInstruction.data || { columns: [], rows: [] };
      }
    } else {
      unsetData = { data: "" };
    }

    console.log("[Edit] Updating instruction:", id, "Type:", type);
    console.log("[Edit] Update data keys:", Object.keys(updateData));

    const mongoUpdate = unsetData
      ? { $set: updateData, $unset: unsetData }
      : { $set: updateData };

    console.log(
      "[Edit] MongoDB update operation:",
      JSON.stringify(mongoUpdate, null, 2),
    );

    const updateResult = await coll.updateOne(
      { _id: new ObjectId(id) },
      mongoUpdate,
    );
    console.log("[Edit] Update result:", updateResult);

    if (updateResult.modifiedCount === 1) {
      console.log("[Edit] Instruction updated successfully");
    } else {
      console.warn("[Edit] No documents were modified");
    }

    const updatedInstruction = {
      ...existingInstruction,
      ...updateData,
    };
    if (unsetData) {
      delete updatedInstruction.data;
    }

    await recordInstructionVersionSnapshot(updatedInstruction, db);

    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("[Edit] Error updating instruction:", err);
    console.error("[Edit] Error stack:", err.stack);
    res.redirect("/admin/dashboard?error=ไม่สามารถแก้ไขข้อมูลได้");
  }
});

// Instruction export endpoints
app.get("/admin/instructions/export/json", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const exportedAt = new Date().toISOString();
    const previewText = buildInstructionText(instructions, {
      tableMode: "placeholder",
      emptyText: "",
    });
    const detailedText = buildInstructionText(instructions, {
      tableMode: "json",
      emptyText: "_ไม่มีเนื้อหา_",
    });
    const sanitizedInstructions = instructions.map((instruction) => {
      const { _id, ...rest } = instruction;
      return {
        id: _id ? _id.toString() : null,
        ...rest,
      };
    });

    const payload = {
      exportedAt,
      total: instructions.length,
      preview: previewText,
      detailed: detailedText,
      instructions: sanitizedInstructions,
    };
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="instructions-${timestamp}.json"`,
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ไม่สามารถส่งออกข้อมูล JSON ได้",
      details: err.message,
    });
  }
});

app.get("/admin/instructions/export/markdown", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const markdown =
      instructions.length === 0
        ? "ไม่มีข้อมูล instructions"
        : buildInstructionText(instructions, {
            tableMode: "json",
            emptyText: "_ไม่มีเนื้อหา_",
          });
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="instructions-${timestamp}.md"`,
    );
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(markdown);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ไม่สามารถส่งออกข้อมูล Markdown ได้",
      details: err.message,
    });
  }
});

app.get("/admin/instructions/export/excel", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const workbook = XLSX.utils.book_new();
    const usedNames = new Set();

    const reserveSheetName = (title, index) => {
      const fallback = `Instruction_${index + 1}`;
      const baseName = sanitizeSheetName(title, fallback);
      let candidate = baseName;
      let counter = 1;
      while (usedNames.has(candidate)) {
        const suffix = `_${counter++}`;
        const maxLength = Math.max(31 - suffix.length, 1);
        candidate = `${baseName.substring(0, maxLength)}${suffix}`;
      }
      usedNames.add(candidate);
      return candidate;
    };

    if (instructions.length === 0) {
      const sheetName = sanitizeSheetName("Instructions", "Instructions");
      const worksheet = XLSX.utils.aoa_to_sheet([["ไม่มีข้อมูล instructions"]]);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    } else {
      instructions.forEach((instruction, idx) => {
        const sheetName = reserveSheetName(instruction.title, idx);
        let sheetData = [];

        if (instruction.type === "table" && instruction.data) {
          const columns =
            Array.isArray(instruction.data.columns) &&
            instruction.data.columns.length > 0
              ? instruction.data.columns
              : Array.from(
                  new Set(
                    (instruction.data.rows || []).flatMap((row) =>
                      Object.keys(row),
                    ),
                  ),
                );
          const rows = Array.isArray(instruction.data.rows)
            ? instruction.data.rows
            : [];

          if (columns.length === 0) {
            sheetData = [["ไม่มีข้อมูลตาราง"]];
          } else {
            sheetData.push(columns);
            if (rows.length === 0) {
              sheetData.push(new Array(columns.length).fill(""));
            } else {
              rows.forEach((row) => {
                sheetData.push(
                  columns.map((col) => {
                    const value = row[col];
                    return value === undefined || value === null
                      ? ""
                      : String(value);
                  }),
                );
              });
            }
          }
        } else {
          const text = instruction.content ? String(instruction.content) : "";
          sheetData = [[text]];
        }

        if (sheetData.length === 0) {
          sheetData = [[""]];
        }

        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="instructions-${timestamp}.xlsx"`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "ไม่สามารถส่งออกไฟล์ Excel ได้",
      details: err.message,
    });
  }
});

// Preview combined instructions (simple implementation)
app.get("/admin/instructions/preview", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const preview =
      instructions.length === 0
        ? ""
        : buildInstructionText(instructions, {
            tableMode: "placeholder",
            emptyText: "",
          });
    res.json({ success: true, instructions: preview });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Simple reorder (up/down)
app.post("/admin/instructions/reorder", async (req, res) => {
  try {
    const { instructionId, direction } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const current = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!current)
      return res.json({ success: false, error: "ไม่พบ instruction" });

    const all = await coll.find({}).sort({ order: 1, createdAt: 1 }).toArray();
    const idx = all.findIndex((x) => x._id.toString() === instructionId);
    let targetIdx = idx;
    if (direction === "up" && idx > 0) targetIdx = idx - 1;
    if (direction === "down" && idx < all.length - 1) targetIdx = idx + 1;

    if (idx === targetIdx)
      return res.json({ success: false, error: "ไม่สามารถเลื่อนได้" });

    const target = all[targetIdx];
    await coll.updateOne(
      { _id: current._id },
      { $set: { order: target.order || targetIdx } },
    );
    await coll.updateOne(
      { _id: target._id },
      { $set: { order: current.order || idx } },
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/admin/instructions/reorder/drag", async (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.json({ success: false, error: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }

    const objectIds = orderedIds.map((id) => {
      const objectId = toObjectId(id);
      if (!objectId) {
        throw new Error("พบรหัส instruction ที่ไม่ถูกต้อง");
      }
      return objectId;
    });

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const total = await coll.countDocuments();
    if (total !== objectIds.length) {
      return res.json({
        success: false,
        error: "จำนวนนับไม่ตรงกับในระบบ กรุณารีเฟรชแล้วลองอีกครั้ง",
      });
    }

    const bulkOps = objectIds.map((objectId, index) => ({
      updateOne: {
        filter: { _id: objectId },
        update: { $set: { order: index } },
      },
    }));

    if (bulkOps.length > 0) {
      await coll.bulkWrite(bulkOps, { ordered: true });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[Instructions] drag reorder error:", err);
    res.json({
      success: false,
      error: err.message || "ไม่สามารถจัดลำดับใหม่ได้",
    });
  }
});

// API endpoint สำหรับดึงรายการ instructions (สำหรับ dynamic updates)
app.get("/admin/instructions/list", async (req, res) => {
  try {
    const instructions = await getInstructions();
    res.json({
      success: true,
      instructions: instructions.map((instruction) => ({
        _id: instruction._id,
        type: instruction.type,
        title: instruction.title,
        content: instruction.content,
        data: instruction.data,
        order: instruction.order,
        createdAt: instruction.createdAt,
        updatedAt: instruction.updatedAt,
      })),
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============================ Instruction Assets API ============================
// List all instruction assets
app.get("/admin/instructions/assets", async (req, res) => {
  try {
    const assets = await getInstructionAssets();
    res.json({ success: true, assets });
  } catch (err) {
    console.error("[Assets] list error:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงรายการรูปภาพได้" });
  }
});

// Helper: Generate slug from Thai text
function generateSlugFromLabel(label) {
  // แผนที่แปลงคำภาษาไทยที่ใช้บ่อย -> ภาษาอังกฤษ
  const thaiToEng = {
    สินค้า: "product",
    ผลิตภัณฑ์: "product",
    บริการ: "service",
    เซอร์วิส: "service",
    ราคา: "price",
    ค่าใช้จ่าย: "price",
    โปรโมชั่น: "promotion",
    โปรโมชัน: "promotion",
    ติดต่อ: "contact",
    ติดต่อเรา: "contact",
    ชำระเงิน: "payment",
    จ่ายเงิน: "payment",
    จัดส่ง: "delivery",
    ส่งของ: "delivery",
    คิวอาร์: "qr",
    คิวอาร์โค้ด: "qr-code",
    โค้ด: "code",
    รหัส: "code",
    แคตตาล็อก: "catalog",
    แคตตาล็อค: "catalog",
    เมนู: "menu",
    รายการ: "menu",
    แผนที่: "map",
    ตำแหน่ง: "location",
    เวลา: "time",
    เปิดปิด: "hours",
    ส่วนลด: "discount",
    ลดราคา: "discount",
  };

  let slug = label.toLowerCase().trim();

  // แทนที่คำภาษาไทยด้วยภาษาอังกฤษ
  Object.keys(thaiToEng).forEach((thai) => {
    slug = slug.replace(new RegExp(thai, "g"), thaiToEng[thai]);
  });

  // แปลงตัวเลขไทยเป็นอารบิก
  const thaiDigits = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
  thaiDigits.forEach((digit, index) => {
    slug = slug.replace(new RegExp(digit, "g"), index.toString());
  });

  // ลบภาษาไทยที่เหลือทั้งหมด
  slug = slug.replace(/[ก-๙]/g, "");

  // แปลง space และตัวอักษรพิเศษเป็น dash
  slug = slug.replace(/\s+/g, "-");
  slug = slug.replace(/[^a-z0-9_-]/g, "-");

  // ลบ dash ซ้ำ
  slug = slug.replace(/-+/g, "-");

  // ตัด dash หน้า-หลัง
  slug = slug.replace(/^-+|-+$/g, "");

  // ถ้าว่างเปล่า ให้สร้างจาก timestamp
  if (!slug) {
    slug = "asset-" + Date.now();
  }

  return slug;
}

// Upload a new instruction asset
app.post(
  "/admin/instructions/assets",
  imageUpload.single("image"),
  async (req, res) => {
    try {
      const label = (req.body.label || "").trim();
      const alt = (req.body.alt || "").trim();
      const description = (req.body.description || "").trim();
      const overwrite =
        String(req.body.overwrite || "").toLowerCase() === "true";

      // ตรวจสอบว่ามี label หรือไม่
      if (!label) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาระบุชื่อ Label" });
      }

      // สร้าง slug จาก label (รองรับภาษาไทย)
      const slug = generateSlugFromLabel(label);

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาอัพโหลดไฟล์รูปภาพ" });
      }

      // Convert to optimized JPEG and thumbnail
      const inputBuffer = req.file.buffer;
      const image = sharp(inputBuffer);
      const metadata = await image.metadata();
      const optimized = await image
        .jpeg({ quality: 88, progressive: true })
        .toBuffer();
      const thumb = await sharp(optimized)
        .resize({
          width: 512,
          height: 512,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const sha256 = crypto
        .createHash("sha256")
        .update(optimized)
        .digest("hex")
        .slice(0, 16);
      const fileName = `${slug}.jpg`;
      const thumbName = `${slug}_thumb.jpg`;

      const urlBase = PUBLIC_BASE_URL ? PUBLIC_BASE_URL.replace(/\/$/, "") : "";
      const url = `${urlBase}/assets/instructions/${fileName}`;
      const thumbUrl = `${urlBase}/assets/instructions/${thumbName}`;

      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("instruction_assets");
      const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });

      const existing = await coll.findOne({ label });
      if (existing && !overwrite) {
        return res.status(409).json({
          success: false,
          error: "label นี้มีอยู่แล้ว หากต้องการแทนที่ให้ส่ง overwrite=true",
        });
      }

      if (existing) {
        await deleteGridFsEntries(bucket, [
          { id: existing.fileId },
          { id: existing.thumbFileId },
          { filename: existing.fileName },
          { filename: existing.thumbFileName || `${existing.slug}_thumb.jpg` },
        ]);
      }

      const [fileId, thumbFileId] = await Promise.all([
        uploadBufferToGridFS(bucket, fileName, optimized, {
          contentType: "image/jpeg",
          metadata: {
            label,
            slug,
            type: "original",
            width: metadata.width || null,
            height: metadata.height || null,
          },
        }),
        uploadBufferToGridFS(bucket, thumbName, thumb, {
          contentType: "image/jpeg",
          metadata: { label, slug, type: "thumb" },
        }),
      ]);

      const doc = {
        label,
        slug,
        fileName,
        thumbFileName: thumbName,
        fileId,
        thumbFileId,
        storage: "mongo",
        mime: "image/jpeg",
        size: optimized.length,
        width: metadata.width || null,
        height: metadata.height || null,
        sha256,
        alt,
        description,
        url,
        thumbUrl,
        updatedAt: new Date(),
        createdAt: existing?.createdAt || new Date(),
      };

      await coll.updateOne({ label }, { $set: doc }, { upsert: true });

      const savedAsset = await coll.findOne({ label });
      if (!savedAsset) {
        throw new Error("ไม่สามารถบันทึกข้อมูลรูปภาพได้");
      }

      await syncInstructionAssetToCollections(db, savedAsset);

      res.json({
        success: true,
        asset: mapInstructionAssetResponse(savedAsset),
      });
    } catch (err) {
      console.error("[Assets] upload error:", err);
      res.status(400).json({
        success: false,
        error: err.message || "อัพโหลดรูปภาพไม่สำเร็จ",
      });
    }
  },
);

app.put("/admin/instructions/assets/:label", async (req, res) => {
  try {
    const originalLabel = req.params.label;
    let { label: newLabel, description } = req.body || {};
    newLabel = typeof newLabel === "string" ? newLabel.trim() : "";
    description = typeof description === "string" ? description.trim() : "";

    if (!newLabel) {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาระบุชื่อรูปภาพ" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");

    const doc = await coll.findOne({ label: originalLabel });
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, error: "ไม่พบรูปภาพที่ต้องการแก้ไข" });
    }

    if (newLabel !== originalLabel) {
      const exists = await coll.findOne({ label: newLabel });
      if (exists) {
        return res
          .status(409)
          .json({ success: false, error: "มีชื่อรูปภาพนี้อยู่แล้ว" });
      }
    }

    const update = {
      label: newLabel,
      description,
      alt: description,
      updatedAt: new Date(),
    };

    await coll.updateOne({ _id: doc._id }, { $set: update });
    const updatedDoc = await coll.findOne({ _id: doc._id });
    await syncInstructionAssetToCollections(db, updatedDoc);

    res.json({ success: true, asset: mapInstructionAssetResponse(updatedDoc) });
  } catch (err) {
    console.error("[Assets] update error:", err);
    res.status(500).json({ success: false, error: "ไม่สามารถแก้ไขรูปภาพได้" });
  }
});

// Delete an instruction asset by label
app.delete("/admin/instructions/assets/:label", async (req, res) => {
  try {
    const { label } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");
    const doc = await coll.findOne({ label });
    if (!doc)
      return res.status(404).json({ success: false, error: "ไม่พบ asset" });

    await performInstructionAssetDeletion(db, doc);

    res.json({ success: true });
  } catch (err) {
    console.error("[Assets] delete error:", err);
    res.status(500).json({ success: false, error: "ลบรูปภาพไม่สำเร็จ" });
  }
});

app.post("/admin/instructions/assets/bulk-delete", async (req, res) => {
  try {
    const labels = Array.isArray(req.body?.labels)
      ? Array.from(
          new Set(
            req.body.labels
              .map((label) => (typeof label === "string" ? label.trim() : ""))
              .filter((label) => !!label),
          ),
        )
      : [];

    if (labels.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาระบุชื่อรูปภาพที่ต้องการลบ" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_assets");

    const deleted = [];
    const failed = [];

    for (const label of labels) {
      try {
        const doc = await coll.findOne({ label });
        if (!doc) {
          failed.push({ label, error: "ไม่พบรูปภาพ" });
          continue;
        }

        await performInstructionAssetDeletion(db, doc);
        deleted.push(label);
      } catch (err) {
        failed.push({ label, error: err.message || "ลบไม่สำเร็จ" });
      }
    }

    const success = deleted.length > 0;
    if (!success) {
      return res.status(400).json({
        success: false,
        error: "ไม่สามารถลบรูปภาพได้",
        failed,
      });
    }

    res.json({ success: true, deleted, failed });
  } catch (err) {
    console.error("[Assets] bulk delete error:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถลบรูปภาพที่เลือกได้" });
  }
});

// Check and fix asset data consistency
app.post("/admin/instructions/assets/check-consistency", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const results = {
      instruction_assets: await checkAndFixAssetConsistency(
        db,
        "instruction_assets",
        "instructionAssets"
      ),
      follow_up_assets: await checkAndFixAssetConsistency(
        db,
        "follow_up_assets",
        "followupAssets"
      ),
    };

    const totalFixed =
      results.instruction_assets.fixed + results.follow_up_assets.fixed;
    const totalDeleted =
      results.instruction_assets.deleted + results.follow_up_assets.deleted;
    const totalOk = results.instruction_assets.ok + results.follow_up_assets.ok;

    let message = "ข้อมูลถูกต้องครบถ้วน";
    if (totalFixed > 0 || totalDeleted > 0) {
      const parts = [];
      if (totalFixed > 0) parts.push(`ซ่อมแซม ${totalFixed} รายการ`);
      if (totalDeleted > 0) parts.push(`ลบ ${totalDeleted} รายการ`);
      message = parts.join(" และ ");
    }

    res.json({
      success: true,
      message,
      results,
      summary: {
        ok: totalOk,
        fixed: totalFixed,
        deleted: totalDeleted,
      },
    });
  } catch (err) {
    console.error("[Assets] consistency check error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถตรวจสอบความสมบูรณ์ของข้อมูลได้",
    });
  }
});

async function checkAndFixAssetConsistency(db, collectionName, bucketName) {
  const coll = db.collection(collectionName);
  const bucket = new GridFSBucket(db, { bucketName });

  const assets = await coll.find({}).toArray();
  let fixedCount = 0;
  let okCount = 0;
  let deletedCount = 0;
  const fixedItems = [];
  const deletedItems = [];

  for (const asset of assets) {
    const label = asset.label || asset.fileName || asset._id.toString();
    let needsUpdate = false;
    let needsDelete = false;
    const updates = {};

    // Check main file
    let mainFileExists = true;
    if (asset.fileId) {
      const exists = await checkGridFsFileExists(bucket, asset.fileId);
      if (!exists) {
        console.log(
          `[Consistency] Missing fileId ${asset.fileId} for ${label}`
        );
        updates.fileId = null;
        needsUpdate = true;
        mainFileExists = false;
      }
    } else {
      mainFileExists = false;
    }

    // Check thumbnail file
    let thumbFileExists = true;
    const thumbId = asset.thumbFileId || asset.thumbId;
    if (thumbId) {
      const exists = await checkGridFsFileExists(bucket, thumbId);
      if (!exists) {
        console.log(`[Consistency] Missing thumbFileId ${thumbId} for ${label}`);
        updates.thumbFileId = null;
        if (asset.thumbId) updates.thumbId = null;
        needsUpdate = true;
        thumbFileExists = false;
      }
    } else {
      thumbFileExists = false;
    }

    // Delete orphaned records (no files at all)
    if (!mainFileExists && !thumbFileExists) {
      console.log(`[Consistency] Deleting orphaned record: ${label}`);
      await coll.deleteOne({ _id: asset._id });
      deletedItems.push({ label, reason: 'No files in GridFS' });
      deletedCount++;
      needsDelete = true;
    }

    if (needsDelete) {
      continue;
    }

    if (needsUpdate) {
      await coll.updateOne({ _id: asset._id }, { $set: updates });
      fixedItems.push({ label, fixes: updates });
      fixedCount++;
    } else {
      okCount++;
    }
  }

  return {
    total: assets.length,
    ok: okCount,
    fixed: fixedCount,
    deleted: deletedCount,
    items: fixedItems,
    deletedItems,
  };
}

async function checkGridFsFileExists(bucket, fileId) {
  try {
    const objectId = toObjectId(fileId);
    if (!objectId) return false;

    const files = await bucket.find({ _id: objectId }).toArray();
    return files.length > 0;
  } catch (err) {
    return false;
  }
}

// ==================== IMAGE COLLECTIONS API ====================

// Helper: ดึง Image Collections ทั้งหมด
async function getImageCollections() {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("image_collections");
    const collections = await coll.find({}).sort({ createdAt: -1 }).toArray();
    return collections;
  } catch (e) {
    console.error("[Collections] Error fetching collections:", e);
    return [];
  }
}

// Helper: ดึงรูปภาพจาก collections ที่เลือก (สำหรับ bot)
async function getImagesFromSelectedCollections(selectedCollectionIds = []) {
  try {
    if (
      !Array.isArray(selectedCollectionIds) ||
      selectedCollectionIds.length === 0
    ) {
      return [];
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("image_collections");

    const stringIds = new Set();
    const objectIds = [];
    for (const rawId of selectedCollectionIds) {
      if (!rawId) continue;
      if (typeof rawId === "string") {
        const trimmed = rawId.trim();
        if (!trimmed) continue;
        stringIds.add(trimmed);
        if (ObjectId.isValid(trimmed)) {
          objectIds.push(new ObjectId(trimmed));
        }
      } else if (rawId instanceof ObjectId) {
        objectIds.push(rawId);
      } else if (rawId && typeof rawId === "object" && rawId._id) {
        const nestedId = rawId._id;
        if (nestedId instanceof ObjectId) {
          objectIds.push(nestedId);
        } else if (typeof nestedId === "string" && nestedId.trim()) {
          stringIds.add(nestedId.trim());
          if (ObjectId.isValid(nestedId.trim())) {
            objectIds.push(new ObjectId(nestedId.trim()));
          }
        }
      }
    }

    const queries = [];
    if (stringIds.size > 0) {
      queries.push({ _id: { $in: Array.from(stringIds) } });
    }
    if (objectIds.length > 0) {
      queries.push({ _id: { $in: objectIds } });
    }

    const findQuery =
      queries.length === 0
        ? { _id: { $in: Array.from(stringIds) } }
        : queries.length === 1
          ? queries[0]
          : { $or: queries };

    const collections = await coll.find(findQuery).toArray();

    // รวมรูปภาพจากทุก collection
    const allImages = [];
    const seenLabels = new Set();

    for (const collection of collections) {
      if (Array.isArray(collection.images)) {
        for (const img of collection.images) {
          // ป้องกันรูปซ้ำ (ใช้ label เป็น key)
          if (img.label && !seenLabels.has(img.label)) {
            const resolvedImage = {
              ...img,
              url: resolveInstructionAssetUrl(img.url, img.fileName),
              thumbUrl: resolveInstructionAssetUrl(
                img.thumbUrl || img.url,
                img.thumbFileName || img.fileName,
              ),
            };
            allImages.push(resolvedImage);
            seenLabels.add(img.label);
          }
        }
      }
    }

    return allImages;
  } catch (e) {
    console.error("[Collections] Error getting images from collections:", e);
    return [];
  }
}

function buildCollectionImageEntryFromAsset(asset) {
  if (!asset || typeof asset !== "object") return null;
  const label = typeof asset.label === "string" ? asset.label.trim() : "";
  if (!label) return null;
  const slug =
    typeof asset.slug === "string" && asset.slug.trim()
      ? asset.slug.trim()
      : label;
  const fileName =
    typeof asset.fileName === "string" && asset.fileName.trim()
      ? asset.fileName.trim()
      : null;
  const thumbFileName =
    typeof asset.thumbFileName === "string" && asset.thumbFileName.trim()
      ? asset.thumbFileName.trim()
      : null;

  const resolvedUrl = resolveInstructionAssetUrl(asset.url, fileName);
  const resolvedThumbUrl = resolveInstructionAssetUrl(
    asset.thumbUrl || resolvedUrl,
    thumbFileName || fileName,
  );

  return {
    label,
    slug,
    url: resolvedUrl,
    thumbUrl: resolvedThumbUrl,
    description:
      typeof asset.description === "string" && asset.description.trim()
        ? asset.description.trim()
        : typeof asset.alt === "string"
          ? asset.alt.trim()
          : "",
    fileName: fileName || undefined,
    assetId: asset._id
      ? asset._id.toString()
      : asset.assetId
        ? String(asset.assetId)
        : undefined,
  };
}

async function syncInstructionAssetToCollections(db, asset) {
  if (!db || !asset) return;
  const collectionEntry = buildCollectionImageEntryFromAsset(asset);
  if (!collectionEntry) return;

  const collectionsColl = db.collection("image_collections");
  const orConditions = [];
  if (collectionEntry.assetId) {
    orConditions.push({ "images.assetId": collectionEntry.assetId });
  }
  orConditions.push({ "images.label": collectionEntry.label });
  orConditions.push({ isDefault: true });

  const query =
    orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
  const collections = await collectionsColl.find(query).toArray();

  let defaultUpdated = false;

  for (const collection of collections) {
    const currentImages = Array.isArray(collection.images)
      ? [...collection.images]
      : [];
    let changed = false;
    const matchIndex = currentImages.findIndex((img) => {
      if (!img) return false;
      if (
        collectionEntry.assetId &&
        img.assetId &&
        String(img.assetId) === collectionEntry.assetId
      ) {
        return true;
      }
      return img.label === collectionEntry.label;
    });

    if (matchIndex >= 0) {
      currentImages[matchIndex] = {
        ...currentImages[matchIndex],
        ...collectionEntry,
      };
      changed = true;
    } else if (collection.isDefault) {
      currentImages.unshift(collectionEntry);
      changed = true;
      defaultUpdated = true;
    }

    if (collection.isDefault) {
      defaultUpdated = true;
    }

    if (changed) {
      await collectionsColl.updateOne(
        { _id: collection._id },
        {
          $set: {
            images: currentImages,
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  if (!defaultUpdated) {
    const defaultCollection = await collectionsColl.findOne({
      isDefault: true,
    });
    if (defaultCollection) {
      const images = Array.isArray(defaultCollection.images)
        ? [collectionEntry, ...defaultCollection.images.filter(Boolean)]
        : [collectionEntry];
      await collectionsColl.updateOne(
        { _id: defaultCollection._id },
        {
          $set: {
            images,
            updatedAt: new Date(),
          },
        },
      );
    } else {
      const assetsColl = db.collection("instruction_assets");
      const allAssets = await assetsColl
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      const imageEntries = [];
      for (const assetDoc of allAssets) {
        const entry = buildCollectionImageEntryFromAsset(assetDoc);
        if (entry) {
          imageEntries.push(entry);
        }
      }
      const defaultId = `default-collection-${Date.now()}`;
      await collectionsColl.insertOne({
        _id: defaultId,
        name: "รูปภาพทั้งหมด (สร้างอัตโนมัติ)",
        description:
          "ระบบสร้างคอลเลกชันเริ่มต้นขึ้นใหม่ เนื่องจากไม่พบข้อมูลเดิม",
        images: imageEntries,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.warn(
        "[Assets] Default image collection was missing. A new collection has been created automatically.",
      );
    }
  }
}

async function removeInstructionAssetFromCollections(db, asset) {
  if (!db || !asset) return;
  const label =
    typeof asset.label === "string" && asset.label.trim()
      ? asset.label.trim()
      : null;
  const assetId = asset._id ? asset._id.toString() : asset.assetId || null;
  if (!label && !assetId) return;

  const collectionsColl = db.collection("image_collections");
  const filters = [];
  if (assetId) {
    filters.push({ "images.assetId": assetId });
  }
  if (label) {
    filters.push({ "images.label": label });
  }
  if (filters.length === 0) return;

  const query = filters.length === 1 ? filters[0] : { $or: filters };
  const collections = await collectionsColl.find(query).toArray();

  for (const collection of collections) {
    const before = Array.isArray(collection.images) ? collection.images : [];
    const filtered = before.filter((img) => {
      if (!img) return false;
      const matchById =
        assetId && img.assetId && String(img.assetId) === String(assetId);
      const matchByLabel = label && img.label === label;
      return !matchById && !matchByLabel;
    });
    if (filtered.length !== before.length) {
      await collectionsColl.updateOne(
        { _id: collection._id },
        {
          $set: {
            images: filtered,
            updatedAt: new Date(),
          },
        },
      );
    }
  }
}

async function performInstructionAssetDeletion(db, asset) {
  if (!db || !asset) return false;
  const coll = db.collection("instruction_assets");
  await coll.deleteOne({ _id: asset._id });

  await removeInstructionAssetFromCollections(db, asset);

  const bucket = new GridFSBucket(db, { bucketName: "instructionAssets" });
  await deleteGridFsEntries(bucket, [
    { id: asset.fileId },
    { id: asset.thumbFileId },
    { filename: asset.fileName },
    { filename: asset.thumbFileName || `${asset.label}_thumb.jpg` },
  ]);

  const baseDir = ASSETS_DIR;
  const thumbName = asset.thumbFileName || `${asset.label}_thumb.jpg`;
  const files = [
    path.join(baseDir, asset.fileName || ""),
    path.join(baseDir, thumbName),
  ];
  files.forEach((p) => {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) {}
  });

  return true;
}

function mapInstructionAssetResponse(asset) {
  if (!asset || typeof asset !== "object") return null;
  return {
    ...asset,
    fileId: asset.fileId?.toString?.() || asset.fileId,
    thumbFileId: asset.thumbFileId?.toString?.() || asset.thumbFileId,
    url: resolveInstructionAssetUrl(asset.url, asset.fileName),
    thumbUrl: resolveInstructionAssetUrl(
      asset.thumbUrl || asset.url,
      asset.thumbFileName || asset.fileName,
    ),
  };
}

// GET: ดึงรายการ Image Collections ทั้งหมด
app.get("/admin/image-collections", async (req, res) => {
  try {
    const collections = await getImageCollections();
    res.json({ success: true, collections });
  } catch (err) {
    console.error("[Collections] list error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงรายการ Image Collections ได้",
    });
  }
});

app.get("/api/image-collections", async (req, res) => {
  try {
    const collections = await getImageCollections();
    res.json({ success: true, collections });
  } catch (err) {
    console.error("[Collections] API list error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงรายการ Image Collections ได้",
    });
  }
});

// GET: ดึง Image Collection เดียว
app.get("/admin/image-collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("image_collections");

    const collection = await coll.findOne({ _id: id });

    if (!collection) {
      return res.status(404).json({
        success: false,
        error: "ไม่พบ Image Collection",
      });
    }

    res.json({ success: true, collection });
  } catch (err) {
    console.error("[Collections] get error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงข้อมูล Image Collection ได้",
    });
  }
});

// POST: สร้าง Image Collection ใหม่
app.post("/admin/image-collections", async (req, res) => {
  try {
    const { name, description, imageLabels } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุชื่อ Collection",
      });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const collectionsColl = db.collection("image_collections");
    const assetsColl = db.collection("instruction_assets");

    // ดึงข้อมูลรูปภาพจาก labels ที่เลือก
    const selectedAssets = await assetsColl
      .find({
        label: { $in: imageLabels || [] },
      })
      .toArray();

    const images = selectedAssets.map((asset) => ({
      label: asset.label,
      slug: asset.slug || asset.label,
      url: asset.url,
      thumbUrl: asset.thumbUrl || asset.url,
      description: asset.description || asset.alt || "",
      fileName: asset.fileName,
      assetId: asset._id.toString(),
    }));

    const newCollection = {
      _id:
        "collection-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2, 9),
      name: name.trim(),
      description: (description || "").trim(),
      images: images,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await collectionsColl.insertOne(newCollection);

    res.json({
      success: true,
      collection: newCollection,
      message: `สร้าง Collection "${newCollection.name}" สำเร็จ (${images.length} รูป)`,
    });
  } catch (err) {
    console.error("[Collections] create error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถสร้าง Image Collection ได้",
    });
  }
});

// PUT: แก้ไข Image Collection
app.put("/admin/image-collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, imageLabels } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุชื่อ Collection",
      });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const collectionsColl = db.collection("image_collections");
    const assetsColl = db.collection("instruction_assets");

    // ตรวจสอบว่า collection มีอยู่หรือไม่
    const existing = await collectionsColl.findOne({ _id: id });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "ไม่พบ Image Collection",
      });
    }

    // ดึงข้อมูลรูปภาพจาก labels ที่เลือก
    const selectedAssets = await assetsColl
      .find({
        label: { $in: imageLabels || [] },
      })
      .toArray();

    const images = selectedAssets.map((asset) => ({
      label: asset.label,
      slug: asset.slug || asset.label,
      url: asset.url,
      thumbUrl: asset.thumbUrl || asset.url,
      description: asset.description || asset.alt || "",
      fileName: asset.fileName,
      assetId: asset._id.toString(),
    }));

    await collectionsColl.updateOne(
      { _id: id },
      {
        $set: {
          name: name.trim(),
          description: (description || "").trim(),
          images: images,
          updatedAt: new Date(),
        },
      },
    );

    const updated = await collectionsColl.findOne({ _id: id });

    res.json({
      success: true,
      collection: updated,
      message: `แก้ไข Collection "${updated.name}" สำเร็จ (${images.length} รูป)`,
    });
  } catch (err) {
    console.error("[Collections] update error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถแก้ไข Image Collection ได้",
    });
  }
});

// DELETE: ลบ Image Collection
app.delete("/admin/image-collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("image_collections");

    // ตรวจสอบว่าเป็น default collection หรือไม่
    const collection = await coll.findOne({ _id: id });
    if (!collection) {
      return res.status(404).json({
        success: false,
        error: "ไม่พบ Image Collection",
      });
    }

    if (collection.isDefault) {
      return res.status(400).json({
        success: false,
        error: "ไม่สามารถลบ Default Collection ได้",
      });
    }

    // ลบ collection reference จาก bots
    await db
      .collection("line_bots")
      .updateMany(
        { selectedImageCollections: id },
        { $pull: { selectedImageCollections: id } },
      );

    await db
      .collection("facebook_bots")
      .updateMany(
        { selectedImageCollections: id },
        { $pull: { selectedImageCollections: id } },
      );

    // ลบ collection
    await coll.deleteOne({ _id: id });

    res.json({
      success: true,
      message: `ลบ Collection "${collection.name}" สำเร็จ`,
    });
  } catch (err) {
    console.error("[Collections] delete error:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถลบ Image Collection ได้",
    });
  }
});

// ==================== END IMAGE COLLECTIONS API ====================

// Enhanced delete instruction with JSON response
app.delete("/admin/instructions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const deleteQueries = [];
    if (ObjectId.isValid(id)) {
      deleteQueries.push({ _id: new ObjectId(id) });
    }
    deleteQueries.push({ _id: id }); // กรณีที่ _id ถูกเก็บเป็นสตริง
    deleteQueries.push({ instructionId: id });

    let deleted = 0;
    for (const condition of deleteQueries) {
      const result = await coll.deleteOne(condition);
      if (result.deletedCount > 0) {
        deleted = result.deletedCount;
        break;
      }
    }

    if (deleted > 0) {
      res.json({ success: true, message: "ลบข้อมูลเรียบร้อยแล้ว" });
    } else {
      res.json({ success: false, error: "ไม่พบข้อมูลที่ต้องการลบ" });
    }
  } catch (err) {
    console.error("Delete instruction error:", err);
    res.json({ success: false, error: "ไม่สามารถลบข้อมูลได้" });
  }
});

// Show JSON for a table instruction
app.get("/admin/instructions/:id/json", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction || instruction.type !== "table") {
      return res.json({
        success: false,
        error: "ไม่พบ instruction หรือตรงประเภท",
      });
    }
    res.json({
      success: true,
      tableData: instruction.data,
      title: instruction.title || "",
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Broadcast page
app.get("/admin/broadcast", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const lineBots = await db.collection("line_bots").find({}).toArray();
    const facebookBots = await db
      .collection("facebook_bots")
      .find({})
      .toArray();
    res.render("admin-broadcast", { lineBots, facebookBots });
  } catch (err) {
    console.error("Error loading broadcast page:", err);
    res.render("admin-broadcast", {
      lineBots: [],
      facebookBots: [],
      error: "ไม่สามารถโหลดข้อมูลบอทได้",
    });
  }
});

// Broadcast action
app.post("/admin/broadcast", async (req, res) => {
  const { message, audience } = req.body;
  let { channels } = req.body;

  if (!Array.isArray(channels)) {
    channels = channels ? [channels] : [];
  }

  try {
    if (!message || channels.length === 0) {
      throw new Error("กรุณากรอกข้อความและเลือกช่องทาง");
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const chatColl = db.collection("chat_history");

    for (const ch of channels) {
      const [type, botId] = ch.split(":");
      const userIds = await chatColl.distinct("senderId", {
        platform: type,
        botId,
      });

      if (type === "facebook") {
        const fbBot = await db
          .collection("facebook_bots")
          .findOne({ _id: new ObjectId(botId) });
        if (!fbBot) continue;
        for (const userId of userIds) {
          try {
            await sendFacebookMessage(userId, message, fbBot.accessToken, {
              metadata: "broadcast_auto",
            });
          } catch (e) {
            console.log(
              `[Broadcast] Failed to send to Facebook user ${userId}: ${e.message}`,
            );
          }
        }
      } else if (type === "line") {
        const lineBot = await db
          .collection("line_bots")
          .findOne({ _id: new ObjectId(botId) });
        if (!lineBot) continue;
        const clientLine = createLineClient(
          lineBot.channelAccessToken,
          lineBot.channelSecret,
        );
        for (const userId of userIds) {
          try {
            await clientLine.pushMessage(userId, {
              type: "text",
              text: message,
            });
          } catch (e) {
            console.log(
              `[Broadcast] Failed to send to LINE user ${userId}: ${e.message}`,
            );
          }
        }
      }
    }

    const lineBots = await db.collection("line_bots").find({}).toArray();
    const facebookBots = await db
      .collection("facebook_bots")
      .find({})
      .toArray();
    res.render("admin-broadcast", {
      lineBots,
      facebookBots,
      success: "ส่งข้อความเรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("Broadcast error:", err);
    let lineBots = [],
      facebookBots = [];
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      lineBots = await db.collection("line_bots").find({}).toArray();
      facebookBots = await db.collection("facebook_bots").find({}).toArray();
    } catch (e) {}
    res.render("admin-broadcast", {
      lineBots,
      facebookBots,
      error: err.message,
    });
  }
});

// Follow-up page (stub)
app.get("/admin/followup", async (req, res) => {
  try {
    const analysisEnabled = await getSettingValue(
      "enableFollowUpAnalysis",
      true,
    );
    const showDashboard = await getSettingValue(
      "followUpShowInDashboard",
      true,
    );
    res.render("admin-followup", {
      followUpConfig: {
        analysisEnabled,
        showDashboard,
      },
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถโหลดหน้าติดตามลูกค้าได้:", error);
    res.render("admin-followup", {
      followUpConfig: {
        analysisEnabled: false,
        showDashboard: false,
      },
    });
  }
});

// Follow-up status page now redirects to unified dashboard
app.get("/admin/followup/status", (req, res) => {
  return res.redirect("/admin/followup");
});

app.get("/admin/followup/overview", async (req, res) => {
  try {
    const overview = await buildFollowUpOverview();
    res.json({
      success: true,
      summary: overview.summary,
      groups: overview.groups,
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถดึงข้อมูลสรุปได้:", error);
    res.json({
      success: false,
      error: error.message || "ไม่สามารถดึงข้อมูลสรุปได้",
    });
  }
});

app.get("/admin/followup/users", async (req, res) => {
  try {
    const { platform, botId } = req.query || {};
    const normalizedPlatform = platform || null;
    const normalizedBotId = botId ? normalizeFollowUpBotId(botId) : null;
    const contextConfig = await getFollowUpConfigForContext(
      normalizedPlatform || "line",
      normalizedBotId,
    );

    if (contextConfig.showInDashboard === false) {
      return res.json({
        success: false,
        disabled: true,
        message: "หน้าติดตามลูกค้าถูกปิดใช้งานสำหรับเพจนี้",
        config: contextConfig,
      });
    }

    const result = await getFollowUpUsers({
      platform: normalizedPlatform || undefined,
      botId: normalizedBotId || undefined,
    });

    res.json({
      success: true,
      users: result.users,
      summary: result.summary,
      config: contextConfig,
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถดึงรายการผู้ใช้ได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.post("/admin/followup/clear", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.json({ success: false, error: "กรุณาระบุ userId" });
    }
    const client = await connectDB();
    const db = client.db("chatbot");
    const existing = await db
      .collection("follow_up_status")
      .findOne({ senderId: userId });
    let platform = existing?.platform || null;
    let botId = existing ? normalizeFollowUpBotId(existing?.botId) : null;
    if (!platform) {
      const latestTask = await db
        .collection("follow_up_tasks")
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
      if (latestTask.length > 0) {
        platform = latestTask[0].platform || null;
        botId = normalizeFollowUpBotId(latestTask[0].botId);
      }
    }

    const contextConfig = await getFollowUpConfigForContext(
      platform || "line",
      botId,
    );
    if (contextConfig.showInDashboard === false) {
      // อนุญาตให้ล้างแท็กแม้ถูกปิดแสดง แต่แจ้งเตือนฝั่ง client
      console.warn(
        "[FollowUp] Clearing status on hidden page:",
        platform,
        botId,
      );
    }

    await cancelFollowUpTasksForUser(userId, platform, botId, {
      reason: "manual_clear",
    });
    await clearFollowUpStatus(userId);
    try {
      if (io) {
        io.emit("followUpTagged", {
          userId,
          hasFollowUp: false,
          followUpReason: "",
          followUpUpdatedAt: new Date(),
          platform,
          botId,
        });
      }
    } catch (_) {}
    res.json({ success: true });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถล้างสถานะได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.get("/admin/followup/page-settings", async (req, res) => {
  try {
    const result = await listFollowUpPageSettings();
    res.json({
      success: true,
      pages: result.pages,
      baseConfig: result.baseConfig,
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถดึงการตั้งค่าหน้าเพจได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.post("/admin/followup/page-settings", async (req, res) => {
  try {
    const { platform, botId, settings } = req.body || {};
    if (!platform || !["line", "facebook"].includes(platform)) {
      return res
        .status(400)
        .json({ success: false, error: "ระบุแพลตฟอร์มไม่ถูกต้อง" });
    }

    const normalizedBotId = normalizeFollowUpBotId(botId);
    const sanitized = {};
    const boolKeys = [
      "analysisEnabled",
      "showInChat",
      "showInDashboard",
      "autoFollowUpEnabled",
    ];
    const numberKeys = {};

    boolKeys.forEach((key) => {
      if (typeof settings?.[key] === "boolean") {
        sanitized[key] = settings[key];
      }
    });

    Object.keys(numberKeys).forEach((key) => {
      const value = settings?.[key];
      if (typeof value === "number" && !Number.isNaN(value)) {
        const range = numberKeys[key];
        const clamped = Math.min(Math.max(value, range.min), range.max);
        sanitized[key] = clamped;
      }
    });

    if (
      typeof settings?.model === "string" &&
      settings.model.trim().length > 0
    ) {
      sanitized.model = settings.model.trim();
    }

    if (Array.isArray(settings?.rounds)) {
      sanitized.rounds = normalizeFollowUpRounds(settings.rounds);
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_page_settings");

    await coll.updateOne(
      { platform, botId: normalizedBotId },
      {
        $set: {
          platform,
          botId: normalizedBotId,
          settings: sanitized,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    resetFollowUpConfigCache();

    res.json({ success: true });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถปรับปรุงการตั้งค่าหน้าเพจได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.delete("/admin/followup/page-settings", async (req, res) => {
  try {
    const { platform, botId } = req.body || {};
    if (!platform || !["line", "facebook"].includes(platform)) {
      return res
        .status(400)
        .json({ success: false, error: "ระบุแพลตฟอร์มไม่ถูกต้อง" });
    }
    const normalizedBotId = normalizeFollowUpBotId(botId);
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("follow_up_page_settings");

    await coll.deleteOne({ platform, botId: normalizedBotId });
    resetFollowUpConfigCache();

    res.json({ success: true });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถรีเซ็ตการตั้งค่าหน้าเพจได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.post(
  "/admin/followup/assets",
  imageUpload.array("images", 5),
  async (req, res) => {
    try {
      const files =
        Array.isArray(req.files) && req.files.length
          ? req.files
          : req.file
            ? [req.file]
            : [];
      if (!files.length) {
        return res
          .status(400)
          .json({ success: false, error: "กรุณาอัพโหลดไฟล์รูปภาพ" });
      }

      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("follow_up_assets");
      const bucket = new GridFSBucket(db, { bucketName: "followupAssets" });
      const urlBase = PUBLIC_BASE_URL
        ? PUBLIC_BASE_URL.replace(/\/$/, "")
        : req.get("host")
          ? `https://${req.get("host")}`
          : "";

      const assets = [];
      for (const file of files) {
        const image = sharp(file.buffer);
        const metadata = await image.metadata();
        const optimized = await image
          .jpeg({ quality: 88, progressive: true })
          .toBuffer();
        const sha256 = crypto
          .createHash("sha256")
          .update(optimized)
          .digest("hex");

        const existing = await coll.findOne({ sha256 });
        if (existing) {
          assets.push({
            id: existing._id?.toString(),
            assetId: existing._id?.toString(),
            url: existing.url,
            previewUrl: existing.thumbUrl || existing.url,
            thumbUrl: existing.thumbUrl,
            width: existing.width || null,
            height: existing.height || null,
            size: existing.size || null,
            fileName: existing.fileName || null,
          });
          continue;
        }

        const thumb = await sharp(optimized)
          .resize({
            width: 512,
            height: 512,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        const uniqueId = crypto.randomBytes(8).toString("hex");
        const timestamp = Date.now();
        const baseName = `followup_${timestamp}_${uniqueId}`;
        const fileName = `${baseName}.jpg`;
        const thumbName = `${baseName}_thumb.jpg`;
        const [fileId, thumbFileId] = await Promise.all([
          uploadBufferToGridFS(bucket, fileName, optimized, {
            contentType: "image/jpeg",
            metadata: {
              type: "original",
              width: metadata.width || null,
              height: metadata.height || null,
            },
          }),
          uploadBufferToGridFS(bucket, thumbName, thumb, {
            contentType: "image/jpeg",
            metadata: { type: "thumb" },
          }),
        ]);

        const assetDoc = {
          fileName,
          thumbName,
          thumbFileName: thumbName,
          fileId,
          thumbFileId,
          storage: "mongo",
          sha256,
          mime: "image/jpeg",
          size: optimized.length,
          width: metadata.width || null,
          height: metadata.height || null,
          url: `${urlBase}/assets/followup/${fileName}`,
          thumbUrl: `${urlBase}/assets/followup/${thumbName}`,
          originalName: file.originalname || "",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const insertResult = await coll.insertOne(assetDoc);
        const assetId = insertResult.insertedId?.toString();

        assets.push({
          id: assetId,
          assetId,
          url: assetDoc.url,
          previewUrl: assetDoc.thumbUrl || assetDoc.url,
          thumbUrl: assetDoc.thumbUrl,
          width: assetDoc.width,
          height: assetDoc.height,
          size: assetDoc.size,
          fileName: assetDoc.fileName,
        });
      }

      res.json({ success: true, assets });
    } catch (error) {
      console.error("[FollowUp] อัพโหลดรูปภาพไม่สำเร็จ:", error);
      res.status(400).json({
        success: false,
        error: error.message || "อัพโหลดรูปภาพไม่สำเร็จ",
      });
    }
  },
);

// ============================ Chat System Routes ============================

// Chat page
app.get("/admin/chat", async (req, res) => {
  try {
    const analysisEnabled = await getSettingValue(
      "enableFollowUpAnalysis",
      true,
    );
    const showInChat = await getSettingValue("followUpShowInChat", true);
    res.render("admin-chat", {
      followUpConfig: {
        analysisEnabled,
        showInChat,
      },
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถโหลดหน้าจัดการแชทได้:", error);
    res.render("admin-chat", {
      followUpConfig: {
        analysisEnabled: false,
        showInChat: false,
      },
    });
  }
});

app.get("/admin/orders", async (req, res) => {
  try {
    res.render("admin-orders");
  } catch (error) {
    console.error("[Orders] ไม่สามารถโหลดหน้าออเดอร์ได้:", error);
    res.render("admin-orders");
  }
});

app.get("/admin/orders/pages", async (req, res) => {
  try {
    const [pages, schedulingEnabled] = await Promise.all([
      listOrderCutoffPages(),
      getSettingValue("orderCutoffSchedulingEnabled", true),
    ]);

    res.json({
      success: true,
      pages,
      settings: {
        schedulingEnabled: !!schedulingEnabled,
        defaultCutoffTime: ORDER_DEFAULT_CUTOFF_TIME,
      },
    });
  } catch (error) {
    console.error("[Orders] ไม่สามารถโหลดการตั้งค่าเพจ:", error);
    res.json({ success: false, error: error.message });
  }
});

app.post("/admin/orders/pages/cutoff", async (req, res) => {
  try {
    const { pageKey, platform, botId, cutoffTime } = req.body || {};

    let targetPlatform = platform ? normalizeOrderPlatform(platform) : null;
    let targetBotId = typeof botId === "string" ? botId : null;

    if (pageKey && pageKey !== "all") {
      const parsed = parseOrderPageKey(pageKey);
      targetPlatform = parsed.platform || targetPlatform;
      targetBotId = parsed.botId === null ? null : parsed.botId || targetBotId;
    }

    if (!targetPlatform) {
      return res.json({
        success: false,
        error: "ไม่พบเพจที่ต้องการปรับเวลาตัดรอบ",
      });
    }

    const normalizedBotId =
      targetBotId === "default" ? null : normalizeOrderBotId(targetBotId);
    const safeCutoff = parseCutoffTime(cutoffTime || ORDER_DEFAULT_CUTOFF_TIME);

    const updated = await updateOrderCutoffSetting(
      targetPlatform,
      normalizedBotId,
      { cutoffTime: safeCutoff },
    );

    res.json({
      success: true,
      setting: {
        ...(updated || {}),
        cutoffTime: safeCutoff,
      },
    });
  } catch (error) {
    console.error("[Orders] ไม่สามารถบันทึกเวลาตัดรอบได้:", error);
    res.json({ success: false, error: error.message });
  }
});

app.post("/admin/orders/settings/scheduling", async (req, res) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.json({
        success: false,
        error: "กรุณาระบุสถานะเปิด/ปิดที่ถูกต้อง",
      });
    }

    await setSettingValue("orderCutoffSchedulingEnabled", enabled);
    await startOrderCutoffScheduler();

    res.json({ success: true, enabled });
  } catch (error) {
    console.error("[Orders] ไม่สามารถปรับสถานะ scheduler ได้:", error);
    res.json({ success: false, error: error.message });
  }
});

// Get users who have chatted
app.get("/admin/chat/users", async (req, res) => {
  try {
    // ใช้ฟังก์ชันตัวกรองข้อมูลใหม่
    const users = await getNormalizedChatUsers({ applyFilter: true });

    res.json({ success: true, users: users });
  } catch (err) {
    console.error("Error getting chat users:", err);
    res.json({ success: false, error: err.message });
  }
});

// Get per-user AI status
app.get("/admin/chat/user-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await getUserStatus(userId);
    res.json({
      success: true,
      aiEnabled: !!status.aiEnabled,
      updatedAt: status.updatedAt,
    });
  } catch (err) {
    console.error("Error getting user status:", err);
    res.json({ success: false, error: err.message });
  }
});

// Set per-user AI status
app.post("/admin/chat/user-status", async (req, res) => {
  try {
    const { userId, aiEnabled } = req.body || {};
    if (!userId || typeof aiEnabled === "undefined") {
      return res.json({ success: false, error: "ข้อมูลไม่ครบถ้วน" });
    }

    await setUserStatus(userId, !!aiEnabled);

    // บันทึกข้อความระบบลงประวัติ (ไม่ส่งถึงผู้ใช้จริง)
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");
    const lastChat = await coll.findOne(
      { senderId: userId },
      { sort: { timestamp: -1 } },
    );
    const platform = lastChat?.platform || "line";
    const botId = lastChat?.botId || null;

    const controlText = aiEnabled
      ? "เปิด AI สำหรับผู้ใช้นี้แล้ว"
      : "ปิด AI สำหรับผู้ใช้นี้ชั่วคราวแล้ว";
    const controlDoc = {
      senderId: userId,
      role: "assistant",
      content: `[ระบบ] ${controlText}`,
      timestamp: new Date(),
      source: "admin_chat",
      platform,
      botId,
    };
    const controlInsertResult = await coll.insertOne(controlDoc);
    if (controlInsertResult?.insertedId) {
      controlDoc._id = controlInsertResult.insertedId;
    }
    await appendOrderExtractionMessage(controlDoc);

    try {
      await resetUserUnreadCount(userId);
    } catch (_) {}

    // Notify admin UIs
    try {
      io.emit("newMessage", {
        userId,
        message: controlDoc,
        sender: "assistant",
        timestamp: controlDoc.timestamp,
      });
    } catch (_) {}

    res.json({ success: true, aiEnabled: !!aiEnabled });
  } catch (err) {
    console.error("Error setting user status:", err);
    res.json({ success: false, error: err.message });
  }
});

app.post("/admin/chat/users/:userId/refresh-profile", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.json({ success: false, error: "ไม่พบรหัสผู้ใช้" });
    }

    const { platform: bodyPlatform, botId: bodyBotId } = req.body || {};

    const client = await connectDB();
    const db = client.db("chatbot");
    const chatColl = db.collection("chat_history");

    let platform = bodyPlatform || null;
    let botId = bodyBotId || null;

    if (!platform || !botId) {
      const lastChat = await chatColl.findOne(
        { senderId: userId },
        { sort: { timestamp: -1 }, projection: { platform: 1, botId: 1 } },
      );
      platform = platform || lastChat?.platform || null;
      botId = botId || lastChat?.botId || null;
    }

    if (platform !== "facebook") {
      return res.json({
        success: false,
        error: "สามารถอัปเดตได้เฉพาะผู้ใช้ Facebook เท่านั้น",
      });
    }

    if (!botId) {
      return res.json({
        success: false,
        error: "ไม่พบข้อมูลเพจสำหรับผู้ใช้นี้",
      });
    }

    const fbColl = db.collection("facebook_bots");
    let facebookBot = null;

    if (ObjectId.isValid(botId)) {
      facebookBot = await fbColl.findOne({ _id: new ObjectId(botId) });
    }
    if (!facebookBot) {
      facebookBot = await fbColl.findOne({ _id: botId });
    }
    if (!facebookBot) {
      facebookBot = await fbColl.findOne({ pageId: botId });
    }

    if (!facebookBot || !facebookBot.accessToken) {
      return res.json({
        success: false,
        error: "ไม่พบข้อมูลเพจหรือ Access Token ของ Facebook Bot",
      });
    }

    await ensureFacebookProfileDisplayName(userId, facebookBot.accessToken);

    const profile = await db
      .collection("user_profiles")
      .findOne(
        { userId, platform: "facebook" },
        { projection: { displayName: 1, updatedAt: 1 } },
      );

    if (!profile?.displayName) {
      return res.json({
        success: false,
        error: "ไม่สามารถดึงชื่อจาก Facebook ได้",
      });
    }

    res.json({
      success: true,
      displayName: profile.displayName,
      updatedAt: profile.updatedAt || null,
    });
  } catch (error) {
    console.error("[Chat] refresh-profile error:", error);
    res.json({ success: false, error: error.message || "เกิดข้อผิดพลาด" });
  }
});

app.post("/admin/chat/mark-read/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.json({ success: false, error: "ไม่พบรหัสผู้ใช้" });
    }

    await resetUserUnreadCount(userId);
    res.json({ success: true });
  } catch (error) {
    console.error("[Chat] mark-read error:", error);
    res.json({ success: false, error: error.message || "เกิดข้อผิดพลาด" });
  }
});

// Get chat history for a specific user
app.get("/admin/chat/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // ใช้ฟังก์ชันตัวกรองข้อมูลใหม่
    const messages = await getNormalizedChatHistory(userId);

    // รีเซ็ต unread count เมื่อแอดมินดูประวัติการสนทนา
    await resetUserUnreadCount(userId);

    res.json({ success: true, messages: messages });
  } catch (err) {
    console.error("Error getting chat history:", err);
    res.json({ success: false, error: err.message });
  }
});

// Send message as admin (AI assistant)
app.post("/admin/chat/send", async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.json({ success: false, error: "ข้อมูลไม่ครบถ้วน" });
    }

    // ตรวจจับคำสั่งควบคุมจากแอดมิน
    const trimmed = String(message).trim();

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");

    // Determine platform and bot from latest chat
    const lastChat = await coll.findOne(
      { senderId: userId },
      { sort: { timestamp: -1 } },
    );
    const platform = lastChat?.platform || "line";
    const botId = lastChat?.botId || null;

    // ดึงข้อมูล bot เพื่อตรวจสอบ keyword settings
    let keywordSettings = {};
    if (botId && ObjectId.isValid(botId)) {
      const botColl =
        platform === "facebook"
          ? db.collection("facebook_bots")
          : db.collection("line_bots");
      const bot = await botColl.findOne({ _id: new ObjectId(botId) });
      if (bot && bot.keywordSettings) {
        keywordSettings = bot.keywordSettings;
      }
    }

    // ตรวจสอบ keyword actions ก่อน (เช่น เปิด/ปิด AI, ปิดระบบติดตาม)
    const keywordResult = await detectKeywordAction(
      trimmed,
      keywordSettings,
      userId,
      platform,
      botId,
      true, // isFromAdmin = true
    );

    if (keywordResult.action) {
      // ถ้ามี keyword action และต้องการส่งข้อความตอบกลับ
      if (keywordResult.sendResponse && keywordResult.message) {
        const controlDoc = {
          senderId: userId,
          role: "assistant",
          content: `[ระบบ] ${keywordResult.message}`,
          timestamp: new Date(),
          source: "admin_chat",
          platform,
          botId,
        };
        const controlInsertResult = await coll.insertOne(controlDoc);
        if (controlInsertResult?.insertedId) {
          controlDoc._id = controlInsertResult.insertedId;
        }
        await appendOrderExtractionMessage(controlDoc);
        await resetUserUnreadCount(userId);

        // Emit เพื่ออัปเดต UI ของแอดมิน
        io.emit("newMessage", {
          userId: userId,
          message: controlDoc,
          sender: "assistant",
          timestamp: controlDoc.timestamp,
        });

        return res.json({
          success: true,
          control: true,
          displayMessage: keywordResult.message,
          skipEcho: true,
        });
      } else {
        // ไม่ส่งข้อความตอบกลับ แต่ดำเนินการสำเร็จ
        return res.json({
          success: true,
          control: true,
          displayMessage: "ดำเนินการเรียบร้อยแล้ว (ไม่ส่งข้อความตอบกลับ)",
          skipEcho: true,
          silent: true,
        });
      }
    }

    // กรณีเป็นคำสั่ง [ปิด] / [เปิด] (legacy)
    if (trimmed === "[ปิด]" || trimmed === "[เปิด]") {
      const enable = trimmed === "[เปิด]";
      await setUserStatus(userId, enable);

      const controlText = enable
        ? "เปิด AI สำหรับผู้ใช้นี้แล้ว"
        : "ปิด AI สำหรับผู้ใช้นี้ชั่วคราวแล้ว";
      const controlDoc = {
        senderId: userId,
        role: "assistant",
        content: `[ระบบ] ${controlText}`,
        timestamp: new Date(),
        source: "admin_chat",
        platform,
        botId,
      };
      const legacyControlInsert = await coll.insertOne(controlDoc);
      if (legacyControlInsert?.insertedId) {
        controlDoc._id = legacyControlInsert.insertedId;
      }
      await appendOrderExtractionMessage(controlDoc);

      // รีเซ็ต unread count เมื่อแอดมินตอบกลับ
      await resetUserUnreadCount(userId);

      // ไม่ส่งข้อความควบคุมไปยังผู้ใช้

      // Emit เพื่ออัปเดต UI ของแอดมิน
      io.emit("newMessage", {
        userId: userId,
        message: controlDoc,
        sender: "assistant",
        timestamp: controlDoc.timestamp,
      });

      return res.json({
        success: true,
        control: true,
        displayMessage: controlText,
        skipEcho: true,
      });
    }

    // ส่งต่อไปยังแพลตฟอร์มของผู้ใช้ (และหลีกเลี่ยงการบันทึกซ้ำในกรณี Facebook เพื่อกันแสดงซ้ำ)
    if (platform === "facebook") {
      try {
        if (botId) {
          const fbBot = await db
            .collection("facebook_bots")
            .findOne({ _id: new ObjectId(botId) });
          if (fbBot) {
            await sendFacebookMessage(userId, message, fbBot.accessToken, {
              metadata: "admin_manual",
            });
            console.log(
              `[Admin Chat] ส่งข้อความไปยัง Facebook user ${userId}: ${message.substring(0, 50)}...`,
            );
            // ไม่ insert messageDoc และไม่ emit ที่นี่ ให้รอ Facebook echo บันทึกและกระจาย UI แทน
            return res.json({ success: true, skipEcho: true });
          }
        }
        // ถ้าไม่มี fbBot ให้ถือว่าไม่สามารถส่งได้
        return res.json({
          success: false,
          error: "ไม่พบ Facebook Bot สำหรับผู้ใช้นี้",
        });
      } catch (fbError) {
        console.log(
          `[Admin Chat] ไม่สามารถส่งไปยัง Facebook ได้: ${fbError.message}`,
        );
        return res.json({
          success: false,
          error: "ไม่สามารถส่งไปยัง Facebook ได้",
        });
      }
    }

    // LINE หรือแพลตฟอร์มอื่น: insert และ emit ตามปกติ
    const messageDoc = {
      senderId: userId,
      role: "assistant",
      content: message,
      timestamp: new Date(),
      source: "admin_chat",
      platform,
      botId,
    };

    const messageInsertResult = await coll.insertOne(messageDoc);
    if (messageInsertResult?.insertedId) {
      messageDoc._id = messageInsertResult.insertedId;
    }
    await appendOrderExtractionMessage(messageDoc);
    await resetUserUnreadCount(userId);

    try {
      await lineClient.pushMessage(userId, { type: "text", text: message });
      console.log(
        `[Admin Chat] ส่งข้อความไปยัง LINE user ${userId}: ${message.substring(0, 50)}...`,
      );
    } catch (lineError) {
      console.log(
        `[Admin Chat] ไม่สามารถส่งไปยัง LINE ได้: ${lineError.message}`,
      );
      // ไม่ return error เพราะข้อความยังบันทึกลง database ได้
    }

    io.emit("newMessage", {
      userId,
      message: messageDoc,
      sender: "assistant",
      timestamp: messageDoc.timestamp,
    });

    res.json({ success: true, message: "ส่งข้อความเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error sending admin message:", err);
    res.json({ success: false, error: err.message });
  }
});

// Clear chat history for a user
app.delete("/admin/chat/clear/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await clearUserChatHistory(userId);

    // รีเซ็ต unread count เมื่อล้างประวัติ
    await resetUserUnreadCount(userId);

    // Emit to socket clients
    io.emit("chatCleared", { userId });

    res.json({ success: true, message: "ล้างประวัติการสนทนาเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error clearing chat:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========== Tag Management APIs ==========

// Get tags for a specific user
app.get("/admin/chat/tags/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const tagsColl = db.collection("user_tags");

    const userTags = await tagsColl.findOne({ userId });

    res.json({
      success: true,
      tags: userTags ? userTags.tags : [],
    });
  } catch (err) {
    console.error("Error getting user tags:", err);
    res.json({ success: false, error: err.message });
  }
});

// Set tags for a specific user
app.post("/admin/chat/tags/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.json({ success: false, error: "tags ต้องเป็น array" });
    }

    // ตรวจสอบและทำความสะอาด tags
    const cleanTags = tags
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0 && tag.length <= 50)
      .slice(0, 20); // จำกัดไม่เกิน 20 tags ต่อคน

    const client = await connectDB();
    const db = client.db("chatbot");
    const tagsColl = db.collection("user_tags");

    await tagsColl.updateOne(
      { userId },
      {
        $set: {
          tags: cleanTags,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    // Emit to socket clients
    io.emit("userTagsUpdated", { userId, tags: cleanTags });

    res.json({ success: true, tags: cleanTags });
  } catch (err) {
    console.error("Error setting user tags:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========== Message Feedback APIs ==========

app.post("/admin/chat/feedback", async (req, res) => {
  try {
    const { messageId, userId, feedback, notes } = req.body || {};
    const trimmedUserId = typeof userId === "string" ? userId.trim() : "";
    const allowedFeedback = ["positive", "negative", "clear"];

    if (!messageId || !trimmedUserId || !feedback) {
      return res.json({ success: false, error: "ข้อมูลไม่ครบถ้วน" });
    }

    if (!allowedFeedback.includes(feedback)) {
      return res.json({ success: false, error: "ประเภทการประเมินไม่ถูกต้อง" });
    }

    const messageObjectId = toObjectId(messageId);
    if (!messageObjectId) {
      return res.json({ success: false, error: "รหัสข้อความไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const historyColl = db.collection("chat_history");
    const feedbackColl = db.collection("chat_feedback");

    const messageDoc = await historyColl.findOne({ _id: messageObjectId });
    if (!messageDoc) {
      return res.json({
        success: false,
        error: "ไม่พบข้อความที่ต้องการประเมิน",
      });
    }

    if (messageDoc.senderId !== trimmedUserId) {
      return res.json({
        success: false,
        error: "ข้อความนี้ไม่ตรงกับผู้ใช้ที่กำหนด",
      });
    }

    if (messageDoc.role !== "assistant") {
      return res.json({
        success: false,
        error: "สามารถประเมินได้เฉพาะข้อความของ AI เท่านั้น",
      });
    }

    if (feedback === "clear") {
      await feedbackColl.deleteOne({ messageId: messageObjectId });
      return res.json({ success: true, feedback: null });
    }

    const sanitizedNotes =
      typeof notes === "string" ? notes.trim().substring(0, 500) : "";
    const now = new Date();

    await feedbackColl.updateOne(
      { messageId: messageObjectId },
      {
        $set: {
          messageId: messageObjectId,
          messageIdString: messageObjectId.toString(),
          userId: trimmedUserId,
          senderId: messageDoc.senderId,
          senderRole: messageDoc.role || null,
          platform: messageDoc.platform || null,
          botId: messageDoc.botId || null,
          feedback,
          notes: sanitizedNotes,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );

    res.json({
      success: true,
      feedback,
      notes: sanitizedNotes,
      updatedAt: now,
    });
  } catch (err) {
    console.error("Error saving chat feedback:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========== Order Management APIs ==========

// Get orders for a specific user
app.get("/admin/chat/orders/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await getUserOrders(userId);

    res.json({
      success: true,
      orders: orders,
    });
  } catch (err) {
    console.error("Error getting user orders:", err);
    res.json({ success: false, error: err.message });
  }
});

// Extract order manually from chat history
app.post("/admin/chat/orders/extract", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.json({ success: false, error: "userId จำเป็น" });
    }

    const messages = await getNormalizedChatHistory(userId, {
      applyFilter: true,
    });
    if (!messages || messages.length === 0) {
      return res.json({ success: false, error: "ไม่พบประวัติการสนทนา" });
    }

    const unprocessedMessages = messages.filter(
      (msg) => !msg.orderExtractionRoundId,
    );
    if (!unprocessedMessages.length) {
      return res.json({
        success: true,
        hasOrder: false,
        reason: "ไม่มีข้อความใหม่สำหรับการสกัด",
      });
    }

    const targetMessages = unprocessedMessages.slice(-50);
    const messageIds = targetMessages
      .map((msg) => msg.messageId)
      .filter(Boolean);

    if (!messageIds.length) {
      return res.json({
        success: true,
        hasOrder: false,
        reason: "ไม่พบข้อความใหม่ที่สามารถสกัดได้",
      });
    }

    const existingOrders = await getUserOrders(userId);
    const latestOrder = existingOrders?.[0];

    const analysis = await analyzeOrderFromChat(userId, targetMessages, {
      previousAddress: latestOrder?.orderData?.shippingAddress || null,
      previousCustomerName: latestOrder?.orderData?.customerName || null,
    });

    if (!analysis) {
      return res.json({
        success: false,
        error: "ไม่สามารถวิเคราะห์ออเดอร์ได้",
      });
    }

    if (!analysis.hasOrder) {
      return res.json({
        success: true,
        hasOrder: false,
        reason: analysis.reason,
        confidence: analysis.confidence,
      });
    }

    const duplicateOrder = findDuplicateOrder(
      existingOrders,
      analysis.orderData,
    );
    if (duplicateOrder) {
      const extractionRoundId = new ObjectId().toString();
      await markMessagesAsOrderExtracted(
        userId,
        messageIds,
        extractionRoundId,
        duplicateOrder?._id?.toString?.() || null,
      );

      return res.json({
        success: true,
        hasOrder: false,
        reason: "พบออเดอร์เดิม",
        confidence: analysis.confidence,
      });
    }

    const lastMessage =
      targetMessages[targetMessages.length - 1] ||
      messages[messages.length - 1];
    const platform = lastMessage?.platform || "line";
    const botId = lastMessage?.botId || null;

    const orderId = await saveOrderToDatabase(
      userId,
      platform,
      botId,
      analysis.orderData,
      "manual_extraction",
      true,
    );

    if (!orderId) {
      return res.json({ success: false, error: "ไม่สามารถบันทึกออเดอร์ได้" });
    }

    const extractionRoundId = new ObjectId().toString();
    await markMessagesAsOrderExtracted(
      userId,
      messageIds,
      extractionRoundId,
      orderId?.toString?.() || orderId,
    );

    await maybeAnalyzeFollowUp(userId, platform, botId, {
      reasonOverride: analysis.reason,
      followUpUpdatedAt: new Date(),
      forceUpdate: true,
    });

    try {
      if (io) {
        io.emit("orderExtracted", {
          userId,
          orderId,
          orderData: analysis.orderData,
          isManualExtraction: true,
          extractedAt: new Date(),
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      hasOrder: true,
      orderId,
      orderData: analysis.orderData,
      confidence: analysis.confidence,
      reason: analysis.reason,
    });
  } catch (err) {
    console.error("Error extracting order:", err);
    res.json({ success: false, error: err.message });
  }
});

// Update order
app.put("/admin/chat/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderData, status, notes } = req.body;

    if (!ObjectId.isValid(orderId)) {
      return res.json({ success: false, error: "orderId ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const updateDoc = {
      updatedAt: new Date(),
    };

    if (orderData) {
      updateDoc.orderData = {
        ...orderData,
        shippingCost: normalizeShippingCostValue(orderData.shippingCost),
        customerName: normalizeCustomerName(orderData.customerName),
      };
    }
    if (status) {
      updateDoc.status = status;
    }
    if (notes !== undefined) {
      updateDoc.notes = notes;
    }

    const result = await coll.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: updateDoc },
    );

    if (result.matchedCount === 0) {
      return res.json({ success: false, error: "ไม่พบออเดอร์" });
    }

    // ดึงข้อมูลออเดอร์ที่อัปเดตแล้ว
    const updatedOrder = await coll.findOne({ _id: new ObjectId(orderId) });

    // Emit socket event
    try {
      if (io) {
        io.emit("orderUpdated", {
          orderId,
          userId: updatedOrder.userId,
          orderData: updatedOrder.orderData,
          status: updatedOrder.status,
          notes: updatedOrder.notes,
          updatedAt: updatedOrder.updatedAt,
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Error updating order:", err);
    res.json({ success: false, error: err.message });
  }
});

// Delete order
app.delete("/admin/chat/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!ObjectId.isValid(orderId)) {
      return res.json({ success: false, error: "orderId ไม่ถูกต้อง" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    // ดึงข้อมูลออเดอร์ก่อนลบ
    const order = await coll.findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      return res.json({ success: false, error: "ไม่พบออเดอร์" });
    }

    const result = await coll.deleteOne({ _id: new ObjectId(orderId) });

    if (result.deletedCount === 0) {
      return res.json({ success: false, error: "ไม่สามารถลบออเดอร์ได้" });
    }

    // Emit socket event
    try {
      if (io) {
        io.emit("orderDeleted", {
          orderId,
          userId: order.userId,
        });
      }
    } catch (_) {}

    await maybeAnalyzeFollowUp(order.userId, order.platform, order.botId, {
      forceUpdate: true,
    });

    res.json({
      success: true,
      message: "ลบออเดอร์เรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.json({ success: false, error: err.message });
  }
});

// Get all orders (for reporting)
app.get("/admin/chat/orders", async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const query = {};
    if (status) {
      query.status = status;
    }

    const orders = await coll
      .find(query)
      .sort({ extractedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .toArray();

    const totalCount = await coll.countDocuments(query);

    res.json({
      success: true,
      orders,
      totalCount,
      hasMore: parseInt(offset) + orders.length < totalCount,
    });
  } catch (err) {
    console.error("Error getting all orders:", err);
    res.json({ success: false, error: err.message });
  }
});

// Get all available tags in the system
app.get("/admin/chat/available-tags", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const tagsColl = db.collection("user_tags");

    // ดึงแท็กทั้งหมดจากผู้ใช้ทั้งหมด
    const allUserTags = await tagsColl.find({}).toArray();

    // รวมแท็กทั้งหมดและนับจำนวนการใช้งาน
    const tagCount = {};
    allUserTags.forEach((userTag) => {
      if (userTag.tags && Array.isArray(userTag.tags)) {
        userTag.tags.forEach((tag) => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      }
    });

    // แปลงเป็น array และเรียงตามความนิยม
    const availableTags = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50); // เอาแค่ 50 tags ที่นิยมสุด

    res.json({ success: true, tags: availableTags });
  } catch (err) {
    console.error("Error getting available tags:", err);
    res.json({ success: false, error: err.message });
  }
});

// Toggle purchase status
app.post("/admin/chat/purchase-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { hasPurchased } = req.body;

    if (typeof hasPurchased !== "boolean") {
      return res.json({
        success: false,
        error: "hasPurchased ต้องเป็น boolean",
      });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const statusColl = db.collection("user_purchase_status");

    await statusColl.updateOne(
      { userId },
      {
        $set: {
          hasPurchased,
          updatedAt: new Date(),
          updatedBy: "admin",
        },
      },
      { upsert: true },
    );

    // Emit to socket clients
    io.emit("userPurchaseStatusUpdated", { userId, hasPurchased });

    res.json({ success: true, hasPurchased });
  } catch (err) {
    console.error("Error setting purchase status:", err);
    res.json({ success: false, error: err.message });
  }
});

// Get total unread count for all users
app.get("/admin/chat/unread-count", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    const result = await coll
      .aggregate([
        {
          $group: {
            _id: null,
            totalUnread: { $sum: "$unreadCount" },
          },
        },
      ])
      .toArray();

    const totalUnread = result.length > 0 ? result[0].totalUnread : 0;

    res.json({ success: true, totalUnread });
  } catch (err) {
    console.error("Error getting unread count:", err);
    res.json({ success: false, error: err.message });
  }
});

// ============================ Settings API Endpoints ============================

// Get all settings
app.get("/api/settings", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    const settings = await coll.find({}).toArray();
    const settingsObj = {};

    settings.forEach((setting) => {
      settingsObj[setting.key] = setting.value;
    });

    // Set default values if not exists
    const defaultSettings = {
      chatDelaySeconds: 0,
      maxQueueMessages: 10,
      enableMessageMerging: true,
      showTokenUsage: false,
      audioAttachmentResponse: DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
      textModel: "gpt-5",
      visionModel: "gpt-5",
      maxImagesPerMessage: 3,
      defaultInstruction: "",
      aiEnabled: true,
      enableChatHistory: true,
      enableAdminNotifications: true,
      systemMode: "production",
      // การตั้งค่าการกรองข้อความ
      enableMessageFiltering: true,
      hiddenWords: "",
      replacementText: "[ข้อความถูกซ่อน]",
      enableStrictFiltering: true,
      enableFollowUpAnalysis: true,
      followUpShowInChat: true,
      followUpShowInDashboard: true,
    };

    // Merge with existing settings
    const finalSettings = { ...defaultSettings, ...settingsObj };

    res.json(finalSettings);
  } catch (err) {
    console.error("Error getting settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save chat settings
app.post("/api/settings/chat", async (req, res) => {
  try {
    const {
      chatDelaySeconds,
      maxQueueMessages,
      enableMessageMerging,
      showTokenUsage,
      enableFollowUpAnalysis,
      followUpShowInChat,
      followUpShowInDashboard,
      audioAttachmentResponse,
    } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    // Validate input
    if (chatDelaySeconds < 0 || chatDelaySeconds > 60) {
      return res.status(400).json({
        success: false,
        error: "ระยะเวลาดีเลย์ต้องอยู่ระหว่าง 0-60 วินาที",
      });
    }

    if (maxQueueMessages < 1 || maxQueueMessages > 20) {
      return res.status(400).json({
        success: false,
        error: "จำนวนข้อความในคิวต้องอยู่ระหว่าง 1-20",
      });
    }

    // Save settings
    await coll.updateOne(
      { key: "chatDelaySeconds" },
      { $set: { value: chatDelaySeconds } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "maxQueueMessages" },
      { $set: { value: maxQueueMessages } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableMessageMerging" },
      { $set: { value: enableMessageMerging } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "showTokenUsage" },
      { $set: { value: showTokenUsage } },
      { upsert: true },
    );

    const sanitizedAudioResponse =
      typeof audioAttachmentResponse === "string"
        ? audioAttachmentResponse.trim()
        : "";
    const finalAudioResponse =
      sanitizedAudioResponse || DEFAULT_AUDIO_ATTACHMENT_RESPONSE;

    if (finalAudioResponse.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "ข้อความตอบกลับไฟล์เสียงต้องไม่เกิน 1000 ตัวอักษร",
      });
    }

    await coll.updateOne(
      { key: "audioAttachmentResponse" },
      { $set: { value: finalAudioResponse } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableFollowUpAnalysis" },
      { $set: { value: !!enableFollowUpAnalysis } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "followUpShowInChat" },
      { $set: { value: !!followUpShowInChat } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "followUpShowInDashboard" },
      { $set: { value: !!followUpShowInDashboard } },
      { upsert: true },
    );
    resetFollowUpConfigCache();

    res.json({ success: true, message: "บันทึกการตั้งค่าแชทเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error saving chat settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save AI settings
app.post("/api/settings/ai", async (req, res) => {
  try {
    const { textModel, visionModel, maxImagesPerMessage, defaultInstruction } =
      req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    // Validate input
    const validModels = [
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-chat-latest",
      "gpt-5-nano",
      "gpt-4.1",
      "gpt-4.1-mini",
      "o3",
    ];

    if (!validModels.includes(textModel)) {
      return res
        .status(400)
        .json({ success: false, error: "โมเดลข้อความไม่ถูกต้อง" });
    }

    if (!validModels.includes(visionModel)) {
      return res
        .status(400)
        .json({ success: false, error: "โมเดลรูปภาพไม่ถูกต้อง" });
    }

    if (maxImagesPerMessage < 1 || maxImagesPerMessage > 10) {
      return res
        .status(400)
        .json({ success: false, error: "จำนวนรูปภาพต้องอยู่ระหว่าง 1-10" });
    }

    // Save settings
    await coll.updateOne(
      { key: "textModel" },
      { $set: { value: textModel } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "visionModel" },
      { $set: { value: visionModel } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "maxImagesPerMessage" },
      { $set: { value: maxImagesPerMessage } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "defaultInstruction" },
      { $set: { value: defaultInstruction || "" } },
      { upsert: true },
    );

    res.json({ success: true, message: "บันทึกการตั้งค่า AI เรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error saving AI settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save system settings
app.post("/api/settings/system", async (req, res) => {
  try {
    const {
      aiEnabled,
      enableChatHistory,
      enableAdminNotifications,
      systemMode,
    } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    // Validate input
    const validSystemModes = ["production", "development", "maintenance"];

    if (!validSystemModes.includes(systemMode)) {
      return res
        .status(400)
        .json({ success: false, error: "โหมดระบบไม่ถูกต้อง" });
    }

    // Save settings
    await coll.updateOne(
      { key: "aiEnabled" },
      { $set: { value: aiEnabled } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableChatHistory" },
      { $set: { value: enableChatHistory } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableAdminNotifications" },
      { $set: { value: enableAdminNotifications } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "systemMode" },
      { $set: { value: systemMode } },
      { upsert: true },
    );

    res.json({ success: true, message: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว" });
  } catch (err) {
    console.error("Error saving system settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API endpoint สำหรับบันทึกการตั้งค่าการกรอง
app.post("/api/settings/filter", async (req, res) => {
  try {
    const {
      enableMessageFiltering,
      hiddenWords,
      replacementText,
      enableStrictFiltering,
    } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");

    await coll.updateOne(
      { key: "enableMessageFiltering" },
      { $set: { value: enableMessageFiltering } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "hiddenWords" },
      { $set: { value: hiddenWords } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "replacementText" },
      { $set: { value: replacementText } },
      { upsert: true },
    );

    await coll.updateOne(
      { key: "enableStrictFiltering" },
      { $set: { value: enableStrictFiltering } },
      { upsert: true },
    );

    res.json({
      success: true,
      message: "บันทึกการตั้งค่าการกรองเรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("Error saving filter settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin/orders/data", async (req, res) => {
  try {
    const { query } = buildOrderQuery(req.query || {});
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = (page - 1) * limit;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const ordersCursor = coll
      .find(query)
      .sort({ extractedAt: -1 })
      .skip(skip)
      .limit(limit);

    const [orders, totalCount, statusAgg, totalsAgg] = await Promise.all([
      ordersCursor.toArray(),
      coll.countDocuments(query),
      coll
        .aggregate([
          { $match: query },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ])
        .toArray(),
      coll
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalAmount: {
                $sum: { $ifNull: ["$orderData.totalAmount", 0] },
              },
              totalShipping: {
                $sum: { $ifNull: ["$orderData.shippingCost", 0] },
              },
            },
          },
        ])
        .toArray(),
    ]);

    const userIds = Array.from(
      new Set(orders.map((order) => order.userId).filter(Boolean)),
    );
    let profiles = [];
    if (userIds.length) {
      profiles = await db
        .collection("user_profiles")
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, displayName: 1 })
        .toArray();
    }

    const profileMap = {};
    profiles.forEach((profile) => {
      profileMap[profile.userId] = profile.displayName;
    });

    const botIdSets = {
      line: new Set(),
      facebook: new Set(),
    };

    orders.forEach((order) => {
      const platform = normalizeOrderPlatform(order.platform || "line");
      const rawBotId = order.botId || null;
      const botIdStr =
        rawBotId && typeof rawBotId.toString === "function"
          ? rawBotId.toString()
          : rawBotId || null;
      if (botIdStr) {
        botIdSets[platform].add(botIdStr);
      }
    });

    let lineBotDocs = [];
    let facebookBotDocs = [];

    const lineBotIds = [...botIdSets.line].filter((id) => ObjectId.isValid(id));
    if (lineBotIds.length) {
      lineBotDocs = await db
        .collection("line_bots")
        .find({ _id: { $in: lineBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, displayName: 1, botName: 1 })
        .toArray();
    }

    const facebookBotIds = [...botIdSets.facebook].filter((id) =>
      ObjectId.isValid(id),
    );
    if (facebookBotIds.length) {
      facebookBotDocs = await db
        .collection("facebook_bots")
        .find({ _id: { $in: facebookBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, pageName: 1 })
        .toArray();
    }

    const pageNameMap = new Map();
    lineBotDocs.forEach((bot) => {
      const key = buildOrderPageKey("line", bot._id.toString());
      const label =
        bot.displayName ||
        bot.name ||
        bot.botName ||
        `LINE Bot (${bot._id.toString().slice(-4)})`;
      pageNameMap.set(key, label);
    });
    facebookBotDocs.forEach((bot) => {
      const key = buildOrderPageKey("facebook", bot._id.toString());
      const label =
        bot.pageName ||
        bot.name ||
        `Facebook Page (${bot._id.toString().slice(-4)})`;
      pageNameMap.set(key, label);
    });

    const formattedOrders = orders.map((order) => {
      const orderData = order.orderData || {};
      const customerName = normalizeCustomerName(orderData.customerName);
      const displayName =
        customerName || profileMap[order.userId] || order.userId || "";
      const platform = normalizeOrderPlatform(order.platform || "line");
      const rawBotId = order.botId || null;
      const botId =
        rawBotId && typeof rawBotId.toString === "function"
          ? rawBotId.toString()
          : rawBotId || null;
      const pageKey = buildOrderPageKey(platform, botId);
      const pageName =
        pageNameMap.get(pageKey) ||
        (botId
          ? `${platform === "facebook" ? "Facebook" : "LINE"} (${botId})`
          : null);
      return {
        id: order._id?.toString?.() || "",
        userId: order.userId || "",
        displayName,
        customerName: customerName || "",
        platform,
        botId,
        pageKey,
        pageName,
        status: order.status || "pending",
        totalAmount: orderData.totalAmount || 0,
        shippingCost: orderData.shippingCost || 0,
        paymentMethod: orderData.paymentMethod || null,
        shippingAddress: orderData.shippingAddress || null,
        phone: orderData.phone || null,
        items: Array.isArray(orderData.items) ? orderData.items : [],
        extractedAt: order.extractedAt || null,
        notes: order.notes || "",
        isManualExtraction: !!order.isManualExtraction,
        extractedFrom: order.extractedFrom || null,
      };
    });

    const statusCounts = {};
    statusAgg.forEach((entry) => {
      statusCounts[entry._id || "unknown"] = entry.count;
    });

    const totalsEntry = totalsAgg[0] || { totalAmount: 0, totalShipping: 0 };

    res.json({
      success: true,
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit) || 1,
      },
      summary: {
        totalOrders: totalCount,
        totalAmount: totalsEntry.totalAmount || 0,
        totalShipping: totalsEntry.totalShipping || 0,
      },
      statusCounts,
    });
  } catch (error) {
    console.error("[Orders] ไม่สามารถดึงข้อมูลออเดอร์ได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/admin/orders/export", async (req, res) => {
  try {
    const { query } = buildOrderQuery(req.query || {});
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("orders");

    const orders = await coll
      .find(query)
      .sort({ extractedAt: -1 })
      .limit(5000)
      .toArray();

    const userIds = Array.from(
      new Set(orders.map((order) => order.userId).filter(Boolean)),
    );
    let profiles = [];
    if (userIds.length) {
      profiles = await db
        .collection("user_profiles")
        .find({ userId: { $in: userIds } })
        .project({ userId: 1, displayName: 1 })
        .toArray();
    }

    const profileMap = {};
    profiles.forEach((profile) => {
      profileMap[profile.userId] = profile.displayName;
    });

    const botIdSets = {
      line: new Set(),
      facebook: new Set(),
    };

    orders.forEach((order) => {
      const platform = normalizeOrderPlatform(order.platform || "line");
      const rawBotId = order.botId || null;
      const botIdStr =
        rawBotId && typeof rawBotId.toString === "function"
          ? rawBotId.toString()
          : rawBotId || null;
      if (botIdStr) {
        botIdSets[platform].add(botIdStr);
      }
    });

    let lineBotDocs = [];
    let facebookBotDocs = [];

    const lineBotIds = [...botIdSets.line].filter((id) => ObjectId.isValid(id));
    if (lineBotIds.length) {
      lineBotDocs = await db
        .collection("line_bots")
        .find({ _id: { $in: lineBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, displayName: 1, botName: 1 })
        .toArray();
    }

    const facebookBotIds = [...botIdSets.facebook].filter((id) =>
      ObjectId.isValid(id),
    );
    if (facebookBotIds.length) {
      facebookBotDocs = await db
        .collection("facebook_bots")
        .find({ _id: { $in: facebookBotIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, pageName: 1 })
        .toArray();
    }

    const pageNameMap = new Map();
    lineBotDocs.forEach((bot) => {
      const key = buildOrderPageKey("line", bot._id.toString());
      const label =
        bot.displayName ||
        bot.name ||
        bot.botName ||
        `LINE Bot (${bot._id.toString().slice(-4)})`;
      pageNameMap.set(key, label);
    });
    facebookBotDocs.forEach((bot) => {
      const key = buildOrderPageKey("facebook", bot._id.toString());
      const label =
        bot.pageName ||
        bot.name ||
        `Facebook Page (${bot._id.toString().slice(-4)})`;
      pageNameMap.set(key, label);
    });

    const timezone = "Asia/Bangkok";
    const exportRows = orders.map((order, index) => {
      const orderData = order.orderData || {};
      const items = Array.isArray(orderData.items) ? orderData.items : [];
      const itemsText = items
        .map(
          (item, idx) =>
            `${idx + 1}. ${item.product} x${item.quantity} @ ${item.price}`,
        )
        .join("\n");
      const platform = normalizeOrderPlatform(order.platform || "line");
      const rawBotId = order.botId || null;
      const botId =
        rawBotId && typeof rawBotId.toString === "function"
          ? rawBotId.toString()
          : rawBotId || null;
      const pageKey = buildOrderPageKey(platform, botId);
      const pageName =
        pageNameMap.get(pageKey) ||
        (botId
          ? `${platform === "facebook" ? "Facebook" : "LINE"} (${botId})`
          : platform === "facebook"
            ? "Facebook (default)"
            : "LINE (default)");

      return {
        ลำดับ: index + 1,
        วันที่: order.extractedAt
          ? moment(order.extractedAt).tz(timezone).format("YYYY-MM-DD HH:mm:ss")
          : "",
        ผู้ใช้: order.userId || "",
        ชื่อลูกค้า:
          normalizeCustomerName(orderData.customerName) ||
          profileMap[order.userId] ||
          "",
        แพลตฟอร์ม: order.platform || "line",
        เพจ: pageName,
        สถานะ: order.status || "pending",
        ยอดรวม: orderData.totalAmount || 0,
        ค่าส่ง: orderData.shippingCost || 0,
        วิธีชำระ: orderData.paymentMethod || "",
        ที่อยู่: orderData.shippingAddress || "",
        เบอร์โทร: orderData.phone || "",
        รายการสินค้า: itemsText,
        หมายเหตุ: order.notes || "",
        ประเภท: order.isManualExtraction ? "Manual" : "Automatic",
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const filename = `orders_${moment().tz("Asia/Bangkok").format("YYYYMMDD_HHmmss")}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (error) {
    console.error("[Orders] ไม่สามารถส่งออกออเดอร์ได้:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint สำหรับทดสอบการกรองข้อความ
app.post("/api/filter/test", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาใส่ข้อความที่ต้องการทดสอบ" });
    }

    const result = await testMessageFiltering(message);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Error testing message filter:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================ Socket.IO Events ============================
io.on("connection", (socket) => {
  console.log("[Socket.IO] Admin connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("[Socket.IO] Admin disconnected:", socket.id);
  });

  // Join admin room for receiving updates
  socket.join("admin");
});

// Function to notify admins of new user messages
async function notifyAdminsNewMessage(userId, message) {
  // ตรวจสอบการตั้งค่าการแจ้งเตือน
  const enableAdminNotifications = await getSettingValue(
    "enableAdminNotifications",
    true,
  );

  if (enableAdminNotifications) {
    // แจ้งเตือนแอดมินผ่าน Socket.IO
    io.to("admin").emit("newMessage", {
      userId: userId,
      message: message,
      sender: "user",
      timestamp: new Date(),
    });
  }

  // อัปเดต unread count สำหรับผู้ใช้
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    await coll.updateOne(
      { userId: userId },
      { $inc: { unreadCount: 1 } },
      { upsert: true },
    );
  } catch (error) {
    console.error("ไม่สามารถอัปเดต unread count ได้:", error);
  }
}

// ฟังก์ชันสำหรับดึง unread count ของผู้ใช้
async function getUserUnreadCount(userId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    const doc = await coll.findOne({ userId: userId });
    return doc ? doc.unreadCount : 0;
  } catch (error) {
    console.error("ไม่สามารถดึง unread count ได้:", error);
    return 0;
  }
}

// ฟังก์ชันสำหรับรีเซ็ต unread count ของผู้ใช้
async function resetUserUnreadCount(userId) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    await coll.updateOne(
      { userId: userId },
      { $set: { unreadCount: 0 } },
      { upsert: true },
    );
  } catch (error) {
    console.error("ไม่สามารถรีเซ็ต unread count ได้:", error);
  }
}

// ============================ Message Filtering Functions ============================

async function loadMessageFilterConfig() {
  try {
    const [
      enableFiltering,
      hiddenWords,
      replacementText,
      enableStrictFiltering,
    ] = await Promise.all([
      getSettingValue("enableMessageFiltering", true),
      getSettingValue("hiddenWords", ""),
      getSettingValue("replacementText", "[ข้อความถูกซ่อน]"),
      getSettingValue("enableStrictFiltering", true),
    ]);

    return {
      enableFiltering: enableFiltering !== false,
      hiddenWords,
      replacementText: replacementText || "[ข้อความถูกซ่อน]",
      enableStrictFiltering: enableStrictFiltering !== false,
    };
  } catch (error) {
    console.error("[Filter] ข้อผิดพลาดในการโหลดการตั้งค่าการกรอง:", error);
    return {
      enableFiltering: true,
      hiddenWords: "",
      replacementText: "[ข้อความถูกซ่อน]",
      enableStrictFiltering: true,
    };
  }
}

// ฟังก์ชันสำหรับกรองข้อความตามการตั้งค่า
async function filterMessage(message, options = {}) {
  try {
    if (typeof message !== "string" || message.length === 0) {
      return message;
    }

    const { config: providedConfig } = options || {};

    const config =
      providedConfig && typeof providedConfig === "object"
        ? providedConfig
        : await loadMessageFilterConfig();

    const enableFiltering =
      typeof config.enableFiltering === "boolean"
        ? config.enableFiltering
        : true;
    if (!enableFiltering) {
      return message; // ไม่กรอง ถ้าไม่ได้เปิดใช้งาน
    }

    const hiddenWordsSource =
      config.hiddenWords !== undefined ? config.hiddenWords : "";
    const replacementText =
      typeof config.replacementText === "string" &&
      config.replacementText.trim().length > 0
        ? config.replacementText
        : "[ข้อความถูกซ่อน]";
    const enableStrictFiltering =
      typeof config.enableStrictFiltering === "boolean"
        ? config.enableStrictFiltering
        : true;

    if (!hiddenWordsSource || String(hiddenWordsSource).trim() === "") {
      return message; // ไม่กรอง ถ้าไม่มีคำที่ซ่อน
    }

    // ตรวจสอบว่าการกรองเปิดใช้งานหรือไม่
    const wordsToHide = Array.isArray(hiddenWordsSource)
      ? hiddenWordsSource
          .map((word) => (typeof word === "string" ? word.trim() : ""))
          .filter((word) => word.length > 0)
      : String(hiddenWordsSource)
          .split("\n")
          .map((word) => word.trim())
          .filter((word) => word.length > 0);

    if (wordsToHide.length === 0) {
      return message; // ไม่กรอง ถ้าไม่มีคำที่ซ่อน
    }

    let filteredMessage = message;
    const foundHiddenWords = [];

    // กรองแต่ละคำที่ซ่อน
    wordsToHide.forEach((word) => {
      if (word.length > 0) {
        // สร้าง regex pattern สำหรับการค้นหา (ไม่คำนึงถึงตัวพิมพ์เล็ก-ใหญ่)
        const pattern = new RegExp(
          word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi",
        );

        if (pattern.test(filteredMessage)) {
          foundHiddenWords.push(word);

          if (enableStrictFiltering) {
            // การกรองแบบละเอียด: แทนที่ทั้งคำและวลีที่ประกอบด้วยคำนั้น
            filteredMessage = filteredMessage.replace(pattern, replacementText);
          } else {
            // การกรองแบบปกติ: แทนที่เฉพาะคำที่ตรงกันเท่านั้น
            const wordBoundaryPattern = new RegExp(
              `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
              "gi",
            );
            filteredMessage = filteredMessage.replace(
              wordBoundaryPattern,
              replacementText,
            );
          }
        }
      }
    });

    console.log(
      `[Filter] กรองข้อความ: พบคำที่ซ่อน ${foundHiddenWords.length} คำ`,
    );
    return filteredMessage;
  } catch (error) {
    console.error("[Filter] ข้อผิดพลาดในการกรองข้อความ:", error);
    return message; // ส่งคืนข้อความต้นฉบับในกรณีที่เกิดข้อผิดพลาด
  }
}

// ฟังก์ชันสำหรับทดสอบการกรองข้อความ
async function testMessageFiltering(message) {
  try {
    const filteredMessage = await filterMessage(message);
    const hiddenWords = await getSettingValue("hiddenWords", "");

    // หาคำที่ถูกซ่อน
    const wordsToHide = hiddenWords
      .split("\n")
      .map((word) => word.trim())
      .filter((word) => word.length > 0);

    const foundHiddenWords = [];
    wordsToHide.forEach((word) => {
      if (word.length > 0) {
        const pattern = new RegExp(
          word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi",
        );
        if (pattern.test(message)) {
          foundHiddenWords.push(word);
        }
      }
    });

    return {
      originalMessage: message,
      filteredMessage: filteredMessage,
      hiddenWords: foundHiddenWords,
    };
  } catch (error) {
    console.error("[Filter] ข้อผิดพลาดในการทดสอบการกรอง:", error);
    throw error;
  }
}

// ============================ Message Content Normalization Functions ============================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeContentToPlainText(content) {
  if (content === null) {
    return "null";
  }

  if (typeof content === "undefined") {
    return "undefined";
  }

  if (typeof content === "string") {
    return content;
  }

  if (typeof content === "number" || typeof content === "boolean") {
    return String(content);
  }

  if (content instanceof Date) {
    return content.toISOString();
  }

  try {
    return JSON.stringify(content, null, 2);
  } catch (error) {
    console.warn("[ContentSerializer] ไม่สามารถแปลงข้อมูลเป็นข้อความได้:", error);
    return "";
  }
}

function buildFallbackDisplayFromContent(content) {
  const plainText = serializeContentToPlainText(content);
  if (!plainText) {
    return null;
  }

  const html = `<div class="message-text"><pre class="mb-0 text-break" style="white-space: pre-wrap;">${escapeHtml(plainText)}</pre></div>`;
  return {
    html,
    plainText,
    contentType: "text",
  };
}

/**
 * ฟังก์ชันสำหรับแปลงข้อมูลข้อความจากฐานข้อมูลให้อยู่ในรูปแบบที่ frontend สามารถแสดงผลได้
 * @param {Object} message - ข้อความจากฐานข้อมูล
 * @returns {Object} ข้อความที่แปลงแล้วพร้อมข้อมูลที่จำเป็น
 */
function normalizeMessageForFrontend(message) {
  try {
    // ตรวจสอบว่า message มีโครงสร้างที่ถูกต้องหรือไม่
    if (!message || typeof message !== "object") {
      return {
        content: "ข้อความไม่ถูกต้อง",
        role: "system",
        timestamp: new Date(),
        source: "system",
        displayContent: "ข้อความไม่ถูกต้อง",
        contentType: "text",
      };
    }

    // แปลง timestamp
    let timestamp = message.timestamp;
    if (timestamp && typeof timestamp === "string") {
      timestamp = new Date(timestamp);
    } else if (!timestamp) {
      timestamp = new Date();
    }

    // แปลง content
    const originalContent = message.content;
    let content = originalContent;
    let displayContent = "";
    let contentType = "text";
    let richDisplayContent = "";
    const messageId =
      message?._id && typeof message._id.toString === "function"
        ? message._id.toString()
        : message?._id || null;
    const orderExtractionRoundId = message?.orderExtractionRoundId
      ? String(message.orderExtractionRoundId)
      : null;

    // ตรวจสอบประเภทของ content และแปลงให้เหมาะสม
    if (typeof content === "string") {
      // ถ้าเป็น string ที่เป็น JSON
      if (content.trim().startsWith("{") || content.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(content);
          const processed = processQueueMessageForDisplayV2(parsed);
          displayContent = processed.displayContent;
          richDisplayContent = processed.displayContent;
          contentType = processed.contentType;
          if (typeof processed.plainText === "string") {
            content = processed.plainText;
          } else if (typeof displayContent === "string") {
            content = displayContent;
          }
        } catch (parseError) {
          // ถ้า parse JSON ไม่ได้ ให้ใช้เป็นข้อความธรรมดา
          displayContent = content;
          contentType = "text";
        }
      } else {
        // ข้อความธรรมดา
        displayContent = content;
        contentType = "text";
      }
    } else if (Array.isArray(content)) {
      // ถ้าเป็น array (เช่น ข้อความจากคิว)
      const processed = processQueueMessageForDisplayV2(content);
      displayContent = processed.displayContent;
      richDisplayContent = processed.displayContent;
      contentType = processed.contentType;
      if (typeof processed.plainText === "string") {
        content = processed.plainText;
      } else {
        content = displayContent;
      }
    } else if (content && typeof content === "object") {
      // ถ้าเป็น object
      const processed = processQueueMessageForDisplayV2(content);
      displayContent = processed.displayContent;
      richDisplayContent = processed.displayContent;
      contentType = processed.contentType;
      if (typeof processed.plainText === "string") {
        content = processed.plainText;
      } else {
        content = displayContent;
      }
    } else {
      // กรณีอื่น ๆ
      const fallbackDisplay = buildFallbackDisplayFromContent(
        content ?? originalContent,
      );
      if (fallbackDisplay) {
        displayContent = fallbackDisplay.html;
        richDisplayContent = fallbackDisplay.html;
        contentType = fallbackDisplay.contentType;
        content = fallbackDisplay.plainText;
      } else {
        displayContent = "ข้อความไม่สามารถแสดงผลได้";
        contentType = "error";
      }
    }

    if (!richDisplayContent) {
      richDisplayContent = displayContent;
    }

    return {
      content: content,
      role: message.role || "user",
      timestamp: timestamp,
      source: message.source || "ai",
      displayContent: displayContent,
      richDisplayContent,
      contentType: contentType,
      platform: message.platform || "line",
      botId: message.botId || null,
      rawContent: originalContent,
      messageId,
      orderExtractionRoundId,
    };
  } catch (error) {
    console.error("[Normalize] ข้อผิดพลาดในการแปลงข้อความ:", error);
    return {
      content: "ข้อความไม่ถูกต้อง",
      role: "system",
      timestamp: new Date(),
      source: "system",
      displayContent: "เกิดข้อผิดพลาดในการประมวลผลข้อความ",
      contentType: "error",
      richDisplayContent: "เกิดข้อผิดพลาดในการประมวลผลข้อความ",
      messageId: null,
      orderExtractionRoundId: null,
    };
  }
}

/**
 * ฟังก์ชันสำหรับประมวลผลข้อความจากคิวเพื่อแสดงผลในหน้าแชท
 * @param {Array|Object} content - เนื้อหาข้อความจากคิว
 * @returns {Object} ข้อมูลที่ประมวลผลแล้วพร้อม HTML สำหรับแสดงผล
 */
function processQueueMessageForDisplay(content) {
  try {
    let displayContent = "";
    let contentType = "text";
    let plainText = "";

    // ถ้าเป็น array (ข้อความจากคิว)
    if (Array.isArray(content)) {
      const textParts = [];
      const imageParts = [];
      const audioParts = [];

      content.forEach((item) => {
        const data = item?.data || item;
        if (!data) {
          return;
        }

        if (data.type === "text" && data.text) {
          textParts.push(data.text);
        } else if (data.type === "image" && data.base64) {
          imageParts.push(data);
        } else if (data.type === "audio") {
          audioParts.push(data);
        }
      });

      // สร้าง HTML สำหรับแสดงผล
      if (textParts.length > 0) {
        // รวมข้อความและรักษาการเว้นบรรทัด
        const combinedText = textParts.join("\n");
        displayContent += `<div class="message-text">${combinedText.replace(/\n/g, "<br>")}</div>`;
        plainText = combinedText;
      }

      if (imageParts.length > 0) {
        if (imageParts.length === 1) {
          displayContent += createImageHTML(imageParts[0]);
        } else {
          displayContent += '<div class="image-grid">';
          imageParts.forEach((image, index) => {
            displayContent += createImageHTML(image, index);
          });
          displayContent += "</div>";
        }
        contentType = "multimodal";
      }

      if (audioParts.length > 0) {
        const audioPlainTexts = [];
        audioParts.forEach((audio, index) => {
          const audioDisplay = buildAudioAttachmentDisplay(audio, index);
          displayContent += audioDisplay.html;
          if (audioDisplay.plainText) {
            audioPlainTexts.push(audioDisplay.plainText);
          }
        });
        if (audioPlainTexts.length > 0) {
          plainText = plainText
            ? `${plainText}\n${audioPlainTexts.join("\n")}`
            : audioPlainTexts.join("\n");
        }
        contentType =
          textParts.length > 0 || imageParts.length > 0
            ? "multimodal"
            : "audio";
      }

      if (
        textParts.length === 0 &&
        imageParts.length === 0 &&
        audioParts.length === 0
      ) {
        const fallbackDisplay = buildFallbackDisplayFromContent(content);
        if (fallbackDisplay) {
          displayContent = fallbackDisplay.html;
          contentType = fallbackDisplay.contentType;
          plainText = fallbackDisplay.plainText;
        } else {
          displayContent =
            '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
          contentType = "error";
          plainText = "";
        }
      }
    }
    // ถ้าเป็น object เดี่ยว
    else if (content && typeof content === "object") {
      if (content.type === "text" && content.content) {
        // รองรับการเว้นบรรทัดในข้อความ
        const textWithBreaks = content.content.replace(/\n/g, "<br>");
        displayContent = `<div class="message-text">${textWithBreaks}</div>`;
        contentType = "text";
        plainText = content.content;
      } else if (content.type === "image" && content.content) {
        displayContent = createImageHTML({
          base64: content.content,
          description: content.description || "ผู้ใช้ส่งรูปภาพมา",
        });
        contentType = "image";
        plainText = "";
      } else if (content.type === "audio") {
        const audioDisplay = buildAudioAttachmentDisplay(content);
        displayContent = audioDisplay.html;
        contentType = "audio";
        plainText = audioDisplay.plainText || "";
      } else if (content.data) {
        const data = content.data;
        if (data.type === "text" && data.text) {
          // รองรับการเว้นบรรทัดในข้อความ
          const textWithBreaks = data.text.replace(/\n/g, "<br>");
          displayContent = `<div class="message-text">${textWithBreaks}</div>`;
          contentType = "text";
          plainText = data.text;
        } else if (data.type === "image" && data.base64) {
          displayContent = createImageHTML(data);
          contentType = "image";
          plainText = "";
        } else if (data.type === "audio") {
          const audioDisplay = buildAudioAttachmentDisplay(data);
          displayContent = audioDisplay.html;
          contentType = "audio";
          plainText = audioDisplay.plainText || "";
        } else {
          const fallbackDisplay = buildFallbackDisplayFromContent(data);
          if (fallbackDisplay) {
            displayContent = fallbackDisplay.html;
            contentType = fallbackDisplay.contentType;
            plainText = fallbackDisplay.plainText;
          } else {
            displayContent =
              '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
            contentType = "error";
            plainText = "";
          }
        }
      } else {
        // ถ้าไม่มี data field ให้ลองแปลงเป็น string
        const fallbackDisplay = buildFallbackDisplayFromContent(content);
        if (fallbackDisplay) {
          displayContent = fallbackDisplay.html;
          contentType = fallbackDisplay.contentType;
          plainText = fallbackDisplay.plainText;
        } else {
          displayContent =
            '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
          contentType = "error";
          plainText = "";
        }
      }
    }
    // กรณีอื่น ๆ
    else {
      const fallbackDisplay = buildFallbackDisplayFromContent(content);
      if (fallbackDisplay) {
        displayContent = fallbackDisplay.html;
        contentType = fallbackDisplay.contentType;
        plainText = fallbackDisplay.plainText;
      } else {
        displayContent =
          '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
        contentType = "error";
        plainText = "";
      }
    }

    return {
      displayContent: displayContent,
      contentType: contentType,
      plainText,
    };
  } catch (error) {
    console.error(
      "[ProcessQueue] ข้อผิดพลาดในการประมวลผลข้อความจากคิว:",
      error,
    );
    return {
      displayContent:
        '<div class="message-text text-danger">เกิดข้อผิดพลาดในการประมวลผลข้อความ</div>',
      contentType: "error",
      plainText: "",
    };
  }
}

/**
 * ฟังก์ชันสำหรับประมวลผลข้อความจากคิวเพื่อแสดงผลในหน้าแชท (เวอร์ชันใหม่)
 * @param {Array|Object} content - เนื้อหาข้อความจากคิว
 * @returns {Object} ข้อมูลที่ประมวลผลแล้วพร้อม HTML สำหรับแสดงผล
 */
function processQueueMessageForDisplayV2(content) {
  try {
    let displayContent = "";
    let contentType = "text";
    let plainText = "";

    // ถ้าเป็น array (ข้อความจากคิว)
    if (Array.isArray(content)) {
      const textParts = [];
      const imageParts = [];
       const audioParts = [];

      content.forEach((item) => {
        // รองรับรูปแบบใหม่: item มี type และ content โดยตรง
        if (item && item.type === "text" && item.content) {
          textParts.push(item.content);
        } else if (item && item.type === "image" && item.content) {
          // รูปภาพในรูปแบบใหม่
          imageParts.push({
            base64: item.content,
            description: item.description || "ผู้ใช้ส่งรูปภาพมา",
          });
        } else if (item && item.type === "audio") {
          audioParts.push(item);
        }
        // รองรับรูปแบบเก่า: item.data
        else if (item && item.data) {
          const data = item.data;
          if (data.type === "text" && data.text) {
            textParts.push(data.text);
          } else if (data.type === "image" && data.base64) {
            imageParts.push(data);
          } else if (data.type === "audio") {
            audioParts.push(data);
          }
        }
      });

      // สร้าง HTML สำหรับแสดงผล
      if (textParts.length > 0) {
        // รวมข้อความและรักษาการเว้นบรรทัด
        const combinedText = textParts.join("\n");
        displayContent += `<div class="message-text">${combinedText.replace(/\n/g, "<br>")}</div>`;
        plainText = combinedText;
      }

      if (imageParts.length > 0) {
        if (imageParts.length === 1) {
          displayContent += createImageHTML(imageParts[0]);
        } else {
          displayContent += '<div class="image-grid">';
          imageParts.forEach((image, index) => {
            displayContent += createImageHTML(image, index);
          });
          displayContent += "</div>";
        }
        contentType = "multimodal";
      }

      if (audioParts.length > 0) {
        const audioPlainTexts = [];
        audioParts.forEach((audio, index) => {
          const audioDisplay = buildAudioAttachmentDisplay(audio, index);
          displayContent += audioDisplay.html;
          if (audioDisplay.plainText) {
            audioPlainTexts.push(audioDisplay.plainText);
          }
        });
        if (audioPlainTexts.length > 0) {
          plainText = plainText
            ? `${plainText}\n${audioPlainTexts.join("\n")}`
            : audioPlainTexts.join("\n");
        }
        contentType =
          textParts.length > 0 || imageParts.length > 0
            ? "multimodal"
            : "audio";
      }

      if (
        textParts.length === 0 &&
        imageParts.length === 0 &&
        audioParts.length === 0
      ) {
        const fallbackDisplay = buildFallbackDisplayFromContent(content);
        if (fallbackDisplay) {
          displayContent = fallbackDisplay.html;
          contentType = fallbackDisplay.contentType;
          plainText = fallbackDisplay.plainText;
        } else {
          displayContent =
            '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
          contentType = "error";
          plainText = "";
        }
      }
    }
    // ถ้าเป็น object เดี่ยว
    else if (content && typeof content === "object") {
      // รองรับรูปแบบใหม่
      if (content.type === "text" && content.content) {
        // รองรับการเว้นบรรทัดในข้อความ
        const textWithBreaks = content.content.replace(/\n/g, "<br>");
        displayContent = `<div class="message-text">${textWithBreaks}</div>`;
        contentType = "text";
        plainText = content.content;
      } else if (content.type === "image" && content.content) {
        displayContent = createImageHTML({
          base64: content.content,
          description: content.description || "ผู้ใช้ส่งรูปภาพมา",
        });
        contentType = "image";
        plainText = "";
      } else if (content.type === "audio") {
        const audioDisplay = buildAudioAttachmentDisplay(content);
        displayContent = audioDisplay.html;
        contentType = "audio";
        plainText = audioDisplay.plainText || "";
      }
      // รองรับรูปแบบเก่า
      else if (content.data) {
        const data = content.data;
        if (data.type === "text" && data.text) {
          // รองรับการเว้นบรรทัดในข้อความ
          const textWithBreaks = data.text.replace(/\n/g, "<br>");
          displayContent = `<div class="message-text">${textWithBreaks}</div>`;
          contentType = "text";
          plainText = data.text;
        } else if (data.type === "image" && data.base64) {
          displayContent = createImageHTML(data);
          contentType = "image";
          plainText = "";
        } else if (data.type === "audio") {
          const audioDisplay = buildAudioAttachmentDisplay(data);
          displayContent = audioDisplay.html;
          contentType = "audio";
          plainText = audioDisplay.plainText || "";
        } else {
          const fallbackDisplay = buildFallbackDisplayFromContent(data);
          if (fallbackDisplay) {
            displayContent = fallbackDisplay.html;
            contentType = fallbackDisplay.contentType;
            plainText = fallbackDisplay.plainText;
          } else {
            displayContent =
              '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
            contentType = "error";
            plainText = "";
          }
        }
      } else {
        // ถ้าไม่มี data field ให้ลองแปลงเป็น string
        const fallbackDisplay = buildFallbackDisplayFromContent(content);
        if (fallbackDisplay) {
          displayContent = fallbackDisplay.html;
          contentType = fallbackDisplay.contentType;
          plainText = fallbackDisplay.plainText;
        } else {
          displayContent =
            '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
          contentType = "error";
          plainText = "";
        }
      }
    }
    // กรณีอื่น ๆ
    else {
      const fallbackDisplay = buildFallbackDisplayFromContent(content);
      if (fallbackDisplay) {
        displayContent = fallbackDisplay.html;
        contentType = fallbackDisplay.contentType;
        plainText = fallbackDisplay.plainText;
      } else {
        displayContent =
          '<div class="message-text text-muted">ข้อความไม่สามารถแสดงผลได้</div>';
        contentType = "error";
        plainText = "";
      }
    }

    return {
      displayContent: displayContent,
      contentType: contentType,
      plainText,
    };
  } catch (error) {
    console.error(
      "[ProcessQueueV2] ข้อผิดพลาดในการประมวลผลข้อความจากคิว:",
      error,
    );
    return {
      displayContent:
        '<div class="message-text text-danger">เกิดข้อผิดพลาดในการประมวลผลข้อความ</div>',
      contentType: "error",
      plainText: "",
    };
  }
}

/**
 * ฟังก์ชันสำหรับสร้าง HTML สำหรับรูปภาพ
 * @param {Object} imageData - ข้อมูลรูปภาพ
 * @param {number} index - ดัชนีของรูปภาพ
 * @returns {string} HTML สำหรับแสดงรูปภาพ
 */
function buildAudioAttachmentDisplay(audioData = {}, index = 0) {
  try {
    const labelCandidates = [
      audioData.description,
      audioData.text,
      audioData.title,
      audioData.fileName,
      audioData.filename,
      audioData.name,
      audioData?.payload?.label,
      audioData?.payload?.title,
      audioData?.payload?.description,
    ];
    const label =
      labelCandidates.find(
        (value) => typeof value === "string" && value.trim().length > 0,
      ) || `ไฟล์เสียงที่ ${index + 1}`;

    const rawDuration =
      typeof audioData.duration === "number"
        ? audioData.duration
        : typeof audioData?.payload?.duration === "number"
          ? audioData.payload.duration
          : null;

    let durationLabel = "";
    if (Number.isFinite(rawDuration) && rawDuration > 0) {
      const durationSeconds =
        rawDuration > 1000
          ? Math.round(rawDuration / 1000)
          : Math.round(rawDuration);
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      durationLabel =
        minutes > 0
          ? `${minutes} นาที ${seconds.toString().padStart(2, "0")} วินาที`
          : `${seconds} วินาที`;
    }

    const audioUrlCandidate =
      typeof audioData.url === "string"
        ? audioData.url
        : typeof audioData?.payload?.url === "string"
          ? audioData.payload.url
          : null;
    const audioUrl =
      typeof audioUrlCandidate === "string" && audioUrlCandidate.trim()
        ? audioUrlCandidate.trim()
        : null;

    const escapeHtml = (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const escapeAttribute = (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    let html =
      '<div class="message-text text-muted d-inline-flex align-items-center gap-2">';
    html += '<i class="fas fa-microphone"></i>';
    html += `<span>${escapeHtml(label)}</span>`;
    if (durationLabel) {
      html += `<span class="small">(${escapeHtml(durationLabel)})</span>`;
    }
    if (audioUrl) {
      html += `<a href="${escapeAttribute(audioUrl)}" target="_blank" rel="noopener" class="ms-2">ดาวน์โหลด</a>`;
    }
    html += "</div>";

    const plainParts = [
      `[ไฟล์เสียง ${index + 1}]`,
      label,
      durationLabel ? `(${durationLabel})` : "",
      audioUrl ? `ดาวน์โหลด: ${audioUrl}` : "",
    ].filter(Boolean);
    const plainText = plainParts.join(" ").trim();

    return {
      html,
      plainText,
    };
  } catch (error) {
    console.error(
      "[AudioHTML] ข้อผิดพลาดในการสร้าง HTML สำหรับไฟล์เสียง:",
      error,
    );
    return {
      html: '<div class="message-text text-muted">ไม่สามารถแสดงไฟล์เสียงได้</div>',
      plainText: `[ไฟล์เสียง ${index + 1}]`,
    };
  }
}

function createImageHTML(imageData, index = 0) {
  try {
    if (!imageData || !imageData.base64) {
      return '<div class="message-text text-muted">รูปภาพไม่ถูกต้อง</div>';
    }

    const base64Size = Math.ceil((imageData.base64.length * 3) / 4);
    const sizeKB = (base64Size / 1024).toFixed(1);

    return `
      <div class="message-image">
        <img src="data:image/jpeg;base64,${imageData.base64}"
             alt="รูปภาพจากผู้ใช้ ${index + 1}"
             class="img-fluid rounded"
             style="max-width: 200px; max-height: 200px; cursor: pointer;"
             onclick="openImageModal(this.src)"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <div class="image-error-fallback" style="display: none;">
          <i class="fas fa-image text-muted"></i>
          <div class="text-muted small">ไม่สามารถแสดงรูปภาพได้</div>
        </div>
        <div class="image-info">
          <small class="text-muted">
            <i class="fas fa-image me-1"></i>
            รูปภาพ JPEG (${sizeKB} KB)
          </small>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("[ImageHTML] ข้อผิดพลาดในการสร้าง HTML สำหรับรูปภาพ:", error);
    return '<div class="message-text text-muted">ไม่สามารถแสดงรูปภาพได้</div>';
  }
}

// ============================ Enhanced Chat History Functions ============================

/**
 * ฟังก์ชันสำหรับดึงประวัติการสนทนาที่แปลงแล้วสำหรับ frontend
 * @param {string} userId - ID ของผู้ใช้
 * @returns {Array} รายการข้อความที่แปลงแล้ว
 */
async function getNormalizedChatHistory(userId, options = {}) {
  try {
    const { applyFilter = false } = options || {};
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");

    const messages = await coll
      .find({ senderId: userId })
      .sort({ timestamp: 1 })
      .limit(200)
      .toArray();

    const messageIds = messages
      .map((message) => (message?._id ? message._id : null))
      .filter(Boolean);

    let feedbackMap = {};
    if (messageIds.length > 0) {
      const feedbackColl = db.collection("chat_feedback");
      const feedbackDocs = await feedbackColl
        .find({ messageId: { $in: messageIds } })
        .toArray();

      feedbackDocs.forEach((doc) => {
        const key =
          doc?.messageId && typeof doc.messageId.toString === "function"
            ? doc.messageId.toString()
            : doc?.messageIdString || null;
        if (!key) return;
        feedbackMap[key] = {
          feedback: doc.feedback || null,
          notes: doc.notes || "",
          updatedAt: doc.updatedAt || doc.createdAt || null,
        };
      });
    }

    let filterConfig = null;
    if (applyFilter) {
      filterConfig = await loadMessageFilterConfig();

      if (
        !filterConfig.enableFiltering ||
        !filterConfig.hiddenWords ||
        String(filterConfig.hiddenWords).trim() === ""
      ) {
        filterConfig = null;
      }
    }

    // แปลงข้อความแต่ละข้อความ
    const normalizedMessages = await Promise.all(
      messages.map(async (message) => {
        const normalized = normalizeMessageForFrontend(message);

        const messageIdStr =
          message?._id && typeof message._id.toString === "function"
            ? message._id.toString()
            : null;
        if (messageIdStr && feedbackMap[messageIdStr]) {
          const feedbackInfo = feedbackMap[messageIdStr];
          normalized.feedback = feedbackInfo.feedback;
          if (feedbackInfo.notes) {
            normalized.feedbackNotes = feedbackInfo.notes;
          }
          if (feedbackInfo.updatedAt) {
            normalized.feedbackUpdatedAt = feedbackInfo.updatedAt;
          }
        }

        if (
          filterConfig &&
          normalized.role === "user" &&
          normalized.contentType === "text" &&
          typeof normalized.content === "string" &&
          normalized.content.length > 0
        ) {
          const filtered = await filterMessage(normalized.content, {
            config: filterConfig,
          });

          if (filtered !== normalized.content) {
            normalized.originalContent = normalized.content;
          }
          normalized.content = filtered;
          if (normalized.contentType === "text") {
            normalized.displayContent = filtered;
          }
        }

        return normalized;
      }),
    );

    return normalizedMessages;
  } catch (error) {
    console.error(
      "[NormalizedHistory] ข้อผิดพลาดในการดึงประวัติการสนทนา:",
      error,
    );
    return [];
  }
}

/**
 * ฟังก์ชันสำหรับดึงรายชื่อผู้ใช้พร้อมข้อความล่าสุดที่แปลงแล้ว
 * @returns {Array} รายการผู้ใช้พร้อมข้อมูลที่แปลงแล้ว
 */
async function getNormalizedChatUsers(options = {}) {
  try {
    const { applyFilter = false } = options || {};
    const client = await connectDB();
    const db = client.db("chatbot");
    const chatColl = db.collection("chat_history");
    const profileColl = db.collection("user_profiles");
    const followColl = db.collection("follow_up_status");

    // ดึงข้อมูลผู้ใช้ด้วย aggregation
    const pipeline = [
      {
        $group: {
          _id: "$senderId",
          lastMessage: { $last: "$content" },
          lastTimestamp: { $last: "$timestamp" },
          messageCount: { $sum: 1 },
          platform: { $last: "$platform" },
          botId: { $last: "$botId" },
        },
      },
      {
        $sort: { lastTimestamp: -1 },
      },
      {
        $limit: 50,
      },
    ];

    const users = await chatColl.aggregate(pipeline).toArray();
    const userIds = users.map((user) => user._id);
    const followStatuses =
      userIds.length > 0
        ? await followColl.find({ senderId: { $in: userIds } }).toArray()
        : [];
    const followMap = {};
    followStatuses.forEach((status) => {
      followMap[status.senderId] = status;
    });

    // ดึงข้อมูลแท็ก
    const tagsColl = db.collection("user_tags");
    const userTags =
      userIds.length > 0
        ? await tagsColl.find({ userId: { $in: userIds } }).toArray()
        : [];
    const tagsMap = {};
    userTags.forEach((userTag) => {
      tagsMap[userTag.userId] = userTag.tags || [];
    });

    // ดึงข้อมูลสถานะการซื้อ
    const purchaseColl = db.collection("user_purchase_status");
    const purchaseStatuses =
      userIds.length > 0
        ? await purchaseColl.find({ userId: { $in: userIds } }).toArray()
        : [];
    const purchaseMap = {};
    purchaseStatuses.forEach((status) => {
      purchaseMap[status.userId] = status.hasPurchased;
    });

    const profileDocs =
      userIds.length > 0
        ? await profileColl
            .find({ userId: { $in: userIds } })
            .project({
              userId: 1,
              platform: 1,
              displayName: 1,
              pictureUrl: 1,
              statusMessage: 1,
            })
            .toArray()
        : [];
    const profileMap = new Map();
    profileDocs.forEach((doc) => {
      const key = `${doc.userId}:${doc.platform || "line"}`;
      profileMap.set(key, doc);
    });

    // ดึงข้อมูลออเดอร์
    const ordersColl = db.collection("orders");
    const userOrders =
      userIds.length > 0
        ? await ordersColl.find({ userId: { $in: userIds } }).toArray()
        : [];
    const ordersMap = {};
    userOrders.forEach((order) => {
      if (!ordersMap[order.userId]) {
        ordersMap[order.userId] = [];
      }
      ordersMap[order.userId].push(order);
    });

    const contextCache = new Map();

    let filterConfig = null;
    if (applyFilter) {
      filterConfig = await loadMessageFilterConfig();
      if (
        !filterConfig.enableFiltering ||
        !filterConfig.hiddenWords ||
        String(filterConfig.hiddenWords).trim() === ""
      ) {
        filterConfig = null;
      }
    }

    // แปลงข้อมูลผู้ใช้แต่ละคน
    const normalizedUsers = await Promise.all(
      users.map(async (user) => {
        const unreadCount = await getUserUnreadCount(user._id);
        const platform = user.platform || "line";
        const botId = normalizeFollowUpBotId(user.botId);
        const contextKey = `${platform}:${botId || "default"}`;

        let config = contextCache.get(contextKey);
        if (!config) {
          config = await getFollowUpConfigForContext(platform, botId);
          contextCache.set(contextKey, config);
        }

        // ดึงข้อมูลโปรไฟล์
        const profileKey = `${user._id}:${platform}`;
        let userProfile = profileMap.get(profileKey) || null;

        if (platform === "line" && !userProfile) {
          const freshProfile = await saveOrUpdateUserProfile(user._id);
          if (freshProfile) {
            userProfile = {
              ...freshProfile,
              platform: "line",
            };
            profileMap.set(profileKey, userProfile);
          }
        }

        // แปลงข้อความล่าสุด
        const normalizedLastMessage = normalizeMessageForFrontend({
          content: user.lastMessage,
          role: "user",
          timestamp: user.lastTimestamp,
        });

        if (
          filterConfig &&
          normalizedLastMessage &&
          typeof normalizedLastMessage.content === "string" &&
          normalizedLastMessage.content.length > 0
        ) {
          const filteredLastMessage = await filterMessage(
            normalizedLastMessage.content,
            { config: filterConfig },
          );
          if (filteredLastMessage !== normalizedLastMessage.content) {
            normalizedLastMessage.originalContent =
              normalizedLastMessage.content;
          }
          normalizedLastMessage.content = filteredLastMessage;
          if (normalizedLastMessage.contentType === "text") {
            normalizedLastMessage.displayContent = filteredLastMessage;
          }
        }

        // ดึงสถานะ AI ต่อผู้ใช้
        let aiEnabled = true;
        try {
          const status = await getUserStatus(user._id);
          aiEnabled = !!status.aiEnabled;
        } catch (_) {}

        const followStatus = followMap[user._id];
        const showFollowUp = config.showInChat !== false;
        const hasFollowUp =
          showFollowUp && followStatus ? !!followStatus.hasFollowUp : false;
        const followUpReason = hasFollowUp
          ? followStatus.followUpReason || ""
          : "";
        const followUpUpdatedAt = hasFollowUp
          ? followStatus.followUpUpdatedAt ||
            followStatus.lastAnalyzedAt ||
            null
          : null;

        // ดึงแท็กของผู้ใช้
        const tags = tagsMap[user._id] || [];

        // ดึงสถานะการซื้อ (ถ้ามี manual override ให้ใช้ ถ้าไม่ ให้ใช้จาก follow-up)
        let hasPurchased = false;
        if (typeof purchaseMap[user._id] === "boolean") {
          hasPurchased = purchaseMap[user._id];
        } else {
          // ใช้ข้อมูลจาก follow-up status
          hasPurchased = hasFollowUp;
        }

        // ดึงข้อมูลออเดอร์
        const userOrders = ordersMap[user._id] || [];
        const hasOrders = userOrders.length > 0;
        const orderCount = userOrders.length;

        const profileDisplayName =
          userProfile && typeof userProfile.displayName === "string"
            ? userProfile.displayName.trim()
            : "";

        return {
          userId: user._id,
          displayName: profileDisplayName || user._id.substring(0, 8) + "...",
          pictureUrl: userProfile ? userProfile.pictureUrl || null : null,
          statusMessage:
            platform === "line" && userProfile
              ? userProfile.statusMessage || null
              : null,
          lastMessage: normalizedLastMessage.displayContent,
          lastMessageRaw: user.lastMessage,
          lastTimestamp: user.lastTimestamp,
          messageCount: user.messageCount,
          unreadCount,
          platform,
          botId,
          aiEnabled,
          hasFollowUp,
          followUpReason,
          followUpUpdatedAt,
          tags,
          hasPurchased,
          hasOrders,
          orderCount,
          followUp: {
            analysisEnabled: config.analysisEnabled !== false,
            showInChat: showFollowUp,
            showInDashboard: config.showInDashboard !== false,
          },
        };
      }),
    );

    return normalizedUsers;
  } catch (error) {
    console.error("[NormalizedUsers] ข้อผิดพลาดในการดึงรายชื่อผู้ใช้:", error);
    return [];
  }
}
