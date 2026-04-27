/**
 * Admin Settings V2 JavaScript
 * Handles all logic for the redesigned settings page.
 */

const INSTRUCTION_SOURCE = { V2: 'v2', LEGACY: 'legacy' };
let instructionLibraries = [];
let imageCollections = [];
let chatSystemTags = [];
let passcodeInstructionOptions = [];
let passcodeInstructionSelectedIds = [];
const BOT_CHANNELS = ['line', 'facebook', 'instagram', 'whatsapp'];
const BOT_LABELS = {
    line: 'LINE',
    facebook: 'Facebook',
    instagram: 'Instagram',
    whatsapp: 'WhatsApp'
};
const DEFAULT_BOT_MODEL = 'gpt-5.4-mini';
const BOT_MODEL_PRESETS = [
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.2',
    'gpt-5.1',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-5-pro',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'o4-mini',
    'gpt-4o',
    'gpt-4o-mini'
];
let activeBotChannel = 'line';
const botKeywordModalState = {
    botType: '',
    botId: ''
};
const BOT_SETTINGS_PERMISSIONS = ['settings:bot', 'bots:view', 'bots:create', 'bots:update', 'bots:delete', 'bots:manage'];
const IMAGE_COLLECTION_PERMISSIONS = ['settings:image-library', 'image-library:view', 'image-library:manage'];
const SECURITY_SECTION_PERMISSIONS = ['settings:security-filter', 'audit:view', 'filter:test'];
const SETTINGS_SECTION_PERMISSIONS = {
    'bot-settings': BOT_SETTINGS_PERMISSIONS,
    'image-collections': IMAGE_COLLECTION_PERMISSIONS,
    'data-forms': ['settings:data-forms', 'data-forms:view', 'data-forms:manage', 'data-forms:export'],
    'file-library': ['settings:file-library', 'file-assets:view', 'file-assets:manage'],
    'chat-settings': 'settings:chat',
    'order-notifications': ['settings:notifications', 'notifications:view', 'notifications:manage'],
    'system-settings': 'settings:general',
    'security-settings': SECURITY_SECTION_PERMISSIONS,
    'api-keys-settings': ['settings:api-key', 'api-keys:view', 'api-keys:manage']
};

