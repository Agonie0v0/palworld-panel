<script setup>
import ApiService from "@/service/api";
import { ref, onMounted, computed, nextTick, watch } from "vue";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";
import { ChevronForward } from "@vicons/ionicons5";
import { Search } from "@vicons/tabler";
import PlayerDetail from "./PlayerDetail.vue";
import playerToGuildStore from "@/stores/model/playerToGuild";
import whitelistStore from "@/stores/model/whitelist";

const { t } = useI18n();

const props = defineProps({
  showWhitelistPlayer: String,
  players: { type: Array, default: () => [] },
});
const showWhitelistPlayer = computed(() => props.showWhitelistPlayer);

const isDarkMode = ref(
  window.matchMedia("(prefers-color-scheme: dark)").matches,
);

const loadingPlayer = ref(false);
const loadingPlayerDetail = ref(false);
const playerList = ref([]);
const playerInfo = ref(null);
const playerPalsList = ref([]);
const searchValue = ref("");
const statusFilter = ref("all");
const platformFilter = ref("all");
const whitelistFilter = ref("all");
const sortBy = ref("last_online");
// 获取玩家列表
const getPlayerList = async () => {
  if (props.players.length > 0) {
    playerList.value = [...props.players];
    return;
  }
  const { data } = await new ApiService().getPlayerList({
    order_by: "last_online",
    desc: true,
  });
  playerList.value = Array.isArray(data.value) ? data.value : [];
};

// 获取玩家详情信息
const getPlayerInfo = async (player_uid) => {
  const { data } = await new ApiService().getPlayer({ playerUid: player_uid });
  playerInfo.value = data.value;
  playerPalsList.value = playerInfo?.value.pals
    ? JSON.parse(JSON.stringify(playerInfo?.value.pals))
    : [];
  nextTick(() => {
    const playerInfoEL = document.getElementById("player-info");
    if (playerInfoEL) {
      playerInfoEL.scrollIntoView({ behavior: "smooth" });
    }
  });
};

const clickGetPlayerInfo = async (id) => {
  if (playerInfo.value?.player_uid !== id) {
    loadingPlayerDetail.value = true;
    await getPlayerInfo(id);
    loadingPlayerDetail.value = false;
  }
};

watch(
  () => showWhitelistPlayer.value,
  async (newVal) => {
    if (newVal && playerInfo.value?.player_uid !== newVal) {
      loadingPlayerDetail.value = true;
      await getPlayerInfo(newVal);
      loadingPlayerDetail.value = false;
    }
  },
);

watch(
  () => props.players,
  (players) => {
    if (players?.length > 0) playerList.value = [...players];
  },
  { deep: true },
);

// 白名单
const whiteList = computed(() => whitelistStore().getWhitelist());
const isWhite = computed(() => (player) => {
  if (player) {
    return whiteList.value.some((whitelistItem) => {
      return (
        (whitelistItem.player_uid &&
          whitelistItem.player_uid === player.player_uid) ||
        (whitelistItem.steam_id && whitelistItem.steam_id === player.steam_id)
      );
    });
  } else {
    return false;
  }
});

onMounted(async () => {
  loadingPlayerDetail.value = true;
  loadingPlayer.value = true;
  await getPlayerList();
  loadingPlayer.value = false;
  if (playerList.value.length > 0) {
    const currentUid = playerToGuildStore().getCurrentUid();
    await getPlayerInfo(
      currentUid ? currentUid : playerList.value[0].player_uid,
    );
    playerToGuildStore().setCurrentUid(null);
  }
  loadingPlayerDetail.value = false;
});

