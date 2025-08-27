// -----------------------------------
// Original code with #DELETEMANY logic added
// -----------------------------------
const express = require('express');
const bodyParser = require('body-parser');
const util = require('util');
const { google } = require('googleapis');
const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb');
const { OpenAI } = require('openai');
const line = require('@line/bot-sdk');
const sharp = require('sharp'); // <--- เพิ่มตรงนี้ ตามต้นฉบับ
const axios = require('axios');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
// Middleware & misc packages for UI
const helmet = require('helmet');
const cors = require('cors');
const moment = require('moment-timezone');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const GOOGLE_CLIENT_EMAIL = "aitar-888@eminent-wares-446512-j8.iam.gserviceaccount.com";
const GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDGhyeINArKZgaV\nitEcK+o89ilPYeRNTNZgJT7VNHB5hgNLLeAcFLJ7IlCIqTLMoJEnnoDQil6aKaz8\nExVL83uSXRrzk4zQvtt3tIP31+9wOCb9D4ZGWfVP1tD0qdD4WJ1qqg1j1/8879pH\nUeQGEMuCnyVbcQ3GbYQjyYb3wEz/Qv7kMVggF+MIaGGw2NQwM0XcufSFtyxvvX2S\nb8uGc1A8R+Dn/tmcgMODhbtEgcMg6yXI5Y26MPfDjVrEbk0lfCr7IGFJX4ASYeKl\n0jhm0RGb+aya2cb55auLN3VPO5MQ+cOp8gHBf5GiC/YgF1gbRgF5b7LgmENBxSfH\nb3WVQodLAgMBAAECggEACKB14M7LdekXZHyAQrZL0EitbzQknLv33Xyw2B3rvJ7M\nr4HM/nC4eBj7y+ciUc8GZQ+CWc2GzTHTa66+mwAia1qdYbPp3LuhGM4Leq5zn/o+\nA3rJuG6PS4qyUMy89msPXW5fSj/oE535QREiFKYP2dtlia2GI4xoag+x9uZwfMUO\nWKEe7tiUoZQEiGhwtjLq9lyST4kGGmlhNee9OyhDJcw4uCt8Cepr++hMDleWUF6c\nX0nbGmoSS0sZ5Boy8ATMhw/3luaOAlTUEz/nVDvbbWlNL9etwLKiAVw+AQXsPHNW\nNWF7gyEIsEi0qSM3PtA1X7IdReRXHqmfiZs0J3qSQQKBgQD1+Yj37Yuqj8hGi5PY\n+M0ieMdGcbUOmJsM1yUmBMV4bfaTiqm504P6DIYAqfDDWeozcHwcdpG1AfFAihEi\nh6lb0qRk8YaGbzvac8mWhwo/jDA5QB97fjFa6uwtlewZ0Er/U3QmOeVVnVC1y1b0\nrbJD5yjvI3ve+gpwAz0glpIMiwKBgQDOnpD7p7ylG4NQunqmzzdozrzZP0L6EZyE\n141st/Hsp9rtO9/ADuH6WhpirQ516l5LLv7mLPA8S9CF/cSdWF/7WlxBPjM8WRs9\nACFNBJIwUfjzPnvECmtsayzRlKuyCAspnNSkzgtdtvf2xI82Z3BGov9goZfu+D4A\n36b1qXsIQQKBgQCO1CojhO0vyjPKOuxL9hTvqmBUWFyBMD4AU8F/dQ/RYVDn1YG+\npMKi5Li/E+75EHH9EpkO0g7Do3AaQNG4UjwWVJcfAlxSHa8Mp2VsIdfilJ2/8KsX\nQ2yXVYh04/Rn/No/ro7oT4AKmcGu/nbstxuncEgFrH4WOOzspATPsn72BwKBgG5N\nBAT0NKbHm0B7bIKkWGYhB3vKY8zvnejk0WDaidHWge7nabkzuLtXYoKO9AtKxG/K\ndNUX5F+r8XO2V0HQLd0XDezecaejwgC8kwp0iD43ZHkmQBgVn+dPB6wSe94coSjj\nyjj4reSnipQ3tmRKsAtldIN3gI5YA3Gf85dtlHqBAoGAD5ePt7cmu3tDZhA3A8f9\no8mNPvqz/WGs7H2Qgjyfc3jUxEGhVt1Su7J1j+TppfkKtJIDKji6rVA9oIjZtpZT\ngxnU6hcYuiwbLh3wGEFIjP1XeYYILudqfWOEbwnxD1RgMkCqfSHf/niWlfiH6p3F\ndnBsLY/qXdKfS/OXyezAm4M=\n-----END PRIVATE KEY-----\n";
const GOOGLE_DOC_ID = "1U-2OPVVI_Gz0-uFonrRNrcFopDqmPGUcJ4qJ1RdAqxY";
const SPREADSHEET_ID = "15nU46XyAh0zLAyD_5DJPfZ2Gog6IOsoedSCCMpnjEJo";
// FLOW_TEXT และรายละเอียด flow ต่าง ๆ ถูกลบออก เนื่องจากไม่ได้ใช้งานแล้ว

// Line Client จะถูกสร้างเมื่อต้องการใช้งานจริง (ไม่สร้างตั้งแต่เริ่มต้น)
let lineClient = null;

// ฟังก์ชันสำหรับสร้าง Line Client เมื่อต้องการใช้งาน
function createLineClient(channelAccessToken, channelSecret) {
  if (!channelAccessToken || !channelSecret) {
    throw new Error('Channel Access Token และ Channel Secret จำเป็นสำหรับการใช้งาน Line Bot');
  }
  
const lineConfig = {
    channelAccessToken,
    channelSecret
};
  
  return new line.Client(lineConfig);
}
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(bodyParser.json({ limit: '10mb' }));

// ============================ UI Middleware ============================
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
// Security headers (relaxed CSP ให้โหลด resource จาก CDN ได้)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"]
    }
  }
}));
app.use(cors());

// Static assets (CSS/JS/img)
app.use(express.static(path.join(__dirname, 'public')));

// Avoid favicon 404s in environments without a favicon
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================ Multer Configuration for Excel Upload ============================
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // ตรวจสอบว่าเป็นไฟล์ Excel หรือไม่
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.match(/\.(xlsx|xls)$/)) {
      cb(null, true);
    } else {
      cb(new Error('กรุณาเลือกไฟล์ Excel เท่านั้น (.xlsx หรือ .xls)'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// ฟังก์ชันสำหรับอ่านไฟล์ Excel และแปลงเป็น instructions
function processExcelToInstructions(buffer, originalName) {
  try {
    console.log(`[Excel] เริ่มประมวลผลไฟล์: ${originalName}`);
    
    // อ่านไฟล์ Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    
    console.log(`[Excel] พบแท็บใน Excel: ${sheetNames.length} แท็บ (${sheetNames.join(', ')})`);
    
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
          const validRows = dataRows.filter(row => 
            row && row.some(cell => cell !== undefined && cell !== null && cell !== '')
          );
          
          if (validRows.length > 0) {
            // สร้าง instruction แบบตาราง
            const tableData = {
              columns: headers.map(h => h || ''),
              rows: validRows.map(row => {
                const rowObj = {};
                headers.forEach((header, idx) => {
                  if (header && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
                    rowObj[header] = String(row[idx]);
                  }
                });
                return rowObj;
              }).filter(obj => Object.keys(obj).length > 0)
            };
            
            instructions.push({
              type: 'table',
              title: sheetName,
              content: `ข้อมูลจากแท็บ "${sheetName}" ในไฟล์ ${originalName}`,
              data: tableData,
              source: 'excel',
              fileName: originalName,
              sheetName: sheetName
            });
            
            console.log(`[Excel] สร้าง instruction ตาราง "${sheetName}": ${tableData.rows.length} แถว`);
          }
        } else if (jsonData.length === 1 && jsonData[0] && jsonData[0].length > 0) {
          // ถ้ามีแค่ 1 แถว ให้ถือเป็นข้อความ
          const textContent = jsonData[0].join(' ').trim();
          if (textContent) {
            instructions.push({
              type: 'text',
              title: sheetName,
              content: textContent,
              source: 'excel',
              fileName: originalName,
              sheetName: sheetName
            });
            
            console.log(`[Excel] สร้าง instruction ข้อความ "${sheetName}": ${textContent.length} อักขระ`);
          }
        }
      } catch (sheetError) {
        console.error(`[Excel] ข้อผิดพลาดในการประมวลผลแท็บ "${sheetName}":`, sheetError);
      }
    });
    
    console.log(`[Excel] ประมวลผลเสร็จสิ้น: สร้าง ${instructions.length} instructions`);
    return instructions;
    
  } catch (error) {
    console.error('[Excel] ข้อผิดพลาดในการประมวลผลไฟล์ Excel:', error);
    throw new Error('ไม่สามารถประมวลผลไฟล์ Excel ได้: ' + error.message);
  }
}

let mongoClient = null;
async function connectDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
  }
  return mongoClient;
}

/**
 * แก้ไขให้ content เป็น string เสมอ
 */
function normalizeRoleContent(role, content) {
  if (typeof content === 'string') {
    return { role, content };
  } else {
    // ถ้าไม่ใช่ string => stringify
    return { role, content: JSON.stringify(content) };
  }
}

async function getChatHistory(userId) {
  // ตรวจสอบการตั้งค่าการบันทึกประวัติ
  const enableChatHistory = await getSettingValue('enableChatHistory', true);
  
  if (!enableChatHistory) {
    console.log(`[LOG] การบันทึกประวัติแชทถูกปิดใช้งานสำหรับผู้ใช้: ${userId}`);
    return [];
  }
  
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  const chats = await coll.find({ senderId: userId }).sort({ timestamp: 1 }).toArray();
  return chats.map(ch => {
    try {
      const parsed = JSON.parse(ch.content);
      return normalizeRoleContent(ch.role, parsed);
    } catch {
      return normalizeRoleContent(ch.role, ch.content);
    }
  });
}

