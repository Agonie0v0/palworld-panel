const http = require("http");
const https = require("https");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const os = require("os");
const net = require("net");
const crypto = require("crypto");
const packageInfo = require("../package.json");
const { createUpstreamCompatibility } = require("./upstream-compat");
const { createAdvancedFeatures } = require("./advanced-features");

const rootDir = path.resolve(__dirname, "..");
const configPath = process.env.PAL_PANEL_CONFIG || path.join(rootDir, "data", "config.json");
const dataDir = path.dirname(configPath);
const upstreamPublicDir = path.join(rootDir, "upstream-web", "dist");
const upstreamSourcePublicDir = path.join(rootDir, "upstream-web", "public");
const publicDir = fs.existsSync(path.join(upstreamPublicDir, "index.html"))
  ? upstreamPublicDir
  : path.join(rootDir, "public");
const deployScriptPath = path.join(rootDir, "scripts", "deploy-palworld-server.sh");
const agentRuntime = process.env.AGENT_MODE === "1";
const authTokenTtlSeconds = 24 * 60 * 60;

let previousOnlinePlayers = null;
let schedulerRunning = false;
const schedulerState = {
  playerSync: 0,
  saveSync: 0,
  backup: 0,
  broadcast: 0,
  rconTasks: 0,
  watchdog: 0,
  watchdogFailures: 0,
  memoryBreaches: 0,
  pendingRestart: false,
  lastManagedRestart: 0,
  lastScheduledRestart: Date.now(),
  lastWatchdogCheck: 0,
  lastWatchdogAction: "",
  lastWatchdogError: ""
};

const defaultConfig = {
  panel: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 19090),
    token: process.env.PANEL_TOKEN || "change-me",
    adminInitialized: false,
    adminUser: "",
    adminPasswordHash: "",
    adminPasswordSalt: ""
  },
  server: {
    mode: "systemd",
    serviceName: "palworld",
    installDir: "/opt/palworld/server",
    settingsPath: "/opt/palworld/server/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
    saveDir: "/opt/palworld/server/Pal/Saved",
    backupDir: "/opt/palworld/backups",
    steamcmdPath: "/opt/steamcmd/steamcmd.sh",
    containerName: "",
    imageName: "",
    composeProjectDir: "",
    rconHost: "127.0.0.1",
    rconPort: 25575,
    restHost: "127.0.0.1",
    restPort: 8212,
    restProtocol: "http:",
    restUser: "admin",
    restPassword: "",
    publicPort: 8211,
    saveParserCommand: process.env.SAVE_PARSER_COMMAND || ""
  },
  automation: {
    backupIntervalMinutes: 0,
    backupIntervalSeconds: 0,
    broadcastIntervalMinutes: 0,
    broadcastMessage: "",
    keepBackups: 20,
    rconTaskCheckSeconds: 30,
    backupKeepDays: 7,
    playerSyncInterval: 60,
    saveSyncInterval: 120,
    saveSourceMode: "directory",
    saveSourcePath: "",
    playerLogging: false,
    playerLoginMessage: "",
    playerLogoutMessage: "",
    kickNonWhitelist: false,
    rconUseBase64: false,
    rconTimeout: 5,
    restTimeout: 5,
    webTls: false,
    webCertPath: "",
    webKeyPath: "",
    webPublicUrl: "",
    watchdogEnabled: false,
    watchdogCheckIntervalSeconds: 30,
    watchdogAutoRestart: false,
    watchdogFailureThreshold: 3,
    watchdogMemoryThresholdPercent: 0,
    watchdogMemoryBreachChecks: 2,
    watchdogRestartCooldownMinutes: 15,
    scheduledRestartIntervalHours: 0,
    maintenanceWarningSeconds: 60,
    maintenanceWarningMessage: "Server maintenance restart in {seconds} seconds.",
    backupBeforeManagedRestart: true
  },
  settings: {
    ServerName: "Palworld 1.0 Oracle ARM",
    ServerDescription: "Managed by palworld-oneclick-panel",
    AdminPassword: "change-admin-password",
    ServerPassword: "",
    PublicPort: 8211,
    RCONEnabled: true,
    RCONPort: 25575,
    RESTAPIEnabled: true,
    RESTAPIPort: 8212,
    Difficulty: "None",
    DayTimeSpeedRate: 1,
    NightTimeSpeedRate: 1,
    ExpRate: 1,
    PalCaptureRate: 1,
    DeathPenalty: "All"
  }
};

const defaultRconTemplates = [
  { id: "show-players", name: "查看在线玩家", command: "ShowPlayers" },
  { id: "broadcast", name: "广播公告", command: "Broadcast 服务器公告" },
  { id: "save", name: "保存服务器", command: "Save" },
  { id: "shutdown", name: "平滑关服", command: "Shutdown 60 Server restart" }
];

function hostProfile() {
  const arch = os.arch();
  const platform = os.platform();
  const inContainer = fs.existsSync("/.dockerenv");
  return {
    platform,
    arch,
    inContainer,
    supported: platform === "linux" && !inContainer,
    runner: arch === "arm64" || arch === "aarch64" ? "box64" : "native",
    recommendedMode: inContainer ? "docker-existing-server" : "systemd"
  };
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function mergeConfig(base, override) {
  return {
    panel: { ...base.panel, ...(override.panel || {}) },
    server: { ...base.server, ...(override.server || {}) },
    automation: { ...base.automation, ...(override.automation || {}) },
    settings: { ...base.settings, ...(override.settings || {}) }
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expected) {
  if (!salt || !expected) return false;
  const { hash } = hashPassword(password, salt);
  const actualBuffer = Buffer.from(hash);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function authSigningKey(config) {
  const material = config.panel.adminPasswordHash || effectivePanelToken(config) || "change-me";
  return crypto.createHash("sha256").update(String(material)).digest();
}

const rolePermissions = {
  admin: ["*"],
  operator: [
    "read",
    "server:write",
    "players:write",
    "backups:write",
    "mods:write",
    "schedules:write",
  ],
  viewer: ["read"],
  integration: ["integrations:write"],
};

function permissionsForRole(role) {
  return rolePermissions[role] || rolePermissions.viewer;
}

function issueAuthToken(config, now = Date.now(), principal = {}) {
  const issuedAt = Math.floor(now / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    sub: principal.name || config.panel.adminUser || "admin",
    uid: principal.id || "primary",
    role: principal.role || "admin",
    ver: Number(principal.tokenVersion || 1),
    iat: issuedAt,
    exp: issuedAt + authTokenTtlSeconds
  }));
  const signature = crypto.createHmac("sha256", authSigningKey(config)).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function decodeAuthToken(config, token, now = Date.now()) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", authSigningKey(config)).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const current = Math.floor(now / 1000);
    return Number(payload.exp) > current && Number(payload.iat) <= current + 60 ? payload : null;
  } catch {
    return null;
  }
}

function verifyAuthToken(config, token, now = Date.now()) {
  return Boolean(decodeAuthToken(config, token, now));
}

async function ensureConfig() {
  await fsp.mkdir(dataDir, { recursive: true });
  if (!fs.existsSync(configPath)) {
    await writeJson(configPath, defaultConfig);
  }
}

async function loadConfig() {
  await ensureConfig();
  const raw = await fsp.readFile(configPath, "utf8");
  const merged = mergeConfig(defaultConfig, JSON.parse(raw));
  if (process.env.HOST) merged.panel.host = process.env.HOST;
  if (process.env.PORT) merged.panel.port = Number(process.env.PORT);
  if (process.env.SAVE_PARSER_COMMAND) merged.server.saveParserCommand = process.env.SAVE_PARSER_COMMAND;
  return merged;
}

async function saveConfig(nextConfig) {
  const merged = mergeConfig(defaultConfig, nextConfig);
  await writeJson(configPath, merged);
  return merged;
}

async function writeJson(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message });
}

function effectivePanelToken(config) {
  const environmentToken = process.env.PANEL_TOKEN;
  return environmentToken && environmentToken !== "change-me" ? environmentToken : config.panel.token;
}

function isAuthorized(req, config) {
  const expected = effectivePanelToken(config);
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  return (Boolean(expected) && expected !== "change-me" && token === expected) || verifyAuthToken(config, token);
}

function publicPrincipal(user) {
  return {
    id: user.id,
    name: user.username || user.name,
    role: user.role || "viewer",
    permissions: permissionsForRole(user.role || "viewer"),
    primary: Boolean(user.primary),
    createdAt: user.createdAt || "",
  };
}

async function listAccessUsers(config) {
  const stored = await loadJsonFile("access-users.json", []);
  return [
    {
      id: "primary",
      username: config.panel.adminUser || "admin",
      role: "admin",
      passwordSalt: config.panel.adminPasswordSalt,
      passwordHash: config.panel.adminPasswordHash,
      tokenVersion: 1,
      primary: true,
      createdAt: "",
    },
    ...(Array.isArray(stored) ? stored : []),
  ];
}

async function authenticateRequest(req, config) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const staticToken = effectivePanelToken(config);
  if (staticToken && staticToken !== "change-me" && token === staticToken) {
    return publicPrincipal({ id: "token", username: config.panel.adminUser || "admin", role: "admin", primary: true });
  }

  const jwt = decodeAuthToken(config, token);
  if (jwt) {
    const users = await listAccessUsers(config);
    const user = users.find((row) => row.id === (jwt.uid || "primary"));
    if (!user || Number(user.tokenVersion || 1) !== Number(jwt.ver || 1)) return null;
    return publicPrincipal(user);
  }

  if (token.startsWith("pal_")) {
    const keys = await loadJsonFile("api-keys.json", []);
    const digest = crypto.createHash("sha256").update(token).digest("hex");
    const key = (Array.isArray(keys) ? keys : []).find((row) => row.hash === digest && !row.revokedAt);
    if (!key) return null;
    key.lastUsedAt = new Date().toISOString();
    await saveJsonFile("api-keys.json", keys);
    return {
      id: `key:${key.id}`,
      name: key.name,
      role: key.role || "viewer",
      permissions: Array.isArray(key.permissions) && key.permissions.length
        ? key.permissions
        : permissionsForRole(key.role || "viewer"),
      apiKey: true,
    };
  }
  return null;
}

