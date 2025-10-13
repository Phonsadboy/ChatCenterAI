// Instructions Management JavaScript

let instructionAssetsCache = [];
let instructionImageLabelsInUse = new Set();
const instructionLibraryDetailsCache = new Map();

let availableInstructionList = [];
let instructionLookupById = new Map();
let instructionLookupByObjectId = new Map();
let instructionVersionCache = new Map();
let instructionModalInitialized = false;
let instructionSearchKeyword = '';
let pendingLegacySelections = [];
let legacyConversionSummary = { converted: [], warnings: [] };

function normalizeSelectionList(rawSelections = []) {
    const objectSelections = [];
    const legacyKeys = [];
    const seenKeys = new Set();

    rawSelections.forEach(entry => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry) && entry.instructionId) {
            const instructionId = String(entry.instructionId).trim();
            if (!instructionId) return;
            const version = Number.isInteger(entry.version) ? entry.version : null;
            const key = `${instructionId}::${version === null ? 'latest' : version}`;
            if (seenKeys.has(key)) return;
            seenKeys.add(key);
            objectSelections.push({ instructionId, version });
        } else if (typeof entry === 'string') {
            const value = entry.trim();
            if (!value) return;
            if (seenKeys.has(value)) return;
            seenKeys.add(value);
            legacyKeys.push(value);
        }
    });

    return { objectSelections, legacyKeys };
}

async function fetchInstructionLibraryDetails(date) {
    if (!date) return null;
    if (instructionLibraryDetailsCache.has(date)) {
        return instructionLibraryDetailsCache.get(date);
    }
    try {
        const res = await fetch(`/api/instructions/library/${encodeURIComponent(date)}/details`);
        if (!res.ok) throw new Error('ไม่สามารถดึงรายละเอียดคลัง instructions ได้');
        const data = await res.json();
        const detail = data && data.library ? data.library : null;
        instructionLibraryDetailsCache.set(date, detail);
        return detail;
    } catch (error) {
        console.error('fetchInstructionLibraryDetails error:', error);
        instructionLibraryDetailsCache.set(date, null);
        return null;
    }
}

