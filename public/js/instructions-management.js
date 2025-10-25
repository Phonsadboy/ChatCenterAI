// Instructions Management JavaScript

let instructionAssetsCache = [];
let instructionImageLabelsInUse = new Set();
const instructionLibraryDetailsCache = new Map();

async function fetchInstructionLibraryDetails(date) {
  if (!date) return null;
  if (instructionLibraryDetailsCache.has(date)) {
    return instructionLibraryDetailsCache.get(date);
  }
  try {
    const res = await fetch(
      `/api/instructions/library/${encodeURIComponent(date)}/details`,
    );
    if (!res.ok) throw new Error("ไม่สามารถดึงรายละเอียดคลัง instructions ได้");
    const data = await res.json();
    const detail = data && data.library ? data.library : null;
    instructionLibraryDetailsCache.set(date, detail);
    return detail;
  } catch (error) {
    console.error("fetchInstructionLibraryDetails error:", error);
    instructionLibraryDetailsCache.set(date, null);
    return null;
  }
}

function collectImageLabelsFromValue(value, accumulator) {
  if (!accumulator || !(accumulator instanceof Set)) return;
  if (typeof value === "string") {
    const regex = /#\[IMAGE:([^\]\s]+)\]/gi;
    let match;
    while ((match = regex.exec(value)) !== null) {
      const label = match[1]?.trim();
      if (label) accumulator.add(label);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageLabelsFromValue(item, accumulator));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) =>
      collectImageLabelsFromValue(item, accumulator),
    );
  }
}

async function updateInstructionImageUsage() {
  const labels = new Set();
  if (
    Array.isArray(currentBotInstructions) &&
    currentBotInstructions.length > 0
  ) {
    const detailPromises = currentBotInstructions.map((date) =>
      fetchInstructionLibraryDetails(date),
    );
    const details = await Promise.all(detailPromises);
    details.filter(Boolean).forEach((detail) => {
      const instructions = Array.isArray(detail.instructions)
        ? detail.instructions
        : [];
      instructions.forEach((instruction) =>
        collectImageLabelsFromValue(instruction, labels),
      );
    });
  }
  instructionImageLabelsInUse = labels;
}

async function refreshInstructionAssetUsage() {
  await updateInstructionImageUsage();
  renderInstructionAssets(instructionAssetsCache, instructionImageLabelsInUse);
}

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
  instructionLibraryDetailsCache.clear();
  instructionImageLabelsInUse = new Set();
  
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

    // Load assets and bind upload handler
    await loadInstructionAssets();
    const uploadBtn = document.getElementById("uploadInstructionAssetBtn");
    if (uploadBtn) {
      uploadBtn.onclick = uploadInstructionAsset;
    }

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
  instructionLibraryDetailsCache.clear();
  instructionImageLabelsInUse = new Set();
  
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

    // Load assets and bind upload handler
    await loadInstructionAssets();
    const uploadBtn = document.getElementById("uploadInstructionAssetBtn");
    if (uploadBtn) {
      uploadBtn.onclick = uploadInstructionAsset;
    }

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

// ==================== Instruction Assets Management ====================

async function loadInstructionAssets() {
  try {
    const listEl = document.getElementById("instructionAssetsList");
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-muted">กำลังโหลด...</div>';
    const res = await fetch("/admin/instructions/assets");
    if (!res.ok) throw new Error("ไม่สามารถดึงรายการรูปภาพได้");
    const data = await res.json();
    instructionAssetsCache = Array.isArray(data.assets) ? data.assets : [];
    await refreshInstructionAssetUsage();
  } catch (err) {
    console.error("loadInstructionAssets error:", err);
    if (window.adminSettings?.showAlert)
      window.adminSettings.showAlert("โหลดรายการรูปภาพไม่สำเร็จ", "danger");
    renderInstructionAssets(
      instructionAssetsCache,
      instructionImageLabelsInUse,
    );
  }
}

function createInstructionAssetCard(asset, { isActive = false } = {}) {
  if (!asset) return "";
  const label = asset.label || asset.fileName || "unknown";
  const sizeKb = asset.size ? Math.round(Number(asset.size) / 1024) : 0;
  const description = asset.description || asset.alt || "";
  const badge = isActive
    ? '<span class="badge bg-success-soft text-success ms-2"><i class="fas fa-check me-1"></i>ใช้งานอยู่</span>'
    : "";
  return `
        <div class="col-12">
            <div class="card p-2 d-flex flex-row align-items-center ${isActive ? "border border-success" : ""}">
                <img src="${asset.thumbUrl || asset.url}" class="rounded me-3" style="width:64px;height:64px;object-fit:cover;" alt="${asset.alt || label}">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center">
                        <strong>${label}</strong>
                        ${badge}
                    </div>
                    <div class="text-muted small">${sizeKb} KB</div>
                    <div class="text-muted small">${description}</div>
                    <div class="text-muted small">token: <code>#[IMAGE:${label}]</code></div>
                </div>
                <div class="ms-2 d-flex gap-2">
                    <button class="btn btn-sm btn-outline-secondary" onclick="instructionsManagement.copyImageToken('${label}')"><i class="fas fa-copy me-1"></i>คัดลอก</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="instructionsManagement.deleteInstructionAsset('${label}')"><i class="fas fa-trash me-1"></i>ลบ</button>
                </div>
            </div>
        </div>
    `;
}

