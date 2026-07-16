const state = {
  token: localStorage.getItem("pal-panel-token") || "",
  config: null,
  rconTemplates: [],
  rconTasks: [],
  live: null,
  onlinePlayers: [],
  backups: [],
  saveData: null,
  activeSaveSection: "players",
  activeTab: "overview",
  selectedPlayerIndex: null,
  map: null,
  markerLayer: null,
  loginPromise: null,
  loginResolve: null,
  initPromise: null,
  initResolve: null
};

const statusPill = document.querySelector("#statusPill");
const actionLog = document.querySelector("#actionLog");
const settingsForm = document.querySelector("#settingsForm");
const automationForm = document.querySelector("#automationForm");
const deployForm = document.querySelector("#deployForm");
const agentForm = document.querySelector("#agentForm");
const loginDialog = document.querySelector("#loginDialog");
const initDialog = document.querySelector("#initDialog");
const rconTaskDialog = document.querySelector("#rconTaskDialog");
const detailDialog = document.querySelector("#detailDialog");

const settingGroups = [
  {
    title: "基础信息",
    fields: [
      ["ServerName", "服务器名称", "text"],
      ["ServerDescription", "服务器说明", "text"],
      ["AdminPassword", "管理员密码", "password"],
      ["ServerPassword", "加入密码", "password"]
    ]
  },
  {
    title: "网络与管理接口",
    fields: [
      ["PublicPort", "公网端口", "number"],
      ["RCONPort", "RCON 端口", "number"],
      ["RESTAPIPort", "REST API 端口", "number"],
      ["RCONEnabled", "启用 RCON", "checkbox"],
      ["RESTAPIEnabled", "启用 REST API", "checkbox"]
    ]
  },
  {
    title: "世界规则",
    fields: [
      ["Difficulty", "难度", "text"],
      ["ExpRate", "经验倍率", "number"],
      ["PalCaptureRate", "捕获倍率", "number"],
      ["DayTimeSpeedRate", "白天速度", "number"],
      ["NightTimeSpeedRate", "夜晚速度", "number"],
      ["DeathPenalty", "死亡惩罚", "text"]
    ]
  }
];

const pageMetadata = {
  overview: ["服务器总览", "运行状态与快捷控制", "查看服务器健康状态、在线玩家和最近备份。"],
  players: ["玩家管理", "玩家、白名单与在线操作", "搜索玩家档案，执行广播、踢出、封禁和关服操作。"],
  saves: ["存档数据", "玩家、公会、帕鲁与世界地图", "解析 Level.sav，并以结构化方式检查世界数据。"],
  rcon: ["RCON", "命令控制台与计划任务", "执行实时命令、维护模板并管理定时任务。"],
  backups: ["备份", "存档保护与恢复", "创建、下载、恢复或清理服务器备份。"],
  settings: ["服务器参数", "PalWorldSettings.ini", "调整服务器规则、倍率、端口和管理接口。"],
  deploy: ["部署维护", "安装、更新与危险操作", "在 AMD64 或 ARM64 主机上一键部署和维护服务端。"],
  automation: ["自动化与 Agent", "计划任务和分离部署", "管理自动备份、广播，以及远程 Agent 连接。"]
};

function authHeaders(json = true) {
  const result = {};
  if (json) result["content-type"] = "application/json";
  if (state.token) result.authorization = `Bearer ${state.token}`;
  return result;
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

async function publicApi(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return readJsonResponse(response);
}

async function api(path, options = {}, allowRetry = true) {
  const response = await fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });
  if (response.status === 401 && allowRetry) {
    state.token = "";
    localStorage.removeItem("pal-panel-token");
    await openLogin();
    return api(path, options, false);
  }
  return readJsonResponse(response);
}

async function apiBlob(path, allowRetry = true) {
  const response = await fetch(path, { headers: authHeaders(false) });
  if (response.status === 401 && allowRetry) {
    state.token = "";
    localStorage.removeItem("pal-panel-token");
    await openLogin();
    return apiBlob(path, false);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "下载失败");
  }
  return response.blob();
}

function saveToken(token) {
  state.token = token;
  localStorage.setItem("pal-panel-token", token);
}

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openLogin() {
  if (!state.loginPromise) {
    state.loginPromise = new Promise((resolve) => {
      state.loginResolve = resolve;
      if (!loginDialog.open) loginDialog.showModal();
    });
  }
  return state.loginPromise;
}

