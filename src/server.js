const http = require("http");
const https = require("https");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const os = require("os");
const net = require("net");
const crypto = require("crypto");

const rootDir = path.resolve(__dirname, "..");
const configPath = process.env.PAL_PANEL_CONFIG || path.join(rootDir, "data", "config.json");
const dataDir = path.dirname(configPath);
const publicDir = path.join(rootDir, "public");
const deployScriptPath = path.join(rootDir, "scripts", "deploy-palworld-server.sh");
const agentRuntime = process.env.AGENT_MODE === "1";

const defaultConfig = {
  panel: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 8080),
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
    restUser: "admin",
    restPassword: "",
    publicPort: 8211,
    saveParserCommand: process.env.SAVE_PARSER_COMMAND || ""
  },
  automation: {
    backupIntervalMinutes: 0,
    broadcastIntervalMinutes: 0,
    broadcastMessage: "",
    keepBackups: 20,
    rconTaskCheckSeconds: 30
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
  ".svg": "image/svg+xml"
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
  if (!expected || expected === "change-me") return true;
  const header = req.headers.authorization || "";
  return header === `Bearer ${expected}`;
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
      steamcmdPath: body.steamcmdPath || config.server.steamcmdPath || "/opt/steamcmd/steamcmd.sh",
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
      STEAMCMD_DIR: path.dirname(nextConfig.server.steamcmdPath),
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

function parsePackets(buffer) {
  const responses = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const size = buffer.readInt32LE(offset);
    if (offset + 4 + size > buffer.length) break;
    responses.push(buffer.toString("utf8", offset + 12, offset + 4 + size - 2));
    offset += 4 + size;
  }
  return responses.join("");
}

function rcon(config, command) {
  const password = config.settings.AdminPassword;
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: config.server.rconHost,
      port: Number(config.server.rconPort)
    });
    const chunks = [];
    let authed = false;
    const done = (ok, output) => {
      socket.destroy();
      resolve({ ok, stdout: output.trim(), stderr: ok ? "" : output.trim() });
    };
    socket.setTimeout(8000);
    socket.on("connect", () => socket.write(packet(1, 3, password)));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const output = parsePackets(Buffer.concat(chunks));
      if (!authed && output !== undefined) {
        authed = true;
        chunks.length = 0;
        socket.write(packet(2, 2, command));
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
  return new Promise((resolve) => {
    const req = http.request(
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
        timeout: 8000
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

    const result = await exec("docker", ["compose", "ps", "--format", "json"], {
      cwd: config.server.composeProjectDir || config.server.installDir
    });
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
      start: ["compose", "up", "-d"],
      stop: ["compose", "down"],
      restart: ["compose", "restart"],
      update: ["compose", "pull"]
    };
    if (!dockerActions[action]) throw new Error("Unsupported action.");
    return exec("docker", dockerActions[action], { cwd: config.server.composeProjectDir || config.server.installDir });
  }

  const systemdActions = {
    start: ["start", service],
    stop: ["stop", service],
    restart: ["restart", service],
    update: ["restart", service]
  };
  if (!systemdActions[action]) throw new Error("Unsupported action.");

  if (action === "update") {
    const update = await exec(config.server.steamcmdPath, [
      "+force_install_dir",
      config.server.installDir,
      "+login",
      "anonymous",
      "+app_update",
      "2394010",
      "validate",
      "+quit"
    ]);
    if (!update.ok) return update;
  }
  return exec("systemctl", systemdActions[action]);
}

async function createBackup(config) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fsp.mkdir(config.server.backupDir, { recursive: true });
  const target = path.join(config.server.backupDir, `palworld-save-${stamp}.tar.gz`);
  const result = await exec("tar", ["-czf", target, "-C", config.server.saveDir, "."]);
  return { ...result, backup: target };
}

