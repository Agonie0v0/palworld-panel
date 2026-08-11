<script setup>
import {
  AdminPanelSettingsOutlined,
  ArchiveOutlined,
  DashboardOutlined,
  PublicRound,
  SettingsPowerRound,
  SupervisedUserCircleRound,
} from "@vicons/material";
import {
  Activity,
  ChevronsLeft,
  Database,
  Package,
  Paw,
} from "@vicons/tabler";
import {
  CheckmarkOutline,
  CloseOutline,
  ChevronDownOutline,
  ChevronUpOutline,
  ConstructOutline,
  GameController,
  LanguageSharp,
  MoonOutline,
  ReorderFourOutline,
  Settings,
  ShieldCheckmarkSharp,
  SquareOutline,
  SunnyOutline,
  Terminal,
} from "@vicons/ionicons5";
import { GuiManagement } from "@vicons/carbon";
import { BroadcastTower } from "@vicons/fa";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ApiService from "@/service/api";
import palMap from "@/assets/pal.json";
import skillMap from "@/assets/skill.json";
import PlayerList from "./component/PlayerList.vue";
import GuildList from "./component/GuildList.vue";
import PlayerDetail from "./component/PlayerDetail.vue";
import GuildDetail from "./component/GuildDetail.vue";
import userStore from "@/stores/model/user";
import AdminOverview from "@/components/AdminOverview.vue";
import BackupManager from "@/components/BackupManager.vue";
import BroadcastComposer from "@/components/BroadcastComposer.vue";
import RconManager from "@/components/RconManager.vue";
import ShutdownDialog from "@/components/ShutdownDialog.vue";
import WhitelistManager from "@/components/WhitelistManager.vue";
import ServerOperations from "@/components/ServerOperations.vue";
import GameSettingsManager from "@/components/GameSettingsManager.vue";
import OperationsCenter from "@/components/OperationsCenter.vue";
import SaveSourceManager from "@/components/SaveSourceManager.vue";
import ModManager from "@/components/ModManager.vue";
import AccessManager from "@/components/AccessManager.vue";
import WorldDataManager from "@/components/WorldDataManager.vue";
import PalStatusManager from "@/components/PalStatusManager.vue";
import PlayerDataManager from "@/components/PlayerDataManager.vue";
import PalArchiveManager from "@/components/PalArchiveManager.vue";
import InventoryManager from "@/components/InventoryManager.vue";
import MapView from "@/views/PcHome/component/MapView.vue";
import playerToGuildStore from "@/stores/model/playerToGuild";
import themeStore from "@/stores/model/theme.js";
import { requestCached } from "@/utils/requestCache";

const emit = defineEmits(["open-config"]);

const { t, locale } = useI18n();

const message = useMessage();
const theme = themeStore();

const PALWORLD_TOKEN = "palworld_token";

const loading = ref(false);
const serverInfo = ref({});
const serverMetrics = ref({});
const localeLowerPalMap = ref({});
const currentDisplay = ref("players");
const isShowDetail = ref(false);
const playerList = ref([]);
const onlinePlayerList = ref([]);
const guildList = ref([]);
const playerInfo = ref({});
const playerPalsList = ref([]);
const currentPlayerPalsList = ref([]);
const guildInfo = ref({});
const languageOptions = ref([]);
const showMobileTools = ref(false);
const pendingAdminAction = ref("");
const overviewReady = ref(false);
const serverAvailable = computed(() =>
  typeof serverInfo.value?.available === "boolean"
    ? serverInfo.value.available
    : Boolean(serverInfo.value?.name),
);
const onlineCount = computed(
  () =>
    serverMetrics.value?.current_player_num ??
    onlinePlayerList.value?.length ??
    0,
);
const currentViewLabel = computed(() => {
  const labels = {
    overview: "button.overview",
    players: "button.players",
    guilds: "button.guilds",
    map: "button.map",
  };
  return t(labels[currentDisplay.value] || labels.players);
});

const MOBILE_NAV_STORAGE_KEY = "palworld_mobile_bottom_nav_v1";
const MOBILE_NAV_ORDER_STORAGE_KEY = "palworld_mobile_nav_order_v1";
const MOBILE_NAV_LIMIT = 4;
const mobileNavDefaults = ["overview", "players", "guilds", "map"];
const mobileNavOrderDefaults = [
  "overview",
  "players",
  "guilds",
  "map",
  "operations",
  "settings",
  "game-settings",
  "pal-status",
  "advanced",
  "save-sources",
  "mods",
  "access",
  "world-data",
  "player-data",
  "pal-archive",
  "inventory",
  "palconf",
  "rcon",
  "backup",
  "whitelist",
  "broadcast",
  "shutdown",
];
const mobileNavSelection = ref([...mobileNavDefaults]);
const mobileNavOrder = ref([...mobileNavOrderDefaults]);
const mobileNavDraft = ref([]);
const mobileNavDraftOrder = ref([]);
const isEditingMobileNav = ref(false);
const mobileNavDragState = ref(null);
const mobileNavPointerState = ref(null);

