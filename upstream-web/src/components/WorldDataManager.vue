<script setup>
import { computed, h, ref, watch } from "vue";
import { NTag } from "naive-ui";
import { useI18n } from "vue-i18n";
import { Box, BuildingCommunity, Paw, Refresh, Search } from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";
import itemCatalog from "@/assets/items.json";
import palCatalog from "@/assets/pal.json";

const props = defineProps({
  show: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
});
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const loading = ref(false);
const activeTab = ref("bases");
const search = ref("");
const world = ref({
  players: [],
  guilds: [],
  bases: [],
  pals: [],
  inventory: [],
  containers: [],
});

const copy = computed(() =>
  locale.value === "zh"
    ? {
        title: "世界数据",
        subtitle:
          "浏览存档解析出的基地、全局仓储容器和全部帕鲁。数据来自当前启用的存档源。",
        bases: "基地",
        workers: "工作帕鲁",
        storage: "仓储",
        pals: "全部帕鲁",
        search: "搜索名称、ID、所有者或物品",
        empty: "当前存档没有可显示的数据",
        guild: "公会",
        level: "等级",
        location: "坐标",
        area: "范围",
        container: "容器",
        item: "物品",
        quantity: "数量",
        owner: "所有者",
        base: "据点",
        status: "状态",
        hunger: "饱食度",
        sanity: "SAN",
        attention: "需要关注",
        workerCount: "工作帕鲁",
        facility: "设施",
        conditions: "异常",
        playerStorage: "玩家容器",
        worldStorage: "世界容器",
        type: "类型",
        gender: "性别",
        traits: "被动技能",
        refresh: "重新解析",
      }
    : {
        title: "World data",
        subtitle:
          "Browse bases, global storage containers, and every Pal parsed from the active save source.",
        bases: "Bases",
        workers: "Worker Pals",
        storage: "Storage",
        pals: "All Pals",
        search: "Search names, IDs, owners, or items",
        empty: "The current save has no matching data",
        guild: "Guild",
        level: "Level",
        location: "Location",
        area: "Range",
        container: "Container",
        item: "Item",
        quantity: "Quantity",
        owner: "Owner",
        base: "Base",
        status: "Status",
        hunger: "Hunger",
        sanity: "SAN",
        attention: "Attention",
        workerCount: "Workers",
        facility: "Facility",
        conditions: "Conditions",
        playerStorage: "Player container",
        worldStorage: "World container",
        type: "Type",
        gender: "Gender",
        traits: "Passive skills",
        refresh: "Parse again",
      },
);

const itemNames = computed(
  () =>
    new Map(
      (itemCatalog[locale.value === "zh" ? "zh" : "en"] || []).map((item) => [
        String(item.id || item.key || "").toLowerCase(),
        item.name,
      ]),
    ),
);
const palNames = computed(
  () => palCatalog[locale.value === "zh" ? "zh" : "en"] || {},
);
const result = (response) => response?.data?.value || {};
const textMatch = (row) =>
  !search.value.trim() ||
  JSON.stringify(row).toLowerCase().includes(search.value.trim().toLowerCase());

const load = async () => {
  loading.value = true;
  try {
    const response = await api.getWorldData();
    const data = result(response).data || {};
    world.value = {
      players: data.players || [],
      guilds: data.guilds || [],
      bases: data.bases || [],
      pals: data.pals || [],
      inventory: data.inventory || [],
      containers: data.containers || [],
    };
  } finally {
    loading.value = false;
  }
};

const guildByBase = computed(() => {
  const output = new Map();
  for (const guild of world.value.guilds) {
    for (const id of guild.base_ids || []) output.set(String(id), guild);
    for (const base of guild.base_camp || [])
      output.set(String(base.id), guild);
  }
  return output;
});

