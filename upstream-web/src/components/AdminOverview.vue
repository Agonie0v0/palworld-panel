<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";
import {
  Activity,
  Cpu,
  Database,
  DeviceDesktopAnalytics,
  Refresh,
  Server,
} from "@vicons/tabler";
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
const hostMetrics = ref({});
let hostRefreshTimer;
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
const cpuPercent = computed(() =>
  Number(hostMetrics.value?.cpu?.usedPercent || 0),
);
const memoryPercent = computed(() =>
  Number(hostMetrics.value?.memory?.usedPercent || 0),
);
const diskPercent = computed(() =>
  Number(hostMetrics.value?.disk?.usedPercent || 0),
);
const processMemoryPercent = computed(() =>
  Number(hostMetrics.value?.process?.memoryPercent || 0),
);
const hostPeakPercent = computed(() =>
  Math.max(
    cpuPercent.value,
    memoryPercent.value,
    hostMetrics.value?.disk ? diskPercent.value : 0,
  ),
);
const hostHealthType = computed(() => {
  if (hostPeakPercent.value >= 90) return "error";
  if (hostPeakPercent.value >= 75) return "warning";
  return "success";
});
const hostHealthLabel = computed(() => {
  if (hostPeakPercent.value >= 90) return t("overview.hostCritical");
  if (hostPeakPercent.value >= 75) return t("overview.hostElevated");
  return t("overview.hostHealthy");
});
const signalSegments = computed(() => [
  {
    key: "server",
    label: t("overview.serverStatus"),
    tone: serverOnline.value ? "is-success" : "is-warning",
  },
  {
    key: "fps",
    label: t("item.serverFps"),
    tone: fpsTone.value,
  },
  {
    key: "players",
    label: t("overview.onlinePlayers"),
    tone: playerPercent.value >= 85 ? "is-warning" : "is-info",
  },
  {
    key: "backup",
    label: t("overview.backupStatus"),
    tone: latestBackup.value ? "is-success" : "is-warning",
  },
  {
    key: "host",
    label: t("overview.hostLoad"),
    tone: loadTone(hostPeakPercent.value),
  },
]);

