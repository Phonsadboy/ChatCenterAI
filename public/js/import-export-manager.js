// public/js/import-export-manager.js

let importFileToken = null;
let existingInstructions = [];
let sheetPreviews = [];
let allInstructionsForExport = [];

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Modal Events
    const importExportModal = document.getElementById('importExportModal');
    if (importExportModal) {
        importExportModal.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;
            if (button) {
                const tab = button.getAttribute('data-tab');
                if (tab) {
                    // Delay slightly to allow modal to show
                    setTimeout(() => switchIETab(tab), 100);
                }
            }
        });

        // Tab click listeners to update footer
        const tabEls = importExportModal.querySelectorAll('button[data-bs-toggle="tab"]');
        tabEls.forEach(el => {
            el.addEventListener('shown.bs.tab', (event) => {
                const targetId = event.target.getAttribute('data-bs-target');
                if (targetId === '#importPanel') updateFooter('import');
                else if (targetId === '#exportPanel') updateFooter('export');
            });
        });
    }

    // Import Events
    const importFileInput = document.getElementById('importFile');
    if (importFileInput) {
        importFileInput.addEventListener('change', handleFileSelect);
    }

    const btnResetImport = document.getElementById('btnResetImport');
    if (btnResetImport) {
        btnResetImport.addEventListener('click', resetImport);
    }

    const btnConfirmImport = document.getElementById('btnConfirmImport');
    if (btnConfirmImport) {
        btnConfirmImport.addEventListener('click', executeImport);
    }

    // Export Events
    const selectAllExport = document.getElementById('selectAllExport');
    if (selectAllExport) {
        selectAllExport.addEventListener('click', toggleSelectAllExport);
    }

    const btnExecuteExport = document.getElementById('btnExecuteExport');
    if (btnExecuteExport) {
        btnExecuteExport.addEventListener('click', executeExport);
    }
});

function switchIETab(tabName) {
    const triggerEl = document.querySelector(`#ieTabs button[data-bs-target="#${tabName}Panel"]`);
    if (triggerEl) {
        const tab = new bootstrap.Tab(triggerEl);
        tab.show();
        updateFooter(tabName);

        if (tabName === 'export') {
            loadExportList();
        }
    }
}

function updateFooter(tabName) {
    const importFooter = document.getElementById('importFooter');
    const exportFooter = document.getElementById('exportFooter');
    
    if (tabName === 'import') {
        if(importFooter) importFooter.classList.remove('d-none');
        if(exportFooter) exportFooter.classList.add('d-none');
    } else {
        if(importFooter) importFooter.classList.add('d-none');
        if(exportFooter) exportFooter.classList.remove('d-none');
        loadExportList(); // Load list when switching to export
    }
}

// ================= IMPORT LOGIC =================

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show Loading
    document.getElementById('importStep1').classList.add('d-none');
    document.getElementById('importLoading').classList.remove('d-none');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/instructions-v2/import/preview-sheets', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            importFileToken = data.fileToken;
            existingInstructions = data.existingInstructions || [];
            sheetPreviews = data.previews;
            renderMappingTable();
            
            document.getElementById('importLoading').classList.add('d-none');
            document.getElementById('importStep2').classList.remove('d-none');
            document.getElementById('btnConfirmImport').classList.remove('d-none');
        } else {
            alert('Error: ' + data.error);
            resetImport();
        }
    } catch (err) {
        console.error(err);
        alert('Error uploading file');
        resetImport();
    }
}

function resetImport() {
    document.getElementById('importFile').value = '';
    document.getElementById('importStep1').classList.remove('d-none');
    document.getElementById('importStep2').classList.add('d-none');
    document.getElementById('importLoading').classList.add('d-none');
    document.getElementById('btnConfirmImport').classList.add('d-none');
    importFileToken = null;
    document.getElementById('sheetMappingTable').innerHTML = '';
}

function renderMappingTable() {
    const tbody = document.getElementById('sheetMappingTable');
    tbody.innerHTML = '';

    sheetPreviews.forEach((sheet, index) => {
        const tr = document.createElement('tr');
        
        // Sheet Name
        tr.innerHTML = `<td>
            <div class="fw-bold text-truncate" style="max-width: 150px;" title="${sheet.sheetName}">${sheet.sheetName}</div>
            <small class="text-muted">${sheet.totalRows} rows</small>
        </td>`;

        // Action
        const actionTd = document.createElement('td');
        const actionSelect = document.createElement('select');
        actionSelect.className = 'form-select form-select-sm action-select';
        actionSelect.dataset.index = index;
        actionSelect.innerHTML = `
            <option value="create">Create New</option>
            <option value="update">Add to Existing</option>
            <option value="ignore">Ignore</option>
        `;
        actionTd.appendChild(actionSelect);
        tr.appendChild(actionTd);

        // Target
        const targetTd = document.createElement('td');
        targetTd.innerHTML = renderTargetInput(index, 'create', sheet.sheetName);
        tr.appendChild(targetTd);

        // Mode
        const modeTd = document.createElement('td');
        modeTd.innerHTML = `<select class="form-select form-select-sm mode-select" disabled>
            <option value="append">Append</option>
            <option value="replace">Replace</option>
        </select>`;
        tr.appendChild(modeTd);

        tbody.appendChild(tr);

        // Event Listener for Action Change
        actionSelect.addEventListener('change', (e) => {
            const action = e.target.value;
            const idx = e.target.dataset.index;
            const row = e.target.closest('tr');
            
            // Update Target Cell
            row.cells[2].innerHTML = renderTargetInput(idx, action, sheet.sheetName);
            
            // Update Mode Cell
            const modeSelect = row.cells[3].querySelector('select');
            modeSelect.disabled = (action !== 'update');
        });
    });
}

