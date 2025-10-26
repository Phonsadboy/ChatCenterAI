// Admin Settings JavaScript
// Global variables
let currentSettings = {};
let settingsCache = null;
let instructionLibraryCache = null;
let lineBotCache = null;
let facebookBotCache = null;
let activeSettingsRequestId = 0;
let latestSettingsRequestId = 0;
let latestInstructionRequestId = 0;
let latestLineBotRequestId = 0;
let latestFacebookRequestId = 0;
let currentBotId = null;
let currentBotType = null; // 'line' or 'facebook'
let currentBotInstructions = [];
let availableLibraries = [];
const DEFAULT_AUDIO_ATTACHMENT_RESPONSE = 'ขออภัยค่ะ ขณะนี้ระบบยังไม่รองรับไฟล์เสียง กรุณาพิมพ์ข้อความหรือส่งรูปภาพแทน';

const TAB_RESOURCE_REQUIREMENTS = {
    'line-ai-tab': { instructions: true, lineBots: true, facebookBots: true },
    'chat-tab': { instructions: true },
    'system-tab': {},
    'filter-tab': {}
};

function getActiveSettingsTabId() {
    const activeTab = document.querySelector('#settingsTabs .nav-link.active');
    return activeTab ? activeTab.id : 'line-ai-tab';
}

function resolveTabRequirements(tabId) {
    return TAB_RESOURCE_REQUIREMENTS[tabId] || TAB_RESOURCE_REQUIREMENTS['line-ai-tab'];
}

function setSettingsLoadingState(isLoading) {
    const indicator = document.getElementById('settingsRefreshIndicator');
    if (!indicator) return;
    indicator.style.display = isLoading ? 'inline-flex' : 'none';
}

function populateInstructionOptionsFromCache() {
    const select = document.getElementById('defaultInstruction');
    if (!select) return;

    const libraries = Array.isArray(instructionLibraryCache) ? instructionLibraryCache : [];
    const currentValue = select.value;

    select.innerHTML = '<option value="">ไม่เลือก</option>';
    libraries.forEach(lib => {
        const option = document.createElement('option');
        option.value = lib.date;
        option.textContent = lib.name || lib.displayDate;
        select.appendChild(option);
    });

    const desiredValue = currentSettings.defaultInstruction || currentValue || '';
    if (desiredValue) {
        select.value = desiredValue;
    } else {
        select.value = '';
    }
}

function applyLineBotCacheToView() {
    if (typeof displayLineBotAiModelInfo === 'function' && Array.isArray(lineBotCache)) {
        displayLineBotAiModelInfo(lineBotCache);
    }
}

function applyFacebookBotCacheToView() {
    if (typeof displayFacebookBotList === 'function' && Array.isArray(facebookBotCache)) {
        displayFacebookBotList(facebookBotCache);
    }
}

function handleDataFetchError(resourceLabel, error, hasCache) {
    console.error(`Error loading ${resourceLabel}:`, error);
    if (!hasCache) {
        showAlert(`ไม่สามารถโหลด${resourceLabel}ได้`, 'danger');
    }
}

async function refreshSettingsData(requestId) {
    try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดการตั้งค่าได้');
        }
        const data = await response.json();
        if (requestId < latestSettingsRequestId) {
            return;
        }
        latestSettingsRequestId = requestId;
        settingsCache = { ...data };
        if (requestId === activeSettingsRequestId) {
            currentSettings = { ...data };
            populateSettings();
        }
    } catch (error) {
        handleDataFetchError('การตั้งค่า', error, !!settingsCache);
    }
}

