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
                    <span class="status-pill ${bot.status === 'active' ? 'active' : 'inactive'}"><span class="dot"></span>${bot.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}</span>
                </div>
                <div class="bot-meta-row">
                    <span class="meta-chip"><i class="fas fa-microchip"></i>${escapeHtml(bot.aiModel || 'gpt-5')}</span>
                    <span class="meta-chip"><i class="far fa-clock"></i>${formatBotUpdatedAt(bot.updatedAt)}</span>
                </div>
                ${buildInstructionInlineRow(bot, 'line')}
                ${buildCollectionInlineRow(bot, 'line')}
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
                    <span class="status-pill ${bot.status === 'active' ? 'active' : 'inactive'}"><span class="dot"></span>${bot.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}</span>
                </div>
                <div class="bot-meta-row">
                    <span class="meta-chip"><i class="fas fa-microchip"></i>${escapeHtml(bot.aiModel || 'gpt-5')}</span>
                    <span class="meta-chip"><i class="far fa-id-card"></i>${escapeHtml(bot.pageId || 'N/A')}</span>
                    <span class="meta-chip"><i class="far fa-clock"></i>${formatBotUpdatedAt(bot.updatedAt)}</span>
                </div>
                ${buildInstructionInlineRow(bot, 'facebook')}
                ${buildCollectionInlineRow(bot, 'facebook')}
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
        isDefault: document.getElementById('lineBotDefault').checked
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
        isDefault: document.getElementById('facebookBotDefault').checked
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
        setCheckboxValue('enableAdminNotifications', settings.enableAdminNotifications ?? true);
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
        enableAdminNotifications: getCheckboxValue('enableAdminNotifications'),
        systemMode: getInputValue('systemMode')
    };

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

    // Modal Save Buttons
    const saveLineBtn = document.getElementById('saveLineBotBtn');
    if (saveLineBtn) saveLineBtn.addEventListener('click', saveLineBot);

    const saveFbBtn = document.getElementById('saveFacebookBotBtn');
    if (saveFbBtn) saveFbBtn.addEventListener('click', saveFacebookBot);

    document.addEventListener('change', handleInstructionSelectChange, true);
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

    return `
        <div class="bot-inline-row">
            <span class="inline-label"><i class="fas fa-book"></i> Instruction</span>
            <div class="inline-control">
                <select class="form-select form-select-sm instruction-select"
                    data-bot-type="${botType}"
                    data-bot-id="${bot._id}"
                    data-previous-value="${selectedKey}"
                    aria-label="เลือก Instruction สำหรับบอท">
                    ${options}
                </select>
                <span class="instruction-chip ${selectedKey ? '' : 'chip-muted'}">ใช้: ${escapeHtml(instructionLabel)}</span>
            </div>
        </div>
    `;
}

function buildCollectionInlineRow(bot, botType) {
    const collectionCount = Array.isArray(bot.selectedImageCollections) ? bot.selectedImageCollections.length : 0;
    const summary = collectionCount > 0 ? `${collectionCount} ชุด` : 'ทุกภาพ';

    return `
        <div class="bot-inline-row">
            <span class="inline-label"><i class="fas fa-images"></i> แกลเลอรี</span>
            <div class="inline-control">
                <span class="instruction-chip chip-muted">ใช้: ${escapeHtml(summary)}</span>
                <button class="btn-ghost-sm" type="button" onclick="window.imageCollectionsManager && window.imageCollectionsManager.openBotImageCollectionsModal && window.imageCollectionsManager.openBotImageCollectionsModal('${botType}', '${bot._id}')">เปลี่ยน</button>
            </div>
        </div>
    `;
}

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
