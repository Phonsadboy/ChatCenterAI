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
    activeTab: "today",
    searchQuery: "",
    selectedLeadId: null,
    leadDetail: null,
    callForm: { outcome: "", note: "", followupDays: 3 },
    orderFormVisible: false,
    // Manager
    mgrTab: "dashboard",
    dashboardData: null,
    mgrLeads: [],
    mgrLeadFilters: { status: "", owner: "", search: "" },
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

  const NEEDS_NEXT = new Set(["no_answer", "busy", "call_back", "interested", "not_interested"]);
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
      const data = await api.get("/api/telesales/my-queue");
      state.queueData = data;
      state.queueItems = data.items || [];
      updateBadges();
      renderQueueList();
      updateTopbarStats();
    } catch (err) {
      document.getElementById("tsQueueList").innerHTML =
        `<div class="ts-empty-small"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
    }
  }

  function updateBadges() {
    const items = state.queueItems;
    const counts = { overdue: 0, today: 0, tomorrow: 0 };
    items.forEach(item => {
      const cat = dueCategory(item.checkpoint?.dueAt || item.lead?.nextDueAt);
      if (counts[cat] !== undefined) counts[cat]++;
    });
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("tabBadgeOverdue", counts.overdue);
    set("tabBadgeToday", counts.today);
    set("tabBadgeTomorrow", counts.tomorrow);
    set("tabBadgeAll", items.length);
  }

  function updateTopbarStats() {
    const el = document.getElementById("tsTopbarStats");
    if (!el) return;
    const s = state.queueData?.summary || {};
    el.innerHTML = `
      <div class="ts-topbar-stat"><span>โทร:</span> <span class="num">${s.calls_today || 0}</span></div>
      <div class="ts-topbar-stat"><span>ปิด:</span> <span class="num">${s.closed_today || 0}</span></div>
      <div class="ts-topbar-stat"><span>เหลือ:</span> <span class="num">${(state.queueItems || []).length}</span></div>
    `;
  }

  /* ---------- Render Queue List ---------- */
  function renderQueueList() {
    const container = document.getElementById("tsQueueList");
    if (!container) return;

    let items = state.queueItems;

    // Filter by tab
    if (state.activeTab !== "all") {
      items = items.filter(item => {
        const cat = dueCategory(item.checkpoint?.dueAt || item.lead?.nextDueAt);
        return cat === state.activeTab;
      });
    }

    // Filter by search
    if (state.searchQuery) {
      const q = state.searchQuery;
      items = items.filter(item => {
        const name = (item.lead?.displayName || "").toLowerCase();
        const phone = (item.lead?.phone || "").toLowerCase();
        return name.includes(q) || phone.includes(q);
      });
    }

    if (items.length === 0) {
      container.innerHTML = `<div class="ts-empty-small"><i class="fas fa-inbox"></i> ไม่มีรายการ</div>`;
      updateFooter(0);
      return;
    }

    container.innerHTML = items.map(item => {
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

    updateFooter(items.length);
  }

  function updateFooter(count) {
    const footer = document.getElementById("tsQueueFooter");
    if (!footer) return;
    const total = state.queueItems.length;
    footer.innerHTML = `<span>แสดง ${count} รายการ</span><span>ทั้งหมด ${total} ลีด</span>`;
  }

  /* ---------- Load Lead Detail ---------- */
  async function loadLeadDetail(leadId, checkpointId) {
    const panel = document.getElementById("tsDetailPanel");
    if (!panel) return;
    panel.innerHTML = '<div class="ts-loading"><div class="ts-spinner"></div> กำลังโหลด...</div>';

    try {
      const data = await api.get(`/api/telesales/leads/${leadId}`);
      state.leadDetail = data;
      state.callForm = { outcome: "", note: "", followupDays: 3 };
      state.orderFormVisible = false;

      // Find the active checkpoint (from queue or from lead data)
      let activeCheckpointId = checkpointId;
      if (!activeCheckpointId && data.checkpoints) {
        const openCp = data.checkpoints.find(c => c.status === "open");
        if (openCp) activeCheckpointId = openCp.id || openCp._id;
      }

      renderLeadDetail(data, activeCheckpointId);
    } catch (err) {
      panel.innerHTML = `<div class="ts-empty-small"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)}</div>`;
    }
  }

  /* ---------- Render Lead Detail ---------- */
  function renderLeadDetail(data, checkpointId) {
    const panel = document.getElementById("tsDetailPanel");
    if (!panel) return;

    const lead = data.lead || {};
    const orders = data.orders || [];
    const callLogs = data.callLogs || [];
    const latestOrder = orders[0];

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
              ${lead.phone ? `<span><i class="fas fa-phone"></i> <a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a></span>` : ""}
              ${lead.platform ? `<span><i class="fas fa-${lead.platform === "line" ? "comment-dots" : "globe"}"></i> ${esc(lead.platform)}</span>` : ""}
              ${lead.address || lead.shippingAddress ? `<span><i class="fas fa-map-marker-alt"></i> ${esc(lead.address || lead.shippingAddress || "")}</span>` : ""}
            </div>
          </div>
        </div>

        <!-- Latest order -->
        ${latestOrder ? `
        <div class="ts-section">
          <div class="ts-section-title"><i class="fas fa-shopping-bag"></i> ออเดอร์ล่าสุด</div>
          <div class="ts-order-card">
            <div class="ts-order-items">
              ${(latestOrder.items || latestOrder.orderData?.items || []).map(it =>
                `${esc(it.product || it.name)} x${it.quantity} ฿${money(it.price)}`
              ).join("<br>")}
              <span>${formatDate(latestOrder.createdAt || latestOrder.extractedAt)}</span>
            </div>
            ${latestOrder.totalAmount || latestOrder.orderData?.totalAmount ? `<div class="ts-order-total">฿${money(latestOrder.totalAmount || latestOrder.orderData?.totalAmount)}</div>` : ""}
          </div>
        </div>
        ` : ""}

        <!-- Timeline -->
        <div class="ts-section">
          <div class="ts-section-title"><i class="fas fa-timeline"></i> ประวัติการโทร</div>
          ${callLogs.length > 0 ? `
          <div class="ts-timeline">
            ${callLogs.map(log => `
              <div class="ts-timeline-item">
                <div class="ts-timeline-dot ${esc(OUTCOME_CLASS[log.outcome] || "neutral")}"></div>
                <div class="ts-timeline-date">${esc(formatDateTime(log.createdAt || log.calledAt))}</div>
                <div class="ts-timeline-outcome">
                  <i class="fas ${esc(OUTCOME_ICONS[log.outcome] || "fa-phone")}"></i>
                  ${esc(OUTCOME_LABELS[log.outcome] || log.outcome || "-")}
                </div>
                ${log.note ? `<div class="ts-timeline-note">${esc(log.note)}</div>` : ""}
              </div>
            `).join("")}
          </div>
          ` : '<div class="ts-empty-small">ยังไม่มีประวัติการโทร</div>'}
        </div>

        <!-- Call form -->
        ${checkpointId && lead.status === "active" ? renderCallForm(checkpointId, lead) : ""}
      </div>
    `;

    // Bind call form events
    if (checkpointId && lead.status === "active") {
      bindCallFormEvents(checkpointId, lead);
    }
  }

  /* ---------- Call Form ---------- */
  function renderCallForm(checkpointId, lead) {
    return `
      <div class="ts-section">
        <div class="ts-call-form" id="tsCallForm">
          <div class="ts-call-form-title"><i class="fas fa-phone-flip"></i> บันทึกการโทร</div>
          <div class="ts-outcome-grid" id="tsOutcomeGrid">
            ${CALL_OUTCOMES.map(o => {
              let cls = "ts-outcome-btn";
              if (TERMINAL_OUTCOMES.has(o)) cls += " terminal";
              return `<button class="${cls}" data-outcome="${o}"><i class="fas ${OUTCOME_ICONS[o]}"></i> ${OUTCOME_LABELS[o]}</button>`;
            }).join("")}
            <button class="ts-outcome-btn closed-won" data-outcome="closed_won"><i class="fas fa-trophy"></i> ปิดการขาย</button>
          </div>
          <div class="ts-call-fields">
            <textarea id="tsCallNote" placeholder="โน้ตการโทร (จำเป็น)" rows="2"></textarea>
            <div class="ts-followup-row" id="tsFollowupRow">
              <span>Follow-up อีก</span>
              <input type="number" id="tsFollowupDays" value="3" min="1" max="365">
              <span>วัน</span>
            </div>
          </div>
          <div id="tsOrderFormSlot"></div>
          <div class="ts-save-row">
            <button class="ts-btn ts-btn-save" id="tsSaveCallBtn" disabled>
              <i class="fas fa-save"></i> บันทึก
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function bindCallFormEvents(checkpointId, lead) {
    const grid = document.getElementById("tsOutcomeGrid");
    const noteEl = document.getElementById("tsCallNote");
    const followupRow = document.getElementById("tsFollowupRow");
    const followupDays = document.getElementById("tsFollowupDays");
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
      } else {
        followupRow.style.display = "none";
      }

      // Show/hide order form
      if (outcome === "closed_won") {
        state.orderFormVisible = true;
        orderSlot.innerHTML = renderOrderForm(lead);
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

    followupDays.addEventListener("input", () => {
      state.callForm.followupDays = parseInt(followupDays.value) || 3;
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
        await submitOrder(checkpointId, lead);
      } else {
        await submitCallLog(checkpointId);
      }
    });
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
        const days = state.callForm.followupDays || 3;
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + days);
        nextDate.setHours(9, 0, 0, 0);
        body.nextCheckpointAt = nextDate.toISOString();
      }

      await api.post(`/api/telesales/checkpoints/${checkpointId}/log-call`, body);
      toast("บันทึกการโทรสำเร็จ");

      // Refresh queue and detail
      await loadQueue();
      // Auto-select next item or clear
      const nextItem = state.queueItems.find(it => leadIdOf(it) !== state.selectedLeadId);
      if (nextItem) {
        state.selectedLeadId = leadIdOf(nextItem);
        loadLeadDetail(leadIdOf(nextItem), checkpointIdOf(nextItem));
      } else {
        state.selectedLeadId = null;
        document.getElementById("tsDetailPanel").innerHTML = `
          <div class="ts-detail-placeholder">
            <i class="fas fa-check-circle" style="color: var(--ts-success)"></i>
            <p>โทรหมดแล้ว!</p>
          </div>`;
      }
      renderQueueList();
    } catch (err) {
      toast(err.message, "error");
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> บันทึก';
    }
  }

  /* ---------- Order Form (Inline) ---------- */
  function renderOrderForm(lead) {
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
            <input class="ts-input" type="text" id="tsOrderPhone" value="${esc(lead.phone || "")}">
          </div>
        </div>
        <div class="ts-form-row single">
          <div class="ts-form-group">
            <label class="ts-label">ที่อยู่จัดส่ง</label>
            <input class="ts-input" type="text" id="tsOrderAddress" value="${esc(lead.address || lead.shippingAddress || "")}">
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
            <label class="ts-label">Follow-up อีก (วัน)</label>
            <input class="ts-input" type="number" id="tsOrderCycleDays" value="30" min="1">
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
  async function submitOrder(checkpointId, lead) {
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
      const phone = document.getElementById("tsOrderPhone")?.value?.trim() || lead.phone || "";
      const address = document.getElementById("tsOrderAddress")?.value?.trim() || "";
      const payment = document.getElementById("tsOrderPayment")?.value || "เก็บเงินปลายทาง";
      const cycleDays = parseInt(document.getElementById("tsOrderCycleDays")?.value) || 30;

      const body = {
        callNote: state.callForm.note.trim(),
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

      await api.post(`/api/telesales/checkpoints/${checkpointId}/create-order`, body);
      toast("ปิดการขายและสร้างออเดอร์สำเร็จ!");

      // Refresh
      await loadQueue();
      const nextItem = state.queueItems.find(it => leadIdOf(it) !== state.selectedLeadId);
      if (nextItem) {
        state.selectedLeadId = leadIdOf(nextItem);
        loadLeadDetail(leadIdOf(nextItem), checkpointIdOf(nextItem));
      } else {
        state.selectedLeadId = null;
        document.getElementById("tsDetailPanel").innerHTML = `
          <div class="ts-detail-placeholder">
            <i class="fas fa-check-circle" style="color: var(--ts-success)"></i>
            <p>โทรหมดแล้ว!</p>
          </div>`;
      }
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
      // Load queue + leads + sales users in parallel
      const [queueData, leadsData, usersData] = await Promise.all([
        api.get("/api/telesales/manager/queue"),
        api.get("/api/telesales/manager/leads?limit=500"),
        api.get("/api/telesales/sales-users"),
      ]);

      state.salesUsers = usersData.users || [];
      const allItems = queueData.items || [];
      const allLeads = leadsData.leads || [];

      // KPI calculations
      const totalLeads = allLeads.length;
      const unassigned = allLeads.filter(l => !l.ownerSalesUserId).length;
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
      const unassignedLeads = allLeads.filter(l => !l.ownerSalesUserId).slice(0, 10);

      content.innerHTML = `
        <div class="ts-fade-in">
          <!-- KPI -->
          <div class="ts-kpi-grid">
            ${kpiCard("fas fa-address-book", "primary", totalLeads, "Leads ทั้งหมด")}
            ${kpiCard("fas fa-exclamation-triangle", "danger", overdue, "เลยกำหนด")}
            ${kpiCard("fas fa-clock", "warning", dueToday, "โทรวันนี้")}
            ${kpiCard("fas fa-user-slash", "info", unassigned, "ยังไม่ assign")}
          </div>

          <!-- Needs attention -->
          ${unassignedLeads.length > 0 ? `
          <div class="ts-mgr-section">
            <div class="ts-mgr-section-header">
              <div class="ts-mgr-section-title"><i class="fas fa-triangle-exclamation"></i> ต้องจัดการ (${unassigned} lead ยังไม่มีเจ้าของ)</div>
              <button class="ts-btn ts-btn-save ts-btn-sm" id="tsDashAssignBtn"><i class="fas fa-user-plus"></i> Assign ที่เลือก</button>
            </div>
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
            <div id="tsDashReportSummary" class="ts-empty-small">กดปุ่มเพื่อสร้างรายงาน</div>
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
            const r = reports.reports[0];
            el.innerHTML = `<div style="text-align:left; font-size:0.85rem;">
              ทีมโทรไป <strong>${r.totalCalls || 0}</strong> สาย
              ปิดได้ <strong>${r.closedWon || 0}</strong> ออเดอร์
              ยอด <strong>฿${money(r.totalRevenue || 0)}</strong>
            </div>`;
          }
        } catch (err) {
          toast(err.message, "error");
        } finally {
          reportBtn.disabled = false;
          reportBtn.innerHTML = '<i class="fas fa-play"></i> สร้างรายงาน';
        }
      });
    }
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
        api.get("/api/telesales/manager/leads?limit=500"),
        state.salesUsers.length ? Promise.resolve({ users: state.salesUsers }) : api.get("/api/telesales/sales-users"),
      ]);

      state.salesUsers = usersData.users || [];
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

    content.innerHTML = `
      <div class="ts-fade-in">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <h2 style="font-size:1.1rem; font-weight:700; margin:0;">Leads ทั้งหมด (${state.mgrLeads.length})</h2>
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
          <input type="text" id="tsLeadFilterSearch" placeholder="ค้นหาชื่อ/เบอร์..." value="${esc(f.search || "")}">
        </div>

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
                  <th>กำหนดถัดไป</th>
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
                    <td class="${dueCategory(l.nextDueAt) === "overdue" ? "ts-text-danger" : ""}">${esc(relativeDate(l.nextDueAt) || "-")}</td>
                  </tr>
                `).join("") : '<tr><td colspan="7" class="ts-empty-small">ไม่พบ lead</td></tr>'}
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
      state.salesUsers = data.users || [];
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
      const data = await api.get("/api/telesales/reports/daily");
      state.reports = data.reports || [];

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
                    <th>โทรทั้งหมด</th>
                    <th>ติดต่อได้</th>
                    <th>ปิดขาย</th>
                    <th>ยอดรวม</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.reports.map(r => `
                    <tr>
                      <td>${esc(r.dateKey || formatDate(r.createdAt))}</td>
                      <td>${r.totalCalls || 0}</td>
                      <td>${r.contacted || 0}</td>
                      <td>${r.closedWon || 0}</td>
                      <td>฿${money(r.totalRevenue || 0)}</td>
                    </tr>
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

})();
