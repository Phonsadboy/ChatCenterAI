/**
 * Instruction Chat Editor — Frontend Logic
 * Premium ChatGPT-style UI with model selection, thinking display, tool cards
 */

(function () {
    "use strict";

    // ─── Config ─────────────────────────────────────────────────────────

    const MODELS = {
        "gpt-5.2": { label: "GPT-5.2", efforts: ["off", "low", "medium", "high", "max"], default: "off" },
        "gpt-5.2-codex": { label: "GPT-5.2 Codex", efforts: ["off", "low", "medium", "high", "max"], default: "off" },
        "gpt-5.1": { label: "GPT-5.1", efforts: ["off", "low", "medium", "high"], default: "off" },
        "gpt-5": { label: "GPT-5", efforts: ["low", "medium", "high"], default: "medium" },
    };

    // ─── State ──────────────────────────────────────────────────────────

    let state = {
        instructions: [],
        selectedId: null,
        selectedName: "",
        sessionId: null,
        model: "gpt-5.2",
        thinking: "off",
        history: [],
        totalTokens: 0,
        totalChanges: 0,
        sending: false,
    };

    // ─── DOM ────────────────────────────────────────────────────────────

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        sidebar: $("#icSidebar"),
        sidebarOverlay: $("#icSidebarOverlay"),
        toggleSidebar: $("#icToggleSidebar"),
        instructionList: $("#icInstructionList"),
        instructionSearch: $("#icInstructionSearch"),
        activeName: $("#icActiveName"),
        messages: $("#icMessages"),
        empty: $("#icEmpty"),
        inputArea: $("#icInputArea"),
        input: $("#icInput"),
        send: $("#icSend"),
        statusBar: $("#icStatusBar"),
        statusModel: $("#icStatusModel"),
        statusThinking: $("#icStatusThinking"),
        statusTokens: $("#icStatusTokens"),
        statusChanges: $("#icStatusChanges"),
        modelBtn: $("#icModelBtn"),
        modelLabel: $("#icModelLabel"),
        modelDropdown: $("#icModelDropdown"),
        thinkingLevels: $("#icThinkingLevels"),
        thinkingNote: $("#icThinkingNote"),
        quickActions: $("#icQuickActions"),
        newChat: $("#icNewChat"),
    };

    // ─── Init ───────────────────────────────────────────────────────────

    async function init() {
        await loadInstructions();
        setupEventListeners();
        updateThinkingUI();
    }

    // ─── API ────────────────────────────────────────────────────────────

    async function loadInstructions() {
        try {
            const res = await fetch("/api/instructions-v2");
            const data = await res.json();
            if (data.success) {
                state.instructions = data.instructions || [];
                renderInstructionList();
            }
        } catch (err) {
            console.error("Failed to load instructions:", err);
            dom.instructionList.innerHTML = '<div style="text-align:center; padding:24px; color:var(--ic-text-muted);">โหลดไม่สำเร็จ</div>';
        }
    }

    async function sendMessage(text) {
        if (!text.trim() || !state.selectedId || state.sending) return;

        state.sending = true;
        dom.send.disabled = true;
        dom.input.value = "";
        autoResize(dom.input);

        // Add user message
        appendMessage("user", text);
        state.history.push({ role: "user", content: text });

        // Prepare streaming AI message bubble
        const aiMsgEl = appendStreamingMessage();
        const contentEl = aiMsgEl.querySelector(".ic-msg-content");
        let fullContent = "";

        try {
            const response = await fetch("/api/instruction-chat/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instructionId: state.selectedId,
                    message: text,
                    model: state.model,
                    thinking: state.thinking,
                    history: state.history.slice(-20),
                    sessionId: state.sessionId,
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                contentEl.innerHTML = formatContent(`❌ Error: ${errData.error || response.statusText}`);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("event: ")) {
                        const event = line.substring(7);
                        continue; // event name captured, data follows
                    }
                    if (!line.startsWith("data: ")) continue;
                    const jsonStr = line.substring(6);
                    let data;
                    try { data = JSON.parse(jsonStr); } catch { continue; }

                    // Handle event based on preceding event name
                    if (data.sessionId) {
                        state.sessionId = data.sessionId;
                    } else if (data.text !== undefined) {
                        // Content chunk
                        fullContent += data.text;
                        contentEl.innerHTML = formatContent(fullContent);
                        scrollToBottom();
                    } else if (data.content && !data.text) {
                        // Thinking block
                        appendThinking(data.content);
                    } else if (data.tool) {
                        // Tool event
                        if (data.args) {
                            appendToolCard({ tool: data.tool, summary: "⏳ กำลังประมวลผล..." });
                        } else if (data.result) {
                            // Tool completed — update last tool card
                            const lastCard = dom.messages.querySelector(".ic-tool-card:last-of-type .ic-tool-card-body");
                            if (lastCard) lastCard.textContent = data.result;
                        }
                    } else if (data.toolsUsed) {
                        // Done event
                        if (data.usage) state.totalTokens += data.usage.total_tokens || 0;
                        if (data.changes) state.totalChanges += data.changes.length;
                        updateStatusBar();
                    } else if (data.error) {
                        fullContent += `\n❌ ${data.error}`;
                        contentEl.innerHTML = formatContent(fullContent);
                    }
                }
            }

            // Save to history
            state.history.push({ role: "assistant", content: fullContent });

            // Auto-save session
            saveSession();

        } catch (err) {
            contentEl.innerHTML = formatContent(`❌ เกิดข้อผิดพลาด: ${err.message}`);
        } finally {
            state.sending = false;
            dom.send.disabled = !dom.input.value.trim();
        }
    }

    function appendStreamingMessage() {
        const div = document.createElement("div");
        div.className = "ic-msg";
        div.innerHTML = `
      <div class="ic-msg-user">
        <div class="ic-msg-avatar ic-msg-avatar-ai"><i class="fas fa-robot"></i></div>
        <div class="ic-msg-body">
          <div class="ic-msg-role">AI Assistant</div>
          <div class="ic-msg-content"><div class="ic-typing"><span></span><span></span><span></span></div></div>
        </div>
      </div>
    `;
        dom.messages.appendChild(div);
        scrollToBottom();
        return div;
    }

    // ─── Session Persistence ────────────────────────────────────────────

    function generateSessionId() {
        return `ses_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
    }

    async function saveSession() {
        if (!state.sessionId || !state.selectedId) return;
        try {
            await fetch("/api/instruction-chat/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: state.sessionId,
                    instructionId: state.selectedId,
                    instructionName: state.selectedName,
                    history: state.history,
                    model: state.model,
                    thinking: state.thinking,
                    totalTokens: state.totalTokens,
                    totalChanges: state.totalChanges,
                }),
            });
        } catch (err) {
            console.warn("Failed to save session:", err);
        }
    }

    async function loadLatestSession(instructionId) {
        try {
            const res = await fetch(`/api/instruction-chat/sessions?instructionId=${instructionId}`);
            const data = await res.json();
            if (data.success && data.sessions && data.sessions.length > 0) {
                return data.sessions[0]; // Most recent
            }
        } catch (err) {
            console.warn("Failed to load sessions:", err);
        }
        return null;
    }

    // ─── Render ─────────────────────────────────────────────────────────

    function renderInstructionList(filter = "") {
        const filtered = state.instructions.filter(inst =>
            !filter || (inst.name || "").toLowerCase().includes(filter.toLowerCase())
        );

        if (!filtered.length) {
            dom.instructionList.innerHTML = '<div style="text-align:center; padding:24px; color:var(--ic-text-muted);">ไม่พบ instruction</div>';
            return;
        }

        dom.instructionList.innerHTML = filtered.map(inst => {
            const items = inst.dataItems || [];
            const tableCount = items.filter(i => i.type === "table").length;
            const textCount = items.filter(i => i.type === "text").length;
            const active = inst._id === state.selectedId ? "active" : "";

            return `
        <div class="ic-inst-item ${active}" data-id="${inst._id}" data-name="${escapeHtml(inst.name || '')}">
          <div class="ic-inst-name">${escapeHtml(inst.name || "ไม่มีชื่อ")}</div>
          <div class="ic-inst-meta">
            ${tableCount ? `<span class="ic-inst-badge">📊 ${tableCount} ตาราง</span>` : ""}
            ${textCount ? `<span class="ic-inst-badge">📝 ${textCount} ข้อความ</span>` : ""}
            ${!items.length ? '<span class="ic-inst-badge">ว่าง</span>' : ""}
          </div>
        </div>
      `;
        }).join("");
    }

    async function selectInstruction(id, name) {
        state.selectedId = id;
        state.selectedName = name;
        state.sessionId = generateSessionId();
        state.history = [];
        state.totalTokens = 0;
        state.totalChanges = 0;

        dom.activeName.textContent = name || "Untitled";
        dom.empty.style.display = "none";
        dom.inputArea.style.display = "block";
        dom.statusBar.style.display = "flex";
        dom.messages.innerHTML = "";

        // Try to load latest session
        const lastSession = await loadLatestSession(id);
        if (lastSession && lastSession.sessionId) {
            // Offer to resume
            appendMessage("ai", `สวัสดีครับ! 👋 เลือก **${escapeHtml(name)}** เรียบร้อยแล้ว\n\nพบ session ก่อนหน้า — สามารถแชทต่อได้เลย หรือกด "New Chat" เพื่อเริ่มใหม่`);
        } else {
            appendMessage("ai", `สวัสดีครับ! 👋 เลือก **${escapeHtml(name)}** เรียบร้อยแล้ว\n\nสามารถถามหรือสั่งงานได้เลย เช่น:\n• "ดูภาพรวมข้อมูล"\n• "ค้นหาสินค้า X"\n• "เปลี่ยนราคา Y เป็น Z"\n• "เพิ่มแถวใหม่"`);
        }

        renderInstructionList(dom.instructionSearch.value);
        updateStatusBar();

        // Close mobile sidebar
        dom.sidebar.classList.remove("open");
        dom.sidebarOverlay.classList.remove("show");
    }

    function appendMessage(role, content) {
        const isUser = role === "user";
        const div = document.createElement("div");
        div.className = "ic-msg";
        div.innerHTML = `
      <div class="ic-msg-user">
        <div class="ic-msg-avatar ${isUser ? "ic-msg-avatar-user" : "ic-msg-avatar-ai"}">
          <i class="fas ${isUser ? "fa-user" : "fa-robot"}"></i>
        </div>
        <div class="ic-msg-body">
          <div class="ic-msg-role">${isUser ? "คุณ" : "AI Assistant"}</div>
          <div class="ic-msg-content">${formatContent(content)}</div>
        </div>
      </div>
    `;
        dom.messages.appendChild(div);
        scrollToBottom();
    }

    function appendThinking(content, time) {
        const div = document.createElement("div");
        div.className = "ic-msg";
        div.innerHTML = `
      <div class="ic-msg-user">
        <div class="ic-msg-avatar ic-msg-avatar-ai"><i class="fas fa-robot"></i></div>
        <div class="ic-msg-body">
          <div class="ic-thinking-block">
            <div class="ic-thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">
              <span><i class="fas fa-lightbulb"></i> 💭 Thought${time ? ` for ${time}s` : ""}</span>
              <i class="fas fa-chevron-down"></i>
            </div>
            <div class="ic-thinking-body">${escapeHtml(content)}</div>
          </div>
        </div>
      </div>
    `;
        dom.messages.appendChild(div);
        scrollToBottom();
    }

    function appendToolCard(tool) {
        const type = getToolCardType(tool.tool);
        const icon = { search: "fa-search", edit: "fa-pen", add: "fa-plus", delete: "fa-trash" }[type] || "fa-wrench";

        const div = document.createElement("div");
        div.className = "ic-msg";
        div.innerHTML = `
      <div class="ic-msg-user">
        <div class="ic-msg-avatar ic-msg-avatar-ai"><i class="fas fa-robot"></i></div>
        <div class="ic-msg-body">
          <div class="ic-tool-card ${type}">
            <div class="ic-tool-card-header">
              <i class="fas ${icon}"></i>
              <span class="ic-tool-name">${tool.tool}</span>
              ${tool.resultCount !== undefined ? `<span style="margin-left:auto;">${tool.resultCount} results</span>` : ""}
            </div>
            <div class="ic-tool-card-body">
              ${tool.summary || ""}
              ${tool.result ? `<pre>${escapeHtml(typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2)).substring(0, 500)}</pre>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
        dom.messages.appendChild(div);
        scrollToBottom();
    }

    function getToolCardType(toolName) {
        if (!toolName) return "search";
        if (toolName.includes("search") || toolName.includes("get")) return "search";
        if (toolName.includes("update") || toolName.includes("rename")) return "edit";
        if (toolName.includes("add")) return "add";
        if (toolName.includes("delete")) return "delete";
        return "search";
    }

    let typingCounter = 0;
    function showTyping() {
        const id = `typing-${++typingCounter}`;
        const div = document.createElement("div");
        div.className = "ic-msg";
        div.id = id;
        div.innerHTML = `
      <div class="ic-msg-user">
        <div class="ic-msg-avatar ic-msg-avatar-ai"><i class="fas fa-robot"></i></div>
        <div class="ic-msg-body">
          <div class="ic-typing"><span></span><span></span><span></span></div>
        </div>
      </div>
    `;
        dom.messages.appendChild(div);
        scrollToBottom();
        return id;
    }

    function removeTyping(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function updateStatusBar() {
        dom.statusModel.textContent = MODELS[state.model]?.label || state.model;
        dom.statusThinking.textContent = state.thinking.charAt(0).toUpperCase() + state.thinking.slice(1);
        dom.statusTokens.textContent = state.totalTokens.toLocaleString();
        dom.statusChanges.textContent = state.totalChanges;
    }

    function updateThinkingUI() {
        const modelConfig = MODELS[state.model];
        if (!modelConfig) return;

        const buttons = dom.thinkingLevels.querySelectorAll(".ic-thinking-btn");
        buttons.forEach(btn => {
            const level = btn.dataset.level;
            const supported = modelConfig.efforts.includes(level);
            btn.disabled = !supported;
            btn.classList.toggle("active", level === state.thinking);
        });

        // Show notes
        const notes = [];
        if (!modelConfig.efforts.includes("max")) notes.push("โมเดลนี้ไม่รองรับ Max (xhigh)");
        if (!modelConfig.efforts.includes("off")) notes.push("โมเดลนี้ไม่รองรับ Off");
        dom.thinkingNote.textContent = notes.join(" • ");

        // If current thinking is not supported, reset to default
        if (!modelConfig.efforts.includes(state.thinking)) {
            state.thinking = modelConfig.default;
            updateThinkingUI();
        }

        updateStatusBar();
    }

    // ─── Event Listeners ────────────────────────────────────────────────

    function setupEventListeners() {
        // Sidebar toggle
        dom.toggleSidebar.addEventListener("click", () => {
            dom.sidebar.classList.toggle("open");
            dom.sidebarOverlay.classList.toggle("show");
        });
        dom.sidebarOverlay.addEventListener("click", () => {
            dom.sidebar.classList.remove("open");
            dom.sidebarOverlay.classList.remove("show");
        });

        // Instruction selection
        dom.instructionList.addEventListener("click", (e) => {
            const item = e.target.closest(".ic-inst-item");
            if (item) selectInstruction(item.dataset.id, item.dataset.name);
        });

        // Search
        dom.instructionSearch.addEventListener("input", (e) => {
            renderInstructionList(e.target.value);
        });

        // Send message
        dom.send.addEventListener("click", () => sendMessage(dom.input.value));
        dom.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(dom.input.value);
            }
        });
        dom.input.addEventListener("input", () => {
            dom.send.disabled = !dom.input.value.trim() || state.sending;
            autoResize(dom.input);
        });

        // Model dropdown
        dom.modelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dom.modelDropdown.classList.toggle("show");
        });
        document.addEventListener("click", (e) => {
            if (!dom.modelDropdown.contains(e.target) && !dom.modelBtn.contains(e.target)) {
                dom.modelDropdown.classList.remove("show");
            }
        });

        // Model selection
        $$(".ic-model-option").forEach(opt => {
            opt.addEventListener("click", () => {
                state.model = opt.dataset.model;
                dom.modelLabel.textContent = MODELS[state.model]?.label || state.model;
                $$(".ic-model-option").forEach(o => o.classList.remove("active"));
                opt.classList.add("active");
                updateThinkingUI();
            });
        });

        // Thinking level
        dom.thinkingLevels.addEventListener("click", (e) => {
            const btn = e.target.closest(".ic-thinking-btn");
            if (!btn || btn.disabled) return;
            state.thinking = btn.dataset.level;
            updateThinkingUI();
        });

        // Quick actions
        dom.quickActions.addEventListener("click", (e) => {
            const chip = e.target.closest(".ic-chip");
            if (!chip) return;
            const prompt = chip.dataset.prompt;
            dom.input.value = prompt;
            dom.input.focus();
            dom.send.disabled = false;
            autoResize(dom.input);
        });

        // New chat
        dom.newChat.addEventListener("click", () => {
            if (!state.selectedId) return;
            state.sessionId = generateSessionId();
            state.history = [];
            state.totalTokens = 0;
            state.totalChanges = 0;
            dom.messages.innerHTML = "";
            appendMessage("ai", `แชทใหม่เริ่มแล้ว! 🔄 เลือก **${escapeHtml(state.selectedName)}** อยู่ สั่งงานได้เลย`);
            updateStatusBar();
        });
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatContent(text) {
        // Simple markdown-like formatting
        return escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n/g, "<br>");
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            dom.messages.scrollTop = dom.messages.scrollHeight;
        });
    }

    function autoResize(textarea) {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }

    // ─── Start ──────────────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", init);
})();
