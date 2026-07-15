const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const os = require("os");
const net = require("net");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const configPath = process.env.PAL_PANEL_CONFIG || path.join(dataDir, "config.json");
const publicDir = path.join(rootDir, "public");

const defaultConfig = {
  panel: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 8080),
    token: process.env.PANEL_TOKEN || "change-me"
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
    saveParserCommand: ""
  },
  automation: {
    backupIntervalMinutes: 0,
    broadcastIntervalMinutes: 0,
    broadcastMessage: "",
    keepBackups: 20
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

async function ensureConfig() {
  await fsp.mkdir(dataDir, { recursive: true });
  if (!fs.existsSync(configPath)) {
    await writeJson(configPath, defaultConfig);
  }
}

async function loadConfig() {
  await ensureConfig();
  const raw = await fsp.readFile(configPath, "utf8");
  return mergeConfig(defaultConfig, JSON.parse(raw));
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

function isAuthorized(req, config) {
  const expected = process.env.PANEL_TOKEN || config.panel.token;
  if (!expected || expected === "change-me") return true;
  const header = req.headers.authorization || "";
  return header === `Bearer ${expected}`;
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
    return { ...JSON.parse(result.stdout), source: "parser" };
  } catch {
    return { ...output, source: "parser_error", message: "Save parser did not return JSON." };
  }
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

async function handleApi(req, res, config) {
  if (!isAuthorized(req, config)) return sendError(res, 401, "Unauthorized.");

  if (req.method === "GET" && req.url === "/api/status") {
    const status = await serviceStatus(config);
    return sendJson(res, 200, {
      ok: true,
      status,
      config: {
        panel: { host: config.panel.host, port: config.panel.port },
        server: config.server,
        automation: config.automation,
        settings: config.settings
      },
      host: {
        platform: os.platform(),
        arch: os.arch(),
        uptime: os.uptime(),
        freeMemory: os.freemem(),
        totalMemory: os.totalmem()
      }
    });
  }

  if (req.method === "GET" && req.url === "/api/live") {
    return sendJson(res, 200, { ok: true, live: await liveServerData(config) });
  }

  if (req.method === "POST" && req.url === "/api/rcon") {
    const body = await readBody(req);
    const result = await rcon(config, body.command || "");
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
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
    const result = await rcon(config, commands[body.action]);
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "GET" && req.url === "/api/backups") {
    return sendJson(res, 200, { ok: true, backups: await listBackups(config) });
  }

  if (req.method === "POST" && req.url === "/api/backup/restore") {
    const body = await readBody(req);
    const result = await restoreBackup(config, body.name);
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "POST" && req.url === "/api/backup/delete") {
    const body = await readBody(req);
    return sendJson(res, 200, { ok: true, result: await deleteBackup(config, body.name) });
  }

  if (req.method === "GET" && req.url === "/api/whitelist") {
    return sendJson(res, 200, { ok: true, players: await loadWhitelist() });
  }

  if (req.method === "PUT" && req.url === "/api/whitelist") {
    const body = await readBody(req);
    return sendJson(res, 200, { ok: true, players: await saveWhitelist(body.players || []) });
  }

  if (req.method === "GET" && req.url === "/api/save-data") {
    return sendJson(res, 200, { ok: true, data: await querySaveData(config) });
  }

  if (req.method === "POST" && req.url === "/api/action") {
    const body = await readBody(req);
    const result = body.action === "backup" ? await createBackup(config) : await runAction(body.action, config);
    return sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
  }

  if (req.method === "PUT" && req.url === "/api/settings") {
    const body = await readBody(req);
    const next = await applySettings(config, body.settings || {});
    return sendJson(res, 200, { ok: true, settings: next.settings });
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
    const config = await loadConfig();
    if (Number(config.automation.backupIntervalMinutes || 0) > 0) {
      const marker = path.join(dataDir, "last-backup.txt");
      const last = fs.existsSync(marker) ? Number(await fsp.readFile(marker, "utf8")) : 0;
      if (Date.now() - last >= Number(config.automation.backupIntervalMinutes) * 60000) {
        await createBackup(config);
        await trimBackups(config);
        await fsp.writeFile(marker, String(Date.now()));
      }
    }
    if (Number(config.automation.broadcastIntervalMinutes || 0) > 0 && config.automation.broadcastMessage) {
      const marker = path.join(dataDir, "last-broadcast.txt");
      const last = fs.existsSync(marker) ? Number(await fsp.readFile(marker, "utf8")) : 0;
      if (Date.now() - last >= Number(config.automation.broadcastIntervalMinutes) * 60000) {
        await rcon(config, `Broadcast ${config.automation.broadcastMessage}`);
        await fsp.writeFile(marker, String(Date.now()));
      }
    }
  }, 60000).unref();
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
  startSchedulers();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) {
        const currentConfig = await loadConfig();
        await handleApi(req, res, currentConfig);
      } else {
        await serveStatic(req, res);
      }
    } catch (error) {
      sendError(res, 500, error.message || "Internal server error.");
    }
  });

  server.listen(config.panel.port, config.panel.host, () => {
    console.log(`Palworld panel listening on http://${config.panel.host}:${config.panel.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
