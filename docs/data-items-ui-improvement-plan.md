# 📋 แผนปรับปรุง Data-Items Table UI/UX

> เอกสารนี้แบ่งเป็น 2 แนวทาง: **ปรับปรุงจากของเดิม** และ **เขียนใหม่ทั้งหมด**  
> จัดทำเมื่อ: 2025-12-04

---

## 📊 สถานะปัจจุบัน (Current State)

### ✅ สิ่งที่มีอยู่แล้ว:
- ตารางแบบ Spreadsheet-like พร้อม Column labels (A, B, C...)
- Row numbers (1, 2, 3...)
- Sticky headers และ sticky row numbers
- การ Resize คอลัมน์และแถว (ลาก column-resizer / row-resizer)
- Keyboard shortcuts: Tab, Shift+Tab, Enter, Shift+Enter, Arrow keys, Ctrl+Z/Y, Ctrl+C/X/V
- Paste จาก Excel/Google Sheets
- Context menu (คลิกขวา)
- Undo/Redo system
- Cell flyout สำหรับข้อความยาว
- Copy to TSV
- Status bar แสดงจำนวนคอลัมน์/แถว

### ❌ ปัญหาและข้อจำกัด:
1. **UX ไม่คล่องตัว**: Navigation ด้วย Arrow keys ยังไม่สมบูรณ์ (ต้องอยู่ที่ขอบ cursor)
2. **Multi-cell selection**: ไม่รองรับการเลือกหลายเซลล์พร้อมกัน
3. **Inline edit mode**: ไม่มีโหมด "คลิกเลือก" vs "ดับเบิลคลิกแก้ไข"
4. **Context menu จำกัด**: ไม่มีเมนูสำหรับ Insert/Delete row/column
5. **Formula bar**: ไม่มี
6. **Cell formatting**: ไม่มี (bold, color, etc.)
7. **Drag-to-reorder**: ไม่มีการย้ายตำแหน่งแถว/คอลัมน์
8. **Find & Replace**: ไม่มี
9. **Mobile experience**: ยังไม่เหมาะกับมือถือ

---

# 🔧 แนวทางที่ 1: ปรับปรุงจากของเดิม (Incremental Improvement)

## ข้อดี:
- ✅ ใช้เวลาน้อยกว่า
- ✅ ไม่ต้องเรียนรู้ library ใหม่
- ✅ ความเสี่ยงต่ำ (code base เดิม)
- ✅ ประหยัดงบ (ไม่ต้องจ่าย license)

## ข้อเสีย:
- ❌ Feature ที่เพิ่มได้จำกัด
- ❌ อาจมี technical debt สะสม
- ❌ Performance อาจไม่ดีถ้าข้อมูลเยอะ

---

## 📝 รายการปรับปรุง

### Phase 1: Navigation & Selection (1-2 สัปดาห์)

#### 1.1 Arrow Keys Navigation ที่ดีขึ้น
```javascript
// ปัจจุบัน: ต้องอยู่ที่ขอบ cursor ก่อน
// ปรับปรุง: กด Arrow ได้เลย (แต่ยังอยู่ในเซลล์เดิมถ้ากำลังพิมพ์)

// เพิ่มโหมด "Selection Mode" vs "Edit Mode"
let editMode = false;

input.addEventListener('keydown', event => {
    if (!editMode) {
        // Selection mode: Arrow keys move between cells immediately
        if (event.key === 'ArrowUp/Down/Left/Right') {
            event.preventDefault();
            moveCursor(direction);
        }
        if (event.key === 'Enter' || event.key === 'F2') {
            editMode = true;
            // Allow typing
        }
    } else {
        // Edit mode: Arrow keys work normally in textarea
    }
});
```

#### 1.2 Multi-Cell Selection
```javascript
// เพิ่ม selection range
let selection = {
    startRow: null, startCol: null,
    endRow: null, endCol: null
};

// Shift + Click = Select range
// Ctrl + Click = Add to selection
// Drag = Select range

// UI: Highlight selected cells
.selected-cell {
    background: rgba(26, 115, 232, 0.1) !important;
    box-shadow: inset 0 0 0 1px #1a73e8;
}
```

#### 1.3 Select All Row/Column
```javascript
// Click on row number = Select entire row
// Click on column header (A, B, C) = Select entire column
// Click on corner cell = Select all
```

