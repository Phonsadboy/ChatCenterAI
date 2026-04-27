"use strict";

const { PassThrough, Writable } = require("stream");
const { ObjectId } = require("bson");

const DEFAULT_SCAN_LIMIT = Math.max(
  1000,
  Number.parseInt(process.env.POSTGRES_COMPAT_SCAN_LIMIT || "50000", 10) || 50000,
);
const BANGKOK_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

const SQL_PUSH_DOWN_FIELDS = new Set([
  "_id",
  "agentId",
  "batchId",
  "botId",
  "canceled",
  "channelId",
  "completed",
  "createdAt",
  "documentId",
  "groupId",
  "id",
  "instructionId",
  "isActive",
  "isDefault",
  "key",
  "nextScheduledAt",
  "notificationStatus",
  "orderId",
  "pageKey",
  "platform",
  "requestId",
  "runId",
  "senderBotId",
  "senderId",
  "sessionId",
  "status",
  "type",
  "updatedAt",
  "usageId",
  "userId",
]);

function getDateToStringOffsetMs(timezone) {
  const tz = typeof timezone === "string" ? timezone.trim() : "";
  if (tz === "Asia/Bangkok") return BANGKOK_UTC_OFFSET_MS;
  if (tz === "UTC" || tz === "Etc/UTC" || tz === "Z") return 0;
  const match = tz.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return sign * ((hours * 60) + minutes) * 60 * 1000;
}

function formatDateToString(date, expression = {}) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(parsed.getTime())) return "";

  const format = expression.format || "%Y-%m-%d";
  const timezone = expression.timezone || "UTC";
  const shifted = new Date(parsed.getTime() + getDateToStringOffsetMs(timezone));
  const year = String(shifted.getUTCFullYear()).padStart(4, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");

  if (format === "%Y-%m-%d") return `${year}-${month}-${day}`;
  return format
    .replace(/%Y/g, year)
    .replace(/%m/g, month)
    .replace(/%d/g, day);
}

function addSqlParam(params, value) {
  params.push(value);
  return `$${params.length}`;
}

function stringifyId(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value.toHexString === "function") return value.toHexString();
  if (typeof value.toString === "function") return value.toString();
  return String(value);
}

function normalizeForJson(value) {
  if (value === null || typeof value === "undefined") return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) {
    return { type: "buffer", base64: value.toString("base64") };
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeForJson(entry));
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      output[key] = normalizeForJson(entry);
    });
    return output;
  }
  return value;
}

function normalizeFollowUpBotId(value) {
  if (value === null || typeof value === "undefined") return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function resolveDocumentId(collectionName, doc = {}) {
  if (!collectionName || !doc || typeof doc !== "object") return "";
  if (collectionName === "settings") {
    return typeof doc.key === "string" ? doc.key.trim() : "";
  }
  if (collectionName === "user_profiles") {
    const userId = typeof doc.userId === "string" ? doc.userId.trim() : "";
    const platform =
      typeof doc.platform === "string" && doc.platform.trim()
        ? doc.platform.trim()
        : "line";
    return userId ? `${userId}:${platform}` : "";
  }
  if (collectionName === "follow_up_status") {
    return typeof doc.senderId === "string" ? doc.senderId.trim() : "";
  }
  if (collectionName === "follow_up_page_settings") {
    const platform =
      typeof doc.platform === "string" ? doc.platform.trim().toLowerCase() : "";
    const botId = normalizeFollowUpBotId(doc.botId);
    return platform ? `${platform}:${botId || "default"}` : "";
  }
  if (
    collectionName === "user_tags" ||
    collectionName === "user_notes" ||
    collectionName === "user_purchase_status" ||
    collectionName === "user_unread_counts"
  ) {
    return typeof doc.userId === "string" ? doc.userId.trim() : "";
  }
  if (collectionName === "active_user_status") {
    return typeof doc.senderId === "string" ? doc.senderId.trim() : "";
  }
  return stringifyId(doc._id);
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isOperatorObject(value) {
  return isPlainObject(value) && Object.keys(value).some((key) => key.startsWith("$"));
}

function normalizeSqlValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value === "undefined") return null;
  return stringifyId(value);
}

function isSqlPushDownField(field) {
  return (
    typeof field === "string" &&
    /^[a-zA-Z0-9_.-]+$/.test(field) &&
    SQL_PUSH_DOWN_FIELDS.has(field)
  );
}

function buildPayloadTextExpression(field, params) {
  if (field === "_id") {
    return "payload->>'_id'";
  }
  if (field === "createdAt") {
    return "COALESCE(payload->>'createdAt', created_at::text)";
  }
  if (field === "updatedAt") {
    return "COALESCE(payload->>'updatedAt', updated_at::text)";
  }
  if (!String(field).includes(".")) {
    return `payload->>'${String(field).replace(/'/g, "''")}'`;
  }
  const pathSql = field
    .split(".")
    .map((part) => `'${part.replace(/'/g, "''")}'`)
    .join(", ");
  return `payload #>> ARRAY[${pathSql}]::text[]`;
}

