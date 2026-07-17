<script setup>
import { computed, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import { BrandHipchat, Refresh, Search, Settings } from "@vicons/tabler";
import ApiService from "@/service/api";

const props = defineProps({ show: { type: Boolean, default: false } });
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const message = useMessage();

const loading = ref(false);
const busy = ref("");
const activeTab = ref("accounts");
const config = ref({ enabled: false, dailyReward: 10, solveCost: 1, challengeMinutes: 5, loginMinutes: 5, adminQqs: [] });
const players = ref([]);
const accounts = ref([]);
const ledger = ref([]);
const query = ref("");
const accountForm = ref({ qq: "", playerId: "", change: 10, reason: "" });

const copy = computed(() => locale.value === "zh" ? {
  title: "AstrBot / QQ 集成",
  subtitle: "管理绑定、签到积分、快捷配种、一次性只读登录和管理员风控。机器人使用 integration 角色 API Key。",
  accounts: "账号管理", settings: "集成设置", players: "在线玩家", ledger: "积分流水",
  enabled: "启用集成", dailyReward: "签到奖励", solveCost: "配种消耗", challengeMinutes: "验证码有效分钟", loginMinutes: "登录链接有效分钟", adminQqs: "机器人管理员 QQ",
  save: "保存设置", saved: "设置已保存。", apiHint: "在“账号权限”中签发 integration API Key，再填入 AstrBot 插件。",
  qq: "QQ 号", playerId: "玩家 ID", points: "积分", binding: "绑定玩家", lastCheckIn: "最后签到", status: "状态",
  normal: "正常", frozen: "已冻结", bind: "人工绑定", unbind: "解绑", freeze: "冻结", unfreeze: "解冻", adjust: "调整积分",
  change: "积分变化", reason: "原因", query: "搜索 QQ / 玩家", noAccounts: "暂无 QQ 账号", noPlayers: "当前没有在线玩家", noLedger: "暂无积分流水",
  commands: "机器人命令覆盖绑定、验证、签到、积分、配种、面板链接和管理员操作。",
} : {
  title: "AstrBot / QQ integration",
  subtitle: "Manage bindings, check-in points, quick breeding, one-time viewer login, and administrator controls. The bot uses an integration API key.",
  accounts: "Accounts", settings: "Settings", players: "Online players", ledger: "Point ledger",
  enabled: "Enable integration", dailyReward: "Check-in reward", solveCost: "Breeding cost", challengeMinutes: "Code lifetime", loginMinutes: "Login link lifetime", adminQqs: "Bot administrator QQs",
  save: "Save settings", saved: "Settings saved.", apiHint: "Issue an integration API key in Access, then enter it in the AstrBot plugin.",
  qq: "QQ number", playerId: "Player ID", points: "Points", binding: "Bound player", lastCheckIn: "Last check-in", status: "Status",
  normal: "Active", frozen: "Frozen", bind: "Bind", unbind: "Unbind", freeze: "Freeze", unfreeze: "Unfreeze", adjust: "Adjust points",
  change: "Point change", reason: "Reason", query: "Search QQ / player", noAccounts: "No QQ accounts", noPlayers: "No players are online", noLedger: "No point ledger entries",
  commands: "Bot commands cover binding, verification, check-in, points, breeding, panel links, and administrator actions.",
});

const result = (response) => response?.data?.value || {};
const fail = (response, fallback) => message.error(result(response).error || fallback);
const filteredAccounts = computed(() => {
  const value = query.value.trim().toLowerCase();
  return accounts.value.filter((account) => !value || account.qq.includes(value) || account.binding?.playerId?.toLowerCase().includes(value));
});

const load = async () => {
  loading.value = true;
  try {
    const [configResponse, playerResponse, accountResponse, ledgerResponse] = await Promise.all([
      api.getAstrBotConfig(), api.getAstrBotPlayers(), api.getAstrBotAccounts(), api.getAstrBotLedger(),
    ]);
    config.value = { ...config.value, ...(result(configResponse).config || {}) };
    players.value = result(playerResponse).players || [];
    accounts.value = result(accountResponse).accounts || [];
    ledger.value = result(ledgerResponse).ledger || [];
  } finally { loading.value = false; }
};

const save = async () => {
  busy.value = "save";
  try {
    const response = await api.updateAstrBotConfig(config.value);
    if (response.statusCode?.value >= 400) return fail(response, "Save failed");
    config.value = result(response).config || config.value;
    message.success(copy.value.saved);
  } finally { busy.value = ""; }
};

const manage = async (action, source = accountForm.value) => {
  if (!source.qq) return;
  busy.value = `${action}:${source.qq}`;
  try {
    const response = await api.manageAstrBotAccount({
      qq: source.qq,
      playerId: source.playerId || source.binding?.playerId,
      change: source.change,
      reason: source.reason,
      action,
    });
    if (response.statusCode?.value >= 400) return fail(response, "Account action failed");
    await load();
    accountForm.value = { qq: "", playerId: "", change: 10, reason: "" };
    message.success(copy.value.saved);
  } finally { busy.value = ""; }
};

watch(() => props.show, (show) => show && load(), { immediate: true });
</script>

<template>
  <n-modal :show="show" preset="card" class="astrbot-modal" :title="copy.title" :bordered="false" @update:show="emit('update:show', $event)">
    <template #header-extra><n-button quaternary circle :loading="loading" @click="load"><template #icon><n-icon><Refresh /></n-icon></template></n-button></template>
    <p class="manager-intro">{{ copy.subtitle }}</p>
    <n-alert type="info" class="astrbot-hint">{{ copy.apiHint }} {{ copy.commands }}</n-alert>
    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="accounts" :tab="copy.accounts">
        <div class="account-create">
          <n-input v-model:value="accountForm.qq" :placeholder="copy.qq" />
          <n-input v-model:value="accountForm.playerId" :placeholder="copy.playerId" />
          <n-button type="primary" :loading="busy === `bind:${accountForm.qq}`" @click="manage('bind')">{{ copy.bind }}</n-button>
          <n-input-number v-model:value="accountForm.change" :placeholder="copy.change" />
          <n-input v-model:value="accountForm.reason" :placeholder="copy.reason" />
          <n-button :loading="busy === `adjust:${accountForm.qq}`" @click="manage('adjust')">{{ copy.adjust }}</n-button>
        </div>
        <div class="account-toolbar"><n-input v-model:value="query" clearable :placeholder="copy.query"><template #prefix><n-icon><Search /></n-icon></template></n-input><strong>{{ filteredAccounts.length }}</strong></div>
        <n-empty v-if="filteredAccounts.length === 0" :description="copy.noAccounts" />
        <div class="account-list">
          <article v-for="account in filteredAccounts" :key="account.qq">
            <div class="account-identity"><strong>{{ account.qq }}</strong><span>{{ account.binding?.playerId || "-" }}</span></div>
            <div class="account-stat"><span>{{ copy.points }}</span><strong>{{ account.points }}</strong></div>
            <div class="account-stat"><span>{{ copy.lastCheckIn }}</span><strong>{{ account.lastCheckIn || "-" }}</strong></div>
            <n-tag size="small" :type="account.frozen ? 'error' : 'success'">{{ account.frozen ? copy.frozen : copy.normal }}</n-tag>
            <div class="account-actions">
              <n-button size="small" :disabled="!account.binding" :loading="busy === `unbind:${account.qq}`" @click="manage('unbind', account)">{{ copy.unbind }}</n-button>
              <n-button size="small" :type="account.frozen ? 'default' : 'error'" secondary :loading="busy === `${account.frozen ? 'unfreeze' : 'freeze'}:${account.qq}`" @click="manage(account.frozen ? 'unfreeze' : 'freeze', account)">{{ account.frozen ? copy.unfreeze : copy.freeze }}</n-button>
            </div>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="settings" :tab="copy.settings">
        <div class="settings-layout">
          <section><h3><n-icon><Settings /></n-icon>{{ copy.settings }}</h3><n-form label-placement="top" :model="config"><n-form-item :label="copy.enabled"><n-switch v-model:value="config.enabled" /></n-form-item><div class="setting-grid"><n-form-item :label="copy.dailyReward"><n-input-number v-model:value="config.dailyReward" :min="0" /></n-form-item><n-form-item :label="copy.solveCost"><n-input-number v-model:value="config.solveCost" :min="0" /></n-form-item><n-form-item :label="copy.challengeMinutes"><n-input-number v-model:value="config.challengeMinutes" :min="1" :max="60" /></n-form-item><n-form-item :label="copy.loginMinutes"><n-input-number v-model:value="config.loginMinutes" :min="1" :max="60" /></n-form-item></div><n-form-item :label="copy.adminQqs"><n-dynamic-tags v-model:value="config.adminQqs" /></n-form-item></n-form><div class="right-actions"><n-button type="primary" :loading="busy === 'save'" @click="save">{{ copy.save }}</n-button></div></section>
          <section><h3><n-icon><BrandHipchat /></n-icon>{{ copy.players }}</h3><n-empty v-if="players.length === 0" :description="copy.noPlayers" /><div class="player-list"><article v-for="player in players" :key="player.playerId"><strong>{{ player.name || player.playerId }}</strong><code>{{ player.playerId }}</code></article></div></section>
        </div>
      </n-tab-pane>

      <n-tab-pane name="ledger" :tab="copy.ledger">
        <n-empty v-if="ledger.length === 0" :description="copy.noLedger" />
        <div class="ledger-list"><article v-for="row in ledger" :key="row.id"><div><strong>{{ row.qq }}</strong><span>{{ row.reason }}</span></div><strong :class="row.change >= 0 ? 'is-positive' : 'is-negative'">{{ row.change >= 0 ? '+' : '' }}{{ row.change }}</strong><time>{{ new Date(row.createdAt).toLocaleString() }}</time></article></div>
      </n-tab-pane>
    </n-tabs>
  </n-modal>
</template>

<style scoped>
:global(.astrbot-modal) { width: min(1180px, 95vw); }
.manager-intro { margin: 0 0 14px; color: var(--app-ink-muted); font-size: 13px; }
.astrbot-hint { margin-bottom: 16px; }
.account-create { display: grid; grid-template-columns: 150px minmax(180px, 1fr) auto 150px minmax(180px, 1fr) auto; gap: 8px; margin-bottom: 16px; }
.account-toolbar { display: grid; grid-template-columns: minmax(0, 420px) auto; align-items: center; gap: 12px; margin-bottom: 8px; }
.account-toolbar strong { color: var(--app-ink-muted); font-family: var(--app-font-data); }
.account-list { display: grid; max-height: 520px; overflow: auto; border-top: 1px solid var(--app-border); }
.account-list article { display: grid; grid-template-columns: minmax(150px, 1fr) 90px 130px auto auto; align-items: center; gap: 14px; min-height: 64px; border-bottom: 1px solid var(--app-border); }
.account-identity, .account-stat { display: grid; min-width: 0; gap: 2px; }
.account-identity span, .account-stat span { overflow: hidden; color: var(--app-ink-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.account-stat strong { font-family: var(--app-font-data); font-size: 12px; }
.account-actions { display: flex; gap: 6px; }
.settings-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; }
.settings-layout h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 14px; }
.setting-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.right-actions { display: flex; justify-content: flex-end; }
.player-list, .ledger-list { display: grid; border-top: 1px solid var(--app-border); }
.player-list article { display: flex; justify-content: space-between; gap: 10px; min-height: 44px; align-items: center; border-bottom: 1px solid var(--app-border); }
.player-list code { color: var(--app-ink-muted); font-size: 11px; }
.ledger-list article { display: grid; grid-template-columns: minmax(0, 1fr) 90px 190px; align-items: center; gap: 14px; min-height: 54px; border-bottom: 1px solid var(--app-border); }
.ledger-list article > div { display: grid; gap: 2px; }
.ledger-list span, .ledger-list time { color: var(--app-ink-muted); font-size: 12px; }
.ledger-list time { text-align: right; }
.is-positive { color: var(--app-success); }.is-negative { color: var(--app-danger); }
@media (max-width: 900px) { .account-create { grid-template-columns: 1fr 1fr auto; } .account-list article { grid-template-columns: minmax(120px, 1fr) 70px auto; } .account-stat:nth-of-type(2) { display: none; } .settings-layout { grid-template-columns: 1fr; } }
@media (max-width: 720px) { :global(.astrbot-modal) { width: 100vw; max-width: 100vw; } :global(.astrbot-modal .n-tabs-nav--segment-type) { overflow-x: auto; } :global(.astrbot-modal .n-tabs) { min-width: 0; max-width: 100%; overflow-x: hidden; } :global(.astrbot-modal .n-tabs-rail) { width: max-content; min-width: 100%; } :global(.astrbot-modal .n-tabs-capsule) { width: auto; flex: 0 0 auto; } :global(.astrbot-modal .n-tabs-tab) { min-width: 110px; padding-inline: 12px; } .account-create { grid-template-columns: 1fr; } .account-list article { grid-template-columns: minmax(0, 1fr) auto; padding: 10px 0; } .account-stat { display: none; } .account-actions { grid-column: 1 / -1; } .setting-grid { grid-template-columns: 1fr; } .ledger-list article { grid-template-columns: minmax(0, 1fr) auto; } .ledger-list time { grid-column: 1 / -1; text-align: left; } }
</style>
