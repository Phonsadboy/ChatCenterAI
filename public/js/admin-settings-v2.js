/**
 * Admin Settings V2 JavaScript
 * Handles all logic for the redesigned settings page.
 */

const INSTRUCTION_SOURCE = { V2: 'v2', LEGACY: 'legacy' };
let instructionLibraries = [];

document.addEventListener('DOMContentLoaded', function () {
    initNavigation();
    loadAllSettings();
    setupEventListeners();
    showLegacySettingsNotice();
    initSidebarScrollHint();
});

// Provide a global alert helper for modules that expect showAlert
function showAlert(message, type = 'info') {
    showToast(message, type);
}
window.showAlert = showAlert;

// --- Navigation ---
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item-v2');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('href').substring(1);

            // Update Nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update Content
            sections.forEach(section => {
                if (section.id === targetId) {
                    section.classList.remove('d-none');
                } else {
                    section.classList.add('d-none');
                }
            });

            // If switching to specific tabs that need refresh
            if (targetId === 'bot-settings') {
                loadBotSettings();
            } else if (targetId === 'image-collections') {
                if (window.imageCollectionsManager?.refreshAll) {
                    window.imageCollectionsManager.refreshAll();
                }
            }
        });
    });
}

// --- Data Loading ---
async function loadAllSettings() {
    try {
        await loadInstructionLibraries();
        await Promise.all([
            loadBotSettings(),
            loadChatSettings(),
            loadSystemSettings(),
            loadSecuritySettings(),
            window.imageCollectionsManager?.refreshAll?.()
        ]);
        console.log('All settings loaded');
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('เกิดข้อผิดพลาดในการโหลดการตั้งค่า', 'danger');
    }
}

// --- Bot Management ---
async function loadBotSettings() {
    const lineContainer = document.getElementById('line-bots-list');
    const fbContainer = document.getElementById('facebook-bots-list');

    if (lineContainer) lineContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด Line Bots...</div>';
    if (fbContainer) fbContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด Facebook Bots...</div>';

    try {
        if (instructionLibraries.length === 0) {
            await loadInstructionLibraries();
        }

        const [lineRes, fbRes] = await Promise.all([
            fetch('/api/line-bots'),
            fetch('/api/facebook-bots')
        ]);

        const lineBots = await lineRes.json();
        const fbBots = await fbRes.json();

        renderLineBots(lineBots);
        renderFacebookBots(fbBots);
    } catch (error) {
        console.error('Error loading bots:', error);
        if (lineContainer) lineContainer.innerHTML = '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
        if (fbContainer) fbContainer.innerHTML = '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
    }
}

function renderLineBots(bots) {
    const container = document.getElementById('line-bots-list');
    if (!container) return;

    if (bots.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted-v2">ยังไม่มีการตั้งค่า Line Bot</div>';
        return;
    }

    container.innerHTML = bots.map(bot => `
        <div class="bot-item-compact">
            <div class="bot-channel line"><i class="fab fa-line"></i></div>
            <div class="bot-main">
                <div class="bot-header">
                    <div class="bot-title">
                        <span class="bot-name">${escapeHtml(bot.name)}</span>
                        ${bot.isDefault ? '<span class="badge badge-default">ค่าเริ่มต้น</span>' : ''}
                    </div>
                </div>
                <div class="bot-subtext">
                    Model: ${escapeHtml(bot.aiModel || 'gpt-5')}
                    • API: ${bot.aiConfig?.apiMode === 'chat' ? 'Chat' : 'Responses'}
                    • อัปเดต: ${formatBotUpdatedAt(bot.updatedAt)}
                </div>
                ${buildBotInlineControls(bot, 'line')}
            </div>
            <div class="bot-actions-compact">
                <label class="toggle-switch mb-0">
                    <input type="checkbox" ${bot.status === 'active' ? 'checked' : ''} onchange="toggleBotStatus('line', '${bot._id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <div class="actions-stack">
                    <button class="btn-ghost-sm" title="แก้ไข" onclick="openEditLineBotModal('${bot._id}')"><i class="fas fa-edit"></i></button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderFacebookBots(bots) {
    const container = document.getElementById('facebook-bots-list');
    if (!container) return;

    if (bots.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted-v2">ยังไม่มีการตั้งค่า Facebook Bot</div>';
        return;
    }

    container.innerHTML = bots.map(bot => `
        <div class="bot-item-compact">
            <div class="bot-channel facebook"><i class="fab fa-facebook-f"></i></div>
            <div class="bot-main">
                <div class="bot-header">
                    <div class="bot-title">
                        <span class="bot-name">${escapeHtml(bot.name)}</span>
                        ${bot.isDefault ? '<span class="badge badge-default">ค่าเริ่มต้น</span>' : ''}
                    </div>
                </div>
                <div class="bot-subtext">
                    Model: ${escapeHtml(bot.aiModel || 'gpt-5')}
                    • API: ${bot.aiConfig?.apiMode === 'chat' ? 'Chat' : 'Responses'}
                    • Page: ${escapeHtml(bot.pageId || 'N/A')}
                </div>
                ${buildBotInlineControls(bot, 'facebook')}
            </div>
            <div class="bot-actions-compact">
                <label class="toggle-switch mb-0">
                    <input type="checkbox" ${bot.status === 'active' ? 'checked' : ''} onchange="toggleBotStatus('facebook', '${bot._id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <div class="actions-stack">
                    <button class="btn-ghost-sm" title="แก้ไข" onclick="openEditFacebookBotModal('${bot._id}')"><i class="fas fa-edit"></i></button>
                </div>
            </div>
        </div>
    `).join('');
}

async function toggleBotStatus(type, id, isActive) {
    const endpoint = type === 'line' ? `/api/line-bots/${id}` : `/api/facebook-bots/${id}`;

    try {
        const getRes = await fetch(endpoint);
        const botData = await getRes.json();

        botData.status = isActive ? 'active' : 'inactive';
        delete botData._id;

        const updateRes = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });

        if (updateRes.ok) {
            showToast(`${type === 'line' ? 'Line' : 'Facebook'} Bot ${isActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'}`, 'success');
            loadBotSettings();
        } else {
            throw new Error('Update failed');
        }
    } catch (error) {
        console.error('Error toggling bot status:', error);
        showToast('ไม่สามารถอัปเดตสถานะบอทได้', 'danger');
        loadBotSettings();
    }
}

