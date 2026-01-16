const line = require("@line/bot-sdk");
const moment = require("moment-timezone");
const { ObjectId } = require("mongodb");
const { extractBase64ImagesFromContent } = require("../utils/chatImageUtils");

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

function normalizePublicBaseUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/$/, "");
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value);
}

function buildChatImageUrl(baseUrl, messageId, imageIndex) {
  if (!baseUrl || !messageId) return "";
  return `${baseUrl}/assets/chat-images/${messageId}/${imageIndex}`;
}

function chunkLineMessages(messages, chunkSize = 5) {
  const chunks = [];
  if (!Array.isArray(messages) || messages.length === 0) return chunks;
  for (let index = 0; index < messages.length; index += chunkSize) {
    chunks.push(messages.slice(index, index + chunkSize));
  }
  return chunks;
}

function appendLineToTextMessage(message, line) {
  if (!message || message.type !== "text") return message;
  if (!line) return message;
  const text = typeof message.text === "string" ? message.text : "";
  const updated = text ? `${text}\n${line}` : line;
  const MAX_TEXT_LENGTH = 3900;
  message.text = updated.length > MAX_TEXT_LENGTH ? text : updated;
  return message;
}

async function fetchOrderImageRefs(db, order) {
  const orderId = normalizeIdString(order?._id);
  if (!ObjectId.isValid(orderId)) return [];

  const query = {
    orderId: new ObjectId(orderId),
    role: "user",
  };

  const senderId = normalizeIdString(order?.userId);
  if (senderId) {
    query.senderId = senderId;
  }

  const messages = await db
    .collection("chat_history")
    .find(query)
    .sort({ timestamp: 1 })
    .project({ content: 1 })
    .toArray();

  const imageRefs = [];
  messages.forEach((msg) => {
    const images = extractBase64ImagesFromContent(msg.content);
    if (!images.length) return;
    const messageId = normalizeIdString(msg?._id);
    if (!messageId) return;
    images.forEach((_, imageIndex) => {
      imageRefs.push({ messageId, imageIndex });
    });
  });

  return imageRefs;
}

function buildLineImageMessages(baseUrl, imageRefs) {
  if (!Array.isArray(imageRefs) || imageRefs.length === 0) return [];
  const normalizedBase = normalizePublicBaseUrl(baseUrl);
  if (!isHttpUrl(normalizedBase)) return [];

  return imageRefs
    .map((ref) => {
      const url = buildChatImageUrl(
        normalizedBase,
        ref.messageId,
        ref.imageIndex,
      );
      if (!url) return null;
      return {
        type: "image",
        originalContentUrl: url,
        previewImageUrl: url,
      };
    })
    .filter(Boolean);
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
  if (
    typeof channel.deliveryMode === "string" &&
    channel.deliveryMode.toLowerCase() === "scheduled"
  ) {
    return false;
  }
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

function shortenText(value, maxLength) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (!maxLength || maxLength <= 0) return text;
  return text.length > maxLength ? `${text.slice(0, Math.max(maxLength - 1, 0))}…` : text;
}

function formatCurrency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `฿${value.toLocaleString()}`;
}

function buildOrderAddress(orderData) {
  const raw = orderData && typeof orderData === "object" ? orderData : {};
  const parts = [
    normalizeIdString(raw.shippingAddress),
    normalizeIdString(raw.addressSubDistrict),
    normalizeIdString(raw.addressDistrict),
    normalizeIdString(raw.addressProvince),
    normalizeIdString(raw.addressPostalCode),
  ].filter(Boolean);
  return parts.join(" ").trim();
}

function extractOrderPhone(orderData) {
  const raw = orderData && typeof orderData === "object" ? orderData : {};
  return (
    normalizeIdString(raw.phone) ||
    normalizeIdString(raw.customerPhone) ||
    normalizeIdString(raw.shippingPhone) ||
    ""
  );
}

