"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = "Phonsadboy/ChatCenterAI";
const TARGET_BRANCH =
  process.env.TARGET_BRANCH ||
  spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout.trim();
const REVIEW_PROJECT_ID = "f754256b-958f-4a76-a10c-3f55eb46cecc";
const TOOL_PREFIX = process.env.MIGRATION_TOOL_PREFIX || "/tmp/chatcenterai-migration-tools";
const TOOL_NODE_PATH = path.join(TOOL_PREFIX, "node_modules");
const DEFAULT_REGION = "asia-southeast1-eqsg3a";
const KNOWN_REGIONS = [
  "asia-southeast1-eqsg3a",
  "europe-west4-drams3a",
  "us-east4-eqdc4a",
  "us-west2",
];
const MONGO_MIGRATION_LIMIT = {
  cpu: Number.parseFloat(process.env.MIGRATION_MONGO_CPU || "6"),
  memoryBytes: Number.parseInt(process.env.MIGRATION_MONGO_MEMORY_BYTES || "12000000000", 10),
};

function usage() {
  console.error(
    "Usage: node scripts/railway-postgres-cutover.js --project <projectId> [--delete-mongodb] [--no-freeze] [--chat-history-window all|latest-month]",
  );
}

function parseArgs(argv) {
  const args = {
    deleteMongo: false,
    freeze: true,
    projectId: "",
    chatHistoryWindow: (process.env.MIGRATION_CHAT_HISTORY_WINDOW || "latest-month").trim() || "latest-month",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      args.projectId = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--delete-mongodb") {
      args.deleteMongo = true;
    } else if (arg === "--no-freeze") {
      args.freeze = false;
    } else if (arg === "--chat-history-window") {
      args.chatHistoryWindow = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }
  if (!args.projectId) {
    usage();
    process.exit(2);
  }
  if (!["all", "latest-month"].includes(args.chatHistoryWindow)) {
    throw new Error("--chat-history-window must be all or latest-month");
  }
  return args;
}

