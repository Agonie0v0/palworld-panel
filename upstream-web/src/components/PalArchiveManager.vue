<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, Dna, Filter, Hammer, Paw, Refresh, Search, Stars, Trophy } from "@vicons/tabler";
import ApiService from "@/service/api";
import PalDetailInspector from "@/components/PalDetailInspector.vue";
import ToolSurface from "@/components/ToolSurface.vue";
import unknownPal from "@/assets/pals/unknown.png";
import { enrichPals, palPortrait } from "@/utils/gameData";
import { filterAndSortPals } from "@/utils/gameDataCore";

const props = defineProps({ show: Boolean, embedded: { type: Boolean, default: false } });
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const loading = ref(false);
const error = ref("");
const pals = ref([]);
const query = ref("");
const owner = ref("all");
const flag = ref("all");
const sort = ref("work");
const selectedWork = ref([]);
const minWorkLevel = ref(1);
const selectedPassives = ref([]);
const advancedOpen = ref(false);
const criteria = ref({ minLevel: 0, minStars: 0, minIvHp: 0, minIvAttack: 0, minIvDefense: 0, minIvAverage: 0 });
const limit = ref(60);
const selected = ref(null);
const zh = computed(() => locale.value === "zh");
const copy = computed(() => zh.value ? {
  title: "帕鲁仓库", subtitle: "按归属、工作适应性、被动技能、星级和个体值筛选全服帕鲁。", refresh: "重新解析",
  total: "全部帕鲁", species: "帕鲁种类", lucky: "闪光", alpha: "头目", highest: "最高等级", search: "搜索帕鲁、昵称、归属或 ID",
  allOwners: "全部归属", all: "全部", sortWork: "工作适应性", sortLevel: "等级", sortIv: "平均个体", work: "工作技能", minWork: "最低工作等级",
  advanced: "高级筛选", passive: "被动技能", minLevel: "最低等级", minStars: "最低星级", ivHp: "生命个体", ivAttack: "攻击个体", ivDefense: "防御个体", ivAverage: "平均个体",
  clear: "清空筛选", empty: "没有符合条件的帕鲁", loadMore: "加载更多", detail: "帕鲁详情", owner: "归属", location: "位置", stats: "基础数据", partner: "伙伴技能", equipped: "已装备主动技能", mastered: "已掌握主动技能",
} : {
  title: "Pal archive", subtitle: "Filter every Pal by owner, work suitability, passives, stars, and IVs.", refresh: "Parse again",
  total: "All Pals", species: "Species", lucky: "Lucky", alpha: "Alpha", highest: "Highest level", search: "Search Pal, nickname, owner, or ID",
  allOwners: "All owners", all: "All", sortWork: "Work suitability", sortLevel: "Level", sortIv: "Average IV", work: "Work skills", minWork: "Minimum work level",
  advanced: "Advanced filters", passive: "Passive skills", minLevel: "Minimum level", minStars: "Minimum stars", ivHp: "HP IV", ivAttack: "Attack IV", ivDefense: "Defense IV", ivAverage: "Average IV",
  clear: "Clear filters", empty: "No matching Pals", loadMore: "Load more", detail: "Pal details", owner: "Owner", location: "Location", stats: "Stats", partner: "Partner skill", equipped: "Equipped active skills", mastered: "Mastered active skills",
});
const workLabels = computed(() => zh.value ? {
  EmitFlame: "生火", Watering: "浇水", Seeding: "播种", GenerateElectricity: "发电", Handcraft: "手工作业", Collection: "采集",
  Deforest: "伐木", Mining: "采矿", ProductMedicine: "制药", Cool: "冷却", Transport: "搬运", MonsterFarm: "牧场",
} : {
  EmitFlame: "Kindling", Watering: "Watering", Seeding: "Planting", GenerateElectricity: "Electricity", Handcraft: "Handiwork", Collection: "Gathering",
  Deforest: "Lumbering", Mining: "Mining", ProductMedicine: "Medicine", Cool: "Cooling", Transport: "Transport", MonsterFarm: "Farming",
});

