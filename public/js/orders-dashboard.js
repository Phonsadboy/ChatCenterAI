document.addEventListener('DOMContentLoaded', () => {
  const filterForm = document.getElementById('orderFilterForm');
  const statusSelect = document.getElementById('filterStatus');
  const pageSelect = document.getElementById('filterPage');
  const startDateInput = document.getElementById('filterStartDate');
  const endDateInput = document.getElementById('filterEndDate');
  const todayOnlyCheckbox = document.getElementById('filterTodayOnly');
  const clearButton = document.getElementById('filterClearBtn');
  const exportButton = document.getElementById('exportOrdersBtn');
  const tableBody = document.getElementById('ordersTableBody');
  const loadingEl = document.getElementById('ordersLoading');
  const emptyStateEl = document.getElementById('ordersEmptyState');
  const paginationEl = document.getElementById('ordersPagination');
  const prevPageBtn = document.getElementById('ordersPrevPage');
  const nextPageBtn = document.getElementById('ordersNextPage');
  const currentPageLabel = document.getElementById('ordersCurrentPage');
  const totalPagesLabel = document.getElementById('ordersTotalPages');
  const summaryTotalOrders = document.getElementById('summaryTotalOrders');
  const summaryTotalAmount = document.getElementById('summaryTotalAmount');
  const summaryTotalShipping = document.getElementById('summaryTotalShipping');
  const pageSettingsBody = document.getElementById('orderPageSettingsBody');
  const pageSettingsStatus = document.getElementById('orderPageSettingsStatus');
  const cutoffToggle = document.getElementById('orderCutoffToggle');

  let currentPage = 1;
  let totalPages = 1;
  const limit = 50;

  let orderPages = [];
  const pageLookup = new Map();
  let settingsStatusTimeout = null;

  const statusLabels = {
    pending: 'รอดำเนินการ',
    confirmed: 'ยืนยันแล้ว',
    shipped: 'จัดส่งแล้ว',
    completed: 'เสร็จสิ้น',
    cancelled: 'ยกเลิก',
  };

  const platformLabels = {
    line: 'LINE',
    facebook: 'Facebook',
  };

  function toggleDateInputs() {
    const disabled = todayOnlyCheckbox.checked;
    startDateInput.disabled = disabled;
    endDateInput.disabled = disabled;
    if (disabled) {
      startDateInput.value = '';
      endDateInput.value = '';
    }
  }

  function getQueryParams(pageOverride) {
    const params = new URLSearchParams();
    const status = statusSelect.value;
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const todayOnly = todayOnlyCheckbox.checked;
    const pageKey = pageSelect ? pageSelect.value : 'all';

    if (status && status !== 'all') {
      params.append('status', status);
    }
    if (!todayOnly && startDate) {
      params.append('startDate', startDate);
    }
    if (!todayOnly && endDate) {
      params.append('endDate', endDate);
    }
    if (todayOnly) {
      params.append('todayOnly', 'true');
    }
    if (pageKey && pageKey !== 'all') {
      params.append('pageKey', pageKey);
    }

    const page = pageOverride || currentPage;
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    return params;
  }

  async function loadOrders(pageOverride) {
    const params = getQueryParams(pageOverride);
    const url = `/admin/orders/data?${params.toString()}`;

    setLoading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('ไม่สามารถโหลดข้อมูลออเดอร์ได้');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'ไม่สามารถโหลดข้อมูลออเดอร์ได้');
      }

      currentPage = data.pagination.page;
      totalPages = data.pagination.pages;

      renderOrders(data.orders || []);
      updateSummary(data.summary || {});
      updatePagination();
    } catch (error) {
      console.error('[Orders] loadOrders error:', error);
      showEmptyState(true);
      tableBody.innerHTML =
        '<tr><td colspan="10" class="text-center text-danger">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    loadingEl.style.display = isLoading ? 'block' : 'none';
    if (isLoading) {
      emptyStateEl.style.display = 'none';
      tableBody.innerHTML = '';
    }
  }

  function showEmptyState(shouldShow) {
    emptyStateEl.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) {
      tableBody.innerHTML = '';
    }
  }

  function renderOrders(orders) {
    if (!orders.length) {
      showEmptyState(true);
      paginationEl.style.display = 'none';
      return;
    }

    showEmptyState(false);
    tableBody.innerHTML = orders
      .map((order) => {
        const extractedAt = order.extractedAt
          ? formatDateTime(order.extractedAt)
          : '-';
        const customerName =
          order.customerName || order.displayName || order.userId || '-';
        const pageLabel = getPageLabel(order);
        const platformKey = (order.platform || '').toLowerCase();
        const platformLabel =
          platformLabels[platformKey] || order.platform || '-';
        const status = order.status || 'pending';
        const itemsHtml = renderOrderItems(order.items || []);
        const shippingCost = formatCurrency(order.shippingCost || 0);
        const totalAmount = formatCurrency(order.totalAmount || 0);
        const payment = order.paymentMethod || '-';
        const notes = order.notes ? escapeHtml(order.notes) : '-';

        return `
          <tr>
            <td data-label="วันที่">${extractedAt}</td>
            <td data-label="ลูกค้า">${escapeHtml(customerName)}</td>
            <td data-label="เพจ">${escapeHtml(pageLabel)}</td>
            <td data-label="แพลตฟอร์ม">${escapeHtml(platformLabel)}</td>
            <td data-label="รายการสินค้า">${itemsHtml}</td>
            <td data-label="ค่าส่ง">${shippingCost}</td>
            <td data-label="ยอดรวม">${totalAmount}</td>
            <td data-label="การชำระเงิน">${escapeHtml(payment)}</td>
            <td data-label="สถานะ">
              <span class="status-badge ${status}">${statusLabels[status] || status}</span>
            </td>
            <td data-label="หมายเหตุ">${notes}</td>
          </tr>
        `;
      })
      .join('');

    paginationEl.style.display = totalPages > 1 ? 'flex' : 'none';
  }

  function renderOrderItems(items) {
    if (!items.length) {
      return '<span class="text-muted">-</span>';
    }

    const list = items
      .map((item) => {
        const name = escapeHtml(item.product || '-');
        const quantity = item.quantity || 0;
        const price = formatCurrency(item.price || 0);
        return `<div>${name} <span class="text-muted">x${quantity}</span> <span class="text-muted">@ ${price}</span></div>`;
      })
      .join('');

    return `<div class="order-items-list">${list}</div>`;
  }

  function getPageLabel(order) {
    if (!order) return '-';
    if (order.pageKey && pageLookup.has(order.pageKey)) {
      return pageLookup.get(order.pageKey).name || order.pageKey;
    }
    if (order.pageName) {
      return order.pageName;
    }
    if (order.botId) {
      const platformKey = (order.platform || '').toLowerCase();
      const platformLabel =
        platformLabels[platformKey] || order.platform || 'เพจ';
      return `${platformLabel} (${order.botId})`;
    }
    return '-';
  }

  function populatePageFilter(pages) {
    if (!pageSelect) return;
    const previousValue = pageSelect.value || 'all';
    pageSelect.innerHTML = '<option value="all">ทุกเพจ</option>';

    pages.forEach((page) => {
      const option = document.createElement('option');
      option.value = page.pageKey;
      const platformLabel =
        platformLabels[page.platform] || page.platform || 'เพจ';
      option.textContent = `${page.name || page.pageKey} (${platformLabel})`;
      pageSelect.appendChild(option);
    });

    const hasPrevious = pages.some((page) => page.pageKey === previousValue);
    pageSelect.value = hasPrevious ? previousValue : 'all';
  }

  function renderPageSettings(pages) {
    if (!pageSettingsBody) return;

    if (!pages.length) {
      pageSettingsBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-4">ยังไม่มีเพจที่เชื่อมต่อ</td></tr>';
      return;
    }

    pageSettingsBody.innerHTML = pages
      .map((page) => {
        const platformLabel =
          platformLabels[page.platform] || page.platform || '-';
        const cutoffTime = page.cutoffTime || '23:59';
        const lastTimestamp =
          page.lastRunSummary?.timestamp || page.lastProcessedAt || null;
        const lastRunText = lastTimestamp
          ? formatDateTime(lastTimestamp)
          : 'ยังไม่เคยสแกน';
        const summary = page.lastRunSummary
          ? `ลูกค้าที่ตรวจ: ${page.lastRunSummary.processedUsers || 0} | ออเดอร์ใหม่: ${page.lastRunSummary.createdOrders || 0} | ออเดอร์ซ้ำ: ${page.lastRunSummary.duplicates || 0}`
          : 'ยังไม่มีสรุปรอบก่อน';

        return `
          <tr data-page-key="${escapeHtml(page.pageKey)}">
            <td>
              <div class="fw-semibold">${escapeHtml(page.name || '-')}</div>
              <div class="order-settings-meta">${escapeHtml(page.pageKey)}</div>
            </td>
            <td>
              <span class="badge bg-light text-dark">${escapeHtml(platformLabel)}</span>
            </td>
            <td>
              <input
                type="time"
                class="form-control form-control-sm cutoff-input"
                value="${escapeHtml(cutoffTime)}"
                data-page-key="${escapeHtml(page.pageKey)}"
              >
            </td>
            <td>
              <div>${escapeHtml(lastRunText)}</div>
            </td>
            <td>
              <div class="order-settings-summary">${escapeHtml(summary)}</div>
            </td>
            <td>
              <button
                type="button"
                class="btn btn-outline-primary btn-sm"
                data-action="save-cutoff"
                data-page-key="${escapeHtml(page.pageKey)}"
              >
                บันทึก
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function showSettingsStatus(message, type = 'info') {
    if (!pageSettingsStatus) return;
    if (settingsStatusTimeout) {
      clearTimeout(settingsStatusTimeout);
      settingsStatusTimeout = null;
    }

    if (!message) {
      pageSettingsStatus.style.display = 'none';
      return;
    }

    pageSettingsStatus.textContent = message;
    pageSettingsStatus.className = `alert alert-${type} small py-2 px-3 mt-3`;
    pageSettingsStatus.style.display = 'block';

    settingsStatusTimeout = setTimeout(() => {
      pageSettingsStatus.style.display = 'none';
      settingsStatusTimeout = null;
    }, 4000);
  }

  async function saveCutoff(pageKey, cutoffTime) {
    const payload = {
      pageKey,
      cutoffTime,
    };
    const response = await fetch('/admin/orders/pages/cutoff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error('ไม่สามารถบันทึกเวลาตัดรอบได้');
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'ไม่สามารถบันทึกเวลาตัดรอบได้');
    }
    return data.setting;
  }

  async function updateScheduling(enabled) {
    const response = await fetch('/admin/orders/settings/scheduling', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) {
      throw new Error('ไม่สามารถอัปเดตสถานะการสแกนได้');
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'ไม่สามารถอัปเดตสถานะการสแกนได้');
    }
    return data.enabled;
  }

  async function loadPageSettings() {
    if (!pageSelect && !pageSettingsBody && !cutoffToggle) {
      return;
    }

    try {
      if (pageSettingsBody) {
        pageSettingsBody.innerHTML =
          '<tr><td colspan="6" class="text-center text-muted py-4">กำลังโหลดข้อมูลเพจ...</td></tr>';
      }

      const response = await fetch('/admin/orders/pages');
      if (!response.ok) {
        throw new Error('ไม่สามารถโหลดข้อมูลเพจได้');
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'ไม่สามารถโหลดข้อมูลเพจได้');
      }

      orderPages = data.pages || [];
      pageLookup.clear();
      orderPages.forEach((page) => {
        pageLookup.set(page.pageKey, page);
      });

      populatePageFilter(orderPages);
      renderPageSettings(orderPages);

      if (cutoffToggle) {
        const enabled =
          typeof data.settings?.schedulingEnabled !== 'undefined'
            ? !!data.settings.schedulingEnabled
            : true;
        cutoffToggle.checked = enabled;
        cutoffToggle.disabled = false;
      }
    } catch (error) {
      console.error('[Orders] loadPageSettings error:', error);
      if (pageSettingsBody) {
        pageSettingsBody.innerHTML =
          '<tr><td colspan="6" class="text-center text-danger py-4">ไม่สามารถโหลดข้อมูลเพจได้</td></tr>';
      }
      showSettingsStatus(error.message || 'ไม่สามารถโหลดข้อมูลเพจได้', 'danger');
    }
  }

  function updateSummary(summary) {
    summaryTotalOrders.textContent = summary.totalOrders || 0;
    summaryTotalAmount.textContent = formatCurrency(summary.totalAmount || 0);
    summaryTotalShipping.textContent = formatCurrency(
      summary.totalShipping || 0,
    );
  }

  function updatePagination() {
    currentPageLabel.textContent = currentPage;
    totalPagesLabel.textContent = totalPages;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
  }

  function formatCurrency(value) {
    const number = Number(value) || 0;
    return `฿${number.toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function clearFilters() {
    statusSelect.value = 'all';
    startDateInput.value = '';
    endDateInput.value = '';
    todayOnlyCheckbox.checked = false;
    if (pageSelect) {
      pageSelect.value = 'all';
    }
    toggleDateInputs();
  }

  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    currentPage = 1;
    loadOrders(1);
  });

  clearButton.addEventListener('click', () => {
    clearFilters();
    currentPage = 1;
    loadOrders(1);
  });

  todayOnlyCheckbox.addEventListener('change', () => {
    toggleDateInputs();
  });

  if (pageSelect) {
    pageSelect.addEventListener('change', () => {
      currentPage = 1;
      loadOrders(1);
    });
  }

  if (pageSettingsBody) {
    pageSettingsBody.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="save-cutoff"]');
      if (!button) return;

      const pageKey = button.getAttribute('data-page-key');
      const row = button.closest('tr');
      const input = row ? row.querySelector('.cutoff-input') : null;
      const cutoffValue = input ? input.value : '';

      if (!pageKey) {
        showSettingsStatus('ไม่พบเพจที่ต้องการบันทึก', 'danger');
        return;
      }

      if (!cutoffValue) {
        showSettingsStatus('กรุณาเลือกเวลาตัดรอบก่อนบันทึก', 'warning');
        return;
      }

      const originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

      try {
        await saveCutoff(pageKey, cutoffValue);
        showSettingsStatus('บันทึกเวลาตัดรอบเรียบร้อยแล้ว', 'success');
        await loadPageSettings();
      } catch (error) {
        console.error('[Orders] saveCutoff error:', error);
        showSettingsStatus(error.message || 'ไม่สามารถบันทึกเวลาตัดรอบได้', 'danger');
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.innerHTML = originalHtml;
        }
      }
    });
  }

  if (cutoffToggle) {
    cutoffToggle.addEventListener('change', async () => {
      const enabled = cutoffToggle.checked;
      cutoffToggle.disabled = true;
      try {
        await updateScheduling(enabled);
        showSettingsStatus(
          enabled
            ? 'เปิดการสแกนอัตโนมัติสำหรับการสกัดออเดอร์แล้ว'
            : 'ปิดการสแกนอัตโนมัติสำหรับการสกัดออเดอร์แล้ว',
          'success',
        );
      } catch (error) {
        console.error('[Orders] updateScheduling error:', error);
        showSettingsStatus(error.message || 'ไม่สามารถอัปเดตสถานะการสแกนได้', 'danger');
        cutoffToggle.checked = !enabled;
      } finally {
        cutoffToggle.disabled = false;
      }
    });
  }

  prevPageBtn.addEventListener('click', () => {
    if (currentPage <= 1) return;
    loadOrders(currentPage - 1);
  });

  nextPageBtn.addEventListener('click', () => {
    if (currentPage >= totalPages) return;
    loadOrders(currentPage + 1);
  });

  exportButton.addEventListener('click', () => {
    const params = getQueryParams(1);
    params.delete('page');
    params.delete('limit');
    const url = `/admin/orders/export?${params.toString()}`;
    window.location.href = url;
  });

  async function initialize() {
    toggleDateInputs();
    await loadPageSettings();
    await loadOrders(1);
  }

  initialize();
});