---

### Phase 2: Context Menu & Actions (1 สัปดาห์)

#### 2.1 Enhanced Context Menu
```html
<!-- Row Number Context Menu -->
<div class="context-menu" id="rowContextMenu">
    <div class="context-menu-item" data-action="insertRowAbove">
        <i class="fas fa-arrow-up"></i> แทรกแถวด้านบน
    </div>
    <div class="context-menu-item" data-action="insertRowBelow">
        <i class="fas fa-arrow-down"></i> แทรกแถวด้านล่าง
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="deleteRow">
        <i class="fas fa-trash"></i> ลบแถว
    </div>
    <div class="context-menu-item" data-action="clearRow">
        <i class="fas fa-eraser"></i> ล้างข้อมูลแถว
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="duplicateRow">
        <i class="fas fa-copy"></i> ทำซ้ำแถว
    </div>
</div>

<!-- Column Header Context Menu -->
<div class="context-menu" id="colContextMenu">
    <div class="context-menu-item" data-action="insertColLeft">
        <i class="fas fa-arrow-left"></i> แทรกคอลัมน์ซ้าย
    </div>
    <div class="context-menu-item" data-action="insertColRight">
        <i class="fas fa-arrow-right"></i> แทรกคอลัมน์ขวา
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="deleteCol">
        <i class="fas fa-trash"></i> ลบคอลัมน์
    </div>
    <div class="context-menu-item" data-action="clearCol">
        <i class="fas fa-eraser"></i> ล้างข้อมูลคอลัมน์
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="sortAZ">
        <i class="fas fa-sort-alpha-down"></i> เรียง A → Z
    </div>
    <div class="context-menu-item" data-action="sortZA">
        <i class="fas fa-sort-alpha-up"></i> เรียง Z → A
    </div>
</div>
```

---

### Phase 3: Formula Bar & Toolbar (1-2 สัปดาห์)

#### 3.1 Formula Bar
```html
<div class="formula-bar">
    <div class="cell-address-box">
        <input type="text" id="currentCellAddress" readonly placeholder="A1">
    </div>
    <div class="formula-input-wrapper">
        <textarea id="formulaBarInput" placeholder="คลิกเซลล์เพื่อแก้ไข"></textarea>
    </div>
</div>
```

```css
.formula-bar {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    background: #f8f9fa;
    border-bottom: 1px solid #e0e0e0;
}

.cell-address-box {
    width: 60px;
    flex-shrink: 0;
}

.cell-address-box input {
    width: 100%;
    text-align: center;
    font-weight: 600;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px;
}

.formula-input-wrapper {
    flex: 1;
}

.formula-input-wrapper textarea {
    width: 100%;
    min-height: 24px;
    resize: none;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px 8px;
}
```

#### 3.2 Enhanced Toolbar
```html
<div class="sheet-toolbar">
    <!-- Undo/Redo -->
    <div class="toolbar-group">
        <button id="undoBtn" title="Undo (Ctrl+Z)">
            <i class="fas fa-undo"></i>
        </button>
        <button id="redoBtn" title="Redo (Ctrl+Y)">
            <i class="fas fa-redo"></i>
        </button>
    </div>
    
    <div class="toolbar-divider"></div>
    
    <!-- Row/Column Actions -->
    <div class="toolbar-group">
        <button id="insertRowBtn" title="แทรกแถว">
            <i class="fas fa-plus"></i> แถว
        </button>
        <button id="insertColBtn" title="แทรกคอลัมน์">
            <i class="fas fa-plus"></i> คอลัมน์
        </button>
        <button id="deleteRowColBtn" title="ลบ">
            <i class="fas fa-minus"></i>
        </button>
    </div>
    
    <div class="toolbar-divider"></div>
    
    <!-- Find & Replace -->
    <div class="toolbar-group">
        <button id="findReplaceBtn" title="Find & Replace (Ctrl+H)">
            <i class="fas fa-search"></i>
        </button>
    </div>
    
    <div class="toolbar-spacer"></div>
    
    <!-- Status -->
    <div class="toolbar-status">
        <span id="tableStatsDisplay">0 คอลัมน์ × 0 แถว</span>
    </div>
</div>
```

---

### Phase 4: Find & Replace (1 สัปดาห์)