// --- Modal Logic for Bots ---

// Line Bot
window.openAddLineBotModal = function () {
    const form = document.getElementById('lineBotForm');
    if (form) form.reset();
    const idInput = document.getElementById('lineBotId');
    if (idInput) idInput.value = '';
    setAiConfigUI('line', defaultAiConfig);
    const collapseEl = document.getElementById('lineBotAiParams');
    if (collapseEl && collapseEl.classList.contains('show')) {
        const collapseInstance = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        collapseInstance.hide();
    }

    const modalEl = document.getElementById('addLineBotModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    } else {
        console.error('Modal element #addLineBotModal not found');
    }
};

window.openEditLineBotModal = async function (id) {
    try {
        const res = await fetch(`/api/line-bots/${id}`);
        const bot = await res.json();

        document.getElementById('lineBotId').value = bot._id;
        document.getElementById('lineBotName').value = bot.name;
        document.getElementById('lineBotDescription').value = bot.description || '';
        document.getElementById('lineChannelAccessToken').value = bot.channelAccessToken; // Corrected ID
        document.getElementById('lineChannelSecret').value = bot.channelSecret; // Corrected ID
        document.getElementById('lineWebhookUrl').value = bot.webhookUrl || '';

        // Handle checkboxes/selects if they exist in the partial
        const statusSelect = document.getElementById('lineBotStatus');
        if (statusSelect) statusSelect.value = bot.status;

        const aiModelSelect = document.getElementById('lineBotAiModel'); // Corrected ID (case sensitive check)
        if (aiModelSelect) aiModelSelect.value = bot.aiModel;

        const defaultCheck = document.getElementById('lineBotDefault'); // Corrected ID
        if (defaultCheck) defaultCheck.checked = bot.isDefault;

        setAiConfigUI('line', bot.aiConfig || defaultAiConfig);

        const modalEl = document.getElementById('addLineBotModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    } catch (error) {
        console.error('Error fetching bot details:', error);
        showToast('ไม่สามารถโหลดข้อมูลบอทได้', 'danger');
    }
};

async function saveLineBot() {
    const form = document.getElementById('lineBotForm');
    const formData = new FormData(form); // Use FormData to get values if preferred, or manual getElementById
    const botId = document.getElementById('lineBotId').value;

    // Manual collection to match IDs in partial
    const botData = {
        name: document.getElementById('lineBotName').value,
        description: document.getElementById('lineBotDescription').value,
        channelAccessToken: document.getElementById('lineChannelAccessToken').value,
        channelSecret: document.getElementById('lineChannelSecret').value,
        webhookUrl: document.getElementById('lineWebhookUrl').value,
        status: document.getElementById('lineBotStatus').value,
        aiModel: document.getElementById('lineBotAiModel').value,
        isDefault: document.getElementById('lineBotDefault').checked,
        aiConfig: readAiConfigFromUI('line')
    };

    const url = botId ? `/api/line-bots/${botId}` : '/api/line-bots';
    const method = botId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });

        if (res.ok) {
            showToast('บันทึกข้อมูล Line Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addLineBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            loadBotSettings();
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        console.error('Error saving bot:', error);
        showToast('บันทึกข้อมูลไม่สำเร็จ', 'danger');
    }
}

