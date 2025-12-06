/**
 * Admin API Usage Page JavaScript
 * Loads and displays OpenAI API usage statistics
 */

document.addEventListener('DOMContentLoaded', function () {
    loadUsageStats();

    // Add event listeners
    document.getElementById('dateRangeSelect').addEventListener('change', loadUsageStats);
    document.getElementById('logsLimitSelect').addEventListener('change', loadRecentLogs);
});

async function loadUsageStats() {
    var dateRange = document.getElementById('dateRangeSelect').value || '7days';

    // Calculate date range
    var dateInfo = getDateRange(dateRange);

    try {
        var params = new URLSearchParams();
        if (dateInfo.startDate) params.append('startDate', dateInfo.startDate.toISOString());
        if (dateInfo.endDate) params.append('endDate', dateInfo.endDate.toISOString());

        var response = await fetch('/api/openai-usage/summary?' + params);
        if (!response.ok) throw new Error('Failed to load usage stats');

        var data = await response.json();

        // Update summary cards
        updateSummaryCards(data);

        // Update tables
        updateModelTable(data.byModel || []);
        updateBotTable(data.byBot || []);
        updateKeyTable(data.byKey || []);
        updateDayTable(data.byDay || []);

        // Load recent logs
        loadRecentLogs();

    } catch (error) {
        console.error('Error loading usage stats:', error);
        showError('ไม่สามารถโหลดสถิติได้');
    }
}

function getDateRange(range) {
    var now = new Date();
    var startDate = null;
    var endDate = now;

    switch (range) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case '7days':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 7);
            break;
        case '30days':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 30);
            break;
        case 'all':
        default:
            startDate = null;
            break;
    }

    return { startDate: startDate, endDate: endDate };
}

function updateSummaryCards(data) {
    document.getElementById('totalCalls').textContent = formatNumber(data.totalCalls || 0);
    document.getElementById('totalTokens').textContent = formatNumber(data.totalTokens || 0);
    document.getElementById('totalCostUSD').textContent = '$' + formatCost(data.totalCostUSD || 0);
    document.getElementById('totalCostTHB').textContent = '฿' + formatCost(data.totalCostTHB || 0);
}

function updateModelTable(data) {
    var tbody = document.getElementById('usageByModelTable');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีข้อมูล</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < data.length; i++) {
        var item = data[i];
        html += '<tr>';
        html += '<td><span class="model-badge">' + escapeHtml(item.model || 'unknown') + '</span></td>';
        html += '<td class="text-end">' + formatNumber(item.count || 0) + '</td>';
        html += '<td class="text-end">' + formatNumber(item.totalTokens || 0) + '</td>';
        html += '<td class="text-end cost-value usd">$' + formatCost(item.estimatedCost || 0) + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

function updateBotTable(data) {
    var tbody = document.getElementById('usageByBotTable');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีข้อมูล</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var platform = item.platform || 'unknown';
        html += '<tr>';
        html += '<td><span class="platform-badge ' + platform + '">';
        html += '<i class="fab fa-' + platform + '"></i> ';
        html += escapeHtml(item.botName || item.botId || 'ไม่ระบุ');
        html += '</span></td>';
        html += '<td class="text-end">' + formatNumber(item.count || 0) + '</td>';
        html += '<td class="text-end">' + formatNumber(item.totalTokens || 0) + '</td>';
        html += '<td class="text-end cost-value usd">$' + formatCost(item.estimatedCost || 0) + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

function updateKeyTable(data) {
    var tbody = document.getElementById('usageByKeyTable');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีข้อมูล</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < data.length; i++) {
        var item = data[i];
        html += '<tr>';
        html += '<td><i class="fas fa-key text-muted me-1"></i>' + escapeHtml(item.keyName || 'Environment Variable') + '</td>';
        html += '<td class="text-end">' + formatNumber(item.count || 0) + '</td>';
        html += '<td class="text-end">' + formatNumber(item.totalTokens || 0) + '</td>';
        html += '<td class="text-end cost-value usd">$' + formatCost(item.estimatedCost || 0) + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

function updateDayTable(data) {
    var tbody = document.getElementById('usageByDayTable');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีข้อมูล</td></tr>';
        return;
    }

    // Sort by date descending
    var sorted = data.slice().sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
    });

    var html = '';
    for (var i = 0; i < sorted.length; i++) {
        var item = sorted[i];
        html += '<tr>';
        html += '<td>' + formatDate(item.date) + '</td>';
        html += '<td class="text-end">' + formatNumber(item.count || 0) + '</td>';
        html += '<td class="text-end">' + formatNumber(item.totalTokens || 0) + '</td>';
        html += '<td class="text-end cost-value usd">$' + formatCost(item.estimatedCost || 0) + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

async function loadRecentLogs() {
    var limitSelect = document.getElementById('logsLimitSelect');
    var limit = limitSelect ? limitSelect.value : 25;
    var tbody = document.getElementById('recentLogsTable');
    if (!tbody) return;

    try {
        var response = await fetch('/api/openai-usage?limit=' + limit);
        if (!response.ok) throw new Error('Failed to load logs');

        var data = await response.json();
        var logs = data.logs || [];

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">ไม่มีบันทึกการใช้งาน</td></tr>';
            return;
        }

        var html = '';
        for (var i = 0; i < logs.length; i++) {
            var log = logs[i];
            var platform = log.platform || 'unknown';
            html += '<tr>';
            html += '<td>' + formatDateTime(log.timestamp) + '</td>';
            html += '<td><span class="model-badge">' + escapeHtml(log.model || '-') + '</span></td>';
            html += '<td>' + escapeHtml(log.botName || log.botId || '-') + '</td>';
            html += '<td><span class="platform-badge ' + platform + '">';
            html += '<i class="fab fa-' + platform + '"></i> ' + platform;
            html += '</span></td>';
            html += '<td class="text-end token-stat input">' + formatNumber(log.promptTokens || 0) + '</td>';
            html += '<td class="text-end token-stat output">' + formatNumber(log.completionTokens || 0) + '</td>';
            html += '<td class="text-end">' + formatNumber(log.totalTokens || 0) + '</td>';
            html += '<td class="text-end cost-value usd">$' + formatCost(log.estimatedCost || 0) + '</td>';
            html += '</tr>';
        }
        tbody.innerHTML = html;

    } catch (error) {
        console.error('Error loading recent logs:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-3">ไม่สามารถโหลดบันทึกได้</td></tr>';
    }
}

// Utility functions
function formatNumber(num) {
    return new Intl.NumberFormat('th-TH').format(num);
}

function formatCost(cost) {
    return (cost || 0).toFixed(4);
}

function formatDate(dateStr) {
    var date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(dateStr) {
    var date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showError(message) {
    var alert = document.createElement('div');
    alert.className = 'alert alert-danger position-fixed top-0 end-0 m-3';
    alert.style.zIndex = '9999';
    alert.innerHTML = '<i class="fas fa-exclamation-circle me-2"></i>' + message;
    document.body.appendChild(alert);
    setTimeout(function () { alert.remove(); }, 5000);
}
