const XLSX = require("xlsx");
const { ObjectId } = require("mongodb");
const fs = require("fs");
const crypto = require("crypto");

function generateDataItemId() {
    return `item_${crypto.randomBytes(8).toString('hex')}`;
}

function generateInstructionId() {
    return `inst_${crypto.randomBytes(6).toString('hex')}`;
}

class InstructionDataService {
    constructor(db) {
        this.db = db;
        this.collection = db.collection("instructions_v2");
    }

    /**
     * Parse Excel file and return list of sheets with preview data
     * @param {string} filePath - Path to the uploaded file
     */
    previewImportSheets(filePath) {
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const previews = [];

        for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (!rows || rows.length === 0) {
                 previews.push({
                    sheetName: sheetName,
                    totalRows: 0,
                    headers: [],
                    previewData: []
                });
                continue;
            }

            // Extract headers (row 1)
            const headers = rows[0];

            // Extract preview data (rows 2-6)
            const dataRows = rows.slice(1, 6);
            const previewData = dataRows.map(row => {
                const rowObj = {};
                headers.forEach((header, index) => {
                    // Only map if header exists and row has value
                    if (header) rowObj[header] = row[index] !== undefined ? row[index] : "";
                });
                return rowObj;
            });

            previews.push({
                sheetName: sheetName,
                totalRows: rows.length - 1, // Exclude header
                headers: headers,
                previewData: previewData
            });
        }

        return previews;
    }

    /**
     * Execute import based on user mapping
     * @param {Array} mappings - Array of { sheetName, action, targetId, targetName, mode }
     * @param {string} filePath - Path to the uploaded file
     */
    async executeImport(mappings, filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error("File not found or expired.");
        }

        const workbook = XLSX.readFile(filePath);
        const results = [];

        for (const map of mappings) {
            try {
                const { sheetName, action, targetId, targetName, mode } = map;

                if (action === 'ignore') continue;

                const sheet = workbook.Sheets[sheetName];
                if (!sheet) {
                    results.push({ sheetName, success: false, error: "Sheet not found" });
                    continue;
                }

                // Convert to JSON using headers
                const rawData = XLSX.utils.sheet_to_json(sheet);

                if (action === 'create') {
                    const now = new Date();
                    const dataItem = {
                        itemId: generateDataItemId(),
                        title: "Main Data",
                        type: "table",
                        order: 0,
                        content: "",
                        data: rawData, // The sheet data
                        createdAt: now,
                        updatedAt: now
                    };

                    const newInstruction = {
                        instructionId: generateInstructionId(),
                        name: targetName || sheetName,
                        description: `Imported from ${sheetName}`,
                        dataItems: [dataItem],
                        usageCount: 0,
                        isActive: true,
                        updatedAt: now,
                        createdAt: now
                    };
                    
                    await this.collection.insertOne(newInstruction);
                    results.push({ sheetName, success: true, action: 'created', targetName: newInstruction.name });

                } else if (action === 'update') {
                    if (!ObjectId.isValid(targetId)) {
                        results.push({ sheetName, success: false, error: "Invalid Target ID" });
                        continue;
                    }

                    const instruction = await this.collection.findOne({ _id: new ObjectId(targetId) });
                    if (!instruction) {
                        results.push({ sheetName, success: false, error: "Target instruction not found" });
                        continue;
                    }

                    let newItems = instruction.dataItems ? [...instruction.dataItems] : [];
                    let targetItem = newItems.find(item => item.type === 'table');
                    
                    if (!targetItem) {
                         // Create new table item if none exists
                         targetItem = {
                            itemId: generateDataItemId(),
                            title: sheetName,
                            type: "table",
                            order: newItems.length,
                            content: "",
                            data: rawData,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        newItems.push(targetItem);
                    } else {
                        // Update existing table item
                        if (mode === 'replace') {
                            targetItem.data = rawData;
                        } else { // append
                            const existingData = Array.isArray(targetItem.data) ? targetItem.data : [];
                            targetItem.data = [...existingData, ...rawData];
                        }
                        targetItem.updatedAt = new Date();
                        // Replace in array
                        const index = newItems.findIndex(i => i.itemId === targetItem.itemId);
                        if (index !== -1) newItems[index] = targetItem;
                    }

                    await this.collection.updateOne(
                        { _id: new ObjectId(targetId) },
                        { $set: { dataItems: newItems, updatedAt: new Date() } }
                    );
                    results.push({ sheetName, success: true, action: 'updated', targetName: instruction.name });
                }
            } catch (err) {
                console.error(`Error importing sheet ${map.sheetName}:`, err);
                results.push({ sheetName: map.sheetName, success: false, error: err.message });
            }
        }
        
        return results;
    }
    
    /**
     * Export selected instructions to a multi-sheet Excel file
     * @param {Array} instructionIds - Array of instruction IDs (strings)
     * @returns {Buffer} Excel file buffer
     */
     async exportInstructions(instructionIds) {
        const workbook = XLSX.utils.book_new();
        
        const ids = instructionIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
        
        if(ids.length === 0) {
             throw new Error("No valid instruction IDs provided.");
        }

        const instructions = await this.collection.find({ _id: { $in: ids } }).toArray();
        
        if (instructions.length === 0) {
            throw new Error("No instructions found to export.");
        }

        for (const inst of instructions) {
            // Sanitize sheet name
            let sheetName = (inst.name || "Untitled").replace(/[\\/?*[\]]/g, "_").substring(0, 31);
            
            // Ensure unique sheet name
            let counter = 1;
            let originalSheetName = sheetName;
            while(workbook.SheetNames.includes(sheetName)) {
                sheetName = `${originalSheetName.substring(0, 28)}_${counter}`;
                counter++;
            }

            // Find table data (priority to table, fallback to empty)
            const tableItem = (inst.dataItems || []).find(i => i.type === 'table');
            const data = tableItem && Array.isArray(tableItem.data) ? tableItem.data : [];
            
            const worksheet = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
        
        return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
     }
}

module.exports = InstructionDataService;