function openInit() {
  if (!state.initPromise) {
    state.initPromise = new Promise((resolve) => {
      state.initResolve = resolve;
      if (!initDialog.open) initDialog.showModal();
    });
  }
  return state.initPromise;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function text(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "-";
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days} 天 ${hours} 小时`;
  if (hours) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

function formatDateTime(value, fallback = "-") {
  if (!value) return fallback;
  const numeric = Number(value);
  const normalized = Number.isFinite(numeric) && numeric > 0
    ? (numeric < 1e12 ? numeric * 1000 : numeric)
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

function initials(value) {
  const name = text(value, "P").trim();
  return escapeHtml(name.slice(0, 1).toUpperCase());
}

function refreshIcons() {
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function showToast(message, type = "success") {
  const region = document.querySelector("#toastRegion");
  if (!region || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function setStatus(running) {
  statusPill.textContent = running ? "运行中" : "已停止";
  document.querySelector("#headerServerState").textContent = running ? "服务器运行中" : "服务器已停止";
  document.querySelector("#overviewState").textContent = running ? "运行中" : "已停止";
  document.querySelectorAll(".status-dot").forEach((dot) => {
    dot.classList.toggle("online", running);
    dot.classList.toggle("offline", !running);
  });
  document.querySelector("#overviewState").classList.toggle("online", running);
  document.querySelector("#overviewState").classList.toggle("offline", !running);
}

function renderSettingsForm() {
  settingsForm.innerHTML = settingGroups
    .map((group) => `<section class="settings-group"><h3 class="settings-group-title">${escapeHtml(group.title)}</h3>${group.fields.map(([name, label, type]) => {
      if (type === "checkbox") return `<label class="toggle"><input name="${name}" type="checkbox" /><span>${label}</span></label>`;
      return `<label><span>${label}</span><input name="${name}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} /></label>`;
    }).join("")}</section>`)
    .join("");
}

function fillForm(form, values) {
  [...form.elements].forEach((field) => {
    if (!field.name) return;
    const value = values[field.name];
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });
}

function readForm(form) {
  const values = {};
  [...form.elements].forEach((field) => {
    if (!field.name) return;
    if (field.type === "checkbox") values[field.name] = field.checked;
    else if (field.type === "number") values[field.name] = Number(field.value);
    else values[field.name] = field.value;
  });
  return values;
}

async function refresh() {
  statusPill.textContent = "读取中";
  const data = await api("/api/status");
  state.config = data.config;
  setStatus(data.status.running);
  const serverName = data.config.settings.ServerName || "Palworld Server";
  const description = data.config.settings.ServerDescription || "Palworld 专用服务器";
  const publicPort = data.config.server.publicPort || data.config.settings.PublicPort;
  document.querySelector("#sidebarServerName").textContent = serverName;
  document.querySelector("#overviewServerName").textContent = serverName;
  document.querySelector("#overviewDescription").textContent = description;
  document.querySelector("#overviewEndpoint").textContent = `${location.hostname}:${publicPort}`;
  document.querySelector("#manager").textContent = data.status.manager;
  document.querySelector("#publicPort").textContent = publicPort;
  document.querySelector("#arch").textContent = `${data.host.platform} / ${data.host.arch}`;
  document.querySelector("#memory").textContent = `${formatBytes(data.host.freeMemory)} / ${formatBytes(data.host.totalMemory)}`;
  fillForm(settingsForm, data.config.settings);
  fillForm(automationForm, data.config.automation || {});
}

async function runAction(action) {
  actionLog.textContent = `正在执行：${action}`;
  const data = await api("/api/action", { method: "POST", body: JSON.stringify({ action }) });
  const result = data.result || {};
  actionLog.textContent = [result.stdout, result.stderr, result.backup ? `备份文件：${result.backup}` : ""].filter(Boolean).join("\n") || "操作完成";
  showToast({ start: "服务器已启动", restart: "服务器已重启", stop: "服务器已停止", update: "服务端更新完成", backup: "备份已创建" }[action] || "操作完成");
  await refresh();
  if (action === "backup") await loadBackups();
}

function renderOverviewPlayers() {
  const box = document.querySelector("#overviewPlayers");
  const players = state.onlinePlayers || [];
  if (!players.length) {
    box.innerHTML = '<div class="empty">当前没有玩家在线</div>';
    return;
  }
  box.innerHTML = players.slice(0, 6).map((player) => {
    const name = player.name || player.playerName || player.accountName || "Player";
    const id = player.playerId || player.player_uid || player.userId || player.steamId || "-";
    return `<div class="compact-player"><span class="entity-avatar online">${initials(name)}</span><div class="compact-player-info"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(id)}</span></div><span class="presence-badge online">在线</span></div>`;
  }).join("");
}

function renderLiveMetrics() {
  const live = state.live || {};
  const metrics = live.metrics?.data || {};
  const info = live.info?.data || {};
  const online = Number(metrics.currentplayernum ?? state.onlinePlayers.length ?? 0);
  const max = Number(metrics.maxplayernum ?? 0);
  document.querySelector("#metricOnline").textContent = `${online} / ${max || "-"}`;
  document.querySelector("#navOnlineCount").textContent = String(online);
  document.querySelector("#metricFps").textContent = Number.isFinite(Number(metrics.serverfps)) ? Number(metrics.serverfps).toFixed(0) : "-";
  document.querySelector("#metricFrameTime").textContent = Number.isFinite(Number(metrics.serverframetime)) ? `${Number(metrics.serverframetime).toFixed(1)} ms 帧时间` : "等待 REST API";
  document.querySelector("#metricDays").textContent = Number.isFinite(Number(metrics.days)) ? `第 ${Number(metrics.days)} 天` : "-";
  document.querySelector("#overviewUptime").textContent = formatDuration(metrics.uptime);
  document.querySelector("#overviewVersion").textContent = info.version || "-";
  document.querySelector("#sidebarVersion").textContent = info.version || "版本未知";
  if (info.servername) {
    document.querySelector("#sidebarServerName").textContent = info.servername;
    document.querySelector("#overviewServerName").textContent = info.servername;
  }
  if (info.description) document.querySelector("#overviewDescription").textContent = info.description;
}

async function loadLive() {
  const data = await api("/api/live");
  state.live = data.live || {};
  document.querySelector("#liveOutput").textContent = JSON.stringify(data.live, null, 2);
  const players = data.live.players && data.live.players.data;
  state.onlinePlayers = Array.isArray(players) ? players : players?.players || [];
  renderOverviewPlayers();
  renderLiveMetrics();
  renderPlayers();
  refreshIcons();
}

async function loadDeployPlan() {
  const data = await api("/api/deploy/plan");
  const profile = data.profile || {};
  document.querySelector("#deployPlatform").textContent = profile.platform || "-";
  document.querySelector("#deployArch").textContent = profile.arch || "-";
  document.querySelector("#deployRunner").textContent = profile.runner || "-";
  document.querySelector("#deploySupported").textContent = profile.supported ? "支持" : (profile.inContainer ? "Docker 面板需连接远程 Agent" : "当前只支持 Linux");
  fillForm(deployForm, data.defaults || {});
  document.querySelector("#deployLog").textContent = profile.supported
    ? "可以部署。本机 AMD 会原生运行，ARM 会自动安装 box64。"
    : (profile.inContainer
      ? "当前面板在 Docker 中运行。请在游戏服务器安装 Agent，并在自动化页面启用远程 Agent。"
      : "当前机器不是 Linux，可通过远程 Agent 管理 Linux 游戏服务器。");
}

async function deployServer() {
  const deployLog = document.querySelector("#deployLog");
  deployLog.textContent = "正在部署，这一步可能需要 10-30 分钟...";
  const data = await api("/api/deploy/server", {
    method: "POST",
    body: JSON.stringify(readForm(deployForm))
  });
  const result = data.result || {};
  deployLog.textContent = [result.stdout, result.stderr].filter(Boolean).join("\n") || "部署完成";
  await refresh();
}

async function runServerMaintenance(operation, button) {
  const messages = {
    "reset-world": "重开服会先停止服务器并备份当前存档，然后清空世界存档并启动新世界。确定继续？",
    uninstall: "卸载会先停止服务器并备份存档，然后删除游戏服务和服务端文件。面板与备份会保留。确定继续？"
  };
  if (!confirm(messages[operation])) return;

  const route = operation === "reset-world" ? "/api/server/reset-world" : "/api/server/uninstall";
  const deployLog = document.querySelector("#deployLog");
  button.disabled = true;
  deployLog.textContent = operation === "reset-world" ? "正在备份并创建新世界..." : "正在备份并卸载服务端...";
  try {
    const data = await api(route, { method: "POST", body: "{}" });
    const result = data.result || {};
    deployLog.textContent = [
      result.stdout,
      result.stderr,
      result.backup ? `备份文件：${result.backup}` : "",
      result.removed ? `已删除：${result.removed}` : "",
      result.resetPath ? `已重置：${result.resetPath}` : ""
    ].filter(Boolean).join("\n") || "操作完成";
    await refresh();
  } finally {
    button.disabled = false;
  }
}

function playerIdentifiers(player) {
  return [player?.player_uid, player?.playerId, player?.playerid, player?.userId, player?.steamId, player?.accountName]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => String(value).toLowerCase());
}

function renderPlayerProfile(player, index, online = false) {
  const title = document.querySelector("#playerProfileTitle");
  const presence = document.querySelector("#playerProfilePresence");
  const content = document.querySelector("#playerProfileContent");
  if (!player) {
    state.selectedPlayerIndex = null;
    title.textContent = "选择玩家查看详情";
    presence.textContent = "未选择";
    presence.classList.remove("online");
    content.innerHTML = '<div class="empty">从左侧玩家列表选择一名玩家。</div>';
    return;
  }
  state.selectedPlayerIndex = Number(index);
  const name = player.nickname || player.name || player.playerName || "Player";
  const id = player.player_uid || player.playerId || player.steamId || player.userId || "-";
  const guild = (state.saveData?.guilds || []).find((item) => (item.players || []).some((member) => playerIdentifiers(member).some((memberId) => playerIdentifiers(player).includes(memberId))));
  title.textContent = name;
  presence.textContent = online ? "在线" : "离线";
  presence.classList.toggle("online", online);
  content.innerHTML = `<div class="player-profile-head"><span class="entity-avatar ${online ? "online" : ""}">${initials(name)}</span><div><h3>${escapeHtml(name)}</h3><p>UID ${escapeHtml(text(id))}${guild ? ` · ${escapeHtml(text(guild.name, "未命名公会"))}` : ""}</p></div></div>
    <div class="profile-stat-grid">
      <div><span>等级</span><strong>Lv.${escapeHtml(text(player.level, 0))}</strong></div>
      <div><span>经验</span><strong>${escapeHtml(text(player.exp, 0))}</strong></div>
      <div><span>生命</span><strong>${escapeHtml(player.max_hp ? `${text(player.hp, 0)} / ${text(player.max_hp, 0)}` : text(player.hp, 0))}</strong></div>
      <div><span>护盾</span><strong>${escapeHtml(player.shield_max_hp ? `${text(player.shield_hp, 0)} / ${text(player.shield_max_hp, 0)}` : text(player.shield_hp, 0))}</strong></div>
      <div><span>饱食度</span><strong>${escapeHtml(text(player.full_stomach, 0))}</strong></div>
      <div><span>帕鲁数量</span><strong>${Array.isArray(player.pals) ? player.pals.length : 0}</strong></div>
      <div><span>物品容器</span><strong>${player.items && typeof player.items === "object" ? Object.keys(player.items).length : 0}</strong></div>
      <div><span>最后在线</span><strong>${escapeHtml(formatDateTime(player.save_last_online, "未知"))}</strong></div>
    </div>
    <div class="profile-footer"><span>${online ? "玩家当前正在服务器中" : "历史数据来自最近一次存档解析"}</span><button class="secondary" data-save-detail="player" data-detail-id="${escapeHtml(id)}" data-detail-index="${Number(index)}"><i data-lucide="panel-right-open"></i><span>完整档案</span></button></div>`;
  document.querySelector('#playerActionForm [name="playerId"]').value = id;
  refreshIcons();
}

function renderPlayers() {
  const box = document.querySelector("#playersList");
  const savedPlayers = Array.isArray(state.saveData?.players) ? state.saveData.players : [];
  const onlinePlayers = state.onlinePlayers || [];
  const onlineIds = new Set(onlinePlayers.flatMap(playerIdentifiers));
  const savedIds = new Set(savedPlayers.flatMap(playerIdentifiers));
  const combined = [
    ...savedPlayers.map((player, index) => ({ ...player, _savedIndex: index, _online: playerIdentifiers(player).some((id) => onlineIds.has(id)) })),
    ...onlinePlayers.filter((player) => !playerIdentifiers(player).some((id) => savedIds.has(id))).map((player) => ({ ...player, _savedIndex: -1, _online: true }))
  ];
  const query = document.querySelector("#playerSearch")?.value.trim().toLowerCase() || "";
  const filter = document.querySelector("#playerStatusFilter")?.value || "all";
  const players = combined.filter((player) => {
    const haystack = [player.nickname, player.name, player.playerName, ...playerIdentifiers(player)].filter(Boolean).join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (filter === "all" || (filter === "online") === player._online);
  });
  document.querySelector("#playerCountLabel").textContent = `${players.length} 名玩家`;
  if (!players.length) {
    box.innerHTML = '<div class="empty">没有符合条件的玩家。在线数据来自 REST API，历史档案来自存档解析器。</div>';
    return;
  }
  box.innerHTML = players
    .map((player) => {
      const name = player.nickname || player.name || player.playerName || "Player";
      const id = player.player_uid || player.playerId || player.steamId || player.userId || "-";
      const level = player.level !== undefined ? `<span class="level-badge">Lv.${escapeHtml(player.level)}</span>` : "";
      const detail = player._savedIndex >= 0
        ? `<button class="secondary" data-preview-player="${player._savedIndex}">查看</button>`
        : `<button class="secondary" data-select-player="${escapeHtml(id)}">选择</button>`;
      return `<div class="entity-row"><span class="entity-avatar ${player._online ? "online" : ""}">${initials(name)}</span><div class="entity-main"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(id)} · ${player._online ? "当前在线" : `最后在线 ${escapeHtml(formatDateTime(player.save_last_online, "未知"))}`}</span></div>${level}<span class="presence-badge ${player._online ? "online" : ""}">${player._online ? "在线" : "离线"}</span>${detail}</div>`;
    })
    .join("");
  if (savedPlayers.length) {
    const selectedIndex = Number.isInteger(state.selectedPlayerIndex) && savedPlayers[state.selectedPlayerIndex] ? state.selectedPlayerIndex : 0;
    const selected = savedPlayers[selectedIndex];
    renderPlayerProfile(selected, selectedIndex, playerIdentifiers(selected).some((id) => onlineIds.has(id)));
  } else {
    renderPlayerProfile(null);
  }
  refreshIcons();
}

async function loadBackups() {
  const data = await api("/api/backups");
  state.backups = data.backups || [];
  const box = document.querySelector("#backupList");
  document.querySelector("#metricBackups").textContent = String(state.backups.length);
  document.querySelector("#backupSummary").textContent = state.backups.length ? `当前共有 ${state.backups.length} 个备份。` : "保护当前世界并支持随时下载或恢复。";
  if (!state.backups.length) {
    document.querySelector("#metricLatestBackup").textContent = "暂无备份";
    box.innerHTML = '<div class="empty">还没有备份。创建第一份备份后，可在这里下载或恢复。</div>';
    return;
  }
  document.querySelector("#metricLatestBackup").textContent = formatDateTime(state.backups[0].mtime);
  box.innerHTML = state.backups
    .map((backup) => `<div class="backup-row"><div><strong>${escapeHtml(backup.name)}</strong><span>存档压缩包</span></div><span>${formatDateTime(backup.mtime)} · ${(Number(backup.size || 0) / 1024 / 1024).toFixed(1)} MB</span><button class="secondary" data-download="${escapeHtml(backup.name)}"><i data-lucide="download"></i><span>下载</span></button><button class="secondary" data-restore="${escapeHtml(backup.name)}"><i data-lucide="history"></i><span>恢复</span></button><button class="danger-ghost" data-delete="${escapeHtml(backup.name)}"><i data-lucide="trash-2"></i><span>删除</span></button></div>`)
    .join("");
  refreshIcons();
}

async function downloadBackup(name) {
  const blob = await apiBlob(`/api/backup/download/${encodeURIComponent(name)}`);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function sendRcon(command) {
  const data = await api("/api/rcon", { method: "POST", body: JSON.stringify({ command }) });
  document.querySelector("#rconOutput").textContent = data.result.stdout || data.result.stderr || "完成";
}

function renderRconTemplates() {
  const box = document.querySelector("#rconTemplateList");
  if (!state.rconTemplates.length) {
    box.innerHTML = '<div class="empty">暂无模板</div>';
    return;
  }
  box.innerHTML = state.rconTemplates.map((template) => `
    <div class="editable-row" data-template-row data-id="${escapeHtml(template.id)}">
      <input class="template-name" value="${escapeHtml(template.name)}" aria-label="模板名称" />
      <input class="template-command" value="${escapeHtml(template.command)}" aria-label="RCON 命令" />
      <button class="secondary" data-use-template="${escapeHtml(template.id)}"><i data-lucide="corner-down-left"></i><span>使用</span></button>
      <button class="danger-ghost" data-delete-template="${escapeHtml(template.id)}"><i data-lucide="trash-2"></i><span>删除</span></button>
    </div>`).join("");
  refreshIcons();
}

async function loadRconTemplates() {
  const data = await api("/api/rcon/templates");
  state.rconTemplates = data.templates || [];
  renderRconTemplates();
}

async function saveRconTemplates() {
  const templates = [...document.querySelectorAll("[data-template-row]")].map((row) => ({
    id: row.dataset.id || newId(),
    name: row.querySelector(".template-name").value.trim(),
    command: row.querySelector(".template-command").value.trim()
  })).filter((template) => template.name && template.command);
  const data = await api("/api/rcon/templates", { method: "PUT", body: JSON.stringify({ templates }) });
  state.rconTemplates = data.templates;
  renderRconTemplates();
  document.querySelector("#rconOutput").textContent = "命令模板已保存。";
}

function renderRconTasks() {
  const box = document.querySelector("#rconTaskList");
  if (!state.rconTasks.length) {
    box.innerHTML = '<div class="empty">暂无定时任务</div>';
    return;
  }
  box.innerHTML = state.rconTasks.map((task) => `
    <div class="task-row">
      <div><strong>${escapeHtml(task.name)}</strong><span>${escapeHtml(task.command)} · 每 ${Number(task.intervalMinutes)} 分钟 · ${task.enabled ? "已启用" : "已停用"}</span></div>
      <div class="inline-actions">
        <button data-run-task="${escapeHtml(task.id)}"><i data-lucide="play"></i><span>运行</span></button>
        <button class="secondary" data-edit-task="${escapeHtml(task.id)}"><i data-lucide="pencil"></i><span>编辑</span></button>
        <button class="danger-ghost" data-delete-task="${escapeHtml(task.id)}"><i data-lucide="trash-2"></i><span>删除</span></button>
      </div>
    </div>`).join("");
  refreshIcons();
}

async function loadRconTasks() {
  const data = await api("/api/rcon/tasks");
  state.rconTasks = data.tasks || [];
  renderRconTasks();
}

function openRconTask(task = {}) {
  fillForm(document.querySelector("#rconTaskForm"), {
    id: task.id || "",
    name: task.name || "",
    command: task.command || "",
    intervalMinutes: task.intervalMinutes || 60,
    enabled: Boolean(task.enabled)
  });
  rconTaskDialog.showModal();
}

function renderSimpleList(selector, rows, emptyText, render) {
  const box = document.querySelector(selector);
  if (!rows.length) {
    box.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }
  box.innerHTML = rows.slice(0, 80).map(render).join("");
}

function entityId(type, row) {
  const candidates = type === "player"
    ? [row.player_uid, row.id]
    : type === "guild"
      ? [row.id, row.admin_player_uid]
      : [row.instance_id, row.id];
  return candidates.find((value) => typeof value === "string" || typeof value === "number");
}

function detailButton(type, row) {
  const id = entityId(type, row);
  const index = (state.saveData?.[`${type}s`] || []).indexOf(row);
  return `<button class="secondary" data-save-detail="${type}" data-detail-id="${escapeHtml(id ?? "")}" data-detail-index="${index}"><i data-lucide="panel-right-open"></i><span>详情</span></button>`;
}

function renderSaveData(data) {
  state.saveData = data || {};
  const players = Array.isArray(state.saveData.players) ? state.saveData.players : [];
  const guilds = Array.isArray(state.saveData.guilds) ? state.saveData.guilds : [];
  const pals = Array.isArray(state.saveData.pals) ? state.saveData.pals : [];
  const inventory = Array.isArray(state.saveData.inventory) ? state.saveData.inventory : [];
  const query = document.querySelector("#saveSearch")?.value.trim().toLowerCase() || "";
  const includesQuery = (...values) => !query || values.filter(Boolean).join(" ").toLowerCase().includes(query);

  document.querySelector("#savePlayersCount").textContent = players.length;
  document.querySelector("#saveGuildsCount").textContent = guilds.length;
  document.querySelector("#savePalsCount").textContent = pals.length;
  document.querySelector("#saveItemsCount").textContent = inventory.length;
  document.querySelector("#metricKnownPlayers").textContent = `${players.length} 名已记录玩家`;

  renderSimpleList("#savePlayersList", players.filter((player) => includesQuery(player.nickname, player.name, player.player_uid)), "没有符合条件的玩家数据", (player) =>
    `<div class="data-row"><strong>${escapeHtml(text(player.nickname || player.name, "未命名玩家"))}</strong><span>Lv.${escapeHtml(text(player.level, 0))} · ${escapeHtml(formatDateTime(player.save_last_online, "最后在线未知"))}</span><span>${escapeHtml(text(player.player_uid))}</span>${detailButton("player", player)}</div>`
  );
  renderSimpleList("#saveGuildsList", guilds.filter((guild) => includesQuery(guild.name, guild.admin_player_uid, ...(guild.players || []).map((player) => player.nickname || player.player_uid))), "没有符合条件的公会数据", (guild) =>
    `<div class="data-row"><strong>${escapeHtml(text(guild.name, "未命名公会"))}</strong><span>${(guild.players || []).length} 名成员 · ${(guild.base_ids || []).length} 个据点</span><span>基地 Lv.${escapeHtml(text(guild.base_camp_level, 0))}</span>${detailButton("guild", guild)}</div>`
  );
  renderSimpleList("#savePalsList", pals.filter((pal) => includesQuery(pal.type, pal.name, pal.owner_name, pal.instance_id)), "当前解析器没有返回独立帕鲁数据", (pal) =>
    `<div class="data-row"><strong>${escapeHtml(text(pal.type || pal.name, "未知帕鲁"))}</strong><span>Lv.${escapeHtml(text(pal.level, 0))} · ${escapeHtml(text(pal.owner_name, "未知主人"))}</span><span>${escapeHtml(text(pal.instance_id || pal.id))}</span>${detailButton("pal", pal)}</div>`
  );
  renderSimpleList("#saveInventoryList", inventory.filter((item) => includesQuery(item.ItemId, item.item_id, item.static_id, item.owner_name)), "当前解析器没有返回独立物品条目", (item) =>
    `<div class="data-row"><strong>${escapeHtml(text(item.ItemId || item.item_id || item.static_id, "未知物品"))}</strong><span>数量 x${escapeHtml(text(item.StackCount || item.count, 1))}</span><span>${escapeHtml(text(item.owner_name, "未知主人"))}</span><span></span></div>`
  );
  renderPlayers();
  refreshIcons();
}

function detailMetrics(items) {
  return `<div class="detail-metrics">${items.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(summarizeValue(value))}</strong></div>`).join("")}</div>`;
}

