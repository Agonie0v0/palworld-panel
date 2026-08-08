<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";
import {
  Activity,
  AlertTriangle,
  Archive,
  ChevronRight,
  Cpu,
  Database,
  DeviceDesktopAnalytics,
  Paw,
  Refresh,
  Server,
  ShieldCheck,
  Tools,
  Users,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import { enrichPals, palPortrait } from "@/utils/gameData";
import { buildPalWorkerRows } from "@/utils/palWorkers";
import unknownPal from "@/assets/pals/unknown.png";

const props = defineProps({
  serverInfo: { type: Object, default: () => ({}) },
  serverMetrics: { type: Object, default: () => ({}) },
  players: { type: Array, default: () => [] },
});
const emit = defineEmits(["navigate"]);
const { locale } = useI18n();
const api = new ApiService();
const loading = ref(false);
const onlinePlayers = ref([]);
const backups = ref([]);
const tasks = ref([]);
const hostMetrics = ref({});
const bases = ref([]);
const worldDataError = ref(false);
let refreshTimer;

const zh = computed(() => locale.value === "zh");
const copy = computed(() => zh.value ? {
  title: "世界运行态",
  subtitle: "玩家离线后，服务器与据点仍会持续运转",
  refresh: "刷新运行态",
  online: "服务器在线",
  offline: "服务器离线",
  fps: "服务 FPS",
  players: "在线玩家",
  pals: "据点帕鲁",
  working: "工作中",
  attention: "需关注",
  uptime: "运行时长",
  bases: "据点班次",
  basesHint: "存档解析出的据点帕鲁、当前任务与身体状态",
  openPalStatus: "查看全部帕鲁",
  worldActive: "世界仍在运转",
  emptyWorldMessage: (count) => `当前没有玩家在线，${count} 只据点帕鲁仍在持续工作与活动。`,
  onlineWorldMessage: (players, pals) => `${players} 位玩家在线，${pals} 只据点帕鲁正在维持世界运转。`,
  noWorkers: "尚未解析到据点帕鲁，请检查存档源或重新解析存档。",
  worldUnavailable: "据点数据暂时不可用，玩家与主机状态仍会继续刷新。",
  task: "当前状态",
  base: "所在据点",
  hunger: "饱食度",
  sanity: "SAN",
  autonomous: "自主活动",
  workingState: "工作中",
  restingState: "休息中",
  eatingState: "进食中",
  attentionState: "需要关注",
  host: "主机余量",
  hostHint: "资源越充裕，世界运行越稳定",
  protection: "保护与自动化",
  activeTasks: "启用任务",
  latestBackup: "最近备份",
  backupCount: "备份数量",
  never: "从未备份",
  playersNow: "当前在线玩家",
  playersHint: "玩家连接只是世界运行态的一部分",
  viewPlayers: "玩家管理",
  unavailable: "暂时无法读取主机数据",
  liveUnavailable: "实时连接不完整，请检查 PST 配置中的 REST API。",
  openSettings: "打开 PST 配置",
  cores: "核心",
  healthy: "状态正常",
} : {
  title: "World operations",
  subtitle: "The server and bases keep running after players disconnect",
  refresh: "Refresh world state",
  online: "Server online",
  offline: "Server offline",
  fps: "Server FPS",
  players: "Online players",
  pals: "Base Pals",
  working: "Working",
  attention: "Need attention",
  uptime: "Uptime",
  bases: "Base shifts",
  basesHint: "Base Pals, current assignments, and wellbeing parsed from the save",
  openPalStatus: "View all Pals",
  worldActive: "The world is still running",
  emptyWorldMessage: (count) => `No players are online. ${count} base Pals are still working and moving around.`,
  onlineWorldMessage: (players, pals) => `${players} players and ${pals} base Pals are keeping the world active.`,
  noWorkers: "No base Pals were found. Check the save source or parse the save again.",
  worldUnavailable: "Base data is temporarily unavailable. Player and host telemetry will keep refreshing.",
  task: "Current state",
  base: "Base",
  hunger: "Hunger",
  sanity: "SAN",
  autonomous: "Autonomous",
  workingState: "Working",
  restingState: "Resting",
  eatingState: "Eating",
  attentionState: "Needs attention",
  host: "Host headroom",
  hostHint: "More headroom keeps the world stable",
  protection: "Protection & automation",
  activeTasks: "Enabled tasks",
  latestBackup: "Latest backup",
  backupCount: "Backups",
  never: "Never backed up",
  playersNow: "Players online now",
  playersHint: "Player connections are only one part of world activity",
  viewPlayers: "Manage players",
  unavailable: "Host telemetry unavailable",
  liveUnavailable: "Live data is incomplete. Check the REST API in PST Configuration.",
  openSettings: "Open PST Configuration",
  cores: "cores",
  healthy: "Healthy",
});

const asArray = (value) => Array.isArray(value) ? value : [];
const serverOnline = computed(() =>
  typeof props.serverInfo?.available === "boolean"
    ? props.serverInfo.available
    : Boolean(props.serverInfo?.name),
);
const liveDataIncomplete = computed(() =>
  props.serverInfo?.available === false || props.serverMetrics?.available === false,
);
const currentPlayers = computed(() => Number(props.serverMetrics?.current_player_num ?? onlinePlayers.value.length ?? 0));
const maxPlayers = computed(() => Number(props.serverMetrics?.max_player_num || 0));
const fps = computed(() => Number(props.serverMetrics?.server_fps || 0));
const latestBackup = computed(() => [...backups.value].sort((a, b) => new Date(b.save_time) - new Date(a.save_time))[0]);
const activeTasks = computed(() => tasks.value.filter((task) => task.enabled));
const enrichedBases = computed(() => bases.value.map((base) => ({
  ...base,
  workers: enrichPals((Array.isArray(base.workers) ? base.workers : []).map((worker) => ({
    ...worker,
    base_name: base.display_name || base.name || base.id,
    location_kind: "base",
  }))),
})));
const workers = computed(() => buildPalWorkerRows(enrichedBases.value));
const workingCount = computed(() => workers.value.filter((row) => ["working", "assigned"].includes(row.activityKind)).length);
const attentionCount = computed(() => workers.value.filter((row) => row.attention).length);
const baseSummaries = computed(() => enrichedBases.value
  .map((base, index) => {
    const rows = workers.value.filter((row) => row.baseId === String(base.id || `base-${index + 1}`));
    return {
      id: String(base.id || `base-${index + 1}`),
      name: base.display_name || base.name || base.id || `Base ${index + 1}`,
      total: rows.length,
      working: rows.filter((row) => ["working", "assigned"].includes(row.activityKind)).length,
      attention: rows.filter((row) => row.attention).length,
    };
  })
  .filter((base) => base.total));
const workerPreview = computed(() => [...workers.value]
  .sort((a, b) => Number(b.attention) - Number(a.attention) || Number(["working", "assigned"].includes(b.activityKind)) - Number(["working", "assigned"].includes(a.activityKind)))
  .slice(0, 8));
const worldMessage = computed(() => currentPlayers.value
  ? copy.value.onlineWorldMessage(currentPlayers.value, workers.value.length)
  : copy.value.emptyWorldMessage(workers.value.length));
const resourceRows = computed(() => [
  { key: "cpu", icon: Cpu, label: "CPU", value: Number(hostMetrics.value?.cpu?.usedPercent || 0), detail: `${hostMetrics.value?.cpu?.cores || 0} ${copy.value.cores}` },
  { key: "memory", icon: DeviceDesktopAnalytics, label: zh.value ? "内存" : "Memory", value: Number(hostMetrics.value?.memory?.usedPercent || 0), detail: `${formatBytes(hostMetrics.value?.memory?.used)} / ${formatBytes(hostMetrics.value?.memory?.total)}` },
  { key: "disk", icon: Database, label: zh.value ? "磁盘" : "Disk", value: Number(hostMetrics.value?.disk?.usedPercent || 0), detail: hostMetrics.value?.disk ? `${formatBytes(hostMetrics.value.disk.used)} / ${formatBytes(hostMetrics.value.disk.total)}` : "-" },
]);
const pulseItems = computed(() => [
  { key: "server", icon: Server, label: serverOnline.value ? copy.value.online : copy.value.offline, value: serverOnline.value ? "LIVE" : "OFF", tone: serverOnline.value ? "success" : "danger" },
  { key: "fps", icon: Activity, label: copy.value.fps, value: fps.value.toFixed(1), tone: fps.value >= 50 ? "info" : "warning" },
  { key: "players", icon: Users, label: copy.value.players, value: maxPlayers.value ? `${currentPlayers.value}/${maxPlayers.value}` : String(currentPlayers.value), tone: "neutral" },
  { key: "pals", icon: Paw, label: copy.value.pals, value: `${workingCount.value}/${workers.value.length}`, tone: "accent" },
  { key: "attention", icon: AlertTriangle, label: copy.value.attention, value: String(attentionCount.value), tone: attentionCount.value ? "warning" : "success" },
  { key: "uptime", icon: Tools, label: copy.value.uptime, value: formatUptime(props.serverMetrics?.uptime), tone: "neutral" },
]);

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}
function formatUptime(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (zh.value) return days ? `${days}天 ${hours}小时` : `${hours}小时 ${minutes}分`;
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}
const formatDate = (value) => value ? dayjs(value).format("YYYY-MM-DD HH:mm") : copy.value.never;
const initials = (name) => String(name || "?").trim().slice(0, 2).toUpperCase();
const resourceTone = (value) => value >= 95 ? "danger" : value >= 80 ? "warning" : "normal";
const workerTone = (row) => {
  if (row.attention) return "attention";
  if (["working", "assigned"].includes(row.activityKind)) return "working";
  if (["sleeping", "resting"].includes(row.activityKind)) return "resting";
  if (row.activityKind === "eating") return "eating";
  return "autonomous";
};
const workerState = (row) => {
  if (row.attention) return copy.value.attentionState;
  if (["working", "assigned"].includes(row.activityKind)) return row.activityLabel && row.activityLabel !== "-" ? row.activityLabel : copy.value.workingState;
  if (["sleeping", "resting"].includes(row.activityKind)) return copy.value.restingState;
  if (row.activityKind === "eating") return copy.value.eatingState;
  return row.activityLabel && row.activityLabel !== "-" ? row.activityLabel : copy.value.autonomous;
};
const rounded = (value) => value == null ? "-" : `${Math.round(Number(value))}%`;
const useFallback = (event) => {
  if (event.target.src !== unknownPal) event.target.src = unknownPal;
};

