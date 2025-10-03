// Instructions Management JavaScript

// Manage Instructions for Line Bot
async function manageInstructions(botId) {
    currentBotType = 'line';
    currentBotId = botId;
    currentBotInstructions = [];

    try {
        // Load Line Bot details
        const botResponse = await fetch(`/api/line-bots/${botId}`);
        if (botResponse.ok) {
            const bot = await botResponse.json();
            currentBotInstructions = bot.selectedInstructions || [];
        }

        // Load available instruction libraries
        const libraryResponse = await fetch('/api/instructions/library');
        if (libraryResponse.ok) {
            const result = await libraryResponse.json();
            availableLibraries = result.libraries || [];
        }

        // Display data
        displayInstructionLibraries();
        displaySelectedInstructions();

        // Load assets and bind upload handler
        await loadInstructionAssets();
        const uploadBtn = document.getElementById('uploadInstructionAssetBtn');
        if (uploadBtn) {
            uploadBtn.onclick = uploadInstructionAsset;
        }

        // Show modal
        const manageInstructionsModalLabel = document.getElementById('manageInstructionsModalLabel');
        if (manageInstructionsModalLabel) {
            manageInstructionsModalLabel.innerHTML = '<i class="fas fa-book me-2"></i>จัดการ Instructions สำหรับ Line Bot';
        }
        
        const modal = new bootstrap.Modal(document.getElementById('manageInstructionsModal'));
        modal.show();

    } catch (error) {
        console.error('Error loading instruction data:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล instructions', 'danger');
    }
}

// Manage Instructions for Facebook Bot
async function manageFacebookInstructions(botId) {
    currentBotType = 'facebook';
    currentBotId = botId;
    currentBotInstructions = [];

    try {
        // Load Facebook Bot details
        const botResponse = await fetch(`/api/facebook-bots/${botId}`);
        if (botResponse.ok) {
            const bot = await botResponse.json();
            currentBotInstructions = bot.selectedInstructions || [];
        }

        // Load available instruction libraries
        const libraryResponse = await fetch('/api/instructions/library');
        if (libraryResponse.ok) {
            const result = await libraryResponse.json();
            availableLibraries = result.libraries || [];
        }

        // Display data
        displayInstructionLibraries();
        displaySelectedInstructions();

        // Load assets and bind upload handler
        await loadInstructionAssets();
        const uploadBtn = document.getElementById('uploadInstructionAssetBtn');
        if (uploadBtn) {
            uploadBtn.onclick = uploadInstructionAsset;
        }

        // Show modal
        const manageInstructionsModalLabel = document.getElementById('manageInstructionsModalLabel');
        if (manageInstructionsModalLabel) {
            manageInstructionsModalLabel.innerHTML = '<i class="fas fa-book me-2"></i>จัดการ Instructions สำหรับ Facebook Bot';
        }
        
        const modal = new bootstrap.Modal(document.getElementById('manageInstructionsModal'));
        modal.show();

    } catch (error) {
        console.error('Error loading facebook instruction data:', error);
        showAlert('เกิดข้อผิดพลาดในการโหลดข้อมูล instructions', 'danger');
    }
}

