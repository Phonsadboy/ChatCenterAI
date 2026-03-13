const crypto = require("crypto");
const { isPostgresConfigured, query, withTransaction } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  normalizePlatform,
  safeStringify,
  toLegacyId,
} = require("./shared");

function generateCategoryId() {
  return `cat_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
}

function generateColumnId() {
  return `col_${crypto.randomBytes(5).toString("hex")}`;
}

function generateRowId() {
  return `row_${crypto.randomBytes(5).toString("hex")}`;
}

function normalizeCategoryColumns(columns = []) {
  const source = Array.isArray(columns) ? columns : [];
  return source.map((column, index) => {
    const safeColumn = column && typeof column === "object" ? column : {};
    const name =
      typeof safeColumn.name === "string" ? safeColumn.name.trim() : "";
    return {
      id: toLegacyId(safeColumn.id) || generateColumnId(),
      index,
      name,
      type:
        typeof safeColumn.type === "string" && safeColumn.type.trim()
          ? safeColumn.type.trim()
          : "text",
    };
  });
}

function normalizeCategoryRow(row = {}) {
  const safeRow = row && typeof row === "object" ? row : {};
  const values =
    safeRow.values && typeof safeRow.values === "object" && !Array.isArray(safeRow.values)
      ? { ...safeRow.values }
      : {};
  return {
    rowId: toLegacyId(safeRow.rowId || safeRow.row_id) || generateRowId(),
    values,
    createdAt: safeRow.createdAt || safeRow.created_at || new Date(),
    updatedAt: safeRow.updatedAt || safeRow.updated_at || new Date(),
  };
}

function normalizeCategoryRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeCategoryRow(row));
}

function normalizeCategoryDoc(doc = {}) {
  return {
    _id: toLegacyId(doc.id || doc._id || doc.categoryId || doc.category_id),
    categoryId: toLegacyId(doc.categoryId || doc.category_id),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    platform: normalizePlatform(doc.platform),
    name: typeof doc.name === "string" ? doc.name : "",
    description: typeof doc.description === "string" ? doc.description : "",
    columns: normalizeCategoryColumns(doc.columns),
    isActive:
      typeof doc.isActive === "boolean"
        ? doc.isActive
        : typeof doc.is_active === "boolean"
          ? doc.is_active
          : true,
    createdAt: doc.createdAt || doc.created_at || null,
    updatedAt: doc.updatedAt || doc.updated_at || null,
  };
}

function normalizeCategoryTableDoc(doc = {}) {
  return {
    categoryId: toLegacyId(doc.categoryId || doc.category_id),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id),
    platform: normalizePlatform(doc.platform),
    data: normalizeCategoryRows(doc.data),
    createdAt: doc.createdAt || doc.created_at || null,
    updatedAt: doc.updatedAt || doc.updated_at || null,
  };
}

function createCategoryRepository({
  connectDB,
  dbName = "chatbot",
  runtimeConfig,
}) {
  function canUseMongo() {
    return runtimeConfig?.features?.mongoEnabled !== false;
  }

  function canUsePostgres() {
    return Boolean(runtimeConfig?.features?.postgresEnabled && isPostgresConfigured());
  }

  function shouldReadPrimary() {
    return canUsePostgres();
  }

  async function getDb() {
    if (!canUseMongo()) {
      throw new Error("MongoDB is disabled");
    }
    const client = await connectDB();
    return client.db(dbName);
  }

  function buildPostgresFilter(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    const categoryId = toLegacyId(filter.categoryId);
    if (categoryId) {
      push("category_id =", categoryId);
    }

    const botId = toLegacyId(filter.botId);
    if (botId) {
      push("legacy_bot_id =", botId);
    }

    const platform =
      typeof filter.platform === "string" && filter.platform.trim()
        ? normalizePlatform(filter.platform)
        : "";
    if (platform) {
      push("platform =", platform);
    }

    const name =
      typeof filter.name === "string" && filter.name.trim()
        ? filter.name.trim()
        : "";
    if (name) {
      push("name =", name);
    }

    if (typeof filter.isActive === "boolean") {
      push("is_active =", filter.isActive);
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  function buildMongoFilter(filter = {}) {
    const queryFilter = {};
    const categoryId = toLegacyId(filter.categoryId);
    if (categoryId) {
      queryFilter.categoryId = categoryId;
    }
    const botId = toLegacyId(filter.botId);
    if (botId) {
      queryFilter.botId = botId;
    }
    const platform =
      typeof filter.platform === "string" && filter.platform.trim()
        ? normalizePlatform(filter.platform)
        : "";
    if (platform) {
      queryFilter.platform = platform;
    }
    const name =
      typeof filter.name === "string" && filter.name.trim()
        ? filter.name.trim()
        : "";
    if (name) {
      queryFilter.name = name;
    }
    if (typeof filter.isActive === "boolean") {
      queryFilter.isActive = filter.isActive;
    }
    return queryFilter;
  }

  async function readPostgresCategories(filter = {}, options = {}) {
    const { whereSql, params } = buildPostgresFilter(filter);
    const sortDirection = Number(options?.sort?.createdAt) >= 0 ? "ASC" : "DESC";
    const result = await query(
      `
        SELECT
          id::text AS id,
          category_id,
          legacy_bot_id,
          platform,
          name,
          description,
          columns,
          is_active,
          created_at,
          updated_at
        FROM categories
        ${whereSql}
        ORDER BY created_at ${sortDirection}, id ${sortDirection}
      `,
      params,
    );
    return result.rows.map((row) => normalizeCategoryDoc(row));
  }

  async function readPostgresCategory(filter = {}) {
    const { whereSql, params } = buildPostgresFilter(filter);
    if (!whereSql) return null;
    const result = await query(
      `
        SELECT
          id::text AS id,
          category_id,
          legacy_bot_id,
          platform,
          name,
          description,
          columns,
          is_active,
          created_at,
          updated_at
        FROM categories
        ${whereSql}
        LIMIT 1
      `,
      params,
    );
    const row = result.rows[0] || null;
    return row ? normalizeCategoryDoc(row) : null;
  }

  async function readPostgresTable(categoryId) {
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;
    const result = await query(
      `
        SELECT
          category_id,
          legacy_bot_id,
          platform,
          data,
          created_at,
          updated_at
        FROM category_tables
        WHERE category_id = $1
        LIMIT 1
      `,
      [normalizedCategoryId],
    );
    const row = result.rows[0] || null;
    return row ? normalizeCategoryTableDoc(row) : null;
  }

  async function readMongoCategories(filter = {}, options = {}) {
    if (!canUseMongo()) return [];
    const db = await getDb();
    const cursor = db
      .collection("categories")
      .find(buildMongoFilter(filter))
      .sort(options.sort || { createdAt: -1 });
    return cursor.toArray();
  }

  async function readMongoCategory(filter = {}) {
    if (!canUseMongo()) return null;
    const db = await getDb();
    return db.collection("categories").findOne(buildMongoFilter(filter));
  }

  async function readMongoTable(categoryId) {
    if (!canUseMongo()) return null;
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;
    const db = await getDb();
    return db.collection("category_tables").findOne({ categoryId: normalizedCategoryId });
  }

  async function list(filter = {}, options = {}) {
    if (shouldReadPrimary()) {
      return readPostgresCategories(filter, options);
    }

    if (!canUseMongo()) {
      return [];
    }

    const mongoDocs = await readMongoCategories(filter, options);
    return mongoDocs.map((doc) => normalizeCategoryDoc(doc));
  }

  async function findByCategoryId(categoryId, options = {}) {
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;

    if (shouldReadPrimary()) {
      return readPostgresCategory({
        categoryId: normalizedCategoryId,
        isActive: options.includeInactive ? undefined : true,
      });
    }

    if (!canUseMongo()) {
      return null;
    }

    const mongoDoc = await readMongoCategory({
      categoryId: normalizedCategoryId,
      isActive: options.includeInactive ? undefined : true,
    });
    return mongoDoc ? normalizeCategoryDoc(mongoDoc) : null;
  }

  async function findActiveByName(name, { botId, platform } = {}) {
    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!normalizedName) return null;

    if (shouldReadPrimary()) {
      return readPostgresCategory({
        name: normalizedName,
        botId,
        platform,
        isActive: true,
      });
    }

    if (!canUseMongo()) {
      return null;
    }

    const mongoDoc = await readMongoCategory({
      name: normalizedName,
      botId,
      platform,
      isActive: true,
    });
    return mongoDoc ? normalizeCategoryDoc(mongoDoc) : null;
  }

  async function getTable(categoryId) {
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;

    if (shouldReadPrimary()) {
      return readPostgresTable(normalizedCategoryId);
    }

    if (!canUseMongo()) {
      return null;
    }

    const mongoDoc = await readMongoTable(normalizedCategoryId);
    return mongoDoc ? normalizeCategoryTableDoc(mongoDoc) : null;
  }

  async function listRows(categoryId) {
    const table = await getTable(categoryId);
    return Array.isArray(table?.data) ? table.data : [];
  }

  async function createCategory(payload = {}) {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const description =
      typeof payload.description === "string" ? payload.description : "";
    const botId = toLegacyId(payload.botId);
    const platform = normalizePlatform(payload.platform);
    const columns = normalizeCategoryColumns(payload.columns);

    if (!name || !botId || !platform || columns.length === 0) {
      throw new Error("category_missing_required_fields");
    }

    if (canUsePostgres()) {
      return withTransaction(async (client) => {
        const duplicateCheck = await client.query(
          `
            SELECT category_id
            FROM categories
            WHERE legacy_bot_id = $1
              AND platform = $2
              AND is_active = TRUE
              AND LOWER(name) = LOWER($3)
            LIMIT 1
          `,
          [botId, platform, name],
        );
        if (duplicateCheck.rowCount > 0) {
          throw new Error("category_name_already_exists");
        }

        const categoryId = generateCategoryId();
        const now = new Date();
        const pgBotId = await resolvePgBotId(client, platform, botId).catch(() => null);
        await client.query(
          `
            INSERT INTO categories (
              category_id,
              bot_id,
              legacy_bot_id,
              platform,
              name,
              description,
              columns,
              is_active,
              created_at,
              updated_at
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7::jsonb,TRUE,$8,$9
            )
          `,
          [
            categoryId,
            pgBotId,
            botId,
            platform,
            name,
            description,
            safeStringify(columns),
            now,
            now,
          ],
        );
        await client.query(
          `
            INSERT INTO category_tables (
              category_id,
              bot_id,
              legacy_bot_id,
              platform,
              data,
              created_at,
              updated_at
            ) VALUES (
              $1,$2,$3,$4,'[]'::jsonb,$5,$6
            )
          `,
          [categoryId, pgBotId, botId, platform, now, now],
        );
        return {
          _id: categoryId,
          categoryId,
          botId,
          platform,
          name,
          description,
          columns,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
      });
    }

    if (!canUseMongo()) {
      throw new Error("category_storage_unavailable");
    }

    const db = await getDb();
    const existing = await db.collection("categories").findOne({
      name,
      botId,
      platform,
      isActive: true,
    });
    if (existing) {
      throw new Error("category_name_already_exists");
    }

    const categoryId = generateCategoryId();
    const now = new Date();
    const doc = {
      categoryId,
      botId,
      platform,
      name,
      description,
      columns,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("categories").insertOne(doc);
    await db.collection("category_tables").insertOne({
      categoryId,
      botId,
      platform,
      data: [],
      createdAt: now,
      updatedAt: now,
    });
    return normalizeCategoryDoc(doc);
  }

  async function updateCategory(categoryId, payload = {}) {
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;

    if (canUsePostgres()) {
      return withTransaction(async (client) => {
        const existingResult = await client.query(
          `
            SELECT
              id::text AS id,
              category_id,
              legacy_bot_id,
              platform,
              name,
              description,
              columns,
              is_active,
              created_at,
              updated_at
            FROM categories
            WHERE category_id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [normalizedCategoryId],
        );
        const existingRow = existingResult.rows[0] || null;
        if (!existingRow) {
          return null;
        }

        const existing = normalizeCategoryDoc(existingRow);
        const nextName =
          typeof payload.name === "string" && payload.name.trim()
            ? payload.name.trim()
            : existing.name;
        const nextDescription =
          typeof payload.description === "string"
            ? payload.description
            : payload.description === ""
              ? ""
              : existing.description;
        const nextColumns =
          Array.isArray(payload.columns) && payload.columns.length > 0
            ? normalizeCategoryColumns(payload.columns)
            : existing.columns;

        if (
          nextName.toLowerCase() !== existing.name.toLowerCase()
        ) {
          const duplicateCheck = await client.query(
            `
              SELECT category_id
              FROM categories
              WHERE legacy_bot_id = $1
                AND platform = $2
                AND is_active = TRUE
                AND LOWER(name) = LOWER($3)
                AND category_id <> $4
              LIMIT 1
            `,
            [existing.botId, existing.platform, nextName, normalizedCategoryId],
          );
          if (duplicateCheck.rowCount > 0) {
            throw new Error("category_name_already_exists");
          }
        }

        const updatedAt = new Date();
        const result = await client.query(
          `
            UPDATE categories
            SET
              name = $2,
              description = $3,
              columns = $4::jsonb,
              updated_at = $5
            WHERE category_id = $1
            RETURNING
              id::text AS id,
              category_id,
              legacy_bot_id,
              platform,
              name,
              description,
              columns,
              is_active,
              created_at,
              updated_at
          `,
          [
            normalizedCategoryId,
            nextName,
            nextDescription,
            safeStringify(nextColumns),
            updatedAt,
          ],
        );
        const row = result.rows[0] || null;
        return row ? normalizeCategoryDoc(row) : null;
      });
    }

    if (!canUseMongo()) {
      throw new Error("category_storage_unavailable");
    }

    const db = await getDb();
    const existing = await db.collection("categories").findOne({ categoryId: normalizedCategoryId });
    if (!existing) {
      return null;
    }

    const processedColumns =
      Array.isArray(payload.columns) && payload.columns.length > 0
        ? normalizeCategoryColumns(payload.columns)
        : existing.columns;
    const updateDoc = {
      updatedAt: new Date(),
    };
    if (typeof payload.name === "string" && payload.name.trim()) {
      updateDoc.name = payload.name.trim();
    }
    if (typeof payload.description === "string") {
      updateDoc.description = payload.description;
    }
    if (Array.isArray(payload.columns)) {
      updateDoc.columns = processedColumns;
    }
    await db.collection("categories").updateOne(
      { categoryId: normalizedCategoryId },
      { $set: updateDoc },
    );
    const updated = await db.collection("categories").findOne({ categoryId: normalizedCategoryId });
    return updated ? normalizeCategoryDoc(updated) : null;
  }

  async function deleteCategory(categoryId) {
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return false;

    if (canUsePostgres()) {
      const result = await query(
        "DELETE FROM categories WHERE category_id = $1",
        [normalizedCategoryId],
      );
      return result.rowCount > 0;
    }

    if (!canUseMongo()) {
      throw new Error("category_storage_unavailable");
    }

    const db = await getDb();
    await db.collection("category_tables").deleteOne({ categoryId: normalizedCategoryId });
    const result = await db.collection("categories").deleteOne({ categoryId: normalizedCategoryId });
    return result.deletedCount > 0;
  }

  async function addRow(categoryId, values = {}) {
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;

    if (canUsePostgres()) {
      return withTransaction(async (client) => {
        const categoryResult = await client.query(
          `
            SELECT category_id, legacy_bot_id, platform
            FROM categories
            WHERE category_id = $1
              AND is_active = TRUE
            LIMIT 1
          `,
          [normalizedCategoryId],
        );
        const categoryRow = categoryResult.rows[0] || null;
        if (!categoryRow) {
          return null;
        }

        const now = new Date();
        const newRow = normalizeCategoryRow({
          rowId: generateRowId(),
          values,
          createdAt: now,
          updatedAt: now,
        });

        const existingTable = await client.query(
          `
            SELECT data
            FROM category_tables
            WHERE category_id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [normalizedCategoryId],
        );
        const currentRows = normalizeCategoryRows(existingTable.rows[0]?.data);
        currentRows.push(newRow);

        if (existingTable.rowCount > 0) {
          await client.query(
            `
              UPDATE category_tables
              SET
                data = $2::jsonb,
                updated_at = $3
              WHERE category_id = $1
            `,
            [normalizedCategoryId, safeStringify(currentRows), now],
          );
        } else {
          const pgBotId = await resolvePgBotId(
            client,
            categoryRow.platform,
            categoryRow.legacy_bot_id,
          ).catch(() => null);
          await client.query(
            `
              INSERT INTO category_tables (
                category_id,
                bot_id,
                legacy_bot_id,
                platform,
                data,
                created_at,
                updated_at
              ) VALUES (
                $1,$2,$3,$4,$5::jsonb,$6,$7
              )
            `,
            [
              normalizedCategoryId,
              pgBotId,
              categoryRow.legacy_bot_id,
              categoryRow.platform,
              safeStringify([newRow]),
              now,
              now,
            ],
          );
        }

        return newRow;
      });
    }

    if (!canUseMongo()) {
      throw new Error("category_storage_unavailable");
    }

    const db = await getDb();
    const newRow = normalizeCategoryRow({ values });
    const result = await db.collection("category_tables").updateOne(
      { categoryId: normalizedCategoryId },
      {
        $push: { data: newRow },
        $set: { updatedAt: new Date() },
      },
    );
    if (result.matchedCount === 0) {
      return null;
    }
    return newRow;
  }

  async function updateRow(categoryId, rowId, values = {}) {
    const normalizedCategoryId = toLegacyId(categoryId);
    const normalizedRowId = toLegacyId(rowId);
    if (!normalizedCategoryId || !normalizedRowId) return null;

    if (canUsePostgres()) {
      return withTransaction(async (client) => {
        const existingTable = await client.query(
          `
            SELECT data
            FROM category_tables
            WHERE category_id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [normalizedCategoryId],
        );
        if (existingTable.rowCount === 0) {
          return null;
        }

        const currentRows = normalizeCategoryRows(existingTable.rows[0]?.data);
        const rowIndex = currentRows.findIndex((entry) => entry.rowId === normalizedRowId);
        if (rowIndex < 0) {
          return null;
        }

        const updatedAt = new Date();
        currentRows[rowIndex] = {
          ...currentRows[rowIndex],
          values:
            values && typeof values === "object" && !Array.isArray(values)
              ? { ...values }
              : {},
          updatedAt,
        };

        await client.query(
          `
            UPDATE category_tables
            SET
              data = $2::jsonb,
              updated_at = $3
            WHERE category_id = $1
          `,
          [normalizedCategoryId, safeStringify(currentRows), updatedAt],
        );

        return currentRows[rowIndex];
      });
    }

    if (!canUseMongo()) {
      throw new Error("category_storage_unavailable");
    }

    const db = await getDb();
    const result = await db.collection("category_tables").updateOne(
      { categoryId: normalizedCategoryId, "data.rowId": normalizedRowId },
      {
        $set: {
          "data.$.values": values,
          "data.$.updatedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) {
      return null;
    }
    const table = await db.collection("category_tables").findOne({ categoryId: normalizedCategoryId });
    const row = Array.isArray(table?.data)
      ? table.data.find((entry) => toLegacyId(entry?.rowId) === normalizedRowId)
      : null;
    return row ? normalizeCategoryRow(row) : null;
  }

  async function deleteRow(categoryId, rowId) {
    const normalizedCategoryId = toLegacyId(categoryId);
    const normalizedRowId = toLegacyId(rowId);
    if (!normalizedCategoryId || !normalizedRowId) return false;

    if (canUsePostgres()) {
      return withTransaction(async (client) => {
        const existingTable = await client.query(
          `
            SELECT data
            FROM category_tables
            WHERE category_id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [normalizedCategoryId],
        );
        if (existingTable.rowCount === 0) {
          return false;
        }

        const currentRows = normalizeCategoryRows(existingTable.rows[0]?.data);
        const nextRows = currentRows.filter((entry) => entry.rowId !== normalizedRowId);
        if (nextRows.length === currentRows.length) {
          return false;
        }

        await client.query(
          `
            UPDATE category_tables
            SET
              data = $2::jsonb,
              updated_at = $3
            WHERE category_id = $1
          `,
          [normalizedCategoryId, safeStringify(nextRows), new Date()],
        );
        return true;
      });
    }

    if (!canUseMongo()) {
      throw new Error("category_storage_unavailable");
    }

    const db = await getDb();
    const result = await db.collection("category_tables").updateOne(
      { categoryId: normalizedCategoryId },
      {
        $pull: { data: { rowId: normalizedRowId } },
        $set: { updatedAt: new Date() },
      },
    );
    return result.matchedCount > 0 && result.modifiedCount > 0;
  }

  async function appendRows(categoryId, rows = []) {
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return [];
    const normalizedRows = normalizeCategoryRows(rows);
    if (normalizedRows.length === 0) return [];

    if (canUsePostgres()) {
      return withTransaction(async (client) => {
        const categoryResult = await client.query(
          `
            SELECT category_id, legacy_bot_id, platform
            FROM categories
            WHERE category_id = $1
              AND is_active = TRUE
            LIMIT 1
          `,
          [normalizedCategoryId],
        );
        const categoryRow = categoryResult.rows[0] || null;
        if (!categoryRow) {
          throw new Error("category_not_found");
        }

        const existingTable = await client.query(
          `
            SELECT data
            FROM category_tables
            WHERE category_id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [normalizedCategoryId],
        );
        const currentRows = normalizeCategoryRows(existingTable.rows[0]?.data);
        const nextRows = currentRows.concat(normalizedRows);
        const updatedAt = new Date();

        if (existingTable.rowCount > 0) {
          await client.query(
            `
              UPDATE category_tables
              SET
                data = $2::jsonb,
                updated_at = $3
              WHERE category_id = $1
            `,
            [normalizedCategoryId, safeStringify(nextRows), updatedAt],
          );
        } else {
          const pgBotId = await resolvePgBotId(
            client,
            categoryRow.platform,
            categoryRow.legacy_bot_id,
          ).catch(() => null);
          await client.query(
            `
              INSERT INTO category_tables (
                category_id,
                bot_id,
                legacy_bot_id,
                platform,
                data,
                created_at,
                updated_at
              ) VALUES (
                $1,$2,$3,$4,$5::jsonb,$6,$7
              )
            `,
            [
              normalizedCategoryId,
              pgBotId,
              categoryRow.legacy_bot_id,
              categoryRow.platform,
              safeStringify(normalizedRows),
              updatedAt,
              updatedAt,
            ],
          );
        }

        return normalizedRows;
      });
    }

    if (!canUseMongo()) {
      throw new Error("category_storage_unavailable");
    }

    const db = await getDb();
    await db.collection("category_tables").updateOne(
      { categoryId: normalizedCategoryId },
      {
        $push: { data: { $each: normalizedRows } },
        $set: { updatedAt: new Date() },
      },
    );
    return normalizedRows;
  }

  return {
    addRow,
    appendRows,
    createCategory,
    deleteCategory,
    deleteRow,
    findActiveByName,
    findByCategoryId,
    getTable,
    list,
    listRows,
    normalizeCategoryColumns,
    normalizeCategoryDoc,
    normalizeCategoryRow,
    normalizeCategoryRows,
    updateCategory,
    updateRow,
  };
}

module.exports = {
  createCategoryRepository,
};