```html
<div id="findReplacePanel" class="find-replace-panel">
    <div class="find-replace-header">
        <h6>ค้นหาและแทนที่</h6>
        <button class="btn-close" id="closeFindReplace"></button>
    </div>
    <div class="find-replace-body">
        <div class="form-group">
            <input type="text" id="findInput" placeholder="ค้นหา...">
        </div>
        <div class="form-group">
            <input type="text" id="replaceInput" placeholder="แทนที่ด้วย...">
        </div>
        <div class="find-replace-options">
            <label>
                <input type="checkbox" id="matchCase"> Match case
            </label>
            <label>
                <input type="checkbox" id="matchWholeCell"> Whole cell
            </label>
        </div>
        <div class="find-replace-actions">
            <button id="findNextBtn" class="btn btn-secondary btn-sm">
                ค้นหาถัดไป
            </button>
            <button id="replaceBtn" class="btn btn-primary btn-sm">
                แทนที่
            </button>
            <button id="replaceAllBtn" class="btn btn-warning btn-sm">
                แทนที่ทั้งหมด
            </button>
        </div>
        <div class="find-replace-result">
            <span id="findResultCount">พบ 0 รายการ</span>
        </div>
    </div>
</div>
```

---

### Phase 5: Performance & Polish (1 สัปดาห์)

#### 5.1 Virtual Scrolling (สำหรับข้อมูลเยอะ)
```javascript
// ใช้ Intersection Observer สำหรับ lazy render
// Render เฉพาะ rows ที่เห็นในหน้าจอ + buffer

const BUFFER_ROWS = 10;
let visibleStart = 0;
let visibleEnd = 50;

const observer = new IntersectionObserver((entries) => {
    // Update visible range และ re-render
});
```

#### 5.2 Auto-save Draft
```javascript
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

setInterval(() => {
    const payload = instructionTableBuilder.getPayload();
    localStorage.setItem(`draft_${itemId}`, JSON.stringify({
        data: payload,
        timestamp: Date.now()
    }));
}, AUTOSAVE_INTERVAL);

// Show indicator
function showDraftSaved() {
    // "บันทึกร่างแล้ว" indicator
}
```

#### 5.3 Zebra Striping & Visual Improvements
```css
/* Zebra striping */
.table-builder-wrapper tbody tr:nth-child(even) td {
    background-color: #fafbfc;
}

/* Better focus state */
.table-cell-input:focus {
    box-shadow: inset 0 0 0 2.5px #1a73e8;
    background: #e8f0fe;
}

/* Row hover */
.table-builder-wrapper tbody tr:hover td {
    background-color: #f1f3f4;
}

/* Active cell pulse animation */
@keyframes cellPulse {
    0% { box-shadow: inset 0 0 0 2px #1a73e8; }
    50% { box-shadow: inset 0 0 0 3px #1a73e8; }
    100% { box-shadow: inset 0 0 0 2px #1a73e8; }
}

.is-active-cell {
    animation: cellPulse 2s infinite;
}
```

---

## ⏱️ Timeline รวม (ปรับปรุงจากของเดิม)

| Phase | ระยะเวลา | Priority |
|-------|----------|----------|
| Phase 1: Navigation & Selection | 1-2 สัปดาห์ | 🔴 สูงมาก |
| Phase 2: Context Menu | 1 สัปดาห์ | 🟠 สูง |
| Phase 3: Formula Bar & Toolbar | 1-2 สัปดาห์ | 🟡 ปานกลาง |
| Phase 4: Find & Replace | 1 สัปดาห์ | 🟡 ปานกลาง |
| Phase 5: Performance & Polish | 1 สัปดาห์ | 🟢 ต่ำ |

**รวม: 5-7 สัปดาห์**

---

# 🆕 แนวทางที่ 2: เขียนใหม่ทั้งหมด (Complete Rewrite)

## ข้อดี:
- ✅ ได้ Feature ครบถ้วนตั้งแต่แรก
- ✅ Performance ดีกว่า (libraries ออกแบบมาเพื่อ spreadsheet)
- ✅ Code ใหม่สะอาด ไม่มี legacy
- ✅ UX ดีมาก (ใกล้เคียง Google Sheets)
- ✅ Maintainable ง่ายกว่าในระยะยาว

