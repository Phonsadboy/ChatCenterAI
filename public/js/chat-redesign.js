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
        this.currentChatContext = null;
        this.messageInputBaseHeight = 0;
        this.quickReplies = [];
        this.templateStorageKey = 'chatTemplates';
        this.currentEditingTemplateId = null;
        this.emojiPicker = null;
        this.closeFilterPanel = () => { };
        this.syncMobileSidebarLayout = () => { };
        this.availablePages = [];
        this.userLoadRequestId = 0;
        this.toolGroupUiState = new Map();

        // Filter state
        this.currentFilters = {
            status: 'all',
            tags: [],
            search: '',
            pageKeys: this.getPageKeysFromQuery()
        };

        // Tags
        this.availableTags = [];

        // Follow-up config
        this.followUpConfig = {
            analysisEnabled: true,
            showInChat: true
        };

        // Orders
        this.currentOrders = [];
        this.debugPanelVisible = false;

        // URL focus param
        this.pendingFocusUserId = this.getFocusUserIdFromQuery();
        this.focusHandled = false;

        // Initialize
        this.init();
    }

    init() {
        console.log('Initializing Chat Manager...');
        this.initializeSocket();
        this.setupEventListeners();
        this.loadPageOptions();
        this.loadUsers();
        this.loadAvailableTags();
        this.setupAutoRefresh();
        this.hideTypingIndicator();
    }

    getFocusUserIdFromQuery() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const candidate =
                params.get('userId') ||
                params.get('user') ||
                params.get('focus') ||
                '';
            return candidate.trim();
        } catch (_) {
            return '';
        }
    }

    getPageKeysFromQuery() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            return this.normalizePageKeys(params.get('pageKey'));
        } catch (_) {
            return [];
        }
    }

    normalizePlatform(platform) {
        const normalized = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
        if (['line', 'facebook', 'instagram', 'whatsapp'].includes(normalized)) {
            return normalized;
        }
        return 'line';
    }

    normalizeBotId(botId) {
        if (botId === null || typeof botId === 'undefined') return null;
        const normalized = String(botId).trim();
        if (!normalized || normalized.toLowerCase() === 'default') {
            return null;
        }
        return normalized;
    }

    buildPageKey(platform, botId = null) {
        const normalizedPlatform = this.normalizePlatform(platform);
        const normalizedBotId = this.normalizeBotId(botId);
        return `${normalizedPlatform}:${normalizedBotId || 'default'}`;
    }

    normalizePageKeys(pageKeys, availablePageKeys = null) {
        const rawPageKeys = Array.isArray(pageKeys)
            ? pageKeys
            : typeof pageKeys === 'string'
                ? pageKeys.split(',')
                : [];
        const allowSet = availablePageKeys instanceof Set ? availablePageKeys : null;
        const seen = new Set();
        const normalized = [];

        rawPageKeys.forEach((entry) => {
            const key = String(entry || '').trim();
            if (!key || !key.includes(':')) return;
            const [platformPart, ...botParts] = key.split(':');
            const normalizedKey = this.buildPageKey(platformPart, botParts.join(':') || null);
            if (allowSet && !allowSet.has(normalizedKey)) return;
            if (seen.has(normalizedKey)) return;
            seen.add(normalizedKey);
            normalized.push(normalizedKey);
        });

        return normalized;
    }

    findUserByContext(userId, pageKey = '') {
        const normalizedPageKey = String(pageKey || '').trim();
        const matches = [...this.users, ...this.allUsers];
        return matches.find((user) => {
            if (!user || user.userId !== userId) return false;
            if (!normalizedPageKey) return true;
            const userPageKey = user.pageKey || this.buildPageKey(user.platform, user.botId);
            return userPageKey === normalizedPageKey;
        }) || null;
    }

    getCurrentUserRecord() {
        if (!this.currentUserId) return null;
        const pageKey = this.currentChatContext?.pageKey || '';
        return this.findUserByContext(this.currentUserId, pageKey);
    }

    async tryAutoFocusUser() {
        if (this.focusHandled || !this.pendingFocusUserId) return;
        const targetId = this.pendingFocusUserId;
        const exists = this.allUsers.find(u => u.userId === targetId);
        if (!exists) return;
        this.focusHandled = true;
        this.pendingFocusUserId = null;
        await this.selectUser(targetId);
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

        // Order events
        this.socket.on('orderExtracted', (data) => {
            console.log('📦 Order extracted:', data);
            if (data.userId === this.currentUserId) {
                this.loadOrders();
            }
            // Update user list to show order badge
            this.loadUsers();
        });

        this.socket.on('orderUpdated', (data) => {
            console.log('✏️ Order updated:', data);
            if (data.userId === this.currentUserId) {
                this.loadOrders();
            }
        });

        this.socket.on('orderDeleted', (data) => {
            console.log('🗑️ Order deleted:', data);
            if (data.userId === this.currentUserId) {
                this.loadOrders();
            }
            // Update user list
            this.loadUsers();
        });

        // Typing indicator
        this.socket.on('userTyping', (data) => {
            if (data && data.userId === this.currentUserId) {
                this.showTypingIndicator(data.platform || '');
            }
        });

        this.socket.on('messageStatusUpdated', (data) => {
            if (!data || data.userId !== this.currentUserId) return;
            // Update latest message state (e.g., delivered/read)
            this.updateMessageStatus(data.messageId, data.status);
        });
    }

    // ========================================
    // Event Listeners
    // ========================================

    setupEventListeners() {
        // Search
        const searchInputs = Array.from(document.querySelectorAll('[data-user-search]'));
        searchInputs.forEach((input) => {
            input.addEventListener('input', (e) => {
                this.currentFilters.search = e.target.value.trim();
                this.syncSearchInputs(e.target);
                this.applyFilters();
            });
        });
        this.syncSearchInputs();

        // Clear filters
        document.querySelectorAll('#clearFilters, [data-clear-filters]').forEach((button) => {
            button.addEventListener('click', () => {
                this.clearFilters();
            });
        });

        const clearPageFilters = document.getElementById('clearPageFilters');
        if (clearPageFilters) {
            clearPageFilters.addEventListener('click', () => {
                this.clearPageFilters();
            });
        }

        // Status filter buttons
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.currentFilters.status = filter;
                this.syncStatusFilterButtons();
                this.applyFilters();
            });
        });
        this.syncStatusFilterButtons();

        // Sidebar toggle (mobile)
        const toggleSidebar = document.getElementById('toggleSidebar');
        const closeSidebar = document.getElementById('closeSidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const chatSidebar = document.getElementById('chatSidebar');
        const mobileSidebarShell = chatSidebar?.querySelector('.sidebar-mobile-shell');

        this.syncMobileSidebarLayout = () => {
            if (!chatSidebar || !mobileSidebarShell) return;
            if (!this.isMobileSidebarViewport()) {
                chatSidebar.style.removeProperty('--mobile-sidebar-shell-height');
                return;
            }
            const shellHeight = Math.ceil(mobileSidebarShell.getBoundingClientRect().height);
            chatSidebar.style.setProperty('--mobile-sidebar-shell-height', `${shellHeight}px`);
        };
        this.syncMobileSidebarLayout();
        window.addEventListener('resize', this.syncMobileSidebarLayout);

        if (toggleSidebar) {
            toggleSidebar.addEventListener('click', () => {
                this.syncMobileSidebarLayout();
                chatSidebar.classList.add('show');
                sidebarOverlay.classList.add('show');
            });
        }

        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => {
                this.closeFilterPanel();
                chatSidebar.classList.remove('show');
                sidebarOverlay.classList.remove('show');
            });
        }

        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                this.closeFilterPanel();
                chatSidebar.classList.remove('show');
                sidebarOverlay.classList.remove('show');
            });
        }

        // Message input
        const messageInput = document.getElementById('messageInput');
        const btnSend = document.getElementById('btnSend');
        const charCount = document.getElementById('charCount');

        if (messageInput) {
            const updateCharCount = (value = '') => {
                if (charCount) {
                    charCount.textContent = value.length;
                }
            };
            const fallbackBaseHeight = messageInput.offsetHeight || 48;
            const measuredBase = messageInput.scrollHeight || messageInput.clientHeight || 0;
            this.messageInputBaseHeight = measuredBase > 0 ? measuredBase : fallbackBaseHeight;
            const resizeMessageInput = () => {
                const baseHeight =
                    this.messageInputBaseHeight ||
                    messageInput.scrollHeight ||
                    messageInput.clientHeight ||
                    fallbackBaseHeight;
                messageInput.style.height = 'auto';
                const nextHeight = Math.max(baseHeight, messageInput.scrollHeight);
                messageInput.style.height = `${nextHeight}px`;
            };

            this.resizeMessageInput = resizeMessageInput;
            updateCharCount(messageInput.value);
            resizeMessageInput();

            messageInput.addEventListener('input', (e) => {
                updateCharCount(e.target.value);
                resizeMessageInput();
            });

            messageInput.addEventListener('keydown', (e) => {
                if (e.isComposing) return;
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
        const btnRefreshProfile = document.getElementById('btnRefreshProfile');
        const btnClearChat = document.getElementById('btnClearChat');
        const btnToggleOrders = document.getElementById('btnToggleOrders');
        const btnToggleDebug = document.getElementById('btnToggleDebug');
        const debugCloseBtn = document.getElementById('chatDebugCloseBtn');
        const debugCopyBtn = document.getElementById('chatDebugCopyBtn');
        const orderSidebarOverlay = document.getElementById('orderSidebarOverlay');
        const chatHeaderMoreMenu = document.getElementById('chatHeaderMoreMenu');

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

        // User Notes button
        const btnUserNotes = document.getElementById('btnUserNotes');
        if (btnUserNotes) {
            btnUserNotes.addEventListener('click', () => {
                this.openUserNotesModal();
            });
        }

        // Save User Notes button
        const saveUserNotesBtn = document.getElementById('saveUserNotesBtn');
        if (saveUserNotesBtn) {
            saveUserNotesBtn.addEventListener('click', () => {
                this.saveUserNotes();
            });
        }

        if (btnToggleAI) {
            btnToggleAI.addEventListener('click', () => {
                this.toggleAI();
            });
        }

        if (btnRefreshProfile) {
            btnRefreshProfile.addEventListener('click', () => {
                this.refreshCurrentUserProfile();
            });
        }

        if (btnClearChat) {
            btnClearChat.addEventListener('click', () => {
                this.clearChat();
            });
        }

        if (btnToggleDebug) {
            btnToggleDebug.addEventListener('click', () => {
                this.toggleDebugPanel();
            });
        }

        if (debugCloseBtn) {
            debugCloseBtn.addEventListener('click', () => {
                this.toggleDebugPanel(false);
            });
        }

        if (debugCopyBtn) {
            debugCopyBtn.addEventListener('click', () => {
                this.copyDebugPanel();
            });
        }

        if (btnToggleOrders) {
            btnToggleOrders.addEventListener('click', () => {
                this.toggleOrderSidebarMobile(true);
            });
        }

        if (orderSidebarOverlay) {
            orderSidebarOverlay.addEventListener('click', () => {
                this.toggleOrderSidebarMobile(false);
            });
        }

        if (chatHeaderMoreMenu) {
            chatHeaderMoreMenu.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-chat-action]');
                if (!btn || !chatHeaderMoreMenu.contains(btn)) return;
                const action = btn.dataset.chatAction;
                if (!action) return;

                switch (action) {
                    case 'togglePurchase':
                        this.togglePurchaseStatus();
                        break;
                    case 'manageTags':
                        this.openTagModal();
                        break;
                    case 'userNotes':
                        this.openUserNotesModal();
                        break;
                    case 'toggleAI':
                        this.toggleAI();
                        break;
                    case 'refreshProfile':
                        this.refreshCurrentUserProfile();
                        break;
                    case 'toggleDebug':
                        this.toggleDebugPanel();
                        break;
                    case 'clearChat':
                        this.clearChat();
                        break;
                    default:
                        break;
                }
            });
        }

        // Order sidebar collapse button
        const btnCollapseOrderSidebar = document.getElementById('btnCollapseOrderSidebar');
        if (btnCollapseOrderSidebar) {
            btnCollapseOrderSidebar.addEventListener('click', () => {
                this.toggleOrderSidebarCollapse();
            });
        }

        this.syncOrderSidebarCollapseForViewport();
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (resizeTimer) window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                this.syncOrderSidebarCollapseForViewport();
                this.renderUserList();
                this.renderMobileSidebarState();
            }, 120);
        });

        // Template button
        const btnTemplate = document.getElementById('btnTemplate');
        if (btnTemplate) {
            btnTemplate.addEventListener('click', () => {
                this.openTemplateModal();
            });
        }

        const templateSearch = document.getElementById('templateSearch');
        if (templateSearch) {
            templateSearch.addEventListener('input', (e) => {
                this.filterTemplates(e.target.value);
            });
        }

        const templateList = document.getElementById('templateList');
        if (templateList) {
            templateList.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('button[data-template-action]');
                const item = e.target.closest('.template-item');
                if (!item || !templateList.contains(item)) return;
                const templateId = item.dataset.id;
                if (!templateId) return;
                const action = actionBtn?.dataset?.templateAction || 'use';
                if (action === 'use') {
                    this.applyTemplateById(templateId);
                } else if (action === 'edit') {
                    this.openTemplateEditorModal(templateId);
                } else if (action === 'delete') {
                    this.deleteTemplate(templateId);
                }
            });
        }

        const createTemplateBtn = document.getElementById('createTemplateBtn');
        if (createTemplateBtn) {
            createTemplateBtn.addEventListener('click', () => {
                this.openTemplateEditorModal();
            });
        }

        const templateEditorSaveBtn = document.getElementById('templateEditorSaveBtn');
        if (templateEditorSaveBtn) {
            templateEditorSaveBtn.addEventListener('click', () => {
                this.saveTemplateFromEditor();
            });
        }

        const templateEditorModal = document.getElementById('templateEditorModal');
        if (templateEditorModal) {
            templateEditorModal.addEventListener('hidden.bs.modal', () => {
                this.resetTemplateEditor();
            });
        }

        const btnEmoji = document.getElementById('btnEmoji');
        if (btnEmoji) {
            btnEmoji.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleEmojiPicker(btnEmoji);
            });
        }
        document.addEventListener('click', (event) => {
            if (!this.emojiPicker) return;
            if (this.emojiPicker.contains(event.target)) return;
            if (btnEmoji && event.target === btnEmoji) return;
            this.hideEmojiPicker();
        });

        // Toggle filter panel accessibility
        const filterToggleButtons = Array.from(document.querySelectorAll('[data-filter-toggle]'));
        const filterPanel = document.getElementById('filterPanel');
        if (filterToggleButtons.length > 0 && filterPanel) {
            const setFilterPanelState = (isShown) => {
                this.syncMobileSidebarLayout();
                filterPanel.classList.toggle('show', isShown);
                filterPanel.style.display = isShown ? 'block' : 'none';
                filterPanel.setAttribute('aria-hidden', isShown ? 'false' : 'true');
                chatSidebar?.classList.toggle('filter-panel-open', isShown);
                filterToggleButtons.forEach((button) => {
                    button.setAttribute('aria-expanded', isShown ? 'true' : 'false');
                    button.setAttribute('aria-controls', 'filterPanel');
                });
                if (isShown) {
                    if (this.isMobileSidebarViewport()) {
                        requestAnimationFrame(() => {
                            chatSidebar?.scrollTo({ top: 0, behavior: 'smooth' });
                        });
                    } else {
                        filterPanel.focus({ preventScroll: true });
                    }
                }
            };

            this.closeFilterPanel = () => {
                setFilterPanelState(false);
            };

            filterPanel.setAttribute('tabindex', '-1');
            filterPanel.setAttribute('aria-hidden', 'true');
            filterToggleButtons.forEach((button) => {
                button.setAttribute('aria-expanded', 'false');
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setFilterPanelState(!filterPanel.classList.contains('show'));
                });
            });

            document.addEventListener('click', (event) => {
                if (!filterPanel.classList.contains('show')) return;
                if (filterPanel.contains(event.target)) return;
                if (filterToggleButtons.some((button) => button.contains(event.target))) return;
                setFilterPanelState(false);
            });

            // Close filter panel when pressing Esc
            filterPanel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    setFilterPanelState(false);
                    filterToggleButtons[0]?.focus();
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.querySelector('.modal.show')) return;

            const chatSidebar = document.getElementById('chatSidebar');
            const sidebarOverlay = document.getElementById('sidebarOverlay');
            if (chatSidebar?.classList.contains('show')) {
                this.closeFilterPanel();
                chatSidebar.classList.remove('show');
                sidebarOverlay?.classList.remove('show');
            }

            const orderSidebar = document.getElementById('orderSidebar');
            const orderOverlay = document.getElementById('orderSidebarOverlay');
            if (orderSidebar?.classList.contains('show')) {
                orderSidebar.classList.remove('show');
                orderOverlay?.classList.remove('show');
            }

            this.hideEmojiPicker();
        });

        // Save order button
        const saveOrderBtn = document.getElementById('saveOrderBtn');
        if (saveOrderBtn) {
            saveOrderBtn.addEventListener('click', () => {
                this.saveOrder();
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

	        // User list selection (delegation)
	        const userList = document.getElementById('userList');
	        if (userList) {
	            userList.addEventListener('click', (e) => {
	                const item = e.target.closest('.user-item[data-user-id]');
	                if (!item || !userList.contains(item)) return;
	                const userId = item.dataset.userId;
	                if (!userId) return;
	                this.selectUser(userId);
	            });

	            userList.addEventListener('keydown', (e) => {
	                if (e.key !== 'Enter' && e.key !== ' ') return;
	                const item = e.target.closest('.user-item[data-user-id]');
	                if (!item || !userList.contains(item)) return;
	                e.preventDefault();
	                const userId = item.dataset.userId;
	                if (!userId) return;
	                this.selectUser(userId);
	            });
	        }

	        // Tag filter buttons (delegation)
	        const tagFilters = document.getElementById('tagFilters');
	        if (tagFilters) {
	            tagFilters.addEventListener('click', (e) => {
	                const btn = e.target.closest('.tag-filter-btn[data-tag]');
	                if (!btn || !tagFilters.contains(btn)) return;
	                const tag = btn.dataset.tag;
	                if (!tag) return;
	                this.toggleTagFilter(tag);
	            });
	        }

        const pageFilters = document.getElementById('pageFilters');
        if (pageFilters) {
            pageFilters.addEventListener('change', (e) => {
                const input = e.target.closest('input[data-page-key]');
                if (!input || !pageFilters.contains(input)) return;
                this.togglePageFilter(input.dataset.pageKey || '', input.checked);
            });
        }

	        // Tag modal actions (delegation)
	        const currentTags = document.getElementById('currentTags');
	        if (currentTags) {
	            currentTags.addEventListener('click', (e) => {
	                const btn = e.target.closest('button[data-action="remove-tag"][data-tag]');
	                if (!btn || !currentTags.contains(btn)) return;
	                const tag = btn.dataset.tag;
	                if (!tag) return;
	                this.removeTag(tag);
	            });
	        }

	        const popularTags = document.getElementById('popularTags');
	        if (popularTags) {
	            popularTags.addEventListener('click', (e) => {
	                const tagEl = e.target.closest('[data-action="add-tag"][data-tag]');
	                if (!tagEl || !popularTags.contains(tagEl)) return;
	                const tag = tagEl.dataset.tag;
	                if (!tag) return;
	                this.addTag(tag);
	            });

	            popularTags.addEventListener('keydown', (e) => {
	                if (e.key !== 'Enter' && e.key !== ' ') return;
	                const tagEl = e.target.closest('[data-action="add-tag"][data-tag]');
	                if (!tagEl || !popularTags.contains(tagEl)) return;
	                e.preventDefault();
	                const tag = tagEl.dataset.tag;
	                if (!tag) return;
	                this.addTag(tag);
	            });
	        }

		        // Message image click (delegation)
		        const messagesContainer = document.getElementById('messagesContainer');
	        if (messagesContainer) {
		            messagesContainer.addEventListener('click', (e) => {
	                const toggleBtn = e.target.closest('[data-action="toggle-tool-group"]');
	                if (toggleBtn && messagesContainer.contains(toggleBtn)) {
	                    const toolGroup = toggleBtn.closest('.message-tool-group');
	                    if (!toolGroup) return;
	                    const groupKey = toolGroup.dataset.toolGroupKey || '';
	                    const nextExpanded = !toolGroup.classList.contains('is-expanded');
	                    this.toolGroupUiState.set(groupKey, nextExpanded);
	                    toolGroup.classList.toggle('is-expanded', nextExpanded);
	                    toolGroup.classList.toggle('is-collapsed', !nextExpanded);
	                    toggleBtn.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
	                    const body = toolGroup.querySelector('.message-tool-group__body');
	                    if (body) {
	                        body.hidden = !nextExpanded;
	                    }
	                    return;
	                }

	                const imageWrap = e.target.closest('.message-image');
	                if (!imageWrap || !messagesContainer.contains(imageWrap)) return;
	                const src = imageWrap.dataset.imageSrc || '';
	                if (!src) return;
	                this.showImageModal(src);
	            });

	            messagesContainer.addEventListener('keydown', (e) => {
	                if (e.key !== 'Enter' && e.key !== ' ') return;
	                const imageWrap = e.target.closest('.message-image');
	                if (!imageWrap || !messagesContainer.contains(imageWrap)) return;
	                e.preventDefault();
	                const src = imageWrap.dataset.imageSrc || '';
	                if (!src) return;
	                this.showImageModal(src);
	            });
	        }

	        // Order actions (delegation)
	        const orderContent = document.getElementById('orderContent');
        if (orderContent) {
            orderContent.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn || !orderContent.contains(btn)) return;
                const action = btn.dataset.action;
	                const orderId = btn.dataset.orderId;
	                if (!orderId) return;
	                if (action === 'edit-order') {
	                    this.editOrder(orderId);
	                } else if (action === 'delete-order') {
	                    this.deleteOrder(orderId);
                }
            });
        }
    }

    // ========================================
    // Debug Panel
    // ========================================

    toggleDebugPanel(forceState = null) {
        const panel = document.getElementById('chatDebugPanel');
        if (!panel) return;

        if (typeof forceState === 'boolean') {
            this.debugPanelVisible = forceState;
        } else {
            this.debugPanelVisible = !this.debugPanelVisible;
        }

        panel.hidden = !this.debugPanelVisible;

        const toggleBtn = document.getElementById('btnToggleDebug');
        if (toggleBtn) {
            toggleBtn.classList.toggle('is-active', this.debugPanelVisible);
            toggleBtn.setAttribute('aria-pressed', this.debugPanelVisible ? 'true' : 'false');
            toggleBtn.title = this.debugPanelVisible ? 'ซ่อน Debug' : 'Debug';
        }

        if (this.debugPanelVisible) {
            this.updateDebugPanel();
        }
    }

    updateDebugPanel() {
        if (!this.debugPanelVisible) return;

        const body = document.getElementById('chatDebugBody');
        if (!body) return;

        const snapshot = this.buildDebugSnapshot();
        if (!snapshot) {
            body.textContent = 'เลือกผู้ใช้เพื่อดูข้อมูล debug';
            return;
        }

        body.textContent = JSON.stringify(snapshot, null, 2);
    }

    buildDebugSnapshot() {
        if (!this.currentUserId) return null;

        const user = this.getCurrentUserRecord();
        const orders = Array.isArray(this.currentOrders) ? this.currentOrders : [];
        const latestOrder = orders.length > 0 ? orders[0] : null;
        const messages = this.chatHistory[this.currentUserId] || [];
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const lastMessagePreviewRaw = lastMessage
            ? this.extractDisplayText(lastMessage) || lastMessage.content || ''
            : '';
        const lastMessagePreview = typeof lastMessagePreviewRaw === 'string'
            ? lastMessagePreviewRaw.slice(0, 160)
            : '';

        return {
            generatedAt: new Date().toISOString(),
            socketConnected: !!this.socket?.connected,
            currentUserId: this.currentUserId,
            user: user ? {
                displayName: user.displayName || null,
                platform: user.platform || null,
                botId: user.botId || null,
                channelLabel: user.channelLabel || null,
                aiEnabled: !!user.aiEnabled,
                hasFollowUp: !!user.hasFollowUp,
                followUpReason: user.followUpReason || null,
                hasPurchased: !!user.hasPurchased,
                hasOrders: !!user.hasOrders,
                orderCount: user.orderCount || 0,
                unreadCount: user.unreadCount || 0,
                followUp: user.followUp ? {
                    analysisEnabled: user.followUp.analysisEnabled !== false,
                    showInChat: user.followUp.showInChat !== false,
                    isFollowUp: !!user.followUp.isFollowUp,
                    nextScheduledAt: user.followUp.nextScheduledAt || null
                } : null
            } : null,
            counts: {
                allUsers: this.allUsers.length,
                filteredUsers: this.users.length,
                messages: messages.length,
                orders: orders.length
            },
            filters: {
                status: this.currentFilters.status,
                tags: [...this.currentFilters.tags],
                search: this.currentFilters.search,
                pageKeys: [...this.currentFilters.pageKeys]
            },
            currentChatContext: this.currentChatContext ? { ...this.currentChatContext } : null,
            latestOrder: latestOrder ? {
                id: latestOrder._id || null,
                status: latestOrder.status || null,
                totalAmount: latestOrder.orderData?.totalAmount || null,
                extractedAt: latestOrder.extractedAt || null
            } : null,
            lastMessagePreview: lastMessagePreview || null
        };
    }

    async copyDebugPanel() {
        const body = document.getElementById('chatDebugBody');
        if (!body) return;
        const text = body.textContent || '';
        if (!text) return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const range = document.createRange();
                range.selectNodeContents(body);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                document.execCommand('copy');
                selection.removeAllRanges();
            }
            this.showToast('คัดลอกข้อมูล debug แล้ว', 'success');
        } catch (error) {
            console.error('Copy debug failed:', error);
            this.showToast('คัดลอกข้อมูลไม่สำเร็จ', 'error');
        }
    }

    // ========================================
    // User Management
    // ========================================

    async fetchPageCatalog(url) {
        const response = await fetch(url);
        const data = await response.json();
        if (!data || data.success !== true) {
            throw new Error(data?.error || `Failed to load page catalog from ${url}`);
        }
        return data;
    }

    async loadPageOptions() {
        try {
            let data = null;
            try {
                data = await this.fetchPageCatalog('/admin/chat/pages');
            } catch (primaryError) {
                console.warn('Primary chat page catalog failed, falling back to orders pages', primaryError);
            }
            if (!data || !Array.isArray(data.pages) || data.pages.length === 0 || data.warning) {
                data = await this.fetchPageCatalog('/admin/orders/pages');
            }

            this.availablePages = Array.isArray(data.pages)
                ? data.pages.map((page) => ({
                    ...page,
                    pageKey: page.pageKey || this.buildPageKey(page.platform, page.botId),
                    chatCount: Number.isFinite(Number(page.chatCount))
                        ? Number(page.chatCount)
                        : Number(page.orderCount) || 0
                }))
                : [];

            const availablePageKeys = new Set(this.availablePages.map(page => page.pageKey));
            const normalizedPageKeys = this.normalizePageKeys(
                this.currentFilters.pageKeys,
                availablePageKeys
            );
            const pageFilterChanged =
                normalizedPageKeys.length !== this.currentFilters.pageKeys.length ||
                normalizedPageKeys.some((key, index) => key !== this.currentFilters.pageKeys[index]);
            this.currentFilters.pageKeys = normalizedPageKeys;

            this.renderPageFilters();
            this.updateFilterBadge();

            if (pageFilterChanged) {
                this.loadUsers();
            }
        } catch (error) {
            console.error('Error loading chat pages:', error);
            this.availablePages = [];
            this.renderPageFilters();
            this.updateFilterBadge();
        }
    }

    renderPageFilters() {
        const pageFilters = document.getElementById('pageFilters');
        const pageFilterMeta = document.getElementById('pageFilterMeta');
        const clearPageFilters = document.getElementById('clearPageFilters');
        if (!pageFilters) return;

        const selectedSet = new Set(this.currentFilters.pageKeys || []);
        if (pageFilterMeta) {
            if (selectedSet.size === 0) {
                pageFilterMeta.textContent = 'ทุกเพจและทุกบอท';
            } else if (selectedSet.size === 1) {
                const selectedPage = this.availablePages.find(page => selectedSet.has(page.pageKey));
                pageFilterMeta.textContent = selectedPage?.name || 'เลือก 1 เพจ/บอท';
            } else {
                pageFilterMeta.textContent = `เลือกแล้ว ${selectedSet.size} เพจ/บอท`;
            }
        }

        if (clearPageFilters) {
            clearPageFilters.hidden = selectedSet.size === 0;
        }

        if (!Array.isArray(this.availablePages) || this.availablePages.length === 0) {
            pageFilters.innerHTML = '<span class="no-tags">ไม่พบเพจหรือบอท</span>';
            this.renderMobileSidebarState();
            return;
        }

        pageFilters.innerHTML = this.availablePages.map((page) => {
            const pageKey = page.pageKey || this.buildPageKey(page.platform, page.botId);
            const checked = selectedSet.has(pageKey);
            const chatCount = Number.isFinite(Number(page.chatCount)) ? Number(page.chatCount) : 0;
            return `
                <label class="page-filter-option ${checked ? 'active' : ''}">
                    <input type="checkbox" data-page-key="${this.escapeHtml(pageKey)}" ${checked ? 'checked' : ''}>
                    <span class="page-filter-label">${this.escapeHtml(page.name || pageKey)}</span>
                    <span class="page-filter-count">${chatCount}</span>
                </label>
            `;
        }).join('');
        this.renderMobileSidebarState();
    }

    clearPageFilters(options = {}) {
        const { skipLoad = false } = options;
        this.currentFilters.pageKeys = [];
        this.renderPageFilters();
        this.updateFilterBadge();
        if (!skipLoad) {
            this.loadUsers();
        }
    }

    togglePageFilter(pageKey, forceChecked = null) {
        const normalizedPageKey = this.normalizePageKeys([pageKey])[0];
        if (!normalizedPageKey) return;

        const nextSelected = new Set(this.currentFilters.pageKeys || []);
        const shouldSelect = typeof forceChecked === 'boolean'
            ? forceChecked
            : !nextSelected.has(normalizedPageKey);
        if (shouldSelect) {
            nextSelected.add(normalizedPageKey);
        } else {
            nextSelected.delete(normalizedPageKey);
        }

        this.currentFilters.pageKeys = this.normalizePageKeys([...nextSelected]);
        this.renderPageFilters();
        this.updateFilterBadge();
        this.loadUsers();
    }

    buildUsersEndpointUrl() {
        const params = new URLSearchParams();
        if (this.pendingFocusUserId) {
            params.set('focus', this.pendingFocusUserId);
        }
        if (Array.isArray(this.currentFilters.pageKeys) && this.currentFilters.pageKeys.length > 0) {
            params.set('pageKey', this.currentFilters.pageKeys.join(','));
        }
        const query = params.toString();
        return query ? `/admin/chat/users?${query}` : '/admin/chat/users';
    }

    getDefaultChatEmptyStateHtml() {
        return `
            <div class="empty-state app-empty" id="emptyState">
                <div class="app-empty__icon">
                    <i class="fab fa-facebook-messenger"></i>
                </div>
                <div class="app-empty__title">เลือกแชทเพื่อเริ่มการสนทนา</div>
                <div class="app-empty__desc">
                    เลือกผู้ใช้จากรายการด้านซ้ายเพื่อดูข้อความและตอบกลับได้ทันที
                </div>
            </div>
        `;
    }

    resetSelectedChat() {
        this.currentUserId = null;
        this.currentChatContext = null;
        this.currentOrders = [];
        this.renderOrders();
        this.hideTypingIndicator();

        const chatAvatar = document.getElementById('chatAvatar');
        const chatUserName = document.getElementById('chatUserName');
        const chatUserMeta = document.getElementById('chatUserMeta');
        const chatHeaderActions = document.getElementById('chatHeaderActions');
        const messagesContainer = document.getElementById('messagesContainer');
        const messageInputArea = document.getElementById('messageInputArea');
        const messageInput = document.getElementById('messageInput');
        const charCount = document.getElementById('charCount');

        if (chatAvatar) {
            chatAvatar.innerHTML = '<i class="fas fa-user"></i>';
            chatAvatar.className = 'chat-avatar';
        }
        if (chatUserName) {
            chatUserName.textContent = 'เลือกแชทเพื่อเริ่มสนทนา';
        }
        if (chatUserMeta) {
            chatUserMeta.innerHTML = `
                <span class="meta-item">
                    <i class="fas fa-comment"></i>
                    <span id="messageCount">0</span> ข้อความ
                </span>
            `;
        }
        if (chatHeaderActions) {
            chatHeaderActions.style.display = 'none';
        }
        if (messagesContainer) {
            messagesContainer.innerHTML = this.getDefaultChatEmptyStateHtml();
        }
        if (messageInputArea) {
            messageInputArea.style.display = 'none';
        }
        if (messageInput) {
            messageInput.value = '';
            messageInput.style.height = 'auto';
        }
        if (charCount) {
            charCount.textContent = '0';
        }
        this.updateDebugPanel();
    }

    async loadUsers() {
        try {
            const requestId = ++this.userLoadRequestId;
            const response = await fetch(this.buildUsersEndpointUrl());
            const data = await response.json();
            if (requestId !== this.userLoadRequestId) return;

            if (data.success) {
                this.allUsers = (data.users || []).map(user => {
                    const normalizedUser = { ...user };
                    normalizedUser.pageKey = normalizedUser.pageKey || this.buildPageKey(
                        normalizedUser.platform,
                        normalizedUser.botId
                    );
                    if (user.lastMessage) {
                        const previewText = this.extractDisplayText({
                            content: user.lastMessage,
                            displayContent: user.lastMessage,
                        });
                        normalizedUser.lastMessage = previewText || user.lastMessage;
                    }
                    return normalizedUser;
                });
                if (this.currentUserId) {
                    const currentPageKey = this.currentChatContext?.pageKey || '';
                    const selectedUser = this.findUserByContext(this.currentUserId, currentPageKey);
                    if (selectedUser) {
                        this.currentChatContext = {
                            platform: selectedUser.platform || null,
                            botId: selectedUser.botId || null,
                            pageKey: selectedUser.pageKey || this.buildPageKey(selectedUser.platform, selectedUser.botId)
                        };
                    } else {
                        this.resetSelectedChat();
                    }
                }
                this.applyFilters();
                await this.tryAutoFocusUser();
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

        if (this.currentFilters.pageKeys.length > 0) {
            const selectedPages = new Set(this.currentFilters.pageKeys);
            filtered = filtered.filter(user => {
                const pageKey = user.pageKey || this.buildPageKey(user.platform, user.botId);
                return selectedPages.has(pageKey);
            });
        }

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
        this.updateDebugPanel();
    }

    renderUserList() {
        const userList = document.getElementById('userList');

        if (!userList) return;

        // Update counts
        document.querySelectorAll('[data-user-count]').forEach((node) => {
            node.textContent = this.users.length;
        });
        document.querySelectorAll('[data-filtered-count]').forEach((node) => {
            node.textContent = this.users.length;
        });

        // Render users
        if (this.users.length === 0) {
            userList.innerHTML = `
                <div class="empty-state" style="padding: 2rem;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--text-tertiary); margin-bottom: 1rem;"></i>
                    <p style="color: var(--text-secondary);">ไม่พบผู้ใช้</p>
                </div>
            `;
            this.renderMobileSidebarState();
            return;
        }

        userList.innerHTML = this.users.map(user => this.renderUserItem(user)).join('');
        this.renderMobileSidebarState();
    }

    renderUserItem(user) {
        const isActive = user.userId === this.currentUserId;
        const hasUnread = user.unreadCount > 0;
        const isPurchased = user.hasPurchased;
        const isFollowUp = user.followUp && user.followUp.isFollowUp;
        const aiEnabled = user.aiEnabled !== false;
        const hasOrders = user.hasOrders || false;
        const orderCount = Number.isFinite(Number(user.orderCount))
            ? Number(user.orderCount)
            : 0;

        const avatarLetter = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';
        const lastMessage = user.lastMessage ? this.truncateText(user.lastMessage, 50) : 'ไม่มีข้อความ';
        const lastTimestamp = user.lastTimestamp || user.lastMessageTime || user.lastMessageAt || null;
        const time = lastTimestamp ? this.formatRelativeTime(lastTimestamp) : '';
        const channelLabel = (() => {
            const explicit = typeof user.channelLabel === 'string' ? user.channelLabel.trim() : '';
            if (explicit) return explicit;
            const platform = typeof user.platform === 'string' ? user.platform.trim().toLowerCase() : '';
            const platformLabel = platform === 'facebook' ? 'Facebook' : platform === 'line' ? 'LINE' : '';
            const botName = typeof user.botName === 'string' ? user.botName.trim() : '';
            if (platformLabel && botName) return `${platformLabel} · ${botName}`;
            return platformLabel || '';
        })();
        const channelHtml = channelLabel
            ? `<div class="user-channel">${this.escapeHtml(channelLabel)}</div>`
            : '';

        // Build status indicators
        const statusDots = [];
        statusDots.push(`
            <div class="status-dot ${aiEnabled ? 'ai-active' : 'ai-disabled'}" 
                 title="${aiEnabled ? 'AI เปิดใช้งาน' : 'AI ปิดใช้งาน'}">
                <span class="status-tooltip">${aiEnabled ? 'AI เปิด' : 'AI ปิด'}</span>
            </div>
        `);
        if (isFollowUp) {
            statusDots.push(`
                <div class="status-dot followup" title="ต้องติดตาม">
                    <span class="status-tooltip">ติดตาม</span>
                </div>
            `);
        }
        if (hasOrders) {
            statusDots.push(`
                <div class="status-dot has-orders" title="มีออเดอร์ ${orderCount}">
                    <span class="status-tooltip">มีออเดอร์ ${orderCount}</span>
                </div>
            `);
        }
        if (isPurchased) {
            statusDots.push(`
                <div class="status-dot purchased" title="ซื้อสินค้าแล้ว">
                    <span class="status-tooltip">ซื้อแล้ว</span>
                </div>
            `);
        }

        // Build avatar HTML with profile picture or fallback letter
        let avatarContent;
        if (user.pictureUrl) {
            avatarContent = `
                <img src="${this.escapeHtml(user.pictureUrl)}" 
                     alt="${this.escapeHtml(user.displayName || 'User')}"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span class="avatar-fallback" style="display: none;">${avatarLetter}</span>
            `;
        } else {
            avatarContent = `<span class="avatar-fallback">${avatarLetter}</span>`;
        }

        const tags = user.tags && user.tags.length > 0
            ? user.tags.slice(0, 2).map(tag =>
                `<span class="tag-badge">${this.escapeHtml(tag)}</span>`
            ).join('')
            : '';

        if (this.isMobileSidebarViewport()) {
            const mobileChannelChip = channelLabel
                ? `<span class="user-mobile-channel-chip">${this.escapeHtml(channelLabel)}</span>`
                : '';
            const mobileOrderChip = hasOrders
                ? `<span class="badge-sm badge-order">ออเดอร์ ${orderCount}</span>`
                : '';
            const mobileUnreadChip = hasUnread
                ? `<span class="user-mobile-unread">${user.unreadCount} ใหม่</span>`
                : '';

            return `
                <div class="user-item user-item--mobile ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}" role="button" tabindex="0"
                     data-user-id="${this.escapeHtml(user.userId || '')}">
                    <div class="user-item-mobile-head">
                        <div class="user-avatar">
                            ${avatarContent}
                            <div class="user-status-indicators">
                                ${statusDots.join('')}
                            </div>
                        </div>
                        <div class="user-item-content">
                            <div class="user-item-header">
                                <div class="user-name">${this.escapeHtml(user.displayName || user.userId)}</div>
                                <div class="user-time">${time}</div>
                            </div>
                            <div class="user-mobile-statusline">
                                ${mobileChannelChip}
                                ${mobileOrderChip}
                                ${mobileUnreadChip}
                            </div>
                        </div>
                    </div>
                    <div class="user-mobile-message-shell">
                        <div class="user-last-message">${this.escapeHtml(lastMessage)}</div>
                    </div>
                    <div class="user-mobile-footer">
                        <div class="user-badges">
                            ${aiEnabled ? '<span class="badge-sm badge-ai">AI</span>' : '<span class="badge-sm badge-ai badge-ai--off">AI ปิด</span>'}
                            ${isFollowUp ? '<span class="badge-sm badge-followup">ติดตาม</span>' : ''}
                            ${isPurchased ? '<span class="badge-sm badge-purchased">ซื้อแล้ว</span>' : ''}
                        </div>
                        ${tags ? `<div class="user-tags">${tags}</div>` : ''}
                    </div>
                </div>
            `;
        }

		        return `
		            <div class="user-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}" role="button" tabindex="0"
		                 data-user-id="${this.escapeHtml(user.userId || '')}">
		                <div class="user-avatar">
		                    ${avatarContent}
		                    <div class="user-status-indicators">
		                        ${statusDots.join('')}
		                    </div>
                </div>
                <div class="user-item-content">
                    <div class="user-item-header">
                        <div class="user-name">${this.escapeHtml(user.displayName || user.userId)}</div>
                        <div class="user-time">${time}</div>
                    </div>
                    ${channelHtml}
                    ${hasOrders ? `<div class="user-badges"><span class="badge-sm badge-order">มีออเดอร์ ${orderCount}</span></div>` : ''}
                    <div class="user-last-message">${this.escapeHtml(lastMessage)}</div>
                    ${tags ? `<div class="user-tags">${tags}</div>` : ''}
                </div>
                ${hasUnread ? `<div class="unread-count">${user.unreadCount}</div>` : ''}
            </div>
        `;
    }


    async selectUser(userId) {
        this.currentUserId = userId;
        const user = this.findUserByContext(
            userId,
            this.currentChatContext?.pageKey || ''
        ) || this.findUserByContext(userId);
        this.currentChatContext = user ? {
            platform: user.platform || null,
            botId: user.botId || null,
            pageKey: user.pageKey || this.buildPageKey(user.platform, user.botId)
        } : null;

        // Close sidebar on mobile
        const chatSidebar = document.getElementById('chatSidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        this.closeFilterPanel();
        if (chatSidebar) chatSidebar.classList.remove('show');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
        this.toggleOrderSidebarMobile(false);

        // Update UI
        this.renderUserList();
        this.updateChatHeader();
        this.showMessageInput();
        this.hideTypingIndicator();

        // Load chat history
        await this.loadChatHistory(userId);

        // Load orders
        await this.loadOrders();
        this.updateDebugPanel();

        // Mark as read
        this.markAsRead(userId);
    }

    updateChatHeader() {
        const btnRefreshProfile = document.getElementById('btnRefreshProfile');
        const user = this.getCurrentUserRecord();
        if (!user) {
            if (btnRefreshProfile) {
                btnRefreshProfile.disabled = true;
                btnRefreshProfile.title = 'เลือกผู้ใช้เพื่ออัปเดตข้อมูล';
                btnRefreshProfile.classList.add('disabled');
            }
            return;
        }

        const chatAvatar = document.getElementById('chatAvatar');
        const chatUserName = document.getElementById('chatUserName');
        const chatUserMeta = document.getElementById('chatUserMeta');
        const chatHeaderActions = document.getElementById('chatHeaderActions');
        const messageCount = document.getElementById('messageCount');

        const avatarLetter = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';

        if (chatAvatar) {
            // Use profile picture if available, fallback to letter
            if (user.pictureUrl) {
                chatAvatar.innerHTML = `
                    <img src="${this.escapeHtml(user.pictureUrl)}" 
                         alt="${this.escapeHtml(user.displayName || 'User')}"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <span class="avatar-fallback" style="display: none;">${avatarLetter}</span>
                `;
            } else {
                chatAvatar.innerHTML = `<span class="avatar-fallback">${avatarLetter}</span>`;
            }
            chatAvatar.className = 'chat-avatar';
        }


        if (chatUserName) {
            chatUserName.textContent = user.displayName || user.userId;
        }

        if (chatUserMeta) {
            const messages = this.chatHistory[this.currentUserId] || [];
            const orderCount = Number.isFinite(Number(user.orderCount))
                ? Number(user.orderCount)
                : 0;
            const orderMetaHtml = orderCount > 0
                ? `
                    <span class="meta-item meta-item-order">
                        <i class="fas fa-box"></i>
                        ${orderCount} ออเดอร์
                    </span>
                `
                : '';
            chatUserMeta.innerHTML = `
                <span class="meta-item">
                    <i class="fas fa-comment"></i>
                    <span id="messageCount">${messages.length}</span> ข้อความ
                </span>
                <span class="meta-item meta-item-active">
                    <i class="fas fa-eye"></i>
                    กำลังอ่านอยู่
                </span>
                ${orderMetaHtml}
            `;
        } else if (messageCount) {
            const messages = this.chatHistory[this.currentUserId] || [];
            messageCount.textContent = messages.length;
        }

        if (chatHeaderActions) {
            chatHeaderActions.style.display = 'flex';
        }

        if (btnRefreshProfile) {
            const isFacebook = user.platform === 'facebook';
            btnRefreshProfile.disabled = !isFacebook;
            btnRefreshProfile.title = isFacebook
                ? 'อัปเดตข้อมูลผู้ใช้'
                : 'ใช้กับผู้ใช้ Facebook เท่านั้น';
            btnRefreshProfile.classList.toggle('disabled', !isFacebook);
        }
    }

    showMessageInput() {
        const messageInputArea = document.getElementById('messageInputArea');
        const emptyState = document.getElementById('emptyState');

        if (messageInputArea) {
            messageInputArea.style.display = 'block';
        }
        if (typeof this.resizeMessageInput === 'function') {
            this.resizeMessageInput();
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
            const params = new URLSearchParams();
            const pageKey = this.currentChatContext?.pageKey || '';
            if (pageKey) {
                params.set('pageKey', pageKey);
            }
            const query = params.toString();
            const response = await fetch(
                `/admin/chat/history/${userId}${query ? `?${query}` : ''}`
            );
            const data = await response.json();

            if (data.success) {
                this.chatHistory[userId] = (data.messages || []).map(msg => {
                    const normalized = { ...msg };
                    return this.prepareMessageForDisplay(normalized);
                });
                this.renderMessages();
                if (userId === this.currentUserId) {
                    this.updateChatHeader();
                }
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

        const rawMessages = this.chatHistory[this.currentUserId] || [];
        const messages = rawMessages.map((message) => {
            if (message && typeof message === 'object') {
                return message;
            }
            return this.prepareMessageForDisplay({
                role: 'assistant',
                source: 'system',
                content: String(message || ''),
                timestamp: new Date().toISOString()
            });
        });

        // Clear typing indicator when rerendering actual messages
        this.hideTypingIndicator();

        const renderableBlocks = this.groupRenderableMessages(messages);

        if (renderableBlocks.length === 0) {
            messagesContainer.innerHTML = `
                <div class="app-empty">
                    <div class="app-empty__icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="app-empty__title">ยังไม่มีข้อความ</div>
                    <div class="app-empty__desc">เริ่มต้นการสนทนาด้วยการส่งข้อความแรก</div>
                </div>
            `;
            return;
        }

        let lastDateLabel = '';
        const blocks = [];
        renderableBlocks.forEach((block) => {
            const dateLabel = block.timestamp ? this.formatDateLabel(block.timestamp) : '';
            if (dateLabel && dateLabel !== lastDateLabel) {
                blocks.push(`<div class="message-separator">${dateLabel}</div>`);
                lastDateLabel = dateLabel;
            }
            if (block.type === 'tool-group') {
                blocks.push(this.renderToolActivityBlock(block));
                return;
            }
            blocks.push(this.renderMessage(block.message));
        });

        messagesContainer.innerHTML = blocks.join('');

        // Scroll to bottom
        this.scrollToBottom();
    }

    isToolActivityMessage(message) {
        if (!message || typeof message !== 'object') return false;
        return message.messageType === 'tool-call' ||
            message.messageType === 'tool-result' ||
            !!message.isToolCall ||
            !!message.isToolResult;
    }

    shouldRenderMessageBlock(message) {
        if (!message || typeof message !== 'object') return false;
        const hasImages = Array.isArray(message.images) && message.images.length > 0;
        const displayText = this.extractDisplayText(message);
        return hasImages || (typeof displayText === 'string' && displayText.trim().length > 0);
    }

    buildMessageBlockKey(message, index) {
        const messageId = this.resolveMessageId(message);
        if (messageId) return `message-${messageId}`;
        const timestamp = message?.timestamp ? new Date(message.timestamp).getTime() : Date.now();
        return `message-${timestamp}-${index}`;
    }

    buildToolGroupKey(messages, startIndex, endIndex) {
        const firstId = this.resolveMessageId(messages[0]) || `start-${startIndex}`;
        const lastId = this.resolveMessageId(messages[messages.length - 1]) || `end-${endIndex}`;
        return `tool-${firstId}-${lastId}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
    }

    groupRenderableMessages(messages) {
        const blocks = [];
        let index = 0;

        while (index < messages.length) {
            const message = messages[index];
            if (!message || typeof message !== 'object') {
                index += 1;
                continue;
            }

            if (this.isToolActivityMessage(message)) {
                const startIndex = index;
                const toolMessages = [];

                while (index < messages.length && this.isToolActivityMessage(messages[index])) {
                    toolMessages.push(messages[index]);
                    index += 1;
                }

                const rows = this.buildToolActivityRows(toolMessages);
                if (rows.length > 0) {
                    blocks.push({
                        type: 'tool-group',
                        key: this.buildToolGroupKey(toolMessages, startIndex, index - 1),
                        timestamp: toolMessages[toolMessages.length - 1]?.timestamp || toolMessages[0]?.timestamp || null,
                        rows,
                        status: this.deriveToolGroupStatus(rows)
                    });
                }
                continue;
            }

            if (this.shouldRenderMessageBlock(message)) {
                blocks.push({
                    type: 'message',
                    key: this.buildMessageBlockKey(message, index),
                    timestamp: message.timestamp || null,
                    message
                });
            }
            index += 1;
        }

        return blocks;
    }

    renderMessage(message) {
        const semantics = this.deriveMessageSemantics(message);
        const normalizedSource = semantics.source;
        const sourceClass = normalizedSource
            ? `source-${normalizedSource.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
            : '';
        const typeClass = semantics.messageType
            ? `message-type-${semantics.messageType.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
            : '';
        const platformLabel = (() => {
            const platform = typeof message.platform === 'string' ? message.platform.trim().toLowerCase() : '';
            if (platform === 'facebook') return 'Facebook';
            if (platform === 'line') return 'LINE';
            if (platform === 'instagram') return 'Instagram';
            if (platform === 'whatsapp') return 'WhatsApp';
            return '';
        })();

        let visualRole = 'assistant';
        let headerIcon = 'circle-info';
        let headerLabel = 'ระบบ';

        if (semantics.messageType === 'incoming') {
            visualRole = 'user';
            headerIcon = 'user';
            headerLabel = 'ลูกค้า';
        } else if (semantics.messageType === 'followup') {
            visualRole = 'followup';
            headerIcon = 'user-clock';
            headerLabel = 'ระบบติดตาม';
        } else if (semantics.messageType === 'admin-outbound') {
            visualRole = 'admin';
            headerIcon = normalizedSource === 'admin_page' ? 'inbox' : 'desktop';
            headerLabel = normalizedSource === 'admin_page' ? 'แอดมิน (เพจ)' : 'แอดมิน';
        } else if (semantics.messageType === 'ai-outbound') {
            visualRole = 'assistant';
            headerIcon = 'robot';
            headerLabel = 'AI';
        } else if (normalizedSource === 'comment_pull') {
            visualRole = 'assistant';
            headerIcon = 'comment-dots';
            headerLabel = 'ระบบ (ดึงคอมเมนต์)';
        }

        const displayText = this.extractDisplayText(message);
        const hasImages = Array.isArray(message.images) && message.images.length > 0;
        const hasTextContent = typeof displayText === 'string' && displayText.trim().length > 0;
        const time = message.timestamp ? this.formatTime(message.timestamp) : '';
        const messageId = this.resolveMessageId(message);
        const isSending = message.sending;
        const deliveryStatus = message.deliveryStatus || '';
        const showDeliveryStatus = semantics.customerVisible && deliveryStatus;
        const badgeHtml = semantics.customerVisible
            ? `<span class="message-badge message-badge--customer">ส่งถึงลูกค้า</span>`
            : '';
        const channelHtml = platformLabel
            ? `<span class="message-channel">${platformLabel}</span>`
            : '';
        const contentHtml = hasTextContent
            ? `<div class="message-content">${this.escapeHtml(displayText)}</div>`
            : '';

        let imagesHtml = '';
        if (message.images && message.images.length > 0) {
            imagesHtml = `
                <div class="message-images">
                    ${message.images.map(img => `
                        <div class="message-image" role="button" tabindex="0" aria-label="ดูรูปภาพ" data-image-src="${this.escapeHtml(img)}">
                            <img src="${this.escapeHtml(img)}" alt="รูปภาพ" loading="lazy">
                        </div>
                    `).join('')}
                </div>
            `;
        }


        return `
            <div class="message ${visualRole} ${sourceClass} ${typeClass} ${semantics.customerVisible ? 'message--customer-visible' : 'message--internal'}">
                <div class="message-bubble">
                    <div class="message-header">
                        <div class="message-header-main">
                            <span class="message-sender message-sender--${visualRole}">
                                <i class="fas fa-${headerIcon}"></i>
                                <span>${headerLabel}</span>
                            </span>
                            ${badgeHtml}
                        </div>
                        ${channelHtml}
                    </div>
                    ${contentHtml}
                    ${imagesHtml}
                    <div class="message-footer">
                        <div class="message-time">
                            ${isSending ? '<i class="fas fa-spinner fa-spin me-1"></i>' : ''}
                            ${time}
                        </div>
                        ${showDeliveryStatus ? `<div class="message-meta">${this.renderDeliveryStatus(deliveryStatus)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    renderDeliveryStatus(status) {
        const map = {
            sent: 'ส่งแล้ว',
            delivered: 'ส่งถึงผู้ใช้',
            read: 'ผู้ใช้เห็นข้อความแล้ว',
        };
        return map[status] || status;
    }

    showTypingIndicator(platformLabel = '') {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        let indicator = document.getElementById('typingIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'typingIndicator';
            indicator.className = 'message assistant';
            indicator.innerHTML = `
                <div class="message-bubble">
                    <div class="message-header">
                        <div class="message-header-main">
                            <span class="message-sender message-sender--assistant">
                                <i class="fas fa-robot"></i>
                                <span>AI</span>
                            </span>
                            <span class="message-badge message-badge--customer">ส่งถึงลูกค้า</span>
                        </div>
                        ${platformLabel ? `<span class="message-channel">${this.escapeHtml(platformLabel)}</span>` : ''}
                    </div>
                    <div class="message-content">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                    </div>
                </div>
            `;
            container.appendChild(indicator);
        }

        indicator.style.display = 'block';

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.hideTypingIndicator();
        }, 3000);

        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    updateMessageStatus(messageId, status) {
        if (!messageId || !status) return;
        const messages = this.chatHistory[this.currentUserId] || [];
        const target = messages.find(m => this.resolveMessageId(m) === messageId);
        if (target) {
            target.deliveryStatus = status;
            this.renderMessages();
        }
    }

    resolveMessageId(message) {
        if (!message || typeof message !== 'object') {
            return '';
        }
        if (typeof message.messageId === 'string' && message.messageId) {
            return message.messageId;
        }
        const rawId = message._id;
        let resolved = '';
        if (typeof rawId === 'string' && rawId) {
            resolved = rawId;
        } else if (rawId && typeof rawId.toHexString === 'function') {
            resolved = rawId.toHexString();
        } else if (rawId && typeof rawId.toString === 'function') {
            resolved = rawId.toString();
        } else if (rawId && rawId.$oid) {
            resolved = rawId.$oid;
        }
        if (resolved) {
            message.messageId = resolved;
        }
        return resolved || '';
    }

    findMessageById(messageId) {
        if (!messageId || !this.currentUserId) {
            return null;
        }
        const messages = this.chatHistory[this.currentUserId] || [];
        return messages.find(msg => this.resolveMessageId(msg) === messageId) || null;
    }



    scrollToBottom() {
        const messagesWrapper = document.getElementById('messagesWrapper');
        if (messagesWrapper) {
            setTimeout(() => {
                messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
            }, 100);
        }
    }

    syncOrderSidebarCollapseForViewport() {
        const orderSidebar = document.getElementById('orderSidebar');
        if (!orderSidebar) return;

        const isDesktopLayout = window.matchMedia('(min-width: 992px)').matches;
        if (!isDesktopLayout) {
            orderSidebar.classList.remove('collapsed');
            return;
        }

        const stored = localStorage.getItem('orderSidebarCollapsed');
        if (stored === null) {
            const shouldDefaultCollapse =
                window.matchMedia('(min-width: 992px) and (max-width: 1199.98px)').matches;
            orderSidebar.classList.toggle('collapsed', shouldDefaultCollapse);
            return;
        }

        orderSidebar.classList.toggle('collapsed', stored === 'true');
    }

    toggleOrderSidebarMobile(show = true) {
        const orderSidebar = document.getElementById('orderSidebar');
        const orderSidebarOverlay = document.getElementById('orderSidebarOverlay');
        if (!orderSidebar) return;

        if (show) {
            orderSidebar.classList.add('show');
            if (orderSidebarOverlay) {
                orderSidebarOverlay.classList.add('show');
            }
        } else {
            orderSidebar.classList.remove('show');
            if (orderSidebarOverlay) {
                orderSidebarOverlay.classList.remove('show');
            }
        }
    }

    toggleOrderSidebarCollapse() {
        const orderSidebar = document.getElementById('orderSidebar');
        if (!orderSidebar) return;

        const isDesktopLayout = window.matchMedia('(min-width: 992px)').matches;
        if (!isDesktopLayout) {
            this.toggleOrderSidebarMobile(false);
            return;
        }

        const isCollapsed = orderSidebar.classList.toggle('collapsed');
        localStorage.setItem('orderSidebarCollapsed', String(isCollapsed));
    }


    // ========================================
    // Send Message
    // ========================================

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        if (!messageInput || !this.currentUserId) return;

        const rawMessage = messageInput.value;
        if (!rawMessage.trim()) return;
        const message = rawMessage.replace(/\r\n/g, '\n');
        const currentUser = this.getCurrentUserRecord();

        // Optimistic UI: append temp message
        const tempMessage = this.prepareMessageForDisplay({
            role: 'admin',
            source: 'admin_chat',
            content: message,
            timestamp: new Date().toISOString(),
            sending: true,
            customerVisible: true,
            messageType: 'admin-outbound',
            platform: currentUser?.platform || this.currentChatContext?.platform || null,
            botId: currentUser?.botId || this.currentChatContext?.botId || null
        });
        if (!this.chatHistory[this.currentUserId]) {
            this.chatHistory[this.currentUserId] = [];
        }
        this.chatHistory[this.currentUserId].push(tempMessage);
        this.renderMessages();
        this.scrollToBottom();

        // Clear input immediately
        messageInput.value = '';
        if (typeof this.resizeMessageInput === 'function') {
            this.resizeMessageInput();
        } else {
            messageInput.style.height = 'auto';
        }
        const charCountEl = document.getElementById('charCount');
        if (charCountEl) {
            charCountEl.textContent = '0';
        }

        try {
            const response = await fetch('/admin/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: this.currentUserId,
                    message: message,
                    platform: currentUser?.platform || this.currentChatContext?.platform || null,
                    botId: currentUser?.botId || this.currentChatContext?.botId || null
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'ไม่สามารถส่งข้อความได้');
            }

            const history = this.chatHistory[this.currentUserId] || [];
            const idx = history.lastIndexOf(tempMessage);

            if (data.message && typeof data.message === 'object') {
                const normalizedMessage = this.prepareMessageForDisplay(data.message);
                if (idx >= 0) {
                    history[idx] = normalizedMessage;
                } else {
                    history.push(normalizedMessage);
                }
                this.renderMessages();
            } else {
                if (idx >= 0 && (data.silent || data.control)) {
                    history.splice(idx, 1);
                } else if (idx >= 0) {
                    history[idx].sending = false;
                    history[idx].awaitingEcho = true;
                }
                this.renderMessages();
            }

            if (data.displayMessage) {
                this.showToast(data.displayMessage, 'success');
            }
            this.loadUsers();
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('เกิดข้อผิดพลาดในการส่งข้อความ', 'error');
            // rollback temp message
            const history = this.chatHistory[this.currentUserId] || [];
            const idx = history.indexOf(tempMessage);
            if (idx >= 0) {
                history.splice(idx, 1);
                this.renderMessages();
            }
        }
    }

    // ========================================
    // Actions
    // ========================================

    async togglePurchaseStatus() {
        if (!this.currentUserId) return;

        const user = this.getCurrentUserRecord();
        if (!user) return;

        const newStatus = !user.hasPurchased;

        try {
            const response = await fetch(`/admin/chat/purchase-status/${this.currentUserId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
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

    async refreshCurrentUserProfile() {
        if (!this.currentUserId) {
            this.showToast('กรุณาเลือกผู้ใช้ก่อน', 'warning');
            return;
        }

        const user =
            this.getCurrentUserRecord();

        if (!user) {
            this.showToast('ไม่พบข้อมูลผู้ใช้ในรายการ', 'error');
            return;
        }

        if (user.platform !== 'facebook') {
            this.showToast('ปุ่มนี้ใช้ได้เฉพาะกับผู้ใช้ Facebook', 'info');
            return;
        }

        const btnRefreshProfile = document.getElementById('btnRefreshProfile');
        let originalHtml = null;
        if (btnRefreshProfile) {
            originalHtml = btnRefreshProfile.innerHTML;
            btnRefreshProfile.disabled = true;
            btnRefreshProfile.innerHTML =
                '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        }

        try {
            const response = await fetch(
                `/admin/chat/users/${encodeURIComponent(this.currentUserId)}/refresh-profile`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        platform: user.platform,
                        botId: user.botId || null,
                    }),
                },
            );

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'ไม่สามารถอัปเดตข้อมูลได้');
            }

            const newDisplayName = data.displayName || '';
            if (newDisplayName) {
                this.updateUserDisplayName(this.currentUserId, newDisplayName);
                this.showToast('อัปเดตชื่อผู้ใช้เรียบร้อย', 'success');
            } else {
                this.showToast('ไม่มีข้อมูลใหม่จาก Facebook', 'info');
            }

            await this.loadUsers();
            this.updateChatHeader();
        } catch (error) {
            console.error('Error refreshing profile:', error);
            this.showToast(error.message || 'เกิดข้อผิดพลาดในการอัปเดต', 'error');
        } finally {
            if (btnRefreshProfile) {
                btnRefreshProfile.disabled = false;
                btnRefreshProfile.innerHTML =
                    originalHtml || '<i class="fas fa-sync"></i>';
            }
        }
    }

    updateUserDisplayName(userId, displayName) {
        if (!userId || !displayName) {
            return;
        }

        const applyUpdate = (list) => {
            if (!Array.isArray(list)) return;
            const target = list.find((u) => u.userId === userId);
            if (target) {
                target.displayName = displayName;
            }
        };

        applyUpdate(this.allUsers);
        applyUpdate(this.users);

        if (this.currentUserId === userId) {
            const chatUserName = document.getElementById('chatUserName');
            if (chatUserName) {
                chatUserName.textContent = displayName;
            }
        }
    }

    async toggleAI() {
        if (!this.currentUserId) return;

        const user = this.getCurrentUserRecord();
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
                method: 'DELETE'
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
            const response = await fetch('/admin/chat/available-tags');
            const data = await response.json();

            if (data.success) {
                // API returns array of {tag, count} objects
                this.availableTags = data.tags ? data.tags.map(t => t.tag || t) : [];
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
            this.renderMobileSidebarState();
            return;
        }

	        tagFilters.innerHTML = this.availableTags.slice(0, 10).map(tag => `
	            <button type="button" class="tag-filter-btn ${this.currentFilters.tags.includes(tag) ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}">
	                ${this.escapeHtml(tag)}
	            </button>
	        `).join('');
        this.renderMobileSidebarState();
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
	    }

    openTagModal() {
        if (!this.currentUserId) return;

        const user = this.getCurrentUserRecord();
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
		                        <button type="button" class="btn-remove-tag" data-action="remove-tag" data-tag="${this.escapeHtml(tag)}">
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
		                    <span class="tag-item tag-item--selectable" style="cursor: pointer;" role="button" tabindex="0" data-action="add-tag" data-tag="${this.escapeHtml(tag)}">
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

        const user = this.getCurrentUserRecord();
        if (!user) return;

        const tags = user.tags || [];
        if (tags.includes(tag)) {
            this.showToast('แท็กนี้มีอยู่แล้ว', 'warning');
            return;
        }

        tags.push(tag);

        try {
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
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

    // ========================================
    // User Notes
    // ========================================

    async openUserNotesModal() {
        if (!this.currentUserId) {
            this.showToast('กรุณาเลือกผู้ใช้ก่อน', 'warning');
            return;
        }

        const user = this.getCurrentUserRecord();
        const notesModalUserName = document.getElementById('notesModalUserName');
        const userNotesTextarea = document.getElementById('userNotesTextarea');
        const notesLastUpdated = document.getElementById('notesLastUpdated');
        const notesUpdatedTime = document.getElementById('notesUpdatedTime');

        if (notesModalUserName) {
            notesModalUserName.textContent = user?.displayName || this.currentUserId;
        }

        if (userNotesTextarea) {
            userNotesTextarea.value = '';
        }

        if (notesLastUpdated) {
            notesLastUpdated.style.display = 'none';
        }

        // Load existing notes
        try {
            const response = await fetch(`/api/users/${this.currentUserId}/notes`);
            const data = await response.json();

            if (data.success && userNotesTextarea) {
                userNotesTextarea.value = data.notes || '';

                if (data.updatedAt && notesLastUpdated && notesUpdatedTime) {
                    notesUpdatedTime.textContent = this.formatRelativeTime(data.updatedAt);
                    notesLastUpdated.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Error loading user notes:', error);
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('userNotesModal'));
        modal.show();
    }

    async saveUserNotes() {
        if (!this.currentUserId) return;

        const userNotesTextarea = document.getElementById('userNotesTextarea');
        const notes = userNotesTextarea?.value || '';

        const saveBtn = document.getElementById('saveUserNotesBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>กำลังบันทึก...';
        }

        try {
            const response = await fetch(`/api/users/${this.currentUserId}/notes`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notes })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('บันทึกโน้ตแล้ว', 'success');

                // Update last updated time
                const notesLastUpdated = document.getElementById('notesLastUpdated');
                const notesUpdatedTime = document.getElementById('notesUpdatedTime');
                if (notesLastUpdated && notesUpdatedTime) {
                    notesUpdatedTime.textContent = 'เมื่อสักครู่';
                    notesLastUpdated.style.display = 'block';
                }
            } else {
                this.showToast('ไม่สามารถบันทึกโน้ตได้', 'error');
            }
        } catch (error) {
            console.error('Error saving user notes:', error);
            this.showToast('เกิดข้อผิดพลาด', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>บันทึก';
            }
        }
    }

    async removeTag(tag) {
        if (!this.currentUserId) return;

        const user = this.getCurrentUserRecord();
        if (!user) return;

        const tags = (user.tags || []).filter(t => t !== tag);

        try {
            const response = await fetch(`/admin/chat/tags/${this.currentUserId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
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

    ensureTemplatesLoaded() {
        if (this.quickReplies.length > 0) return;
        const stored = this.loadTemplatesFromStorage();
        if (stored.length > 0) {
            this.quickReplies = stored;
            return;
        }
        this.quickReplies = this.getDefaultTemplates();
        this.saveTemplatesToStorage();
    }

    loadTemplatesFromStorage() {
        try {
            const raw = localStorage.getItem(this.templateStorageKey);
            const parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Unable to load templates from storage', error);
            return [];
        }
    }

    saveTemplatesToStorage() {
        try {
            localStorage.setItem(this.templateStorageKey, JSON.stringify(this.quickReplies));
        } catch (error) {
            console.warn('Unable to save templates to storage', error);
        }
    }

    getDefaultTemplates() {
        return [
            { id: 'welcome', title: 'ทักทาย', message: 'สวัสดีครับ! ยินดีให้บริการครับ' },
            { id: 'thanks', title: 'ขอบคุณ', message: 'ขอบคุณมากครับที่ติดต่อเรา' },
            { id: 'wait', title: 'รอสักครู่', message: 'กรุณารอสักครู่นะครับ กำลังตรวจสอบข้อมูลให้' },
            { id: 'confirm', title: 'รับทราบ', message: 'รับทราบข้อมูลแล้วครับ จะดำเนินการให้เร็วที่สุด' }
        ];
    }

    openTemplateModal() {
        this.ensureTemplatesLoaded();
        this.renderTemplateList();
        const searchInput = document.getElementById('templateSearch');
        if (searchInput) searchInput.value = '';
        const modalEl = document.getElementById('templateModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }

    renderTemplateList() {
        const list = document.getElementById('templateList');
        if (!list) return;
        if (!this.quickReplies.length) {
            list.innerHTML = '<div class="text-muted text-center py-3">ไม่มี template</div>';
            return;
        }
        list.innerHTML = this.quickReplies.map(template => `
            <div class="template-item" data-id="${this.escapeHtml(template.id)}">
                <div class="template-title">${this.escapeHtml(template.title)}</div>
                <div class="template-content">${this.escapeHtml(template.message)}</div>
                <div class="template-actions">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-template-action="use">ใช้</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-template-action="edit">แก้ไข</button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-template-action="delete">ลบ</button>
                </div>
            </div>
        `).join('');
    }

    filterTemplates(searchTerm = '') {
        const term = (searchTerm || '').toLowerCase();
        document.querySelectorAll('.template-item').forEach(item => {
            const title = item.querySelector('.template-title')?.textContent.toLowerCase() || '';
            const content = item.querySelector('.template-content')?.textContent.toLowerCase() || '';
            const visible = !term || title.includes(term) || content.includes(term);
            item.style.display = visible ? '' : 'none';
        });
    }

    applyTemplateById(templateId) {
        const template = this.quickReplies.find(entry => entry.id === templateId);
        if (!template) return;
        if (template.message) {
            this.insertMessageAtCursor(template.message);
        }
        const modalEl = document.getElementById('templateModal');
        const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        if (modal) modal.hide();
    }

    openTemplateEditorModal(templateId = null) {
        this.ensureTemplatesLoaded();
        const label = document.getElementById('templateEditorModalLabel');
        const titleInput = document.getElementById('templateTitleInput');
        const messageInput = document.getElementById('templateMessageInput');
        if (!titleInput || !messageInput) return;

        const template = templateId
            ? this.quickReplies.find(entry => entry.id === templateId)
            : null;

        this.currentEditingTemplateId = template ? template.id : null;
        titleInput.value = template ? template.title : '';
        messageInput.value = template ? template.message : '';
        if (label) {
            label.textContent = template ? 'แก้ไข Template' : 'สร้าง Template ใหม่';
        }

        const templateModalEl = document.getElementById('templateModal');
        const templateModal = templateModalEl ? bootstrap.Modal.getInstance(templateModalEl) : null;
        if (templateModal) templateModal.hide();

        const editorEl = document.getElementById('templateEditorModal');
        if (!editorEl) return;
        const editorModal = bootstrap.Modal.getOrCreateInstance(editorEl);
        editorModal.show();
    }

    resetTemplateEditor() {
        this.currentEditingTemplateId = null;
        const titleInput = document.getElementById('templateTitleInput');
        const messageInput = document.getElementById('templateMessageInput');
        if (titleInput) titleInput.value = '';
        if (messageInput) messageInput.value = '';
    }

    saveTemplateFromEditor() {
        const titleInput = document.getElementById('templateTitleInput');
        const messageInput = document.getElementById('templateMessageInput');
        if (!titleInput || !messageInput) return;
        const title = titleInput.value.trim();
        const message = messageInput.value.trim();
        if (!title || !message) {
            this.showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
            return;
        }

        if (this.currentEditingTemplateId) {
            const idx = this.quickReplies.findIndex(entry => entry.id === this.currentEditingTemplateId);
            if (idx !== -1) {
                this.quickReplies[idx] = { id: this.currentEditingTemplateId, title, message };
            }
        } else {
            this.quickReplies.push({ id: `template_${Date.now()}`, title, message });
        }

        this.saveTemplatesToStorage();
        this.renderTemplateList();
        this.filterTemplates(document.getElementById('templateSearch')?.value || '');

        const editorEl = document.getElementById('templateEditorModal');
        const editorModal = editorEl ? bootstrap.Modal.getInstance(editorEl) : null;
        if (editorModal) editorModal.hide();

        const templateModalEl = document.getElementById('templateModal');
        if (templateModalEl) {
            const templateModal = bootstrap.Modal.getOrCreateInstance(templateModalEl);
            templateModal.show();
        }

        this.showToast(this.currentEditingTemplateId ? 'แก้ไข Template แล้ว' : 'สร้าง Template แล้ว', 'success');
    }

    deleteTemplate(templateId) {
        if (!confirm('ต้องการลบ Template นี้หรือไม่?')) return;
        this.quickReplies = this.quickReplies.filter(entry => entry.id !== templateId);
        this.saveTemplatesToStorage();
        this.renderTemplateList();
        this.filterTemplates(document.getElementById('templateSearch')?.value || '');
        this.showToast('ลบ Template แล้ว', 'success');
    }

    insertMessageAtCursor(text) {
        const messageInput = document.getElementById('messageInput');
        if (!messageInput) return;
        const value = messageInput.value || '';
        const start = Number.isInteger(messageInput.selectionStart) ? messageInput.selectionStart : value.length;
        const end = Number.isInteger(messageInput.selectionEnd) ? messageInput.selectionEnd : value.length;
        const nextValue = value.slice(0, start) + text + value.slice(end);
        messageInput.value = nextValue;
        const cursorPos = start + text.length;
        messageInput.setSelectionRange(cursorPos, cursorPos);
        messageInput.focus();
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ========================================
    // Emoji Picker
    // ========================================

    toggleEmojiPicker(anchorEl) {
        if (!anchorEl) return;
        if (!this.emojiPicker) {
            this.emojiPicker = this.createEmojiPicker();
            document.body.appendChild(this.emojiPicker);
        }
        const isVisible = this.emojiPicker.style.display === 'grid';
        if (isVisible) {
            this.hideEmojiPicker();
            return;
        }
        this.emojiPicker.style.display = 'grid';
        this.emojiPicker.style.visibility = 'hidden';
        this.positionEmojiPicker(anchorEl);
        this.emojiPicker.style.visibility = 'visible';
    }

    createEmojiPicker() {
        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        picker.style.display = 'none';
        const emojis = ['😊', '🙏', '👍', '✅', '❌', '⏳', '📦', '📍', '💬', '🎉', '👀', '🙌'];
        emojis.forEach(emoji => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = emoji;
            button.addEventListener('click', (event) => {
                event.preventDefault();
                this.insertMessageAtCursor(emoji);
                this.hideEmojiPicker();
            });
            picker.appendChild(button);
        });
        return picker;
    }

    positionEmojiPicker(anchorEl) {
        if (!this.emojiPicker) return;
        const rect = anchorEl.getBoundingClientRect();
        const pickerRect = this.emojiPicker.getBoundingClientRect();
        const padding = 12;
        let top = rect.top + window.scrollY - pickerRect.height - 8;
        let left = rect.left + window.scrollX;
        if (top < window.scrollY + padding) {
            top = rect.bottom + window.scrollY + 8;
        }
        const maxLeft = window.scrollX + window.innerWidth - pickerRect.width - padding;
        if (left > maxLeft) {
            left = maxLeft;
        }
        if (left < window.scrollX + padding) {
            left = window.scrollX + padding;
        }
        this.emojiPicker.style.top = `${Math.round(top)}px`;
        this.emojiPicker.style.left = `${Math.round(left)}px`;
    }

    hideEmojiPicker() {
        if (!this.emojiPicker) return;
        this.emojiPicker.style.display = 'none';
        this.emojiPicker.style.visibility = 'hidden';
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
        const normalizedMessage = this.prepareMessageForDisplay({
            ...message,
        });
        if (!Object.prototype.hasOwnProperty.call(normalizedMessage, 'feedback')) {
            normalizedMessage.feedback = null;
        }

        const messagePageKey = this.buildPageKey(
            normalizedMessage.platform,
            normalizedMessage.botId
        );
        const currentPageKey = this.currentChatContext?.pageKey || '';
        const shouldAppendToCurrentHistory =
            userId !== this.currentUserId ||
            !currentPageKey ||
            currentPageKey === messagePageKey;

        if (shouldAppendToCurrentHistory) {
            if (!this.chatHistory[userId]) {
                this.chatHistory[userId] = [];
            }
            const replacedOptimistic = this.replaceOptimisticOutgoingMessage(userId, normalizedMessage);
            if (!replacedOptimistic) {
                this.chatHistory[userId].push(normalizedMessage);
            }
        }

        // Update UI if this is the current chat
        if (userId === this.currentUserId && shouldAppendToCurrentHistory) {
            this.renderMessages();
        }

        // Update user list
        this.loadUsers();
        this.updateDebugPanel();
    }

    handleFollowUpTagged(data) {
        const user = this.allUsers.find(u => u.userId === data.userId);
        if (user) {
            user.hasFollowUp = !!data.hasFollowUp;
            user.followUpReason = data.followUpReason || '';
            user.followUpUpdatedAt = data.followUpUpdatedAt || null;
            if (data.hasFollowUp) {
                user.hasPurchased = true;
            }
            if (!user.followUp || typeof user.followUp !== 'object') {
                user.followUp = {};
            }
            this.applyFilters();
            this.updateDebugPanel();
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
            search: '',
            pageKeys: []
        };

        // Reset UI
        this.syncStatusFilterButtons();
        this.syncSearchInputs();

        this.renderPageFilters();
        this.renderTagFilters();
        this.applyFilters();
        this.loadUsers();
    }

    updateFilterBadge() {
        let count = 0;
        if (this.currentFilters.status !== 'all') count++;
        count += this.currentFilters.pageKeys.length;
        count += this.currentFilters.tags.length;
        if (this.currentFilters.search) count++;

        document.querySelectorAll('[data-filter-badge]').forEach((badge) => {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        });
        this.renderMobileSidebarState();
    }

    syncSearchInputs(source = null) {
        const nextValue = this.currentFilters.search || '';
        document.querySelectorAll('[data-user-search]').forEach((input) => {
            if (source && input === source) return;
            if (input.value !== nextValue) {
                input.value = nextValue;
            }
        });
    }

    syncStatusFilterButtons() {
        document.querySelectorAll('.filter-btn[data-filter]').forEach((button) => {
            const isActive = button.dataset.filter === this.currentFilters.status;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    isMobileSidebarViewport() {
        return window.matchMedia('(max-width: 767.98px)').matches;
    }

    getSidebarMetrics() {
        const users = Array.isArray(this.allUsers) ? this.allUsers : [];
        return {
            all: users.length,
            unread: users.filter((user) => Number(user.unreadCount) > 0).length,
            followup: users.filter((user) => user.followUp && user.followUp.isFollowUp).length,
            purchased: users.filter((user) => !!user.hasPurchased).length
        };
    }

    renderMobileSidebarState() {
        const metrics = this.getSidebarMetrics();
        document.querySelectorAll('[data-mobile-stat]').forEach((node) => {
            const key = node.dataset.mobileStat;
            node.textContent = Number(metrics[key] || 0);
        });

        const activeFilters = [];
        if (this.currentFilters.status !== 'all') {
            const statusMap = {
                unread: 'ยังไม่อ่าน',
                followup: 'ติดตาม',
                purchased: 'ซื้อแล้ว'
            };
            activeFilters.push(statusMap[this.currentFilters.status] || this.currentFilters.status);
        }
        if (this.currentFilters.pageKeys.length > 0) {
            activeFilters.push(`เพจ ${this.currentFilters.pageKeys.length}`);
        }
        if (this.currentFilters.tags.length > 0) {
            activeFilters.push(...this.currentFilters.tags.slice(0, 3).map((tag) => `#${tag}`));
            if (this.currentFilters.tags.length > 3) {
                activeFilters.push(`แท็ก+${this.currentFilters.tags.length - 3}`);
            }
        }
        if (this.currentFilters.search) {
            activeFilters.push(`ค้นหา “${this.currentFilters.search}”`);
        }

        const mobileActiveFilters = document.getElementById('mobileActiveFilters');
        if (!mobileActiveFilters) return;

        if (activeFilters.length === 0) {
            mobileActiveFilters.classList.add('is-empty');
            mobileActiveFilters.innerHTML = '';
            requestAnimationFrame(() => {
                this.syncMobileSidebarLayout();
            });
            return;
        }

        mobileActiveFilters.classList.remove('is-empty');
        mobileActiveFilters.innerHTML = activeFilters.map((label) => `
            <span class="mobile-active-filter-chip">${this.escapeHtml(label)}</span>
        `).join('');
        requestAnimationFrame(() => {
            this.syncMobileSidebarLayout();
        });
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
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    parseJsonIfPossible(value) {
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        if (!trimmed) return value;
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            return value;
        }
        try {
            return JSON.parse(trimmed);
        } catch (_) {
            return value;
        }
    }

    formatCurrency(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '';
        return `฿${numeric.toLocaleString('th-TH')}`;
    }

    formatOrderStatusLabel(status) {
        const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
        const statusLabels = {
            pending: 'รอดำเนินการ',
            confirmed: 'ยืนยันแล้ว',
            shipped: 'จัดส่งแล้ว',
            completed: 'เสร็จสิ้น',
            cancelled: 'ยกเลิก'
        };
        return statusLabels[normalized] || (typeof status === 'string' ? status : '');
    }

    formatToolDateTime(value) {
        if (!value) return '';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('th-TH', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    summarizeOrderItems(items) {
        if (!Array.isArray(items) || items.length === 0) return '';
        const visibleItems = items
            .map((item) => {
                if (!item || typeof item !== 'object') return '';
                const product = String(item.product || 'สินค้า').trim();
                const quantity = Number(item.quantity);
                const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
                return `${product} x${safeQuantity}`;
            })
            .filter(Boolean);

        if (visibleItems.length === 0) return '';
        const preview = visibleItems.slice(0, 3).join(', ');
        if (visibleItems.length <= 3) return preview;
        return `${preview} และอีก ${visibleItems.length - 3} รายการ`;
    }

    summarizeSearchResultRow(row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return '';
        const entries = Object.entries(row)
            .map(([key, value]) => {
                const normalizedValue = value === null || typeof value === 'undefined'
                    ? ''
                    : String(value).trim();
                if (!normalizedValue) return '';
                return `${key}: ${normalizedValue}`;
            })
            .filter(Boolean);

        return entries.slice(0, 3).join(' · ');
    }

    isRecognizedToolPayload(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return false;
        }

        return (
            Object.prototype.hasOwnProperty.call(payload, 'success') ||
            Object.prototype.hasOwnProperty.call(payload, 'error') ||
            Object.prototype.hasOwnProperty.call(payload, 'message') ||
            Object.prototype.hasOwnProperty.call(payload, 'orderId') ||
            Object.prototype.hasOwnProperty.call(payload, 'existingOrderId') ||
            Object.prototype.hasOwnProperty.call(payload, 'missingFields') ||
            Array.isArray(payload.orders) ||
            Array.isArray(payload.categories) ||
            Array.isArray(payload.data)
        );
    }

    buildReadableToolText(message, structured) {
        if (!this.isRecognizedToolPayload(structured)) {
            return '';
        }

        const payload = structured;
        const lines = [];
        const role = typeof message?.role === 'string' ? message.role.trim().toLowerCase() : '';
        const likelyToolMessage = role === 'tool' || role === '' || !!message?.isToolResult;

        if (!likelyToolMessage && !Array.isArray(payload.orders) && !Array.isArray(payload.categories) && !Array.isArray(payload.data)) {
            return '';
        }

        if (Array.isArray(payload.orders)) {
            const orders = payload.orders;
            if (orders.length === 0) {
                return typeof payload.message === 'string' && payload.message.trim()
                    ? payload.message.trim()
                    : 'ยังไม่มีออเดอร์ของลูกค้ารายนี้';
            }

            const totalOrders = Number(payload.totalOrders);
            const visibleTotal = Number.isFinite(totalOrders) && totalOrders > 0 ? totalOrders : orders.length;
            lines.push(
                typeof payload.message === 'string' && payload.message.trim()
                    ? payload.message.trim()
                    : `พบ ${visibleTotal} ออเดอร์`
            );

            orders.slice(0, 3).forEach((order, index) => {
                if (!order || typeof order !== 'object') return;
                const itemSummary = this.summarizeOrderItems(order.items);
                const totalAmount = this.formatCurrency(order.totalAmount);
                const statusLabel = this.formatOrderStatusLabel(order.status);
                const createdAt = this.formatToolDateTime(order.createdAt);
                const summaryParts = [];
                if (itemSummary) summaryParts.push(itemSummary);
                if (totalAmount) summaryParts.push(`รวม ${totalAmount}`);
                if (statusLabel) summaryParts.push(statusLabel);
                if (createdAt) summaryParts.push(createdAt);
                const line = summaryParts.length > 0
                    ? `${index + 1}. ${summaryParts.join(' · ')}`
                    : `${index + 1}. ออเดอร์ #${index + 1}`;
                lines.push(line);
            });

            if (orders.length > 3) {
                lines.push(`และอีก ${orders.length - 3} ออเดอร์`);
            }

            return lines.join('\n');
        }

        if (payload.success === true && payload.orderId) {
            const orderData = payload.orderData || payload.order?.orderData || payload.order || {};
            const itemSummary = this.summarizeOrderItems(orderData.items);
            const totalAmount = this.formatCurrency(orderData.totalAmount);
            const statusLabel = this.formatOrderStatusLabel(payload.status || payload.order?.status);
            const customerName = String(orderData.customerName || orderData.recipientName || '').trim();
            const title = payload.orderData ? 'บันทึกออเดอร์เรียบร้อย' : 'อัปเดตออเดอร์เรียบร้อย';

            lines.push(title);
            lines.push(`เลขออเดอร์: ${payload.orderId}`);
            if (itemSummary) lines.push(`รายการ: ${itemSummary}`);
            if (totalAmount) lines.push(`ยอดรวม: ${totalAmount}`);
            if (customerName) lines.push(`ลูกค้า: ${customerName}`);
            if (statusLabel) lines.push(`สถานะ: ${statusLabel}`);
            return lines.join('\n');
        }

        if (payload.success === false) {
            if (payload.existingOrderId) {
                lines.push('พบออเดอร์เดิมที่มีรายการสินค้าซ้ำกัน');
                lines.push(`เลขออเดอร์เดิม: ${payload.existingOrderId}`);
                const existingOrder = payload.existingOrder || {};
                const itemSummary = this.summarizeOrderItems(existingOrder.items);
                const totalAmount = this.formatCurrency(existingOrder.totalAmount);
                if (itemSummary) lines.push(`รายการเดิม: ${itemSummary}`);
                if (totalAmount) lines.push(`ยอดรวมเดิม: ${totalAmount}`);
            }

            const errorText = typeof payload.error === 'string' && payload.error.trim()
                ? payload.error.trim()
                : typeof payload.message === 'string' && payload.message.trim()
                    ? payload.message.trim()
                    : 'ดำเนินการไม่สำเร็จ';
            lines.push(errorText);

            if (Array.isArray(payload.missingFields) && payload.missingFields.length > 0) {
                lines.push(`ข้อมูลที่ยังขาด: ${payload.missingFields.join(', ')}`);
            }

            return lines.join('\n');
        }

        if (Array.isArray(payload.categories)) {
            const categories = payload.categories;
            if (categories.length === 0) {
                return 'ยังไม่มีหมวดหมู่สินค้า';
            }

            lines.push('หมวดหมู่สินค้าที่ใช้งานได้');
            categories.slice(0, 8).forEach((category, index) => {
                const name = String(category?.name || '').trim();
                const description = String(category?.description || '').trim();
                if (!name) return;
                lines.push(description ? `${index + 1}. ${name} - ${description}` : `${index + 1}. ${name}`);
            });
            if (categories.length > 8) {
                lines.push(`และอีก ${categories.length - 8} หมวดหมู่`);
            }
            return lines.join('\n');
        }

        if (Array.isArray(payload.data)) {
            const results = payload.data;
            if (results.length === 0) {
                return typeof payload.message === 'string' && payload.message.trim()
                    ? payload.message.trim()
                    : 'ไม่พบข้อมูลที่ค้นหา';
            }

            lines.push(`พบข้อมูล ${results.length} รายการ`);
            results.slice(0, 5).forEach((row, index) => {
                const summary = this.summarizeSearchResultRow(row);
                lines.push(summary ? `${index + 1}. ${summary}` : `${index + 1}. พบข้อมูล`);
            });
            if (results.length > 5) {
                lines.push(`และอีก ${results.length - 5} รายการ`);
            }
            return lines.join('\n');
        }

        if (typeof payload.message === 'string' && payload.message.trim()) {
            return payload.message.trim();
        }

        if (payload.success === true) {
            return 'ดำเนินการสำเร็จ';
        }

        return '';
    }

    deriveMessageSemantics(message) {
        const role = typeof message?.role === 'string' && message.role.trim()
            ? message.role.trim().toLowerCase()
            : '';
        const source = typeof message?.source === 'string' && message.source.trim()
            ? message.source.trim().toLowerCase()
            : '';
        const toolCalls = Array.isArray(message?.toolCalls)
            ? message.toolCalls
            : Array.isArray(message?.tool_calls)
                ? message.tool_calls
                : [];
        const toolCallIdCandidate = message?.toolCallId || message?.tool_call_id || '';
        const toolCallId = typeof toolCallIdCandidate === 'string' && toolCallIdCandidate.trim()
            ? toolCallIdCandidate.trim()
            : '';
        const toolNameCandidate = message?.toolName || message?.name || '';
        const toolName = typeof toolNameCandidate === 'string' && toolNameCandidate.trim()
            ? toolNameCandidate.trim()
            : '';
        const contentText = typeof message?.content === 'string' ? message.content.trim() : '';
        const isToolCall = Boolean(message?.isToolCall) || (role === 'assistant' && toolCalls.length > 0);
        const isToolResult = Boolean(message?.isToolResult) || (role === 'tool' && !!toolCallId);
        const isControlMessage =
            (source === 'admin_chat' || source === 'admin_page') &&
            contentText.startsWith('[ระบบ]');

        let messageType = typeof message?.messageType === 'string' && message.messageType.trim()
            ? message.messageType.trim()
            : '';

        if (!messageType) {
            if (role === 'user') {
                messageType = 'incoming';
            } else if (role === 'admin') {
                messageType = 'admin-outbound';
            } else if (isToolCall) {
                messageType = 'tool-call';
            } else if (isToolResult) {
                messageType = 'tool-result';
            } else if (source === 'follow_up') {
                messageType = 'followup';
            } else if ((source === 'admin_chat' || source === 'admin_page') && !isControlMessage) {
                messageType = 'admin-outbound';
            } else if (source === 'ai') {
                messageType = 'ai-outbound';
            } else {
                messageType = 'system';
            }
        }

        let customerVisible = typeof message?.customerVisible === 'boolean'
            ? message.customerVisible
            : ['admin-outbound', 'ai-outbound', 'followup'].includes(messageType);

        if (isControlMessage) {
            customerVisible = false;
            if (messageType === 'admin-outbound') {
                messageType = 'system';
            }
        }

        return {
            role,
            source,
            messageType,
            customerVisible,
            toolCalls,
            toolCallId,
            toolName,
            isToolCall,
            isToolResult
        };
    }

    replaceOptimisticOutgoingMessage(userId, incomingMessage) {
        const history = this.chatHistory[userId] || [];
        const incomingSemantics = this.deriveMessageSemantics(incomingMessage);
        if (incomingSemantics.messageType !== 'admin-outbound') {
            return false;
        }

        const incomingText = this.extractDisplayText(incomingMessage).trim();

        for (let index = history.length - 1; index >= 0; index -= 1) {
            const candidate = history[index];
            if (!candidate || typeof candidate !== 'object') continue;
            if (!candidate.sending && !candidate.awaitingEcho) continue;

            const candidateSemantics = this.deriveMessageSemantics(candidate);
            if (candidateSemantics.messageType !== incomingSemantics.messageType) continue;

            const samePlatform = String(candidate.platform || '') === String(incomingMessage.platform || '');
            const sameBot = String(candidate.botId || '') === String(incomingMessage.botId || '');
            if (!samePlatform || !sameBot) continue;

            const candidateText = this.extractDisplayText(candidate).trim();
            if (incomingText && candidateText && candidateText === incomingText) {
                history[index] = incomingMessage;
                return true;
            }
        }

        return false;
    }

    getToolType(toolName) {
        const normalized = typeof toolName === 'string' ? toolName.trim().toLowerCase() : '';
        if (!normalized) return 'default';
        if (
            normalized.includes('search') ||
            normalized.includes('get') ||
            normalized.includes('list') ||
            normalized.includes('find')
        ) {
            return 'search';
        }
        if (
            normalized.includes('update') ||
            normalized.includes('rename') ||
            normalized.includes('edit') ||
            normalized.includes('set')
        ) {
            return 'edit';
        }
        if (
            normalized.includes('add') ||
            normalized.includes('create') ||
            normalized.includes('save') ||
            normalized.includes('insert')
        ) {
            return 'add';
        }
        if (normalized.includes('delete') || normalized.includes('remove')) {
            return 'delete';
        }
        return 'default';
    }

    getToolIcon(toolType) {
        return {
            search: 'fa-magnifying-glass',
            edit: 'fa-pen',
            add: 'fa-plus',
            delete: 'fa-trash',
            default: 'fa-wrench'
        }[toolType] || 'fa-wrench';
    }

    formatToolPreviewValue(value) {
        if (value === null || typeof value === 'undefined') return '';
        if (Array.isArray(value)) return `[${value.length}]`;
        if (typeof value === 'object') return '{...}';
        const normalized = String(value).trim().replace(/\s+/g, ' ');
        return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized;
    }

    buildToolArgsPreview(rawArguments) {
        if (rawArguments === null || typeof rawArguments === 'undefined' || rawArguments === '') {
            return '';
        }

        const parsedArguments = this.parseJsonIfPossible(rawArguments);
        if (parsedArguments && typeof parsedArguments === 'object' && !Array.isArray(parsedArguments)) {
            const entries = Object.entries(parsedArguments)
                .filter(([, value]) => value !== null && typeof value !== 'undefined' && String(value).trim() !== '')
                .slice(0, 2)
                .map(([key, value]) => `${key}=${this.formatToolPreviewValue(value)}`);
            if (entries.length === 0) return '';
            const extraCount = Math.max(0, Object.keys(parsedArguments).length - entries.length);
            const suffix = extraCount > 0 ? ` +${extraCount}` : '';
            return this.truncateText(`${entries.join(' · ')}${suffix}`, 72);
        }

        if (Array.isArray(parsedArguments)) {
            return this.truncateText(`[${parsedArguments.length}]`, 72);
        }

        const normalized = String(rawArguments).trim().replace(/\s+/g, ' ');
        return normalized ? this.truncateText(normalized, 72) : '';
    }

    prettyPrintToolData(value) {
        if (value === null || typeof value === 'undefined' || value === '') {
            return '';
        }

        const parsed = this.parseJsonIfPossible(value);
        if (parsed && typeof parsed === 'object') {
            try {
                return JSON.stringify(parsed, null, 2);
            } catch (_) {
                return '';
            }
        }

        if (typeof value === 'string') {
            return value.trim();
        }

        try {
            return JSON.stringify(value, null, 2);
        } catch (_) {
            return String(value);
        }
    }

    extractToolCallInfo(toolCall) {
        const fnPayload = toolCall?.function && typeof toolCall.function === 'object'
            ? toolCall.function
            : null;
        const callIdCandidate = toolCall?.call_id || toolCall?.id || toolCall?.tool_call_id || '';
        const callId = typeof callIdCandidate === 'string' && callIdCandidate.trim()
            ? callIdCandidate.trim()
            : '';
        const toolNameCandidate = toolCall?.name || fnPayload?.name || toolCall?.tool || '';
        const toolName = typeof toolNameCandidate === 'string' && toolNameCandidate.trim()
            ? toolNameCandidate.trim()
            : '';

        let rawArguments = null;
        if (typeof toolCall?.arguments === 'string' && toolCall.arguments.trim()) {
            rawArguments = toolCall.arguments;
        } else if (typeof fnPayload?.arguments === 'string' && fnPayload.arguments.trim()) {
            rawArguments = fnPayload.arguments;
        } else if (toolCall?.arguments && typeof toolCall.arguments === 'object') {
            rawArguments = toolCall.arguments;
        } else if (fnPayload?.arguments && typeof fnPayload.arguments === 'object') {
            rawArguments = fnPayload.arguments;
        }

        return {
            callId,
            toolName,
            rawArguments
        };
    }

    createToolRow(options = {}) {
        const toolName = options.toolName || 'tool';
        const toolType = this.getToolType(toolName);
        return {
            key: options.key || `tool-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            callId: options.callId || '',
            toolName,
            toolType,
            toolIcon: this.getToolIcon(toolType),
            argsPreview: options.argsPreview || '',
            argsRaw: options.argsRaw || '',
            resultSummary: options.resultSummary || '',
            resultDetails: Array.isArray(options.resultDetails) ? options.resultDetails : [],
            rawPayload: options.rawPayload || '',
            status: options.status || 'pending',
            startedAt: options.startedAt || null,
            finishedAt: options.finishedAt || null,
            order: Number.isFinite(options.order) ? options.order : 0
        };
    }

    findPendingToolRow(rows, toolName = '') {
        for (let index = rows.length - 1; index >= 0; index -= 1) {
            const row = rows[index];
            if (!row || row.status !== 'pending') continue;
            if (toolName && row.toolName !== toolName) continue;
            return row;
        }
        return null;
    }

    deriveToolRowStatus(payload, message) {
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            if (
                payload.success === false ||
                (typeof payload.error === 'string' && payload.error.trim())
            ) {
                return 'error';
            }
            return 'success';
        }

        const rawPayload = typeof message?.rawContent !== 'undefined' ? message.rawContent : message?.content;
        if (typeof rawPayload === 'string' && rawPayload.trim()) {
            return 'success';
        }
        return 'pending';
    }

    deriveToolGroupStatus(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return 'pending';
        }
        if (rows.some((row) => row.status === 'error')) {
            return 'error';
        }
        if (rows.some((row) => row.status === 'pending')) {
            return 'pending';
        }
        return 'success';
    }

    formatToolGroupStatusLabel(status) {
        return {
            pending: 'กำลังทำงาน',
            success: 'สำเร็จ',
            error: 'มีข้อผิดพลาด'
        }[status] || 'กำลังทำงาน';
    }

    formatToolRowStatusLabel(status) {
        return {
            pending: 'รอผลลัพธ์',
            success: 'สำเร็จ',
            error: 'ผิดพลาด'
        }[status] || 'รอผลลัพธ์';
    }

    buildToolActivityRows(messages) {
        const rows = [];
        const rowsByCallId = new Map();

        messages.forEach((message, messageIndex) => {
            const semantics = this.deriveMessageSemantics(message);
            const toolCalls = Array.isArray(semantics.toolCalls) ? semantics.toolCalls : [];

            toolCalls.forEach((toolCall, toolIndex) => {
                const callInfo = this.extractToolCallInfo(toolCall);
                let row = callInfo.callId ? rowsByCallId.get(callInfo.callId) : null;
                if (!row) {
                    row = this.createToolRow({
                        key: callInfo.callId || `tool-call-${messageIndex}-${toolIndex}`,
                        callId: callInfo.callId,
                        toolName: callInfo.toolName || 'tool',
                        argsPreview: this.buildToolArgsPreview(callInfo.rawArguments),
                        argsRaw: this.prettyPrintToolData(callInfo.rawArguments),
                        startedAt: message.timestamp || null,
                        order: rows.length
                    });
                    rows.push(row);
                    if (callInfo.callId) {
                        rowsByCallId.set(callInfo.callId, row);
                    }
                    return;
                }

                if (!row.toolName && callInfo.toolName) {
                    row.toolName = callInfo.toolName;
                }
                if (!row.argsPreview && callInfo.rawArguments !== null) {
                    row.argsPreview = this.buildToolArgsPreview(callInfo.rawArguments);
                }
                if (!row.argsRaw && callInfo.rawArguments !== null) {
                    row.argsRaw = this.prettyPrintToolData(callInfo.rawArguments);
                }
                if (!row.startedAt) {
                    row.startedAt = message.timestamp || null;
                }
                row.toolType = this.getToolType(row.toolName);
                row.toolIcon = this.getToolIcon(row.toolType);
            });

            if (!semantics.isToolResult && semantics.messageType !== 'tool-result') {
                return;
            }

            const rawPayload = typeof message.rawContent !== 'undefined' ? message.rawContent : message.content;
            const parsedPayload = this.parseJsonIfPossible(rawPayload);
            const readableText = this.buildReadableToolText({
                ...message,
                isToolResult: true,
                messageType: 'tool-result'
            }, parsedPayload);
            const readableLines = typeof readableText === 'string'
                ? readableText.split('\n').map((line) => line.trim()).filter(Boolean)
                : [];

            let row = semantics.toolCallId ? rowsByCallId.get(semantics.toolCallId) : null;
            if (!row) {
                row = this.findPendingToolRow(rows, semantics.toolName);
            }
            if (!row) {
                row = this.createToolRow({
                    key: semantics.toolCallId || `tool-result-${messageIndex}`,
                    callId: semantics.toolCallId,
                    toolName: semantics.toolName || 'tool',
                    startedAt: message.timestamp || null,
                    order: rows.length
                });
                rows.push(row);
            }

            if (semantics.toolCallId && !row.callId) {
                row.callId = semantics.toolCallId;
            }
            if (semantics.toolCallId) {
                rowsByCallId.set(semantics.toolCallId, row);
            }
            if (!row.toolName && semantics.toolName) {
                row.toolName = semantics.toolName;
            }

            row.toolType = this.getToolType(row.toolName);
            row.toolIcon = this.getToolIcon(row.toolType);
            row.rawPayload = this.prettyPrintToolData(rawPayload);
            row.status = this.deriveToolRowStatus(parsedPayload, message);
            row.finishedAt = message.timestamp || row.finishedAt;

            if (readableLines.length > 0) {
                row.resultSummary = readableLines[0];
                row.resultDetails = readableLines.slice(1);
            } else {
                const rawSummary = row.rawPayload
                    ? row.rawPayload.replace(/\s+/g, ' ').trim()
                    : '';
                row.resultSummary = rawSummary
                    ? this.truncateText(rawSummary, 96)
                    : this.formatToolRowStatusLabel(row.status);
                row.resultDetails = [];
            }
        });

        return rows
            .sort((left, right) => left.order - right.order)
            .map((row) => {
                if (!row.resultSummary) {
                    row.resultSummary = this.formatToolRowStatusLabel(row.status);
                }
                return row;
            });
    }

    renderToolActivityRow(row) {
        const argsHtml = row.argsPreview
            ? `
                <div class="message-tool-row__args">
                    <span class="message-tool-row__label">args</span>
                    <code>${this.escapeHtml(row.argsPreview)}</code>
                </div>
            `
            : '';
        const detailHtml = row.resultDetails.length > 0
            ? `
                <div class="message-tool-row__details">
                    ${row.resultDetails.map((line) => `<div>${this.escapeHtml(line)}</div>`).join('')}
                </div>
            `
            : '';

        const rawSections = [];
        if (row.argsRaw) {
            rawSections.push(`
                <div class="message-tool-raw__section">
                    <div class="message-tool-raw__label">args</div>
                    <pre>${this.escapeHtml(row.argsRaw)}</pre>
                </div>
            `);
        }
        if (row.rawPayload) {
            rawSections.push(`
                <div class="message-tool-raw__section">
                    <div class="message-tool-raw__label">result</div>
                    <pre>${this.escapeHtml(row.rawPayload)}</pre>
                </div>
            `);
        }

        const rawHtml = rawSections.length > 0
            ? `
                <details class="message-tool-raw">
                    <summary>ดู raw</summary>
                    ${rawSections.join('')}
                </details>
            `
            : '';

        const rowTime = row.finishedAt || row.startedAt;

        return `
            <div class="message-tool-row message-tool-row--${row.status}" data-tool-type="${this.escapeHtml(row.toolType)}">
                <div class="message-tool-row__main">
                    <div class="message-tool-row__icon">
                        <i class="fas ${row.toolIcon}"></i>
                    </div>
                    <div class="message-tool-row__content">
                        <div class="message-tool-row__topline">
                            <code class="message-tool-row__name">${this.escapeHtml(row.toolName || 'tool')}</code>
                            <span class="message-tool-row__status">${this.escapeHtml(this.formatToolRowStatusLabel(row.status))}</span>
                            ${rowTime ? `<span class="message-tool-row__time">${this.escapeHtml(this.formatTime(rowTime))}</span>` : ''}
                        </div>
                        ${argsHtml}
                        <div class="message-tool-row__summary">${this.escapeHtml(row.resultSummary)}</div>
                        ${detailHtml}
                        ${rawHtml}
                    </div>
                </div>
            </div>
        `;
    }

    renderToolActivityBlock(block) {
        const isExpanded = this.toolGroupUiState.get(block.key) === true;
        const toolCountLabel = `${block.rows.length} tool${block.rows.length === 1 ? '' : 's'}`;

        return `
            <div class="message message-tool">
                <div class="message-tool-group ${isExpanded ? 'is-expanded' : 'is-collapsed'}" data-tool-group-key="${this.escapeHtml(block.key)}">
                    <button type="button" class="message-tool-group__header" data-action="toggle-tool-group" aria-expanded="${isExpanded ? 'true' : 'false'}">
                        <div class="message-tool-group__header-main">
                            <div class="message-tool-group__eyebrow">
                                <span class="message-tool-group__icon">
                                    <i class="fas fa-terminal"></i>
                                </span>
                                <span class="message-tool-group__title-wrap">
                                    <span class="message-tool-group__title">Tool Activity</span>
                                    <span class="message-tool-group__subtitle">ไม่ส่งถึงลูกค้า</span>
                                </span>
                            </div>
                            <div class="message-tool-group__header-meta">
                                <span class="message-tool-group__count">${this.escapeHtml(toolCountLabel)}</span>
                                <span class="message-tool-group__status message-tool-group__status--${this.escapeHtml(block.status)}">${this.escapeHtml(this.formatToolGroupStatusLabel(block.status))}</span>
                            </div>
                        </div>
                        <div class="message-tool-group__header-side">
                            <span class="message-tool-group__time">${block.timestamp ? this.escapeHtml(this.formatTime(block.timestamp)) : ''}</span>
                            <i class="fas fa-chevron-down message-tool-group__chevron"></i>
                        </div>
                    </button>
                    <div class="message-tool-group__body" ${isExpanded ? '' : 'hidden'}>
                        ${block.rows.map((row) => this.renderToolActivityRow(row)).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    detectImageMimeType(base64, fallback = 'image/jpeg') {
        if (typeof base64 !== 'string') return fallback;
        const trimmed = base64.trim();
        if (trimmed.startsWith('/9j/')) return 'image/jpeg';
        if (trimmed.startsWith('iVBORw0KGgo')) return 'image/png';
        if (trimmed.startsWith('R0lGOD')) return 'image/gif';
        if (trimmed.startsWith('UklGR')) return 'image/webp';
        return fallback;
    }

    buildBase64DataUrl(base64) {
        if (typeof base64 !== 'string') return '';
        const trimmed = base64.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('data:image/')) return trimmed;
        const mime = this.detectImageMimeType(trimmed);
        return `data:${mime};base64,${trimmed}`;
    }

    normalizeImageSrc(value) {
        if (typeof value !== 'string') return '';
        const trimmed = value.trim();
        return trimmed ? trimmed : '';
    }

    normalizeImageList(images) {
        if (!Array.isArray(images)) return [];
        const normalized = [];
        images.forEach((img) => {
            if (typeof img === 'string') {
                const src = this.normalizeImageSrc(img);
                if (src) normalized.push(src);
                return;
            }
            if (img && typeof img === 'object') {
                const src = this.normalizeImageSrc(
                    img.previewUrl || img.thumbUrl || img.url || img.src || ''
                );
                if (src) normalized.push(src);
            }
        });
        return normalized;
    }

    extractImagesFromContent(content, messageId = '') {
        const parsed = this.parseJsonIfPossible(content);
        const images = [];
        let base64Index = 0;

        const addUrlImage = (url) => {
            const src = this.normalizeImageSrc(url);
            if (src) images.push(src);
        };

        const addBase64Image = (base64) => {
            if (typeof base64 !== 'string' || !base64.trim()) return;
            if (messageId) {
                images.push(`/assets/chat-images/${encodeURIComponent(messageId)}/${base64Index}`);
            } else {
                const src = this.buildBase64DataUrl(base64);
                if (src) images.push(src);
            }
            base64Index += 1;
        };

        const getImageUrlFromNode = (node) =>
            this.normalizeImageSrc(node?.previewUrl || node?.thumbUrl || node?.url || node?.src || '');

        const visit = (node) => {
            if (!node) return;
            if (Array.isArray(node)) {
                node.forEach(visit);
                return;
            }
            if (typeof node !== 'object') return;

            if (node.type === 'image') {
                const url = getImageUrlFromNode(node);
                if (url) {
                    addUrlImage(url);
                    return;
                }
                const base64 = node.base64 || node.content;
                if (base64) {
                    addBase64Image(base64);
                    return;
                }
            }

            const dataNode = node.data;
            if (dataNode && typeof dataNode === 'object') {
                if (dataNode.type === 'image') {
                    const url = getImageUrlFromNode(dataNode);
                    if (url) {
                        addUrlImage(url);
                        return;
                    }
                    const base64 = dataNode.base64 || dataNode.content;
                    if (base64) {
                        addBase64Image(base64);
                        return;
                    }
                }
                if (Array.isArray(dataNode)) {
                    dataNode.forEach(visit);
                }
            }

            if (Array.isArray(node.content)) {
                node.content.forEach(visit);
            }
            if (Array.isArray(node.images)) {
                node.images.forEach(visit);
            }
            if (Array.isArray(node.media)) {
                node.media.forEach(visit);
            }
        };

        visit(parsed);

        if (images.length <= 1) return images;
        const seen = new Set();
        return images.filter((src) => {
            if (seen.has(src)) return false;
            seen.add(src);
            return true;
        });
    }

    prepareMessageForDisplay(message) {
        if (!message || typeof message !== 'object') return message;
        const normalized = { ...message };
        const messageId = this.resolveMessageId(normalized);
        const semantics = this.deriveMessageSemantics(normalized);
        const rawContent =
            typeof normalized.rawContent !== 'undefined' ? normalized.rawContent : normalized.content;
        const structured = this.parseJsonIfPossible(rawContent);
        const readableToolText = this.buildReadableToolText(normalized, structured);

        const existingImages = this.normalizeImageList(normalized.images);
        const extractedImages = this.extractImagesFromContent(structured, messageId);
        const mergedImages = [];
        const seen = new Set();
        existingImages.forEach((src) => {
            if (!seen.has(src)) {
                seen.add(src);
                mergedImages.push(src);
            }
        });
        extractedImages.forEach((src) => {
            if (!seen.has(src)) {
                seen.add(src);
                mergedImages.push(src);
            }
        });

        if (mergedImages.length > 0) {
            normalized.images = mergedImages;
        } else if (Array.isArray(normalized.images)) {
            normalized.images = [];
        }

        if (readableToolText) {
            normalized.displayContent = readableToolText;
        }

        let plainText = readableToolText || this.extractPlainTextFromStructured(structured);
        if (!plainText && mergedImages.length === 0) {
            if (typeof normalized.displayContent === 'string' && normalized.displayContent.trim()) {
                const textFromHtml = this.stripHtmlToText(normalized.displayContent);
                if (textFromHtml) {
                    plainText = textFromHtml;
                }
            } else if (typeof normalized.content === 'string') {
                plainText = normalized.content;
            }
        }

        normalized._plainText = typeof plainText === 'string' ? plainText : '';
        normalized.messageType = semantics.messageType;
        normalized.customerVisible = semantics.customerVisible;
        normalized.toolCalls = semantics.toolCalls;
        normalized.toolCallId = semantics.toolCallId;
        normalized.toolName = semantics.toolName;
        normalized.isToolCall = semantics.isToolCall;
        normalized.isToolResult = semantics.isToolResult;
        normalized.source = normalized.source || semantics.source || null;
        return normalized;
    }

    extractDisplayText(message) {
        if (!message) return '';

        if (Object.prototype.hasOwnProperty.call(message, '_plainText')) {
            return typeof message._plainText === 'string' ? message._plainText : '';
        }

        const rawContent =
            typeof message?.rawContent !== 'undefined' ? message.rawContent : message?.content;
        const structured = this.parseJsonIfPossible(rawContent);
        const readableToolText = this.buildReadableToolText(message, structured);
        if (readableToolText) {
            return readableToolText;
        }

        const hasImages = Array.isArray(message.images) && message.images.length > 0;
        if (!hasImages && typeof message.displayContent === 'string' && message.displayContent.trim()) {
            const textFromHtml = this.stripHtmlToText(message.displayContent);
            if (textFromHtml) {
                return textFromHtml;
            }
        }

        if (typeof rawContent === 'string') {
            const trimmed = rawContent.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    const extracted = this.extractPlainTextFromStructured(parsed);
                    if (extracted) return extracted;
                } catch (_) {
                    // ignore parse errors and fall back to raw string
                }
            }
            return rawContent;
        }

        if (Array.isArray(rawContent) || (rawContent && typeof rawContent === 'object')) {
            const extracted = this.extractPlainTextFromStructured(rawContent);
            if (extracted) return extracted;
        }

        return '';
    }

    extractPlainTextFromStructured(content) {
        if (!content) return '';

        if (Array.isArray(content)) {
            return content
                .map(item => this.extractPlainTextFromStructured(item))
                .filter(text => typeof text === 'string' && text.trim().length > 0)
                .join('\n');
        }

        if (typeof content === 'object') {
            if (typeof content.text === 'string' && content.text.trim().length > 0) {
                return content.text;
            }
            if (
                typeof content.content === 'string' &&
                content.content.trim().length > 0 &&
                content.type === 'text'
            ) {
                return content.content;
            }
            if (content.data) {
                return this.extractPlainTextFromStructured(content.data);
            }
        }

        if (typeof content === 'string') {
            return content;
        }

        return '';
    }

    stripHtmlToText(html) {
        if (!html) return '';
        const temp = document.createElement('div');
        temp.innerHTML = String(html).replace(/<br\s*\/?>/gi, '\n');
        const text = temp.textContent || temp.innerText || '';
        return text.replace(/\u00a0/g, ' ');
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

    formatDateLabel(timestamp) {
        const time = new Date(timestamp);
        const now = new Date();
        const sameYear = time.getFullYear() === now.getFullYear();
        return time.toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: sameYear ? undefined : 'numeric'
        });
    }

    showToast(message, type = 'info') {
        const typeMap = {
            success: { icon: 'fa-check-circle', className: 'app-toast--success' },
            error: { icon: 'fa-times-circle', className: 'app-toast--danger' },
            warning: { icon: 'fa-exclamation-triangle', className: 'app-toast--warning' },
            info: { icon: 'fa-info-circle', className: 'app-toast--info' }
        };
        const toastType = typeMap[type] ? type : 'info';
        const { icon, className } = typeMap[toastType];

        let container = document.querySelector('.app-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'app-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `app-toast ${className}`;
        toast.innerHTML = `
            <div class="app-toast__icon"><i class="fas ${icon}"></i></div>
            <div class="app-toast__body">
                <div class="app-toast__title">${this.escapeHtml(message || '')}</div>
            </div>
            <button class="app-toast__close" aria-label="ปิดการแจ้งเตือน">&times;</button>
        `;

        const removeToast = () => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 200);
        };

        toast.querySelector('.app-toast__close').addEventListener('click', removeToast);

        container.appendChild(toast);

        setTimeout(removeToast, 3200);
    }

    // ========================================
    // Order Management
    // ========================================

    async loadOrders() {
        if (!this.currentUserId) return;

        try {
            const response = await fetch(`/admin/chat/orders/${this.currentUserId}`);
            const data = await response.json();

            if (data.success) {
                this.currentOrders = data.orders || [];
                this.renderOrders();
            } else {
                console.error('Failed to load orders:', data.error);
                this.currentOrders = [];
                this.renderOrders();
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            this.currentOrders = [];
            this.renderOrders();
        }
    }

    renderOrders() {
        const orderContent = document.getElementById('orderContent');
        const orderCountBadge = document.getElementById('orderCountBadge');

        if (!orderContent) return;

        // Update count badge
        if (orderCountBadge) {
            orderCountBadge.textContent = this.currentOrders.length;
        }

        // Render orders
        if (this.currentOrders.length === 0) {
            orderContent.innerHTML = `
                <div class="order-empty-state" id="orderEmptyState">
                    <div class="order-empty-icon">
                        <i class="fas fa-shopping-bag"></i>
                    </div>
                    <h6 class="order-empty-title">ไม่มีออเดอร์</h6>
                    <p class="order-empty-description">
                        เลือกผู้ใช้เพื่อดูออเดอร์ ระบบจะแสดงออเดอร์ที่ AI บันทึกไว้
                    </p>
                </div>
            `;
            this.updateDebugPanel();
            return;
        }

        orderContent.innerHTML = this.currentOrders.map(order => this.renderOrderCard(order)).join('');
        this.updateDebugPanel();
    }

    renderOrderCard(order) {
        const statusLabels = {
            pending: 'รอดำเนินการ',
            confirmed: 'ยืนยันแล้ว',
            shipped: 'จัดส่งแล้ว',
            completed: 'เสร็จสิ้น',
            cancelled: 'ยกเลิก'
        };

        const statusLabel = statusLabels[order.status] || order.status;
        const extractedDate = new Date(order.extractedAt).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });

        const orderData = order.orderData || {};
        const items = orderData.items || [];
        const totalAmount = orderData.totalAmount || 0;
        let shippingCost = 0;
        if (typeof orderData.shippingCost === 'number' && isFinite(orderData.shippingCost)) {
            shippingCost = Math.max(0, orderData.shippingCost);
        } else if (typeof orderData.shippingCost === 'string') {
            const parsed = parseFloat(orderData.shippingCost);
            if (!isNaN(parsed) && parsed >= 0) {
                shippingCost = parsed;
            }
        }
        const shippingLabel = shippingCost > 0 ? `฿${this.formatNumber(shippingCost)}` : 'ส่งฟรี';
        const shippingAmountClass = shippingCost > 0 ? '' : 'free';

        const itemsHtml = items.map(item => `
            <div class="order-item">
                <span class="order-item-name">${this.escapeHtml(item.product)}</span>
                <span class="order-item-quantity">x${item.quantity}</span>
                <span class="order-item-price">฿${this.formatNumber(item.price)}</span>
            </div>
        `).join('');

        let metaHtml = '';
        // Build full address from address parts
        const addressParts = [];
        if (orderData.shippingAddress) addressParts.push(orderData.shippingAddress);
        if (orderData.addressSubDistrict) addressParts.push(orderData.addressSubDistrict);
        if (orderData.addressDistrict) addressParts.push(orderData.addressDistrict);
        if (orderData.addressProvince) addressParts.push(orderData.addressProvince);
        if (orderData.addressPostalCode) addressParts.push(orderData.addressPostalCode);
        const fullAddress = addressParts.join(' ');

        if (orderData.customerName || fullAddress || orderData.phone || orderData.paymentMethod) {
            metaHtml = '<div class="order-meta">';

            if (orderData.customerName) {
                metaHtml += `
                    <div class="order-meta-item">
                        <i class="fas fa-user"></i>
                        <span class="order-meta-label">ชื่อลูกค้า:</span>
                        <span>${this.escapeHtml(orderData.customerName)}</span>
                    </div>
                `;
            }

            if (fullAddress) {
                metaHtml += `
                    <div class="order-meta-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="order-meta-label">ที่อยู่:</span>
                        <span>${this.escapeHtml(fullAddress)}</span>
                    </div>
                `;
            }

            if (orderData.phone) {
                metaHtml += `
                    <div class="order-meta-item">
                        <i class="fas fa-phone"></i>
                        <span class="order-meta-label">เบอร์:</span>
                        <span>${this.escapeHtml(orderData.phone)}</span>
                    </div>
                `;
            }

            if (orderData.paymentMethod) {
                metaHtml += `
                    <div class="order-meta-item">
                        <i class="fas fa-credit-card"></i>
                        <span class="order-meta-label">ชำระเงิน:</span>
                        <span>${this.escapeHtml(orderData.paymentMethod)}</span>
                    </div>
                `;
            }

            metaHtml += '</div>';
        }

	        return `
	            <div class="order-card" data-order-id="${this.escapeHtml(order._id)}">
	                <div class="order-card-header">
	                    <span class="order-status-badge ${order.status}">${statusLabel}</span>
	                    <span class="order-date">${extractedDate}</span>
	                </div>
                
                <div class="order-items">
                    ${itemsHtml}
                </div>

                <div class="order-total order-shipping">
                    <span class="order-total-label">ค่าส่ง:</span>
                    <span class="order-total-amount ${shippingAmountClass}">${shippingLabel}</span>
                </div>
                
                <div class="order-total">
                    <span class="order-total-label">ยอดรวม:</span>
                    <span class="order-total-amount">฿${this.formatNumber(totalAmount)}</span>
                </div>
                
		                ${metaHtml}
		                
		                <div class="order-actions">
		                    <button type="button" class="btn-order-action" data-action="edit-order" data-order-id="${this.escapeHtml(order._id)}">
		                        <i class="fas fa-edit"></i> แก้ไข
		                    </button>
		                    <button type="button" class="btn-order-action btn-delete" data-action="delete-order" data-order-id="${this.escapeHtml(order._id)}">
		                        <i class="fas fa-trash"></i> ลบ
		                    </button>
		                </div>
		            </div>
		        `;
    }

    editOrder(orderId) {
        const order = this.currentOrders.find(o => o._id === orderId);
        if (!order) return;

        // Populate modal with order data
        document.getElementById('editOrderId').value = orderId;
        document.getElementById('editOrderStatus').value = order.status || 'pending';
        document.getElementById('editOrderNotes').value = order.notes || '';

        const orderData = order.orderData || {};
        document.getElementById('editShippingAddress').value = orderData.shippingAddress || '';
        document.getElementById('editPhone').value = orderData.phone || '';
        document.getElementById('editPaymentMethod').value = orderData.paymentMethod || 'เก็บเงินปลายทาง';

        // Populate address fields
        const addressSubDistrictInput = document.getElementById('editAddressSubDistrict');
        if (addressSubDistrictInput) {
            addressSubDistrictInput.value = orderData.addressSubDistrict || '';
        }
        const addressDistrictInput = document.getElementById('editAddressDistrict');
        if (addressDistrictInput) {
            addressDistrictInput.value = orderData.addressDistrict || '';
        }
        const addressProvinceInput = document.getElementById('editAddressProvince');
        if (addressProvinceInput) {
            addressProvinceInput.value = orderData.addressProvince || '';
        }
        const addressPostalCodeInput = document.getElementById('editAddressPostalCode');
        if (addressPostalCodeInput) {
            addressPostalCodeInput.value = orderData.addressPostalCode || '';
        }

        const customerNameInput = document.getElementById('editCustomerName');
        if (customerNameInput) {
            customerNameInput.value = orderData.customerName || '';
        }
        const shippingCostInput = document.getElementById('editShippingCost');
        if (shippingCostInput) {
            let shippingCost = 0;
            if (typeof orderData.shippingCost === 'number' && isFinite(orderData.shippingCost)) {
                shippingCost = Math.max(0, orderData.shippingCost);
            } else if (typeof orderData.shippingCost === 'string') {
                const parsed = parseFloat(orderData.shippingCost);
                if (!isNaN(parsed) && parsed >= 0) {
                    shippingCost = parsed;
                }
            }
            shippingCostInput.value = shippingCost;
        }

        // Render order items
        const editOrderItems = document.getElementById('editOrderItems');
        if (editOrderItems && orderData.items) {
            editOrderItems.innerHTML = orderData.items.map((item, index) => `
                <div class="order-item-edit" data-index="${index}">
                    <input type="text" placeholder="สินค้า" value="${this.escapeHtml(item.product)}" data-field="product">
                    <input type="number" placeholder="จำนวน" value="${item.quantity}" data-field="quantity" style="width: 80px;">
                    <input type="number" placeholder="ราคา" value="${item.price}" data-field="price" style="width: 100px;">
                    <button type="button" onclick="chatManager.removeOrderItem(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('') + `
                <button type="button" class="btn-add-item" onclick="chatManager.addOrderItem()">
                    <i class="fas fa-plus"></i> เพิ่มสินค้า
                </button>
            `;
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('orderEditModal'));
        modal.show();
    }

    async deleteOrder(orderId) {
        if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบออเดอร์นี้?')) {
            return;
        }

        try {
            const response = await fetch(`/admin/chat/orders/${orderId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('ลบออเดอร์สำเร็จ', 'success');
                await this.loadOrders();
                await this.loadUsers(); // Update badge
            } else {
                this.showToast('ไม่สามารถลบออเดอร์ได้: ' + (data.error || 'เกิดข้อผิดพลาด'), 'error');
            }
        } catch (error) {
            console.error('Error deleting order:', error);
            this.showToast('เกิดข้อผิดพลาดในการลบออเดอร์', 'error');
        }
    }

    removeOrderItem(index) {
        const editOrderItems = document.getElementById('editOrderItems');
        if (!editOrderItems) return;

        const itemElements = editOrderItems.querySelectorAll('.order-item-edit');
        if (itemElements[index]) {
            itemElements[index].remove();
        }
    }

    addOrderItem() {
        const editOrderItems = document.getElementById('editOrderItems');
        if (!editOrderItems) return;

        const addButton = editOrderItems.querySelector('.btn-add-item');
        const newIndex = editOrderItems.querySelectorAll('.order-item-edit').length;

        const newItem = document.createElement('div');
        newItem.className = 'order-item-edit';
        newItem.dataset.index = newIndex;
        newItem.innerHTML = `
            <input type="text" placeholder="สินค้า" value="" data-field="product">
            <input type="number" placeholder="จำนวน" value="1" data-field="quantity" style="width: 80px;">
            <input type="number" placeholder="ราคา" value="0" data-field="price" style="width: 100px;">
            <button type="button" onclick="chatManager.removeOrderItem(${newIndex})">
                <i class="fas fa-times"></i>
            </button>
        `;

        if (addButton) {
            addButton.before(newItem);
        } else {
            editOrderItems.appendChild(newItem);
        }
    }

    async saveOrder() {
        const orderId = document.getElementById('editOrderId').value;
        if (!orderId) return;

        // Collect order items
        const editOrderItems = document.getElementById('editOrderItems');
        const itemElements = editOrderItems.querySelectorAll('.order-item-edit');
        const items = [];

        itemElements.forEach((element) => {
            const product = element.querySelector('[data-field="product"]').value.trim();
            const quantity = parseInt(element.querySelector('[data-field="quantity"]').value) || 0;
            const price = parseFloat(element.querySelector('[data-field="price"]').value) || 0;

            if (product && quantity > 0) {
                items.push({ product, quantity, price });
            }
        });

        if (items.length === 0) {
            this.showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning');
            return;
        }

        const shippingCostInput = document.getElementById('editShippingCost');
        let shippingCost = 0;
        if (shippingCostInput) {
            const parsed = parseFloat(shippingCostInput.value);
            if (!isNaN(parsed) && parsed >= 0) {
                shippingCost = parsed;
            }
        }

        // Calculate total (รวมค่าส่ง)
        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0) + shippingCost;

        // Collect other data
        const orderData = {
            items,
            totalAmount,
            shippingAddress: document.getElementById('editShippingAddress').value.trim() || null,
            addressSubDistrict: (() => {
                const input = document.getElementById('editAddressSubDistrict');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })(),
            addressDistrict: (() => {
                const input = document.getElementById('editAddressDistrict');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })(),
            addressProvince: (() => {
                const input = document.getElementById('editAddressProvince');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })(),
            addressPostalCode: (() => {
                const input = document.getElementById('editAddressPostalCode');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })(),
            phone: document.getElementById('editPhone').value.trim() || null,
            paymentMethod: document.getElementById('editPaymentMethod').value || null,
            shippingCost,
            customerName: (() => {
                const input = document.getElementById('editCustomerName');
                if (!input) return null;
                const value = input.value.trim();
                return value || null;
            })()
        };

        const status = document.getElementById('editOrderStatus').value;
        const notes = document.getElementById('editOrderNotes').value.trim();

        try {
            const response = await fetch(`/admin/chat/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderData,
                    status,
                    notes
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('บันทึกออเดอร์สำเร็จ', 'success');
                await this.loadOrders();

                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('orderEditModal'));
                if (modal) modal.hide();
                this.toggleOrderSidebarMobile(false);
            } else {
                this.showToast('ไม่สามารถบันทึกออเดอร์ได้: ' + (data.error || 'เกิดข้อผิดพลาด'), 'error');
            }
        } catch (error) {
            console.error('Error saving order:', error);
            this.showToast('เกิดข้อผิดพลาดในการบันทึกออเดอร์', 'error');
        }
    }

    formatNumber(num) {
        return new Intl.NumberFormat('th-TH', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(num);
    }
}
