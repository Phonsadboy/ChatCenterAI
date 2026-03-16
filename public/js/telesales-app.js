/**
 * TeleSales CRM v2 — Split-panel workspace + Manager dashboard
 * Role-based: Sales sees split-panel, Manager sees tabbed dashboard
 */
(function () {
  "use strict";

  /* ================================================================
     STATE
     ================================================================ */
  const state = {
    user: window.__SALES_USER__ || null,
    role: window.__SALES_ROLE__ || "sales",
    // Sales workspace
    queueData: null,
    queueItems: [],
    pendingSetupLeads: [],
    activeTab: "today",
    searchQuery: "",
    selectedLeadId: null,
    leadDetail: null,
    callForm: { outcome: "", note: "", nextFollowupAt: "" },
    orderFormVisible: false,
    // Manager
    mgrTab: "dashboard",
    dashboardData: null,
    mgrLeads: [],
    mgrLeadFilters: { status: "", owner: "", needsCycle: "", search: "" },
    salesUsers: [],
    selectedLeadIds: [],
    reports: [],
  };

  const isManager = state.role === "manager";

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
    return dt.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  }

  function formatDateTime(d) {
    if (!d) return "-";
    const dt = new Date(d);
    if (isNaN(dt)) return "-";
    return dt.toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function relativeDate(d) {
    if (!d) return "";
    const now = new Date();
    const dt = new Date(d);
    const diff = Math.floor((dt - now) / 86400000);
    if (diff < -1) return `เลยกำหนด ${Math.abs(diff)} วัน`;
    if (diff === -1) return "เลยกำหนดเมื่อวาน";
    if (diff === 0) return dt < now ? "เลยกำหนดวันนี้" : "ครบกำหนดวันนี้";
    if (diff === 1) return "พรุ่งนี้";
    return `อีก ${diff} วัน`;
  }

  function dueCategory(d) {
    if (!d) return "future";
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    const diff = (dt - now) / 86400000;
    if (diff < 0) return "overdue";
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    return "future";
  }

  function initial(name) {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
  }

  function money(v) {
    const n = parseFloat(v) || 0;
    return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function leadIdOf(item) {
    return item?.lead?.id || item?.lead?._id || "";
  }

  function checkpointIdOf(item) {
    return item?.checkpoint?.id || item?.checkpoint?._id || "";
  }

  function queueCategoryCounts(items) {
    const counts = { overdue: 0, today: 0, tomorrow: 0 };
    (items || []).forEach((item) => {
      const cat = dueCategory(item.checkpoint?.dueAt || item.lead?.nextDueAt);
      if (counts[cat] !== undefined) counts[cat] += 1;
    });
    return counts;
  }

  function leadMatchesSearch(lead, query = state.searchQuery) {
    if (!query) return true;
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return true;
    const name = (lead?.displayName || "").toLowerCase();
    const phone = (lead?.phone || "").toLowerCase();
    return name.includes(normalized) || phone.includes(normalized);
  }

  function filteredQueueItemsForActiveTab() {
    let items = Array.isArray(state.queueItems) ? state.queueItems : [];
    if (state.activeTab === "pending") return [];
    if (state.activeTab !== "all") {
      items = items.filter((item) => {
        const cat = dueCategory(item.checkpoint?.dueAt || item.lead?.nextDueAt);
        return cat === state.activeTab;
      });
    }
    if (state.searchQuery) {
      items = items.filter((item) => leadMatchesSearch(item.lead, state.searchQuery));
    }
    return items;
  }

  function filteredPendingLeadsForActiveTab() {
    let leads = Array.isArray(state.pendingSetupLeads) ? state.pendingSetupLeads : [];
    if (state.searchQuery) {
      leads = leads.filter((lead) => leadMatchesSearch(lead, state.searchQuery));
    }
    if (state.activeTab !== "all" && state.activeTab !== "pending") {
      return [];
    }
    return leads;
  }

  function firstVisibleLeadSelection() {
    const visibleItems = filteredQueueItemsForActiveTab();
    if (visibleItems.length > 0) {
      const firstItem = visibleItems[0];
      return {
        leadId: leadIdOf(firstItem),
        checkpointId: checkpointIdOf(firstItem),
      };
    }

    const visiblePendingLeads = filteredPendingLeadsForActiveTab();
    if (visiblePendingLeads.length > 0) {
      const firstLead = visiblePendingLeads[0];
      return {
        leadId: firstLead.id || firstLead._id || "",
        checkpointId: "",
      };
    }

    if (state.queueItems.length > 0) {
      const firstItem = state.queueItems[0];
      return {
        leadId: leadIdOf(firstItem),
        checkpointId: checkpointIdOf(firstItem),
      };
    }

    if (state.pendingSetupLeads.length > 0) {
      const firstLead = state.pendingSetupLeads[0];
      return {
        leadId: firstLead.id || firstLead._id || "",
        checkpointId: "",
      };
    }

    return null;
  }

  function syncDayTabState() {
    const container = document.getElementById("tsDayTabs");
    if (!container) return;
    container.querySelectorAll(".ts-day-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === state.activeTab);
    });
  }

  function salesUsersFrom(data) {
    if (Array.isArray(data?.salesUsers)) return data.salesUsers;
    if (Array.isArray(data?.users)) return data.users;
    return [];
  }

  function reportStats(report) {
    return report?.stats && typeof report.stats === "object" ? report.stats : {};
  }

  function reportScopeLabel(report) {
    if (!report) return "-";
    if (report.scopeType === "system") return "ภาพรวมระบบ";
    const scopeId = report.scopeId || "";
    const user = state.salesUsers.find((item) => (item.id || item._id) === scopeId);
    if (user) return user.name || user.code || scopeId;
    return report.scopeType === "sales_user" ? "พนักงานขาย" : (report.scopeType || "-");
  }

  function reportScopeBadgeClass(report) {
    return report?.scopeType === "system" ? "active" : "pending";
  }

  function percent(value) {
    const number = Number(value) || 0;
    return `${Math.round(number * 100)}%`;
  }

  function detailPlaceholderHtml(icon, text) {
    return `
      <div class="ts-detail-placeholder">
        <i class="fas ${icon}"></i>
        <p>${esc(text)}</p>
      </div>
    `;
  }

  function reportSummaryHtml(report) {
    if (!report) {
      return '<div class="ts-empty-small">ยังไม่มีรายงานล่าสุด</div>';
    }

    const stats = reportStats(report);
    return `
      <div style="display:grid; gap:0.75rem;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;">${esc(reportScopeLabel(report))}</div>
            <div style="font-size:0.82rem; color:var(--ts-muted);">วันที่ ${esc(report.dateKey || formatDate(report.generatedAt))}</div>
          </div>
          <span class="ts-status-badge ${reportScopeBadgeClass(report)}">${esc(report.scopeType || "-")}</span>
        </div>
        <div style="display:flex; gap:0.9rem; flex-wrap:wrap; font-size:0.9rem;">
          <span>โทร <strong>${stats.attempted || 0}</strong></span>
          <span>ติดต่อได้ <strong>${stats.contacted || 0}</strong></span>
          <span>ปิดตรง <strong>${stats.direct_closed_won || 0}</strong></span>
          <span>ค้าง <strong>${stats.overdue || 0}</strong></span>
        </div>
        <div style="font-size:0.88rem; line-height:1.6; color:var(--ts-text);">${esc(report.aiSummary || "ยังไม่มี AI summary")}</div>
      </div>
    `;
  }

  function orderTimestamp(order) {
    return order?.createdAt || order?.extractedAt || order?.updatedAt || null;
  }

  function orderTimestampMs(order) {
    const timestamp = orderTimestamp(order);
    if (!timestamp) return 0;
    const value = new Date(timestamp).getTime();
    return Number.isNaN(value) ? 0 : value;
  }

  function sortOrdersByTimestamp(orders = []) {
    return [...orders].sort((a, b) => orderTimestampMs(b) - orderTimestampMs(a));
  }

  function orderItems(order) {
    if (Array.isArray(order?.items)) return order.items;
    if (Array.isArray(order?.orderData?.items)) return order.orderData.items;
    return [];
  }

  function orderTotal(order) {
    const direct = Number(order?.totalAmount || order?.orderData?.totalAmount || 0);
    if (direct > 0) return direct;
    return orderItems(order).reduce((sum, item) => {
      const quantity = Number(item?.quantity || 0);
      const price = Number(item?.price || 0);
      return sum + (quantity * price);
    }, 0);
  }

  function orderAddress(order) {
    return order?.orderData?.shippingAddress ||
      order?.shippingAddress ||
      order?.address ||
      "";
  }

  function orderPhone(order) {
    return order?.orderData?.phone ||
      order?.orderData?.customerPhone ||
      order?.orderData?.shippingPhone ||
      order?.phone ||
      "";
  }

  function orderReference(order, index = 0) {
    const explicit = order?.orderNumber || order?.displayId || order?.shortId || order?.reference || "";
    if (explicit) return String(explicit);
    const rawId = order?.id || order?._id || "";
    return rawId ? `#${String(rawId).slice(-6)}` : `#${index + 1}`;
  }

  function leadAddress(lead, orders = []) {
    return lead?.address || lead?.shippingAddress || orderAddress(orders[0]) || "";
  }

  function leadPhone(lead, orders = []) {
    return lead?.phone || orderPhone(orders[0]) || "";
  }

  function toLocalDateTimeInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
  }

  function followupBaseDate(orders = []) {
    const base = orderTimestamp(orders[0]);
    return base ? new Date(base) : new Date();
  }

  function buildDateTimeFromBase(baseValue, offsetDays = 3) {
    const date = baseValue instanceof Date ? new Date(baseValue.getTime()) : new Date(baseValue);
    if (Number.isNaN(date.getTime())) return "";
    date.setDate(date.getDate() + offsetDays);
    return toLocalDateTimeInputValue(date);
  }

  function buildFollowupDateTime(orders = [], offsetDays = 3) {
    return buildDateTimeFromBase(followupBaseDate(orders), offsetDays);
  }

  function assignableSalesUsers() {
    return state.salesUsers.filter((user) => user.isActive !== false);
  }

  function unassignedLeadPool(leads = []) {
    return (leads || []).filter((lead) => !lead?.ownerSalesUserId);
  }

  function quickAssignCard({ idPrefix, users, availableCount, description, compact = false }) {
    const defaultCount = Math.min(Math.max(availableCount, 1), 10);
    const cardClass = compact ? "ts-quick-assign compact" : "ts-quick-assign";
    return `
      <div class="${cardClass}">
        <div class="ts-quick-assign-copy">
          <div class="ts-quick-assign-title"><i class="fas fa-bolt"></i> Assign ด่วน</div>
          <div class="ts-quick-assign-desc">${esc(description)}</div>
        </div>
        <div class="ts-quick-assign-controls">
          <select class="ts-input" id="${idPrefix}User">
            <option value="">เลือกพนักงาน</option>
            ${users.map((user) => `<option value="${esc(user.id || user._id)}">${esc(user.name)} (${esc(user.code)})</option>`).join("")}
          </select>
          <input class="ts-input" type="number" id="${idPrefix}Count" min="1" max="${Math.max(availableCount, 1)}" value="${defaultCount}">
          <button class="ts-btn ts-btn-save" id="${idPrefix}Btn"${availableCount <= 0 || users.length === 0 ? " disabled" : ""}>
            <i class="fas fa-user-plus"></i> Assign
          </button>
        </div>
      </div>
    `;
  }

  function bindQuickAssign({ idPrefix, getLeadPool, onDone }) {
    const btn = document.getElementById(`${idPrefix}Btn`);
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const salesUserId = document.getElementById(`${idPrefix}User`)?.value || "";
      const requested = parseInt(document.getElementById(`${idPrefix}Count`)?.value, 10);
      const pool = getLeadPool();

      if (!salesUserId) {
        toast("เลือกพนักงานขายก่อน", "warning");
        return;
      }
      if (!requested || requested < 1) {
        toast("ระบุจำนวน lead ที่ต้องการ assign", "warning");
        return;
      }

      const leadIds = pool.slice(0, requested).map((lead) => lead.id || lead._id).filter(Boolean);
      if (!leadIds.length) {
        toast("ไม่มี lead ที่ยังไม่ถูก assign ให้กระจายงาน", "warning");
        return;
      }

      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลัง assign...';
        await api.post("/api/telesales/leads/bulk-assign", { leadIds, salesUserId });
        toast(`Assign ${leadIds.length} lead สำเร็จ`);
        await onDone();
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Assign';
      }
    });
  }

  const OUTCOME_LABELS = {
    no_answer: "ไม่รับสาย", busy: "สายไม่ว่าง", call_back: "โทรกลับทีหลัง",
    interested: "สนใจ", not_interested: "ไม่สนใจ",
    already_bought_elsewhere: "ซื้อที่อื่นแล้ว",
    wrong_number: "เบอร์ผิด", do_not_call: "ห้ามโทร",
    closed_won: "ปิดการขาย", purchased_via_ai: "ซื้อผ่าน AI",
  };

  const OUTCOME_ICONS = {
    no_answer: "fa-phone-slash", busy: "fa-phone-volume",
    call_back: "fa-clock-rotate-left", interested: "fa-face-smile",
    not_interested: "fa-face-frown", already_bought_elsewhere: "fa-store",
    wrong_number: "fa-circle-exclamation", do_not_call: "fa-ban",
    closed_won: "fa-trophy", purchased_via_ai: "fa-robot",
  };

  const OUTCOME_CLASS = {
    no_answer: "neutral", busy: "neutral", call_back: "pending",
    interested: "positive", not_interested: "negative",
    already_bought_elsewhere: "neutral", wrong_number: "negative",
    do_not_call: "negative", closed_won: "positive", purchased_via_ai: "positive",
  };

  const NEEDS_NEXT = new Set(["no_answer", "busy", "call_back", "interested", "already_bought_elsewhere"]);
  const TERMINAL_OUTCOMES = new Set(["wrong_number", "do_not_call"]);

  // Outcomes shown in call form (sales can choose)
  const CALL_OUTCOMES = [
    "no_answer", "busy", "call_back", "interested",
    "not_interested", "already_bought_elsewhere",
    "wrong_number", "do_not_call",
  ];

  /* ================================================================
     API
     ================================================================ */
  const api = {
    async get(url) {
      const res = await fetch(url);
      if (res.status === 401) { window.location.href = "/sales/login"; throw new Error("ไม่ได้เข้าสู่ระบบ"); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "API error");
      return data;
    },
    async post(url, body) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { window.location.href = "/sales/login"; throw new Error("ไม่ได้เข้าสู่ระบบ"); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "API error");
      return data;
    },
    async patch(url, body) {
      const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { window.location.href = "/sales/login"; throw new Error("ไม่ได้เข้าสู่ระบบ"); }
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
    const icons = { success: "fa-check-circle", error: "fa-circle-xmark", warning: "fa-triangle-exclamation" };
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
     LOGOUT
     ================================================================ */
  function setupLogout() {
    const btn = document.getElementById("tsLogoutBtn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      try {
        await fetch("/sales/logout", { method: "POST" });
        window.location.href = "/sales/login";
      } catch {
        toast("ออกจากระบบไม่สำเร็จ", "error");
      }
    });
  }

  /* ================================================================
     INIT
     ================================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    setupLogout();
    if (isManager) {
      initManager();
    } else {
      initSalesWorkspace();
    }
  });

  /* ╔════════════════════════════════════════════════════════════════╗
     ║  SALES WORKSPACE                                             ║
     ╚════════════════════════════════════════════════════════════════╝ */

  function initSalesWorkspace() {
    setupDayTabs();
    setupQueueSearch();
    setupMobileToggle();
    setupSplitResize();
    loadQueue();
  }

  /* ---------- Day Tabs ---------- */
  function setupDayTabs() {
    const container = document.getElementById("tsDayTabs");
    if (!container) return;
    container.addEventListener("click", (e) => {
      const tab = e.target.closest(".ts-day-tab");
      if (!tab) return;
      state.activeTab = tab.dataset.tab;
      container.querySelectorAll(".ts-day-tab").forEach(t => t.classList.toggle("active", t === tab));
      renderQueueList();
    });
  }

  /* ---------- Search ---------- */
  function setupQueueSearch() {
    const input = document.getElementById("tsQueueSearch");
    if (!input) return;
    let timeout;
    input.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        state.searchQuery = input.value.trim().toLowerCase();
        renderQueueList();
      }, 200);
    });
  }

  /* ---------- Mobile ---------- */
  function setupMobileToggle() {
    const btn = document.getElementById("tsMobileToggle");
    const panel = document.getElementById("tsQueuePanel");
    const overlay = document.getElementById("tsPanelOverlay");
    if (!btn || !panel) return;
    btn.addEventListener("click", () => {
      panel.classList.toggle("open");
      overlay.classList.toggle("show");
    });
    if (overlay) {
      overlay.addEventListener("click", () => {
        panel.classList.remove("open");
        overlay.classList.remove("show");
      });
    }
  }

  /* ---------- Split Resize ---------- */
  function setupSplitResize() {
    const handle = document.getElementById("tsSplitHandle");
    const panel = document.getElementById("tsQueuePanel");
    if (!handle || !panel) return;
    let dragging = false;
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      handle.classList.add("active");
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const w = Math.min(Math.max(e.clientX, 240), 520);
      panel.style.width = w + "px";
    });
    document.addEventListener("mouseup", () => {
      if (dragging) { dragging = false; handle.classList.remove("active"); }
    });
  }

  /* ---------- Load Queue ---------- */
  async function loadQueue() {
    try {
      const data = await api.get("/api/telesales/my-queue?limit=500");
      state.queueData = data;
      state.queueItems = data.items || [];
      state.pendingSetupLeads = data.pendingSetupLeads || [];
      const counts = queueCategoryCounts(state.queueItems);
      const hasCurrentTabItems =
        state.activeTab === "all"
          ? (state.queueItems.length + state.pendingSetupLeads.length) > 0
          : state.activeTab === "pending"
            ? state.pendingSetupLeads.length > 0
            : (counts[state.activeTab] || 0) > 0;
      if (!hasCurrentTabItems && (state.queueItems.length > 0 || state.pendingSetupLeads.length > 0)) {
        if (counts.today > 0) state.activeTab = "today";
        else if (counts.overdue > 0) state.activeTab = "overdue";
        else if (counts.tomorrow > 0) state.activeTab = "tomorrow";
        else if (state.pendingSetupLeads.length > 0) state.activeTab = "pending";
        else state.activeTab = "all";
        syncDayTabState();
      }
      updateBadges();
      renderQueueList();
      updateTopbarStats();

      const selectedStillExists = state.selectedLeadId && (
        state.queueItems.some((item) => leadIdOf(item) === state.selectedLeadId) ||
        state.pendingSetupLeads.some((lead) => (lead.id || lead._id) === state.selectedLeadId)
      );

      if (!selectedStillExists) {
        const firstVisible = firstVisibleLeadSelection();
        if (firstVisible?.leadId) {
          state.selectedLeadId = firstVisible.leadId;
          loadLeadDetail(firstVisible.leadId, firstVisible.checkpointId);
        } else {
          state.selectedLeadId = null;
          document.getElementById("tsDetailPanel").innerHTML = detailPlaceholderHtml("fa-phone-slash", "ยังไม่มีคิวโทรในตอนนี้");
        }
      }
    } catch (err) {
      document.getElementById("tsQueueList").innerHTML =
        `<div class="ts-empty-small"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
    }
  }

  function updateBadges() {
    const items = state.queueItems;
    const counts = queueCategoryCounts(items);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("tabBadgeOverdue", counts.overdue);
    set("tabBadgeToday", counts.today);
    set("tabBadgeTomorrow", counts.tomorrow);
    set("tabBadgePending", state.pendingSetupLeads.length);
    set("tabBadgeAll", items.length + state.pendingSetupLeads.length);
  }

  function updateTopbarStats() {
    const el = document.getElementById("tsTopbarStats");
    if (!el) return;
    const s = state.queueData?.summary || {};
    el.innerHTML = `
      <div class="ts-topbar-stat"><span>ครบกำหนด:</span> <span class="num">${s.due_today || 0}</span></div>
      <div class="ts-topbar-stat"><span>ค้าง:</span> <span class="num">${s.overdue || 0}</span></div>
      <div class="ts-topbar-stat"><span>โทรกลับ:</span> <span class="num">${s.callback_pending || 0}</span></div>
      <div class="ts-topbar-stat"><span>รอตั้ง:</span> <span class="num">${s.pending_setup || 0}</span></div>
      <div class="ts-topbar-stat"><span>ทั้งหมด:</span> <span class="num">${(state.queueItems || []).length + (state.pendingSetupLeads || []).length}</span></div>
    `;
  }

  /* ---------- Render Queue List ---------- */
  function renderQueueList() {
    const container = document.getElementById("tsQueueList");
    if (!container) return;

    const items = filteredQueueItemsForActiveTab();
    const pendingLeads = filteredPendingLeadsForActiveTab();
    const showPendingSection = pendingLeads.length > 0 && (state.activeTab === "all" || state.activeTab === "pending");

    if (items.length === 0 && !showPendingSection) {
      container.innerHTML = `<div class="ts-empty-small"><i class="fas fa-inbox"></i> ไม่มีรายการ</div>`;
      updateFooter(0);
      return;
    }

    const queueHtml = items.map(item => {
      const lead = item.lead || {};
      const cp = item.checkpoint || {};
      const lid = leadIdOf(item);
      const cat = dueCategory(cp.dueAt || lead.nextDueAt);
      const isActive = state.selectedLeadId === lid;
      const lastProduct = lead.latestOrderSummary || "";

      return `
        <div class="ts-queue-item${isActive ? " active" : ""}" data-lead-id="${esc(lid)}" data-checkpoint-id="${esc(checkpointIdOf(item))}">
          <div class="ts-queue-item-indicator ${cat}"></div>
          <div class="ts-queue-item-body">
            <div class="ts-queue-item-name">${esc(lead.displayName || "ไม่ทราบชื่อ")}</div>
            <div class="ts-queue-item-phone">${esc(lead.phone || "-")}</div>
            ${lastProduct ? `<div class="ts-queue-item-product"><i class="fas fa-box" style="font-size:0.65rem"></i> ${esc(lastProduct)}</div>` : ""}
            <div class="ts-queue-item-due ${cat}">${esc(relativeDate(cp.dueAt || lead.nextDueAt))}</div>
          </div>
        </div>
      `;
    }).join("");

    const pendingHtml = showPendingSection
      ? `
        <div class="ts-queue-section-label">${state.activeTab === "pending" ? "ลีดที่ต้องกำหนดวัน" : "รอตั้งวัน"}</div>
        ${pendingLeads.map((lead) => {
          const lid = lead.id || lead._id || "";
          const isActive = state.selectedLeadId === lid;
          return `
            <div class="ts-queue-item pending-setup${isActive ? " active" : ""}" data-lead-id="${esc(lid)}" data-checkpoint-id="">
              <div class="ts-queue-item-indicator future"></div>
              <div class="ts-queue-item-body">
                <div class="ts-queue-item-name">${esc(lead.displayName || "ไม่ทราบชื่อ")}</div>
                <div class="ts-queue-item-phone">${esc(lead.phone || "-")}</div>
                <div class="ts-queue-item-product"><span class="ts-status-badge pending">ยังไม่กำหนดวันติดตาม</span></div>
                <div class="ts-queue-item-due">${lead.needsCycle ? "เซลล์ตั้งวันโทรครั้งแรกได้เลย แม้ cycle ถาวรยังไม่ถูกตั้ง" : "เซลล์ต้องกำหนดวันโทรครั้งแรก"}</div>
              </div>
            </div>
          `;
        }).join("")}
      `
      : "";

    container.innerHTML = queueHtml + pendingHtml;

    // Click handler
    container.querySelectorAll(".ts-queue-item").forEach(el => {
      el.addEventListener("click", () => {
        const lid = el.dataset.leadId;
        const cpId = el.dataset.checkpointId;
        state.selectedLeadId = lid;
        // Update active state
        container.querySelectorAll(".ts-queue-item").forEach(x => x.classList.toggle("active", x === el));
        loadLeadDetail(lid, cpId);
        // On mobile, close queue panel
        document.getElementById("tsQueuePanel")?.classList.remove("open");
        document.getElementById("tsPanelOverlay")?.classList.remove("show");
      });
    });

    updateFooter(items.length + (showPendingSection ? pendingLeads.length : 0));
  }

  function updateFooter(count) {
    const footer = document.getElementById("tsQueueFooter");
    if (!footer) return;
    const total = state.queueItems.length + state.pendingSetupLeads.length;
    footer.innerHTML = `<span>แสดง ${count} รายการ</span><span>คิวโทร ${state.queueItems.length} / รอตั้ง ${state.pendingSetupLeads.length}</span>`;
  }

  /* ---------- Load Lead Detail ---------- */
  async function loadLeadDetail(leadId, checkpointId) {
    const panel = document.getElementById("tsDetailPanel");
    if (!panel) return;
    panel.innerHTML = '<div class="ts-loading"><div class="ts-spinner"></div> กำลังโหลด...</div>';

    try {
      const data = await api.get(`/api/telesales/leads/${leadId}`);
      const orders = sortOrdersByTimestamp(data.orders || []);
      state.leadDetail = {
        ...data,
        orders,
      };
      state.callForm = {
        outcome: "",
        note: "",
        nextFollowupAt: buildFollowupDateTime(orders, 3),
      };
      state.orderFormVisible = false;

      // Find the active checkpoint (from queue or from lead data)
      let activeCheckpointId = checkpointId;
      if (!activeCheckpointId && data.checkpoints) {
        const openCp = data.checkpoints.find(c => c.status === "open");
        if (openCp) activeCheckpointId = openCp.id || openCp._id;
      }

      renderLeadDetail(state.leadDetail, activeCheckpointId);
    } catch (err) {
      panel.innerHTML = `<div class="ts-empty-small"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
    }
  }

  /* ---------- Render Lead Detail ---------- */
  function renderLeadDetail(data, checkpointId) {
    const panel = document.getElementById("tsDetailPanel");
    if (!panel) return;

    const lead = data.lead || {};
    const orders = sortOrdersByTimestamp(data.orders || []);
    const callLogs = data.callLogs || [];
    const latestOrder = orders[0];
    const latestOrderAt = orderTimestamp(latestOrder);
    const primaryAddress = leadAddress(lead, orders);
    const primaryPhone = leadPhone(lead, orders);

    panel.innerHTML = `
      <div class="ts-detail-content ts-fade-in">
        <!-- Lead header -->
        <div class="ts-lead-header">
          <div class="ts-lead-avatar">${esc(initial(lead.displayName))}</div>
          <div class="ts-lead-info">
            <div class="ts-lead-name">${esc(lead.displayName || "ไม่ทราบชื่อ")}
              <span class="ts-status-badge ${esc(lead.status || "active")}">${esc(lead.status || "active")}</span>
            </div>
            <div class="ts-lead-meta">
              ${primaryPhone ? `<span><i class="fas fa-phone"></i> <a href="tel:${esc(primaryPhone)}">${esc(primaryPhone)}</a></span>` : ""}
              ${lead.platform ? `<span><i class="fas fa-${lead.platform === "line" ? "comment-dots" : "globe"}"></i> ${esc(lead.platform)}</span>` : ""}
              ${primaryAddress ? `<span><i class="fas fa-map-marker-alt"></i> ${esc(primaryAddress)}</span>` : ""}
            </div>
          </div>
        </div>

        <div class="ts-section">
          <div class="ts-section-title"><i class="fas fa-id-card"></i> ข้อมูลลูกค้า</div>
          <div class="ts-customer-grid">
            <div class="ts-customer-stat">
              <span class="label">ที่อยู่ล่าสุด</span>
              <strong>${esc(primaryAddress || "-")}</strong>
            </div>
            <div class="ts-customer-stat">
              <span class="label">จำนวนออเดอร์</span>
              <strong>${orders.length}</strong>
            </div>
            <div class="ts-customer-stat">
              <span class="label">สั่งล่าสุด</span>
              <strong>${esc(latestOrderAt ? formatDateTime(latestOrderAt) : "-")}</strong>
            </div>
          </div>
        </div>

        <!-- Latest order -->
        ${latestOrder ? `
        <div class="ts-section">
          <div class="ts-section-title"><i class="fas fa-shopping-bag"></i> ออเดอร์ล่าสุด</div>
          <div class="ts-order-card">
            <div class="ts-order-card-head">
              <div class="ts-order-card-title">ออเดอร์ ${esc(orderReference(latestOrder, 0))}</div>
              <div class="ts-order-card-date">${esc(formatDateTime(latestOrderAt))}</div>
            </div>
            <div class="ts-order-items">
              ${orderItems(latestOrder).map(it =>
                `${esc(it.product || it.name)} x${it.quantity} ฿${money(it.price || 0)}`
              ).join("<br>") || '<span>ไม่มีรายการสินค้า</span>'}
            </div>
            ${orderTotal(latestOrder) ? `<div class="ts-order-total">฿${money(orderTotal(latestOrder))}</div>` : ""}
          </div>
        </div>
        ` : ""}

        <div class="ts-section">
          <div class="ts-section-title"><i class="fas fa-box-archive"></i> ออเดอร์ทั้งหมด</div>
          ${orders.length > 0 ? `
            <div class="ts-order-history">
              ${orders.map((order, index) => `
                <div class="ts-order-history-card">
                  <div class="ts-order-history-head">
                    <div>
                      <div class="ts-order-history-title">ออเดอร์ ${esc(orderReference(order, index))}</div>
                      <div class="ts-order-history-date">${esc(formatDateTime(orderTimestamp(order)))}</div>
                    </div>
                    <div class="ts-order-total">฿${money(orderTotal(order))}</div>
                  </div>
                  <div class="ts-order-history-body">
                    ${orderItems(order).map((item) => `
                      <div class="ts-order-history-item">
                        <span>${esc(item.product || item.name || "-")}</span>
                        <span>x${esc(item.quantity || 0)} / ฿${money(item.price || 0)}</span>
                      </div>
                    `).join("") || '<div class="ts-text-muted">ไม่มีรายการสินค้า</div>'}
                  </div>
                  ${orderAddress(order) ? `<div class="ts-order-history-address"><i class="fas fa-location-dot"></i> ${esc(orderAddress(order))}</div>` : ""}
                </div>
              `).join("")}
            </div>
          ` : '<div class="ts-empty-small">ยังไม่มีออเดอร์</div>'}
        </div>

        <!-- Timeline -->
        <div class="ts-section">
          <div class="ts-section-title"><i class="fas fa-timeline"></i> ประวัติการโทร</div>
          ${callLogs.length > 0 ? `
          <div class="ts-timeline">
            ${callLogs.map(log => `
              <div class="ts-timeline-item">
                <div class="ts-timeline-dot ${esc(OUTCOME_CLASS[log.outcome] || "neutral")}"></div>
                <div class="ts-timeline-date">${esc(formatDateTime(log.loggedAt || log.createdAt || log.calledAt))}</div>
                <div class="ts-timeline-outcome">
                  <i class="fas ${esc(OUTCOME_ICONS[log.outcome] || "fa-phone")}"></i>
                  ${esc(OUTCOME_LABELS[log.outcome] || log.outcome || "-")}
                </div>
                ${log.salesUser?.name ? `<div class="ts-timeline-date">โดย ${esc(log.salesUser.name)}</div>` : ""}
                ${log.note ? `<div class="ts-timeline-note">${esc(log.note)}</div>` : ""}
              </div>
            `).join("")}
          </div>
          ` : '<div class="ts-empty-small">ยังไม่มีประวัติการโทร</div>'}
        </div>

        <!-- Call form -->
        ${lead.status === "active" && !checkpointId ? renderPendingScheduleForm(lead, orders) : ""}
        ${lead.status === "active" ? renderCallForm(checkpointId, lead, orders) : ""}
      </div>
    `;

    // Bind call form events
    if (lead.status === "active") {
      if (!checkpointId) {
        bindPendingScheduleEvents(lead, orders);
      }
      bindCallFormEvents(checkpointId, lead, orders);
    }
  }

  /* ---------- Call Form ---------- */
  function renderPendingScheduleForm(lead, orders) {
    const baseDate = followupBaseDate(orders);
    const defaultValue = buildFollowupDateTime(orders, 3);
    return `
      <div class="ts-section">
        <div class="ts-call-form ts-pending-schedule-card">
          <div class="ts-call-form-title"><i class="fas fa-calendar-plus"></i> กำหนดวันโทรครั้งแรก</div>
          <div class="ts-call-form-hint">
            lead นี้ถูกมอบหมายมาแล้ว แต่ยังไม่มีกำหนดวันติดตามครั้งแรก ถ้ายังไม่โทรตอนนี้ ให้สร้างวันนัดจากกล่องนี้ก่อน
          </div>
          ${lead.needsCycle ? `
            <div class="ts-pending-schedule-note">
              <i class="fas fa-circle-info"></i>
              <span>ออเดอร์นี้ยังไม่มี cycle ถาวร การตั้งค่านี้คือคิวโทรครั้งแรกของเซลล์ และหัวหน้ายังตั้ง cycle เพิ่มได้ภายหลัง</span>
            </div>
          ` : ""}
          <div class="ts-followup-row">
            <div class="ts-followup-copy">
              <span>วันติดตามครั้งแรก</span>
              <small>ยึดฐานจากออเดอร์ล่าสุด ${esc(formatDateTime(baseDate))}</small>
            </div>
            <input type="datetime-local" id="tsPendingScheduleAt" value="${esc(defaultValue)}">
          </div>
          <div class="ts-followup-presets" id="tsPendingSchedulePresets">
            <button class="ts-followup-chip" data-schedule-days="3">+3 วัน</button>
            <button class="ts-followup-chip" data-schedule-days="7">+7 วัน</button>
            <button class="ts-followup-chip" data-schedule-days="10">+10 วัน</button>
          </div>
          <div class="ts-call-fields">
            <textarea id="tsPendingScheduleNote" placeholder="หมายเหตุการนัดครั้งแรก (ถ้ามี)" rows="2"></textarea>
          </div>
          <div class="ts-save-row">
            <button class="ts-btn ts-btn-save" id="tsPendingScheduleBtn">
              <i class="fas fa-calendar-check"></i> กำหนดวันติดตาม
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCallForm(checkpointId, lead, orders) {
    const baseDate = followupBaseDate(orders);
    const manualMode = !checkpointId;
    return `
      <div class="ts-section">
        <div class="ts-call-form" id="tsCallForm">
          <div class="ts-call-form-title"><i class="fas fa-phone-flip"></i> ${manualMode ? "บันทึกหลังโทรทันที" : "บันทึกการโทร"}</div>
          ${manualMode ? `
            <div class="ts-call-form-hint">
              ถ้าโทรลูกค้าทันทีโดยยังไม่มี checkpoint เปิดอยู่ ให้บันทึกผลโทรจากฟอร์มนี้ และระบบจะสร้าง checkpoint ถัดไปตามผลที่เลือก
            </div>
          ` : ""}
          <div class="ts-outcome-grid" id="tsOutcomeGrid">
            ${CALL_OUTCOMES.map(o => {
              let cls = "ts-outcome-btn";
              if (TERMINAL_OUTCOMES.has(o)) cls += " terminal";
              return `<button class="${cls}" data-outcome="${o}"><i class="fas ${OUTCOME_ICONS[o]}"></i> ${OUTCOME_LABELS[o]}</button>`;
            }).join("")}
            ${manualMode ? "" : '<button class="ts-outcome-btn closed-won" data-outcome="closed_won"><i class="fas fa-trophy"></i> ปิดการขาย</button>'}
          </div>
          <div class="ts-call-fields">
            <textarea id="tsCallNote" placeholder="โน้ตการโทร (จำเป็น)" rows="2"></textarea>
            <div class="ts-followup-row" id="tsFollowupRow" style="display:none;">
              <div class="ts-followup-copy">
                <span>Follow-up ครั้งถัดไป</span>
                <small>อิงจากออเดอร์ล่าสุด ${esc(formatDateTime(baseDate))}</small>
              </div>
              <input type="datetime-local" id="tsNextFollowupAt" value="${esc(state.callForm.nextFollowupAt || buildFollowupDateTime(orders, 3))}">
            </div>
            <div class="ts-followup-presets" id="tsFollowupPresets" style="display:none;">
              <button class="ts-followup-chip" data-followup-days="3">+3 วัน</button>
              <button class="ts-followup-chip" data-followup-days="7">+7 วัน</button>
              <button class="ts-followup-chip" data-followup-days="10">+10 วัน</button>
            </div>
          </div>
          <div id="tsOrderFormSlot"></div>
          <div class="ts-save-row">
            <button class="ts-btn ts-btn-save" id="tsSaveCallBtn" disabled>
              <i class="fas fa-save"></i> ${manualMode ? "บันทึกและสร้าง Checkpoint" : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function bindPendingScheduleEvents(lead, orders) {
    const scheduleInput = document.getElementById("tsPendingScheduleAt");
    const noteEl = document.getElementById("tsPendingScheduleNote");
    const saveBtn = document.getElementById("tsPendingScheduleBtn");
    const presets = document.getElementById("tsPendingSchedulePresets");

    if (!scheduleInput || !saveBtn) return;

    presets?.querySelectorAll("[data-schedule-days]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        const days = parseInt(btn.dataset.scheduleDays, 10) || 3;
        scheduleInput.value = buildFollowupDateTime(orders, days);
      });
    });

    saveBtn.addEventListener("click", async () => {
      const dueAt = new Date(scheduleInput.value || "");
      if (Number.isNaN(dueAt.getTime())) {
        toast("กรุณาเลือกวันและเวลาติดตามครั้งแรก", "warning");
        return;
      }

      try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
        await api.post(`/api/telesales/leads/${lead.id || lead._id}/schedule`, {
          dueAt: dueAt.toISOString(),
          note: noteEl?.value?.trim() || "",
        });
        toast("กำหนดวันติดตามครั้งแรกสำเร็จ");
        await loadQueue();
        focusAfterPendingSchedule(lead.id || lead._id);
        renderQueueList();
      } catch (err) {
        toast(err.message, "error");
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-calendar-check"></i> กำหนดวันติดตาม';
      }
    });
  }

  function bindCallFormEvents(checkpointId, lead, orders) {
    const grid = document.getElementById("tsOutcomeGrid");
    const noteEl = document.getElementById("tsCallNote");
    const followupRow = document.getElementById("tsFollowupRow");
    const nextFollowupInput = document.getElementById("tsNextFollowupAt");
    const followupPresets = document.getElementById("tsFollowupPresets");
    const saveBtn = document.getElementById("tsSaveCallBtn");
    const orderSlot = document.getElementById("tsOrderFormSlot");

    if (!grid) return;

    // Outcome selection
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".ts-outcome-btn");
      if (!btn) return;
      const outcome = btn.dataset.outcome;
      state.callForm.outcome = outcome;
      grid.querySelectorAll(".ts-outcome-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");

      // Show/hide followup row
      if (NEEDS_NEXT.has(outcome)) {
        followupRow.style.display = "flex";
        followupPresets.style.display = "flex";
      } else {
        followupRow.style.display = "none";
        followupPresets.style.display = "none";
      }

      // Show/hide order form
      if (outcome === "closed_won") {
        state.orderFormVisible = true;
        orderSlot.innerHTML = renderOrderForm(lead, orders);
        bindOrderFormEvents();
      } else {
        state.orderFormVisible = false;
        orderSlot.innerHTML = "";
      }

      updateSaveBtn();
    });

    noteEl.addEventListener("input", () => {
      state.callForm.note = noteEl.value;
      updateSaveBtn();
    });

    nextFollowupInput?.addEventListener("input", () => {
      state.callForm.nextFollowupAt = nextFollowupInput.value;
    });

    followupPresets?.querySelectorAll("[data-followup-days]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        const days = parseInt(btn.dataset.followupDays, 10) || 3;
        const nextValue = buildFollowupDateTime(orders, days);
        state.callForm.nextFollowupAt = nextValue;
        if (nextFollowupInput) nextFollowupInput.value = nextValue;
      });
    });

    function updateSaveBtn() {
      const hasOutcome = !!state.callForm.outcome;
      const hasNote = state.callForm.note.trim().length > 0;
      saveBtn.disabled = !(hasOutcome && hasNote);
    }

    // Save
    saveBtn.addEventListener("click", async () => {
      if (saveBtn.disabled) return;
      const outcome = state.callForm.outcome;

      if (outcome === "closed_won") {
        await submitOrder(checkpointId, lead, orders);
      } else {
        if (checkpointId) {
          await submitCallLog(checkpointId);
        } else {
          await submitLeadCall(lead.id || lead._id);
        }
      }
    });
  }

  function focusAfterQueueRefresh(previousLeadId) {
    const nextItem = state.queueItems.find((item) => leadIdOf(item) !== previousLeadId);
    if (nextItem) {
      state.selectedLeadId = leadIdOf(nextItem);
      loadLeadDetail(leadIdOf(nextItem), checkpointIdOf(nextItem));
      return;
    }

    const currentItem = state.queueItems.find((item) => leadIdOf(item) === previousLeadId);
    if (currentItem) {
      state.selectedLeadId = previousLeadId;
      loadLeadDetail(leadIdOf(currentItem), checkpointIdOf(currentItem));
      return;
    }

    if (state.pendingSetupLeads.length > 0) {
      const pendingLead = state.pendingSetupLeads.find((lead) => (lead.id || lead._id) !== previousLeadId) || state.pendingSetupLeads[0];
      state.selectedLeadId = pendingLead.id || pendingLead._id;
      loadLeadDetail(state.selectedLeadId);
      return;
    }

    state.selectedLeadId = null;
    document.getElementById("tsDetailPanel").innerHTML = `
      <div class="ts-detail-placeholder">
        <i class="fas fa-check-circle" style="color: var(--ts-success)"></i>
        <p>โทรหมดแล้ว!</p>
      </div>`;
  }

  function focusAfterPendingSchedule(previousLeadId) {
    const nextPendingLead =
      state.pendingSetupLeads.find((lead) => (lead.id || lead._id) !== previousLeadId) ||
      null;
    if (nextPendingLead) {
      state.selectedLeadId = nextPendingLead.id || nextPendingLead._id;
      loadLeadDetail(state.selectedLeadId);
      return;
    }

    const currentItem = state.queueItems.find((item) => leadIdOf(item) === previousLeadId);
    if (currentItem) {
      if (state.activeTab === "pending") {
        const cat = dueCategory(currentItem.checkpoint?.dueAt || currentItem.lead?.nextDueAt);
        state.activeTab = cat === "today" || cat === "overdue" || cat === "tomorrow" ? cat : "all";
        syncDayTabState();
      }
      state.selectedLeadId = previousLeadId;
      loadLeadDetail(previousLeadId, checkpointIdOf(currentItem));
      return;
    }

    focusAfterQueueRefresh(previousLeadId);
  }

  /* ---------- Submit Call Log ---------- */
  async function submitCallLog(checkpointId) {
    const saveBtn = document.getElementById("tsSaveCallBtn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';

    try {
      const body = {
        outcome: state.callForm.outcome,
        note: state.callForm.note.trim(),
      };

      if (NEEDS_NEXT.has(state.callForm.outcome)) {
        const nextCheckpointAt = new Date(state.callForm.nextFollowupAt || "");
        if (Number.isNaN(nextCheckpointAt.getTime())) {
          toast("กรุณาเลือกวันและเวลาสำหรับ follow-up ครั้งถัดไป", "warning");
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
          return;
        }
        body.nextCheckpointAt = nextCheckpointAt.toISOString();
      }

      await api.post(`/api/telesales/checkpoints/${checkpointId}/log-call`, body);
      toast("บันทึกการโทรสำเร็จ");

      // Refresh queue and detail
      await loadQueue();
      focusAfterQueueRefresh(state.selectedLeadId);
      renderQueueList();
    } catch (err) {
      toast(err.message, "error");
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
    }
  }

  async function submitLeadCall(leadId) {
    const saveBtn = document.getElementById("tsSaveCallBtn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';

    try {
      const body = {
        outcome: state.callForm.outcome,
        note: state.callForm.note.trim(),
      };

      if (NEEDS_NEXT.has(state.callForm.outcome)) {
        const nextCheckpointAt = new Date(state.callForm.nextFollowupAt || "");
        if (Number.isNaN(nextCheckpointAt.getTime())) {
          toast("กรุณาเลือกวันและเวลาสำหรับ follow-up ครั้งถัดไป", "warning");
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึกและสร้าง Checkpoint';
          return;
        }
        body.nextCheckpointAt = nextCheckpointAt.toISOString();
      }

      await api.post(`/api/telesales/leads/${leadId}/log-call`, body);
      toast("บันทึกผลโทรและสร้าง checkpoint สำเร็จ");

      await loadQueue();
      focusAfterQueueRefresh(state.selectedLeadId);
      renderQueueList();
    } catch (err) {
      toast(err.message, "error");
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึกและสร้าง Checkpoint';
    }
  }

  /* ---------- Order Form (Inline) ---------- */
  function renderOrderForm(lead, orders = []) {
    const primaryPhone = leadPhone(lead, orders);
    const primaryAddress = leadAddress(lead, orders);
    const orderFollowupDefault = buildDateTimeFromBase(new Date(), 30);
    return `
      <div class="ts-order-form">
        <div class="ts-order-form-title"><i class="fas fa-trophy"></i> สร้างออเดอร์</div>
        <div class="ts-order-items-list" id="tsOrderItems">
          <div class="ts-order-item-row" data-idx="0">
            <input class="ts-input" type="text" placeholder="สินค้า" data-field="product">
            <input class="ts-input" type="number" placeholder="จำนวน" value="1" min="1" data-field="quantity">
            <input class="ts-input" type="number" placeholder="ราคา" data-field="price">
            <button class="ts-btn-sm ts-text-danger" onclick="this.closest('.ts-order-item-row').remove()" title="ลบ"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div class="ts-add-item-btn" id="tsAddItemBtn"><i class="fas fa-plus"></i> เพิ่มสินค้า</div>

        <div class="ts-form-row">
          <div class="ts-form-group">
            <label class="ts-label">ชื่อผู้รับ</label>
            <input class="ts-input" type="text" id="tsOrderName" value="${esc(lead.displayName || "")}">
          </div>
          <div class="ts-form-group">
            <label class="ts-label">เบอร์โทร</label>
            <input class="ts-input" type="text" id="tsOrderPhone" value="${esc(primaryPhone)}">
          </div>
        </div>
        <div class="ts-form-row single">
          <div class="ts-form-group">
            <label class="ts-label">ที่อยู่จัดส่ง</label>
            <input class="ts-input" type="text" id="tsOrderAddress" value="${esc(primaryAddress)}">
          </div>
        </div>
        <div class="ts-form-row">
          <div class="ts-form-group">
            <label class="ts-label">วิธีชำระเงิน</label>
            <select class="ts-input" id="tsOrderPayment">
              <option value="เก็บเงินปลายทาง">เก็บเงินปลายทาง</option>
              <option value="โอนเงิน">โอนเงิน</option>
              <option value="บัตรเครดิต">บัตรเครดิต</option>
            </select>
          </div>
          <div class="ts-form-group">
            <label class="ts-label">Follow-up ครั้งถัดไป</label>
            <input class="ts-input" type="datetime-local" id="tsOrderNextFollowupAt" value="${esc(orderFollowupDefault)}">
            <div class="ts-order-followup-hint">ระบบจะยึดจากเวลา create ออเดอร์ใหม่ แล้วนัดรอบถัดไปตามวันเวลานี้</div>
          </div>
        </div>
      </div>
    `;
  }

  function bindOrderFormEvents() {
    const addBtn = document.getElementById("tsAddItemBtn");
    if (!addBtn) return;
    addBtn.addEventListener("click", () => {
      const list = document.getElementById("tsOrderItems");
      const idx = list.children.length;
      const row = document.createElement("div");
      row.className = "ts-order-item-row";
      row.dataset.idx = idx;
      row.innerHTML = `
        <input class="ts-input" type="text" placeholder="สินค้า" data-field="product">
        <input class="ts-input" type="number" placeholder="จำนวน" value="1" min="1" data-field="quantity">
        <input class="ts-input" type="number" placeholder="ราคา" data-field="price">
        <button class="ts-btn-sm ts-text-danger" onclick="this.closest('.ts-order-item-row').remove()" title="ลบ"><i class="fas fa-times"></i></button>
      `;
      list.appendChild(row);
    });
  }

  /* ---------- Submit Order ---------- */
  async function submitOrder(checkpointId, lead, orders = []) {
    const saveBtn = document.getElementById("tsSaveCallBtn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังสร้างออเดอร์...';

    try {
      // Gather order items
      const itemRows = document.querySelectorAll("#tsOrderItems .ts-order-item-row");
      const items = [];
      itemRows.forEach(row => {
        const product = row.querySelector('[data-field="product"]')?.value?.trim();
        const quantity = parseInt(row.querySelector('[data-field="quantity"]')?.value) || 1;
        const price = parseFloat(row.querySelector('[data-field="price"]')?.value) || 0;
        if (product) items.push({ product, quantity, price });
      });

      if (items.length === 0) {
        toast("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ", "warning");
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
        return;
      }

      const totalAmount = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const customerName = document.getElementById("tsOrderName")?.value?.trim() || lead.displayName || "";
      const phone = document.getElementById("tsOrderPhone")?.value?.trim() || leadPhone(lead, orders) || "";
      const address = document.getElementById("tsOrderAddress")?.value?.trim() || leadAddress(lead, orders) || "";
      const payment = document.getElementById("tsOrderPayment")?.value || "เก็บเงินปลายทาง";
      const nextFollowupAtRaw = document.getElementById("tsOrderNextFollowupAt")?.value || "";
      const nextFollowupAt = new Date(nextFollowupAtRaw);
      if (Number.isNaN(nextFollowupAt.getTime())) {
        toast("กรุณาเลือกวันและเวลาสำหรับ follow-up ครั้งถัดไป", "warning");
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
        return;
      }
      const orderBase = new Date();
      const diffDays = Math.ceil((nextFollowupAt.getTime() - orderBase.getTime()) / 86400000);
      const cycleDays = Math.max(1, diffDays);

      const body = {
        callNote: state.callForm.note.trim(),
        status: "pending",
        notes: "เทเลเซลล์ปิดการขาย",
        teleSalesEnabled: true,
        teleSalesCycleDays: cycleDays,
        nextCheckpointAt: nextFollowupAt.toISOString(),
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

      await api.post(`/api/telesales/checkpoints/${checkpointId}/create-order`, body);
      toast("ปิดการขายและสร้างออเดอร์สำเร็จ!");

      // Refresh
      await loadQueue();
      focusAfterQueueRefresh(state.selectedLeadId);
      renderQueueList();
    } catch (err) {
      toast(err.message, "error");
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
    }
  }

  /* ╔════════════════════════════════════════════════════════════════╗
     ║  MANAGER DASHBOARD                                           ║
     ╚════════════════════════════════════════════════════════════════╝ */

  function initManager() {
    setupManagerTabs();
    loadManagerDashboard();
  }

  /* ---------- Manager Tabs ---------- */
  function setupManagerTabs() {
    const container = document.getElementById("tsManagerTabs");
    if (!container) return;
    container.addEventListener("click", (e) => {
      const tab = e.target.closest(".ts-mgr-tab");
      if (!tab) return;
      state.mgrTab = tab.dataset.tab;
      container.querySelectorAll(".ts-mgr-tab").forEach(t => t.classList.toggle("active", t === tab));
      renderManagerTab();
    });
  }

  function renderManagerTab() {
    switch (state.mgrTab) {
      case "dashboard": loadManagerDashboard(); break;
      case "leads": loadManagerLeads(); break;
      case "team": loadManagerTeam(); break;
      case "reports": loadManagerReports(); break;
    }
  }

  /* ---------- Dashboard ---------- */
  async function loadManagerDashboard() {
    const content = document.getElementById("tsContent");
    if (!content) return;
    content.innerHTML = '<div class="ts-loading"><div class="ts-spinner"></div> กำลังโหลด...</div>';

    try {
      const [queueData, leadsData, usersData, reportsData] = await Promise.all([
        api.get("/api/telesales/manager/queue?limit=5000"),
        api.get("/api/telesales/manager/leads?limit=5000"),
        api.get("/api/telesales/sales-users"),
        api.get("/api/telesales/reports/daily?scopeType=system"),
      ]);

      state.salesUsers = salesUsersFrom(usersData);
      const allItems = queueData.items || [];
      const allLeads = leadsData.leads || [];
      state.mgrLeads = allLeads;
      state.reports = reportsData.reports || [];
      const latestSystemReport = (reportsData.reports || [])[0] || null;

      // KPI calculations
      const totalLeads = allLeads.length;
      const unassigned = allLeads.filter(l => !l.ownerSalesUserId).length;
      const needsCycle = allLeads.filter(l => l.needsCycle).length;
      const overdue = allItems.filter(it => dueCategory(it.checkpoint?.dueAt) === "overdue").length;
      const dueToday = allItems.filter(it => dueCategory(it.checkpoint?.dueAt) === "today").length;

      // Team stats
      const teamStats = {};
      state.salesUsers.filter(u => u.isActive !== false).forEach(u => {
        const uid = u.id || u._id;
        teamStats[uid] = { name: u.name, queue: 0, called: 0, closed: 0 };
      });
      allItems.forEach(it => {
        const ownerId = it.lead?.ownerSalesUserId;
        if (ownerId && teamStats[ownerId]) teamStats[ownerId].queue++;
      });

      // Unassigned leads
      const unassignedPool = unassignedLeadPool(allLeads);
      const unassignedLeads = unassignedPool.slice(0, 10);
      const needsCycleLeads = allLeads.filter(l => l.needsCycle).slice(0, 10);
      const activeUsers = assignableSalesUsers();

      content.innerHTML = `
        <div class="ts-fade-in">
          <!-- KPI -->
          <div class="ts-kpi-grid">
            ${kpiCard("fas fa-address-book", "primary", totalLeads, "Leads ทั้งหมด")}
            ${kpiCard("fas fa-exclamation-triangle", "danger", overdue, "เลยกำหนด")}
            ${kpiCard("fas fa-clock", "warning", dueToday, "โทรวันนี้")}
            ${kpiCard("fas fa-repeat", "warning", needsCycle, "ต้องตั้ง Cycle")}
            ${kpiCard("fas fa-user-slash", "info", unassigned, "ยังไม่ assign")}
          </div>

          <!-- Needs attention -->
          ${unassignedLeads.length > 0 ? `
          <div class="ts-mgr-section">
            <div class="ts-mgr-section-header">
              <div class="ts-mgr-section-title"><i class="fas fa-triangle-exclamation"></i> ต้องจัดการ (${unassigned} lead ยังไม่มีเจ้าของ)</div>
              <button class="ts-btn ts-btn-save ts-btn-sm" id="tsDashAssignBtn"><i class="fas fa-user-plus"></i> Assign ที่เลือก</button>
            </div>
            ${quickAssignCard({
              idPrefix: "tsDashQuickAssign",
              users: activeUsers,
              availableCount: unassignedPool.length,
              description: `มี ${unassignedPool.length} lead ที่ยังไม่ถูก assign`,
            })}
            <div class="ts-table-wrap">
              <table class="ts-table">
                <thead>
                  <tr>
                    <th class="ts-checkbox-cell"><input type="checkbox" id="tsDashSelectAll"></th>
                    <th>ชื่อ</th>
                    <th>เบอร์</th>
                    <th>Platform</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody id="tsDashUnassignedBody">
                  ${unassignedLeads.map(l => `
                    <tr>
                      <td class="ts-checkbox-cell"><input type="checkbox" value="${esc(l.id || l._id)}" class="ts-dash-check"></td>
                      <td>${esc(l.displayName || "-")}</td>
                      <td>${esc(l.phone || "-")}</td>
                      <td>${esc(l.platform || "-")}</td>
                      <td><span class="ts-status-badge ${esc(l.status || "active")}">${esc(l.status || "active")}</span></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
          ` : ""}

          ${needsCycleLeads.length > 0 ? `
          <div class="ts-mgr-section">
            <div class="ts-mgr-section-header">
              <div class="ts-mgr-section-title"><i class="fas fa-repeat"></i> ต้องตั้ง Cycle (${needsCycle} lead)</div>
              <button class="ts-btn ts-btn-ghost ts-btn-sm" id="tsDashOpenNeedsCycleBtn"><i class="fas fa-arrow-right"></i> ไปหน้า Leads</button>
            </div>
            <div class="ts-table-wrap">
              <table class="ts-table">
                <thead>
                  <tr>
                    <th>ชื่อ</th>
                    <th>เบอร์</th>
                    <th>ออเดอร์ที่ยังไม่ตั้ง</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  ${needsCycleLeads.map(l => `
                    <tr>
                      <td>${esc(l.displayName || "-")}</td>
                      <td>${esc(l.phone || "-")}</td>
                      <td>${(l.needsCycleOrderIds || []).length || 0}</td>
                      <td><button class="ts-btn ts-btn-save ts-btn-sm" data-set-cycle="${esc(l.id || l._id)}"><i class="fas fa-repeat"></i> ตั้ง Cycle</button></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
          ` : ""}

          <!-- Team overview -->
          <div class="ts-mgr-section">
            <div class="ts-mgr-section-header">
              <div class="ts-mgr-section-title"><i class="fas fa-users"></i> ภาพรวมทีม</div>
            </div>
            <div class="ts-team-grid">
              ${Object.entries(teamStats).map(([uid, s]) => `
                <div class="ts-team-card">
                  <div class="ts-team-avatar">${esc(initial(s.name))}</div>
                  <div class="ts-team-info">
                    <div class="ts-team-name">${esc(s.name)}</div>
                    <div class="ts-team-stats">
                      <span>คิว: <span class="num">${s.queue}</span></span>
                    </div>
                  </div>
                </div>
              `).join("") || '<div class="ts-empty-small">ยังไม่มีพนักงานขาย</div>'}
            </div>
          </div>

          <!-- Reports summary -->
          <div class="ts-mgr-section">
            <div class="ts-mgr-section-header">
              <div class="ts-mgr-section-title"><i class="fas fa-chart-bar"></i> รายงานวันนี้</div>
              <button class="ts-btn ts-btn-ghost ts-btn-sm" id="tsRunReportBtn"><i class="fas fa-play"></i> สร้างรายงาน</button>
            </div>
            <div id="tsDashReportSummary">${reportSummaryHtml(latestSystemReport)}</div>
          </div>
        </div>
      `;

      // Bind dashboard events
      bindDashboardEvents();

    } catch (err) {
      content.innerHTML = `<div class="ts-empty-small"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
    }
  }

  function kpiCard(icon, color, value, label) {
    return `
      <div class="ts-kpi-card">
        <div class="ts-kpi-icon ${color}"><i class="${icon}"></i></div>
        <div>
          <div class="ts-kpi-value">${value}</div>
          <div class="ts-kpi-label">${esc(label)}</div>
        </div>
      </div>
    `;
  }

  function bindDashboardEvents() {
    // Select all
    const selectAll = document.getElementById("tsDashSelectAll");
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        document.querySelectorAll(".ts-dash-check").forEach(cb => cb.checked = selectAll.checked);
      });
    }

    // Assign button
    const assignBtn = document.getElementById("tsDashAssignBtn");
    if (assignBtn) {
      assignBtn.addEventListener("click", () => {
        const ids = Array.from(document.querySelectorAll(".ts-dash-check:checked")).map(cb => cb.value);
        if (ids.length === 0) { toast("เลือก lead ก่อน", "warning"); return; }
        showAssignModal(ids);
      });
    }

    document.getElementById("tsDashOpenNeedsCycleBtn")?.addEventListener("click", () => {
      state.mgrTab = "leads";
      state.mgrLeadFilters.needsCycle = "needs_cycle";
      document.querySelectorAll(".ts-mgr-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.tab === "leads");
      });
      loadManagerLeads();
    });

    document.querySelectorAll("[data-set-cycle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const leadId = btn.dataset.setCycle;
        const lead = state.mgrLeads.find((item) => (item.id || item._id) === leadId);
        if (lead) showCycleModal(lead);
      });
    });

    // Run report
    const reportBtn = document.getElementById("tsRunReportBtn");
    if (reportBtn) {
      reportBtn.addEventListener("click", async () => {
        try {
          reportBtn.disabled = true;
          reportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังสร้าง...';
          await api.post("/api/telesales/reports/daily/run", {});
          toast("สร้างรายงานสำเร็จ");
          const reports = await api.get("/api/telesales/reports/daily");
          const el = document.getElementById("tsDashReportSummary");
          if (el && reports.reports && reports.reports.length > 0) {
            const r = reports.reports.find((item) => item.scopeType === "system") || reports.reports[0];
            el.innerHTML = reportSummaryHtml(r);
          }
        } catch (err) {
          toast(err.message, "error");
        } finally {
          reportBtn.disabled = false;
          reportBtn.innerHTML = '<i class="fas fa-play"></i> สร้างรายงาน';
        }
      });
    }

    bindQuickAssign({
      idPrefix: "tsDashQuickAssign",
      getLeadPool: () => unassignedLeadPool(state.mgrLeads),
      onDone: async () => {
        await loadManagerDashboard();
      },
    });
  }

  /* ---------- Assign Modal ---------- */
  function showAssignModal(leadIds) {
    const existing = document.getElementById("tsAssignModal");
    if (existing) existing.remove();

    const users = state.salesUsers.filter(u => u.isActive !== false);

    const modal = document.createElement("div");
    modal.className = "ts-modal-overlay";
    modal.id = "tsAssignModal";
    modal.innerHTML = `
      <div class="ts-modal">
        <div class="ts-modal-title">
          <span>Assign ${leadIds.length} lead${leadIds.length > 1 ? "s" : ""}</span>
          <span class="ts-modal-close" id="tsAssignModalClose"><i class="fas fa-times"></i></span>
        </div>
        <div class="ts-form-group">
          <label class="ts-label">เลือกพนักงานขาย</label>
          <select class="ts-input" id="tsAssignSelect">
            <option value="">-- เลือก --</option>
            ${users.map(u => `<option value="${esc(u.id || u._id)}">${esc(u.name)} (${esc(u.code)})</option>`).join("")}
          </select>
        </div>
        <div class="ts-modal-actions">
          <button class="ts-btn ts-btn-ghost" id="tsAssignCancelBtn">ยกเลิก</button>
          <button class="ts-btn ts-btn-save" id="tsAssignConfirmBtn"><i class="fas fa-check"></i> Assign</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById("tsAssignModalClose").addEventListener("click", close);
    document.getElementById("tsAssignCancelBtn").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    document.getElementById("tsAssignConfirmBtn").addEventListener("click", async () => {
      const salesUserId = document.getElementById("tsAssignSelect").value;
      if (!salesUserId) { toast("เลือกพนักงานขายก่อน", "warning"); return; }

      try {
        if (leadIds.length === 1) {
          await api.post(`/api/telesales/leads/${leadIds[0]}/assign`, { salesUserId });
        } else {
          await api.post("/api/telesales/leads/bulk-assign", { leadIds, salesUserId });
        }
        toast(`Assign ${leadIds.length} lead สำเร็จ`);
        close();
        renderManagerTab(); // refresh current tab
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }

  /* ---------- Manager Leads Tab ---------- */
  async function loadManagerLeads() {
    const content = document.getElementById("tsContent");
    if (!content) return;
    content.innerHTML = '<div class="ts-loading"><div class="ts-spinner"></div> กำลังโหลด...</div>';

    try {
      const [leadsData, usersData] = await Promise.all([
        api.get("/api/telesales/manager/leads?limit=5000"),
        state.salesUsers.length
          ? Promise.resolve({ salesUsers: state.salesUsers })
          : api.get("/api/telesales/sales-users"),
      ]);

      state.salesUsers = salesUsersFrom(usersData);
      state.mgrLeads = leadsData.leads || [];
      state.selectedLeadIds = [];

      renderManagerLeadsContent();
    } catch (err) {
      content.innerHTML = `<div class="ts-empty-small"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
    }
  }

  function renderManagerLeadsContent() {
    const content = document.getElementById("tsContent");
    if (!content) return;

    let leads = state.mgrLeads;
    const f = state.mgrLeadFilters;

    // Filters
    if (f.status) leads = leads.filter(l => l.status === f.status);
    if (f.owner === "unassigned") leads = leads.filter(l => !l.ownerSalesUserId);
    else if (f.owner) leads = leads.filter(l => l.ownerSalesUserId === f.owner);
    if (f.needsCycle === "needs_cycle") leads = leads.filter(l => l.needsCycle);
    if (f.needsCycle === "ready") leads = leads.filter(l => !l.needsCycle);
    if (f.search) {
      const q = f.search.toLowerCase();
      leads = leads.filter(l =>
        (l.displayName || "").toLowerCase().includes(q) ||
        (l.phone || "").toLowerCase().includes(q)
      );
    }

    const users = state.salesUsers.filter(u => u.isActive !== false);
    const userMap = {};
    users.forEach(u => { userMap[u.id || u._id] = u.name; });
    const visibleUnassignedLeads = unassignedLeadPool(leads);
    const totalUnassignedLeads = unassignedLeadPool(state.mgrLeads);

    content.innerHTML = `
      <div class="ts-fade-in">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <h2 style="font-size:1.1rem; font-weight:700; margin:0;">Leads ทั้งหมด (${leads.length}/${state.mgrLeads.length})</h2>
          <button class="ts-btn ts-btn-ghost ts-btn-sm" id="tsLeadsRefreshBtn"><i class="fas fa-arrows-rotate"></i> รีเฟรช</button>
        </div>

        <!-- Filters -->
        <div class="ts-filter-bar">
          <select id="tsLeadFilterStatus">
            <option value="">ทุกสถานะ</option>
            <option value="active"${f.status === "active" ? " selected" : ""}>Active</option>
            <option value="paused"${f.status === "paused" ? " selected" : ""}>Paused</option>
            <option value="dnc"${f.status === "dnc" ? " selected" : ""}>DNC</option>
          </select>
          <select id="tsLeadFilterOwner">
            <option value="">ทุกเจ้าของ</option>
            <option value="unassigned"${f.owner === "unassigned" ? " selected" : ""}>ยังไม่ assign</option>
            ${users.map(u => `<option value="${esc(u.id || u._id)}"${f.owner === (u.id || u._id) ? " selected" : ""}>${esc(u.name)}</option>`).join("")}
          </select>
          <select id="tsLeadFilterNeedsCycle">
            <option value="">ทุกรอบ</option>
            <option value="needs_cycle"${f.needsCycle === "needs_cycle" ? " selected" : ""}>ต้องตั้ง Cycle</option>
            <option value="ready"${f.needsCycle === "ready" ? " selected" : ""}>พร้อมใช้งาน</option>
          </select>
          <input type="text" id="tsLeadFilterSearch" placeholder="ค้นหาชื่อ/เบอร์..." value="${esc(f.search || "")}">
        </div>

        ${totalUnassignedLeads.length > 0 ? quickAssignCard({
          idPrefix: "tsLeadsQuickAssign",
          users,
          availableCount: visibleUnassignedLeads.length,
          description: visibleUnassignedLeads.length === totalUnassignedLeads.length
            ? `ยังไม่ assign ${visibleUnassignedLeads.length} lead ในชุดนี้`
            : `ยังไม่ assign ${visibleUnassignedLeads.length} lead จากทั้งหมด ${totalUnassignedLeads.length} lead`,
          compact: true,
        }) : ""}

        <!-- Bulk bar -->
        <div class="ts-bulk-bar" id="tsLeadsBulkBar" style="display:none">
          <span id="tsLeadsSelectedCount">0</span> เลือก
          <select id="tsLeadsBulkUser">
            <option value="">-- เลือกพนักงาน --</option>
            ${users.map(u => `<option value="${esc(u.id || u._id)}">${esc(u.name)}</option>`).join("")}
          </select>
          <button class="ts-btn ts-btn-save ts-btn-sm" id="tsLeadsBulkAssignBtn"><i class="fas fa-user-plus"></i> Assign</button>
        </div>

        <!-- Table -->
        <div class="ts-mgr-section" style="padding:0;">
          <div class="ts-table-wrap">
            <table class="ts-table">
              <thead>
                <tr>
                  <th class="ts-checkbox-cell"><input type="checkbox" id="tsLeadsSelectAll"></th>
                  <th>ชื่อ</th>
                  <th>เบอร์</th>
                  <th>Platform</th>
                  <th>เจ้าของ</th>
                  <th>สถานะ</th>
                  <th>Cycle</th>
                  <th>กำหนดถัดไป</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${leads.length > 0 ? leads.map(l => `
                  <tr>
                    <td class="ts-checkbox-cell"><input type="checkbox" value="${esc(l.id || l._id)}" class="ts-lead-check"></td>
                    <td><strong>${esc(l.displayName || "-")}</strong></td>
                    <td>${esc(l.phone || "-")}</td>
                    <td>${esc(l.platform || "-")}</td>
                    <td>${esc(userMap[l.ownerSalesUserId] || (l.ownerSalesUserId ? "?" : "—"))}</td>
                    <td><span class="ts-status-badge ${esc(l.status || "active")}">${esc(l.status || "active")}</span></td>
                    <td>
                      ${l.needsCycle
                        ? `<span class="ts-status-badge pending">ต้องตั้ง ${Math.max((l.needsCycleOrderIds || []).length, 1)} ออเดอร์</span>`
                        : '<span class="ts-status-badge active">พร้อมใช้งาน</span>'}
                    </td>
                    <td class="${dueCategory(l.nextDueAt) === "overdue" ? "ts-text-danger" : ""}">${esc(relativeDate(l.nextDueAt) || "-")}</td>
                    <td>
                      <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                        <button class="ts-btn ts-btn-ghost ts-btn-sm" data-assign-lead="${esc(l.id || l._id)}"><i class="fas fa-user-plus"></i></button>
                        ${l.needsCycle ? `<button class="ts-btn ts-btn-save ts-btn-sm" data-set-cycle="${esc(l.id || l._id)}"><i class="fas fa-repeat"></i></button>` : ""}
                        ${l.status === "active"
                          ? `<button class="ts-btn ts-btn-ghost ts-btn-sm" data-pause-lead="${esc(l.id || l._id)}"><i class="fas fa-pause"></i></button>`
                          : `<button class="ts-btn ts-btn-save ts-btn-sm" data-reopen-lead="${esc(l.id || l._id)}"><i class="fas fa-rotate-right"></i></button>`}
                      </div>
                    </td>
                  </tr>
                `).join("") : '<tr><td colspan="9" class="ts-empty-small">ไม่พบ lead</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    bindLeadsTabEvents();
  }

  function bindLeadsTabEvents() {
    // Filters
    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => { state.mgrLeadFilters[key] = el.value; renderManagerLeadsContent(); });
    };
    bind("tsLeadFilterStatus", "status");
    bind("tsLeadFilterOwner", "owner");
    bind("tsLeadFilterNeedsCycle", "needsCycle");

    const searchInput = document.getElementById("tsLeadFilterSearch");
    if (searchInput) {
      let t;
      searchInput.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => { state.mgrLeadFilters.search = searchInput.value.trim(); renderManagerLeadsContent(); }, 250);
      });
    }

    // Select all
    const selectAll = document.getElementById("tsLeadsSelectAll");
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        document.querySelectorAll(".ts-lead-check").forEach(cb => cb.checked = selectAll.checked);
        updateBulkBar();
      });
    }

    // Individual checkboxes
    document.querySelectorAll(".ts-lead-check").forEach(cb => {
      cb.addEventListener("change", updateBulkBar);
    });

    // Bulk assign
    const bulkBtn = document.getElementById("tsLeadsBulkAssignBtn");
    if (bulkBtn) {
      bulkBtn.addEventListener("click", async () => {
        const ids = Array.from(document.querySelectorAll(".ts-lead-check:checked")).map(cb => cb.value);
        const salesUserId = document.getElementById("tsLeadsBulkUser")?.value;
        if (!ids.length) { toast("เลือก lead ก่อน", "warning"); return; }
        if (!salesUserId) { toast("เลือกพนักงานขายก่อน", "warning"); return; }
        try {
          await api.post("/api/telesales/leads/bulk-assign", { leadIds: ids, salesUserId });
          toast(`Assign ${ids.length} lead สำเร็จ`);
          await loadManagerLeads();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    }

    // Refresh
    const refreshBtn = document.getElementById("tsLeadsRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => loadManagerLeads());
    }

    bindQuickAssign({
      idPrefix: "tsLeadsQuickAssign",
      getLeadPool: () => unassignedLeadPool(state.mgrLeads).filter((lead) => {
        const matchesStatus = !state.mgrLeadFilters.status || lead.status === state.mgrLeadFilters.status;
        const matchesOwner = !state.mgrLeadFilters.owner || state.mgrLeadFilters.owner === "unassigned";
        const matchesCycle =
          !state.mgrLeadFilters.needsCycle ||
          (state.mgrLeadFilters.needsCycle === "needs_cycle" && lead.needsCycle) ||
          (state.mgrLeadFilters.needsCycle === "ready" && !lead.needsCycle);
        const query = (state.mgrLeadFilters.search || "").toLowerCase();
        const matchesSearch = !query ||
          (lead.displayName || "").toLowerCase().includes(query) ||
          (lead.phone || "").toLowerCase().includes(query);
        return matchesStatus && matchesOwner && matchesCycle && matchesSearch;
      }),
      onDone: async () => {
        await loadManagerLeads();
      },
    });

    document.querySelectorAll("[data-assign-lead]").forEach((btn) => {
      btn.addEventListener("click", () => showAssignModal([btn.dataset.assignLead]));
    });

    document.querySelectorAll("[data-set-cycle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lead = state.mgrLeads.find((item) => (item.id || item._id) === btn.dataset.setCycle);
        if (lead) showCycleModal(lead);
      });
    });

    document.querySelectorAll("[data-pause-lead]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lead = state.mgrLeads.find((item) => (item.id || item._id) === btn.dataset.pauseLead);
        if (lead) showPauseLeadModal(lead);
      });
    });

    document.querySelectorAll("[data-reopen-lead]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lead = state.mgrLeads.find((item) => (item.id || item._id) === btn.dataset.reopenLead);
        if (lead) showReopenLeadModal(lead);
      });
    });
  }

  function updateBulkBar() {
    const bar = document.getElementById("tsLeadsBulkBar");
    const count = document.querySelectorAll(".ts-lead-check:checked").length;
    if (bar) {
      bar.style.display = count > 0 ? "flex" : "none";
      const countEl = document.getElementById("tsLeadsSelectedCount");
      if (countEl) countEl.textContent = count;
    }
  }

  /* ---------- Manager Team Tab ---------- */
  async function loadManagerTeam() {
    const content = document.getElementById("tsContent");
    if (!content) return;
    content.innerHTML = '<div class="ts-loading"><div class="ts-spinner"></div> กำลังโหลด...</div>';

    try {
      const data = await api.get("/api/telesales/sales-users");
      state.salesUsers = salesUsersFrom(data);
      renderManagerTeamContent();
    } catch (err) {
      content.innerHTML = `<div class="ts-empty-small"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
    }
  }

  function renderManagerTeamContent() {
    const content = document.getElementById("tsContent");
    if (!content) return;

    const users = state.salesUsers;

    content.innerHTML = `
      <div class="ts-fade-in">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
          <h2 style="font-size:1.1rem; font-weight:700; margin:0;">จัดการพนักงาน (${users.length})</h2>
          <button class="ts-btn ts-btn-save ts-btn-sm" id="tsAddUserBtn"><i class="fas fa-plus"></i> เพิ่มพนักงาน</button>
        </div>
        <div class="ts-mgr-section" style="padding:0;">
          <div class="ts-table-wrap">
            <table class="ts-table">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>รหัส</th>
                  <th>Role</th>
                  <th>เบอร์</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td><strong>${esc(u.name)}</strong></td>
                    <td>${esc(u.code)}</td>
                    <td>${esc(u.role)}</td>
                    <td>${esc(u.phone || "-")}</td>
                    <td>${u.isActive !== false ? '<span class="ts-status-badge active">Active</span>' : '<span class="ts-status-badge paused">Inactive</span>'}</td>
                    <td>
                      <button class="ts-btn ts-btn-ghost ts-btn-sm" data-edit-user="${esc(u.id || u._id)}"><i class="fas fa-pen"></i></button>
                    </td>
                  </tr>
                `).join("") || '<tr><td colspan="6" class="ts-empty-small">ยังไม่มีพนักงาน</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Add user button
    document.getElementById("tsAddUserBtn")?.addEventListener("click", () => showUserModal());

    // Edit buttons
    document.querySelectorAll("[data-edit-user]").forEach(btn => {
      btn.addEventListener("click", () => {
        const uid = btn.dataset.editUser;
        const user = state.salesUsers.find(u => (u.id || u._id) === uid);
        if (user) showUserModal(user);
      });
    });
  }

  function showUserModal(existingUser) {
    const existing = document.getElementById("tsUserModal");
    if (existing) existing.remove();

    const isEdit = !!existingUser;
    const modal = document.createElement("div");
    modal.className = "ts-modal-overlay";
    modal.id = "tsUserModal";
    modal.innerHTML = `
      <div class="ts-modal">
        <div class="ts-modal-title">
          <span>${isEdit ? "แก้ไขพนักงาน" : "เพิ่มพนักงานใหม่"}</span>
          <span class="ts-modal-close" id="tsUserModalClose"><i class="fas fa-times"></i></span>
        </div>
        <div class="ts-form-group">
          <label class="ts-label">ชื่อ</label>
          <input class="ts-input" type="text" id="tsUserFormName" value="${esc(existingUser?.name || "")}" required>
        </div>
        <div class="ts-form-group">
          <label class="ts-label">รหัสพนักงาน</label>
          <input class="ts-input" type="text" id="tsUserFormCode" value="${esc(existingUser?.code || "")}" ${isEdit ? "readonly" : ""} required>
        </div>
        ${!isEdit ? `
        <div class="ts-form-group">
          <label class="ts-label">รหัสผ่าน</label>
          <input class="ts-input" type="password" id="tsUserFormPassword" required minlength="4">
        </div>` : ""}
        <div class="ts-form-group">
          <label class="ts-label">Role</label>
          <select class="ts-input" id="tsUserFormRole">
            <option value="sales" ${existingUser?.role === "sales" ? "selected" : ""}>Sales</option>
            <option value="sales_manager" ${existingUser?.role === "sales_manager" ? "selected" : ""}>Manager</option>
          </select>
        </div>
        <div class="ts-form-group">
          <label class="ts-label">เบอร์โทร</label>
          <input class="ts-input" type="text" id="tsUserFormPhone" value="${esc(existingUser?.phone || "")}">
        </div>
        ${isEdit ? `
        <div class="ts-form-group">
          <label class="ts-label">สถานะ</label>
          <select class="ts-input" id="tsUserFormActive">
            <option value="true" ${existingUser?.isActive !== false ? "selected" : ""}>Active</option>
            <option value="false" ${existingUser?.isActive === false ? "selected" : ""}>Inactive</option>
          </select>
        </div>` : ""}
        <div class="ts-modal-actions">
          <button class="ts-btn ts-btn-ghost" id="tsUserCancelBtn">ยกเลิก</button>
          <button class="ts-btn ts-btn-save" id="tsUserSaveBtn"><i class="fas fa-check"></i> ${isEdit ? "บันทึก" : "สร้าง"}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById("tsUserModalClose").addEventListener("click", close);
    document.getElementById("tsUserCancelBtn").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    document.getElementById("tsUserSaveBtn").addEventListener("click", async () => {
      const name = document.getElementById("tsUserFormName")?.value?.trim() || "";
      const code = document.getElementById("tsUserFormCode")?.value?.trim() || "";
      const role = document.getElementById("tsUserFormRole")?.value || "sales";
      const phone = document.getElementById("tsUserFormPhone")?.value?.trim() || "";

      if (!name || !code) { toast("กรุณากรอกชื่อและรหัส", "warning"); return; }

      try {
        if (isEdit) {
          const body = { name, role, phone };
          const activeEl = document.getElementById("tsUserFormActive");
          if (activeEl) body.isActive = activeEl.value === "true";
          await api.patch(`/api/telesales/sales-users/${existingUser.id || existingUser._id}`, body);
          toast("แก้ไขพนักงานสำเร็จ");
        } else {
          const password = document.getElementById("tsUserFormPassword")?.value;
          if (!password || password.length < 4) { toast("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร", "warning"); return; }
          await api.post("/api/telesales/sales-users", { name, code, password, role, phone, isActive: true });
          toast("เพิ่มพนักงานสำเร็จ");
        }
        close();
        await loadManagerTeam();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }

  /* ---------- Manager Reports Tab ---------- */
  async function loadManagerReports() {
    const content = document.getElementById("tsContent");
    if (!content) return;
    content.innerHTML = '<div class="ts-loading"><div class="ts-spinner"></div> กำลังโหลด...</div>';

    try {
      const [reportData, usersData] = await Promise.all([
        api.get("/api/telesales/reports/daily"),
        state.salesUsers.length
          ? Promise.resolve({ salesUsers: state.salesUsers })
          : api.get("/api/telesales/sales-users"),
      ]);
      state.salesUsers = salesUsersFrom(usersData);
      state.reports = reportData.reports || [];

      content.innerHTML = `
        <div class="ts-fade-in">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
            <h2 style="font-size:1.1rem; font-weight:700; margin:0;">รายงานประจำวัน</h2>
            <button class="ts-btn ts-btn-save ts-btn-sm" id="tsGenReportBtn"><i class="fas fa-play"></i> สร้างรายงานวันนี้</button>
          </div>
          ${state.reports.length > 0 ? `
          <div class="ts-mgr-section" style="padding:0;">
            <div class="ts-table-wrap">
              <table class="ts-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>ขอบเขต</th>
                    <th>โทรทั้งหมด</th>
                    <th>ติดต่อได้</th>
                    <th>ปิดตรง</th>
                    <th>Assisted</th>
                    <th>ค้าง</th>
                    <th>No answer</th>
                    <th>Close rate</th>
                    <th>โน้ตครบ</th>
                    <th>AI summary</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.reports.map(r => `
                    ${(() => {
                      const stats = reportStats(r);
                      return `
                    <tr>
                      <td>${esc(r.dateKey || formatDate(r.createdAt))}</td>
                      <td><span class="ts-status-badge ${reportScopeBadgeClass(r)}">${esc(reportScopeLabel(r))}</span></td>
                      <td>${stats.attempted || 0}</td>
                      <td>${stats.contacted || 0}</td>
                      <td>${stats.direct_closed_won || 0}</td>
                      <td>${stats.assisted_reorder || 0}</td>
                      <td>${stats.overdue || 0}</td>
                      <td>${percent(stats.no_answer_rate)}</td>
                      <td>${percent(stats.close_rate)}</td>
                      <td>${percent(stats.note_coverage)}</td>
                      <td style="min-width:320px; line-height:1.6;">${esc(r.aiSummary || "-")}</td>
                    </tr>
                  `;
                    })()}
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
          ` : '<div class="ts-empty-small">ยังไม่มีรายงาน</div>'}
        </div>
      `;

      document.getElementById("tsGenReportBtn")?.addEventListener("click", async () => {
        const btn = document.getElementById("tsGenReportBtn");
        try {
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังสร้าง...';
          await api.post("/api/telesales/reports/daily/run", {});
          toast("สร้างรายงานสำเร็จ");
          await loadManagerReports();
        } catch (err) {
          toast(err.message, "error");
        } finally {
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> สร้างรายงานวันนี้'; }
        }
      });
    } catch (err) {
      content.innerHTML = `<div class="ts-empty-small"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
    }
  }

  function showCycleModal(lead) {
    const existing = document.getElementById("tsCycleModal");
    if (existing) existing.remove();

    const orderIds = Array.isArray(lead?.needsCycleOrderIds) && lead.needsCycleOrderIds.length
      ? lead.needsCycleOrderIds
      : (lead?.latestOrderId ? [lead.latestOrderId] : []);

    if (!orderIds.length) {
      toast("lead นี้ไม่มีออเดอร์ที่ตั้ง Cycle ได้", "warning");
      return;
    }

    const modal = document.createElement("div");
    modal.className = "ts-modal-overlay";
    modal.id = "tsCycleModal";
    modal.innerHTML = `
      <div class="ts-modal">
        <div class="ts-modal-title">
          <span>ตั้ง Cycle สำหรับ ${esc(lead.displayName || "ลูกค้า")}</span>
          <span class="ts-modal-close" id="tsCycleModalClose"><i class="fas fa-times"></i></span>
        </div>
        <div class="ts-form-group">
          <label class="ts-label">โทรซ้ำอีกกี่วัน</label>
          <input class="ts-input" type="number" id="tsCycleDaysInput" value="30" min="1" max="365">
        </div>
        <div class="ts-form-group">
          <label class="ts-label">จะอัปเดต</label>
          <div class="ts-empty-small" style="justify-content:flex-start;">${orderIds.length} ออเดอร์ที่ยังไม่มี cycle</div>
        </div>
        <div class="ts-modal-actions">
          <button class="ts-btn ts-btn-ghost" id="tsCycleCancelBtn">ยกเลิก</button>
          <button class="ts-btn ts-btn-save" id="tsCycleSaveBtn"><i class="fas fa-check"></i> บันทึก</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById("tsCycleModalClose").addEventListener("click", close);
    document.getElementById("tsCycleCancelBtn").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    document.getElementById("tsCycleSaveBtn").addEventListener("click", async () => {
      const cycleDays = parseInt(document.getElementById("tsCycleDaysInput")?.value, 10);
      if (!cycleDays || cycleDays < 1) {
        toast("กรุณาระบุจำนวนวันที่ถูกต้อง", "warning");
        return;
      }

      try {
        await Promise.all(orderIds.map((orderId) => api.patch(`/admin/orders/${orderId}/telesales-settings`, {
          teleSalesEnabled: true,
          teleSalesCycleDays: cycleDays,
        })));
        toast(`ตั้ง Cycle ${cycleDays} วันสำเร็จ`);
        close();
        await loadManagerLeads();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }

  function showPauseLeadModal(lead) {
    const existing = document.getElementById("tsPauseLeadModal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.className = "ts-modal-overlay";
    modal.id = "tsPauseLeadModal";
    modal.innerHTML = `
      <div class="ts-modal">
        <div class="ts-modal-title">
          <span>พักการติดตาม</span>
          <span class="ts-modal-close" id="tsPauseLeadModalClose"><i class="fas fa-times"></i></span>
        </div>
        <div class="ts-form-group">
          <label class="ts-label">สถานะ</label>
          <select class="ts-input" id="tsPauseLeadStatus">
            <option value="paused">Paused</option>
            <option value="dnc">Do not call</option>
          </select>
        </div>
        <div class="ts-form-group">
          <label class="ts-label">เหตุผล</label>
          <textarea class="ts-input" id="tsPauseLeadReason" rows="3" placeholder="เหตุผลในการพัก lead"></textarea>
        </div>
        <div class="ts-modal-actions">
          <button class="ts-btn ts-btn-ghost" id="tsPauseLeadCancelBtn">ยกเลิก</button>
          <button class="ts-btn ts-btn-save" id="tsPauseLeadSaveBtn"><i class="fas fa-check"></i> บันทึก</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById("tsPauseLeadModalClose").addEventListener("click", close);
    document.getElementById("tsPauseLeadCancelBtn").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    document.getElementById("tsPauseLeadSaveBtn").addEventListener("click", async () => {
      try {
        await api.post(`/api/telesales/leads/${lead.id || lead._id}/pause`, {
          status: document.getElementById("tsPauseLeadStatus")?.value || "paused",
          reason: document.getElementById("tsPauseLeadReason")?.value?.trim() || "",
        });
        toast("อัปเดตสถานะ lead แล้ว");
        close();
        await loadManagerLeads();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }

  function showReopenLeadModal(lead) {
    const existing = document.getElementById("tsReopenLeadModal");
    if (existing) existing.remove();

    const users = state.salesUsers.filter((user) => user.isActive !== false);
    const modal = document.createElement("div");
    modal.className = "ts-modal-overlay";
    modal.id = "tsReopenLeadModal";
    modal.innerHTML = `
      <div class="ts-modal">
        <div class="ts-modal-title">
          <span>เปิด lead กลับมาใช้งาน</span>
          <span class="ts-modal-close" id="tsReopenLeadModalClose"><i class="fas fa-times"></i></span>
        </div>
        <div class="ts-form-group">
          <label class="ts-label">ครบกำหนดอีก (วัน)</label>
          <input class="ts-input" type="number" id="tsReopenLeadDays" value="1" min="0" max="365">
        </div>
        <div class="ts-form-group">
          <label class="ts-label">มอบหมายให้</label>
          <select class="ts-input" id="tsReopenLeadAssignee">
            <option value="">ใช้เจ้าของเดิม</option>
            ${users.map((user) => `<option value="${esc(user.id || user._id)}"${(lead.ownerSalesUserId === (user.id || user._id)) ? " selected" : ""}>${esc(user.name)} (${esc(user.code)})</option>`).join("")}
          </select>
        </div>
        <div class="ts-modal-actions">
          <button class="ts-btn ts-btn-ghost" id="tsReopenLeadCancelBtn">ยกเลิก</button>
          <button class="ts-btn ts-btn-save" id="tsReopenLeadSaveBtn"><i class="fas fa-check"></i> เปิดใช้งาน</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById("tsReopenLeadModalClose").addEventListener("click", close);
    document.getElementById("tsReopenLeadCancelBtn").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    document.getElementById("tsReopenLeadSaveBtn").addEventListener("click", async () => {
      const days = parseInt(document.getElementById("tsReopenLeadDays")?.value, 10);
      if (Number.isNaN(days) || days < 0) {
        toast("กรุณาระบุจำนวนวันที่ถูกต้อง", "warning");
        return;
      }

      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + days);
      nextDate.setHours(9, 0, 0, 0);

      try {
        await api.post(`/api/telesales/leads/${lead.id || lead._id}/reopen`, {
          dueAt: nextDate.toISOString(),
          assignedToSalesUserId: document.getElementById("tsReopenLeadAssignee")?.value || undefined,
        });
        toast("เปิด lead กลับมาแล้ว");
        close();
        await loadManagerLeads();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }

})();
