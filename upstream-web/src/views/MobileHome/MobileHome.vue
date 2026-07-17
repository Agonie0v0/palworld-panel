<script setup>
import {
  AdminPanelSettingsOutlined,
  DashboardOutlined,
  PublicRound,
  SupervisedUserCircleRound,
} from "@vicons/material";
import { ChevronsLeft } from "@vicons/tabler";
import { GameController, LanguageSharp } from "@vicons/ionicons5";
import { GuiManagement } from "@vicons/carbon";
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
import MapView from "@/views/PcHome/component/MapView.vue";
import playerToGuildStore from "@/stores/model/playerToGuild";

const emit = defineEmits(["open-config"]);

const { t, locale } = useI18n();

const message = useMessage();

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
const authToken = ref("");
let refreshTimer = null;
const asArray = (value) => (Array.isArray(value) ? value : []);

const handleSelectLanguage = (key) => {
  message.info(t("message.changelanguage"));
  if (key === "zh") {
    localStorage.setItem("locale", "zh");
    // locale.value = "zh";
  } else if (key === "ja") {
    localStorage.setItem("locale", "ja");
    // locale.value = "ja";
  } else {
    localStorage.setItem("locale", "en");
    // locale.value = "en";
  }
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

// login
const showLoginModal = ref(false);
const password = ref("");
const handleLogin = async () => {
  const { data, statusCode } = await new ApiService().login({
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

const adminOptions = computed(() => [
  { label: t("operations.title"), key: "operations" },
  { label: t("configuration.title"), key: "settings" },
  { label: t("gameSettings.title"), key: "game-settings" },
  { label: t("button.rcon"), key: "rcon" },
  { label: t("button.backup"), key: "backup" },
  { label: t("button.whitelist"), key: "whitelist" },
  { label: t("button.broadcast"), key: "broadcast" },
  { label: t("button.palconf"), key: "palconf" },
  { type: "divider", key: "divider" },
  {
    label: t("button.shutdown"),
    key: "shutdown",
    props: { style: "color: #d03050" },
  },
]);

const handleAdminAction = (key) => {
  if (key === "operations") openAuthenticated(showServerOperations);
  if (key === "game-settings") openAuthenticated(showGameSettings);
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
  if (parts.length !== 3) return false;
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
    );
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
    {
      label: "日本語",
      key: "ja",
      disabled: locale.value == "ja",
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
          <n-dropdown
            v-if="isLogin"
            trigger="click"
            :options="adminOptions"
            @select="handleAdminAction"
          >
            <n-button
              circle
              secondary
              size="small"
              :aria-label="$t('button.management')"
            >
              <template #icon
                ><n-icon><GuiManagement /></n-icon
              ></template>
            </n-button>
          </n-dropdown>
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
          @open-rcon="openAuthenticated(showRconDrawer)"
          @open-backup="openAuthenticated(showBackupManager)"
          @open-broadcast="handleStartBrodcast"
          @open-config="handleAdminAction('config')"
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
        v-if="isLogin"
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
    </nav>
  </div>
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
  <server-operations v-model:show="showServerOperations" />
  <game-settings-manager v-model:show="showGameSettings" />
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
