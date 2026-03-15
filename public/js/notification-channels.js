(function () {
  "use strict";

  const state = {
    channels: [],
    lineBots: null,
    telegramBots: null,
    allBots: null,
    groupsBySenderBot: new Map(),
    telegramGroupsByBot: new Map(),
    modalInstance: null,
    telegramBotModalInstance: null,
  };

  const els = {};

  function getEscapeHtml() {
    if (typeof window.escapeHtml === "function") return window.escapeHtml;
    return (value) => {
      if (value === null || value === undefined) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
  }

  function toast(message, type = "info") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }
    alert(message);
  }

  function normalizeChannelType(value) {
    return value === "telegram_group" ? "telegram_group" : "line_group";
  }

  function selectedDestinationType() {
    return els.destinationTelegram?.checked === true
      ? "telegram_group"
      : "line_group";
  }

  function cacheElements() {
    els.channelsList = document.getElementById("notificationChannelsList");
    els.refreshBtn = document.getElementById("notificationsRefreshBtn");
    els.createBtn = document.getElementById("notificationsCreateBtn");

    els.telegramBotsList = document.getElementById("telegramNotificationBotsList");
    els.telegramBotsRefreshBtn = document.getElementById("telegramBotsRefreshBtn");
    els.telegramBotsCreateBtn = document.getElementById("telegramBotsCreateBtn");

    els.telegramBotModalEl = document.getElementById("telegramNotificationBotModal");
    els.telegramBotModalLabel = document.getElementById(
      "telegramNotificationBotModalLabel",
    );
    els.telegramBotId = document.getElementById("telegramNotificationBotId");
    els.telegramBotName = document.getElementById("telegramNotificationBotName");
    els.telegramBotToken = document.getElementById("telegramNotificationBotToken");
    els.telegramBotStatus = document.getElementById("telegramNotificationBotStatus");
    els.telegramBotIsActive = document.getElementById(
      "telegramNotificationBotIsActive",
    );
    els.telegramBotSaveBtn = document.getElementById("telegramNotificationBotSaveBtn");
    els.telegramBotDeleteBtn = document.getElementById(
      "telegramNotificationBotDeleteBtn",
    );

    els.modalEl = document.getElementById("notificationChannelModal");
    els.modalLabel = document.getElementById("notificationChannelModalLabel");
    els.form = document.getElementById("notificationChannelForm");
    els.channelId = document.getElementById("notificationChannelId");
    els.channelName = document.getElementById("notificationChannelName");

    els.destinationLine = document.getElementById("notificationDestinationLine");
    els.destinationTelegram = document.getElementById(
      "notificationDestinationTelegram",
    );
    els.lineTargetBox = document.getElementById("notificationLineTargetBox");
    els.telegramTargetBox = document.getElementById("notificationTelegramTargetBox");

    els.senderBotSelect = document.getElementById("notificationChannelSenderBot");
    els.groupSelect = document.getElementById("notificationChannelGroup");
    els.refreshGroupsBtn = document.getElementById(
      "notificationChannelRefreshGroupsBtn",
    );

    els.telegramBotSelect = document.getElementById(
      "notificationChannelTelegramBot",
    );
    els.telegramGroupSelect = document.getElementById(
      "notificationChannelTelegramGroup",
    );
    els.refreshTelegramGroupsBtn = document.getElementById(
      "notificationChannelRefreshTelegramGroupsBtn",
    );

    els.receiveAll = document.getElementById("notificationReceiveAll");
    els.receiveSelected = document.getElementById("notificationReceiveSelected");
    els.sourcesBox = document.getElementById("notificationChannelSourcesBox");
    els.sourcesList = document.getElementById("notificationChannelSourcesList");

    els.deliveryRealtime = document.getElementById("notificationDeliveryRealtime");
    els.deliveryScheduled = document.getElementById("notificationDeliveryScheduled");
    els.summaryBox = document.getElementById("notificationSummaryBox");
    els.summaryTimesInput = document.getElementById("notificationSummaryTimes");

    els.includeCustomer = document.getElementById(
      "notificationSettingIncludeCustomer",
    );
    els.includePhone = document.getElementById("notificationSettingIncludePhone");
    els.includeItemsCount = document.getElementById(
      "notificationSettingIncludeItemsCount",
    );
    els.includeItemsDetail = document.getElementById(
      "notificationSettingIncludeItemsDetail",
    );
    els.includeAddress = document.getElementById("notificationSettingIncludeAddress");
    els.includePaymentMethod = document.getElementById(
      "notificationSettingIncludePaymentMethod",
    );
    els.includeTotalAmount = document.getElementById(
      "notificationSettingIncludeTotalAmount",
    );
    els.includeOrderLink = document.getElementById(
      "notificationSettingIncludeOrderLink",
    );
    els.slipOkSection = document.getElementById("notificationSlipOkSection");
    els.slipOkEnabled = document.getElementById("notificationSettingSlipOkEnabled");
    els.slipOkConfigBox = document.getElementById("notificationSlipOkConfigBox");
    els.slipOkApiUrl = document.getElementById("notificationSettingSlipOkApiUrl");
    els.slipOkApiKey = document.getElementById("notificationSettingSlipOkApiKey");
    els.isActive = document.getElementById("notificationChannelIsActive");
    els.saveBtn = document.getElementById("notificationChannelSaveBtn");
  }

  function bindEvents() {
    els.refreshBtn?.addEventListener("click", () => refresh());
    els.createBtn?.addEventListener("click", () => openCreateModal());

    els.channelsList?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      const id = button.dataset.id;
      if (!id) return;

      if (action === "edit") {
        const channel = state.channels.find((ch) => ch.id === id);
        if (channel) openEditModal(channel);
        return;
      }
      if (action === "test") {
        testChannel(id);
        return;
      }
      if (action === "delete") {
        deleteChannel(id);
      }
    });

    els.channelsList?.addEventListener("change", (event) => {
      const toggle = event.target;
      if (!(toggle instanceof HTMLInputElement)) return;
      if (toggle.dataset.action !== "toggle") return;
      const id = toggle.dataset.id;
      if (!id) return;
      toggleChannel(id, toggle.checked);
    });

    els.telegramBotsRefreshBtn?.addEventListener("click", () => {
      loadTelegramBots({ force: true }).catch((err) => {
        console.error("[Notifications] Refresh telegram bots error:", err);
        toast("ไม่สามารถโหลด Telegram Bots ได้", "danger");
      });
    });

    els.telegramBotsCreateBtn?.addEventListener("click", () => {
      openCreateTelegramBotModal();
    });

    els.telegramBotsList?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (!id) return;
      if (button.dataset.action === "edit") {
        const bot = (state.telegramBots || []).find((item) => item.id === id);
        if (bot) openEditTelegramBotModal(bot);
        return;
      }
      if (button.dataset.action === "delete") {
        deleteTelegramBot(id);
      }
    });

    els.telegramBotsList?.addEventListener("change", (event) => {
      const toggle = event.target;
      if (!(toggle instanceof HTMLInputElement)) return;
      if (toggle.dataset.action !== "toggle") return;
      const id = toggle.dataset.id;
      if (!id) return;
      toggleTelegramBot(id, toggle.checked);
    });

    els.telegramBotSaveBtn?.addEventListener("click", () => saveTelegramBot());
    els.telegramBotDeleteBtn?.addEventListener("click", () => {
      const id = els.telegramBotId?.value || "";
      if (!id) return;
      deleteTelegramBot(id, { fromModal: true });
    });

    els.senderBotSelect?.addEventListener("change", () => {
      if (selectedDestinationType() !== "line_group") return;
      const botId = els.senderBotSelect.value;
      loadGroupsForSenderBot(botId).catch((err) => {
        console.error("[Notifications] Load groups error:", err);
        toast("ไม่สามารถโหลดรายการกลุ่มได้", "danger");
      });
    });

    els.refreshGroupsBtn?.addEventListener("click", () => {
      const botId = els.senderBotSelect?.value || "";
      loadGroupsForSenderBot(botId, { force: true }).catch((err) => {
        console.error("[Notifications] Refresh groups error:", err);
        toast("ไม่สามารถรีเฟรชรายการกลุ่มได้", "danger");
      });
    });

    els.telegramBotSelect?.addEventListener("change", () => {
      if (selectedDestinationType() !== "telegram_group") return;
      const botId = els.telegramBotSelect.value;
      loadGroupsForTelegramBot(botId).catch((err) => {
        console.error("[Notifications] Load telegram groups error:", err);
        toast("ไม่สามารถโหลดรายการกลุ่ม Telegram ได้", "danger");
      });
    });

    els.refreshTelegramGroupsBtn?.addEventListener("click", () => {
      const botId = els.telegramBotSelect?.value || "";
      loadGroupsForTelegramBot(botId, { force: true }).catch((err) => {
        console.error("[Notifications] Refresh telegram groups error:", err);
        toast("ไม่สามารถรีเฟรชรายการกลุ่ม Telegram ได้", "danger");
      });
    });

    [els.destinationLine, els.destinationTelegram].forEach((el) => {
      el?.addEventListener("change", () => {
        syncDestinationTypeUI();
      });
    });

    document
      .querySelectorAll('input[name="notificationReceiveMode"]')
      .forEach((el) => {
        el.addEventListener("change", () => syncReceiveModeUI());
      });

    document
      .querySelectorAll('input[name="notificationDeliveryMode"]')
      .forEach((el) => {
        el.addEventListener("change", () => syncDeliveryModeUI());
      });

    els.slipOkEnabled?.addEventListener("change", () => syncSlipOkUI());

    els.saveBtn?.addEventListener("click", () => saveChannel());
  }

  function initModal() {
    if (els.modalEl && window.bootstrap?.Modal) {
      state.modalInstance = new window.bootstrap.Modal(els.modalEl);
    }
    if (els.telegramBotModalEl && window.bootstrap?.Modal) {
      state.telegramBotModalInstance = new window.bootstrap.Modal(
        els.telegramBotModalEl,
      );
    }
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data?.error || data?.message || "Request failed");
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function extractBotsFromResponse(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.bots)) return data.bots;
    return [];
  }

  async function ensureLineBots() {
    if (Array.isArray(state.lineBots)) return state.lineBots;
    const bots = await fetchJson("/api/line-bots");
    const items = Array.isArray(bots) ? bots : [];
    state.lineBots = items
      .map((bot) => ({
        id: bot?._id?.toString?.() || String(bot?._id || ""),
        name: bot?.name || bot?.displayName || bot?.botName || "LINE Bot",
        status: bot?.status || null,
        notificationEnabled: bot?.notificationEnabled !== false,
      }))
      .filter((bot) => bot.id);
    return state.lineBots;
  }

  async function loadTelegramBots(options = {}) {
    const force = options.force === true;
    if (!force && Array.isArray(state.telegramBots)) {
      renderTelegramBotsList();
      return state.telegramBots;
    }

    const data = await fetchJson("/admin/api/telegram-notification-bots");
    const rawItems = extractBotsFromResponse(data);
    state.telegramBots = rawItems
      .map((bot) => ({
        id: bot?.id?.toString?.() || bot?._id?.toString?.() || String(bot?.id || bot?._id || ""),
        name: bot?.name || "Telegram Bot",
        status: bot?.status || "active",
        isActive: bot?.isActive !== false,
        tokenMasked: bot?.tokenMasked || bot?.maskedToken || "",
        botToken: typeof bot?.botToken === "string" ? bot.botToken : "",
      }))
      .filter((bot) => bot.id);

    renderTelegramBotsList();
    return state.telegramBots;
  }

  async function ensureAllBots() {
    if (Array.isArray(state.allBots)) return state.allBots;
    const data = await fetchJson("/admin/api/all-bots");
    const bots = Array.isArray(data?.bots) ? data.bots : [];
    state.allBots = bots
      .map((bot) => ({
        id: bot?.id?.toString?.() || String(bot?.id || ""),
        name: bot?.name || "Bot",
        platform: bot?.platform === "facebook" ? "facebook" : "line",
      }))
      .filter((bot) => bot.id);
    return state.allBots;
  }

  async function loadGroupsForSenderBot(botId, options = {}) {
    const normalizedId = typeof botId === "string" ? botId.trim() : "";
    if (!normalizedId) {
      renderGroupSelect([]);
      return [];
    }

    const force = options.force === true;
    if (!force && state.groupsBySenderBot.has(normalizedId)) {
      const cached = state.groupsBySenderBot.get(normalizedId) || [];
      renderGroupSelect(cached);
      return cached;
    }

    renderGroupSelect(null);
    const data = await fetchJson(`/admin/api/line-bots/${normalizedId}/groups`);
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    state.groupsBySenderBot.set(normalizedId, groups);
    renderGroupSelect(groups);
    return groups;
  }

  async function loadGroupsForTelegramBot(botId, options = {}) {
    const normalizedId = typeof botId === "string" ? botId.trim() : "";
    if (!normalizedId) {
      renderTelegramGroupSelect([]);
      return [];
    }

    const force = options.force === true;
    if (!force && state.telegramGroupsByBot.has(normalizedId)) {
      const cached = state.telegramGroupsByBot.get(normalizedId) || [];
      renderTelegramGroupSelect(cached);
      return cached;
    }

    renderTelegramGroupSelect(null);
    const data = await fetchJson(
      `/admin/api/telegram-notification-bots/${normalizedId}/groups`,
    );
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    state.telegramGroupsByBot.set(normalizedId, groups);
    renderTelegramGroupSelect(groups);
    return groups;
  }

  function renderGroupSelect(groups) {
    if (!els.groupSelect) return;
    const escapeHtml = getEscapeHtml();

    if (groups === null) {
      els.groupSelect.innerHTML = '<option value="">กำลังโหลดกลุ่ม...</option>';
      els.groupSelect.disabled = true;
      return;
    }

    els.groupSelect.disabled = false;
    if (!Array.isArray(groups) || groups.length === 0) {
      els.groupSelect.innerHTML =
        '<option value="">ไม่พบกลุ่ม (เชิญบอทเข้ากลุ่ม แล้วพิมพ์ 1 ข้อความ)</option>';
      return;
    }

    els.groupSelect.innerHTML = [
      '<option value="">เลือกกลุ่ม/ห้อง</option>',
      ...groups.map((group) => {
        const id = group.groupId || "";
        const name = group.groupName ? `${group.groupName}` : `${id.slice(-10)}`;
        const tag = group.sourceType === "room" ? "ห้อง" : "กลุ่ม";
        return `<option value="${escapeHtml(id)}">${escapeHtml(`${tag}: ${name}`)}</option>`;
      }),
    ].join("");
  }

  function renderTelegramGroupSelect(groups) {
    if (!els.telegramGroupSelect) return;
    const escapeHtml = getEscapeHtml();

    if (groups === null) {
      els.telegramGroupSelect.innerHTML =
        '<option value="">กำลังโหลดกลุ่ม Telegram...</option>';
      els.telegramGroupSelect.disabled = true;
      return;
    }

    els.telegramGroupSelect.disabled = false;
    if (!Array.isArray(groups) || groups.length === 0) {
      els.telegramGroupSelect.innerHTML =
        '<option value="">ไม่พบกลุ่ม (เพิ่มบอทเข้ากลุ่มและส่งข้อความ 1 ครั้ง)</option>';
      return;
    }

    els.telegramGroupSelect.innerHTML = [
      '<option value="">เลือกกลุ่ม Telegram</option>',
      ...groups.map((group) => {
        const id =
          typeof group?.chatId === "string"
            ? group.chatId
            : group?.chatId !== undefined
              ? String(group.chatId)
              : "";
        const title =
          (typeof group?.chatTitle === "string" && group.chatTitle.trim()) ||
          (typeof group?.title === "string" && group.title.trim()) ||
          `chat ${id}`;
        const type =
          (typeof group?.chatType === "string" && group.chatType.trim()) || "group";
        return `<option value="${escapeHtml(id)}">${escapeHtml(`${title} (${type})`)}</option>`;
      }),
    ].join("");
  }

  async function refresh() {
    await Promise.all([loadChannels(), loadTelegramBots()]);
  }

  async function loadChannels() {
    if (!els.channelsList) return;
    els.channelsList.innerHTML =
      '<div class="text-center p-3 text-muted-v2">กำลังโหลดช่องทางแจ้งเตือน...</div>';

    try {
      const data = await fetchJson("/admin/api/notification-channels");
      state.channels = Array.isArray(data?.channels) ? data.channels : [];
      renderChannelsList();
    } catch (err) {
      console.error("[Notifications] Load channels error:", err);
      els.channelsList.innerHTML =
        '<div class="text-danger p-3">โหลดข้อมูลไม่สำเร็จ</div>';
    }
  }

  function renderChannelsList() {
    if (!els.channelsList) return;
    const escapeHtml = getEscapeHtml();

    if (!state.channels.length) {
      els.channelsList.innerHTML =
        '<div class="text-center p-4 text-muted-v2">ยังไม่มีช่องทางแจ้งเตือน</div>';
      return;
    }

    const summarizeSources = (channel) => {
      if (channel.receiveFromAllBots) return "รับจากทุกบอท";
      const sources = Array.isArray(channel.sources) ? channel.sources : [];
      if (!sources.length) return "ยังไม่ได้เลือกบอทต้นทาง";
      const lineCount = sources.filter((s) => s.platform === "line").length;
      const fbCount = sources.filter((s) => s.platform === "facebook").length;
      const parts = [];
      if (lineCount) parts.push(`LINE ${lineCount}`);
      if (fbCount) parts.push(`Facebook ${fbCount}`);
      return `เลือกบอทต้นทาง: ${parts.join(", ")}`;
    };

    const summarizeDelivery = (channel) => {
      const mode = channel.deliveryMode === "scheduled" ? "scheduled" : "realtime";
      if (mode === "realtime") return "เรียลไทม์";
      const times = Array.isArray(channel.summaryTimes) ? channel.summaryTimes : [];
      if (!times.length) return "สรุปตามเวลา: ยังไม่ตั้งเวลา";
      return `สรุปตามเวลา: ${times.join(", ")}`;
    };

    els.channelsList.innerHTML = state.channels
      .map((channel) => {
        const type = normalizeChannelType(channel?.type);
        const isTelegram = type === "telegram_group";
        const targetLabel = isTelegram
          ? channel.telegramChatTitle || channel.telegramChatId || "-"
          : channel.groupName || channel.groupId || "-";
        const senderLabel = isTelegram
          ? channel.telegramBotName || channel.telegramBotId || "-"
          : channel.senderBotName || channel.senderBotId || "-";
        const destinationLabel = isTelegram ? "Telegram" : "LINE";
        const statusBadge = channel.isActive
          ? '<span class="badge badge-default">Active</span>'
          : '<span class="badge badge-default" style="opacity:0.7;">Inactive</span>';
        const iconClass = isTelegram ? "telegram" : "notification";
        const icon = isTelegram ? "fab fa-telegram-plane" : "fas fa-bell";

        return `
          <div class="bot-item-compact">
            <div class="bot-channel ${escapeHtml(iconClass)}"><i class="${escapeHtml(icon)}"></i></div>
            <div class="bot-main">
              <div class="bot-header">
                <div class="bot-title">
                  <span class="bot-name">${escapeHtml(channel.name || "ช่องทางแจ้งเตือน")}</span>
                  ${statusBadge}
                </div>
              </div>
              <div class="bot-subtext">
                ปลายทาง: ${escapeHtml(destinationLabel)} • ส่งด้วย: ${escapeHtml(senderLabel)} • กลุ่ม: ${escapeHtml(targetLabel)}
                • ${escapeHtml(summarizeSources(channel))}
                • ${escapeHtml(summarizeDelivery(channel))}
              </div>
            </div>
            <div class="bot-actions-compact">
              <label class="toggle-switch mb-0">
                <input type="checkbox" data-action="toggle" data-id="${escapeHtml(
                  channel.id,
                )}" ${channel.isActive ? "checked" : ""}>
                <span class="toggle-slider"></span>
              </label>
              <div class="actions-stack">
                <button class="btn-ghost-sm" title="แก้ไข" data-action="edit" data-id="${escapeHtml(
                  channel.id,
                )}"><i class="fas fa-edit"></i></button>
                <button class="btn-ghost-sm" title="ทดสอบส่ง" data-action="test" data-id="${escapeHtml(
                  channel.id,
                )}"><i class="fas fa-paper-plane"></i></button>
                <button class="btn-ghost-sm text-danger" title="ลบ" data-action="delete" data-id="${escapeHtml(
                  channel.id,
                )}"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderTelegramBotsList() {
    if (!els.telegramBotsList) return;
    const escapeHtml = getEscapeHtml();
    const bots = Array.isArray(state.telegramBots) ? state.telegramBots : [];

    if (!bots.length) {
      els.telegramBotsList.innerHTML =
        '<div class="text-center p-4 text-muted-v2">ยังไม่มี Telegram Sender Bot</div>';
      return;
    }

    els.telegramBotsList.innerHTML = bots
      .map((bot) => {
        const statusText = bot.status || "active";
        const tokenHint = bot.tokenMasked || "(ซ่อน token)";
        return `
          <div class="bot-item-compact">
            <div class="bot-channel telegram"><i class="fab fa-telegram-plane"></i></div>
            <div class="bot-main">
              <div class="bot-header">
                <div class="bot-title">
                  <span class="bot-name">${escapeHtml(bot.name || "Telegram Bot")}</span>
                  <span class="badge badge-default">${escapeHtml(statusText)}</span>
                </div>
              </div>
              <div class="bot-subtext">
                สถานะ: ${bot.isActive ? "Active" : "Inactive"} • Token: ${escapeHtml(tokenHint)}
              </div>
            </div>
            <div class="bot-actions-compact">
              <label class="toggle-switch mb-0">
                <input type="checkbox" data-action="toggle" data-id="${escapeHtml(
                  bot.id,
                )}" ${bot.isActive ? "checked" : ""}>
                <span class="toggle-slider"></span>
              </label>
              <div class="actions-stack">
                <button class="btn-ghost-sm" title="แก้ไข" data-action="edit" data-id="${escapeHtml(
                  bot.id,
                )}"><i class="fas fa-edit"></i></button>
                <button class="btn-ghost-sm text-danger" title="ลบ" data-action="delete" data-id="${escapeHtml(
                  bot.id,
                )}"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function openCreateModal() {
    await openModalWithData({
      id: "",
      type: "line_group",
      name: "",
      senderBotId: "",
      groupId: "",
      telegramBotId: "",
      telegramChatId: "",
      receiveFromAllBots: true,
      sources: [],
      settings: {
        includeCustomer: true,
        includePhone: true,
        includeItemsCount: true,
        includeItemsDetail: true,
        includeAddress: true,
        includePaymentMethod: true,
        includeTotalAmount: true,
        includeOrderLink: false,
        slipOkEnabled: false,
        slipOkApiUrl: "",
        slipOkApiKey: "",
      },
      deliveryMode: "realtime",
      summaryTimes: [],
      isActive: true,
    });
  }

  async function openEditModal(channel) {
    await openModalWithData(channel);
  }

  function setModalTitle(isEdit) {
    if (!els.modalLabel) return;
    els.modalLabel.innerHTML = isEdit
      ? '<i class="fas fa-bell me-2"></i>แก้ไขช่องทางแจ้งเตือนออเดอร์'
      : '<i class="fas fa-bell me-2"></i>สร้างช่องทางแจ้งเตือนออเดอร์';
  }

  function syncSlipOkUI() {
    const isLine = selectedDestinationType() === "line_group";
    const enabled = isLine && els.slipOkEnabled?.checked === true;
    if (els.slipOkConfigBox) {
      els.slipOkConfigBox.classList.toggle("d-none", !enabled);
    }
  }

  function syncDestinationTypeUI() {
    const type = selectedDestinationType();
    const isLine = type === "line_group";

    els.lineTargetBox?.classList.toggle("d-none", !isLine);
    els.telegramTargetBox?.classList.toggle("d-none", isLine);
    els.slipOkSection?.classList.toggle("d-none", !isLine);

    if (!isLine && els.slipOkEnabled) {
      els.slipOkEnabled.checked = false;
      if (els.slipOkApiUrl) els.slipOkApiUrl.value = "";
      if (els.slipOkApiKey) els.slipOkApiKey.value = "";
    }

    syncSlipOkUI();
  }

  function syncDeliveryModeUI() {
    const scheduled = els.deliveryScheduled?.checked === true;
    if (els.summaryBox) {
      els.summaryBox.classList.toggle("d-none", !scheduled);
    }
  }

  function parseSummaryTimesInput(raw) {
    if (typeof raw !== "string") return [];
    return raw
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  async function openModalWithData(channel) {
    if (!els.modalEl || !state.modalInstance) return;

    const type = normalizeChannelType(channel?.type);
    setModalTitle(Boolean(channel?.id));

    els.channelId.value = channel?.id || "";
    els.channelName.value = channel?.name || "";
    els.isActive.checked = channel?.isActive !== false;

    if (els.destinationLine) {
      els.destinationLine.checked = type === "line_group";
    }
    if (els.destinationTelegram) {
      els.destinationTelegram.checked = type === "telegram_group";
    }

    els.includeCustomer.checked = channel?.settings?.includeCustomer !== false;
    if (els.includePhone) {
      els.includePhone.checked = channel?.settings?.includePhone !== false;
    }
    els.includeItemsCount.checked = channel?.settings?.includeItemsCount !== false;
    if (els.includeItemsDetail) {
      els.includeItemsDetail.checked =
        channel?.settings?.includeItemsDetail !== false;
    }
    if (els.includeAddress) {
      els.includeAddress.checked = channel?.settings?.includeAddress !== false;
    }
    if (els.includePaymentMethod) {
      els.includePaymentMethod.checked =
        channel?.settings?.includePaymentMethod !== false;
    }
    els.includeTotalAmount.checked =
      channel?.settings?.includeTotalAmount !== false;
    els.includeOrderLink.checked = channel?.settings?.includeOrderLink === true;

    if (els.slipOkEnabled) {
      els.slipOkEnabled.checked = channel?.settings?.slipOkEnabled === true;
    }
    if (els.slipOkApiUrl) {
      els.slipOkApiUrl.value = channel?.settings?.slipOkApiUrl || "";
    }
    if (els.slipOkApiKey) {
      els.slipOkApiKey.value = channel?.settings?.slipOkApiKey || "";
    }

    const deliveryMode =
      channel?.deliveryMode === "scheduled" ? "scheduled" : "realtime";
    if (els.deliveryRealtime) {
      els.deliveryRealtime.checked = deliveryMode === "realtime";
    }
    if (els.deliveryScheduled) {
      els.deliveryScheduled.checked = deliveryMode === "scheduled";
    }
    if (els.summaryTimesInput) {
      const summaryTimes = Array.isArray(channel?.summaryTimes)
        ? channel.summaryTimes
        : [];
      els.summaryTimesInput.value = summaryTimes.join(", ");
    }

    await Promise.all([ensureLineBots(), loadTelegramBots(), ensureAllBots()]);
    renderSenderBotSelect(channel?.senderBotId || "");
    renderTelegramBotSelect(channel?.telegramBotId || "");
    renderSourcesList();

    const lineSenderId = channel?.senderBotId || "";
    await loadGroupsForSenderBot(lineSenderId, { force: true });
    if (els.groupSelect) {
      els.groupSelect.value = channel?.groupId || "";
    }

    const telegramBotId = channel?.telegramBotId || "";
    await loadGroupsForTelegramBot(telegramBotId, { force: true });
    if (els.telegramGroupSelect) {
      els.telegramGroupSelect.value = channel?.telegramChatId || "";
    }

    if (channel?.receiveFromAllBots !== false) {
      els.receiveAll.checked = true;
      els.receiveSelected.checked = false;
    } else {
      els.receiveAll.checked = false;
      els.receiveSelected.checked = true;
      markSelectedSources(channel?.sources || []);
    }

    syncReceiveModeUI();
    syncDestinationTypeUI();
    syncDeliveryModeUI();

    state.modalInstance.show();
  }

  function renderSenderBotSelect(selectedId) {
    if (!els.senderBotSelect) return;
    const escapeHtml = getEscapeHtml();
    const bots = Array.isArray(state.lineBots) ? state.lineBots : [];

    const options = bots.map((bot) => {
      const isSelected = selectedId && bot.id === selectedId;
      const notifyDisabled = bot.notificationEnabled === false;
      const statusHint = bot.status === "inactive" ? " (ปิดแชท)" : "";
      const notifyHint = notifyDisabled ? " (ปิดแจ้งเตือน)" : "";
      const disabledAttr = notifyDisabled && !isSelected ? " disabled" : "";
      return `<option value="${escapeHtml(bot.id)}"${disabledAttr}>${escapeHtml(
        bot.name,
      )}${statusHint}${notifyHint}</option>`;
    });

    els.senderBotSelect.innerHTML = [
      '<option value="">เลือก LINE Bot</option>',
      ...options,
    ].join("");

    if (selectedId) {
      els.senderBotSelect.value = selectedId;
    }
  }

  function renderTelegramBotSelect(selectedId) {
    if (!els.telegramBotSelect) return;
    const escapeHtml = getEscapeHtml();
    const bots = Array.isArray(state.telegramBots) ? state.telegramBots : [];

    const options = bots.map((bot) => {
      const isSelected = selectedId && bot.id === selectedId;
      const disabledAttr = bot.isActive || isSelected ? "" : " disabled";
      const statusHint = bot.isActive ? "" : " (inactive)";
      return `<option value="${escapeHtml(bot.id)}"${disabledAttr}>${escapeHtml(
        bot.name,
      )}${statusHint}</option>`;
    });

    els.telegramBotSelect.innerHTML = [
      '<option value="">เลือก Telegram Bot</option>',
      ...options,
    ].join("");

    if (selectedId) {
      els.telegramBotSelect.value = selectedId;
    }
  }

  function renderSourcesList() {
    if (!els.sourcesList) return;
    const escapeHtml = getEscapeHtml();

    const bots = Array.isArray(state.allBots) ? state.allBots : [];
    if (!bots.length) {
      els.sourcesList.innerHTML =
        '<div class="text-muted small">ไม่พบรายการบอท</div>';
      return;
    }

    els.sourcesList.innerHTML = bots
      .map((bot) => {
        const key = `${bot.platform}:${bot.id}`;
        const inputId = `notif_source_${bot.platform}_${bot.id}`;
        const icon =
          bot.platform === "facebook"
            ? '<i class="fab fa-facebook text-primary me-1"></i>'
            : '<i class="fab fa-line text-success me-1"></i>';

        return `
          <div class="form-check">
            <input class="form-check-input notif-source-check" type="checkbox"
                   id="${escapeHtml(inputId)}"
                   data-source-key="${escapeHtml(key)}"
                   data-platform="${escapeHtml(bot.platform)}"
                   data-bot-id="${escapeHtml(bot.id)}">
            <label class="form-check-label" for="${escapeHtml(inputId)}">
              ${icon}${escapeHtml(bot.name)}
            </label>
          </div>
        `;
      })
      .join("");
  }

  function syncReceiveModeUI() {
    const selected = els.receiveSelected?.checked === true;
    els.sourcesBox?.classList.toggle("d-none", !selected);
  }

  function markSelectedSources(sources) {
    const normalized = Array.isArray(sources) ? sources : [];
    const desired = new Set(
      normalized
        .map((s) => `${s.platform === "facebook" ? "facebook" : "line"}:${s.botId}`)
        .filter(Boolean),
    );

    els.sourcesList
      ?.querySelectorAll("input.notif-source-check")
      .forEach((input) => {
        const key = input.dataset.sourceKey;
        input.checked = desired.has(key);
      });
  }

  function readSelectedSources() {
    const sources = [];
    els.sourcesList
      ?.querySelectorAll("input.notif-source-check:checked")
      .forEach((input) => {
        const platform = input.dataset.platform || "line";
        const botId = input.dataset.botId || "";
        if (!botId) return;
        sources.push({ platform, botId });
      });
    return sources;
  }

  async function saveChannel() {
    const id = els.channelId?.value || "";
    const type = selectedDestinationType();
    const name = els.channelName?.value?.trim?.() || "";

    const senderBotId = els.senderBotSelect?.value || "";
    const groupId = els.groupSelect?.value || "";
    const telegramBotId = els.telegramBotSelect?.value || "";
    const telegramChatId = els.telegramGroupSelect?.value || "";

    if (!name) {
      toast("กรุณากรอกชื่อช่องทาง", "danger");
      return;
    }

    if (type === "line_group") {
      if (!senderBotId || !groupId) {
        toast("กรุณาเลือก LINE Bot และกลุ่มปลายทาง", "danger");
        return;
      }
      const selectedBot = (state.lineBots || []).find((bot) => bot.id === senderBotId);
      if (selectedBot && selectedBot.notificationEnabled === false) {
        toast("บอทที่เลือกปิดการแจ้งเตือนอยู่ กรุณาเปิดแจ้งเตือนก่อน", "danger");
        return;
      }
    } else {
      if (!telegramBotId || !telegramChatId) {
        toast("กรุณาเลือก Telegram Bot และกลุ่มปลายทาง", "danger");
        return;
      }
    }

    const receiveFromAllBots = els.receiveAll?.checked === true;
    const sources = receiveFromAllBots ? [] : readSelectedSources();
    if (!receiveFromAllBots && sources.length === 0) {
      toast("กรุณาเลือกบอทต้นทางอย่างน้อย 1 รายการ", "danger");
      return;
    }

    const deliveryMode =
      els.deliveryScheduled?.checked === true ? "scheduled" : "realtime";
    const summaryTimes = parseSummaryTimesInput(els.summaryTimesInput?.value || "");
    if (deliveryMode === "scheduled" && summaryTimes.length === 0) {
      toast("กรุณาระบุเวลาสรุปอย่างน้อย 1 เวลา", "danger");
      return;
    }

    const slipOkEnabled =
      type === "line_group" && els.slipOkEnabled?.checked === true;
    const slipOkApiUrl = type === "line_group" ? els.slipOkApiUrl?.value?.trim?.() || "" : "";
    const slipOkApiKey = type === "line_group" ? els.slipOkApiKey?.value?.trim?.() || "" : "";

    if (slipOkEnabled && (!slipOkApiUrl || !slipOkApiKey)) {
      toast("กรุณากรอก SlipOK API URL และ API Key ให้ครบถ้วน", "danger");
      return;
    }

    const payload = {
      type,
      name,
      receiveFromAllBots,
      sources,
      settings: {
        includeCustomer: els.includeCustomer?.checked === true,
        includePhone: els.includePhone?.checked === true,
        includeItemsCount: els.includeItemsCount?.checked === true,
        includeItemsDetail: els.includeItemsDetail?.checked === true,
        includeAddress: els.includeAddress?.checked === true,
        includePaymentMethod: els.includePaymentMethod?.checked === true,
        includeTotalAmount: els.includeTotalAmount?.checked === true,
        includeOrderLink: els.includeOrderLink?.checked === true,
        slipOkEnabled,
        slipOkApiUrl,
        slipOkApiKey,
      },
      deliveryMode,
      summaryTimes,
      isActive: els.isActive?.checked === true,
    };

    if (type === "line_group") {
      payload.senderBotId = senderBotId;
      payload.groupId = groupId;
    } else {
      payload.telegramBotId = telegramBotId;
      payload.telegramChatId = telegramChatId;
    }

    try {
      if (els.saveBtn) {
        els.saveBtn.disabled = true;
      }

      const url = id
        ? `/admin/api/notification-channels/${encodeURIComponent(id)}`
        : "/admin/api/notification-channels";
      const method = id ? "PUT" : "POST";

      const data = await fetchJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!data?.success) {
        toast(data?.error || "บันทึกไม่สำเร็จ", "danger");
        return;
      }

      state.modalInstance?.hide();
      toast("บันทึกช่องทางแจ้งเตือนเรียบร้อยแล้ว", "success");
      await refresh();
    } catch (err) {
      console.error("[Notifications] Save error:", err);
      toast(err?.message || "บันทึกไม่สำเร็จ", "danger");
    } finally {
      if (els.saveBtn) els.saveBtn.disabled = false;
    }
  }

  async function toggleChannel(channelId, isActive) {
    try {
      await fetchJson(
        `/admin/api/notification-channels/${encodeURIComponent(channelId)}/toggle`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive }),
        },
      );
      toast(isActive ? "เปิดใช้งานช่องทางแล้ว" : "ปิดใช้งานช่องทางแล้ว", "success");
    } catch (err) {
      console.error("[Notifications] Toggle error:", err);
      toast("ไม่สามารถอัปเดตสถานะได้", "danger");
      await refresh();
    }
  }

  async function testChannel(channelId) {
    try {
      const ok = confirm("ต้องการทดสอบส่งแจ้งเตือนไปยังช่องทางนี้หรือไม่?");
      if (!ok) return;
      await fetchJson(
        `/admin/api/notification-channels/${encodeURIComponent(channelId)}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      toast("ทดสอบส่งสำเร็จ", "success");
    } catch (err) {
      console.error("[Notifications] Test error:", err);
      toast(err?.message || "ทดสอบส่งไม่สำเร็จ", "danger");
    }
  }

  async function deleteChannel(channelId) {
    const ok = confirm("ต้องการลบช่องทางนี้หรือไม่?");
    if (!ok) return;

    try {
      await fetchJson(`/admin/api/notification-channels/${encodeURIComponent(channelId)}`, {
        method: "DELETE",
      });
      toast("ลบช่องทางเรียบร้อยแล้ว", "success");
      await refresh();
    } catch (err) {
      console.error("[Notifications] Delete error:", err);
      toast(err?.message || "ลบไม่สำเร็จ", "danger");
    }
  }

  function openCreateTelegramBotModal() {
    if (!state.telegramBotModalInstance) return;

    if (els.telegramBotId) els.telegramBotId.value = "";
    if (els.telegramBotName) els.telegramBotName.value = "";
    if (els.telegramBotToken) {
      els.telegramBotToken.value = "";
      els.telegramBotToken.placeholder = "123456:ABCDEF...";
    }
    if (els.telegramBotStatus) els.telegramBotStatus.value = "active";
    if (els.telegramBotIsActive) els.telegramBotIsActive.checked = true;
    if (els.telegramBotDeleteBtn) els.telegramBotDeleteBtn.classList.add("d-none");
    if (els.telegramBotModalLabel) {
      els.telegramBotModalLabel.innerHTML =
        '<i class="fab fa-telegram-plane me-2"></i>เพิ่ม Telegram Sender Bot';
    }

    state.telegramBotModalInstance.show();
  }

  function openEditTelegramBotModal(bot) {
    if (!state.telegramBotModalInstance || !bot) return;

    if (els.telegramBotId) els.telegramBotId.value = bot.id || "";
    if (els.telegramBotName) els.telegramBotName.value = bot.name || "";
    if (els.telegramBotToken) {
      els.telegramBotToken.value = bot.botToken || "";
      els.telegramBotToken.placeholder = bot.botToken
        ? "123456:ABCDEF..."
        : "เว้นว่างหากไม่เปลี่ยน token";
    }
    if (els.telegramBotStatus) {
      els.telegramBotStatus.value = bot.status === "inactive" ? "inactive" : "active";
    }
    if (els.telegramBotIsActive) {
      els.telegramBotIsActive.checked = bot.isActive !== false;
    }
    if (els.telegramBotDeleteBtn) els.telegramBotDeleteBtn.classList.remove("d-none");
    if (els.telegramBotModalLabel) {
      els.telegramBotModalLabel.innerHTML =
        '<i class="fab fa-telegram-plane me-2"></i>แก้ไข Telegram Sender Bot';
    }

    state.telegramBotModalInstance.show();
  }

  async function saveTelegramBot() {
    const id = els.telegramBotId?.value || "";
    const name = els.telegramBotName?.value?.trim?.() || "";
    const botToken = els.telegramBotToken?.value?.trim?.() || "";
    const status =
      els.telegramBotStatus?.value === "inactive" ? "inactive" : "active";
    const isActive = els.telegramBotIsActive?.checked !== false;

    if (!name) {
      toast("กรุณากรอกชื่อ Telegram Bot", "danger");
      return;
    }

    if (!id && !botToken) {
      toast("กรุณากรอก Telegram Bot Token", "danger");
      return;
    }

    const payload = { name, status, isActive };
    if (botToken) {
      payload.botToken = botToken;
    }
    const url = id
      ? `/admin/api/telegram-notification-bots/${encodeURIComponent(id)}`
      : "/admin/api/telegram-notification-bots";
    const method = id ? "PUT" : "POST";

    try {
      if (els.telegramBotSaveBtn) {
        els.telegramBotSaveBtn.disabled = true;
      }

      await fetchJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      state.telegramBotModalInstance?.hide();
      state.telegramGroupsByBot.clear();
      await loadTelegramBots({ force: true });
      renderTelegramBotSelect(els.telegramBotSelect?.value || "");
      toast("บันทึก Telegram Sender Bot เรียบร้อยแล้ว", "success");
    } catch (err) {
      console.error("[Notifications] Save telegram bot error:", err);
      toast(err?.message || "บันทึก Telegram Bot ไม่สำเร็จ", "danger");
    } finally {
      if (els.telegramBotSaveBtn) {
        els.telegramBotSaveBtn.disabled = false;
      }
    }
  }

  async function toggleTelegramBot(botId, isActive) {
    try {
      await fetchJson(
        `/admin/api/telegram-notification-bots/${encodeURIComponent(botId)}/toggle`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive }),
        },
      );
      state.telegramGroupsByBot.clear();
      await loadTelegramBots({ force: true });
      toast(isActive ? "เปิดใช้งาน Telegram Bot แล้ว" : "ปิดใช้งาน Telegram Bot แล้ว", "success");
    } catch (err) {
      console.error("[Notifications] Toggle telegram bot error:", err);
      toast(err?.message || "ไม่สามารถอัปเดตสถานะ Telegram Bot ได้", "danger");
      await loadTelegramBots({ force: true });
    }
  }

  async function deleteTelegramBot(botId, options = {}) {
    const confirmed = confirm("ต้องการลบ Telegram Sender Bot นี้หรือไม่?");
    if (!confirmed) return;

    try {
      await fetchJson(
        `/admin/api/telegram-notification-bots/${encodeURIComponent(botId)}`,
        {
          method: "DELETE",
        },
      );

      if (options.fromModal) {
        state.telegramBotModalInstance?.hide();
      }

      state.telegramGroupsByBot.clear();
      await loadTelegramBots({ force: true });
      toast("ลบ Telegram Sender Bot เรียบร้อยแล้ว", "success");
    } catch (err) {
      console.error("[Notifications] Delete telegram bot error:", err);
      toast(err?.message || "ลบ Telegram Bot ไม่สำเร็จ", "danger");
    }
  }

  function init() {
    cacheElements();
    if (!els.channelsList && !els.telegramBotsList) return;
    initModal();
    bindEvents();

    refresh().catch((err) => {
      console.error("[Notifications] Init refresh error:", err);
    });

    window.notificationChannels = {
      refresh,
      refreshTelegramBots: () => loadTelegramBots({ force: true }),
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
