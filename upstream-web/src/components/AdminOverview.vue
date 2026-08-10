<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";
import {
  Activity,
  Apple,
  Archive,
  ArrowRight,
  BuildingCommunity,
  Cpu,
  Database,
  DeviceDesktopAnalytics,
  Heart,
  MapPin,
  Paw,
  Refresh,
  Server,
  ShieldCheck,
  Tools,
  X,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import PalPassiveBadge from "@/components/PalPassiveBadge.vue";
import PalWorkBadge from "@/components/PalWorkBadge.vue";
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
const activeBaseId = ref("");
const selectedWorker = ref(null);
let refreshTimer;

const zh = computed(() => locale.value === "zh");
const copy = computed(() => zh.value ? {
  eyebrow: "WORLD COMMAND / 世界指挥中心",
  title: "持续运行的帕鲁世界",
  subtitle: "玩家离开不等于世界暂停。这里呈现每个据点此刻真正发生的工作、休整与异常。",
  refresh: "同步世界",
  online: "世界在线",
  offline: "世界离线",
  fps: "世界帧率",
  players: "在线玩家",
  pals: "据点帕鲁",
  working: "执行任务",
  attention: "需要照看",
  uptime: "连续运行",
  bases: "据点生态",
  basesHint: "选择单个据点，或查看世界中全部据点帕鲁",
  allBases: "全部据点",
  allBasesHint: "汇总所有据点帕鲁",
  allPals: "打开帕鲁状态中心",
  worldActive: "无人值守，世界仍在运转",
  emptyWorldMessage: (count) => `当前没有玩家在线，${count} 只据点帕鲁仍在生产、运输与维持设施。`,
  onlineWorldMessage: (players, pals) => `${players} 位玩家已连接，${pals} 只据点帕鲁共同维持世界运行。`,
  noWorkers: "这个据点尚未解析到工作帕鲁。",
  worldUnavailable: "暂时无法读取据点数据，请检查存档源或重新解析存档。",
  selectBase: "切换据点",
  task: "正在进行",
  base: "所在据点",
  hunger: "饱食度",
  sanity: "SAN",
  autonomous: "自主活动",
  workingState: "工作中",
  restingState: "休息中",
  eatingState: "进食中",
  attentionState: "需要关注",
  host: "主机生命线",
  hostHint: "资源余量决定世界运行的稳定性",
  protection: "守护程序",
  activeTasks: "启用任务",
  latestBackup: "最近备份",
  backupCount: "可用快照",
  never: "从未备份",
  unavailable: "主机遥测暂时不可用",
  liveUnavailable: "实时连接不完整，请检查 PST 配置中的 REST API。",
  openSettings: "打开 PST 配置",
  cores: "核心",
  healthy: "状态良好",
  focusTitle: "帕鲁工作档案",
  close: "关闭详情",
  facility: "工作设施",
  workSpeed: "工作速度",
  workAbility: "工作能力",
  passives: "被动词条",
  wellbeing: "身心状态",
  noFacility: "自主活动区域",
  noPassives: "暂无被动词条记录",
} : {
  eyebrow: "WORLD COMMAND / LIVE OPERATIONS",
  title: "A Pal world that never stops",
  subtitle: "Players leaving does not pause the world. See the real work, recovery, and risks unfolding across every base.",
  refresh: "Sync world",
  online: "World online",
  offline: "World offline",
  fps: "World FPS",
  players: "Players online",
  pals: "Base Pals",
  working: "On assignment",
  attention: "Need care",
  uptime: "Continuous uptime",
  bases: "Base habitats",
  basesHint: "Choose one base or see every base Pal in the world",
  allBases: "All bases",
  allBasesHint: "Every base Pal together",
  allPals: "Open Pal status center",
  worldActive: "Unattended, still running",
  emptyWorldMessage: (count) => `No players are online. ${count} base Pals are still producing, transporting, and maintaining facilities.`,
  onlineWorldMessage: (players, pals) => `${players} players and ${pals} base Pals are keeping the world active.`,
  noWorkers: "No worker Pals have been parsed for this base yet.",
  worldUnavailable: "Base data is unavailable. Check the save source or parse the save again.",
  selectBase: "Switch base",
  task: "In progress",
  base: "Base",
  hunger: "Hunger",
  sanity: "SAN",
  autonomous: "Autonomous",
  workingState: "Working",
  restingState: "Resting",
  eatingState: "Eating",
  attentionState: "Needs attention",
  host: "Host lifeline",
  hostHint: "Resource headroom keeps the world stable",
  protection: "Safeguards",
  activeTasks: "Enabled tasks",
  latestBackup: "Latest backup",
  backupCount: "Snapshots",
  never: "Never backed up",
  unavailable: "Host telemetry unavailable",
  liveUnavailable: "Live data is incomplete. Check the REST API in PST Configuration.",
  openSettings: "Open PST Configuration",
  cores: "cores",
  healthy: "Healthy",
  focusTitle: "Pal work profile",
  close: "Close details",
  facility: "Facility",
  workSpeed: "Work speed",
  workAbility: "Work suitability",
  passives: "Passives",
  wellbeing: "Wellbeing",
  noFacility: "Autonomous activity area",
  noPassives: "No passive records",
});

const asArray = (value) => Array.isArray(value) ? value : [];
const workLabels = {
  zh: {
    EmitFlame: "生火", Watering: "浇水", Seeding: "播种", GenerateElectricity: "发电",
    Handcraft: "手工作业", Collection: "采集", Deforest: "伐木", Mining: "采矿",
    ProductMedicine: "制药", Cool: "冷却", Transport: "搬运", MonsterFarm: "牧场",
  },
  en: {
    EmitFlame: "Kindling", Watering: "Watering", Seeding: "Planting", GenerateElectricity: "Electricity",
    Handcraft: "Handiwork", Collection: "Gathering", Deforest: "Lumbering", Mining: "Mining",
    ProductMedicine: "Medicine", Cool: "Cooling", Transport: "Transport", MonsterFarm: "Farming",
  },
};
const serverOnline = computed(() =>
  typeof props.serverInfo?.available === "boolean"
    ? props.serverInfo.available
    : Boolean(props.serverInfo?.name),
);
const liveDataIncomplete = computed(() =>
  props.serverInfo?.available === false || props.serverMetrics?.available === false,
);
const currentPlayers = computed(() => Number(props.serverMetrics?.current_player_num ?? onlinePlayers.value.length ?? 0));
const latestBackup = computed(() => [...backups.value].sort((a, b) => new Date(b.save_time) - new Date(a.save_time))[0]);
const activeTasks = computed(() => tasks.value.filter((task) => task.enabled));
const enrichedBases = computed(() => bases.value.map((base) => ({
  ...base,
  workers: enrichPals(asArray(base.workers).map((worker) => ({
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
    const id = String(base.id || `base-${index + 1}`);
    const rows = workers.value.filter((row) => row.baseId === id);
    return {
      id,
      name: base.display_name || base.name || base.id || `Base ${index + 1}`,
      total: rows.length,
      working: rows.filter((row) => ["working", "assigned"].includes(row.activityKind)).length,
      attention: rows.filter((row) => row.attention).length,
    };
  })
  .filter((base) => base.total));
const allBaseSummary = computed(() => ({
  id: "all",
  name: copy.value.allBases,
  total: workers.value.length,
  working: workingCount.value,
  attention: attentionCount.value,
}));
const activeBase = computed(() => activeBaseId.value === "all"
  ? allBaseSummary.value
  : baseSummaries.value.find((base) => base.id === activeBaseId.value) || baseSummaries.value[0] || null);
const activeBaseWorkers = computed(() => {
  if (!activeBase.value) return [];
  const rows = activeBase.value.id === "all"
    ? workers.value
    : workers.value.filter((row) => row.baseId === activeBase.value.id);
  return [...rows].sort((a, b) => Number(b.attention) - Number(a.attention)
    || Number(["working", "assigned"].includes(b.activityKind)) - Number(["working", "assigned"].includes(a.activityKind)));
});
const worldMessage = computed(() => currentPlayers.value
  ? copy.value.onlineWorldMessage(currentPlayers.value, workers.value.length)
  : copy.value.emptyWorldMessage(workers.value.length));
const resourceRows = computed(() => [
  { key: "cpu", icon: Cpu, label: "CPU", value: Number(hostMetrics.value?.cpu?.usedPercent || 0), detail: `${hostMetrics.value?.cpu?.cores || 0} ${copy.value.cores}` },
  { key: "memory", icon: DeviceDesktopAnalytics, label: zh.value ? "内存" : "Memory", value: Number(hostMetrics.value?.memory?.usedPercent || 0), detail: `${formatBytes(hostMetrics.value?.memory?.used)} / ${formatBytes(hostMetrics.value?.memory?.total)}` },
  { key: "disk", icon: Database, label: zh.value ? "磁盘" : "Disk", value: Number(hostMetrics.value?.disk?.usedPercent || 0), detail: hostMetrics.value?.disk ? `${formatBytes(hostMetrics.value.disk.used)} / ${formatBytes(hostMetrics.value.disk.total)}` : "-" },
]);

watch(baseSummaries, (items) => {
  if (items.length && activeBaseId.value !== "all" && !items.some((base) => base.id === activeBaseId.value)) activeBaseId.value = items[0].id;
}, { immediate: true });

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}
const formatDate = (value) => value ? dayjs(value).format("MM-DD HH:mm") : copy.value.never;
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
const facilityLabel = (row) => String(row?.facility || row?.activityDetail || copy.value.noFacility).replace(/_/g, " ");
const workLabel = (work) => workLabels[zh.value ? "zh" : "en"][work.id] || work.name || work.id;
const useFallback = (event) => {
  const image = event.currentTarget;
  if (image.dataset.fallback === "true") return;
  image.dataset.fallback = "true";
  image.src = unknownPal;
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
  <div class="command-deck">
    <header class="command-deck__intro">
      <div>
        <div class="command-deck__eyebrow"><span :class="{ online: serverOnline }" />{{ copy.eyebrow }}</div>
        <h2>{{ copy.title }}</h2>
        <p>{{ copy.subtitle }}</p>
        <div class="command-deck__world-state"><n-icon><Activity /></n-icon><strong>{{ copy.worldActive }}</strong><span>{{ worldMessage }}</span></div>
      </div>
      <div class="command-deck__actions">
        <n-button type="primary" :loading="loading" @click="refresh"><template #icon><n-icon><Refresh /></n-icon></template>{{ copy.refresh }}</n-button>
        <button type="button" class="deck-link" @click="emit('navigate', 'pal-status')">{{ copy.allPals }}<n-icon><ArrowRight /></n-icon></button>
      </div>
    </header>

    <section class="world-intelligence world-intelligence--primary">
      <article class="intelligence-card host-card">
        <header><span><n-icon><Server /></n-icon></span><div><small>SYSTEM LIFELINE</small><h3>{{ copy.host }}</h3><p>{{ hostMetrics.hostname || copy.hostHint }}</p></div></header>
        <div v-if="!hostMetrics.unavailable" class="resource-radar">
          <div v-for="resource in resourceRows" :key="resource.key" class="resource-radar__item">
            <div class="resource-dial" :style="{ '--value': `${Math.min(100, resource.value) * 3.6}deg` }"><span><n-icon><component :is="resource.icon" /></n-icon><strong>{{ resource.value.toFixed(0) }}%</strong></span></div>
            <div><strong>{{ resource.label }}</strong><small>{{ resource.detail }}</small></div>
          </div>
        </div>
        <div v-else class="intelligence-empty">{{ copy.unavailable }}</div>
      </article>

      <article class="intelligence-card protection-card">
        <header><span><n-icon><ShieldCheck /></n-icon></span><div><small>AUTOMATION CORE</small><h3>{{ copy.protection }}</h3><p>{{ zh ? '持续守护每一次世界变更' : 'Protecting every world change' }}</p></div></header>
        <div class="protection-flow">
          <div><n-icon><Tools /></n-icon><span>{{ copy.activeTasks }}</span><strong>{{ activeTasks.length }}</strong></div>
          <i />
          <div><n-icon><Archive /></n-icon><span>{{ copy.latestBackup }}</span><strong>{{ formatDate(latestBackup?.save_time) }}</strong></div>
          <i />
          <div><n-icon><Database /></n-icon><span>{{ copy.backupCount }}</span><strong>{{ backups.length }}</strong></div>
        </div>
      </article>

    </section>

    <n-alert v-if="liveDataIncomplete" type="warning" class="command-deck__alert">
      {{ copy.liveUnavailable }}
      <template #action><n-button text type="warning" @click="emit('navigate', 'settings')">{{ copy.openSettings }}</n-button></template>
    </n-alert>

    <section class="habitat-deck" aria-labelledby="habitat-title">
      <header class="deck-heading">
        <div><span>BASE HABITATS</span><h3 id="habitat-title">{{ copy.bases }}</h3><p>{{ copy.basesHint }}</p></div>
        <div class="habitat-overview" :aria-label="copy.bases">
          <span><strong>{{ workers.length }}</strong>{{ copy.pals }}</span>
          <span :class="{ alert: attentionCount }"><strong>{{ attentionCount }}</strong>{{ copy.attention }}</span>
        </div>
      </header>

      <div class="habitat-layout">
        <nav class="base-switcher" :aria-label="copy.selectBase">
          <button type="button" :class="{ active: activeBase?.id === 'all' }" @click="activeBaseId = 'all'">
            <span class="base-switcher__index">ALL</span>
            <span class="base-switcher__copy"><strong>{{ copy.allBases }}</strong><small>{{ copy.allBasesHint }} · {{ workers.length }} {{ copy.pals }}</small></span>
            <span class="base-switcher__state" :class="{ alert: attentionCount }">{{ attentionCount || '●' }}</span>
          </button>
          <button
            v-for="(base, index) in baseSummaries"
            :key="base.id"
            type="button"
            :class="{ active: activeBase?.id === base.id }"
            @click="activeBaseId = base.id"
          >
            <span class="base-switcher__index">0{{ index + 1 }}</span>
            <span class="base-switcher__copy"><strong>{{ base.name }}</strong><small>{{ base.working }} {{ copy.working }} · {{ base.total }} {{ copy.pals }}</small></span>
            <span class="base-switcher__state" :class="{ alert: base.attention }">{{ base.attention || '●' }}</span>
          </button>
          <div v-if="!baseSummaries.length" class="base-switcher__empty">{{ copy.noWorkers }}</div>
        </nav>

        <div class="pal-habitat">
          <header v-if="activeBase" class="pal-habitat__header">
            <div><span><n-icon><MapPin /></n-icon>{{ copy.base }}</span><h4>{{ activeBase.name }}</h4></div>
            <div class="habitat-stats"><span><strong>{{ activeBase.working }}</strong>{{ copy.working }}</span><span :class="{ alert: activeBase.attention }"><strong>{{ activeBase.attention }}</strong>{{ copy.attention }}</span></div>
          </header>

          <n-alert v-if="worldDataError" type="warning" :bordered="false">{{ copy.worldUnavailable }}</n-alert>
          <div v-if="activeBaseWorkers.length" class="pal-constellation" :aria-busy="loading">
            <button
              v-for="row in activeBaseWorkers"
              :key="row.id"
              v-memo="[row.id, row.hunger, row.sanity, row.activityKind, row.attention]"
              type="button"
              class="pal-node"
              :class="[`is-${workerTone(row)}`, { attention: row.attention }]"
              @click="selectedWorker = row"
            >
              <span class="pal-node__visual">
                <span class="pal-node__halo" />
                <img :src="palPortrait(row.assetKey)" :alt="row.speciesName" loading="lazy" @error="useFallback" />
                <i>{{ row.level || '—' }}</i>
              </span>
              <span class="pal-node__body">
                <span class="pal-node__state"><i />{{ workerState(row) }}</span>
                <strong>{{ row.name }}</strong>
                <small>{{ row.speciesName }}</small>
                <span class="pal-node__vitals">
                  <span><n-icon><Apple /></n-icon><i><b :style="{ width: `${row.hunger ?? 0}%` }" /></i><em>{{ rounded(row.hunger) }}</em></span>
                  <span><n-icon><Heart /></n-icon><i><b :style="{ width: `${row.sanity ?? 0}%` }" /></i><em>{{ rounded(row.sanity) }}</em></span>
                </span>
              </span>
            </button>
          </div>
          <div v-else-if="!loading" class="pal-habitat__empty"><n-icon><Paw /></n-icon><span>{{ copy.noWorkers }}</span></div>
        </div>
      </div>
    </section>

    <n-modal v-if="selectedWorker" :show="true" :mask-closable="true" @update:show="$event || (selectedWorker = null)">
      <article class="pal-focus" role="dialog" aria-modal="true" :aria-label="copy.focusTitle">
        <button type="button" class="pal-focus__close" :aria-label="copy.close" @click="selectedWorker = null"><n-icon><X /></n-icon></button>
        <div class="pal-focus__hero">
          <div class="pal-focus__portrait"><span /><img :src="palPortrait(selectedWorker.assetKey)" :alt="selectedWorker.speciesName" @error="useFallback" /></div>
          <div class="pal-focus__identity">
            <span>{{ copy.focusTitle }}</span>
            <h2>{{ selectedWorker.name }}</h2>
            <p>{{ selectedWorker.speciesName }} · Lv.{{ selectedWorker.level || '—' }} · {{ selectedWorker.baseName }}</p>
            <div><i :class="`is-${workerTone(selectedWorker)}`" />{{ workerState(selectedWorker) }}</div>
          </div>
        </div>
        <div class="pal-focus__grid">
          <section class="pal-focus__assignment">
            <span>{{ copy.task }}</span><strong>{{ workerState(selectedWorker) }}</strong>
            <dl><div><dt><n-icon><BuildingCommunity /></n-icon>{{ copy.base }}</dt><dd>{{ selectedWorker.baseName }}</dd></div><div><dt><n-icon><MapPin /></n-icon>{{ copy.facility }}</dt><dd>{{ facilityLabel(selectedWorker) }}</dd></div><div><dt><n-icon><Activity /></n-icon>{{ copy.workSpeed }}</dt><dd>{{ selectedWorker.workSpeed || '—' }}</dd></div></dl>
          </section>
          <section class="pal-focus__wellbeing">
            <span>{{ copy.wellbeing }}</span>
            <div><n-icon><Apple /></n-icon><strong>{{ copy.hunger }}</strong><em>{{ rounded(selectedWorker.hunger) }}</em><i class="pal-focus__meter"><b :style="{ width: `${selectedWorker.hunger ?? 0}%` }" /></i></div>
            <div><n-icon><Heart /></n-icon><strong>{{ copy.sanity }}</strong><em>{{ rounded(selectedWorker.sanity) }}</em><i class="pal-focus__meter"><b :style="{ width: `${selectedWorker.sanity ?? 0}%` }" /></i></div>
          </section>
          <section class="pal-focus__capabilities">
            <span>{{ copy.workAbility }}</span>
            <div>
              <pal-work-badge
                v-for="work in selectedWorker.workSuitabilities"
                :key="work.id"
                :work="work"
                :label="workLabel(work)"
              />
              <em v-if="!selectedWorker.workSuitabilities.length">—</em>
            </div>
          </section>
          <section class="pal-focus__passives">
            <span>{{ copy.passives }}</span>
            <div v-if="selectedWorker.passives.length">
              <pal-passive-badge
                v-for="skill in selectedWorker.passives"
                :key="skill.id"
                :skill="skill"
              />
            </div>
            <em v-else>{{ copy.noPassives }}</em>
          </section>
        </div>
      </article>
    </n-modal>
  </div>
</template>

<style scoped>
.command-deck { position: relative; width: 100%; max-width: 1940px; margin: 0 auto; padding: clamp(22px, 1.8vw, 36px); color: var(--app-ink); }
.command-deck::before { position: absolute; z-index: 0; top: 0; right: 2%; width: 34%; height: 320px; background: radial-gradient(circle at 70% 20%, color-mix(in srgb, var(--app-accent) 14%, transparent), transparent 68%); content: ""; pointer-events: none; }
.command-deck__intro { position: relative; z-index: 1; display: flex; align-items: end; justify-content: space-between; gap: 28px; padding: 4px 6px 20px; }.command-deck__intro > div:first-child { min-width: 0; }.command-deck__eyebrow { display: flex; align-items: center; gap: 8px; color: var(--app-accent); font: 700 10px/1.4 var(--app-font-data); letter-spacing: .12em; }.command-deck__eyebrow > span { width: 8px; height: 8px; background: var(--app-danger); border-radius: 50%; }.command-deck__eyebrow > span.online { background: var(--app-success); }.command-deck__intro h2 { margin: 8px 0 5px; font-size: clamp(26px, 2vw, 38px); line-height: 1.08; letter-spacing: -.025em; }.command-deck__intro p { color: var(--app-ink-muted); font-size: 13px; line-height: 1.55; }.command-deck__world-state { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 10px; color: var(--app-ink-secondary); font-size: 11px; }.command-deck__world-state .n-icon { color: var(--app-accent); font-size: 16px; }.command-deck__world-state strong { font-size: 11px; }.command-deck__world-state span { color: var(--app-ink-muted); }.command-deck__actions { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; }.command-deck__actions .n-button { min-height: 42px; border-radius: 10px; }
.world-stage { position: relative; z-index: 1; display: grid; min-height: clamp(330px, 31vw, 470px); grid-template-columns: minmax(0, 1.05fr) minmax(410px, .95fr); align-items: center; gap: clamp(32px, 5vw, 92px); overflow: hidden; padding: clamp(32px, 4vw, 72px); background: linear-gradient(135deg, color-mix(in srgb, var(--app-accent-soft) 64%, var(--app-surface)) 0%, var(--app-surface) 48%, color-mix(in srgb, var(--app-info-soft) 42%, var(--app-surface)) 100%); border: 1px solid color-mix(in srgb, var(--app-accent) 18%, var(--app-border)); border-radius: 30px 30px 110px 30px; box-shadow: 0 24px 70px color-mix(in srgb, var(--app-ink) 9%, transparent); }
.world-stage::after { position: absolute; right: -70px; bottom: -120px; width: 360px; height: 360px; background: repeating-radial-gradient(circle, transparent 0 21px, color-mix(in srgb, var(--app-accent) 9%, transparent) 22px 23px); border-radius: 50%; content: ""; pointer-events: none; }
.world-stage__copy { position: relative; z-index: 2; max-width: 760px; }
.world-stage__eyebrow { display: flex; align-items: center; gap: 10px; color: var(--app-accent); font: 700 12px/1.4 var(--app-font-data); letter-spacing: .12em; }
.world-stage__eyebrow > span { width: 10px; height: 10px; background: var(--app-danger); border: 3px solid color-mix(in srgb, var(--app-danger) 20%, transparent); border-radius: 50%; }
.world-stage__eyebrow > span.online { background: var(--app-success); border-color: color-mix(in srgb, var(--app-success) 20%, transparent); }
.world-stage h2 { max-width: 13ch; margin: 18px 0 16px; color: var(--app-ink); font-family: var(--app-font-display); font-size: clamp(38px, 3.2vw, 68px); font-weight: 780; line-height: .98; letter-spacing: -.035em; text-wrap: balance; }
.world-stage__copy > p { max-width: 58ch; color: var(--app-ink-secondary); font-size: clamp(15px, 1vw, 18px); line-height: 1.75; }
.world-stage__message { display: flex; align-items: center; gap: 14px; margin-top: 24px; padding: 14px 16px; background: color-mix(in srgb, var(--app-surface) 74%, transparent); border: 1px solid color-mix(in srgb, var(--app-accent) 16%, var(--app-border)); border-radius: 14px; }
.world-stage__message > .n-icon { flex: 0 0 auto; color: var(--app-accent); font-size: 25px; }
.world-stage__message div { display: grid; gap: 3px; }.world-stage__message strong { font-size: 14px; }.world-stage__message span { color: var(--app-ink-muted); font-size: 13px; line-height: 1.5; }
.world-stage__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 26px; }.world-stage__actions .n-button { min-height: 48px; padding-inline: 22px; border-radius: 12px; }
.deck-link { display: inline-flex; min-height: 48px; align-items: center; gap: 8px; padding: 0 10px; color: var(--app-ink); background: transparent; border: 0; cursor: pointer; font-size: 14px; font-weight: 680; }.deck-link .n-icon { color: var(--app-accent); transition: transform 200ms ease-out; }.deck-link:hover .n-icon { transform: translateX(4px); }
.world-orbit { position: relative; z-index: 1; width: min(32vw, 500px); height: min(32vw, 500px); min-width: 390px; min-height: 390px; justify-self: center; }
.world-orbit__ring { position: absolute; border: 1px solid color-mix(in srgb, var(--app-accent) 24%, transparent); border-radius: 50%; }.ring-one { inset: 9%; }.ring-two { inset: 24%; border-style: dashed; }
.world-orbit__core { position: absolute; inset: 34%; display: grid; place-content: center; place-items: center; background: var(--app-accent); border: 10px solid color-mix(in srgb, var(--app-accent) 14%, var(--app-surface)); border-radius: 50%; box-shadow: 0 22px 52px color-mix(in srgb, var(--app-accent) 28%, transparent); color: white; text-align: center; }.world-orbit__core .n-icon { font-size: 30px; }.world-orbit__core strong { margin-top: 4px; font: 750 clamp(28px, 2vw, 42px)/1 var(--app-font-data); }.world-orbit__core span { margin-top: 5px; font-size: 11px; }
.orbit-signal { position: absolute; display: grid; min-width: 132px; gap: 4px; padding: 13px 16px; background: color-mix(in srgb, var(--app-surface) 92%, transparent); border: 1px solid var(--app-border); border-radius: 14px; box-shadow: 0 12px 32px color-mix(in srgb, var(--app-ink) 8%, transparent); }.orbit-signal small { color: var(--app-ink-muted); font-size: 11px; }.orbit-signal strong { font: 720 20px var(--app-font-data); }.orbit-signal strong i { color: var(--app-ink-muted); font-size: 12px; font-style: normal; }.orbit-signal.alert strong { color: var(--app-warning); }
.orbit-signal--fps { top: 8%; left: 0; }.orbit-signal--players { top: 18%; right: -2%; }.orbit-signal--attention { right: 3%; bottom: 14%; }.orbit-signal--uptime { bottom: 7%; left: 0; }
.command-deck__alert { margin-top: 20px; border-radius: 14px; }
.habitat-deck { position: relative; z-index: 2; margin-top: clamp(24px, 2.4vw, 38px); }
.deck-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; padding: 0 8px; }.deck-heading > div:first-child > span { color: var(--app-accent); font: 700 11px var(--app-font-data); letter-spacing: .14em; }.deck-heading h3 { margin-top: 7px; font-size: clamp(28px, 2vw, 42px); line-height: 1.1; letter-spacing: -.025em; }.deck-heading p { margin-top: 7px; color: var(--app-ink-muted); font-size: 14px; }
.habitat-overview { display: flex; align-items: center; gap: 22px; }.habitat-overview span { display: grid; color: var(--app-ink-muted); font-size: 10px; text-align: right; }.habitat-overview strong { color: var(--app-ink); font: 740 22px var(--app-font-data); }.habitat-overview span.alert strong { color: var(--app-warning); }
.habitat-layout { display: grid; grid-template-columns: minmax(250px, 310px) minmax(0, 1fr); gap: 18px; }
.base-switcher { display: grid; align-content: start; gap: 10px; }.base-switcher button { position: relative; display: grid; min-height: 94px; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 13px; padding: 16px; color: var(--app-ink); background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 18px; cursor: pointer; text-align: left; transition: transform 220ms ease-out, border-color 220ms ease-out, background-color 220ms ease-out; }.base-switcher button:hover { transform: translateX(4px); border-color: color-mix(in srgb, var(--app-accent) 38%, var(--app-border)); }.base-switcher button.active { color: white; background: var(--app-accent); border-color: var(--app-accent); box-shadow: 0 16px 36px color-mix(in srgb, var(--app-accent) 24%, transparent); }.base-switcher__index { color: var(--app-ink-muted); font: 700 11px var(--app-font-data); }.base-switcher button.active .base-switcher__index { color: rgb(255 255 255 / 65%); }.base-switcher__copy { display: grid; min-width: 0; gap: 5px; }.base-switcher__copy strong,.base-switcher__copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.base-switcher__copy strong { font-size: 15px; }.base-switcher__copy small { color: var(--app-ink-muted); font-size: 11px; }.base-switcher button.active small { color: rgb(255 255 255 / 72%); }.base-switcher__state { display: grid; min-width: 28px; height: 28px; place-items: center; color: var(--app-success); background: var(--app-success-soft); border-radius: 50%; font: 700 11px var(--app-font-data); }.base-switcher__state.alert { color: var(--app-warning); background: var(--app-warning-soft); }.base-switcher__empty { padding: 24px; color: var(--app-ink-muted); background: var(--app-surface); border: 1px dashed var(--app-border); border-radius: 18px; font-size: 13px; }
.pal-habitat { min-width: 0; min-height: 500px; padding: clamp(20px, 2vw, 34px); background: color-mix(in srgb, var(--app-surface-muted) 56%, var(--app-surface)); border: 1px solid var(--app-border); border-radius: 26px; }
.pal-habitat__header { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }.pal-habitat__header > div:first-child span { display: flex; align-items: center; gap: 7px; color: var(--app-accent); font-size: 12px; font-weight: 680; }.pal-habitat__header h4 { margin-top: 7px; font-size: clamp(22px, 1.6vw, 32px); }.habitat-stats { display: flex; gap: 24px; }.habitat-stats span { display: grid; color: var(--app-ink-muted); font-size: 10px; text-align: right; }.habitat-stats strong { color: var(--app-ink); font: 740 22px var(--app-font-data); }.habitat-stats span.alert strong { color: var(--app-warning); }
.pal-constellation { display: grid; grid-template-columns: repeat(3, minmax(230px, 1fr)); gap: 14px; }.pal-node { position: relative; display: grid; min-height: 186px; grid-template-columns: 96px minmax(0, 1fr); align-items: center; gap: 16px; overflow: hidden; padding: 18px; color: var(--app-ink); background: var(--app-surface); border: 1px solid transparent; border-radius: 22px; box-shadow: 0 8px 22px color-mix(in srgb, var(--app-ink) 5%, transparent); cursor: pointer; text-align: left; transition: transform 240ms cubic-bezier(.22,1,.36,1), box-shadow 240ms ease-out, border-color 240ms ease-out; }.pal-node:hover { z-index: 2; transform: translateY(-4px); border-color: color-mix(in srgb, var(--app-accent) 35%, var(--app-border)); box-shadow: 0 20px 42px color-mix(in srgb, var(--app-ink) 12%, transparent); }.pal-node.attention { background: linear-gradient(145deg, color-mix(in srgb, var(--app-warning-soft) 62%, var(--app-surface)), var(--app-surface)); }
.pal-node__visual { position: relative; display: grid; width: 96px; height: 112px; place-items: center; }.pal-node__halo { position: absolute; inset: 12px 2px 0; background: color-mix(in srgb, var(--app-accent) 12%, var(--app-surface-muted)); border-radius: 48% 48% 22px 22px; }.pal-node__visual img { position: relative; z-index: 1; width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 12px 12px rgb(0 0 0 / 14%)); }.pal-node__visual > i { position: absolute; z-index: 2; right: 0; bottom: 0; display: grid; width: 30px; height: 30px; place-items: center; color: white; background: var(--app-ink); border: 3px solid var(--app-surface); border-radius: 50%; font: 700 10px var(--app-font-data); font-style: normal; }
.pal-node__body { display: grid; min-width: 0; }.pal-node__state { display: flex; align-items: center; gap: 6px; color: var(--app-success); font-size: 11px; font-weight: 700; }.pal-node__state > i { width: 7px; height: 7px; background: currentColor; border-radius: 50%; }.pal-node.attention .pal-node__state { color: var(--app-warning); }.pal-node__body > strong { overflow: hidden; margin-top: 9px; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }.pal-node__body > small { overflow: hidden; margin-top: 3px; color: var(--app-ink-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.pal-node__vitals { display: grid; gap: 8px; margin-top: 14px; }.pal-node__vitals > span { display: grid; grid-template-columns: 16px minmax(0, 1fr) 34px; align-items: center; gap: 7px; color: var(--app-ink-muted); }.pal-node__vitals .n-icon { font-size: 14px; }.pal-node__vitals i { height: 5px; overflow: hidden; background: var(--app-surface-muted); border-radius: 4px; }.pal-node__vitals b { display: block; height: 100%; background: var(--app-accent); border-radius: inherit; }.pal-node__vitals em { font: 600 9px var(--app-font-data); font-style: normal; text-align: right; }.pal-habitat__empty { display: grid; min-height: 360px; place-content: center; place-items: center; gap: 12px; color: var(--app-ink-muted); font-size: 14px; }.pal-habitat__empty .n-icon { font-size: 42px; }
.world-intelligence { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(340px, .75fr); gap: 14px; margin-top: 14px; }.world-intelligence--primary { position: relative; z-index: 1; margin-top: 0; }.intelligence-card { min-width: 0; min-height: 210px; padding: 20px; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 20px; }.intelligence-card > header { display: flex; align-items: flex-start; gap: 12px; }.intelligence-card > header > span { display: grid; width: 40px; height: 40px; flex: 0 0 40px; place-items: center; color: var(--app-accent); background: var(--app-accent-soft); border-radius: 12px; font-size: 19px; }.intelligence-card header small { color: var(--app-accent); font: 700 8px var(--app-font-data); letter-spacing: .12em; }.intelligence-card header h3 { margin-top: 3px; font-size: 17px; }.intelligence-card header p { margin-top: 3px; color: var(--app-ink-muted); font-size: 10px; }
.resource-radar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }.resource-radar__item { display: grid; justify-items: center; gap: 7px; text-align: center; }.resource-dial { display: grid; width: 68px; height: 68px; place-items: center; background: conic-gradient(var(--app-accent) var(--value), var(--app-surface-muted) 0); border-radius: 50%; }.resource-dial > span { display: grid; width: 54px; height: 54px; place-content: center; place-items: center; background: var(--app-surface); border-radius: 50%; }.resource-dial .n-icon { color: var(--app-accent); }.resource-dial strong { margin-top: 1px; font: 700 11px var(--app-font-data); }.resource-radar__item > div:last-child { display: grid; gap: 2px; }.resource-radar__item > div:last-child strong { font-size: 11px; }.resource-radar__item > div:last-child small { color: var(--app-ink-muted); font-size: 8px; }
.protection-flow { display: grid; grid-template-columns: 1fr 14px 1fr 14px 1fr; align-items: center; margin-top: 25px; }.protection-flow > div { display: grid; justify-items: center; gap: 6px; text-align: center; }.protection-flow .n-icon { color: var(--app-accent); font-size: 20px; }.protection-flow span { color: var(--app-ink-muted); font-size: 9px; }.protection-flow strong { max-width: 120px; overflow: hidden; font: 700 11px var(--app-font-data); text-overflow: ellipsis; white-space: nowrap; }.protection-flow > i { height: 1px; background: var(--app-border); }
.intelligence-empty { display: grid; min-height: 140px; place-items: center; color: var(--app-ink-muted); font-size: 13px; }
:global(.n-modal-mask) { background-color: rgb(4 12 11 / 70%); backdrop-filter: blur(8px); }
.pal-focus { position: relative; width: min(1040px, 92vw); max-height: 90dvh; overflow-x: hidden; overflow-y: auto; padding: clamp(26px, 3vw, 48px); color: var(--app-ink); background: var(--app-surface); border: 1px solid color-mix(in srgb, var(--app-accent) 25%, var(--app-border)); border-radius: 30px; box-shadow: 0 40px 120px rgb(0 0 0 / 28%); }
.pal-focus__close { position: absolute; z-index: 4; top: 22px; right: 22px; display: grid; width: 44px; height: 44px; place-items: center; color: var(--app-ink); background: var(--app-surface-muted); border: 0; border-radius: 50%; cursor: pointer; font-size: 20px; }
.pal-focus__hero { display: grid; grid-template-columns: 220px minmax(0, 1fr); align-items: center; gap: 34px; }.pal-focus__portrait { position: relative; display: grid; width: 220px; height: 220px; place-items: center; overflow: hidden; background: radial-gradient(circle at 50% 60%, var(--app-accent-soft), var(--app-surface-muted) 68%); border-radius: 36% 36% 26px 26px; }.pal-focus__portrait span { position: absolute; inset: 30px; border: 1px dashed color-mix(in srgb, var(--app-accent) 40%, transparent); border-radius: 50%; }.pal-focus__portrait img { position: relative; width: 190px; height: 190px; object-fit: contain; filter: drop-shadow(0 20px 18px rgb(0 0 0 / 18%)); }.pal-focus__identity > span,.pal-focus__grid section > span { color: var(--app-accent); font: 700 10px var(--app-font-data); letter-spacing: .12em; text-transform: uppercase; }.pal-focus__identity h2 { margin-top: 10px; font-size: clamp(34px, 3vw, 52px); line-height: 1; }.pal-focus__identity p { margin-top: 10px; color: var(--app-ink-muted); font-size: 14px; }.pal-focus__identity > div { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; padding: 9px 13px; color: var(--app-success); background: var(--app-success-soft); border-radius: 20px; font-size: 12px; font-weight: 700; }.pal-focus__identity > div i { width: 8px; height: 8px; background: currentColor; border-radius: 50%; }.pal-focus__identity > div:has(i.is-attention) { color: var(--app-warning); background: var(--app-warning-soft); }
.pal-focus__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; margin-top: 34px; }.pal-focus__grid section { min-width: 0; padding: 22px; background: var(--app-surface-muted); border-radius: 18px; }.pal-focus__assignment > strong { display: block; margin-top: 10px; font-size: 22px; }.pal-focus__assignment dl { display: grid; gap: 10px; margin-top: 18px; }.pal-focus__assignment dl > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.pal-focus__assignment dt { display: flex; align-items: center; gap: 7px; color: var(--app-ink-muted); font-size: 11px; }.pal-focus__assignment dd { max-width: 58%; min-width: 0; overflow-wrap: anywhere; font-size: 12px; font-weight: 700; text-align: right; }.pal-focus__wellbeing > div { display: grid; grid-template-columns: 20px minmax(64px, 1fr) auto; align-items: center; gap: 8px; margin-top: 17px; }.pal-focus__wellbeing .n-icon { color: var(--app-accent); }.pal-focus__wellbeing strong { min-width: 0; font-size: 11px; white-space: nowrap; }.pal-focus__wellbeing em { font: 700 11px var(--app-font-data); font-style: normal; }.pal-focus__wellbeing .pal-focus__meter { grid-column: 1 / -1; height: 7px; overflow: hidden; background: var(--app-surface); border-radius: 7px; }.pal-focus__wellbeing b { display: block; height: 100%; background: var(--app-accent); }.pal-focus__capabilities > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }.pal-focus__capabilities em { color: var(--app-ink-muted); font-size: 12px; font-style: normal; }.pal-focus__passives > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }.pal-focus__passives > em { display: block; margin-top: 18px; color: var(--app-ink-muted); font-size: 12px; font-style: normal; }
.deck-link:focus-visible,.base-switcher button:focus-visible,.pal-node:focus-visible,.pal-focus__close:focus-visible { outline: 3px solid color-mix(in srgb, var(--app-accent) 60%, white); outline-offset: 3px; }

/* Overview density v2: readable telemetry and more world activity per viewport. */
.command-deck {
  max-width: 2160px;
  padding: clamp(18px, 1.35vw, 30px);
}
.command-deck__intro {
  padding: 2px 4px 14px;
}
.command-deck__intro h2 {
  margin-block: 6px 4px;
  font-size: 32px;
  line-height: 1.12;
}
.command-deck__intro p {
  font-size: 14px;
  line-height: 1.5;
}
.command-deck__world-state {
  margin-top: 8px;
  font-size: 12px;
}
.command-deck__world-state strong {
  font-size: 12px;
}
.world-intelligence {
  gap: 12px;
  margin-top: 12px;
}
.world-intelligence--primary {
  margin-top: 0;
}
.intelligence-card {
  min-height: 176px;
  padding: 16px 18px;
  border-radius: 16px;
}
.intelligence-card > header {
  gap: 11px;
}
.intelligence-card > header > span {
  width: 38px;
  height: 38px;
  flex-basis: 38px;
  border-radius: 10px;
  font-size: 18px;
}
.intelligence-card header small {
  font-size: 9px;
  letter-spacing: .08em;
}
.intelligence-card header h3 {
  margin-top: 2px;
  font-size: 18px;
}
.intelligence-card header p {
  margin-top: 2px;
  font-size: 12px;
}
.resource-radar {
  gap: 12px;
  margin-top: 12px;
}
.resource-radar__item {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  justify-items: start;
  gap: 9px;
  text-align: left;
}
.resource-dial {
  width: 58px;
  height: 58px;
}
.resource-dial > span {
  width: 46px;
  height: 46px;
}
.resource-radar__item > div:last-child {
  min-width: 0;
}
.resource-radar__item > div:last-child strong {
  font-size: 13px;
}
.resource-radar__item > div:last-child small {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.protection-flow {
  margin-top: 18px;
}
.protection-flow span {
  font-size: 10px;
}
.protection-flow strong {
  font-size: 12px;
}
.habitat-layout {
  grid-template-columns: minmax(230px, 280px) minmax(0, 1fr);
  gap: 14px;
}
.base-switcher {
  gap: 8px;
}
.base-switcher button {
  min-height: 72px;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 13px;
  transition: border-color 180ms ease-out, background-color 180ms ease-out;
}
.base-switcher button:hover {
  transform: none;
}
.base-switcher button.active {
  box-shadow: 0 6px 8px color-mix(in srgb, var(--app-accent) 18%, transparent);
}
.base-switcher__copy {
  gap: 3px;
}
.base-switcher__copy strong {
  font-size: 14px;
}
.base-switcher__state {
  min-width: 26px;
  height: 26px;
  font-size: 10px;
}
.pal-habitat {
  min-height: 420px;
  padding: clamp(16px, 1.35vw, 24px);
  border-radius: 18px;
}
.pal-habitat__header {
  margin-bottom: 14px;
}
.pal-habitat__header h4 {
  margin-top: 4px;
  font-size: 24px;
}
.habitat-stats {
  gap: 20px;
}
.habitat-stats strong {
  font-size: 20px;
}
.pal-constellation {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: 10px;
}
.pal-node {
  min-height: 138px;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  box-shadow: 0 5px 8px color-mix(in srgb, var(--app-ink) 5%, transparent);
  transition: background-color 180ms ease-out, border-color 180ms ease-out, box-shadow 180ms ease-out;
}
.pal-node:hover {
  transform: none;
  box-shadow: 0 6px 8px color-mix(in srgb, var(--app-ink) 10%, transparent);
}
.pal-node__visual {
  width: 76px;
  height: 88px;
}
.pal-node__halo {
  inset: 10px 2px 0;
  border-radius: 42% 42% 14px 14px;
}
.pal-node__visual img {
  width: 72px;
  height: 72px;
  filter: drop-shadow(0 8px 8px rgb(0 0 0 / 14%));
}
.pal-node__visual > i {
  width: 26px;
  height: 26px;
  border-width: 2px;
  font-size: 9px;
}
.pal-node__state {
  gap: 5px;
  font-size: 10px;
}
.pal-node__body > strong {
  margin-top: 6px;
  font-size: 14px;
}
.pal-node__body > small {
  margin-top: 2px;
  font-size: 10px;
}
.pal-node__vitals {
  gap: 6px;
  margin-top: 9px;
}
.pal-node__vitals > span {
  grid-template-columns: 14px minmax(0, 1fr) 30px;
  gap: 5px;
}
.pal-node__vitals .n-icon {
  font-size: 12px;
}
.pal-node__vitals i {
  height: 4px;
}
@media (min-width: 1800px) { .pal-constellation { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }.pal-node { min-height: 142px; }.intelligence-card { min-height: 178px; } }
@media (min-width: 3000px) and (min-height: 1300px) {
  .command-deck { max-width: 3000px; }
  .command-deck__intro h2 { font-size: 36px; }
  .command-deck__intro p { font-size: 15px; }
  .command-deck__world-state,.command-deck__world-state strong { font-size: 13px; }
  .intelligence-card { min-height: 190px; padding: 20px; }
  .intelligence-card > header > span { width: 42px; height: 42px; flex-basis: 42px; font-size: 20px; }
  .intelligence-card header small { font-size: 10px; }
  .intelligence-card header h3 { font-size: 20px; }
  .intelligence-card header p { font-size: 13px; }
  .resource-dial { width: 64px; height: 64px; }
  .resource-dial > span { width: 50px; height: 50px; }
  .resource-radar__item > div:last-child strong { font-size: 14px; }
  .resource-radar__item > div:last-child small { font-size: 11px; }
  .protection-flow span { font-size: 11px; }
  .protection-flow strong { font-size: 13px; }
  .habitat-layout { grid-template-columns: 300px minmax(0, 1fr); }
  .pal-constellation { grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); }
  .pal-node { min-height: 148px; grid-template-columns: 80px minmax(0, 1fr); }
  .pal-node__visual { width: 80px; height: 92px; }
  .pal-node__visual img { width: 76px; height: 76px; }
  .pal-node__body > strong { font-size: 15px; }
}
@media (max-width: 1420px) { .world-stage { grid-template-columns: 1fr 420px; }.pal-constellation { grid-template-columns: repeat(2, minmax(230px, 1fr)); }.world-intelligence { grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr); } }
@media (max-width: 1080px) { .world-stage { grid-template-columns: 1fr; }.world-orbit { width: 440px; height: 440px; }.habitat-layout { grid-template-columns: 1fr; }.base-switcher { grid-template-columns: repeat(2, 1fr); }.world-intelligence { grid-template-columns: 1fr; } }
@media (max-width: 720px) { .command-deck { padding: 16px 12px 100px; }.command-deck__intro { display: grid; align-items: start; gap: 14px; padding-inline: 4px; }.command-deck__intro h2 { font-size: 30px; }.command-deck__actions { flex-wrap: wrap; }.world-stage { min-height: 0; padding: 26px 20px 34px; border-radius: 22px 22px 58px 22px; }.world-stage h2 { font-size: 38px; }.world-orbit { width: 320px; height: 320px; min-width: 320px; min-height: 320px; }.orbit-signal { min-width: 106px; padding: 9px 11px; }.orbit-signal strong { font-size: 15px; }.world-orbit__core { inset: 32%; }.deck-heading { align-items: flex-start; flex-direction: column; }.habitat-overview span { text-align: left; }.base-switcher { display: flex; overflow-x: auto; margin-inline: -12px; padding: 0 12px 8px; }.base-switcher button { min-width: 240px; }.pal-habitat { padding: 18px 14px; border-radius: 20px; }.pal-constellation { grid-template-columns: 1fr; }.pal-node { min-height: 164px; grid-template-columns: 86px minmax(0, 1fr); }.pal-node__visual { width: 86px; }.pal-node__visual img { width: 84px; height: 84px; }.world-intelligence { grid-template-columns: 1fr; }.resource-radar { gap: 8px; }.resource-dial { width: 70px; height: 70px; }.resource-dial > span { width: 56px; height: 56px; }.pal-focus { width: 96vw; padding: 24px 18px; border-radius: 22px; }.pal-focus__hero { grid-template-columns: 1fr; justify-items: center; text-align: center; }.pal-focus__portrait { width: 180px; height: 180px; }.pal-focus__portrait img { width: 160px; height: 160px; }.pal-focus__grid,.pal-focus__capabilities > div,.pal-focus__passives > div { grid-template-columns: 1fr; }.pal-focus__close { top: 14px; right: 14px; } }
@media (prefers-reduced-motion: reduce) { .deck-link .n-icon,.base-switcher button,.pal-node { transition: none; }.deck-link:hover .n-icon,.base-switcher button:hover,.pal-node:hover { transform: none; } }
</style>
