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

function createCategoryRepository() {
  function ensurePostgres() {
    if (!isPostgresConfigured()) {
      throw new Error("category_storage_requires_postgres");
    }
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

  async function readPostgresCategories(filter = {}, options = {}) {
    ensurePostgres();
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
    ensurePostgres();
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
    ensurePostgres();
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

  async function list(filter = {}, options = {}) {
    return readPostgresCategories(filter, options);
  }

  async function findByCategoryId(categoryId, options = {}) {
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;
    return readPostgresCategory({
      categoryId: normalizedCategoryId,
      isActive: options.includeInactive ? undefined : true,
    });
  }

  async function findActiveByName(name, { botId, platform } = {}) {
    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!normalizedName) return null;
    return readPostgresCategory({
      name: normalizedName,
      botId,
      platform,
      isActive: true,
    });
  }

  async function getTable(categoryId) {
    return readPostgresTable(categoryId);
  }

  async function listRows(categoryId) {
    const table = await getTable(categoryId);
    return Array.isArray(table?.data) ? table.data : [];
  }

  async function createCategory(payload = {}) {
    ensurePostgres();
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const description =
      typeof payload.description === "string" ? payload.description : "";
    const botId = toLegacyId(payload.botId);
    const platform = normalizePlatform(payload.platform);
    const columns = normalizeCategoryColumns(payload.columns);

    if (!name || !botId || !platform || columns.length === 0) {
      throw new Error("category_missing_required_fields");
    }

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

  async function updateCategory(categoryId, payload = {}) {
    ensurePostgres();
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;

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

      if (nextName.toLowerCase() !== existing.name.toLowerCase()) {
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

  async function deleteCategory(categoryId) {
    ensurePostgres();
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return false;
    const result = await query(
      "DELETE FROM categories WHERE category_id = $1",
      [normalizedCategoryId],
    );
    return result.rowCount > 0;
  }

  async function addRow(categoryId, values = {}) {
    ensurePostgres();
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return null;

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

  async function updateRow(categoryId, rowId, values = {}) {
    ensurePostgres();
    const normalizedCategoryId = toLegacyId(categoryId);
    const normalizedRowId = toLegacyId(rowId);
    if (!normalizedCategoryId || !normalizedRowId) return null;

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

  async function deleteRow(categoryId, rowId) {
    ensurePostgres();
    const normalizedCategoryId = toLegacyId(categoryId);
    const normalizedRowId = toLegacyId(rowId);
    if (!normalizedCategoryId || !normalizedRowId) return false;

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

  async function appendRows(categoryId, rows = []) {
    ensurePostgres();
    const normalizedCategoryId = toLegacyId(categoryId);
    if (!normalizedCategoryId) return [];
    const normalizedRows = normalizeCategoryRows(rows);
    if (normalizedRows.length === 0) return [];

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
