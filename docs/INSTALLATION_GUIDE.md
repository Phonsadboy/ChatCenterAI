# คู่มือการติดตั้งหน้าแชทใหม่

## 📋 สารบัญ

1. [ข้อกำหนดเบื้องต้น](#ข้อกำหนดเบื้องต้น)
2. [การติดตั้งไฟล์](#การติดตั้งไฟล์)
3. [การตั้งค่า Backend](#การตั้งค่า-backend)
4. [การทดสอบ](#การทดสอบ)
5. [การแก้ไขปัญหา](#การแก้ไขปัญหา)

---

## ข้อกำหนดเบื้องต้น

### 1. Node.js และ NPM
```bash
node --version  # ควรเป็น v14 ขึ้นไป
npm --version
```

### 2. Dependencies ที่ต้องติดตั้ง

```bash
npm install express
npm install ejs
npm install socket.io
npm install mongoose  # หรือ database driver อื่นๆ
```

### 3. ไฟล์สนับสนุนที่ต้องมี

ตรวจสอบว่ามีไฟล์เหล่านี้ในโปรเจค:

**CSS Files:**
- `/public/css/style.css`
- `/public/css/mobile-improvements.css`
- `/public/css/loading-states.css`
- `/public/css/error-handler.css`
- `/public/css/animations.css`

**JavaScript Files:**
- `/public/js/performance-utils.js`
- `/public/js/loading-states.js`
- `/public/js/error-handler.js`

**EJS Partials:**
- `/views/partials/admin-navbar.ejs`

---

## การติดตั้งไฟล์

### ขั้นตอนที่ 1: คัดลอกไฟล์

```bash
# สร้างโฟลเดอร์ถ้ายังไม่มี
mkdir -p views
mkdir -p public/js
mkdir -p public/css

# คัดลอกไฟล์
cp admin-chat.ejs views/
cp chat-new.js public/js/
cp chat-new.css public/css/
```

### ขั้นตอนที่ 2: สร้างไฟล์สนับสนุน (ถ้ายังไม่มี)

#### 2.1 สร้าง `/public/css/mobile-improvements.css`

```css
/* Mobile Improvements */
@media (max-width: 991.98px) {
    .chat-container {
        flex-direction: column;
    }
    
    .user-sidebar {
        position: fixed;
        left: -100%;
        transition: left 0.3s ease;
        z-index: 1000;
    }
    
    .user-sidebar.show {
        left: 0;
    }
}
```

#### 2.2 สร้าง `/public/css/loading-states.css`

```css
/* Loading States */
.loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-secondary);
}

.loading-state i {
    font-size: 2rem;
    margin-bottom: 0.5rem;
}

.skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
}

@keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
```

#### 2.3 สร้าง `/public/css/error-handler.css`

```css
/* Error Handler */
.error-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    min-width: 300px;
    max-width: 500px;
}

.error-message {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 0.5rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.error-message.error {
    background: #dc3545;
    color: white;
}

.error-message.success {
    background: #28a745;
    color: white;
}

.error-message.warning {
    background: #ffc107;
    color: #000;
}
```

#### 2.4 สร้าง `/public/css/animations.css`

```css
/* Animations */
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideInLeft {
    from {
        transform: translateX(-100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.fade-in {
    animation: fadeIn 0.3s ease;
}

.slide-in-right {
    animation: slideInRight 0.3s ease;
}

.slide-in-left {
    animation: slideInLeft 0.3s ease;
}
```

#### 2.5 สร้าง `/public/js/performance-utils.js`

```javascript
// Performance Utilities
window.performanceUtils = {
    // Optimized Fetch with Cache
    OptimizedFetch: class {
        constructor() {
            this.cache = new Map();
        }
        
        async fetch(url, options = {}) {
            const cacheKey = url + JSON.stringify(options);
            const cached = this.cache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < 30000) {
                return cached.data;
            }
            
            const response = await fetch(url, options);
            const data = await response.json();
            
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
            
            return data;
        }
        
        clearCache() {
            this.cache.clear();
        }
    },
    
    // Lazy Image Loader
    LazyImageLoader: class {
        constructor() {
            this.observer = null;
            this.init();
        }
        
        init() {
            if ('IntersectionObserver' in window) {
                this.observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            img.src = img.dataset.src;
                            img.classList.remove('lazy');
                            this.observer.unobserve(img);
                        }
                    });
                });
            }
        }
        
        observe(img) {
            if (this.observer) {
                this.observer.observe(img);
            } else {
                img.src = img.dataset.src;
            }
        }
    },
    
    // Smart Poller
    SmartPoller: class {
        constructor(callback, interval) {
            this.callback = callback;
            this.interval = interval;
            this.timerId = null;
            this.isActive = true;
            
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.stop();
                } else {
                    this.start();
                }
            });
        }
        
        start() {
            if (!this.timerId) {
                this.timerId = setInterval(this.callback, this.interval);
            }
        }
        
        stop() {
            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
        }
    }
};
```

#### 2.6 สร้าง `/public/js/loading-states.js`

```javascript
// Loading States Management
window.loadingStates = {
    show(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>กำลังโหลด...</span>
                </div>
            `;
        }
    },
    
    hide(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            const loadingState = element.querySelector('.loading-state');
            if (loadingState) {
                loadingState.remove();
            }
        }
    },
    
    showButton(button) {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>กำลังโหลด...';
        }
    },
    
    hideButton(button, originalText) {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }
};
```

#### 2.7 สร้าง `/public/js/error-handler.js`

```javascript
// Error Handler
window.errorHandler = {
    handleApiError(error) {
        console.error('API Error:', error);
        
        let message = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
        
        if (error.response) {
            message = error.response.data?.message || message;
        } else if (error.message) {
            message = error.message;
        }
        
        this.showError(message);
    },
    
    showError(message) {
        this.showToast(message, 'error');
    },
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `error-message ${type}`;
        toast.textContent = message;
        
        let container = document.querySelector('.error-toast');
        if (!container) {
            container = document.createElement('div');
            container.className = 'error-toast';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Global error handlers
window.showError = (message) => window.errorHandler.showError(message);
window.showSuccess = (message) => window.errorHandler.showToast(message, 'success');
window.showWarning = (message) => window.errorHandler.showToast(message, 'warning');
```

---

## การตั้งค่า Backend

### ขั้นตอนที่ 1: สร้าง Route สำหรับหน้าแชท

ใน `index.js` หรือ `routes/admin.js`:

```javascript
const express = require('express');
const router = express.Router();

// แสดงหน้าแชท
router.get('/admin/chat', (req, res) => {
    res.render('admin-chat', {
        // ส่งข้อมูลที่จำเป็น
        user: req.user,
        chatCenterFollowUpConfig: {
            analysisEnabled: true,
            showInChat: true
        }
    });
});

module.exports = router;
```

### ขั้นตอนที่ 2: สร้าง API Endpoints

```javascript
// GET /admin/chat/users - ดึงรายชื่อผู้ใช้
router.get('/admin/chat/users', async (req, res) => {
    try {
        const users = await User.find()
            .sort({ lastMessageTime: -1 })
            .lean();
        
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /admin/chat/history/:userId - ดึงประวัติการสนทนา
router.get('/admin/chat/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const messages = await Message.find({ userId })
            .sort({ timestamp: 1 })
            .lean();
        
        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /admin/chat/send - ส่งข้อความ
router.post('/admin/chat/send', async (req, res) => {
    try {
        const { userId, message } = req.body;
        
        // บันทึกข้อความ
        const newMessage = await Message.create({
            userId,
            role: 'admin',
            content: message,
            timestamp: new Date()
        });
        
        // ส่ง Socket.IO event
        req.app.io.emit('newMessage', {
            userId,
            message: newMessage
        });
        
        res.json({ success: true, message: newMessage });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /admin/chat/clear/:userId - ล้างประวัติการสนทนา
router.post('/admin/chat/clear/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        await Message.deleteMany({ userId });
        
        // ส่ง Socket.IO event
        req.app.io.emit('chatCleared', { userId });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /admin/chat/user-status/:userId - ดึงสถานะ AI
router.get('/admin/chat/user-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne({ userId });
        
        res.json({
            success: true,
            aiEnabled: user?.aiEnabled ?? true
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /admin/chat/user-status - อัปเดตสถานะ AI
router.post('/admin/chat/user-status', async (req, res) => {
    try {
        const { userId, aiEnabled } = req.body;
        
        await User.updateOne(
            { userId },
            { $set: { aiEnabled } }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /admin/chat/purchase-status - อัปเดตสถานะการซื้อ
router.post('/admin/chat/purchase-status', async (req, res) => {
    try {
        const { userId, hasPurchased } = req.body;
        
        await User.updateOne(
            { userId },
            { $set: { hasPurchased } }
        );
        
        // ส่ง Socket.IO event
        req.app.io.emit('userPurchaseStatusUpdated', {
            userId,
            hasPurchased
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /admin/chat/tags - ดึงแท็กทั้งหมด
router.get('/admin/chat/tags', async (req, res) => {
    try {
        const tags = await User.distinct('tags');
        res.json({ success: true, tags });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /admin/chat/tags - จัดการแท็ก
router.post('/admin/chat/tags', async (req, res) => {
    try {
        const { userId, tags } = req.body;
        
        await User.updateOne(
            { userId },
            { $set: { tags } }
        );
        
        // ส่ง Socket.IO event
        req.app.io.emit('userTagsUpdated', {
            userId,
            tags
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /admin/chat/quick-replies - ดึง Quick Replies
router.get('/admin/chat/quick-replies', async (req, res) => {
    try {
        const replies = await QuickReply.find().sort({ createdAt: -1 });
        res.json({ success: true, replies });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /admin/chat/quick-reply - บันทึก Quick Reply
router.post('/admin/chat/quick-reply', async (req, res) => {
    try {
        const { title, content } = req.body;
        
        const reply = await QuickReply.create({
            title,
            content,
            createdAt: new Date()
        });
        
        res.json({ success: true, reply });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /admin/chat/quick-reply/:id - ลบ Quick Reply
router.delete('/admin/chat/quick-reply/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await QuickReply.deleteOne({ _id: id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
```

### ขั้นตอนที่ 3: ตั้งค่า Socket.IO

ใน `index.js`:

```javascript
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// เก็บ io instance ใน app
app.io = io;

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

---

## การทดสอบ

### 1. ทดสอบการโหลดหน้า

```bash
# เปิดเบราว์เซอร์และไปที่
http://localhost:3000/admin/chat
```

**ตรวจสอบ:**
- ✅ หน้าโหลดได้
- ✅ ไม่มี Console Errors
- ✅ CSS โหลดถูกต้อง
- ✅ JavaScript โหลดถูกต้อง

### 2. ทดสอบ Socket.IO

เปิด Browser Console และตรวจสอบ:

```javascript
// ควรเห็นข้อความ
"เชื่อมต่อ Socket.IO สำเร็จ"
```

### 3. ทดสอบการโหลดผู้ใช้

```javascript
// ใน Browser Console
fetch('/admin/chat/users')
    .then(r => r.json())
    .then(console.log)
```

**ผลลัพธ์ที่คาดหวัง:**
```json
{
    "success": true,
    "users": [...]
}
```

### 4. ทดสอบการส่งข้อความ

1. เลือกผู้ใช้จากรายการ
2. พิมพ์ข้อความในช่อง input
3. กด Enter หรือคลิกปุ่มส่ง
4. ตรวจสอบว่าข้อความปรากฏในแชท

### 5. ทดสอบฟีเจอร์อื่นๆ

- ✅ การค้นหาผู้ใช้
- ✅ การกรองตามสถานะ
- ✅ การจัดการแท็ก
- ✅ การเปลี่ยนสถานะการซื้อ
- ✅ การเปิด/ปิด AI
- ✅ การล้างประวัติการสนทนา

---

## การแก้ไขปัญหา

### ปัญหา: หน้าไม่โหลด

**สาเหตุที่เป็นไปได้:**
1. Route ไม่ถูกต้อง
2. ไฟล์ EJS ไม่อยู่ในตำแหน่งที่ถูกต้อง

**วิธีแก้:**
```bash
# ตรวจสอบว่าไฟล์อยู่ในตำแหน่งที่ถูกต้อง
ls -la views/admin-chat.ejs

# ตรวจสอบ Express view engine
# ใน index.js ควรมี:
app.set('view engine', 'ejs');
app.set('views', './views');
```

### ปัญหา: CSS ไม่โหลด

**สาเหตุที่เป็นไปได้:**
1. Static files middleware ไม่ได้ตั้งค่า
2. Path ไม่ถูกต้อง

**วิธีแก้:**
```javascript
// ใน index.js
app.use(express.static('public'));

// ตรวจสอบว่าไฟล์อยู่ในตำแหน่งที่ถูกต้อง
ls -la public/css/chat-new.css
```

### ปัญหา: JavaScript Error

**เปิด Browser Console และดู Error:**

1. **Cannot read property 'addEventListener' of null**
   - Element ไม่พบ
   - ตรวจสอบ ID ใน HTML

2. **io is not defined**
   - Socket.IO Client ไม่ได้โหลด
   - เพิ่ม `<script src="/socket.io/socket.io.js"></script>`

3. **Uncaught ReferenceError: chatManager is not defined**
   - JavaScript ไม่ได้โหลด
   - ตรวจสอบ path ของ script tag

### ปัญหา: Socket.IO ไม่เชื่อมต่อ

**วิธีแก้:**
```javascript
// ตรวจสอบว่า Socket.IO Server ทำงาน
// ใน index.js
const io = socketIO(server);
console.log('Socket.IO initialized');

// ตรวจสอบ CORS (ถ้าจำเป็น)
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
```

### ปัญหา: API ไม่ทำงาน

**วิธีแก้:**
1. ตรวจสอบ Network Tab ใน Browser DevTools
2. ดู Status Code และ Response
3. ตรวจสอบ Server Logs

```bash
# เปิด Debug Mode
DEBUG=* node index.js
```

### ปัญหา: Database Connection

**วิธีแก้:**
```javascript
// ตรวจสอบการเชื่อมต่อ Database
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));
```

---

## เพิ่มเติม

### การอัปเดตในอนาคต

1. Virtual Scrolling สำหรับรายการผู้ใช้จำนวนมาก
2. Image Upload Support
3. Voice Message Support
4. Video Call Integration
5. Rich Text Editor
6. Emoji Picker
7. File Attachment Support

### การปรับแต่งเพิ่มเติม

1. **เปลี่ยนสี Theme**
   - แก้ไข CSS Variables ใน `chat-new.css`

2. **เพิ่ม AI Models**
   - แก้ไขรายการ models ใน `chat-new.js`

3. **ปรับแต่ง Keyboard Shortcuts**
   - แก้ไข `shortcuts` object ใน `ChatManager` constructor

4. **เพิ่ม Quick Replies**
   - ใช้ API `/admin/chat/quick-reply`

---

## สรุป

หลังจากติดตั้งเสร็จแล้ว คุณควรมี:

✅ หน้าแชทที่ทำงานได้เต็มรูปแบบ  
✅ Real-time messaging ผ่าน Socket.IO  
✅ User management พร้อมการกรองและค้นหา  
✅ Tag management  
✅ Purchase status tracking  
✅ AI control (per-user และ global)  
✅ Mobile responsive design  
✅ Performance optimizations  

หากมีปัญหาหรือข้อสงสัย กรุณาตรวจสอบ Console Logs และ Network Tab ใน Browser DevTools

**Happy Coding! 🚀**