function extractPaymentMethod(orderData) {
  const raw = orderData && typeof orderData === "object" ? orderData : {};
  return (
    normalizeIdString(raw.paymentMethod) ||
    normalizeIdString(raw.paymentType) ||
    ""
  );
}

function formatSummaryRange(startAt, endAt, timezone) {
  if (!startAt || !endAt) return "";
  const tz = timezone || "Asia/Bangkok";
  const start = moment.tz(startAt, tz);
  const end = moment.tz(endAt, tz);
  if (!start.isValid() || !end.isValid()) return "";
  if (start.isSame(end, "day")) {
    return `${start.format("DD/MM HH:mm")}-${end.format("HH:mm")}`;
  }
  return `${start.format("DD/MM HH:mm")}-${end.format("DD/MM HH:mm")}`;
}

function formatOrderSummaryMessage(orders, options = {}) {
  const list = Array.isArray(orders) ? orders : [];
  const cfg = options.settings || {};
  const includeCustomer = cfg.includeCustomer !== false;
  const includeItemsCount = cfg.includeItemsCount !== false;
  const includeTotalAmount = cfg.includeTotalAmount !== false;
  const timezone = options.timezone || "Asia/Bangkok";

  const rangeLabel = formatSummaryRange(options.startAt, options.endAt, timezone);
  const title = rangeLabel
    ? `📊 สรุปออเดอร์ (${rangeLabel})`
    : "📊 สรุปออเดอร์";

  let totalAmount = 0;
  let totalShipping = 0;
  list.forEach((order) => {
    const orderData = order?.orderData || {};
    const amount = orderData.totalAmount;
    const shipping = orderData.shippingCost;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      totalAmount += amount;
    }
    if (typeof shipping === "number" && Number.isFinite(shipping)) {
      totalShipping += shipping;
    }
  });

  const lines = [title];
  const totalParts = [`รวม ${list.length} ออเดอร์`];
  if (includeTotalAmount) {
    const totalText = formatCurrency(totalAmount);
    if (totalText) totalParts.push(`ยอดรวม ${totalText}`);
  }
  lines.push(totalParts.join(" | "));

  if (includeTotalAmount && totalShipping > 0) {
    const shippingText = formatCurrency(totalShipping);
    if (shippingText) {
      lines.push(`ค่าส่งรวม ${shippingText}`);
    }
  }

  if (!list.length) {
    lines.push("ไม่มีออเดอร์ในรอบนี้");
    const text = lines.join("\n");
    const MAX_TEXT_LENGTH = 3900;
    return {
      type: "text",
      text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text,
    };
  }

  lines.push("รายการออเดอร์:");
  const maxOrders = 10;
  list.slice(0, maxOrders).forEach((order) => {
    const orderId = normalizeIdString(order?._id);
    const shortId = orderId ? orderId.slice(-6) : "-";
    const orderData = order?.orderData || {};
    const parts = [`#${shortId}`];

    if (includeCustomer) {
      const customerName =
        normalizeIdString(orderData.recipientName) ||
        normalizeIdString(orderData.customerName) ||
        "";
      if (customerName) {
        parts.push(shortenText(customerName, 40));
      }
    }

    if (includeItemsCount) {
      const items = Array.isArray(orderData.items) ? orderData.items : [];
      parts.push(`${items.length} รายการ`);
    }

    if (includeTotalAmount) {
      const amount = orderData.totalAmount;
      const amountText =
        typeof amount === "number" && Number.isFinite(amount)
          ? formatCurrency(amount)
          : null;
      if (amountText) parts.push(amountText);
    }

    lines.push(`- ${parts.join(" • ")}`);
  });

  if (list.length > maxOrders) {
    lines.push(`… และอีก ${(list.length - maxOrders).toLocaleString()} ออเดอร์`);
  }

  const text = lines.join("\n");
  const MAX_TEXT_LENGTH = 3900;
  return {
    type: "text",
    text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text,
  };
}

