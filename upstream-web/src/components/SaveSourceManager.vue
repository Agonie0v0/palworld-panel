<script setup>
import { computed, ref, watch } from "vue";
import { useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import {
  Check,
  Database,
  Edit,
  Link,
  Refresh,
  Trash,
  Upload,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";
import { clearCached } from "@/utils/requestCache";

const props = defineProps({
  show: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
});
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const message = useMessage();
const dialog = useDialog();

const loading = ref(false);
const busyId = ref("");
const sources = ref([]);
const uploadInput = ref(null);
const uploadName = ref("");
const pathForm = ref({ path: "", name: "" });

const copy = computed(() =>
  locale.value === "zh"
    ? {
        title: "存档源管理",
        subtitle:
          "切换面板当前解析的世界存档。关联路径不会复制文件，ZIP 导入会保存到面板数据目录。",
        current: "当前服务器世界",
        active: "正在使用",
        linked: "关联目录",
        imported: "ZIP 导入",
        path: "服务器上的存档目录",
        name: "显示名称（可选）",
        link: "关联路径",
        upload: "导入 ZIP",
        uploadName: "ZIP 的显示名称（可选）",
        activate: "设为解析源",
        rebuild: "重建索引",
        rename: "重命名",
        remove: "删除",
        refresh: "刷新",
        empty: "还没有额外存档源",
        emptyHint: "可以导入旧世界 ZIP，或关联服务器上的现有目录。",
        linkedSuccess: "存档目录已关联。",
        uploadedSuccess: "存档 ZIP 已导入。",
        activatedSuccess: "解析源已切换。",
        rebuildQueued: "索引重建任务已提交，可在运维中心查看进度。",
        renamedSuccess: "名称已更新。",
        removedSuccess: "存档源已删除。",
        removeTitle: "删除存档源",
        removeConfirm:
          "导入的 ZIP 存档会连同面板中的副本一起删除；关联目录只会解除关联，不会删除原目录。",
        pathRequired: "请输入服务器上的存档目录。",
      }
    : {
        title: "Save sources",
        subtitle:
          "Choose which world the panel parses. Linked paths stay in place; ZIP imports are stored in the panel data directory.",
        current: "Current server world",
        active: "Active",
        linked: "Linked directory",
        imported: "ZIP import",
        path: "Save directory on the server",
        name: "Display name (optional)",
        link: "Link path",
        upload: "Import ZIP",
        uploadName: "ZIP display name (optional)",
        activate: "Use for parsing",
        rebuild: "Rebuild index",
        rename: "Rename",
        remove: "Delete",
        refresh: "Refresh",
        empty: "No additional save sources",
        emptyHint:
          "Import an older world ZIP or link an existing server directory.",
        linkedSuccess: "Save directory linked.",
        uploadedSuccess: "Save ZIP imported.",
        activatedSuccess: "Save source changed.",
        rebuildQueued:
          "Index rebuild queued. Follow its progress in Operations center.",
        renamedSuccess: "Name updated.",
        removedSuccess: "Save source deleted.",
        removeTitle: "Delete save source",
        removeConfirm:
          "Imported ZIP data will be removed from panel storage. Linked directories are only unlinked and are not deleted.",
        pathRequired: "Enter a save directory on the server.",
      },
);

const result = (response) => response?.data?.value || {};
const fail = (response, fallback) => {
  const data = result(response);
  message.error(data.error || fallback);
};
const invalidateWorldDataCache = () => clearCached("world-data");
const formatSize = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return "-";
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const load = async () => {
  loading.value = true;
  try {
    const response = await api.getSaveSources();
    const data = result(response);
    if (response.statusCode?.value >= 400) return fail(response, "Load failed");
    sources.value = Array.isArray(data.sources) ? data.sources : [];
  } finally {
    loading.value = false;
  }
};

const linkPath = async () => {
  if (!pathForm.value.path.trim())
    return message.warning(copy.value.pathRequired);
  busyId.value = "link";
  try {
    const response = await api.importSaveSourcePath(
      pathForm.value.path.trim(),
      pathForm.value.name.trim(),
    );
    if (response.statusCode?.value >= 400)
      return fail(response, "Import failed");
    pathForm.value = { path: "", name: "" };
    invalidateWorldDataCache();
    message.success(copy.value.linkedSuccess);
    await load();
  } finally {
    busyId.value = "";
  }
};

const chooseUpload = () => uploadInput.value?.click();
const upload = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  busyId.value = "upload";
  try {
    const response = await api.uploadSaveSource(file, uploadName.value.trim());
    if (response.statusCode?.value >= 400)
      return fail(response, "Upload failed");
    uploadName.value = "";
    invalidateWorldDataCache();
    message.success(copy.value.uploadedSuccess);
    await load();
  } finally {
    busyId.value = "";
  }
};

const activate = async (source) => {
  busyId.value = source.id;
  try {
    const response = await api.activateSaveSource(source.id);
    if (response.statusCode?.value >= 400)
      return fail(response, "Activation failed");
    invalidateWorldDataCache();
    message.success(copy.value.activatedSuccess);
    await load();
  } finally {
    busyId.value = "";
  }
};

const rebuild = async (source) => {
  busyId.value = `rebuild:${source.id}`;
  try {
    const response = await api.rebuildSaveSource(source.id);
    if (response.statusCode?.value >= 400)
      return fail(response, "Rebuild failed");
    message.success(copy.value.rebuildQueued);
  } finally {
    busyId.value = "";
  }
};

const rename = (source) => {
  const nextName = window.prompt(copy.value.name, source.name);
  if (!nextName?.trim() || nextName.trim() === source.name) return;
  busyId.value = `rename:${source.id}`;
  api
    .renameSaveSource(source.id, nextName.trim())
    .then(async (response) => {
      if (response.statusCode?.value >= 400)
        return fail(response, "Rename failed");
      message.success(copy.value.renamedSuccess);
      await load();
    })
    .finally(() => {
      busyId.value = "";
    });
};

const remove = (source) => {
  dialog.warning({
    title: copy.value.removeTitle,
    content: copy.value.removeConfirm,
    positiveText: copy.value.remove,
    negativeText: locale.value === "zh" ? "取消" : "Cancel",
    onPositiveClick: async () => {
      busyId.value = `delete:${source.id}`;
      try {
        const response = await api.deleteSaveSource(source.id);
        if (response.statusCode?.value >= 400)
          return fail(response, "Delete failed");
        invalidateWorldDataCache();
        message.success(copy.value.removedSuccess);
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
  <tool-surface
    :show="show"
    class="save-source-modal"
    :title="copy.title"
    width="min(94vw, 1080px)"
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

    <p class="manager-intro">{{ copy.subtitle }}</p>

    <section class="source-import-band">
      <div class="source-import-block">
        <div class="source-import-heading">
          <n-icon><Link /></n-icon><strong>{{ copy.linked }}</strong>
        </div>
        <n-input v-model:value="pathForm.path" :placeholder="copy.path" />
        <div class="source-import-row">
          <n-input v-model:value="pathForm.name" :placeholder="copy.name" />
          <n-button
            type="primary"
            :loading="busyId === 'link'"
            @click="linkPath"
          >
            <template #icon
              ><n-icon><Link /></n-icon
            ></template>
            {{ copy.link }}
          </n-button>
        </div>
      </div>
      <div class="source-import-block">
        <div class="source-import-heading">
          <n-icon><Upload /></n-icon><strong>{{ copy.imported }}</strong>
        </div>
        <n-input v-model:value="uploadName" :placeholder="copy.uploadName" />
        <input
          ref="uploadInput"
          hidden
          type="file"
          accept=".zip,application/zip"
          @change="upload"
        />
        <n-button :loading="busyId === 'upload'" @click="chooseUpload">
          <template #icon
            ><n-icon><Upload /></n-icon
          ></template>
          {{ copy.upload }}
        </n-button>
      </div>
    </section>

    <n-spin :show="loading">
      <n-empty
        v-if="sources.length <= 1"
        class="source-empty"
        :description="copy.empty"
      >
        <template #extra
          ><n-text depth="3">{{ copy.emptyHint }}</n-text></template
        >
      </n-empty>
      <div class="source-list">
        <article v-for="source in sources" :key="source.id" class="source-row">
          <div class="source-kind-icon" :class="{ 'is-active': source.active }">
            <n-icon><Database /></n-icon>
          </div>
          <div class="source-copy">
            <div class="source-title-line">
              <strong>{{
                source.id === "server" ? copy.current : source.name
              }}</strong>
              <n-tag v-if="source.active" type="success" size="small">
                <template #icon
                  ><n-icon><Check /></n-icon
                ></template>
                {{ copy.active }}
              </n-tag>
              <n-tag v-else size="small">
                {{ source.kind === "linked" ? copy.linked : copy.imported }}
              </n-tag>
            </div>
            <p>{{ source.path }}</p>
            <small v-if="source.size">{{ formatSize(source.size) }}</small>
          </div>
          <div class="source-actions">
            <n-button
              v-if="!source.active"
              size="small"
              type="primary"
              secondary
              :loading="busyId === source.id"
              @click="activate(source)"
              >{{ copy.activate }}</n-button
            >
            <n-button
              size="small"
              :loading="busyId === `rebuild:${source.id}`"
              @click="rebuild(source)"
            >
              <template #icon
                ><n-icon><Refresh /></n-icon
              ></template>
              {{ copy.rebuild }}
            </n-button>
            <n-button
              v-if="source.id !== 'server'"
              quaternary
              circle
              :title="copy.rename"
              :loading="busyId === `rename:${source.id}`"
              @click="rename(source)"
              ><template #icon
                ><n-icon><Edit /></n-icon></template
            ></n-button>
            <n-button
              v-if="source.id !== 'server'"
              quaternary
              circle
              type="error"
              :title="copy.remove"
              :loading="busyId === `delete:${source.id}`"
              @click="remove(source)"
              ><template #icon
                ><n-icon><Trash /></n-icon></template
            ></n-button>
          </div>
        </article>
      </div>
    </n-spin>
  </tool-surface>
</template>

<style scoped>
:global(.save-source-modal) {
  width: min(1080px, 94vw);
}
.manager-intro {
  margin: 0 0 18px;
  color: var(--app-ink-muted);
  font-size: 13px;
}
.source-import-band {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 24px;
  padding: 16px 0 20px;
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}
.source-import-block {
  display: grid;
  align-content: start;
  gap: 10px;
}
.source-import-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-ink);
}
.source-import-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}
.source-empty {
  padding: 42px 0 20px;
}
.source-list {
  display: grid;
  margin-top: 14px;
}
.source-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 82px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--app-border);
}
.source-kind-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: var(--app-ink-muted);
  background: var(--app-surface-muted);
  border-radius: 8px;
}
.source-kind-icon.is-active {
  color: var(--app-accent);
  background: var(--app-accent-soft);
}
.source-copy {
  min-width: 0;
}
.source-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.source-copy strong {
  color: var(--app-ink);
  font-size: 14px;
}
.source-copy p {
  overflow: hidden;
  margin: 4px 0 0;
  color: var(--app-ink-muted);
  font: 12px/1.5 var(--app-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-copy small {
  color: var(--app-ink-muted);
}
.source-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
@media (max-width: 700px) {
  :global(.save-source-modal) {
    width: 100vw;
    max-width: 100vw;
  }
  .source-import-band {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .source-row {
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: start;
  }
  .source-actions {
    grid-column: 1 / -1;
    flex-wrap: wrap;
    padding-left: 46px;
  }
  .source-copy p {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