function buildSqlCondition(field, condition, params) {
  if (!isSqlPushDownField(field)) return null;

  const textExpression = buildPayloadTextExpression(field, params);
  if (field === "_id" && !isOperatorObject(condition)) {
    const valueParam = addSqlParam(params, normalizeSqlValue(condition));
    return `(document_id = ${valueParam} OR ${textExpression} = ${valueParam})`;
  }

  if (!isOperatorObject(condition)) {
    if (condition === null || typeof condition === "undefined") {
      return `${textExpression} IS NULL`;
    }
    return `${textExpression} = ${addSqlParam(params, normalizeSqlValue(condition))}`;
  }

  const clauses = [];
  for (const [operator, rawValue] of Object.entries(condition)) {
    if (operator === "$eq") {
      clauses.push(
        rawValue === null || typeof rawValue === "undefined"
          ? `${textExpression} IS NULL`
          : `${textExpression} = ${addSqlParam(params, normalizeSqlValue(rawValue))}`,
      );
    } else if (operator === "$ne") {
      if (rawValue === null || typeof rawValue === "undefined") {
        clauses.push(`${textExpression} IS NOT NULL`);
      } else {
        clauses.push(
          `(${textExpression} IS NULL OR ${textExpression} <> ${addSqlParam(params, normalizeSqlValue(rawValue))})`,
        );
      }
    } else if (operator === "$in" && Array.isArray(rawValue)) {
      const values = rawValue.map((entry) => normalizeSqlValue(entry)).filter((entry) => entry !== null);
      if (!values.length) return "FALSE";
      const valueParam = addSqlParam(params, values);
      if (field === "_id") {
        clauses.push(`(document_id = ANY(${valueParam}::text[]) OR ${textExpression} = ANY(${valueParam}::text[]))`);
      } else {
        clauses.push(`${textExpression} = ANY(${valueParam}::text[])`);
      }
    } else if (operator === "$nin" && Array.isArray(rawValue)) {
      const values = rawValue.map((entry) => normalizeSqlValue(entry)).filter((entry) => entry !== null);
      if (values.length) {
        clauses.push(`(${textExpression} IS NULL OR ${textExpression} <> ALL(${addSqlParam(params, values)}::text[]))`);
      }
    } else if (["$gt", "$gte", "$lt", "$lte"].includes(operator)) {
      const sqlOperator = { $gt: ">", $gte: ">=", $lt: "<", $lte: "<=" }[operator];
      clauses.push(`${textExpression} ${sqlOperator} ${addSqlParam(params, normalizeSqlValue(rawValue))}`);
    } else if (operator === "$exists") {
      clauses.push(rawValue ? `${textExpression} IS NOT NULL` : `${textExpression} IS NULL`);
    } else {
      return null;
    }
  }

  return clauses.length ? `(${clauses.join(" AND ")})` : null;
}

function getPath(source, path) {
  if (!path) return source;
  const parts = String(path).split(".");
  let current = source;
  for (const part of parts) {
    if (current === null || typeof current === "undefined") return undefined;
    current = current[part];
  }
  return current;
}

function setPath(target, path, value) {
  const parts = String(path).split(".");
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isPlainObject(current[part])) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function unsetPath(target, path) {
  const parts = String(path).split(".");
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current?.[parts[index]];
    if (!isPlainObject(current)) return;
  }
  delete current[parts[parts.length - 1]];
}

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toHexString === "function") return value.toHexString();
  return value;
}

function valuesEqual(a, b) {
  const left = comparable(a);
  const right = comparable(b);
  if (left instanceof Date || right instanceof Date) {
    return new Date(left).getTime() === new Date(right).getTime();
  }
  if (
    (typeof left === "string" && ObjectId.isValid(left)) ||
    (typeof right === "string" && ObjectId.isValid(right))
  ) {
    return String(left) === String(right);
  }
  if (left instanceof Date || right instanceof Date) {
    return new Date(left).getTime() === new Date(right).getTime();
  }
  return left === right;
}

function compareValues(a, b) {
  let left = comparable(a);
  let right = comparable(b);
  if (a instanceof Date || b instanceof Date) {
    left = new Date(a).getTime();
    right = new Date(b).getTime();
  } else if (
    typeof left === "string" &&
    typeof right === "object" &&
    right instanceof Date
  ) {
    left = new Date(left).getTime();
    right = right.getTime();
  } else if (
    typeof right === "string" &&
    typeof left === "object" &&
    left instanceof Date
  ) {
    left = left.getTime();
    right = new Date(right).getTime();
  }
  if (left === right) return 0;
  if (typeof left === "undefined") return -1;
  if (typeof right === "undefined") return 1;
  return left > right ? 1 : -1;
}

function valueInList(value, list) {
  if (!Array.isArray(list)) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => list.some((candidate) => valuesEqual(entry, candidate)));
  }
  return list.some((candidate) => valuesEqual(value, candidate));
}

