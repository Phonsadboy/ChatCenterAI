(() => {
    const state = {
        pages: [],
        currentPage: null,
        currentContextConfig: null,
        config: window.followUpDashboardConfig || {},
        editorRounds: [],
        assets: [],
        activeTab: 'general',
        isLoading: false
    };

    const el = {
        pageSelector: document.getElementById('followupPageSelector'),
        pageSearch: document.getElementById('followupPageSearch'),
        emptyMain: document.getElementById('followupEmptyMain'),
        editor: document.getElementById('followupEditor'),
        editorPageName: document.getElementById('editorPageName'),
        editorPlatformBadge: document.getElementById('editorPlatformBadge'),
        editorAutoBadge: document.getElementById('editorAutoBadge'),
        saveBtn: document.getElementById('followupSaveBtn'),
        resetBtn: document.getElementById('followupResetBtn'),
        tabButtons: document.querySelectorAll('.followup-tab'),
        tabContents: document.querySelectorAll('.followup-tab-content'),
        settingAutoSend: document.getElementById('settingAutoSend'),
        settingShowChat: document.getElementById('settingShowChat'),
        settingShowDashboard: document.getElementById('settingShowDashboard'),
        settingAnalysis: document.getElementById('settingAnalysis'),
        settingModel: document.getElementById('settingModel'),
        settingPrompt: document.getElementById('settingPrompt'),
        emergencyStopGroup: document.getElementById('emergencyStopGroup'),
        roundsContainer: document.getElementById('roundsContainer'),
        btnAddRound: document.getElementById('btnAddRound'),
        imageLibraryGrid: document.getElementById('imageLibraryGrid'),
        btnUploadImage: document.getElementById('btnUploadImage')
    };

    const MODEL_OPTIONS = [
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (แนะนำ)' },
        { value: 'gpt-5.4', label: 'GPT-5.4 (แม่นสุด)' },
        { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano (ประหยัด)' },
        { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
        { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
        { value: 'gpt-5', label: 'GPT-5' },
        { value: 'gpt-4.1', label: 'GPT-4.1' },
        { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
        { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
        { value: 'o4-mini', label: 'O4 Mini (reasoning คุ้มสุด)' },
        { value: 'o3', label: 'O3 (reasoning ลึกสุด)' }
    ];

    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const escapeAttr = (text) => {
        if (text === undefined || text === null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    const cloneRoundImage = (image) => {
        if (!image || !image.url) return null;
        const url = String(image.url);
        const previewUrl = typeof image.previewUrl === 'string' && image.previewUrl
            ? image.previewUrl
            : (typeof image.thumbUrl === 'string' && image.thumbUrl ? image.thumbUrl : url);
        const cloned = { url, previewUrl };
        if (image.thumbUrl) cloned.thumbUrl = image.thumbUrl;
        if (image.assetId) cloned.assetId = image.assetId;
        if (image.id) cloned.id = image.id;
        if (image.fileName) cloned.fileName = image.fileName;
        if (image.alt) cloned.alt = image.alt;
        if (image.caption) cloned.caption = image.caption;
        if (Number.isFinite(Number(image.width))) cloned.width = Number(image.width);
        if (Number.isFinite(Number(image.height))) cloned.height = Number(image.height);
        if (Number.isFinite(Number(image.size))) cloned.size = Number(image.size);
        return cloned;
    };

    const roundLegacyToItems = (round) => {
        const items = [];
        if (typeof round.message === 'string' && round.message.trim()) {
            items.push({ type: 'text', content: round.message.trim() });
        }
        if (Array.isArray(round.images)) {
            round.images.forEach(img => {
                const cloned = cloneRoundImage(img);
                if (cloned) items.push({ type: 'image', ...cloned });
            });
        }
        return items;
    };

    const sanitizeRoundImages = (images) => {
        if (!Array.isArray(images)) return [];
        return images
            .map(img => {
                if (!img || !img.url) return null;
                const url = String(img.url).trim();
                if (!url) return null;
                const previewUrl = typeof img.previewUrl === 'string' && img.previewUrl.trim()
                    ? img.previewUrl.trim()
                    : (typeof img.thumbUrl === 'string' && img.thumbUrl.trim() ? img.thumbUrl.trim() : url);
                const sanitized = { url, previewUrl };
                if (typeof img.thumbUrl === 'string' && img.thumbUrl.trim()) sanitized.thumbUrl = img.thumbUrl.trim();
                const assetId = img.assetId || img.id;
                if (assetId) sanitized.assetId = String(assetId);
                if (typeof img.fileName === 'string' && img.fileName.trim()) sanitized.fileName = img.fileName.trim();
                if (typeof img.alt === 'string' && img.alt.trim()) sanitized.alt = img.alt.trim();
                if (typeof img.caption === 'string' && img.caption.trim()) sanitized.caption = img.caption.trim();
                const toRounded = (value) => {
                    const num = Number(value);
                    return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
                };
                const width = toRounded(img.width);
                const height = toRounded(img.height);
                const size = toRounded(img.size);
                if (width) sanitized.width = width;
                if (height) sanitized.height = height;
                if (size) sanitized.size = size;
                return sanitized;
            })
            .filter(Boolean);
    };

    const sanitizeRoundItem = (item) => {
        if (!item || typeof item !== 'object') return null;
        if (item.type === 'text') {
            const content = typeof item.content === 'string' ? item.content.trim() : '';
            if (!content) return null;
            return { type: 'text', content };
        }
        if (item.type === 'image') {
            const imgs = sanitizeRoundImages([item]);
            if (!imgs.length) return null;
            return { type: 'image', ...imgs[0] };
        }
        return null;
    };

    const sanitizeRoundItems = (items) => {
        if (!Array.isArray(items)) return [];
        return items.map(sanitizeRoundItem).filter(Boolean);
    };

    const formatRoundPreview = (round) => {
        if (!round) return '';
        const items = Array.isArray(round.items) ? round.items : roundLegacyToItems(round);
        const texts = items.filter(i => i.type === 'text').map(i => i.content).filter(Boolean);
        const imageCount = items.filter(i => i.type === 'image').length;
        const message = texts[0] || '';
        if (message && imageCount > 0) return `${message} • รูปภาพ ${imageCount} รูป`;
        if (message) return message;
        if (imageCount > 0) return `ส่งรูปภาพ ${imageCount} รูป`;
        return '';
    };

    const formatDelayMinutes = (minutes) => {
        const value = Number(minutes);
        if (!Number.isFinite(value) || value <= 0) return '-';
        if (value < 60) return `${value} นาที`;
        const hours = Math.floor(value / 60);
        const mins = value % 60;
        if (mins === 0) return `${hours} ชม.`;
        return `${hours} ชม. ${mins} นาที`;
    };

    const isHardStopEnabled = (config) => {
        return !!(config && config.hardStopEnabled === true);
    };

    const isAutoFollowUpEffectiveEnabled = (config) => {
        if (!config) return false;
        if (isHardStopEnabled(config)) return false;
        return config.autoFollowUpEnabled !== false;
    };

    const showAlert = (type, message) => {
        const container = document.getElementById('alertToastContainer');
        if (!container) return;

        const iconMap = {
            success: 'circle-check',
            danger: 'triangle-exclamation',
            warning: 'circle-exclamation',
            info: 'circle-info'
        };
        const classMap = {
            success: 'alert-toast-success',
            danger: 'alert-toast-danger',
            warning: 'alert-toast-warning',
            info: 'alert-toast-info'
        };

        const normalizedType = classMap[type] ? type : 'info';
        const toast = document.createElement('div');
        toast.className = `alert-toast ${classMap[normalizedType]}`;
        toast.setAttribute('role', 'alert');

        const iconSpan = document.createElement('span');
        iconSpan.className = 'alert-toast-icon';
        iconSpan.innerHTML = `<i class="fas fa-${iconMap[normalizedType] || iconMap.info}"></i>`;

        const content = document.createElement('div');
        content.className = 'alert-toast-content';

        const messageDiv = document.createElement('div');
        messageDiv.className = 'alert-toast-message';
        messageDiv.textContent = message;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'alert-toast-close';
        closeBtn.setAttribute('aria-label', 'ปิดการแจ้งเตือน');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';

        content.appendChild(messageDiv);
        content.appendChild(closeBtn);
        toast.appendChild(iconSpan);
        toast.appendChild(content);
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));

        const hideToast = () => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 220);
        };

        const timeoutId = setTimeout(hideToast, 5000);
        closeBtn.addEventListener('click', () => {
            clearTimeout(timeoutId);
            hideToast();
        });
    };

    const populateModelSelect = () => {
        if (!el.settingModel) return;
        el.settingModel.innerHTML = '<option value="">ใช้ค่าเริ่มต้น</option>';
        MODEL_OPTIONS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            el.settingModel.appendChild(option);
        });
    };

    const renderPageSelector = () => {
        if (!el.pageSelector) return;
        const keyword = el.pageSearch && el.pageSearch.value ? el.pageSearch.value.trim().toLowerCase() : '';
        const filtered = state.pages.filter(page => {
            if (!keyword) return true;
            const name = String(page.name || '').toLowerCase();
            const platform = String(page.platform || '').toLowerCase();
            return name.includes(keyword) || platform.includes(keyword);
        });

        if (!filtered.length) {
            el.pageSelector.innerHTML = `
                <div class="followup-empty-state-small">
                    <div class="text-muted small">ไม่พบเพจ/บอทที่ตรงกับคำค้น</div>
                </div>
            `;
            return;
        }

        el.pageSelector.innerHTML = filtered.map(page => {
            const active = state.currentPage && page.id === state.currentPage.id;
            const icon = page.platform === 'facebook' ? 'fab fa-facebook' : 'fab fa-line';
            const cfg = page.settings || {};
            const autoOn = isAutoFollowUpEffectiveEnabled(cfg);
            const roundCount = Array.isArray(cfg.rounds) ? cfg.rounds.length : 0;
            return `
                <button class="followup-page-item ${active ? 'active' : ''}" data-page-id="${page.id}">
                    <span class="page-name">
                        <i class="${icon} page-icon"></i>
                        <span class="page-name-text">${escapeHtml(page.name)}</span>
                    </span>
                    <span class="page-badges">
                        ${roundCount > 0 ? `<span class="page-badge">${roundCount} รอบ</span>` : ''}
                        <span class="page-badge ${autoOn ? 'text-success' : ''}">${autoOn ? 'เปิด' : 'ปิด'}</span>
                    </span>
                </button>
            `;
        }).join('');

        el.pageSelector.querySelectorAll('button[data-page-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pageId = btn.getAttribute('data-page-id');
                if (!pageId) return;
                selectPage(pageId);
            });
        });
    };

    const updateEditorHeader = () => {
        if (!state.currentPage) {
            el.emptyMain.style.display = 'flex';
            el.editor.style.display = 'none';
            return;
        }
        el.emptyMain.style.display = 'none';
        el.editor.style.display = 'flex';

        if (el.editorPageName) el.editorPageName.textContent = state.currentPage.name || '—';
        if (el.editorPlatformBadge) {
            const platform = state.currentPage.platform === 'facebook' ? 'Facebook' : 'LINE';
            const badgeClass = state.currentPage.platform === 'facebook' ? 'bg-primary' : 'bg-success';
            el.editorPlatformBadge.className = `badge ${badgeClass}`;
            el.editorPlatformBadge.textContent = platform;
        }

        const cfg = state.currentContextConfig || state.currentPage.settings || {};
        const hardStop = isHardStopEnabled(cfg);
        const autoOn = isAutoFollowUpEffectiveEnabled(cfg);

        if (el.editorAutoBadge) {
            el.editorAutoBadge.textContent = hardStop ? 'หยุดชั่วคราว' : (autoOn ? 'ส่งอัตโนมัติ: เปิด' : 'ส่งอัตโนมัติ: ปิด');
            el.editorAutoBadge.classList.toggle('on', autoOn && !hardStop);
        }

        if (el.resetBtn) {
            el.resetBtn.disabled = !state.currentPage.hasOverride;
        }
    };

    const renderGeneralTab = () => {
        const cfg = state.currentContextConfig || state.currentPage?.settings || {};
        if (el.settingAutoSend) {
            el.settingAutoSend.checked = isAutoFollowUpEffectiveEnabled(cfg);
            const hardStop = isHardStopEnabled(cfg);
            if (hardStop) {
                el.settingAutoSend.checked = false;
                el.settingAutoSend.disabled = true;
            } else {
                el.settingAutoSend.disabled = false;
            }
        }
        if (el.emergencyStopGroup) {
            const hardStop = isHardStopEnabled(cfg);
            el.emergencyStopGroup.classList.toggle('d-none', !hardStop);
        }
        if (el.settingShowChat) el.settingShowChat.checked = cfg.showInChat !== false;
        if (el.settingShowDashboard) el.settingShowDashboard.checked = cfg.showInDashboard !== false;
        if (el.settingAnalysis) el.settingAnalysis.checked = cfg.analysisEnabled !== false;
        if (el.settingModel) el.settingModel.value = cfg.model || '';

        let promptText = '';
        if (typeof cfg.orderPromptInstructions === 'string' && cfg.orderPromptInstructions.trim()) {
            promptText = cfg.orderPromptInstructions;
        } else if (state.config.defaultOrderPromptInstructions) {
            promptText = state.config.defaultOrderPromptInstructions;
        }
        if (el.settingPrompt) el.settingPrompt.value = promptText;
    };

    const uploadRoundImages = async (roundIndex, files) => {
        if (!Array.isArray(files) || files.length === 0) return;
        if (!Array.isArray(state.editorRounds)) return;
        const round = state.editorRounds[roundIndex];
        if (!round) return;
        if (!Array.isArray(round.items)) round.items = [];

        round.isUploading = true;
        renderRounds();

        try {
            for (const file of files) {
                const formData = new FormData();
                formData.append('images', file);
                const response = await fetch('/admin/followup/assets', {
                    method: 'POST',
                    body: formData
                });
                let result;
                try {
                    result = await response.json();
                } catch (parseError) {
                    result = { success: false, error: 'อัพโหลดรูปภาพไม่สำเร็จ' };
                }
                if (!response.ok || !result.success) {
                    showAlert('danger', result.error || 'อัพโหลดรูปภาพไม่สำเร็จ');
                    continue;
                }
                const uploaded = Array.isArray(result.assets) ? result.assets : [];
                uploaded.forEach(asset => {
                    const cloned = cloneRoundImage({
                        url: asset.url,
                        previewUrl: asset.previewUrl || asset.thumbUrl || asset.url,
                        thumbUrl: asset.thumbUrl,
                        assetId: asset.assetId || asset.id,
                        id: asset.id,
                        width: asset.width,
                        height: asset.height,
                        size: asset.size,
                        fileName: asset.fileName
                    });
                    if (cloned) {
                        round.items.push({ type: 'image', ...cloned });
                    }
                });
            }
            await loadAssets();
        } catch (error) {
            console.error('upload follow-up images error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการอัพโหลดรูปภาพ');
        } finally {
            delete round.isUploading;
            renderRounds();
        }
    };

    const renderRounds = () => {
        if (!el.roundsContainer) return;
        if (!Array.isArray(state.editorRounds)) state.editorRounds = [];

        if (state.editorRounds.length === 0) {
            el.roundsContainer.innerHTML = `
                <div class="app-empty">
                    <div class="app-empty__desc">ยังไม่มีรอบการติดตาม กดปุ่ม "เพิ่มรอบ" เพื่อเริ่มต้น</div>
                </div>
            `;
            return;
        }

        const renderItem = (item, roundIndex, itemIndex, itemCount) => {
            const isFirst = itemIndex === 0;
            const isLast = itemIndex === itemCount - 1;
            const moveUpDisabled = isFirst ? 'disabled' : '';
            const moveDownDisabled = isLast ? 'disabled' : '';

            if (item.type === 'text') {
                const safeContent = escapeHtml(item.content || '');
                return `
                    <div class="followup-item-row" data-round="${roundIndex}" data-item="${itemIndex}">
                        <div class="followup-item-handle">
                            <button type="button" class="btn btn-xs btn-outline-secondary followup-item-up" data-round="${roundIndex}" data-item="${itemIndex}" title="เลื่อนขึ้น" ${moveUpDisabled}>
                                <i class="fas fa-chevron-up" style="font-size:0.65rem"></i>
                            </button>
                            <button type="button" class="btn btn-xs btn-outline-secondary followup-item-down" data-round="${roundIndex}" data-item="${itemIndex}" title="เลื่อนลง" ${moveDownDisabled}>
                                <i class="fas fa-chevron-down" style="font-size:0.65rem"></i>
                            </button>
                        </div>
                        <div class="followup-item-icon"><i class="fas fa-font"></i></div>
                        <div class="followup-item-body">
                            <textarea class="form-control form-control-sm followup-item-text" rows="2" placeholder="กรอกข้อความ" data-round="${roundIndex}" data-item="${itemIndex}">${safeContent}</textarea>
                        </div>
                        <div class="followup-item-actions">
                            <button type="button" class="btn btn-xs btn-outline-danger followup-item-remove" data-round="${roundIndex}" data-item="${itemIndex}" title="ลบรายการนี้">
                                <i class="fas fa-times" style="font-size:0.65rem"></i>
                            </button>
                        </div>
                    </div>
                `;
            }
            if (item.type === 'image') {
                const preview = escapeAttr(item.previewUrl || item.thumbUrl || item.url || '');
                const full = escapeAttr(item.url || '');
                const caption = escapeHtml(item.caption || item.alt || '');
                return `
                    <div class="followup-item-row align-items-center" data-round="${roundIndex}" data-item="${itemIndex}">
                        <div class="followup-item-handle">
                            <button type="button" class="btn btn-xs btn-outline-secondary followup-item-up" data-round="${roundIndex}" data-item="${itemIndex}" title="เลื่อนขึ้น" ${moveUpDisabled}>
                                <i class="fas fa-chevron-up" style="font-size:0.65rem"></i>
                            </button>
                            <button type="button" class="btn btn-xs btn-outline-secondary followup-item-down" data-round="${roundIndex}" data-item="${itemIndex}" title="เลื่อนลง" ${moveDownDisabled}>
                                <i class="fas fa-chevron-down" style="font-size:0.65rem"></i>
                            </button>
                        </div>
                        <div class="followup-item-icon"><i class="fas fa-image"></i></div>
                        <a href="${full}" target="_blank" rel="noopener" class="flex-shrink-0">
                            <img src="${preview}" alt="${caption || 'รูปภาพ'}" class="followup-item-thumb">
                        </a>
                        ${caption ? `<small class="text-muted flex-grow-1" style="font-size:0.8rem">${caption}</small>` : '<span class="flex-grow-1"></span>'}
                        <div class="followup-item-actions">
                            <button type="button" class="btn btn-xs btn-outline-danger followup-item-remove" data-round="${roundIndex}" data-item="${itemIndex}" title="ลบรูปนี้">
                                <i class="fas fa-times" style="font-size:0.65rem"></i>
                            </button>
                        </div>
                    </div>
                `;
            }
            return '';
        };

        el.roundsContainer.innerHTML = state.editorRounds.map((round, index) => {
            if (!round || typeof round !== 'object') {
                state.editorRounds[index] = { delayMinutes: 10, items: [{ type: 'text', content: '' }] };
            }
            if (!Array.isArray(state.editorRounds[index].items)) {
                state.editorRounds[index].items = roundLegacyToItems(state.editorRounds[index]);
            }
            const r = state.editorRounds[index];
            const delayValue = Number(r.delayMinutes);
            const uploading = r.isUploading
                ? '<div class="text-muted small mt-1"><i class="fas fa-spinner fa-spin me-1"></i>กำลังอัพโหลด...</div>'
                : '';
            const itemsHtml = r.items.length
                ? r.items.map((item, itemIndex) => renderItem(item, index, itemIndex, r.items.length)).join('')
                : '<div class="text-muted small mb-2">ยังไม่มีเนื้อหา — กดเพิ่มข้อความหรือรูปภาพด้านล่าง</div>';

            return `
                <div class="followup-round-card" data-index="${index}">
                    <div class="followup-round-header">
                        <span class="followup-round-index">${index + 1}</span>
                        <div class="followup-round-delay-group">
                            <span class="followup-round-label">หลังจากคุยล่าสุด</span>
                            <input type="number" class="form-control form-control-sm followup-round-delay" min="1" step="1" value="${Number.isFinite(delayValue) ? delayValue : ''}" placeholder="นาที">
                            <span class="followup-round-label">นาที</span>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger followup-round-remove followup-round-remove" title="ลบรอบนี้">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                    <div class="followup-round-items">
                        ${itemsHtml}
                    </div>
                    ${uploading}
                    <div class="followup-round-add-actions">
                        <button type="button" class="btn btn-sm btn-outline-secondary followup-round-add-text" data-index="${index}">
                            <i class="fas fa-font me-1"></i>เพิ่มข้อความ
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary followup-round-add-image" data-index="${index}" ${r.isUploading ? 'disabled' : ''}>
                            <i class="fas fa-image me-1"></i>เพิ่มรูปภาพ
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Delay input
        el.roundsContainer.querySelectorAll('.followup-round-delay').forEach(input => {
            const card = input.closest('.followup-round-card');
            if (!card) return;
            const index = Number(card.dataset.index);
            input.addEventListener('input', (event) => {
                const value = Number(event.target.value);
                state.editorRounds[index].delayMinutes = Number.isFinite(value) ? value : '';
            });
        });

        // Text item change
        el.roundsContainer.querySelectorAll('.followup-item-text').forEach(textarea => {
            textarea.addEventListener('input', (event) => {
                const rIdx = Number(event.target.dataset.round);
                const iIdx = Number(event.target.dataset.item);
                if (!Number.isFinite(rIdx) || !Number.isFinite(iIdx)) return;
                if (state.editorRounds[rIdx]?.items[iIdx]) {
                    state.editorRounds[rIdx].items[iIdx].content = event.target.value;
                }
            });
        });

        // Remove round
        el.roundsContainer.querySelectorAll('.followup-round-remove').forEach(btn => {
            const card = btn.closest('.followup-round-card');
            if (!card) return;
            const index = Number(card.dataset.index);
            btn.addEventListener('click', () => {
                state.editorRounds.splice(index, 1);
                renderRounds();
            });
        });

        // Remove item
        el.roundsContainer.querySelectorAll('.followup-item-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const rIdx = Number(btn.dataset.round);
                const iIdx = Number(btn.dataset.item);
                if (!Number.isFinite(rIdx) || !Number.isFinite(iIdx)) return;
                state.editorRounds[rIdx]?.items.splice(iIdx, 1);
                renderRounds();
            });
        });

        // Move item up
        el.roundsContainer.querySelectorAll('.followup-item-up').forEach(btn => {
            btn.addEventListener('click', () => {
                const rIdx = Number(btn.dataset.round);
                const iIdx = Number(btn.dataset.item);
                if (!Number.isFinite(rIdx) || !Number.isFinite(iIdx) || iIdx === 0) return;
                const items = state.editorRounds[rIdx]?.items;
                if (!items) return;
                [items[iIdx - 1], items[iIdx]] = [items[iIdx], items[iIdx - 1]];
                renderRounds();
            });
        });

        // Move item down
        el.roundsContainer.querySelectorAll('.followup-item-down').forEach(btn => {
            btn.addEventListener('click', () => {
                const rIdx = Number(btn.dataset.round);
                const iIdx = Number(btn.dataset.item);
                const items = state.editorRounds[rIdx]?.items;
                if (!items || !Number.isFinite(rIdx) || !Number.isFinite(iIdx) || iIdx >= items.length - 1) return;
                [items[iIdx], items[iIdx + 1]] = [items[iIdx + 1], items[iIdx]];
                renderRounds();
            });
        });

        // Add text item
        el.roundsContainer.querySelectorAll('.followup-round-add-text').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(index)) return;
                if (!Array.isArray(state.editorRounds[index]?.items)) return;
                state.editorRounds[index].items.push({ type: 'text', content: '' });
                renderRounds();
            });
        });

        // Add image item
        el.roundsContainer.querySelectorAll('.followup-round-add-image').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = Number(btn.getAttribute('data-index'));
                if (!Number.isFinite(index)) return;
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.multiple = true;
                input.addEventListener('change', (event) => {
                    const files = Array.from(event.target.files || []);
                    if (!files.length) return;
                    uploadRoundImages(index, files);
                });
                input.click();
            });
        });
    };

    const addRound = (round) => {
        if (!Array.isArray(state.editorRounds)) state.editorRounds = [];
        const fallbackDelay = state.editorRounds.length > 0
            ? Number(state.editorRounds[state.editorRounds.length - 1].delayMinutes) || 10
            : 10;

        let items;
        if (Array.isArray(round?.items)) {
            items = round.items.map(item => {
                if (item.type === 'text') return { type: 'text', content: item.content || '' };
                if (item.type === 'image') {
                    const cloned = cloneRoundImage(item);
                    return cloned ? { type: 'image', ...cloned } : null;
                }
                return null;
            }).filter(Boolean);
        } else {
            items = roundLegacyToItems(round || {});
        }
        if (!items.length) items = [{ type: 'text', content: '' }];

        state.editorRounds.push({
            delayMinutes: Number(round?.delayMinutes) || fallbackDelay,
            items
        });
        renderRounds();
    };

    const collectRoundsPayload = () => {
        if (!Array.isArray(state.editorRounds)) return [];
        return state.editorRounds
            .map(round => {
                const delay = Number(round?.delayMinutes);
                if (!Number.isFinite(delay) || delay < 1) return null;
                const items = sanitizeRoundItems(
                    Array.isArray(round?.items) ? round.items : roundLegacyToItems(round || {})
                );
                if (items.length === 0) return null;
                return { delayMinutes: Math.round(delay), items };
            })
            .filter(Boolean);
    };

    const renderAssets = () => {
        if (!el.imageLibraryGrid) return;
        if (!state.assets.length) {
            el.imageLibraryGrid.innerHTML = `
                <div class="app-empty" style="grid-column: 1 / -1;">
                    <div class="app-empty__desc">ยังไม่มีรูปภาพในระบบ</div>
                </div>
            `;
            return;
        }
        el.imageLibraryGrid.innerHTML = state.assets.map(asset => {
            const preview = escapeAttr(asset.thumbUrl || asset.previewUrl || asset.url || '');
            const full = escapeAttr(asset.url || '');
            const name = escapeHtml(asset.fileName || 'รูปภาพ');
            return `
                <div class="followup-image-card" data-asset-id="${escapeAttr(asset.id || asset.assetId || '')}">
                    <a href="${full}" target="_blank" rel="noopener">
                        <img src="${preview}" alt="${name}" loading="lazy">
                    </a>
                    <div class="image-meta">
                        <span class="image-name" title="${name}">${name}</span>
                        <button type="button" class="image-action" data-action="copy-url" data-url="${full}" title="คัดลอก URL">
                            <i class="fas fa-link"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        el.imageLibraryGrid.querySelectorAll('[data-action="copy-url"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const url = btn.getAttribute('data-url');
                if (!url) return;
                try {
                    await navigator.clipboard.writeText(url);
                    showAlert('success', 'คัดลอก URL แล้ว');
                } catch (e) {
                    showAlert('info', url);
                }
            });
        });
    };

    const loadAssets = async () => {
        try {
            const response = await fetch('/admin/followup/assets');
            const data = await response.json();
            if (data.success) {
                state.assets = Array.isArray(data.assets) ? data.assets : [];
                renderAssets();
            }
        } catch (error) {
            console.error('load assets error', error);
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
                updateEditorHeader();
                return;
            }
            const fallback = state.pages.find(p => p.id === previousId)
                || state.pages[0];
            selectPage(fallback.id);
        } catch (error) {
            console.error('load follow-up pages error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการดึงข้อมูลเพจ');
        }
    };

    const selectPage = (pageId) => {
        const page = state.pages.find(p => p.id === pageId);
        if (!page) return;
        state.currentPage = page;
        state.currentContextConfig = page.settings || null;
        state.editorRounds = [];
        state.activeTab = 'general';
        switchTab('general');
        renderPageSelector();
        updateEditorHeader();
        renderGeneralTab();

        const cfg = state.currentContextConfig || {};
        if (Array.isArray(cfg.rounds)) {
            state.editorRounds = cfg.rounds.map(round => {
                let items;
                if (Array.isArray(round.items)) {
                    items = round.items.map(item => {
                        if (item.type === 'text') return { type: 'text', content: item.content || '' };
                        if (item.type === 'image') {
                            const cloned = cloneRoundImage(item);
                            return cloned ? { type: 'image', ...cloned } : null;
                        }
                        return null;
                    }).filter(Boolean);
                } else {
                    items = roundLegacyToItems(round);
                }
                return {
                    delayMinutes: Number(round.delayMinutes) || '',
                    items
                };
            });
        }
        renderRounds();
        loadAssets();
    };

    const switchTab = (tabName) => {
        state.activeTab = tabName;
        el.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        el.tabContents.forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tabName);
        });
    };

    const saveSettings = async () => {
        if (!state.currentPage) return;
        const payload = {
            platform: state.currentPage.platform,
            botId: state.currentPage.botId,
            settings: {
                analysisEnabled: el.settingAnalysis ? el.settingAnalysis.checked : true,
                autoFollowUpEnabled: el.settingAutoSend ? el.settingAutoSend.checked : false,
                showInChat: el.settingShowChat ? el.settingShowChat.checked : true,
                showInDashboard: el.settingShowDashboard ? el.settingShowDashboard.checked : true,
                rounds: collectRoundsPayload()
            }
        };
        if (el.settingModel && el.settingModel.value) {
            payload.settings.model = el.settingModel.value;
        }
        if (el.settingPrompt && typeof el.settingPrompt.value === 'string') {
            payload.settings.orderPromptInstructions = el.settingPrompt.value.trim();
        }

        try {
            el.saveBtn.disabled = true;
            const response = await fetch('/admin/followup/page-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.success) {
                showAlert('success', 'บันทึกการตั้งค่าเพจเรียบร้อยแล้ว');
                await loadPages();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
            }
        } catch (error) {
            console.error('save follow-up page settings error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
        } finally {
            el.saveBtn.disabled = false;
        }
    };

    const resetSettings = async () => {
        if (!state.currentPage) return;
        if (!confirm('ต้องการคืนค่าเริ่มต้นสำหรับเพจนี้หรือไม่?')) return;
        try {
            el.resetBtn.disabled = true;
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
                await loadPages();
            } else {
                showAlert('danger', data.error || 'ไม่สามารถคืนค่าเริ่มต้นได้');
            }
        } catch (error) {
            console.error('reset follow-up page settings error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการคืนค่าเริ่มต้น');
        } finally {
            el.resetBtn.disabled = false;
        }
    };

    const handleImageUpload = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.addEventListener('change', async (event) => {
            const files = Array.from(event.target.files || []);
            if (!files.length) return;
            try {
                el.btnUploadImage.disabled = true;
                for (const file of files) {
                    const formData = new FormData();
                    formData.append('images', file);
                    const response = await fetch('/admin/followup/assets', {
                        method: 'POST',
                        body: formData
                    });
                    let result;
                    try {
                        result = await response.json();
                    } catch (parseError) {
                        result = { success: false, error: 'อัพโหลดรูปภาพไม่สำเร็จ' };
                    }
                    if (!response.ok || !result.success) {
                        showAlert('danger', result.error || 'อัพโหลดรูปภาพไม่สำเร็จ');
                        continue;
                    }
                }
                showAlert('success', 'อัปโหลดรูปภาพเสร็จสิ้น');
                await loadAssets();
            } catch (error) {
                console.error('upload image error', error);
                showAlert('danger', 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
            } finally {
                el.btnUploadImage.disabled = false;
            }
        });
        input.click();
    };

    const setupEventListeners = () => {
        if (el.pageSearch) {
            el.pageSearch.addEventListener('input', () => {
                renderPageSelector();
            });
        }

        el.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.tab);
            });
        });

        if (el.saveBtn) {
            el.saveBtn.addEventListener('click', saveSettings);
        }

        if (el.resetBtn) {
            el.resetBtn.addEventListener('click', resetSettings);
        }

        if (el.btnAddRound) {
            el.btnAddRound.addEventListener('click', () => {
                addRound({ delayMinutes: 10 });
            });
        }

        if (el.btnUploadImage) {
            el.btnUploadImage.addEventListener('click', handleImageUpload);
        }
    };

    const init = async () => {
        populateModelSelect();
        setupEventListeners();
        await loadPages();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
