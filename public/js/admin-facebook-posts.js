(() => {
  const dataEl = document.getElementById("facebookBotData");
  const parsed =
    (dataEl && JSON.parse(dataEl.textContent || "{}")) || {};
  const bots = parsed.facebookBots || [];
  let currentBotId =
    parsed.selectedBotId ||
    (bots[0] && (bots[0]._id || bots[0].id || bots[0].botId));

  const botSelect = document.getElementById("facebookBotSelect");
  const refreshBtn = document.getElementById("refreshPostsBtn");
  const defaultMode = document.getElementById("defaultMode");
  const defaultTemplateMessage = document.getElementById(
    "defaultTemplateMessage",
  );
  const defaultAiModel = document.getElementById("defaultAiModel");
  const defaultSystemPrompt = document.getElementById("defaultSystemPrompt");
  const defaultPullToChat = document.getElementById("defaultPullToChat");
  const defaultIsActive = document.getElementById("defaultIsActive");
  const defaultPolicyStatus = document.getElementById("defaultPolicyStatus");
  const saveDefaultPolicyBtn = document.getElementById("saveDefaultPolicyBtn");
  const postList = document.getElementById("postList");
  const postListStatus = document.getElementById("postListStatus");
  const defaultTemplateGroup = document.getElementById("defaultTemplateGroup");
  const defaultAiGroup = document.getElementById("defaultAiGroup");

  const LIMIT = 100;

  function escapeHtml(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setDefaultFormVisibility() {
    const mode = defaultMode.value;
    defaultTemplateGroup.style.display = mode === "template" ? "block" : "none";
    defaultAiGroup.style.display = mode === "ai" ? "block" : "none";
  }

  async function loadDefaultPolicy(botId) {
    if (!botId) return;
    defaultPolicyStatus.textContent = "กำลังโหลดนโยบาย...";
    try {
      const res = await fetch(`/api/facebook-bots/${botId}/comment-policy`);
      if (!res.ok) throw new Error("โหลดนโยบายไม่สำเร็จ");
      const data = await res.json();
      const policy = data.policy || {};
      defaultMode.value = policy.mode || "off";
      defaultTemplateMessage.value = policy.templateMessage || "";
      defaultAiModel.value = policy.aiModel || "";
      defaultSystemPrompt.value = policy.systemPrompt || "";
      defaultPullToChat.checked = Boolean(
        policy.pullToChat || policy.sendPrivateReply,
      );
      defaultIsActive.checked =
        policy.isActive === true || policy.status === "active";
      setDefaultFormVisibility();
      defaultPolicyStatus.textContent = "โหลดนโยบายเสร็จแล้ว";
    } catch (err) {
      defaultPolicyStatus.textContent = "โหลดนโยบายไม่สำเร็จ";
      console.error(err);
    }
  }

  async function saveDefaultPolicy() {
    if (!currentBotId) return;
    const payload = {
      mode: defaultMode.value,
      templateMessage: defaultTemplateMessage.value,
      aiModel: defaultAiModel.value,
      systemPrompt: defaultSystemPrompt.value,
      pullToChat: defaultPullToChat.checked,
      sendPrivateReply: defaultPullToChat.checked,
      isActive: defaultIsActive.checked && defaultMode.value !== "off",
    };
    defaultPolicyStatus.textContent = "กำลังบันทึก...";
    try {
      const res = await fetch(
        `/api/facebook-bots/${currentBotId}/comment-policy`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "บันทึกไม่สำเร็จ");
      }
      defaultPolicyStatus.textContent = "บันทึกนโยบายเรียบร้อย";
      await loadPosts(currentBotId, false);
    } catch (err) {
      defaultPolicyStatus.textContent = err.message || "บันทึกไม่สำเร็จ";
      console.error(err);
    }
  }

  function renderPosts(posts = []) {
    if (!posts.length) {
      postList.innerHTML =
        '<div class="text-center text-muted">ยังไม่มีโพสต์ที่ระบบจับได้</div>';
      return;
    }

    const html = posts
      .map((post) => {
        const rp = post.replyProfile || {};
        const mode = rp.mode || "off";
        const isActive =
          rp.isActive === true || rp.status === "active" ? true : false;
        const title =
          escapeHtml(post.message || "").slice(0, 120) ||
          "(ไม่มีข้อความโพสต์)";
        const permalink = post.permalink ? escapeHtml(post.permalink) : "";
        const created =
          post.createdTime ? new Date(post.createdTime).toLocaleString() : "";

        return `
          <div class="border rounded p-3 shadow-sm">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <div class="fw-semibold">${title}</div>
                <div class="text-muted small">Post ID: ${escapeHtml(
                  post.postId || "",
                )}</div>
                <div class="text-muted small">สร้าง: ${escapeHtml(created)}</div>
              </div>
              <div class="text-end small">
                <div class="${isActive ? "text-success" : "text-muted"}">
                  ${isActive ? "🟢 เปิด" : "🔴 ปิด"}
                </div>
                ${
                  permalink
                    ? `<a class="small" href="${permalink}" target="_blank">เปิดโพสต์</a>`
                    : ""
                }
              </div>
            </div>
            <div class="row g-2">
              <div class="col-md-4">
                <label class="form-label form-label-sm">โหมดตอบ</label>
                <select class="form-select form-select-sm post-mode" data-post-id="${
                  post.postId
                }">
                  <option value="off" ${
                    mode === "off" ? "selected" : ""
                  }>ปิด</option>
                  <option value="template" ${
                    mode === "template" ? "selected" : ""
                  }>Template</option>
                  <option value="ai" ${
                    mode === "ai" ? "selected" : ""
                  }>AI</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label form-label-sm">AI Model</label>
                <input class="form-control form-control-sm post-ai-model" data-post-id="${
                  post.postId
                }" value="${escapeHtml(rp.aiModel || "")}" placeholder="เช่น gpt-4o-mini">
              </div>
              <div class="col-md-4">
                <label class="form-label form-label-sm">สถานะ</label>
                <div class="form-check">
                  <input class="form-check-input post-active" type="checkbox" data-post-id="${
                    post.postId
                  }" ${isActive ? "checked" : ""}>
                  <label class="form-check-label small">เปิดใช้งานโพสต์นี้</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input post-pull" type="checkbox" data-post-id="${
                    post.postId
                  }" ${rp.pullToChat ? "checked" : ""}>
                  <label class="form-check-label small">ดึงเข้าแชท/ส่งข้อความส่วนตัว</label>
                </div>
              </div>
            </div>
            <div class="mt-2">
              <label class="form-label form-label-sm">Template Message</label>
              <textarea class="form-control form-control-sm post-template" rows="2" data-post-id="${
                post.postId
              }" placeholder="ใช้เมื่อโหมดเป็น Template">${escapeHtml(
                rp.templateMessage || "",
              )}</textarea>
            </div>
            <div class="mt-2">
              <label class="form-label form-label-sm">System Prompt (AI)</label>
              <textarea class="form-control form-control-sm post-system" rows="2" data-post-id="${
                post.postId
              }" placeholder="ใช้เมื่อโหมดเป็น AI">${escapeHtml(
                rp.systemPrompt || "",
              )}</textarea>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <div class="small text-muted">คอมเมนต์ล่าสุด: ${
                post.lastCommentAt
                  ? new Date(post.lastCommentAt).toLocaleString()
                  : "-"
              } | ตอบล่าสุด: ${
          post.lastReplyAt
            ? new Date(post.lastReplyAt).toLocaleString()
            : "-"
        }</div>
              <button class="btn btn-primary btn-sm save-post" data-post-id="${
                post.postId
              }">
                <i class="fas fa-save me-1"></i>บันทึกโพสต์นี้
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    postList.innerHTML = html;

    document.querySelectorAll(".save-post").forEach((btn) => {
      btn.addEventListener("click", () => {
        const postId = btn.getAttribute("data-post-id");
        savePost(postId, btn);
      });
    });
  }

  async function loadPosts(botId, showLoading = true) {
    if (!botId) return;
    if (showLoading) {
      postListStatus.textContent = "กำลังโหลดโพสต์...";
      postList.innerHTML = "";
    }
    try {
      const res = await fetch(
        `/api/facebook-posts?botId=${encodeURIComponent(botId)}&limit=${LIMIT}`,
      );
      if (!res.ok) throw new Error("โหลดโพสต์ไม่สำเร็จ");
      const data = await res.json();
      renderPosts(data.posts || []);
      postListStatus.textContent = `โหลดโพสต์แล้ว ${(
        data.posts || []
      ).length} รายการ (ค่าเริ่มต้นต่อโพสต์ปิดไว้)`;
    } catch (err) {
      postListStatus.textContent = err.message || "โหลดโพสต์ไม่สำเร็จ";
      console.error(err);
    }
  }

  async function savePost(postId, buttonEl) {
    if (!postId || !currentBotId) return;
    const modeEl = document.querySelector(
      `.post-mode[data-post-id="${CSS.escape(postId)}"]`,
    );
    const aiModelEl = document.querySelector(
      `.post-ai-model[data-post-id="${CSS.escape(postId)}"]`,
    );
    const templateEl = document.querySelector(
      `.post-template[data-post-id="${CSS.escape(postId)}"]`,
    );
    const systemEl = document.querySelector(
      `.post-system[data-post-id="${CSS.escape(postId)}"]`,
    );
    const activeEl = document.querySelector(
      `.post-active[data-post-id="${CSS.escape(postId)}"]`,
    );
    const pullEl = document.querySelector(
      `.post-pull[data-post-id="${CSS.escape(postId)}"]`,
    );

    const payload = {
      botId: currentBotId,
      mode: modeEl?.value || "off",
      templateMessage: templateEl?.value || "",
      aiModel: aiModelEl?.value || "",
      systemPrompt: systemEl?.value || "",
      pullToChat: pullEl?.checked || false,
      sendPrivateReply: pullEl?.checked || false,
      isActive: activeEl?.checked && modeEl?.value !== "off",
    };

    const original = buttonEl.innerHTML;
    buttonEl.disabled = true;
    buttonEl.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>กำลังบันทึก';
    try {
      const res = await fetch(
        `/api/facebook-posts/${encodeURIComponent(postId)}/reply-profile`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "บันทึกไม่สำเร็จ");
      }
      buttonEl.innerHTML = '<i class="fas fa-check me-1"></i>บันทึกแล้ว';
      setTimeout(() => {
        buttonEl.innerHTML = original;
        buttonEl.disabled = false;
      }, 800);
    } catch (err) {
      buttonEl.innerHTML = '<i class="fas fa-times me-1"></i>ผิดพลาด';
      setTimeout(() => {
        buttonEl.innerHTML = original;
        buttonEl.disabled = false;
      }, 1500);
      console.error(err);
    }
  }

  function handleBotChange() {
    currentBotId = botSelect.value;
    loadDefaultPolicy(currentBotId);
    loadPosts(currentBotId);
  }

  if (botSelect) {
    botSelect.addEventListener("change", handleBotChange);
  }
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadPosts(currentBotId);
    });
  }
  if (saveDefaultPolicyBtn) {
    saveDefaultPolicyBtn.addEventListener("click", saveDefaultPolicy);
  }
  if (defaultMode) {
    defaultMode.addEventListener("change", setDefaultFormVisibility);
  }

  setDefaultFormVisibility();
  if (currentBotId) {
    loadDefaultPolicy(currentBotId);
    loadPosts(currentBotId, false);
  } else {
    postListStatus.textContent = "ยังไม่มีเพจในระบบ";
  }
})();