function matchesFieldOperator(fieldValue, operator, expected) {
  if (operator === "$eq") return valuesEqual(fieldValue, expected);
  if (operator === "$ne") return !valuesEqual(fieldValue, expected);
  if (operator === "$in") return valueInList(fieldValue, expected);
  if (operator === "$nin") return !valueInList(fieldValue, expected);
  if (operator === "$gt") return compareValues(fieldValue, expected) > 0;
  if (operator === "$gte") return compareValues(fieldValue, expected) >= 0;
  if (operator === "$lt") return compareValues(fieldValue, expected) < 0;
  if (operator === "$lte") return compareValues(fieldValue, expected) <= 0;
  if (operator === "$exists") {
    const exists = typeof fieldValue !== "undefined";
    return expected ? exists : !exists;
  }
  if (operator === "$regex") {
    const regex = expected instanceof RegExp ? expected : new RegExp(String(expected || ""));
    return regex.test(String(fieldValue || ""));
  }
  if (operator === "$type") {
    if (expected === "string") return typeof fieldValue === "string";
    if (expected === "number") return typeof fieldValue === "number";
    if (expected === "array") return Array.isArray(fieldValue);
    if (expected === "object") return isPlainObject(fieldValue);
    return true;
  }
  if (operator === "$elemMatch") {
    return Array.isArray(fieldValue) && fieldValue.some((entry) => matchesQuery(entry, expected));
  }
  return true;
}

function matchesQuery(doc, query = {}) {
  if (!query || Object.keys(query).length === 0) return true;
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$and") {
      return Array.isArray(expected) && expected.every((entry) => matchesQuery(doc, entry));
    }
    if (key === "$or") {
      return Array.isArray(expected) && expected.some((entry) => matchesQuery(doc, entry));
    }
    if (key === "$nor") {
      return Array.isArray(expected) && !expected.some((entry) => matchesQuery(doc, entry));
    }

    const fieldValue = getPath(doc, key);
    if (expected instanceof RegExp) {
      return expected.test(String(fieldValue || ""));
    }
    if (isOperatorObject(expected)) {
      return Object.entries(expected).every(([operator, value]) =>
        matchesFieldOperator(fieldValue, operator, value),
      );
    }
    if (Array.isArray(fieldValue)) {
      return fieldValue.some((entry) => valuesEqual(entry, expected));
    }
    return valuesEqual(fieldValue, expected);
  });
}

function sortDocs(docs, sortSpec = {}) {
  const entries = Object.entries(sortSpec || {});
  if (!entries.length) return docs;
  return [...docs].sort((a, b) => {
    for (const [field, direction] of entries) {
      const result = compareValues(getPath(a, field), getPath(b, field));
      if (result !== 0) return result * (Number(direction) >= 0 ? 1 : -1);
    }
    return 0;
  });
}

function projectDoc(doc, projection = null) {
  if (!projection || Object.keys(projection).length === 0) return { ...doc };
  const entries = Object.entries(projection);
  const includeMode = entries.some(([key, value]) => key !== "_id" && value);
  if (includeMode) {
    const output = {};
    entries.forEach(([key, value]) => {
      if (!value || key === "_id") return;
      const projected = value === 1 ? getPath(doc, key) : evalExpression(value, doc);
      if (typeof projected !== "undefined") setPath(output, key, projected);
    });
    if (projection._id !== 0 && typeof doc._id !== "undefined") output._id = doc._id;
    return output;
  }
  const output = { ...doc };
  entries.forEach(([key, value]) => {
    if (value === 0) unsetPath(output, key);
  });
  return output;
}

function evalExpression(expression, doc, variables = {}) {
  if (typeof expression === "string") {
    if (expression.startsWith("$$")) return variables[expression.slice(2)];
    if (expression.startsWith("$")) return getPath(doc, expression.slice(1));
    return expression;
  }
  if (expression === null || typeof expression !== "object") return expression;
  if (Array.isArray(expression)) {
    return expression.map((entry) => evalExpression(entry, doc, variables));
  }

  if (Object.prototype.hasOwnProperty.call(expression, "$cond")) {
    const spec = expression.$cond;
    if (Array.isArray(spec)) {
      return evalExpression(spec[0], doc, variables)
        ? evalExpression(spec[1], doc, variables)
        : evalExpression(spec[2], doc, variables);
    }
    return evalExpression(spec.if, doc, variables)
      ? evalExpression(spec.then, doc, variables)
      : evalExpression(spec.else, doc, variables);
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$or")) {
    return (expression.$or || []).some((entry) => !!evalExpression(entry, doc, variables));
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$and")) {
    return (expression.$and || []).every((entry) => !!evalExpression(entry, doc, variables));
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$eq")) {
    const [left, right] = expression.$eq || [];
    return valuesEqual(evalExpression(left, doc, variables), evalExpression(right, doc, variables));
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$ne")) {
    const [left, right] = expression.$ne || [];
    return !valuesEqual(evalExpression(left, doc, variables), evalExpression(right, doc, variables));
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$in")) {
    const [value, list] = expression.$in || [];
    return valueInList(evalExpression(value, doc, variables), evalExpression(list, doc, variables));
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$toString")) {
    return stringifyId(evalExpression(expression.$toString, doc, variables));
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$let")) {
    const nextVariables = { ...variables };
    Object.entries(expression.$let.vars || {}).forEach(([key, value]) => {
      nextVariables[key] = evalExpression(value, doc, variables);
    });
    return evalExpression(expression.$let.in, doc, nextVariables);
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$convert")) {
    const input = evalExpression(expression.$convert.input, doc, variables);
    if (expression.$convert.to === "double") {
      const numeric = Number(input);
      return Number.isFinite(numeric) ? numeric : expression.$convert.onError || 0;
    }
    return input ?? expression.$convert.onNull ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$isNumber")) {
    return typeof evalExpression(expression.$isNumber, doc, variables) === "number";
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$add")) {
    return (expression.$add || []).reduce(
      (sum, entry) => sum + (Number(evalExpression(entry, doc, variables)) || 0),
      0,
    );
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$max")) {
    const values = (expression.$max || []).map((entry) =>
      Number(evalExpression(entry, doc, variables)) || 0,
    );
    return Math.max(...values);
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$ifNull")) {
    const [value, fallback] = expression.$ifNull || [];
    const resolved = evalExpression(value, doc, variables);
    return resolved === null || typeof resolved === "undefined"
      ? evalExpression(fallback, doc, variables)
      : resolved;
  }
  if (Object.prototype.hasOwnProperty.call(expression, "$dateToString")) {
    const dateExpression = expression.$dateToString || {};
    const date = evalExpression(dateExpression.date, doc, variables);
    return formatDateToString(date, dateExpression);
  }

  const output = {};
  Object.entries(expression).forEach(([key, value]) => {
    output[key] = evalExpression(value, doc, variables);
  });
  return output;
}

