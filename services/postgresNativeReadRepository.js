"use strict";

function normalizeString(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value.trim();
  if (typeof value.toString === "function") return value.toString().trim();
  return String(value).trim();
}

function normalizePlatform(value, fallback = "line") {
  return normalizeString(value).toLowerCase() || fallback;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function parseOrderPageKey(pageKey) {
  const raw = normalizeString(pageKey);
  if (!raw) return { platform: "", botId: null };
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex < 0) {
    return { platform: "", botId: raw || null };
  }
  const platform = raw.slice(0, separatorIndex).trim().toLowerCase();
  const botPart = raw.slice(separatorIndex + 1).trim();
  return {
    platform,
    botId: !botPart || botPart === "default" ? null : botPart,
  };
}

function addParam(params, value) {
  params.push(value);
  return `$${params.length}`;
}

function buildOrderWhere(filters = {}) {
  const clauses = [];
  const params = [];
  const pageKeyParam = filters.pageKey;

  if (pageKeyParam && pageKeyParam !== "all") {
    const pageKeys = (Array.isArray(pageKeyParam)
      ? pageKeyParam
      : String(pageKeyParam).split(","))
      .map((key) => key.trim())
      .filter(Boolean);

    const pageClauses = pageKeys
      .map((key) => {
        if (!key.includes(":")) {
          const botParam = addParam(params, key);
          return `(bot_id = ${botParam})`;
        }
        const parsed = parseOrderPageKey(key);
        if (!parsed.platform) return "";
        const platformParam = addParam(params, parsed.platform);
        if (!parsed.botId) {
          return `(platform = ${platformParam} AND (bot_id IS NULL OR bot_id = ''))`;
        }
        const botParam = addParam(params, parsed.botId);
        return `(platform = ${platformParam} AND bot_id = ${botParam})`;
      })
      .filter(Boolean);

    if (pageClauses.length) {
      clauses.push(`(${pageClauses.join(" OR ")})`);
    }
  } else {
    if (filters.platform && filters.platform !== "all") {
      clauses.push(`platform = ${addParam(params, normalizePlatform(filters.platform))}`);
    }
    if (
      typeof filters.botId === "string" &&
      filters.botId &&
      filters.botId !== "all"
    ) {
      if (filters.botId === "default") {
        clauses.push("(bot_id IS NULL OR bot_id = '')");
      } else {
        clauses.push(`bot_id = ${addParam(params, filters.botId)}`);
      }
    }
  }

  if (filters.selectedIds) {
    const ids = String(filters.selectedIds)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length) {
      clauses.push(`id = ANY(${addParam(params, ids)}::text[])`);
    }
  }

  if (filters.status && filters.status !== "all") {
    clauses.push(`status = ${addParam(params, filters.status)}`);
  }

  const timezone = "Asia/Bangkok";
  let startDate = null;
  let endDate = null;
  if (filters.todayOnly === "true") {
    const now = new Date();
    const bangkokNow = new Date(
      now.toLocaleString("en-US", { timeZone: timezone }),
    );
    bangkokNow.setHours(0, 0, 0, 0);
    startDate = bangkokNow.toISOString();
    const bangkokEnd = new Date(bangkokNow);
    bangkokEnd.setHours(23, 59, 59, 999);
    endDate = bangkokEnd.toISOString();
  } else {
    startDate = normalizeDate(filters.startDate);
    endDate = normalizeDate(filters.endDate);
  }
  if (startDate) {
    clauses.push(`extracted_at >= ${addParam(params, startDate)}::timestamptz`);
  }
  if (endDate) {
    clauses.push(`extracted_at <= ${addParam(params, endDate)}::timestamptz`);
  }

  return {
    params,
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
  };
}

function normalizeOrderRow(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const orderData =
    row.order_data && typeof row.order_data === "object" ? row.order_data : {};
  return {
    ...payload,
    _id: row.id,
    id: row.id,
    userId: row.user_id || payload.userId || "",
    platform: row.platform || payload.platform || "line",
    botId: row.bot_id || payload.botId || null,
    status: row.status || payload.status || "pending",
    orderData: {
      ...orderData,
      totalAmount:
        row.total_amount === null || typeof row.total_amount === "undefined"
          ? orderData.totalAmount
          : Number(row.total_amount),
      shippingCost:
        row.shipping_cost === null || typeof row.shipping_cost === "undefined"
          ? orderData.shippingCost
          : Number(row.shipping_cost),
    },
    notes: row.notes || payload.notes || "",
    isManualExtraction: !!row.is_manual_extraction,
    extractedFrom: row.extracted_from || payload.extractedFrom || null,
    extractedAt: row.extracted_at || payload.extractedAt || null,
  };
}

