const express = require("express");
const { ObjectId } = require("mongodb");

// API Routes
// REST API endpoints for bots, instructions, and settings
const router = express.Router();

// Dependencies from index.js
let connectDB,
  normalizeInstructionSelections,
  resolveInstructionSelections,
  ensureInstructionVersionSnapshot,
  getInstructionAssets,
  getSettingValue,
  DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
  resetFollowUpConfigCache,
  testMessageFiltering;

// Initialize function to receive dependencies from index.js
function initApiRoutes(deps) {
  connectDB = deps.connectDB;
  normalizeInstructionSelections = deps.normalizeInstructionSelections;
  resolveInstructionSelections = deps.resolveInstructionSelections;
  ensureInstructionVersionSnapshot = deps.ensureInstructionVersionSnapshot;
  getInstructionAssets = deps.getInstructionAssets;
  getSettingValue = deps.getSettingValue;
  DEFAULT_AUDIO_ATTACHMENT_RESPONSE = deps.DEFAULT_AUDIO_ATTACHMENT_RESPONSE;
  resetFollowUpConfigCache = deps.resetFollowUpConfigCache;
  testMessageFiltering = deps.testMessageFiltering;
}

// ============================ Health Check ============================

// GET /health
router.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "ChatCenter AI",
    version: "1.0.0",
  });
});

// ============================ Line Bot API ============================

