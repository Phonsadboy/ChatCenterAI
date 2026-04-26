(function () {
  'use strict';

  const LS_KEY = 'adminSidebarCollapsedV2';

  function getSidebarCollapsed() {
    try {
      const stored = localStorage.getItem(LS_KEY);
      return stored === null ? true : stored !== 'false';
    } catch (_) {
      return true;
    }
  }

  function persistSidebarCollapsed(collapsed) {
    try {
      localStorage.setItem(LS_KEY, String(collapsed));
    } catch (_) {
      // Ignore storage errors; the visible state still updates for this page.
    }
  }

  function init() {
    document.body.classList.add('has-admin-layout');

    document.body.classList.toggle('sidebar-collapsed', getSidebarCollapsed());

    bindDesktopToggle();
    bindMobileToggle();
    bindOverlay();
    bindLogout();
    bindFontSelector();
    bindSidebarTooltips();
    bindMobileMoreSheet();
    highlightCurrentPage();
    syncChatBadge();
  }

  function bindDesktopToggle() {
    const btn = document.querySelector('[data-layout-toggle="desktop"]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      persistSidebarCollapsed(collapsed);
    });
  }

  function bindMobileToggle() {
    const btn = document.querySelector('[data-layout-toggle="mobile"]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });
  }

  function bindOverlay() {
    const overlay = document.getElementById('appSidebarOverlay');
    if (!overlay) return;
    overlay.addEventListener('click', () => {
      document.body.classList.remove('sidebar-open');
    });
  }

  function bindLogout() {
    const btn = document.getElementById('adminLogoutBtn');
    if (!btn) return;
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      btn.disabled = true;
      try {
        const response = await fetch('/admin/logout', { method: 'POST' });
        if (!response.ok) throw new Error('logout_failed');
        window.location.href = '/admin/login';
      } catch (error) {
        console.error('[Auth] logout error:', error);
        if (typeof window.showToast === 'function') {
          window.showToast('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
        } else {
          alert('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        }
        btn.disabled = false;
      }
    });
  }

  function bindFontSelector() {
    const selector = document.getElementById('globalFontSelector');
    const savedFont = window.AdminFont?.getSavedFont
      ? window.AdminFont.getSavedFont()
      : localStorage.getItem('adminFont');
    if (savedFont) {
      if (window.AdminFont?.apply) {
        window.AdminFont.apply(savedFont);
      } else {
        document.documentElement.style.setProperty('--font-family-base', savedFont);
        document.documentElement.style.setProperty('--font-family-heading', savedFont);
      }
      if (selector) {
        selector.value = savedFont;
      }
    }
    if (!selector) return;
    selector.addEventListener('change', (e) => {
      const font = e.target.value;
      if (window.AdminFont?.apply) {
        window.AdminFont.apply(font);
      } else {
        document.documentElement.style.setProperty('--font-family-base', font);
        document.documentElement.style.setProperty('--font-family-heading', font);
      }
      if (window.AdminFont?.saveFont) {
        window.AdminFont.saveFont(font);
      } else {
        localStorage.setItem('adminFont', font);
      }
    });
  }

  function bindSidebarTooltips() {
    const items = document.querySelectorAll('.app-sidebar__item[data-label]');
    if (!items.length) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'app-sidebar-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);

    const hideTooltip = () => {
      tooltip.classList.remove('is-visible');
    };

    const showTooltip = (item) => {
      if (!document.body.classList.contains('sidebar-collapsed') || window.innerWidth < 992) {
        hideTooltip();
        return;
      }

      const label = item.dataset.label || '';
      if (!label) return;

      const rect = item.getBoundingClientRect();
      tooltip.textContent = label;
      tooltip.style.left = `${Math.round(rect.right + 10)}px`;
      tooltip.style.top = `${Math.round(rect.top + (rect.height / 2))}px`;
      tooltip.classList.add('is-visible');
    };

    items.forEach((item) => {
      item.addEventListener('mouseenter', () => showTooltip(item));
      item.addEventListener('focus', () => showTooltip(item));
      item.addEventListener('mouseleave', hideTooltip);
      item.addEventListener('blur', hideTooltip);
    });

    window.addEventListener('resize', hideTooltip);
    window.addEventListener('scroll', hideTooltip, true);
  }

  function bindMobileMoreSheet() {
    const moreBtn = document.getElementById('appMobileNavMore');
    const sheet = document.getElementById('appMobileNavMoreSheet');
    if (!moreBtn || !sheet) return;

    const closeSheet = () => sheet.classList.remove('is-open');

    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sheet.classList.add('is-open');
    });

    sheet.querySelector('.app-mobile-nav__more-backdrop')?.addEventListener('click', closeSheet);

    // Close on item click
    sheet.querySelectorAll('.app-mobile-nav__more-item').forEach((item) => {
      item.addEventListener('click', closeSheet);
    });

    // Swipe down to close
    let startY = 0;
    const panel = sheet.querySelector('.app-mobile-nav__more-panel');
    if (panel) {
      panel.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
      }, { passive: true });
      panel.addEventListener('touchend', (e) => {
        const endY = e.changedTouches[0].clientY;
        if (endY - startY > 80) closeSheet();
      }, { passive: true });
    }
  }

  function highlightCurrentPage() {
    const current = typeof window.__adminActivePage === 'string'
      ? window.__adminActivePage
      : '';
    if (!current) return;

    // Sidebar
    document.querySelectorAll('.app-sidebar__item').forEach((el) => {
      if (el.dataset.page === current) el.classList.add('is-active');
      else el.classList.remove('is-active');
    });

    // Mobile bottom nav
    document.querySelectorAll('.app-mobile-nav__item').forEach((el) => {
      if (el.dataset.page === current) el.classList.add('is-active');
      else el.classList.remove('is-active');
    });

    // Mobile more grid
    document.querySelectorAll('.app-mobile-nav__more-item').forEach((el) => {
      if (el.dataset.page === current) el.classList.add('is-active');
      else el.classList.remove('is-active');
    });
  }

  function syncChatBadge() {
    const badgeEls = document.querySelectorAll('[data-chat-badge]');
    const update = (count) => {
      badgeEls.forEach((el) => {
        const num = Number(count) || 0;
        if (num > 0) {
          el.textContent = num > 99 ? '99+' : String(num);
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      });
    };

    const initial = document.getElementById('chatNotificationBadge');
    if (initial) {
      const val = parseInt(initial.textContent, 10) || 0;
      update(val);
    }

    if (typeof window.io !== 'undefined') {
      try {
        const socket = window.io();
        socket.on('unreadUpdate', (data) => {
          if (data && typeof data.count === 'number') update(data.count);
        });
      } catch (_) {
        // ignore socket errors
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
