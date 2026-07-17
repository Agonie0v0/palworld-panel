<script setup>
import {
  AdminPanelSettingsOutlined,
  SupervisedUserCircleRound,
  SettingsPowerRound,
  ArchiveOutlined,
  PublicRound,
  DashboardOutlined,
} from "@vicons/material";
import {
  GameController,
  LanguageSharp,
  ShieldCheckmarkSharp,
  Terminal,
  Settings,
  ConstructOutline,
  MoonOutline,
  SunnyOutline,
} from "@vicons/ionicons5";
import { GuiManagement } from "@vicons/carbon";
import { BroadcastTower } from "@vicons/fa";
import { Activity, BrandSteam, Database, Dna, Package } from "@vicons/tabler";
import { computed, onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ApiService from "@/service/api";
import PlayerList from "./component/PlayerList.vue";
import GuildList from "./component/GuildList.vue";
import MapView from "./component/MapView.vue";
import RconManager from "@/components/RconManager.vue";
import AdminOverview from "@/components/AdminOverview.vue";
import BackupManager from "@/components/BackupManager.vue";
import BroadcastComposer from "@/components/BroadcastComposer.vue";
import ShutdownDialog from "@/components/ShutdownDialog.vue";
import WhitelistManager from "@/components/WhitelistManager.vue";
import ServerOperations from "@/components/ServerOperations.vue";
import GameSettingsManager from "@/components/GameSettingsManager.vue";
import OperationsCenter from "@/components/OperationsCenter.vue";
import SaveSourceManager from "@/components/SaveSourceManager.vue";
import ModManager from "@/components/ModManager.vue";
import AccessManager from "@/components/AccessManager.vue";
import WorldDataManager from "@/components/WorldDataManager.vue";
import BreedingLab from "@/components/BreedingLab.vue";
import WorkshopManager from "@/components/WorkshopManager.vue";
import whitelistStore from "@/stores/model/whitelist";
import playerToGuildStore from "@/stores/model/playerToGuild";
import { watch } from "vue";
import userStore from "@/stores/model/user";
import themeStore from "@/stores/model/theme.js";

const emit = defineEmits(["open-config"]);

const { t, locale } = useI18n();

const message = useMessage();
const PALWORLD_TOKEN = "palworld_token";
const theme = themeStore();

const loading = ref(false);
const serverInfo = ref({});
const serverMetrics = ref({});
const currentDisplay = ref("players");
const playerList = ref([]);
const onlinePlayerList = ref([]);
const guildList = ref([]);
const languageOptions = ref([]);
const asArray = (value) => (Array.isArray(value) ? value : []);
const onlineCount = computed(
  () =>
    serverMetrics.value?.current_player_num ??
    onlinePlayerList.value?.length ??
    0,
);
const sidebarFpsPercent = computed(() =>
  Math.min(
    100,
    Math.max(
      0,
      Math.round((Number(serverMetrics.value?.server_fps || 0) / 60) * 100),
    ),
  ),
);
const currentViewLabel = computed(() => {
  const labels = {
    overview: () => t("button.overview"),
    players: () => t("button.players"),
    guilds: () => t("button.guilds"),
    map: () => t("button.map"),
    operations: () => t("operations.title"),
    "game-settings": () => t("gameSettings.title"),
    advanced: () =>
      locale.value === "zh" ? "\u8fd0\u7ef4\u4e2d\u5fc3" : "Operations center",
    "save-sources": () =>
      locale.value === "zh" ? "\u5b58\u6863\u6e90" : "Save sources",
    mods: () => (locale.value === "zh" ? "\u6a21\u7ec4\u7ba1\u7406" : "Mods"),
    "world-data": () =>
      locale.value === "zh" ? "\u4e16\u754c\u6570\u636e" : "World data",
    breeding: () =>
      locale.value === "zh" ? "\u914d\u79cd\u5b9e\u9a8c\u5ba4" : "Breeding lab",
    workshop: () => "Workshop",
    rcon: () => t("modal.rcon"),
    backup: () => t("button.backup"),
    whitelist: () => t("modal.whitelist"),
    broadcast: () => t("modal.broadcast"),
    access: () =>
      locale.value === "zh" ? "\u8d26\u53f7\u6743\u9650" : "Access",
  };
  return (labels[currentDisplay.value] || labels.players)();
});

const isLogin = ref(false);
const currentRole = ref("viewer");
const canOperate = computed(() =>
  ["admin", "operator"].includes(currentRole.value),
);
const isAdmin = computed(() => currentRole.value === "admin");

const handleSelectLanguage = (key) => {
  message.info(t("message.changelanguage"));
  localStorage.setItem("locale", key === "zh" ? "zh" : "en");
  setTimeout(() => {
    location.reload();
  }, 1000);
};

const toPalConf = () => {
  window.open(
    "https://pal-conf.bluefissure.com/",
    "_blank",
    "noopener,noreferrer",
  );
};

const toGithub = () => {
  window.open("https://github.com/zaigie/palworld-server-tool/releases");
};
const serverToolInfo = ref({});
const hasNewVersion = ref(false);
const getServerToolInfo = async () => {
  const { data } = await new ApiService().getServerToolInfo();
  serverToolInfo.value = data.value;
  if (data.value) {
    hasNewVersion.value = isNewVersion(data.value?.version, data.value?.latest);
  }
};
const isNewVersion = (version, latest) => {
  if (
    typeof version !== "string" ||
    typeof latest !== "string" ||
    version === "Unknown" ||
    version === "Develop" ||
    latest === ""
  ) {
    return false;
  }
  const currentParts = version.replace(/^v/i, "").split(".").map(Number);
  const latestParts = latest.replace(/^v/i, "").split(".").map(Number);
  if (currentParts.some(Number.isNaN) || latestParts.some(Number.isNaN))
    return false;
  const partCount = Math.max(currentParts.length, latestParts.length);
  for (let i = 0; i < partCount; i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;
    if (latestPart > currentPart) {
      return true;
    } else if (latestPart < currentPart) {
      return false;
    }
  }
  return false;
};

// get data
const getServerInfo = async () => {
  const { data } = await new ApiService().getServerInfo();
  serverInfo.value = data.value || {};
};

const getServerMetrics = async () => {
  const { data } = await new ApiService().getServerMetrics();
  serverMetrics.value = data.value;
};

const getPlayerList = async () => {
  getOnlineList();
  const { data } = await new ApiService().getPlayerList({
    order_by: "last_online",
    desc: true,
  });
  playerList.value = asArray(data.value);
};
const getOnlineList = async () => {
  const { data } = await new ApiService().getOnlinePlayerList();
  onlinePlayerList.value = asArray(data.value);
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
  await getWhiteList();
  message.success(t("message.authsuccess"));
  showLoginModal.value = false;
  isLogin.value = true;
  currentDisplay.value = "overview";
};
const handleRconDrawer = () => selectWorkspace("rcon");

const selectWorkspace = (key) => {
  if (key === "settings") {
    if (checkAuthToken()) emit("open-config");
    else {
      message.error(t("message.requireauth"));
      showLoginModal.value = true;
    }
    return;
  }
  if (key === "palconf") {
    toPalConf();
    return;
  }
  if (key === "shutdown") {
    handleShutdown();
    return;
  }
  const protectedViews = new Set([
    "operations",
    "game-settings",
    "advanced",
    "save-sources",
    "mods",
    "access",
    "world-data",
    "breeding",
    "workshop",
    "rcon",
    "backup",
    "whitelist",
    "broadcast",
  ]);
  if (protectedViews.has(key) && !checkAuthToken()) {
    message.error(t("message.requireauth"));
    showLoginModal.value = true;
    return;
  }
  currentDisplay.value = key;
};

// 白名单
const handleWhiteList = () => selectWorkspace("whitelist");
const getWhiteList = async () => {
  if (checkAuthToken()) {
    const { data, statusCode } = await new ApiService().getWhitelist();
    if (statusCode.value === 200) {
      if (data.value) {
        whitelistStore().setWhitelist(asArray(data.value));
      }
    }
  }
};
// 接受玩家加入到黑名单信息
const getSonWhitelistStatus = () => {
  getWhiteList();
};

// 广播
const showBroadcastModal = ref(false);
const handleStartBrodcast = () => {
  // 开始广播
  if (checkAuthToken()) {
    showBroadcastModal.value = true;
  } else {
    message.error(t("message.requireauth"));
    showLoginModal.value = true;
  }
};
const showShutdownDialog = ref(false);
const handleShutdown = () => {
  if (checkAuthToken()) {
    showShutdownDialog.value = true;
  } else {
    message.error(t("message.requireauth"));
    showLoginModal.value = true;
  }
};

const toPlayers = () => {
  selectWorkspace("players");
  playerToGuildStore().setUpdateStatus("players");
};
const toOverview = () => {
  selectWorkspace("overview");
};
const toGuilds = () => {
  selectWorkspace("guilds");
  playerToGuildStore().setUpdateStatus("guilds");
};

const toMap = () => {
  selectWorkspace("map");
  playerToGuildStore().setUpdateStatus("map");
};

const playerToGuildStatus = computed(() =>
  playerToGuildStore().getUpdateStatus(),
);

watch(
  () => playerToGuildStatus.value,
  (newVal) => {
    currentDisplay.value = newVal;
    if (newVal === "players") {
    } else if (newVal === "guilds") {
    }
  },
);

/**
 * 检测 token
 */
const checkAuthToken = () => {
  const token = localStorage.getItem(PALWORLD_TOKEN);
  if (token && token !== "") {
    if (isTokenExpired(token)) {
      localStorage.removeItem(PALWORLD_TOKEN);
      return false;
    }
    isLogin.value = true;
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

const handleBackupList = () => selectWorkspace("backup");

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
  loading.value = true;
  checkAuthToken();
  await Promise.all([
    getServerInfo(),
    getServerMetrics(),
    getServerToolInfo(),
    getPlayerList(),
  ]);
  await getWhiteList();
  if (isLogin.value) currentDisplay.value = "overview";
  loading.value = false;
  setInterval(async () => {
    await getPlayerList();
    await getServerMetrics();
  }, 60000);
  // 调试用
  // currentDisplay.value = "map";
  // playerToGuildStore().setUpdateStatus("map");
});
</script>

<template>
  <div class="ops-shell ops-shell--desktop">
    <aside class="ops-sidebar">
      <div class="ops-brand">
        <div class="ops-brand-mark" aria-hidden="true">
          <n-icon size="23"><GameController /></n-icon>
        </div>
        <div class="ops-brand-copy">
          <div class="ops-brand-title">{{ $t("title") }}</div>
          <button
            v-if="serverToolInfo?.version"
            type="button"
            class="ops-brand-version"
            @click="toGithub"
          >
            {{ serverToolInfo.version }}<span v-if="hasNewVersion"> · new</span>
          </button>
        </div>
      </div>

      <div class="ops-server-block">
        <div class="ops-server-line">
          <span
            class="ops-status-dot"
            :class="{ 'is-online': serverInfo?.name }"
          ></span>
          <span class="ops-server-name">
            {{ serverInfo?.name || $t("status.serverUnavailable") }}
          </span>
        </div>
        <div class="ops-server-meta">
          {{ serverInfo?.version || "Unknown" }} · {{ $t("item.serverFps") }}
          {{ serverMetrics?.server_fps ?? 0 }}
        </div>
        <div
          class="ops-server-pulse"
          :class="{ 'is-warning': sidebarFpsPercent < 50 }"
          aria-hidden="true"
        >
          <span :style="{ width: `${sidebarFpsPercent}%` }"></span>
        </div>
        <div class="ops-server-stats">
          <span>
            <strong>{{ onlineCount }}</strong>
            {{ $t("status.online") }}
          </span>
          <span>
            <strong>{{ playerList.length }}</strong>
            {{ $t("button.players") }}
          </span>
        </div>
      </div>

      <div class="ops-nav-label">{{ $t("button.management") }}</div>
      <nav class="ops-nav" :aria-label="$t('button.management')">
        <button
          v-if="isLogin"
          type="button"
          class="ops-menu-button"
          :class="{ 'is-active': currentDisplay === 'overview' }"
          @click="toOverview"
        >
          <n-icon><DashboardOutlined /></n-icon>
          <span>{{ $t("button.overview") }}</span>
        </button>
        <button
          type="button"
          class="ops-menu-button"
          :class="{ 'is-active': currentDisplay === 'players' }"
          @click="toPlayers"
        >
          <n-icon><GameController /></n-icon>
          <span>{{ $t("button.players") }}</span>
        </button>
        <button
          type="button"
          class="ops-menu-button"
          :class="{ 'is-active': currentDisplay === 'guilds' }"
          @click="toGuilds"
        >
          <n-icon><SupervisedUserCircleRound /></n-icon>
          <span>{{ $t("button.guilds") }}</span>
        </button>
        <button
          type="button"
          class="ops-menu-button"
          :class="{ 'is-active': currentDisplay === 'map' }"
          @click="toMap"
        >
          <n-icon><PublicRound /></n-icon>
          <span>{{ $t("button.map") }}</span>
        </button>
      </nav>

      <template v-if="canOperate">
        <div class="ops-nav-label ops-nav-label--group">
          {{ locale === "zh" ? "\u670d\u52a1\u5668" : "Server" }}
        </div>
        <nav
          class="ops-nav ops-nav--list"
          :aria-label="locale === 'zh' ? '\u670d\u52a1\u5668' : 'Server'"
        >
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'operations' }"
            @click="selectWorkspace('operations')"
          >
            <n-icon><GuiManagement /></n-icon
            ><span>{{ $t("operations.title") }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'game-settings' }"
            @click="selectWorkspace('game-settings')"
          >
            <n-icon><ConstructOutline /></n-icon
            ><span>{{ $t("gameSettings.title") }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'rcon' }"
            @click="selectWorkspace('rcon')"
          >
            <n-icon><Terminal /></n-icon><span>{{ $t("modal.rcon") }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'broadcast' }"
            @click="selectWorkspace('broadcast')"
          >
            <n-icon><BroadcastTower /></n-icon
            ><span>{{ $t("modal.broadcast") }}</span>
          </button>
        </nav>

        <div class="ops-nav-label ops-nav-label--group">
          {{
            locale === "zh"
              ? "\u6570\u636e\u4e0e\u4fdd\u62a4"
              : "Data & protection"
          }}
        </div>
        <nav
          class="ops-nav ops-nav--list"
          :aria-label="
            locale === 'zh'
              ? '\u6570\u636e\u4e0e\u4fdd\u62a4'
              : 'Data and protection'
          "
        >
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'backup' }"
            @click="selectWorkspace('backup')"
          >
            <n-icon><ArchiveOutlined /></n-icon
            ><span>{{ $t("button.backup") }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'save-sources' }"
            @click="selectWorkspace('save-sources')"
          >
            <n-icon><Database /></n-icon
            ><span>{{
              locale === "zh" ? "\u5b58\u6863\u6e90" : "Save sources"
            }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'world-data' }"
            @click="selectWorkspace('world-data')"
          >
            <n-icon><Database /></n-icon
            ><span>{{
              locale === "zh" ? "\u4e16\u754c\u6570\u636e" : "World data"
            }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'whitelist' }"
            @click="selectWorkspace('whitelist')"
          >
            <n-icon><ShieldCheckmarkSharp /></n-icon
            ><span>{{ $t("modal.whitelist") }}</span>
          </button>
        </nav>

        <div class="ops-nav-label ops-nav-label--group">
          {{
            locale === "zh"
              ? "\u6269\u5c55\u4e0e\u81ea\u52a8\u5316"
              : "Extensions & automation"
          }}
        </div>
        <nav
          class="ops-nav ops-nav--list"
          :aria-label="
            locale === 'zh'
              ? '\u6269\u5c55\u4e0e\u81ea\u52a8\u5316'
              : 'Extensions and automation'
          "
        >
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'advanced' }"
            @click="selectWorkspace('advanced')"
          >
            <n-icon><Activity /></n-icon
            ><span>{{
              locale === "zh" ? "\u8fd0\u7ef4\u4e2d\u5fc3" : "Operations center"
            }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'breeding' }"
            @click="selectWorkspace('breeding')"
          >
            <n-icon><Dna /></n-icon
            ><span>{{
              locale === "zh"
                ? "\u914d\u79cd\u5b9e\u9a8c\u5ba4"
                : "Breeding lab"
            }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'mods' }"
            @click="selectWorkspace('mods')"
          >
            <n-icon><Package /></n-icon
            ><span>{{
              locale === "zh" ? "\u6a21\u7ec4\u7ba1\u7406" : "Mods"
            }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'workshop' }"
            @click="selectWorkspace('workshop')"
          >
            <n-icon><BrandSteam /></n-icon><span>Workshop</span>
          </button>
        </nav>

        <div v-if="isAdmin" class="ops-nav-label ops-nav-label--group">
          {{
            locale === "zh"
              ? "\u9762\u677f\u7ba1\u7406"
              : "Panel administration"
          }}
        </div>
        <nav
          v-if="isAdmin"
          class="ops-nav ops-nav--list"
          :aria-label="
            locale === 'zh'
              ? '\u9762\u677f\u7ba1\u7406'
              : 'Panel administration'
          "
        >
          <button
            type="button"
            class="ops-menu-button"
            @click="selectWorkspace('settings')"
          >
            <n-icon><Settings /></n-icon
            ><span>{{ $t("configuration.title") }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button"
            :class="{ 'is-active': currentDisplay === 'access' }"
            @click="selectWorkspace('access')"
          >
            <n-icon><AdminPanelSettingsOutlined /></n-icon
            ><span>{{
              locale === "zh" ? "\u8d26\u53f7\u6743\u9650" : "Access"
            }}</span>
          </button>
          <button
            type="button"
            class="ops-menu-button ops-menu-button--danger"
            @click="selectWorkspace('shutdown')"
          >
            <n-icon><SettingsPowerRound /></n-icon
            ><span>{{ $t("button.shutdown") }}</span>
          </button>
        </nav>
      </template>

      <div class="ops-sidebar-footer">
        <div class="ops-sidebar-preferences">
          <n-button
            quaternary
            circle
            class="ops-preference-button"
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
              quaternary
              circle
              class="ops-preference-button"
              :aria-label="$t('button.language')"
            >
              <template #icon
                ><n-icon><LanguageSharp /></n-icon
              ></template>
            </n-button>
          </n-dropdown>
        </div>
        <n-button
          v-if="!isLogin"
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
        <div v-else class="ops-auth-state">
          <n-icon><AdminPanelSettingsOutlined /></n-icon>
          <span>{{ $t("status.authenticated") }}</span>
        </div>
      </div>
    </aside>

    <main class="ops-main">
      <header class="ops-workspace-header">
        <div class="ops-workspace-heading">
          <h1 class="ops-workspace-title">{{ currentViewLabel }}</h1>
          <div class="ops-workspace-context">
            <span>{{
              serverInfo?.name || $t("status.serverUnavailable")
            }}</span>
            <span>{{ serverInfo?.version || "Unknown" }}</span>
          </div>
        </div>
        <div class="ops-header-telemetry" :aria-label="$t('overview.pulse')">
          <div class="ops-telemetry-item ops-telemetry-item--state">
            <span
              class="ops-status-dot"
              :class="{ 'is-online': serverInfo?.name }"
            ></span>
            <strong>{{
              serverInfo?.name
                ? $t("status.online")
                : $t("status.serverUnavailable")
            }}</strong>
          </div>
          <div class="ops-telemetry-item">
            <span>{{ $t("item.serverFps") }}</span>
            <strong>{{ serverMetrics?.server_fps ?? 0 }}</strong>
          </div>
          <div class="ops-telemetry-item">
            <span>{{ $t("button.players") }}</span>
            <strong>{{ onlineCount }}/{{ playerList.length }}</strong>
          </div>
        </div>
      </header>

      <section
        v-if="false"
        class="ops-command-shelf"
        :aria-label="$t('button.tools')"
      >
        <div class="ops-command-title">{{ $t("button.tools") }}</div>
        <div class="ops-command-grid">
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('operations')"
          >
            <n-icon><GuiManagement /></n-icon>
            <span>{{ $t("operations.title") }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('settings')"
          >
            <n-icon><Settings /></n-icon>
            <span>{{ $t("configuration.title") }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('game-settings')"
          >
            <n-icon><ConstructOutline /></n-icon>
            <span>{{ $t("gameSettings.title") }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('advanced')"
          >
            <n-icon><Activity /></n-icon>
            <span>{{
              locale === "zh" ? "运维中心" : "Operations center"
            }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('save-sources')"
          >
            <n-icon><Database /></n-icon>
            <span>{{ locale === "zh" ? "存档源" : "Save sources" }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('mods')"
          >
            <n-icon><Package /></n-icon>
            <span>{{ locale === "zh" ? "模组管理" : "Mods" }}</span>
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="ops-command-button"
            @click="handleToolAction('access')"
          >
            <n-icon><AdminPanelSettingsOutlined /></n-icon>
            <span>{{ locale === "zh" ? "账号权限" : "Access" }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('world-data')"
          >
            <n-icon><Database /></n-icon>
            <span>{{ locale === "zh" ? "世界数据" : "World data" }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('breeding')"
          >
            <n-icon><Dna /></n-icon>
            <span>{{ locale === "zh" ? "配种实验室" : "Breeding lab" }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('workshop')"
          >
            <n-icon><BrandSteam /></n-icon>
            <span>Workshop</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleToolAction('palconf')"
          >
            <n-icon><Settings /></n-icon>
            <span>{{ $t("button.palconf") }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleRconDrawer"
          >
            <n-icon><Terminal /></n-icon>
            <span>{{ $t("button.rcon") }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleBackupList"
          >
            <n-icon><ArchiveOutlined /></n-icon>
            <span>{{ $t("button.backup") }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleWhiteList"
          >
            <n-icon><ShieldCheckmarkSharp /></n-icon>
            <span>{{ $t("button.whitelist") }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button"
            @click="handleStartBrodcast"
          >
            <n-icon><BroadcastTower /></n-icon>
            <span>{{ $t("button.broadcast") }}</span>
          </button>
          <button
            type="button"
            class="ops-command-button ops-command-button--danger"
            @click="handleShutdown"
          >
            <n-icon><SettingsPowerRound /></n-icon>
            <span>{{ $t("button.shutdown") }}</span>
          </button>
        </div>
      </section>

      <section class="ops-workspace-content">
        <div v-if="loading" class="ops-loading">
          <div class="ops-loading-panel">
            <n-skeleton text :repeat="4" />
          </div>
        </div>
        <template v-else>
          <admin-overview
            v-if="currentDisplay === 'overview'"
            :server-info="serverInfo"
            :server-metrics="serverMetrics"
            :players="playerList"
          />
          <player-list
            v-if="currentDisplay === 'players'"
            :players="playerList"
            @onWhitelistStatus="getSonWhitelistStatus"
          />
          <guild-list v-if="currentDisplay === 'guilds'" :guilds="guildList" />
          <map-view v-if="currentDisplay === 'map'" />
          <server-operations
            v-if="currentDisplay === 'operations'"
            :show="true"
            embedded
          />
          <game-settings-manager
            v-if="currentDisplay === 'game-settings'"
            :show="true"
            embedded
          />
          <operations-center
            v-if="currentDisplay === 'advanced'"
            :show="true"
            embedded
          />
          <save-source-manager
            v-if="currentDisplay === 'save-sources'"
            :show="true"
            embedded
          />
          <mod-manager v-if="currentDisplay === 'mods'" :show="true" embedded />
          <access-manager
            v-if="currentDisplay === 'access'"
            :show="true"
            embedded
          />
          <world-data-manager
            v-if="currentDisplay === 'world-data'"
            :show="true"
            embedded
          />
          <breeding-lab
            v-if="currentDisplay === 'breeding'"
            :show="true"
            embedded
          />
          <workshop-manager
            v-if="currentDisplay === 'workshop'"
            :show="true"
            embedded
          />
          <rcon-manager
            v-if="currentDisplay === 'rcon'"
            :show="true"
            embedded
          />
          <backup-manager
            v-if="currentDisplay === 'backup'"
            :show="true"
            embedded
          />
          <whitelist-manager
            v-if="currentDisplay === 'whitelist'"
            :show="true"
            embedded
            :players="playerList"
            @updated="getSonWhitelistStatus"
          />
          <broadcast-composer
            v-if="currentDisplay === 'broadcast'"
            :show="true"
            embedded
          />
        </template>
      </section>
    </main>
  </div>
  <!-- login modal -->
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

  <shutdown-dialog v-model:show="showShutdownDialog" />
</template>

<style scoped>
.ops-brand-version {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: var(--app-sidebar-muted);
  background: transparent;
  border: 0;
  font-size: 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.ops-brand-version:hover {
  color: var(--app-sidebar-ink);
}
</style>
