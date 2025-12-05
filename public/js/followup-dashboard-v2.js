/**
 * Follow-up Dashboard v2
 * Modern UI with cleaner code structure
 */
(() => {
    // ==================== STATE ====================
    const state = {
        pages: [],
        currentPage: null,
        users: [],
        summary: { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 },
        overview: { summary: { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 }, groups: [] },
        currentConfig: null,
        statusFilter: 'all',
        searchQuery: '',
        modalRounds: [],
        socket: null,
        config: window.followUpDashboardConfig || {},
        isLoading: false
    };

    // ==================== DOM ELEMENTS ====================
    const el = {
        // Summary
        metricActive: document.getElementById('metricActive'),
        metricCompleted: document.getElementById('metricCompleted'),
        metricCanceled: document.getElementById('metricCanceled'),
        metricFailed: document.getElementById('metricFailed'),
        // Sidebar
        pageList: document.getElementById('followupPageList'),
        statusPills: document.getElementById('followupStatusPills'),
        searchInput: document.getElementById('followupSearchInput'),
        // Counts
        countAll: document.getElementById('countAll'),
        countActive: document.getElementById('countActive'),
        countCompleted: document.getElementById('countCompleted'),
        countCanceled: document.getElementById('countCanceled'),
        countFailed: document.getElementById('countFailed'),
        // Main
        currentPageLabel: document.getElementById('followupCurrentPage'),
        refreshBtn: document.getElementById('followupRefreshBtn'),
        settingsBtn: document.getElementById('followupSettingsBtn'),
        scheduleCard: document.getElementById('followupScheduleCard'),
        timeline: document.getElementById('followupTimeline'),
        badgeAutoSend: document.getElementById('badgeAutoSend'),
        badgeAnalysis: document.getElementById('badgeAnalysis'),
        listContainer: document.getElementById('followupListContainer'),
        emptyState: document.getElementById('followupEmptyState'),
        // Modal
        modalRoot: document.getElementById('followupSettingsModal'),
        modalPageTitle: document.getElementById('modalPageTitle'),
        modalAutoSend: document.getElementById('modalAutoSend'),
        modalAnalysis: document.getElementById('modalAnalysis'),
        modalShowChat: document.getElementById('modalShowChat'),
        modalShowDashboard: document.getElementById('modalShowDashboard'),
        modalAiModel: document.getElementById('modalAiModel'),
        modalPrompt: document.getElementById('modalPrompt'),
        modalRoundsList: document.getElementById('modalRoundsList'),
        modalAddRound: document.getElementById('modalAddRound'),
        modalSaveBtn: document.getElementById('modalSaveBtn'),
        modalResetBtn: document.getElementById('modalResetBtn')
    };

    const modalInstance = el.modalRoot ? new bootstrap.Modal(el.modalRoot) : null;

    // ==================== UTILITIES ====================
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
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
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

    const formatDelayMinutes = (minutes) => {
        const value = Number(minutes);
        if (!Number.isFinite(value) || value <= 0) return '-';
        if (value < 60) return `${value} นาที`;
        const hours = Math.floor(value / 60);
        const mins = value % 60;
        return mins === 0 ? `${hours} ชม.` : `${hours} ชม. ${mins} นาที`;
    };

    // ==================== ALERT TOAST ====================
    const showAlert = (type, message) => {
        const iconMap = { success: 'circle-check', danger: 'triangle-exclamation', warning: 'circle-exclamation', info: 'circle-info' };
        const classMap = { success: 'alert-toast-success', danger: 'alert-toast-danger', warning: 'alert-toast-warning', info: 'alert-toast-info' };

        let container = document.getElementById('alertToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'alertToastContainer';
            container.className = 'alert-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `alert-toast ${classMap[type] || classMap.info}`;
        toast.innerHTML = `
            <span class="alert-toast-icon"><i class="fas fa-${iconMap[type] || iconMap.info}"></i></span>
            <div class="alert-toast-content">
                <div class="alert-toast-message">${escapeHtml(message)}</div>
            </div>
            <button class="alert-toast-close"><i class="fas fa-times"></i></button>
        `;

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        const hide = () => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 250);
        };

        const timeoutId = setTimeout(hide, 5000);
        toast.querySelector('.alert-toast-close').addEventListener('click', () => {
            clearTimeout(timeoutId);
            hide();
        });
    };

    // ==================== RENDER FUNCTIONS ====================
    const updateSummaryCards = () => {
        const s = state.overview.summary;
        if (el.metricActive) el.metricActive.textContent = s.active || 0;
        if (el.metricCompleted) el.metricCompleted.textContent = s.completed || 0;
        if (el.metricCanceled) el.metricCanceled.textContent = s.canceled || 0;
        if (el.metricFailed) el.metricFailed.textContent = s.failed || 0;
    };

    const updateStatusCounts = () => {
        const s = state.summary;
        const total = (s.active || 0) + (s.completed || 0) + (s.canceled || 0) + (s.failed || 0);
        if (el.countAll) el.countAll.textContent = total;
        if (el.countActive) el.countActive.textContent = s.active || 0;
        if (el.countCompleted) el.countCompleted.textContent = s.completed || 0;
        if (el.countCanceled) el.countCanceled.textContent = s.canceled || 0;
        if (el.countFailed) el.countFailed.textContent = s.failed || 0;
    };

    const renderPageList = () => {
        if (!el.pageList) return;
        if (!state.pages.length) {
            el.pageList.innerHTML = '<div class="text-muted small text-center py-3">ยังไม่มีเพจ/บอท</div>';
            return;
        }

        el.pageList.innerHTML = state.pages.map(page => {
            const isActive = state.currentPage && state.currentPage.id === page.id;
            const icon = page.platform === 'facebook' ? 'fab fa-facebook' : 'fab fa-line';
            const group = state.overview.groups.find(g => g.contextKey === page.id);
            const count = group?.stats?.active || 0;
            return `
                <button class="followup-page-item ${isActive ? 'active' : ''}" data-page-id="${page.id}">
                    <span class="page-info">
                        <i class="${icon} page-icon"></i>
                        <span class="page-name">${escapeHtml(page.name)}</span>
                    </span>
                    <span class="page-count">${count}</span>
                </button>
            `;
        }).join('');

        el.pageList.querySelectorAll('.followup-page-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const pageId = btn.dataset.pageId;
                if (pageId) selectPage(pageId);
            });
        });
    };

    const renderSchedulePreview = () => {
        if (!el.timeline) return;
        const cfg = state.currentConfig;

        if (!cfg) {
            el.timeline.innerHTML = '<div class="text-muted small">เลือกเพจเพื่อดูแผนการส่ง</div>';
            return;
        }

        if (el.badgeAutoSend) {
            const autoOn = cfg.autoFollowUpEnabled !== false;
            el.badgeAutoSend.textContent = autoOn ? 'ส่งอัตโนมัติ: เปิด' : 'ปิดส่งอัตโนมัติ';
            el.badgeAutoSend.classList.toggle('active', autoOn);
        }

        if (el.badgeAnalysis) {
            const analysisOn = cfg.analysisEnabled !== false;
            el.badgeAnalysis.textContent = `วิเคราะห์ AI: ${analysisOn ? 'เปิด' : 'ปิด'}`;
        }

        const rounds = Array.isArray(cfg.rounds) ? cfg.rounds : [];
        if (!rounds.length || cfg.autoFollowUpEnabled === false) {
            el.timeline.innerHTML = '<div class="text-muted small">ยังไม่ได้ตั้งค่าข้อความติดตาม หรือปิดการส่งอัตโนมัติ</div>';
            return;
        }

        el.timeline.innerHTML = rounds.map((round, i) => {
            const time = formatDelayMinutes(round.delayMinutes);
            const msg = round.message ? escapeHtml(round.message.substring(0, 40)) + (round.message.length > 40 ? '...' : '') : 'ส่งรูปภาพ';
            const imgCount = Array.isArray(round.images) ? round.images.length : 0;
            const imgLabel = imgCount > 0 ? ` (${imgCount} รูป)` : '';
            return `
                <div class="schedule-round">
                    <div class="schedule-round-number">${i + 1}</div>
                    <div class="schedule-round-info">
                        <div class="schedule-round-time">+${time}</div>
                        <div class="schedule-round-msg">${msg}${imgLabel}</div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderUsers = () => {
        if (!el.listContainer) return;

        const statusFilter = state.statusFilter;
        const searchQuery = state.searchQuery.toLowerCase();

        const filtered = state.users.filter(user => {
            if (statusFilter !== 'all' && user.status !== statusFilter) return false;
            if (searchQuery) {
                const fields = [user.displayName || '', user.userId || ''];
                if (!fields.some(f => f.toLowerCase().includes(searchQuery))) return false;
            }
            return true;
        });

        if (!filtered.length) {
            el.listContainer.innerHTML = `
                <div class="followup-empty-state">
                    <div class="empty-icon"><i class="fas fa-${searchQuery ? 'search' : 'user-clock'}"></i></div>
                    <div class="empty-title">${searchQuery ? 'ไม่พบข้อมูลที่ตรงกับคำค้น' : 'ยังไม่มีลูกค้าในสถานะนี้'}</div>
                    <div class="empty-desc">${searchQuery ? 'ลองเปลี่ยนคำค้นหา' : 'เมื่อมีลูกค้าจะแสดงที่นี่'}</div>
                </div>
            `;
            return;
        }

        el.listContainer.innerHTML = `<div class="followup-customer-grid">${filtered.map(user => {
            const initials = (user.displayName || '?').charAt(0).toUpperCase();
            const progress = user.totalRounds > 0 ? Math.round((user.sentRounds / user.totalRounds) * 100) : 0;
            const statusClass = `status-${user.status || 'pending'}`;
            const statusLabel = { active: 'กำลังติดตาม', completed: 'ส่งครบแล้ว', canceled: 'ยกเลิกแล้ว', failed: 'ล้มเหลว' }[user.status] || 'รอดำเนินการ';
            const canCancel = user.status === 'active';

            return `
                <div class="followup-customer-card" data-user-id="${escapeHtml(user.userId)}">
                    <div class="customer-header">
                        <div class="customer-avatar">${initials}</div>
                        <div class="customer-info">
                            <div class="customer-name">${escapeHtml(user.displayName || user.userId)}</div>
                            <div class="customer-meta">${escapeHtml(user.userId)}</div>
                        </div>
                        <span class="customer-status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="customer-details">
                        <div class="customer-detail-item">
                            <div class="detail-label">ข้อความถัดไป</div>
                            <div class="detail-value">${user.nextScheduledAt ? formatRelativeTime(user.nextScheduledAt) : '-'}</div>
                        </div>
                        <div class="customer-detail-item">
                            <div class="detail-label">ข้อความล่าสุดจากลูกค้า</div>
                            <div class="detail-value">${user.lastUserMessageAt ? formatRelativeTime(user.lastUserMessageAt) : '-'}</div>
                        </div>
                    </div>
                    <div class="customer-progress">
                        <div class="customer-progress-label">
                            <span>ความคืบหน้า</span>
                            <span>${user.sentRounds || 0}/${user.totalRounds || 0} รอบ</span>
                        </div>
                        <div class="customer-progress-bar">
                            <div class="customer-progress-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    <div class="customer-actions">
                        <button class="customer-action-btn btn-chat" data-action="chat" data-user-id="${escapeHtml(user.userId)}">
                            <i class="fas fa-comments"></i> เปิดแชท
                        </button>
                        <button class="customer-action-btn btn-danger" data-action="cancel" data-user-id="${escapeHtml(user.userId)}" ${canCancel ? '' : 'disabled'}>
                            <i class="fas fa-ban"></i> หยุดติดตาม
                        </button>
                    </div>
                </div>
            `;
        }).join('')}</div>`;

        // Bind actions
        el.listContainer.querySelectorAll('[data-action="chat"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.userId;
                if (userId) window.location.href = `/admin/chat?focus=${encodeURIComponent(userId)}`;
            });
        });

        el.listContainer.querySelectorAll('[data-action="cancel"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (btn.disabled) return;
                const userId = btn.dataset.userId;
                if (!userId || !confirm('ยืนยันยกเลิกการติดตาม?')) return;
                await clearUser(userId);
            });
        });
    };

    const showLoading = () => {
        if (el.listContainer) {
            el.listContainer.innerHTML = `
                <div class="followup-loading">
                    <div class="spinner-border text-primary" role="status"></div>
                    <span>กำลังโหลด...</span>
                </div>
            `;
        }
    };

    // ==================== MODAL FUNCTIONS ====================
    const renderModalRounds = () => {
        if (!el.modalRoundsList) return;
        if (!state.modalRounds.length) {
            el.modalRoundsList.innerHTML = '<div class="text-muted small py-3">ยังไม่มีรอบการติดตาม คลิก "เพิ่มรอบ" เพื่อเริ่มต้น</div>';
            return;
        }

        el.modalRoundsList.innerHTML = state.modalRounds.map((round, index) => {
            const imagesHtml = (round.images || []).map((img, imgIdx) => `
                <div class="round-image-item">
                    <img src="${escapeHtml(img.previewUrl || img.url)}" alt="">
                    <button type="button" class="round-image-remove" data-round="${index}" data-img="${imgIdx}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');

            return `
                <div class="round-item" data-index="${index}">
                    <div class="round-item-header">
                        <span class="round-item-number">${index + 1}</span>
                        <button type="button" class="round-item-remove" data-index="${index}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="round-item-body">
                        <div class="row g-3">
                            <div class="col-md-4">
                                <label class="form-label">เวลาหลังคุยล่าสุด</label>
                                <div class="input-group input-group-sm">
                                    <input type="number" class="form-control round-delay" min="1" value="${round.delayMinutes || 10}">
                                    <span class="input-group-text">นาที</span>
                                </div>
                            </div>
                            <div class="col-md-8">
                                <label class="form-label">ข้อความ</label>
                                <textarea class="form-control form-control-sm round-message" rows="2" placeholder="กรอกข้อความติดตาม...">${escapeHtml(round.message || '')}</textarea>
                            </div>
                            <div class="col-12">
                                <label class="form-label">รูปภาพแนบ</label>
                                <div class="round-images-grid">${imagesHtml}</div>
                                <button type="button" class="followup-btn followup-btn-secondary followup-btn-sm mt-2 round-add-image" data-index="${index}">
                                    <i class="fas fa-image"></i> เพิ่มรูป
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Bind events
        el.modalRoundsList.querySelectorAll('.round-delay').forEach((input, index) => {
            input.addEventListener('input', e => {
                state.modalRounds[index].delayMinutes = parseInt(e.target.value) || 10;
            });
        });

        el.modalRoundsList.querySelectorAll('.round-message').forEach((textarea, index) => {
            textarea.addEventListener('input', e => {
                state.modalRounds[index].message = e.target.value;
            });
        });

        el.modalRoundsList.querySelectorAll('.round-item-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                state.modalRounds.splice(idx, 1);
                renderModalRounds();
            });
        });

        el.modalRoundsList.querySelectorAll('.round-image-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const roundIdx = parseInt(btn.dataset.round);
                const imgIdx = parseInt(btn.dataset.img);
                if (state.modalRounds[roundIdx]?.images) {
                    state.modalRounds[roundIdx].images.splice(imgIdx, 1);
                    renderModalRounds();
                }
            });
        });

        el.modalRoundsList.querySelectorAll('.round-add-image').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.multiple = true;
                input.addEventListener('change', e => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) uploadRoundImages(index, files);
                });
                input.click();
            });
        });
    };

    const uploadRoundImages = async (roundIndex, files) => {
        const round = state.modalRounds[roundIndex];
        if (!round) return;
        if (!round.images) round.images = [];

        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('images', file);
                const res = await fetch('/admin/followup/assets', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success && data.assets) {
                    data.assets.forEach(a => {
                        round.images.push({
                            url: a.url,
                            previewUrl: a.previewUrl || a.thumbUrl || a.url
                        });
                    });
                }
            } catch (err) {
                console.error('Upload error:', err);
            }
        }
        renderModalRounds();
    };

    const openSettingsModal = () => {
        if (!state.currentPage || !modalInstance) return;

        const cfg = state.currentConfig || state.currentPage.settings || {};

        if (el.modalPageTitle) el.modalPageTitle.textContent = `ตั้งค่าเพจ: ${state.currentPage.name}`;
        if (el.modalAutoSend) el.modalAutoSend.checked = cfg.autoFollowUpEnabled !== false;
        if (el.modalAnalysis) el.modalAnalysis.checked = cfg.analysisEnabled !== false;
        if (el.modalShowChat) el.modalShowChat.checked = cfg.showInChat !== false;
        if (el.modalShowDashboard) el.modalShowDashboard.checked = cfg.showInDashboard !== false;
        if (el.modalAiModel) el.modalAiModel.value = cfg.model || 'gpt-5-mini';
        if (el.modalPrompt) el.modalPrompt.value = cfg.orderPromptInstructions || '';

        state.modalRounds = (cfg.rounds || []).map(r => ({
            delayMinutes: r.delayMinutes || 10,
            message: r.message || '',
            images: (r.images || []).map(img => ({ url: img.url, previewUrl: img.previewUrl || img.url }))
        }));

        renderModalRounds();
        modalInstance.show();
    };

    const saveSettings = async () => {
        if (!state.currentPage) return;

        const payload = {
            platform: state.currentPage.platform,
            botId: state.currentPage.botId,
            settings: {
                autoFollowUpEnabled: el.modalAutoSend?.checked ?? true,
                analysisEnabled: el.modalAnalysis?.checked ?? true,
                showInChat: el.modalShowChat?.checked ?? true,
                showInDashboard: el.modalShowDashboard?.checked ?? true,
                model: el.modalAiModel?.value || 'gpt-5-mini',
                orderPromptInstructions: el.modalPrompt?.value || '',
                rounds: state.modalRounds.filter(r => r.delayMinutes > 0 && (r.message || r.images?.length)).map(r => ({
                    delayMinutes: parseInt(r.delayMinutes) || 10,
                    message: r.message || '',
                    images: r.images || []
                }))
            }
        };

        try {
            const res = await fetch('/admin/followup/page-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                showAlert('success', 'บันทึกการตั้งค่าแล้ว');
                modalInstance.hide();
                await loadPages();
                await loadUsers();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถบันทึกได้');
            }
        } catch (err) {
            showAlert('danger', 'เกิดข้อผิดพลาด');
        }
    };

    const resetSettings = async () => {
        if (!state.currentPage || !confirm('ต้องการคืนค่าเริ่มต้น?')) return;

        try {
            const res = await fetch('/admin/followup/page-settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: state.currentPage.platform,
                    botId: state.currentPage.botId
                })
            });
            const data = await res.json();

            if (data.success) {
                showAlert('success', 'คืนค่าเริ่มต้นแล้ว');
                modalInstance.hide();
                await loadPages();
                await loadUsers();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถคืนค่าได้');
            }
        } catch (err) {
            showAlert('danger', 'เกิดข้อผิดพลาด');
        }
    };

    // ==================== API FUNCTIONS ====================
    const loadOverview = async () => {
        try {
            const res = await fetch('/admin/followup/overview');
            const data = await res.json();
            if (data.success) {
                state.overview = {
                    summary: data.summary || { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 },
                    groups: data.groups || []
                };
                updateSummaryCards();
                renderPageList();
            }
        } catch (err) {
            console.error('Load overview error:', err);
        }
    };

    const loadPages = async () => {
        try {
            const res = await fetch('/admin/followup/page-settings');
            const data = await res.json();

            if (data.success) {
                const prevId = state.currentPage?.id;
                state.pages = (data.pages || []).map(p => ({ ...p, settings: p.settings || {} }));

                renderPageList();

                if (state.pages.length && !state.currentPage) {
                    const fallback = state.pages.find(p => p.settings.showInDashboard !== false) || state.pages[0];
                    if (fallback) selectPage(fallback.id, { skipLoad: true });
                } else if (prevId) {
                    const stillExists = state.pages.find(p => p.id === prevId);
                    if (stillExists) state.currentPage = stillExists;
                }
            }
        } catch (err) {
            console.error('Load pages error:', err);
        }
    };

    const loadUsers = async (showMessage = false) => {
        if (!state.currentPage) return;

        showLoading();
        state.isLoading = true;

        try {
            const params = new URLSearchParams();
            if (state.currentPage.platform) params.set('platform', state.currentPage.platform);
            if (state.currentPage.botId) params.set('botId', state.currentPage.botId);

            const res = await fetch(`/admin/followup/users?${params}`);
            const data = await res.json();

            if (data.success) {
                state.users = data.users || [];
                state.summary = data.summary || { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 };
                if (data.config) {
                    state.currentConfig = data.config;
                }

                updateStatusCounts();
                renderSchedulePreview();
                renderUsers();

                if (showMessage) showAlert('info', 'อัปเดตข้อมูลแล้ว');
            }
        } catch (err) {
            console.error('Load users error:', err);
            showAlert('danger', 'เกิดข้อผิดพลาด');
        } finally {
            state.isLoading = false;
        }
    };

    const clearUser = async (userId) => {
        try {
            const res = await fetch('/admin/followup/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const data = await res.json();

            if (data.success) {
                showAlert('success', 'ยกเลิกการติดตามแล้ว');
                await loadUsers();
                await loadOverview();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถยกเลิกได้');
            }
        } catch (err) {
            showAlert('danger', 'เกิดข้อผิดพลาด');
        }
    };

    const selectPage = (pageId, options = {}) => {
        const page = state.pages.find(p => p.id === pageId);
        if (!page) return;

        state.currentPage = page;
        state.currentConfig = page.settings || null;
        state.users = [];
        state.summary = { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 };

        if (el.currentPageLabel) el.currentPageLabel.textContent = page.name;
        if (el.settingsBtn) el.settingsBtn.disabled = false;

        renderPageList();
        updateStatusCounts();
        renderSchedulePreview();

        if (!options.skipLoad) {
            loadUsers();
        }
    };

    const setStatusFilter = (status) => {
        state.statusFilter = status;

        // Update UI
        el.statusPills?.querySelectorAll('.followup-status-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === status);
        });

        renderUsers();
    };

    // ==================== SOCKET ====================
    const initSocket = () => {
        if (state.socket) return;
        try {
            state.socket = io();
            state.socket.on('followUpTagged', () => {
                if (state.currentPage) loadUsers();
            });
            state.socket.on('followUpScheduleUpdated', () => {
                if (state.currentPage) loadUsers();
            });
        } catch (err) {
            console.warn('Socket error:', err);
        }
    };

    // ==================== EVENT LISTENERS ====================
    const setupEventListeners = () => {
        // Status pills
        el.statusPills?.querySelectorAll('.followup-status-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                setStatusFilter(btn.dataset.status || 'all');
            });
        });

        // Search
        if (el.searchInput) {
            let debounce;
            el.searchInput.addEventListener('input', () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    state.searchQuery = el.searchInput.value.trim();
                    renderUsers();
                }, 300);
            });
        }

        // Refresh
        if (el.refreshBtn) {
            el.refreshBtn.addEventListener('click', () => {
                loadUsers(true);
                loadOverview();
            });
        }

        // Settings button
        if (el.settingsBtn) {
            el.settingsBtn.addEventListener('click', openSettingsModal);
        }

        // Modal buttons
        if (el.modalAddRound) {
            el.modalAddRound.addEventListener('click', () => {
                state.modalRounds.push({ delayMinutes: 10, message: '', images: [] });
                renderModalRounds();
            });
        }

        if (el.modalSaveBtn) {
            el.modalSaveBtn.addEventListener('click', saveSettings);
        }

        if (el.modalResetBtn) {
            el.modalResetBtn.addEventListener('click', resetSettings);
        }
    };

    // ==================== INIT ====================
    const init = async () => {
        setupEventListeners();
        await loadOverview();
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
