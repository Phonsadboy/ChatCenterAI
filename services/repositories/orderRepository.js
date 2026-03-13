const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  deletePostgresOrderByLegacyId,
  upsertPostgresOrderDocument,
} = require("./postgresOrderSync");
const {
  applyProjection,
  buildMongoIdQuery,
  generateLegacyObjectIdString,
  normalizePlatform,
  safeStringify,
  toLegacyId,
  toObjectId,
  warnPrimaryReadFailure,
} = require("./shared");

function createOrderRepository({
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

  function shouldDualWrite() {
    return Boolean(runtimeConfig?.features?.postgresDualWrite && canUsePostgres());
  }

  function shouldShadowRead() {
    return Boolean(runtimeConfig?.features?.postgresShadowRead && canUsePostgres());
  }

  function shouldReadPrimary() {
    return Boolean(
      canUsePostgres()
        && (runtimeConfig?.features?.postgresReadPrimaryOrders || !canUseMongo()),
    );
  }

  async function getCollection() {
    if (!canUseMongo()) {
      throw new Error("MongoDB is disabled");
    }
    const client = await connectDB();
    return client.db(dbName).collection("orders");
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

  function normalizeMongoComparable(value) {
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
        return Array.isArray(expected)
          && expected.some((entry) => matchesFilter(doc, entry));
      }
      if (key === "$and") {
        return Array.isArray(expected)
          && expected.every((entry) => matchesFilter(doc, entry));
      }

      const actual =
        key === "_id" || key === "botId" || key === "userId"
          ? toLegacyId(getValueByPath(doc, key))
          : normalizeMongoComparable(getValueByPath(doc, key));

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
                : normalizeMongoComparable(value),
            ),
          );
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$ne")) {
          return !valuesEqual(
            actual,
            key === "_id" || key === "botId" || key === "userId"
              ? toLegacyId(expected.$ne)
              : normalizeMongoComparable(expected.$ne),
          );
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$exists")) {
          const exists = actual !== null && typeof actual !== "undefined" && actual !== "";
          return Boolean(expected.$exists) === exists;
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$gte")) {
          if (!(actual >= normalizeMongoComparable(expected.$gte))) return false;
        }
        if (Object.prototype.hasOwnProperty.call(expected, "$lte")) {
          if (!(actual <= normalizeMongoComparable(expected.$lte))) return false;
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
          : normalizeMongoComparable(expected),
      );
    });
  }

  function compareValues(left, right) {
    const normalizedLeft = normalizeMongoComparable(left);
    const normalizedRight = normalizeMongoComparable(right);

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

  function normalizeComparableDoc(doc) {
    if (!doc || typeof doc !== "object") return doc;
    return {
      _id: toLegacyId(doc._id),
      userId: toLegacyId(doc.userId),
      botId: toLegacyId(doc.botId),
      platform: normalizePlatform(doc.platform),
      status: doc.status || "pending",
      notes: doc.notes || null,
      extractedAt: doc.extractedAt ? new Date(doc.extractedAt).toISOString() : null,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      orderData: doc.orderData || {},
    };
  }

  function startShadowCompare(label, mongoValue, pgValue) {
    if (!shouldShadowRead() || shouldReadPrimary()) return;
    const normalizedMongo = Array.isArray(mongoValue)
      ? mongoValue.map((item) => normalizeComparableDoc(item))
      : normalizeComparableDoc(mongoValue);
    const normalizedPg = Array.isArray(pgValue)
      ? pgValue.map((item) => normalizeComparableDoc(item))
      : normalizeComparableDoc(pgValue);

    if (safeStringify(normalizedMongo) !== safeStringify(normalizedPg)) {
      console.warn(`[OrderRepository] Shadow read mismatch for ${label}`);
    }
  }

  function computeStatusCountsFromDocs(docs = []) {
    const counts = new Map();
    docs.forEach((doc) => {
      const status = doc?.status || null;
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([_id, count]) => ({ _id, count }))
      .sort((left, right) => String(left._id || "").localeCompare(String(right._id || "")));
  }

  function normalizeStatusCountsResult(items = []) {
    return [...items].sort((left, right) =>
      String(left?._id || "").localeCompare(String(right?._id || "")),
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
        extractedAt &&
        (!existing.lastOrderAt ||
          new Date(extractedAt).getTime() > new Date(existing.lastOrderAt).getTime())
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

  function normalizePageSummaryResult(items = []) {
    return [...items].sort((left, right) => {
      const leftKey = `${left?._id?.platform || ""}:${left?._id?.botIdText || ""}`;
      const rightKey = `${right?._id?.platform || ""}:${right?._id?.botIdText || ""}`;
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

  function applyMongoStyleUpdate(target = {}, normalizedUpdate = {}) {
    const next = target && typeof target === "object" ? { ...target } : {};
    const applyPath = (object, path, value, remove = false) => {
      const parts = String(path || "")
        .split(".")
        .filter(Boolean);
      if (parts.length === 0) return;
      let cursor = object;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];
        if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
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
      ? orderIds
        .map((orderId) => {
          const objectId = toObjectId(orderId);
          return objectId || toLegacyId(orderId) || null;
        })
        .filter(Boolean)
      : [];

    if (normalizedIds.length === 0) {
      return null;
    }

    return { _id: { $in: normalizedIds } };
  }

  async function syncDoc(doc, options = {}) {
    if (!doc) return null;
    const force = options.force === true;
    if (!force && !shouldDualWrite()) return null;
    return upsertPostgresOrderDocument({ query }, doc);
  }

  async function create(doc) {
    if (!canUseMongo()) {
      if (!canUsePostgres()) {
        throw new Error("MongoDB is disabled and PostgreSQL is not configured");
      }
      const prepared = {
        ...doc,
        _id: toLegacyId(doc?._id) || generateLegacyObjectIdString(),
        createdAt: doc?.createdAt || doc?.extractedAt || new Date(),
        updatedAt: doc?.updatedAt || new Date(),
      };
      await syncDoc(prepared, { force: true });
      return (await findById(prepared._id)) || prepared;
    }

    const coll = await getCollection();
    const result = await coll.insertOne(doc);
    const savedDoc = { ...doc, _id: result.insertedId };
    await syncDoc(savedDoc).catch((error) => {
      console.warn("[OrderRepository] Create dual-write failed:", error?.message || error);
    });
    return savedDoc;
  }

  async function findById(orderId) {
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresDocs({ _id: orderId });
        if (docs.length > 0 || !canUseMongo()) return docs[0] || null;
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "OrderRepository",
          operation: "read",
          identifier: orderId,
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return null;
    }

    const coll = await getCollection();
    const mongoDoc = await coll.findOne(buildMongoIdQuery(orderId));

    if (shouldShadowRead()) {
      void readPostgresDocs({ _id: orderId })
        .then((pgDocs) => startShadowCompare(`id:${orderId}`, mongoDoc, pgDocs[0] || null))
        .catch((error) => {
          console.warn(
            `[OrderRepository] Shadow read failed for ${orderId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
  }

  async function findLatestByUser(userId) {
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresDocs({ userId });
        if (docs.length > 0 || !canUseMongo()) {
          return docs[0] || null;
        }
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "OrderRepository",
          operation: "latest read",
          identifier: userId,
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return null;
    }

    const coll = await getCollection();
    const mongoDoc = await coll.findOne({ userId }, { sort: { extractedAt: -1 } });

    if (shouldShadowRead()) {
      void readPostgresDocs({ userId })
        .then((pgDocs) =>
          startShadowCompare(`latestByUser:${userId}`, mongoDoc, pgDocs[0] || null),
        )
        .catch((error) => {
          console.warn(
            `[OrderRepository] Shadow latest read failed for user ${userId}:`,
            error?.message || error,
          );
        });
    }

    return mongoDoc;
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
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresDocs(filter);
        return applyListOptions(docs, options);
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "OrderRepository",
          operation: "list read",
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const coll = await getCollection();
    const findOptions = {};
    if (options.projection && typeof options.projection === "object") {
      findOptions.projection = options.projection;
    }
    let cursor = coll.find(filter, findOptions);
    cursor = cursor.sort(options.sort || { extractedAt: -1 });
    if (Number.isFinite(options.skip) && options.skip > 0) {
      cursor = cursor.skip(options.skip);
    }
    if (Number.isFinite(options.limit) && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }
    const mongoDocs = await cursor.toArray();

    if (shouldShadowRead()) {
      void readPostgresDocs(filter)
        .then((pgDocs) =>
          startShadowCompare(
            `list:${safeStringify(filter)}`,
            mongoDocs,
            applyListOptions(pgDocs, options),
          ),
        )
        .catch((error) => {
          console.warn(
            "[OrderRepository] Shadow list read failed:",
            error?.message || error,
          );
        });
    }

    return mongoDocs;
  }

  async function count(filter = {}) {
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresDocs(filter);
        return docs.length;
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "OrderRepository",
          operation: "count read",
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return 0;
    }

    const coll = await getCollection();
    const mongoCount = await coll.countDocuments(filter);

    if (shouldShadowRead()) {
      void readPostgresDocs(filter)
        .then((pgDocs) => {
          if (mongoCount !== pgDocs.length) {
            console.warn(
              `[OrderRepository] Shadow count mismatch for ${safeStringify(filter)}`,
            );
          }
        })
        .catch((error) => {
          console.warn(
            "[OrderRepository] Shadow count read failed:",
            error?.message || error,
          );
        });
    }

    return mongoCount;
  }

  async function aggregateStatusCounts(filter = {}) {
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresDocs(filter);
        return computeStatusCountsFromDocs(docs);
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "OrderRepository",
          operation: "status aggregate",
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const coll = await getCollection();
    return coll
      .aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray()
      .then((mongoResult) => {
        if (shouldShadowRead()) {
          void readPostgresDocs(filter)
            .then((pgDocs) => {
              const pgResult = computeStatusCountsFromDocs(pgDocs);
              if (
                safeStringify(normalizeStatusCountsResult(mongoResult))
                !== safeStringify(normalizeStatusCountsResult(pgResult))
              ) {
                console.warn(
                  `[OrderRepository] Shadow status aggregate mismatch for ${safeStringify(filter)}`,
                );
              }
            })
            .catch((error) => {
              console.warn(
                "[OrderRepository] Shadow status aggregate failed:",
                error?.message || error,
              );
            });
        }
        return mongoResult;
      });
  }

  async function aggregateTotals(filter = {}, options = {}) {
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresDocs(filter);
        return computeTotalsFromDocs(docs, options.confirmedStatuses);
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "OrderRepository",
          operation: "totals aggregate",
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return [{ _id: null, totalAmount: 0, totalAmountConfirmed: 0, totalShipping: 0, confirmedOrders: 0 }];
    }

    const coll = await getCollection();
    const confirmedStatuses =
      Array.isArray(options.confirmedStatuses) && options.confirmedStatuses.length > 0
        ? options.confirmedStatuses
        : ["confirmed", "shipped", "completed"];
    const numericTotalAmountExpr = {
      $convert: {
        input: "$orderData.totalAmount",
        to: "double",
        onError: 0,
        onNull: 0,
      },
    };
    const numericShippingExpr = {
      $convert: {
        input: "$orderData.shippingCost",
        to: "double",
        onError: 0,
        onNull: 0,
      },
    };

    return coll
      .aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalAmount: {
              $sum: {
                $cond: [
                  { $ne: ["$status", "cancelled"] },
                  numericTotalAmountExpr,
                  0,
                ],
              },
            },
            totalAmountConfirmed: {
              $sum: {
                $cond: [
                  { $in: ["$status", confirmedStatuses] },
                  numericTotalAmountExpr,
                  0,
                ],
              },
            },
            totalShipping: {
              $sum: {
                $cond: [
                  { $ne: ["$status", "cancelled"] },
                  numericShippingExpr,
                  0,
                ],
              },
            },
            confirmedOrders: {
              $sum: {
                $cond: [{ $in: ["$status", confirmedStatuses] }, 1, 0],
              },
            },
          },
        },
      ])
      .toArray()
      .then((mongoResult) => {
        if (shouldShadowRead()) {
          void readPostgresDocs(filter)
            .then((pgDocs) => {
              const pgResult = computeTotalsFromDocs(pgDocs, options.confirmedStatuses);
              if (safeStringify(mongoResult) !== safeStringify(pgResult)) {
                console.warn(
                  `[OrderRepository] Shadow totals aggregate mismatch for ${safeStringify(filter)}`,
                );
              }
            })
            .catch((error) => {
              console.warn(
                "[OrderRepository] Shadow totals aggregate failed:",
                error?.message || error,
              );
            });
        }
        return mongoResult;
      });
  }

  async function aggregatePageSummaries(filter = {}) {
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresDocs(filter);
        return computePageSummariesFromDocs(docs);
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "OrderRepository",
          operation: "page summary aggregate",
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const coll = await getCollection();
    const pipeline = [];
    if (filter && Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }
    pipeline.push(
      {
        $project: {
          platform: {
            $toLower: { $ifNull: ["$platform", "line"] },
          },
          botIdText: {
            $trim: {
              input: {
                $convert: {
                  input: "$botId",
                  to: "string",
                  onError: "",
                  onNull: "",
                },
              },
            },
          },
          extractedAt: "$extractedAt",
        },
      },
      {
        $group: {
          _id: {
            platform: "$platform",
            botIdText: "$botIdText",
          },
          orderCount: { $sum: 1 },
          lastOrderAt: { $max: "$extractedAt" },
        },
      },
    );
    return coll.aggregate(pipeline).toArray().then((mongoResult) => {
      if (shouldShadowRead()) {
        void readPostgresDocs(filter)
          .then((pgDocs) => {
            const pgResult = computePageSummariesFromDocs(pgDocs);
            if (
              safeStringify(normalizePageSummaryResult(mongoResult))
              !== safeStringify(normalizePageSummaryResult(pgResult))
            ) {
              console.warn(
                `[OrderRepository] Shadow page summary mismatch for ${safeStringify(filter)}`,
              );
            }
          })
          .catch((error) => {
            console.warn(
              "[OrderRepository] Shadow page summary failed:",
              error?.message || error,
            );
          });
      }
      return mongoResult;
    });
  }

  async function getFrequentProductNames(filter = {}, limit = 50) {
    if (shouldReadPrimary()) {
      try {
        const docs = await readPostgresDocs(filter);
        return computeFrequentProductNamesFromDocs(docs, limit);
      } catch (error) {
        warnPrimaryReadFailure({
          repository: "OrderRepository",
          operation: "product aggregate",
          canUseMongo: canUseMongo(),
          error,
        });
      }
    }

    if (!canUseMongo()) {
      return [];
    }

    const coll = await getCollection();
    return coll
      .aggregate([
        { $match: filter },
        { $unwind: { path: "$orderData.items", preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: "$orderData.items.product",
            count: { $sum: 1 },
            lastUsed: { $max: "$extractedAt" },
          },
        },
        { $match: { _id: { $ne: null, $ne: "", $type: "string" } } },
        { $sort: { count: -1, lastUsed: -1 } },
        { $limit: limit },
      ])
      .toArray()
      .then((mongoResult) => {
        if (shouldShadowRead()) {
          void readPostgresDocs(filter)
            .then((pgDocs) => {
              const pgResult = computeFrequentProductNamesFromDocs(pgDocs, limit);
              if (safeStringify(mongoResult) !== safeStringify(pgResult)) {
                console.warn(
                  `[OrderRepository] Shadow product aggregate mismatch for ${safeStringify(filter)}`,
                );
              }
            })
            .catch((error) => {
              console.warn(
                "[OrderRepository] Shadow product aggregate failed:",
                error?.message || error,
              );
            });
        }
        return mongoResult;
      });
  }

  async function updateById(orderId, update, options = {}) {
    const normalizedUpdate = normalizeUpdateDocument(update);
    const filter = buildMongoIdQuery(orderId);

    if (!canUseMongo()) {
      if (!canUsePostgres()) {
        throw new Error("MongoDB is disabled and PostgreSQL is not configured");
      }
      const existing = await findById(orderId);
      if (!existing) {
        return { matchedCount: 0, modifiedCount: 0, document: null };
      }
      const updatedDoc = applyMongoStyleUpdate(existing, normalizedUpdate);
      updatedDoc._id = toLegacyId(existing._id) || toLegacyId(orderId);
      updatedDoc.updatedAt = new Date();
      await syncDoc(updatedDoc, { force: true });
      const saved = await findById(updatedDoc._id);
      return {
        matchedCount: 1,
        modifiedCount: 1,
        document: saved || updatedDoc,
      };
    }

    const coll = await getCollection();
    const result = await coll.updateOne(filter, normalizedUpdate, options);
    if (result.matchedCount === 0) {
      return { matchedCount: 0, modifiedCount: 0, document: null };
    }
    const updatedDoc = await coll.findOne(filter);
    await syncDoc(updatedDoc).catch((error) => {
      console.warn("[OrderRepository] Update dual-write failed:", error?.message || error);
    });
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      document: updatedDoc,
    };
  }

  async function updateManyByIds(orderIds = [], update, options = {}) {
    const filter = buildIdsFilter(orderIds);
    if (!filter) {
      return { matchedCount: 0, modifiedCount: 0, documents: [] };
    }

    const normalizedUpdate = normalizeUpdateDocument(update);
    if (!canUseMongo()) {
      if (!canUsePostgres()) {
        throw new Error("MongoDB is disabled and PostgreSQL is not configured");
      }
      const docs = await findByIds(orderIds);
      if (docs.length === 0) {
        return { matchedCount: 0, modifiedCount: 0, documents: [] };
      }
      const updatedDocs = [];
      for (const doc of docs) {
        const updatedDoc = applyMongoStyleUpdate(doc, normalizedUpdate);
        updatedDoc._id = toLegacyId(doc._id);
        updatedDoc.updatedAt = new Date();
        await syncDoc(updatedDoc, { force: true });
        updatedDocs.push((await findById(updatedDoc._id)) || updatedDoc);
      }
      return {
        matchedCount: docs.length,
        modifiedCount: updatedDocs.length,
        documents: updatedDocs,
      };
    }

    const coll = await getCollection();
    const matchedDocs = await coll
      .find(filter, { projection: { _id: 1 } })
      .toArray();

    if (matchedDocs.length === 0) {
      return { matchedCount: 0, modifiedCount: 0, documents: [] };
    }

    const result = await coll.updateMany(filter, normalizedUpdate, options);
    const updatedDocs = await coll.find(filter).toArray();

    if (shouldDualWrite() && updatedDocs.length > 0) {
      await Promise.all(
        updatedDocs.map((doc) =>
          syncDoc(doc).catch((error) => {
            console.warn("[OrderRepository] Bulk update dual-write failed:", error?.message || error);
          }),
        ),
      );
    }

    return {
      matchedCount: matchedDocs.length,
      modifiedCount: result.modifiedCount,
      documents: updatedDocs,
    };
  }

  async function deleteById(orderId) {
    if (!canUseMongo()) {
      if (!canUsePostgres()) {
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

    const coll = await getCollection();
    const result = await coll.deleteOne(buildMongoIdQuery(orderId));
    if (result.deletedCount > 0 && shouldDualWrite()) {
      await deletePostgresOrderByLegacyId({ query }, orderId).catch((error) => {
        console.warn("[OrderRepository] Delete dual-write failed:", error?.message || error);
      });
    }
    return result;
  }

  async function deleteManyByIds(orderIds = []) {
    const filter = buildIdsFilter(orderIds);
    if (!filter) {
      return { deletedCount: 0, documents: [] };
    }

    if (!canUseMongo()) {
      if (!canUsePostgres()) {
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

    const coll = await getCollection();
    const docs = await coll.find(filter).toArray();
    if (docs.length === 0) {
      return { deletedCount: 0, documents: [] };
    }

    const result = await coll.deleteMany(filter);
    if (result.deletedCount > 0 && shouldDualWrite()) {
      await Promise.all(
        docs.map((doc) =>
          deletePostgresOrderByLegacyId({ query }, doc?._id).catch((error) => {
            console.warn("[OrderRepository] Bulk delete dual-write failed:", error?.message || error);
          }),
        ),
      );
    }

    return {
      deletedCount: result.deletedCount,
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
    list,
    getFrequentProductNames,
    updateById,
    updateManyByIds,
  };
}

module.exports = {
  createOrderRepository,
};
