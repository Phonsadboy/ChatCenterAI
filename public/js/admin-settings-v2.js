/**
 * Admin Settings V2 JavaScript
 * Handles all logic for the redesigned settings page.
 */

document.addEventListener('DOMContentLoaded', function () {
    initNavigation();
    loadAllSettings();
    setupEventListeners();
});

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
                loadImageCollections();
            }
        });
    });
}

// --- Data Loading ---
async function loadAllSettings() {
    try {
        await Promise.all([
            loadBotSettings(),
            loadChatSettings(),
            loadSystemSettings(),
            loadSecuritySettings(),
            loadImageCollections()
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
        <div class="bot-item">
            <div class="bot-icon line"><i class="fab fa-line"></i></div>
            <div class="bot-info">
                <div class="bot-name">
                    ${bot.name}
                    ${bot.isDefault ? '<span class="badge bg-primary-soft text-primary ms-2" style="font-size:0.7rem">ค่าเริ่มต้น</span>' : ''}
                </div>
                <div class="bot-meta">
                    <span class="status-badge ${bot.status === 'active' ? 'active' : 'inactive'}">
                        <span class="status-dot"></span>${bot.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                    <span class="ms-2 text-muted-v2">Model: ${bot.aiModel || 'gpt-5'}</span>
                </div>
            </div>
            <div class="bot-actions">
                <button class="btn-v2 btn-v2-secondary btn-v2-sm" onclick="openEditLineBotModal('${bot._id}')">
                    <i class="fas fa-edit"></i> แก้ไข
                </button>
                <div class="form-check form-switch ms-2">
                    <input class="form-check-input" type="checkbox" role="switch" 
                        ${bot.status === 'active' ? 'checked' : ''} 
                        onchange="toggleBotStatus('line', '${bot._id}', this.checked)">
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
        <div class="bot-item">
            <div class="bot-icon facebook"><i class="fab fa-facebook-f"></i></div>
            <div class="bot-info">
                <div class="bot-name">
                    ${bot.name}
                    ${bot.isDefault ? '<span class="badge bg-primary-soft text-primary ms-2" style="font-size:0.7rem">ค่าเริ่มต้น</span>' : ''}
                </div>
                <div class="bot-meta">
                    <span class="status-badge ${bot.status === 'active' ? 'active' : 'inactive'}">
                        <span class="status-dot"></span>${bot.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                    <span class="ms-2 text-muted-v2">Page ID: ${bot.pageId || 'N/A'}</span>
                </div>
            </div>
            <div class="bot-actions">
                <button class="btn-v2 btn-v2-secondary btn-v2-sm" onclick="openEditFacebookBotModal('${bot._id}')">
                    <i class="fas fa-edit"></i> แก้ไข
                </button>
                <div class="form-check form-switch ms-2">
                    <input class="form-check-input" type="checkbox" role="switch" 
                        ${bot.status === 'active' ? 'checked' : ''} 
                        onchange="toggleBotStatus('facebook', '${bot._id}', this.checked)">
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
    document.getElementById('lineBotId').value = '';
    const modal = new bootstrap.Modal(document.getElementById('lineBotModal'));
    modal.show();
};

window.openEditLineBotModal = async function (id) {
    try {
        const res = await fetch(`/api/line-bots/${id}`);
        const bot = await res.json();

        document.getElementById('lineBotId').value = bot._id;
        document.getElementById('lineBotName').value = bot.name;
        document.getElementById('lineBotDescription').value = bot.description || '';
        document.getElementById('channelAccessToken').value = bot.channelAccessToken;
        document.getElementById('channelSecret').value = bot.channelSecret;
        document.getElementById('lineWebhookUrl').value = bot.webhookUrl || ''; // Assuming ID matches existing modal

        // Handle checkboxes/selects if they exist in the partial
        const statusSelect = document.getElementById('lineBotStatus');
        if (statusSelect) statusSelect.value = bot.status;

        const aiModelSelect = document.getElementById('lineBotAIModel');
        if (aiModelSelect) aiModelSelect.value = bot.aiModel;

        const defaultCheck = document.getElementById('lineBotIsDefault');
        if (defaultCheck) defaultCheck.checked = bot.isDefault;

        const modal = new bootstrap.Modal(document.getElementById('lineBotModal'));
        modal.show();
    } catch (error) {
        console.error('Error fetching bot details:', error);
        showToast('ไม่สามารถโหลดข้อมูลบอทได้', 'danger');
    }
};

async function saveLineBot() {
    const form = document.getElementById('lineBotForm');
    const formData = new FormData(form);
    const botId = document.getElementById('lineBotId').value;

    const botData = {
        name: document.getElementById('lineBotName').value,
        description: document.getElementById('lineBotDescription').value,
        channelAccessToken: document.getElementById('channelAccessToken').value,
        channelSecret: document.getElementById('channelSecret').value,
        webhookUrl: document.getElementById('lineWebhookUrl').value,
        status: document.getElementById('lineBotStatus').value,
        aiModel: document.getElementById('lineBotAIModel').value,
        isDefault: document.getElementById('lineBotIsDefault').checked
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
            const modalEl = document.getElementById('lineBotModal');
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
    document.getElementById('facebookBotId').value = '';
    const modal = new bootstrap.Modal(document.getElementById('facebookBotModal'));
    modal.show();
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

        const aiModelSelect = document.getElementById('facebookBotAIModel');
        if (aiModelSelect) aiModelSelect.value = bot.aiModel;

        const defaultCheck = document.getElementById('facebookBotIsDefault');
        if (defaultCheck) defaultCheck.checked = bot.isDefault;

        const modal = new bootstrap.Modal(document.getElementById('facebookBotModal'));
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
        aiModel: document.getElementById('facebookBotAIModel').value,
        isDefault: document.getElementById('facebookBotIsDefault').checked
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
            const modalEl = document.getElementById('facebookBotModal');
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

// --- Image Collections ---
async function loadImageCollections() {
    const list = document.getElementById('image-collections-list');
    if (!list) return;

    try {
        const res = await fetch('/api/image-collections');
        const collections = await res.json();

        if (collections.length === 0) {
            list.innerHTML = '<div class="col-12 text-center py-5 text-muted-v2">ยังไม่มีคลังรูปภาพ</div>';
            return;
        }

        list.innerHTML = collections.map(col => `
            <div class="image-item" onclick="alert('ฟีเจอร์จัดการรูปภาพในคลังจะเปิดให้ใช้งานเร็วๆ นี้')">
                <div class="ratio ratio-1x1 bg-light d-flex align-items-center justify-content-center border rounded">
                     <i class="fas fa-folder fa-3x text-secondary"></i>
                </div>
                <div class="mt-2 text-center small fw-bold text-truncate">${col.name}</div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading collections:', error);
        list.innerHTML = '<div class="col-12 text-center text-danger">โหลดข้อมูลไม่สำเร็จ</div>';
    }
}

window.openCreateCollectionModal = function () {
    const form = document.getElementById('imageCollectionForm');
    if (form) form.reset();
    document.getElementById('imageCollectionId').value = '';
    const modal = new bootstrap.Modal(document.getElementById('imageCollectionModal'));
    modal.show();
};

async function saveImageCollection() {
    const name = document.getElementById('imageCollectionName').value;
    const description = document.getElementById('imageCollectionDescription').value;

    if (!name) {
        showToast('กรุณาระบุชื่อคลังรูปภาพ', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/image-collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, images: [] })
        });

        if (res.ok) {
            showToast('สร้างคลังรูปภาพเรียบร้อยแล้ว', 'success');
            const modal = bootstrap.Modal.getInstance(document.getElementById('imageCollectionModal'));
            modal.hide();
            loadImageCollections();
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('สร้างคลังรูปภาพไม่สำเร็จ', 'danger');
    }
}

// --- Utilities ---
function setupEventListeners() {
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

    const saveColBtn = document.getElementById('saveImageCollectionBtn');
    if (saveColBtn) saveColBtn.addEventListener('click', saveImageCollection);
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