function applyProjectionStage(docs, projection) {
  return docs.map((doc) => {
    const output = {};
    const includeEntries = Object.entries(projection || {});
    const includeMode = includeEntries.some(([key, value]) => key !== "_id" && value === 1);
    if (includeMode) return projectDoc(doc, projection);
    includeEntries.forEach(([key, value]) => {
      if (value === 0) return;
      if (value === 1) {
        const resolved = getPath(doc, key);
        if (typeof resolved !== "undefined") setPath(output, key, resolved);
      } else {
        setPath(output, key, evalExpression(value, doc));
      }
    });
    if (projection?._id !== 0 && typeof doc._id !== "undefined") output._id = doc._id;
    return output;
  });
}

function groupKeyToString(value) {
  return JSON.stringify(normalizeForJson(value));
}

function applyGroupStage(docs, groupSpec) {
  const groups = new Map();
  docs.forEach((doc) => {
    const keyValue = evalExpression(groupSpec._id, doc);
    const key = groupKeyToString(keyValue);
    if (!groups.has(key)) {
      groups.set(key, { _id: keyValue, __avg: {} });
    }
    const target = groups.get(key);
    Object.entries(groupSpec).forEach(([field, accumulator]) => {
      if (field === "_id" || !isPlainObject(accumulator)) return;
      const [[operator, expression]] = Object.entries(accumulator);
      const value = evalExpression(expression, doc);
      if (operator === "$sum") {
        target[field] = (Number(target[field]) || 0) + (Number(value) || 0);
      } else if (operator === "$max") {
        if (typeof target[field] === "undefined" || compareValues(value, target[field]) > 0) {
          target[field] = value;
        }
      } else if (operator === "$min") {
        if (typeof target[field] === "undefined" || compareValues(value, target[field]) < 0) {
          target[field] = value;
        }
      } else if (operator === "$last") {
        target[field] = value;
      } else if (operator === "$first") {
        if (typeof target[field] === "undefined") target[field] = value;
      } else if (operator === "$push") {
        if (!Array.isArray(target[field])) target[field] = [];
        target[field].push(value);
      } else if (operator === "$addToSet") {
        if (!Array.isArray(target[field])) target[field] = [];
        if (!target[field].some((entry) => valuesEqual(entry, value))) {
          target[field].push(value);
        }
      } else if (operator === "$avg") {
        if (!target.__avg[field]) target.__avg[field] = { sum: 0, count: 0 };
        target.__avg[field].sum += Number(value) || 0;
        target.__avg[field].count += 1;
      }
    });
  });
  return Array.from(groups.values()).map((group) => {
    Object.entries(group.__avg || {}).forEach(([field, stats]) => {
      group[field] = stats.count > 0 ? stats.sum / stats.count : 0;
    });
    delete group.__avg;
    return group;
  });
}

async function applyAggregatePipeline(loadDocs, pipeline = []) {
  let docs = await loadDocs();
  for (const stage of pipeline || []) {
    if (stage.$match) {
      docs = docs.filter((doc) => matchesQuery(doc, stage.$match));
    } else if (stage.$addFields || stage.$set) {
      const fields = stage.$addFields || stage.$set;
      docs = docs.map((doc) => {
        const next = { ...doc };
        Object.entries(fields).forEach(([key, expression]) => {
          setPath(next, key, evalExpression(expression, next));
        });
        return next;
      });
    } else if (stage.$project) {
      docs = applyProjectionStage(docs, stage.$project);
    } else if (stage.$unwind) {
      const spec =
        typeof stage.$unwind === "string" ? { path: stage.$unwind } : stage.$unwind;
      const path = String(spec.path || "").replace(/^\$/, "");
      const unwound = [];
      docs.forEach((doc) => {
        const value = getPath(doc, path);
        if (Array.isArray(value) && value.length) {
          value.forEach((entry) => {
            const next = { ...doc };
            setPath(next, path, entry);
            unwound.push(next);
          });
        } else if (spec.preserveNullAndEmptyArrays) {
          unwound.push(doc);
        }
      });
      docs = unwound;
    } else if (stage.$group) {
      docs = applyGroupStage(docs, stage.$group);
    } else if (stage.$sort) {
      docs = sortDocs(docs, stage.$sort);
    } else if (stage.$skip) {
      docs = docs.slice(Number(stage.$skip) || 0);
    } else if (stage.$limit) {
      docs = docs.slice(0, Number(stage.$limit) || 0);
    } else if (stage.$count) {
      docs = [{ [stage.$count]: docs.length }];
    }
  }
  return docs;
}

