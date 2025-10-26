// Image Collections & Bot Assignment Management
(function () {
    const state = {
        collections: [],
        assets: [],
        lineBots: [],
        facebookBots: [],
        collectionFilter: '',
        assetFilter: '',
        collectionAssetFilter: '',
        botCollectionFilter: '',
        editingCollectionId: null,
        editingBot: null,
        collectionUsageFilter: 'all'
    };

    const elements = {
        section: null,
        collectionsList: null,
        collectionsCount: null,
        collectionsSearch: null,
        collectionFilterButtons: null,
        addCollectionBtn: null,
        refreshCollectionsBtn: null,
        assetsManagerBtn: null,
        copyTestMessageBtn: null,
        assetsCount: null,
        assetsSearch: null,
        assetsList: null,
        assetUploadForm: null,
        assetFile: null,
        assetLabel: null,
        assetDescription: null,
        assetOverwrite: null,
        assetUploadBtn: null,
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

    const escapeHtml = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const escapeAttribute = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    const formatFileSize = (bytes) => {
        const size = Number(bytes);
        if (!Number.isFinite(size) || size <= 0) return '-';
        const kb = size / 1024;
        if (kb < 1024) {
            return `${kb.toFixed(1)} KB`;
        }
        const mb = kb / 1024;
        return `${mb.toFixed(1)} MB`;
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
        elements.collectionFilterButtons = document.querySelectorAll('[data-usage-filter]');
        elements.addCollectionBtn = document.getElementById('createImageCollectionBtn');
        elements.refreshCollectionsBtn = document.getElementById('refreshImageCollectionsBtn');
        elements.assetsManagerBtn = document.getElementById('openAssetsManagerBtn');
        elements.copyTestMessageBtn = document.getElementById('copyImageTestMessageBtn');
        elements.assetsCount = document.getElementById('imageAssetsCount');
        elements.assetsSearch = document.getElementById('imageAssetsSearch');
        elements.assetsList = document.getElementById('imageAssetsList');
        elements.assetUploadForm = document.getElementById('imageAssetUploadForm');
        elements.assetFile = document.getElementById('imageAssetFile');
        elements.assetLabel = document.getElementById('imageAssetLabel');
        elements.assetDescription = document.getElementById('imageAssetDescription');
        elements.assetOverwrite = document.getElementById('imageAssetOverwrite');
        elements.assetUploadBtn = document.getElementById('uploadImageAssetBtn');
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
                elements.section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        if (elements.copyTestMessageBtn) {
            elements.copyTestMessageBtn.addEventListener('click', copySampleImageMessage);
        }

        if (elements.assetUploadForm) {
            elements.assetUploadForm.addEventListener('submit', (event) => {
                event.preventDefault();
                handleAssetUpload();
            });
        }

        if (elements.assetUploadBtn) {
            elements.assetUploadBtn.addEventListener('click', handleAssetUpload);
        }

        if (elements.assetsSearch) {
            elements.assetsSearch.addEventListener('input', (event) => {
                state.assetFilter = event.target.value.trim().toLowerCase();
                renderAssetsList();
            });
        }

        if (elements.assetsList) {
            elements.assetsList.addEventListener('click', handleAssetListAction);
        }

        if (elements.collectionsSearch) {
            elements.collectionsSearch.addEventListener('input', (event) => {
                state.collectionFilter = event.target.value.trim().toLowerCase();
                renderCollectionsList();
            });
        }

        if (elements.collectionFilterButtons && elements.collectionFilterButtons.length > 0) {
            elements.collectionFilterButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const { usageFilter } = button.dataset;
                    if (!usageFilter || usageFilter === state.collectionUsageFilter) return;
                    state.collectionUsageFilter = usageFilter;
                    elements.collectionFilterButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
                    renderCollectionsList();
                });
            });
        }

        if (elements.collectionsList) {
            elements.collectionsList.addEventListener('click', handleCollectionAction);
        }

        if (elements.collectionAssetSearch) {
            elements.collectionAssetSearch.addEventListener('input', (event) => {
                state.collectionAssetFilter = event.target.value.trim().toLowerCase();
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

    const updateAssetsCount = () => {
        if (!elements.assetsCount) return;
        const total = Array.isArray(state.assets) ? state.assets.length : 0;
        elements.assetsCount.textContent = `${total} รูป`;
    };

    const getLabelsUsedInCollections = () => {
        const labels = new Set();
        state.collections.forEach((collection) => {
            if (Array.isArray(collection.images)) {
                collection.images.forEach((img) => {
                    if (img?.label) {
                        labels.add(img.label);
                    }
                });
            }
        });
        return labels;
    };

    const renderAssetsList = () => {
        if (!elements.assetsList) return;

        const assets = Array.isArray(state.assets) ? state.assets : [];
        const filter = state.assetFilter;
        const usedLabels = getLabelsUsedInCollections();

        if (assets.length === 0) {
            elements.assetsList.innerHTML = '<div class="empty-state"><i class="fas fa-image mb-2"></i><div>ยังไม่มีรูปภาพ</div><small class="text-muted">อัปโหลดรูปเพื่อใช้ร่วมกับ AI ได้ทันที</small></div>';
            return;
        }

        const filtered = filter
            ? assets.filter((asset) => {
                  const label = (asset.label || '').toLowerCase();
                  const description = (asset.description || asset.alt || '').toLowerCase();
                  return label.includes(filter) || description.includes(filter);
              })
            : assets;

        if (filtered.length === 0) {
            elements.assetsList.innerHTML = '<div class="empty-state"><i class="fas fa-search mb-2"></i><div>ไม่พบรูปภาพที่ตรงกับคำค้น</div></div>';
            return;
        }

        const html = filtered
            .map((asset) => {
                const label = asset.label || asset.fileName || 'unnamed';
                const escapedLabel = escapeHtml(label);
                const description = escapeHtml(asset.description || asset.alt || '');
                const token = `#[IMAGE:${label}]`;
                const sizeText = formatFileSize(asset.size);
                const thumb = asset.thumbUrl || asset.url || '';
                const usedBadge = usedLabels.has(label)
                    ? '<span class="badge bg-success-soft text-success ms-2"><i class="fas fa-check me-1"></i>ใช้งานในคอลเลกชัน</span>'
                    : '';
                const updated = formatTimestamp(asset.updatedAt || asset.createdAt);

                return `
                    <div class="image-asset-item" data-label="${escapeAttribute(label)}">
                        <div class="image-asset-thumb">
                            ${thumb ? `<img src="${thumb}" alt="${escapedLabel}">` : '<div class="image-asset-thumb-placeholder"><i class="fas fa-image"></i></div>'}
                        </div>
                        <div class="image-asset-info">
                            <div class="image-asset-title">
                                <strong>${escapedLabel}</strong>
                                ${usedBadge}
                            </div>
                            <div class="image-asset-description">${description || '<span class="text-muted">ไม่มีคำอธิบาย</span>'}</div>
                            <div class="image-asset-meta">
                                <span class="token">token: <code>${escapeHtml(token)}</code></span>
                                <span class="dot">•</span>
                                <span>${sizeText}</span>
                                <span class="dot">•</span>
                                <span>อัปเดต ${escapeHtml(updated)}</span>
                            </div>
                        </div>
                        <div class="image-asset-actions">
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-action="copy" data-label="${escapedLabel}">
                                <i class="fas fa-copy me-1"></i>โทเคน
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-label="${escapedLabel}">
                                <i class="fas fa-trash me-1"></i>ลบ
                            </button>
                        </div>
                    </div>
                `;
            })
            .join('');

        elements.assetsList.innerHTML = html;
    };

    const resetAssetForm = () => {
        if (elements.assetFile) elements.assetFile.value = '';
        if (elements.assetLabel) elements.assetLabel.value = '';
        if (elements.assetDescription) elements.assetDescription.value = '';
        if (elements.assetOverwrite) elements.assetOverwrite.checked = false;
    };

    const handleAssetUpload = async () => {
        const file = elements.assetFile?.files?.[0] || null;
        const label = elements.assetLabel?.value?.trim();
        const description = elements.assetDescription?.value?.trim() || '';
        const overwrite = !!elements.assetOverwrite?.checked;

        if (!file || !label) {
            showAlert('กรุณาเลือกไฟล์และระบุชื่อรูปภาพ', 'warning');
            return;
        }

        const form = new FormData();
        form.append('image', file);
        form.append('label', label);
        form.append('description', description);
        form.append('overwrite', overwrite ? 'true' : 'false');

        try {
            if (elements.assetUploadBtn) {
                elements.assetUploadBtn.disabled = true;
                elements.assetUploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังอัปโหลด';
            }

            const response = await fetch('/admin/instructions/assets', {
                method: 'POST',
                body: form
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถอัปโหลดรูปภาพได้');
            }

            showAlert('อัปโหลดรูปภาพสำเร็จ', 'success');
            resetAssetForm();
            await fetchAssets();
            await fetchCollections();
        } catch (err) {
            console.error('upload asset error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ', 'danger');
        } finally {
            if (elements.assetUploadBtn) {
                elements.assetUploadBtn.disabled = false;
                elements.assetUploadBtn.innerHTML = '<i class="fas fa-upload me-1"></i>อัปโหลดรูป';
            }
        }
    };

    const copyAssetToken = async (label) => {
        const token = `#[IMAGE:${label}]`;
        try {
            await navigator.clipboard?.writeText(token);
            showAlert('คัดลอกโทเคนเรียบร้อยแล้ว', 'success');
        } catch (err) {
            console.warn('clipboard copy failed:', err);
            window.prompt('คัดลอกโทเคนด้วยตนเอง:', token);
        }
    };

    const deleteAsset = async (label) => {
        if (!label) return;
        if (!confirm(`ยืนยันการลบรูปภาพ: ${label}?`)) return;
        try {
            const response = await fetch(`/admin/instructions/assets/${encodeURIComponent(label)}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถลบรูปภาพได้');
            }
            showAlert('ลบรูปภาพสำเร็จ', 'success');
            await fetchAssets();
            await fetchCollections();
        } catch (err) {
            console.error('delete asset error:', err);
            showAlert(err.message || 'เกิดข้อผิดพลาดในการลบรูปภาพ', 'danger');
        }
    };

    const handleAssetListAction = (event) => {
        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn) return;
        const { action, label } = actionBtn.dataset;
        if (!label) return;
        if (action === 'copy') {
            copyAssetToken(label);
        } else if (action === 'delete') {
            deleteAsset(label);
        }
    };

    const copySampleImageMessage = async () => {
        const sampleLabel = state.assets.length > 0 && state.assets[0].label
            ? state.assets[0].label
            : 'ชื่อรูปภาพ';
        const message = `ลองส่งข้อความตัวอย่าง: สวัสดีค่ะ #[IMAGE:${sampleLabel}] เพื่อทดสอบการส่งรูป`; 
        try {
            await navigator.clipboard?.writeText(message);
            showAlert('คัดลอกข้อความทดสอบเรียบร้อยแล้ว', 'success');
        } catch (err) {
            console.warn('copy sample message failed:', err);
            window.prompt('คัดลอกข้อความทดสอบด้วยตนเอง:', message);
        }
    };

    const refreshAll = async () => {
        try {
            await Promise.all([
                fetchCollections(),
                fetchAssets(),
                fetchBots()
            ]);
            renderAssignments();
        } catch (err) {
            console.error('refreshAll error:', err);
            showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูลคลังรูปภาพ', 'danger');
        }
    };

    const fetchCollections = async () => {
        try {
            if (elements.collectionsList) {
                elements.collectionsList.innerHTML = '<div class="text-muted small">กำลังโหลดรายการคลังรูปภาพ...</div>';
            }
            const response = await fetch('/api/image-collections');
            if (!response.ok) throw new Error('ไม่สามารถดึงรายการคลังรูปภาพได้');
            const data = await response.json();
            state.collections = Array.isArray(data.collections) ? data.collections : [];
            updateCollectionsCount();
            renderCollectionsList();
            renderAssetsList();
        } catch (err) {
            console.error('fetchCollections error:', err);
            showAlert('โหลดข้อมูลคลังรูปภาพไม่สำเร็จ', 'danger');
            state.collections = [];
            updateCollectionsCount();
            renderCollectionsList();
            renderAssetsList();
        }
    };

    const fetchAssets = async () => {
        try {
            const response = await fetch('/admin/instructions/assets');
            if (!response.ok) throw new Error('ไม่สามารถดึงรายการรูปภาพได้');
            const data = await response.json();
            state.assets = Array.isArray(data.assets) ? data.assets : [];
            updateAssetsCount();
            renderAssetsList();
        } catch (err) {
            console.error('fetchAssets error:', err);
            showAlert('โหลดรายการรูปภาพไม่สำเร็จ', 'danger');
            state.assets = [];
            updateAssetsCount();
            renderAssetsList();
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

        const usageFiltered = filtered.filter((collection) => {
            const usage = computeCollectionUsage(collection._id);
            const totalUsage = usage.line + usage.facebook;
            if (state.collectionUsageFilter === 'assigned') {
                return totalUsage > 0;
            }
            if (state.collectionUsageFilter === 'unassigned') {
                return totalUsage === 0;
            }
            return true;
        });

        if (usageFiltered.length === 0) {
            elements.collectionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search mb-2"></i>
                    <div>ไม่พบคลังรูปภาพที่ตรงกับคำค้น</div>
                </div>
            `;
            return;
        }

        const html = usageFiltered
            .map((collection) => {
                const imagesCount = Array.isArray(collection.images) ? collection.images.length : 0;
                const usage = computeCollectionUsage(collection._id);
                const isDefault = !!collection.isDefault;
                const safeName = escapeHtml(collection.name || collection._id);
                const description = collection.description ? escapeHtml(collection.description) : 'ไม่มีคำอธิบาย';
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
                        const alt = escapeHtml(img.label || 'preview');
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
                                    <strong>${safeName}</strong>
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
        state.collectionAssetFilter = '';
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
                modalLabel.innerHTML = `<i class="fas fa-images me-2"></i>แก้ไขคลังรูปภาพ: ${escapeHtml(collection.name || '')}`;
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

        const filter = state.collectionAssetFilter;
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
                const label = asset.label || '';
                const checked = selectedLabels.has(label) ? 'checked' : '';
                const thumb = asset.thumbUrl || asset.url || '';
                const description = asset.description || asset.alt || '';
                const safeLabel = escapeHtml(label);
                const safeDescription = description ? escapeHtml(description) : 'ไม่มีคำอธิบาย';
                return `
                    <label class="collection-asset-item" for="${id}">
                        <input type="checkbox" class="form-check-input" id="${id}" value="${escapeAttribute(label)}" ${checked}>
                        <span class="collection-asset-thumb">
                            <img src="${thumb}" alt="${safeLabel}">
                        </span>
                        <span class="collection-asset-info">
                            <strong>${safeLabel}</strong>
                            <small class="text-muted">${safeDescription}</small>
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
