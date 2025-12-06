/**
 * Admin API Usage Page JavaScript
 * Enhanced statistics dashboard with tabs and drill-down
 */

var usageData = null;
var drilldownModal = null;

document.addEventListener('DOMContentLoaded', function () {
    drilldownModal = new bootstrap.Modal(document.getElementById('drilldownModal'));

    // Load initial data
    loadOverviewTab();

    // Tab change listeners
    document.querySelectorAll('#usageTabs button[data-bs-toggle="tab"]').forEach(function (tab) {
        tab.addEventListener('shown.bs.tab', function (e) {
            var target = e.target.getAttribute('data-bs-target');
            if (target === '#overview') loadOverviewTab();
            else if (target === '#bots') loadBotsTab();
            else if (target === '#models') loadModelsTab();
            else if (target === '#keys') loadKeysTab();
            else if (target === '#logs') loadDetailedLogs();
        });
    });

    // Date range change
    document.getElementById('dateRangeSelect').addEventListener('change', refreshCurrentTab);
});

function getDateParams() {
    var range = document.getElementById('dateRangeSelect').value;
    var now = new Date();
    var startDate = null;

    if (range === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '7days') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
    } else if (range === '30days') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
    }

    var params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate.toISOString());
    params.append('endDate', now.toISOString());
    return params;
}

function refreshCurrentTab() {
    var activeTab = document.querySelector('#usageTabs .nav-link.active');
    if (!activeTab) return;
    var target = activeTab.getAttribute('data-bs-target');
    if (target === '#overview') loadOverviewTab();
    else if (target === '#bots') loadBotsTab();
    else if (target === '#models') loadModelsTab();
    else if (target === '#keys') loadKeysTab();
    else if (target === '#logs') loadDetailedLogs();
}

// =============== TAB 1: Overview ===============
async function loadOverviewTab() {
    try {
        var response = await fetch('/api/openai-usage/summary?' + getDateParams());
        var data = await response.json();
        usageData = data;

        // Summary cards
        document.getElementById('totalCalls').textContent = formatNumber(data.totalCalls || 0);
        document.getElementById('totalTokens').textContent = formatNumber(data.totalTokens || 0);
        document.getElementById('totalCostUSD').textContent = '$' + formatCost(data.totalCostUSD || 0);
        document.getElementById('totalCostTHB').textContent = '฿' + formatCost(data.totalCostTHB || 0);

        // Top bots
        renderSimpleTable('overviewBotTable', (data.byBot || []).slice(0, 5), function (item) {
            return '<tr><td>' + escapeHtml(item.botName || item.botId || '-') + '</td>' +
                '<td class="text-end">' + formatNumber(item.count) + '</td>' +
                '<td class="text-end">$' + formatCost(item.estimatedCost) + '</td></tr>';
        });

        // Top models
        renderSimpleTable('overviewModelTable', (data.byModel || []).slice(0, 5), function (item) {
            return '<tr><td><span class="model-badge">' + escapeHtml(item.model) + '</span></td>' +
                '<td class="text-end">' + formatNumber(item.count) + '</td>' +
                '<td class="text-end">$' + formatCost(item.estimatedCost) + '</td></tr>';
        });

        // Daily usage
        var byDay = (data.byDay || []).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        renderSimpleTable('overviewDayTable', byDay.slice(0, 14), function (item) {
            return '<tr><td>' + formatDate(item.date) + '</td>' +
                '<td class="text-end">' + formatNumber(item.count) + '</td>' +
                '<td class="text-end">' + formatNumber(item.totalTokens) + '</td>' +
                '<td class="text-end">$' + formatCost(item.estimatedCost) + '</td></tr>';
        });

    } catch (err) {
        console.error('Error loading overview:', err);
    }
}

// =============== TAB 2: Bots ===============
async function loadBotsTab() {
    try {
        var response = await fetch('/api/openai-usage/summary?' + getDateParams());
        var data = await response.json();

        var tbody = document.getElementById('botsTable');
        var items = data.byBot || [];

        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">ไม่มีข้อมูล</td></tr>';
            return;
        }

        var html = '';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            html += '<tr class="cursor-pointer" onclick="showBotDrilldown(\'' + (item.botId || '') + '\', \'' + escapeHtml(item.botName || item.botId || '-') + '\')">' +
                '<td><i class="fab fa-' + (item.platform || 'robot') + ' me-2"></i>' + escapeHtml(item.botName || item.botId || '-') + '</td>' +
                '<td><span class="platform-badge ' + (item.platform || '') + '">' + (item.platform || '-') + '</span></td>' +
                '<td class="text-end">' + formatNumber(item.count) + '</td>' +
                '<td class="text-end">' + formatNumber(item.totalTokens) + '</td>' +
                '<td class="text-end">$' + formatCost(item.estimatedCost) + '</td></tr>';
        }
        tbody.innerHTML = html;

    } catch (err) {
        console.error('Error loading bots tab:', err);
    }
}

