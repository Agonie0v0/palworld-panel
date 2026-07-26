<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ApiService from "@/service/api";
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
  ChevronDownOutline,
  ChevronForwardOutline,
  GameController,
  ReorderFourOutline,
  Settings,
  TrashOutline,
} from "@vicons/ionicons5";
import { GuiManagement } from "@vicons/carbon";
import { BroadcastTower } from "@vicons/fa";
import {
  Activity,
  BrandSteam,
  Database,
  Dna,
  Package,
  Paw,
  Terminal,
} from "@vicons/tabler";
import { ShieldCheckmarkSharp } from "@vicons/ionicons5";

const props = defineProps({
  activeKey: { type: String, required: true },
  canOperate: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isLogin: { type: Boolean, default: false },
});

const emit = defineEmits(["select", "editing-change", "labels-change"]);
const { t, locale } = useI18n();
const message = useMessage();
const STORAGE_KEY = "palworld_sidebar_layout_v2";

const makeItems = (items) => items.map((id) => ({ id, name: "" }));
const defaultGroups = () => [
  {
    id: "status",
    name: "",
    items: makeItems(["overview", "players", "guilds", "map"]),
  },
  {
    id: "daily",
    name: "",
    items: makeItems([
      "operations",
      "game-settings",
      "pal-status",
      "rcon",
      "broadcast",
      "whitelist",
      "breeding",
      "mods",
    ]),
  },
  {
    id: "saves",
    name: "",
    items: makeItems([
      "backup",
      "save-sources",
      "world-data",
      "advanced",
      "workshop",
    ]),
  },
  {
    id: "panel",
    name: "",
    items: makeItems(["settings", "access", "shutdown"]),
  },
];

const defaultGroupNames = computed(() => {
  const zh = locale.value === "zh";
  return {
    status: zh ? "\u63a7\u5236\u53f0" : "Console",
    daily: zh ? "\u6e38\u620f\u7ba1\u7406" : "Game management",
    saves: zh ? "\u8fd0\u7ef4\u4e2d\u5fc3" : "Operations center",
    panel: zh ? "\u8d26\u6237\u4e0e\u9762\u677f" : "Account & panel",
  };
});

const catalog = computed(() => ({
  overview: {
    icon: DashboardOutlined,
    label: t("button.overview"),
    gate: "login",
  },
  players: { icon: GameController, label: t("button.players") },
  guilds: { icon: SupervisedUserCircleRound, label: t("button.guilds") },
  map: { icon: PublicRound, label: t("button.map") },
  operations: {
    icon: GuiManagement,
    label: t("operations.title"),
    gate: "operate",
  },
  "game-settings": {
    icon: Settings,
    label: t("gameSettings.title"),
    gate: "operate",
  },
  "pal-status": {
    icon: Paw,
    label: locale.value === "zh" ? "帕鲁状态" : "Pal status",
    gate: "operate",
  },
  rcon: { icon: Terminal, label: t("modal.rcon"), gate: "operate" },
  broadcast: {
    icon: BroadcastTower,
    label: t("modal.broadcast"),
    gate: "operate",
  },
  whitelist: {
    icon: ShieldCheckmarkSharp,
    label: t("modal.whitelist"),
    gate: "operate",
  },
  breeding: {
    icon: Dna,
    label:
      locale.value === "zh" ? "\u914d\u79cd\u5b9e\u9a8c\u5ba4" : "Breeding lab",
    gate: "operate",
  },
  mods: {
    icon: Package,
    label: locale.value === "zh" ? "\u6a21\u7ec4\u7ba1\u7406" : "Mods",
    gate: "operate",
  },
  backup: { icon: ArchiveOutlined, label: t("button.backup"), gate: "operate" },
  "save-sources": {
    icon: Database,
    label: locale.value === "zh" ? "\u5b58\u6863\u6e90" : "Save sources",
    gate: "operate",
  },
  "world-data": {
    icon: Database,
    label: locale.value === "zh" ? "\u4e16\u754c\u6570\u636e" : "World data",
    gate: "operate",
  },
  advanced: {
    icon: Activity,
    label:
      locale.value === "zh" ? "\u8fd0\u7ef4\u4e2d\u5fc3" : "Operations center",
    gate: "operate",
  },
  workshop: { icon: BrandSteam, label: "Workshop", gate: "operate" },
  settings: { icon: Settings, label: t("configuration.title"), gate: "admin" },
  access: {
    icon: AdminPanelSettingsOutlined,
    label: locale.value === "zh" ? "\u8d26\u53f7\u6743\u9650" : "Access",
    gate: "admin",
  },
  shutdown: {
    icon: SettingsPowerRound,
    label: t("button.shutdown"),
    gate: "admin",
    danger: true,
  },
}));