async function refreshInstructionOptions(requestId) {
    try {
        const response = await fetch('/api/instructions/library');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดคลัง Instructions ได้');
        }
        const result = await response.json();
        if (requestId < latestInstructionRequestId) {
            return;
        }
        latestInstructionRequestId = requestId;
        instructionLibraryCache = Array.isArray(result.libraries) ? [...result.libraries] : [];
        if (requestId === activeSettingsRequestId) {
            populateInstructionOptionsFromCache();
        }
    } catch (error) {
        const hasCache = Array.isArray(instructionLibraryCache) && instructionLibraryCache.length > 0;
        handleDataFetchError('คลัง Instructions', error, hasCache);
    }
}

async function refreshLineBotOverview(requestId) {
    try {
        const response = await fetch('/api/line-bots');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดข้อมูล Line Bot ได้');
        }
        const bots = await response.json();
        if (requestId < latestLineBotRequestId) {
            return;
        }
        latestLineBotRequestId = requestId;
        lineBotCache = Array.isArray(bots) ? [...bots] : [];
        if (requestId === activeSettingsRequestId) {
            applyLineBotCacheToView();
        }
    } catch (error) {
        const hasCache = Array.isArray(lineBotCache) && lineBotCache.length > 0;
        handleDataFetchError('ข้อมูล Line Bot', error, hasCache);
    }
}

async function refreshFacebookBotOverview(requestId) {
    try {
        const response = await fetch('/api/facebook-bots');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดข้อมูล Facebook Bot ได้');
        }
        const bots = await response.json();
        if (requestId < latestFacebookRequestId) {
            return;
        }
        latestFacebookRequestId = requestId;
        facebookBotCache = Array.isArray(bots) ? [...bots] : [];
        if (requestId === activeSettingsRequestId) {
            applyFacebookBotCacheToView();
        }
    } catch (error) {
        const hasCache = Array.isArray(facebookBotCache) && facebookBotCache.length > 0;
        handleDataFetchError('ข้อมูล Facebook Bot', error, hasCache);
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    loadSettings({ useCacheFirst: false, tabId: getActiveSettingsTabId() });
    loadLineBotSettings();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Line Bot management
    const addLineBotBtn = document.querySelector('[data-bs-target="#addLineBotModal"]');
    if (addLineBotBtn) {
        addLineBotBtn.addEventListener('click', addNewLineBot);
    }
    
    const saveLineBotBtn = document.getElementById('saveLineBotBtn');
    if (saveLineBotBtn) {
        saveLineBotBtn.addEventListener('click', saveLineBot);
    }
    
    const saveInstructionsBtn = document.getElementById('saveInstructionsBtn');
    if (saveInstructionsBtn) {
        saveInstructionsBtn.addEventListener('click', saveSelectedInstructions);
    }

    // Chat settings form
    const chatSettingsForm = document.getElementById('chatSettingsForm');
    if (chatSettingsForm) {
        chatSettingsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveChatSettings();
        });
    }

    // AI settings form
    const aiSettingsForm = document.getElementById('aiSettingsForm');
    if (aiSettingsForm) {
        aiSettingsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveAISettings();
        });
    }

    // System settings form
    const systemSettingsForm = document.getElementById('systemSettingsForm');
    if (systemSettingsForm) {
        systemSettingsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveSystemSettings();
        });
    }

    // Filter settings form
    const filterSettingsForm = document.getElementById('filterSettingsForm');
    if (filterSettingsForm) {
        filterSettingsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveFilterSettings();
        });
    }

    // Real-time updates for chat delay and queue settings
    const chatDelayInput = document.getElementById('chatDelaySeconds');
    if (chatDelayInput) {
        chatDelayInput.addEventListener('input', function(e) {
            const currentChatDelay = document.getElementById('currentChatDelay');
            if (currentChatDelay) {
                currentChatDelay.textContent = e.target.value;
            }
        });
    }

    const maxQueueInput = document.getElementById('maxQueueMessages');
    if (maxQueueInput) {
        maxQueueInput.addEventListener('input', function(e) {
            const currentMaxQueue = document.getElementById('currentMaxQueue');
            if (currentMaxQueue) {
                currentMaxQueue.textContent = e.target.value;
            }
        });
    }

    // Tab change event
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(e) {
            const tabId = e.target ? e.target.id : getActiveSettingsTabId();
            loadSettings({ tabId, useCacheFirst: true });
        });
    });

    // Hidden words textarea
    const hiddenWordsTextarea = document.getElementById('hiddenWords');
    if (hiddenWordsTextarea) {
        hiddenWordsTextarea.addEventListener('input', updateHiddenWordsCount);
    }

    // Facebook Bot form
    const facebookBotForm = document.getElementById('facebookBotForm');
    if (facebookBotForm) {
        const saveFacebookBotBtn = document.getElementById('saveFacebookBotBtn');
        if (saveFacebookBotBtn) {
            saveFacebookBotBtn.addEventListener('click', saveFacebookBot);
        }
        
        const deleteFacebookBotBtn = document.getElementById('deleteFacebookBotBtn');
        if (deleteFacebookBotBtn) {
            deleteFacebookBotBtn.addEventListener('click', () => {
                const botId = document.getElementById('facebookBotId').value;
                if (botId) deleteFacebookBot(botId);
            });
        }
    }

    // Add new Facebook Bot button
    const addFacebookBotBtn = document.querySelector('[data-bs-target="#addFacebookBotModal"]');
    if (addFacebookBotBtn) {
        addFacebookBotBtn.addEventListener('click', addNewFacebookBot);
    }
}

