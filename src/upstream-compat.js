const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cronParser = require("cron-parser");

const DEFAULT_COMMANDS = [
  { uuid: "show-players", command: "ShowPlayers", remark: "查看在线玩家", placeholder: "" },
  { uuid: "broadcast", command: "Broadcast", remark: "发送服务器广播", placeholder: "{message}" },
  { uuid: "kick-player", command: "KickPlayer", remark: "踢出玩家", placeholder: "{player_user_id}" },
  { uuid: "ban-player", command: "BanPlayer", remark: "封禁玩家", placeholder: "{player_user_id}" },
  { uuid: "unban-player", command: "UnBanPlayer", remark: "解除封禁", placeholder: "{player_user_id}" },
  { uuid: "save", command: "Save", remark: "保存世界", placeholder: "" },
  { uuid: "shutdown", command: "Shutdown", remark: "倒计时关闭服务器", placeholder: "{seconds} {message}" },
  { uuid: "do-exit", command: "DoExit", remark: "立即关闭服务器", placeholder: "" }
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberFrom(source, keys, fallback = 0) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== "") {
      const value = Number(source[key]);
      if (Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

function stringFrom(source, keys, fallback = "") {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) return String(source[key]);
  }
  return fallback;
}

function responsePayload(result) {
  if (!result) return {};
  if (result.data && typeof result.data === "object") return result.data;
  return result;
}

function normalizeOnlinePlayer(player = {}) {
  return {
    player_uid: stringFrom(player, ["player_uid", "playeruid", "playerUid", "PlayerUid"]),
    user_id: stringFrom(player, ["user_id", "userid", "userId", "UserId"]),
    steam_id: stringFrom(player, ["steam_id", "steamid", "steamId", "SteamId"]),
    nickname: stringFrom(player, ["nickname", "name", "Nickname"]),
    account_name: stringFrom(player, ["account_name", "accountname", "accountName"]),
    ip: stringFrom(player, ["ip", "ip_address", "ipaddress"]),
    ping: numberFrom(player, ["ping"]),
    location_x: numberFrom(player, ["location_x", "locationx", "x"]),
    location_y: numberFrom(player, ["location_y", "locationy", "y"]),
    level: numberFrom(player, ["level"]),
    building_count: numberFrom(player, ["building_count", "buildingcount"]),
    last_online: stringFrom(player, ["last_online", "lastonline"], new Date().toISOString())
  };
}

function redactPlayer(player = {}) {
  const userId = stringFrom(player, ["user_id", "userId"]);
  return {
    ...player,
    ip: "",
    steam_id: "",
    user_id: userId ? `${userId.split("_")[0]}_` : ""
  };
}

function extractOnlinePlayers(live = {}) {
  const payload = responsePayload(live.players);
  const players = Array.isArray(payload) ? payload : asArray(payload.players);
  return players.map(normalizeOnlinePlayer);
}

function normalizePlayer(player = {}, online = []) {
  const match = online.find((candidate) =>
    (candidate.player_uid && String(candidate.player_uid) === String(player.player_uid))
    || (candidate.user_id && player.user_id && candidate.user_id === player.user_id)
    || (candidate.steam_id && player.steam_id && candidate.steam_id === player.steam_id)
    || (candidate.nickname && player.nickname && candidate.nickname === player.nickname)
  );
  const onlineFields = match || {};
  return {
    ...player,
    player_uid: stringFrom(player, ["player_uid", "playerUid"]),
    nickname: stringFrom(player, ["nickname", "name"]),
    level: numberFrom(player, ["level"]),
    exp: numberFrom(player, ["exp"]),
    hp: numberFrom(player, ["hp"]),
    max_hp: numberFrom(player, ["max_hp", "maxHp"]),
    shield_hp: numberFrom(player, ["shield_hp", "shieldHp"]),
    shield_max_hp: numberFrom(player, ["shield_max_hp", "shieldMaxHp"]),
    max_status_point: numberFrom(player, ["max_status_point", "maxStatusPoint"]),
    status_point: player.status_point || player.statusPoint || {},
    full_stomach: numberFrom(player, ["full_stomach", "fullStomach"]),
    save_last_online: stringFrom(player, ["save_last_online", "saveLastOnline", "last_online"]),
    pals: asArray(player.pals),
    items: player.items || {},
    user_id: onlineFields.user_id || stringFrom(player, ["user_id", "userId"]),
    steam_id: onlineFields.steam_id || stringFrom(player, ["steam_id", "steamId"]),
    account_name: onlineFields.account_name || stringFrom(player, ["account_name", "accountName"]),
    ip: onlineFields.ip || stringFrom(player, ["ip"]),
    ping: onlineFields.ping || numberFrom(player, ["ping"]),
    location_x: onlineFields.location_x || numberFrom(player, ["location_x", "locationX"]),
    location_y: onlineFields.location_y || numberFrom(player, ["location_y", "locationY"]),
    building_count: onlineFields.building_count || numberFrom(player, ["building_count", "buildingCount"]),
    last_online: onlineFields.last_online || stringFrom(player, ["last_online", "save_last_online"])
  };
}

