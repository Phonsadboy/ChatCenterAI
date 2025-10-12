(() => {
    const state = {
        pages: [],
        currentPage: null,
        users: [],
        summary: { total: 0 },
        isLoadingUsers: false,
        socket: null,
        config: window.followUpDashboardConfig || {},
        currentContextConfig: null
    };

    const el = {
        list: document.getElementById('followupList'),
        count: document.getElementById('followupCount'),
        alert: document.getElementById('followupAlert'),
        emptyState: document.getElementById('followupEmptyState'),
        search: document.getElementById('followupSearch'),
        refresh: document.getElementById('followupRefreshBtn'),
        pageSelector: document.getElementById('followupPageSelector'),
        pageLabel: document.getElementById('followupPageLabel'),
        pageStatus: document.getElementById('followupPageStatus'),
        analysisLabel: document.getElementById('followupAnalysisLabel'),
        analysisSubtitle: document.getElementById('followupAnalysisSubtitle'),
        settingsBtn: document.getElementById('openFollowupSettingsBtn'),
        modalRoot: document.getElementById('followupSettingsModal'),
        modalAnalysis: document.getElementById('followupModalAnalysis'),
        modalShowChat: document.getElementById('followupModalShowChat'),
        modalShowDashboard: document.getElementById('followupModalShowDashboard'),
        modalHistoryLimit: document.getElementById('followupModalHistoryLimit'),
        modalCooldown: document.getElementById('followupModalCooldown'),
        modalModel: document.getElementById('followupModalModel'),
        modalUpdatedAt: document.getElementById('followupModalUpdatedAt'),
        modalResetBtn: document.getElementById('followupModalResetBtn'),
        modalSaveBtn: document.getElementById('followupModalSaveBtn'),
        modalTitle: document.getElementById('followupModalTitle')
    };

    const modalInstance = el.modalRoot ? new bootstrap.Modal(el.modalRoot) : null;

    const MODEL_OPTIONS = [
        'gpt-5-mini',
        'gpt-4o-mini',
        'gpt-5',
        'gpt-4.1-mini'
    ];

    const normalizeId = (value) => {
        if (value === undefined || value === null) return null;
        return String(value);
    };

    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const formatDateTime = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatRelativeTime = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        const diffMs = Date.now() - date.getTime();
        if (diffMs < 0) return formatDateTime(value);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'เมื่อสักครู่';
        if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
        if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
        if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
        return formatDateTime(value);
    };

    const showAlert = (type, message) => {
        if (!el.alert) return;
        el.alert.className = `alert alert-${type}`;
        el.alert.textContent = message;
        el.alert.classList.remove('d-none');
        setTimeout(() => {
            el.alert.classList.add('d-none');
        }, 4000);
    };

    const renderPageSelector = () => {
        if (!el.pageSelector) return;
        if (!state.pages.length) {
            el.pageSelector.innerHTML = '<div class="text-muted small">ยังไม่มีข้อมูลเพจ โปรดเพิ่ม LINE Bot หรือ Facebook Page ก่อน</div>';
            return;
        }
        const html = state.pages.map(page => {
            const active = state.currentPage && page.id === state.currentPage.id;
            const disabled = page.settings.showInDashboard === false;
            const analysisOff = page.settings.analysisEnabled === false;
            const overrideBadge = page.hasOverride ? '<span class="pill-dot" title="ตั้งค่ากำหนดเองแล้ว"></span>' : '';
            return `
                <button class="followup-page-pill ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}" data-page-id="${page.id}">
                    <span class="pill-name">${escapeHtml(page.name)}</span>
                    ${page.type === 'default' ? '<span class="pill-badge">ค่าเริ่มต้น</span>' : ''}
                    ${analysisOff ? '<span class="pill-status off">ปิดวิเคราะห์</span>' : ''}
                    ${disabled ? '<span class="pill-status muted">ซ่อน</span>' : ''}
                    ${overrideBadge}
                </button>
            `;
        }).join('');
        el.pageSelector.innerHTML = html;
        el.pageSelector.querySelectorAll('button[data-page-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pageId = btn.getAttribute('data-page-id');
                if (!pageId) return;
                selectPage(pageId);
            });
        });
    };

    const updateMetrics = () => {
        if (el.count) {
            el.count.textContent = state.summary.total || 0;
        }
        if (el.analysisLabel) {
            el.analysisLabel.textContent = state.currentContextConfig && state.currentContextConfig.analysisEnabled !== false
                ? 'เปิดใช้งาน'
                : 'ปิดอยู่';
            el.analysisLabel.classList.remove('text-success', 'text-danger');
            el.analysisLabel.classList.add(state.currentContextConfig && state.currentContextConfig.analysisEnabled !== false ? 'text-success' : 'text-danger');
        }
        if (el.analysisSubtitle) {
            const parts = [];
            if (state.currentContextConfig) {
                parts.push(`แสดงในหน้าแชท: ${state.currentContextConfig.showInChat !== false ? 'เปิด' : 'ปิด'}`);
                parts.push(`แสดงในแดชบอร์ด: ${state.currentContextConfig.showInDashboard !== false ? 'เปิด' : 'ปิด'}`);
            } else {
                parts.push('ยังไม่ได้เลือกหน้าเพจ');
            }
            el.analysisSubtitle.textContent = parts.join(' • ');
        }
    };

    const updateToolbar = () => {
        if (!state.currentPage) {
            if (el.pageLabel) el.pageLabel.textContent = 'เลือกหน้าเพจที่ต้องการติดตาม';
            if (el.pageStatus) el.pageStatus.textContent = '';
            if (el.search) {
                el.search.value = '';
                el.search.disabled = true;
            }
            if (el.settingsBtn) el.settingsBtn.disabled = true;
            if (el.refresh) el.refresh.disabled = true;
            return;
        }

        if (el.pageLabel) {
            el.pageLabel.textContent = state.currentPage.name;
        }

        if (el.pageStatus) {
            const cfg = state.currentContextConfig || state.currentPage.settings;
            const statusTexts = [];
            statusTexts.push(cfg.analysisEnabled !== false ? 'กำลังวิเคราะห์อัตโนมัติ' : 'หยุดการวิเคราะห์');
            if (cfg.showInDashboard === false) {
                statusTexts.push('ซ่อนจากแดชบอร์ด');
            }
            el.pageStatus.textContent = statusTexts.join(' • ');
        }

        if (el.search) {
            el.search.disabled = state.currentContextConfig && state.currentContextConfig.showInDashboard === false;
            if (el.search.disabled) {
                el.search.value = '';
            }
        }

        if (el.settingsBtn) {
            el.settingsBtn.disabled = false;
        }

        if (el.refresh) {
            el.refresh.disabled = false;
        }
    };

    const renderLoadingState = () => {
        if (!el.list) return;
        el.list.innerHTML = `
            <div class="followup-loading">
                <div class="spinner-border text-primary" role="status"></div>
                <span class="ms-2">กำลังโหลด...</span>
            </div>
        `;
    };

    const renderDisabledState = () => {
        if (!el.emptyState) return;
        state.users = [];
        state.summary = { total: 0 };
        el.emptyState.classList.remove('d-none');
        if (!state.currentPage) {
            el.emptyState.innerHTML = `
                <i class="fas fa-layer-group fa-2x mb-2 text-muted"></i>
                <p class="mb-1">ยังไม่มีหน้าเพจที่เปิดใช้งาน</p>
                <p class="small mb-0">เพิ่มหรือเปิดการแสดงผลเพจจากการตั้งค่าเพื่อเริ่มติดตามลูกค้า</p>
            `;
        } else {
            el.emptyState.innerHTML = `
                <i class="fas fa-eye-slash fa-2x mb-2 text-muted"></i>
                <p class="mb-1">แดชบอร์ดสำหรับเพจนี้ถูกปิดไว้</p>
                <p class="small mb-0">เปิดใช้การแสดงผลในแดชบอร์ดเพื่อดูรายชื่อลูกค้าที่ต้องติดตาม</p>
            `;
        }
        if (el.list) el.list.innerHTML = '';
        if (el.count) el.count.textContent = 0;
    };

    const renderUsers = () => {
        if (!el.list) return;
        const cfg = state.currentContextConfig;
        if (!state.currentPage || (cfg && cfg.showInDashboard === false)) {
            renderDisabledState();
            if (el.count) el.count.textContent = 0;
            return;
        }
        const keyword = el.search && typeof el.search.value === 'string'
            ? el.search.value.trim().toLowerCase()
            : '';
        const filtered = state.users.filter(user => {
            if (!keyword) return true;
            const name = (user.displayName || '').toLowerCase();
            const reason = (user.followUpReason || '').toLowerCase();
            return name.includes(keyword) || reason.includes(keyword) || user.userId.toLowerCase().includes(keyword);
        });

        if (!filtered.length) {
            if (el.list) el.list.innerHTML = '';
            if (el.emptyState) {
                el.emptyState.classList.remove('d-none');
                el.emptyState.innerHTML = `
                    <i class="fas fa-search fa-2x mb-2 text-muted"></i>
                    <p class="mb-1">ไม่พบข้อมูลที่ตรงกับคำค้น</p>
                    <p class="small mb-0">ลองเปลี่ยนคำค้นหา หรือเพิ่มลูกค้าใหม่จากการสั่งซื้อ</p>
                `;
            }
            return;
        }

        if (el.emptyState) {
            el.emptyState.classList.add('d-none');
        }

        const cards = filtered.map(user => {
            const initials = escapeHtml((user.displayName || '?').charAt(0).toUpperCase());
            const reason = escapeHtml(user.followUpReason || 'ลูกค้ายืนยันสั่งซื้อแล้ว');
            const lastMessage = escapeHtml(user.lastMessage || '-');
            const updated = formatRelativeTime(user.followUpUpdatedAt || user.lastTimestamp);
            const platformBadge = user.platform === 'facebook'
                ? '<span class="badge bg-primary-soft text-primary"><i class="fab fa-facebook me-1"></i>Facebook</span>'
                : '<span class="badge bg-success-soft text-success"><i class="fab fa-line me-1"></i>LINE</span>';
            return `
                <div class="followup-card" data-user-id="${escapeHtml(user.userId)}">
                    <div class="followup-card-header">
                        <div class="followup-avatar">${initials}</div>
                        <div class="followup-card-meta">
                            <div class="followup-name">${escapeHtml(user.displayName || user.userId)}</div>
                            <div class="followup-sub">${escapeHtml(user.userId)} • ${platformBadge}</div>
                        </div>
                        <div class="followup-updated">${escapeHtml(updated)}</div>
                    </div>
                    <div class="followup-card-body">
                        <div class="followup-reason">${reason}</div>
                        <div class="followup-lastmessage">
                            <span class="label">ข้อความล่าสุด</span>
                            <span class="value">${lastMessage}</span>
                        </div>
                    </div>
                    <div class="followup-card-actions">
                        <button class="btn btn-sm btn-outline-secondary" data-action="open-chat">
                            <i class="fas fa-comments me-1"></i>เปิดหน้าแชท
                        </button>
                        <button class="btn btn-sm btn-outline-danger" data-action="clear-tag">
                            <i class="fas fa-check me-1"></i>ลบแท็กแล้วจัดการแล้ว
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        el.list.innerHTML = cards;
        el.list.querySelectorAll('.followup-card button[data-action="clear-tag"]').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                const card = event.currentTarget.closest('.followup-card');
                const userId = card ? card.getAttribute('data-user-id') : null;
                if (!userId) return;
                if (!confirm('ยืนยันลบแท็กติดตามสำหรับลูกค้ารายนี้หรือไม่?')) return;
                await clearUser(userId);
            });
        });

        el.list.querySelectorAll('.followup-card button[data-action="open-chat"]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const card = event.currentTarget.closest('.followup-card');
                const userId = card ? card.getAttribute('data-user-id') : null;
                if (!userId) return;
                window.location.href = `/admin/chat?focus=${encodeURIComponent(userId)}`;
            });
        });
    };

    const clearUser = async (userId) => {
        try {
            const response = await fetch('/admin/followup/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const data = await response.json();
            if (data.success) {
                showAlert('success', 'ลบแท็กเรียบร้อยแล้ว');
                await loadUsers();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถลบแท็กได้');
            }
        } catch (error) {
            console.error('clear follow-up error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการลบแท็ก');
        }
    };

    const loadPages = async () => {
        try {
            const response = await fetch('/admin/followup/page-settings');
            const data = await response.json();
            if (!data.success) {
                showAlert('danger', data.error || 'ไม่สามารถดึงข้อมูลเพจได้');
                state.pages = [];
                renderPageSelector();
                return;
            }
            const previousId = state.currentPage ? state.currentPage.id : null;
            state.pages = (data.pages || []).map(page => ({
                ...page,
                settings: page.settings || {}
            }));
            renderPageSelector();
            if (state.pages.length === 0) {
                state.currentPage = null;
                updateToolbar();
                renderUsers();
                return;
            }
            const fallback = state.pages.find(p => p.id === previousId)
                || state.pages.find(p => p.settings.showInDashboard !== false)
                || state.pages[0];
            selectPage(fallback.id, { skipReload: true });
        } catch (error) {
            console.error('load follow-up pages error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการดึงข้อมูลเพจ');
        }
    };

    const loadUsers = async (showMessage = false) => {
        if (!state.currentPage) return;
        if (state.currentContextConfig && state.currentContextConfig.showInDashboard === false) {
            renderDisabledState();
            updateMetrics();
            return;
        }
        if (state.isLoadingUsers) return;
        state.isLoadingUsers = true;
        renderLoadingState();
        try {
            const params = new URLSearchParams();
            if (state.currentPage.platform) params.set('platform', state.currentPage.platform);
            if (state.currentPage.botId) params.set('botId', state.currentPage.botId);
            const response = await fetch(`/admin/followup/users${params.toString() ? `?${params.toString()}` : ''}`);
            const data = await response.json();
            if (data.success) {
                state.users = data.users || [];
                state.summary = data.summary || { total: state.users.length };
                if (data.config) {
                    state.currentContextConfig = data.config;
                    const pageIndex = state.pages.findIndex(p => p.id === (state.currentPage && state.currentPage.id));
                    if (pageIndex >= 0) {
                        state.pages[pageIndex].settings = data.config;
                    }
                }
                updateToolbar();
                updateMetrics();
                renderUsers();
                if (showMessage) {
                    showAlert('info', 'อัปเดตรายการล่าสุดแล้ว');
                }
            } else if (data.disabled) {
                state.users = [];
                state.summary = { total: 0 };
                state.currentContextConfig = data.config || null;
                renderDisabledState();
                updateToolbar();
                updateMetrics();
                showAlert('warning', data.message || 'เพจนี้ถูกปิดจากแดชบอร์ด');
            } else {
                showAlert('danger', data.error || 'ไม่สามารถดึงข้อมูลได้');
            }
        } catch (error) {
            console.error('load follow-up users error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า');
            renderUsers();
        } finally {
            state.isLoadingUsers = false;
        }
    };

    const selectPage = (pageId, options = {}) => {
        const page = state.pages.find(p => p.id === pageId);
        if (!page) return;
        state.currentPage = page;
        state.currentContextConfig = page.settings || null;
        if (el.search) {
            el.search.value = '';
        }
        if (options.skipReload) {
            state.users = [];
            state.summary = { total: 0 };
        }
        renderPageSelector();
        updateToolbar();
        updateMetrics();
        if (!options.skipReload) {
            loadUsers();
        } else {
            renderUsers();
        }
    };

    const populateModalOptions = () => {
        if (!el.modalModel) return;
        el.modalModel.innerHTML = MODEL_OPTIONS.map(model => `<option value="${model}">${model}</option>`).join('');
    };

    const openSettingsModal = () => {
        if (!state.currentPage || !modalInstance) return;
        const cfg = state.currentContextConfig || state.currentPage.settings || {};
        if (el.modalTitle) {
            el.modalTitle.textContent = `ตั้งค่าเพจ: ${state.currentPage.name}`;
        }
        if (el.modalAnalysis) el.modalAnalysis.checked = cfg.analysisEnabled !== false;
        if (el.modalShowChat) el.modalShowChat.checked = cfg.showInChat !== false;
        if (el.modalShowDashboard) el.modalShowDashboard.checked = cfg.showInDashboard !== false;
        if (el.modalHistoryLimit) el.modalHistoryLimit.value = cfg.historyLimit ?? 10;
        if (el.modalCooldown) el.modalCooldown.value = cfg.cooldownMinutes ?? 30;
        if (el.modalModel) el.modalModel.value = cfg.model || MODEL_OPTIONS[0];
        if (el.modalUpdatedAt) {
            if (state.currentPage.updatedAt) {
                el.modalUpdatedAt.textContent = `ปรับปรุงล่าสุด: ${formatDateTime(state.currentPage.updatedAt)}`;
            } else {
                el.modalUpdatedAt.textContent = 'ใช้ค่าจากการตั้งค่าหลัก';
            }
        }
        if (el.modalResetBtn) {
            el.modalResetBtn.disabled = !state.currentPage.hasOverride;
        }
        modalInstance.show();
    };

    const saveSettings = async () => {
        if (!state.currentPage) return;
        const payload = {
            platform: state.currentPage.platform,
            botId: state.currentPage.botId,
            settings: {
                analysisEnabled: !!(el.modalAnalysis && el.modalAnalysis.checked),
                showInChat: !!(el.modalShowChat && el.modalShowChat.checked),
                showInDashboard: !!(el.modalShowDashboard && el.modalShowDashboard.checked),
                historyLimit: el.modalHistoryLimit ? Number(el.modalHistoryLimit.value) : undefined,
                cooldownMinutes: el.modalCooldown ? Number(el.modalCooldown.value) : undefined,
                model: el.modalModel ? el.modalModel.value : undefined
            }
        };
        try {
            const response = await fetch('/admin/followup/page-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.success) {
                showAlert('success', 'บันทึกการตั้งค่าเพจเรียบร้อยแล้ว');
                modalInstance.hide();
                await loadPages();
                await loadUsers();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
            }
        } catch (error) {
            console.error('save follow-up page settings error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
        }
    };

    const resetSettings = async () => {
        if (!state.currentPage) return;
        if (!confirm('ต้องการคืนค่าเริ่มต้นสำหรับเพจนี้หรือไม่?')) return;
        try {
            const response = await fetch('/admin/followup/page-settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: state.currentPage.platform,
                    botId: state.currentPage.botId
                })
            });
            const data = await response.json();
            if (data.success) {
                showAlert('success', 'คืนค่าเริ่มต้นเรียบร้อยแล้ว');
                modalInstance.hide();
                await loadPages();
                await loadUsers();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถคืนค่าเริ่มต้นได้');
            }
        } catch (error) {
            console.error('reset follow-up page settings error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการคืนค่าเริ่มต้น');
        }
    };

    const initSocket = () => {
        if (state.socket || !state.config || state.config.showDashboard === false) return;
        try {
            state.socket = io();
            state.socket.on('followUpTagged', (data) => {
                const dataPlatform = data && data.platform ? data.platform : 'line';
                const dataBotId = normalizeId(data && data.botId ? data.botId : null);
                if (!state.currentPage) return;
                const currentBotId = normalizeId(state.currentPage.botId);
                if (dataPlatform === state.currentPage.platform && dataBotId === currentBotId) {
                    loadUsers();
                }
            });
        } catch (error) {
            console.warn('ไม่สามารถเชื่อมต่อ Socket.IO ได้', error);
        }
    };

    const setupEventListeners = () => {
        if (el.search) {
            el.search.addEventListener('input', () => {
                renderUsers();
            });
        }
        if (el.refresh) {
            el.refresh.addEventListener('click', () => {
                loadUsers(true);
            });
        }
        if (el.settingsBtn) {
            el.settingsBtn.addEventListener('click', () => {
                openSettingsModal();
            });
        }
        if (el.modalSaveBtn) {
            el.modalSaveBtn.addEventListener('click', () => {
                saveSettings();
            });
        }
        if (el.modalResetBtn) {
            el.modalResetBtn.addEventListener('click', () => {
                resetSettings();
            });
        }
    };

    const init = async () => {
        populateModalOptions();
        setupEventListeners();
        await loadPages();
        initSocket();
        if (state.currentPage) {
            await loadUsers();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