const mobileNavigationCatalog = computed(() => ({
  overview: { icon: DashboardOutlined, label: t("button.overview"), gate: "operate", kind: "view" },
  players: { icon: GameController, label: t("button.players"), kind: "view" },
  guilds: { icon: SupervisedUserCircleRound, label: t("button.guilds"), kind: "view" },
  map: { icon: PublicRound, label: t("button.map"), kind: "view" },
  operations: { icon: GuiManagement, label: t("operations.title"), gate: "operate" },
  settings: { icon: Settings, label: t("configuration.title"), gate: "admin" },
  "game-settings": { icon: ConstructOutline, label: t("gameSettings.title"), gate: "operate" },
  "pal-status": { icon: Paw, label: locale.value === "zh" ? "帕鲁状态" : "Pal status", gate: "operate" },
  advanced: { icon: Activity, label: locale.value === "zh" ? "运维中心" : "Operations center", gate: "operate" },
  "save-sources": { icon: Database, label: locale.value === "zh" ? "存档源" : "Save sources", gate: "operate" },
  mods: { icon: Package, label: locale.value === "zh" ? "模组管理" : "Mods", gate: "operate" },
  access: { icon: AdminPanelSettingsOutlined, label: locale.value === "zh" ? "账号权限" : "Access", gate: "admin" },
  "world-data": { icon: Database, label: locale.value === "zh" ? "世界数据" : "World data", gate: "operate" },
  "player-data": { icon: GameController, label: locale.value === "zh" ? "玩家数据" : "Player data", gate: "operate" },
  "pal-archive": { icon: Paw, label: locale.value === "zh" ? "帕鲁仓库" : "Pal archive", gate: "operate" },
  inventory: { icon: Package, label: locale.value === "zh" ? "全服库存" : "Global inventory", gate: "operate" },
  palconf: { icon: Settings, label: t("button.palconf") },
  rcon: { icon: Terminal, label: t("button.rcon"), gate: "operate" },
  backup: { icon: ArchiveOutlined, label: t("button.backup"), gate: "operate" },
  whitelist: { icon: ShieldCheckmarkSharp, label: t("button.whitelist"), gate: "operate" },
  broadcast: { icon: BroadcastTower, label: t("button.broadcast"), gate: "operate" },
  shutdown: { icon: SettingsPowerRound, label: t("button.shutdown"), gate: "admin", danger: true },
}));

const isMobileNavAvailable = (item) => {
  if (!item) return false;
  if (item.gate === "admin") return isAdmin.value;
  if (item.gate === "operate") return canOperate.value;
  if (item.gate === "login") return isLogin.value;
  return true;
};
const normalizeMobileNavOrder = (value) => {
  const known = new Set(Object.keys(mobileNavigationCatalog.value));
  const unique = [];
  for (const id of asArray(value)) {
    if (typeof id !== "string" || id === "tools" || !known.has(id) || unique.includes(id)) continue;
    unique.push(id);
  }
  for (const id of mobileNavOrderDefaults) {
    if (!unique.includes(id) && known.has(id)) unique.push(id);
  }
  for (const id of known) {
    if (!unique.includes(id)) unique.push(id);
  }
  return unique;
};
const normalizeMobileNavSelection = (value) => {
  const known = new Set(Object.keys(mobileNavigationCatalog.value));
  const unique = [];
  for (const id of asArray(value)) {
    if (typeof id !== "string" || id === "tools" || !known.has(id) || unique.includes(id)) continue;
    unique.push(id);
  }
  for (const id of mobileNavDefaults) {
    if (unique.length >= MOBILE_NAV_LIMIT) break;
    if (!unique.includes(id) && known.has(id)) unique.push(id);
  }
  return unique.slice(0, MOBILE_NAV_LIMIT);
};
const mobileNavItems = computed(() => {
  const items = mobileNavSelection.value
    .map((id) => ({ id, ...mobileNavigationCatalog.value[id] }))
    .filter((item) => item.label && isMobileNavAvailable(item));
  if (isLogin.value) {
    items.push({
      id: "tools",
      icon: GuiManagement,
      label: t("button.tools"),
      kind: "tools",
    });
  }
  return items;
});
const mobileNavEditorItems = computed(() => mobileNavDraftOrder.value
  .map((id) => ({
    id,
    ...mobileNavigationCatalog.value[id],
    selected: mobileNavDraft.value.includes(id),
  }))
  .filter((item) => item.label && isMobileNavAvailable(item)));
const mobileToolItems = computed(() => mobileNavOrder.value
  .map((id) => ({ id, ...mobileNavigationCatalog.value[id] }))
  .filter((item) => item.label && item.kind !== "view" && isMobileNavAvailable(item)));

const contentRef = ref(null);

