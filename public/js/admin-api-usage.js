/**
 * Admin API Usage Dashboard - Consolidated View
 * Single page with charts, filters, and unified data table
 */

// ==================== Global State ====================
const State = {
    data: null,
    viewData: null,
    detailedLogs: [],
    detailCacheKey: '',
    detailMeta: null,
    viewMode: 'grouped', // 'grouped' or 'detailed'
    sortColumn: 'cost',
    sortDirection: 'desc',
    filters: {
        bot: '',
        model: '',
        platform: '',
        key: '',
        search: ''
    },
    charts: {
        daily: null,
        pie: null
    },
    expandedRow: null,
    requestToken: 0,
    detailRequestToken: 0
};

const THB_RATE = 33;
const DEFAULT_DATE_RANGE = '7days';
const VALID_DATE_RANGES = new Set(['today', '7days', '30days', 'all', 'custom']);

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', function () {
    initializeDateControls();
    initEventListeners();
    syncFilterStateFromControls();
    setViewMode(State.viewMode, { shouldRender: false });
    loadDashboardData();
});

function initializeDateControls() {
    const rangeSelect = document.getElementById('dateRangeSelect');
    const customStartDateInput = document.getElementById('customStartDateInput');
    const customEndDateInput = document.getElementById('customEndDateInput');
    const todayValue = getBangkokTodayInputValue();
    const urlParams = new URLSearchParams(window.location.search);
    const requestedRange = urlParams.get('range');
    const requestedStartDate = sanitizeDateInputValue(urlParams.get('startDate'));
    const requestedEndDate = sanitizeDateInputValue(urlParams.get('endDate'));
    const initialCustomRange = normalizeDateRangeValues(
        requestedStartDate,
        requestedEndDate,
        null,
        getDefaultCustomDateRangeValues()
    );

    customStartDateInput.max = todayValue;
    customEndDateInput.max = todayValue;
    setCustomDateRangeInputs(initialCustomRange);

    if (VALID_DATE_RANGES.has(requestedRange)) {
        rangeSelect.value = requestedRange;
    } else if (requestedStartDate || requestedEndDate) {
        rangeSelect.value = 'custom';
    } else {
        rangeSelect.value = DEFAULT_DATE_RANGE;
    }

    rangeSelect.dataset.prevValue = rangeSelect.value;
    updateDateControlState();
    syncDateStateToUrl();
}

function initEventListeners() {
    const rangeSelect = document.getElementById('dateRangeSelect');
    const customStartDateInput = document.getElementById('customStartDateInput');
    const customEndDateInput = document.getElementById('customEndDateInput');

    // Date range
    rangeSelect.addEventListener('change', function () {
        const previousRange = this.dataset.prevValue || DEFAULT_DATE_RANGE;

        if (this.value === 'custom') {
            if (previousRange !== 'custom') {
                setCustomDateRangeInputs(getCustomPrefillRangeValues(previousRange));
            } else {
                setCustomDateRangeInputs(getNormalizedCustomDateRange());
            }
        }

        this.dataset.prevValue = this.value;
        updateDateControlState();
        loadDashboardData();
    });

    customStartDateInput.addEventListener('change', function () {
        setCustomDateRangeInputs(getNormalizedCustomDateRange('start'));
        if (rangeSelect.value !== 'custom') {
            rangeSelect.value = 'custom';
        }
        rangeSelect.dataset.prevValue = 'custom';
        updateDateControlState();
        loadDashboardData();
    });

    customEndDateInput.addEventListener('change', function () {
        setCustomDateRangeInputs(getNormalizedCustomDateRange('end'));
        if (rangeSelect.value !== 'custom') {
            rangeSelect.value = 'custom';
        }
        rangeSelect.dataset.prevValue = 'custom';
        updateDateControlState();
        loadDashboardData();
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', function () {
        this.querySelector('i').classList.add('fa-spin');
        loadDashboardData().finally(() => {
            this.querySelector('i').classList.remove('fa-spin');
        });
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);

    // Filters
    ['filterBot', 'filterModel', 'filterPlatform', 'filterKey'].forEach(id => {
        document.getElementById(id).addEventListener('change', function () {
            applyFilters({ reloadData: true });
        });
    });

    // Search with debounce
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => applyFilters(), 300);
    });

    // Clear filters
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);

    // View mode toggle
    document.querySelectorAll('#viewModeToggle button').forEach(btn => {
        btn.addEventListener('click', function () {
            setViewMode(this.dataset.view);
        });
    });

    // Close expanded panel
    document.getElementById('closeExpandedPanel').addEventListener('click', closeExpandedPanel);
}

// ==================== Data Loading ====================
async function loadDashboardData() {
    const requestToken = ++State.requestToken;

    try {
        showLoadingState();
        State.detailedLogs = [];
        State.detailCacheKey = '';
        State.detailMeta = null;
        closeExpandedRows();

        syncDateStateToUrl();
        updateActiveDateText();
        const data = await fetchJson('/api/openai-usage/summary?' + getDateParams().toString());

        if (requestToken !== State.requestToken) {
            return null;
        }

        State.data = data;

        // Populate filter dropdowns
        populateFilterDropdowns(data);
        syncFilterStateFromControls();

        return await refreshDashboardViewData({ requestToken });

    } catch (err) {
        if (requestToken !== State.requestToken) {
            return null;
        }
        console.error('Error loading dashboard data:', err);
        showErrorState();
        return null;
    }
}

function getDateParams() {
    const { startDate, endDate } = getCurrentDateRangeValues();
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return params;
}