const groups = ref(defaultGroups());
const savedGroups = ref(defaultGroups());
const editing = ref(false);
const saving = ref(false);
const dragState = ref(null);
const collapsedGroups = ref(new Set());
const clone = (value) => JSON.parse(JSON.stringify(value));
const isAvailable = (item) =>
  item.gate === "admin"
    ? props.isAdmin
    : item.gate === "operate"
      ? props.canOperate
      : item.gate === "login"
        ? props.isLogin
        : true;
const groupName = (group) =>
  group.name ||
  defaultGroupNames.value[group.id] ||
  (locale.value === "zh" ? "\u65b0\u5206\u7ec4" : "New group");
const itemName = (item) =>
  item.name || catalog.value[item.id]?.label || item.id;
const isCollapsed = (groupId) => collapsedGroups.value.has(groupId);
const toggleGroup = (groupId) => {
  const next = new Set(collapsedGroups.value);
  next.has(groupId) ? next.delete(groupId) : next.add(groupId);
  collapsedGroups.value = next;
};

const normalizeLayout = (layout) => {
  if (!Array.isArray(layout)) return null;
  const known = new Set(Object.keys(catalog.value));
  const used = new Set();
  const normalized = layout
    .filter(
      (group) =>
        group && typeof group.id === "string" && Array.isArray(group.items),
    )
    .map((group) => ({
      id: group.id,
      name: typeof group.name === "string" ? group.name : "",
      items: group.items
        .map((item) =>
          typeof item === "string" ? { id: item, name: "" } : item,
        )
        .filter(
          (item) =>
            item &&
            known.has(item.id) &&
            !used.has(item.id) &&
            used.add(item.id),
        )
        .map((item) => ({
          id: item.id,
          name: typeof item.name === "string" ? item.name.slice(0, 48) : "",
        })),
    }));
  const defaultGroupByItem = new Map(
    defaultGroups().flatMap((group) =>
      group.items.map((item) => [item.id, group.id]),
    ),
  );
  const missing = Object.keys(catalog.value).filter((id) => !used.has(id));
  for (const id of missing) {
    const targetGroup =
      normalized.find((group) => group.id === defaultGroupByItem.get(id)) ||
      normalized[0];
    targetGroup?.items.push({ id, name: "" });
  }
  return normalized.length ? normalized : null;
};

const visibleGroups = computed(() =>
  groups.value
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          catalog.value[item.id] &&
          (editing.value || isAvailable(catalog.value[item.id])),
      ),
    }))
    .filter((group) => editing.value || group.items.length),
);
const resolvedLabels = computed(() =>
  Object.fromEntries(
    groups.value.flatMap((group) =>
      group.items.map((item) => [item.id, itemName(item)]),
    ),
  ),
);

watch(resolvedLabels, (labels) => emit("labels-change", labels), {
  immediate: true,
  deep: true,
});