const isLogin = ref(false);
const currentRole = ref("viewer");
const canOperate = computed(() =>
  ["admin", "operator"].includes(currentRole.value),
);
const isAdmin = computed(() => currentRole.value === "admin");
watch([currentDisplay, canOperate], ([display, allowed]) => {
  if (allowed && display === "overview") overviewReady.value = true;
}, { immediate: true });
const authToken = ref("");
let refreshTimer = null;
const asArray = (value) => (Array.isArray(value) ? value : []);
const playerDataReady = ref(false);
const guildDataReady = ref(false);

const loadMobileNavigation = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(MOBILE_NAV_STORAGE_KEY) || "null");
    if (Array.isArray(saved)) mobileNavSelection.value = normalizeMobileNavSelection(saved);
    const savedOrder = JSON.parse(localStorage.getItem(MOBILE_NAV_ORDER_STORAGE_KEY) || "null");
    mobileNavOrder.value = normalizeMobileNavOrder(savedOrder);
  } catch {
    mobileNavSelection.value = normalizeMobileNavSelection(mobileNavDefaults);
    mobileNavOrder.value = normalizeMobileNavOrder(mobileNavOrderDefaults);
  }
};
const beginMobileNavEditing = () => {
  mobileNavDraft.value = [...mobileNavSelection.value];
  mobileNavDraftOrder.value = normalizeMobileNavOrder(mobileNavOrder.value);
  mobileNavDragState.value = null;
  isEditingMobileNav.value = true;
  showMobileTools.value = true;
};
const cancelMobileNavEditing = () => {
  stopMobileNavPointerDrag();
  mobileNavDraft.value = [];
  mobileNavDraftOrder.value = [];
  mobileNavDragState.value = null;
  isEditingMobileNav.value = false;
};
const saveMobileNavEditing = () => {
  const nextOrder = normalizeMobileNavOrder(mobileNavDraftOrder.value);
  const selected = new Set(mobileNavDraft.value);
  const nextSelection = nextOrder.filter((id) => selected.has(id));
  mobileNavOrder.value = nextOrder;
  mobileNavSelection.value = normalizeMobileNavSelection(nextSelection);
  localStorage.setItem(MOBILE_NAV_STORAGE_KEY, JSON.stringify(mobileNavSelection.value));
  localStorage.setItem(MOBILE_NAV_ORDER_STORAGE_KEY, JSON.stringify(mobileNavOrder.value));
  cancelMobileNavEditing();
  message.success(locale.value === "zh" ? "底部导航已保存" : "Bottom navigation saved");
};
const toggleMobileNavItem = (id) => {
  if (mobileNavDraft.value.includes(id)) {
    mobileNavDraft.value = mobileNavDraft.value.filter((value) => value !== id);
    return;
  }
  if (mobileNavDraft.value.length >= MOBILE_NAV_LIMIT) {
    message.info(locale.value === "zh" ? `最多选择 ${MOBILE_NAV_LIMIT} 个底部项目` : `Choose up to ${MOBILE_NAV_LIMIT} bottom items`);
    return;
  }
  mobileNavDraft.value = [...mobileNavDraft.value, id];
};
const reorderMobileNavDraft = (sourceId, targetId, placeAfter = false) => {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = mobileNavDraftOrder.value.indexOf(sourceId);
  const targetIndex = mobileNavDraftOrder.value.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const next = [...mobileNavDraftOrder.value];
  next.splice(sourceIndex, 1);
  const nextTargetIndex = next.indexOf(targetId);
  next.splice(nextTargetIndex + (placeAfter ? 1 : 0), 0, sourceId);
  mobileNavDraftOrder.value = next;
};
const moveMobileNavItem = (id, offset) => {
  const visibleIds = mobileNavEditorItems.value.map((item) => item.id);
  const index = visibleIds.indexOf(id);
  const targetId = visibleIds[index + offset];
  if (!targetId) return;
  reorderMobileNavDraft(id, targetId, offset > 0);
};
const beginMobileNavPointerDrag = (event, id) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  stopMobileNavPointerDrag();
  mobileNavPointerState.value = {
    id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
  };
  window.addEventListener("pointermove", moveMobileNavPointerDrag, { passive: false });
  window.addEventListener("pointerup", endMobileNavPointerDrag);
  window.addEventListener("pointercancel", endMobileNavPointerDrag);
};
const moveMobileNavPointerDrag = (event) => {
  const state = mobileNavPointerState.value;
  if (!state || state.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
  if (!state.active && distance < 6) return;
  event.preventDefault();
  if (!state.active) {
    state.active = true;
    mobileNavDragState.value = state.id;
  }
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-mobile-nav-id]");
  const targetId = target?.getAttribute("data-mobile-nav-id");
  if (targetId) {
    const bounds = target.getBoundingClientRect();
    reorderMobileNavDraft(state.id, targetId, event.clientY > bounds.top + bounds.height / 2);
  }
};
const endMobileNavPointerDrag = () => {
  stopMobileNavPointerDrag();
};
const stopMobileNavPointerDrag = () => {
  window.removeEventListener("pointermove", moveMobileNavPointerDrag);
  window.removeEventListener("pointerup", endMobileNavPointerDrag);
  window.removeEventListener("pointercancel", endMobileNavPointerDrag);
  mobileNavPointerState.value = null;
  mobileNavDragState.value = null;
};
const handleMobileNavigation = (id) => {
  if (id === "tools") {
    showMobileTools.value = true;
    return;
  }
  if (mobileNavigationCatalog.value[id]?.kind === "view") {
    if (id === "overview") toOverview();
    if (id === "players") toPlayers();
    if (id === "guilds") toGuilds();
    if (id === "map") toMap();
    return;
  }
  executeAdminAction(id);
};

