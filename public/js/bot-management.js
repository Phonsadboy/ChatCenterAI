// Bot Management JavaScript
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
    updateLineBotStats(lineBots);
    
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

    let html = '';
    lineBots.forEach((bot, index) => {
        const statusClass = bot.status === 'active' ? 'success' : bot.status === 'maintenance' ? 'warning' : 'secondary';
        const statusText = bot.status === 'active' ? 'เปิดใช้งาน' : bot.status === 'maintenance' ? 'บำรุงรักษา' : 'ปิดใช้งาน';
        const defaultBadge = bot.isDefault ? '<span class="badge bg-primary ms-2">หลัก</span>' : '';
        const instructionsCount = bot.selectedInstructions ? bot.selectedInstructions.length : 0;

        html += `
            <div class="col">
                <div class="card h-100 border-0 shadow-sm">
                    <div class="card-header bg-white border-bottom">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-0">
                                    <i class="fab fa-line me-2 text-success"></i>${bot.name} ${defaultBadge}
                                </h6>
                                <small class="text-muted">${bot.description || 'ไม่มีคำอธิบาย'}</small>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-${statusClass}">${statusText}</span>
                                <button class="btn btn-sm btn-outline-info" title="จัดการ Instructions" onclick="manageInstructions('${bot._id}')">
                                    <i class="fas fa-book me-1"></i>Instructions
                                </button>
                                <button class="btn btn-sm btn-outline-secondary" title="แก้ไข" onclick="editLineBot('${bot._id}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-primary" title="ทดสอบ" onclick="testLineBot('${bot._id}')">
                                    <i class="fas fa-vial"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" title="ลบ" onclick="deleteLineBot('${bot._id}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-6 col-md-3">
                                <div class="d-flex align-items-center mb-2">
                                    <i class="fas fa-robot text-primary me-2"></i>
                                    <div>
                                        <small class="text-muted d-block">AI Model</small>
                                        <span class="badge bg-info">${bot.aiModel || 'gpt-5'}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6 col-md-3">
                                <div class="d-flex align-items-center mb-2">
                                    <i class="fas fa-book text-info me-2"></i>
                                    <div>
                                        <small class="text-muted d-block">Instructions</small>
                                        <span class="badge bg-secondary">${instructionsCount} รายการ</span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6 col-md-3">
                                <div class="d-flex align-items-center mb-2">
                                    <i class="fas fa-link text-warning me-2"></i>
                                    <div>
                                        <small class="text-muted d-block">Webhook</small>
                                        <small class="text-truncate d-block" style="max-width: 150px;" title="${bot.webhookUrl || 'ไม่ระบุ'}">
                                            ${bot.webhookUrl ? bot.webhookUrl.split('/').pop() : 'ไม่ระบุ'}
                                        </small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6 col-md-3">
                                <div class="d-flex align-items-center mb-2">
                                    <i class="fas fa-clock text-muted me-2"></i>
                                    <div>
                                        <small class="text-muted d-block">อัปเดตล่าสุด</small>
                                        <small>${new Date(bot.updatedAt).toLocaleDateString('th-TH')}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// Update Line Bot statistics
function updateLineBotStats(lineBots) {
    const totalBotsElement = document.getElementById('totalBots');
    const activeBotsElement = document.getElementById('activeBots');
    const configuredBotsElement = document.getElementById('configuredBots');
    const inactiveBotsElement = document.getElementById('inactiveBots');
    
    if (!totalBotsElement || !activeBotsElement || !configuredBotsElement || !inactiveBotsElement) {
        console.log('Line Bot statistics elements not found');
        return;
    }
    
    const total = lineBots.length;
    const active = lineBots.filter(bot => bot.status === 'active').length;
    const configured = lineBots.filter(bot => bot.aiModel && bot.selectedInstructions && bot.selectedInstructions.length > 0).length;
    const inactive = total - active;
    
    totalBotsElement.textContent = total;
    activeBotsElement.textContent = active;
    configuredBotsElement.textContent = configured;
    inactiveBotsElement.textContent = inactive;
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
    
    // Generate webhook URL
    const baseUrl = window.location.origin;
    const lineWebhookUrl = document.getElementById('lineWebhookUrl');
    if (lineWebhookUrl) {
        lineWebhookUrl.value = `${baseUrl}/webhook/line/new`;
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
            showAlert(botId ? 'อัปเดต Line Bot เรียบร้อยแล้ว' : 'เพิ่ม Line Bot เรียบร้อยแล้ว', 'success');
            await loadLineBotSettings();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('addLineBotModal'));
            if (modal) modal.hide();
        } else {
            showAlert('ไม่สามารถบันทึก Line Bot ได้', 'danger');
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

    let html = '';
    facebookBots.forEach(bot => {
        const statusClass = bot.status === 'active' ? 'success' :
                            bot.status === 'inactive' ? 'warning' : 'secondary';
        const statusText = bot.status === 'active' ? 'ใช้งาน' :
                           bot.status === 'inactive' ? 'ปิดใช้งาน' : 'บำรุงรักษา';
        const defaultBadge = bot.isDefault ? '<span class="badge bg-primary ms-2">Default</span>' : '';
        const instructionsCount = bot.selectedInstructions ? bot.selectedInstructions.length : 0;

        html += `
            <div class="col">
                <div class="card h-100 border-0 shadow-sm">
                    <div class="card-header bg-white border-bottom">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-0">
                                    <i class="fab fa-facebook me-2 text-primary"></i>${bot.name} ${defaultBadge}
                                </h6>
                                <small class="text-muted">${bot.description || 'ไม่มีคำอธิบาย'}</small>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-${statusClass}">${statusText}</span>
                                <button class="btn btn-sm btn-outline-info" title="จัดการ Instructions" onclick="manageFacebookInstructions('${bot._id}')">
                                    <i class="fas fa-book me-1"></i>Instructions
                                </button>
                                <button class="btn btn-sm btn-outline-secondary" title="แก้ไข" onclick="editFacebookBot('${bot._id}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-primary" title="ทดสอบ" onclick="testFacebookBot('${bot._id}')">
                                    <i class="fas fa-vial"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" title="ลบ" onclick="deleteFacebookBot('${bot._id}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-6 col-md-4">
                                <div class="d-flex align-items-center mb-2">
                                    <small class="text-muted d-block me-2">AI Model</small>
                                    <span class="badge bg-info">${bot.aiModel || 'gpt-5'}</span>
                                </div>
                            </div>
                            <div class="col-6 col-md-4">
                                <div class="d-flex align-items-center mb-2">
                                    <small class="text-muted d-block me-2">Page ID</small>
                                    <small class="text-truncate d-block" style="max-width: 150px;" title="${bot.pageId || 'ไม่ระบุ'}">
                                        ${bot.pageId ? bot.pageId.substring(0, 10) + '...' : 'ไม่ระบุ'}
                                    </small>
                                </div>
                            </div>
                            <div class="col-6 col-md-4">
                                <div class="d-flex align-items-center mb-2">
                                    <small class="text-muted d-block me-2">Instructions</small>
                                    <span class="badge bg-secondary">${instructionsCount}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
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