const owners = computed(() => {
  const values = new Map();
  pals.value.forEach((pal) => values.set(pal.location_key || pal.owner_uid, { label: `${pal.ownerKind === 'base' ? (zh.value ? '据点' : 'Base') : (zh.value ? '玩家' : 'Player')} · ${pal.ownerName}`, value: pal.location_key || pal.owner_uid }));
  return [{ label: copy.value.allOwners, value: "all" }, ...[...values.values()].filter((row) => row.value)];
});
const workOptions = computed(() => Object.entries(workLabels.value).map(([id, label]) => ({ id, label, count: pals.value.filter((pal) => pal.workSuitabilities.some((item) => item.id === id)).length })));
const passiveOptions = computed(() => {
  const values = new Map();
  pals.value.forEach((pal) => pal.passives.forEach((skill) => values.set(skill.id, { label: skill.name, value: skill.id })));
  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label));
});
const filtered = computed(() => filterAndSortPals(pals.value, { query: query.value, owner: owner.value, flag: flag.value, sort: sort.value, work: selectedWork.value, minWorkLevel: minWorkLevel.value, passives: selectedPassives.value, ...criteria.value }));
const visible = computed(() => filtered.value.slice(0, limit.value));
const speciesCount = computed(() => new Set(pals.value.map((pal) => pal.palId)).size);
const activeFilterCount = computed(() => selectedWork.value.length + selectedPassives.value.length + Object.values(criteria.value).filter(Boolean).length);
const toggleWork = (id) => { selectedWork.value = selectedWork.value.includes(id) ? selectedWork.value.filter((value) => value !== id) : [...selectedWork.value, id]; };
const clearFilters = () => { query.value = ""; owner.value = "all"; flag.value = "all"; sort.value = "work"; selectedWork.value = []; minWorkLevel.value = 1; selectedPassives.value = []; criteria.value = { minLevel: 0, minStars: 0, minIvHp: 0, minIvAttack: 0, minIvDefense: 0, minIvAverage: 0 }; };
const location = (pal) => pal.player_location?.kind === "storage"
  ? (zh.value ? `终端第 ${pal.player_location.page} 页 · 第 ${pal.player_location.row} 行第 ${pal.player_location.column} 个` : `Palbox page ${pal.player_location.page}, row ${pal.player_location.row}, column ${pal.player_location.column}`)
  : pal.player_location?.kind === "party" ? (zh.value ? `队伍第 ${pal.player_location.position} 位` : `Party position ${pal.player_location.position}`)
    : pal.location_kind === "base" ? (pal.facility || (zh.value ? "据点工作中" : "Working at base")) : (zh.value ? "玩家持有" : "Player-owned");
const useFallback = (event) => {
  const image = event.currentTarget;
  if (image.dataset.fallback === "true") return;
  image.dataset.fallback = "true";
  image.src = unknownPal;
};
const load = async () => {
  loading.value = true; error.value = "";
  try {
    const response = await api.getWorldData();
    const data = response?.data?.value?.data || {};
    pals.value = enrichPals(Array.isArray(data.pals) ? data.pals : []);
    limit.value = 60;
  } catch (reason) { pals.value = []; error.value = reason?.message || "Save data unavailable"; }
  finally { loading.value = false; }
};
watch(() => props.show, (show) => show && load(), { immediate: true });
watch([query, owner, flag, sort, selectedWork, selectedPassives, criteria], () => { limit.value = 60; }, { deep: true });
</script>