function renderInstructionAssets(assets, activeLabels = new Set()) {
  const listEl = document.getElementById("instructionAssetsList");
  if (!listEl) return;
  if (!Array.isArray(assets) || assets.length === 0) {
    listEl.innerHTML = '<div class="text-muted">ยังไม่มีรูปภาพ</div>';
    return;
  }
  const activeSet = new Set();
  if (activeLabels instanceof Set) {
    activeLabels.forEach((label) => {
      if (label) activeSet.add(label);
    });
  }

  const activeAssets = assets.filter(
    (asset) => asset && activeSet.has(asset.label),
  );
  const otherAssets = assets.filter((asset) => !activeSet.has(asset?.label));

  const sections = [];
  if (activeAssets.length > 0) {
    sections.push(`
            <div class="col-12">
                <div class="text-muted text-uppercase small fw-bold mb-2">
                    <i class="fas fa-star text-warning me-1"></i>รูปภาพที่ใช้ในเพจนี้ (${activeAssets.length})
                    <span class="ms-1 text-lowercase">(อ้างอิงจาก instructions ที่เลือก)</span>
                </div>
            </div>
        `);
    sections.push(
      activeAssets
        .map((asset) => createInstructionAssetCard(asset, { isActive: true }))
        .join(""),
    );
  } else {
    sections.push(`
            <div class="col-12 text-muted small mb-2">
                ยังไม่มีรูปภาพที่อ้างอิงใน instructions ของเพจนี้ (เพิ่มโทเคน #[IMAGE:label] ในข้อความเพื่อใช้งาน)
            </div>
        `);
  }

  if (otherAssets.length > 0) {
    if (activeAssets.length > 0) {
      sections.push('<div class="col-12"><hr class="my-3"></div>');
    }
    sections.push(`
            <div class="col-12">
                <div class="text-muted text-uppercase small fw-bold mb-2">
                    <i class="fas fa-images me-1"></i>รูปภาพอื่นในคลัง (${otherAssets.length})
                    <span class="ms-1 text-lowercase">(ใช้ร่วมกันทุกเพจ)</span>
                </div>
            </div>
        `);
    sections.push(
      otherAssets
        .map((asset) => createInstructionAssetCard(asset, { isActive: false }))
        .join(""),
    );
  }

  listEl.innerHTML = sections.join("");
}

async function uploadInstructionAsset() {
  const fileEl = document.getElementById("instructionAssetFile");
  const labelEl = document.getElementById("instructionAssetLabel");
  const descEl = document.getElementById("instructionAssetDescription");
  const overwriteEl = document.getElementById("assetOverwrite");
  if (!fileEl?.files?.[0] || !labelEl?.value) {
    if (window.adminSettings?.showAlert)
      window.adminSettings.showAlert(
        "กรุณาเลือกไฟล์และระบุชื่อรูปภาพ",
        "warning",
      );
    return;
  }
  const form = new FormData();
  form.append("image", fileEl.files[0]);
  form.append("label", labelEl.value.trim());
  form.append("description", (descEl?.value || "").trim());
  form.append("overwrite", overwriteEl?.checked ? "true" : "false");
  try {
    const res = await fetch("/admin/instructions/assets", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "อัพโหลดไม่สำเร็จ");
    if (window.adminSettings?.showAlert)
      window.adminSettings.showAlert("อัพโหลดรูปภาพสำเร็จ", "success");
    // reset inputs
    fileEl.value = "";
    // refresh list
    await loadInstructionAssets();
  } catch (err) {
    console.error("uploadInstructionAsset error:", err);
    if (window.adminSettings?.showAlert)
      window.adminSettings.showAlert(
        err.message || "อัพโหลดรูปภาพไม่สำเร็จ",
        "danger",
      );
  }
}

async function deleteInstructionAsset(label) {
  if (!confirm(`ยืนยันการลบรูปภาพ: ${label}?`)) return;
  try {
    const res = await fetch(
      `/admin/instructions/assets/${encodeURIComponent(label)}`,
      { method: "DELETE" },
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "ลบไม่สำเร็จ");
    if (window.adminSettings?.showAlert)
      window.adminSettings.showAlert("ลบรูปภาพสำเร็จ", "success");
    await loadInstructionAssets();
  } catch (err) {
    console.error("deleteInstructionAsset error:", err);
    if (window.adminSettings?.showAlert)
      window.adminSettings.showAlert(
        err.message || "ลบรูปภาพไม่สำเร็จ",
        "danger",
      );
  }
}

function copyImageToken(label) {
  const token = `#[IMAGE:${label}]`;
  navigator.clipboard
    ?.writeText(token)
    .then(() => {
      if (window.adminSettings?.showAlert)
        window.adminSettings.showAlert("คัดลอกโทเคนเรียบร้อยแล้ว", "success");
    })
    .catch(() => {
      // fallback
      window.prompt("คัดลอกโทเคนด้วยตนเอง:", token);
    });
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
  // assets
  loadInstructionAssets,
  uploadInstructionAsset,
  deleteInstructionAsset,
  copyImageToken,
};