const refresh = async () => {
  loading.value = true;
  const [online, backup, rconTasks, host, world] = await Promise.allSettled([
    api.getOnlinePlayerList(),
    api.getBackupList({}),
    api.getRconTasks(),
    api.getHostMetrics(),
    api.getWorldData(),
  ]);
  if (online.status === "fulfilled") onlinePlayers.value = asArray(online.value.data.value);
  if (backup.status === "fulfilled") backups.value = asArray(backup.value.data.value);
  if (rconTasks.status === "fulfilled") tasks.value = asArray(rconTasks.value.data.value);
  if (host.status === "fulfilled") hostMetrics.value = host.value.data.value?.metrics || {};
  if (world.status === "fulfilled") {
    bases.value = asArray(world.value.data.value?.data?.bases);
    worldDataError.value = false;
  } else {
    worldDataError.value = true;
  }
  loading.value = false;
};

onMounted(() => {
  refresh();
  refreshTimer = setInterval(() => refresh().catch(() => {}), 30000);
});
onBeforeUnmount(() => clearInterval(refreshTimer));
</script>

<template>
  <div class="world-console">
    <header class="world-console__header">
      <div>
        <div class="world-console__state"><span :class="{ online: serverOnline }" />{{ serverOnline ? copy.online : copy.offline }}</div>
        <h2>{{ copy.title }}</h2>
        <p>{{ copy.subtitle }}</p>
      </div>
      <n-button secondary :loading="loading" :aria-label="copy.refresh" @click="refresh">
        <template #icon><n-icon><Refresh /></n-icon></template>{{ copy.refresh }}
      </n-button>
    </header>

    <n-alert v-if="liveDataIncomplete" type="warning" class="world-console__alert">
      {{ copy.liveUnavailable }}
      <template #action><n-button text type="warning" @click="emit('navigate', 'settings')">{{ copy.openSettings }}</n-button></template>
    </n-alert>

    <section class="world-pulse" :aria-label="copy.title">
      <div v-for="item in pulseItems" :key="item.key" class="world-pulse__item" :class="`is-${item.tone}`">
        <n-icon><component :is="item.icon" /></n-icon>
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </section>

    <div class="world-console__layout">
      <section class="world-floor" aria-labelledby="base-shifts-title">
        <header class="section-heading">
          <div>
            <h3 id="base-shifts-title">{{ copy.bases }}</h3>
            <p>{{ copy.basesHint }}</p>
          </div>
          <button type="button" class="text-action" @click="emit('navigate', 'pal-status')">{{ copy.openPalStatus }}<n-icon><ChevronRight /></n-icon></button>
        </header>

        <div class="world-running-note" :class="{ 'has-players': currentPlayers }">
          <n-icon><Activity /></n-icon>
          <div><strong>{{ copy.worldActive }}</strong><span>{{ worldMessage }}</span></div>
        </div>

        <div v-if="baseSummaries.length" class="base-shift-strip" aria-label="Base activity summary">
          <div v-for="base in baseSummaries" :key="base.id" class="base-shift">
            <span>{{ base.name }}</span>
            <strong>{{ base.working }}/{{ base.total }}</strong>
            <small>{{ base.attention ? `${base.attention} ${copy.attention}` : copy.healthy }}</small>
          </div>
        </div>

        <n-alert v-if="worldDataError" type="warning" :bordered="false">{{ copy.worldUnavailable }}</n-alert>
        <div v-if="workerPreview.length" class="worker-roster" :aria-busy="loading">
          <button v-for="row in workerPreview" :key="row.id" type="button" class="worker-row" @click="emit('navigate', 'pal-status')">
            <span class="worker-row__portrait"><img :src="palPortrait(row.assetKey)" :alt="row.speciesName" loading="lazy" @error="useFallback" /><i :class="`is-${workerTone(row)}`" /></span>
            <span class="worker-row__identity"><strong>{{ row.name }}</strong><small>{{ row.speciesName }} · Lv.{{ row.level || '-' }}</small></span>
            <span class="worker-row__assignment"><small>{{ copy.task }}</small><strong>{{ workerState(row) }}</strong></span>
            <span class="worker-row__base"><small>{{ copy.base }}</small><strong>{{ row.baseName }}</strong></span>
            <span class="worker-row__vital"><small>{{ copy.hunger }}</small><span><i :style="{ width: `${row.hunger ?? 0}%` }" /><b>{{ rounded(row.hunger) }}</b></span></span>
            <span class="worker-row__vital"><small>{{ copy.sanity }}</small><span><i :style="{ width: `${row.sanity ?? 0}%` }" /><b>{{ rounded(row.sanity) }}</b></span></span>
            <n-icon class="worker-row__arrow"><ChevronRight /></n-icon>
          </button>
        </div>
        <div v-else-if="!loading" class="world-empty"><n-icon><Paw /></n-icon><span>{{ copy.noWorkers }}</span></div>

        <section v-if="onlinePlayers.length" class="online-roster">
          <header><div><h4>{{ copy.playersNow }}</h4><p>{{ copy.playersHint }}</p></div><button type="button" class="text-action" @click="emit('navigate', 'players')">{{ copy.viewPlayers }}<n-icon><ChevronRight /></n-icon></button></header>
          <div><button v-for="player in onlinePlayers.slice(0, 6)" :key="player.player_uid" type="button" @click="emit('navigate', 'players')"><i>{{ initials(player.nickname) }}</i><span><strong>{{ player.nickname || player.player_uid }}</strong><small>Lv.{{ player.level ?? "-" }}</small></span></button></div>
        </section>
      </section>

      <aside class="world-side-rail">
        <section class="rail-section">
          <header class="section-heading"><div><h3>{{ copy.host }}</h3><p>{{ hostMetrics.hostname || copy.hostHint }}</p></div><n-icon><Server /></n-icon></header>
          <div v-if="!hostMetrics.unavailable" class="resource-stack">
            <div v-for="resource in resourceRows" :key="resource.key" class="resource-row" :class="`is-${resourceTone(resource.value)}`">
              <div><span><n-icon><component :is="resource.icon" /></n-icon>{{ resource.label }}</span><strong>{{ resource.value.toFixed(1) }}%</strong></div>
              <div class="resource-row__bar" role="progressbar" :aria-label="resource.label" :aria-valuenow="resource.value" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: `${Math.min(100, resource.value)}%` }" /></div>
              <small>{{ resource.detail }}</small>
            </div>
          </div>
          <div v-else class="rail-empty"><n-icon><Activity /></n-icon>{{ copy.unavailable }}</div>
        </section>

        <section class="rail-section protection-section">
          <header class="section-heading"><div><h3>{{ copy.protection }}</h3><p>{{ zh ? "备份与计划任务" : "Backups and scheduled tasks" }}</p></div><n-icon><ShieldCheck /></n-icon></header>
          <dl>
            <div><dt><n-icon><Tools /></n-icon>{{ copy.activeTasks }}</dt><dd>{{ activeTasks.length }}</dd></div>
            <div><dt><n-icon><Archive /></n-icon>{{ copy.latestBackup }}</dt><dd>{{ formatDate(latestBackup?.save_time) }}</dd></div>
            <div><dt><n-icon><Database /></n-icon>{{ copy.backupCount }}</dt><dd>{{ backups.length }}</dd></div>
          </dl>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.world-console { width: 100%; max-width: 1760px; margin: 0 auto; padding: 24px 28px 36px; }
