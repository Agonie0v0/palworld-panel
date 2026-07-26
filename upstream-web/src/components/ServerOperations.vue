<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDialog, useMessage } from "naive-ui";
import {
  CloudDownloadOutlined,
  DeleteForeverOutlined,
  PlayArrowRound,
  RefreshOutlined,
  RestartAltRound,
  SaveOutlined,
  StopRound,
  SystemUpdateAltRound,
} from "@vicons/material";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";

const props = defineProps({ show: Boolean, embedded: { type: Boolean, default: false } });
const emit = defineEmits(["update:show", "server-changed"]);
const { t } = useI18n();
const message = useMessage();
const dialog = useDialog();
const api = new ApiService();

const loading = ref(false);
const busy = ref("");
const status = ref({});
const plan = ref({});
const agent = ref({ enabled: false, mode: "local", endpoint: "", token: "" });
const hostMetrics = ref({});
const watchdogState = ref({});
const deploymentModal = ref(false);
const deploymentJob = ref(null);
let deploymentPollTimer;
const watchdog = ref({
  watchdogEnabled: false,
  watchdogCheckIntervalSeconds: 30,
  watchdogAutoRestart: false,
  watchdogFailureThreshold: 3,
  watchdogMemoryThresholdPercent: 0,
  watchdogMemoryBreachChecks: 2,
  watchdogRestartCooldownMinutes: 15,
  scheduledRestartIntervalHours: 0,
  maintenanceWarningSeconds: 60,
  maintenanceWarningMessage: "Server maintenance restart in {seconds} seconds.",
  backupBeforeManagedRestart: true,
});
const deploy = ref({
  installDir: "/opt/palworld/server",
  serviceName: "palworld",
  publicPort: 8211,
  rconPort: 25575,
  restPort: 8212,
  serverName: "Palworld Server",
  serverDescription: "Managed by palworld-panel",
  adminPassword: "",
  serverPassword: "",
  autoStart: true,
});

const running = computed(() => Boolean(status.value?.status?.running));
const host = computed(() => status.value?.host || {});
const manager = computed(() => status.value?.status?.manager || "-");
const memoryPercent = computed(() => Number(hostMetrics.value?.memory?.usedPercent || 0));
const diskPercent = computed(() => Number(hostMetrics.value?.disk?.usedPercent || 0));
const cpuPercent = computed(() => Number(hostMetrics.value?.cpu?.usedPercent || 0));
const processMemoryPercent = computed(() => Number(hostMetrics.value?.process?.memoryPercent || 0));
const deploymentActive = computed(() => ["queued", "running"].includes(deploymentJob.value?.status));
const deploymentLogs = computed(() => {
  if (Array.isArray(deploymentJob.value?.logs)) return deploymentJob.value.logs;
  if (Array.isArray(deploymentJob.value?.result?.logs)) return deploymentJob.value.result.logs;
  return [];
});
const deploymentStatusType = computed(() => {
  if (deploymentJob.value?.status === "completed") return "success";
  if (deploymentJob.value?.status === "failed") return "error";
  if (deploymentJob.value?.status === "queued") return "warning";
  return "info";
});
const deploymentStatusText = computed(() => {
  const status = deploymentJob.value?.status || "queued";
  const deployJob = deploymentJob.value?.type === "server-deploy";
  const key = {
    queued: deployJob ? "operations.deployQueued" : "operations.operationQueued",
    running: deployJob ? "operations.deployRunning" : "operations.operationRunning",
    completed: deployJob ? "operations.deployCompleted" : "operations.operationCompleted",
    failed: deployJob ? "operations.deployFailed" : "operations.operationFailed",
  }[status];
  return key ? t(key) : status;
});
const operationModalTitle = computed(() =>
  deploymentJob.value?.type === "server-deploy"
    ? t("operations.deployProgressTitle")
    : t("operations.operationProgressTitle"),
);

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
};