// ฟังก์ชันสำหรับดึงข้อมูลโปรไฟล์จาก LINE API
async function getLineUserProfile(userId) {
  try {
    const profile = await lineClient.getProfile(userId);
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage
    };
  } catch (error) {
    console.error(`[ERROR] ไม่สามารถดึงข้อมูลโปรไฟล์จาก LINE API สำหรับผู้ใช้ ${userId}:`, error.message);
    
    // ถ้าเป็น error เกี่ยวกับ rate limit หรือ temporary error ให้ retry
    if (error.status === 429 || error.status >= 500) {
      console.log(`[LOG] พยายาม retry สำหรับผู้ใช้ ${userId} ในอีก 5 วินาที...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        const retryProfile = await lineClient.getProfile(userId);
        return {
          userId: retryProfile.userId,
          displayName: retryProfile.displayName,
          pictureUrl: retryProfile.pictureUrl,
          statusMessage: retryProfile.statusMessage
        };
      } catch (retryError) {
        console.error(`[ERROR] Retry ไม่สำเร็จสำหรับผู้ใช้ ${userId}:`, retryError.message);
      }
    }
    
    return {
      userId: userId,
      displayName: userId.substring(0, 8) + '...',
      pictureUrl: null,
      statusMessage: null
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
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    return profile;
  } catch (error) {
    console.error(`[ERROR] ไม่สามารถบันทึกข้อมูลผู้ใช้ ${userId}:`, error.message);
    return null;
  }
}

async function saveChatHistory(userId, userMsg, assistantMsg, platform = 'line', botId = null) {
  // ตรวจสอบการตั้งค่าการบันทึกประวัติ
  const enableChatHistory = await getSettingValue('enableChatHistory', true);
  
  if (!enableChatHistory) {
    console.log(`[LOG] การบันทึกประวัติแชทถูกปิดใช้งานสำหรับผู้ใช้: ${userId}`);
    return;
  }
  
  // บันทึกหรืออัปเดตข้อมูลผู้ใช้ก่อน (เฉพาะ LINE)
  if (platform === 'line') {
    await saveOrUpdateUserProfile(userId);
  }
  
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("chat_history");
  let userMsgToSave = typeof userMsg === "string" ? userMsg : JSON.stringify(userMsg);
  await coll.insertOne({ senderId: userId, role: "user", content: userMsgToSave, timestamp: new Date(), platform, botId });
  await coll.insertOne({ senderId: userId, role: "assistant", content: assistantMsg, timestamp: new Date(), platform, botId });
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
    { upsert: true }
  );
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

// ตัวแปรเก็บ instructions จาก Google Doc
let googleDocInstructions = "";
async function fetchGoogleDocInstructions() {
  try {
    const auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
    });
    const docs = google.docs({ version: 'v1', auth });
    const res = await docs.documents.get({ documentId: GOOGLE_DOC_ID });
    const docBody = res.data.body?.content || [];
    let fullText = '';
    docBody.forEach(block => {
      if (block.paragraph?.elements) {
        block.paragraph.elements.forEach(elem => {
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
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth: sheetsAuth });
}

async function fetchSheetData(spreadsheetId, range) {
  try {
    const sheetsApi = await getSheetsApi();
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range
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
    const hasContent = row.some(cell => cell && cell.trim() !== "");
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
let sheetJSON = { qnaSteps: [], companyDetails: [], products: [], services: [] };

// รวม 4 แท็บ ถ้าจะเรียกหลายครั้ง
async function fetchAllSheetsData(spreadsheetId) {
  const [
    rowsQnASteps,      // "ลักษณะ/ขั้นตอน การถามตอบ"
    rowsMainFlow,       // "Main flow"
    rowsProductFlow,    // "Product flow"
    rowsServiceFlow,    // "Service flow"
    rowsCompany,        // "Company details"
    rowsProducts,       // "Products"
    rowsServices        // "Services"
  ] = await Promise.all([
    fetchSheetData(spreadsheetId, "ลักษณะ/ขั้นตอน การถามตอบ!A1:D1000"),
    fetchSheetData(spreadsheetId, "Main flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Product flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Service flow!A1:D1000"),
    fetchSheetData(spreadsheetId, "Company details!A1:D30"),
    fetchSheetData(spreadsheetId, "Products!A1:Q40"),
    fetchSheetData(spreadsheetId, "Services!A1:O40")
  ]);

  return {
    // รวมข้อมูลจาก "ลักษณะ/ขั้นตอน การถามตอบ" + main/product/service flow
    qnaSteps: transformSheetRowsToJSON(rowsQnASteps)
                .concat(
                  transformSheetRowsToJSON(rowsMainFlow),
                  transformSheetRowsToJSON(rowsProductFlow),
                  transformSheetRowsToJSON(rowsServiceFlow)
                ),
    companyDetails: transformSheetRowsToJSON(rowsCompany),
    products: transformSheetRowsToJSON(rowsProducts),
    services: transformSheetRowsToJSON(rowsServices)
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
const userQueues = {};  // { userId: { messages: [], timer: null } }

// ฟังก์ชันสำหรับวิเคราะห์ประเภทเนื้อหาในคิว
function analyzeQueueContent(messages) {
  const analysis = {
    textCount: 0,
    imageCount: 0,
    hasRecentText: false,
    hasRecentImage: false,
    shouldProcessSeparately: false,
    processingStrategy: 'combined' // 'combined', 'text_only', 'image_focused'
  };
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.data?.type === 'text') {
      analysis.textCount++;
      if (i >= messages.length - 2) analysis.hasRecentText = true;
    } else if (msg.data?.type === 'image') {
      analysis.imageCount++;
      if (i >= messages.length - 2) analysis.hasRecentImage = true;
    }
  }
  
  // กำหนดกลยุทธ์การประมวลผล
  if (analysis.imageCount === 0) {
    analysis.processingStrategy = 'text_only';
  } else if (analysis.textCount === 0) {
    analysis.processingStrategy = 'image_focused';
  } else if (analysis.imageCount > 2 || (analysis.hasRecentText && analysis.hasRecentImage)) {
    analysis.processingStrategy = 'combined';
  } else {
    analysis.processingStrategy = 'combined';
  }
  
  console.log(`[LOG] Content Analysis: ${analysis.textCount} texts, ${analysis.imageCount} images, strategy: ${analysis.processingStrategy}`);
  return analysis;
}

async function addToQueue(userId, incomingItem) {
  console.log(`[LOG] เพิ่มข้อมูลเข้าคิวสำหรับผู้ใช้: ${userId}`);
  
  if (!userQueues[userId]) {
    console.log(`[LOG] สร้างคิวใหม่สำหรับผู้ใช้: ${userId}`);
    userQueues[userId] = {
      messages: [],
      timer: null
    };
  }
  // ตรวจสอบจำนวนข้อความสูงสุดในคิว
  const maxQueueMessages = await getSettingValue('maxQueueMessages', 10);
  
  if (userQueues[userId].messages.length >= maxQueueMessages) {
    console.log(`[LOG] จำนวนข้อความในคิวถึงขีดจำกัด (${maxQueueMessages}) เริ่มประมวลผลทันที`);
    console.log(`[LOG] ไม่รอเวลา delay เนื่องจากจำนวนข้อความเต็มคิวแล้ว`);
    // ยกเลิกตัวจับเวลาเดิม
    if (userQueues[userId].timer) {
      clearTimeout(userQueues[userId].timer);
    }
    // ประมวลผลทันที
    flushQueue(userId);
    return;
  }
  
  userQueues[userId].messages.push(incomingItem);
  console.log(`[LOG] คิวของผู้ใช้ ${userId} มีข้อความ ${userQueues[userId].messages.length} ข้อความ`);

  if (userQueues[userId].timer) {
    console.log(`[LOG] ยกเลิกตัวจับเวลาคิวเดิมสำหรับผู้ใช้: ${userId}`);
    clearTimeout(userQueues[userId].timer);
  }
  
  // ใช้ค่าที่ตั้งไว้ในฐานข้อมูล
  const chatDelay = await getSettingValue('chatDelaySeconds', 5);
  console.log(`[LOG] ตั้งเวลาประมวลผลคิวใน ${chatDelay} วินาที สำหรับผู้ใช้: ${userId}`);
  console.log(`[LOG] ระบบจะรอข้อความเพิ่มจากผู้ใช้เป็นเวลา ${chatDelay} วินาที`);
  userQueues[userId].timer = setTimeout(() => {
    console.log(`[LOG] ครบเวลา delay (${chatDelay} วินาที) เริ่มประมวลผลคิวสำหรับผู้ใช้: ${userId}`);
    flushQueue(userId);
  }, chatDelay * 1000);
}

async function flushQueue(userId) {
  console.log(`[LOG] เริ่มการประมวลผลคิวสำหรับผู้ใช้: ${userId}`);
  
  if (!userQueues[userId] || userQueues[userId].messages.length === 0) {
    console.log(`[LOG] ไม่พบข้อความในคิวสำหรับผู้ใช้: ${userId}`);
    return;
  }
  const allItems = userQueues[userId].messages;
  console.log(`[LOG] มีข้อความ ${allItems.length} ข้อความในคิวของผู้ใช้: ${userId}`);
  userQueues[userId].messages = [];
  userQueues[userId].timer = null;

  console.log(`[LOG] เริ่มประมวลผลข้อความทั้งหมดในคิวสำหรับผู้ใช้: ${userId}`);
  await processFlushedMessages(userId, allItems);
  console.log(`[LOG] ประมวลผลคิวเสร็จสิ้นสำหรับผู้ใช้: ${userId}`);
}

async function processFlushedMessages(userId, mergedContent) {
  console.log(`[LOG] เริ่มประมวลผลข้อความในคิวสำหรับผู้ใช้: ${userId}`);
  
  // ตรวจสอบโหมดระบบ
  const systemMode = await getSettingValue('systemMode', 'production');
  if (systemMode === 'maintenance') {
    console.log(`[LOG] ระบบอยู่ในโหมดบำรุงรักษา ไม่สามารถประมวลผลข้อความได้`);
    // ส่งข้อความแจ้งเตือนผู้ใช้
    try {
      await lineClient.replyMessage(mergedContent[0].replyToken, {
        type: 'text',
        text: 'ขออภัยค่ะ ระบบกำลังอยู่ในโหมดบำรุงรักษา กรุณาลองใหม่อีกครั้งในภายหลัง'
      });
    } catch (error) {
      console.error('[LOG] ไม่สามารถส่งข้อความแจ้งเตือนได้:', error);
    }
    return;
  }
  
  const userStatus = await getUserStatus(userId);
  const aiEnabled = userStatus.aiEnabled;
  console.log(`[LOG] สถานะการใช้ AI ของผู้ใช้ ${userId}: ${aiEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}`);

  const history = await getChatHistory(userId);
  console.log(`[LOG] ดึงประวัติการสนทนาของผู้ใช้ ${userId}: ${history.length} ข้อความ`);

  // ตรวจสอบการตั้งค่า AI ในระดับระบบ
  const systemAiEnabled = await getSettingValue('aiEnabled', true);
  if (!systemAiEnabled) {
    console.log(`[LOG] AI ถูกปิดใช้งานในระดับระบบ`);
    await saveChatHistory(userId, mergedContent, "", 'line');
    return;
  }

  if (!aiEnabled) {
    // ถ้า AI ปิดอยู่
    console.log(`[LOG] AI ปิดใช้งาน, บันทึกข้อความโดยไม่มีการตอบกลับสำหรับผู้ใช้: ${userId}`);
    await saveChatHistory(userId, mergedContent, "", 'line');
    return;
  }

  // ตรวจสอบการตั้งค่าการรวมข้อความ
  const enableMessageMerging = await getSettingValue('enableMessageMerging', true);
  
  // วิเคราะห์เนื้อหาในคิวเพื่อกำหนดกลยุทธ์การประมวลผล
  const contentAnalysis = analyzeQueueContent(mergedContent);
  
  // แยกเนื้อหาตามประเภทและจัดเรียงตามลำดับที่ได้รับ
  const contentSequence = [];
  let combinedTextParts = [];
  let hasImages = false;
  
  // ใช้การตั้งค่าการรวมข้อความ
  if (enableMessageMerging) {
    for (const item of mergedContent) {
      if (item.data && item.data.type === 'text') {
        combinedTextParts.push(item.data.text);
        contentSequence.push({ type: 'text', content: item.data.text });
      } else if (item.data && item.data.type === 'image') {
        hasImages = true;
        contentSequence.push({ type: 'image', content: item.data.base64, description: item.data.text || 'ผู้ใช้ส่งรูปภาพมา' });
      }
    }
  } else {
    // ถ้าไม่เปิดการรวมข้อความ ให้ประมวลผลทีละข้อความ
    for (const item of mergedContent) {
      if (item.data && item.data.type === 'text') {
        contentSequence.push({ type: 'text', content: item.data.text });
      } else if (item.data && item.data.type === 'image') {
        hasImages = true;
        contentSequence.push({ type: 'image', content: item.data.base64, description: item.data.text || 'ผู้ใช้ส่งรูปภาพมา' });
      }
    }
  }

  const replyToken = mergedContent.length > 0 ? mergedContent[mergedContent.length - 1].replyToken : null;
  
  // สร้าง instructions
  console.log(`[LOG] สร้าง system instructions สำหรับการตอบกลับ...`);
  let systemInstructions = await buildSystemInstructions(history);
  
  let assistantMsg = "";
  
  // ใช้กลยุทธ์การประมวลผลตามการวิเคราะห์
  if (contentAnalysis.processingStrategy === 'text_only') {
    // กรณีมีแต่ข้อความ - ใช้โมเดลปกติ
    const combinedText = combinedTextParts.join('\n\n'); // ใช้ \n\n แทน space เพื่อแยกข้อความ
    console.log(`[LOG] ประมวลผลข้อความอย่างเดียว: ${combinedText.substring(0, 100)}${combinedText.length > 100 ? '...' : ''}`);
    assistantMsg = await getAssistantResponseTextOnly(systemInstructions, history, combinedText);
  } else if (contentAnalysis.processingStrategy === 'image_focused') {
    // กรณีมีแต่รูปภาพ - ให้ความสำคัญกับรูปภาพ
    console.log(`[LOG] ประมวลผลโฟกัสที่รูปภาพ: ${contentSequence.filter(c => c.type === 'image').length} รูป`);
    assistantMsg = await getAssistantResponseMultimodal(systemInstructions, history, contentSequence);
  } else {
    // กรณีมีทั้งข้อความและรูปภาพ - จัดการแบบผสม
    console.log(`[LOG] ประมวลผลเนื้อหาแบบ multimodal: ข้อความ ${combinedTextParts.length} ส่วน, รูปภาพ ${contentSequence.filter(c => c.type === 'image').length} รูป`);
    assistantMsg = await getAssistantResponseMultimodal(systemInstructions, history, contentSequence);
  }
  
  console.log(`[LOG] ได้รับคำตอบ: ${assistantMsg.substring(0, 100)}${assistantMsg.length > 100 ? '...' : ''}`);
  
  console.log(`[LOG] บันทึกประวัติการสนทนาสำหรับผู้ใช้: ${userId}`);
  await saveChatHistory(userId, mergedContent, assistantMsg, 'line');

  // แจ้งเตือนแอดมินเมื่อมีข้อความใหม่จากผู้ใช้
  try {
    await notifyAdminsNewMessage(userId, {
      content: Array.isArray(mergedContent) ? 
        mergedContent.map(item => item.data?.text || 'ไฟล์แนบ').join(' ') : 
        mergedContent,
      role: 'user',
      timestamp: new Date()
    });
  } catch (notifyError) {
    console.error('[Socket.IO] ไม่สามารถแจ้งเตือนแอดมินได้:', notifyError);
  }

  if (replyToken) {
    console.log(`[LOG] ส่งข้อความตอบกลับให้ผู้ใช้: ${userId}`);
    
    // กรองข้อความก่อนส่ง
    const filteredMessage = await filterMessage(assistantMsg);
    console.log(`[LOG] ข้อความหลังกรอง: ${filteredMessage.substring(0, 100)}${filteredMessage.length > 100 ? '...' : ''}`);
    
    // เนื่องจากไม่มี Line Client เริ่มต้น ให้ข้ามการส่งข้อความ
    console.log(`[LOG] ไม่สามารถส่งข้อความได้ - ต้องตั้งค่า Line Bot ก่อน`);
    // await sendMessage(replyToken, filteredMessage, userId, true);
    console.log(`[LOG] ส่งข้อความตอบกลับเรียบร้อยแล้ว`);
  }
}

// ------------------------
// webhook
// ------------------------
// Webhook handler จะถูกจัดการผ่าน dynamic webhook routes ที่สร้างขึ้นใหม่
// app.post('/webhook', ...) ถูกลบออกแล้ว

async function handleLineEvent(event) {
  let uniqueId = event.eventId || "";
  if (event.message && event.message.id) {
    uniqueId += "_" + event.message.id;
  }
  
  console.log(`[LOG] เริ่มประมวลผล event: ${uniqueId}`);
  
  if (processedIds.has(uniqueId)) {
    console.log(`[LOG] ข้าม event ที่ประมวลผลแล้ว: ${uniqueId}`);
    return;
  }
  processedIds.add(uniqueId);

  const userId = event.source.userId || "unknownUser";
  console.log(`[LOG] รับคำขอจากผู้ใช้: ${userId}`);

  // กรณีตรวจจับคีย์เวิร์ด #DELETEMANY (ลบประวัติทั้งหมดทันที)
  if (event.type === 'message' && event.message.type === 'text') {
    const userMsg = event.message.text;
    console.log(`[LOG] ข้อความจากผู้ใช้: ${userMsg.substring(0, 100)}${userMsg.length > 100 ? '...' : ''}`);
    
    if (userMsg.includes("#DELETEMANY")) {
      console.log(`[LOG] พบคำสั่ง #DELETEMANY จากผู้ใช้: ${userId}`);
      // เรียกฟังก์ชันล้างประวัติ
      await clearUserChatHistory(userId);
      // แจ้งผู้ใช้ว่าเราลบประวัติเรียบร้อยแล้ว
      // เนื่องจากไม่มี Line Client เริ่มต้น ให้ข้ามการส่งข้อความ
      console.log(`[LOG] ไม่สามารถส่งข้อความได้ - ต้องตั้งค่า Line Bot ก่อน`);
      // await sendMessage(event.replyToken, "ลบประวัติสนทนาเรียบร้อยแล้ว!", userId, true);
      console.log(`[LOG] ลบประวัติสนทนาของผู้ใช้ ${userId} เรียบร้อยแล้ว`);
      // ไม่ต้องบันทึกข้อความใหม่ หรือเข้าคิวใด ๆ ทั้งสิ้น -> return ออกได้เลย
      return;
    }

    // toggle แอดมิน (ตอบทันที)
    if (userMsg === "สวัสดีค่า แอดมิน Venus นะคะ จะมาดำเนินเรื่องต่อ") {
      console.log(`[LOG] พบคำสั่งเปลี่ยนเป็นโหมดแอดมินสำหรับผู้ใช้: ${userId}`);
      await setUserStatus(userId, false);
      // เนื่องจากไม่มี Line Client เริ่มต้น ให้ข้ามการส่งข้อความ
      console.log(`[LOG] ไม่สามารถส่งข้อความได้ - ต้องตั้งค่า Line Bot ก่อน`);
      // await sendMessage(event.replyToken, "แอดมิน Venus สวัสดีค่ะ", userId, true);
      await saveChatHistory(userId, userMsg, "แอดมิน Venus สวัสดีค่ะ", 'line');
      console.log(`[LOG] เปลี่ยนเป็นโหมดแอดมินเรียบร้อยแล้ว`);
      return;
    } else if (userMsg === "ขอนุญาตส่งต่อให้ทางแอดมินประจำสนทนาต่อนะคะ") {
      console.log(`[LOG] พบคำสั่งเปลี่ยนเป็นโหมด AI สำหรับผู้ใช้: ${userId}`);
      await setUserStatus(userId, true);
      // เนื่องจากไม่มี Line Client เริ่มต้น ให้ข้ามการส่งข้อความ
      console.log(`[LOG] ไม่สามารถส่งข้อความได้ - ต้องตั้งค่า Line Bot ก่อน`);
      // await sendMessage(event.replyToken, "แอดมิน Venus ขอตัวก่อนนะคะ", userId, true);
      await saveChatHistory(userId, userMsg, "แอดมิน Venus ขอตัวก่อนนะคะ", 'line');
      console.log(`[LOG] เปลี่ยนเป็นโหมด AI เรียบร้อยแล้ว`);
      return;
    }
  }

  // กรณีอื่น -> ใส่คิว
  if (event.type === 'message') {
    const message = event.message;
    let itemToQueue = { replyToken: event.replyToken };

    if (message.type === 'text') {
      console.log(`[LOG] เพิ่มข้อความเข้าคิว สำหรับผู้ใช้: ${userId}`);
      itemToQueue.data = { type: "text", text: message.text };
      addToQueue(userId, itemToQueue);

    } else if (message.type === 'image') {
      console.log(`[LOG] ได้รับรูปภาพจากผู้ใช้: ${userId}, กำลังประมวลผล...`);
      
      try {
        // ดึง stream ของภาพจาก LINE (ต้องมี Line Client ที่ถูกต้อง)
        // เนื่องจากไม่มี Line Client เริ่มต้น ให้ข้ามการประมวลผลรูปภาพ
        console.log(`[LOG] ไม่สามารถประมวลผลรูปภาพได้ - ต้องตั้งค่า Line Bot ก่อน`);
        itemToQueue.data = {
          type: "text",
          text: "ขออภัย ระบบยังไม่พร้อมประมวลผลรูปภาพ กรุณาตั้งค่า Line Bot ก่อน"
        };
        addToQueue(userId, itemToQueue);
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
              width: 1024,    // ขนาดที่เหมาะสมสำหรับ Vision API  
              height: 1024,   // จำกัดขนาดสูงสุด
              fit: 'inside',  // รักษาอัตราส่วน
              withoutEnlargement: true // ไม่ขยายรูปเล็ก
            })
            .jpeg({ 
              quality: 85,    // คุณภาพดีแต่ไฟล์ไม่ใหญ่เกินไป
              progressive: true 
            })
            .toBuffer();
          console.log(`[LOG] ปรับขนาดรูปภาพเรียบร้อย: ${resizedBuffer.length} bytes (ลดลง ${((1 - resizedBuffer.length/originalBuffer.length) * 100).toFixed(1)}%)`);
        } catch (err) {
          console.error("[ERROR] ไม่สามารถปรับขนาดรูปภาพได้:", err.message);
          resizedBuffer = originalBuffer;
          console.log(`[LOG] ใช้รูปภาพต้นฉบับแทน`);
        }

        // ตรวจสอบขนาดไฟล์หลังการปรับขนาด
        const maxSize = 20 * 1024 * 1024; // 20MB limit
        if (resizedBuffer.length > maxSize) {
          console.log(`[LOG] รูปภาพใหญ่เกินไป (${(resizedBuffer.length / 1024 / 1024).toFixed(1)}MB), ปรับคุณภาพลง...`);
          try {
            resizedBuffer = await sharp(resizedBuffer)
              .jpeg({ quality: 60 })
              .toBuffer();
            console.log(`[LOG] ปรับคุณภาพลงเรียบร้อย: ${resizedBuffer.length} bytes`);
          } catch (err) {
            console.error("[ERROR] ไม่สามารถปรับคุณภาพรูปภาพได้:", err.message);
          }
        }

        // เปลี่ยนเป็น base64
        const base64Data = resizedBuffer.toString('base64');
        console.log(`[LOG] แปลงรูปภาพเป็น base64 เรียบร้อย: ${(base64Data.length / 1024).toFixed(1)}KB`);

        // บันทึกเป็นรูปภาพเพื่อส่งต่อเข้าคิว พร้อมคำอธิบายที่ดีขึ้น
        itemToQueue.data = {
          type: "image",
          base64: base64Data,
          text: "ผู้ใช้ส่งรูปภาพมา โปรดดูรูปภาพและให้คำตอบที่เหมาะสม"
        };
        console.log(`[LOG] เพิ่มรูปภาพเข้าคิว สำหรับผู้ใช้: ${userId}`);
        addToQueue(userId, itemToQueue);
        
      } catch (err) {
        console.error("[ERROR] เกิดข้อผิดพลาดในการประมวลผลรูปภาพ:", err.message);
        // ส่งข้อความแจ้งเตือนกลับไปแทน
        itemToQueue.data = {
          type: "text",
          text: "เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองส่งรูปภาพใหม่อีกครั้ง"
        };
        addToQueue(userId, itemToQueue);
      }

    } else if (message.type === 'video') {
      console.log(`[LOG] ได้รับวิดีโอจากผู้ใช้: ${userId}`);
      itemToQueue.data = {
        type: "text",
        text: "ผู้ใช้ส่งไฟล์แนบประเภท: video"
      };
      console.log(`[LOG] เพิ่มการแจ้งเตือนวิดีโอเข้าคิว สำหรับผู้ใช้: ${userId}`);
      addToQueue(userId, itemToQueue);
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

    if ((currentMinute % 15 === 0) && (lastUpdatedQuarter !== currentQuarterLabel)) {
      console.log("[DEBUG] It's a new 15-minute interval => refreshing sheet data & doc instructions...");

      try {
        await fetchGoogleDocInstructions();
        sheetJSON = await fetchAllSheetsData(SPREADSHEET_ID);

        lastUpdatedQuarter = currentQuarterLabel;
        console.log(`[DEBUG] sheetJSON & googleDocInstructions updated at ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
      } catch (err) {
        console.error("15-minute sheet update error:", err);
      }
    }
  }, 60 * 1000);
}

// ------------------------
// Start server
// ------------------------
server.listen(PORT, async () => {
  console.log(`[LOG] เริ่มต้นเซิร์ฟเวอร์ที่พอร์ต ${PORT}...`);
  try {
    console.log(`[LOG] กำลังเชื่อมต่อฐานข้อมูล MongoDB...`);
    await connectDB();
    console.log(`[LOG] เชื่อมต่อฐานข้อมูลสำเร็จ`);
    
    console.log(`[LOG] กำลังดึงข้อมูล instructions จาก Google Doc...`);
    await fetchGoogleDocInstructions();
    console.log(`[LOG] ดึงข้อมูล instructions สำเร็จ (${googleDocInstructions.length} อักขระ)`);

    // ใช้ฟังก์ชันใหม่ดึงข้อมูลทุกแท็บจาก Google Sheets
    console.log(`[LOG] เริ่มดึงข้อมูลทุกแท็บจาก Google Sheets...`);
    sheetJSON = await fetchAllSheetsDataNew(SPREADSHEET_ID);
    console.log(`[LOG] ดึงข้อมูลจาก Google Sheets เสร็จสิ้น ได้ข้อมูลจาก ${Object.keys(sheetJSON).length} แท็บ`);

    // ใช้ฟังก์ชันใหม่สำหรับรีเฟรชข้อมูลทุก 1 วัน
    console.log(`[LOG] ตั้งค่าการรีเฟรชข้อมูลอัตโนมัติ...`);
    scheduleDailyRefresh();
    
    // เริ่มระบบ backup อัตโนมัติประจำวัน
    console.log(`[LOG] เริ่มระบบ backup อัตโนมัติประจำวัน...`);
    scheduleDailyInstructionLibrary();

    // ทำให้แน่ใจว่ามีการตั้งค่าเริ่มต้นใน collection settings
    await ensureSettings();

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
      last_analyzed: null 
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
async function sendMessage(replyToken, message, userId, splitLongMessage = false, channelAccessToken = null, channelSecret = null) {
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
        parts.push(message.substring(i, Math.min(message.length, i + MAX_LENGTH)));
      }
      
      // ส่งข้อความที่แบ่งเป็นชุด
      await client.replyMessage(replyToken, parts.map(part => ({
        type: "text",
        text: part
      })));
    } else {
      // ส่งข้อความปกติ
      await client.replyMessage(replyToken, {
        type: "text",
        text: message.substring(0, MAX_LENGTH) // ตัดข้อความให้ไม่เกินขีดจำกัด
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
      cleanedFlowAnalysis = cleanedFlowAnalysis.replace(/^```(?:json)?\s*\n/, "");
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
      flowData.existing_info.forEach(info => {
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
      last_analyzed: new Date()
    };
    
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_flow_history");
    
    // ถ้ามีข้อมูลเดิมให้อัพเดต ถ้าไม่มีให้เพิ่มใหม่
    if (oldFlowHistory && oldFlowHistory.senderId) {
      await coll.updateOne(
        { senderId: userId },
        { $set: newFlowHistory }
      );
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
  console.log(`[LOG] เริ่มดึงข้อมูลจากทุกแท็บใน spreadsheet ${spreadsheetId}...`);
  try {
    const sheetsApi = await getSheetsApi();
    console.log(`[LOG] เชื่อมต่อ Google Sheets API สำเร็จ`);
    
    // ดึงข้อมูลทุกแท็บจาก spreadsheet
    const response = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      includeGridData: false
    });
    console.log(`[LOG] ดึงข้อมูล metadata ของ spreadsheet สำเร็จ`);
    
    // ดึงรายชื่อแท็บทั้งหมด
    const allSheets = response.data.sheets.map(sheet => sheet.properties.title);
    console.log(`[LOG] พบแท็บทั้งหมด ${allSheets.length} แท็บ: ${allSheets.join(', ')}`);
    
    // ดึงข้อมูลจากทุกแท็บ
    const allData = {};
    
    // ดึงข้อมูลจากทุกแท็บพร้อมกัน
    console.log(`[LOG] เริ่มดึงข้อมูลจากทุกแท็บพร้อมกัน...`);
    const dataPromises = allSheets.map(async (sheetTitle) => {
      try {
        console.log(`[LOG] กำลังดึงข้อมูลจากแท็บ "${sheetTitle}"...`);
        const rows = await fetchSheetData(spreadsheetId, `${sheetTitle}!A1:Z1000`);
        allData[sheetTitle] = transformSheetRowsToJSON(rows);
        console.log(`[LOG] ดึงข้อมูลจากแท็บ "${sheetTitle}" สำเร็จ: ${allData[sheetTitle].length} แถว`);
        return { sheetTitle, success: true };
      } catch (error) {
        console.error(`[ERROR] ไม่สามารถดึงข้อมูลจากแท็บ "${sheetTitle}" ได้:`, error);
        allData[sheetTitle] = [];
        return { sheetTitle, success: false, error };
      }
    });
    
    // รอให้ดึงข้อมูลทุกแท็บเสร็จ
    const results = await Promise.all(dataPromises);
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`[LOG] ดึงข้อมูลสำเร็จ ${successCount} แท็บ, ล้มเหลว ${failCount} แท็บ`);
    return allData;
  } catch (error) {
    console.error(`[ERROR] เกิดข้อผิดพลาดในการดึงข้อมูลทุกแท็บ:`, error);
    return {};
  }
}

// เปลี่ยนฟังก์ชันรีเฟรชข้อมูลจาก 15 นาทีเป็น 1 วัน
function scheduleDailyRefresh() {
  console.log(`[LOG] เริ่มต้นระบบรีเฟรชข้อมูลประจำวัน (ตั้งเวลาจะรีเฟรชเวลา 00:05 น.)...`);
  let lastRefreshDate = "";
  
  setInterval(async () => {
    const now = new Date();
    const thaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentDate = thaiTime.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // แสดง log เฉพาะเมื่อเวลาอยู่ในช่วงที่ต้องการรีเฟรช
    if (thaiTime.getHours() === 0 && thaiTime.getMinutes() >= 4 && thaiTime.getMinutes() <= 6) {
      console.log(`[LOG] ตรวจสอบเวลารีเฟรชข้อมูลประจำวัน: ${thaiTime.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
    }
    
    // รีเฟรชที่เวลา 00:05 น. และยังไม่เคยรีเฟรชในวันนี้
    if (thaiTime.getHours() === 0 && thaiTime.getMinutes() === 5 && lastRefreshDate !== currentDate) {
      console.log(`[LOG] เริ่มรีเฟรชข้อมูลประจำวันที่ ${currentDate} เวลา ${thaiTime.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}...`);

      try {
        console.log(`[LOG] กำลังดึงข้อมูล instructions จาก Google Doc...`);
        await fetchGoogleDocInstructions();
        console.log(`[LOG] ดึงข้อมูล instructions สำเร็จ (${googleDocInstructions.length} อักขระ)`);
        
        console.log(`[LOG] กำลังดึงข้อมูลจากทุกแท็บใน Google Sheets...`);
        // ใช้ฟังก์ชันใหม่ดึงข้อมูลทุกแท็บ
        sheetJSON = await fetchAllSheetsDataNew(SPREADSHEET_ID);
        
        console.log(`[LOG] รีเฟรชข้อมูลเสร็จสมบูรณ์ ได้ข้อมูลจาก ${Object.keys(sheetJSON).length} แท็บ`);
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

  let systemText = "คุณเป็น AI chatbot ภาษาไทย\n\n";

  for (const inst of instructions) {
    if (inst.type === 'text') {
      if (inst.title) systemText += `=== ${inst.title} ===\n`;
      systemText += inst.content + "\n\n";
    } else if (inst.type === 'table') {
      if (inst.title) systemText += `=== ${inst.title} ===\n`;
      systemText += "ข้อมูลตารางในรูปแบบ JSON:\n```json\n" + JSON.stringify(inst.data, null, 2) + "\n```\n\n";
    }
  }

  // เพิ่มเวลาไทยปัจจุบัน
  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
  systemText += `เวลาปัจจุบัน: ${now}`;

  return systemText.trim();
}

// ฟังก์ชันสำหรับจัดการข้อความอย่างเดียว (ไม่มีรูปภาพ)
async function getAssistantResponseTextOnly(systemInstructions, history, userText, aiModel = null) {
  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    console.log(`[LOG] สร้าง messages สำหรับการเรียก OpenAI API (ข้อความอย่างเดียว)...`);

    const messages = [
      { role: "system", content: systemInstructions },
      ...history,
      { role: "user", content: userText }
    ];

    console.log(`[LOG] ส่งคำขอไปยัง OpenAI API (ข้อความ)...`);
    
    // ใช้โมเดลที่ส่งมา หรือ fallback ไปใช้ global setting
    const textModel = aiModel || await getSettingValue('textModel', 'gpt-5');
    
    const response = await openai.chat.completions.create({
      model: textModel,
      messages
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

    // เพิ่มข้อมูล token usage ต่อท้ายคำตอบ
    if (response.usage) {
      const usage = response.usage;
      const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens`;
      assistantReply += tokenInfo;
      console.log(`[LOG] Token usage (text): ${usage.total_tokens} total (${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion)`);
    }

    return assistantReply.trim();
  } catch (err) {
    console.error("OpenAI text error:", err);
    return "ขออภัยค่ะ ระบบขัดข้องชั่วคราว ไม่สามารถตอบได้ในขณะนี้";
  }
}

// ฟังก์ชันสำหรับจัดการเนื้อหาแบบ multimodal (ข้อความ + รูปภาพ)
async function getAssistantResponseMultimodal(systemInstructions, history, contentSequence, aiModel = null) {
  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    console.log(`[LOG] สร้าง messages สำหรับการเรียก OpenAI API (multimodal)...`);

    // จัดการเนื้อหาตามลำดับ - แต่จำกัดจำนวนรูปภาพเพื่อควบคุมต้นทุน
    const maxImages = await getSettingValue('maxImagesPerMessage', 3); // ใช้ค่าที่ตั้งไว้
    let imageCount = 0;
    let finalContent = [];
    let textParts = [];
    
    for (const item of contentSequence) {
      if (item.type === 'text') {
        textParts.push(item.content);
      } else if (item.type === 'image' && imageCount < maxImages) {
        // รวมข้อความที่สะสมก่อนรูปภาพ
        if (textParts.length > 0) {
          finalContent.push({ 
            type: "text", 
            text: textParts.join('\n\n') 
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
             detail: useHighDetail ? "high" : "low" // ปรับ detail ตามขนาดรูป
           }
         });
         
         console.log(`[LOG] ใช้ detail: ${useHighDetail ? "high" : "low"} สำหรับรูปภาพขนาด ${(imageSize / 1024).toFixed(1)}KB`);
        
        // เพิ่มคำอธิบายรูปภาพ
        finalContent.push({
          type: "text",
          text: `[รูปภาพที่ ${imageCount + 1}]: ${item.description}`
        });
        
        imageCount++;
        console.log(`[LOG] เพิ่มรูปภาพที่ ${imageCount} เข้าไปใน content`);
      } else if (item.type === 'image' && imageCount >= maxImages) {
        // ถ้าเกินจำนวนรูปภาพที่กำหนด ให้แจ้งเตือน
        textParts.push(`[มีรูปภาพเพิ่มเติมที่ไม่สามารถแสดงได้เนื่องจากข้อจำกัดการประมวลผล]`);
      }
    }
    
    // รวมข้อความที่เหลือ
    if (textParts.length > 0) {
      finalContent.push({ 
        type: "text", 
        text: textParts.join('\n\n') 
      });
    }
    
    // หากไม่มีเนื้อหาใด ๆ ให้เพิ่มข้อความขอให้อธิบาย
    if (finalContent.length === 0) {
      finalContent.push({ 
        type: "text", 
        text: "ผู้ใช้ส่งเนื้อหามา โปรดตอบกลับอย่างเหมาะสม" 
      });
    }

    const messages = [
      { role: "system", content: systemInstructions },
      ...history,
      { role: "user", content: finalContent }
    ];

    console.log(`[LOG] ส่งคำขอไปยัง OpenAI API (multimodal) พร้อมรูปภาพ ${imageCount} รูป...`);
    
    // ใช้โมเดลที่ส่งมา หรือ fallback ไปใช้ global setting
    const visionModel = aiModel || await getSettingValue('visionModel', 'gpt-5');
    
    const response = await openai.chat.completions.create({
      model: visionModel,
      messages
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

    // เพิ่มข้อมูล token usage ต่อท้ายคำตอบ
    if (response.usage) {
      const usage = response.usage;
      const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens (มีรูปภาพ ${imageCount} รูป)`;
      assistantReply += tokenInfo;
      console.log(`[LOG] Token usage (multimodal): ${usage.total_tokens} total (${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion) with ${imageCount} images`);
    }

    return assistantReply.trim();
  } catch (err) {
    console.error("OpenAI multimodal error:", err);
    return "ขออภัยค่ะ ระบบขัดข้องชั่วคราว ไม่สามารถประมวลผลรูปภาพได้ในขณะนี้";
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
    { key: "chatDelaySeconds", value: 5 },
    { key: "maxQueueMessages", value: 10 },
    { key: "enableMessageMerging", value: true },
    { key: "textModel", value: "gpt-5" },
    { key: "visionModel", value: "gpt-5" },
    { key: "maxImagesPerMessage", value: 3 },
    { key: "defaultInstruction", value: "" },
    { key: "enableChatHistory", value: true },
    { key: "enableAdminNotifications", value: true },
    { key: "systemMode", value: "production" }
  ];
  
  for (const setting of defaultSettings) {
    const existing = await coll.findOne({ key: setting.key });
    if (!existing) {
      await coll.insertOne(setting);
      console.log(`[SETTINGS] สร้างการตั้งค่าเริ่มต้น: ${setting.key} = ${setting.value}`);
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
  await coll.updateOne({ key: "aiEnabled" }, { $set: { value: !!state } }, { upsert: true });
}

async function getInstructions() {
  const client = await connectDB();
  const db = client.db("chatbot");
  const coll = db.collection("instructions");
  return coll.find({}).sort({ order: 1, createdAt: 1 }).toArray();
}

// ============================ Instruction Library ============================
async function saveInstructionsToLibrary(dateStr) {
  const client = await connectDB();
  const db = client.db("chatbot");
  const instrColl = db.collection("instructions");
  const libraryColl = db.collection("instruction_library");

  const instructions = await instrColl.find({}).toArray();
  const now = new Date();
  const thaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  
  await libraryColl.updateOne(
    { date: dateStr },
    { 
      $set: { 
        date: dateStr, 
        instructions, 
        savedAt: new Date(),
        type: 'auto',
        displayDate: dateStr,
        displayTime: thaiNow.toLocaleTimeString('th-TH'),
        name: `คลัง ${dateStr}`,
        description: `คลัง instruction ที่บันทึกอัตโนมัติเมื่อวันที่ ${dateStr}`
      } 
    },
    { upsert: true }
  );
  console.log(`[Library] บันทึก instructions ลงคลังสำหรับวันที่ ${dateStr} แล้ว`);
}

function scheduleDailyInstructionLibrary() {
  console.log('[Library] ตั้งเวลาบันทึก instructions ลงคลังทุกวันเวลา 00:00 น.');
  let lastLibraryDate = '';
  setInterval(async () => {
    const now = new Date();
    const thaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const dateStr = thaiNow.toISOString().split('T')[0];
    if (thaiNow.getHours() === 0 && thaiNow.getMinutes() === 0 && lastLibraryDate !== dateStr) {
      await saveInstructionsToLibrary(dateStr);
      lastLibraryDate = dateStr;
    }
  }, 60 * 1000);
}

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'ChatCenter AI',
    version: '1.0.0'
  });
});

// Root redirects to admin dashboard
app.get('/', (req, res) => {
  res.redirect('/admin/dashboard');
});

// Route: list all instruction libraries
app.get('/admin/instructions/library', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const libraries = await libraryColl.find({}, { 
      projection: { 
        date: 1, 
        savedAt: 1, 
        type: 1, 
        displayDate: 1, 
        displayTime: 1,
        name: 1,
        description: 1
      } 
    }).sort({ date: -1 }).toArray();
    res.json({ success: true, libraries });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: get instruction library by date (YYYY-MM-DD)
app.get('/admin/instructions/library/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const doc = await libraryColl.findOne({ date });
    if (!doc) return res.json({ success: false, error: 'ไม่พบคลัง instruction ของวันที่ระบุ' });
    res.json({ success: true, instructions: doc.instructions, savedAt: doc.savedAt, name: doc.name, description: doc.description });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: สร้าง instruction library ด้วยตนเอง
app.post('/admin/instructions/library-now', async (req, res) => {
  try {
    const { name, description } = req.body;
    const now = new Date();
    const thaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const dateStr = thaiNow.toISOString().split('T')[0];
    const timeStr = thaiNow.toTimeString().split(' ')[0].replace(/:/g, '-');
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
          type: 'manual',
          displayDate: dateStr,
          displayTime: thaiNow.toLocaleTimeString('th-TH'),
          name: name || `คลัง ${dateStr} ${timeStr}`,
          description: description || `คลัง instruction ที่สร้างด้วยตนเองเมื่อวันที่ ${dateStr} เวลา ${timeStr}`
        } 
      },
      { upsert: true }
    );
    
    res.json({ 
      success: true, 
      message: `บันทึก instructions ลงคลังเรียบร้อยแล้ว (${instructions.length} instructions)`,
      libraryKey: libraryKey,
      instructionCount: instructions.length
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Route: คืนค่า instruction library
app.post('/admin/instructions/restore/:date', async (req, res) => {
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
      return res.json({ success: false, error: 'ไม่พบคลัง instruction ของวันที่ระบุ' });
    }
    
    // บันทึกข้อมูลปัจจุบันลงคลังก่อน restore (ถ้าต้องการ)
    if (createLibraryBefore) {
      const currentInstructions = await instrColl.find({}).toArray();
      const now = new Date();
      const thaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
      const dateStr = thaiNow.toISOString().split('T')[0];
      const timeStr = thaiNow.toTimeString().split(' ')[0].replace(/:/g, '-');
      const beforeRestoreKey = `${dateStr}_before_restore_${timeStr}`;
      
      await libraryColl.updateOne(
        { date: beforeRestoreKey },
        { 
          $set: { 
            date: beforeRestoreKey, 
            instructions: currentInstructions, 
            savedAt: new Date(),
            type: 'before_restore',
            displayDate: dateStr,
            displayTime: thaiNow.toLocaleTimeString('th-TH'),
            name: `คลังก่อนคืนค่า ${dateStr}`,
            description: `คลัง instruction ที่บันทึกก่อนคืนค่าข้อมูลเมื่อวันที่ ${dateStr}`
          } 
        },
        { upsert: true }
      );
    }
    
    // ลบข้อมูลปัจจุบันทั้งหมด
    await instrColl.deleteMany({});
    
    // นำเข้าข้อมูลจาก library
    if (library.instructions && library.instructions.length > 0) {
      // ลบ _id เก่าและปรับปรุง timestamps
      const instructionsToInsert = library.instructions.map(instr => {
        const { _id, ...instructionData } = instr;
        return {
          ...instructionData,
          restoredAt: new Date(),
          restoredFrom: date
        };
      });
      
      await instrColl.insertMany(instructionsToInsert);
    }
    
    res.json({ 
      success: true, 
      message: `คืนค่าข้อมูลจาก ${library.name || library.displayDate || date} เรียบร้อยแล้ว (${library.instructions.length} instructions)`,
      restoredCount: library.instructions.length
    });
  } catch (err) {
    console.error('Restore error:', err);
    res.json({ success: false, error: err.message });
  }
});

// ============================ Excel Upload Routes ============================

// Route: Upload Excel file และแปลงเป็น instructions
app.post('/admin/instructions/upload-excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกไฟล์ Excel' });
    }

    console.log(`[Excel] เริ่มประมวลผลไฟล์: ${req.file.originalname} (${req.file.size} bytes)`);

    // ประมวลผลไฟล์ Excel
    const instructions = processExcelToInstructions(req.file.buffer, req.file.originalname);

    if (instructions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลในไฟล์ Excel หรือข้อมูลไม่ถูกต้อง' 
      });
    }

    // บันทึก instructions ทั้งหมดลงฐานข้อมูล
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const insertPromises = instructions.map(instruction => {
      instruction.createdAt = new Date();
      instruction.order = Date.now() + Math.random(); // เพื่อให้ไม่ซ้ำกัน
      return coll.insertOne(instruction);
    });

    await Promise.all(insertPromises);

    console.log(`[Excel] บันทึก ${instructions.length} instructions เรียบร้อยแล้ว`);

    res.json({
      success: true,
      message: `อัพโหลดและประมวลผลเรียบร้อย! สร้าง ${instructions.length} instruction จาก ${instructions.length} แท็บ`,
      instructionsCount: instructions.length,
      sheets: instructions.map(i => ({ title: i.title, type: i.type, sheetName: i.sheetName }))
    });

  } catch (error) {
    console.error('[Excel] ข้อผิดพลาดในการอัพโหลด:', error);
    
    let errorMessage = 'เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel';
    if (error.message.includes('Unsupported file type')) {
      errorMessage = 'ประเภทไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls)';
    } else if (error.message.includes('File too large')) {
      errorMessage = 'ไฟล์มีขนาดใหญ่เกินไป (ไม่เกิน 10MB)';
    } else if (error.message.includes('กรุณาเลือกไฟล์ Excel เท่านั้น')) {
      errorMessage = error.message;
    }

    res.status(400).json({ success: false, error: errorMessage });
  }
});

// Route: Get preview ของไฟล์ Excel ก่อนอัพโหลด (ไม่บันทึกลงฐานข้อมูล)
app.post('/admin/instructions/preview-excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกไฟล์ Excel' });
    }

    // ประมวลผลไฟล์ Excel แต่ไม่บันทึก
    const instructions = processExcelToInstructions(req.file.buffer, req.file.originalname);

    res.json({
      success: true,
      preview: instructions.map(instruction => ({
        title: instruction.title,
        type: instruction.type,
        sheetName: instruction.sheetName,
        contentPreview: instruction.type === 'text' 
          ? instruction.content.substring(0, 200) + (instruction.content.length > 200 ? '...' : '')
          : `ตาราง ${instruction.data.rows ? instruction.data.rows.length : 0} แถว, ${instruction.data.columns ? instruction.data.columns.length : 0} คอลัมน์`,
        rowCount: instruction.data && instruction.data.rows ? instruction.data.rows.length : 0,
        columnCount: instruction.data && instruction.data.columns ? instruction.data.columns.length : 0
      }))
    });

  } catch (error) {
    console.error('[Excel] ข้อผิดพลาดในการดูตัวอย่าง:', error);
    res.status(400).json({ success: false, error: 'ไม่สามารถดูตัวอย่างไฟล์ Excel ได้: ' + error.message });
  }
});

// ============================ Admin UI Routes ============================

// Redirect root admin to dashboard directly (no login required)
app.get('/admin', (req, res) => {
  res.redirect('/admin/dashboard');
});

// ============================ Line Bot Management API ============================

// Dynamic Line Bot webhook handler
app.post('/webhook/line/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    
    // Find the Line Bot by webhook URL or ID
    const lineBot = await coll.findOne({
      $or: [
        { webhookUrl: { $regex: botId, $options: 'i' } },
        { _id: new ObjectId(botId) }
      ]
    });

    if (!lineBot || lineBot.status !== 'active') {
      return res.status(404).json({ error: 'Line Bot ไม่พบหรือไม่เปิดใช้งาน' });
    }

    // Create Line client for this bot
    const lineConfig = {
      channelAccessToken: lineBot.channelAccessToken,
      channelSecret: lineBot.channelSecret
    };
    const lineClient = new line.Client(lineConfig);

    // Handle Line webhook events
    const events = req.body.events;
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const message = event.message.text;
        const replyToken = event.replyToken;

        console.log(`[Line Bot: ${lineBot.name}] ข้อความจาก ${userId}: ${message}`);

        // Process message with AI (you can customize this part)
        try {
          const aiResponse = await processMessageWithAI(message, userId, lineBot);
          await lineClient.replyMessage(replyToken, {
            type: 'text',
            text: aiResponse
          });
        } catch (error) {
          console.error(`[Line Bot: ${lineBot.name}] Error processing message:`, error);
          await lineClient.replyMessage(replyToken, {
            type: 'text',
            text: 'ขออภัย เกิดข้อผิดพลาดในการประมวลผลข้อความ'
          });
        }
      }
    }

    res.json({ status: 'OK' });
  } catch (err) {
    console.error('Error handling Line webhook:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการประมวลผล webhook' });
  }
});

// ============================ Facebook Bot Webhook Handler ============================

// Facebook Webhook verification (GET) and events (POST)
app.get('/webhook/facebook/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    
    // Find the Facebook Bot by ID
    const facebookBot = ObjectId.isValid(botId) ? await coll.findOne({ _id: new ObjectId(botId) }) : null;

    if (!facebookBot || facebookBot.status !== 'active') {
      // สำหรับขั้นตอน verify อนุญาต status อื่น ๆ ได้
      if (!facebookBot) {
        return res.status(404).send('Facebook Bot not found');
      }
    }

    // Handle Facebook webhook verification
    if (req.query['hub.mode'] === 'subscribe') {
      if (req.query['hub.verify_token'] === facebookBot.verifyToken) {
        return res.status(200).send(req.query['hub.challenge']);
      } else {
        console.warn(
          `[Facebook Bot: ${facebookBot.name}] Invalid verify token received: ${req.query['hub.verify_token']}`
        );
      }
    }

    return res.status(400).send('Invalid verification request');
  } catch (err) {
    console.error('Error handling Facebook webhook verification:', err);
    res.status(500).send('Server error');
  }
});

// Dynamic Facebook Bot webhook handler (POST events)
app.post('/webhook/facebook/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    
    // Find the Facebook Bot by ID
    const facebookBot = ObjectId.isValid(botId) ? await coll.findOne({ _id: new ObjectId(botId) }) : null;

    if (!facebookBot || facebookBot.status !== 'active') {
      return res.status(404).json({ error: 'Facebook Bot ไม่พบหรือไม่เปิดใช้งาน' });
    }

    // Handle Facebook webhook events
    if (req.body.object === 'page') {
      for (let entry of req.body.entry) {
        for (let messagingEvent of entry.messaging) {
          if (messagingEvent.message?.is_echo) {
            continue;
          }

          if (messagingEvent.message) {
            const senderId = messagingEvent.sender.id;
            const contentSequence = [];
            const messageText = messagingEvent.message.text;

            if (messageText) {
              contentSequence.push({ type: 'text', content: messageText });
            }

            if (messagingEvent.message.attachments) {
              for (const attachment of messagingEvent.message.attachments) {
                if (attachment.type === 'image' && attachment.payload?.url) {
                  try {
                    const base64 = await fetchFacebookImageAsBase64(attachment.payload.url);
                    contentSequence.push({ type: 'image', content: base64, description: 'ผู้ใช้ส่งรูปภาพมา' });
                  } catch (imgErr) {
                    console.error(`[Facebook Bot: ${facebookBot.name}] Error fetching image:`, imgErr.message);
                  }
                }
              }
            }

            if (contentSequence.length === 0) {
              await sendFacebookMessage(senderId, 'ขออภัย ระบบยังไม่รองรับไฟล์ประเภทนี้', facebookBot.accessToken);
              continue;
            }

            console.log(`[Facebook Bot: ${facebookBot.name}] ข้อความจาก ${senderId}: ${messageText || '[มีรูปภาพ]'}`);

            try {
              const aiResponse = await processFacebookMessageWithAI(contentSequence, senderId, facebookBot);
              await sendFacebookMessage(senderId, aiResponse, facebookBot.accessToken);

              await notifyAdminsNewMessage(senderId, {
                content: messageText || 'ไฟล์แนบ',
                role: 'user',
                timestamp: new Date(),
                platform: 'facebook'
              });
            } catch (error) {
              console.error(`[Facebook Bot: ${facebookBot.name}] Error processing message:`, error);
              await sendFacebookMessage(senderId, 'ขออภัย เกิดข้อผิดพลาดในการประมวลผลข้อความ', facebookBot.accessToken);
            }
          }
        }
      }
    }

    res.json({ status: 'OK' });
  } catch (err) {
    console.error('Error handling Facebook webhook:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการประมวลผล webhook' });
  }
});

// Helper function to send Facebook message
async function sendFacebookMessage(recipientId, message, accessToken) {
  const maxLength = 2000;
  const chunks = [];
  for (let i = 0; i < message.length; i += maxLength) {
    chunks.push(message.slice(i, i + maxLength));
  }

  for (const chunk of chunks) {
    try {
      const response = await axios.post(`https://graph.facebook.com/v18.0/me/messages`, {
        recipient: { id: recipientId },
        message: { text: chunk }
      }, {
        params: { access_token: accessToken },
        headers: { 'Content-Type': 'application/json' }
      });

      console.log('Facebook message sent successfully:', response.data);
    } catch (error) {
      const status = error.response?.status;
      const fbMessage = error.response?.data?.error?.message || error.message;
      const conciseError = status ? `Facebook API ${status}: ${fbMessage}` : fbMessage;
      console.error('Error sending Facebook message:', conciseError);
      throw new Error(conciseError);
    }
  }
}

// Helper to download and optimize Facebook image to base64
async function fetchFacebookImageAsBase64(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  let buffer = Buffer.from(response.data, 'binary');
  try {
    buffer = await sharp(buffer)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
  } catch (err) {
    console.error('Error processing Facebook image:', err.message);
  }
  return buffer.toString('base64');
}

// Convert table instruction data to a JSON string
function tableInstructionToJSON(instruction) {
  const rows = instruction?.data?.rows || [];
  if (rows.length === 0) return instruction.content || '';

  const titleLine = instruction.title ? `${instruction.title}\n` : '';
  const contentLine = instruction.content ? `${instruction.content}\n` : '';
  const jsonRows = JSON.stringify(rows, null, 2);
  return `${titleLine}${contentLine}${jsonRows}`;
}

// Build system prompt text from selected instruction libraries
function buildSystemPromptFromLibraries(libraries) {
  const allInstructions = libraries.flatMap(lib => lib.instructions || []);
  const parts = allInstructions.map(inst => {
    if (inst.type === 'table') {
      return tableInstructionToJSON(inst);
    }
    return inst.content || '';
  }).filter(text => text && text.trim() !== '');
  return parts.join('\n\n');
}

// Helper function to process Facebook message with AI
async function processFacebookMessageWithAI(contentSequence, userId, facebookBot) {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");

    const aiModel = facebookBot.aiModel || 'gpt-5';

    let systemPrompt = 'คุณเป็น AI Assistant ที่ช่วยตอบคำถามผู้ใช้';
    if (facebookBot.selectedInstructions && facebookBot.selectedInstructions.length > 0) {
      const instructionColl = db.collection("instruction_library");
      const instructionDocs = await instructionColl.find({
        date: { $in: facebookBot.selectedInstructions }
      }).toArray();

      const prompt = buildSystemPromptFromLibraries(instructionDocs);
      if (prompt.trim()) {
        systemPrompt = prompt;
      }
    }

    const history = await getChatHistory(userId);

    let assistantReply = '';
    const hasImages = contentSequence.some(item => item.type === 'image');
    if (hasImages) {
      assistantReply = await getAssistantResponseMultimodal(systemPrompt, history, contentSequence, aiModel);
    } else {
      const text = contentSequence.map(item => item.content).join('\n\n');
      assistantReply = await getAssistantResponseTextOnly(systemPrompt, history, text, aiModel);
    }

    assistantReply = await filterMessage(assistantReply);

    await saveChatHistory(userId, contentSequence, assistantReply, 'facebook', facebookBot._id.toString());

    return assistantReply.trim();
  } catch (error) {
    console.error('Error processing Facebook message with AI:', error);
    return 'ขออภัย เกิดข้อผิดพลาดในการประมวลผลข้อความ';
  }
}

// Helper function to process message with AI
async function processMessageWithAI(message, userId, lineBot) {
  try {
    // ดึงข้อมูล instructions ที่เลือก
    const client = await connectDB();
    const db = client.db("chatbot");

    // ใช้ AI Model เฉพาะของ Line Bot นี้
    const aiModel = lineBot.aiModel || 'gpt-5';

    // ดึง system prompt จาก instructions ที่เลือก
    let systemPrompt = 'คุณเป็น AI Assistant ที่ช่วยตอบคำถามผู้ใช้';
    if (lineBot.selectedInstructions && lineBot.selectedInstructions.length > 0) {
      const instructionColl = db.collection("instruction_library");
      const instructionDocs = await instructionColl.find({
        date: { $in: lineBot.selectedInstructions }
      }).toArray();

      const prompt = buildSystemPromptFromLibraries(instructionDocs);
      if (prompt.trim()) {
        systemPrompt = prompt;
      }
    }
    
    // สร้าง OpenAI client และเรียก API
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ];
    
    const response = await openai.chat.completions.create({
      model: aiModel,
      messages
    });
    
    let assistantReply = response.choices[0].message.content;
    if (typeof assistantReply !== "string") {
      assistantReply = JSON.stringify(assistantReply);
    }
    
    // เพิ่มข้อมูล token usage
    if (response.usage) {
      const usage = response.usage;
      const tokenInfo = `\n\n📊 Token Usage: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total tokens`;
      assistantReply += tokenInfo;
    }
    
    return assistantReply.trim();
  } catch (error) {
    console.error('Error processing message with AI:', error);
    return 'ขออภัย เกิดข้อผิดพลาดในการประมวลผลข้อความ';
  }
}

// Get all Line Bots
app.get('/api/line-bots', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    const lineBots = await coll.find({}).sort({ createdAt: -1 }).toArray();
    res.json(lineBots);
  } catch (err) {
    console.error('Error fetching line bots:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูล Line Bot ได้' });
  }
});