function runRailway(args, options = {}) {
  const result = spawnSync("railway", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `railway ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout || "";
}

function parseJsonMixed(output) {
  const firstJson = output.search(/[\[{]/);
  if (firstJson < 0) {
    throw new Error(`No JSON in command output: ${output.slice(0, 200)}`);
  }
  return JSON.parse(output.slice(firstJson));
}

function railwayJson(args) {
  return parseJsonMixed(runRailway([...args, "--json"]));
}

function linkProject(projectId) {
  railwayJson(["link", "--project", projectId, "--environment", "production"]);
}

function getStatus() {
  return railwayJson(["status"]);
}

function getServiceInstances(status) {
  return (
    status.environments?.edges?.[0]?.node?.serviceInstances?.edges?.map((edge) => edge.node) ||
    []
  );
}

function findInstance(status, matcher) {
  return getServiceInstances(status).find(matcher) || null;
}

function findServiceByName(status, name) {
  return findInstance(status, (service) => service.serviceName === name);
}

function findWebService(status) {
  return findInstance(status, (service) => {
    const source = service.source || {};
    const meta = service.latestDeployment?.meta || {};
    return (
      service.serviceName === "web" ||
      source.repo === REPO ||
      meta.repo === REPO
    );
  });
}

function findMongoService(status) {
  return findInstance(status, (service) => {
    const image = service.source?.image || service.latestDeployment?.meta?.image || "";
    return service.serviceName === "MongoDB" || /mongo/i.test(image);
  });
}

function serviceIsActive(service) {
  return !!(
    service?.latestDeployment &&
    service.latestDeployment.status === "SUCCESS" &&
    !service.latestDeployment.deploymentStopped &&
    (service.activeDeployments || []).some((deployment) => deployment.status === "SUCCESS")
  );
}

function sourceBranch(service) {
  return service?.source?.branch || service?.latestDeployment?.meta?.branch || null;
}

function sourceRepo(service) {
  return service?.source?.repo || service?.latestDeployment?.meta?.repo || null;
}

function detectRegion(service) {
  const config =
    service?.latestDeployment?.meta?.serviceManifest?.deploy?.multiRegionConfig || {};
  return Object.keys(config)[0] || DEFAULT_REGION;
}

function currentRegions(service) {
  const config =
    service?.latestDeployment?.meta?.serviceManifest?.deploy?.multiRegionConfig || {};
  return Object.entries(config)
    .filter(([, value]) => Number(value?.numReplicas || 0) > 0)
    .map(([region]) => region);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForService(serviceId, label, options = {}) {
  const timeoutMs = options.timeoutMs || 10 * 60 * 1000;
  const terminalGraceMs = options.terminalGraceMs || 90 * 1000;
  const started = Date.now();
  let terminalSince = 0;
  while (Date.now() - started < timeoutMs) {
    const status = getStatus();
    const service = findInstance(status, (entry) => entry.serviceId === serviceId);
    const latestStatus = service?.latestDeployment?.status || "NO_DEPLOYMENT";
    const stopped = !!service?.latestDeployment?.deploymentStopped;
    const activeSuccess = (service?.activeDeployments || []).filter(
      (deployment) => deployment.status === "SUCCESS" && !deployment.deploymentStopped,
    ).length;
    console.log(
      `[railway-cutover] ${label}: ${latestStatus}${stopped ? " stopped" : ""} activeSuccess=${activeSuccess}`,
    );
    if (latestStatus === "SUCCESS" && !stopped) return service;
    if (["FAILED", "CRASHED"].includes(latestStatus)) {
      terminalSince ||= Date.now();
      if (activeSuccess > 0) {
        console.log(`[railway-cutover] ${label} latest is ${latestStatus} but an active deployment exists; waiting`);
        await sleep(10000);
        continue;
      }
      if (Date.now() - terminalSince < terminalGraceMs) {
        console.log(`[railway-cutover] ${label} latest is ${latestStatus}; waiting through Railway status grace period`);
        await sleep(10000);
        continue;
      }
      throw new Error(`${label} deployment failed`);
    }
    terminalSince = 0;
    await sleep(10000);
  }
  throw new Error(`${label} did not become healthy before timeout`);
}

async function waitForBranch(serviceId, branch, context = {}) {
  const timeoutMs = 3 * 60 * 1000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = getStatus();
    const service = findInstance(status, (entry) => entry.serviceId === serviceId);
    const current = sourceBranch(service);
    const activeSuccess = (service?.activeDeployments || []).filter(
      (deployment) => deployment.status === "SUCCESS" && !deployment.deploymentStopped,
    ).length;
    const trigger = context.projectId && context.environmentId
      ? await getDeploymentTrigger(context.projectId, context.environmentId, serviceId)
      : null;
    console.log(
      `[railway-cutover] branch check: deployment=${current || "unknown"} trigger=${trigger?.branch || "unknown"}`,
    );
    if (current === branch) return service;
    if ((!service?.latestDeployment || activeSuccess === 0) && trigger?.branch === branch) return service;
    await sleep(5000);
  }
  throw new Error(`web branch did not become ${branch}`);
}

async function waitForWebStopped(webService) {
  const timeoutMs = 10 * 60 * 1000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = getStatus();
    const web = findInstance(status, (entry) => entry.serviceId === webService.serviceId);
    const activeSuccess = (web?.activeDeployments || []).filter(
      (deployment) => deployment.status === "SUCCESS" && !deployment.deploymentStopped,
    ).length;
    const latestStatus = web?.latestDeployment?.status || "NO_DEPLOYMENT";
    const stopped = !!web?.latestDeployment?.deploymentStopped;
    console.log(
      `[railway-cutover] web stopped check: ${latestStatus}${stopped ? " stopped" : ""} activeSuccess=${activeSuccess}`,
    );
    if (activeSuccess === 0) {
      const domain = web?.domains?.serviceDomains?.[0]?.domain;
      if (!domain || (await webHealthUnavailable(domain))) return web;
      console.log("[railway-cutover] web has no active successful deployments but health still responds; waiting");
    }
    await sleep(10000);
  }
  throw new Error("web did not stop before timeout");
}

async function webHealthUnavailable(domain) {
  try {
    const response = await fetch(`https://${domain}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return true;
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {}
    return parsed?.status !== "OK";
  } catch (_) {
    return true;
  }
}

