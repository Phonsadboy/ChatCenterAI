/**
 * Instruction Chat Editor — Frontend Logic v2
 * Premium ChatGPT / Vercel style with SSE streaming, session persistence
 */

(function () {
    "use strict";

    // ─── Config ─────────────────────────────────────────────────────────

    const MODELS = {
        "gpt-5.2": { label: "GPT-5.2", efforts: ["off", "low", "medium", "high", "max"], default: "max" },
        "gpt-5.2-codex": { label: "GPT-5.2 Codex", efforts: ["off", "low", "medium", "high", "max"], default: "max" },
        "gpt-5.1": { label: "GPT-5.1", efforts: ["off", "low", "medium", "high"], default: "high" },
        "gpt-5": { label: "GPT-5", efforts: ["low", "medium", "high"], default: "high" },
    };

    // ─── State ──────────────────────────────────────────────────────────

    let state = {
        instructions: [],
        selectedId: null,
        selectedName: "",
        sessionId: null,
        model: "gpt-5.2",
        thinking: "max",
        history: [],
        totalTokens: 0,
        totalChanges: 0,
        sending: false,
        sidebarOpen: window.innerWidth >= 769,
        abortController: null,
    };

    // ─── DOM ────────────────────────────────────────────────────────────

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        sidebar: $("#icSidebar"),
        sidebarOverlay: $("#icSidebarOverlay"),
        sidebarClose: $("#icSidebarClose"),
        toggleSidebar: $("#icToggleSidebar"),
        newChatSidebar: $("#icNewChatSidebar"),
        instructionList: $("#icInstructionList"),
        instructionSearch: $("#icInstructionSearch"),
        sessionSection: $("#icSessionSection"),
        sessionList: $("#icSessionList"),
        activeName: $("#icActiveName"),
        topbarTitle: $("#icTopbarTitle"),
        messages: $("#icMessages"),
        empty: $("#icEmpty"),
        welcomeCards: $("#icWelcomeCards"),
        inputArea: $("#icInputArea"),
        inputWrapper: $("#icInputWrapper"),
        input: $("#icInput"),
        send: $("#icSend"),
        statusInfo: $("#icStatusInfo"),
        statusModel: $("#icStatusModel"),
        statusThinking: $("#icStatusThinking"),
        statusTokens: $("#icStatusTokens"),
        statusChanges: $("#icStatusChanges"),
        modelBtn: $("#icModelBtn"),
        modelLabel: $("#icModelLabel"),
        modelDropdown: $("#icModelDropdown"),
        thinkingLevels: $("#icThinkingLevels"),
        thinkingNote: $("#icThinkingNote"),
        newChat: $("#icNewChat"),
    };

    // ─── Init ───────────────────────────────────────────────────────────

    async function init() {
        await loadInstructions();
        setupEventListeners();
        updateThinkingUI();

        // Desktop: sidebar visible by default
        if (window.innerWidth >= 769) {
            state.sidebarOpen = true;
        }
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
            dom.instructionList.innerHTML = `
                <div class="ic-sidebar-loading">
                    <span style="color: var(--ic-danger);">โหลดไม่สำเร็จ</span>
                </div>`;
        }
    }

    async function sendMessage(text) {
        if (!text.trim() || !state.selectedId || state.sending) return;

        state.sending = true;
        updateSendButton();
        dom.input.value = "";
        autoResize(dom.input);

        // Hide welcome cards
        if (dom.empty) dom.empty.style.display = "none";

        // Add user message
        appendMessage("user", text);
        state.history.push({ role: "user", content: text });

        // Create streaming AI response container
        const aiMsg = appendStreamingMessage();
        const contentEl = aiMsg.querySelector(".ic-msg-content");
        let fullContent = "";

        // Set up abort controller
        state.abortController = new AbortController();

        try {
            const response = await fetch("/api/instruction-chat/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instructionId: state.selectedId,
                    message: text,
                    model: state.model,
                    thinking: state.thinking,
                    history: state.history,
                    sessionId: state.sessionId,
                }),
                signal: state.abortController.signal,
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                contentEl.innerHTML = formatContent(`❌ Error: ${errData.error || response.statusText}`);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let currentEventType = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    // Track SSE event type
                    if (line.startsWith("event: ")) {
                        currentEventType = line.substring(7).trim();
                        continue;
                    }
                    if (!line.startsWith("data: ")) continue;

                    const jsonStr = line.substring(6);
                    let data;
                    try { data = JSON.parse(jsonStr); } catch { continue; }

                    const body = aiMsg.querySelector(".ic-msg-body");

                    switch (currentEventType) {
                        case "session":
                            if (data.sessionId) state.sessionId = data.sessionId;
                            break;

                        case "thinking":
                            if (data.content && body) {
                                const thinkBlock = createThinkingBlock(data.content);
                                body.insertBefore(thinkBlock, contentEl);
                                scrollToBottom();
                            }
                            break;

                        case "content":
                            if (data.text !== undefined) {
                                fullContent += data.text;
                                contentEl.innerHTML = formatContent(fullContent);
                                scrollToBottom();
                            }
                            break;

                        case "tool_start":
                            if (data.tool && data.args && body) {
                                const toolCard = createToolCard({ tool: data.tool, summary: "⏳ กำลังประมวลผล..." });
                                body.insertBefore(toolCard, contentEl);
                                scrollToBottom();
                            }
                            break;

                        case "tool_end":
                            if (data.tool) {
                                const cards = aiMsg.querySelectorAll(".ic-tool-card");
                                const lastCard = cards[cards.length - 1];
                                if (lastCard) {
                                    const cardBody = lastCard.querySelector(".ic-tool-card-body");
                                    if (cardBody) {
                                        cardBody.textContent = data.summary || data.result || "✅";
                                    }
                                }
                            }
                            break;

                        case "done":
                            if (data.usage) state.totalTokens += data.usage.total_tokens || 0;
                            if (data.changes) state.totalChanges += data.changes.length;
                            if (data.assistantMessages) state._lastAssistantMessages = data.assistantMessages;
                            updateStatusBar();
                            break;

                        case "error":
                            if (data.error) {
                                fullContent += `\n❌ ${data.error}`;
                                contentEl.innerHTML = formatContent(fullContent);
                            }
                            break;

                        default:
                            // Fallback for unmatched event types
                            if (data.sessionId) {
                                state.sessionId = data.sessionId;
                            } else if (data.text !== undefined) {
                                fullContent += data.text;
                                contentEl.innerHTML = formatContent(fullContent);
                                scrollToBottom();
                            } else if (data.error) {
                                fullContent += `\n❌ ${data.error}`;
                                contentEl.innerHTML = formatContent(fullContent);
                            }
                            break;
                    }
                    currentEventType = ""; // Reset after processing
                }
            }

            // Save to history — use full tool messages if available
            if (fullContent) {
                const fullMsgs = state._lastAssistantMessages;
                if (fullMsgs && fullMsgs.length > 0) {
                    // Push all messages (assistant tool_calls + tool results + final assistant)
                    for (const m of fullMsgs) {
                        state.history.push(m);
                    }
                } else {
                    state.history.push({ role: "assistant", content: fullContent });
                }
                state._lastAssistantMessages = null;
            }

            // Auto-save session
            saveSession();

        } catch (err) {
            if (err.name === "AbortError") {
                contentEl.innerHTML += formatContent("\n\n⏹️ หยุดการตอบ");
            } else {
                contentEl.innerHTML = formatContent(`❌ เกิดข้อผิดพลาด: ${err.message}`);
            }
        } finally {
            state.sending = false;
            state.abortController = null;
            updateSendButton();
            // Remove typing indicator if still present
            const typingEl = contentEl.querySelector(".ic-typing");
            if (typingEl) typingEl.remove();
        }
    }

    function stopStreaming() {
        if (state.abortController) {
            state.abortController.abort();
        }
    }

    // ─── Render Elements ────────────────────────────────────────────────

    function appendStreamingMessage() {
        const div = document.createElement("div");
        div.className = "ic-msg ic-msg--ai";
        div.innerHTML = `
        <div class="ic-msg-row">
            <div class="ic-msg-avatar ic-msg-avatar-ai">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                </svg>
            </div>
            <div class="ic-msg-body">
                <div class="ic-msg-role">AI Assistant</div>
                <div class="ic-msg-content"><div class="ic-typing"><span></span><span></span><span></span></div></div>
            </div>
        </div>`;
        dom.messages.appendChild(div);
        scrollToBottom();
        return div;
    }

    function appendMessage(role, content) {
        const isUser = role === "user";
        const div = document.createElement("div");
        div.className = `ic-msg ${isUser ? "ic-msg--user" : "ic-msg--ai"}`;

        if (isUser) {
            div.innerHTML = `
            <div class="ic-msg-row">
                <div class="ic-msg-body">
                    <div class="ic-msg-content">${formatContent(content)}</div>
                </div>
            </div>`;
        } else {
            div.innerHTML = `
            <div class="ic-msg-row">
                <div class="ic-msg-avatar ic-msg-avatar-ai">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                </div>
                <div class="ic-msg-body">
                    <div class="ic-msg-role">AI Assistant</div>
                    <div class="ic-msg-content">${formatContent(content)}</div>
                </div>
            </div>`;
        }

        dom.messages.appendChild(div);
        scrollToBottom();
        return div;
    }

    function createThinkingBlock(content) {
        const block = document.createElement("div");
        block.className = "ic-thinking-block collapsed";
        const wordCount = content.split(/\s+/).length;
        const preview = content.length > 200 ? content.substring(0, 200) + "..." : content;
        block.innerHTML = `
        <div class="ic-thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="ic-thinking-icon"><i class="fas fa-lightbulb"></i> Thinking <span class="ic-thinking-meta">(${wordCount} words)</span></span>
            <i class="fas fa-chevron-down ic-chevron"></i>
        </div>
        <div class="ic-thinking-body">${escapeHtml(content)}</div>`;
        return block;
    }

    function createToolCard(tool) {
        const type = getToolCardType(tool.tool);
        const icons = {
            search: "fa-magnifying-glass",
            edit: "fa-pen",
            add: "fa-plus",
            delete: "fa-trash"
        };
        const icon = icons[type] || "fa-wrench";

        const card = document.createElement("div");
        card.className = `ic-tool-card ${type}`;
        card.innerHTML = `
        <div class="ic-tool-card-header">
            <div class="ic-tool-icon"><i class="fas ${icon}"></i></div>
            <span class="ic-tool-name">${tool.tool}</span>
        </div>
        <div class="ic-tool-card-body">${tool.summary || ""}</div>`;
        return card;
    }

    function getToolCardType(toolName) {
        if (!toolName) return "search";
        if (toolName.includes("search") || toolName.includes("get")) return "search";
        if (toolName.includes("update") || toolName.includes("rename")) return "edit";
        if (toolName.includes("add")) return "add";
        if (toolName.includes("delete")) return "delete";
        return "search";
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
                return data.sessions[0];
            }
        } catch (err) {
            console.warn("Failed to load sessions:", err);
        }
        return null;
    }

    // ─── Render Lists ───────────────────────────────────────────────────

    function renderInstructionList(filter = "") {
        const filtered = state.instructions.filter(inst =>
            !filter || (inst.name || "").toLowerCase().includes(filter.toLowerCase())
        );

        if (!filtered.length) {
            dom.instructionList.innerHTML = `
                <div class="ic-sidebar-loading">
                    <span>ไม่พบ instruction</span>
                </div>`;
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
            </div>`;
        }).join("");
    }

    async function selectInstruction(id, name) {
        state.selectedId = id;
        state.selectedName = name;
        state.sessionId = generateSessionId();
        state.history = [];
        state.totalTokens = 0;
        state.totalChanges = 0;

        // Update UI
        dom.activeName.textContent = name || "Untitled";
        dom.empty.style.display = "none";
        dom.input.disabled = false;
        dom.input.placeholder = `พิมพ์คำสั่ง... เช่น "ดูราคาสินค้า"`;
        dom.statusInfo.style.display = "inline-flex";
        dom.messages.innerHTML = "";

        // Try to load latest session and restore chat
        const lastSession = await loadLatestSession(id);
        if (lastSession && lastSession.sessionId && lastSession.history && lastSession.history.length > 0) {
            // Restore session state
            state.sessionId = lastSession.sessionId;
            state.history = lastSession.history;
            state.totalTokens = lastSession.totalTokens || 0;
            state.totalChanges = lastSession.totalChanges || 0;

            // Render old messages from history
            for (const msg of state.history) {
                if (msg.role === "user") {
                    appendMessage("user", msg.content);
                } else if (msg.role === "assistant" && msg.content && !msg.tool_calls) {
                    appendMessage("ai", msg.content);
                }
                // Skip tool_calls and tool result messages (visual only)
            }

            appendMessage("ai", `💬 เซสชันก่อนหน้า (${state.history.length} messages) — แชทต่อได้เลย หรือกด ✏️ เพื่อเริ่มใหม่`);
        } else {
            appendMessage("ai", `สวัสดีครับ! 👋 เลือก **${escapeHtml(name)}** เรียบร้อยแล้ว\n\nสามารถถามหรือสั่งงานได้เลย เช่น:\n• "ดูภาพรวมข้อมูล"\n• "ค้นหาสินค้า X"\n• "เปลี่ยนราคา Y เป็น Z"\n• "เพิ่มแถวใหม่"`);
        }

        // Show welcome cards as quick actions
        renderWelcomeCards(true);

        renderInstructionList(dom.instructionSearch.value);
        updateStatusBar();

        // Close mobile sidebar only
        if (window.innerWidth < 769) {
            dom.sidebar.classList.remove("open");
            dom.sidebarOverlay.classList.remove("show");
        }

        // Focus input
        setTimeout(() => dom.input.focus(), 100);
    }

    function renderWelcomeCards(show) {
        if (dom.welcomeCards) {
            dom.welcomeCards.style.display = show ? "none" : "grid"; // Cards inside welcome only
        }
    }

    // ─── Sidebar ────────────────────────────────────────────────────────

    function toggleSidebar() {
        if (window.innerWidth < 769) {
            // Mobile: toggle overlay sidebar
            const isOpen = dom.sidebar.classList.toggle("open");
            dom.sidebarOverlay.classList.toggle("show", isOpen);
        } else {
            // Desktop: toggle width
            dom.sidebar.classList.toggle("hidden");
        }
    }

    function openSidebar() {
        if (window.innerWidth < 769) {
            dom.sidebar.classList.add("open");
            dom.sidebarOverlay.classList.add("show");
        } else {
            dom.sidebar.classList.remove("hidden");
        }
    }

    function closeSidebar() {
        if (window.innerWidth < 769) {
            dom.sidebar.classList.remove("open");
            dom.sidebarOverlay.classList.remove("show");
        } else {
            dom.sidebar.classList.add("hidden");
        }
    }

    // ─── Status & UI Updates ────────────────────────────────────────────

    function updateStatusBar() {
        dom.statusModel.textContent = MODELS[state.model]?.label || state.model;
        dom.statusThinking.textContent = state.thinking.charAt(0).toUpperCase() + state.thinking.slice(1);
        dom.statusTokens.textContent = state.totalTokens.toLocaleString();
        dom.statusChanges.textContent = state.totalChanges;
    }

    function updateSendButton() {
        const hasText = dom.input.value.trim().length > 0;
        const hasInstruction = !!state.selectedId;

        if (state.sending) {
            // Show stop button
            dom.send.innerHTML = '<i class="fas fa-stop"></i>';
            dom.send.disabled = false;
            dom.send.title = "หยุด";
            dom.send.classList.add("ic-btn-stop-active");
        } else {
            dom.send.innerHTML = '<i class="fas fa-arrow-up"></i>';
            dom.send.disabled = !hasText || !hasInstruction;
            dom.send.title = "ส่ง (Enter)";
            dom.send.classList.remove("ic-btn-stop-active");
        }
    }

    function updateThinkingUI() {
        const modelConfig = MODELS[state.model];
        if (!modelConfig) return;

        const buttons = dom.thinkingLevels.querySelectorAll(".ic-think-btn");
        buttons.forEach(btn => {
            const level = btn.dataset.level;
            const supported = modelConfig.efforts.includes(level);
            btn.disabled = !supported;
            btn.classList.toggle("active", level === state.thinking);
        });

        const notes = [];
        if (!modelConfig.efforts.includes("max")) notes.push("ไม่รองรับ Max");
        if (!modelConfig.efforts.includes("off")) notes.push("ไม่รองรับ Off");
        dom.thinkingNote.textContent = notes.join(" · ");

        if (!modelConfig.efforts.includes(state.thinking)) {
            state.thinking = modelConfig.default;
            updateThinkingUI();
        }

        updateStatusBar();
    }

    // ─── Event Listeners ────────────────────────────────────────────────

    function setupEventListeners() {
        // Sidebar toggle
        dom.toggleSidebar.addEventListener("click", toggleSidebar);
        dom.sidebarOverlay.addEventListener("click", closeSidebar);
        if (dom.sidebarClose) {
            dom.sidebarClose.addEventListener("click", closeSidebar);
        }

        // Instruction selection
        dom.instructionList.addEventListener("click", (e) => {
            const item = e.target.closest(".ic-inst-item");
            if (item) selectInstruction(item.dataset.id, item.dataset.name);
        });

        // Search
        dom.instructionSearch.addEventListener("input", (e) => {
            renderInstructionList(e.target.value);
        });

        // Send message / Stop
        dom.send.addEventListener("click", () => {
            if (state.sending) {
                stopStreaming();
            } else {
                sendMessage(dom.input.value);
            }
        });

        dom.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!state.sending) {
                    sendMessage(dom.input.value);
                }
            }
        });

        dom.input.addEventListener("input", () => {
            updateSendButton();
            autoResize(dom.input);
        });

        // Model dropdown
        dom.modelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = dom.modelDropdown.classList.toggle("show");
            dom.modelBtn.classList.toggle("open", isOpen);
        });

        document.addEventListener("click", (e) => {
            if (!dom.modelDropdown.contains(e.target) && !dom.modelBtn.contains(e.target)) {
                dom.modelDropdown.classList.remove("show");
                dom.modelBtn.classList.remove("open");
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
                // Close dropdown
                dom.modelDropdown.classList.remove("show");
                dom.modelBtn.classList.remove("open");
            });
        });

        // Thinking level
        dom.thinkingLevels.addEventListener("click", (e) => {
            const btn = e.target.closest(".ic-think-btn");
            if (!btn || btn.disabled) return;
            state.thinking = btn.dataset.level;
            updateThinkingUI();
        });

        // Welcome cards (quick actions)
        if (dom.welcomeCards) {
            dom.welcomeCards.addEventListener("click", (e) => {
                const card = e.target.closest(".ic-welcome-card");
                if (!card) return;
                const prompt = card.dataset.prompt;
                dom.input.value = prompt;
                dom.input.focus();
                updateSendButton();
                autoResize(dom.input);
            });
        }

        // New chat buttons
        const handleNewChat = async () => {
            if (!state.selectedId) return;

            // Delete old session from DB
            if (state.sessionId) {
                try {
                    await fetch(`/api/instruction-chat/sessions/${state.sessionId}`, { method: "DELETE" });
                } catch (err) {
                    console.warn("Failed to delete session:", err);
                }
            }

            // Clear everything
            state.sessionId = generateSessionId();
            state.history = [];
            state.totalTokens = 0;
            state.totalChanges = 0;
            dom.messages.innerHTML = "";
            appendMessage("ai", `แชทใหม่เริ่มแล้ว! 🔄 เลือก **${escapeHtml(state.selectedName)}** อยู่ สั่งงานได้เลย`);
            updateStatusBar();
            dom.input.focus();
        };

        dom.newChat.addEventListener("click", handleNewChat);
        if (dom.newChatSidebar) {
            dom.newChatSidebar.addEventListener("click", handleNewChat);
        }

        // Resize handler
        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.innerWidth >= 769) {
                    dom.sidebarOverlay.classList.remove("show");
                }
            }, 150);
        });
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatContent(text) {
        let html = escapeHtml(text);

        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // Inline code
        html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

        // Bullet lists (• or -)
        html = html.replace(/^[•\-]\s+(.+)$/gm, "<li>$1</li>");
        html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
        // Fix nested ul
        html = html.replace(/<\/ul>\s*<ul>/g, "");

        // Numbered lists
        html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

        // Line breaks
        html = html.replace(/\n/g, "<br>");

        // Clean up double <br> before lists
        html = html.replace(/<br><ul>/g, "<ul>");
        html = html.replace(/<\/ul><br>/g, "</ul>");

        return html;
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
