(function () {
  "use strict";

  const FIELD_TYPES = [
    "text",
    "textarea",
    "number",
    "date",
    "select",
    "checkbox",
    "phone",
    "email",
    "file",
  ];

  const PLATFORM_LABELS = {
    line: "LINE",
    facebook: "Facebook",
    instagram: "Instagram",
    whatsapp: "WhatsApp",
  };

  const PLATFORM_ICONS = {
    line: "fab fa-line text-success",
    facebook: "fab fa-facebook text-primary",
    instagram: "fab fa-instagram text-danger",
    whatsapp: "fab fa-whatsapp text-success",
  };

  const state = {
    bots: null,
    forms: [],
    submissions: [],
    submissionMetrics: { total: 0, statuses: {} },
    assets: [],
    formModal: null,
  };

  const els = {};

  function escapeHtml(value) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toast(message, type = "info") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }
    alert(message);
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || data?.message || "Request failed");
    }
    return data;
  }

  function debounce(fn, delay = 250) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function cacheElements() {
    els.dataFormsRefreshBtn = document.getElementById("dataFormsRefreshBtn");
    els.dataFormsCreateBtn = document.getElementById("dataFormsCreateBtn");
    els.dataFormsList = document.getElementById("dataFormsList");
    els.submissionsList = document.getElementById("dataFormSubmissionsList");
    els.dashboardMetrics = document.getElementById("dataFormDashboardMetrics");
    els.dashboardFormFilter = document.getElementById("dataFormDashboardFormFilter");
    els.dashboardStatusFilter = document.getElementById("dataFormDashboardStatusFilter");
    els.dashboardInboxFilter = document.getElementById("dataFormDashboardInboxFilter");
    els.dashboardAgentFilter = document.getElementById("dataFormDashboardAgentFilter");
    els.dashboardStartDate = document.getElementById("dataFormDashboardStartDate");
    els.dashboardEndDate = document.getElementById("dataFormDashboardEndDate");
    els.exportCsvBtn = document.getElementById("dataFormExportCsvBtn");
    els.exportXlsxBtn = document.getElementById("dataFormExportXlsxBtn");
    els.formModalEl = document.getElementById("dataFormModal");
    els.formModalLabel = document.getElementById("dataFormModalLabel");
    els.formId = document.getElementById("dataFormId");
    els.formName = document.getElementById("dataFormName");
    els.formDescription = document.getElementById("dataFormDescription");
    els.formStatuses = document.getElementById("dataFormStatuses");
    els.formIsActive = document.getElementById("dataFormIsActive");
    els.formFieldsList = document.getElementById("dataFormFieldsList");
    els.formEnabledPages = document.getElementById("dataFormEnabledPages");
    els.formAddFieldBtn = document.getElementById("dataFormAddFieldBtn");
    els.formSaveBtn = document.getElementById("dataFormSaveBtn");
    els.formDeleteBtn = document.getElementById("dataFormDeleteBtn");

    els.fileAssetsRefreshBtn = document.getElementById("fileAssetsRefreshBtn");
    els.fileUploadForm = document.getElementById("fileAssetUploadForm");
    els.fileInput = document.getElementById("fileAssetFile");
    els.fileLabel = document.getElementById("fileAssetLabel");
    els.fileDescription = document.getElementById("fileAssetDescription");
    els.fileEnabledPages = document.getElementById("fileAssetEnabledPages");
    els.fileAssetsList = document.getElementById("fileAssetsList");
  }

  function bindEvents() {
    applyPermissionVisibility();
    els.dataFormsRefreshBtn?.addEventListener("click", () => refreshDataForms());
    els.dataFormsCreateBtn?.addEventListener("click", () => openCreateForm());
    els.formAddFieldBtn?.addEventListener("click", () => addFieldRow());
    els.formSaveBtn?.addEventListener("click", () => saveForm());
    els.formDeleteBtn?.addEventListener("click", () => deleteCurrentForm());

    [
      els.dashboardFormFilter,
      els.dashboardStatusFilter,
      els.dashboardInboxFilter,
      els.dashboardStartDate,
      els.dashboardEndDate,
    ].forEach((el) => el?.addEventListener("change", () => loadSubmissions()));
    els.dashboardAgentFilter?.addEventListener("input", debounce(() => loadSubmissions(), 350));
    els.exportCsvBtn?.addEventListener("click", () => exportSubmissions("csv"));
    els.exportXlsxBtn?.addEventListener("click", () => exportSubmissions("xlsx"));

    els.dataFormsList?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const form = state.forms.find((item) => item.id === btn.dataset.id);
      if (btn.dataset.action === "edit" && form) openEditForm(form);
      if (btn.dataset.action === "delete" && form) deleteForm(form.id);
    });

    els.submissionsList?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "open-chat") openSubmissionChat(id);
      if (btn.dataset.action === "save-status") saveSubmissionStatus(id);
    });

    els.fileAssetsRefreshBtn?.addEventListener("click", () => refreshFiles());
    els.fileUploadForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      uploadFileAsset();
    });

    els.fileAssetsList?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "copy") copyAssetUrl(id);
      if (btn.dataset.action === "delete") deleteFileAsset(id);
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
    const canManageForms = canAdmin("data-forms:manage");
    const canExportForms = canAdmin("data-forms:export");
    const canManageFiles = canAdmin("file-assets:manage");

    if (els.dataFormsCreateBtn) els.dataFormsCreateBtn.hidden = !canManageForms;
    if (els.exportCsvBtn) els.exportCsvBtn.hidden = !canExportForms;
    if (els.exportXlsxBtn) els.exportXlsxBtn.hidden = !canExportForms;
    if (els.formSaveBtn) els.formSaveBtn.hidden = !canManageForms;
    if (els.formDeleteBtn) els.formDeleteBtn.hidden = !canManageForms;
    if (els.formAddFieldBtn) els.formAddFieldBtn.hidden = !canManageForms;
    if (els.fileUploadForm) els.fileUploadForm.hidden = !canManageFiles;
  }

  async function ensureBots() {
    if (Array.isArray(state.bots)) return state.bots;
    const data = await fetchJson("/admin/api/all-bots");
    state.bots = (Array.isArray(data?.bots) ? data.bots : [])
      .map((bot) => ({
        id: bot?.id?.toString?.() || String(bot?.id || ""),
        name: bot?.name || "Bot",
        platform: bot?.platform || "line",
      }))
      .filter((bot) => bot.id);
    return state.bots;
  }

  function renderAssignments(container, selectedPages = [], prefix = "voxtron_page") {
    if (!container) return;
    const bots = Array.isArray(state.bots) ? state.bots : [];
    const selected = new Set(
      (Array.isArray(selectedPages) ? selectedPages : [])
        .map((page) => `${page.platform || "line"}:${page.botId || ""}`),
    );

    if (!bots.length) {
      container.innerHTML = '<div class="text-muted small">ยังไม่มีบอทในระบบ</div>';
      return;
    }

    container.innerHTML = bots
      .map((bot, index) => {
        const key = `${bot.platform}:${bot.id}`;
        const inputId = `${prefix}_${index}_${bot.platform}_${bot.id}`;
        const checked = selected.has(key) ? "checked" : "";
        const icon = PLATFORM_ICONS[bot.platform] || "fas fa-robot";
        return `
          <label class="voxtron-check" for="${escapeHtml(inputId)}">
            <input type="checkbox" id="${escapeHtml(inputId)}"
              data-platform="${escapeHtml(bot.platform)}"
              data-bot-id="${escapeHtml(bot.id)}" ${checked}>
            <span><i class="${escapeHtml(icon)}"></i>${escapeHtml(bot.name)}</span>
            <small>${escapeHtml(PLATFORM_LABELS[bot.platform] || bot.platform)}</small>
          </label>
        `;
      })
      .join("");
  }

  function readAssignments(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll("input[type='checkbox']:checked"))
      .map((input) => ({
        platform: input.dataset.platform || "line",
        botId: input.dataset.botId || "",
      }))
      .filter((page) => page.botId);
  }

  async function refreshDataForms() {
    await ensureBots();
    renderAssignments(els.formEnabledPages, [], "data_form_page");

    await loadForms();
    populateDashboardFilters();
    await loadSubmissions();
  }

  async function loadForms() {
    if (!els.dataFormsList) return;
    els.dataFormsList.innerHTML =
      '<div class="text-center p-3 text-muted-v2">กำลังโหลดฟอร์ม...</div>';
    try {
      const data = await fetchJson("/admin/api/data-forms?includeInactive=true");
      state.forms = Array.isArray(data?.forms) ? data.forms : [];
      renderForms();
    } catch (error) {
      console.error("[Voxtron] load forms failed:", error);
      els.dataFormsList.innerHTML =
        '<div class="text-danger p-3">โหลดฟอร์มไม่สำเร็จ</div>';
    }
  }

  function renderForms() {
    if (!els.dataFormsList) return;
    if (!state.forms.length) {
      els.dataFormsList.innerHTML =
        '<div class="text-center p-4 text-muted-v2">ยังไม่มี Data Form</div>';
      return;
    }

    const canManageForms = canAdmin("data-forms:manage");
    els.dataFormsList.innerHTML = state.forms.map((form) => {
      const fields = Array.isArray(form.fields) ? form.fields : [];
      const requiredCount = fields.filter((field) => field.required).length;
      const assignedCount = Array.isArray(form.enabledPages) ? form.enabledPages.length : 0;
      return `
        <div class="voxtron-item">
          <div class="voxtron-item-main">
            <div class="voxtron-item-title">
              <span>${escapeHtml(form.name)}</span>
              <span class="badge badge-default">${form.isActive ? "Active" : "Inactive"}</span>
            </div>
            <div class="voxtron-item-desc">${escapeHtml(form.description || "-")}</div>
            <div class="voxtron-item-meta">
              ${fields.length} fields • required ${requiredCount} • ${assignedCount ? `${assignedCount} bot/page` : "ทุกบอท"}
            </div>
          </div>
          ${canManageForms ? `<div class="voxtron-item-actions">
            <button class="btn-ghost-sm" data-action="edit" data-id="${escapeHtml(form.id)}" title="แก้ไข">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-ghost-sm text-danger" data-action="delete" data-id="${escapeHtml(form.id)}" title="ปิดฟอร์ม">
              <i class="fas fa-trash"></i>
            </button>
          </div>` : ""}
        </div>
      `;
    }).join("");
  }

  function populateDashboardFilters() {
    const previousForm = els.dashboardFormFilter?.value || "";
    const previousStatus = els.dashboardStatusFilter?.value || "";
    const previousInbox = els.dashboardInboxFilter?.value || "";
    if (els.dashboardFormFilter) {
      els.dashboardFormFilter.innerHTML = [
        '<option value="">ทุกฟอร์ม</option>',
        ...state.forms.map((form) => `<option value="${escapeHtml(form.id)}">${escapeHtml(form.name || form.id)}</option>`),
      ].join("");
      els.dashboardFormFilter.value = state.forms.some((form) => form.id === previousForm) ? previousForm : "";
    }
    if (els.dashboardStatusFilter) {
      const statuses = new Map([
        ["draft", "Draft"],
        ["submitted", "Submitted"],
        ["pending", "Pending"],
      ]);
      state.forms.forEach((form) => {
        (Array.isArray(form.statuses) ? form.statuses : []).forEach((status) => {
          if (status?.key) statuses.set(status.key, status.label || status.key);
        });
      });
      els.dashboardStatusFilter.innerHTML = [
        '<option value="">ทุกสถานะ</option>',
        ...Array.from(statuses.entries()).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`),
      ].join("");
      els.dashboardStatusFilter.value = statuses.has(previousStatus) ? previousStatus : "";
    }
    if (els.dashboardInboxFilter) {
      const bots = Array.isArray(state.bots) ? state.bots : [];
      els.dashboardInboxFilter.innerHTML = [
        '<option value="">ทุก Inbox</option>',
        ...bots.map((bot) => {
          const key = `${bot.platform}:${bot.id}`;
          const platformLabel = PLATFORM_LABELS[bot.platform] || bot.platform || "Bot";
          return `<option value="${escapeHtml(key)}">${escapeHtml(platformLabel)} • ${escapeHtml(bot.name || bot.id)}</option>`;
        }),
      ].join("");
      els.dashboardInboxFilter.value = bots.some((bot) => `${bot.platform}:${bot.id}` === previousInbox) ? previousInbox : "";
    }
  }

  function buildSubmissionQuery(limit = 100) {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (els.dashboardFormFilter?.value) params.set("formId", els.dashboardFormFilter.value);
    if (els.dashboardStatusFilter?.value) params.set("status", els.dashboardStatusFilter.value);
    if (els.dashboardAgentFilter?.value.trim()) params.set("agent", els.dashboardAgentFilter.value.trim());
    if (els.dashboardStartDate?.value) params.set("startDate", els.dashboardStartDate.value);
    if (els.dashboardEndDate?.value) params.set("endDate", els.dashboardEndDate.value);
    const inbox = els.dashboardInboxFilter?.value || "";
    if (inbox.includes(":")) {
      const [platform, ...botParts] = inbox.split(":");
      params.set("platform", platform);
      const botId = botParts.join(":");
      if (botId) params.set("botId", botId);
    }
    return params;
  }

  async function loadSubmissions() {
    if (!els.submissionsList) return;
    els.submissionsList.innerHTML =
      '<div class="text-center p-3 text-muted-v2">กำลังโหลด submissions...</div>';
    try {
      const data = await fetchJson(`/admin/api/data-form-submissions?${buildSubmissionQuery(100).toString()}`);
      state.submissions = Array.isArray(data?.submissions) ? data.submissions : [];
      state.submissionMetrics = data?.metrics || { total: state.submissions.length, statuses: {} };
      renderDashboardMetrics();
      renderSubmissions();
    } catch (error) {
      console.error("[Voxtron] load submissions failed:", error);
      renderDashboardMetrics({ error: true });
      els.submissionsList.innerHTML =
        '<div class="text-danger p-3">โหลด submissions ไม่สำเร็จ</div>';
    }
  }

  function renderDashboardMetrics(options = {}) {
    if (!els.dashboardMetrics) return;
    const metrics = state.submissionMetrics || { total: 0, statuses: {} };
    const statuses = metrics.statuses || {};
    const pending = Object.entries(statuses)
      .filter(([key]) => !["draft", "submitted"].includes(key))
      .reduce((sum, [, count]) => sum + Number(count || 0), 0);
    const cards = [
      ["Total", options.error ? "-" : metrics.total || 0],
      ["Draft", options.error ? "-" : statuses.draft || 0],
      ["Submitted", options.error ? "-" : statuses.submitted || 0],
      ["Pending/Other", options.error ? "-" : pending],
    ];
    els.dashboardMetrics.innerHTML = cards.map(([label, value]) => `
      <div class="voxtron-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join("");
  }

  function exportSubmissions(format) {
    if (!canAdmin("data-forms:export")) return;
    const params = buildSubmissionQuery(5000);
    params.set("format", format === "xlsx" ? "xlsx" : "csv");
    window.open(`/admin/api/data-form-submissions/export?${params.toString()}`, "_blank", "noopener");
  }

  function getStatusesForSubmission(submission) {
    const form = state.forms.find((item) => item.id === submission.formId);
    const statuses = Array.isArray(form?.statuses) && form.statuses.length
      ? form.statuses
      : [
        { key: "draft", label: "Draft" },
        { key: "submitted", label: "Submitted" },
      ];
    return statuses;
  }

  function renderSubmissions() {
    if (!els.submissionsList) return;
    if (!state.submissions.length) {
      els.submissionsList.innerHTML =
        '<div class="text-center p-4 text-muted-v2">ยังไม่มี submission</div>';
      return;
    }

    const canManageForms = canAdmin("data-forms:manage");
    els.submissionsList.innerHTML = state.submissions.map((submission) => {
      const statuses = getStatusesForSubmission(submission);
      const values = submission.values && typeof submission.values === "object"
        ? submission.values
        : {};
      const valueRows = Object.entries(values)
        .filter(([, value]) => value !== "" && value !== null && value !== undefined)
        .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(formatValue(value))}`)
        .join("<br>");
      const historyRows = (Array.isArray(submission.history) ? submission.history : [])
        .slice(-5)
        .reverse()
        .map((entry) => `
          <div class="voxtron-timeline-row">
            <span>${escapeHtml(formatDate(entry.at))}</span>
            <strong>${escapeHtml(entry.action || "-")} • ${escapeHtml(entry.status || "-")}${entry.by ? ` • ${escapeHtml(entry.by)}` : ""}</strong>
          </div>
        `)
        .join("");
      return `
        <div class="voxtron-item">
          <div class="voxtron-item-main">
            <div class="voxtron-item-title">
              <span>${escapeHtml(submission.formName || "Data Form")}</span>
              <span class="badge badge-default">${escapeHtml(submission.status || "submitted")}</span>
            </div>
            <div class="voxtron-item-desc">${escapeHtml(submission.summary || "-")}</div>
            <div class="voxtron-item-meta">
              ${escapeHtml(submission.platform || "line")} • ${escapeHtml(submission.botId || "default")} • ${escapeHtml(submission.userId || "-")} • ${formatDate(submission.createdAt)}
              ${submission.latestActor ? ` • by ${escapeHtml(submission.latestActor)}` : ""}
            </div>
            ${valueRows ? `<details class="voxtron-details"><summary>${canManageForms ? "ดูข้อมูล/แก้ JSON" : "ดูข้อมูล"}</summary><div>${valueRows}</div>
              ${canManageForms ? `
              <textarea class="form-control form-control-sm mt-2" rows="4" data-submission-values="${escapeHtml(submission.id)}">${escapeHtml(JSON.stringify(values, null, 2))}</textarea>
              ` : ""}
            </details>` : ""}
            ${historyRows ? `<details class="voxtron-details"><summary>Timeline / History</summary><div class="voxtron-timeline">${historyRows}</div></details>` : ""}
            ${canManageForms ? `<div class="voxtron-inline-edit">
              <select class="form-select form-select-sm" data-submission-status="${escapeHtml(submission.id)}">
                ${statuses.map((status) => `
                  <option value="${escapeHtml(status.key)}" ${status.key === submission.status ? "selected" : ""}>
                    ${escapeHtml(status.label || status.key)}
                  </option>
                `).join("")}
              </select>
              <button class="btn-v2 btn-v2-secondary btn-v2-sm" data-action="save-status" data-id="${escapeHtml(submission.id)}">
                <i class="fas fa-save"></i>
              </button>
            </div>` : ""}
          </div>
          <div class="voxtron-item-actions">
            <button class="btn-ghost-sm" data-action="open-chat" data-id="${escapeHtml(submission.id)}" title="เปิดแชท">
              <i class="fas fa-up-right-from-square"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  function formatValue(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value ?? "");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH", { hour12: false });
  }

  async function openCreateForm() {
    await ensureBots();
    if (!state.formModal && els.formModalEl && window.bootstrap?.Modal) {
      state.formModal = new window.bootstrap.Modal(els.formModalEl);
    }
    if (els.formModalLabel) {
      els.formModalLabel.innerHTML =
        '<i class="fas fa-clipboard-list me-2"></i>สร้าง Data Form';
    }
    els.formId.value = "";
    els.formName.value = "";
    els.formDescription.value = "";
    els.formStatuses.value = "draft, submitted";
    els.formIsActive.checked = true;
    els.formFieldsList.innerHTML = "";
    addFieldRow({ type: "text", required: true });
    renderAssignments(els.formEnabledPages, [], "data_form_page");
    els.formDeleteBtn?.classList.add("d-none");
    state.formModal?.show();
  }

  async function openEditForm(form) {
    await ensureBots();
    if (!state.formModal && els.formModalEl && window.bootstrap?.Modal) {
      state.formModal = new window.bootstrap.Modal(els.formModalEl);
    }
    if (els.formModalLabel) {
      els.formModalLabel.innerHTML =
        '<i class="fas fa-clipboard-list me-2"></i>แก้ไข Data Form';
    }
    els.formId.value = form.id || "";
    els.formName.value = form.name || "";
    els.formDescription.value = form.description || "";
    els.formStatuses.value = (Array.isArray(form.statuses) ? form.statuses : [])
      .map((status) => status.label || status.key)
      .join(", ");
    els.formIsActive.checked = form.isActive !== false;
    els.formFieldsList.innerHTML = "";
    (Array.isArray(form.fields) && form.fields.length ? form.fields : [{ type: "text" }])
      .forEach((field) => addFieldRow(field));
    renderAssignments(els.formEnabledPages, form.enabledPages || [], "data_form_page");
    els.formDeleteBtn?.classList.remove("d-none");
    state.formModal?.show();
  }

  function addFieldRow(field = {}) {
    if (!els.formFieldsList) return;
    const index = els.formFieldsList.children.length;
    const row = document.createElement("div");
    row.className = "voxtron-field-row";
    row.innerHTML = `
      <input type="text" class="form-control form-control-sm" data-field-label
        placeholder="Label" value="${escapeHtml(field.label || "")}">
      <input type="text" class="form-control form-control-sm" data-field-key
        placeholder="key" value="${escapeHtml(field.key || "")}">
      <select class="form-select form-select-sm" data-field-type>
        ${FIELD_TYPES.map((type) => `
          <option value="${type}" ${type === (field.type || "text") ? "selected" : ""}>${type}</option>
        `).join("")}
      </select>
      <input type="text" class="form-control form-control-sm" data-field-options
        placeholder="options comma" value="${escapeHtml((field.options || []).join(", "))}">
      <label class="voxtron-mini-check">
        <input type="checkbox" data-field-required ${field.required ? "checked" : ""}>
        required
      </label>
      <button type="button" class="btn-ghost-sm text-danger" data-field-remove title="ลบ field">
        <i class="fas fa-times"></i>
      </button>
    `;
    row.querySelector("[data-field-remove]")?.addEventListener("click", () => {
      row.remove();
      if (!els.formFieldsList.children.length) addFieldRow({ type: "text" });
    });
    row.querySelector("[data-field-label]")?.addEventListener("input", (event) => {
      const keyInput = row.querySelector("[data-field-key]");
      if (keyInput && !keyInput.value.trim()) {
        keyInput.value = slugify(event.target.value || `field_${index + 1}`);
      }
    });
    els.formFieldsList.appendChild(row);
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-\u0E00-\u0E7F]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
  }

  function readFormFields() {
    return Array.from(els.formFieldsList?.querySelectorAll(".voxtron-field-row") || [])
      .map((row, index) => {
        const label = row.querySelector("[data-field-label]")?.value?.trim() || "";
        const key = row.querySelector("[data-field-key]")?.value?.trim() || slugify(label || `field_${index + 1}`);
        const options = (row.querySelector("[data-field-options]")?.value || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        return {
          label,
          key,
          type: row.querySelector("[data-field-type]")?.value || "text",
          required: row.querySelector("[data-field-required]")?.checked === true,
          options,
        };
      })
      .filter((field) => field.label && field.key);
  }

  function readStatuses() {
    return (els.formStatuses?.value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((label) => ({ key: slugify(label), label }));
  }

  async function saveForm() {
    const id = els.formId?.value || "";
    const payload = {
      name: els.formName?.value?.trim() || "",
      description: els.formDescription?.value?.trim() || "",
      fields: readFormFields(),
      statuses: readStatuses(),
      enabledPages: readAssignments(els.formEnabledPages),
      isActive: els.formIsActive?.checked !== false,
    };
    if (!payload.name) {
      toast("กรุณากรอกชื่อฟอร์ม", "danger");
      return;
    }
    if (!payload.fields.length) {
      toast("กรุณาเพิ่ม field อย่างน้อย 1 รายการ", "danger");
      return;
    }

    try {
      els.formSaveBtn.disabled = true;
      const url = id ? `/admin/api/data-forms/${encodeURIComponent(id)}` : "/admin/api/data-forms";
      const method = id ? "PUT" : "POST";
      await fetchJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      state.formModal?.hide();
      toast("บันทึก Data Form แล้ว", "success");
      await refreshDataForms();
    } catch (error) {
      console.error("[Voxtron] save form failed:", error);
      toast(error.message || "บันทึกฟอร์มไม่สำเร็จ", "danger");
    } finally {
      els.formSaveBtn.disabled = false;
    }
  }

  async function deleteCurrentForm() {
    const id = els.formId?.value || "";
    if (!id) return;
    await deleteForm(id, { fromModal: true });
  }

  async function deleteForm(id, options = {}) {
    if (!confirm("ต้องการปิดฟอร์มนี้หรือไม่?")) return;
    try {
      await fetchJson(`/admin/api/data-forms/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (options.fromModal) state.formModal?.hide();
      toast("ปิดฟอร์มแล้ว", "success");
      await refreshDataForms();
    } catch (error) {
      console.error("[Voxtron] delete form failed:", error);
      toast(error.message || "ปิดฟอร์มไม่สำเร็จ", "danger");
    }
  }

  async function saveSubmissionStatus(id) {
    const submission = state.submissions.find((item) => item.id === id);
    const escapedId = window.CSS?.escape
      ? window.CSS.escape(id)
      : String(id).replace(/["\\]/g, "\\$&");
    const select = els.submissionsList?.querySelector(`[data-submission-status="${escapedId}"]`);
    const valuesInput = els.submissionsList?.querySelector(`[data-submission-values="${escapedId}"]`);
    if (!submission || !select) return;
    try {
      let values = submission.values || {};
      if (valuesInput && valuesInput.value.trim()) {
        values = JSON.parse(valuesInput.value);
      }
      await fetchJson(`/admin/api/data-form-submissions/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: select.value, values }),
      });
      toast("อัปเดตสถานะแล้ว", "success");
      await loadSubmissions();
    } catch (error) {
      console.error("[Voxtron] update submission failed:", error);
      toast(error.message || "อัปเดตสถานะไม่สำเร็จ", "danger");
    }
  }

  function openSubmissionChat(id) {
    const submission = state.submissions.find((item) => item.id === id);
    if (!submission?.userId) return;
    const params = new URLSearchParams({ user: submission.userId });
    if (submission.platform) params.set("platform", submission.platform);
    if (submission.botId) params.set("botId", submission.botId);
    window.open(`/admin/chat?${params.toString()}`, "_blank", "noopener");
  }

  async function refreshFiles() {
    await ensureBots();
    renderAssignments(els.fileEnabledPages, [], "file_asset_page");
    await loadFileAssets();
  }

  async function loadFileAssets() {
    if (!els.fileAssetsList) return;
    els.fileAssetsList.innerHTML =
      '<div class="text-center p-3 text-muted-v2">กำลังโหลดไฟล์...</div>';
    try {
      const data = await fetchJson("/admin/api/file-assets?includeInactive=true");
      state.assets = Array.isArray(data?.assets) ? data.assets : [];
      renderFileAssets();
    } catch (error) {
      console.error("[Voxtron] load files failed:", error);
      els.fileAssetsList.innerHTML =
        '<div class="text-danger p-3">โหลดไฟล์ไม่สำเร็จ</div>';
    }
  }

  function renderFileAssets() {
    if (!els.fileAssetsList) return;
    if (!state.assets.length) {
      els.fileAssetsList.innerHTML =
        '<div class="text-center p-4 text-muted-v2">ยังไม่มีไฟล์</div>';
      return;
    }
    const canManageFiles = canAdmin("file-assets:manage");
    els.fileAssetsList.innerHTML = state.assets.map((asset) => {
      const assignedCount = Array.isArray(asset.enabledPages) ? asset.enabledPages.length : 0;
      const sizeMb = (Number(asset.sizeBytes || 0) / (1024 * 1024)).toFixed(2);
      return `
        <div class="voxtron-item">
          <div class="voxtron-item-main">
            <div class="voxtron-item-title">
              <span>${escapeHtml(asset.label || asset.originalName || "ไฟล์")}</span>
              <span class="badge badge-default">${asset.isActive ? "Active" : "Inactive"}</span>
            </div>
            <div class="voxtron-item-desc">${escapeHtml(asset.description || asset.originalName || "-")}</div>
            <div class="voxtron-item-meta">
              ${escapeHtml(asset.mimeType || "-")} • ${sizeMb} MB • ${assignedCount ? `${assignedCount} bot/page` : "ทุกบอท"}
            </div>
            <a class="voxtron-link" href="${escapeHtml(asset.downloadUrl || "#")}" target="_blank" rel="noopener">
              ${escapeHtml(asset.downloadUrl || "")}
            </a>
          </div>
          <div class="voxtron-item-actions">
            <button class="btn-ghost-sm" data-action="copy" data-id="${escapeHtml(asset.id)}" title="คัดลอกลิงก์">
              <i class="fas fa-copy"></i>
            </button>
            ${canManageFiles ? `
            <button class="btn-ghost-sm text-danger" data-action="delete" data-id="${escapeHtml(asset.id)}" title="ปิดไฟล์">
              <i class="fas fa-trash"></i>
            </button>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  async function uploadFileAsset() {
    if (!els.fileInput?.files?.length) {
      toast("กรุณาเลือกไฟล์", "danger");
      return;
    }
    const formData = new FormData();
    formData.append("file", els.fileInput.files[0]);
    formData.append("label", els.fileLabel?.value?.trim() || "");
    formData.append("description", els.fileDescription?.value?.trim() || "");
    formData.append("enabledPages", JSON.stringify(readAssignments(els.fileEnabledPages)));

    try {
      await fetchJson("/admin/api/file-assets", {
        method: "POST",
        body: formData,
      });
      els.fileUploadForm?.reset();
      renderAssignments(els.fileEnabledPages, [], "file_asset_page");
      toast("อัปโหลดไฟล์แล้ว", "success");
      await loadFileAssets();
    } catch (error) {
      console.error("[Voxtron] upload file failed:", error);
      toast(error.message || "อัปโหลดไฟล์ไม่สำเร็จ", "danger");
    }
  }

  async function copyAssetUrl(id) {
    const asset = state.assets.find((item) => item.id === id);
    if (!asset?.downloadUrl) return;
    try {
      await navigator.clipboard.writeText(asset.downloadUrl);
      toast("คัดลอกลิงก์แล้ว", "success");
    } catch (_) {
      prompt("คัดลอกลิงก์ไฟล์", asset.downloadUrl);
    }
  }

  async function deleteFileAsset(id) {
    if (!confirm("ต้องการปิดไฟล์นี้หรือไม่?")) return;
    try {
      await fetchJson(`/admin/api/file-assets/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast("ปิดไฟล์แล้ว", "success");
      await loadFileAssets();
    } catch (error) {
      console.error("[Voxtron] delete file failed:", error);
      toast(error.message || "ปิดไฟล์ไม่สำเร็จ", "danger");
    }
  }

  async function init() {
    cacheElements();
    bindEvents();
    if (els.formModalEl && window.bootstrap?.Modal) {
      state.formModal = new window.bootstrap.Modal(els.formModalEl);
    }
  }

  window.voxtronPhase1 = {
    refreshDataForms,
    refreshFiles,
  };

  document.addEventListener("DOMContentLoaded", init);
}());
