(() => {
  const messageInput = document.getElementById('message');
  const charCount = document.getElementById('messageCharCount');
  const previewMessage = document.getElementById('previewMessage');
  const previewAudienceLabel = document.getElementById('previewAudienceLabel');
  const previewChannelsLabel = document.getElementById('previewChannelsLabel');
  const previewStatus = document.getElementById('previewStatus');
  const audienceCount = document.getElementById('audienceCount');
  const previewCards = [document.getElementById('previewBtn'), document.getElementById('previewBtnInline')].filter(Boolean);
  const submitBtn = document.getElementById('submitBroadcastBtn');
  const toastContainer = document.getElementById('broadcastToastContainer');

  const ensureToastContainer = () => {
    if (!toastContainer) return null;
    return toastContainer;
  };

  const showToast = (message, type = 'info') => {
    const container = ensureToastContainer();
    if (!container) return;
    const typeMap = {
      success: { icon: 'fa-check-circle', className: 'app-toast--success' },
      error: { icon: 'fa-times-circle', className: 'app-toast--danger' },
      warning: { icon: 'fa-exclamation-triangle', className: 'app-toast--warning' },
      info: { icon: 'fa-info-circle', className: 'app-toast--info' },
    };
    const toastType = typeMap[type] ? type : 'info';
    const { icon, className } = typeMap[toastType];
    const toast = document.createElement('div');
    toast.className = `app-toast ${className}`;
    toast.innerHTML = `
      <div class="app-toast__icon"><i class="fas ${icon}"></i></div>
      <div class="app-toast__body">
        <div class="app-toast__title">${message || ''}</div>
      </div>
      <button class="app-toast__close" aria-label="ปิดการแจ้งเตือน">&times;</button>
    `;
    const removeToast = () => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 200);
    };
    toast.querySelector('.app-toast__close')?.addEventListener('click', removeToast);
    container.appendChild(toast);
    setTimeout(removeToast, 3200);
  };

  const updatePreviewText = () => {
    const text = (messageInput?.value || '').trim();
    const length = text.length;
    if (charCount) {
      charCount.textContent = length;
    }
    if (previewMessage) {
      previewMessage.textContent = text || 'พิมพ์ข้อความเพื่อดูตัวอย่าง...';
    }
    if (previewStatus) {
      previewStatus.textContent = length > 0 ? `${length} อักขระ` : 'ยังไม่มีข้อความ';
    }
  };

  const updateAudience = (value) => {
    if (audienceCount) {
      const map = {
        all: 'ผู้ใช้ทุกคน',
        tagged: 'กลุ่มติดตาม',
        untagged: 'ผู้ใช้ทั่วไป',
      };
      audienceCount.textContent = map[value] || 'เลือกกลุ่มเป้าหมาย';
    }
    if (previewAudienceLabel) {
      const map = {
        all: 'ผู้ใช้ทุกคน',
        tagged: 'กลุ่มติดตาม',
        untagged: 'ผู้ใช้ทั่วไป',
      };
      previewAudienceLabel.textContent = map[value] || 'เลือกกลุ่มเป้าหมาย';
    }
  };

  const updatePreviewChannels = () => {
    const checked = Array.from(document.querySelectorAll('input[name="channels"]:checked'));
    const labels = checked.map((c) => {
      const label = c.closest('.form-check')?.querySelector('.form-check-label');
      return label ? label.textContent.trim() : c.value;
    });
    if (previewChannelsLabel) {
      previewChannelsLabel.textContent = labels.length ? labels.join(', ') : 'ยังไม่เลือก';
    }
  };

  const togglePreviewCard = () => {
    const card = document.getElementById('broadcastPreview');
    if (!card) return;
    card.classList.toggle('d-none');
  };

  const audienceButtons = Array.from(document.querySelectorAll('.audience-card'));
  audienceButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      audienceButtons.forEach((b) => {
        const pressed = b === btn;
        b.classList.toggle('active', pressed);
        b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        const radio = b.querySelector('input[type="radio"]');
        if (radio) radio.checked = pressed;
      });
      updateAudience(value);
    });
  });

  if (messageInput) {
    messageInput.addEventListener('input', updatePreviewText);
    updatePreviewText();
  }

  document.querySelectorAll('input[name="channels"]').forEach((input) => {
    input.addEventListener('change', updatePreviewChannels);
  });
  updatePreviewChannels();

  previewCards.forEach((btn) => {
    btn.addEventListener('click', () => {
      togglePreviewCard();
      const icon = btn.querySelector('i');
      const isHidden = document.getElementById('broadcastPreview')?.classList.contains('d-none');
      if (icon) {
        icon.className = isHidden ? 'fas fa-eye me-1' : 'fas fa-eye-slash me-1';
      }
      btn.innerHTML = `${icon ? icon.outerHTML : ''}${isHidden ? ' ดูตัวอย่าง' : ' ซ่อนตัวอย่าง'}`;
    });
  });

  const form = document.getElementById('broadcastForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      const text = (messageInput?.value || '').trim();
      const channels = document.querySelectorAll('input[name="channels"]:checked');
      if (!text) {
        e.preventDefault();
        showToast('กรุณากรอกข้อความที่จะส่ง', 'warning');
        messageInput?.focus();
        return;
      }
      if (!channels.length) {
        e.preventDefault();
        showToast('กรุณาเลือกช่องทางอย่างน้อย 1 ช่องทาง', 'warning');
        return;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังส่ง...';
      }
    });
  }

  // init defaults
  updateAudience('all');
})();
