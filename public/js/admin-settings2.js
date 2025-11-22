/**
 * Admin Settings2 JavaScript
 * Modern compact settings page with custom tab navigation
 */

// ========== State Management ==========
const Settings2 = {
    currentTab: 'bot-ai',
    settings: {},
    caches: {
        settings: null,
        instructions: null,
        lineBots: null,
        facebookBots: null,
        passcodes: null
    },
    requestIds: {
        settings: 0,
        instructions: 0,
        lineBots: 0,
        facebookBots: 0
    }
};

// ========== Initialization ==========
document.addEventListener('DOMContentLoaded', () => {
    initializeTabNavigation();
    initializeSettingsForms();
    initializeRangeInputs();
    initializePasscodeManagement();
    loadInitialData();

    // Check URL hash for deep linking
    const hash = window.location.hash.slice(1);
    if (hash && ['bot-ai', 'chat', 'system', 'security'].includes(hash)) {
        switchTab(hash);
    }
});

// ========== Tab Navigation ==========
function initializeTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-pill');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    Settings2.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Update URL hash
    window.location.hash = tabName;

    // Save to localStorage
    localStorage.setItem('settings2_lastTab', tabName);

    // Load tab-specific data
    loadTabData(tabName);
}

// ========== Data Loading ==========
async function loadInitialData() {
    const lastTab = localStorage.getItem('settings2_lastTab') || 'bot-ai';
    switchTab(lastTab);
}

async function loadTabData(tabName) {
    switch (tabName) {
        case 'bot-ai':
            await Promise.all([
                loadLineBots(),
                loadFacebookBots(),
                refreshImageCollectionsData()
            ]);
            break;
        case 'chat':
        case 'system':
        case 'security':
            await loadSettings();
            break;
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings');

        const data = await response.json();
        Settings2.caches.settings = data;
        Settings2.settings = { ...data };

        populateSettingsForms();
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('ไม่สามารถโหลดการตั้งค่าได้', 'danger');
    }
}

function populateSettingsForms() {
    const s = Settings2.settings;

    // Chat settings
    setValue('chatDelaySeconds', s.chatDelaySeconds || 0);
    setValue('maxQueueMessages', s.maxQueueMessages || 10);
    setChecked('enableMessageMerging', s.enableMessageMerging !== false);
    setChecked('showTokenUsage', s.showTokenUsage || false);
    setValue('audioAttachmentResponse', s.audioAttachmentResponse || 'ขออภัยค่ะ ขณะนี้ระบบยังไม่รองรับไฟล์เสียง กรุณาพิมพ์ข้อความหรือส่งรูปภาพแทน');

    // System settings
    setChecked('aiEnabled', s.aiEnabled !== false);
    setChecked('enableChatHistory', s.enableChatHistory !== false);
    setChecked('enableAdminNotifications', s.enableAdminNotifications !== false);
    setValue('systemMode', s.systemMode || 'production');

    // Filter settings
    setChecked('enableMessageFiltering', s.enableMessageFiltering || false);
    setChecked('enableStrictFiltering', s.enableStrictFiltering || false);
    setValue('hiddenWords', s.hiddenWords || '');
    setValue('replacementText', s.replacementText || '[ข้อความถูกซ่อน]');
    updateHiddenWordsCount();
}

// ========== Bot Management ==========
async function loadLineBots() {
    try {
        const response = await fetch('/api/line-bots');
        if (!response.ok) throw new Error('Failed to load LINE bots');

        const bots = await response.json();
        Settings2.caches.lineBots = bots;
        displayLineBots(bots);
    } catch (error) {
        console.error('Error loading LINE bots:', error);
        showBotLoadingError('lineBotList');
    }
}

async function loadFacebookBots() {
    try {
        const response = await fetch('/api/facebook-bots');
        if (!response.ok) throw new Error('Failed to load Facebook bots');

        const bots = await response.json();
        Settings2.caches.facebookBots = bots;
        displayFacebookBots(bots);
    } catch (error) {
        console.error('Error loading Facebook bots:', error);
        showBotLoadingError('facebookBotList');
    }
}

function displayLineBots(bots) {
    const container = document.getElementById('lineBotList');
    const countEl = document.getElementById('lineBotCount');

    if (!Array.isArray(bots) || bots.length === 0) {
        container.innerHTML = '<div class="loading-state"><i class="fas fa-robot"></i> ยังไม่มี LINE Bot</div>';
        if (countEl) countEl.textContent = '0';
        return;
    }

    if (countEl) countEl.textContent = bots.length;

    container.innerHTML = bots.map(bot => createBotCard(bot, 'line')).join('');
    attachBotEventListeners(container, 'line');

    // Also call the original display function if it exists for compatibility
    if (typeof displayLineBotAiModelInfo === 'function') {
        displayLineBotAiModelInfo(bots);
    }
}

