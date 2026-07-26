<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Activity,
  AlertTriangle,
  Apple,
  BuildingCommunity,
  Heart,
  Paw,
  Refresh,
  Search,
  Tools,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";
import palCatalog from "@/assets/pal.json";
import unknownPal from "@/assets/pals/unknown.png";
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
const selectedBase = ref("all");
const search = ref("");
const attentionOnly = ref(false);

const zh = computed(() => locale.value === "zh");
const copy = computed(() =>
  zh.value
    ? {
        title: "帕鲁状态",
        subtitle: "查看各据点工作帕鲁的当前任务、身体状态与异常情况。",
        refresh: "重新解析",
        allBases: "全部据点",
        search: "搜索帕鲁、工作、设施或异常",
        attentionOnly: "只看需关注",
        workers: "工作帕鲁",
        bases: "有帕鲁的据点",
        attention: "需关注",
        pal: "帕鲁",
        activity: "当前状态",
        condition: "身体状态",
        assignment: "工作设施",
        hunger: "饱食度",
        sanity: "SAN",
        level: "等级",
        healthy: "状态正常",
        autonomous: "自主工作",
        working: "工作中",
        assigned: "已分配",
        event: "特殊状态",
        noFacility: "未记录设施",
        empty: "当前筛选条件下没有工作帕鲁",
        unavailable: "存档数据读取失败，请确认存档源与解析器状态。",
      }
    : {
        title: "Pal status",
        subtitle:
          "Monitor current work, wellbeing, and alerts across every base.",
        refresh: "Parse again",
        allBases: "All bases",
        search: "Search Pals, work, facilities, or conditions",
        attentionOnly: "Needs attention only",
        workers: "Worker Pals",
        bases: "Active bases",
        attention: "Need attention",
        pal: "Pal",
        activity: "Current status",
        condition: "Wellbeing",
        assignment: "Facility",
        hunger: "Hunger",
        sanity: "SAN",
        level: "Level",
        healthy: "Healthy",
        autonomous: "Autonomous",
        working: "Working",
        assigned: "Assigned",
        event: "Special event",
        noFacility: "No facility recorded",
        empty: "No worker Pals match these filters",
        unavailable:
          "Save data could not be loaded. Check the save source and parser.",
      },
);

const palNames = computed(() => palCatalog[zh.value ? "zh" : "en"] || {});
const rows = computed(() => buildPalWorkerRows(bases.value, palNames.value));
const visibleRows = computed(() =>
  filterPalWorkerRows(rows.value, {
    baseId: selectedBase.value,
    search: search.value,
    attentionOnly: attentionOnly.value,
  }),
);
const activeBases = computed(
  () => new Set(rows.value.map((row) => row.baseId)).size,
);
const attentionCount = computed(
  () => rows.value.filter((row) => row.attention).length,
);
const baseOptions = computed(() => [
  { label: `${copy.value.allBases} (${rows.value.length})`, value: "all" },
  ...bases.value
    .filter((base) => (base.workers || []).length)
    .map((base, index) => ({
      label: `${base.display_name || base.name || base.id || `Base ${index + 1}`} (${(base.workers || []).length})`,
      value: String(base.id || `base-${index + 1}`),
    })),
]);

const result = (response) => response?.data?.value || {};
const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    const response = await api.getWorldData();
    const data = result(response).data || {};
    bases.value = Array.isArray(data.bases) ? data.bases : [];
  } catch {
    bases.value = [];
    loadError.value = copy.value.unavailable;
  } finally {
    loading.value = false;
  }
};

const portrait = (row) =>
  row.assetKey
    ? new URL(`../assets/pals/${row.assetKey}.png`, import.meta.url).href
    : unknownPal;
const useFallbackPortrait = (event) => {
  if (event.target.src !== unknownPal) event.target.src = unknownPal;
};
const rounded = (value) => (value === null ? "-" : `${Math.round(value)}%`);
const meterStatus = (value, warning) => {
  if (value === null) return "default";
  if (value < warning) return "error";
  if (value < warning + 20) return "warning";
  return "success";
};
const activityLabel = (row) => {
  if (zh.value) return row.activityLabel;
  if (row.activityKind === "working") {
    const detail = String(row.workSuitability || "")
      .replace(/^EPalWorkSuitability::/i, "")
      .replace(/_/g, " ")
      .trim();
    return detail ? `${copy.value.working} · ${detail}` : copy.value.working;
  }
  return copy.value[row.activityKind] || row.activityLabel;
};
const activityIcon = (kind) =>
  kind === "event" ? AlertTriangle : kind === "working" ? Tools : Activity;

watch(
  () => props.show,
  (show) => show && load(),
  { immediate: true },
);
</script>

