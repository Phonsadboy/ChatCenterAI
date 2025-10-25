// Chat New UI JavaScript - Minimal & Clean Implementation

class ChatManager {
    constructor() {
        this.socket = null;
        this.currentUserId = null;
        this.users = [];
        this.allUsers = []; // เก็บข้อมูลผู้ใช้ทั้งหมดก่อนการกรอง
        this.chatHistory = {};
        this.isLoading = false;
        this.availableTags = []; // เก็บแท็กที่มีในระบบ
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: ''
        };
        this.closeSidebarForMobile = () => {};
        this.mobileMediaQuery = null;
        this.updateAppHeight = this.updateAppHeight.bind(this);
        const followUpConfig = window.chatCenterFollowUpConfig || {};
        this.followUpOptions = {
            analysisEnabled: typeof followUpConfig.analysisEnabled === 'boolean' ? followUpConfig.analysisEnabled : true,
            showInChat: typeof followUpConfig.showInChat === 'boolean' ? followUpConfig.showInChat : true
        };
        
        // ✅ Initialize performance utilities
        this.optimizedFetch = new window.performanceUtils.OptimizedFetch();
        this.lazyLoader = new window.performanceUtils.LazyImageLoader();
        this.smartPoller = null;
        
        // ✅ Debounced search
        this.debouncedSearch = this.debounce(this.performSearch.bind(this), 300);
        
