const { isPostgresConfigured, query } = require("../../infra/postgres");
const {
  safeStringify,
  toLegacyId,
} = require("./shared");

function normalizeSessionDoc(doc = {}) {
  return {
    _id: toLegacyId(doc.id || doc._id || doc.sessionId || doc.session_id),
    sessionId: toLegacyId(doc.sessionId || doc.session_id),
    instructionId: toLegacyId(doc.instructionId || doc.instruction_id),
    instructionName:
      typeof doc.instructionName === "string"
        ? doc.instructionName
        : typeof doc.instruction_name === "string"
          ? doc.instruction_name
          : "",
    history: Array.isArray(doc.history) ? doc.history : [],
    model: typeof doc.model === "string" ? doc.model : "",
    thinking: typeof doc.thinking === "string" ? doc.thinking : "",
    totalTokens: Number(doc.totalTokens || doc.total_tokens || 0),
    totalChanges: Number(doc.totalChanges || doc.total_changes || 0),
    username: typeof doc.username === "string" ? doc.username : "admin",
    createdAt: doc.createdAt || doc.created_at || null,
    updatedAt: doc.updatedAt || doc.updated_at || null,
  };
}

function normalizeAuditDoc(doc = {}) {
  return {
    _id: toLegacyId(doc.id || doc._id),
    sessionId: toLegacyId(doc.sessionId || doc.session_id),
    instructionId: toLegacyId(doc.instructionId || doc.instruction_id),
    username: typeof doc.username === "string" ? doc.username : "admin",
    timestamp: doc.timestamp || null,
    message: typeof doc.message === "string" ? doc.message : "",
    model: typeof doc.model === "string" ? doc.model : "",
    thinking: typeof doc.thinking === "string" ? doc.thinking : "",
    effort: typeof doc.effort === "string" ? doc.effort : "",
    toolsUsed: Array.isArray(doc.toolsUsed || doc.tools_used)
      ? (doc.toolsUsed || doc.tools_used)
      : [],
    changes: Array.isArray(doc.changes) ? doc.changes : [],
    usage: doc.usage && typeof doc.usage === "object" ? doc.usage : {},
    responseLength: Number(doc.responseLength || doc.response_length || 0),
    versionSnapshot:
      doc.versionSnapshot && typeof doc.versionSnapshot === "object"
        ? doc.versionSnapshot
        : doc.version_snapshot && typeof doc.version_snapshot === "object"
          ? doc.version_snapshot
          : null,
  };
}

function normalizeChangelogDoc(doc = {}) {
  return {
    _id: toLegacyId(doc.id || doc._id || doc.changeId || doc.change_id),
    changeId: toLegacyId(doc.changeId || doc.change_id),
    sessionId: toLegacyId(doc.sessionId || doc.session_id),
    instructionId: toLegacyId(doc.instructionId || doc.instruction_id),
    timestamp: doc.timestamp || doc.created_at || null,
    tool: typeof doc.tool === "string" ? doc.tool : "",
    params: doc.params && typeof doc.params === "object" ? doc.params : {},
    before: doc.before && typeof doc.before === "object"
      ? doc.before
      : doc.before_state && typeof doc.before_state === "object"
        ? doc.before_state
        : null,
    after: doc.after && typeof doc.after === "object"
      ? doc.after
      : doc.after_state && typeof doc.after_state === "object"
        ? doc.after_state
        : null,
    undone: doc.undone === true,
    undoneAt: doc.undoneAt || doc.undone_at || null,
  };
}