const baseRows = computed(() =>
  world.value.bases
    .map((base) => {
      const guild = guildByBase.value.get(String(base.id));
      const transform = base.transform || {};
      return {
        id: base.id,
        guild: guild?.name || "-",
        level: guild?.base_camp_level || "-",
        location: `${Number(transform.x ?? base.location_x ?? 0).toFixed(0)}, ${Number(transform.y ?? base.location_y ?? 0).toFixed(0)}`,
        area: base.area_range ?? base.area ?? "-",
        workers: base.pal_count ?? (base.workers || []).length,
      };
    })
    .filter(textMatch),
);

const playerContainerOwners = computed(() => {
  const output = new Map();
  for (const row of world.value.inventory) {
    if (row.ContainerId)
      output.set(
        String(row.ContainerId),
        row.owner_name || row.owner_uid || "",
      );
  }
  return output;
});

const storageRows = computed(() =>
  world.value.containers
    .flatMap((container) =>
      (container.items || []).map((item) => ({
        id: `${container.id}:${item.SlotIndex}`,
        container: container.id,
        item:
          itemNames.value.get(String(item.ItemId || "").toLowerCase()) ||
          item.ItemId,
        quantity: item.StackCount,
        owner: playerContainerOwners.value.get(String(container.id)) || "",
        kind: playerContainerOwners.value.has(String(container.id))
          ? "player"
          : "world",
      })),
    )
    .filter(textMatch),
);

const palRows = computed(() =>
  world.value.pals
    .map((pal, index) => ({
      id: pal.instance_id || `${pal.owner_uid || "unknown"}:${index}`,
      name: pal.nickname || palNames.value[pal.type] || pal.type,
      type: palNames.value[pal.type] || pal.type,
      level: pal.level,
      gender: pal.gender,
      owner:
        pal.location_kind === "base"
          ? pal.base_name || pal.base_id || "-"
          : pal.owner_name || pal.owner_uid || "-",
      traits: (pal.skills || []).join(", "),
    }))
    .filter(textMatch),
);

const workerRows = computed(() =>
  world.value.bases
    .flatMap((base, baseIndex) =>
      (base.workers || []).map((worker, workerIndex) => ({
        id: worker.instance_id || `${base.id}:${workerIndex}`,
        base: base.display_name || base.name || base.id || `Base ${baseIndex + 1}`,
        pal:
          worker.nickname ||
          palNames.value[worker.type] ||
          worker.type ||
          worker.name ||
          "-",
        type: palNames.value[worker.type] || worker.type || worker.pal_id || "-",
        level: worker.level,
        status: worker.activity?.label || worker.current_work_suitability || "-",
        hunger:
          worker.hunger_percent !== undefined && worker.hunger_percent !== null
            ? `${worker.hunger_percent}%`
            : worker.full_stomach ?? "-",
        sanity: worker.sanity ?? "-",
        facility: worker.facility || worker.activity?.facility || "-",
        conditions: (worker.conditions || worker.diseases || []).join(", "),
        attention: Boolean(worker.needs_attention),
      })),
    )
    .filter(textMatch),
);