function requiredPermission(req) {
  const pathname = new URL(req.url, "http://panel.local").pathname;
  if (
    pathname.startsWith("/api/access/") ||
    pathname.startsWith("/api/security/") ||
    pathname.includes("/workshop/config") ||
    pathname.includes("/astrbot/config")
  ) return "security:write";
  if (pathname.includes("astrbot")) return "integrations:write";
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return "read";
  if (pathname.includes("backup")) return "backups:write";
  if (pathname.includes("mod") || pathname.includes("workshop")) return "mods:write";
  if (pathname.includes("schedule") || pathname.includes("rcon/task")) return "schedules:write";
  if (pathname.includes("player") || pathname.includes("whitelist") || pathname.includes("broadcast")) return "players:write";
  return "server:write";
}

function principalCan(principal, permission) {
  const permissions = principal?.permissions || [];
  return permissions.includes("*") || permissions.includes(permission);
}

async function loadJsonFile(name, fallback) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(await fsp.readFile(file, "utf8"));
}

async function saveJsonFile(name, data) {
  const file = path.join(dataDir, name);
  await writeJson(file, data);
  return data;
}

async function loadAgentConfig() {
  return loadJsonFile("agent.json", {
    enabled: false,
    mode: "local",
    endpoint: "",
    token: ""
  });
}

function agentIsEnabled(agent) {
  return Boolean(agent && agent.enabled && agent.mode === "remote" && agent.endpoint);
}

function agentEndpoint(agent, pathname) {
  const endpoint = new URL(agent.endpoint);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error("Agent address must use http:// or https://.");
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}${pathname}`;
  endpoint.search = "";
  return endpoint;
}

function requestAgent(agent, pathname, options = {}) {
  const endpoint = agentEndpoint(agent, pathname);
  const transport = endpoint.protocol === "https:" ? https : http;
  const body = options.body ? JSON.stringify(options.body) : "";
  return new Promise((resolve, reject) => {
    const req = transport.request(endpoint, {
      method: options.method || "GET",
      headers: {
        "x-agent-token": agent.token || "",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      },
      timeout: options.timeout || 30000
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          return reject(new Error(`Agent returned invalid data (${res.statusCode}).`));
        }
        if (res.statusCode >= 400 || data.ok === false) return reject(new Error(data.error || `Agent request failed (${res.statusCode}).`));
        resolve(data);
      });
    });
    req.on("timeout", () => req.destroy(new Error("Agent connection timed out.")));
    req.on("error", reject);
    req.end(body);
  });
}

async function agentCall(operation, payload = {}) {
  const agent = await loadAgentConfig();
  if (!agentIsEnabled(agent)) return { remote: false, value: null };
  const response = await requestAgent(agent, "/agent/rpc", {
    method: "POST",
    body: { operation, payload },
    timeout: ["deploy", "action", "saveData", "saveEntity", "mapMarkers", "restoreBackup", "settings"].includes(operation)
      ? 35 * 60 * 1000
      : 30000
  });
  return { remote: true, value: response.value };
}

async function managedCall(operation, payload, localCall) {
  const remote = await agentCall(operation, payload);
  return remote.remote ? remote.value : localCall();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function exec(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 120000, ...options }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === "number" ? error.code : 0,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim()
      });
    });
  });
}

async function dockerCompose(config, args) {
  const options = { cwd: config.server.composeProjectDir || config.server.installDir };
  const modern = await exec("docker", ["compose", ...args], options);
  if (modern.ok) return modern;
  const legacy = await exec("docker-compose", args, options);
  return legacy.ok ? legacy : modern;
}

async function deployServer(config, body = {}) {
  const profile = hostProfile();
  if (!profile.supported) {
    return {
      ok: false,
      stdout: "",
      stderr: profile.inContainer
        ? "One-click systemd deployment is disabled inside Docker. Install the panel on the host with scripts/install-panel.sh, or manage an existing Palworld Docker container."
        : "One-click server deployment currently runs on Linux hosts only."
    };
  }

  const nextSettings = {
    ...config.settings,
    ServerName: body.serverName || config.settings.ServerName,
    ServerDescription: body.serverDescription || config.settings.ServerDescription,
    AdminPassword: body.adminPassword || config.settings.AdminPassword,
    ServerPassword: body.serverPassword ?? config.settings.ServerPassword,
    PublicPort: Number(body.publicPort || config.settings.PublicPort || 8211),
    RCONEnabled: true,
    RCONPort: Number(body.rconPort || config.settings.RCONPort || 25575),
    RESTAPIEnabled: true,
    RESTAPIPort: Number(body.restPort || config.settings.RESTAPIPort || 8212)
  };
  const installDir = body.installDir || config.server.installDir;
  const appRoot = path.dirname(installDir);
  const updaterPath = body.steamcmdPath
    || (hostProfile().runner === "box64" ? "/opt/depotdownloader/DepotDownloader" : config.server.steamcmdPath)
    || "/opt/steamcmd/steamcmd.sh";
  const nextConfig = await saveConfig({
    ...config,
    server: {
      ...config.server,
      mode: "systemd",
      serviceName: body.serviceName || config.server.serviceName || "palworld",
      installDir,
      settingsPath: path.join(installDir, "Pal", "Saved", "Config", "LinuxServer", "PalWorldSettings.ini"),
      saveDir: path.join(installDir, "Pal", "Saved"),
      backupDir: body.backupDir || path.join(appRoot, "backups"),
      steamcmdPath: updaterPath,
      rconHost: "127.0.0.1",
      rconPort: nextSettings.RCONPort,
      restHost: "127.0.0.1",
      restPort: nextSettings.RESTAPIPort,
      publicPort: nextSettings.PublicPort
    },
    settings: nextSettings
  });

  return exec("bash", [deployScriptPath], {
    timeout: 30 * 60 * 1000,
    env: {
      ...process.env,
      APP_ROOT: appRoot,
      SERVER_DIR: nextConfig.server.installDir,
      BACKUP_DIR: nextConfig.server.backupDir,
      STEAMCMD_DIR: "/opt/steamcmd",
      DEPOT_DOWNLOADER_DIR: "/opt/depotdownloader",
      SERVICE_NAME: nextConfig.server.serviceName,
      SERVER_NAME: nextSettings.ServerName,
      SERVER_DESCRIPTION: nextSettings.ServerDescription,
      ADMIN_PASSWORD: nextSettings.AdminPassword,
      SERVER_PASSWORD: nextSettings.ServerPassword,
      PUBLIC_PORT: String(nextSettings.PublicPort),
      RCON_PORT: String(nextSettings.RCONPort),
      REST_PORT: String(nextSettings.RESTAPIPort),
      AUTO_START: body.autoStart ? "1" : "0"
    }
  });
}

function packet(id, type, body) {
  const payload = Buffer.from(String(body), "utf8");
  const buffer = Buffer.alloc(payload.length + 14);
  buffer.writeInt32LE(payload.length + 10, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  payload.copy(buffer, 12);
  return buffer;
}

function parsePacketFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const size = buffer.readInt32LE(offset);
    if (offset + 4 + size > buffer.length) break;
    frames.push({
      id: buffer.readInt32LE(offset + 4),
      type: buffer.readInt32LE(offset + 8),
      body: buffer.toString("utf8", offset + 12, offset + 4 + size - 2)
    });
    offset += 4 + size;
  }
  return frames;
}

function parsePackets(buffer) {
  return parsePacketFrames(buffer).map((frame) => frame.body).join("");
}

function encodeRconCommand(command, useBase64) {
  return useBase64 ? Buffer.from(String(command), "utf8").toString("base64") : String(command);
}

function decodeRconResponse(response, useBase64) {
  if (!useBase64 || !response) return response;
  try {
    const encoded = String(response).trim();
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return response;
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) return response;
    return decoded.toString("utf8");
  } catch {
    return response;
  }
}

function rcon(config, command) {
  const password = config.settings.AdminPassword;
  const useBase64 = Boolean(config.automation.rconUseBase64);
  const timeoutSeconds = Math.max(0, Number(config.automation.rconTimeout ?? 5));
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: config.server.rconHost,
      port: Number(config.server.rconPort)
    });
    const chunks = [];
    let authed = false;
    let settled = false;
    const done = (ok, output) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const decoded = decodeRconResponse(String(output || "").trim(), useBase64);
      resolve({ ok, stdout: decoded.trim(), stderr: ok ? "" : decoded.trim() });
    };
    if (timeoutSeconds > 0) socket.setTimeout(timeoutSeconds * 1000);
    socket.on("connect", () => socket.write(packet(1, 3, password)));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const buffered = Buffer.concat(chunks);
      const frames = parsePacketFrames(buffered);
      if (!authed && frames.some((frame) => frame.id === -1)) return done(false, "RCON authentication failed.");
      if (!authed && frames.length) {
        authed = true;
        chunks.length = 0;
        socket.write(packet(2, 2, encodeRconCommand(command, useBase64)));
        socket.write(packet(3, 0, ""));
        setTimeout(() => done(true, parsePackets(Buffer.concat(chunks))), 250);
      }
    });
    socket.on("timeout", () => done(false, "RCON connection timed out."));
    socket.on("error", (error) => done(false, error.message));
  });
}

function restRequest(config, endpoint, options = {}) {
  const password = config.server.restPassword || config.settings.AdminPassword;
  const auth = Buffer.from(`${config.server.restUser}:${password}`).toString("base64");
  const body = options.body ? JSON.stringify(options.body) : "";
  const protocol = config.server.restProtocol === "https:" ? "https:" : "http:";
  const transport = protocol === "https:" ? https : http;
  const timeoutSeconds = Math.max(0, Number(options.timeout ?? config.automation.restTimeout ?? 5));
  return new Promise((resolve) => {
    const req = transport.request(
      {
        host: config.server.restHost,
        port: Number(config.server.restPort),
        path: endpoint,
        method: options.method || "GET",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        },
        timeout: timeoutSeconds > 0 ? timeoutSeconds * 1000 : undefined
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve({ ok: res.statusCode < 400, status: res.statusCode, data: raw ? JSON.parse(raw) : null });
          } catch {
            resolve({ ok: res.statusCode < 400, status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "REST API connection timed out." });
    });
    req.end(body);
  });
}

async function firstRest(config, endpoints) {
  const results = [];
  for (const endpoint of endpoints) {
    const result = await restRequest(config, endpoint);
    results.push({ endpoint, ...result });
    if (result.ok) return { endpoint, ...result };
  }
  return { ok: false, results };
}

async function serviceStatus(config) {
  if (config.server.mode === "docker") {
    if (config.server.containerName) {
      const running = await exec("docker", ["inspect", "-f", "{{.State.Running}}", config.server.containerName]);
      return {
        manager: "docker",
        running: running.stdout === "true",
        detail: running.stdout || running.stderr || "No docker container status returned."
      };
    }

    const result = await dockerCompose(config, ["ps", "--format", "json"]);
    return {
      manager: "docker compose",
      running: result.ok && result.stdout.includes("running"),
      detail: result.stdout || result.stderr || "No docker compose status returned."
    };
  }

  const active = await exec("systemctl", ["is-active", config.server.serviceName]);
  const enabled = await exec("systemctl", ["is-enabled", config.server.serviceName]);
  return {
    manager: "systemd",
    running: active.stdout === "active",
    active: active.stdout || active.stderr,
    enabled: enabled.stdout || enabled.stderr
  };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, Math.round(number * 10) / 10));
}

function parseDfOutput(output) {
  const lines = String(output || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const columns = lines[lines.length - 1].trim().split(/\s+/);
  if (columns.length < 6) return null;
  const total = Number(columns[1]) * 1024;
  const used = Number(columns[2]) * 1024;
  const available = Number(columns[3]) * 1024;
  if (![total, used, available].every(Number.isFinite)) return null;
  return {
    filesystem: columns[0],
    total,
    used,
    available,
    usedPercent: clampPercent(String(columns[4]).replace("%", "")),
    mount: columns.slice(5).join(" ")
  };
}

function parsePsOutput(output) {
  const line = String(output || "").trim().split(/\r?\n/).find(Boolean);
  if (!line) return null;
  const match = line.trim().match(/^([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(.+)$/);
  if (!match) return null;
  return {
    cpuPercent: clampPercent(match[1]),
    memoryPercent: clampPercent(match[2]),
    memoryBytes: Number(match[3]) * 1024,
    uptimeSeconds: Number(match[4]),
    command: match[5]
  };
}

async function existingDiskTarget(target) {
  let current = path.resolve(target || os.homedir());
  while (current !== path.dirname(current)) {
    if (fs.existsSync(current)) return current;
    current = path.dirname(current);
  }
  return fs.existsSync(current) ? current : os.homedir();
}

async function diskMetrics(target) {
  if (os.platform() === "win32") return null;
  const result = await exec("df", ["-Pk", await existingDiskTarget(target)]);
  return result.ok ? parseDfOutput(result.stdout) : null;
}

async function serviceProcessId(config) {
  if (config.server.mode === "docker") {
    let container = config.server.containerName;
    if (!container) {
      const result = await dockerCompose(config, ["ps", "-q"]);
      container = result.stdout.split(/\r?\n/).find(Boolean) || "";
    }
    if (!container) return 0;
    const result = await exec("docker", ["inspect", "-f", "{{.State.Pid}}", container]);
    return result.ok ? Number(result.stdout) || 0 : 0;
  }
  const result = await exec("systemctl", ["show", config.server.serviceName, "--property", "MainPID", "--value"]);
  return result.ok ? Number(result.stdout) || 0 : 0;
}

async function processMetrics(config, running) {
  if (!running || os.platform() === "win32") return null;
  const pid = await serviceProcessId(config);
  if (!pid) return null;
  const result = await exec("ps", ["-p", String(pid), "-o", "%cpu=,%mem=,rss=,etimes=,comm="]);
  const metrics = result.ok ? parsePsOutput(result.stdout) : null;
  return metrics ? { pid, ...metrics } : { pid };
}

async function collectHostMetrics(config) {
  const cpus = os.cpus() || [];
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = Math.max(0, totalMemory - freeMemory);
  const loadAverage = os.loadavg();
  const status = await serviceStatus(config);
  const [disk, serverProcess] = await Promise.all([
    diskMetrics(config.server.installDir),
    processMetrics(config, status.running)
  ]);
  return {
    collectedAt: new Date().toISOString(),
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptimeSeconds: os.uptime(),
    cpu: {
      model: cpus[0]?.model || "",
      cores: cpus.length,
      loadAverage,
      usedPercent: cpus.length ? clampPercent((Number(loadAverage[0]) / cpus.length) * 100) : 0
    },
    memory: {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      usedPercent: totalMemory ? clampPercent((usedMemory / totalMemory) * 100) : 0
    },
    disk,
    service: status,
    process: serverProcess
  };
}

async function liveServerData(config) {
  const [info, players, metrics, settings] = await Promise.all([
    firstRest(config, ["/v1/api/info", "/api/info"]),
    firstRest(config, ["/v1/api/players", "/api/players"]),
    firstRest(config, ["/v1/api/metrics", "/api/metrics"]),
    firstRest(config, ["/v1/api/settings", "/api/settings"])
  ]);
  return { info, players, metrics, settings };
}

async function runAction(action, config) {
  const service = config.server.serviceName;
  if (config.server.mode === "docker") {
    if (config.server.containerName) {
      const dockerActions = {
        start: ["start", config.server.containerName],
        stop: ["stop", config.server.containerName],
        restart: ["restart", config.server.containerName]
      };
      if (action === "update") {
        if (!config.server.imageName) {
          return { ok: false, stdout: "", stderr: "server.imageName is required for Docker image updates." };
        }
        const pull = await exec("docker", ["pull", config.server.imageName]);
        if (!pull.ok) return pull;
        return exec("docker", ["restart", config.server.containerName]);
      }
      if (!dockerActions[action]) throw new Error("Unsupported action.");
      return exec("docker", dockerActions[action]);
    }

    const dockerActions = {
      start: ["up", "-d"],
      stop: ["down"],
      restart: ["restart"],
      update: ["pull"]
    };
    if (!dockerActions[action]) throw new Error("Unsupported action.");
    return dockerCompose(config, dockerActions[action]);
  }

  const systemdActions = {
    start: ["start", service],
    stop: ["stop", service],
    restart: ["restart", service],
    update: ["restart", service]
  };
  if (!systemdActions[action]) throw new Error("Unsupported action.");

  if (action === "update") {
    const stop = await exec("systemctl", ["stop", service]);
    if (!stop.ok) return stop;
    const depotDownloader = path.basename(config.server.steamcmdPath).toLowerCase().includes("depotdownloader");
    const updateArgs = depotDownloader
      ? ["-app", "2394010", "-dir", config.server.installDir, "-validate"]
      : [
        "+force_install_dir",
        config.server.installDir,
        "+login",
        "anonymous",
        "+app_update",
        "2394010",
        "validate",
        "+quit"
      ];
    const update = await exec(config.server.steamcmdPath, updateArgs, { timeout: 30 * 60 * 1000 });
    if (!update.ok) {
      await exec("systemctl", ["start", service]);
      return update;
    }
    return exec("systemctl", ["start", service]);
  }
  return exec("systemctl", systemdActions[action]);
}

function remoteSaveSourceUrl(config) {
  return String(config.automation.saveSourcePath || "").trim();
}

function requestRemoteFile(url, destination, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    let endpoint;
    try {
      endpoint = new URL(url);
    } catch {
      reject(new Error("Save Agent URL is invalid."));
      return;
    }
    if (!['http:', 'https:'].includes(endpoint.protocol)) {
      reject(new Error("Save Agent URL must use http:// or https://."));
      return;
    }
    const transport = endpoint.protocol === "https:" ? https : http;
    const request = transport.get(endpoint, { timeout: options.timeout || 30000 }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirects >= 5) return reject(new Error("Save Agent returned too many redirects."));
        return resolve(requestRemoteFile(new URL(response.headers.location, endpoint).toString(), destination, options, redirects + 1));
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Save Agent request failed (${response.statusCode}).`));
        return;
      }
      if (options.probeOnly) {
        response.destroy();
        resolve({ ok: true, status: response.statusCode, contentType: response.headers["content-type"] || "" });
        return;
      }
      const output = fs.createWriteStream(destination, { mode: 0o600 });
      response.pipe(output);
      output.on("finish", () => output.close(() => resolve({ ok: true, status: response.statusCode })));
      output.on("error", reject);
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Save Agent connection timed out.")));
    request.on("error", reject);
  });
}

