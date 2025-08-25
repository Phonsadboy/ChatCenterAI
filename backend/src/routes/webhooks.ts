import express from 'express';
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

router.post('/facebook', async (req, res) => {
  try {
    const { body } = req;
    
    if (body.object === 'page') {
      for (const entry of body.entry) {
        const pageId = entry.id;
        
        // หา platform ที่มี page ID นี้
        const platform = await Platform.findOne({
          'credentials.appId': pageId,
          platformType: 'facebook',
          isActive: true
        });

        if (platform) {
          // ประมวลผลข้อความ
          for (const event of entry.messaging) {
            await processFacebookMessage(platform, event);
          }
        }
      }
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Facebook webhook processing error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// LINE Webhook
router.post('/line', async (req, res) => {
  try {
    const { body } = req;
    const signature = req.headers['x-line-signature'] as string;

    if (!signature) {
      return res.status(400).send('Missing signature');
    }

    // หา platform ที่มี channel secret นี้
    const platform = await Platform.findOne({
      platformType: 'line',
      isActive: true
    });

    if (!platform) {
      return res.status(404).send('Platform not found');
    }

    // ตรวจสอบ signature (ในที่จริงควรใช้ crypto.verify)
    // const isValid = verifyLineSignature(body, platform.credentials.channelSecret, signature);
    // if (!isValid) {
    //   return res.status(401).send('Invalid signature');
    // }

    // ประมวลผลข้อความ
    for (const event of body.events) {
      await processLineMessage(platform, event);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('LINE webhook processing error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Telegram Webhook
router.post('/telegram', async (req, res) => {
  try {
    const { body } = req;
    
    if (body.message) {
      const botToken = body.message.from?.id;
      
      // หา platform ที่มี bot token นี้
      const platform = await Platform.findOne({
        'credentials.botToken': botToken,
        platformType: 'telegram',
        isActive: true
      });

      if (platform) {
        await processTelegramMessage(platform, body.message);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Telegram webhook processing error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Instagram Webhook
router.post('/instagram', async (req, res) => {
  try {
    const { body } = req;
    
    if (body.object === 'instagram') {
      for (const entry of body.entry) {
        const pageId = entry.id;
        
        // หา platform ที่มี page ID นี้
        const platform = await Platform.findOne({
          'credentials.appId': pageId,
          platformType: 'instagram',
          isActive: true
        });

        if (platform) {
          for (const event of entry.messaging) {
            await processInstagramMessage(platform, event);
          }
        }
      }
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Instagram webhook processing error:', error);
    res.status(500).send('Internal Server Error');
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