function applyUpdateDocument(doc, update, { isInsert = false } = {}) {
  if (Array.isArray(update)) {
    let next = { ...doc };
    update.forEach((stage) => {
      if (stage.$set || stage.$addFields) {
        const fields = stage.$set || stage.$addFields;
        Object.entries(fields).forEach(([key, expression]) => {
          setPath(next, key, evalExpression(expression, next));
        });
      }
      if (stage.$unset) {
        const fields = Array.isArray(stage.$unset)
          ? stage.$unset
          : Object.keys(stage.$unset || {});
        fields.forEach((key) => unsetPath(next, key));
      }
    });
    return next;
  }

  if (!isOperatorObject(update)) {
    return { ...update };
  }

  const next = { ...doc };
  Object.entries(update.$set || {}).forEach(([key, value]) => setPath(next, key, value));
  Object.entries(update.$unset || {}).forEach(([key]) => unsetPath(next, key));
  Object.entries(update.$inc || {}).forEach(([key, value]) => {
    setPath(next, key, (Number(getPath(next, key)) || 0) + (Number(value) || 0));
  });
  Object.entries(update.$push || {}).forEach(([key, value]) => {
    const current = Array.isArray(getPath(next, key)) ? [...getPath(next, key)] : [];
    if (isPlainObject(value) && Array.isArray(value.$each)) {
      current.push(...value.$each);
    } else {
      current.push(value);
    }
    setPath(next, key, current);
  });
  Object.entries(update.$addToSet || {}).forEach(([key, value]) => {
    const current = Array.isArray(getPath(next, key)) ? [...getPath(next, key)] : [];
    const values = isPlainObject(value) && Array.isArray(value.$each) ? value.$each : [value];
    values.forEach((entry) => {
      if (!current.some((existing) => valuesEqual(existing, entry))) current.push(entry);
    });
    setPath(next, key, current);
  });
  Object.entries(update.$pull || {}).forEach(([key, value]) => {
    const current = Array.isArray(getPath(next, key)) ? [...getPath(next, key)] : [];
    setPath(
      next,
      key,
      current.filter((entry) =>
        isOperatorObject(value) || isPlainObject(value)
          ? !matchesQuery(entry, value)
          : !valuesEqual(entry, value),
      ),
    );
  });
  if (isInsert) {
    Object.entries(update.$setOnInsert || {}).forEach(([key, value]) => {
      setPath(next, key, value);
    });
  }
  return next;
}

function buildUpsertBase(query = {}) {
  const output = {};
  Object.entries(query || {}).forEach(([key, value]) => {
    if (key.startsWith("$")) return;
    if (!isOperatorObject(value)) setPath(output, key, value);
  });
  return output;
}

class CompatCursor {
  constructor(loadDocs, options = {}) {
    this.loadDocs = loadDocs;
    this.sortSpec = options.sort || null;
    this.projection = options.projection || null;
    this.limitValue = options.limit || 0;
    this.skipValue = options.skip || 0;
    this.cachedDocs = null;
    this.position = 0;
  }

  sort(spec) {
    this.sortSpec = spec || null;
    return this;
  }

  project(spec) {
    this.projection = spec || null;
    return this;
  }

  limit(value) {
    this.limitValue = Number(value) || 0;
    return this;
  }

  skip(value) {
    this.skipValue = Number(value) || 0;
    return this;
  }

  async _materialize() {
    if (this.cachedDocs) return this.cachedDocs;
    let docs = await this.loadDocs({
      sort: this.sortSpec,
      limit: this.limitValue,
      skip: this.skipValue,
    });
    if (this.sortSpec) docs = sortDocs(docs, this.sortSpec);
    if (this.skipValue) docs = docs.slice(this.skipValue);
    if (this.limitValue) docs = docs.slice(0, this.limitValue);
    if (this.projection) docs = docs.map((doc) => projectDoc(doc, this.projection));
    this.cachedDocs = docs;
    return docs;
  }

  async toArray() {
    return this._materialize();
  }

  async hasNext() {
    const docs = await this._materialize();
    return this.position < docs.length;
  }

  async next() {
    const docs = await this._materialize();
    if (this.position >= docs.length) return null;
    const doc = docs[this.position];
    this.position += 1;
    return doc;
  }

