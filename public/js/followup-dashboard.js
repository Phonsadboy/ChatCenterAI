(() => {
    const state = {
        pages: [],
        currentPage: null,
        users: [],
        summary: { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 },
        isLoadingUsers: false,
        socket: null,
        config: window.followUpDashboardConfig || {},
        currentContextConfig: null,
        modalRounds: [],
        statusFilter: 'all'
    };

    const el = {
        list: document.getElementById('followupList'),
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
        modalAutoSend: document.getElementById('followupModalAutoSend'),
        modalRoundsContainer: document.getElementById('followupModalRoundsContainer'),
        modalRounds: document.getElementById('followupModalRounds'),
        modalAddRound: document.getElementById('followupModalAddRound'),
        modalResetBtn: document.getElementById('followupModalResetBtn'),
        modalSaveBtn: document.getElementById('followupModalSaveBtn'),
        modalTitle: document.getElementById('followupModalTitle'),
        summaryActive: document.getElementById('followupMetricActive'),
        summaryActiveMeta: document.getElementById('followupMetricActiveMeta'),
        summaryCompleted: document.getElementById('followupMetricCompleted'),
        summaryCompletedMeta: document.getElementById('followupMetricCompletedMeta'),
        summaryCanceled: document.getElementById('followupMetricCanceled'),
        summaryCanceledMeta: document.getElementById('followupMetricCanceledMeta'),
        summaryFailed: document.getElementById('followupMetricFailed'),
        summaryFailedMeta: document.getElementById('followupMetricFailedMeta'),
        schedulePreview: document.getElementById('followupSchedulePreview'),
        autoStatusBadge: document.getElementById('followupAutoStatusBadge'),
        filterButtons: document.querySelectorAll('.followup-filter-btn')
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

    const formatDelayMinutes = (minutes) => {
        const value = Number(minutes);
        if (!Number.isFinite(value) || value <= 0) return '-';
        if (value < 60) return `${value} นาที`;
        const hours = Math.floor(value / 60);
        const mins = value % 60;
        if (mins === 0) {
            return `${hours} ชม.`;
        }
        return `${hours} ชม. ${mins} นาที`;
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return '<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>ส่งครบแล้ว</span>';
            case 'canceled':
                return '<span class="badge bg-secondary"><i class="fas fa-ban me-1"></i>ยกเลิกแล้ว</span>';
            case 'failed':
                return '<span class="badge bg-danger"><i class="fas fa-exclamation-triangle me-1"></i>ส่งไม่สำเร็จ</span>';
            case 'active':
                return '<span class="badge bg-warning text-dark"><i class="fas fa-sync me-1"></i>กำลังติดตาม</span>';
            default:
                return '<span class="badge bg-info text-dark"><i class="fas fa-clock me-1"></i>รอดำเนินการ</span>';
        }
    };

    const setRoundsDisabled = (disabled) => {
        if (el.modalRoundsContainer) {
            el.modalRoundsContainer.classList.toggle('opacity-50', disabled);
        }
        if (el.modalAddRound) {
            el.modalAddRound.disabled = !!disabled;
        }
    };

    const renderModalRounds = () => {
        if (!el.modalRounds) return;
        if (!Array.isArray(state.modalRounds)) {
            state.modalRounds = [];
        }

        if (state.modalRounds.length === 0) {
            el.modalRounds.innerHTML = '<div class="text-muted small py-2">ยังไม่มีข้อความติดตาม กดปุ่ม "เพิ่มข้อความ" เพื่อเริ่มต้น</div>';
            return;
        }

        el.modalRounds.innerHTML = state.modalRounds.map((round, index) => {
            const safeMessage = escapeHtml(round?.message || '');
            const delayValue = Number(round?.delayMinutes);
            return `
                <div class="followup-round-item border rounded p-2 mb-2 bg-white" data-index="${index}">
                    <div class="row g-2 align-items-start">
                        <div class="col-sm-3">
                            <label class="form-label form-label-sm text-muted mb-1">เวลาหลังคุยล่าสุด</label>
                            <div class="input-group input-group-sm">
                                <input type="number" class="form-control followup-round-delay" min="1" step="1" value="${Number.isFinite(delayValue) ? delayValue : ''}">
                                <span class="input-group-text">นาที</span>
                            </div>
                        </div>
                        <div class="col-sm-8">
                            <label class="form-label form-label-sm text-muted mb-1">ข้อความ</label>
                            <textarea class="form-control form-control-sm followup-round-message" rows="2" placeholder="กรอกข้อความติดตาม">${safeMessage}</textarea>
                        </div>
                        <div class="col-sm-1 d-flex justify-content-end">
                            <button type="button" class="btn btn-sm btn-outline-danger followup-round-remove" title="ลบข้อความ">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        el.modalRounds.querySelectorAll('.followup-round-delay').forEach(input => {
            const container = input.closest('.followup-round-item');
            if (!container) return;
            const index = Number(container.dataset.index);
            input.addEventListener('input', (event) => {
                const value = Number(event.target.value);
                state.modalRounds[index].delayMinutes = Number.isFinite(value) ? value : '';
            });
        });

        el.modalRounds.querySelectorAll('.followup-round-message').forEach(textarea => {
            const container = textarea.closest('.followup-round-item');
            if (!container) return;
            const index = Number(container.dataset.index);
            textarea.addEventListener('input', (event) => {
                state.modalRounds[index].message = event.target.value;
            });
        });

        el.modalRounds.querySelectorAll('.followup-round-remove').forEach(btn => {
            const container = btn.closest('.followup-round-item');
            if (!container) return;
            const index = Number(container.dataset.index);
            btn.addEventListener('click', () => {
                state.modalRounds.splice(index, 1);
                renderModalRounds();
            });
        });
    };

    const addModalRound = (round) => {
        if (!Array.isArray(state.modalRounds)) {
            state.modalRounds = [];
        }
        const fallbackDelay = state.modalRounds.length > 0
            ? Number(state.modalRounds[state.modalRounds.length - 1].delayMinutes) || 10
            : 10;
        const nextRound = {
            delayMinutes: Number(round?.delayMinutes) || fallbackDelay,
            message: round?.message || ''
        };
        state.modalRounds.push(nextRound);
        renderModalRounds();
    };

    const collectRoundsPayload = () => {
        if (!Array.isArray(state.modalRounds)) return [];
        return state.modalRounds
            .map(round => {
                const delay = Number(round.delayMinutes);
                const message = (round.message || '').trim();
                return { delayMinutes: delay, message };
            })
            .filter(round => Number.isFinite(round.delayMinutes) && round.delayMinutes >= 1 && round.message.length > 0);
    };

    const handleAutoSendToggle = () => {
        const enabled = el.modalAutoSend && el.modalAutoSend.checked;
        setRoundsDisabled(!enabled);
    };

    const renderSchedulePreview = (config) => {
        if (!el.schedulePreview) return;
        if (!config) {
            el.schedulePreview.innerHTML = '<div class="text-muted small">เลือกหน้าเพจเพื่อดูแผนการส่งข้อความ</div>';
            return;
        }
        if (config.autoFollowUpEnabled === false) {
            el.schedulePreview.innerHTML = '<div class="text-muted small">ระบบจะไม่ส่งข้อความอัตโนมัติสำหรับเพจนี้</div>';
            return;
        }
        const rounds = Array.isArray(config.rounds) ? config.rounds : [];
        if (!rounds.length) {
            el.schedulePreview.innerHTML = '<div class="text-muted small">ยังไม่ได้กำหนดข้อความติดตาม</div>';
            return;
        }
        const html = rounds.map((round, index) => {
            const delay = Number(round.delayMinutes);
            const label = formatDelayMinutes(delay);
            return `
                <div class="followup-schedule-item">
                    <div class="schedule-order">${index + 1}</div>
                    <div class="schedule-detail">
                        <div class="schedule-time">+${label}</div>
                        <div class="schedule-message">${escapeHtml(round.message || '')}</div>
                    </div>
                </div>
            `;
        }).join('');
        el.schedulePreview.innerHTML = html;
    };

    const updateConfigDisplay = (config) => {
        const analysisOn = config && config.analysisEnabled !== false;
        if (el.analysisLabel) {
            el.analysisLabel.textContent = analysisOn ? 'วิเคราะห์ด้วย AI (เปิด)' : 'วิเคราะห์ด้วย AI (ปิด)';
        }
        if (el.autoStatusBadge) {
            const autoOn = config && config.autoFollowUpEnabled !== false;
            el.autoStatusBadge.textContent = autoOn ? 'ส่งข้อความอัตโนมัติ (เปิด)' : 'ส่งข้อความอัตโนมัติ (ปิด)';
            el.autoStatusBadge.classList.remove('bg-success', 'bg-secondary');
            el.autoStatusBadge.classList.add(autoOn ? 'bg-success' : 'bg-secondary');
        }
        if (el.analysisSubtitle) {
            if (!config) {
                el.analysisSubtitle.textContent = 'เลือกหน้าเพจเพื่อดูรายละเอียดการติดตาม';
            } else if (config.autoFollowUpEnabled === false) {
                el.analysisSubtitle.textContent = 'ระบบจะไม่ส่งข้อความอัตโนมัติจนกว่าจะเปิดใช้งาน';
            } else {
                const parts = ['ระบบจะนับเวลาจากข้อความล่าสุดของลูกค้า'];
                if (typeof config.historyLimit === 'number') {
                    parts.push(`ใช้ประวัติล่าสุด ${config.historyLimit} ข้อความ`);
                }
                if (typeof config.cooldownMinutes === 'number') {
                    parts.push(`วิเคราะห์ซ้ำทุก ${config.cooldownMinutes} นาที`);
                }
                el.analysisSubtitle.textContent = parts.join(' • ');
            }
        }
        renderSchedulePreview(config);
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
        const summary = state.summary || {};
        const active = summary.active || 0;
        const completed = summary.completed || 0;
        const canceled = summary.canceled || 0;
        const failed = summary.failed || 0;

        if (el.summaryActive) el.summaryActive.textContent = active;
        if (el.summaryCompleted) el.summaryCompleted.textContent = completed;
        if (el.summaryCanceled) el.summaryCanceled.textContent = canceled;
        if (el.summaryFailed) el.summaryFailed.textContent = failed;

        if (el.summaryActiveMeta) {
            const now = Date.now();
            const dueSoon = state.users.filter(user => {
                if (user.status !== 'active' || !user.nextScheduledAt) return false;
                const diff = new Date(user.nextScheduledAt).getTime() - now;
                return diff >= 0 && diff <= 30 * 60000;
            }).length;
            el.summaryActiveMeta.textContent = dueSoon > 0
                ? `ส่งใน 30 นาทีนี้ ${dueSoon} ราย`
                : 'กำลังรอรอบถัดไป';
        }

        if (el.summaryCompletedMeta) {
            const messagesSent = state.users
                .filter(user => user.status === 'completed')
                .reduce((sum, user) => {
                    const rounds = Array.isArray(user.rounds) ? user.rounds.length : Number(user.sentRounds) || 0;
                    return sum + rounds;
                }, 0);
            el.summaryCompletedMeta.textContent = messagesSent > 0
                ? `รวมส่งแล้ว ${messagesSent} ข้อความ`
                : 'รอข้อความครบตามแผน';
        }

        if (el.summaryCanceledMeta) {
            el.summaryCanceledMeta.textContent = canceled > 0
                ? `ยกเลิกเพราะลูกค้าตอบกลับ ${canceled} ราย`
                : 'ยังไม่มีการยกเลิกในวันนี้';
        }

        if (el.summaryFailedMeta) {
            el.summaryFailedMeta.textContent = failed > 0
                ? `ต้องตรวจสอบเพิ่มเติม ${failed} ราย`
                : 'ยังไม่มีงานที่ส่งไม่สำเร็จ';
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
            updateConfigDisplay(null);
            return;
        }

        if (el.pageLabel) {
            el.pageLabel.textContent = state.currentPage.name;
        }

        if (el.pageStatus) {
            const cfg = state.currentContextConfig || state.currentPage.settings;
            const statusTexts = [];
            statusTexts.push(state.currentPage.platform === 'facebook' ? 'Facebook' : 'LINE');
            statusTexts.push(`ส่งอัตโนมัติ: ${cfg.autoFollowUpEnabled === false ? 'ปิด' : 'เปิด'}`);
            statusTexts.push(`วิเคราะห์ด้วย AI: ${cfg.analysisEnabled !== false ? 'เปิด' : 'ปิด'}`);
            el.pageStatus.textContent = statusTexts.join(' • ');
        }

        if (el.search) {
            el.search.disabled = state.currentContextConfig && state.currentContextConfig.showInDashboard === false;
            if (el.search.disabled) {
                el.search.value = '';
            }
        }

        const disabledDashboard = state.currentContextConfig && state.currentContextConfig.showInDashboard === false;
        if (el.settingsBtn) {
            el.settingsBtn.disabled = false;
        }

        if (el.refresh) {
            el.refresh.disabled = !!disabledDashboard;
        }

        updateConfigDisplay(state.currentContextConfig || state.currentPage.settings || null);
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
        state.summary = { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 };
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
    };

    const renderUserTimeline = (user) => {
        const rounds = Array.isArray(user.rounds) ? user.rounds : [];
        if (!rounds.length) {
            return '<div class="text-muted small">ยังไม่ได้ตั้งค่าข้อความติดตามสำหรับเพจนี้</div>';
        }
        return `
            <div class="followup-timeline">
                ${rounds.map((round, index) => {
                    const status = round?.status || 'pending';
                    let displayStatus = status;
                    let statusLabel = 'รอส่ง';
                    if (status === 'sent') {
                        statusLabel = 'ส่งแล้ว';
                    } else if (status === 'failed') {
                        statusLabel = 'ส่งไม่สำเร็จ';
                    } else if (user.status === 'canceled') {
                        statusLabel = 'ถูกยกเลิก';
                        displayStatus = 'canceled';
                    }

                    const scheduledAt = round?.scheduledAt ? formatDateTime(round.scheduledAt) : null;
                    const relative = round?.sentAt
                        ? `ส่งเมื่อ ${formatRelativeTime(round.sentAt)}`
                        : scheduledAt
                            ? `กำหนดส่ง ${formatRelativeTime(round.scheduledAt)}`
                            : `หลัง +${formatDelayMinutes(round?.delayMinutes)}`;
                    const absolute = scheduledAt || `+${formatDelayMinutes(round?.delayMinutes)}`;

                    return `
                        <div class="followup-timeline-item ${displayStatus}">
                            <div class="timeline-dot"></div>
                            <div class="timeline-body">
                                <div class="timeline-header d-flex justify-content-between align-items-center">
                                    <span class="timeline-index">รอบที่ ${index + 1}</span>
                                    <span class="timeline-status">${statusLabel}</span>
                                </div>
                                <div class="timeline-time text-muted">${relative} (${absolute})</div>
                                <div class="timeline-message">${escapeHtml(round?.message || '')}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    };

    const renderUsers = () => {
        if (!el.list) return;
        const cfg = state.currentContextConfig;
        if (!state.currentPage || (cfg && cfg.showInDashboard === false)) {
            renderDisabledState();
            return;
        }
        const keyword = el.search && typeof el.search.value === 'string'
            ? el.search.value.trim().toLowerCase()
            : '';
        const statusFilter = state.statusFilter || 'all';
        const byStatus = state.users.filter(user => {
            if (statusFilter === 'all') return true;
            return user.status === statusFilter;
        });
        const filtered = byStatus.filter(user => {
            if (!keyword) return true;
            const fields = [
                user.displayName || '',
                user.userId || '',
                user.nextMessage || '',
                user.lastUserMessagePreview || ''
            ];
            return fields.some(value => String(value).toLowerCase().includes(keyword));
        });

        if (!filtered.length) {
            if (el.list) el.list.innerHTML = '';
            if (el.emptyState) {
                el.emptyState.classList.remove('d-none');
                const emptyTitle = keyword
                    ? 'ไม่พบข้อมูลที่ตรงกับคำค้น'
                    : 'ยังไม่มีลูกค้าในสถานะนี้';
                const emptySubtitle = keyword
                    ? 'ลองเปลี่ยนคำค้นหา หรือรอลูกค้าพูดคุยเพิ่มเติม'
                    : 'เมื่อมีลูกค้าที่ตรงเงื่อนไข ระบบจะแสดงรายชื่อที่นี่';
                el.emptyState.innerHTML = `
                    <i class="fas fa-search fa-2x mb-2 text-muted"></i>
                    <p class="mb-1">${emptyTitle}</p>
                    <p class="small mb-0">${emptySubtitle}</p>
                `;
            }
            return;
        }

        if (el.emptyState) {
            el.emptyState.classList.add('d-none');
        }

        const cards = filtered.map(user => {
            const initials = escapeHtml((user.displayName || '?').charAt(0).toUpperCase());
            const platformBadge = user.platform === 'facebook'
                ? '<span class="badge bg-primary-soft text-primary"><i class="fab fa-facebook me-1"></i>Facebook</span>'
                : '<span class="badge bg-success-soft text-success"><i class="fab fa-line me-1"></i>LINE</span>';
            const statusBadge = getStatusBadge(user.status);
            const nextMessage = escapeHtml(user.nextMessage || '-');
            const nextScheduleRelative = user.nextScheduledAt ? formatRelativeTime(user.nextScheduledAt) : 'ยังไม่มีนัดหมาย';
            const nextScheduleExact = user.nextScheduledAt ? formatDateTime(user.nextScheduledAt) : '-';
            const lastCustomerMessage = escapeHtml(user.lastUserMessagePreview || '-');
            const lastCustomerTime = user.lastUserMessageAt ? formatRelativeTime(user.lastUserMessageAt) : '-';
            const progressLabel = `${user.sentRounds || 0}/${user.totalRounds || 0}`;
            const lastFollowUp = user.lastFollowUpAt ? formatRelativeTime(user.lastFollowUpAt) : 'ยังไม่เคยส่ง';
            const canceledInfo = user.status === 'canceled' && user.canceledReason
                ? `<div class="followup-section text-muted small">เหตุผลการยกเลิก: ${escapeHtml(user.canceledReason)}</div>`
                : '';
            const timeline = renderUserTimeline(user);
            const canCancel = user.status === 'active';
            return `
                <div class="followup-card" data-user-id="${escapeHtml(user.userId)}">
                    <div class="followup-card-header">
                        <div class="followup-avatar">${initials}</div>
                        <div class="followup-card-meta">
                            <div class="followup-name">${escapeHtml(user.displayName || user.userId)}</div>
                            <div class="followup-sub">${escapeHtml(user.userId)} • ${platformBadge}</div>
                        </div>
                        <div class="followup-status-badge">${statusBadge}</div>
                    </div>
                    <div class="followup-card-body">
                        <div class="followup-section">
                            <div class="label">ข้อความถัดไป</div>
                            <div class="value">${nextMessage}</div>
                            <div class="meta">${nextScheduleExact} (${nextScheduleRelative})</div>
                        </div>
                        <div class="followup-section">
                            <div class="label">ข้อความล่าสุดจากลูกค้า</div>
                            <div class="value">${lastCustomerMessage}</div>
                            <div class="meta">${lastCustomerTime}</div>
                        </div>
                        <div class="followup-section">
                            <div class="label">ความคืบหน้า</div>
                            <div class="value">${progressLabel} รอบ</div>
                            <div class="meta">ส่งล่าสุด: ${lastFollowUp}</div>
                        </div>
                        <div class="followup-section">
                            <div class="label">ตารางข้อความ</div>
                            ${timeline}
                        </div>
                        ${canceledInfo}
                    </div>
                    <div class="followup-card-actions">
                        <button class="btn btn-sm btn-outline-secondary" data-action="open-chat">
                            <i class="fas fa-comments me-1"></i>เปิดหน้าแชท
                        </button>
                        <button class="btn btn-sm btn-outline-danger" data-action="clear-task" ${canCancel ? '' : 'disabled'}>
                            <i class="fas fa-ban me-1"></i>${canCancel ? 'หยุดติดตามวันนี้' : 'หยุดติดตามแล้ว'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        el.list.innerHTML = cards;
        el.list.querySelectorAll('.followup-card button[data-action="clear-task"]').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                if (btn.disabled) return;
                const card = event.currentTarget.closest('.followup-card');
                const userId = card ? card.getAttribute('data-user-id') : null;
                if (!userId) return;
                if (!confirm('ยืนยันยกเลิกการติดตามสำหรับลูกค้ารายนี้หรือไม่?')) return;
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
                showAlert('success', 'ยกเลิกการติดตามเรียบร้อยแล้ว');
                await loadUsers();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถยกเลิกการติดตามได้');
            }
        } catch (error) {
            console.error('clear follow-up error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการยกเลิกการติดตาม');
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
                const summaryData = data.summary || {};
                state.summary = {
                    total: typeof summaryData.total === 'number' ? summaryData.total : state.users.length,
                    active: typeof summaryData.active === 'number' ? summaryData.active : (state.users.length || 0),
                    completed: typeof summaryData.completed === 'number' ? summaryData.completed : 0,
                    canceled: typeof summaryData.canceled === 'number' ? summaryData.canceled : 0,
                    failed: typeof summaryData.failed === 'number' ? summaryData.failed : 0
                };
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
        state.summary = { total: 0, active: 0, completed: 0, canceled: 0, failed: 0 };
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
        if (el.modalAutoSend) el.modalAutoSend.checked = cfg.autoFollowUpEnabled !== false;
        if (el.modalShowChat) el.modalShowChat.checked = cfg.showInChat !== false;
        if (el.modalShowDashboard) el.modalShowDashboard.checked = cfg.showInDashboard !== false;
        if (el.modalHistoryLimit) el.modalHistoryLimit.value = cfg.historyLimit ?? 10;
        if (el.modalCooldown) el.modalCooldown.value = cfg.cooldownMinutes ?? 30;
        if (el.modalModel) el.modalModel.value = cfg.model || MODEL_OPTIONS[0];
        state.modalRounds = Array.isArray(cfg.rounds)
            ? cfg.rounds.map(round => ({
                delayMinutes: Number(round.delayMinutes) || '',
                message: round.message || ''
            }))
            : [];
        renderModalRounds();
        handleAutoSendToggle();
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
                autoFollowUpEnabled: !!(el.modalAutoSend && el.modalAutoSend.checked),
                showInChat: !!(el.modalShowChat && el.modalShowChat.checked),
                showInDashboard: !!(el.modalShowDashboard && el.modalShowDashboard.checked),
                historyLimit: el.modalHistoryLimit ? Number(el.modalHistoryLimit.value) : undefined,
                cooldownMinutes: el.modalCooldown ? Number(el.modalCooldown.value) : undefined,
                model: el.modalModel ? el.modalModel.value : undefined
            }
        };
        payload.settings.rounds = collectRoundsPayload();
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
                const dataPlatform = data && data.platform !== undefined ? data.platform : null;
                const dataBotId = normalizeId(data && data.botId !== undefined ? data.botId : null);
                if (!state.currentPage) return;
                const currentBotId = normalizeId(state.currentPage.botId);
                const platformMatch = dataPlatform === null || dataPlatform === state.currentPage.platform;
                const botMatch = dataBotId === null || dataBotId === currentBotId;
                if (platformMatch && botMatch) {
                    loadUsers();
                }
            });
            state.socket.on('followUpScheduleUpdated', (data) => {
                const dataPlatform = data && data.platform !== undefined ? data.platform : null;
                const dataBotId = normalizeId(data && data.botId !== undefined ? data.botId : null);
                if (!state.currentPage) return;
                const currentBotId = normalizeId(state.currentPage.botId);
                const platformMatch = dataPlatform === null || dataPlatform === state.currentPage.platform;
                const botMatch = dataBotId === null || dataBotId === currentBotId;
                if (platformMatch && botMatch) {
                    loadUsers();
                }
            });
        } catch (error) {
            console.warn('ไม่สามารถเชื่อมต่อ Socket.IO ได้', error);
        }
    };

    const setStatusFilter = (status) => {
        state.statusFilter = status || 'all';
        if (el.filterButtons && typeof el.filterButtons.forEach === 'function') {
            el.filterButtons.forEach(btn => {
                const btnStatus = btn.getAttribute('data-status') || 'all';
                if (btnStatus === state.statusFilter) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        renderUsers();
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
        if (el.filterButtons && typeof el.filterButtons.forEach === 'function') {
            el.filterButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const status = btn.getAttribute('data-status') || 'all';
                    setStatusFilter(status);
                });
            });
        }
        if (el.modalAutoSend) {
            el.modalAutoSend.addEventListener('change', () => {
                handleAutoSendToggle();
            });
        }
        if (el.modalAddRound) {
            el.modalAddRound.addEventListener('click', () => {
                addModalRound({ delayMinutes: 10, message: '' });
            });
        }
    };

    const init = async () => {
        populateModalOptions();
        setupEventListeners();
        setStatusFilter(state.statusFilter || 'all');
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
