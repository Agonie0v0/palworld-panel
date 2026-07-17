<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  AdminPanelSettingsOutlined,
  ArchiveOutlined,
  DashboardOutlined,
  PublicRound,
  SettingsPowerRound,
  SupervisedUserCircleRound,
} from "@vicons/material";
import {
  AddOutline,
  GameController,
  PencilOutline,
  ReorderFourOutline,
  Settings,
  TrashOutline,
} from "@vicons/ionicons5";
import { GuiManagement } from "@vicons/carbon";
import { BroadcastTower } from "@vicons/fa";
import { Activity, BrandSteam, Database, Dna, Package, Terminal } from "@vicons/tabler";
import { ShieldCheckmarkSharp } from "@vicons/ionicons5";

const props = defineProps({
  activeKey: { type: String, required: true },
  canOperate: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isLogin: { type: Boolean, default: false },
});

const emit = defineEmits(["select"]);
const { t, locale } = useI18n();
const STORAGE_KEY = "palworld_sidebar_layout_v1";

const defaultGroups = () => [
  { id: "status", name: "", items: ["overview", "players", "guilds", "map"] },
  { id: "daily", name: "", items: ["operations", "game-settings", "rcon", "broadcast", "whitelist", "breeding", "mods"] },
  { id: "saves", name: "", items: ["backup", "save-sources", "world-data"] },
  { id: "maintenance", name: "", items: ["advanced", "workshop"] },
  { id: "panel", name: "", items: ["settings", "access", "shutdown"] },
];

const defaultGroupNames = computed(() => {
  const zh = locale.value === "zh";
  return {
    status: zh ? "\u72b6\u6001\u4e0e\u73a9\u5bb6" : "Status & players",
    daily: zh ? "\u65e5\u5e38\u670d\u52a1\u5668" : "Daily server",
    saves: zh ? "\u5b58\u6863\u4e0e\u5907\u4efd" : "Saves & backups",
    maintenance: zh ? "\u7ef4\u62a4\u4e0e\u6269\u5c55" : "Maintenance & extensions",
    panel: zh ? "\u9762\u677f\u4e0e\u6743\u9650" : "Panel & access",
  };
});

const groups = ref(defaultGroups());
const editing = ref(false);
const dragState = ref(null);

const catalog = computed(() => ({
  overview: { icon: DashboardOutlined, label: t("button.overview"), gate: "login" },
  players: { icon: GameController, label: t("button.players") },
  guilds: { icon: SupervisedUserCircleRound, label: t("button.guilds") },
  map: { icon: PublicRound, label: t("button.map") },
  operations: { icon: GuiManagement, label: t("operations.title"), gate: "operate" },
  "game-settings": { icon: Settings, label: t("gameSettings.title"), gate: "operate" },
  rcon: { icon: Terminal, label: t("modal.rcon"), gate: "operate" },
  broadcast: { icon: BroadcastTower, label: t("modal.broadcast"), gate: "operate" },
  whitelist: { icon: ShieldCheckmarkSharp, label: t("modal.whitelist"), gate: "operate" },
  breeding: { icon: Dna, label: locale.value === "zh" ? "\u914d\u79cd\u5b9e\u9a8c\u5ba4" : "Breeding lab", gate: "operate" },
  mods: { icon: Package, label: locale.value === "zh" ? "\u6a21\u7ec4\u7ba1\u7406" : "Mods", gate: "operate" },
  backup: { icon: ArchiveOutlined, label: t("button.backup"), gate: "operate" },
  "save-sources": { icon: Database, label: locale.value === "zh" ? "\u5b58\u6863\u6e90" : "Save sources", gate: "operate" },
  "world-data": { icon: Database, label: locale.value === "zh" ? "\u4e16\u754c\u6570\u636e" : "World data", gate: "operate" },
  advanced: { icon: Activity, label: locale.value === "zh" ? "\u8fd0\u7ef4\u4e2d\u5fc3" : "Operations center", gate: "operate" },
  workshop: { icon: BrandSteam, label: "Workshop", gate: "operate" },
  settings: { icon: Settings, label: t("configuration.title"), gate: "admin" },
  access: { icon: AdminPanelSettingsOutlined, label: locale.value === "zh" ? "\u8d26\u53f7\u6743\u9650" : "Access", gate: "admin" },
  shutdown: { icon: SettingsPowerRound, label: t("button.shutdown"), gate: "admin", danger: true },
}));

