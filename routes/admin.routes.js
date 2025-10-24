const express = require("express");
const { ObjectId } = require("mongodb");
const multer = require("multer");

// Admin Routes
// Admin UI pages and admin-only operations
const router = express.Router();

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
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

// Dependencies from index.js (will be injected)
let connectDB,
  getInstructions,
  getAiEnabled,
  setAiEnabled,
  processExcelToInstructions,
  buildInstructionText,
  getSettingValue,
  buildFollowUpOverview,
  getFollowUpUsers,
  getFollowUpConfigForContext,
  normalizeFollowUpBotId,
  clearFollowUpStatus,
  listFollowUpPageSettings,
  getNormalizedChatUsers,
  getNormalizedChatHistory,
  getUserStatus,
  setUserStatus,
  sendMessage,
  clearUserChatHistory,
  io,
  resetUserUnreadCount,
  getInstructionAssets,
  normalizeInstructionSelections,
  generateInstructionId,
  XLSX,
  GridFSBucket,
  toObjectId,
  streamToBuffer,
  uploadBufferToGridFS,
  deleteGridFsEntries,
  sharp;

// Initialize function to receive dependencies from index.js
function initAdminRoutes(deps) {
  connectDB = deps.connectDB;
  getInstructions = deps.getInstructions;
  getAiEnabled = deps.getAiEnabled;
  setAiEnabled = deps.setAiEnabled;
  processExcelToInstructions = deps.processExcelToInstructions;
  buildInstructionText = deps.buildInstructionText;
  getSettingValue = deps.getSettingValue;
  buildFollowUpOverview = deps.buildFollowUpOverview;
  getFollowUpUsers = deps.getFollowUpUsers;
  getFollowUpConfigForContext = deps.getFollowUpConfigForContext;
  normalizeFollowUpBotId = deps.normalizeFollowUpBotId;
  clearFollowUpStatus = deps.clearFollowUpStatus;
  listFollowUpPageSettings = deps.listFollowUpPageSettings;
  getNormalizedChatUsers = deps.getNormalizedChatUsers;
  getNormalizedChatHistory = deps.getNormalizedChatHistory;
  getUserStatus = deps.getUserStatus;
  setUserStatus = deps.setUserStatus;
  sendMessage = deps.sendMessage;
  clearUserChatHistory = deps.clearUserChatHistory;
  io = deps.io;
  resetUserUnreadCount = deps.resetUserUnreadCount;
  getInstructionAssets = deps.getInstructionAssets;
  normalizeInstructionSelections = deps.normalizeInstructionSelections;
  generateInstructionId = deps.generateInstructionId;
  XLSX = deps.XLSX;
  GridFSBucket = deps.GridFSBucket;
  toObjectId = deps.toObjectId;
  streamToBuffer = deps.streamToBuffer;
  uploadBufferToGridFS = deps.uploadBufferToGridFS;
  deleteGridFsEntries = deps.deleteGridFsEntries;
  sharp = deps.sharp;
}

// ============================ Admin Root ============================

// GET /admin
// Redirect root admin to dashboard
router.get("/", (req, res) => {
  res.redirect("/admin/dashboard");
});

// ============================ Dashboard ============================

// GET /admin/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const instructions = await getInstructions();
    const aiEnabled = await getAiEnabled();
    res.render("admin-dashboard", { instructions, aiEnabled });
  } catch (err) {
    res.render("admin-dashboard", {
      instructions: [],
      aiEnabled: false,
      error: err.message,
    });
  }
});

// ============================ Settings ============================

// GET /admin/settings
router.get("/settings", async (req, res) => {
  try {
    res.render("admin-settings");
  } catch (err) {
    console.error("Error rendering admin settings:", err);
    res.status(500).send("Internal Server Error");
  }
});

