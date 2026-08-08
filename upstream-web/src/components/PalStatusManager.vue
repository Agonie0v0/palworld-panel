<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Activity,
  AlertTriangle,
  Apple,
  BuildingCommunity,
  Clock,
  Heart,
  Package,
  Paw,
  Refresh,
  Search,
  Tools,
  TrendingUp,
  X,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";
import unknownAsset from "@/assets/pals/unknown.png";
import {
  enrichInventory,
  enrichPals,
  itemIcon,
  palPortrait,
} from "@/utils/gameData";
import { buildPalWorkerRows, filterPalWorkerRows } from "@/utils/palWorkers";

const props = defineProps({
  show: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
});
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const loading = ref(false);
const loadError = ref("");
const bases = ref([]);
const production = ref({ current: null, history: [] });
const activeTab = ref("workers");
const selectedBase = ref("all");
const search = ref("");
const attentionOnly = ref(false);
const selectedWork = ref([]);
const selectedPassives = ref([]);
const selected = ref(null);

const zh = computed(() => locale.value === "zh");
const copy = computed(() =>
  zh.value
    ? {
        title: "帕鲁状态",
        subtitle: "查看据点帕鲁的当前任务、设施、工作能力、被动词条、身体状态与离线物资增量。",
        refresh: "重新解析",
        workersTab: "工作状态",
        productionTab: "离线产出",
        allBases: "全部据点",
        search: "搜索帕鲁、任务、设施或被动词条",
        attentionOnly: "只看需关注",
        workers: "工作帕鲁",
        bases: "活跃据点",
        attention: "需要关注",
        workingNow: "有明确任务",
        currentTask: "当前任务",
        facility: "工作设施",
        wellbeing: "身体状态",
        hunger: "饱食度",
        sanity: "SAN",
        healthy: "状态正常",
        noFacility: "未记录设施",
        work: "工作能力",
        passives: "被动词条",
        skills: "已装备主动技能",
        masteredSkills: "已掌握主动技能",
        partner: "伙伴技能",
        disabledWork: "已禁用工作",
        iv: "个体值",
        workSpeed: "工作速度",
        empty: "没有符合筛选条件的工作帕鲁",
        unavailable: "存档数据读取失败，请检查存档源与解析器状态。",
        currentWindow: "当前无人时段",
        history: "最近无人时段",
        collecting: "正在估算",
        noWindow: "当前有玩家在线，等待下一次无人时段开始统计。",
        estimate: "按据点仓库和公会箱的库存净变化估算，不包含玩家背包。",
        totalGain: "物资净增",
        itemTypes: "增长种类",
        lastSample: "最近采样",
        withdrawals: "取用或消耗",
        noGain: "该时段暂未检测到物资增长",
        noHistory: "还没有完成的无人在线时段记录",
        detail: "工作帕鲁详情",
        level: "等级",
        owner: "所在据点",
        stars: "星级",
      }
    : {
        title: "Pal status",
        subtitle: "Inspect current tasks, facilities, work levels, passives, wellbeing, and estimated offline production.",
        refresh: "Parse again",
        workersTab: "Work status",
        productionTab: "Offline production",
        allBases: "All bases",
        search: "Search Pals, tasks, facilities, or passives",
        attentionOnly: "Needs attention only",
        workers: "Worker Pals",
        bases: "Active bases",
        attention: "Need attention",
        workingNow: "Assigned tasks",
        currentTask: "Current task",
        facility: "Facility",
        wellbeing: "Wellbeing",
        hunger: "Hunger",
        sanity: "SAN",
        healthy: "Healthy",
        noFacility: "No facility recorded",
        work: "Work suitability",
        passives: "Passives",
        skills: "Equipped active skills",
        masteredSkills: "Mastered active skills",
        partner: "Partner skill",
        disabledWork: "Disabled work",
        iv: "IVs",
        workSpeed: "Work speed",
        empty: "No worker Pals match these filters",
        unavailable: "Save data could not be loaded. Check the save source and parser.",
        currentWindow: "Current empty-server window",
        history: "Recent empty-server windows",
        collecting: "Estimating",
        noWindow: "Players are online. Tracking starts when the server becomes empty.",
        estimate: "Estimated from net changes in base and guild storage. Player inventories are excluded.",
        totalGain: "Net materials gained",
        itemTypes: "Growing item types",
        lastSample: "Last sample",
        withdrawals: "Used or withdrawn",
        noGain: "No material growth has been detected in this window yet",
        noHistory: "No completed empty-server windows yet",
        detail: "Worker Pal details",
        level: "Level",
        owner: "Base",
        stars: "Stars",
      },
);