  async *[Symbol.asyncIterator]() {
    const docs = await this._materialize();
    for (const doc of docs) yield doc;
  }
}

class PostgresCollection {
  constructor(db, collectionName) {
    this.db = db;
    this.collectionName = collectionName;
  }

  _buildAppDocumentWhere(query = {}, params = []) {
    if (!query || Object.keys(query).length === 0) return "";
    const clauses = [];

    for (const [key, condition] of Object.entries(query)) {
      if (key === "$and" && Array.isArray(condition)) {
        const nestedClauses = [];
        for (const nested of condition) {
          const nestedSql = this._buildAppDocumentWhere(nested, params);
          if (nestedSql === null) return null;
          if (nestedSql) nestedClauses.push(`(${nestedSql})`);
        }
        if (nestedClauses.length) clauses.push(nestedClauses.join(" AND "));
        continue;
      }

      if (key.startsWith("$")) return null;
      const sql = buildSqlCondition(key, condition, params);
      if (!sql) return null;
      clauses.push(sql);
    }

    return clauses.join(" AND ");
  }

  _buildAppDocumentOrderBy(sortSpec = null, params = []) {
    const entries = Object.entries(sortSpec || {});
    if (!entries.length) return "ORDER BY updated_at DESC";

    const orderParts = [];
    for (const [field, direction] of entries) {
      if (!isSqlPushDownField(field)) return "ORDER BY updated_at DESC";
      const sqlDirection = Number(direction) >= 0 ? "ASC" : "DESC";
      const expression = buildPayloadTextExpression(field, params);
      orderParts.push(`${expression} ${sqlDirection} NULLS LAST`);
    }
    orderParts.push("updated_at DESC");
    return `ORDER BY ${orderParts.join(", ")}`;
  }

  async _loadAppDocuments(query = {}, options = {}) {
    let params = [this.collectionName];
    const whereParams = [this.collectionName];
    const pushedWhere = this._buildAppDocumentWhere(query, whereParams);
    const canPushQuery = pushedWhere !== null;
    if (canPushQuery) params = whereParams;
    const whereClause = canPushQuery && pushedWhere ? `AND ${pushedWhere}` : "";
    const orderBySql = this._buildAppDocumentOrderBy(options.sort, params);
    const requestedLimit =
      Number(options.limit) > 0
        ? Number(options.limit) + Math.max(Number(options.skip) || 0, 0)
        : this.db.scanLimit;
    const limit = canPushQuery
      ? Math.max(1, Math.min(requestedLimit, this.db.scanLimit))
      : this.db.scanLimit;
    const limitParam = addSqlParam(params, limit);

    const result = await this.db.postgresRuntime.query(
      `
        SELECT document_id, payload, created_at, updated_at
        FROM app_documents
        WHERE collection_name = $1
          ${whereClause}
        ${orderBySql}
        LIMIT ${limitParam}
      `,
      params,
    );
    return result.rows.map((row) => {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      return {
        ...payload,
        _id: typeof payload._id === "undefined" ? row.document_id : payload._id,
      };
    });
  }

  async _loadChatHistory() {
    const result = await this.db.postgresRuntime.query(
      `
        SELECT
          id,
          user_id,
          role,
          content_text,
          content_json,
          source,
          platform,
          bot_id,
          metadata,
          order_extraction_round_id,
          order_extraction_marked_at,
          order_id,
          message_at
        FROM chat_messages
        ORDER BY message_at DESC
        LIMIT $1
      `,
      [this.db.scanLimit],
    );
    return result.rows.map((row) => ({
      _id: row.id,
      senderId: row.user_id,
      userId: row.user_id,
      role: row.role,
      content:
        typeof row.content_text === "string"
          ? row.content_text
          : JSON.stringify(row.content_json || ""),
      source: row.source || null,
      platform: row.platform || "line",
      botId: row.bot_id || null,
      metadata: row.metadata || {},
      orderExtractionRoundId: row.order_extraction_round_id || null,
      orderExtractionMarkedAt: row.order_extraction_marked_at || null,
      orderId: row.order_id || null,
      timestamp: row.message_at,
      createdAt: row.message_at,
    }));
  }

  async _loadDocs(query = {}, options = {}) {
    if (this.collectionName === "chat_history") return this._loadChatHistory();
    return this._loadAppDocuments(query, options);
  }

  find(query = {}, options = {}) {
    return new CompatCursor(async (cursorOptions = {}) => {
      const docs = await this._loadDocs(query, cursorOptions);
      return docs.filter((doc) => matchesQuery(doc, query));
    }, options);
  }

  async findOne(query = {}, options = {}) {
    const docs = await this.find(query, { ...options, limit: 1 }).toArray();
    return docs[0] || null;
  }

  aggregate(pipeline = []) {
    return new CompatCursor(() =>
      applyAggregatePipeline(() => this._loadDocs(), pipeline),
    );
  }

  async countDocuments(query = {}) {
    const docs = await this.find(query).toArray();
    return docs.length;
  }

