<script setup>
import { computed, ref, watch } from "vue";
import { useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import { Gift, Refresh, Speakerphone, Terminal2, Trash, UserSearch } from "@vicons/tabler";
import ApiService from "@/service/api";

const props = defineProps({ show: { type: Boolean, default: false } });
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const message = useMessage();
const dialog = useDialog();

const activeTab = ref("setup");
const loading = ref(false);
const busy = ref("");
const status = ref({});
const release = ref({});
const bridge = ref({ endpoint: "http://127.0.0.1:17993", token: "", tokenSet: false });
const configText = ref("{}");
const players = ref([]);
const selectedPlayer = ref("");
const inventory = ref(null);
const progression = ref(null);
const technologies = ref(null);
const playerPals = ref(null);
const templates = ref([]);
const bans = ref([]);
const gm = ref({ itemId: "Money", count: 1, message: "", reason: "" });
const progressionGrant = ref({ TechnologyPoints: 0, AncientTechnologyPoints: 0, Relics: {} });
const technology = ref("");
const templateName = ref("");
const templateText = ref(JSON.stringify({ PalID: "Anubis", Level: 50, Gender: "Male", IVs: { Health: 100, Attack: 100, Defense: 100 }, Passives: [] }, null, 2));
const communication = ref({ message: "", mode: "Broadcast" });
const banForm = ref({ playerId: "", nickname: "", reason: "" });
const raw = ref({ method: "GET", path: "/v1/pdapi/version", body: "{}" });
const rawResult = ref(null);

const copy = computed(() => locale.value === "zh" ? {
  title: "PalDefender 安全与 GM", subtitle: "管理安装、配置与本机 REST 桥接，并提供玩家成长、科技、帕鲁、物品、消息和处罚工作台。",
  setup: "安装与连接", config: "Config.json", player: "玩家数据", progression: "成长 / 科技", pals: "帕鲁与模板", communication: "广播与处罚", raw: "REST 调试",
  compatible: "运行兼容", incompatible: "环境不兼容", installed: "已安装", notInstalled: "未安装", ue4ss: "UE4SS", latest: "最新稳定版", install: "安装 / 更新", rollback: "回滚",
  endpoint: "PalDefender REST 地址", token: "REST Bearer Token", tokenKeep: "留空保持已有 Token", save: "保存", test: "测试连接", connected: "连接正常。", saved: "已保存。",
  refreshPlayers: "刷新在线玩家", selectPlayer: "选择玩家", loadPlayer: "读取完整玩家数据", inventory: "背包", itemId: "ItemID", count: "数量", give: "发放物品",
  playerPals: "玩家帕鲁", technologies: "已解锁科技", progressionData: "成长数据", techPoints: "科技点", ancientPoints: "古代科技点", grantProgression: "发放成长资源",
  technologyId: "科技 ID，可用逗号分隔", learn: "学习科技", forget: "遗忘科技", templateName: "模板名称", templateJson: "帕鲁模板 JSON", saveTemplate: "保存模板", giveTemplate: "发放模板", noTemplates: "暂无帕鲁模板",
  message: "消息", broadcast: "全服广播", alert: "屏幕警报", send: "发送", reason: "原因（可选）", kick: "踢出", ban: "封禁", unban: "解封", banList: "封禁记录库", playerId: "SteamID / Player ID", nickname: "昵称（可选）", localRecord: "仅记录", banAndRecord: "封禁并记录", deleteRecord: "删本地记录", noBans: "暂无封禁记录",
  method: "方法", path: "REST 路径", body: "JSON 请求体", execute: "执行", response: "响应", noPlayers: "没有在线玩家", queued: "任务已提交，请在运维中心查看。", done: "操作已完成。",
  armHint: "ARM 原生服务不能加载 Win64 DLL；使用 Wine/Win64 Agent 时可启用 PalDefender。",
} : {
  title: "PalDefender security and GM", subtitle: "Manage installation, configuration, and the loopback REST bridge with player progression, technology, Pal, item, messaging, and moderation tools.",
  setup: "Install & connect", config: "Config.json", player: "Player data", progression: "Progression & tech", pals: "Pals & templates", communication: "Broadcast & moderation", raw: "REST console",
  compatible: "Runtime compatible", incompatible: "Incompatible runtime", installed: "Installed", notInstalled: "Not installed", ue4ss: "UE4SS", latest: "Latest stable", install: "Install / update", rollback: "Rollback",
  endpoint: "PalDefender REST URL", token: "REST bearer token", tokenKeep: "Leave blank to keep the current token", save: "Save", test: "Test connection", connected: "Connection succeeded.", saved: "Saved.",
  refreshPlayers: "Refresh online players", selectPlayer: "Select player", loadPlayer: "Load complete player data", inventory: "Inventory", itemId: "ItemID", count: "Count", give: "Give items",
  playerPals: "Player Pals", technologies: "Unlocked technology", progressionData: "Progression", techPoints: "Technology points", ancientPoints: "Ancient technology points", grantProgression: "Grant progression",
  technologyId: "Technology ID, comma separated", learn: "Learn technology", forget: "Forget technology", templateName: "Template name", templateJson: "Pal template JSON", saveTemplate: "Save template", giveTemplate: "Give template", noTemplates: "No Pal templates",
  message: "Message", broadcast: "Broadcast", alert: "Screen alert", send: "Send", reason: "Reason (optional)", kick: "Kick", ban: "Ban", unban: "Unban", banList: "Ban records", playerId: "SteamID / Player ID", nickname: "Nickname (optional)", localRecord: "Record only", banAndRecord: "Ban and record", deleteRecord: "Delete local record", noBans: "No ban records",
  method: "Method", path: "REST path", body: "JSON body", execute: "Execute", response: "Response", noPlayers: "No online players", queued: "Job queued. Follow it in Operations center.", done: "Action completed.",
  armHint: "Native ARM cannot load Win64 DLLs. PalDefender is available through a Wine/Win64 Agent.",
});

const result = (response) => response?.data?.value || {};
const fail = (response, fallback) => message.error(result(response).error || fallback);
const pdData = (response) => result(response).result?.data || {};
const playerOptions = computed(() => players.value.map((player) => ({ label: `${player.Name || player.PlayerUID} (${player.UserId || player.PlayerUID})`, value: player.UserId || player.PlayerUID })));

const load = async () => {
  loading.value = true;
  try {
    const [statusResponse, releaseResponse, bridgeResponse, configResponse, templateResponse, banResponse] = await Promise.all([
      api.getPalDefenderStatus(), api.getPalDefenderRelease(), api.getPalDefenderBridge(), api.getPalDefenderConfig(), api.getPalDefenderTemplates(), api.getPlayerBans(),
    ]);
    status.value = result(statusResponse).status || {};
    release.value = result(releaseResponse).release || {};
    bridge.value = { ...bridge.value, ...(result(bridgeResponse).bridge || {}), token: "" };
    configText.value = JSON.stringify(result(configResponse).config || {}, null, 2);
    templates.value = result(templateResponse).templates || [];
    bans.value = result(banResponse).bans || [];
  } finally { loading.value = false; }
};

const install = async () => {
  busy.value = "install";
  try { const response = await api.installPalDefender(); if (response.statusCode?.value >= 400) return fail(response, "Install failed"); message.success(copy.value.queued); }
  finally { busy.value = ""; }
};
const rollback = () => dialog.warning({ title: copy.value.rollback, content: copy.value.rollback, positiveText: copy.value.rollback, negativeText: locale.value === "zh" ? "取消" : "Cancel", onPositiveClick: async () => { const response = await api.rollbackPalDefender(); if (response.statusCode?.value >= 400) return fail(response, "Rollback failed"); message.success(copy.value.queued); } });
const saveBridge = async () => { busy.value = "bridge"; try { const response = await api.updatePalDefenderBridge(bridge.value); if (response.statusCode?.value >= 400) return fail(response, "Save failed"); bridge.value = { ...bridge.value, ...result(response).bridge, token: "" }; message.success(copy.value.saved); } finally { busy.value = ""; } };
const testBridge = async () => { busy.value = "test"; try { const response = await api.testPalDefender(); if (response.statusCode?.value >= 400) return fail(response, "Connection failed"); message.success(copy.value.connected); } finally { busy.value = ""; } };
const saveConfig = async () => { let config; try { config = JSON.parse(configText.value); if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error(); } catch { return message.error("Invalid JSON"); } busy.value = "config"; try { const response = await api.updatePalDefenderConfig(config); if (response.statusCode?.value >= 400) return fail(response, "Save failed"); message.success(copy.value.saved); } finally { busy.value = ""; } };

const request = async (method, path, body) => {
  const response = await api.palDefenderRequest(method, path, body);
  if (response.statusCode?.value >= 400) { fail(response, "PalDefender request failed"); throw new Error("request failed"); }
  return pdData(response);
};
const loadPlayers = async () => { busy.value = "players"; try { const data = await request("GET", "/v1/pdapi/players"); players.value = data.Players || []; } catch {} finally { busy.value = ""; } };
const loadPlayerData = async () => {
  if (!selectedPlayer.value) return;
  busy.value = "player-data";
  const id = encodeURIComponent(selectedPlayer.value);
  try {
    const rows = await Promise.allSettled([
      request("GET", `/v1/pdapi/items/${id}`), request("GET", `/v1/pdapi/progression/${id}`), request("GET", `/v1/pdapi/techs/${id}`), request("GET", `/v1/pdapi/pals/${id}`),
    ]);
    inventory.value = rows[0].status === "fulfilled" ? rows[0].value : null;
    progression.value = rows[1].status === "fulfilled" ? rows[1].value : null;
    technologies.value = rows[2].status === "fulfilled" ? rows[2].value : null;
    playerPals.value = rows[3].status === "fulfilled" ? rows[3].value : null;
  } finally { busy.value = ""; }
};
const gmAction = async (action) => {
  if (!selectedPlayer.value && !["broadcast", "alert"].includes(action)) return;
  busy.value = action;
  const id = encodeURIComponent(selectedPlayer.value);
  try {
    if (action === "give") await request("POST", `/v1/pdapi/give/items/${id}`, { Items: [{ ItemID: gm.value.itemId, Count: Number(gm.value.count || 1) }] });
    else if (action === "message") await request("POST", "/v1/pdapi/SendPlayerMessage", { UserID: selectedPlayer.value, SendType: "PlayerLogImportant", Message: gm.value.message });
    else if (["kick", "ban", "unban"].includes(action)) await request("POST", `/v1/pdapi/${action}/${id}`, { Reason: gm.value.reason });
    else if (["broadcast", "alert"].includes(action)) await request("POST", `/v1/pdapi/${action === "alert" ? "Alert" : "Broadcast"}`, { Message: communication.value.message });
    message.success(copy.value.done);
  } catch {} finally { busy.value = ""; }
};
const grantProgression = async () => { if (!selectedPlayer.value) return; busy.value = "progression"; try { await request("POST", `/v1/pdapi/give/progression/${encodeURIComponent(selectedPlayer.value)}`, progressionGrant.value); message.success(copy.value.done); await loadPlayerData(); } catch {} finally { busy.value = ""; } };
const updateTechnology = async (action) => { if (!selectedPlayer.value || !technology.value.trim()) return; busy.value = action; try { const selection = technology.value.split(/[,，\n]/).map((row) => row.trim()).filter(Boolean); await request("POST", `/v1/pdapi/${action === "learn" ? "learntech" : "forgettech"}/${encodeURIComponent(selectedPlayer.value)}`, { Technology: selection.length === 1 ? selection[0] : selection }); message.success(copy.value.done); await loadPlayerData(); } catch {} finally { busy.value = ""; } };
const saveTemplate = async () => { let template; try { template = JSON.parse(templateText.value); } catch { return message.error("Invalid JSON"); } busy.value = "template-save"; try { const response = await api.savePalDefenderTemplate({ name: templateName.value, template }); if (response.statusCode?.value >= 400) return fail(response, "Save failed"); templates.value = result(response).templates || templates.value; message.success(copy.value.saved); } finally { busy.value = ""; } };
const removeTemplate = async (id) => { const response = await api.deletePalDefenderTemplate(id); templates.value = result(response).templates || []; };
const useTemplate = (row) => { templateName.value = row.name; templateText.value = JSON.stringify(row.template, null, 2); };
const giveTemplate = async (row) => { if (!selectedPlayer.value) return; busy.value = `template:${row.id}`; try { await request("POST", `/v1/pdapi/give/pals/${encodeURIComponent(selectedPlayer.value)}`, { Pals: [row.template] }); message.success(copy.value.done); } catch {} finally { busy.value = ""; } };
const executeRaw = async () => { busy.value = "raw"; try { const body = raw.value.method === "GET" ? undefined : JSON.parse(raw.value.body || "{}"); rawResult.value = await request(raw.value.method, raw.value.path, body); } catch (error) { if (error instanceof SyntaxError) message.error("Invalid JSON"); } finally { busy.value = ""; } };
const saveBanRecord = async (runBan = false) => { if (!banForm.value.playerId) return; busy.value = runBan ? "ban-record" : "ban-local"; try { const response = runBan ? await api.runPlayerBanAction(banForm.value.playerId, "ban", banForm.value) : await api.savePlayerBan(banForm.value); if (response.statusCode?.value >= 400) return fail(response, "Ban action failed"); bans.value = result(response).bans || bans.value; banForm.value = { playerId: "", nickname: "", reason: "" }; message.success(copy.value.done); } finally { busy.value = ""; } };
const unbanRecord = async (row) => { busy.value = `unban:${row.playerId}`; try { const response = await api.runPlayerBanAction(row.playerId, "unban"); if (response.statusCode?.value >= 400) return fail(response, "Unban failed"); bans.value = result(response).bans || []; message.success(copy.value.done); } finally { busy.value = ""; } };
const deleteBanRecord = async (row) => { const response = await api.deletePlayerBan(row.playerId); bans.value = result(response).bans || []; };

watch(() => props.show, (show) => show && load(), { immediate: true });
</script>

<template>
  <n-modal :show="show" preset="card" class="pd-modal" :title="copy.title" :bordered="false" @update:show="emit('update:show', $event)">
    <template #header-extra><n-button quaternary circle :loading="loading" @click="load"><template #icon><n-icon><Refresh /></n-icon></template></n-button></template>
    <p class="manager-intro">{{ copy.subtitle }}</p>
    <div v-if="!['setup','config'].includes(activeTab)" class="player-toolbar"><n-button :loading="busy === 'players'" @click="loadPlayers"><template #icon><n-icon><UserSearch /></n-icon></template>{{ copy.refreshPlayers }}</n-button><n-select v-model:value="selectedPlayer" filterable :options="playerOptions" :placeholder="copy.selectPlayer" /><n-button type="primary" :disabled="!selectedPlayer" :loading="busy === 'player-data'" @click="loadPlayerData">{{ copy.loadPlayer }}</n-button></div>
    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="setup" :tab="copy.setup">
        <div class="status-grid"><div><span>{{ status.compatible ? copy.compatible : copy.incompatible }}</span><strong>{{ status.compatible ? "OK" : "-" }}</strong></div><div><span>{{ status.installed ? copy.installed : copy.notInstalled }}</span><strong>{{ status.version || "-" }}</strong></div><div><span>{{ copy.ue4ss }}</span><strong>{{ status.ue4ssInstalled ? "OK" : "-" }}</strong></div><div><span>{{ copy.latest }}</span><strong>{{ release.tag || "-" }}</strong></div></div>
        <n-alert v-if="!status.compatible" type="warning" class="pd-alert">{{ status.reason || copy.armHint }}</n-alert>
        <div class="right-actions"><n-button type="primary" :disabled="!status.compatible || !status.ue4ssInstalled" :loading="busy === 'install'" @click="install">{{ copy.install }}</n-button><n-button :disabled="!status.installed" @click="rollback">{{ copy.rollback }}</n-button></div>
        <n-divider />
        <n-form label-placement="top" :model="bridge"><n-form-item :label="copy.endpoint"><n-input v-model:value="bridge.endpoint" /></n-form-item><n-form-item :label="copy.token"><n-input v-model:value="bridge.token" type="password" show-password-on="click" :placeholder="bridge.tokenSet ? copy.tokenKeep : ''" /></n-form-item></n-form>
        <div class="right-actions"><n-button :loading="busy === 'test'" @click="testBridge">{{ copy.test }}</n-button><n-button type="primary" :loading="busy === 'bridge'" @click="saveBridge">{{ copy.save }}</n-button></div>
      </n-tab-pane>

      <n-tab-pane name="config" :tab="copy.config"><n-input v-model:value="configText" type="textarea" class="code-editor" :autosize="{ minRows: 20, maxRows: 30 }" /><div class="right-actions"><n-button type="primary" :loading="busy === 'config'" @click="saveConfig">{{ copy.save }}</n-button></div></n-tab-pane>

      <n-tab-pane name="player" :tab="copy.player">
        <n-empty v-if="players.length === 0" :description="copy.noPlayers" />
        <div class="player-data-grid"><section><div class="section-heading"><strong>{{ copy.inventory }}</strong><n-button size="small" :disabled="!selectedPlayer" :loading="busy === 'give'" @click="gmAction('give')"><template #icon><n-icon><Gift /></n-icon></template>{{ copy.give }}</n-button></div><div class="inline-form"><n-input v-model:value="gm.itemId" :placeholder="copy.itemId" /><n-input-number v-model:value="gm.count" :min="1" /></div><pre>{{ JSON.stringify(inventory || {}, null, 2) }}</pre></section><section><div class="section-heading"><strong>{{ copy.playerPals }}</strong><span>{{ playerPals?.Meta?.TeamCount ?? "-" }} / {{ playerPals?.Meta?.PalboxCount ?? "-" }}</span></div><pre>{{ JSON.stringify(playerPals || {}, null, 2) }}</pre></section></div>
      </n-tab-pane>

      <n-tab-pane name="progression" :tab="copy.progression">
        <div class="player-data-grid"><section><div class="section-heading"><strong>{{ copy.progressionData }}</strong></div><pre>{{ JSON.stringify(progression || {}, null, 2) }}</pre><div class="grant-grid"><n-input-number v-model:value="progressionGrant.TechnologyPoints"><template #prefix>{{ copy.techPoints }}</template></n-input-number><n-input-number v-model:value="progressionGrant.AncientTechnologyPoints"><template #prefix>{{ copy.ancientPoints }}</template></n-input-number><n-button type="primary" :loading="busy === 'progression'" @click="grantProgression">{{ copy.grantProgression }}</n-button></div></section><section><div class="section-heading"><strong>{{ copy.technologies }}</strong></div><pre>{{ JSON.stringify(technologies || {}, null, 2) }}</pre><n-input v-model:value="technology" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" :placeholder="copy.technologyId" /><div class="right-actions"><n-button :loading="busy === 'forget'" @click="updateTechnology('forget')">{{ copy.forget }}</n-button><n-button type="primary" :loading="busy === 'learn'" @click="updateTechnology('learn')">{{ copy.learn }}</n-button></div></section></div>
      </n-tab-pane>

      <n-tab-pane name="pals" :tab="copy.pals">
        <div class="template-layout"><section><n-form-item :label="copy.templateName"><n-input v-model:value="templateName" /></n-form-item><n-form-item :label="copy.templateJson"><n-input v-model:value="templateText" type="textarea" class="code-editor" :autosize="{ minRows: 16, maxRows: 24 }" /></n-form-item><div class="right-actions"><n-button type="primary" :loading="busy === 'template-save'" @click="saveTemplate">{{ copy.saveTemplate }}</n-button></div></section><section><n-empty v-if="templates.length === 0" :description="copy.noTemplates" /><div class="template-list"><article v-for="row in templates" :key="row.id"><button type="button" @click="useTemplate(row)"><strong>{{ row.name }}</strong><span>{{ row.template?.PalID }} · Lv.{{ row.template?.Level || 1 }}</span></button><n-button size="small" :disabled="!selectedPlayer" :loading="busy === `template:${row.id}`" @click="giveTemplate(row)">{{ copy.giveTemplate }}</n-button><n-button quaternary circle type="error" @click="removeTemplate(row.id)"><template #icon><n-icon><Trash /></n-icon></template></n-button></article></div></section></div>
      </n-tab-pane>

      <n-tab-pane name="communication" :tab="copy.communication">
        <div class="communication-layout">
          <section><div class="section-heading"><strong>{{ copy.broadcast }}</strong><n-icon><Speakerphone /></n-icon></div><n-input v-model:value="communication.message" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" :placeholder="copy.message" /><div class="right-actions"><n-button :loading="busy === 'alert'" @click="gmAction('alert')">{{ copy.alert }}</n-button><n-button type="primary" :loading="busy === 'broadcast'" @click="gmAction('broadcast')">{{ copy.broadcast }}</n-button></div></section>
          <section><div class="section-heading"><strong>{{ copy.message }}</strong></div><n-input v-model:value="gm.message" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" /><n-button type="primary" :disabled="!selectedPlayer" :loading="busy === 'message'" @click="gmAction('message')">{{ copy.send }}</n-button><n-divider /><n-input v-model:value="gm.reason" :placeholder="copy.reason" /><div class="moderation-actions"><n-button :disabled="!selectedPlayer" :loading="busy === 'kick'" @click="gmAction('kick')">{{ copy.kick }}</n-button><n-button :disabled="!selectedPlayer" type="error" secondary :loading="busy === 'ban'" @click="gmAction('ban')">{{ copy.ban }}</n-button><n-button :disabled="!selectedPlayer" :loading="busy === 'unban'" @click="gmAction('unban')">{{ copy.unban }}</n-button></div></section>
          <section class="ban-section">
            <div class="section-heading"><strong>{{ copy.banList }}</strong><span>{{ bans.length }}</span></div>
            <div class="ban-form"><n-input v-model:value="banForm.playerId" :placeholder="copy.playerId" /><n-input v-model:value="banForm.nickname" :placeholder="copy.nickname" /><n-input v-model:value="banForm.reason" :placeholder="copy.reason" /><n-button :loading="busy === 'ban-local'" @click="saveBanRecord(false)">{{ copy.localRecord }}</n-button><n-button type="error" secondary :loading="busy === 'ban-record'" @click="saveBanRecord(true)">{{ copy.banAndRecord }}</n-button></div>
            <n-empty v-if="bans.length === 0" size="small" :description="copy.noBans" />
            <div class="ban-list"><article v-for="row in bans" :key="row.playerId"><div><strong>{{ row.nickname || row.playerId }}</strong><span>{{ row.playerId }} · {{ row.reason || '-' }}</span></div><time>{{ new Date(row.createdAt).toLocaleString() }}</time><n-button size="small" :loading="busy === `unban:${row.playerId}`" @click="unbanRecord(row)">{{ copy.unban }}</n-button><n-button quaternary circle type="error" :aria-label="copy.deleteRecord" @click="deleteBanRecord(row)"><template #icon><n-icon><Trash /></n-icon></template></n-button></article></div>
          </section>
        </div>
      </n-tab-pane>

      <n-tab-pane name="raw" :tab="copy.raw">
        <div class="raw-toolbar"><n-select v-model:value="raw.method" :options="['GET','POST','PUT','DELETE'].map(value => ({ label: value, value }))" /><n-input v-model:value="raw.path" :placeholder="copy.path" /><n-button type="primary" :loading="busy === 'raw'" @click="executeRaw"><template #icon><n-icon><Terminal2 /></n-icon></template>{{ copy.execute }}</n-button></div><n-form-item :label="copy.body"><n-input v-model:value="raw.body" type="textarea" class="code-editor" :autosize="{ minRows: 8, maxRows: 16 }" /></n-form-item><div class="section-heading"><strong>{{ copy.response }}</strong></div><pre>{{ JSON.stringify(rawResult || {}, null, 2) }}</pre>
      </n-tab-pane>
    </n-tabs>
  </n-modal>
</template>

<style scoped>
:global(.pd-modal) { width: min(1320px, 96vw); }
.manager-intro { margin: 0 0 14px; color: var(--app-ink-muted); font-size: 13px; }
.player-toolbar { display: grid; grid-template-columns: auto minmax(260px, 1fr) auto; gap: 8px; margin-bottom: 12px; }
.status-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--app-border); border-bottom: 1px solid var(--app-border); }
.status-grid > div { display: grid; gap: 4px; padding: 14px; border-right: 1px solid var(--app-border); }.status-grid > div:last-child { border-right: 0; }
.status-grid span { color: var(--app-ink-muted); font-size: 11px; }.status-grid strong { font-family: var(--app-font-data); font-size: 15px; }
.pd-alert { margin-top: 14px; }.right-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.code-editor :deep(textarea), pre { font-family: var(--app-font-data); }
.player-data-grid, .template-layout, .communication-layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }.section-heading span { color: var(--app-ink-muted); font-size: 12px; }
pre { max-height: 440px; overflow: auto; min-height: 180px; margin: 0 0 12px; padding: 12px; color: var(--app-ink-secondary); background: var(--app-surface-muted); border-radius: 7px; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
.inline-form { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 8px; margin-bottom: 10px; }
.grant-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; }
.template-list { display: grid; border-top: 1px solid var(--app-border); }.template-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; min-height: 58px; border-bottom: 1px solid var(--app-border); }
.template-list article > button:first-child { display: grid; gap: 2px; color: var(--app-ink); background: transparent; border: 0; cursor: pointer; text-align: left; }.template-list span { color: var(--app-ink-muted); font-size: 11px; }
.communication-layout section { display: grid; align-content: start; gap: 10px; }.moderation-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ban-section { grid-column: 1 / -1; }
.ban-form { display: grid; grid-template-columns: 1fr 1fr minmax(180px, 1.3fr) auto auto; gap: 8px; }
.ban-list { display: grid; border-top: 1px solid var(--app-border); }
.ban-list article { display: grid; grid-template-columns: minmax(0, 1fr) 180px auto auto; align-items: center; gap: 10px; min-height: 56px; border-bottom: 1px solid var(--app-border); }
.ban-list article > div { display: grid; min-width: 0; gap: 2px; }.ban-list span, .ban-list time { color: var(--app-ink-muted); font-size: 11px; }.ban-list time { text-align: right; }
.raw-toolbar { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 8px; margin-bottom: 12px; }
@media (max-width: 900px) { .player-data-grid, .template-layout, .communication-layout { grid-template-columns: 1fr; }.status-grid { grid-template-columns: repeat(2, 1fr); }.ban-form { grid-template-columns: 1fr 1fr; }.ban-list article { grid-template-columns: minmax(0, 1fr) auto auto; }.ban-list time { display: none; } }
@media (max-width: 720px) { :global(.pd-modal) { width: 100vw; max-width: 100vw; } :global(.pd-modal .n-tabs-nav--segment-type) { overflow-x: auto; } :global(.pd-modal .n-tabs) { min-width: 0; max-width: 100%; overflow-x: hidden; } :global(.pd-modal .n-tabs-rail) { width: max-content; min-width: 100%; } :global(.pd-modal .n-tabs-capsule) { width: auto; flex: 0 0 auto; } :global(.pd-modal .n-tabs-tab) { min-width: 112px; padding-inline: 12px; }.player-toolbar, .raw-toolbar, .grant-grid, .ban-form { grid-template-columns: 1fr; }.inline-form { grid-template-columns: 1fr; }.ban-list article { grid-template-columns: minmax(0, 1fr) auto; padding: 8px 0; }.ban-list article > .n-button:nth-last-child(2) { grid-column: 1 / -1; } }
</style>
