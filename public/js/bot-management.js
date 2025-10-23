// Bot Management JavaScript

// Shared dashboard statistics state
let lineBotStats = { total: 0, active: 0, configured: 0, inactive: 0 };
let facebookBotStats = { total: 0, active: 0, configured: 0, inactive: 0 };

function refreshBotMetricDisplay() {
    const totalBotsElement = document.getElementById('totalBots');
    const lineBotsElement = document.getElementById('lineBots');
    const facebookBotsElement = document.getElementById('facebookBots');
    const activeBotsElement = document.getElementById('activeBots');
    const configuredBotsElement = document.getElementById('configuredBots');
    const inactiveBotsElement = document.getElementById('inactiveBots');

    if (!totalBotsElement || !lineBotsElement || !facebookBotsElement ||
        !activeBotsElement || !configuredBotsElement || !inactiveBotsElement) {
        return;
    }

    const totals = {
        total: lineBotStats.total + facebookBotStats.total,
        active: lineBotStats.active + facebookBotStats.active,
        configured: lineBotStats.configured + facebookBotStats.configured,
        inactive: lineBotStats.inactive + facebookBotStats.inactive
    };

    totalBotsElement.textContent = totals.total;
    lineBotsElement.textContent = lineBotStats.total;
    facebookBotsElement.textContent = facebookBotStats.total;
    activeBotsElement.textContent = totals.active;
    configuredBotsElement.textContent = totals.configured;
    inactiveBotsElement.textContent = totals.inactive;
}

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

// Line Bot Management Functions

// Load Line Bot settings
async function loadLineBotSettings() {
    try {
        const response = await fetch('/api/line-bots');
        if (response.ok) {
            const lineBots = await response.json();
            displayLineBotList(lineBots);
            
            // อัปเดตข้อมูล AI Model ในส่วนการตั้งค่า AI (ถ้ามี)
            const lineBotAiModelInfo = document.getElementById('lineBotAiModelInfo');
            if (lineBotAiModelInfo) {
                displayLineBotAiModelInfo(lineBots);
            }
        } else {
            showAlert('ไม่สามารถโหลดข้อมูล Line Bot ได้', 'danger');
        }
    } catch (error) {
        console.error('Error loading line bot settings:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล Line Bot', 'danger');
    }
}