async function testSaveSource(sourceMode, target) {
  if (!target) return { status: "unconfigured", message: "Save path is empty." };
  if (sourceMode === "agent") {
    try {
      const result = await requestRemoteFile(target, "", { probeOnly: true, timeout: 15000 });
      return { status: "normal", message: `Save Agent responded with HTTP ${result.status}.` };
    } catch (error) {
      return { status: "error", message: error.message };
    }
  }
  if (!fs.existsSync(target)) return { status: "error", message: "Save path does not exist." };
  return { status: "normal", message: path.resolve(target) };
}

async function prepareSaveSource(config, purpose) {
  if (config.automation.saveSourceMode !== "agent") {
    const configuredSource = purpose === "decode" && config.automation.saveSourcePath
      ? config.automation.saveSourcePath
      : config.server.saveDir;
    return { directory: path.resolve(configuredSource), cleanup: async () => {} };
  }
  const sourceUrl = remoteSaveSourceUrl(config);
  if (!sourceUrl) throw new Error("Save Agent URL is not configured.");
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), `palworld-save-${purpose}-`));
  const zipFile = path.join(tempDir, "sav.zip");
  const extracted = path.join(tempDir, "extracted");
  try {
    await fsp.mkdir(extracted, { recursive: true });
    await requestRemoteFile(sourceUrl, zipFile, { timeout: 5 * 60 * 1000 });
    const python = process.env.PYTHON || (os.platform() === "win32" ? "python" : "python3");
    const unpack = await exec(python, ["-m", "zipfile", "-e", zipFile, extracted], { timeout: 5 * 60 * 1000 });
    if (!unpack.ok) throw new Error(unpack.stderr || unpack.stdout || "Unable to extract Save Agent archive.");
    return { directory: extracted, cleanup: () => fsp.rm(tempDir, { recursive: true, force: true }) };
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function createBackup(config) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fsp.mkdir(config.server.backupDir, { recursive: true });
  const target = path.join(config.server.backupDir, `palworld-save-${stamp}.tar.gz`);
  const source = config.automation.saveSourceMode === "agent"
    ? await prepareSaveSource(config, "backup")
    : { directory: config.server.saveDir, cleanup: async () => {} };
  try {
    const result = await exec("tar", ["-czf", target, "-C", source.directory, "."]);
    return { ...result, backup: target };
  } finally {
    await source.cleanup();
  }
}