  async insertOne(doc = {}) {
    const payload = { ...(doc || {}) };
    if (!payload._id) payload._id = new ObjectId();
    if (this.collectionName === "chat_history") {
      await this.db.chatStorageService.mirrorMessage(payload);
    } else {
      await this.db.chatStorageService.upsertDocument(
        this.collectionName,
        resolveDocumentId(this.collectionName, payload) || stringifyId(payload._id),
        normalizeForJson(payload),
      );
    }
    return { acknowledged: true, insertedId: payload._id };
  }

  async insertMany(docs = []) {
    const insertedIds = {};
    let insertedCount = 0;
    for (const [index, doc] of docs.entries()) {
      const result = await this.insertOne(doc);
      insertedIds[index] = result.insertedId;
      insertedCount += 1;
    }
    return { acknowledged: true, insertedCount, insertedIds };
  }

  async updateOne(query = {}, update = {}, options = {}) {
    const existing = await this.findOne(query);
    if (!existing) {
      if (!options.upsert) {
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      }
      const base = buildUpsertBase(query);
      const next = applyUpdateDocument(base, update, { isInsert: true });
      if (!next._id) next._id = new ObjectId();
      await this.insertOne(next);
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
        upsertedId: next._id,
      };
    }
    const next = applyUpdateDocument(existing, update);
    if (!next._id) next._id = existing._id;
    await this._replacePersisted(existing, next);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  }

  async updateMany(query = {}, update = {}) {
    const docs = await this.find(query).toArray();
    for (const doc of docs) {
      const next = applyUpdateDocument(doc, update);
      if (!next._id) next._id = doc._id;
      await this._replacePersisted(doc, next);
    }
    return { acknowledged: true, matchedCount: docs.length, modifiedCount: docs.length };
  }

  async replaceOne(query = {}, replacement = {}, options = {}) {
    const existing = await this.findOne(query);
    if (!existing && !options.upsert) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }
    const payload = { ...(replacement || {}) };
    if (!payload._id) payload._id = existing?._id || new ObjectId();
    await this._replacePersisted(existing || payload, payload);
    return {
      acknowledged: true,
      matchedCount: existing ? 1 : 0,
      modifiedCount: 1,
      upsertedCount: existing ? 0 : 1,
      upsertedId: existing ? null : payload._id,
    };
  }

  async findOneAndUpdate(query = {}, update = {}, options = {}) {
    const before = await this.findOne(query);
    await this.updateOne(query, update, { upsert: options.upsert });
    const after = await this.findOne(
      before ? { _id: before._id } : query,
      { projection: options.projection || null },
    );
    return options.returnDocument === "before" ? before : after;
  }

  async deleteOne(query = {}) {
    const doc = await this.findOne(query);
    if (!doc) return { acknowledged: true, deletedCount: 0 };
    await this._deletePersisted(doc);
    return { acknowledged: true, deletedCount: 1 };
  }

  async deleteMany(query = {}) {
    const docs = await this.find(query).toArray();
    for (const doc of docs) await this._deletePersisted(doc);
    return { acknowledged: true, deletedCount: docs.length };
  }

  async bulkWrite(operations = []) {
    let insertedCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;
    for (const operation of operations) {
      if (operation.insertOne) {
        await this.insertOne(operation.insertOne.document);
        insertedCount += 1;
      } else if (operation.updateOne) {
        const result = await this.updateOne(
          operation.updateOne.filter,
          operation.updateOne.update,
          { upsert: operation.updateOne.upsert },
        );
        modifiedCount += result.modifiedCount || result.upsertedCount || 0;
      } else if (operation.deleteOne) {
        const result = await this.deleteOne(operation.deleteOne.filter);
        deletedCount += result.deletedCount || 0;
      }
    }
    return { acknowledged: true, insertedCount, modifiedCount, deletedCount };
  }

  async createIndex() {
    return "";
  }

  async createIndexes(indexes = []) {
    return indexes.map((_, index) => `postgres_compat_${index}`);
  }

  async drop() {
    await this.db.postgresRuntime.query(
      `DELETE FROM app_documents WHERE collection_name = $1`,
      [this.collectionName],
    );
    return true;
  }

  async rename(newName) {
    await this.db.postgresRuntime.query(
      `
        UPDATE app_documents
        SET collection_name = $2, updated_at = now()
        WHERE collection_name = $1
      `,
      [this.collectionName, newName],
    );
    this.collectionName = newName;
    return this;
  }

  async _replacePersisted(previous, next) {
    if (this.collectionName === "chat_history") {
      await this.db.chatStorageService.mirrorMessage(next);
      return;
    }
    const previousId = resolveDocumentId(this.collectionName, previous);
    const nextId = resolveDocumentId(this.collectionName, next) || stringifyId(next._id);
    if (previousId && previousId !== nextId) {
      await this.db.chatStorageService.deleteDocument(this.collectionName, previousId);
    }
    await this.db.chatStorageService.upsertDocument(
      this.collectionName,
      nextId,
      normalizeForJson(next),
    );
  }

  async _deletePersisted(doc) {
    if (this.collectionName === "chat_history") {
      const userId = doc.senderId || doc.userId;
      if (userId) await this.db.chatStorageService.deleteUserHistory(String(userId));
      return;
    }
    const documentId = resolveDocumentId(this.collectionName, doc) || stringifyId(doc._id);
    if (documentId) await this.db.chatStorageService.deleteDocument(this.collectionName, documentId);
  }
}

