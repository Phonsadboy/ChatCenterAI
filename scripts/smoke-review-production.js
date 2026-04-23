"use strict";

const DEFAULT_BASE_URL = "https://web-production-8bd2f.up.railway.app";

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  update(response) {
    const raw = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")]
        : [];
    raw.forEach((entry) => {
      const [pair] = String(entry).split(";");
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) return;
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (name) this.cookies.set(name, value);
    });
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function truncate(value, maxLength = 240) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function pickFirstArray(value, candidateKeys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of candidateKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function pickId(value = {}) {
  if (!value || typeof value !== "object") return "";
  return String(value.id || value._id || value.userId || value.senderId || "").trim();
}

function createTester(baseUrl, jar) {
  const results = [];

  async function request(label, path, options = {}) {
    const url = new URL(path, baseUrl).toString();
    const headers = {
      accept: options.accept || "application/json",
      ...(options.headers || {}),
    };
    const cookie = jar.header();
    if (cookie) headers.cookie = cookie;
    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body,
      redirect: options.redirect || "follow",
    });
    jar.update(response);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let parsed = null;
    if (contentType.includes("application/json") && text) {
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        parsed = null;
      }
    }

    const redirectedToLogin = response.url.includes("/admin/login");
    const okStatus = response.status >= 200 && response.status < 400;
    const ok = okStatus && !redirectedToLogin;
    results.push({
      label,
      ok,
      status: response.status,
      redirectedToLogin,
      path,
      sample: parsed || truncate(text),
    });
    return { ok, parsed, response, text };
  }

  function summarize() {
    const failed = results.filter((result) => !result.ok);
    results.forEach((result) => {
      const marker = result.ok ? "OK" : "FAIL";
      const redirectNote = result.redirectedToLogin ? " redirectedToLogin=true" : "";
      console.log(
        `[${marker}] ${result.label} status=${result.status} path=${result.path}${redirectNote}`,
      );
      if (!result.ok) {
        console.log(`      sample=${truncate(result.sample)}`);
      }
    });
    console.log(
      `[SUMMARY] total=${results.length} ok=${results.length - failed.length} failed=${failed.length}`,
    );
    return failed.length;
  }

  return { request, summarize };
}

