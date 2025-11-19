// Admin Dashboard V2 - Instruction Management
(function() {
    'use strict';

    // Modals
    const instructionModal = new bootstrap.Modal(document.getElementById('instructionModal'));
    const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));

    // ===== Inline Instruction Editor =====
    const instructionSelect = document.getElementById('instructionSelect');
    const instructionEditorName = document.getElementById('instructionEditorName');
    const instructionEditorDescription = document.getElementById('instructionEditorDescription');
    const instructionEditorStatus = document.getElementById('instructionEditorStatus');
    const instructionEditorFields = document.getElementById('instructionEditorFields');
    const instructionEditorEmptyState = document.getElementById('instructionEditorEmptyState');
    const instructionEditorLoading = document.getElementById('instructionEditorLoading');
    const instructionEditorUpdatedAt = document.getElementById('instructionEditorUpdatedAt');
    const instructionDirtyAlert = document.getElementById('instructionDirtyAlert');
    const saveInstructionChangesBtn = document.getElementById('saveInstructionChangesBtn');
    const instructionCardsWrapper = document.getElementById('instructionCardsWrapper');
    const instructionCardsEmptyState = document.getElementById('instructionCardsEmptyState');
    const instructionCards = Array.from(document.querySelectorAll('.instruction-card'));

    const editorState = {
        currentInstructionId: '',
        initialData: null,
        isDirty: false,
    };

    const setEditorStatus = (message, isActive = false) => {
        if (!instructionEditorStatus) return;
        instructionEditorStatus.textContent = message;
        instructionEditorStatus.classList.toggle('active', !!isActive);
    };

    const setEditorLoading = (isLoading) => {
        if (!instructionEditorLoading) return;
        instructionEditorLoading.classList.toggle('d-none', !isLoading);
    };

    const toggleEditorFields = (visible) => {
        if (instructionEditorFields) {
            instructionEditorFields.classList.toggle('d-none', !visible);
        }
        if (instructionEditorEmptyState) {
            instructionEditorEmptyState.classList.toggle('d-none', visible);
        }
    };

    const applyInstructionCardFilter = (instructionId) => {
        if (!instructionCardsWrapper || !instructionCardsEmptyState || instructionCards.length === 0) return;
        if (!instructionId) {
            instructionCardsWrapper.classList.add('d-none');
            instructionCardsEmptyState.classList.remove('d-none');
            instructionCards.forEach(card => card.classList.add('d-none'));
            return;
        }
        instructionCardsWrapper.classList.remove('d-none');
        instructionCardsEmptyState.classList.add('d-none');
        instructionCards.forEach(card => {
            const matches = card.dataset.id === instructionId;
            card.classList.toggle('d-none', !matches);
        });
    };

    const clearEditor = () => {
        editorState.currentInstructionId = '';
        editorState.initialData = null;
        editorState.isDirty = false;
        if (instructionSelect) {
            instructionSelect.value = '';
        }
        if (instructionEditorName) instructionEditorName.value = '';
        if (instructionEditorDescription) instructionEditorDescription.value = '';
        if (instructionEditorUpdatedAt) instructionEditorUpdatedAt.textContent = '';
        if (instructionDirtyAlert) instructionDirtyAlert.classList.add('d-none');
        if (saveInstructionChangesBtn) saveInstructionChangesBtn.disabled = true;
        toggleEditorFields(false);
        setEditorStatus('ยังไม่ได้เลือก Instruction', false);
        applyInstructionCardFilter('');
    };

    const hasEditorChanges = () => {
        if (!editorState.initialData) return false;
        const currentName = (instructionEditorName?.value || '').trim();
        const currentDescription = (instructionEditorDescription?.value || '').trim();
        return (
            currentName !== (editorState.initialData.name || '') ||
            currentDescription !== (editorState.initialData.description || '')
        );
    };

    const refreshDirtyState = () => {
        const dirty = hasEditorChanges();
        editorState.isDirty = dirty;
        if (instructionDirtyAlert) {
            instructionDirtyAlert.classList.toggle('d-none', !dirty);
        }
        if (saveInstructionChangesBtn) {
            saveInstructionChangesBtn.disabled = !dirty;
        }
        if (editorState.currentInstructionId) {
            setEditorStatus(
                dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'ข้อมูลล่าสุดบันทึกแล้ว',
                dirty
            );
        } else {
            setEditorStatus('ยังไม่ได้เลือก Instruction', false);
        }
    };

    const formatUpdatedAtText = (value) => {
        if (!instructionEditorUpdatedAt) return;
        if (!value) {
            instructionEditorUpdatedAt.textContent = '';
            return;
        }
        const updatedAt = new Date(value);
        if (Number.isNaN(updatedAt.getTime())) {
            instructionEditorUpdatedAt.textContent = '';
            return;
        }
        instructionEditorUpdatedAt.textContent = `อัปเดตล่าสุด: ${updatedAt.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}`;
    };

    let editorRequestToken = 0;

    clearEditor();

    const loadInstructionIntoEditor = async (instructionId) => {
        if (!instructionId) {
            clearEditor();
            return;
        }
        editorState.currentInstructionId = instructionId;
        editorState.initialData = null;
        editorState.isDirty = false;
        if (instructionDirtyAlert) instructionDirtyAlert.classList.add('d-none');
        if (saveInstructionChangesBtn) saveInstructionChangesBtn.disabled = true;
        toggleEditorFields(false);
        setEditorStatus('กำลังโหลดข้อมูล...', true);
        setEditorLoading(true);

        const requestId = ++editorRequestToken;

        try {
            const res = await fetch(`/api/instructions-v2/${instructionId}`);
            const data = await res.json();

            if (requestId !== editorRequestToken) {
                return;
            }

            if (data.success) {
                const { instruction } = data;
                editorState.initialData = {
                    name: instruction.name || '',
                    description: instruction.description || ''
                };
                if (instructionEditorName) {
                    instructionEditorName.value = editorState.initialData.name;
                }
                if (instructionEditorDescription) {
                    instructionEditorDescription.value = editorState.initialData.description;
                }
                formatUpdatedAtText(instruction.updatedAt || instruction.createdAt);
                toggleEditorFields(true);
                applyInstructionCardFilter(instructionId);
                setEditorStatus('ข้อมูลล่าสุดบันทึกแล้ว', false);
                editorState.isDirty = false;
                if (instructionDirtyAlert) instructionDirtyAlert.classList.add('d-none');
                if (saveInstructionChangesBtn) saveInstructionChangesBtn.disabled = true;
            } else {
                alert(data.error || 'ไม่สามารถโหลดข้อมูล Instruction ได้');
                clearEditor();
            }
        } catch (error) {
            console.error('Error loading instruction:', error);
            alert('เกิดข้อผิดพลาดในการโหลด Instruction');
            clearEditor();
        } finally {
            setEditorLoading(false);
        }
    };

    if (instructionSelect && instructionEditorName && instructionEditorDescription) {
        instructionSelect.addEventListener('change', () => {
            const selectedId = instructionSelect.value;
            if (
                editorState.isDirty &&
                selectedId !== editorState.currentInstructionId &&
                !confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการละทิ้งการเปลี่ยนแปลงหรือไม่?')
            ) {
                instructionSelect.value = editorState.currentInstructionId || '';
                return;
            }
            loadInstructionIntoEditor(selectedId);
        });

        [instructionEditorName, instructionEditorDescription].forEach((input) => {
            input.addEventListener('input', () => refreshDirtyState());
        });

        if (saveInstructionChangesBtn) {
            saveInstructionChangesBtn.addEventListener('click', async () => {
                if (!editorState.currentInstructionId) {
                    alert('กรุณาเลือก Instruction ที่ต้องการบันทึก');
                    return;
                }
                const name = instructionEditorName.value.trim();
                const description = instructionEditorDescription.value.trim();
                if (!name) {
                    alert('กรุณาระบุชื่อ Instruction');
                    return;
                }
                saveInstructionChangesBtn.disabled = true;
                saveInstructionChangesBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...';
                try {
                    const res = await fetch(`/api/instructions-v2/${editorState.currentInstructionId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, description })
                    });
                    const data = await res.json();
                    if (data.success) {
                        editorState.initialData = { name, description };
                        editorState.isDirty = false;
                        if (instructionDirtyAlert) instructionDirtyAlert.classList.add('d-none');
                        setEditorStatus('บันทึกเรียบร้อยแล้ว', false);
                        setTimeout(() => {
                            if (!editorState.isDirty) {
                                setEditorStatus('ข้อมูลล่าสุดบันทึกแล้ว', false);
                            }
                        }, 3000);
                        formatUpdatedAtText(new Date());
                        // Update card title/description
                        const card = document.querySelector(`.instruction-card[data-id="${editorState.currentInstructionId}"]`);
                        if (card) {
                            const titleEl = card.querySelector('.instruction-title');
                            if (titleEl) {
                                titleEl.textContent = name || 'ไม่มีชื่อ';
                            }
                            let descEl = card.querySelector('.instruction-desc');
                            if (description) {
                                if (!descEl) {
                                    const header = card.querySelector('.instruction-header .flex-grow-1');
                                    if (header) {
                                        descEl = document.createElement('p');
                                        descEl.className = 'instruction-desc';
                                        header.appendChild(descEl);
                                    }
                                }
                                if (descEl) descEl.textContent = description;
                            } else if (descEl) {
                                descEl.remove();
                            }
                        }
                        // Update select option text
                        const option = instructionSelect.querySelector(`option[value="${editorState.currentInstructionId}"]`);
                        if (option) {
                            option.textContent = name || 'ไม่มีชื่อ';
                        }
                    } else {
                        alert(data.error || 'ไม่สามารถบันทึก Instruction ได้');
                    }
                } catch (error) {
                    console.error('Error saving instruction:', error);
                    alert('เกิดข้อผิดพลาดในการบันทึก Instruction');
                } finally {
                    refreshDirtyState();
                    saveInstructionChangesBtn.innerHTML = '<i class="fas fa-save me-1"></i> บันทึกการแก้ไข';
                }
            });
        }

        window.addEventListener('beforeunload', (event) => {
            if (editorState.isDirty) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
    }

    // ===== Existing Modals / Actions =====

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

    // Add Data Item
    document.querySelectorAll('.add-data-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const instructionId = btn.dataset.instructionId;
            if (!instructionId) {
                return;
            }
            window.location.href = `/admin/instructions-v2/${instructionId}/data-items/new`;
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

    // ===== Data Item Reordering =====
    const getSiblingDataItem = (itemElement, direction) => {
        let sibling = direction === 'up'
            ? itemElement.previousElementSibling
            : itemElement.nextElementSibling;
        while (sibling && !sibling.classList.contains('data-item')) {
            sibling = direction === 'up'
                ? sibling.previousElementSibling
                : sibling.nextElementSibling;
        }
        return sibling;
    };

    const updateDataItemOrderUI = (container) => {
        const orderSpans = container.querySelectorAll('.data-item-order');
        orderSpans.forEach((span, idx) => {
            span.textContent = `${idx + 1}.`;
        });
    };

    const applyDataItemOrder = (container, itemIds) => {
        const addButton = container.querySelector('.add-data-item');
        const map = {};
        container.querySelectorAll('.data-item').forEach(item => {
            map[item.dataset.itemId] = item;
        });
        itemIds.forEach(id => {
            const element = map[id];
            if (!element) return;
            if (addButton) {
                container.insertBefore(element, addButton);
            } else {
                container.appendChild(element);
            }
        });
    };

    const setInstructionReorderLoading = (instructionId, isLoading) => {
        document.querySelectorAll(`.move-data-item[data-instruction-id="${instructionId}"]`)
            .forEach(btn => {
                btn.disabled = isLoading;
            });
    };

    const persistDataItemOrder = async (instructionId, itemIds, container, fallbackOrder) => {
        setInstructionReorderLoading(instructionId, true);
        try {
            const res = await fetch(`/api/instructions-v2/${instructionId}/data-items/reorder`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemIds })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'ไม่สามารถสลับลำดับได้');
            }
            return true;
        } catch (err) {
            console.error('Error reordering data items:', err);
            alert(err.message || 'ไม่สามารถสลับลำดับได้');
            if (Array.isArray(fallbackOrder) && fallbackOrder.length > 0) {
                applyDataItemOrder(container, fallbackOrder);
                updateDataItemOrderUI(container);
            }
            return false;
        } finally {
            setInstructionReorderLoading(instructionId, false);
        }
    };

    const initDataItemReorderControls = () => {
        document.querySelectorAll('.move-data-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const direction = btn.dataset.direction;
                const instructionId = btn.dataset.instructionId;
                const itemElement = btn.closest('.data-item');
                const container = btn.closest('.data-items-container');

                if (!direction || !instructionId || !itemElement || !container) return;

                const target = getSiblingDataItem(itemElement, direction);
                if (!target) return;

                const previousOrder = Array.from(container.querySelectorAll('.data-item'))
                    .map(item => item.dataset.itemId);

                if (direction === 'up') {
                    container.insertBefore(itemElement, target);
                } else {
                    container.insertBefore(itemElement, target.nextElementSibling);
                }

                updateDataItemOrderUI(container);

                const newOrder = Array.from(container.querySelectorAll('.data-item'))
                    .map(item => item.dataset.itemId);

                await persistDataItemOrder(instructionId, newOrder, container, previousOrder);
                updateDataItemOrderUI(container);
            });
        });
    };

    initDataItemReorderControls();

    // Export Button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            window.location.href = '/api/instructions-v2/export';
        });
    }

    // Import Button
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });

        importFile.addEventListener('change', async (e) => {
            if (e.target.files.length === 0) return;
            
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('file', file);
            
            // Disable buttons
            importBtn.disabled = true;
            importBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Importing...';
            
            try {
                const res = await fetch('/api/instructions-v2/import', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await res.json();
                
                if (data.success) {
                    alert(data.message || 'นำเข้าข้อมูลเรียบร้อยแล้ว');
                    location.reload();
                } else {
                    alert(data.error || 'เกิดข้อผิดพลาดในการนำเข้า');
                }
            } catch (err) {
                console.error('Error importing file:', err);
                alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์');
            } finally {
                importBtn.disabled = false;
                importBtn.innerHTML = '<i class="fas fa-file-import me-1"></i> Import';
                importFile.value = ''; // Reset file input
            }
        });
    }

})();
