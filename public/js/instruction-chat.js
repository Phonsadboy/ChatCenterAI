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
        pendingImages: [], // { file, dataUrl }
    };

    // ─── DOM ────────────────────────────────────────────────────────────

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        sidebar: $("#icSidebar"),
        sidebarOverlay: $("#icSidebarOverlay"),
        sidebarClose: $("#icSidebarClose"),
        toggleSidebar: $("#icToggleSidebar"),
        instructionList: $("#icInstructionList"),
        instructionSearch: $("#icInstructionSearch"),
        sessionSection: $("#icSessionSection"),
        sessionList: $("#icSessionList"),
        activeName: $("#icActiveName"),
        topbarTitle: $("#icTopbarTitle"),
        messages: $("#icMessages"),
        empty: $("#icEmpty"),
        welcomeCards: $("#icWelcomeCards"),
        quickSuggest: $("#icQuickSuggest"),
        quickSuggestWrap: $("#icQuickSuggestWrap"),
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
        attach: $("#icAttach"),
        fileInput: $("#icFileInput"),
        imagePreview: $("#icImagePreview"),
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

        // Capture and clear pending images
        const imagesToSend = [...state.pendingImages];
        state.pendingImages = [];
        clearImagePreview();

        // Hide welcome cards
        if (dom.empty) dom.empty.style.display = "none";

        // Add user message (with images if any)
        appendMessage("user", text, imagesToSend);
        state.history.push({ role: "user", content: text });

        // Create streaming AI response container
        const aiMsg = appendStreamingMessage();
        const contentEl = aiMsg.querySelector(".ic-msg-content");
        let fullContent = "";

        // Set up abort controller
        state.abortController = new AbortController();

        try {
            // Upload images first if any
            let uploadedImages = [];
            for (const img of imagesToSend) {
                try {
                    const formData = new FormData();
                    formData.append("image", img.file);
                    const uploadRes = await fetch("/api/instruction-ai/upload-image", {
                        method: "POST", body: formData,
                    });
                    const uploadData = await uploadRes.json();
                    if (uploadData.success) uploadedImages.push({ data: uploadData.imageData });
                } catch (e) { console.warn("Image upload failed:", e); }
            }

            const response = await fetch("/api/instruction-ai/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instructionId: state.selectedId,
                    message: text,
                    model: state.model,
                    thinking: state.thinking,
                    history: state.history,
                    sessionId: state.sessionId,
                    images: uploadedImages.length > 0 ? uploadedImages : undefined,
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
                            if (data.tool && body) {
                                ensureToolPipeline(body, contentEl);
                                addToolToPipeline(body, data.tool, data.args);
                                scrollToBottom();
                            }
                            break;

                        case "tool_end":
                            if (data.tool) {
                                updateToolInPipeline(aiMsg, data.tool, data.summary || data.result || "✅");
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

    function appendMessage(role, content, images) {
        const isUser = role === "user";
        const div = document.createElement("div");
        div.className = `ic-msg ${isUser ? "ic-msg--user" : "ic-msg--ai"}`;

        let imageHtml = "";
        if (isUser && Array.isArray(images) && images.length > 0) {
            imageHtml = `<div class="ic-msg-images">${images.map(img =>
                `<img src="${img.dataUrl || img.data || ''}" class="ic-msg-thumb" alt="uploaded image">`
            ).join("")}</div>`;
        }

        if (isUser) {
            div.innerHTML = `
            <div class="ic-msg-row">
                <div class="ic-msg-body">
                    ${imageHtml}
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

    // ─── Image Upload Helpers ────────────────────────────────────────────

    function handleImageSelect(e) {
        const files = Array.from(e.target.files || []).slice(0, 3);
        if (!files.length) return;

        for (const file of files) {
            if (state.pendingImages.length >= 3) break;
            const reader = new FileReader();
            reader.onload = (ev) => {
                state.pendingImages.push({ file, dataUrl: ev.target.result });
                renderImagePreview();
                updateSendButton();
            };
            reader.readAsDataURL(file);
        }
        // Reset file input
        e.target.value = "";
    }

    function renderImagePreview() {
        if (!dom.imagePreview) return;
        if (state.pendingImages.length === 0) {
            dom.imagePreview.style.display = "none";
            dom.imagePreview.innerHTML = "";
            return;
        }
        dom.imagePreview.style.display = "flex";
        dom.imagePreview.innerHTML = state.pendingImages.map((img, i) => `
            <div class="ic-preview-item">
                <img src="${img.dataUrl}" alt="preview">
                <button class="ic-preview-remove" data-idx="${i}" title="ลบ">&times;</button>
            </div>
        `).join("");
        // Remove buttons
        dom.imagePreview.querySelectorAll(".ic-preview-remove").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                state.pendingImages.splice(idx, 1);
                renderImagePreview();
                updateSendButton();
            });
        });
    }

    function clearImagePreview() {
        state.pendingImages = [];
        renderImagePreview();
    }

    // ─── Tool Pipeline (collapsed real-time summary) ──────────────────

    function getToolType(toolName) {
        if (!toolName) return "search";
        if (toolName.includes("search") || toolName.includes("get")) return "search";
        if (toolName.includes("update") || toolName.includes("rename")) return "edit";
        if (toolName.includes("add")) return "add";
        if (toolName.includes("delete")) return "delete";
        return "search";
    }

    function getToolIcon(type) {
        return { search: "fa-magnifying-glass", edit: "fa-pen", add: "fa-plus", delete: "fa-trash" }[type] || "fa-terminal";
    }

    function getToolColor(type) {
        return { search: "#38bdf8", edit: "#fbbf24", add: "#34d399", delete: "#f87171" }[type] || "#a78bfa";
    }

    function ensureToolPipeline(body, contentEl) {
        if (body.querySelector(".ic-tool-pipeline")) return;
        const pipeline = document.createElement("div");
        pipeline.className = "ic-tool-pipeline collapsed";
        pipeline.innerHTML = `
        <div class="ic-pipeline-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <div class="ic-pipeline-status">
                <div class="ic-pipeline-spinner"></div>
                <span class="ic-pipeline-label">Executing tools...</span>
            </div>
            <div class="ic-pipeline-meta">
                <span class="ic-pipeline-count">0 calls</span>
                <i class="fas fa-chevron-down ic-pipeline-chevron"></i>
            </div>
        </div>
        <div class="ic-pipeline-body"></div>`;
        body.insertBefore(pipeline, contentEl);
    }

    function addToolToPipeline(body, toolName, args) {
        const pipeline = body.querySelector(".ic-tool-pipeline");
        if (!pipeline) return;

        const pipelineBody = pipeline.querySelector(".ic-pipeline-body");
        const type = getToolType(toolName);
        const icon = getToolIcon(type);
        const color = getToolColor(type);

        // Add tool entry
        const entry = document.createElement("div");
        entry.className = "ic-pipeline-entry running";
        entry.dataset.tool = toolName;
        entry.dataset.type = type;
        entry.innerHTML = `
            <div class="ic-pipeline-entry-left">
                <i class="fas ${icon} ic-pipeline-entry-icon" style="color:${color}"></i>
                <span class="ic-pipeline-entry-name" style="color:${color}">${toolName}</span>
            </div>
            <div class="ic-pipeline-entry-right">
                <span class="ic-pipeline-entry-status">running</span>
                <div class="ic-pipeline-entry-spinner"></div>
            </div>`;
        pipelineBody.appendChild(entry);

        // Update header
        const entries = pipelineBody.querySelectorAll(".ic-pipeline-entry");
        const runningCount = pipelineBody.querySelectorAll(".ic-pipeline-entry.running").length;
        pipeline.querySelector(".ic-pipeline-count").textContent = `${entries.length} call${entries.length > 1 ? "s" : ""}`;
        pipeline.querySelector(".ic-pipeline-label").innerHTML = `<code>${toolName}</code>`;
        pipeline.classList.add("active");
    }

    function updateToolInPipeline(aiMsg, toolName, summary) {
        const pipeline = aiMsg.querySelector(".ic-tool-pipeline");
        if (!pipeline) return;

        const pipelineBody = pipeline.querySelector(".ic-pipeline-body");
        // Find the last running entry with this tool name
        const entries = pipelineBody.querySelectorAll(`.ic-pipeline-entry.running[data-tool="${toolName}"]`);
        const entry = entries[entries.length - 1];
        if (entry) {
            entry.classList.remove("running");
            entry.classList.add("done");
            const statusEl = entry.querySelector(".ic-pipeline-entry-status");
            const spinnerEl = entry.querySelector(".ic-pipeline-entry-spinner");
            if (statusEl) statusEl.textContent = summary;
            if (spinnerEl) spinnerEl.remove();
            // Add checkmark
            const check = document.createElement("i");
            check.className = "fas fa-check ic-pipeline-entry-check";
            entry.querySelector(".ic-pipeline-entry-right").appendChild(check);
        }

        // Update header status
        const remaining = pipelineBody.querySelectorAll(".ic-pipeline-entry.running").length;
        const total = pipelineBody.querySelectorAll(".ic-pipeline-entry").length;
        const doneCount = total - remaining;

        if (remaining === 0) {
            pipeline.classList.remove("active");
            pipeline.querySelector(".ic-pipeline-spinner").style.display = "none";
            pipeline.querySelector(".ic-pipeline-label").innerHTML = `<span class="ic-pipeline-done-text">Done</span> · ${total} tool${total > 1 ? "s" : ""} executed`;
        } else {
            const nextRunning = pipelineBody.querySelector(".ic-pipeline-entry.running");
            if (nextRunning) {
                pipeline.querySelector(".ic-pipeline-label").innerHTML = `<code>${nextRunning.dataset.tool}</code>`;
            }
        }
    }

    // ─── Session Persistence ────────────────────────────────────────────

    function generateSessionId() {
        return `ses_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
    }

    async function saveSession() {
        if (!state.sessionId || !state.selectedId) return;
        try {
            await fetch("/api/instruction-ai/sessions", {
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
            const res = await fetch("/api/instruction-ai/sessions?instructionId=" + encodeURIComponent(instructionId));
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
        if (dom.attach) dom.attach.disabled = false;
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

            appendMessage("ai", `💬 เซสชันก่อนหน้า (${state.history.length} messages) — แชทต่อได้เลย หรือกด ✏️ ที่มุมขวาบนของหน้าจอเพื่อเริ่มใหม่`);
            // Hide quick suggest if has history
            if (dom.quickSuggestWrap) dom.quickSuggestWrap.style.display = "none";
        } else {
            appendMessage("ai", `สวัสดีครับ 👋 เลือก **${escapeHtml(name)}** เรียบร้อยแล้ว พิมพ์คำถามหรือคำสั่งได้เลยครับ`);
            // Show quick suggest for new chats
            if (dom.quickSuggestWrap) dom.quickSuggestWrap.style.display = "flex";
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

        // Load version info
        loadVersionInfo(id);
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
        const hasImages = state.pendingImages.length > 0;
        const hasInstruction = !!state.selectedId;

        if (state.sending) {
            // Show stop button
            dom.send.innerHTML = '<i class="fas fa-stop"></i>';
            dom.send.disabled = false;
            dom.send.title = "หยุด";
            dom.send.classList.add("ic-btn-stop-active");
        } else {
            dom.send.innerHTML = '<i class="fas fa-arrow-up"></i>';
            dom.send.disabled = !(hasText || hasImages) || !hasInstruction;
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

        // Image attach
        if (dom.attach) {
            dom.attach.addEventListener("click", () => {
                if (dom.fileInput) dom.fileInput.click();
            });
        }
        if (dom.fileInput) {
            dom.fileInput.addEventListener("change", handleImageSelect);
        }

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

            // Delete ALL sessions for this instruction from DB
            try {
                await fetch(`/api/instruction-ai/sessions/${state.sessionId}?instructionId=${state.selectedId}`, { method: "DELETE" });
            } catch (err) {
                console.warn("Failed to delete sessions:", err);
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

        // Quick suggest button
        if (dom.quickSuggest) {
            dom.quickSuggest.addEventListener("click", () => {
                if (!state.selectedId || state.sending) return;
                if (dom.quickSuggestWrap) dom.quickSuggestWrap.style.display = "none";
                sendMessage("ช่วยแนะนำการปรับปรุง instruction นี้หน่อย");
            });
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
        // ── 1. Extract markdown tables BEFORE escaping ──
        const tablePlaceholders = [];
        // Ensure trailing newline so last table row is captured
        const textNorm = text.endsWith('\n') ? text : text + '\n';
        text = textNorm.replace(
            /(?:^|\n)((?:\|[^\n]+\|\s*\n){2,})/g,
            (match, tableBlock, offset) => {
                const lines = tableBlock.trim().split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length < 2) return match;

                // Check for separator row (|---|---|)
                const sepIdx = lines.findIndex(l => /^\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|$/.test(l));
                if (sepIdx < 1) return match;

                // Parse alignment from separator
                const sepCells = lines[sepIdx].split('|').filter(c => c.trim() !== '');
                const aligns = sepCells.map(c => {
                    const t = c.trim();
                    if (t.startsWith(':') && t.endsWith(':')) return 'center';
                    if (t.endsWith(':')) return 'right';
                    return 'left';
                });

                // Parse header
                const headerCells = lines.slice(0, sepIdx)
                    .flatMap(l => [l.split('|').filter(c => c.trim() !== '').map(c => c.trim())]);

                // Parse body rows
                const bodyRows = lines.slice(sepIdx + 1).map(l =>
                    l.split('|').filter(c => c.trim() !== '').map(c => c.trim())
                );

                const colCount = Math.max(
                    aligns.length,
                    ...headerCells.map(r => r.length),
                    ...bodyRows.map(r => r.length)
                );

                // Determine table size class
                const isLarge = bodyRows.length > 8 || colCount > 4;
                const sizeClass = isLarge ? 'ic-table-large' : 'ic-table-compact';

                // Build HTML
                let html = `<div class="ic-table-wrap ${sizeClass}">`;
                html += `<div class="ic-table-scroll"><table class="ic-table">`;

                // Header
                html += '<thead><tr>';
                for (let i = 0; i < colCount; i++) {
                    const val = headerCells[0]?.[i] || '';
                    const align = aligns[i] || 'left';
                    html += `<th style="text-align:${align}">${escapeHtml(val)}</th>`;
                }
                html += '</tr></thead>';

                // Body
                html += '<tbody>';
                for (const row of bodyRows) {
                    // Skip completely empty rows
                    const hasContent = row.some(c => c.trim() !== '');
                    html += '<tr>';
                    for (let i = 0; i < colCount; i++) {
                        const val = row[i] || '';
                        const align = aligns[i] || 'left';
                        // Replace <br> tags in cell content
                        const cellHtml = escapeHtml(val)
                            .replace(/&lt;br&gt;/gi, '<br>')
                            .replace(/&lt;br\s*\/&gt;/gi, '<br>');
                        const emptyClass = !val.trim() ? ' class="ic-cell-empty"' : '';
                        html += `<td style="text-align:${align}"${emptyClass}>${cellHtml || '<span class="ic-cell-dash">—</span>'}</td>`;
                    }
                    html += '</tr>';
                }
                html += '</tbody></table></div>';

                // Row count badge
                html += `<div class="ic-table-meta">${bodyRows.length} rows · ${colCount} columns</div>`;
                html += '</div>';

                const idx = tablePlaceholders.length;
                tablePlaceholders.push(html);
                return `\n__TABLE_PLACEHOLDER_${idx}__\n`;
            }
        );

        // ── 2. Escape HTML for all non-table content ──
        let html = escapeHtml(text);

        // ── 3. Headings (### / ## / #) ──
        html = html.replace(/^###\s+(.+)$/gm, '<h4 class="ic-heading">$1</h4>');
        html = html.replace(/^##\s+(.+)$/gm, '<h3 class="ic-heading">$1</h3>');
        html = html.replace(/^#\s+(.+)$/gm, '<h2 class="ic-heading">$1</h2>');

        // ── 4. Bold ──
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // ── 5. Inline code ──
        html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

        // ── 6. Bullet lists ──
        html = html.replace(/^[•\-]\s+(.+)$/gm, "<li>$1</li>");
        html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
        html = html.replace(/<\/ul>\s*<ul>/g, "");

        // ── 7. Numbered lists ──
        html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

        // ── 8. Line breaks ──
        html = html.replace(/\n/g, "<br>");
        html = html.replace(/<br><ul>/g, "<ul>");
        html = html.replace(/<\/ul><br>/g, "</ul>");
        html = html.replace(/<br><h/g, "<h");
        html = html.replace(/<\/h([234])><br>/g, "</h$1>");

        // ── 9. Restore table placeholders ──
        for (let i = 0; i < tablePlaceholders.length; i++) {
            html = html.replace(`__TABLE_PLACEHOLDER_${i}__`, tablePlaceholders[i]);
            // Clean surrounding <br> around tables
            html = html.replace(/<br>__TABLE_PLACEHOLDER_/g, '__TABLE_PLACEHOLDER_');
        }
        // Final cleanup of <br> around table wraps
        html = html.replace(/<br>\s*(<div class="ic-table-wrap)/g, '$1');
        html = html.replace(/(<\/div>)\s*<br>/g, '$1');

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

    // ─── Version Management ─────────────────────────────────────────────

    async function loadVersionInfo(instructionId) {
        const controls = $("#icVersionControls");
        const label = $("#icVersionLabel");
        if (!controls || !label) return;

        controls.style.display = "flex";
        label.textContent = "...";

        try {
            const res = await fetch(`/api/instruction-ai/versions/${instructionId}`);
            const data = await res.json();
            label.textContent = data.currentVersion ? `v${data.currentVersion}` : "v0";
        } catch {
            label.textContent = "—";
        }
    }

    async function openVersionList() {
        const modal = $("#icVersionModal");
        const listEl = $("#icVersionList");
        if (!modal || !listEl || !state.selectedId) return;

        modal.style.display = "flex";
        listEl.innerHTML = '<div class="ic-version-empty">กำลังโหลด...</div>';

        try {
            const res = await fetch(`/api/instruction-ai/versions/${state.selectedId}`);
            const data = await res.json();

            if (!data.versions || data.versions.length === 0) {
                listEl.innerHTML = '<div class="ic-version-empty">ยังไม่มีเวอร์ชันที่บันทึกไว้<br><br>กด 💾 เพื่อบันทึกเวอร์ชันแรก</div>';
                return;
            }

            listEl.innerHTML = data.versions.map(v => {
                const date = v.snapshotAt ? new Date(v.snapshotAt).toLocaleDateString("th-TH", {
                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                }) : "—";
                const isCurrent = v.version === data.currentVersion;
                return `
                <div class="ic-version-item ${isCurrent ? 'current' : ''}">
                    <div class="ic-version-item-left">
                        <span class="ic-version-num">v${v.version}</span>
                        <div class="ic-version-info">
                            <div class="ic-version-note-text">${v.note || '(ไม่มีหมายเหตุ)'}</div>
                            <div class="ic-version-date">${date}</div>
                        </div>
                    </div>
                    ${isCurrent ? '<span class="ic-version-current-badge">ปัจจุบัน</span>' : ''}
                </div>`;
            }).join("");
        } catch (err) {
            listEl.innerHTML = `<div class="ic-version-empty">❌ เกิดข้อผิดพลาด: ${err.message}</div>`;
        }
    }

    function openSaveVersionModal() {
        const modal = $("#icSaveVersionModal");
        const noteInput = $("#icVersionNote");
        if (!modal) return;
        modal.style.display = "flex";
        if (noteInput) { noteInput.value = ""; noteInput.focus(); }
    }

    async function confirmSaveVersion() {
        if (!state.selectedId) return;
        const btn = $("#icVersionSaveConfirm");
        const noteInput = $("#icVersionNote");
        const note = noteInput ? noteInput.value.trim() : "";

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...'; }

        try {
            const res = await fetch(`/api/instruction-ai/versions/${state.selectedId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note }),
            });
            const data = await res.json();
            if (data.success) {
                // Update label
                const label = $("#icVersionLabel");
                if (label) label.textContent = `v${data.version}`;
                // Close modal
                const modal = $("#icSaveVersionModal");
                if (modal) modal.style.display = "none";
                // Show confirmation in chat
                appendMessage("ai", `✅ บันทึกเวอร์ชัน **v${data.version}** เรียบร้อย${note ? " (" + note + ")" : ""}`);
            } else {
                appendMessage("ai", `❌ ไม่สามารถบันทึก: ${data.error}`);
            }
        } catch (err) {
            appendMessage("ai", `❌ เกิดข้อผิดพลาด: ${err.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> บันทึกเวอร์ชัน'; }
        }
    }

    function setupVersionListeners() {
        const versionBtn = $("#icVersionBtn");
        const saveBtn = $("#icSaveVersionBtn");
        const modalClose = $("#icVersionModalClose");
        const saveModalClose = $("#icSaveVersionModalClose");
        const saveConfirm = $("#icVersionSaveConfirm");
        const versionModal = $("#icVersionModal");
        const saveModal = $("#icSaveVersionModal");
        const noteInput = $("#icVersionNote");

        if (versionBtn) versionBtn.addEventListener("click", openVersionList);
        if (saveBtn) saveBtn.addEventListener("click", openSaveVersionModal);
        if (modalClose) modalClose.addEventListener("click", () => { if (versionModal) versionModal.style.display = "none"; });
        if (saveModalClose) saveModalClose.addEventListener("click", () => { if (saveModal) saveModal.style.display = "none"; });
        if (saveConfirm) saveConfirm.addEventListener("click", confirmSaveVersion);
        if (noteInput) noteInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmSaveVersion(); });

        // Close modals on overlay click
        [versionModal, saveModal].forEach(modal => {
            if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
        });
    }

    // ─── Start ──────────────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", () => { init(); setupVersionListeners(); });
})();