async function listBackups(config) {
  await fsp.mkdir(config.server.backupDir, { recursive: true });
  const entries = await fsp.readdir(config.server.backupDir, { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && (entry.name.endsWith(".tar.gz") || entry.name.endsWith(".zip")))
      .map(async (entry) => {
        const file = path.join(config.server.backupDir, entry.name);
        const stat = await fsp.stat(file);
        return { name: entry.name, path: file, size: stat.size, mtime: stat.mtime.toISOString() };
      })
  );
  return backups.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

async function sendBackupFile(req, res, config, name) {
  const file = safeBackupPath(config, name);
  const stat = await fsp.stat(file);
  res.writeHead(200, {
    "content-type": file.endsWith(".zip") ? "application/zip" : "application/gzip",
    "content-length": stat.size,
    "content-disposition": `attachment; filename="${path.basename(file)}"`
  });
  fs.createReadStream(file).pipe(res);
}

function safeBackupPath(config, name) {
  const file = path.resolve(config.server.backupDir, path.basename(name));
  const base = path.resolve(config.server.backupDir);
  if (!file.startsWith(base)) throw new Error("Invalid backup name.");
  return file;
}

async function deleteBackup(config, name) {
  await fsp.unlink(safeBackupPath(config, name));
  return { ok: true };
}

async function restoreBackup(config, name) {
  const file = safeBackupPath(config, name);
  const stop = await runAction("stop", config);
  if (!stop.ok) return stop;
  const result = await exec("tar", ["-xzf", file, "-C", config.server.saveDir]);
  if (!result.ok) return result;
  return runAction("start", config);
}

async function trimBackups(config) {
  const backups = await listBackups(config);
  const keepDays = Math.max(1, Number(config.automation.backupKeepDays || 7));
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const expired = backups.filter((backup) => Date.parse(backup.mtime) < cutoff);
  const expiredPaths = new Set(expired.map((backup) => backup.path));
  const remaining = backups.filter((backup) => !expiredPaths.has(backup.path));
  const keepCount = Math.max(0, Number(config.automation.keepBackups || 0));
  const overflow = keepCount > 0 ? remaining.slice(keepCount) : [];
  const remove = [...expired, ...overflow.filter((backup) => !expiredPaths.has(backup.path))];
  await Promise.all(remove.map((backup) => fsp.unlink(backup.path).catch(() => {})));
  return remove;
}

function safeManagedDirectory(target, label) {
  const resolved = path.resolve(target || "");
  const blocked = new Set(["/", "/bin", "/boot", "/dev", "/etc", "/home", "/opt", "/root", "/usr", "/var"]);
  if (!path.isAbsolute(resolved) || blocked.has(resolved) || resolved.length < 6) {
    throw new Error(`${label} is not a safe managed directory.`);
  }
  return resolved;
}

function serverMaintenancePlan(config, operation) {
  const installDir = safeManagedDirectory(config.server.installDir, "Server install directory");
  const saveDir = safeManagedDirectory(config.server.saveDir, "Server save directory");
  const backupDir = safeManagedDirectory(config.server.backupDir, "Server backup directory");
  const backupRelative = path.relative(installDir, backupDir);
  if (!backupRelative || (!backupRelative.startsWith("..") && !path.isAbsolute(backupRelative))) {
    throw new Error("Server backup directory must be outside the install directory.");
  }
  return {
    operation,
    serviceName: config.server.serviceName,
    installDir,
    saveDir,
    worldDir: path.join(saveDir, "SaveGames"),
    backupDir,
    keepsPanel: true,
    keepsBackups: true
  };
}

async function createMaintenanceBackup(config) {
  if (!fs.existsSync(config.server.saveDir)) {
    return { ok: true, skipped: true, stdout: "No save directory exists yet.", stderr: "" };
  }
  return createBackup(config);
}

async function resetWorld(config, options = {}) {
  const plan = serverMaintenancePlan(config, "reset-world");
  if (options.dryRun) return { ok: true, dryRun: true, plan };

  const stop = await runAction("stop", config);
  if (!stop.ok) return stop;
  const backup = await createMaintenanceBackup(config);
  if (!backup.ok) {
    await runAction("start", config);
    return backup;
  }

  await fsp.rm(plan.worldDir, { recursive: true, force: true });
  const start = await runAction("start", config);
  return {
    ...start,
    backup: backup.backup || "",
    resetPath: plan.worldDir
  };
}

async function uninstallServer(config, options = {}) {
  const plan = serverMaintenancePlan(config, "uninstall");
  if (options.dryRun) return { ok: true, dryRun: true, plan };
  if (config.server.mode !== "systemd") {
    return { ok: false, stdout: "", stderr: "One-click uninstall currently supports systemd servers only." };
  }
  if (!/^[A-Za-z0-9_.@-]+$/.test(config.server.serviceName)) {
    return { ok: false, stdout: "", stderr: "Invalid systemd service name." };
  }

  const stop = await runAction("stop", config);
  if (!stop.ok) return stop;
  const backup = await createMaintenanceBackup(config);
  if (!backup.ok) {
    await runAction("start", config);
    return backup;
  }

  await exec("systemctl", ["disable", config.server.serviceName]);
  await fsp.rm(`/etc/systemd/system/${config.server.serviceName}.service`, { force: true });
  await exec("systemctl", ["daemon-reload"]);
  await fsp.rm(plan.installDir, { recursive: true, force: true });
  return {
    ok: true,
    stdout: `Removed ${plan.installDir} and disabled ${config.server.serviceName}.`,
    stderr: "",
    backup: backup.backup || "",
    removed: plan.installDir
  };
}

async function loadWhitelist() {
  const file = path.join(dataDir, "whitelist.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(await fsp.readFile(file, "utf8"));
}

async function saveWhitelist(players) {
  const file = path.join(dataDir, "whitelist.json");
  await writeJson(file, players);
  return players;
}

function responseData(result) {
  if (!result) return {};
  return result.data && typeof result.data === "object" ? result.data : result;
}

function playerUidFromId(playerId) {
  const value = String(playerId || "");
  if (value.length < 8) return "";
  const parsed = Number.parseInt(value.slice(0, 8), 16);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function normalizeLivePlayers(live) {
  if (!live?.players?.ok) throw new Error(live?.players?.error || "Palworld REST player endpoint is unavailable.");
  const payload = responseData(live.players);
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload.players) ? payload.players : []);
  return rows.map((player) => {
    const userId = String(player.user_id || player.userId || player.userid || "");
    return {
      player_uid: String(player.player_uid || player.playerUid || playerUidFromId(player.playerId) || ""),
      user_id: userId,
      steam_id: String(player.steam_id || player.steamId || (userId.startsWith("steam_") ? userId.slice(6) : "")),
      nickname: String(player.nickname || player.name || ""),
      account_name: String(player.account_name || player.accountName || ""),
      ip: String(player.ip || ""),
      ping: Number(player.ping || 0),
      location_x: Number(player.location_x || player.locationX || 0),
      location_y: Number(player.location_y || player.locationY || 0),
      level: Number(player.level || 0),
      building_count: Number(player.building_count || player.buildingCount || 0),
      last_online: new Date().toISOString()
    };
  });
}

function playerIdentity(player) {
  return String(player.player_uid || player.steam_id || player.user_id || player.nickname || "");
}

function formatPlayerMessage(template, player, onlineCount) {
  return String(template || "")
    .replaceAll("{username}", player.nickname || playerIdentity(player))
    .replaceAll("{online_num}", String(onlineCount));
}

function isWhitelisted(player, whitelist) {
  return whitelist.some((entry) =>
    (player.player_uid && String(entry.player_uid || entry.playerUid || "") === String(player.player_uid))
    || (player.steam_id && String(entry.steam_id || entry.steamId || "") === String(player.steam_id))
  );
}

async function broadcastLines(config, message) {
  for (const line of String(message || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const result = await managedCall("rcon", { command: `Broadcast ${line}` }, () => rcon(config, `Broadcast ${line}`));
    if (!result.ok) throw new Error(result.stderr || result.stdout || "Broadcast failed.");
  }
}

async function syncOnlinePlayers(config) {
  const live = await managedCall("live", {}, () => liveServerData(config));
  const players = normalizeLivePlayers(live);
  await saveJsonFile("online-players.json", { players, synced_at: new Date().toISOString() });

  if (config.automation.playerLogging && previousOnlinePlayers) {
    const previous = new Map(previousOnlinePlayers.map((player) => [playerIdentity(player), player]));
    const current = new Map(players.map((player) => [playerIdentity(player), player]));
    for (const [identity, player] of current) {
      if (!previous.has(identity)) {
        await broadcastLines(config, formatPlayerMessage(
          config.automation.playerLoginMessage || "Player {username} has joined the server! Current online player count: {online_num}.",
          player,
          players.length
        )).catch((error) => console.error(`Player login broadcast failed: ${error.message}`));
      }
    }
    for (const [identity, player] of previous) {
      if (!current.has(identity)) {
        await broadcastLines(config, formatPlayerMessage(
          config.automation.playerLogoutMessage || "Player {username} has left the server! Current online player count: {online_num}.",
          player,
          players.length
        )).catch((error) => console.error(`Player logout broadcast failed: ${error.message}`));
      }
    }
  }

  if (config.automation.kickNonWhitelist) {
    const whitelist = await loadWhitelist();
    for (const player of players) {
      if (isWhitelisted(player, whitelist)) continue;
      const target = player.user_id || (player.steam_id ? `steam_${player.steam_id}` : "");
      if (!target) continue;
      const result = await managedCall("rcon", { command: `KickPlayer ${target}` }, () => rcon(config, `KickPlayer ${target}`));
      if (!result.ok) console.error(`Whitelist kick failed for ${player.nickname || target}: ${result.stderr || result.stdout}`);
    }
  }

  previousOnlinePlayers = players;
  return players;
}

async function syncSaveData(config) {
  const data = await managedCall("saveData", {}, () => querySaveData(config));
  if (data?.source === "parser_error") throw new Error(data.message || "Save parser failed.");
  const synced = { ...data, source: data?.source || "sync", synced_at: new Date().toISOString() };
  await saveSyncedSaveData(synced);
  return synced;
}

async function querySaveData(config) {
  const output = {
    players: [],
    guilds: [],
    pals: [],
    inventory: [],
    bases: [],
    containers: [],
    map: null,
    source: "not_configured",
    message: "Configure server.saveParserCommand to parse Level.sav data."
  };
  if (!config.server.saveParserCommand) return output;
  let source;
  try {
    source = await prepareSaveSource(config, "decode");
    const result = await exec(config.server.saveParserCommand, [source.directory], { timeout: 300000 });
    if (!result.ok) return { ...output, source: "parser_error", message: result.stderr || result.stdout };
    const parsed = JSON.parse(result.stdout);
    const players = Array.isArray(parsed.players) ? parsed.players : [];
    const pals = parsed.pals || players.flatMap((player) =>
      (player.pals || []).map((pal) => ({
        ...pal,
        owner_uid: player.player_uid,
        owner_name: player.nickname
      }))
    );
    const inventory = parsed.inventory || players.flatMap((player) =>
      Object.entries(player.items || {}).flatMap(([container, items]) =>
        (items || []).map((item) => ({
          ...item,
          container,
          owner_uid: player.player_uid,
          owner_name: player.nickname
        }))
      )
    );
    return {
      players,
      guilds: Array.isArray(parsed.guilds) ? parsed.guilds : [],
      pals,
      inventory,
      bases: Array.isArray(parsed.bases)
        ? parsed.bases
        : (Array.isArray(parsed.guilds) ? parsed.guilds : []).flatMap((guild) => guild.base_camp || []),
      containers: Array.isArray(parsed.containers) ? parsed.containers : [],
      map: parsed.map || null,
      source: config.automation.saveSourceMode === "agent" ? "agent" : "parser"
    };
  } catch (error) {
    return { ...output, source: "parser_error", message: error.message || "Save parser did not return JSON." };
  } finally {
    if (source) await source.cleanup();
  }
}

async function findSaveEntity(config, type, id) {
  const data = await querySaveData(config);
  const key = {
    player: "players",
    guild: "guilds",
    pal: "pals",
    inventory: "inventory"
  }[type];
  if (!key) return null;
  const rows = Array.isArray(data[key]) ? data[key] : [];
  return rows.find((row) =>
    [row.player_uid, row.admin_player_uid, row.id, row.instance_id, row.owner_uid, row.ItemId, row.item_id]
      .filter(Boolean)
      .map(String)
      .includes(String(id))
  ) || null;
}

function extractMapMarkers(data) {
  const markers = [];
  for (const player of data.players || []) {
    const x = player.location_x ?? player.location?.x;
    const y = player.location_y ?? player.location?.y;
    if (x !== undefined && y !== undefined) {
      markers.push({ type: "player", label: player.nickname || player.player_uid, x, y });
    }
  }
  for (const guild of data.guilds || []) {
    for (const base of Array.isArray(guild.base_camp) ? guild.base_camp : []) {
      const x = base.location_x ?? base.location?.x;
      const y = base.location_y ?? base.location?.y;
      if (x !== undefined && y !== undefined) {
        markers.push({ type: "base", label: guild.name || base.id, x, y });
      }
    }
  }
  return markers;
}

async function listRconTemplates() {
  const templates = await loadJsonFile("rcon-templates.json", defaultRconTemplates);
  return templates.length ? templates : defaultRconTemplates;
}

async function saveRconTemplates(templates) {
  return saveJsonFile("rcon-templates.json", templates);
}

async function listRconTasks() {
  return loadJsonFile("rcon-tasks.json", []);
}

async function saveRconTasks(tasks) {
  return saveJsonFile("rcon-tasks.json", tasks);
}

function upsertById(rows, row) {
  const next = [...rows];
  const id = row.id || crypto.randomUUID();
  const index = next.findIndex((item) => item.id === id);
  const value = { ...row, id };
  if (index >= 0) next[index] = value;
  else next.push(value);
  return next;
}

function toIniValue(value) {
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderSettings(settings) {
  const pairs = Object.entries(settings)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${toIniValue(value)}`)
    .join(",");
  return `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(${pairs})\n`;
}

async function applySettings(config, settings) {
  const next = await saveConfig({ ...config, settings });
  await fsp.mkdir(path.dirname(config.server.settingsPath), { recursive: true });
  await fsp.writeFile(config.server.settingsPath, renderSettings(next.settings), "utf8");
  return next;
}

const advancedFeatures = createAdvancedFeatures({
  dataDir,
  exec,
  sendJson,
  sendError,
  readBody,
  loadJsonFile,
  saveJsonFile,
  saveConfig,
  managedCall,
  collectHostMetrics,
  createBackup,
  querySaveData,
  liveServerData,
  saveSyncedSaveData,
  serviceStatus,
  runAction,
  rcon,
  performManagedRestart: managedRestart,
  issueViewerToken: (config, principal) => issueAuthToken(config, Date.now(), principal),
  proxyAgentUpload,
});

async function executeAgentOperation(operation, payload, config) {
  const operations = {
    profile: async () => ({
      profile: hostProfile(),
      defaults: {
        installDir: config.server.installDir,
        serviceName: config.server.serviceName,
        publicPort: config.settings.PublicPort,
        rconPort: config.settings.RCONPort,
        restPort: config.settings.RESTAPIPort,
        serverName: config.settings.ServerName,
        adminPassword: config.settings.AdminPassword
      }
    }),
    status: async () => ({
      status: await serviceStatus(config),
      server: config.server,
      settings: config.settings,
      host: {
        platform: os.platform(),
        arch: os.arch(),
        profile: hostProfile(),
        uptime: os.uptime(),
        freeMemory: os.freemem(),
        totalMemory: os.totalmem()
      }
    }),
    hostMetrics: () => collectHostMetrics(config),
    config: async () => ({
      server: config.server,
      settings: config.settings,
      automation: config.automation
    }),
    configUpdate: async () => {
      const next = await saveConfig({
        ...config,
        server: { ...config.server, ...(payload.server || {}) },
        settings: { ...config.settings, ...(payload.settings || {}) },
        automation: { ...config.automation, ...(payload.automation || {}) }
      });
      return { server: next.server, settings: next.settings, automation: next.automation };
    },
    directories: async () => {
      const target = path.resolve(payload.path || process.cwd());
      const entries = await fsp.readdir(target, { withFileTypes: true });
      return {
        current: target,
        parent: path.dirname(target),
        roots: os.platform() === "win32"
          ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((drive) => `${drive}:\\`).filter((drive) => fs.existsSync(drive))
          : ["/"],
        entries: entries.filter((entry) => entry.isDirectory()).map((entry) => ({ name: entry.name, path: path.join(target, entry.name) }))
      };
    },
    testSave: async () => {
      const target = payload.path;
      return testSaveSource(payload.sourceMode || config.automation.saveSourceMode || "directory", target);
    },
    testRcon: () => rcon({
      ...config,
      server: { ...config.server, ...(payload.server || {}) },
      automation: { ...config.automation, ...(payload.automation || {}) },
      settings: { ...config.settings, ...(payload.settings || {}) }
    }, "ShowPlayers"),
    deploy: () => deployServer(config, payload),
    live: () => liveServerData(config),
    rcon: () => rcon(config, payload.command || ""),
    action: async () => {
      if (payload.action !== "backup") return runAction(payload.action, config);
      const result = await createBackup(config);
      if (result.ok) await trimBackups(config);
      return result;
    },
    backups: () => listBackups(config),
    restoreBackup: () => restoreBackup(config, payload.name),
    deleteBackup: () => deleteBackup(config, payload.name),
    resetWorld: () => resetWorld(config, payload),
    uninstallServer: () => uninstallServer(config, payload),
    saveData: () => querySaveData(config),
    saveEntity: () => findSaveEntity(config, payload.type, payload.id),
    mapMarkers: async () => extractMapMarkers(await querySaveData(config)),
    settings: async () => (await applySettings(config, payload.settings || {})).settings
  };
  const handler = operations[operation];
  if (!handler) return advancedFeatures.executeAgentOperation(operation, payload, config);
  return handler();
}

function isAgentAuthorized(req) {
  const expected = process.env.PAL_AGENT_TOKEN || "";
  return Boolean(expected) && req.headers["x-agent-token"] === expected;
}

async function handleAgentApi(req, res, config) {
  if (!isAgentAuthorized(req)) return sendError(res, 401, "Invalid Agent token.");

  if (req.method === "GET" && req.url === "/agent/health") {
    return sendJson(res, 200, { ok: true, arch: os.arch(), platform: os.platform() });
  }

  if (req.method === "POST" && req.url === "/agent/rpc") {
    const body = await readBody(req);
    const value = await executeAgentOperation(body.operation, body.payload || {}, config);
    return sendJson(res, 200, { ok: true, value });
  }

  const uploadMatch = req.url.match(/^\/agent\/upload\/(save-source|mod)$/);
  if (req.method === "POST" && uploadMatch) {
    return advancedFeatures.handleAgentUpload(req, res, config, uploadMatch[1]);
  }

  if (req.method === "GET" && req.url.startsWith("/agent/backup/")) {
    const name = decodeURIComponent(req.url.replace("/agent/backup/", ""));
    await sendBackupFile(req, res, config, name);
    return;
  }

  return sendError(res, 404, "Agent route not found.");
}

async function proxyAgentBackup(res, agent, name) {
  const endpoint = agentEndpoint(agent, `/agent/backup/${encodeURIComponent(name)}`);
  const transport = endpoint.protocol === "https:" ? https : http;
  await new Promise((resolve, reject) => {
    const req = transport.request(endpoint, {
      method: "GET",
      headers: { "x-agent-token": agent.token || "" },
      timeout: 30000
    }, (agentRes) => {
      if (agentRes.statusCode >= 400) {
        let raw = "";
        agentRes.on("data", (chunk) => (raw += chunk));
        agentRes.on("end", () => reject(new Error(raw || `Agent download failed (${agentRes.statusCode}).`)));
        return;
      }
      const headers = {
        "content-type": agentRes.headers["content-type"] || "application/gzip",
        "content-disposition": agentRes.headers["content-disposition"] || `attachment; filename="${path.basename(name)}"`
      };
      if (agentRes.headers["content-length"]) headers["content-length"] = agentRes.headers["content-length"];
      res.writeHead(200, headers);
      agentRes.pipe(res);
      agentRes.on("end", resolve);
    });
    req.on("timeout", () => req.destroy(new Error("Agent download timed out.")));
    req.on("error", reject);
    req.end();
  });
}

async function loadSyncedSaveData() {
  return loadJsonFile("upstream-save-sync.json", { players: [], guilds: [], source: "sync" });
}

async function saveSyncedSaveData(data) {
  return saveJsonFile("upstream-save-sync.json", data);
}

async function downloadCompatibleBackup(req, res, config, name) {
  const agent = await loadAgentConfig();
  if (agentIsEnabled(agent)) return proxyAgentBackup(res, agent, name);
  return sendBackupFile(req, res, config, name);
}

const upstreamCompat = createUpstreamCompatibility({
  version: packageInfo.version,
  sendJson,
  sendError,
  readBody,
  hashPassword,
  issueAuthToken,
  saveConfig,
  effectivePanelToken,
  managedCall,
  liveServerData,
  querySaveData,
  rcon,
  testSaveSource,
  loadWhitelist,
  saveWhitelist,
  loadSyncedSaveData,
  saveSyncedSaveData,
  listRconTemplates,
  saveRconTemplates,
  listRconTasks,
  saveRconTasks,
  listBackups,
  deleteBackup,
  downloadBackup: downloadCompatibleBackup
});

async function handleApi(req, res, config) {
  if (await upstreamCompat.handlePublic(req, res, config)) return;
  if (await advancedFeatures.handlePublicApi(req, res, config)) return;

  const principal = await authenticateRequest(req, config);
  const authorized = Boolean(principal);
  if (await upstreamCompat.handleOptional(req, res, config, authorized)) return;

  if (req.method === "GET" && req.url === "/api/auth/status") {
    return sendJson(res, 200, {
      ok: true,
      initialized: Boolean(config.panel.adminInitialized),
      tokenEnabled: Boolean(effectivePanelToken(config) && effectivePanelToken(config) !== "change-me")
    });
  }

  if (req.method === "POST" && req.url === "/api/auth/init") {
    if (config.panel.adminInitialized) return sendError(res, 409, "Admin has already been initialized.");
    const body = await readBody(req);
    if (!body.username || !body.password) return sendError(res, 400, "Username and password are required.");
    if (String(body.password).length < 8) return sendError(res, 400, "Password must be at least 8 characters.");
    const password = hashPassword(body.password);
    const configuredToken = process.env.PANEL_TOKEN && process.env.PANEL_TOKEN !== "change-me"
      ? process.env.PANEL_TOKEN
      : crypto.randomBytes(24).toString("hex");
    const next = await saveConfig({
      ...config,
      panel: {
        ...config.panel,
        token: configuredToken,
        adminInitialized: true,
        adminUser: body.username,
        adminPasswordHash: password.hash,
        adminPasswordSalt: password.salt
      }
    });
    return sendJson(res, 200, {
      ok: true,
      token: issueAuthToken(next, Date.now(), { id: "primary", name: next.panel.adminUser, role: "admin" }),
      username: next.panel.adminUser,
      role: "admin",
    });
  }

  if (req.method === "POST" && req.url === "/api/login") {
    const body = await readBody(req);
    const panelToken = effectivePanelToken(config);
    if (body.token === panelToken || body.password === panelToken) {
      return sendJson(res, 200, {
        ok: true,
        token: issueAuthToken(config, Date.now(), { id: "primary", name: config.panel.adminUser, role: "admin" }),
        username: config.panel.adminUser,
        role: "admin",
      });
    }
    const users = await listAccessUsers(config);
    const requestedName = String(body.username || "").trim();
    const user = requestedName
      ? users.find((row) => row.username === requestedName)
      : users.find((row) => row.primary);
    if (!user || !verifyPassword(body.password, user.passwordSalt, user.passwordHash)) {
      return sendError(res, 401, "Invalid login.");
    }
    return sendJson(res, 200, {
      ok: true,
      token: issueAuthToken(config, Date.now(), {
        id: user.id,
        name: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion,
      }),
      username: user.username,
      role: user.role,
    });
  }

  if (!authorized) return sendError(res, 401, "Unauthorized.");

  const permission = requiredPermission(req);
  if (!principalCan(principal, permission)) return sendError(res, 403, `Permission required: ${permission}`);

  if (req.method === "GET" && req.url === "/api/auth/me") {
    return sendJson(res, 200, { ok: true, user: principal });
  }

  if (req.method === "GET" && req.url === "/api/access/users") {
    if (!principalCan(principal, "security:write")) return sendError(res, 403, "Administrator access required.");
    return sendJson(res, 200, { ok: true, users: (await listAccessUsers(config)).map(publicPrincipal) });
  }

  if (req.method === "POST" && req.url === "/api/access/users") {
    if (!principalCan(principal, "security:write")) return sendError(res, 403, "Administrator access required.");
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const role = ["admin", "operator", "viewer"].includes(body.role) ? body.role : "viewer";
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username)) return sendError(res, 400, "Username must be 3-64 safe characters.");
    if (String(body.password || "").length < 8) return sendError(res, 400, "Password must be at least 8 characters.");
    const users = await listAccessUsers(config);
    if (users.some((row) => row.username.toLowerCase() === username.toLowerCase())) return sendError(res, 409, "Username already exists.");
    const password = hashPassword(body.password);
    const stored = await loadJsonFile("access-users.json", []);
    const user = {
      id: crypto.randomUUID(),
      username,
      role,
      passwordSalt: password.salt,
      passwordHash: password.hash,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    };
    await saveJsonFile("access-users.json", [user, ...(Array.isArray(stored) ? stored : [])]);
    return sendJson(res, 201, { ok: true, user: publicPrincipal(user) });
  }

  const accessUserMatch = req.url.match(/^\/api\/access\/users\/([^/?]+)$/);
  if (accessUserMatch && ["PATCH", "DELETE"].includes(req.method)) {
    if (!principalCan(principal, "security:write")) return sendError(res, 403, "Administrator access required.");
    const id = decodeURIComponent(accessUserMatch[1]);
    if (id === "primary") return sendError(res, 400, "The primary administrator is managed in Panel settings.");
    const stored = await loadJsonFile("access-users.json", []);
    const index = (Array.isArray(stored) ? stored : []).findIndex((row) => row.id === id);
    if (index < 0) return sendError(res, 404, "User not found.");
    if (req.method === "DELETE") {
      stored.splice(index, 1);
      await saveJsonFile("access-users.json", stored);
      return sendJson(res, 200, { ok: true });
    }
    const body = await readBody(req);
    if (["admin", "operator", "viewer"].includes(body.role)) stored[index].role = body.role;
    if (body.password) {
      if (String(body.password).length < 8) return sendError(res, 400, "Password must be at least 8 characters.");
      const password = hashPassword(body.password);
      stored[index].passwordSalt = password.salt;
      stored[index].passwordHash = password.hash;
    }
    stored[index].tokenVersion = Number(stored[index].tokenVersion || 1) + 1;
    await saveJsonFile("access-users.json", stored);
    return sendJson(res, 200, { ok: true, user: publicPrincipal(stored[index]) });
  }

  if (req.method === "GET" && req.url === "/api/access/api-keys") {
    if (!principalCan(principal, "security:write")) return sendError(res, 403, "Administrator access required.");
    const keys = await loadJsonFile("api-keys.json", []);
    return sendJson(res, 200, {
      ok: true,
      keys: (Array.isArray(keys) ? keys : []).map(({ hash, ...key }) => key),
    });
  }

  if (req.method === "POST" && req.url === "/api/access/api-keys") {
    if (!principalCan(principal, "security:write")) return sendError(res, 403, "Administrator access required.");
    const body = await readBody(req);
    const role = ["admin", "operator", "viewer", "integration"].includes(body.role) ? body.role : "viewer";
    const raw = `pal_${crypto.randomBytes(32).toString("base64url")}`;
    const keys = await loadJsonFile("api-keys.json", []);
    const key = {
      id: crypto.randomUUID(),
      name: String(body.name || "API key").slice(0, 80),
      prefix: raw.slice(0, 12),
      hash: crypto.createHash("sha256").update(raw).digest("hex"),
      role,
      permissions: Array.isArray(body.permissions) ? body.permissions.slice(0, 30) : permissionsForRole(role),
      createdAt: new Date().toISOString(),
      lastUsedAt: "",
      revokedAt: "",
    };
    await saveJsonFile("api-keys.json", [key, ...(Array.isArray(keys) ? keys : [])]);
    const { hash, ...visible } = key;
    return sendJson(res, 201, { ok: true, key: visible, token: raw });
  }

  const apiKeyMatch = req.url.match(/^\/api\/access\/api-keys\/([^/?]+)$/);
  if (apiKeyMatch && req.method === "DELETE") {
    if (!principalCan(principal, "security:write")) return sendError(res, 403, "Administrator access required.");
    const id = decodeURIComponent(apiKeyMatch[1]);
    const keys = await loadJsonFile("api-keys.json", []);
    const key = (Array.isArray(keys) ? keys : []).find((row) => row.id === id);
    if (!key) return sendError(res, 404, "API key not found.");
    key.revokedAt = new Date().toISOString();
    await saveJsonFile("api-keys.json", keys);
    return sendJson(res, 200, { ok: true });
  }

  if (await upstreamCompat.handleAuthorized(req, res, config)) return;

  if (req.method === "GET" && req.url === "/api/status") {
    const managed = await managedCall("status", {}, async () => ({
      status: await serviceStatus(config),
      server: config.server,
      settings: config.settings,
      host: {
        platform: os.platform(),
        arch: os.arch(),
        profile: hostProfile(),
        uptime: os.uptime(),
        freeMemory: os.freemem(),
        totalMemory: os.totalmem()
      }
    }));
    return sendJson(res, 200, {
      ok: true,
      status: managed.status,
      config: {
        panel: { host: config.panel.host, port: config.panel.port },
        server: managed.server,
        automation: config.automation,
        settings: managed.settings
      },
      host: managed.host
    });
  }

  if (req.method === "GET" && req.url === "/api/deploy/plan") {
    const managed = await managedCall("profile", {}, async () => ({
      profile: hostProfile(),
      defaults: {
        installDir: config.server.installDir,
        serviceName: config.server.serviceName,
        publicPort: config.settings.PublicPort,
        rconPort: config.settings.RCONPort,
        restPort: config.settings.RESTAPIPort,
        serverName: config.settings.ServerName,
        adminPassword: config.settings.AdminPassword
      }
    }));
    return sendJson(res, 200, {
      ok: true,
      profile: managed.profile,
      defaults: managed.defaults
    });
  }

  if (req.method === "POST" && req.url === "/api/deploy/server") {
    const body = await readBody(req);
    const result = await managedCall("deploy", body, () => deployServer(config, body));
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "POST" && req.url === "/api/server/reset-world") {
    const body = await readBody(req);
    const result = await managedCall("resetWorld", body, () => resetWorld(config, body));
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "POST" && req.url === "/api/server/uninstall") {
    const body = await readBody(req);
    const result = await managedCall("uninstallServer", body, () => uninstallServer(config, body));
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "GET" && req.url === "/api/live") {
    return sendJson(res, 200, { ok: true, live: await managedCall("live", {}, () => liveServerData(config)) });
  }

  if (req.method === "POST" && req.url === "/api/rcon") {
    const body = await readBody(req);
    const result = await managedCall("rcon", { command: body.command || "" }, () => rcon(config, body.command || ""));
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "GET" && req.url === "/api/rcon/templates") {
    return sendJson(res, 200, { ok: true, templates: await listRconTemplates() });
  }

  if (req.method === "PUT" && req.url === "/api/rcon/templates") {
    const body = await readBody(req);
    return sendJson(res, 200, { ok: true, templates: await saveRconTemplates(body.templates || []) });
  }

  if (req.method === "GET" && req.url === "/api/rcon/tasks") {
    return sendJson(res, 200, { ok: true, tasks: await listRconTasks() });
  }

  if (req.method === "POST" && req.url === "/api/rcon/tasks") {
    const body = await readBody(req);
    const tasks = await listRconTasks();
    const next = await saveRconTasks(upsertById(tasks, {
      id: body.id,
      name: body.name || body.command || "RCON Task",
      command: body.command || "",
      intervalMinutes: Number(body.intervalMinutes || 60),
      enabled: Boolean(body.enabled),
      lastRun: body.lastRun || 0
    }));
    return sendJson(res, 200, { ok: true, tasks: next });
  }

  if (req.method === "POST" && req.url === "/api/rcon/tasks/run") {
    const body = await readBody(req);
    const task = (await listRconTasks()).find((item) => item.id === body.id);
    if (!task) return sendError(res, 404, "Task not found.");
    const result = await managedCall("rcon", { command: task.command }, () => rcon(config, task.command));
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "DELETE" && req.url.startsWith("/api/rcon/tasks/")) {
    const id = decodeURIComponent(req.url.split("/").pop());
    const tasks = (await listRconTasks()).filter((task) => task.id !== id);
    return sendJson(res, 200, { ok: true, tasks: await saveRconTasks(tasks) });
  }

  if (req.method === "POST" && req.url === "/api/player") {
    const body = await readBody(req);
    const commands = {
      kick: `KickPlayer ${body.playerId}`,
      ban: `BanPlayer ${body.playerId}`,
      broadcast: `Broadcast ${body.message || ""}`,
      save: "Save",
      shutdown: `Shutdown ${Number(body.seconds || 30)} ${body.message || "Server shutdown"}`
    };
    if (!commands[body.action]) return sendError(res, 400, "Unsupported player action.");
    const result = await managedCall("rcon", { command: commands[body.action] }, () => rcon(config, commands[body.action]));
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "GET" && req.url === "/api/backups") {
    return sendJson(res, 200, { ok: true, backups: await managedCall("backups", {}, () => listBackups(config)) });
  }

  if (req.method === "GET" && req.url.startsWith("/api/backup/download/")) {
    const name = decodeURIComponent(req.url.replace("/api/backup/download/", ""));
    const agent = await loadAgentConfig();
    if (agentIsEnabled(agent)) {
      await proxyAgentBackup(res, agent, name);
      return;
    }
    await sendBackupFile(req, res, config, name);
    return;
  }

  if (req.method === "POST" && req.url === "/api/backup/restore") {
    const body = await readBody(req);
    const result = await managedCall("restoreBackup", { name: body.name }, () => restoreBackup(config, body.name));
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "POST" && req.url === "/api/backup/delete") {
    const body = await readBody(req);
    return sendJson(res, 200, { ok: true, result: await managedCall("deleteBackup", { name: body.name }, () => deleteBackup(config, body.name)) });
  }

  if (req.method === "GET" && req.url === "/api/whitelist") {
    return sendJson(res, 200, { ok: true, players: await loadWhitelist() });
  }

  if (req.method === "PUT" && req.url === "/api/whitelist") {
    const body = await readBody(req);
    return sendJson(res, 200, { ok: true, players: await saveWhitelist(body.players || []) });
  }

  if (req.method === "GET" && req.url === "/api/save-data") {
    return sendJson(res, 200, { ok: true, data: await managedCall("saveData", {}, () => querySaveData(config)) });
  }

  if (req.method === "GET" && req.url.startsWith("/api/save-data/")) {
    const [, , , type, id] = req.url.split("/");
    const entityId = decodeURIComponent(id || "");
    const entity = await managedCall("saveEntity", { type, id: entityId }, () => findSaveEntity(config, type, entityId));
    if (!entity) return sendError(res, 404, "Record not found.");
    return sendJson(res, 200, { ok: true, data: entity });
  }

  if (req.method === "GET" && req.url === "/api/map/markers") {
    const markers = await managedCall("mapMarkers", {}, async () => extractMapMarkers(await querySaveData(config)));
    return sendJson(res, 200, { ok: true, markers });
  }

  if (req.method === "GET" && req.url === "/api/agent/config") {
    return sendJson(res, 200, {
      ok: true,
      agent: await loadAgentConfig()
    });
  }

  if (req.method === "PUT" && req.url === "/api/agent/config") {
    const body = await readBody(req);
    return sendJson(res, 200, { ok: true, agent: await saveJsonFile("agent.json", body.agent || {}) });
  }

  if (req.method === "POST" && req.url === "/api/agent/test") {
    const agent = await loadAgentConfig();
    if (!agentIsEnabled(agent)) return sendError(res, 400, "Please enable remote Agent mode first.");
    const result = await requestAgent(agent, "/agent/health");
    return sendJson(res, 200, { ok: true, agent: result });
  }

  if (req.method === "GET" && req.url === "/api/host/metrics") {
    let metrics;
    try {
      metrics = await managedCall("hostMetrics", {}, () => collectHostMetrics(config));
    } catch (error) {
      metrics = { unavailable: true, error: error.message };
    }
    return sendJson(res, 200, { ok: true, metrics });
  }

  if (req.method === "GET" && req.url === "/api/watchdog") {
    return sendJson(res, 200, {
      ok: true,
      settings: watchdogSettings(config.automation),
      state: watchdogRuntimeState()
    });
  }

  if (req.method === "PUT" && req.url === "/api/watchdog") {
    const body = await readBody(req);
    const automation = {
      ...config.automation,
      ...sanitizeWatchdogSettings(body.settings || {})
    };
    const next = await saveConfig({ ...config, automation });
    return sendJson(res, 200, {
      ok: true,
      settings: watchdogSettings(next.automation),
      state: watchdogRuntimeState()
    });
  }

  if (req.method === "POST" && req.url === "/api/action") {
    const body = await readBody(req);
    const result = await managedCall("action", { action: body.action }, () => body.action === "backup" ? createBackup(config) : runAction(body.action, config));
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "PUT" && req.url === "/api/settings") {
    const body = await readBody(req);
    const settings = await managedCall("settings", { settings: body.settings || {} }, async () => (await applySettings(config, body.settings || {})).settings);
    if (agentIsEnabled(await loadAgentConfig())) await saveConfig({ ...config, settings });
    return sendJson(res, 200, { ok: true, settings });
  }

  if (req.method === "PUT" && req.url === "/api/config") {
    const body = await readBody(req);
    const next = await saveConfig({ ...config, ...body });
    return sendJson(res, 200, { ok: true, config: next });
  }

  if (await advancedFeatures.handleApi(req, res, config, {
    principal,
    agentEnabled: agentIsEnabled(await loadAgentConfig()),
  })) return;

  return sendError(res, 404, "API route not found.");
}

async function proxyAgentUpload(req, res, kind) {
  const agent = await loadAgentConfig();
  if (!agentIsEnabled(agent)) throw new Error("Remote Agent is not enabled.");
  const endpoint = agentEndpoint(agent, `/agent/upload/${encodeURIComponent(kind)}`);
  const transport = endpoint.protocol === "https:" ? https : http;
  await new Promise((resolve, reject) => {
    const outgoing = transport.request(
      endpoint,
      {
        method: "POST",
        headers: {
          "x-agent-token": agent.token || "",
          "content-type": req.headers["content-type"] || "application/octet-stream",
          ...(req.headers["content-length"] ? { "content-length": req.headers["content-length"] } : {}),
        },
        timeout: 30 * 60 * 1000,
      },
      (agentRes) => {
        res.writeHead(agentRes.statusCode || 502, {
          "content-type": agentRes.headers["content-type"] || "application/json; charset=utf-8",
        });
        agentRes.pipe(res);
        agentRes.on("end", resolve);
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new Error("Agent upload timed out.")));
    outgoing.on("error", reject);
    req.pipe(outgoing);
  });
}

function numberInRange(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function watchdogSettings(automation = {}) {
  return {
    watchdogEnabled: Boolean(automation.watchdogEnabled),
    watchdogCheckIntervalSeconds: numberInRange(automation.watchdogCheckIntervalSeconds, 30, 10, 3600),
    watchdogAutoRestart: Boolean(automation.watchdogAutoRestart),
    watchdogFailureThreshold: Math.round(numberInRange(automation.watchdogFailureThreshold, 3, 1, 20)),
    watchdogMemoryThresholdPercent: numberInRange(automation.watchdogMemoryThresholdPercent, 0, 0, 100),
    watchdogMemoryBreachChecks: Math.round(numberInRange(automation.watchdogMemoryBreachChecks, 2, 1, 20)),
    watchdogRestartCooldownMinutes: numberInRange(automation.watchdogRestartCooldownMinutes, 15, 1, 1440),
    scheduledRestartIntervalHours: numberInRange(automation.scheduledRestartIntervalHours, 0, 0, 720),
    maintenanceWarningSeconds: Math.round(numberInRange(automation.maintenanceWarningSeconds, 60, 0, 600)),
    maintenanceWarningMessage: automation.maintenanceWarningMessage === undefined
      ? "Server maintenance restart in {seconds} seconds."
      : String(automation.maintenanceWarningMessage),
    backupBeforeManagedRestart: automation.backupBeforeManagedRestart !== false
  };
}

function sanitizeWatchdogSettings(input = {}) {
  return watchdogSettings(input);
}

function watchdogRuntimeState() {
  return {
    pendingRestart: schedulerState.pendingRestart,
    consecutiveServiceFailures: schedulerState.watchdogFailures,
    consecutiveMemoryBreaches: schedulerState.memoryBreaches,
    lastCheckAt: schedulerState.lastWatchdogCheck ? new Date(schedulerState.lastWatchdogCheck).toISOString() : "",
    lastRestartAt: schedulerState.lastManagedRestart ? new Date(schedulerState.lastManagedRestart).toISOString() : "",
    lastAction: schedulerState.lastWatchdogAction,
    lastError: schedulerState.lastWatchdogError
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function managedRestart(config, reason) {
  if (schedulerState.pendingRestart) return;
  const settings = watchdogSettings(config.automation);
  schedulerState.pendingRestart = true;
  schedulerState.lastWatchdogAction = reason;
  schedulerState.lastWatchdogError = "";
  try {
    if (settings.backupBeforeManagedRestart) {
      const backup = await managedCall("action", { action: "backup" }, () => createBackup(config));
      if (!backup.ok) throw new Error(backup.stderr || backup.stdout || "Backup before restart failed.");
      const agent = await loadAgentConfig();
      if (!agentIsEnabled(agent)) await trimBackups(config);
    }
    if (settings.maintenanceWarningSeconds > 0 && settings.maintenanceWarningMessage.trim()) {
      const warning = settings.maintenanceWarningMessage.replaceAll("{seconds}", String(settings.maintenanceWarningSeconds));
      await broadcastLines(config, warning);
      await wait(settings.maintenanceWarningSeconds * 1000);
    }
    const result = await managedCall("action", { action: "restart" }, () => runAction("restart", config));
    if (!result.ok) throw new Error(result.stderr || result.stdout || "Server restart failed.");
    schedulerState.lastManagedRestart = Date.now();
    schedulerState.lastScheduledRestart = schedulerState.lastManagedRestart;
    schedulerState.watchdogFailures = 0;
    schedulerState.memoryBreaches = 0;
  } catch (error) {
    schedulerState.lastWatchdogError = error.message;
    throw error;
  } finally {
    schedulerState.pendingRestart = false;
  }
}

async function runWatchdog(config, now) {
  const settings = watchdogSettings(config.automation);
  if (!settings.watchdogEnabled || schedulerState.pendingRestart) return;
  const metrics = await managedCall("hostMetrics", {}, () => collectHostMetrics(config));
  schedulerState.lastWatchdogCheck = now;
  schedulerState.lastWatchdogError = "";

  if (metrics.service?.running) {
    schedulerState.watchdogFailures = 0;
  } else {
    schedulerState.watchdogFailures += 1;
    if (settings.watchdogAutoRestart && schedulerState.watchdogFailures >= settings.watchdogFailureThreshold) {
      const result = await managedCall("action", { action: "start" }, () => runAction("start", config));
      if (!result.ok) throw new Error(result.stderr || result.stdout || "Server auto-start failed.");
      schedulerState.watchdogFailures = 0;
      schedulerState.lastWatchdogAction = "auto-start";
    }
  }

  const memoryThreshold = settings.watchdogMemoryThresholdPercent;
  if (memoryThreshold > 0 && metrics.memory?.usedPercent >= memoryThreshold && metrics.service?.running) {
    schedulerState.memoryBreaches += 1;
  } else {
    schedulerState.memoryBreaches = 0;
  }
  const restartCooldownElapsed = !schedulerState.lastManagedRestart
    || now - schedulerState.lastManagedRestart >= settings.watchdogRestartCooldownMinutes * 60 * 1000;
  if (schedulerState.memoryBreaches >= settings.watchdogMemoryBreachChecks && restartCooldownElapsed) {
    await managedRestart(config, "memory-threshold");
    return;
  }

  const restartIntervalSeconds = settings.scheduledRestartIntervalHours * 3600;
  if (metrics.service?.running && restartIntervalSeconds > 0 && isDue(schedulerState.lastScheduledRestart, restartIntervalSeconds, now)) {
    await managedRestart(config, "scheduled-restart");
  }
}

function isDue(lastRun, intervalSeconds, now) {
  return intervalSeconds > 0 && now - lastRun >= intervalSeconds * 1000;
}

async function runSchedulerJob(name, callback) {
  try {
    await callback();
  } catch (error) {
    console.error(`${name} scheduler error: ${error.message}`);
  }
}

async function schedulerTick() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const config = await loadConfig();
    const now = Date.now();
    await advancedFeatures.tick(config);
    const playerInterval = Math.max(0, Number(config.automation.playerSyncInterval || 0));
    if (isDue(schedulerState.playerSync, playerInterval, now)) {
      schedulerState.playerSync = now;
      await runSchedulerJob("Player sync", () => syncOnlinePlayers(config));
    }

    const saveInterval = Math.max(0, Number(config.automation.saveSyncInterval || 0));
    if (isDue(schedulerState.saveSync, saveInterval, now)) {
      schedulerState.saveSync = now;
      await runSchedulerJob("Save sync", () => syncSaveData(config));
    }

    const backupInterval = Math.max(0, Number(config.automation.backupIntervalSeconds || 0)
      || Number(config.automation.backupIntervalMinutes || 0) * 60);
    if (isDue(schedulerState.backup, backupInterval, now)) {
      schedulerState.backup = now;
      await runSchedulerJob("Backup", async () => {
        const result = await managedCall("action", { action: "backup" }, () => createBackup(config));
        if (!result.ok) throw new Error(result.stderr || result.stdout || "Backup failed.");
        const agent = await loadAgentConfig();
        if (!agentIsEnabled(agent)) await trimBackups(config);
        await fsp.writeFile(path.join(dataDir, "last-backup.txt"), String(Date.now()));
      });
    }

    const broadcastInterval = Math.max(0, Number(config.automation.broadcastIntervalMinutes || 0) * 60);
    if (config.automation.broadcastMessage && isDue(schedulerState.broadcast, broadcastInterval, now)) {
      schedulerState.broadcast = now;
      await runSchedulerJob("Broadcast", async () => {
        await broadcastLines(config, config.automation.broadcastMessage);
        await fsp.writeFile(path.join(dataDir, "last-broadcast.txt"), String(Date.now()));
      });
    }

    const watchdog = watchdogSettings(config.automation);
    if (watchdog.watchdogEnabled && isDue(schedulerState.watchdog, watchdog.watchdogCheckIntervalSeconds, now)) {
      schedulerState.watchdog = now;
      await runSchedulerJob("Watchdog", async () => {
        try {
          await runWatchdog(config, now);
        } catch (error) {
          schedulerState.lastWatchdogError = error.message;
          throw error;
        }
      });
    }

    const rconTaskInterval = Math.max(1, Number(config.automation.rconTaskCheckSeconds || 30));
    if (isDue(schedulerState.rconTasks, rconTaskInterval, now)) {
      schedulerState.rconTasks = now;
      await runSchedulerJob("RCON task", () => upstreamCompat.runScheduledTasks(config));
    }
  } finally {
    schedulerRunning = false;
  }
}

function startSchedulers() {
  schedulerTick().catch((error) => console.error(`Scheduler error: ${error.message}`));
  setInterval(() => schedulerTick().catch((error) => console.error(`Scheduler error: ${error.message}`)), 1000).unref();
}

async function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const assetRoot = requestPath.startsWith("/map/tiles/") && fs.existsSync(upstreamSourcePublicDir)
    ? upstreamSourcePublicDir
    : publicDir;
  const filePath = path.join(assetRoot, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(assetRoot)) return sendError(res, 403, "Forbidden.");

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error("Not a file.");
    res.writeHead(200, {
      "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    const fallback = path.join(publicDir, "index.html");
    res.writeHead(200, { "content-type": contentTypes[".html"] });
    fs.createReadStream(fallback).pipe(res);
  }
}

async function main() {
  const config = await loadConfig();
  if (agentRuntime && !process.env.PAL_AGENT_TOKEN) {
    throw new Error("PAL_AGENT_TOKEN is required when AGENT_MODE=1.");
  }
  if (!agentRuntime) startSchedulers();
  const requestHandler = async (req, res) => {
    try {
      if (agentRuntime) {
        const currentConfig = await loadConfig();
        await handleAgentApi(req, res, currentConfig);
      } else if (req.url.startsWith("/api/")) {
        const currentConfig = await loadConfig();
        await handleApi(req, res, currentConfig);
      } else {
        await serveStatic(req, res);
      }
    } catch (error) {
      sendError(res, 500, error.message || "Internal server error.");
    }
  };
  let server;
  let protocol = "http";
  if (!agentRuntime && config.automation.webTls) {
    if (!config.automation.webCertPath || !config.automation.webKeyPath) {
      throw new Error("TLS is enabled but the certificate or private key path is empty.");
    }
    server = https.createServer({
      cert: await fsp.readFile(config.automation.webCertPath),
      key: await fsp.readFile(config.automation.webKeyPath)
    }, requestHandler);
    protocol = "https";
  } else {
    server = http.createServer(requestHandler);
  }

  const host = agentRuntime ? (process.env.AGENT_HOST || "0.0.0.0") : config.panel.host;
  const port = agentRuntime ? Number(process.env.AGENT_PORT || 8081) : config.panel.port;
  server.listen(port, host, () => {
    console.log(`Palworld ${agentRuntime ? "agent" : "panel"} listening on ${protocol}://${host}:${port}`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  authSigningKey,
  decodeAuthToken,
  decodeRconResponse,
  encodeRconCommand,
  formatPlayerMessage,
  isDue,
  isWhitelisted,
  issueAuthToken,
  normalizeLivePlayers,
  permissionsForRole,
  principalCan,
  parseDfOutput,
  parsePsOutput,
  playerUidFromId,
  testSaveSource,
  trimBackups,
  verifyAuthToken,
  watchdogSettings
};