## ข้อเสีย:
- ❌ ใช้เวลามากกว่า
- ❌ ต้องเรียนรู้ library ใหม่
- ❌ บาง library มีค่า license
- ❌ ความเสี่ยงในการ migrate

---

## 🛠️ เลือก Library

### Option A: **Handsontable** (แนะนำ ⭐)

**ข้อดี:**
- Feature ครบมาก (เหมือน Excel)
- รองรับ: Copy/Paste, Undo/Redo, Context Menu, Sorting, Filtering
- Virtual rendering (รองรับ 100,000+ rows)
- มี Community Edition (Free for non-commercial)

**ข้อเสีย:**
- Commercial license ประมาณ $590/year per developer
- เม่น ขนาดไฟล์ ~250KB gzipped

**ตัวอย่างการใช้งาน:**
```javascript
import Handsontable from 'handsontable';

const container = document.getElementById('hot-container');
const hot = new Handsontable(container, {
    data: initialData,
    colHeaders: true,
    rowHeaders: true,
    contextMenu: true,
    manualColumnResize: true,
    manualRowResize: true,
    copyPaste: true,
    undo: true,
    search: true,
    comments: true,
    licenseKey: 'non-commercial-and-evaluation'
});
```

---

### Option B: **jspreadsheet (Jexcel)** 

**ข้อดี:**
- Lightweight (~100KB)
- Free Community Edition
- ง่ายต่อการ customize
- ดี สำหรับโปรเจคขนาดเล็ก-กลาง

**ข้อเสีย:**
- Feature น้อยกว่า Handsontable
- ต้องเขียน custom code เพิ่มเยอะ

**ตัวอย่างการใช้งาน:**
```javascript
import jspreadsheet from 'jspreadsheet-ce';

const container = document.getElementById('spreadsheet');
jspreadsheet(container, {
    data: initialData,
    columns: [
        { type: 'text', title: 'Product', width: 200 },
        { type: 'text', title: 'Description', width: 300 },
        { type: 'numeric', title: 'Price', width: 100 }
    ],
    tableOverflow: true,
    tableWidth: '100%',
    tableHeight: '400px',
    search: true,
    pagination: 20
});
```

---

### Option C: **AG Grid Community** 

**ข้อดี:**
- Performance ดีมาก
- ใช้แพร่หลายในโปรเจคใหญ่
- Community Edition ฟรี

**ข้อเสีย:**
- เน้น Data Grid มากกว่า Spreadsheet
- UI อาจไม่ "spreadsheet-like" เท่า

---

### 📊 เปรียบเทียบ Libraries

| คุณสมบัติ | Handsontable | Jspreadsheet | AG Grid |
|-----------|--------------|--------------|---------|
| Spreadsheet UX | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Performance | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Free License | ❌ (Eval only) | ✅ | ✅ (Community) |
| Learning Curve | ปานกลาง | ง่าย | ยาก |
| Bundle Size | 250KB | 100KB | 300KB |
| Thai Support | ✅ | ✅ | ✅ |

---

## 🏗️ โครงสร้างใหม่ (ใช้ Handsontable เป็นตัวอย่าง)

### File Structure
```
views/
├── edit-data-item-v3.ejs        # หน้าหลัก
public/
├── css/
│   └── spreadsheet-editor.css   # Styles เฉพาะ
├── js/
│   └── spreadsheet-editor.js    # Logic หลัก
│   └── spreadsheet-plugins/
│       ├── autosave.js          # Auto-save plugin
│       ├── validation.js        # Data validation
│       └── export.js            # Export features
```