function collectImageLabelsFromValue(value, accumulator) {
    if (!accumulator || !(accumulator instanceof Set)) return;
    if (typeof value === 'string') {
        const regex = /#\[IMAGE:([^\]\s]+)\]/gi;
        let match;
        while ((match = regex.exec(value)) !== null) {
            const label = match[1]?.trim();
            if (label) accumulator.add(label);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectImageLabelsFromValue(item, accumulator));
        return;
    }
    if (value && typeof value === 'object') {
        Object.values(value).forEach(item => collectImageLabelsFromValue(item, accumulator));
    }
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function formatInstructionTimestamp(value) {
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

function getInstructionCacheKey(instructionId, version) {
    return `${instructionId}::${Number.isInteger(version) ? version : 'latest'}`;
}

function getCachedInstructionDetail(instructionId, version) {
    const key = getInstructionCacheKey(instructionId, version);
    return instructionVersionCache.get(key) || null;
}

async function ensureInstructionDetail(instructionId, version) {
    if (!instructionId) return null;
    const key = getInstructionCacheKey(instructionId, version);
    if (instructionVersionCache.has(key)) {
        return instructionVersionCache.get(key);
    }

    const baseInstruction = instructionLookupById.get(instructionId);
    const latestKey = getInstructionCacheKey(instructionId, null);

    if (!Number.isInteger(version) || (baseInstruction && baseInstruction.version === version)) {
        if (baseInstruction) {
            instructionVersionCache.set(key, baseInstruction);
            instructionVersionCache.set(latestKey, baseInstruction);
        }
        return baseInstruction || null;
    }

    try {
        const res = await fetch(`/api/instructions/${encodeURIComponent(instructionId)}/versions/${version}`);
        if (!res.ok) throw new Error('ไม่พบ instruction ตามเวอร์ชันที่ขอ');
        const data = await res.json();
        if (data.success && data.instruction) {
            instructionVersionCache.set(key, data.instruction);
            return data.instruction;
        }
    } catch (error) {
        console.error('ensureInstructionDetail error:', error);
    }

    if (baseInstruction) {
        instructionVersionCache.set(key, baseInstruction);
        return baseInstruction;
    }
    return null;
}

async function loadAvailableInstructions() {
    try {
        const res = await fetch('/api/instructions');
        if (!res.ok) throw new Error('ไม่สามารถดึงรายการ instructions ได้');
        const data = await res.json();
        availableInstructionList = Array.isArray(data.instructions) ? data.instructions : [];

        instructionLookupById = new Map();
        instructionLookupByObjectId = new Map();
        instructionVersionCache = new Map();

        availableInstructionList.forEach(instr => {
            if (!instr || !instr.instructionId) return;
            instructionLookupById.set(instr.instructionId, instr);
            if (instr._id) {
                instructionLookupByObjectId.set(String(instr._id), instr);
            }
            const latestKey = getInstructionCacheKey(instr.instructionId, null);
            const versionKey = getInstructionCacheKey(instr.instructionId, instr.version);
            instructionVersionCache.set(latestKey, instr);
            instructionVersionCache.set(versionKey, instr);
        });
    } catch (error) {
        console.error('Error loading instructions list:', error);
        availableInstructionList = [];
        instructionLookupById.clear();
        instructionLookupByObjectId.clear();
        instructionVersionCache = new Map();
    }
}

function filterInstructionList() {
    if (!instructionSearchKeyword) return availableInstructionList;
    const keyword = instructionSearchKeyword.toLowerCase();
    return availableInstructionList.filter(instr => {
        const title = (instr?.title || '').toLowerCase();
        const content = (instr?.content || '').toLowerCase();
        return title.includes(keyword) || content.includes(keyword);
    });
}

function extractVersionEntries(instruction) {
    const map = new Map();
    if (instruction && Number.isInteger(instruction.version)) {
        map.set(instruction.version, {
            version: instruction.version,
            updatedAt: instruction.updatedAt || null
        });
    }
    const history = Array.isArray(instruction?.versionHistory) ? instruction.versionHistory : [];
    history.forEach(item => {
        if (!item || !Number.isInteger(item.version)) return;
        if (!map.has(item.version)) {
            map.set(item.version, {
                version: item.version,
                updatedAt: item.updatedAt || item.snapshotAt || null
            });
        }
    });
    return Array.from(map.values()).sort((a, b) => b.version - a.version);
}

function buildVersionButtons(instruction, selectedVersion) {
    const versions = extractVersionEntries(instruction);
    if (versions.length === 0) return '';
    return `
        <div class="mt-2">
            <div class="text-muted small mb-1">เวอร์ชันที่มี:</div>
            <div class="d-flex flex-wrap gap-2">
                ${versions.map(item => `
                    <button type="button"
                        class="btn btn-sm ${selectedVersion === item.version ? 'btn-success' : 'btn-outline-secondary'}"
                        data-instruction-action="select-version"
                        data-instruction-id="${instruction.instructionId}"
                        data-version="${item.version}"
                        title="อัปเดตล่าสุด: ${formatInstructionTimestamp(item.updatedAt)}">
                        v${item.version}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

function renderInstructionInventory() {
    const container = document.getElementById('instructionInventory');
    if (!container) return;

    if (!Array.isArray(availableInstructionList) || availableInstructionList.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info mb-0">
                <i class="fas fa-info-circle me-2"></i>ยังไม่มี instructions ในระบบ
            </div>
        `;
        return;
    }

    const filtered = filterInstructionList();
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning mb-0">
                <i class="fas fa-search me-2"></i>ไม่พบ instruction ที่ตรงกับคำค้นหา
            </div>
        `;
        return;
    }

    const html = filtered.map(instr => {
        const title = instr.title ? escapeHtml(instr.title) : 'ไม่มีชื่อ';
        const preview = instr.preview ? escapeHtml(instr.preview) : 'ไม่มีเนื้อหา';
        const selectedEntry = currentBotInstructions.find(item => item.instructionId === instr.instructionId);
        const selectedVersion = selectedEntry ? (Number.isInteger(selectedEntry.version) ? selectedEntry.version : instr.version) : null;
        const isSelected = Boolean(selectedEntry);
        const versionBadge = `v${selectedVersion ?? instr.version}`;
        const updatedText = formatInstructionTimestamp(instr.updatedAt);
        const selectButtonLabel = isSelected ? 'เลือกแล้ว' : 'เลือก';
        const selectButtonClass = isSelected ? 'btn-success' : 'btn-outline-primary';

        return `
            <div class="card mb-3 instruction-card" data-instruction-id="${instr.instructionId}">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <h6 class="mb-0">${title}</h6>
                                <span class="badge bg-info text-dark">เวอร์ชันล่าสุด v${instr.version}</span>
                                <span class="badge bg-light text-dark">${instr.type === 'table' ? 'ตาราง' : 'ข้อความ'}</span>
                            </div>
                            <div class="text-muted small mb-2">อัปเดตล่าสุด: ${updatedText}</div>
                            <div class="text-muted small">${preview}</div>
                            ${buildVersionButtons(instr, selectedVersion)}
                        </div>
                        <div class="text-end">
                            <button type="button"
                                class="btn btn-sm ${selectButtonClass} mb-2"
                                data-instruction-action="select-version"
                                data-instruction-id="${instr.instructionId}"
                                data-version="${instr.version}">
                                <i class="fas fa-check me-1"></i>${selectButtonLabel}
                            </button>
                            ${isSelected ? `
                                <div>
                                    <button type="button"
                                        class="btn btn-sm btn-outline-danger"
                                        data-instruction-action="remove-selection"
                                        data-instruction-id="${instr.instructionId}">
                                        <i class="fas fa-times me-1"></i>เอาออก
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function sortInstructionSelections() {
    currentBotInstructions.sort((a, b) => {
        const left = instructionLookupById.get(a.instructionId);
        const right = instructionLookupById.get(b.instructionId);
        const leftTitle = (left?.title || '').toLowerCase();
        const rightTitle = (right?.title || '').toLowerCase();
        if (leftTitle === rightTitle) {
            const verA = Number.isInteger(a.version) ? a.version : (left?.version || 0);
            const verB = Number.isInteger(b.version) ? b.version : (right?.version || 0);
            return verB - verA;
        }
        return leftTitle.localeCompare(rightTitle, 'th');
    });
}

function renderSelectedInstructions() {
    const container = document.getElementById('selectedInstructionList');
    if (!container) return;

    if (!Array.isArray(currentBotInstructions) || currentBotInstructions.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning mb-0">
                <i class="fas fa-exclamation-triangle me-2"></i>ยังไม่ได้เลือก instruction ใด
            </div>
        `;
        return;
    }

    let requiresRefresh = false;
    const html = currentBotInstructions.map(selection => {
        const detail = getCachedInstructionDetail(selection.instructionId, selection.version);
        if (!detail) {
            requiresRefresh = true;
            ensureInstructionDetail(selection.instructionId, selection.version).then(() => {
                renderSelectedInstructions();
                refreshInstructionAssetUsage().catch(err => console.error('refreshInstructionAssetUsage error:', err));
            });
            return `
                <div class="card mb-2">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <strong>กำลังโหลด...</strong>
                                <div class="text-muted small">instructionId: ${escapeHtml(selection.instructionId)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        const title = detail.title ? escapeHtml(detail.title) : 'ไม่มีชื่อ';
        const versionLabel = Number.isInteger(selection.version) ? `v${selection.version}` : `v${detail.version || 1}`;
        const updatedText = formatInstructionTimestamp(detail.updatedAt);
        const typeLabel = detail.type === 'table' ? 'ตาราง' : 'ข้อความ';
        const preview = detail.type === 'table'
            ? `ตาราง ${detail?.data?.rows ? detail.data.rows.length : 0} แถว`
            : escapeHtml((detail.content || '').slice(0, 160));

        return `
            <div class="card mb-2 border-success bg-light">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start gap-3">
                        <div>
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <i class="fas fa-check-circle text-success"></i>
                                <strong>${title}</strong>
                                <span class="badge bg-success">${versionLabel}</span>
                                <span class="badge bg-light text-dark">${typeLabel}</span>
                            </div>
                            <div class="text-muted small mb-1">อัปเดตล่าสุด: ${updatedText}</div>
                            <div class="text-muted small">${preview || 'ไม่มีเนื้อหา'}</div>
                        </div>
                        <div>
                            <button type="button"
                                class="btn btn-sm btn-outline-danger"
                                data-selection-action="remove-selection"
                                data-instruction-id="${selection.instructionId}">
                                <i class="fas fa-times me-1"></i>นำออก
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    if (!requiresRefresh) {
        refreshInstructionAssetUsage().catch(err => console.error('refreshInstructionAssetUsage error:', err));
    }
}

function renderLegacyInstructionNotice() {
    const container = document.getElementById('legacyInstructionNotice');
    if (!container) return;

    const hasConverted = Array.isArray(legacyConversionSummary.converted) && legacyConversionSummary.converted.length > 0;
    const hasWarnings = Array.isArray(legacyConversionSummary.warnings) && legacyConversionSummary.warnings.length > 0;
    const hasPending = Array.isArray(pendingLegacySelections) && pendingLegacySelections.length > 0;

    if (!hasConverted && !hasWarnings && !hasPending) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    if (hasConverted) {
        html += `
            <div class="alert alert-success">
                <div class="fw-bold mb-1"><i class="fas fa-check me-2"></i>แปลงคลังเก่าเป็นรูปแบบใหม่แล้ว</div>
                <ul class="mb-0 small">
                    ${legacyConversionSummary.converted.map(item => `
                        <li>${escapeHtml(item.name || item.date)} (${item.count} รายการ)</li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    if (hasWarnings || hasPending) {
        html += `
            <div class="alert alert-warning">
                <div class="fw-bold mb-1"><i class="fas fa-exclamation-triangle me-2"></i>ยังมีคลังหรือรายการที่ต้องตรวจสอบ</div>
                <ul class="mb-0 small">
                    ${legacyConversionSummary.warnings.map(text => `<li>${escapeHtml(text)}</li>`).join('')}
                    ${hasPending ? pendingLegacySelections.map(date => `<li>ยังคงใช้ข้อมูลจากคลังวันที่ ${escapeHtml(date)} (ยังไม่ได้แปลง)</li>`).join('') : ''}
                </ul>
            </div>
        `;
    }

    container.innerHTML = html;
}

function upsertInstructionSelection(instructionId, version) {
    if (!instructionId) return;
    const normalizedVersion = Number.isInteger(version) ? version : null;
    currentBotInstructions = currentBotInstructions.filter(item => item.instructionId !== instructionId);
    currentBotInstructions.push({ instructionId, version: normalizedVersion });
    sortInstructionSelections();
}

async function selectInstructionVersion(instructionId, version) {
    const detail = await ensureInstructionDetail(instructionId, version);
    if (!detail) {
        showAlert('ไม่พบข้อมูล instruction ที่ต้องการ', 'danger');
        return;
    }
    const selectedVersion = Number.isInteger(version) ? version : detail.version || 1;
    upsertInstructionSelection(instructionId, selectedVersion);
    renderSelectedInstructions();
    renderInstructionInventory();
}

function removeInstructionSelection(instructionId) {
    if (!instructionId) return;
    currentBotInstructions = currentBotInstructions.filter(item => item.instructionId !== instructionId);
    renderSelectedInstructions();
    renderInstructionInventory();
}

function mapLibraryInstructionToSelection(libraryInstruction) {
    if (!libraryInstruction) return null;
    const viaId = libraryInstruction.instructionId;
    if (viaId && instructionLookupById.has(viaId)) {
        const base = instructionLookupById.get(viaId);
        const versionCandidates = extractVersionEntries(base).map(item => item.version);
        const desiredVersion = Number.isInteger(libraryInstruction.version) && versionCandidates.includes(libraryInstruction.version)
            ? libraryInstruction.version
            : base.version;
        return { instructionId: viaId, version: desiredVersion };
    }

    const rawObjectId = libraryInstruction._id || libraryInstruction.id;
    if (rawObjectId && instructionLookupByObjectId.has(String(rawObjectId))) {
        const candidate = instructionLookupByObjectId.get(String(rawObjectId));
        return { instructionId: candidate.instructionId, version: candidate.version };
    }

    return null;
}

async function convertLegacySelectionsIfNeeded() {
    legacyConversionSummary = { converted: [], warnings: [] };
    if (!Array.isArray(pendingLegacySelections) || pendingLegacySelections.length === 0) {
        renderLegacyInstructionNotice();
        return;
    }

    const remaining = [];
    for (const date of pendingLegacySelections) {
        const detail = await fetchInstructionLibraryDetails(date);
        if (!detail) {
            legacyConversionSummary.warnings.push(`ไม่พบคลัง instruction วันที่ ${date}`);
            remaining.push(date);
            continue;
        }

        const instructions = Array.isArray(detail.instructions) ? detail.instructions : [];
        let converted = 0;
        instructions.forEach(item => {
            const selection = mapLibraryInstructionToSelection(item);
            if (selection) {
                converted += 1;
                upsertInstructionSelection(selection.instructionId, selection.version);
            } else {
                const name = detail.name || detail.displayDate || detail.date;
                const title = item?.title || 'ไม่มีชื่อ';
                legacyConversionSummary.warnings.push(`ไม่สามารถแปลง "${title}" จากคลัง ${name}`);
            }
        });

        if (converted > 0) {
            legacyConversionSummary.converted.push({
                date: detail.date,
                name: detail.name || detail.displayDate || detail.date,
                count: converted
            });
        } else {
            remaining.push(detail.date);
        }
    }

    pendingLegacySelections = remaining;
    sortInstructionSelections();
    renderLegacyInstructionNotice();
}

function handleInstructionInventoryClick(event) {
    const target = event.target.closest('[data-instruction-action]');
    if (!target) return;
    const instructionId = target.dataset.instructionId;
    if (!instructionId) return;
    const action = target.dataset.instructionAction;
    if (action === 'select-version') {
        const version = Number.parseInt(target.dataset.version, 10);
        selectInstructionVersion(instructionId, Number.isNaN(version) ? null : version);
    } else if (action === 'remove-selection') {
        removeInstructionSelection(instructionId);
    }
}

function handleSelectedInstructionClick(event) {
    const target = event.target.closest('[data-selection-action]');
    if (!target) return;
    if (target.dataset.selectionAction === 'remove-selection') {
        removeInstructionSelection(target.dataset.instructionId);
    }
}

function bindInstructionModalEvents() {
    if (instructionModalInitialized) return;
    instructionModalInitialized = true;

    const searchInput = document.getElementById('instructionSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', event => {
            instructionSearchKeyword = event.target.value.trim().toLowerCase();
            renderInstructionInventory();
        });
    }

    const inventory = document.getElementById('instructionInventory');
    if (inventory) {
        inventory.addEventListener('click', handleInstructionInventoryClick);
    }

    const selectedList = document.getElementById('selectedInstructionList');
    if (selectedList) {
        selectedList.addEventListener('click', handleSelectedInstructionClick);
    }
}

async function updateInstructionImageUsage() {
    const labels = new Set();
    if (Array.isArray(currentBotInstructions) && currentBotInstructions.length > 0) {
        const detailPromises = currentBotInstructions.map(sel => ensureInstructionDetail(sel.instructionId, sel.version));
        const details = await Promise.all(detailPromises);
        details.filter(Boolean).forEach(detail => {
            collectImageLabelsFromValue(detail.content, labels);
            collectImageLabelsFromValue(detail.data, labels);
        });
    }
    instructionImageLabelsInUse = labels;
}

async function refreshInstructionAssetUsage() {
    await updateInstructionImageUsage();
    renderInstructionAssets(instructionAssetsCache, instructionImageLabelsInUse);
}

async function manageInstructions(botId) {
    currentBotType = 'line';
    currentBotId = botId;
    currentBotInstructions = [];
    pendingLegacySelections = [];
    instructionLibraryDetailsCache.clear();
    instructionImageLabelsInUse = new Set();
    instructionVersionCache = new Map();
    instructionSearchKeyword = '';

    try {
        const botResponse = await fetch(`/api/line-bots/${botId}`);
        if (botResponse.ok) {
            const bot = await botResponse.json();
            const { objectSelections, legacyKeys } = normalizeSelectionList(bot.selectedInstructions || []);
            currentBotInstructions = objectSelections;
            pendingLegacySelections = legacyKeys;
        }

        await loadAvailableInstructions();
        await convertLegacySelectionsIfNeeded();
        renderSelectedInstructions();
        renderInstructionInventory();
        renderLegacyInstructionNotice();

        const searchInput = document.getElementById('instructionSearchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        await loadInstructionAssets();
        const uploadBtn = document.getElementById('uploadInstructionAssetBtn');
        if (uploadBtn) {
            uploadBtn.onclick = uploadInstructionAsset;
        }

        bindInstructionModalEvents();

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

async function manageFacebookInstructions(botId) {
    currentBotType = 'facebook';
    currentBotId = botId;
    currentBotInstructions = [];
    pendingLegacySelections = [];
    instructionLibraryDetailsCache.clear();
    instructionImageLabelsInUse = new Set();
    instructionVersionCache = new Map();
    instructionSearchKeyword = '';

    try {
        const botResponse = await fetch(`/api/facebook-bots/${botId}`);
        if (botResponse.ok) {
            const bot = await botResponse.json();
            const { objectSelections, legacyKeys } = normalizeSelectionList(bot.selectedInstructions || []);
            currentBotInstructions = objectSelections;
            pendingLegacySelections = legacyKeys;
        }

        await loadAvailableInstructions();
        await convertLegacySelectionsIfNeeded();
        renderSelectedInstructions();
        renderInstructionInventory();
        renderLegacyInstructionNotice();

        const searchInput = document.getElementById('instructionSearchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        await loadInstructionAssets();
        const uploadBtn = document.getElementById('uploadInstructionAssetBtn');
        if (uploadBtn) {
            uploadBtn.onclick = uploadInstructionAsset;
        }

        bindInstructionModalEvents();

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

async function saveSelectedInstructions() {
    if (!currentBotId || !currentBotType) {
        showAlert('ไม่พบ Bot ID', 'danger');
        return;
    }

    try {
        const url = currentBotType === 'facebook'
            ? `/api/facebook-bots/${currentBotId}/instructions`
            : `/api/line-bots/${currentBotId}/instructions`;

        const payloadSelections = currentBotInstructions.map(item => ({
            instructionId: item.instructionId,
            version: Number.isInteger(item.version) ? item.version : null
        }));

        if (Array.isArray(pendingLegacySelections) && pendingLegacySelections.length > 0) {
            payloadSelections.push(...pendingLegacySelections);
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                selectedInstructions: payloadSelections
            })
        });

        if (response.ok) {
            showAlert('บันทึกการเลือกใช้ instructions เรียบร้อยแล้ว', 'success');

            if (currentBotType === 'facebook') {
                await loadFacebookBotSettings();
            } else {
                await loadLineBotSettings();
            }

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
        const lineBotResponse = await fetch('/api/line-bots');
        if (lineBotResponse.ok) {
            const lineBots = await lineBotResponse.json();
            displayLineBotOverview(lineBots);
        }

        const facebookBotResponse = await fetch('/api/facebook-bots');
        if (facebookBotResponse.ok) {
            const facebookBots = await facebookBotResponse.json();
            displayFacebookBotOverview(facebookBots);
        }

        displayAiModelOverview();

        const instructionsResponse = await fetch('/api/instructions');
        if (instructionsResponse.ok) {
            const result = await instructionsResponse.json();
            displayInstructionsOverview(result.instructions || []);
        }

        displaySecurityOverview();
    } catch (error) {
        console.error('Error loading overview data:', error);
    }
}

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

function displayFacebookBotOverview(facebookBots) {
    const container = document.getElementById('facebookBotOverview');
    if (!container) {
        console.log('Facebook Bot Overview container not found');
        return;
    }

    const total = facebookBots.length;
    const active = facebookBots.filter(bot => bot.status === 'active').length;

    if (total === 0) {
        container.innerHTML = '<p class="text-muted mb-0">ยังไม่มี Facebook Bot</p>';
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

function displayInstructionsOverview(instructions) {
    const container = document.getElementById('instructionsOverview');
    if (!container) {
        console.log('Instructions Overview container not found');
        return;
    }
    
    const total = Array.isArray(instructions) ? instructions.length : 0;
    
    if (total === 0) {
        container.innerHTML = '<p class="text-muted mb-0">ยังไม่มี Instructions</p>';
        return;
    }

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <h4 class="mb-0">${total}</h4>
                <small>Instructions ทั้งหมด</small>
            </div>
            <div class="text-end">
                <h6 class="mb-0 text-info">พร้อมใช้งาน</h6>
                <small>เลือกใช้เป็นรายรายการ</small>
            </div>
        </div>
    `;
    
    const instructionsCountElement = document.getElementById('instructionsCount');
    if (instructionsCountElement) {
        instructionsCountElement.textContent = total;
    }
}

async function loadInstructionAssets() {
    try {
        const listEl = document.getElementById('instructionAssetsList');
        if (!listEl) return;
        listEl.innerHTML = '<div class="text-muted">กำลังโหลด...</div>';
        const res = await fetch('/admin/instructions/assets');
        if (!res.ok) throw new Error('ไม่สามารถดึงรายการรูปภาพได้');
        const data = await res.json();
        instructionAssetsCache = Array.isArray(data.assets) ? data.assets : [];
        await refreshInstructionAssetUsage();
    } catch (err) {
        console.error('loadInstructionAssets error:', err);
        if (window.adminSettings?.showAlert) window.adminSettings.showAlert('โหลดรายการรูปภาพไม่สำเร็จ', 'danger');
        renderInstructionAssets(instructionAssetsCache, instructionImageLabelsInUse);
    }
}

function createInstructionAssetCard(asset, { isActive = false } = {}) {
    if (!asset) return '';
    const label = asset.label || asset.fileName || 'unknown';
    const sizeKb = asset.size ? Math.round(Number(asset.size) / 1024) : 0;
    const description = asset.description || asset.alt || '';
    const badge = isActive
        ? '<span class="badge bg-success-soft text-success ms-2"><i class="fas fa-check me-1"></i>ใช้งานอยู่</span>'
        : '';
    const safeLabelArg = escapeHtml(JSON.stringify(label));
    return `
        <div class="col-12">
            <div class="card p-2 d-flex flex-row align-items-center ${isActive ? 'border border-success' : ''}">
                <img src="${asset.thumbUrl || asset.url}" class="rounded me-3" style="width:64px;height:64px;object-fit:cover;" alt="${escapeHtml(asset.alt || label)}">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center">
                        <strong>${escapeHtml(label)}</strong>
                        ${badge}
                    </div>
                    <div class="text-muted small">${sizeKb} KB</div>
                    <div class="text-muted small">${escapeHtml(description)}</div>
                    <div class="text-muted small">token: <code>#[IMAGE:${escapeHtml(label)}]</code></div>
                </div>
                <div class="ms-2 d-flex gap-2">
                    <button class="btn btn-sm btn-outline-secondary" onclick='instructionsManagement.copyImageToken(${safeLabelArg})'><i class="fas fa-copy me-1"></i>คัดลอก</button>
                    <button class="btn btn-sm btn-outline-danger" onclick='instructionsManagement.deleteInstructionAsset(${safeLabelArg})'><i class="fas fa-trash me-1"></i>ลบ</button>
                </div>
            </div>
        </div>
    `;
}

function renderInstructionAssets(assets, activeLabels = new Set()) {
    const listEl = document.getElementById('instructionAssetsList');
    if (!listEl) return;
    if (!Array.isArray(assets) || assets.length === 0) {
        listEl.innerHTML = '<div class="text-muted">ยังไม่มีรูปภาพ</div>';
        return;
    }
    const activeSet = new Set();
    if (activeLabels instanceof Set) {
        activeLabels.forEach(label => {
            if (label) activeSet.add(label);
        });
    }

    const activeAssets = assets.filter(asset => asset && activeSet.has(asset.label));
    const otherAssets = assets.filter(asset => !activeSet.has(asset?.label));

    const sections = [];
    if (activeAssets.length > 0) {
        sections.push(`
            <div class="col-12">
                <div class="text-muted text-uppercase small fw-bold mb-2">
                    <i class="fas fa-star text-warning me-1"></i>รูปภาพที่ใช้ในเพจนี้ (${activeAssets.length})
                </div>
            </div>
        `);
        sections.push(activeAssets.map(asset => createInstructionAssetCard(asset, { isActive: true })).join(''));
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
        sections.push(otherAssets.map(asset => createInstructionAssetCard(asset, { isActive: false })).join(''));
    }

    listEl.innerHTML = sections.join('');
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
        fileEl.value = '';
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
        window.prompt('คัดลอกโทเคนด้วยตนเอง:', token);
    });
}

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

window.instructionsManagement = {
    manageInstructions,
    manageFacebookInstructions,
    saveSelectedInstructions,
    loadOverviewData,
    displayLineBotOverview,
    displayFacebookBotOverview,
    displayAiModelOverview,
    displayInstructionsOverview,
    displaySecurityOverview,
    loadInstructionAssets,
    uploadInstructionAsset,
    deleteInstructionAsset,
    copyImageToken
};