function normalizeOrderItem(item) {
  if (!item) return null;
  if (typeof item === "string") {
    const name = shortenText(item, 120);
    return name ? { name, quantity: 1, price: null } : null;
  }

  if (typeof item !== "object") return null;

  const nameRaw =
    item.product || item.shippingName || item.name || item.title || "สินค้า";
  const colorRaw = item.color || item.variant || "";
  const quantityRaw = item.quantity ?? item.qty ?? item.count ?? 1;
  const priceRaw = item.price ?? item.amount ?? item.unitPrice ?? null;

  const name = shortenText(nameRaw, 120);
  const color = shortenText(colorRaw, 60);
  const quantity =
    typeof quantityRaw === "number" && Number.isFinite(quantityRaw) && quantityRaw > 0
      ? Math.floor(quantityRaw)
      : 1;
  const price =
    typeof priceRaw === "number" && Number.isFinite(priceRaw) && priceRaw >= 0
      ? priceRaw
      : null;

  return { name, color, quantity, price };
}

function formatNewOrderMessage(order, settings, publicBaseUrl) {
  const cfg = settings || {};
  const includeCustomer = cfg.includeCustomer !== false;
  const includeItemsCount = cfg.includeItemsCount !== false;
  // Default to TRUE for details to ensure richness
  const includeItemsDetail = cfg.includeItemsDetail !== false;
  const includeTotalAmount = cfg.includeTotalAmount !== false;
  const includeAddress = cfg.includeAddress !== false;
  const includePhone = cfg.includePhone !== false;
  const includePaymentMethod = cfg.includePaymentMethod !== false;
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

  if (includeItemsDetail && items.length) {
    const normalizedItems = items
      .map(normalizeOrderItem)
      .filter(Boolean);
    if (normalizedItems.length) {
      lines.push("🧾 รายการสินค้า:");
      const maxItems = 20; // Increased limit
      normalizedItems.slice(0, maxItems).forEach((item) => {
        const colorPart = item.color ? ` (${item.color})` : "";
        // Always show price if available
        const pricePart = item.price !== null ? ` • ${formatCurrency(item.price)}` : "";
        // Add emoji for each item
        lines.push(`🔸 ${item.name}${colorPart} x${item.quantity}${pricePart}`);
      });
      if (normalizedItems.length > maxItems) {
        lines.push(`… และอีก ${(normalizedItems.length - maxItems).toLocaleString()} รายการ`);
      }
    }
  }

  const phone = extractOrderPhone(orderData);
  if (includePhone && phone) {
    lines.push(`📞 เบอร์โทร: ${shortenText(phone, 60)}`);
  }

  const address = buildOrderAddress(orderData);
  if (includeAddress && address) {
    lines.push(`📍 ที่อยู่: ${shortenText(address, 300)}`);
  }

  const paymentMethod = extractPaymentMethod(orderData);
  if (includePaymentMethod && paymentMethod) {
    lines.push(`💳 ชำระเงิน: ${shortenText(paymentMethod, 80)}`);
  }

  if (includeTotalAmount && totalAmount !== null) {
    lines.push(`💰 ยอดรวม: ${formatCurrency(totalAmount)}`);
  }

  if (includeOrderLink) {
    const base =
      typeof publicBaseUrl === "string" ? publicBaseUrl.replace(/\/$/, "") : "";
    if (base) {
      lines.push(`🔗 ดูรายการออเดอร์: ${base}/admin/orders`);
    }
  }

  const text = lines.join("\n");
  const MAX_TEXT_LENGTH = 3900;
  return { type: "text", text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text };
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

  const sendLineMessagesInChunks = async (senderBotId, targetId, messages) => {
    const normalized = Array.isArray(messages)
      ? messages.filter(Boolean)
      : messages
        ? [messages]
        : [];
    if (!normalized.length) return [];
    const chunks = chunkLineMessages(normalized, 5);
    const responses = [];
    for (const chunk of chunks) {
      const response = await sendToLineTarget(senderBotId, targetId, chunk);
      responses.push(response || null);
    }
    return responses;
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

    const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl);
    const canAttachImages = isHttpUrl(normalizedBaseUrl);
    const orderImageRefs = canAttachImages
      ? await fetchOrderImageRefs(db, order)
      : [];
    const orderImageMessages = canAttachImages
      ? buildLineImageMessages(normalizedBaseUrl, orderImageRefs)
      : [];

    let sentCount = 0;
    for (const channel of channels) {
      if (!shouldNotifyChannelForOrder(channel, order)) continue;

      const channelId = normalizeIdString(channel?._id);
      const senderBotId =
        normalizeIdString(channel.senderBotId) || normalizeIdString(channel.botId);
      const targetId = normalizeIdString(channel.groupId || channel.lineGroupId);
      if (!senderBotId || !targetId) continue;

      const message = formatNewOrderMessage(order, channel.settings, baseUrl);
      if (orderImageMessages.length > 0) {
        appendLineToTextMessage(
          message,
          `📷 รูปภาพจากลูกค้า: ${orderImageMessages.length.toLocaleString()} รูป`,
        );
      }

      const payloads =
        orderImageMessages.length > 0
          ? [message, ...orderImageMessages]
          : [message];

      try {
        const response = await sendLineMessagesInChunks(
          senderBotId,
          targetId,
          payloads,
        );
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

  const sendOrderSummary = async (channel, options = {}) => {
    const channelDoc = channel && typeof channel === "object" ? channel : {};
    if (channelDoc.isActive !== true) {
      return { success: false, error: "CHANNEL_INACTIVE" };
    }

    const senderBotId =
      normalizeIdString(channelDoc.senderBotId) || normalizeIdString(channelDoc.botId);
    const targetId = normalizeIdString(channelDoc.groupId || channelDoc.lineGroupId);
    if (!senderBotId || !targetId) {
      return { success: false, error: "CHANNEL_MISCONFIGURED" };
    }

    const windowStart = options.windowStart;
    const windowEnd = options.windowEnd;
    if (!(windowStart instanceof Date) || !(windowEnd instanceof Date)) {
      return { success: false, error: "INVALID_WINDOW" };
    }

    const client = await connectDB();
    const db = client.db("chatbot");

    const query = {
      extractedAt: {
        $gte: windowStart,
        $lt: windowEnd,
      },
    };

    if (channelDoc.receiveFromAllBots !== true) {
      const sources = uniqueSources(channelDoc.sources);
      if (!sources.length) {
        return { success: false, error: "NO_SOURCES" };
      }

      query.$or = sources
        .map((source) => {
          const platform = normalizePlatform(source?.platform);
          const botId = normalizeIdString(source?.botId);
          if (!botId) return null;
          const botIdQuery = ObjectId.isValid(botId)
            ? { $in: [botId, new ObjectId(botId)] }
            : botId;
          return { platform, botId: botIdQuery };
        })
        .filter(Boolean);
    }

    const orders = await db
      .collection("orders")
      .find(query)
      .sort({ extractedAt: 1 })
      .toArray();

    const message = formatOrderSummaryMessage(orders, {
      startAt: windowStart,
      endAt: windowEnd,
      timezone: channelDoc.summaryTimezone || "Asia/Bangkok",
      settings: channelDoc.settings || {},
    });

    const channelId = normalizeIdString(channelDoc?._id);

    try {
      const response = await sendLineMessagesInChunks(
        senderBotId,
        targetId,
        [message],
      );
      await insertNotificationLog(db, {
        channelId,
        orderId: null,
        eventType: "order_summary",
        status: "success",
        response: response || null,
      });
      return { success: true, sentCount: 1, orderCount: orders.length };
    } catch (err) {
      await insertNotificationLog(db, {
        channelId,
        orderId: null,
        eventType: "order_summary",
        status: "failed",
        errorMessage: err?.message || String(err),
      });
      return { success: false, error: err?.message || String(err) };
    }
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
    sendOrderSummary,
    testChannel,
  };
}

module.exports = createNotificationService;