async function listBackups(config) {
  await fsp.mkdir(config.server.backupDir, { recursive: true });
  const entries = await fsp.readdir(config.server.backupDir, { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tar.gz"))
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
    "content-type": "application/gzip",
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
  const keep = Number(config.automation.keepBackups || 0);
  if (!keep) return;
  const backups = await listBackups(config);
  await Promise.all(backups.slice(keep).map((backup) => fsp.unlink(backup.path).catch(() => {})));
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

async function querySaveData(config) {
  const output = {
    players: [],
    guilds: [],
    pals: [],
    inventory: [],
    map: null,
    source: "not_configured",
    message: "Configure server.saveParserCommand to parse Level.sav data."
  };
  if (!config.server.saveParserCommand) return output;
  const level = path.join(config.server.saveDir, "SaveGames");
  const result = await exec(config.server.saveParserCommand, [level], { timeout: 300000 });
  if (!result.ok) return { ...output, source: "parser_error", message: result.stderr || result.stdout };
  try {
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
      map: parsed.map || null,
      source: "parser"
    };
  } catch {
    return { ...output, source: "parser_error", message: "Save parser did not return JSON." };
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
    saveData: () => querySaveData(config),
    saveEntity: () => findSaveEntity(config, payload.type, payload.id),
    mapMarkers: async () => extractMapMarkers(await querySaveData(config)),
    settings: async () => (await applySettings(config, payload.settings || {})).settings
  };
  const handler = operations[operation];
  if (!handler) throw new Error("Unsupported Agent operation.");
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

async function handleApi(req, res, config) {
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
    return sendJson(res, 200, { ok: true, token: configuredToken, username: next.panel.adminUser });
  }

  if (req.method === "POST" && req.url === "/api/login") {
    const body = await readBody(req);
    const ok = body.token === effectivePanelToken(config)
      || (body.username === config.panel.adminUser && verifyPassword(body.password, config.panel.adminPasswordSalt, config.panel.adminPasswordHash));
    if (!ok) return sendError(res, 401, "Invalid login.");
    return sendJson(res, 200, { ok: true, token: effectivePanelToken(config) });
  }

  if (!isAuthorized(req, config)) return sendError(res, 401, "Unauthorized.");

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

  return sendError(res, 404, "API route not found.");
}

function startSchedulers() {
  setInterval(async () => {
    try {
      const config = await loadConfig();
      if (Number(config.automation.backupIntervalMinutes || 0) > 0) {
        const marker = path.join(dataDir, "last-backup.txt");
        const last = fs.existsSync(marker) ? Number(await fsp.readFile(marker, "utf8")) : 0;
        if (Date.now() - last >= Number(config.automation.backupIntervalMinutes) * 60000) {
          await managedCall("action", { action: "backup" }, () => createBackup(config));
          const agent = await loadAgentConfig();
          if (!agentIsEnabled(agent)) await trimBackups(config);
          await fsp.writeFile(marker, String(Date.now()));
        }
      }
      if (Number(config.automation.broadcastIntervalMinutes || 0) > 0 && config.automation.broadcastMessage) {
        const marker = path.join(dataDir, "last-broadcast.txt");
        const last = fs.existsSync(marker) ? Number(await fsp.readFile(marker, "utf8")) : 0;
        if (Date.now() - last >= Number(config.automation.broadcastIntervalMinutes) * 60000) {
          const command = `Broadcast ${config.automation.broadcastMessage}`;
          await managedCall("rcon", { command }, () => rcon(config, command));
          await fsp.writeFile(marker, String(Date.now()));
        }
      }

      const tasks = await listRconTasks();
      let changed = false;
      for (const task of tasks) {
        if (!task.enabled || !task.command || Number(task.intervalMinutes || 0) <= 0) continue;
        const due = Date.now() - Number(task.lastRun || 0) >= Number(task.intervalMinutes) * 60000;
        if (!due) continue;
        await managedCall("rcon", { command: task.command }, () => rcon(config, task.command));
        task.lastRun = Date.now();
        changed = true;
      }
      if (changed) await saveRconTasks(tasks);
    } catch (error) {
      console.error(`Scheduler error: ${error.message}`);
    }
  }, 30000).unref();
}

async function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(publicDir)) return sendError(res, 403, "Forbidden.");

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
  const server = http.createServer(async (req, res) => {
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
  });

  const host = agentRuntime ? (process.env.AGENT_HOST || "0.0.0.0") : config.panel.host;
  const port = agentRuntime ? Number(process.env.AGENT_PORT || 8081) : config.panel.port;
  server.listen(port, host, () => {
    console.log(`Palworld ${agentRuntime ? "agent" : "panel"} listening on http://${host}:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
