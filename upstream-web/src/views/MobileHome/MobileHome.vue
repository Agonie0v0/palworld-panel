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
  BrandSteam,
  ChevronsLeft,
  Database,
  Dna,
  Package,
} from "@vicons/tabler";
import {
  ConstructOutline,
  GameController,
  LanguageSharp,
  MoonOutline,
  Settings,
  ShieldCheckmarkSharp,
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
import BreedingLab from "@/components/BreedingLab.vue";
import WorkshopManager from "@/components/WorkshopManager.vue";
import MapView from "@/views/PcHome/component/MapView.vue";
import playerToGuildStore from "@/stores/model/playerToGuild";
import themeStore from "@/stores/model/theme.js";

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

const contentRef = ref(null);

const isLogin = ref(false);
const currentRole = ref("viewer");
const canOperate = computed(() =>
  ["admin", "operator"].includes(currentRole.value),
);
const isAdmin = computed(() => currentRole.value === "admin");
const authToken = ref("");
let refreshTimer = null;
const asArray = (value) => (Array.isArray(value) ? value : []);

const handleSelectLanguage = (key) => {
  message.info(t("message.changelanguage"));
  localStorage.setItem("locale", key === "zh" ? "zh" : "en");
  setTimeout(() => {
    location.reload();
  }, 1000);
};

// get data
const getServerInfo = async () => {
  const { data } = await new ApiService().getServerInfo();
  serverInfo.value = data.value || {};
};
const getServerMetrics = async () => {
  const { data } = await new ApiService().getServerMetrics();
  serverMetrics.value = data.value || {};
};
const getPlayerList = async (is_update_info = true) => {
  getOnlineList();
  const { data } = await new ApiService().getPlayerList({
    order_by: "last_online",
    desc: true,
  });
  playerList.value = asArray(data.value);
};
const getGuildList = async () => {
  const { data } = await new ApiService().getGuildList();
  guildList.value = asArray(data.value);
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
  const { data } = await new ApiService().getOnlinePlayerList();
  onlinePlayerList.value = asArray(data.value);
};
const refreshManagedServerData = async () => {
  const selectedPlayerUid =
    currentDisplay.value === "players" && isShowDetail.value
      ? playerInfo.value?.player_uid
      : "";
  await Promise.all([getServerInfo(), getServerMetrics(), getPlayerList()]);
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
const showBreedingLab = ref(false);
const showWorkshop = ref(false);
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
  if (key === "breeding") openAuthenticated(showBreedingLab);
  if (key === "workshop") openAuthenticated(showWorkshop);
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
  if (!pendingAdminAction.value) return;
  const action = pendingAdminAction.value;
  pendingAdminAction.value = "";
  executeAdminAction(action);
};

const toPlayers = async () => {
  if (currentDisplay.value === "players") {
    return;
  }
  await getPlayerList();
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
  await getGuildList();
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
  loading.value = true;
  checkAuthToken();
  await Promise.all([getServerInfo(), getServerMetrics(), getPlayerList()]);
  if (isLogin.value) currentDisplay.value = "overview";
  loading.value = false;
  refreshTimer = setInterval(() => {
    getPlayerList(false);
    getServerMetrics();
  }, 60000);
});