function createInstructionChatStateRepository() {
  function ensurePostgres() {
    if (!isPostgresConfigured()) {
      throw new Error("instruction_chat_state_storage_requires_postgres");
    }
  }

  async function saveSession(doc = {}) {
    ensurePostgres();
    const normalized = normalizeSessionDoc(doc);
    if (!normalized.sessionId || !normalized.instructionId) {
      throw new Error("sessionId and instructionId are required");
    }
    const createdAt = normalized.createdAt || new Date();
    const updatedAt = normalized.updatedAt || new Date();
    await query(
      `
        INSERT INTO instruction_chat_sessions (
          session_id,
          instruction_id,
          instruction_name,
          history,
          model,
          thinking,
          total_tokens,
          total_changes,
          username,
          created_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11
        )
        ON CONFLICT (session_id) DO UPDATE SET
          instruction_id = EXCLUDED.instruction_id,
          instruction_name = EXCLUDED.instruction_name,
          history = EXCLUDED.history,
          model = EXCLUDED.model,
          thinking = EXCLUDED.thinking,
          total_tokens = EXCLUDED.total_tokens,
          total_changes = EXCLUDED.total_changes,
          username = EXCLUDED.username,
          updated_at = EXCLUDED.updated_at
      `,
      [
        normalized.sessionId,
        normalized.instructionId,
        normalized.instructionName,
        safeStringify(normalized.history),
        normalized.model,
        normalized.thinking,
        normalized.totalTokens,
        normalized.totalChanges,
        normalized.username,
        createdAt,
        updatedAt,
      ],
    );
    return normalized;
  }

  async function listSessions({ instructionId } = {}, { limit = 50 } = {}) {
    ensurePostgres();
    const normalizedInstructionId = toLegacyId(instructionId);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const params = [];
    let whereSql = "";
    if (normalizedInstructionId) {
      params.push(normalizedInstructionId);
      whereSql = `WHERE instruction_id = $${params.length}`;
    }
    params.push(safeLimit);
    const result = await query(
      `
        SELECT
          id::text AS id,
          session_id,
          instruction_id,
          instruction_name,
          history,
          model,
          thinking,
          total_tokens,
          total_changes,
          username,
          created_at,
          updated_at
        FROM instruction_chat_sessions
        ${whereSql}
        ORDER BY updated_at DESC, session_id ASC
        LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map((row) => normalizeSessionDoc(row));
  }

  async function getSession(sessionId) {
    ensurePostgres();
    const normalizedSessionId = toLegacyId(sessionId);
    if (!normalizedSessionId) return null;
    const result = await query(
      `
        SELECT
          id::text AS id,
          session_id,
          instruction_id,
          instruction_name,
          history,
          model,
          thinking,
          total_tokens,
          total_changes,
          username,
          created_at,
          updated_at
        FROM instruction_chat_sessions
        WHERE session_id = $1
        LIMIT 1
      `,
      [normalizedSessionId],
    );
    return result.rows[0] ? normalizeSessionDoc(result.rows[0]) : null;
  }

  async function deleteSessions({ sessionId, instructionId } = {}) {
    ensurePostgres();
    const normalizedSessionId = toLegacyId(sessionId);
    const normalizedInstructionId = toLegacyId(instructionId);
    if (normalizedInstructionId) {
      const result = await query(
        `
          DELETE FROM instruction_chat_sessions
          WHERE instruction_id = $1
        `,
        [normalizedInstructionId],
      );
      return { deletedCount: result.rowCount || 0 };
    }
    if (!normalizedSessionId) return { deletedCount: 0 };
    const result = await query(
      `
        DELETE FROM instruction_chat_sessions
        WHERE session_id = $1
      `,
      [normalizedSessionId],
    );
    return { deletedCount: result.rowCount || 0 };
  }

  async function createAuditLog(doc = {}) {
    ensurePostgres();
    const normalized = normalizeAuditDoc(doc);
    const timestamp = normalized.timestamp || new Date();
    await query(
      `
        INSERT INTO instruction_chat_audit (
          session_id,
          instruction_id,
          username,
          timestamp,
          message,
          model,
          thinking,
          effort,
          tools_used,
          changes,
          usage,
          response_length,
          version_snapshot,
          created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb,$4
        )
      `,
      [
        normalized.sessionId,
        normalized.instructionId,
        normalized.username,
        timestamp,
        normalized.message,
        normalized.model,
        normalized.thinking,
        normalized.effort,
        safeStringify(normalized.toolsUsed),
        safeStringify(normalized.changes),
        safeStringify(normalized.usage),
        normalized.responseLength,
        safeStringify(normalized.versionSnapshot),
      ],
    );
    return normalized;
  }

  async function listAuditLogs({ instructionId, limit = 50 } = {}) {
    ensurePostgres();
    const normalizedInstructionId = toLegacyId(instructionId);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const params = [];
    let whereSql = "";
    if (normalizedInstructionId) {
      params.push(normalizedInstructionId);
      whereSql = `WHERE instruction_id = $${params.length}`;
    }
    params.push(safeLimit);
    const result = await query(
      `
        SELECT
          id::text AS id,
          session_id,
          instruction_id,
          username,
          timestamp,
          message,
          model,
          thinking,
          effort,
          tools_used,
          changes,
          usage,
          response_length,
          version_snapshot
        FROM instruction_chat_audit
        ${whereSql}
        ORDER BY timestamp DESC, id DESC
        LIMIT $${params.length}
      `,
      params,
    );
    return result.rows.map((row) => normalizeAuditDoc(row));
  }

  async function createChangelogEntry(doc = {}) {
    ensurePostgres();
    const normalized = normalizeChangelogDoc(doc);
    if (!normalized.changeId || !normalized.sessionId || !normalized.instructionId) {
      throw new Error("changeId, sessionId, and instructionId are required");
    }
    const timestamp = normalized.timestamp || new Date();
    await query(
      `
        INSERT INTO instruction_chat_changelog (
          change_id,
          session_id,
          instruction_id,
          timestamp,
          tool,
          params,
          before_state,
          after_state,
          undone,
          undone_at,
          created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$4
        )
        ON CONFLICT (change_id) DO UPDATE SET
          session_id = EXCLUDED.session_id,
          instruction_id = EXCLUDED.instruction_id,
          timestamp = EXCLUDED.timestamp,
          tool = EXCLUDED.tool,
          params = EXCLUDED.params,
          before_state = EXCLUDED.before_state,
          after_state = EXCLUDED.after_state,
          undone = EXCLUDED.undone,
          undone_at = EXCLUDED.undone_at
      `,
      [
        normalized.changeId,
        normalized.sessionId,
        normalized.instructionId,
        timestamp,
        normalized.tool,
        safeStringify(normalized.params),
        safeStringify(normalized.before),
        safeStringify(normalized.after),
        normalized.undone,
        normalized.undoneAt,
      ],
    );
    return normalized;
  }

  async function listChangelog(sessionId) {
    ensurePostgres();
    const normalizedSessionId = toLegacyId(sessionId);
    if (!normalizedSessionId) return [];
    const result = await query(
      `
        SELECT
          id::text AS id,
          change_id,
          session_id,
          instruction_id,
          timestamp,
          tool,
          params,
          before_state,
          after_state,
          undone,
          undone_at
        FROM instruction_chat_changelog
        WHERE session_id = $1
        ORDER BY timestamp DESC, id DESC
      `,
      [normalizedSessionId],
    );
    return result.rows.map((row) => normalizeChangelogDoc(row));
  }

  async function getActiveChange(changeId) {
    ensurePostgres();
    const normalizedChangeId = toLegacyId(changeId);
    if (!normalizedChangeId) return null;
    const result = await query(
      `
        SELECT
          id::text AS id,
          change_id,
          session_id,
          instruction_id,
          timestamp,
          tool,
          params,
          before_state,
          after_state,
          undone,
          undone_at
        FROM instruction_chat_changelog
        WHERE change_id = $1
          AND undone = FALSE
        LIMIT 1
      `,
      [normalizedChangeId],
    );
    return result.rows[0] ? normalizeChangelogDoc(result.rows[0]) : null;
  }

  async function markChangeUndone(changeId, undoneAt = new Date()) {
    ensurePostgres();
    const normalizedChangeId = toLegacyId(changeId);
    if (!normalizedChangeId) return { modifiedCount: 0 };
    const result = await query(
      `
        UPDATE instruction_chat_changelog
        SET undone = TRUE,
            undone_at = $2
        WHERE change_id = $1
      `,
      [normalizedChangeId, undoneAt],
    );
    return { modifiedCount: result.rowCount || 0 };
  }

  return {
    createAuditLog,
    createChangelogEntry,
    deleteSessions,
    getActiveChange,
    getSession,
    listAuditLogs,
    listChangelog,
    listSessions,
    markChangeUndone,
    saveSession,
  };
}

module.exports = {
  createInstructionChatStateRepository,
  normalizeAuditDoc,
  normalizeChangelogDoc,
  normalizeSessionDoc,
};