// Get single Line Bot
app.get('/api/line-bots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    const lineBot = await coll.findOne({ _id: new ObjectId(id) });
    
    if (!lineBot) {
      return res.status(404).json({ error: 'ไม่พบ Line Bot ที่ระบุ' });
    }
    
    res.json(lineBot);
  } catch (err) {
    console.error('Error fetching line bot:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูล Line Bot ได้' });
  }
});

// Create new Line Bot
app.post('/api/line-bots', async (req, res) => {
  try {
    const { name, description, channelAccessToken, channelSecret, webhookUrl, status, isDefault, selectedInstructions } = req.body;
    
    if (!name || !channelAccessToken || !channelSecret) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
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
      const baseUrl = process.env.PUBLIC_BASE_URL || ('https://' + req.get('host'));
      const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      finalWebhookUrl = `${baseUrl}/webhook/line/${uniqueId}`;
    }

    const lineBot = {
      name,
      description: description || '',
      channelAccessToken,
      channelSecret,
      webhookUrl: finalWebhookUrl,
      status: status || 'active',
      isDefault: isDefault || false,
      aiModel: 'gpt-5', // AI Model เฉพาะสำหรับ Line Bot นี้
      selectedInstructions: Array.isArray(selectedInstructions) ? selectedInstructions : [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await coll.insertOne(lineBot);
    lineBot._id = result.insertedId;
    
    res.status(201).json(lineBot);
  } catch (err) {
    console.error('Error creating line bot:', err);
    res.status(500).json({ error: 'ไม่สามารถสร้าง Line Bot ได้' });
  }
});

// Update Line Bot
app.put('/api/line-bots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, channelAccessToken, channelSecret, webhookUrl, status, isDefault } = req.body;
    
    if (!name || !channelAccessToken || !channelSecret) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");

    // If this is default, unset other defaults
    if (isDefault) {
      await coll.updateMany({ _id: { $ne: new ObjectId(id) } }, { $set: { isDefault: false } });
    }

    const updateData = {
      name,
      description: description || '',
      channelAccessToken,
      channelSecret,
      webhookUrl: webhookUrl || '',
      status: status || 'active',
      isDefault: isDefault || false,
      aiModel: req.body.aiModel || 'gpt-5', // AI Model เฉพาะสำหรับ Line Bot นี้
      updatedAt: new Date()
    };

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'ไม่พบ Line Bot ที่ระบุ' });
    }

    res.json({ message: 'อัปเดต Line Bot เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error updating line bot:', err);
    res.status(500).json({ error: 'ไม่สามารถอัปเดต Line Bot ได้' });
  }
});

