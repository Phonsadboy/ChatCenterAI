(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const state = {
    instructions: [],
    selectedId: null,
    selectedName: "",
    inventory: null,
    inventoryTab: "items",
    history: [],
    sessionId: null,
    sending: false,
    pendingImages: [],
    currentBatch: null,
    totalTokens: 0,
    totalChanges: 0,
  };

  const el = {
    app: $("#ai2App"),
    instructionList: $("#ai2InstructionList"),
    instructionSearch: $("#ai2InstructionSearch"),
    createRetail: $("#ai2CreateRetail"),
    toggleSidebar: $("#ai2ToggleSidebar"),
    activeName: $("#ai2ActiveName"),
    statusLine: $("#ai2StatusLine"),
    messages: $("#ai2Messages"),
    empty: $("#ai2Empty"),
    input: $("#ai2Input"),
    send: $("#ai2Send"),
    attach: $("#ai2Attach"),
    fileInput: $("#ai2FileInput"),
    imagePreview: $("#ai2ImagePreview"),
    runStatus: $("#ai2RunStatus"),
    model: $("#ai2ModelSelect"),
    thinking: $("#ai2ThinkingSelect"),
    newChat: $("#ai2NewChat"),
    refreshInventory: $("#ai2RefreshInventory"),
    inventorySubtitle: $("#ai2InventorySubtitle"),
    inventoryTabs: $("#ai2InventoryTabs"),
    inventoryBody: $("#ai2InventoryBody"),
    batchModal: $("#ai2BatchModal"),
    batchSubtitle: $("#ai2BatchSubtitle"),
    batchWarnings: $("#ai2BatchWarnings"),
    batchChanges: $("#ai2BatchChanges"),
    closeBatch: $("#ai2CloseBatch"),
    approveBatch: $("#ai2ApproveBatch"),
    rejectBatch: $("#ai2RejectBatch"),
    reviseBatch: $("#ai2ReviseBatch"),
    rejectReason: $("#ai2RejectReason"),
  };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const compactJson = (value) => {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? "");
    }
  };

  function setRunStatus(text) {
    el.runStatus.textContent = text || "";
  }

  function updateSendState() {
    const hasInstruction = !!state.selectedId;
    const hasInput = !!el.input.value.trim() || state.pendingImages.length > 0;
    el.input.disabled = !hasInstruction || state.sending;
    el.attach.disabled = !hasInstruction || state.sending;
    el.send.disabled = !hasInstruction || !hasInput || state.sending;
    el.refreshInventory.disabled = !hasInstruction;
  }

  function autoResizeInput() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(220, Math.max(40, el.input.scrollHeight)) + "px";
    updateSendState();
  }

  async function loadInstructions() {
    try {
      const res = await fetch("/api/instructions-v2");
      const data = await res.json();
      state.instructions = data.instructions || [];
      renderInstructionList();
    } catch (error) {
      el.instructionList.innerHTML = `<div class="ai2-loading">โหลดไม่สำเร็จ</div>`;
    }
  }

  async function createRetailInstruction() {
    const name = window.prompt("ชื่อ Instruction ใหม่", "Retail Instruction");
    if (!name) return;
    try {
      setRunStatus("กำลังสร้าง retail template...");
      const res = await fetch("/api/instruction-ai2/instructions/retail-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "สร้างไม่สำเร็จ");
      await loadInstructions();
      const instruction = data.instruction;
      await selectInstruction(instruction._id, instruction.name);
      appendMessage("assistant", "สร้าง Retail Starter Template แล้ว มีบทบาท, สินค้า, และ FAQ/สถานการณ์เริ่มต้น");
      setRunStatus("สร้างสำเร็จ");
    } catch (error) {
      appendMessage("assistant", `สร้าง template ไม่สำเร็จ: ${error.message}`);
      setRunStatus("สร้างไม่สำเร็จ");
    }
  }

  function renderInstructionList(filter = "") {
    const q = filter.trim().toLowerCase();
    const list = state.instructions.filter((inst) => {
      const text = `${inst.name || ""} ${inst.description || ""} ${inst.instructionId || ""}`.toLowerCase();
      return !q || text.includes(q);
    });
    if (!list.length) {
      el.instructionList.innerHTML = `<div class="ai2-loading">ไม่พบ instruction</div>`;
      return;
    }
    el.instructionList.innerHTML = list.map((inst) => {
      const id = inst._id || inst.id;
      return `
        <button class="ai2-instruction-item ${state.selectedId === id ? "active" : ""}" data-id="${escapeHtml(id)}" data-name="${escapeHtml(inst.name || "ไม่มีชื่อ")}">
          <strong>${escapeHtml(inst.name || "ไม่มีชื่อ")}</strong>
          <span>${escapeHtml(inst.description || inst.instructionId || id)}</span>
        </button>`;
    }).join("");
  }

  async function selectInstruction(id, name) {
    state.selectedId = id;
    state.selectedName = name || "ไม่มีชื่อ";
    state.history = [];
    state.sessionId = null;
    state.currentBatch = null;
    el.activeName.textContent = state.selectedName;
    el.statusLine.textContent = "AI2 active · ทุก write ต้องผ่าน batch preview";
    el.empty.hidden = false;
    el.messages.innerHTML = "";
    el.messages.appendChild(el.empty);
    renderInstructionList(el.instructionSearch.value);
    updateSendState();
    await Promise.all([loadInventory(), loadLatestSession()]);
  }

  async function loadInventory() {
    if (!state.selectedId) return;
    el.inventoryBody.innerHTML = `<div class="ai2-loading">กำลังโหลด inventory...</div>`;
    try {
      const res = await fetch(`/api/instruction-ai2/inventory/${encodeURIComponent(state.selectedId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "โหลด inventory ไม่สำเร็จ");
      state.inventory = data.inventory;
      el.inventorySubtitle.textContent = state.inventory.instruction?.name || state.selectedName;
      renderInventory();
    } catch (error) {
      el.inventoryBody.innerHTML = `<div class="ai2-muted">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderInventory() {
    const inv = state.inventory;
    if (!inv) return;
    if (state.inventoryTab === "items") {
      el.inventoryBody.innerHTML = (inv.dataItems || []).map((item) => `
        <div class="ai2-inv-card" data-item-id="${escapeHtml(item.itemId)}">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.type)} · ${escapeHtml(item.semanticRole)} · ${item.rowCount || 0} rows</small>
          <div>${(item.columns || []).slice(0, 6).map((col) => `<span class="ai2-pill">${escapeHtml(col)}</span>`).join("")}</div>
        </div>`).join("") || `<div class="ai2-muted">ยังไม่มี data item</div>`;
    } else if (state.inventoryTab === "pages") {
      el.inventoryBody.innerHTML = (inv.pages || []).map((page) => `
        <div class="ai2-inv-card">
          <strong>${escapeHtml(page.name)}</strong>
          <small>${escapeHtml(page.pageKey)}</small>
          <div>
            <span class="ai2-pill ${page.linkedToActiveInstruction ? "ok" : ""}">${page.linkedToActiveInstruction ? "linked" : "not linked"}</span>
            <span class="ai2-pill">${escapeHtml(page.aiModel || "no model")}</span>
          </div>
        </div>`).join("") || `<div class="ai2-muted">ยังไม่มีเพจ</div>`;
    } else if (state.inventoryTab === "images") {
      const warnings = inv.warnings || [];
      const warningHtml = warnings.length ? `<div class="ai2-batch-warnings">${warnings.map((w) => escapeHtml(w.message)).join("<br>")}</div>` : "";
      const assets = (inv.imageAssets || []).map((asset) => `
        <div class="ai2-inv-card">
          <strong>${escapeHtml(asset.label || "(no label)")}</strong>
          <small>${escapeHtml(asset.description || asset.assetId)}</small>
          <div>
            <span class="ai2-pill ${asset.duplicateLabel ? "warn" : "ok"}">${asset.duplicateLabel ? "duplicate" : "unique"}</span>
          </div>
        </div>`).join("");
      el.inventoryBody.innerHTML = warningHtml + (assets || `<div class="ai2-muted">ยังไม่มีรูป</div>`);
    } else {
      el.inventoryBody.innerHTML = (inv.versions || []).map((version) => `
        <div class="ai2-inv-card">
          <strong>v${escapeHtml(version.version)}</strong>
          <small>${escapeHtml(version.note || version.source || "")}</small>
        </div>`).join("") || `<div class="ai2-muted">ยังไม่มี version</div>`;
    }
  }

  async function loadLatestSession() {
    if (!state.selectedId) return;
    try {
      const res = await fetch(`/api/instruction-ai2/sessions?instructionId=${encodeURIComponent(state.selectedId)}`);
      const data = await res.json();
      const session = data.sessions && data.sessions[0];
      if (session) {
        state.sessionId = session.sessionId;
        state.history = Array.isArray(session.history) ? session.history : [];
        state.totalTokens = session.totalTokens || 0;
        state.totalChanges = session.totalChanges || 0;
        renderHistory();
      }
    } catch (_) { }
  }

  function renderHistory() {
    el.messages.innerHTML = "";
    if (!state.history.length) {
      el.messages.appendChild(el.empty);
      el.empty.hidden = false;
      return;
    }
    el.empty.hidden = true;
    state.history.forEach((msg) => appendMessage(msg.role, msg.content, false));
    scrollToBottom();
  }

  function appendMessage(role, content, save = true) {
    el.empty.hidden = true;
    if (el.empty.parentElement) el.empty.remove();
    const wrap = document.createElement("div");
    wrap.className = `ai2-msg ${role === "user" ? "user" : "assistant"}`;
    wrap.innerHTML = `<div class="ai2-bubble">${escapeHtml(content)}</div>`;
    el.messages.appendChild(wrap);
    if (save) state.history.push({ role, content });
    scrollToBottom();
  }

  function appendToolRun(text) {
    const div = document.createElement("div");
    div.className = "ai2-tool-run";
    div.textContent = text;
    el.messages.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  async function sendMessage(textOverride) {
    if (!state.selectedId || state.sending) return;
    const text = typeof textOverride === "string" ? textOverride : el.input.value;
    if (!text.trim() && !state.pendingImages.length) return;
    state.sending = true;
    updateSendState();
    appendMessage("user", text || `[แนบรูป ${state.pendingImages.length} รูป]`);
    const images = state.pendingImages.map((img) => ({ data: img.dataUrl, name: img.name }));
    state.pendingImages = [];
    renderImagePreview();
    el.input.value = "";
    autoResizeInput();

    let assistantBuffer = "";
    try {
      setRunStatus("กำลังประมวลผล...");
      const response = await fetch("/api/instruction-ai2/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionId: state.selectedId,
          message: text,
          model: el.model.value,
          thinking: el.thinking.value,
          history: state.history.slice(0, -1),
          sessionId: state.sessionId,
          images,
        }),
      });
      await readSse(response, {
        session: (data) => {
          state.sessionId = data.sessionId || state.sessionId;
        },
        status: (data) => {
          if (data.phase) setRunStatus(`${data.phase}${data.tool ? " · " + data.tool : ""}`);
        },
        tool_start: (data) => {
          appendToolRun(`กำลังใช้ tool: ${data.tool}`);
          highlightInventoryFromArgs(data.args || {});
        },
        tool_end: (data) => {
          appendToolRun(`tool เสร็จ: ${data.tool} · ${data.result || "ok"}`);
        },
        commentary_delta: (data) => {
          if (data.text) appendToolRun(data.text);
        },
        answer_delta: (data) => {
          assistantBuffer += data.text || "";
        },
        done: async (data) => {
          if (assistantBuffer.trim()) appendMessage("assistant", assistantBuffer.trim());
          state.totalTokens += data.usage?.total_tokens || 0;
          if (data.batch) {
            state.currentBatch = data.batch;
            state.totalChanges += Array.isArray(data.batch.changes) ? data.batch.changes.length : 0;
            openBatchModal(data.batch);
          }
          await saveSession();
          await loadInventory();
          setRunStatus("เสร็จแล้ว");
        },
        error: (data) => {
          appendMessage("assistant", data.error || "เกิดข้อผิดพลาด");
        },
      });
    } catch (error) {
      appendMessage("assistant", `เกิดข้อผิดพลาด: ${error.message}`);
    } finally {
      state.sending = false;
      updateSendState();
    }
  }

  async function readSse(response, handlers) {
    if (!response.ok || !response.body) {
      let message = "เชื่อมต่อ stream ไม่สำเร็จ";
      try {
        const data = await response.json();
        message = data.error || message;
      } catch (_) { }
      throw new Error(message);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf("\n\n");
      while (idx >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleSseEvent(raw, handlers);
        idx = buffer.indexOf("\n\n");
      }
    }
  }

  function handleSseEvent(raw, handlers) {
    const lines = raw.split("\n");
    let event = "message";
    let dataText = "";
    lines.forEach((line) => {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataText += line.slice(5).trim();
    });
    if (!dataText) return;
    let data = {};
    try { data = JSON.parse(dataText); } catch { data = { text: dataText }; }
    if (handlers[event]) handlers[event](data);
  }

  async function saveSession() {
    if (!state.sessionId || !state.selectedId) return;
    try {
      await fetch("/api/instruction-ai2/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          instructionId: state.selectedId,
          instructionName: state.selectedName,
          history: state.history,
          model: el.model.value,
          thinking: el.thinking.value,
          totalTokens: state.totalTokens,
          totalChanges: state.totalChanges,
        }),
      });
    } catch (_) { }
  }

  function highlightInventoryFromArgs(args) {
    const itemId = args && args.itemId;
    if (!itemId) return;
    document.querySelectorAll(".ai2-inv-card").forEach((card) => {
      card.classList.toggle("is-active", card.dataset.itemId === itemId);
    });
  }

  function openBatchModal(batch) {
    if (!batch) return;
    el.batchSubtitle.textContent = `${batch.changes?.length || 0} changes · batch ${batch.batchId}`;
    const warnings = [];
    (batch.changes || []).forEach((change) => {
      (change.warnings || []).forEach((warning) => warnings.push(warning.message || warning.type || "warning"));
    });
    el.batchWarnings.innerHTML = warnings.map(escapeHtml).join("<br>");
    el.batchChanges.innerHTML = (batch.changes || []).map((change, index) => `
      <div class="ai2-change">
        <div class="ai2-change-head">
          <strong>${index + 1}. ${escapeHtml(change.title || change.operation)}</strong>
          <span class="ai2-pill ${change.risk === "destructive" || change.risk === "global_runtime" ? "warn" : ""}">${escapeHtml(change.risk || "write")}</span>
        </div>
        <div class="ai2-diff">
          <pre>${escapeHtml(compactJson(change.before))}</pre>
          <pre>${escapeHtml(compactJson(change.after))}</pre>
        </div>
      </div>`).join("");
    el.rejectReason.value = "";
    el.batchModal.hidden = false;
  }

  function closeBatchModal() {
    el.batchModal.hidden = true;
  }

  async function approveBatch() {
    if (!state.currentBatch) return;
    setModalBusy(true);
    try {
      const res = await fetch(`/api/instruction-ai2/batches/${encodeURIComponent(state.currentBatch.batchId)}/commit`, { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        appendMessage("assistant", `ยัง commit ไม่ได้: ${escapeHtml((data.errors || []).map((e) => e.message || e.error).join(", ") || data.error || "blocked")}`);
        return;
      }
      appendMessage("assistant", `บันทึก batch แล้ว${data.versionSnapshot?.version ? ` · version ${data.versionSnapshot.version}` : ""}`);
      state.currentBatch = null;
      closeBatchModal();
      await Promise.all([loadInventory(), saveSession()]);
    } catch (error) {
      appendMessage("assistant", `commit ล้มเหลว: ${error.message}`);
    } finally {
      setModalBusy(false);
    }
  }

  async function rejectBatch(revise) {
    if (!state.currentBatch) return;
    setModalBusy(true);
    try {
      const reason = el.rejectReason.value.trim();
      const endpoint = revise ? "revise" : "reject";
      const res = await fetch(`/api/instruction-ai2/batches/${encodeURIComponent(state.currentBatch.batchId)}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "reject failed");
      const prompt = data.revisionPrompt;
      state.currentBatch = null;
      closeBatchModal();
      appendMessage("assistant", revise ? "ยกเลิก batch แล้ว กำลังให้ AI ปรับ proposal ใหม่" : "ยกเลิก batch แล้ว ไม่มีการบันทึกข้อมูล");
      if (revise && prompt) await sendMessage(prompt);
    } catch (error) {
      appendMessage("assistant", `reject ล้มเหลว: ${error.message}`);
    } finally {
      setModalBusy(false);
    }
  }

  function setModalBusy(busy) {
    el.approveBatch.disabled = busy;
    el.rejectBatch.disabled = busy;
    el.reviseBatch.disabled = busy;
  }

  function handleFiles(files) {
    Array.from(files || []).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.pendingImages.push({ name: file.name, dataUrl: reader.result });
        renderImagePreview();
        updateSendState();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderImagePreview() {
    if (!state.pendingImages.length) {
      el.imagePreview.hidden = true;
      el.imagePreview.innerHTML = "";
      return;
    }
    el.imagePreview.hidden = false;
    el.imagePreview.innerHTML = state.pendingImages.map((img, index) => `
      <div class="ai2-preview-thumb">
        <img src="${escapeHtml(img.dataUrl)}" alt="${escapeHtml(img.name)}">
        <button type="button" data-remove-image="${index}">×</button>
      </div>`).join("");
  }

  function setupEvents() {
    el.instructionSearch.addEventListener("input", (event) => renderInstructionList(event.target.value));
    el.createRetail.addEventListener("click", createRetailInstruction);
    el.instructionList.addEventListener("click", (event) => {
      const item = event.target.closest(".ai2-instruction-item");
      if (item) selectInstruction(item.dataset.id, item.dataset.name);
    });
    el.toggleSidebar.addEventListener("click", () => el.app.classList.toggle("sidebar-open"));
    el.input.addEventListener("input", autoResizeInput);
    el.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    el.send.addEventListener("click", () => sendMessage());
    el.attach.addEventListener("click", () => el.fileInput.click());
    el.fileInput.addEventListener("change", (event) => {
      handleFiles(event.target.files);
      event.target.value = "";
    });
    el.imagePreview.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-image]");
      if (!button) return;
      state.pendingImages.splice(Number(button.dataset.removeImage), 1);
      renderImagePreview();
      updateSendState();
    });
    el.newChat.addEventListener("click", () => {
      state.sessionId = null;
      state.history = [];
      state.currentBatch = null;
      renderHistory();
      updateSendState();
    });
    el.refreshInventory.addEventListener("click", loadInventory);
    el.inventoryTabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (!tab) return;
      state.inventoryTab = tab.dataset.tab;
      el.inventoryTabs.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button === tab));
      renderInventory();
    });
    el.closeBatch.addEventListener("click", closeBatchModal);
    el.approveBatch.addEventListener("click", approveBatch);
    el.rejectBatch.addEventListener("click", () => rejectBatch(false));
    el.reviseBatch.addEventListener("click", () => rejectBatch(true));
  }

  async function init() {
    const defaultModel = el.app.dataset.defaultModel || "gpt-5.4-mini";
    const defaultThinking = el.app.dataset.defaultThinking || "low";
    el.model.value = defaultModel;
    el.thinking.value = defaultThinking;
    setupEvents();
    updateSendState();
    await loadInstructions();
  }

  init();
})();