async function waitForServicePresence(label, matcher, options = {}) {
  const timeoutMs = options.timeoutMs || 3 * 60 * 1000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = getStatus();
    const service = findInstance(status, matcher);
    if (service) return service;
    console.log(`[railway-cutover] waiting for ${label} service`);
    await sleep(5000);
  }
  throw new Error(`${label} service not found before timeout`);
}

async function ensureSingaporeRegion(service, label, replicas = 1) {
  const regions = currentRegions(service);
  if (regions.length === 1 && regions[0] === DEFAULT_REGION) return service;

  console.log(`[railway-cutover] setting ${label} region to ${DEFAULT_REGION}`);
  const scaleArgs = ["scale", "--service", service.serviceId];
  for (const region of KNOWN_REGIONS) {
    scaleArgs.push(`--${region}`, region === DEFAULT_REGION ? String(replicas) : "0");
  }
  railwayJson(scaleArgs);
  return waitForService(service.serviceId, label);
}

async function ensureMongoMigrationResources(mongo, environmentId) {
  const limit =
    mongo?.latestDeployment?.meta?.serviceManifest?.deploy?.limitOverride?.containers || {};
  if (
    Number(limit.cpu || 0) >= MONGO_MIGRATION_LIMIT.cpu &&
    Number(limit.memoryBytes || 0) >= MONGO_MIGRATION_LIMIT.memoryBytes
  ) {
    return mongo;
  }

  console.log(
    `[railway-cutover] setting MongoDB migration limits cpu=${MONGO_MIGRATION_LIMIT.cpu} memoryBytes=${MONGO_MIGRATION_LIMIT.memoryBytes}`,
  );
  await graphQlRequest(
    `
      mutation ServiceInstanceLimitsUpdate($input: ServiceInstanceLimitsUpdateInput!) {
        serviceInstanceLimitsUpdate(input: $input)
      }
    `,
    {
      input: {
        environmentId,
        serviceId: mongo.serviceId,
        memoryGB: MONGO_MIGRATION_LIMIT.memoryBytes / 1000000000,
        vCPUs: MONGO_MIGRATION_LIMIT.cpu,
      },
    },
  );
  return waitForService(mongo.serviceId, "MongoDB");
}

function ensureMigrationTools() {
  const check = spawnSync(
    "node",
    ["-e", "require.resolve('mongodb')"],
    {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: TOOL_NODE_PATH },
    },
  );
  if (check.status === 0) return;

  fs.mkdirSync(TOOL_PREFIX, { recursive: true });
  console.log("[railway-cutover] installing temporary mongodb migration dependency");
  const install = spawnSync(
    "npm",
    ["install", "--prefix", TOOL_PREFIX, "mongodb@6.21.0"],
    { stdio: "inherit" },
  );
  if (install.status !== 0) {
    throw new Error("failed to install temporary mongodb dependency");
  }
}

async function ensureDatabaseServices() {
  let status = getStatus();
  let postgres = findServiceByName(status, "Postgres");
  if (!postgres) {
    console.log("[railway-cutover] adding Postgres service");
    railwayJson(["add", "--database", "postgres", "--service", "Postgres"]);
    postgres = await waitForServicePresence(
      "Postgres",
      (service) => service.serviceName === "Postgres" || /postgres/i.test(service.source?.image || ""),
    );
    postgres = await ensureSingaporeRegion(postgres, "Postgres");
  } else {
    postgres = await waitForService(postgres.serviceId, "Postgres");
    postgres = await ensureSingaporeRegion(postgres, "Postgres");
  }
  if (!postgres) throw new Error("Postgres service not found after add");

  status = getStatus();
  let redis = findServiceByName(status, "Redis");
  if (!redis) {
    console.log("[railway-cutover] adding Redis service");
    railwayJson(["add", "--database", "redis", "--service", "Redis"]);
    redis = await waitForServicePresence(
      "Redis",
      (service) => service.serviceName === "Redis" || /redis/i.test(service.source?.image || ""),
    );
    await ensureSingaporeRegion(redis, "Redis");
  } else {
    redis = await waitForService(redis.serviceId, "Redis");
    await ensureSingaporeRegion(redis, "Redis");
  }
  if (!redis) throw new Error("Redis service not found after add");
}

