// Chat New UI JavaScript - Minimal & Clean Implementation

class ChatManager {
    constructor() {
        this.socket = null;
        this.currentUserId = null;
        this.users = [];
        this.chatHistory = {};
        this.isLoading = false;
        
        this.init();
    }

    init() {
        this.initializeSocket();
        this.setupEventListeners();
        this.loadUsers();
        this.setupAutoRefresh();
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('เชื่อมต่อ Socket.IO สำเร็จ');
            this.showToast('เชื่อมต่อสำเร็จ', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('การเชื่อมต่อ Socket.IO ถูกตัด');
            this.showToast('การเชื่อมต่อถูกตัด', 'warning');
        });

        this.socket.on('newMessage', (data) => {
            console.log('ข้อความใหม่:', data);
            this.handleNewMessage(data);
        });

        this.socket.on('chatCleared', (data) => {
            if (data.userId === this.currentUserId) {
                this.clearChatDisplay();
            }
            this.loadUsers();
        });
    }

    setupEventListeners() {
        // Message input events
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const charCount = document.getElementById('charCount');

        messageInput.addEventListener('input', (e) => {
            const count = e.target.value.length;
            charCount.textContent = count;
            
            if (count > 900) {
                charCount.classList.add('text-danger');
            } else {
                charCount.classList.remove('text-danger');
            }
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        sendButton.addEventListener('click', () => {
            this.sendMessage();
        });

        // Image modal events
        document.getElementById('downloadImage').addEventListener('click', () => {
            this.downloadImage();
        });

        document.getElementById('copyImage').addEventListener('click', () => {
            this.copyImage();
        });
    }

    async loadUsers() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoadingState();

        try {
            const response = await fetch('/admin/chat/users');
            const data = await response.json();
            
            if (data.success) {
                this.users = data.users;
                this.renderUserList();
                this.updateUserCount();
            } else {
                console.error('ไม่สามารถโหลดรายชื่อผู้ใช้ได้:', data.error);
                this.showToast('ไม่สามารถโหลดรายชื่อผู้ใช้ได้', 'error');
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการโหลดรายชื่อผู้ใช้:', error);
            this.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    showLoadingState() {
        const userList = document.getElementById('userList');
        userList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <span>กำลังโหลด...</span>
            </div>
        `;
    }

    renderUserList() {
        const userList = document.getElementById('userList');
        
        if (this.users.length === 0) {
            userList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <h6>ไม่มีผู้ใช้</h6>
                    <p>ยังไม่มีผู้ใช้ในระบบ</p>
                </div>
            `;
            return;
        }

        const userHtml = this.users.map(user => {
            const isActive = user.userId === this.currentUserId;
            const hasUnread = user.unreadCount > 0;
            
            // ใช้ข้อมูลที่แปลงแล้วจาก backend
            let lastMsg = '';
            if (user.lastMessage) {
                // ถ้าเป็น HTML ให้แปลงเป็นข้อความธรรมดา
                if (user.lastMessage.includes('<')) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = user.lastMessage;
                    lastMsg = tempDiv.textContent || tempDiv.innerText || '';
                } else {
                    lastMsg = user.lastMessage;
                }
            }
            
            return `
                <div class="user-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}" 
                     onclick="chatManager.selectUser('${user.userId}')">
                    <div class="user-item-content">
                        <div class="user-avatar">
                            ${user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div class="user-details">
                            <div class="user-name">${this.escapeHtml(user.displayName)}</div>
                            <div class="user-last-message">${this.escapeHtml(lastMsg.substring(0, 50))}${lastMsg.length > 50 ? '...' : ''}</div>
                            <div class="user-timestamp">${this.formatTimestamp(user.lastTimestamp)}</div>
                        </div>
                        ${hasUnread ? `<div class="unread-badge">${user.unreadCount}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        userList.innerHTML = userHtml;
    }

    updateUserCount() {
        const userCount = document.getElementById('userCount');
        userCount.textContent = this.users.length;
    }

    async selectUser(userId) {
        if (this.currentUserId === userId) return;
        
        this.currentUserId = userId;
        
        // Update UI: toggle active state using data attribute selector
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
        });
        const currentItem = document.querySelector(`.user-item[onclick*="${userId}"]`);
        if (currentItem) {
            currentItem.classList.add('active');
        }
        
        // Update chat header
        const user = this.users.find(u => u.userId === userId);
        if (user) {
            this.updateChatHeader(user);
        }
        
        // Show message input
        document.getElementById('messageInputContainer').style.display = 'block';
        
        // Load chat history
        await this.loadChatHistory(userId);
    }

    updateChatHeader(user) {
        const chatHeader = document.getElementById('chatHeader');
        const headerActions = document.getElementById('headerActions');
        
        chatHeader.innerHTML = `
            <div class="header-content">
                <div class="user-info">
                    <div class="user-avatar">
                        ${user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div class="user-details">
                        <h6 class="mb-0">${this.escapeHtml(user.displayName)}</h6>
                        <small class="text-muted">${user.messageCount} ข้อความ</small>
                    </div>
                </div>
                <div class="header-actions" id="headerActions">
                    <button class="btn btn-sm btn-outline-danger" onclick="chatManager.clearUserChat()">
                        <i class="fas fa-trash me-1"></i>ล้างประวัติ
                    </button>
                </div>
            </div>
        `;
    }

    async loadChatHistory(userId) {
        try {
            const response = await fetch(`/admin/chat/history/${userId}`);
            const data = await response.json();
            
            if (data.success) {
                this.chatHistory[userId] = data.messages;
                this.renderChatHistory(userId);
            } else {
                console.error('ไม่สามารถโหลดประวัติการสนทนาได้:', data.error);
                this.showToast('ไม่สามารถโหลดประวัติการสนทนาได้', 'error');
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการโหลดประวัติการสนทนา:', error);
            this.showToast('เกิดข้อผิดพลาดในการโหลดประวัติ', 'error');
        }
    }

    renderChatHistory(userId) {
        const container = document.getElementById('messagesContainer');
        const messages = this.chatHistory[userId] || [];
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <h6>ไม่มีประวัติการสนทนา</h6>
                    <p>เริ่มการสนทนาโดยการส่งข้อความ</p>
                </div>
            `;
            return;
        }

        const chatHtml = messages.map(message => {
            const messageClass = message.role === 'user' ? 'user' : 
                               message.source === 'admin_chat' ? 'admin' : 'assistant';
            const senderLabel = message.role === 'user' ? 'ผู้ใช้' : 
                              message.source === 'admin_chat' ? 'แอดมิน' : 'AI Assistant';
            
            // Normalize base content
            const baseContent = (message && (message.content ?? message.text ?? message.message)) || '';
            
            // Process message content
            let displayContent = baseContent;
            if (message.role !== 'user' && displayContent.includes('<reply>')) {
                const replyMatch = displayContent.match(/<reply>(.*?)<\/reply>/s);
                if (replyMatch) {
                    displayContent = replyMatch[1].trim();
                }
            }

            // ใช้ข้อมูลที่แปลงแล้วจาก backend
            if (message.displayContent) {
                // ถ้ามี displayContent ที่แปลงแล้ว ให้ใช้เลย
                displayContent = message.displayContent;
            } else {
                // fallback สำหรับข้อความเก่า
                if (message.role === 'user') {
                    const processed = this.processQueueMessage(baseContent);
                    if (processed.type === 'queue' || processed.type === 'single_image' || processed.type === 'single_text') {
                        displayContent = this.createCompactMessageHTML(processed);
                    } else {
                        const raw = typeof baseContent === 'string' ? baseContent : JSON.stringify(baseContent);
                        const safe = (raw || '').trim();
                        displayContent = safe ? `<div class="message-text">${this.escapeHtml(safe)}</div>` : '';
                    }
                } else {
                    const raw = typeof displayContent === 'string' ? displayContent : '';
                    const safe = (raw || '').trim();
                    displayContent = safe ? `<div class="message-text">${this.escapeHtml(safe)}</div>` : '';
                }
            }
            
            return `
                <div class="message ${messageClass}">
                    <div class="message-header">
                        <i class="fas fa-user"></i>
                        <span>${senderLabel}</span>
                    </div>
                    <div class="message-content">
                        ${displayContent}
                    </div>
                    <div class="message-timestamp">${this.formatTimestamp(message.timestamp)}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = chatHtml;
        this.scrollToBottom();
    }

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const messageText = messageInput.value.trim();
        
        if (!messageText || !this.currentUserId) return;

        try {
            const response = await fetch('/admin/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    message: messageText
                })
            });

            const data = await response.json();
            if (data.success) {
                // Add new message to history
                const newMessage = {
                    content: messageText,
                    role: 'assistant',
                    timestamp: new Date(),
                    source: 'admin_chat'
                };
                
                if (!this.chatHistory[this.currentUserId]) {
                    this.chatHistory[this.currentUserId] = [];
                }
                this.chatHistory[this.currentUserId].push(newMessage);
                
                // Update display
                this.renderChatHistory(this.currentUserId);
                
                // Clear input
                messageInput.value = '';
                document.getElementById('charCount').textContent = '0';
                
                // Update user list
                this.loadUsers();
                
                this.showToast('ส่งข้อความสำเร็จ', 'success');
            } else {
                this.showToast('ไม่สามารถส่งข้อความได้: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการส่งข้อความ:', error);
            this.showToast('เกิดข้อผิดพลาดในการส่งข้อความ', 'error');
        }
    }

    handleNewMessage(data) {
        // Update unread count for user
        const user = this.users.find(u => u.userId === data.userId);
        if (user) {
            user.unreadCount = (user.unreadCount || 0) + 1;
            user.lastMessage = this.normalizeContentToPreview(data.message?.content);
            user.lastTimestamp = data.timestamp || data.message?.timestamp || new Date().toISOString();
            
            // Update display
            this.renderUserList();
            
            // If it's the current user, update chat
            if (data.userId === this.currentUserId) {
                if (!this.chatHistory[this.currentUserId]) {
                    this.chatHistory[this.currentUserId] = [];
                }
                this.chatHistory[this.currentUserId].push(data.message);
                this.renderChatHistory(this.currentUserId);
            }
        }
    }

    async clearUserChat() {
        if (!this.currentUserId) return;
        
        if (!confirm('คุณแน่ใจหรือไม่ที่จะล้างประวัติการสนทนาของผู้ใช้นี้?')) {
            return;
        }

        try {
            const response = await fetch(`/admin/chat/clear/${this.currentUserId}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (data.success) {
                this.clearChatDisplay();
                this.loadUsers();
                this.showToast('ล้างประวัติการสนทนาเรียบร้อยแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถล้างประวัติการสนทนาได้: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการล้างประวัติการสนทนา:', error);
            this.showToast('เกิดข้อผิดพลาดในการล้างประวัติ', 'error');
        }
    }

    clearChatDisplay() {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h5>ยินดีต้อนรับสู่ระบบแชท</h5>
                <p>เลือกผู้ใช้จากรายชื่อด้านซ้ายเพื่อเริ่มการสนทนา</p>
            </div>
        `;
        
        document.getElementById('messageInputContainer').style.display = 'none';
        
        const chatHeader = document.getElementById('chatHeader');
        chatHeader.innerHTML = `
            <div class="header-content">
                <div class="user-info">
                    <div class="user-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="user-details">
                        <h6 class="mb-0">เลือกผู้ใช้เพื่อเริ่มการสนทนา</h6>
                        <small class="text-muted">0 ข้อความ</small>
                    </div>
                </div>
            </div>
        `;
        
        this.currentUserId = null;
    }

    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        container.scrollTop = container.scrollHeight;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'เมื่อสักครู่';
        if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
        if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
        if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
        
        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Image handling methods
    openImageModal(imageSrc) {
        const modal = new bootstrap.Modal(document.getElementById('imageModal'));
        const modalImage = document.getElementById('modalImage');
        
        modalImage.src = imageSrc;
        this.currentImageSrc = imageSrc;
        modal.show();
    }

    downloadImage() {
        if (!this.currentImageSrc) return;
        
        const link = document.createElement('a');
        link.href = this.currentImageSrc;
        link.download = 'line_image.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showToast('ดาวน์โหลดรูปภาพเรียบร้อยแล้ว', 'success');
    }

    async copyImage() {
        if (!this.currentImageSrc) return;
        
        try {
            const response = await fetch(this.currentImageSrc);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);
            
            this.showToast('คัดลอกรูปภาพเรียบร้อยแล้ว', 'success');
        } catch (error) {
            console.error('ไม่สามารถคัดลอกรูปภาพได้:', error);
            this.showToast('ไม่สามารถคัดลอกรูปภาพได้', 'error');
        }
    }

    // Message processing methods
    normalizeContentToPreview(content) {
        try {
            // If string, try to parse JSON; otherwise return trimmed string
            if (typeof content === 'string') {
                const trimmed = content.trim();
                if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
                    const parsed = JSON.parse(trimmed);
                    const processed = this.processQueueMessage(parsed);
                    const text = (processed.textParts || []).join(' ').trim();
                    if (text) return text;
                    if (processed.imageParts && processed.imageParts.length > 0) {
                        return 'ส่งรูปภาพ';
                    }
                    return trimmed;
                }
                return trimmed;
            }
            // If array/object, reuse processor
            const processed = this.processQueueMessage(content);
            const text = (processed.textParts || []).join(' ').trim();
            if (text) return text;
            if (processed.imageParts && processed.imageParts.length > 0) {
                return 'ส่งรูปภาพ';
            }
            return '';
        } catch (_) {
            try { return JSON.stringify(content).substring(0, 100); } catch { return ''; }
        }
    }
    processQueueMessage(content) {
        // Accept string, object, or array
        let payload = content;
        try {
            if (typeof payload === 'string') {
                const trimmed = payload.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    payload = JSON.parse(trimmed);
                } else {
                    // Plain text string
                    return { textParts: [payload], imageParts: [], type: 'single_text' };
                }
            }
        } catch (e) {
            // Not JSON, treat as plain text
            return { textParts: [String(content || '')], imageParts: [], type: 'single_text' };
        }

        // If array, collect parts
        if (Array.isArray(payload)) {
            const textParts = [];
            const imageParts = [];
            payload.forEach(item => {
                const data = item && item.data ? item.data : item;
                if (!data) return;
                if (data.type === 'text' && data.text) {
                    textParts.push(data.text);
                } else if (data.type === 'image' && data.base64) {
                    imageParts.push(data);
                }
            });
            return { textParts, imageParts, type: 'queue' };
        }

        // If object with data wrapper
        if (payload && typeof payload === 'object') {
            const data = payload.data || payload;
            if (data.type === 'image' && data.base64) {
                return { textParts: [], imageParts: [data], type: 'single_image' };
            }
            if (data.type === 'text' && data.text) {
                return { textParts: [data.text], imageParts: [], type: 'single_text' };
            }
        }

        return { textParts: [], imageParts: [], type: 'unknown' };
    }

    createImageMessageHTML(imageData, index = 0) {
        const base64Size = Math.ceil((imageData.base64.length * 3) / 4);
        const sizeKB = (base64Size / 1024).toFixed(1);
        
        return `
            <div class="message-image">
                <img src="data:image/jpeg;base64,${imageData.base64}" 
                     alt="รูปภาพจากผู้ใช้ ${index + 1}" 
                     onclick="chatManager.openImageModal(this.src)"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <div class="image-error-fallback" style="display: none;">
                    <i class="fas fa-image text-muted"></i>
                    <div class="text-muted small">ไม่สามารถแสดงรูปภาพได้</div>
                </div>
                <div class="image-info">
                    <small class="text-muted">
                        <i class="fas fa-image me-1"></i>
                        รูปภาพ JPEG (${sizeKB} KB)
                    </small>
                </div>
            </div>
        `;
    }

    createCompactMessageHTML(processed) {
        let contentHtml = '';
        
        // Show text
        if (processed.textParts.length > 0) {
            const textContent = processed.textParts.join(' ');
            if (textContent.trim()) {
                contentHtml += `<div class="message-text">${this.escapeHtml(textContent)}</div>`;
            }
        }
        
        // Show images
        if (processed.imageParts.length > 0) {
            if (processed.imageParts.length === 1) {
                contentHtml += this.createImageMessageHTML(processed.imageParts[0]);
            } else {
                contentHtml += '<div class="image-grid">';
                processed.imageParts.forEach((imageData, index) => {
                    contentHtml += `
                        <img src="data:image/jpeg;base64,${imageData.base64}" 
                             alt="รูปภาพ ${index + 1}" 
                             onclick="chatManager.openImageModal(this.src)"
                             onerror="this.style.display='none';">
                    `;
                });
                contentHtml += '</div>';
                contentHtml += `<div class="image-info">
                    <small class="text-muted">
                        <i class="fas fa-images me-1"></i>
                        รูปภาพ ${processed.imageParts.length} รูป
                    </small>
                </div>`;
            }
        }
        
        return contentHtml;
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastBody = document.getElementById('toastBody');
        const toastHeader = toast.querySelector('.toast-header');
        
        toastBody.textContent = message;
        
        // Update toast styling based on type
        toast.className = `toast ${type}`;
        
        const icon = toastHeader.querySelector('i');
        icon.className = `fas ${
            type === 'success' ? 'fa-check-circle text-success' :
            type === 'error' ? 'fa-exclamation-circle text-danger' :
            type === 'warning' ? 'fa-exclamation-triangle text-warning' :
            'fa-info-circle text-primary'
        } me-2`;
        
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }

    setupAutoRefresh() {
        // Auto-refresh users every 30 seconds
        setInterval(() => {
            this.loadUsers();
        }, 30000);
    }
}

// Initialize chat manager when DOM is loaded
let chatManager;
document.addEventListener('DOMContentLoaded', function() {
    chatManager = new ChatManager();
});

// Global functions for onclick handlers
function clearUserChat() {
    if (chatManager) {
        chatManager.clearUserChat();
    }
}

function openImageModal(imageSrc) {
    if (chatManager) {
        chatManager.openImageModal(imageSrc);
    }
}

// Global function for image modal (can be called from HTML)
window.openImageModal = function(imageSrc) {
    if (chatManager) {
        chatManager.openImageModal(imageSrc);
    }
};
