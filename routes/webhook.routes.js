const express = require("express");
const { ObjectId } = require("mongodb");
const line = require("@line/bot-sdk");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const FormData = require("form-data");
const { GridFSBucket } = require("mongodb");

// Webhook Routes
// LINE and Facebook webhook handlers
const router = express.Router();

// Dependencies from index.js
let connectDB,
  handleLineEvent,
  handleFacebookComment,
  detectKeywordAction,
  setUserStatus,
  resetUserUnreadCount,
  io,
  getSettingValue,
  DEFAULT_AUDIO_ATTACHMENT_RESPONSE,
  addToQueue,
  filterMessage,
  saveChatHistory,
  toObjectId,
  streamToBuffer,
  ASSETS_DIR,
  getAssetsMapForBot,
  normalizeInstructionSelections,
  buildSystemPromptFromSelections,
  getAssetsInstructionsText,
  getAIHistory,
  getAssistantResponseMultimodal,
  getAssistantResponseTextOnly,
  extractThaiReply;

// Initialize function to receive dependencies from index.js
function initWebhookRoutes(deps) {
  connectDB = deps.connectDB;
  handleLineEvent = deps.handleLineEvent;
  handleFacebookComment = deps.handleFacebookComment;
  detectKeywordAction = deps.detectKeywordAction;
  setUserStatus = deps.setUserStatus;
  resetUserUnreadCount = deps.resetUserUnreadCount;
  io = deps.io;
  getSettingValue = deps.getSettingValue;
  DEFAULT_AUDIO_ATTACHMENT_RESPONSE = deps.DEFAULT_AUDIO_ATTACHMENT_RESPONSE;
  addToQueue = deps.addToQueue;
  filterMessage = deps.filterMessage;
  saveChatHistory = deps.saveChatHistory;
  toObjectId = deps.toObjectId;
  streamToBuffer = deps.streamToBuffer;
  ASSETS_DIR = deps.ASSETS_DIR;
  getAssetsMapForBot = deps.getAssetsMapForBot;
  normalizeInstructionSelections = deps.normalizeInstructionSelections;
  buildSystemPromptFromSelections = deps.buildSystemPromptFromSelections;
  getAssetsInstructionsText = deps.getAssetsInstructionsText;
  getAIHistory = deps.getAIHistory;
  getAssistantResponseMultimodal = deps.getAssistantResponseMultimodal;
  getAssistantResponseTextOnly = deps.getAssistantResponseTextOnly;
  extractThaiReply = deps.extractThaiReply;
}

// ============================ Line Bot Webhook Handler ============================

// POST /webhook/line/:botId
// Dynamic Line Bot webhook handler
router.post("/webhook/line/:botId", async (req, res) => {
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

// GET /webhook/facebook/:botId
// Facebook Webhook verification
router.get("/webhook/facebook/:botId", async (req, res) => {
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

// POST /webhook/facebook/:botId
// Dynamic Facebook Bot webhook handler (POST events)
router.post("/webhook/facebook/:botId", async (req, res) => {
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
                  await coll.insertOne(controlDoc);

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
                await coll.insertOne(controlDoc);

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
                await coll.insertOne(baseDoc);
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

// ============================ Helper Functions ============================
// These functions are used by the webhook routes above

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

// Helper: parse message segments by image tokens (#[IMAGE:label])
function parseMessageSegmentsByImageTokens(text, assetsMap = {}) {
  const segments = [];
  const regex = /#\[IMAGE:([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      segments.push({ type: "text", text: before });
    }
    const label = match[1].trim();
    const asset = assetsMap[label];
    if (asset) {
      segments.push({ type: "image", ...asset });
    } else {
      segments.push({ type: "text", text: `[Image: ${label}]` });
    }
    lastIndex = regex.lastIndex;
  }

  const remaining = text.slice(lastIndex);
  if (remaining) {
    segments.push({ type: "text", text: remaining });
  }

  if (segments.length === 0) {
    segments.push({ type: "text", text });
  }

  return segments;
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
  await axios.post(`https://graph.facebook.com/v18.0/me/messages`, body, {
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

// Export router and init function and helper functions that might be used externally
module.exports = {
  router,
  initWebhookRoutes,
  sendFacebookMessage,
  sendFacebookImageMessage,
  parseMessageSegmentsByImageTokens,
};

