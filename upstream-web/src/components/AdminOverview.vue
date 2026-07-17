<script setup>
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";
import { Refresh } from "@vicons/tabler";
import ApiService from "@/service/api";

const props = defineProps({
  serverInfo: { type: Object, default: () => ({}) },
  serverMetrics: { type: Object, default: () => ({}) },
  players: { type: Array, default: () => [] },
});

const { t } = useI18n();
const api = new ApiService();
const loading = ref(false);
const onlinePlayers = ref([]);
const backups = ref([]);
const tasks = ref([]);
const asArray = (value) => (Array.isArray(value) ? value : []);

const latestBackup = computed(
  () =>
    [...backups.value].sort(
      (a, b) => new Date(b.save_time) - new Date(a.save_time),
    )[0],
);
const activeTasks = computed(() => tasks.value.filter((task) => task.enabled));
const nextTask = computed(
  () =>
    activeTasks.value
      .filter((task) => task.next_run_at)
      .sort((a, b) => new Date(a.next_run_at) - new Date(b.next_run_at))[0],
);
const serverOnline = computed(() => Boolean(props.serverInfo?.name));
const currentPlayers = computed(() =>
  Number(
    props.serverMetrics?.current_player_num ?? onlinePlayers.value.length ?? 0,
  ),
);
const maxPlayers = computed(() =>
  Number(props.serverMetrics?.max_player_num || 0),
);
const playerPercent = computed(() =>
  maxPlayers.value > 0
    ? Math.min(100, Math.round((currentPlayers.value / maxPlayers.value) * 100))
    : 0,
);
const fps = computed(() => Number(props.serverMetrics?.server_fps || 0));
const fpsPercent = computed(() =>
  Math.min(100, Math.max(0, Math.round((fps.value / 60) * 100))),
);
const uptime = computed(() => {
  const seconds = Number(props.serverMetrics?.uptime || 0);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0
    ? t("overview.uptimeDays", { days, hours })
    : t("overview.uptimeHours", { hours });
});
const healthType = computed(() => {
  if (!serverOnline.value) return "warning";
  return fps.value > 0 && fps.value < 30 ? "warning" : "success";
});
const fpsTone = computed(() => {
  if (!serverOnline.value || fps.value < 30) return "is-warning";
  return "is-success";
});
const latestBackupAge = computed(() => {
  if (!latestBackup.value?.save_time) return t("overview.never");
  const hours = Math.max(
    0,
    dayjs().diff(dayjs(latestBackup.value.save_time), "hour"),
  );
  if (hours < 24) return t("overview.hoursAgo", { hours });
  return t("overview.daysAgo", { days: Math.floor(hours / 24) });
});

const loadOverview = async () => {
  loading.value = true;
  try {
    const [onlineResponse, backupResponse, taskResponse] = await Promise.all([
      api.getOnlinePlayerList(),
      api.getBackupList({}),
      api.getRconTasks(),
    ]);
    onlinePlayers.value = asArray(onlineResponse.data.value);
    backups.value = asArray(backupResponse.data.value);
    tasks.value = asArray(taskResponse.data.value);
  } finally {
    loading.value = false;
  }
};

const formatTime = (value) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "—";

onMounted(loadOverview);
</script>

