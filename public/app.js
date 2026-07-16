const state = {
  token: localStorage.getItem("pal-panel-token") || "",
  config: null
};

const statusPill = document.querySelector("#statusPill");
const actionLog = document.querySelector("#actionLog");
const settingsForm = document.querySelector("#settingsForm");
const automationForm = document.querySelector("#automationForm");
const deployForm = document.querySelector("#deployForm");

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

function headers() {
  const base = { "content-type": "application/json" };
  if (state.token) base.authorization = `Bearer ${state.token}`;
  return base;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (response.status === 401) {
    const token = window.prompt("请输入面板访问令牌");
    if (token) {
      state.token = token;
      localStorage.setItem("pal-panel-token", token);
      return api(path, options);
    }
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
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
  document.querySelector("#deploySupported").textContent = profile.supported ? "支持" : (profile.inContainer ? "Docker 面板不支持宿主机 systemd 部署" : "当前只支持 Linux");
  fillForm(deployForm, data.defaults || {});
  document.querySelector("#deployLog").textContent = profile.supported
    ? "可以部署。本机 AMD 会原生运行，ARM 会自动安装 box64。"
    : (profile.inContainer
      ? "当前面板运行在 Docker 容器里，不能直接给宿主机安装 systemd 服务。请用 scripts/install-panel.sh 把面板装到宿主机，或管理已有 Palworld Docker 容器。"
      : "当前机器不是 Linux，只能用来开发或管理已有远程服务。");
}

async function deployServer() {
  const body = readForm(deployForm);
  const deployLog = document.querySelector("#deployLog");
  deployLog.textContent = "正在部署，这一步可能需要 10-30 分钟...";
  const data = await api("/api/deploy/server", {
    method: "POST",
    body: JSON.stringify(body)
  });
  const result = data.result || {};
  deployLog.textContent = [result.stdout, result.stderr].filter(Boolean).join("\n") || "部署完成";
  await refresh();
}

function renderPlayers(players) {
  const box = document.querySelector("#playersList");
  if (!players.length) {
    box.innerHTML = '<div class="empty">暂无玩家数据，确认 REST API 已启用。</div>';
    return;
  }
  box.innerHTML = players
    .map((player) => `<div class="row"><strong>${player.name || player.playerName || "Player"}</strong><span>${player.playerId || player.steamId || player.userId || "-"}</span></div>`)
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
    .map((backup) => `<div class="row"><strong>${backup.name}</strong><span>${new Date(backup.mtime).toLocaleString()}</span><button data-restore="${backup.name}">恢复</button><button class="danger" data-delete="${backup.name}">删除</button></div>`)
    .join("");
}

async function sendRcon(command) {
  const data = await api("/api/rcon", { method: "POST", body: JSON.stringify({ command }) });
  document.querySelector("#rconOutput").textContent = data.result.stdout || data.result.stderr || "完成";
}

function text(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function renderSimpleList(selector, rows, emptyText, render) {
  const box = document.querySelector(selector);
  if (!rows.length) {
    box.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }
  box.innerHTML = rows.slice(0, 80).map(render).join("");
}

function renderSaveData(data) {
  const players = Array.isArray(data.players) ? data.players : [];
  const guilds = Array.isArray(data.guilds) ? data.guilds : [];
  const pals = Array.isArray(data.pals) ? data.pals : [];
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];

  document.querySelector("#savePlayersCount").textContent = players.length;
  document.querySelector("#saveGuildsCount").textContent = guilds.length;
  document.querySelector("#savePalsCount").textContent = pals.length;
  document.querySelector("#saveItemsCount").textContent = inventory.length;

  renderSimpleList("#savePlayersList", players, "没有玩家数据", (player) =>
    `<div class="row"><strong>${text(player.nickname || player.name, "玩家")}</strong><span>Lv.${text(player.level, 0)} / ${text(player.player_uid)}</span></div>`
  );
  renderSimpleList("#saveGuildsList", guilds, "没有公会数据", (guild) =>
    `<div class="row"><strong>${text(guild.name, "公会")}</strong><span>基地 Lv.${text(guild.base_camp_level, 0)} / 成员 ${(guild.players || []).length}</span></div>`
  );
  renderSimpleList("#savePalsList", pals, "没有帕鲁数据", (pal) =>
    `<div class="row"><strong>${text(pal.type || pal.name, "帕鲁")}</strong><span>Lv.${text(pal.level, 0)} / ${text(pal.owner_name, "未知主人")}</span></div>`
  );
  renderSimpleList("#saveInventoryList", inventory, "没有背包数据", (item) =>
    `<div class="row"><strong>${text(item.ItemId || item.item_id || item.static_id, "物品")}</strong><span>x${text(item.StackCount || item.count, 1)} / ${text(item.owner_name, "未知主人")}</span></div>`
  );
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab,.view").forEach((el) => el.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}`).classList.add("active");
  });
});

document.body.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) await runAction(actionButton.dataset.action);

  const playerButton = event.target.closest("[data-player-action]");
  if (playerButton) {
    const body = readForm(document.querySelector("#playerActionForm"));
    body.action = playerButton.dataset.playerAction;
    const data = await api("/api/player", { method: "POST", body: JSON.stringify(body) });
    actionLog.textContent = data.result.stdout || data.result.stderr || "完成";
  }

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
});

document.querySelector("#refreshBtn").addEventListener("click", refresh);
document.querySelector("#loadLiveBtn").addEventListener("click", loadLive);
document.querySelector("#loadDeployPlanBtn").addEventListener("click", loadDeployPlan);
document.querySelector("#deployServerBtn").addEventListener("click", deployServer);
document.querySelector("#reloadPlayersBtn").addEventListener("click", loadLive);
document.querySelector("#reloadBackupsBtn").addEventListener("click", loadBackups);
document.querySelector("#sendRconBtn").addEventListener("click", () => sendRcon(document.querySelector("#rconCommand").value));

document.querySelector("#saveSettingsBtn").addEventListener("click", async () => {
  await api("/api/settings", { method: "PUT", body: JSON.stringify({ settings: readForm(settingsForm) }) });
  actionLog.textContent = "参数已写入，重启服务器后生效。";
  await refresh();
});

document.querySelector("#saveAutomationBtn").addEventListener("click", async () => {
  await api("/api/config", { method: "PUT", body: JSON.stringify({ automation: readForm(automationForm) }) });
  actionLog.textContent = "自动任务已保存。";
  await refresh();
});

document.querySelector("#saveWhitelistBtn").addEventListener("click", async () => {
  const players = document.querySelector("#whitelistText").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  await api("/api/whitelist", { method: "PUT", body: JSON.stringify({ players }) });
});

document.querySelector("#loadSaveBtn").addEventListener("click", async () => {
  const data = await api("/api/save-data");
  renderSaveData(data.data);
  document.querySelector("#saveOutput").textContent = JSON.stringify(data.data, null, 2);
  document.querySelector("#mapBox").textContent = data.data.map ? JSON.stringify(data.data.map, null, 2) : data.data.message;
});

renderSettingsForm();
refresh().then(() => loadDeployPlan()).catch((error) => {
  statusPill.textContent = "连接失败";
  statusPill.classList.add("offline");
  actionLog.textContent = error.message;
});