const handleSelectLanguage = (key) => {
  message.info(t("message.changelanguage"));
  localStorage.setItem("locale", key === "zh" ? "zh" : "en");
  setTimeout(() => {
    location.reload();
  }, 1000);
};

// get data
const getServerInfo = async ({ force = false } = {}) => {
  const value = await requestCached("mobile-server-info", async () => {
    const { data } = await new ApiService().getServerInfo();
    return data.value || {};
  }, { force });
  serverInfo.value = value || {};
};
const getServerMetrics = async ({ force = false } = {}) => {
  const value = await requestCached("mobile-server-metrics", async () => {
    const { data } = await new ApiService().getServerMetrics();
    return data.value || {};
  }, { force });
  serverMetrics.value = value || {};
};
const getPlayerList = async ({ force = false } = {}) => {
  void getOnlineList();
  const value = await requestCached("mobile-player-list", async () => {
    const { data } = await new ApiService().getPlayerList({
      order_by: "last_online",
      desc: true,
    });
    return asArray(data.value);
  }, { force });
  playerList.value = asArray(value);
  playerDataReady.value = true;
};
const getGuildList = async ({ force = false } = {}) => {
  const value = await requestCached("mobile-guild-list", async () => {
    const { data } = await new ApiService().getGuildList();
    return asArray(data.value);
  }, { force });
  guildList.value = asArray(value);
  guildDataReady.value = true;
};

const getPlayerInfo = async (player_uid) => {
  const { data } = await new ApiService().getPlayer({ playerUid: player_uid });
  playerInfo.value = data.value || {};
  playerPalsList.value = Array.isArray(playerInfo.value.pals)
    ? JSON.parse(JSON.stringify(playerInfo.value.pals))
    : [];
  currentPlayerPalsList.value = playerPalsList.value.slice(0, pageSize.value);
  isShowDetail.value = true;
  contentRef.value.scrollTo(0, 0);
};

const getGuildInfo = async (admin_player_uid) => {
  const { data } = await new ApiService().getGuild({
    adminPlayerUid: admin_player_uid,
  });
  guildInfo.value = data.value;
  isShowDetail.value = true;
  contentRef.value.scrollTo(0, 0);
};

// 接受子组件
const getChoosePlayer = (uid) => {
  getPlayerInfo(uid);
};
const getChooseGuild = (uid) => {
  getGuildInfo(uid);
};

const viewPlayerFromGuild = async (uid) => {
  currentDisplay.value = "players";
  await getPlayerInfo(uid);
};

const getPalName = (name) => {
  const lowerName = name.toLowerCase();
  return localeLowerPalMap.value[lowerName]
    ? localeLowerPalMap.value[lowerName]
    : name;
};

// 游戏用户的帕鲁列表分页，搜索
const clickSearch = (searchValue) => {
  const pattern = /^\s*$|(\s)\1/;
  if (searchValue && !pattern.test(searchValue)) {
    playerPalsList.value = playerInfo.value.pals.filter((item) => {
      return (
        item.skills.some((skill) => {
          return (
            skillMap[locale.value][skill]
              ? skillMap[locale.value][skill].name
              : skill
          ).includes(searchValue);
        }) || getPalName(item.type).includes(searchValue)
      );
    });
  } else {
    playerPalsList.value = JSON.parse(JSON.stringify(playerInfo.value.pals));
  }
  currentPage.value = 1;
  if (playerPalsList.value.length <= 10) {
    finished.value = true;
    currentPlayerPalsList.value = playerPalsList.value ?? [];
  } else {
    finished.value = false;
    currentPlayerPalsList.value = playerPalsList.value.slice(0, pageSize.value);
  }
};
// 滚动加载更多
const palsLoading = ref(false);
const currentPage = ref(1);
const pageSize = ref(10);
const finished = ref(false);
const onLoadPals = () => {
  if (playerPalsList.value.length <= currentPage.value * pageSize.value) {
    finished.value = true;
  } else {
    currentPage.value += 1;
    currentPlayerPalsList.value = playerPalsList.value.slice(
      0,
      pageSize.value * currentPage.value,
    );
  }
};
const onContentScroll = (event) => {
  if (currentDisplay.value === "players" && isShowDetail.value) {
    const container = event?.currentTarget || contentRef.value;
    if (
      container &&
      container.scrollTop + container.clientHeight > container.scrollHeight - 6
    ) {
      onLoadPals();
    }
  }
};