// 其他操作
const isPlayerOnline = (last_online) => {
  return dayjs() - dayjs(last_online) < 80000;
};
const platformOptions = computed(() => {
  const platforms = new Set(
    playerList.value
      .map((player) => player.user_id?.split("_")[0])
      .filter(Boolean),
  );
  return [
    { label: t("filter.allPlatforms"), value: "all" },
    ...[...platforms]
      .sort()
      .map((platform) => ({ label: platform, value: platform })),
  ];
});
const statusOptions = computed(() => [
  { label: t("filter.allStatuses"), value: "all" },
  { label: t("status.online"), value: "online" },
  { label: t("status.offline"), value: "offline" },
]);
const whitelistOptions = computed(() => [
  { label: t("filter.allPlayers"), value: "all" },
  { label: t("filter.whitelistOnly"), value: "whitelist" },
  { label: t("filter.nonWhitelistOnly"), value: "non-whitelist" },
]);
const sortOptions = computed(() => [
  { label: t("filter.lastOnline"), value: "last_online" },
  { label: t("filter.levelHighToLow"), value: "level" },
  { label: t("filter.nickname"), value: "nickname" },
]);
const filteredPlayers = computed(() => {
  const keyword = searchValue.value.trim().toLowerCase();
  const filtered = playerList.value.filter((player) => {
    const searchable = [
      player.nickname,
      player.player_uid,
      player.user_id,
      player.steam_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (keyword && !searchable.includes(keyword)) return false;
    const online = isPlayerOnline(player.last_online);
    if (statusFilter.value === "online" && !online) return false;
    if (statusFilter.value === "offline" && online) return false;
    const platform = player.user_id?.split("_")[0];
    if (platformFilter.value !== "all" && platform !== platformFilter.value)
      return false;
    const whitelisted = isWhite.value(player);
    if (whitelistFilter.value === "whitelist" && !whitelisted) return false;
    if (whitelistFilter.value === "non-whitelist" && whitelisted) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    if (sortBy.value === "level")
      return Number(b.level || 0) - Number(a.level || 0);
    if (sortBy.value === "nickname")
      return (a.nickname || "").localeCompare(b.nickname || "");
    return dayjs(b.last_online).valueOf() - dayjs(a.last_online).valueOf();
  });
});
</script>
<template>
  <div class="paler-list h-full" :class="{ 'is-dark': isDarkMode }">
    <div class="player-workspace">
      <section class="player-directory relative" aria-label="Player directory">
        <div class="filter-panel">
          <div class="directory-heading">
            <div>
              <strong>{{ $t("map.player") }}</strong>
              <span>{{ $t("filter.resultCount", { count: filteredPlayers.length }) }}</span>
            </div>
            <n-tag :bordered="false" type="success" round>
              {{ playerList.filter((player) => isPlayerOnline(player.last_online)).length }}
              {{ $t("status.online") }}
            </n-tag>
          </div>
          <n-input
            v-model:value="searchValue"
            clearable
            size="large"
            :placeholder="$t('filter.searchPlayers')"
            :aria-label="$t('filter.searchPlayers')"
          >
            <template #prefix><n-icon><Search /></n-icon></template>
          </n-input>
          <n-grid cols="2" :x-gap="10" :y-gap="10" class="filter-grid">
            <n-gi
              ><n-select v-model:value="statusFilter" :options="statusOptions"
            /></n-gi>
            <n-gi
              ><n-select
                v-model:value="platformFilter"
                :options="platformOptions"
            /></n-gi>
            <n-gi
              ><n-select
                v-model:value="whitelistFilter"
                :options="whitelistOptions"
            /></n-gi>
            <n-gi
              ><n-select v-model:value="sortBy" :options="sortOptions"
            /></n-gi>
          </n-grid>
        </div>
        <div class="player-table-head" aria-hidden="true">
          <span>{{ $t("input.nickname") }} / ID</span>
          <span>Lv.</span>
          <span>IP</span>
          <span>{{ $t("operations.state") }}</span>
        </div>
        <n-list class="player-list" :show-divider="false">
          <n-list-item
            v-for="player in filteredPlayers"
            :key="player.player_uid"
            class="player-row-item"
            @click="clickGetPlayerInfo(player.player_uid)"
            @keydown.enter="clickGetPlayerInfo(player.player_uid)"
            @keydown.space.prevent="clickGetPlayerInfo(player.player_uid)"
            role="button"
            tabindex="0"
            :aria-label="`${player.nickname}, Lv.${player.level}`"
            :aria-current="
              playerInfo?.player_uid === player.player_uid ? 'true' : undefined
            "
          >
            <div
              class="player-row"
              :class="{
                'is-selected': playerInfo?.player_uid === player.player_uid,
              }"
            >
              <div class="player-identity-cell">
                <span class="player-avatar">{{ (player.nickname || "P").slice(0, 1).toUpperCase() }}</span>
                <div class="player-row-main">
                  <div class="player-name-line">
                    <span class="player-name" :title="player.nickname">{{ player.nickname || "--" }}</span>
                    <n-tag v-if="isWhite(player)" :bordered="false" type="warning" size="tiny" round>
                      {{ $t("status.whitelist") }}
                    </n-tag>
                  </div>
                  <span class="player-id" :title="player.player_uid">{{ player.player_uid || "--" }}</span>
                </div>
              </div>
              <strong class="player-level">{{ player.level ?? "-" }}</strong>
              <span class="player-ip">{{ player.ip || "-" }}</span>
              <span
                class="player-status"
                :class="isPlayerOnline(player.last_online) ? 'is-online' : 'is-offline'"
              >
                <span class="status-dot"></span>
                {{ isPlayerOnline(player.last_online) ? $t("status.online") : $t("status.offline") }}
              </span>
              <n-icon class="row-chevron" size="18"><ChevronForward /></n-icon>
            </div>
          </n-list-item>
        </n-list>
        <n-empty
          v-if="!loadingPlayer && filteredPlayers.length === 0"
          class="empty-state"
        />
        <n-spin
          size="small"
          v-if="loadingPlayer"
          class="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-#ffffff40"
        >
          <template #description>加载中...</template>
        </n-spin>
      </section>
      <section class="player-detail-panel relative">
        <player-detail
          v-if="playerInfo?.player_uid"
          :playerInfo="playerInfo"
          :playerPalsList="playerPalsList"
        ></player-detail>
        <div v-else class="detail-empty"><n-empty /></div>
        <n-spin
          size="small"
          v-if="loadingPlayerDetail"
          class="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-#ffffff40"
        >
          <template #description>加载中...</template>
        </n-spin>
      </section>
    </div>
  </div>
