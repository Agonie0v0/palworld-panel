const state = {
  token: localStorage.getItem("pal-panel-token") || "",
  config: null,
  rconTemplates: [],
  rconTasks: [],
  saveData: null,
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

const settingFields = [
  ["ServerName", "服务器名称", "text"],
  ["ServerDescription", "服务器说明", "text"],
  ["AdminPassword", "管理员密码", "password"],
  ["ServerPassword", "加入密码", "password"],
  ["PublicPort", "公网端口", "number"],
  ["RCONPort", "RCON 端口", "number"],
  ["RESTAPIPort", "REST API 端口", "number"],
  ["Difficulty", "难度", "text"],
  ["ExpRate", "经验倍率", "number"],
  ["PalCaptureRate", "捕获倍率", "number"],
  ["DayTimeSpeedRate", "白天速度", "number"],
  ["NightTimeSpeedRate", "夜晚速度", "number"],
  ["DeathPenalty", "死亡惩罚", "text"],
  ["RCONEnabled", "启用 RCON", "checkbox"],
  ["RESTAPIEnabled", "启用 REST API", "checkbox"]
];

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

function setStatus(running) {
  statusPill.textContent = running ? "运行中" : "已停止";
  statusPill.classList.toggle("online", running);
  statusPill.classList.toggle("offline", !running);
}

function renderSettingsForm() {
  settingsForm.innerHTML = settingFields
    .map(([name, label, type]) => {
      if (type === "checkbox") {
        return `<label class="toggle"><input name="${name}" type="checkbox" /><span>${label}</span></label>`;
      }
      return `<label><span>${label}</span><input name="${name}" type="${type}" ${type === "number" ? 'step="0.1"' : ""} /></label>`;
    })
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
  document.querySelector("#manager").textContent = data.status.manager;
  document.querySelector("#publicPort").textContent = data.config.server.publicPort || data.config.settings.PublicPort;
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
  await refresh();
}

async function loadLive() {
  const data = await api("/api/live");
  document.querySelector("#liveOutput").textContent = JSON.stringify(data.live, null, 2);
  const players = data.live.players && data.live.players.data;
  renderPlayers(Array.isArray(players) ? players : players?.players || []);
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

function renderPlayers(players) {
  const box = document.querySelector("#playersList");
  if (!players.length) {
    box.innerHTML = '<div class="empty">暂无玩家数据，确认 REST API 已启用。</div>';
    return;
  }
  box.innerHTML = players
    .map((player) => `<div class="row"><strong>${escapeHtml(player.name || player.playerName || "Player")}</strong><span>${escapeHtml(player.playerId || player.steamId || player.userId || "-")}</span></div>`)
    .join("");
}

async function loadBackups() {
  const data = await api("/api/backups");
  const box = document.querySelector("#backupList");
  if (!data.backups.length) {
    box.innerHTML = '<div class="empty">还没有备份</div>';
    return;
  }
  box.innerHTML = data.backups
    .map((backup) => `<div class="row backup-row"><strong>${escapeHtml(backup.name)}</strong><span>${new Date(backup.mtime).toLocaleString()} · ${(Number(backup.size || 0) / 1024 / 1024).toFixed(1)} MB</span><button data-download="${escapeHtml(backup.name)}">下载</button><button data-restore="${escapeHtml(backup.name)}">恢复</button><button class="danger" data-delete="${escapeHtml(backup.name)}">删除</button></div>`)
    .join("");
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
      <button data-use-template="${escapeHtml(template.id)}">使用</button>
      <button class="danger" data-delete-template="${escapeHtml(template.id)}">删除</button>
    </div>`).join("");
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
        <button data-run-task="${escapeHtml(task.id)}">运行</button>
        <button data-edit-task="${escapeHtml(task.id)}">编辑</button>
        <button class="danger" data-delete-task="${escapeHtml(task.id)}">删除</button>
      </div>
    </div>`).join("");
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
  return `<button data-save-detail="${type}" data-detail-id="${escapeHtml(id ?? "")}" data-detail-index="${index}">详情</button>`;
}

function renderSaveData(data) {
  state.saveData = data;
  const players = Array.isArray(data.players) ? data.players : [];
  const guilds = Array.isArray(data.guilds) ? data.guilds : [];
  const pals = Array.isArray(data.pals) ? data.pals : [];
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];

  document.querySelector("#savePlayersCount").textContent = players.length;
  document.querySelector("#saveGuildsCount").textContent = guilds.length;
  document.querySelector("#savePalsCount").textContent = pals.length;
  document.querySelector("#saveItemsCount").textContent = inventory.length;

  renderSimpleList("#savePlayersList", players, "没有玩家数据", (player) =>
    `<div class="row"><strong>${escapeHtml(text(player.nickname || player.name, "玩家"))}</strong><span>Lv.${escapeHtml(text(player.level, 0))} / ${escapeHtml(text(player.player_uid))}</span>${detailButton("player", player)}</div>`
  );
  renderSimpleList("#saveGuildsList", guilds, "没有公会数据", (guild) =>
    `<div class="row"><strong>${escapeHtml(text(guild.name, "公会"))}</strong><span>基地 Lv.${escapeHtml(text(guild.base_camp_level, 0))} / 成员 ${(guild.players || []).length}</span>${detailButton("guild", guild)}</div>`
  );
  renderSimpleList("#savePalsList", pals, "没有帕鲁数据", (pal) =>
    `<div class="row"><strong>${escapeHtml(text(pal.type || pal.name, "帕鲁"))}</strong><span>Lv.${escapeHtml(text(pal.level, 0))} / ${escapeHtml(text(pal.owner_name, "未知主人"))}</span>${detailButton("pal", pal)}</div>`
  );
  renderSimpleList("#saveInventoryList", inventory, "没有背包数据", (item) =>
    `<div class="row"><strong>${escapeHtml(text(item.ItemId || item.item_id || item.static_id, "物品"))}</strong><span>x${escapeHtml(text(item.StackCount || item.count, 1))} / ${escapeHtml(text(item.owner_name, "未知主人"))}</span></div>`
  );
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
  document.querySelector("#detailOutput").textContent = JSON.stringify(data, null, 2);
  detailDialog.showModal();
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

function reportError(error) {
  actionLog.textContent = error.message || String(error);
  console.error(error);
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab,.view").forEach((element) => element.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}`).classList.add("active");
    if (button.dataset.tab === "saves" && state.map) setTimeout(() => state.map.invalidateSize(), 50);
  });
});