.world-console__header, .section-heading, .online-roster > header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.world-console__header { margin-bottom: 18px; }
.world-console__state { display: flex; align-items: center; gap: 7px; color: var(--app-ink-secondary); font-size: 12px; font-weight: 650; }
.world-console__state > span { width: 8px; height: 8px; background: var(--app-warning); border-radius: 50%; }
.world-console__state > span.online { background: var(--app-success); box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-success) 14%, transparent); }
.world-console h2 { margin-top: 4px; color: var(--app-ink); font-family: var(--app-font-display); font-size: 24px; line-height: 1.2; text-wrap: balance; }
.world-console__header p { margin-top: 3px; color: var(--app-ink-muted); font-size: 13px; }
.world-console__alert { margin-bottom: 14px; }
.world-pulse { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-bottom: 16px; overflow: hidden; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; }
.world-pulse__item { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; min-width: 0; min-height: 64px; align-items: center; gap: 8px; padding: 10px 14px; border-right: 1px solid var(--app-border); }
.world-pulse__item:last-child { border-right: 0; }
.world-pulse__item .n-icon { color: var(--app-ink-muted); font-size: 18px; }
.world-pulse__item span { overflow: hidden; color: var(--app-ink-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.world-pulse__item strong { color: var(--app-ink); font-family: var(--app-font-data); font-size: 15px; font-variant-numeric: tabular-nums; }
.world-pulse__item.is-success .n-icon, .world-pulse__item.is-success strong { color: var(--app-success); }
.world-pulse__item.is-warning .n-icon, .world-pulse__item.is-warning strong { color: var(--app-warning); }
.world-pulse__item.is-danger .n-icon, .world-pulse__item.is-danger strong { color: var(--app-danger); }
.world-pulse__item.is-info .n-icon, .world-pulse__item.is-info strong { color: var(--app-info); }
.world-pulse__item.is-accent .n-icon, .world-pulse__item.is-accent strong { color: var(--app-accent); }
.world-console__layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 340px); align-items: start; gap: 16px; }
.world-floor, .rail-section { min-width: 0; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; }
.world-floor { padding: 20px; }
.section-heading { min-height: 42px; }
.section-heading h3 { color: var(--app-ink); font-size: 15px; line-height: 1.3; }
.section-heading p { margin-top: 3px; color: var(--app-ink-muted); font-size: 11px; }
.section-heading > .n-icon { color: var(--app-accent); font-size: 20px; }
.text-action { display: inline-flex; min-height: 40px; flex: 0 0 auto; align-items: center; gap: 3px; padding: 0 4px; color: var(--app-accent); background: transparent; border: 0; cursor: pointer; font-size: 12px; font-weight: 650; white-space: nowrap; }
.text-action .n-icon { font-size: 16px; transition: transform 180ms cubic-bezier(.22,1,.36,1); }
.text-action:hover .n-icon { transform: translateX(2px); }
.text-action:focus-visible, .worker-row:focus-visible, .online-roster button:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.world-running-note { display: flex; align-items: center; gap: 12px; margin-top: 16px; padding: 13px 14px; color: color-mix(in srgb, var(--app-accent) 72%, var(--app-ink)); background: var(--app-accent-soft); border-radius: 8px; }
.world-running-note.has-players { color: color-mix(in srgb, var(--app-info) 72%, var(--app-ink)); background: var(--app-info-soft); }
.world-running-note > .n-icon { flex: 0 0 auto; font-size: 22px; }
.world-running-note div { display: grid; gap: 2px; }
.world-running-note strong { font-size: 12px; }
.world-running-note span { font-size: 11px; line-height: 1.45; }
.base-shift-strip { display: flex; gap: 8px; margin: 14px 0; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
.base-shift { display: grid; min-width: 148px; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 10px; padding: 9px 11px; background: var(--app-surface-muted); border-radius: 8px; }
.base-shift > span { overflow: hidden; color: var(--app-ink-secondary); font-size: 11px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.base-shift > strong { color: var(--app-accent); font-family: var(--app-font-data); font-size: 12px; }
.base-shift > small { grid-column: 1 / -1; color: var(--app-ink-muted); font-size: 10px; }
.worker-roster { margin-top: 14px; border-top: 1px solid var(--app-border); }
.worker-row { display: grid; width: 100%; min-height: 64px; grid-template-columns: 42px minmax(110px, 1.05fr) minmax(130px, 1.2fr) minmax(110px, .9fr) minmax(86px, .65fr) minmax(86px, .65fr) 20px; align-items: center; gap: 12px; padding: 8px 4px; color: var(--app-ink); background: transparent; border: 0; border-bottom: 1px solid var(--app-border); cursor: pointer; text-align: left; transition: background-color 160ms ease; }
.worker-row:last-child { border-bottom: 0; }
.worker-row:hover { background: var(--app-surface-muted); }
.worker-row__portrait { position: relative; display: grid; width: 40px; height: 40px; place-items: center; overflow: hidden; background: var(--app-surface-muted); border-radius: 9px; }
.worker-row__portrait img { width: 100%; height: 100%; object-fit: contain; }
.worker-row__portrait i { position: absolute; right: 3px; bottom: 3px; width: 8px; height: 8px; background: var(--app-info); border: 2px solid var(--app-surface); border-radius: 50%; }
.worker-row__portrait i.is-working { background: var(--app-success); }.worker-row__portrait i.is-attention { background: var(--app-warning); }.worker-row__portrait i.is-resting { background: var(--app-info); }
.worker-row__identity, .worker-row__assignment, .worker-row__base, .worker-row__vital { display: grid; min-width: 0; gap: 3px; }
.worker-row strong { overflow: hidden; font-size: 11px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.worker-row small { overflow: hidden; color: var(--app-ink-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.worker-row__identity > strong { color: var(--app-ink); font-size: 12px; }
.worker-row__assignment > strong { color: var(--app-success); }
.worker-row__vital > span { position: relative; height: 18px; overflow: hidden; background: var(--app-surface-muted); border-radius: 4px; }
.worker-row__vital > span i { position: absolute; inset: 0 auto 0 0; max-width: 100%; background: color-mix(in srgb, var(--app-accent) 22%, transparent); }
.worker-row__vital > span b { position: relative; display: block; padding: 2px 5px; color: var(--app-ink-secondary); font-family: var(--app-font-data); font-size: 9px; text-align: right; }
.worker-row__arrow { color: var(--app-ink-muted); font-size: 16px; }
.world-empty { display: flex; min-height: 220px; align-items: center; justify-content: center; gap: 9px; color: var(--app-ink-muted); font-size: 12px; text-align: center; }
.world-empty .n-icon { font-size: 28px; }
.online-roster { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--app-border); }
.online-roster h4 { color: var(--app-ink); font-size: 13px; }.online-roster p { margin-top: 2px; color: var(--app-ink-muted); font-size: 10px; }
.online-roster > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.online-roster > div button { display: flex; min-width: 150px; min-height: 48px; flex: 1 1 160px; align-items: center; gap: 9px; padding: 7px 9px; color: var(--app-ink); background: var(--app-surface-muted); border: 0; border-radius: 8px; cursor: pointer; text-align: left; }
.online-roster button > i { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; color: var(--app-accent); background: var(--app-accent-soft); border-radius: 7px; font-size: 9px; font-style: normal; font-weight: 800; }
.online-roster button > span { display: grid; min-width: 0; }.online-roster button strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.online-roster button small { color: var(--app-ink-muted); font-size: 9px; }
.world-side-rail { display: grid; gap: 16px; }
.rail-section { padding: 18px; }
.resource-stack { display: grid; gap: 17px; margin-top: 18px; }
.resource-row > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.resource-row > div:first-child span { display: flex; align-items: center; gap: 7px; color: var(--app-ink-secondary); font-size: 11px; font-weight: 650; }
.resource-row > div:first-child .n-icon { color: var(--app-accent); font-size: 15px; }
.resource-row > div:first-child strong { font-family: var(--app-font-data); font-size: 12px; }
.resource-row__bar { height: 5px; margin-top: 7px; overflow: hidden; background: var(--app-surface-muted); border-radius: 5px; }
.resource-row__bar i { display: block; height: 100%; background: var(--app-accent); border-radius: inherit; transition: width 260ms cubic-bezier(.22,1,.36,1); }
.resource-row > small { display: block; margin-top: 4px; color: var(--app-ink-muted); font-size: 9px; }
.resource-row.is-warning .resource-row__bar i { background: var(--app-warning); }.resource-row.is-danger .resource-row__bar i { background: var(--app-danger); }
.protection-section dl { display: grid; margin-top: 14px; }
.protection-section dl > div { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--app-border); }
.protection-section dl > div:last-child { border-bottom: 0; }
.protection-section dt { display: flex; align-items: center; gap: 7px; color: var(--app-ink-muted); font-size: 10px; }.protection-section dt .n-icon { color: var(--app-accent); font-size: 14px; }
.protection-section dd { max-width: 150px; overflow: hidden; color: var(--app-ink); font-family: var(--app-font-data); font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.rail-empty { display: flex; min-height: 150px; align-items: center; justify-content: center; gap: 8px; color: var(--app-ink-muted); font-size: 11px; }
@media (max-width: 1260px) { .world-pulse { grid-template-columns: repeat(3, 1fr); }.world-pulse__item:nth-child(3) { border-right: 0; }.world-pulse__item:nth-child(-n+3) { border-bottom: 1px solid var(--app-border); }.worker-row { grid-template-columns: 42px minmax(110px, 1fr) minmax(120px, 1.1fr) minmax(100px, .9fr) 20px; }.worker-row__vital { display: none; } }
@media (max-width: 920px) { .world-console { padding: 18px 16px 28px; }.world-console__layout { grid-template-columns: 1fr; }.world-side-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); }.worker-row { grid-template-columns: 42px minmax(100px, 1fr) minmax(120px, 1.1fr) minmax(100px, .9fr) 20px; } }
@media (max-width: 620px) { .world-console { padding: 14px 12px 90px; }.world-console__header { align-items: flex-start; }.world-console__header .n-button { width: 44px; min-width: 44px; padding: 0; }.world-console__header .n-button :deep(.n-button__content) { font-size: 0; }.world-console h2 { font-size: 20px; }.world-pulse { grid-template-columns: repeat(2, 1fr); }.world-pulse__item, .world-pulse__item:nth-child(3) { min-height: 58px; border-right: 1px solid var(--app-border); border-bottom: 1px solid var(--app-border); }.world-pulse__item:nth-child(even) { border-right: 0; }.world-pulse__item:nth-last-child(-n+2) { border-bottom: 0; }.world-floor { padding: 15px; }.section-heading { align-items: flex-start; gap: 10px; }.section-heading > div { min-width: 0; }.section-heading p { max-width: 42ch; }.base-shift-strip { margin-inline: -15px; padding-inline: 15px; }.worker-row { min-height: 58px; grid-template-columns: 38px minmax(0, 1fr) minmax(92px, .85fr) 16px; gap: 9px; }.worker-row__portrait { width: 36px; height: 36px; }.worker-row__base, .worker-row__vital { display: none; }.worker-row__assignment { text-align: right; }.world-side-rail { grid-template-columns: 1fr; }.online-roster > div { display: grid; grid-template-columns: 1fr 1fr; }.online-roster > div button { min-width: 0; }.world-running-note { align-items: flex-start; } }
@media (prefers-reduced-motion: reduce) { .text-action .n-icon, .resource-row__bar i { transition: none; } }
</style>