### Main Page Structure
```html
<!DOCTYPE html>
<html lang="th">
<head>
    <title>แก้ไขชุดข้อมูล</title>
    <link href="https://cdn.jsdelivr.net/npm/handsontable/dist/handsontable.full.min.css" rel="stylesheet">
    <link href="/css/spreadsheet-editor.css" rel="stylesheet">
</head>
<body>
    <!-- Header -->
    <header class="editor-header">
        <div class="header-left">
            <button class="btn-back" onclick="history.back()">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="document-info">
                <input type="text" id="documentTitle" value="ชื่อชุดข้อมูล" class="title-input">
                <span class="save-status" id="saveStatus">บันทึกแล้ว</span>
            </div>
        </div>
        <div class="header-right">
            <button id="shareBtn" class="btn btn-outline">
                <i class="fas fa-share"></i> แชร์
            </button>
            <button id="saveBtn" class="btn btn-primary">
                <i class="fas fa-save"></i> บันทึก
            </button>
        </div>
    </header>

    <!-- Toolbar -->
    <div class="editor-toolbar">
        <div class="toolbar-section">
            <button id="undoBtn" class="toolbar-btn" title="Undo">
                <i class="fas fa-undo"></i>
            </button>
            <button id="redoBtn" class="toolbar-btn" title="Redo">
                <i class="fas fa-redo"></i>
            </button>
        </div>
        
        <div class="toolbar-divider"></div>
        
        <div class="toolbar-section">
            <button id="boldBtn" class="toolbar-btn" title="Bold">
                <i class="fas fa-bold"></i>
            </button>
            <button id="italicBtn" class="toolbar-btn" title="Italic">
                <i class="fas fa-italic"></i>
            </button>
        </div>
        
        <div class="toolbar-divider"></div>
        
        <div class="toolbar-section">
            <select id="fontSizeSelect" class="toolbar-select">
                <option value="10">10</option>
                <option value="11" selected>11</option>
                <option value="12">12</option>
                <option value="14">14</option>
                <option value="16">16</option>
            </select>
        </div>
        
        <div class="toolbar-divider"></div>
        
        <div class="toolbar-section">
            <button id="alignLeftBtn" class="toolbar-btn" title="Align Left">
                <i class="fas fa-align-left"></i>
            </button>
            <button id="alignCenterBtn" class="toolbar-btn" title="Align Center">
                <i class="fas fa-align-center"></i>
            </button>
            <button id="alignRightBtn" class="toolbar-btn" title="Align Right">
                <i class="fas fa-align-right"></i>
            </button>
        </div>
        
        <div class="toolbar-spacer"></div>
        
        <div class="toolbar-section">
            <button id="findBtn" class="toolbar-btn" title="Find & Replace">
                <i class="fas fa-search"></i>
            </button>
            <button id="filterBtn" class="toolbar-btn" title="Filter">
                <i class="fas fa-filter"></i>
            </button>
        </div>
    </div>

    <!-- Formula Bar -->
    <div class="formula-bar">
        <div class="cell-reference">
            <input type="text" id="cellReference" value="A1" readonly>
        </div>
        <div class="formula-icon">
            <i class="fas fa-function"></i>
        </div>
        <div class="formula-input">
            <textarea id="formulaInput" placeholder="กรอกข้อมูล หรือ สูตร"></textarea>
        </div>
    </div>

    <!-- Spreadsheet Container -->
    <div id="spreadsheet-container" class="spreadsheet-container"></div>

    <!-- Status Bar -->
    <footer class="editor-statusbar">
        <div class="status-left">
            <span id="sheetTabs">
                <!-- Sheet tabs if needed -->
            </span>
        </div>
        <div class="status-center">
            <span id="cellStats">เซลล์ที่เลือก: A1</span>
        </div>
        <div class="status-right">
            <span id="rowColCount">50 แถว × 10 คอลัมน์</span>
            <span class="zoom-controls">
                <button id="zoomOutBtn">-</button>
                <span id="zoomLevel">100%</span>
                <button id="zoomInBtn">+</button>
            </span>
        </div>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/handsontable/dist/handsontable.full.min.js"></script>
    <script src="/js/spreadsheet-editor.js"></script>
</body>
</html>
```

---

