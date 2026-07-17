<script setup>
import { computed, ref, watch } from "vue";
import dayjs from "dayjs";
import { useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import {
  CloudUpload,
  Download,
  FileCheck,
  Plus,
  Refresh,
  RotateClockwise2,
  Trash,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";

const props = defineProps({
  show: Boolean,
  embedded: { type: Boolean, default: false },
});
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const message = useMessage();
const dialog = useDialog();
const api = new ApiService();

const activeTab = ref("backups");
const backups = ref([]);
const loading = ref(false);
const busyId = ref("");
const restoreTarget = ref(null);
const restoreConfirmation = ref("");
const webdav = ref({
  enabled: false,
  url: "",
  username: "",
  password: "",
  passwordSet: false,
  remotePath: "PalworldBackups",
});

const copy = computed(() =>
  locale.value === "zh"
    ? {
        title: "备份与恢复",
        backups: "备份文件",
        webdav: "WebDAV 归档",
        create: "立即备份",
        refresh: "刷新",
        download: "下载",
        verify: "校验",
        restore: "安全恢复",
        upload: "上传 WebDAV",
        remove: "删除",
        empty: "还没有备份",
        emptyHint: "点击立即备份创建第一份世界存档保护点。",
        queued: "任务已提交，可在运维中心查看进度和结果。",
        created: "备份已创建。",
        removed: "备份已删除。",
        restoreTitle: "确认恢复世界存档",
        restoreWarning:
          "服务器会先创建保护备份，然后停止服务并替换当前世界。失败时会尝试自动回滚。请输入完整备份文件名继续。",
        confirmName: "输入备份文件名",
        cancel: "取消",
        enabled: "启用 WebDAV 归档",
        url: "WebDAV 地址",
        username: "用户名",
        password: "密码",
        passwordKeep: "留空则保持现有密码",
        remotePath: "远程目录",
        save: "保存",
        test: "测试连接",
        saved: "WebDAV 设置已保存。",
        tested: "WebDAV 连接正常。",
        secureHint:
          "公网地址必须使用 HTTPS；局域网地址可以使用 HTTP。密码只保存在面板服务器。",
      }
    : {
        title: "Backups and restore",
        backups: "Backup files",
        webdav: "WebDAV archive",
        create: "Create backup",
        refresh: "Refresh",
        download: "Download",
        verify: "Verify",
        restore: "Safe restore",
        upload: "Upload to WebDAV",
        remove: "Delete",
        empty: "No backups yet",
        emptyHint:
          "Create the first world protection point with Create backup.",
        queued: "Job queued. Follow progress and results in Operations center.",
        created: "Backup created.",
        removed: "Backup deleted.",
        restoreTitle: "Confirm world restore",
        restoreWarning:
          "The panel creates a protection backup, stops the server, and replaces the current world. It attempts an automatic rollback on failure. Enter the full backup filename to continue.",
        confirmName: "Enter backup filename",
        cancel: "Cancel",
        enabled: "Enable WebDAV archiving",
        url: "WebDAV URL",
        username: "Username",
        password: "Password",
        passwordKeep: "Leave blank to keep the current password",
        remotePath: "Remote folder",
        save: "Save",
        test: "Test connection",
        saved: "WebDAV settings saved.",
        tested: "WebDAV connection succeeded.",
        secureHint:
          "Public endpoints require HTTPS; private network endpoints may use HTTP. The password is stored only on the panel server.",
      },
);

const result = (response) => response?.data?.value || {};
const fail = (response, fallback) =>
  message.error(result(response).error || fallback);
const restoreMatches = computed(
  () => restoreConfirmation.value === restoreTarget.value?.backup_id,
);

const load = async () => {
  loading.value = true;
  try {
    const [backupResponse, webdavResponse] = await Promise.all([
      api.getBackupList({}),
      api.getWebDavConfig(),
    ]);
    backups.value = Array.isArray(backupResponse.data?.value)
      ? backupResponse.data.value
      : [];
    const settings = result(webdavResponse).webdav;
    if (settings) webdav.value = { ...webdav.value, ...settings, password: "" };
  } finally {
    loading.value = false;
  }
};

const create = async () => {
  busyId.value = "create";
  try {
    const response = await api.runServerAction("backup");
    if (response.statusCode?.value >= 400)
      return fail(response, "Backup failed");
    message.success(copy.value.created);
    await load();
  } finally {
    busyId.value = "";
  }
};

const download = async (backup) => {
  busyId.value = `download:${backup.backup_id}`;
  try {
    const { data, execute } = await api.downloadBackup(backup.backup_id);
    await execute();
    const url = URL.createObjectURL(data.value);
    const link = document.createElement("a");
    link.href = url;
    link.download = backup.path;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    busyId.value = "";
  }
};

const queue = async (backup, action) => {
  busyId.value = `${action}:${backup.backup_id}`;
  try {
    const response =
      action === "verify"
        ? await api.verifyBackup(backup.backup_id)
        : await api.uploadBackupWebDav(backup.backup_id);
    if (response.statusCode?.value >= 400) return fail(response, "Job failed");
    message.success(copy.value.queued);
  } finally {
    busyId.value = "";
  }
};

const openRestore = (backup) => {
  restoreTarget.value = backup;
  restoreConfirmation.value = "";
};

const restore = async () => {
  if (!restoreMatches.value) return;
  const backup = restoreTarget.value;
  busyId.value = `restore:${backup.backup_id}`;
  try {
    const response = await api.restoreBackup(backup.backup_id);
    if (response.statusCode?.value >= 400)
      return fail(response, "Restore failed");
    restoreTarget.value = null;
    restoreConfirmation.value = "";
    message.success(copy.value.queued);
  } finally {
    busyId.value = "";
  }
};

const remove = (backup) => {
  dialog.error({
    title: copy.value.remove,
    content: backup.path,
    positiveText: copy.value.remove,
    negativeText: copy.value.cancel,
    onPositiveClick: async () => {
      busyId.value = `delete:${backup.backup_id}`;
      try {
        const response = await api.removeBackup(backup.backup_id);
        if (response.statusCode?.value >= 400)
          return fail(response, "Delete failed");
        message.success(copy.value.removed);
        await load();
      } finally {
        busyId.value = "";
      }
    },
  });
};

const saveWebDav = async () => {
  busyId.value = "webdav-save";
  try {
    const response = await api.updateWebDavConfig(webdav.value);
    if (response.statusCode?.value >= 400) return fail(response, "Save failed");
    webdav.value = {
      ...webdav.value,
      ...result(response).webdav,
      password: "",
    };
    message.success(copy.value.saved);
  } finally {
    busyId.value = "";
  }
};

const testWebDav = async () => {
  busyId.value = "webdav-test";
  try {
    const response = await api.testWebDavConfig(webdav.value);
    if (response.statusCode?.value >= 400) return fail(response, "Test failed");
    message.success(copy.value.tested);
  } finally {
    busyId.value = "";
  }
};

watch(
  () => props.show,
  (show) => show && load(),
  { immediate: true },
);
</script>

<template>
  <tool-surface
    :show="show"
    class="backup-modal"
    :title="copy.title"
    width="min(94vw, 1120px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <template #header-extra>
      <n-button quaternary :loading="loading" @click="load">
        <template #icon
          ><n-icon><Refresh /></n-icon
        ></template>
        {{ copy.refresh }}
      </n-button>
    </template>

    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="backups" :tab="copy.backups">
        <div class="backup-toolbar">
          <n-button
            type="primary"
            :loading="busyId === 'create'"
            @click="create"
          >
            <template #icon
              ><n-icon><Plus /></n-icon
            ></template>
            {{ copy.create }}
          </n-button>
        </div>
        <n-spin :show="loading">
          <n-empty
            v-if="backups.length === 0"
            class="backup-empty"
            :description="copy.empty"
          >
            <template #extra
              ><n-text depth="3">{{ copy.emptyHint }}</n-text></template
            >
          </n-empty>
          <div v-else class="backup-list">
            <article
              v-for="backup in backups"
              :key="backup.backup_id"
              class="backup-row"
            >
              <div class="backup-copy">
                <strong>{{
                  dayjs(backup.save_time).format("YYYY-MM-DD HH:mm:ss")
                }}</strong>
                <p>{{ backup.path }}</p>
              </div>
              <div class="backup-actions">
                <n-button
                  size="small"
                  :loading="busyId === `download:${backup.backup_id}`"
                  @click="download(backup)"
                >
                  <template #icon
                    ><n-icon><Download /></n-icon></template
                  >{{ copy.download }}
                </n-button>
                <n-button
                  size="small"
                  :loading="busyId === `verify:${backup.backup_id}`"
                  @click="queue(backup, 'verify')"
                >
                  <template #icon
                    ><n-icon><FileCheck /></n-icon></template
                  >{{ copy.verify }}
                </n-button>
                <n-button
                  size="small"
                  :loading="busyId === `webdav:${backup.backup_id}`"
                  @click="queue(backup, 'webdav')"
                >
                  <template #icon
                    ><n-icon><CloudUpload /></n-icon></template
                  >{{ copy.upload }}
                </n-button>
                <n-button
                  size="small"
                  type="warning"
                  secondary
                  @click="openRestore(backup)"
                >
                  <template #icon
                    ><n-icon><RotateClockwise2 /></n-icon></template
                  >{{ copy.restore }}
                </n-button>
                <n-button
                  quaternary
                  circle
                  type="error"
                  :title="copy.remove"
                  :loading="busyId === `delete:${backup.backup_id}`"
                  @click="remove(backup)"
                >
                  <template #icon
                    ><n-icon><Trash /></n-icon
                  ></template>
                </n-button>
              </div>
            </article>
          </div>
        </n-spin>
      </n-tab-pane>

      <n-tab-pane name="webdav" :tab="copy.webdav">
        <div class="webdav-form">
          <n-form label-placement="top" :model="webdav">
            <n-form-item :label="copy.enabled"
              ><n-switch v-model:value="webdav.enabled"
            /></n-form-item>
            <n-form-item :label="copy.url"
              ><n-input
                v-model:value="webdav.url"
                placeholder="https://dav.example.com/backups"
            /></n-form-item>
            <n-grid :cols="2" :x-gap="14" responsive="screen" item-responsive>
              <n-form-item-gi span="2 m:1" :label="copy.username"
                ><n-input v-model:value="webdav.username"
              /></n-form-item-gi>
              <n-form-item-gi span="2 m:1" :label="copy.password">
                <n-input
                  v-model:value="webdav.password"
                  type="password"
                  show-password-on="click"
                  :placeholder="webdav.passwordSet ? copy.passwordKeep : ''"
                />
              </n-form-item-gi>
            </n-grid>
            <n-form-item :label="copy.remotePath"
              ><n-input
                v-model:value="webdav.remotePath"
                placeholder="PalworldBackups"
            /></n-form-item>
          </n-form>
          <p class="webdav-hint">{{ copy.secureHint }}</p>
          <div class="webdav-actions">
            <n-button :loading="busyId === 'webdav-test'" @click="testWebDav">{{
              copy.test
            }}</n-button>
            <n-button
              type="primary"
              :loading="busyId === 'webdav-save'"
              @click="saveWebDav"
              >{{ copy.save }}</n-button
            >
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>
  </tool-surface>

  <n-modal
    :show="Boolean(restoreTarget)"
    preset="card"
    class="restore-modal"
    :title="copy.restoreTitle"
    :mask-closable="false"
    @update:show="!$event && (restoreTarget = null)"
  >
    <p class="restore-warning">{{ copy.restoreWarning }}</p>
    <code>{{ restoreTarget?.backup_id }}</code>
    <n-input
      v-model:value="restoreConfirmation"
      class="restore-input"
      :placeholder="copy.confirmName"
    />
    <template #footer>
      <div class="restore-actions">
        <n-button @click="restoreTarget = null">{{ copy.cancel }}</n-button>
        <n-button
          type="warning"
          :disabled="!restoreMatches"
          :loading="busyId.startsWith('restore:')"
          @click="restore"
        >
          <template #icon
            ><n-icon><RotateClockwise2 /></n-icon></template
          >{{ copy.restore }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
:global(.backup-modal) {
  width: min(1120px, 94vw);
}
.backup-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.backup-empty {
  padding: 54px 0;
}
.backup-list {
  display: grid;
}
.backup-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 16px;
  align-items: center;
  min-height: 78px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--app-border);
}
.backup-copy {
  min-width: 0;
}
.backup-copy strong {
  color: var(--app-ink);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.backup-copy p {
  overflow: hidden;
  margin: 4px 0 0;
  color: var(--app-ink-muted);
  font: 12px/1.5 var(--app-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.backup-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.webdav-form {
  max-width: 720px;
  padding-top: 12px;
}
.webdav-hint {
  margin: 0 0 16px;
  color: var(--app-ink-muted);
  font-size: 12px;
  line-height: 1.6;
}
.webdav-actions,
.restore-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
:global(.restore-modal) {
  width: min(560px, 92vw);
}
.restore-warning {
  margin: 0 0 14px;
  color: var(--app-ink);
  line-height: 1.65;
}
.restore-modal code {
  display: block;
  padding: 10px 12px;
  color: var(--app-danger, #c34b5a);
  background: var(--app-surface-muted);
  border-radius: 6px;
  overflow-wrap: anywhere;
}
.restore-input {
  margin-top: 14px;
}
@media (max-width: 760px) {
  :global(.backup-modal) {
    width: 100vw;
    max-width: 100vw;
  }
  .backup-row {
    grid-template-columns: 1fr;
  }
  .backup-actions {
    justify-content: flex-start;
  }
  .backup-copy p {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
