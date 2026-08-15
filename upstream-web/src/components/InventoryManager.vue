<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Box, ChevronDown, ChevronUp, Package, Refresh, Search, Stack2 } from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";
import unknownItem from "@/assets/pals/unknown.png";
import { enrichInventory, itemIcon } from "@/utils/gameData";
import { requestCached } from "@/utils/requestCache";

const props = defineProps({ show: Boolean, embedded: { type: Boolean, default: false } });
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const loading = ref(false);
const error = ref("");
const items = ref([]);
const query = ref("");
const category = ref("all");
const expanded = ref("");
const zh = computed(() => locale.value === "zh");
const copy = computed(() => zh.value ? {
  title: "全服库存", subtitle: "汇总玩家背包、据点仓库和公会箱，并定位到具体容器与槽位。", refresh: "重新解析",
  search: "搜索物品名称或内部 ID", all: "全部分类", types: "物品种类", total: "物品总数", containers: "涉及容器",
  item: "物品", category: "分类", count: "总数量", locations: "存放位置", empty: "没有符合条件的物品",
} : {
  title: "Global inventory", subtitle: "Aggregate player, base, and guild storage with exact container and slot locations.", refresh: "Parse again",
  search: "Search item name or internal ID", all: "All categories", types: "Item types", total: "Total items", containers: "Containers",
  item: "Item", category: "Category", count: "Total", locations: "Locations", empty: "No matching items",
});

const categories = computed(() => [
  { label: copy.value.all, value: "all" },
  ...[...new Set(items.value.map((item) => item.category))].sort().map((value) => ({ label: value, value })),
]);
const visible = computed(() => {
  const text = query.value.trim().toLowerCase();
  return items.value.filter((item) => (category.value === "all" || item.category === category.value)
    && (!text || `${item.name} ${item.itemId}`.toLowerCase().includes(text)));
});
const totalCount = computed(() => items.value.reduce((sum, item) => sum + item.count, 0));
const containerCount = computed(() => new Set(items.value.flatMap((item) => item.locations.map((row) => row.container_id))).size);
const locationText = (location) => [
  location.owner,
  location.label,
  location.x != null && location.y != null ? `${location.x}, ${location.y}` : "",
].filter(Boolean).join(" · ");
const useFallback = (event) => { if (event.target.src !== unknownItem) event.target.src = unknownItem; };
const load = async ({ force = false } = {}) => {
  loading.value = true; error.value = "";
  try {
    const payload = await requestCached("world-data", async () => {
      const response = await api.getWorldData();
      return response?.data?.value || {};
    }, { force });
    const data = payload?.data || {};
    items.value = enrichInventory(Array.isArray(data.inventory) ? data.inventory : []);
  } catch (reason) {
    items.value = []; error.value = reason?.message || "Save data unavailable";
  } finally { loading.value = false; }
};
watch(() => props.show, (show) => show && load(), { immediate: true });
</script>

<template>
  <tool-surface :show="show" class="inventory-modal" :title="copy.title" width="min(96vw, 1240px)" :embedded="embedded" @update:show="emit('update:show', $event)">
    <template #description>{{ copy.subtitle }}</template>
    <template #header-extra><n-button quaternary :loading="loading" @click="load({ force: true })"><template #icon><n-icon><Refresh /></n-icon></template>{{ copy.refresh }}</n-button></template>
    <div class="inventory-summary">
      <div><n-icon><Package /></n-icon><span>{{ copy.types }}</span><strong>{{ items.length }}</strong></div>
      <div><n-icon><Stack2 /></n-icon><span>{{ copy.total }}</span><strong>{{ totalCount.toLocaleString() }}</strong></div>
      <div><n-icon><Box /></n-icon><span>{{ copy.containers }}</span><strong>{{ containerCount }}</strong></div>
    </div>
    <n-alert v-if="error" type="error" :bordered="false" class="inventory-error">{{ error }}</n-alert>
    <div class="inventory-toolbar">
      <n-input v-model:value="query" clearable :placeholder="copy.search"><template #prefix><n-icon><Search /></n-icon></template></n-input>
      <n-select v-model:value="category" :options="categories" :consistent-menu-width="false" />
      <span>{{ visible.length }} / {{ items.length }}</span>
    </div>
    <div class="inventory-list">
      <div class="inventory-head"><span>{{ copy.item }}</span><span>{{ copy.category }}</span><span>{{ copy.count }}</span><span>{{ copy.locations }}</span><span /></div>
      <div v-for="item in visible" :key="item.itemId" class="inventory-group">
        <button type="button" class="inventory-row" :aria-expanded="expanded === item.itemId" @click="expanded = expanded === item.itemId ? '' : item.itemId">
          <span class="item-identity"><img :src="itemIcon(item.itemId)" alt="" @error="useFallback" /><span><strong>{{ item.name }}</strong><small>{{ item.itemId }}</small></span></span>
          <span><n-tag size="small" :bordered="false">{{ item.category }}</n-tag></span>
          <strong class="item-count">{{ item.count.toLocaleString() }}</strong>
          <span>{{ item.locations.length }} {{ zh ? '处' : 'locations' }}</span>
          <n-icon><ChevronUp v-if="expanded === item.itemId" /><ChevronDown v-else /></n-icon>
        </button>
        <div v-if="expanded === item.itemId" class="location-list">
          <div v-for="(location, index) in item.locations" :key="`${location.container_id}:${location.slot}:${index}`">
            <span><n-tag size="small" :type="location.kind === 'player' ? 'info' : location.kind === 'guild' ? 'warning' : 'success'">{{ location.kind === 'player' ? (zh ? '玩家' : 'Player') : location.kind === 'guild' ? (zh ? '公会' : 'Guild') : (zh ? '据点' : 'Base') }}</n-tag><strong>{{ locationText(location) }}</strong></span>
            <code>{{ location.container_id }}</code>
            <span>{{ zh ? '槽位' : 'Slot' }} {{ Number(location.slot) + 1 }}</span>
            <strong>x {{ Number(location.count || 0).toLocaleString() }}</strong>
          </div>
        </div>
      </div>
      <n-empty v-if="!loading && !visible.length" :description="copy.empty" />
    </div>
  </tool-surface>
