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
        showToast('Error loading settings', 'danger');
    }
}

// --- Bot Management ---
async function loadBotSettings() {
    const lineContainer = document.getElementById('line-bots-list');
    const fbContainer = document.getElementById('facebook-bots-list');

    if (lineContainer) lineContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">Loading Line Bots...</div>';
    if (fbContainer) fbContainer.innerHTML = '<div class="text-center p-3 text-muted-v2">Loading Facebook Bots...</div>';

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
        if (lineContainer) lineContainer.innerHTML = '<div class="text-danger p-3">Failed to load Line Bots</div>';
        if (fbContainer) fbContainer.innerHTML = '<div class="text-danger p-3">Failed to load Facebook Bots</div>';
    }
}

function renderLineBots(bots) {
    const container = document.getElementById('line-bots-list');
    if (!container) return;

    if (bots.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted-v2">No Line Bots configured.</div>';
        return;
    }

    container.innerHTML = bots.map(bot => `
        <div class="bot-item">
            <div class="bot-icon line"><i class="fab fa-line"></i></div>
            <div class="bot-info">
                <div class="bot-name">
                    ${bot.name}
                    ${bot.isDefault ? '<span class="badge bg-primary-soft text-primary ms-2" style="font-size:0.7rem">Default</span>' : ''}
                </div>
                <div class="bot-meta">
                    <span class="status-badge ${bot.status === 'active' ? 'active' : 'inactive'}">
                        <span class="status-dot"></span>${bot.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    <span class="ms-2 text-muted-v2">Model: ${bot.aiModel || 'gpt-5'}</span>
                </div>
            </div>
            <div class="bot-actions">
                <button class="btn-v2 btn-v2-secondary btn-v2-sm" onclick="editLineBot('${bot._id}')">
                    <i class="fas fa-edit"></i> Edit
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
        container.innerHTML = '<div class="text-center p-4 text-muted-v2">No Facebook Bots configured.</div>';
        return;
    }

    container.innerHTML = bots.map(bot => `
        <div class="bot-item">
            <div class="bot-icon facebook"><i class="fab fa-facebook-f"></i></div>
            <div class="bot-info">
                <div class="bot-name">
                    ${bot.name}
                    ${bot.isDefault ? '<span class="badge bg-primary-soft text-primary ms-2" style="font-size:0.7rem">Default</span>' : ''}
                </div>
                <div class="bot-meta">
                    <span class="status-badge ${bot.status === 'active' ? 'active' : 'inactive'}">
                        <span class="status-dot"></span>${bot.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    <span class="ms-2 text-muted-v2">Page ID: ${bot.pageId || 'N/A'}</span>
                </div>
            </div>
            <div class="bot-actions">
                <button class="btn-v2 btn-v2-secondary btn-v2-sm" onclick="editFacebookBot('${bot._id}')">
                    <i class="fas fa-edit"></i> Edit
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

    // We need to fetch the current bot data first to preserve other fields, 
    // as the PUT endpoint might expect full object or we can try PATCH if supported.
    // Assuming PUT requires full object based on previous code.
    try {
        const getRes = await fetch(endpoint);
        const botData = await getRes.json();

        botData.status = isActive ? 'active' : 'inactive';

        // Remove _id from body if it exists, as it's in the URL
        delete botData._id;

        const updateRes = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData)
        });

        if (updateRes.ok) {
            showToast(`${type === 'line' ? 'Line' : 'Facebook'} Bot ${isActive ? 'activated' : 'deactivated'}`, 'success');
            loadBotSettings(); // Refresh UI
        } else {
            throw new Error('Update failed');
        }
    } catch (error) {
        console.error('Error toggling bot status:', error);
        showToast('Failed to update bot status', 'danger');
        // Revert UI if possible or just reload
        loadBotSettings();
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
            showToast('Chat settings saved', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('Failed to save chat settings', 'danger');
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
            showToast('System settings saved', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('Failed to save system settings', 'danger');
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
            showToast('Security settings saved', 'success');
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        showToast('Failed to save security settings', 'danger');
    } finally {
        setLoading(btn, false);
    }
}

// --- Image Collections (Placeholder for now, can be expanded) ---
async function loadImageCollections() {
    // Basic implementation to show count
    const countEl = document.getElementById('collection-count');
    if (countEl) countEl.innerText = '0 Collections';
    // Full implementation would go here
}

// --- Utilities ---
function setupEventListeners() {
    const chatForm = document.getElementById('chatSettingsForm');
    if (chatForm) chatForm.addEventListener('submit', saveChatSettings);

    const systemForm = document.getElementById('systemSettingsForm');
    if (systemForm) systemForm.addEventListener('submit', saveSystemSettings);

    const securityForm = document.getElementById('securitySettingsForm');
    if (securityForm) securityForm.addEventListener('submit', saveSecuritySettings);
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
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Saving...';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || 'Save';
        btn.disabled = false;
    }
}

function showToast(message, type = 'info') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3 shadow-sm`;
    toast.style.zIndex = '9999';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Expose functions for inline onclick handlers
window.editLineBot = function (id) {
    // Redirect to existing modal or create new one. 
    // For V2, we might want to use the existing modal but trigger it from here.
    // Re-using existing logic from bot-management.js if loaded, or implement new modal logic.
    // For now, let's alert that this would open the modal.
    alert('Edit Bot functionality would open the modal here. (Integration pending)');
};

window.editFacebookBot = function (id) {
    alert('Edit Bot functionality would open the modal here. (Integration pending)');
};