function slugify(value) {
  return String(value || "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project";
}

function ensureBucket(projectName) {
  let buckets = railwayJson(["bucket", "list"]);
  if (!Array.isArray(buckets)) buckets = [];
  if (!buckets.length) {
    const name = `${slugify(projectName)}-assets`;
    console.log(`[railway-cutover] creating bucket ${name}`);
    railwayJson(["bucket", "create", name, "--region", "sin"]);
    buckets = railwayJson(["bucket", "list"]);
  }
  if (!buckets.length) throw new Error("Bucket was not created");
  return buckets[0];
}

function getVariables(serviceName) {
  return railwayJson(["variable", "list", "--service", serviceName]);
}

function waitForVariable(serviceName, key, timeoutMs = 5 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const vars = getVariables(serviceName);
    if (vars[key]) return vars[key];
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
  throw new Error(`${serviceName}.${key} was not available`);
}

function setWebVariables(bucket, credentials, projectName) {
  const forcePathStyle = credentials.urlStyle === "path" ? "true" : "false";
  const prefix = slugify(projectName);
  const variables = [
    "DATABASE_URL=${{Postgres.DATABASE_URL}}",
    "REDIS_URL=${{Redis.REDIS_URL}}",
    "CHAT_STORAGE_MODE=postgres",
    "APP_DOCUMENT_MODE=postgres",
    "SESSION_STORE_MODE=postgres",
    "POSTGRES_NATIVE_READS=true",
    "POSTGRES_STATEMENT_TIMEOUT_MS=30000",
    "POSTGRES_MAX_POOL_SIZE=20",
    "POSTGRES_COMPAT_SCAN_LIMIT=50000",
    "DATABASE_SSL=false",
    "CHAT_ARCHIVE_EXPORT_ENABLED=true",
    "CHAT_HOT_RETENTION_DAYS=60",
    "ADMIN_CACHE_TTL_SECONDS=45",
    `BUCKET_NAME=${credentials.bucketName}`,
    `BUCKET_ENDPOINT=${credentials.endpoint}`,
    `BUCKET_REGION=${credentials.region || "auto"}`,
    `BUCKET_ACCESS_KEY_ID=${credentials.accessKeyId}`,
    `BUCKET_SECRET_ACCESS_KEY=${credentials.secretAccessKey}`,
    `BUCKET_FORCE_PATH_STYLE=${forcePathStyle}`,
    `BUCKET_KEY_PREFIX=${prefix}`,
  ];

  console.log(`[railway-cutover] setting required web variables (${variables.length})`);
  railwayJson([
    "variable",
    "set",
    "--service",
    "web",
    "--skip-deploys",
    ...variables,
  ]);
}

function runNodeScript(script, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [script, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
        NODE_PATH: [TOOL_NODE_PATH, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${code}`));
    });
  });
}

function runNodeScriptExitCode(script, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [script, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
        NODE_PATH: [TOOL_NODE_PATH, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code || 0));
  });
}

async function runFinalMigrationAndVerification(env) {
  const attempts = Math.max(
    1,
    Number.parseInt(process.env.MIGRATION_FINAL_VERIFY_ATTEMPTS || "5", 10) || 5,
  );
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`[railway-cutover] final delta attempt ${attempt}/${attempts}`);
    await runNodeScript("scripts/migrate-mongo-to-postgres.js", env, ["--migrate-only"]);
    const verifyCode = await runNodeScriptExitCode(
      "scripts/migrate-mongo-to-postgres.js",
      env,
      ["--verify-only"],
    );
    if (verifyCode === 0) return;
    console.warn(`[railway-cutover] final verification failed on attempt ${attempt}`);
    await sleep(10000);
  }
  throw new Error("final verification did not pass after retry attempts");
}

function runNpmScript(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm run ${script} exited with ${code}`));
    });
  });
}