// Display Line Bot list
function displayLineBotList(lineBots) {
    const container = document.getElementById('lineBotList');
    if (!container) return;
    
    // อัปเดตสถิติ
    updateLineBotStats(lineBots || []);
    
    if (!lineBots || lineBots.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fab fa-line fa-4x text-muted mb-3"></i>
                <h5 class="text-muted">ยังไม่มี Line Bot ในระบบ</h5>
                <p class="text-muted">เริ่มต้นด้วยการเพิ่ม Line Bot ใหม่</p>
                <button type="button" class="btn btn-success" data-bs-toggle="modal" data-bs-target="#addLineBotModal">
                    <i class="fas fa-plus me-2"></i>เพิ่ม Line Bot ใหม่
                </button>
            </div>
        `;
        return;
    }

    const rowsHtml = lineBots.map(bot => {
        const statusClass = bot.status === 'active'
            ? 'success'
            : bot.status === 'maintenance'
                ? 'warning'
                : 'secondary';
        const statusText = bot.status === 'active'
            ? 'เปิดใช้งาน'
            : bot.status === 'maintenance'
                ? 'บำรุงรักษา'
                : 'ปิดใช้งาน';
        const defaultBadge = bot.isDefault ? '<span class="badge bg-primary-soft text-primary ms-2">หลัก</span>' : '';
        const instructionsCount = Array.isArray(bot.selectedInstructions) ? bot.selectedInstructions.length : 0;
        const hasWebhook = typeof bot.webhookUrl === 'string' && bot.webhookUrl.trim();
        const webhookDisplay = hasWebhook
            ? (bot.webhookUrl.trim().split('/').filter(Boolean).pop() || bot.webhookUrl.trim())
            : 'ไม่ระบุ';
        const updatedDisplay = formatBotUpdatedAt(bot.updatedAt);
        const aiModel = bot.aiModel || 'gpt-5';
        const description = bot.description || 'ไม่มีคำอธิบาย';

        return `
            <tr class="bot-overview-row">
                <td class="bot-overview-info" data-label="บอท">
                    <div class="bot-overview-name">
                        <i class="fab fa-line text-success me-2"></i>
                        <span>${bot.name}</span>
                        ${defaultBadge}
                    </div>
                    <div class="bot-overview-description text-muted small">${description}</div>
                </td>
                <td class="bot-overview-ai" data-label="AI & Instructions">
                    <div class="bot-overview-badge">
                        <span class="badge bg-info text-dark">${aiModel}</span>
                    </div>
                    <div class="text-muted small">Instructions: ${instructionsCount} รายการ</div>
                </td>
                <td class="bot-overview-status" data-label="สถานะ">
                    <span class="badge bg-${statusClass}">${statusText}</span>
                    <div class="text-muted small mt-1">อัปเดต: ${updatedDisplay}</div>
                </td>
                <td class="bot-overview-connection" data-label="การเชื่อมต่อ">
                    <div class="text-muted small">Webhook</div>
                    <div class="bot-overview-ellipsis" title="${hasWebhook ? bot.webhookUrl : 'ไม่ระบุ'}">${webhookDisplay}</div>
                </td>
                <td class="bot-overview-actions text-end" data-label="การจัดการ">
                    <div class="d-flex flex-wrap gap-2 justify-content-end">
                        <button class="btn btn-sm btn-outline-info" title="จัดการ Instructions" onclick="manageInstructions('${bot._id}')">
                            <i class="fas fa-book me-1"></i>Instructions
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" title="แก้ไข" onclick="editLineBot('${bot._id}')">
                            <i class="fas fa-edit me-1"></i>แก้ไข
                        </button>
                        <button class="btn btn-sm btn-outline-primary" title="ทดสอบ" onclick="testLineBot('${bot._id}')">
                            <i class="fas fa-vial me-1"></i>ทดสอบ
                        </button>
                        <button class="btn btn-sm btn-outline-danger" title="ลบ" onclick="deleteLineBot('${bot._id}')">
                            <i class="fas fa-trash me-1"></i>ลบ
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="table-responsive bot-overview-table-wrapper">
            <table class="table table-hover align-middle bot-overview-table">
                <thead>
                    <tr>
                        <th scope="col">บอท</th>
                        <th scope="col">AI & Instructions</th>
                        <th scope="col">สถานะ</th>
                        <th scope="col">การเชื่อมต่อ</th>
                        <th scope="col" class="text-end">การจัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

// Update Line Bot statistics
function updateLineBotStats(lineBots = []) {
    const total = lineBots.length;
    const active = lineBots.filter(bot => bot.status === 'active').length;
    const configured = lineBots.filter(bot => bot.aiModel && bot.selectedInstructions && bot.selectedInstructions.length > 0).length;

    lineBotStats = {
        total,
        active,
        configured,
        inactive: Math.max(total - active, 0)
    };

    refreshBotMetricDisplay();
}

function updateFacebookBotStats(facebookBots = []) {
    const total = facebookBots.length;
    const active = facebookBots.filter(bot => bot.status === 'active').length;
    const configured = facebookBots.filter(bot => bot.aiModel && bot.selectedInstructions && bot.selectedInstructions.length > 0).length;

    facebookBotStats = {
        total,
        active,
        configured,
        inactive: Math.max(total - active, 0)
    };

    refreshBotMetricDisplay();
}

// Load Line Bot AI Model information
async function loadLineBotAiModelInfo() {
    try {
        const response = await fetch('/api/line-bots');
        if (response.ok) {
            const lineBots = await response.json();
            displayLineBotAiModelInfo(lineBots);
        }
    } catch (error) {
        console.error('Error loading line bot AI model info:', error);
    }
}

// Display Line Bot AI Model information
function displayLineBotAiModelInfo(lineBots) {
    const container = document.getElementById('lineBotAiModelInfo');
    if (!container) {
        console.log('Line Bot AI Model Info container not found');
        return;
    }
    
    if (!lineBots || lineBots.length === 0) {
        container.innerHTML = '<p class="text-muted mb-0">ยังไม่มี Line Bot ในระบบ</p>';
        return;
    }
    
    let html = '<div class="row">';
    lineBots.forEach(bot => {
        const modelName = bot.aiModel || 'gpt-5';
        const statusClass = bot.status === 'active' ? 'success' : 'warning';
        
        html += `
            <div class="col-md-6 mb-2">
                <div class="d-flex align-items-center">
                    <span class="badge bg-${statusClass} me-2">${bot.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
                    <strong>${bot.name}:</strong>
                    <span class="badge bg-info ms-2">${modelName}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Add new Line Bot
function addNewLineBot() {
    const form = document.getElementById('lineBotForm');
    if (form) form.reset();
    
    const lineBotId = document.getElementById('lineBotId');
    if (lineBotId) lineBotId.value = '';
    
    const addLineBotModalLabel = document.getElementById('addLineBotModalLabel');
    if (addLineBotModalLabel) {
        addLineBotModalLabel.innerHTML = '<i class="fab fa-line me-2"></i>เพิ่ม Line Bot ใหม่';
    }
    
    const saveLineBotBtn = document.getElementById('saveLineBotBtn');
    if (saveLineBotBtn) {
        saveLineBotBtn.innerHTML = '<i class="fas fa-save me-2"></i>บันทึก';
    }
    
    // Reset webhook URL so backend can generate a unique endpoint on save
    const lineWebhookUrl = document.getElementById('lineWebhookUrl');
    if (lineWebhookUrl) {
        lineWebhookUrl.value = '';
    }
}

// Edit Line Bot
async function editLineBot(botId) {
    try {
        const response = await fetch(`/api/line-bots/${botId}`);
        if (response.ok) {
            const bot = await response.json();
            
            const lineBotId = document.getElementById('lineBotId');
            const lineBotName = document.getElementById('lineBotName');
            const lineBotDescription = document.getElementById('lineBotDescription');
            const lineChannelAccessToken = document.getElementById('lineChannelAccessToken');
            const lineChannelSecret = document.getElementById('lineChannelSecret');
            const lineWebhookUrl = document.getElementById('lineWebhookUrl');
            const lineBotStatus = document.getElementById('lineBotStatus');
            const lineBotAiModel = document.getElementById('lineBotAiModel');
            const lineBotDefault = document.getElementById('lineBotDefault');
            
            if (lineBotId) lineBotId.value = bot._id;
            if (lineBotName) lineBotName.value = bot.name;
            if (lineBotDescription) lineBotDescription.value = bot.description || '';
            if (lineChannelAccessToken) lineChannelAccessToken.value = bot.channelAccessToken;
            if (lineChannelSecret) lineChannelSecret.value = bot.channelSecret;
            if (lineWebhookUrl) lineWebhookUrl.value = bot.webhookUrl || '';
            if (lineBotStatus) lineBotStatus.value = bot.status;
            if (lineBotAiModel) lineBotAiModel.value = bot.aiModel || 'gpt-5';
            if (lineBotDefault) lineBotDefault.checked = bot.isDefault;
            
            // Load keyword settings
            const normalizeKeywordSetting = (setting) => {
                if (!setting) return { keyword: '', response: '', sendResponse: true };
                if (typeof setting === 'string') return { keyword: setting, response: '', sendResponse: true };
                return setting;
            };
            
            const enableAI = normalizeKeywordSetting(bot.keywordSettings?.enableAI);
            const disableAI = normalizeKeywordSetting(bot.keywordSettings?.disableAI);
            const disableFollowUp = normalizeKeywordSetting(bot.keywordSettings?.disableFollowUp);
            
            const lineKeywordEnableAI = document.getElementById('lineKeywordEnableAI');
            const lineKeywordEnableAIResponse = document.getElementById('lineKeywordEnableAIResponse');
            const lineKeywordEnableAISend = document.getElementById('lineKeywordEnableAISend');
            
            const lineKeywordDisableAI = document.getElementById('lineKeywordDisableAI');
            const lineKeywordDisableAIResponse = document.getElementById('lineKeywordDisableAIResponse');
            const lineKeywordDisableAISend = document.getElementById('lineKeywordDisableAISend');
            
            const lineKeywordDisableFollowUp = document.getElementById('lineKeywordDisableFollowUp');
            const lineKeywordDisableFollowUpResponse = document.getElementById('lineKeywordDisableFollowUpResponse');
            const lineKeywordDisableFollowUpSend = document.getElementById('lineKeywordDisableFollowUpSend');
            
            if (lineKeywordEnableAI) lineKeywordEnableAI.value = enableAI.keyword || '';
            if (lineKeywordEnableAIResponse) lineKeywordEnableAIResponse.value = enableAI.response || '';
            if (lineKeywordEnableAISend) lineKeywordEnableAISend.checked = enableAI.sendResponse !== false;
            
            if (lineKeywordDisableAI) lineKeywordDisableAI.value = disableAI.keyword || '';
            if (lineKeywordDisableAIResponse) lineKeywordDisableAIResponse.value = disableAI.response || '';
            if (lineKeywordDisableAISend) lineKeywordDisableAISend.checked = disableAI.sendResponse !== false;
            
            if (lineKeywordDisableFollowUp) lineKeywordDisableFollowUp.value = disableFollowUp.keyword || '';
            if (lineKeywordDisableFollowUpResponse) lineKeywordDisableFollowUpResponse.value = disableFollowUp.response || '';
            if (lineKeywordDisableFollowUpSend) lineKeywordDisableFollowUpSend.checked = disableFollowUp.sendResponse !== false;
            
            const addLineBotModalLabel = document.getElementById('addLineBotModalLabel');
            if (addLineBotModalLabel) {
                addLineBotModalLabel.innerHTML = '<i class="fab fa-line me-2"></i>แก้ไข Line Bot';
            }
            
            const saveLineBotBtn = document.getElementById('saveLineBotBtn');
            if (saveLineBotBtn) {
                saveLineBotBtn.innerHTML = '<i class="fas fa-save me-2"></i>อัปเดต';
            }
            
            const modal = new bootstrap.Modal(document.getElementById('addLineBotModal'));
            modal.show();
        } else {
            showAlert('ไม่สามารถโหลดข้อมูล Line Bot ได้', 'danger');
        }
    } catch (error) {
        console.error('Error loading line bot:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล Line Bot', 'danger');
    }
}

// Delete Line Bot
async function deleteLineBot(botId) {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบ Line Bot นี้?')) {
        return;
    }

    try {
        const response = await fetch(`/api/line-bots/${botId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('ลบ Line Bot เรียบร้อยแล้ว', 'success');
            await loadLineBotSettings();
        } else {
            showAlert('ไม่สามารถลบ Line Bot ได้', 'danger');
        }
    } catch (error) {
        console.error('Error deleting line bot:', error);
        showAlert('เกิดข้อผิดพลาดในการลบ Line Bot', 'danger');
    }
}

// Test Line Bot
async function testLineBot(botId) {
    try {
        const response = await fetch(`/api/line-bots/${botId}/test`, {
            method: 'POST'
        });

        if (response.ok) {
            const result = await response.json();
            showAlert(`ทดสอบ Line Bot สำเร็จ: ${result.message}`, 'success');
        } else {
            showAlert('ไม่สามารถทดสอบ Line Bot ได้', 'danger');
        }
    } catch (error) {
        console.error('Error testing line bot:', error);
        showAlert('เกิดข้อผิดพลาดในการทดสอบ Line Bot', 'danger');
    }
}

// Save Line Bot
async function saveLineBot() {
    const form = document.getElementById('lineBotForm');
    if (!form) {
        showAlert('ไม่พบฟอร์ม Line Bot', 'danger');
        return;
    }
    
    const formData = new FormData(form);
    
    const botData = {
        name: formData.get('name'),
        description: formData.get('description'),
        channelAccessToken: formData.get('channelAccessToken'),
        channelSecret: formData.get('channelSecret'),
        webhookUrl: formData.get('webhookUrl'),
        status: formData.get('status'),
        aiModel: formData.get('aiModel'),
        isDefault: formData.get('isDefault') === 'on'
    };

    const botId = formData.get('id');
    
    // Save keyword settings if bot already exists
    if (botId) {
        const keywordSettings = {
            enableAI: {
                keyword: formData.get('keywordEnableAI') || '',
                response: formData.get('keywordEnableAIResponse') || '',
                sendResponse: formData.get('keywordEnableAISend') === 'on'
            },
            disableAI: {
                keyword: formData.get('keywordDisableAI') || '',
                response: formData.get('keywordDisableAIResponse') || '',
                sendResponse: formData.get('keywordDisableAISend') === 'on'
            },
            disableFollowUp: {
                keyword: formData.get('keywordDisableFollowUp') || '',
                response: formData.get('keywordDisableFollowUpResponse') || '',
                sendResponse: formData.get('keywordDisableFollowUpSend') === 'on'
            }
        };
        
        // Save keyword settings separately
        try {
            await fetch(`/api/line-bots/${botId}/keywords`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ keywordSettings })
            });
        } catch (error) {
            console.error('Error saving keyword settings:', error);
        }
    }
    
    const url = botId ? `/api/line-bots/${botId}` : '/api/line-bots';
    const method = botId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(botData)
        });

        if (response.ok) {
            let responseData = {};
            try {
                responseData = await response.json();
            } catch (parseError) {
                console.warn('Unable to parse Line Bot response JSON:', parseError);
            }

            const successMessage = botId
                ? (responseData.message || 'อัปเดต Line Bot เรียบร้อยแล้ว')
                : `เพิ่ม Line Bot เรียบร้อยแล้ว${responseData.webhookUrl ? `<br><small>Webhook URL: <code>${responseData.webhookUrl}</code></small>` : ''}`;

            showAlert(successMessage, 'success');
            await loadLineBotSettings();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('addLineBotModal'));
            if (modal) modal.hide();
        } else {
            let errorMessage = 'ไม่สามารถบันทึก Line Bot ได้';
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (parseError) {
                console.warn('Unable to parse Line Bot error JSON:', parseError);
            }
            showAlert(errorMessage, 'danger');
        }
    } catch (error) {
        console.error('Error saving line bot:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึก Line Bot', 'danger');
    }
}

