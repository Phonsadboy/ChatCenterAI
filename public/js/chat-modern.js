/**
 * Modern Chat Interface JavaScript
 * Created with Best Practices 2025
 * 
 * Features:
 * - Real-time messaging with Socket.IO
 * - Optimized performance
 * - Responsive design
 * - Accessibility support
 * - Error handling
 */

class ModernChat {
    constructor() {
        // State Management
        this.currentUserId = null;
        this.users = [];
        this.messages = {};
        this.socket = null;
        this.currentFilter = 'all';
        this.searchTerm = '';
        
        // DOM Elements
        this.elements = {};
        
        // Configuration
        this.config = {
            maxMessageLength: 2000,
            loadingDelay: 300,
            autoScrollThreshold: 100
        };
        
        // Initialize
        this.init();
    }
    
    /**
     * Initialize the chat application
     */
    async init() {
        try {
            this.cacheElements();
            this.setupEventListeners();
            this.initializeSocket();
            await this.loadUsers();
            this.showToast('เชื่อมต่อสำเร็จ', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('เกิดข้อผิดพลาดในการเริ่มต้น', 'error');
        }
    }
    
    /**
     * Cache DOM elements for better performance
     */
    cacheElements() {
        // Sidebar
        this.elements.sidebar = document.getElementById('chatSidebar');
        this.elements.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.elements.closeSidebar = document.getElementById('closeSidebar');
        this.elements.toggleSidebar = document.getElementById('toggleSidebar');
        
        // Search & Filter
        this.elements.searchUsers = document.getElementById('searchUsers');
        this.elements.filterChips = document.querySelectorAll('.filter-chip');
        
        // User List
        this.elements.userList = document.getElementById('userList');
        
        // Chat
        this.elements.chatMain = document.getElementById('chatMain');
        this.elements.emptyState = document.getElementById('emptyState');
        this.elements.chatContent = document.getElementById('chatContent');
        this.elements.chatHeader = document.getElementById('chatHeader');
        this.elements.messagesContainer = document.getElementById('messagesContainer');
        
        // Input
        this.elements.messageInput = document.getElementById('messageInput');
        this.elements.btnSend = document.getElementById('btnSend');
        this.elements.charCount = document.getElementById('charCount');
        
        // Header elements
        this.elements.headerAvatar = document.getElementById('headerAvatar');
        this.elements.headerUserName = document.getElementById('headerUserName');
        this.elements.headerUserStatus = document.getElementById('headerUserStatus');
        
        // Modals
        this.elements.imageViewerModal = document.getElementById('imageViewerModal');
        this.elements.imageViewerImg = document.getElementById('imageViewerImg');
        
        // Toast
        this.elements.toast = document.getElementById('liveToast');
        this.elements.toastMessage = document.getElementById('toastMessage');
    }
    
    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Sidebar toggle
        if (this.elements.toggleSidebar) {
            this.elements.toggleSidebar.addEventListener('click', () => this.toggleSidebar());
        }
        
        if (this.elements.closeSidebar) {
            this.elements.closeSidebar.addEventListener('click', () => this.closeSidebar());
        }
        
        if (this.elements.sidebarOverlay) {
            this.elements.sidebarOverlay.addEventListener('click', () => this.closeSidebar());
        }
        
        // Search
        if (this.elements.searchUsers) {
            this.elements.searchUsers.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.filterUsers();
            });
        }
        
        // Filters
        this.elements.filterChips.forEach(chip => {
            chip.addEventListener('click', () => this.handleFilterChange(chip));
        });
        
        // Message input
        if (this.elements.messageInput) {
            this.elements.messageInput.addEventListener('input', (e) => this.handleInputChange(e));
            this.elements.messageInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        }
        
        // Send button
        if (this.elements.btnSend) {
            this.elements.btnSend.addEventListener('click', () => this.sendMessage());
        }
        
        // Header actions
        const btnUserInfo = document.getElementById('btnUserInfo');
        if (btnUserInfo) {
            btnUserInfo.addEventListener('click', () => this.toggleUserInfo());
        }
        
        const btnClearChat = document.getElementById('btnClearChat');
        if (btnClearChat) {
            btnClearChat.addEventListener('click', () => this.clearChat());
        }
        
        // Close user info panel
        const closeUserInfo = document.getElementById('closeUserInfo');
        if (closeUserInfo) {
            closeUserInfo.addEventListener('click', () => this.closeUserInfo());
        }
        
        // Responsive handlers
        this.setupResponsiveHandlers();
    }
    
    /**
     * Setup responsive event handlers
     */
    setupResponsiveHandlers() {
        const mediaQuery = window.matchMedia('(max-width: 991.98px)');
        
        const handleResize = (e) => {
            if (!e.matches) {
                // Desktop: close sidebar if open
                this.closeSidebar();
            }
        };
        
        mediaQuery.addEventListener('change', handleResize);
    }
    
    /**
     * Initialize Socket.IO connection
     */
    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Socket connected');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.showToast('การเชื่อมต่อขาดหาย', 'warning');
        });
        
        this.socket.on('newMessage', (data) => {
            this.handleNewMessage(data);
        });
        
        this.socket.on('chatCleared', (data) => {
            if (data.userId === this.currentUserId) {
                this.messages[this.currentUserId] = [];
                this.renderMessages();
            }
            this.loadUsers();
        });
    }
    
    /**
     * Load users from server
     */
    async loadUsers() {
        try {
            const response = await fetch('/admin/chat/users');
            const data = await response.json();
            
            if (data.success) {
                this.users = data.users || [];
                this.renderUserList();
            } else {
                throw new Error(data.error || 'Failed to load users');
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('ไม่สามารถโหลดรายชื่อผู้ใช้ได้', 'error');
            this.renderEmptyUserList();
        }
    }
    
    /**
     * Render user list in sidebar
     */
    renderUserList() {
        if (!this.elements.userList) return;
        
        const filteredUsers = this.getFilteredUsers();
        
        if (filteredUsers.length === 0) {
            this.renderEmptyUserList();
            return;
        }
        
        const html = filteredUsers.map(user => this.createUserListItem(user)).join('');
        this.elements.userList.innerHTML = html;
        
        // Attach click listeners
        this.elements.userList.querySelectorAll('.user-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.dataset.userId;
                this.selectUser(userId);
            });
        });
    }
    
    /**
     * Create HTML for user list item
     */
    createUserListItem(user) {
        const isActive = user.userId === this.currentUserId;
        const hasUnread = user.unreadCount > 0;
        const displayName = user.displayName || this.truncateText(user.userId, 20);
        const lastMessage = user.lastMessage || 'ไม่มีข้อความ';
        const timeAgo = this.getTimeAgo(user.lastTimestamp);
        const initial = displayName.charAt(0).toUpperCase();
        
        return `
            <div class="user-list-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}" 
                 data-user-id="${this.escapeHtml(user.userId)}"
                 role="button"
                 tabindex="0"
                 aria-label="${this.escapeHtml(displayName)}">
                <div class="user-avatar">
                    ${this.escapeHtml(initial)}
                </div>
                <div class="user-details">
                    <div class="user-name">${this.escapeHtml(displayName)}</div>
                    <div class="last-message">${this.escapeHtml(this.truncateText(lastMessage, 40))}</div>
                </div>
                <div class="message-meta">
                    <div class="message-time">${this.escapeHtml(timeAgo)}</div>
                    ${hasUnread ? `<div class="unread-badge">${user.unreadCount}</div>` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Render empty user list
     */
    renderEmptyUserList() {
        if (!this.elements.userList) return;
        
        this.elements.userList.innerHTML = `
            <div class="loading-users">
                <i class="fas fa-users" style="font-size: 3rem; color: var(--neutral-300);"></i>
                <p>ไม่มีผู้ใช้ในระบบ</p>
            </div>
        `;
    }
    
    /**
     * Get filtered users based on search and filter
     */
    getFilteredUsers() {
        let filtered = [...this.users];
        
        // Apply search filter
        if (this.searchTerm) {
            filtered = filtered.filter(user => {
                const name = (user.displayName || '').toLowerCase();
                const userId = (user.userId || '').toLowerCase();
                return name.includes(this.searchTerm) || userId.includes(this.searchTerm);
            });
        }
        
        // Apply status filter
        switch (this.currentFilter) {
            case 'unread':
                filtered = filtered.filter(user => user.unreadCount > 0);
                break;
            case 'starred':
                filtered = filtered.filter(user => user.isStarred);
                break;
            // 'all' - no additional filtering
        }
        
        return filtered;
    }
    
    /**
     * Filter users and update display
     */
    filterUsers() {
        this.renderUserList();
    }
    
    /**
     * Handle filter chip click
     */
    handleFilterChange(chip) {
        // Update UI
        this.elements.filterChips.forEach(c => {
            c.classList.remove('active');
            c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
        
        // Update filter
        this.currentFilter = chip.dataset.filter;
        this.filterUsers();
    }
    
    /**
     * Select a user and load their chat
     */
    async selectUser(userId) {
        if (this.currentUserId === userId) return;
        
        this.currentUserId = userId;
        const user = this.users.find(u => u.userId === userId);
        
        if (!user) return;
        
        // Update UI
        this.updateChatHeader(user);
        this.showChatContent();
        
        // Load messages
        await this.loadMessages(userId);
        
        // Close sidebar on mobile
        if (window.innerWidth < 992) {
            this.closeSidebar();
        }
        
        // Update user list
        this.renderUserList();
    }
    
    /**
     * Update chat header with user info
     */
    updateChatHeader(user) {
        const displayName = user.displayName || this.truncateText(user.userId, 30);
        const initial = displayName.charAt(0).toUpperCase();
        
        if (this.elements.headerAvatar) {
            this.elements.headerAvatar.innerHTML = this.escapeHtml(initial);
        }
        
        if (this.elements.headerUserName) {
            this.elements.headerUserName.textContent = displayName;
        }
        
        if (this.elements.headerUserStatus) {
            this.elements.headerUserStatus.innerHTML = `
                <span class="status-dot"></span>
                ${user.messageCount || 0} ข้อความ
            `;
        }
    }
    
    /**
     * Show chat content area
     */
    showChatContent() {
        if (this.elements.emptyState) {
            this.elements.emptyState.style.display = 'none';
        }
        if (this.elements.chatContent) {
            this.elements.chatContent.style.display = 'flex';
        }
    }
    
    /**
     * Load messages for a user
     */
    async loadMessages(userId) {
        try {
            const response = await fetch(`/admin/chat/history/${userId}`);
            const data = await response.json();
            
            if (data.success) {
                this.messages[userId] = data.messages || [];
                this.renderMessages();
            } else {
                throw new Error(data.error || 'Failed to load messages');
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showToast('ไม่สามารถโหลดข้อความได้', 'error');
        }
    }
    
    /**
     * Render messages in chat area
     */
    renderMessages() {
        if (!this.elements.messagesContainer || !this.currentUserId) return;
        
        const messages = this.messages[this.currentUserId] || [];
        
        if (messages.length === 0) {
            this.elements.messagesContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>ยังไม่มีข้อความ</p>
                </div>
            `;
            return;
        }
        
        const html = messages.map((msg, index) => {
            const showDate = index === 0 || this.shouldShowDateDivider(messages[index - 1], msg);
            return this.createMessageHTML(msg, showDate);
        }).join('');
        
        this.elements.messagesContainer.innerHTML = html;
        this.scrollToBottom();
        
        // Attach image click listeners
        this.elements.messagesContainer.querySelectorAll('.message-image').forEach(img => {
            img.addEventListener('click', () => {
                this.openImageViewer(img.src);
            });
        });
    }
    
    /**
     * Check if should show date divider
     */
    shouldShowDateDivider(prevMsg, currentMsg) {
        if (!prevMsg) return true;
        
        const prevDate = new Date(prevMsg.timestamp).toDateString();
        const currentDate = new Date(currentMsg.timestamp).toDateString();
        
        return prevDate !== currentDate;
    }
    
    /**
     * Create HTML for a message
     */
    createMessageHTML(message, showDate = false) {
        const isSent = message.role === 'assistant' || message.source === 'admin_chat';
        const senderName = isSent ? 'คุณ' : (message.senderName || 'ผู้ใช้');
        const time = this.formatTime(message.timestamp);
        const initial = senderName.charAt(0).toUpperCase();
        
        let dateDivider = '';
        if (showDate) {
            const dateStr = this.formatDate(message.timestamp);
            dateDivider = `
                <div class="date-divider">
                    <span>${dateStr}</span>
                </div>
            `;
        }
        
        // Extract message content
        let messageContent = '';
        if (message.content) {
            messageContent = this.escapeHtml(message.content);
        } else if (message.text) {
            messageContent = this.escapeHtml(message.text);
        }
        
        // Handle images
        let imageHTML = '';
        if (message.image || message.imageUrl) {
            const imgSrc = message.image || message.imageUrl;
            imageHTML = `<img src="${this.escapeHtml(imgSrc)}" alt="รูปภาพ" class="message-image">`;
        }
        
        return `
            ${dateDivider}
            <div class="message-item ${isSent ? 'sent' : ''}">
                <div class="message-avatar">
                    ${this.escapeHtml(initial)}
                </div>
                <div class="message-content-wrapper">
                    <div class="message-bubble">
                        ${imageHTML}
                        ${messageContent ? `<div class="message-text">${messageContent}</div>` : ''}
                    </div>
                    <div class="message-time">${this.escapeHtml(time)}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Handle new message from Socket.IO
     */
    handleNewMessage(data) {
        const userId = data.userId;
        
        // Update user in list
        const user = this.users.find(u => u.userId === userId);
        if (user) {
            user.lastMessage = data.message?.content || data.message?.text || '';
            user.lastTimestamp = data.timestamp || new Date().toISOString();
            
            if (userId !== this.currentUserId && data.sender === 'user') {
                user.unreadCount = (user.unreadCount || 0) + 1;
            }
            
            this.renderUserList();
        }
        
        // Update messages if this is the current chat
        if (userId === this.currentUserId) {
            if (!this.messages[userId]) {
                this.messages[userId] = [];
            }
            this.messages[userId].push(data.message);
            this.renderMessages();
        }
    }
    
    /**
     * Handle message input change
     */
    handleInputChange(e) {
        const length = e.target.value.length;
        
        if (this.elements.charCount) {
            this.elements.charCount.textContent = length;
        }
        
        // Auto-resize textarea
        this.autoResizeTextarea(e.target);
        
        // Validate length
        if (length > this.config.maxMessageLength) {
            e.target.value = e.target.value.substring(0, this.config.maxMessageLength);
        }
    }
    
    /**
     * Auto resize textarea
     */
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
    
    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(e) {
        // Enter to send (without Shift)
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }
    
    /**
     * Send message
     */
    async sendMessage() {
        if (!this.currentUserId) {
            this.showToast('กรุณาเลือกผู้ใช้ก่อน', 'warning');
            return;
        }
        
        const message = this.elements.messageInput.value.trim();
        
        if (!message) {
            return;
        }
        
        try {
            const response = await fetch('/admin/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    message: message
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Clear input
                this.elements.messageInput.value = '';
                this.elements.charCount.textContent = '0';
                this.autoResizeTextarea(this.elements.messageInput);
                
                // Add message to local state
                const newMessage = {
                    content: message,
                    role: 'assistant',
                    source: 'admin_chat',
                    timestamp: new Date().toISOString()
                };
                
                if (!this.messages[this.currentUserId]) {
                    this.messages[this.currentUserId] = [];
                }
                this.messages[this.currentUserId].push(newMessage);
                
                // Re-render
                this.renderMessages();
                this.loadUsers();
                
                this.showToast('ส่งข้อความสำเร็จ', 'success');
            } else {
                throw new Error(data.error || 'Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('ไม่สามารถส่งข้อความได้', 'error');
        }
    }
    
    /**
     * Clear chat history
     */
    async clearChat() {
        if (!this.currentUserId) return;
        
        if (!confirm('คุณแน่ใจหรือไม่ที่จะล้างประวัติการสนทนา?')) {
            return;
        }
        
        try {
            const response = await fetch(`/admin/chat/clear/${this.currentUserId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.messages[this.currentUserId] = [];
                this.renderMessages();
                this.loadUsers();
                this.showToast('ล้างประวัติสำเร็จ', 'success');
            } else {
                throw new Error(data.error || 'Failed to clear chat');
            }
        } catch (error) {
            console.error('Error clearing chat:', error);
            this.showToast('ไม่สามารถล้างประวัติได้', 'error');
        }
    }
    
    /**
     * Toggle sidebar (mobile)
     */
    toggleSidebar() {
        if (!this.elements.sidebar) return;
        
        const isOpen = this.elements.sidebar.classList.contains('show');
        
        if (isOpen) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }
    
    /**
     * Open sidebar
     */
    openSidebar() {
        if (this.elements.sidebar) {
            this.elements.sidebar.classList.add('show');
        }
        if (this.elements.sidebarOverlay) {
            this.elements.sidebarOverlay.classList.add('show');
        }
    }
    
    /**
     * Close sidebar
     */
    closeSidebar() {
        if (this.elements.sidebar) {
            this.elements.sidebar.classList.remove('show');
        }
        if (this.elements.sidebarOverlay) {
            this.elements.sidebarOverlay.classList.remove('show');
        }
    }
    
    /**
     * Toggle user info panel
     */
    toggleUserInfo() {
        const panel = document.getElementById('userInfoPanel');
        if (panel) {
            panel.classList.toggle('show');
        }
    }
    
    /**
     * Close user info panel
     */
    closeUserInfo() {
        const panel = document.getElementById('userInfoPanel');
        if (panel) {
            panel.classList.remove('show');
        }
    }
    
    /**
     * Open image viewer
     */
    openImageViewer(imageSrc) {
        if (this.elements.imageViewerImg) {
            this.elements.imageViewerImg.src = imageSrc;
        }
        
        const modal = new bootstrap.Modal(this.elements.imageViewerModal);
        modal.show();
        
        // Download button
        const btnDownload = document.getElementById('btnDownloadImage');
        if (btnDownload) {
            btnDownload.onclick = () => {
                this.downloadImage(imageSrc);
            };
        }
    }
    
    /**
     * Download image
     */
    downloadImage(imageSrc) {
        const link = document.createElement('a');
        link.href = imageSrc;
        link.download = `image_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showToast('กำลังดาวน์โหลดรูปภาพ', 'success');
    }
    
    /**
     * Scroll messages to bottom
     */
    scrollToBottom(smooth = true) {
        if (!this.elements.messagesContainer) return;
        
        const behavior = smooth ? 'smooth' : 'auto';
        this.elements.messagesContainer.scrollTo({
            top: this.elements.messagesContainer.scrollHeight,
            behavior: behavior
        });
    }
    
    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        if (!this.elements.toast || !this.elements.toastMessage) return;
        
        this.elements.toastMessage.textContent = message;
        
        // Update icon based on type
        const icon = this.elements.toast.querySelector('.toast-header i');
        if (icon) {
            icon.className = `fas ${
                type === 'success' ? 'fa-check-circle text-success' :
                type === 'error' ? 'fa-exclamation-circle text-danger' :
                type === 'warning' ? 'fa-exclamation-triangle text-warning' :
                'fa-info-circle text-primary'
            } me-2`;
        }
        
        const toast = new bootstrap.Toast(this.elements.toast);
        toast.show();
    }
    
    /**
     * Utility: Escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Utility: Truncate text
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    /**
     * Utility: Format time
     */
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    /**
     * Utility: Format date
     */
    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'วันนี้';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'เมื่อวาน';
        } else {
            return date.toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }
    
    /**
     * Utility: Get time ago string
     */
    getTimeAgo(timestamp) {
        if (!timestamp) return '';
        
        const now = new Date();
        const date = new Date(timestamp);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'เมื่อสักครู่';
        if (diffMins < 60) return `${diffMins} นาที`;
        if (diffHours < 24) return `${diffHours} ชม.`;
        if (diffDays < 7) return `${diffDays} วัน`;
        
        return date.toLocaleDateString('th-TH', {
            month: 'short',
            day: 'numeric'
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.modernChat = new ModernChat();
});

// Global helper functions for backwards compatibility
window.showSuccess = (message) => {
    if (window.modernChat) {
        window.modernChat.showToast(message, 'success');
    }
};

window.showError = (message) => {
    if (window.modernChat) {
        window.modernChat.showToast(message, 'error');
    }
};

window.showWarning = (message) => {
    if (window.modernChat) {
        window.modernChat.showToast(message, 'warning');
    }
};