const isAvailable = (item) => {
  if (item.gate === "admin") return props.isAdmin;
  if (item.gate === "operate") return props.canOperate;
  if (item.gate === "login") return props.isLogin;
  return true;
};

const visibleGroups = computed(() =>
  groups.value
    .map((group) => ({
      ...group,
      items: group.items.filter((id) => catalog.value[id] && (editing.value || isAvailable(catalog.value[id]))),
    }))
    .filter((group) => editing.value || group.items.length > 0),
);

const groupName = (group) => group.name || defaultGroupNames.value[group.id] || (locale.value === "zh" ? "\u65b0\u5206\u7ec4" : "New group");

const normalizeLayout = (layout) => {
  if (!Array.isArray(layout)) return null;
  const known = new Set(Object.keys(catalog.value));
  const used = new Set();
  const normalized = layout
    .filter((group) => group && typeof group.id === "string" && Array.isArray(group.items))
    .map((group) => ({
      id: group.id,
      name: typeof group.name === "string" ? group.name : "",
      items: group.items.filter((id) => known.has(id) && !used.has(id) && used.add(id)),
    }));
  const missing = Object.keys(catalog.value).filter((id) => !used.has(id));
  if (missing.length) normalized[0]?.items.push(...missing);
  return normalized.length ? normalized : null;
};

const saveLayout = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(groups.value));

const resetLayout = () => {
  groups.value = defaultGroups();
  saveLayout();
};

const addGroup = () => {
  groups.value.push({ id: `custom-${Date.now()}`, name: locale.value === "zh" ? "\u65b0\u5206\u7ec4" : "New group", items: [] });
};

const removeGroup = (groupId) => {
  if (groups.value.length === 1) return;
  const index = groups.value.findIndex((group) => group.id === groupId);
  if (index < 0) return;
  const [removed] = groups.value.splice(index, 1);
  groups.value[Math.max(0, index - 1)].items.push(...removed.items);
};

const selectItem = (id) => {
  if (!editing.value) emit("select", id);
};

const beginItemDrag = (event, groupId, itemId) => {
  dragState.value = { type: "item", groupId, itemId };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", itemId);
};

const dropItem = (event, targetGroupId, targetIndex) => {
  event.preventDefault();
  const state = dragState.value;
  if (!state || state.type !== "item") return;
  const sourceGroup = groups.value.find((group) => group.id === state.groupId);
  const targetGroup = groups.value.find((group) => group.id === targetGroupId);
  if (!sourceGroup || !targetGroup) return;
  const sourceIndex = sourceGroup.items.indexOf(state.itemId);
  if (sourceIndex < 0) return;
  sourceGroup.items.splice(sourceIndex, 1);
  const adjustedIndex = sourceGroup === targetGroup && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  targetGroup.items.splice(Math.max(0, adjustedIndex), 0, state.itemId);
  dragState.value = null;
};

const beginGroupDrag = (event, groupId) => {
  dragState.value = { type: "group", groupId };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", groupId);
};

const dropGroup = (event, targetIndex) => {
  event.preventDefault();
  const state = dragState.value;
  if (!state || state.type !== "group") return;
  const sourceIndex = groups.value.findIndex((group) => group.id === state.groupId);
  if (sourceIndex < 0 || sourceIndex === targetIndex) return;
  const [group] = groups.value.splice(sourceIndex, 1);
  groups.value.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, group);
  dragState.value = null;
};

watch(groups, saveLayout, { deep: true });

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const restored = normalizeLayout(stored);
    if (restored) groups.value = restored;
  } catch {
    resetLayout();
  }
});
</script>

