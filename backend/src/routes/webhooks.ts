import express from 'express';
import { LineService, LineWebhookBody } from '../services/lineService';
import { PlatformService } from '../services/platformService';
import { Platform } from '../models/Platform';

const router = express.Router();

// Facebook Messenger Webhook
router.get('/facebook', async (req, res) => {
  try {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;

    if (mode === 'subscribe' && token) {
      // หา platform ที่มี verify token นี้
      const platform = await Platform.findOne({
        'credentials.verifyToken': token,
        platformType: 'facebook',
        isActive: true
      });

      if (platform) {
        console.log('Facebook webhook verified for platform:', platform.name);
        res.status(200).send(challenge);
      } else {
        console.log('Facebook webhook verification failed - invalid token');
        res.status(403).send('Forbidden');
      }
    } else {
      res.status(403).send('Forbidden');
    }
  } catch (error) {
    console.error('Facebook webhook verification error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// @desc    LINE webhook endpoint
// @route   POST /api/webhooks/line
// @access  Public
router.post('/line', async (req, res) => {
  try {
    const signature = req.headers['x-line-signature'] as string;
    const body = JSON.stringify(req.body);
    
    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing LINE signature'
      });
    }

    // ดึง Line platform configuration
    const userId = 'system';
    const linePlatform = await PlatformService.getPlatformByType(userId, 'line');
    
    if (!linePlatform || !linePlatform.isActive) {
      console.log('LINE platform not configured or inactive');
      return res.status(200).json({ success: true }); // Return 200 to LINE
    }

    // ตรวจสอบ signature
    const isValidSignature = LineService.verifySignature(
      body,
      signature,
      linePlatform.credentials.channelSecret || ''
    );

    if (!isValidSignature) {
      console.error('Invalid LINE signature');
      return res.status(401).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    const webhookBody: LineWebhookBody = req.body;
    
    if (webhookBody.events && webhookBody.events.length > 0) {
      // จัดการ events จาก Line
      await LineService.handleWebhookEvents(webhookBody.events, linePlatform);
    }

    // ตอบกลับ 200 OK ให้ Line
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('LINE webhook error:', error);
    // ยังคงตอบกลับ 200 เพื่อไม่ให้ Line ส่ง event ซ้ำ
    res.status(200).json({ success: true });
  }
});

// @desc    Facebook webhook endpoint
// @route   POST /api/webhooks/facebook
// @access  Public
router.post('/facebook', async (req, res) => {
  try {
    // TODO: Implement Facebook webhook handling
    console.log('Facebook webhook received:', req.body);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Facebook webhook error:', error);
    res.status(200).json({ success: true });
  }
});

// @desc    Telegram webhook endpoint
// @route   POST /api/webhooks/telegram
// @access  Public
router.post('/telegram', async (req, res) => {
  try {
    // TODO: Implement Telegram webhook handling
    console.log('Telegram webhook received:', req.body);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.status(200).json({ success: true });
  }
});

// @desc    Instagram webhook endpoint
// @route   POST /api/webhooks/instagram
// @access  Public
router.post('/instagram', async (req, res) => {
  try {
    // TODO: Implement Instagram webhook handling
    console.log('Instagram webhook received:', req.body);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Instagram webhook error:', error);
    res.status(200).json({ success: true });
  }
});

// Helper functions for processing messages
async function processFacebookMessage(platform: any, event: any) {
  try {
    const { sender, message, postback } = event;
    
    if (message && message.text) {
      console.log(`Facebook message from ${sender.id}: ${message.text}`);
      // TODO: ส่งข้อความไปยัง AI service และตอบกลับ
    } else if (postback) {
      console.log(`Facebook postback from ${sender.id}: ${postback.payload}`);
      // TODO: ประมวลผล postback
    }
  } catch (error) {
    console.error('Error processing Facebook message:', error);
  }
}

async function processLineMessage(platform: any, event: any) {
  try {
    const { type, message, source } = event;
    
    if (type === 'message' && message.type === 'text') {
      console.log(`LINE message from ${source.userId}: ${message.text}`);
      // TODO: ส่งข้อความไปยัง AI service และตอบกลับ
    }
  } catch (error) {
    console.error('Error processing LINE message:', error);
  }
}

async function processTelegramMessage(platform: any, message: any) {
  try {
    const { text, from } = message;
    
    if (text) {
      console.log(`Telegram message from ${from.id}: ${text}`);
      // TODO: ส่งข้อความไปยัง AI service และตอบกลับ
    }
  } catch (error) {
    console.error('Error processing Telegram message:', error);
  }
}

async function processInstagramMessage(platform: any, event: any) {
  try {
    const { sender, message } = event;
    
    if (message && message.text) {
      console.log(`Instagram message from ${sender.id}: ${message.text}`);
      // TODO: ส่งข้อความไปยัง AI service และตอบกลับ
    }
  } catch (error) {
    console.error('Error processing Instagram message:', error);
  }
}

export const webhookRoutes = router;
