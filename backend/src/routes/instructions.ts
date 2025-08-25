import express from 'express';
import { Instruction } from '../models/Instruction';
import { protect, authorize, AuthRequest } from '../middleware/auth';

const router = express.Router();

// @desc    Get all instructions
// @route   GET /api/instructions
// @access  Private
router.get('/', protect, async (req: AuthRequest, res) => {
  try {
    const { platform, category, isActive, page = 1, limit = 10 } = req.query;
    
    const query: any = {};
    
    if (platform) {
      query.platforms = platform;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const instructions = await Instruction.find(query)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Instruction.countDocuments(query);

    res.status(200).json({
      success: true,
      count: instructions.length,
      total,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      },
      data: instructions
    });
  } catch (error) {
    console.error('Get instructions error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำแนะนำ'
    });
  }
});

// @desc    Get single instruction
// @route   GET /api/instructions/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const instruction = await Instruction.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!instruction) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบคำแนะนำที่ต้องการ'
      });
    }

    res.status(200).json({
      success: true,
      data: instruction
    });
  } catch (error) {
    console.error('Get instruction error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำแนะนำ'
    });
  }
});

// @desc    Create new instruction
// @route   POST /api/instructions
// @access  Private
router.post('/', protect, authorize('admin', 'agent'), async (req: AuthRequest, res) => {
  try {
    const { name, description, content, category, platforms, priority, tags } = req.body;

    const instruction = await Instruction.create({
      name,
      description,
      content,
      category,
      platforms,
      priority: priority || 1,
      tags: tags || [],
      createdBy: req.user!.id,
      updatedBy: req.user!.id
    });

    const populatedInstruction = await instruction.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    res.status(201).json({
      success: true,
      data: populatedInstruction
    });
  } catch (error) {
    console.error('Create instruction error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการสร้างคำแนะนำ'
    });
  }
});

// @desc    Update instruction
// @route   PUT /api/instructions/:id
// @access  Private
router.put('/:id', protect, authorize('admin', 'agent'), async (req: AuthRequest, res) => {
  try {
    const { name, description, content, category, platforms, priority, tags, isActive } = req.body;

    const instruction = await Instruction.findById(req.params.id);

    if (!instruction) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบคำแนะนำที่ต้องการ'
      });
    }

    // Update fields
    if (name !== undefined) instruction.name = name;
    if (description !== undefined) instruction.description = description;
    if (content !== undefined) instruction.content = content;
    if (category !== undefined) instruction.category = category;
    if (platforms !== undefined) instruction.platforms = platforms;
    if (priority !== undefined) instruction.priority = priority;
    if (tags !== undefined) instruction.tags = tags;
    if (isActive !== undefined) instruction.isActive = isActive;
    
    instruction.updatedBy = req.user!.id;

    await instruction.save();

    const updatedInstruction = await instruction.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    res.status(200).json({
      success: true,
      data: updatedInstruction
    });
  } catch (error) {
    console.error('Update instruction error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตคำแนะนำ'
    });
  }
});

// @desc    Delete instruction
// @route   DELETE /api/instructions/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const instruction = await Instruction.findById(req.params.id);

    if (!instruction) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบคำแนะนำที่ต้องการ'
      });
    }

    await instruction.deleteOne();

    res.status(200).json({
      success: true,
      message: 'ลบคำแนะนำสำเร็จ'
    });
  } catch (error) {
    console.error('Delete instruction error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการลบคำแนะนำ'
    });
  }
});

// @desc    Get instructions by platform
// @route   GET /api/instructions/platform/:platform
// @access  Private
router.get('/platform/:platform', protect, async (req, res) => {
  try {
    const { platform } = req.params;
    const { category } = req.query;

    const query: any = {
      platforms: platform,
      isActive: true
    };

    if (category) {
      query.category = category;
    }

    const instructions = await Instruction.find(query)
      .sort({ priority: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: instructions.length,
      data: instructions
    });
  } catch (error) {
    console.error('Get platform instructions error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลคำแนะนำ'
    });
  }
});

// @desc    Bulk update instruction status
// @route   PUT /api/instructions/bulk/status
// @access  Private/Admin
router.put('/bulk/status', protect, authorize('admin'), async (req, res) => {
  try {
    const { ids, isActive } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ ID ของคำแนะนำที่ต้องการอัปเดต'
      });
    }

    const result = await Instruction.updateMany(
      { _id: { $in: ids } },
      { 
        isActive,
        updatedBy: req.user!.id,
        updatedAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: `อัปเดตสถานะคำแนะนำ ${result.modifiedCount} รายการสำเร็จ`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk update status error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ'
    });
  }
});

export const instructionRoutes = router;
