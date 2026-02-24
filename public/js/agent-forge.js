(function () {
  const bootstrap = window.__AGENT_FORGE_BOOTSTRAP__ || { agents: [], managedPages: [] };

  const state = {
    agents: Array.isArray(bootstrap.agents) ? bootstrap.agents : [],
    managedPages: Array.isArray(bootstrap.managedPages) ? bootstrap.managedPages : [],
  };

  const dom = {
    managedPageSelector: document.getElementById("managedPageSelector"),
    createAgentForm: document.getElementById("createAgentForm"),
    newAgentName: document.getElementById("newAgentName"),
    newAgentMode: document.getElementById("newAgentMode"),
    newInstructionId: document.getElementById("newInstructionId"),
    newCustomerModel: document.getElementById("newCustomerModel"),
    clearCreateFormBtn: document.getElementById("clearCreateFormBtn"),
    agentsTableBody: document.getElementById("agentsTableBody"),
    healthCards: document.getElementById("healthCards"),
    refreshAgentsBtn: document.getElementById("refreshAgentsBtn"),
    agentCountLabel: document.getElementById("agentCountLabel"),
  };

  function showToast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message, "info");
      return;
    }
    alert(message);
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH");
  }

  function getSelectedPageKeys() {
    const checked = dom.managedPageSelector.querySelectorAll("input[type='checkbox']:checked");
    return Array.from(checked).map((input) => input.value);
  }

  function renderManagedPages() {
    if (!dom.managedPageSelector) return;

    if (!state.managedPages.length) {
      dom.managedPageSelector.innerHTML = "<div class='text-muted small'>ยังไม่พบเพจที่เชื่อมต่อ</div>";
      return;
    }

    dom.managedPageSelector.innerHTML = state.managedPages.map((page) => {
      const status = page.status || "unknown";
      const label = page.name || page.pageKey;
      return `
        <label class="managed-page-item">
          <input type="checkbox" value="${page.pageKey}">
          <span>${label}</span>
          <span class="text-muted small">(${status})</span>
        </label>
      `;
    }).join("");
  }

  function renderHealthCards() {
    if (!dom.healthCards) return;
    if (!state.agents.length) {
      dom.healthCards.innerHTML = "<div class='col-12'><div class='alert alert-light border'>ยังไม่มี agent</div></div>";
      return;
    }

    dom.healthCards.innerHTML = state.agents.map((agent) => {
      const health = agent.health || {};
      const latestRun = Array.isArray(agent.latestRuns) && agent.latestRuns.length > 0
        ? agent.latestRuns[0]
        : null;

      return `
        <div class="col-md-4">
          <div class="health-card">
            <div class="title d-flex justify-content-between align-items-center">
              <span>${agent.name || "Agent"}</span>
              <span class="mode-badge ${agent.mode}">${agent.mode || "-"}</span>
            </div>
            <div class="meta">Last run: ${formatDateTime(latestRun ? latestRun.createdAt : null)}</div>
            <div class="meta">Conversion Before: ${health.conversionRateBefore || 0}%</div>
            <div class="meta">Conversion After: ${health.conversionRateAfter || 0}%</div>
            <div class="meta">Lift: ${health.conversionLiftPct || 0}%</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAgentTable() {
    if (!dom.agentsTableBody) return;
    dom.agentCountLabel.textContent = `${state.agents.length} agents`;

    if (!state.agents.length) {
      dom.agentsTableBody.innerHTML = "<tr><td colspan='6' class='text-center text-muted py-4'>ยังไม่มี agent</td></tr>";
      return;
    }

    dom.agentsTableBody.innerHTML = state.agents.map((agent) => {
      const latestRun = Array.isArray(agent.latestRuns) && agent.latestRuns.length > 0
        ? agent.latestRuns[0]
        : null;
      const pageList = Array.isArray(agent.pageKeys) ? agent.pageKeys.join("<br>") : "-";
      const runLink = latestRun
        ? `<a href="/admin/agent-forge/runs/${latestRun._id}" class="btn btn-sm btn-outline-secondary">View Run</a>`
        : "";

      return `
        <tr>
          <td>
            <div class="fw-semibold">${agent.name || "Agent"}</div>
            <div class="small text-muted">${agent._id}</div>
          </td>
          <td><span class="mode-badge ${agent.mode}">${agent.mode || "-"}</span></td>
          <td>${pageList || "-"}</td>
          <td>${agent.customerDefaultModel || "-"}</td>
          <td>${latestRun ? `${latestRun.status} · ${formatDateTime(latestRun.createdAt)}` : "-"}</td>
          <td class="text-end">
            <div class="agent-actions">
              <button class="btn btn-sm btn-primary" data-action="run" data-agent-id="${agent._id}">Run</button>
              <button class="btn btn-sm btn-outline-primary" data-action="dry-run" data-agent-id="${agent._id}">Dry</button>
              <button class="btn btn-sm btn-outline-dark" data-action="toggle-mode" data-agent-id="${agent._id}" data-mode="${agent.mode}">Mode</button>
              ${runLink}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadAgents() {
    const response = await fetch("/api/agent-forge/agents?includeHealth=1");
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "load_agents_failed");
    }

    state.agents = Array.isArray(payload.agents) ? payload.agents : [];
    renderHealthCards();
    renderAgentTable();
  }

  async function createAgent(event) {
    event.preventDefault();
    const payload = {
      name: dom.newAgentName.value.trim(),
      mode: dom.newAgentMode.value,
      instructionId: dom.newInstructionId.value.trim() || null,
      customerDefaultModel: dom.newCustomerModel.value.trim() || "gpt-4.1",
      pageKeys: getSelectedPageKeys(),
    };

    const response = await fetch("/api/agent-forge/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "create_agent_failed");
    }

    showToast("สร้าง Agent สำเร็จ");
    dom.createAgentForm.reset();
    await loadAgents();
  }

  async function runAgent(agentId, dryRun) {
    const response = await fetch(`/api/agent-forge/agents/${agentId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "run_failed");
    }

    if (data.run && data.run._id) {
      window.location.href = `/admin/agent-forge/runs/${data.run._id}`;
      return;
    }

    await loadAgents();
  }

  async function toggleMode(agentId, currentMode) {
    const nextMode = currentMode === "ai-live-reply" ? "human-only" : "ai-live-reply";
    const response = await fetch(`/api/agent-forge/agents/${agentId}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: nextMode }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "toggle_mode_failed");
    }

    await loadAgents();
  }

  function handleTableAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const agentId = button.dataset.agentId;
    const mode = button.dataset.mode;

    if (!agentId) return;

    button.disabled = true;

    Promise.resolve().then(async () => {
      if (action === "run") {
        await runAgent(agentId, false);
      } else if (action === "dry-run") {
        await runAgent(agentId, true);
      } else if (action === "toggle-mode") {
        await toggleMode(agentId, mode);
      }
    }).catch((error) => {
      console.error(error);
      showToast(`ไม่สำเร็จ: ${error.message || "unknown_error"}`);
    }).finally(() => {
      button.disabled = false;
    });
  }

  function bindEvents() {
    dom.createAgentForm?.addEventListener("submit", (event) => {
      createAgent(event).catch((error) => {
        console.error(error);
        showToast(`สร้าง Agent ไม่สำเร็จ: ${error.message || "unknown_error"}`);
      });
    });

    dom.clearCreateFormBtn?.addEventListener("click", () => {
      dom.createAgentForm?.reset();
      dom.managedPageSelector
        ?.querySelectorAll("input[type='checkbox']")
        .forEach((input) => {
          input.checked = false;
        });
    });

    dom.refreshAgentsBtn?.addEventListener("click", () => {
      loadAgents().catch((error) => {
        console.error(error);
        showToast(`โหลดข้อมูลไม่สำเร็จ: ${error.message || "unknown_error"}`);
      });
    });

    dom.agentsTableBody?.addEventListener("click", handleTableAction);
  }

  function init() {
    renderManagedPages();
    bindEvents();

    loadAgents().catch((error) => {
      console.error(error);
      renderHealthCards();
      renderAgentTable();
      showToast(`โหลดข้อมูลไม่สำเร็จ: ${error.message || "unknown_error"}`);
    });
  }

  init();
})();
