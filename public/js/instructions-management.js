// Instructions Management JavaScript

// Clean up modal backdrops
function cleanupModalBackdrop() {
  setTimeout(() => {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }, 300);
}

// Setup modal event listeners
function setupModalEventListeners() {
  const modalElement = document.getElementById("manageInstructionsModal");
  if (modalElement && !modalElement.hasAttribute('data-listeners-attached')) {
    modalElement.addEventListener('hidden.bs.modal', cleanupModalBackdrop);
    modalElement.setAttribute('data-listeners-attached', 'true');
  }
}

// Manage Instructions for Line Bot
async function manageInstructions(botId) {
  currentBotType = "line";
  currentBotId = botId;
  currentBotInstructions = [];
  
  // Setup modal cleanup listeners
  setupModalEventListeners();

  try {
    // Load Line Bot details
    const botResponse = await fetch(`/api/line-bots/${botId}`);
    if (botResponse.ok) {
      const bot = await botResponse.json();
      currentBotInstructions = bot.selectedInstructions || [];
      
      // Load keyword settings
      loadKeywordSettingsToForm(bot.keywordSettings);
    }

    // Load available instruction libraries
    const libraryResponse = await fetch("/api/instructions/library");
    if (libraryResponse.ok) {
      const result = await libraryResponse.json();
      availableLibraries = result.libraries || [];
    }

  // Display data
  displayInstructionLibraries();
  displaySelectedInstructions();
  updateInstructionCounts();

    // Show modal
    const manageInstructionsModalLabel = document.getElementById(
      "manageInstructionsModalLabel",
    );
    if (manageInstructionsModalLabel) {
      manageInstructionsModalLabel.innerHTML =
        '<i class="fab fa-line me-2"></i>จัดการ Instructions - Line Bot';
    }

    const modalElement = document.getElementById("manageInstructionsModal");
    let modal = bootstrap.Modal.getInstance(modalElement);
    if (!modal) {
      modal = new bootstrap.Modal(modalElement);
    }
    modal.show();
  } catch (error) {
    console.error("Error loading instruction data:", error);
    showAlert("เกิดข้อผิดพลาดในการโหลดข้อมูล instructions", "danger");
  }
}

// Manage Instructions for Facebook Bot
async function manageFacebookInstructions(botId) {
  currentBotType = "facebook";
  currentBotId = botId;
  currentBotInstructions = [];
  
  // Setup modal cleanup listeners
  setupModalEventListeners();

  try {
    // Load Facebook Bot details
    const botResponse = await fetch(`/api/facebook-bots/${botId}`);
    if (botResponse.ok) {
      const bot = await botResponse.json();
      currentBotInstructions = bot.selectedInstructions || [];
      
      // Load keyword settings
      loadKeywordSettingsToForm(bot.keywordSettings);
    }

    // Load available instruction libraries
    const libraryResponse = await fetch("/api/instructions/library");
    if (libraryResponse.ok) {
      const result = await libraryResponse.json();
      availableLibraries = result.libraries || [];
    }

  // Display data
  displayInstructionLibraries();
  displaySelectedInstructions();
  updateInstructionCounts();

    // Show modal
    const manageInstructionsModalLabel = document.getElementById(
      "manageInstructionsModalLabel",
    );
    if (manageInstructionsModalLabel) {
      manageInstructionsModalLabel.innerHTML =
        '<i class="fab fa-facebook me-2"></i>จัดการ Instructions - Facebook Bot';
    }

    const modalElement = document.getElementById("manageInstructionsModal");
    let modal = bootstrap.Modal.getInstance(modalElement);
    if (!modal) {
      modal = new bootstrap.Modal(modalElement);
    }
    modal.show();
  } catch (error) {
    console.error("Error loading facebook instruction data:", error);
    showAlert("เกิดข้อผิดพลาดในการโหลดข้อมูล instructions", "danger");
  }
}