async function showBotDrilldown(botId, botName) {
    document.getElementById('drilldownTitle').textContent = 'รายละเอียด: ' + botName;
    document.getElementById('drilldownContent').innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i></div>';
    drilldownModal.show();

    try {
        var response = await fetch('/api/openai-usage/by-bot/' + encodeURIComponent(botId) + '?' + getDateParams());
        var data = await response.json();

        var html = '<div class="row g-3 mb-4">' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Calls</div><div class="summary-value">' + formatNumber(data.totals.totalCalls) + '</div></div></div></div>' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Tokens</div><div class="summary-value">' + formatNumber(data.totals.totalTokens) + '</div></div></div></div>' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Cost</div><div class="summary-value">$' + formatCost(data.totals.totalCost) + '</div></div></div></div>' +
            '</div>';

        html += '<div class="row g-4">';

        // Models used
        html += '<div class="col-md-6"><div class="card"><div class="card-header"><strong>โมเดลที่ใช้</strong></div><div class="card-body p-0"><table class="table table-sm mb-0"><thead><tr><th>Model</th><th class="text-end">Calls</th><th class="text-end">Tokens</th><th class="text-end">Cost</th></tr></thead><tbody>';
        (data.byModel || []).forEach(function (m) {
            html += '<tr><td><span class="model-badge">' + escapeHtml(m.model) + '</span></td><td class="text-end">' + formatNumber(m.count) + '</td><td class="text-end">' + formatNumber(m.totalTokens) + '</td><td class="text-end">$' + formatCost(m.estimatedCost) + '</td></tr>';
        });
        html += '</tbody></table></div></div></div>';

        // API Keys used
        html += '<div class="col-md-6"><div class="card"><div class="card-header"><strong>API Key ที่ใช้</strong></div><div class="card-body p-0"><table class="table table-sm mb-0"><thead><tr><th>Key</th><th class="text-end">Calls</th><th class="text-end">Cost</th></tr></thead><tbody>';
        (data.byKey || []).forEach(function (k) {
            html += '<tr><td><i class="fas fa-key text-muted me-1"></i>' + escapeHtml(k.keyName) + '</td><td class="text-end">' + formatNumber(k.count) + '</td><td class="text-end">$' + formatCost(k.estimatedCost) + '</td></tr>';
        });
        html += '</tbody></table></div></div></div>';

        // Recent logs
        html += '<div class="col-12"><div class="card"><div class="card-header"><strong>บันทึกล่าสุด</strong></div><div class="card-body p-0"><table class="table table-sm mb-0"><thead><tr><th>เวลา</th><th>Model</th><th class="text-end">Tokens</th><th class="text-end">Cost</th></tr></thead><tbody>';
        (data.recentLogs || []).forEach(function (l) {
            html += '<tr><td>' + formatDateTime(l.timestamp) + '</td><td><span class="model-badge">' + escapeHtml(l.model) + '</span></td><td class="text-end">' + formatNumber(l.totalTokens) + '</td><td class="text-end">$' + formatCost(l.estimatedCost) + '</td></tr>';
        });
        html += '</tbody></table></div></div></div>';

        html += '</div>';

        document.getElementById('drilldownContent').innerHTML = html;

    } catch (err) {
        document.getElementById('drilldownContent').innerHTML = '<div class="alert alert-danger">ไม่สามารถโหลดข้อมูลได้</div>';
    }
}

// =============== TAB 3: Models ===============
async function loadModelsTab() {
    try {
        var response = await fetch('/api/openai-usage/summary?' + getDateParams());
        var data = await response.json();

        var tbody = document.getElementById('modelsTable');
        var items = data.byModel || [];

        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีข้อมูล</td></tr>';
            return;
        }

        var html = '';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            html += '<tr class="cursor-pointer" onclick="showModelDrilldown(\'' + escapeHtml(item.model) + '\')">' +
                '<td><span class="model-badge">' + escapeHtml(item.model) + '</span></td>' +
                '<td class="text-end">' + formatNumber(item.count) + '</td>' +
                '<td class="text-end">' + formatNumber(item.totalTokens) + '</td>' +
                '<td class="text-end">$' + formatCost(item.estimatedCost) + '</td></tr>';
        }
        tbody.innerHTML = html;

    } catch (err) {
        console.error('Error loading models tab:', err);
    }
}

