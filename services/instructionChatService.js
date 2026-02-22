/**
 * Instruction Chat Service
 * Tool executor for AI Agent — granular read/write operations on instructions
 */

const { ObjectId } = require("mongodb");
const InstructionRAGService = require("./instructionRAGService");

class InstructionChatService {
    constructor(db, openaiClient) {
        this.db = db;
        this.openai = openaiClient || null;
        this.collection = db.collection("instructions_v2");
        this.changelogCollection = db.collection("instruction_chat_changelog");
        this.rag = new InstructionRAGService(this.openai);
        this._cachedInstruction = null;
        this._cachedId = null;
    }

    async _getInstruction(instructionId) {
        if (this._cachedId === instructionId && this._cachedInstruction) {
            return this._cachedInstruction;
        }
        const inst = await this.collection.findOne({ _id: new ObjectId(instructionId) });
        if (inst) {
            this._cachedInstruction = inst;
            this._cachedId = instructionId;
        }
        return inst;
    }

    _invalidateCache() {
        this._cachedInstruction = null;
        this._cachedId = null;
    }

    _getDataItem(instruction, itemId) {
        if (!instruction || !Array.isArray(instruction.dataItems)) return null;
        return instruction.dataItems.find(i => i.itemId === itemId) || null;
    }

    /**
     * Build the data items summary for system prompt injection
     */
    buildDataItemsSummary(instruction) {
        if (!instruction || !Array.isArray(instruction.dataItems)) return "ไม่มีชุดข้อมูล";
        return instruction.dataItems.map(item => {
            if (item.type === "table" && item.data) {
                const cols = Array.isArray(item.data.columns) ? item.data.columns : [];
                const rowCount = Array.isArray(item.data.rows) ? item.data.rows.length : 0;
                return `- **${item.title || "ไม่มีชื่อ"}** (ID: ${item.itemId}, ประเภท: table)\n  ตาราง ${rowCount} แถว | คอลัมน์: ${cols.join(", ")}`;
            } else if (item.type === "text") {
                const charCount = (item.content || "").length;
                return `- **${item.title || "ไม่มีชื่อ"}** (ID: ${item.itemId}, ประเภท: text)\n  ข้อความ ${charCount} ตัวอักษร`;
            }
            return `- **${item.title || "ไม่มีชื่อ"}** (ID: ${item.itemId}, ประเภท: ${item.type || "unknown"})`;
        }).join("\n");
    }

    // ──────────────────────────── READ TOOLS ────────────────────────────

    async get_instruction_overview(instructionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        return {
            name: inst.name,
            description: inst.description || "",
            totalDataItems: (inst.dataItems || []).length,
            dataItems: (inst.dataItems || []).map(item => {
                const base = { itemId: item.itemId, title: item.title || "Untitled", type: item.type };
                if (item.type === "table" && item.data) {
                    base.rowCount = Array.isArray(item.data.rows) ? item.data.rows.length : 0;
                    base.columns = Array.isArray(item.data.columns) ? item.data.columns : [];
                } else if (item.type === "text") {
                    base.charCount = (item.content || "").length;
                    const preview = (item.content || "").substring(0, 100);
                    base.preview = preview + (preview.length < (item.content || "").length ? "..." : "");
                }
                return base;
            }),
        };
    }

    async get_data_item_detail(instructionId, { itemId }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item) return { error: "ไม่พบชุดข้อมูล" };

        const result = { itemId: item.itemId, title: item.title, type: item.type };

        if (item.type === "table" && item.data) {
            const cols = Array.isArray(item.data.columns) ? item.data.columns : [];
            const rows = Array.isArray(item.data.rows) ? item.data.rows : [];
            result.rowCount = rows.length;
            result.columns = cols;
            result.previewRows = rows.slice(0, 5).map((row, i) => {
                const obj = { rowIndex: i };
                cols.forEach((c, ci) => { obj[c || `Column ${ci + 1}`] = row[ci] !== undefined ? String(row[ci]) : ""; });
                return obj;
            });
            result.hasMore = rows.length > 5;
            result.note = `แสดง ${Math.min(5, rows.length)} แถวแรกจาก ${rows.length} แถว — ใช้ get_rows เพื่อดูเพิ่มเติม`;
        } else if (item.type === "text") {
            const content = item.content || "";
            result.charCount = content.length;
            result.preview = content.substring(0, 500);
            result.hasMore = content.length > 500;
            result.note = content.length > 500 ? `แสดง 500 ตัวอักษรแรกจาก ${content.length} — ใช้ get_text_content เพื่อดูเพิ่มเติม` : undefined;
        }