<template>
  <n-scrollbar class="overview-scroll">
    <div class="overview-page">
      <header class="overview-header">
        <div>
          <h2>{{ $t("overview.title") }}</h2>
          <p>{{ $t("overview.subtitle") }}</p>
        </div>
        <n-button secondary :loading="loading" @click="loadOverview">
          <template #icon>
            <n-icon><Refresh /></n-icon>
          </template>
          {{ $t("overview.refresh") }}
        </n-button>
      </header>

      <section class="overview-pulse" :aria-label="$t('overview.pulse')">
        <div class="overview-pulse-identity">
          <div class="overview-pulse-heading">
            <span class="overview-pulse-label">{{ $t("overview.pulse") }}</span>
            <n-tag :type="healthType" size="small" :bordered="false">
              {{
                serverOnline
                  ? $t("status.online")
                  : $t("status.serverUnavailable")
              }}
            </n-tag>
          </div>
          <strong>{{
            serverInfo?.name || $t("status.serverUnavailable")
          }}</strong>
          <span>{{ serverInfo?.version || "Unknown" }}</span>
          <dl class="overview-pulse-meta">
            <div>
              <dt>{{ $t("item.serverUptime") }}</dt>
              <dd>{{ uptime }}</dd>
            </div>
            <div>
              <dt>{{ $t("item.serverDays") }}</dt>
              <dd>{{ serverMetrics?.days ?? "—" }}</dd>
            </div>
          </dl>
        </div>

        <div class="overview-pulse-readings">
          <div class="overview-reading" :class="fpsTone">
            <div class="overview-reading-head">
              <span>{{ $t("item.serverFps") }}</span>
              <strong>{{ serverMetrics?.server_fps ?? "—" }}</strong>
            </div>
            <div class="overview-meter" aria-hidden="true">
              <span :style="{ width: `${fpsPercent}%` }"></span>
            </div>
            <small>{{
              $t("overview.fpsTarget", { percent: fpsPercent })
            }}</small>
          </div>

          <div class="overview-reading is-info">
            <div class="overview-reading-head">
              <span>{{ $t("overview.onlinePlayers") }}</span>
              <strong>
                {{ currentPlayers }}
                <small>/ {{ maxPlayers || "—" }}</small>
              </strong>
            </div>
            <div class="overview-meter" aria-hidden="true">
              <span :style="{ width: `${playerPercent}%` }"></span>
            </div>
            <small>{{
              $t("overview.capacityUsed", { percent: playerPercent })
            }}</small>
          </div>

          <div class="overview-reading is-backup">
            <div class="overview-reading-head">
              <span>{{ $t("overview.backupStatus") }}</span>
              <strong>{{ backups.length }}</strong>
            </div>
            <div class="overview-backup-time">{{ latestBackupAge }}</div>
            <small>{{
              latestBackup
                ? formatTime(latestBackup.save_time)
                : $t("overview.noBackupShort")
            }}</small>
          </div>
        </div>
      </section>

      <div class="overview-detail-grid">
        <section class="overview-panel overview-panel--players">
          <header class="overview-panel-header">
            <div>
              <h3>{{ $t("overview.onlineNow") }}</h3>
              <p>
                {{ $t("overview.totalPlayers", { count: players.length }) }}
              </p>
            </div>
            <span class="overview-count overview-count--players">
              {{ onlinePlayers.length }}
            </span>
          </header>
          <n-empty
            v-if="onlinePlayers.length === 0"
            size="small"
            :description="$t('overview.noOnlinePlayers')"
          />
          <ul v-else class="overview-player-list">
            <li
              v-for="player in onlinePlayers.slice(0, 8)"
              :key="player.player_uid"
            >
              <span>{{ player.nickname }}</span>
              <n-tag size="small" type="success">Lv.{{ player.level }}</n-tag>
            </li>
          </ul>
        </section>

        <section class="overview-panel overview-panel--automation">
          <header class="overview-panel-header">
            <div>
              <h3>{{ $t("overview.automation") }}</h3>
              <p>{{ $t("overview.automationHint") }}</p>
            </div>
            <span class="overview-count overview-count--tasks">
              {{ activeTasks.length }}
            </span>
          </header>
          <dl class="overview-definition-list">
            <div>
              <dt>{{ $t("overview.activeTasks") }}</dt>
              <dd>{{ activeTasks.length }}</dd>
            </div>
            <div>
              <dt>{{ $t("overview.nextTask") }}</dt>
              <dd>{{ nextTask?.name || "—" }}</dd>
            </div>
            <div>
              <dt>{{ $t("overview.nextRun") }}</dt>
              <dd>{{ formatTime(nextTask?.next_run_at) }}</dd>
            </div>
          </dl>
        </section>

        <section class="overview-panel overview-panel--backup">
          <header class="overview-panel-header">
            <div>
              <h3>{{ $t("overview.backupStatus") }}</h3>
              <p>{{ $t("overview.backupHint") }}</p>
            </div>
            <span class="overview-count overview-count--backup">
              {{ backups.length }}
            </span>
          </header>
          <n-empty
            v-if="!latestBackup"
            size="small"
            :description="$t('overview.noBackup')"
          />
          <dl v-else class="overview-definition-list">
            <div>
              <dt>{{ $t("overview.latestBackup") }}</dt>
              <dd>{{ formatTime(latestBackup.save_time) }}</dd>
            </div>
            <div>
              <dt>{{ $t("overview.backupCount") }}</dt>
              <dd>{{ backups.length }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  </n-scrollbar>
</template>

<style scoped>
.overview-scroll {
  height: 100%;
}

.overview-page {
  width: min(1380px, 100%);
  margin: 0 auto;
  padding: 26px;
}

.overview-header,
.overview-pulse-heading,
.overview-reading-head,
.overview-panel-header {
  display: flex;
  align-items: center;
}

.overview-header {
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.overview-header h2,
.overview-panel-header h3 {
  color: var(--app-ink);
  letter-spacing: 0;
}

.overview-header h2 {
  font-size: 20px;
}

.overview-header p,
.overview-panel-header p {
  color: var(--app-ink-muted);
}

.overview-header p {
  margin-top: 3px;
  font-size: 13px;
}

.overview-pulse {
  display: grid;
  grid-template-columns: minmax(250px, 0.8fr) minmax(0, 2.2fr);
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.overview-pulse-identity {
  min-width: 0;
  padding: 22px;
  background: var(--app-accent-soft);
  border-right: 1px solid var(--app-border);
}

.overview-pulse-heading {
  justify-content: space-between;
  gap: 12px;
}

.overview-pulse-label {
  color: var(--app-accent);
  font-size: 12px;
  font-weight: 700;
}

.overview-pulse-identity > strong,
.overview-pulse-identity > span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-pulse-identity > strong {
  margin-top: 22px;
  color: var(--app-ink);
  font-size: 21px;
}

.overview-pulse-identity > span {
  margin-top: 4px;
  color: var(--app-ink-secondary);
  font-size: 12px;
}

.overview-pulse-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 24px;
}

.overview-pulse-meta dt {
  color: var(--app-ink-muted);
  font-size: 11px;
}

.overview-pulse-meta dd {
  margin-top: 3px;
  color: var(--app-ink);
  font-size: 13px;
  font-weight: 700;
}

.overview-pulse-readings {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.overview-reading {
  min-width: 0;
  padding: 24px 20px;
}

.overview-reading + .overview-reading {
  border-left: 1px solid var(--app-border);
}

.overview-reading-head {
  justify-content: space-between;
  gap: 12px;
}

.overview-reading-head > span,
.overview-reading > small {
  color: var(--app-ink-muted);
  font-size: 12px;
}

.overview-reading-head strong {
  color: var(--app-ink);
  font-size: 25px;
}

.overview-reading-head strong small {
  color: var(--app-ink-muted);
  font-size: 13px;
  font-weight: 500;
}

.overview-meter {
  height: 7px;
  margin: 28px 0 12px;
  overflow: hidden;
  background: var(--app-surface-muted);
  border-radius: 4px;
}

.overview-meter span {
  display: block;
  height: 100%;
  background: var(--app-success);
  border-radius: inherit;
}

.overview-reading.is-warning .overview-meter span {
  background: var(--app-warning);
}

.overview-reading.is-info .overview-meter span {
  background: var(--app-info);
}

.overview-backup-time {
  margin: 20px 0 7px;
  color: var(--app-success);
  font-size: 18px;
  font-weight: 700;
}

.overview-detail-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}

.overview-panel {
  min-width: 0;
  min-height: 245px;
  padding: 18px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.overview-panel-header {
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--app-border);
}

.overview-panel-header h3 {
  font-size: 14px;
}

.overview-panel-header p {
  margin-top: 2px;
  font-size: 11px;
}

.overview-count {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  color: var(--app-info);
  background: var(--app-info-soft);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 800;
}

.overview-count--tasks {
  color: var(--app-warning);
  background: var(--app-warning-soft);
}

.overview-count--backup {
  color: var(--app-success);
  background: var(--app-success-soft);
}

.overview-definition-list {
  display: grid;
}

.overview-definition-list > div,
.overview-player-list li {
  display: flex;
  min-height: 47px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--app-border);
}

.overview-definition-list > div:last-child,
.overview-player-list li:last-child {
  border-bottom: 0;
}

.overview-definition-list dt {
  color: var(--app-ink-muted);
  font-size: 12px;
}

.overview-definition-list dd {
  overflow: hidden;
  color: var(--app-ink);
  font-size: 13px;
  font-weight: 600;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-player-list {
  list-style: none;
}

.overview-player-list li > span {
  overflow: hidden;
  color: var(--app-ink);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1080px) {
  .overview-pulse {
    grid-template-columns: 1fr;
  }

  .overview-pulse-identity {
    border-right: 0;
    border-bottom: 1px solid var(--app-border);
  }

  .overview-detail-grid {
    grid-template-columns: 1fr 1fr;
  }

  .overview-panel--players {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .overview-page {
    padding: 16px 14px 22px;
  }

  .overview-header {
    align-items: flex-start;
  }

  .overview-header p {
    max-width: 30ch;
  }

  .overview-pulse-readings,
  .overview-detail-grid {
    grid-template-columns: 1fr;
  }

  .overview-reading + .overview-reading {
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }

  .overview-reading {
    padding: 18px;
  }

  .overview-meter {
    margin-top: 18px;
  }

  .overview-panel,
  .overview-panel--players {
    min-height: 0;
    grid-column: auto;
  }
}
</style>
