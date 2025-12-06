(() => {
  // State
  let messageItems = [];
  let pollInterval = null;
  let isSubmitting = false;

  // DOM Elements
  const messageList = document.getElementById('messageList');
  const addTextBtn = document.getElementById('addTextBtn');
  const addImageBtn = document.getElementById('addImageBtn');
  const messagesInput = document.getElementById('messagesInput');
  const audienceStats = document.getElementById('audienceStats');
  const audienceTotal = document.getElementById('audienceTotal');
  const audienceLine = document.getElementById('audienceLine');
  const audienceFb = document.getElementById('audienceFb');
  const progressModal = new bootstrap.Modal(document.getElementById('progressModal'));
  const toastContainer = document.getElementById('broadcastToastContainer');
  const broadcastForm = document.getElementById('broadcastForm');
  const submitBtn = document.getElementById('submitBroadcastBtn');
  const cancelBtn = document.getElementById('cancelBroadcastBtn');

  // Progress Elements
  const progressBar = document.querySelector('#progressModal .progress-bar');
  const sentCountEl = document.getElementById('sentCount');
  const totalCountEl = document.getElementById('totalCount');
  const cancelButton = document.getElementById('cancelBroadcastBtn');

  // --- Utilities ---
  const ensureToastContainer = () => toastContainer;

  const showToast = (message, type = 'info') => {
    const container = ensureToastContainer();
    if (!container) return;
    const typeMap = {
      success: { icon: 'fa-check-circle', className: 'app-toast--success' },
      error: { icon: 'fa-times-circle', className: 'app-toast--danger' },
      warning: { icon: 'fa-exclamation-triangle', className: 'app-toast--warning' },
      info: { icon: 'fa-info-circle', className: 'app-toast--info' },
    };
    const { icon, className } = typeMap[type] || typeMap.info;
    const toast = document.createElement('div');
    toast.className = `app-toast ${className}`;
    toast.innerHTML = `
      <div class="app-toast__icon"><i class="fas ${icon}"></i></div>
      <div class="app-toast__body"><div class="app-toast__title">${message}</div></div>
      <button class="app-toast__close">&times;</button>
    `;
    toast.querySelector('.app-toast__close').addEventListener('click', () => {
      toast.remove();
    });
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  };

  // --- Audience Preview ---
  const updateAudiencePreview = async () => {
    const channels = Array.from(document.querySelectorAll('input[name="channels"]:checked')).map(c => c.value);
    const audience = document.querySelector('input[name="audience"]:checked')?.value || 'all';

    if (channels.length === 0) {
      audienceStats.style.display = 'none';
      return;
    }

    try {
      audienceTotal.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
      audienceStats.style.display = 'block';

      const res = await fetch('/admin/broadcast/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels, audience })
      });
      const data = await res.json();

      if (data.success) {
        audienceTotal.textContent = data.counts.total.toLocaleString();
        audienceLine.textContent = data.counts.line.toLocaleString();
        audienceFb.textContent = data.counts.facebook.toLocaleString();
      } else {
        audienceTotal.textContent = '-';
      }
    } catch (e) {
      console.error("Preview error", e);
      audienceTotal.textContent = '?';
    }
  };

  // Listeners for Audience
  document.querySelectorAll('input[name="channels"], input[name="audience"]').forEach(input => {
    input.addEventListener('change', updateAudiencePreview);
  });
  // Setup Audience Card clicks
  document.querySelectorAll('.audience-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.audience-card').forEach(b => {
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
  const renderMessageList = () => {
    messageList.innerHTML = '';

    if (messageItems.length === 0) {
      messageList.innerHTML = `<div class="message-item empty-state text-center p-3 border rounded border-dashed bg-light text-muted">ยังไม่มีข้อความ กดปุ่มด้านล่างเพื่อเพิ่ม</div>`;
      return;
    }

    messageItems.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'card mb-2 message-item';
      div.innerHTML = `
            <div class="card-body p-2 d-flex align-items-center gap-2">
                <div class="badge bg-secondary">${index + 1}</div>
                <div class="flex-grow-1">
                    ${item.type === 'text'
          ? `<textarea class="form-control" rows="2" placeholder="พิมพ์ข้อความ...">${item.content || ''}</textarea>`
          : `<div class="input-group">
                             <input type="file" class="form-control" accept="image/*">
                             ${item.file ? `<span class="input-group-text bg-success text-white"><i class="fas fa-check"></i></span>` : ''}
                           </div>`
        }
                </div>
                <button type="button" class="btn btn-outline-danger btn-sm remove-msg"><i class="fas fa-trash"></i></button>
            </div>
        `;

      // Bind events
      const removeBtn = div.querySelector('.remove-msg');
      removeBtn.addEventListener('click', () => {
        messageItems.splice(index, 1);
        renderMessageList();
      });

      if (item.type === 'text') {
        const textarea = div.querySelector('textarea');
        textarea.addEventListener('input', (e) => {
          item.content = e.target.value;
        });
      } else {
        const fileInput = div.querySelector('input[type="file"]');
        fileInput.addEventListener('change', (e) => {
          if (e.target.files[0]) {
            item.file = e.target.files[0];
            renderMessageList(); // re-render to show checkmark
          }
        });
        // Restore file object if existing (not possible with file input value, but we keep reference in item.file)
        // Visual feedback is handled by checkmark above
      }

      messageList.appendChild(div);
    });
  };

  addTextBtn.addEventListener('click', () => {
    if (messageItems.length >= 5) return showToast('ส่งได้สูงสุด 5 ข้อความ', 'warning');
    messageItems.push({ type: 'text', content: '' });
    renderMessageList();
  });

  addImageBtn.addEventListener('click', () => {
    if (messageItems.length >= 5) return showToast('ส่งได้สูงสุด 5 ข้อความ', 'warning');
    messageItems.push({ type: 'image', file: null });
    renderMessageList();
  });


  // --- Submission & Progress ---
  broadcastForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validation
    if (messageItems.length === 0) return showToast('กรุณาเพิ่มข้อความอย่างน้อย 1 ข้อความ', 'warning');

    const textItems = messageItems.filter(m => m.type === 'text');
    if (textItems.some(m => !m.content.trim())) return showToast('กรุณากรอกข้อความให้ครบถ้วน', 'warning');

    const imgItems = messageItems.filter(m => m.type === 'image');
    if (imgItems.some(m => !m.file)) return showToast('กรุณาเลือกรูปภาพให้ครบถ้วน', 'warning');

    const channels = document.querySelectorAll('input[name="channels"]:checked');
    if (channels.length === 0) return showToast('กรุณาเลือกช่องทาง', 'warning');

    // Prepare Data
    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> กำลังเริ่ม...';

    const formData = new FormData(broadcastForm);

    // Construct Messages JSON & Append Files
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

    // JSON-ify other fields just to be safe if backend expects parsing
    const channelsArr = Array.from(channels).map(c => c.value);
    formData.set('channels', JSON.stringify(channelsArr));

    const audienceVal = document.querySelector('input[name="audience"]:checked')?.value || 'all';
    formData.set('audience', JSON.stringify(audienceVal));

    const settings = {
      batchSize: document.querySelector('input[name="settings_batchSize"]').value,
      batchDelay: document.querySelector('input[name="settings_batchDelay"]').value,
      messageDelay: document.querySelector('input[name="settings_messageDelay"]').value
    };
    formData.set('settings', JSON.stringify(settings));

    try {
      const res = await fetch('/admin/broadcast', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();

      if (result.success) {
        // Start Polling
        progressModal.show();
        startPolling(result.broadcastId);
      } else {
        showToast(result.error || 'การส่งล้มเหลว', 'error');
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> ส่งข้อความ';
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> ส่งข้อความ';
    }
  });

  const startPolling = (jobId) => {
    // Setup cancel button
    cancelButton.onclick = async () => {
      if (confirm('ต้องการยกเลิกการส่งหรือไม่?')) {
        await fetch(`/admin/broadcast/cancel/${jobId}`, { method: 'DELETE' });
        showToast('ยกเลิกการส่งแล้ว', 'info');
      }
    };

    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/admin/broadcast/status/${jobId}`);
        const data = await res.json();

        if (!data.success) {
          clearInterval(pollInterval);
          alert('ไม่สามารถตรวจสอบสถานะได้: ' + data.error);
          resetForm();
          return;
        }

        const { stats } = data;
        updateProgressUI(stats);

        if (['completed', 'cancelled', 'failed'].includes(stats.status)) {
          clearInterval(pollInterval);
          setTimeout(() => {
            progressModal.hide();
            showToast(`การส่งจบลงด้วยสถานะ: ${stats.status}`, stats.status === 'completed' ? 'success' : 'warning');
            resetForm();
          }, 1000);
        }

      } catch (e) {
        console.error("Polling error", e);
      }
    }, 2000);
  };

  const updateProgressUI = (stats) => {
    const percent = Math.round(((stats.sent + stats.failed) / stats.total) * 100) || 0;
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;
    sentCountEl.textContent = (stats.sent + stats.failed).toLocaleString();
    totalCountEl.textContent = stats.total.toLocaleString();
  };

  const resetForm = () => {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> ส่งข้อความ';
    // Optional: Clear form
    // messageItems = [];
    // renderMessageList();
  };

  // Init
  updateAudiencePreview();

})();