</template>

<style scoped>
.inventory-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 16px; overflow: hidden; background: var(--app-border); border: 1px solid var(--app-border); border-radius: 8px; gap: 1px; }
.inventory-summary > div { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; padding: 14px 16px; background: var(--app-surface); }.inventory-summary .n-icon { color: var(--app-accent); font-size: 20px; }.inventory-summary span { color: var(--app-ink-muted); }.inventory-summary strong { font-family: var(--app-font-data); font-size: 20px; }
.inventory-error { margin-bottom: 14px; }.inventory-toolbar { display: grid; grid-template-columns: minmax(220px, 420px) minmax(150px, 220px) 1fr; align-items: center; gap: 10px; margin-bottom: 14px; }.inventory-toolbar > span { color: var(--app-ink-muted); font-family: var(--app-font-data); text-align: right; }
.inventory-list { overflow: hidden; border: 1px solid var(--app-border); border-radius: 8px; }.inventory-head,.inventory-row { display: grid; grid-template-columns: minmax(260px, 1.5fr) minmax(120px, .7fr) 120px minmax(120px, .7fr) 24px; align-items: center; gap: 14px; }.inventory-head { padding: 10px 16px; color: var(--app-ink-muted); background: var(--app-surface-muted); font-size: 12px; font-weight: 700; }
.inventory-row { width: 100%; min-height: 68px; padding: 10px 16px; color: var(--app-ink); background: var(--app-surface); border: 0; border-top: 1px solid var(--app-border); cursor: pointer; text-align: left; }.inventory-group:first-of-type .inventory-row { border-top: 0; }.inventory-row:hover { background: color-mix(in srgb, var(--app-accent-soft) 45%, var(--app-surface)); }
.item-identity { display: flex; min-width: 0; align-items: center; gap: 11px; }.item-identity img { width: 42px; height: 42px; flex: 0 0 42px; object-fit: contain; background: var(--app-surface-muted); border-radius: 6px; }.item-identity span { min-width: 0; }.item-identity strong,.item-identity small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.item-identity small { margin-top: 3px; color: var(--app-ink-muted); font-family: var(--app-font-data); font-size: 10px; }.item-count { font-family: var(--app-font-data); font-size: 17px; }
.location-list { background: var(--app-surface-muted); border-top: 1px solid var(--app-border); }.location-list > div { display: grid; grid-template-columns: minmax(220px, 1.3fr) minmax(180px, 1fr) 100px 110px; align-items: center; gap: 12px; min-height: 50px; padding: 9px 16px; border-top: 1px solid var(--app-border); }.location-list > div:first-child { border-top: 0; }.location-list > div > span:first-child { display: flex; min-width: 0; align-items: center; gap: 8px; }.location-list code { overflow: hidden; color: var(--app-ink-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 760px) { .inventory-toolbar { grid-template-columns: 1fr; }.inventory-toolbar > span { text-align: left; }.inventory-list { overflow-x: auto; }.inventory-head,.inventory-row,.location-list { min-width: 780px; } }
@media (max-width: 560px) { .inventory-summary { grid-template-columns: 1fr; }.inventory-summary > div { padding: 11px 14px; } }
</style>