</template>

<style scoped lang="less">
.filter-panel {
  position: sticky;
  top: 0;
  z-index: 3;
  padding: 20px 0 14px;
  background: var(--app-surface);
}

.is-dark .filter-panel {
  background: var(--app-surface);
}

.result-count {
  display: block;
  margin-top: 10px;
  padding: 0 2px;
  font-size: 13px;
}

.player-list {
  background: transparent;
}

.player-row-item {
  padding: 0 0 4px !important;
  outline: none;
}

.player-row-item:focus-visible .player-row {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 35%, transparent);
}

.player-row {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    background: color-mix(in srgb, var(--app-accent) 7%, transparent);
  }

  &.is-selected {
    border-color: color-mix(in srgb, var(--app-accent) 42%, var(--app-border));
    background: var(--app-accent-soft);
  }
}

.player-row-main {
  flex: 1;
  min-width: 0;
}

.player-name-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-meta-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 5px;
}

.player-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(24, 24, 28, 0.65);
  font-size: 12px;
}

.is-dark .player-status {
  color: rgba(255, 255, 255, 0.62);
}

.status-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;

  &.is-online {
    background: var(--app-success);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--app-success) 14%, transparent);
  }

  &.is-offline {
    background: var(--app-danger);
  }
}

.last-online {
  margin-top: 5px;
  color: var(--app-ink-muted);
  font-size: 12px;
  line-height: 1.25;
}

.last-online span {
  margin-left: 5px;
  color: rgba(24, 24, 28, 0.68);
  font-variant-numeric: tabular-nums;
}

.is-dark .last-online {
  color: rgba(255, 255, 255, 0.38);
}

.is-dark .last-online span {
  color: rgba(255, 255, 255, 0.62);
}

.row-chevron {
  flex: none;
  color: rgba(24, 24, 28, 0.28);
  transition: transform 0.18s ease;
}

.player-row:hover .row-chevron,
.player-row.is-selected .row-chevron {
  color: var(--app-accent);
  transform: translateX(2px);
}

.is-dark .row-chevron {
  color: rgba(255, 255, 255, 0.3);
}

.empty-state {
  padding: 48px 12px;
}