function displayFacebookBots(bots) {
    const container = document.getElementById('facebookBotList');
    const countEl = document.getElementById('facebookBotCount');

    if (!Array.isArray(bots) || bots.length === 0) {
        container.innerHTML = '<div class="loading-state"><i class="fas fa-robot"></i> ยังไม่มี Facebook Bot</div>';
        if (countEl) countEl.textContent = '0';
        return;
    }

    if (countEl) countEl.textContent = bots.length;

    container.innerHTML = bots.map(bot => createBotCard(bot, 'facebook')).join('');
    attachBotEventListeners(container, 'facebook');

    // Also call the original display function if it exists for compatibility
    if (typeof displayFacebookBotList === 'function') {
        displayFacebookBotList(bots);
    }
}

function createBotCard(bot, type) {
    const isActive = bot.isActive !== false;
    const modelInfo = bot.aiModel || bot.textModel || 'gpt-4o';
    const botId = bot._id || bot.id;

    return `
        <div class="bot-card" data-bot-id="${botId}" data-bot-type="${type}">
            <div class="bot-card-header">
                <div class="bot-status ${isActive ? 'active' : ''}"></div>
                <div class="bot-name">${escapeHtml(bot.name || bot.botName || 'Unnamed Bot')}</div>
            </div>
            <div class="bot-card-body">
                <div class="meta-item">
                    <i class="fas fa-brain"></i>
                    <span>${modelInfo}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-book"></i>
                    <span>${bot.instructions?.length || 0} Instructions</span>
                </div>
                ${bot.imageCollections && bot.imageCollections.length > 0 ? `
                <div class="meta-item">
                    <i class="fas fa-images"></i>
                    <span>${bot.imageCollections.length} Collections</span>
                </div>
                ` : ''}
            </div>
            <div class="bot-card-actions">
                <button class="btn btn-sm btn-outline-primary edit-bot-btn" 
                        data-bot-id="${botId}" 
                        data-bot-type="${type}">
                    <i class="fas fa-edit"></i> แก้ไข
                </button>
                <button class="btn btn-sm btn-outline-secondary manage-instructions-btn" 
                        data-bot-id="${botId}" 
                        data-bot-type="${type}">
                    <i class="fas fa-book"></i> Instructions
                </button>
                <button class="btn btn-sm btn-outline-info manage-collections-btn" 
                        data-bot-id="${botId}" 
                        data-bot-type="${type}">
                    <i class="fas fa-images"></i> คลังรูป
                </button>
            </div>
        </div>
    `;
}

function attachBotEventListeners(container, type) {
    // Edit bot buttons
    container.querySelectorAll('.edit-bot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const botId = btn.getAttribute('data-bot-id');
            if (type === 'line') {
                if (typeof editLineBot === 'function') {
                    editLineBot(botId);
                } else {
                    // Fallback: open modal manually
                    openLineBotModal(botId);
                }
            } else if (type === 'facebook') {
                if (typeof editFacebookBot === 'function') {
                    editFacebookBot(botId);
                } else {
                    // Fallback: open modal manually
                    openFacebookBotModal(botId);
                }
            }
        });
    });

    // Manage instructions buttons
    container.querySelectorAll('.manage-instructions-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const botId = btn.getAttribute('data-bot-id');

            if (typeof openInstructionsModal === 'function') {
                openInstructionsModal(botId, type);
            } else if (typeof manageInstructions === 'function') {
                manageInstructions(botId, type);
            } else {
                showToast('ฟังก์ชันจัดการ Instructions ยังไม่พร้อมใช้งาน', 'warning');
            }
        });
    });

    // Manage collections buttons
    container.querySelectorAll('.manage-collections-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const botId = btn.getAttribute('data-bot-id');

            if (typeof openBotImageCollectionsModal === 'function') {
                openBotImageCollectionsModal(botId, type);
            } else if (typeof manageBotImageCollections === 'function') {
                manageBotImageCollections(botId, type);
            } else {
                showToast('ฟังก์ชันจัดการคลังรูปภาพยังไม่พร้อมใช้งาน', 'warning');
            }
        });
    });
}