### Main JavaScript
```javascript
// spreadsheet-editor.js

class SpreadsheetEditor {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.itemId = options.itemId;
        this.initialData = options.initialData || [];
        this.columns = options.columns || [];
        this.hot = null;
        this.isDirty = false;
        this.autosaveTimer = null;
        
        this.init();
    }
    
    init() {
        this.createTable();
        this.bindEvents();
        this.setupAutosave();
        this.updateUI();
    }
    
    createTable() {
        const defaultColumns = this.columns.length 
            ? this.columns.map(c => ({ data: c, title: c }))
            : [
                { data: 'col1', title: 'คอลัมน์ 1' },
                { data: 'col2', title: 'คอลัมน์ 2' }
              ];
        
        this.hot = new Handsontable(this.container, {
            data: this.initialData.length ? this.initialData : [{}],
            columns: defaultColumns,
            colHeaders: true,
            rowHeaders: true,
            
            // Features
            contextMenu: true,
            comments: true,
            dropdownMenu: true,
            filters: true,
            manualColumnMove: true,
            manualRowMove: true,
            manualColumnResize: true,
            manualRowResize: true,
            
            // Clipboard
            copyPaste: true,
            
            // Undo/Redo
            undo: true,
            
            // Search
            search: true,
            
            // Validation & Formatting
            cells(row, col) {
                return {};
            },
            
            // Sizing
            stretchH: 'all',
            autoColumnSize: true,
            autoRowSize: true,
            
            // Viewport
            width: '100%',
            height: 'calc(100vh - 200px)',
            
            // Language
            language: 'th-TH',
            
            // License
            licenseKey: 'non-commercial-and-evaluation',
            
            // Callbacks
            afterChange: (changes, source) => {
                if (source !== 'loadData') {
                    this.isDirty = true;
                    this.updateSaveStatus('มีการเปลี่ยนแปลง');
                }
            },
            
            afterSelection: (row, col, row2, col2) => {
                this.updateCellReference(row, col);
                this.updateFormulaBar(row, col);
            },
            
            afterUndo: () => {
                this.updateUI();
            },
            
            afterRedo: () => {
                this.updateUI();
            }
        });
    }
    
    bindEvents() {
        // Undo/Redo buttons
        document.getElementById('undoBtn')?.addEventListener('click', () => {
            this.hot.undo();
        });
        
        document.getElementById('redoBtn')?.addEventListener('click', () => {
            this.hot.redo();
        });
        
        // Save button
        document.getElementById('saveBtn')?.addEventListener('click', () => {
            this.save();
        });
        
        // Formula bar sync
        document.getElementById('formulaInput')?.addEventListener('input', (e) => {
            const selected = this.hot.getSelected();
            if (selected && selected[0]) {
                const [row, col] = selected[0];
                this.hot.setDataAtCell(row, col, e.target.value);
            }
        });
        
        // Find & Replace
        document.getElementById('findBtn')?.addEventListener('click', () => {
            this.showFindDialog();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.save();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.showFindDialog();
            }
        });
    }
    
    setupAutosave() {
        this.autosaveTimer = setInterval(() => {
            if (this.isDirty) {
                this.saveDraft();
            }
        }, 30000); // Every 30 seconds
    }
    
    updateCellReference(row, col) {
        const colLabel = this.getColumnLabel(col);
        const ref = `${colLabel}${row + 1}`;
        const refInput = document.getElementById('cellReference');
        if (refInput) refInput.value = ref;
    }
    
    updateFormulaBar(row, col) {
        const value = this.hot.getDataAtCell(row, col) || '';
        const formulaInput = document.getElementById('formulaInput');
        if (formulaInput) formulaInput.value = value;
    }
    
    getColumnLabel(index) {
        let label = '';
        let num = index;
        while (num >= 0) {
            label = String.fromCharCode(65 + (num % 26)) + label;
            num = Math.floor(num / 26) - 1;
        }
        return label;
    }
    
    updateSaveStatus(status) {
        const statusEl = document.getElementById('saveStatus');
        if (statusEl) statusEl.textContent = status;
    }
    
    updateUI() {
        // Update row/col count
        const rowCount = this.hot.countRows();
        const colCount = this.hot.countCols();
        const countEl = document.getElementById('rowColCount');
        if (countEl) countEl.textContent = `${rowCount} แถว × ${colCount} คอลัมน์`;
        
        // Update undo/redo button states
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.disabled = !this.hot.isUndoAvailable();
        if (redoBtn) redoBtn.disabled = !this.hot.isRedoAvailable();
    }
    
    getPayload() {
        const data = this.hot.getData();
        const headers = this.hot.getColHeader();
        
        return {
            columns: headers,
            rows: data.filter(row => row.some(cell => cell !== null && cell !== ''))
        };
    }
    
    async save() {
        try {
            this.updateSaveStatus('กำลังบันทึก...');
            
            const payload = this.getPayload();
            
            const response = await fetch(`/admin/instructions-v2/${this.itemId}/data-items/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                this.isDirty = false;
                this.updateSaveStatus('บันทึกแล้ว');
                this.showNotification('บันทึกข้อมูลเรียบร้อย', 'success');
            } else {
                throw new Error('Save failed');
            }
        } catch (error) {
            console.error('Save error:', error);
            this.updateSaveStatus('เกิดข้อผิดพลาด');
            this.showNotification('ไม่สามารถบันทึกได้', 'error');
        }
    }
    
    saveDraft() {
        const payload = this.getPayload();
        localStorage.setItem(`draft_${this.itemId}`, JSON.stringify({
            data: payload,
            timestamp: Date.now()
        }));
        this.updateSaveStatus('บันทึกร่างแล้ว');
    }
    
    showFindDialog() {
        // Implement find/replace dialog
        const search = this.hot.getPlugin('search');
        const query = prompt('ค้นหา:');
        if (query) {
            const results = search.query(query);
            console.log(`Found ${results.length} matches`);
        }
    }
    
    showNotification(message, type = 'info') {
        // Toast notification
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    destroy() {
        if (this.autosaveTimer) {
            clearInterval(this.autosaveTimer);
        }
        if (this.hot) {
            this.hot.destroy();
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.spreadsheet = new SpreadsheetEditor('spreadsheet-container', {
        itemId: '<%= itemId %>',
        initialData: <%- JSON.stringify(instruction.data?.rows || []) %>,
        columns: <%- JSON.stringify(instruction.data?.columns || []) %>
    });
});
```

---

## 🎨 CSS สำหรับ UI ใหม่
```css
/* spreadsheet-editor.css */

:root {
    --header-height: 56px;
    --toolbar-height: 40px;
    --formula-bar-height: 32px;
    --statusbar-height: 24px;
    --primary-color: #1a73e8;
    --border-color: #e0e0e0;
    --bg-light: #f8f9fa;
}

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
}

