import express from 'express';
import { Chat, IMessage } from '../models/Chat';
import { aiService } from '../services/aiService';

const router = express.Router();

// @desc    Get all chats
// @route   GET /api/chat
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { 
      platform, 
      status, 
      assignedAgent, 
      priority,
      page = 1, 
      limit = 20,
      search 
    } = req.query;
    
    const query: any = {};
    
    if (platform) {
      query.platform = platform;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (assignedAgent) {
      if (assignedAgent === 'unassigned') {
        query.assignedAgent = { $exists: false };
      } else {
        query.assignedAgent = assignedAgent;
      }
    }
    
    if (priority) {
      query.priority = priority;
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { 'messages.content': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const chats = await Chat.find(query)
      .populate('assignedAgent', 'name email avatar')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Chat.countDocuments(query);

    res.status(200).json({
      success: true,
      count: chats.length,
      total,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      },
      data: chats
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลแชท'
    });
  }
});

// @desc    Get single chat
// @route   GET /api/chat/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id)
      .populate('assignedAgent', 'name email avatar');

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแชทที่ต้องการ'
      });
    }

    res.status(200).json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลแชท'
    });
  }
});

// @desc    Create new chat
// @route   POST /api/chat
// @access  Private
router.post('/', async (req, res) => {
  try {
    const { customerId, customerName, platform, platformId, message } = req.body;

    // Check if chat already exists
    let chat = await Chat.findOne({ customerId, platform });

    if (chat) {
      // Add message to existing chat
      const newMessage: IMessage = {
        id: Date.now().toString(),
        content: message,
        type: 'text',
        sender: 'customer',
        senderId: customerId,
        senderName: customerName,
        timestamp: new Date()
      };

      chat.messages.push(newMessage);
      chat.lastMessageAt = new Date();
      await chat.save();

      // Generate AI response
      const aiResponse = await generateAIResponse(chat, message);
      
      if (aiResponse) {
        const aiMessage: IMessage = {
          id: (Date.now() + 1).toString(),
          content: aiResponse,
          type: 'text',
          sender: 'ai',
          senderName: 'AI Assistant',
          timestamp: new Date()
        };

        chat.messages.push(aiMessage);
        chat.aiResponses += 1;
        await chat.save();
      }

      const populatedChat = await chat.populate('assignedAgent', 'name email avatar');

      return res.status(200).json({
        success: true,
        data: populatedChat
      });
    }

    // Create new chat
    const newMessage: IMessage = {
      id: Date.now().toString(),
      content: message,
      type: 'text',
      sender: 'customer',
      senderId: customerId,
      senderName: customerName,
      timestamp: new Date()
    };

    chat = await Chat.create({
      customerId,
      customerName,
      platform,
      platformId,
      messages: [newMessage]
    });

    // Generate AI response
    const aiResponse = await generateAIResponse(chat, message);
    
    if (aiResponse) {
      const aiMessage: IMessage = {
        id: (Date.now() + 1).toString(),
        content: aiResponse,
        type: 'text',
        sender: 'ai',
        senderName: 'AI Assistant',
        timestamp: new Date()
      };

      chat.messages.push(aiMessage);
      chat.aiResponses += 1;
      await chat.save();
    }

    const populatedChat = await chat.populate('assignedAgent', 'name email avatar');

    res.status(201).json({
      success: true,
      data: populatedChat
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการสร้างแชท'
    });
  }
});

// @desc    Send message to chat
// @route   POST /api/chat/:id/messages
// @access  Private
router.post('/:id/messages', async (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแชทที่ต้องการ'
      });
    }

    const newMessage: IMessage = {
      id: Date.now().toString(),
      content,
      type,
      sender: 'agent',
      senderId: 'system',
      senderName: 'Agent',
      timestamp: new Date()
    };

    chat.messages.push(newMessage);
    chat.lastMessageAt = new Date();
    chat.humanResponses += 1;
    await chat.save();

    const populatedChat = await chat.populate('assignedAgent', 'name email avatar');

    res.status(200).json({
      success: true,
      data: populatedChat
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่งข้อความ'
    });
  }
});

// @desc    Update chat status
// @route   PUT /api/chat/:id/status
// @access  Private
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแชทที่ต้องการ'
      });
    }

    chat.status = status;
    await chat.save();

    const populatedChat = await chat.populate('assignedAgent', 'name email avatar');

    res.status(200).json({
      success: true,
      data: populatedChat
    });
  } catch (error) {
    console.error('Update chat status error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตสถานะแชท'
    });
  }
});

// @desc    Assign chat to agent
// @route   PUT /api/chat/:id/assign
// @access  Private
router.put('/:id/assign', async (req, res) => {
  try {
    const { assignedAgent } = req.body;
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบแชทที่ต้องการ'
      });
    }

    chat.assignedAgent = assignedAgent;
    await chat.save();

    const populatedChat = await chat.populate('assignedAgent', 'name email avatar');

    res.status(200).json({
      success: true,
      data: populatedChat
    });
  } catch (error) {
    console.error('Assign chat error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการมอบหมายแชท'
    });
  }
});

// @desc    Get chat statistics
// @route   GET /api/chat/stats/overview
// @access  Private
router.get('/stats/overview', async (req, res) => {
  try {
    const totalChats = await Chat.countDocuments();
    const activeChats = await Chat.countDocuments({ status: 'active' });
    const resolvedChats = await Chat.countDocuments({ status: 'resolved' });
    const pendingChats = await Chat.countDocuments({ status: 'pending' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newChatsToday = await Chat.countDocuments({
      createdAt: { $gte: today }
    });

    const totalAIResponses = await Chat.aggregate([
      { $group: { _id: null, total: { $sum: '$aiResponses' } } }
    ]);

    const totalHumanResponses = await Chat.aggregate([
      { $group: { _id: null, total: { $sum: '$humanResponses' } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalChats,
        activeChats,
        resolvedChats,
        pendingChats,
        newChatsToday,
        totalAIResponses: totalAIResponses[0]?.total || 0,
        totalHumanResponses: totalHumanResponses[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get chat stats error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ'
    });
  }
});

// Helper function to generate AI response
async function generateAIResponse(chat: any, message: string): Promise<string | null> {
  try {
    const conversationHistory = chat.messages.slice(-10).map((msg: IMessage) => ({
      role: msg.sender === 'customer' ? 'user' : 'assistant',
      content: msg.content
    }));

    const context = {
      customerName: chat.customerName,
      platform: chat.platform,
      conversationHistory,
      instructions: []
    };

    const response = await aiService.generateResponse(context);
    return response;
  } catch (error) {
    console.error('AI response generation error:', error);
    return null;
  }
}

export const chatRoutes = router;