// Helper functions for opening modals
function openLineBotModal(botId) {
    const modal = new bootstrap.Modal(document.getElementById('addLineBotModal'));
    if (botId && typeof loadLineBotData === 'function') {
        loadLineBotData(botId);
    }
    modal.show();
}

function openFacebookBotModal(botId) {
    const modal = new bootstrap.Modal(document.getElementById('addFacebookBotModal'));
    if (botId && typeof loadFacebookBotData === 'function') {
        loadFacebookBotData(botId);
    }
    modal.show();
}

function showBotLoadingError(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '<div class="loading-state text-danger"><i class="fas fa-exclamation-triangle"></i> โหลดข้อมูลไม่สำเร็จ</div>';
    }
}

// ========== Images & Collections ==========
async function refreshImageCollectionsData() {
    // Initialize image assets management in the compact view
    const assetsContainer = document.getElementById('imageAssetsManagement');
    const collectionsContainer = document.getElementById('imageCollectionsManagement');

    if (assetsContainer) {
        // Create the structure that existing code expects
        assetsContainer.innerHTML = `
            <div class="mb-3">
                <h6 class="mb-2"><i class="fas fa-upload me-2"></i>อัปโหลดรูปภาพ</h6>
                <div class="image-upload-dropzone" id="imageAssetDropzone">
                    <div class="dropzone-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                    <div class="dropzone-text">ลากไฟล์มาวางที่นี่</div>
                    <div class="dropzone-subtext text-muted">หรือคลิกเพื่อเลือกไฟล์</div>
                    <input type="file" id="imageAssetFile" accept="image/*" multiple hidden>
                    <button type="button" class="btn btn-sm btn-outline-primary mt-2" id="triggerImageAssetSelect">
                        <i class="fas fa-folder-open me-1"></i>เลือกไฟล์
                    </button>
                </div>
                <div class="upload-queue-toolbar d-flex justify-content-between align-items-center mt-2">
                    <div class="small text-muted" id="uploadQueueSummary">ยังไม่มีไฟล์ในคิว</div>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-sm btn-outline-secondary" id="clearUploadQueueBtn" disabled>
                            <i class="fas fa-times me-1"></i>ล้าง
                        </button>
                        <button type="button" class="btn btn-sm btn-primary" id="startUploadQueueBtn" disabled>
                            <i class="fas fa-upload me-1"></i>อัปโหลด
                        </button>
                    </div>
                </div>
                <div class="upload-queue-list mt-2" id="imageAssetQueue" style="max-height: 200px; overflow-y: auto;">
                    <div class="empty-state small text-muted text-center py-2">
                        <i class="fas fa-images me-1"></i>เพิ่มรูปภาพที่นี่
                    </div>
                </div>
                <hr class="my-3">
                <div class="input-group input-group-sm mb-2">
                    <span class="input-group-text bg-light"><i class="fas fa-search"></i></span>
                    <input type="text" class="form-control" id="imageAssetsSearch" placeholder="ค้นหารูปภาพ">
                </div>
                <div class="image-assets-list" id="imageAssetsList" style="max-height: 300px; overflow-y: auto;">
                    <div class="text-muted small py-2 text-center">กำลังโหลด...</div>
                </div>
            </div>
        `;
    }

    if (collectionsContainer) {
        collectionsContainer.innerHTML = `
            <div>
                <h6 class="mb-2"><i class="fas fa-folder me-2"></i>คลังรูปภาพ</h6>
                <div class="input-group input-group-sm mb-2">
                    <span class="input-group-text bg-light"><i class="fas fa-search"></i></span>
                    <input type="text" class="form-control" id="imageCollectionsSearch" placeholder="ค้นหาคลัง">
                </div>
                <div class="d-flex gap-2 mb-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-usage-filter="all">ทั้งหมด</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-usage-filter="assigned">ใช้งานอยู่</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-usage-filter="unassigned">ยังไม่ถูกเลือก</button>
                </div>
                <div class="image-collections-list" id="imageCollectionsList" style="max-height: 400px; overflow-y: auto;">
                    <div class="text-muted small py-2 text-center">กำลังโหลด...</div>
                </div>
            </div>
        `;
    }

    // Call the existing image collections management functions if available
    if (typeof refreshImageAssetsList === 'function') {
        refreshImageAssetsList();
    }
    if (typeof refreshImageCollectionsList === 'function') {
        refreshImageCollectionsList();
    }
    if (typeof initializeImageUploader === 'function') {
        initializeImageUploader();
    }

    // Update counts
    updateImageCounts();
}