function normalizeGuild(guild = {}) {
  return {
    ...guild,
    name: guild.name || "Unnamed Guild",
    base_camp_level: numberFrom(guild, ["base_camp_level", "baseCampLevel"]),
    admin_player_uid: stringFrom(guild, ["admin_player_uid", "adminPlayerUid"]),
    players: asArray(guild.players).map((player) => ({
      ...player,
      player_uid: stringFrom(player, ["player_uid", "playerUid"]),
      nickname: stringFrom(player, ["nickname", "name"])
    })),
    base_camp: asArray(guild.base_camp || guild.baseCamp).map((camp) => ({
      ...camp,
      id: stringFrom(camp, ["id", "base_id", "baseId"]),
      area: numberFrom(camp, ["area"]),
      location_x: numberFrom(camp, ["location_x", "locationX", "x"]),
      location_y: numberFrom(camp, ["location_y", "locationY", "y"])
    }))
  };
}

function normalizeWhitelistEntry(entry = {}) {
  if (typeof entry === "string") return { name: entry, player_uid: entry, steam_id: "" };
  return {
    name: stringFrom(entry, ["name", "nickname"]),
    steam_id: stringFrom(entry, ["steam_id", "steamId"]),
    player_uid: stringFrom(entry, ["player_uid", "playerUid"])
  };
}

function normalizeCommand(command = {}) {
  const legacy = !command.uuid && DEFAULT_COMMANDS.find((item) => item.uuid === command.id);
  if (legacy) {
    return {
      ...legacy,
      remark: String(command.remark || command.name || legacy.remark)
    };
  }
  return {
    uuid: String(command.uuid || command.id || crypto.randomUUID()),
    command: String(command.command || "").trim(),
    placeholder: String(command.placeholder || ""),
    remark: String(command.remark || command.name || command.command || "RCON")
  };
}

function cronForLegacyTask(task) {
  const minutes = Math.max(1, Number(task.intervalMinutes || 60));
  return minutes <= 59 ? `*/${minutes} * * * *` : `0 */${Math.max(1, Math.round(minutes / 60))} * * *`;
}

function normalizeTask(task = {}, commands = []) {
  let rconUUID = task.rcon_uuid || task.rconUUID || "";
  if (!rconUUID && task.command) {
    const matching = commands.find((command) => command.command === String(task.command).split(" ")[0]);
    rconUUID = matching?.uuid || "";
  }
  return {
    uuid: String(task.uuid || task.id || crypto.randomUUID()),
    name: String(task.name || task.command || "RCON Task"),
    rcon_uuid: String(rconUUID),
    content: String(task.content || ""),
    cron: String(task.cron || cronForLegacyTask(task)),
    enabled: Boolean(task.enabled),
    created_at: task.created_at || task.createdAt || new Date().toISOString(),
    updated_at: task.updated_at || task.updatedAt || new Date().toISOString(),
    last_run_at: task.last_run_at || task.lastRunAt || (task.lastRun ? new Date(task.lastRun).toISOString() : null),
    last_status: task.last_status || task.lastStatus || "never",
    last_result: task.last_result || task.lastResult || "",
    last_error: task.last_error || task.lastError || "",
    run_count: Number(task.run_count || task.runCount || 0)
  };
}

function nextCronRun(expression, after = new Date()) {
  try {
    return cronParser.parseExpression(expression, { currentDate: after }).next().toDate().toISOString();
  } catch {
    return null;
  }
}

function taskResponse(task, commands) {
  const command = commands.find((item) => item.uuid === task.rcon_uuid);
  return {
    ...task,
    rcon_remark: command?.remark || "",
    next_run_at: task.enabled ? nextCronRun(task.cron) : null
  };
}

function splitAddress(address, defaultHost, defaultPort) {
  const value = String(address || "").trim();
  if (!value) return { host: defaultHost, port: defaultPort };
  try {
    const url = new URL(value.includes("://") ? value : `tcp://${value}`);
    return { host: url.hostname || defaultHost, port: Number(url.port || defaultPort) };
  } catch {
    return { host: defaultHost, port: defaultPort };
  }
}

