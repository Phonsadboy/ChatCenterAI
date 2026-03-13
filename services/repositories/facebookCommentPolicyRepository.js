const { isPostgresConfigured, query } = require("../../infra/postgres");
const { resolvePgBotId } = require("./postgresRefs");
const {
  safeStringify,
  toLegacyId,
} = require("./shared");

function buildDefaultFacebookCommentPolicy() {
  return {
    mode: "off",
    templateMessage: "",
    aiModel: "",
    systemPrompt: "",
    privateReplyTemplate: "",
    pullToChat: false,
    sendPrivateReply: false,
    isActive: false,
    status: "off",
    overridePageDefault: false,
    scope: "page_default",
  };
}

function normalizeFacebookCommentPolicyDoc(doc = {}) {
  const metadata =
    doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
  const defaults = buildDefaultFacebookCommentPolicy();
  const scope =
    typeof doc.scope === "string" && doc.scope.trim()
      ? doc.scope.trim()
      : typeof metadata.scope === "string" && metadata.scope.trim()
        ? metadata.scope.trim()
        : "page_default";
  const mode =
    typeof doc.mode === "string" && doc.mode.trim()
      ? doc.mode.trim()
      : typeof metadata.mode === "string" && metadata.mode.trim()
        ? metadata.mode.trim()
        : defaults.mode;
  const status =
    typeof doc.status === "string" && doc.status.trim()
      ? doc.status.trim()
      : typeof metadata.status === "string" && metadata.status.trim()
        ? metadata.status.trim()
        : mode === "off"
          ? "off"
          : defaults.status;

  return {
    _id: toLegacyId(doc._id || doc.id || metadata._id),
    botId: toLegacyId(doc.botId || doc.legacy_bot_id || metadata.botId),
    pageId:
      typeof doc.pageId === "string"
        ? doc.pageId
        : typeof doc.page_id === "string"
          ? doc.page_id
          : typeof metadata.pageId === "string"
            ? metadata.pageId
            : "",
    scope,
    mode,
    templateMessage:
      typeof doc.templateMessage === "string"
        ? doc.templateMessage
        : typeof doc.template_message === "string"
          ? doc.template_message
          : typeof metadata.templateMessage === "string"
            ? metadata.templateMessage
            : defaults.templateMessage,
    aiModel:
      typeof doc.aiModel === "string"
        ? doc.aiModel
        : typeof doc.ai_model === "string"
          ? doc.ai_model
          : typeof metadata.aiModel === "string"
            ? metadata.aiModel
            : defaults.aiModel,
    systemPrompt:
      typeof doc.systemPrompt === "string"
        ? doc.systemPrompt
        : typeof doc.system_prompt === "string"
          ? doc.system_prompt
          : typeof metadata.systemPrompt === "string"
            ? metadata.systemPrompt
            : defaults.systemPrompt,
    privateReplyTemplate:
      typeof doc.privateReplyTemplate === "string"
        ? doc.privateReplyTemplate
        : typeof doc.private_reply_template === "string"
          ? doc.private_reply_template
          : typeof metadata.privateReplyTemplate === "string"
            ? metadata.privateReplyTemplate
            : defaults.privateReplyTemplate,
    pullToChat:
      typeof doc.pullToChat === "boolean"
        ? doc.pullToChat
        : typeof doc.pull_to_chat === "boolean"
          ? doc.pull_to_chat
          : metadata.pullToChat === true,
    sendPrivateReply:
      typeof doc.sendPrivateReply === "boolean"
        ? doc.sendPrivateReply
        : typeof doc.send_private_reply === "boolean"
          ? doc.send_private_reply
          : metadata.sendPrivateReply === true,
    isActive:
      typeof doc.isActive === "boolean"
        ? doc.isActive
        : typeof doc.is_active === "boolean"
          ? doc.is_active
          : status === "active",
    status,
    overridePageDefault:
      typeof doc.overridePageDefault === "boolean"
        ? doc.overridePageDefault
        : typeof metadata.overridePageDefault === "boolean"
          ? metadata.overridePageDefault
          : defaults.overridePageDefault,
    createdAt: doc.createdAt || doc.created_at || metadata.createdAt || null,
    updatedAt: doc.updatedAt || doc.updated_at || metadata.updatedAt || null,
    metadata,
  };
}