function buildOpenAiUsageWhere(filters = {}) {
  const params = [
    filters.startMoment.toDate().toISOString(),
    filters.endMoment.toDate().toISOString(),
  ];
  const clauses = [
    "usage_at >= $1::timestamptz",
    "usage_at <= $2::timestamptz",
  ];

  if (filters.keyId) clauses.push(`api_key_id = ${addParam(params, filters.keyId)}`);
  if (filters.botId) clauses.push(`bot_id = ${addParam(params, filters.botId)}`);
  if (filters.platform) {
    clauses.push(`platform = ${addParam(params, filters.platform)}`);
  }
  if (filters.provider) {
    clauses.push(`provider = ${addParam(params, normalizeString(filters.provider).toLowerCase())}`);
  }

  return {
    params,
    whereSql: clauses.join(" AND "),
  };
}

function createPostgresNativeReadRepository({ postgresRuntime } = {}) {
  function isConfigured() {
    return !!(postgresRuntime && postgresRuntime.isConfigured());
  }

  async function getUserProfileNames(userIds = []) {
    if (!isConfigured() || !userIds.length) return new Map();
    const result = await postgresRuntime.query(
      `
        SELECT DISTINCT ON (user_id)
          user_id,
          display_name
        FROM user_profiles
        WHERE user_id = ANY($1::text[])
        ORDER BY user_id, updated_at DESC
      `,
      [userIds],
    );
    return new Map(
      result.rows
        .filter((row) => row.user_id)
        .map((row) => [row.user_id, row.display_name || ""]),
    );
  }

  async function queryOrders(filters = {}) {
    if (!isConfigured()) {
      return null;
    }

    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(filters.limit, 10) || 50, 1),
      200,
    );
    const offset = (page - 1) * limit;
    const sortFields = {
      extractedAt: "extracted_at",
      totalAmount: "total_amount",
      status: "status",
    };
    const sortField = sortFields[filters.sortBy] || "extracted_at";
    const sortDirection = filters.sortDir === "asc" ? "ASC" : "DESC";
    const { params, whereSql } = buildOrderWhere(filters);

    const orderParams = [...params, limit, offset];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;
    const orderBy =
      sortField === "extracted_at"
        ? `${sortField} ${sortDirection} NULLS LAST`
        : `${sortField} ${sortDirection} NULLS LAST, extracted_at DESC NULLS LAST`;

    const [ordersResult, countResult, statusResult, totalsResult] =
      await Promise.all([
        postgresRuntime.query(
          `
            SELECT
              id,
              user_id,
              platform,
              bot_id,
              status,
              total_amount,
              shipping_cost,
              order_data,
              payload,
              notes,
              is_manual_extraction,
              extracted_from,
              extracted_at
            FROM orders
            ${whereSql}
            ORDER BY ${orderBy}
            LIMIT ${limitParam}
            OFFSET ${offsetParam}
          `,
          orderParams,
        ),
        postgresRuntime.query(
          `SELECT COUNT(*)::integer AS count FROM orders ${whereSql}`,
          params,
        ),
        postgresRuntime.query(
          `
            SELECT COALESCE(status, 'unknown') AS status, COUNT(*)::integer AS count
            FROM orders
            ${whereSql}
            GROUP BY COALESCE(status, 'unknown')
          `,
          params,
        ),
        postgresRuntime.query(
          `
            SELECT
              COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN COALESCE(total_amount, 0) ELSE 0 END), 0)::float8 AS "totalAmount",
              COALESCE(SUM(CASE WHEN status IN ('confirmed', 'shipped', 'completed') THEN COALESCE(total_amount, 0) ELSE 0 END), 0)::float8 AS "totalAmountConfirmed",
              COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN COALESCE(shipping_cost, 0) ELSE 0 END), 0)::float8 AS "totalShipping",
              COUNT(*) FILTER (WHERE status IN ('confirmed', 'shipped', 'completed'))::integer AS "confirmedOrders"
            FROM orders
            ${whereSql}
          `,
          params,
        ),
      ]);

    const total = Number(countResult.rows[0]?.count || 0);
    const statusCounts = {};
    statusResult.rows.forEach((row) => {
      statusCounts[row.status || "unknown"] = Number(row.count || 0);
    });

    return {
      orders: ordersResult.rows.map((row) => normalizeOrderRow(row)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
      summary: {
        totalOrders: total,
        totalAmount: Number(totalsResult.rows[0]?.totalAmount || 0),
        totalAmountConfirmed: Number(
          totalsResult.rows[0]?.totalAmountConfirmed || 0,
        ),
        totalShipping: Number(totalsResult.rows[0]?.totalShipping || 0),
        confirmedOrders: Number(totalsResult.rows[0]?.confirmedOrders || 0),
      },
      statusCounts,
    };
  }

  async function queryOrderPageGroups() {
    if (!isConfigured()) return [];
    const rollupResult = await postgresRuntime.query(`
      SELECT
        platform,
        NULLIF(bot_id, 'default') AS bot_id,
        order_count,
        last_order_at
      FROM order_page_metrics
      ORDER BY order_count DESC, last_order_at DESC NULLS LAST
      LIMIT 500
    `);
    if (rollupResult.rows.length > 0) {
      return rollupResult.rows.map((row) => ({
        platform: row.platform || "line",
        botId: row.bot_id || null,
        orderCount: Number(row.order_count || 0),
        lastOrderAt: row.last_order_at || null,
      }));
    }

    const result = await postgresRuntime.query(`
      SELECT
        COALESCE(NULLIF(platform, ''), 'line') AS platform,
        NULLIF(bot_id, '') AS bot_id,
        COUNT(*)::integer AS order_count,
        MAX(extracted_at) AS last_order_at
      FROM orders
      GROUP BY COALESCE(NULLIF(platform, ''), 'line'), NULLIF(bot_id, '')
      ORDER BY order_count DESC, last_order_at DESC NULLS LAST
      LIMIT 500
    `);
    return result.rows.map((row) => ({
      platform: row.platform || "line",
      botId: row.bot_id || null,
      orderCount: Number(row.order_count || 0),
      lastOrderAt: row.last_order_at || null,
    }));
  }

  async function queryOpenAiUsageSummary(filters = {}) {
    if (!isConfigured()) return null;
    const { params, whereSql } = buildOpenAiUsageWhere(filters);
    const withFiltered = `
      WITH filtered AS (
        SELECT *
        FROM openai_usage_logs
        WHERE ${whereSql}
      )
    `;

    const totalsResult = await postgresRuntime.query(
      `
        ${withFiltered}
        SELECT
          COUNT(*)::integer AS "totalCalls",
          COALESCE(SUM(prompt_tokens), 0)::float8 AS "totalPromptTokens",
          COALESCE(SUM(completion_tokens), 0)::float8 AS "totalCompletionTokens",
          COALESCE(SUM(total_tokens), 0)::float8 AS "totalTokens",
          COALESCE(SUM(estimated_cost), 0)::float8 AS "totalCost",
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)::integer AS "pricedCalls",
          COUNT(*) FILTER (WHERE estimated_cost IS NULL)::integer AS "unpricedCalls"
        FROM filtered
      `,
      params,
    );

    const byModelResult = await postgresRuntime.query(
      `
        ${withFiltered}
        SELECT
          jsonb_build_object(
            'model', COALESCE(NULLIF(model, ''), 'unknown'),
            'provider', COALESCE(NULLIF(provider, ''), 'openai')
          ) AS _id,
          COUNT(*)::integer AS calls,
          COALESCE(SUM(total_tokens), 0)::float8 AS tokens,
          COALESCE(SUM(estimated_cost), 0)::float8 AS cost,
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)::integer AS "pricedCalls"
        FROM filtered
        GROUP BY COALESCE(NULLIF(model, ''), 'unknown'),
          COALESCE(NULLIF(provider, ''), 'openai')
        ORDER BY cost DESC
        LIMIT 10
      `,
      params,
    );

    const byBotWhere = filters.botId
      ? ""
      : "WHERE bot_id IS NOT NULL AND bot_id <> ''";
    const byBotResult = await postgresRuntime.query(
      `
        ${withFiltered}
        SELECT
          jsonb_build_object(
            'botId', bot_id,
            'platform', platform
          ) AS _id,
          COUNT(*)::integer AS calls,
          COALESCE(SUM(total_tokens), 0)::float8 AS tokens,
          COALESCE(SUM(estimated_cost), 0)::float8 AS cost,
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)::integer AS "pricedCalls"
        FROM filtered
        ${byBotWhere}
        GROUP BY bot_id, platform
        ORDER BY cost DESC
        LIMIT 20
      `,
      params,
    );

    const byKeyWhere = filters.keyId
      ? ""
      : "WHERE api_key_id IS NOT NULL AND api_key_id <> ''";
    const byKeyResult = await postgresRuntime.query(
      `
        ${withFiltered}
        SELECT
          api_key_id AS _id,
          COUNT(*)::integer AS calls,
          COALESCE(SUM(total_tokens), 0)::float8 AS tokens,
          COALESCE(SUM(estimated_cost), 0)::float8 AS cost,
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)::integer AS "pricedCalls"
        FROM filtered
        ${byKeyWhere}
        GROUP BY api_key_id
        ORDER BY cost DESC
      `,
      params,
    );

    const dailyResult = await postgresRuntime.query(
      `
        ${withFiltered}
        SELECT
          to_char(usage_at AT TIME ZONE $${params.length + 1}, 'YYYY-MM-DD') AS _id,
          COUNT(*)::integer AS calls,
          COALESCE(SUM(total_tokens), 0)::float8 AS tokens,
          COALESCE(SUM(estimated_cost), 0)::float8 AS cost,
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)::integer AS "pricedCalls"
        FROM filtered
        GROUP BY _id
        ORDER BY _id ASC
      `,
      [...params, "Asia/Bangkok"],
    );

    return {
      totals: totalsResult.rows,
      byModel: byModelResult.rows,
      byBot: byBotResult.rows,
      byKey: byKeyResult.rows,
      daily: dailyResult.rows,
    };
  }

  async function queryOpenAiUsageLogs(filters = {}) {
    if (!isConfigured()) return null;
    const { params, whereSql } = buildOpenAiUsageWhere(filters);
    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(filters.limit, 10) || 50, 1),
      200,
    );
    const offset = (page - 1) * limit;
    const listParams = [...params, limit, offset];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;
    const [logsResult, countResult] = await Promise.all([
      postgresRuntime.query(
        `
          SELECT
            id,
            api_key_id,
            bot_id,
            platform,
            provider,
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost,
            function_name,
            usage_at
          FROM openai_usage_logs
          WHERE ${whereSql}
          ORDER BY usage_at DESC
          LIMIT ${limitParam}
          OFFSET ${offsetParam}
        `,
        listParams,
      ),
      postgresRuntime.query(
        `
          SELECT COUNT(*)::integer AS count
          FROM openai_usage_logs
          WHERE ${whereSql}
        `,
        params,
      ),
    ]);
    const total = Number(countResult.rows[0]?.count || 0);
    return {
      logs: logsResult.rows.map((row) => ({
        _id: row.id,
        apiKeyId: row.api_key_id || null,
        botId: row.bot_id || null,
        platform: row.platform || null,
        provider: row.provider || "openai",
        model: row.model || "unknown",
        promptTokens: Number(row.prompt_tokens || 0),
        completionTokens: Number(row.completion_tokens || 0),
        totalTokens: Number(row.total_tokens || 0),
        estimatedCost:
          row.estimated_cost === null || typeof row.estimated_cost === "undefined"
            ? null
            : Number(row.estimated_cost),
        functionName: row.function_name || null,
        timestamp: row.usage_at,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  return {
    getUserProfileNames,
    isConfigured,
    queryOrderPageGroups,
    queryOpenAiUsageLogs,
    queryOpenAiUsageSummary,
    queryOrders,
  };
}

module.exports = {
  createPostgresNativeReadRepository,
};