async function updateImageCounts() {
    try {
        // Get assets count
        const assetsResponse = await fetch('/api/instruction-assets');
        if (assetsResponse.ok) {
            const assetsData = await assetsResponse.json();
            const assetsCount = assetsData.assets?.length || 0;
            const assetsCountEl = document.getElementById('imageAssetsCount');
            if (assetsCountEl) assetsCountEl.textContent = assetsCount;
        }

        // Get collections count
        const collectionsResponse = await fetch('/api/image-collections');
        if (collectionsResponse.ok) {
            const collectionsData = await collectionsResponse.json();
            const collectionsCount = collectionsData.collections?.length || 0;
            const collectionsCountEl = document.getElementById('imageCollectionsCount');
            if (collectionsCountEl) collectionsCountEl.textContent = collectionsCount;
        }
    } catch (error) {
        console.error('Error updating image counts:', error);
    }
}

// ========== Form Submission Handlers ==========
function initializeSettingsForms() {
    // Chat settings form
    const chatForm = document.getElementById('chatSettingsForm');
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveChatSettings();
        });
    }

    // System settings form
    const systemForm = document.getElementById('systemSettingsForm');
    if (systemForm) {
        systemForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveSystemSettings();
        });
    }

    // Filter settings form
    const filterForm = document.getElementById('filterSettingsForm');
    if (filterForm) {
        filterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveFilterSettings();
        });
    }

    // Hidden words counter
    const hiddenWordsTextarea = document.getElementById('hiddenWords');
    if (hiddenWordsTextarea) {
        hiddenWordsTextarea.addEventListener('input', updateHiddenWordsCount);
    }
}

async function saveChatSettings() {
    const settings = {
        chatDelaySeconds: parseInt(getValue('chatDelaySeconds')) || 0,
        maxQueueMessages: parseInt(getValue('maxQueueMessages')) || 10,
        enableMessageMerging: getChecked('enableMessageMerging'),
        showTokenUsage: getChecked('showTokenUsage'),
        audioAttachmentResponse: getValue('audioAttachmentResponse')?.trim() ||
            'ขออภัยค่ะ ขณะนี้ระบบยังไม่รองรับไฟล์เสียง'
    };

    try {
        const response = await fetch('/api/settings/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!response.ok) throw new Error('Failed to save chat settings');

        showToast('บันทึกการตั้งค่าแชทเรียบร้อยแล้ว', 'success');
        await loadSettings();
    } catch (error) {
        console.error('Error saving chat settings:', error);
        showToast('ไม่สามารถบันทึกการตั้งค่าแชทได้', 'danger');
    }
}

async function saveSystemSettings() {
    const settings = {
        aiEnabled: getChecked('aiEnabled'),
        enableChatHistory: getChecked('enableChatHistory'),
        enableAdminNotifications: getChecked('enableAdminNotifications'),
        systemMode: getValue('systemMode') || 'production'
    };

    try {
        const response = await fetch('/api/settings/system', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!response.ok) throw new Error('Failed to save system settings');

        showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success');
        await loadSettings();
    } catch (error) {
        console.error('Error saving system settings:', error);
        showToast('ไม่สามารถบันทึกการตั้งค่าระบบได้', 'danger');
    }
}

async function saveFilterSettings() {
    const settings = {
        enableMessageFiltering: getChecked('enableMessageFiltering'),
        enableStrictFiltering: getChecked('enableStrictFiltering'),
        hiddenWords: getValue('hiddenWords') || '',
        replacementText: getValue('replacementText') || '[ข้อความถูกซ่อน]'
    };

    try {
        const response = await fetch('/api/settings/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!response.ok) throw new Error('Failed to save filter settings');

        showToast('บันทึกการตั้งค่าการกรองเรียบร้อยแล้ว', 'success');
        await loadSettings();
    } catch (error) {
        console.error('Error saving filter settings:', error);
        showToast('ไม่สามารถบันทึกการตั้งค่าการกรองได้', 'danger');
    }
}

// ========== Range Input Handlers ==========
function initializeRangeInputs() {
    const chatDelay = document.getElementById('chatDelaySeconds');
    const chatDelayDisplay = document.getElementById('chatDelayDisplay');

    if (chatDelay && chatDelayDisplay) {
        chatDelay.addEventListener('input', (e) => {
            chatDelayDisplay.textContent = e.target.value;
        });
    }

    const maxQueue = document.getElementById('maxQueueMessages');
    const maxQueueDisplay = document.getElementById('maxQueueDisplay');

    if (maxQueue && maxQueueDisplay) {
        maxQueue.addEventListener('input', (e) => {
            maxQueueDisplay.textContent = e.target.value;
        });
    }
}

function updateHiddenWordsCount() {
    const textarea = document.getElementById('hiddenWords');
    const countEl = document.getElementById('hiddenWordsCount');

    if (!textarea || !countEl) return;

    const words = textarea.value.split('\n').filter(w => w.trim() !== '');
    countEl.textContent = words.length;
}

// ========== Filter Testing ==========
async function testFiltering() {
    const testMessage = getValue('testMessage');
    const resultDiv = document.getElementById('testResult');

    if (!testMessage?.trim()) {
        showToast('กรุณาใส่ข้อความที่ต้องการทดสอบ', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/filter/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: testMessage })
        });

        if (!response.ok) throw new Error('Failed to test filtering');

        const result = await response.json();

        if (resultDiv) {
            resultDiv.innerHTML = `
                <strong>ผลการทดสอบ:</strong><br>
                <strong>ต้นฉบับ:</strong> ${escapeHtml(testMessage)}<br>
                <strong>หลังกรอง:</strong> ${escapeHtml(result.filteredMessage)}<br>
                <strong>คำที่ซ่อน:</strong> ${result.hiddenWords?.length > 0 ? result.hiddenWords.join(', ') : 'ไม่มี'}
            `;
            resultDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error testing filter:', error);
        showToast('ไม่สามารถทดสอบการกรองได้', 'danger');
    }
}

