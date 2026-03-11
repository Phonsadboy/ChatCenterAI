const { getRuntimeConfig } = require("./runtimeConfig");

const PUBLIC_PATH_PREFIXES = [
  "/health",
  "/webhook/",
  "/assets/",
  "/broadcast/assets/",
  "/favicon.ico",
  "/robots.txt",
  "/s/",
];

const ADMIN_BLOCKED_PREFIXES = ["/webhook/"];

function matchesPrefix(pathname, prefixes = []) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function createRuntimeRouteGuard(config = getRuntimeConfig()) {
  if (!config.features.runtimeRouteGuards) {
    return (_req, _res, next) => next();
  }

  if (config.runtimeMode === "public-ingest") {
    return (req, res, next) => {
      if (matchesPrefix(req.path || "", PUBLIC_PATH_PREFIXES)) {
        return next();
      }
      return res.status(404).json({ error: "Not Found" });
    };
  }

  if (config.runtimeMode === "admin-app") {
    return (req, res, next) => {
      if (matchesPrefix(req.path || "", ADMIN_BLOCKED_PREFIXES)) {
        return res.status(404).json({ error: "Not Found" });
      }
      return next();
    };
  }

  return (_req, _res, next) => next();
}

module.exports = {
  createRuntimeRouteGuard,
};
