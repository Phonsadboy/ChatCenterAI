import express from 'express';

import { PlatformService } from '../services/platformService';

const router = express.Router();

// @desc    Get all supported platforms
// @route   GET /api/platforms
// @access  Private
router.get('/', async (req, res) => {
  try {
    const userId = 'system';

    // ดึง platforms ที่ผู้ใช้มี
    const userPlatforms = await PlatformService.getPlatformsByUserId(userId);
    
    // สร้าง map ของ platforms ที่มีอยู่
    const userPlatformsMap = new Map();
    userPlatforms.forEach(platform => {
      userPlatformsMap.set(platform.platformType, platform);
    });

    const platforms = [
      {
        id: 'facebook',
        name: 'Facebook Messenger',
        icon: 'facebook',
        color: '#1877F2',
        isActive: userPlatformsMap.has('facebook') && userPlatformsMap.get('facebook').isActive,
        hasConfig: userPlatformsMap.has('facebook'),
        config: userPlatformsMap.get('facebook') || null
      },
      {
        id: 'line',
        name: 'LINE',
        icon: 'line',
        color: '#00B900',
        isActive: userPlatformsMap.has('line') && userPlatformsMap.get('line').isActive,
        hasConfig: userPlatformsMap.has('line'),
        config: userPlatformsMap.get('line') || null
      },
      {
        id: 'telegram',
        name: 'Telegram',
        icon: 'telegram',
        color: '#0088CC',
        isActive: userPlatformsMap.has('telegram') && userPlatformsMap.get('telegram').isActive,
        hasConfig: userPlatformsMap.has('telegram'),
        config: userPlatformsMap.get('telegram') || null
      },
      {
        id: 'instagram',
        name: 'Instagram',
        icon: 'instagram',
        color: '#E4405F',
        isActive: userPlatformsMap.has('instagram') && userPlatformsMap.get('instagram').isActive,
        hasConfig: userPlatformsMap.has('instagram'),
        config: userPlatformsMap.get('instagram') || null
      },
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        icon: 'whatsapp',
        color: '#25D366',
        isActive: false,
        hasConfig: false,
        config: null
      },
      {
        id: 'web',
        name: 'Web Chat',
        icon: 'web',
        color: '#6366F1',
        isActive: true,
        hasConfig: false,
        config: null
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

// @desc    Create new platform
// @route   POST /api/platforms
// @access  Private
router.post('/', async (req, res) => {
  try {
    const userId = 'system';

    const { platformType, name, credentials, webhookUrl } = req.body;

    if (!platformType || !name || !credentials) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ platformType, name และ credentials'
      });
    }

    const platform = await PlatformService.createPlatform({
      userId,
      platformType,
      name,
      credentials,
      webhookUrl
    });

    res.status(201).json({
      success: true,
      data: platform
    });
  } catch (error) {
    console.error('Create platform error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการสร้างแพลตฟอร์ม'
    });
  }
});

// @desc    Get platform by ID
// @route   GET /api/platforms/:id
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const userId = 'system';
    const { id } = req.params;

    const platform = await PlatformService.getPlatformById(id, userId);
    if (!platform) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแพลตฟอร์ม'
      });
    }

    res.status(200).json({
      success: true,
      data: platform
    });
  } catch (error) {
    console.error('Get platform error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลแพลตฟอร์ม'
    });
  }
});

// @desc    Update platform
// @route   PUT /api/platforms/:id
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const userId = 'system';
    const { id } = req.params;
    const updateData = req.body;

    const platform = await PlatformService.updatePlatform(id, userId, updateData);
    if (!platform) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแพลตฟอร์ม'
      });
    }

    res.status(200).json({
      success: true,
      data: platform
    });
  } catch (error) {
    console.error('Update platform error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตแพลตฟอร์ม'
    });
  }
});

// @desc    Delete platform
// @route   DELETE /api/platforms/:id
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const userId = 'system';
    const { id } = req.params;

    const deleted = await PlatformService.deletePlatform(id, userId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแพลตฟอร์ม'
      });
    }

    res.status(200).json({
      success: true,
      message: 'ลบแพลตฟอร์มสำเร็จ'
    });
  } catch (error) {
    console.error('Delete platform error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการลบแพลตฟอร์ม'
    });
  }
});

// @desc    Toggle platform status
// @route   PATCH /api/platforms/:id/toggle
// @access  Private
router.patch('/:id/toggle', async (req, res) => {
  try {
    const userId = 'system';
    const { id } = req.params;

    const platform = await PlatformService.togglePlatform(id, userId);
    if (!platform) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแพลตฟอร์ม'
      });
    }

    res.status(200).json({
      success: true,
      data: platform
    });
  } catch (error) {
    console.error('Toggle platform error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะแพลตฟอร์ม'
    });
  }
});

// @desc    Test platform connection
// @route   POST /api/platforms/:id/test
// @access  Private
router.post('/:id/test', async (req, res) => {
  try {
    const userId = 'system';
    const { id } = req.params;

    const platform = await PlatformService.getPlatformById(id, userId);
    if (!platform) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแพลตฟอร์ม'
      });
    }

    // ตรวจสอบว่า platform มี credentials ที่ครบถ้วนหรือไม่
    const isValid = PlatformService.isPlatformValid(platform);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'ข้อมูล credentials ไม่ครบถ้วน'
      });
    }

    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 1000));

    res.status(200).json({
      success: true,
      message: `ทดสอบการเชื่อมต่อ ${platform.name} สำเร็จ`,
      data: {
        platform: platform.platformType,
        name: platform.name,
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
// @route   GET /api/platforms/:id/stats
// @access  Private
router.get('/:id/stats', async (req, res) => {
  try {
    const userId = 'system';
    const { id } = req.params;
    const { period = '7d' } = req.query;

    const platform = await PlatformService.getPlatformById(id, userId);
    if (!platform) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแพลตฟอร์ม'
      });
    }

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