function buildDataRequestParams({ includeStructuredFilters = false } = {}) {
    const params = getDateParams();

    if (!includeStructuredFilters) {
        return params;
    }

    const structuredFilters = getStructuredFilterState();
    appendQueryParam(params, 'botId', structuredFilters.botId);
    appendQueryParam(params, 'platform', structuredFilters.platform);
    appendQueryParam(params, 'keyId', structuredFilters.keyId);
    appendQueryParam(params, 'provider', structuredFilters.provider);
    appendQueryParam(params, 'model', structuredFilters.model);

    return params;
}

function getStructuredFilterState() {
    const parsedModel = parseModelFilterKey(State.filters.model);

    return {
        botId: State.filters.bot || '',
        platform: State.filters.platform || '',
        keyId: State.filters.key || '',
        provider: parsedModel.provider || '',
        model: parsedModel.model || ''
    };
}

function syncFilterStateFromControls() {
    State.filters = {
        bot: document.getElementById('filterBot').value,
        model: document.getElementById('filterModel').value,
        platform: document.getElementById('filterPlatform').value,
        key: document.getElementById('filterKey').value,
        search: document.getElementById('searchInput').value.trim().toLowerCase()
    };

    return State.filters;
}

function hasStructuredFilters(filters = State.filters) {
    return Boolean(filters.bot || filters.model || filters.platform || filters.key);
}

async function refreshDashboardViewData({ requestToken = null } = {}) {
    if (!State.data) {
        return null;
    }

    const activeRequestToken = requestToken ?? ++State.requestToken;

    try {
        const data = hasStructuredFilters()
            ? await fetchJson('/api/openai-usage/summary?' + buildDataRequestParams({ includeStructuredFilters: true }).toString())
            : State.data;

        if (activeRequestToken !== State.requestToken) {
            return null;
        }

        State.viewData = data;
        updateSummaryCards(data.summary || {});
        updateCharts(data);
        closeExpandedRows();
        renderTable();
        return data;
    } catch (err) {
        if (activeRequestToken !== State.requestToken) {
            return null;
        }
        console.error('Error refreshing dashboard view:', err);
        showErrorState();
        return null;
    }
}

function updateDateControlState() {
    const isCustomRange = document.getElementById('dateRangeSelect').value === 'custom';
    const customDateField = document.getElementById('customDateField');
    const customStartDateInput = document.getElementById('customStartDateInput');
    const customEndDateInput = document.getElementById('customEndDateInput');

    customDateField.hidden = !isCustomRange;
    customStartDateInput.disabled = !isCustomRange;
    customEndDateInput.disabled = !isCustomRange;
    updateActiveDateText();
}