const persistLocal = () =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups.value));
const beginEditing = () => {
  if (!props.isAdmin) return;
  savedGroups.value = clone(groups.value);
  editing.value = true;
  emit("editing-change", true);
};
const cancelEditing = () => {
  groups.value = clone(savedGroups.value);
  editing.value = false;
  dragState.value = null;
  emit("editing-change", false);
};
const saveEditing = async () => {
  saving.value = true;
  const { data, statusCode } = await new ApiService().updateSidebarNavigation(
    groups.value,
  );
  saving.value = false;
  if (statusCode.value !== 200) {
    message.error(
      data.value?.error ||
        (locale.value === "zh" ? "导航保存失败" : "Could not save navigation"),
    );
    return;
  }
  const normalized = normalizeLayout(data.value?.navigation || groups.value);
  if (normalized) groups.value = normalized;
  savedGroups.value = clone(groups.value);
  persistLocal();
  editing.value = false;
  emit("editing-change", false);
  message.success(
    locale.value === "zh"
      ? "导航已保存到面板配置"
      : "Navigation saved to panel configuration",
  );
};
const toggleEditing = () => (editing.value ? cancelEditing() : beginEditing());
const resetLayout = () => {
  groups.value = defaultGroups();
};
const addGroup = () =>
  groups.value.push({
    id: `custom-${Date.now()}`,
    name: locale.value === "zh" ? "\u65b0\u5206\u7ec4" : "New group",
    items: [],
  });
const removeGroup = (groupId) => {
  if (groups.value.length === 1) return;
  const index = groups.value.findIndex((group) => group.id === groupId);
  if (index < 0) return;
  const [removed] = groups.value.splice(index, 1);
  groups.value[Math.max(0, index - 1)].items.push(...removed.items);
};
const selectItem = (item) => {
  if (!editing.value) emit("select", item.id);
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
  const sourceIndex =
    sourceGroup?.items.findIndex((item) => item.id === state.itemId) ?? -1;
  if (!sourceGroup || !targetGroup || sourceIndex < 0) return;
  const [item] = sourceGroup.items.splice(sourceIndex, 1);
  targetGroup.items.splice(
    Math.max(
      0,
      sourceGroup === targetGroup && sourceIndex < targetIndex
        ? targetIndex - 1
        : targetIndex,
    ),
    0,
    item,
  );
  dragState.value = null;
};
const beginGroupDrag = (event, groupId) => {
  dragState.value = { type: "group", groupId };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", groupId);
};
const dropGroup = (event, targetIndex) => {
  event.preventDefault();
  if (dragState.value?.type !== "group") return;
  const sourceIndex = groups.value.findIndex(
    (group) => group.id === dragState.value.groupId,
  );
  if (sourceIndex < 0 || sourceIndex === targetIndex) return;
  const [group] = groups.value.splice(sourceIndex, 1);
  groups.value.splice(
    sourceIndex < targetIndex ? targetIndex - 1 : targetIndex,
    0,
    group,
  );
  dragState.value = null;
};

onMounted(async () => {
  try {
    const local = normalizeLayout(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
    );
    if (local) groups.value = local;
    const { data, statusCode } = await new ApiService().getSidebarNavigation();
    const remote =
      statusCode.value === 200 ? normalizeLayout(data.value?.navigation) : null;
    if (remote) groups.value = remote;
  } catch {
    groups.value = defaultGroups();
  }
  savedGroups.value = clone(groups.value);
  persistLocal();
  emit("labels-change", resolvedLabels.value);
});

defineExpose({ toggleEditing, editing });
</script>

