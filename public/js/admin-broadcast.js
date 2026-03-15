(() => {
  // State
  let messageItems = [];
  let pollInterval = null;
  let elapsedTimer = null;
  let broadcastStartTime = null;
  let isSubmitting = false;
  let cachedPerChannel = null;

  // DOM Elements
  const messageList = document.getElementById('messageList');
  const addTextBtn = document.getElementById('addTextBtn');
  const addImageBtn = document.getElementById('addImageBtn');
  const messagesInput = document.getElementById('messagesInput');
  const audienceStats = document.getElementById('audienceStats');
  const audienceTotal = document.getElementById('audienceTotal');
  const audienceLine = document.getElementById('audienceLine');
  const audienceFb = document.getElementById('audienceFb');
  const audienceIg = document.getElementById('audienceIg');
  const audienceWa = document.getElementById('audienceWa');
  const audienceCountChip = document.getElementById('audienceCount');
  const progressModal = new bootstrap.Modal(document.getElementById('progressModal'));
  const toastContainer = document.getElementById('broadcastToastContainer');
  const broadcastForm = document.getElementById('broadcastForm');
  const submitBtn = document.getElementById('submitBroadcastBtn');
  const previewMessage = document.getElementById('previewMessage');
  const previewStatus = document.getElementById('previewStatus');
  const previewAudienceLabel = document.getElementById('previewAudienceLabel');
  const previewChannelsLabel = document.getElementById('previewChannelsLabel');
  const previewBtn = document.getElementById('previewBtn');
  const previewBtnInline = document.getElementById('previewBtnInline');
  const previewCard = document.getElementById('broadcastPreview');
  const dateRangeFields = document.getElementById('dateRangeFields');
  const dateStartInput = document.getElementById('dateStartInput');
  const dateEndInput = document.getElementById('dateEndInput');

  // Progress Elements
  const progressBar = document.querySelector('#progressModal .progress-bar');
  const sentCountEl = document.getElementById('sentCount');
  const totalCountEl = document.getElementById('totalCount');
  const successCountEl = document.getElementById('successCount');
  const failedCountEl = document.getElementById('failedCount');
  const elapsedTimeEl = document.getElementById('elapsedTime');
  const remainingTimeEl = document.getElementById('remainingTime');
  const channelProgressList = document.getElementById('channelProgressList');
  const cancelButton = document.getElementById('cancelBroadcastBtn');

  // --- Utilities ---
  const escapeHtml = (str) => {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  };

  const formatDuration = (totalSeconds) => {
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    if (totalSeconds < 60) return `${totalSeconds} วินาที`;
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m < 60) return s > 0 ? `${m} นาที ${s} วินาที` : `${m} นาที`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h} ชั่วโมง ${rm} นาที`;
  };

  const formatDurationShort = (totalSeconds) => {
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m < 60) return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const estimateBroadcastTime = (perChannel, settings) => {
    const batchSize = parseInt(settings.batchSize) || 20;
    const batchDelay = parseInt(settings.batchDelay) || 30;
    const messageDelay = parseFloat(settings.messageDelay) || 1;

    let maxSeconds = 0;
    for (const ch of perChannel) {
      const n = ch.count;
      if (n === 0) continue;
      const numBatches = Math.ceil(n / batchSize);
      const lastBatchSize = (n % batchSize) || batchSize;
      const lastBatchTime = (lastBatchSize - 1) * messageDelay;
      const fullBatchTime = (batchSize - 1) * messageDelay;
      const chSeconds = (numBatches - 1) * (fullBatchTime + batchDelay) + lastBatchTime;
      if (chSeconds > maxSeconds) maxSeconds = chSeconds;
    }
    return { overallSeconds: maxSeconds, formatted: formatDuration(maxSeconds) };
  };

  const getCurrentSettings = () => ({
    batchSize: document.querySelector('input[name="settings_batchSize"]')?.value || '20',
    batchDelay: document.querySelector('input[name="settings_batchDelay"]')?.value || '30',
    messageDelay: document.querySelector('input[name="settings_messageDelay"]')?.value || '1',
  });

  const showToast = (message, type = 'info') => {
    if (!toastContainer) return;
    const typeMap = {
      success: { icon: 'fa-check-circle', className: 'app-toast--success' },
      error: { icon: 'fa-times-circle', className: 'app-toast--danger' },
      warning: { icon: 'fa-exclamation-triangle', className: 'app-toast--warning' },
      info: { icon: 'fa-info-circle', className: 'app-toast--info' },
    };
    const { icon, className } = typeMap[type] || typeMap.info;
    const toast = document.createElement('div');
    toast.className = `app-toast ${className}`;

    const iconEl = document.createElement('div');
    iconEl.className = 'app-toast__icon';
    iconEl.innerHTML = `<i class="fas ${icon}"></i>`;

    const body = document.createElement('div');
    body.className = 'app-toast__body';
    const title = document.createElement('div');
    title.className = 'app-toast__title';
    title.textContent = message || '';
    body.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'app-toast__close';
    closeBtn.setAttribute('aria-label', 'ปิดการแจ้งเตือน');
    closeBtn.innerHTML = '&times;';
    const removeToast = () => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 200); };
    closeBtn.addEventListener('click', removeToast);

    toast.appendChild(iconEl);
    toast.appendChild(body);
    toast.appendChild(closeBtn);
    toastContainer.appendChild(toast);
    setTimeout(removeToast, 3500);
  };

  // --- Preview Helpers ---
  const getSelectedAudienceLabel = () => {
    const selectedCard = document.querySelector('.bc-audience-card.active');
    const title = selectedCard?.querySelector('.bc-audience-card__title');
    const audienceLabel = (title?.textContent || '').trim() || 'ไม่ระบุ';
    const orderLabel = getSelectedOrderFilterLabel();
    const dateLabel = getDateFilterLabel();
    const parts = [audienceLabel];
    if (orderLabel) parts.push(orderLabel);
    if (dateLabel) parts.push(dateLabel);
    return parts.join(' • ');
  };

  const getSelectedOrderFilter = () => (
    document.querySelector('input[name="orderFilter"]:checked')?.value || 'all'
  );

  const getSelectedOrderFilterLabel = () => {
    const value = getSelectedOrderFilter();
    if (value === 'with_order') return 'มีออเดอร์';
    if (value === 'without_order') return 'ไม่มีออเดอร์';
    return '';
  };

  const getDateFilterMode = () => (
    document.querySelector('input[name="dateFilterMode"]:checked')?.value || 'all'
  );

  const getDateFilterPayload = () => {
    const mode = getDateFilterMode();
    if (mode === 'today') return { mode: 'today' };
    if (mode === 'custom') {
      return {
        mode: 'custom',
        startDate: (dateStartInput?.value || '').trim(),
        endDate: (dateEndInput?.value || '').trim(),
      };
    }
    return { mode: 'all' };
  };

  const validateDateFilterPayload = (payload = {}) => {
    if (!payload || payload.mode !== 'custom') return null;
    if (!payload.startDate || !payload.endDate) {
      return 'กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด';
    }
    if (payload.startDate > payload.endDate) {
      return 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด';
    }
    return null;
  };

  const getDateFilterLabel = () => {
    const payload = getDateFilterPayload();
    if (payload.mode === 'today') {
      return 'ทักวันนี้';
    }
    if (payload.mode === 'custom' && payload.startDate && payload.endDate) {
      return `ทักช่วง ${payload.startDate} ถึง ${payload.endDate}`;
    }
    return '';
  };

  const syncDateFilterFieldsVisibility = () => {
    if (!dateRangeFields) return;
    const mode = getDateFilterMode();
    dateRangeFields.style.display = mode === 'custom' ? 'flex' : 'none';
  };

  const getSelectedChannelsLabel = () => {
    const selected = Array.from(document.querySelectorAll('input[name="channels"]:checked'));
    if (!selected.length) return 'ยังไม่เลือก';
    const labels = selected.map(input => {
      const labelEl = document.querySelector(`label[for="${input.id}"]`);
      const raw = labelEl ? labelEl.textContent : input.value;
      return (raw || '').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    return labels.length ? labels.join(', ') : 'ยังไม่เลือก';
  };

  const formatPreviewItem = (item, index, total) => {
    const prefix = total > 1 ? `${index + 1}. ` : '';
    if (item.type === 'image') {
      const filename = item.file?.name ? ` (${item.file.name})` : '';
      return `${prefix}รูปภาพ${filename}`;
    }
    const text = (item.content || '').trim();
    return `${prefix}${text || '(ข้อความว่าง)'}`;
  };

  const updatePreview = () => {
    if (previewAudienceLabel) previewAudienceLabel.textContent = getSelectedAudienceLabel();
    if (previewChannelsLabel) previewChannelsLabel.textContent = getSelectedChannelsLabel();
    if (!previewMessage) return;
    if (!messageItems.length) {
      previewMessage.innerHTML = `<div class="bc-preview-placeholder"><i class="fas fa-comment-dots"></i><span>พิมพ์ข้อความเพื่อดูตัวอย่าง</span></div>`;
      if (previewStatus) previewStatus.textContent = 'ยังไม่มีข้อความ';
      return;
    }
    const bubblesHtml = messageItems.map(item => {
      if (item.type === 'image') {
        if (item.previewUrl) {
          return `<div class="bc-bubble-image"><img src="${item.previewUrl}" alt="รูปภาพ"></div>`;
        }
        return `<div class="bc-bubble"><i class="fas fa-image me-1 text-muted"></i>${escapeHtml(item.file ? item.file.name : 'รูปภาพ')}</div>`;
      }
      const text = (item.content || '').trim() || '(ข้อความว่าง)';
      return `<div class="bc-bubble">${escapeHtml(text)}</div>`;
    }).join('');
    previewMessage.innerHTML = bubblesHtml;
    if (previewStatus) previewStatus.textContent = `${messageItems.length} บอลลูน`;
  };

  const handlePreviewClick = () => {
    updatePreview();
    if (previewCard && previewCard.scrollIntoView) {
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // --- Audience Stats Panel (sidebar) ---
  const updateAudienceStatsPanel = (counts) => {
    const panel = document.getElementById('audienceStatsPanel');
    const grid = document.getElementById('audienceStatsGrid');
    if (!panel || !grid) return;
    if (!counts) { panel.style.display = 'none'; return; }
    const platforms = [
      { key: 'line', icon: 'fab fa-line', cls: 'bc-stat-item__icon--line', label: 'LINE' },
      { key: 'facebook', icon: 'fab fa-facebook', cls: 'bc-stat-item__icon--fb', label: 'Facebook' },
      { key: 'instagram', icon: 'fab fa-instagram', cls: 'bc-stat-item__icon--ig', label: 'Instagram' },
      { key: 'whatsapp', icon: 'fab fa-whatsapp', cls: 'bc-stat-item__icon--wa', label: 'WhatsApp' },
    ];
    const items = platforms.filter(p => (counts[p.key] || 0) > 0).map(p => `
      <div class="bc-stat-item">
        <div class="bc-stat-item__icon ${p.cls}"><i class="${p.icon}"></i></div>
        <div>
          <div class="bc-stat-item__num">${(counts[p.key] || 0).toLocaleString()}</div>
          <div class="bc-stat-item__label">${p.label}</div>
        </div>
      </div>`).join('');
    grid.innerHTML = items || '<div class="text-muted small p-1">ไม่มีผู้รับในช่องทางที่เลือก</div>';
    panel.style.display = items ? 'block' : 'none';
  };

  // --- Time Estimate Display ---
  const updateTimeEstimate = () => {
    const el = document.getElementById('timeEstimate');
    const text = document.getElementById('timeEstimateText');
    if (!el || !text || !cachedPerChannel || cachedPerChannel.length === 0) {
      if (el) el.style.display = 'none';
      return;
    }
    const estimate = estimateBroadcastTime(cachedPerChannel, getCurrentSettings());
    text.innerHTML = `ใช้เวลาประมาณ <span class="time-value">${estimate.formatted}</span>`;
    el.style.display = 'block';
  };

  // --- Audience Preview ---
  const updateAudiencePreview = async () => {
    const channels = Array.from(document.querySelectorAll('input[name="channels"]:checked')).map(c => c.value);
    const audience = document.querySelector('input[name="audience"]:checked')?.value || 'all';
    const orderFilter = getSelectedOrderFilter();
    const dateFilter = getDateFilterPayload();
    const dateFilterError = validateDateFilterPayload(dateFilter);

    if (channels.length === 0) {
      if (audienceStats) audienceStats.style.display = 'none';
      if (audienceCountChip) audienceCountChip.innerHTML = '<i class="fas fa-users"></i> เลือกกลุ่มเป้าหมาย';
      updateAudienceStatsPanel(null);
      cachedPerChannel = null;
      updateTimeEstimate();
      updatePreview();
      return;
    }
    if (dateFilterError) {
      if (audienceStats) audienceStats.style.display = 'none';
      if (audienceCountChip) audienceCountChip.innerHTML = '<i class="fas fa-users"></i> ระบุช่วงวันที่';
      updateAudienceStatsPanel(null);
      cachedPerChannel = null;
      updateTimeEstimate();
      updatePreview();
      return;
    }

    try {
      if (audienceTotal) audienceTotal.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
      if (audienceStats) audienceStats.style.display = 'block';

      const res = await fetch('/admin/broadcast/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels, audience, orderFilter, dateFilter })
      });
      const data = await res.json();

      if (data.success) {
        audienceTotal.textContent = data.counts.total.toLocaleString();
        if (audienceLine) audienceLine.textContent = data.counts.line.toLocaleString();
        if (audienceFb) audienceFb.textContent = data.counts.facebook.toLocaleString();
        if (audienceIg) audienceIg.textContent = (data.counts.instagram || 0).toLocaleString();
        if (audienceWa) audienceWa.textContent = (data.counts.whatsapp || 0).toLocaleString();
        if (audienceCountChip) {
          audienceCountChip.innerHTML = `<i class="fas fa-users text-primary"></i> กลุ่มเป้าหมาย <strong>${data.counts.total.toLocaleString()}</strong> คน`;
        }
        updateAudienceStatsPanel(data.counts);
        cachedPerChannel = data.perChannel || null;
        updateTimeEstimate();
      } else {
        if (audienceTotal) audienceTotal.textContent = '-';
        if (audienceLine) audienceLine.textContent = '-';
        if (audienceFb) audienceFb.textContent = '-';
        if (audienceIg) audienceIg.textContent = '-';
        if (audienceWa) audienceWa.textContent = '-';
        if (audienceCountChip) audienceCountChip.innerHTML = '<i class="fas fa-users"></i> เลือกกลุ่มเป้าหมาย';
        updateAudienceStatsPanel(null);
        cachedPerChannel = null;
        updateTimeEstimate();
      }
    } catch (e) {
      console.error("Preview error", e);
      audienceTotal.textContent = '?';
      if (audienceLine) audienceLine.textContent = '?';
      if (audienceFb) audienceFb.textContent = '?';
      if (audienceIg) audienceIg.textContent = '?';
      if (audienceWa) audienceWa.textContent = '?';
    } finally {
      updatePreview();
    }
  };

  // Listeners for Audience & Channels
  document.querySelectorAll('input[name="channels"], input[name="audience"]').forEach(input => {
    input.addEventListener('change', updateAudiencePreview);
  });
  document.querySelectorAll('input[name="orderFilter"], input[name="dateFilterMode"]').forEach(input => {
    input.addEventListener('change', () => {
      syncDateFilterFieldsVisibility();
      updateAudiencePreview();
    });
  });
  [dateStartInput, dateEndInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('change', updateAudiencePreview);
    input.addEventListener('input', updateAudiencePreview);
  });

  // Recalculate estimate when rate settings change
  document.querySelectorAll('input[name="settings_batchSize"], input[name="settings_batchDelay"], input[name="settings_messageDelay"]').forEach(input => {
    input.addEventListener('input', updateTimeEstimate);
    input.addEventListener('change', updateTimeEstimate);
  });

  // Audience Card clicks
  document.querySelectorAll('.bc-audience-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bc-audience-card').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      const radio = btn.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        updateAudiencePreview();
      }
    });
  });


  // --- Message Editor ---
  const moveItem = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= messageItems.length) return;
    [messageItems[index], messageItems[newIndex]] = [messageItems[newIndex], messageItems[index]];
    renderMessageList();
    updatePreview();
  };

  const renderMessageList = () => {
    messageList.innerHTML = '';

    if (messageItems.length === 0) {
      messageList.innerHTML = `<div class="bc-message-empty"><i class="fas fa-comment-dots"></i><span>ยังไม่มีข้อความ กดปุ่มด้านล่างเพื่อเพิ่ม</span></div>`;
      updatePreview();
      return;
    }

    messageItems.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'card mb-2 message-item';

      const body = document.createElement('div');
      body.className = 'card-body p-2 d-flex align-items-center gap-2';

      const indexBadge = document.createElement('div');
      indexBadge.className = 'badge bg-secondary';
      indexBadge.textContent = String(index + 1);

      // Up/Down buttons
      const orderBtns = document.createElement('div');
      orderBtns.className = 'd-flex flex-column gap-1';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'btn btn-outline-secondary btn-sm p-0 px-1';
      upBtn.style.lineHeight = '1.2';
      upBtn.innerHTML = '<i class="fas fa-chevron-up" style="font-size:0.65rem"></i>';
      upBtn.disabled = index === 0;
      upBtn.setAttribute('aria-label', 'เลื่อนขึ้น');
      upBtn.addEventListener('click', () => moveItem(index, -1));

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'btn btn-outline-secondary btn-sm p-0 px-1';
      downBtn.style.lineHeight = '1.2';
      downBtn.innerHTML = '<i class="fas fa-chevron-down" style="font-size:0.65rem"></i>';
      downBtn.disabled = index === messageItems.length - 1;
      downBtn.setAttribute('aria-label', 'เลื่อนลง');
      downBtn.addEventListener('click', () => moveItem(index, 1));

      orderBtns.appendChild(upBtn);
      orderBtns.appendChild(downBtn);

      const contentWrap = document.createElement('div');
      contentWrap.className = 'flex-grow-1';

      if (item.type === 'text') {
        const textarea = document.createElement('textarea');
        textarea.className = 'form-control';
        textarea.rows = 2;
        textarea.placeholder = 'พิมพ์ข้อความ...';
        textarea.value = item.content || '';
        textarea.addEventListener('input', (e) => { item.content = e.target.value; updatePreview(); });
        contentWrap.appendChild(textarea);
      } else {
        const group = document.createElement('div');
        group.className = 'd-flex flex-column gap-1';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'form-control form-control-sm';
        fileInput.accept = 'image/jpeg,image/png,image/webp';
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            item.file = e.target.files[0];
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            item.previewUrl = URL.createObjectURL(item.file);
            renderMessageList();
            updatePreview();
          }
        });
        group.appendChild(fileInput);

        if (item.file && item.previewUrl) {
          const imgWrap = document.createElement('div');
          imgWrap.className = 'd-flex align-items-center gap-2 mt-1';
          const img = document.createElement('img');
          img.src = item.previewUrl;
          img.style.cssText = 'height:56px;width:80px;object-fit:cover;border-radius:4px;border:1px solid #dee2e6';
          img.alt = 'preview';
          const info = document.createElement('small');
          info.className = 'text-muted';
          info.textContent = item.file.name;
          imgWrap.appendChild(img);
          imgWrap.appendChild(info);
          group.appendChild(imgWrap);
        }
        contentWrap.appendChild(group);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-outline-danger btn-sm remove-msg';
      removeBtn.setAttribute('aria-label', 'ลบข้อความ');
      removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
      removeBtn.addEventListener('click', () => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        messageItems.splice(index, 1);
        renderMessageList();
        updatePreview();
      });

      body.appendChild(indexBadge);
      body.appendChild(orderBtns);
      body.appendChild(contentWrap);
      body.appendChild(removeBtn);
      div.appendChild(body);
      messageList.appendChild(div);
    });
    updatePreview();
  };

  addTextBtn.addEventListener('click', () => {
    if (messageItems.length >= 5) return showToast('ส่งได้สูงสุด 5 ข้อความ', 'warning');
    messageItems.push({ type: 'text', content: '' });
    renderMessageList();
  });

  addImageBtn.addEventListener('click', () => {
    if (messageItems.length >= 5) return showToast('ส่งได้สูงสุด 5 ข้อความ', 'warning');
    messageItems.push({ type: 'image', file: null, previewUrl: null });
    renderMessageList();
  });


  // --- Submission ---
  broadcastForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (messageItems.length === 0) return showToast('กรุณาเพิ่มข้อความอย่างน้อย 1 ข้อความ', 'warning');
    if (messageItems.filter(m => m.type === 'text').some(m => !m.content.trim())) return showToast('กรุณากรอกข้อความให้ครบถ้วน', 'warning');
    if (messageItems.filter(m => m.type === 'image').some(m => !m.file)) return showToast('กรุณาเลือกรูปภาพให้ครบถ้วน', 'warning');

    const channels = document.querySelectorAll('input[name="channels"]:checked');
    if (channels.length === 0) return showToast('กรุณาเลือกช่องทาง', 'warning');
    const dateFilter = getDateFilterPayload();
    const dateFilterError = validateDateFilterPayload(dateFilter);
    if (dateFilterError) return showToast(dateFilterError, 'warning');

    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> กำลังเริ่ม...';

    const formData = new FormData(broadcastForm);
    const messagesPayload = [];
    messageItems.forEach(msg => {
      if (msg.type === 'text') {
        messagesPayload.push({ type: 'text', content: msg.content.trim() });
      } else if (msg.type === 'image') {
        messagesPayload.push({ type: 'image' });
        formData.append('images', msg.file);
      }
    });
    formData.set('messages', JSON.stringify(messagesPayload));

    const channelsArr = Array.from(channels).map(c => c.value);
    formData.set('channels', JSON.stringify(channelsArr));
    formData.set('audience', JSON.stringify(document.querySelector('input[name="audience"]:checked')?.value || 'all'));
    formData.set('orderFilter', JSON.stringify(getSelectedOrderFilter()));
    formData.set('dateFilter', JSON.stringify(dateFilter));

    const settings = getCurrentSettings();
    formData.set('settings', JSON.stringify(settings));

    try {
      const res = await fetch('/admin/broadcast', { method: 'POST', body: formData });
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const result = isJson ? await res.json() : { success: false, error: `HTTP ${res.status}` };

      if (res.ok && result.success) {
        progressModal.show();
        startPolling(result.broadcastId);
      } else {
        showToast(result.error || `การส่งล้มเหลว (HTTP ${res.status})`, 'error');
        resetSubmitBtn();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
      resetSubmitBtn();
    }
  });

  const resetSubmitBtn = () => {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> ส่งข้อความ';
  };


  // --- Progress Polling ---
  const platformIconMap = {
    line: { icon: 'fab fa-line', cls: 'platform-line' },
    facebook: { icon: 'fab fa-facebook-messenger', cls: 'platform-facebook' },
    instagram: { icon: 'fab fa-instagram', cls: 'platform-instagram' },
    whatsapp: { icon: 'fab fa-whatsapp', cls: 'platform-whatsapp' },
  };

  const startPolling = (jobId) => {
    broadcastStartTime = Date.now();

    // Clear per-channel cards from previous run
    if (channelProgressList) channelProgressList.innerHTML = '';

    // Elapsed timer — every second
    elapsedTimer = setInterval(() => {
      if (!broadcastStartTime) return;
      const elapsed = Math.floor((Date.now() - broadcastStartTime) / 1000);
      if (elapsedTimeEl) elapsedTimeEl.textContent = formatDurationShort(elapsed);
    }, 1000);

    // Cancel button
    cancelButton.onclick = async () => {
      if (confirm('ต้องการยกเลิกการส่งหรือไม่?')) {
        await fetch(`/admin/broadcast/cancel/${jobId}`, { method: 'DELETE' });
        showToast('ยกเลิกการส่งแล้ว', 'info');
      }
    };

    // Poll every 2 seconds
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/admin/broadcast/status/${jobId}`);
        const data = await res.json();

        if (!data.success) {
          stopPolling();
          showToast(`ไม่สามารถตรวจสอบสถานะได้: ${data.error || 'unknown'}`, 'error');
          resetSubmitBtn();
          return;
        }

        const { stats } = data;
        updateProgressUI(stats);

        if (['completed', 'cancelled', 'failed'].includes(stats.status)) {
          stopPolling();
          setTimeout(() => {
            progressModal.hide();
            const msg = stats.status === 'completed'
              ? `ส่งเสร็จแล้ว! สำเร็จ ${stats.sent} คน${stats.failed > 0 ? `, ล้มเหลว ${stats.failed} คน` : ''}`
              : `การส่งจบลงด้วยสถานะ: ${stats.status}`;
            showToast(msg, stats.status === 'completed' ? 'success' : 'warning');
            resetSubmitBtn();
            updatePreview();
          }, 1500);
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  };

  const updateProgressUI = (stats) => {
    const processed = stats.sent + stats.failed;
    const percent = stats.total > 0 ? Math.round((processed / stats.total) * 100) : 0;

    // Overall bar
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
      progressBar.textContent = `${percent}%`;
    }
    if (sentCountEl) sentCountEl.textContent = processed.toLocaleString();
    if (totalCountEl) totalCountEl.textContent = stats.total.toLocaleString();
    if (successCountEl) successCountEl.textContent = stats.sent.toLocaleString();
    if (failedCountEl) failedCountEl.textContent = stats.failed.toLocaleString();

    // Remaining time
    if (remainingTimeEl && broadcastStartTime && processed > 0) {
      const elapsedSec = (Date.now() - broadcastStartTime) / 1000;
      const rate = processed / elapsedSec;
      const remaining = stats.total - processed;
      if (remaining > 0 && rate > 0) {
        remainingTimeEl.textContent = formatDuration(Math.ceil(remaining / rate));
      } else {
        remainingTimeEl.textContent = 'เสร็จแล้ว!';
      }
    }

    // Per-channel cards
    if (channelProgressList && stats.channels) {
      renderChannelCards(stats.channels);
    }
  };

  const renderChannelCards = (channels) => {
    const existingKeys = new Set();

    for (const [key, ch] of Object.entries(channels)) {
      existingKeys.add(key);
      let card = channelProgressList.querySelector(`[data-channel="${CSS.escape(key)}"]`);

      const processed = ch.sent + ch.failed;
      const percent = ch.total > 0 ? Math.round((processed / ch.total) * 100) : 0;
      const pi = platformIconMap[ch.platform] || { icon: 'fas fa-robot', cls: '' };

      let statusClass = '';
      if (ch.status === 'running') statusClass = 'is-running';
      else if (ch.status === 'completed') statusClass = 'is-completed';
      else if (ch.status === 'failed' || ch.status === 'cancelled') statusClass = 'is-failed';

      if (!card) {
        card = document.createElement('div');
        card.className = `broadcast-channel-card ${statusClass}`;
        card.setAttribute('data-channel', key);
        card.innerHTML = `
          <div class="channel-progress-icon ${pi.cls}">
            <i class="${pi.icon}"></i>
          </div>
          <div class="channel-progress-info">
            <div class="channel-progress-name">${escapeHtml(ch.name)}</div>
            <div class="channel-progress-bar-wrap">
              <div class="progress"><div class="progress-bar bg-primary" role="progressbar" style="width:${percent}%"></div></div>
            </div>
            <div class="channel-progress-meta">${ch.sent} สำเร็จ / ${ch.failed} ล้มเหลว</div>
          </div>
          <div class="channel-progress-stat">${processed}/${ch.total}</div>
        `;
        channelProgressList.appendChild(card);
      } else {
        card.className = `broadcast-channel-card ${statusClass}`;
        const bar = card.querySelector('.progress-bar');
        if (bar) bar.style.width = `${percent}%`;
        const meta = card.querySelector('.channel-progress-meta');
        if (meta) meta.textContent = `${ch.sent} สำเร็จ / ${ch.failed} ล้มเหลว`;
        const stat = card.querySelector('.channel-progress-stat');
        if (stat) stat.textContent = `${processed}/${ch.total}`;
      }
    }

    // Remove orphaned
    channelProgressList.querySelectorAll('[data-channel]').forEach(el => {
      if (!existingKeys.has(el.getAttribute('data-channel'))) el.remove();
    });
  };


  // --- Init ---
  if (previewBtn) previewBtn.addEventListener('click', handlePreviewClick);
  if (previewBtnInline) previewBtnInline.addEventListener('click', handlePreviewClick);

  syncDateFilterFieldsVisibility();
  updateAudiencePreview();
  updatePreview();

})();