// ========== Passcode Management ==========
function initializePasscodeManagement() {
    const section = document.getElementById('passcodeSection');
    if (!section) return;

    // Check if passcode feature is enabled and user is superadmin
    const isSuperadmin = window.adminAuth?.user?.role === 'superadmin';
    const isPasscodeEnabled = window.adminAuth?.requirePasscode;

    if (!isSuperadmin || !isPasscodeEnabled) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';

    // Toggle create form
    const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
    const createContainer = document.getElementById('passcodeCreateContainer');

    if (toggleBtn && createContainer) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = createContainer.style.display !== 'none';
            createContainer.style.display = isVisible ? 'none' : 'block';
            toggleBtn.innerHTML = isVisible
                ? '<i class="fas fa-plus"></i><span>สร้างรหัสใหม่</span>'
                : '<i class="fas fa-times"></i><span>ยกเลิก</span>';
        });
    }

    // Generate passcode button
    const generateBtn = document.getElementById('generatePasscodeBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            const input = document.getElementById('newPasscodeValue');
            if (input) {
                input.value = generateRandomPasscode();
            }
        });
    }

    // Create form submission
    const createForm = document.getElementById('createPasscodeForm');
    if (createForm) {
        createForm.addEventListener('submit', handleCreatePasscode);
    }

    // Load passcode list if on security tab
    if (Settings2.currentTab === 'security') {
        refreshPasscodeList();
    }
}

function generateRandomPasscode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

async function handleCreatePasscode(e) {
    e.preventDefault();

    const label = getValue('newPasscodeLabel')?.trim();
    const passcode = getValue('newPasscodeValue')?.trim();

    if (!label || !passcode) {
        showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/admin-passcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, passcode })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to create passcode');
        }

        showToast('สร้างรหัสใหม่เรียบร้อยแล้ว', 'success');
        setValue('newPasscodeLabel', '');
        setValue('newPasscodeValue', '');

        const createContainer = document.getElementById('passcodeCreateContainer');
        const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
        if (createContainer) createContainer.style.display = 'none';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-plus"></i><span>สร้างรหัสใหม่</span>';

        await refreshPasscodeList();
    } catch (error) {
        console.error('Error creating passcode:', error);
        showToast(error.message || 'ไม่สามารถสร้างรหัสได้', 'danger');
    }
}

async function refreshPasscodeList() {
    // Delegate to existing passcode management if available
    if (typeof window.adminSettings?.refreshPasscodeList === 'function') {
        return window.adminSettings.refreshPasscodeList();
    }

    // Otherwise implement basic refresh
    try {
        const response = await fetch('/api/admin-passcodes');
        if (!response.ok) throw new Error('Failed to load passcodes');

        const { passcodes } = await response.json();
        Settings2.caches.passcodes = passcodes || [];
        displayPasscodeList(passcodes || []);
    } catch (error) {
        console.error('Error loading passcodes:', error);
    }
}