// Display available instruction libraries (Single-Select UI)
function displayInstructionLibraries() {
  const container = document.getElementById("instructionLibraries");
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

  let html = '<div class="mb-2 text-muted small"><i class="fas fa-info-circle me-1"></i>คลิกเพื่อเลือก instruction (เลือกได้เพียง 1 อัน)</div>';
  availableLibraries.forEach((library) => {
    const isSelected = currentBotInstructions.includes(library.date);
    const selectedClass = isSelected
      ? "border-primary bg-light shadow-sm"
      : "border-secondary";
    const selectedIcon = isSelected
      ? '<i class="fas fa-dot-circle text-primary me-2"></i>'
      : '<i class="far fa-circle text-muted me-2"></i>';
    const selectedBadge = isSelected 
      ? '<span class="badge bg-primary ms-2"><i class="fas fa-check me-1"></i>ใช้งานอยู่</span>' 
      : '';

    html += `
            <div class="card mb-2 ${selectedClass} library-item" data-date="${library.date}" style="cursor: pointer; transition: all 0.2s;">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            ${selectedIcon}
                            <strong>${library.name || library.displayDate}</strong>
                            ${selectedBadge}
                            <br>
                            <small class="text-muted">${library.description || "ไม่มีคำอธิบาย"}</small>
                            <br>
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>${library.displayDate}
                                <i class="fas fa-clock me-1 ms-2"></i>${library.displayTime}
                            </small>
                        </div>
                        <div class="text-end">
                            <small class="badge bg-${library.type === "auto" ? "primary" : "success"}">${library.type === "auto" ? "อัตโนมัติ" : "ด้วยตนเอง"}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
  });

  container.innerHTML = html;

  // Add click events with hover effect
  document.querySelectorAll(".library-item").forEach((item) => {
    item.addEventListener("click", function () {
      const date = this.dataset.date;
      toggleLibrarySelection(date);
    });
    
    // Add hover effect
    item.addEventListener("mouseenter", function() {
      if (!this.classList.contains("bg-light")) {
        this.style.backgroundColor = "#f8f9fa";
      }
    });
    
    item.addEventListener("mouseleave", function() {
      if (!this.classList.contains("bg-light")) {
        this.style.backgroundColor = "";
      }
    });
  });
}

// Display selected instructions (Single-Select UI)
function displaySelectedInstructions() {
  const container = document.getElementById("selectedInstructions");
  if (!container) return;

  if (currentBotInstructions.length === 0) {
    container.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ยังไม่ได้เลือก instruction จากคลัง
                <div class="small mt-2 text-muted">
                    <i class="fas fa-lightbulb me-1"></i>คลิกที่รายการด้านซ้ายเพื่อเลือก instruction ที่ต้องการใช้
                </div>
            </div>
        `;
    return;
  }

  let html = '<div class="mb-2"><strong>Instruction ที่เลือกใช้:</strong></div>';
  
  // Since single-select, only show the first (and only) item
  const date = currentBotInstructions[0];
  const library = availableLibraries.find((lib) => lib.date === date);
  
  if (library) {
    html += `
            <div class="card border-primary shadow-sm">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center mb-2">
                                <i class="fas fa-check-circle text-primary me-2"></i>
                                <strong class="text-primary">${library.name || library.displayDate}</strong>
                                <span class="badge bg-primary ms-2">กำลังใช้งาน</span>
                            </div>
                            <div class="text-muted small mb-2">
                                ${library.description || "ไม่มีคำอธิบาย"}
                            </div>
                            <div class="text-muted small">
                                <i class="fas fa-calendar me-1"></i>${library.displayDate}
                                <i class="fas fa-clock me-1 ms-2"></i>${library.displayTime}
                            </div>
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="removeLibrarySelection('${date}')" title="ยกเลิกการเลือก">
                            <i class="fas fa-times me-1"></i>ยกเลิก
                        </button>
                    </div>
                </div>
            </div>
            <div class="alert alert-info mt-2 mb-0 small">
                <i class="fas fa-info-circle me-1"></i>
                <strong>หมายเหตุ:</strong> เลือกได้เพียง 1 instruction ต่อ 1 เพจ/ไลน์ หากต้องการเปลี่ยน กรุณาคลิกเลือก instruction ใหม่ทางด้านซ้าย
            </div>
        `;
  } else {
    // Fallback if library not found
    html += `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                ไม่พบข้อมูล instruction ที่เลือก
            </div>
        `;
  }

  container.innerHTML = html;
}

// Toggle library selection (Single-Select Mode)
function toggleLibrarySelection(date) {
  // Single-select mode: Replace the current selection with new one
  if (currentBotInstructions.length === 1 && currentBotInstructions[0] === date) {
    // If clicking the already selected item, deselect it
    currentBotInstructions = [];
  } else {
    // Replace with new selection (only one item)
    currentBotInstructions = [date];
  }

  // Refresh display
  displayInstructionLibraries();
  displaySelectedInstructions();
  updateInstructionCounts();
  refreshInstructionAssetUsage().catch((err) =>
    console.error("refreshInstructionAssetUsage error:", err),
  );
}

// Remove library selection
function removeLibrarySelection(date) {
  const index = currentBotInstructions.indexOf(date);
  if (index > -1) {
    currentBotInstructions.splice(index, 1);
    displayInstructionLibraries();
    displaySelectedInstructions();
    updateInstructionCounts();
    refreshInstructionAssetUsage().catch((err) =>
      console.error("refreshInstructionAssetUsage error:", err),
    );
  }
}

// Update instruction counts in badges
function updateInstructionCounts() {
  // Update libraries count
  const librariesCountEl = document.getElementById('librariesCount');
  if (librariesCountEl) {
    librariesCountEl.textContent = availableLibraries.length;
  }
  
  // Update selected count
  const selectedCountEl = document.getElementById('selectedCount');
  if (selectedCountEl) {
    const count = currentBotInstructions.length;
    selectedCountEl.textContent = `${count} / 1`;
    
    // Change badge color based on selection
    selectedCountEl.className = 'badge';
    if (count === 0) {
      selectedCountEl.classList.add('bg-secondary');
    } else {
      selectedCountEl.classList.add('bg-primary');
    }
  }
}

// Save selected instructions
// Load keyword settings to form
function loadKeywordSettingsToForm(keywordSettings) {
  const normalizeKeywordSetting = (setting) => {
    if (!setting) return { keyword: '', response: '' };
    if (typeof setting === 'string') return { keyword: setting, response: '' };
    return { keyword: setting.keyword || '', response: setting.response || '' };
  };
  
  const enableAI = normalizeKeywordSetting(keywordSettings?.enableAI);
  const disableAI = normalizeKeywordSetting(keywordSettings?.disableAI);
  const disableFollowUp = normalizeKeywordSetting(keywordSettings?.disableFollowUp);
  
  const keywordEnableAI = document.getElementById('instructionsKeywordEnableAI');
  const keywordEnableAIResponse = document.getElementById('instructionsKeywordEnableAIResponse');
  
  const keywordDisableAI = document.getElementById('instructionsKeywordDisableAI');
  const keywordDisableAIResponse = document.getElementById('instructionsKeywordDisableAIResponse');
  
  const keywordDisableFollowUp = document.getElementById('instructionsKeywordDisableFollowUp');
  const keywordDisableFollowUpResponse = document.getElementById('instructionsKeywordDisableFollowUpResponse');
  
  if (keywordEnableAI) keywordEnableAI.value = enableAI.keyword || '';
  if (keywordEnableAIResponse) keywordEnableAIResponse.value = enableAI.response || '';
  
  if (keywordDisableAI) keywordDisableAI.value = disableAI.keyword || '';
  if (keywordDisableAIResponse) keywordDisableAIResponse.value = disableAI.response || '';
  
  if (keywordDisableFollowUp) keywordDisableFollowUp.value = disableFollowUp.keyword || '';
  if (keywordDisableFollowUpResponse) keywordDisableFollowUpResponse.value = disableFollowUp.response || '';
}

async function saveSelectedInstructions() {
  if (!currentBotId || !currentBotType) {
    showAlert("ไม่พบ Bot ID", "danger");
    return;
  }

  try {
    // Save instructions
    const instructionsUrl =
      currentBotType === "facebook"
        ? `/api/facebook-bots/${currentBotId}/instructions`
        : `/api/line-bots/${currentBotId}/instructions`;

    const instructionsResponse = await fetch(instructionsUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        selectedInstructions: currentBotInstructions,
      }),
    });

    // Save keyword settings
    const keywordEnableAI = document.getElementById('instructionsKeywordEnableAI');
    const keywordEnableAIResponse = document.getElementById('instructionsKeywordEnableAIResponse');
    
    const keywordDisableAI = document.getElementById('instructionsKeywordDisableAI');
    const keywordDisableAIResponse = document.getElementById('instructionsKeywordDisableAIResponse');
    
    const keywordDisableFollowUp = document.getElementById('instructionsKeywordDisableFollowUp');
    const keywordDisableFollowUpResponse = document.getElementById('instructionsKeywordDisableFollowUpResponse');
    
    const keywordSettings = {
      enableAI: {
        keyword: keywordEnableAI?.value?.trim() || '',
        response: keywordEnableAIResponse?.value?.trim() || ''
      },
      disableAI: {
        keyword: keywordDisableAI?.value?.trim() || '',
        response: keywordDisableAIResponse?.value?.trim() || ''
      },
      disableFollowUp: {
        keyword: keywordDisableFollowUp?.value?.trim() || '',
        response: keywordDisableFollowUpResponse?.value?.trim() || ''
      }
    };

    const keywordsUrl =
      currentBotType === "facebook"
        ? `/api/facebook-bots/${currentBotId}/keywords`
        : `/api/line-bots/${currentBotId}/keywords`;

    const keywordsResponse = await fetch(keywordsUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keywordSettings }),
    });

    if (instructionsResponse.ok && keywordsResponse.ok) {
      showAlert("บันทึก instructions และ keyword settings เรียบร้อยแล้ว", "success");

      // Refresh bot list
      if (currentBotType === "facebook") {
        await loadFacebookBotSettings();
      } else {
        await loadLineBotSettings();
      }

      // Close modal
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("manageInstructionsModal"),
      );
      if (modal) {
        modal.hide();
        // Cleanup will be handled by the hidden.bs.modal event listener
      }
    } else {
      showAlert("ไม่สามารถบันทึกข้อมูลได้", "danger");
    }
  } catch (error) {
    console.error("Error saving instructions and keywords:", error);
    showAlert("เกิดข้อผิดพลาดในการบันทึกข้อมูล", "danger");
  }
}