function summarizeValue(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length ? entries.slice(0, 3).map(([key, item]) => `${key}: ${item}`).join(" · ") : fallback;
  }
  return String(value);
}

function rawDetails(data) {
  return `<details class="raw-details"><summary>查看原始 JSON</summary><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre></details>`;
}

function renderEntityDetail(type, data) {
  if (type === "player") {
    const name = data.nickname || data.name || "未命名玩家";
    const containers = data.items && typeof data.items === "object" ? Object.entries(data.items) : [];
    return `<div class="detail-hero"><span class="entity-avatar">${initials(name)}</span><div><h3>${escapeHtml(name)}</h3><p>UID ${escapeHtml(text(data.player_uid || data.id))} · 最后在线 ${escapeHtml(formatDateTime(data.save_last_online, "未知"))}</p></div></div>
      ${detailMetrics([["等级", data.level ?? 0], ["经验", data.exp ?? 0], ["生命", data.max_hp ? `${text(data.hp, 0)} / ${text(data.max_hp, 0)}` : data.hp ?? 0], ["护盾", data.shield_max_hp ? `${text(data.shield_hp, 0)} / ${text(data.shield_max_hp, 0)}` : data.shield_hp ?? 0], ["饱食度", data.full_stomach ?? 0], ["帕鲁数量", Array.isArray(data.pals) ? data.pals.length : 0], ["容器数量", containers.length], ["最后在线", formatDateTime(data.save_last_online, "未知")]])}
      ${data.status_point && typeof data.status_point === "object" ? `<section class="detail-section"><h3>属性加点</h3><div class="detail-member-list">${Object.entries(data.status_point).map(([label, value]) => `<div class="detail-member"><strong>${escapeHtml(label)}</strong><div>${escapeHtml(summarizeValue(value, "0"))}</div></div>`).join("")}</div></section>` : ""}
      <section class="detail-section"><h3>物品容器</h3><div class="detail-member-list">${containers.length ? containers.map(([label, value]) => `<div class="detail-member"><strong>${escapeHtml(label)}</strong><div>${escapeHtml(summarizeValue(value, "0 项"))}</div></div>`).join("") : '<div class="empty">没有容器数据</div>'}</div></section>
      ${rawDetails(data)}`;
  }
  if (type === "guild") {
    const name = data.name || "未命名公会";
    const members = Array.isArray(data.players) ? data.players : [];
    return `<div class="detail-hero"><span class="entity-avatar">${initials(name)}</span><div><h3>${escapeHtml(name)}</h3><p>会长 UID ${escapeHtml(text(data.admin_player_uid))}</p></div></div>
      ${detailMetrics([["基地等级", data.base_camp_level ?? 0], ["成员", members.length], ["据点", Array.isArray(data.base_ids) ? data.base_ids.length : 0], ["会长", data.admin_player_uid]])}
      <section class="detail-section"><h3>公会成员</h3><div class="detail-member-list">${members.length ? members.map((member) => `<div class="detail-member"><strong>${escapeHtml(text(member.nickname || member.name, "成员"))}</strong><div>${escapeHtml(text(member.player_uid || member.id))}</div></div>`).join("") : '<div class="empty">没有成员数据</div>'}</div></section>
      ${rawDetails(data)}`;
  }
  if (type === "pal") {
    const name = data.name || data.type || "未知帕鲁";
    return `<div class="detail-hero"><span class="entity-avatar">${initials(name)}</span><div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(text(data.owner_name, "未知主人"))}</p></div></div>
      ${detailMetrics([["等级", data.level ?? 0], ["生命", data.hp ?? data.max_hp], ["攻击", data.attack ?? data.melee], ["防御", data.defense], ["性别", data.gender], ["实例 ID", data.instance_id || data.id]])}
      ${rawDetails(data)}`;
  }
  return rawDetails(data);
}