/* Header */
.editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: var(--header-height);
    padding: 0 16px;
    background: #fff;
    border-bottom: 1px solid var(--border-color);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 16px;
}

.btn-back {
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

.btn-back:hover {
    background: var(--bg-light);
}

.document-info {
    display: flex;
    flex-direction: column;
}

.title-input {
    border: none;
    font-size: 18px;
    font-weight: 500;
    padding: 4px 8px;
    margin: -4px -8px;
    border-radius: 4px;
}

.title-input:hover {
    background: var(--bg-light);
}

.title-input:focus {
    outline: none;
    background: var(--bg-light);
}

.save-status {
    font-size: 12px;
    color: #5f6368;
}

.header-right {
    display: flex;
    gap: 8px;
}

/* Toolbar */
.editor-toolbar {
    display: flex;
    align-items: center;
    height: var(--toolbar-height);
    padding: 0 8px;
    background: #fff;
    border-bottom: 1px solid var(--border-color);
    gap: 4px;
}

.toolbar-section {
    display: flex;
    gap: 2px;
}

.toolbar-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #5f6368;
    transition: background 0.15s;
}

.toolbar-btn:hover {
    background: var(--bg-light);
}

.toolbar-btn:active {
    background: #e8e8e8;
}

.toolbar-btn.active {
    background: #e8f0fe;
    color: var(--primary-color);
}

.toolbar-divider {
    width: 1px;
    height: 24px;
    background: var(--border-color);
    margin: 0 8px;
}

.toolbar-spacer {
    flex: 1;
}

.toolbar-select {
    height: 28px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0 8px;
    font-size: 13px;
}

/* Formula Bar */
.formula-bar {
    display: flex;
    align-items: center;
    height: var(--formula-bar-height);
    background: #fff;
    border-bottom: 1px solid var(--border-color);
    padding: 0 8px;
    gap: 8px;
}

.cell-reference {
    width: 60px;
}

.cell-reference input {
    width: 100%;
    height: 24px;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
}

.formula-icon {
    color: #5f6368;
    font-size: 14px;
}

.formula-input {
    flex: 1;
}

.formula-input textarea {
    width: 100%;
    height: 24px;
    border: none;
    resize: none;
    font-size: 13px;
    line-height: 24px;
    padding: 0 4px;
}

.formula-input textarea:focus {
    outline: none;
}

/* Spreadsheet Container */
.spreadsheet-container {
    height: calc(100vh - var(--header-height) - var(--toolbar-height) - var(--formula-bar-height) - var(--statusbar-height));
    overflow: hidden;
}