const getOnlineList = async () => {
  const value = await requestCached("online-players", async () => {
    const { data } = await new ApiService().getOnlinePlayerList();
    return asArray(data.value);
  });
  onlinePlayerList.value = asArray(value);
};
const refreshManagedServerData = async () => {
  const selectedPlayerUid =
    currentDisplay.value === "players" && isShowDetail.value
      ? playerInfo.value?.player_uid
      : "";
  await Promise.all([
    getServerInfo({ force: true }),
    getServerMetrics({ force: true }),
    getPlayerList({ force: true }),
    getOnlineList(),
    guildDataReady.value ? getGuildList({ force: true }) : Promise.resolve(),
  ]);
  if (selectedPlayerUid) await getPlayerInfo(selectedPlayerUid);
};

// login
const showLoginModal = ref(false);
const loginUsername = ref("");
const password = ref("");
const handleLogin = async () => {
  const { data, statusCode } = await new ApiService().login({
    username: loginUsername.value,
    password: password.value,
  });
  if (statusCode.value === 401) {
    message.error(t("message.autherr"));
    password.value = "";
    return;
  }
  let token = data.value.token;
  localStorage.setItem(PALWORLD_TOKEN, token);
  userStore().setIsLogin(true, token);
  currentRole.value = data.value.role || "admin";
  authToken.value = token;
  message.success(t("message.authsuccess"));
  showLoginModal.value = false;
  isLogin.value = true;
  currentDisplay.value = "overview";
};

// broadcast
const showBroadcastModal = ref(false);
const handleStartBrodcast = () => {
  // broadcast start
  if (checkAuthToken()) {
    showBroadcastModal.value = true;
  } else {
    message.error(t("message.requireauth"));
    showLoginModal.value = true;
  }
};
const showShutdownDialog = ref(false);
const showRconDrawer = ref(false);
const showBackupManager = ref(false);
const showWhitelistManager = ref(false);
const showServerOperations = ref(false);
const showGameSettings = ref(false);
const showOperationsCenter = ref(false);
const showSaveSources = ref(false);
const showMods = ref(false);
const showAccessManager = ref(false);
const showWorldData = ref(false);
const showPalStatus = ref(false);
const showPlayerData = ref(false);
const showPalArchive = ref(false);
const showInventory = ref(false);
const handleShutdown = () => {
  if (checkAuthToken()) {
    showShutdownDialog.value = true;
  } else {
    message.error(t("message.requireauth"));
    showLoginModal.value = true;
  }
};

const openAuthenticated = (target) => {
  if (checkAuthToken()) {
    target.value = true;
  } else {
    message.error(t("message.requireauth"));
    showLoginModal.value = true;
  }
};

const executeAdminAction = (key) => {
  if (key === "operations") openAuthenticated(showServerOperations);
  if (key === "game-settings") openAuthenticated(showGameSettings);
  if (key === "advanced") openAuthenticated(showOperationsCenter);
  if (key === "save-sources") openAuthenticated(showSaveSources);
  if (key === "mods") openAuthenticated(showMods);
  if (key === "access") openAuthenticated(showAccessManager);
  if (key === "world-data") openAuthenticated(showWorldData);
  if (key === "pal-status") openAuthenticated(showPalStatus);
  if (key === "player-data") openAuthenticated(showPlayerData);
  if (key === "pal-archive") openAuthenticated(showPalArchive);
  if (key === "inventory") openAuthenticated(showInventory);
  if (key === "settings") {
    if (checkAuthToken()) emit("open-config");
    else {
      message.error(t("message.requireauth"));
      showLoginModal.value = true;
    }
  }
  if (key === "rcon") openAuthenticated(showRconDrawer);
  if (key === "backup") openAuthenticated(showBackupManager);
  if (key === "whitelist") openAuthenticated(showWhitelistManager);
  if (key === "broadcast") handleStartBrodcast();
  if (key === "shutdown") handleShutdown();
  if (key === "config") {
    if (checkAuthToken()) emit("open-config");
    else {
      message.error(t("message.requireauth"));
      showLoginModal.value = true;
    }
  }
  if (key === "palconf") {
    window.open(
      "https://pal-conf.bluefissure.com/",
      "_blank",
      "noopener,noreferrer",
    );
  }
};

const handleAdminAction = (key) => {
  pendingAdminAction.value = key;
  showMobileTools.value = false;
};

const handleToolsClosed = () => {
  if (isEditingMobileNav.value) cancelMobileNavEditing();
  if (!pendingAdminAction.value) return;
  const action = pendingAdminAction.value;
  pendingAdminAction.value = "";
  executeAdminAction(action);
};