document.body.addEventListener("click", async (event) => {
  try {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) await runAction(actionButton.dataset.action);

    const playerButton = event.target.closest("[data-player-action]");
    if (playerButton) {
      const body = readForm(document.querySelector("#playerActionForm"));
      body.action = playerButton.dataset.playerAction;
      const data = await api("/api/player", { method: "POST", body: JSON.stringify(body) });
      actionLog.textContent = data.result.stdout || data.result.stderr || "完成";
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
    if (detail) await showSaveDetail(detail.dataset.saveDetail, detail.dataset.detailId, detail.dataset.detailIndex);
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

document.querySelector("#refreshBtn").addEventListener("click", () => refresh().catch(reportError));
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

document.querySelector("#loadSaveBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/save-data");
    renderSaveData(data.data);
    document.querySelector("#saveOutput").textContent = JSON.stringify(data.data, null, 2);
    if (data.data.message && !state.map) document.querySelector("#mapBox").textContent = data.data.message;
  } catch (error) {
    reportError(error);
  }
});

[rconTaskDialog, detailDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

[loginDialog, initDialog].forEach((dialog) => {
  dialog.addEventListener("cancel", (event) => event.preventDefault());
});

async function initialize() {
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
}

renderSettingsForm();
initialize().catch((error) => {
  statusPill.textContent = "连接失败";
  statusPill.classList.add("offline");
  reportError(error);
});