        return result;
    }

    async get_rows(instructionId, { itemId, startRow = 0, limit = 20, columns }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item || item.type !== "table") return { error: "ไม่พบชุดข้อมูลตาราง" };

        const cols = Array.isArray(item.data?.columns) ? item.data.columns : [];
        const allRows = Array.isArray(item.data?.rows) ? item.data.rows : [];
        const selectedCols = columns && Array.isArray(columns) ? columns : cols;
        const end = Math.min(startRow + Math.min(limit, 50), allRows.length);
        const rows = [];

        for (let i = startRow; i < end; i++) {
            const row = allRows[i];
            if (!Array.isArray(row)) continue;
            const obj = { rowIndex: i };
            selectedCols.forEach(c => {
                const ci = cols.indexOf(c);
                obj[c] = ci !== -1 && row[ci] !== undefined ? String(row[ci]) : "";
            });
            rows.push(obj);
        }

        return {
            itemId, totalRows: allRows.length, startRow, endRow: end - 1,
            columns: selectedCols, rows, hasMore: end < allRows.length,
        };
    }

    async get_text_content(instructionId, { itemId, startChar = 0, length = 1000 }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item || item.type !== "text") return { error: "ไม่พบชุดข้อมูลข้อความ" };

        const content = item.content || "";
        const len = Math.min(length, 2000);
        const endChar = Math.min(startChar + len, content.length);

        return {
            itemId, totalChars: content.length, startChar, endChar,
            content: content.substring(startChar, endChar),
            hasMore: endChar < content.length,
        };
    }

    async search_in_table(instructionId, { itemId, keyword, column, matchMode = "contains", limit = 10 }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item || item.type !== "table") return { error: "ไม่พบชุดข้อมูลตาราง" };

        const cols = Array.isArray(item.data?.columns) ? item.data.columns : [];
        const allRows = Array.isArray(item.data?.rows) ? item.data.rows : [];
        const kw = (keyword || "").toLowerCase().trim();
        const results = [];

        for (let i = 0; i < allRows.length && results.length < Math.min(limit, 30); i++) {
            const row = allRows[i];
            if (!Array.isArray(row)) continue;

            const matchFn = (val) => {
                const v = String(val || "").toLowerCase();
                if (matchMode === "exact") return v === kw;
                if (matchMode === "startsWith") return v.startsWith(kw);
                return v.includes(kw);
            };

            let matched = false;
            if (column) {
                const ci = cols.indexOf(column);
                if (ci !== -1) matched = matchFn(row[ci]);
            } else {
                matched = row.some(cell => matchFn(cell));
            }

            if (matched) {
                const obj = { rowIndex: i };
                cols.forEach((c, ci) => { obj[c] = row[ci] !== undefined ? String(row[ci]) : ""; });
                results.push(obj);
            }
        }

        return { itemId, keyword, matchMode, totalMatches: results.length, results };
    }

    // ──────────────────────────── WRITE TOOLS ────────────────────────────

    async _logChange(instructionId, sessionId, tool, params, before, after) {
        const changeId = `chg_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;
        await this.changelogCollection.insertOne({
            changeId, sessionId, instructionId, timestamp: new Date(),
            tool, params, before, after, undone: false,
        });
        return changeId;
    }

    async update_cell(instructionId, { itemId, rowIndex, column, newValue }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ชุดข้อมูลไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const colIndex = cols.indexOf(column);
        if (colIndex === -1) return { error: `ไม่พบคอลัมน์ "${column}"` };

        const rows = item.data.rows || [];
        if (rowIndex < 0 || rowIndex >= rows.length) return { error: `แถว ${rowIndex} ไม่มีอยู่ (มี ${rows.length} แถว)` };

        const before = String(rows[rowIndex][colIndex] ?? "");
        rows[rowIndex][colIndex] = newValue;

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows.${rowIndex}`]: rows[rowIndex], [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "update_cell", { itemId, rowIndex, column, newValue }, { value: before }, { value: newValue });
        return { success: true, itemId, rowIndex, column, before, after: newValue, changeId };
    }

    async update_rows_bulk(instructionId, { itemId, updates }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        const changes = [];

        for (const u of (updates || [])) {
            const ci = cols.indexOf(u.column);
            if (ci === -1 || u.rowIndex < 0 || u.rowIndex >= rows.length) continue;
            const before = String(rows[u.rowIndex][ci] ?? "");
            rows[u.rowIndex][ci] = u.newValue;
            changes.push({ rowIndex: u.rowIndex, column: u.column, before, after: u.newValue });
        }

        if (!changes.length) return { error: "ไม่มีการเปลี่ยนแปลง" };

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows`]: rows, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "update_rows_bulk", { itemId, updates }, { changes: changes.map(c => ({ ...c, value: c.before })) }, { changes: changes.map(c => ({ ...c, value: c.after })) });
        return { success: true, itemId, updatedCount: changes.length, changes, changeId };
    }

    async add_row(instructionId, { itemId, rowData, position = "end", afterRowIndex }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        const newRow = cols.map(c => rowData && rowData[c] !== undefined ? String(rowData[c]) : "");

        let insertIndex;
        if (position === "start") { rows.unshift(newRow); insertIndex = 0; }
        else if (position === "after" && typeof afterRowIndex === "number" && afterRowIndex < rows.length) {
            rows.splice(afterRowIndex + 1, 0, newRow); insertIndex = afterRowIndex + 1;
        } else { rows.push(newRow); insertIndex = rows.length - 1; }

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows`]: rows, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "add_row", { itemId, rowData, position }, null, { rowIndex: insertIndex });
        return { success: true, itemId, newRowIndex: insertIndex, rowData, newTotalRows: rows.length, changeId };
    }

    async delete_row(instructionId, { itemId, rowIndex }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        if (rowIndex < 0 || rowIndex >= rows.length) return { error: `แถว ${rowIndex} ไม่มีอยู่` };

        const deletedRow = rows[rowIndex];
        const deletedData = {};
        cols.forEach((c, ci) => { deletedData[c] = deletedRow[ci] !== undefined ? String(deletedRow[ci]) : ""; });
        rows.splice(rowIndex, 1);

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows`]: rows, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "delete_row", { itemId, rowIndex }, { rowData: deletedData }, null);
        return { success: true, itemId, deletedRowIndex: rowIndex, deletedData, newTotalRows: rows.length, changeId };
    }

    async update_text_content(instructionId, { itemId, mode, content, find, replaceWith }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "text") return { error: "ไม่ใช่ข้อความ" };

        const original = item.content || "";
        let newContent = original;
        let matchesReplaced = 0;

        if (mode === "replace_all") {
            newContent = content || "";
        } else if (mode === "append") {
            newContent = original + (content || "");
        } else if (mode === "prepend") {
            newContent = (content || "") + original;
        } else if (mode === "find_replace") {
            if (!find) return { error: "ต้องระบุ find" };
            const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
            newContent = original.replace(regex, replaceWith || "");
            matchesReplaced = (original.match(regex) || []).length;
        }

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.content`]: newContent, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "update_text_content", { itemId, mode, content, find, replaceWith }, { content: original }, { content: newContent });

        const result = { success: true, itemId, mode, changeId };
        if (mode === "find_replace") { result.find = find; result.replaceWith = replaceWith; result.matchesReplaced = matchesReplaced; }
        return result;
    }

    async add_column(instructionId, { itemId, columnName, defaultValue = "", position = "end", afterColumn }, sessionId) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];

        if (cols.includes(columnName)) return { error: `คอลัมน์ "${columnName}" มีอยู่แล้ว` };

        let insertIndex;
        if (position === "start") { insertIndex = 0; }
        else if (position === "after" && afterColumn) {
            const ai = cols.indexOf(afterColumn);
            insertIndex = ai !== -1 ? ai + 1 : cols.length;
        } else { insertIndex = cols.length; }

        cols.splice(insertIndex, 0, columnName);
        rows.forEach(row => { if (Array.isArray(row)) row.splice(insertIndex, 0, defaultValue); });

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data`]: { columns: cols, rows }, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();

        const changeId = await this._logChange(instructionId, sessionId, "add_column", { itemId, columnName, position }, null, { columnIndex: insertIndex });
        return { success: true, itemId, columnName, columnIndex: insertIndex, newColumnCount: cols.length, changeId };
    }

    // ──────────────────────────── BULK DELETE SAFETY ────────────────────────────

    /**
     * Step 1: Confirm bulk delete — returns a confirmation token + preview of affected rows
     */
    async delete_rows_bulk_confirm(instructionId, { itemId, rowIndices }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const item = this._getDataItem(inst, itemId);
        if (!item || item.type !== "table") return { error: "ไม่พบชุดข้อมูลตาราง" };

        const cols = item.data?.columns || [];
        const rows = item.data?.rows || [];
        if (!Array.isArray(rowIndices) || !rowIndices.length) return { error: "ต้องระบุ rowIndices" };
        if (rowIndices.length > 50) return { error: "ลบได้สูงสุด 50 แถวต่อครั้ง" };

        // Validate all indices
        const invalidRows = rowIndices.filter(i => i < 0 || i >= rows.length);
        if (invalidRows.length) return { error: `แถวไม่ถูกต้อง: ${invalidRows.join(", ")}` };

        // Build preview of rows to delete
        const preview = rowIndices.map(i => {
            const obj = { rowIndex: i };
            cols.forEach((c, ci) => { obj[c] = rows[i]?.[ci] !== undefined ? String(rows[i][ci]) : ""; });
            return obj;
        });

        // Generate confirmation token (valid for 60 seconds)
        const confirmToken = `cfm_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
        this._pendingBulkDeletes = this._pendingBulkDeletes || {};
        this._pendingBulkDeletes[confirmToken] = {
            itemId,
            rowIndices: [...rowIndices].sort((a, b) => b - a), // Sort descending for safe deletion
            expiresAt: Date.now() + 60000,
            preview,
        };

        return {
            requiresConfirmation: true,
            confirmToken,
            itemId,
            rowCount: rowIndices.length,
            totalRowsBefore: rows.length,
            totalRowsAfter: rows.length - rowIndices.length,
            preview,
            message: `⚠️ จะลบ ${rowIndices.length} แถว — กรุณายืนยันโดยเรียก delete_rows_bulk ด้วย confirmToken นี้`,
        };
    }

    /**
     * Step 2: Execute bulk delete — requires valid confirmation token
     */
    async delete_rows_bulk(instructionId, { itemId, confirmToken }, sessionId) {
        if (!confirmToken) return { error: "ต้องมี confirmToken — เรียก delete_rows_bulk_confirm ก่อน" };

        this._pendingBulkDeletes = this._pendingBulkDeletes || {};
        const pending = this._pendingBulkDeletes[confirmToken];
        if (!pending) return { error: "confirmToken ไม่ถูกต้องหรือหมดอายุ" };
        if (Date.now() > pending.expiresAt) {
            delete this._pendingBulkDeletes[confirmToken];
            return { error: "confirmToken หมดอายุ (60 วินาที) — ต้อง confirm ใหม่" };
        }
        if (pending.itemId !== itemId) return { error: "itemId ไม่ตรงกับ confirmToken" };

        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };
        const itemIndex = (inst.dataItems || []).findIndex(i => i.itemId === itemId);
        if (itemIndex === -1) return { error: "ไม่พบชุดข้อมูล" };

        const item = inst.dataItems[itemIndex];
        if (item.type !== "table" || !item.data) return { error: "ไม่ใช่ตาราง" };

        const cols = item.data.columns || [];
        const rows = item.data.rows || [];
        const deletedData = [];

        // Delete rows in descending order to preserve indices
        for (const rowIndex of pending.rowIndices) {
            if (rowIndex >= 0 && rowIndex < rows.length) {
                const deletedRow = rows[rowIndex];
                const obj = { rowIndex };
                cols.forEach((c, ci) => { obj[c] = deletedRow[ci] !== undefined ? String(deletedRow[ci]) : ""; });
                deletedData.push(obj);
                rows.splice(rowIndex, 1);
            }
        }

        await this.collection.updateOne(
            { _id: new ObjectId(instructionId) },
            { $set: { [`dataItems.${itemIndex}.data.rows`]: rows, [`dataItems.${itemIndex}.updatedAt`]: new Date(), updatedAt: new Date() } }
        );
        this._invalidateCache();
        delete this._pendingBulkDeletes[confirmToken];

        const changeId = await this._logChange(instructionId, sessionId, "delete_rows_bulk",
            { itemId, rowIndices: pending.rowIndices },
            { deletedRows: deletedData },
            null
        );

        return {
            success: true, itemId,
            deletedCount: deletedData.length,
            deletedRows: deletedData,
            newTotalRows: rows.length,
            changeId,
        };
    }

    // ──────────────────────────── RAG TOOL ────────────────────────────

    async search_content(instructionId, { query, limit = 5 }) {
        const inst = await this._getInstruction(instructionId);
        if (!inst) return { error: "ไม่พบ Instruction" };

        // Build keyword index (synchronous)
        this.rag.buildIndex(inst);

        // Start embedding build in background (if not already done)
        if (!this.rag._embeddingsReady && this.openai) {
            this.rag.startEmbeddingBuild();
            // Wait briefly for embeddings (non-blocking if timeout)
            await this.rag.waitForEmbeddings(5000);
        }

        // Hybrid search: keyword + semantic (if embeddings ready)
        const results = await this.rag.search(query, Math.min(limit, 10));
        return {
            query,
            totalResults: results.length,
            results,
            searchMethod: this.rag._embeddingsReady ? "hybrid" : "keyword",
        };
    }

    // ──────────────────────────── TOOL DISPATCH ────────────────────────────

    getToolDefinitions() {
        return [
            { type: "function", function: { name: "get_instruction_overview", description: "ดูภาพรวมของ instruction: ชื่อ, description, จำนวน data items, สรุปแต่ละ item (title, type, row count, column names) — ไม่ดึงเนื้อหาจริง", parameters: { type: "object", properties: {} } } },
            { type: "function", function: { name: "get_data_item_detail", description: "ดูข้อมูลของ data item: ถ้าเป็น text ดึง content บางส่วน, ถ้าเป็น table ดึง columns + preview 5 rows แรก", parameters: { type: "object", properties: { itemId: { type: "string", description: "ID ของ data item" } }, required: ["itemId"] } } },
            { type: "function", function: { name: "get_rows", description: "ดึงแถวจาก data item ประเภทตาราง แบบแบ่งหน้า", parameters: { type: "object", properties: { itemId: { type: "string" }, startRow: { type: "number", description: "แถวเริ่มต้น (0-indexed, default 0)" }, limit: { type: "number", description: "จำนวนแถว (max 50, default 20)" }, columns: { type: "array", items: { type: "string" }, description: "เลือกเฉพาะคอลัมน์ (optional)" } }, required: ["itemId"] } } },
            { type: "function", function: { name: "get_text_content", description: "ดึงเนื้อหาของ data item ประเภท text แบบแบ่ง chunk", parameters: { type: "object", properties: { itemId: { type: "string" }, startChar: { type: "number" }, length: { type: "number", description: "จำนวนตัวอักษร (max 2000)" } }, required: ["itemId"] } } },
            { type: "function", function: { name: "search_in_table", description: "ค้นหาแถวในตารางที่มี keyword ตรงกับคอลัมน์ที่ระบุ (หรือทุกคอลัมน์)", parameters: { type: "object", properties: { itemId: { type: "string" }, keyword: { type: "string" }, column: { type: "string", description: "ค้นเฉพาะคอลัมน์นี้ (optional)" }, matchMode: { type: "string", enum: ["contains", "exact", "startsWith"] }, limit: { type: "number" } }, required: ["itemId", "keyword"] } } },
            { type: "function", function: { name: "search_content", description: "ค้นหาเนื้อหาเกี่ยวข้องทั้ง instruction ด้วย Hybrid Search (keyword + semantic embedding) — ค้นทั้ง text content และ table data ทุก item — ส่งคืน snippet + ตำแหน่ง + relevance score", parameters: { type: "object", properties: { query: { type: "string", description: "สิ่งที่ต้องการค้นหา (รองรับภาษาธรรมชาติ)" }, limit: { type: "number" } }, required: ["query"] } } },
            { type: "function", function: { name: "update_cell", description: "แก้ไขค่าของ cell ในตาราง ระบุแถวและคอลัมน์", parameters: { type: "object", properties: { itemId: { type: "string" }, rowIndex: { type: "number" }, column: { type: "string" }, newValue: { type: "string" } }, required: ["itemId", "rowIndex", "column", "newValue"] } } },
            { type: "function", function: { name: "update_rows_bulk", description: "แก้ไขหลาย cell ในตารางพร้อมกัน", parameters: { type: "object", properties: { itemId: { type: "string" }, updates: { type: "array", items: { type: "object", properties: { rowIndex: { type: "number" }, column: { type: "string" }, newValue: { type: "string" } }, required: ["rowIndex", "column", "newValue"] } } }, required: ["itemId", "updates"] } } },
            { type: "function", function: { name: "add_row", description: "เพิ่มแถวใหม่ในตาราง", parameters: { type: "object", properties: { itemId: { type: "string" }, rowData: { type: "object", description: "key=ชื่อคอลัมน์ value=ค่า" }, position: { type: "string", enum: ["start", "end", "after"] }, afterRowIndex: { type: "number" } }, required: ["itemId", "rowData"] } } },
            { type: "function", function: { name: "delete_row", description: "ลบแถวในตาราง", parameters: { type: "object", properties: { itemId: { type: "string" }, rowIndex: { type: "number" } }, required: ["itemId", "rowIndex"] } } },
            { type: "function", function: { name: "update_text_content", description: "แก้ไขเนื้อหาของ data item ประเภท text — รองรับ replace_all, find_replace, append, prepend", parameters: { type: "object", properties: { itemId: { type: "string" }, mode: { type: "string", enum: ["replace_all", "find_replace", "append", "prepend"] }, content: { type: "string" }, find: { type: "string" }, replaceWith: { type: "string" } }, required: ["itemId", "mode"] } } },
            { type: "function", function: { name: "add_column", description: "เพิ่มคอลัมน์ใหม่ในตาราง", parameters: { type: "object", properties: { itemId: { type: "string" }, columnName: { type: "string" }, defaultValue: { type: "string" }, position: { type: "string", enum: ["start", "end", "after"] }, afterColumn: { type: "string" } }, required: ["itemId", "columnName"] } } },
            { type: "function", function: { name: "delete_rows_bulk_confirm", description: "ขั้นตอน 1 ของการลบหลายแถว — ดูตัวอย่างแถวที่จะลบ + ได้ confirmToken (ต้องเรียกก่อน delete_rows_bulk เสมอ)", parameters: { type: "object", properties: { itemId: { type: "string" }, rowIndices: { type: "array", items: { type: "number" }, description: "รายการ rowIndex ที่ต้องการลบ (สูงสุด 50)" } }, required: ["itemId", "rowIndices"] } } },
            { type: "function", function: { name: "delete_rows_bulk", description: "ขั้นตอน 2 ของการลบหลายแถว — ลบจริงโดยใช้ confirmToken จาก delete_rows_bulk_confirm", parameters: { type: "object", properties: { itemId: { type: "string" }, confirmToken: { type: "string", description: "token จาก delete_rows_bulk_confirm" } }, required: ["itemId", "confirmToken"] } } },
        ];
    }

    async executeTool(toolName, args, instructionId, sessionId) {
        const readTools = ["get_instruction_overview", "get_data_item_detail", "get_rows", "get_text_content", "search_in_table", "search_content"];
        const writeTools = ["update_cell", "update_rows_bulk", "add_row", "delete_row", "update_text_content", "add_column", "delete_rows_bulk"];
        const confirmTools = ["delete_rows_bulk_confirm"];

        if (readTools.includes(toolName)) {
            if (toolName === "get_instruction_overview") return this.get_instruction_overview(instructionId);
            if (toolName === "search_content") return this.search_content(instructionId, args);
            return this[toolName](instructionId, args);
        }

        if (confirmTools.includes(toolName)) {
            return this[toolName](instructionId, args);
        }

        if (writeTools.includes(toolName)) {
            return this[toolName](instructionId, args, sessionId);
        }

        return { error: `Unknown tool: ${toolName}` };
    }
}

module.exports = InstructionChatService;
