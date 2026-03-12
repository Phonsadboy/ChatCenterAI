const http = require("http");

const { parseBoolean } = require("../infra/runtimeConfig");

function normalizePort(value, fallback = 8080) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return fallback;
}

function startRuntimeHealthServer(runtimeLabel, options = {}) {
  const enabled = parseBoolean(
    process.env.CCAI_RUNTIME_HEALTH_SERVER_ENABLED,
    true,
  );

  if (!enabled) {
    return {
      close: async () => {},
      server: null,
    };
  }

  const port = normalizePort(process.env.PORT, 8080);
  const host = process.env.CCAI_RUNTIME_HEALTH_HOST || "0.0.0.0";

  const server = http.createServer((req, res) => {
    const path = req.url || "/";
    if (path === "/health" || path === "/") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      const payload = {
        ok: true,
        runtime: runtimeLabel,
        mode: process.env.CCAI_RUNTIME_MODE || "unknown",
        pid: process.pid,
        ts: new Date().toISOString(),
      };
      if (typeof options.getStatus === "function") {
        try {
          payload.status = options.getStatus() || null;
        } catch (error) {
          payload.status = {
            statusError: error?.message || String(error),
          };
        }
      }
      res.end(JSON.stringify(payload));
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.on("error", (error) => {
    console.error(`[${runtimeLabel}] Health server error:`, error);
  });

  server.listen(port, host, () => {
    console.log(
      `[${runtimeLabel}] Health server listening on ${host}:${port} (/health)`,
    );
  });

  return {
    server,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

module.exports = {
  startRuntimeHealthServer,
};