const toPlayers = async () => {
  if (currentDisplay.value === "players") {
    return;
  }
  if (!playerDataReady.value) await getPlayerList();
  currentDisplay.value = "players";
  isShowDetail.value = false;

  palsLoading.value = false;
  finished.value = false;
  currentPage.value = 1;

  contentRef.value.scrollTo(0, 0);
};
const toGuilds = async () => {
  if (currentDisplay.value === "guilds") {
    return;
  }
  if (!guildDataReady.value) await getGuildList();
  currentDisplay.value = "guilds";
  isShowDetail.value = false;

  palsLoading.value = false;
  finished.value = false;
  currentPage.value = 1;

  contentRef.value.scrollTo(0, 0);
};
const toOverview = () => {
  currentDisplay.value = "overview";
  isShowDetail.value = false;
};
const toMap = () => {
  currentDisplay.value = "map";
  isShowDetail.value = false;
  playerToGuildStore().setUpdateStatus("map");
};

watch(
  () => playerToGuildStore().getUpdateStatus(),
  async (status) => {
    if (currentDisplay.value !== "map" || status === "map") return;
    const uid = playerToGuildStore().getCurrentUid();
    if (!uid) return;

    if (status === "players") {
      currentDisplay.value = "players";
      await getPlayerInfo(uid);
    } else if (status === "guilds") {
      currentDisplay.value = "guilds";
      await getGuildInfo(uid);
    }
    playerToGuildStore().setCurrentUid(null);
  },
);
const returnList = () => {
  isShowDetail.value = false;

  palsLoading.value = false;
  finished.value = false;
  currentPage.value = 1;

  contentRef.value.scrollTo(0, 0);
};

/**
 * check auth token
 */
const checkAuthToken = () => {
  const token = localStorage.getItem(PALWORLD_TOKEN);
  if (token && token !== "") {
    if (isTokenExpired(token)) {
      localStorage.removeItem(PALWORLD_TOKEN);
      return false;
    }
    isLogin.value = true;
    authToken.value = token;
    return true;
  }
  return false;
};
const isTokenExpired = (token) => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    currentRole.value = "admin";
    return false;
  }
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
    );
    currentRole.value = payload.role || "admin";
    return Boolean(payload.exp) && payload.exp < Date.now() / 1000;
  } catch {
    return false;
  }
};

onMounted(async () => {
  locale.value = localStorage.getItem("locale");
  languageOptions.value = [
    {
      label: "简体中文",
      key: "zh",
      disabled: locale.value == "zh",
    },
    {
      label: "English",
      key: "en",
      disabled: locale.value == "en",
    },
  ];
  localeLowerPalMap.value = Object.keys(palMap[locale.value]).reduce(
    (acc, key) => {
      acc[key.toLowerCase()] = palMap[locale.value][key];
      return acc;
    },
    {},
  );
  loadMobileNavigation();
  loading.value = true;
  checkAuthToken();
  await Promise.all([getServerInfo(), getServerMetrics(), getPlayerList()]);
  if (isLogin.value) currentDisplay.value = "overview";
  loading.value = false;
  refreshTimer = setInterval(() => {
    getServerMetrics({ force: true });
    if (playerDataReady.value) getPlayerList({ force: true });
    if (guildDataReady.value) getGuildList({ force: true });
    getOnlineList();
  }, 60000);
});

onBeforeUnmount(() => {
  clearInterval(refreshTimer);
  stopMobileNavPointerDrag();
});
</script>