function toUpstreamConfig(config) {
  const automation = config.automation || {};
  const server = config.server || {};
  return {
    web: {
      port: Number(config.panel?.port || 19090),
      port_source: process.env.PORT ? "environment" : "",
      tls: Boolean(automation.webTls),
      cert_path: automation.webCertPath || "",
      key_path: automation.webKeyPath || "",
      public_url: automation.webPublicUrl || ""
    },
    task: {
      sync_interval: Number(automation.playerSyncInterval || 60),
      player_logging: Boolean(automation.playerLogging),
      player_login_message: automation.playerLoginMessage || "Player {username} has joined the server! Current online player count: {online_num}.",
      player_logout_message: automation.playerLogoutMessage || "Player {username} has left the server! Current online player count: {online_num}."
    },
    rcon: {
      address: `${server.rconHost || "127.0.0.1"}:${Number(server.rconPort || 25575)}`,
      password: config.settings?.AdminPassword || "",
      use_base64: Boolean(automation.rconUseBase64),
      timeout: Number(automation.rconTimeout || 5)
    },
    rest: {
      address: `http://${server.restHost || "127.0.0.1"}:${Number(server.restPort || 8212)}`,
      username: server.restUser || "admin",
      password: server.restPassword || config.settings?.AdminPassword || "",
      timeout: Number(automation.restTimeout || 5)
    },
    save: {
      source_mode: automation.saveSourceMode || "directory",
      path: server.saveDir || "",
      decode_path: server.saveParserCommand || "",
      sync_interval: Number(automation.saveSyncInterval || 120),
      backup_interval: Number(automation.backupIntervalMinutes || 0) * 60,
      backup_keep_days: Number(automation.backupKeepDays || 7)
    },
    manage: {
      kick_non_whitelist: Boolean(automation.kickNonWhitelist)
    }
  };
}

async function readMultipartText(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Uploaded file is too large.");
    chunks.push(chunk);
  }
  const type = req.headers["content-type"] || "";
  const boundary = type.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || type.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) throw new Error("Invalid multipart upload.");
  const raw = Buffer.concat(chunks).toString("utf8");
  const part = raw.split(`--${boundary}`).find((value) => value.includes("filename="));
  if (!part) throw new Error("No command file was uploaded.");
  return part.slice(part.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "").trim();
}