// Load current settings with cache-first strategy
async function loadSettings(options = {}) {
    const tabId = options.tabId || getActiveSettingsTabId();
    const useCacheFirst = options.useCacheFirst !== false;
    const requirements = resolveTabRequirements(tabId);
    const requestId = ++activeSettingsRequestId;

    if (useCacheFirst) {
        if (settingsCache) {
            currentSettings = { ...settingsCache };
            populateSettings();
        }
        if (requirements.instructions && Array.isArray(instructionLibraryCache)) {
            populateInstructionOptionsFromCache();
        }
        if (requirements.lineBots) {
            applyLineBotCacheToView();
        }
        if (requirements.facebookBots) {
            applyFacebookBotCacheToView();
        }
    }

    setSettingsLoadingState(true);

    const tasks = [refreshSettingsData(requestId)];

    if (requirements.instructions) {
        tasks.push(refreshInstructionOptions(requestId));
    }

    if (requirements.lineBots) {
        tasks.push(refreshLineBotOverview(requestId));
    }

    if (requirements.facebookBots) {
        tasks.push(refreshFacebookBotOverview(requestId));
    }

    try {
        await Promise.all(tasks);
    } finally {
        if (requestId === activeSettingsRequestId) {
            setSettingsLoadingState(false);
        }
    }
}

