import express from 'express';
import { protect, authorize, AuthRequest } from '../middleware/auth';

const router = express.Router();

// @desc    Get all supported platforms
// @route   GET /api/platforms
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const platforms = [
      {
        id: 'facebook',
        name: 'Facebook Messenger',
        icon: 'facebook',
        color: '#1877F2',
        isActive: !!process.env.FACEBOOK_APP_ID,
        config: {
          appId: process.env.FACEBOOK_APP_ID,
          hasWebhook: true
        }
      },
      {
        id: 'line',
        name: 'LINE',
        icon: 'line',
        color: '#00B900',
        isActive: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        config: {
          channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
          hasWebhook: true
        }
      },
      {
        id: 'telegram',
        name: 'Telegram',
        icon: 'telegram',
        color: '#0088CC',
        isActive: !!process.env.TELEGRAM_BOT_TOKEN,
        config: {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          hasWebhook: true
        }
      },
      {
        id: 'instagram',
        name: 'Instagram',
        icon: 'instagram',
        color: '#E4405F',
        isActive: !!process.env.INSTAGRAM_ACCESS_TOKEN,
        config: {
          accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
          hasWebhook: true
        }
      },
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        icon: 'whatsapp',
        color: '#25D366',
        isActive: false,
        config: {
          hasWebhook: false
        }
      },
      {
        id: 'web',
        name: 'Web Chat',
        icon: 'web',
        color: '#6366F1',
        isActive: true,
        config: {
          hasWebhook: false
        }
      }
    ];

    res.status(200).json({
      success: true,
      data: platforms
    });
  } catch (error) {
    console.error('Get platforms error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลแพลตฟอร์ม'
    });
  }
});

// @desc    Get platform configuration
// @route   GET /api/platforms/:platform/config
// @access  Private/Admin
router.get('/:platform/config', protect, authorize('admin'), async (req, res) => {
  try {
    const { platform } = req.params;
    let config = {};

    switch (platform) {
      case 'facebook':
        config = {
          appId: process.env.FACEBOOK_APP_ID,
          appSecret: process.env.FACEBOOK_APP_SECRET,
          verifyToken: process.env.FACEBOOK_VERIFY_TOKEN,
          webhookUrl: `${process.env.BASE_URL}/api/webhooks/facebook`
        };
        break;
      case 'line':
        config = {
          channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
          channelSecret: process.env.LINE_CHANNEL_SECRET,
          webhookUrl: `${process.env.BASE_URL}/api/webhooks/line`
        };
        break;
      case 'telegram':
        config = {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          webhookUrl: `${process.env.BASE_URL}/api/webhooks/telegram`
        };
        break;
      case 'instagram':
        config = {
          accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
          webhookUrl: `${process.env.BASE_URL}/api/webhooks/instagram`
        };
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'แพลตฟอร์มไม่รองรับ'
        });
    }

    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get platform config error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการตั้งค่าแพลตฟอร์ม'
    });
  }
});

// @desc    Update platform configuration
// @route   PUT /api/platforms/:platform/config
// @access  Private/Admin
router.put('/:platform/config', protect, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { platform } = req.params;
    const config = req.body;

    // In a real application, you would save this to a database
    // For now, we'll just return success
    res.status(200).json({
      success: true,
      message: `อัปเดตการตั้งค่า ${platform} สำเร็จ`,
      data: config
    });
  } catch (error) {
    console.error('Update platform config error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตการตั้งค่าแพลตฟอร์ม'
    });
  }
});

// @desc    Test platform connection
// @route   POST /api/platforms/:platform/test
// @access  Private/Admin
router.post('/:platform/test', protect, authorize('admin'), async (req, res) => {
  try {
    const { platform } = req.params;

    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 1000));

    res.status(200).json({
      success: true,
      message: `ทดสอบการเชื่อมต่อ ${platform} สำเร็จ`,
      data: {
        platform,
        status: 'connected',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Test platform connection error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการทดสอบการเชื่อมต่อ'
    });
  }
});

// @desc    Get platform statistics
// @route   GET /api/platforms/:platform/stats
// @access  Private
router.get('/:platform/stats', protect, async (req, res) => {
  try {
    const { platform } = req.params;
    const { period = '7d' } = req.query;

    // In a real application, you would query the database for actual stats
    // For now, we'll return mock data
    const mockStats = {
      totalChats: Math.floor(Math.random() * 1000),
      activeChats: Math.floor(Math.random() * 100),
      resolvedChats: Math.floor(Math.random() * 800),
      avgResponseTime: Math.floor(Math.random() * 300) + 60, // seconds
      satisfactionRate: Math.floor(Math.random() * 30) + 70, // percentage
      period
    };

    res.status(200).json({
      success: true,
      data: mockStats
    });
  } catch (error) {
    console.error('Get platform stats error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติแพลตฟอร์ม'
    });
  }
});

export const platformRoutes = router;