<template>
  <tool-surface
    :show="show"
    class="pal-status-modal"
    :title="copy.title"
    width="min(96vw, 1280px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <template #description>{{ copy.subtitle }}</template>
    <template #header-extra>
      <n-button quaternary :loading="loading" @click="load">
        <template #icon
          ><n-icon><Refresh /></n-icon
        ></template>
        {{ copy.refresh }}
      </n-button>
    </template>

    <div class="pal-status-summary" aria-live="polite">
      <div>
        <n-icon><Paw /></n-icon>
        <span>{{ copy.workers }}</span>
        <strong>{{ rows.length }}</strong>
      </div>
      <div>
        <n-icon><BuildingCommunity /></n-icon>
        <span>{{ copy.bases }}</span>
        <strong>{{ activeBases }}</strong>
      </div>
      <div :class="{ 'has-alerts': attentionCount > 0 }">
        <n-icon><AlertTriangle /></n-icon>
        <span>{{ copy.attention }}</span>
        <strong>{{ attentionCount }}</strong>
      </div>
    </div>

    <div class="pal-status-toolbar">
      <n-input v-model:value="search" clearable :placeholder="copy.search">
        <template #prefix
          ><n-icon><Search /></n-icon
        ></template>
      </n-input>
      <n-select
        v-model:value="selectedBase"
        :options="baseOptions"
        :consistent-menu-width="false"
      />
      <label class="attention-filter">
        <n-switch v-model:value="attentionOnly" />
        <span>{{ copy.attentionOnly }}</span>
      </label>
    </div>

    <n-alert v-if="loadError" type="error" :show-icon="true">
      {{ loadError }}
    </n-alert>

    <n-spin :show="loading">
      <div v-if="visibleRows.length" class="pal-status-list">
        <div class="pal-status-head" aria-hidden="true">
          <span>{{ copy.pal }}</span>
          <span>{{ copy.activity }}</span>
          <span>{{ copy.condition }}</span>
          <span>{{ copy.assignment }}</span>
        </div>

        <article
          v-for="row in visibleRows"
          :key="row.id"
          class="pal-status-row"
          :class="{ 'needs-attention': row.attention }"
        >
          <div class="pal-identity">
            <div class="pal-portrait" :class="{ 'has-alert': row.attention }">
              <img
                :src="portrait(row)"
                :alt="row.speciesName"
                @error="useFallbackPortrait"
              />
            </div>
            <div class="pal-name">
              <div>
                <strong>{{ row.name }}</strong>
                <n-tag size="small" :bordered="false">
                  {{ copy.level }} {{ row.level || "-" }}
                </n-tag>
              </div>
              <span>{{ row.baseName }}</span>
              <small v-if="row.name !== row.speciesName">{{
                row.speciesName
              }}</small>
            </div>
          </div>

          <div class="pal-activity">
            <n-icon :class="`activity-${row.activityKind}`">
              <component :is="activityIcon(row.activityKind)" />
            </n-icon>
            <div>
              <strong>{{ activityLabel(row) }}</strong>
              <span>{{ row.activityDetail || row.baseName }}</span>
            </div>
          </div>

          <div class="pal-wellbeing">
            <div class="wellbeing-meter">
              <span
                ><n-icon><Apple /></n-icon>{{ copy.hunger }}</span
              >
              <n-progress
                type="line"
                :percentage="row.hunger ?? 0"
                :status="meterStatus(row.hunger, 20)"
                :show-indicator="false"
                :height="6"
                :border-radius="3"
              />
              <strong>{{ rounded(row.hunger) }}</strong>
            </div>
            <div class="wellbeing-meter">
              <span
                ><n-icon><Heart /></n-icon>{{ copy.sanity }}</span
              >
              <n-progress
                type="line"
                :percentage="row.sanity ?? 0"
                :status="meterStatus(row.sanity, 50)"
                :show-indicator="false"
                :height="6"
                :border-radius="3"
              />
              <strong>{{ rounded(row.sanity) }}</strong>
            </div>
            <div class="condition-tags">
              <n-tag
                v-if="!row.conditions.length"
                size="small"
                type="success"
                :bordered="false"
              >
                {{ copy.healthy }}
              </n-tag>
              <n-tag
                v-for="condition in row.conditions"
                v-else
                :key="condition"
                size="small"
                type="warning"
                :bordered="false"
              >
                {{ condition }}
              </n-tag>
            </div>
          </div>

          <div class="pal-facility">
            <n-icon><BuildingCommunity /></n-icon>
            <div>
              <strong>{{ row.facility || copy.noFacility }}</strong>
              <span>{{ row.guildName || row.baseName }}</span>
            </div>
          </div>
        </article>
      </div>

      <n-empty
        v-else-if="!loading"
        class="pal-status-empty"
        :description="copy.empty"
      >
        <template #icon
          ><n-icon><Paw /></n-icon
        ></template>
      </n-empty>
    </n-spin>
  </tool-surface>
</template>

