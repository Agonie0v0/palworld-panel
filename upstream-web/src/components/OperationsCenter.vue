<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import {
  AlertTriangle,
  Clock,
  FileText,
  PlayerPlay,
  Plus,
  Refresh,
  Trash,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";

const props = defineProps({
  show: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
});
const emit = defineEmits(["update:show"]);
const api = new ApiService();
const message = useMessage();
const dialog = useDialog();
const { locale } = useI18n();

const activeTab = ref("monitor");
const loading = ref(false);
const logs = ref({ logs: "", source: "none", available: false });
const history = ref([]);
const jobs = ref([]);
const alerts = ref([]);
const audit = ref([]);
const schedules = ref([]);
const showSchedule = ref(false);
const scheduleForm = ref({
  id: "",
  name: "",
  type: "backup",
  mode: "interval",
  intervalMinutes: 60,
  time: "04:00",
  command: "",
  enabled: true,
});
let refreshTimer;

const copy = computed(() =>
  locale.value === "zh"
    ? {
        title: "运维中心",
        subtitle:
          "集中查看实时日志、历史负载、后台任务、告警、计划任务和操作审计。",
        monitor: "历史监控",
        logs: "服务器日志",
        jobs: "任务队列",
        alerts: "失败告警",
        schedules: "计划任务",
        audit: "操作审计",
        refresh: "刷新",
        noData: "暂无数据",
        cpu: "CPU",
        memory: "内存",
        disk: "磁盘",
        process: "游戏进程内存",
        source: "日志来源",
        addSchedule: "新建计划",
        name: "名称",
        type: "任务类型",
        mode: "执行方式",
        interval: "间隔分钟",
        daily: "每天时间",
        command: "RCON 命令",
        enabled: "启用",
        save: "保存",
        cancel: "取消",
        run: "立即运行",
        remove: "删除",
        acknowledge: "确认告警",
        queued: "任务已提交。",
        saved: "计划任务已保存。",
      }
    : {
        title: "Operations center",
        subtitle:
          "Review live logs, historical load, background jobs, alerts, schedules, and audit events.",
        monitor: "History",
        logs: "Server logs",
        jobs: "Job queue",
        alerts: "Alerts",
        schedules: "Schedules",
        audit: "Audit log",
        refresh: "Refresh",
        noData: "No data",
        cpu: "CPU",
        memory: "Memory",
        disk: "Disk",
        process: "Game process memory",
        source: "Log source",
        addSchedule: "New schedule",
        name: "Name",
        type: "Task type",
        mode: "Run mode",
        interval: "Interval minutes",
        daily: "Daily time",
        command: "RCON command",
        enabled: "Enabled",
        save: "Save",
        cancel: "Cancel",
        run: "Run now",
        remove: "Delete",
        acknowledge: "Acknowledge",
        queued: "Job queued.",
        saved: "Schedule saved.",
      },
);

const unwrap = (response) => response?.data?.value || {};
const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString(locale.value === "zh" ? "zh-CN" : "en-US")
    : "—";

const loadAll = async () => {
  loading.value = true;
  try {
    const [
      logResponse,
      historyResponse,
      jobResponse,
      alertResponse,
      auditResponse,
      scheduleResponse,
    ] = await Promise.all([
      api.getServerLogs(500),
      api.getMonitorHistory(360),
      api.getAdvancedJobs(),
      api.getAdvancedAlerts(),
      api.getAuditLog(300),
      api.getSchedules(),
    ]);
    logs.value = unwrap(logResponse).logs || logs.value;
    history.value = unwrap(historyResponse).history || [];
    jobs.value = unwrap(jobResponse).jobs || [];
    alerts.value = unwrap(alertResponse).alerts || [];
    audit.value = unwrap(auditResponse).audit || [];
    schedules.value = unwrap(scheduleResponse).schedules || [];
  } finally {
    loading.value = false;
  }
};

const chartPoints = (key) => {
  const rows = history.value.slice(-120);
  if (rows.length < 2) return "";
  return rows
    .map((row, index) => {
      const x = (index / (rows.length - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(100, Number(row[key] || 0)));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
};

const latest = computed(() => history.value[history.value.length - 1] || {});

const openSchedule = (schedule = null) => {
  scheduleForm.value = schedule
    ? { ...schedule }
    : {
        id: "",
        name: "",
        type: "backup",
        mode: "interval",
        intervalMinutes: 60,
        time: "04:00",
        command: "",
        enabled: true,
      };
  showSchedule.value = true;
};

const saveSchedule = async () => {
  const response = await api.saveSchedule(scheduleForm.value);
  schedules.value = unwrap(response).schedules || schedules.value;
  showSchedule.value = false;
  message.success(copy.value.saved);
};

const runSchedule = async (id) => {
  await api.runSchedule(id);
  message.success(copy.value.queued);
  await loadAll();
};

const removeSchedule = (id) => {
  dialog.warning({
    title: copy.value.remove,
    content: copy.value.remove,
    positiveText: copy.value.remove,
    negativeText: copy.value.cancel,
    onPositiveClick: async () => {
      const response = await api.deleteSchedule(id);
      schedules.value = unwrap(response).schedules || [];
    },
  });
};

const acknowledge = async (id) => {
  await api.acknowledgeAlert(id);
  await loadAll();
};

onMounted(() => {
  if (props.show) loadAll();
  refreshTimer = setInterval(() => {
    if (props.show) loadAll().catch(() => {});
  }, 15000);
});
watch(
  () => props.show,
  (show) => show && loadAll(),
);
onBeforeUnmount(() => clearInterval(refreshTimer));
</script>

<template>
  <tool-surface
    :show="show"
    class="advanced-modal"
    :title="copy.title"
    width="min(94vw, 1180px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <template #header-extra>
      <n-button quaternary :loading="loading" @click="loadAll">
        <template #icon
          ><n-icon><Refresh /></n-icon
        ></template>
        {{ copy.refresh }}
      </n-button>
    </template>

    <p class="advanced-intro">{{ copy.subtitle }}</p>
    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="monitor" :tab="copy.monitor">
        <div class="history-metric-grid">
          <article
            v-for="metric in [
              { key: 'cpu', label: copy.cpu },
              { key: 'memory', label: copy.memory },
              { key: 'disk', label: copy.disk },
              { key: 'processMemory', label: copy.process },
            ]"
            :key="metric.key"
            class="history-metric"
          >
            <div>
              <span>{{ metric.label }}</span
              ><strong
                >{{ Number(latest[metric.key] || 0).toFixed(1) }}%</strong
              >
            </div>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                :points="chartPoints(metric.key)"
                fill="none"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="logs" :tab="copy.logs">
        <div class="log-toolbar">
          <n-icon><FileText /></n-icon
          ><span>{{ copy.source }}: {{ logs.source }}</span>
        </div>
        <pre class="server-log-view">{{ logs.logs || copy.noData }}</pre>
      </n-tab-pane>

      <n-tab-pane name="jobs" :tab="copy.jobs">
        <n-data-table
          :columns="[
            { title: copy.name, key: 'title' },
            { title: 'Status', key: 'status' },
            {
              title: 'Progress',
              key: 'progress',
              render: (row) => `${row.progress || 0}%`,
            },
            { title: 'Message', key: 'message' },
            {
              title: 'Time',
              key: 'updatedAt',
              render: (row) => formatTime(row.updatedAt),
            },
          ]"
          :data="jobs"
          :bordered="false"
          :single-line="false"
        />
      </n-tab-pane>

      <n-tab-pane name="alerts" :tab="copy.alerts">
        <n-empty v-if="alerts.length === 0" :description="copy.noData" />
        <div v-else class="advanced-list">
          <article
            v-for="alert in alerts"
            :key="alert.id"
            class="advanced-list-row"
          >
            <n-icon class="alert-icon"><AlertTriangle /></n-icon>
            <div>
              <strong>{{ alert.title }}</strong>
              <p>{{ alert.message }}</p>
              <small>{{ formatTime(alert.createdAt) }}</small>
            </div>
            <n-button
              v-if="alert.status === 'open'"
              size="small"
              @click="acknowledge(alert.id)"
              >{{ copy.acknowledge }}</n-button
            >
            <n-tag v-else size="small">{{ alert.status }}</n-tag>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="schedules" :tab="copy.schedules">
        <div class="advanced-tab-toolbar">
          <n-button type="primary" @click="openSchedule()"
            ><template #icon
              ><n-icon><Plus /></n-icon></template
            >{{ copy.addSchedule }}</n-button
          >
        </div>
        <n-empty v-if="schedules.length === 0" :description="copy.noData" />
        <div v-else class="advanced-list">
          <article
            v-for="schedule in schedules"
            :key="schedule.id"
            class="advanced-list-row is-clickable"
            @click="openSchedule(schedule)"
          >
            <n-icon><Clock /></n-icon>
            <div>
              <strong>{{ schedule.name }}</strong>
              <p>
                {{ schedule.type }} ·
                {{
                  schedule.mode === "daily"
                    ? schedule.time
                    : `${schedule.intervalMinutes} min`
                }}
              </p>
              <small>{{ formatTime(schedule.nextRun) }}</small>
            </div>
            <n-switch :value="schedule.enabled" disabled />
            <n-button
              quaternary
              circle
              :title="copy.run"
              @click.stop="runSchedule(schedule.id)"
              ><template #icon
                ><n-icon><PlayerPlay /></n-icon></template
            ></n-button>
            <n-button
              quaternary
              circle
              type="error"
              :title="copy.remove"
              @click.stop="removeSchedule(schedule.id)"
              ><template #icon
                ><n-icon><Trash /></n-icon></template
            ></n-button>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="audit" :tab="copy.audit">
        <n-data-table
          :columns="[
            {
              title: 'Time',
              key: 'createdAt',
              render: (row) => formatTime(row.createdAt),
            },
            { title: 'Actor', key: 'actor' },
            { title: 'Action', key: 'action' },
            { title: 'Target', key: 'target' },
            { title: 'Status', key: 'status' },
            { title: 'IP', key: 'ip' },
          ]"
          :data="audit"
          :bordered="false"
          :single-line="false"
        />
      </n-tab-pane>
    </n-tabs>
  </tool-surface>

  <n-modal
    v-model:show="showSchedule"
    preset="card"
    :mask-closable="false"
    class="schedule-modal"
    :title="copy.addSchedule"
    :bordered="false"
  >
    <n-form label-placement="top" :model="scheduleForm">
      <n-form-item :label="copy.name"
        ><n-input v-model:value="scheduleForm.name"
      /></n-form-item>
      <n-grid :cols="2" :x-gap="12">
        <n-form-item-gi :label="copy.type"
          ><n-select
            v-model:value="scheduleForm.type"
            :options="[
              { label: 'Backup', value: 'backup' },
              { label: 'Safe restart', value: 'safe-restart' },
              { label: 'Update', value: 'update' },
              { label: 'Save world', value: 'save-world' },
              { label: 'RCON', value: 'rcon' },
            ]"
        /></n-form-item-gi>
        <n-form-item-gi :label="copy.mode"
          ><n-select
            v-model:value="scheduleForm.mode"
            :options="[
              { label: 'Interval', value: 'interval' },
              { label: 'Daily', value: 'daily' },
            ]"
        /></n-form-item-gi>
      </n-grid>
      <n-form-item
        v-if="scheduleForm.mode === 'interval'"
        :label="copy.interval"
        ><n-input-number
          v-model:value="scheduleForm.intervalMinutes"
          :min="1"
          class="w-full"
      /></n-form-item>
      <n-form-item v-else :label="copy.daily"
        ><n-input v-model:value="scheduleForm.time" type="time"
      /></n-form-item>
      <n-form-item v-if="scheduleForm.type === 'rcon'" :label="copy.command"
        ><n-input v-model:value="scheduleForm.command"
      /></n-form-item>
      <n-form-item :label="copy.enabled"
        ><n-switch v-model:value="scheduleForm.enabled"
      /></n-form-item>
    </n-form>
    <template #footer
      ><div class="modal-actions">
        <n-button @click="showSchedule = false">{{ copy.cancel }}</n-button
        ><n-button type="primary" @click="saveSchedule">{{
          copy.save
        }}</n-button>
      </div></template
    >
  </n-modal>