// Facebook Bot
window.openAddFacebookBotModal = function () {
    const form = document.getElementById('facebookBotForm');
    if (form) form.reset();

    const idInput = document.getElementById('facebookBotId');
    if (idInput) idInput.value = '';

    const deleteBtn = document.getElementById('deleteFacebookBotBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    const verifiedToggle = document.getElementById('fbVerifiedToggle');
    if (verifiedToggle) verifiedToggle.checked = false;
    setAiConfigUI('facebook', defaultAiConfig);
    const fbCollapseEl = document.getElementById('facebookBotAiParams');
    if (fbCollapseEl && fbCollapseEl.classList.contains('show')) {
        const collapseInstance = bootstrap.Collapse.getOrCreateInstance(fbCollapseEl, { toggle: false });
        collapseInstance.hide();
    }

    const title = document.getElementById('addFacebookBotModalLabel');
    if (title) title.innerHTML = '<i class="fab fa-facebook me-2"></i>เพิ่ม Facebook Bot ใหม่';

    const modalEl = document.getElementById('addFacebookBotModal');
    if (!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // ขอ webhook/verify token ล่วงหน้าเหมือนหน้าเก่า
    (async () => {
        try {
            const res = await fetch('/api/facebook-bots/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'ไม่สามารถเตรียมข้อมูล Webhook ได้');

            if (idInput) idInput.value = data.id;
            const webhookInput = document.getElementById('facebookWebhookUrl');
            const verifyInput = document.getElementById('facebookVerifyToken');
            if (webhookInput) webhookInput.value = data.webhookUrl || '';
            if (verifyInput) verifyInput.value = data.verifyToken || '';
            showToast('สร้าง Webhook URL และ Verify Token สำเร็จ', 'success');
        } catch (err) {
            console.error('init facebook bot error', err);
            showToast('ไม่สามารถสร้าง Webhook URL / Verify Token ได้', 'danger');
        }
    })();
};

window.openEditFacebookBotModal = async function (id) {
    try {
        const res = await fetch(`/api/facebook-bots/${id}`);
        const bot = await res.json();

        document.getElementById('facebookBotId').value = bot._id;
        document.getElementById('facebookBotName').value = bot.name;
        document.getElementById('facebookBotDescription').value = bot.description || '';
        document.getElementById('facebookPageId').value = bot.pageId;
        document.getElementById('facebookAccessToken').value = bot.accessToken;
        document.getElementById('facebookVerifyToken').value = bot.verifyToken;
        document.getElementById('facebookWebhookUrl').value = bot.webhookUrl || '';

        const aiModelSelect = document.getElementById('facebookBotAiModel'); // Corrected ID
        if (aiModelSelect) aiModelSelect.value = bot.aiModel;

        const defaultCheck = document.getElementById('facebookBotDefault'); // Corrected ID
        if (defaultCheck) defaultCheck.checked = bot.isDefault;

        setAiConfigUI('facebook', bot.aiConfig || defaultAiConfig);

        const title = document.getElementById('addFacebookBotModalLabel');
        if (title) title.innerHTML = '<i class="fab fa-facebook me-2"></i>แก้ไข Facebook Bot';

        const deleteBtn = document.getElementById('deleteFacebookBotBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        const modalEl = document.getElementById('addFacebookBotModal');
        if (!modalEl) return;
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    } catch (error) {
        console.error('Error fetching bot details:', error);
        showToast('ไม่สามารถโหลดข้อมูลบอทได้', 'danger');
    }
};

async function saveFacebookBot() {
    const botId = document.getElementById('facebookBotId').value;

    const botData = {
        name: document.getElementById('facebookBotName').value,
        description: document.getElementById('facebookBotDescription').value,
        pageId: document.getElementById('facebookPageId').value,
        accessToken: document.getElementById('facebookAccessToken').value,
        verifyToken: document.getElementById('facebookVerifyToken').value,
        webhookUrl: document.getElementById('facebookWebhookUrl').value,
        aiModel: document.getElementById('facebookBotAiModel').value,
        isDefault: document.getElementById('facebookBotDefault').checked,
        aiConfig: readAiConfigFromUI('facebook')
    };

    const url = botId ? `/api/facebook-bots/${botId}` : '/api/facebook-bots';
    // Note: Facebook bots usually use POST for both create and update in some implementations, 
    // but standard REST suggests PUT for update. Let's assume standard behavior or check if needed.
    // Based on previous code, it might use specific logic. Let's try standard first.
    // Actually, let's check if the previous code used PUT. Yes, it did.
    const method = botId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });

        if (res.ok) {
            showToast('บันทึกข้อมูล Facebook Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addFacebookBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            loadBotSettings();
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        console.error('Error saving bot:', error);
        showToast('บันทึกข้อมูลไม่สำเร็จ', 'danger');
    }
}

// --- Chat Settings ---
async function loadChatSettings() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();

        setInputValue('chatDelaySeconds', settings.chatDelaySeconds || 0);
        setInputValue('maxQueueMessages', settings.maxQueueMessages || 10);
        setCheckboxValue('enableMessageMerging', settings.enableMessageMerging ?? true);
        setCheckboxValue('showTokenUsage', settings.showTokenUsage ?? false);
        setInputValue('audioAttachmentResponse', settings.audioAttachmentResponse || '');

    } catch (error) {
        console.error('Error loading chat settings:', error);
    }
}

async function saveChatSettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);

    const data = {
        chatDelaySeconds: parseInt(getInputValue('chatDelaySeconds')),
        maxQueueMessages: parseInt(getInputValue('maxQueueMessages')),
        enableMessageMerging: getCheckboxValue('enableMessageMerging'),
        showTokenUsage: getCheckboxValue('showTokenUsage'),
        audioAttachmentResponse: getInputValue('audioAttachmentResponse')
    };

    try {
        const res = await fetch('/api/settings/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('บันทึกการตั้งค่าแชทเรียบร้อยแล้ว', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

// --- System Settings ---
async function loadSystemSettings() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();

        setCheckboxValue('aiEnabled', settings.aiEnabled ?? true);
        setCheckboxValue('enableChatHistory', settings.enableChatHistory ?? true);
        setInputValue('aiHistoryLimit', settings.aiHistoryLimit ?? 20);
        setCheckboxValue('enableAdminNotifications', settings.enableAdminNotifications ?? true);
        setCheckboxValue('showDebugInfo', settings.showDebugInfo ?? false);
        setInputValue('systemMode', settings.systemMode || 'production');

    } catch (error) {
        console.error('Error loading system settings:', error);
    }
}