<style scoped>
:global(.pal-status-modal) {
  width: min(1280px, 96vw);
}

.pal-status-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 16px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.pal-status-summary > div {
  display: grid;
  min-height: 68px;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}

.pal-status-summary > div + div {
  border-left: 1px solid var(--app-border);
}

.pal-status-summary .n-icon {
  color: var(--app-accent);
  font-size: 1.25rem;
}

.pal-status-summary span {
  color: var(--app-ink-muted);
  font-size: 0.75rem;
  font-weight: 650;
}

.pal-status-summary strong {
  color: var(--app-ink);
  font-family: var(--app-font-data);
  font-size: 1.375rem;
  font-variant-numeric: tabular-nums;
}

.pal-status-summary .has-alerts .n-icon,
.pal-status-summary .has-alerts strong {
  color: var(--app-warning);
}

.pal-status-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(180px, 260px) auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.attention-filter {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  color: var(--app-ink-secondary);
  font-size: 0.8125rem;
  font-weight: 650;
  white-space: nowrap;
}

.pal-status-list {
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.pal-status-head,
.pal-status-row {
  display: grid;
  grid-template-columns:
    minmax(240px, 1.45fr)
    minmax(180px, 1fr)
    minmax(220px, 1.25fr)
    minmax(170px, 0.9fr);
  align-items: center;
  gap: 16px;
}

.pal-status-head {
  min-height: 38px;
  padding: 8px 16px;
  color: var(--app-ink-muted);
  background: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
  font-size: 0.6875rem;
  font-weight: 700;
}

.pal-status-row {
  min-height: 92px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border);
  transition: background-color 160ms ease-in-out;
}

.pal-status-row:last-child {
  border-bottom: 0;
}

.pal-status-row:hover {
  background: var(--app-surface-muted);
}

.pal-status-row.needs-attention {
  box-shadow: inset 3px 0 0 var(--app-warning);
}

.pal-identity,
.pal-activity,
.pal-facility {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.pal-portrait {
  display: grid;
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
  place-items: center;
  overflow: hidden;
  background: color-mix(in srgb, var(--app-info-soft) 72%, var(--app-surface));
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.pal-portrait.has-alert {
  background: var(--app-warning-soft);
  border-color: color-mix(in srgb, var(--app-warning) 42%, var(--app-border));
}

.pal-portrait img {
  width: 52px;
  height: 52px;
  object-fit: contain;
}

.pal-name,
.pal-activity > div,
.pal-facility > div {
  min-width: 0;
}

.pal-name > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.pal-name strong,
.pal-activity strong,
.pal-facility strong {
  display: block;
  overflow: hidden;
  color: var(--app-ink);
  font-size: 0.875rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pal-name span,
.pal-name small,
.pal-activity span,
.pal-facility span {
  display: block;
  overflow: hidden;
  color: var(--app-ink-muted);
  font-size: 0.75rem;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pal-name > span {
  margin-top: 4px;
  color: var(--app-ink-secondary);
  font-weight: 650;
}

.pal-activity > .n-icon,
.pal-facility > .n-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  color: var(--app-accent);
  background: var(--app-accent-soft);
  border-radius: 8px;
  font-size: 1.125rem;
}

.pal-activity > .activity-event {
  color: var(--app-warning);
  background: var(--app-warning-soft);
}

.pal-wellbeing {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.wellbeing-meter {
  display: grid;
  grid-template-columns: 68px minmax(50px, 1fr) 38px;
  align-items: center;
  gap: 8px;
}

.wellbeing-meter > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--app-ink-muted);
  font-size: 0.6875rem;
  font-weight: 650;
}

.wellbeing-meter > span .n-icon {
  color: var(--app-info);
  font-size: 0.875rem;
}

.wellbeing-meter > strong {
  color: var(--app-ink-secondary);
  font-family: var(--app-font-data);
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.condition-tags {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px;
}

.pal-status-empty {
  min-height: 280px;
  padding: 48px 16px;
  border: 1px dashed var(--app-border-strong);
  border-radius: 8px;
}

@media (max-width: 1050px) {
  .pal-status-head {
    display: none;
  }

  .pal-status-row {
    grid-template-columns: minmax(220px, 1.2fr) minmax(170px, 1fr);
  }
}

@media (max-width: 700px) {
  :global(.pal-status-modal) {
    width: 100vw;
    max-width: 100vw;
  }

  .pal-status-summary {
    grid-template-columns: 1fr;
  }

  .pal-status-summary > div {
    min-height: 52px;
  }

  .pal-status-summary > div + div {
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }

  .pal-status-toolbar,
  .pal-status-row {
    grid-template-columns: 1fr;
  }

  .pal-status-row {
    gap: 14px;
    padding: 16px;
  }

  .pal-wellbeing {
    padding-block: 12px;
    border-block: 1px solid var(--app-border);
  }
}
</style>