// Delete Line Bot
app.delete('/api/line-bots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    
    const result = await coll.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'ไม่พบ Line Bot ที่ระบุ' });
    }

    res.json({ message: 'ลบ Line Bot เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error deleting line bot:', err);
    res.status(500).json({ error: 'ไม่สามารถลบ Line Bot ได้' });
  }
});

// Test Line Bot
app.post('/api/line-bots/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    
    const lineBot = await coll.findOne({ _id: new ObjectId(id) });
    if (!lineBot) {
      return res.status(404).json({ error: 'ไม่พบ Line Bot ที่ระบุ' });
    }

    // Test Line Bot connection
    try {
      const lineConfig = {
        channelAccessToken: lineBot.channelAccessToken,
        channelSecret: lineBot.channelSecret
      };
      const testClient = new line.Client(lineConfig);
      
      // Try to get bot profile (simple test)
      const profile = await testClient.getProfile();
      
      res.json({ 
        message: `ทดสอบ Line Bot สำเร็จ: ${profile.displayName}`,
        profile: profile
      });
    } catch (lineError) {
      res.status(400).json({ 
        error: 'ไม่สามารถเชื่อมต่อ Line Bot ได้: ' + lineError.message 
      });
    }
  } catch (err) {
    console.error('Error testing line bot:', err);
    res.status(500).json({ error: 'ไม่สามารถทดสอบ Line Bot ได้' });
  }
});

