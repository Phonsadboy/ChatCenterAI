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
    displaySecurityOverview
};