function buildMigrationEnv({ mongoVars, postgresVars, bucketCredentials, projectName, chatHistoryWindow }) {
  const mongoUrl = mongoVars.MONGO_PUBLIC_URL || mongoVars.MONGO_URL;
  const databaseUrl = postgresVars.DATABASE_PUBLIC_URL || postgresVars.DATABASE_URL;
  if (!mongoUrl) throw new Error("MONGO_PUBLIC_URL is not available");
  if (!databaseUrl) throw new Error("DATABASE_PUBLIC_URL is not available");
  return {
    MONGODB_URI: mongoUrl,
    MONGODB_DATABASE: "chatbot",
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: "false",
    CHAT_STORAGE_MODE: "postgres",
    APP_DOCUMENT_MODE: "postgres",
    SESSION_STORE_MODE: "postgres",
    POSTGRES_NATIVE_READS: "true",
    POSTGRES_STATEMENT_TIMEOUT_MS: "30000",
    POSTGRES_MAX_POOL_SIZE: "10",
    POSTGRES_COMPAT_SCAN_LIMIT: "50000",
    CHAT_HOT_RETENTION_DAYS: "60",
    MIGRATION_CHAT_HISTORY_WINDOW: chatHistoryWindow,
    BUCKET_NAME: bucketCredentials.bucketName,
    BUCKET_ENDPOINT: bucketCredentials.endpoint,
    BUCKET_REGION: bucketCredentials.region || "auto",
    BUCKET_ACCESS_KEY_ID: bucketCredentials.accessKeyId,
    BUCKET_SECRET_ACCESS_KEY: bucketCredentials.secretAccessKey,
    BUCKET_FORCE_PATH_STYLE: bucketCredentials.urlStyle === "path" ? "true" : "false",
    BUCKET_KEY_PREFIX: slugify(projectName),
  };
}

function scaleWeb(webService, replicas) {
  const region = replicas > 0 ? DEFAULT_REGION : detectRegion(webService);
  console.log(`[railway-cutover] scaling web ${region}=${replicas}`);
  if (replicas === 0) {
    runRailway(["down", "--service", webService.serviceId, "--yes"]);
    return;
  }
  const args = ["scale", "--service", webService.serviceId];
  for (const knownRegion of KNOWN_REGIONS) {
    args.push(`--${knownRegion}`, knownRegion === region ? String(replicas) : "0");
  }
  railwayJson(args);
}

async function getDeploymentTrigger(projectId, environmentId, serviceId) {
  const data = await graphQlRequest(
    `
      query DeploymentTriggers($projectId: String!, $environmentId: String!, $serviceId: String!) {
        deploymentTriggers(
          projectId: $projectId
          environmentId: $environmentId
          serviceId: $serviceId
          first: 20
        ) {
          edges {
            node {
              id
              branch
              repository
              provider
              serviceId
            }
          }
        }
      }
    `,
    { projectId, environmentId, serviceId },
  );
  const triggers = data.deploymentTriggers?.edges?.map((edge) => edge.node) || [];
  return triggers.find((trigger) => trigger.repository === REPO) || triggers[0] || null;
}

async function setBranch(webService, projectId, environmentId) {
  console.log(`[railway-cutover] setting web deployment trigger branch=${TARGET_BRANCH}`);
  const trigger = await getDeploymentTrigger(projectId, environmentId, webService.serviceId);
  if (trigger) {
    await graphQlRequest(
      `
        mutation DeploymentTriggerUpdate($id: String!, $input: DeploymentTriggerUpdateInput!) {
          deploymentTriggerUpdate(id: $id, input: $input) {
            id
            branch
          }
        }
      `,
      { id: trigger.id, input: { branch: TARGET_BRANCH, repository: REPO } },
    );
    return;
  }

  await graphQlRequest(
    `
      mutation DeploymentTriggerCreate($input: DeploymentTriggerCreateInput!) {
        deploymentTriggerCreate(input: $input) {
          id
          branch
        }
      }
    `,
    {
      input: {
        branch: TARGET_BRANCH,
        checkSuites: false,
        environmentId,
        projectId,
        provider: "github",
        repository: REPO,
        serviceId: webService.serviceId,
      },
    },
  );
}

