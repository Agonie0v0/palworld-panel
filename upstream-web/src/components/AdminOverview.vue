<script setup>
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";
import { ArchiveOutlined } from "@vicons/material";
import { Settings, Terminal } from "@vicons/ionicons5";
import { BroadcastTower } from "@vicons/fa";
import { Refresh } from "@vicons/tabler";
import ApiService from "@/service/api";

const props = defineProps({
  serverInfo: { type: Object, default: () => ({}) },
  serverMetrics: { type: Object, default: () => ({}) },
  players: { type: Array, default: () => [] },
});
const emit = defineEmits([
  "open-rcon",
  "open-backup",
  "open-broadcast",
  "open-config",
]);
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
const uptime = computed(() => {
  const seconds = Number(props.serverMetrics?.uptime || 0);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0
    ? t("overview.uptimeDays", { days, hours })
    : t("overview.uptimeHours", { hours });
});
const healthType = computed(() => {
  if (!props.serverInfo?.name) return "warning";
  const fps = Number(props.serverMetrics?.server_fps || 0);
  return fps > 0 && fps < 30 ? "warning" : "success";
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
        <h2>{{ $t("overview.title") }}</h2>
        <n-button secondary :loading="loading" @click="loadOverview">
          <template #icon
            ><n-icon><Refresh /></n-icon
          ></template>
          {{ $t("overview.refresh") }}
        </n-button>
      </header>

      <section class="overview-metrics" :aria-label="$t('overview.title')">
        <div class="overview-metric overview-metric--status">
          <span class="overview-metric-label">{{
            $t("overview.serverStatus")
          }}</span>
          <div class="overview-status-value">
            <n-badge dot :type="healthType" />
            <strong>{{
              serverInfo?.name || $t("status.serverUnavailable")
            }}</strong>
          </div>
          <span class="overview-metric-note">{{
            serverInfo?.version || "Unknown"
          }}</span>
        </div>
        <div class="overview-metric">
          <span class="overview-metric-label">{{
            $t("overview.onlinePlayers")
          }}</span>
          <strong class="overview-metric-value">
            {{ serverMetrics?.current_player_num ?? onlinePlayers.length }}
            <small>/ {{ serverMetrics?.max_player_num ?? "—" }}</small>
          </strong>
          <span class="overview-metric-note">{{
            $t("overview.totalPlayers", { count: players.length })
          }}</span>
        </div>
        <div class="overview-metric">
          <span class="overview-metric-label">{{ $t("item.serverFps") }}</span>
          <strong class="overview-metric-value">{{
            serverMetrics?.server_fps ?? "—"
          }}</strong>
          <span class="overview-metric-note">
            {{ $t("item.serverFrameTime") }}:
            {{ serverMetrics?.server_frame_time ?? "—" }} ms
          </span>
        </div>
        <div class="overview-metric">
          <span class="overview-metric-label">{{
            $t("item.serverUptime")
          }}</span>
          <strong class="overview-metric-value overview-metric-value--text">{{
            uptime
          }}</strong>
          <span class="overview-metric-note">
            {{ $t("item.serverDays") }}: {{ serverMetrics?.days ?? "—" }}
          </span>
        </div>
      </section>

      <section class="overview-action-band">
        <h3>{{ $t("overview.operations") }}</h3>
        <div class="overview-actions">
          <n-button type="primary" @click="emit('open-rcon')">
            <template #icon
              ><n-icon><Terminal /></n-icon
            ></template>
            {{ $t("button.rcon") }}
          </n-button>
          <n-button secondary @click="emit('open-backup')">
            <template #icon
              ><n-icon><ArchiveOutlined /></n-icon
            ></template>
            {{ $t("button.backup") }}
          </n-button>
          <n-button secondary @click="emit('open-broadcast')">
            <template #icon
              ><n-icon><BroadcastTower /></n-icon
            ></template>
            {{ $t("button.broadcast") }}
          </n-button>
          <n-button secondary @click="emit('open-config')">
            <template #icon
              ><n-icon><Settings /></n-icon
            ></template>
            {{ $t("configuration.title") }}
          </n-button>
        </div>
      </section>

      <div class="overview-detail-grid">
        <section class="overview-panel overview-panel--automation">
          <header class="overview-panel-header">
            <h3>{{ $t("overview.automation") }}</h3>
            <span>{{ activeTasks.length }}</span>
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

        <section class="overview-panel overview-panel--players">
          <header class="overview-panel-header">
            <h3>{{ $t("overview.onlineNow") }}</h3>
            <span>{{ onlinePlayers.length }}</span>
          </header>
          <n-empty
            v-if="onlinePlayers.length === 0"
            size="small"
            :description="$t('overview.noOnlinePlayers')"
          />
          <ul v-else class="overview-player-list">
            <li
              v-for="player in onlinePlayers.slice(0, 6)"
              :key="player.player_uid"
            >
              <span>{{ player.nickname }}</span>
              <n-tag size="small" type="success">Lv.{{ player.level }}</n-tag>
            </li>
          </ul>
        </section>

        <section class="overview-panel overview-panel--backup">
          <header class="overview-panel-header">
            <h3>{{ $t("overview.backupStatus") }}</h3>
            <span>{{ backups.length }}</span>
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
.overview-panel-header,
.overview-status-value,
.overview-actions {
  display: flex;
  align-items: center;
}

.overview-header {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.overview-header h2,
.overview-action-band h3,
.overview-panel-header h3 {
  color: var(--app-ink);
  letter-spacing: 0;
}

.overview-header h2 {
  font-size: 20px;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.overview-metric {
  min-width: 0;
  min-height: 132px;
  padding: 20px;
}

.overview-metric + .overview-metric {
  border-left: 1px solid var(--app-border);
}

.overview-metric-label,
.overview-metric-note {
  display: block;
  color: var(--app-ink-muted);
}

.overview-metric-label {
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 600;
}

.overview-metric-value {
  display: block;
  overflow: hidden;
  color: var(--app-ink);
  font-size: 30px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-metric-value small {
  color: var(--app-ink-muted);
  font-size: 15px;
  font-weight: 500;
}

.overview-metric-value--text {
  font-size: 22px;
}

.overview-metric-note {
  margin-top: 9px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-status-value {
  min-width: 0;
  gap: 9px;
}

.overview-status-value strong {
  overflow: hidden;
  color: var(--app-ink);
  font-size: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-action-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 18px;
  padding: 15px 18px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.overview-action-band h3,
.overview-panel-header h3 {
  font-size: 14px;
}

.overview-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.overview-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.overview-panel {
  min-width: 0;
  min-height: 230px;
  padding: 18px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.overview-panel-header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--app-border);
}

.overview-panel-header > span {
  color: var(--app-accent);
  font-size: 13px;
  font-weight: 700;
}

.overview-definition-list {
  display: grid;
}

.overview-definition-list > div,
.overview-player-list li {
  display: flex;
  min-height: 45px;
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
  .overview-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-metric:nth-child(3) {
    border-left: 0;
  }

  .overview-metric:nth-child(n + 3) {
    border-top: 1px solid var(--app-border);
  }

  .overview-detail-grid {
    grid-template-columns: 1fr 1fr;
  }

  .overview-panel--automation {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .overview-page {
    padding: 16px 14px 22px;
  }

  .overview-header {
    margin-bottom: 14px;
  }

  .overview-metrics,
  .overview-detail-grid {
    grid-template-columns: 1fr;
  }

  .overview-metric {
    min-height: 116px;
    padding: 16px;
    border-left: 0 !important;
    border-top: 1px solid var(--app-border);
  }

  .overview-metric:first-child {
    border-top: 0;
  }

  .overview-action-band {
    align-items: stretch;
    flex-direction: column;
  }

  .overview-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .overview-detail-grid {
    gap: 12px;
  }

  .overview-panel,
  .overview-panel--automation {
    min-height: 0;
    grid-column: auto;
  }
}
</style>
