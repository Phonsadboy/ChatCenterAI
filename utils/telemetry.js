/*************************************************
 * utils/telemetry.js
 * - ส่ง heartbeat ไปยัง Telegram Bot เพื่อเก็บข้อมูลภาพรวมการใช้งาน
 * - fire-and-forget: ไม่กระทบระบบหลักหากล้มเหลว
 * - ลูกค้าสามารถปิดได้ด้วย TELEMETRY_ENABLED=false
 *************************************************/

const axios = require("axios");
const crypto = require("crypto");
const pkg = require("../package.json");

// ── Configuration ──────────────────────────────────────────────────────
const TELEMETRY_ENABLED = process.env.TELEMETRY_ENABLED !== "false";
const TELEGRAM_BOT_TOKEN =
    process.env.TELEMETRY_TELEGRAM_BOT_TOKEN ||
    "8654122386:AAEAi3rHSTNReYJ0KgO8LdSteyargJUseaA";
const TELEGRAM_CHAT_ID =
    process.env.TELEMETRY_TELEGRAM_CHAT_ID || "1258157465";

// ส่งทุก 12 ชม. (ms)
const HEARTBEAT_INTERVAL_MS = 12 * 60 * 60 * 1000;
// Delay ตอน startup (30 วินาที) เพื่อให้ DB พร้อมก่อน
const STARTUP_DELAY_MS = 30 * 1000;

let intervalRef = null;

// ── Instance ID ────────────────────────────────────────────────────────
// สร้าง instance ID จาก MONGO_URI + PUBLIC_BASE_URL (hash ไม่เปิดเผยข้อมูลจริง)
function getInstanceId() {
    const seed =
        (process.env.MONGO_URI || "") + "|" + (process.env.PUBLIC_BASE_URL || "");
    return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 12);
}

// ── Collect Stats ──────────────────────────────────────────────────────
async function collectStats(db) {
    try {
        const [
            lineBotCount,
            facebookBotCount,
            userCount,
            conversationCount24h,
        ] = await Promise.all([
            db
                .collection("line_bots")
                .countDocuments()
                .catch(() => 0),
            db
                .collection("facebook_bots")
                .countDocuments()
                .catch(() => 0),
            db
                .collection("users")
                .countDocuments()
                .catch(() => 0),
            db
                .collection("chat_history")
                .countDocuments({
                    timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                })
                .catch(() => 0),
        ]);

        return {
            lineBots: lineBotCount,
            facebookBots: facebookBotCount,
            totalBots: lineBotCount + facebookBotCount,
            users: userCount,
            conversations24h: conversationCount24h,
        };
    } catch (err) {
        return {
            lineBots: "?",
            facebookBots: "?",
            totalBots: "?",
            users: "?",
            conversations24h: "?",
        };
    }
}

// ── Format Uptime ──────────────────────────────────────────────────────
function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// ── Send to Telegram ───────────────────────────────────────────────────
async function sendToTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(
        url,
        {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: "HTML",
            disable_notification: true,
        },
        { timeout: 10000 },
    );
}

// ── Main Heartbeat ─────────────────────────────────────────────────────
async function sendHeartbeat(db) {
    if (!TELEMETRY_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    try {
        const stats = await collectStats(db);
        const instanceId = getInstanceId();
        const uptime = formatUptime(process.uptime());
        const now = new Date().toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
            hour12: false,
        });

        const domainHint = process.env.PUBLIC_BASE_URL
            ? new URL(process.env.PUBLIC_BASE_URL).hostname
            : "unknown";

        const message =
            `📊 <b>ChatCenterAI Heartbeat</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🆔 Instance: <code>${instanceId}</code>\n` +
            `🌐 Domain: <code>${domainHint}</code>\n` +
            `📦 Version: <b>${pkg.version}</b>\n` +
            `⏱ Uptime: ${uptime}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🤖 Bots: ${stats.totalBots} (LINE: ${stats.lineBots}, FB: ${stats.facebookBots})\n` +
            `👥 Users: ${stats.users}\n` +
            `💬 Chats (24h): ${stats.conversations24h}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🕐 ${now}`;

        await sendToTelegram(message);
        console.log(`[Telemetry] Heartbeat sent ✓`);
    } catch (err) {
        // fire-and-forget — log but never throw
        console.log(`[Telemetry] Heartbeat failed (non-critical): ${err.message}`);
    }
}