async function showSaveDetail(type, id, index) {
  const plural = { player: "players", guild: "guilds", pal: "pals" }[type];
  const localData = state.saveData?.[plural]?.[Number(index)];
  let data = localData || {};
  if (id) {
    try {
      data = (await api(`/api/save-data/${type}/${encodeURIComponent(id)}`)).data;
    } catch (error) {
      if (!localData) throw error;
    }
  }
  document.querySelector("#detailTitle").textContent = { player: "玩家详情", guild: "公会详情", pal: "帕鲁详情" }[type] || "详情";
  document.querySelector("#detailOutput").innerHTML = renderEntityDetail(type, data);
  detailDialog.showModal();
  refreshIcons();
}

function toMapPosition(x, y) {
  const landscape = [349400, 724400, -1099400, -724400];
  return [
    -256 + (256 * (x - landscape[2])) / (landscape[0] - landscape[2]),
    (256 * (y - landscape[3])) / (landscape[1] - landscape[3])
  ];
}

function ensureMap() {
  const box = document.querySelector("#mapBox");
  if (state.map) return true;
  if (!window.L) {
    box.textContent = "地图组件加载失败，请检查服务器是否可以访问 jsDelivr。";
    return false;
  }
  box.innerHTML = "";
  box.classList.add("map-ready");
  state.map = L.map(box, {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: 6,
    zoomControl: true,
    attributionControl: false
  }).setView([-128, 128], 2);
  const bounds = L.latLngBounds([[-256, 0], [0, 256]]);
  L.tileLayer("https://media.githubusercontent.com/media/zaigie/palworld-server-tool/main/map/{z}/{x}/{y}.png", {
    minZoom: 0,
    maxZoom: 6,
    noWrap: true,
    bounds
  }).addTo(state.map);
  state.map.setMaxBounds(bounds.pad(0.12));
  state.markerLayer = L.layerGroup().addTo(state.map);
  return true;
}