// Route: อัปเดต instruction ที่เลือกใช้ใน Line Bot
app.put('/api/line-bots/:id/instructions', async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedInstructions } = req.body;
    
    if (!Array.isArray(selectedInstructions)) {
      return res.status(400).json({ error: 'selectedInstructions ต้องเป็น array' });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("line_bots");
    
    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          selectedInstructions,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'ไม่พบ Line Bot ที่ระบุ' });
    }

    res.json({ message: 'อัปเดต instruction ที่เลือกใช้เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error updating line bot instructions:', err);
    res.status(500).json({ error: 'ไม่สามารถอัปเดต instruction ที่เลือกใช้ได้' });
  }
});

// ============================ Facebook Bot API Endpoints ============================

// Initialize a Facebook Bot stub for webhook verification
app.post('/api/facebook-bots/init', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");

    const providedVerifyToken = (req.body && req.body.verifyToken) || null;
    const verifyToken = providedVerifyToken || ('vt_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10));

    // Create minimal bot stub
    const stub = {
      name: '',
      description: '',
      pageId: '',
      accessToken: '',
      webhookUrl: '', // set after _id known
      verifyToken,
      status: 'setup',
      isDefault: false,
      aiModel: 'gpt-5',
      selectedInstructions: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insert = await coll.insertOne(stub);
    const id = insert.insertedId;

    // Build webhook URL using bot id
    const baseUrl = process.env.PUBLIC_BASE_URL || ('https://' + req.get('host'));
    const webhookUrl = `${baseUrl}/webhook/facebook/${id.toString()}`;

    await coll.updateOne({ _id: id }, { $set: { webhookUrl } });

    return res.json({ id: id.toString(), webhookUrl, verifyToken });
  } catch (err) {
    console.error('Error initializing facebook bot stub:', err);
    res.status(500).json({ error: 'ไม่สามารถเตรียมข้อมูลสำหรับยืนยัน Webhook ได้' });
  }
});