function createFacebookCommentPolicyRepository() {
  function ensurePostgres() {
    if (!isPostgresConfigured()) {
      throw new Error("facebook_comment_policy_storage_requires_postgres");
    }
  }

  async function readPostgresPolicy(botId, scope = "page_default") {
    ensurePostgres();
    const legacyBotId = toLegacyId(botId);
    if (!legacyBotId) return null;
    const result = await query(
      `
        SELECT
          id::text AS id,
          legacy_bot_id,
          page_id,
          scope,
          mode,
          template_message,
          ai_model,
          system_prompt,
          private_reply_template,
          pull_to_chat,
          send_private_reply,
          is_active,
          status,
          metadata,
          created_at,
          updated_at
        FROM facebook_comment_policies
        WHERE legacy_bot_id = $1
          AND scope = $2
        LIMIT 1
      `,
      [legacyBotId, scope],
    );
    return result.rows[0]
      ? normalizeFacebookCommentPolicyDoc(result.rows[0])
      : null;
  }

  async function getPageDefaultPolicy(botId) {
    return readPostgresPolicy(botId, "page_default");
  }

  async function upsertPageDefaultPolicy(botId, payload = {}) {
    ensurePostgres();
    const legacyBotId = toLegacyId(botId);
    if (!legacyBotId) {
      throw new Error("facebook_comment_policy_requires_bot_id");
    }

    const now = new Date();
    const normalized = normalizeFacebookCommentPolicyDoc({
      ...payload,
      botId: legacyBotId,
      scope: "page_default",
      updatedAt: now,
    });
    const metadata = {
      pageId: normalized.pageId || "",
      mode: normalized.mode,
      templateMessage: normalized.templateMessage,
      aiModel: normalized.aiModel,
      systemPrompt: normalized.systemPrompt,
      privateReplyTemplate: normalized.privateReplyTemplate,
      pullToChat: normalized.pullToChat,
      sendPrivateReply: normalized.sendPrivateReply,
      isActive: normalized.isActive,
      status: normalized.status,
      overridePageDefault: false,
    };

    const pgBotId = await resolvePgBotId({ query }, "facebook", legacyBotId).catch(() => null);
    await query(
      `
        INSERT INTO facebook_comment_policies (
          bot_id,
          legacy_bot_id,
          page_id,
          scope,
          mode,
          template_message,
          ai_model,
          system_prompt,
          private_reply_template,
          pull_to_chat,
          send_private_reply,
          is_active,
          status,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16
        )
        ON CONFLICT (legacy_bot_id, scope) DO UPDATE SET
          bot_id = EXCLUDED.bot_id,
          page_id = EXCLUDED.page_id,
          mode = EXCLUDED.mode,
          template_message = EXCLUDED.template_message,
          ai_model = EXCLUDED.ai_model,
          system_prompt = EXCLUDED.system_prompt,
          private_reply_template = EXCLUDED.private_reply_template,
          pull_to_chat = EXCLUDED.pull_to_chat,
          send_private_reply = EXCLUDED.send_private_reply,
          is_active = EXCLUDED.is_active,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `,
      [
        pgBotId,
        legacyBotId,
        normalized.pageId || "",
        "page_default",
        normalized.mode,
        normalized.templateMessage,
        normalized.aiModel,
        normalized.systemPrompt,
        normalized.privateReplyTemplate,
        normalized.pullToChat,
        normalized.sendPrivateReply,
        normalized.isActive,
        normalized.status,
        safeStringify(metadata),
        normalized.createdAt || now,
        normalized.updatedAt || now,
      ],
    );

    return {
      ...normalized,
      scope: "page_default",
      metadata,
    };
  }

  return {
    getPageDefaultPolicy,
    normalizeFacebookCommentPolicyDoc,
    upsertPageDefaultPolicy,
  };
}

module.exports = {
  buildDefaultFacebookCommentPolicy,
  createFacebookCommentPolicyRepository,
  normalizeFacebookCommentPolicyDoc,
};
