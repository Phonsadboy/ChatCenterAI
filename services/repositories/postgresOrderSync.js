const { normalizeJson, normalizePlatform, toLegacyId } = require("./shared");
const { resolvePgBotId } = require("./postgresRefs");

function buildOrderTotals(doc = {}) {
  const orderData = doc?.orderData || {};
  return {
    totalAmount: orderData?.totalAmount ?? null,
    shippingCost: orderData?.shippingCost ?? null,
  };
}

async function replaceOrderItems(executor, orderId, items = []) {
  await executor.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    await executor.query(
      `
        INSERT INTO order_items (
          order_id,
          line_number,
          product_name,
          quantity,
          price,
          payload
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      `,
      [
        orderId,
        index,
        item?.product || item?.name || "",
        Number(item?.quantity || 0),
        Number(item?.price || 0),
        JSON.stringify(normalizeJson(item, {})),
      ],
    );
  }
}

async function upsertPostgresOrderDocument(executor, doc = {}) {
  const legacyOrderId = toLegacyId(doc?._id);
  if (!legacyOrderId) return null;

  const platform = normalizePlatform(doc?.platform);
  const pgBotId = await resolvePgBotId(executor, platform, doc?.botId);
  const extractedAt =
    doc?.extractedAt || doc?.createdAt || doc?.updatedAt || new Date();
  const createdAt = doc?.createdAt || extractedAt || new Date();
  const updatedAt = doc?.updatedAt || extractedAt || new Date();

  const result = await executor.query(
    `
      INSERT INTO orders (
        legacy_order_id,
        legacy_user_id,
        bot_id,
        platform,
        status,
        totals,
        order_data,
        extracted_at,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
      ON CONFLICT (legacy_order_id) DO UPDATE SET
        legacy_user_id = EXCLUDED.legacy_user_id,
        bot_id = EXCLUDED.bot_id,
        platform = EXCLUDED.platform,
        status = EXCLUDED.status,
        totals = EXCLUDED.totals,
        order_data = EXCLUDED.order_data,
        extracted_at = EXCLUDED.extracted_at,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
    [
      legacyOrderId,
      toLegacyId(doc?.userId),
      pgBotId,
      platform,
      doc?.status || "pending",
      JSON.stringify(buildOrderTotals(doc)),
      JSON.stringify(
        normalizeJson(
          {
            ...(doc?.orderData || {}),
            notes: doc?.notes || null,
            extractedFrom: doc?.extractedFrom || null,
            isManualExtraction: Boolean(doc?.isManualExtraction),
            notificationStatus: doc?.notificationStatus || "pending",
            notificationSentAt: doc?.notificationSentAt || null,
          },
          {},
        ),
      ),
      extractedAt,
      createdAt,
      updatedAt,
    ],
  );

  await replaceOrderItems(
    executor,
    result.rows[0].id,
    Array.isArray(doc?.orderData?.items) ? doc.orderData.items : [],
  );

  return result.rows[0].id;
}

async function deletePostgresOrderByLegacyId(executor, orderId) {
  const legacyOrderId = toLegacyId(orderId);
  if (!legacyOrderId) return;
  await executor.query("DELETE FROM orders WHERE legacy_order_id = $1", [legacyOrderId]);
}

module.exports = {
  deletePostgresOrderByLegacyId,
  upsertPostgresOrderDocument,
};