// Refresh Bot list
function refreshLineBotList() {
    loadLineBotSettings();
    loadFacebookBotSettings();
    showAlert('รีเฟรชข้อมูลเรียบร้อยแล้ว', 'success');
}

// Facebook Bot Management Functions

// Load Facebook Bot settings
async function loadFacebookBotSettings() {
    try {
        const response = await fetch('/api/facebook-bots');
        if (response.ok) {
            const facebookBots = await response.json();
            displayFacebookBotList(facebookBots);
        } else {
            showAlert('ไม่สามารถโหลดข้อมูล Facebook Bot ได้', 'danger');
        }
    } catch (error) {
        console.error('Error loading facebook bot settings:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล Facebook Bot', 'danger');
    }
}

// Display Facebook Bot list
function displayFacebookBotList(facebookBots) {
    const container = document.getElementById('facebookBotList');
    if (!container) {
        console.log('Facebook Bot List container not found');
        return;
    }

    updateFacebookBotStats(facebookBots || []);

    if (!facebookBots || facebookBots.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fab fa-facebook fa-4x text-muted mb-3"></i>
                <h5 class="text-muted">ยังไม่มี Facebook Bot ในระบบ</h5>
                <p class="text-muted">เริ่มต้นด้วยการเพิ่ม Facebook Bot ใหม่</p>
                <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addFacebookBotModal">
                    <i class="fas fa-plus me-2"></i>เพิ่ม Facebook Bot ใหม่
                </button>
            </div>
        `;
        return;
    }

    const rowsHtml = facebookBots.map(bot => {
        const statusClass = bot.status === 'active'
            ? 'success'
            : bot.status === 'inactive'
                ? 'warning'
                : 'secondary';
        const statusText = bot.status === 'active'
            ? 'เปิดใช้งาน'
            : bot.status === 'inactive'
                ? 'ปิดใช้งาน'
                : 'บำรุงรักษา';
        const defaultBadge = bot.isDefault ? '<span class="badge bg-primary-soft text-primary ms-2">หลัก</span>' : '';
        const instructionsCount = Array.isArray(bot.selectedInstructions) ? bot.selectedInstructions.length : 0;
        const pageId = typeof bot.pageId === 'string' ? bot.pageId.trim() : '';
        const pageIdDisplay = pageId
            ? (pageId.length > 14 ? `${pageId.slice(0, 6)}…${pageId.slice(-4)}` : pageId)
            : 'ไม่ระบุ';
        const updatedDisplay = formatBotUpdatedAt(bot.updatedAt);
        const aiModel = bot.aiModel || 'gpt-5';
        const description = bot.description || 'ไม่มีคำอธิบาย';

        return `
            <tr class="bot-overview-row">
                <td class="bot-overview-info" data-label="บอท">
                    <div class="bot-overview-name">
                        <i class="fab fa-facebook text-primary me-2"></i>
                        <span>${bot.name}</span>
                        ${defaultBadge}
                    </div>
                    <div class="bot-overview-description text-muted small">${description}</div>
                </td>
                <td class="bot-overview-ai" data-label="AI & Instructions">
                    <div class="bot-overview-badge">
                        <span class="badge bg-info text-dark">${aiModel}</span>
                    </div>
                    <div class="text-muted small">Instructions: ${instructionsCount} รายการ</div>
                </td>
                <td class="bot-overview-status" data-label="สถานะ">
                    <span class="badge bg-${statusClass}">${statusText}</span>
                    <div class="text-muted small mt-1">อัปเดต: ${updatedDisplay}</div>
                </td>
                <td class="bot-overview-connection" data-label="การเชื่อมต่อ">
                    <div class="text-muted small">Page ID</div>
                    <div class="bot-overview-ellipsis" title="${pageId || 'ไม่ระบุ'}">${pageIdDisplay}</div>
                </td>
                <td class="bot-overview-actions text-end" data-label="การจัดการ">
                    <div class="d-flex flex-wrap gap-2 justify-content-end">
                        <button class="btn btn-sm btn-outline-info" title="จัดการ Instructions" onclick="manageFacebookInstructions('${bot._id}')">
                            <i class="fas fa-book me-1"></i>Instructions
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" title="แก้ไข" onclick="editFacebookBot('${bot._id}')">
                            <i class="fas fa-edit me-1"></i>แก้ไข
                        </button>
                        <button class="btn btn-sm btn-outline-primary" title="ทดสอบ" onclick="testFacebookBot('${bot._id}')">
                            <i class="fas fa-vial me-1"></i>ทดสอบ
                        </button>
                        <button class="btn btn-sm btn-outline-danger" title="ลบ" onclick="deleteFacebookBot('${bot._id}')">
                            <i class="fas fa-trash me-1"></i>ลบ
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="table-responsive bot-overview-table-wrapper">
            <table class="table table-hover align-middle bot-overview-table">
                <thead>
                    <tr>
                        <th scope="col">บอท</th>
                        <th scope="col">AI & Instructions</th>
                        <th scope="col">สถานะ</th>
                        <th scope="col">การเชื่อมต่อ</th>
                        <th scope="col" class="text-end">การจัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

// Add new Facebook Bot
function addNewFacebookBot() {
    const form = document.getElementById('facebookBotForm');
    if (form) form.reset();
    
    const facebookBotId = document.getElementById('facebookBotId');
    if (facebookBotId) facebookBotId.value = '';
    
    const addFacebookBotModalLabel = document.getElementById('addFacebookBotModalLabel');
    if (addFacebookBotModalLabel) {
        addFacebookBotModalLabel.innerHTML = '<i class="fab fa-facebook me-2"></i>เพิ่ม Facebook Bot ใหม่';
    }
    
    const deleteBtn = document.getElementById('deleteFacebookBotBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    // Request server to create a stub and return real webhook URL + verify token
    (async () => {
        try {
            const res = await fetch('/api/facebook-bots/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (res.ok) {
                const data = await res.json();
                if (facebookBotId) facebookBotId.value = data.id;
                const webhookInput = document.getElementById('facebookWebhookUrl');
                const verifyTokenInput = document.getElementById('facebookVerifyToken');
                if (webhookInput) webhookInput.value = data.webhookUrl;
                if (verifyTokenInput) verifyTokenInput.value = data.verifyToken;
                showAlert('สร้าง Webhook URL และ Verify Token สำเร็จ นำไปยืนยันใน Facebook App ได้เลย', 'success');
            } else {
                showAlert('ไม่สามารถสร้าง Webhook URL / Verify Token ได้', 'danger');
            }
        } catch (e) {
            console.error('init facebook bot error', e);
            showAlert('เกิดข้อผิดพลาดในการเตรียมข้อมูลยืนยัน Webhook', 'danger');
        }
    })();
}

// Edit Facebook Bot
async function editFacebookBot(botId) {
    try {
        const response = await fetch(`/api/facebook-bots/${botId}`);
        if (response.ok) {
            const bot = await response.json();
            
            const facebookBotId = document.getElementById('facebookBotId');
            const facebookBotName = document.getElementById('facebookBotName');
            const facebookBotDescription = document.getElementById('facebookBotDescription');
            const facebookPageId = document.getElementById('facebookPageId');
            const facebookAccessToken = document.getElementById('facebookAccessToken');
            const facebookWebhookUrl = document.getElementById('facebookWebhookUrl');
            const facebookVerifyToken = document.getElementById('facebookVerifyToken');
            const facebookBotAiModel = document.getElementById('facebookBotAiModel');
            const facebookBotDefault = document.getElementById('facebookBotDefault');
            
            if (facebookBotId) facebookBotId.value = bot._id;
            if (facebookBotName) facebookBotName.value = bot.name;
            if (facebookBotDescription) facebookBotDescription.value = bot.description || '';
            if (facebookPageId) facebookPageId.value = bot.pageId;
            if (facebookAccessToken) facebookAccessToken.value = bot.accessToken;
            if (facebookWebhookUrl) facebookWebhookUrl.value = bot.webhookUrl || '';
            if (facebookVerifyToken) facebookVerifyToken.value = bot.verifyToken || '';
            if (facebookBotAiModel) facebookBotAiModel.value = bot.aiModel || 'gpt-5';
            if (facebookBotDefault) facebookBotDefault.checked = bot.isDefault || false;
            
            // Load keyword settings
            const normalizeKeywordSetting = (setting) => {
                if (!setting) return { keyword: '', response: '', sendResponse: true };
                if (typeof setting === 'string') return { keyword: setting, response: '', sendResponse: true };
                return setting;
            };
            
            const enableAI = normalizeKeywordSetting(bot.keywordSettings?.enableAI);
            const disableAI = normalizeKeywordSetting(bot.keywordSettings?.disableAI);
            const disableFollowUp = normalizeKeywordSetting(bot.keywordSettings?.disableFollowUp);
            
            const facebookKeywordEnableAI = document.getElementById('facebookKeywordEnableAI');
            const facebookKeywordEnableAIResponse = document.getElementById('facebookKeywordEnableAIResponse');
            const facebookKeywordEnableAISend = document.getElementById('facebookKeywordEnableAISend');
            
            const facebookKeywordDisableAI = document.getElementById('facebookKeywordDisableAI');
            const facebookKeywordDisableAIResponse = document.getElementById('facebookKeywordDisableAIResponse');
            const facebookKeywordDisableAISend = document.getElementById('facebookKeywordDisableAISend');
            
            const facebookKeywordDisableFollowUp = document.getElementById('facebookKeywordDisableFollowUp');
            const facebookKeywordDisableFollowUpResponse = document.getElementById('facebookKeywordDisableFollowUpResponse');
            const facebookKeywordDisableFollowUpSend = document.getElementById('facebookKeywordDisableFollowUpSend');
            
            if (facebookKeywordEnableAI) facebookKeywordEnableAI.value = enableAI.keyword || '';
            if (facebookKeywordEnableAIResponse) facebookKeywordEnableAIResponse.value = enableAI.response || '';
            if (facebookKeywordEnableAISend) facebookKeywordEnableAISend.checked = enableAI.sendResponse !== false;
            
            if (facebookKeywordDisableAI) facebookKeywordDisableAI.value = disableAI.keyword || '';
            if (facebookKeywordDisableAIResponse) facebookKeywordDisableAIResponse.value = disableAI.response || '';
            if (facebookKeywordDisableAISend) facebookKeywordDisableAISend.checked = disableAI.sendResponse !== false;
            
            if (facebookKeywordDisableFollowUp) facebookKeywordDisableFollowUp.value = disableFollowUp.keyword || '';
            if (facebookKeywordDisableFollowUpResponse) facebookKeywordDisableFollowUpResponse.value = disableFollowUp.response || '';
            if (facebookKeywordDisableFollowUpSend) facebookKeywordDisableFollowUpSend.checked = disableFollowUp.sendResponse !== false;

            const addFacebookBotModalLabel = document.getElementById('addFacebookBotModalLabel');
            if (addFacebookBotModalLabel) {
                addFacebookBotModalLabel.innerHTML = '<i class="fab fa-facebook me-2"></i>แก้ไข Facebook Bot';
            }
            
            const deleteBtn = document.getElementById('deleteFacebookBotBtn');
            if (deleteBtn) deleteBtn.style.display = 'inline-block';

            const modal = new bootstrap.Modal(document.getElementById('addFacebookBotModal'));
            modal.show();
        } else {
            showAlert('ไม่สามารถโหลดข้อมูล Facebook Bot ได้', 'danger');
        }
    } catch (error) {
        console.error('Error loading facebook bot:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล Facebook Bot', 'danger');
    }
}

// Delete Facebook Bot
async function deleteFacebookBot(botId) {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบ Facebook Bot นี้?')) {
        return;
    }

    try {
        const response = await fetch(`/api/facebook-bots/${botId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('ลบ Facebook Bot เรียบร้อยแล้ว', 'success');
            await loadFacebookBotSettings();
            const modalEl = document.getElementById('addFacebookBotModal');
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
        } else {
            showAlert('ไม่สามารถลบ Facebook Bot ได้', 'danger');
        }
    } catch (error) {
        console.error('Error deleting facebook bot:', error);
        showAlert('เกิดข้อผิดพลาดในการลบ Facebook Bot', 'danger');
    }
}

// Test Facebook Bot
async function testFacebookBot(botId) {
    try {
        const response = await fetch(`/api/facebook-bots/${botId}/test`, {
            method: 'POST'
        });

        if (response.ok) {
            const result = await response.json();
            showAlert(result.message, 'success');
        } else {
            const error = await response.json();
            showAlert(error.error, 'danger');
        }
    } catch (error) {
        console.error('Error testing facebook bot:', error);
        showAlert('เกิดข้อผิดพลาดในการทดสอบ Facebook Bot', 'danger');
    }
}

// Save Facebook Bot
async function saveFacebookBot() {
    const form = document.getElementById('facebookBotForm');
    if (!form) {
        showAlert('ไม่พบฟอร์ม Facebook Bot', 'danger');
        return;
    }
    
    const formData = new FormData(form);
    
    const botData = {
        name: formData.get('name'),
        description: formData.get('description'),
        pageId: formData.get('pageId'),
        accessToken: formData.get('accessToken'),
        webhookUrl: formData.get('webhookUrl'),
        verifyToken: formData.get('verifyToken'),
        aiModel: formData.get('aiModel'),
        isDefault: formData.get('isDefault') === 'on'
    };

    const botId = formData.get('id');
    
    // Save keyword settings if bot already exists
    if (botId) {
        const keywordSettings = {
            enableAI: {
                keyword: formData.get('keywordEnableAI') || '',
                response: formData.get('keywordEnableAIResponse') || '',
                sendResponse: formData.get('keywordEnableAISend') === 'on'
            },
            disableAI: {
                keyword: formData.get('keywordDisableAI') || '',
                response: formData.get('keywordDisableAIResponse') || '',
                sendResponse: formData.get('keywordDisableAISend') === 'on'
            },
            disableFollowUp: {
                keyword: formData.get('keywordDisableFollowUp') || '',
                response: formData.get('keywordDisableFollowUpResponse') || '',
                sendResponse: formData.get('keywordDisableFollowUpSend') === 'on'
            }
        };
        
        // Save keyword settings separately
        try {
            await fetch(`/api/facebook-bots/${botId}/keywords`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ keywordSettings })
            });
        } catch (error) {
            console.error('Error saving keyword settings:', error);
        }
    }
    
    // enforce verification first
    const verifiedToggle = document.getElementById('fbVerifiedToggle');
    if (!verifiedToggle || !verifiedToggle.checked) {
        showAlert('กรุณายืนยัน Webhook ใน Facebook App ให้สำเร็จก่อน แล้วติ๊ก "ฉันยืนยัน Webhook สำเร็จแล้ว"', 'warning');
        return;
    }
    if (!botData.pageId || !botData.accessToken) {
        showAlert('กรุณากรอก Facebook Page ID และ Page Access Token (หลังยืนยัน Webhook สำเร็จ)', 'warning');
        return;
    }

    const url = botId ? `/api/facebook-bots/${botId}` : '/api/facebook-bots';
    const method = botId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(botData)
        });

        if (response.ok) {
            showAlert(botId ? 'อัปเดต Facebook Bot เรียบร้อยแล้ว' : 'เพิ่ม Facebook Bot เรียบร้อยแล้ว', 'success');
            await loadFacebookBotSettings();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('addFacebookBotModal'));
            if (modal) modal.hide();
        } else {
            showAlert('ไม่สามารถบันทึก Facebook Bot ได้', 'danger');
        }
    } catch (error) {
        console.error('Error saving facebook bot:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึก Facebook Bot', 'danger');
    }
}

// Export functions for use in other modules
window.botManagement = {
    loadLineBotSettings,
    loadFacebookBotSettings,
    addNewLineBot,
    editLineBot,
    deleteLineBot,
    testLineBot,
    saveLineBot,
    addNewFacebookBot,
    editFacebookBot,
    deleteFacebookBot,
    testFacebookBot,
    saveFacebookBot,
    refreshLineBotList
};
