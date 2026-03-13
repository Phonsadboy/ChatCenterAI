const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  deletePostgresOrderByLegacyId,
  upsertPostgresOrderDocument,
} = require("./postgresOrderSync");
const {
  applyProjection,
  generateLegacyObjectIdString,
  normalizePlatform,
  safeStringify,
  toLegacyId,
} = require("./shared");

function createOrderRepository({ runtimeConfig }) {
  function isStorageReady() {
    return Boolean(
      runtimeConfig?.features?.postgresEnabled && isPostgresConfigured(),
    );
  }

  function hydratePostgresOrder(row = {}) {
    const orderData =
      row?.order_data && typeof row.order_data === "object" ? row.order_data : {};

    return {
      _id: row.legacy_order_id,
      userId: row.legacy_user_id || null,
      botId: row.legacy_bot_id || null,
      platform: normalizePlatform(row.platform),
      status: row.status || "pending",
      orderData,
      totals: row.totals || {},
      notes: orderData.notes || null,
      extractedFrom: orderData.extractedFrom || null,
      isManualExtraction: Boolean(orderData.isManualExtraction),
      notificationStatus: orderData.notificationStatus || null,
      notificationSentAt: orderData.notificationSentAt || null,
      extractedAt: row.extracted_at || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    };
  }

  function getValueByPath(doc, path) {
    if (!doc || typeof doc !== "object" || !path) return undefined;
    return String(path)
      .split(".")
      .reduce((value, key) => {
        if (value === null || typeof value === "undefined") return undefined;
        return value[key];
      }, doc);
  }

  function valuesEqual(left, right) {
    if (left === right) return true;
    return safeStringify(left) === safeStringify(right);
  }

  function normalizeComparableValue(value) {
    if (value instanceof Date) return value.getTime();
    if (value && typeof value === "object" && typeof value.toString === "function") {
      return value.toString();
    }
    return value;
  }

  function matchesFilter(doc, filter) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      return true;
    }

    return Object.entries(filter).every(([key, expected]) => {
      if (key === "$or") {
        return (
          Array.isArray(expected)
          && expected.some((entry) => matchesFilter(doc, entry))
        );
      }
      if (key === "$and") {
        return (
          Array.isArray(expected)
          && expected.every((entry) => matchesFilter(doc, entry))
        );
      }

      const actual =
        key === "_id" || key === "botId" || key === "userId"
          ? toLegacyId(getValueByPath(doc, key))
          : normalizeComparableValue(getValueByPath(doc, key));

      if (expected instanceof RegExp) {
        const actualText =
          actual === null || typeof actual === "undefined" ? "" : String(actual);
        expected.lastIndex = 0;
        return expected.test(actualText);
      }

      if (expected && typeof expected === "object" && !Array.isArray(expected)) {
        if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
          const values = Array.isArray(expected.$in) ? expected.$in : [];
          return values.some((value) =>
            valuesEqual(
              actual,
              key === "_id" || key === "botId" || key === "userId"
                ? toLegacyId(value)
                : normalizeComparableValue(value),
            ),
          );
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$ne")) {
          return !valuesEqual(
            actual,
            key === "_id" || key === "botId" || key === "userId"
              ? toLegacyId(expected.$ne)
              : normalizeComparableValue(expected.$ne),
          );
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$exists")) {
          const exists =
            actual !== null && typeof actual !== "undefined" && actual !== "";
          return Boolean(expected.$exists) === exists;
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$gte")) {
          if (!(actual >= normalizeComparableValue(expected.$gte))) return false;
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$lte")) {
          if (!(actual <= normalizeComparableValue(expected.$lte))) return false;
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$regex")) {
          const actualText =
            actual === null || typeof actual === "undefined" ? "" : String(actual);
          const source =
            expected.$regex instanceof RegExp
              ? expected.$regex.source
              : String(expected.$regex || "");
          const flags =
            expected.$regex instanceof RegExp
              ? expected.$regex.flags
              : typeof expected.$options === "string"
                ? expected.$options
                : "";
          if (!source) return true;
          try {
            return new RegExp(source, flags).test(actualText);
          } catch (_) {
            return false;
          }
        }
        return true;
      }

      return valuesEqual(
        actual,
        key === "_id" || key === "botId" || key === "userId"
          ? toLegacyId(expected)
          : normalizeComparableValue(expected),
      );
    });
  }

  function compareValues(left, right) {
    const normalizedLeft = normalizeComparableValue(left);
    const normalizedRight = normalizeComparableValue(right);

    if (normalizedLeft === normalizedRight) return 0;
    if (normalizedLeft === null || typeof normalizedLeft === "undefined") return -1;
    if (normalizedRight === null || typeof normalizedRight === "undefined") return 1;

    if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
      return normalizedLeft - normalizedRight;
    }

    return String(normalizedLeft).localeCompare(String(normalizedRight), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function computeStatusCountsFromDocs(docs = []) {
    const counts = new Map();
    docs.forEach((doc) => {
      const status = doc?.status || null;
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([_id, count]) => ({ _id, count }))
      .sort((left, right) =>
        String(left._id || "").localeCompare(String(right._id || "")),
      );
  }

  function computeTotalsFromDocs(docs = [], confirmedStatuses = []) {
    const statuses =
      Array.isArray(confirmedStatuses) && confirmedStatuses.length > 0
        ? confirmedStatuses
        : ["confirmed", "shipped", "completed"];

    const totals = docs.reduce(
      (acc, doc) => {
        const totalAmount = Number(doc?.orderData?.totalAmount || 0) || 0;
        const shippingCost = Number(doc?.orderData?.shippingCost || 0) || 0;
        if (doc?.status !== "cancelled") {
          acc.totalAmount += totalAmount;
          acc.totalShipping += shippingCost;
        }
        if (statuses.includes(doc?.status)) {
          acc.totalAmountConfirmed += totalAmount;
          acc.confirmedOrders += 1;
        }
        return acc;
      },
      {
        totalAmount: 0,
        totalAmountConfirmed: 0,
        totalShipping: 0,
        confirmedOrders: 0,
      },
    );

    return [{ _id: null, ...totals }];
  }

  function computePageSummariesFromDocs(docs = []) {
    const groups = new Map();
    docs.forEach((doc) => {
      const platform = normalizePlatform(doc?.platform);
      const botIdText = toLegacyId(doc?.botId);
      const groupKey = `${platform}:${botIdText}`;
      const existing = groups.get(groupKey);
      const extractedAt = doc?.extractedAt || null;
      if (!existing) {
        groups.set(groupKey, {
          _id: { platform, botIdText },
          orderCount: 1,
          lastOrderAt: extractedAt,
        });
        return;
      }
      existing.orderCount += 1;
      if (
        extractedAt
        && (!existing.lastOrderAt
          || new Date(extractedAt).getTime()
            > new Date(existing.lastOrderAt).getTime())
      ) {
        existing.lastOrderAt = extractedAt;
      }
    });
    return Array.from(groups.values()).sort((left, right) => {
      const leftKey = `${left._id?.platform || ""}:${left._id?.botIdText || ""}`;
      const rightKey = `${right._id?.platform || ""}:${right._id?.botIdText || ""}`;
      return leftKey.localeCompare(rightKey);
    });
  }

  function computeFrequentProductNamesFromDocs(docs = [], limit = 50) {
    const stats = new Map();
    docs.forEach((doc) => {
      const extractedAt = doc?.extractedAt ? new Date(doc.extractedAt).getTime() : 0;
      const items = Array.isArray(doc?.orderData?.items) ? doc.orderData.items : [];
      items.forEach((item) => {
        const name =
          typeof item?.product === "string" ? item.product.trim() : "";
        if (!name) return;
        const current = stats.get(name) || { count: 0, lastUsed: 0 };
        current.count += 1;
        current.lastUsed = Math.max(current.lastUsed, extractedAt);
        stats.set(name, current);
      });
    });
    return Array.from(stats.entries())
      .sort((left, right) => {
        if (right[1].count !== left[1].count) {
          return right[1].count - left[1].count;
        }
        return right[1].lastUsed - left[1].lastUsed;
      })
      .slice(0, limit)
      .map(([name, data]) => ({
        _id: name,
        count: data.count,
        lastUsed: data.lastUsed ? new Date(data.lastUsed) : null,
      }));
  }

  function applyListOptions(docs, options = {}) {
    const projection =
      options.projection && typeof options.projection === "object"
        ? options.projection
        : null;
    const sort =
      options.sort && typeof options.sort === "object" ? options.sort : null;

    let results = Array.isArray(docs) ? [...docs] : [];
    if (sort) {
      const sortEntries = Object.entries(sort);
      results.sort((left, right) => {
        for (const [field, direction] of sortEntries) {
          const comparison = compareValues(
            getValueByPath(left, field),
            getValueByPath(right, field),
          );
          if (comparison !== 0) {
            return comparison * (Number(direction) >= 0 ? 1 : -1);
          }
        }
        return 0;
      });
    }
    if (Number.isFinite(options.skip) && options.skip > 0) {
      results = results.slice(options.skip);
    }
    if (Number.isFinite(options.limit) && options.limit > 0) {
      results = results.slice(0, options.limit);
    }
    if (projection) {
      results = results.map((doc) => applyProjection(doc, projection));
    }
    return results;
  }

  function buildPrimaryReadQuery(filter = {}) {
    const conditions = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    if (typeof filter.platform === "string" && filter.platform.trim()) {
      push("o.platform =", normalizePlatform(filter.platform));
    }
    if (typeof filter.status === "string" && filter.status.trim()) {
      push("o.status =", filter.status.trim());
    }
    if (typeof filter.userId === "string" && filter.userId.trim()) {
      push("o.legacy_user_id =", toLegacyId(filter.userId));
    } else if (filter.userId && Array.isArray(filter.userId.$in)) {
      params.push(filter.userId.$in.map((value) => toLegacyId(value)).filter(Boolean));
      conditions.push(`o.legacy_user_id = ANY($${params.length})`);
    }
    if (typeof filter._id === "string" && filter._id.trim()) {
      push("o.legacy_order_id =", toLegacyId(filter._id));
    } else if (filter._id && Array.isArray(filter._id.$in)) {
      params.push(filter._id.$in.map((value) => toLegacyId(value)).filter(Boolean));
      conditions.push(`o.legacy_order_id = ANY($${params.length})`);
    }
    if (typeof filter.botId === "string" && filter.botId.trim()) {
      push("COALESCE(b.legacy_bot_id, '') =", toLegacyId(filter.botId));
    } else if (filter.botId && Array.isArray(filter.botId.$in)) {
      params.push(filter.botId.$in.map((value) => toLegacyId(value)).filter(Boolean));
      conditions.push(`COALESCE(b.legacy_bot_id, '') = ANY($${params.length})`);
    }
    if (filter.extractedAt && typeof filter.extractedAt === "object") {
      if (filter.extractedAt.$gte) {
        push("o.extracted_at >=", filter.extractedAt.$gte);
      }
      if (filter.extractedAt.$lte) {
        push("o.extracted_at <=", filter.extractedAt.$lte);
      }
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  async function readPostgresDocs(filter = {}) {
    const { whereSql, params } = buildPrimaryReadQuery(filter);
    const result = await query(
      `
        SELECT
          o.legacy_order_id,
          o.legacy_user_id,
          o.platform,
          o.status,
          o.totals,
          o.order_data,
          o.extracted_at,
          o.created_at,
          o.updated_at,
          b.legacy_bot_id
        FROM orders o
        LEFT JOIN bots b ON b.id = o.bot_id
        ${whereSql}
        ORDER BY o.extracted_at DESC NULLS LAST, o.updated_at DESC NULLS LAST
      `,
      params,
    );

    return result.rows
      .map((row) => hydratePostgresOrder(row))
      .filter((doc) => matchesFilter(doc, filter));
  }

  function normalizeUpdateDocument(update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      return { $set: {} };
    }
    const hasOperator = Object.keys(update).some((key) => key.startsWith("$"));
    return hasOperator ? update : { $set: update };
  }

  function applyDocumentUpdate(target = {}, normalizedUpdate = {}) {
    const next = target && typeof target === "object" ? { ...target } : {};
    const applyPath = (object, path, value, remove = false) => {
      const parts = String(path || "")
        .split(".")
        .filter(Boolean);
      if (parts.length === 0) return;
      let cursor = object;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];
        if (
          !cursor[part]
          || typeof cursor[part] !== "object"
          || Array.isArray(cursor[part])
        ) {
          cursor[part] = {};
        }
        cursor = cursor[part];
      }
      const leaf = parts[parts.length - 1];
      if (remove) {
        delete cursor[leaf];
      } else {
        cursor[leaf] = value;
      }
    };

    if (normalizedUpdate.$set && typeof normalizedUpdate.$set === "object") {
      Object.entries(normalizedUpdate.$set).forEach(([key, value]) =>
        applyPath(next, key, value));
    }
    if (normalizedUpdate.$unset && typeof normalizedUpdate.$unset === "object") {
      Object.keys(normalizedUpdate.$unset).forEach((key) =>
        applyPath(next, key, undefined, true));
    }
    if (normalizedUpdate.$inc && typeof normalizedUpdate.$inc === "object") {
      Object.entries(normalizedUpdate.$inc).forEach(([key, value]) => {
        const current = Number(getValueByPath(next, key) || 0);
        const delta = Number(value || 0);
        applyPath(next, key, current + delta);
      });
    }
    return next;
  }

  function buildIdsFilter(orderIds = []) {
    const normalizedIds = Array.isArray(orderIds)
      ? orderIds.map((orderId) => toLegacyId(orderId)).filter(Boolean)
      : [];
    if (normalizedIds.length === 0) {
      return null;
    }
    return { _id: { $in: normalizedIds } };
  }

  async function persistOrder(doc) {
    if (!doc) return null;
    return upsertPostgresOrderDocument({ query }, doc);
  }

  async function create(doc) {
    if (!isStorageReady()) {
      throw new Error("order_storage_not_configured");
    }

    const prepared = {
      ...doc,
      _id: toLegacyId(doc?._id) || generateLegacyObjectIdString(),
      createdAt: doc?.createdAt || doc?.extractedAt || new Date(),
      updatedAt: doc?.updatedAt || new Date(),
    };
    await persistOrder(prepared);
    return (await findById(prepared._id)) || prepared;
  }

  async function findById(orderId) {
    if (!isStorageReady()) {
      return null;
    }
    const docs = await readPostgresDocs({ _id: orderId });
    return docs[0] || null;
  }

  async function findLatestByUser(userId) {
    if (!isStorageReady()) {
      return null;
    }
    const docs = await readPostgresDocs({ userId });
    return docs[0] || null;
  }

  async function findByUser(userId, options = {}) {
    return list({ userId }, options);
  }

  async function findByUsers(userIds = [], options = {}) {
    const normalizedUserIds = Array.isArray(userIds)
      ? userIds.map((userId) => toLegacyId(userId)).filter(Boolean)
      : [];
    if (normalizedUserIds.length === 0) {
      return [];
    }
    return list({ userId: { $in: normalizedUserIds } }, options);
  }

  async function findByIds(orderIds = [], options = {}) {
    const filter = buildIdsFilter(orderIds);
    if (!filter) {
      return [];
    }
    return list(filter, options);
  }

  async function list(filter = {}, options = {}) {
    if (!isStorageReady()) {
      return [];
    }
    return applyListOptions(await readPostgresDocs(filter), options);
  }

  async function count(filter = {}) {
    if (!isStorageReady()) {
      return 0;
    }
    return (await readPostgresDocs(filter)).length;
  }

  async function aggregateStatusCounts(filter = {}) {
    if (!isStorageReady()) {
      return [];
    }
    return computeStatusCountsFromDocs(await readPostgresDocs(filter));
  }

  async function aggregateTotals(filter = {}, options = {}) {
    if (!isStorageReady()) {
      return [
        {
          _id: null,
          totalAmount: 0,
          totalAmountConfirmed: 0,
          totalShipping: 0,
          confirmedOrders: 0,
        },
      ];
    }
    return computeTotalsFromDocs(
      await readPostgresDocs(filter),
      options.confirmedStatuses,
    );
  }

  async function aggregatePageSummaries(filter = {}) {
    if (!isStorageReady()) {
      return [];
    }
    return computePageSummariesFromDocs(await readPostgresDocs(filter));
  }

  async function getFrequentProductNames(filter = {}, limit = 50) {
    if (!isStorageReady()) {
      return [];
    }
    return computeFrequentProductNamesFromDocs(
      await readPostgresDocs(filter),
      limit,
    );
  }

  async function updateById(orderId, update) {
    if (!isStorageReady()) {
      throw new Error("order_storage_not_configured");
    }

    const existing = await findById(orderId);
    if (!existing) {
      return { matchedCount: 0, modifiedCount: 0, document: null };
    }
    const updatedDoc = applyDocumentUpdate(
      existing,
      normalizeUpdateDocument(update),
    );
    updatedDoc._id = toLegacyId(existing._id) || toLegacyId(orderId);
    updatedDoc.updatedAt = new Date();
    await persistOrder(updatedDoc);
    const saved = await findById(updatedDoc._id);
    return {
      matchedCount: 1,
      modifiedCount: 1,
      document: saved || updatedDoc,
    };
  }

  async function updateManyByIds(orderIds = [], update) {
    const filter = buildIdsFilter(orderIds);
    if (!filter) {
      return { matchedCount: 0, modifiedCount: 0, documents: [] };
    }
    if (!isStorageReady()) {
      throw new Error("order_storage_not_configured");
    }

    const docs = await findByIds(orderIds);
    if (docs.length === 0) {
      return { matchedCount: 0, modifiedCount: 0, documents: [] };
    }

    const normalizedUpdate = normalizeUpdateDocument(update);
    const updatedDocs = [];
    for (const doc of docs) {
      const updatedDoc = applyDocumentUpdate(doc, normalizedUpdate);
      updatedDoc._id = toLegacyId(doc._id);
      updatedDoc.updatedAt = new Date();
      await persistOrder(updatedDoc);
      updatedDocs.push((await findById(updatedDoc._id)) || updatedDoc);
    }

    return {
      matchedCount: docs.length,
      modifiedCount: updatedDocs.length,
      documents: updatedDocs,
    };
  }

  async function deleteById(orderId) {
    if (!isStorageReady()) {
      return { deletedCount: 0 };
    }
    const existing = await findById(orderId);
    if (!existing) {
      return { deletedCount: 0 };
    }
    await deletePostgresOrderByLegacyId({ query }, orderId).catch((error) => {
      console.warn("[OrderRepository] Delete failed:", error?.message || error);
    });
    return { deletedCount: 1 };
  }

  async function deleteManyByIds(orderIds = []) {
    const filter = buildIdsFilter(orderIds);
    if (!filter || !isStorageReady()) {
      return { deletedCount: 0, documents: [] };
    }

    const docs = await findByIds(orderIds);
    if (docs.length === 0) {
      return { deletedCount: 0, documents: [] };
    }

    await Promise.all(
      docs.map((doc) =>
        deletePostgresOrderByLegacyId({ query }, doc?._id).catch((error) => {
          console.warn("[OrderRepository] Bulk delete failed:", error?.message || error);
        }),
      ),
    );
    return {
      deletedCount: docs.length,
      documents: docs,
    };
  }

  return {
    aggregatePageSummaries,
    aggregateStatusCounts,
    aggregateTotals,
    count,
    create,
    deleteById,
    deleteManyByIds,
    findById,
    findByIds,
    findByUser,
    findByUsers,
    findLatestByUser,
    getFrequentProductNames,
    list,
    updateById,
    updateManyByIds,
  };
}

module.exports = {
  createOrderRepository,
};