.detail-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--app-bg);
}

.paler-list {
  min-height: 100%;
}

.player-workspace {
  display: grid;
  min-height: calc(100vh - 182px);
  grid-template-columns: minmax(360px, 0.82fr) minmax(0, 1.9fr);
  align-items: start;
  gap: 20px;
}

.player-directory,
.player-detail-panel {
  min-width: 0;
  background: var(--app-surface);
  border-radius: var(--app-card-radius);
  box-shadow: var(--app-shadow-md);
}

.player-directory {
  position: sticky;
  top: 20px;
  max-height: calc(100vh - 122px);
  overflow: auto;
}

.player-detail-panel {
  min-height: calc(100vh - 182px);
  overflow: hidden;
}

.filter-panel {
  z-index: 4;
  padding: 22px 22px 16px;
}

.directory-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.directory-heading > div {
  min-width: 0;
}

.directory-heading strong,
.directory-heading span {
  display: block;
}

.directory-heading strong {
  color: var(--app-ink);
  font-size: 18px;
  font-weight: 800;
}

.directory-heading span {
  margin-top: 2px;
  color: var(--app-ink-muted);
  font-size: 13px;
}

.filter-grid {
  margin-top: 10px;
}

.player-table-head,
.player-row {
  display: grid;
  grid-template-columns: minmax(170px, 1.6fr) 44px minmax(74px, 0.75fr) 82px 20px;
  align-items: center;
  gap: 10px;
}

.player-table-head {
  position: sticky;
  top: 181px;
  z-index: 3;
  padding: 10px 22px;
  background: #f8fafc;
  color: var(--app-ink-muted);
  font-size: 11px;
  font-weight: 750;
}

.player-list {
  padding: 8px 10px 14px;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.player-row-item {
  padding: 0 0 3px !important;
}

.player-row {
  min-height: 68px;
  padding: 9px 12px;
  border: 0;
  border-radius: 12px;
  transition: background-color 220ms ease-in-out, box-shadow 220ms ease-in-out, transform 220ms ease-in-out;
}

.player-row:hover {
  background: #f8fafc;
  transform: translateX(3px);
}

.player-row.is-selected {
  border: 0;
  background: var(--app-accent-soft);
  box-shadow: inset 0 0 0 1px rgb(16 185 129 / 16%);
}

.player-identity-cell {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.player-avatar {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  color: #047857;
  background: var(--app-accent-soft);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 850;
}

.player-name {
  font-size: 14px;
  font-weight: 750;
}

.player-id,
.player-ip {
  display: block;
  overflow: hidden;
  color: var(--app-ink-muted);
  font-family: var(--app-font-data);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-status {
  justify-self: start;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.player-status.is-online {
  color: #047857;
  background: var(--app-success-soft);
}

.player-status.is-offline {
  color: #b91c1c;
  background: var(--app-danger-soft);
}

.player-status.is-online .status-dot {
  background: var(--app-success);
  box-shadow: 0 0 0 3px rgb(16 185 129 / 14%);
}

.player-status.is-offline .status-dot {
  background: var(--app-danger);
}

.player-level {
  color: var(--app-info);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1380px) {
  .player-workspace {
    grid-template-columns: minmax(340px, 0.72fr) minmax(0, 1.5fr);
  }

  .player-table-head,
  .player-row {
    grid-template-columns: minmax(155px, 1fr) 40px 72px 20px;
  }

  .player-table-head > :nth-child(3),
  .player-ip {
    display: none;
  }
}

@media (max-width: 980px) {
  .player-workspace {
    grid-template-columns: 1fr;
  }

  .player-directory {
    position: relative;
    top: auto;
    max-height: none;
  }

  .player-detail-panel {
    min-height: 680px;
  }
}

@media (max-width: 640px) {
  .player-workspace {
    gap: 14px;
  }

  .filter-panel {
    padding: 18px 16px 14px;
  }

  .player-table-head {
    top: 173px;
    padding-inline: 16px;
  }

  .player-table-head,
  .player-row {
    grid-template-columns: minmax(150px, 1fr) 36px 76px 18px;
  }
}
</style>
