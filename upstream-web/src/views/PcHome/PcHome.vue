<script setup>
import { AdminPanelSettingsOutlined } from "@vicons/material";
import {
  GameController,
  ContractOutline,
  ExpandOutline,
  LanguageSharp,
  MoonOutline,
  PencilOutline,
  SunnyOutline,
} from "@vicons/ionicons5";
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
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
import ConfigManager from "@/components/ConfigManager.vue";
import SidebarWorkspaceNav from "./component/SidebarWorkspaceNav.vue";
import whitelistStore from "@/stores/model/whitelist";
import playerToGuildStore from "@/stores/model/playerToGuild";
import userStore from "@/stores/model/user";
import themeStore from "@/stores/model/theme.js";

const { t, locale } = useI18n();

const message = useMessage();
const PALWORLD_TOKEN = "palworld_token";
const theme = themeStore();

const loading = ref(false);
const sidebarNav = ref(null);
const isFullscreen = ref(false);
const serverInfo = ref({});
const serverMetrics = ref({});
const currentDisplay = ref("players");
const playerList = ref([]);
const onlinePlayerList = ref([]);
const guildList = ref([]);
const languageOptions = ref([]);
const navigationLabels = ref({});
const asArray = (value) => (Array.isArray(value) ? value : []);
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
  const customLabel = navigationLabels.value[currentDisplay.value];
  if (customLabel) return customLabel;
  const labels = {
    overview: () => t("button.overview"),
    players: () => t("button.players"),
    guilds: () => t("button.guilds"),
    map: () => t("button.map"),
    operations: () => t("operations.title"),
    settings: () => t("configuration.title"),
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
provide("workspace-title", currentViewLabel);

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
  window.open(
    "https://github.com/Agonie0v0/palworld-panel/releases",
    "_blank",
    "noopener,noreferrer",
  );
};
const serverToolInfo = ref({});
const hasNewVersion = ref(false);
const panelVersionLabel = computed(() => {
  const version = String(serverToolInfo.value?.version || "").trim();
  if (!version) return "";
  return /^v/i.test(version) ? version : `v${version}`;
});
const panelVersionTitle = computed(() => {
  const parts = [
    locale.value === "zh"
      ? `面板版本 ${panelVersionLabel.value}`
      : `Panel ${panelVersionLabel.value}`,
  ];
  if (serverToolInfo.value?.commit) {
    parts.push(
      locale.value === "zh"
        ? `提交 ${serverToolInfo.value.commit}`
        : `Commit ${serverToolInfo.value.commit}`,
    );
  }
  if (serverToolInfo.value?.installedAt) {
    parts.push(
      locale.value === "zh"
        ? `安装时间 ${serverToolInfo.value.installedAt}`
        : `Installed ${serverToolInfo.value.installedAt}`,
    );
  }
  return parts.join("\n");
});
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
const refreshManagedServerData = async () => {
  await Promise.all([getServerInfo(), getServerMetrics(), getPlayerList()]);
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
const selectWorkspace = (key) => {
  if (key === "settings") {
    if (checkAuthToken()) currentDisplay.value = "settings";
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

const handleSidebarNavigation = (key) => {
  if (key === "overview") return toOverview();
  if (key === "players") return toPlayers();
  if (key === "guilds") return toGuilds();
  if (key === "map") return toMap();
  selectWorkspace(key);
};

const toggleFullscreen = async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
};

const syncFullscreenState = () => {
  isFullscreen.value = Boolean(document.fullscreenElement);
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

onMounted(async () => {
  document.addEventListener("fullscreenchange", syncFullscreenState);
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

onBeforeUnmount(() =>
  document.removeEventListener("fullscreenchange", syncFullscreenState),
);
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
            :title="panelVersionTitle"
            @click="toGithub"
          >
            {{ panelVersionLabel
            }}<span v-if="serverToolInfo.build">
              · {{ serverToolInfo.build }}</span
            ><span v-if="hasNewVersion"> · new</span>
          </button>
        </div>
      </div>

      <sidebar-workspace-nav
        ref="sidebarNav"
        :active-key="currentDisplay"
        :can-operate="canOperate"
        :is-admin="isAdmin"
        :is-login="isLogin"
        @select="handleSidebarNavigation"
        @labels-change="navigationLabels = $event"
      />
      <div class="ops-sidebar-footer">
        <div class="ops-sidebar-preferences">
          <n-button
            quaternary
            circle
            class="ops-preference-button"
            :aria-label="
              locale === 'zh'
                ? isFullscreen
                  ? '退出全屏'
                  : '进入全屏'
                : isFullscreen
                  ? 'Exit fullscreen'
                  : 'Enter fullscreen'
            "
            :title="
              locale === 'zh'
                ? isFullscreen
                  ? '退出全屏'
                  : '进入全屏'
                : isFullscreen
                  ? 'Exit fullscreen'
                  : 'Enter fullscreen'
            "
            @click="toggleFullscreen"
          >
            <template #icon
              ><n-icon
                ><ContractOutline v-if="isFullscreen" /><ExpandOutline
                  v-else /></n-icon
            ></template>
          </n-button>
          <n-button
            v-if="isAdmin"
            quaternary
            circle
            class="ops-preference-button"
            :aria-label="locale === 'zh' ? '编辑导航' : 'Edit navigation'"
            :title="locale === 'zh' ? '编辑导航' : 'Edit navigation'"
            @click="sidebarNav?.toggleEditing()"
          >
            <template #icon
              ><n-icon><PencilOutline /></n-icon
            ></template>
          </n-button>
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
        <n-tooltip v-else trigger="hover">
          <template #trigger>
            <div
              class="ops-auth-state"
              role="status"
              tabindex="0"
              :aria-label="$t('status.authenticated')"
            >
              <n-icon><AdminPanelSettingsOutlined /></n-icon>
            </div>
          </template>
          {{ $t("status.authenticated") }}
        </n-tooltip>
      </div>
    </aside>

    <main class="ops-main">
      <header
        class="ops-workspace-header"
        :class="{ 'is-tool-view': currentDisplay !== 'overview' }"
      >
        <div class="ops-workspace-heading">
          <h1 class="ops-workspace-title">
            {{ serverInfo?.name || $t("status.serverUnavailable") }}
          </h1>
          <div class="ops-workspace-context">
            <span>{{ serverInfo?.version || "Unknown" }}</span>
            <span>Palworld Dedicated Server</span>
          </div>
        </div>
        <div class="ops-header-telemetry" :aria-label="$t('overview.pulse')">
          <div class="ops-telemetry-item ops-telemetry-item--state">
            <span
              class="ops-status-dot"
              :class="{ 'is-online': serverAvailable }"
            ></span>
            <strong>{{
              serverAvailable
                ? $t("status.online")
                : $t("status.serverUnavailable")
            }}</strong>
          </div>
          <div class="ops-telemetry-item">
            <span>{{ $t("item.serverFps") }}</span>
            <strong>{{ serverMetrics?.server_fps ?? 0 }}</strong>
          </div>
          <div class="ops-telemetry-item ops-telemetry-item--players">
            <span>{{ $t("button.players") }}</span>
            <strong>{{ onlineCount }}/{{ playerList.length }}</strong>
          </div>
        </div>
      </header>
      <section
        class="ops-workspace-content"
        :class="{ 'is-overview': currentDisplay === 'overview' }"
      >
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
            @navigate="handleSidebarNavigation"
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
            @server-changed="refreshManagedServerData"
          />
          <game-settings-manager
            v-if="currentDisplay === 'game-settings'"
            :show="true"
            embedded
          />
          <config-manager
            v-if="currentDisplay === 'settings'"
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