<template>
  <tool-surface :show="show" class="pal-archive-modal" :title="copy.title" width="min(97vw, 1380px)" :embedded="embedded" @update:show="emit('update:show', $event)">
    <template #description>{{ copy.subtitle }}</template>
    <template #header-extra><n-button quaternary :loading="loading" @click="load"><template #icon><n-icon><Refresh /></n-icon></template>{{ copy.refresh }}</n-button></template>
    <div class="pal-summary">
      <div><n-icon><Paw /></n-icon><span>{{ copy.total }}</span><strong>{{ pals.length }}</strong></div>
      <div><n-icon><Dna /></n-icon><span>{{ copy.species }}</span><strong>{{ speciesCount }}</strong></div>
      <div><n-icon><Stars /></n-icon><span>{{ copy.lucky }}</span><strong>{{ pals.filter((pal) => pal.lucky).length }}</strong></div>
      <div><n-icon><Trophy /></n-icon><span>{{ copy.alpha }}</span><strong>{{ pals.filter((pal) => pal.alpha).length }}</strong></div>
      <div><n-icon><ChevronDown /></n-icon><span>{{ copy.highest }}</span><strong>Lv.{{ Math.max(0, ...pals.map((pal) => pal.level)) }}</strong></div>
    </div>
    <n-alert v-if="error" type="error" :bordered="false" class="pal-error">{{ error }}</n-alert>
    <section class="pal-filters">
      <div class="pal-filter-main">
        <n-input v-model:value="query" clearable :placeholder="copy.search"><template #prefix><n-icon><Search /></n-icon></template></n-input>
        <n-select v-model:value="owner" :options="owners" filterable :consistent-menu-width="false" />
        <n-radio-group v-model:value="flag" size="small"><n-radio-button value="all">{{ copy.all }}</n-radio-button><n-radio-button value="lucky">{{ copy.lucky }}</n-radio-button><n-radio-button value="alpha">{{ copy.alpha }}</n-radio-button></n-radio-group>
        <n-radio-group v-model:value="sort" size="small"><n-radio-button value="work">{{ copy.sortWork }}</n-radio-button><n-radio-button value="level">{{ copy.sortLevel }}</n-radio-button><n-radio-button value="iv">{{ copy.sortIv }}</n-radio-button></n-radio-group>
      </div>
      <div class="work-filter">
        <div class="filter-heading"><span><n-icon><Hammer /></n-icon>{{ copy.work }}</span><n-select v-model:value="minWorkLevel" size="small" :options="[1,2,3,4,5].map(value => ({ label: `Lv.${value}+`, value }))" /></div>
        <div class="work-tags"><button v-for="work in workOptions" :key="work.id" type="button" :class="{ active: selectedWork.includes(work.id) }" @click="toggleWork(work.id)"><span>{{ work.label }}</span><small>{{ work.count }}</small></button></div>
      </div>
      <div class="advanced-toggle"><n-button quaternary @click="advancedOpen = !advancedOpen"><template #icon><n-icon><Filter /></n-icon></template>{{ copy.advanced }}<n-tag v-if="activeFilterCount" size="small" round>{{ activeFilterCount }}</n-tag></n-button><n-button v-if="query || owner !== 'all' || flag !== 'all' || activeFilterCount" quaternary type="error" @click="clearFilters">{{ copy.clear }}</n-button></div>
      <div v-if="advancedOpen" class="advanced-filter">
        <n-form-item :label="copy.passive"><n-select v-model:value="selectedPassives" multiple filterable clearable :max-tag-count="2" :options="passiveOptions" /></n-form-item>
        <n-form-item :label="copy.minLevel"><n-input-number v-model:value="criteria.minLevel" :min="0" :max="999" /></n-form-item>
        <n-form-item :label="copy.minStars"><n-input-number v-model:value="criteria.minStars" :min="0" :max="4" /></n-form-item>
        <n-form-item :label="copy.ivHp"><n-input-number v-model:value="criteria.minIvHp" :min="0" :max="100" /></n-form-item>
        <n-form-item :label="copy.ivAttack"><n-input-number v-model:value="criteria.minIvAttack" :min="0" :max="100" /></n-form-item>
        <n-form-item :label="copy.ivDefense"><n-input-number v-model:value="criteria.minIvDefense" :min="0" :max="100" /></n-form-item>
        <n-form-item :label="copy.ivAverage"><n-input-number v-model:value="criteria.minIvAverage" :min="0" :max="100" /></n-form-item>
      </div>
    </section>

    <div class="pal-results"><span>{{ filtered.length }} / {{ pals.length }}</span></div>
    <div class="pal-grid" :aria-busy="loading">
      <button v-for="pal in visible" :key="pal.instance_id" type="button" class="pal-card" @click="selected = pal">
        <span class="pal-portrait"><img :src="palPortrait(pal.palId)" alt="" @error="useFallback" /><i v-if="pal.lucky">★</i></span>
        <span class="pal-card-copy"><span class="pal-name"><strong>{{ pal.name }}</strong><small>{{ pal.speciesName }} · Lv.{{ pal.level }}<b v-if="pal.stars"> {{ '★'.repeat(pal.stars) }}</b></small></span><span class="pal-owner">{{ pal.ownerName }}<small>{{ location(pal) }}</small></span><span class="pal-work"><i v-for="work in pal.workSuitabilities" :key="work.id">{{ workLabels[work.id] || work.id }} {{ work.level }}</i></span></span>
        <span class="pal-iv"><strong>{{ pal.iv.average }}</strong><small>IV</small></span>
      </button>
    </div>
    <n-empty v-if="!loading && !visible.length" :description="copy.empty" />
    <div v-if="visible.length < filtered.length" class="load-more"><n-button @click="limit += 60">{{ copy.loadMore }} ({{ filtered.length - visible.length }})</n-button></div>
  </tool-surface>

  <pal-detail-inspector
    v-if="selected"
    :show="true"
    :pal="{ ...selected, locationLabel: location(selected) }"
    context="archive"
    @update:show="$event || (selected = null)"
  />