onBeforeUnmount(() => {
  clearInterval(refreshTimer);
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
            :class="{ 'is-online': serverInfo?.name }"
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
          v-if="currentDisplay === 'overview'"
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
        v-if="canOperate"
        type="button"
        class="mobile-nav-button"
        :class="{ 'is-active': currentDisplay === 'overview' }"
        @click="toOverview"
      >
        <n-icon size="21"><DashboardOutlined /></n-icon>
        <span>{{ $t("button.overview") }}</span>
      </button>
      <button
        type="button"
        class="mobile-nav-button"
        :class="{ 'is-active': currentDisplay === 'players' }"
        @click="toPlayers"
      >
        <n-icon size="21"><GameController /></n-icon>
        <span>{{ $t("button.players") }}</span>
      </button>
      <button
        type="button"
        class="mobile-nav-button"
        :class="{ 'is-active': currentDisplay === 'guilds' }"
        @click="toGuilds"
      >
        <n-icon size="21"><SupervisedUserCircleRound /></n-icon>
        <span>{{ $t("button.guilds") }}</span>
      </button>
      <button
        type="button"
        class="mobile-nav-button"
        :class="{ 'is-active': currentDisplay === 'map' }"
        @click="toMap"
      >
        <n-icon size="21"><PublicRound /></n-icon>
        <span>{{ $t("button.map") }}</span>
      </button>
      <button
        v-if="isLogin"
        type="button"
        class="mobile-nav-button"
        :class="{ 'is-active': showMobileTools }"
        @click="showMobileTools = true"
      >
        <n-icon size="21"><GuiManagement /></n-icon>
        <span>{{ $t("button.tools") }}</span>
      </button>
    </nav>
  </div>
  <n-drawer
    v-model:show="showMobileTools"
    placement="bottom"
    height="min(470px, 82dvh)"
    class="mobile-tools-drawer"
    @after-leave="handleToolsClosed"
  >
    <n-drawer-content :title="$t('button.tools')" closable>
      <div class="mobile-tool-grid">
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('operations')"
        >
          <n-icon><GuiManagement /></n-icon>
          <span>{{ $t("operations.title") }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('settings')"
        >
          <n-icon><Settings /></n-icon>
          <span>{{ $t("configuration.title") }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('game-settings')"
        >
          <n-icon><ConstructOutline /></n-icon>
          <span>{{ $t("gameSettings.title") }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('advanced')"
        >
          <n-icon><Activity /></n-icon>
          <span>{{ locale === "zh" ? "运维中心" : "Operations center" }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('save-sources')"
        >
          <n-icon><Database /></n-icon>
          <span>{{ locale === "zh" ? "存档源" : "Save sources" }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('mods')"
        >
          <n-icon><Package /></n-icon>
          <span>{{ locale === "zh" ? "模组管理" : "Mods" }}</span>
        </button>
        <button
          v-if="isAdmin"
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('access')"
        >
          <n-icon><AdminPanelSettingsOutlined /></n-icon>
          <span>{{ locale === "zh" ? "账号权限" : "Access" }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('world-data')"
        >
          <n-icon><Database /></n-icon>
          <span>{{ locale === "zh" ? "世界数据" : "World data" }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('breeding')"
        >
          <n-icon><Dna /></n-icon>
          <span>{{ locale === "zh" ? "配种实验室" : "Breeding lab" }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('workshop')"
        >
          <n-icon><BrandSteam /></n-icon>
          <span>Workshop</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('palconf')"
        >
          <n-icon><Settings /></n-icon>
          <span>{{ $t("button.palconf") }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('rcon')"
        >
          <n-icon><Terminal /></n-icon>
          <span>{{ $t("button.rcon") }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('backup')"
        >
          <n-icon><ArchiveOutlined /></n-icon>
          <span>{{ $t("button.backup") }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('whitelist')"
        >
          <n-icon><ShieldCheckmarkSharp /></n-icon>
          <span>{{ $t("button.whitelist") }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button"
          @click="handleAdminAction('broadcast')"
        >
          <n-icon><BroadcastTower /></n-icon>
          <span>{{ $t("button.broadcast") }}</span>
        </button>
        <button
          type="button"
          class="mobile-tool-button mobile-tool-button--danger"
          @click="handleAdminAction('shutdown')"
        >
          <n-icon><SettingsPowerRound /></n-icon>
          <span>{{ $t("button.shutdown") }}</span>
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
  <breeding-lab v-model:show="showBreedingLab" />
  <workshop-manager v-model:show="showWorkshop" />
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