/* Status Bar */
.editor-statusbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: var(--statusbar-height);
    background: #f1f3f4;
    border-top: 1px solid var(--border-color);
    padding: 0 12px;
    font-size: 11px;
    color: #5f6368;
}

.zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
}

.zoom-controls button {
    width: 20px;
    height: 20px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 2px;
}

.zoom-controls button:hover {
    background: #e0e0e0;
}

/* Buttons */
.btn {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
}

.btn-primary {
    background: var(--primary-color);
    color: #fff;
}

.btn-primary:hover {
    background: #1557b0;
}

.btn-outline {
    background: #fff;
    border: 1px solid var(--border-color);
    color: #5f6368;
}

.btn-outline:hover {
    background: var(--bg-light);
}

/* Toast Notifications */
.toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: #323232;
    color: #fff;
    border-radius: 4px;
    font-size: 14px;
    z-index: 9999;
    animation: slideUp 0.3s ease;
}

.toast-success {
    background: #0f9d58;
}

.toast-error {
    background: #db4437;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
}

.toast.fade-out {
    opacity: 0;
    transition: opacity 0.3s;
}

/* Handsontable Overrides */
.handsontable {
    font-family: inherit !important;
}

.handsontable th {
    background: #f8f9fa !important;
    font-weight: 500 !important;
}

.handsontable td {
    border-color: #e0e0e0 !important;
}

.handsontable td.current,
.handsontable th.current {
    background: #e8f0fe !important;
}

/* Responsive */
@media (max-width: 768px) {
    .header-right .btn span {
        display: none;
    }
    
    .toolbar-section:not(:first-child):not(:last-child) {
        display: none;
    }
}
```

---

## ⏱️ Timeline (เขียนใหม่ทั้งหมด)

| Phase | ระยะเวลา | งาน |
|-------|----------|-----|
| Phase 1: Setup & Core | 1 สัปดาห์ | ติดตั้ง library, สร้าง basic table |
| Phase 2: Toolbar & UI | 1 สัปดาห์ | Toolbar, Formula bar, Status bar |
| Phase 3: Data Integration | 1 สัปดาห์ | Load/Save data, API integration |
| Phase 4: Features | 1-2 สัปดาห์ | Find/Replace, Export, Auto-save |
| Phase 5: Testing & Polish | 1 สัปดาห์ | Bug fixes, Performance, Mobile |

**รวม: 5-6 สัปดาห์**

---

# 📊 สรุปเปรียบเทียบ

| หัวข้อ | ปรับปรุงของเดิม | เขียนใหม่ |
|--------|-----------------|-----------|
| **ระยะเวลา** | 5-7 สัปดาห์ | 5-6 สัปดาห์ |
| **ความเสี่ยง** | ต่ำ | ปานกลาง |
| **ค่าใช้จ่าย** | ฟรี | อาจมี license |
| **Feature ที่ได้** | 60-70% ของ Sheets | 80-90% ของ Sheets |
| **Performance** | ปานกลาง | ดีมาก |
| **Maintainability** | ปานกลาง | ดี |
| **UX Quality** | ดี | ดีมาก |

---

## 💡 คำแนะนำ

### เลือก **ปรับปรุงของเดิม** ถ้า:
- งบประมาณจำกัด
- ไม่ต้องการเปลี่ยนแปลงมาก
- จำนวนข้อมูลไม่เกิน 1,000 แถว
- มีเวลาจำกัด

### เลือก **เขียนใหม่** ถ้า:
- ต้องการ UX ที่ดีที่สุด
- ข้อมูลมีจำนวนมาก (หลายพันแถว)
- ต้องการ features เช่น filtering, sorting, formulas
- มีงบสำหรับ license (ถ้าใช้ Handsontable Pro)
- ต้องการ maintainability ในระยะยาว

---

## ✅ ขั้นตอนถัดไป

1. **ตัดสินใจเลือกแนวทาง** (ปรับปรุง vs เขียนใหม่)
2. **ถ้าเลือกเขียนใหม่** → เลือก library (Handsontable / Jspreadsheet / AG Grid)
3. **วางแผน sprint** ตาม phase ที่กำหนด
4. **สร้าง prototype** ให้ทดสอบก่อน production

---

> 💬 **ติดต่อสอบถามเพิ่มเติม**: หากต้องการความช่วยเหลือในการ implement สามารถแจ้งได้เลยครับ!