function syncDateStateToUrl() {
    const url = new URL(window.location.href);
    const range = document.getElementById('dateRangeSelect').value;
    const customRange = getNormalizedCustomDateRange();

    if (range && range !== DEFAULT_DATE_RANGE) {
        url.searchParams.set('range', range);
    } else {
        url.searchParams.delete('range');
    }

    if (range === 'custom') {
        url.searchParams.set('startDate', customRange.startDate);
        url.searchParams.set('endDate', customRange.endDate);
    } else {
        url.searchParams.delete('startDate');
        url.searchParams.delete('endDate');
    }
    url.searchParams.delete('date');

    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function updateActiveDateText() {
    const activeDateText = document.getElementById('activeDateText');
    if (!activeDateText) return;
    activeDateText.textContent = getActiveDateLabel();
}

function getActiveDateLabel() {
    const range = document.getElementById('dateRangeSelect').value;

    if (range === 'today') {
        return 'ข้อมูลของวันนี้';
    }
    if (range === '7days') {
        return 'ข้อมูลย้อนหลัง 7 วันรวมวันนี้';
    }
    if (range === '30days') {
        return 'ข้อมูลย้อนหลัง 30 วันรวมวันนี้';
    }
    if (range === 'all') {
        return 'ข้อมูลทั้งหมดที่มีในระบบ';
    }
    if (range === 'custom') {
        const { startDate, endDate } = getNormalizedCustomDateRange();
        if (startDate === endDate) {
            return `ข้อมูลวันที่ ${formatSelectedDateLabel(startDate)}`;
        }
        return `ข้อมูลช่วงวันที่ ${formatSelectedDateLabel(startDate)} - ${formatSelectedDateLabel(endDate)}`;
    }
    return 'ข้อมูลการใช้งาน API';
}

function getCurrentDateRangeValues() {
    const range = document.getElementById('dateRangeSelect').value;
    if (range === 'custom') {
        return getNormalizedCustomDateRange();
    }
    return getPresetDateRangeValues(range);
}

function getPresetDateRangeValues(range) {
    const todayValue = getBangkokTodayInputValue();

    if (range === 'today') {
        return { startDate: todayValue, endDate: todayValue };
    }
    if (range === '7days') {
        return { startDate: shiftDateInputValue(todayValue, -6), endDate: todayValue };
    }
    if (range === '30days') {
        return { startDate: shiftDateInputValue(todayValue, -29), endDate: todayValue };
    }
    if (range === 'all') {
        return { startDate: '1970-01-01', endDate: todayValue };
    }
    return getPresetDateRangeValues(DEFAULT_DATE_RANGE);
}

function getDefaultCustomDateRangeValues() {
    return getPresetDateRangeValues(DEFAULT_DATE_RANGE);
}

function getCustomPrefillRangeValues(range) {
    if (range && range !== 'custom' && range !== 'all') {
        return getPresetDateRangeValues(range);
    }
    return getDefaultCustomDateRangeValues();
}

function getNormalizedCustomDateRange(changedField = null) {
    return normalizeDateRangeValues(
        document.getElementById('customStartDateInput').value,
        document.getElementById('customEndDateInput').value,
        changedField,
        getDefaultCustomDateRangeValues()
    );
}

function setCustomDateRangeInputs({ startDate, endDate }) {
    document.getElementById('customStartDateInput').value = startDate;
    document.getElementById('customEndDateInput').value = endDate;
}

function normalizeDateRangeValues(startDateValue, endDateValue, changedField = null, fallbackRange = null) {
    const fallback = fallbackRange || getDefaultCustomDateRangeValues();
    let startDate = sanitizeDateInputValue(startDateValue);
    let endDate = sanitizeDateInputValue(endDateValue);

    if (!startDate && endDate) {
        startDate = endDate;
    } else if (!endDate && startDate) {
        endDate = startDate;
    } else if (!startDate && !endDate) {
        startDate = fallback.startDate;
        endDate = fallback.endDate;
    }

    if (startDate > endDate) {
        if (changedField === 'start') {
            endDate = startDate;
        } else if (changedField === 'end') {
            startDate = endDate;
        } else {
            const minDate = startDate < endDate ? startDate : endDate;
            const maxDate = startDate > endDate ? startDate : endDate;
            startDate = minDate;
            endDate = maxDate;
        }
    }

    return { startDate, endDate };
}

// ==================== Summary Cards ====================
function updateSummaryCards(summary) {
    const totalCalls = summary.totalCalls || 0;
    const totalTokens = summary.totalTokens || 0;
    const totalCostUSD = summary.totalCostUSD || 0;
    const totalPromptTokens = summary.totalPromptTokens ?? summary.totalInputTokens ?? 0;
    const totalCompletionTokens = summary.totalCompletionTokens ?? summary.totalOutputTokens ?? 0;
    const pricedCalls = summary.pricedCalls ?? totalCalls;
    const unpricedCalls = summary.unpricedCalls ?? Math.max(totalCalls - pricedCalls, 0);
    const avgCostPerCall = pricedCalls > 0 ? totalCostUSD / pricedCalls : null;
    const callsChange = document.getElementById('callsChange');

    animateValue('totalCalls', 0, totalCalls, 800, formatNumber);
    animateValue('totalTokens', 0, totalTokens, 800, formatNumber);

    if (callsChange) {
        if (totalCalls === 0) {
            callsChange.textContent = 'ยังไม่มีข้อมูลในช่วงเวลานี้';
            callsChange.className = 'summary-sub text-muted';
        } else if (unpricedCalls > 0) {
            callsChange.textContent = `คิดราคาได้ ${formatNumber(pricedCalls)} ครั้ง / ยังไม่ทราบราคา ${formatNumber(unpricedCalls)} ครั้ง`;
            callsChange.className = 'summary-sub text-warning';
        } else {
            callsChange.textContent = `คำนวณต้นทุนได้ครบ ${formatNumber(pricedCalls)} ครั้ง`;
            callsChange.className = 'summary-sub text-success';
        }
    }

    if (pricedCalls > 0) {
        document.getElementById('totalCost').textContent = '$' + formatCost(totalCostUSD);
        document.getElementById('totalCostTHB').textContent = '~฿' + formatNumber(Math.round(totalCostUSD * THB_RATE));
        document.getElementById('avgCostPerCall').textContent = '$' + avgCostPerCall.toFixed(4);
        document.getElementById('avgCostPerCallTHB').textContent = '~฿' + (avgCostPerCall * THB_RATE).toFixed(2);
    } else {
        document.getElementById('totalCost').textContent = '-';
        document.getElementById('totalCostTHB').textContent = 'N/A';
        document.getElementById('avgCostPerCall').textContent = '-';
        document.getElementById('avgCostPerCallTHB').textContent = 'N/A';
    }

    document.getElementById('inputTokens').textContent = formatNumber(totalPromptTokens);
    document.getElementById('outputTokens').textContent = formatNumber(totalCompletionTokens);
}

function animateValue(elementId, start, end, duration, formatter) {
    const element = document.getElementById(elementId);
    if (!element) return;
    if (end === 0) {
        element.textContent = formatter(end);
        return;
    }

    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + range * easeProgress);

        element.textContent = formatter(current);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// ==================== Charts ====================
function updateCharts(data) {
    updateDailyChart(data.daily || []);
    updatePieChart(data.byModel || []);
}

function updateDailyChart(dailyData) {
    const canvas = document.getElementById('dailyUsageChart');
    const ctx = canvas.getContext('2d');
    const sorted = [...dailyData].sort((a, b) => new Date(a._id) - new Date(b._id));
    const labels = sorted.map(d => formatShortDate(d._id));
    const callsData = sorted.map(d => d.calls || 0);
    const costData = sorted.map(d => d.cost || 0);

    if (State.charts.daily) {
        State.charts.daily.destroy();
    }

    State.charts.daily = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Calls',
                    data: callsData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Cost ($)',
                    data: costData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 12 },
                    bodyFont: { size: 11 },
                    callbacks: {
                        label: function (context) {
                            if (context.dataset.label === 'Cost ($)') {
                                return `Cost: $${context.parsed.y.toFixed(4)}`;
                            }
                            return `Calls: ${formatNumber(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        font: { size: 10 },
                        callback: val => formatNumber(val)
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: {
                        font: { size: 10 },
                        callback: val => '$' + val.toFixed(2)
                    }
                }
            }
        }
    });
}

function updatePieChart(modelData) {
    const canvas = document.getElementById('modelPieChart');
    const ctx = canvas.getContext('2d');
    const sorted = [...modelData].sort((a, b) => (b.costUSD || 0) - (a.costUSD || 0)).slice(0, 6);
    const labels = sorted.map(m => formatModelLabel(m.model, m.provider));
    const data = sorted.map(m => m.costUSD || 0);
    const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

    if (State.charts.pie) {
        State.charts.pie.destroy();
    }

    State.charts.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        boxWidth: 10,
                        padding: 8,
                        font: { size: 10 },
                        generateLabels: function (chart) {
                            const dataset = chart.data.datasets[0] || { data: [] };
                            const total = dataset.data.reduce((sum, value) => sum + value, 0);
                            return chart.data.labels.map((label, i) => {
                                const value = dataset.data[i] || 0;
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return {
                                    text: `${label} (${percentage}%)`,
                                    fillStyle: colors[i],
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed || 0;
                            return `$${value.toFixed(4)} (~฿${(value * THB_RATE).toFixed(2)})`;
                        }
                    }
                }
            }
        }
    });
}

// ==================== Filter Dropdowns ====================
function populateFilterDropdowns(data) {
    const botSelect = document.getElementById('filterBot');
    const modelSelect = document.getElementById('filterModel');
    const keySelect = document.getElementById('filterKey');
    const platformSelect = document.getElementById('filterPlatform');
    const selectedFilters = { ...State.filters };

    botSelect.innerHTML = '<option value="">ทั้งหมด</option>';
    const botMap = new Map();
    (data.byBot || []).forEach(bot => {
        if (!bot.botId || botMap.has(bot.botId)) {
            return;
        }
        botMap.set(bot.botId, {
            id: bot.botId,
            label: bot.name || bot.botId || '-'
        });
    });
    Array.from(botMap.values())
        .sort((a, b) => a.label.localeCompare(b.label, 'th'))
        .forEach(bot => {
            const opt = document.createElement('option');
            opt.value = bot.id;
            opt.textContent = bot.label;
            botSelect.appendChild(opt);
        });

    modelSelect.innerHTML = '<option value="">ทั้งหมด</option>';
    const modelMap = new Map();
    (data.byModel || []).forEach(modelInfo => {
        const modelKey = buildModelFilterKey(modelInfo.model, modelInfo.provider);
        if (modelMap.has(modelKey)) {
            return;
        }
        modelMap.set(modelKey, {
            model: modelInfo.model || '',
            provider: modelInfo.provider
        });
    });
    Array.from(modelMap.entries())
        .sort((a, b) => formatModelLabel(a[1].model, a[1].provider).localeCompare(formatModelLabel(b[1].model, b[1].provider)))
        .forEach(([key, modelInfo]) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = formatModelLabel(modelInfo.model, modelInfo.provider);
            modelSelect.appendChild(opt);
        });

    keySelect.innerHTML = '<option value="">ทั้งหมด</option>';
    const keyMap = new Map();
    (data.byKey || []).forEach(keyInfo => {
        const keyId = keyInfo.keyId || 'env';
        if (keyMap.has(keyId)) {
            return;
        }
        keyMap.set(keyId, {
            id: keyId,
            label: formatKeyLabel(keyInfo.name || 'Environment Variable', keyInfo.provider)
        });
    });
    Array.from(keyMap.values())
        .sort((a, b) => a.label.localeCompare(b.label))
        .forEach(keyInfo => {
            const opt = document.createElement('option');
            opt.value = keyInfo.id;
            opt.textContent = keyInfo.label;
            keySelect.appendChild(opt);
        });

    restoreSelectValue(botSelect, selectedFilters.bot);
    restoreSelectValue(modelSelect, selectedFilters.model);
    restoreSelectValue(platformSelect, selectedFilters.platform);
    restoreSelectValue(keySelect, selectedFilters.key);
}

// ==================== Filtering & Sorting ====================
function applyFilters({ reloadData = false } = {}) {
    syncFilterStateFromControls();
    closeExpandedRows();

    if (reloadData) {
        State.detailCacheKey = '';
        return refreshDashboardViewData();
    }

    renderTable();
    return Promise.resolve();
}

function clearFilters() {
    document.getElementById('filterBot').value = '';
    document.getElementById('filterModel').value = '';
    document.getElementById('filterPlatform').value = '';
    document.getElementById('filterKey').value = '';
    document.getElementById('searchInput').value = '';
    applyFilters({ reloadData: true });
}

function setViewMode(viewMode, { shouldRender = true } = {}) {
    const previousViewMode = State.viewMode;
    State.viewMode = viewMode === 'detailed' ? 'detailed' : 'grouped';
    document.querySelectorAll('#viewModeToggle button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === State.viewMode);
    });

    if (State.viewMode !== previousViewMode && State.viewMode === 'grouped') {
        State.sortColumn = 'cost';
        State.sortDirection = 'desc';
    } else if (State.viewMode !== previousViewMode && State.viewMode === 'detailed') {
        State.sortColumn = 'timestamp';
        State.sortDirection = 'desc';
    }

    closeExpandedRows();

    if (shouldRender && (State.viewData || State.data)) {
        renderTable();
    }
}

// ==================== Table Rendering ====================
function renderTable() {
    const dataSource = getDataSourceForCurrentView();
    if (!dataSource) return;

    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');

    if (State.viewMode === 'grouped') {
        renderGroupedTable(tableHeader, tableBody, dataSource);
    } else {
        renderDetailedTable(tableHeader, tableBody);
    }
}

function renderGroupedTable(tableHeader, tableBody, dataSource) {
    tableHeader.innerHTML = `
        <tr>
            <th class="sortable" data-sort="name">Bot/Page</th>
            <th class="sortable" data-sort="platform">Platform</th>
            <th class="sortable text-end" data-sort="calls">Calls</th>
            <th class="sortable text-end" data-sort="tokens">Tokens</th>
            <th class="sortable text-end" data-sort="cost">Cost (USD)</th>
            <th class="sortable text-end" data-sort="avgCost">ต้นทุน/ครั้ง</th>
            <th class="text-center" style="width: 50px;"></th>
        </tr>
    `;
    bindSortHandlers(tableHeader);

    let items = [...(dataSource.byBot || [])];
    if (State.filters.search) {
        items = items.filter(item => {
            const name = `${item.name || ''} ${item.botId || ''}`.toLowerCase();
            return name.includes(State.filters.search);
        });
    }

    items = sortGroupedData(items);
    document.getElementById('resultCount').textContent = formatNumber(items.length);

    if (items.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <i class="fas fa-inbox d-block"></i>
                    <p class="mb-0">ไม่พบข้อมูล</p>
                </td>
            </tr>
        `;
        return;
    }

    const maxCost = Math.max(...items.map(item => item.costUSD || 0), 0);
    let html = '';

    items.forEach(item => {
        const pricedCalls = item.pricedCalls ?? item.calls ?? 0;
        const hasCostData = pricedCalls > 0;
        const avgCostUSD = hasCostData ? (item.costUSD || 0) / pricedCalls : null;
        const avgCostTHB = hasCostData ? avgCostUSD * THB_RATE : 0;
        const totalCostTHB = (item.costUSD || 0) * THB_RATE;
        const costPercent = hasCostData && maxCost > 0 ? ((item.costUSD || 0) / maxCost) * 100 : 0;
        const canExpand = Boolean(item.botId);

        html += `
            <tr class="${canExpand ? 'expandable' : ''}" data-bot-id="${escapeHtml(item.botId || '')}">
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <i class="${getPlatformIcon(item.platform)} text-muted"></i>
                        <span class="fw-medium">${escapeHtml(item.name || item.botId || '-')}</span>
                    </div>
                </td>
                <td>
                    <span class="platform-badge ${item.platform || ''}">${capitalize(item.platform || '-')}</span>
                </td>
                <td class="text-end">${formatNumber(item.calls)}</td>
                <td class="text-end">${formatNumber(item.tokens)}</td>
                <td class="text-end">
                    <div class="cost-display">${hasCostData ? `$${formatCost(item.costUSD)} <span class="cost-sub">(฿${totalCostTHB.toFixed(2)})</span>` : '<span class="text-muted">-</span>'}</div>
                    <div class="cost-bar"><div class="cost-bar-fill primary" style="width: ${costPercent}%"></div></div>
                </td>
                <td class="text-end">
                    ${hasCostData ? `<span class="text-info fw-semibold">$${avgCostUSD.toFixed(4)}</span><span class="cost-sub">(฿${avgCostTHB.toFixed(2)})</span>` : '<span class="text-muted">-</span>'}
                </td>
                <td class="text-center">
                    ${canExpand ? '<i class="fas fa-chevron-right expand-icon"></i>' : '<span class="text-muted">-</span>'}
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
    tableBody.querySelectorAll('.expandable').forEach(row => {
        row.addEventListener('click', () => toggleRowExpand(row));
    });
}

function renderDetailedTable(tableHeader, tableBody) {
    tableHeader.innerHTML = `
        <tr>
            <th class="sortable" data-sort="timestamp">เวลา</th>
            <th class="sortable" data-sort="model">Model</th>
            <th class="sortable" data-sort="bot">Bot</th>
            <th class="sortable" data-sort="platform">Platform</th>
            <th class="sortable text-end" data-sort="input">Input</th>
            <th class="sortable text-end" data-sort="output">Output</th>
            <th class="sortable text-end" data-sort="total">Total</th>
            <th class="sortable text-end" data-sort="cost">Cost</th>
        </tr>
    `;
    bindSortHandlers(tableHeader);
    loadDetailedLogs(tableBody);
}

async function loadDetailedLogs(tableBody = document.getElementById('tableBody')) {
    const requestKey = getDetailedLogsCacheKey();
    if (State.detailCacheKey === requestKey) {
        renderDetailedRows(State.detailedLogs, tableBody);
        return;
    }

    tableBody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                <span class="ms-2 text-muted">กำลังโหลดบันทึก...</span>
            </td>
        </tr>
    `;

    const requestToken = ++State.detailRequestToken;

    try {
        const params = buildDataRequestParams({ includeStructuredFilters: true });
        params.set('limit', '500');

        const data = await fetchJson('/api/openai-usage?' + params.toString());
        if (requestToken !== State.detailRequestToken) {
            return;
        }

        State.detailedLogs = Array.isArray(data.logs) ? data.logs : [];
        State.detailMeta = data.pagination || null;
        State.detailCacheKey = requestKey;
        renderDetailedRows(State.detailedLogs, tableBody);
    } catch (err) {
        if (requestToken !== State.detailRequestToken) {
            return;
        }
        console.error('Error loading detailed logs:', err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-circle me-2"></i>เกิดข้อผิดพลาดในการโหลดบันทึก
                </td>
            </tr>
        `;
    }
}

function renderDetailedRows(logs, tableBody = document.getElementById('tableBody')) {
    const botNameMap = buildBotNameMap();
    const filtered = sortDetailedLogs(logs.filter(log => {
        if (!State.filters.search) {
            return true;
        }

        const botName = (botNameMap[log.botId] || log.botId || '').toLowerCase();
        const modelLabel = formatModelLabel(log.model, log.provider).toLowerCase();
        const functionName = (log.functionName || '').toLowerCase();
        return botName.includes(State.filters.search)
            || modelLabel.includes(State.filters.search)
            || functionName.includes(State.filters.search);
    }), botNameMap);

    document.getElementById('resultCount').textContent = formatNumber(filtered.length);

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <i class="fas fa-inbox d-block"></i>
                    <p class="mb-0">ไม่พบบันทึก</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    filtered.forEach(log => {
        const botName = botNameMap[log.botId] || log.botId || '-';
        const hasCostData = typeof log.estimatedCostUSD === 'number';
        const costTHB = hasCostData ? (log.estimatedCostUSD * THB_RATE) : 0;
        const modelLabel = formatModelLabel(log.model, log.provider);

        html += `
            <tr>
                <td>${formatDateTime(log.timestamp)}</td>
                <td><span class="model-badge ${getModelClass(log.model)}">${escapeHtml(modelLabel)}</span></td>
                <td>${escapeHtml(botName)}</td>
                <td><span class="platform-badge ${log.platform || ''}">${capitalize(log.platform || '-')}</span></td>
                <td class="text-end">${formatNumber(log.promptTokens || 0)}</td>
                <td class="text-end">${formatNumber(log.completionTokens || 0)}</td>
                <td class="text-end fw-medium">${formatNumber(log.totalTokens || 0)}</td>
                <td class="text-end">
                    ${hasCostData
                        ? `<span class="cost-display">$${formatCost(log.estimatedCostUSD)}</span><span class="cost-sub">(฿${costTHB.toFixed(2)})</span>`
                        : '<span class="text-muted">-</span>'}
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}

// ==================== Row Expansion ====================
async function toggleRowExpand(row) {
    const botId = row.dataset.botId;
    const isExpanded = row.classList.contains('expanded');
    closeExpandedRows();

    if (isExpanded || !botId) {
        return;
    }

    row.classList.add('expanded');
    State.expandedRow = botId;

    const detailRow = document.createElement('tr');
    detailRow.className = 'expanded-detail-row';
    detailRow.innerHTML = `
        <td colspan="7">
            <div class="expanded-row-content">
                <div class="text-center py-3">
                    <div class="spinner-border spinner-border-sm text-primary"></div>
                    <span class="ms-2 text-muted">กำลังโหลดรายละเอียด...</span>
                </div>
            </div>
        </td>
    `;

    row.after(detailRow);

    try {
        const params = buildDataRequestParams({ includeStructuredFilters: true });
        params.delete('botId');

        const data = await fetchJson(`/api/openai-usage/by-bot/${encodeURIComponent(botId)}?${params.toString()}`);
        const modelItems = data.byModel || [];
        const keyItems = data.byKey || [];
        const recentLogs = (data.recentLogs || []).slice(0, 5);

        let html = `
            <div class="expanded-row-content">
                <div class="detail-grid">
                    <div class="detail-card">
                        <div class="detail-card-title">
                            <i class="fas fa-microchip text-primary"></i>
                            โมเดลที่ใช้
                        </div>
                        <ul class="detail-list">
        `;

        if (modelItems.length === 0) {
            html += '<li><span class="text-muted">ไม่มีข้อมูล</span><span></span></li>';
        } else {
            modelItems.forEach(modelInfo => {
                const pricedCalls = modelInfo.pricedCalls ?? modelInfo.count ?? 0;
                const hasCostData = pricedCalls > 0;
                const avgCost = hasCostData ? modelInfo.estimatedCost / pricedCalls : null;
                const modelLabel = formatModelLabel(modelInfo.model, modelInfo.provider);
                html += `
                    <li>
                        <span><span class="model-badge ${getModelClass(modelInfo.model)}">${escapeHtml(modelLabel)}</span></span>
                        <span>
                            <strong>${formatNumber(modelInfo.count)}</strong> calls •
                            ${hasCostData ? `<span class="text-info">$${avgCost.toFixed(4)}</span>/call` : '<span class="text-muted">-</span>'}
                        </span>
                    </li>
                `;
            });
        }

        html += `
                        </ul>
                    </div>
                    <div class="detail-card">
                        <div class="detail-card-title">
                            <i class="fas fa-key text-warning"></i>
                            API Keys
                        </div>
                        <ul class="detail-list">
        `;

        if (keyItems.length === 0) {
            html += '<li><span class="text-muted">ไม่มีข้อมูล</span><span></span></li>';
        } else {
            keyItems.forEach(keyInfo => {
                const hasCostData = (keyInfo.pricedCalls ?? keyInfo.count ?? 0) > 0;
                const keyLabel = formatKeyLabel(keyInfo.keyName, keyInfo.provider);
                html += `
                    <li>
                        <span><i class="fas fa-key text-muted me-1"></i>${escapeHtml(keyLabel)}</span>
                        <span><strong>${formatNumber(keyInfo.count)}</strong> calls • ${hasCostData ? `$${formatCost(keyInfo.estimatedCost)}` : '<span class="text-muted">-</span>'}</span>
                    </li>
                `;
            });
        }

        html += `
                        </ul>
                    </div>
                    <div class="detail-card">
                        <div class="detail-card-title">
                            <i class="fas fa-clock text-success"></i>
                            บันทึกล่าสุด
                        </div>
                        <ul class="detail-list">
        `;

        if (recentLogs.length === 0) {
            html += '<li><span class="text-muted">ไม่มีข้อมูล</span><span></span></li>';
        } else {
            recentLogs.forEach(log => {
                const hasCostData = typeof log.estimatedCost === 'number';
                const modelLabel = formatModelLabel(log.model, log.provider);
                html += `
                    <li>
                        <span>${formatDateTime(log.timestamp)}</span>
                        <span>${escapeHtml(modelLabel)} • ${formatNumber(log.totalTokens)} tokens • ${hasCostData ? `$${formatCost(log.estimatedCost)}` : '<span class="text-muted">-</span>'}</span>
                    </li>
                `;
            });
        }

        html += `
                        </ul>
                    </div>
                </div>
            </div>
        `;

        detailRow.querySelector('td').innerHTML = html;
    } catch (err) {
        console.error('Error loading bot details:', err);
        detailRow.querySelector('td').innerHTML = `
            <div class="expanded-row-content">
                <div class="text-center text-danger py-3">
                    <i class="fas fa-exclamation-circle me-2"></i>ไม่สามารถโหลดข้อมูลได้
                </div>
            </div>
        `;
    }
}

// ==================== Sorting ====================
function handleSort(column) {
    if (State.sortColumn === column) {
        State.sortDirection = State.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        State.sortColumn = column;
        State.sortDirection = getDefaultSortDirection(column);
    }

    updateSortHeaderClasses();
    renderTable();
}

function sortGroupedData(items) {
    const col = State.sortColumn;
    const dir = State.sortDirection === 'asc' ? 1 : -1;

    return [...items].sort((a, b) => {
        switch (col) {
            case 'name':
                return ((a.name || a.botId || '').toLowerCase()).localeCompare((b.name || b.botId || '').toLowerCase()) * dir;
            case 'platform':
                return (a.platform || '').localeCompare(b.platform || '') * dir;
            case 'calls':
                return ((a.calls || 0) - (b.calls || 0)) * dir;
            case 'tokens':
                return ((a.tokens || 0) - (b.tokens || 0)) * dir;
            case 'avgCost': {
                const avgA = (a.pricedCalls ?? a.calls ?? 0) > 0 ? (a.costUSD || 0) / (a.pricedCalls ?? a.calls ?? 0) : 0;
                const avgB = (b.pricedCalls ?? b.calls ?? 0) > 0 ? (b.costUSD || 0) / (b.pricedCalls ?? b.calls ?? 0) : 0;
                return (avgA - avgB) * dir;
            }
            case 'cost':
            default:
                return ((a.costUSD || 0) - (b.costUSD || 0)) * dir;
        }
    });
}

function sortDetailedLogs(logs, botNameMap) {
    const dir = State.sortDirection === 'asc' ? 1 : -1;
    const sortColumn = State.sortColumn;

    return [...logs].sort((a, b) => {
        let valueA;
        let valueB;

        switch (sortColumn) {
            case 'model':
                valueA = formatModelLabel(a.model, a.provider).toLowerCase();
                valueB = formatModelLabel(b.model, b.provider).toLowerCase();
                return valueA.localeCompare(valueB) * dir;
            case 'bot':
                valueA = (botNameMap[a.botId] || a.botId || '').toLowerCase();
                valueB = (botNameMap[b.botId] || b.botId || '').toLowerCase();
                return valueA.localeCompare(valueB) * dir;
            case 'platform':
                return (a.platform || '').localeCompare(b.platform || '') * dir;
            case 'input':
                return ((a.promptTokens || 0) - (b.promptTokens || 0)) * dir;
            case 'output':
                return ((a.completionTokens || 0) - (b.completionTokens || 0)) * dir;
            case 'total':
                return ((a.totalTokens || 0) - (b.totalTokens || 0)) * dir;
            case 'cost':
                return (((a.estimatedCostUSD ?? -1)) - ((b.estimatedCostUSD ?? -1))) * dir;
            case 'timestamp':
            default:
                return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * dir;
        }
    });
}

function getDefaultSortDirection(column) {
    if (['name', 'model', 'bot', 'platform'].includes(column)) {
        return 'asc';
    }
    return 'desc';
}

function bindSortHandlers(tableHeader) {
    tableHeader.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });
    updateSortHeaderClasses(tableHeader);
}

function updateSortHeaderClasses(scope = document) {
    scope.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === State.sortColumn) {
            th.classList.add(State.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// ==================== Export ====================
function exportToCSV() {
    const dataSource = getDataSourceForCurrentView();
    if (!dataSource) return;

    let csv = 'Date,Calls,Tokens,Priced Calls,Cost USD,Cost THB\n';
    (dataSource.daily || []).forEach(day => {
        const costUSD = day.cost || 0;
        const costTHB = costUSD * THB_RATE;
        csv += `${day._id || day.date},${day.calls || day.count || 0},${day.tokens || day.totalTokens || 0},${day.pricedCalls || 0},${costUSD.toFixed(4)},${costTHB.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-usage-${getExportFileSuffix()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ==================== UI Helpers ====================
function showLoadingState() {
    document.getElementById('resultCount').textContent = '0';
    document.getElementById('tableBody').innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">กำลังโหลด...</span>
                </div>
                <p class="text-muted mt-2 mb-0">กำลังโหลดข้อมูล...</p>
            </td>
        </tr>
    `;
}

function showErrorState() {
    closeExpandedRows();
    document.getElementById('resultCount').textContent = '0';
    updateSummaryCards({});
    updateCharts({ daily: [], byModel: [] });
    document.getElementById('tableBody').innerHTML = `
        <tr>
            <td colspan="8" class="text-center text-danger py-5">
                <i class="fas fa-exclamation-triangle fa-2x mb-2 d-block"></i>
                <p class="mb-0">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
            </td>
        </tr>
    `;
}

function closeExpandedPanel() {
    document.getElementById('expandedPanel').style.display = 'none';
}

function closeExpandedRows() {
    document.querySelectorAll('.expanded-detail-row').forEach(row => row.remove());
    document.querySelectorAll('.expanded').forEach(row => row.classList.remove('expanded'));
    State.expandedRow = null;
}

// ==================== Utilities ====================
async function fetchJson(url) {
    const response = await fetch(url);
    let data;

    try {
        data = await response.json();
    } catch (err) {
        throw new Error('รูปแบบข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง');
    }

    if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'ไม่สามารถโหลดข้อมูลได้');
    }

    return data;
}

function getDataSourceForCurrentView() {
    return State.viewData || State.data;
}

function getDetailedLogsCacheKey() {
    const params = buildDataRequestParams({ includeStructuredFilters: true });
    params.set('limit', '500');
    return params.toString();
}

function buildBotNameMap() {
    const botNameMap = {};
    (State.data?.byBot || []).forEach(bot => {
        if (bot.botId) {
            botNameMap[bot.botId] = bot.name || bot.botId;
        }
    });
    return botNameMap;
}

function appendQueryParam(params, key, value) {
    if (value !== null && value !== undefined && value !== '') {
        params.append(key, value);
    }
}

function restoreSelectValue(select, value) {
    if (!select) return;
    const normalizedValue = value || '';
    const hasOption = Array.from(select.options).some(option => option.value === normalizedValue);
    select.value = hasOption ? normalizedValue : '';
}

function sanitizeDateInputValue(value) {
    if (typeof value !== 'string') return '';
    const trimmedValue = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue) ? trimmedValue : '';
}

function getBangkokTodayInputValue() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const partMap = {};
    parts.forEach(part => {
        partMap[part.type] = part.value;
    });
    return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function shiftDateInputValue(dateValue, deltaDays) {
    const normalizedDate = sanitizeDateInputValue(dateValue);
    if (!normalizedDate) {
        return '';
    }

    const [year, month, day] = normalizedDate.split('-').map(Number);
    const shiftedDate = new Date(Date.UTC(year, month - 1, day));
    shiftedDate.setUTCDate(shiftedDate.getUTCDate() + deltaDays);

    return formatDateInputParts(
        shiftedDate.getUTCFullYear(),
        shiftedDate.getUTCMonth() + 1,
        shiftedDate.getUTCDate()
    );
}

function formatDateInputParts(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildDateFromInputValue(dateValue) {
    const normalizedDate = sanitizeDateInputValue(dateValue);
    if (!normalizedDate) {
        return null;
    }

    const [year, month, day] = normalizedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function formatSelectedDateLabel(dateValue) {
    const date = buildDateFromInputValue(dateValue);
    if (!date) {
        return 'วันนี้';
    }

    return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function getExportFileSuffix() {
    const range = document.getElementById('dateRangeSelect').value;
    const { startDate, endDate } = getCurrentDateRangeValues();

    if (range === 'all') {
        return `all-${endDate}`;
    }
    if (startDate === endDate) {
        return startDate;
    }
    return `${startDate}_to_${endDate}`;
}

function formatNumber(num) {
    return new Intl.NumberFormat('th-TH').format(num || 0);
}

function formatCost(cost) {
    return (cost || 0).toFixed(4);
}

function formatShortDate(dateStr) {
    const date = buildDateFromInputValue(dateStr) || new Date(dateStr);
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
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

function getPlatformIcon(platform) {
    if (platform === 'line') return 'fab fa-line';
    if (platform === 'facebook') return 'fab fa-facebook-messenger';
    return 'fas fa-robot';
}

function getModelClass(model) {
    if (!model) return '';
    if (model.includes('gpt-4')) return 'gpt-4';
    if (model.includes('gpt-3')) return 'gpt-3';
    return '';
}

function normalizeProviderName(provider) {
    if (typeof provider !== 'string') return 'openai';
    return provider.trim().toLowerCase() === 'openrouter' ? 'openrouter' : 'openai';
}

function formatModelLabel(model, provider) {
    const normalizedProvider = normalizeProviderName(provider);
    const modelId = model || '-';
    return `[${normalizedProvider.toUpperCase()}] ${modelId}`;
}

function buildModelFilterKey(model, provider) {
    return `${normalizeProviderName(provider)}::${model || ''}`;
}

function parseModelFilterKey(value) {
    if (typeof value !== 'string' || !value.includes('::')) {
        return { provider: '', model: '' };
    }

    const [provider, ...rest] = value.split('::');
    return {
        provider: normalizeProviderName(provider),
        model: rest.join('::')
    };
}

function formatKeyLabel(name, provider) {
    const normalizedProvider = normalizeProviderName(provider);
    const keyName = name || 'Environment Variable';
    return `[${normalizedProvider.toUpperCase()}] ${keyName}`;
}

function capitalize(str) {
    if (!str || str === '-') return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