<template>
  <div class="mobile-shell">
    <header class="mobile-header">
      <div class="mobile-header-main">
        <div class="mobile-brand">
          <div class="mobile-brand-title">{{ $t("title") }}</div>
        </div>
        <div class="mobile-header-actions">
          <n-button
            circle
            quaternary
            size="small"
            :aria-label="
              $t(theme.isDark ? 'button.lightMode' : 'button.darkMode')
            "
            @click="theme.toggle"
          >
            <template #icon>
              <n-icon>
                <SunnyOutline v-if="theme.isDark" />
                <MoonOutline v-else />
              </n-icon>
            </template>
          </n-button>
          <n-dropdown
            trigger="click"
            :options="languageOptions"
            @select="handleSelectLanguage"
          >
            <n-button
              circle
              quaternary
              size="small"
              :aria-label="$t('button.language')"
            >
              <template #icon
                ><n-icon><LanguageSharp /></n-icon
              ></template>
            </n-button>
          </n-dropdown>
          <div
            v-if="isLogin"
            class="mobile-auth-indicator"
            :title="$t('status.authenticated')"
          >
            <n-icon><AdminPanelSettingsOutlined /></n-icon>
          </div>
          <n-button
            v-else
            type="primary"
            secondary
            size="small"
            @click="showLoginModal = true"
          >
            <template #icon
              ><n-icon><AdminPanelSettingsOutlined /></n-icon
            ></template>
            {{ $t("button.auth") }}
          </n-button>
        </div>
      </div>
      <div class="mobile-server-row">
        <div class="mobile-server-identity">
          <span
            class="ops-status-dot"
            :class="{ 'is-online': serverAvailable }"
          ></span>
          <span class="mobile-server-name">
            {{ serverInfo?.name || $t("status.serverUnavailable") }}
          </span>
        </div>
        <div class="mobile-server-counts">
          <span>{{
            $t("status.player_number", { number: playerList.length })
          }}</span>
          <span>{{ $t("status.online_number", { number: onlineCount }) }}</span>
        </div>
      </div>
    </header>

    <main ref="contentRef" class="mobile-content" @scroll="onContentScroll">
      <div v-if="isShowDetail" class="mobile-context-bar">
        <n-button
          circle
          quaternary
          size="small"
          :aria-label="$t('button.close')"
          @click="returnList"
        >
          <template #icon
            ><n-icon size="22"><ChevronsLeft /></n-icon
          ></template>
        </n-button>
        <span class="mobile-context-title">{{ currentViewLabel }}</span>
      </div>
      <div v-if="loading" class="ops-loading">
        <div class="ops-loading-panel"><n-skeleton text :repeat="4" /></div>
      </div>
      <template v-else>
        <admin-overview
          v-if="overviewReady"
          v-show="currentDisplay === 'overview'"
          :server-info="serverInfo"
          :server-metrics="serverMetrics"
          :players="playerList"
        />
        <map-view v-if="currentDisplay === 'map'" />
        <div v-if="!isShowDetail">
          <player-list
            v-if="currentDisplay === 'players'"
            :playerList="playerList"
            @onGetInfo="getChoosePlayer"
          />
          <guild-list
            v-if="currentDisplay === 'guilds'"
            :guildList="guildList"
            @onGetInfo="getChooseGuild"
          />
        </div>
        <div v-else class="relative">
          <player-detail
            v-if="currentDisplay === 'players'"
            :playerInfo="playerInfo"
            :currentPlayerPalsList="currentPlayerPalsList"
            :finished="finished"
            @onSearch="clickSearch"
          />
          <guild-detail
            v-if="currentDisplay === 'guilds'"
            :guildInfo="guildInfo"
            @view-player="viewPlayerFromGuild"
          />
        </div>
      </template>
    </main>

    <nav class="mobile-bottom-nav" :aria-label="$t('button.management')">
      <button
        v-for="item in mobileNavItems"
        :key="item.id"
        type="button"
        class="mobile-nav-button"
        :class="{ 'is-active': item.id === 'tools' ? showMobileTools : currentDisplay === item.id }"
        :aria-label="item.label"
        @click="handleMobileNavigation(item.id)"
      >
        <n-icon size="21"><component :is="item.icon" /></n-icon>
        <span>{{ item.label }}</span>
      </button>
    </nav>
  </div>
  <n-drawer
    v-model:show="showMobileTools"
    placement="bottom"
    height="min(470px, 82dvh)"
    :auto-focus="false"
    class="mobile-tools-drawer"
    @after-leave="handleToolsClosed"
  >
    <n-drawer-content closable>
      <template #header>
        <div class="mobile-tools-drawer__header">
          <span>{{ $t("button.tools") }}</span>
          <n-button
            class="mobile-tools-edit-trigger"
            quaternary
            circle
            size="small"
            :aria-label="isEditingMobileNav
              ? (locale === 'zh' ? '取消编辑工具栏' : 'Cancel toolbar editing')
              : (locale === 'zh' ? '编辑工具栏' : 'Edit toolbar')"
            :title="isEditingMobileNav
              ? (locale === 'zh' ? '取消编辑工具栏' : 'Cancel toolbar editing')
              : (locale === 'zh' ? '编辑工具栏' : 'Edit toolbar')"
            @click="isEditingMobileNav ? cancelMobileNavEditing() : beginMobileNavEditing()"
          >
            <template #icon>
              <n-icon><CloseOutline v-if="isEditingMobileNav" /><Settings v-else /></n-icon>
            </template>
          </n-button>
        </div>
      </template>
      <div v-if="isEditingMobileNav" class="mobile-nav-editor">
        <div class="mobile-nav-editor__intro">
          <div>
            <strong>{{ locale === "zh" ? "所有工具项目" : "All tool items" }}</strong>
            <span>{{ locale === "zh" ? "拖动左侧图标排序，勾选要显示在底部导航的项目" : "Drag the handle to reorder; check items for the bottom navigation" }}</span>
          </div>
          <span class="mobile-nav-editor__count">{{ mobileNavDraft.length }}/{{ MOBILE_NAV_LIMIT }}</span>
        </div>
        <div class="mobile-nav-editor__list">
          <div
            v-for="(item, index) in mobileNavEditorItems"
            :key="item.id"
            class="mobile-nav-editor__item"
            :class="{ 'is-dragging': mobileNavDragState === item.id }"
            :data-mobile-nav-id="item.id"
          >
            <button
              type="button"
              class="mobile-nav-editor__handle"
              :aria-label="locale === 'zh' ? `拖动${item.label}排序` : `Drag ${item.label} to reorder`"
              @pointerdown.stop.prevent="beginMobileNavPointerDrag($event, item.id)"
            >
              <n-icon><ReorderFourOutline /></n-icon>
            </button>
            <button
              type="button"
              class="mobile-nav-editor__toggle"
              :class="{ 'is-selected': item.selected }"
              :aria-pressed="item.selected"
              :aria-label="locale === 'zh' ? `${item.selected ? '取消选择' : '选择'}${item.label}` : `${item.selected ? 'Remove ' : 'Add '}${item.label} ${item.selected ? 'from' : 'to'} bottom navigation`"
              @click="toggleMobileNavItem(item.id)"
            >
              <n-icon><CheckmarkOutline v-if="item.selected" /><SquareOutline v-else /></n-icon>
              <n-icon><component :is="item.icon" /></n-icon>
              <span>{{ item.label }}</span>
            </button>
            <div class="mobile-nav-editor__order">
              <n-button quaternary circle size="small" :disabled="index === 0" :aria-label="locale === 'zh' ? '上移' : 'Move up'" @click="moveMobileNavItem(item.id, -1)"><template #icon><n-icon><ChevronUpOutline /></n-icon></template></n-button>
              <n-button quaternary circle size="small" :disabled="index === mobileNavEditorItems.length - 1" :aria-label="locale === 'zh' ? '下移' : 'Move down'" @click="moveMobileNavItem(item.id, 1)"><template #icon><n-icon><ChevronDownOutline /></n-icon></template></n-button>
            </div>
          </div>
          <div v-if="!mobileNavEditorItems.length" class="mobile-nav-editor__empty">{{ locale === "zh" ? "暂无可编辑项目" : "No editable items" }}</div>
        </div>
        <div class="mobile-nav-editor__actions">
          <n-button size="small" @click="cancelMobileNavEditing">{{ locale === "zh" ? "取消" : "Cancel" }}</n-button>
          <n-button type="primary" size="small" @click="saveMobileNavEditing">{{ locale === "zh" ? "保存" : "Save" }}</n-button>
        </div>
      </div>

      <div v-else class="mobile-tool-grid">
        <button
          v-for="item in mobileToolItems"
          :key="item.id"
          type="button"
          class="mobile-tool-button"
          :class="{ 'mobile-tool-button--danger': item.danger }"
          @click="handleAdminAction(item.id)"
        >
          <n-icon><component :is="item.icon" /></n-icon>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </n-drawer-content>
  </n-drawer>
  <!-- 登录 modal -->
  <n-modal
    v-model:show="showLoginModal"
    class="custom-card"
    preset="card"
    style="width: 90%; max-width: 600px"
    footer-style="padding: 12px;"
    content-style="padding: 12px;"
    header-style="padding: 12px;"
    :title="$t('modal.auth')"
    size="huge"
    :bordered="false"
  >
    <div>
      <span class="block pb-2">{{ $t("message.authdesc") }}</span>
      <n-input
        v-model:value="loginUsername"
        class="mb-2"
        :placeholder="
          locale === 'zh'
            ? '用户名（主管理员可留空）'
            : 'Username (optional for primary admin)'
        "
        autocomplete="username"
      />
      <n-input
        type="password"
        show-password-on="click"
        size="large"
        v-model:value="password"
        :aria-label="$t('modal.auth')"
        autocomplete="current-password"
        @keyup.enter="handleLogin"
      ></n-input>
    </div>
    <template #footer>
      <div class="flex justify-end">
        <n-button
          type="tertiary"
          @click="
            () => {
              showLoginModal = false;
              password = '';
            }
          "
          >{{ $t("button.cancel") }}</n-button
        >
        <n-button class="ml-3 w-40" type="primary" @click="handleLogin">{{
          $t("button.confirm")
        }}</n-button>
      </div>
    </template>
  </n-modal>
  <rcon-manager v-model:show="showRconDrawer" />
  <broadcast-composer v-model:show="showBroadcastModal" />
  <shutdown-dialog v-model:show="showShutdownDialog" />
  <backup-manager v-model:show="showBackupManager" />
  <server-operations
    v-model:show="showServerOperations"
    @server-changed="refreshManagedServerData"
  />
  <game-settings-manager v-model:show="showGameSettings" />
  <operations-center v-model:show="showOperationsCenter" />
  <save-source-manager v-model:show="showSaveSources" />
  <mod-manager v-model:show="showMods" />
  <access-manager v-model:show="showAccessManager" />
  <world-data-manager v-model:show="showWorldData" />
  <pal-status-manager v-model:show="showPalStatus" />
  <player-data-manager v-model:show="showPlayerData" />
  <pal-archive-manager v-model:show="showPalArchive" />
  <inventory-manager v-model:show="showInventory" />
  <whitelist-manager
    v-model:show="showWhitelistManager"
    :players="playerList"
  />
</template>
<style scoped>
.mobile-content :deep(.map-view) {
  min-height: 100%;
}
</style>