async function saveSystemSettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);

    const data = {
        aiEnabled: getCheckboxValue('aiEnabled'),
        enableChatHistory: getCheckboxValue('enableChatHistory'),
        aiHistoryLimit: parseInt(getInputValue('aiHistoryLimit'), 10),
        enableAdminNotifications: getCheckboxValue('enableAdminNotifications'),
        showDebugInfo: getCheckboxValue('showDebugInfo'),
        systemMode: getInputValue('systemMode')
    };

    if (Number.isNaN(data.aiHistoryLimit) || data.aiHistoryLimit < 1 || data.aiHistoryLimit > 100) {
        showToast('จำนวนประวัติแชทต้องอยู่ระหว่าง 1-100 ข้อความ', 'danger');
        setLoading(btn, false);
        return;
    }

    try {
        const res = await fetch('/api/settings/system', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

// --- Security Settings ---
async function loadSecuritySettings() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();

        setCheckboxValue('enableMessageFiltering', settings.enableMessageFiltering ?? false);
        setCheckboxValue('enableStrictFiltering', settings.enableStrictFiltering ?? false);
        setInputValue('hiddenWords', settings.hiddenWords || '');
        setInputValue('replacementText', settings.replacementText || '[Hidden]');

    } catch (error) {
        console.error('Error loading security settings:', error);
    }
}

async function saveSecuritySettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);

    const data = {
        enableMessageFiltering: getCheckboxValue('enableMessageFiltering'),
        enableStrictFiltering: getCheckboxValue('enableStrictFiltering'),
        hiddenWords: getInputValue('hiddenWords'),
        replacementText: getInputValue('replacementText')
    };

    try {
        const res = await fetch('/api/settings/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('บันทึกการตั้งค่าความปลอดภัยเรียบร้อยแล้ว', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

// --- Utilities ---
function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshSettingsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadInstructionLibraries()
                .then(() => loadBotSettings());
            loadChatSettings();
            loadSystemSettings();
            loadSecuritySettings();
            if (window.imageCollectionsManager?.refreshAll) {
                window.imageCollectionsManager.refreshAll();
            }
        });
    }

    const chatForm = document.getElementById('chatSettingsForm');
    if (chatForm) chatForm.addEventListener('submit', saveChatSettings);

    const systemForm = document.getElementById('systemSettingsForm');
    if (systemForm) systemForm.addEventListener('submit', saveSystemSettings);

    const securityForm = document.getElementById('securitySettingsForm');
    if (securityForm) securityForm.addEventListener('submit', saveSecuritySettings);

    const lineBotForm = document.getElementById('lineBotForm');
    if (lineBotForm) {
        lineBotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveLineBot();
        });
    }

    const facebookBotForm = document.getElementById('facebookBotForm');
    if (facebookBotForm) {
        facebookBotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveFacebookBot();
        });
    }

    // Modal Save Buttons
    const saveLineBtn = document.getElementById('saveLineBotBtn');
    if (saveLineBtn) saveLineBtn.addEventListener('click', saveLineBot);

    const saveFbBtn = document.getElementById('saveFacebookBotBtn');
    if (saveFbBtn) saveFbBtn.addEventListener('click', saveFacebookBot);

    document.addEventListener('change', handleInstructionSelectChange, true);

    // Passcode Management
    initPasscodeManagement();

    // AI mode toggle in bot modals
    initAiModeListeners();
}

function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function getCheckboxValue(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

function setCheckboxValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = value;
}

function setLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> กำลังบันทึก...';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || 'บันทึก';
        btn.disabled = false;
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3 shadow-sm`;
    toast.style.zIndex = '9999';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- AI Config Helpers ---
const defaultAiConfig = {
    apiMode: 'responses',
    reasoningEffort: '',
    temperature: '',
    topP: '',
    presencePenalty: '',
    frequencyPenalty: ''
};

function isReasoningModel(modelId) {
    if (!modelId || typeof modelId !== 'string') return false;
    const id = modelId.toLowerCase();
    // Models that support reasoning_effort:
    // - o1, o1-mini, o1-preview (OpenAI reasoning models)
    // - o3, o3-mini (OpenAI reasoning models)
    // - gpt-5 (future GPT-5 models)
    // GPT-4, GPT-4.1, GPT-4o do NOT support reasoning_effort
    return id.startsWith('o1') || id.startsWith('o3') || id.startsWith('gpt-5');
}

function parseNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function setRangeValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const valToSet = value === null || value === undefined || value === '' ? el.defaultValue || '' : value;
    el.value = valToSet;
    const label = document.getElementById(`${id}Value`);
    if (label) label.innerText = valToSet === '' ? '—' : valToSet;
}

function attachRangeListener(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        const label = document.getElementById(`${id}Value`);
        if (label) label.innerText = el.value;
    });
}

function applyAiModeVisibility(prefix, apiMode) {
    const mode = apiMode === 'chat' ? 'chat' : 'responses';
    const responsesSection = document.getElementById(`${prefix}BotResponsesParams`);
    const chatSection = document.getElementById(`${prefix}BotChatParams`);
    if (responsesSection) responsesSection.classList.toggle('d-none', mode !== 'responses');
    if (chatSection) chatSection.classList.toggle('d-none', mode !== 'chat');

    updateReasoningVisibility(prefix);
    updateChatSamplingVisibility(prefix);
}

function setAiConfigUI(prefix, config) {
    const cfg = { ...defaultAiConfig, ...(config || {}) };
    const apiMode = cfg.apiMode === 'chat' ? 'chat' : 'responses';

    setInputValue(`${prefix}BotApiMode`, apiMode);
    setInputValue(`${prefix}BotReasoningEffort`, cfg.reasoningEffort ?? '');
    setRangeValue(`${prefix}BotTemperature`, cfg.temperature);
    setRangeValue(`${prefix}BotTopP`, cfg.topP);
    setRangeValue(`${prefix}BotPresencePenalty`, cfg.presencePenalty);
    setRangeValue(`${prefix}BotFrequencyPenalty`, cfg.frequencyPenalty);

    applyAiModeVisibility(prefix, apiMode);
    updateReasoningVisibility(prefix);
}

function readAiConfigFromUI(prefix) {
    const apiModeSelect = document.getElementById(`${prefix}BotApiMode`);
    const apiMode = apiModeSelect && apiModeSelect.value === 'chat' ? 'chat' : 'responses';
    const modelId = getInputValue(`${prefix}BotAiModel`);
    const reasoningModel = isReasoningModel(modelId);

    const config = {
        apiMode
    };

    if (apiMode === 'responses') {
        config.reasoningEffort = getInputValue(`${prefix}BotReasoningEffort`) || '';
        config.temperature = null;
        config.topP = null;
        config.presencePenalty = null;
        config.frequencyPenalty = null;
    } else {
        config.reasoningEffort = '';
        if (reasoningModel) {
            config.temperature = null;
            config.topP = null;
            config.presencePenalty = null;
            config.frequencyPenalty = null;
        } else {
            config.temperature = parseNumberOrNull(getInputValue(`${prefix}BotTemperature`));
            config.topP = parseNumberOrNull(getInputValue(`${prefix}BotTopP`));
            config.presencePenalty = parseNumberOrNull(getInputValue(`${prefix}BotPresencePenalty`));
            config.frequencyPenalty = parseNumberOrNull(getInputValue(`${prefix}BotFrequencyPenalty`));
        }
    }

    return config;
}

function initAiModeListeners() {
    ['line', 'facebook'].forEach(prefix => {
        const select = document.getElementById(`${prefix}BotApiMode`);
        if (select) {
            select.addEventListener('change', (e) => {
                applyAiModeVisibility(prefix, e.target.value);
            });
        }
        ['Temperature', 'TopP', 'PresencePenalty', 'FrequencyPenalty'].forEach(suffix => {
            attachRangeListener(`${prefix}Bot${suffix}`);
        });
        const modelSelect = document.getElementById(`${prefix}BotAiModel`);
        if (modelSelect) {
            modelSelect.addEventListener('change', () => updateReasoningVisibility(prefix));
            modelSelect.addEventListener('change', () => updateChatSamplingVisibility(prefix));
        }
    });
}

function updateReasoningVisibility(prefix) {
    const modelSelect = document.getElementById(`${prefix}BotAiModel`);
    const modelId = modelSelect ? modelSelect.value : '';
    const supported = isReasoningModel(modelId);
    const group = document.getElementById(`${prefix}BotReasoningGroup`);
    const note = document.getElementById(`${prefix}BotReasoningNote`);
    if (group) group.classList.toggle('d-none', !supported);
    if (note) note.classList.toggle('d-none', supported);
    if (!supported) {
        setInputValue(`${prefix}BotReasoningEffort`, '');
    }
}

function updateChatSamplingVisibility(prefix) {
    const modelSelect = document.getElementById(`${prefix}BotAiModel`);
    const modelId = modelSelect ? modelSelect.value : '';
    const apiModeSelect = document.getElementById(`${prefix}BotApiMode`);
    const apiMode = apiModeSelect && apiModeSelect.value === 'chat' ? 'chat' : 'responses';
    const isReasoning = isReasoningModel(modelId);
    const controls = document.getElementById(`${prefix}BotChatControls`);
    const note = document.getElementById(`${prefix}BotChatNote`);

    const hideSampling = apiMode !== 'chat' || isReasoning;
    if (controls) controls.classList.toggle('d-none', hideSampling);
    if (note) note.classList.toggle('d-none', !isReasoning);

    if (hideSampling) {
        setRangeValue(`${prefix}BotTemperature`, '');
        setRangeValue(`${prefix}BotTopP`, '');
        setRangeValue(`${prefix}BotPresencePenalty`, '');
        setRangeValue(`${prefix}BotFrequencyPenalty`, '');
    }
}

function showLegacySettingsNotice() {
    const toast = document.getElementById('legacySettingsToast');
    if (!toast) return;

    ['legacyToastCloseBtn', 'dismissLegacyToast'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => hideLegacySettingsNotice());
        }
    });

    setTimeout(() => {
        toast.classList.add('show');
    }, 300);
}

function hideLegacySettingsNotice() {
    const toast = document.getElementById('legacySettingsToast');
    if (!toast) return;
    toast.classList.remove('show');
}

function initSidebarScrollHint() {
    const sidebar = document.querySelector('.settings-sidebar');
    if (!sidebar) return;
    const navItems = sidebar.querySelectorAll('.nav-item-v2');
    const indicator = document.createElement('div');
    indicator.className = 'sidebar-scroll-hint';
    indicator.innerHTML = '<i class="fas fa-arrows-alt-h me-1"></i>ปัดเพื่อดูเมนู';

    const showHint = () => {
        if (sidebar.scrollWidth > sidebar.clientWidth) {
            sidebar.appendChild(indicator);
            requestAnimationFrame(() => indicator.classList.add('show'));
        }
    };

    const hideHint = () => indicator.classList.remove('show');

    sidebar.addEventListener('scroll', hideHint, { passive: true });
    navItems.forEach(item => item.addEventListener('click', hideHint));

    setTimeout(showHint, 500);
}

// --- Shared helpers ---
function formatBotUpdatedAt(value) {
    if (!value) return 'ไม่ระบุ';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'ไม่ระบุ';
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// --- Instruction selection helpers ---
async function loadInstructionLibraries() {
    try {
        const response = await fetch('/api/instructions/library');
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result?.error || 'ไม่สามารถโหลดคลัง Instructions ได้');
        }
        instructionLibraries = Array.isArray(result.libraries) ? result.libraries : [];
    } catch (error) {
        console.error('Error loading instruction libraries:', error);
        showToast('โหลดรายชื่อ Instruction ไม่สำเร็จ', 'danger');
        instructionLibraries = [];
    }
}

function getInstructionLibraryKey(lib) {
    if (!lib) return '';
    if (lib.source === INSTRUCTION_SOURCE.V2 && lib.instructionId) {
        return `${INSTRUCTION_SOURCE.V2}:${lib.instructionId}`;
    }
    if (lib.date) {
        return `${INSTRUCTION_SOURCE.LEGACY}:${lib.date}`;
    }
    return `${lib.source || 'library'}:${lib.name || ''}`;
}

function getInstructionLibraryLabel(lib) {
    if (!lib) return '';
    const prefix = lib.source === INSTRUCTION_SOURCE.V2 ? '[Instruction Set]' : '[Legacy]';
    const label = lib.name || lib.displayDate || lib.date || lib.instructionId || 'ไม่ระบุ';
    return `${prefix} ${label}`;
}

function buildInstructionInlineRow(bot, botType) {
    const selectedKey = getSelectedInstructionKey(bot);
    const instructionLabel = getInstructionLabelByKey(selectedKey) || 'ไม่เลือก';
    const options = buildInstructionOptions(selectedKey);
    const collectionCount = Array.isArray(bot.selectedImageCollections) ? bot.selectedImageCollections.length : 0;
    const summary = collectionCount > 0 ? `${collectionCount} ชุด` : 'ทุกภาพ';

    return `
        <div class="bot-inline-row compact">
            <div class="inline-control instruction-control">
                <span class="inline-label"><i class="fas fa-book"></i> Inst.</span>
                <select class="form-select form-select-sm instruction-select"
                    data-bot-type="${botType}"
                    data-bot-id="${bot._id}"
                    data-previous-value="${selectedKey}"
                    aria-label="เลือก Instruction สำหรับบอท">
                    ${options}
                </select>
            </div>
            <div class="inline-control">
                <span class="inline-label"><i class="fas fa-images"></i> ภาพ</span>
                <span class="instruction-chip chip-muted slim">ใช้: ${escapeHtml(summary)}</span>
                <button class="btn-ghost-sm btn-ghost-xs" type="button" onclick="window.imageCollectionsManager && window.imageCollectionsManager.openBotImageCollectionsModal && window.imageCollectionsManager.openBotImageCollectionsModal('${botType}', '${bot._id}')">เปลี่ยน</button>
            </div>
            <span class="instruction-chip ${selectedKey ? '' : 'chip-muted'} slim">ใช้: ${escapeHtml(instructionLabel)}</span>
        </div>
    `;
}

// Alias for backwards compatibility usage in markup
const buildBotInlineControls = buildInstructionInlineRow;

function buildInstructionOptions(selectedKey) {
    const options = ['<option value="">— ไม่เลือก —</option>'];
    instructionLibraries.forEach((lib) => {
        const key = getInstructionLibraryKey(lib);
        if (!key) return;
        const label = getInstructionLibraryLabel(lib);
        const isSelected = selectedKey === key ? 'selected' : '';
        options.push(`<option value="${key}" ${isSelected}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
}