// ── Startup Notification ───────────────────────────────────────────────
async function sendStartupNotification(db) {
    if (!TELEMETRY_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    try {
        const stats = await collectStats(db);
        const instanceId = getInstanceId();
        const now = new Date().toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
            hour12: false,
        });

        const domainHint = process.env.PUBLIC_BASE_URL
            ? new URL(process.env.PUBLIC_BASE_URL).hostname
            : "unknown";

        const message =
            `🟢 <b>ChatCenterAI Started</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🆔 Instance: <code>${instanceId}</code>\n` +
            `🌐 Domain: <code>${domainHint}</code>\n` +
            `📦 Version: <b>${pkg.version}</b>\n` +
            `🤖 Bots: ${stats.totalBots} | 👥 Users: ${stats.users}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🕐 ${now}`;

        await sendToTelegram(message);
        console.log(`[Telemetry] Startup notification sent ✓`);
    } catch (err) {
        console.log(
            `[Telemetry] Startup notification failed (non-critical): ${err.message}`,
        );
    }
}

// ── Initialize Telemetry ───────────────────────────────────────────────
function initTelemetry(db) {
    if (!TELEMETRY_ENABLED) {
        console.log(`[Telemetry] Disabled (TELEMETRY_ENABLED=false)`);
        return;
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log(
            `[Telemetry] Skipped — TELEMETRY_TELEGRAM_BOT_TOKEN or TELEMETRY_TELEGRAM_CHAT_ID not set`,
        );
        return;
    }

    console.log(`[Telemetry] Enabled — reporting to Telegram every 12h`);

    // ส่ง startup notification หลัง delay (ให้ DB พร้อม)
    setTimeout(() => {
        sendStartupNotification(db);
    }, STARTUP_DELAY_MS);

    // ตั้ง interval ส่ง heartbeat ทุก 12 ชม.
    intervalRef = setInterval(() => {
        sendHeartbeat(db);
    }, HEARTBEAT_INTERVAL_MS);

    // ไม่ให้ interval ค้าง process ไว้ (ถ้า app shutdown)
    if (intervalRef.unref) intervalRef.unref();
}

// ── InstructionAI Activity Tracking ────────────────────────────────────
// Rate-limit: ส่ง page visit notification ไม่เกิน 1 ครั้ง / 10 นาที / instance
const PAGE_VISIT_COOLDOWN_MS = 10 * 60 * 1000;
let lastPageVisitNotification = 0;

/**
 * แจ้งเมื่อมีคนเข้าหน้า InstructionAI
 * @param {string} username - ชื่อ admin ที่เข้า
 */
async function notifyPageVisit(username) {
    if (!TELEMETRY_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const now = Date.now();
    if (now - lastPageVisitNotification < PAGE_VISIT_COOLDOWN_MS) return;
    lastPageVisitNotification = now;

    try {
        const instanceId = getInstanceId();
        const domainHint = process.env.PUBLIC_BASE_URL
            ? new URL(process.env.PUBLIC_BASE_URL).hostname
            : "unknown";
        const timeStr = new Date().toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
            hour12: false,
        });

        const message =
            `👀 <b>InstructionAI — มีคนเข้าใช้</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 User: <b>${username || "unknown"}</b>\n` +
            `🌐 Domain: <code>${domainHint}</code>\n` +
            `🆔 Instance: <code>${instanceId}</code>\n` +
            `🕐 ${timeStr}`;

        await sendToTelegram(message);
    } catch (err) {
        // fire-and-forget
    }
}

/**
 * แจ้งเมื่อมีคนส่งคำสั่งใน InstructionAI (ใช้งานจริง)
 * @param {string} username - ชื่อ admin
 * @param {string} instructionName - ชื่อ instruction ที่กำลังใช้
 * @param {string} model - โมเดลที่ใช้
 */
async function notifyInstructionAIUsage(username, instructionName, model) {
    if (!TELEMETRY_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    try {
        const instanceId = getInstanceId();
        const domainHint = process.env.PUBLIC_BASE_URL
            ? new URL(process.env.PUBLIC_BASE_URL).hostname
            : "unknown";
        const timeStr = new Date().toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
            hour12: false,
        });

        const message =
            `💬 <b>InstructionAI — กำลังใช้งาน</b>\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 User: <b>${username || "unknown"}</b>\n` +
            `📋 Instruction: ${instructionName || "—"}\n` +
            `🧠 Model: ${model || "—"}\n` +
            `🌐 <code>${domainHint}</code> · <code>${instanceId}</code>\n` +
            `🕐 ${timeStr}`;

        await sendToTelegram(message);
    } catch (err) {
        // fire-and-forget
    }
}

module.exports = { initTelemetry, notifyPageVisit, notifyInstructionAIUsage };