</template>

<style scoped>
.pal-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-bottom: 16px; overflow: hidden; background: var(--app-border); border: 1px solid var(--app-border); border-radius: 8px; gap: 1px; }.pal-summary > div { display: grid; grid-template-columns: auto 1fr; gap: 3px 9px; align-items: center; padding: 13px 15px; background: var(--app-surface); }.pal-summary .n-icon { grid-row: 1 / 3; color: var(--app-accent); font-size: 20px; }.pal-summary span { color: var(--app-ink-muted); font-size: 11px; }.pal-summary strong { font-family: var(--app-font-data); font-size: 18px; }
.pal-error { margin-bottom: 14px; }.pal-filters { border: 1px solid var(--app-border); border-radius: 8px; background: var(--app-surface); }.pal-filter-main { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(180px, .7fr) auto auto; align-items: center; gap: 10px; padding: 14px; }.work-filter { padding: 13px 14px; border-top: 1px solid var(--app-border); }.filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }.filter-heading > span { display: flex; align-items: center; gap: 7px; font-weight: 700; }.filter-heading .n-select { width: 110px; }.work-tags { display: flex; flex-wrap: wrap; gap: 6px; }.work-tags button { display: flex; align-items: center; gap: 7px; min-height: 30px; padding: 5px 9px; color: var(--app-ink-secondary); background: var(--app-surface-muted); border: 1px solid var(--app-border); border-radius: 6px; cursor: pointer; }.work-tags button.active { color: var(--app-accent); background: var(--app-accent-soft); border-color: color-mix(in srgb, var(--app-accent) 45%, var(--app-border)); }.work-tags small { color: var(--app-ink-muted); font-family: var(--app-font-data); }.advanced-toggle { display: flex; justify-content: space-between; padding: 5px 8px; border-top: 1px solid var(--app-border); }.advanced-filter { display: grid; grid-template-columns: minmax(220px, 1.5fr) repeat(6, minmax(100px, .5fr)); gap: 10px; padding: 12px 14px 0; background: var(--app-surface-muted); border-top: 1px solid var(--app-border); }.advanced-filter :deep(.n-form-item) { min-width: 0; }.advanced-filter :deep(.n-input-number) { width: 100%; }
.pal-results { display: flex; justify-content: flex-end; margin: 12px 0 7px; color: var(--app-ink-muted); font-family: var(--app-font-data); font-size: 12px; }.pal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 8px; }.pal-card { display: grid; grid-template-columns: 66px minmax(0, 1fr) 42px; align-items: center; gap: 12px; min-height: 100px; padding: 11px; color: var(--app-ink); background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 8px; cursor: pointer; text-align: left; transition: border-color 180ms cubic-bezier(.22,1,.36,1), box-shadow 180ms cubic-bezier(.22,1,.36,1); }.pal-card:hover { border-color: color-mix(in srgb, var(--app-accent) 48%, var(--app-border)); box-shadow: var(--app-shadow-sm); }.pal-portrait { position: relative; display: grid; width: 66px; height: 66px; place-items: center; overflow: hidden; background: var(--app-surface-muted); border-radius: 8px; }.pal-portrait img { width: 100%; height: 100%; object-fit: contain; }.pal-portrait i { position: absolute; top: 3px; right: 4px; color: #b87922; font-style: normal; }.pal-card-copy,.pal-name,.pal-owner { display: block; min-width: 0; }.pal-name strong,.pal-name small,.pal-owner,.pal-owner small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.pal-name small,.pal-owner small { margin-top: 3px; color: var(--app-ink-muted); font-size: 10px; }.pal-name b { color: #b87922; }.pal-owner { margin-top: 8px; color: var(--app-ink-secondary); font-size: 11px; }.pal-work { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }.pal-work i { padding: 2px 5px; color: var(--app-accent); background: var(--app-accent-soft); border-radius: 4px; font-size: 9px; font-style: normal; }.pal-iv { text-align: center; }.pal-iv strong,.pal-iv small { display: block; }.pal-iv strong { font-family: var(--app-font-data); font-size: 20px; }.pal-iv small { color: var(--app-ink-muted); font-size: 10px; }.load-more { display: flex; justify-content: center; padding: 18px 0 2px; }
.archive-inspector { position: relative; width: min(1160px,94vw); max-height: 90dvh; overflow-x: hidden; overflow-y: auto; padding: clamp(28px,3vw,48px); color: var(--app-ink); background: var(--app-surface); border: 1px solid color-mix(in srgb,var(--app-accent) 24%,var(--app-border)); border-radius: 28px; box-shadow: 0 40px 120px rgb(0 0 0 / 30%); }.archive-inspector__close { position: absolute; z-index: 3; top: 20px; right: 20px; display: grid; width: 44px; height: 44px; place-items: center; color: var(--app-ink); background: var(--app-surface-muted); border: 0; border-radius: 50%; cursor: pointer; font-size: 20px; }.pal-detail-hero { display: grid; grid-template-columns: 210px minmax(0,1fr); align-items: center; gap: 34px; margin-bottom: 32px; }.archive-portrait { position: relative; display: grid; width: 210px; height: 210px; place-items: center; overflow: hidden; background: radial-gradient(circle,var(--app-accent-soft),var(--app-surface-muted) 68%); border-radius: 38% 38% 24px 24px; }.archive-portrait span { position: absolute; inset: 28px; border: 1px dashed color-mix(in srgb,var(--app-accent) 42%,transparent); border-radius: 50%; }.archive-portrait img { position: relative; width: 180px; height: 180px; object-fit: contain; filter: drop-shadow(0 18px 16px rgb(0 0 0 / 18%)); }.pal-detail-hero small { color: var(--app-accent); font: 700 10px var(--app-font-data); letter-spacing: .12em; text-transform: uppercase; }.pal-detail-hero h2 { margin: 10px 0 0; font-size: clamp(34px,3vw,52px); line-height: 1; }.pal-detail-hero p { margin: 10px 0 14px; color: var(--app-ink-muted); font-size: 14px; }.archive-inspector__body { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 16px; }.archive-inspector__body > section { min-width: 0; }.detail-section { min-width: 0; margin-top: 12px; padding: 18px; background: var(--app-surface-muted); border: 0; border-radius: 16px; }.detail-section h3 { margin: 0 0 12px; font-size: 14px; }.detail-tags { display: flex; min-width: 0; flex-wrap: wrap; gap: 7px; }.skill-row,.skill-list > div { min-width: 0; padding: 12px 14px; background: var(--app-surface); border-radius: 10px; }.skill-row strong,.skill-row p,.skill-list strong,.skill-list p { overflow-wrap: anywhere; word-break: break-word; }.skill-row p,.skill-list p { margin: 5px 0 0; color: var(--app-ink-muted); font-size: 11px; line-height: 1.55; }.skill-list { display: grid; min-width: 0; gap: 8px; }
@media (max-width: 1050px) { .pal-filter-main { grid-template-columns: 1fr 1fr; }.advanced-filter { grid-template-columns: repeat(3, 1fr); }.pal-summary { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 640px) { .pal-summary { grid-template-columns: 1fr 1fr; }.pal-filter-main { grid-template-columns: 1fr; }.advanced-filter { grid-template-columns: 1fr 1fr; }.pal-grid { grid-template-columns: 1fr; }.pal-card { grid-template-columns: 60px minmax(0,1fr) 38px; }.pal-portrait { width: 60px; height: 60px; }.archive-inspector { width: 96vw; padding: 24px 16px; border-radius: 22px; }.pal-detail-hero { grid-template-columns: 1fr; justify-items: center; text-align: center; }.archive-portrait { width: 170px; height: 170px; }.archive-portrait img { width: 150px; height: 150px; }.archive-inspector__body { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .pal-card { transition: none; } }
</style>
