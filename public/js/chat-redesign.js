// Chat Redesign - Professional Chat Manager
// Focused on excellent UX and ease of use

class ChatManager {
    constructor() {
        // Core properties
        this.socket = null;
        this.currentUserId = null;
        this.users = [];
        this.allUsers = [];
        this.chatHistory = {};
        
        // Filter state
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: ''
        };
        
        // Tags
        this.availableTags = [];
        
        // Follow-up config
        this.followUpConfig = {
            analysisEnabled: true,
            showInChat: true
        };
        
        // Initialize
        this.init();
    }
    
    init() {
        console.log('Initializing Chat Manager...');
        this.initializeSocket();
        this.setupEventListeners();
        this.loadUsers();
        this.loadAvailableTags();
        this.setupAutoRefresh();
    }
    
    // ========================================
    // Socket.IO
    // ========================================
    
    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('✅ Socket.IO connected');
            this.showToast('เชื่อมต่อสำเร็จ', 'success');
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Socket.IO disconnected');
            this.showToast('การเชื่อมต่อขาดหาย', 'warning');
        });
        
        this.socket.on('newMessage', (data) => {
            console.log('📨 New message:', data);
            this.handleNewMessage(data);
        });
        
        this.socket.on('followUpTagged', (data) => {
            console.log('⭐ Follow-up tagged:', data);
            this.handleFollowUpTagged(data);
        });
        
        this.socket.on('chatCleared', (data) => {
            console.log('🗑️ Chat cleared:', data);
            if (data.userId === this.currentUserId) {
                this.clearChatDisplay();
            }
            this.loadUsers();
        });
        
        this.socket.on('userTagsUpdated', (data) => {
            console.log('🏷️ Tags updated:', data);
            const user = this.allUsers.find(u => u.userId === data.userId);
            if (user) {
                user.tags = data.tags || [];
                this.applyFilters();
            }
        });
        
        this.socket.on('userPurchaseStatusUpdated', (data) => {
            console.log('🛒 Purchase status updated:', data);
            const user = this.allUsers.find(u => u.userId === data.userId);
            if (user) {
                user.hasPurchased = data.hasPurchased;
                this.applyFilters();
            }
        });
    }
    
    // ========================================
    // Event Listeners
    // ========================================
    
    setupEventListeners() {
        // Search
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            userSearch.addEventListener('input', (e) => {
                this.currentFilters.search = e.target.value.trim();
                this.applyFilters();
            });
        }
        
        // Filter toggle
        const filterToggle = document.getElementById('filterToggle');
        const filterPanel = document.getElementById('filterPanel');
        if (filterToggle && filterPanel) {
            filterToggle.addEventListener('click', () => {
                const isVisible = filterPanel.style.display !== 'none';
                filterPanel.style.display = isVisible ? 'none' : 'block';
            });
        }
        
        // Clear filters
        const clearFilters = document.getElementById('clearFilters');
        if (clearFilters) {
            clearFilters.addEventListener('click', () => {
                this.clearFilters();
            });
        }
        
        // Status filter buttons
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentFilters.status = filter;
                this.applyFilters();
            });
        });
        
        // Sidebar toggle (mobile)
        const toggleSidebar = document.getElementById('toggleSidebar');
        const closeSidebar = document.getElementById('closeSidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const chatSidebar = document.getElementById('chatSidebar');
        
        if (toggleSidebar) {
            toggleSidebar.addEventListener('click', () => {
                chatSidebar.classList.add('show');
                sidebarOverlay.classList.add('show');
            });
        }
        
        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => {
                chatSidebar.classList.remove('show');
                sidebarOverlay.classList.remove('show');
            });
        }
        
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                chatSidebar.classList.remove('show');
                sidebarOverlay.classList.remove('show');
            });
        }
        
        // Message input
        const messageInput = document.getElementById('messageInput');
        const btnSend = document.getElementById('btnSend');
        const charCount = document.getElementById('charCount');
        
        if (messageInput) {
            messageInput.addEventListener('input', (e) => {
                // Update character count
                if (charCount) {
                    charCount.textContent = e.target.value.length;
                }
                
                // Auto-resize textarea
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
            });
            
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        
        if (btnSend) {
            btnSend.addEventListener('click', () => {
                this.sendMessage();
            });
        }
        
        // Header actions
        const btnTogglePurchase = document.getElementById('btnTogglePurchase');
        const btnManageTags = document.getElementById('btnManageTags');
        const btnToggleAI = document.getElementById('btnToggleAI');
        const btnClearChat = document.getElementById('btnClearChat');
        
        if (btnTogglePurchase) {
            btnTogglePurchase.addEventListener('click', () => {
                this.togglePurchaseStatus();
            });
        }
        
        if (btnManageTags) {
            btnManageTags.addEventListener('click', () => {
                this.openTagModal();
            });
        }
        
        if (btnToggleAI) {
            btnToggleAI.addEventListener('click', () => {
                this.toggleAI();
            });
        }
        
        if (btnClearChat) {
            btnClearChat.addEventListener('click', () => {
                this.clearChat();
            });
        }
        
        // Template button
        const btnTemplate = document.getElementById('btnTemplate');
        if (btnTemplate) {
            btnTemplate.addEventListener('click', () => {
                this.openTemplateModal();
            });
        }
        
        // Image modal
        const downloadImage = document.getElementById('downloadImage');
        if (downloadImage) {
            downloadImage.addEventListener('click', () => {
                this.downloadImage();
            });
        }
        
        // Tag modal
        const addTagBtn = document.getElementById('addTagBtn');
        const newTagInput = document.getElementById('newTagInput');
        
        if (addTagBtn && newTagInput) {
            addTagBtn.addEventListener('click', () => {
                this.addTag(newTagInput.value.trim());
            });
            
            newTagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addTag(newTagInput.value.trim());
                }
            });
        }
    }
    
    // ========================================
    // User Management
    // ========================================
    
    async loadUsers() {
        try {
            const response = await fetch('/admin/chat/users');
            const data = await response.json();
            
            if (data.success) {
                this.allUsers = data.users || [];
                this.applyFilters();
            } else {
                this.showToast('ไม่สามารถโหลดรายชื่อผู้ใช้ได้', 'error');
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        }
    }
    
    applyFilters() {
        let filtered = [...this.allUsers];
        
        // Status filter
        if (this.currentFilters.status !== 'all') {
            filtered = filtered.filter(user => {
                switch (this.currentFilters.status) {
                    case 'unread':
                        return user.unreadCount > 0;
                    case 'followup':
                        return user.followUp && user.followUp.isFollowUp;
                    case 'purchased':
                        return user.hasPurchased;
                    default:
                        return true;
                }
            });
        }
        
        // Tag filter
        if (this.currentFilters.tags.length > 0) {
            filtered = filtered.filter(user => {
                return user.tags && user.tags.some(tag => 
                    this.currentFilters.tags.includes(tag)
                );
            });
        }
        
        // Search filter
        if (this.currentFilters.search) {
            const search = this.currentFilters.search.toLowerCase();
            filtered = filtered.filter(user => {
                return (
                    (user.displayName && user.displayName.toLowerCase().includes(search)) ||
                    (user.userId && user.userId.toLowerCase().includes(search))
                );
            });
        }
        
        this.users = filtered;
        this.renderUserList();
        this.updateFilterBadge();
    }
    
    renderUserList() {
        const userList = document.getElementById('userList');
        const userCountBadge = document.getElementById('userCountBadge');
        const filteredCount = document.getElementById('filteredCount');
        
        if (!userList) return;
        
        // Update counts
        if (userCountBadge) {
            userCountBadge.textContent = this.users.length;
        }
        if (filteredCount) {
            filteredCount.textContent = this.users.length;
        }
        
        // Render users
        if (this.users.length === 0) {
            userList.innerHTML = `
                <div class="empty-state" style="padding: 2rem;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--text-tertiary); margin-bottom: 1rem;"></i>
                    <p style="color: var(--text-secondary);">ไม่พบผู้ใช้</p>
                </div>
            `;
            return;
        }
        
        userList.innerHTML = this.users.map(user => this.renderUserItem(user)).join('');
    }
    
    renderUserItem(user) {
        const isActive = user.userId === this.currentUserId;
        const hasUnread = user.unreadCount > 0;
        const isPurchased = user.hasPurchased;
        const isFollowUp = user.followUp && user.followUp.isFollowUp;
        const aiEnabled = user.aiEnabled !== false;
        
        const avatar = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';
        const lastMessage = user.lastMessage ? this.truncateText(user.lastMessage, 50) : 'ไม่มีข้อความ';
        const time = user.lastMessageTime ? this.formatRelativeTime(user.lastMessageTime) : '';
        
        const badges = [];
        if (aiEnabled) badges.push('<span class="badge-sm badge-ai">AI</span>');
        if (isFollowUp) badges.push('<span class="badge-sm badge-followup">ติดตาม</span>');
        if (isPurchased) badges.push('<span class="badge-sm badge-purchased">ซื้อแล้ว</span>');
        
        const tags = user.tags && user.tags.length > 0 
            ? user.tags.slice(0, 2).map(tag => 
                `<span class="tag-badge">${this.escapeHtml(tag)}</span>`
              ).join('')
            : '';
        
        return `
            <div class="user-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}" 
                 onclick="chatManager.selectUser('${user.userId}')">
                <div class="user-avatar ${isPurchased ? 'purchased' : ''}">${avatar}</div>
                <div class="user-item-content">
                    <div class="user-item-header">
                        <div class="user-name">${this.escapeHtml(user.displayName || user.userId)}</div>
                        <div class="user-time">${time}</div>
                    </div>
                    <div class="user-last-message">${this.escapeHtml(lastMessage)}</div>
                    ${badges.length > 0 ? `<div class="user-badges">${badges.join('')}</div>` : ''}
                    ${tags ? `<div class="user-tags">${tags}</div>` : ''}
                </div>
                ${hasUnread ? `<div class="unread-count">${user.unreadCount}</div>` : ''}
            </div>
        `;
    }
    
    async selectUser(userId) {
        this.currentUserId = userId;
        
        // Close sidebar on mobile
        const chatSidebar = document.getElementById('chatSidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (chatSidebar) chatSidebar.classList.remove('show');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
        
        // Update UI
        this.renderUserList();
        this.updateChatHeader();
        this.showMessageInput();
        
        // Load chat history
        await this.loadChatHistory(userId);
        
        // Mark as read
        this.markAsRead(userId);
    }
    
    updateChatHeader() {
        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;
        
        const chatAvatar = document.getElementById('chatAvatar');
        const chatUserName = document.getElementById('chatUserName');
        const chatUserMeta = document.getElementById('chatUserMeta');
        const chatHeaderActions = document.getElementById('chatHeaderActions');
        const messageCount = document.getElementById('messageCount');
        
        const avatar = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';
        const isPurchased = user.hasPurchased;
        
        if (chatAvatar) {
            chatAvatar.innerHTML = avatar;
            chatAvatar.className = `chat-avatar ${isPurchased ? 'purchased' : ''}`;
        }
        
        if (chatUserName) {
            chatUserName.textContent = user.displayName || user.userId;
        }
        
        if (chatUserMeta) {
            const messages = this.chatHistory[this.currentUserId] || [];
            if (messageCount) {
                messageCount.textContent = messages.length;
            }
        }
        
        if (chatHeaderActions) {
            chatHeaderActions.style.display = 'flex';
        }
    }
    
    showMessageInput() {
        const messageInputArea = document.getElementById('messageInputArea');
        const emptyState = document.getElementById('emptyState');
        
        if (messageInputArea) {
            messageInputArea.style.display = 'block';
        }
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }
    
    // ========================================
    // Chat History
    // ========================================
    
    async loadChatHistory(userId) {
        try {
            const response = await fetch(`/admin/chat/history/${userId}`);
            const data = await response.json();
            
            if (data.success) {
                this.chatHistory[userId] = data.messages || [];
                this.renderMessages();
            } else {
                this.showToast('ไม่สามารถโหลดประวัติการสนทนาได้', 'error');
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
            this.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        }
    }
    
    renderMessages() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        const messages = this.chatHistory[this.currentUserId] || [];
        
        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <h5>ยังไม่มีข้อความ</h5>
                    <p>เริ่มต้นการสนทนาด้วยการส่งข้อความแรก</p>
                </div>
            `;
            return;
        }
        
        messagesContainer.innerHTML = messages.map(msg => this.renderMessage(msg)).join('');
        
        // Scroll to bottom
        this.scrollToBottom();
    }
    
    renderMessage(message) {
        const role = message.role || 'user';
        const content = this.escapeHtml(message.content || '');
        const time = message.timestamp ? this.formatTime(message.timestamp) : '';
        
        const roleLabels = {
            user: 'ผู้ใช้',
            admin: 'แอดมิน',
            assistant: 'AI'
        };
        
        const roleLabel = roleLabels[role] || role;
        
        let imagesHtml = '';
        if (message.images && message.images.length > 0) {
            imagesHtml = `
                <div class="message-images">
                    ${message.images.map(img => `
                        <div class="message-image" onclick="chatManager.showImageModal('${img}')">
                            <img src="${img}" alt="รูปภาพ" loading="lazy">
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        return `
            <div class="message ${role}">
                <div class="message-bubble">
                    <div class="message-header">
                        <i class="fas fa-${role === 'user' ? 'user' : role === 'admin' ? 'user-shield' : 'robot'}"></i>
                        ${roleLabel}
                    </div>
                    <div class="message-content">${content}</div>
                    ${imagesHtml}
                    <div class="message-time">${time}</div>
                </div>
            </div>
        `;
    }
    
    scrollToBottom() {
        const messagesWrapper = document.getElementById('messagesWrapper');
        if (messagesWrapper) {
            setTimeout(() => {
                messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
            }, 100);
        }
    }
    
    // ========================================
    // Send Message
    // ========================================
    
    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        if (!messageInput || !this.currentUserId) return;
        
        const message = messageInput.value.trim();
        if (!message) return;
        
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
                messageInput.value = '';
                messageInput.style.height = 'auto';
                document.getElementById('charCount').textContent = '0';
                
                // Add message to chat
                if (!this.chatHistory[this.currentUserId]) {
                    this.chatHistory[this.currentUserId] = [];
                }
                this.chatHistory[this.currentUserId].push(data.message);
                this.renderMessages();
                
                // Update user list
                this.loadUsers();
            } else {
                this.showToast('ไม่สามารถส่งข้อความได้', 'error');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('เกิดข้อผิดพลาดในการส่งข้อความ', 'error');
        }
    }
    
    // ========================================
    // Actions
    // ========================================
    
    async togglePurchaseStatus() {
        if (!this.currentUserId) return;
        
        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;
        
        const newStatus = !user.hasPurchased;
        
        try {
            const response = await fetch('/admin/chat/purchase-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    hasPurchased: newStatus
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                user.hasPurchased = newStatus;
                this.renderUserList();
                this.updateChatHeader();
                this.showToast(newStatus ? 'ทำเครื่องหมายว่าซื้อแล้ว' : 'ยกเลิกเครื่องหมายซื้อแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถอัปเดตสถานะได้', 'error');
            }
        } catch (error) {
            console.error('Error toggling purchase status:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }
    
    async toggleAI() {
        if (!this.currentUserId) return;
        
        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;
        
        const currentStatus = user.aiEnabled !== false;
        const newStatus = !currentStatus;
        
        try {
            const response = await fetch('/admin/chat/user-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    aiEnabled: newStatus
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                user.aiEnabled = newStatus;
                this.renderUserList();
                this.updateChatHeader();
                this.showToast(newStatus ? 'เปิด AI แล้ว' : 'ปิด AI แล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถอัปเดตสถานะ AI ได้', 'error');
            }
        } catch (error) {
            console.error('Error toggling AI:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }
    
    async clearChat() {
        if (!this.currentUserId) return;
        
        if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติการสนทนาทั้งหมด?')) {
            return;
        }
        
        try {
            const response = await fetch(`/admin/chat/clear/${this.currentUserId}`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.clearChatDisplay();
                this.showToast('ล้างประวัติการสนทนาแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถล้างประวัติได้', 'error');
            }
        } catch (error) {
            console.error('Error clearing chat:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }
    
    clearChatDisplay() {
        this.chatHistory[this.currentUserId] = [];
        this.renderMessages();
    }
    
    // ========================================
    // Tag Management
    // ========================================
    
    async loadAvailableTags() {
        try {
            const response = await fetch('/admin/chat/tags');
            const data = await response.json();
            
            if (data.success) {
                this.availableTags = data.tags || [];
                this.renderTagFilters();
            }
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    }
    
    renderTagFilters() {
        const tagFilters = document.getElementById('tagFilters');
        if (!tagFilters) return;
        
        if (this.availableTags.length === 0) {
            tagFilters.innerHTML = '<span class="no-tags">ไม่มีแท็ก</span>';
            return;
        }
        
        tagFilters.innerHTML = this.availableTags.slice(0, 10).map(tag => `
            <button class="tag-filter-btn" onclick="chatManager.toggleTagFilter('${this.escapeHtml(tag)}')">
                ${this.escapeHtml(tag)}
            </button>
        `).join('');
    }
    
    toggleTagFilter(tag) {
        const index = this.currentFilters.tags.indexOf(tag);
        if (index > -1) {
            this.currentFilters.tags.splice(index, 1);
        } else {
            this.currentFilters.tags.push(tag);
        }
        
        this.applyFilters();
        this.renderTagFilters();
        
        // Update active state
        document.querySelectorAll('.tag-filter-btn').forEach(btn => {
            if (btn.textContent.trim() === tag) {
                btn.classList.toggle('active', this.currentFilters.tags.includes(tag));
            }
        });
    }
    
    openTagModal() {
        if (!this.currentUserId) return;
        
        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;
        
        const modal = new bootstrap.Modal(document.getElementById('tagModal'));
        const tagModalUserName = document.getElementById('tagModalUserName');
        const currentTags = document.getElementById('currentTags');
        const popularTags = document.getElementById('popularTags');
        const newTagInput = document.getElementById('newTagInput');
        
        if (tagModalUserName) {
            tagModalUserName.textContent = user.displayName || user.userId;
        }
        
        if (currentTags) {
            if (user.tags && user.tags.length > 0) {
                currentTags.innerHTML = user.tags.map(tag => `
                    <span class="tag-item">
                        ${this.escapeHtml(tag)}
                        <button class="btn-remove-tag" onclick="chatManager.removeTag('${this.escapeHtml(tag)}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </span>
                `).join('');
            } else {
                currentTags.innerHTML = '<span class="text-muted">ไม่มีแท็ก</span>';
            }
        }
        
        if (popularTags) {
            if (this.availableTags.length > 0) {
                popularTags.innerHTML = this.availableTags.slice(0, 10).map(tag => `
                    <span class="tag-item" style="cursor: pointer;" onclick="chatManager.addTag('${this.escapeHtml(tag)}')">
                        ${this.escapeHtml(tag)}
                    </span>
                `).join('');
            } else {
                popularTags.innerHTML = '<span class="text-muted">ไม่มีแท็ก</span>';
            }
        }
        
        if (newTagInput) {
            newTagInput.value = '';
        }
        
        modal.show();
    }
    
    async addTag(tag) {
        if (!tag || !this.currentUserId) return;
        
        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;
        
        const tags = user.tags || [];
        if (tags.includes(tag)) {
            this.showToast('แท็กนี้มีอยู่แล้ว', 'warning');
            return;
        }
        
        tags.push(tag);
        
        try {
            const response = await fetch('/admin/chat/tags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    tags: tags
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                user.tags = tags;
                this.loadAvailableTags();
                this.openTagModal();
                this.showToast('เพิ่มแท็กแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถเพิ่มแท็กได้', 'error');
            }
        } catch (error) {
            console.error('Error adding tag:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }
    
    async removeTag(tag) {
        if (!this.currentUserId) return;
        
        const user = this.users.find(u => u.userId === this.currentUserId);
        if (!user) return;
        
        const tags = (user.tags || []).filter(t => t !== tag);
        
        try {
            const response = await fetch('/admin/chat/tags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    tags: tags
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                user.tags = tags;
                this.loadAvailableTags();
                this.openTagModal();
                this.showToast('ลบแท็กแล้ว', 'success');
            } else {
                this.showToast('ไม่สามารถลบแท็กได้', 'error');
            }
        } catch (error) {
            console.error('Error removing tag:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }
    
    // ========================================
    // Template Modal
    // ========================================
    
    openTemplateModal() {
        // TODO: Implement template modal
        this.showToast('ฟีเจอร์ Template กำลังพัฒนา', 'info');
    }
    
    // ========================================
    // Image Modal
    // ========================================
    
    showImageModal(imageUrl) {
        const modal = new bootstrap.Modal(document.getElementById('imageModal'));
        const modalImage = document.getElementById('modalImage');
        
        if (modalImage) {
            modalImage.src = imageUrl;
        }
        
        modal.show();
    }
    
    downloadImage() {
        const modalImage = document.getElementById('modalImage');
        if (!modalImage || !modalImage.src) return;
        
        const link = document.createElement('a');
        link.href = modalImage.src;
        link.download = 'image.jpg';
        link.click();
    }
    
    // ========================================
    // Socket.IO Handlers
    // ========================================
    
    handleNewMessage(data) {
        const { userId, message } = data;
        
        // Add to chat history
        if (!this.chatHistory[userId]) {
            this.chatHistory[userId] = [];
        }
        this.chatHistory[userId].push(message);
        
        // Update UI if this is the current chat
        if (userId === this.currentUserId) {
            this.renderMessages();
        }
        
        // Update user list
        this.loadUsers();
    }
    
    handleFollowUpTagged(data) {
        const user = this.allUsers.find(u => u.userId === data.userId);
        if (user) {
            user.followUp = data.followUp;
            this.applyFilters();
        }
    }
    
    async markAsRead(userId) {
        try {
            await fetch(`/admin/chat/mark-read/${userId}`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    }
    
    // ========================================
    // Filters
    // ========================================
    
    clearFilters() {
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: ''
        };
        
        // Reset UI
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === 'all');
        });
        
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            userSearch.value = '';
        }
        
        this.renderTagFilters();
        this.applyFilters();
    }
    
    updateFilterBadge() {
        const filterBadge = document.getElementById('filterBadge');
        if (!filterBadge) return;
        
        let count = 0;
        if (this.currentFilters.status !== 'all') count++;
        count += this.currentFilters.tags.length;
        if (this.currentFilters.search) count++;
        
        if (count > 0) {
            filterBadge.textContent = count;
            filterBadge.style.display = 'block';
        } else {
            filterBadge.style.display = 'none';
        }
    }
    
    // ========================================
    // Auto Refresh
    // ========================================
    
    setupAutoRefresh() {
        // Refresh user list every 30 seconds
        setInterval(() => {
            if (!document.hidden) {
                this.loadUsers();
            }
        }, 30000);
    }
    
    // ========================================
    // Utility Functions
    // ========================================
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    formatRelativeTime(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diff = now - time;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (seconds < 60) return 'เมื่อสักครู่';
        if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
        if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
        if (days < 7) return `${days} วันที่แล้ว`;
        
        return time.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short'
        });
    }
    
    formatTime(timestamp) {
        const time = new Date(timestamp);
        return time.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    showToast(message, type = 'info') {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#00c851' : type === 'error' ? '#ff4444' : type === 'warning' ? '#ffbb33' : '#33b5e5'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