// Display available instruction libraries
function displayInstructionLibraries() {
    const container = document.getElementById('instructionLibraries');
    if (!container) return;
    
    if (!availableLibraries || availableLibraries.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                ยังไม่มีคลัง instructions ในระบบ
            </div>
        `;
        return;
    }

    let html = '';
    availableLibraries.forEach(library => {
        const isSelected = currentBotInstructions.includes(library.date);
        const selectedClass = isSelected ? 'border-success bg-light' : 'border-secondary';
        const selectedIcon = isSelected ? '<i class="fas fa-check-circle text-success me-2"></i>' : '<i class="fas fa-circle text-muted me-2"></i>';
        
        html += `
            <div class="card mb-2 ${selectedClass} library-item" data-date="${library.date}" style="cursor: pointer;">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            ${selectedIcon}
                            <strong>${library.name || library.displayDate}</strong>
                            <br>
                            <small class="text-muted">${library.description || 'ไม่มีคำอธิบาย'}</small>
                            <br>
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>${library.displayDate} 
                                <i class="fas fa-clock me-1 ms-2"></i>${library.displayTime}
                            </small>
                        </div>
                        <div class="text-end">
                            <small class="badge bg-${library.type === 'auto' ? 'primary' : 'success'}">${library.type === 'auto' ? 'อัตโนมัติ' : 'ด้วยตนเอง'}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Add click events
    document.querySelectorAll('.library-item').forEach(item => {
        item.addEventListener('click', function() {
            const date = this.dataset.date;
            toggleLibrarySelection(date);
        });
    });
}

// Display selected instructions
function displaySelectedInstructions() {
    const container = document.getElementById('selectedInstructions');
    if (!container) return;
    
    if (currentBotInstructions.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ยังไม่ได้เลือก instructions จากคลัง
            </div>
        `;
        return;
    }

    let html = '<div class="mb-2"><strong>คลังที่เลือกใช้:</strong></div>';
    currentBotInstructions.forEach(date => {
        const library = availableLibraries.find(lib => lib.date === date);
        if (library) {
            html += `
                <div class="card mb-2 border-success bg-light">
                    <div class="card-body p-2">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <i class="fas fa-check-circle text-success me-2"></i>
                                <strong>${library.name || library.displayDate}</strong>
                                <br>
                                <small class="text-muted">${library.description || 'ไม่มีคำอธิบาย'}</small>
                            </div>
                            <button class="btn btn-sm btn-outline-danger" onclick="removeLibrarySelection('${date}')">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
}

// Toggle library selection
function toggleLibrarySelection(date) {
    const index = currentBotInstructions.indexOf(date);
    if (index > -1) {
        // Remove if already selected
        currentBotInstructions.splice(index, 1);
    } else {
        // Add if not selected
        currentBotInstructions.push(date);
    }
    
    // Refresh display
    displayInstructionLibraries();
    displaySelectedInstructions();
}

// Remove library selection
function removeLibrarySelection(date) {
    const index = currentBotInstructions.indexOf(date);
    if (index > -1) {
        currentBotInstructions.splice(index, 1);
        displayInstructionLibraries();
        displaySelectedInstructions();
    }
}

// Save selected instructions
async function saveSelectedInstructions() {
    if (!currentBotId || !currentBotType) {
        showAlert('ไม่พบ Bot ID', 'danger');
        return;
    }

    try {
        const url = currentBotType === 'facebook'
            ? `/api/facebook-bots/${currentBotId}/instructions`
            : `/api/line-bots/${currentBotId}/instructions`;

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                selectedInstructions: currentBotInstructions
            })
        });

        if (response.ok) {
            showAlert('บันทึกการเลือกใช้ instructions เรียบร้อยแล้ว', 'success');

            // Refresh bot list
            if (currentBotType === 'facebook') {
                await loadFacebookBotSettings();
            } else {
                await loadLineBotSettings();
            }

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('manageInstructionsModal'));
            if (modal) modal.hide();
        } else {
            showAlert('ไม่สามารถบันทึกการเลือกใช้ instructions ได้', 'danger');
        }
    } catch (error) {
        console.error('Error saving instructions:', error);
        showAlert('เกิดข้อผิดพลาดในการบันทึกการเลือกใช้ instructions', 'danger');
    }
}