</template>

<style scoped>
:global(.advanced-modal) {
  width: min(1180px, 94vw);
}
:global(.schedule-modal) {
  width: min(560px, 92vw);
}
.advanced-intro {
  max-width: 72ch;
  margin: 0 0 18px;
  color: var(--app-ink-muted);
  font-size: 14px;
  line-height: 1.65;
}
.history-metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.history-metric {
  min-height: 190px;
  padding: 16px;
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}
.history-metric > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.history-metric span {
  color: var(--app-ink-muted);
  font-size: 12px;
}
.history-metric strong {
  color: var(--app-ink);
  font-family: var(--app-font-data);
  font-size: 22px;
}
.history-metric svg {
  width: 100%;
  height: 115px;
  margin-top: 18px;
  overflow: visible;
}
.history-metric polyline {
  stroke: var(--app-accent);
  stroke-width: 2;
}
.log-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--app-ink-muted);
  font-size: 12px;
}
.server-log-view {
  min-height: 480px;
  max-height: 62vh;
  padding: 16px;
  overflow: auto;
  color: var(--app-ink);
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 7px;
  font-family: var(--app-font-data);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
}
.advanced-tab-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.advanced-list {
  display: grid;
  gap: 14px;
  border: 0;
  border-radius: 0;
}
.advanced-list-row {
  display: grid;
  min-height: 82px;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 0;
}
.advanced-list-row:last-child {
  border-bottom: 0;
}
.advanced-list-row.is-clickable {
  cursor: pointer;
}
.advanced-list-row strong {
  color: var(--app-ink);
  font-size: 13px;
}
.advanced-list-row p,
.advanced-list-row small {
  color: var(--app-ink-muted);
  font-size: 11px;
}
.alert-icon {
  color: var(--app-warning);
  font-size: 20px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
@media (max-width: 640px) {
  :global(.advanced-modal) {
    width: 100vw;
    max-width: 100vw;
  }
  .history-metric-grid {
    grid-template-columns: 1fr;
  }
  .history-metric {
    min-height: 150px;
  }
  .history-metric svg {
    height: 80px;
  }
  .advanced-list-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .advanced-list-row > :nth-child(n + 4) {
    grid-column: auto;
  }
}
</style>