<template>
  <div class="workspace-nav" :class="{ 'is-editing': editing }">
    <div v-if="editing" class="workspace-nav__editbar">
      <n-button size="small" @click="addGroup"
        ><template #icon
          ><n-icon><AddOutline /></n-icon></template
        >{{ locale === "zh" ? "新建分组" : "Add group" }}</n-button
      >
      <n-button size="small" @click="resetLayout">{{
        locale === "zh" ? "恢复默认" : "Reset"
      }}</n-button>
      <n-button
        type="primary"
        size="small"
        :loading="saving"
        @click="saveEditing"
        >{{ locale === "zh" ? "保存" : "Save" }}</n-button
      >
    </div>
    <section
      v-for="(group, groupIndex) in visibleGroups"
      :key="group.id"
      class="workspace-nav__group"
      :class="{
        'is-dragging':
          dragState?.type === 'group' && dragState.groupId === group.id,
      }"
      :draggable="editing"
      @dragstart="editing && beginGroupDrag($event, group.id)"
      @dragover.prevent
      @drop="editing && dropGroup($event, groupIndex)"
    >
      <div class="workspace-nav__heading">
        <n-icon v-if="editing" class="workspace-nav__handle"
          ><ReorderFourOutline
        /></n-icon>
        <n-input
          v-if="editing"
          :value="groupName(group)"
          size="small"
          @update:value="group.name = $event"
        />
        <button
          v-else
          type="button"
          class="workspace-nav__collapse"
          :aria-expanded="!isCollapsed(group.id)"
          @click="toggleGroup(group.id)"
        >
          <span>{{ groupName(group) }}</span>
          <n-icon
            ><ChevronDownOutline
              v-if="!isCollapsed(group.id)" /><ChevronForwardOutline v-else
          /></n-icon>
        </button>
        <n-button
          v-if="editing && groups.length > 1"
          quaternary
          circle
          size="tiny"
          type="error"
          :aria-label="locale === 'zh' ? '删除分组' : 'Remove group'"
          @click.stop="removeGroup(group.id)"
          ><template #icon
            ><n-icon><TrashOutline /></n-icon></template
        ></n-button>
      </div>
      <nav
        v-show="editing || !isCollapsed(group.id)"
        class="workspace-nav__list"
        :aria-label="groupName(group)"
        @dragover.prevent
        @drop="editing && dropItem($event, group.id, group.items.length)"
      >
        <button
          v-for="(item, itemIndex) in group.items"
          :key="item.id"
          type="button"
          class="ops-menu-button workspace-nav__item"
          :class="{
            'is-active': activeKey === item.id,
            'is-danger': catalog[item.id].danger,
            'is-dragging':
              dragState?.type === 'item' && dragState.itemId === item.id,
          }"
          :draggable="editing"
          @click="selectItem(item)"
          @dragstart.stop="editing && beginItemDrag($event, group.id, item.id)"
          @dragover.prevent
          @drop.stop="editing && dropItem($event, group.id, itemIndex)"
        >
          <n-icon v-if="editing" class="workspace-nav__handle"
            ><ReorderFourOutline
          /></n-icon>
          <n-icon><component :is="catalog[item.id].icon" /></n-icon>
          <n-input
            v-if="editing"
            :value="itemName(item)"
            size="small"
            @click.stop
            @update:value="item.name = $event"
          />
          <span v-else>{{ itemName(item) }}</span>
        </button>
        <div
          v-if="editing && group.items.length === 0"
          class="workspace-nav__empty"
          @dragover.prevent
          @drop="dropItem($event, group.id, 0)"
        >
          {{ locale === "zh" ? "把项目拖到这里" : "Drop items here" }}
        </div>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.workspace-nav {
  min-width: 0;
}
.workspace-nav__editbar {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 5px;
  margin: 0 4px 10px;
}
.workspace-nav__group + .workspace-nav__group {
  margin-top: 10px;
}
.workspace-nav__heading {
  display: flex;
  min-height: 22px;
  align-items: center;
  gap: 4px;
  padding: 0 8px 3px;
  color: var(--app-sidebar-muted);
  font-size: 11px;
  font-weight: 600;
}
.workspace-nav__heading span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-nav__collapse {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-weight: inherit;
  text-align: left;
}
.workspace-nav__collapse .n-icon {
  flex: 0 0 auto;
  font-size: 13px;
}
.workspace-nav__heading :deep(.n-input),
.workspace-nav__item :deep(.n-input) {
  flex: 1;
  min-width: 0;
}
.workspace-nav__list {
  display: grid;
  gap: 2px;
}
.workspace-nav__item {
  position: relative;
}
.workspace-nav__item.is-danger {
  color: var(--app-danger);
}
.workspace-nav__item.is-danger .n-icon {
  color: var(--app-danger);
}
.workspace-nav__handle {
  flex: 0 0 auto;
  color: var(--app-sidebar-muted);
  font-size: 14px;
  cursor: grab;
}
.workspace-nav__item[draggable="true"] {
  cursor: grab;
}
.workspace-nav__item.is-dragging,
.workspace-nav__group.is-dragging {
  opacity: 0.48;
}
.workspace-nav__empty {
  min-height: 34px;
  display: grid;
  place-items: center;
  padding: 4px 8px;
  color: var(--app-ink-muted);
  border: 1px dashed var(--app-border-strong);
  border-radius: 6px;
  font-size: 11px;
}
</style>