// Populate settings in form
function populateSettings() {
    // Chat settings
    if (currentSettings.chatDelaySeconds !== undefined) {
        const chatDelayInput = document.getElementById('chatDelaySeconds');
        const currentChatDelay = document.getElementById('currentChatDelay');
        if (chatDelayInput) chatDelayInput.value = currentSettings.chatDelaySeconds;
        if (currentChatDelay) currentChatDelay.textContent = currentSettings.chatDelaySeconds;
    } else {
        const chatDelayInput = document.getElementById('chatDelaySeconds');
        const currentChatDelay = document.getElementById('currentChatDelay');
        if (chatDelayInput) chatDelayInput.value = 0;
        if (currentChatDelay) currentChatDelay.textContent = 0;
    }
    
    if (currentSettings.maxQueueMessages !== undefined) {
        const maxQueueInput = document.getElementById('maxQueueMessages');
        const currentMaxQueue = document.getElementById('currentMaxQueue');
        if (maxQueueInput) maxQueueInput.value = currentSettings.maxQueueMessages;
        if (currentMaxQueue) currentMaxQueue.textContent = currentSettings.maxQueueMessages;
    } else {
        const maxQueueInput = document.getElementById('maxQueueMessages');
        const currentMaxQueue = document.getElementById('currentMaxQueue');
        if (maxQueueInput) maxQueueInput.value = 10;
        if (currentMaxQueue) currentMaxQueue.textContent = 10;
    }
    
    if (currentSettings.enableMessageMerging !== undefined) {
        const enableMessageMerging = document.getElementById('enableMessageMerging');
        if (enableMessageMerging) enableMessageMerging.checked = currentSettings.enableMessageMerging;
    } else {
        const enableMessageMerging = document.getElementById('enableMessageMerging');
        if (enableMessageMerging) enableMessageMerging.checked = true;
    }

    if (currentSettings.showTokenUsage !== undefined) {
        const showTokenUsage = document.getElementById('showTokenUsage');
        if (showTokenUsage) showTokenUsage.checked = currentSettings.showTokenUsage;
    } else {
        const showTokenUsage = document.getElementById('showTokenUsage');
        if (showTokenUsage) showTokenUsage.checked = false;
    }

    const audioResponseInput = document.getElementById('audioAttachmentResponse');
    if (audioResponseInput) {
        if (typeof currentSettings.audioAttachmentResponse === 'string' && currentSettings.audioAttachmentResponse.trim() !== '') {
            audioResponseInput.value = currentSettings.audioAttachmentResponse;
        } else {
            audioResponseInput.value = DEFAULT_AUDIO_ATTACHMENT_RESPONSE;
        }
    }

    // AI settings
    if (currentSettings.textModel) {
        const textModel = document.getElementById('textModel');
        if (textModel) textModel.value = currentSettings.textModel;
    } else {
        const textModel = document.getElementById('textModel');
        if (textModel) textModel.value = 'gpt-5';
    }
    
    if (currentSettings.visionModel) {
        const visionModel = document.getElementById('visionModel');
        if (visionModel) visionModel.value = currentSettings.visionModel;
    } else {
        const visionModel = document.getElementById('visionModel');
        if (visionModel) visionModel.value = 'gpt-5';
    }

    if (currentSettings.maxImagesPerMessage !== undefined) {
        const maxImagesPerMessage = document.getElementById('maxImagesPerMessage');
        if (maxImagesPerMessage) maxImagesPerMessage.value = currentSettings.maxImagesPerMessage;
    } else {
        const maxImagesPerMessage = document.getElementById('maxImagesPerMessage');
        if (maxImagesPerMessage) maxImagesPerMessage.value = 3;
    }

    if (currentSettings.defaultInstruction !== undefined) {
        const defaultInstruction = document.getElementById('defaultInstruction');
        if (defaultInstruction) defaultInstruction.value = currentSettings.defaultInstruction;
    } else {
        const defaultInstruction = document.getElementById('defaultInstruction');
        if (defaultInstruction) defaultInstruction.value = '';
    }

    // System settings
    if (currentSettings.aiEnabled !== undefined) {
        const aiEnabled = document.getElementById('aiEnabled');
        if (aiEnabled) aiEnabled.checked = currentSettings.aiEnabled;
    } else {
        const aiEnabled = document.getElementById('aiEnabled');
        if (aiEnabled) aiEnabled.checked = true;
    }
    
    if (currentSettings.enableChatHistory !== undefined) {
        const enableChatHistory = document.getElementById('enableChatHistory');
        if (enableChatHistory) enableChatHistory.checked = currentSettings.enableChatHistory;
    } else {
        const enableChatHistory = document.getElementById('enableChatHistory');
        if (enableChatHistory) enableChatHistory.checked = true;
    }
    
    if (currentSettings.enableAdminNotifications !== undefined) {
        const enableAdminNotifications = document.getElementById('enableAdminNotifications');
        if (enableAdminNotifications) enableAdminNotifications.checked = currentSettings.enableAdminNotifications;
    } else {
        const enableAdminNotifications = document.getElementById('enableAdminNotifications');
        if (enableAdminNotifications) enableAdminNotifications.checked = true;
    }
    
    if (currentSettings.systemMode) {
        const systemMode = document.getElementById('systemMode');
        if (systemMode) systemMode.value = currentSettings.systemMode;
    } else {
        const systemMode = document.getElementById('systemMode');
        if (systemMode) systemMode.value = 'production';
    }

    // Filter settings
    if (currentSettings.enableMessageFiltering !== undefined) {
        const enableMessageFiltering = document.getElementById('enableMessageFiltering');
        if (enableMessageFiltering) enableMessageFiltering.checked = currentSettings.enableMessageFiltering;
    } else {
        const enableMessageFiltering = document.getElementById('enableMessageFiltering');
        if (enableMessageFiltering) enableMessageFiltering.checked = false;
    }
    
    if (currentSettings.hiddenWords !== undefined) {
        const hiddenWords = document.getElementById('hiddenWords');
        if (hiddenWords) hiddenWords.value = currentSettings.hiddenWords;
    } else {
        const hiddenWords = document.getElementById('hiddenWords');
        if (hiddenWords) hiddenWords.value = '';
    }
    
    // อัปเดตจำนวนคำที่ถูกซ่อน
    updateHiddenWordsCount();
    
    if (currentSettings.replacementText !== undefined) {
        const replacementText = document.getElementById('replacementText');
        if (replacementText) replacementText.value = currentSettings.replacementText;
    } else {
        const replacementText = document.getElementById('replacementText');
        if (replacementText) replacementText.value = '';
    }
    
    if (currentSettings.enableStrictFiltering !== undefined) {
        const enableStrictFiltering = document.getElementById('enableStrictFiltering');
        if (enableStrictFiltering) enableStrictFiltering.checked = currentSettings.enableStrictFiltering;
    } else {
        const enableStrictFiltering = document.getElementById('enableStrictFiltering');
        if (enableStrictFiltering) enableStrictFiltering.checked = false;
    }
}

