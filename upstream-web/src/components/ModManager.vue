<script setup>
import { computed, ref, watch } from "vue";
import { useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import { AlertCircle, Package, Refresh, Trash, Upload } from "@vicons/tabler";
import ApiService from "@/service/api";

const props = defineProps({ show: { type: Boolean, default: false } });
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const message = useMessage();
const dialog = useDialog();

const loading = ref(false);
const busyId = ref("");
const mods = ref([]);
const directories = ref({});
const uploadType = ref("pak");
const uploadInput = ref(null);

const copy = computed(() =>
  locale.value === "zh"
    ? {
        title: "模组管理",
        subtitle:
          "管理本机 Palworld 的 Pak、LogicMods 和 UE4SS 模组。启用状态改变后通常需要重启服务器。",
        scan: "扫描目录",
        upload: "上传模组",
        uploadHint:
          "支持 ZIP、PAK、UTOC、UCAS 和 DLL。ZIP 中的支持文件会自动提取。",
        type: "安装类型",
        pak: "Pak 模组",
        logic: "LogicMods",
        ue4ss: "UE4SS",
        enabled: "已启用",
        disabled: "已停用",
        remove: "删除",
        empty: "没有发现模组",
        emptyHint: "上传模组，或把文件放入下方对应目录后重新扫描。",
        restartNotice:
          "模组变更不会强制重启，便于你先完成多个调整。完成后请在服务器运维中重启。",
        uploaded: "模组已上传。",
        changed: "模组状态已更新。",
        removed: "模组已删除。",
        removeTitle: "删除模组",
        removeConfirm: "将永久删除该模组在受管目录中的全部文件。",
        paths: "安装目录",
      }
    : {
        title: "Mods",
        subtitle:
          "Manage Pak, LogicMods, and UE4SS mods installed on this Palworld host. A server restart is usually required after changes.",
        scan: "Scan folders",
        upload: "Upload mod",
        uploadHint:
          "Accepts ZIP, PAK, UTOC, UCAS, and DLL. Supported files inside ZIP archives are extracted automatically.",
        type: "Install type",
        pak: "Pak mod",
        logic: "LogicMods",
        ue4ss: "UE4SS",
        enabled: "Enabled",
        disabled: "Disabled",
        remove: "Delete",
        empty: "No mods found",
        emptyHint:
          "Upload a mod or place files in a managed folder, then scan again.",
        restartNotice:
          "Changes do not force an immediate restart, so you can finish a batch first. Restart from Server operations when ready.",
        uploaded: "Mod uploaded.",
        changed: "Mod state updated.",
        removed: "Mod deleted.",
        removeTitle: "Delete mod",
        removeConfirm:
          "All files for this mod in managed folders will be permanently deleted.",
        paths: "Install folders",
      },
);

const typeOptions = computed(() => [
  { label: copy.value.pak, value: "pak" },
  { label: copy.value.logic, value: "logic" },
  { label: copy.value.ue4ss, value: "ue4ss" },
]);
const result = (response) => response?.data?.value || {};
const formatSize = (bytes) => {
  const value = Number(bytes || 0);
  if (value < 1024 * 1024)
    return `${Math.max(0.1, value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};
const showFailure = (response, fallback) =>
  message.error(result(response).error || fallback);

const applyResult = (response) => {
  const data = result(response);
  mods.value = Array.isArray(data.mods) ? data.mods : [];
  directories.value = data.directories || directories.value;
};

const load = async (scan = false) => {
  loading.value = true;
  try {
    const response = scan ? await api.scanMods() : await api.getMods();
    if (response.statusCode?.value >= 400)
      return showFailure(response, "Unable to scan mods");
    applyResult(response);
  } finally {
    loading.value = false;
  }
};

const chooseUpload = () => uploadInput.value?.click();
const upload = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  busyId.value = "upload";
  try {
    const response = await api.uploadMod(file, uploadType.value);
    if (response.statusCode?.value >= 400)
      return showFailure(response, "Upload failed");
    applyResult(response);
    message.success(copy.value.uploaded);
  } finally {
    busyId.value = "";
  }
};

const toggle = async (mod, enabled) => {
  busyId.value = mod.id;
  try {
    const response = await api.setModEnabled(mod.id, enabled);
    if (response.statusCode?.value >= 400)
      return showFailure(response, "Unable to change mod state");
    message.success(copy.value.changed);
    await load();
  } finally {
    busyId.value = "";
  }
};

const remove = (mod) => {
  dialog.error({
    title: copy.value.removeTitle,
    content: copy.value.removeConfirm,
    positiveText: copy.value.remove,
    negativeText: locale.value === "zh" ? "取消" : "Cancel",
    onPositiveClick: async () => {
      busyId.value = `delete:${mod.id}`;
      try {
        const response = await api.deleteMod(mod.id);
        if (response.statusCode?.value >= 400)
          return showFailure(response, "Delete failed");
        message.success(copy.value.removed);
        await load();
      } finally {
        busyId.value = "";
      }
    },
  });
};

watch(
  () => props.show,
  (show) => show && load(),
  { immediate: true },
);
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="mod-manager-modal"
    :title="copy.title"
    :bordered="false"
    @update:show="emit('update:show', $event)"
  >
    <template #header-extra>
      <n-button quaternary :loading="loading" @click="load(true)">
        <template #icon
          ><n-icon><Refresh /></n-icon
        ></template>
        {{ copy.scan }}
      </n-button>
    </template>

    <p class="manager-intro">{{ copy.subtitle }}</p>
    <div class="mod-restart-notice">
      <n-icon><AlertCircle /></n-icon><span>{{ copy.restartNotice }}</span>
    </div>

    <section class="mod-upload-band">
      <div>
        <strong>{{ copy.upload }}</strong>
        <p>{{ copy.uploadHint }}</p>
      </div>
      <n-select
        v-model:value="uploadType"
        :options="typeOptions"
        :aria-label="copy.type"
      />
      <input
        ref="uploadInput"
        hidden
        type="file"
        accept=".zip,.pak,.utoc,.ucas,.dll,application/zip"
        @change="upload"
      />
      <n-button
        type="primary"
        :loading="busyId === 'upload'"
        @click="chooseUpload"
      >
        <template #icon
          ><n-icon><Upload /></n-icon
        ></template>
        {{ copy.upload }}
      </n-button>
    </section>

    <n-spin :show="loading">
      <n-empty
        v-if="mods.length === 0"
        class="mod-empty"
        :description="copy.empty"
      >
        <template #extra
          ><n-text depth="3">{{ copy.emptyHint }}</n-text></template
        >
      </n-empty>
      <div v-else class="mod-list">
        <article v-for="mod in mods" :key="mod.id" class="mod-row">
          <div class="mod-icon">
            <n-icon><Package /></n-icon>
          </div>
          <div class="mod-copy">
            <div class="mod-title-line">
              <strong>{{ mod.name }}</strong>
              <n-tag size="small">{{ copy[mod.type] || mod.type }}</n-tag>
              <n-tag :type="mod.enabled ? 'success' : 'default'" size="small">
                {{ mod.enabled ? copy.enabled : copy.disabled }}
              </n-tag>
            </div>
            <p>{{ mod.paths?.join(" · ") }}</p>
            <small>{{ formatSize(mod.size) }}</small>
          </div>
          <div class="mod-actions">
            <n-switch
              :value="mod.enabled"
              :loading="busyId === mod.id"
              :aria-label="mod.enabled ? copy.enabled : copy.disabled"
              @update:value="toggle(mod, $event)"
            />
            <n-button
              quaternary
              circle
              type="error"
              :title="copy.remove"
              :loading="busyId === `delete:${mod.id}`"
              @click="remove(mod)"
              ><template #icon
                ><n-icon><Trash /></n-icon></template
            ></n-button>
          </div>
        </article>
      </div>
    </n-spin>

    <n-collapse v-if="Object.keys(directories).length" class="mod-paths">
      <n-collapse-item :title="copy.paths" name="paths">
        <dl>
          <template v-for="(directory, type) in directories" :key="type">
            <dt>{{ copy[type] || type }}</dt>
            <dd>{{ directory }}</dd>
          </template>
        </dl>
      </n-collapse-item>
    </n-collapse>
  </n-modal>
</template>

<style scoped>
:global(.mod-manager-modal) {
  width: min(1040px, 94vw);
}
.manager-intro {
  margin: 0 0 14px;
  color: var(--app-ink-muted);
  font-size: 13px;
}
.mod-restart-notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  color: var(--app-warning-ink, #7a531d);
  background: var(--app-warning-soft, #fff6e6);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.55;
}
.mod-upload-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 210px) auto;
  gap: 12px;
  align-items: center;
  padding: 18px 0;
  border-bottom: 1px solid var(--app-border);
}
.mod-upload-band strong {
  color: var(--app-ink);
}
.mod-upload-band p {
  margin: 3px 0 0;
  color: var(--app-ink-muted);
  font-size: 12px;
}
.mod-empty {
  padding: 44px 0 26px;
}
.mod-list {
  display: grid;
}
.mod-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 82px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--app-border);
}
.mod-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: var(--app-accent);
  background: var(--app-accent-soft);
  border-radius: 8px;
}
.mod-copy {
  min-width: 0;
}
.mod-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}
.mod-title-line strong {
  color: var(--app-ink);
  font-size: 14px;
}
.mod-copy p {
  overflow: hidden;
  margin: 4px 0;
  color: var(--app-ink-muted);
  font: 11px/1.5 var(--app-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mod-copy small {
  color: var(--app-ink-muted);
}
.mod-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mod-paths {
  margin-top: 12px;
}
.mod-paths dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 14px;
  margin: 0;
}
.mod-paths dt {
  color: var(--app-ink);
  font-weight: 600;
}
.mod-paths dd {
  margin: 0;
  color: var(--app-ink-muted);
  font: 12px/1.5 var(--app-font-mono);
  overflow-wrap: anywhere;
}
@media (max-width: 700px) {
  :global(.mod-manager-modal) {
    width: 100vw;
    max-width: 100vw;
  }
  .mod-upload-band {
    grid-template-columns: 1fr;
  }
  .mod-row {
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: start;
  }
  .mod-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
  .mod-copy p {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .mod-paths dl {
    grid-template-columns: 1fr;
    gap: 3px;
  }
  .mod-paths dd {
    margin-bottom: 8px;
  }
}
</style>