class PostgresCompatDb {
  constructor({ postgresRuntime, chatStorageService, projectBucket, scanLimit = DEFAULT_SCAN_LIMIT }) {
    this.__isPostgresDocumentCompat = true;
    this.postgresRuntime = postgresRuntime;
    this.chatStorageService = chatStorageService;
    this.projectBucket = projectBucket;
    this.scanLimit = scanLimit;
  }

  collection(name) {
    return new PostgresCollection(this, name);
  }

  listCollections(filter = {}) {
    return new CompatCursor(async () => {
      const result = await this.postgresRuntime.query(
        `SELECT DISTINCT collection_name AS name FROM app_documents ORDER BY collection_name`,
      );
      return result.rows
        .map((row) => ({ name: row.name }))
        .filter((row) => matchesQuery(row, filter));
    });
  }
}

function createPostgresDocumentCompatClient(options = {}) {
  const db = new PostgresCompatDb(options);
  return {
    __isPostgresDocumentCompat: true,
    db() {
      return db;
    },
    startSession() {
      return {
        async withTransaction(callback) {
          return callback();
        },
        async endSession() {},
      };
    },
    async close() {},
  };
}

function mapAssetBucketScope(bucketName = "") {
  if (bucketName === "instructionAssets") return "instruction_assets";
  if (bucketName === "followupAssets") return "follow_up_assets";
  if (bucketName === "broadcastAssets") return "broadcast_assets";
  return bucketName || "asset_objects";
}

class PostgresAssetBucket {
  constructor(db, options = {}) {
    this.db = db;
    this.bucketName = options.bucketName || "fs";
    this.scope = mapAssetBucketScope(this.bucketName);
  }

  openUploadStream(filename, options = {}) {
    const bucket = this;
    const id = new ObjectId();
    const chunks = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
      final(callback) {
        (async () => {
          const buffer = Buffer.concat(chunks);
          const objectKey = bucket.db.projectBucket.buildKey(
            "asset_objects",
            bucket.scope,
            id.toString(),
            filename,
          );
          await bucket.db.projectBucket.putBuffer(objectKey, buffer, {
            contentType: options.contentType,
            metadata: normalizeForJson(options.metadata || {}),
          });
          await bucket.db.chatStorageService.upsertAssetObject(bucket.scope, id.toString(), {
            fileName: filename,
            bucketKey: objectKey,
            mimeType: options.contentType || null,
            sizeBytes: buffer.length,
            metadata: normalizeForJson(options.metadata || {}),
          });
          callback();
        })().catch(callback);
      },
    });
    stream.id = id;
    return stream;
  }

  find(query = {}) {
    return new CompatCursor(async () => {
      const result = await this.db.postgresRuntime.query(
        `
          SELECT asset_id, file_name, bucket_key, mime_type, size_bytes, metadata, created_at
          FROM asset_objects
          WHERE asset_scope = $1
          ORDER BY updated_at DESC
          LIMIT $2
        `,
        [this.scope, this.db.scanLimit],
      );
      return result.rows
        .map((row) => ({
          _id: row.asset_id,
          filename: row.file_name,
          bucketKey: row.bucket_key,
          contentType: row.mime_type,
          length: row.size_bytes,
          metadata: row.metadata || {},
          uploadDate: row.created_at,
        }))
        .filter((row) => matchesQuery(row, query));
    });
  }

  openDownloadStream(id) {
    const stream = new PassThrough();
    (async () => {
      const asset = await this.db.chatStorageService.getAssetObject(
        this.scope,
        stringifyId(id),
      );
      if (!asset?.bucketKey) throw new Error("FileNotFound");
      const payload = await this.db.projectBucket.getObjectBuffer(asset.bucketKey);
      stream.end(payload.buffer);
    })().catch((error) => stream.destroy(error));
    return stream;
  }

  openDownloadStreamByName(filename) {
    const stream = new PassThrough();
    (async () => {
      const asset = await this.db.chatStorageService.findAssetObjectByFileName(
        this.scope,
        filename,
      );
      if (!asset?.bucketKey) throw new Error("FileNotFound");
      const payload = await this.db.projectBucket.getObjectBuffer(asset.bucketKey);
      stream.end(payload.buffer);
    })().catch((error) => stream.destroy(error));
    return stream;
  }

  async delete(id) {
    const assetId = stringifyId(id);
    const asset = await this.db.chatStorageService.getAssetObject(this.scope, assetId);
    if (asset?.bucketKey) {
      await this.db.projectBucket.deleteObject(asset.bucketKey);
    }
    await this.db.chatStorageService.deleteAssetObject(this.scope, assetId);
  }
}

function createAssetBucket(db, options = {}) {
  if (db?.__isPostgresDocumentCompat) {
    return new PostgresAssetBucket(db, options);
  }
  throw new Error("PostgreSQL document compatibility database is required");
}

module.exports = {
  createAssetBucket,
  createPostgresDocumentCompatClient,
  matchesQuery,
  normalizeForJson,
  resolveDocumentId,
};