async function main() {
  const baseUrl = process.env.BASE_URL || DEFAULT_BASE_URL;
  const passcode = process.env.ADMIN_MASTER_PASSCODE || "";

  const jar = new CookieJar();
  const tester = createTester(baseUrl, jar);

  const health = await tester.request("health postgres backend", "/health");
  if (health.parsed?.databaseBackend !== "postgres") {
    throw new Error(`Expected health.databaseBackend=postgres, got ${health.text}`);
  }

  const sessionBeforeLogin = await tester.request(
    "auth session before login",
    "/api/auth/session",
  );
  if (sessionBeforeLogin.parsed?.requirePasscode) {
    if (!passcode.trim()) {
      throw new Error(
        "ADMIN_MASTER_PASSCODE is required because production requires passcode login",
      );
    }
    const loginBody = new URLSearchParams({ passcode });
    const login = await tester.request("admin login", "/admin/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: loginBody.toString(),
    });
    if (!login.parsed?.success) {
      throw new Error(`Admin login failed: ${truncate(login.parsed || login.text)}`);
    }
  } else {
    console.log("[WARN] Admin passcode is not enabled; authenticated login skipped");
  }

  const pagePaths = [
    ["/admin/dashboard", "dashboard page"],
    ["/admin/chat", "chat page"],
    ["/admin/orders", "orders page"],
    ["/admin/followup", "follow-up page"],
    ["/admin/broadcast", "broadcast page"],
    ["/admin/settings", "settings page"],
    ["/admin/settings2", "settings2 page"],
    ["/admin/instructions/list", "instructions list page"],
    ["/admin/instructions/assets", "instruction assets page"],
    ["/admin/image-collections", "image collections page"],
    ["/admin/categories", "categories page"],
    ["/admin/customer-stats", "customer stats page"],
    ["/admin/api-usage", "api usage page"],
    ["/admin/instruction-ai", "instruction ai page"],
    ["/admin/instruction-conversations", "instruction conversations page"],
    ["/admin/facebook-posts", "facebook posts page"],
  ];

  for (const [path, label] of pagePaths) {
    await tester.request(label, path, { accept: "text/html" });
  }

  const apiChecks = [
    ["/api/auth/session", "auth session after login"],
    ["/admin/chat/users", "chat users summary"],
    ["/admin/chat/unread-count", "chat unread count"],
    ["/admin/chat/available-tags", "chat available tags"],
    ["/admin/chat/orders?limit=5", "chat orders api"],
    ["/admin/orders/data?limit=5", "orders data"],
    ["/admin/orders/pages", "orders pages"],
    ["/api/settings", "settings api"],
    ["/api/openai-keys", "openai keys"],
    ["/api/openai-usage/summary", "openai usage summary"],
    ["/api/openai-usage?limit=5", "openai usage list"],
    ["/api/line-bots", "line bots"],
    ["/api/facebook-bots", "facebook bots"],
    ["/api/instagram-bots", "instagram bots"],
    ["/api/whatsapp-bots", "whatsapp bots"],
    ["/api/instructions-v2", "instructions v2"],
    ["/api/instructions/library", "instruction library api"],
    ["/api/image-collections", "image collections api"],
    ["/admin/followup/status", "follow-up status"],
    ["/admin/followup/overview", "follow-up overview"],
    ["/admin/followup/users", "follow-up users"],
    ["/admin/followup/page-settings", "follow-up page settings"],
    ["/admin/api/all-bots", "all bots api"],
    ["/admin/api/telegram-notification-bots", "telegram notification bots"],
    ["/admin/api/notification-channels", "notification channels"],
    ["/admin/api/notification-logs", "notification logs"],
    ["/admin/api/categories", "admin categories api"],
    ["/admin/customer-stats/data", "customer stats data"],
    ["/api/instruction-ai/sessions", "instruction ai sessions"],
    ["/api/instruction-ai/audit", "instruction ai audit"],
  ];

  const apiData = new Map();
  for (const [path, label] of apiChecks) {
    const result = await tester.request(label, path);
    apiData.set(path, result.parsed);
  }

  const chatUsers = pickFirstArray(apiData.get("/admin/chat/users"), [
    "users",
    "data",
    "items",
  ]);
  const firstUserId = pickId(chatUsers[0]);
  if (firstUserId) {
    const encodedUserId = encodeURIComponent(firstUserId);
    await tester.request("chat history first user", `/admin/chat/history/${encodedUserId}`);
    await tester.request("chat tags first user", `/admin/chat/tags/${encodedUserId}`);
    await tester.request("chat orders first user", `/admin/chat/orders/${encodedUserId}`);
    await tester.request("chat user status first user", `/admin/chat/user-status/${encodedUserId}`);
    await tester.request("user notes first user", `/api/users/${encodedUserId}/notes`);
  } else {
    console.log("[WARN] No chat user found for dynamic chat history checks");
  }

  const ordersData = apiData.get("/admin/orders/data?limit=5");
  const orders = pickFirstArray(ordersData, ["orders", "data", "items"]);
  const firstOrderId = pickId(orders[0]);
  if (firstOrderId) {
    await tester.request(
      "order print label first order",
      `/admin/orders/${encodeURIComponent(firstOrderId)}/print-label`,
      { accept: "text/html" },
    );
  } else {
    console.log("[WARN] No order found for dynamic order detail checks");
  }

  const instructionData = apiData.get("/api/instructions-v2");
  const instructions = pickFirstArray(instructionData, ["instructions", "data", "items"]);
  const firstInstructionId = pickId(instructions[0]);
  if (firstInstructionId) {
    const encodedInstructionId = encodeURIComponent(firstInstructionId);
    await tester.request("instruction v2 detail", `/api/instructions-v2/${encodedInstructionId}`);
    await tester.request(
      "instruction v2 preview",
      `/api/instructions-v2/${encodedInstructionId}/preview`,
    );
    await tester.request(
      "instruction conversations list",
      `/api/instruction-conversations/${encodedInstructionId}`,
    );
    await tester.request(
      "instruction conversations analytics",
      `/api/instruction-conversations/${encodedInstructionId}/analytics`,
    );
    await tester.request(
      "instruction conversations filters",
      `/api/instruction-conversations/${encodedInstructionId}/filters`,
    );
    await tester.request(
      "instruction ai versions",
      `/api/instruction-ai/versions/${encodedInstructionId}`,
    );
    await tester.request(
      "instruction data item new form",
      `/admin/instructions-v3/${encodedInstructionId}/data-items/new`,
      { accept: "text/html" },
    );
  } else {
    console.log("[WARN] No instruction found for dynamic instruction checks");
  }

  for (const key of ["/api/line-bots", "/api/facebook-bots", "/api/instagram-bots", "/api/whatsapp-bots"]) {
    const bots = pickFirstArray(apiData.get(key), ["bots", "data", "items"]);
    const firstBotId = pickId(bots[0]);
    if (firstBotId) {
      await tester.request(
        `${key} first bot detail`,
        `${key}/${encodeURIComponent(firstBotId)}`,
      );
    }
  }

  const failedCount = tester.summarize();
  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[SMOKE] failed: ${error?.message || error}`);
  process.exitCode = 1;
});