const baseColumns = computed(() => [
  { title: "ID", key: "id", ellipsis: { tooltip: true } },
  { title: copy.value.guild, key: "guild" },
  { title: copy.value.level, key: "level", width: 80 },
  { title: copy.value.workerCount, key: "workers", width: 100 },
  { title: copy.value.location, key: "location" },
  { title: copy.value.area, key: "area", width: 90 },
]);
const storageColumns = computed(() => [
  {
    title: copy.value.container,
    key: "container",
    ellipsis: { tooltip: true },
  },
  { title: copy.value.item, key: "item" },
  { title: copy.value.quantity, key: "quantity", width: 90 },
  { title: copy.value.owner, key: "owner", width: 140 },
  {
    title: copy.value.type,
    key: "kind",
    width: 130,
    render: (row) =>
      h(
        NTag,
        { size: "small" },
        {
          default: () =>
            row.kind === "player"
              ? copy.value.playerStorage
              : copy.value.worldStorage,
        },
      ),
  },
]);
const palColumns = computed(() => [
  { title: copy.value.type, key: "type" },
  { title: copy.value.level, key: "level", width: 80 },
  { title: copy.value.gender, key: "gender", width: 100 },
  { title: copy.value.owner, key: "owner" },
  { title: copy.value.traits, key: "traits", ellipsis: { tooltip: true } },
]);
const workerColumns = computed(() => [
  { title: copy.value.base, key: "base", ellipsis: { tooltip: true } },
  { title: copy.value.pals, key: "pal", ellipsis: { tooltip: true } },
  { title: copy.value.type, key: "type", ellipsis: { tooltip: true } },
  { title: copy.value.level, key: "level", width: 80 },
  { title: copy.value.status, key: "status", ellipsis: { tooltip: true } },
  { title: copy.value.hunger, key: "hunger", width: 100 },
  { title: copy.value.sanity, key: "sanity", width: 90 },
  { title: copy.value.facility, key: "facility", ellipsis: { tooltip: true } },
  {
    title: copy.value.attention,
    key: "conditions",
    ellipsis: { tooltip: true },
    render: (row) =>
      h(
        NTag,
        {
          size: "small",
          type: row.attention ? "warning" : "success",
          bordered: false,
        },
        {
          default: () =>
            row.conditions || (row.attention ? copy.value.attention : "-"),
        },
      ),
  },
]);

watch(
  () => props.show,
  (show) => show && load(),
  { immediate: true },
);
</script>

<template>
  <tool-surface
    :show="show"
    class="world-data-modal"
    :title="copy.title"
    width="min(94vw, 1180px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <template #header-extra>
      <n-button quaternary :loading="loading" @click="load">
        <template #icon
          ><n-icon><Refresh /></n-icon></template
        >{{ copy.refresh }}
      </n-button>
    </template>
    <p class="manager-intro">{{ copy.subtitle }}</p>
    <n-input
      v-model:value="search"
      clearable
      class="world-search"
      :placeholder="copy.search"
    >
      <template #prefix
        ><n-icon><Search /></n-icon
      ></template>
    </n-input>
    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="bases">
        <template #tab
          ><span class="tab-label"
            ><n-icon><BuildingCommunity /></n-icon>{{ copy.bases }}</span
          ></template
        >
        <n-data-table
          :columns="baseColumns"
          :data="baseRows"
          :loading="loading"
          :pagination="{ pageSize: 30 }"
          :bordered="false"
        />
      </n-tab-pane>
      <n-tab-pane name="workers">
        <template #tab
          ><span class="tab-label"
            ><n-icon><Paw /></n-icon>{{ copy.workers }}</span
          ></template
        >
        <n-data-table
          :columns="workerColumns"
          :data="workerRows"
          :loading="loading"
          :pagination="{ pageSize: 50 }"
          :bordered="false"
        />
      </n-tab-pane>
      <n-tab-pane name="storage">
        <template #tab
          ><span class="tab-label"
            ><n-icon><Box /></n-icon>{{ copy.storage }}</span
          ></template
        >
        <n-data-table
          :columns="storageColumns"
          :data="storageRows"
          :loading="loading"
          :pagination="{ pageSize: 50 }"
          :bordered="false"
        />
      </n-tab-pane>
      <n-tab-pane name="pals">
        <template #tab
          ><span class="tab-label"
            ><n-icon><Paw /></n-icon>{{ copy.pals }}</span
          ></template
        >
        <n-data-table
          :columns="palColumns"
          :data="palRows"
          :loading="loading"
          :pagination="{ pageSize: 50 }"
          :bordered="false"
        />
      </n-tab-pane>
    </n-tabs>
  </tool-surface>
</template>

<style scoped>
:global(.world-data-modal) {
  width: min(1220px, 96vw);
}
.manager-intro {
  margin: 0 0 14px;
  color: var(--app-ink-muted);
  font-size: 13px;
}
.world-search {
  width: min(460px, 100%);
  margin-bottom: 14px;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
@media (max-width: 700px) {
  :global(.world-data-modal) {
    width: 100vw;
    max-width: 100vw;
  }
}
</style>
