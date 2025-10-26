document.addEventListener('DOMContentLoaded', () => {
  const filterForm = document.getElementById('orderFilterForm');
  const statusSelect = document.getElementById('filterStatus');
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

  let currentPage = 1;
  let totalPages = 1;
  const limit = 50;

  const statusLabels = {
    pending: 'รอดำเนินการ',
    confirmed: 'ยืนยันแล้ว',
    shipped: 'จัดส่งแล้ว',
    completed: 'เสร็จสิ้น',
    cancelled: 'ยกเลิก',
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
        '<tr><td colspan="9" class="text-center text-danger">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
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
        const customerName = order.displayName || order.userId || '-';
        const platform = order.platform || '-';
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
            <td data-label="แพลตฟอร์ม">${escapeHtml(platform)}</td>
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

  // Initial state
  toggleDateInputs();
  loadOrders(1);
});