// Load overview data
async function loadOverviewData() {
  try {
    // โหลดข้อมูล Line Bot
    const lineBotResponse = await fetch("/api/line-bots");
    if (lineBotResponse.ok) {
      const lineBots = await lineBotResponse.json();
      displayLineBotOverview(lineBots);
    }

    // โหลดข้อมูล Facebook Bot
    const facebookBotResponse = await fetch("/api/facebook-bots");
    if (facebookBotResponse.ok) {
      const facebookBots = await facebookBotResponse.json();
      displayFacebookBotOverview(facebookBots);
    }

    // โหลดข้อมูล AI Models
    displayAiModelOverview();

    // โหลดข้อมูล Instructions
    const instructionsResponse = await fetch("/api/instructions/library");
    if (instructionsResponse.ok) {
      const result = await instructionsResponse.json();
      displayInstructionsOverview(result.libraries || []);
    }

    // โหลดข้อมูลความปลอดภัย
    displaySecurityOverview();
  } catch (error) {
    console.error("Error loading overview data:", error);
  }
}

// Display Line Bot overview
function displayLineBotOverview(lineBots) {
  const container = document.getElementById("lineBotOverview");
  if (!container) {
    console.log("Line Bot Overview container not found");
    return;
  }

  const total = lineBots.length;
  const active = lineBots.filter((bot) => bot.status === "active").length;

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

// Display Facebook Bot overview
function displayFacebookBotOverview(facebookBots) {
  const container = document.getElementById("facebookBotOverview");
  if (!container) {
    console.log("Facebook Bot Overview container not found");
    return;
  }

  const total = facebookBots.length;
  const active = facebookBots.filter((bot) => bot.status === "active").length;

  if (total === 0) {
    container.innerHTML =
      '<p class="text-muted mb-0">ยังไม่มี Facebook Bot</p>';
    return;
  }

  container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">${total}</h4>
                <small>เพจที่เชื่อมต่อ</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-primary">${active}</h6>
                <small>พร้อมตอบกลับ</small>
            </div>
        </div>
    `;
}

// Display AI Model overview
function displayAiModelOverview() {
  const container = document.getElementById("aiModelOverview");
  if (!container) {
    console.log("AI Model Overview container not found");
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
  const container = document.getElementById("instructionsOverview");
  if (!container) {
    console.log("Instructions Overview container not found");
    return;
  }

  const total = libraries.length;

  if (total === 0) {
    container.innerHTML =
      '<p class="text-muted mb-0">ยังไม่มี Instructions</p>';
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
  const instructionsCountElement = document.getElementById("instructionsCount");
  if (instructionsCountElement) {
    instructionsCountElement.textContent = total;
  }
}

// Display Security overview
function displaySecurityOverview() {
  const container = document.getElementById("securityOverview");
  if (!container) {
    console.log("Security Overview container not found");
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
  updateInstructionCounts,
  loadOverviewData,
  displayLineBotOverview,
  displayFacebookBotOverview,
  displayAiModelOverview,
  displayInstructionsOverview,
  displaySecurityOverview,
};
