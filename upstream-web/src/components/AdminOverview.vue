<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";
import {
  Activity,
  Archive,
  Cpu,
  Database,
  DeviceDesktopAnalytics,
  Refresh,
  Server,
  Users,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import elecpanda from "@/assets/pals/elecpanda.png";

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
const fpsHistory = ref([]);
let refreshTimer;

const zh = computed(() => locale.value === "zh");
const copy = computed(() => zh.value ? {
  controlRoom: "服务器概览",
  refresh: "刷新数据",
  online: "服务器在线",
  offline: "服务器离线",
  onlinePlayers: "在线玩家",
  serverFps: "当前 FPS",
  uptime: "运行时长",
  playerActivity: "在线玩家动态",
  playerActivityHint: "实时读取当前连接的玩家",
  noPlayers: "帕鲁们都在休息，当前没有玩家在线",
  host: "主机负载",
  hostHint: "CPU、内存与磁盘实时使用情况",
  automation: "自动化与保护",
  automationHint: "备份与定时任务一目了然",
  activeTasks: "启用任务",
  latestBackup: "最近备份",
  never: "从未备份",
  target: "目标 60 FPS",
  playersTotal: "玩家总数",
  unavailable: "暂无主机数据",
} : {
  controlRoom: "Server overview",
  refresh: "Refresh",
  online: "Server online",
  offline: "Server offline",
  onlinePlayers: "Online players",
  serverFps: "Current FPS",
  uptime: "Uptime",
  playerActivity: "Live player activity",
  playerActivityHint: "Players currently connected to this server",
  noPlayers: "The Pals are resting. No players are online right now.",
  host: "Host load",
  hostHint: "Live CPU, memory, and disk usage",
  automation: "Automation & protection",
  automationHint: "Backups and scheduled work at a glance",
  activeTasks: "Active tasks",
  latestBackup: "Latest backup",
  never: "Never backed up",
  target: "60 FPS target",
  playersTotal: "Total players",
  unavailable: "Host metrics unavailable",
});

const asArray = (value) => Array.isArray(value) ? value : [];
const serverOnline = computed(() => Boolean(props.serverInfo?.name));
const currentPlayers = computed(() => Number(props.serverMetrics?.current_player_num ?? onlinePlayers.value.length ?? 0));
const maxPlayers = computed(() => Number(props.serverMetrics?.max_player_num || 0));
const fps = computed(() => Number(props.serverMetrics?.server_fps || 0));
const fpsPercent = computed(() => Math.min(100, Math.max(0, (fps.value / 60) * 100)));
const latestBackup = computed(() => [...backups.value].sort((a, b) => new Date(b.save_time) - new Date(a.save_time))[0]);
const activeTasks = computed(() => tasks.value.filter((task) => task.enabled));
const resourceRows = computed(() => [
  { key: "cpu", icon: Cpu, label: "CPU", value: Number(hostMetrics.value?.cpu?.usedPercent || 0), detail: `${hostMetrics.value?.cpu?.cores || 0} ${zh.value ? "核心" : "cores"}` },
  { key: "memory", icon: DeviceDesktopAnalytics, label: zh.value ? "内存" : "Memory", value: Number(hostMetrics.value?.memory?.usedPercent || 0), detail: `${formatBytes(hostMetrics.value?.memory?.used)} / ${formatBytes(hostMetrics.value?.memory?.total)}` },
  { key: "disk", icon: Database, label: zh.value ? "磁盘" : "Disk", value: Number(hostMetrics.value?.disk?.usedPercent || 0), detail: hostMetrics.value?.disk ? `${formatBytes(hostMetrics.value.disk.used)} / ${formatBytes(hostMetrics.value.disk.total)}` : "-" },
]);

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
};
const formatUptime = (seconds) => {
  const total = Math.max(0, Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return days ? `${days}${zh.value ? "天" : "d"} ${hours}${zh.value ? "小时" : "h"}` : `${hours}${zh.value ? "小时" : "h"} ${minutes}${zh.value ? "分" : "m"}`;
};
const formatDate = (value) => value ? dayjs(value).format("YYYY-MM-DD HH:mm") : copy.value.never;
const initials = (name) => String(name || "?").trim().slice(0, 2).toUpperCase();
const metricTone = (value) => value >= 95 ? "is-danger" : value >= 80 ? "is-warning" : "is-normal";
const fpsAreaPath = computed(() => {
  const samples = fpsHistory.value.length ? fpsHistory.value : [fps.value];
  const values = [...Array(Math.max(12 - samples.length, 0)).fill(samples[0] || 0), ...samples].slice(-12);
  return values.map((value, index) => {
    const x = (index / (values.length - 1 || 1)) * 220;
    const y = 52 - Math.min(52, Math.max(0, value / 60 * 46));
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
});

watch(fps, (value) => {
  fpsHistory.value = [...fpsHistory.value, value].slice(-12);
}, { immediate: true });

const refresh = async () => {
  loading.value = true;
  try {
    const [online, backup, rconTasks, host] = await Promise.all([
      api.getOnlinePlayerList(),
      api.getBackupList({}),
      api.getRconTasks(),
      api.getHostMetrics(),
    ]);
    onlinePlayers.value = asArray(online.data.value);
    backups.value = asArray(backup.data.value);
    tasks.value = asArray(rconTasks.data.value);
    hostMetrics.value = host.data.value?.metrics || {};
  } finally { loading.value = false; }
};

onMounted(() => {
  refresh();
  refreshTimer = setInterval(() => refresh().catch(() => {}), 30000);
});
onBeforeUnmount(() => clearInterval(refreshTimer));
</script>

<template>
  <div class="bento-overview">
    <header class="bento-overview__header">
      <div>
        <div class="bento-overview__eyebrow"><span class="bento-overview__dot" :class="{ 'is-online': serverOnline }"></span>{{ serverOnline ? copy.online : copy.offline }}</div>
        <h2>{{ copy.controlRoom }}</h2>
        <p>{{ serverInfo?.version || copy.controlRoom }}</p>
      </div>
      <n-button secondary size="small" :loading="loading" @click="refresh"><template #icon><n-icon><Refresh /></n-icon></template>{{ copy.refresh }}</n-button>
    </header>

    <div class="bento-overview__metrics">
      <section class="bento-card bento-stat bento-stat--players">
        <span>{{ copy.onlinePlayers }}</span>
        <strong>{{ currentPlayers }}<small v-if="maxPlayers">/{{ maxPlayers }}</small></strong>
        <div class="bento-player-faces" aria-hidden="true"><i v-for="player in onlinePlayers.slice(0, 4)" :key="player.player_uid">{{ initials(player.nickname) }}</i></div>
      </section>
      <section class="bento-card bento-stat">
        <span>{{ copy.serverFps }}</span>
        <strong>{{ fps.toFixed(1) }}</strong>
        <svg class="bento-fps-chart" viewBox="0 0 220 60" preserveAspectRatio="none" aria-hidden="true"><path class="bento-fps-chart__area" :d="`${fpsAreaPath} L220 60 L0 60 Z`" /><path class="bento-fps-chart__line" :d="fpsAreaPath" /></svg>
        <small>{{ copy.target }}</small>
      </section>
      <section class="bento-card bento-stat">
        <span>{{ copy.uptime }}</span>
        <strong>{{ formatUptime(serverMetrics?.uptime) }}</strong>
        <small>{{ serverOnline ? copy.online : copy.offline }}</small>
      </section>
    </div>

    <div class="bento-overview__body">
      <section class="bento-card bento-players">
        <header class="bento-card__header"><div><h3>{{ copy.playerActivity }}</h3><p>{{ copy.playerActivityHint }}</p></div><span>{{ currentPlayers }}</span></header>
        <div v-if="onlinePlayers.length" class="bento-player-table">
          <div class="bento-player-table__head"><span>Player ID</span><span>Level</span><span>Status</span><span>IP</span></div>
          <button v-for="player in onlinePlayers.slice(0, 7)" :key="player.player_uid" type="button" class="bento-player-row" @click="emit('navigate', 'players')"><span><i>{{ initials(player.nickname) }}</i>{{ player.nickname || player.player_uid }}</span><b>Lv.{{ player.level ?? "-" }}</b><em>{{ zh ? "在线" : "Online" }}</em><small>{{ player.ip || "-" }}</small></button>
        </div>
        <div v-else class="bento-empty"><img :src="elecpanda" alt="" /><span>{{ copy.noPlayers }}</span></div>
      </section>

      <section class="bento-card bento-host">
        <header class="bento-card__header"><div><h3>{{ copy.host }}</h3><p>{{ hostMetrics.hostname || copy.hostHint }}</p></div><n-icon><Server /></n-icon></header>
        <div v-if="!hostMetrics.unavailable" class="bento-resource-list">
          <div v-for="resource in resourceRows" :key="resource.key" class="bento-resource" :class="metricTone(resource.value)"><div class="bento-resource__label"><span><n-icon><component :is="resource.icon" /></n-icon>{{ resource.label }}</span></div><div class="bento-resource__visual"><svg class="bento-gauge" viewBox="0 0 120 70" aria-hidden="true"><path class="bento-gauge__track" d="M10 60 A50 50 0 0 1 110 60" /><path class="bento-gauge__value" :style="{ strokeDasharray: `${Math.min(100, resource.value) * 1.57} 157` }" d="M10 60 A50 50 0 0 1 110 60" /></svg><div><strong>{{ resource.value.toFixed(1) }}%</strong><small>{{ resource.detail }}</small></div></div><div class="bento-resource__bar"><i :style="{ width: `${Math.min(100, resource.value)}%` }"></i></div></div>
        </div>
        <div v-else class="bento-empty"><n-icon><Activity /></n-icon><span>{{ copy.unavailable }}</span></div>
      </section>

      <section class="bento-card bento-automation">
        <header class="bento-card__header"><div><h3>{{ copy.automation }}</h3><p>{{ copy.automationHint }}</p></div><n-icon><Archive /></n-icon></header>
        <dl><div><dt>{{ copy.activeTasks }}</dt><dd>{{ activeTasks.length }}</dd></div><div><dt>{{ copy.latestBackup }}</dt><dd>{{ formatDate(latestBackup?.save_time) }}</dd></div><div><dt>{{ zh ? "备份数量" : "Backup count" }}</dt><dd>{{ backups.length }}</dd></div></dl>
      </section>

    </div>
  </div>
</template>

<style scoped>
.bento-overview { width: min(1540px, 100%); margin: 0 auto; padding: 32px; }
.bento-overview__header, .bento-card__header, .bento-resource__label { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.bento-overview__header { margin-bottom: 20px; }
.bento-overview__eyebrow { display: flex; align-items: center; gap: 7px; color: var(--app-ink-muted); font-size: 12px; font-weight: 650; }
.bento-overview__dot { width: 8px; height: 8px; background: var(--app-warning); border-radius: 50%; }
.bento-overview__dot.is-online { background: var(--app-success); }
.bento-overview h2 { margin-top: 5px; color: var(--app-ink); font-family: var(--app-font-display); font-size: 24px; line-height: 1.2; }
.bento-overview__header p, .bento-card__header p { margin-top: 4px; color: var(--app-ink-muted); font-size: 12px; }
.bento-overview__metrics { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.bento-overview__body { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(290px, 1fr); gap: 20px; }
.bento-card { min-width: 0; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; box-shadow: var(--app-shadow-sm); transition: transform 180ms cubic-bezier(.22,1,.36,1), box-shadow 180ms cubic-bezier(.22,1,.36,1); }
.bento-card:hover { box-shadow: 0 6px 8px rgb(30 41 59 / 10%); transform: translateY(-5px); }
.bento-stat { position: relative; min-height: 154px; padding: 24px; overflow: hidden; }
.bento-stat > span { display: block; color: var(--app-ink-secondary); font-size: 13px; font-weight: 650; }
.bento-stat > strong { display: block; margin-top: 8px; color: var(--app-ink); font-family: var(--app-font-data); font-size: 36px; line-height: 1; font-variant-numeric: tabular-nums; }
.bento-stat > strong small { margin-left: 3px; color: var(--app-ink-muted); font-size: 18px; }
.bento-stat > small { display: block; margin-top: 15px; color: var(--app-ink-muted); font-size: 11px; }
.bento-stat--players { background: var(--app-surface-raised); }
.bento-player-faces { position: absolute; top: 20px; right: 20px; display: flex; }
.bento-player-faces i, .bento-player-row i { display: grid; place-items: center; color: var(--app-accent); background: var(--app-accent-soft); border: 2px solid var(--app-surface); border-radius: 50%; font-size: 9px; font-style: normal; font-weight: 800; }
.bento-player-faces i { width: 26px; height: 26px; margin-left: -7px; }
.bento-fps-chart { position: absolute; right: 0; bottom: 0; left: 0; width: 100%; height: 66px; opacity: .8; }
.bento-fps-chart__area { fill: color-mix(in srgb, var(--app-accent) 20%, transparent); }.bento-fps-chart__line { fill: none; stroke: var(--app-accent); stroke-width: 2.5; vector-effect: non-scaling-stroke; }
.bento-resource__bar { height: 6px; overflow: hidden; background: var(--app-surface-muted); border-radius: 5px; }.bento-resource__bar i { display: block; height: 100%; background: var(--app-accent); border-radius: inherit; transition: width 300ms ease-in-out; }
.bento-players { grid-column: 1 / 3; grid-row: 1 / span 2; min-height: 390px; padding: 24px; }
.bento-card__header { padding-bottom: 16px; border-bottom: 1px solid var(--app-border); }
.bento-card__header h3 { color: var(--app-ink); font-size: 15px; }
.bento-card__header > span, .bento-card__header > .n-icon { color: var(--app-accent); font-size: 20px; }
.bento-card__header > span { display: grid; min-width: 30px; height: 30px; place-items: center; background: var(--app-accent-soft); border-radius: 6px; font-family: var(--app-font-data); font-size: 13px; }
.bento-player-table__head, .bento-player-row { display: grid; grid-template-columns: minmax(140px, 1.2fr) 70px 74px minmax(90px, .8fr); gap: 12px; align-items: center; }
.bento-player-table__head { padding: 14px 8px 8px; color: var(--app-ink-muted); font-size: 11px; }
.bento-player-row { width: 100%; min-height: 50px; padding: 8px; color: var(--app-ink); background: transparent; border: 0; border-top: 1px solid var(--app-border); cursor: pointer; text-align: left; }
.bento-player-row:hover { background: var(--app-surface-muted); }
.bento-player-row > span { display: flex; min-width: 0; align-items: center; gap: 9px; overflow: hidden; font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.bento-player-row i { width: 26px; height: 26px; flex: 0 0 26px; border-width: 0; }
.bento-player-row b { color: var(--app-success); font-family: var(--app-font-data); font-size: 12px; }
.bento-player-row em { color: var(--app-success); font-size: 11px; font-style: normal; font-weight: 650; }
.bento-player-row small { overflow: hidden; color: var(--app-ink-muted); font-family: var(--app-font-data); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.bento-host, .bento-automation { grid-column: 3; padding: 24px; }
.bento-resource-list { display: grid; gap: 17px; padding-top: 18px; }
.bento-resource__label span { display: flex; align-items: center; gap: 7px; color: var(--app-ink-secondary); font-size: 12px; font-weight: 650; }
.bento-resource__label .n-icon { color: var(--app-accent); font-size: 16px; }
.bento-resource__visual { display: flex; align-items: flex-end; gap: 12px; margin-top: 8px; }.bento-gauge { width: 80px; height: 48px; flex: 0 0 80px; overflow: visible; }.bento-gauge path { fill: none; stroke-width: 10; stroke-linecap: round; }.bento-gauge__track { stroke: var(--app-surface-muted); }.bento-gauge__value { stroke: var(--app-accent); }.bento-resource__visual strong { display: block; color: var(--app-ink); font-family: var(--app-font-data); font-size: 22px; line-height: 1; }.bento-resource__visual small { display: block; margin-top: 5px; color: var(--app-ink-muted); font-size: 10px; }.bento-resource__bar { margin-top: 8px; }
.bento-resource.is-warning .bento-resource__bar i, .bento-resource.is-warning .bento-gauge__value { background: var(--app-warning); stroke: var(--app-warning); }.bento-resource.is-danger .bento-resource__bar i, .bento-resource.is-danger .bento-gauge__value { background: var(--app-danger); stroke: var(--app-danger); }
.bento-automation dl { display: grid; }.bento-automation dl div { display: flex; min-height: 43px; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--app-border); }.bento-automation dl div:last-child { border-bottom: 0; }
.bento-automation dt { color: var(--app-ink-muted); font-size: 12px; }.bento-automation dd { overflow: hidden; color: var(--app-ink); font-family: var(--app-font-data); font-size: 12px; font-weight: 700; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.bento-empty { display: grid; min-height: 220px; place-items: center; gap: 9px; color: var(--app-ink-muted); font-size: 12px; text-align: center; }.bento-empty img { width: 94px; height: 94px; object-fit: contain; opacity: .16; filter: grayscale(1); }
@media (max-width: 1180px) { .bento-overview__body { grid-template-columns: minmax(0, 1fr) 360px; }.bento-players { grid-column: 1; }.bento-host, .bento-automation { grid-column: 2; } }
@media (max-width: 960px) { .bento-overview__metrics, .bento-overview__body { grid-template-columns: 1fr; }.bento-players, .bento-host, .bento-automation { grid-column: 1; grid-row: auto; }.bento-stat { min-height: 126px; } }
@media (max-width: 620px) { .bento-overview { padding: 20px 14px 24px; }.bento-overview__header { align-items: flex-start; }.bento-overview__metrics { grid-template-columns: 1fr 1fr; gap: 14px; }.bento-overview__metrics > :last-child { grid-column: 1 / -1; }.bento-player-table__head, .bento-player-row { grid-template-columns: minmax(0, 1fr) 56px; }.bento-player-table__head > :nth-child(n+3), .bento-player-row em, .bento-player-row small { display: none; }.bento-stat > strong { font-size: 30px; } }
</style>