const workLabels = computed(() =>
  zh.value
    ? {
        EmitFlame: "生火",
        Watering: "浇水",
        Seeding: "播种",
        GenerateElectricity: "发电",
        Handcraft: "手工作业",
        Collection: "采集",
        Deforest: "伐木",
        Mining: "采矿",
        ProductMedicine: "制药",
        Cool: "冷却",
        Transport: "搬运",
        MonsterFarm: "牧场",
      }
    : {
        EmitFlame: "Kindling",
        Watering: "Watering",
        Seeding: "Planting",
        GenerateElectricity: "Electricity",
        Handcraft: "Handiwork",
        Collection: "Gathering",
        Deforest: "Lumbering",
        Mining: "Mining",
        ProductMedicine: "Medicine",
        Cool: "Cooling",
        Transport: "Transport",
        MonsterFarm: "Farming",
      },
);

const enrichedBases = computed(() =>
  bases.value.map((base) => ({
    ...base,
    workers: enrichPals(
      (Array.isArray(base.workers) ? base.workers : []).map((worker) => ({
        ...worker,
        base_name: base.display_name || base.name || base.id,
        location_kind: "base",
      })),
    ),
  })),
);
const rows = computed(() => buildPalWorkerRows(enrichedBases.value));
const visibleRows = computed(() =>
  filterPalWorkerRows(rows.value, {
    baseId: selectedBase.value,
    search: search.value,
    attentionOnly: attentionOnly.value,
    work: selectedWork.value,
    passives: selectedPassives.value,
  }),
);
const activeBases = computed(() => new Set(rows.value.map((row) => row.baseId)).size);
const attentionCount = computed(() => rows.value.filter((row) => row.attention).length);
const assignedCount = computed(() => rows.value.filter((row) => ["working", "assigned"].includes(row.activityKind)).length);
const baseOptions = computed(() => [
  { label: `${copy.value.allBases} (${rows.value.length})`, value: "all" },
  ...enrichedBases.value
    .filter((base) => base.workers.length)
    .map((base, index) => ({
      label: `${base.display_name || base.name || base.id || `Base ${index + 1}`} (${base.workers.length})`,
      value: String(base.id || `base-${index + 1}`),
    })),
]);
const workOptions = computed(() =>
  Object.entries(workLabels.value).map(([id, label]) => ({
    id,
    label,
    count: rows.value.filter((row) => row.workSuitabilities.some((work) => work.id === id)).length,
  })),
);
const passiveOptions = computed(() => {
  const values = new Map();
  rows.value.forEach((row) =>
    row.passives.forEach((skill) => values.set(skill.id, { label: skill.name, value: skill.id })),
  );
  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label));
});
const currentProductionItems = computed(() => productionItems(production.value.current));

const result = (response) => response?.data?.value || {};
const load = async () => {
  loading.value = true;
  loadError.value = "";
  const [worldResult, productionResult] = await Promise.allSettled([
    api.getWorldData(),
    api.getOfflineProduction(),
  ]);
  if (worldResult.status === "fulfilled") {
    const data = result(worldResult.value).data || {};
    bases.value = Array.isArray(data.bases) ? data.bases : [];
  } else {
    bases.value = [];
    loadError.value = copy.value.unavailable;
  }
  if (productionResult.status === "fulfilled") {
    production.value = result(productionResult.value).data || { current: null, history: [] };
  }
  loading.value = false;
};