// Save chat settings
async function saveChatSettings() {
    const chatDelaySeconds = document.getElementById('chatDelaySeconds');
    const maxQueueMessages = document.getElementById('maxQueueMessages');
    const enableMessageMerging = document.getElementById('enableMessageMerging');
    const showTokenUsage = document.getElementById('showTokenUsage');
    const audioAttachmentResponse = document.getElementById('audioAttachmentResponse');
    
    if (!chatDelaySeconds || !maxQueueMessages || !enableMessageMerging || !showTokenUsage ||
        !audioAttachmentResponse) {
        showAlert('ไม่พบฟอร์มการตั้งค่าแชท', 'danger');
        return;
    }

    const audioResponseValue = audioAttachmentResponse.value.trim();
    const normalizedAudioResponse = audioResponseValue || DEFAULT_AUDIO_ATTACHMENT_RESPONSE;

    if (normalizedAudioResponse.length > 1000) {
        showAlert('ข้อความตอบกลับไฟล์เสียงต้องไม่เกิน 1000 ตัวอักษร', 'danger');
        return;
    }
    
    const settings = {
        chatDelaySeconds: parseInt(chatDelaySeconds.value),
        maxQueueMessages: parseInt(maxQueueMessages.value),
        enableMessageMerging: enableMessageMerging.checked,
        showTokenUsage: showTokenUsage.checked,
        audioAttachmentResponse: normalizedAudioResponse
    };

    try {
        const response = await fetch('/api/settings/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            showAlert('บันทึกการตั้งค่าแชทเรียบร้อยแล้ว', 'success');
            await loadSettings({ tabId: getActiveSettingsTabId(), useCacheFirst: true });
        } else {
            showAlert('ไม่สามารถบันทึกการตั้งค่าแชทได้', 'danger');
        }
    } catch (error) {
        console.error('Error saving chat settings:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า', 'danger');
    }
}