function renderTargetInput(index, action, sheetName) {
    if (action === 'create') {
        return `<input type="text" class="form-control form-control-sm target-input" value="${sheetName}" placeholder="Instruction Name">`;
    } else if (action === 'update') {
        let options = '<option value="">-- Select Instruction --</option>';
        // Sort alphabetically
        const sorted = [...existingInstructions].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        // Try to match by name (case insensitive)
        sorted.forEach(inst => {
            const isMatch = (inst.name || '').toLowerCase() === (sheetName || '').toLowerCase();
            const selected = isMatch ? 'selected' : '';
            options += `<option value="${inst._id}" ${selected}>${inst.name || '(No Name)'}</option>`;
        });
        return `<select class="form-select form-select-sm target-select">${options}</select>`;
    } else {
        return '<span class="text-muted">-</span>';
    }
}

async function executeImport() {
    const rows = document.querySelectorAll('#sheetMappingTable tr');
    const mappings = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const action = row.querySelector('.action-select').value;
        const sheetName = sheetPreviews[i].sheetName;
        
        let mapping = { sheetName, action };

        if (action === 'create') {
            const targetName = row.querySelector('.target-input').value;
            if (!targetName) {
                alert(`Please enter a name for sheet "${sheetName}"`);
                return;
            }
            mapping.targetName = targetName;
        } else if (action === 'update') {
            const targetId = row.querySelector('.target-select').value;
            if (!targetId) {
                alert(`Please select a target instruction for sheet "${sheetName}"`);
                return;
            }
            mapping.targetId = targetId;
            mapping.mode = row.querySelector('.mode-select').value;
        }

        mappings.push(mapping);
    }

    // Disable button
    const btn = document.getElementById('btnConfirmImport');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Processing...';

    try {
        const res = await fetch('/api/instructions-v2/import/execute-sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings, fileToken: importFileToken })
        });
        const data = await res.json();

        if (data.success) {
            let msg = 'Import Results:\n';
            data.results.forEach(r => {
                msg += `- ${r.sheetName}: ${r.success ? 'Success' : 'Failed (' + r.error + ')'}\n`;
            });
            alert(msg);
            location.reload();
        } else {
            alert('Error: ' + data.error);
            btn.disabled = false;
            btn.innerHTML = 'ยืนยันการนำเข้า';
        }
    } catch (err) {
        console.error(err);
        alert('Error executing import');
        btn.disabled = false;
        btn.innerHTML = 'ยืนยันการนำเข้า';
    }
}


// ================= EXPORT LOGIC =================

async function loadExportList() {
    const container = document.getElementById('exportList');
    if (!container) return;
    
    if (allInstructionsForExport.length === 0) {
         container.innerHTML = `<div class="text-center py-3 text-muted">
             <div class="spinner-border spinner-border-sm mb-2"></div>
             <div>กำลังโหลดข้อมูล...</div>
         </div>`;
    }

    try {
        const res = await fetch('/api/instructions-v2');
        const data = await res.json();
        
        if (data.success) {
            allInstructionsForExport = data.instructions || [];
            renderExportList();
        } else {
            container.innerHTML = `<div class="text-center text-danger p-3">Error loading instructions</div>`;
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="text-center text-danger p-3">Error loading instructions</div>`;
    }
}

function renderExportList() {
    const container = document.getElementById('exportList');
    container.innerHTML = '';

    if (allInstructionsForExport.length === 0) {
        container.innerHTML = '<div class="text-center p-3">No instructions found.</div>';
        return;
    }

    allInstructionsForExport.forEach(inst => {
        const div = document.createElement('div');
        div.className = 'list-group-item';
        div.innerHTML = `
            <div class="form-check">
                <input class="form-check-input export-checkbox" type="checkbox" value="${inst._id}" id="export_${inst._id}">
                <label class="form-check-label w-100" for="export_${inst._id}">
                    ${inst.name} 
                    <span class="text-muted small ms-2">(${inst.instructionId || 'No ID'})</span>
                </label>
            </div>
        `;
        container.appendChild(div);
    });
}

function toggleSelectAllExport() {
    const checkboxes = document.querySelectorAll('.export-checkbox');
    const allChecked = Array.from(checkboxes).every(c => c.checked);
    
    checkboxes.forEach(c => c.checked = !allChecked);
    
    const btn = document.getElementById('selectAllExport');
    if(btn) {
        btn.innerHTML = !allChecked ? '<i class="fas fa-times me-1"></i>ยกเลิกเลือกทั้งหมด' : '<i class="fas fa-check-double me-1"></i>เลือกทั้งหมด';
    }
}

async function executeExport() {
    const checkboxes = document.querySelectorAll('.export-checkbox:checked');
    const ids = Array.from(checkboxes).map(c => c.value);
    
    if (ids.length === 0) {
        alert('กรุณาเลือก Instruction อย่างน้อย 1 รายการ');
        return;
    }
    
    const btn = document.getElementById('btnExecuteExport');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Exporting...';

    try {
        const res = await fetch('/api/instructions-v2/export-sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instructionIds: ids })
        });
        
        if (res.ok) {
            // Trigger download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `instructions_export_${new Date().toISOString().slice(0,10)}.xlsx`;
            
            const disposition = res.headers.get('Content-Disposition');
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) { 
                    a.download = matches[1].replace(/['"]/g, '');
                }
            }
            
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            const json = await res.json();
            alert('Export Failed: ' + (json.error || 'Unknown error'));
        }
    } catch (err) {
        console.error(err);
        alert('Export Failed');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