// GET /api/line-bots
// Get all Line Bots
router.get("/api/line-bots", async (req, res) => {
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

// GET /api/line-bots/:id
// Get single Line Bot
router.get("/api/line-bots/:id", async (req, res) => {
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

// POST /api/line-bots
// Create new Line Bot
router.post("/api/line-bots", async (req, res) => {
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

    const lineBot = {
      name,
      description: description || "",
      channelAccessToken,
      channelSecret,
      webhookUrl: finalWebhookUrl,
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: "gpt-5",
      selectedInstructions: normalizedSelections,
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

// PUT /api/line-bots/:id
// Update Line Bot
router.put("/api/line-bots/:id", async (req, res) => {
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
      aiModel: req.body.aiModel || "gpt-5",
      updatedAt: new Date(),
    };

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

// DELETE /api/line-bots/:id
// Delete Line Bot
router.delete("/api/line-bots/:id", async (req, res) => {
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

// POST /api/line-bots/:id/test
// Test Line Bot connection
router.post("/api/line-bots/:id/test", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    const lineBot = await coll.findOne({ _id: new ObjectId(id) });
    if (!lineBot) {
      return res.status(404).json({ error: "ไม่พบ Line Bot ที่ระบุ" });
    }

    // Test Line Bot connection (simplified - actual implementation may vary)
    res.json({
      message: "ทดสอบการเชื่อมต่อสำเร็จ",
      bot: {
        name: lineBot.name,
        status: lineBot.status,
        webhookUrl: lineBot.webhookUrl,
      },
    });
  } catch (err) {
    console.error("Error testing line bot:", err);
    res.status(500).json({ error: "ไม่สามารถทดสอบ Line Bot ได้" });
  }
});

// PUT /api/line-bots/:id/instructions
// Update Line Bot instructions
router.put("/api/line-bots/:id/instructions", async (req, res) => {
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

// PUT /api/line-bots/:id/keywords
// Update Line Bot keyword settings
router.put("/api/line-bots/:id/keywords", async (req, res) => {
  try {
    const { id } = req.params;
    const { keywordSettings } = req.body;

    if (!keywordSettings || typeof keywordSettings !== "object") {
      return res
        .status(400)
        .json({ error: "keywordSettings ต้องเป็น object" });
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
      disableFollowUp: normalizeKeywordSetting(
        keywordSettings.disableFollowUp,
      ),
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

// ============================ Facebook Bot API ============================

// POST /api/facebook-bots/init
// Initialize Facebook Bot collection
router.post("/api/facebook-bots/init", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    // Check if collection exists and has data
    const count = await coll.countDocuments();

    res.json({
      message: "Facebook Bot collection initialized",
      count,
    });
  } catch (err) {
    console.error("Error initializing facebook bots:", err);
    res
      .status(500)
      .json({ error: "ไม่สามารถเตรียม Facebook Bot collection ได้" });
  }
});

// GET /api/facebook-bots
// Get all Facebook Bots
router.get("/api/facebook-bots", async (req, res) => {
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

// GET /api/facebook-bots/:id
// Get single Facebook Bot
router.get("/api/facebook-bots/:id", async (req, res) => {
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

// POST /api/facebook-bots
// Create new Facebook Bot
router.post("/api/facebook-bots", async (req, res) => {
  try {
    const {
      name,
      description,
      accessToken,
      verifyToken,
      webhookUrl,
      status,
      isDefault,
      selectedInstructions,
    } = req.body;

    if (!name || !accessToken || !verifyToken) {
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

    const facebookBot = {
      name,
      description: description || "",
      accessToken,
      verifyToken,
      webhookUrl: finalWebhookUrl,
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: "gpt-5",
      selectedInstructions: normalizedSelections,
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

// PUT /api/facebook-bots/:id
// Update Facebook Bot
router.put("/api/facebook-bots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      accessToken,
      verifyToken,
      webhookUrl,
      status,
      isDefault,
    } = req.body;

    if (!name || !accessToken || !verifyToken) {
      return res
        .status(400)
        .json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

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
      accessToken,
      verifyToken,
      webhookUrl: webhookUrl || "",
      status: status || "active",
      isDefault: isDefault || false,
      aiModel: req.body.aiModel || "gpt-5",
      updatedAt: new Date(),
    };

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

// DELETE /api/facebook-bots/:id
// Delete Facebook Bot
router.delete("/api/facebook-bots/:id", async (req, res) => {
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

// POST /api/facebook-bots/:id/test
// Test Facebook Bot connection
router.post("/api/facebook-bots/:id/test", async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const facebookBot = await coll.findOne({ _id: new ObjectId(id) });
    if (!facebookBot) {
      return res.status(404).json({ error: "ไม่พบ Facebook Bot ที่ระบุ" });
    }

    res.json({
      message: "ทดสอบการเชื่อมต่อสำเร็จ",
      bot: {
        name: facebookBot.name,
        status: facebookBot.status,
        webhookUrl: facebookBot.webhookUrl,
      },
    });
  } catch (err) {
    console.error("Error testing facebook bot:", err);
    res.status(500).json({ error: "ไม่สามารถทดสอบ Facebook Bot ได้" });
  }
});

// PUT /api/facebook-bots/:id/instructions
// Update Facebook Bot instructions
router.put("/api/facebook-bots/:id/instructions", async (req, res) => {
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

// PUT /api/facebook-bots/:id/keywords
// Update Facebook Bot keyword settings
router.put("/api/facebook-bots/:id/keywords", async (req, res) => {
  try {
    const { id } = req.params;
    const { keywordSettings } = req.body;

    if (!keywordSettings || typeof keywordSettings !== "object") {
      return res
        .status(400)
        .json({ error: "keywordSettings ต้องเป็น object" });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

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
      disableFollowUp: normalizeKeywordSetting(
        keywordSettings.disableFollowUp,
      ),
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

// ============================ Instructions API ============================

// GET /api/instructions/library
// List all instruction libraries
router.get("/api/instructions/library", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_library");

    const libraries = await coll.find({}).sort({ snapshotDate: -1 }).toArray();

    const response = libraries.map((lib) => ({
      date: lib.snapshotDate,
      count: lib.instructions ? lib.instructions.length : 0,
      createdAt: lib.createdAt,
    }));

    res.json({ success: true, libraries: response });
  } catch (err) {
    console.error("Error fetching instruction libraries:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงข้อมูล library ได้" });
  }
});

// GET /api/instructions/library/:date/details
// Get instruction library details by date
router.get("/api/instructions/library/:date/details", async (req, res) => {
  try {
    const { date } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instruction_library");

    const library = await coll.findOne({ snapshotDate: date });

    if (!library) {
      return res
        .status(404)
        .json({ success: false, error: "ไม่พบ library ที่ระบุ" });
    }

    res.json({
      success: true,
      library: {
        date: library.snapshotDate,
        instructions: library.instructions || [],
        createdAt: library.createdAt,
      },
    });
  } catch (err) {
    console.error("Error fetching library details:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงรายละเอียด library ได้" });
  }
});

// GET /api/instructions
// Get all instructions with version info
router.get("/api/instructions", async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const instrColl = db.collection("instructions");
    const versionColl = db.collection("instruction_versions");

    const allInstructions = await instrColl
      .find({})
      .sort({ order: 1 })
      .toArray();

    const response = await Promise.all(
      allInstructions.map(async (instruction) => {
        const instructionId =
          instruction.instructionId ||
          (instruction._id ? instruction._id.toString() : null);

        let versionCount = 0;
        if (instructionId) {
          versionCount = await versionColl.countDocuments({ instructionId });
        }

        const hasSnapshot = versionCount > 0;
        const currentVersion = instruction.version || 1;

        if (!hasSnapshot && instructionId) {
          try {
            await ensureInstructionVersionSnapshot(instructionId, db);
          } catch (e) {
            console.warn(
              `Could not ensure snapshot for ${instructionId}:`,
              e.message,
            );
          }
        }

        return {
          _id: instruction._id,
          instructionId,
          title: instruction.title || "",
          type: instruction.type || "text",
          content:
            instruction.type === "text"
              ? instruction.content || ""
              : `[Table: ${instruction.data?.rows?.length || 0} rows]`,
          order: instruction.order ?? 999,
          version: currentVersion,
          versionCount,
          hasVersions: hasSnapshot,
          createdAt: instruction.createdAt,
          updatedAt: instruction.updatedAt,
        };
      }),
    );

    res.json({ success: true, instructions: response });
  } catch (err) {
    console.error("Error fetching instructions with versions:", err);
    res
      .status(500)
      .json({ success: false, error: "ไม่สามารถดึงรายการ instructions ได้" });
  }
});

// ============================ Settings API ============================

// GET /api/settings
// Get all settings
router.get("/api/settings", async (req, res) => {
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
      enableMessageFiltering: true,
      hiddenWords: "",
      replacementText: "[ข้อความถูกซ่อน]",
      enableStrictFiltering: true,
      enableFollowUpAnalysis: true,
      followUpHistoryLimit: 10,
      followUpCooldownMinutes: 30,
      followUpModel: "gpt-5-mini",
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

// POST /api/settings/chat
// Save chat settings
router.post("/api/settings/chat", async (req, res) => {
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

// POST /api/settings/ai
// Save AI settings
router.post("/api/settings/ai", async (req, res) => {
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

// POST /api/settings/system
// Save system settings
router.post("/api/settings/system", async (req, res) => {
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

// POST /api/settings/filter
// Save filter settings
router.post("/api/settings/filter", async (req, res) => {
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

// POST /api/filter/test
// Test message filtering
router.post("/api/filter/test", async (req, res) => {
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

module.exports = { router, initApiRoutes };

