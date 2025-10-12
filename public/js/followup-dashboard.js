(() => {
    const tableBody = document.getElementById('followupTableBody');
    const countEl = document.getElementById('followupCount');
    const alertEl = document.getElementById('followupAlert');
    const emptyStateEl = document.getElementById('followupEmptyState');
    const searchInput = document.getElementById('followupSearch');
    const refreshBtn = document.getElementById('followupRefreshBtn');

    let allUsers = [];
    let isLoading = false;
    let socket = null;
    const config = window.followUpDashboardConfig || {};
    const dashboardEnabled = config.showDashboard !== false;

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTimestamp(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function showAlert(type, message) {
        if (!alertEl) return;
        alertEl.className = `alert alert-${type}`;
        alertEl.textContent = message;
        alertEl.classList.remove('d-none');
        setTimeout(() => {
            alertEl.classList.add('d-none');
        }, 4000);
    }

    function renderUsers() {
        if (!dashboardEnabled) {
            if (countEl) countEl.textContent = 0;
            if (tableBody) tableBody.innerHTML = '';
            return;
        }

        const keyword = (searchInput && typeof searchInput.value === 'string'
            ? searchInput.value
            : '').trim().toLowerCase();
        const filtered = allUsers.filter(user => {
            if (!keyword) return true;
            const name = (user.displayName || '').toLowerCase();
            const reason = (user.followUpReason || '').toLowerCase();
            return name.includes(keyword) || reason.includes(keyword) || user.userId.toLowerCase().includes(keyword);
        });

        countEl.textContent = allUsers.length;

        if (filtered.length === 0) {
            tableBody.innerHTML = '';
            if (allUsers.length === 0) {
                emptyStateEl.innerHTML = `
                    <i class="fas fa-check-circle fa-2x mb-2 text-success"></i>
                    <p class="mb-1">ยังไม่มีลูกค้าที่ต้องติดตาม</p>
                    <p class="small mb-0">เมื่อมีการสั่งซื้อ ระบบจะแสดงรายชื่อที่นี่โดยอัตโนมัติ</p>
                `;
            } else {
                emptyStateEl.innerHTML = `
                    <i class="fas fa-search fa-2x mb-2 text-muted"></i>
                    <p class="mb-1">ไม่พบข้อมูลที่ตรงกับคำค้น</p>
                    <p class="small mb-0">ลองเปลี่ยนคำค้นหา หรือเคลียร์ช่องค้นหาเพื่อดูทั้งหมด</p>
                `;
            }
            emptyStateEl.classList.remove('d-none');
            return;
        }

        emptyStateEl.classList.add('d-none');

        tableBody.innerHTML = filtered.map(user => {
            const displayName = user.displayName || `${user.userId.slice(0, 6)}...`;
            const reason = user.followUpReason || 'ลูกค้ายืนยันสั่งซื้อแล้ว';
            const updated = formatTimestamp(user.followUpUpdatedAt);
            return `
                <tr>
                    <td>
                        <div class="d-flex flex-column">
                            <span class="fw-bold">${escapeHtml(displayName)}</span>
                            <span class="text-muted small">${escapeHtml(user.userId)}</span>
                        </div>
                    </td>
                    <td>${escapeHtml(reason)}</td>
                    <td>${escapeHtml(updated)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" data-user-id="${escapeHtml(user.userId)}">
                            <i class="fas fa-times me-1"></i> ลบแท็ก
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tableBody.querySelectorAll('button[data-user-id]').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                const userId = event.currentTarget.getAttribute('data-user-id');
                if (!userId) return;
                if (!confirm('ต้องการลบแท็กติดตามของผู้ใช้นี้หรือไม่?')) return;
                try {
                    const response = await fetch('/admin/followup/clear', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId })
                    });
                    const data = await response.json();
                    if (data.success) {
                        showAlert('success', 'ลบแท็กเรียบร้อยแล้ว');
                        await loadUsers();
                    } else {
                        showAlert('danger', data.error || 'ไม่สามารถลบแท็กได้');
                    }
                } catch (error) {
                    console.error('clear follow-up error', error);
                    showAlert('danger', 'เกิดข้อผิดพลาดในการลบแท็ก');
                }
            });
        });
    }

    async function loadUsers(showMessage = false) {
        if (!dashboardEnabled) {
            return;
        }
        if (isLoading) return;
        isLoading = true;
        try {
            const response = await fetch('/admin/followup/users');
            const data = await response.json();
            if (data.success) {
                allUsers = data.users || [];
                renderUsers();
                if (showMessage) {
                    showAlert('info', 'อัปเดตรายการล่าสุดแล้ว');
                }
            } else {
                showAlert('danger', data.error || 'ไม่สามารถดึงข้อมูลได้');
            }
        } catch (error) {
            console.error('load follow-up error', error);
            showAlert('danger', 'เกิดข้อผิดพลาดในการดึงข้อมูล');
        } finally {
            isLoading = false;
        }
    }

    function initSocket() {
        if (!dashboardEnabled) return;
        try {
            socket = io();
            socket.on('followUpTagged', () => {
                loadUsers();
            });
        } catch (error) {
            console.warn('ไม่สามารถเชื่อมต่อ Socket.IO ได้', error);
        }
    }

    if (searchInput && dashboardEnabled) {
        searchInput.addEventListener('input', () => {
            renderUsers();
        });
    }

    if (refreshBtn && dashboardEnabled) {
        refreshBtn.addEventListener('click', () => {
            loadUsers(true);
        });
    }

    if (dashboardEnabled) {
        initSocket();
        loadUsers();
    }
})();