// Load overview data
async function loadOverviewData() {
    try {
        // โหลดข้อมูล Line Bot
        const lineBotResponse = await fetch('/api/line-bots');
        if (lineBotResponse.ok) {
            const lineBots = await lineBotResponse.json();
            displayLineBotOverview(lineBots);
        }
        
        // โหลดข้อมูล Facebook Bot
        const facebookBotResponse = await fetch('/api/facebook-bots');
        if (facebookBotResponse.ok) {
            const facebookBots = await facebookBotResponse.json();
            displayFacebookBotOverview(facebookBots);
        }
        
        // โหลดข้อมูล AI Models
        displayAiModelOverview();
        
        // โหลดข้อมูล Instructions
        const instructionsResponse = await fetch('/api/instructions/library');
        if (instructionsResponse.ok) {
            const result = await instructionsResponse.json();
            displayInstructionsOverview(result.libraries || []);
        }
        
        // โหลดข้อมูลความปลอดภัย
        displaySecurityOverview();
        
    } catch (error) {
        console.error('Error loading overview data:', error);
    }
}

// Display Line Bot overview
function displayLineBotOverview(lineBots) {
    const container = document.getElementById('lineBotOverview');
    if (!container) {
        console.log('Line Bot Overview container not found');
        return;
    }
    
    const total = lineBots.length;
    const active = lineBots.filter(bot => bot.status === 'active').length;
    
    if (total === 0) {
        container.innerHTML = '<p class="text-muted mb-0">ยังไม่มี Line Bot</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">${total}</h4>
                <small>Bot ทั้งหมด</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-success">${active}</h6>
                <small>Bot ที่ใช้งาน</small>
            </div>
        </div>
    `;
}

// Display AI Model overview
function displayAiModelOverview() {
    const container = document.getElementById('aiModelOverview');
    if (!container) {
        console.log('AI Model Overview container not found');
        return;
    }
    
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">7</h4>
                <small>Models ที่รองรับ</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-primary">GPT-5</h6>
                <small>Model หลัก</small>
            </div>
        </div>
    `;
}

// Display Instructions overview
function displayInstructionsOverview(libraries) {
    const container = document.getElementById('instructionsOverview');
    if (!container) {
        console.log('Instructions Overview container not found');
        return;
    }
    
    const total = libraries.length;
    
    if (total === 0) {
        container.innerHTML = '<p class="text-muted mb-0">ยังไม่มี Instructions</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">${total}</h4>
                <small>คลัง Instructions</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-info">พร้อมใช้งาน</h6>
                <small>เลือกใช้ได้ทันที</small>
            </div>
        </div>
    `;
    
    // อัปเดตจำนวน Instructions ในแท็บ AI
    const instructionsCountElement = document.getElementById('instructionsCount');
    if (instructionsCountElement) {
        instructionsCountElement.textContent = total;
    }
}

// ==================== Instruction Assets Management ====================

async function loadInstructionAssets() {
    try {
        const listEl = document.getElementById('instructionAssetsList');
        if (!listEl) return;
        listEl.innerHTML = '<div class="text-muted">กำลังโหลด...</div>';
        const res = await fetch('/admin/instructions/assets');
        if (!res.ok) throw new Error('ไม่สามารถดึงรายการรูปภาพได้');
        const data = await res.json();
        const assets = data.assets || [];
        renderInstructionAssets(assets);
    } catch (err) {
        console.error('loadInstructionAssets error:', err);
        if (window.adminSettings?.showAlert) window.adminSettings.showAlert('โหลดรายการรูปภาพไม่สำเร็จ', 'danger');
    }
}

function renderInstructionAssets(assets) {
    const listEl = document.getElementById('instructionAssetsList');
    if (!listEl) return;
    if (!assets || assets.length === 0) {
        listEl.innerHTML = '<div class="text-muted">ยังไม่มีรูปภาพ</div>';
        return;
    }
    listEl.innerHTML = assets.map(a => `
        <div class="col-12">
            <div class="card p-2 d-flex flex-row align-items-center">
                <img src="${a.thumbUrl || a.url}" class="rounded me-2" style="width:64px;height:64px;object-fit:cover;" alt="${a.alt || a.label}">
                <div class="flex-grow-1">
                    <div><strong>${a.label}</strong> <span class="text-muted small">(${Math.round((a.size||0)/1024)} KB)</span></div>
                    <div class="text-muted small">${a.description || a.alt || ''}</div>
                    <div class="text-muted small">token: <code>#[IMAGE:${a.label}]</code></div>
                </div>
                <div class="ms-2 d-flex gap-2">
                    <button class="btn btn-sm btn-outline-secondary" onclick="instructionsManagement.copyImageToken('${a.label}')"><i class="fas fa-copy me-1"></i>คัดลอก</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="instructionsManagement.deleteInstructionAsset('${a.label}')"><i class="fas fa-trash me-1"></i>ลบ</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function uploadInstructionAsset() {
    const fileEl = document.getElementById('instructionAssetFile');
    const labelEl = document.getElementById('instructionAssetLabel');
    const altEl = document.getElementById('instructionAssetAlt');
    const descEl = document.getElementById('instructionAssetDescription');
    const overwriteEl = document.getElementById('assetOverwrite');
    if (!fileEl?.files?.[0] || !labelEl?.value) {
        if (window.adminSettings?.showAlert) window.adminSettings.showAlert('กรุณาเลือกไฟล์และระบุ label', 'warning');
        return;
    }
    const form = new FormData();
    form.append('image', fileEl.files[0]);
    form.append('label', labelEl.value.trim());
    form.append('alt', (altEl?.value || '').trim());
    form.append('description', (descEl?.value || '').trim());
    form.append('overwrite', overwriteEl?.checked ? 'true' : 'false');
    try {
        const res = await fetch('/admin/instructions/assets', { method: 'POST', body: form });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'อัพโหลดไม่สำเร็จ');
        if (window.adminSettings?.showAlert) window.adminSettings.showAlert('อัพโหลดรูปภาพสำเร็จ', 'success');
        // reset inputs
        fileEl.value = '';
        // refresh list
        await loadInstructionAssets();
    } catch (err) {
        console.error('uploadInstructionAsset error:', err);
        if (window.adminSettings?.showAlert) window.adminSettings.showAlert(err.message || 'อัพโหลดรูปภาพไม่สำเร็จ', 'danger');
    }
}

async function deleteInstructionAsset(label) {
    if (!confirm(`ยืนยันการลบรูปภาพ: ${label}?`)) return;
    try {
        const res = await fetch(`/admin/instructions/assets/${encodeURIComponent(label)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'ลบไม่สำเร็จ');
        if (window.adminSettings?.showAlert) window.adminSettings.showAlert('ลบรูปภาพสำเร็จ', 'success');
        await loadInstructionAssets();
    } catch (err) {
        console.error('deleteInstructionAsset error:', err);
        if (window.adminSettings?.showAlert) window.adminSettings.showAlert(err.message || 'ลบรูปภาพไม่สำเร็จ', 'danger');
    }
}

function copyImageToken(label) {
    const token = `#[IMAGE:${label}]`;
    navigator.clipboard?.writeText(token).then(() => {
        if (window.adminSettings?.showAlert) window.adminSettings.showAlert('คัดลอกโทเคนเรียบร้อยแล้ว', 'success');
    }).catch(() => {
        // fallback
        window.prompt('คัดลอกโทเคนด้วยตนเอง:', token);
    });
}

// Display Security overview
function displaySecurityOverview() {
    const container = document.getElementById('securityOverview');
    if (!container) {
        console.log('Security Overview container not found');
        return;
    }
    
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">3</h4>
                <small>ฟีเจอร์ความปลอดภัย</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-warning">เปิดใช้งาน</h6>
                <small>ระบบป้องกัน</small>
            </div>
        </div>
    `;
}

// Export functions for use in other modules
window.instructionsManagement = {
    manageInstructions,
    manageFacebookInstructions,
    displayInstructionLibraries,
    displaySelectedInstructions,
    toggleLibrarySelection,
    removeLibrarySelection,
    saveSelectedInstructions,
    loadOverviewData,
    displayLineBotOverview,
    displayAiModelOverview,
    displayInstructionsOverview,
    displaySecurityOverview,
    // assets
    loadInstructionAssets,
    uploadInstructionAsset,
    deleteInstructionAsset,
    copyImageToken
};