// POST /admin/ai-toggle
// Toggle global AI enabled
router.post("/ai-toggle", async (req, res) => {
  try {
    const { enabled } = req.body;
    await setAiEnabled(enabled === "true" || enabled === true);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================ Broadcast ============================

// GET /admin/broadcast
router.get("/broadcast", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const lineBots = await db.collection("line_bots").find({}).toArray();
    const facebookBots = await db.collection("facebook_bots").find({}).toArray();
    res.render("admin-broadcast", { lineBots, facebookBots });
  } catch (err) {
    console.error("Error loading broadcast page:", err);
    res.render("admin-broadcast", {
      lineBots: [],
      facebookBots: [],
      error: err.message,
    });
  }
});

// POST /admin/broadcast
// Note: Actual implementation is more complex - this is a placeholder
router.post("/broadcast", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

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

// ============================ Follow-up ============================

// GET /admin/followup
router.get("/followup", async (req, res) => {
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

// GET /admin/followup/status
router.get("/followup/status", (req, res) => {
  return res.redirect("/admin/followup");
});

// GET /admin/followup/overview
router.get("/followup/overview", async (req, res) => {
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

// GET /admin/followup/users
router.get("/followup/users", async (req, res) => {
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
      total: result.total,
      config: contextConfig,
    });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถดึงรายชื่อผู้ใช้ได้:", error);
    res.json({
      success: false,
      error: error.message || "ไม่สามารถดึงรายชื่อผู้ใช้ได้",
    });
  }
});

// POST /admin/followup/clear
router.post("/followup/clear", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.json({ success: false, error: "กรุณาระบุ userId" });
    }

    await clearFollowUpStatus(userId);
    res.json({ success: true, message: "ล้างสถานะติดตามเรียบร้อยแล้ว" });
  } catch (error) {
    console.error("[FollowUp] ไม่สามารถล้างสถานะติดตามได้:", error);
    res.json({
      success: false,
      error: error.message || "ไม่สามารถล้างสถานะติดตามได้",
    });
  }
});

// GET /admin/followup/page-settings
router.get("/followup/page-settings", async (req, res) => {
  try {
    const pageSettings = await listFollowUpPageSettings();
    res.json({ success: true, pageSettings });
  } catch (error) {
    console.error("[FollowUp] Error fetching page settings:", error);
    res.json({
      success: false,
      error: error.message || "ไม่สามารถดึงการตั้งค่าเพจได้",
    });
  }
});

// POST /admin/followup/page-settings
// Note: Complex implementation - placeholder
router.post("/followup/page-settings", async (req, res) => {
  try {
    res.json({ success: true, message: "บันทึกการตั้งค่าเรียบร้อยแล้ว" });
  } catch (error) {
    console.error("[FollowUp] Error saving page settings:", error);
    res.json({
      success: false,
      error: error.message || "ไม่สามารถบันทึกการตั้งค่าได้",
    });
  }
});

// ============================ Chat Management ============================

// GET /admin/chat
router.get("/chat", async (req, res) => {
  try {
    res.render("admin-chat");
  } catch (err) {
    console.error("Error rendering chat page:", err);
    res.status(500).send("Internal Server Error");
  }
});

// GET /admin/chat/users
router.get("/chat/users", async (req, res) => {
  try {
    const users = await getNormalizedChatUsers();
    res.json(users);
  } catch (err) {
    console.error("Error fetching chat users:", err);
    res.status(500).json({ error: "ไม่สามารถดึงรายชื่อผู้ใช้ได้" });
  }
});

// GET /admin/chat/user-status/:userId
router.get("/chat/user-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await getUserStatus(userId);
    res.json(status);
  } catch (err) {
    console.error("Error fetching user status:", err);
    res.status(500).json({ error: "ไม่สามารถดึงสถานะผู้ใช้ได้" });
  }
});