function getSelectedInstructionKey(bot) {
    const selections = Array.isArray(bot?.selectedInstructions) ? bot.selectedInstructions : [];
    if (selections.length === 0) return '';
    const first = selections[0];
    if (first && typeof first === 'object' && !Array.isArray(first) && first.instructionId) {
        return `${INSTRUCTION_SOURCE.V2}:${first.instructionId}`;
    }
    if (typeof first === 'string') {
        return `${INSTRUCTION_SOURCE.LEGACY}:${first}`;
    }
    return '';
}

function getInstructionLabelByKey(key) {
    if (!key) return '';
    const lib = instructionLibraries.find((item) => getInstructionLibraryKey(item) === key);
    if (lib) {
        return lib.name || lib.displayDate || lib.instructionId || lib.date || '';
    }
    const value = key.split(':').slice(1).join(':');
    return value || '';
}

function handleInstructionSelectChange(event) {
    const select = event.target;
    if (!select.classList.contains('instruction-select')) return;
    const botType = select.dataset.botType;
    const botId = select.dataset.botId;
    const previousValue = select.dataset.previousValue || '';
    const key = select.value;
    saveInstructionSelection(botType, botId, key, select, previousValue);
}

function buildInstructionPayloadFromKey(key) {
    if (!key) return [];
    const [source, ...rest] = key.split(':');
    const value = rest.join(':');
    if (!value) return [];
    if (source === INSTRUCTION_SOURCE.V2) {
        return [{ instructionId: value }];
    }
    if (source === INSTRUCTION_SOURCE.LEGACY) {
        return [value];
    }
    return [];
}

