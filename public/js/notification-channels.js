(function () {
  "use strict";

  const state = {
    channels: [],
    lineBots: null,
    allBots: null,
    groupsBySenderBot: new Map(),
    modalInstance: null,
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
        .replace(/"/g, "&quot;")
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

  function cacheElements() {
    els.channelsList = document.getElementById("notificationChannelsList");
    els.refreshBtn = document.getElementById("notificationsRefreshBtn");
    els.createBtn = document.getElementById("notificationsCreateBtn");

    els.modalEl = document.getElementById("notificationChannelModal");
    els.modalLabel = document.getElementById("notificationChannelModalLabel");
    els.form = document.getElementById("notificationChannelForm");
    els.channelId = document.getElementById("notificationChannelId");
    els.channelName = document.getElementById("notificationChannelName");
    els.senderBotSelect = document.getElementById("notificationChannelSenderBot");
    els.groupSelect = document.getElementById("notificationChannelGroup");
    els.refreshGroupsBtn = document.getElementById(
      "notificationChannelRefreshGroupsBtn",
    );

    els.receiveAll = document.getElementById("notificationReceiveAll");
    els.receiveSelected = document.getElementById("notificationReceiveSelected");
    els.sourcesBox = document.getElementById("notificationChannelSourcesBox");
    els.sourcesList = document.getElementById("notificationChannelSourcesList");

    els.includeCustomer = document.getElementById(
      "notificationSettingIncludeCustomer",
    );
    els.includeItemsCount = document.getElementById(
      "notificationSettingIncludeItemsCount",
    );
    els.includeTotalAmount = document.getElementById(
      "notificationSettingIncludeTotalAmount",
    );
    els.includeOrderLink = document.getElementById(
      "notificationSettingIncludeOrderLink",
    );
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

    els.senderBotSelect?.addEventListener("change", () => {
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

    document
      .querySelectorAll('input[name="notificationReceiveMode"]')
      .forEach((el) => {
        el.addEventListener("change", () => syncReceiveModeUI());
      });

    els.saveBtn?.addEventListener("click", () => saveChannel());
  }

  function initModal() {
    if (!els.modalEl) return;
    if (window.bootstrap?.Modal) {
      state.modalInstance = new window.bootstrap.Modal(els.modalEl);
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

  async function ensureLineBots() {
    if (Array.isArray(state.lineBots)) return state.lineBots;
    const bots = await fetchJson("/api/line-bots");
    const items = Array.isArray(bots) ? bots : [];
    state.lineBots = items.map((bot) => ({
      id: bot?._id?.toString?.() || String(bot?._id || ""),
      name: bot?.name || bot?.displayName || bot?.botName || "LINE Bot",
      status: bot?.status || null,
    }));
    return state.lineBots;
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
        return `<option value="${escapeHtml(id)}">${escapeHtml(
          `${tag}: ${name}`,
        )}</option>`;
      }),
    ].join("");
  }

  async function refresh() {
    await loadChannels();
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

    els.channelsList.innerHTML = state.channels
      .map((channel) => {
        const groupLabel = channel.groupName
          ? channel.groupName
          : channel.groupId || "-";
        const senderLabel = channel.senderBotName || channel.senderBotId || "-";
        const statusBadge = channel.isActive
          ? '<span class="badge badge-default">Active</span>'
          : '<span class="badge badge-default" style="opacity:0.7;">Inactive</span>';

        return `
          <div class="bot-item-compact">
            <div class="bot-channel notification"><i class="fas fa-bell"></i></div>
            <div class="bot-main">
              <div class="bot-header">
                <div class="bot-title">
                  <span class="bot-name">${escapeHtml(channel.name || "ช่องทางแจ้งเตือน")}</span>
                  ${statusBadge}
                </div>
              </div>
              <div class="bot-subtext">
                ส่งด้วย: ${escapeHtml(senderLabel)} • ปลายทาง: ${escapeHtml(groupLabel)} • ${escapeHtml(
          summarizeSources(channel),
        )}
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

  async function openCreateModal() {
    await openModalWithData({
      id: "",
      name: "",
      senderBotId: "",
      groupId: "",
      receiveFromAllBots: true,
      sources: [],
      settings: {
        includeCustomer: true,
        includeItemsCount: true,
        includeTotalAmount: true,
        includeOrderLink: false,
      },
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

  async function openModalWithData(channel) {
    if (!els.modalEl || !state.modalInstance) return;

    setModalTitle(Boolean(channel?.id));

    els.channelId.value = channel?.id || "";
    els.channelName.value = channel?.name || "";
    els.isActive.checked = channel?.isActive !== false;

    els.includeCustomer.checked = channel?.settings?.includeCustomer !== false;
    els.includeItemsCount.checked =
      channel?.settings?.includeItemsCount !== false;
    els.includeTotalAmount.checked =
      channel?.settings?.includeTotalAmount !== false;
    els.includeOrderLink.checked = channel?.settings?.includeOrderLink === true;

    await ensureLineBots();
    renderSenderBotSelect(channel?.senderBotId || "");

    await loadGroupsForSenderBot(els.senderBotSelect.value, { force: true });
    els.groupSelect.value = channel?.groupId || "";

    await ensureAllBots();
    renderSourcesList();

    if (channel?.receiveFromAllBots !== false) {
      els.receiveAll.checked = true;
      els.receiveSelected.checked = false;
    } else {
      els.receiveAll.checked = false;
      els.receiveSelected.checked = true;
      markSelectedSources(channel?.sources || []);
    }

    syncReceiveModeUI();

    state.modalInstance.show();
  }

  function renderSenderBotSelect(selectedId) {
    if (!els.senderBotSelect) return;
    const escapeHtml = getEscapeHtml();
    const bots = Array.isArray(state.lineBots) ? state.lineBots : [];
    const options = bots
      .filter((bot) => bot.status !== "inactive")
      .map(
        (bot) =>
          `<option value="${escapeHtml(bot.id)}">${escapeHtml(bot.name)}</option>`,
      );

    els.senderBotSelect.innerHTML = [
      '<option value="">เลือก LINE Bot</option>',
      ...options,
    ].join("");

    if (selectedId) {
      els.senderBotSelect.value = selectedId;
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
    const name = els.channelName?.value?.trim?.() || "";
    const senderBotId = els.senderBotSelect?.value || "";
    const groupId = els.groupSelect?.value || "";

    if (!name || !senderBotId || !groupId) {
      toast("กรุณากรอกข้อมูลให้ครบถ้วน", "danger");
      return;
    }

    const receiveFromAllBots = els.receiveAll?.checked === true;
    const sources = receiveFromAllBots ? [] : readSelectedSources();
    if (!receiveFromAllBots && sources.length === 0) {
      toast("กรุณาเลือกบอทต้นทางอย่างน้อย 1 รายการ", "danger");
      return;
    }

    const payload = {
      name,
      senderBotId,
      groupId,
      receiveFromAllBots,
      sources,
      settings: {
        includeCustomer: els.includeCustomer?.checked === true,
        includeItemsCount: els.includeItemsCount?.checked === true,
        includeTotalAmount: els.includeTotalAmount?.checked === true,
        includeOrderLink: els.includeOrderLink?.checked === true,
      },
      isActive: els.isActive?.checked === true,
    };

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
      const ok = confirm("ต้องการทดสอบส่งแจ้งเตือนไปยังกลุ่มนี้หรือไม่?");
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

  function init() {
    cacheElements();
    if (!els.channelsList) return;
    initModal();
    bindEvents();
    refresh().catch((err) => console.error("[Notifications] Init refresh error:", err));

    window.notificationChannels = {
      refresh,
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();