function displayPasscodeList(passcodes) {
    const tbody = document.getElementById('passcodeTableBody');
    const emptyState = document.getElementById('passcodeEmptyState');

    if (!tbody) return;

    // Clear existing rows
    Array.from(tbody.querySelectorAll('tr[data-passcode-id]')).forEach(row => row.remove());

    if (passcodes.length === 0) {
        if (emptyState) emptyState.style.display = '';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    passcodes.forEach(pc => {
        const row = document.createElement('tr');
        row.setAttribute('data-passcode-id', pc.id);

        const statusBadge = pc.isActive
            ? '<span class="badge bg-success">เปิดใช้งาน</span>'
            : '<span class="badge bg-secondary">ปิดใช้งาน</span>';

        row.innerHTML = `
            <td><strong>${escapeHtml(pc.label || '-')}</strong></td>
            <td>${statusBadge}</td>
            <td>${formatDate(pc.lastUsedAt)}</td>
            <td>${pc.usageCount || 0}</td>
            <td class="text-end">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-secondary" onclick="togglePasscodeStatus('${pc.id}', ${!pc.isActive})">
                        ${pc.isActive ? 'ปิด' : 'เปิด'}
                    </button>
                    <button class="btn btn-outline-danger" onclick="deletePasscode('${pc.id}')">
                        ลบ
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });
}

async function togglePasscodeStatus(id, willActivate) {
    if (!confirm(`ต้องการ${willActivate ? 'เปิด' : 'ปิด'}ใช้งานรหัสนี้หรือไม่?`)) return;

    try {
        const response = await fetch(`/api/admin-passcodes/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: willActivate })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to toggle passcode');
        }

        showToast('อัปเดตรหัสเรียบร้อยแล้ว', 'success');
        await refreshPasscodeList();
    } catch (error) {
        console.error('Error toggling passcode:', error);
        showToast(error.message || 'ไม่สามารถอัปเดตรหัสได้', 'danger');
    }
}

async function deletePasscode(id) {
    if (!confirm('ต้องการลบรหัสนี้หรือไม่? ไม่สามารถกู้คืนได้')) return;

    try {
        const response = await fetch(`/api/admin-passcodes/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete passcode');

        showToast('ลบรหัสเรียบร้อยแล้ว', 'success');
        await refreshPasscodeList();
    } catch (error) {
        console.error('Error deleting passcode:', error);
        showToast(error.message || 'ไม่สามารถลบรหัสได้', 'danger');
    }
}

// ========== Refresh Handler ==========
document.getElementById('refreshSettingsBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refreshSettingsBtn');
    if (btn) btn.classList.add('fa-spin');

    await loadTabData(Settings2.currentTab);

    setTimeout(() => {
        if (btn) btn.classList.remove('fa-spin');
        showToast('รีเฟรชข้อมูลเรียบร้อยแล้ว', 'success');
    }, 500);
});

// ========== Image Collection Button Handler ==========
document.getElementById('createImageCollectionBtn')?.addEventListener('click', () => {
    if (typeof openImageCollectionModal === 'function') {
        openImageCollectionModal();
    } else {
        // Fallback: open modal directly
        const modal = new bootstrap.Modal(document.getElementById('imageCollectionModal'));
        // Clear the form
        document.getElementById('imageCollectionId').value = '';
        document.getElementById('imageCollectionName').value = '';
        document.getElementById('imageCollectionDescription').value = '';
        document.getElementById('deleteImageCollectionBtn').style.display = 'none';
        modal.show();

        // Load assets for selection if function exists
        if (typeof loadImageCollectionAssets === 'function') {
            loadImageCollectionAssets();
        }
    }
});

document.getElementById('refreshImageCollectionsBtn')?.addEventListener('click', () => {
    refreshImageCollectionsData();
    showToast('รีเฟรชคลังรูปภาพเรียบร้อย', 'success');
});

// ========== Utility Functions ==========
function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : null;
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function getChecked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

function setChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

function showToast(message, type = 'info') {
    // Use existing toast/alert system if available
    if (typeof showAlert === 'function') {
        showAlert(message, type);
        return;
    }

    // Fallback to simple alert
    const icons = {
        success: '✓',
        danger: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    console.log(`${icons[type] || 'ℹ'} ${message}`);
}

// ========== Global Exports ==========
window.Settings2 = Settings2;
window.testFiltering = testFiltering;
window.togglePasscodeStatus = togglePasscodeStatus;
window.deletePasscode = deletePasscode;