const loadTone = (value) => {
  if (value >= 90) return "is-danger";
  if (value >= 75) return "is-warning";
  return "is-success";
};

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  return `${(value / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
};

const formatHostUptime = (seconds) => {
  const total = Math.max(0, Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  return days > 0
    ? t("overview.uptimeDays", { days, hours })
    : t("overview.uptimeHours", { hours });
};

const loadHostMetrics = async () => {
  const response = await api.getHostMetrics();
  hostMetrics.value = response.data.value?.metrics || {};
};

const loadOverview = async () => {
  loading.value = true;
  try {
    const [onlineResponse, backupResponse, taskResponse, metricsResponse] =
      await Promise.all([
        api.getOnlinePlayerList(),
        api.getBackupList({}),
        api.getRconTasks(),
        api.getHostMetrics(),
      ]);
    onlinePlayers.value = asArray(onlineResponse.data.value);
    backups.value = asArray(backupResponse.data.value);
    tasks.value = asArray(taskResponse.data.value);
    hostMetrics.value = metricsResponse.data.value?.metrics || {};
  } finally {
    loading.value = false;
  }
};

const formatTime = (value) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "—";

onMounted(() => {
  loadOverview();
  hostRefreshTimer = setInterval(
    () => loadHostMetrics().catch(() => {}),
    30000,
  );
});

onBeforeUnmount(() => clearInterval(hostRefreshTimer));
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
        <div class="overview-signal-rail" aria-hidden="true">
          <span
            v-for="segment in signalSegments"
            :key="segment.key"
            :class="segment.tone"
            :title="segment.label"
          ></span>
        </div>
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

      <section class="overview-host" :aria-label="$t('overview.hostLoad')">
        <header class="overview-host-header">
          <div class="overview-host-heading">
            <span class="overview-host-mark" aria-hidden="true">
              <n-icon><Server /></n-icon>
            </span>
            <div>
              <h3>{{ $t("overview.hostLoad") }}</h3>
              <p>{{ $t("overview.hostLoadHint") }}</p>
            </div>
          </div>
          <div class="overview-host-summary">
            <n-tag
              v-if="!hostMetrics.unavailable"
              :type="hostHealthType"
              size="small"
              :bordered="false"
            >
              {{ hostHealthLabel }}
            </n-tag>
            <div class="overview-host-identity">
              <strong>{{ hostMetrics.hostname || "—" }}</strong>
              <span>
                {{ hostMetrics.platform || "—" }}/{{
                  hostMetrics.arch || "—"
                }}
                · {{ $t("overview.hostUptime") }}
                {{ formatHostUptime(hostMetrics.uptimeSeconds) }}
              </span>
            </div>
          </div>
        </header>

        <n-alert
          v-if="hostMetrics.unavailable"
          type="warning"
          :bordered="false"
          class="overview-host-alert"
        >
          {{ hostMetrics.error || $t("operations.metricsUnavailable") }}
        </n-alert>
        <div v-else class="overview-host-grid">
          <div class="host-reading" :class="loadTone(cpuPercent)">
            <div class="host-reading-head">
              <div class="host-reading-title">
                <span class="host-reading-icon" aria-hidden="true">
                  <n-icon><Cpu /></n-icon>
                </span>
                <span>{{ $t("operations.cpuUsage") }}</span>
              </div>
              <strong>{{ cpuPercent.toFixed(1) }}%</strong>
            </div>
            <div class="host-meter">
              <span :style="{ width: `${cpuPercent}%` }"></span>
            </div>
            <div class="host-reading-meta">
              <small
                >{{ hostMetrics.cpu?.cores || "—" }}
                {{ $t("operations.cpuCores") }}</small
              >
              <small>{{
                $t("overview.loadAverage", {
                  value: hostMetrics.cpu?.loadAverage?.[0]?.toFixed?.(2) || "—",
                })
              }}</small>
            </div>
          </div>
          <div class="host-reading" :class="loadTone(memoryPercent)">
            <div class="host-reading-head">
              <div class="host-reading-title">
                <span class="host-reading-icon" aria-hidden="true">
                  <n-icon><DeviceDesktopAnalytics /></n-icon>
                </span>
                <span>{{ $t("operations.memoryUsage") }}</span>
              </div>
              <strong>{{ memoryPercent.toFixed(1) }}%</strong>
            </div>
            <div class="host-meter">
              <span :style="{ width: `${memoryPercent}%` }"></span>
            </div>
            <div class="host-reading-meta">
              <small
                >{{ formatBytes(hostMetrics.memory?.used) }} /
                {{ formatBytes(hostMetrics.memory?.total) }}</small
              >
              <small>{{
                $t("overview.freeMemory", {
                  value: formatBytes(hostMetrics.memory?.free),
                })
              }}</small>
            </div>
          </div>
          <div class="host-reading" :class="loadTone(diskPercent)">
            <div class="host-reading-head">
              <div class="host-reading-title">
                <span class="host-reading-icon" aria-hidden="true">
                  <n-icon><Database /></n-icon>
                </span>
                <span>{{ $t("operations.diskUsage") }}</span>
              </div>
              <strong>{{
                hostMetrics.disk ? `${diskPercent.toFixed(1)}%` : "—"
              }}</strong>
            </div>
            <div v-if="hostMetrics.disk" class="host-meter">
              <span :style="{ width: `${diskPercent}%` }"></span>
            </div>
            <div class="host-reading-meta">
              <small>{{
                hostMetrics.disk
                  ? `${formatBytes(hostMetrics.disk.used)} / ${formatBytes(hostMetrics.disk.total)}`
                  : $t("operations.metricUnavailable")
              }}</small>
              <small v-if="hostMetrics.disk">{{
                hostMetrics.disk.mount
              }}</small>
            </div>
          </div>
          <div class="host-reading" :class="loadTone(processMemoryPercent)">
            <div class="host-reading-head">
              <div class="host-reading-title">
                <span class="host-reading-icon" aria-hidden="true">
                  <n-icon><Activity /></n-icon>
                </span>
                <span>{{ $t("overview.palworldProcess") }}</span>
              </div>
              <strong>{{
                hostMetrics.process
                  ? `${processMemoryPercent.toFixed(1)}%`
                  : "—"
              }}</strong>
            </div>
            <div v-if="hostMetrics.process" class="host-meter">
              <span :style="{ width: `${processMemoryPercent}%` }"></span>
            </div>
            <div class="host-reading-meta">
              <small v-if="hostMetrics.process">
                CPU
                {{ Number(hostMetrics.process.cpuPercent || 0).toFixed(1) }}% ·
                {{ formatBytes(hostMetrics.process.memoryBytes) }}
              </small>
              <small v-else>{{ $t("operations.processUnavailable") }}</small>
              <small v-if="hostMetrics.process">
                {{ $t("operations.processUptime") }}
                {{ formatHostUptime(hostMetrics.process.uptimeSeconds) }}
              </small>
            </div>
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
  font-family: var(--app-font-display);
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

.overview-signal-rail {
  display: grid;
  height: 6px;
  grid-column: 1 / -1;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 2px;
  padding: 0 2px;
  background: var(--app-border);
}

.overview-signal-rail span {
  background: var(--app-info);
  transform-origin: left;
  animation: signal-rail-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.overview-signal-rail span:nth-child(2) {
  animation-delay: 35ms;
}

.overview-signal-rail span:nth-child(3) {
  animation-delay: 70ms;
}

.overview-signal-rail span:nth-child(4) {
  animation-delay: 105ms;
}

.overview-signal-rail span:nth-child(5) {
  animation-delay: 140ms;
}

.overview-signal-rail .is-success {
  background: var(--app-success);
}

.overview-signal-rail .is-warning {
  background: var(--app-warning);
}

.overview-signal-rail .is-danger {
  background: var(--app-danger);
}

@keyframes signal-rail-in {
  from {
    opacity: 0.4;
    transform: scaleX(0.15);
  }

  to {
    opacity: 1;
    transform: scaleX(1);
  }
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
  font-family: var(--app-font-display);
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
  font-family: var(--app-font-data);
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
  font-family: var(--app-font-data);
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
  font-family: var(--app-font-display);
  font-size: 18px;
  font-weight: 700;
}

.overview-host {
  margin-top: 16px;
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.overview-host-header,
.host-reading-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.overview-host-header {
  padding: 17px 18px;
  background: var(--app-surface-raised);
}

.overview-host-heading,
.overview-host-summary,
.host-reading-title,
.host-reading-meta {
  display: flex;
  align-items: center;
}

.overview-host-heading {
  min-width: 0;
  gap: 12px;
}

.overview-host-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  color: var(--app-accent);
  background: var(--app-accent-soft);
  border-radius: 7px;
  font-size: 20px;
}

.overview-host-header h3 {
  color: var(--app-ink);
  font-family: var(--app-font-display);
  font-size: 14px;
}

.overview-host-header p,
.overview-host-identity span,
.host-reading-title > span:last-child,
.host-reading small {
  color: var(--app-ink-muted);
  font-size: 11px;
}

.overview-host-header p {
  margin-top: 2px;
}

.overview-host-summary {
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 12px;
}

.overview-host-identity {
  display: grid;
  justify-items: end;
  text-align: right;
}

.overview-host-identity strong {
  color: var(--app-ink);
  font-family: var(--app-font-display);
  font-size: 13px;
}

.overview-host-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--app-border);
}

.host-reading {
  min-width: 0;
  padding: 18px;
  background: var(--app-surface);
}

.host-reading + .host-reading {
  border-left: 1px solid var(--app-border);
}

.host-reading-title {
  min-width: 0;
  gap: 9px;
}

.host-reading-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  color: var(--app-success);
  background: var(--app-success-soft);
  border-radius: 6px;
  font-size: 17px;
}

.host-reading.is-warning .host-reading-icon {
  color: var(--app-warning);
  background: var(--app-warning-soft);
}

.host-reading.is-danger .host-reading-icon {
  color: var(--app-danger);
  background: var(--app-danger-soft);
}

.host-reading-head strong {
  color: var(--app-ink);
  font-family: var(--app-font-data);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.host-meter {
  height: 7px;
  margin: 16px 0 10px;
  overflow: hidden;
  background: var(--app-surface-muted);
  border-radius: 3px;
}

.host-meter span {
  display: block;
  height: 100%;
  background: var(--app-success);
  border-radius: inherit;
}

.host-reading.is-warning .host-meter span {
  background: var(--app-warning);
}

.host-reading.is-danger .host-meter span {
  background: var(--app-danger);
}

.host-reading small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.host-reading-meta {
  justify-content: space-between;
  gap: 10px;
}

.host-reading-meta small:last-child {
  text-align: right;
}

.overview-host-alert {
  margin: 0 18px 18px;
}

.overview-detail-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 0;
  margin-top: 16px;
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.overview-panel {
  min-width: 0;
  min-height: 245px;
  padding: 18px;
  background: transparent;
}

.overview-panel + .overview-panel {
  border-left: 1px solid var(--app-border);
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
  font-family: var(--app-font-data);
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
  font-family: var(--app-font-data);
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

@media (min-width: 1600px) and (min-height: 900px) {
  .overview-page {
    width: min(1680px, 100%);
    padding: 32px 36px 38px;
  }

  .overview-header {
    margin-bottom: 22px;
  }

  .overview-header h2 {
    font-size: 22px;
  }

  .overview-pulse {
    grid-template-columns: minmax(320px, 0.9fr) minmax(0, 2.4fr);
  }

  .overview-pulse-identity {
    padding: 28px;
  }

  .overview-pulse-identity > strong {
    margin-top: 26px;
    font-size: 23px;
  }

  .overview-pulse-meta {
    margin-top: 30px;
  }

  .overview-reading {
    padding: 30px 26px;
  }

  .overview-reading-head strong {
    font-size: 28px;
  }

  .overview-meter {
    margin-top: 32px;
  }

  .overview-detail-grid {
    gap: 0;
    margin-top: 20px;
  }

  .overview-host {
    margin-top: 20px;
  }

  .overview-host-header,
  .host-reading {
    padding: 21px 22px;
  }

  .overview-host-mark {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
    font-size: 22px;
  }

  .host-reading-icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
    font-size: 19px;
  }

  .host-reading-head strong {
    font-size: 22px;
  }

  .overview-panel {
    min-height: 280px;
    padding: 22px;
  }

  .overview-panel-header {
    margin-bottom: 16px;
    padding-bottom: 15px;
  }

  .overview-panel-header h3 {
    font-size: 15px;
  }

  .overview-definition-list > div,
  .overview-player-list li {
    min-height: 52px;
  }
}

@media (min-width: 2400px) and (min-height: 1100px) {
  .overview-page {
    width: min(2100px, 100%);
    padding: 40px 48px 48px;
  }

  .overview-pulse {
    grid-template-columns: minmax(380px, 0.85fr) minmax(0, 2.6fr);
  }

  .overview-pulse-identity,
  .overview-reading {
    padding: 34px 30px;
  }

  .overview-detail-grid {
    gap: 0;
    margin-top: 24px;
  }

  .overview-panel {
    min-height: 320px;
    padding: 26px;
  }
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

  .overview-host-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .host-reading:nth-child(3) {
    border-left: 0;
  }

  .host-reading:nth-child(n + 3) {
    border-top: 1px solid var(--app-border);
  }

  .overview-panel--players {
    grid-column: 1 / -1;
  }

  .overview-panel--automation {
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }

  .overview-panel--backup {
    border-top: 1px solid var(--app-border);
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

  .overview-host-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .overview-host-summary {
    width: 100%;
    justify-content: space-between;
  }

  .overview-host-identity {
    text-align: left;
    justify-items: start;
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

  .overview-panel + .overview-panel {
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }

  .host-reading {
    padding: 15px;
  }
}

@media (max-width: 480px) {
  .overview-host-grid {
    grid-template-columns: 1fr;
  }

  .host-reading + .host-reading,
  .host-reading:nth-child(3) {
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }
}
</style>