async function loadMapMarkers() {
  const data = await api("/api/map/markers");
  if (!ensureMap()) return;
  state.markerLayer.clearLayers();
  const positions = [];
  (data.markers || []).forEach((marker) => {
    const position = toMapPosition(Number(marker.x), Number(marker.y));
    positions.push(position);
    const kind = marker.type === "base" ? "base" : "player";
    const icon = L.divIcon({
      className: `map-marker map-marker-${kind}`,
      html: `<span>${kind === "base" ? "B" : "P"}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
    L.marker(position, { icon, title: marker.label || kind })
      .bindPopup(`<strong>${escapeHtml(marker.label || kind)}</strong><br />X: ${Number(marker.x).toFixed(0)}<br />Y: ${Number(marker.y).toFixed(0)}`)
      .addTo(state.markerLayer);
  });
  if (positions.length) state.map.fitBounds(positions, { padding: [28, 28], maxZoom: 5 });
  setTimeout(() => state.map.invalidateSize(), 50);
}

async function loadAgent() {
  const data = await api("/api/agent/config");
  fillForm(agentForm, data.agent || {});
}

async function saveAgent(refreshAfter = true) {
  const agent = readForm(agentForm);
  await api("/api/agent/config", { method: "PUT", body: JSON.stringify({ agent }) });
  document.querySelector("#agentStatus").textContent = agent.enabled && agent.mode === "remote"
    ? "远程 Agent 配置已保存。"
    : "当前使用本机模式。";
  if (refreshAfter) await Promise.all([refresh(), loadDeployPlan()]);
}

async function testAgent() {
  await saveAgent(false);
  const data = await api("/api/agent/test", { method: "POST", body: "{}" });
  document.querySelector("#agentStatus").textContent = `连接成功：${data.agent.platform} / ${data.agent.arch}`;
}

async function loadWhitelist() {
  const data = await api("/api/whitelist");
  document.querySelector("#whitelistText").value = (data.players || []).join("\n");
}

async function loadSaveData(showFeedback = true) {
  const data = await api("/api/save-data");
  renderSaveData(data.data || {});
  document.querySelector("#saveOutput").textContent = JSON.stringify(data.data, null, 2);
  if (data.data?.message && !state.map) document.querySelector("#mapBox").textContent = data.data.message;
  if (showFeedback) showToast("存档解析完成");
  return data.data;
}

async function refreshAll() {
  const button = document.querySelector("#refreshBtn");
  button.disabled = true;
  try {
    await Promise.all([refresh(), loadLive(), loadBackups()]);
    if (state.activeTab === "saves" || state.activeTab === "players") await loadSaveData(false);
    showToast("面板数据已刷新");
  } finally {
    button.disabled = false;
  }
}

function reportError(error) {
  const message = error.message || String(error);
  actionLog.textContent = message;
  showToast(message, "error");
  console.error(error);
}

function switchView(tabName) {
  if (!pageMetadata[tabName]) return;
  state.activeTab = tabName;
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === tabName));
  document.querySelectorAll(".tab[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
  document.querySelector("#mobileMoreBtn").classList.toggle("active", ["backups", "settings", "deploy", "automation"].includes(tabName));
  const [eyebrow, title, subtitle] = pageMetadata[tabName];
  document.querySelector("#pageEyebrow").textContent = eyebrow;
  document.querySelector("#pageTitle").textContent = title;
  document.querySelector("#pageSubtitle").textContent = subtitle;
  const mobileDialog = document.querySelector("#mobileMoreDialog");
  if (mobileDialog.open) mobileDialog.close();
  if (tabName === "saves" && state.map) setTimeout(() => state.map.invalidateSize(), 50);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".tab[data-tab]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.tab));
});

document.body.addEventListener("click", async (event) => {
  try {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) await runAction(actionButton.dataset.action);

    const playerButton = event.target.closest("[data-player-action]");
    if (playerButton) {
      const body = readForm(document.querySelector("#playerActionForm"));
      body.action = playerButton.dataset.playerAction;
      const confirmations = {
        kick: "确定要将该玩家踢出服务器？",
        ban: "确定要封禁该玩家？封禁后需要通过 RCON 手动解除。",
        shutdown: `确定在 ${Number(body.seconds || 30)} 秒后关闭服务器？所有在线玩家会收到广播。`
      };
      if (confirmations[body.action] && !confirm(confirmations[body.action])) return;
      playerButton.disabled = true;
      try {
        const data = await api("/api/player", { method: "POST", body: JSON.stringify(body) });
        actionLog.textContent = data.result.stdout || data.result.stderr || "完成";
        showToast({ kick: "玩家已踢出", ban: "玩家已封禁", broadcast: "广播已发送", save: "世界已保存", shutdown: "关服任务已提交" }[body.action] || "操作完成");
      } finally {
        playerButton.disabled = false;
      }
    }

    const previewPlayer = event.target.closest("[data-preview-player]");
    if (previewPlayer) {
      const index = Number(previewPlayer.dataset.previewPlayer);
      const player = state.saveData?.players?.[index];
      const onlineIds = new Set((state.onlinePlayers || []).flatMap(playerIdentifiers));
      if (player) renderPlayerProfile(player, index, playerIdentifiers(player).some((id) => onlineIds.has(id)));
    }

    const selectPlayer = event.target.closest("[data-select-player]");
    if (selectPlayer) {
      document.querySelector('#playerActionForm [name="playerId"]').value = selectPlayer.dataset.selectPlayer;
      showToast("已选择玩家");
    }

    const download = event.target.closest("[data-download]");
    if (download) await downloadBackup(download.dataset.download);

    const restore = event.target.closest("[data-restore]");
    if (restore && confirm("恢复备份会停止服务器并覆盖当前存档，确定继续？")) {
      await api("/api/backup/restore", { method: "POST", body: JSON.stringify({ name: restore.dataset.restore }) });
      await loadBackups();
    }

    const del = event.target.closest("[data-delete]");
    if (del && confirm("确定删除这个备份？")) {
      await api("/api/backup/delete", { method: "POST", body: JSON.stringify({ name: del.dataset.delete }) });
      await loadBackups();
    }

    const useTemplate = event.target.closest("[data-use-template]");
    if (useTemplate) {
      const template = state.rconTemplates.find((item) => item.id === useTemplate.dataset.useTemplate);
      if (template) document.querySelector("#rconCommand").value = template.command;
    }

    const deleteTemplate = event.target.closest("[data-delete-template]");
    if (deleteTemplate) {
      state.rconTemplates = state.rconTemplates.filter((item) => item.id !== deleteTemplate.dataset.deleteTemplate);
      renderRconTemplates();
    }

    const runTask = event.target.closest("[data-run-task]");
    if (runTask) {
      const data = await api("/api/rcon/tasks/run", { method: "POST", body: JSON.stringify({ id: runTask.dataset.runTask }) });
      document.querySelector("#rconOutput").textContent = data.result.stdout || data.result.stderr || "任务执行完成";
    }

    const editTask = event.target.closest("[data-edit-task]");
    if (editTask) openRconTask(state.rconTasks.find((task) => task.id === editTask.dataset.editTask));

    const deleteTask = event.target.closest("[data-delete-task]");
    if (deleteTask && confirm("确定删除这个定时任务？")) {
      const data = await api(`/api/rcon/tasks/${encodeURIComponent(deleteTask.dataset.deleteTask)}`, { method: "DELETE" });
      state.rconTasks = data.tasks;
      renderRconTasks();
    }

    const detail = event.target.closest("[data-save-detail]");
    if (detail) {
      if (detail.dataset.saveDetail === "player" && detail.dataset.detailId) {
        document.querySelector('#playerActionForm [name="playerId"]').value = detail.dataset.detailId;
      }
      await showSaveDetail(detail.dataset.saveDetail, detail.dataset.detailId, detail.dataset.detailIndex);
    }
  } catch (error) {
    reportError(error);
  }
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = document.querySelector("#loginError");
  errorBox.textContent = "";
  try {
    const data = await publicApi("/api/login", readForm(event.currentTarget));
    saveToken(data.token);
    loginDialog.close();
    state.loginResolve?.();
    state.loginPromise = null;
    state.loginResolve = null;
  } catch (error) {
    errorBox.textContent = error.message;
  }
});

document.querySelector("#initForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = document.querySelector("#initError");
  errorBox.textContent = "";
  try {
    const data = await publicApi("/api/auth/init", readForm(event.currentTarget));
    saveToken(data.token);
    initDialog.close();
    state.initResolve?.();
    state.initPromise = null;
    state.initResolve = null;
  } catch (error) {
    errorBox.textContent = error.message;
  }
});

document.querySelector("#rconTaskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/rcon/tasks", { method: "POST", body: JSON.stringify(readForm(event.currentTarget)) });
    state.rconTasks = data.tasks;
    renderRconTasks();
    rconTaskDialog.close();
  } catch (error) {
    reportError(error);
  }
});

document.querySelector("#refreshBtn").addEventListener("click", () => refreshAll().catch(reportError));
document.querySelector("#loadLiveBtn").addEventListener("click", () => loadLive().catch(reportError));
document.querySelector("#loadDeployPlanBtn").addEventListener("click", () => loadDeployPlan().catch(reportError));
document.querySelector("#deployServerBtn").addEventListener("click", () => deployServer().catch(reportError));
document.querySelector("#resetWorldBtn").addEventListener("click", (event) => runServerMaintenance("reset-world", event.currentTarget).catch(reportError));
document.querySelector("#uninstallServerBtn").addEventListener("click", (event) => runServerMaintenance("uninstall", event.currentTarget).catch(reportError));
document.querySelector("#reloadPlayersBtn").addEventListener("click", () => loadLive().catch(reportError));
document.querySelector("#reloadBackupsBtn").addEventListener("click", () => loadBackups().catch(reportError));
document.querySelector("#sendRconBtn").addEventListener("click", () => sendRcon(document.querySelector("#rconCommand").value).catch(reportError));
document.querySelector("#saveRconTemplatesBtn").addEventListener("click", () => saveRconTemplates().catch(reportError));
document.querySelector("#addRconTemplateBtn").addEventListener("click", () => {
  state.rconTemplates.push({ id: newId(), name: "新模板", command: "ShowPlayers" });
  renderRconTemplates();
});
document.querySelector("#addRconTaskBtn").addEventListener("click", () => openRconTask());
document.querySelector("#cancelRconTaskBtn").addEventListener("click", () => rconTaskDialog.close());
document.querySelector("#closeDetailBtn").addEventListener("click", () => detailDialog.close());
document.querySelector("#loadMapMarkersBtn").addEventListener("click", () => loadMapMarkers().catch(reportError));
document.querySelector("#saveAgentBtn").addEventListener("click", () => saveAgent().catch(reportError));
document.querySelector("#testAgentBtn").addEventListener("click", () => testAgent().catch(reportError));
document.querySelector("#playerSearch").addEventListener("input", renderPlayers);
document.querySelector("#playerStatusFilter").addEventListener("change", renderPlayers);
document.querySelector("#saveSearch").addEventListener("input", () => state.saveData && renderSaveData(state.saveData));
document.querySelectorAll("[data-save-section]").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeSaveSection = button.dataset.saveSection;
    document.querySelectorAll("[data-save-section]").forEach((item) => item.classList.toggle("active", item.dataset.saveSection === state.activeSaveSection));
    document.querySelectorAll("[data-save-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.savePanel === state.activeSaveSection));
    if (state.activeSaveSection === "map" && state.map) setTimeout(() => state.map.invalidateSize(), 50);
  });
});
document.querySelector("#mobileMoreBtn").addEventListener("click", () => document.querySelector("#mobileMoreDialog").showModal());
document.querySelector("#closeMobileMoreBtn").addEventListener("click", () => document.querySelector("#mobileMoreDialog").close());

document.querySelector("#saveSettingsBtn").addEventListener("click", async () => {
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ settings: readForm(settingsForm) }) });
    actionLog.textContent = "参数已写入，重启服务器后生效。";
    await refresh();
  } catch (error) {
    reportError(error);
  }
});

document.querySelector("#saveAutomationBtn").addEventListener("click", async () => {
  try {
    await api("/api/config", { method: "PUT", body: JSON.stringify({ automation: readForm(automationForm) }) });
    actionLog.textContent = "自动任务已保存。";
    await refresh();
  } catch (error) {
    reportError(error);
  }
});

document.querySelector("#saveWhitelistBtn").addEventListener("click", async () => {
  try {
    const players = document.querySelector("#whitelistText").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    await api("/api/whitelist", { method: "PUT", body: JSON.stringify({ players }) });
    actionLog.textContent = "白名单记录已保存。";
  } catch (error) {
    reportError(error);
  }
});

document.querySelector("#loadSaveBtn").addEventListener("click", () => loadSaveData().catch(reportError));

[rconTaskDialog, detailDialog, document.querySelector("#mobileMoreDialog")].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

[loginDialog, initDialog].forEach((dialog) => {
  dialog.addEventListener("cancel", (event) => event.preventDefault());
});

async function initialize() {
  refreshIcons();
  const authResponse = await fetch("/api/auth/status");
  const auth = await readJsonResponse(authResponse);
  if (!auth.initialized) await openInit();
  else if (!state.token) await openLogin();

  await Promise.all([
    refresh(),
    loadDeployPlan(),
    loadRconTemplates(),
    loadRconTasks(),
    loadAgent(),
    loadWhitelist()
  ]);
  const optionalLoads = await Promise.allSettled([loadLive(), loadBackups(), loadSaveData(false)]);
  optionalLoads.filter((result) => result.status === "rejected").forEach((result) => reportError(result.reason));
  refreshIcons();
}

renderSettingsForm();
refreshIcons();
initialize().catch((error) => {
  statusPill.textContent = "连接失败";
  statusPill.classList.add("offline");
  reportError(error);
});
