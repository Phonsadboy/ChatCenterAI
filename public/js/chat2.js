class Chat2Manager {
  constructor() {
    this.socket = null;
    this.currentUserId = "";
    this.allUsers = [];
    this.users = [];
    this.history = {};
    this.availableTags = [];
    this.templates = [];
    this.adminUsers = [];
    this.context = this.emptyContext();
    this.filters = {
      inboxKey: "all",
      inboxKeys: ["all"],
      status: "all",
      search: "",
      tags: [],
    };
    this.filtersCollapsed = true;
    this.tagFiltersExpanded = false;
    this.mobileMedia = window.matchMedia ? window.matchMedia("(max-width: 991.98px)") : null;
    this.mobilePanel = "";
    this.inboxes = [];
    this.adminUser = window.adminAuth?.user || null;
    this.permissions = Array.isArray(this.adminUser?.permissions) ? this.adminUser.permissions : [];
    this.allowedTabs = this.resolveAllowedTabs();
    this.activeTab = this.allowedTabs.includes("overview") ? "overview" : (this.allowedTabs[0] || "forms");
    this.currentFormId = "";
    this.emojiPopover = null;
    this.tagColorModal = null;
    this.pendingSystemTag = "";
    this.pendingFocusUserId = this.getQueryParam("user") || this.getQueryParam("focus") || this.getQueryParam("userId");
    this.pendingFocusPlatform = this.getQueryParam("platform");
    this.pendingFocusBotId = this.getQueryParam("botId");
    this.usersRequestSeq = 0;
    if (this.pendingFocusPlatform) {
      const pendingInboxKey = this.buildInboxKey(this.pendingFocusPlatform, this.pendingFocusBotId || "default");
      this.setInboxKeys([pendingInboxKey]);
    }
    this.focusHandled = false;
    this.init();
  }

  emptyContext() {
    return {
      user: null,
      orders: [],
      forms: [],
      submissions: [],
      notes: "",
      notesUpdatedAt: null,
      files: [],
      assignment: null,
    };
  }

  init() {
    this.applyPermissionUi();
    this.bindEvents();
    this.updateFilterPanel();
    this.updateTagFilterState();
    this.renderFilterSummary();
    this.syncMobileShell();
    this.renderHeader();
    this.renderContext();
    this.initSocket();
    this.loadInboxes();
    if (this.can("chat:tags")) this.loadAvailableTags();
    if (this.can("chat:templates")) this.loadTemplates();
    if (this.can("chat:assign")) this.loadAdminUsers();
    this.loadUsers();
  }

  $(id) {
    return document.getElementById(id);
  }

  isMobile() {
    return this.mobileMedia ? this.mobileMedia.matches : window.innerWidth <= 991;
  }

  setMobilePanel(panel = "", options = {}) {
    if (!this.isMobile()) {
      panel = "";
    }
    if (panel === "context" && !this.allowedTabs.length) {
      panel = "";
    }
    const previousPanel = this.mobilePanel;
    this.mobilePanel = panel;
    this.updateMobilePanelClasses();
    if (options.focus && panel && panel !== previousPanel) {
      this.focusMobilePanel(panel);
    } else if (options.focus && !panel && previousPanel && this.mobileFocusReturn?.focus) {
      this.mobileFocusReturn.focus({ preventScroll: true });
      this.mobileFocusReturn = null;
    }
  }

  toggleMobilePanel(panel) {
    this.mobileFocusReturn = document.activeElement;
    this.setMobilePanel(this.mobilePanel === panel ? "" : panel, { focus: true });
  }

  closeMobilePanels() {
    this.setMobilePanel("", { focus: true });
  }

  focusMobilePanel(panel) {
    const target = panel === "inbox"
      ? this.$("chat2Search")
      : this.$("chat2Tabs")?.querySelector("button:not([disabled])");
    if (target?.focus) {
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }
  }

  syncMobileShell() {
    const shell = this.$("chat2App");
    if (!shell) return;
    const mobile = this.isMobile();
    shell.classList.toggle("is-mobile", mobile);
    if (!mobile) {
      this.setMobilePanel("");
      return;
    }
    if (!this.currentUserId && !this.mobilePanel) {
      this.mobilePanel = "inbox";
    }
    this.updateMobilePanelClasses();
  }

  updateMobilePanelClasses() {
    const shell = this.$("chat2App");
    if (!shell) return;
    const mobile = this.isMobile();
    const inboxOpen = mobile && this.mobilePanel === "inbox";
    const contextOpen = mobile && this.mobilePanel === "context";
    shell.classList.toggle("is-mobile-inbox-open", inboxOpen);
    shell.classList.toggle("is-mobile-context-open", contextOpen);
    document.body.classList.toggle("chat2-mobile-panel-open", inboxOpen || contextOpen);

    const scrim = this.$("chat2MobileScrim");
    if (scrim) scrim.hidden = !(inboxOpen || contextOpen);

    const inboxBtn = this.$("chat2MobileInboxToggle");
    if (inboxBtn) {
      inboxBtn.classList.toggle("is-active", inboxOpen);
      inboxBtn.setAttribute("aria-expanded", inboxOpen ? "true" : "false");
    }

    const contextBtn = this.$("chat2MobileContextToggle");
    if (contextBtn) {
      contextBtn.classList.toggle("is-active", contextOpen);
      contextBtn.setAttribute("aria-expanded", contextOpen ? "true" : "false");
    }

    const inbox = shell.querySelector(".cc2-inbox");
    const context = shell.querySelector(".cc2-context");
    if (inbox) {
      inbox.setAttribute("aria-hidden", mobile && !inboxOpen ? "true" : "false");
      inbox.inert = mobile && !inboxOpen;
    }
    if (context) {
      context.setAttribute("aria-hidden", mobile && !contextOpen ? "true" : "false");
      context.inert = mobile && !contextOpen;
    }
  }

  can(permission) {
    if (!permission) return true;
    if (!this.adminUser) return true;
    if (this.adminUser.role === "superadmin") return true;
    return this.permissions.includes(permission);
  }

  resolveAllowedTabs(serverTabs = null) {
    const baseTabs = Array.isArray(serverTabs) && serverTabs.length
      ? serverTabs
      : Array.isArray(this.adminUser?.chatLayout?.allowedTabs) && this.adminUser.chatLayout.allowedTabs.length
        ? this.adminUser.chatLayout.allowedTabs
        : ["overview", "tags", "forms", "orders", "files", "notes", "tools"];
    const tabPermissions = {
      overview: "chat:view",
      tags: "chat:tags",
      forms: "chat:forms",
      orders: "chat:orders",
      files: "chat:files",
      notes: "chat:notes",
      tools: null,
    };
    return baseTabs.filter((tab) => {
      if (tab === "tools") {
        return this.can("chat:templates") || this.can("chat:forward") || this.can("chat:assign") || this.can("chat:debug") || this.can("chat:export");
      }
      return this.can(tabPermissions[tab]);
    });
  }

  getQueryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name)?.trim() || "";
    } catch (_) {
      return "";
    }
  }

  buildInboxKey(platform = "", botId = "") {
    const normalizedPlatform = String(platform || "").trim().toLowerCase();
    if (!normalizedPlatform) return "all";
    const normalizedBotId = String(botId || "").trim() || "default";
    return `${normalizedPlatform}:${normalizedBotId}`;
  }

  normalizeInboxKeys(keys = []) {
    const rawKeys = Array.isArray(keys) ? keys : [keys];
    const unique = Array.from(new Set(
      rawKeys
        .map((key) => String(key || "").trim())
        .filter(Boolean),
    ));
    if (!unique.length || unique.includes("all")) return ["all"];
    return unique;
  }

  selectedInboxKeys() {
    return this.normalizeInboxKeys(this.filters.inboxKeys || this.filters.inboxKey || "all");
  }

  setInboxKeys(keys) {
    const normalized = this.normalizeInboxKeys(keys);
    this.filters.inboxKeys = normalized;
    this.filters.inboxKey = normalized.length === 1 ? normalized[0] : "all";
  }

  singleInboxKey() {
    const keys = this.selectedInboxKeys();
    return keys.length === 1 ? keys[0] : "all";
  }

  parseInboxKey(inboxKey = this.singleInboxKey()) {
    const key = String(inboxKey || "").trim();
    if (!key || key === "all" || !key.includes(":")) return null;
    const [platformPart, ...botParts] = key.split(":");
    const platform = platformPart.trim().toLowerCase();
    const botKey = botParts.join(":").trim();
    if (!platform) return null;
    return {
      platform,
      botId: botKey && botKey !== "default" ? botKey : "",
    };
  }

  userInboxKey(user) {
    return this.buildInboxKey(user?.platform || "line", user?.botId || "default");
  }

  currentConversationContext() {
    const user = this.currentUser();
    if (user?.platform) {
      return {
        platform: user.platform,
        botId: user.botId || "default",
      };
    }
    const inbox = this.parseInboxKey();
    return inbox
      ? { platform: inbox.platform, botId: inbox.botId || "default" }
      : { platform: "", botId: "" };
  }

  currentConversationPayload() {
    const context = this.currentConversationContext();
    return {
      ...(context.platform ? { platform: context.platform } : {}),
      ...(context.botId ? { botId: context.botId } : {}),
    };
  }

  currentConversationQuery() {
    const params = new URLSearchParams(this.currentConversationPayload());
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  currentAdminLabels() {
    return [
      this.adminUser?.label,
      this.adminUser?.role,
      this.adminUser?.codeId,
      "current",
    ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  }

  normalizeAssignment(rawAssignment = {}, user = {}) {
    const assignment = rawAssignment && typeof rawAssignment === "object" ? rawAssignment : {};
    const status = String(assignment.queueStatus || assignment.status || "open").toLowerCase();
    const queueStatus = ["open", "pending", "resolved"].includes(status) ? status : "open";
    const waitingSince = assignment.waitingSince || user.lastTimestamp || null;
    const waitingTime = waitingSince ? new Date(waitingSince).getTime() : 0;
    const waitingMinutes = Number.isFinite(Number(assignment.waitingMinutes))
      ? Math.max(0, Number(assignment.waitingMinutes))
      : waitingTime
        ? Math.max(0, Math.floor((Date.now() - waitingTime) / 60000))
        : 0;
    return {
      ...assignment,
      ownerId: assignment.ownerId || assignment.assigneeId || "",
      ownerLabel: assignment.ownerLabel || assignment.assigneeLabel || "",
      queueStatus,
      status: queueStatus,
      assignmentState: assignment.assignmentState || (assignment.ownerId || assignment.assigneeId ? "assigned" : "unassigned"),
      waitingSince,
      waitingMinutes,
      slaDueAt: assignment.slaDueAt || null,
      isOverdue: this.isAssignmentOverdue({
        queueStatus,
        slaDueAt: assignment.slaDueAt || null,
        isOverdue: assignment.isOverdue,
      }),
    };
  }

  isMyAssignment(assignment = {}) {
    const normalized = this.normalizeAssignment(assignment);
    if (this.isUnassigned(normalized)) return false;
    const labels = this.currentAdminLabels();
    const ownerId = String(normalized.ownerId || "").trim().toLowerCase();
    const ownerLabel = String(normalized.ownerLabel || "").trim().toLowerCase();
    if (ownerId && ownerId !== "current" && labels.includes(ownerId)) return true;
    if (ownerLabel && labels.includes(ownerLabel)) return true;
    return ownerId === "current" && ownerLabel && labels.includes(ownerLabel);
  }

  isUnassigned(assignment = {}) {
    const ownerId = String(assignment.ownerId || assignment.assigneeId || "").trim();
    const ownerLabel = String(assignment.ownerLabel || assignment.assigneeLabel || "").trim();
    return assignment.assignmentState === "unassigned" || (!ownerId && !ownerLabel);
  }

  isAssignmentOverdue(assignment = {}) {
    if (assignment.isOverdue === true) return true;
    if ((assignment.queueStatus || assignment.status) === "resolved") return false;
    if (!assignment.slaDueAt) return false;
    const dueTime = new Date(assignment.slaDueAt).getTime();
    return Number.isFinite(dueTime) && dueTime < Date.now();
  }

  queueStatusLabel(status) {
    return {
      open: "Open",
      pending: "Pending",
      resolved: "Resolved",
    }[status] || "Open";
  }

  queueWaitingLabel(assignment = {}) {
    const normalized = this.normalizeAssignment(assignment);
    if (normalized.queueStatus === "resolved") return "ปิดงานแล้ว";
    if (!normalized.waitingSince) return "ยังไม่มีเวลาเริ่มรอ";
    const minutes = Math.max(0, Math.floor(Number(normalized.waitingMinutes || 0)));
    if (minutes < 60) return `รอ ${minutes} นาที`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `รอ ${hours} ชม. ${rest} นาที` : `รอ ${hours} ชม.`;
  }

  queueDueLabel(assignment = {}) {
    const normalized = this.normalizeAssignment(assignment);
    if (normalized.queueStatus === "resolved") return normalized.resolvedAt ? `ปิด ${this.relativeTime(normalized.resolvedAt)}` : "Resolved";
    if (!normalized.slaDueAt) return "ไม่มี SLA";
    return this.isAssignmentOverdue(normalized)
      ? `เกิน SLA ${this.relativeTime(normalized.slaDueAt)}`
      : `SLA เหลือ ${this.timeUntil(normalized.slaDueAt)}`;
  }

  applyPermissionUi() {
    const hideByPermission = [
      ["chat2ToggleAi", "chat:ai-control"],
      ["chat2TogglePurchase", "chat:purchase-status"],
      ["chat2RefreshProfile", "chat:profile-refresh"],
      ["chat2ClearChat", "chat:clear"],
      ["chat2OpenFiles", "chat:files"],
      ["chat2OpenTemplates", "chat:templates"],
      ["chat2Send", "chat:send"],
    ];
    hideByPermission.forEach(([id, permission]) => {
      const el = this.$(id);
      if (el) el.hidden = !this.can(permission);
    });
    const input = this.$("chat2Input");
    if (input && !this.can("chat:send")) {
      input.disabled = true;
      input.placeholder = "คุณไม่มีสิทธิ์ตอบแชท";
    }
    this.$("chat2Tabs")?.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.hidden = !this.allowedTabs.includes(btn.dataset.tab);
    });
    const mobileContextToggle = this.$("chat2MobileContextToggle");
    if (mobileContextToggle) {
      mobileContextToggle.hidden = !this.allowedTabs.length;
    }
    if (!this.allowedTabs.length && this.mobilePanel === "context") {
      this.setMobilePanel("");
    }
    const toolRules = [
      ["chat2TemplateNew", "chat:templates"],
      ["chat2TemplateEditor", "chat:templates"],
      ["chat2TemplateList", "chat:templates"],
      ["chat2ForwardMessage", "chat:forward"],
      ["chat2ForwardTargets", "chat:forward"],
      ["chat2ForwardSend", "chat:forward"],
      ["chat2AssigneeSelect", "chat:assign"],
      ["chat2QueueStatus", "chat:assign"],
      ["chat2SlaMinutes", "chat:assign"],
      ["chat2AssignmentNote", "chat:assign"],
      ["chat2Assign", "chat:assign"],
      ["chat2ExportTxt", "chat:export"],
      ["chat2ExportJson", "chat:export"],
      ["chat2Debug", "chat:debug"],
    ];
    toolRules.forEach(([id, permission]) => {
      const el = this.$(id);
      if (el) {
        const section = el.closest(".cc2-tool-section");
        if (section && ["chat2TemplateNew", "chat2ForwardSend", "chat2Assign", "chat2Debug"].includes(id)) {
          section.hidden = !this.can(permission);
        } else {
          el.hidden = !this.can(permission);
        }
      }
    });
    if (!this.allowedTabs.includes(this.activeTab)) {
      this.activeTab = this.allowedTabs[0] || "forms";
    }
    this.setTab(this.activeTab);
  }

  bindEvents() {
    this.$("chat2MobileInboxToggle")?.addEventListener("click", () => this.toggleMobilePanel("inbox"));
    this.$("chat2MobileContextToggle")?.addEventListener("click", () => this.toggleMobilePanel("context"));
    this.$("chat2MobileCloseInbox")?.addEventListener("click", () => this.closeMobilePanels());
    this.$("chat2MobileCloseContext")?.addEventListener("click", () => this.closeMobilePanels());
    this.$("chat2MobileScrim")?.addEventListener("click", () => this.closeMobilePanels());
    if (this.mobileMedia?.addEventListener) {
      this.mobileMedia.addEventListener("change", () => this.syncMobileShell());
    } else if (this.mobileMedia?.addListener) {
      this.mobileMedia.addListener(() => this.syncMobileShell());
    }
    window.addEventListener("resize", () => this.syncMobileShell());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.mobilePanel) {
        this.closeMobilePanels();
      }
    });

    this.$("chat2ReloadUsers")?.addEventListener("click", () => this.loadUsers());
    const filterPanel = this.$("chat2FilterPanel");
    const filterToggle = this.$("chat2FilterToggle");
    if (filterPanel?.tagName === "DETAILS") {
      filterPanel.addEventListener("toggle", () => {
        const nextCollapsed = !filterPanel.open;
        if (this.filtersCollapsed !== nextCollapsed) {
          this.filtersCollapsed = nextCollapsed;
        }
        this.updateFilterPanel();
      });
    } else {
      filterToggle?.addEventListener("click", () => this.toggleFiltersCollapsed());
    }
    this.$("chat2ToggleTagFilters")?.addEventListener("click", () => this.toggleTagFiltersExpanded());
    this.$("chat2InboxFilter")?.addEventListener("change", (event) => this.handleInboxFilterChange(event));
    this.$("chat2Search")?.addEventListener("input", (event) => {
      this.filters.search = event.target.value.trim();
      this.renderFilterSummary();
      this.applyFilters();
    });
    this.$("chat2ClearFilters")?.addEventListener("click", () => this.clearFilters());
    this.$("chat2StatusFilters")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-status]");
      if (!btn) return;
      this.filters.status = btn.dataset.status || "all";
      this.$("chat2StatusFilters").querySelectorAll("[data-status]").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      this.renderFilterSummary();
      this.applyFilters();
    });
    this.$("chat2TagFilters")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-filter-tag]");
      if (!btn) return;
      this.toggleFilterTag(btn.dataset.filterTag);
    });
    this.$("chat2UserList")?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-user-id]");
      if (!item) return;
      this.selectUser(item.dataset.userId);
    });
    this.$("chat2Tabs")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-tab]");
      if (!btn) return;
      this.setTab(btn.dataset.tab);
    });
    this.$("chat2Send")?.addEventListener("click", () => this.sendMessage());
    this.$("chat2Input")?.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.sendMessage();
      }
    });
    this.$("chat2Input")?.addEventListener("input", (event) => this.resizeComposer(event.target));
    this.$("chat2ToggleAi")?.addEventListener("click", () => this.toggleAi());
    this.$("chat2TogglePurchase")?.addEventListener("click", () => this.togglePurchase());
    this.$("chat2CopyLink")?.addEventListener("click", () => this.copyChatLink());
    this.$("chat2RefreshProfile")?.addEventListener("click", () => this.refreshProfile());
    this.$("chat2ClearChat")?.addEventListener("click", () => this.clearChat());
    this.$("chat2OpenTemplates")?.addEventListener("click", () => this.setTab("tools"));
    this.$("chat2OpenFiles")?.addEventListener("click", () => this.setTab("files"));
    this.$("chat2OpenEmoji")?.addEventListener("click", (event) => this.toggleEmoji(event.currentTarget));
    this.$("chat2Messages")?.addEventListener("click", (event) => this.handleMessageClick(event));

    this.$("chat2AddTag")?.addEventListener("click", () => this.createSystemTag(this.$("chat2NewTag")?.value || ""));
    this.$("chat2NewTag")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.createSystemTag(event.target.value || "");
      }
    });
    this.$("chat2TagColorHex")?.addEventListener("input", (event) => this.syncTagColorFromHex(event.target.value));
    ["chat2TagColorR", "chat2TagColorG", "chat2TagColorB"].forEach((id) => {
      this.$(id)?.addEventListener("input", () => this.syncTagColorFromRgbInputs());
    });
    this.$("chat2SaveTagColor")?.addEventListener("click", () => this.savePendingSystemTag());
    this.$("chat2CurrentTags")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-tag]");
      if (!btn) return;
      this.removeTag(btn.dataset.removeTag);
    });
    this.$("chat2PopularTags")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-add-tag]");
      if (!btn) return;
      this.addTag(btn.dataset.addTag);
    });

    this.$("chat2FormSelect")?.addEventListener("change", (event) => {
      this.currentFormId = event.target.value;
      this.$("chat2SubmissionId").value = "";
      this.renderFormEditor();
    });
    this.$("chat2ResetForm")?.addEventListener("click", () => this.resetFormEditor());
    this.$("chat2SaveDraft")?.addEventListener("click", () => this.submitDataForm("draft"));
    this.$("chat2SubmitForm")?.addEventListener("click", () => this.submitDataForm("submitted"));
    this.$("chat2SubmissionList")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-edit-submission]");
      if (!btn) return;
      this.loadSubmissionIntoForm(btn.dataset.editSubmission);
    });

    this.$("chat2OrderList")?.addEventListener("click", (event) => {
      const editBtn = event.target.closest("[data-edit-order]");
      const deleteBtn = event.target.closest("[data-delete-order]");
      if (editBtn) this.openOrderEditor(editBtn.dataset.editOrder);
      if (deleteBtn) this.deleteOrder(deleteBtn.dataset.deleteOrder);
    });
    this.$("chat2AddOrderItem")?.addEventListener("click", () => this.addOrderItemRow());
    this.$("chat2EditOrderItems")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-order-item]");
      if (btn) btn.closest(".cc2-order-edit-row")?.remove();
    });
    this.$("chat2SaveOrder")?.addEventListener("click", () => this.saveOrder());

    this.$("chat2FileList")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-send-file]");
      if (!btn) return;
      this.sendLibraryFile(btn.dataset.sendFile);
    });
    this.$("chat2SendUpload")?.addEventListener("click", () => this.sendUploadedFile());
    this.$("chat2SaveNotes")?.addEventListener("click", () => this.saveNotes());

    this.$("chat2TemplateNew")?.addEventListener("click", () => this.openTemplateEditor());
    this.$("chat2TemplateCancel")?.addEventListener("click", () => this.closeTemplateEditor());
    this.$("chat2TemplateSave")?.addEventListener("click", () => this.saveTemplate());
    this.$("chat2TemplateList")?.addEventListener("click", (event) => {
      const useBtn = event.target.closest("[data-use-template]");
      const editBtn = event.target.closest("[data-edit-template]");
      const deleteBtn = event.target.closest("[data-delete-template]");
      if (useBtn) this.useTemplate(useBtn.dataset.useTemplate);
      if (editBtn) this.openTemplateEditor(editBtn.dataset.editTemplate);
      if (deleteBtn) this.deleteTemplate(deleteBtn.dataset.deleteTemplate);
    });
    this.$("chat2ForwardSend")?.addEventListener("click", () => this.forwardMessage());
    this.$("chat2Assign")?.addEventListener("click", () => this.assignChat());
    this.$("chat2ExportTxt")?.addEventListener("click", () => this.exportConversation("txt"));
    this.$("chat2ExportJson")?.addEventListener("click", () => this.exportConversation("json"));
    this.$("chat2ToggleSearch")?.addEventListener("click", () => this.toggleMessageSearch());
    this.$("chat2MessageSearch")?.addEventListener("input", () => this.renderMessages());
  }

  toggleFiltersCollapsed(force = null) {
    this.filtersCollapsed = typeof force === "boolean" ? force : !this.filtersCollapsed;
    this.updateFilterPanel();
  }

  updateFilterPanel() {
    const panel = this.$("chat2FilterPanel");
    const toggle = this.$("chat2FilterToggle");
    const body = this.$("chat2FilterBody");
    const panelIsDetails = panel?.tagName === "DETAILS";
    if (panelIsDetails && panel.open === this.filtersCollapsed) {
      panel.open = !this.filtersCollapsed;
    }
    if (panel) panel.classList.toggle("is-collapsed", this.filtersCollapsed);
    if (toggle) toggle.setAttribute("aria-expanded", this.filtersCollapsed ? "false" : "true");
    if (body) body.hidden = panelIsDetails ? false : this.filtersCollapsed;
  }

  toggleTagFiltersExpanded(force = null) {
    this.tagFiltersExpanded = typeof force === "boolean" ? force : !this.tagFiltersExpanded;
    this.updateTagFilterState();
  }

  updateTagFilterState() {
    const wrap = this.$("chat2TagFilterWrap");
    const toggle = this.$("chat2ToggleTagFilters");
    const hasTags = this.availableTags.length > 0;
    if (wrap) {
      wrap.classList.toggle("is-expanded", this.tagFiltersExpanded);
      wrap.classList.toggle("has-toggle", hasTags);
    }
    if (toggle) {
      toggle.hidden = !hasTags;
      toggle.setAttribute("aria-expanded", this.tagFiltersExpanded ? "true" : "false");
      toggle.title = this.tagFiltersExpanded ? "แสดงแท็กแถวเดียว" : "แสดงแท็กทั้งหมด";
      toggle.innerHTML = `<i class="fas fa-chevron-down"></i>`;
    }
  }

  statusFilterLabel(status = this.filters.status) {
    return {
      all: "ทั้งหมด",
      mine: "ของฉัน",
      unassigned: "ยังไม่รับ",
      overdue: "เกิน SLA",
      open: "Open",
      pending: "Pending",
      resolved: "Resolved",
      unread: "ไม่อ่าน",
      followup: "ติดตาม",
      purchased: "ซื้อแล้ว",
    }[status] || "ทั้งหมด";
  }

  inboxFilterLabel(inboxKey) {
    if (!inboxKey || inboxKey === "all") return "ทุก Inbox";
    const inbox = this.inboxes.find((entry) => entry.inboxKey === inboxKey);
    if (inbox?.channelLabel) return inbox.channelLabel;
    const parsed = this.parseInboxKey(inboxKey);
    return parsed ? `${parsed.platform.toUpperCase()} · ${parsed.botId || "Default"}` : inboxKey;
  }

  renderFilterSummary() {
    const summary = this.$("chat2FilterSummary");
    if (!summary) return;
    const inboxKeys = this.selectedInboxKeys();
    const inboxText = inboxKeys.includes("all")
      ? "ทุก Inbox"
      : inboxKeys.length === 1
        ? this.inboxFilterLabel(inboxKeys[0])
        : `${inboxKeys.length} Inbox`;
    const parts = [inboxText, this.statusFilterLabel()];
    if (this.filters.tags.length) parts.push(`${this.filters.tags.length} แท็ก`);
    if (this.filters.search) parts.push("มีคำค้น");
    summary.textContent = parts.join(" · ");
  }

  handleInboxFilterChange(event) {
    const input = event.target.closest("input[data-inbox-key]");
    if (!input) return;
    const inboxKey = input.dataset.inboxKey || "all";
    if (inboxKey === "all") {
      this.setInboxKeys(["all"]);
    } else {
      const selected = new Set(this.selectedInboxKeys().filter((key) => key !== "all"));
      if (input.checked) selected.add(inboxKey);
      else selected.delete(inboxKey);
      this.setInboxKeys([...selected]);
    }
    this.pendingFocusPlatform = "";
    this.pendingFocusBotId = "";
    this.renderInboxFilter();
    this.loadUsers();
  }

  initSocket() {
    this.socket = io();
    this.socket.on("connect", () => {
      this.updateSocketState(true);
      this.toast("เชื่อมต่อ realtime แล้ว", "success");
    });
    this.socket.on("disconnect", () => {
      this.updateSocketState(false);
      this.toast("realtime disconnected", "warning");
    });
    this.socket.on("newMessage", (data) => this.handleNewMessage(data));
    this.socket.on("chatCleared", (data) => {
      if (data?.userId === this.currentUserId) {
        this.history[this.currentUserId] = [];
        this.renderMessages();
      }
      this.scheduleUsersReload();
    });
    this.socket.on("userTagsUpdated", (data) => {
      this.patchUser(data?.userId, { tags: data?.tags || [] });
      if (data?.userId === this.currentUserId) {
        const current = this.currentUser();
        if (current) this.context.user = current;
        this.renderTags();
        this.renderOverview();
      }
    });
    this.socket.on("chatTagsUpdated", () => {
      this.loadAvailableTags();
      this.loadUsers();
    });
    this.socket.on("userPurchaseStatusUpdated", (data) => {
      this.patchUser(data?.userId, { hasPurchased: !!data?.hasPurchased });
      this.renderHeader();
    });
    this.socket.on("followUpTagged", () => this.scheduleUsersReload());
    this.socket.on("orderExtracted", (data) => this.refreshContextIfCurrent(data?.userId));
    this.socket.on("orderUpdated", (data) => this.refreshContextIfCurrent(data?.userId));
    this.socket.on("orderDeleted", (data) => this.refreshContextIfCurrent(data?.userId));
    this.socket.on("dataFormSubmissionUpdated", (submission) => this.refreshContextIfCurrent(submission?.userId));
    this.socket.on("chatAssigned", (assignment) => {
      if (assignment?.userId) {
        this.patchUser(assignment.userId, { assignment });
      }
      if (assignment?.userId === this.currentUserId) {
        this.context.assignment = assignment;
        this.renderOverview();
        this.renderAssignees();
        this.renderDebug();
      }
    });
    this.socket.on("voxtronWorkflowEvent", (event) => {
      if (!event) return;
      const text = event.eventType === "form_submitted"
        ? "มี Data Form ใหม่"
        : event.eventType === "ai_stuck"
          ? "AI ต้องการให้เจ้าหน้าที่รับต่อ"
          : "มีเหตุการณ์ workflow ใหม่";
      this.toast(text, "info");
    });
  }

  updateSocketState(isOnline) {
    const state = this.$("chat2SocketState");
    if (!state) return;
    state.textContent = isOnline ? "online" : "offline";
    state.classList.toggle("is-online", isOnline);
  }

  scheduleUsersReload() {
    clearTimeout(this.usersReloadTimer);
    this.usersReloadTimer = setTimeout(() => {
      this.loadInboxes();
      this.loadUsers();
    }, 350);
  }

  async fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
  }

  async loadInboxes() {
    try {
      const data = await this.fetchJson("/admin/chat/inboxes");
      this.inboxes = Array.isArray(data.inboxes) ? data.inboxes : [];
    } catch (error) {
      console.warn("loadInboxes failed", error);
      this.inboxes = [];
    }
    this.renderInboxFilter();
  }

  renderInboxFilter() {
    const wrap = this.$("chat2InboxFilter");
    if (!wrap) return;
    const selectedKeys = this.selectedInboxKeys();
    const selected = new Set(selectedKeys);
    const totalCount = this.inboxes.reduce((sum, entry) => sum + Number(entry.conversationCount || 0), 0);
    const options = [
      { inboxKey: "all", channelLabel: "ทุก Inbox", conversationCount: totalCount },
      ...this.inboxes,
    ];
    selectedKeys.filter((key) => key !== "all").forEach((key) => {
      if (options.some((entry) => entry.inboxKey === key)) return;
      const parsed = this.parseInboxKey(key);
      if (parsed) {
        options.push({
          inboxKey: key,
          channelLabel: `${parsed.platform.toUpperCase()} · ${parsed.botId || "Default"}`,
          conversationCount: 0,
        });
      }
    });
    wrap.innerHTML = options.map((entry) => {
      const inboxKey = entry.inboxKey || "all";
      const count = Number(entry.conversationCount || 0);
      const checked = selected.has(inboxKey);
      return `
        <label class="cc2-inbox-option ${checked ? "is-active" : ""}">
          <input type="checkbox" data-inbox-key="${this.escapeAttr(inboxKey)}" ${checked ? "checked" : ""}>
          <span class="cc2-inbox-option-main">${this.escapeHtml(entry.channelLabel || inboxKey)}</span>
          ${count ? `<span class="cc2-inbox-count">${count}</span>` : ""}
        </label>
      `;
    }).join("");
    this.renderFilterSummary();
  }

  async loadUsers() {
    const requestSeq = ++this.usersRequestSeq;
    try {
      const params = new URLSearchParams();
      if (this.pendingFocusUserId) params.set("focus", this.pendingFocusUserId);
      if (this.pendingFocusPlatform) params.set("platform", this.pendingFocusPlatform);
      if (this.pendingFocusBotId) params.set("botId", this.pendingFocusBotId);
      const inboxKeys = this.selectedInboxKeys();
      const inboxFilter = inboxKeys.length === 1 ? this.parseInboxKey(inboxKeys[0]) : null;
      if (inboxFilter) {
        params.set("platform", inboxFilter.platform);
        params.set("botId", inboxFilter.botId || "default");
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await this.fetchJson(`/admin/chat/users${query}`);
      if (requestSeq !== this.usersRequestSeq) return;
      this.allUsers = (data.users || []).map((user) => ({
        ...user,
        lastMessage: this.extractDisplayText({ content: user.lastMessage, displayContent: user.lastMessage }) || user.lastMessage || "",
      }));
      if (this.currentUserId && !this.allUsers.some((user) => user.userId === this.currentUserId)) {
        this.currentUserId = "";
        this.context = this.emptyContext();
        this.history = {};
        this.showComposer(false);
        this.renderMessages();
        this.renderHeader();
        this.renderContext();
        if (this.isMobile()) this.setMobilePanel("inbox");
      }
      this.renderInboxFilter();
      this.applyFilters();
      if (!this.focusHandled && this.pendingFocusUserId) {
        const target = this.allUsers.find((user) => {
          if (user.userId !== this.pendingFocusUserId) return false;
          if (this.pendingFocusPlatform && user.platform !== this.pendingFocusPlatform) return false;
          if (this.pendingFocusBotId && String(user.botId || "") !== this.pendingFocusBotId) return false;
          return true;
        }) || this.allUsers.find((user) => user.userId === this.pendingFocusUserId);
        if (target) {
          this.focusHandled = true;
          this.pendingFocusUserId = "";
          this.pendingFocusPlatform = "";
          this.pendingFocusBotId = "";
          await this.selectUser(target.userId);
        }
      }
    } catch (error) {
      if (requestSeq !== this.usersRequestSeq) return;
      console.error("loadUsers failed", error);
      this.toast(error.message || "โหลดรายชื่อแชทไม่สำเร็จ", "error");
    }
  }

  async loadAvailableTags() {
    try {
      const data = await this.fetchJson("/admin/chat/available-tags");
      this.availableTags = (data.tags || []).map((entry) => ({
        tag: entry.tag || entry,
        count: entry.count || 0,
        color: this.normalizeTagColor(entry.color || ""),
        rgb: entry.rgb || null,
      })).filter((entry) => entry.tag);
      this.renderTagFilters();
      this.renderTags();
      this.renderUserList();
    } catch (error) {
      console.warn("loadAvailableTags failed", error);
    }
  }

  async loadTemplates() {
    const defaults = [
      { id: "default_welcome", title: "ทักทาย", shortcut: "/hi", message: "สวัสดีครับ ยินดีให้บริการครับ" },
      { id: "default_wait", title: "รอตรวจสอบ", shortcut: "/wait", message: "ขอตรวจสอบข้อมูลให้สักครู่นะครับ" },
      { id: "default_thanks", title: "ขอบคุณ", shortcut: "/thanks", message: "ขอบคุณมากครับ หากต้องการข้อมูลเพิ่มเติมแจ้งได้เลยครับ" },
    ];
    try {
      const data = await this.fetchJson("/admin/chat/templates");
      this.templates = data.templates?.length ? data.templates : defaults;
    } catch (error) {
      this.templates = defaults;
    }
    this.renderTemplates();
  }

  async loadAdminUsers() {
    try {
      const data = await this.fetchJson("/admin/users");
      this.adminUsers = data.users || [];
    } catch (error) {
      this.adminUsers = [];
    }
    this.renderAssignees();
  }

  applyFilters() {
    const search = this.filters.search.toLowerCase();
    const inboxKeys = this.selectedInboxKeys();
    const inboxSet = new Set(inboxKeys);
    const filterByInbox = !inboxSet.has("all");
    this.users = this.allUsers.filter((user) => {
      if (filterByInbox && !inboxSet.has(this.userInboxKey(user))) return false;
      const assignment = this.normalizeAssignment(user.assignment, user);
      if (this.filters.status === "mine" && !this.isMyAssignment(assignment)) return false;
      if (this.filters.status === "unassigned" && !this.isUnassigned(assignment)) return false;
      if (this.filters.status === "overdue" && !this.isAssignmentOverdue(assignment)) return false;
      if (this.filters.status === "open" && assignment.queueStatus !== "open") return false;
      if (this.filters.status === "pending" && assignment.queueStatus !== "pending") return false;
      if (this.filters.status === "resolved" && assignment.queueStatus !== "resolved") return false;
      if (this.filters.status === "unread" && Number(user.unreadCount || 0) <= 0) return false;
      if (this.filters.status === "followup" && !user.followUp?.isFollowUp && !user.hasFollowUp) return false;
      if (this.filters.status === "purchased" && !user.hasPurchased) return false;
      if (this.filters.tags.length && !(user.tags || []).some((tag) => this.filters.tags.includes(tag))) return false;
      if (search) {
        const haystack = [
          user.displayName,
          user.userId,
          user.channelLabel,
          user.platformLabel,
          user.botName,
          assignment.ownerLabel,
          assignment.queueStatus,
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(search);
      }
      return true;
    });
    this.renderUserList();
    this.renderForwardTargets();
  }

  clearFilters() {
    this.filters = { inboxKey: "all", inboxKeys: ["all"], status: "all", search: "", tags: [] };
    this.pendingFocusPlatform = "";
    this.pendingFocusBotId = "";
    const search = this.$("chat2Search");
    if (search) search.value = "";
    this.$("chat2StatusFilters")?.querySelectorAll("[data-status]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.status === "all");
    });
    this.renderInboxFilter();
    this.renderTagFilters();
    this.loadUsers();
  }

  toggleFilterTag(tag) {
    if (!tag) return;
    const index = this.filters.tags.indexOf(tag);
    if (index >= 0) this.filters.tags.splice(index, 1);
    else this.filters.tags.push(tag);
    this.renderTagFilters();
    this.renderFilterSummary();
    this.applyFilters();
  }

  renderUserList() {
    const list = this.$("chat2UserList");
    const count = this.$("chat2UserCount");
    if (count) count.textContent = `${this.users.length} แชท`;
    const mobileCount = this.$("chat2MobileUserCount");
    if (mobileCount) mobileCount.textContent = String(this.users.length);
    if (!list) return;
    if (!this.users.length) {
      list.innerHTML = `<div class="cc2-empty"><strong>ไม่พบแชท</strong><span>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</span></div>`;
      return;
    }
    list.innerHTML = this.users.map((user) => this.renderUserItem(user)).join("");
  }

  tagKey(tag) {
    return String(tag || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("th-TH");
  }

  normalizeTagColor(color, fallback = "#315f8f") {
    const value = String(color || "").trim();
    const match = value.match(/^#?([0-9a-fA-F]{6})$/);
    return match ? `#${match[1].toLowerCase()}` : fallback;
  }

  hexToRgb(color) {
    const normalized = this.normalizeTagColor(color);
    const numeric = Number.parseInt(normalized.slice(1), 16);
    return {
      r: (numeric >> 16) & 255,
      g: (numeric >> 8) & 255,
      b: numeric & 255,
    };
  }

  rgbToHex(r, g, b) {
    return [r, g, b]
      .map((value) => Math.max(0, Math.min(255, Number.parseInt(value, 10) || 0)).toString(16).padStart(2, "0"))
      .join("")
      .replace(/^/, "#");
  }

  defaultTagColor(tag) {
    const styles = window.getComputedStyle(document.documentElement);
    const colors = Array.from({ length: 8 }, (_, index) => styles.getPropertyValue(`--chat-tag-palette-${index + 1}`).trim())
      .filter(Boolean);
    const palette = colors.length ? colors : ["#315f8f", "#23775f", "#a76918", "#b83f45", "#6f4aa5", "#28708a", "#7a6a1d", "#8a4b2a"];
    const key = this.tagKey(tag);
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
    }
    return palette[Math.abs(hash) % palette.length] || palette[0];
  }

  tagMeta(tag) {
    const key = this.tagKey(tag);
    return this.availableTags.find((entry) => this.tagKey(entry.tag) === key) || {
      tag,
      color: this.defaultTagColor(tag),
    };
  }

  tagExists(tag) {
    const key = this.tagKey(tag);
    return !!key && this.availableTags.some((entry) => this.tagKey(entry.tag) === key);
  }

  tagStyleAttr(tagOrEntry) {
    const entry = typeof tagOrEntry === "object" && tagOrEntry ? tagOrEntry : this.tagMeta(tagOrEntry);
    const color = this.normalizeTagColor(entry.color || "", this.defaultTagColor(entry.tag || tagOrEntry));
    const rgb = entry.rgb && Number.isFinite(Number(entry.rgb.r))
      ? entry.rgb
      : this.hexToRgb(color);
    return `style="--tag-color:${this.escapeAttr(color)};--tag-rgb:${Number(rgb.r) || 0}, ${Number(rgb.g) || 0}, ${Number(rgb.b) || 0};"`;
  }

  tagPillHtml(tag, options = {}) {
    const active = options.active ? " is-active" : "";
    const attrs = options.attrs || "";
    const count = Number(options.count || 0);
    const closeButton = options.close
      ? `<button type="button" data-remove-tag="${this.escapeAttr(tag)}"><i class="fas fa-times"></i></button>`
      : "";
    return `<span class="cc2-pill cc2-tag-pill${active}" ${this.tagStyleAttr(tag)} ${attrs}>${this.escapeHtml(tag)}${count ? `<span>${count}</span>` : ""}${closeButton}</span>`;
  }

  renderUserItem(user) {
    const isActive = user.userId === this.currentUserId;
    const unread = Number(user.unreadCount || 0);
    const tags = (user.tags || []).slice(0, 2).map((tag) => this.tagPillHtml(tag)).join("");
    const preview = this.truncate(user.lastMessage || "ไม่มีข้อความ", 140);
    const assignment = this.normalizeAssignment(user.assignment, user);
    const unassigned = this.isUnassigned(assignment);
    const overdue = this.isAssignmentOverdue(assignment);
    const ownerLabel = unassigned ? "ยังไม่รับ" : assignment.ownerLabel || assignment.ownerId || "-";
    const queueBadges = `
      <span class="cc2-queue-badge is-${this.escapeAttr(assignment.queueStatus)}">${this.escapeHtml(this.queueStatusLabel(assignment.queueStatus))}</span>
      <span class="cc2-queue-badge ${unassigned ? "is-unassigned" : ""}">${this.escapeHtml(ownerLabel)}</span>
      <span class="cc2-queue-badge ${overdue ? "is-overdue" : ""}">${this.escapeHtml(overdue ? "เกิน SLA" : this.queueWaitingLabel(assignment))}</span>
    `;
    return `
      <button type="button" class="cc2-user-item ${isActive ? "is-active" : ""} ${unread ? "is-unread" : ""}" data-user-id="${this.escapeAttr(user.userId)}">
        <div class="cc2-user-avatar">${this.avatarHtml(user)}</div>
        <div>
          <div class="cc2-user-name">${this.escapeHtml(user.displayName || user.userId)}</div>
          <div class="cc2-user-meta">${this.escapeHtml(user.channelLabel || user.platformLabel || user.platform || "")}</div>
          <div class="cc2-user-preview" title="${this.escapeAttr(user.lastMessage || "")}">${this.escapeHtml(preview)}</div>
          <div class="cc2-user-badges">${queueBadges}</div>
          ${tags ? `<div class="cc2-user-tags">${tags}</div>` : ""}
        </div>
        <div>
          <div class="cc2-user-time">${this.escapeHtml(this.relativeTime(user.lastTimestamp))}</div>
          ${unread ? `<span class="cc2-unread">${unread}</span>` : ""}
        </div>
      </button>
    `;
  }

  renderTagFilters() {
    const wrap = this.$("chat2TagFilters");
    if (!wrap) return;
    if (!this.availableTags.length) {
      wrap.innerHTML = `<span class="cc2-muted">ไม่มีแท็ก</span>`;
      this.updateTagFilterState();
      this.renderFilterSummary();
      return;
    }
    const active = new Set(this.filters.tags);
    const entries = [...this.availableTags].sort((a, b) => {
      const aActive = active.has(a.tag);
      const bActive = active.has(b.tag);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return 0;
    });
    wrap.innerHTML = entries.map((entry) => `
      <button type="button" class="cc2-pill cc2-tag-pill ${this.filters.tags.includes(entry.tag) ? "is-active" : ""}" data-filter-tag="${this.escapeAttr(entry.tag)}" ${this.tagStyleAttr(entry)}>
        ${this.escapeHtml(entry.tag)}
        ${entry.count ? `<span>${entry.count}</span>` : ""}
      </button>
    `).join("");
    this.updateTagFilterState();
    this.renderFilterSummary();
  }

  async selectUser(userId) {
    if (!userId) return;
    this.currentUserId = userId;
    this.context = this.emptyContext();
    this.renderUserList();
    this.renderHeader();
    this.showComposer(true);
    if (this.isMobile()) this.closeMobilePanels();
    this.$("chat2Messages").innerHTML = `<div class="cc2-loading"><span class="spinner-border spinner-border-sm"></span>กำลังโหลดบทสนทนา...</div>`;
    try {
      await Promise.all([
        this.loadHistory(userId),
        this.loadContext(userId),
        this.markRead(userId),
      ]);
      this.patchUser(userId, { unreadCount: 0 });
      this.renderUserList();
    } catch (error) {
      console.error("selectUser failed", error);
      this.toast(error.message || "โหลดข้อมูลแชทไม่สำเร็จ", "error");
    }
  }

  async loadHistory(userId) {
    const context = this.currentConversationContext();
    const params = new URLSearchParams();
    if (context.platform) params.set("platform", context.platform);
    if (context.botId) params.set("botId", context.botId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await this.fetchJson(`/admin/chat/history/${encodeURIComponent(userId)}${query}`);
    this.history[userId] = (data.messages || []).map((msg) => this.prepareMessage(msg));
    this.renderMessages();
    this.renderHeader();
  }

  async loadContext(userId) {
    const user = this.currentUser();
    const params = new URLSearchParams();
    if (user?.platform) params.set("platform", user.platform);
    if (user?.botId) params.set("botId", String(user.botId));
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await this.fetchJson(`/admin/chat/context/${encodeURIComponent(userId)}${query}`);
    this.allowedTabs = this.resolveAllowedTabs(data.allowedTabs || null);
    this.context = {
      user: data.user || user || null,
      orders: data.orders || [],
      forms: data.forms || [],
      submissions: data.submissions || [],
      notes: data.notes || "",
      notesUpdatedAt: data.notesUpdatedAt || null,
      files: data.files || [],
      assignment: data.assignment || null,
    };
    this.currentFormId = this.context.forms[0]?.id || "";
    if (!this.allowedTabs.includes(this.activeTab)) {
      this.activeTab = this.allowedTabs[0] || "forms";
    }
    this.applyPermissionUi();
    this.renderContext();
  }

  async refreshContextIfCurrent(userId) {
    if (!userId || userId !== this.currentUserId) {
      this.scheduleUsersReload();
      return;
    }
    await this.loadContext(userId).catch((error) => console.warn(error));
    this.scheduleUsersReload();
  }

  currentUser() {
    if (!this.currentUserId) return null;
    return this.users.find((user) => user.userId === this.currentUserId)
      || this.allUsers.find((user) => user.userId === this.currentUserId)
      || this.context.user
      || null;
  }

  patchUser(userId, patch = {}) {
    if (!userId) return;
    [this.allUsers, this.users].forEach((list) => {
      const user = list.find((entry) => entry.userId === userId);
      if (user) Object.assign(user, patch);
    });
    if (this.context.user?.userId === userId) {
      Object.assign(this.context.user, patch);
    }
    this.renderUserList();
    this.renderHeader();
  }

  renderHeader() {
    const user = this.currentUser();
    const actions = this.$("chat2HeadActions");
    const composer = this.$("chat2Composer");
    if (!user) {
      this.$("chat2Avatar").innerHTML = `<i class="fas fa-user"></i>`;
      this.$("chat2CurrentName").textContent = "เลือกแชทเพื่อเริ่มงาน";
      this.$("chat2CurrentMeta").textContent = "รายชื่ออยู่ด้านซ้าย ข้อมูลลูกค้าอยู่ด้านขวา";
      if (actions) actions.hidden = true;
      if (composer) composer.hidden = true;
      return;
    }
    this.$("chat2Avatar").innerHTML = this.avatarHtml(user);
    this.$("chat2CurrentName").textContent = user.displayName || user.userId;
    const messageCount = (this.history[this.currentUserId] || []).length;
    const channel = user.channelLabel || user.platform || "";
    const compactId = this.compactId(user.userId);
    const meta = [channel, `${messageCount} ข้อความ`, compactId].filter(Boolean).join(" · ");
    this.$("chat2CurrentMeta").textContent = meta;
    this.$("chat2CurrentMeta").title = [channel, `${messageCount} ข้อความ`, user.userId].filter(Boolean).join(" · ");
    if (actions) actions.hidden = false;
    this.$("chat2ToggleAi")?.classList.toggle("is-on", user.aiEnabled !== false);
    this.$("chat2TogglePurchase")?.classList.toggle("is-on", !!user.hasPurchased);
    const refreshBtn = this.$("chat2RefreshProfile");
    if (refreshBtn) refreshBtn.disabled = user.platform !== "facebook";
  }

  showComposer(show) {
    const composer = this.$("chat2Composer");
    if (composer) composer.hidden = !show;
  }

  renderContext() {
    this.renderOverview();
    this.renderTags();
    this.renderForms();
    this.renderOrders();
    this.renderFiles();
    this.renderNotes();
    this.renderTemplates();
    this.renderForwardTargets();
    this.renderAssignees();
    this.renderDebug();
  }

  setTab(tab) {
    if (!this.allowedTabs.includes(tab)) {
      tab = this.allowedTabs[0] || "forms";
    }
    this.activeTab = tab;
    this.$("chat2Tabs")?.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.hidden = !this.allowedTabs.includes(btn.dataset.tab);
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".cc2-tab-panel[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === tab;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  }

  renderOverview() {
    const el = this.$("chat2Overview");
    if (!el) return;
    const user = this.currentUser();
    if (!user) {
      el.innerHTML = `<div class="cc2-empty"><strong>เลือกแชทก่อน</strong><span>ข้อมูลภาพรวมจะแสดงที่นี่</span></div>`;
      return;
    }
    const messages = this.history[this.currentUserId] || [];
    const assignment = this.normalizeAssignment(this.context.assignment || user.assignment || {}, user);
    const assignmentOwner = this.isUnassigned(assignment)
      ? "ยังไม่มอบหมาย"
      : assignment.ownerLabel || assignment.ownerId || "-";
    el.innerHTML = `
      <div class="cc2-metric-grid">
        <div class="cc2-metric"><span>ข้อความ</span><strong>${messages.length}</strong></div>
        <div class="cc2-metric"><span>ออเดอร์</span><strong>${this.context.orders.length}</strong></div>
        <div class="cc2-metric"><span>ฟอร์ม</span><strong>${this.context.submissions.length}</strong></div>
      </div>
      <div class="cc2-info-list">
        <div class="cc2-info-row"><span>User ID</span><strong title="${this.escapeAttr(user.userId)}">${this.escapeHtml(this.compactId(user.userId, 12, 8))}</strong></div>
        <div class="cc2-info-row"><span>ช่องทาง</span><strong>${this.escapeHtml(user.channelLabel || user.platform || "-")}</strong></div>
        <div class="cc2-info-row"><span>AI</span><strong>${user.aiEnabled !== false ? "เปิด" : "ปิด"}</strong></div>
        <div class="cc2-info-row"><span>สถานะซื้อ</span><strong>${user.hasPurchased ? "ซื้อแล้ว" : "ยังไม่ซื้อ"}</strong></div>
        <div class="cc2-info-row"><span>Follow-up</span><strong>${user.followUp?.isFollowUp ? `รอติดตาม ${this.relativeTime(user.followUp.nextScheduledAt)}` : "ไม่มีงานติดตาม"}</strong></div>
        <div class="cc2-info-row"><span>Owner</span><strong>${this.escapeHtml(assignmentOwner)}</strong></div>
        <div class="cc2-info-row"><span>คิว</span><strong>${this.escapeHtml(this.queueStatusLabel(assignment.queueStatus))}</strong></div>
        <div class="cc2-info-row"><span>เวลารอ</span><strong class="${this.isAssignmentOverdue(assignment) ? "is-overdue" : ""}">${this.escapeHtml(this.queueWaitingLabel(assignment))}</strong></div>
        <div class="cc2-info-row"><span>SLA</span><strong class="${this.isAssignmentOverdue(assignment) ? "is-overdue" : ""}">${this.escapeHtml(this.queueDueLabel(assignment))}</strong></div>
      </div>
      ${this.context.orders[0] ? this.renderCompactOrder(this.context.orders[0], "ออเดอร์ล่าสุด") : ""}
      ${this.context.submissions[0] ? this.renderSubmissionCard(this.context.submissions[0], true) : ""}
    `;
  }

  renderTags() {
    const user = this.currentUser();
    const tags = user?.tags || [];
    const count = this.$("chat2TagCount");
    if (count) count.textContent = tags.length;
    const current = this.$("chat2CurrentTags");
    if (current) {
      current.innerHTML = tags.length
        ? tags.map((tag) => this.tagPillHtml(tag, { active: true, close: true })).join("")
        : `<span class="cc2-muted">ยังไม่มีแท็ก</span>`;
    }
    const popular = this.$("chat2PopularTags");
    if (popular) {
      popular.innerHTML = this.availableTags.length
        ? this.availableTags.slice(0, 30).map((entry) => `
          <button type="button" class="cc2-pill cc2-tag-pill ${tags.includes(entry.tag) ? "is-active" : ""}" data-add-tag="${this.escapeAttr(entry.tag)}" ${this.tagStyleAttr(entry)}>
            ${this.escapeHtml(entry.tag)}
          </button>
        `).join("")
        : `<span class="cc2-muted">ไม่มีแท็กในระบบ</span>`;
    }
  }

  async createSystemTag(rawTag) {
    if (!this.can("chat:tags")) return;
    const tag = String(rawTag || "").replace(/\s+/g, " ").trim();
    if (!tag) return;
    if (this.tagExists(tag)) {
      this.toast("แท็กนี้มีอยู่แล้วในระบบ", "warning");
      return;
    }
    this.openTagColorModal(tag);
  }

  openTagColorModal(tag) {
    this.pendingSystemTag = tag;
    const color = this.defaultTagColor(tag);
    const name = this.$("chat2TagColorName");
    if (name) name.textContent = tag;
    this.syncTagColorFromHex(color);
    const modalEl = this.$("chat2TagColorModal");
    if (!modalEl || !window.bootstrap?.Modal) return;
    this.tagColorModal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    this.tagColorModal.show();
  }

  updateTagColorPreview(color) {
    const normalized = this.normalizeTagColor(color);
    const swatch = this.$("chat2TagColorPreview")?.querySelector(".cc2-color-preview-swatch");
    if (swatch) swatch.style.backgroundColor = normalized;
  }

  syncTagColorFromHex(color) {
    const normalized = this.normalizeTagColor(color);
    const rgb = this.hexToRgb(normalized);
    const hexInput = this.$("chat2TagColorHex");
    if (hexInput) hexInput.value = normalized;
    const r = this.$("chat2TagColorR");
    const g = this.$("chat2TagColorG");
    const b = this.$("chat2TagColorB");
    if (r) r.value = String(rgb.r);
    if (g) g.value = String(rgb.g);
    if (b) b.value = String(rgb.b);
    this.updateTagColorPreview(normalized);
  }

  syncTagColorFromRgbInputs() {
    const color = this.rgbToHex(
      this.$("chat2TagColorR")?.value,
      this.$("chat2TagColorG")?.value,
      this.$("chat2TagColorB")?.value,
    );
    const hexInput = this.$("chat2TagColorHex");
    if (hexInput) hexInput.value = color;
    this.updateTagColorPreview(color);
  }

  async savePendingSystemTag() {
    const tag = this.pendingSystemTag;
    if (!tag) return;
    const color = this.normalizeTagColor(this.$("chat2TagColorHex")?.value || this.defaultTagColor(tag));
    try {
      await this.fetchJson("/admin/chat/system-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, color, source: "chat" }),
      });
      const input = this.$("chat2NewTag");
      if (input) input.value = "";
      this.pendingSystemTag = "";
      this.tagColorModal?.hide();
      await this.loadAvailableTags();
      this.toast("เพิ่มแท็กเข้าระบบแล้ว", "success");
    } catch (error) {
      this.toast(error.message || "เพิ่มแท็กเข้าระบบไม่สำเร็จ", "error");
    }
  }

  async addTag(rawTag) {
    if (!this.can("chat:tags")) return;
    const tag = String(rawTag || "").trim();
    if (!tag || !this.currentUserId) return;
    const user = this.currentUser();
    const tags = Array.from(new Set([...(user?.tags || []), tag]));
    const context = this.currentConversationPayload();
    try {
      const data = await this.fetchJson(`/admin/chat/tags/${encodeURIComponent(this.currentUserId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, ...context }),
      });
      this.patchUser(this.currentUserId, { tags: data.tags || tags });
      this.renderTags();
      this.renderOverview();
      const input = this.$("chat2NewTag");
      if (input) input.value = "";
      await this.loadAvailableTags();
      this.toast("เพิ่มแท็กแล้ว", "success");
    } catch (error) {
      this.toast(error.message || "เพิ่มแท็กไม่สำเร็จ", "error");
    }
  }

  async removeTag(tag) {
    if (!this.can("chat:tags")) return;
    if (!tag || !this.currentUserId) return;
    const user = this.currentUser();
    const tags = (user?.tags || []).filter((entry) => entry !== tag);
    const context = this.currentConversationPayload();
    try {
      const data = await this.fetchJson(`/admin/chat/tags/${encodeURIComponent(this.currentUserId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, ...context }),
      });
      this.patchUser(this.currentUserId, { tags: data.tags || tags });
      this.renderTags();
      this.renderOverview();
      await this.loadAvailableTags();
      this.toast("ลบแท็กแล้ว", "success");
    } catch (error) {
      this.toast(error.message || "ลบแท็กไม่สำเร็จ", "error");
    }
  }

  renderForms() {
    const select = this.$("chat2FormSelect");
    const count = this.$("chat2SubmissionCount");
    if (count) count.textContent = this.context.submissions.length;
    if (select) {
      const previous = this.currentFormId || select.value;
      select.innerHTML = this.context.forms.length
        ? this.context.forms.map((form) => `<option value="${this.escapeAttr(form.id)}">${this.escapeHtml(form.name)}</option>`).join("")
        : `<option value="">ไม่มีฟอร์มที่เปิดใช้กับเพจนี้</option>`;
      this.currentFormId = this.context.forms.some((form) => form.id === previous)
        ? previous
        : this.context.forms[0]?.id || "";
      select.value = this.currentFormId;
    }
    this.renderFormEditor();
    const list = this.$("chat2SubmissionList");
    if (list) {
      list.innerHTML = this.context.submissions.length
        ? this.context.submissions.map((submission) => this.renderSubmissionCard(submission)).join("")
        : `<div class="cc2-empty"><strong>ยังไม่มีฟอร์ม</strong><span>ส่ง Data Form จากแชทนี้ได้ทันที</span></div>`;
    }
  }

  renderFormEditor() {
    const form = this.context.forms.find((entry) => entry.id === this.currentFormId);
    const status = this.$("chat2FormStatus");
    const fields = this.$("chat2FormFields");
    if (!form) {
      if (status) status.innerHTML = `<option value="submitted">submitted</option>`;
      if (fields) fields.innerHTML = "";
      return;
    }
    const statuses = form.statuses?.length ? form.statuses : [
      { key: "draft", label: "Draft" },
      { key: "submitted", label: "Submitted" },
    ];
    if (status) {
      const previous = status.value || "submitted";
      status.innerHTML = statuses.map((entry) => `<option value="${this.escapeAttr(entry.key)}">${this.escapeHtml(entry.label || entry.key)}</option>`).join("");
      status.value = statuses.some((entry) => entry.key === previous) ? previous : (statuses.find((entry) => entry.key === "submitted")?.key || statuses[0].key);
    }
    if (!fields) return;
    fields.innerHTML = (form.fields || []).map((field) => this.renderDataFormField(field)).join("");
  }

  renderDataFormField(field) {
    const key = field.key || field.label || "";
    const label = `${field.label || key}${field.required ? " *" : ""}`;
    const base = `data-form-field="${this.escapeAttr(key)}" data-field-type="${this.escapeAttr(field.type || "text")}"`;
    if (field.type === "textarea") {
      return `<div class="cc2-field-row"><label>${this.escapeHtml(label)}</label><textarea rows="3" ${base}></textarea></div>`;
    }
    if (field.type === "select") {
      const options = (field.options || []).map((option) => {
        const value = typeof option === "string" ? option : option.value || option.label || "";
        const text = typeof option === "string" ? option : option.label || option.value || "";
        return `<option value="${this.escapeAttr(value)}">${this.escapeHtml(text)}</option>`;
      }).join("");
      return `<div class="cc2-field-row"><label>${this.escapeHtml(label)}</label><select ${base}><option value="">เลือก...</option>${options}</select></div>`;
    }
    if (field.type === "checkbox") {
      return `<label class="cc2-checkbox-row"><input type="checkbox" ${base}>${this.escapeHtml(label)}</label>`;
    }
    const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
    return `<div class="cc2-field-row"><label>${this.escapeHtml(label)}</label><input type="${inputType}" ${base}></div>`;
  }

  collectFormValues() {
    const values = {};
    document.querySelectorAll("[data-form-field]").forEach((field) => {
      const key = field.dataset.formField;
      if (!key) return;
      if (field.dataset.fieldType === "checkbox") {
        values[key] = field.checked;
      } else {
        values[key] = field.value;
      }
    });
    return values;
  }

  async submitDataForm(statusOverride) {
    if (!this.can("chat:forms")) return;
    if (!this.currentUserId || !this.currentFormId) return;
    const user = this.currentUser();
    const status = statusOverride === "draft" ? "draft" : (this.$("chat2FormStatus")?.value || "submitted");
    try {
      const data = await this.fetchJson("/admin/chat/data-form-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: this.currentUserId,
          platform: user?.platform || null,
          botId: user?.botId || null,
          formId: this.currentFormId,
          submissionId: this.$("chat2SubmissionId")?.value || "",
          status,
          values: this.collectFormValues(),
          summary: this.$("chat2FormSummary")?.value || "",
        }),
      });
      this.toast(status === "draft" ? "บันทึก Draft แล้ว" : "Submit ฟอร์มแล้ว", "success");
      this.resetFormEditor();
      await this.loadContext(this.currentUserId);
      if (data.submission) this.setTab("forms");
    } catch (error) {
      this.toast(error.message || "บันทึกฟอร์มไม่สำเร็จ", "error");
    }
  }

  resetFormEditor() {
    const id = this.$("chat2SubmissionId");
    const summary = this.$("chat2FormSummary");
    if (id) id.value = "";
    if (summary) summary.value = "";
    document.querySelectorAll("[data-form-field]").forEach((field) => {
      if (field.type === "checkbox") field.checked = false;
      else field.value = "";
    });
  }

  loadSubmissionIntoForm(submissionId) {
    const submission = this.context.submissions.find((entry) => entry.id === submissionId);
    if (!submission) return;
    this.currentFormId = submission.formId;
    this.renderForms();
    this.$("chat2SubmissionId").value = submission.id;
    this.$("chat2FormStatus").value = submission.status || "submitted";
    this.$("chat2FormSummary").value = submission.summary || "";
    Object.entries(submission.values || {}).forEach(([key, value]) => {
      const field = Array.from(document.querySelectorAll("[data-form-field]"))
        .find((entry) => entry.dataset.formField === key);
      if (!field) return;
      if (field.type === "checkbox") field.checked = value === true;
      else field.value = value ?? "";
    });
    this.toast("โหลดข้อมูลฟอร์มมาแก้ไขแล้ว", "info");
  }

  renderSubmissionCard(submission, compact = false) {
    const rows = Object.entries(submission.values || {}).slice(0, compact ? 3 : 8).map(([key, value]) => `
      <span>${this.escapeHtml(key)}</span><strong>${this.escapeHtml(this.formatValue(value))}</strong>
    `).join("");
    return `
      <div class="cc2-card">
        <div class="cc2-card-title">
          <span>${this.escapeHtml(compact ? "ฟอร์มล่าสุด" : (submission.formName || "Data Form"))}</span>
          <span class="cc2-status ${this.escapeAttr(submission.status || "submitted")}">${this.escapeHtml(submission.status || "submitted")}</span>
        </div>
        <div class="cc2-card-meta">${this.escapeHtml(submission.formName || "Data Form")} · ${this.dateTime(submission.createdAt)}</div>
        ${submission.summary ? `<div class="cc2-card-body">${this.escapeHtml(submission.summary)}</div>` : ""}
        ${rows ? `<div class="cc2-kv">${rows}</div>` : ""}
        ${compact ? "" : `<div class="cc2-card-actions"><button type="button" data-edit-submission="${this.escapeAttr(submission.id)}">แก้ไข</button></div>`}
      </div>
    `;
  }

  renderOrders() {
    const list = this.$("chat2OrderList");
    const count = this.$("chat2OrderCount");
    if (count) count.textContent = this.context.orders.length;
    if (!list) return;
    list.innerHTML = this.context.orders.length
      ? this.context.orders.map((order) => this.renderOrderCard(order)).join("")
      : `<div class="cc2-empty"><strong>ยังไม่มีออเดอร์</strong><span>ระบบจะแสดงออเดอร์ที่ AI หรือทีมบันทึกไว้</span></div>`;
  }

  renderCompactOrder(order, label = "ออเดอร์") {
    return this.renderOrderCard(order, label, true);
  }

  renderOrderCard(order, titleOverride = "", compact = false) {
    const data = order.orderData || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const id = this.resolveId(order);
    const itemRows = items.slice(0, compact ? 3 : 8).map((item) => `
      <span>${this.escapeHtml(item.product || "-")} x${Number(item.quantity || 0)}</span>
      <strong>฿${this.formatNumber(Number(item.price || 0))}</strong>
    `).join("");
    const address = [data.shippingAddress, data.addressSubDistrict, data.addressDistrict, data.addressProvince, data.addressPostalCode].filter(Boolean).join(" ");
    return `
      <div class="cc2-card">
        <div class="cc2-card-title">
          <span>${this.escapeHtml(titleOverride || `Order ${id.slice(-6)}`)}</span>
          <span class="cc2-status ${this.escapeAttr(order.status || "pending")}">${this.orderStatusLabel(order.status)}</span>
        </div>
        <div class="cc2-card-meta">${this.dateTime(order.extractedAt || order.createdAt)} · ${this.escapeHtml(data.customerName || this.currentUser()?.displayName || "")}</div>
        ${itemRows ? `<div class="cc2-kv">${itemRows}</div>` : ""}
        <div class="cc2-kv">
          <span>ยอดรวม</span><strong>฿${this.formatNumber(Number(data.totalAmount || 0))}</strong>
          ${data.phone ? `<span>โทร</span><strong>${this.escapeHtml(data.phone)}</strong>` : ""}
          ${address ? `<span>ที่อยู่</span><strong>${this.escapeHtml(address)}</strong>` : ""}
        </div>
        ${compact ? "" : `
          <div class="cc2-card-actions">
            <button type="button" data-edit-order="${this.escapeAttr(id)}">แก้ไข</button>
            <button type="button" class="cc2-danger" data-delete-order="${this.escapeAttr(id)}">ลบ</button>
          </div>
        `}
      </div>
    `;
  }

  openOrderEditor(orderId) {
    const order = this.context.orders.find((entry) => this.resolveId(entry) === orderId);
    if (!order) return;
    const data = order.orderData || {};
    this.$("chat2EditOrderId").value = orderId;
    this.$("chat2EditOrderStatus").value = order.status || "pending";
    this.$("chat2EditCustomerName").value = data.customerName || "";
    this.$("chat2EditShippingAddress").value = data.shippingAddress || "";
    this.$("chat2EditAddressSubDistrict").value = data.addressSubDistrict || "";
    this.$("chat2EditAddressDistrict").value = data.addressDistrict || "";
    this.$("chat2EditAddressProvince").value = data.addressProvince || "";
    this.$("chat2EditAddressPostalCode").value = data.addressPostalCode || "";
    this.$("chat2EditPhone").value = data.phone || "";
    this.$("chat2EditPaymentMethod").value = data.paymentMethod || "เก็บเงินปลายทาง";
    this.$("chat2EditShippingCost").value = Number(data.shippingCost || 0);
    this.$("chat2EditOrderNotes").value = order.notes || "";
    this.renderOrderItemRows(Array.isArray(data.items) ? data.items : []);
    bootstrap.Modal.getOrCreateInstance(this.$("chat2OrderModal")).show();
  }

  renderOrderItemRows(items) {
    const wrap = this.$("chat2EditOrderItems");
    if (!wrap) return;
    wrap.innerHTML = items.length ? items.map((item) => this.orderItemRow(item)).join("") : this.orderItemRow({});
  }

  orderItemRow(item = {}) {
    return `
      <div class="cc2-order-edit-row">
        <input type="text" class="form-control" data-order-field="product" placeholder="สินค้า" value="${this.escapeAttr(item.product || "")}">
        <input type="number" class="form-control" data-order-field="quantity" placeholder="จำนวน" value="${this.escapeAttr(item.quantity || 1)}">
        <input type="number" class="form-control" data-order-field="price" placeholder="ราคา" value="${this.escapeAttr(item.price || 0)}">
        <button type="button" data-remove-order-item aria-label="ลบรายการสินค้า"><i class="fas fa-times"></i></button>
      </div>
    `;
  }

  addOrderItemRow() {
    this.$("chat2EditOrderItems")?.insertAdjacentHTML("beforeend", this.orderItemRow({}));
  }

  async saveOrder() {
    const orderId = this.$("chat2EditOrderId")?.value;
    if (!orderId) return;
    const items = Array.from(this.$("chat2EditOrderItems")?.querySelectorAll(".cc2-order-edit-row") || []).map((row) => ({
      product: row.querySelector('[data-order-field="product"]')?.value.trim() || "",
      quantity: Number(row.querySelector('[data-order-field="quantity"]')?.value || 0),
      price: Number(row.querySelector('[data-order-field="price"]')?.value || 0),
    })).filter((item) => item.product && item.quantity > 0);
    if (!items.length) {
      this.toast("กรุณาใส่สินค้าอย่างน้อย 1 รายการ", "warning");
      return;
    }
    const shippingCost = Number(this.$("chat2EditShippingCost")?.value || 0);
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.price, 0) + Math.max(0, shippingCost);
    const orderData = {
      items,
      totalAmount,
      shippingCost,
      customerName: this.$("chat2EditCustomerName")?.value.trim() || null,
      shippingAddress: this.$("chat2EditShippingAddress")?.value.trim() || null,
      addressSubDistrict: this.$("chat2EditAddressSubDistrict")?.value.trim() || null,
      addressDistrict: this.$("chat2EditAddressDistrict")?.value.trim() || null,
      addressProvince: this.$("chat2EditAddressProvince")?.value.trim() || null,
      addressPostalCode: this.$("chat2EditAddressPostalCode")?.value.trim() || null,
      phone: this.$("chat2EditPhone")?.value.trim() || null,
      paymentMethod: this.$("chat2EditPaymentMethod")?.value || null,
    };
    try {
      await this.fetchJson(`/admin/chat/orders/${encodeURIComponent(orderId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderData,
          status: this.$("chat2EditOrderStatus")?.value || "pending",
          notes: this.$("chat2EditOrderNotes")?.value.trim() || "",
        }),
      });
      bootstrap.Modal.getInstance(this.$("chat2OrderModal"))?.hide();
      await this.loadContext(this.currentUserId);
      this.toast("บันทึกออเดอร์แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "บันทึกออเดอร์ไม่สำเร็จ", "error");
    }
  }

  async deleteOrder(orderId) {
    if (!orderId || !confirm("ต้องการลบออเดอร์นี้หรือไม่?")) return;
    try {
      await this.fetchJson(`/admin/chat/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
      await this.loadContext(this.currentUserId);
      this.toast("ลบออเดอร์แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "ลบออเดอร์ไม่สำเร็จ", "error");
    }
  }

  renderFiles() {
    const list = this.$("chat2FileList");
    const count = this.$("chat2FileCount");
    if (count) count.textContent = this.context.files.length;
    if (!list) return;
    list.innerHTML = this.context.files.length
      ? this.context.files.map((file) => `
        <div class="cc2-card">
          <div class="cc2-card-title"><span>${this.escapeHtml(file.label || file.originalName || "ไฟล์")}</span></div>
          <div class="cc2-card-meta">${this.escapeHtml(file.mimeType || "-")} · ${this.fileSize(file.sizeBytes)}</div>
          ${file.description ? `<div class="cc2-card-body">${this.escapeHtml(file.description)}</div>` : ""}
          <div class="cc2-card-actions">
            <a class="cc2-secondary-btn" href="${this.escapeAttr(file.downloadUrl || "#")}" target="_blank" rel="noopener">เปิด</a>
            <button type="button" data-send-file="${this.escapeAttr(file.id)}">ส่งไฟล์</button>
          </div>
        </div>
      `).join("")
      : `<div class="cc2-empty"><strong>ไม่มีไฟล์ที่ใช้ได้</strong><span>อัปโหลดสดจากแชทนี้ได้</span></div>`;
  }

  buildFileFormData(extra = {}) {
    const user = this.currentUser();
    const formData = new FormData();
    formData.append("userId", this.currentUserId);
    if (user?.platform) formData.append("platform", user.platform);
    if (user?.botId) formData.append("botId", String(user.botId));
    const caption = this.$("chat2FileCaption")?.value.trim() || "";
    if (caption) formData.append("caption", caption);
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") formData.append(key, value);
    });
    return formData;
  }

  async sendLibraryFile(fileId) {
    if (!this.can("chat:files")) return;
    if (!fileId || !this.currentUserId) return;
    try {
      await this.fetchJson("/admin/chat/files/send", {
        method: "POST",
        body: this.buildFileFormData({ fileAssetId: fileId }),
      });
      this.toast("ส่งไฟล์แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "ส่งไฟล์ไม่สำเร็จ", "error");
    }
  }

  async sendUploadedFile() {
    if (!this.can("chat:files")) return;
    const input = this.$("chat2UploadFile");
    if (!input?.files?.length) {
      this.toast("กรุณาเลือกไฟล์", "warning");
      return;
    }
    try {
      const label = this.$("chat2UploadLabel")?.value.trim() || "";
      const formData = this.buildFileFormData({ label });
      formData.append("file", input.files[0]);
      await this.fetchJson("/admin/chat/files/send", { method: "POST", body: formData });
      input.value = "";
      this.$("chat2UploadLabel").value = "";
      await this.loadContext(this.currentUserId);
      this.toast("อัปโหลดและส่งไฟล์แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "ส่งไฟล์ไม่สำเร็จ", "error");
    }
  }

  renderNotes() {
    const notes = this.$("chat2Notes");
    const updated = this.$("chat2NotesUpdated");
    if (notes && document.activeElement !== notes) notes.value = this.context.notes || "";
    if (updated) updated.textContent = this.context.notesUpdatedAt ? `อัปเดต ${this.relativeTime(this.context.notesUpdatedAt)}` : "ยังไม่มีโน้ต";
  }

  async saveNotes() {
    if (!this.can("chat:notes")) return;
    if (!this.currentUserId) return;
    const context = this.currentConversationPayload();
    try {
      const data = await this.fetchJson(`/api/users/${encodeURIComponent(this.currentUserId)}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: this.$("chat2Notes")?.value || "", ...context }),
      });
      this.context.notes = data.notes || "";
      this.context.notesUpdatedAt = new Date().toISOString();
      this.renderNotes();
      this.toast("บันทึกโน้ตแล้ว", "success");
    } catch (error) {
      this.toast(error.message || "บันทึกโน้ตไม่สำเร็จ", "error");
    }
  }

  renderTemplates() {
    const list = this.$("chat2TemplateList");
    if (!list) return;
    list.innerHTML = this.templates.length
      ? this.templates.map((template) => `
        <div class="cc2-card">
          <div class="cc2-card-title">
            <span>${this.escapeHtml(template.title)}</span>
            ${template.shortcut ? `<span class="cc2-status">${this.escapeHtml(template.shortcut)}</span>` : ""}
          </div>
          <div class="cc2-card-body">${this.escapeHtml(this.truncate(template.message, 160))}</div>
          <div class="cc2-card-actions">
            <button type="button" data-use-template="${this.escapeAttr(template.id)}">ใช้</button>
            <button type="button" data-edit-template="${this.escapeAttr(template.id)}">แก้ไข</button>
            <button type="button" class="cc2-danger" data-delete-template="${this.escapeAttr(template.id)}">ลบ</button>
          </div>
        </div>
      `).join("")
      : `<div class="cc2-empty"><strong>ยังไม่มี Template</strong><span>สร้างข้อความสำเร็จรูปสำหรับทีมได้ที่นี่</span></div>`;
  }

  openTemplateEditor(templateId = "") {
    const template = this.templates.find((entry) => entry.id === templateId) || null;
    this.$("chat2TemplateId").value = template?.id || "";
    this.$("chat2TemplateTitle").value = template?.title || "";
    this.$("chat2TemplateShortcut").value = template?.shortcut || "";
    this.$("chat2TemplateMessage").value = template?.message || "";
    this.$("chat2TemplateEditor").hidden = false;
  }

  closeTemplateEditor() {
    this.$("chat2TemplateEditor").hidden = true;
  }

  async saveTemplate() {
    if (!this.can("chat:templates")) return;
    const id = this.$("chat2TemplateId")?.value || "";
    const payload = {
      title: this.$("chat2TemplateTitle")?.value || "",
      shortcut: this.$("chat2TemplateShortcut")?.value || "",
      message: this.$("chat2TemplateMessage")?.value || "",
    };
    if (!payload.title.trim() || !payload.message.trim()) {
      this.toast("กรุณากรอก Template ให้ครบ", "warning");
      return;
    }
    try {
      if (id && !id.startsWith("default_")) {
        await this.fetchJson(`/admin/chat/templates/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await this.fetchJson("/admin/chat/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await this.loadTemplates();
      this.closeTemplateEditor();
      this.toast("บันทึก Template แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "บันทึก Template ไม่สำเร็จ", "error");
    }
  }

  async deleteTemplate(templateId) {
    if (!this.can("chat:templates")) return;
    if (!templateId || !confirm("ต้องการลบ Template นี้หรือไม่?")) return;
    if (templateId.startsWith("default_")) {
      this.templates = this.templates.filter((entry) => entry.id !== templateId);
      this.renderTemplates();
      return;
    }
    try {
      await this.fetchJson(`/admin/chat/templates/${encodeURIComponent(templateId)}`, { method: "DELETE" });
      await this.loadTemplates();
      this.toast("ลบ Template แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "ลบ Template ไม่สำเร็จ", "error");
    }
  }

  useTemplate(templateId) {
    if (!this.can("chat:templates")) return;
    const template = this.templates.find((entry) => entry.id === templateId);
    if (!template) return;
    this.insertAtCursor(template.message || "");
  }

  renderForwardTargets() {
    const wrap = this.$("chat2ForwardTargets");
    if (!wrap) return;
    const targets = this.users.filter((user) => user.userId !== this.currentUserId).slice(0, 18);
    wrap.innerHTML = targets.length
      ? targets.map((user) => `
        <label class="cc2-forward-item">
          <input type="checkbox" value="${this.escapeAttr(user.userId)}" data-platform="${this.escapeAttr(user.platform || "")}" data-bot-id="${this.escapeAttr(user.botId || "")}">
          <span><strong>${this.escapeHtml(user.displayName || user.userId)}</strong><br><small>${this.escapeHtml(user.channelLabel || user.platform || "")}</small></span>
        </label>
      `).join("")
      : `<span class="cc2-muted">ไม่มีผู้รับในรายการที่กรองอยู่</span>`;
  }

  async forwardMessage() {
    if (!this.can("chat:forward")) return;
    const message = this.$("chat2ForwardMessage")?.value.trim() || "";
    const targets = Array.from(this.$("chat2ForwardTargets")?.querySelectorAll("input:checked") || []).map((input) => ({
      userId: input.value,
      platform: input.dataset.platform || null,
      botId: input.dataset.botId || null,
    }));
    if (!message || !targets.length) {
      this.toast("กรุณาใส่ข้อความและเลือกผู้รับ", "warning");
      return;
    }
    try {
      const data = await this.fetchJson("/admin/chat/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, targets }),
      });
      this.toast(`ส่งต่อสำเร็จ ${data.sentCount || 0} รายการ`, data.failedCount ? "warning" : "success");
    } catch (error) {
      this.toast(error.message || "ส่งต่อไม่สำเร็จ", "error");
    }
  }

  renderAssignees() {
    const select = this.$("chat2AssigneeSelect");
    const statusSelect = this.$("chat2QueueStatus");
    const slaInput = this.$("chat2SlaMinutes");
    const assignment = this.normalizeAssignment(this.context.assignment || this.currentUser()?.assignment || {}, this.currentUser() || {});
    if (select) {
      const options = [
        `<option value="">ยังไม่มอบหมาย</option>`,
        ...(this.adminUsers.length
          ? this.adminUsers.map((user) => `<option value="${this.escapeAttr(user.id)}">${this.escapeHtml(user.label || user.id)}</option>`)
          : [`<option value="current">ตัวฉัน</option>`]),
      ];
      if (assignment.ownerId && !options.some((option) => option.includes(`value="${this.escapeAttr(assignment.ownerId)}"`))) {
        options.push(`<option value="${this.escapeAttr(assignment.ownerId)}">${this.escapeHtml(assignment.ownerLabel || assignment.ownerId)}</option>`);
      }
      select.innerHTML = options.join("");
      select.value = assignment.ownerId || "";
    }
    if (statusSelect) statusSelect.value = assignment.queueStatus || "open";
    if (slaInput) {
      slaInput.value = "";
      slaInput.placeholder = assignment.slaDueAt ? "ใช้ SLA เดิม" : "ค่าเริ่มต้น";
    }
  }

  async assignChat() {
    if (!this.can("chat:assign")) return;
    if (!this.currentUserId) return;
    const select = this.$("chat2AssigneeSelect");
    const ownerId = select?.value || "";
    const selected = this.adminUsers.find((user) => user.id === select?.value) || null;
    const ownerLabel = ownerId
      ? selected?.label || select?.selectedOptions?.[0]?.textContent?.trim() || "Admin"
      : "";
    const slaRaw = this.$("chat2SlaMinutes")?.value || "";
    try {
      const data = await this.fetchJson("/admin/chat/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: this.currentUserId,
          ...this.currentConversationPayload(),
          ownerId,
          ownerLabel,
          queueStatus: this.$("chat2QueueStatus")?.value || "open",
          slaMinutes: slaRaw ? Number(slaRaw) : undefined,
          note: this.$("chat2AssignmentNote")?.value || "",
        }),
      });
      this.context.assignment = data.assignment;
      this.patchUser(this.currentUserId, { assignment: data.assignment });
      this.renderOverview();
      this.renderAssignees();
      this.renderDebug();
      this.toast("บันทึกการมอบหมายแล้ว", "success");
    } catch (error) {
      this.toast(error.message || "มอบหมายไม่สำเร็จ", "error");
    }
  }

  async sendMessage() {
    if (!this.can("chat:send")) return;
    const input = this.$("chat2Input");
    const message = input?.value.replace(/\r\n/g, "\n").trim();
    if (!message || !this.currentUserId) return;
    const temp = this.prepareMessage({
      role: "admin",
      source: "admin_chat",
      content: message,
      timestamp: new Date().toISOString(),
      sending: true,
    });
    this.history[this.currentUserId] = this.history[this.currentUserId] || [];
    this.history[this.currentUserId].push(temp);
    input.value = "";
    this.resizeComposer(input);
    this.renderMessages();
    try {
      const context = this.currentConversationContext();
      const data = await this.fetchJson("/admin/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: this.currentUserId,
          message,
          platform: context.platform || undefined,
          botId: context.botId || undefined,
        }),
      });
      const messages = this.history[this.currentUserId] || [];
      const idx = messages.indexOf(temp);
      if (data.skipEcho) {
        if (idx >= 0) messages.splice(idx, 1);
      } else if (data.message) {
        if (idx >= 0) messages[idx] = this.prepareMessage(data.message);
        else messages.push(this.prepareMessage(data.message));
      }
      this.renderMessages();
      this.scheduleUsersReload();
      this.toast(data.control ? (data.displayMessage || "อัปเดตสถานะแล้ว") : "ส่งข้อความแล้ว", "success");
    } catch (error) {
      const messages = this.history[this.currentUserId] || [];
      const idx = messages.indexOf(temp);
      if (idx >= 0) messages.splice(idx, 1);
      this.renderMessages();
      this.toast(error.message || "ส่งข้อความไม่สำเร็จ", "error");
    }
  }

  handleNewMessage(data) {
    if (!data?.userId || !data.message) return;
    this.history[data.userId] = this.history[data.userId] || [];
    this.history[data.userId].push(this.prepareMessage(data.message));
    if (data.userId === this.currentUserId) {
      this.renderMessages();
      this.markRead(data.userId);
    }
    this.scheduleUsersReload();
  }

  renderMessages() {
    const wrap = this.$("chat2Messages");
    if (!wrap) return;
    const messages = this.history[this.currentUserId] || [];
    if (!this.currentUserId) {
      wrap.innerHTML = `<div class="cc2-empty"><div class="cc2-empty-icon"><i class="fas fa-comments"></i></div><strong>ยังไม่ได้เลือกบทสนทนา</strong><span>เลือกแชทจาก Inbox เพื่อเริ่มทำงาน</span></div>`;
      return;
    }
    if (!messages.length) {
      wrap.innerHTML = `<div class="cc2-empty"><strong>ยังไม่มีข้อความ</strong><span>เริ่มสนทนาด้วยข้อความแรกได้เลย</span></div>`;
      return;
    }
    let lastDay = "";
    const search = this.$("chat2MessageSearch")?.value.trim().toLowerCase() || "";
    let matches = 0;
    const blocks = [];
    messages.forEach((message) => {
      const day = this.dateLabel(message.timestamp);
      if (day && day !== lastDay) {
        blocks.push(`<div class="cc2-day">${this.escapeHtml(day)}</div>`);
        lastDay = day;
      }
      const text = this.extractDisplayText(message);
      const isMatch = search && text.toLowerCase().includes(search);
      if (isMatch) matches += 1;
      blocks.push(this.renderMessage(message, isMatch));
    });
    wrap.innerHTML = blocks.join("");
    const count = this.$("chat2MessageSearchCount");
    if (count) count.textContent = String(matches);
    setTimeout(() => {
      wrap.scrollTop = wrap.scrollHeight;
    }, 40);
    this.renderHeader();
    this.renderDebug();
  }

  renderMessage(message, isMatch = false) {
    const tokenSegments = this.normalizeImageTokenSegments(message?.imageTokenSegments);
    if (tokenSegments.length > 0) {
      return this.renderSegmentedMessage(message, tokenSegments, isMatch);
    }
    const role = this.messageVisualRole(message);
    const content = this.renderMessageContent(message);
    const messageId = this.resolveId(message);
    const feedback = message.feedback || "";
    const tokenImageSources = this.messageTokenImageSources(message);
    const images = (message.images || [])
      .filter((src) => !tokenImageSources.has(src))
      .map((src) => `
      <img src="${this.escapeAttr(src)}" alt="รูปภาพ" data-image-src="${this.escapeAttr(src)}" loading="lazy">
    `).join("");
    return `
      <div class="cc2-message is-${role} ${isMatch ? "cc2-highlight" : ""}" data-message-id="${this.escapeAttr(messageId)}">
        <div class="cc2-message-bubble">
          <div class="cc2-message-head">
            <span>${this.messageLabel(message)}</span>
            <span>${this.time(message.timestamp)}${message.sending ? " · กำลังส่ง" : ""}</span>
          </div>
          <div class="cc2-message-text">${content}</div>
          ${images ? `<div class="cc2-message-images">${images}</div>` : ""}
          ${messageId && message.role !== "user" ? `
            <div class="cc2-message-actions">
              <button type="button" class="${feedback === "positive" ? "is-active" : ""}" data-feedback="positive" title="คำตอบดี" aria-label="ให้คะแนนคำตอบดี"><i class="fas fa-thumbs-up"></i></button>
              <button type="button" class="${feedback === "negative" ? "is-active" : ""}" data-feedback="negative" title="คำตอบควรแก้" aria-label="ให้คะแนนว่าคำตอบควรแก้"><i class="fas fa-thumbs-down"></i></button>
              ${feedback ? `<button type="button" data-feedback="clear" title="ล้าง feedback" aria-label="ล้าง feedback"><i class="fas fa-xmark"></i></button>` : ""}
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  renderSegmentedMessage(message, segments, isMatch = false) {
    const visibleSegments = segments.filter((segment) =>
      segment.type === "image" || (typeof segment.text === "string" && segment.text.trim()),
    );
    if (!visibleSegments.length) return "";

    return visibleSegments.map((segment, index) => {
      const isLast = index === visibleSegments.length - 1;
      const segmentMessage = {
        ...message,
        imageTokenSegments: [],
        images: [],
        _plainText: segment.type === "text"
          ? segment.text
          : `[รูปภาพ: ${segment.label || "รูปภาพ"}]`,
        content: segment.type === "text" ? segment.text : "",
      };
      const content = segment.type === "image"
        ? this.renderTokenImageSegment(segment)
        : this.renderMessageText((segment.text || "").trim());
      return this.renderMessageBubble(segmentMessage, {
        content,
        isMatch,
        showActions: isLast,
        segmentIndex: index,
        mediaOnly: segment.type === "image",
      });
    }).join("");
  }

  renderMessageBubble(message, options = {}) {
    const role = this.messageVisualRole(message);
    const messageId = this.resolveId(message);
    const feedback = message.feedback || "";
    const images = Array.isArray(options.images)
      ? options.images.join("")
      : "";
    const dataMessageId = options.showActions === false
      ? `${messageId}:segment:${options.segmentIndex || 0}`
      : messageId;
    const mediaClass = options.mediaOnly ? " cc2-message--media" : "";
    return `
      <div class="cc2-message is-${role}${mediaClass} ${options.isMatch ? "cc2-highlight" : ""}" data-message-id="${this.escapeAttr(dataMessageId)}">
        <div class="cc2-message-bubble">
          <div class="cc2-message-head">
            <span>${this.messageLabel(message)}</span>
            <span>${this.time(message.timestamp)}${message.sending ? " · กำลังส่ง" : ""}</span>
          </div>
          <div class="cc2-message-text">${options.content || ""}</div>
          ${images ? `<div class="cc2-message-images">${images}</div>` : ""}
          ${options.showActions !== false && messageId && message.role !== "user" ? `
            <div class="cc2-message-actions">
              <button type="button" class="${feedback === "positive" ? "is-active" : ""}" data-feedback="positive" title="คำตอบดี" aria-label="ให้คะแนนคำตอบดี"><i class="fas fa-thumbs-up"></i></button>
              <button type="button" class="${feedback === "negative" ? "is-active" : ""}" data-feedback="negative" title="คำตอบควรแก้" aria-label="ให้คะแนนว่าคำตอบควรแก้"><i class="fas fa-thumbs-down"></i></button>
              ${feedback ? `<button type="button" data-feedback="clear" title="ล้าง feedback" aria-label="ล้าง feedback"><i class="fas fa-xmark"></i></button>` : ""}
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  handleMessageClick(event) {
    const image = event.target.closest("[data-image-src]");
    if (image) {
      this.$("chat2ModalImage").src = image.dataset.imageSrc;
      bootstrap.Modal.getOrCreateInstance(this.$("chat2ImageModal")).show();
      return;
    }
    const feedbackBtn = event.target.closest("[data-feedback]");
    if (!feedbackBtn) return;
    const msgEl = feedbackBtn.closest("[data-message-id]");
    const messageId = msgEl?.dataset.messageId;
    if (messageId) this.saveFeedback(messageId, feedbackBtn.dataset.feedback);
  }

  async saveFeedback(messageId, feedback) {
    try {
      const data = await this.fetchJson("/admin/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, userId: this.currentUserId, feedback }),
      });
      const msg = (this.history[this.currentUserId] || []).find((entry) => this.resolveId(entry) === messageId);
      if (msg) msg.feedback = data.feedback || null;
      this.renderMessages();
      this.toast("บันทึก feedback แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "บันทึก feedback ไม่สำเร็จ", "error");
    }
  }

  async toggleAi() {
    if (!this.can("chat:ai-control")) return;
    const user = this.currentUser();
    if (!user) return;
    const next = user.aiEnabled === false;
    try {
      await this.fetchJson("/admin/chat/user-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: this.currentUserId, aiEnabled: next, ...this.currentConversationPayload() }),
      });
      this.patchUser(this.currentUserId, { aiEnabled: next });
      this.renderOverview();
      this.toast(next ? "เปิด AI แล้ว" : "ปิด AI แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "อัปเดต AI ไม่สำเร็จ", "error");
    }
  }

  async togglePurchase() {
    if (!this.can("chat:purchase-status")) return;
    const user = this.currentUser();
    if (!user) return;
    const next = !user.hasPurchased;
    try {
      await this.fetchJson(`/admin/chat/purchase-status/${encodeURIComponent(this.currentUserId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasPurchased: next, ...this.currentConversationPayload() }),
      });
      this.patchUser(this.currentUserId, { hasPurchased: next });
      this.renderOverview();
      this.toast(next ? "ทำเครื่องหมายว่าซื้อแล้ว" : "ยกเลิกสถานะซื้อแล้ว", "success");
    } catch (error) {
      this.toast(error.message || "อัปเดตสถานะซื้อไม่สำเร็จ", "error");
    }
  }

  async refreshProfile() {
    if (!this.can("chat:profile-refresh")) return;
    const user = this.currentUser();
    if (!user || user.platform !== "facebook") return;
    try {
      const data = await this.fetchJson(`/admin/chat/users/${encodeURIComponent(this.currentUserId)}/refresh-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: user.platform, botId: user.botId || null }),
      });
      if (data.displayName) this.patchUser(this.currentUserId, { displayName: data.displayName });
      this.toast("อัปเดตโปรไฟล์แล้ว", "success");
    } catch (error) {
      this.toast(error.message || "อัปเดตโปรไฟล์ไม่สำเร็จ", "error");
    }
  }

  async clearChat() {
    if (!this.can("chat:clear")) return;
    if (!this.currentUserId || !confirm("ต้องการล้างประวัติแชทนี้หรือไม่?")) return;
    try {
      await this.fetchJson(`/admin/chat/clear/${encodeURIComponent(this.currentUserId)}${this.currentConversationQuery()}`, { method: "DELETE" });
      this.history[this.currentUserId] = [];
      this.renderMessages();
      this.toast("ล้างแชทแล้ว", "success");
    } catch (error) {
      this.toast(error.message || "ล้างแชทไม่สำเร็จ", "error");
    }
  }

  async markRead(userId) {
    try {
      await fetch(`/admin/chat/mark-read/${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.currentConversationPayload()),
      });
    } catch (_) { }
  }

  copyChatLink() {
    if (!this.currentUserId) return;
    const user = this.currentUser();
    const params = new URLSearchParams({ user: this.currentUserId });
    if (user?.platform) params.set("platform", user.platform);
    if (user?.botId) params.set("botId", user.botId);
    const url = `${window.location.origin}/admin/chat?${params.toString()}`;
    navigator.clipboard?.writeText(url).then(
      () => this.toast("คัดลอกลิงก์แล้ว", "success"),
      () => prompt("คัดลอกลิงก์", url),
    );
  }

  toggleMessageSearch() {
    const bar = this.$("chat2MessageSearchBar");
    if (!bar) return;
    bar.hidden = !bar.hidden;
    if (!bar.hidden) this.$("chat2MessageSearch")?.focus();
  }

  exportConversation(format) {
    if (!this.can("chat:export")) return;
    if (!this.currentUserId) return;
    const user = this.currentUser();
    const messages = this.history[this.currentUserId] || [];
    const baseName = `chat_${this.currentUserId}_${new Date().toISOString().slice(0, 10)}`;
    if (format === "json") {
      this.download(`${baseName}.json`, JSON.stringify({ user, messages }, null, 2), "application/json");
      return;
    }
    const lines = [
      `Chat: ${user?.displayName || this.currentUserId}`,
      `User ID: ${this.currentUserId}`,
      `Exported: ${new Date().toISOString()}`,
      "",
      ...messages.map((msg) => `[${this.dateTime(msg.timestamp)}] ${this.messageLabel(msg)}: ${this.extractDisplayText(msg)}`),
    ];
    this.download(`${baseName}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
  }

  download(fileName, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  renderDebug() {
    const debug = this.$("chat2Debug");
    if (!debug) return;
    const messages = this.history[this.currentUserId] || [];
    debug.textContent = this.currentUserId
      ? JSON.stringify({
        user: this.currentUser(),
        context: this.context,
        counts: {
          messages: messages.length,
          orders: this.context.orders.length,
          submissions: this.context.submissions.length,
          files: this.context.files.length,
        },
        filters: this.filters,
        socketConnected: !!this.socket?.connected,
      }, null, 2)
      : "เลือกแชทเพื่อดูข้อมูล debug";
  }

  prepareMessage(message = {}) {
    const normalized = { ...message };
    const id = this.resolveId(normalized);
    const raw = normalized.rawContent !== undefined ? normalized.rawContent : normalized.content;
    const parsed = this.parseJson(raw);
    const imageTokenSegments = this.normalizeImageTokenSegments(normalized.imageTokenSegments);
    const images = this.extractImages(parsed, id);
    if (Array.isArray(normalized.images)) {
      normalized.images.forEach((src) => {
        if (typeof src === "string" && src.trim() && !images.includes(src)) images.push(src);
      });
    }
    const tokenImageSources = this.imageTokenSourcesFromSegments(imageTokenSegments);
    normalized.images = images;
    normalized.imageTokenSegments = imageTokenSegments;
    normalized._plainText = this.extractPlainTextFromImageTokenSegments(imageTokenSegments)
      || this.extractPlainText(parsed)
      || this.stripHtml(normalized.displayContent || "")
      || (typeof normalized.content === "string" ? normalized.content : "");
    if (tokenImageSources.size > 0) {
      normalized.images = images.filter((src) => !tokenImageSources.has(src));
    }
    return normalized;
  }

  parseJson(value) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return value;
    }
  }

  formatNonTextDuration(duration) {
    const rawDuration = Number(duration);
    if (!Number.isFinite(rawDuration) || rawDuration <= 0) return "";
    const totalSeconds = rawDuration > 1000 ? Math.round(rawDuration / 1000) : Math.round(rawDuration);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes} นาที ${String(seconds).padStart(2, "0")} วินาที`;
    return `${seconds} วินาที`;
  }

  extractNonTextMessageText(content) {
    if (!content || typeof content !== "object" || Array.isArray(content)) return "";
    const data = content.data && typeof content.data === "object" && !Array.isArray(content.data)
      ? content.data
      : content;
    const rawType = typeof data.type === "string" ? data.type.trim().toLowerCase() : "";
    const messageType = rawType === "unsupported"
      ? (typeof data.messageType === "string" ? data.messageType.trim().toLowerCase() : "unknown")
      : (typeof data.messageType === "string" && data.messageType.trim()
        ? data.messageType.trim().toLowerCase()
        : rawType);
    const labels = {
      sticker: "ลูกค้าส่งสติกเกอร์ LINE",
      audio: "ลูกค้าส่งไฟล์เสียง",
      video: "ลูกค้าส่งวิดีโอ",
      file: "ลูกค้าส่งไฟล์",
      location: "ลูกค้าส่งตำแหน่งที่ตั้ง",
      imagemap: "ลูกค้าส่งข้อความ LINE ประเภท imagemap",
      unknown: "ลูกค้าส่งข้อความประเภทที่ระบบยังไม่รองรับ",
    };
    if (!rawType && !messageType) return "";
    if (rawType !== "unsupported" && !labels[messageType]) return "";

    const label = typeof data.text === "string" && data.text.trim()
      ? data.text.trim()
      : labels[messageType] || labels.unknown;
    const details = [];
    if (messageType === "sticker" && data.packageId && data.stickerId) {
      details.push(`Sticker ${data.packageId}/${data.stickerId}`);
    }
    const fileName = (typeof data.fileName === "string" && data.fileName.trim())
      || (typeof data.filename === "string" && data.filename.trim())
      || "";
    if (fileName) details.push(fileName);
    const durationLabel = this.formatNonTextDuration(data.duration);
    if (durationLabel) details.push(durationLabel);
    if (messageType === "location") {
      if (typeof data.title === "string" && data.title.trim()) details.push(data.title.trim());
      if (typeof data.address === "string" && data.address.trim()) details.push(data.address.trim());
    }
    return details.length ? `${label} (${details.join(" / ")})` : label;
  }

  extractPlainText(content) {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((entry) => this.extractPlainText(entry)).filter(Boolean).join("\n");
    }
    if (typeof content === "object") {
      if (typeof content.text === "string") return content.text;
      if (content.type === "text" && typeof content.content === "string") return content.content;
      const nonTextMessage = this.extractNonTextMessageText(content);
      if (nonTextMessage) return nonTextMessage;
      if (content.data) return this.extractPlainText(content.data);
      if (Array.isArray(content.content)) return this.extractPlainText(content.content);
    }
    return "";
  }

  extractImages(content, messageId = "") {
    const images = [];
    let base64Index = 0;
    const add = (src) => {
      if (typeof src === "string" && src.trim() && !images.includes(src.trim())) images.push(src.trim());
    };
    const addBase64 = (base64) => {
      if (typeof base64 !== "string" || !base64.trim()) return;
      if (messageId) add(`/assets/chat-images/${encodeURIComponent(messageId)}/${base64Index}`);
      else add(`data:image/jpeg;base64,${base64.trim()}`);
      base64Index += 1;
    };
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== "object") return;
      if (node.type === "image") {
        add(node.previewUrl || node.thumbUrl || node.url || node.src || "");
        addBase64(node.base64 || node.content || "");
      }
      if (node.data) visit(node.data);
      if (Array.isArray(node.content)) visit(node.content);
      if (Array.isArray(node.images)) visit(node.images);
      if (Array.isArray(node.media)) visit(node.media);
    };
    visit(content);
    return images;
  }

  extractDisplayText(message) {
    if (!message) return "";
    if (typeof message._plainText === "string") return message._plainText;
    const rawContent = message.rawContent !== undefined ? message.rawContent : message.content;
    if (typeof rawContent === "string" && rawContent.trim().startsWith("<")) {
      const textFromHtml = this.stripHtml(rawContent);
      if (textFromHtml) return textFromHtml;
    }
    return this.extractPlainText(this.parseJson(rawContent))
      || this.stripHtml(message.displayContent || "")
      || "";
  }

  renderMessageText(text) {
    return this.escapeHtml(text || "")
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, "<br>");
  }

  renderTokenImageSegment(segment) {
    const previewSrc = segment.previewUrl || segment.thumbUrl || segment.url;
    const fullSrc = segment.url || previewSrc;
    if (!previewSrc && !fullSrc) {
      return this.renderMessageText(`[รูป ${segment.label || "image"} ไม่พบ]`);
    }
    const label = segment.label || segment.alt || "รูปภาพ";
    return `<button type="button" class="cc2-token-image" data-image-src="${this.escapeAttr(fullSrc || previewSrc)}" title="${this.escapeAttr(label)}" aria-label="ดูรูป ${this.escapeAttr(label)}"><img src="${this.escapeAttr(previewSrc || fullSrc)}" alt="${this.escapeAttr(label)}" loading="lazy"><span>${this.escapeHtml(label)}</span></button>`;
  }

  renderMessageContent(message) {
    const segments = this.normalizeImageTokenSegments(message?.imageTokenSegments);
    if (segments.length > 0) {
      const parts = segments.map((segment) => {
        if (segment.type === "image") {
          return this.renderTokenImageSegment(segment);
        }
        const text = typeof segment.text === "string" ? segment.text.trim() : "";
        return text ? `<div class="cc2-token-text">${this.renderMessageText(text)}</div>` : "";
      }).filter(Boolean);
      return `<div class="cc2-token-stack">${parts.join("")}</div>`;
    }
    return this.renderMessageText(this.extractDisplayText(message) || (message?.images?.length ? "[รูปภาพ]" : ""));
  }

  normalizeImageTokenSegments(segments) {
    if (!Array.isArray(segments)) return [];
    return segments.map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      if (segment.type === "image") {
        const url = typeof segment.url === "string" ? segment.url.trim() : "";
        const thumbUrl = typeof segment.thumbUrl === "string" ? segment.thumbUrl.trim() : "";
        const previewUrl = typeof segment.previewUrl === "string" ? segment.previewUrl.trim() : "";
        return {
          type: "image",
          label: typeof segment.label === "string" ? segment.label.trim() : "",
          alt: typeof segment.alt === "string" ? segment.alt.trim() : "",
          url,
          thumbUrl,
          previewUrl: previewUrl || thumbUrl || url,
        };
      }
      if (segment.type === "text") {
        return {
          type: "text",
          text: typeof segment.text === "string" ? segment.text : "",
        };
      }
      return null;
    }).filter((segment) => segment && (segment.type === "image" || segment.text));
  }

  imageTokenSourcesFromSegments(segments) {
    const sources = new Set();
    segments.forEach((segment) => {
      if (segment.type !== "image") return;
      [segment.url, segment.thumbUrl, segment.previewUrl].forEach((src) => {
        if (typeof src === "string" && src.trim()) sources.add(src.trim());
      });
    });
    return sources;
  }

  messageTokenImageSources(message) {
    return this.imageTokenSourcesFromSegments(this.normalizeImageTokenSegments(message?.imageTokenSegments));
  }

  extractPlainTextFromImageTokenSegments(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return "";
    return segments.map((segment) => {
      if (segment.type === "image") return `[รูปภาพ: ${segment.label || "รูปภาพ"}]`;
      return segment.text || "";
    }).join("").trim();
  }

  messageVisualRole(message) {
    if (message.role === "user") return "user";
    const source = String(message.source || "").toLowerCase();
    if (source === "follow_up") return "followup";
    if (source.includes("admin")) return "admin";
    return "assistant";
  }

  messageLabel(message) {
    if (message.role === "user") return "ลูกค้า";
    const source = String(message.source || "").toLowerCase();
    if (source === "follow_up") return "ระบบติดตาม";
    if (source === "ai") return "AI";
    if (source.includes("admin_forward")) return "แอดมินส่งต่อ";
    if (source.includes("admin")) return "แอดมิน";
    return "ระบบ";
  }

  insertAtCursor(text) {
    const input = this.$("chat2Input");
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
    input.focus();
    this.resizeComposer(input);
  }

  toggleEmoji(anchor) {
    if (!this.emojiPopover) {
      this.emojiPopover = document.createElement("div");
      this.emojiPopover.className = "cc2-emoji-popover";
      ["😊", "🙏", "👍", "✅", "📦", "📍", "💬", "⏳", "🎉", "🙌", "โทร", "โอน"].forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = item;
        btn.addEventListener("click", () => {
          this.insertAtCursor(item);
          this.emojiPopover.hidden = true;
        });
        this.emojiPopover.appendChild(btn);
      });
      document.body.appendChild(this.emojiPopover);
    }
    const rect = anchor.getBoundingClientRect();
    this.emojiPopover.style.left = `${Math.max(8, rect.left)}px`;
    this.emojiPopover.style.top = `${Math.max(8, rect.top - 230)}px`;
    this.emojiPopover.hidden = !this.emojiPopover.hidden;
  }

  resizeComposer(input) {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(160, Math.max(42, input.scrollHeight))}px`;
  }

  avatarHtml(user) {
    const letter = (user?.displayName || user?.userId || "U").trim().charAt(0).toUpperCase() || "U";
    if (user?.pictureUrl) {
      return `<img src="${this.escapeAttr(user.pictureUrl)}" alt="${this.escapeAttr(user.displayName || "User")}" onerror="this.remove()">`;
    }
    return `<span>${this.escapeHtml(letter)}</span>`;
  }

  resolveId(doc) {
    if (!doc) return "";
    if (typeof doc.id === "string") return doc.id;
    if (typeof doc._id === "string") return doc._id;
    if (doc._id?.$oid) return doc._id.$oid;
    if (doc._id?.toString) return doc._id.toString();
    if (typeof doc.messageId === "string") return doc.messageId;
    return "";
  }

  stripHtml(html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = String(html).replace(/<br\s*\/?>/gi, "\n");
    return (div.textContent || div.innerText || "").replace(/\u00a0/g, " ");
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  escapeAttr(value) {
    return this.escapeHtml(value);
  }

  truncate(text, length = 80) {
    const value = String(text || "");
    return value.length > length ? `${value.slice(0, length)}...` : value;
  }

  compactId(value, head = 10, tail = 6) {
    const text = String(value || "").trim();
    if (text.length <= head + tail + 3) return text;
    return `${text.slice(0, head)}...${text.slice(-tail)}`;
  }

  formatValue(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value ?? "");
  }

  formatNumber(value) {
    return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  fileSize(bytes) {
    const size = Number(bytes || 0);
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
  }

  orderStatusLabel(status) {
    return {
      pending: "รอดำเนินการ",
      confirmed: "ยืนยันแล้ว",
      shipped: "จัดส่งแล้ว",
      completed: "เสร็จสิ้น",
      cancelled: "ยกเลิก",
    }[status] || status || "pending";
  }

  dateTime(timestamp) {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString("th-TH", { hour12: false });
  }

  dateLabel(timestamp) {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  }

  time(timestamp) {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  }

  relativeTime(timestamp) {
    if (!timestamp) return "-";
    const diff = Date.now() - new Date(timestamp).getTime();
    if (!Number.isFinite(diff)) return "-";
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "เมื่อสักครู่";
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} วันที่แล้ว`;
    return new Date(timestamp).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  }

  timeUntil(timestamp) {
    if (!timestamp) return "-";
    const diff = new Date(timestamp).getTime() - Date.now();
    if (!Number.isFinite(diff)) return "-";
    if (diff <= 0) return "0 นาที";
    const minutes = Math.ceil(diff / 60000);
    if (minutes < 60) return `${minutes} นาที`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 24) return rest ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`;
    const days = Math.floor(hours / 24);
    return `${days} วัน`;
  }

  toast(message, type = "info") {
    let wrap = document.querySelector(".cc2-toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "cc2-toast-wrap";
      document.body.appendChild(wrap);
    }
    const icon = type === "success" ? "fa-check" : type === "error" ? "fa-xmark" : type === "warning" ? "fa-triangle-exclamation" : "fa-info";
    const toast = document.createElement("div");
    toast.className = `cc2-toast ${type}`;
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${this.escapeHtml(message)}</span>`;
    wrap.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }
}