// Get all Facebook Bots
app.get('/api/facebook-bots', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    const facebookBots = await coll.find({}).sort({ createdAt: -1 }).toArray();
    res.json(facebookBots);
  } catch (err) {
    console.error('Error fetching facebook bots:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูล Facebook Bot ได้' });
  }
});

// Get single Facebook Bot
app.get('/api/facebook-bots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    const facebookBot = await coll.findOne({ _id: new ObjectId(id) });
    
    if (!facebookBot) {
      return res.status(404).json({ error: 'ไม่พบ Facebook Bot ที่ระบุ' });
    }
    
    res.json(facebookBot);
  } catch (err) {
    console.error('Error fetching facebook bot:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูล Facebook Bot ได้' });
  }
});

// Create new Facebook Bot
app.post('/api/facebook-bots', async (req, res) => {
  try {
    const { name, description, pageId, accessToken, webhookUrl, verifyToken, status, isDefault, aiModel, selectedInstructions } = req.body;
    
    if (!name || !pageId || !accessToken) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
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
      const baseUrl = process.env.PUBLIC_BASE_URL || ('https://' + req.get('host'));
      const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      finalWebhookUrl = `${baseUrl}/webhook/facebook/${uniqueId}`;
    }

    const facebookBot = {
      name,
      description: description || '',
      pageId,
      accessToken,
      webhookUrl: finalWebhookUrl,
      verifyToken: verifyToken || 'your_verify_token',
      status: status || 'active',
      isDefault: isDefault || false,
      aiModel: aiModel || 'gpt-5',
      selectedInstructions: Array.isArray(selectedInstructions) ? selectedInstructions : [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await coll.insertOne(facebookBot);
    facebookBot._id = result.insertedId;
    
    res.status(201).json(facebookBot);
  } catch (err) {
    console.error('Error creating facebook bot:', err);
    res.status(500).json({ error: 'ไม่สามารถสร้าง Facebook Bot ได้' });
  }
});

// Update Facebook Bot
app.put('/api/facebook-bots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, pageId, accessToken, webhookUrl, verifyToken, status, isDefault, aiModel } = req.body;
    
    if (!name || !pageId || !accessToken) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
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
      description: description || '',
      pageId,
      accessToken,
      webhookUrl: webhookUrl || '',
      verifyToken: verifyToken || 'your_verify_token',
      status: status || 'active',
      isDefault: isDefault || false,
      aiModel: aiModel || 'gpt-5',
      updatedAt: new Date()
    };

    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'ไม่พบ Facebook Bot ที่ระบุ' });
    }

    res.json({ message: 'อัปเดต Facebook Bot เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error updating facebook bot:', err);
    res.status(500).json({ error: 'ไม่สามารถอัปเดต Facebook Bot ได้' });
  }
});

// Delete Facebook Bot
app.delete('/api/facebook-bots/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    
    const result = await coll.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'ไม่พบ Facebook Bot ที่ระบุ' });
    }

    res.json({ message: 'ลบ Facebook Bot เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error deleting facebook bot:', err);
    res.status(500).json({ error: 'ไม่สามารถลบ Facebook Bot ได้' });
  }
});

// Test Facebook Bot
app.post('/api/facebook-bots/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    
    const facebookBot = await coll.findOne({ _id: new ObjectId(id) });
    if (!facebookBot) {
      return res.status(404).json({ error: 'ไม่พบ Facebook Bot ที่ระบุ' });
    }

    // Test Facebook Bot connection
    try {
      // Test Facebook Graph API connection
      const response = await axios.get(`https://graph.facebook.com/v18.0/${facebookBot.pageId}`, {
        params: {
          access_token: facebookBot.accessToken,
          fields: 'name,id'
        }
      });
      
      res.json({ 
        message: `ทดสอบ Facebook Bot สำเร็จ: ${response.data.name}`,
        profile: response.data
      });
    } catch (fbError) {
      res.status(400).json({ 
        error: 'ไม่สามารถเชื่อมต่อ Facebook Bot ได้: ' + fbError.message 
      });
    }
  } catch (err) {
    console.error('Error testing facebook bot:', err);
    res.status(500).json({ error: 'ไม่สามารถทดสอบ Facebook Bot ได้' });
  }
});

// Route: อัปเดต instruction ที่เลือกใช้ใน Facebook Bot
app.put('/api/facebook-bots/:id/instructions', async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedInstructions } = req.body;
    
    if (!Array.isArray(selectedInstructions)) {
      return res.status(400).json({ error: 'selectedInstructions ต้องเป็น array' });
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("facebook_bots");
    
    const result = await coll.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          selectedInstructions,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'ไม่พบ Facebook Bot ที่ระบุ' });
    }

    res.json({ message: 'อัปเดต instruction ที่เลือกใช้เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error updating facebook bot instructions:', err);
    res.status(500).json({ error: 'ไม่สามารถอัปเดต instruction ที่เลือกใช้ได้' });
  }
});

// Route: ดึงรายการ instruction library ทั้งหมด
app.get('/api/instructions/library', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    const libraries = await libraryColl.find({}, {
      projection: {
        date: 1,
        name: 1,
        description: 1,
        displayDate: 1,
        displayTime: 1,
        type: 1,
        savedAt: 1
      }
    }).sort({ date: -1 }).toArray();
    
    res.json({ success: true, libraries });
  } catch (err) {
    console.error('Error fetching instruction libraries:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงรายการ instruction library ได้' });
  }
});

