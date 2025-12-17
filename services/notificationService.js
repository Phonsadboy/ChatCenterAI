const line = require("@line/bot-sdk");
const { ObjectId } = require("mongodb");

function normalizePlatform(value) {
  const platform = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (platform === "facebook") return "facebook";
  return "line";
}

function normalizeIdString(value) {
  if (typeof value === "string") return value.trim();
  if (!value) return "";
  try {
    return value.toString();
  } catch {
    return String(value);
  }
}

function uniqueSources(sources) {
  if (!Array.isArray(sources)) return [];
  const seen = new Set();
  const out = [];
  sources.forEach((source) => {
    const platform = normalizePlatform(source?.platform);
    const botId = normalizeIdString(source?.botId);
    if (!botId) return;
    const key = `${platform}:${botId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ platform, botId });
  });
  return out;
}

function shouldNotifyChannelForOrder(channel, order) {
  if (!channel || channel.isActive !== true) return false;
  const eventTypes = Array.isArray(channel.eventTypes) ? channel.eventTypes : [];
  if (!eventTypes.includes("new_order")) return false;

  if (channel.receiveFromAllBots === true) return true;

  const orderPlatform = normalizePlatform(order?.platform);
  const orderBotId = normalizeIdString(order?.botId);
  if (!orderBotId) return false;

  const sources = uniqueSources(channel.sources);
  return sources.some(
    (source) => source.platform === orderPlatform && source.botId === orderBotId,
  );
}

function formatNewOrderMessage(order, settings, publicBaseUrl) {
  const cfg = settings || {};
  const includeCustomer = cfg.includeCustomer !== false;
  const includeItemsCount = cfg.includeItemsCount !== false;
  const includeTotalAmount = cfg.includeTotalAmount !== false;
  const includeOrderLink = cfg.includeOrderLink === true;

  const orderId = normalizeIdString(order?._id);
  const orderData = order?.orderData || {};

  const customerName =
    normalizeIdString(orderData.recipientName) ||
    normalizeIdString(orderData.customerName) ||
    "";

  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const totalAmountRaw = orderData.totalAmount;
  const totalAmount =
    typeof totalAmountRaw === "number" && Number.isFinite(totalAmountRaw)
      ? totalAmountRaw
      : null;

  const lines = ["🛒 ออเดอร์ใหม่!", `📦 ID: ${orderId || "-"}`];

  if (includeCustomer && customerName) {
    lines.push(`👤 ลูกค้า: ${customerName}`);
  }

  if (includeItemsCount) {
    lines.push(`📝 สินค้า: ${items.length.toLocaleString()} รายการ`);
  }

  if (includeTotalAmount && totalAmount !== null) {
    lines.push(`💰 ยอดรวม: ฿${totalAmount.toLocaleString()}`);
  }

  if (includeOrderLink) {
    const base =
      typeof publicBaseUrl === "string" ? publicBaseUrl.replace(/\/$/, "") : "";
    if (base) {
      lines.push(`🔗 ดูรายการออเดอร์: ${base}/admin/orders`);
    }
  }

  return { type: "text", text: lines.join("\n") };
}

async function insertNotificationLog(db, payload) {
  try {
    const logs = db.collection("notification_logs");
    await logs.insertOne({
      channelId: payload.channelId || null,
      orderId: payload.orderId || null,
      eventType: payload.eventType || null,
      status: payload.status || "failed",
      errorMessage: payload.errorMessage || null,
      response: payload.response || null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn(
      "[Notifications] ไม่สามารถบันทึก notification log ได้:",
      err?.message || err,
    );
  }
}

function createNotificationService({ connectDB, publicBaseUrl = "" } = {}) {
  if (typeof connectDB !== "function") {
    throw new Error("createNotificationService requires connectDB()");
  }

  const baseUrl =
    typeof publicBaseUrl === "string" ? publicBaseUrl.trim() : "";

  const sendToLineTarget = async (senderBotId, targetId, message) => {
    if (!ObjectId.isValid(senderBotId)) {
      throw new Error("Invalid senderBotId");
    }
    const client = await connectDB();
    const db = client.db("chatbot");
    const bot = await db.collection("line_bots").findOne(
      { _id: new ObjectId(senderBotId) },
      { projection: { channelAccessToken: 1, channelSecret: 1, name: 1 } },
    );
    if (!bot?.channelAccessToken || !bot?.channelSecret) {
      throw new Error("Sender bot credentials missing");
    }
    const lineClient = new line.Client({
      channelAccessToken: bot.channelAccessToken,
      channelSecret: bot.channelSecret,
    });
    return lineClient.pushMessage(targetId, message);
  };

  const sendNewOrder = async (orderId) => {
    const orderIdString = normalizeIdString(orderId);
    if (!ObjectId.isValid(orderIdString)) {
      throw new Error("Invalid orderId");
    }

    const client = await connectDB();
    const db = client.db("chatbot");

    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(orderIdString) });
    if (!order) {
      return { success: false, error: "ORDER_NOT_FOUND" };
    }

    const channels = await db
      .collection("notification_channels")
      .find({
        isActive: true,
        type: "line_group",
        eventTypes: "new_order",
      })
      .toArray();

    let sentCount = 0;
    for (const channel of channels) {
      if (!shouldNotifyChannelForOrder(channel, order)) continue;

      const channelId = normalizeIdString(channel?._id);
      const senderBotId =
        normalizeIdString(channel.senderBotId) || normalizeIdString(channel.botId);
      const targetId = normalizeIdString(channel.groupId || channel.lineGroupId);
      if (!senderBotId || !targetId) continue;

      const message = formatNewOrderMessage(order, channel.settings, baseUrl);

      try {
        const response = await sendToLineTarget(senderBotId, targetId, message);
        sentCount += 1;
        await insertNotificationLog(db, {
          channelId,
          orderId: orderIdString,
          eventType: "new_order",
          status: "success",
          response: response || null,
        });
      } catch (err) {
        await insertNotificationLog(db, {
          channelId,
          orderId: orderIdString,
          eventType: "new_order",
          status: "failed",
          errorMessage: err?.message || String(err),
        });
      }
    }

    return { success: true, sentCount };
  };

  const testChannel = async (channelId, options = {}) => {
    const channelIdString = normalizeIdString(channelId);
    if (!ObjectId.isValid(channelIdString)) {
      throw new Error("Invalid channelId");
    }

    const text =
      typeof options.text === "string" && options.text.trim()
        ? options.text.trim()
        : `✅ ทดสอบการแจ้งเตือนสำเร็จ (${new Date().toLocaleString("th-TH")})`;

    const client = await connectDB();
    const db = client.db("chatbot");

    const channel = await db
      .collection("notification_channels")
      .findOne({ _id: new ObjectId(channelIdString) });
    if (!channel) {
      return { success: false, error: "CHANNEL_NOT_FOUND" };
    }

    const senderBotId =
      normalizeIdString(channel.senderBotId) || normalizeIdString(channel.botId);
    const targetId = normalizeIdString(channel.groupId || channel.lineGroupId);
    if (!senderBotId || !targetId) {
      return { success: false, error: "CHANNEL_MISCONFIGURED" };
    }

    try {
      const response = await sendToLineTarget(senderBotId, targetId, {
        type: "text",
        text,
      });
      await insertNotificationLog(db, {
        channelId: channelIdString,
        orderId: null,
        eventType: "test",
        status: "success",
        response: response || null,
      });
      return { success: true };
    } catch (err) {
      await insertNotificationLog(db, {
        channelId: channelIdString,
        orderId: null,
        eventType: "test",
        status: "failed",
        errorMessage: err?.message || String(err),
      });
      return { success: false, error: err?.message || String(err) };
    }
  };

  return {
    sendNewOrder,
    testChannel,
  };
}

module.exports = createNotificationService;

