/* global bootstrap */

document.addEventListener("DOMContentLoaded", () => {
  const filterForm = document.getElementById("orderFilterForm");
  const statusTabs = document.getElementById("ordersStatusTabs");
  const statusSelect = document.getElementById("filterStatus");
  const pageSelect = document.getElementById("filterPage");
  const startDateInput = document.getElementById("filterStartDate");
  const endDateInput = document.getElementById("filterEndDate");
  const todayOnlyCheckbox = document.getElementById("filterTodayOnly");
  const searchInput = document.getElementById("filterSearch");
  const limitSelect = document.getElementById("filterLimit");
  const clearButton = document.getElementById("filterClearBtn");
  const exportButton = document.getElementById("exportOrdersBtn");
  const tableBody = document.getElementById("ordersTableBody");
  const table = document.getElementById("ordersTable");
  const loadingEl = document.getElementById("ordersLoading");
  const emptyStateEl = document.getElementById("ordersEmptyState");
  const emptyFiltersText = document.getElementById("ordersEmptyFilters");
  const emptyResetBtn = document.getElementById("ordersEmptyResetBtn");
  const paginationEl = document.getElementById("ordersPagination");
  const prevPageBtn = document.getElementById("ordersPrevPage");
  const nextPageBtn = document.getElementById("ordersNextPage");
  const currentPageLabel = document.getElementById("ordersCurrentPage");
  const totalPagesLabel = document.getElementById("ordersTotalPages");
  const resultsInfo = document.getElementById("ordersResultsInfo");
  const pageSizeToolbar = document.getElementById("ordersPageSizeToolbar");
  const densityToggle = document.getElementById("ordersDensityToggle");
  const summaryContext = document.getElementById("ordersSummaryContext");
  const selectAllCheckbox = document.getElementById("ordersSelectAll");
  const bulkActionsBar = document.getElementById("ordersBulkActions");
  const bulkExportButton = document.getElementById("ordersBulkExport");
  const bulkClearButton = document.getElementById("ordersBulkClear");
  const selectedCountLabel = document.getElementById("ordersSelectedCount");
  const tableHead = table ? table.querySelector("thead") : null;
  const tableWrapper = document.querySelector(".orders-table-wrapper");
  const addressModalEl = document.getElementById("orderAddressModal");
  const addressModalLabel = document.getElementById("orderAddressModalLabel");
  const addressContentEl = document.getElementById("orderAddressContent");
  const addressCopyBtn = document.getElementById("orderAddressCopyBtn");
  const addressModal =
    addressModalEl && typeof bootstrap !== "undefined" && bootstrap.Modal
      ? new bootstrap.Modal(addressModalEl, { backdrop: true })
      : null;

  const summaryTotalOrders = document.getElementById("summaryTotalOrders");
  const summaryTotalAmount = document.getElementById("summaryTotalAmount");
  const summaryTotalShipping = document.getElementById("summaryTotalShipping");
  const summaryAveragePerOrder = document.getElementById(
    "summaryAveragePerOrder",
  );
  const summaryTotalItems = document.getElementById("summaryTotalItems");
  const pageSettingsBody = document.getElementById("orderPageSettingsBody");
  const pageSettingsStatus = document.getElementById("orderPageSettingsStatus");
  const cutoffToggle = document.getElementById("orderCutoffToggle");

  let currentPage = 1;
  let totalPages = 1;
  let limit = Number(limitSelect?.value || pageSizeToolbar?.value || 50);
  let lastTotalItems = 0;
  let densityMode = "comfortable";
  let activeOrders = [];
  let supportsManualScan = false;

  let orderPages = [];
  const pageLookup = new Map();
  let settingsStatusTimeout = null;
  const selectedOrders = new Set();
  const ordersCache = new Map();
  const filtersStorageKey = "orders-dashboard.filters";
  const densityClassName = "orders-table-compact";
  const sortedHeaderClass = "sorted";

  const currentSort = {
    key: "extractedAt",
    direction: "desc",
  };

  const debouncedReload = debounce(() => {
    loadOrders(1);
  }, 350);

  const statusLabels = {
    pending: "รอดำเนินการ",
    confirmed: "ยืนยันแล้ว",
    shipped: "จัดส่งแล้ว",
    completed: "เสร็จสิ้น",
    cancelled: "ยกเลิก",
  };

  const platformLabels = {
    line: "LINE",
    facebook: "Facebook",
  };

  function toggleDateInputs() {
    const disabled = todayOnlyCheckbox.checked;
    startDateInput.disabled = disabled;
    endDateInput.disabled = disabled;
    if (disabled) {
      startDateInput.value = "";
      endDateInput.value = "";
    }
  }

  function getQueryParams(pageOverride) {
    const params = new URLSearchParams();
    const status = statusSelect.value;
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const todayOnly = todayOnlyCheckbox.checked;
    const pageKey = pageSelect ? pageSelect.value : "all";
    const query = searchInput ? searchInput.value.trim() : "";

    if (status && status !== "all") {
      params.append("status", status);
    }
    if (!todayOnly && startDate) {
      params.append("startDate", startDate);
    }
    if (!todayOnly && endDate) {
      params.append("endDate", endDate);
    }
    if (todayOnly) {
      params.append("todayOnly", "true");
    }
    if (pageKey && pageKey !== "all") {
      params.append("pageKey", pageKey);
    }
    if (query) {
      params.append("q", query);
    }

    const page = pageOverride || currentPage;
    params.append("page", page.toString());
    params.append("limit", limit.toString());

    return params;
  }

  async function loadOrders(pageOverride) {
    const params = getQueryParams(pageOverride);
    const url = `/admin/orders/data?${params.toString()}`;

    setLoading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("ไม่สามารถโหลดข้อมูลออเดอร์ได้");
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "ไม่สามารถโหลดข้อมูลออเดอร์ได้");
      }

      const pagination = data.pagination || {};
      const orders = Array.isArray(data.orders) ? data.orders : [];

      currentPage = Number(pagination.page) || 1;
      totalPages = Number(pagination.pages) || 1;
      lastTotalItems =
        Number(pagination.total) ||
        Number(pagination.totalItems) ||
        Number(pagination.totalCount) ||
        orders.length;

      activeOrders = orders;

      renderOrders(activeOrders);
      updateSummary(data.summary || {});
      updatePagination(pagination);
      updateSummaryContextUI();
      updateResultsInfo();
      updateEmptyStateContext();
    } catch (error) {
      console.error("[Orders] loadOrders error:", error);
      showEmptyState(true);
      tableBody.innerHTML =
        '<tr><td colspan="11" class="text-center text-danger">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
      paginationEl.style.display = "none";
      if (resultsInfo) {
        resultsInfo.textContent = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
      }
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    if (loadingEl) {
      loadingEl.style.display = isLoading ? "block" : "none";
    }
    if (resultsInfo && isLoading) {
      resultsInfo.textContent = "กำลังโหลดข้อมูล...";
    }
    if (isLoading) {
      if (emptyStateEl) {
        emptyStateEl.style.display = "none";
      }
      tableBody.innerHTML = "";
      updateSelectAllState();
      updateBulkActions();
    }
  }

  function showEmptyState(shouldShow) {
    if (!emptyStateEl) return;
    emptyStateEl.style.display = shouldShow ? "block" : "none";
    if (shouldShow) {
      tableBody.innerHTML = "";
      updateEmptyStateContext();
      updateSelectAllState();
      updateBulkActions();
    }
  }

  function renderOrders(orders) {
    const sortedOrders = getSortedOrders(orders);
    if (!sortedOrders.length) {
      tableBody.innerHTML = "";
      showEmptyState(true);
      paginationEl.style.display = "none";
      updateSelectAllState();
      updateBulkActions();
      return;
    }

    showEmptyState(false);
    paginationEl.style.display = totalPages > 1 ? "flex" : "none";

    ordersCache.clear();

    tableBody.innerHTML = sortedOrders
      .map((order, index) => {
        const orderId = getOrderId(order, index);
        ordersCache.set(orderId, order);
        const extractedAt = order.extractedAt
          ? formatDateTime(order.extractedAt)
          : "-";
        const customerName =
          order.customerName ||
          order.displayName ||
          order.userId ||
          order.customer ||
          "-";
        const customerMeta =
          order.customerPhone ||
          order.customerEmail ||
          order.userTag ||
          order.customerNote ||
          "";
        const pageLabel = getPageLabel(order);
        const platformKey = (order.platform || "").toLowerCase();
        const platformLabel =
          platformLabels[platformKey] || order.platform || "-";
        const platformIcon = getPlatformIcon(platformKey);
        const status = order.status || "pending";
        const itemsHtml = renderOrderItems(order.items || []);
        const shippingCost = formatCurrency(order.shippingCost || 0);
        const totalAmountFormatted = formatCurrency(order.totalAmount || 0);
        const payment = order.paymentMethod || order.paymentStatus || "-";
        const notes = order.notes ? escapeHtml(order.notes) : "-";
        const orderCode =
          order.orderNumber ||
          order.referenceId ||
          order.externalId ||
          order.orderId ||
          order.invoiceNumber ||
          "";
        const detailUrl =
          order.detailUrl ||
          order.orderUrl ||
          order.externalUrl ||
          order.conversationUrl ||
          "";
        const conversationUrl =
          order.chatUrl ||
          order.conversationUrl ||
          order.threadUrl ||
          order.messageUrl ||
          "";
        const addressData = getOrderAddress(order);
        const hasAddress = !!addressData?.plain;
        const isSelected = selectedOrders.has(orderId);

        return `
          <tr data-order-id="${escapeAttribute(orderId)}">
            <td class="col-select" data-label="เลือก">
              <input
                class="form-check-input order-select"
                type="checkbox"
                value="${escapeAttribute(orderId)}"
                ${isSelected ? "checked" : ""}
                aria-label="เลือกออเดอร์ ${escapeAttribute(orderId)}"
              >
            </td>
            <td data-label="วันที่">
              <div class="fw-semibold">${extractedAt}</div>
              ${
                orderCode
                  ? `<div class="order-meta-small text-muted">#${escapeHtml(
                      orderCode,
                    )}</div>`
                  : ""
              }
            </td>
            <td data-label="ลูกค้า">
              <div class="fw-semibold">${escapeHtml(customerName)}</div>
              ${
                customerMeta
                  ? `<div class="order-meta-small">${escapeHtml(
                      customerMeta,
                    )}</div>`
                  : ""
              }
            </td>
            <td data-label="เพจ / แพลตฟอร์ม">
              <div class="d-flex align-items-center gap-2">
                <span class="platform-icon ${platformKey}">
                  ${platformIcon}
                </span>
                <div>
                  <div class="fw-semibold">${escapeHtml(pageLabel)}</div>
                  <div class="order-meta-small">${escapeHtml(platformLabel)}</div>
                </div>
              </div>
            </td>
            <td data-label="รายการสินค้า">
              ${itemsHtml}
            </td>
            <td data-label="ค่าส่ง" class="text-end">${shippingCost}</td>
            <td data-label="ยอดรวม" class="text-end">
              <span class="fw-semibold">${totalAmountFormatted}</span>
              <button
                type="button"
                class="btn btn-link btn-sm text-decoration-none orders-action ms-2"
                data-action="copy-total"
                data-value="${escapeAttribute(order.totalAmount || 0)}"
                title="คัดลอกยอดรวม"
              >
                <i class="fas fa-copy"></i>
              </button>
            </td>
            <td data-label="การชำระเงิน">${escapeHtml(payment)}</td>
            <td data-label="สถานะ">
              ${renderStatusDropdown(orderId, status)}
            </td>
            <td data-label="หมายเหตุ">${notes}</td>
            <td data-label="การจัดการ" class="col-actions">
              <div class="d-flex flex-wrap gap-2">
                ${
                  hasAddress
                    ? `<button
                        type="button"
                        class="btn btn-outline-secondary btn-sm orders-action"
                        data-action="view-address"
                        data-order-id="${escapeAttribute(orderId)}"
                        data-address-html="${escapeAttribute(addressData.html)}"
                        data-address-plain="${escapeAttribute(addressData.plain)}"
                        data-customer="${escapeAttribute(customerName)}"
                      >
                        <i class="fas fa-map-marker-alt"></i>
                      </button>`
                    : ""
                }
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm orders-action"
                  data-action="copy-customer"
                  data-value="${escapeAttribute(customerName)}"
                  title="คัดลอกชื่อลูกค้า"
                >
                  <i class="fas fa-user"></i>
                </button>
                ${
                  orderCode
                    ? `<button
                        type="button"
                        class="btn btn-outline-secondary btn-sm orders-action"
                        data-action="copy-order"
                        data-value="${escapeAttribute(orderCode)}"
                        title="คัดลอกหมายเลขออเดอร์"
                      >
                        <i class="fas fa-hashtag"></i>
                      </button>`
                    : ""
                }
                ${
                  detailUrl
                    ? `<a
                        class="btn btn-outline-primary btn-sm"
                        href="${escapeAttribute(detailUrl)}"
                        target="_blank"
                        rel="noopener"
                        title="เปิดรายละเอียดออเดอร์"
                      >
                        <i class="fas fa-external-link-alt me-1"></i>ดู
                      </a>`
                    : ""
                }
                ${
                  conversationUrl
                    ? `<a
                        class="btn btn-primary btn-sm"
                        href="${escapeAttribute(conversationUrl)}"
                        target="_blank"
                        rel="noopener"
                        title="เปิดแชตกับลูกค้า"
                      >
                        <i class="fas fa-comments me-1"></i>แชต
                      </a>`
                    : ""
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    updateSelectAllState();
    updateBulkActions();
  }

  function renderOrderItems(items) {
    if (!items.length) {
      return '<span class="text-muted">-</span>';
    }

    const list = items
      .map((item) => {
        const name = escapeHtml(item.product || "-");
        const quantity = item.quantity || 0;
        const price = formatCurrency(item.price || 0);
        return `<div class="order-item-row"><span class="order-item-name">${name}</span> <span class="text-muted">x${quantity}</span> <span class="text-muted">@ ${price}</span></div>`;
      })
      .join("");

    return `<div class="order-items-list">${list}</div>`;
  }

  function renderStatusDropdown(orderId, currentStatus) {
    const currentLabel = statusLabels[currentStatus] || currentStatus;
    const availableStatuses = Object.entries(statusLabels);
    const hasCurrent = Object.prototype.hasOwnProperty.call(
      statusLabels,
      currentStatus,
    );
    const menuOptions = hasCurrent
      ? availableStatuses
      : [...availableStatuses, [currentStatus, currentLabel]];

    const options = menuOptions
      .map(([value, label]) => {
        const isActive = value === currentStatus;
        return `
          <li>
            <button
              type="button"
              class="dropdown-item orders-action orders-status-option${
                isActive ? " active" : ""
              }"
              data-action="change-status"
              data-order-id="${escapeAttribute(orderId)}"
              data-status="${escapeAttribute(value)}"
            >
              ${escapeHtml(label)}
            </button>
          </li>
        `;
      })
      .join("");

    return `
      <div class="dropdown">
        <button
          class="btn btn-sm status-badge ${currentStatus} dropdown-toggle orders-status-toggle"
          type="button"
          data-bs-toggle="dropdown"
          aria-expanded="false"
          data-order-id="${escapeAttribute(orderId)}"
        >
          ${escapeHtml(currentLabel)}
        </button>
        <ul class="dropdown-menu orders-status-menu">
          ${options}
        </ul>
      </div>
    `;
  }

  function getPageLabel(order) {
    if (!order) return "-";
    if (order.pageKey && pageLookup.has(order.pageKey)) {
      return pageLookup.get(order.pageKey).name || order.pageKey;
    }
    if (order.pageName) {
      return order.pageName;
    }
    if (order.botId) {
      const platformKey = (order.platform || "").toLowerCase();
      const platformLabel =
        platformLabels[platformKey] || order.platform || "เพจ";
      return `${platformLabel} (${order.botId})`;
    }
    return "-";
  }

  function getPlatformIcon(platformKey) {
    switch (platformKey) {
      case "line":
        return '<i class="fab fa-line text-success"></i>';
      case "facebook":
        return '<i class="fab fa-facebook text-primary"></i>';
      case "instagram":
        return '<i class="fab fa-instagram" style="color:#d62976"></i>';
      case "tiktok":
        return '<i class="fab fa-tiktok"></i>';
      default:
        return '<i class="fas fa-globe text-muted"></i>';
    }
  }

  function getOrderId(order, index = 0) {
    if (!order) return String(index);
    return (
      order._id ||
      order.id ||
      order.orderId ||
      order.orderNumber ||
      order.referenceId ||
      order.conversationId ||
      order.messageId ||
      order.uuid ||
      `${order.pageKey || "order"}-${index}`
    );
  }

  function getScanStatusMeta(timestamp) {
    if (!timestamp) {
      return { label: "ยังไม่เคยสแกน", className: "status-chip-muted" };
    }
    const parsed = new Date(timestamp);
    const timeValue = parsed.getTime();
    if (Number.isNaN(timeValue)) {
      return { label: "สถานะไม่ทราบ", className: "status-chip-muted" };
    }
    const diffMinutes = (Date.now() - timeValue) / 60000;
    if (diffMinutes <= 60) {
      return {
        label: "อัปเดตภายใน 1 ชั่วโมง",
        className: "status-chip-success",
      };
    }
    if (diffMinutes <= 24 * 60) {
      return { label: "อัปเดตภายใน 24 ชั่วโมง", className: "status-chip-info" };
    }
    return {
      label: "ไม่ได้อัปเดตเกิน 24 ชั่วโมง",
      className: "status-chip-warning",
    };
  }

  function getOrderAddress(order) {
    if (!order) return null;
    const segments = [];
    const seen = new Set();

    const pushSegment = (value) => {
      if (!value) return;
      const trimmed = String(value).trim();
      if (!trimmed) return;
      if (seen.has(trimmed)) return;
      seen.add(trimmed);
      segments.push(trimmed);
    };

    const addressObj =
      order.shippingAddress ||
      order.deliveryAddress ||
      order.address ||
      order.recipientAddress ||
      null;

    const addressText =
      order.shippingAddressText ||
      order.addressText ||
      order.fullAddress ||
      (typeof addressObj === "string" ? addressObj : "");

    pushSegment(
      order.shippingName || order.recipientName || order.customerName,
    );
    pushSegment(
      order.customerPhone || order.shippingPhone || order.recipientPhone,
    );

    if (addressObj && typeof addressObj === "object") {
      pushSegment(addressObj.name);
      pushSegment(addressObj.phone);
      pushSegment(addressObj.line1 || addressObj.addressLine1);
      pushSegment(addressObj.line2 || addressObj.addressLine2);
      pushSegment(addressObj.subDistrict || addressObj.subdistrict);
      pushSegment(addressObj.district);
      pushSegment(addressObj.city || addressObj.province || addressObj.state);
      pushSegment(
        addressObj.postalCode || addressObj.zip || addressObj.zipCode,
      );
      pushSegment(addressObj.country);
    }

    if (addressText) {
      pushSegment(addressText);
    }

    if (Array.isArray(order.addressLines)) {
      order.addressLines.forEach(pushSegment);
    }

    const parts = segments.filter(Boolean);
    if (!parts.length) {
      return null;
    }

    const plain = parts.join("\n");
    const html = parts.map((part) => escapeHtml(part)).join("<br>");

    return { plain, html };
  }

  function getSortedOrders(orders) {
    if (!Array.isArray(orders)) return [];
    if (!currentSort.key) return [...orders];
    const sorted = [...orders].sort((a, b) => {
      const aValue = getValueForSort(a, currentSort.key);
      const bValue = getValueForSort(b, currentSort.key);
      const result = compareValues(aValue, bValue);
      return currentSort.direction === "asc" ? result : -result;
    });
    updateSortIndicators();
    return sorted;
  }

  function getValueForSort(order, key) {
    if (!order) return null;
    switch (key) {
      case "extractedAt":
        return order.extractedAt ? new Date(order.extractedAt).getTime() : 0;
      case "customerName":
        return (
          order.customerName ||
          order.displayName ||
          order.userId ||
          order.customer ||
          ""
        );
      case "shippingCost":
        return Number(order.shippingCost) || 0;
      case "totalAmount":
        return Number(order.totalAmount) || 0;
      case "status":
        return order.status || "";
      default:
        return order[key] ?? "";
    }
  }

  function compareValues(a, b) {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    return String(a).localeCompare(String(b), "th-TH");
  }

  function updateSortIndicators() {
    if (!tableHead) return;
    const headers = Array.from(tableHead.querySelectorAll("th[data-sort-key]"));
    headers.forEach((th) => {
      const key = th.getAttribute("data-sort-key");
      const isActive = key === currentSort.key;
      th.classList.toggle(
        "sorted-asc",
        isActive && currentSort.direction === "asc",
      );
      th.classList.toggle(
        "sorted-desc",
        isActive && currentSort.direction === "desc",
      );
      th.classList.toggle(sortedHeaderClass, isActive);
    });
  }

  function populatePageFilter(pages) {
    if (!pageSelect) return;
    const previousValue = pageSelect.value || "all";
    pageSelect.innerHTML = '<option value="all">ทุกเพจ</option>';

    pages.forEach((page) => {
      const option = document.createElement("option");
      option.value = page.pageKey;
      const platformLabel =
        platformLabels[page.platform] || page.platform || "เพจ";
      option.textContent = `${page.name || page.pageKey} (${platformLabel})`;
      pageSelect.appendChild(option);
    });

    const hasPrevious = pages.some((page) => page.pageKey === previousValue);
    pageSelect.value = hasPrevious ? previousValue : "all";
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
          platformLabels[page.platform] || page.platform || "-";
        const cutoffTime = page.cutoffTime || "23:59";
        const lastTimestamp =
          page.lastRunSummary?.timestamp || page.lastProcessedAt || null;
        const lastRunText = lastTimestamp
          ? formatDateTime(lastTimestamp)
          : "ยังไม่เคยสแกน";
        const summary = page.lastRunSummary
          ? `ลูกค้าที่ตรวจ: ${page.lastRunSummary.processedUsers || 0} | ออเดอร์ใหม่: ${page.lastRunSummary.createdOrders || 0} | ออเดอร์ซ้ำ: ${page.lastRunSummary.duplicates || 0}`
          : "ยังไม่มีสรุปรอบก่อน";
        const scanMeta = getScanStatusMeta(lastTimestamp);

        return `
          <tr data-page-key="${escapeHtml(page.pageKey)}">
            <td data-label="เพจ/บอท">
              <div class="fw-semibold">${escapeHtml(page.name || "-")}</div>
              <div class="order-settings-meta">${escapeHtml(page.pageKey)}</div>
            </td>
            <td data-label="แพลตฟอร์ม">
              <span class="badge bg-light text-dark">${escapeHtml(platformLabel)}</span>
            </td>
            <td data-label="เวลาตัดรอบ">
              <input
                type="time"
                class="form-control form-control-sm cutoff-input"
                value="${escapeHtml(cutoffTime)}"
                data-page-key="${escapeHtml(page.pageKey)}"
              >
            </td>
            <td data-label="รอบล่าสุด">
              <div>${escapeHtml(lastRunText)}</div>
            </td>
            <td data-label="สรุปรอบก่อน">
              <div class="order-settings-summary">${escapeHtml(summary)}</div>
              <div class="mt-2">
                <span class="status-chip ${scanMeta.className}">${escapeHtml(scanMeta.label)}</span>
              </div>
            </td>
            <td data-label="การจัดการ">
              <div class="d-flex flex-column gap-2">
                ${
                  supportsManualScan
                    ? `<button
                        type="button"
                        class="btn btn-outline-success btn-sm"
                        data-action="trigger-scan"
                        data-page-key="${escapeHtml(page.pageKey)}"
                      >
                        สแกนตอนนี้
                      </button>`
                    : ""
                }
                <button
                  type="button"
                  class="btn btn-outline-primary btn-sm"
                  data-action="save-cutoff"
                  data-page-key="${escapeHtml(page.pageKey)}"
                >
                  บันทึก
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function showSettingsStatus(message, type = "info") {
    if (!pageSettingsStatus) return;
    if (settingsStatusTimeout) {
      clearTimeout(settingsStatusTimeout);
      settingsStatusTimeout = null;
    }

    if (!message) {
      pageSettingsStatus.style.display = "none";
      return;
    }

    pageSettingsStatus.textContent = message;
    pageSettingsStatus.className = `alert alert-${type} small py-2 px-3 mt-3`;
    pageSettingsStatus.style.display = "block";

    settingsStatusTimeout = setTimeout(() => {
      pageSettingsStatus.style.display = "none";
      settingsStatusTimeout = null;
    }, 4000);
  }

  async function saveCutoff(pageKey, cutoffTime) {
    const payload = {
      pageKey,
      cutoffTime,
    };
    const response = await fetch("/admin/orders/pages/cutoff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("ไม่สามารถบันทึกเวลาตัดรอบได้");
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "ไม่สามารถบันทึกเวลาตัดรอบได้");
    }
    return data.setting;
  }

  async function triggerScanNow(pageKey) {
    const response = await fetch("/admin/orders/pages/scan-now", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pageKey }),
    });
    if (!response.ok) {
      throw new Error("ไม่สามารถเริ่มการสแกนได้");
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "ไม่สามารถเริ่มการสแกนได้");
    }
    return data;
  }

  async function updateScheduling(enabled) {
    const response = await fetch("/admin/orders/settings/scheduling", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) {
      throw new Error("ไม่สามารถอัปเดตสถานะการสแกนได้");
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "ไม่สามารถอัปเดตสถานะการสแกนได้");
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

      const response = await fetch("/admin/orders/pages");
      if (!response.ok) {
        throw new Error("ไม่สามารถโหลดข้อมูลเพจได้");
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "ไม่สามารถโหลดข้อมูลเพจได้");
      }

      supportsManualScan = !!(
        data.settings?.supportsManualScan ||
        data.settings?.manualScanEnabled ||
        data.settings?.manualScanEndpoint
      );

      orderPages = data.pages || [];
      pageLookup.clear();
      orderPages.forEach((page) => {
        pageLookup.set(page.pageKey, page);
      });

      populatePageFilter(orderPages);
      renderPageSettings(orderPages);

      if (cutoffToggle) {
        const enabled =
          typeof data.settings?.schedulingEnabled !== "undefined"
            ? !!data.settings.schedulingEnabled
            : true;
        cutoffToggle.checked = enabled;
        cutoffToggle.disabled = false;
      }
    } catch (error) {
      console.error("[Orders] loadPageSettings error:", error);
      if (pageSettingsBody) {
        pageSettingsBody.innerHTML =
          '<tr><td colspan="6" class="text-center text-danger py-4">ไม่สามารถโหลดข้อมูลเพจได้</td></tr>';
      }
      showSettingsStatus(
        error.message || "ไม่สามารถโหลดข้อมูลเพจได้",
        "danger",
      );
    }
  }

  function updateSummary(summary) {
    const totalOrdersValue = Number(summary.totalOrders) || 0;
    const totalAmountValue = Number(summary.totalAmount) || 0;
    const averagePerOrder =
      totalOrdersValue > 0 ? totalAmountValue / totalOrdersValue : 0;
    const totalItemsValue =
      summary.totalItems || summary.totalProducts || summary.items || 0;

    summaryTotalOrders.textContent = totalOrdersValue.toLocaleString("th-TH");
    summaryTotalAmount.textContent = formatCurrency(totalAmountValue);
    summaryTotalShipping.textContent = formatCurrency(
      summary.totalShipping || 0,
    );
    if (summaryAveragePerOrder) {
      summaryAveragePerOrder.textContent = formatCurrency(averagePerOrder);
    }
    if (summaryTotalItems) {
      summaryTotalItems.textContent =
        Number(totalItemsValue).toLocaleString("th-TH");
    }
  }

  function updatePagination() {
    currentPageLabel.textContent = currentPage;
    totalPagesLabel.textContent = totalPages;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
  }

  function updateResultsInfo() {
    if (!resultsInfo) return;
    const displayedRows = tableBody
      ? tableBody.querySelectorAll("tr").length
      : 0;
    if (!displayedRows) {
      resultsInfo.textContent = "ไม่มีข้อมูลออเดอร์";
      return;
    }

    const startIndex = (currentPage - 1) * limit + 1;
    const endIndex = startIndex + displayedRows - 1;
    const total = lastTotalItems || displayedRows;

    const formatter = new Intl.NumberFormat("th-TH");
    resultsInfo.textContent = `แสดง ${formatter.format(
      startIndex,
    )} - ${formatter.format(endIndex)} จากทั้งหมด ${formatter.format(
      total,
    )} รายการ`;
  }

  function getFilterValues() {
    return {
      search: searchInput ? searchInput.value.trim() : "",
      startDate: startDateInput.value,
      endDate: endDateInput.value,
      status: statusSelect.value,
      pageKey: pageSelect ? pageSelect.value : "all",
      todayOnly: todayOnlyCheckbox.checked,
      limit,
      density: densityMode,
    };
  }

  function persistFilters() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        filtersStorageKey,
        JSON.stringify(getFilterValues()),
      );
    } catch (error) {
      console.warn("[Orders] persistFilters error:", error);
    }
  }

  function restoreFilters() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(filtersStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.search && searchInput) {
        searchInput.value = saved.search;
      }
      if (saved.startDate && startDateInput) {
        startDateInput.value = saved.startDate;
      }
      if (saved.endDate && endDateInput) {
        endDateInput.value = saved.endDate;
      }
      if (saved.status && statusSelect) {
        statusSelect.value = saved.status;
      }
      if (pageSelect && saved.pageKey) {
        pageSelect.value = saved.pageKey;
      }
      if (typeof saved.todayOnly === "boolean") {
        todayOnlyCheckbox.checked = saved.todayOnly;
      }
      if (saved.limit) {
        updateLimit(saved.limit, { triggerReload: false });
      }
      if (saved.density) {
        setDensityMode(saved.density, { skipPersist: true });
      }
    } catch (error) {
      console.warn("[Orders] restoreFilters error:", error);
    }
  }

  function buildFilterSummaryItems() {
    const filters = getFilterValues();
    const items = [];
    if (filters.todayOnly) {
      items.push("เฉพาะวันนี้");
    } else if (filters.startDate || filters.endDate) {
      const start = filters.startDate
        ? formatDateLabel(filters.startDate)
        : "ไม่ระบุ";
      const end = filters.endDate
        ? formatDateLabel(filters.endDate)
        : "ไม่ระบุ";
      items.push(`ช่วงวันที่ ${start} - ${end}`);
    }
    if (filters.status && filters.status !== "all") {
      items.push(statusLabels[filters.status] || filters.status);
    }
    if (filters.pageKey && filters.pageKey !== "all") {
      const pageInfo = pageLookup.get(filters.pageKey);
      items.push(pageInfo?.name || filters.pageKey);
    }
    if (filters.search) {
      items.push(`ค้นหา "${filters.search}"`);
    }
    if (filters.limit && Number(filters.limit) !== 50) {
      items.push(`ต่อหน้า ${filters.limit}`);
    }
    return items;
  }

  function updateSummaryContextUI() {
    if (!summaryContext) return;
    const items = buildFilterSummaryItems();
    if (!items.length) {
      summaryContext.innerHTML =
        '<span class="text-muted small">แสดงข้อมูลทั้งหมด</span>';
      return;
    }

    summaryContext.innerHTML = items
      .map(
        (item) =>
          `<span class="badge rounded-pill text-bg-light">${escapeHtml(item)}</span>`,
      )
      .join("");
  }

  function setActiveStatusTab(status) {
    if (!statusTabs) return;
    const targetStatus = status || "all";
    const buttons = Array.from(statusTabs.querySelectorAll(".nav-link"));
    buttons.forEach((button) => {
      const value = button.getAttribute("data-status");
      button.classList.toggle("active", value === targetStatus);
    });
  }

  function updateEmptyStateContext() {
    if (!emptyFiltersText) return;
    const items = buildFilterSummaryItems();
    emptyFiltersText.textContent = items.length
      ? `ตัวกรองที่ใช้: ${items.join(" • ")}`
      : "ไม่มีตัวกรองที่เลือก";
    if (emptyResetBtn) {
      emptyResetBtn.style.display = items.length ? "inline-flex" : "none";
    }
  }

  function updateSelectAllState() {
    if (!selectAllCheckbox) return;
    const checkboxes = tableBody
      ? Array.from(tableBody.querySelectorAll(".order-select"))
      : [];
    if (!checkboxes.length) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }
    const selectedInView = checkboxes.filter(
      (checkbox) => checkbox.checked,
    ).length;
    selectAllCheckbox.checked = selectedInView === checkboxes.length;
    selectAllCheckbox.indeterminate =
      selectedInView > 0 && selectedInView < checkboxes.length;
  }

  function updateBulkActions() {
    if (!bulkActionsBar || !selectedCountLabel) return;
    const count = selectedOrders.size;
    selectedCountLabel.textContent = count;
    bulkActionsBar.style.display = count ? "flex" : "none";
  }

  function getVisibleOrderIds() {
    if (!tableBody) return [];
    return Array.from(tableBody.querySelectorAll("tr[data-order-id]")).map(
      (row) => row.getAttribute("data-order-id"),
    );
  }

  function updateLimit(newLimit, { triggerReload = true } = {}) {
    const parsed = Number(newLimit) || 50;
    if (limit === parsed) {
      if (limitSelect && limitSelect.value !== String(parsed)) {
        limitSelect.value = String(parsed);
      }
      if (pageSizeToolbar && pageSizeToolbar.value !== String(parsed)) {
        pageSizeToolbar.value = String(parsed);
      }
      return;
    }
    limit = parsed;
    if (limitSelect && limitSelect.value !== String(parsed)) {
      limitSelect.value = String(parsed);
    }
    if (pageSizeToolbar && pageSizeToolbar.value !== String(parsed)) {
      pageSizeToolbar.value = String(parsed);
    }
    persistFilters();
    if (triggerReload) {
      handleFilterChange({ immediate: true });
    }
  }

  function setDensityMode(mode, { skipPersist = false } = {}) {
    densityMode = mode === "compact" ? "compact" : "comfortable";
    if (table) {
      table.classList.toggle(densityClassName, densityMode === "compact");
    }
    if (tableWrapper) {
      tableWrapper.classList.toggle(
        densityClassName,
        densityMode === "compact",
      );
    }
    if (densityToggle) {
      densityToggle.dataset.mode = densityMode;
      const icon = densityToggle.querySelector("i");
      const label = densityToggle.querySelector(".orders-density-label");
      if (icon) {
        icon.className =
          densityMode === "compact"
            ? "fas fa-grip-horizontal me-2"
            : "fas fa-arrows-alt-v me-2";
      }
      if (label) {
        label.textContent =
          densityMode === "compact" ? "แสดงแบบอ่านง่าย" : "แสดงแบบกะทัดรัด";
      }
    }
    if (!skipPersist) {
      persistFilters();
    }
  }

  function toggleDensityMode() {
    const nextMode = densityMode === "compact" ? "comfortable" : "compact";
    setDensityMode(nextMode);
  }

  function formatDateLabel(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }

  function formatCurrency(value) {
    const number = Number(value) || 0;
    return `฿${number.toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  function escapeAttribute(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function clearFilters() {
    statusSelect.value = "all";
    startDateInput.value = "";
    endDateInput.value = "";
    todayOnlyCheckbox.checked = false;
    if (searchInput) {
      searchInput.value = "";
    }
    if (pageSelect) {
      pageSelect.value = "all";
    }
    updateLimit(50, { triggerReload: false });
    setDensityMode("comfortable", { skipPersist: true });
    toggleDateInputs();
    setActiveStatusTab("all");
    selectedOrders.clear();
    persistFilters();
    updateSummaryContextUI();
    updateEmptyStateContext();
    updateBulkActions();
    updateSelectAllState();
  }

  function handleFilterChange({ immediate = false } = {}) {
    currentPage = 1;
    persistFilters();
    updateSummaryContextUI();
    updateEmptyStateContext();
    selectedOrders.clear();
    const checkboxes = tableBody.querySelectorAll(".order-select");
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    updateBulkActions();
    updateSelectAllState();
    if (immediate) {
      debouncedReload.cancel();
      loadOrders(1);
    } else {
      debouncedReload();
    }
  }

  filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentPage = 1;
    debouncedReload.cancel();
    loadOrders(1);
  });

  clearButton.addEventListener("click", () => {
    clearFilters();
    currentPage = 1;
    debouncedReload.cancel();
    loadOrders(1);
  });

  todayOnlyCheckbox.addEventListener("change", () => {
    toggleDateInputs();
    handleFilterChange();
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      handleFilterChange();
    });
  }

  if (pageSelect) {
    pageSelect.addEventListener("change", () => {
      handleFilterChange();
    });
  }

  statusSelect.addEventListener("change", () => {
    setActiveStatusTab(statusSelect.value);
    handleFilterChange();
  });

  if (statusTabs) {
    statusTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-status]");
      if (!button) return;
      event.preventDefault();
      const status = button.getAttribute("data-status");
      statusSelect.value = status || "all";
      setActiveStatusTab(status);
      handleFilterChange();
    });
  }

  if (limitSelect) {
    limitSelect.addEventListener("change", () => {
      updateLimit(limitSelect.value);
    });
  }

  if (pageSizeToolbar) {
    pageSizeToolbar.addEventListener("change", () => {
      updateLimit(pageSizeToolbar.value);
    });
  }

  if (densityToggle) {
    densityToggle.addEventListener("click", () => {
      toggleDensityMode();
    });
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", () => {
      const visibleIds = getVisibleOrderIds();
      const shouldSelectAll = selectAllCheckbox.checked;
      const checkboxes = tableBody.querySelectorAll(".order-select");
      checkboxes.forEach((checkbox) => {
        checkbox.checked = shouldSelectAll;
      });
      visibleIds.forEach((id) => {
        if (!id) return;
        if (shouldSelectAll) {
          selectedOrders.add(id);
        } else {
          selectedOrders.delete(id);
        }
      });
      updateSelectAllState();
      updateBulkActions();
    });
  }

  tableBody.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".order-select");
    if (!checkbox) return;
    const orderId = checkbox.value;
    if (!orderId) return;
    if (checkbox.checked) {
      selectedOrders.add(orderId);
    } else {
      selectedOrders.delete(orderId);
    }
    updateSelectAllState();
    updateBulkActions();
  });

  tableBody.addEventListener("click", async (event) => {
    const actionButton = event.target.closest(".orders-action");
    if (!actionButton) return;
    event.preventDefault();
    const action = actionButton.getAttribute("data-action");
    const value = actionButton.getAttribute("data-value");
    if (!action) return;

    switch (action) {
      case "copy-total":
      case "copy-customer":
      case "copy-order":
        if (value !== null) {
          try {
            await copyToClipboard(value);
            indicateActionSuccess(actionButton);
          } catch (error) {
            console.warn("[Orders] clipboard copy error:", error);
          }
        }
        break;
      case "view-address": {
        if (!addressModal || !addressContentEl) {
          console.warn("[Orders] address modal not ready");
          return;
        }
        const addressHtml =
          actionButton.getAttribute("data-address-html") || "";
        const addressPlain =
          actionButton.getAttribute("data-address-plain") || "";
        const customer = actionButton.getAttribute("data-customer") || "";
        if (addressModalLabel) {
          addressModalLabel.textContent = customer
            ? `ที่อยู่ของ ${customer}`
            : "ที่อยู่จัดส่ง";
        }
        if (!addressHtml && !addressPlain) {
          addressContentEl.innerHTML =
            '<span class="text-muted">ไม่พบที่อยู่สำหรับออเดอร์นี้</span>';
          if (addressCopyBtn) {
            addressCopyBtn.dataset.address = "";
            addressCopyBtn.disabled = true;
          }
          addressModal.show();
          return;
        }
        addressContentEl.innerHTML = addressHtml || escapeHtml(addressPlain);
        if (addressCopyBtn) {
          addressCopyBtn.dataset.address = addressPlain || "";
          addressCopyBtn.disabled = !addressPlain;
        }
        addressModal.show();
        break;
      }
      case "change-status": {
        const orderId = actionButton.getAttribute("data-order-id");
        const newStatus = actionButton.getAttribute("data-status");
        if (!orderId || !newStatus) return;
        await handleOrderStatusChange(actionButton, orderId, newStatus);
        break;
      }
      default:
        break;
    }
  });

  if (bulkExportButton) {
    bulkExportButton.addEventListener("click", () => {
      if (!selectedOrders.size) {
        exportButton.click();
        return;
      }
      const params = getQueryParams(1);
      params.delete("page");
      params.delete("limit");
      params.append("selectedIds", Array.from(selectedOrders).join(","));
      const url = `/admin/orders/export?${params.toString()}`;
      window.location.href = url;
    });
  }

  if (bulkClearButton) {
    bulkClearButton.addEventListener("click", () => {
      selectedOrders.clear();
      const checkboxes = tableBody.querySelectorAll(".order-select");
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
      updateSelectAllState();
      updateBulkActions();
    });
  }

  if (addressCopyBtn) {
    addressCopyBtn.addEventListener("click", async () => {
      const address = addressCopyBtn.dataset.address || "";
      if (!address) return;
      try {
        await copyToClipboard(address);
        indicateActionSuccess(addressCopyBtn);
      } catch (error) {
        console.warn("[Orders] copy address error:", error);
      }
    });
  }

  if (emptyResetBtn) {
    emptyResetBtn.addEventListener("click", () => {
      clearFilters();
      currentPage = 1;
      debouncedReload.cancel();
      loadOrders(1);
    });
  }

  if (tableHead) {
    tableHead.addEventListener("click", (event) => {
      const header = event.target.closest("th[data-sort-key]");
      if (!header) return;
      const sortKey = header.getAttribute("data-sort-key");
      if (!sortKey) return;
      if (currentSort.key === sortKey) {
        currentSort.direction =
          currentSort.direction === "asc" ? "desc" : "asc";
      } else {
        currentSort.key = sortKey;
        currentSort.direction = sortKey === "extractedAt" ? "desc" : "asc";
      }
      renderOrders(activeOrders);
    });
  }

  if (editForm) {
    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitOrderEdit();
    });
  }

  if (editModalEl) {
    editModalEl.addEventListener("hidden.bs.modal", () => {
      resetOrderEditModal({ keepFeedback: false });
      setEditLoading(false);
    });
  }

  if (pageSettingsBody) {
    pageSettingsBody.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const action = button.getAttribute("data-action");
      const pageKey = button.getAttribute("data-page-key");

      if (!pageKey) {
        showSettingsStatus("ไม่พบเพจที่เลือก", "danger");
        return;
      }

      switch (action) {
        case "save-cutoff": {
          const row = button.closest("tr");
          const input = row ? row.querySelector(".cutoff-input") : null;
          const cutoffValue = input ? input.value : "";

          if (!cutoffValue) {
            showSettingsStatus("กรุณาเลือกเวลาตัดรอบก่อนบันทึก", "warning");
            return;
          }

          const originalHtml = button.innerHTML;
          button.disabled = true;
          button.innerHTML =
            '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

          try {
            await saveCutoff(pageKey, cutoffValue);
            showSettingsStatus("บันทึกเวลาตัดรอบเรียบร้อยแล้ว", "success");
            await loadPageSettings();
          } catch (error) {
            console.error("[Orders] saveCutoff error:", error);
            showSettingsStatus(
              error.message || "ไม่สามารถบันทึกเวลาตัดรอบได้",
              "danger",
            );
          } finally {
            if (button.isConnected) {
              button.disabled = false;
              button.innerHTML = originalHtml;
            }
          }
          break;
        }
        case "trigger-scan": {
          if (!supportsManualScan) {
            showSettingsStatus(
              "ฟีเจอร์สแกนตอนนี้ยังไม่พร้อมใช้งานในระบบนี้",
              "info",
            );
            return;
          }
          const originalHtml = button.innerHTML;
          button.disabled = true;
          button.innerHTML =
            '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
          try {
            await triggerScanNow(pageKey);
            showSettingsStatus("เริ่มสแกนออเดอร์สำหรับเพจนี้แล้ว", "success");
            await loadPageSettings();
          } catch (error) {
            console.error("[Orders] triggerScan error:", error);
            showSettingsStatus(
              error.message || "ไม่สามารถเริ่มสแกนออเดอร์ได้",
              "danger",
            );
          } finally {
            if (button.isConnected) {
              button.disabled = false;
              button.innerHTML = originalHtml;
            }
          }
          break;
        }
        default:
          break;
      }
    });
  }

  if (cutoffToggle) {
    cutoffToggle.addEventListener("change", async () => {
      const enabled = cutoffToggle.checked;
      cutoffToggle.disabled = true;
      try {
        await updateScheduling(enabled);
        showSettingsStatus(
          enabled
            ? "เปิดการสแกนอัตโนมัติสำหรับการสกัดออเดอร์แล้ว"
            : "ปิดการสแกนอัตโนมัติสำหรับการสกัดออเดอร์แล้ว",
          "success",
        );
      } catch (error) {
        console.error("[Orders] updateScheduling error:", error);
        showSettingsStatus(
          error.message || "ไม่สามารถอัปเดตสถานะการสแกนได้",
          "danger",
        );
        cutoffToggle.checked = !enabled;
      } finally {
        cutoffToggle.disabled = false;
      }
    });
  }

  prevPageBtn.addEventListener("click", () => {
    if (currentPage <= 1) return;
    loadOrders(currentPage - 1);
  });

  nextPageBtn.addEventListener("click", () => {
    if (currentPage >= totalPages) return;
    loadOrders(currentPage + 1);
  });

  exportButton.addEventListener("click", () => {
    const params = getQueryParams(1);
    params.delete("page");
    params.delete("limit");
    const url = `/admin/orders/export?${params.toString()}`;
    window.location.href = url;
  });

  async function copyToClipboard(value) {
    const text = value === undefined || value === null ? "" : String(value);
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  function indicateActionSuccess(button) {
    if (!button) return;
    button.classList.add("orders-action-success");
    setTimeout(() => {
      if (button.isConnected) {
        button.classList.remove("orders-action-success");
      }
    }, 1200);
  }

  async function handleOrderStatusChange(triggerElement, orderId, newStatus) {
    const dropdown = triggerElement.closest(".dropdown");
    const toggleButton = dropdown
      ? dropdown.querySelector(".orders-status-toggle")
      : null;

    if (!toggleButton) {
      console.warn("[Orders] missing status toggle for order:", orderId);
      return;
    }

    if (toggleButton.dataset.loading === "true") {
      return;
    }

    const originalHtml = toggleButton.innerHTML;
    toggleButton.dataset.loading = "true";
    toggleButton.disabled = true;
    toggleButton.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

    try {
      const response = await fetch(`/admin/chat/orders/${orderId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "ไม่สามารถอัปเดตสถานะออเดอร์ได้");
      }

      if (data.order) {
        ordersCache.set(orderId, data.order);
      } else if (ordersCache.has(orderId)) {
        const existing = ordersCache.get(orderId);
        ordersCache.set(orderId, {
          ...existing,
          status: newStatus,
        });
      }

      await loadOrders(currentPage);
    } catch (error) {
      console.error("[Orders] handleOrderStatusChange error:", error);
      if (toggleButton.isConnected) {
        toggleButton.innerHTML = originalHtml;
        toggleButton.disabled = false;
      }
      alert(error.message || "ไม่สามารถอัปเดตสถานะออเดอร์ได้");
    } finally {
      if (toggleButton.isConnected) {
        toggleButton.dataset.loading = "false";
      }
    }
  }

  function debounce(fn, delay = 300) {
    let timeoutId;
    function debounced(...args) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        fn.apply(this, args);
      }, delay);
    }
    debounced.cancel = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    return debounced;
  }

  async function initialize() {
    setDensityMode(densityMode, { skipPersist: true });
    restoreFilters();
    toggleDateInputs();
    setActiveStatusTab(statusSelect.value);
    updateSummaryContextUI();
    updateEmptyStateContext();
    if (limitSelect) {
      limitSelect.value = String(limit);
    }
    if (pageSizeToolbar) {
      pageSizeToolbar.value = String(limit);
    }
    await loadPageSettings();
    await loadOrders(1);
  }

  initialize();
});