// Route: ดึงรายละเอียด instruction library พร้อม instructions
app.get('/api/instructions/library/:date/details', async (req, res) => {
  try {
    const { date } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const libraryColl = db.collection("instruction_library");
    
    const library = await libraryColl.findOne({ date });
    if (!library) {
      return res.status(404).json({ error: 'ไม่พบคลัง instruction ที่ระบุ' });
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
        instructions: library.instructions || []
      }
    });
  } catch (err) {
    console.error('Error fetching library details:', err);
    res.status(500).json({ error: 'ไม่สามารถดึงรายละเอียดคลัง instruction ได้' });
  }
});

// Dashboard
app.get('/admin/dashboard', async (req, res) => {
  try {
    const instructions = await getInstructions();
    const aiEnabled = await getAiEnabled();
    res.render('admin-dashboard', { instructions, aiEnabled });
  } catch (err) {
    res.render('admin-dashboard', { instructions: [], aiEnabled: false, error: err.message });
  }
});

// Admin settings page
app.get('/admin/settings', async (req, res) => {
  try {
    res.render('admin-settings');
  } catch (err) {
    console.error('Error rendering admin settings:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Toggle global AI enabled
app.post('/admin/ai-toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    await setAiEnabled(enabled === 'true' || enabled === true);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Add new instruction
app.post('/admin/instructions', async (req, res) => {
  try {
    const { type, title, content, tableData } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const instr = {
      type,
      title: title || '',
      content: content || '',
      createdAt: new Date(),
      order: Date.now()
    };

    if (type === 'table' && tableData) {
      try {
        instr.data = JSON.parse(tableData);
      } catch {
        instr.data = [];
      }
    }

    await coll.insertOne(instr);
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.redirect('/admin/dashboard?error=ไม่สามารถเพิ่มข้อมูลได้');
  }
});

// Delete instruction
app.post('/admin/instructions/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    await coll.deleteOne({ _id: new ObjectId(id) });
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.redirect('/admin/dashboard?error=ไม่สามารถลบข้อมูลได้');
  }
});

// Edit instruction form
app.get('/admin/instructions/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    res.render('edit-instruction', { instruction });
  } catch (err) {
    res.redirect('/admin/dashboard?error=ไม่พบข้อมูลที่ต้องการแก้ไข');
  }
});

// Handle edit submission
app.post('/admin/instructions/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, content, tableData } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    // ดึงข้อมูลเดิมก่อนเพื่อเป็น fallback
    const existingInstruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!existingInstruction) {
      return res.redirect('/admin/dashboard?error=ไม่พบข้อมูลที่ต้องการแก้ไข');
    }

    const updateData = {
      type,
      title: title || '',
      content: content || '',
      updatedAt: new Date()
    };

    console.log('[Edit] Request body keys:', Object.keys(req.body));
    console.log('[Edit] Table data received length:', tableData ? tableData.length : 0);
    
    if (type === 'table') {
      if (tableData && tableData.trim() !== '') {
        try {
          const parsedData = JSON.parse(tableData);
          // ตรวจสอบว่าข้อมูลที่ parse ได้มีโครงสร้างที่ถูกต้อง
          if (parsedData && typeof parsedData === 'object') {
            updateData.data = parsedData;
            console.log('[Edit] Table data parsed successfully');
            console.log('[Edit] Parsed data columns:', parsedData.columns ? parsedData.columns.length : 0);
            console.log('[Edit] Parsed data rows:', parsedData.rows ? parsedData.rows.length : 0);
          } else {
            console.warn('[Edit] Invalid table data structure, keeping existing data');
            updateData.data = existingInstruction.data || { columns: [], rows: [] };
          }
        } catch (parseError) {
          console.error('[Edit] JSON parse error:', parseError);
          console.log('[Edit] Raw table data preview:', tableData.substring(0, 200));
          console.log('[Edit] Keeping existing table data due to parse error');
          // ใช้ข้อมูลเดิมแทนการตั้งค่าเป็น array ว่าง
          updateData.data = existingInstruction.data || { columns: [], rows: [] };
        }
      } else {
        console.warn('[Edit] Empty table data received, keeping existing data');
        updateData.data = existingInstruction.data || { columns: [], rows: [] };
      }
    } else {
      // หากเปลี่ยนจาก table เป็น text ให้ลบ data field
      updateData.$unset = { data: "" };
    }

    console.log('[Edit] Updating instruction:', id, 'Type:', type);
    console.log('[Edit] Update data keys:', Object.keys(updateData));
    
    // จัดการ MongoDB update operation อย่างถูกต้อง
    let mongoUpdate;
    if (updateData.$unset) {
      // แยก $unset ออกจาก updateData
      const { $unset, ...setData } = updateData;
      mongoUpdate = { 
        $set: setData,
        $unset: $unset
      };
      console.log('[Edit] Using $set and $unset operations');
    } else {
      mongoUpdate = { $set: updateData };
      console.log('[Edit] Using only $set operation');
    }
    
    console.log('[Edit] MongoDB update operation:', JSON.stringify(mongoUpdate, null, 2));
    
    const result = await coll.updateOne({ _id: new ObjectId(id) }, mongoUpdate);
    console.log('[Edit] Update result:', result);
    
    if (result.modifiedCount === 1) {
      console.log('[Edit] Instruction updated successfully');
    } else {
      console.warn('[Edit] No documents were modified');
    }
    
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('[Edit] Error updating instruction:', err);
    console.error('[Edit] Error stack:', err.stack);
    res.redirect('/admin/dashboard?error=ไม่สามารถแก้ไขข้อมูลได้');
  }
});