async function showModelDrilldown(model) {
    document.getElementById('drilldownTitle').textContent = 'รายละเอียด Model: ' + model;
    document.getElementById('drilldownContent').innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i></div>';
    drilldownModal.show();

    try {
        var response = await fetch('/api/openai-usage/by-model/' + encodeURIComponent(model) + '?' + getDateParams());
        var data = await response.json();

        var html = '<div class="row g-3 mb-4">' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Calls</div><div class="summary-value">' + formatNumber(data.totals.totalCalls) + '</div></div></div></div>' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Tokens</div><div class="summary-value">' + formatNumber(data.totals.totalTokens) + '</div></div></div></div>' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Cost</div><div class="summary-value">$' + formatCost(data.totals.totalCost) + '</div></div></div></div>' +
            '</div>';

        // Bots using this model
        html += '<div class="card"><div class="card-header"><strong>Bot/Page ที่ใช้โมเดลนี้</strong></div><div class="card-body p-0"><table class="table table-sm mb-0"><thead><tr><th>Bot</th><th>Platform</th><th class="text-end">Calls</th><th class="text-end">Tokens</th><th class="text-end">Cost</th></tr></thead><tbody>';
        (data.byBot || []).forEach(function (b) {
            html += '<tr><td>' + escapeHtml(b.botName) + '</td><td><span class="platform-badge ' + (b.platform || '') + '">' + (b.platform || '-') + '</span></td><td class="text-end">' + formatNumber(b.count) + '</td><td class="text-end">' + formatNumber(b.totalTokens) + '</td><td class="text-end">$' + formatCost(b.estimatedCost) + '</td></tr>';
        });
        html += '</tbody></table></div></div>';

        document.getElementById('drilldownContent').innerHTML = html;

    } catch (err) {
        document.getElementById('drilldownContent').innerHTML = '<div class="alert alert-danger">ไม่สามารถโหลดข้อมูลได้</div>';
    }
}

// =============== TAB 4: API Keys ===============
async function loadKeysTab() {
    try {
        var response = await fetch('/api/openai-usage/summary?' + getDateParams());
        var data = await response.json();

        var tbody = document.getElementById('keysTable');
        var items = data.byKey || [];

        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีข้อมูล</td></tr>';
            return;
        }

        var html = '';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var keyId = item.keyId || 'env';
            html += '<tr class="cursor-pointer" onclick="showKeyDrilldown(\'' + keyId + '\', \'' + escapeHtml(item.keyName || 'Env Variable') + '\')">' +
                '<td><i class="fas fa-key text-muted me-2"></i>' + escapeHtml(item.keyName || 'Environment Variable') + '</td>' +
                '<td class="text-end">' + formatNumber(item.count) + '</td>' +
                '<td class="text-end">' + formatNumber(item.totalTokens) + '</td>' +
                '<td class="text-end">$' + formatCost(item.estimatedCost) + '</td></tr>';
        }
        tbody.innerHTML = html;

    } catch (err) {
        console.error('Error loading keys tab:', err);
    }
}

async function showKeyDrilldown(keyId, keyName) {
    document.getElementById('drilldownTitle').textContent = 'รายละเอียด API Key: ' + keyName;
    document.getElementById('drilldownContent').innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i></div>';
    drilldownModal.show();

    try {
        var response = await fetch('/api/openai-usage/by-key/' + encodeURIComponent(keyId) + '?' + getDateParams());
        var data = await response.json();

        var html = '<div class="row g-3 mb-4">' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Calls</div><div class="summary-value">' + formatNumber(data.totals.totalCalls) + '</div></div></div></div>' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Tokens</div><div class="summary-value">' + formatNumber(data.totals.totalTokens) + '</div></div></div></div>' +
            '<div class="col-md-4"><div class="summary-card"><div class="summary-content"><div class="summary-label">Cost</div><div class="summary-value">$' + formatCost(data.totals.totalCost) + '</div></div></div></div>' +
            '</div>';

        html += '<div class="row g-4">';

        // Bots using this key
        html += '<div class="col-md-6"><div class="card"><div class="card-header"><strong>Bot/Page ที่ใช้ Key นี้</strong></div><div class="card-body p-0"><table class="table table-sm mb-0"><thead><tr><th>Bot</th><th class="text-end">Calls</th><th class="text-end">Cost</th></tr></thead><tbody>';
        (data.byBot || []).forEach(function (b) {
            html += '<tr><td><i class="fab fa-' + (b.platform || 'robot') + ' me-2"></i>' + escapeHtml(b.botName) + '</td><td class="text-end">' + formatNumber(b.count) + '</td><td class="text-end">$' + formatCost(b.estimatedCost) + '</td></tr>';
        });
        html += '</tbody></table></div></div></div>';

        // Models used with this key
        html += '<div class="col-md-6"><div class="card"><div class="card-header"><strong>Model ที่ใช้กับ Key นี้</strong></div><div class="card-body p-0"><table class="table table-sm mb-0"><thead><tr><th>Model</th><th class="text-end">Calls</th><th class="text-end">Cost</th></tr></thead><tbody>';
        (data.byModel || []).forEach(function (m) {
            html += '<tr><td><span class="model-badge">' + escapeHtml(m.model) + '</span></td><td class="text-end">' + formatNumber(m.count) + '</td><td class="text-end">$' + formatCost(m.estimatedCost) + '</td></tr>';
        });
        html += '</tbody></table></div></div></div>';

        html += '</div>';

        document.getElementById('drilldownContent').innerHTML = html;

    } catch (err) {
        document.getElementById('drilldownContent').innerHTML = '<div class="alert alert-danger">ไม่สามารถโหลดข้อมูลได้</div>';
    }
}