const formatUptime = (seconds) => {
  const total = Math.max(0, Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
};

const metricTone = (value) => {
  if (value >= 90) return "error";
  if (value >= 75) return "warning";
  return "success";
};

const refresh = async () => {
  loading.value = true;
  const [statusResponse, planResponse, agentResponse, metricsResponse, watchdogResponse] = await Promise.all([
    api.getPanelStatus(),
    api.getDeployPlan(),
    api.getAgentConfig(),
    api.getHostMetrics(),
    api.getWatchdog(),
  ]);
  status.value = statusResponse.data.value || {};
  plan.value = planResponse.data.value || {};
  agent.value = agentResponse.data.value?.agent || agent.value;
  hostMetrics.value = metricsResponse.data.value?.metrics || {};
  watchdog.value = { ...watchdog.value, ...(watchdogResponse.data.value?.settings || {}) };
  watchdogState.value = watchdogResponse.data.value?.state || {};
  const defaults = plan.value?.defaults || {};
  deploy.value = {
    ...deploy.value,
    installDir: defaults.installDir || deploy.value.installDir,
    serviceName: defaults.serviceName || deploy.value.serviceName,
    publicPort: defaults.publicPort || deploy.value.publicPort,
    rconPort: defaults.rconPort || deploy.value.rconPort,
    restPort: defaults.restPort || deploy.value.restPort,
    serverName: defaults.serverName || deploy.value.serverName,
    adminPassword: defaults.adminPassword || deploy.value.adminPassword,
  };
  loading.value = false;
};

watch(
  () => props.show,
  (show) => {
    if (show) refresh();
  },
  { immediate: true },
);

const stopDeploymentPolling = () => {
  if (deploymentPollTimer) clearInterval(deploymentPollTimer);
  deploymentPollTimer = undefined;
};

const pollDeploymentJob = async (jobId) => {
  const { data } = await api.getAdvancedJobs();
  const jobs = Array.isArray(data.value?.jobs) ? data.value.jobs : [];
  const job = jobs.find((row) => row.id === jobId);
  if (!job) return;
  const previousStatus = deploymentJob.value?.status;
  deploymentJob.value = job;
  if (!["completed", "failed"].includes(job.status)) return;
  stopDeploymentPolling();
  busy.value = "";
  if (previousStatus === job.status) return;
  if (job.status === "completed") {
    message.success(t(job.type === "server-deploy" ? "operations.deploySuccess" : "operations.actionSuccess"));
    await refresh();
    emit("server-changed");
  } else {
    message.error(job.error || t(job.type === "server-deploy" ? "operations.deployFailed" : "operations.actionFailed"));
  }
};

const startDeploymentPolling = (jobId) => {
  stopDeploymentPolling();
  pollDeploymentJob(jobId).catch(() => {});
  deploymentPollTimer = setInterval(() => pollDeploymentJob(jobId).catch(() => {}), 1000);
};

onBeforeUnmount(stopDeploymentPolling);

const runAction = async (action) => {
  busy.value = action;
  deploymentModal.value = true;
  deploymentJob.value = { type: `server-${action}`, status: "queued", progress: 0, message: t("operations.operationWaiting"), logs: [], metadata: { action } };
  const { data, statusCode } = await api.runServerAction(action, true);
  if ([200, 202].includes(statusCode.value) && data.value?.ok !== false) {
    if (data.value?.job?.id) {
      deploymentJob.value = data.value.job;
      startDeploymentPolling(data.value.job.id);
    } else {
      busy.value = "";
      deploymentJob.value = { type: `server-${action}`, status: "completed", progress: 100, message: t("operations.operationCompleted"), result: data.value?.result || {} };
      message.success(t("operations.actionSuccess"));
      await refresh();
      emit("server-changed");
    }
  } else {
    busy.value = "";
    const error = data.value?.error || data.value?.result?.stderr || t("operations.actionFailed");
    deploymentJob.value = { type: `server-${action}`, status: "failed", progress: 100, message: t("operations.operationFailed"), error, result: data.value?.result || {} };
    message.error(error);
  }
};

const submitDeploy = () => {
  dialog.warning({
    title: t("operations.deployTitle"),
    content: t("operations.deployConfirm"),
    positiveText: t("operations.deploy"),
    negativeText: t("button.cancel"),
    onPositiveClick: async () => {
      busy.value = "deploy";
      deploymentModal.value = true;
      deploymentJob.value = {
        type: "server-deploy",
        status: "queued",
        progress: 0,
        message: t("operations.deployWaiting"),
        logs: [],
      };
      const { data, statusCode } = await api.deployServer(deploy.value);
      if ([200, 202].includes(statusCode.value) && data.value?.ok) {
        if (data.value.job?.id) {
          deploymentJob.value = data.value.job;
          startDeploymentPolling(data.value.job.id);
        } else {
          busy.value = "";
          deploymentJob.value = {
            type: "server-deploy",
            status: "completed",
            progress: 100,
            message: t("operations.deployCompleted"),
            result: data.value.result || {},
          };
          message.success(t("operations.deploySuccess"));
          await refresh();
          emit("server-changed");
        }
      } else {
        busy.value = "";
        const error = data.value?.result?.stderr || data.value?.error || t("operations.deployFailed");
        deploymentJob.value = {
          type: "server-deploy",
          status: "failed",
          progress: 100,
          message: t("operations.deployFailed"),
          error,
          result: data.value?.result || {},
        };
        message.error(error);
      }
    },
  });
};

const saveAgent = async () => {
  busy.value = "agent-save";
  const { data, statusCode } = await api.updateAgentConfig(agent.value);
  busy.value = "";
  if (statusCode.value === 200 && data.value?.ok) message.success(t("operations.agentSaved"));
  else message.error(data.value?.error || t("operations.actionFailed"));
};

const testAgent = async () => {
  busy.value = "agent-test";
  const { data, statusCode } = await api.testAgent();
  busy.value = "";
  if (statusCode.value === 200 && data.value?.ok) message.success(t("operations.agentConnected"));
  else message.error(data.value?.error || t("operations.agentFailed"));
};

const saveWatchdog = async () => {
  busy.value = "watchdog-save";
  const { data, statusCode } = await api.updateWatchdog(watchdog.value);
  busy.value = "";
  if (statusCode.value === 200 && data.value?.ok) {
    watchdog.value = { ...watchdog.value, ...(data.value.settings || {}) };
    watchdogState.value = data.value.state || watchdogState.value;
    message.success(t("operations.watchdogSaved"));
  } else {
    message.error(data.value?.error || t("operations.actionFailed"));
  }
};

const maintenance = (operation) => {
  const uninstall = operation === "uninstall";
  dialog.error({
    title: t(uninstall ? "operations.uninstall" : "operations.resetWorld"),
    content: t(uninstall ? "operations.uninstallConfirm" : "operations.resetConfirm"),
    positiveText: t("button.confirm"),
    negativeText: t("button.cancel"),
    onPositiveClick: async () => {
      busy.value = operation;
      const request = uninstall ? api.uninstallServer({}) : api.resetWorld({});
      const { data, statusCode } = await request;
      busy.value = "";
      if (statusCode.value === 200 && data.value?.ok) {
        message.success(t("operations.actionSuccess"));
        await refresh();
        emit("server-changed");
      } else {
        message.error(data.value?.result?.stderr || data.value?.error || t("operations.actionFailed"));
      }
    },
  });
};
</script>

<template>
  <tool-surface
    :show="show"
    class="server-operations-modal"
    :title="$t('operations.title')"
    width="min(94vw, 980px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <template #header-extra>
      <n-button quaternary circle :loading="loading" :aria-label="$t('operations.refresh')" @click="refresh">
        <template #icon><n-icon><RefreshOutlined /></n-icon></template>
      </n-button>
    </template>

    <n-scrollbar :style="embedded ? undefined : 'max-height: min(74vh, 760px)'" trigger="none">
      <div class="operations-modal-body">
      <n-tabs type="line" animated>
        <n-tab-pane name="service" :tab="$t('operations.service')">
          <section class="ops-bento-section service-overview">
          <n-descriptions label-placement="top" :column="4" :bordered="false" class="service-facts">
            <n-descriptions-item :label="$t('operations.state')">
              <n-tag :type="running ? 'success' : 'warning'">{{ running ? $t('operations.running') : $t('operations.stopped') }}</n-tag>
            </n-descriptions-item>
            <n-descriptions-item :label="$t('operations.manager')">{{ manager }}</n-descriptions-item>
            <n-descriptions-item :label="$t('operations.architecture')">{{ host.arch || '-' }}</n-descriptions-item>
            <n-descriptions-item :label="$t('operations.runner')">{{ host.profile?.runner || '-' }}</n-descriptions-item>
          </n-descriptions>

          <n-flex class="service-actions" wrap>
            <n-button type="success" secondary :loading="busy === 'start'" @click="runAction('start')">
              <template #icon><n-icon><PlayArrowRound /></n-icon></template>{{ $t('operations.start') }}
            </n-button>
            <n-button type="warning" secondary :loading="busy === 'restart'" @click="runAction('restart')">
              <template #icon><n-icon><RestartAltRound /></n-icon></template>{{ $t('operations.restart') }}
            </n-button>
            <n-button type="error" secondary :loading="busy === 'stop'" @click="runAction('stop')">
              <template #icon><n-icon><StopRound /></n-icon></template>{{ $t('operations.stop') }}
            </n-button>
            <n-button secondary :loading="busy === 'update'" @click="runAction('update')">
              <template #icon><n-icon><SystemUpdateAltRound /></n-icon></template>{{ $t('operations.update') }}
            </n-button>
            <n-button secondary :loading="busy === 'backup'" @click="runAction('backup')">
              <template #icon><n-icon><SaveOutlined /></n-icon></template>{{ $t('operations.createBackup') }}
            </n-button>
          </n-flex>
          </section>

          <section class="ops-bento-section deploy-section">
          <div class="section-heading">
            <div>
              <h3>{{ $t('operations.deployTitle') }}</h3>
              <p>{{ host.arch || '-' }} · {{ host.profile?.runner || '-' }}</p>
            </div>
            <n-tag :bordered="false" :type="plan.profile && !plan.profile.supported ? 'warning' : 'success'">
              {{ plan.profile && !plan.profile.supported ? $t('operations.hostDeployUnavailable') : $t('operations.architecture') }}
            </n-tag>
          </div>
          <n-alert v-if="plan.profile && !plan.profile.supported" type="warning" :bordered="false" class="mb-4">
            {{ $t('operations.hostDeployUnavailable') }}
          </n-alert>
          <n-form label-placement="top" :model="deploy">
            <n-grid cols="1 700:2" :x-gap="16">
              <n-form-item-gi :label="$t('operations.installDir')"><n-input v-model:value="deploy.installDir" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.serviceName')"><n-input v-model:value="deploy.serviceName" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.serverName')"><n-input v-model:value="deploy.serverName" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.description')"><n-input v-model:value="deploy.serverDescription" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.adminPassword')"><n-input v-model:value="deploy.adminPassword" type="password" show-password-on="click" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.serverPassword')"><n-input v-model:value="deploy.serverPassword" type="password" show-password-on="click" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.publicPort')"><n-input-number v-model:value="deploy.publicPort" :min="1" :max="65535" class="w-full" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.rconPort')"><n-input-number v-model:value="deploy.rconPort" :min="1" :max="65535" class="w-full" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.restPort')"><n-input-number v-model:value="deploy.restPort" :min="1" :max="65535" class="w-full" /></n-form-item-gi>
              <n-form-item-gi :label="$t('operations.autoStart')"><n-switch v-model:value="deploy.autoStart" /></n-form-item-gi>
            </n-grid>
          </n-form>
          <n-alert type="info" :bordered="false" class="deploy-port-hint">
            {{ $t('operations.portFirewallHint') }}
          </n-alert>
          <n-flex justify="end"><n-button type="primary" :disabled="plan.profile && !plan.profile.supported" :loading="busy === 'deploy'" @click="submitDeploy"><template #icon><n-icon><CloudDownloadOutlined /></n-icon></template>{{ $t('operations.deploy') }}</n-button></n-flex>
          </section>
        </n-tab-pane>

        <n-tab-pane name="monitor" :tab="$t('operations.monitor')">
          <n-alert v-if="hostMetrics.unavailable" type="warning" :bordered="false" class="mb-4">
            {{ hostMetrics.error || $t('operations.metricsUnavailable') }}
          </n-alert>
          <div class="monitor-summary">
            <section class="monitor-reading">
              <div class="monitor-reading-head">
                <span>{{ $t('operations.cpuUsage') }}</span>
                <strong>{{ hostMetrics.unavailable ? '-' : `${cpuPercent.toFixed(1)}%` }}</strong>
              </div>
              <n-progress v-if="!hostMetrics.unavailable" type="line" :percentage="cpuPercent" :status="metricTone(cpuPercent)" :show-indicator="false" />
              <small>{{ hostMetrics.unavailable ? $t('operations.metricUnavailable') : `${hostMetrics.cpu?.cores || '-'} ${$t('operations.cpuCores')}` }}</small>
            </section>
            <section class="monitor-reading">
              <div class="monitor-reading-head">
                <span>{{ $t('operations.memoryUsage') }}</span>
                <strong>{{ hostMetrics.unavailable ? '-' : `${memoryPercent.toFixed(1)}%` }}</strong>
              </div>
              <n-progress v-if="!hostMetrics.unavailable" type="line" :percentage="memoryPercent" :status="metricTone(memoryPercent)" :show-indicator="false" />
              <small>{{ hostMetrics.unavailable ? $t('operations.metricUnavailable') : `${formatBytes(hostMetrics.memory?.used)} / ${formatBytes(hostMetrics.memory?.total)}` }}</small>
            </section>
            <section class="monitor-reading">
              <div class="monitor-reading-head">
                <span>{{ $t('operations.diskUsage') }}</span>
                <strong>{{ hostMetrics.disk ? `${diskPercent.toFixed(1)}%` : '-' }}</strong>
              </div>
              <n-progress v-if="hostMetrics.disk" type="line" :percentage="diskPercent" :status="metricTone(diskPercent)" :show-indicator="false" />
              <small>{{ hostMetrics.disk ? `${formatBytes(hostMetrics.disk.used)} / ${formatBytes(hostMetrics.disk.total)}` : $t('operations.metricUnavailable') }}</small>
            </section>
            <section class="monitor-reading">
              <div class="monitor-reading-head">
                <span>{{ $t('operations.processMemory') }}</span>
                <strong>{{ hostMetrics.process ? `${processMemoryPercent.toFixed(1)}%` : '-' }}</strong>
              </div>
              <n-progress v-if="hostMetrics.process" type="line" :percentage="processMemoryPercent" :status="metricTone(processMemoryPercent)" :show-indicator="false" />
              <small>{{ hostMetrics.process ? formatBytes(hostMetrics.process.memoryBytes) : $t('operations.processUnavailable') }}</small>
            </section>
          </div>

          <n-descriptions label-placement="top" :column="4" bordered class="mb-5 monitor-details">
            <n-descriptions-item :label="$t('operations.hostname')">{{ hostMetrics.hostname || '-' }}</n-descriptions-item>
            <n-descriptions-item :label="$t('operations.hostUptime')">{{ formatUptime(hostMetrics.uptimeSeconds) }}</n-descriptions-item>
            <n-descriptions-item :label="$t('operations.processPid')">{{ hostMetrics.process?.pid || '-' }}</n-descriptions-item>
            <n-descriptions-item :label="$t('operations.processUptime')">{{ hostMetrics.process ? formatUptime(hostMetrics.process.uptimeSeconds) : '-' }}</n-descriptions-item>
          </n-descriptions>

          <section class="ops-bento-section watchdog-section">
          <div class="watchdog-heading">
            <div>
              <h3>{{ $t('operations.watchdogTitle') }}</h3>
              <p>{{ $t('operations.watchdogHint') }}</p>
            </div>
            <n-switch v-model:value="watchdog.watchdogEnabled">
              <template #checked>{{ $t('operations.enabled') }}</template>
              <template #unchecked>{{ $t('operations.disabled') }}</template>
            </n-switch>
          </div>

          <n-alert v-if="watchdogState.lastError" type="error" :bordered="false" class="mb-4">
            {{ watchdogState.lastError }}
          </n-alert>
          <n-alert v-else-if="watchdogState.pendingRestart" type="warning" :bordered="false" class="mb-4">
            {{ $t('operations.restartPending') }}
          </n-alert>

          <n-form label-placement="top" :model="watchdog" :disabled="!watchdog.watchdogEnabled">
            <n-grid cols="1 700:2" :x-gap="16">
              <n-form-item-gi :label="$t('operations.watchdogInterval')">
                <n-input-number v-model:value="watchdog.watchdogCheckIntervalSeconds" :min="10" :max="3600" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi :label="$t('operations.failureThreshold')">
                <n-input-number v-model:value="watchdog.watchdogFailureThreshold" :min="1" :max="20" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi :label="$t('operations.autoRestartStopped')">
                <n-switch v-model:value="watchdog.watchdogAutoRestart" />
              </n-form-item-gi>
              <n-form-item-gi :label="$t('operations.memoryThreshold')">
                <n-input-number v-model:value="watchdog.watchdogMemoryThresholdPercent" :min="0" :max="100" class="w-full">
                  <template #suffix>%</template>
                </n-input-number>
              </n-form-item-gi>
              <n-form-item-gi :label="$t('operations.memoryBreachChecks')">
                <n-input-number v-model:value="watchdog.watchdogMemoryBreachChecks" :min="1" :max="20" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi :label="$t('operations.restartCooldown')">
                <n-input-number v-model:value="watchdog.watchdogRestartCooldownMinutes" :min="1" :max="1440" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi :label="$t('operations.restartIntervalHours')">
                <n-input-number v-model:value="watchdog.scheduledRestartIntervalHours" :min="0" :max="720" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi :label="$t('operations.warningSeconds')">
                <n-input-number v-model:value="watchdog.maintenanceWarningSeconds" :min="0" :max="600" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi :label="$t('operations.backupBeforeRestart')">
                <n-switch v-model:value="watchdog.backupBeforeManagedRestart" />
              </n-form-item-gi>
              <n-form-item-gi span="1 700:2" :label="$t('operations.warningMessage')">
                <n-input v-model:value="watchdog.maintenanceWarningMessage" :placeholder="$t('operations.warningMessagePlaceholder')" />
              </n-form-item-gi>
            </n-grid>
          </n-form>
          <div class="watchdog-footer">
            <span>{{ $t('operations.lastWatchdogAction') }}: {{ watchdogState.lastAction || '-' }}</span>
            <n-button type="primary" :loading="busy === 'watchdog-save'" @click="saveWatchdog">{{ $t('button.save') }}</n-button>
          </div>
          </section>
        </n-tab-pane>

        <n-tab-pane name="agent" :tab="$t('operations.agent')">
          <section class="ops-bento-section agent-section">
          <n-form label-placement="top" :model="agent">
            <n-form-item :label="$t('operations.agentEnabled')"><n-switch v-model:value="agent.enabled" /></n-form-item>
            <n-form-item :label="$t('operations.agentMode')">
              <n-radio-group v-model:value="agent.mode">
                <n-radio-button value="local">{{ $t('operations.local') }}</n-radio-button>
                <n-radio-button value="remote">{{ $t('operations.remote') }}</n-radio-button>
              </n-radio-group>
            </n-form-item>
            <n-form-item :label="$t('operations.agentEndpoint')"><n-input v-model:value="agent.endpoint" placeholder="http://server:8081" /></n-form-item>
            <n-form-item :label="$t('operations.agentToken')"><n-input v-model:value="agent.token" type="password" show-password-on="click" /></n-form-item>
          </n-form>
          <n-flex justify="end">
            <n-button :loading="busy === 'agent-test'" @click="testAgent">{{ $t('operations.test') }}</n-button>
            <n-button type="primary" :loading="busy === 'agent-save'" @click="saveAgent">{{ $t('button.save') }}</n-button>
          </n-flex>
          </section>
        </n-tab-pane>

        <n-tab-pane name="maintenance" :tab="$t('operations.maintenance')">
          <n-alert type="error" :bordered="false" class="mb-5">{{ $t('operations.dangerWarning') }}</n-alert>
          <n-list :bordered="false" class="maintenance-list">
            <n-list-item>
              <n-thing :title="$t('operations.resetWorld')" :description="$t('operations.resetDescription')" />
              <template #suffix><n-button type="warning" secondary :loading="busy === 'reset'" @click="maintenance('reset')"><template #icon><n-icon><RestartAltRound /></n-icon></template>{{ $t('operations.resetWorld') }}</n-button></template>
            </n-list-item>
            <n-list-item>
              <n-thing :title="$t('operations.uninstall')" :description="$t('operations.uninstallDescription')" />
              <template #suffix><n-button type="error" secondary :loading="busy === 'uninstall'" @click="maintenance('uninstall')"><template #icon><n-icon><DeleteForeverOutlined /></n-icon></template>{{ $t('operations.uninstall') }}</n-button></template>
            </n-list-item>
          </n-list>
        </n-tab-pane>
      </n-tabs>
      </div>
    </n-scrollbar>
  </tool-surface>

  <n-modal
    v-model:show="deploymentModal"
    :mask-closable="false"
    :close-on-esc="!deploymentActive"
  >
    <n-card
      class="deployment-progress-card"
      :title="operationModalTitle"
      :closable="!deploymentActive"
      @close="deploymentModal = false"
    >
      <div class="deployment-progress-head">
        <div>
          <n-tag :type="deploymentStatusType" :bordered="false">
            {{ deploymentStatusText }}
          </n-tag>
          <p>{{ deploymentJob?.message || $t('operations.deployWaiting') }}</p>
        </div>
        <strong>{{ Math.round(deploymentJob?.progress || 0) }}%</strong>
      </div>
      <n-progress
        type="line"
        :percentage="Math.round(deploymentJob?.progress || 0)"
        :status="deploymentJob?.status === 'failed' ? 'error' : deploymentJob?.status === 'completed' ? 'success' : 'default'"
        :show-indicator="false"
      />
      <n-alert
        v-if="deploymentJob?.error"
        type="error"
        :bordered="false"
        class="deployment-error"
      >
        {{ deploymentJob.error }}
      </n-alert>
      <div class="deployment-log-heading">
        <span>{{ deploymentJob?.type === 'server-deploy' ? $t('operations.deployLogs') : $t('operations.operationLogs') }}</span>
        <small>{{ deploymentLogs.length }}</small>
      </div>
      <n-scrollbar class="deployment-log-scroll" trigger="none">
        <pre aria-live="polite">{{ deploymentLogs.length ? deploymentLogs.join('\n') : (deploymentJob?.type === 'server-deploy' ? $t('operations.deployWaitingForLogs') : $t('operations.operationWaitingForLogs')) }}</pre>
      </n-scrollbar>
      <template #footer>
        <n-flex justify="end">
          <n-button
            :disabled="deploymentActive"
            @click="deploymentModal = false"
          >
            {{ $t('button.close') }}
          </n-button>
        </n-flex>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.w-full { width: 100%; }
