// Admin Dashboard V2 - Instruction Management
(function() {
    'use strict';

    // Modals
    const instructionModal = new bootstrap.Modal(document.getElementById('instructionModal'));
    const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));

    // Create Instruction
    document.getElementById('createInstructionBtn').addEventListener('click', () => {
        document.getElementById('instructionModalTitle').textContent = 'สร้าง Instruction';
        document.getElementById('instructionId').value = '';
        document.getElementById('instructionName').value = '';
        document.getElementById('instructionDescription').value = '';
        instructionModal.show();
    });

    // Save Instruction
    document.getElementById('saveInstructionBtn').addEventListener('click', async () => {
        const id = document.getElementById('instructionId').value;
        const name = document.getElementById('instructionName').value.trim();
        const description = document.getElementById('instructionDescription').value.trim();

        if (!name) {
            alert('กรุณาระบุชื่อ Instruction');
            return;
        }

        try {
            const url = id ? `/api/instructions-v2/${id}` : '/api/instructions-v2';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });

            const data = await res.json();

            if (data.success) {
                instructionModal.hide();
                location.reload();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (err) {
            console.error('Error saving instruction:', err);
            alert('เกิดข้อผิดพลาด');
        }
    });

    // Edit Instruction
    document.querySelectorAll('.edit-instruction').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;

            try {
                const res = await fetch(`/api/instructions-v2/${id}`);
                const data = await res.json();

                if (data.success) {
                    document.getElementById('instructionModalTitle').textContent = 'แก้ไข Instruction';
                    document.getElementById('instructionId').value = id;
                    document.getElementById('instructionName').value = data.instruction.name || '';
                    document.getElementById('instructionDescription').value = data.instruction.description || '';
                    instructionModal.show();
                } else {
                    alert(data.error || 'ไม่พบ Instruction');
                }
            } catch (err) {
                console.error('Error fetching instruction:', err);
                alert('เกิดข้อผิดพลาด');
            }
        });
    });

    // Delete Instruction
    document.querySelectorAll('.delete-instruction').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;

            if (!confirm('ต้องการลบ Instruction นี้หรือไม่?')) return;

            try {
                const res = await fetch(`/api/instructions-v2/${id}`, {
                    method: 'DELETE'
                });

                const data = await res.json();

                if (data.success) {
                    location.reload();
                } else {
                    alert(data.error || 'เกิดข้อผิดพลาด');
                }
            } catch (err) {
                console.error('Error deleting instruction:', err);
                alert('เกิดข้อผิดพลาด');
            }
        });
    });

    // Duplicate Instruction
    document.querySelectorAll('.duplicate-instruction').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const name = prompt('ชื่อ Instruction ใหม่:');

            if (!name) return;

            try {
                const res = await fetch(`/api/instructions-v2/${id}/duplicate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });

                const data = await res.json();

                if (data.success) {
                    location.reload();
                } else {
                    alert(data.error || 'เกิดข้อผิดพลาด');
                }
            } catch (err) {
                console.error('Error duplicating instruction:', err);
                alert('เกิดข้อผิดพลาด');
            }
        });
    });

    // Preview Instruction
    document.querySelectorAll('.preview-instruction').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;

            try {
                const res = await fetch(`/api/instructions-v2/${id}/preview`);
                const data = await res.json();

                if (data.success) {
                    document.getElementById('previewContent').textContent = data.preview || '(ว่างเปล่า)';
                    document.getElementById('previewDataItemCount').textContent = data.stats.dataItemCount;
                    document.getElementById('previewCharCount').textContent = data.stats.charCount;
                    document.getElementById('previewTokenCount').textContent = data.stats.tokenCount;
                    previewModal.show();
                } else {
                    alert(data.error || 'เกิดข้อผิดพลาด');
                }
            } catch (err) {
                console.error('Error previewing instruction:', err);
                alert('เกิดข้อผิดพลาด');
            }
        });
    });

    // Edit Data Item - Redirect to Full Page Editor
    document.querySelectorAll('.edit-data-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const instructionId = btn.dataset.instructionId;
            const itemId = btn.dataset.itemId;

            // Redirect to full page editor
            window.location.href = `/admin/instructions-v2/${instructionId}/data-items/${itemId}/edit`;
        });
    });

    // Delete Data Item
    document.querySelectorAll('.delete-data-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const instructionId = btn.dataset.instructionId;
            const itemId = btn.dataset.itemId;

            if (!confirm('ต้องการลบชุดข้อมูลนี้หรือไม่?')) return;

            try {
                const res = await fetch(`/api/instructions-v2/${instructionId}/data-items/${itemId}`, {
                    method: 'DELETE'
                });

                const data = await res.json();

                if (data.success) {
                    location.reload();
                } else {
                    alert(data.error || 'เกิดข้อผิดพลาด');
                }
            } catch (err) {
                console.error('Error deleting data item:', err);
                alert('เกิดข้อผิดพลาด');
            }
        });
    });

    // Duplicate Data Item
    document.querySelectorAll('.duplicate-data-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const instructionId = btn.dataset.instructionId;
            const itemId = btn.dataset.itemId;

            try {
                const res = await fetch(`/api/instructions-v2/${instructionId}/data-items/${itemId}/duplicate`, {
                    method: 'POST'
                });

                const data = await res.json();

                if (data.success) {
                    location.reload();
                } else {
                    alert(data.error || 'เกิดข้อผิดพลาด');
                }
            } catch (err) {
                console.error('Error duplicating data item:', err);
                alert('เกิดข้อผิดพลาด');
            }
        });
    });

    // Search Instructions
    const searchInput = document.getElementById('searchInstructions');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.instruction-card').forEach(card => {
                const name = card.querySelector('.instruction-title').textContent.toLowerCase();
                const desc = card.querySelector('.instruction-desc')?.textContent.toLowerCase() || '';
                card.style.display = (name.includes(query) || desc.includes(query)) ? '' : 'none';
            });
        });
    }

})();