async function saveInstructionSelection(botType, botId, key, select, previousValue) {
    const payload = buildInstructionPayloadFromKey(key);
    const url =
        botType === 'facebook'
            ? `/api/facebook-bots/${botId}/instructions`
            : `/api/line-bots/${botId}/instructions`;

    select.disabled = true;
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedInstructions: payload })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || 'บันทึกไม่สำเร็จ');
        }
        select.dataset.previousValue = key;
        updateInstructionChip(select, key);
        showToast('อัปเดต Instruction ของบอทแล้ว', 'success');
    } catch (error) {
        console.error('Error saving instruction selection:', error);
        select.value = previousValue;
        updateInstructionChip(select, previousValue);
        showToast('ไม่สามารถบันทึก Instruction ได้', 'danger');
    } finally {
        select.disabled = false;
    }
}

function updateInstructionChip(select, key) {
    const chip = select.closest('.inline-control')?.querySelector('.instruction-chip');
    if (!chip) return;
    const label = getInstructionLabelByKey(key) || 'ไม่เลือก';
    chip.textContent = key ? `ใช้: ${label}` : 'ไม่เลือก';
    chip.classList.toggle('chip-muted', !key);
}


function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// --- Passcode Management ---
let passcodeCache = [];

function isSuperadmin() {
    return Boolean(window.adminAuth?.user?.role === 'superadmin');
}

function isPasscodeFeatureEnabled() {
    return Boolean(window.adminAuth?.requirePasscode);
}

function initPasscodeManagement() {
    if (!isSuperadmin() || !isPasscodeFeatureEnabled()) {
        return;
    }

    const card = document.getElementById('passcodeManagementCard');
    if (card) card.style.display = 'block';

    setupPasscodeEventListeners();
    refreshPasscodeList();
}

function setupPasscodeEventListeners() {
    const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
    const createContainer = document.getElementById('passcodeCreateContainer');
    const createForm = document.getElementById('createPasscodeForm');
    const generateBtn = document.getElementById('generatePasscodeBtn');
    const tableBody = document.getElementById('passcodeTableBody');

    if (toggleBtn && createContainer) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = createContainer.style.display !== 'none';
            createContainer.style.display = isVisible ? 'none' : 'block';
            toggleBtn.innerHTML = isVisible
                ? '<i class="fas fa-plus-circle"></i> สร้างรหัสใหม่'
                : '<i class="fas fa-times-circle"></i> ยกเลิก';
        });
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            const input = document.getElementById('newPasscodeValue');
            if (input) {
                input.value = generateRandomPasscode();
                input.focus();
                input.select();
            }
        });
    }

    if (createForm) {
        createForm.addEventListener('submit', handleCreatePasscode);
    }

    if (tableBody) {
        tableBody.addEventListener('click', handlePasscodeTableClick);
    }
}

function generateRandomPasscode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 8;
    let value = '';
    for (let i = 0; i < length; i++) {
        const index = Math.floor(Math.random() * alphabet.length);
        value += alphabet[index];
    }
    return value.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

async function refreshPasscodeList() {
    if (!isSuperadmin()) return;

    try {
        const response = await fetch('/api/admin-passcodes');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดข้อมูลรหัสผ่านได้');
        }
        const payload = await response.json();
        passcodeCache = Array.isArray(payload.passcodes) ? payload.passcodes : [];
        renderPasscodeTable();
        setPasscodeMessage('', '');
    } catch (error) {
        console.error('[Passcode] load error:', error);
        setPasscodeMessage('danger', error.message || 'ไม่สามารถโหลดข้อมูลรหัสผ่านได้');
    }
}