// Save AI settings
async function saveAISettings() {
    const textModel = document.getElementById('textModel');
    const visionModel = document.getElementById('visionModel');
    const maxImagesPerMessage = document.getElementById('maxImagesPerMessage');
    const defaultInstruction = document.getElementById('defaultInstruction');
    
    if (!textModel || !visionModel || !maxImagesPerMessage || !defaultInstruction) {
        showAlert('ไม่พบฟอร์มการตั้งค่า AI', 'danger');
        return;
    }
    
    const settings = {
        textModel: textModel.value,
        visionModel: visionModel.value,
        maxImagesPerMessage: parseInt(maxImagesPerMessage.value),
        defaultInstruction: defaultInstruction.value
    };

    try {
        const response = await fetch('/api/settings/ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            showAlert('บันทึกการตั้งค่า AI เรียบร้อยแล้ว', 'success');
            await loadSettings({ tabId: getActiveSettingsTabId(), useCacheFirst: true });
        } else {
            showAlert('ไม่สามารถบันทึกการตั้งค่า AI ได้', 'danger');
        }
    } catch (error) {
        console.error('Error saving AI settings:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า', 'danger');
    }
}

// Save system settings
async function saveSystemSettings() {
    const aiEnabled = document.getElementById('aiEnabled');
    const enableChatHistory = document.getElementById('enableChatHistory');
    const enableAdminNotifications = document.getElementById('enableAdminNotifications');
    const systemMode = document.getElementById('systemMode');
    
    if (!aiEnabled || !enableChatHistory || !enableAdminNotifications || !systemMode) {
        showAlert('ไม่พบฟอร์มการตั้งค่าระบบ', 'danger');
        return;
    }
    
    const settings = {
        aiEnabled: aiEnabled.checked,
        enableChatHistory: enableChatHistory.checked,
        enableAdminNotifications: enableAdminNotifications.checked,
        systemMode: systemMode.value
    };

    try {
        const response = await fetch('/api/settings/system', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            showAlert('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success');
            await loadSettings({ tabId: getActiveSettingsTabId(), useCacheFirst: true });
        } else {
            showAlert('ไม่สามารถบันทึกการตั้งค่าระบบได้', 'danger');
        }
    } catch (error) {
        console.error('Error saving system settings:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า', 'danger');
    }
}

// Save filter settings
async function saveFilterSettings() {
    const enableMessageFiltering = document.getElementById('enableMessageFiltering');
    const hiddenWords = document.getElementById('hiddenWords');
    const replacementText = document.getElementById('replacementText');
    const enableStrictFiltering = document.getElementById('enableStrictFiltering');
    
    if (!enableMessageFiltering || !hiddenWords || !replacementText || !enableStrictFiltering) {
        showAlert('ไม่พบฟอร์มการตั้งค่าการกรอง', 'danger');
        return;
    }
    
    const settings = {
        enableMessageFiltering: enableMessageFiltering.checked,
        hiddenWords: hiddenWords.value,
        replacementText: replacementText.value || '[ข้อความถูกซ่อน]',
        enableStrictFiltering: enableStrictFiltering.checked
    };

    try {
        const response = await fetch('/api/settings/filter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            showAlert('บันทึกการตั้งค่าการกรองเรียบร้อยแล้ว', 'success');
            await loadSettings({ tabId: getActiveSettingsTabId(), useCacheFirst: true });
        } else {
            showAlert('ไม่สามารถบันทึกการตั้งค่าการกรองได้', 'danger');
        }
    } catch (error) {
        console.error('Error saving filter settings:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า', 'danger');
    }
}