// =============== TAB 5: Detailed Logs ===============
async function loadDetailedLogs() {
    var limit = document.getElementById('logsLimit').value || 50;
    var platform = document.getElementById('filterPlatform').value;
    var botId = document.getElementById('filterBot').value;

    var params = getDateParams();
    params.append('limit', limit);
    if (platform) params.append('platform', platform);
    if (botId) params.append('botId', botId);

    try {
        var response = await fetch('/api/openai-usage?' + params);
        var data = await response.json();

        var tbody = document.getElementById('logsTable');
        var logs = data.logs || [];

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">ไม่มีบันทึก</td></tr>';
            return;
        }

        var html = '';
        for (var i = 0; i < logs.length; i++) {
            var l = logs[i];
            html += '<tr>' +
                '<td>' + formatDateTime(l.timestamp) + '</td>' +
                '<td><span class="model-badge">' + escapeHtml(l.model || '-') + '</span></td>' +
                '<td>' + escapeHtml(l.botId || '-') + '</td>' +
                '<td><span class="platform-badge ' + (l.platform || '') + '">' + (l.platform || '-') + '</span></td>' +
                '<td class="text-end">' + formatNumber(l.promptTokens || 0) + '</td>' +
                '<td class="text-end">' + formatNumber(l.completionTokens || 0) + '</td>' +
                '<td class="text-end">' + formatNumber(l.totalTokens || 0) + '</td>' +
                '<td class="text-end">$' + formatCost(l.estimatedCostUSD || 0) + '</td></tr>';
        }
        tbody.innerHTML = html;

        // Populate filter dropdowns
        populateFilterDropdowns();

    } catch (err) {
        console.error('Error loading logs:', err);
    }
}

async function populateFilterDropdowns() {
    if (!usageData) {
        try {
            var response = await fetch('/api/openai-usage/summary?' + getDateParams());
            usageData = await response.json();
        } catch (e) { return; }
    }

    var botSelect = document.getElementById('filterBot');
    var modelSelect = document.getElementById('filterModel');

    // Clear existing options except first
    while (botSelect.options.length > 1) botSelect.remove(1);
    while (modelSelect.options.length > 1) modelSelect.remove(1);

    // Add bots
    (usageData.byBot || []).forEach(function (b) {
        var opt = document.createElement('option');
        opt.value = b.botId || '';
        opt.textContent = b.botName || b.botId || '-';
        botSelect.appendChild(opt);
    });

    // Add models
    (usageData.byModel || []).forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m.model || '';
        opt.textContent = m.model || '-';
        modelSelect.appendChild(opt);
    });
}

function exportToCSV() {
    if (!usageData) return;

    var csv = 'Date,Calls,Tokens,Cost USD\n';
    (usageData.byDay || []).forEach(function (d) {
        csv += d.date + ',' + d.count + ',' + d.totalTokens + ',' + (d.estimatedCost || 0).toFixed(4) + '\n';
    });

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'api-usage-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
}

// =============== Utilities ===============
function renderSimpleTable(tableId, items, rowRenderer) {
    var tbody = document.getElementById(tableId);
    if (!tbody) return;
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-3">ไม่มีข้อมูล</td></tr>';
        return;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
        html += rowRenderer(items[i]);
    }
    tbody.innerHTML = html;
}

function formatNumber(num) {
    return new Intl.NumberFormat('th-TH').format(num || 0);
}

function formatCost(cost) {
    return (cost || 0).toFixed(4);
}

function formatDate(dateStr) {
    var date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
    var date = new Date(dateStr);
    return date.toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
