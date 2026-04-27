/* ================================================================
   Admin Forms - submissions dashboard
   ================================================================ */

(function () {
  "use strict";

  const DEFAULT_STATUSES = [
    { key: "draft", label: "Draft" },
    { key: "submitted", label: "Submitted" },
  ];

  const state = {
    forms: [],
    inboxes: [],
    submissions: [],
    currentFormId: "all",
    selectedInboxKeys: [],
    filters: {
      status: "all",
      search: "",
      startDate: "",
      endDate: "",
      quickDate: "",
    },
    metrics: { total: 0, statuses: {} },
    pagination: { page: 1, limit: 50, total: 0, pages: 1 },
    sort: { column: "createdAt", direction: "desc" },
    loading: false,
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    restoreInitialState();
    loadForms();
  }

  function cacheElements() {
    els.summaryGrid = document.getElementById("formsSummaryGrid");
    els.formsList = document.getElementById("formsList");
    els.formsCountBadge = document.getElementById("formsCountBadge");
    els.inboxList = document.getElementById("formsInboxList");
    els.inboxCountBadge = document.getElementById("formsInboxCountBadge");
    els.statusList = document.getElementById("formsStatusList");
    els.startDate = document.getElementById("formsStartDate");
    els.endDate = document.getElementById("formsEndDate");
    els.searchInput = document.getElementById("formsSearchInput");
    els.currentMeta = document.getElementById("formsCurrentMeta");
    els.tableHead = document.getElementById("formsTableHead");
    els.tableBody = document.getElementById("formsTableBody");
    els.pagination = document.getElementById("formsPagination");
    els.paginationInfo = document.getElementById("formsPaginationInfo");
    els.paginationControls = document.getElementById("formsPaginationControls");
    els.refreshBtn = document.getElementById("formsRefreshBtn");
    els.exportBtn = document.getElementById("formsExportBtn");
    els.exportFormat = document.getElementById("formsExportFormat");
    els.createLink = document.getElementById("formsCreateLink");
    els.detailOverlay = document.getElementById("formsDetailOverlay");
    els.detailPanel = document.getElementById("formsDetailPanel");
    els.detailClose = document.getElementById("formsDetailClose");
    els.detailTitle = document.getElementById("formsDetailTitle");
    els.detailKicker = document.getElementById("formsDetailKicker");
    els.detailBody = document.getElementById("formsDetailBody");
  }

  function bindEvents() {
    applyPermissionVisibility();
    els.refreshBtn?.addEventListener("click", () => loadForms());
    els.exportBtn?.addEventListener("click", exportSubmissions);
    els.startDate?.addEventListener("change", handleDateFilterChange);
    els.endDate?.addEventListener("change", handleDateFilterChange);
    els.searchInput?.addEventListener("input", debounce(handleSearch, 280));

    document.querySelectorAll(".forms-quick-dates button").forEach((button) => {
      button.addEventListener("click", () => applyQuickDate(button.dataset.range || ""));
    });

    els.formsList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-form-id]");
      if (!button) return;
      selectForm(button.dataset.formId || "all");
    });

    els.inboxList?.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-inbox-key]");
      if (!checkbox) return;
      handleInboxSelection(checkbox.dataset.inboxKey || "", checkbox.checked);
    });

    els.statusList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-status]");
      if (!button) return;
      state.filters.status = button.dataset.status || "all";
      state.pagination.page = 1;
      renderStatusList();
      loadSubmissions();
    });

    els.tableHead?.addEventListener("click", (event) => {
      const th = event.target.closest("th.sortable");
      if (!th) return;
      handleSort(th.dataset.sort || "createdAt");
    });

    els.tableBody?.addEventListener("click", (event) => {
      const detailButton = event.target.closest("[data-detail-btn]");
      if (detailButton) {
        openDetail(detailButton.dataset.detailBtn || "");
        return;
      }
      if (event.target.closest("a, button, select")) return;
      const row = event.target.closest("tr[data-submission-id]");
      if (!row) return;
      openDetail(row.dataset.submissionId || "");
    });

    els.tableBody?.addEventListener("change", (event) => {
      const select = event.target.closest("[data-status-select]");
      if (!select) return;
      updateSubmissionStatus(select.dataset.statusSelect || "", select.value);
    });

    els.paginationControls?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      const page = Number.parseInt(button.dataset.page, 10);
      if (!Number.isInteger(page) || page < 1 || page === state.pagination.page) return;
      state.pagination.page = page;
      loadSubmissions();
    });

    els.detailOverlay?.addEventListener("click", (event) => {
      if (event.target === els.detailOverlay) closeDetail();
    });
    els.detailClose?.addEventListener("click", closeDetail);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDetail();
    });
  }

  function canAdmin(permission) {
    if (!permission) return true;
    const user = window.adminAuth?.user || null;
    if (!user) return true;
    if (user.role === "superadmin") return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
  }

  function applyPermissionVisibility() {
    const canExport = canAdmin("data-forms:export");
    if (els.exportBtn) els.exportBtn.hidden = !canExport;
    if (els.exportFormat) els.exportFormat.hidden = !canExport;
    if (els.createLink) els.createLink.hidden = !canAdmin("data-forms:manage");
  }

  function restoreInitialState() {
    const params = new URLSearchParams(window.location.search);
    const formId = params.get("formId");
    if (formId) state.currentFormId = formId;
    const inboxKeys = params.get("inboxKeys");
    if (inboxKeys) {
      state.selectedInboxKeys = inboxKeys
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);
    }
  }

  async function loadForms(options = {}) {
    setWorkspaceLoading(true);
    try {
      if (!options.skipInboxLoad) {
        await loadInboxes();
      }
      const data = await fetchJson(`/admin/api/data-forms?${buildFormsParams().toString()}`);
      state.forms = Array.isArray(data.forms) ? data.forms : [];
      if (state.currentFormId !== "all" && !state.forms.some((form) => form.id === state.currentFormId)) {
        state.currentFormId = "all";
      }
      renderFormsList();
      renderInboxList();
      renderStatusList();
      renderSummary();
      renderCurrentMeta();
      if (options.reloadSubmissions !== false) {
        await loadSubmissions();
      }
    } catch (error) {
      console.error("[Forms] load forms failed:", error);
      renderFatalState("โหลดฟอร์มไม่สำเร็จ");
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function loadInboxes() {
    const data = await fetchJson("/admin/forms/inboxes?limit=500");
    state.inboxes = Array.isArray(data.inboxes) ? data.inboxes : [];
    const available = new Set(state.inboxes.map((inbox) => inbox.inboxKey).filter(Boolean));
    state.selectedInboxKeys = state.selectedInboxKeys.filter((key) => available.has(key));
    renderInboxList();
  }

  function buildFormsParams() {
    const params = new URLSearchParams({
      includeInactive: "true",
      includeSubmissionCounts: "true",
    });
    if (state.selectedInboxKeys.length) {
      params.set("inboxKeys", state.selectedInboxKeys.join(","));
    }
    return params;
  }

  async function loadSubmissions() {
    if (state.loading) return;
    state.loading = true;
    renderTableLoading();
    try {
      const params = buildSubmissionParams();
      const data = await fetchJson(`/admin/api/data-form-submissions?${params.toString()}`);
      state.submissions = Array.isArray(data.submissions) ? data.submissions : [];
      state.metrics = data.metrics || { total: state.submissions.length, statuses: {} };
      state.pagination = data.pagination || {
        page: state.pagination.page,
        limit: state.pagination.limit,
        total: state.submissions.length,
        pages: 1,
      };
      renderSummary();
      renderStatusList();
      renderCurrentMeta();
      renderTable();
      renderPagination();
      updateUrlState();
    } catch (error) {
      console.error("[Forms] load submissions failed:", error);
      renderTableError("โหลด submissions ไม่สำเร็จ");
    } finally {
      state.loading = false;
    }
  }

  function buildSubmissionParams(extra = {}) {
    const params = new URLSearchParams();
    if (state.currentFormId !== "all") params.set("formId", state.currentFormId);
    if (state.selectedInboxKeys.length) params.set("inboxKeys", state.selectedInboxKeys.join(","));
    if (state.filters.status !== "all") params.set("status", state.filters.status);
    if (state.filters.search) params.set("search", state.filters.search);
    if (state.filters.startDate) params.set("startDate", state.filters.startDate);
    if (state.filters.endDate) params.set("endDate", state.filters.endDate);
    params.set("page", String(state.pagination.page));
    params.set("limit", String(state.pagination.limit));
    params.set("sortBy", state.sort.column);
    params.set("sortDir", state.sort.direction);
    Object.entries(extra).forEach(([key, value]) => {
      if (value === null || typeof value === "undefined" || value === "") {
        params.delete(key);
        return;
      }
      params.set(key, String(value));
    });
    return params;
  }

  function selectForm(formId) {
    state.currentFormId = formId || "all";
    state.filters.status = "all";
    state.pagination.page = 1;
    renderFormsList();
    renderStatusList();
    renderCurrentMeta();
    loadSubmissions();
  }

  function handleInboxSelection(inboxKey, checked) {
    if (inboxKey === "all") {
      state.selectedInboxKeys = [];
    } else if (state.selectedInboxKeys.length === 0) {
      const allKeys = state.inboxes.map((inbox) => inbox.inboxKey).filter(Boolean);
      state.selectedInboxKeys = checked
        ? allKeys
        : allKeys.filter((key) => key !== inboxKey);
    } else {
      const next = new Set(state.selectedInboxKeys);
      if (checked) {
        next.add(inboxKey);
      } else {
        next.delete(inboxKey);
      }
      state.selectedInboxKeys = Array.from(next);
      if (state.selectedInboxKeys.length === state.inboxes.length) {
        state.selectedInboxKeys = [];
      }
    }
    state.currentFormId = "all";
    state.filters.status = "all";
    state.pagination.page = 1;
    renderInboxList();
    loadForms({ skipInboxLoad: true });
  }

  function handleSearch() {
    state.filters.search = els.searchInput?.value.trim() || "";
    state.pagination.page = 1;
    loadSubmissions();
  }

  function handleDateFilterChange() {
    state.filters.startDate = els.startDate?.value || "";
    state.filters.endDate = els.endDate?.value || "";
    state.filters.quickDate = "";
    document.querySelectorAll(".forms-quick-dates button").forEach((button) => {
      button.classList.remove("is-active");
    });
    state.pagination.page = 1;
    loadSubmissions();
  }

  function applyQuickDate(range) {
    const dateRange = getQuickDateRange(range);

    state.filters.quickDate = range;
    state.filters.startDate = dateRange.startDate;
    state.filters.endDate = dateRange.endDate;
    if (els.startDate) els.startDate.value = state.filters.startDate;
    if (els.endDate) els.endDate.value = state.filters.endDate;
    document.querySelectorAll(".forms-quick-dates button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.range === range);
    });
    state.pagination.page = 1;
    loadSubmissions();
  }

  function handleSort(column) {
    if (state.sort.column === column) {
      state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
    } else {
      state.sort.column = column;
      state.sort.direction = column === "formName" || column === "status" ? "asc" : "desc";
    }
    state.pagination.page = 1;
    loadSubmissions();
  }

  function renderSummary() {
    if (!els.summaryGrid) return;
    const totalForms = state.forms.length;
    const activeForms = state.forms.filter((form) => form.isActive !== false).length;
    const totalSubmissions = state.forms.reduce((sum, form) => sum + Number(form.metrics?.total || 0), 0);
    const currentForm = getCurrentForm();
    const currentFields = currentForm
      ? (Array.isArray(currentForm.fields) ? currentForm.fields.length : 0)
      : state.forms.reduce((sum, form) => sum + (Array.isArray(form.fields) ? form.fields.length : 0), 0);
    const submittedCount = Number(state.metrics?.statuses?.submitted || 0);
    const scopeLabel = getInboxSelectionLabel();

    const cards = [
      { label: "ฟอร์มที่ใช้งาน", value: `${formatNumber(activeForms)}/${formatNumber(totalForms)}`, icon: "fa-clipboard-list", tone: "" },
      { label: "Submissions ทั้งหมด", value: formatNumber(totalSubmissions), icon: "fa-layer-group", tone: "is-info" },
      { label: "ในมุมมองนี้", value: formatNumber(state.pagination.total || state.metrics.total || 0), icon: "fa-filter", tone: "is-warning" },
      { label: "Submitted", value: formatNumber(submittedCount), icon: "fa-check-circle", tone: "is-success" },
    ];

    els.summaryGrid.innerHTML = cards.map((card) => `
      <article class="forms-summary-card ${card.tone}">
        <div class="forms-summary-card__icon"><i class="fas ${card.icon}"></i></div>
        <div>
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </div>
      </article>
    `).join("") + `
      <div class="forms-summary-strip">
        <span><i class="fas fa-list-check"></i> ${formatNumber(currentFields)} fields</span>
        <span><i class="fas fa-layer-group"></i> ${escapeHtml(scopeLabel)}</span>
      </div>
    `;
  }

  function renderFormsList() {
    if (!els.formsList) return;
    if (els.formsCountBadge) els.formsCountBadge.textContent = formatNumber(state.forms.length);
    const totalSubmissions = state.forms.reduce((sum, form) => sum + Number(form.metrics?.total || 0), 0);
    const allButton = renderFormButton({
      id: "all",
      name: "ทุกฟอร์ม",
      description: "รวมทุก submission",
      metrics: { total: totalSubmissions },
      isActive: true,
    }, state.currentFormId === "all");
    const formButtons = state.forms.length
      ? state.forms.map((form) => renderFormButton(form, state.currentFormId === form.id)).join("")
      : `<div class="forms-list-empty"><i class="fas fa-clipboard-list"></i><span>ยังไม่มีฟอร์ม</span></div>`;
    els.formsList.innerHTML = allButton + formButtons;
  }

  function renderInboxList() {
    if (!els.inboxList) return;
    if (els.inboxCountBadge) {
      els.inboxCountBadge.textContent = formatNumber(getActiveInboxKeys().length);
    }
    if (!state.inboxes.length) {
      els.inboxList.innerHTML = `
        <div class="forms-page-empty">
          <i class="fas fa-inbox"></i>
          <span>ไม่มีเพจ/บอทที่เข้าถึงได้</span>
        </div>
      `;
      return;
    }
    const isAll = state.selectedInboxKeys.length === 0;
    const allRow = `
      <label class="forms-page-option ${isAll ? "is-active" : ""}">
        <input type="checkbox" data-inbox-key="all" ${isAll ? "checked" : ""}>
        <span class="forms-page-option__icon"><i class="fas fa-layer-group"></i></span>
        <span class="forms-page-option__text">
          <strong>ทั้งหมดที่มีสิทธิ์</strong>
          <small>${formatNumber(state.inboxes.length)} เพจ/บอท</small>
        </span>
      </label>
    `;
    const rows = state.inboxes.map((inbox) => {
      const checked = isAll || state.selectedInboxKeys.includes(inbox.inboxKey);
      return `
        <label class="forms-page-option ${checked ? "is-active" : ""}">
          <input type="checkbox" data-inbox-key="${escapeAttr(inbox.inboxKey)}" ${checked ? "checked" : ""}>
          <span class="forms-page-option__icon"><i class="fas ${platformIcon(inbox.platform)}"></i></span>
          <span class="forms-page-option__text">
            <strong>${escapeHtml(inbox.botName || inbox.channelLabel || inbox.inboxKey)}</strong>
            <small>${escapeHtml(inbox.platformLabel || formatPlatform(inbox.platform, ""))}</small>
          </span>
        </label>
      `;
    }).join("");
    els.inboxList.innerHTML = allRow + rows;
  }

  function renderFormButton(form, isActive) {
    const fieldCount = Array.isArray(form.fields) ? form.fields.length : 0;
    const latestAt = form.metrics?.latestAt ? dateOnly(form.metrics.latestAt) : "";
    const description = form.id === "all"
      ? form.description
      : `${fieldCount} fields${latestAt ? ` · ล่าสุด ${latestAt}` : ""}`;
    return `
      <button type="button" class="forms-list-btn ${isActive ? "is-active" : ""}" data-form-id="${escapeAttr(form.id)}">
        <span class="forms-list-btn__main">
          <span class="forms-dot ${form.isActive === false ? "is-cancelled" : ""}"></span>
          <span class="forms-list-btn__name">
            <strong>${escapeHtml(form.name || "Data Form")}</strong>
            <span>${escapeHtml(description || "-")}</span>
          </span>
        </span>
        <span class="forms-list-btn__count">${formatNumber(form.metrics?.total || 0)}</span>
      </button>
    `;
  }

  function renderStatusList() {
    if (!els.statusList) return;
    const statuses = getCurrentStatuses();
    const allCount = getCurrentFormMetricTotal();
    const buttons = [
      `<button type="button" class="forms-status-btn ${state.filters.status === "all" ? "is-active" : ""}" data-status="all">
        <span class="forms-status-btn__main"><span class="forms-dot"></span><strong>ทั้งหมด</strong></span>
        <span class="forms-status-btn__count">${formatNumber(allCount)}</span>
      </button>`,
      ...statuses.map((status) => `
        <button type="button" class="forms-status-btn ${state.filters.status === status.key ? "is-active" : ""}" data-status="${escapeAttr(status.key)}">
          <span class="forms-status-btn__main"><span class="forms-dot ${statusClass(status.key)}"></span><strong>${escapeHtml(status.label || status.key)}</strong></span>
          <span class="forms-status-btn__count">${formatNumber(getStatusMetric(status.key))}</span>
        </button>
      `),
    ];
    els.statusList.innerHTML = buttons.join("");
  }

  function renderCurrentMeta() {
    if (!els.currentMeta) return;
    const form = getCurrentForm();
    const title = form ? form.name : "ทุกฟอร์ม";
    const fieldText = form
      ? `${(form.fields || []).length} fields · ${formatNumber(form.metrics?.total || 0)} submissions`
      : `${formatNumber(state.forms.length)} forms · ${formatNumber(state.pagination.total || 0)} submissions · ${getInboxSelectionLabel()}`;
    els.currentMeta.innerHTML = `
      <span class="forms-current__icon"><i class="fas fa-clipboard-list"></i></span>
      <span class="forms-current__text">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(fieldText)}</span>
      </span>
    `;
  }

  function renderTableLoading() {
    if (!els.tableBody || !els.tableHead) return;
    renderTableHead();
    els.tableBody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="forms-empty"><div><i class="fas fa-circle-notch fa-spin"></i><strong>กำลังโหลด</strong></div></div>
        </td>
      </tr>
    `;
  }

  function renderTableError(message) {
    if (!els.tableBody || !els.tableHead) return;
    renderTableHead();
    els.tableBody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="forms-empty"><div><i class="fas fa-triangle-exclamation"></i><strong>${escapeHtml(message)}</strong></div></div>
        </td>
      </tr>
    `;
  }

  function renderFatalState(message) {
    if (els.formsList) els.formsList.innerHTML = `<div class="forms-empty"><div><i class="fas fa-triangle-exclamation"></i><strong>${escapeHtml(message)}</strong></div></div>`;
    renderTableError(message);
  }

  function renderTable() {
    renderTableHead();
    if (!els.tableBody) return;
    if (!state.submissions.length) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="12">
            <div class="forms-empty"><div><i class="fas fa-inbox"></i><strong>ยังไม่มี submissions</strong></div></div>
          </td>
        </tr>
      `;
      return;
    }
    els.tableBody.innerHTML = state.submissions.map(renderSubmissionRow).join("");
  }

  function renderTableHead() {
    if (!els.tableHead) return;
    const form = getCurrentForm();
    const fieldColumns = form ? getVisibleFields(form) : [];
    const sortIcon = (column) => {
      if (state.sort.column !== column) return '<i class="fas fa-sort"></i>';
      return state.sort.direction === "asc" ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
    };
    const dynamicHeaders = form
      ? fieldColumns.map((field) => `<th title="${escapeAttr(field.label || field.key)}">${escapeHtml(field.label || field.key)}</th>`).join("")
      : '<th class="sortable" data-sort="formName">ฟอร์ม ' + sortIcon("formName") + '</th><th>Summary</th>';

    els.tableHead.innerHTML = `
      <tr>
        <th class="sortable" data-sort="createdAt">วันที่ ${sortIcon("createdAt")}</th>
        ${dynamicHeaders}
        <th class="sortable" data-sort="status">สถานะ ${sortIcon("status")}</th>
        <th>ลูกค้า</th>
        <th>Agent</th>
        <th style="width: 150px;">จัดการ</th>
      </tr>
    `;
  }

  function renderSubmissionRow(submission) {
    const form = findForm(submission.formId);
    const fields = getCurrentForm() ? getVisibleFields(form) : [];
    const dynamicCells = getCurrentForm()
      ? fields.map((field) => `<td>${renderFieldValue(submission.values?.[field.key])}</td>`).join("")
      : `
        <td>
          <span class="forms-cell-main">
            <strong>${escapeHtml(submission.formName || form?.name || "Data Form")}</strong>
            <span>${escapeHtml((form?.fields || []).length ? `${form.fields.length} fields` : submission.formId || "-")}</span>
          </span>
        </td>
        <td><span class="forms-field-value">${escapeHtml(submission.summary || "-")}</span></td>
      `;
    return `
      <tr data-submission-id="${escapeAttr(submission.id)}">
        <td>
          <span class="forms-cell-main">
            <strong>${escapeHtml(dateOnly(submission.createdAt))}</strong>
            <span>${escapeHtml(timeOnly(submission.createdAt))}</span>
          </span>
        </td>
        ${dynamicCells}
        <td>${renderStatusSelect(submission, form)}</td>
        <td>
          <span class="forms-cell-main">
            <strong>${escapeHtml(submission.userId || "-")}</strong>
            <span>${escapeHtml(formatPlatform(submission.platform, submission.botId))}</span>
          </span>
        </td>
        <td>${escapeHtml(submission.latestActor || submission.source || "-")}</td>
        <td>
          <span class="forms-row-actions">
            <a class="forms-row-link" href="${escapeAttr(buildChatUrl(submission))}" title="เปิดแชท" aria-label="เปิดแชท">
              <i class="fas fa-comments"></i>
            </a>
            <button type="button" class="forms-row-link" data-detail-btn="${escapeAttr(submission.id)}" title="รายละเอียด" aria-label="รายละเอียด">
              <i class="fas fa-eye"></i>
            </button>
          </span>
        </td>
      </tr>
    `;
  }

  function renderStatusSelect(submission, form) {
    const statuses = getStatusesForForm(form);
    const hasStatus = statuses.some((status) => status.key === submission.status);
    const finalStatuses = hasStatus
      ? statuses
      : [{ key: submission.status, label: submission.status }, ...statuses];
    return `
      <select class="forms-status-select ${statusClass(submission.status)}" data-status-select="${escapeAttr(submission.id)}" aria-label="สถานะ">
        ${finalStatuses.map((status) => `
          <option value="${escapeAttr(status.key)}" ${status.key === submission.status ? "selected" : ""}>${escapeHtml(status.label || status.key)}</option>
        `).join("")}
      </select>
    `;
  }

  function renderFieldValue(value) {
    if (value === null || typeof value === "undefined" || value === "") {
      return '<span class="forms-field-empty">-</span>';
    }
    return `<span class="forms-field-value">${escapeHtml(formatSubmissionValue(value))}</span>`;
  }

  function renderPagination() {
    if (!els.paginationInfo || !els.paginationControls) return;
    const { page, limit, total, pages } = state.pagination;
    const start = total > 0 ? ((page - 1) * limit) + 1 : 0;
    const end = Math.min(page * limit, total);
    els.paginationInfo.textContent = `${formatNumber(start)}-${formatNumber(end)} จาก ${formatNumber(total)} รายการ`;

    const pageNumbers = buildPageNumbers(page, pages);
    const buttons = [
      `<button type="button" class="forms-page-btn" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""} aria-label="ก่อนหน้า"><i class="fas fa-chevron-left"></i></button>`,
      ...pageNumbers.map((pageNumber) => (
        pageNumber === "gap"
          ? '<span class="forms-page-gap">...</span>'
          : `<button type="button" class="forms-page-btn ${pageNumber === page ? "is-active" : ""}" data-page="${pageNumber}">${pageNumber}</button>`
      )),
      `<button type="button" class="forms-page-btn" data-page="${page + 1}" ${page >= pages ? "disabled" : ""} aria-label="ถัดไป"><i class="fas fa-chevron-right"></i></button>`,
    ];
    els.paginationControls.innerHTML = buttons.join("");
  }

  function openDetail(submissionId) {
    const submission = state.submissions.find((item) => item.id === submissionId);
    if (!submission || !els.detailOverlay || !els.detailBody) return;
    const form = findForm(submission.formId);
    if (els.detailTitle) els.detailTitle.textContent = submission.formName || form?.name || "Data Form";
    if (els.detailKicker) els.detailKicker.textContent = submission.id ? `ID ${submission.id.slice(-8)}` : "Submission";
    els.detailBody.innerHTML = renderDetail(submission, form);
    els.detailOverlay.classList.add("is-open");
    els.detailOverlay.setAttribute("aria-hidden", "false");
  }

  function renderDetail(submission, form) {
    const fields = getDetailFields(form, submission.values);
    const valuesHtml = fields.length
      ? fields.map((field) => `
        <div class="forms-detail-value-row">
          <span>${escapeHtml(field.label || field.key)}</span>
          <strong>${escapeHtml(formatSubmissionValue(submission.values?.[field.key])) || "-"}</strong>
        </div>
      `).join("")
      : '<div class="forms-detail-value">-</div>';
    const history = Array.isArray(submission.history) ? submission.history.slice(-8).reverse() : [];
    const historyHtml = history.length
      ? history.map((item) => `
        <div class="forms-detail-history-item">
          <strong>${escapeHtml(item.action || "update")} · ${escapeHtml(item.by || "-")}</strong>
          <span>${escapeHtml(dateTime(item.at))}</span>
        </div>
      `).join("")
      : '<div class="forms-detail-value">-</div>';

    return `
      <section class="forms-detail-section">
        <h3>ข้อมูลหลัก</h3>
        <div class="forms-detail-grid">
          <div class="forms-detail-item"><span>สถานะ</span><strong>${escapeHtml(statusLabel(submission.status, form))}</strong></div>
          <div class="forms-detail-item"><span>วันที่</span><strong>${escapeHtml(dateTime(submission.createdAt))}</strong></div>
          <div class="forms-detail-item"><span>User ID</span><strong>${escapeHtml(submission.userId || "-")}</strong></div>
          <div class="forms-detail-item"><span>ช่องทาง</span><strong>${escapeHtml(formatPlatform(submission.platform, submission.botId))}</strong></div>
          <div class="forms-detail-item"><span>Source</span><strong>${escapeHtml(submission.source || "-")}</strong></div>
          <div class="forms-detail-item"><span>Agent</span><strong>${escapeHtml(submission.latestActor || "-")}</strong></div>
        </div>
      </section>
      <section class="forms-detail-section">
        <h3>Summary</h3>
        <div class="forms-detail-value">${escapeHtml(submission.summary || "-")}</div>
      </section>
      <section class="forms-detail-section">
        <h3>Fields</h3>
        <div class="forms-detail-values">${valuesHtml}</div>
      </section>
      <section class="forms-detail-section">
        <h3>History</h3>
        <div class="forms-detail-history">${historyHtml}</div>
      </section>
    `;
  }

  function closeDetail() {
    if (!els.detailOverlay) return;
    els.detailOverlay.classList.remove("is-open");
    els.detailOverlay.setAttribute("aria-hidden", "true");
  }

  async function updateSubmissionStatus(submissionId, status) {
    if (!submissionId || !status) return;
    try {
      await fetchJson(`/admin/api/data-form-submissions/${encodeURIComponent(submissionId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadForms({ reloadSubmissions: false });
      await loadSubmissions();
    } catch (error) {
      console.error("[Forms] update status failed:", error);
      window.alert(error.message || "อัปเดตสถานะไม่สำเร็จ");
      await loadSubmissions();
    }
  }

  function exportSubmissions() {
    if (!canAdmin("data-forms:export")) return;
    const params = buildSubmissionParams({
      page: "",
      limit: "",
      sortBy: "",
      sortDir: "",
      format: els.exportFormat?.value === "csv" ? "csv" : "xlsx",
    });
    window.open(`/admin/api/data-form-submissions/export?${params.toString()}`, "_blank", "noopener");
  }

  function setWorkspaceLoading(isLoading) {
    document.querySelector(".forms-workspace")?.classList.toggle("forms-loading", isLoading);
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.error || response.statusText || "Request failed");
    }
    return data;
  }

  function getCurrentForm() {
    if (state.currentFormId === "all") return null;
    return findForm(state.currentFormId);
  }

  function findForm(formId) {
    return state.forms.find((form) => form.id === formId) || null;
  }

  function getCurrentStatuses() {
    const form = getCurrentForm();
    if (form) return getStatusesForForm(form);
    const seen = new Map();
    state.forms.forEach((item) => {
      getStatusesForForm(item).forEach((status) => {
        if (!seen.has(status.key)) seen.set(status.key, status);
      });
    });
    DEFAULT_STATUSES.forEach((status) => {
      if (!seen.has(status.key)) seen.set(status.key, status);
    });
    return Array.from(seen.values());
  }

  function getStatusesForForm(form) {
    const statuses = Array.isArray(form?.statuses) && form.statuses.length ? form.statuses : DEFAULT_STATUSES;
    return statuses.map((status) => ({
      key: status.key || status.value || status.label || "submitted",
      label: status.label || status.key || "Submitted",
    }));
  }

  function getVisibleFields(form) {
    return Array.isArray(form?.fields) ? form.fields.slice(0, 5) : [];
  }

  function getDetailFields(form, values = {}) {
    const fields = Array.isArray(form?.fields) && form.fields.length
      ? form.fields
      : Object.keys(values || {}).map((key) => ({ key, label: key }));
    return fields;
  }

  function getCurrentFormMetricTotal() {
    const form = getCurrentForm();
    if (form) return Number(form.metrics?.total || 0);
    return state.forms.reduce((sum, item) => sum + Number(item.metrics?.total || 0), 0);
  }

  function getStatusMetric(status) {
    const form = getCurrentForm();
    if (form) return Number(form.metrics?.statuses?.[status] || 0);
    return state.forms.reduce((sum, item) => sum + Number(item.metrics?.statuses?.[status] || 0), 0);
  }

  function statusLabel(status, form) {
    const found = getStatusesForForm(form).find((item) => item.key === status);
    return found?.label || status || "-";
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();
    if (value === "draft") return "is-draft";
    if (value === "submitted" || value === "complete" || value === "completed") return "is-submitted";
    if (value === "cancelled" || value === "canceled" || value === "closed") return "is-cancelled";
    return "is-other";
  }

  function formatPlatform(platform, botId) {
    const label = platform === "facebook"
      ? "Facebook"
      : platform === "instagram"
        ? "Instagram"
        : platform === "whatsapp"
          ? "WhatsApp"
          : platform === "line"
            ? "LINE"
            : platform || "-";
    return botId ? `${label} · ${botId}` : label;
  }

  function platformIcon(platform) {
    if (platform === "facebook") return "fa-facebook";
    if (platform === "instagram") return "fa-instagram";
    if (platform === "whatsapp") return "fa-whatsapp";
    if (platform === "line") return "fa-comment-dots";
    return "fa-inbox";
  }

  function getActiveInboxKeys() {
    if (!state.inboxes.length) return [];
    if (!state.selectedInboxKeys.length) {
      return state.inboxes.map((inbox) => inbox.inboxKey).filter(Boolean);
    }
    return state.selectedInboxKeys;
  }

  function getInboxSelectionLabel() {
    if (!state.inboxes.length) return "ไม่มีเพจ/บอท";
    if (!state.selectedInboxKeys.length) return "ทุกเพจที่มีสิทธิ์";
    return `${formatNumber(state.selectedInboxKeys.length)} เพจ/บอท`;
  }

  function buildChatUrl(submission) {
    const params = new URLSearchParams({ userId: submission.userId || "" });
    if (submission.platform) params.set("platform", submission.platform);
    if (submission.botId) params.set("botId", submission.botId);
    return `/admin/chat?${params.toString()}`;
  }

  function buildPageNumbers(current, total) {
    if (total <= 7) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }
    const pages = [1];
    const start = Math.max(current - 1, 2);
    const end = Math.min(current + 1, total - 1);
    if (start > 2) pages.push("gap");
    for (let page = start; page <= end; page += 1) pages.push(page);
    if (end < total - 1) pages.push("gap");
    pages.push(total);
    return pages;
  }

  function updateUrlState() {
    const params = new URLSearchParams(window.location.search);
    if (state.currentFormId === "all") {
      params.delete("formId");
    } else {
      params.set("formId", state.currentFormId);
    }
    if (state.selectedInboxKeys.length) {
      params.set("inboxKeys", state.selectedInboxKeys.join(","));
    } else {
      params.delete("inboxKeys");
    }
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }

  function formatSubmissionValue(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value ?? "");
  }

  function dateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH", { hour12: false });
  }

  function dateOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("th-TH");
  }

  function timeOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function formatInputDate(value) {
    if (window.BangkokDateUtils?.formatDateInput) {
      return window.BangkokDateUtils.formatDateInput(value);
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getQuickDateRange(range) {
    if (window.BangkokDateUtils?.quickRange) {
      return window.BangkokDateUtils.quickRange(range);
    }
    const today = new Date();
    const start = new Date(today);
    if (range === "7days") start.setDate(today.getDate() - 6);
    if (range === "30days") start.setDate(today.getDate() - 29);
    return {
      startDate: formatInputDate(start),
      endDate: formatInputDate(today),
    };
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("th-TH").format(Number(value || 0));
  }

  function escapeHtml(value) {
    if (value === null || typeof value === "undefined") return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), wait);
    };
  }

  window.AdminForms = {
    openDetail,
    closeDetail,
    reload: () => loadForms(),
  };
})();