function renderPasscodeTable() {
    const tbody = document.getElementById('passcodeTableBody');
    if (!tbody) return;

    if (passcodeCache.length === 0) {
        tbody.innerHTML = `
            <tr id="passcodeEmptyState">
                <td colspan="5" class="text-center text-muted py-4">
                    <i class="fas fa-key me-2"></i>ยังไม่มีรหัสสำหรับทีมงาน เริ่มสร้างรหัสชุดแรกได้เลย
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = passcodeCache.map(passcode => {
        const statusClass = passcode.isActive ? 'success' : 'secondary';
        const statusText = passcode.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
        const toggleIcon = passcode.isActive ? 'toggle-on' : 'toggle-off';
        const lastUsed = passcode.lastUsedAt ? new Date(passcode.lastUsedAt).toLocaleDateString('th-TH') : 'ไม่เคยใช้';

        return `
            <tr>
                <td>${escapeHtml(passcode.label)}</td>
                <td><span class="badge bg-${statusClass}">${statusText}</span></td>
                <td>${lastUsed}</td>
                <td>${passcode.usageCount || 0}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-${passcode.isActive ? 'warning' : 'success'}" 
                            data-action="toggle" data-id="${passcode.id}">
                        <i class="fas fa-${toggleIcon}"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                            data-action="delete" data-id="${passcode.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function handlePasscodeTableClick(event) {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');
    if (!id) return;

    if (action === 'toggle') {
        togglePasscodeStatus(id, target);
    } else if (action === 'delete') {
        deletePasscode(id, target);
    }
}

async function togglePasscodeStatus(id, triggerBtn) {
    const passcode = passcodeCache.find(item => item.id === id);
    if (!passcode) return;

    const willActivate = !passcode.isActive;
    const confirmationMessage = willActivate
        ? 'ต้องการเปิดใช้งานรหัสนี้หรือไม่?'
        : 'การปิดรหัสจะทำให้ทีมงานที่ใช้รหัสนี้ไม่สามารถล็อกอินใหม่ได้ ต้องการดำเนินการต่อหรือไม่?';

    if (!confirm(confirmationMessage)) return;

    setLoading(triggerBtn, true);

    try {
        const response = await fetch(`/api/admin-passcodes/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: willActivate })
        });

        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'ปรับสถานะรหัสไม่สำเร็จ');
        }

        passcodeCache = passcodeCache.map(item =>
            item.id === id ? payload.passcode : item
        );
        renderPasscodeTable();
        setPasscodeMessage('success', 'อัปเดตรหัสเรียบร้อยแล้ว');
    } catch (error) {
        console.error('[Passcode] toggle error:', error);
        setPasscodeMessage('danger', error.message || 'ปรับสถานะรหัสไม่สำเร็จ');
    } finally {
        setLoading(triggerBtn, false);
    }
}

async function deletePasscode(id, triggerBtn) {
    if (window.adminAuth?.user?.codeId === id) {
        setPasscodeMessage('danger', 'ไม่สามารถลบรหัสที่คุณกำลังใช้งานอยู่ได้');
        return;
    }

    if (!confirm('ต้องการลบรหัสนี้หรือไม่? เมื่อยืนยันแล้วจะไม่สามารถเรียกคืนได้')) {
        return;
    }

    setLoading(triggerBtn, true);

    try {
        const response = await fetch(`/api/admin-passcodes/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const payload = await response.json();
            throw new Error(payload.error || 'ลบรหัสไม่สำเร็จ');
        }

        passcodeCache = passcodeCache.filter(item => item.id !== id);
        renderPasscodeTable();
        setPasscodeMessage('success', 'ลบรหัสเรียบร้อยแล้ว');
    } catch (error) {
        console.error('[Passcode] delete error:', error);
        setPasscodeMessage('danger', error.message || 'ลบรหัสไม่สำเร็จ');
    } finally {
        setLoading(triggerBtn, false);
    }
}

async function handleCreatePasscode(event) {
    event.preventDefault();

    const labelInput = document.getElementById('newPasscodeLabel');
    const passcodeInput = document.getElementById('newPasscodeValue');
    const submitBtn = document.getElementById('createPasscodeSubmitBtn');

    if (!labelInput || !passcodeInput || !submitBtn) return;

    const label = (labelInput.value || '').trim();
    const passcode = (passcodeInput.value || '').trim();

    if (!label || label.length < 2) {
        setPasscodeMessage('warning', 'กรุณาระบุชื่อรหัสอย่างน้อย 2 ตัวอักษร');
        return;
    }

    if (!passcode || passcode.length < 4) {
        setPasscodeMessage('warning', 'กรุณาระบุรหัสอย่างน้อย 4 ตัวอักษร');
        return;
    }

    setLoading(submitBtn, true);

    try {
        const response = await fetch('/api/admin-passcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, passcode })
        });

        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'ไม่สามารถสร้างรหัสได้');
        }

        labelInput.value = '';
        passcodeInput.value = '';

        const createContainer = document.getElementById('passcodeCreateContainer');
        const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
        if (createContainer) createContainer.style.display = 'none';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-plus-circle"></i> สร้างรหัสใหม่';

        await refreshPasscodeList();
        setPasscodeMessage('success', 'สร้างรหัสใหม่เรียบร้อยแล้ว');
    } catch (error) {
        console.error('[Passcode] create error:', error);
        setPasscodeMessage('danger', error.message || 'ไม่สามารถสร้างรหัสได้');
    } finally {
        setLoading(submitBtn, false);
    }
}

function setPasscodeMessage(type, message) {
    const messageBox = document.getElementById('passcodeMessageBox');
    if (!messageBox) return;

    if (!message) {
        messageBox.classList.add('d-none');
        messageBox.textContent = '';
        return;
    }

    messageBox.classList.remove('d-none', 'alert-info', 'alert-success', 'alert-warning', 'alert-danger');
    messageBox.classList.add(`alert-${type}`);
    messageBox.textContent = message;

    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            messageBox.classList.add('d-none');
        }, 5000);
    }
}