<template>
  <div class="workspace-nav" :class="{ 'is-editing': editing }">
    <div class="workspace-nav__tools">
      <n-button v-if="editing" size="small" @click="addGroup">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        {{ locale === "zh" ? "\u65b0\u5efa\u5206\u7ec4" : "Add group" }}
      </n-button>
      <n-button v-if="editing" size="small" @click="resetLayout">
        {{ locale === "zh" ? "\u6062\u590d\u9ed8\u8ba4" : "Reset" }}
      </n-button>
      <n-button quaternary size="small" @click="editing = !editing">
        <template #icon><n-icon><PencilOutline v-if="!editing" /><ReorderFourOutline v-else /></n-icon></template>
        {{ editing ? (locale === "zh" ? "\u5b8c\u6210" : "Done") : (locale === "zh" ? "\u7f16\u8f91\u5bfc\u822a" : "Edit navigation") }}
      </n-button>
    </div>

    <section
      v-for="(group, groupIndex) in visibleGroups"
      :key="group.id"
      class="workspace-nav__group"
      :class="{ 'is-dragging': dragState?.type === 'group' && dragState.groupId === group.id }"
      :draggable="editing"
      @dragstart="editing && beginGroupDrag($event, group.id)"
      @dragover.prevent
      @drop="editing && dropGroup($event, groupIndex)"
    >
      <div class="workspace-nav__heading">
        <n-icon v-if="editing" class="workspace-nav__handle"><ReorderFourOutline /></n-icon>
        <n-input v-if="editing" :value="groupName(group)" size="small" @update:value="group.name = $event" />
        <span v-else>{{ groupName(group) }}</span>
        <n-button v-if="editing && groups.length > 1" quaternary circle size="tiny" type="error" :aria-label="locale === 'zh' ? '\u5220\u9664\u5206\u7ec4' : 'Remove group'" @click.stop="removeGroup(group.id)">
          <template #icon><n-icon><TrashOutline /></n-icon></template>
        </n-button>
      </div>

      <nav class="workspace-nav__list" :aria-label="groupName(group)" @dragover.prevent @drop="editing && dropItem($event, group.id, group.items.length)">
        <button
          v-for="(id, itemIndex) in group.items"
          :key="id"
          type="button"
          class="ops-menu-button workspace-nav__item"
          :class="{ 'is-active': activeKey === id, 'is-danger': catalog[id].danger, 'is-dragging': dragState?.type === 'item' && dragState.itemId === id }"
          :draggable="editing"
          @click="selectItem(id)"
          @dragstart.stop="editing && beginItemDrag($event, group.id, id)"
          @dragover.prevent
          @drop.stop="editing && dropItem($event, group.id, itemIndex)"
        >
          <n-icon v-if="editing" class="workspace-nav__handle"><ReorderFourOutline /></n-icon>
          <n-icon><component :is="catalog[id].icon" /></n-icon>
          <span>{{ catalog[id].label }}</span>
        </button>
        <div v-if="editing && group.items.length === 0" class="workspace-nav__empty" @dragover.prevent @drop="dropItem($event, group.id, 0)">
          {{ locale === "zh" ? "\u628a\u9879\u76ee\u62d6\u5230\u8fd9\u91cc" : "Drop items here" }}
        </div>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.workspace-nav { min-width: 0; }
.workspace-nav__tools { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin: 0 4px 8px; }
.workspace-nav__group + .workspace-nav__group { margin-top: 12px; }
.workspace-nav__heading { display: flex; min-height: 22px; align-items: center; gap: 4px; padding: 0 8px 4px; color: var(--app-sidebar-muted); font-size: 11px; font-weight: 600; }
.workspace-nav__heading span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-nav__heading :deep(.n-input) { flex: 1; }
.workspace-nav__list { display: grid; gap: 2px; }
.workspace-nav__item { position: relative; }
.workspace-nav__item.is-danger { color: var(--app-danger); }
.workspace-nav__item.is-danger .n-icon { color: var(--app-danger); }
.workspace-nav__handle { flex: 0 0 auto; color: var(--app-sidebar-muted); font-size: 14px; cursor: grab; }
.workspace-nav__item[draggable="true"] { cursor: grab; }
.workspace-nav__item.is-dragging, .workspace-nav__group.is-dragging { opacity: .48; }
.workspace-nav__empty { min-height: 34px; display: grid; place-items: center; padding: 4px 8px; color: var(--app-ink-muted); border: 1px dashed var(--app-border-strong); border-radius: 6px; font-size: 11px; }
</style>