const toggleWork = (id) => {
  selectedWork.value = selectedWork.value.includes(id)
    ? selectedWork.value.filter((value) => value !== id)
    : [...selectedWork.value, id];
};
const useFallback = (event) => {
  const image = event.currentTarget;
  if (image.dataset.fallback === "true") return;
  image.dataset.fallback = "true";
  image.src = unknownAsset;
};
const rounded = (value) => (value == null ? "-" : `${Math.round(Number(value))}%`);
const meterStatus = (value, warning) => {
  if (value == null) return "default";
  if (value < warning) return "error";
  if (value < warning + 20) return "warning";
  return "success";
};
const humanizeToken = (value) =>
  String(value || "")
    .replace(/^EPalWorkSuitability::/i, "")
    .replace(/^PalWorkDef_/i, "")
    .replace(/_/g, " ")
    .trim();
const activityLabel = (row) => {
  if (row.activityKind === "working" && row.workSuitability) {
    const id = humanizeToken(row.workSuitability);
    return zh.value ? `正在${workLabels.value[id] || id}` : `Working: ${workLabels.value[id] || id}`;
  }
  return row.activityLabel || "-";
};
const facilityLabel = (row) => humanizeToken(row.facility) || copy.value.noFacility;
const formatTime = (value) =>
  value ? new Intl.DateTimeFormat(zh.value ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
const formatDuration = (seconds) => {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return zh.value ? `${hours} 小时 ${minutes} 分钟` : `${hours}h ${minutes}m`;
};
const liveDuration = (session) =>
  session?.startedAt ? formatDuration((Date.now() - Date.parse(session.startedAt)) / 1000) : "-";
function productionItems(session) {
  return enrichInventory(
    (Array.isArray(session?.gains) ? session.gains : []).map((item) => ({
      ...item,
      count: item.delta,
      locations: [],
    })),
  );
}

watch(() => props.show, (show) => show && load(), { immediate: true });
</script>

<template>
  <tool-surface
    :show="show"
    class="pal-status-modal"
    :title="copy.title"
    width="min(97vw, 1380px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <template #description>{{ copy.subtitle }}</template>
    <template #header-extra>
      <n-button quaternary :loading="loading" @click="load">
        <template #icon><n-icon><Refresh /></n-icon></template>
        {{ copy.refresh }}
      </n-button>
    </template>

    <n-tabs v-model:value="activeTab" type="segment" :animated="false">
      <n-tab-pane name="workers" :tab="copy.workersTab">
        <div class="status-summary" aria-live="polite">
          <div><n-icon><Paw /></n-icon><span>{{ copy.workers }}</span><strong>{{ rows.length }}</strong></div>
          <div><n-icon><BuildingCommunity /></n-icon><span>{{ copy.bases }}</span><strong>{{ activeBases }}</strong></div>
          <div :class="{ alert: attentionCount }"><n-icon><AlertTriangle /></n-icon><span>{{ copy.attention }}</span><strong>{{ attentionCount }}</strong></div>
          <div><n-icon><Tools /></n-icon><span>{{ copy.workingNow }}</span><strong>{{ assignedCount }}</strong></div>
        </div>

        <section class="worker-filters">
          <div class="filter-main">
            <n-input v-model:value="search" clearable :placeholder="copy.search">
              <template #prefix><n-icon><Search /></n-icon></template>
            </n-input>
            <n-select v-model:value="selectedBase" :options="baseOptions" :consistent-menu-width="false" />
            <n-select v-model:value="selectedPassives" multiple filterable clearable :max-tag-count="1" :placeholder="copy.passives" :options="passiveOptions" />
            <label class="attention-filter"><n-switch v-model:value="attentionOnly" /><span>{{ copy.attentionOnly }}</span></label>
          </div>
          <div class="work-filter">
            <span>{{ copy.work }}</span>
            <div>
              <button v-for="work in workOptions" :key="work.id" type="button" :class="{ active: selectedWork.includes(work.id) }" @click="toggleWork(work.id)">
                <span>{{ work.label }}</span><small>{{ work.count }}</small>
              </button>
            </div>
          </div>
        </section>

        <n-alert v-if="loadError" type="error" :bordered="false">{{ loadError }}</n-alert>
        <div class="result-count">{{ visibleRows.length }} / {{ rows.length }}</div>
        <div v-if="visibleRows.length" class="worker-grid" :aria-busy="loading">
          <button v-for="row in visibleRows" :key="row.id" type="button" class="worker-card" :class="{ attention: row.attention }" @click="selected = row">
            <span class="pal-portrait"><img :src="palPortrait(row.type)" :alt="row.speciesName" @error="useFallback" /></span>
            <span class="worker-main">
              <span class="worker-name"><strong>{{ row.name }}</strong><small>{{ row.speciesName }} · Lv.{{ row.level }}<b v-if="row.stars"> {{ '★'.repeat(row.stars) }}</b></small></span>
              <span class="worker-task"><n-icon><Activity /></n-icon><span><strong>{{ activityLabel(row) }}</strong><small>{{ facilityLabel(row) }} · {{ row.baseName }}</small></span></span>
              <span class="work-chips"><i v-for="work in row.workSuitabilities" :key="work.id">{{ workLabels[work.id] || work.id }} {{ work.level }}</i></span>
              <span v-if="row.passives.length" class="passive-line">{{ row.passives.slice(0, 3).map((skill) => skill.name).join(' · ') }}</span>
            </span>
            <span class="worker-vitals">
              <span><n-icon><Apple /></n-icon><i>{{ copy.hunger }}</i><strong>{{ rounded(row.hunger) }}</strong></span>
              <n-progress type="line" :percentage="row.hunger ?? 0" :status="meterStatus(row.hunger, 20)" :show-indicator="false" :height="5" />
              <span><n-icon><Heart /></n-icon><i>{{ copy.sanity }}</i><strong>{{ rounded(row.sanity) }}</strong></span>
              <n-progress type="line" :percentage="row.sanity ?? 0" :status="meterStatus(row.sanity, 50)" :show-indicator="false" :height="5" />
              <n-tag v-if="row.attention" size="small" type="warning" :bordered="false">{{ row.conditions.join(' · ') }}</n-tag>
              <n-tag v-else size="small" type="success" :bordered="false">{{ copy.healthy }}</n-tag>
            </span>
          </button>
        </div>
        <n-empty v-else-if="!loading" class="status-empty" :description="copy.empty"><template #icon><n-icon><Paw /></n-icon></template></n-empty>
      </n-tab-pane>

      <n-tab-pane name="production" :tab="copy.productionTab">
        <n-alert type="info" :bordered="false" class="production-note">{{ copy.estimate }}</n-alert>
        <section v-if="production.current" class="production-current">
          <header>
            <div><span class="live-dot" /><div><strong>{{ copy.currentWindow }}</strong><small>{{ formatTime(production.current.startedAt) }} · {{ liveDuration(production.current) }}</small></div></div>
            <n-tag type="success" :bordered="false">{{ copy.collecting }}</n-tag>
          </header>
          <div class="production-summary">
            <div><n-icon><TrendingUp /></n-icon><span>{{ copy.totalGain }}</span><strong>+{{ Number(production.current.totalGain || 0).toLocaleString() }}</strong></div>
            <div><n-icon><Package /></n-icon><span>{{ copy.itemTypes }}</span><strong>{{ currentProductionItems.length }}</strong></div>
            <div><n-icon><Clock /></n-icon><span>{{ copy.lastSample }}</span><strong>{{ formatTime(production.current.lastSampleAt) }}</strong></div>
            <div><n-icon><AlertTriangle /></n-icon><span>{{ copy.withdrawals }}</span><strong>{{ Number(production.current.totalLoss || 0).toLocaleString() }}</strong></div>
          </div>
          <div v-if="currentProductionItems.length" class="gain-grid">
            <div v-for="item in currentProductionItems" :key="item.itemId" class="gain-row">
              <img :src="itemIcon(item.itemId)" alt="" @error="useFallback" /><span><strong>{{ item.name }}</strong><small>{{ item.category }}</small></span><b>+{{ item.count.toLocaleString() }}</b>
            </div>
          </div>
          <n-empty v-else :description="copy.noGain" />
        </section>
        <n-empty v-else class="production-empty" :description="copy.noWindow"><template #icon><n-icon><Clock /></n-icon></template></n-empty>

        <section class="production-history">
          <h3>{{ copy.history }}</h3>
          <n-collapse v-if="production.history?.length">
            <n-collapse-item v-for="session in production.history" :key="session.id" :name="session.id">
              <template #header>
                <div class="history-header"><span><strong>{{ formatTime(session.startedAt) }}</strong><small>{{ formatDuration(session.durationSeconds) }}</small></span><b>+{{ Number(session.totalGain || 0).toLocaleString() }}</b></div>
              </template>
              <div v-if="productionItems(session).length" class="gain-grid compact">
                <div v-for="item in productionItems(session)" :key="item.itemId" class="gain-row">
                  <img :src="itemIcon(item.itemId)" alt="" @error="useFallback" /><span><strong>{{ item.name }}</strong><small>{{ item.category }}</small></span><b>+{{ item.count.toLocaleString() }}</b>
                </div>
              </div>
              <n-empty v-else :description="copy.noGain" />
            </n-collapse-item>
          </n-collapse>
          <n-empty v-else :description="copy.noHistory" />
        </section>
      </n-tab-pane>
    </n-tabs>
  </tool-surface>

  <n-modal v-if="selected" :show="true" :mask-closable="true" @update:show="$event || (selected = null)">
    <article class="pal-inspector" role="dialog" aria-modal="true" :aria-label="copy.detail">
      <button type="button" class="pal-inspector__close" :aria-label="zh ? '关闭详情' : 'Close details'" @click="selected = null"><n-icon><X /></n-icon></button>
      <header class="detail-hero">
        <div class="detail-portrait"><span /><img :src="palPortrait(selected.type)" :alt="selected.speciesName" @error="useFallback" /></div>
        <div><small>{{ copy.detail }}</small><h2>{{ selected.name }}</h2><p>{{ selected.speciesName }} · Lv.{{ selected.level }} · {{ '★'.repeat(selected.stars) || (zh ? '零星' : 'No stars') }}</p><n-flex><n-tag v-if="selected.lucky" type="warning">Lucky</n-tag><n-tag v-if="selected.alpha" type="error">Alpha</n-tag></n-flex></div>
      </header>
      <div class="pal-inspector__body">
        <section class="detail-facts">
          <n-descriptions :column="2" bordered label-placement="top">
            <n-descriptions-item :label="copy.owner">{{ selected.baseName }}</n-descriptions-item>
            <n-descriptions-item :label="copy.currentTask">{{ activityLabel(selected) }}</n-descriptions-item>
            <n-descriptions-item :label="copy.facility">{{ facilityLabel(selected) }}</n-descriptions-item>
            <n-descriptions-item :label="copy.workSpeed">{{ selected.workSpeed || '-' }}</n-descriptions-item>
            <n-descriptions-item label="HP">{{ selected.hp || '-' }} / {{ selected.maxHp || '-' }}</n-descriptions-item>
            <n-descriptions-item :label="copy.wellbeing">{{ copy.hunger }} {{ rounded(selected.hunger) }} · {{ copy.sanity }} {{ rounded(selected.sanity) }}</n-descriptions-item>
            <n-descriptions-item label="HP IV">{{ selected.iv.hp }}</n-descriptions-item>
            <n-descriptions-item label="Attack / Defense IV">{{ selected.iv.attack }} / {{ selected.iv.defense }}</n-descriptions-item>
          </n-descriptions>
          <section class="detail-section"><h3>{{ copy.work }}</h3><div class="detail-tags"><n-tag v-for="work in selected.workSuitabilities" :key="work.id">{{ workLabels[work.id] || work.id }} Lv.{{ work.level }}</n-tag><span v-if="!selected.workSuitabilities.length">-</span></div></section>
          <section v-if="selected.disabledWork.length" class="detail-section"><h3>{{ copy.disabledWork }}</h3><div class="detail-tags"><n-tag v-for="work in selected.disabledWork" :key="work" type="warning">{{ workLabels[work] || humanizeToken(work) }}</n-tag></div></section>
        </section>
        <section class="detail-skills">
          <section class="detail-section"><h3>{{ copy.passives }}</h3><div class="skill-list"><div v-for="skill in selected.passives" :key="skill.id"><strong>{{ skill.name }}</strong><p>{{ skill.description || skill.id }}</p></div><span v-if="!selected.passives.length">-</span></div></section>
          <section class="detail-section"><h3>{{ copy.partner }}</h3><div v-if="selected.partnerSkill" class="skill-list"><div><strong>{{ selected.partnerSkill.name }}</strong><p>{{ selected.partnerSkill.description }}</p></div></div><span v-else>-</span></section>
          <section class="detail-section"><h3>{{ copy.skills }}</h3><div class="skill-list"><div v-for="skill in selected.equippedSkills" :key="skill.id"><strong>{{ skill.name }}</strong><p>{{ [skill.element, skill.power != null ? `Power ${skill.power}` : '', skill.cooldown != null ? `CD ${skill.cooldown}s` : ''].filter(Boolean).join(' · ') }}</p></div><span v-if="!selected.equippedSkills.length">-</span></div></section>
          <section class="detail-section"><h3>{{ copy.masteredSkills }}</h3><div class="skill-list"><div v-for="skill in selected.masteredSkills" :key="skill.id"><strong>{{ skill.name }}</strong><p>{{ [skill.element, skill.power != null ? `Power ${skill.power}` : '', skill.cooldown != null ? `CD ${skill.cooldown}s` : ''].filter(Boolean).join(' · ') }}</p></div><span v-if="!selected.masteredSkills.length">-</span></div></section>
        </section>
      </div>
    </article>
  </n-modal>
</template>

<style scoped>
:global(.pal-status-modal) { width: min(1380px, 97vw); }
.status-summary,.production-summary { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 14px 0 16px; overflow: hidden; background: var(--app-border); border: 1px solid var(--app-border); border-radius: 8px; gap: 1px; }
.status-summary > div,.production-summary > div { display: grid; min-height: 68px; grid-template-columns: 26px minmax(0,1fr) auto; align-items: center; gap: 9px; padding: 12px 15px; background: var(--app-surface); }
.status-summary .n-icon,.production-summary .n-icon { color: var(--app-accent); font-size: 20px; }.status-summary span,.production-summary span { color: var(--app-ink-muted); font-size: 11px; }.status-summary strong,.production-summary strong { font-family: var(--app-font-data); font-size: 18px; font-variant-numeric: tabular-nums; }.status-summary .alert .n-icon,.status-summary .alert strong { color: var(--app-warning); }
.worker-filters { overflow: hidden; border: 1px solid var(--app-border); border-radius: 8px; }.filter-main { display: grid; grid-template-columns: minmax(240px,1fr) minmax(170px,.55fr) minmax(200px,.65fr) auto; align-items: center; gap: 10px; padding: 14px; }.attention-filter { display: flex; align-items: center; gap: 8px; color: var(--app-ink-secondary); font-size: 12px; white-space: nowrap; }.work-filter { display: grid; grid-template-columns: 110px minmax(0,1fr); align-items: start; gap: 12px; padding: 12px 14px; background: var(--app-surface-muted); border-top: 1px solid var(--app-border); }.work-filter > span { padding-top: 6px; font-weight: 700; }.work-filter > div { display: flex; flex-wrap: wrap; gap: 6px; }.work-filter button { display: flex; align-items: center; gap: 7px; min-height: 30px; padding: 5px 9px; color: var(--app-ink-secondary); background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 6px; cursor: pointer; }.work-filter button.active { color: var(--app-accent); background: var(--app-accent-soft); border-color: color-mix(in srgb,var(--app-accent) 45%,var(--app-border)); }.work-filter small { color: var(--app-ink-muted); font-family: var(--app-font-data); }
.result-count { margin: 11px 0 7px; color: var(--app-ink-muted); font: 12px var(--app-font-data); text-align: right; }.worker-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(390px,1fr)); gap: 8px; }.worker-card { display: grid; grid-template-columns: 72px minmax(0,1fr) 108px; align-items: center; gap: 12px; min-height: 142px; padding: 12px; color: var(--app-ink); background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 8px; cursor: pointer; text-align: left; transition: border-color 180ms cubic-bezier(.22,1,.36,1),background-color 180ms cubic-bezier(.22,1,.36,1); }.worker-card:hover { border-color: color-mix(in srgb,var(--app-accent) 48%,var(--app-border)); }.worker-card.attention { background: color-mix(in srgb,var(--app-warning-soft) 38%,var(--app-surface)); border-color: color-mix(in srgb,var(--app-warning) 36%,var(--app-border)); }.pal-portrait { display: grid; width: 72px; height: 72px; place-items: center; overflow: hidden; background: var(--app-surface-muted); border-radius: 8px; }.pal-portrait img { width: 68px; height: 68px; object-fit: contain; }.worker-main,.worker-name,.worker-task,.worker-vitals { min-width: 0; }.worker-name strong,.worker-name small,.passive-line { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.worker-name small { margin-top: 3px; color: var(--app-ink-muted); font-size: 10px; }.worker-name b { color: var(--app-warning); }.worker-task { display: flex; align-items: center; gap: 7px; margin-top: 9px; }.worker-task > .n-icon { color: var(--app-accent); }.worker-task span { min-width: 0; }.worker-task strong,.worker-task small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.worker-task strong { font-size: 12px; }.worker-task small { margin-top: 2px; color: var(--app-ink-muted); font-size: 10px; }.work-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }.work-chips i { padding: 2px 5px; color: var(--app-accent); background: var(--app-accent-soft); border-radius: 4px; font-size: 9px; font-style: normal; }.passive-line { margin-top: 7px; color: var(--app-ink-secondary); font-size: 10px; }.worker-vitals { display: grid; gap: 5px; }.worker-vitals > span { display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 4px; }.worker-vitals i { color: var(--app-ink-muted); font-size: 9px; font-style: normal; }.worker-vitals strong { font: 10px var(--app-font-data); }.worker-vitals .n-tag { max-width: 108px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.status-empty,.production-empty { min-height: 260px; padding: 44px 16px; }
.production-note { margin: 14px 0; }.production-current { border-bottom: 1px solid var(--app-border); padding-bottom: 22px; }.production-current > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.production-current > header > div { display: flex; align-items: center; gap: 10px; }.production-current header strong,.production-current header small { display: block; }.production-current header small { margin-top: 3px; color: var(--app-ink-muted); }.live-dot { width: 9px; height: 9px; background: var(--app-success); border-radius: 50%; }.production-summary > div { grid-template-columns: 24px minmax(0,1fr); }.production-summary strong { grid-column: 2; font-size: 15px; }.gain-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 1px; overflow: hidden; background: var(--app-border); border: 1px solid var(--app-border); border-radius: 8px; }.gain-row { display: grid; grid-template-columns: 42px minmax(0,1fr) auto; align-items: center; gap: 10px; min-height: 62px; padding: 9px 12px; background: var(--app-surface); }.gain-row img { width: 42px; height: 42px; object-fit: contain; background: var(--app-surface-muted); border-radius: 6px; }.gain-row span,.gain-row strong,.gain-row small { min-width: 0; }.gain-row strong,.gain-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.gain-row small { margin-top: 3px; color: var(--app-ink-muted); font-size: 10px; }.gain-row b { color: var(--app-success); font: 15px var(--app-font-data); }.production-history { padding-top: 22px; }.production-history h3 { margin: 0 0 12px; font-size: 15px; }.history-header { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; padding-right: 8px; }.history-header strong,.history-header small { display: block; }.history-header small { margin-top: 2px; color: var(--app-ink-muted); font-size: 10px; }.history-header b { color: var(--app-success); font: 14px var(--app-font-data); }.gain-grid.compact { margin-bottom: 12px; }
.pal-inspector { position: relative; width: min(1180px,94vw); max-height: 90dvh; overflow: auto; padding: clamp(28px,3vw,48px); color: var(--app-ink); background: var(--app-surface); border: 1px solid color-mix(in srgb,var(--app-accent) 24%,var(--app-border)); border-radius: 28px; box-shadow: 0 40px 120px rgb(0 0 0 / 30%); }.pal-inspector__close { position: absolute; z-index: 3; top: 20px; right: 20px; display: grid; width: 44px; height: 44px; place-items: center; color: var(--app-ink); background: var(--app-surface-muted); border: 0; border-radius: 50%; cursor: pointer; font-size: 20px; }.detail-hero { display: grid; grid-template-columns: 210px minmax(0,1fr); align-items: center; gap: 34px; margin-bottom: 32px; }.detail-portrait { position: relative; display: grid; width: 210px; height: 210px; place-items: center; overflow: hidden; background: radial-gradient(circle,var(--app-accent-soft),var(--app-surface-muted) 68%); border-radius: 38% 38% 24px 24px; }.detail-portrait span { position: absolute; inset: 28px; border: 1px dashed color-mix(in srgb,var(--app-accent) 42%,transparent); border-radius: 50%; }.detail-portrait img { position: relative; width: 180px; height: 180px; object-fit: contain; filter: drop-shadow(0 18px 16px rgb(0 0 0 / 18%)); }.detail-hero small { color: var(--app-accent); font: 700 10px var(--app-font-data); letter-spacing: .12em; text-transform: uppercase; }.detail-hero h2 { margin: 10px 0 0; font-size: clamp(34px,3vw,52px); line-height: 1; }.detail-hero p { margin: 10px 0 14px; color: var(--app-ink-muted); font-size: 14px; }.pal-inspector__body { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }.detail-facts,.detail-skills { min-width: 0; }.detail-section { margin-top: 12px; padding: 18px; background: var(--app-surface-muted); border: 0; border-radius: 16px; }.detail-section h3 { margin: 0 0 12px; font-size: 14px; }.detail-tags { display: flex; flex-wrap: wrap; gap: 7px; }.skill-list { display: grid; gap: 8px; }.skill-list > div { padding: 12px 14px; background: var(--app-surface); border-radius: 10px; }.skill-list p { margin: 5px 0 0; color: var(--app-ink-muted); font-size: 11px; line-height: 1.55; }
@media (max-width: 1050px) { .filter-main { grid-template-columns: 1fr 1fr; }.status-summary,.production-summary { grid-template-columns: repeat(2,1fr); }.worker-grid { grid-template-columns: 1fr; } }
@media (max-width: 680px) { :global(.pal-status-modal) { width: 100vw; max-width: 100vw; }.status-summary,.production-summary,.filter-main { grid-template-columns: 1fr; }.work-filter { grid-template-columns: 1fr; }.worker-card { grid-template-columns: 62px minmax(0,1fr); }.pal-portrait { width: 62px; height: 62px; }.pal-portrait img { width: 58px; height: 58px; }.worker-vitals { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; padding-top: 10px; border-top: 1px solid var(--app-border); }.worker-vitals .n-tag { grid-column: 1 / -1; max-width: none; }.gain-grid { grid-template-columns: 1fr; }.pal-inspector { width: 96vw; padding: 24px 16px; border-radius: 22px; }.detail-hero { grid-template-columns: 1fr; justify-items: center; text-align: center; }.detail-portrait { width: 170px; height: 170px; }.detail-portrait img { width: 150px; height: 150px; }.pal-inspector__body { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .worker-card { transition: none; } }
</style>
