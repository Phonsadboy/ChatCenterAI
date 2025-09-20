// Admin Settings JavaScript
// Global variables
let currentSettings = {};
let currentBotId = null;
let currentBotType = null; // 'line' or 'facebook'
let currentBotInstructions = [];
let availableLibraries = [];

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
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
            // Refresh settings when tab changes
            loadSettings();
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

// Load current settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        if (response.ok) {
            currentSettings = await response.json();
            populateSettings();
            await loadInstructionOptions();
        } else {
            showAlert('ไม่สามารถโหลดการตั้งค่าได้', 'danger');
        }

        // โหลดข้อมูล AI Model ของ Line Bot
        await loadLineBotAiModelInfo();

        // โหลดข้อมูล Facebook Bot
        await loadFacebookBotSettings();

    } catch (error) {
        console.error('Error loading settings:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดการตั้งค่า', 'danger');
    }
}

async function loadInstructionOptions() {
    try {
        const response = await fetch('/api/instructions/library');
        const select = document.getElementById('defaultInstruction');
        if (!select) return;
        if (response.ok) {
            const result = await response.json();
            select.innerHTML = '<option value="">ไม่เลือก</option>';
            (result.libraries || []).forEach(lib => {
                const opt = document.createElement('option');
                opt.value = lib.date;
                opt.textContent = lib.name || lib.displayDate;
                select.appendChild(opt);
            });
            if (currentSettings.defaultInstruction) {
                select.value = currentSettings.defaultInstruction;
            }
        }
    } catch (error) {
        console.error('Error loading instruction libraries:', error);
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
        if (chatDelayInput) chatDelayInput.value = 5;
        if (currentChatDelay) currentChatDelay.textContent = 5;
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
    
    if (!chatDelaySeconds || !maxQueueMessages || !enableMessageMerging || !showTokenUsage) {
        showAlert('ไม่พบฟอร์มการตั้งค่าแชท', 'danger');
        return;
    }
    
    const settings = {
        chatDelaySeconds: parseInt(chatDelaySeconds.value),
        maxQueueMessages: parseInt(maxQueueMessages.value),
        enableMessageMerging: enableMessageMerging.checked,
        showTokenUsage: showTokenUsage.checked
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
            await loadSettings(); // Reload settings
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
            await loadSettings(); // Reload settings
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
            await loadSettings(); // Reload settings
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
            await loadSettings(); // Reload settings
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

// Show alert message
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;
    
    const alertId = 'alert-' + Date.now();
    
    const alertHtml = `
        <div class="alert alert-${type} alert-custom alert-dismissible fade show" id="${alertId}" role="alert">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    alertContainer.innerHTML = alertHtml;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        const alert = document.getElementById(alertId);
        if (alert) {
            alert.remove();
        }
    }, 5000);
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
    updateHiddenWordsCount
};
