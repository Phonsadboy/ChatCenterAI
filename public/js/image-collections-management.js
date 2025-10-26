// Image Collections & Bot Assignment Management
(function () {
    const state = {
        collections: [],
        assets: [],
        lineBots: [],
        facebookBots: [],
        collectionFilter: '',
        assetFilter: '',
        botCollectionFilter: '',
        editingCollectionId: null,
        editingBot: null
    };

    const elements = {
        section: null,
        collectionsList: null,
        collectionsCount: null,
        collectionsSearch: null,
        addCollectionBtn: null,
        refreshCollectionsBtn: null,
        assetsManagerBtn: null,
        lineAssignments: null,
        facebookAssignments: null,
        collectionModal: null,
        collectionForm: null,
        collectionId: null,
        collectionName: null,
        collectionDescription: null,
        collectionAssetSearch: null,
        collectionAssetList: null,
        collectionAssetCount: null,
        saveCollectionBtn: null,
        deleteCollectionBtn: null,
        botModal: null,
        botModalLabel: null,
        botModalSummary: null,
        botCollectionsSearch: null,
        botCollectionsList: null,
        saveBotCollectionsBtn: null
    };

    const formatTimestamp = (value) => {
        if (!value) return '-';
        try {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '-';
            return date.toLocaleString('th-TH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (err) {
            console.warn('Invalid date value', value, err);
            return '-';
        }
    };

    const getCollectionById = (id) => state.collections.find((item) => item._id === id);

    const getCollectionName = (id) => {
        const collection = getCollectionById(id);
        return collection ? collection.name : id;
    };

    const computeCollectionUsage = (collectionId) => {
        const isUsedByLine = state.lineBots.filter((bot) =>
            Array.isArray(bot.selectedImageCollections) &&
            bot.selectedImageCollections.includes(collectionId)
        ).length;
        const isUsedByFacebook = state.facebookBots.filter((bot) =>
            Array.isArray(bot.selectedImageCollections) &&
            bot.selectedImageCollections.includes(collectionId)
        ).length;
        return { line: isUsedByLine, facebook: isUsedByFacebook };
    };

    const cacheElements = () => {
        elements.section = document.getElementById('imageCollectionsSection');
        if (!elements.section) return;
        elements.collectionsList = document.getElementById('imageCollectionsList');
        elements.collectionsCount = document.getElementById('imageCollectionsCount');
        elements.collectionsSearch = document.getElementById('imageCollectionsSearch');
        elements.addCollectionBtn = document.getElementById('createImageCollectionBtn');
        elements.refreshCollectionsBtn = document.getElementById('refreshImageCollectionsBtn');
        elements.assetsManagerBtn = document.getElementById('openAssetsManagerBtn');
        elements.lineAssignments = document.getElementById('lineBotCollectionsList');
        elements.facebookAssignments = document.getElementById('facebookBotCollectionsList');
        elements.collectionModal = document.getElementById('imageCollectionModal');
        elements.collectionForm = document.getElementById('imageCollectionForm');
        elements.collectionId = document.getElementById('imageCollectionId');
        elements.collectionName = document.getElementById('imageCollectionName');
        elements.collectionDescription = document.getElementById('imageCollectionDescription');
        elements.collectionAssetSearch = document.getElementById('imageCollectionAssetSearch');
        elements.collectionAssetList = document.getElementById('imageCollectionAssetList');
        elements.collectionAssetCount = document.getElementById('collectionAssetCount');
        elements.saveCollectionBtn = document.getElementById('saveImageCollectionBtn');
        elements.deleteCollectionBtn = document.getElementById('deleteImageCollectionBtn');
        elements.botModal = document.getElementById('botImageCollectionsModal');
        elements.botModalLabel = document.getElementById('botImageCollectionsModalLabel');
        elements.botModalSummary = document.getElementById('botImageCollectionsSummary');
        elements.botCollectionsSearch = document.getElementById('botCollectionsSearch');
        elements.botCollectionsList = document.getElementById('botImageCollectionsList');
        elements.saveBotCollectionsBtn = document.getElementById('saveBotImageCollectionsBtn');
    };

    const bindEvents = () => {
        if (!elements.section) return;

        if (elements.addCollectionBtn) {
            elements.addCollectionBtn.addEventListener('click', () => openCollectionModal());
        }

        if (elements.refreshCollectionsBtn) {
            elements.refreshCollectionsBtn.addEventListener('click', refreshAll);
        }

        if (elements.assetsManagerBtn) {
            elements.assetsManagerBtn.addEventListener('click', () => {
                const modalEl = document.getElementById('instructionsModal');
                if (modalEl) {
                    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
                    modalInstance.show();
                } else {
                    showAlert('ไม่พบหน้าจอจัดการรูปภาพหลัก', 'warning');
                }
            });
        }

        if (elements.collectionsSearch) {
            elements.collectionsSearch.addEventListener('input', (event) => {
                state.collectionFilter = event.target.value.trim().toLowerCase();
                renderCollectionsList();
            });
        }

        if (elements.collectionsList) {
            elements.collectionsList.addEventListener('click', handleCollectionAction);
        }

        if (elements.collectionAssetSearch) {
            elements.collectionAssetSearch.addEventListener('input', (event) => {
                state.assetFilter = event.target.value.trim().toLowerCase();
                renderCollectionAssetList();
            });
        }

        if (elements.saveCollectionBtn) {
            elements.saveCollectionBtn.addEventListener('click', saveImageCollection);
        }

        if (elements.deleteCollectionBtn) {
            elements.deleteCollectionBtn.addEventListener('click', deleteImageCollection);
        }

        if (elements.lineAssignments) {
            elements.lineAssignments.addEventListener('click', handleAssignmentAction);
        }

        if (elements.facebookAssignments) {
            elements.facebookAssignments.addEventListener('click', handleAssignmentAction);
        }

        if (elements.botCollectionsSearch) {
            elements.botCollectionsSearch.addEventListener('input', (event) => {
                state.botCollectionFilter = event.target.value.trim().toLowerCase();
                renderBotCollectionsChecklist();
            });
        }

        if (elements.saveBotCollectionsBtn) {
            elements.saveBotCollectionsBtn.addEventListener('click', saveBotImageCollections);
        }
    };

    const init = () => {
        cacheElements();
        if (!elements.section) return;
        bindEvents();
        refreshAll();
    };

    const showAlert = (message, type = 'info') => {
        if (window.adminSettings?.showAlert) {
            window.adminSettings.showAlert(message, type);
        } else {
            alert(message);
        }
    };

    const refreshAll = async () => {
        try {
            await Promise.all([
                fetchCollections(),
                fetchAssets(),
                fetchBots()
            ]);
            renderCollectionsList();
            renderAssignments();
        } catch (err) {
            console.error('refreshAll error:', err);
            showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูลคลังรูปภาพ', 'danger');
        }
    };

    const fetchCollections = async () => {
        try {
            if (!elements.collectionsList) return;
            elements.collectionsList.innerHTML = '<div class="text-muted small">กำลังโหลดรายการคลังรูปภาพ...</div>';
            const response = await fetch('/api/image-collections');
            if (!response.ok) throw new Error('ไม่สามารถดึงรายการคลังรูปภาพได้');
            const data = await response.json();
            state.collections = Array.isArray(data.collections) ? data.collections : [];
            updateCollectionsCount();
        } catch (err) {
            console.error('fetchCollections error:', err);
            showAlert('โหลดข้อมูลคลังรูปภาพไม่สำเร็จ', 'danger');
        }
    };

    const fetchAssets = async () => {
        try {
            const response = await fetch('/admin/instructions/assets');
            if (!response.ok) throw new Error('ไม่สามารถดึงรายการรูปภาพได้');
            const data = await response.json();
            state.assets = Array.isArray(data.assets) ? data.assets : [];
        } catch (err) {
            console.error('fetchAssets error:', err);
            showAlert('โหลดรายการรูปภาพไม่สำเร็จ', 'danger');
        }
    };

    const fetchBots = async () => {
        try {
            const [lineRes, fbRes] = await Promise.all([
                fetch('/api/line-bots'),
                fetch('/api/facebook-bots')
            ]);
            if (!lineRes.ok) throw new Error('ไม่สามารถดึงข้อมูล Line Bot ได้');
            if (!fbRes.ok) throw new Error('ไม่สามารถดึงข้อมูล Facebook Bot ได้');
            state.lineBots = await lineRes.json();
            state.facebookBots = await fbRes.json();
        } catch (err) {
            console.error('fetchBots error:', err);
            showAlert('โหลดข้อมูลบอทไม่สำเร็จ', 'danger');
        }
    };

    const updateCollectionsCount = () => {
        if (!elements.collectionsCount) return;
        const total = state.collections.length;
        elements.collectionsCount.textContent = `${total} ชุด`;
    };

    const handleCollectionAction = (event) => {
        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn) return;
        const action = actionBtn.dataset.action;
        const collectionId = actionBtn.dataset.collectionId;
        if (!collectionId) return;

        if (action === 'edit') {
            openCollectionModal(collectionId);
        } else if (action === 'delete') {
            openCollectionModal(collectionId, { openDelete: true });
        } else if (action === 'view') {
            openCollectionModal(collectionId);
        }
    };

    const handleAssignmentAction = (event) => {
        const actionBtn = event.target.closest('[data-action="edit-bot"]');
        if (!actionBtn) return;
        const botType = actionBtn.dataset.botType;
        const botId = actionBtn.dataset.botId;
        if (!botType || !botId) return;
        openBotImageCollectionsModal(botType, botId);
    };

    const renderCollectionsList = () => {
        if (!elements.collectionsList) return;
        if (!Array.isArray(state.collections) || state.collections.length === 0) {
            elements.collectionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images mb-2"></i>
                    <div>ยังไม่มีคลังรูปภาพ</div>
                    <small class="text-muted">สร้างคลังเพื่อนำรูปไปใช้ตอบลูกค้าได้อย่างแม่นยำ</small>
                </div>
            `;
            return;
        }

        const filter = state.collectionFilter;
        const filtered = filter
            ? state.collections.filter((collection) => {
                const name = (collection.name || '').toLowerCase();
                const description = (collection.description || '').toLowerCase();
                return name.includes(filter) || description.includes(filter);
            })
            : state.collections;

        if (filtered.length === 0) {
            elements.collectionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search mb-2"></i>
                    <div>ไม่พบคลังรูปภาพที่ตรงกับคำค้น</div>
                </div>
            `;
            return;
        }

        const html = filtered
            .map((collection) => {
                const imagesCount = Array.isArray(collection.images) ? collection.images.length : 0;
                const usage = computeCollectionUsage(collection._id);
                const isDefault = !!collection.isDefault;
                const description = collection.description ? collection.description : 'ไม่มีคำอธิบาย';
                const updatedText = formatTimestamp(collection.updatedAt || collection.createdAt);
                const badge = isDefault ? '<span class="badge bg-success-soft text-success ms-2">ค่าเริ่มต้น</span>' : '';
                const usageBadges = `
                    <span class="collection-stat badge bg-light text-dark"><i class="fab fa-line me-1 text-success"></i>${usage.line}</span>
                    <span class="collection-stat badge bg-light text-dark"><i class="fab fa-facebook-f me-1 text-primary"></i>${usage.facebook}</span>
                `;
                const previewImages = Array.isArray(collection.images) ? collection.images.slice(0, 3) : [];
                const previewHtml = previewImages
                    .map((img) => {
                        const src = img.thumbUrl || img.url || '';
                        const alt = img.label || 'preview';
                        if (!src) return '';
                        return `<div class="collection-preview-thumb" title="${alt}"><img src="${src}" alt="${alt}"></div>`;
                    })
                    .join('');
                const remaining = imagesCount - previewImages.length;
                const morePreview = remaining > 0 ? `<div class="collection-preview-thumb more">+${remaining}</div>` : '';

                return `
                    <div class="image-collection-card" data-collection-id="${collection._id}">
                        <div class="collection-header">
                            <div>
                                <div class="collection-title">
                                    <strong>${collection.name || collection._id}</strong>
                                    ${badge}
                                </div>
                                <div class="text-muted small">${description}</div>
                            </div>
                            <div class="collection-actions">
                                <button class="btn btn-sm btn-outline-primary" data-action="edit" data-collection-id="${collection._id}">
                                    <i class="fas fa-edit me-1"></i>แก้ไข
                                </button>
                                <button class="btn btn-sm btn-outline-danger" data-action="delete" data-collection-id="${collection._id}" ${isDefault ? 'disabled' : ''}>
                                    <i class="fas fa-trash me-1"></i>ลบ
                                </button>
                            </div>
                        </div>
                        <div class="collection-preview">
                            ${previewHtml || '<div class="text-muted small">ยังไม่มีรูปในคลังนี้</div>'}
                            ${morePreview}
                        </div>
                        <div class="collection-meta">
                            <span class="badge bg-secondary-soft text-secondary"><i class="fas fa-image me-1"></i>${imagesCount} รูป</span>
                            ${usageBadges}
                            <span class="text-muted small ms-auto">อัปเดต: ${updatedText}</span>
                        </div>
                    </div>
                `;
            })
            .join('');

        elements.collectionsList.innerHTML = html;
    };

    const openCollectionModal = (collectionId = null, options = {}) => {
        if (!elements.collectionModal || !elements.collectionForm) return;
        state.editingCollectionId = collectionId;
        state.assetFilter = '';
        if (elements.collectionAssetSearch) {
            elements.collectionAssetSearch.value = '';
        }

        const modalLabel = document.getElementById('imageCollectionModalLabel');
        if (collectionId) {
            const collection = getCollectionById(collectionId);
            if (!collection) {
                showAlert('ไม่พบข้อมูลคลังรูปภาพ', 'warning');
                return;
            }
            if (modalLabel) {
                modalLabel.innerHTML = `<i class="fas fa-images me-2"></i>แก้ไขคลังรูปภาพ: ${collection.name}`;
            }
            elements.collectionId.value = collection._id;
            elements.collectionName.value = collection.name || '';
            elements.collectionDescription.value = collection.description || '';
            elements.deleteCollectionBtn.style.display = collection.isDefault ? 'none' : 'inline-flex';
        } else {
            state.editingCollectionId = null;
            elements.collectionId.value = '';
            elements.collectionForm.reset();
            if (modalLabel) {
                modalLabel.innerHTML = '<i class="fas fa-images me-2"></i>สร้างคลังรูปภาพใหม่';
            }
            elements.deleteCollectionBtn.style.display = 'none';
        }

        renderCollectionAssetList();

        const modalInstance = bootstrap.Modal.getOrCreateInstance(elements.collectionModal);
        modalInstance.show();

        if (options.openDelete && state.editingCollectionId && !getCollectionById(state.editingCollectionId)?.isDefault) {
            deleteImageCollection();
        }
    };

    const renderCollectionAssetList = () => {
        if (!elements.collectionAssetList) return;
        const selectedLabels = new Set();
        if (state.editingCollectionId) {
            const collection = getCollectionById(state.editingCollectionId);
            if (collection && Array.isArray(collection.images)) {
                collection.images.forEach((img) => {
                    if (img?.label) selectedLabels.add(img.label);
                });
            }
        }

        const filter = state.assetFilter;
        const filteredAssets = filter
            ? state.assets.filter((asset) => {
                const label = (asset.label || '').toLowerCase();
                const desc = (asset.description || asset.alt || '').toLowerCase();
                return label.includes(filter) || desc.includes(filter);
            })
            : state.assets;

        if (!filteredAssets || filteredAssets.length === 0) {
            elements.collectionAssetList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-image mb-2"></i>
                    <div>ยังไม่มีรูปภาพในระบบ</div>
                    <small class="text-muted">อัปโหลดได้จากส่วนคำสั่ง & โทเคนรูปภาพ</small>
                </div>
            `;
            if (elements.collectionAssetCount) {
                elements.collectionAssetCount.textContent = '0 รูป';
            }
            return;
        }

        const html = filteredAssets
            .map((asset, index) => {
                const id = `collection-asset-${index}`;
                const checked = selectedLabels.has(asset.label) ? 'checked' : '';
                const thumb = asset.thumbUrl || asset.url || '';
                const description = asset.description || asset.alt || '';
                return `
                    <label class="collection-asset-item" for="${id}">
                        <input type="checkbox" class="form-check-input" id="${id}" value="${asset.label}" ${checked}>
                        <span class="collection-asset-thumb">
                            <img src="${thumb}" alt="${asset.label}">
                        </span>
                        <span class="collection-asset-info">
                            <strong>${asset.label}</strong>
                            <small class="text-muted">${description || 'ไม่มีคำอธิบาย'}</small>
                        </span>
                    </label>
                `;
            })
            .join('');

        elements.collectionAssetList.innerHTML = html;
        if (elements.collectionAssetCount) {
            elements.collectionAssetCount.textContent = `${filteredAssets.length} รูป`;
        }
    };

    const saveImageCollection = async () => {
        if (!elements.collectionForm) return;
        if (!elements.collectionName?.value.trim()) {
            showAlert('กรุณาระบุชื่อคลังรูปภาพ', 'warning');
            elements.collectionName?.focus();
            return;
        }
        const labels = Array.from(
            elements.collectionAssetList?.querySelectorAll('input[type="checkbox"]:checked') || []
        ).map((input) => input.value);

        const payload = {
            name: elements.collectionName.value.trim(),
            description: elements.collectionDescription.value.trim(),
            imageLabels: labels
        };

        const collectionId = state.editingCollectionId;
        const method = collectionId ? 'PUT' : 'POST';
        const url = collectionId ? `/admin/image-collections/${collectionId}` : '/admin/image-collections';

        try {
            elements.saveCollectionBtn.disabled = true;
            elements.saveCollectionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังบันทึก';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถบันทึกคลังรูปภาพได้');
            }

            showAlert(data.message || 'บันทึกคลังรูปภาพเรียบร้อยแล้ว', 'success');

            const modalInstance = bootstrap.Modal.getInstance(elements.collectionModal);
            if (modalInstance) modalInstance.hide();

            await fetchCollections();
            renderCollectionsList();
            await fetchBots();
            renderAssignments();
        } catch (err) {
            console.error('saveImageCollection error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการบันทึกคลังรูปภาพ', 'danger');
        } finally {
            elements.saveCollectionBtn.disabled = false;
            elements.saveCollectionBtn.innerHTML = '<i class="fas fa-save me-1"></i>บันทึก';
        }
    };

    const deleteImageCollection = async () => {
        const collectionId = state.editingCollectionId;
        if (!collectionId) return;
        const collection = getCollectionById(collectionId);
        if (!collection) {
            showAlert('ไม่พบคลังรูปภาพที่ต้องการลบ', 'warning');
            return;
        }
        if (collection.isDefault) {
            showAlert('ไม่สามารถลบคลังรูปภาพเริ่มต้นของระบบได้', 'warning');
            return;
        }
        if (!confirm(`ยืนยันการลบคลังรูปภาพ "${collection.name}"?`)) {
            return;
        }
        try {
            elements.deleteCollectionBtn.disabled = true;
            const response = await fetch(`/admin/image-collections/${collectionId}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถลบคลังรูปภาพได้');
            }
            showAlert(data.message || 'ลบคลังรูปภาพเรียบร้อยแล้ว', 'success');
            const modalInstance = bootstrap.Modal.getInstance(elements.collectionModal);
            if (modalInstance) modalInstance.hide();
            await fetchCollections();
            renderCollectionsList();
            await fetchBots();
            renderAssignments();
        } catch (err) {
            console.error('deleteImageCollection error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการลบคลังรูปภาพ', 'danger');
        } finally {
            elements.deleteCollectionBtn.disabled = false;
        }
    };

    const renderAssignments = () => {
        renderBotAssignments('line', elements.lineAssignments, state.lineBots);
        renderBotAssignments('facebook', elements.facebookAssignments, state.facebookBots);
    };

    const renderBotAssignments = (type, container, bots) => {
        if (!container) return;
        if (!Array.isArray(bots) || bots.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-robot mb-2"></i>
                    <div>ยังไม่มี ${type === 'line' ? 'LINE Bot' : 'Facebook Bot'}</div>
                    <small class="text-muted">เพิ่มบอทก่อนเพื่อกำหนดคลังรูปภาพ</small>
                </div>
            `;
            return;
        }

        const html = bots
            .map((bot) => {
                const selected = Array.isArray(bot.selectedImageCollections)
                    ? bot.selectedImageCollections
                    : [];
                const count = selected.length;
                const collectionsDisplay = count > 0
                    ? selected.slice(0, 3).map((id) => `<span class="collection-pill">${getCollectionName(id)}</span>`).join('')
                    : '<span class="collection-pill default">ทุกภาพ</span>';
                const remaining = count > 3 ? `<span class="collection-pill more">+${count - 3}</span>` : '';
                const description = bot.description ? `<div class="text-muted small">${bot.description}</div>` : '';
                return `
                    <div class="assignment-item">
                        <div class="assignment-info">
                            <div class="assignment-name">
                                <strong>${bot.name || 'ไม่ระบุชื่อ'}</strong>
                                ${description}
                                <div class="assignment-collections">
                                    ${collectionsDisplay}${remaining}
                                </div>
                                <div class="text-muted small">ใช้ ${count > 0 ? `${count} ชุด` : 'ทุกภาพในระบบ'}</div>
                            </div>
                        </div>
                        <div class="assignment-action">
                            <button class="btn btn-sm btn-outline-primary" data-action="edit-bot" data-bot-type="${type}" data-bot-id="${bot._id}">
                                <i class="fas fa-layer-group me-1"></i>เลือกแกลเลอรี
                            </button>
                        </div>
                    </div>
                `;
            })
            .join('');

        container.innerHTML = html;
    };

    const openBotImageCollectionsModal = (botType, botId) => {
        if (!elements.botModal) return;
        const list = botType === 'line' ? state.lineBots : state.facebookBots;
        const bot = list.find((item) => item._id === botId);
        if (!bot) {
            showAlert('ไม่พบบอทที่เลือก', 'warning');
            return;
        }
        state.editingBot = { botType, botId };
        state.botCollectionFilter = '';
        if (elements.botCollectionsSearch) {
            elements.botCollectionsSearch.value = '';
        }

        if (elements.botModalLabel) {
            const platformIcon = botType === 'line'
                ? '<span class="assignment-icon line me-2"><i class="fab fa-line"></i></span>'
                : '<span class="assignment-icon facebook me-2"><i class="fab fa-facebook-f"></i></span>';
            elements.botModalLabel.innerHTML = `${platformIcon}เลือกคลังรูปภาพสำหรับ ${bot.name || 'ไม่ระบุชื่อ'}`;
        }

        if (elements.botModalSummary) {
            const platformText = botType === 'line' ? 'LINE Bot' : 'Facebook Bot';
            const selected = Array.isArray(bot.selectedImageCollections)
                ? bot.selectedImageCollections.length
                : 0;
            elements.botModalSummary.innerHTML = `
                <div><strong>${platformText}:</strong> ${bot.name || bot._id}</div>
                <div class="text-muted small">กำลังใช้งานอยู่: ${selected > 0 ? `${selected} ชุด` : 'ทุกภาพในระบบ'}</div>
            `;
        }

        renderBotCollectionsChecklist();

        const modalInstance = bootstrap.Modal.getOrCreateInstance(elements.botModal);
        modalInstance.show();
    };

    const renderBotCollectionsChecklist = () => {
        if (!elements.botCollectionsList) return;
        const filter = state.botCollectionFilter;
        const source = filter
            ? state.collections.filter((collection) => {
                const name = (collection.name || '').toLowerCase();
                const description = (collection.description || '').toLowerCase();
                return name.includes(filter) || description.includes(filter);
            })
            : state.collections;

        const currentSelections = new Set();
        if (state.editingBot) {
            const list = state.editingBot.botType === 'line' ? state.lineBots : state.facebookBots;
            const bot = list.find((item) => item._id === state.editingBot.botId);
            if (bot && Array.isArray(bot.selectedImageCollections)) {
                bot.selectedImageCollections.forEach((id) => currentSelections.add(id));
            }
        }

        if (!Array.isArray(source) || source.length === 0) {
            elements.botCollectionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images mb-2"></i>
                    <div>ยังไม่มีคลังรูปภาพ</div>
                    <small class="text-muted">สร้างคลังรูปภาพก่อนเพื่อเลือกให้บอทใช้งาน</small>
                </div>
            `;
            elements.saveBotCollectionsBtn.disabled = true;
            return;
        }

        elements.saveBotCollectionsBtn.disabled = false;

        const html = source
            .map((collection, index) => {
                const id = `bot-collection-${index}`;
                const checked = currentSelections.has(collection._id) ? 'checked' : '';
                const imagesCount = Array.isArray(collection.images) ? collection.images.length : 0;
                const badge = collection.isDefault ? '<span class="badge bg-success-soft text-success ms-2">ค่าเริ่มต้น</span>' : '';
                return `
                    <label class="collection-select-item" for="${id}">
                        <input type="checkbox" class="form-check-input" id="${id}" value="${collection._id}" ${checked}>
                        <div class="collection-select-info">
                            <div>
                                <strong>${collection.name}</strong>
                                ${badge}
                            </div>
                            <small class="text-muted">${collection.description || 'ไม่มีคำอธิบาย'}</small>
                        </div>
                        <span class="badge bg-light text-dark"><i class="fas fa-image me-1"></i>${imagesCount}</span>
                    </label>
                `;
            })
            .join('');

        elements.botCollectionsList.innerHTML = html;
    };

    const saveBotImageCollections = async () => {
        if (!state.editingBot) return;
        const { botType, botId } = state.editingBot;
        const selected = Array.from(
            elements.botCollectionsList?.querySelectorAll('input[type="checkbox"]:checked') || []
        ).map((input) => input.value);

        const payload = { selectedImageCollections: selected };
        const url =
            botType === 'line'
                ? `/api/line-bots/${botId}/image-collections`
                : `/api/facebook-bots/${botId}/image-collections`;

        try {
            elements.saveBotCollectionsBtn.disabled = true;
            elements.saveBotCollectionsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังบันทึก';

            const response = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'ไม่สามารถบันทึกการเลือกคลังรูปภาพได้');
            }

            showAlert(data.message || 'อัปเดตคลังรูปภาพที่ใช้กับบอทเรียบร้อยแล้ว', 'success');

            const modalInstance = bootstrap.Modal.getInstance(elements.botModal);
            if (modalInstance) modalInstance.hide();

            await fetchBots();
            renderAssignments();

            if (typeof loadLineBotSettings === 'function') {
                loadLineBotSettings();
            }
            if (typeof loadFacebookBotSettings === 'function') {
                loadFacebookBotSettings();
            }
        } catch (err) {
            console.error('saveBotImageCollections error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการอัปเดตคลังรูปภาพของบอท', 'danger');
        } finally {
            elements.saveBotCollectionsBtn.disabled = false;
            elements.saveBotCollectionsBtn.innerHTML = '<i class="fas fa-save me-1"></i>บันทึกการเลือก';
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.imageCollectionsManager = {
        refreshAll,
        openCollectionModal,
        openBotImageCollectionsModal
    };
})();