// Test filtering function
async function testFiltering() {
    const testMessage = document.getElementById('testMessage');
    if (!testMessage || !testMessage.value.trim()) {
        showAlert('กรุณาใส่ข้อความที่ต้องการทดสอบ', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/filter/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: testMessage.value })
        });

        if (response.ok) {
            const result = await response.json();
            const testResult = document.getElementById('testResult');
            if (testResult) {
                testResult.innerHTML = `
                    <strong>ผลการทดสอบ:</strong><br>
                    <strong>ข้อความต้นฉบับ:</strong> ${testMessage.value}<br>
                    <strong>ข้อความหลังกรอง:</strong> ${result.filteredMessage}<br>
                    <strong>คำที่ถูกซ่อน:</strong> ${result.hiddenWords.length > 0 ? result.hiddenWords.join(', ') : 'ไม่มี'}
                `;
                testResult.style.display = 'block';
            }
        } else {
            showAlert('ไม่สามารถทดสอบการกรองได้', 'danger');
        }
    } catch (error) {
        console.error('Error testing filter:', error);
        showAlert('เกิดข้อผิดพลาดในการทดสอบการกรอง', 'danger');
    }
}

// Update hidden words count
function updateHiddenWordsCount() {
    const hiddenWordsElement = document.getElementById('hiddenWords');
    const hiddenWordsCountElement = document.getElementById('hiddenWordsCount');
    
    if (!hiddenWordsElement || !hiddenWordsCountElement) {
        return;
    }
    
    const hiddenWordsText = hiddenWordsElement.value;
    const words = hiddenWordsText.split('\n').filter(word => word.trim() !== '');
    hiddenWordsCountElement.textContent = words.length;
}

const ALERT_ICON_MAP = {
    success: 'circle-check',
    danger: 'triangle-exclamation',
    warning: 'circle-exclamation',
    info: 'circle-info'
};

const ALERT_CLASS_MAP = {
    success: 'alert-toast-success',
    danger: 'alert-toast-danger',
    warning: 'alert-toast-warning',
    info: 'alert-toast-info'
};

function ensureAlertToastContainer() {
    let container = document.getElementById('alertToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'alertToastContainer';
        container.className = 'alert-toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }
    return container;
}

function createAlertToastElement(type, message) {
    const normalizedType = ALERT_CLASS_MAP[type] ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `alert-toast ${ALERT_CLASS_MAP[normalizedType]}`;
    toast.setAttribute('role', 'alert');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'alert-toast-icon';
    iconSpan.innerHTML = `<i class="fas fa-${ALERT_ICON_MAP[normalizedType] || ALERT_ICON_MAP.info}"></i>`;

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

    return { toast, closeBtn };
}

// Show alert message
function showAlert(message, type = 'info') {
    const container = ensureAlertToastContainer();
    const { toast, closeBtn } = createAlertToastElement(type, message);

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const hideToast = () => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
            toast.remove();
        }, 220);
    };

    const timeoutId = setTimeout(hideToast, 5000);

    closeBtn.addEventListener('click', () => {
        clearTimeout(timeoutId);
        hideToast();
    });
}

function setInstructionLibraryCache(libraries) {
    instructionLibraryCache = Array.isArray(libraries) ? [...libraries] : [];
    if (activeSettingsRequestId > latestInstructionRequestId) {
        latestInstructionRequestId = activeSettingsRequestId;
    }
}

function setLineBotCache(bots) {
    lineBotCache = Array.isArray(bots) ? [...bots] : [];
    if (activeSettingsRequestId > latestLineBotRequestId) {
        latestLineBotRequestId = activeSettingsRequestId;
    }
}

function setFacebookBotCache(bots) {
    facebookBotCache = Array.isArray(bots) ? [...bots] : [];
    if (activeSettingsRequestId > latestFacebookRequestId) {
        latestFacebookRequestId = activeSettingsRequestId;
    }
}

// Export functions for use in other modules
window.adminSettings = {
    loadSettings,
    saveChatSettings,
    saveAISettings,
    saveSystemSettings,
    saveFilterSettings,
    testFiltering,
    showAlert,
    updateHiddenWordsCount,
    setInstructionLibraryCache,
    setLineBotCache,
    setFacebookBotCache
};