        this.init();
    }

    // Debounce utility
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    setupViewportHeightObserver() {
        this.updateAppHeight();

        window.addEventListener('resize', this.updateAppHeight);
        window.addEventListener('focusin', this.updateAppHeight);
        window.addEventListener('focusout', this.updateAppHeight);

        window.addEventListener('orientationchange', () => {
            window.setTimeout(this.updateAppHeight, 150);
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.updateAppHeight, { passive: true });
            window.visualViewport.addEventListener('scroll', this.updateAppHeight, { passive: true });
        }
    }

    updateAppHeight() {
        window.requestAnimationFrame(() => {
            const height = window.innerHeight;
            if (height && height > 0) {
                document.documentElement.style.setProperty('--app-height', `${height}px`);
            }
        });
    }

    async toggleAiForCurrent() {
        if (!this.currentUserId) return;
        try {
            // อ่านสถานะปัจจุบันจาก this.users
            const user = this.users.find(u => u.userId === this.currentUserId) || {};
            let current = typeof user.aiEnabled !== 'undefined' ? !!user.aiEnabled : null;
            if (current === null) {
                const res = await fetch(`/admin/chat/user-status/${this.currentUserId}`);
                const data = await res.json();
                current = data.success ? !!data.aiEnabled : true;
            }

            const desired = !current;
            const resp = await fetch('/admin/chat/user-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: this.currentUserId, aiEnabled: desired })
            });
            const data = await resp.json();
            if (data.success) {
                // อัปเดตรายชื่อผู้ใช้และ header
                await this.loadUsers();
                const res2 = await fetch(`/admin/chat/user-status/${this.currentUserId}`);
                const upd = await res2.json();
                if (upd.success) {
                    const u = this.users.find(x => x.userId === this.currentUserId) || {};
                    u.aiEnabled = !!upd.aiEnabled;
                    this.updateChatHeader(u);
                }
                window.showSuccess(desired ? 'เปิด AI สำหรับผู้ใช้นี้แล้ว' : 'ปิด AI สำหรับผู้ใช้นี้ชั่วคราวแล้ว');
            } else {
                window.showError('ไม่สามารถอัปเดตสถานะ AI ได้: ' + data.error);
            }
        } catch (err) {
            console.error('toggleAiForCurrent error', err);
            window.errorHandler.handleApiError(err);
        }
    }

    init() {
        this.setupViewportHeightObserver();
        this.initializeSocket();
        this.setupEventListeners();
        this.setupFilterListeners();
        this.setupTagModalListeners();
        this.loadUsers();
        this.loadAvailableTags();
        this.setupAutoRefresh();
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('เชื่อมต่อ Socket.IO สำเร็จ');
            window.showSuccess('เชื่อมต่อสำเร็จ');
        });

        this.socket.on('disconnect', () => {
            console.log('การเชื่อมต่อ Socket.IO ถูกตัด');
            window.showWarning('การเชื่อมต่อถูกตัด');
        });

        this.socket.on('newMessage', (data) => {
            console.log('ข้อความใหม่:', data);
            this.handleNewMessage(data);
        });

        this.socket.on('followUpTagged', (data) => {
            console.log('อัปเดตสถานะติดตาม:', data);
            this.handleFollowUpTagged(data);
        });

        this.socket.on('chatCleared', (data) => {
            if (data.userId === this.currentUserId) {
                this.clearChatDisplay();
            }
            this.loadUsers();
        });

        // Listen for tag and purchase status updates
        this.socket.on('userTagsUpdated', (data) => {
            const user = this.allUsers.find(u => u.userId === data.userId);
            if (user) {
                user.tags = data.tags || [];
                this.applyFilters();
            }
        });

        this.socket.on('userPurchaseStatusUpdated', (data) => {
            const user = this.allUsers.find(u => u.userId === data.userId);
            if (user) {
                user.hasPurchased = data.hasPurchased;
                this.applyFilters();
            }
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
            
            // ปรับขนาด textarea อัตโนมัติ
            this.autoResizeTextarea(e.target);
        });

        messageInput.addEventListener('keydown', (e) => {
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

    setupFilterListeners() {
        // Search input
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            userSearch.addEventListener('input', (e) => {
                this.currentFilters.search = e.target.value.trim();
                this.debouncedSearch();
            });
        }

        // Filter toggle button
        const filterToggle = document.getElementById('filterToggle');
        const filterOptions = document.getElementById('filterOptions');
        if (filterToggle && filterOptions) {
            filterToggle.addEventListener('click', () => {
                const isVisible = filterOptions.style.display !== 'none';
                filterOptions.style.display = isVisible ? 'none' : 'block';
            });
        }

        // Clear filters button
        const clearFilters = document.getElementById('clearFilters');
        if (clearFilters) {
            clearFilters.addEventListener('click', () => {
                this.clearAllFilters();
            });
        }

        // Status filter buttons
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                if (filter) {
                    // Toggle active class
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.currentFilters.status = filter;
                    this.applyFilters();
                }
            });
        });

        // Sidebar toggle for mobile
        const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
        const userSidebar = document.getElementById('userSidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const sidebarCloseBtn = document.getElementById('toggleSidebar');

        const mediaQuery = window.matchMedia('(max-width: 991.98px)');
        this.mobileMediaQuery = mediaQuery;
        const isMobile = () => mediaQuery.matches;

        const setToggleAria = (isOpen) => {
            if (!sidebarToggleBtn) return;
            sidebarToggleBtn.setAttribute('aria-expanded', String(isOpen));
            sidebarToggleBtn.setAttribute('aria-label', isOpen ? 'ปิดรายการแชท' : 'เปิดรายการแชท');
        };

        const openSidebar = () => {
            if (!userSidebar || !isMobile()) return;
            userSidebar.classList.add('show');
            if (sidebarOverlay) sidebarOverlay.classList.add('show');
            document.body.classList.add('sidebar-open');
            setToggleAria(true);
        };

        const closeSidebar = () => {
            if (!userSidebar) return;
            userSidebar.classList.remove('show');
            if (sidebarOverlay) sidebarOverlay.classList.remove('show');
            document.body.classList.remove('sidebar-open');
            setToggleAria(false);
        };

        this.closeSidebarForMobile = closeSidebar;

        if (sidebarToggleBtn && userSidebar) {
            sidebarToggleBtn.setAttribute('aria-haspopup', 'true');
            setToggleAria(false);
            sidebarToggleBtn.addEventListener('click', () => {
                if (userSidebar.classList.contains('show')) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });
        }

        if (sidebarOverlay && userSidebar) {
            sidebarOverlay.addEventListener('click', closeSidebar);
        }

        if (sidebarCloseBtn && userSidebar) {
            sidebarCloseBtn.addEventListener('click', closeSidebar);
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && userSidebar && userSidebar.classList.contains('show')) {
                closeSidebar();
            }
        });

        const handleViewportChange = (event) => {
            if (!event.matches) {
                closeSidebar();
            }
        };

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(handleViewportChange);
        }
    }

    setupTagModalListeners() {
        const addTagBtn = document.getElementById('addTagBtn');
        const newTagInput = document.getElementById('newTagInput');

        if (addTagBtn && newTagInput) {
            addTagBtn.addEventListener('click', () => {
                this.addNewTag();
            });

            newTagInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addNewTag();
                }
            });
        }
    }

    autoResizeTextarea(textarea) {
        // รีเซ็ตความสูงก่อน
        textarea.style.height = 'auto';
        
        // คำนวณความสูงที่เหมาะสม
        const scrollHeight = textarea.scrollHeight;
        const minHeight = 48; // min-height จาก CSS
        const maxHeight = 120; // max-height จาก CSS
        
        // กำหนดความสูงใหม่
        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
        textarea.style.height = newHeight + 'px';
    }

    async loadUsers() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        const userList = document.getElementById('userList');
        
        // ✅ แสดง skeleton loading
        userList.innerHTML = LoadingStateManager.createSkeleton('userItem', 5);

        try {
            // ✅ ใช้ optimized fetch พร้อม cache
            const data = await this.optimizedFetch.fetch('/admin/chat/users');
            
            if (data.success) {
                // เก็บข้อมูลผู้ใช้ทั้งหมด
                this.allUsers = data.users || [];
                
                // ใช้ filters
                this.applyFilters();
                
                if (this.currentUserId) {
                    const current = this.allUsers.find(u => u.userId === this.currentUserId);
                    if (current) {
                        this.updateChatHeader(current);
                    }
                }
            } else {
                console.error('ไม่สามารถโหลดรายชื่อผู้ใช้ได้:', data.error);
                userList.innerHTML = LoadingStateManager.createErrorState(
                    'ไม่สามารถโหลดข้อมูลได้', 
                    'chatManager.loadUsers()'
                );
            }
        } catch (error) {
            console.error('ข้อผิดพลาดในการโหลดรายชื่อผู้ใช้:', error);
            window.errorHandler.handleApiError(error);
            userList.innerHTML = LoadingStateManager.createErrorState(
                'เกิดข้อผิดพลาดในการโหลดข้อมูล',
                'chatManager.loadUsers()'
            );
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
            const displayName = user.displayName || `${user.userId.slice(0, 6)}...`;
            const showFollowUp = (user.followUp && typeof user.followUp.showInChat === 'boolean')
                ? user.followUp.showInChat
                : this.followUpOptions.showInChat;
            
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
            
            const aiBadge = user.aiEnabled ? `<span class="badge bg-success ms-1" style="font-size: 0.65rem;">AI</span>` : '';
            const followUpBadge = (showFollowUp && user.hasFollowUp) 
                ? `<span class="badge followup-badge ms-1" style="font-size: 0.65rem;" title="${this.escapeAttribute(user.followUpReason || 'ลูกค้ายืนยันสั่งซื้อแล้ว')}">ติดตาม</span>`
                : '';
            
            const purchasedIcon = user.hasPurchased 
                ? `<i class="fas fa-shopping-cart text-success ms-1" title="เคยซื้อแล้ว"></i>` 
                : '';
            
            // แสดงแท็ก (สูงสุด 2 tags)
            let tagsHtml = '';
            if (user.tags && user.tags.length > 0) {
                const displayTags = user.tags.slice(0, 2);
                tagsHtml = displayTags.map(tag => {
                    const colorClass = this.getTagColorClass(tag);
                    return `<span class="badge ${colorClass} ms-1" style="font-size: 0.6rem;">${this.escapeHtml(tag)}</span>`;
                }).join('');
                if (user.tags.length > 2) {
                    tagsHtml += `<span class="badge bg-secondary ms-1" style="font-size: 0.6rem;">+${user.tags.length - 2}</span>`;
                }
            }
            
            const initials = displayName.charAt(0).toUpperCase();

            return `
                <div class="user-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''} ${user.hasPurchased ? 'purchased' : ''}" 
                     onclick="chatManager.selectUser('${user.userId}')">
                    <div class="user-item-content">
                        <div class="user-avatar ${user.hasPurchased ? 'purchased-avatar' : ''}">
                            ${this.escapeHtml(initials)}
                            ${user.hasPurchased ? '<i class="fas fa-check-circle purchased-check"></i>' : ''}
                        </div>
                        <div class="user-details">
                            <div class="user-name">
                                ${this.escapeHtml(displayName)}
                                ${purchasedIcon}
                                ${aiBadge}
                                ${followUpBadge}
                            </div>
                            <div class="user-last-message">${this.escapeHtml(lastMsg.substring(0, 50))}${lastMsg.length > 50 ? '...' : ''}</div>
                            <div class="user-tags-row">${tagsHtml}</div>
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
        
        const filteredUserCount = document.getElementById('filteredUserCount');
        if (filteredUserCount) {
            filteredUserCount.textContent = this.users.length;
        }
    }

    // ========== Filter & Search Methods ==========

    performSearch() {
        this.applyFilters();
    }

    applyFilters() {
        let filtered = [...this.allUsers];

        // Apply search filter
        if (this.currentFilters.search) {
            const searchLower = this.currentFilters.search.toLowerCase();
            filtered = filtered.filter(user => {
                const name = (user.displayName || '').toLowerCase();
                const userId = (user.userId || '').toLowerCase();
                return name.includes(searchLower) || userId.includes(searchLower);
            });
        }

        // Apply status filter
        if (this.currentFilters.status === 'unread') {
            filtered = filtered.filter(user => user.unreadCount > 0);
        } else if (this.currentFilters.status === 'followup') {
            filtered = filtered.filter(user => user.hasFollowUp);
        } else if (this.currentFilters.status === 'purchased') {
            filtered = filtered.filter(user => user.hasPurchased);
        }

        // Apply tag filters (OR logic)
        if (this.currentFilters.tags.length > 0) {
            filtered = filtered.filter(user => {
                if (!user.tags || user.tags.length === 0) return false;
                return this.currentFilters.tags.some(tag => user.tags.includes(tag));
            });
        }

        this.users = filtered;
        this.renderUserList();
        this.updateUserCount();
        this.updateFilterBadge();
    }

    clearAllFilters() {
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: ''
        };

        // Reset UI
        const userSearch = document.getElementById('userSearch');
        if (userSearch) userSearch.value = '';

        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-filter') === 'all') {
                btn.classList.add('active');
            }
        });

        // Clear tag filters
        const tagFilterBtns = document.querySelectorAll('.tag-filter-btn');
        tagFilterBtns.forEach(btn => btn.classList.remove('active'));

        this.applyFilters();
    }

    updateFilterBadge() {
        const badge = document.getElementById('filterActiveBadge');
        if (!badge) return;

        let activeCount = 0;
        if (this.currentFilters.status !== 'all') activeCount++;
        if (this.currentFilters.tags.length > 0) activeCount += this.currentFilters.tags.length;
        if (this.currentFilters.search) activeCount++;

        if (activeCount > 0) {
            badge.textContent = activeCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    toggleTagFilter(tag) {
        const index = this.currentFilters.tags.indexOf(tag);
        if (index > -1) {
            this.currentFilters.tags.splice(index, 1);
        } else {
            this.currentFilters.tags.push(tag);
        }
        this.applyFilters();
    }

    // ========== Tag Management Methods ==========

    async loadAvailableTags() {
        try {
            const response = await fetch('/admin/chat/available-tags');
            const data = await response.json();
            
            if (data.success) {
                this.availableTags = data.tags || [];
                this.renderTagFilters();
            }
        } catch (error) {
            console.error('Error loading available tags:', error);
        }
    }

    renderTagFilters() {
        const tagFilters = document.getElementById('tagFilters');
        if (!tagFilters) return;

        if (this.availableTags.length === 0) {
            tagFilters.innerHTML = '<span class="text-muted small">ไม่มีแท็กในระบบ</span>';
            return;
        }

        const html = this.availableTags.slice(0, 10).map(tagInfo => {
            const isActive = this.currentFilters.tags.includes(tagInfo.tag);
            const colorClass = this.getTagColorClass(tagInfo.tag);
            return `
                <button class="btn btn-sm btn-outline-secondary tag-filter-btn ${isActive ? 'active' : ''}" 
                        data-tag="${this.escapeAttribute(tagInfo.tag)}"
                        onclick="chatManager.toggleTagFilter('${this.escapeAttribute(tagInfo.tag)}')">
                    <i class="fas fa-tag"></i> ${this.escapeHtml(tagInfo.tag)} (${tagInfo.count})
                </button>
            `;
        }).join('');

        tagFilters.innerHTML = html;
    }

    async openTagModal(userId) {
        const user = this.allUsers.find(u => u.userId === userId);
        if (!user) return;

        this.currentUserId = userId;

        // Update modal content
        const modalUserName = document.getElementById('tagModalUserName');
        if (modalUserName) {
            modalUserName.textContent = user.displayName || userId;
        }

        // Load current tags
        try {
            const response = await fetch(`/admin/chat/tags/${userId}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderCurrentTags(data.tags || []);
            }
        } catch (error) {
            console.error('Error loading user tags:', error);
        }

        // Load popular tags
        this.renderPopularTags();

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('tagModal'));
        modal.show();
    }

    renderCurrentTags(tags) {
        const container = document.getElementById('currentTags');
        if (!container) return;

        if (tags.length === 0) {
            container.innerHTML = '<span class="text-muted small">ยังไม่มีแท็ก</span>';
            return;
        }

        const html = tags.map(tag => {
            const colorClass = this.getTagColorClass(tag);
            return `
                <span class="badge ${colorClass} tag-pill">
                    ${this.escapeHtml(tag)}
                    <i class="fas fa-times ms-1 cursor-pointer" 
                       onclick="chatManager.removeTag('${this.escapeAttribute(tag)}')"></i>
                </span>
            `;
        }).join('');

        container.innerHTML = html;
    }

    renderPopularTags() {
        const container = document.getElementById('popularTags');
        if (!container) return;

        if (this.availableTags.length === 0) {
            container.innerHTML = '<span class="text-muted small">ไม่มีแท็กที่ใช้บ่อย</span>';
            return;
        }

        const html = this.availableTags.slice(0, 8).map(tagInfo => {
            const colorClass = this.getTagColorClass(tagInfo.tag);
            return `
                <button class="btn btn-sm ${colorClass} tag-suggestion"
                        onclick="chatManager.quickAddTag('${this.escapeAttribute(tagInfo.tag)}')">
                    <i class="fas fa-plus-circle me-1"></i>${this.escapeHtml(tagInfo.tag)}
                </button>
            `;
        }).join('');

        container.innerHTML = html;
    }

    async addNewTag() {
        const input = document.getElementById('newTagInput');
        if (!input) return;

        const tagName = input.value.trim();
        if (!tagName) return;

        await this.quickAddTag(tagName);
        input.value = '';
    }

    async quickAddTag(tagName) {
        if (!this.currentUserId) return;

        try {
            // Get current tags
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`);
            const data = await response.json();
            
            if (!data.success) {
                this.showToast('ไม่สามารถโหลดแท็กได้', 'error');
                return;
            }

            const currentTags = data.tags || [];
            if (currentTags.includes(tagName)) {
                this.showToast('มีแท็กนี้อยู่แล้ว', 'warning');
                return;
            }

            const newTags = [...currentTags, tagName];
            await this.saveTags(newTags);
        } catch (error) {
            console.error('Error adding tag:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    async removeTag(tagName) {
        if (!this.currentUserId) return;

        try {
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`);
            const data = await response.json();
            
            if (!data.success) return;

            const currentTags = data.tags || [];
            const newTags = currentTags.filter(t => t !== tagName);
            await this.saveTags(newTags);
        } catch (error) {
            console.error('Error removing tag:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    async saveTags(tags) {
        if (!this.currentUserId) return;

        try {
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags })
            });

            const data = await response.json();
            if (data.success) {
                this.renderCurrentTags(data.tags || []);
                this.loadUsers(); // Refresh user list
                this.loadAvailableTags(); // Refresh available tags
                this.showToast('บันทึกแท็กเรียบร้อย', 'success');
            } else {
                this.showToast('ไม่สามารถบันทึกแท็กได้', 'error');
            }
        } catch (error) {
            console.error('Error saving tags:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    async togglePurchaseStatus(userId) {
        const user = this.allUsers.find(u => u.userId === userId);
        if (!user) return;

        const newStatus = !user.hasPurchased;

        try {
            const response = await fetch(`/admin/chat/purchase-status/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hasPurchased: newStatus })
            });

            const data = await response.json();
            if (data.success) {
                user.hasPurchased = newStatus;
                this.applyFilters();
                if (this.currentUserId === userId) {
                    this.updateChatHeader(user);
                }
                this.showToast(
                    newStatus ? 'ทำเครื่องหมายว่าเคยซื้อแล้ว' : 'ยกเลิกเครื่องหมายการซื้อ', 
                    'success'
                );
            } else {
                this.showToast('ไม่สามารถอัปเดตสถานะได้', 'error');
            }
        } catch (error) {
            console.error('Error toggling purchase status:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        }
    }

    getTagColorClass(tag) {
        // สุ่มสีตามชื่อแท็ก (consistent)
        const colors = [
            'bg-primary', 'bg-success', 'bg-info', 'bg-warning', 
            'bg-danger', 'bg-secondary', 'bg-dark'
        ];
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
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

        const mobileQuery = this.mobileMediaQuery || window.matchMedia('(max-width: 991.98px)');
        if (mobileQuery.matches) {
            this.closeSidebarForMobile();
        }

        // Update chat header
        const user = this.users.find(u => u.userId === userId);
        if (user) {
            // ดึงสถานะล่าสุดจากเซิร์ฟเวอร์ก่อนแสดง
            try {
                const res = await fetch(`/admin/chat/user-status/${userId}`);
                const data = await res.json();
                if (data.success) user.aiEnabled = !!data.aiEnabled;
            } catch (_) {}
            this.updateChatHeader(user);
        }
        
        // Show message input
        document.getElementById('messageInputContainer').style.display = 'block';
        
        // Load chat history
        await this.loadChatHistory(userId);
    }

    updateChatHeader(user) {
        const chatHeader = document.getElementById('chatHeader');

        const aiOn = !!user.aiEnabled;
        const aiBtnClass = aiOn ? 'btn-outline-success' : 'btn-outline-secondary';
        const aiIcon = aiOn ? 'fa-toggle-on text-success' : 'fa-toggle-off text-secondary';
        const aiLabel = aiOn ? 'AI กำลังเปิด' : 'AI ปิดอยู่';
        const displayName = user.displayName || `${user.userId.slice(0, 6)}...`;
        const initials = displayName.charAt(0).toUpperCase();
        const messageCount = Number.isFinite(user.messageCount) ? user.messageCount : 0;
        const updatedLabel = user.followUpUpdatedAt ? this.formatTimestamp(user.followUpUpdatedAt) : '';
        const showFollowUp = (user.followUp && typeof user.followUp.showInChat === 'boolean')
            ? user.followUp.showInChat
            : this.followUpOptions.showInChat;
        const shouldShowFollowUp = showFollowUp && user.hasFollowUp;
        
        // Purchase status
        const purchasedBtnClass = user.hasPurchased ? 'btn-success' : 'btn-outline-secondary';
        const purchasedIcon = user.hasPurchased ? 'fa-check-circle' : 'fa-shopping-cart';
        const purchasedText = user.hasPurchased ? 'เคยซื้อแล้ว' : 'ยังไม่ซื้อ';

        // Tags display
        let tagsHtml = '';
        if (user.tags && user.tags.length > 0) {
            tagsHtml = `<div class="user-tags mt-1">`;
            user.tags.slice(0, 5).forEach(tag => {
                const colorClass = this.getTagColorClass(tag);
                tagsHtml += `<span class="badge ${colorClass} me-1" style="font-size: 0.7rem;">${this.escapeHtml(tag)}</span>`;
            });
            if (user.tags.length > 5) {
                tagsHtml += `<span class="badge bg-secondary me-1" style="font-size: 0.7rem;">+${user.tags.length - 5}</span>`;
            }
            tagsHtml += `</div>`;
        }

        const followUpInfo = shouldShowFollowUp ? `
            <div class="followup-info mt-1">
                <span class="badge followup-badge me-2">ติดตามลูกค้า</span>
                <small class="text-muted">
                    ${this.escapeHtml(user.followUpReason || 'ลูกค้ายืนยันสั่งซื้อแล้ว')}
                    ${updatedLabel ? '• อัปเดต ' + updatedLabel : ''}
                </small>
            </div>
        ` : '';

        chatHeader.innerHTML = `
            <div class="header-content">
                <div class="user-info">
                    <div class="user-avatar ${user.hasPurchased ? 'purchased-avatar' : ''}">
                        ${this.escapeHtml(initials)}
                        ${user.hasPurchased ? '<i class="fas fa-check-circle purchased-check"></i>' : ''}
                    </div>
                    <div class="user-details">
                        <h6 class="mb-0">${this.escapeHtml(displayName)}</h6>
                        <small class="text-muted">${messageCount} ข้อความ • <span id="aiStatusLabel">${aiLabel}</span></small>
                        ${tagsHtml}
                        ${followUpInfo}
                    </div>
                </div>
                <div class="header-actions" id="headerActions">
                    <button class="btn btn-sm ${purchasedBtnClass} me-2" 
                            onclick="chatManager.togglePurchaseStatus('${user.userId}')" 
                            title="สลับสถานะการซื้อ">
                        <i class="fas ${purchasedIcon} me-1"></i>${purchasedText}
                    </button>
                    <button class="btn btn-sm btn-outline-primary me-2" 
                            onclick="chatManager.openTagModal('${user.userId}')" 
                            title="จัดการแท็ก">
                        <i class="fas fa-tags me-1"></i>แท็ก
                    </button>
                    <button class="btn btn-sm ${aiBtnClass} me-2" id="toggleAiBtn" title="สลับสถานะ AI">
                        <i class="fas ${aiIcon} me-1"></i><span id="toggleAiText">${aiOn ? 'ปิด AI' : 'เปิด AI'}</span>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="chatManager.clearUserChat()">
                        <i class="fas fa-trash me-1"></i>ล้าง
                    </button>
                </div>
            </div>
        `;
        // bind toggle
        setTimeout(() => {
            const btn = document.getElementById('toggleAiBtn');
            if (btn) {
                btn.addEventListener('click', async () => {
                    await this.toggleAiForCurrent();
                });
            }
        }, 0);
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
                // ถ้ามี displayContent ที่แปลงแล้ว ให้จัดรูปแบบเพิ่มเติมก่อนแสดง
                displayContent = this.formatDisplayContent(message.displayContent);
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
                    // ใช้ escapeHtml ที่รองรับการเว้นบรรทัด
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
                // ถ้าเป็นคำสั่งควบคุมจากแอดมิน ให้ข้ามการ echo ฝั่ง client และรอ socket update
                if (data.skipEcho) {
                    // Clear input only
                    messageInput.value = '';
                    document.getElementById('charCount').textContent = '0';
                    this.autoResizeTextarea(messageInput);
                    this.loadUsers();
                    this.showToast(data.control ? (data.displayMessage || 'อัปเดตสถานะผู้ใช้แล้ว') : 'ส่งข้อความสำเร็จ', 'success');
                    return;
                }

                // Add new message to history
                const newMessage = {
                    content: data.control && data.displayMessage ? `[ระบบ] ${data.displayMessage}` : messageText,
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
                this.autoResizeTextarea(messageInput); // รีเซ็ตขนาด textarea
                
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
            if (data.sender === 'user') {
                user.unreadCount = (user.unreadCount || 0) + 1;
            }
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

    handleFollowUpTagged(data) {
        if (!data || !data.userId) return;
        const user = this.users.find(u => u.userId === data.userId);
        if (user) {
            user.hasFollowUp = !!data.hasFollowUp;
            user.followUpReason = data.followUpReason || '';
            user.followUpUpdatedAt = data.followUpUpdatedAt || null;
            this.renderUserList();
            if (this.currentUserId === data.userId) {
                this.updateChatHeader(user);
            }
        } else if (data.hasFollowUp) {
            // โหลดใหม่กรณีผู้ใช้ยังไม่อยู่ในรายการ
            this.loadUsers();
        }

        if (this.followUpOptions.showInChat && data.hasFollowUp) {
            this.showToast('ตรวจพบลูกค้ายืนยันการสั่งซื้อ', 'info');
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
        if (!text) return '';

        // แปลงการเว้นบรรทัดเป็น <br> และ <p>
        const div = document.createElement('div');
        div.textContent = text;
        let html = div.innerHTML;

        // แปลง \n เป็น <br> สำหรับการเว้นบรรทัด
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    formatDisplayContent(content) {
        if (content === null || content === undefined) {
            return '';
        }

        const strContent = String(content);
        const hasHtmlTag = /<\/?[a-z][\s\S]*>/i.test(strContent);

        if (hasHtmlTag) {
            // คงโครงสร้างเดิมไว้แต่ปรับการเว้นบรรทัดเพิ่มเติม
            return strContent.replace(/\n/g, '<br>');
        }

        return `<div class="message-text">${this.escapeHtml(strContent)}</div>`;
    }

    escapeAttribute(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
                    const text = (processed.textParts || []).join(' ').trim(); // ใช้ space สำหรับ preview
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
            const text = (processed.textParts || []).join(' ').trim(); // ใช้ space สำหรับ preview
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
            const textContent = processed.textParts.join('\n'); // ใช้ \n แทน space เพื่อรักษาการเว้นบรรทัด
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
        // ✅ ใช้ Smart Poller แทน setInterval
        this.smartPoller = new window.performanceUtils.SmartPoller(
            () => this.loadUsers(),
            30000 // 30 วินาที
        );
        this.smartPoller.start();
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