.operations-modal-body { padding: 2px 8px 8px 0; }
.ops-bento-section {
  margin-bottom: 18px;
  padding: 24px;
  background: var(--app-surface);
  border-radius: var(--app-card-radius);
  box-shadow: var(--app-shadow-sm);
}
.service-overview {
  display: grid;
  gap: 20px;
}
.service-facts { box-shadow: none !important; }
.service-actions { gap: 10px; }
.deploy-port-hint { margin-bottom: 16px; }
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}
.section-heading h3 { margin: 0; color: var(--app-ink); font-size: 18px; }
.section-heading p { margin: 5px 0 0; color: var(--app-ink-muted); font-size: 12px; }
.monitor-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-bottom: 20px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-border);
}
.monitor-reading {
  min-width: 0;
  padding: 16px;
  background: var(--app-surface);
}
.monitor-reading-head,
.watchdog-heading,
.watchdog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.monitor-reading-head { margin-bottom: 10px; }
.monitor-reading-head span,
.monitor-reading small,
.watchdog-heading p,
.watchdog-footer span { color: var(--app-ink-muted); }
.monitor-reading-head strong { font-size: 18px; font-variant-numeric: tabular-nums; }
.monitor-reading small { display: block; margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.watchdog-heading { align-items: flex-start; margin: 4px 0 18px; }
.watchdog-heading h3 { margin: 0; font-size: 17px; }
.watchdog-heading p { margin: 4px 0 0; }
.watchdog-footer { margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--app-border); }
.maintenance-list { box-shadow: var(--app-shadow-sm); }
:deep(.maintenance-list .n-list-item) { min-height: 92px; padding: 20px 22px; }
.deployment-progress-card {
  width: min(92vw, 760px);
  border-radius: 14px;
}
.deployment-progress-head,
.deployment-log-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.deployment-progress-head { margin-bottom: 14px; }
.deployment-progress-head > div { min-width: 0; }
.deployment-progress-head p {
  margin: 8px 0 0;
  overflow: hidden;
  color: var(--app-ink-secondary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.deployment-progress-head strong {
  color: var(--app-ink);
  font-family: var(--app-font-data);
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}
.deployment-error { margin-top: 16px; }
.deployment-log-heading {
  margin-top: 20px;
  color: var(--app-ink-secondary);
  font-size: 13px;
  font-weight: 700;
}
.deployment-log-heading small {
  color: var(--app-ink-muted);
  font-family: var(--app-font-data);
  font-weight: 500;
}
.deployment-log-scroll {
  height: min(42vh, 360px);
  margin-top: 8px;
  background: #101817;
  border-radius: 10px;
}
.deployment-log-scroll pre {
  min-height: 100%;
  margin: 0;
  padding: 16px;
  color: #d5e8e3;
  font-family: var(--app-font-data);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
@media (max-width: 640px) {
  .operations-modal-body { padding-right: 4px; }
  :deep(.n-descriptions-table-content) { min-width: 560px; }
  :deep(.n-list-item__suffix) { margin-left: 8px; }
  .monitor-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .monitor-details { overflow-x: auto; }
  .watchdog-heading,
  .watchdog-footer { align-items: stretch; flex-direction: column; }
  .ops-bento-section { padding: 18px; }
  .section-heading { align-items: stretch; flex-direction: column; }
  .deployment-progress-card { width: calc(100vw - 24px); }
  .deployment-progress-head p { white-space: normal; }
}
</style>
