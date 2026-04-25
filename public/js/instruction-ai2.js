/**
 * InstructionAI2 Editor — Frontend Logic v2
 * Premium ChatGPT / Vercel style with SSE streaming, session persistence
 */

(function () {
    "use strict";

    // ─── Config ─────────────────────────────────────────────────────────

    const MODELS = {
        "gpt-5.4": { label: "GPT-5.4", efforts: ["off", "low", "medium", "high", "max"], default: "medium" },
        "gpt-5.4-mini": { label: "GPT-5.4 Mini", efforts: ["off", "low", "medium", "high", "max"], default: "medium" },
        "gpt-5.4-nano": { label: "GPT-5.4 Nano", efforts: ["off", "low", "medium", "high", "max"], default: "medium" },
        "gpt-5.2": { label: "GPT-5.2", efforts: ["off", "low", "medium", "high", "max"], default: "medium" },
        "gpt-5.2-codex": { label: "GPT-5.2 Codex", efforts: ["off", "low", "medium", "high", "max"], default: "medium" },
        "gpt-5.1": { label: "GPT-5.1", efforts: ["off", "low", "medium", "high"], default: "medium" },
        "gpt-5": { label: "GPT-5", efforts: ["low", "medium", "high"], default: "medium" },
    };

    // ─── State ──────────────────────────────────────────────────────────

    let state = {
        instructions: [],
        selectedId: null,
        selectedName: "",
        sessionId: null,
        model: "gpt-5.4",
        thinking: "medium",
        history: [],
        totalTokens: 0,
        totalChanges: 0,
        sending: false,
        sidebarOpen: window.innerWidth >= 769,
        abortController: null,
        pendingImages: [], // { file, dataUrl }
        activeRequestId: null, // for SSE reconnect
        isUserNearBottom: true,
        pendingBatch: null,
        batchReviewCardIds: [],
        inventory: null,
        inventoryFilter: "",
        activeInventoryRefs: [],
        episodeDetails: {},
        selectedEpisodeId: "",
    };

    const SCROLL_BOTTOM_THRESHOLD_PX = 48;
    let scrollToBottomRafId = null;

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
        createRetail: $("#icCreateRetail"),
        attach: $("#icAttach"),
        fileInput: $("#icFileInput"),
        imagePreview: $("#icImagePreview"),
        welcomeOpenSidebar: $("#icWelcomeOpenSidebar"),
        toggleInventory: $("#icToggleInventory"),
        inventoryPanel: $("#icInventoryPanel"),
        inventoryClose: $("#icInventoryClose"),
        inventoryTitle: $("#icInventoryTitle"),
        inventorySearch: $("#icInventorySearch"),
        inventoryBody: $("#icInventoryBody"),
        batchModal: $("#icBatchModal"),
        batchModalClose: $("#icBatchModalClose"),
        batchSummary: $("#icBatchSummary"),
        batchList: $("#icBatchList"),
        batchRejectReason: $("#icBatchRejectReason"),
        batchApprove: $("#icBatchApprove"),
        batchReject: $("#icBatchReject"),
        batchRevise: $("#icBatchRevise"),
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
        syncSidebarA11y();
        setModelDropdownOpen(false);
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

    async function createRetailInstruction() {
        const rawName = window.prompt("ตั้งชื่อ Instruction ใหม่", "Retail Instruction");
        const name = (rawName || "").trim();
        if (!name) return;

        if (dom.createRetail) {
            dom.createRetail.disabled = true;
            dom.createRetail.classList.add("loading");
        }

        try {
            const res = await fetch("/api/instruction-ai2/instructions/retail-template", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || "สร้าง Instruction ไม่สำเร็จ");
            }
            await loadInstructions();
            const created = data.instruction || {};
            if (created._id) {
                selectInstruction(created._id, created.name || name);
            }
        } catch (err) {
            appendMessage("ai", `สร้าง Retail Template ไม่สำเร็จ: ${err.message}`);
        } finally {
            if (dom.createRetail) {
                dom.createRetail.disabled = false;
                dom.createRetail.classList.remove("loading");
            }
        }
    }

    async function sendMessage(text) {
        const rawText = typeof text === "string" ? text : "";
        if ((!rawText.trim() && state.pendingImages.length === 0) || !state.selectedId || state.sending) return;

        const historyForRequest = [...state.history];
        state.isUserNearBottom = isNearMessagesBottom();
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
        appendMessage("user", rawText, imagesToSend);
        const historyUserText = rawText.trim() || (imagesToSend.length > 0 ? `[แนบรูปภาพ ${imagesToSend.length} รูป]` : "");
        state.history.push({ role: "user", content: historyUserText });

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
                    const uploadRes = await fetch("/api/instruction-ai2/upload-image", {
                        method: "POST", body: formData,
                    });
                    const uploadData = await uploadRes.json();
                    if (uploadData.success) uploadedImages.push({ data: uploadData.imageData, name: img.file.name });
                } catch (e) { console.warn("Image upload failed:", e); }
            }

            const response = await fetch("/api/instruction-ai2/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instructionId: state.selectedId,
                    message: rawText,
                    model: state.model,
                    thinking: state.thinking,
                    history: historyForRequest,
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

            // Process SSE stream with shared handler
            const result = await handleSSEStream(response, aiMsg, contentEl);
            fullContent = result.fullContent;
            let historyRecovered = false;

            if (!fullContent && !(state._lastAssistantMessages && state._lastAssistantMessages.length)) {
                const recovered = await recoverMissingAssistantResult(contentEl);
                if (recovered.recovered) {
                    fullContent = recovered.content || "";
                    historyRecovered = true;
                }
            }

            // Save to history — use full tool messages if available
            if (fullContent && !historyRecovered) {
                const fullMsgs = state._lastAssistantMessages;
                if (fullMsgs && fullMsgs.length > 0) {
                    for (const m of fullMsgs) {
                        state.history.push(m);
                    }
                } else {
                    state.history.push({ role: "assistant", content: fullContent });
                }
                state._lastAssistantMessages = null;
            }

            // Auto-save session (backend also saves, but this keeps frontend state in sync)
            saveSession();

        } catch (err) {
            if (err.name === "AbortError") {
                const answerEl = ensureAgentAnswer(aiMsg, contentEl);
                answerEl.innerHTML += formatContent("\n\n⏹️ หยุดการตอบ");
            } else {
                const answerEl = ensureAgentAnswer(aiMsg, contentEl);
                answerEl.innerHTML = formatContent(`❌ เกิดข้อผิดพลาด: ${err.message}`);
            }
        } finally {
            state.sending = false;
            state.abortController = null;
            state.activeRequestId = null;
            try { sessionStorage.removeItem("ic2_activeRequestId"); } catch (e) { }
            updateSendButton();
            const typingEl = contentEl.querySelector(".ic-typing");
            if (typingEl) typingEl.remove();
        }
    }

    // ─── Shared SSE Stream Handler ──────────────────────────────────────

    async function handleSSEStream(response, aiMsg, contentEl) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let lastRenderedContent = "";
        let hasRenderedContent = false;
        let statusEl = null;
        let streamRenderHandle = null;
        let streamTextEl = null;
        let streamTextVisible = "";
        let streamRenderCarry = 0;
        let streamLastFrameAt = 0;
        let lastStreamScrollAt = 0;
        let doneHandled = false;
        let errorHandled = false;
        let statusPhase = "thinking";
        let statusIteration = 1;
        let statusTool = null;
        let statusBaseElapsedSec = 0;
        let statusTicker = null;
        let receivedSseContent = false;
        let sseContentBuffer = "";
        let commentaryContent = "";
        let activeCommentaryId = null;
        let commentarySeq = 0;
        let lastSseContentAt = 0;
        const streamStartedAt = Date.now();
        const STATE_POLL_MS = 450;
        const SSE_STALE_FOR_STATE_MS = 700;
        let cancelledByState = false;
        let statePollTimer = null;
        let statePollInFlight = false;
        let statePollingStopped = false;
        let lastStateDigest = "";
        const body = aiMsg.querySelector(".ic-msg-body");

        const setActiveRequestId = (requestId) => {
            if (!requestId) return;
            const value = String(requestId);
            state.activeRequestId = value;
            try { sessionStorage.setItem("ic2_activeRequestId", value); } catch (e) { }
        };

        const clearActiveRequestId = () => {
            state.activeRequestId = null;
            try { sessionStorage.removeItem("ic2_activeRequestId"); } catch (e) { }
        };

        const getFinalAssistantContent = (assistantMessages) => {
            if (!Array.isArray(assistantMessages)) return "";
            for (let i = assistantMessages.length - 1; i >= 0; i--) {
                const msg = assistantMessages[i];
                if (msg && msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
                    return msg.content;
                }
            }
            return "";
        };

        const ensureStatusEl = () => {
            if (statusEl) return statusEl;
            statusEl = ensureAgentRunStatus(aiMsg, contentEl);
            return statusEl;
        };

        const showStatus = (text) => {
            if (!text) return;
            ensureStatusEl();
            setAgentRunStatus(aiMsg, contentEl, {
                phase: statusPhase,
                iteration: statusIteration,
                tool: statusTool,
                elapsedSec: getElapsedSeconds(),
                label: text,
            });
            scrollToBottom();
        };

        const clearStatus = () => {
            statusEl = null;
        };

        const getElapsedSeconds = () => {
            const localElapsed = Math.floor((Date.now() - streamStartedAt) / 1000);
            return Math.max(0, statusBaseElapsedSec + localElapsed);
        };

        const syncElapsedFromServer = (serverElapsedSec) => {
            if (!Number.isFinite(serverElapsedSec)) return;
            const localElapsed = Math.floor((Date.now() - streamStartedAt) / 1000);
            const targetBase = Math.max(0, serverElapsedSec - localElapsed);
            if (targetBase > statusBaseElapsedSec) {
                statusBaseElapsedSec = targetBase;
            }
        };

        const buildLiveStatusText = () => {
            const statusMap = {
                thinking: "AI กำลังคิด",
                continuing: `ประมวลผลรอบ ${statusIteration || ""}`,
                responding: "กำลังเขียนคำตอบ",
                tool_plan: `เตรียมเรียกเครื่องมือ${statusTool ? `: ${statusTool}` : ""}`,
                tool: `กำลังรันเครื่องมือ${statusTool ? `: ${statusTool}` : ""}`,
            };
            return statusMap[statusPhase] || "กำลังประมวลผล";
        };

        const renderLiveStatus = () => {
            showStatus(buildLiveStatusText());
        };

        const startLiveStatusTicker = () => {
            if (statusTicker) return;
            renderLiveStatus();
            statusTicker = setInterval(renderLiveStatus, 250);
        };

        const stopLiveStatusTicker = () => {
            if (!statusTicker) return;
            clearInterval(statusTicker);
            statusTicker = null;
        };

        const formatElapsedTime = (totalSec) => {
            const secs = Math.max(0, Math.floor(totalSec));
            const mins = Math.floor(secs / 60);
            const remainSec = secs % 60;
            if (mins <= 0) return `${remainSec}s`;
            return `${mins}m ${remainSec}s`;
        };

        const renderTotalElapsedMeta = (isError = false) => {
            if (!body) return;
            let metaEl = body.querySelector(".ic-msg-total-time");
            if (!metaEl) {
                metaEl = document.createElement("div");
                metaEl.className = "ic-msg-total-time";
                body.appendChild(metaEl);
            }
            if (isError) {
                metaEl.classList.add("error");
            } else {
                metaEl.classList.remove("error");
            }
            metaEl.textContent = `เวลารวม ${formatElapsedTime(getElapsedSeconds())}`;
            scrollToBottom();
        };

        const ensureStreamTextEl = () => {
            if (streamTextEl) return streamTextEl;
            const answerEl = ensureAgentAnswer(aiMsg, contentEl);
            answerEl.innerHTML = "";
            streamTextEl = document.createElement("div");
            streamTextEl.className = "ic-streaming-raw";
            streamTextEl.textContent = streamTextVisible;
            answerEl.appendChild(streamTextEl);
            return streamTextEl;
        };

        const scrollStreamToBottom = (force = false) => {
            const now = performance.now();
            if (!force && now - lastStreamScrollAt < 40) return;
            lastStreamScrollAt = now;
            scrollToBottom(force);
        };

        const getStreamCharsPerSecond = (lag) => {
            if (lag > 12000) return 7600;
            if (lag > 6000) return 5200;
            if (lag > 3000) return 3400;
            if (lag > 1500) return 2300;
            if (lag > 700) return 1500;
            if (lag > 250) return 900;
            return 300;
        };

        const findStreamOverlap = (baseText, candidateText) => {
            const maxOverlap = Math.min(512, baseText.length, candidateText.length);
            for (let size = maxOverlap; size > 0; size--) {
                if (baseText.endsWith(candidateText.slice(0, size))) return size;
            }
            return 0;
        };

        const syncAgentAnswerPresence = () => {
            const { run } = ensureAgentRun(aiMsg, contentEl);
            if (run) run.classList.toggle("has-answer", Boolean(fullContent.trim()));
        };

        const mergeIncomingSseText = (deltaText) => {
            const chunk = typeof deltaText === "string" ? deltaText : String(deltaText || "");
            if (!chunk) return;
            receivedSseContent = true;
            lastSseContentAt = Date.now();
            sseContentBuffer += chunk;

            let merged = fullContent;
            if (!merged) {
                merged = sseContentBuffer;
            } else if (merged.startsWith(sseContentBuffer)) {
                // State snapshot already has more content than SSE has streamed so far.
            } else if (sseContentBuffer.startsWith(merged)) {
                merged = sseContentBuffer;
            } else {
                const overlap = findStreamOverlap(merged, sseContentBuffer);
                if (overlap > 0) {
                    merged = `${merged}${sseContentBuffer.slice(overlap)}`;
                } else if (sseContentBuffer.length >= merged.length) {
                    merged = sseContentBuffer;
                }
            }

            if (merged !== fullContent) {
                fullContent = merged;
                syncAgentAnswerPresence();
                scheduleRender();
            }
        };

        const removeAnswerText = (text) => {
            const chunk = typeof text === "string" ? text : String(text || "");
            if (!chunk || !fullContent) return;
            if (streamRenderHandle) {
                cancelAnimationFrame(streamRenderHandle);
                streamRenderHandle = null;
            }
            if (fullContent.endsWith(chunk)) {
                fullContent = fullContent.slice(0, -chunk.length);
            } else if (chunk.includes(fullContent)) {
                fullContent = "";
            }
            sseContentBuffer = fullContent;
            streamTextVisible = fullContent;
            streamRenderCarry = 0;
            streamLastFrameAt = 0;
            lastRenderedContent = "";
            renderContentNow(true);
        };

        const getNextCommentaryId = () => {
            commentarySeq += 1;
            return `local_commentary_${commentarySeq}`;
        };

        const appendCommentaryBlockText = (deltaText, options = {}) => {
            const chunk = typeof deltaText === "string" ? deltaText : String(deltaText || "");
            if (!chunk) return;
            const commentaryId = options.commentaryId || activeCommentaryId || getNextCommentaryId();
            activeCommentaryId = commentaryId;
            commentaryContent += chunk;
            setAgentCommentaryText(aiMsg, contentEl, chunk, {
                commentaryId,
                append: true,
                iteration: options.iteration,
                complete: options.complete,
            });
            scrollToBottom();
        };

        const startCommentaryBlockText = (text, options = {}) => {
            const chunk = typeof text === "string" ? text : String(text || "");
            if (!chunk) return;
            const commentaryId = options.commentaryId || getNextCommentaryId();
            activeCommentaryId = commentaryId;
            commentaryContent += chunk;
            setAgentCommentaryText(aiMsg, contentEl, chunk, {
                commentaryId,
                append: false,
                iteration: options.iteration,
                complete: options.complete,
            });
            scrollToBottom();
        };

        const setCommentaryTextFromState = (text, complete = false) => {
            const nextText = typeof text === "string" ? text : "";
            if (!nextText.trim()) return;
            if (commentaryContent.length > nextText.length && commentaryContent.startsWith(nextText)) return;
            commentaryContent = nextText;
            setAgentCommentaryText(aiMsg, contentEl, nextText, {
                commentaryId: "state_commentary",
                append: false,
                complete,
            });
            scrollToBottom();
        };

        const syncCommentaryTimelineFromState = (timeline, complete = false) => {
            if (!Array.isArray(timeline) || timeline.length === 0) return;
            const text = timeline.map((entry) => entry?.text || "").join("");
            if (text && commentaryContent.length > text.length && commentaryContent.startsWith(text)) return;
            commentaryContent = text || commentaryContent;
            for (const entry of timeline) {
                if (!entry || !entry.text) continue;
                setAgentCommentaryText(aiMsg, contentEl, entry.text, {
                    commentaryId: entry.id || `state_commentary_${entry.iteration || 0}`,
                    append: false,
                    iteration: entry.iteration,
                    complete,
                });
            }
            scrollToBottom();
        };

        const moveAnswerTextToCommentary = (text, options = {}) => {
            const chunk = typeof text === "string" ? text : String(text || "");
            if (!chunk) return;
            removeAnswerText(chunk);
            startCommentaryBlockText(chunk, options);
        };

        const flushStreamText = (frameTs = performance.now()) => {
            streamRenderHandle = null;
            const lag = fullContent.length - streamTextVisible.length;
            if (lag <= 0) {
                streamRenderCarry = 0;
                streamLastFrameAt = frameTs;
                return;
            }

            const prevFrame = streamLastFrameAt || frameTs;
            const deltaMs = Math.max(10, Math.min(48, frameTs - prevFrame || 16));
            streamLastFrameAt = frameTs;

            streamRenderCarry += (getStreamCharsPerSecond(lag) * deltaMs) / 1000;
            let take = Math.floor(streamRenderCarry);
            if (take < 1) take = 1;
            if (lag <= 120) take = Math.min(take, 3);
            if (lag <= 40) take = Math.min(take, 2);
            take = Math.min(take, lag);
            streamRenderCarry = Math.max(0, streamRenderCarry - take);

            const nextLength = streamTextVisible.length + take;
            const nextChunk = fullContent.slice(streamTextVisible.length, nextLength);
            if (nextChunk) {
                ensureStreamTextEl().textContent += nextChunk;
                streamTextVisible += nextChunk;
            }
            hasRenderedContent = streamTextVisible.length > 0;
            syncAgentAnswerPresence();
            scrollStreamToBottom();

            if (streamTextVisible.length < fullContent.length) {
                streamRenderHandle = requestAnimationFrame(flushStreamText);
            } else {
                streamRenderCarry = 0;
            }
        };

        const renderContentNow = (force = false) => {
            if (!force && fullContent === lastRenderedContent) return;
            if (streamRenderHandle) {
                cancelAnimationFrame(streamRenderHandle);
                streamRenderHandle = null;
            }
            streamTextVisible = fullContent;
            streamRenderCarry = 0;
            streamLastFrameAt = 0;
            const answerEl = ensureAgentAnswer(aiMsg, contentEl);
            answerEl.innerHTML = fullContent ? formatContent(fullContent) : "";
            streamTextEl = null;
            lastRenderedContent = fullContent;
            hasRenderedContent = fullContent.length > 0;
            syncAgentAnswerPresence();
            scrollStreamToBottom();
        };

        const scheduleRender = () => {
            if (fullContent.length === streamTextVisible.length) return;
            if (streamRenderHandle) return;
            streamRenderHandle = requestAnimationFrame(flushStreamText);
        };

        const stopStatePolling = () => {
            statePollingStopped = true;
            if (statePollTimer) {
                clearInterval(statePollTimer);
                statePollTimer = null;
            }
        };

        const applyDonePayload = (data = {}) => {
            if (doneHandled) return;
            doneHandled = true;

            if (data.usage) state.totalTokens += data.usage.total_tokens || 0;
            if (data.changes) state.totalChanges += data.changes.length;
            if (data.assistantMessages) state._lastAssistantMessages = data.assistantMessages;
            if (data.batch && data.batch.batchId) {
                handleBatchReady(data.batch);
            }
            if (data.versionSnapshot && Number.isInteger(data.versionSnapshot.version)) {
                const label = $("#icVersionLabel");
                if (label) label.textContent = `v${data.versionSnapshot.version}`;
                if (body) renderVersionSnapshotSummary(body, data.versionSnapshot);
            }

            if (data.toolsUsed && Array.isArray(data.toolsUsed) && data.toolsUsed.length > 0 && body) {
                const toolNames = data.toolsUsed
                    .map((tool) => (typeof tool === "string" ? tool : tool?.tool))
                    .filter(Boolean);
                if (toolNames.length > 0) {
                    renderToolsUsedSummary(body, toolNames);
                }
            }

            if (typeof data.commentaryText === "string" && data.commentaryText.trim()) {
                if (Array.isArray(data.commentaryTimeline) && data.commentaryTimeline.length > 0) {
                    syncCommentaryTimelineFromState(data.commentaryTimeline, true);
                } else {
                    setCommentaryTextFromState(data.commentaryText, true);
                }
            }

            const finalAssistantContent = data.assistantMessages
                ? getFinalAssistantContent(data.assistantMessages)
                : "";
            if (finalAssistantContent && finalAssistantContent.trim() !== fullContent.trim()) {
                fullContent = finalAssistantContent;
                sseContentBuffer = finalAssistantContent;
                renderContentNow(true);
            } else if (!fullContent && data.assistantMessages) {
                const fallbackContent = getFinalAssistantContent(data.assistantMessages);
                if (fallbackContent) {
                    fullContent = fallbackContent;
                    sseContentBuffer = fallbackContent;
                    renderContentNow(true);
                }
            }

            clearActiveRequestId();
            updateStatusBar();
            stopStatePolling();
            stopLiveStatusTicker();
            setAgentRunStatus(aiMsg, contentEl, {
                phase: "done",
                elapsedSec: getElapsedSeconds(),
                label: "เสร็จแล้ว",
                done: true,
            });
            if (commentaryContent.trim()) {
                completeAgentCommentary(aiMsg, contentEl);
            }
            finalizeAgentRun(aiMsg, contentEl);
            if (fullContent.trim()) {
                collapseAgentTranscript(aiMsg, contentEl, true);
            }
            renderTotalElapsedMeta(false);
        };

        const applyErrorPayload = (errorMessage) => {
            if (errorHandled) return;
            errorHandled = true;
            if (errorMessage) {
                fullContent = fullContent
                    ? `${fullContent}\n❌ ${errorMessage}`
                    : `❌ ${errorMessage}`;
                renderContentNow(true);
            }
            clearActiveRequestId();
            stopStatePolling();
            stopLiveStatusTicker();
            setAgentRunStatus(aiMsg, contentEl, {
                phase: "error",
                elapsedSec: getElapsedSeconds(),
                label: "เกิดข้อผิดพลาด",
                error: true,
            });
            finalizeAgentRun(aiMsg, contentEl, { error: true });
            renderTotalElapsedMeta(true);
        };

        const syncToolPipelineFromState = (tools) => {
            if (!body || !Array.isArray(tools) || tools.length === 0) return;
            ensureToolPipeline(body, contentEl);
            for (const toolState of tools) {
                if (!toolState || !toolState.tool) continue;
                const stateStatus = String(toolState.status || "queued");
                const baseStatus = stateStatus === "running" ? "running" : (stateStatus === "queued" ? "queued" : "done");
                const hasStructuredArgs = toolState.args &&
                    typeof toolState.args === "object" &&
                    Object.keys(toolState.args).length > 0;
                addToolToPipeline(body, toolState.tool, hasStructuredArgs ? toolState.args : (toolState.argumentsText || null), {
                    callId: toolState.callId || null,
                    status: baseStatus,
                    argumentsText: toolState.argumentsText || "",
                });
                if (baseStatus === "done") {
                    const summary = toolState.summary || (stateStatus === "error" ? "❌" : "✅");
                    updateToolInPipeline(aiMsg, toolState.tool, summary, toolState.callId || null);
                } else if (toolState.argumentsText) {
                    updateToolArgumentsInPipeline(aiMsg, toolState.tool, toolState.argumentsText, toolState.callId || null);
                }
            }
            scrollToBottom();
        };

        const applyStateSnapshot = async (snapshot) => {
            if (!snapshot || typeof snapshot !== "object") return;
            if (snapshot.sessionId) state.sessionId = snapshot.sessionId;
            if (snapshot.requestId) setActiveRequestId(snapshot.requestId);

            if (snapshot.phase) {
                const statusData = {
                    phase: snapshot.phase,
                    iteration: snapshot.iteration,
                    tool: snapshot.tool,
                    elapsedSec: snapshot.elapsedSec,
                };
                handleEvent("status", statusData);
            }

            if (Array.isArray(snapshot.tools) && snapshot.tools.length > 0) {
                syncToolPipelineFromState(snapshot.tools);
            }

            if (typeof snapshot.reasoningSummary === "string" && snapshot.reasoningSummary.trim()) {
                setAgentReasoningText(aiMsg, contentEl, snapshot.reasoningSummary);
            }

            if (typeof snapshot.commentaryText === "string" && snapshot.commentaryText.trim()) {
                if (Array.isArray(snapshot.commentaryTimeline) && snapshot.commentaryTimeline.length > 0) {
                    syncCommentaryTimelineFromState(snapshot.commentaryTimeline, snapshot.status === "complete");
                } else {
                    setCommentaryTextFromState(snapshot.commentaryText, snapshot.status === "complete");
                }
            }
            reorderTranscriptFromState(snapshot);

            if (typeof snapshot.partialContent === "string") {
                const sseIdleMs = receivedSseContent
                    ? Date.now() - lastSseContentAt
                    : Date.now() - streamStartedAt;
                const shouldUseStateContent = sseIdleMs >= SSE_STALE_FOR_STATE_MS;
                const stateAnswer = snapshot.partialContent;
                const growsForward =
                    !fullContent ||
                    stateAnswer.startsWith(fullContent) ||
                    (!receivedSseContent && stateAnswer.length >= fullContent.length);
                const shrinksAfterReclassify =
                    fullContent &&
                    fullContent.startsWith(stateAnswer) &&
                    typeof snapshot.commentaryText === "string" &&
                    snapshot.commentaryText.includes(fullContent.slice(stateAnswer.length));

                if (
                    shouldUseStateContent &&
                    stateAnswer !== fullContent &&
                    (growsForward || shrinksAfterReclassify)
                ) {
                    fullContent = stateAnswer;
                    sseContentBuffer = stateAnswer;
                    renderContentNow(true);
                }
            }

            if (snapshot.status === "complete") {
                applyDonePayload({
                    usage: snapshot.usage,
                    changes: snapshot.changes,
                    toolsUsed: snapshot.toolsUsed,
                    assistantMessages: snapshot.assistantMessages,
                    batch: snapshot.batch,
                    versionSnapshot: snapshot.versionSnapshot,
                    commentaryText: snapshot.commentaryText,
                    commentaryTimeline: snapshot.commentaryTimeline,
                });
                cancelledByState = true;
                try { await reader.cancel(); } catch (e) { }
            } else if (snapshot.status === "error") {
                applyErrorPayload(snapshot.error || "การประมวลผลล้มเหลว");
                cancelledByState = true;
                try { await reader.cancel(); } catch (e) { }
            }
        };

        const pollStateOnce = async () => {
            if (statePollingStopped || statePollInFlight || !state.activeRequestId) return;
            statePollInFlight = true;
            try {
                const res = await fetch(`/api/instruction-ai2/stream/state?requestId=${encodeURIComponent(state.activeRequestId)}`, {
                    cache: "no-store",
                });
                if (res.status === 404) {
                    clearActiveRequestId();
                    stopStatePolling();
                    return;
                }
                if (!res.ok) return;
                const payload = await res.json().catch(() => null);
                if (!payload || !payload.success) return;

                const toolDigest = Array.isArray(payload.tools)
                    ? payload.tools.map((t) => `${t.callId || ""}:${t.status || ""}:${t.summary || ""}:${(t.argumentsText || "").length}`).join("|")
                    : "";
                const commentaryDigest = Array.isArray(payload.commentaryTimeline)
                    ? payload.commentaryTimeline.map((entry) => `${entry.id || ""}:${entry.iteration || ""}:${(entry.text || "").length}`).join("|")
                    : String((payload.commentaryText || "").length);
                const digest = [
                    payload.status || "",
                    payload.phase || "",
                    String(payload.iteration || ""),
                    payload.tool || "",
                    String((payload.partialContent || "").length),
                    commentaryDigest,
                    String((payload.reasoningSummary || "").length),
                    toolDigest,
                    payload.error || "",
                ].join("||");

                if (digest === lastStateDigest && payload.status !== "complete" && payload.status !== "error") {
                    return;
                }
                lastStateDigest = digest;
                await applyStateSnapshot(payload);
            } catch (e) {
                // ignore fallback polling errors and continue streaming
            } finally {
                statePollInFlight = false;
            }
        };

        const startStatePolling = () => {
            if (statePollTimer || !state.activeRequestId) return;
            pollStateOnce();
            statePollTimer = setInterval(pollStateOnce, STATE_POLL_MS);
        };

        const getTimelineTime = (value, fallback = 0) => {
            if (Number.isFinite(value)) return value;
            const parsed = Date.parse(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        };

        const reorderTranscriptFromState = (snapshot) => {
            if (!snapshot || typeof snapshot !== "object") return;
            const records = [];
            if (Array.isArray(snapshot.commentaryTimeline)) {
                snapshot.commentaryTimeline.forEach((entry, index) => {
                    if (!entry?.id) return;
                    records.push({
                        key: `commentary:${entry.id}`,
                        at: getTimelineTime(entry.createdAt || entry.updatedAt, index),
                        index,
                        kind: 0,
                    });
                });
            }
            if (Array.isArray(snapshot.tools)) {
                snapshot.tools.forEach((tool, index) => {
                    if (!tool?.callId) return;
                    records.push({
                        key: `tool:${tool.callId}`,
                        at: getTimelineTime(tool.startedAt || tool.updatedAt || tool.endedAt, index),
                        index,
                        kind: 1,
                    });
                });
            }
            records.sort((a, b) => (a.at - b.at) || (a.kind - b.kind) || (a.index - b.index));
            reorderTranscriptItems(aiMsg, contentEl, records.map((entry) => entry.key));
        };

        const handleEvent = (eventType, data) => {
            switch (eventType) {
                case "session":
                    if (data.sessionId) state.sessionId = data.sessionId;
                    if (data.requestId) {
                        setActiveRequestId(data.requestId);
                        startStatePolling();
                    }
                    break;

                case "thinking":
                    if (data.content && body) {
                        setAgentReasoningText(aiMsg, contentEl, data.content);
                        scrollToBottom();
                    }
                    break;

                case "thinking_start":
                    if (body) {
                        ensureAgentReasoningBlock(aiMsg, contentEl);
                        scrollToBottom();
                    }
                    break;

                case "thinking_delta":
                    if (data.text && body) {
                        appendAgentReasoningDelta(aiMsg, contentEl, data.text);
                        scrollToBottom();
                    }
                    break;

                case "thinking_done":
                    if (body) {
                        completeAgentReasoning(aiMsg, contentEl, data.wordCount);
                    }
                    break;

                case "status":
                    if (data.phase && contentEl) {
                        statusPhase = data.phase || statusPhase;
                        statusIteration = data.iteration || statusIteration;
                        if (Object.prototype.hasOwnProperty.call(data, "tool")) {
                            statusTool = data.tool || null;
                        }
                        syncElapsedFromServer(data.elapsedSec);
                        renderLiveStatus();
                    }
                    break;

                case "tool_plan":
                    if (data.tool && body) {
                        ensureToolPipeline(body, contentEl);
                        addToolToPipeline(body, data.tool, data.argumentsText || null, {
                            callId: data.callId || data.itemId,
                            status: "queued",
                            argumentsText: data.argumentsText || "",
                        });
                        scrollToBottom();
                    }
                    break;

                case "tool_args_delta":
                    if (data.tool && body) {
                        ensureToolPipeline(body, contentEl);
                        updateToolArgumentsInPipeline(
                            aiMsg,
                            data.tool,
                            data.argumentsText || data.arguments || data.delta || "",
                            data.callId || data.itemId || null
                        );
                        scrollToBottom();
                    }
                    break;

                case "tool_args_done":
                    if (data.tool && body) {
                        ensureToolPipeline(body, contentEl);
                        updateToolArgumentsInPipeline(
                            aiMsg,
                            data.tool,
                            data.argumentsText || data.arguments || "",
                            data.callId || data.itemId || null
                        );
                        scrollToBottom();
                    }
                    break;

                case "answer_delta":
                case "final_answer_delta":
                case "content":
                    if (data.text !== undefined) {
                        if (data.provisional !== true) {
                            collapseAgentTranscript(aiMsg, contentEl, true);
                        }
                        mergeIncomingSseText(data.text);
                    }
                    break;

                case "commentary_delta":
                    if (data.text !== undefined) {
                        appendCommentaryBlockText(data.text, {
                            commentaryId: data.commentaryId,
                            iteration: data.iteration,
                        });
                    }
                    break;

                case "answer_to_commentary":
                    if (data.text !== undefined) {
                        moveAnswerTextToCommentary(data.text, {
                            commentaryId: data.commentaryId,
                            iteration: data.iteration,
                        });
                    }
                    break;

                case "tool_start":
                    if (data.tool && body) {
                        setInventoryRefs(refsFromTool(data.tool, data.args || {}), data.tool.startsWith("propose_") ? "proposed" : "active");
                        ensureToolPipeline(body, contentEl);
                        addToolToPipeline(body, data.tool, data.args, {
                            callId: data.callId,
                            status: "running",
                            argumentsText: data.argumentsText || "",
                        });
                        scrollToBottom();
                    }
                    break;

                case "tool_end":
                    if (data.tool) {
                        setInventoryRefs(refsFromTool(data.tool, data.args || {}), data.proposed ? "proposed" : "active");
                        updateToolInPipeline(aiMsg, data.tool, data.summary || data.result || "✅", data.callId);
                    }
                    break;

                case "done":
                    applyDonePayload(data);
                    break;

                case "error":
                    applyErrorPayload(data.error);
                    break;

                default:
                    if (data.sessionId) {
                        state.sessionId = data.sessionId;
                    } else if (data.text !== undefined) {
                        mergeIncomingSseText(data.text);
                    } else if (data.error) {
                        applyErrorPayload(data.error);
                    }
                    break;
            }
        };

        const processRawSSEEvent = (rawEvent) => {
            if (!rawEvent) return;
            const lines = rawEvent.replace(/\r/g, "").split("\n");
            let eventType = "message";
            const dataLines = [];

            for (const line of lines) {
                if (!line) continue;
                if (line.startsWith(":")) continue;
                if (line.startsWith("event:")) {
                    eventType = line.slice(6).trim();
                    continue;
                }
                if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }

            if (dataLines.length === 0) return;
            const jsonStr = dataLines.join("\n");
            let data;
            try { data = JSON.parse(jsonStr); } catch { return; }
            handleEvent(eventType, data);
        };

        const processBuffer = (flush = false) => {
            let separatorIndex = buffer.indexOf("\n\n");
            while (separatorIndex !== -1) {
                const rawEvent = buffer.slice(0, separatorIndex);
                buffer = buffer.slice(separatorIndex + 2);
                processRawSSEEvent(rawEvent);
                separatorIndex = buffer.indexOf("\n\n");
            }

            if (flush && buffer.trim()) {
                processRawSSEEvent(buffer);
                buffer = "";
            }
        };

        const headerSessionId = response.headers.get("X-Instruction-Session-Id");
        if (headerSessionId) state.sessionId = headerSessionId;
        const headerRequestId = response.headers.get("X-Instruction-Request-Id");
        if (headerRequestId) setActiveRequestId(headerRequestId);
        startLiveStatusTicker();
        startStatePolling();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    buffer += decoder.decode();
                    buffer = buffer.replace(/\r\n/g, "\n");
                    processBuffer(true);
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                buffer = buffer.replace(/\r\n/g, "\n");
                processBuffer(false);
            }
        } catch (streamError) {
            if (streamError?.name === "AbortError") throw streamError;
            if (!cancelledByState) throw streamError;
        } finally {
            stopStatePolling();
            stopLiveStatusTicker();
        }

        renderContentNow(true);
        renderTotalElapsedMeta(errorHandled);
        scrollToBottom(true);
        return { fullContent };
    }

    // ─── Resume Active Request ──────────────────────────────────────────

    async function resumeActiveRequest(requestId) {
        if (state.sending) return; // Already processing

        state.isUserNearBottom = isNearMessagesBottom();
        state.sending = true;
        updateSendButton();

        const aiMsg = appendStreamingMessage();
        const contentEl = aiMsg.querySelector(".ic-msg-content");

        state.abortController = new AbortController();

        try {
            const response = await fetch(`/api/instruction-ai2/stream/resume?requestId=${encodeURIComponent(requestId)}`, {
                signal: state.abortController.signal,
            });

            // If 404 — request completed while we were away, reload session
            if (response.status === 404) {
                // Remove streaming message and reload session from DB
                aiMsg.remove();
                state.activeRequestId = null;
                try { sessionStorage.removeItem("ic2_activeRequestId"); } catch (e) { }
                const lastSession = await loadLatestSession(state.selectedId);
                if (lastSession?.sessionId && lastSession?.history?.length > 0) {
                    state.sessionId = lastSession.sessionId;
                    state.history = lastSession.history;
                    state.totalTokens = lastSession.totalTokens || 0;
                    state.totalChanges = lastSession.totalChanges || 0;
                    // Re-render messages
                    dom.messages.innerHTML = "";
                    for (const msg of state.history) {
                        if (msg.role === "user") appendMessage("user", msg.content);
                        else if (msg.role === "assistant" && msg.content && !msg.tool_calls) appendMessage("ai", msg.content);
                    }
                    updateStatusBar();
                }
                return;
            }

            if (!response.ok) {
                contentEl.innerHTML = formatContent("❌ ไม่สามารถต่อเนื่องได้");
                return;
            }

            const result = await handleSSEStream(response, aiMsg, contentEl);
            let historyRecovered = false;

            if (!result.fullContent && !(state._lastAssistantMessages && state._lastAssistantMessages.length)) {
                const recovered = await recoverMissingAssistantResult(contentEl);
                if (recovered.recovered) {
                    result.fullContent = recovered.content || "";
                    historyRecovered = true;
                }
            }

            const latestAssistantContent = (() => {
                for (let i = state.history.length - 1; i >= 0; i--) {
                    const msg = state.history[i];
                    if (msg && msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
                        return msg.content.trim();
                    }
                }
                return "";
            })();
            const isReplayDuplicate =
                result.fullContent &&
                latestAssistantContent &&
                result.fullContent.trim() === latestAssistantContent;

            if (isReplayDuplicate) {
                aiMsg.remove();
                state._lastAssistantMessages = null;
            } else if (result.fullContent && !historyRecovered) {
                const fullMsgs = state._lastAssistantMessages;
                if (fullMsgs && fullMsgs.length > 0) {
                    for (const m of fullMsgs) state.history.push(m);
                } else {
                    state.history.push({ role: "assistant", content: result.fullContent });
                }
                state._lastAssistantMessages = null;
            }

            saveSession();
        } catch (err) {
            if (err.name === "AbortError") {
                const answerEl = ensureAgentAnswer(aiMsg, contentEl);
                answerEl.innerHTML += formatContent("\n\n⏹️ หยุดการตอบ");
            } else {
                const answerEl = ensureAgentAnswer(aiMsg, contentEl);
                answerEl.innerHTML = formatContent(`❌ เกิดข้อผิดพลาด: ${err.message}`);
            }
        } finally {
            state.sending = false;
            state.abortController = null;
            state.activeRequestId = null;
            try { sessionStorage.removeItem("ic2_activeRequestId"); } catch (e) { }
            updateSendButton();
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
        const hasTextContent = typeof content === "string" && content.trim().length > 0;
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
                    ${hasTextContent ? `<div class="ic-msg-content">${formatContent(content)}</div>` : ""}
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
        const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
        const metaText = wordCount > 0 ? `(${wordCount} words)` : "...";
        block.innerHTML = `
        <div class="ic-thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="ic-thinking-icon"><i class="fas fa-lightbulb"></i> Thinking <span class="ic-thinking-meta">${metaText}</span></span>
            <i class="fas fa-chevron-down ic-chevron"></i>
        </div>
        <div class="ic-thinking-body">${escapeHtml(content)}</div>`;
        return block;
    }

    function ensureAgentRun(aiMsg, contentEl) {
        const content = contentEl || aiMsg?.querySelector(".ic-msg-content");
        if (!content) return { run: null, activity: null, answer: null };

        let run = Array.from(content.children).find((child) => child.classList?.contains("ic-agent-run"));
        if (!run) {
            content.innerHTML = "";
            run = document.createElement("div");
            run.className = "ic-agent-run";
            run.setAttribute("role", "group");
            run.setAttribute("aria-label", "AI response activity");

            const activity = document.createElement("div");
            activity.className = "ic-agent-activity";
            activity.setAttribute("aria-live", "polite");

            const answer = document.createElement("div");
            answer.className = "ic-agent-answer";
            answer.setAttribute("aria-live", "polite");

            run.appendChild(activity);
            run.appendChild(answer);
            content.appendChild(run);
        }

        let activity = run.querySelector(".ic-agent-activity");
        if (!activity) {
            activity = document.createElement("div");
            activity.className = "ic-agent-activity";
            activity.setAttribute("aria-live", "polite");
            run.insertBefore(activity, run.firstChild);
        }

        let answer = run.querySelector(".ic-agent-answer");
        if (!answer) {
            answer = document.createElement("div");
            answer.className = "ic-agent-answer";
            answer.setAttribute("aria-live", "polite");
            run.appendChild(answer);
        }

        return { run, activity, answer };
    }

    function ensureAgentAnswer(aiMsg, contentEl) {
        return ensureAgentRun(aiMsg, contentEl).answer || contentEl;
    }

    function ensureAgentTranscript(aiMsg, contentEl) {
        const { activity } = ensureAgentRun(aiMsg, contentEl);
        if (!activity) return { transcript: null, body: null, items: null };

        let transcript = activity.querySelector(".ic-run-transcript");
        if (!transcript) {
            transcript = document.createElement("div");
            transcript.className = "ic-run-card ic-run-transcript";
            transcript.innerHTML = `
                <button class="ic-run-card-header ic-run-transcript-header" type="button" aria-expanded="true">
                    <span class="ic-run-card-left">
                        <span class="ic-run-card-icon transcript"><i class="fas fa-list-check"></i></span>
                        <span class="ic-run-card-title-wrap">
                            <span class="ic-run-card-title">ขั้นตอนการทำงาน</span>
                            <span class="ic-run-card-subtitle ic-run-transcript-subtitle">กำลังเริ่มต้น</span>
                        </span>
                    </span>
                    <span class="ic-run-card-meta ic-run-transcript-meta">live</span>
                    <i class="fas fa-chevron-down ic-run-card-chevron"></i>
                </button>
                <div class="ic-run-card-body ic-run-transcript-body">
                    <div class="ic-run-transcript-status"></div>
                    <div class="ic-run-transcript-items"></div>
                </div>`;
            activity.appendChild(transcript);
            bindRunCardToggle(transcript);
        }

        return {
            transcript,
            body: transcript.querySelector(".ic-run-transcript-body"),
            items: transcript.querySelector(".ic-run-transcript-items"),
        };
    }

    function refreshAgentTranscript(aiMsg, contentEl, options = {}) {
        const { transcript } = ensureAgentTranscript(aiMsg, contentEl);
        if (!transcript) return;
        const commentaryCount = transcript.querySelectorAll(".ic-run-commentary").length;
        const toolCount = transcript.querySelectorAll(".ic-tool-card").length;
        const reasoningCount = transcript.querySelectorAll(".ic-run-reasoning").length;
        const summaryCount = transcript.querySelectorAll(".ic-tools-used").length;
        const activeCount = commentaryCount + toolCount + reasoningCount + summaryCount;
        const subtitle = transcript.querySelector(".ic-run-transcript-subtitle");
        const meta = transcript.querySelector(".ic-run-transcript-meta");

        const parts = [];
        if (commentaryCount) parts.push(`${commentaryCount} ข้อความระหว่างทาง`);
        if (toolCount) parts.push(`ใช้ ${toolCount} เครื่องมือ`);
        if (reasoningCount) parts.push("มี reasoning summary");

        if (subtitle) {
            subtitle.textContent = parts.join(" · ") || options.label || "กำลังประมวลผล";
        }
        if (meta) {
            meta.textContent = options.complete
                ? (activeCount ? "พับไว้" : "เสร็จแล้ว")
                : (options.label || "live");
        }
    }

    function getTranscriptItemByKey(aiMsg, contentEl, key) {
        if (!key) return null;
        const { transcript } = ensureAgentTranscript(aiMsg, contentEl);
        if (!transcript) return null;
        return transcript.querySelector(`[data-timeline-key="${CSS.escape(String(key))}"]`);
    }

    function reorderTranscriptItems(aiMsg, contentEl, orderedKeys = []) {
        if (!Array.isArray(orderedKeys) || orderedKeys.length === 0) return;
        const { items } = ensureAgentTranscript(aiMsg, contentEl);
        if (!items) return;
        for (const key of orderedKeys) {
            const item = getTranscriptItemByKey(aiMsg, contentEl, key);
            if (item) items.appendChild(item);
        }
        items.querySelectorAll(".ic-tools-used").forEach((summary) => items.appendChild(summary));
        refreshAgentTranscript(aiMsg, contentEl);
    }

    function collapseAgentTranscript(aiMsg, contentEl, collapsed = true) {
        const { transcript } = ensureAgentTranscript(aiMsg, contentEl);
        if (!transcript) return;
        const hasActivity = Boolean(transcript.querySelector(".ic-run-commentary, .ic-tool-card, .ic-run-reasoning, .ic-tools-used"));
        if (!hasActivity && collapsed) return;
        transcript.classList.toggle("complete", Boolean(collapsed));
        setRunCardCollapsed(transcript, Boolean(collapsed));
        refreshAgentTranscript(aiMsg, contentEl, { complete: Boolean(collapsed) });
    }

    function ensureAgentRunStatus(aiMsg, contentEl) {
        const { transcript } = ensureAgentTranscript(aiMsg, contentEl);
        const statusHost = transcript?.querySelector(".ic-run-transcript-status");
        if (!statusHost) return null;

        let status = statusHost.querySelector(".ic-run-status");
        if (status) return status;

        status = document.createElement("div");
        status.className = "ic-run-status active";
        status.innerHTML = `
            <div class="ic-run-status-mark" aria-hidden="true">
                <span class="ic-run-status-spinner"></span>
                <i class="fas fa-check ic-run-status-done"></i>
                <i class="fas fa-triangle-exclamation ic-run-status-error"></i>
            </div>
            <div class="ic-run-status-main">
                <div class="ic-run-status-label">AI กำลังคิด</div>
                <div class="ic-run-status-detail">เริ่มประมวลผล</div>
            </div>
            <div class="ic-run-status-time">0s</div>`;
        statusHost.appendChild(status);
        return status;
    }

    function getAgentStatusDetail(options = {}) {
        const parts = [];
        if (Number.isFinite(options.iteration) && options.iteration > 1) {
            parts.push(`รอบที่ ${options.iteration}`);
        }
        if (options.tool) {
            parts.push(`เครื่องมือ ${options.tool}`);
        }
        if (options.phase === "responding") {
            parts.push("กำลังส่งข้อความแบบสตรีม");
        }
        if (options.phase === "done") {
            parts.push("คำตอบและ activity พร้อมแล้ว");
        }
        if (options.phase === "error") {
            parts.push("หยุดการประมวลผล");
        }
        return parts.join(" · ") || "กำลังประมวลผล";
    }

    function setAgentRunStatus(aiMsg, contentEl, options = {}) {
        const status = ensureAgentRunStatus(aiMsg, contentEl);
        if (!status) return;

        const phase = options.phase || "thinking";
        status.classList.toggle("active", !options.done && !options.error);
        status.classList.toggle("done", Boolean(options.done));
        status.classList.toggle("error", Boolean(options.error));
        status.dataset.phase = phase;

        const label = status.querySelector(".ic-run-status-label");
        const detail = status.querySelector(".ic-run-status-detail");
        const time = status.querySelector(".ic-run-status-time");
        if (label) label.textContent = options.label || "กำลังประมวลผล";
        if (detail) detail.textContent = getAgentStatusDetail({ ...options, phase });
        if (time && Number.isFinite(options.elapsedSec)) {
            time.textContent = `${Math.max(0, Math.floor(options.elapsedSec))}s`;
        }
        refreshAgentTranscript(aiMsg, contentEl, {
            label: options.label || "กำลังประมวลผล",
            complete: Boolean(options.done || options.error),
        });
    }

    function finalizeAgentRun(aiMsg, contentEl, options = {}) {
        const { run, activity } = ensureAgentRun(aiMsg, contentEl);
        if (!run || !activity) return;
        run.classList.toggle("is-complete", !options.error);
        run.classList.toggle("is-error", Boolean(options.error));
        const hasActivity = Boolean(activity.querySelector(".ic-run-commentary, .ic-tool-card, .ic-run-reasoning, .ic-tools-used"));
        run.classList.toggle("is-minimal", !hasActivity);
        activity.querySelectorAll(".ic-tool-card.running, .ic-tool-card.queued").forEach((card) => {
            card.classList.remove("running", "queued");
            card.classList.add(options.error ? "error" : "done");
            updateToolCardChrome(card, options.error ? "error" : "done");
        });
    }

    function bindRunCardToggle(card) {
        const header = card?.querySelector(".ic-run-card-header");
        const body = card?.querySelector(".ic-run-card-body");
        if (!header || !body || header.dataset.bound === "true") return;
        header.dataset.bound = "true";
        header.addEventListener("click", () => {
            setRunCardCollapsed(card, !card.classList.contains("collapsed"));
        });
    }

    function setRunCardCollapsed(card, collapsed) {
        if (!card) return;
        card.classList.toggle("collapsed", Boolean(collapsed));
        const header = card.querySelector(".ic-run-card-header");
        if (header) header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    function ensureAgentReasoningBlock(aiMsg, contentEl) {
        const { transcript, items } = ensureAgentTranscript(aiMsg, contentEl);
        if (!items) return null;

        let card = transcript.querySelector(".ic-run-reasoning");
        if (card) return card;

        card = document.createElement("div");
        card.className = "ic-run-card ic-run-reasoning";
        card.innerHTML = `
            <button class="ic-run-card-header" type="button" aria-expanded="true">
                <span class="ic-run-card-left">
                    <span class="ic-run-card-icon reasoning"><i class="fas fa-lightbulb"></i></span>
                    <span class="ic-run-card-title-wrap">
                        <span class="ic-run-card-title">สรุปแนวคิดของโมเดล</span>
                        <span class="ic-run-card-subtitle">reasoning summary</span>
                    </span>
                </span>
                <span class="ic-run-card-meta ic-reasoning-meta">กำลังสรุป</span>
            </button>
            <div class="ic-run-card-body">
                <div class="ic-run-reasoning-text"></div>
            </div>`;
        items.appendChild(card);
        refreshAgentTranscript(aiMsg, contentEl);
        return card;
    }

    function updateReasoningMeta(card, wordCountOverride = null) {
        const textEl = card?.querySelector(".ic-run-reasoning-text");
        const meta = card?.querySelector(".ic-reasoning-meta");
        if (!textEl || !meta) return;
        const wordCount = Number.isFinite(wordCountOverride)
            ? wordCountOverride
            : textEl.textContent.split(/\s+/).filter(Boolean).length;
        meta.textContent = wordCount > 0 ? `${wordCount} คำ` : "กำลังสรุป";
    }

    function appendAgentReasoningDelta(aiMsg, contentEl, delta) {
        const card = ensureAgentReasoningBlock(aiMsg, contentEl);
        const textEl = card?.querySelector(".ic-run-reasoning-text");
        if (!textEl || !delta) return;
        textEl.textContent += delta;
        updateReasoningMeta(card);
    }

    function setAgentReasoningText(aiMsg, contentEl, text) {
        const safeText = typeof text === "string" ? text : "";
        if (!safeText.trim()) return;
        const card = ensureAgentReasoningBlock(aiMsg, contentEl);
        const textEl = card?.querySelector(".ic-run-reasoning-text");
        if (!textEl) return;
        if (textEl.textContent.length > safeText.length && textEl.textContent.startsWith(safeText)) return;
        textEl.textContent = safeText;
        updateReasoningMeta(card);
    }

    function completeAgentReasoning(aiMsg, contentEl, wordCount) {
        const card = ensureAgentReasoningBlock(aiMsg, contentEl);
        if (!card) return;
        card.classList.add("complete");
        updateReasoningMeta(card, Number.isFinite(wordCount) ? wordCount : null);
        refreshAgentTranscript(aiMsg, contentEl);
    }

    function ensureAgentCommentaryBlock(aiMsg, contentEl, commentaryId = null) {
        const { transcript, items } = ensureAgentTranscript(aiMsg, contentEl);
        if (!items) return null;

        let block = null;
        if (commentaryId) {
            block = transcript.querySelector(`.ic-run-commentary[data-commentary-id="${CSS.escape(String(commentaryId))}"]`);
        }
        if (block) return block;

        block = document.createElement("div");
        block.className = "ic-run-commentary";
        if (commentaryId) block.dataset.commentaryId = String(commentaryId);
        if (commentaryId) block.dataset.timelineKey = `commentary:${String(commentaryId)}`;
        block.innerHTML = `
            <div class="ic-run-commentary-label">
                <i class="fas fa-message" aria-hidden="true"></i>
                <span>ข้อความระหว่างทำงาน</span>
                <span class="ic-run-commentary-round"></span>
            </div>
            <div class="ic-run-commentary-text"></div>`;
        items.appendChild(block);
        refreshAgentTranscript(aiMsg, contentEl);
        return block;
    }

    function setAgentCommentaryText(aiMsg, contentEl, text, options = {}) {
        const safeText = typeof text === "string" ? text : String(text || "");
        if (!safeText.trim()) return;
        const block = ensureAgentCommentaryBlock(aiMsg, contentEl, options.commentaryId || null);
        const textEl = block?.querySelector(".ic-run-commentary-text");
        if (!block || !textEl) return;

        const currentText = options.append ? (block.dataset.rawText || "") : "";
        const nextText = `${currentText}${safeText}`;
        block.dataset.rawText = nextText;
        if (options.commentaryId) {
            block.dataset.timelineKey = `commentary:${String(options.commentaryId)}`;
        }
        textEl.innerHTML = formatContent(nextText);
        block.classList.toggle("complete", Boolean(options.complete));

        const round = block.querySelector(".ic-run-commentary-round");
        if (round) {
            round.textContent = Number.isFinite(options.iteration) && options.iteration > 1
                ? `รอบ ${options.iteration}`
                : "";
        }
        refreshAgentTranscript(aiMsg, contentEl, { complete: Boolean(options.complete) });
    }

    function completeAgentCommentary(aiMsg, contentEl) {
        const { transcript } = ensureAgentTranscript(aiMsg, contentEl);
        if (!transcript) return;
        transcript.querySelectorAll(".ic-run-commentary").forEach((block) => {
            block.classList.add("complete");
        });
        refreshAgentTranscript(aiMsg, contentEl, { complete: true });
    }

    // ─── Image Upload Helpers ────────────────────────────────────────────

    function handleImageSelect(e) {
        const files = Array.from(e.target.files || []).slice(0, 10);
        if (!files.length) return;

        for (const file of files) {
            if (state.pendingImages.length >= 10) break;
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
                <button class="ic-preview-remove" data-idx="${i}" title="ลบ" aria-label="ลบรูปภาพที่ ${i + 1}">&times;</button>
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

    function clipAgentText(text, maxLength = 1800) {
        const safeText = typeof text === "string" ? text : String(text || "");
        if (safeText.length <= maxLength) return safeText;
        return `${safeText.slice(0, maxLength)}\n…`;
    }

    function formatToolPayload(payload) {
        if (payload === null || payload === undefined || payload === "") return "";
        if (typeof payload === "string") {
            const raw = payload.trim();
            if (!raw) return "";
            try {
                return clipAgentText(JSON.stringify(JSON.parse(raw), null, 2));
            } catch (e) {
                return clipAgentText(raw);
            }
        }
        try {
            return clipAgentText(JSON.stringify(payload, null, 2));
        } catch (e) {
            return clipAgentText(String(payload));
        }
    }

    function getToolStatusLabel(status) {
        return {
            queued: "รอเรียก",
            running: "กำลังรัน",
            done: "เสร็จแล้ว",
            error: "ผิดพลาด",
        }[status] || "กำลังประมวลผล";
    }

    function ensureAgentToolContainer(aiMsg, contentEl) {
        const { items } = ensureAgentTranscript(aiMsg, contentEl);
        if (!items) return null;
        return items;
    }

    function findAgentToolCard(container, toolName, callId = null) {
        const cards = Array.from(container?.querySelectorAll(".ic-tool-card") || []);
        if (callId) {
            const byCallId = cards.find((card) => card.dataset.callId === String(callId));
            if (byCallId) return byCallId;
        }
        const matching = cards.filter((card) => card.dataset.tool === toolName);
        return matching.find((card) => card.classList.contains("running") || card.classList.contains("queued")) ||
            matching[matching.length - 1] ||
            null;
    }

    function updateToolCardChrome(card, status = "running", summary = "") {
        if (!card) return;
        card.classList.remove("queued", "running", "done", "error");
        card.classList.add(status);
        card.dataset.status = status;
        if (summary) {
            card.dataset.resultSummary = summarizeToolPayload(summary, 96);
        }
        const badge = card.querySelector(".ic-tool-card-badge");
        if (badge) badge.textContent = getToolStatusLabel(status);
        refreshToolCardSummary(card);
    }

    function normalizeToolBriefText(text, maxLength = 110) {
        const normalized = String(text || "")
            .replace(/\s+/g, " ")
            .replace(/[{}"]/g, "")
            .trim();
        return clipAgentText(normalized, maxLength);
    }

    function summarizeToolPayload(payload, maxLength = 110) {
        if (payload === null || payload === undefined || payload === "") return "";
        let value = payload;
        if (typeof payload === "string") {
            const raw = payload.trim();
            if (!raw) return "";
            try {
                value = JSON.parse(raw);
            } catch (e) {
                return normalizeToolBriefText(raw, maxLength);
            }
        }

        if (value && typeof value === "object" && !Array.isArray(value)) {
            const parts = Object.entries(value)
                .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
                .slice(0, 3)
                .map(([key, entryValue]) => {
                    const briefValue = typeof entryValue === "object"
                        ? JSON.stringify(entryValue)
                        : String(entryValue);
                    return `${key}: ${normalizeToolBriefText(briefValue, 42)}`;
                });
            if (parts.length) return normalizeToolBriefText(parts.join(" · "), maxLength);
        }

        try {
            return normalizeToolBriefText(JSON.stringify(value), maxLength);
        } catch (e) {
            return normalizeToolBriefText(String(value), maxLength);
        }
    }

    function refreshToolCardSummary(card) {
        const subtitle = card?.querySelector(".ic-run-card-subtitle");
        if (!subtitle) return;
        const status = card.dataset.status || "running";
        const parts = [];
        if (card.dataset.argsSummary) parts.push(card.dataset.argsSummary);
        if (card.dataset.resultSummary) parts.push(card.dataset.resultSummary);
        subtitle.textContent = parts.filter(Boolean).join(" · ") || getToolStatusLabel(status);
    }

    function setToolCardArguments(card, payload) {
        const text = formatToolPayload(payload);
        const section = card?.querySelector(".ic-tool-card-args");
        const pre = card?.querySelector(".ic-tool-card-args-text");
        if (!section || !pre) return;
        section.hidden = !text;
        pre.textContent = text;
        card.dataset.argsSummary = text ? summarizeToolPayload(payload, 108) : "";
        refreshToolCardSummary(card);
    }

    function setToolCardResult(card, summary) {
        const text = clipAgentText(summary || "", 1200);
        const section = card?.querySelector(".ic-tool-card-result");
        const resultEl = card?.querySelector(".ic-tool-card-result-text");
        if (!section || !resultEl) return;
        section.hidden = !text;
        resultEl.textContent = text;
        card.dataset.resultSummary = text ? summarizeToolPayload(summary, 96) : "";
        refreshToolCardSummary(card);
    }

    function upsertAgentToolCard(aiMsg, contentEl, toolName, options = {}) {
        if (!aiMsg || !toolName) return null;
        const toolsEl = ensureAgentToolContainer(aiMsg, contentEl);
        if (!toolsEl) return null;

        const callId = options.callId ? String(options.callId) : "";
        const status = options.status || "running";
        const type = getToolType(toolName);
        const icon = getToolIcon(type);
        const timelineKey = callId ? `tool:${callId}` : "";
        let card = timelineKey
            ? getTranscriptItemByKey(aiMsg, contentEl, timelineKey)
            : findAgentToolCard(toolsEl, toolName, callId);

        if (!card) {
            const toolBodyId = `ic-tool-body-${Math.random().toString(36).slice(2, 9)}`;
            card = document.createElement("div");
            card.className = "ic-run-card ic-tool-card collapsed";
            card.dataset.tool = toolName;
            card.dataset.type = type;
            if (callId) card.dataset.callId = callId;
            if (timelineKey) card.dataset.timelineKey = timelineKey;
            card.innerHTML = `
                <button class="ic-run-card-header" type="button" aria-expanded="false" aria-controls="${toolBodyId}" title="ดูรายละเอียด tool">
                    <span class="ic-run-card-left">
                        <span class="ic-run-card-icon tool"><i class="fas ${icon}"></i></span>
                        <span class="ic-run-card-title-wrap">
                            <span class="ic-run-card-title"></span>
                            <span class="ic-run-card-subtitle"></span>
                        </span>
                    </span>
                    <span class="ic-tool-card-badge"></span>
                    <i class="fas fa-chevron-down ic-run-card-chevron"></i>
                </button>
                <div class="ic-run-card-body" id="${toolBodyId}">
                    <div class="ic-tool-card-args" hidden>
                        <div class="ic-tool-card-section-label">arguments</div>
                        <pre class="ic-tool-card-args-text"></pre>
                    </div>
                    <div class="ic-tool-card-result" hidden>
                        <div class="ic-tool-card-section-label">result</div>
                        <div class="ic-tool-card-result-text"></div>
                    </div>
                </div>`;
            toolsEl.appendChild(card);
            bindRunCardToggle(card);
            refreshAgentTranscript(aiMsg, contentEl);
        }

        if (callId) card.dataset.callId = callId;
        if (timelineKey) card.dataset.timelineKey = timelineKey;
        card.dataset.tool = toolName;
        card.dataset.type = type;
        const title = card.querySelector(".ic-run-card-title");
        if (title) title.textContent = toolName;
        updateToolCardChrome(card, status, options.summary || "");

        const hasArgs = options.args !== undefined && options.args !== null;
        const hasArgumentText = typeof options.argumentsText === "string" && options.argumentsText.trim();
        if (hasArgs || hasArgumentText) {
            setToolCardArguments(card, hasArgs ? options.args : options.argumentsText);
        }
        if (options.summary) {
            setToolCardResult(card, options.summary);
        }

        refreshAgentTranscript(aiMsg, contentEl);
        return card;
    }

    function updateToolArgumentsInPipeline(aiMsg, toolName, argumentsText, callId = null) {
        const contentEl = aiMsg?.querySelector(".ic-msg-content");
        const toolsEl = ensureAgentToolContainer(aiMsg, contentEl);
        const existing = findAgentToolCard(toolsEl, toolName, callId);
        const status = existing?.classList.contains("running")
            ? "running"
            : existing?.classList.contains("done")
                ? "done"
                : existing?.classList.contains("error")
                    ? "error"
                    : "queued";
        const card = upsertAgentToolCard(aiMsg, contentEl, toolName, {
            callId,
            status,
            argumentsText,
        });
        if (card) setToolCardArguments(card, argumentsText);
    }

    function getToolType(toolName) {
        if (!toolName) return "search";
        if (toolName.includes("search") || toolName.includes("get")) return "search";
        if (toolName.includes("update") || toolName.includes("rename")) return "edit";
        if (toolName.includes("add") || toolName.includes("create")) return "add";
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
        const aiMsg = body?.closest(".ic-msg");
        if (!aiMsg) return;
        ensureAgentToolContainer(aiMsg, contentEl || aiMsg.querySelector(".ic-msg-content"));
    }

    function refreshToolPipelineHeader(pipeline) {
        // Kept as a compatibility no-op for older call sites.
    }

    function addToolToPipeline(body, toolName, args, options = {}) {
        const aiMsg = body?.closest(".ic-msg");
        const contentEl = aiMsg?.querySelector(".ic-msg-content");
        upsertAgentToolCard(aiMsg, contentEl, toolName, {
            args,
            callId: options.callId,
            status: options.status || "running",
            argumentsText: options.argumentsText || "",
        });
    }

    function updateToolInPipeline(aiMsg, toolName, summary, callId = null) {
        const contentEl = aiMsg?.querySelector(".ic-msg-content");
        upsertAgentToolCard(aiMsg, contentEl, toolName, {
            callId,
            status: String(summary || "").startsWith("❌") ? "error" : "done",
            summary,
        });
    }

    function renderToolsUsedSummary(body, tools) {
        if (!body || !Array.isArray(tools) || tools.length === 0) return;
        const aiMsg = body.closest(".ic-msg");
        const contentEl = aiMsg?.querySelector(".ic-msg-content");
        const { items } = ensureAgentTranscript(aiMsg, contentEl);
        const container = items || body;
        let summary = container.querySelector(".ic-tools-used:not(.ic-version-snapshot)");
        if (!summary) {
            summary = document.createElement("div");
            summary.className = "ic-tools-used";
            container.appendChild(summary);
        }
        const uniqueTools = [...new Set(tools)];
        summary.textContent = `ใช้เครื่องมือ ${uniqueTools.length} รายการ: ${uniqueTools.join(", ")}`;
        refreshAgentTranscript(aiMsg, contentEl, { complete: true });
    }

    function renderVersionSnapshotSummary(body, snapshot) {
        if (!body || !snapshot || !Number.isInteger(snapshot.version)) return;
        let summary = body.querySelector(".ic-version-snapshot");
        if (!summary) {
            summary = document.createElement("div");
            summary.className = "ic-tools-used ic-version-snapshot";
            body.appendChild(summary);
        }
        const source = snapshot.auto ? "auto" : "tool";
        const note = snapshot.note ? ` — ${snapshot.note}` : "";
        summary.textContent = `Version saved: v${snapshot.version} (${source})${note}`;
    }

    // ─── Session Persistence ────────────────────────────────────────────

    function generateSessionId() {
        return `ses_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
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
            const res = await fetch("/api/instruction-ai2/sessions?instructionId=" + encodeURIComponent(instructionId));
            const data = await res.json();
            if (data.success && data.sessions && data.sessions.length > 0) {
                return data.sessions[0];
            }
        } catch (err) {
            console.warn("Failed to load sessions:", err);
        }
        return null;
    }

    async function loadInventory(instructionId = state.selectedId) {
        if (!instructionId) return null;
        if (dom.inventoryTitle) dom.inventoryTitle.textContent = "กำลังโหลด inventory...";
        try {
            const res = await fetch(`/api/instruction-ai2/inventory/${encodeURIComponent(instructionId)}`, {
                cache: "no-store",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || "โหลด inventory ไม่สำเร็จ");
            }
            state.inventory = data.inventory;
            try {
                const [analyticsRes, episodesRes, readinessRes, recommendationsRes, evalRes, toolRegistryRes] = await Promise.all([
                    fetch(`/api/instruction-ai2/analytics/${encodeURIComponent(instructionId)}`, { cache: "no-store" }),
                    fetch(`/api/instruction-ai2/analytics/${encodeURIComponent(instructionId)}/episodes?limit=20`, { cache: "no-store" }),
                    fetch(`/api/instruction-ai2/readiness/${encodeURIComponent(instructionId)}`, { cache: "no-store" }),
                    fetch(`/api/instruction-ai2/recommendations/${encodeURIComponent(instructionId)}`, { cache: "no-store" }),
                    fetch(`/api/instruction-ai2/eval/${encodeURIComponent(instructionId)}`, { cache: "no-store" }),
                    fetch("/api/instruction-ai2/tool-registry", { cache: "no-store" }),
                ]);
                const analytics = await analyticsRes.json().catch(() => null);
                const episodes = await episodesRes.json().catch(() => null);
                const readiness = await readinessRes.json().catch(() => null);
                const recommendations = await recommendationsRes.json().catch(() => null);
                const evalSuite = await evalRes.json().catch(() => null);
                const toolRegistry = await toolRegistryRes.json().catch(() => null);
                state.inventory.analytics = analytics?.success ? analytics : null;
                state.inventory.episodes = episodes?.success ? episodes : null;
                state.inventory.readiness = readiness?.success ? readiness : state.inventory.readiness;
                state.inventory.recommendations = recommendations?.success ? recommendations : state.inventory.recommendations;
                state.inventory.evalSuite = evalSuite?.success ? evalSuite : state.inventory.sections?.eval?.suite || null;
                state.inventory.toolRegistry = toolRegistry?.success ? toolRegistry : state.inventory.toolRegistry;
            } catch (e) {
                state.inventory.analytics = null;
                state.inventory.episodes = null;
            }
            renderInventory();
            return state.inventory;
        } catch (err) {
            if (dom.inventoryBody) {
                dom.inventoryBody.innerHTML = `<div class="ic-sidebar-loading"><span style="color: var(--ic-danger);">${escapeHtml(err.message)}</span></div>`;
            }
            return null;
        }
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function getLatestAssistantMessage(history = []) {
        if (!Array.isArray(history)) return null;
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg && msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
                return msg;
            }
        }
        return null;
    }

    async function recoverMissingAssistantResult(contentEl) {
        if (!state.selectedId) return { recovered: false, content: "" };

        for (let attempt = 0; attempt < 3; attempt++) {
            const latestSession = await loadLatestSession(state.selectedId);
            if (latestSession?.history?.length) {
                const serverLastAssistant = getLatestAssistantMessage(latestSession.history);
                const localLastAssistant = getLatestAssistantMessage(state.history);
                const hasNewAssistant = Boolean(
                    serverLastAssistant &&
                    (!localLastAssistant || serverLastAssistant.content.trim() !== localLastAssistant.content.trim())
                );

                if (hasNewAssistant) {
                    state.sessionId = latestSession.sessionId || state.sessionId;
                    state.history = latestSession.history;
                    state.totalTokens = latestSession.totalTokens || state.totalTokens;
                    state.totalChanges = latestSession.totalChanges || state.totalChanges;

                    if (contentEl && serverLastAssistant.content) {
                        const aiMsg = contentEl.closest(".ic-msg");
                        const answerEl = ensureAgentAnswer(aiMsg, contentEl);
                        answerEl.innerHTML = formatContent(serverLastAssistant.content);
                        scrollToBottom();
                    }

                    updateStatusBar();
                    return { recovered: true, content: serverLastAssistant.content };
                }
            }

            if (attempt < 2) await wait(600);
        }

        return { recovered: false, content: "" };
    }

    // ─── AI2 Batch Preview ─────────────────────────────────────────────

    function summarizeBatchValue(value, maxLength = 600) {
        if (value === null || value === undefined) return "ว่าง";
        if (typeof value === "string") return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
        try {
            const text = JSON.stringify(value, null, 2);
            return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
        } catch (e) {
            return String(value);
        }
    }

    function getBatchRiskMeta(risk = "") {
        const normalized = String(risk || "safe_write").toLowerCase();
        if (normalized.includes("destructive")) return { label: "ลบ/ย้อนกลับยาก", className: "danger" };
        if (normalized.includes("global") || normalized.includes("runtime")) return { label: "กระทบ Runtime", className: "warning" };
        if (normalized.includes("risky")) return { label: "ควรตรวจ", className: "warning" };
        return { label: "ปลอดภัย", className: "safe" };
    }

    function getBatchTargetLabel(change = {}) {
        const target = change.target || {};
        const parts = [];
        if (target.type) parts.push(target.type);
        if (target.itemId) parts.push(`item ${target.itemId}`);
        if (Number.isFinite(Number(target.rowIndex))) parts.push(`row ${Number(target.rowIndex) + 1}`);
        if (target.column) parts.push(`column ${target.column}`);
        if (Array.isArray(target.pageKeys) && target.pageKeys.length) parts.push(`${target.pageKeys.length} pages`);
        if (target.pageKey) parts.push(target.pageKey);
        if (target.assetId) parts.push(`asset ${target.assetId}`);
        if (target.collectionId) parts.push(`collection ${target.collectionId}`);
        if (target.scope) parts.push(target.scope);
        return parts.join(" / ") || change.operation || "instruction";
    }

    function renderBatchScope(scope = []) {
        const items = Array.isArray(scope) ? scope.filter(Boolean) : [];
        if (!items.length) return "";
        return `
            <div class="ic-ai2-batch-scope">
                ${items.slice(0, 6).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
            </div>`;
    }

    function renderBatchMessages(messages = [], tone = "warning") {
        const items = Array.isArray(messages) ? messages : [];
        if (!items.length) return "";
        return `
            <div class="ic-ai2-batch-alert ${tone}">
                ${items.map((item) => escapeHtml(item.message || item.error || item.type || "warning")).join("<br>")}
            </div>`;
    }

    function renderBatchValue(value, tone) {
        if (value === null || value === undefined || value === "") {
            return `<div class="ic-ai2-batch-empty">ไม่มีข้อมูล</div>`;
        }

        if (typeof value === "object") {
            if (Array.isArray(value)) {
                if (!value.length) return `<div class="ic-ai2-batch-empty">[]</div>`;
                const simple = value.every((entry) => entry === null || ["string", "number", "boolean"].includes(typeof entry));
                if (simple && value.length <= 12) {
                    return `<div class="ic-ai2-batch-tags">${value.map((entry) => `<span>${escapeHtml(String(entry))}</span>`).join("")}</div>`;
                }
                return `<pre>${escapeHtml(summarizeBatchValue(value, 900))}</pre>`;
            }

            const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
            const shallow = entries.every(([, entryValue]) => entryValue === null || ["string", "number", "boolean"].includes(typeof entryValue));
            if (shallow && entries.length <= 12) {
                return `
                    <dl class="ic-ai2-batch-kv">
                        ${entries.map(([key, entryValue]) => `
                            <div>
                                <dt>${escapeHtml(key)}</dt>
                                <dd>${escapeHtml(String(entryValue ?? "ว่าง"))}</dd>
                            </div>`).join("")}
                    </dl>`;
            }
            return `<pre>${escapeHtml(summarizeBatchValue(value, 900))}</pre>`;
        }

        const text = String(value);
        const changedClass = tone === "after" ? "after" : "before";
        return `<pre class="${changedClass}">${escapeHtml(text.length > 900 ? `${text.slice(0, 900)}...` : text)}</pre>`;
    }

    function summarizeBatchRequest(batch = {}) {
        const request = String(batch.userMessage || "").trim();
        return request || "คำสั่งล่าสุดในแชทนี้";
    }

    function getChangeHumanReason(change = {}, batch = {}) {
        const explicit = change.reason || change.rationale || change.why;
        if (explicit) return String(explicit);
        const operation = String(change.operation || "");
        const request = summarizeBatchRequest(batch);

        if (operation === "instruction.updateSemanticMapping") {
            return "เพื่อให้ AI รู้ว่าชุดข้อมูลไหนคือ role, catalog และ scenario โดยไม่ต้องยึดชื่อชุดข้อมูลแบบตายตัว";
        }
        if (operation === "catalog.setImageToken") {
            return "เพื่อให้สินค้าอ้างรูปด้วย label/token ที่ runtime resolve ได้จริง และลดโอกาสส่งรูปผิด";
        }
        if (operation === "instruction.updateCell") {
            return `เพื่อปรับค่าหนึ่งจุดในตารางให้ตรงกับคำขอ: "${request}"`;
        }
        if (operation === "instruction.addRow") {
            return `เพื่อเพิ่มแถวข้อมูลใหม่ตามคำขอ: "${request}"`;
        }
        if (operation === "instruction.deleteRow") {
            return "เพื่อเอาแถวที่ AI เห็นว่าไม่ควรใช้ออกจากชุดข้อมูล แต่ต้องตรวจก่อนเพราะเป็นการลบ";
        }
        if (operation === "instruction.updateText") {
            return "เพื่อปรับกติกา/ข้อความ knowledge ให้บอทตอบตามเงื่อนไขที่ขอได้ชัดขึ้น";
        }
        if (operation === "instruction.createTableItem" || operation === "instruction.createTextItem") {
            return "เพื่อเพิ่มแหล่งความรู้ใหม่ให้ instruction แทนการยัดทุกอย่างไว้ในข้อความเดียว";
        }
        if (operation === "instruction.deleteDataItem") {
            return "เพื่อถอดชุดข้อมูลทั้งชุดออกจาก instruction ต้องตรวจละเอียดเพราะกระทบ knowledge ที่บอทใช้ตอบ";
        }
        if (operation.includes("Starter")) {
            return "เพื่อปรับข้อความเริ่มต้นบทสนทนาให้ตรงกับ flow ที่ต้องการก่อนลูกค้าพิมพ์";
        }
        if (operation === "page.bindInstruction") {
            return "เพื่อให้เพจ/บอทที่เลือกใช้ instruction นี้ตอนตอบลูกค้าจริง";
        }
        if (operation === "page.updateModel") {
            return "เพื่อให้เพจใช้ model/reasoning ตามค่าที่เลือกใน runtime จริง";
        }
        if (operation === "page.updateImageCollections") {
            return "เพื่อกำหนดคลังรูปที่บอทมองเห็นและใช้ส่งรูปตอนตอบลูกค้า";
        }
        if (operation.startsWith("followup.")) {
            return "เพื่อปรับข้อความติดตามลูกค้าหลังเงียบตาม scope ของเพจที่ระบุ";
        }
        if (operation.startsWith("asset.") || operation.startsWith("imageCollection.")) {
            return "เพื่อจัดการรูป/คลังรูปที่ instruction และ runtime ใช้อ้างอิง";
        }
        if (operation === "imageUsage.rebuildRegistry") {
            return "เพื่อสร้าง registry การใช้งานรูปใหม่จาก instruction, starter, follow-up, collection และ runtime response";
        }
        return `AI เสนอรายการนี้จากคำขอ "${request}" และข้อมูลจริงที่อ่านจาก instruction ล่าสุด`;
    }

    function getChangeImpact(change = {}) {
        const operation = String(change.operation || "");
        const scope = Array.isArray(change.affectedScope) ? change.affectedScope : [];
        if (operation.startsWith("page.") || scope.some((item) => /page|runtime|model/i.test(item))) {
            return "มีผลกับการตอบจริงของเพจ/บอทหลัง Approve";
        }
        if (operation.startsWith("followup.")) {
            return "มีผลกับข้อความติดตามลูกค้าของเพจที่เลือก";
        }
        if (operation.startsWith("asset.") || operation.startsWith("imageCollection.") || operation === "catalog.setImageToken") {
            return "มีผลกับรูปที่บอทเลือกส่งหรือ token รูปในสินค้า";
        }
        if (operation.includes("delete") || operation.includes("remove") || operation.includes("unlink")) {
            return "เป็นการลบ/ถอดข้อมูล ควรตรวจ before/after ก่อนอนุมัติ";
        }
        if (operation.startsWith("instruction.")) {
            return "มีผลกับ knowledge ที่บอทใช้ตอบลูกค้าจาก instruction นี้";
        }
        return "จะถูกบันทึกหลังผ่าน preflight และกด Approve เท่านั้น";
    }

    function getChangeEvidence(change = {}) {
        const items = [];
        if (change.sourceTool) items.push(`tool ${change.sourceTool}`);
        if (change.operation) items.push(change.operation);
        if (change.target?.type) items.push(change.target.type);
        if (Array.isArray(change.warnings) && change.warnings.length) items.push(`${change.warnings.length} warning`);
        if (Array.isArray(change.affectedScope) && change.affectedScope.length) items.push(change.affectedScope.join(", "));
        return items.filter(Boolean);
    }

    function renderBatchDecisionContext(batch, changes) {
        const request = summarizeBatchRequest(batch);
        const readTrace = Array.isArray(batch?.readTrace) ? batch.readTrace : [];
        const toolNames = Array.from(new Set(changes.map((change) => change.sourceTool).filter(Boolean)));
        return `
            <div class="ic-ai2-batch-context">
                <div>
                    <label>คำขอที่ทำให้เกิด batch</label>
                    <p>${escapeHtml(request)}</p>
                </div>
                <div>
                    <label>AI ใช้อะไรตัดสินใจ</label>
                    <p>${escapeHtml([
                        readTrace.length ? `อ่านข้อมูลจริง ${readTrace.length} จุด` : "อ่าน inventory ล่าสุด",
                        toolNames.length ? `เสนอผ่าน ${toolNames.slice(0, 4).join(", ")}${toolNames.length > 4 ? ` +${toolNames.length - 4}` : ""}` : "",
                    ].filter(Boolean).join(" · "))}</p>
                </div>
            </div>`;
    }

    function renderBatchPreview(batch) {
        const changes = Array.isArray(batch?.changes) ? batch.changes : [];
        const preflightErrors = Array.isArray(batch?.preflight?.errors) ? batch.preflight.errors : [];
        const preflightWarnings = Array.isArray(batch?.preflight?.warnings) ? batch.preflight.warnings : [];
        const riskCounts = changes.reduce((acc, change) => {
            const meta = getBatchRiskMeta(change.risk);
            acc[meta.className] = (acc[meta.className] || 0) + 1;
            return acc;
        }, {});
        const affectedScopes = Array.from(new Set(changes.flatMap((change) => Array.isArray(change.affectedScope) ? change.affectedScope : []))).filter(Boolean);
        if (dom.batchSummary) {
            dom.batchSummary.innerHTML = `
                <div class="ic-ai2-batch-summary-top">
                    <div>
                        <span>รอยืนยัน</span>
                        <strong>${changes.length}</strong>
                    </div>
                    <div>
                        <span>ควรตรวจ</span>
                        <strong>${(riskCounts.warning || 0) + (riskCounts.danger || 0)}</strong>
                    </div>
                    <div>
                        <span>ขอบเขต</span>
                        <strong>${affectedScopes.length || 1}</strong>
                    </div>
                </div>
                <div class="ic-ai2-batch-meta">
                    <span>Batch <code>${escapeHtml(batch.batchId || "")}</code></span>
                    ${batch.confirmation?.tokenFingerprint ? `<span>Confirm <code>${escapeHtml(batch.confirmation.tokenFingerprint)}</code></span>` : ""}
                </div>
                <div class="ic-ai2-batch-safe-note">
                    <i class="fas fa-shield-halved" aria-hidden="true"></i>
                    ยังไม่เขียนข้อมูลจริงจนกว่าจะกด Approve all
                </div>
                ${renderBatchDecisionContext(batch, changes)}
                ${renderBatchScope(affectedScopes)}
                ${renderBatchMessages(preflightErrors, "danger")}
                ${renderBatchMessages(preflightWarnings.slice(0, 6), "warning")}
            `;
        }
        if (dom.batchList) {
            dom.batchList.innerHTML = changes.map((change, index) => {
                const title = change.title || change.operation || `Change ${index + 1}`;
                const riskMeta = getBatchRiskMeta(change.risk);
                const targetLabel = getBatchTargetLabel(change);
                const warnings = Array.isArray(change.warnings) ? change.warnings : [];
                return `
                    <div class="ic-ai2-batch-item ${riskMeta.className}">
                        <div class="ic-ai2-batch-item-head">
                            <div class="ic-ai2-batch-index">${String(index + 1).padStart(2, "0")}</div>
                            <div class="ic-ai2-batch-heading">
                                <span>${escapeHtml(title)}</span>
                                <small>${escapeHtml(targetLabel)}</small>
                            </div>
                            <span class="ic-ai2-batch-risk ${riskMeta.className}">${escapeHtml(riskMeta.label)}</span>
                        </div>
                        <div class="ic-ai2-batch-operation">
                            <code>${escapeHtml(change.operation || "")}</code>
                            ${renderBatchScope(change.affectedScope)}
                        </div>
                        <div class="ic-ai2-batch-reason">
                            <label>ทำไมถึงเสนอ</label>
                            <p>${escapeHtml(getChangeHumanReason(change, batch))}</p>
                            <small>${escapeHtml(getChangeImpact(change))}</small>
                        </div>
                        ${renderBatchMessages(warnings, "warning")}
                        <div class="ic-ai2-batch-diff">
                            <div>
                                <label>ตอนนี้</label>
                                ${renderBatchValue(change.before, "before")}
                            </div>
                            <div>
                                <label>หลัง Approve</label>
                                ${renderBatchValue(change.after, "after")}
                            </div>
                        </div>
                    </div>`;
            }).join("") || `<div class="ic-version-empty">ไม่มี change ใน batch นี้</div>`;
        }
        if (dom.batchRejectReason) dom.batchRejectReason.value = "";
    }

    function renderBatchReviewCard(batch) {
        const changes = Array.isArray(batch?.changes) ? batch.changes : [];
        const preflightErrors = Array.isArray(batch?.preflight?.errors) ? batch.preflight.errors : [];
        const preflightWarnings = Array.isArray(batch?.preflight?.warnings) ? batch.preflight.warnings : [];
        const riskCounts = changes.reduce((acc, change) => {
            const meta = getBatchRiskMeta(change.risk);
            acc[meta.className] = (acc[meta.className] || 0) + 1;
            return acc;
        }, {});
        const affectedScopes = Array.from(new Set(changes.flatMap((change) => Array.isArray(change.affectedScope) ? change.affectedScope : []))).filter(Boolean);
        const previewChanges = changes.slice(0, 4);
        const statusTone = preflightErrors.length ? "danger" : ((riskCounts.warning || 0) + (riskCounts.danger || 0) ? "warning" : "safe");

        return `
            <div class="ic-batch-review-card ${statusTone}" data-batch-review-id="${escapeHtml(batch.batchId || "")}">
                <div class="ic-batch-review-head">
                    <div>
                        <span class="ic-batch-review-eyebrow">Batch รอตรวจ</span>
                        <h4>AI เตรียมข้อเสนอ ${changes.length} รายการ แต่ยังไม่บันทึกจริง</h4>
                    </div>
                    <span class="ic-batch-review-state">ต้องกด Review ก่อน</span>
                </div>

                <div class="ic-batch-review-request">
                    <label>ทำไมมี batch นี้</label>
                    <p>${escapeHtml(summarizeBatchRequest(batch))}</p>
                </div>

                <div class="ic-batch-review-metrics">
                    <div><span>รายการ</span><strong>${changes.length}</strong></div>
                    <div><span>ควรตรวจ</span><strong>${(riskCounts.warning || 0) + (riskCounts.danger || 0)}</strong></div>
                    <div><span>Block</span><strong>${preflightErrors.length}</strong></div>
                    <div><span>Scope</span><strong>${affectedScopes.length || 1}</strong></div>
                </div>

                ${renderBatchMessages(preflightErrors, "danger")}
                ${renderBatchMessages(preflightWarnings.slice(0, 4), "warning")}

                <div class="ic-batch-review-changes">
                    ${previewChanges.map((change, index) => {
                        const riskMeta = getBatchRiskMeta(change.risk);
                        const evidence = getChangeEvidence(change);
                        return `
                            <div class="ic-batch-review-change ${riskMeta.className}">
                                <div class="ic-batch-review-change-top">
                                    <span>${String(index + 1).padStart(2, "0")}</span>
                                    <strong>${escapeHtml(change.title || change.operation || `Change ${index + 1}`)}</strong>
                                    <em>${escapeHtml(riskMeta.label)}</em>
                                </div>
                                <p>${escapeHtml(getChangeHumanReason(change, batch))}</p>
                                <small>${escapeHtml(evidence.join(" · ") || getChangeImpact(change))}</small>
                            </div>`;
                    }).join("")}
                    ${changes.length > previewChanges.length ? `<div class="ic-batch-review-more">ยังมีอีก ${changes.length - previewChanges.length} รายการในหน้ารายละเอียด</div>` : ""}
                </div>

                <div class="ic-batch-review-actions">
                    <button class="ic-batch-review-primary" type="button" data-batch-action="open">
                        <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                        ตรวจรายละเอียดและอนุมัติ
                    </button>
                    <button class="ic-batch-review-secondary" type="button" data-batch-action="reject">
                        Reject
                    </button>
                    <button class="ic-batch-review-secondary" type="button" data-batch-action="revise">
                        ให้ AI ปรับใหม่
                    </button>
                </div>
                <div class="ic-batch-review-result" hidden></div>
            </div>`;
    }

    function appendBatchReviewCard(batch) {
        if (!batch?.batchId || !dom.messages) return;
        const existing = Array.from(document.querySelectorAll(".ic-batch-review-card"))
            .find((card) => card.dataset.batchReviewId === batch.batchId);
        if (existing) return;

        const div = document.createElement("div");
        div.className = "ic-msg ic-msg--ai ic-msg--batch-review";
        div.innerHTML = `
            <div class="ic-msg-row">
                <div class="ic-msg-avatar ic-msg-avatar-ai">
                    <i class="fas fa-clipboard-check" aria-hidden="true"></i>
                </div>
                <div class="ic-msg-body">
                    <div class="ic-msg-role">Batch Review</div>
                    <div class="ic-msg-content">${renderBatchReviewCard(batch)}</div>
                </div>
            </div>`;

        div.querySelector('[data-batch-action="open"]')?.addEventListener("click", (event) => {
            openBatchReviewModal(batch, event.currentTarget);
        });
        div.querySelector('[data-batch-action="reject"]')?.addEventListener("click", () => {
            state.pendingBatch = batch;
            rejectPendingBatch(false);
        });
        div.querySelector('[data-batch-action="revise"]')?.addEventListener("click", (event) => {
            openBatchReviewModal(batch, event.currentTarget);
            if (dom.batchRejectReason) {
                dom.batchRejectReason.placeholder = "บอกเหตุผลให้ AI ปรับ proposal ใหม่ เช่น ยังไม่ต้องแก้ FAQ หรือแก้เฉพาะสินค้า A";
                setTimeout(() => dom.batchRejectReason.focus(), 60);
            }
        });

        dom.messages.appendChild(div);
        state.batchReviewCardIds.push(batch.batchId);
        scrollToBottom(true);
    }

    function updateBatchReviewCardStatus(batchId, tone, message) {
        const card = Array.from(document.querySelectorAll(".ic-batch-review-card"))
            .find((entry) => entry.dataset.batchReviewId === batchId);
        if (!card) return;
        card.classList.remove("safe", "warning", "danger", "committed", "rejected");
        card.classList.add(tone);
        const stateEl = card.querySelector(".ic-batch-review-state");
        if (stateEl) stateEl.textContent = tone === "committed" ? "บันทึกแล้ว" : tone === "rejected" ? "ปฏิเสธแล้ว" : "อัปเดตแล้ว";
        const resultEl = card.querySelector(".ic-batch-review-result");
        if (resultEl) {
            resultEl.hidden = false;
            resultEl.textContent = message || "";
        }
        card.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    }

    function openBatchReviewModal(batch, trigger) {
        if (!batch?.batchId || !dom.batchModal) return;
        state.pendingBatch = batch;
        renderBatchPreview(batch);
        openModal(dom.batchModal, trigger);
    }

    function handleBatchReady(batch) {
        if (!batch || !batch.batchId) return;
        state.pendingBatch = batch;
        renderBatchPreview(batch);
        appendBatchReviewCard(batch);
    }

    async function approvePendingBatch() {
        const batch = state.pendingBatch;
        if (!batch?.batchId || !dom.batchApprove) return;
        dom.batchApprove.disabled = true;
        try {
            const res = await fetch(`/api/instruction-ai2/batches/${encodeURIComponent(batch.batchId)}/commit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    confirmationToken: batch.confirmationToken || "",
                    commitRequestId: `ui_commit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                const detail = Array.isArray(data.errors)
                    ? data.errors.map((err) => err.message || err.error || "error").join(", ")
                    : "";
                throw new Error(data.error || detail || "commit ไม่สำเร็จ");
            }
            closeModal(dom.batchModal);
            state.pendingBatch = null;
            state.totalChanges += Array.isArray(batch.changes) ? batch.changes.length : 0;
            updateStatusBar();
            updateBatchReviewCardStatus(batch.batchId, "committed", `บันทึก batch แล้ว: ${batch.batchId}`);
            appendMessage("ai", `บันทึก batch แล้ว: ${escapeHtml(batch.batchId)}`);
            await loadInstructions();
            if (state.selectedId) {
                loadVersionInfo(state.selectedId);
                loadInventory(state.selectedId);
            }
        } catch (err) {
            appendMessage("ai", `Commit batch ไม่สำเร็จ: ${err.message}`);
        } finally {
            dom.batchApprove.disabled = false;
        }
    }

    async function rejectPendingBatch(revise = false) {
        const batch = state.pendingBatch;
        if (!batch?.batchId) return;
        const reason = dom.batchRejectReason ? dom.batchRejectReason.value.trim() : "";
        const endpoint = revise ? "revise" : "reject";
        try {
            const res = await fetch(`/api/instruction-ai2/batches/${encodeURIComponent(batch.batchId)}/${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || "reject ไม่สำเร็จ");
            }
            closeModal(dom.batchModal);
            state.pendingBatch = null;
            updateBatchReviewCardStatus(batch.batchId, "rejected", revise ? "ปฏิเสธแล้ว และส่งเหตุผลให้ AI ปรับ proposal ใหม่" : "ปฏิเสธแล้ว ไม่มีการบันทึกข้อมูล");
            appendMessage("ai", revise ? "ปฏิเสธ batch แล้ว และส่งเหตุผลให้ AI เตรียมแก้ proposal ใหม่" : "ปฏิเสธ batch แล้ว ไม่มีการบันทึกข้อมูล");
            if (revise) {
                const revisePrompt = data.prompt || `ปรับ proposal ใหม่จากเหตุผลนี้: ${reason || "ผู้ใช้ปฏิเสธ batch เดิม"}`;
                sendMessage(revisePrompt);
            }
        } catch (err) {
            appendMessage("ai", `Reject batch ไม่สำเร็จ: ${err.message}`);
        }
    }

    // ─── Inventory Panel ───────────────────────────────────────────────

    function inventoryMatchesFilter(text) {
        const filter = (state.inventoryFilter || "").trim().toLowerCase();
        if (!filter) return true;
        return String(text || "").toLowerCase().includes(filter);
    }

    function formatDateTime(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString("th-TH", {
            year: "2-digit",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function getInventoryItemClass(refs = [], mode = state.activeInventoryMode || "active") {
        const active = state.activeInventoryRefs || [];
        const hit = refs.some((ref) => active.includes(ref));
        return hit ? mode : "";
    }

    function renderInventorySection(title, items, renderItem) {
        const renderedItems = (items || [])
            .map(renderItem)
            .filter(Boolean);
        const html = renderedItems.join("");
        if (!html) return "";
        return `
            <section class="ic-inv-section">
                <div class="ic-inv-section-title"><span>${escapeHtml(title)}</span><span>${renderedItems.length}</span></div>
                <div class="ic-inv-list">${html}</div>
            </section>`;
    }

    function renderInventoryItem({ refs = [], mode = "active", name = "", meta = "", preview = "", warning = false, attrs = {} }) {
        const searchText = [name, meta, preview].join(" ");
        if (!inventoryMatchesFilter(searchText)) return "";
        const cls = getInventoryItemClass(refs, mode);
        const attrText = Object.entries(attrs || {})
            .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
            .map(([key, value]) => ` data-${key}="${escapeHtml(String(value))}"`)
            .join("");
        return `
            <div class="ic-inv-item ${cls}" data-inv-refs="${escapeHtml(refs.join(" "))}"${attrText}>
                <div class="ic-inv-name ${warning ? "ic-inv-warning" : ""}">${escapeHtml(name || "Untitled")}</div>
                ${meta ? `<div class="ic-inv-meta">${escapeHtml(meta)}</div>` : ""}
                ${preview ? `<div class="ic-inv-preview">${escapeHtml(preview)}</div>` : ""}
            </div>`;
    }

    function renderStatusName(status) {
        if (status === "pass") return "ผ่าน";
        if (status === "fail") return "ต้องแก้";
        if (status === "warn") return "ควรตรวจ";
        return status || "-";
    }

    function getKnowledgeTone({ warning = false, fail = 0, warn = 0, pass = 0 } = {}) {
        if (fail > 0) return "fail";
        if (warning || warn > 0) return "warn";
        if (pass > 0) return "pass";
        return "neutral";
    }

    function renderKnowledgeMetric(label, value, tone = "neutral") {
        return `
            <div class="ic-km-metric ${tone}">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(String(value))}</strong>
            </div>`;
    }

    function renderKnowledgeNode({ icon = "fa-circle", title = "", value = "", meta = "", preview = "", refs = [], tone = "neutral", attrs = {} }) {
        const searchText = [title, value, meta, preview].join(" ");
        if (!inventoryMatchesFilter(searchText)) return "";
        const activeClass = getInventoryItemClass(refs, tone === "warn" || tone === "fail" ? "proposed" : "active");
        const attrText = Object.entries(attrs || {})
            .filter(([, attrValue]) => attrValue !== undefined && attrValue !== null && String(attrValue) !== "")
            .map(([key, attrValue]) => ` data-${key}="${escapeHtml(String(attrValue))}"`)
            .join("");
        return `
            <div class="ic-km-node ${tone} ${activeClass}" data-inv-refs="${escapeHtml(refs.join(" "))}"${attrText}>
                <div class="ic-km-node-icon"><i class="fas ${escapeHtml(icon)}" aria-hidden="true"></i></div>
                <div class="ic-km-node-body">
                    <div class="ic-km-node-top">
                        <span>${escapeHtml(title || "Untitled")}</span>
                        ${value !== "" ? `<strong>${escapeHtml(String(value))}</strong>` : ""}
                    </div>
                    ${meta ? `<div class="ic-km-node-meta">${escapeHtml(meta)}</div>` : ""}
                    ${preview ? `<div class="ic-km-node-preview">${escapeHtml(preview)}</div>` : ""}
                </div>
            </div>`;
    }

    function renderKnowledgeGroup(title, subtitle, nodes = []) {
        const html = nodes.filter(Boolean).join("");
        if (!html) return "";
        return `
            <section class="ic-km-group">
                <div class="ic-km-group-head">
                    <span>${escapeHtml(title)}</span>
                    ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}
                </div>
                <div class="ic-km-nodes">${html}</div>
            </section>`;
    }

    function renderKnowledgeMap({
        inv,
        dataItems,
        catalogRows,
        scenarioRows,
        pages,
        images,
        followup,
        model,
        readiness,
        recommendations,
        evalSuite,
        analytics,
        episodes,
        versions,
        warnings,
        runtimeConventions,
    }) {
        const roleItems = dataItems.filter((item) => item.semanticRole === "role");
        const catalogItems = dataItems.filter((item) => item.semanticRole === "catalog");
        const scenarioItems = dataItems.filter((item) => item.semanticRole === "scenario");
        const otherItems = dataItems.filter((item) => item.semanticRole === "other");
        const linkedPages = Array.isArray(pages.linked)
            ? pages.linked
            : (pages.available || []).filter((page) => page.linkedToActiveInstruction);
        const activeCollectionIds = Array.isArray(images.activeCollectionIds) ? images.activeCollectionIds : [];
        const activeAssetIds = Array.isArray(images.activeAssetIds) ? images.activeAssetIds : [];
        const imageIssues = images.issues || inv.imageIssues || {};
        const readinessCounts = readiness.counts || {};
        const readinessTone = getKnowledgeTone({
            fail: readinessCounts.fail || 0,
            warn: readinessCounts.warn || 0,
            pass: readinessCounts.pass || 0,
        });
        const evalCases = Array.isArray(evalSuite.cases) ? evalSuite.cases : [];
        const failedEvalCount = evalCases.filter((item) => item.status === "fail").length;
        const warnedEvalCount = evalCases.filter((item) => item.status === "warn").length;
        const highRecommendations = Array.isArray(recommendations.recommendations)
            ? recommendations.recommendations.filter((item) => item.priority === "high").length
            : 0;

        const metrics = [
            renderKnowledgeMetric("Readiness", readiness.success ? `${readiness.score ?? 0}%` : "-", readinessTone),
            renderKnowledgeMetric("Knowledge", dataItems.length, dataItems.length ? "pass" : "warn"),
            renderKnowledgeMetric("Pages", linkedPages.length, linkedPages.length ? "pass" : "warn"),
            renderKnowledgeMetric("Warnings", warnings.length, warnings.length ? "warn" : "pass"),
        ].join("");

        const groups = [
            renderKnowledgeGroup("Knowledge Core", "สิ่งที่ AI ใช้ตอบลูกค้า", [
                renderKnowledgeNode({
                    icon: "fa-scroll",
                    title: "Role Prompt",
                    value: roleItems.length || "ขาด",
                    meta: roleItems.map((item) => item.title).join(", ") || "ยังไม่มีชุด role",
                    preview: roleItems[0]?.preview || "กำหนดบุคลิก น้ำเสียง และกติกาตอบลูกค้า",
                    refs: ["role:role", ...roleItems.map((item) => `item:${item.itemId}`)],
                    tone: roleItems.length ? "pass" : "warn",
                }),
                renderKnowledgeNode({
                    icon: "fa-box-open",
                    title: "Catalog",
                    value: catalogRows.length,
                    meta: `${catalogItems.length} data items`,
                    preview: catalogRows.slice(0, 3).map((row) => row.name || row.rowId).join(" · ") || "สินค้า/แพ็กเกจที่ map ได้",
                    refs: ["role:catalog", ...catalogItems.map((item) => `item:${item.itemId}`)],
                    tone: catalogRows.length ? "pass" : "warn",
                }),
                renderKnowledgeNode({
                    icon: "fa-comments",
                    title: "Scenario / FAQ",
                    value: scenarioRows.length,
                    meta: `${scenarioItems.length} data items`,
                    preview: scenarioRows.slice(0, 2).map((row) => row.situation || row.rowId).join(" · ") || "คำถาม/สถานการณ์ที่ AI ควรรู้",
                    refs: ["role:scenario", ...scenarioItems.map((item) => `item:${item.itemId}`)],
                    tone: scenarioRows.length ? "pass" : "warn",
                }),
                renderKnowledgeNode({
                    icon: "fa-layer-group",
                    title: "Other Knowledge",
                    value: otherItems.length,
                    meta: otherItems.map((item) => item.title).slice(0, 3).join(", "),
                    preview: "ข้อมูลเสริมที่ยังไม่ได้ map เป็น role/catalog/scenario",
                    refs: ["role:other", ...otherItems.map((item) => `item:${item.itemId}`)],
                    tone: otherItems.length ? "neutral" : "pass",
                }),
            ]),
            renderKnowledgeGroup("Runtime Links", "สิ่งที่มีผลตอนบอทตอบจริง", [
                renderKnowledgeNode({
                    icon: "fa-link",
                    title: "Linked Pages",
                    value: linkedPages.length,
                    meta: linkedPages.slice(0, 2).map((page) => page.name || page.pageKey).join(", "),
                    preview: linkedPages.length ? "Instruction นี้ถูกใช้อยู่กับเพจ/บอทเหล่านี้" : "ยังไม่ผูกกับ page/bot",
                    refs: linkedPages.map((page) => `page:${page.pageKey}`),
                    tone: linkedPages.length ? "pass" : "warn",
                }),
                renderKnowledgeNode({
                    icon: "fa-image",
                    title: "Images",
                    value: activeAssetIds.length || (images.assets || inv.imageAssets || []).length,
                    meta: `${activeCollectionIds.length} active collections`,
                    preview: imageIssues.missing?.length ? `${imageIssues.missing.length} token หา asset ไม่เจอ` : "รูปและ token ที่ runtime ใช้ได้",
                    refs: ["runtime:image", ...activeCollectionIds.map((id) => `collection:${id}`)],
                    tone: imageIssues.missing?.length || imageIssues.duplicates?.length ? "warn" : "pass",
                }),
                renderKnowledgeNode({
                    icon: "fa-play",
                    title: "Starter",
                    value: inv.instruction?.starterSummary?.enabled ? "On" : "Off",
                    meta: `${inv.instruction?.starterSummary?.messageCount || 0} messages`,
                    preview: "ข้อความเปิดบทสนทนาก่อนลูกค้าพิมพ์",
                    refs: ["starter"],
                    tone: inv.instruction?.starterSummary?.enabled ? "pass" : "neutral",
                }),
                renderKnowledgeNode({
                    icon: "fa-clock-rotate-left",
                    title: "Follow-up",
                    value: (followup.configs || []).length,
                    meta: `${(followup.linkedPageKeys || []).length} linked scopes`,
                    preview: "ข้อความติดตามหลังลูกค้าหยุดคุย",
                    refs: ["followup", ...(followup.configs || []).map((config) => `followup:${config.pageKey || `${config.platform}:${config.botId}`}`)],
                    tone: (followup.configs || []).length ? "pass" : "neutral",
                }),
                renderKnowledgeNode({
                    icon: "fa-microchip",
                    title: "Models",
                    value: (model.linkedPageModels || []).length,
                    meta: (model.linkedPageModels || []).slice(0, 2).map((entry) => entry.model || "default").join(", "),
                    preview: "โมเดล/Reasoning ที่ผูกกับแต่ละเพจ",
                    refs: ["model", ...(model.linkedPageModels || []).map((entry) => `model:${entry.pageKey}`)],
                    tone: "neutral",
                }),
                renderKnowledgeNode({
                    icon: "fa-code",
                    title: "Runtime Rules",
                    value: "[cut]",
                    meta: runtimeConventions.imageToken?.token || "#[IMAGE:<ชื่อรูป>]",
                    preview: runtimeConventions.runtimeInjection?.description || "กติกา format ที่ระบบ inject ตอนตอบจริง",
                    refs: ["runtime:cut", "runtime:image", "runtime:injection"],
                    tone: "pass",
                }),
            ]),
            renderKnowledgeGroup("Quality Signals", "หลักฐานก่อนปล่อยใช้จริง", [
                renderKnowledgeNode({
                    icon: "fa-list-check",
                    title: "Readiness",
                    value: readiness.success ? `${readiness.score ?? 0}%` : "-",
                    meta: `ผ่าน ${readinessCounts.pass || 0} · ควรตรวจ ${readinessCounts.warn || 0} · ต้องแก้ ${readinessCounts.fail || 0}`,
                    preview: (readiness.nextSteps || []).slice(0, 2).map((step) => step.title).join(" · ") || "Checklist ก่อนใช้งานจริง",
                    refs: ["readiness", "setup"],
                    tone: readinessTone,
                }),
                renderKnowledgeNode({
                    icon: "fa-flask",
                    title: "Eval Cases",
                    value: evalCases.length,
                    meta: `${failedEvalCount} fail · ${warnedEvalCount} warn`,
                    preview: evalSuite.gate || "warning_only",
                    refs: ["eval"],
                    tone: getKnowledgeTone({ fail: failedEvalCount, warn: warnedEvalCount, pass: evalCases.length }),
                }),
                renderKnowledgeNode({
                    icon: "fa-chart-line",
                    title: "Analytics",
                    value: analytics.success ? (analytics.totalUsages || 0) : "-",
                    meta: episodes.success ? `${(episodes.episodes || []).length} recent episodes` : "",
                    preview: "usage ต่อ version และบทสนทนาจริง",
                    refs: ["analytics"],
                    tone: analytics.success ? "pass" : "neutral",
                }),
                renderKnowledgeNode({
                    icon: "fa-lightbulb",
                    title: "Recommendations",
                    value: recommendations.success ? (recommendations.recommendations || []).length : 0,
                    meta: `${highRecommendations} high priority`,
                    preview: (recommendations.recommendations || [])[0]?.title || "ข้อเสนอจาก readiness/eval/analytics",
                    refs: ["recommendations"],
                    tone: highRecommendations ? "warn" : "neutral",
                }),
                renderKnowledgeNode({
                    icon: "fa-code-branch",
                    title: "Versions",
                    value: versions.length,
                    meta: versions[0]?.note || versions[0]?.source || "",
                    preview: versions[0] ? `ล่าสุด v${versions[0].version}` : "ยังไม่มี snapshot version",
                    refs: versions.map((version) => `version:${version.version}`),
                    tone: versions.length ? "pass" : "neutral",
                }),
            ]),
        ].filter(Boolean).join("");

        if (!groups && (state.inventoryFilter || "").trim()) return "";

        return `
            <section class="ic-km-shell">
                <div class="ic-km-header">
                    <div>
                        <span class="ic-km-eyebrow">Knowledge Map</span>
                        <h3>${escapeHtml(inv.instruction?.name || state.selectedName || "Instruction")}</h3>
                    </div>
                    <div class="ic-km-version">v${escapeHtml(String(inv.instruction?.version || 1))}</div>
                </div>
                <div class="ic-km-metrics">${metrics}</div>
                <div class="ic-km-flow">${groups}</div>
            </section>`;
    }

    async function loadEpisodeDetail(episodeId) {
        if (!state.selectedId || !episodeId) return;
        state.selectedEpisodeId = episodeId;
        const cacheKey = String(episodeId);
        if (state.episodeDetails[cacheKey]?.success) {
            renderInventory();
            return;
        }
        try {
            const res = await fetch(`/api/instruction-ai2/analytics/${encodeURIComponent(state.selectedId)}/episodes/${encodeURIComponent(cacheKey)}`, { cache: "no-store" });
            const data = await res.json().catch(() => ({}));
            state.episodeDetails[cacheKey] = data;
        } catch (err) {
            state.episodeDetails[cacheKey] = { success: false, error: err.message };
        }
        renderInventory();
    }

    function renderInventory() {
        const inv = state.inventory;
        if (!dom.inventoryBody) return;
        if (!inv) {
            dom.inventoryBody.innerHTML = `<div class="ic-sidebar-loading"><span>เลือก Instruction เพื่อดู Knowledge Map</span></div>`;
            if (dom.inventoryTitle) dom.inventoryTitle.textContent = "ยังไม่ได้เลือก Instruction";
            return;
        }
        if (dom.inventoryTitle) dom.inventoryTitle.textContent = inv.instruction?.name || state.selectedName || "Inventory";
        const dataItems = Array.isArray(inv.dataItems) ? inv.dataItems : [];
        const catalogRows = Array.isArray(inv.sections?.catalogRows) ? inv.sections.catalogRows : [];
        const scenarioRows = Array.isArray(inv.sections?.scenarioRows) ? inv.sections.scenarioRows : [];
        const pages = inv.sections?.pages || {};
        const images = inv.sections?.images || {};
        const followup = inv.sections?.followup || {};
        const model = inv.sections?.model || {};
        const evalSection = inv.sections?.eval || {};
        const runtimeConventions = inv.sections?.runtimeConventions || inv.runtimeConventions || {};
        const warnings = Array.isArray(inv.warnings) ? inv.warnings : [];
        const versions = Array.isArray(inv.versions) ? inv.versions : [];
        const analytics = inv.analytics || {};
        const episodes = inv.episodes || {};
        const readiness = inv.readiness || inv.sections?.readiness || {};
        const recommendations = inv.recommendations || inv.sections?.recommendations || {};
        const evalSuite = inv.evalSuite || evalSection.suite || {};
        const toolRegistry = inv.toolRegistry || inv.sections?.toolRegistry || {};
        const selectedEpisodeDetail = state.selectedEpisodeId
            ? state.episodeDetails[String(state.selectedEpisodeId)]
            : null;

        const sections = [
            renderKnowledgeMap({
                inv,
                dataItems,
                catalogRows,
                scenarioRows,
                pages,
                images,
                followup,
                model,
                readiness,
                recommendations,
                evalSuite,
                analytics,
                episodes,
                versions,
                warnings,
                runtimeConventions,
            }),
            renderInventorySection("Readiness Summary", [
                readiness.success ? {
                    refs: ["readiness", "setup"],
                    name: `Readiness ${readiness.score ?? 0}%`,
                    meta: `ผ่าน ${readiness.counts?.pass || 0} · ควรตรวจ ${readiness.counts?.warn || 0} · ต้องแก้ ${readiness.counts?.fail || 0}`,
                    preview: (readiness.nextSteps || []).slice(0, 3).map((step) => step.title).join(" → ") || "พร้อมสำหรับ retail flow เบื้องต้น",
                    warning: (readiness.counts?.fail || readiness.counts?.warn) > 0,
                } : null,
            ].filter(Boolean), (entry) => renderInventoryItem(entry)),
            renderInventorySection("Readiness", readiness.success ? (readiness.checklist || []) : [], (item) => renderInventoryItem({
                refs: [`readiness:${item.key}`, "readiness"],
                name: `${renderStatusName(item.status)} · ${item.title}`,
                meta: item.key,
                preview: item.impact || "",
                warning: item.status !== "pass",
            })),
            renderInventorySection("Recommendations", recommendations.success ? (recommendations.recommendations || []) : [], (item) => renderInventoryItem({
                refs: [`recommendation:${item.type}`, "recommendations"],
                name: `${item.priority || "medium"} · ${item.title}`,
                meta: item.type || "",
                preview: item.impact || item.suggestedPrompt || "",
                warning: item.priority === "high",
            })),
            renderInventorySection("Data Items", dataItems, (item) => renderInventoryItem({
                refs: [`item:${item.itemId}`, `role:${item.semanticRole}`],
                name: `${item.title} (${item.semanticRole})`,
                meta: `${item.type}${item.rowCount ? ` · ${item.rowCount} rows` : ""}`,
                preview: item.type === "text" ? item.preview : (item.columns || []).join(", "),
            })),
            renderInventorySection("Runtime Rules", [
                runtimeConventions.cut ? {
                    refs: ["runtime:cut"],
                    name: runtimeConventions.cut.token || "[cut]",
                    meta: "bubble splitter",
                    preview: runtimeConventions.cut.meaning || runtimeConventions.cut.guidance || "",
                } : null,
                runtimeConventions.imageToken ? {
                    refs: ["runtime:image"],
                    name: runtimeConventions.imageToken.token || "#[IMAGE:<ชื่อรูป>]",
                    meta: `not ${runtimeConventions.imageToken.notToken || "[IMAGE:<ชื่อรูป>]"}`,
                    preview: runtimeConventions.imageToken.source || runtimeConventions.imageToken.meaning || "",
                } : null,
                runtimeConventions.runtimeInjection ? {
                    refs: ["runtime:injection"],
                    name: "Runtime injection",
                    meta: `${runtimeConventions.currentScope?.activeCollectionIds?.length || 0} active collections`,
                    preview: runtimeConventions.runtimeInjection.description || "",
                } : null,
            ].filter(Boolean), (entry) => renderInventoryItem({
                refs: entry.refs,
                name: entry.name,
                meta: entry.meta,
                preview: entry.preview,
            })),
            renderInventorySection("Products", catalogRows, (row) => renderInventoryItem({
                refs: [`item:${row.itemId}`, `row:${row.itemId}:${row.rowIndex}`, `product:${row.rowId}`],
                name: row.name || row.rowId,
                meta: `${row.itemTitle || ""} · row ${Number(row.rowIndex) + 1}${row.priceText ? ` · ${row.priceText}` : ""}`,
                preview: row.detail || JSON.stringify(row.data || {}),
                warning: !row.priceText,
            })),
            renderInventorySection("Scenarios", scenarioRows, (row) => renderInventoryItem({
                refs: [`item:${row.itemId}`, `row:${row.itemId}:${row.rowIndex}`, `scenario:${row.rowId}`],
                name: row.situation || row.rowId,
                meta: `${row.itemTitle || ""} · row ${Number(row.rowIndex) + 1}`,
                preview: row.answer || JSON.stringify(row.data || {}),
            })),
            renderInventorySection("Pages", pages.available || [], (page) => renderInventoryItem({
                refs: [`page:${page.pageKey}`],
                name: `${page.linkedToActiveInstruction ? "ผูกแล้ว" : "ว่าง"} · ${page.name}`,
                meta: `${page.pageKey}${page.aiModel ? ` · ${page.aiModel}` : ""}`,
                preview: page.selectedInstructionIds?.length ? `instructions: ${page.selectedInstructionIds.join(", ")}` : "",
                warning: page.selectedInstructionIds?.length && !page.linkedToActiveInstruction,
            })),
            renderInventorySection("Images", images.assets || inv.imageAssets || [], (asset) => renderInventoryItem({
                refs: [`asset:${asset.assetId}`, `image:${asset.normalizedLabel}`],
                name: asset.label || asset.assetId,
                meta: `${asset.duplicateLabel ? "ชื่อซ้ำ · " : ""}${asset.assetId}`,
                preview: asset.description || asset.url || "",
                warning: !!asset.duplicateLabel,
            })),
            renderInventorySection("Collections", images.collections || inv.imageCollections || [], (collection) => renderInventoryItem({
                refs: [`collection:${collection.collectionId}`],
                name: collection.name || collection.collectionId,
                meta: `${collection.imageCount || 0} images`,
                preview: collection.description || "",
            })),
            renderInventorySection("Starter", [inv.instruction?.starterSummary || inv.sections?.starter].filter(Boolean), (starter) => renderInventoryItem({
                refs: ["starter"],
                name: starter.enabled ? "เปิด conversation starter" : "ปิด conversation starter",
                meta: `${starter.messageCount || 0} messages`,
                preview: (starter.messages || []).map((msg) => `${msg.type}: ${msg.contentPreview || msg.assetId || msg.imageUrl || ""}`).join(" | "),
            })),
            renderInventorySection("Follow-up", followup.configs || [], (config) => renderInventoryItem({
                refs: [`followup:${config.pageKey || `${config.platform}:${config.botId}`}`],
                name: config.pageKey || `${config.platform || ""}:${config.botId || ""}`,
                meta: config.autoFollowUpEnabled ? "enabled" : "disabled",
                preview: Array.isArray(config.rounds) ? `${config.rounds.length} rounds` : "",
            })),
            renderInventorySection("Model", model.linkedPageModels || [], (entry) => renderInventoryItem({
                refs: [`model:${entry.pageKey}`, `page:${entry.pageKey}`],
                name: entry.pageKey,
                meta: entry.model || "no model override",
                preview: entry.aiConfig?.reasoningEffort ? `reasoning: ${entry.aiConfig.reasoningEffort}` : "",
            })),
            renderInventorySection("Versions", versions, (version) => renderInventoryItem({
                refs: [`version:${version.version}`],
                name: `v${version.version}`,
                meta: version.source || "",
                preview: version.note || version.contentHash || "",
            })),
            renderInventorySection("Analytics", [
                analytics.success ? {
                    name: "Version usage",
                    meta: `${analytics.totalUsages || 0} assistant messages`,
                    preview: Array.isArray(analytics.byVersion)
                        ? analytics.byVersion.map((row) => `v${row._id || "unknown"}:${row.messages}`).join(" · ")
                        : "",
                } : null,
                episodes.success ? {
                    name: "Episodes",
                    meta: `${(episodes.episodes || []).length} recent`,
                    preview: episodes.legacy?.label || "48h idle boundary",
                } : null,
            ].filter(Boolean), (entry) => renderInventoryItem({
                refs: ["analytics"],
                name: entry.name,
                meta: entry.meta,
                preview: entry.preview,
            })),
            renderInventorySection("Eval Cases", evalSuite.success ? (evalSuite.cases || []) : [], (item) => renderInventoryItem({
                refs: [`eval:${item.id}`, `eval:${item.category}`],
                name: `${renderStatusName(item.status)} · ${item.title}`,
                meta: `${item.category || ""} · ${evalSuite.gate || "warning_only"}`,
                preview: [...(item.failures || []), ...(item.warnings || [])].join(" · ") || item.expectedBehavior || "",
                warning: item.status !== "pass",
            })),
            renderInventorySection("Recent Episodes", episodes.success ? (episodes.episodes || []) : [], (episode) => {
                const versions = Array.isArray(episode.messages)
                    ? Array.from(new Set(episode.messages.map((msg) => msg.instructionVersion || "unknown"))).join(", ")
                    : "";
                const orders = Array.isArray(episode.orderIds)
                    ? episode.orderIds.length
                    : Array.isArray(episode.messages)
                        ? episode.messages.reduce((sum, msg) => sum + (Array.isArray(msg.orderIds) ? msg.orderIds.length : 0), 0)
                        : 0;
                return renderInventoryItem({
                    refs: [`episode:${episode.episodeId}`, "analytics"],
                    name: episode.episodeId || "episode",
                    meta: `${episode.platform || ""}:${episode.botId || ""} · ${episode.messageCount || 0} msgs${orders ? ` · ${orders} orders` : ""}`,
                    preview: `versions: ${versions || "unknown"} · last: ${formatDateTime(episode.lastMessageAt || episode.updatedAt)}`,
                    warning: !versions,
                    attrs: { "episode-id": episode.episodeId || "" },
                });
            }),
            renderInventorySection("Episode Detail", selectedEpisodeDetail?.success ? (selectedEpisodeDetail.messages || []) : [], (message) => renderInventoryItem({
                refs: [`episode:${state.selectedEpisodeId}`, `version:${message.instructionVersion || "unknown"}`, `message:${message.messageId || ""}`],
                name: `${message.role || "assistant"} · v${message.instructionVersion || "unknown"}`,
                meta: `${formatDateTime(message.createdAt)}${message.model ? ` · ${message.model}` : ""}${message.orderIds?.length ? ` · ${message.orderIds.length} orders` : ""}`,
                preview: message.content || (message.imageAssetIdsSent?.length ? `sent images: ${message.imageAssetIdsSent.join(", ")}` : ""),
                warning: !message.instructionVersion,
            })),
            renderInventorySection("Episode Detail", selectedEpisodeDetail && !selectedEpisodeDetail.success ? [{
                refs: [`episode:${state.selectedEpisodeId}`],
                name: "โหลด episode detail ไม่สำเร็จ",
                meta: state.selectedEpisodeId,
                preview: selectedEpisodeDetail.error || "",
                warning: true,
            }] : [], (entry) => renderInventoryItem(entry)),
            renderInventorySection("Legacy", [
                analytics.legacy ? {
                    name: "Legacy conversations",
                    meta: analytics.legacy.included ? "included" : "separate",
                    preview: analytics.legacy.note || episodes.legacy?.label || "ไม่ migrate ย้อนหลัง และไม่แม่นระดับ version",
                } : null,
            ].filter(Boolean), (entry) => renderInventoryItem({
                refs: ["analytics", "legacy"],
                name: entry.name,
                meta: entry.meta,
                preview: entry.preview,
                warning: true,
            })),
            renderInventorySection("Eval", evalSection.smokeWarnings || [], (warning) => renderInventoryItem({
                refs: [`eval:${warning.evalCase || warning.type}`],
                name: warning.evalCase || warning.type || "warning",
                meta: `${warning.severity || "warning"} · ${evalSection.gate || "warning_only"}`,
                preview: warning.message || "",
                warning: true,
            })),
            renderInventorySection("Tool Registry", toolRegistry.success ? (toolRegistry.tools || []).slice(0, 80) : [], (tool) => renderInventoryItem({
                refs: [`tool:${tool.name}`, `risk:${tool.risk}`],
                name: tool.name,
                meta: `${tool.kind || ""} · ${tool.risk || ""} · ${tool.requiredPermission || ""}`,
                preview: tool.confirmationRequired ? "write changes are proposal-only and require modal confirmation" : tool.description || "",
                warning: tool.risk === "destructive" || tool.risk === "global_runtime",
            })),
            renderInventorySection("Warnings", warnings, (warning) => renderInventoryItem({
                refs: [`warning:${warning.type}`],
                name: warning.type,
                meta: warning.count ? `${warning.count}` : "",
                preview: warning.message || "",
                warning: true,
            })),
        ].filter(Boolean).join("");

        dom.inventoryBody.innerHTML = sections || `<div class="ic-sidebar-loading"><span>ไม่มีข้อมูลตรงกับคำค้น</span></div>`;
    }

    function setInventoryRefs(refs = [], mode = "active") {
        state.activeInventoryRefs = refs.filter(Boolean);
        state.activeInventoryMode = mode;
        renderInventory();
    }

    function refsFromTool(tool, args = {}) {
        const refs = [];
        if (args.itemId) refs.push(`item:${args.itemId}`);
        if (args.itemId && Number.isFinite(Number(args.rowIndex))) refs.push(`row:${args.itemId}:${Number(args.rowIndex)}`);
        if (args.rowId) {
            refs.push(`product:${args.rowId}`, `scenario:${args.rowId}`, `row:${args.rowId}`);
        }
        if (args.pageKey) refs.push(`page:${args.pageKey}`);
        if (Array.isArray(args.pageKeys)) args.pageKeys.forEach((key) => refs.push(`page:${key}`, `followup:${key}`, `model:${key}`));
        if (args.assetId) refs.push(`asset:${args.assetId}`);
        if (Array.isArray(args.collectionIds)) args.collectionIds.forEach((id) => refs.push(`collection:${id}`));
        if (tool === "propose_update_page_image_collections") {
            if (Array.isArray(args.pageKeys)) args.pageKeys.forEach((key) => refs.push(`page:${key}`));
            if (Array.isArray(args.collectionIds)) args.collectionIds.forEach((id) => refs.push(`collection:${id}`));
        }
        if (tool.includes("conversation_starter") || tool === "get_conversation_starter") refs.push("starter");
        if (tool.includes("analytics") || tool.includes("episode")) refs.push("analytics");
        if (tool.includes("product")) refs.push("role:catalog");
        if (tool.includes("scenario")) refs.push("role:scenario");
        if (tool.includes("audit")) refs.push("analytics");
        if (tool.includes("runtime_conventions")) refs.push("runtime:cut", "runtime:image", "runtime:injection");
        if (tool === "get_instruction_inventory") refs.push("starter");
        return refs;
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
            const items = Array.isArray(inst.dataItems) ? inst.dataItems : [];
            const tableCount = items.filter(i => i.type === "table").length;
            const textCount = items.filter(i => i.type === "text").length;
            const active = inst._id === state.selectedId ? "active" : "";

            return `
            <div class="ic-inst-item ${active}" data-id="${inst._id}" data-name="${escapeHtml(inst.name || '')}" role="button" tabindex="0">
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
        state.pendingBatch = null;
        state.batchReviewCardIds = [];
        state.isUserNearBottom = true;

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

            // Hide quick suggest if has history
            if (dom.quickSuggestWrap) dom.quickSuggestWrap.style.display = "none";

            // Check if there's an active request to resume
            try {
                const savedRequestId = sessionStorage.getItem("ic2_activeRequestId");
                if (savedRequestId) {
                    resumeActiveRequest(savedRequestId);
                }
            } catch (e) { }
        } else {
            appendMessage("ai", `สวัสดีครับ 👋 เลือก **${escapeHtml(name)}** เรียบร้อยแล้ว พิมพ์คำถามหรือคำสั่งได้เลยครับ`);
            // Show quick suggest for new chats
            if (dom.quickSuggestWrap) dom.quickSuggestWrap.style.display = "flex";
        }

        renderInstructionList(dom.instructionSearch.value);
        updateStatusBar();
        loadInventory(id);

        // Close mobile sidebar only
        if (window.innerWidth < 769) {
            closeSidebar({ restoreFocus: false });
        }

        // Focus input
        setTimeout(() => dom.input.focus(), 100);

        // Load version info
        loadVersionInfo(id);
    }

    // ─── Sidebar ────────────────────────────────────────────────────────

    function isMobileViewport() {
        return window.innerWidth < 769;
    }

    function isSidebarVisible() {
        return isMobileViewport()
            ? dom.sidebar.classList.contains("open")
            : !dom.sidebar.classList.contains("hidden");
    }

    function getFocusableElements(container) {
        if (!container) return [];
        return Array.from(container.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && !el.hasAttribute("aria-hidden");
        });
    }

    function syncSidebarA11y(options = {}) {
        const visible = isSidebarVisible();
        state.sidebarOpen = visible;
        dom.sidebar.setAttribute("aria-hidden", visible ? "false" : "true");
        dom.toggleSidebar.setAttribute("aria-expanded", visible ? "true" : "false");
        dom.toggleSidebar.setAttribute("aria-label", visible ? "ปิดรายการ Instruction" : "เปิดรายการ Instruction");
        dom.toggleSidebar.title = visible ? "ปิดเมนู" : "เปิดเมนู";

        if ("inert" in dom.sidebar) {
            dom.sidebar.inert = !visible;
        }

        if (visible && options.focusSidebar) {
            const focusTarget = dom.instructionSearch || dom.sidebarClose;
            setTimeout(() => focusTarget?.focus({ preventScroll: true }), 80);
        } else if (!visible && options.restoreFocus) {
            setTimeout(() => dom.toggleSidebar?.focus({ preventScroll: true }), 0);
        }
    }

    function toggleSidebar() {
        if (window.innerWidth < 769) {
            // Mobile: toggle overlay sidebar
            const isOpen = dom.sidebar.classList.toggle("open");
            dom.sidebarOverlay.classList.toggle("show", isOpen);
            syncSidebarA11y({ focusSidebar: isOpen, restoreFocus: !isOpen });
        } else {
            // Desktop: toggle width
            dom.sidebar.classList.toggle("hidden");
            syncSidebarA11y();
        }
    }

    function openSidebar(options = {}) {
        if (window.innerWidth < 769) {
            dom.sidebar.classList.add("open");
            dom.sidebarOverlay.classList.add("show");
        } else {
            dom.sidebar.classList.remove("hidden");
        }
        syncSidebarA11y({ focusSidebar: options.focusSidebar !== false });
    }

    function closeSidebar(options = {}) {
        if (window.innerWidth < 769) {
            dom.sidebar.classList.remove("open");
            dom.sidebarOverlay.classList.remove("show");
        } else {
            dom.sidebar.classList.add("hidden");
        }
        syncSidebarA11y({ restoreFocus: options.restoreFocus !== false });
    }

    function setModelDropdownOpen(isOpen) {
        if (!dom.modelDropdown || !dom.modelBtn) return;
        dom.modelDropdown.classList.toggle("show", isOpen);
        dom.modelDropdown.setAttribute("aria-hidden", isOpen ? "false" : "true");
        dom.modelBtn.classList.toggle("open", isOpen);
        dom.modelBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    function syncModelOptionA11y() {
        $$(".ic-model-option").forEach(opt => {
            opt.setAttribute("aria-pressed", opt.dataset.model === state.model ? "true" : "false");
        });
        if (dom.modelBtn) {
            const label = MODELS[state.model]?.label || state.model;
            dom.modelBtn.setAttribute("aria-label", `เลือกโมเดล ${label}`);
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
            dom.send.innerHTML = '<i class="fas fa-stop" aria-hidden="true"></i>';
            dom.send.disabled = false;
            dom.send.title = "หยุด";
            dom.send.setAttribute("aria-label", "หยุดการตอบ");
            dom.send.classList.add("ic-btn-stop-active");
        } else {
            dom.send.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
            dom.send.disabled = !(hasText || hasImages) || !hasInstruction;
            dom.send.title = "ส่ง (Enter)";
            dom.send.setAttribute("aria-label", "ส่งข้อความ");
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
        syncModelOptionA11y();
    }

    // ─── Event Listeners ────────────────────────────────────────────────

    function setupEventListeners() {
        // Sidebar toggle
        dom.toggleSidebar.addEventListener("click", toggleSidebar);
        dom.sidebarOverlay.addEventListener("click", closeSidebar);
        if (dom.sidebarClose) {
            dom.sidebarClose.addEventListener("click", closeSidebar);
        }
        if (dom.welcomeOpenSidebar) {
            dom.welcomeOpenSidebar.addEventListener("click", () => openSidebar({ focusSidebar: true }));
        }
        if (dom.createRetail) {
            dom.createRetail.addEventListener("click", createRetailInstruction);
        }
        if (dom.toggleInventory && dom.inventoryPanel) {
            dom.toggleInventory.addEventListener("click", () => {
                dom.inventoryPanel.classList.toggle("open");
            });
        }
        if (dom.inventoryClose && dom.inventoryPanel) {
            dom.inventoryClose.addEventListener("click", () => {
                dom.inventoryPanel.classList.remove("open");
            });
        }
        if (dom.inventorySearch) {
            dom.inventorySearch.addEventListener("input", (e) => {
                state.inventoryFilter = e.target.value || "";
                renderInventory();
            });
        }
        if (dom.inventoryBody) {
            dom.inventoryBody.addEventListener("click", (e) => {
                const episodeItem = e.target.closest(".ic-inv-item[data-episode-id]");
                if (!episodeItem) return;
                loadEpisodeDetail(episodeItem.dataset.episodeId);
            });
        }
        if (dom.batchModalClose) {
            dom.batchModalClose.addEventListener("click", () => closeModal(dom.batchModal));
        }
        if (dom.batchApprove) {
            dom.batchApprove.addEventListener("click", approvePendingBatch);
        }
        if (dom.batchReject) {
            dom.batchReject.addEventListener("click", () => rejectPendingBatch(false));
        }
        if (dom.batchRevise) {
            dom.batchRevise.addEventListener("click", () => rejectPendingBatch(true));
        }

        // Instruction selection
        dom.instructionList.addEventListener("click", (e) => {
            const item = e.target.closest(".ic-inst-item");
            if (item) selectInstruction(item.dataset.id, item.dataset.name);
        });
        dom.instructionList.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const item = e.target.closest(".ic-inst-item");
            if (!item) return;
            e.preventDefault();
            selectInstruction(item.dataset.id, item.dataset.name);
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

        dom.messages.addEventListener("scroll", () => {
            state.isUserNearBottom = isNearMessagesBottom();
            if (state.sending && !state.isUserNearBottom && scrollToBottomRafId) {
                cancelAnimationFrame(scrollToBottomRafId);
                scrollToBottomRafId = null;
            }
        }, { passive: true });

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
            setModelDropdownOpen(!dom.modelDropdown.classList.contains("show"));
        });

        document.addEventListener("click", (e) => {
            if (!dom.modelDropdown.contains(e.target) && !dom.modelBtn.contains(e.target)) {
                setModelDropdownOpen(false);
            }
        });

        // Model selection
        const selectModelOption = (opt) => {
            state.model = opt.dataset.model;
            dom.modelLabel.textContent = MODELS[state.model]?.label || state.model;
            $$(".ic-model-option").forEach(o => o.classList.remove("active"));
            opt.classList.add("active");
            updateThinkingUI();
            setModelDropdownOpen(false);
            dom.modelBtn.focus();
        };

        $$(".ic-model-option").forEach(opt => {
            opt.addEventListener("click", () => {
                selectModelOption(opt);
            });
            opt.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectModelOption(opt);
                }
            });
        });

        // Thinking level
        dom.thinkingLevels.addEventListener("click", (e) => {
            const btn = e.target.closest(".ic-think-btn");
            if (!btn || btn.disabled) return;
            state.thinking = btn.dataset.level;
            updateThinkingUI();
        });

        // New chat buttons
        const handleNewChat = async () => {
            if (!state.selectedId) return;

            // Delete ALL sessions for this instruction from DB
            try {
                await fetch(`/api/instruction-ai2/sessions/${state.sessionId}?instructionId=${state.selectedId}`, { method: "DELETE" });
            } catch (err) {
                console.warn("Failed to delete sessions:", err);
            }

            // Clear everything
            state.sessionId = generateSessionId();
            state.history = [];
            state.totalTokens = 0;
            state.totalChanges = 0;
            state.pendingBatch = null;
            state.batchReviewCardIds = [];
            state.activeRequestId = null;
            try { sessionStorage.removeItem("ic2_activeRequestId"); } catch (e) { }
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
                syncSidebarA11y();
            }, 150);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                if (dom.modelDropdown.classList.contains("show")) {
                    setModelDropdownOpen(false);
                    dom.modelBtn.focus();
                    return;
                }

                const versionModal = $("#icVersionModal");
                const saveModal = $("#icSaveVersionModal");
                if (dom.batchModal && dom.batchModal.style.display !== "none") {
                    closeModal(dom.batchModal);
                    return;
                }
                if (saveModal && saveModal.style.display !== "none") {
                    closeModal(saveModal);
                    return;
                }
                if (versionModal && versionModal.style.display !== "none") {
                    closeModal(versionModal);
                    return;
                }

                if (isMobileViewport() && dom.sidebar.classList.contains("open")) {
                    closeSidebar({ restoreFocus: true });
                }
            }

            if (e.key === "Tab") {
                const openModal = getOpenModal();
                if (openModal) {
                    const focusable = getFocusableElements(openModal);
                    if (!focusable.length) return;
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                    return;
                }
            }

            if (e.key === "Tab" && isMobileViewport() && dom.sidebar.classList.contains("open")) {
                const focusable = getFocusableElements(dom.sidebar);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
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

        // ── 6. Lists ──
        html = html.replace(/^[•\-]\s+(.+)$/gm, "<li>$1</li>");
        html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ic-ol-item">$1</li>');
        html = (() => {
            const lines = html.split("\n");
            const grouped = [];
            let activeList = "";
            const closeList = () => {
                if (activeList) {
                    grouped.push(`</${activeList}>`);
                    activeList = "";
                }
            };

            for (const line of lines) {
                const trimmed = line.trim();
                const isOrderedItem = /^<li class="ic-ol-item">.*<\/li>$/.test(trimmed);
                const isUnorderedItem = /^<li>.*<\/li>$/.test(trimmed);

                if (isOrderedItem) {
                    if (activeList !== "ol") {
                        closeList();
                        activeList = "ol";
                        grouped.push("<ol>");
                    }
                    grouped.push(trimmed);
                    continue;
                }

                if (isUnorderedItem) {
                    if (activeList !== "ul") {
                        closeList();
                        activeList = "ul";
                        grouped.push("<ul>");
                    }
                    grouped.push(trimmed);
                    continue;
                }

                closeList();
                grouped.push(line);
            }

            closeList();
            return grouped.join("\n");
        })();

        // ── 8. Line breaks ──
        html = html.replace(/\n/g, "<br>");
        html = html.replace(/<br><ul>/g, "<ul>");
        html = html.replace(/<ul><br>/g, "<ul>");
        html = html.replace(/<br><\/ul>/g, "</ul>");
        html = html.replace(/<\/ul><br>/g, "</ul>");
        html = html.replace(/<br><ol>/g, "<ol>");
        html = html.replace(/<ol><br>/g, "<ol>");
        html = html.replace(/<br><\/ol>/g, "</ol>");
        html = html.replace(/<\/ol><br>/g, "</ol>");
        html = html.replace(/<\/li><br><li/g, "</li><li");
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

    function isNearMessagesBottom() {
        if (!dom.messages) return true;
        const distanceFromBottom = dom.messages.scrollHeight - (dom.messages.scrollTop + dom.messages.clientHeight);
        return distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX;
    }

    function shouldAutoScroll(force = false) {
        if (force) return true;
        if (!state.sending) return true;
        return state.isUserNearBottom;
    }

    function scrollToBottom(force = false) {
        if (!dom.messages || !shouldAutoScroll(force)) return;
        if (scrollToBottomRafId) cancelAnimationFrame(scrollToBottomRafId);
        const forced = force;
        scrollToBottomRafId = requestAnimationFrame(() => {
            scrollToBottomRafId = null;
            if (!dom.messages || !shouldAutoScroll(forced)) return;
            dom.messages.scrollTop = dom.messages.scrollHeight;
            state.isUserNearBottom = true;
        });
    }

    function autoResize(textarea) {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }

    // ─── Version Management ─────────────────────────────────────────────

    let lastModalTrigger = null;

    function openModal(modal, trigger = document.activeElement) {
        if (!modal) return;
        lastModalTrigger = trigger;
        modal.style.display = "flex";
        modal.removeAttribute("aria-hidden");
        setTimeout(() => {
            const focusTarget = getFocusableElements(modal)[0];
            focusTarget?.focus();
        }, 0);
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
        if (lastModalTrigger && document.contains(lastModalTrigger)) {
            lastModalTrigger.focus();
        }
        lastModalTrigger = null;
    }

    function getOpenModal() {
        const modals = [dom.batchModal, $("#icSaveVersionModal"), $("#icVersionModal")];
        return modals.find((modal) => modal && modal.style.display !== "none") || null;
    }

    async function loadVersionInfo(instructionId) {
        const controls = $("#icVersionControls");
        const label = $("#icVersionLabel");
        if (!controls || !label) return;

        controls.style.display = "flex";
        label.textContent = "...";

        try {
            const res = await fetch(`/api/instruction-ai2/versions/${instructionId}`);
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

        openModal(modal, $("#icVersionBtn"));
        listEl.innerHTML = '<div class="ic-version-empty">กำลังโหลด...</div>';

        try {
            const res = await fetch(`/api/instruction-ai2/versions/${state.selectedId}`);
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
        openModal(modal, $("#icSaveVersionBtn"));
        if (noteInput) {
            noteInput.value = "";
            setTimeout(() => noteInput.focus(), 0);
        }
    }

    async function confirmSaveVersion() {
        if (!state.selectedId) return;
        const btn = $("#icVersionSaveConfirm");
        const noteInput = $("#icVersionNote");
        const note = noteInput ? noteInput.value.trim() : "";

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> กำลังบันทึก...'; }

        try {
            const res = await fetch(`/api/instruction-ai2/versions/${state.selectedId}`, {
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
                if (modal) closeModal(modal);
                // Show confirmation in chat
                appendMessage("ai", `✅ บันทึกเวอร์ชัน **v${data.version}** เรียบร้อย${note ? " (" + note + ")" : ""}`);
            } else {
                appendMessage("ai", `❌ ไม่สามารถบันทึก: ${data.error}`);
            }
        } catch (err) {
            appendMessage("ai", `❌ เกิดข้อผิดพลาด: ${err.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> บันทึกเวอร์ชัน'; }
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
        if (modalClose) modalClose.addEventListener("click", () => closeModal(versionModal));
        if (saveModalClose) saveModalClose.addEventListener("click", () => closeModal(saveModal));
        if (saveConfirm) saveConfirm.addEventListener("click", confirmSaveVersion);
        if (noteInput) noteInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmSaveVersion(); });

        // Close modals on overlay click
        [versionModal, saveModal].forEach(modal => {
            if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal); });
        });
    }

    // ─── Start ──────────────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", () => { init(); setupVersionListeners(); });
})();