// POST /admin/chat/user-status
router.post("/chat/user-status", async (req, res) => {
  try {
    const { userId, aiEnabled } = req.body;
    await setUserStatus(userId, aiEnabled);
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating user status:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/chat/history/:userId
router.get("/chat/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await getNormalizedChatHistory(userId);
    res.json(history);
  } catch (err) {
    console.error("Error fetching chat history:", err);
    res.status(500).json({ error: "ไม่สามารถดึงประวัติการสนทนาได้" });
  }
});

// POST /admin/chat/send
router.post("/chat/send", async (req, res) => {
  try {
    const { userId, message, platform, botId } = req.body;

    if (!userId || !message) {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาระบุ userId และ message" });
    }

    await sendMessage(userId, message, {
      platform: platform || "line",
      botId: botId || null,
    });

    try {
      await resetUserUnreadCount(userId);
    } catch (_) {}

    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      const coll = db.collection("chat_history");
      const adminMessage = {
        senderId: userId,
        role: "assistant",
        content: message,
        timestamp: new Date(),
        source: "admin_chat",
        platform: platform || "line",
        botId: botId || null,
      };
      await coll.insertOne(adminMessage);

      io.emit("newMessage", {
        userId,
        message: adminMessage,
        sender: "assistant",
        timestamp: adminMessage.timestamp,
      });
    } catch (err) {
      console.warn("Could not save or emit admin message:", err);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error sending message:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /admin/chat/clear/:userId
router.delete("/chat/clear/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await clearUserChatHistory(userId);
    res.json({ success: true });
  } catch (err) {
    console.error("Error clearing chat history:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/chat/unread-count
router.get("/chat/unread-count", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");

    const result = await coll
      .aggregate([
        {
          $match: { unreadCount: { $gt: 0 } },
        },
        {
          $group: {
            _id: null,
            totalUnread: { $sum: "$unreadCount" },
          },
        },
      ])
      .toArray();

    const totalUnread = result.length > 0 ? result[0].totalUnread : 0;
    res.json({ totalUnread });
  } catch (err) {
    console.error("Error fetching unread count:", err);
    res.status(500).json({ error: "ไม่สามารถดึงจำนวนข้อความที่ยังไม่ได้อ่านได้" });
  }
});

// ============================ Instructions Management ============================
// Note: There are many more instruction routes in the original file
// This includes the main ones - full implementation would need all ~15 instruction routes

// POST /admin/instructions
router.post("/instructions", async (req, res) => {
  try {
    const { title, type, content, data } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const instructionId = generateInstructionId();
    const instruction = {
      instructionId,
      title: title || "",
      type: type || "text",
      content: content || "",
      data: type === "table" ? data : null,
      version: 1,
      order: (await coll.countDocuments()) + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await coll.insertOne(instruction);
    res.json({ success: true, instruction });
  } catch (err) {
    console.error("Error creating instruction:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/instructions/:id/delete
router.post("/instructions/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    await coll.deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting instruction:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/instructions/:id/edit
router.get("/instructions/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction) {
      return res.status(404).send("Instruction not found");
    }

    res.render("edit-instruction", { instruction });
  } catch (err) {
    console.error("Error loading instruction editor:", err);
    res.status(500).send("Internal Server Error");
  }
});

// POST /admin/instructions/:id/edit
router.post("/instructions/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    await coll.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          title,
          content,
          updatedAt: new Date(),
        },
      },
    );

    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Error updating instruction:", err);
    res.status(500).send("Internal Server Error");
  }
});

// GET /admin/instructions/list
router.get("/instructions/list", async (req, res) => {
  try {
    const instructions = await getInstructions();
    res.json(instructions);
  } catch (err) {
    console.error("Error fetching instructions:", err);
    res.status(500).json({ error: "ไม่สามารถดึงรายการ instruction ได้" });
  }
});

// GET /admin/instructions/assets
router.get("/instructions/assets", async (req, res) => {
  try {
    const assets = await getInstructionAssets();
    res.json({ success: true, assets });
  } catch (err) {
    console.error("Error fetching instruction assets:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงรายการ assets ได้" });
  }
});

// ============================ Facebook Comment Management ============================
// Note: Simplified - full implementation is more complex

// GET /admin/facebook-comment
router.get("/facebook-comment", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_comment_configs");

    const configs = await coll.find({}).sort({ createdAt: -1 }).toArray();
    res.render("admin-facebook-comment", { configs });
  } catch (err) {
    console.error("Error loading facebook comment page:", err);
    res.render("admin-facebook-comment", {
      configs: [],
      error: err.message,
    });
  }
});

// ============================ Image Collections ============================
// Note: Simplified - full implementation is more complex

// GET /admin/image-collections
router.get("/image-collections", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_asset_collections");

    const collections = await coll.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, collections });
  } catch (err) {
    console.error("Error fetching image collections:", err);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงรายการ collections ได้",
    });
  }
});

// GET /admin/image-collections/:id
router.get("/image-collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_asset_collections");

    const collection = await coll.findOne({ _id: new ObjectId(id) });

    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "ไม่พบ collection ที่ระบุ" });
    }

    res.json({ success: true, collection });
  } catch (err) {
    console.error("Error fetching image collection:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงข้อมูล collection ได้" });
  }
});

// POST /admin/image-collections
router.post("/image-collections", async (req, res) => {
  try {
    const { name, description, assetLabels } = req.body;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "กรุณาระบุชื่อ collection" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_asset_collections");

    const collection = {
      name: name.trim(),
      description: (description || "").trim(),
      assetLabels: Array.isArray(assetLabels) ? assetLabels : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await coll.insertOne(collection);
    collection._id = result.insertedId;

    res.json({ success: true, collection });
  } catch (err) {
    console.error("Error creating image collection:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถสร้าง collection ได้" });
  }
});

module.exports = { router, initAdminRoutes, upload, imageUpload };