// Preview combined instructions (simple implementation)
app.get('/admin/instructions/preview', async (req, res) => {
  try {
    const instructions = await getInstructions();
    const preview = instructions.map((i, idx) => `#${idx + 1} ${i.title || ''}\n${i.type === 'text' ? i.content : '[TABLE DATA]'}`).join('\n\n');
    res.json({ success: true, instructions: preview });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Simple reorder (up/down)
app.post('/admin/instructions/reorder', async (req, res) => {
  try {
    const { instructionId, direction } = req.body;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");

    const current = await coll.findOne({ _id: new ObjectId(instructionId) });
    if (!current) return res.json({ success: false, error: 'ไม่พบ instruction' });

    const all = await coll.find({}).sort({ order: 1, createdAt: 1 }).toArray();
    const idx = all.findIndex(x => x._id.toString() === instructionId);
    let targetIdx = idx;
    if (direction === 'up' && idx > 0) targetIdx = idx - 1;
    if (direction === 'down' && idx < all.length - 1) targetIdx = idx + 1;

    if (idx === targetIdx) return res.json({ success: false, error: 'ไม่สามารถเลื่อนได้' });

    const target = all[targetIdx];
    await coll.updateOne({ _id: current._id }, { $set: { order: target.order || targetIdx } });
    await coll.updateOne({ _id: target._id }, { $set: { order: current.order || idx } });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// API endpoint สำหรับดึงรายการ instructions (สำหรับ dynamic updates)
app.get('/admin/instructions/list', async (req, res) => {
  try {
    const instructions = await getInstructions();
    res.json({ 
      success: true, 
      instructions: instructions.map(instruction => ({
        _id: instruction._id,
        type: instruction.type,
        title: instruction.title,
        content: instruction.content,
        data: instruction.data,
        createdAt: instruction.createdAt,
        updatedAt: instruction.updatedAt
      }))
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Enhanced delete instruction with JSON response
app.delete('/admin/instructions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    
    const result = await coll.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount > 0) {
      res.json({ success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว' });
    } else {
      res.json({ success: false, error: 'ไม่พบข้อมูลที่ต้องการลบ' });
    }
  } catch (err) {
    res.json({ success: false, error: 'ไม่สามารถลบข้อมูลได้' });
  }
});

// Show JSON for a table instruction
app.get('/admin/instructions/:id/json', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("instructions");
    const instruction = await coll.findOne({ _id: new ObjectId(id) });
    if (!instruction || instruction.type !== 'table') {
      return res.json({ success: false, error: 'ไม่พบ instruction หรือตรงประเภท' });
    }
    res.json({ success: true, tableData: instruction.data, title: instruction.title || '' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Broadcast page
app.get('/admin/broadcast', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const lineBots = await db.collection('line_bots').find({}).toArray();
    const facebookBots = await db.collection('facebook_bots').find({}).toArray();
    res.render('admin-broadcast', { lineBots, facebookBots });
  } catch (err) {
    console.error('Error loading broadcast page:', err);
    res.render('admin-broadcast', { lineBots: [], facebookBots: [], error: 'ไม่สามารถโหลดข้อมูลบอทได้' });
  }
});

// Broadcast action
app.post('/admin/broadcast', async (req, res) => {
  const { message, audience } = req.body;
  let { channels } = req.body;

  if (!Array.isArray(channels)) {
    channels = channels ? [channels] : [];
  }

  try {
    if (!message || channels.length === 0) {
      throw new Error('กรุณากรอกข้อความและเลือกช่องทาง');
    }

    const client = await connectDB();
    const db = client.db("chatbot");
    const chatColl = db.collection("chat_history");

    for (const ch of channels) {
      const [type, botId] = ch.split(':');
      const userIds = await chatColl.distinct('senderId', { platform: type, botId });

      if (type === 'facebook') {
        const fbBot = await db.collection('facebook_bots').findOne({ _id: new ObjectId(botId) });
        if (!fbBot) continue;
        for (const userId of userIds) {
          try {
            await sendFacebookMessage(userId, message, fbBot.accessToken);
          } catch (e) {
            console.log(`[Broadcast] Failed to send to Facebook user ${userId}: ${e.message}`);
          }
        }
      } else if (type === 'line') {
        const lineBot = await db.collection('line_bots').findOne({ _id: new ObjectId(botId) });
        if (!lineBot) continue;
        const clientLine = createLineClient(lineBot.channelAccessToken, lineBot.channelSecret);
        for (const userId of userIds) {
          try {
            await clientLine.pushMessage(userId, { type: 'text', text: message });
          } catch (e) {
            console.log(`[Broadcast] Failed to send to LINE user ${userId}: ${e.message}`);
          }
        }
      }
    }

    const lineBots = await db.collection('line_bots').find({}).toArray();
    const facebookBots = await db.collection('facebook_bots').find({}).toArray();
    res.render('admin-broadcast', { lineBots, facebookBots, success: 'ส่งข้อความเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Broadcast error:', err);
    let lineBots = [], facebookBots = [];
    try {
      const client = await connectDB();
      const db = client.db("chatbot");
      lineBots = await db.collection('line_bots').find({}).toArray();
      facebookBots = await db.collection('facebook_bots').find({}).toArray();
    } catch (e) {}
    res.render('admin-broadcast', { lineBots, facebookBots, error: err.message });
  }
});

// Follow-up page (stub)
app.get('/admin/followup', (req, res) => {
  res.render('admin-followup', { settings: { enabled: false, rounds: [] } });
});

// Follow-up status page (stub)
app.get('/admin/followup/status', (req, res) => {
  res.render('admin-followup-status', { statuses: [] });
});

// ============================ Chat System Routes ============================

// Chat page
app.get('/admin/chat', (req, res) => {
  res.render('admin-chat');
});

// Get users who have chatted
app.get('/admin/chat/users', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const chatColl = db.collection("chat_history");
    const profileColl = db.collection("user_profiles");
    
    // Get unique users with their last message
    const pipeline = [
      {
        $group: {
          _id: "$senderId",
          lastMessage: { $last: "$content" },
          lastTimestamp: { $last: "$timestamp" },
          messageCount: { $sum: 1 },
          platform: { $last: "$platform" },
          botId: { $last: "$botId" }
        }
      },
      {
        $sort: { lastTimestamp: -1 }
      },
      {
        $limit: 50 // Limit to recent 50 users
      }
    ];
    
    const users = await chatColl.aggregate(pipeline).toArray();
    
    // ดึงข้อมูลโปรไฟล์และ unread count สำหรับแต่ละผู้ใช้
    const formattedUsers = await Promise.all(users.map(async (user) => {
      const unreadCount = await getUserUnreadCount(user._id);

      const platform = user.platform || 'line';

      // ดึงข้อมูลโปรไฟล์จากฐานข้อมูล (เฉพาะ LINE)
      let userProfile = null;
      if (platform === 'line') {
        userProfile = await profileColl.findOne({ userId: user._id });
        if (!userProfile) {
          userProfile = await saveOrUpdateUserProfile(user._id);
        }
      }

      return {
        userId: user._id,
        displayName: userProfile ? userProfile.displayName : user._id.substring(0, 8) + '...',
        pictureUrl: userProfile ? userProfile.pictureUrl : null,
        statusMessage: userProfile ? userProfile.statusMessage : null,
        lastMessage: typeof user.lastMessage === 'string' ? user.lastMessage :
                     (user.lastMessage ? JSON.stringify(user.lastMessage) : ''),
        lastTimestamp: user.lastTimestamp,
        messageCount: user.messageCount,
        unreadCount: unreadCount,
        platform,
        botId: user.botId || null
      };
    }));
    
    res.json({ success: true, users: formattedUsers });
  } catch (err) {
    console.error('Error getting chat users:', err);
    res.json({ success: false, error: err.message });
  }
});

// Get chat history for a specific user
app.get('/admin/chat/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");
    
    const messages = await coll.find({ senderId: userId })
                               .sort({ timestamp: 1 })
                               .limit(200) // Limit to recent 200 messages
                               .toArray();
    
    const formattedMessages = messages.map(msg => ({
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      role: msg.role,
      timestamp: msg.timestamp,
      source: msg.source || 'ai' // เพิ่ม source เพื่อแยกแยะว่ามาจากแอดมินหรือ AI
    }));
    
    // รีเซ็ต unread count เมื่อแอดมินดูประวัติการสนทนา
    await resetUserUnreadCount(userId);
    
    res.json({ success: true, messages: formattedMessages });
  } catch (err) {
    console.error('Error getting chat history:', err);
    res.json({ success: false, error: err.message });
  }
});

// Send message as admin (AI assistant)
app.post('/admin/chat/send', async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.json({ success: false, error: 'ข้อมูลไม่ครบถ้วน' });
    }
    
    // Save message to database as assistant message
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("chat_history");

    // Determine platform and bot from latest chat
    const lastChat = await coll.findOne({ senderId: userId }, { sort: { timestamp: -1 } });
    const platform = lastChat?.platform || 'line';
    const botId = lastChat?.botId || null;

    const messageDoc = {
      senderId: userId,
      role: "assistant",
      content: message,
      timestamp: new Date(),
      source: "admin_chat",
      platform,
      botId
    };

    await coll.insertOne(messageDoc);

    // รีเซ็ต unread count เมื่อแอดมินตอบกลับ
    await resetUserUnreadCount(userId);

    if (platform === 'facebook') {
      try {
        if (botId) {
          const fbBot = await db.collection('facebook_bots').findOne({ _id: new ObjectId(botId) });
          if (fbBot) {
            await sendFacebookMessage(userId, message, fbBot.accessToken);
            console.log(`[Admin Chat] ส่งข้อความไปยัง Facebook user ${userId}: ${message.substring(0, 50)}...`);
          }
        }
      } catch (fbError) {
        console.log(`[Admin Chat] ไม่สามารถส่งไปยัง Facebook ได้: ${fbError.message}`);
      }
    } else {
      // Send message via LINE if possible
      try {
        // ตรวจสอบว่าผู้ใช้มี LINE ID หรือไม่
        const userStatus = await getUserStatus(userId);
        if (userStatus) {
          // ส่งข้อความไปยัง LINE (ไม่ใช้ replyToken เพราะไม่มี)
          // ใช้ push message แทน
          await lineClient.pushMessage(userId, {
            type: 'text',
            text: message
          });
          console.log(`[Admin Chat] ส่งข้อความไปยัง LINE user ${userId}: ${message.substring(0, 50)}...`);
        }
      } catch (lineError) {
        console.log(`[Admin Chat] ไม่สามารถส่งไปยัง LINE ได้: ${lineError.message}`);
        // ไม่ return error เพราะข้อความยังบันทึกลง database ได้
      }
    }
    
    // Emit to socket clients
    io.emit('newMessage', {
      userId: userId,
      message: messageDoc,
      sender: 'assistant',
      timestamp: messageDoc.timestamp
    });
    
    res.json({ success: true, message: 'ส่งข้อความเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error sending admin message:', err);
    res.json({ success: false, error: err.message });
  }
});

// Clear chat history for a user
app.delete('/admin/chat/clear/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await clearUserChatHistory(userId);
    
    // รีเซ็ต unread count เมื่อล้างประวัติ
    await resetUserUnreadCount(userId);
    
    // Emit to socket clients
    io.emit('chatCleared', { userId });
    
    res.json({ success: true, message: 'ล้างประวัติการสนทนาเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error clearing chat:', err);
    res.json({ success: false, error: err.message });
  }
});

// Get total unread count for all users
app.get('/admin/chat/unread-count', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("user_unread_counts");
    
    const result = await coll.aggregate([
      {
        $group: {
          _id: null,
          totalUnread: { $sum: "$unreadCount" }
        }
      }
    ]).toArray();
    
    const totalUnread = result.length > 0 ? result[0].totalUnread : 0;
    
    res.json({ success: true, totalUnread });
  } catch (err) {
    console.error('Error getting unread count:', err);
    res.json({ success: false, error: err.message });
  }
});

// ============================ Settings API Endpoints ============================

// Get all settings
app.get('/api/settings', async (req, res) => {
  try {
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    
    const settings = await coll.find({}).toArray();
    const settingsObj = {};
    
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    // Set default values if not exists
    const defaultSettings = {
      chatDelaySeconds: 5,
      maxQueueMessages: 10,
      enableMessageMerging: true,
      textModel: "gpt-5",
      visionModel: "gpt-5",
      maxImagesPerMessage: 3,
      defaultInstruction: '',
      aiEnabled: true,
      enableChatHistory: true,
      enableAdminNotifications: true,
      systemMode: "production",
      // การตั้งค่าการกรองข้อความ
      enableMessageFiltering: true,
      hiddenWords: '',
      replacementText: '[ข้อความถูกซ่อน]',
      enableStrictFiltering: true
    };
    
    // Merge with existing settings
    const finalSettings = { ...defaultSettings, ...settingsObj };
    
    res.json(finalSettings);
  } catch (err) {
    console.error('Error getting settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save chat settings
app.post('/api/settings/chat', async (req, res) => {
  try {
    const { chatDelaySeconds, maxQueueMessages, enableMessageMerging } = req.body;
    
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    
    // Validate input
    if (chatDelaySeconds < 1 || chatDelaySeconds > 60) {
      return res.status(400).json({ success: false, error: 'ระยะเวลาดีเลย์ต้องอยู่ระหว่าง 1-60 วินาที' });
    }
    
    if (maxQueueMessages < 1 || maxQueueMessages > 20) {
      return res.status(400).json({ success: false, error: 'จำนวนข้อความในคิวต้องอยู่ระหว่าง 1-20' });
    }
    
    // Save settings
    await coll.updateOne(
      { key: "chatDelaySeconds" },
      { $set: { value: chatDelaySeconds } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "maxQueueMessages" },
      { $set: { value: maxQueueMessages } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "enableMessageMerging" },
      { $set: { value: enableMessageMerging } },
      { upsert: true }
    );
    
    res.json({ success: true, message: 'บันทึกการตั้งค่าแชทเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error saving chat settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save AI settings
app.post('/api/settings/ai', async (req, res) => {
  try {
    const { textModel, visionModel, maxImagesPerMessage, defaultInstruction } = req.body;
    
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    
    // Validate input
    const validModels = ["gpt-5", "gpt-5-mini", "gpt-5-chat-latest", "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini", "o3"];
    
    if (!validModels.includes(textModel)) {
      return res.status(400).json({ success: false, error: 'โมเดลข้อความไม่ถูกต้อง' });
    }
    
    if (!validModels.includes(visionModel)) {
      return res.status(400).json({ success: false, error: 'โมเดลรูปภาพไม่ถูกต้อง' });
    }
    
    if (maxImagesPerMessage < 1 || maxImagesPerMessage > 10) {
      return res.status(400).json({ success: false, error: 'จำนวนรูปภาพต้องอยู่ระหว่าง 1-10' });
    }
    
    // Save settings
    await coll.updateOne(
      { key: "textModel" },
      { $set: { value: textModel } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "visionModel" },
      { $set: { value: visionModel } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "maxImagesPerMessage" },
      { $set: { value: maxImagesPerMessage } },
      { upsert: true }
    );

    await coll.updateOne(
      { key: "defaultInstruction" },
      { $set: { value: defaultInstruction || "" } },
      { upsert: true }
    );
    
    res.json({ success: true, message: 'บันทึกการตั้งค่า AI เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error saving AI settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save system settings
app.post('/api/settings/system', async (req, res) => {
  try {
    const { aiEnabled, enableChatHistory, enableAdminNotifications, systemMode } = req.body;
    
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    
    // Validate input
    const validSystemModes = ["production", "development", "maintenance"];
    
    if (!validSystemModes.includes(systemMode)) {
      return res.status(400).json({ success: false, error: 'โหมดระบบไม่ถูกต้อง' });
    }
    
    // Save settings
    await coll.updateOne(
      { key: "aiEnabled" },
      { $set: { value: aiEnabled } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "enableChatHistory" },
      { $set: { value: enableChatHistory } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "enableAdminNotifications" },
      { $set: { value: enableAdminNotifications } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "systemMode" },
      { $set: { value: systemMode } },
      { upsert: true }
    );
    
    res.json({ success: true, message: 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error saving system settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API endpoint สำหรับบันทึกการตั้งค่าการกรอง
app.post('/api/settings/filter', async (req, res) => {
  try {
    const { enableMessageFiltering, hiddenWords, replacementText, enableStrictFiltering } = req.body;
    
    const client = await connectDB();
    const db = client.db("chatbot");
    const coll = db.collection("settings");
    
    await coll.updateOne(
      { key: "enableMessageFiltering" },
      { $set: { value: enableMessageFiltering } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "hiddenWords" },
      { $set: { value: hiddenWords } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "replacementText" },
      { $set: { value: replacementText } },
      { upsert: true }
    );
    
    await coll.updateOne(
      { key: "enableStrictFiltering" },
      { $set: { value: enableStrictFiltering } },
      { upsert: true }
    );
    
    res.json({ success: true, message: 'บันทึกการตั้งค่าการกรองเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error saving filter settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API endpoint สำหรับทดสอบการกรองข้อความ
app.post('/api/filter/test', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, error: 'กรุณาใส่ข้อความที่ต้องการทดสอบ' });
    }
    
    const result = await testMessageFiltering(message);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error testing message filter:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================ Socket.IO Events ============================
io.on('connection', (socket) => {
  console.log('[Socket.IO] Admin connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('[Socket.IO] Admin disconnected:', socket.id);
  });
  
  // Join admin room for receiving updates
  socket.join('admin');
});

// Function to notify admins of new user messages
async function notifyAdminsNewMessage(userId, message) {
  // ตรวจสอบการตั้งค่าการแจ้งเตือน
  const enableAdminNotifications = await getSettingValue('enableAdminNotifications', true);
  
  if (enableAdminNotifications) {
    // แจ้งเตือนแอดมินผ่าน Socket.IO
    io.to('admin').emit('newMessage', {
      userId: userId,
      message: message,
      sender: 'user',
      timestamp: new Date()
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
      { upsert: true }
    );
  } catch (error) {
    console.error('ไม่สามารถอัปเดต unread count ได้:', error);
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
    console.error('ไม่สามารถดึง unread count ได้:', error);
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
      { upsert: true }
    );
  } catch (error) {
    console.error('ไม่สามารถรีเซ็ต unread count ได้:', error);
  }
}

// ============================ Message Filtering Functions ============================

// ฟังก์ชันสำหรับกรองข้อความตามการตั้งค่า
async function filterMessage(message) {
  try {
    // ตรวจสอบว่าการกรองเปิดใช้งานหรือไม่
    const enableFiltering = await getSettingValue('enableMessageFiltering', true);
    if (!enableFiltering) {
      return message; // ไม่กรอง ถ้าไม่ได้เปิดใช้งาน
    }

    // ดึงการตั้งค่าการกรอง
    const hiddenWords = await getSettingValue('hiddenWords', '');
    const replacementText = await getSettingValue('replacementText', '[ข้อความถูกซ่อน]');
    const enableStrictFiltering = await getSettingValue('enableStrictFiltering', true);

    if (!hiddenWords || hiddenWords.trim() === '') {
      return message; // ไม่กรอง ถ้าไม่มีคำที่ซ่อน
    }

    // แยกคำที่ซ่อนเป็นรายการ
    const wordsToHide = hiddenWords.split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0);

    if (wordsToHide.length === 0) {
      return message; // ไม่กรอง ถ้าไม่มีคำที่ซ่อน
    }

    let filteredMessage = message;
    const foundHiddenWords = [];

    // กรองแต่ละคำที่ซ่อน
    wordsToHide.forEach(word => {
      if (word.length > 0) {
        // สร้าง regex pattern สำหรับการค้นหา (ไม่คำนึงถึงตัวพิมพ์เล็ก-ใหญ่)
        const pattern = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        
        if (pattern.test(filteredMessage)) {
          foundHiddenWords.push(word);
          
          if (enableStrictFiltering) {
            // การกรองแบบละเอียด: แทนที่ทั้งคำและวลีที่ประกอบด้วยคำนั้น
            filteredMessage = filteredMessage.replace(pattern, replacementText);
          } else {
            // การกรองแบบปกติ: แทนที่เฉพาะคำที่ตรงกันเท่านั้น
            const wordBoundaryPattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            filteredMessage = filteredMessage.replace(wordBoundaryPattern, replacementText);
          }
        }
      }
    });

    console.log(`[Filter] กรองข้อความ: พบคำที่ซ่อน ${foundHiddenWords.length} คำ`);
    return filteredMessage;

  } catch (error) {
    console.error('[Filter] ข้อผิดพลาดในการกรองข้อความ:', error);
    return message; // ส่งคืนข้อความต้นฉบับในกรณีที่เกิดข้อผิดพลาด
  }
}

// ฟังก์ชันสำหรับทดสอบการกรองข้อความ
async function testMessageFiltering(message) {
  try {
    const filteredMessage = await filterMessage(message);
    const hiddenWords = await getSettingValue('hiddenWords', '');
    
    // หาคำที่ถูกซ่อน
    const wordsToHide = hiddenWords.split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0);
    
    const foundHiddenWords = [];
    wordsToHide.forEach(word => {
      if (word.length > 0) {
        const pattern = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        if (pattern.test(message)) {
          foundHiddenWords.push(word);
        }
      }
    });

    return {
      originalMessage: message,
      filteredMessage: filteredMessage,
      hiddenWords: foundHiddenWords
    };
  } catch (error) {
    console.error('[Filter] ข้อผิดพลาดในการทดสอบการกรอง:', error);
    throw error;
  }
}