function createUpstreamCompatibility(deps) {
  let saveCache = { expiresAt: 0, data: null };

  async function loadSyncedSaveData() {
    if (!deps.loadSyncedSaveData) return { players: [], guilds: [], source: "sync" };
    const stored = await deps.loadSyncedSaveData();
    return {
      ...stored,
      players: asArray(stored?.players),
      guilds: asArray(stored?.guilds),
      source: stored?.source || "sync"
    };
  }

  async function updateSyncedSaveData(key, rows) {
    const current = saveCache.data || await loadSyncedSaveData();
    const next = {
      ...current,
      [key]: asArray(rows),
      source: "sync",
      synced_at: new Date().toISOString()
    };
    if (deps.saveSyncedSaveData) await deps.saveSyncedSaveData(next);
    saveCache = { expiresAt: Date.now() + 15000, data: next };
    return next;
  }

  async function getSaveData(config, force = false) {
    if (!force && saveCache.data && Date.now() < saveCache.expiresAt) return saveCache.data;
    let data = await deps.managedCall("saveData", {}, () => deps.querySaveData(config));
    if (!asArray(data?.players).length && !asArray(data?.guilds).length) {
      const synced = await loadSyncedSaveData();
      if (synced.players.length || synced.guilds.length) data = synced;
    }
    saveCache = { expiresAt: Date.now() + 15000, data };
    return data;
  }

  async function getLive(config) {
    return deps.managedCall("live", {}, () => deps.liveServerData(config));
  }

  async function getPlayers(config) {
    const [saveData, live] = await Promise.all([getSaveData(config), getLive(config)]);
    const online = extractOnlinePlayers(live);
    return asArray(saveData.players).map((player) => normalizePlayer(player, online));
  }

  async function getCommands() {
    const stored = asArray(await deps.listRconTemplates()).map(normalizeCommand).filter((item) => item.command);
    const commands = [...stored];
    for (const fallback of DEFAULT_COMMANDS) {
      if (!commands.some((item) => item.command.toLowerCase() === fallback.command.toLowerCase())) {
        commands.push(fallback);
      }
    }
    if (commands.length !== stored.length) await deps.saveRconTemplates(commands);
    return commands;
  }

  async function getTasks() {
    const commands = await getCommands();
    return asArray(await deps.listRconTasks()).map((task) => normalizeTask(task, commands));
  }

  async function executeTask(config, task, commands) {
    const command = commands.find((item) => item.uuid === task.rcon_uuid);
    if (!command) throw new Error("RCON command not found.");
    const fullCommand = `${command.command}${task.content ? ` ${task.content}` : ""}`;
    const result = await deps.managedCall("rcon", { command: fullCommand }, () => deps.rcon(config, fullCommand));
    const now = new Date().toISOString();
    return {
      ...task,
      updated_at: now,
      last_run_at: now,
      last_status: result.ok ? "success" : "failed",
      last_result: result.ok ? (result.stdout || "Success") : "",
      last_error: result.ok ? "" : (result.stderr || result.stdout || "RCON failed"),
      run_count: Number(task.run_count || 0) + 1
    };
  }

  async function handlePublic(req, res, config) {
    const requestUrl = new URL(req.url, "http://localhost");
    if (req.method === "GET" && requestUrl.pathname === "/api/config/status") {
      deps.sendJson(res, 200, { initialized: Boolean(config.panel.adminInitialized) });
      return true;
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/config/initialize") {
      if (config.panel.adminInitialized) {
        deps.sendError(res, 409, "Administrator has already been initialized.");
        return true;
      }
      const body = await deps.readBody(req);
      if (!String(body.password || "").trim()) {
        deps.sendError(res, 400, "Administrator password is required.");
        return true;
      }
      if (String(body.password).length < 8) {
        deps.sendError(res, 400, "Password must be at least 8 characters.");
        return true;
      }
      const password = deps.hashPassword(body.password);
      const token = process.env.PANEL_TOKEN && process.env.PANEL_TOKEN !== "change-me"
        ? process.env.PANEL_TOKEN
        : crypto.randomBytes(24).toString("hex");
      await deps.saveConfig({
        ...config,
        panel: {
          ...config.panel,
          token,
          adminInitialized: true,
          adminUser: "admin",
          adminPasswordHash: password.hash,
          adminPasswordSalt: password.salt
        }
      });
      deps.sendJson(res, 200, { token });
      return true;
    }
    return false;
  }

  async function handleOptional(req, res, config, authenticated = false) {
    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = requestUrl.pathname;
    if (req.method !== "GET") return false;

    if (pathname === "/api/server/tool") {
      deps.sendJson(res, 200, { version: deps.version, latest: deps.version });
      return true;
    }
    if (pathname === "/api/server") {
      const live = await getLive(config);
      const info = responsePayload(live.info);
      deps.sendJson(res, 200, {
        version: stringFrom(info, ["version"], "Unknown"),
        name: stringFrom(info, ["name", "servername", "server_name"], config.settings.ServerName)
      });
      return true;
    }
    if (pathname === "/api/server/metrics") {
      const live = await getLive(config);
      const metrics = responsePayload(live.metrics);
      deps.sendJson(res, 200, {
        server_fps: numberFrom(metrics, ["server_fps", "serverfps"]),
        current_player_num: numberFrom(metrics, ["current_player_num", "currentplayernum"]),
        server_frame_time: numberFrom(metrics, ["server_frame_time", "serverframetime"]),
        max_player_num: numberFrom(metrics, ["max_player_num", "maxplayernum"]),
        uptime: numberFrom(metrics, ["uptime"]),
        days: numberFrom(metrics, ["days"])
      });
      return true;
    }
    if (pathname === "/api/online_player") {
      const players = extractOnlinePlayers(await getLive(config));
      deps.sendJson(res, 200, authenticated ? players : players.map(redactPlayer));
      return true;
    }
    if (pathname === "/api/player") {
      const players = await getPlayers(config);
      const orderBy = requestUrl.searchParams.get("order_by");
      const desc = requestUrl.searchParams.get("desc") === "true" ? -1 : 1;
      if (orderBy === "level") players.sort((a, b) => (a.level - b.level) * desc);
      if (orderBy === "last_online") players.sort((a, b) => (Date.parse(a.last_online || 0) - Date.parse(b.last_online || 0)) * desc);
      deps.sendJson(res, 200, authenticated ? players : players.map(redactPlayer));
      return true;
    }
    const playerMatch = pathname.match(/^\/api\/player\/([^/]+)$/);
    if (playerMatch) {
      const uid = decodeURIComponent(playerMatch[1]);
      const player = (await getPlayers(config)).find((item) => String(item.player_uid) === uid);
      deps.sendJson(res, player ? 200 : 404, player ? (authenticated ? player : redactPlayer(player)) : {});
      return true;
    }
    if (pathname === "/api/guild") {
      const data = await getSaveData(config);
      const guilds = asArray(data.guilds).map(normalizeGuild).sort((a, b) => b.base_camp_level - a.base_camp_level);
      deps.sendJson(res, 200, guilds);
      return true;
    }
    const guildMatch = pathname.match(/^\/api\/guild\/([^/]+)$/);
    if (guildMatch) {
      const uid = decodeURIComponent(guildMatch[1]);
      const guild = asArray((await getSaveData(config)).guilds).map(normalizeGuild).find((item) => item.admin_player_uid === uid);
      deps.sendJson(res, guild ? 200 : 404, guild || {});
      return true;
    }
    return false;
  }

  async function handleAuthorized(req, res, config) {
    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = requestUrl.pathname;

    if (req.method === "GET" && pathname === "/api/config") {
      const managedConfig = await deps.managedCall("config", {}, () => config);
      deps.sendJson(res, 200, toUpstreamConfig({ ...config, ...managedConfig, panel: config.panel }));
      return true;
    }
    if (req.method === "PUT" && pathname === "/api/config") {
      const body = await deps.readBody(req);
      if (!body.settings) return false;
      const settings = body.settings;
      const managedConfig = await deps.managedCall("config", {}, () => config);
      const effectiveConfig = { ...config, ...managedConfig, panel: config.panel };
      const rconAddress = splitAddress(settings.rcon?.address, effectiveConfig.server.rconHost, effectiveConfig.server.rconPort);
      const restAddress = splitAddress(settings.rest?.address, effectiveConfig.server.restHost, effectiveConfig.server.restPort);
      const next = {
        ...effectiveConfig,
        panel: { ...config.panel, port: Number(settings.web?.port || config.panel.port) },
        server: {
          ...effectiveConfig.server,
          rconHost: rconAddress.host,
          rconPort: rconAddress.port,
          restHost: restAddress.host,
          restPort: restAddress.port,
          restUser: settings.rest?.username || effectiveConfig.server.restUser,
          restPassword: settings.rest?.password ?? effectiveConfig.server.restPassword,
          saveDir: settings.save?.path || effectiveConfig.server.saveDir,
          saveParserCommand: settings.save?.decode_path || effectiveConfig.server.saveParserCommand
        },
        automation: {
          ...effectiveConfig.automation,
          webTls: Boolean(settings.web?.tls),
          webCertPath: settings.web?.cert_path || "",
          webKeyPath: settings.web?.key_path || "",
          webPublicUrl: settings.web?.public_url || "",
          playerSyncInterval: Number(settings.task?.sync_interval || 0),
          playerLogging: Boolean(settings.task?.player_logging),
          playerLoginMessage: settings.task?.player_login_message || "",
          playerLogoutMessage: settings.task?.player_logout_message || "",
          rconUseBase64: Boolean(settings.rcon?.use_base64),
          rconTimeout: Number(settings.rcon?.timeout || 5),
          restTimeout: Number(settings.rest?.timeout || 5),
          saveSourceMode: settings.save?.source_mode || "directory",
          saveSyncInterval: Number(settings.save?.sync_interval || 0),
          backupIntervalMinutes: Math.max(0, Math.round(Number(settings.save?.backup_interval || 0) / 60)),
          backupKeepDays: Number(settings.save?.backup_keep_days || 0),
          kickNonWhitelist: Boolean(settings.manage?.kick_non_whitelist)
        },
        settings: {
          ...effectiveConfig.settings,
          AdminPassword: settings.rcon?.password || effectiveConfig.settings.AdminPassword
        }
      };
      if (body.new_password) {
        const password = deps.hashPassword(body.new_password);
        next.panel.adminPasswordHash = password.hash;
        next.panel.adminPasswordSalt = password.salt;
      }
      await deps.managedCall("configUpdate", {
        server: next.server,
        automation: next.automation,
        settings: next.settings
      }, async () => ({ success: true }));
      await deps.saveConfig(next);
      deps.sendJson(res, 200, {
        success: true,
        token: body.new_password ? deps.effectivePanelToken(next) : "",
        restart_required: Number(next.panel.port) !== Number(config.panel.port),
        restart_fields: Number(next.panel.port) !== Number(config.panel.port) ? ["web.port"] : []
      });
      return true;
    }
    if (req.method === "GET" && pathname === "/api/config/directories") {
      const requestedPath = requestUrl.searchParams.get("path") || process.cwd();
      const listing = await deps.managedCall("directories", { path: requestedPath }, async () => {
        const target = path.resolve(requestedPath);
        const entries = await fsp.readdir(target, { withFileTypes: true });
        return {
          current: target,
          parent: path.dirname(target),
          roots: os.platform() === "win32"
            ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((drive) => `${drive}:\\`).filter((drive) => fs.existsSync(drive))
            : ["/"],
          entries: entries.filter((entry) => entry.isDirectory()).map((entry) => ({ name: entry.name, path: path.join(target, entry.name) }))
        };
      });
      deps.sendJson(res, 200, listing);
      return true;
    }
    if (req.method === "POST" && pathname === "/api/config/test/save") {
      const body = await deps.readBody(req);
      const target = body.save?.path;
      const result = await deps.managedCall("testSave", { path: target }, async () => {
        if (!target) return { status: "unconfigured", message: "Save path is empty." };
        if (!fs.existsSync(target)) return { status: "error", message: "Save path does not exist." };
        return { status: "normal", message: path.resolve(target) };
      });
      deps.sendJson(res, 200, result);
      return true;
    }
    if (req.method === "POST" && pathname === "/api/config/test/rcon") {
      const body = await deps.readBody(req);
      const managedConfig = await deps.managedCall("config", {}, () => config);
      const effectiveConfig = { ...config, ...managedConfig, panel: config.panel };
      const address = splitAddress(body.rcon?.address, effectiveConfig.server.rconHost, effectiveConfig.server.rconPort);
      const temporary = {
        ...effectiveConfig,
        server: { ...effectiveConfig.server, rconHost: address.host, rconPort: address.port },
        settings: { ...effectiveConfig.settings, AdminPassword: body.rcon?.password || effectiveConfig.settings.AdminPassword }
      };
      const result = await deps.managedCall("testRcon", {
        server: temporary.server,
        settings: temporary.settings
      }, () => deps.rcon(temporary, "ShowPlayers"));
      deps.sendJson(res, 200, { status: result.ok ? "normal" : "error", message: result.stdout || result.stderr });
      return true;
    }
    if (req.method === "GET" && pathname === "/api/server/tool") {
      deps.sendJson(res, 200, { version: deps.version, latest: deps.version });
      return true;
    }
    if (req.method === "GET" && pathname === "/api/server") {
      const live = await getLive(config);
      const info = responsePayload(live.info);
      deps.sendJson(res, 200, {
        version: stringFrom(info, ["version"], "Unknown"),
        name: stringFrom(info, ["name", "servername", "server_name"], config.settings.ServerName)
      });
      return true;
    }
    if (req.method === "GET" && pathname === "/api/server/metrics") {
      const live = await getLive(config);
      const metrics = responsePayload(live.metrics);
      deps.sendJson(res, 200, {
        server_fps: numberFrom(metrics, ["server_fps", "serverfps"]),
        current_player_num: numberFrom(metrics, ["current_player_num", "currentplayernum"]),
        server_frame_time: numberFrom(metrics, ["server_frame_time", "serverframetime"]),
        max_player_num: numberFrom(metrics, ["max_player_num", "maxplayernum"]),
        uptime: numberFrom(metrics, ["uptime"]),
        days: numberFrom(metrics, ["days"])
      });
      return true;
    }
    if (req.method === "POST" && pathname === "/api/server/broadcast") {
      const body = await deps.readBody(req);
      const command = `Broadcast ${String(body.message || "").trim()}`;
      const result = await deps.managedCall("rcon", { command }, () => deps.rcon(config, command));
      deps.sendJson(res, result.ok ? 200 : 400, result.ok ? { success: true } : { error: result.stderr || result.stdout });
      return true;
    }
    if (req.method === "POST" && pathname === "/api/server/shutdown") {
      const body = await deps.readBody(req);
      const command = `Shutdown ${Math.max(0, Number(body.seconds || 0))} ${String(body.message || "Server shutdown")}`;
      const result = await deps.managedCall("rcon", { command }, () => deps.rcon(config, command));
      deps.sendJson(res, result.ok ? 200 : 400, result.ok ? { success: true } : { error: result.stderr || result.stdout });
      return true;
    }
    if (req.method === "PUT" && pathname === "/api/player") {
      await updateSyncedSaveData("players", await deps.readBody(req));
      deps.sendJson(res, 200, { success: true });
      return true;
    }
    if (req.method === "PUT" && pathname === "/api/guild") {
      await updateSyncedSaveData("guilds", await deps.readBody(req));
      deps.sendJson(res, 200, { success: true });
      return true;
    }
    if (req.method === "POST" && pathname === "/api/sync") {
      const source = requestUrl.searchParams.get("from");
      if (!['rest', 'sav'].includes(source)) {
        deps.sendJson(res, 200, { error: "invalid from" });
        return true;
      }
      if (source === "sav") {
        const data = await deps.managedCall("saveData", {}, () => deps.querySaveData(config));
        if (deps.saveSyncedSaveData) await deps.saveSyncedSaveData({ ...data, source: "sync", synced_at: new Date().toISOString() });
        saveCache = { expiresAt: Date.now() + 15000, data };
      } else {
        saveCache.expiresAt = 0;
        await getLive(config);
      }
      deps.sendJson(res, 200, { success: true });
      return true;
    }
    if (req.method === "GET" && pathname === "/api/online_player") {
      deps.sendJson(res, 200, extractOnlinePlayers(await getLive(config)));
      return true;
    }
    if (req.method === "GET" && pathname === "/api/player") {
      const players = await getPlayers(config);
      const orderBy = requestUrl.searchParams.get("order_by");
      const desc = requestUrl.searchParams.get("desc") === "true" ? -1 : 1;
      if (orderBy === "level") players.sort((a, b) => (a.level - b.level) * desc);
      if (orderBy === "last_online") players.sort((a, b) => (Date.parse(a.last_online || 0) - Date.parse(b.last_online || 0)) * desc);
      deps.sendJson(res, 200, players);
      return true;
    }
    const playerMatch = pathname.match(/^\/api\/player\/([^/]+)$/);
    if (req.method === "GET" && playerMatch) {
      const uid = decodeURIComponent(playerMatch[1]);
      const player = (await getPlayers(config)).find((item) => String(item.player_uid) === uid);
      deps.sendJson(res, player ? 200 : 404, player || {});
      return true;
    }
    const actionMatch = pathname.match(/^\/api\/player\/([^/]+)\/(kick|ban|unban)$/);
    if (req.method === "POST" && actionMatch) {
      const uid = decodeURIComponent(actionMatch[1]);
      const action = actionMatch[2];
      const player = (await getPlayers(config)).find((item) => String(item.player_uid) === uid);
      if (!player) {
        deps.sendError(res, 404, "Player not found.");
        return true;
      }
      const target = player.user_id || (player.steam_id ? `steam_${player.steam_id}` : player.player_uid);
      const verb = action === "kick" ? "KickPlayer" : action === "ban" ? "BanPlayer" : "UnBanPlayer";
      const command = `${verb} ${target}`;
      const result = await deps.managedCall("rcon", { command }, () => deps.rcon(config, command));
      deps.sendJson(res, result.ok ? 200 : 400, result.ok ? { success: true } : { error: result.stderr || result.stdout });
      return true;
    }
    if (req.method === "GET" && pathname === "/api/guild") {
      const data = await getSaveData(config);
      const guilds = asArray(data.guilds).map(normalizeGuild).sort((a, b) => b.base_camp_level - a.base_camp_level);
      deps.sendJson(res, 200, guilds);
      return true;
    }
    const guildMatch = pathname.match(/^\/api\/guild\/([^/]+)$/);
    if (req.method === "GET" && guildMatch) {
      const uid = decodeURIComponent(guildMatch[1]);
      const guild = asArray((await getSaveData(config)).guilds).map(normalizeGuild).find((item) => item.admin_player_uid === uid);
      deps.sendJson(res, guild ? 200 : 404, guild || {});
      return true;
    }
    if (pathname === "/api/whitelist") {
      const current = asArray(await deps.loadWhitelist()).map(normalizeWhitelistEntry);
      if (req.method === "GET") deps.sendJson(res, 200, current);
      else if (req.method === "POST") {
        const body = normalizeWhitelistEntry(await deps.readBody(req));
        const duplicate = current.some((item) => item.player_uid === body.player_uid && item.steam_id === body.steam_id);
        if (!duplicate) current.push(body);
        await deps.saveWhitelist(current);
        deps.sendJson(res, 200, { success: true });
      } else if (req.method === "DELETE") {
        const body = normalizeWhitelistEntry(await deps.readBody(req));
        await deps.saveWhitelist(current.filter((item) => !(item.player_uid === body.player_uid && item.steam_id === body.steam_id)));
        deps.sendJson(res, 200, { success: true });
      } else if (req.method === "PUT") {
        const body = await deps.readBody(req);
        await deps.saveWhitelist(asArray(body).map(normalizeWhitelistEntry));
        deps.sendJson(res, 200, { success: true });
      } else return false;
      return true;
    }
    if (req.method === "GET" && pathname === "/api/rcon") {
      deps.sendJson(res, 200, await getCommands());
      return true;
    }
    if (req.method === "POST" && pathname === "/api/rcon/send") {
      const body = await deps.readBody(req);
      const command = (await getCommands()).find((item) => item.uuid === body.uuid);
      if (!command) {
        deps.sendError(res, 404, "RCON command not found.");
        return true;
      }
      const fullCommand = `${command.command}${body.content ? ` ${body.content}` : ""}`;
      const result = await deps.managedCall("rcon", { command: fullCommand }, () => deps.rcon(config, fullCommand));
      deps.sendJson(res, result.ok ? 200 : 400, result.ok ? { message: result.stdout } : { error: result.stderr || result.stdout });
      return true;
    }
    if (req.method === "POST" && pathname === "/api/rcon/import") {
      const text = await readMultipartText(req);
      const commands = await getCommands();
      for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
        const [command, remark, placeholder = ""] = line.split(",").map((item) => item.trim());
        if (!command || !remark) throw new Error("Invalid command file format.");
        commands.push(normalizeCommand({ command, remark, placeholder }));
      }
      await deps.saveRconTemplates(commands);
      deps.sendJson(res, 200, { success: true });
      return true;
    }
    if (req.method === "POST" && pathname === "/api/rcon") {
      const commands = await getCommands();
      commands.push(normalizeCommand(await deps.readBody(req)));
      await deps.saveRconTemplates(commands);
      deps.sendJson(res, 200, { success: true });
      return true;
    }
    const commandMatch = pathname.match(/^\/api\/rcon\/([^/]+)$/);
    if (commandMatch && ["PUT", "DELETE"].includes(req.method)) {
      const uuid = decodeURIComponent(commandMatch[1]);
      const commands = await getCommands();
      if (req.method === "PUT") {
        const body = await deps.readBody(req);
        await deps.saveRconTemplates(commands.map((item) => item.uuid === uuid ? normalizeCommand({ ...body, uuid }) : item));
      } else {
        const tasks = await getTasks();
        if (tasks.some((task) => task.rcon_uuid === uuid)) {
          deps.sendError(res, 409, "RCON command is used by a scheduled task.");
          return true;
        }
        await deps.saveRconTemplates(commands.filter((item) => item.uuid !== uuid));
      }
      deps.sendJson(res, 200, { success: true });
      return true;
    }
    if (req.method === "GET" && pathname === "/api/rcon/tasks") {
      const commands = await getCommands();
      deps.sendJson(res, 200, (await getTasks()).map((task) => taskResponse(task, commands)));
      return true;
    }
    if (req.method === "POST" && pathname === "/api/rcon/tasks") {
      const commands = await getCommands();
      const body = await deps.readBody(req);
      if (!commands.some((item) => item.uuid === body.rcon_uuid)) {
        deps.sendError(res, 400, `RCON command not found: ${body.rcon_uuid || "(empty)"}.`);
        return true;
      }
      if (!nextCronRun(body.cron)) {
        deps.sendError(res, 400, "Invalid cron expression.");
        return true;
      }
      const task = normalizeTask({ ...body, uuid: crypto.randomUUID(), created_at: new Date().toISOString() }, commands);
      const tasks = await getTasks();
      tasks.push(task);
      await deps.saveRconTasks(tasks);
      deps.sendJson(res, 200, taskResponse(task, commands));
      return true;
    }
    const taskRunMatch = pathname.match(/^\/api\/rcon\/tasks\/([^/]+)\/run$/);
    if (req.method === "POST" && taskRunMatch) {
      const uuid = decodeURIComponent(taskRunMatch[1]);
      const commands = await getCommands();
      const tasks = await getTasks();
      const index = tasks.findIndex((item) => item.uuid === uuid);
      if (index < 0) {
        deps.sendError(res, 404, "RCON task not found.");
        return true;
      }
      tasks[index] = await executeTask(config, tasks[index], commands);
      await deps.saveRconTasks(tasks);
      deps.sendJson(res, tasks[index].last_status === "success" ? 200 : 400, taskResponse(tasks[index], commands));
      return true;
    }
    const taskMatch = pathname.match(/^\/api\/rcon\/tasks\/([^/]+)$/);
    if (taskMatch && ["PUT", "DELETE"].includes(req.method)) {
      const uuid = decodeURIComponent(taskMatch[1]);
      const commands = await getCommands();
      const tasks = await getTasks();
      const index = tasks.findIndex((item) => item.uuid === uuid);
      if (index < 0) {
        deps.sendError(res, 404, "RCON task not found.");
        return true;
      }
      if (req.method === "DELETE") tasks.splice(index, 1);
      else {
        const body = await deps.readBody(req);
        if (!nextCronRun(body.cron)) {
          deps.sendError(res, 400, "Invalid cron expression.");
          return true;
        }
        tasks[index] = normalizeTask({ ...tasks[index], ...body, uuid, updated_at: new Date().toISOString() }, commands);
      }
      await deps.saveRconTasks(tasks);
      deps.sendJson(res, 200, req.method === "DELETE" ? { success: true } : taskResponse(tasks[index], commands));
      return true;
    }
    if (req.method === "GET" && pathname === "/api/backup") {
      const start = Number(requestUrl.searchParams.get("startTime") || 0);
      const end = Number(requestUrl.searchParams.get("endTime") || 0);
      const backups = await deps.managedCall("backups", {}, () => deps.listBackups(config));
      deps.sendJson(res, 200, asArray(backups).map((backup) => ({
        backup_id: backup.name,
        save_time: backup.mtime,
        path: backup.name
      })).filter((backup) => (!start || Date.parse(backup.save_time) >= start) && (!end || Date.parse(backup.save_time) <= end)));
      return true;
    }
    const backupMatch = pathname.match(/^\/api\/backup\/([^/]+)$/);
    if (backupMatch && req.method === "GET") {
      await deps.downloadBackup(req, res, config, decodeURIComponent(backupMatch[1]));
      return true;
    }
    if (backupMatch && req.method === "DELETE") {
      const name = decodeURIComponent(backupMatch[1]);
      await deps.managedCall("deleteBackup", { name }, () => deps.deleteBackup(config, name));
      deps.sendJson(res, 200, { success: true });
      return true;
    }
    return false;
  }

  async function runScheduledTasks(config) {
    const now = Date.now();
    const commands = await getCommands();
    const tasks = await getTasks();
    let changed = false;
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      if (!task.enabled) continue;
      let scheduledAt;
      try {
        scheduledAt = cronParser.parseExpression(task.cron, { currentDate: new Date(now - 65000) }).next().getTime();
      } catch {
        continue;
      }
      const lastRun = task.last_run_at ? Date.parse(task.last_run_at) : 0;
      if (scheduledAt > now || lastRun >= scheduledAt) continue;
      try {
        tasks[index] = await executeTask(config, task, commands);
      } catch (error) {
        tasks[index] = {
          ...task,
          updated_at: new Date().toISOString(),
          last_run_at: new Date().toISOString(),
          last_status: "failed",
          last_result: "",
          last_error: error.message,
          run_count: Number(task.run_count || 0) + 1
        };
      }
      changed = true;
    }
    if (changed) await deps.saveRconTasks(tasks);
  }

  return { handlePublic, handleOptional, handleAuthorized, runScheduledTasks };
}

module.exports = { createUpstreamCompatibility, DEFAULT_COMMANDS };