function adminCan(permission) {
    if (Array.isArray(permission)) return permission.some(item => adminCan(item));
    if (!permission) return true;
    const user = window.adminAuth?.user || null;
    if (!user) return true;
    if (user.role === 'superadmin') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

function isSuperadminUser() {
    const user = window.adminAuth?.user || null;
    return !user || user.role === 'superadmin';
}

function canUpdateBots() {
    return adminCan(['settings:bot', 'bots:update', 'bots:manage']);
}

function canEditBotSecrets() {
    return canUpdateBots() && adminCan('bots:secrets');
}

function initSettingsPermissionVisibility() {
    const navItems = Array.from(document.querySelectorAll('.settings-topnav-item[data-section]'));
    const sections = Array.from(document.querySelectorAll('.settings-section'));
    navItems.forEach((item) => {
        const permission = SETTINGS_SECTION_PERMISSIONS[item.dataset.section];
        item.hidden = !adminCan(permission);
    });
    sections.forEach((section) => {
        const permission = SETTINGS_SECTION_PERMISSIONS[section.id];
        section.dataset.permissionHidden = adminCan(permission) ? 'false' : 'true';
        if (!adminCan(permission)) section.classList.add('d-none');
    });
    const chatTagCard = document.getElementById('chatTagSettingsCard');
    if (chatTagCard) chatTagCard.hidden = !adminCan('chat:tags');
    const auditCard = document.getElementById('auditLogsCard');
    if (auditCard) auditCard.hidden = !adminCan('audit:view');
    const securityForm = document.getElementById('securitySettingsForm');
    const securityCard = securityForm?.closest('.settings-card');
    if (securityCard) securityCard.hidden = !adminCan('settings:security-filter');
    const crEventCard = document.getElementById('crEventSettingsCard');
    if (crEventCard) crEventCard.hidden = !isSuperadminUser();
    const addApiKeyBtn = document.getElementById('addApiKeyBtn');
    if (addApiKeyBtn) addApiKeyBtn.hidden = !adminCan('api-keys:manage');
    document.querySelectorAll('.bot-secret-action').forEach((button) => {
        button.hidden = !canEditBotSecrets();
    });
    const firstVisibleNav = navItems.find((item) => !item.hidden);
    const activeNav = navItems.find((item) => item.classList.contains('active') && !item.hidden);
    const targetNav = activeNav || firstVisibleNav;
    if (!targetNav) return;
    navItems.forEach((item) => item.classList.toggle('active', item === targetNav));
    sections.forEach((section) => {
        const isVisible = section.id === targetNav.dataset.section && section.dataset.permissionHidden !== 'true';
        section.classList.toggle('d-none', !isVisible);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    initSettingsPermissionVisibility();
    initNavigation();
    initBotChannelTabs();
    loadAllSettings();
    setupEventListeners();
});

// Provide a global alert helper for modules that expect showAlert
function showAlert(message, type = 'info') {
    showToast(message, type);
}
window.showAlert = showAlert;

function setActiveBotChannel(channel, options = {}) {
    const nextChannel = BOT_CHANNELS.includes(channel) ? channel : 'line';
    const { persist = true } = options;
    activeBotChannel = nextChannel;

    const tabs = document.querySelectorAll('[data-bot-channel]');
    tabs.forEach((tab) => {
        const isActive = tab.dataset.botChannel === nextChannel;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const panels = document.querySelectorAll('[data-bot-channel-panel]');
    panels.forEach((panel) => {
        const isActive = panel.dataset.botChannelPanel === nextChannel;
        panel.classList.toggle('is-active', isActive);
    });

    if (persist) {
        try {
            localStorage.setItem('adminSettingsV2.activeBotChannel', nextChannel);
        } catch (error) {
            // Ignore storage errors (private mode, quota, etc.)
        }
    }
}

function initBotChannelTabs() {
    const tabsContainer = document.getElementById('botChannelTabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (event) => {
        const button = event.target.closest('[data-bot-channel]');
        if (!button) return;
        setActiveBotChannel(button.dataset.botChannel);
    });

    let initialChannel = 'line';
    try {
        const savedChannel = localStorage.getItem('adminSettingsV2.activeBotChannel');
        if (BOT_CHANNELS.includes(savedChannel)) {
            initialChannel = savedChannel;
        }
    } catch (error) {
        // Ignore storage errors
    }

    setActiveBotChannel(initialChannel, { persist: false });
}

// --- Navigation ---
function initNavigation() {
    const navItems = document.querySelectorAll('.settings-topnav-item[data-section]');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        if (item.hidden) return;
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href') || '';
            if (!href.startsWith('#')) {
                return;
            }

            e.preventDefault();
            const targetId = href.substring(1);

            // Update Nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update Content
            sections.forEach(section => {
                if (section.dataset.permissionHidden === 'true') {
                    section.classList.add('d-none');
                } else if (section.id === targetId) {
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
            } else if (targetId === 'chat-settings') {
                loadChatSettings();
                if (adminCan('chat:tags')) loadChatSystemTags();
            } else if (targetId === 'order-notifications') {
                window.notificationChannels?.refresh?.();
            } else if (targetId === 'data-forms') {
                window.voxtronPhase1?.refreshDataForms?.();
            } else if (targetId === 'file-library') {
                window.voxtronPhase1?.refreshFiles?.();
            } else if (targetId === 'security-settings') {
                if (adminCan('settings:security-filter')) loadSecuritySettings();
                if (adminCan('audit:view')) loadAuditLogs();
            } else if (targetId === 'system-settings') {
                loadSystemSettings();
                if (isSuperadminUser()) loadCrEventSettings();
            }
        });
    });
}

// --- Data Loading ---
async function loadAllSettings() {
    try {
        const needsInstructionData = adminCan(['instructions:view', 'instructions:create', 'instructions:update', 'instructions:manage']);
        const needsImageData = adminCan(IMAGE_COLLECTION_PERMISSIONS);
        const preloadTasks = [];
        if (needsInstructionData) preloadTasks.push(loadInstructionLibraries());
        if (needsImageData) preloadTasks.push(loadImageCollections());
        await Promise.all(preloadTasks);

        const loadTasks = [];
        if (adminCan(BOT_SETTINGS_PERMISSIONS)) loadTasks.push(loadBotSettings());
        if (adminCan('settings:chat')) {
            loadTasks.push(loadChatSettings());
            if (adminCan('chat:tags')) loadTasks.push(loadChatSystemTags());
        }
        if (adminCan('settings:general')) {
            loadTasks.push(loadSystemSettings());
            if (isSuperadminUser()) loadTasks.push(loadCrEventSettings());
        }
        if (adminCan('settings:security-filter')) loadTasks.push(loadSecuritySettings());
        if (adminCan('audit:view')) loadTasks.push(loadAuditLogs());
        if (adminCan(IMAGE_COLLECTION_PERMISSIONS)) loadTasks.push(window.imageCollectionsManager?.refreshAll?.());
        await Promise.all(loadTasks.filter(Boolean));
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('เกิดข้อผิดพลาดในการโหลดการตั้งค่า', 'danger');
    }
}

// --- Bot Management ---
async function loadBotSettings() {
    const lineContainer = document.getElementById('line-bots-list');
    const fbContainer = document.getElementById('facebook-bots-list');
    const igContainer = document.getElementById('instagram-bots-list');
    const waContainer = document.getElementById('whatsapp-bots-list');

    if (lineContainer) lineContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด Line Bots...</div>';
    if (fbContainer) fbContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด Facebook Bots...</div>';
    if (igContainer) igContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด Instagram Bots...</div>';
    if (waContainer) waContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด WhatsApp Bots...</div>';

    try {
        if (instructionLibraries.length === 0) {
            await loadInstructionLibraries();
        }
        if (imageCollections.length === 0) {
            await loadImageCollections();
        }

        const [lineRes, fbRes, igRes, waRes] = await Promise.all([
            fetch('/api/line-bots'),
            fetch('/api/facebook-bots'),
            fetch('/api/instagram-bots'),
            fetch('/api/whatsapp-bots')
        ]);

        const lineBots = await lineRes.json();
        const fbBots = await fbRes.json();
        const igBots = await igRes.json();
        const waBots = await waRes.json();

        renderLineBots(lineBots);
        renderFacebookBots(fbBots);
        renderInstagramBots(igBots);
        renderWhatsAppBots(waBots);
    } catch (error) {
        console.error('Error loading bots:', error);
        if (lineContainer) lineContainer.innerHTML = '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
        if (fbContainer) fbContainer.innerHTML = '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
        if (igContainer) igContainer.innerHTML = '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
        if (waContainer) waContainer.innerHTML = '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
    }
}

function renderLineBots(bots) {
    const container = document.getElementById('line-bots-list');
    if (!container) return;
    const canUpdate = canUpdateBots();
    const canEditSecrets = canEditBotSecrets();

    if (bots.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted-v2">ยังไม่มีการตั้งค่า Line Bot</div>';
        return;
    }

    container.innerHTML = bots.map(bot => {
        const notificationEnabled = bot.notificationEnabled !== false;
        return `
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
                    Model: ${escapeHtml(bot.aiModel || DEFAULT_BOT_MODEL)}
                    • API: ${bot.aiConfig?.apiMode === 'chat' ? 'Chat' : 'Responses'}
                    • อัปเดต: ${formatBotUpdatedAt(bot.updatedAt)}
                </div>
                ${buildBotInlineControls(bot, 'line')}
            </div>
            <div class="bot-actions-compact">
                <div class="d-flex align-items-center gap-2">
                    <div class="text-center">
                        <div class="text-muted small">แชท</div>
                        <label class="toggle-switch mb-0" title="เปิด/ปิดการตอบแชท">
                            <input type="checkbox" ${bot.status === 'active' ? 'checked' : ''} ${canUpdate ? '' : 'disabled'} onchange="toggleBotStatus('line', '${bot._id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="text-center">
                        <div class="text-muted small">แจ้งเตือน</div>
                        <label class="toggle-switch mb-0" title="เปิด/ปิดการแจ้งเตือน">
                            <input type="checkbox" ${notificationEnabled ? 'checked' : ''} ${canUpdate ? '' : 'disabled'} onchange="toggleBotNotification('line', '${bot._id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="actions-stack">
                    ${canUpdate ? `<button class="btn-ghost-sm" title="คีย์เวิร์ด" onclick="openBotKeywordModal('line', '${bot._id}')"><i class="fas fa-key"></i></button>` : ''}
                    ${canEditSecrets ? `<button class="btn-ghost-sm" title="แก้ไข" onclick="openEditLineBotModal('${bot._id}')"><i class="fas fa-edit"></i></button>` : ''}
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function renderFacebookBots(bots) {
    const container = document.getElementById('facebook-bots-list');
    if (!container) return;
    const canUpdate = canUpdateBots();
    const canEditSecrets = canEditBotSecrets();

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
                    Model: ${escapeHtml(bot.aiModel || DEFAULT_BOT_MODEL)}
                    • API: ${bot.aiConfig?.apiMode === 'chat' ? 'Chat' : 'Responses'}
                    • Page: ${escapeHtml(bot.pageId || 'N/A')}
                </div>
                ${buildBotInlineControls(bot, 'facebook')}
            </div>
            <div class="bot-actions-compact">
                <label class="toggle-switch mb-0">
                    <input type="checkbox" ${bot.status === 'active' ? 'checked' : ''} ${canUpdate ? '' : 'disabled'} onchange="toggleBotStatus('facebook', '${bot._id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <div class="actions-stack">
                    ${canUpdate ? `<button class="btn-ghost-sm" title="คีย์เวิร์ด" onclick="openBotKeywordModal('facebook', '${bot._id}')"><i class="fas fa-key"></i></button>` : ''}
                    ${canEditSecrets ? `<button class="btn-ghost-sm" title="แก้ไข" onclick="openEditFacebookBotModal('${bot._id}')"><i class="fas fa-edit"></i></button>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function renderInstagramBots(bots) {
    const container = document.getElementById('instagram-bots-list');
    if (!container) return;
    const canUpdate = canUpdateBots();
    const canEditSecrets = canEditBotSecrets();

    if (!Array.isArray(bots) || bots.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted-v2">ยังไม่มีการตั้งค่า Instagram Bot</div>';
        return;
    }

    container.innerHTML = bots.map(bot => `
        <div class="bot-item-compact">
            <div class="bot-channel instagram"><i class="fab fa-instagram"></i></div>
            <div class="bot-main">
                <div class="bot-header">
                    <div class="bot-title">
                        <span class="bot-name">${escapeHtml(bot.name || bot.instagramUsername || 'Instagram Bot')}</span>
                        ${bot.isDefault ? '<span class="badge badge-default">ค่าเริ่มต้น</span>' : ''}
                    </div>
                </div>
                <div class="bot-subtext">
                    Model: ${escapeHtml(bot.aiModel || DEFAULT_BOT_MODEL)}
                    • API: ${bot.aiConfig?.apiMode === 'chat' ? 'Chat' : 'Responses'}
                    • IG ID: ${escapeHtml(bot.instagramUserId || bot.igUserId || bot.instagramBusinessAccountId || 'N/A')}
                </div>
                ${buildBotInlineControls(bot, 'instagram')}
            </div>
            <div class="bot-actions-compact">
                <label class="toggle-switch mb-0">
                    <input type="checkbox" ${bot.status === 'active' ? 'checked' : ''} ${canUpdate ? '' : 'disabled'} onchange="toggleBotStatus('instagram', '${bot._id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <div class="actions-stack">
                    ${canUpdate ? `<button class="btn-ghost-sm" title="คีย์เวิร์ด" onclick="openBotKeywordModal('instagram', '${bot._id}')"><i class="fas fa-key"></i></button>` : ''}
                    ${canEditSecrets ? `<button class="btn-ghost-sm" title="แก้ไข" onclick="openEditInstagramBotModal('${bot._id}')"><i class="fas fa-edit"></i></button>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function renderWhatsAppBots(bots) {
    const container = document.getElementById('whatsapp-bots-list');
    if (!container) return;
    const canUpdate = canUpdateBots();
    const canEditSecrets = canEditBotSecrets();

    if (!Array.isArray(bots) || bots.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted-v2">ยังไม่มีการตั้งค่า WhatsApp Bot</div>';
        return;
    }

    container.innerHTML = bots.map(bot => `
        <div class="bot-item-compact">
            <div class="bot-channel whatsapp"><i class="fab fa-whatsapp"></i></div>
            <div class="bot-main">
                <div class="bot-header">
                    <div class="bot-title">
                        <span class="bot-name">${escapeHtml(bot.name || bot.phoneNumber || 'WhatsApp Bot')}</span>
                        ${bot.isDefault ? '<span class="badge badge-default">ค่าเริ่มต้น</span>' : ''}
                    </div>
                </div>
                <div class="bot-subtext">
                    Model: ${escapeHtml(bot.aiModel || DEFAULT_BOT_MODEL)}
                    • API: ${bot.aiConfig?.apiMode === 'chat' ? 'Chat' : 'Responses'}
                    • Phone ID: ${escapeHtml(bot.phoneNumberId || bot.whatsappPhoneNumberId || 'N/A')}
                </div>
                ${buildBotInlineControls(bot, 'whatsapp')}
            </div>
            <div class="bot-actions-compact">
                <label class="toggle-switch mb-0">
                    <input type="checkbox" ${bot.status === 'active' ? 'checked' : ''} ${canUpdate ? '' : 'disabled'} onchange="toggleBotStatus('whatsapp', '${bot._id}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <div class="actions-stack">
                    ${canUpdate ? `<button class="btn-ghost-sm" title="คีย์เวิร์ด" onclick="openBotKeywordModal('whatsapp', '${bot._id}')"><i class="fas fa-key"></i></button>` : ''}
                    ${canEditSecrets ? `<button class="btn-ghost-sm" title="แก้ไข" onclick="openEditWhatsAppBotModal('${bot._id}')"><i class="fas fa-edit"></i></button>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

async function toggleBotStatus(type, id, isActive) {
    if (!canUpdateBots()) return;
    const endpointMap = {
        line: `/api/line-bots/${id}`,
        facebook: `/api/facebook-bots/${id}`,
        instagram: `/api/instagram-bots/${id}`,
        whatsapp: `/api/whatsapp-bots/${id}`,
    };
    const endpoint = endpointMap[type];
    if (!endpoint) {
        showToast('ประเภทบอทไม่รองรับ', 'danger');
        return;
    }

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
            const labelMap = {
                line: 'Line',
                facebook: 'Facebook',
                instagram: 'Instagram',
                whatsapp: 'WhatsApp',
            };
            showToast(`${labelMap[type] || 'Bot'} ${isActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'}`, 'success');
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

async function toggleBotNotification(type, id, isEnabled) {
    if (!canUpdateBots()) return;
    if (type !== 'line') return;
    try {
        const response = await fetch(`/api/line-bots/${id}/toggle-notifications`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: isEnabled })
        });

        if (response.ok) {
            const result = await response.json();
            showToast(result.message || `แจ้งเตือน Line Bot ${isEnabled ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'}`, 'success');
            loadBotSettings();
        } else {
            const error = await response.json();
            throw new Error(error?.error || 'Update failed');
        }
    } catch (error) {
        console.error('Error toggling bot notifications:', error);
        showToast('ไม่สามารถอัปเดตสถานะการแจ้งเตือนได้', 'danger');
        loadBotSettings();
    }
}

// --- Modal Logic for Bots ---

// Helper to populate API key dropdowns in bot modals
async function populateApiKeyDropdowns(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Clear existing options except first (default)
    select.innerHTML = '<option value="">ใช้ Key หลัก (Default)</option>';

    try {
        // Use cached API keys if available, otherwise fetch
        let keys = apiKeysCache;
        if (!keys || keys.length === 0) {
            const response = await fetch('/api/openai-keys');
            if (response.ok) {
                const data = await response.json();
                keys = Array.isArray(data.keys) ? data.keys : [];
                apiKeysCache = keys;
            }
        }

        // Add active keys as options
        keys.filter(k => k.isActive).forEach(key => {
            const option = document.createElement('option');
            option.value = key.id;
            const provider = normalizeApiProvider(key.provider);
            option.textContent = `[${provider.toUpperCase()}] ${key.name}${key.isDefault ? ' (หลัก)' : ''}`;
            if (selectedValue === key.id) option.selected = true;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('[API Keys] Error loading keys for dropdown:', error);
    }
}

function populateBotModelDropdown(selectId, selectedValue = DEFAULT_BOT_MODEL) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const normalizedValue =
        typeof selectedValue === 'string' && selectedValue.trim()
            ? selectedValue.trim()
            : DEFAULT_BOT_MODEL;

    select.innerHTML = buildModelOptions(normalizedValue);
    select.value = normalizedValue;
}

// Line Bot
window.openAddLineBotModal = async function () {
    if (!canEditBotSecrets()) return;
    const form = document.getElementById('lineBotForm');
    if (form) form.reset();
    const idInput = document.getElementById('lineBotId');
    if (idInput) idInput.value = '';
    const notifyToggle = document.getElementById('lineBotNotificationEnabled');
    if (notifyToggle) notifyToggle.checked = true;
    populateBotModelDropdown('lineBotAiModel');
    setAiConfigUI('line', defaultAiConfig);
    const collapseEl = document.getElementById('lineBotAiParams');
    if (collapseEl && collapseEl.classList.contains('show')) {
        const collapseInstance = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        collapseInstance.hide();
    }

    // Populate API key dropdown
    await populateApiKeyDropdowns('lineBotApiKeyId');

    // Hide delete button for new bot
    const deleteBtn = document.getElementById('deleteLineBotBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    // Update modal title
    const title = document.getElementById('addLineBotModalLabel');
    if (title) title.innerHTML = '<i class="fab fa-line me-2"></i>เพิ่ม Line Bot ใหม่';

    const modalEl = document.getElementById('addLineBotModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    } else {
        console.error('Modal element #addLineBotModal not found');
    }
};

window.openEditLineBotModal = async function (id) {
    if (!canEditBotSecrets()) return;
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
        const notifyToggle = document.getElementById('lineBotNotificationEnabled');
        if (notifyToggle) notifyToggle.checked = bot.notificationEnabled !== false;

        populateBotModelDropdown('lineBotAiModel', bot.aiModel || DEFAULT_BOT_MODEL);

        const defaultCheck = document.getElementById('lineBotDefault'); // Corrected ID
        if (defaultCheck) defaultCheck.checked = bot.isDefault;

        setAiConfigUI('line', bot.aiConfig || defaultAiConfig);

        // Populate API key dropdown and set selected value
        await populateApiKeyDropdowns('lineBotApiKeyId', bot.openaiApiKeyId || '');

        // Update modal title for edit mode
        const title = document.getElementById('addLineBotModalLabel');
        if (title) title.innerHTML = '<i class="fab fa-line me-2"></i>แก้ไข Line Bot';

        // Show delete button for existing bot
        const deleteBtn = document.getElementById('deleteLineBotBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

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
    if (!validateBotConfigForm('line', form)) return;
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
        notificationEnabled: document.getElementById('lineBotNotificationEnabled')?.checked === true,
        aiModel: document.getElementById('lineBotAiModel').value,
        isDefault: document.getElementById('lineBotDefault').checked,
        aiConfig: readAiConfigFromUI('line'),
        openaiApiKeyId: document.getElementById('lineBotApiKeyId')?.value || ''
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
window.openAddFacebookBotModal = async function () {
    if (!canEditBotSecrets()) return;
    const form = document.getElementById('facebookBotForm');
    if (form) form.reset();

    const idInput = document.getElementById('facebookBotId');
    if (idInput) idInput.value = '';

    const deleteBtn = document.getElementById('deleteFacebookBotBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    const verifiedToggle = document.getElementById('fbVerifiedToggle');
    if (verifiedToggle) verifiedToggle.checked = false;
    populateBotModelDropdown('facebookBotAiModel');
    setAiConfigUI('facebook', defaultAiConfig);
    const fbCollapseEl = document.getElementById('facebookBotAiParams');
    if (fbCollapseEl && fbCollapseEl.classList.contains('show')) {
        const collapseInstance = bootstrap.Collapse.getOrCreateInstance(fbCollapseEl, { toggle: false });
        collapseInstance.hide();
    }

    // Populate API key dropdown
    await populateApiKeyDropdowns('facebookBotApiKeyId');

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
    if (!canEditBotSecrets()) return;
    // Populate API key dropdown first
    await populateApiKeyDropdowns('facebookBotApiKeyId');

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

        populateBotModelDropdown('facebookBotAiModel', bot.aiModel || DEFAULT_BOT_MODEL);

        const defaultCheck = document.getElementById('facebookBotDefault'); // Corrected ID
        if (defaultCheck) defaultCheck.checked = bot.isDefault;

        setAiConfigUI('facebook', bot.aiConfig || defaultAiConfig);

        // Set API key dropdown value
        const apiKeySelect = document.getElementById('facebookBotApiKeyId');
        if (apiKeySelect) apiKeySelect.value = bot.openaiApiKeyId || '';

        // Set Dataset ID for Conversions API
        const datasetIdInput = document.getElementById('facebookDatasetId');
        if (datasetIdInput) datasetIdInput.value = bot.datasetId || '';

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
    const form = document.getElementById('facebookBotForm');
    if (!validateBotConfigForm('facebook', form)) return;
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
        aiConfig: readAiConfigFromUI('facebook'),
        openaiApiKeyId: document.getElementById('facebookBotApiKeyId')?.value || '',
        datasetId: document.getElementById('facebookDatasetId')?.value.trim() || ''
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

async function autoFetchFacebookDataset() {
    const botId = document.getElementById('facebookBotId')?.value || '';
    const pageId = document.getElementById('facebookPageId')?.value.trim() || '';
    const accessToken = document.getElementById('facebookAccessToken')?.value.trim() || '';
    const datasetInput = document.getElementById('facebookDatasetId');
    const btn = document.getElementById('facebookDatasetAutoBtn');

    if (!botId) {
        showToast('กรุณาบันทึกบอทก่อนเพื่อสร้าง Dataset', 'warning');
        return;
    }
    if (!pageId || !accessToken) {
        showToast('กรุณากรอก Page ID และ Access Token ก่อน', 'warning');
        return;
    }

    try {
        if (btn) setLoading(btn, true);
        const res = await fetch(`/api/facebook-bots/${botId}/dataset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId, accessToken })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data?.error || 'ไม่สามารถสร้าง Dataset ได้');
        }
        if (datasetInput && data.datasetId) {
            datasetInput.value = data.datasetId;
        }
        showToast('สร้าง Dataset ID สำเร็จ', 'success');
    } catch (error) {
        console.error('Auto dataset error:', error);
        showToast(error.message || 'สร้าง Dataset ไม่สำเร็จ', 'danger');
    } finally {
        if (btn) setLoading(btn, false);
    }
}

// Instagram Bot
window.openAddInstagramBotModal = async function () {
    if (!canEditBotSecrets()) return;
    const form = document.getElementById('instagramBotForm');
    if (form) form.reset();
    const idInput = document.getElementById('instagramBotId');
    if (idInput) idInput.value = '';

    populateBotModelDropdown('instagramBotAiModel');
    setAiConfigUI('instagram', defaultAiConfig);
    const collapseEl = document.getElementById('instagramBotAiParams');
    if (collapseEl && collapseEl.classList.contains('show')) {
        const collapseInstance = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        collapseInstance.hide();
    }

    await populateApiKeyDropdowns('instagramBotApiKeyId');

    const deleteBtn = document.getElementById('deleteInstagramBotBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    const title = document.getElementById('addInstagramBotModalLabel');
    if (title) title.innerHTML = '<i class="fab fa-instagram me-2"></i>เพิ่ม Instagram Bot ใหม่';

    const modalEl = document.getElementById('addInstagramBotModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.openEditInstagramBotModal = async function (id) {
    if (!canEditBotSecrets()) return;
    await populateApiKeyDropdowns('instagramBotApiKeyId');
    try {
        const res = await fetch(`/api/instagram-bots/${id}`);
        const bot = await res.json();

        document.getElementById('instagramBotId').value = bot._id;
        document.getElementById('instagramBotName').value = bot.name || '';
        document.getElementById('instagramBotDescription').value = bot.description || '';
        document.getElementById('instagramUserId').value =
            bot.instagramBusinessAccountId || bot.instagramUserId || bot.igUserId || '';
        document.getElementById('instagramUsername').value = bot.instagramUsername || '';
        document.getElementById('instagramAccessToken').value = bot.accessToken || '';
        document.getElementById('instagramVerifyToken').value = bot.verifyToken || '';
        document.getElementById('instagramWebhookUrl').value = bot.webhookUrl || '';

        const statusSelect = document.getElementById('instagramBotStatus');
        if (statusSelect) statusSelect.value = bot.status || 'active';

        populateBotModelDropdown('instagramBotAiModel', bot.aiModel || DEFAULT_BOT_MODEL);

        const defaultCheck = document.getElementById('instagramBotDefault');
        if (defaultCheck) defaultCheck.checked = !!bot.isDefault;

        setAiConfigUI('instagram', bot.aiConfig || defaultAiConfig);

        const apiKeySelect = document.getElementById('instagramBotApiKeyId');
        if (apiKeySelect) apiKeySelect.value = bot.openaiApiKeyId || '';

        const title = document.getElementById('addInstagramBotModalLabel');
        if (title) title.innerHTML = '<i class="fab fa-instagram me-2"></i>แก้ไข Instagram Bot';

        const deleteBtn = document.getElementById('deleteInstagramBotBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        const modalEl = document.getElementById('addInstagramBotModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    } catch (error) {
        console.error('Error fetching instagram bot details:', error);
        showToast('ไม่สามารถโหลดข้อมูลบอทได้', 'danger');
    }
};

async function saveInstagramBot() {
    const form = document.getElementById('instagramBotForm');
    if (!validateBotConfigForm('instagram', form)) return;
    const botId = document.getElementById('instagramBotId').value;
    const botData = {
        name: document.getElementById('instagramBotName').value,
        description: document.getElementById('instagramBotDescription').value,
        instagramUserId: document.getElementById('instagramUserId').value,
        instagramUsername: document.getElementById('instagramUsername').value,
        accessToken: document.getElementById('instagramAccessToken').value,
        verifyToken: document.getElementById('instagramVerifyToken').value,
        webhookUrl: document.getElementById('instagramWebhookUrl').value,
        status: document.getElementById('instagramBotStatus').value,
        aiModel: document.getElementById('instagramBotAiModel').value,
        isDefault: document.getElementById('instagramBotDefault').checked,
        aiConfig: readAiConfigFromUI('instagram'),
        openaiApiKeyId: document.getElementById('instagramBotApiKeyId')?.value || ''
    };

    const url = botId ? `/api/instagram-bots/${botId}` : '/api/instagram-bots';
    const method = botId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });
        if (res.ok) {
            showToast('บันทึกข้อมูล Instagram Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addInstagramBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadBotSettings();
        } else {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || 'Save failed');
        }
    } catch (error) {
        console.error('Error saving instagram bot:', error);
        showToast(error.message || 'บันทึกข้อมูลไม่สำเร็จ', 'danger');
    }
}

async function deleteInstagramBot(botId) {
    if (!confirm('ต้องการลบ Instagram Bot นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    try {
        const res = await fetch(`/api/instagram-bots/${botId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('ลบ Instagram Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addInstagramBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadBotSettings();
        } else {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'ลบไม่สำเร็จ');
        }
    } catch (error) {
        console.error('Error deleting Instagram Bot:', error);
        showToast(error.message || 'ไม่สามารถลบ Instagram Bot ได้', 'danger');
    }
}

// WhatsApp Bot
window.openAddWhatsAppBotModal = async function () {
    if (!canEditBotSecrets()) return;
    const form = document.getElementById('whatsappBotForm');
    if (form) form.reset();
    const idInput = document.getElementById('whatsappBotId');
    if (idInput) idInput.value = '';

    populateBotModelDropdown('whatsappBotAiModel');
    setAiConfigUI('whatsapp', defaultAiConfig);
    const collapseEl = document.getElementById('whatsappBotAiParams');
    if (collapseEl && collapseEl.classList.contains('show')) {
        const collapseInstance = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        collapseInstance.hide();
    }

    await populateApiKeyDropdowns('whatsappBotApiKeyId');

    const deleteBtn = document.getElementById('deleteWhatsAppBotBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    const title = document.getElementById('addWhatsAppBotModalLabel');
    if (title) title.innerHTML = '<i class="fab fa-whatsapp me-2"></i>เพิ่ม WhatsApp Bot ใหม่';

    const modalEl = document.getElementById('addWhatsAppBotModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.openEditWhatsAppBotModal = async function (id) {
    if (!canEditBotSecrets()) return;
    await populateApiKeyDropdowns('whatsappBotApiKeyId');
    try {
        const res = await fetch(`/api/whatsapp-bots/${id}`);
        const bot = await res.json();

        document.getElementById('whatsappBotId').value = bot._id;
        document.getElementById('whatsappBotName').value = bot.name || '';
        document.getElementById('whatsappBotDescription').value = bot.description || '';
        document.getElementById('whatsappPhoneNumberId').value =
            bot.phoneNumberId || bot.whatsappPhoneNumberId || '';
        document.getElementById('whatsappPhoneNumber').value = bot.phoneNumber || '';
        document.getElementById('whatsappBusinessAccountId').value = bot.businessAccountId || '';
        document.getElementById('whatsappAccessToken').value = bot.accessToken || '';
        document.getElementById('whatsappVerifyToken').value = bot.verifyToken || '';
        document.getElementById('whatsappWebhookUrl').value = bot.webhookUrl || '';

        const statusSelect = document.getElementById('whatsappBotStatus');
        if (statusSelect) statusSelect.value = bot.status || 'active';

        populateBotModelDropdown('whatsappBotAiModel', bot.aiModel || DEFAULT_BOT_MODEL);

        const defaultCheck = document.getElementById('whatsappBotDefault');
        if (defaultCheck) defaultCheck.checked = !!bot.isDefault;

        setAiConfigUI('whatsapp', bot.aiConfig || defaultAiConfig);

        const apiKeySelect = document.getElementById('whatsappBotApiKeyId');
        if (apiKeySelect) apiKeySelect.value = bot.openaiApiKeyId || '';

        const title = document.getElementById('addWhatsAppBotModalLabel');
        if (title) title.innerHTML = '<i class="fab fa-whatsapp me-2"></i>แก้ไข WhatsApp Bot';

        const deleteBtn = document.getElementById('deleteWhatsAppBotBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        const modalEl = document.getElementById('addWhatsAppBotModal');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    } catch (error) {
        console.error('Error fetching whatsapp bot details:', error);
        showToast('ไม่สามารถโหลดข้อมูลบอทได้', 'danger');
    }
};

async function saveWhatsAppBot() {
    const form = document.getElementById('whatsappBotForm');
    if (!validateBotConfigForm('whatsapp', form)) return;
    const botId = document.getElementById('whatsappBotId').value;
    const botData = {
        name: document.getElementById('whatsappBotName').value,
        description: document.getElementById('whatsappBotDescription').value,
        phoneNumberId: document.getElementById('whatsappPhoneNumberId').value,
        phoneNumber: document.getElementById('whatsappPhoneNumber').value,
        businessAccountId: document.getElementById('whatsappBusinessAccountId').value,
        accessToken: document.getElementById('whatsappAccessToken').value,
        verifyToken: document.getElementById('whatsappVerifyToken').value,
        webhookUrl: document.getElementById('whatsappWebhookUrl').value,
        status: document.getElementById('whatsappBotStatus').value,
        aiModel: document.getElementById('whatsappBotAiModel').value,
        isDefault: document.getElementById('whatsappBotDefault').checked,
        aiConfig: readAiConfigFromUI('whatsapp'),
        openaiApiKeyId: document.getElementById('whatsappBotApiKeyId')?.value || ''
    };

    const url = botId ? `/api/whatsapp-bots/${botId}` : '/api/whatsapp-bots';
    const method = botId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });
        if (res.ok) {
            showToast('บันทึกข้อมูล WhatsApp Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addWhatsAppBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadBotSettings();
        } else {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || 'Save failed');
        }
    } catch (error) {
        console.error('Error saving whatsapp bot:', error);
        showToast(error.message || 'บันทึกข้อมูลไม่สำเร็จ', 'danger');
    }
}

async function deleteWhatsAppBot(botId) {
    if (!confirm('ต้องการลบ WhatsApp Bot นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    try {
        const res = await fetch(`/api/whatsapp-bots/${botId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('ลบ WhatsApp Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addWhatsAppBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadBotSettings();
        } else {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'ลบไม่สำเร็จ');
        }
    } catch (error) {
        console.error('Error deleting WhatsApp Bot:', error);
        showToast(error.message || 'ไม่สามารถลบ WhatsApp Bot ได้', 'danger');
    }
}

// Delete Line Bot
async function deleteLineBot(botId) {
    if (!confirm('ต้องการลบ Line Bot นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    try {
        const res = await fetch(`/api/line-bots/${botId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('ลบ Line Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addLineBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadBotSettings();
        } else {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'ลบไม่สำเร็จ');
        }
    } catch (error) {
        console.error('Error deleting Line Bot:', error);
        showToast(error.message || 'ไม่สามารถลบ Line Bot ได้', 'danger');
    }
}

// Delete Facebook Bot
async function deleteFacebookBot(botId) {
    if (!confirm('ต้องการลบ Facebook Bot นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    try {
        const res = await fetch(`/api/facebook-bots/${botId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('ลบ Facebook Bot เรียบร้อยแล้ว', 'success');
            const modalEl = document.getElementById('addFacebookBotModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadBotSettings();
        } else {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'ลบไม่สำเร็จ');
        }
    } catch (error) {
        console.error('Error deleting Facebook Bot:', error);
        showToast(error.message || 'ไม่สามารถลบ Facebook Bot ได้', 'danger');
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
        setInputValue('chatQueueSlaMinutes', settings.chatQueueSlaMinutes || 15);

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
        audioAttachmentResponse: getInputValue('audioAttachmentResponse'),
        chatQueueSlaMinutes: parseInt(getInputValue('chatQueueSlaMinutes') || '15', 10)
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

// --- Chat Tag Settings ---
function normalizeChatTagKey(tag) {
    return String(tag || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('th-TH');
}

function normalizeChatTagColor(color, fallback = '#315f8f') {
    const value = String(color || '').trim();
    const match = value.match(/^#?([0-9a-fA-F]{6})$/);
    return match ? `#${match[1].toLowerCase()}` : fallback;
}

function hexToRgb(color) {
    const normalized = normalizeChatTagColor(color);
    const numeric = parseInt(normalized.slice(1), 16);
    return {
        r: (numeric >> 16) & 255,
        g: (numeric >> 8) & 255,
        b: numeric & 255
    };
}

function rgbToHex(r, g, b) {
    return [r, g, b]
        .map((value) => Math.max(0, Math.min(255, parseInt(value, 10) || 0)).toString(16).padStart(2, '0'))
        .join('')
        .replace(/^/, '#');
}

function defaultChatTagColor(tag) {
    const colors = ['#315f8f', '#23775f', '#a76918', '#b83f45', '#6f4aa5', '#28708a', '#7a6a1d', '#8a4b2a'];
    const key = normalizeChatTagKey(tag);
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
        hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
    }
    return colors[Math.abs(hash) % colors.length] || colors[0];
}

function chatTagStyleAttr(entry = {}) {
    const color = normalizeChatTagColor(entry.color, defaultChatTagColor(entry.tag || 'tag'));
    const rgb = entry.rgb && Number.isFinite(Number(entry.rgb.r)) ? entry.rgb : hexToRgb(color);
    return `--tag-color:${escapeHtml(color)};--tag-rgb:${Number(rgb.r) || 0}, ${Number(rgb.g) || 0}, ${Number(rgb.b) || 0};`;
}

function getChatTagCreateColor() {
    return normalizeChatTagColor(document.getElementById('chatTagColorInput')?.value || '#315f8f');
}

function updateChatTagCreateColor(color) {
    const normalized = normalizeChatTagColor(color);
    const rgb = hexToRgb(normalized);
    const colorInput = document.getElementById('chatTagColorInput');
    const colorText = document.getElementById('chatTagColorText');
    if (colorInput) colorInput.value = normalized;
    if (colorText) colorText.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    const r = document.getElementById('chatTagColorR');
    const g = document.getElementById('chatTagColorG');
    const b = document.getElementById('chatTagColorB');
    if (r) r.value = String(rgb.r);
    if (g) g.value = String(rgb.g);
    if (b) b.value = String(rgb.b);
}

function syncChatTagCreateColorFromRgb() {
    updateChatTagCreateColor(rgbToHex(
        document.getElementById('chatTagColorR')?.value,
        document.getElementById('chatTagColorG')?.value,
        document.getElementById('chatTagColorB')?.value
    ));
}

function renderChatSystemTags(tags = chatSystemTags) {
    const list = document.getElementById('chatSystemTagsList');
    if (!list) return;

    if (!adminCan('chat:tags')) {
        list.innerHTML = '<div class="text-center p-3 text-muted-v2">ไม่มีสิทธิ์จัดการแท็ก</div>';
        return;
    }

    if (!Array.isArray(tags) || tags.length === 0) {
        list.innerHTML = '<div class="text-center p-3 text-muted-v2">ยังไม่มีแท็กในระบบ</div>';
        return;
    }

    list.innerHTML = tags.map((entry) => {
        const tag = entry.tag || '';
        const count = Number(entry.count || 0);
        const color = normalizeChatTagColor(entry.color, defaultChatTagColor(tag));
        const rgb = entry.rgb && Number.isFinite(Number(entry.rgb.r)) ? entry.rgb : hexToRgb(color);
        return `
            <div class="chat-tag-row">
                <div class="chat-tag-main">
                    <span class="chat-tag-pill" style="${chatTagStyleAttr({ tag, color, rgb })}">${escapeHtml(tag)}</span>
                    <span class="chat-tag-count">${count} ลูกค้า</span>
                </div>
                <div class="chat-tag-row-color">
                    <input type="color" value="${escapeHtml(color)}" data-update-system-tag-color="${escapeHtml(tag)}" title="เปลี่ยนสีแท็ก">
                    <span>rgb(${rgb.r}, ${rgb.g}, ${rgb.b})</span>
                    <button type="button" class="btn-ghost-sm text-danger" data-delete-system-tag="${escapeHtml(tag)}" title="ลบแท็ก">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadChatSystemTags() {
    const list = document.getElementById('chatSystemTagsList');
    if (!list || !adminCan('chat:tags')) return;
    list.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลดแท็ก...</div>';
    try {
        const response = await fetch('/admin/chat/system-tags');
        const data = await response.json();
        if (!response.ok || data.success === false) {
            throw new Error(data.error || 'โหลดแท็กไม่สำเร็จ');
        }
        chatSystemTags = Array.isArray(data.tags) ? data.tags : [];
        renderChatSystemTags();
    } catch (error) {
        console.error('Error loading chat tags:', error);
        list.innerHTML = '<div class="text-danger p-3">โหลดแท็กไม่สำเร็จ</div>';
    }
}

async function createChatSystemTag(event) {
    event.preventDefault();
    const input = document.getElementById('chatTagNameInput');
    const btn = document.getElementById('chatTagCreateBtn');
    const tag = (input?.value || '').replace(/\s+/g, ' ').trim();
    if (!tag) {
        showToast('กรุณาระบุชื่อแท็ก', 'warning');
        return;
    }

    setLoading(btn, true);
    try {
        const response = await fetch('/admin/chat/system-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag, color: getChatTagCreateColor(), source: 'settings' })
        });
        const data = await response.json();
        if (!response.ok || data.success === false) {
            throw new Error(data.error || 'เพิ่มแท็กไม่สำเร็จ');
        }
        chatSystemTags = Array.isArray(data.tags) ? data.tags : [];
        if (input) input.value = '';
        updateChatTagCreateColor(defaultChatTagColor(''));
        renderChatSystemTags();
        showToast('เพิ่มแท็กเข้าระบบแล้ว', 'success');
    } catch (error) {
        console.error('Error creating chat tag:', error);
        showToast(error.message || 'เพิ่มแท็กไม่สำเร็จ', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

async function updateChatSystemTagColor(tag, color) {
    const normalizedTag = (tag || '').trim();
    if (!normalizedTag) return;

    try {
        const response = await fetch('/admin/chat/system-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: normalizedTag, color: normalizeChatTagColor(color), source: 'settings' })
        });
        const data = await response.json();
        if (!response.ok || data.success === false) {
            throw new Error(data.error || 'บันทึกสีไม่สำเร็จ');
        }
        chatSystemTags = Array.isArray(data.tags) ? data.tags : [];
        renderChatSystemTags();
        showToast('อัปเดตสีแท็กแล้ว', 'success');
    } catch (error) {
        console.error('Error updating chat tag color:', error);
        showToast(error.message || 'บันทึกสีไม่สำเร็จ', 'danger');
        renderChatSystemTags();
    }
}

async function deleteChatSystemTag(tag) {
    const normalizedTag = (tag || '').trim();
    if (!normalizedTag) return;
    if (!confirm(`ลบแท็ก "${normalizedTag}" ออกจากระบบและลูกค้าทั้งหมดหรือไม่?`)) {
        return;
    }

    try {
        const response = await fetch('/admin/chat/system-tags', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: normalizedTag })
        });
        const data = await response.json();
        if (!response.ok || data.success === false) {
            throw new Error(data.error || 'ลบแท็กไม่สำเร็จ');
        }
        chatSystemTags = Array.isArray(data.tags) ? data.tags : [];
        renderChatSystemTags();
        showToast('ลบแท็กแล้ว', 'success');
    } catch (error) {
        console.error('Error deleting chat tag:', error);
        showToast(error.message || 'ลบแท็กไม่สำเร็จ', 'danger');
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
        const requiredFields = settings.orderRequiredFields || {};
        setCheckboxValue('orderRequiredItems', true);
        setCheckboxValue('orderRequiredCustomerName', requiredFields.customerName ?? false);
        setCheckboxValue('orderRequiredPhone', requiredFields.phone ?? false);
        setCheckboxValue('orderRequiredAddress', requiredFields.address ?? false);
        setCheckboxValue('orderRequiredPaymentMethod', requiredFields.paymentMethod ?? false);

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
        systemMode: getInputValue('systemMode'),
        orderRequiredFields: {
            items: true,
            customerName: getCheckboxValue('orderRequiredCustomerName'),
            phone: getCheckboxValue('orderRequiredPhone'),
            address: getCheckboxValue('orderRequiredAddress'),
            paymentMethod: getCheckboxValue('orderRequiredPaymentMethod')
        }
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

function setCrEventTestResult(message, type = 'info') {
    const box = document.getElementById('crEventTestResult');
    if (!box) return;
    box.hidden = !message;
    box.className = `alert mb-0 alert-${type === 'success' ? 'success' : type === 'danger' ? 'danger' : 'light'} border`;
    box.textContent = message || '';
}

async function loadCrEventSettings() {
    if (!isSuperadminUser()) return;
    try {
        const res = await fetch('/api/settings/cr-events');
        const data = await res.json();
        if (!res.ok || data.success === false) throw new Error(data.error || 'Load failed');
        const config = data.config || {};
        setCheckboxValue('crEventEnabled', config.enabled === true);
        setInputValue('crEventUrl', config.url || '');
        setInputValue('crEventSecret', config.hasSecret ? '********' : '');
        setCheckboxValue('crEventIncludeMessageContent', config.includeMessageContent === true);
        setCheckboxValue('crEventAutoEnabled', config.dataFormAutoExportEnabled !== false);
        setCheckboxValue('crEventManualEnabled', config.dataFormManualExportEnabled !== false);
        setCrEventTestResult('');
    } catch (error) {
        console.error('[CR Event] load failed:', error);
        setCrEventTestResult(error.message || 'โหลดการตั้งค่า CR Event ไม่สำเร็จ', 'danger');
    }
}

function readCrEventSettingsForm() {
    return {
        enabled: getCheckboxValue('crEventEnabled'),
        url: getInputValue('crEventUrl'),
        secret: getInputValue('crEventSecret'),
        includeMessageContent: getCheckboxValue('crEventIncludeMessageContent'),
        dataFormAutoExportEnabled: getCheckboxValue('crEventAutoEnabled'),
        dataFormManualExportEnabled: getCheckboxValue('crEventManualEnabled')
    };
}

async function saveCrEventSettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);
    setCrEventTestResult('');
    try {
        const res = await fetch('/api/settings/cr-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(readCrEventSettingsForm())
        });
        const data = await res.json();
        if (!res.ok || data.success === false) throw new Error(data.error || 'Save failed');
        showToast('บันทึก CR Event Webhook แล้ว', 'success');
        await loadCrEventSettings();
    } catch (error) {
        showToast(error.message || 'บันทึก CR Event Webhook ไม่สำเร็จ', 'danger');
        setCrEventTestResult(error.message || 'บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

async function testCrEventWebhook() {
    const btn = document.getElementById('crEventTestBtn');
    setLoading(btn, true);
    setCrEventTestResult('กำลังทดสอบส่ง webhook...', 'info');
    try {
        const res = await fetch('/api/settings/cr-events/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(readCrEventSettingsForm())
        });
        const data = await res.json();
        if (!res.ok || data.success === false) {
            const detail = data.result?.status ? `HTTP ${data.result.status}` : data.error || data.result?.error || 'ส่งไม่สำเร็จ';
            throw new Error(detail);
        }
        const status = data.result?.status ? `HTTP ${data.result.status}` : 'success';
        setCrEventTestResult(`ทดสอบสำเร็จ (${status}) Event ID: ${data.result?.eventId || '-'}`, 'success');
        showToast('ทดสอบ CR Event Webhook สำเร็จ', 'success');
    } catch (error) {
        setCrEventTestResult(`ทดสอบไม่สำเร็จ: ${error.message || error}`, 'danger');
        showToast('ทดสอบ CR Event Webhook ไม่สำเร็จ', 'danger');
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

function setupAuditLogListeners() {
    const refreshBtn = document.getElementById('auditLogsRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadAuditLogs());
    ['auditLogEventType', 'auditLogTargetType', 'auditLogFrom', 'auditLogTo'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadAuditLogs());
    });
    const search = document.getElementById('auditLogSearch');
    if (search) search.addEventListener('input', debounceSettings(() => loadAuditLogs(), 350));
}

function buildAuditLogQuery() {
    const params = new URLSearchParams();
    params.set('limit', '120');
    const search = getInputValue('auditLogSearch').trim();
    const eventType = getInputValue('auditLogEventType');
    const targetType = getInputValue('auditLogTargetType');
    const from = getInputValue('auditLogFrom');
    const to = getInputValue('auditLogTo');
    if (search) params.set('search', search);
    if (eventType) params.set('eventType', eventType);
    if (targetType) params.set('targetType', targetType);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params;
}

async function loadAuditLogs() {
    const list = document.getElementById('auditLogsList');
    if (!list || !adminCan('audit:view')) return;
    list.innerHTML = '<div class="text-center p-3 text-muted-v2">กำลังโหลด Audit Log...</div>';
    try {
        const res = await fetch(`/admin/api/audit-logs?${buildAuditLogQuery().toString()}`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.success === false) {
            throw new Error(payload?.error || 'โหลด Audit Log ไม่สำเร็จ');
        }
        renderAuditLogs(Array.isArray(payload.logs) ? payload.logs : []);
    } catch (error) {
        console.error('Error loading audit logs:', error);
        list.innerHTML = `<div class="text-danger p-3">${escapeHtml(error.message || 'โหลด Audit Log ไม่สำเร็จ')}</div>`;
    }
}

function renderAuditLogs(logs) {
    const list = document.getElementById('auditLogsList');
    if (!list) return;
    if (!logs.length) {
        list.innerHTML = '<div class="text-center p-4 text-muted-v2">ยังไม่มี Audit Log ตามตัวกรองนี้</div>';
        return;
    }
    list.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th style="min-width: 150px;">เวลา</th>
                        <th style="min-width: 150px;">Event</th>
                        <th style="min-width: 130px;">Actor</th>
                        <th style="min-width: 160px;">Target</th>
                        <th>Summary</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map((log) => `
                        <tr>
                            <td>${escapeHtml(formatAuditDate(log.createdAt))}</td>
                            <td><span class="badge bg-light text-dark border">${escapeHtml(log.eventType || '-')}</span></td>
                            <td>
                                <div class="fw-semibold">${escapeHtml(log.actorLabel || log.actorId || '-')}</div>
                                <small class="text-muted">${escapeHtml(log.actorRole || '')}</small>
                            </td>
                            <td>
                                <div class="fw-semibold">${escapeHtml(log.targetLabel || log.targetId || '-')}</div>
                                <small class="text-muted">${escapeHtml(log.targetType || '')}${log.userId ? ` • ${escapeHtml(log.userId)}` : ''}</small>
                            </td>
                            <td>
                                <div>${escapeHtml(log.summary || '-')}</div>
                                ${log.inboxKey ? `<small class="text-muted">${escapeHtml(log.inboxKey)}</small>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function formatAuditDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', { hour12: false });
}

function debounceSettings(fn, delay = 250) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// --- Utilities ---
function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshSettingsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (adminCan(BOT_SETTINGS_PERMISSIONS)) {
                Promise.all([
                    adminCan(['instructions:view', 'instructions:create', 'instructions:update', 'instructions:manage']) ? loadInstructionLibraries() : Promise.resolve(),
                    adminCan(IMAGE_COLLECTION_PERMISSIONS) ? loadImageCollections() : Promise.resolve()
                ])
                    .then(() => loadBotSettings());
            }
            if (adminCan('settings:chat')) {
                loadChatSettings();
                if (adminCan('chat:tags')) loadChatSystemTags();
            }
            if (adminCan('settings:general')) {
                loadSystemSettings();
                if (isSuperadminUser()) loadCrEventSettings();
            }
            if (adminCan('settings:security-filter')) loadSecuritySettings();
            if (adminCan('audit:view')) loadAuditLogs();
            if (adminCan(IMAGE_COLLECTION_PERMISSIONS) && window.imageCollectionsManager?.refreshAll) {
                window.imageCollectionsManager.refreshAll();
            }
        });
    }

    const chatForm = document.getElementById('chatSettingsForm');
    if (chatForm) chatForm.addEventListener('submit', saveChatSettings);

    const chatTagForm = document.getElementById('chatTagCreateForm');
    if (chatTagForm) chatTagForm.addEventListener('submit', createChatSystemTag);

    const chatTagColorInput = document.getElementById('chatTagColorInput');
    if (chatTagColorInput) {
        chatTagColorInput.addEventListener('input', (event) => updateChatTagCreateColor(event.target.value));
    }
    ['chatTagColorR', 'chatTagColorG', 'chatTagColorB'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', syncChatTagCreateColorFromRgb);
    });

    const chatTagsRefreshBtn = document.getElementById('chatTagsRefreshBtn');
    if (chatTagsRefreshBtn) chatTagsRefreshBtn.addEventListener('click', loadChatSystemTags);

    const chatSystemTagsList = document.getElementById('chatSystemTagsList');
    if (chatSystemTagsList) {
        chatSystemTagsList.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-delete-system-tag]');
            if (!btn || !chatSystemTagsList.contains(btn)) return;
            deleteChatSystemTag(btn.dataset.deleteSystemTag || '');
        });
        chatSystemTagsList.addEventListener('change', (event) => {
            const input = event.target.closest('[data-update-system-tag-color]');
            if (!input || !chatSystemTagsList.contains(input)) return;
            updateChatSystemTagColor(input.dataset.updateSystemTagColor || '', input.value);
        });
    }

    const systemForm = document.getElementById('systemSettingsForm');
    if (systemForm) systemForm.addEventListener('submit', saveSystemSettings);

    const crEventForm = document.getElementById('crEventSettingsForm');
    if (crEventForm) crEventForm.addEventListener('submit', saveCrEventSettings);
    const crEventTestBtn = document.getElementById('crEventTestBtn');
    if (crEventTestBtn) crEventTestBtn.addEventListener('click', testCrEventWebhook);

    const securityForm = document.getElementById('securitySettingsForm');
    if (securityForm) securityForm.addEventListener('submit', saveSecuritySettings);
    setupAuditLogListeners();

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

    const instagramBotForm = document.getElementById('instagramBotForm');
    if (instagramBotForm) {
        instagramBotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveInstagramBot();
        });
    }

    const whatsappBotForm = document.getElementById('whatsappBotForm');
    if (whatsappBotForm) {
        whatsappBotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveWhatsAppBot();
        });
    }

    // Modal Save Buttons
    const saveLineBtn = document.getElementById('saveLineBotBtn');
    if (saveLineBtn) saveLineBtn.addEventListener('click', saveLineBot);

    const saveFbBtn = document.getElementById('saveFacebookBotBtn');
    if (saveFbBtn) saveFbBtn.addEventListener('click', saveFacebookBot);

    const saveIgBtn = document.getElementById('saveInstagramBotBtn');
    if (saveIgBtn) saveIgBtn.addEventListener('click', saveInstagramBot);

    const saveWaBtn = document.getElementById('saveWhatsAppBotBtn');
    if (saveWaBtn) saveWaBtn.addEventListener('click', saveWhatsAppBot);

    const saveBotKeywordBtn = document.getElementById('saveBotKeywordBtn');
    if (saveBotKeywordBtn) saveBotKeywordBtn.addEventListener('click', saveBotKeywordSettings);
    const botKeywordModal = document.getElementById('botKeywordModal');
    if (botKeywordModal) {
        botKeywordModal.addEventListener('hidden.bs.modal', () => {
            botKeywordModalState.botType = '';
            botKeywordModalState.botId = '';
            setBotKeywordModalFormValues({});
            setBotKeywordModalLoading(false);
        });
    }

    const autoDatasetBtn = document.getElementById('facebookDatasetAutoBtn');
    if (autoDatasetBtn) autoDatasetBtn.addEventListener('click', autoFetchFacebookDataset);

    // Modal Delete Buttons
    const deleteLineBtn = document.getElementById('deleteLineBotBtn');
    if (deleteLineBtn) {
        deleteLineBtn.addEventListener('click', () => {
            const botId = document.getElementById('lineBotId').value;
            if (botId) deleteLineBot(botId);
        });
    }

    const deleteFbBtn = document.getElementById('deleteFacebookBotBtn');
    if (deleteFbBtn) {
        deleteFbBtn.addEventListener('click', () => {
            const botId = document.getElementById('facebookBotId').value;
            if (botId) deleteFacebookBot(botId);
        });
    }

    const deleteIgBtn = document.getElementById('deleteInstagramBotBtn');
    if (deleteIgBtn) {
        deleteIgBtn.addEventListener('click', () => {
            const botId = document.getElementById('instagramBotId').value;
            if (botId) deleteInstagramBot(botId);
        });
    }

    const deleteWaBtn = document.getElementById('deleteWhatsAppBotBtn');
    if (deleteWaBtn) {
        deleteWaBtn.addEventListener('click', () => {
            const botId = document.getElementById('whatsappBotId').value;
            if (botId) deleteWhatsAppBot(botId);
        });
    }

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
    toast.textContent = message || '';
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

const REASONING_EFFORT_LABELS = {
    none: 'none',
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh'
};

function normalizeBotModelIdentifier(modelId) {
    if (!modelId || typeof modelId !== 'string') return '';
    const rawId = modelId.trim().toLowerCase();
    if (!rawId) return '';
    return rawId.includes('/') ? rawId.split('/').pop().trim() : rawId;
}

function getBotReasoningSupport(modelId) {
    const normalized = normalizeBotModelIdentifier(modelId);
    if (!normalized) return null;

    if (normalized === 'gpt-5-pro') {
        return {
            allowed: ['high'],
            defaultEffort: 'high'
        };
    }

    if (
        normalized === 'gpt-5.4' ||
        normalized === 'gpt-5.4-mini' ||
        normalized === 'gpt-5.4-nano'
    ) {
        return {
            allowed: ['none', 'low', 'medium', 'high', 'xhigh'],
            defaultEffort: 'none'
        };
    }

    if (normalized === 'gpt-5.2' || normalized === 'gpt-5.2-codex') {
        return {
            allowed: ['none', 'low', 'medium', 'high', 'xhigh'],
            defaultEffort: 'none'
        };
    }

    if (normalized === 'gpt-5.1') {
        return {
            allowed: ['none', 'low', 'medium', 'high'],
            defaultEffort: 'none'
        };
    }

    if (
        normalized === 'gpt-5' ||
        normalized === 'gpt-5-mini' ||
        normalized === 'gpt-5-nano'
    ) {
        return {
            allowed: ['minimal', 'low', 'medium', 'high'],
            defaultEffort: 'medium'
        };
    }

    if (
        normalized.startsWith('o1') ||
        normalized.startsWith('o3') ||
        normalized.startsWith('o4')
    ) {
        return {
            allowed: ['low', 'medium', 'high'],
            defaultEffort: 'medium'
        };
    }

    return null;
}

function buildReasoningEffortOptions(modelId, selectedValue = '') {
    const support = getBotReasoningSupport(modelId);
    if (!support) {
        return '<option value="" disabled selected>ไม่รองรับ</option>';
    }

    const normalizedSelectedValue =
        typeof selectedValue === 'string' ? selectedValue.trim() : '';
    const hasSelectedValue = support.allowed.includes(normalizedSelectedValue);

    const options = [];
    if (!hasSelectedValue) {
        options.push('<option value="" disabled selected>โปรดเลือก (แนะนำ low)</option>');
    }

    support.allowed.forEach((effort) => {
        const selected = hasSelectedValue && normalizedSelectedValue === effort ? 'selected' : '';
        options.push(
            `<option value="${effort}" ${selected}>${REASONING_EFFORT_LABELS[effort] || effort}</option>`
        );
    });

    return options.join('');
}

function populateReasoningEffortDropdown(prefix, selectedValue = '') {
    const select = document.getElementById(`${prefix}BotReasoningEffort`);
    if (!select) return;

    const modelId = getInputValue(`${prefix}BotAiModel`);
    const support = getBotReasoningSupport(modelId);
    select.innerHTML = buildReasoningEffortOptions(modelId, selectedValue);
    select.disabled = !support;
}

function updateReasoningRequirement(prefix) {
    const select = document.getElementById(`${prefix}BotReasoningEffort`);
    if (!select) return;

    const support = getBotReasoningSupport(getInputValue(`${prefix}BotAiModel`));
    const apiMode = getInputValue(`${prefix}BotApiMode`) === 'chat' ? 'chat' : 'responses';
    const requiresSelection = Boolean(support) && apiMode === 'responses';

    select.required = requiresSelection;
    if (!requiresSelection) {
        select.setCustomValidity('');
        return;
    }

    if (!select.value) {
        select.setCustomValidity('กรุณาเลือก reasoning_effort สำหรับโมเดล GPT-5/o-series');
        return;
    }

    select.setCustomValidity('');
}

function validateBotConfigForm(prefix, form) {
    updateReasoningRequirement(prefix);
    const support = getBotReasoningSupport(getInputValue(`${prefix}BotAiModel`));
    const apiMode = getInputValue(`${prefix}BotApiMode`) === 'chat' ? 'chat' : 'responses';
    const reasoningSelect = document.getElementById(`${prefix}BotReasoningEffort`);

    if (support && apiMode === 'responses' && reasoningSelect && !reasoningSelect.value) {
        const collapseEl = document.getElementById(`${prefix}BotAiParams`);
        if (collapseEl && !collapseEl.classList.contains('show')) {
            bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show();
        }
        showToast('กรุณาเลือก reasoning_effort ก่อนบันทึก', 'warning');
        window.setTimeout(() => {
            reasoningSelect.focus();
            reasoningSelect.reportValidity();
        }, 220);
        return false;
    }

    if (!form) return true;
    return form.reportValidity();
}

function isReasoningModel(modelId) {
    return Boolean(getBotReasoningSupport(modelId));
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

function applyAiModeVisibility(prefix, apiMode, options = {}) {
    const mode = apiMode === 'chat' ? 'chat' : 'responses';
    const responsesSection = document.getElementById(`${prefix}BotResponsesParams`);
    const chatSection = document.getElementById(`${prefix}BotChatParams`);
    if (responsesSection) responsesSection.classList.toggle('d-none', mode !== 'responses');
    if (chatSection) chatSection.classList.toggle('d-none', mode !== 'chat');

    updateReasoningVisibility(prefix, options);
    updateChatSamplingVisibility(prefix);
}

function setAiConfigUI(prefix, config) {
    const cfg = { ...defaultAiConfig, ...(config || {}) };
    const apiMode = cfg.apiMode === 'chat' ? 'chat' : 'responses';

    setInputValue(`${prefix}BotApiMode`, apiMode);
    setRangeValue(`${prefix}BotTemperature`, cfg.temperature);
    setRangeValue(`${prefix}BotTopP`, cfg.topP);
    setRangeValue(`${prefix}BotPresencePenalty`, cfg.presencePenalty);
    setRangeValue(`${prefix}BotFrequencyPenalty`, cfg.frequencyPenalty);

    applyAiModeVisibility(prefix, apiMode, {
        selectedReasoningEffort: cfg.reasoningEffort ?? ''
    });
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
    ['line', 'facebook', 'instagram', 'whatsapp'].forEach(prefix => {
        const select = document.getElementById(`${prefix}BotApiMode`);
        if (select) {
            select.addEventListener('change', (e) => {
                applyAiModeVisibility(prefix, e.target.value);
                updateReasoningRequirement(prefix);
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
        const reasoningSelect = document.getElementById(`${prefix}BotReasoningEffort`);
        if (reasoningSelect) {
            reasoningSelect.addEventListener('change', () => updateReasoningRequirement(prefix));
        }
    });
}

function updateReasoningVisibility(prefix, options = {}) {
    const modelSelect = document.getElementById(`${prefix}BotAiModel`);
    const modelId = modelSelect ? modelSelect.value : '';
    const supported = isReasoningModel(modelId);
    const group = document.getElementById(`${prefix}BotReasoningGroup`);
    const note = document.getElementById(`${prefix}BotReasoningNote`);
    const select = document.getElementById(`${prefix}BotReasoningEffort`);
    const selectedReasoningEffort =
        options.selectedReasoningEffort !== undefined && options.selectedReasoningEffort !== null
            ? options.selectedReasoningEffort
            : (select ? select.value : '');

    populateReasoningEffortDropdown(prefix, selectedReasoningEffort);
    if (group) group.classList.toggle('d-none', !supported);
    if (note) note.classList.toggle('d-none', supported);
    if (!supported) {
        setInputValue(`${prefix}BotReasoningEffort`, '');
    }
    updateReasoningRequirement(prefix);
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

async function loadImageCollections() {
    try {
        const response = await fetch('/api/image-collections');
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) {
            throw new Error(result?.error || 'ไม่สามารถโหลดคลังรูปภาพได้');
        }
        imageCollections = Array.isArray(result.collections) ? result.collections : [];
    } catch (error) {
        console.error('Error loading image collections:', error);
        imageCollections = [];
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
    const options = buildInstructionOptions(selectedKey);
    const collectionCount = Array.isArray(bot.selectedImageCollections) ? bot.selectedImageCollections.length : 0;
    const selectedCollectionValue = getSelectedImageCollectionValue(bot);
    const collectionOptions = buildImageCollectionOptions(selectedCollectionValue, collectionCount);
    const selectedModel = String(bot.aiModel || DEFAULT_BOT_MODEL);
    const modelOptions = buildModelOptions(selectedModel);
    const currentEffort = typeof bot?.aiConfig?.reasoningEffort === 'string' ? bot.aiConfig.reasoningEffort.trim() : '';
    const reasoningOptions = buildReasoningEffortOptions(selectedModel, currentEffort);
    const reasoningDisabled = !getBotReasoningSupport(selectedModel);

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
                <select class="form-select form-select-sm image-collection-select"
                    data-bot-type="${botType}"
                    data-bot-id="${bot._id}"
                    data-previous-value="${escapeHtml(selectedCollectionValue)}"
                    aria-label="เลือกคลังรูปภาพสำหรับบอท">
                    ${collectionOptions}
                </select>
            </div>
            <div class="inline-control model-control">
                <span class="inline-label"><i class="fas fa-microchip"></i> Model</span>
                <select class="form-select form-select-sm bot-model-select"
                    data-bot-type="${botType}"
                    data-bot-id="${bot._id}"
                    data-previous-value="${escapeHtml(selectedModel)}"
                    aria-label="เลือกโมเดล AI สำหรับบอท">
                    ${modelOptions}
                </select>
            </div>
            <div class="inline-control reasoning-control">
                <span class="inline-label"><i class="fas fa-brain"></i> Reasoning</span>
                <select class="form-select form-select-sm reasoning-select"
                    data-bot-type="${botType}"
                    data-bot-id="${bot._id}"
                    data-previous-value="${escapeHtml(currentEffort)}"
                    ${reasoningDisabled ? 'disabled' : ''}
                    aria-label="เลือกระดับ reasoning effort สำหรับบอท">
                    ${reasoningOptions}
                </select>
            </div>
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

function getSelectedImageCollectionValue(bot) {
    const selections = Array.isArray(bot?.selectedImageCollections)
        ? bot.selectedImageCollections.filter(Boolean).map(String)
        : [];
    if (selections.length === 0) return '';
    if (selections.length === 1) return selections[0];
    return '__multiple__';
}

function buildImageCollectionOptions(selectedValue, selectedCount = 0) {
    const options = [
        `<option value="" ${selectedValue === '' ? 'selected' : ''}>— ทุกภาพ —</option>`
    ];

    if (selectedValue === '__multiple__') {
        options.push(`<option value="__multiple__" selected>หลายชุด (${selectedCount} ชุด)</option>`);
    }

    imageCollections.forEach((collection) => {
        const id = collection?._id ? String(collection._id) : '';
        if (!id) return;
        const label = collection.name || id;
        const selected = selectedValue === id ? 'selected' : '';
        options.push(`<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(label)}</option>`);
    });

    return options.join('');
}

function buildModelOptions(selectedValue) {
    const options = [];
    const normalizedSelectedValue = selectedValue || DEFAULT_BOT_MODEL;
    const hasSelectedInPreset = BOT_MODEL_PRESETS.includes(normalizedSelectedValue);

    if (!hasSelectedInPreset && normalizedSelectedValue) {
        options.push(`<option value="${escapeHtml(normalizedSelectedValue)}" selected>${escapeHtml(normalizedSelectedValue)} (กำหนดเอง)</option>`);
    }

    BOT_MODEL_PRESETS.forEach((modelId) => {
        const selected = normalizedSelectedValue === modelId ? 'selected' : '';
        let label = modelId;
        if (modelId === 'gpt-5.4-mini' || modelId === 'gpt-4.1-mini') {
            label += ' แนะนำ';
        }
        options.push(`<option value="${escapeHtml(modelId)}" ${selected}>${escapeHtml(label)}</option>`);
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
    if (select.classList.contains('instruction-select')) {
        const botType = select.dataset.botType;
        const botId = select.dataset.botId;
        const previousValue = select.dataset.previousValue || '';
        const key = select.value;
        saveInstructionSelection(botType, botId, key, select, previousValue);
        return;
    }

    if (select.classList.contains('image-collection-select')) {
        const botType = select.dataset.botType;
        const botId = select.dataset.botId;
        const previousValue = select.dataset.previousValue || '';
        const collectionId = select.value;
        saveImageCollectionSelection(botType, botId, collectionId, select, previousValue);
        return;
    }

    if (select.classList.contains('bot-model-select')) {
        const botType = select.dataset.botType;
        const botId = select.dataset.botId;
        const previousValue = select.dataset.previousValue || '';
        const modelId = select.value;
        saveBotModelSelection(botType, botId, modelId, select, previousValue);
        return;
    }

    if (select.classList.contains('reasoning-select')) {
        const botType = select.dataset.botType;
        const botId = select.dataset.botId;
        const previousValue = select.dataset.previousValue || '';
        const effort = select.value;
        saveBotReasoningEffortSelection(botType, botId, effort, select, previousValue);
    }
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
    const instructionUrlMap = {
        line: `/api/line-bots/${botId}/instructions`,
        facebook: `/api/facebook-bots/${botId}/instructions`,
        instagram: `/api/instagram-bots/${botId}/instructions`,
        whatsapp: `/api/whatsapp-bots/${botId}/instructions`
    };
    const url = instructionUrlMap[botType];
    if (!url) {
        showToast('ประเภทบอทไม่รองรับการตั้งค่า Instruction', 'danger');
        select.value = previousValue;
        updateInstructionChip(select, previousValue);
        return;
    }

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

async function saveImageCollectionSelection(botType, botId, collectionId, select, previousValue) {
    if (collectionId === '__multiple__') {
        select.value = previousValue;
        return;
    }

    const payload = {
        selectedImageCollections: collectionId ? [collectionId] : []
    };
    const collectionUrlMap = {
        line: `/api/line-bots/${botId}/image-collections`,
        facebook: `/api/facebook-bots/${botId}/image-collections`,
        instagram: `/api/instagram-bots/${botId}/image-collections`,
        whatsapp: `/api/whatsapp-bots/${botId}/image-collections`
    };
    const url = collectionUrlMap[botType];
    if (!url) {
        showToast('ประเภทบอทไม่รองรับการตั้งค่าคลังรูปภาพ', 'danger');
        select.value = previousValue;
        return;
    }

    select.disabled = true;
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data?.error || 'บันทึกไม่สำเร็จ');
        }

        select.dataset.previousValue = collectionId;
        showToast('อัปเดตคลังรูปภาพของบอทแล้ว', 'success');

        const imageCollectionsSection = document.getElementById('image-collections');
        if (imageCollectionsSection && !imageCollectionsSection.classList.contains('d-none')) {
            window.imageCollectionsManager?.refreshAll?.();
        }
    } catch (error) {
        console.error('Error saving image collection selection:', error);
        select.value = previousValue;
        showToast('ไม่สามารถบันทึกคลังรูปภาพได้', 'danger');
    } finally {
        select.disabled = false;
    }
}

function getBotApiEndpoint(botType, botId) {
    const endpointMap = {
        line: `/api/line-bots/${botId}`,
        facebook: `/api/facebook-bots/${botId}`,
        instagram: `/api/instagram-bots/${botId}`,
        whatsapp: `/api/whatsapp-bots/${botId}`
    };
    return endpointMap[botType] || '';
}

function getBotKeywordsEndpoint(botType, botId) {
    const endpointMap = {
        line: `/api/line-bots/${botId}/keywords`,
        facebook: `/api/facebook-bots/${botId}/keywords`,
        instagram: `/api/instagram-bots/${botId}/keywords`,
        whatsapp: `/api/whatsapp-bots/${botId}/keywords`
    };
    return endpointMap[botType] || '';
}

function normalizeKeywordSetting(setting) {
    if (!setting) return { keyword: '', response: '', sendResponse: false };
    if (typeof setting === 'string') {
        return {
            keyword: setting.trim(),
            response: '',
            sendResponse: false
        };
    }
    const response = String(setting.response || '').trim();
    const sendResponseRaw = setting.sendResponse;
    let sendResponse = undefined;
    if (typeof sendResponseRaw === 'boolean') {
        sendResponse = sendResponseRaw;
    } else if (typeof sendResponseRaw === 'string') {
        const normalized = sendResponseRaw.trim().toLowerCase();
        if (normalized === 'true') sendResponse = true;
        if (normalized === 'false') sendResponse = false;
    }
    return {
        keyword: String(setting.keyword || '').trim(),
        response,
        // Backward compatible: ถ้า schema เก่ายังไม่มี sendResponse แต่มีข้อความ ให้ถือว่าเปิดส่ง
        sendResponse: typeof sendResponse === 'boolean' ? sendResponse : response.length > 0
    };
}

function setBotKeywordModalFormValues(keywordSettings = {}) {
    const enableAI = normalizeKeywordSetting(keywordSettings.enableAI);
    const disableAI = normalizeKeywordSetting(keywordSettings.disableAI);
    const disableFollowUp = normalizeKeywordSetting(keywordSettings.disableFollowUp);

    setInputValue('botKeywordEnableAI', enableAI.keyword);
    setInputValue('botKeywordEnableAIResponse', enableAI.response);
    setCheckboxValue('botKeywordEnableAISendResponse', enableAI.sendResponse === true);
    setInputValue('botKeywordDisableAI', disableAI.keyword);
    setInputValue('botKeywordDisableAIResponse', disableAI.response);
    setCheckboxValue('botKeywordDisableAISendResponse', disableAI.sendResponse === true);
    // alsoDisableFollowUp: default true (backward compat)
    const rawAlso = keywordSettings.disableAI?.alsoDisableFollowUp;
    setCheckboxValue('botKeywordDisableAIAlsoDisableFollowUp', rawAlso !== false);
    setInputValue('botKeywordDisableFollowUp', disableFollowUp.keyword);
    setInputValue('botKeywordDisableFollowUpResponse', disableFollowUp.response);
    setCheckboxValue('botKeywordDisableFollowUpSendResponse', disableFollowUp.sendResponse === true);
}

function readBotKeywordFormValues() {
    return {
        enableAI: {
            keyword: getInputValue('botKeywordEnableAI').trim(),
            response: getInputValue('botKeywordEnableAIResponse').trim(),
            sendResponse: getCheckboxValue('botKeywordEnableAISendResponse')
        },
        disableAI: {
            keyword: getInputValue('botKeywordDisableAI').trim(),
            response: getInputValue('botKeywordDisableAIResponse').trim(),
            sendResponse: getCheckboxValue('botKeywordDisableAISendResponse'),
            alsoDisableFollowUp: getCheckboxValue('botKeywordDisableAIAlsoDisableFollowUp')
        },
        disableFollowUp: {
            keyword: getInputValue('botKeywordDisableFollowUp').trim(),
            response: getInputValue('botKeywordDisableFollowUpResponse').trim(),
            sendResponse: getCheckboxValue('botKeywordDisableFollowUpSendResponse')
        }
    };
}

function setBotKeywordModalLoading(isLoading) {
    const saveBtn = document.getElementById('saveBotKeywordBtn');
    if (saveBtn) {
        saveBtn.disabled = isLoading;
        saveBtn.innerHTML = isLoading
            ? '<i class="fas fa-spinner fa-spin me-1"></i>กำลังบันทึก...'
            : '<i class="fas fa-save me-1"></i>บันทึกคีย์เวิร์ด';
    }

    const form = document.getElementById('botKeywordForm');
    if (!form) return;
    form.querySelectorAll('input, textarea').forEach((el) => {
        if (el.id !== 'botKeywordType' && el.id !== 'botKeywordBotId') {
            el.disabled = isLoading;
        }
    });
}

window.openBotKeywordModal = async function (botType, botId) {
    if (!canUpdateBots()) return;
    const modalEl = document.getElementById('botKeywordModal');
    if (!modalEl || !botType || !botId) return;

    const endpoint = getBotApiEndpoint(botType, botId);
    if (!endpoint) {
        showToast('ประเภทบอทไม่รองรับการตั้งค่าคีย์เวิร์ด', 'danger');
        return;
    }

    botKeywordModalState.botType = botType;
    botKeywordModalState.botId = botId;
    setInputValue('botKeywordType', botType);
    setInputValue('botKeywordBotId', botId);

    const label = BOT_LABELS[botType] || 'Bot';
    const titleEl = document.getElementById('botKeywordModalLabel');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fas fa-key me-2"></i>คีย์เวิร์ดควบคุม AI (${escapeHtml(label)})`;
    }

    setBotKeywordModalFormValues({});
    setBotKeywordModalLoading(true);

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    try {
        const response = await fetch(endpoint);
        const bot = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(bot?.error || 'โหลดข้อมูลบอทไม่สำเร็จ');
        }
        setBotKeywordModalFormValues(bot.keywordSettings || {});
    } catch (error) {
        console.error('Error loading keyword settings:', error);
        showToast('ไม่สามารถโหลดคีย์เวิร์ดของบอทได้', 'danger');
    } finally {
        setBotKeywordModalLoading(false);
    }
};

async function saveBotKeywordSettings() {
    if (!canUpdateBots()) return;
    const botType = getInputValue('botKeywordType') || botKeywordModalState.botType;
    const botId = getInputValue('botKeywordBotId') || botKeywordModalState.botId;
    const endpoint = getBotKeywordsEndpoint(botType, botId);
    if (!endpoint) {
        showToast('ไม่สามารถบันทึกคีย์เวิร์ดได้', 'danger');
        return;
    }

    setBotKeywordModalLoading(true);
    try {
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keywordSettings: readBotKeywordFormValues()
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || 'บันทึกไม่สำเร็จ');
        }

        showToast(`บันทึกคีย์เวิร์ด ${BOT_LABELS[botType] || 'Bot'} เรียบร้อยแล้ว`, 'success');
        const modalEl = document.getElementById('botKeywordModal');
        const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        if (modal) modal.hide();
    } catch (error) {
        console.error('Error saving keyword settings:', error);
        showToast('ไม่สามารถบันทึกคีย์เวิร์ดได้', 'danger');
    } finally {
        setBotKeywordModalLoading(false);
    }
}

async function saveBotModelSelection(botType, botId, modelId, select, previousValue) {
    const endpoint = getBotApiEndpoint(botType, botId);
    if (!endpoint) {
        showToast('ประเภทบอทไม่รองรับการตั้งค่าโมเดล', 'danger');
        select.value = previousValue;
        return;
    }

    select.disabled = true;
    try {
        const getRes = await fetch(endpoint);
        const botData = await getRes.json().catch(() => ({}));
        if (!getRes.ok) {
            throw new Error(botData?.error || 'โหลดข้อมูลบอทไม่สำเร็จ');
        }

        const support = getBotReasoningSupport(modelId);
        const currentApiMode = botData?.aiConfig?.apiMode === 'chat' ? 'chat' : 'responses';
        const currentEffort =
            typeof botData?.aiConfig?.reasoningEffort === 'string'
                ? botData.aiConfig.reasoningEffort.trim()
                : '';

        if (support && currentApiMode === 'responses' && !support.allowed.includes(currentEffort)) {
            if (!botData.aiConfig || typeof botData.aiConfig !== 'object') {
                botData.aiConfig = {};
            }
            const defaultEffort = support.allowed.includes('low') ? 'low' : support.allowed[0];
            botData.aiConfig.reasoningEffort = defaultEffort;
        }

        botData.aiModel = modelId || DEFAULT_BOT_MODEL;
        delete botData._id;

        const updateRes = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });
        const updateData = await updateRes.json().catch(() => ({}));
        if (!updateRes.ok) {
            throw new Error(updateData?.error || 'บันทึกไม่สำเร็จ');
        }

        select.dataset.previousValue = botData.aiModel;
        showToast('อัปเดตโมเดลของบอทแล้ว', 'success');
        loadBotSettings();
    } catch (error) {
        console.error('Error saving bot model:', error);
        select.value = previousValue;
        showToast('ไม่สามารถบันทึกโมเดลได้', 'danger');
    } finally {
        select.disabled = false;
    }
}

async function saveBotReasoningEffortSelection(botType, botId, effort, select, previousValue) {
    const endpoint = getBotApiEndpoint(botType, botId);
    if (!endpoint) {
        showToast('ประเภทบอทไม่รองรับการตั้งค่า reasoning effort', 'danger');
        select.value = previousValue;
        return;
    }

    select.disabled = true;
    try {
        const getRes = await fetch(endpoint);
        const botData = await getRes.json().catch(() => ({}));
        if (!getRes.ok) {
            throw new Error(botData?.error || 'โหลดข้อมูลบอทไม่สำเร็จ');
        }

        if (!botData.aiConfig || typeof botData.aiConfig !== 'object') {
            botData.aiConfig = {};
        }
        botData.aiConfig.reasoningEffort = effort;
        delete botData._id;

        const updateRes = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });
        const updateData = await updateRes.json().catch(() => ({}));
        if (!updateRes.ok) {
            throw new Error(updateData?.error || 'บันทึกไม่สำเร็จ');
        }

        select.dataset.previousValue = effort;
        showToast('อัปเดต reasoning effort ของบอทแล้ว', 'success');
        loadBotSettings();
    } catch (error) {
        console.error('Error saving bot reasoning effort:', error);
        select.value = previousValue;
        showToast('ไม่สามารถบันทึก reasoning effort ได้', 'danger');
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
let passcodeInboxOptions = [];
const PASSCODE_ROLE_LABELS = {
    agent: 'Agent',
    team_leader: 'Team Leader',
    admin: 'Admin',
    superadmin: 'Superadmin'
};
const PASSCODE_ALL_PERMISSIONS = [
    'menu:dashboard', 'menu:settings', 'menu:instruction-ai', 'menu:api-usage', 'menu:chat',
    'menu:orders', 'menu:followup', 'menu:broadcast', 'menu:facebook-posts', 'menu:customer-stats',
    'menu:categories', 'dashboard:view', 'settings:bot', 'settings:image-library',
    'settings:data-forms', 'settings:file-library', 'settings:chat', 'settings:notifications',
    'settings:general', 'settings:security-filter', 'settings:api-key', 'audit:view', 'filter:test',
    'chat:view', 'chat:send', 'chat:forms', 'chat:files', 'chat:notes', 'chat:tags', 'chat:orders',
    'chat:templates', 'chat:forward', 'chat:assign', 'chat:debug', 'chat:clear', 'chat:ai-control',
    'chat:purchase-status', 'chat:profile-refresh', 'chat:export', 'instructions:view',
    'instructions:create', 'instructions:update', 'instructions:delete', 'instructions:manage',
    'instructions:import', 'instructions:export', 'instruction-ai:use',
    'agent-forge:manage', 'api-usage:view', 'api-usage:key-detail', 'orders:view', 'orders:update', 'orders:delete',
    'orders:export', 'orders:print', 'broadcast:view', 'broadcast:preview', 'broadcast:send',
    'broadcast:cancel', 'followup:view', 'followup:manage', 'followup:assets',
    'facebook-posts:view', 'facebook-posts:sync', 'facebook-posts:update', 'customer-stats:view',
    'image-library:view', 'image-library:manage', 'data-forms:view', 'data-forms:manage',
    'data-forms:export',
    'file-assets:view', 'file-assets:manage', 'notifications:view', 'notifications:manage',
    'categories:view', 'categories:import', 'categories:export', 'categories:manage', 'bots:view',
    'bots:create', 'bots:update', 'bots:delete', 'bots:secrets', 'bots:manage', 'api-keys:view',
    'api-keys:manage'
];
const PASSCODE_PERMISSION_GROUPS = [
    {
        title: 'Page/Bot',
        items: [
            ['menu:chat', 'แชท'], ['menu:orders', 'ออเดอร์'], ['menu:followup', 'ติดตามลูกค้า'],
            ['menu:broadcast', 'บรอดแคสต์'], ['menu:facebook-posts', 'FB โพสต์'], ['menu:customer-stats', 'สถิติลูกค้า'],
            ['menu:dashboard', 'แดชบอร์ด'], ['menu:settings', 'ตั้งค่า'], ['menu:instruction-ai', 'InstructionAI2'],
            ['menu:api-usage', 'สถิติ API'], ['menu:categories', 'จัดการข้อมูล']
        ]
    },
    {
        title: 'Settings',
        items: [
            ['settings:bot', 'จัดการบอท'], ['settings:image-library', 'คลังรูปภาพ'], ['settings:data-forms', 'Data Forms'],
            ['settings:file-library', 'คลังไฟล์'], ['settings:chat', 'แชทและคิว'], ['settings:notifications', 'แจ้งเตือนงาน'],
            ['settings:general', 'ตั้งค่าทั่วไป'], ['settings:security-filter', 'Security/Filter'], ['settings:api-key', 'API Keys'],
            ['audit:view', 'ดู Audit Logs'], ['filter:test', 'ทดสอบตัวกรอง']
        ]
    },
    {
        title: 'Chat Workspace',
        items: [
            ['chat:view', 'ดูแชท / แท็บรวม'], ['chat:send', 'ตอบแชท'], ['chat:forms', 'ฟอร์ม'], ['chat:files', 'ไฟล์'],
            ['chat:notes', 'โน้ต'], ['chat:tags', 'แท็ก'], ['chat:orders', 'ออเดอร์'], ['chat:templates', 'Templates'],
            ['chat:forward', 'ส่งต่อ'], ['chat:assign', 'มอบหมาย'], ['chat:debug', 'Debug'], ['chat:clear', 'ล้างแชท'],
            ['chat:ai-control', 'เปิด/ปิด AI'], ['chat:purchase-status', 'สถานะซื้อ'], ['chat:profile-refresh', 'Refresh profile'],
            ['chat:export', 'Export']
        ]
    },
    {
        title: 'Instructions',
        items: [
            ['dashboard:view', 'ดู Dashboard'], ['instructions:view', 'ดู Instructions'], ['instructions:create', 'สร้าง Instructions'],
            ['instructions:update', 'แก้ Instructions'], ['instructions:delete', 'ลบ Instructions'],
            ['instructions:manage', 'จัดการ Instructions ทั้งหมด'], ['instructions:import', 'Import Instructions'], ['instructions:export', 'Export Instructions'],
            ['instruction-ai:use', 'ใช้ InstructionAI2'], ['agent-forge:manage', 'Agent Forge'], ['api-usage:view', 'ดู API Usage'],
            ['api-usage:key-detail', 'ดู API Key / cost detail']
        ]
    },
    {
        title: 'Orders',
        items: [
            ['orders:view', 'ดูออเดอร์'], ['orders:update', 'แก้ออเดอร์'], ['orders:delete', 'ลบออเดอร์'],
            ['orders:export', 'Export ออเดอร์'], ['orders:print', 'พิมพ์ใบปะหน้า'],
            ['broadcast:view', 'ดู Broadcast'], ['broadcast:preview', 'Preview Broadcast'], ['broadcast:send', 'ส่ง Broadcast'],
            ['broadcast:cancel', 'ยกเลิก Broadcast'], ['followup:view', 'ดู Follow-up'], ['followup:manage', 'จัดการ Follow-up'],
            ['followup:assets', 'อัปโหลดรูป Follow-up'], ['facebook-posts:view', 'ดูโพสต์ FB'],
            ['facebook-posts:sync', 'ดึงโพสต์ FB'], ['facebook-posts:update', 'ตั้งค่าโพสต์ FB'],
            ['customer-stats:view', 'ดูสถิติลูกค้า']
        ]
    },
    {
        title: 'Forms / Assets',
        items: [
            ['image-library:view', 'ดูคลังรูป'], ['image-library:manage', 'จัดการคลังรูป'],
            ['data-forms:view', 'ดู Data Forms'], ['data-forms:manage', 'จัดการ Data Forms'],
            ['data-forms:export', 'Export ข้อมูลฟอร์ม'],
            ['file-assets:view', 'ดูคลังไฟล์'], ['file-assets:manage', 'จัดการไฟล์'],
            ['categories:view', 'ดู Categories'], ['categories:import', 'Import Categories'],
            ['categories:export', 'Export Categories'], ['categories:manage', 'จัดการ Categories']
        ]
    },
    {
        title: 'Bots / API Keys',
        items: [
            ['bots:view', 'ดู Bots'], ['bots:create', 'สร้าง Bots'], ['bots:update', 'แก้ Bots'],
            ['bots:delete', 'ลบ Bots'], ['bots:secrets', 'Secrets ของ Bots'], ['bots:manage', 'Bot APIs ทั้งหมด'],
            ['notifications:view', 'ดูแจ้งเตือน'], ['notifications:manage', 'จัดการแจ้งเตือน'],
            ['api-keys:view', 'ดู API Keys'], ['api-keys:manage', 'จัดการ API Keys']
        ]
    }
];
const PASSCODE_ROLE_DEFAULTS = {
    agent: ['menu:chat', 'chat:view', 'chat:send', 'chat:forms'],
    team_leader: PASSCODE_ALL_PERMISSIONS.filter(permission => ![
        'settings:general', 'settings:security-filter', 'settings:api-key', 'audit:view',
        'filter:test', 'bots:secrets', 'api-keys:view', 'api-keys:manage', 'api-usage:key-detail'
    ].includes(permission)),
    admin: PASSCODE_ALL_PERMISSIONS
};
const PASSCODE_ACCESS_PRESETS = {
    support: {
        label: 'Support',
        role: 'agent',
        permissions: [
            'menu:chat', 'chat:view', 'chat:send', 'chat:forms', 'chat:notes',
            'chat:tags', 'chat:ai-control', 'data-forms:view'
        ],
        chatLayout: { mode: 'custom', allowedTabs: ['overview', 'forms', 'notes', 'tags'] },
        instructionAccess: { mode: 'selected', instructionIds: [] },
        inboxAccess: { mode: 'selected', inboxKeys: [] }
    },
    order_staff: {
        label: 'Order Staff',
        role: 'agent',
        permissions: [
            'menu:chat', 'menu:orders', 'chat:view', 'chat:send', 'chat:orders',
            'orders:view', 'orders:update', 'orders:print', 'data-forms:view'
        ],
        chatLayout: { mode: 'custom', allowedTabs: ['overview', 'orders', 'forms'] },
        instructionAccess: { mode: 'selected', instructionIds: [] },
        inboxAccess: { mode: 'selected', inboxKeys: [] }
    },
    content_instruction_editor: {
        label: 'Content/Instruction Editor',
        role: 'team_leader',
        permissions: [
            'menu:instruction-ai', 'menu:settings', 'instruction-ai:use',
            'instructions:view', 'instructions:create', 'instructions:update',
            'instructions:import', 'instructions:export', 'settings:image-library',
            'image-library:view', 'image-library:manage', 'settings:file-library',
            'file-assets:view', 'file-assets:manage', 'categories:view', 'categories:manage'
        ],
        chatLayout: { mode: 'custom', allowedTabs: [] },
        instructionAccess: { mode: 'selected', instructionIds: [] },
        inboxAccess: { mode: 'selected', inboxKeys: [] }
    },
    bot_maintainer: {
        label: 'Bot Maintainer',
        role: 'team_leader',
        permissions: [
            'menu:settings', 'settings:bot', 'settings:image-library', 'settings:file-library',
            'bots:view', 'bots:create', 'bots:update', 'image-library:view',
            'image-library:manage', 'file-assets:view', 'file-assets:manage'
        ],
        chatLayout: { mode: 'custom', allowedTabs: [] },
        instructionAccess: { mode: 'all', instructionIds: [] },
        inboxAccess: { mode: 'selected', inboxKeys: [] }
    },
    finance_api_viewer: {
        label: 'Finance/API Viewer',
        role: 'team_leader',
        permissions: [
            'menu:api-usage', 'menu:orders', 'api-usage:view', 'api-usage:key-detail',
            'orders:view', 'orders:export', 'settings:api-key', 'api-keys:view'
        ],
        chatLayout: { mode: 'custom', allowedTabs: [] },
        instructionAccess: { mode: 'selected', instructionIds: [] },
        inboxAccess: { mode: 'selected', inboxKeys: [] }
    }
};
const PASSCODE_CHAT_TABS = [
    ['overview', 'รวม'], ['tags', 'แท็ก'], ['forms', 'ฟอร์ม'], ['orders', 'Order'],
    ['files', 'ไฟล์'], ['notes', 'โน้ต'], ['tools', 'Tools']
];
const PASSCODE_LAYOUT_DEFAULTS = {
    agent: { mode: 'forms_only', allowedTabs: ['forms'] },
    team_leader: { mode: 'full', allowedTabs: PASSCODE_CHAT_TABS.map(([key]) => key) },
    admin: { mode: 'full', allowedTabs: PASSCODE_CHAT_TABS.map(([key]) => key) }
};
const PASSCODE_INSTRUCTION_DEFAULTS = {
    agent: { mode: 'selected', instructionIds: [] },
    team_leader: { mode: 'all', instructionIds: [] },
    admin: { mode: 'all', instructionIds: [] }
};

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
    renderPasscodePermissionGrid(PASSCODE_ROLE_DEFAULTS.agent);
    renderPasscodeInboxGrid([]);
    renderPasscodeChatLayoutTabs(PASSCODE_LAYOUT_DEFAULTS.agent.allowedTabs);
    renderPasscodeInstructionGrid([]);
    renderPasscodeEffectivePreview();
    renderPasscodeDiffPreview();
    loadPasscodeInboxOptions();
    loadPasscodeInstructionOptions();
    refreshPasscodeList();
}

function setupPasscodeEventListeners() {
    const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
    const createContainer = document.getElementById('passcodeCreateContainer');
    const createForm = document.getElementById('createPasscodeForm');
    const generateBtn = document.getElementById('generatePasscodeBtn');
    const resetBtn = document.getElementById('passcodeResetBtn');
    const tableBody = document.getElementById('passcodeTableBody');
    const roleSelect = document.getElementById('newPasscodeRole');
    const inboxMode = document.getElementById('passcodeInboxMode');
    const instructionMode = document.getElementById('passcodeInstructionMode');
    const layoutMode = document.getElementById('passcodeChatLayoutMode');
    const presetSelect = document.getElementById('passcodeRolePreset');
    const applyPresetBtn = document.getElementById('applyPasscodePresetBtn');

    if (toggleBtn && createContainer) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = createContainer.style.display !== 'none';
            createContainer.style.display = isVisible ? 'none' : 'block';
            toggleBtn.innerHTML = isVisible
                ? '<i class="fas fa-plus-circle"></i> สร้างรหัสใหม่'
                : '<i class="fas fa-times-circle"></i> ยกเลิก';
            if (isVisible) resetPasscodeForm();
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

    if (resetBtn) {
        resetBtn.addEventListener('click', () => resetPasscodeForm());
    }

    if (createForm) {
        createForm.addEventListener('submit', handleCreatePasscode);
        createForm.addEventListener('change', () => {
            renderPasscodeEffectivePreview();
            renderPasscodeDiffPreview();
        });
        createForm.addEventListener('input', () => {
            renderPasscodeEffectivePreview();
            renderPasscodeDiffPreview();
        });
    }

    if (tableBody) {
        tableBody.addEventListener('click', handlePasscodeTableClick);
    }

    if (roleSelect) {
        roleSelect.addEventListener('change', () => applyPasscodeRolePreset(roleSelect.value));
    }
    if (applyPresetBtn && presetSelect) {
        applyPresetBtn.addEventListener('click', () => applyPasscodeAccessPreset(presetSelect.value));
    }
    if (inboxMode) {
        inboxMode.addEventListener('change', () => {
            const grid = document.getElementById('passcodeInboxGrid');
            if (grid) grid.classList.toggle('opacity-50', inboxMode.value === 'all');
            renderPasscodeEffectivePreview();
            renderPasscodeDiffPreview();
        });
    }
    if (instructionMode) {
        instructionMode.addEventListener('change', () => {
            renderPasscodeInstructionGrid(passcodeInstructionSelectedIds);
            renderPasscodeEffectivePreview();
            renderPasscodeDiffPreview();
        });
    }
    if (layoutMode) {
        layoutMode.addEventListener('change', () => {
            const preset = layoutMode.value === 'overview_only'
                ? { allowedTabs: ['overview'] }
                : layoutMode.value === 'forms_only'
                    ? { allowedTabs: ['forms'] }
                    : layoutMode.value === 'full'
                        ? PASSCODE_LAYOUT_DEFAULTS.admin
                        : { allowedTabs: getCheckedValues('passcodeChatTab') };
            renderPasscodeChatLayoutTabs(preset.allowedTabs);
            renderPasscodeEffectivePreview();
            renderPasscodeDiffPreview();
        });
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

async function loadPasscodeInboxOptions() {
    try {
        const response = await fetch('/admin/chat/inboxes?limit=500');
        const payload = await response.json();
        passcodeInboxOptions = Array.isArray(payload.inboxes) ? payload.inboxes : [];
    } catch (error) {
        console.warn('[Passcode] cannot load inbox options:', error);
        passcodeInboxOptions = [];
    }
    const selected = getCheckedValues('passcodeInboxKey');
    renderPasscodeInboxGrid(selected);
    renderPasscodeEffectivePreview();
    renderPasscodeDiffPreview();
}

async function loadPasscodeInstructionOptions() {
    try {
        const response = await fetch('/api/instructions-v2');
        const payload = await response.json();
        if (!response.ok || payload?.success === false) {
            throw new Error(payload?.error || 'ไม่สามารถโหลดรายการ Instructions ได้');
        }
        passcodeInstructionOptions = (Array.isArray(payload.instructions) ? payload.instructions : [])
            .map(instruction => ({
                id: String(instruction._id || instruction.id || instruction.instructionId || '').trim(),
                instructionId: String(instruction.instructionId || '').trim(),
                name: instruction.name || instruction.title || 'Untitled Instruction',
                updatedAt: instruction.updatedAt || instruction.createdAt || null
            }))
            .filter(instruction => instruction.id);
    } catch (error) {
        console.warn('[Passcode] cannot load instruction options:', error);
        passcodeInstructionOptions = [];
    }
    renderPasscodeInstructionGrid(passcodeInstructionSelectedIds);
    renderPasscodeEffectivePreview();
    renderPasscodeDiffPreview();
}

function renderPasscodePermissionGrid(selected = []) {
    const grid = document.getElementById('passcodePermissionGrid');
    if (!grid) return;
    const selectedSet = new Set(selected);
    grid.innerHTML = PASSCODE_PERMISSION_GROUPS.map(group => `
        <div class="passcode-permission-group">
            <div class="passcode-permission-group-title">
                <span>${escapeHtml(group.title)}</span>
                <small>${group.items.length} สิทธิ์</small>
            </div>
            <div class="passcode-check-grid">
                ${group.items.map(([value, label]) => `
                    <label class="passcode-check-item">
                        <input type="checkbox" name="passcodePermission" value="${escapeHtml(value)}" ${selectedSet.has(value) ? 'checked' : ''}>
                        <span>${escapeHtml(label)}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderPasscodeInboxGrid(selected = []) {
    const grid = document.getElementById('passcodeInboxGrid');
    if (!grid) return;
    const selectedSet = new Set(selected);
    if (!passcodeInboxOptions.length) {
        grid.innerHTML = '<div class="passcode-empty-note">ยังไม่มี Inbox หรือยังโหลดรายการไม่ได้</div>';
        return;
    }
    grid.innerHTML = passcodeInboxOptions.map(inbox => `
        <label class="passcode-check-item passcode-check-item--stack">
            <input type="checkbox" name="passcodeInboxKey" value="${escapeHtml(inbox.inboxKey)}" ${selectedSet.has(inbox.inboxKey) ? 'checked' : ''}>
            <span>
                <span>${escapeHtml(inbox.channelLabel || inbox.inboxKey)}</span>
                ${inbox.conversationCount ? `<small>${inbox.conversationCount} conversations</small>` : ''}
            </span>
        </label>
    `).join('');
}

function renderPasscodeInstructionGrid(selected = []) {
    const grid = document.getElementById('passcodeInstructionGrid');
    if (!grid) return;
    passcodeInstructionSelectedIds = Array.isArray(selected) ? selected.filter(Boolean) : [];
    const selectedSet = new Set(passcodeInstructionSelectedIds);
    const mode = document.getElementById('passcodeInstructionMode')?.value || 'selected';
    grid.classList.toggle('opacity-50', mode === 'all');
    if (!passcodeInstructionOptions.length) {
        grid.innerHTML = '<div class="passcode-empty-note">ยังไม่มี Instruction หรือยังโหลดรายการไม่ได้</div>';
        return;
    }
    grid.innerHTML = passcodeInstructionOptions.map(instruction => `
        <label class="passcode-check-item passcode-check-item--stack">
            <input type="checkbox" name="passcodeInstructionId" value="${escapeHtml(instruction.id)}" ${selectedSet.has(instruction.id) || selectedSet.has(instruction.instructionId) ? 'checked' : ''} ${mode === 'all' ? 'disabled' : ''}>
            <span>
                <span>${escapeHtml(instruction.name)}</span>
                ${instruction.updatedAt ? `<small>${escapeHtml(formatPasscodeDate(instruction.updatedAt))}</small>` : ''}
            </span>
        </label>
    `).join('');
}

function renderPasscodeChatLayoutTabs(selected = []) {
    const grid = document.getElementById('passcodeChatLayoutTabs');
    if (!grid) return;
    const selectedSet = new Set(selected);
    const isCustomMode = (document.getElementById('passcodeChatLayoutMode')?.value || 'custom') === 'custom';
    grid.innerHTML = PASSCODE_CHAT_TABS.map(([value, label]) => `
        <label class="passcode-check-item">
            <input type="checkbox" name="passcodeChatTab" value="${escapeHtml(value)}" ${selectedSet.has(value) ? 'checked' : ''} ${isCustomMode ? '' : 'disabled'}>
            <span>${escapeHtml(label)}</span>
        </label>
    `).join('');
}

function getCheckedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
        .map(input => input.value)
        .filter(Boolean);
}

function getInboxLabelByKey(key) {
    const inbox = passcodeInboxOptions.find(item => item.inboxKey === key);
    return inbox?.channelLabel || key;
}

function getInstructionLabelById(id) {
    const instruction = passcodeInstructionOptions.find(item =>
        item.id === id || item.instructionId === id
    );
    return instruction?.name || id;
}

function formatAccessList(items = [], emptyLabel = 'ไม่มี') {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return `<span class="passcode-preview-empty">${escapeHtml(emptyLabel)}</span>`;
    const visible = values.slice(0, 6).map(item => `<span>${escapeHtml(item)}</span>`).join('');
    const more = values.length > 6 ? `<span class="passcode-preview-more">+${values.length - 6}</span>` : '';
    return `${visible}${more}`;
}

function summarizePermissionsForPreview(permissions = []) {
    const selectedSet = new Set(permissions);
    return PASSCODE_PERMISSION_GROUPS
        .map(group => ({
            title: group.title,
            count: group.items.filter(([permission]) => selectedSet.has(permission)).length,
            total: group.items.length
        }))
        .filter(group => group.count > 0)
        .map(group => `${group.title} ${group.count}/${group.total}`);
}

function renderPasscodeEffectivePreview() {
    const wrap = document.getElementById('passcodeEffectivePreview');
    if (!wrap) return;
    const payload = collectPasscodePayload(false);
    const menuLabels = PASSCODE_PERMISSION_GROUPS[0].items
        .filter(([permission]) => payload.permissions.includes(permission))
        .map(([, label]) => label);
    const inboxLabels = payload.inboxAccess.mode === 'all'
        ? ['ทุก Inbox']
        : (payload.inboxAccess.inboxKeys || []).map(getInboxLabelByKey);
    const instructionLabels = payload.instructionAccess.mode === 'all'
        ? ['ทุก Instructions']
        : (payload.instructionAccess.instructionIds || []).map(getInstructionLabelById);
    const tabLabels = (payload.chatLayout.allowedTabs || []).map(tab => {
        const found = PASSCODE_CHAT_TABS.find(([key]) => key === tab);
        return found ? found[1] : tab;
    });
    const permissionSummary = summarizePermissionsForPreview(payload.permissions);

    wrap.innerHTML = `
        <div class="passcode-preview-grid">
            <div>
                <strong>เมนู</strong>
                <div>${formatAccessList(menuLabels, 'ไม่เห็นเมนูหลัก')}</div>
            </div>
            <div>
                <strong>Inbox / Bot</strong>
                <div>${formatAccessList(inboxLabels, 'ไม่เห็น Inbox')}</div>
            </div>
            <div>
                <strong>Chat tabs</strong>
                <div>${formatAccessList(tabLabels, 'ไม่เห็นแท็บ Chat')}</div>
            </div>
            <div>
                <strong>Instructions</strong>
                <div>${formatAccessList(instructionLabels, 'เฉพาะที่สร้างเอง/ที่เลือก')}</div>
            </div>
            <div class="passcode-preview-wide">
                <strong>Permission matrix</strong>
                <div>${formatAccessList(permissionSummary, 'ยังไม่ได้เลือกสิทธิ์')}</div>
            </div>
        </div>
    `;
}

function stableList(values = []) {
    return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].sort();
}

function listDiff(before = [], after = [], label = '') {
    const beforeSet = new Set(stableList(before));
    const afterSet = new Set(stableList(after));
    const added = [...afterSet].filter(value => !beforeSet.has(value));
    const removed = [...beforeSet].filter(value => !afterSet.has(value));
    const changes = [];
    if (added.length) changes.push(`${label} เพิ่ม ${added.length}`);
    if (removed.length) changes.push(`${label} เอาออก ${removed.length}`);
    return changes;
}

function buildPasscodeDiff(existing, payload) {
    if (!existing || !payload) return [];
    const changes = [];
    if ((existing.label || '') !== (payload.label || '')) changes.push('ชื่อรหัส');
    if ((existing.role || '') !== (payload.role || '')) changes.push('Role');
    changes.push(...listDiff(existing.permissions || [], payload.permissions || [], 'Permission'));
    changes.push(...listDiff(existing.inboxAccess?.inboxKeys || [], payload.inboxAccess?.inboxKeys || [], 'Inbox'));
    if ((existing.inboxAccess?.mode || 'selected') !== (payload.inboxAccess?.mode || 'selected')) changes.push('Inbox mode');
    changes.push(...listDiff(existing.instructionAccess?.instructionIds || [], payload.instructionAccess?.instructionIds || [], 'Instruction'));
    if ((existing.instructionAccess?.mode || 'selected') !== (payload.instructionAccess?.mode || 'selected')) changes.push('Instruction mode');
    changes.push(...listDiff(existing.chatLayout?.allowedTabs || [], payload.chatLayout?.allowedTabs || [], 'Chat tab'));
    if ((existing.chatLayout?.mode || 'custom') !== (payload.chatLayout?.mode || 'custom')) changes.push('Chat layout mode');
    return changes;
}

function renderPasscodeDiffPreview() {
    const wrap = document.getElementById('passcodeDiffPreview');
    if (!wrap) return;
    const editingId = document.getElementById('editingPasscodeId')?.value || '';
    if (!editingId) {
        wrap.innerHTML = '<span>สร้างใหม่: จะแสดง diff เมื่อแก้ไขผู้ใช้เดิม</span>';
        return;
    }
    const existing = passcodeCache.find(item => item.id === editingId);
    const diff = buildPasscodeDiff(existing, collectPasscodePayload(false));
    wrap.innerHTML = diff.length
        ? `<strong>Diff ก่อนบันทึก</strong><span>${diff.map(escapeHtml).join(' • ')}</span>`
        : '<span>ไม่มีการเปลี่ยนแปลงจากค่าที่บันทึกไว้</span>';
}

function applyPasscodeAccessPreset(presetKey) {
    const preset = PASSCODE_ACCESS_PRESETS[presetKey];
    if (!preset) return;
    const roleSelect = document.getElementById('newPasscodeRole');
    if (roleSelect) roleSelect.value = preset.role;
    renderPasscodePermissionGrid(preset.permissions);
    const inboxMode = document.getElementById('passcodeInboxMode');
    if (inboxMode) inboxMode.value = preset.inboxAccess.mode;
    renderPasscodeInboxGrid(preset.inboxAccess.inboxKeys);
    const instructionMode = document.getElementById('passcodeInstructionMode');
    if (instructionMode) instructionMode.value = preset.instructionAccess.mode;
    renderPasscodeInstructionGrid(preset.instructionAccess.instructionIds);
    const layoutMode = document.getElementById('passcodeChatLayoutMode');
    if (layoutMode) layoutMode.value = preset.chatLayout.mode;
    renderPasscodeChatLayoutTabs(preset.chatLayout.allowedTabs);
    renderPasscodeEffectivePreview();
    renderPasscodeDiffPreview();
}

function applyPasscodeRolePreset(role) {
    const normalizedRole = PASSCODE_ROLE_DEFAULTS[role] ? role : 'agent';
    renderPasscodePermissionGrid(PASSCODE_ROLE_DEFAULTS[normalizedRole]);
    const instructionAccess = PASSCODE_INSTRUCTION_DEFAULTS[normalizedRole] || PASSCODE_INSTRUCTION_DEFAULTS.agent;
    const instructionMode = document.getElementById('passcodeInstructionMode');
    if (instructionMode) instructionMode.value = instructionAccess.mode;
    renderPasscodeInstructionGrid(instructionAccess.instructionIds);
    const layout = PASSCODE_LAYOUT_DEFAULTS[normalizedRole] || PASSCODE_LAYOUT_DEFAULTS.agent;
    const layoutMode = document.getElementById('passcodeChatLayoutMode');
    if (layoutMode) layoutMode.value = layout.mode;
    renderPasscodeChatLayoutTabs(layout.allowedTabs);
    const inboxMode = document.getElementById('passcodeInboxMode');
    if (inboxMode) inboxMode.value = normalizedRole === 'admin' ? 'all' : 'selected';
    renderPasscodeInboxGrid([]);
    renderPasscodeEffectivePreview();
    renderPasscodeDiffPreview();
}

function resetPasscodeForm() {
    const form = document.getElementById('createPasscodeForm');
    if (form) form.reset();
    const editingInput = document.getElementById('editingPasscodeId');
    if (editingInput) editingInput.value = '';
    const passcodeInput = document.getElementById('newPasscodeValue');
    if (passcodeInput) {
        passcodeInput.required = true;
        passcodeInput.placeholder = 'กำหนดเองหรือกดสุ่ม';
    }
    const requiredMark = document.getElementById('newPasscodeRequiredMark');
    if (requiredMark) requiredMark.style.display = '';
    const submitBtn = document.getElementById('createPasscodeSubmitBtn');
    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> บันทึกผู้ใช้';
    const editorTitle = document.getElementById('passcodeEditorTitle');
    if (editorTitle) editorTitle.textContent = 'สร้างผู้ใช้ทีมงาน';
    const roleSelect = document.getElementById('newPasscodeRole');
    if (roleSelect) roleSelect.value = 'agent';
    applyPasscodeRolePreset('agent');
}

function loadPasscodeIntoForm(passcode) {
    if (!passcode) return;
    const createContainer = document.getElementById('passcodeCreateContainer');
    const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
    if (createContainer) createContainer.style.display = 'block';
    if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-times-circle"></i> ยกเลิก';
    document.getElementById('editingPasscodeId').value = passcode.id || '';
    document.getElementById('newPasscodeLabel').value = passcode.label || '';
    const passcodeInput = document.getElementById('newPasscodeValue');
    if (passcodeInput) {
        passcodeInput.value = '';
        passcodeInput.required = false;
        passcodeInput.placeholder = 'ไม่ต้องกรอกเมื่อแก้ไขสิทธิ์';
    }
    const requiredMark = document.getElementById('newPasscodeRequiredMark');
    if (requiredMark) requiredMark.style.display = 'none';
    const role = passcode.role || 'admin';
    document.getElementById('newPasscodeRole').value = role === 'superadmin' ? 'admin' : role;
    renderPasscodePermissionGrid(passcode.permissions || PASSCODE_ROLE_DEFAULTS[role] || PASSCODE_ROLE_DEFAULTS.admin);
    const instructionAccess = passcode.instructionAccess || PASSCODE_INSTRUCTION_DEFAULTS[role] || PASSCODE_INSTRUCTION_DEFAULTS.admin;
    const instructionMode = document.getElementById('passcodeInstructionMode');
    if (instructionMode) instructionMode.value = instructionAccess.mode || 'selected';
    renderPasscodeInstructionGrid(instructionAccess.instructionIds || []);
    const inboxMode = document.getElementById('passcodeInboxMode');
    if (inboxMode) inboxMode.value = passcode.inboxAccess?.mode || 'selected';
    renderPasscodeInboxGrid(passcode.inboxAccess?.inboxKeys || []);
    const layout = passcode.chatLayout || PASSCODE_LAYOUT_DEFAULTS[role] || PASSCODE_LAYOUT_DEFAULTS.admin;
    const layoutMode = document.getElementById('passcodeChatLayoutMode');
    if (layoutMode) layoutMode.value = layout.mode || 'full';
    renderPasscodeChatLayoutTabs(layout.allowedTabs || PASSCODE_LAYOUT_DEFAULTS.admin.allowedTabs);
    const submitBtn = document.getElementById('createPasscodeSubmitBtn');
    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> อัปเดตสิทธิ์';
    const editorTitle = document.getElementById('passcodeEditorTitle');
    if (editorTitle) editorTitle.textContent = `แก้ไขสิทธิ์: ${passcode.label || 'ผู้ใช้ทีมงาน'}`;
    renderPasscodeEffectivePreview();
    renderPasscodeDiffPreview();
    createContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clonePasscodeIntoForm(passcode) {
    if (!passcode) return;
    loadPasscodeIntoForm(passcode);
    const editingInput = document.getElementById('editingPasscodeId');
    if (editingInput) editingInput.value = '';
    const labelInput = document.getElementById('newPasscodeLabel');
    if (labelInput) labelInput.value = `${passcode.label || 'ผู้ใช้ทีมงาน'} copy`;
    const passcodeInput = document.getElementById('newPasscodeValue');
    if (passcodeInput) {
        passcodeInput.value = generateRandomPasscode();
        passcodeInput.required = true;
        passcodeInput.placeholder = 'กำหนดเองหรือกดสุ่ม';
    }
    const requiredMark = document.getElementById('newPasscodeRequiredMark');
    if (requiredMark) requiredMark.style.display = '';
    const submitBtn = document.getElementById('createPasscodeSubmitBtn');
    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-copy"></i> บันทึกสำเนา';
    const editorTitle = document.getElementById('passcodeEditorTitle');
    if (editorTitle) editorTitle.textContent = `Clone จาก: ${passcode.label || 'ผู้ใช้ทีมงาน'}`;
    renderPasscodeEffectivePreview();
    renderPasscodeDiffPreview();
}

function collectPasscodePayload(includePasscode) {
    const role = document.getElementById('newPasscodeRole')?.value || 'agent';
    const inboxMode = document.getElementById('passcodeInboxMode')?.value || 'selected';
    const instructionMode = document.getElementById('passcodeInstructionMode')?.value || 'selected';
    const layoutMode = document.getElementById('passcodeChatLayoutMode')?.value || 'forms_only';
    const payload = {
        label: (document.getElementById('newPasscodeLabel')?.value || '').trim(),
        role,
        permissions: getCheckedValues('passcodePermission'),
        inboxAccess: {
            mode: inboxMode,
            inboxKeys: inboxMode === 'all' ? [] : getCheckedValues('passcodeInboxKey')
        },
        instructionAccess: {
            mode: instructionMode,
            instructionIds: instructionMode === 'all' ? [] : getCheckedValues('passcodeInstructionId')
        },
        chatLayout: {
            mode: layoutMode,
            allowedTabs: layoutMode === 'full'
                ? PASSCODE_LAYOUT_DEFAULTS.admin.allowedTabs
                : layoutMode === 'overview_only'
                    ? ['overview']
                    : layoutMode === 'forms_only'
                        ? ['forms']
                        : getCheckedValues('passcodeChatTab')
        }
    };
    if (includePasscode) {
        payload.passcode = (document.getElementById('newPasscodeValue')?.value || '').trim();
    }
    return payload;
}

function summarizeInboxAccess(inboxAccess = {}) {
    if (inboxAccess.mode === 'all') return 'ทุก Inbox';
    const keys = Array.isArray(inboxAccess.inboxKeys) ? inboxAccess.inboxKeys : [];
    if (!keys.length) return 'ไม่เห็น Inbox';
    return keys.slice(0, 3).join(', ') + (keys.length > 3 ? ` +${keys.length - 3}` : '');
}

function summarizeInstructionAccess(instructionAccess = {}) {
    if (instructionAccess.mode === 'all') return 'ทุก Instructions';
    const ids = Array.isArray(instructionAccess.instructionIds) ? instructionAccess.instructionIds : [];
    if (!ids.length) return 'เฉพาะที่สร้างเอง';
    return `${ids.length} Instructions + ที่สร้างเอง`;
}

function summarizeChatLayout(chatLayout = {}) {
    if (chatLayout.mode === 'full') return 'เต็มทั้งหมด';
    if (chatLayout.mode === 'overview_only') return 'รวมเท่านั้น';
    if (chatLayout.mode === 'forms_only') return 'Chat + Form';
    const tabs = Array.isArray(chatLayout.allowedTabs) ? chatLayout.allowedTabs : [];
    if (!tabs.length) return 'ไม่ระบุ Layout';
    return `${tabs.length} tabs`;
}

function getRoleClass(role = '') {
    const normalized = String(role || 'admin').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    return `role-${normalized}`;
}

function getPasscodeInitial(label = '') {
    const text = String(label || 'A').trim();
    return (text.charAt(0) || 'A').toUpperCase();
}

function formatPasscodeDate(value) {
    if (!value) return 'ไม่เคยใช้';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'ไม่เคยใช้';
    return date.toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderPasscodeStats() {
    const wrap = document.getElementById('passcodeStats');
    if (!wrap) return;
    const total = passcodeCache.length;
    const active = passcodeCache.filter(passcode => passcode.isActive !== false).length;
    const allInbox = passcodeCache.filter(passcode => passcode.inboxAccess?.mode === 'all').length;
    const neverUsed = passcodeCache.filter(passcode => !passcode.lastUsedAt).length;
    const cards = [
        ['ทั้งหมด', total],
        ['เปิดใช้งาน', active],
        ['เห็นทุก Inbox', allInbox],
        ['ยังไม่เคยใช้', neverUsed]
    ];
    wrap.innerHTML = cards.map(([label, value]) => `
        <div class="passcode-stat">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `).join('');
}

function renderInboxAccess(inboxAccess = {}) {
    if (inboxAccess.mode === 'all') {
        return '<span class="passcode-chip passcode-chip--green">ทุก Inbox</span>';
    }
    const keys = Array.isArray(inboxAccess.inboxKeys) ? inboxAccess.inboxKeys : [];
    if (!keys.length) {
        return '<span class="passcode-chip passcode-chip--muted">ไม่เห็น Inbox</span>';
    }
    const chips = keys.slice(0, 2).map(key => `<span class="passcode-chip">${escapeHtml(key)}</span>`);
    if (keys.length > 2) chips.push(`<span class="passcode-chip passcode-chip--muted">+${keys.length - 2}</span>`);
    return chips.join('');
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
        renderPasscodeStats();
        renderPasscodeTable();
        setPasscodeMessage('', '');
    } catch (error) {
        console.error('[Passcode] load error:', error);
        renderPasscodeStats();
        setPasscodeMessage('danger', error.message || 'ไม่สามารถโหลดข้อมูลรหัสผ่านได้');
    }
}

function renderPasscodeTable() {
    const tbody = document.getElementById('passcodeTableBody');
    if (!tbody) return;
    renderPasscodeStats();

    if (passcodeCache.length === 0) {
        tbody.innerHTML = `
            <tr id="passcodeEmptyState">
                <td colspan="7">
                    <div class="passcode-empty-state">
                        <i class="fas fa-key"></i>
                        <strong>ยังไม่มีรหัสสำหรับทีมงาน</strong>
                        <span>เริ่มสร้างผู้ใช้ทีมงานชุดแรกจากปุ่มด้านบน</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = passcodeCache.map(passcode => {
        const statusText = passcode.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
        const toggleIcon = passcode.isActive ? 'toggle-on' : 'toggle-off';
        const permissionCount = Array.isArray(passcode.permissions) ? passcode.permissions.length : 0;
        const roleLabel = PASSCODE_ROLE_LABELS[passcode.role] || passcode.role || 'Admin';
        const roleClass = getRoleClass(passcode.role);
        const layoutSummary = summarizeChatLayout(passcode.chatLayout);
        const instructionSummary = summarizeInstructionAccess(passcode.instructionAccess);

        return `
            <tr class="${passcode.isActive ? '' : 'is-disabled'}">
                <td>
                    <div class="passcode-user-cell">
                        <span class="passcode-avatar">${escapeHtml(getPasscodeInitial(passcode.label))}</span>
                        <div>
                            <strong>${escapeHtml(passcode.label)}</strong>
                            <small>${escapeHtml(passcode.id || '')}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="passcode-role-badge ${escapeHtml(roleClass)}">${escapeHtml(roleLabel)}</span>
                    <small class="passcode-cell-note">${permissionCount} permissions</small>
                </td>
                <td>
                    <div class="passcode-chip-row">${renderInboxAccess(passcode.inboxAccess)}</div>
                    <small class="passcode-cell-note">${escapeHtml(layoutSummary)}</small>
                    <small class="passcode-cell-note">${escapeHtml(instructionSummary)}</small>
                </td>
                <td><span class="passcode-status ${passcode.isActive ? 'is-active' : 'is-inactive'}">${statusText}</span></td>
                <td>
                    <span class="passcode-date">${escapeHtml(formatPasscodeDate(passcode.lastUsedAt))}</span>
                    ${passcode.updatedAt ? `<small class="passcode-cell-note">แก้ไข ${escapeHtml(formatPasscodeDate(passcode.updatedAt))}</small>` : ''}
                </td>
                <td><strong class="passcode-usage-count">${passcode.usageCount || 0}</strong></td>
                <td class="text-end">
                    <div class="passcode-row-actions">
                    <button class="passcode-icon-action"
                            data-action="edit" data-id="${passcode.id}" title="แก้ไขสิทธิ์">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="passcode-icon-action"
                            data-action="clone" data-id="${passcode.id}" title="Clone ผู้ใช้/Role">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="passcode-icon-action ${passcode.isActive ? 'is-warning' : 'is-success'}"
                            data-action="toggle" data-id="${passcode.id}" title="${passcode.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}">
                        <i class="fas fa-${toggleIcon}"></i>
                    </button>
                    <button class="passcode-icon-action is-danger"
                            data-action="delete" data-id="${passcode.id}" title="ลบผู้ใช้">
                        <i class="fas fa-trash"></i>
                    </button>
                    </div>
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
    } else if (action === 'edit') {
        loadPasscodeIntoForm(passcodeCache.find(item => item.id === id));
    } else if (action === 'clone') {
        clonePasscodeIntoForm(passcodeCache.find(item => item.id === id));
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
    const editingId = document.getElementById('editingPasscodeId')?.value || '';

    if (!labelInput || !passcodeInput || !submitBtn) return;

    const payload = collectPasscodePayload(!editingId);
    const label = payload.label;
    const passcode = payload.passcode || '';

    if (!label || label.length < 2) {
        setPasscodeMessage('warning', 'กรุณาระบุชื่อรหัสอย่างน้อย 2 ตัวอักษร');
        return;
    }

    if (!editingId && (!passcode || passcode.length < 4)) {
        setPasscodeMessage('warning', 'กรุณาระบุรหัสอย่างน้อย 4 ตัวอักษร');
        return;
    }

    if (editingId) {
        const existing = passcodeCache.find(item => item.id === editingId);
        const diff = buildPasscodeDiff(existing, payload);
        renderPasscodeDiffPreview();
        if (diff.length === 0) {
            setPasscodeMessage('info', 'ไม่มีการเปลี่ยนแปลงจากค่าที่บันทึกไว้');
            return;
        }
        if (!confirm(`ตรวจ diff ก่อนบันทึก:\n- ${diff.join('\n- ')}\n\nต้องการบันทึกการเปลี่ยนแปลงนี้หรือไม่?`)) {
            return;
        }
    }

    setLoading(submitBtn, true);

    try {
        const response = await fetch(editingId ? `/api/admin-passcodes/${editingId}` : '/api/admin-passcodes', {
            method: editingId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || (editingId ? 'ไม่สามารถอัปเดตสิทธิ์ได้' : 'ไม่สามารถสร้างรหัสได้'));
        }

        resetPasscodeForm();

        const createContainer = document.getElementById('passcodeCreateContainer');
        const toggleBtn = document.getElementById('togglePasscodeCreateBtn');
        if (createContainer) createContainer.style.display = 'none';
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-plus-circle"></i> สร้างรหัสใหม่';

        await refreshPasscodeList();
        setPasscodeMessage('success', editingId ? 'อัปเดตสิทธิ์เรียบร้อยแล้ว' : 'สร้างรหัสใหม่เรียบร้อยแล้ว');
    } catch (error) {
        console.error('[Passcode] create error:', error);
        setPasscodeMessage('danger', error.message || 'ไม่สามารถบันทึกผู้ใช้ได้');
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

// --- API Keys Management ---
let apiKeysCache = [];
const API_PROVIDER_OPENAI = 'openai';
const API_PROVIDER_OPENROUTER = 'openrouter';

function normalizeApiProvider(provider) {
    if (typeof provider !== 'string') return API_PROVIDER_OPENAI;
    return provider.trim().toLowerCase() === API_PROVIDER_OPENROUTER
        ? API_PROVIDER_OPENROUTER
        : API_PROVIDER_OPENAI;
}

function isMaskedApiKeyValue(value) {
    return typeof value === 'string' && value.includes('...');
}

function getApiKeyHintByProvider(provider) {
    return normalizeApiProvider(provider) === API_PROVIDER_OPENROUTER
        ? 'API Key จาก OpenRouter (ขึ้นต้นด้วย sk-or-v1-)'
        : 'API Key จาก OpenAI (ขึ้นต้นด้วย sk-)';
}

function isApiKeyValidForProvider(apiKey, provider) {
    const normalizedProvider = normalizeApiProvider(provider);
    const key = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!key) return false;
    if (normalizedProvider === API_PROVIDER_OPENROUTER) {
        return key.startsWith('sk-or-v1-');
    }
    if (key.startsWith('sk-or-v1-')) {
        return false;
    }
    return key.startsWith('sk-');
}

function updateApiKeyProviderHint() {
    const providerSelect = document.getElementById('apiKeyProvider');
    const input = document.getElementById('apiKeyValue');
    const hint = document.getElementById('apiKeyFormatHint');
    const provider = normalizeApiProvider(providerSelect?.value);

    if (hint) hint.textContent = getApiKeyHintByProvider(provider);
    if (input && !isMaskedApiKeyValue(input.value || '')) {
        input.placeholder = provider === API_PROVIDER_OPENROUTER ? 'sk-or-v1-...' : 'sk-...';
    }
}

async function loadApiKeys() {
    const tbody = document.getElementById('apiKeysTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="api-keys-empty">
                <i class="fas fa-spinner fa-spin api-keys-empty__icon"></i>กำลังโหลด...
            </td>
        </tr>
    `;

    try {
        const response = await fetch('/api/openai-keys');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดข้อมูล API Keys ได้');
        }
        const data = await response.json();
        apiKeysCache = Array.isArray(data.keys) ? data.keys : [];
        renderApiKeys();
    } catch (error) {
        console.error('[API Keys] load error:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="api-keys-empty is-danger">
                    <i class="fas fa-exclamation-circle api-keys-empty__icon"></i>${escapeHtml(error.message)}
                </td>
            </tr>
        `;
    }
}

function renderApiKeys() {
    const tbody = document.getElementById('apiKeysTableBody');
    if (!tbody) return;
    const canManageApiKeys = adminCan('api-keys:manage');

    if (apiKeysCache.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="api-keys-empty">
                    <i class="fas fa-key api-keys-empty__icon"></i>ยังไม่มี API Key ในระบบ กดปุ่ม "เพิ่ม API Key" เพื่อเริ่มใช้งาน
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = apiKeysCache.map(key => {
        const statusClass = key.isActive ? 'success' : 'secondary';
        const statusText = key.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
        const defaultBadge = key.isDefault ? '<span class="api-key-badge is-primary">หลัก</span>' : '';
        const provider = normalizeApiProvider(key.provider);
        const providerBadge = `<span class="api-key-badge is-neutral">${escapeHtml(provider.toUpperCase())}</span>`;
        const lastUsed = key.lastUsedAt ? formatBotUpdatedAt(key.lastUsedAt) : 'ยังไม่มี';
        const usage = key.usageCount || 0;

        return `
            <tr>
                <td data-label="ชื่อ">
                    <div class="api-key-name">
                        <strong>${escapeHtml(key.name)}</strong>
                        <span class="api-key-badges">${defaultBadge}${providerBadge}</span>
                    </div>
                </td>
                <td data-label="API Key">
                    <code class="api-key-mask">${escapeHtml(key.maskedKey)}</code>
                </td>
                <td data-label="สถานะ">
                    <span class="api-key-status is-${statusClass}">${statusText}</span>
                </td>
                <td data-label="ใช้งาน">
                    <div class="api-key-usage">
                        <span>${usage} ครั้ง</span>
                        <small>${lastUsed}</small>
                    </div>
                </td>
                <td data-label="จัดการ">
                    ${canManageApiKeys ? `<div class="api-key-actions">
                        <button class="btn-ghost-sm" title="ทดสอบ" aria-label="ทดสอบ API Key" onclick="testApiKey('${key.id}')">
                            <i class="fas fa-check-circle"></i>
                        </button>
                        <button class="btn-ghost-sm" title="แก้ไข" aria-label="แก้ไข API Key" onclick="openEditApiKeyModal('${key.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-ghost-sm ${key.isActive ? 'is-warning' : 'is-success'}" title="${key.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}" aria-label="${key.isActive ? 'ปิดใช้งาน API Key' : 'เปิดใช้งาน API Key'}" onclick="toggleApiKeyStatus('${key.id}', ${!key.isActive})">
                            <i class="fas fa-${key.isActive ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn-ghost-sm is-danger" title="ลบ" aria-label="ลบ API Key" onclick="deleteApiKey('${key.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>` : '<span class="text-muted-v2">-</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

function openAddApiKeyModal() {
    if (!adminCan('api-keys:manage')) return;
    document.getElementById('apiKeyId').value = '';
    document.getElementById('apiKeyName').value = '';
    document.getElementById('apiKeyProvider').value = API_PROVIDER_OPENAI;
    document.getElementById('apiKeyValue').value = '';
    document.getElementById('apiKeyValue').placeholder = 'sk-...';
    document.getElementById('apiKeyIsDefault').checked = false;
    document.getElementById('apiKeyModalLabel').innerHTML = '<i class="fas fa-key me-2"></i>เพิ่ม API Key';
    document.getElementById('apiKeyTestResult').classList.add('d-none');
    updateApiKeyProviderHint();

    const modal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
    modal.show();
}

function openEditApiKeyModal(id) {
    if (!adminCan('api-keys:manage')) return;
    const key = apiKeysCache.find(k => k.id === id);
    if (!key) {
        showToast('ไม่พบ API Key', 'danger');
        return;
    }

    document.getElementById('apiKeyId').value = key.id;
    document.getElementById('apiKeyName').value = key.name;
    document.getElementById('apiKeyProvider').value = normalizeApiProvider(key.provider);
    document.getElementById('apiKeyValue').value = key.maskedKey; // Show masked key
    document.getElementById('apiKeyValue').placeholder = 'ใส่ใหม่เพื่อเปลี่ยน หรือปล่อยว่าง';
    document.getElementById('apiKeyIsDefault').checked = key.isDefault;
    document.getElementById('apiKeyModalLabel').innerHTML = '<i class="fas fa-edit me-2"></i>แก้ไข API Key';
    document.getElementById('apiKeyTestResult').classList.add('d-none');
    updateApiKeyProviderHint();

    const modal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
    modal.show();
}

async function saveApiKey() {
    if (!adminCan('api-keys:manage')) return;
    const id = document.getElementById('apiKeyId').value;
    const name = document.getElementById('apiKeyName').value.trim();
    const provider = normalizeApiProvider(document.getElementById('apiKeyProvider')?.value);
    const apiKey = document.getElementById('apiKeyValue').value.trim();
    const isDefault = document.getElementById('apiKeyIsDefault').checked;
    const saveBtn = document.getElementById('saveApiKeyBtn');

    if (!name) {
        showToast('กรุณาระบุชื่อ API Key', 'warning');
        return;
    }

    const isEdit = Boolean(id);
    const isNewKey = !isEdit || (apiKey && !isMaskedApiKeyValue(apiKey));

    if (!isEdit && (!apiKey || !isApiKeyValidForProvider(apiKey, provider))) {
        showToast(`กรุณาระบุ API Key ที่ถูกต้อง (${getApiKeyHintByProvider(provider)})`, 'warning');
        return;
    }

    setLoading(saveBtn, true);

    try {
        const payload = { name, isDefault, provider };
        // Only send apiKey if it's a new key or if it's been changed (not the masked value)
        if (isNewKey && apiKey && !isMaskedApiKeyValue(apiKey)) {
            if (!isApiKeyValidForProvider(apiKey, provider)) {
                throw new Error(getApiKeyHintByProvider(provider));
            }
            payload.apiKey = apiKey;
        }

        const url = isEdit ? `/api/openai-keys/${id}` : '/api/openai-keys';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'ไม่สามารถบันทึก API Key ได้');
        }

        const modal = bootstrap.Modal.getInstance(document.getElementById('apiKeyModal'));
        if (modal) modal.hide();

        showToast(isEdit ? 'อัปเดต API Key เรียบร้อย' : 'เพิ่ม API Key เรียบร้อย', 'success');
        await loadApiKeys();
    } catch (error) {
        console.error('[API Keys] save error:', error);
        showToast(error.message || 'บันทึกไม่สำเร็จ', 'danger');
    } finally {
        setLoading(saveBtn, false);
    }
}

async function deleteApiKey(id) {
    if (!adminCan('api-keys:manage')) return;
    const key = apiKeysCache.find(k => k.id === id);
    const name = key?.name || id || '';
    if (!confirm(`ยืนยันการลบ API Key "${name}"?\n\nหมายเหตุ: Bot ที่ใช้ key นี้จะสลับไปใช้ key หลักหรือ Environment Variable แทน`)) {
        return;
    }

    try {
        const response = await fetch(`/api/openai-keys/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'ลบ API Key ไม่สำเร็จ');
        }

        showToast('ลบ API Key เรียบร้อย', 'success');
        await loadApiKeys();
    } catch (error) {
        console.error('[API Keys] delete error:', error);
        showToast(error.message || 'ลบไม่สำเร็จ', 'danger');
    }
}

async function testApiKey(id) {
    if (!adminCan('api-keys:manage')) return;
    const key = apiKeysCache.find(k => k.id === id);
    if (!key) return;

    showToast(`กำลังทดสอบ "${key.name}"...`, 'info');

    try {
        const response = await fetch(`/api/openai-keys/${id}/test`, {
            method: 'POST'
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'ทดสอบ API Key ไม่สำเร็จ');
        }

        showToast(`✅ ${result.message}`, 'success');
    } catch (error) {
        console.error('[API Keys] test error:', error);
        showToast(`❌ ${error.message || 'ทดสอบไม่สำเร็จ'}`, 'danger');
    }
}

async function testApiKeyFromModal() {
    if (!adminCan('api-keys:manage')) return;
    const apiKey = document.getElementById('apiKeyValue').value.trim();
    const provider = normalizeApiProvider(document.getElementById('apiKeyProvider')?.value);
    const resultDiv = document.getElementById('apiKeyTestResult');
    const testBtn = document.getElementById('testApiKeyBtn');

    if (!apiKey || isMaskedApiKeyValue(apiKey)) {
        resultDiv.classList.remove('d-none', 'alert-success', 'alert-danger');
        resultDiv.classList.add('alert-warning');
        resultDiv.textContent = 'กรุณาใส่ API Key ใหม่เพื่อทดสอบ';
        return;
    }
    if (!isApiKeyValidForProvider(apiKey, provider)) {
        resultDiv.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-info');
        resultDiv.classList.add('alert-warning');
        resultDiv.textContent = getApiKeyHintByProvider(provider);
        return;
    }

    const id = document.getElementById('apiKeyId').value;
    if (id && isMaskedApiKeyValue(apiKey)) {
        // Existing key - test via API
        await testApiKey(id);
        return;
    }

    const originalLabel = testBtn ? testBtn.innerHTML : '';
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>กำลังทดสอบ';
    }
    resultDiv.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning');
    resultDiv.classList.add('alert-info');
    resultDiv.textContent = 'กำลังทดสอบ API Key...';

    try {
        const response = await fetch('/api/openai-keys/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, provider })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'ทดสอบ API Key ไม่สำเร็จ');
        }
        resultDiv.classList.remove('alert-info', 'alert-danger');
        resultDiv.classList.add('alert-success');
        resultDiv.textContent = result.message || 'API Key ใช้งานได้';
    } catch (error) {
        resultDiv.classList.remove('alert-info', 'alert-success');
        resultDiv.classList.add('alert-danger');
        resultDiv.textContent = error.message || 'ทดสอบไม่สำเร็จ';
    } finally {
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.innerHTML = originalLabel;
        }
    }
}

async function toggleApiKeyStatus(id, isActive) {
    if (!adminCan('api-keys:manage')) return;
    try {
        const response = await fetch(`/api/openai-keys/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'ไม่สามารถเปลี่ยนสถานะได้');
        }

        showToast(isActive ? 'เปิดใช้งาน API Key แล้ว' : 'ปิดใช้งาน API Key แล้ว', 'success');
        await loadApiKeys();
    } catch (error) {
        console.error('[API Keys] toggle error:', error);
        showToast(error.message || 'เปลี่ยนสถานะไม่สำเร็จ', 'danger');
    }
}

// Toggle API key visibility
document.addEventListener('DOMContentLoaded', function () {
    const toggleBtn = document.getElementById('toggleApiKeyVisibility');
    const providerSelect = document.getElementById('apiKeyProvider');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            const input = document.getElementById('apiKeyValue');
            if (input.type === 'password') {
                input.type = 'text';
                toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                input.type = 'password';
                toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
            }
        });
    }
    if (providerSelect) {
        providerSelect.addEventListener('change', updateApiKeyProviderHint);
    }
    updateApiKeyProviderHint();
});

// Auto-load API keys when section becomes visible
const originalInitNavigation = initNavigation;
initNavigation = function () {
    originalInitNavigation();

    // Add observer for API keys section
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const section = document.getElementById('api-keys-settings');
                if (section && !section.classList.contains('d-none') && adminCan(['settings:api-key', 'api-keys:view', 'api-keys:manage'])) {
                    loadApiKeys();
                }
            }
        });
    });

    const apiKeysSection = document.getElementById('api-keys-settings');
    if (apiKeysSection) {
        observer.observe(apiKeysSection, { attributes: true });
    }
};