function redeployWeb(webService) {
  console.log("[railway-cutover] redeploying web");
  railwayJson(["deployment", "redeploy", "--service", webService.serviceId, "--yes"]);
}

function tryRedeployWeb(webService) {
  try {
    redeployWeb(webService);
  } catch (error) {
    console.warn(`[railway-cutover] redeploy skipped: ${error?.message || error}`);
  }
}

async function waitForHealth(domain) {
  if (!domain) throw new Error("No service domain available for health check");
  const url = `https://${domain}/health`;
  const timeoutMs = 10 * 60 * 1000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (_) {}
      console.log(
        `[railway-cutover] health ${response.status} ${parsed?.databaseBackend || ""}`,
      );
      if (
        response.ok &&
        parsed?.status === "OK" &&
        parsed?.database === "connected" &&
        parsed?.databaseBackend === "postgres"
      ) {
        return parsed;
      }
    } catch (error) {
      console.log(`[railway-cutover] health waiting: ${error?.message || error}`);
    }
    await sleep(10000);
  }
  throw new Error("health check did not pass before timeout");
}

function graphQlRequest(query, variables = {}) {
  const configPath = path.join(process.env.HOME || "", ".railway", "config.json");
  const token = JSON.parse(fs.readFileSync(configPath, "utf8"))?.user?.token;
  if (!token) throw new Error("Railway token not found");
  const body = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    const request = https.request(
      "https://backboard.railway.com/graphql/v2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (error) {
            reject(error);
            return;
          }
          if (parsed.errors?.length) {
            reject(new Error(parsed.errors.map((entry) => entry.message).join("; ")));
            return;
          }
          resolve(parsed.data);
        });
      },
    );
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function deleteMongoService(environmentId, serviceId) {
  console.log("[railway-cutover] deleting MongoDB service");
  await graphQlRequest(
    `
      mutation ServiceDelete($environmentId: String!, $serviceId: String!) {
        serviceDelete(environmentId: $environmentId, id: $serviceId)
      }
    `,
    { environmentId, serviceId },
  );
}

