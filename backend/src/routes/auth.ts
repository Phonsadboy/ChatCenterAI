import express from 'express';
import { User } from '../models/User';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'อีเมลนี้ถูกใช้งานแล้ว'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: role || 'agent'
    });

    sendTokenResponse(user, 201, res);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการลงทะเบียน'
    });
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอกอีเมลและรหัสผ่าน'
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'ข้อมูลการเข้าสู่ระบบไม่ถูกต้อง'
      });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'ข้อมูลการเข้าสู่ระบบไม่ถูกต้อง'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
    });
  }
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req: any, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้'
    });
  }
});

// @desc    Update user details
// @route   PUT /api/auth/updatedetails
// @access  Private
router.put('/updatedetails', protect, async (req: any, res) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      email: req.body.email
    };

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Update details error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล'
    });
  }
});

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
router.put('/updatepassword', protect, async (req: any, res) => {
  try {
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    if (!(await user!.comparePassword(req.body.currentPassword))) {
      return res.status(401).json({
        success: false,
        error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง'
      });
    }

    user!.password = req.body.newPassword;
    await user!.save();

    sendTokenResponse(user!, 200, res);
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตรหัสผ่าน'
    });
  }
});

// @desc    Log user out / clear cookie
// @route   GET /api/auth/logout
// @access  Private
router.get('/logout', protect, async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ออกจากระบบสำเร็จ'
  });
});

// @desc    Get all users (admin only)
// @route   GET /api/auth/users
// @access  Private/Admin
router.get('/users', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้'
    });
  }
});

// Get token from model, create cookie and send response
const sendTokenResponse = (user: any, statusCode: number, res: any) => {
  // Create token
  const token = user.getSignedJwtToken();

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar
    }
  });
};

export const authRoutes = router;
