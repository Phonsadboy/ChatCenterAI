/**
 * TeleSales CRM — Single-page client application
 * Manages all views: queue, lead detail, manager tools, reports
 */
(function () {
  "use strict";

  /* ================================================================
     STATE
     ================================================================ */
  const state = {
    user: window.__SALES_USER__ || null,
    currentView: "my-queue",
    currentLeadId: null,
    previousView: null,
    queueData: null,
    managerQueueData: null,
    managerLeadsData: null,
    leadDetail: null,
    salesUsers: [],
    reportsData: null,
    filters: {
      managerQueueSalesUser: "",
      managerLeadStatus: "",
      managerLeadOwner: "",
      managerLeadNeedsCycle: false,
    },
  };

  const isManager =
    state.user &&
    (state.user.role === "sales_manager" || state.user.role === "admin");

  /* ================================================================
     HELPERS
     ================================================================ */
  function esc(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(d) {
    if (!d) return "-";
    const dt = new Date(d);
    if (isNaN(dt)) return "-";
    return dt.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  }

  function formatDateTime(d) {
    if (!d) return "-";
    const dt = new Date(d);
    if (isNaN(dt)) return "-";
    return dt.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function relativeDate(d) {
    if (!d) return "";
    const now = new Date();
    const dt = new Date(d);
    const diff = Math.floor((dt - now) / 86400000);
    if (diff < -1) return `เลยกำหนด ${Math.abs(diff)} วัน`;
    if (diff === -1) return "เลยกำหนดเมื่อวาน";
    if (diff === 0) {
      const hDiff = Math.floor((dt - now) / 3600000);
      if (hDiff < 0) return "เลยกำหนดวันนี้";
      return "ครบกำหนดวันนี้";
    }
    if (diff === 1) return "พรุ่งนี้";
    return `อีก ${diff} วัน`;
  }

  function dueClass(d) {
    if (!d) return "future";
    const now = new Date();
    const dt = new Date(d);
    const diff = (dt - now) / 86400000;
    if (diff < 0) return "overdue";
    if (diff < 1) return "today";
    return "future";
  }

  function initial(name) {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
  }

  function money(v) {
    const n = parseFloat(v) || 0;
    return n.toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  const OUTCOME_LABELS = {
    no_answer: "ไม่รับสาย",
    busy: "สายไม่ว่าง",
    call_back: "โทรกลับทีหลัง",
    interested: "สนใจ",
    not_interested: "ไม่สนใจ",
    already_bought_elsewhere: "ซื้อที่อื่นแล้ว",
    wrong_number: "เบอร์ผิด",
    do_not_call: "ห้ามโทร",
    closed_won: "ปิดการขายสำเร็จ",
    purchased_via_ai: "ซื้อผ่าน AI",
  };

  const OUTCOME_COLORS = {
    no_answer: "yellow",
    busy: "yellow",
    call_back: "blue",
    interested: "green",
    not_interested: "red",
    already_bought_elsewhere: "gray",
    wrong_number: "red",
    do_not_call: "red",
    closed_won: "green",
    purchased_via_ai: "blue",
  };

  const OUTCOME_ICON_CLASS = {
    no_answer: "neutral",
    busy: "neutral",
    call_back: "pending",
    interested: "positive",
    not_interested: "negative",
    already_bought_elsewhere: "neutral",
    wrong_number: "negative",
    do_not_call: "negative",
    closed_won: "positive",
    purchased_via_ai: "positive",
  };

  const OUTCOME_ICONS = {
    no_answer: "fa-phone-slash",
    busy: "fa-phone-volume",
    call_back: "fa-clock-rotate-left",
    interested: "fa-face-smile",
    not_interested: "fa-face-frown",
    already_bought_elsewhere: "fa-store",
    wrong_number: "fa-circle-exclamation",
    do_not_call: "fa-ban",
    closed_won: "fa-trophy",
    purchased_via_ai: "fa-robot",
  };

  const CHECKPOINT_LABELS = {
    reorder: "สั่งซ้ำ",
    callback: "โทรกลับ",
    manual_reopen: "เปิดใหม่",
    system_reorder: "สั่งซ้ำอัตโนมัติ",
  };

  const NEEDS_NEXT = new Set([
    "no_answer",
    "busy",
    "call_back",
    "interested",
    "not_interested",
  ]);
  const TERMINAL_OUTCOMES = new Set(["wrong_number", "do_not_call"]);

  /* ================================================================
     API
     ================================================================ */
  const api = {
    async get(url) {
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.href = "/sales/login";
        throw new Error("ไม่ได้เข้าสู่ระบบ");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "API error");
      return data;
    },
    async post(url, body) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.href = "/sales/login";
        throw new Error("ไม่ได้เข้าสู่ระบบ");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "API error");
      return data;
    },
    async patch(url, body) {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.href = "/sales/login";
        throw new Error("ไม่ได้เข้าสู่ระบบ");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "API error");
      return data;
    },
  };

  /* ================================================================
     TOAST
     ================================================================ */
  function toast(msg, type = "success") {
    const container = document.getElementById("tsToastContainer");
    const el = document.createElement("div");
    el.className = `ts-toast ${type}`;
    const icons = {
      success: "fa-check-circle",
      error: "fa-circle-xmark",
      warning: "fa-triangle-exclamation",
    };
    el.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i> ${esc(msg)}`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(20px)";
      el.style.transition = "all 0.3s ease";
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  /* ================================================================
     NAVIGATION
     ================================================================ */
  function navigate(view, params = {}) {
    if (state.currentView !== view) {
      state.previousView = state.currentView;
    }
    state.currentView = view;
    if (params.leadId) state.currentLeadId = params.leadId;

    // Update nav active
    document.querySelectorAll(".ts-nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === view);
    });

    // Close mobile sidebar
    document.getElementById("tsSidebar").classList.remove("open");
    document.getElementById("tsSidebarOverlay").classList.remove("show");

    // Render view
    const content = document.getElementById("tsContent");
    content.innerHTML =
      '<div class="ts-loading"><div class="ts-spinner"></div> กำลังโหลด...</div>';

    switch (view) {
      case "my-queue":
        renderMyQueue();
        break;
      case "lead-detail":
        renderLeadDetail(state.currentLeadId);
        break;
      case "manager-queue":
        renderManagerQueue();
        break;
      case "manager-leads":
        renderManagerLeads();
        break;
      case "sales-users":
        renderSalesUsers();
        break;
      case "reports":
        renderReports();
        break;
      default:
        renderMyQueue();
    }
  }

  /* ================================================================
     VIEW: MY QUEUE
     ================================================================ */
  async function renderMyQueue() {
    const content = document.getElementById("tsContent");
    try {
      const data = await api.get("/api/telesales/my-queue");
      state.queueData = data;

      const s = data.summary || {};
      const badge = document.getElementById("navBadgeOverdue");
      if (s.overdue > 0) {
        badge.textContent = s.overdue;
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }

      content.innerHTML = `
        <div class="ts-fade-in">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.25rem;">
            <h2 style="font-size:1.25rem; font-weight:700; margin:0;">คิวของฉัน</h2>
            <button class="ts-btn ts-btn-ghost ts-btn-sm" onclick="window.__TS__.refreshQueue()">
              <i class="fas fa-arrows-rotate"></i> รีเฟรช
            </button>
          </div>
          <div class="ts-stats-grid ts-stagger">
            ${statCard("fas fa-clock", "primary", s.due_today || 0, "ครบกำหนดวันนี้")}
            ${statCard("fas fa-exclamation-triangle", "danger", s.overdue || 0, "เลยกำหนด")}
            ${statCard("fas fa-phone-flip", "accent", s.callback_pending || 0, "รอโทรกลับ")}
            ${statCard("fas fa-list", "info", (data.items || []).length, "ทั้งหมดในคิว")}
          </div>
          <div class="ts-queue-list ts-stagger" id="queueList">
            ${renderQueueItems(data.items || [])}
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="ts-empty"><i class="fas fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
  }

  function statCard(icon, color, value, label) {
    return `
      <div class="ts-stat-card">
        <div class="ts-stat-icon ${color}"><i class="${icon}"></i></div>
        <div>
          <div class="ts-stat-value">${value}</div>
          <div class="ts-stat-label">${esc(label)}</div>
        </div>
      </div>`;
  }

  function renderQueueItems(items) {
    if (!items.length) {
      return '<div class="ts-empty"><i class="fas fa-inbox"></i><p>ไม่มีงานในคิว</p></div>';
    }
    return items
      .map((item) => {
        const cp = item.checkpoint || {};
        const lead = item.lead || {};
        const dc = dueClass(cp.dueAt);
        const cpType = cp.type || "reorder";
        let cardClass = "";
        if (dc === "overdue") cardClass = "overdue";
        else if (dc === "today") cardClass = "due-today";
        else if (cpType === "callback") cardClass = "callback";

        return `
        <div class="ts-queue-card ${cardClass}" onclick="window.__TS__.openLead('${esc(lead.id)}')">
          <div class="ts-queue-card-avatar">${initial(lead.displayName)}</div>
          <div class="ts-queue-card-body">
            <div class="ts-queue-card-title">${esc(lead.displayName || "ไม่ระบุชื่อ")}</div>
            <div class="ts-queue-card-meta">
              <span><i class="fas fa-phone"></i> ${esc(lead.phone || "-")}</span>
              <span class="ts-badge ts-badge-${cpType}">${esc(CHECKPOINT_LABELS[cpType] || cpType)}</span>
              <span><i class="fas fa-shopping-bag"></i> ${(lead.sourceOrderIds || []).length} ออเดอร์</span>
            </div>
          </div>
          <div class="ts-queue-card-right">
            <div class="ts-queue-card-due ${dc}">${relativeDate(cp.dueAt)}</div>
            <div style="font-size:0.7rem; color:var(--ts-text-muted);">${formatDate(cp.dueAt)}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  /* ================================================================
     VIEW: LEAD DETAIL
     ================================================================ */
  async function renderLeadDetail(leadId) {
    const content = document.getElementById("tsContent");
    try {
      const data = await api.get(`/api/telesales/leads/${leadId}`);
      state.leadDetail = data;
      const lead = data.lead || {};
      const cps = data.checkpoints || [];
      const logs = data.callLogs || [];
      const orders = data.orders || [];
      const openCp = cps.find((c) => c.status === "open");

      content.innerHTML = `
        <div class="ts-fade-in">
          <button class="ts-back-btn" onclick="window.__TS__.goBack()">
            <i class="fas fa-arrow-left"></i> กลับ
          </button>

          <div class="ts-lead-header">
            <div class="ts-lead-avatar-lg">${initial(lead.displayName)}</div>
            <div class="ts-lead-header-info">
              <div class="ts-lead-header-name">${esc(lead.displayName || "ไม่ระบุ")}</div>
              <div class="ts-lead-header-meta">
                <span><i class="fas fa-phone"></i> ${esc(lead.phone || "-")}</span>
                <span><i class="fas fa-${lead.platform === "line" ? "comment" : "globe"}"></i> ${esc(lead.platform || "-")}</span>
                <span class="ts-badge ts-badge-${lead.status || "active"}">${esc(lead.status || "-")}</span>
                ${lead.overdueSince ? '<span class="ts-badge ts-badge-overdue">เลยกำหนด</span>' : ""}
                ${lead.needsCycle ? '<span class="ts-badge ts-badge-paused">ต้องตั้ง Cycle</span>' : ""}
              </div>
            </div>
            <div class="ts-lead-header-actions">
              ${
                openCp
                  ? `
                <button class="ts-btn ts-btn-primary ts-btn-sm" onclick="window.__TS__.showLogCallModal('${esc(openCp.id)}')">
                  <i class="fas fa-phone"></i> บันทึกโทร
                </button>
                <button class="ts-btn ts-btn-accent ts-btn-sm" onclick="window.__TS__.showCreateOrderModal('${esc(openCp.id)}')">
                  <i class="fas fa-shopping-cart"></i> สร้างออเดอร์
                </button>
              `
                  : ""
              }
              ${
                isManager
                  ? `
                <button class="ts-btn ts-btn-ghost ts-btn-sm" onclick="window.__TS__.showAssignModal('${esc(lead.id)}')">
                  <i class="fas fa-user-plus"></i> Assign
                </button>
                ${
                  lead.status === "active"
                    ? `<button class="ts-btn ts-btn-ghost ts-btn-sm" onclick="window.__TS__.showPauseModal('${esc(lead.id)}')"><i class="fas fa-pause"></i> พัก</button>`
                    : ""
                }
                ${
                  lead.status !== "active"
                    ? `<button class="ts-btn ts-btn-ghost ts-btn-sm" onclick="window.__TS__.showReopenModal('${esc(lead.id)}')"><i class="fas fa-play"></i> เปิดใหม่</button>`
                    : ""
                }
              `
                  : ""
              }
            </div>
          </div>

          <div class="ts-tabs" id="leadTabs">
            <button class="ts-tab active" data-tab="summary">สรุป</button>
            <button class="ts-tab" data-tab="checkpoints">Checkpoint (${cps.length})</button>
            <button class="ts-tab" data-tab="calls">บันทึกโทร (${logs.length})</button>
            <button class="ts-tab" data-tab="orders">ออเดอร์ (${orders.length})</button>
          </div>

          <div id="leadTabContent">
            ${renderLeadSummaryTab(lead)}
          </div>
        </div>`;

      // Tab switching
      content.querySelectorAll(".ts-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          content
            .querySelectorAll(".ts-tab")
            .forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          const tabContent = document.getElementById("leadTabContent");
          switch (tab.dataset.tab) {
            case "summary":
              tabContent.innerHTML = renderLeadSummaryTab(lead);
              break;
            case "checkpoints":
              tabContent.innerHTML = renderCheckpointsTab(cps);
              break;
            case "calls":
              tabContent.innerHTML = renderCallLogsTab(logs);
              break;
            case "orders":
              tabContent.innerHTML = renderOrdersTab(orders);
              break;
          }
        });
      });
    } catch (err) {
      content.innerHTML = `
        <button class="ts-back-btn" onclick="window.__TS__.goBack()"><i class="fas fa-arrow-left"></i> กลับ</button>
        <div class="ts-empty"><i class="fas fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
  }

  function renderLeadSummaryTab(lead) {
    return `
      <div class="ts-card ts-fade-in">
        <div class="ts-card-body">
          <div class="ts-detail-grid">
            <div class="ts-detail-item">
              <div class="ts-detail-label">ชื่อลูกค้า</div>
              <div class="ts-detail-value">${esc(lead.displayName || "-")}</div>
            </div>
            <div class="ts-detail-item">
              <div class="ts-detail-label">เบอร์โทร</div>
              <div class="ts-detail-value">${esc(lead.phone || "-")}</div>
            </div>
            <div class="ts-detail-item">
              <div class="ts-detail-label">แพลตฟอร์ม</div>
              <div class="ts-detail-value">${esc(lead.platform || "-")}</div>
            </div>
            <div class="ts-detail-item">
              <div class="ts-detail-label">สถานะ</div>
              <div class="ts-detail-value"><span class="ts-badge ts-badge-${lead.status || "active"}">${esc(lead.status || "-")}</span></div>
            </div>
            <div class="ts-detail-item">
              <div class="ts-detail-label">กำหนดถัดไป</div>
              <div class="ts-detail-value">${formatDateTime(lead.nextDueAt)}</div>
            </div>
            <div class="ts-detail-item">
              <div class="ts-detail-label">จำนวนออเดอร์</div>
              <div class="ts-detail-value">${(lead.sourceOrderIds || []).length}</div>
            </div>
            <div class="ts-detail-item">
              <div class="ts-detail-label">ติดต่อล่าสุด</div>
              <div class="ts-detail-value">${formatDateTime(lead.lastContactAt)}</div>
            </div>
            <div class="ts-detail-item">
              <div class="ts-detail-label">ปิดการขายล่าสุด</div>
              <div class="ts-detail-value">${formatDateTime(lead.lastTeleSalesWonAt)}</div>
            </div>
            ${
              lead.pauseReason
                ? `<div class="ts-detail-item"><div class="ts-detail-label">เหตุผลพัก</div><div class="ts-detail-value">${esc(lead.pauseReason)}</div></div>`
                : ""
            }
            ${
              lead.needsCycle
                ? `<div class="ts-detail-item" style="grid-column:1/-1;">
                <div style="background:rgba(var(--ts-accent-rgb),0.08); padding:0.6rem 0.8rem; border-radius:var(--ts-radius-sm); border:1px solid rgba(var(--ts-accent-rgb),0.2); font-size:0.8125rem; color:var(--ts-accent);">
                  <i class="fas fa-triangle-exclamation"></i> Lead นี้มีออเดอร์ที่ยังไม่ได้ตั้ง teleSalesCycleDays ต้องไปตั้งค่าที่ออเดอร์ก่อน
                </div>
              </div>`
                : ""
            }
          </div>
        </div>
      </div>`;
  }

  function renderCheckpointsTab(cps) {
    if (!cps.length)
      return '<div class="ts-empty ts-fade-in"><i class="fas fa-timeline"></i><p>ไม่มี checkpoint</p></div>';
    return `
      <div class="ts-timeline ts-fade-in">
        ${cps
          .map(
            (cp) => `
          <div class="ts-timeline-item">
            <div class="ts-timeline-dot ${cp.status}"></div>
            <div class="ts-timeline-content">
              <div class="ts-timeline-head">
                <span class="ts-timeline-title">
                  <span class="ts-badge ts-badge-${cp.type}">${esc(CHECKPOINT_LABELS[cp.type] || cp.type)}</span>
                  <span class="ts-badge ts-badge-${cp.status}">#${cp.seq || 0} ${esc(cp.status)}</span>
                </span>
                <span class="ts-timeline-time">${formatDateTime(cp.dueAt)}</span>
              </div>
              <div class="ts-timeline-body">
                ${cp.resolvedOutcome ? `ผลลัพธ์: <strong>${esc(OUTCOME_LABELS[cp.resolvedOutcome] || cp.resolvedOutcome)}</strong>` : ""}
                ${cp.resolvedAt ? `<br>ปิดเมื่อ: ${formatDateTime(cp.resolvedAt)}` : ""}
                ${cp.cancelReason ? `<br>เหตุผลยกเลิก: ${esc(cp.cancelReason)}` : ""}
              </div>
            </div>
          </div>`,
          )
          .join("")}
      </div>`;
  }

  function renderCallLogsTab(logs) {
    if (!logs.length)
      return '<div class="ts-empty ts-fade-in"><i class="fas fa-phone-slash"></i><p>ไม่มีบันทึกการโทร</p></div>';
    return `
      <div class="ts-card ts-fade-in"><div class="ts-card-body" style="padding:0.5rem 1rem;">
        ${logs
          .map(
            (log) => `
          <div class="ts-call-log-item">
            <div class="ts-call-outcome-icon ${OUTCOME_ICON_CLASS[log.outcome] || "neutral"}">
              <i class="fas ${OUTCOME_ICONS[log.outcome] || "fa-phone"}"></i>
            </div>
            <div class="ts-call-log-body">
              <div class="ts-call-log-outcome">${esc(OUTCOME_LABELS[log.outcome] || log.outcome)}</div>
              ${log.note ? `<div class="ts-call-log-note">${esc(log.note)}</div>` : ""}
            </div>
            <div class="ts-call-log-time">${formatDateTime(log.loggedAt)}</div>
          </div>`,
          )
          .join("")}
      </div></div>`;
  }

  function renderOrdersTab(orders) {
    if (!orders.length)
      return '<div class="ts-empty ts-fade-in"><i class="fas fa-shopping-bag"></i><p>ไม่มีออเดอร์</p></div>';
    return `
      <div class="ts-fade-in">
        ${orders
          .map(
            (order) => `
          <div class="ts-order-card">
            <div class="ts-order-amount">${money(order.totalAmount || 0)}</div>
            <div class="ts-order-info">
              <div class="ts-order-info-line"><strong>${esc(order.customerName || "-")}</strong></div>
              <div class="ts-order-info-line">${esc(order.status || "-")} &middot; ${formatDate(order.createdAt)}</div>
              ${order.items ? `<div class="ts-order-info-line">${(order.items || []).map((i) => esc(i.product || i.name || "-")).join(", ")}</div>` : ""}
            </div>
            ${
              isManager && order._id
                ? `<button class="ts-btn-icon" title="ตั้งค่า Telesales" onclick="event.stopPropagation(); window.__TS__.showOrderSettingsModal('${esc(order._id)}', ${!!order.teleSalesEnabled}, ${order.teleSalesCycleDays || 0})">
                <i class="fas fa-gear"></i>
              </button>`
                : ""
            }
          </div>`,
          )
          .join("")}
      </div>`;
  }

  /* ================================================================
     VIEW: MANAGER QUEUE
     ================================================================ */
  async function renderManagerQueue() {
    const content = document.getElementById("tsContent");
    try {
      // Load sales users for filter
      if (!state.salesUsers.length) {
        const usersRes = await api.get("/api/telesales/sales-users");
        state.salesUsers = usersRes.salesUsers || [];
      }

      let url = "/api/telesales/manager/queue?limit=200";
      if (state.filters.managerQueueSalesUser) {
        url += `&salesUserId=${encodeURIComponent(state.filters.managerQueueSalesUser)}`;
      }

      const data = await api.get(url);
      state.managerQueueData = data;
      const s = data.summary || {};

      content.innerHTML = `
        <div class="ts-fade-in">
          <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:1.25rem;">คิวทั้งทีม</h2>
          <div class="ts-stats-grid ts-stagger">
            ${statCard("fas fa-clock", "primary", s.due_today || 0, "ครบกำหนดวันนี้")}
            ${statCard("fas fa-exclamation-triangle", "danger", s.overdue || 0, "เลยกำหนด")}
            ${statCard("fas fa-phone-flip", "accent", s.callback_pending || 0, "รอโทรกลับ")}
            ${statCard("fas fa-list", "info", (data.items || []).length, "ทั้งหมด")}
          </div>
          <div class="ts-filter-bar">
            <span style="font-size:0.8rem; font-weight:600; color:var(--ts-text-sub);">กรองเซลล์:</span>
            <span class="ts-filter-pill ${!state.filters.managerQueueSalesUser ? "active" : ""}"
                  onclick="window.__TS__.filterManagerQueue('')">ทั้งหมด</span>
            ${state.salesUsers
              .map(
                (u) => `
              <span class="ts-filter-pill ${state.filters.managerQueueSalesUser === u.id ? "active" : ""}"
                    onclick="window.__TS__.filterManagerQueue('${esc(u.id)}')">${esc(u.name)}</span>
            `,
              )
              .join("")}
          </div>
          <div class="ts-queue-list ts-stagger">
            ${renderQueueItems(data.items || [])}
          </div>
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="ts-empty"><i class="fas fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ================================================================
     VIEW: MANAGER LEADS
     ================================================================ */
  async function renderManagerLeads() {
    const content = document.getElementById("tsContent");
    try {
      if (!state.salesUsers.length) {
        const usersRes = await api.get("/api/telesales/sales-users");
        state.salesUsers = usersRes.salesUsers || [];
      }

      let url = "/api/telesales/manager/leads?limit=200";
      if (state.filters.managerLeadStatus)
        url += `&status=${encodeURIComponent(state.filters.managerLeadStatus)}`;
      if (state.filters.managerLeadOwner)
        url += `&ownerSalesUserId=${encodeURIComponent(state.filters.managerLeadOwner)}`;
      if (state.filters.managerLeadNeedsCycle) url += "&needsCycle=true";

      const data = await api.get(url);
      state.managerLeadsData = data;
      const leads = data.leads || [];

      content.innerHTML = `
        <div class="ts-fade-in">
          <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:1.25rem;">Lead ทั้งหมด (${leads.length})</h2>
          <div class="ts-filter-bar">
            <span style="font-size:0.8rem; font-weight:600; color:var(--ts-text-sub);">สถานะ:</span>
            <span class="ts-filter-pill ${!state.filters.managerLeadStatus ? "active" : ""}"
                  onclick="window.__TS__.filterLeads('status','')">ทั้งหมด</span>
            <span class="ts-filter-pill ${state.filters.managerLeadStatus === "active" ? "active" : ""}"
                  onclick="window.__TS__.filterLeads('status','active')">Active</span>
            <span class="ts-filter-pill ${state.filters.managerLeadStatus === "paused" ? "active" : ""}"
                  onclick="window.__TS__.filterLeads('status','paused')">Paused</span>
            <span class="ts-filter-pill ${state.filters.managerLeadNeedsCycle ? "active" : ""}"
                  onclick="window.__TS__.filterLeads('needsCycle',!${state.filters.managerLeadNeedsCycle})">ต้องตั้ง Cycle</span>
          </div>
          <div class="ts-filter-bar">
            <span style="font-size:0.8rem; font-weight:600; color:var(--ts-text-sub);">เจ้าของ:</span>
            <span class="ts-filter-pill ${!state.filters.managerLeadOwner ? "active" : ""}"
                  onclick="window.__TS__.filterLeads('owner','')">ทั้งหมด</span>
            ${state.salesUsers
              .map(
                (u) => `
              <span class="ts-filter-pill ${state.filters.managerLeadOwner === u.id ? "active" : ""}"
                    onclick="window.__TS__.filterLeads('owner','${esc(u.id)}')">${esc(u.name)}</span>
            `,
              )
              .join("")}
          </div>
          <div class="ts-card">
            <div class="ts-table-wrap">
              <table class="ts-table">
                <thead>
                  <tr>
                    <th>ชื่อ</th>
                    <th>เบอร์</th>
                    <th>สถานะ</th>
                    <th>เจ้าของ</th>
                    <th>กำหนดถัดไป</th>
                    <th>ออเดอร์</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    leads.length
                      ? leads
                          .map(
                            (lead) => `
                    <tr style="cursor:pointer;" onclick="window.__TS__.openLead('${esc(lead.id || lead._id)}')">
                      <td><strong>${esc(lead.displayName || "-")}</strong></td>
                      <td>${esc(lead.phone || "-")}</td>
                      <td><span class="ts-badge ts-badge-${lead.status}">${esc(lead.status)}</span>
                        ${lead.needsCycle ? '<span class="ts-badge ts-badge-paused" style="margin-left:0.25rem;">Cycle</span>' : ""}
                      </td>
                      <td>${esc(ownerName(lead.ownerSalesUserId))}</td>
                      <td class="${dueClass(lead.nextDueAt)}" style="font-weight:600; font-size:0.8rem;">${formatDate(lead.nextDueAt)}</td>
                      <td>${(lead.sourceOrderIds || []).length}</td>
                      <td>
                        <button class="ts-btn-icon" title="Assign" onclick="event.stopPropagation(); window.__TS__.showAssignModal('${esc(lead.id || lead._id)}')">
                          <i class="fas fa-user-plus"></i>
                        </button>
                      </td>
                    </tr>`,
                          )
                          .join("")
                      : '<tr><td colspan="7" style="text-align:center; color:var(--ts-text-muted); padding:2rem;">ไม่มีข้อมูล</td></tr>'
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="ts-empty"><i class="fas fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
  }

  function ownerName(id) {
    if (!id) return "-";
    const u = state.salesUsers.find((u) => u.id === id);
    return u ? u.name : id.slice(-6);
  }

  /* ================================================================
     VIEW: SALES USERS
     ================================================================ */
  async function renderSalesUsers() {
    const content = document.getElementById("tsContent");
    try {
      const data = await api.get("/api/telesales/sales-users");
      state.salesUsers = data.salesUsers || [];

      content.innerHTML = `
        <div class="ts-fade-in">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.25rem;">
            <h2 style="font-size:1.25rem; font-weight:700; margin:0;">จัดการพนักงานขาย (${state.salesUsers.length})</h2>
            <button class="ts-btn ts-btn-primary ts-btn-sm" onclick="window.__TS__.showCreateSalesUserModal()">
              <i class="fas fa-plus"></i> เพิ่มพนักงาน
            </button>
          </div>
          <div class="ts-card">
            <div class="ts-table-wrap">
              <table class="ts-table">
                <thead>
                  <tr>
                    <th>ชื่อ</th>
                    <th>รหัส</th>
                    <th>บทบาท</th>
                    <th>เบอร์โทร</th>
                    <th>สถานะ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${state.salesUsers
                    .map(
                      (u) => `
                    <tr>
                      <td><strong>${esc(u.name)}</strong></td>
                      <td><code style="font-size:0.8rem; background:var(--ts-body-bg); padding:0.1rem 0.4rem; border-radius:3px;">${esc(u.code)}</code></td>
                      <td>${esc(u.role === "sales_manager" ? "ผู้จัดการ" : "เซลล์")}</td>
                      <td>${esc(u.phone || "-")}</td>
                      <td>${u.isActive ? '<span class="ts-badge ts-badge-active">ใช้งาน</span>' : '<span class="ts-badge ts-badge-archived">ปิดใช้งาน</span>'}</td>
                      <td>
                        <button class="ts-btn-icon" title="แก้ไข" onclick="window.__TS__.showEditSalesUserModal('${esc(u.id)}')">
                          <i class="fas fa-pen"></i>
                        </button>
                      </td>
                    </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="ts-empty"><i class="fas fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ================================================================
     VIEW: REPORTS
     ================================================================ */
  async function renderReports() {
    const content = document.getElementById("tsContent");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const data = await api.get(
        `/api/telesales/reports/daily?dateKey=${today}`,
      );
      state.reportsData = data;
      const reports = data.reports || [];
      const systemReport = reports.find((r) => r.scopeType === "system");

      content.innerHTML = `
        <div class="ts-fade-in">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.25rem;">
            <h2 style="font-size:1.25rem; font-weight:700; margin:0;">รายงานประจำวัน</h2>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <input type="date" class="ts-form-input" id="reportDateInput" value="${today}" style="width:auto; padding:0.35rem 0.6rem; font-size:0.8rem;">
              <button class="ts-btn ts-btn-ghost ts-btn-sm" onclick="window.__TS__.loadReport()">
                <i class="fas fa-search"></i> ดู
              </button>
              <button class="ts-btn ts-btn-primary ts-btn-sm" onclick="window.__TS__.runReport()">
                <i class="fas fa-play"></i> สร้างรายงาน
              </button>
            </div>
          </div>
          ${
            systemReport
              ? `
            <div class="ts-card" style="margin-bottom:1rem;">
              <div class="ts-card-header">
                <div class="ts-card-title">สรุปภาพรวม (${esc(systemReport.dateKey)})</div>
              </div>
              <div class="ts-card-body">
                <div class="ts-report-stat-grid ts-stagger">
                  <div class="ts-report-stat">
                    <div class="ts-report-stat-value">${systemReport.totalLeads || 0}</div>
                    <div class="ts-report-stat-label">Lead ทั้งหมด</div>
                  </div>
                  <div class="ts-report-stat">
                    <div class="ts-report-stat-value">${systemReport.activeLeads || 0}</div>
                    <div class="ts-report-stat-label">Active</div>
                  </div>
                  <div class="ts-report-stat">
                    <div class="ts-report-stat-value">${systemReport.contactedCount || 0}</div>
                    <div class="ts-report-stat-label">ติดต่อแล้ว</div>
                  </div>
                  <div class="ts-report-stat">
                    <div class="ts-report-stat-value">${systemReport.closedWonCount || 0}</div>
                    <div class="ts-report-stat-label">ปิดการขาย</div>
                  </div>
                  <div class="ts-report-stat">
                    <div class="ts-report-stat-value">${systemReport.callsLoggedCount || 0}</div>
                    <div class="ts-report-stat-label">จำนวนโทร</div>
                  </div>
                  <div class="ts-report-stat">
                    <div class="ts-report-stat-value">${systemReport.assistedReorderCount || 0}</div>
                    <div class="ts-report-stat-label">สั่งซ้ำผ่าน AI</div>
                  </div>
                  <div class="ts-report-stat">
                    <div class="ts-report-stat-value">${systemReport.newLeadsCount || 0}</div>
                    <div class="ts-report-stat-label">Lead ใหม่</div>
                  </div>
                </div>
                ${systemReport.summary ? `<div class="ts-report-summary">${esc(systemReport.summary)}</div>` : ""}
              </div>
            </div>
          `
              : '<div class="ts-empty"><i class="fas fa-chart-pie"></i><p>ยังไม่มีรายงานสำหรับวันนี้ กดปุ่ม "สร้างรายงาน" เพื่อสร้าง</p></div>'
          }
          ${reports
            .filter((r) => r.scopeType === "individual")
            .map(
              (r) => `
            <div class="ts-card" style="margin-bottom:0.75rem;">
              <div class="ts-card-header">
                <div class="ts-card-title">${esc(ownerName(r.scopeId) || r.scopeId)}</div>
              </div>
              <div class="ts-card-body">
                <div style="display:flex; gap:1.5rem; flex-wrap:wrap; font-size:0.8125rem;">
                  <span>ติดต่อ: <strong>${r.contactedCount || 0}</strong></span>
                  <span>ปิดการขาย: <strong>${r.closedWonCount || 0}</strong></span>
                  <span>โทร: <strong>${r.callsLoggedCount || 0}</strong></span>
                  <span>Lead ใหม่: <strong>${r.newLeadsCount || 0}</strong></span>
                </div>
                ${r.summary ? `<div class="ts-report-summary" style="margin-top:0.75rem; font-size:0.8rem;">${esc(r.summary)}</div>` : ""}
              </div>
            </div>`,
            )
            .join("")}
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="ts-empty"><i class="fas fa-circle-exclamation"></i><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ================================================================
     MODALS
     ================================================================ */
  function showModal(title, bodyHtml, footerHtml) {
    // Remove existing
    const existing = document.querySelector(".ts-modal-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "ts-modal-overlay";
    overlay.innerHTML = `
      <div class="ts-modal">
        <div class="ts-modal-header">
          <div class="ts-modal-title">${title}</div>
          <button class="ts-modal-close" onclick="window.__TS__.closeModal()">&times;</button>
        </div>
        <div class="ts-modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="ts-modal-footer">${footerHtml}</div>` : ""}
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  function closeModal() {
    const overlay = document.querySelector(".ts-modal-overlay");
    if (overlay) {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
    }
  }

  /* ==================== LOG CALL MODAL ==================== */
  function showLogCallModal(checkpointId) {
    const outcomes = [
      "no_answer",
      "busy",
      "call_back",
      "interested",
      "not_interested",
      "already_bought_elsewhere",
      "wrong_number",
      "do_not_call",
    ];

    const body = `
      <div class="ts-form-group">
        <div class="ts-form-label">ผลการโทร <span class="required">*</span></div>
        <div class="ts-outcome-grid" id="outcomeGrid">
          ${outcomes
            .map(
              (o) => `
            <div class="ts-outcome-option" data-outcome="${o}" onclick="window.__TS__.selectOutcome(this, '${o}')">
              <span class="ts-outcome-dot ${OUTCOME_COLORS[o]}"></span>
              ${esc(OUTCOME_LABELS[o])}
            </div>`,
            )
            .join("")}
        </div>
      </div>
      <div class="ts-form-group">
        <label class="ts-form-label">หมายเหตุ <span class="required">*</span></label>
        <textarea class="ts-form-textarea" id="logCallNote" rows="3" placeholder="บันทึกรายละเอียดการโทร..." maxlength="4000"></textarea>
      </div>
      <div class="ts-form-group" id="nextCheckpointGroup" style="display:none;">
        <label class="ts-form-label">นัดโทรครั้งถัดไป <span class="required">*</span></label>
        <input type="datetime-local" class="ts-form-input" id="logCallNextAt">
        <div class="ts-form-hint">เลือกวันเวลาที่ต้องการโทรครั้งถัดไป</div>
      </div>
      <div id="logCallTerminalWarning" style="display:none;
        background:var(--ts-danger-light); padding:0.6rem 0.8rem; border-radius:var(--ts-radius-sm);
        border-left:3px solid var(--ts-danger); font-size:0.8rem; color:var(--ts-danger); margin-top:0.5rem;">
        <i class="fas fa-triangle-exclamation"></i> ผลลัพธ์นี้จะเปลี่ยนสถานะ lead เป็น paused/dnc
      </div>`;

    const footer = `
      <button class="ts-btn ts-btn-ghost" onclick="window.__TS__.closeModal()">ยกเลิก</button>
      <button class="ts-btn ts-btn-primary" id="logCallSubmitBtn" onclick="window.__TS__.submitLogCall('${esc(checkpointId)}')">
        <i class="fas fa-check"></i> บันทึก
      </button>`;

    showModal("บันทึกการโทร", body, footer);
    state._selectedOutcome = null;
  }

  function selectOutcome(el, outcome) {
    document.querySelectorAll(".ts-outcome-option").forEach((o) => {
      o.classList.remove("selected");
    });
    el.classList.add("selected");
    state._selectedOutcome = outcome;

    const nextGroup = document.getElementById("nextCheckpointGroup");
    const termWarn = document.getElementById("logCallTerminalWarning");
    nextGroup.style.display = NEEDS_NEXT.has(outcome) ? "block" : "none";
    termWarn.style.display = TERMINAL_OUTCOMES.has(outcome) ? "block" : "none";
  }

  async function submitLogCall(checkpointId) {
    const outcome = state._selectedOutcome;
    const note = document.getElementById("logCallNote").value.trim();
    const nextAtEl = document.getElementById("logCallNextAt");
    const btn = document.getElementById("logCallSubmitBtn");

    if (!outcome) return toast("กรุณาเลือกผลการโทร", "warning");
    if (!note) return toast("กรุณากรอกหมายเหตุ", "warning");
    if (NEEDS_NEXT.has(outcome) && !nextAtEl.value)
      return toast("กรุณาเลือกวันนัดโทรครั้งถัดไป", "warning");

    const body = { outcome, note };
    if (NEEDS_NEXT.has(outcome) && nextAtEl.value) {
      body.nextCheckpointAt = new Date(nextAtEl.value).toISOString();
    }

    btn.disabled = true;
    btn.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> กำลังบันทึก...';

    try {
      await api.post(
        `/api/telesales/checkpoints/${checkpointId}/log-call`,
        body,
      );
      toast("บันทึกการโทรสำเร็จ");
      closeModal();
      // Refresh current view
      if (state.currentLeadId) renderLeadDetail(state.currentLeadId);
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> บันทึก';
    }
  }

  /* ==================== CREATE ORDER MODAL ==================== */
  function showCreateOrderModal(checkpointId) {
    const lead = state.leadDetail?.lead || {};

    const body = `
      <div class="ts-form-group">
        <label class="ts-form-label">หมายเหตุโทร</label>
        <textarea class="ts-form-textarea" id="orderCallNote" rows="2" placeholder="รายละเอียดการโทร..."></textarea>
      </div>
      <hr style="border:none; border-top:1px solid var(--ts-border-light); margin:1rem 0;">
      <h4 style="font-size:0.9rem; font-weight:700; margin-bottom:0.75rem;">รายการสินค้า</h4>
      <div id="orderItemsContainer">
        <div class="ts-order-item-row" data-idx="0">
          <div class="ts-form-group" style="margin:0">
            <input class="ts-form-input" placeholder="สินค้า" data-field="product">
          </div>
          <div class="ts-form-group" style="margin:0">
            <input class="ts-form-input" type="number" min="1" value="1" placeholder="จำนวน" data-field="quantity">
          </div>
          <div class="ts-form-group" style="margin:0">
            <input class="ts-form-input" type="number" min="0" placeholder="ราคา" data-field="price">
          </div>
          <button class="ts-btn-icon" onclick="this.closest('.ts-order-item-row').remove(); window.__TS__.recalcOrderTotal();" style="margin-bottom:0;">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <button class="ts-btn ts-btn-ghost ts-btn-sm" onclick="window.__TS__.addOrderItem()" style="margin-top:0.5rem;">
        <i class="fas fa-plus"></i> เพิ่มรายการ
      </button>
      <div class="ts-order-items-total" id="orderTotal">รวม: 0 บาท</div>
      <hr style="border:none; border-top:1px solid var(--ts-border-light); margin:1rem 0;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
        <div class="ts-form-group">
          <label class="ts-form-label">ชื่อลูกค้า</label>
          <input class="ts-form-input" id="orderCustomerName" value="${esc(lead.displayName || "")}">
        </div>
        <div class="ts-form-group">
          <label class="ts-form-label">เบอร์โทร</label>
          <input class="ts-form-input" id="orderPhone" value="${esc(lead.phone || "")}">
        </div>
      </div>
      <div class="ts-form-group">
        <label class="ts-form-label">ที่อยู่จัดส่ง</label>
        <textarea class="ts-form-textarea" id="orderAddress" rows="2"></textarea>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
        <div class="ts-form-group">
          <label class="ts-form-label">การชำระเงิน</label>
          <select class="ts-form-select" id="orderPayment">
            <option value="เก็บเงินปลายทาง">เก็บเงินปลายทาง</option>
            <option value="โอนเงิน">โอนเงิน</option>
            <option value="บัตรเครดิต">บัตรเครดิต</option>
          </select>
        </div>
        <div class="ts-form-group">
          <label class="ts-form-label">Cycle Days</label>
          <input class="ts-form-input" type="number" id="orderCycleDays" min="1" value="10" placeholder="วัน">
        </div>
      </div>`;

    const footer = `
      <button class="ts-btn ts-btn-ghost" onclick="window.__TS__.closeModal()">ยกเลิก</button>
      <button class="ts-btn ts-btn-accent" id="createOrderSubmitBtn" onclick="window.__TS__.submitCreateOrder('${esc(checkpointId)}')">
        <i class="fas fa-shopping-cart"></i> สร้างออเดอร์
      </button>`;

    showModal("สร้างออเดอร์จากการโทร", body, footer);

    // Bind input events for recalc
    document
      .getElementById("orderItemsContainer")
      .addEventListener("input", () => recalcOrderTotal());
  }

  function addOrderItem() {
    const container = document.getElementById("orderItemsContainer");
    const idx = container.children.length;
    const row = document.createElement("div");
    row.className = "ts-order-item-row";
    row.dataset.idx = idx;
    row.innerHTML = `
      <div class="ts-form-group" style="margin:0"><input class="ts-form-input" placeholder="สินค้า" data-field="product"></div>
      <div class="ts-form-group" style="margin:0"><input class="ts-form-input" type="number" min="1" value="1" placeholder="จำนวน" data-field="quantity"></div>
      <div class="ts-form-group" style="margin:0"><input class="ts-form-input" type="number" min="0" placeholder="ราคา" data-field="price"></div>
      <button class="ts-btn-icon" onclick="this.closest('.ts-order-item-row').remove(); window.__TS__.recalcOrderTotal();" style="margin-bottom:0;"><i class="fas fa-trash"></i></button>`;
    container.appendChild(row);
  }

  function recalcOrderTotal() {
    const rows = document.querySelectorAll(".ts-order-item-row");
    let total = 0;
    rows.forEach((row) => {
      const qty =
        parseFloat(
          row.querySelector('[data-field="quantity"]')?.value || 0,
        ) || 0;
      const price =
        parseFloat(row.querySelector('[data-field="price"]')?.value || 0) || 0;
      total += qty * price;
    });
    const el = document.getElementById("orderTotal");
    if (el) el.textContent = `รวม: ${money(total)} บาท`;
  }

  async function submitCreateOrder(checkpointId) {
    const btn = document.getElementById("createOrderSubmitBtn");
    const rows = document.querySelectorAll(".ts-order-item-row");
    const items = [];
    let totalAmount = 0;

    rows.forEach((row) => {
      const product =
        row.querySelector('[data-field="product"]')?.value?.trim() || "";
      const qty =
        parseInt(row.querySelector('[data-field="quantity"]')?.value) || 1;
      const price =
        parseFloat(row.querySelector('[data-field="price"]')?.value) || 0;
      if (product) {
        items.push({ product, quantity: qty, price });
        totalAmount += qty * price;
      }
    });

    if (!items.length) return toast("กรุณาเพิ่มอย่างน้อย 1 รายการ", "warning");

    const customerName =
      document.getElementById("orderCustomerName")?.value?.trim() || "";
    const phone = document.getElementById("orderPhone")?.value?.trim() || "";
    const address = document.getElementById("orderAddress")?.value?.trim() || "";
    const payment = document.getElementById("orderPayment")?.value || "";
    const cycleDays =
      parseInt(document.getElementById("orderCycleDays")?.value) || 10;
    const callNote =
      document.getElementById("orderCallNote")?.value?.trim() || "";

    const payload = {
      callNote,
      status: "pending",
      notes: "เทเลเซลล์ปิดการขาย",
      teleSalesEnabled: true,
      teleSalesCycleDays: cycleDays,
      orderData: {
        items,
        totalAmount,
        customerName,
        recipientName: customerName,
        phone,
        shippingAddress: address,
        paymentMethod: payment,
      },
    };

    btn.disabled = true;
    btn.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> กำลังสร้าง...';

    try {
      await api.post(
        `/api/telesales/checkpoints/${checkpointId}/create-order`,
        payload,
      );
      toast("สร้างออเดอร์สำเร็จ!");
      closeModal();
      if (state.currentLeadId) renderLeadDetail(state.currentLeadId);
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-shopping-cart"></i> สร้างออเดอร์';
    }
  }

  /* ==================== ASSIGN MODAL ==================== */
  async function showAssignModal(leadId) {
    if (!state.salesUsers.length) {
      const data = await api.get("/api/telesales/sales-users");
      state.salesUsers = data.salesUsers || [];
    }

    const body = `
      <div class="ts-form-group">
        <label class="ts-form-label">เลือกพนักงาน</label>
        <select class="ts-form-select" id="assignSalesUserId">
          <option value="">-- เลือก --</option>
          ${state.salesUsers
            .filter((u) => u.isActive)
            .map(
              (u) =>
                `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.code)})</option>`,
            )
            .join("")}
        </select>
      </div>`;

    const footer = `
      <button class="ts-btn ts-btn-ghost" onclick="window.__TS__.closeModal()">ยกเลิก</button>
      <button class="ts-btn ts-btn-primary" id="assignSubmitBtn" onclick="window.__TS__.submitAssign('${esc(leadId)}')">
        <i class="fas fa-user-plus"></i> Assign
      </button>`;

    showModal("Assign Lead", body, footer);
  }

  async function submitAssign(leadId) {
    const salesUserId = document.getElementById("assignSalesUserId")?.value;
    const btn = document.getElementById("assignSubmitBtn");
    if (!salesUserId) return toast("กรุณาเลือกพนักงาน", "warning");

    btn.disabled = true;
    try {
      await api.post(`/api/telesales/leads/${leadId}/assign`, { salesUserId });
      toast("Assign สำเร็จ");
      closeModal();
      if (state.currentView === "lead-detail")
        renderLeadDetail(state.currentLeadId);
      else if (state.currentView === "manager-leads") renderManagerLeads();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  /* ==================== PAUSE MODAL ==================== */
  function showPauseModal(leadId) {
    const body = `
      <div class="ts-form-group">
        <label class="ts-form-label">สถานะ</label>
        <select class="ts-form-select" id="pauseStatus">
          <option value="paused">พัก (paused)</option>
          <option value="dnc">ห้ามโทร (DNC)</option>
        </select>
      </div>
      <div class="ts-form-group">
        <label class="ts-form-label">เหตุผล</label>
        <textarea class="ts-form-textarea" id="pauseReason" rows="2" placeholder="ระบุเหตุผล..."></textarea>
      </div>`;

    const footer = `
      <button class="ts-btn ts-btn-ghost" onclick="window.__TS__.closeModal()">ยกเลิก</button>
      <button class="ts-btn ts-btn-danger" id="pauseSubmitBtn" onclick="window.__TS__.submitPause('${esc(leadId)}')">
        <i class="fas fa-pause"></i> พักงาน
      </button>`;

    showModal("พัก Lead", body, footer);
  }

  async function submitPause(leadId) {
    const status = document.getElementById("pauseStatus")?.value || "paused";
    const reason = document.getElementById("pauseReason")?.value?.trim() || "";
    const btn = document.getElementById("pauseSubmitBtn");

    btn.disabled = true;
    try {
      await api.post(`/api/telesales/leads/${leadId}/pause`, {
        status,
        reason,
      });
      toast("พัก Lead สำเร็จ");
      closeModal();
      if (state.currentView === "lead-detail")
        renderLeadDetail(state.currentLeadId);
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  /* ==================== REOPEN MODAL ==================== */
  function showReopenModal(leadId) {
    const body = `
      <div class="ts-form-group">
        <label class="ts-form-label">กำหนดวันครบกำหนด <span class="required">*</span></label>
        <input type="datetime-local" class="ts-form-input" id="reopenDueAt">
      </div>
      ${
        isManager
          ? `
        <div class="ts-form-group">
          <label class="ts-form-label">Assign ให้</label>
          <select class="ts-form-select" id="reopenAssignTo">
            <option value="">-- เจ้าของเดิม --</option>
            ${state.salesUsers
              .filter((u) => u.isActive)
              .map(
                (u) =>
                  `<option value="${esc(u.id)}">${esc(u.name)}</option>`,
              )
              .join("")}
          </select>
        </div>
      `
          : ""
      }`;

    const footer = `
      <button class="ts-btn ts-btn-ghost" onclick="window.__TS__.closeModal()">ยกเลิก</button>
      <button class="ts-btn ts-btn-primary" id="reopenSubmitBtn" onclick="window.__TS__.submitReopen('${esc(leadId)}')">
        <i class="fas fa-play"></i> เปิดใหม่
      </button>`;

    showModal("เปิด Lead ใหม่", body, footer);
  }

  async function submitReopen(leadId) {
    const dueAtVal = document.getElementById("reopenDueAt")?.value;
    const assignTo = document.getElementById("reopenAssignTo")?.value || undefined;
    const btn = document.getElementById("reopenSubmitBtn");

    if (!dueAtVal) return toast("กรุณาเลือกวันครบกำหนด", "warning");

    const body = { dueAt: new Date(dueAtVal).toISOString() };
    if (assignTo) body.assignedToSalesUserId = assignTo;

    btn.disabled = true;
    try {
      await api.post(`/api/telesales/leads/${leadId}/reopen`, body);
      toast("เปิด Lead ใหม่สำเร็จ");
      closeModal();
      if (state.currentView === "lead-detail")
        renderLeadDetail(state.currentLeadId);
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  /* ==================== ORDER SETTINGS MODAL ==================== */
  function showOrderSettingsModal(orderId, currentEnabled, currentCycleDays) {
    const body = `
      <div class="ts-form-group">
        <label class="ts-form-label">เปิดระบบ TeleSales</label>
        <select class="ts-form-select" id="orderTsEnabled">
          <option value="true" ${currentEnabled ? "selected" : ""}>เปิด</option>
          <option value="false" ${!currentEnabled ? "selected" : ""}>ปิด</option>
        </select>
      </div>
      <div class="ts-form-group">
        <label class="ts-form-label">Cycle Days (วัน)</label>
        <input class="ts-form-input" type="number" id="orderTsCycleDays" min="1" value="${currentCycleDays || ""}">
        <div class="ts-form-hint">จำนวนวันก่อนโทรสั่งซ้ำ</div>
      </div>`;

    const footer = `
      <button class="ts-btn ts-btn-ghost" onclick="window.__TS__.closeModal()">ยกเลิก</button>
      <button class="ts-btn ts-btn-primary" id="orderTsSubmitBtn" onclick="window.__TS__.submitOrderSettings('${esc(orderId)}')">
        <i class="fas fa-check"></i> บันทึก
      </button>`;

    showModal("ตั้งค่า TeleSales ของออเดอร์", body, footer);
  }

  async function submitOrderSettings(orderId) {
    const enabled =
      document.getElementById("orderTsEnabled")?.value === "true";
    const cycleDays =
      parseInt(document.getElementById("orderTsCycleDays")?.value) || undefined;
    const btn = document.getElementById("orderTsSubmitBtn");

    btn.disabled = true;
    try {
      await api.patch(`/admin/orders/${orderId}/telesales-settings`, {
        teleSalesEnabled: enabled,
        teleSalesCycleDays: cycleDays,
      });
      toast("บันทึกสำเร็จ");
      closeModal();
      if (state.currentLeadId) renderLeadDetail(state.currentLeadId);
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  /* ==================== CREATE SALES USER MODAL ==================== */
  function showCreateSalesUserModal() {
    const body = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
        <div class="ts-form-group">
          <label class="ts-form-label">ชื่อ <span class="required">*</span></label>
          <input class="ts-form-input" id="newSalesName" placeholder="ชื่อ">
        </div>
        <div class="ts-form-group">
          <label class="ts-form-label">รหัส <span class="required">*</span></label>
          <input class="ts-form-input" id="newSalesCode" placeholder="เช่น sale01">
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
        <div class="ts-form-group">
          <label class="ts-form-label">รหัสผ่าน <span class="required">*</span></label>
          <input class="ts-form-input" type="password" id="newSalesPassword" placeholder="4+ ตัวอักษร">
        </div>
        <div class="ts-form-group">
          <label class="ts-form-label">บทบาท</label>
          <select class="ts-form-select" id="newSalesRole">
            <option value="sales">เซลล์</option>
            <option value="sales_manager">ผู้จัดการ</option>
          </select>
        </div>
      </div>
      <div class="ts-form-group">
        <label class="ts-form-label">เบอร์โทร</label>
        <input class="ts-form-input" id="newSalesPhone" placeholder="089xxxxxxx">
      </div>`;

    const footer = `
      <button class="ts-btn ts-btn-ghost" onclick="window.__TS__.closeModal()">ยกเลิก</button>
      <button class="ts-btn ts-btn-primary" id="createSalesUserBtn" onclick="window.__TS__.submitCreateSalesUser()">
        <i class="fas fa-plus"></i> สร้าง
      </button>`;

    showModal("เพิ่มพนักงานขาย", body, footer);
  }

  async function submitCreateSalesUser() {
    const btn = document.getElementById("createSalesUserBtn");
    const name = document.getElementById("newSalesName")?.value?.trim();
    const code = document.getElementById("newSalesCode")?.value?.trim();
    const password = document.getElementById("newSalesPassword")?.value;
    const role = document.getElementById("newSalesRole")?.value || "sales";
    const phone = document.getElementById("newSalesPhone")?.value?.trim();

    if (!name || !code || !password)
      return toast("กรุณากรอกข้อมูลให้ครบ", "warning");

    btn.disabled = true;
    try {
      await api.post("/api/telesales/sales-users", {
        name,
        code,
        password,
        role,
        phone,
        isActive: true,
      });
      toast("สร้างพนักงานสำเร็จ");
      closeModal();
      renderSalesUsers();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  /* ==================== EDIT SALES USER MODAL ==================== */
  function showEditSalesUserModal(userId) {
    const user = state.salesUsers.find((u) => u.id === userId);
    if (!user) return toast("ไม่พบข้อมูลพนักงาน", "error");

    const body = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
        <div class="ts-form-group">
          <label class="ts-form-label">ชื่อ</label>
          <input class="ts-form-input" id="editSalesName" value="${esc(user.name)}">
        </div>
        <div class="ts-form-group">
          <label class="ts-form-label">บทบาท</label>
          <select class="ts-form-select" id="editSalesRole">
            <option value="sales" ${user.role === "sales" ? "selected" : ""}>เซลล์</option>
            <option value="sales_manager" ${user.role === "sales_manager" ? "selected" : ""}>ผู้จัดการ</option>
          </select>
        </div>
      </div>
      <div class="ts-form-group">
        <label class="ts-form-label">เบอร์โทร</label>
        <input class="ts-form-input" id="editSalesPhone" value="${esc(user.phone || "")}">
      </div>
      <div class="ts-form-group">
        <label class="ts-form-label">รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label>
        <input class="ts-form-input" type="password" id="editSalesPassword" placeholder="รหัสผ่านใหม่">
      </div>
      <div class="ts-form-group">
        <label class="ts-form-label">สถานะ</label>
        <select class="ts-form-select" id="editSalesActive">
          <option value="true" ${user.isActive ? "selected" : ""}>ใช้งาน</option>
          <option value="false" ${!user.isActive ? "selected" : ""}>ปิดใช้งาน</option>
        </select>
      </div>`;

    const footer = `
      <button class="ts-btn ts-btn-ghost" onclick="window.__TS__.closeModal()">ยกเลิก</button>
      <button class="ts-btn ts-btn-primary" id="editSalesUserBtn" onclick="window.__TS__.submitEditSalesUser('${esc(userId)}')">
        <i class="fas fa-check"></i> บันทึก
      </button>`;

    showModal(`แก้ไข: ${esc(user.name)}`, body, footer);
  }

  async function submitEditSalesUser(userId) {
    const btn = document.getElementById("editSalesUserBtn");
    const patch = {
      name: document.getElementById("editSalesName")?.value?.trim(),
      role: document.getElementById("editSalesRole")?.value,
      phone: document.getElementById("editSalesPhone")?.value?.trim(),
      isActive:
        document.getElementById("editSalesActive")?.value === "true",
    };
    const newPass = document.getElementById("editSalesPassword")?.value;
    if (newPass) patch.password = newPass;

    btn.disabled = true;
    try {
      await api.patch(`/api/telesales/sales-users/${userId}`, patch);
      toast("อัปเดตสำเร็จ");
      closeModal();
      renderSalesUsers();
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  }

  /* ================================================================
     REPORT ACTIONS
     ================================================================ */
  async function loadReport() {
    const dateKey = document.getElementById("reportDateInput")?.value;
    if (!dateKey) return;
    state.currentView = "reports";
    const content = document.getElementById("tsContent");
    content.innerHTML =
      '<div class="ts-loading"><div class="ts-spinner"></div> กำลังโหลด...</div>';
    try {
      const data = await api.get(
        `/api/telesales/reports/daily?dateKey=${dateKey}`,
      );
      state.reportsData = data;
      renderReports();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function runReport() {
    const dateKey =
      document.getElementById("reportDateInput")?.value ||
      new Date().toISOString().slice(0, 10);
    try {
      toast("กำลังสร้างรายงาน...", "warning");
      await api.post("/api/telesales/reports/daily/run", {
        dateKey,
        send: true,
      });
      toast("สร้างรายงานสำเร็จ");
      renderReports();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  /* ================================================================
     INIT
     ================================================================ */
  function init() {
    if (!state.user) {
      window.location.href = "/sales/login";
      return;
    }

    // Set user info
    document.getElementById("tsUserAvatar").textContent = initial(
      state.user.name,
    );
    document.getElementById("tsUserName").textContent =
      state.user.name || state.user.code;
    document.getElementById("tsUserRole").textContent =
      state.user.role === "sales_manager" ? "ผู้จัดการ" : "เซลล์";

    // Show manager nav
    if (isManager) {
      document.getElementById("navManagerSection").style.display = "block";
    }

    // Nav clicks
    document.querySelectorAll(".ts-nav-item[data-view]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.dataset.view));
    });

    // Mobile toggle
    document.getElementById("tsMobileToggle").addEventListener("click", () => {
      document.getElementById("tsSidebar").classList.toggle("open");
      document.getElementById("tsSidebarOverlay").classList.toggle("show");
    });
    document
      .getElementById("tsSidebarOverlay")
      .addEventListener("click", () => {
        document.getElementById("tsSidebar").classList.remove("open");
        document.getElementById("tsSidebarOverlay").classList.remove("show");
      });

    // Logout
    document
      .getElementById("tsLogoutBtn")
      .addEventListener("click", async () => {
        try {
          await fetch("/sales/logout", { method: "POST" });
        } catch {}
        window.location.href = "/sales/login";
      });

    // Initial view
    navigate("my-queue");
  }

  /* ================================================================
     PUBLIC API (for onclick handlers)
     ================================================================ */
  window.__TS__ = {
    openLead: (id) => navigate("lead-detail", { leadId: id }),
    goBack: () => navigate(state.previousView || "my-queue"),
    refreshQueue: () => renderMyQueue(),
    filterManagerQueue: (id) => {
      state.filters.managerQueueSalesUser = id;
      renderManagerQueue();
    },
    filterLeads: (type, val) => {
      if (type === "status") state.filters.managerLeadStatus = val;
      else if (type === "owner") state.filters.managerLeadOwner = val;
      else if (type === "needsCycle")
        state.filters.managerLeadNeedsCycle = val;
      renderManagerLeads();
    },
    showLogCallModal,
    selectOutcome,
    submitLogCall,
    showCreateOrderModal,
    addOrderItem,
    recalcOrderTotal,
    submitCreateOrder,
    showAssignModal,
    submitAssign,
    showPauseModal,
    submitPause,
    showReopenModal,
    submitReopen,
    showOrderSettingsModal,
    submitOrderSettings,
    showCreateSalesUserModal,
    submitCreateSalesUser,
    showEditSalesUserModal,
    submitEditSalesUser,
    loadReport,
    runReport,
    closeModal,
  };

  document.addEventListener("DOMContentLoaded", init);
})();