function deleteMongoWebVariables() {
  const webVars = getVariables("web");
  const keys = Object.keys(webVars).filter((key) => /^MONGO(DB)?_/i.test(key));
  for (const key of keys) {
    console.log(`[railway-cutover] deleting web variable ${key}`);
    const result = spawnSync(
      "railway",
      ["variable", "delete", key, "--service", "web", "--json"],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    if (result.status !== 0) {
      console.warn(`[railway-cutover] variable delete skipped ${key}: ${result.stderr || result.stdout}`);
    }
  }
}

function deleteMongoVolumes() {
  const list = railwayJson(["volume", "list"]);
  const volumes = Array.isArray(list.volumes) ? list.volumes : [];
  for (const volume of volumes) {
    if (
      /mongo/i.test(volume.name || "") ||
      /mongo/i.test(volume.serviceName || "") ||
      volume.mountPath === "/data/db"
    ) {
      console.log(`[railway-cutover] deleting volume ${volume.name || volume.id}`);
      railwayJson(["volume", "delete", "--volume", volume.id, "--yes"]);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!TARGET_BRANCH) throw new Error("Unable to resolve target git branch");
  ensureMigrationTools();

  linkProject(args.projectId);
  let status = getStatus();
  const projectName = status.name;
  const environmentId = status.environments?.edges?.[0]?.node?.id;
  let web = findWebService(status);
  const mongo = findMongoService(status);
  if (!web) throw new Error("web service not found");
  if (!mongo) throw new Error("MongoDB service not found");
  if (sourceRepo(web) !== REPO || sourceBranch(web) !== "main") {
    throw new Error(
      `web is not a ${REPO} main target (repo=${sourceRepo(web)} branch=${sourceBranch(web)})`,
    );
  }
  if (!serviceIsActive(web)) {
    console.log("[railway-cutover] web service is not active, skipping");
    return;
  }

  console.log(`[railway-cutover] project=${projectName} branch=${TARGET_BRANCH}`);
  web = await ensureSingaporeRegion(web, "web");
  let mongoForMigration = await ensureSingaporeRegion(mongo, "MongoDB");
  mongoForMigration = await ensureMongoMigrationResources(mongoForMigration, environmentId);
  await ensureDatabaseServices();
  status = getStatus();
  web = findWebService(status);
  const bucket = ensureBucket(projectName);
  const bucketCredentials = railwayJson([
    "bucket",
    "credentials",
    "--bucket",
    bucket.id || bucket.name,
  ]);
  setWebVariables(bucket, bucketCredentials, projectName);
  waitForVariable("Postgres", "DATABASE_PUBLIC_URL");
  waitForVariable("MongoDB", "MONGO_PUBLIC_URL");

  const mongoVars = getVariables("MongoDB");
  const postgresVars = getVariables("Postgres");
  const migrationEnv = buildMigrationEnv({
    mongoVars,
    postgresVars,
    bucketCredentials,
    projectName,
    chatHistoryWindow: args.chatHistoryWindow,
  });

  console.log("[railway-cutover] initial MongoDB -> Postgres migration");
  await runNodeScript("scripts/migrate-mongo-to-postgres.js", migrationEnv, ["--migrate-only"]);

  let webScaledDown = false;
  try {
    if (args.freeze) {
      scaleWeb(web, 0);
      webScaledDown = true;
      web = await waitForWebStopped(web);
      await sleep(15000);
    }

    console.log("[railway-cutover] final delta migration and verification");
    await runFinalMigrationAndVerification(migrationEnv);
    await runNpmScript("migrate:pg:native-performance", migrationEnv);
    await runNpmScript("verify:pg:native-performance", migrationEnv);

    await setBranch(web, args.projectId, environmentId);
    web = await waitForBranch(web.serviceId, TARGET_BRANCH, {
      projectId: args.projectId,
      environmentId,
    });
    if (args.freeze) {
      status = getStatus();
      web = findWebService(status);
      scaleWeb(web, 1);
      webScaledDown = false;
    }
    tryRedeployWeb(web);
    web = await waitForService(web.serviceId, "web", { timeoutMs: 20 * 60 * 1000 });
    web = await waitForBranch(web.serviceId, TARGET_BRANCH, {
      projectId: args.projectId,
      environmentId,
    });
    const domain = web.domains?.serviceDomains?.[0]?.domain;
    await waitForHealth(domain);

    console.log("[railway-cutover] post-deploy verification");
    await runNodeScript(
      "scripts/migrate-mongo-to-postgres.js",
      { ...migrationEnv, MIGRATION_ALLOW_TARGET_EXTRAS: "true" },
      ["--verify-only"],
    );
    await runNpmScript("verify:pg:native-performance", migrationEnv);
  } catch (error) {
    if (webScaledDown) {
      console.warn("[railway-cutover] restoring web scale after failed frozen cutover");
      try {
        status = getStatus();
        web = findWebService(status);
        if (web) scaleWeb(web, 1);
      } catch (restoreError) {
        console.warn(
          `[railway-cutover] failed to restore web scale: ${restoreError?.message || restoreError}`,
        );
      }
    }
    throw error;
  }

  if (args.deleteMongo) {
    deleteMongoWebVariables();
    await deleteMongoService(environmentId, mongo.serviceId);
    await sleep(5000);
    deleteMongoVolumes();
  } else {
    console.log("[railway-cutover] MongoDB deletion skipped; pass --delete-mongodb to delete it");
  }

  status = getStatus();
  const remainingMongo = findMongoService(status);
  if (remainingMongo && args.deleteMongo) {
    throw new Error("MongoDB service still exists after delete");
  }

  console.log(
    `[railway-cutover] complete project=${projectName} mongoDeleted=${args.deleteMongo}`,
  );
}

main()
  .catch((error) => {
    console.error("[railway-cutover] failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      runRailway(["link", "--project", REVIEW_PROJECT_ID, "--environment", "production", "--json"]);
    } catch (_) {}
  });
