<script setup>
import { computed, ref, watch } from "vue";
import { useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import {
  BrandSteam,
  Download,
  Language,
  Refresh,
  Search,
  Settings,
  Trash,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";

const props = defineProps({
  show: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
});
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const message = useMessage();
const dialog = useDialog();

const activeTab = ref("search");
const loading = ref(false);
const busy = ref("");
const query = ref("");
const results = ref([]);
const total = ref(0);
const installed = ref([]);
const config = ref({
  appId: "1623730",
  steamApiKey: "",
  steamApiKeySet: false,
  translationUrl: "",
  translationModel: "gpt-4.1-mini",
  translationKey: "",
  translationKeySet: false,
});
const translation = ref({});

const copy = computed(() =>
  locale.value === "zh"
    ? {
        title: "Steam Workshop",
        subtitle:
          "搜索 Palworld 创意工坊，查看真实模组信息，并通过 SteamCMD 安装到服务器。安装和更新后需要重启。",
        search: "搜索",
        installed: "已安装",
        settings: "设置",
        query: "搜索模组名称或关键词",
        noResults: "没有搜索结果",
        noInstalled: "还没有通过面板安装 Workshop 模组",
        install: "安装",
        translate: "翻译",
        queued: "安装任务已提交，可在运维中心查看进度。",
        enabled: "启用",
        disabled: "停用",
        remove: "删除",
        pendingRestart: "等待重启",
        appId: "Workshop App ID",
        steamKey: "Steam Web API Key",
        steamKeyHint: "留空则保持现有 Key；搜索功能需要此 Key。",
        translationUrl: "OpenAI 兼容 Base URL",
        translationModel: "翻译模型",
        translationKey: "翻译 API Key",
        translationKeyHint: "留空则保持现有 Key。公网地址必须使用 HTTPS。",
        save: "保存设置",
        saved: "Workshop 设置已保存。",
        removed: "Workshop 模组已删除。",
        changed: "模组状态已更新，重启后生效。",
        removeConfirm: "将删除服务器上的 Workshop 模组文件。",
      }
    : {
        title: "Steam Workshop",
        subtitle:
          "Search the Palworld Workshop, inspect real mod metadata, and install with SteamCMD. A restart is required after installs or updates.",
        search: "Search",
        installed: "Installed",
        settings: "Settings",
        query: "Search mod names or keywords",
        noResults: "No search results",
        noInstalled: "No Workshop mods have been installed through the panel",
        install: "Install",
        translate: "Translate",
        queued: "Install queued. Follow progress in Operations center.",
        enabled: "Enabled",
        disabled: "Disabled",
        remove: "Delete",
        pendingRestart: "Restart pending",
        appId: "Workshop App ID",
        steamKey: "Steam Web API key",
        steamKeyHint:
          "Leave blank to keep the current key. Search requires this key.",
        translationUrl: "OpenAI-compatible base URL",
        translationModel: "Translation model",
        translationKey: "Translation API key",
        translationKeyHint:
          "Leave blank to keep the current key. Public endpoints require HTTPS.",
        save: "Save settings",
        saved: "Workshop settings saved.",
        removed: "Workshop mod deleted.",
        changed: "Mod state updated and will apply after restart.",
        removeConfirm: "Workshop mod files will be deleted from the server.",
      },
);

const result = (response) => response?.data?.value || {};
const fail = (response, fallback) =>
  message.error(result(response).error || fallback);
const itemId = (item) => String(item.publishedfileid || item.id || "");

const load = async () => {
  loading.value = true;
  try {
    const [configResponse, installedResponse] = await Promise.all([
      api.getWorkshopConfig(),
      api.getInstalledWorkshopMods(),
    ]);
    config.value = {
      ...config.value,
      ...(result(configResponse).config || {}),
      steamApiKey: "",
      translationKey: "",
    };
    installed.value = result(installedResponse).mods || [];
  } finally {
    loading.value = false;
  }
};

const search = async () => {
  busy.value = "search";
  try {
    const response = await api.searchWorkshop(query.value, 1);
    if (response.statusCode?.value >= 400)
      return fail(response, "Search failed");
    const data = result(response).result || {};
    results.value = data.publishedfiledetails || [];
    total.value = data.total || results.value.length;
  } finally {
    busy.value = "";
  }
};

const install = async (item) => {
  const id = itemId(item);
  busy.value = `install:${id}`;
  try {
    const response = await api.installWorkshopMod(id);
    if (response.statusCode?.value >= 400)
      return fail(response, "Install failed");
    message.success(copy.value.queued);
  } finally {
    busy.value = "";
  }
};

const translate = async (item) => {
  const id = itemId(item);
  busy.value = `translate:${id}`;
  try {
    const response = await api.translateWorkshopMod(
      id,
      locale.value === "zh" ? "zh-CN" : "en-US",
    );
    if (response.statusCode?.value >= 400)
      return fail(response, "Translation failed");
    translation.value[id] = result(response).translation;
  } finally {
    busy.value = "";
  }
};

const toggle = async (mod, enabled) => {
  busy.value = `toggle:${mod.id}`;
  try {
    const response = await api.setWorkshopModEnabled(mod.id, enabled);
    if (response.statusCode?.value >= 400)
      return fail(response, "Update failed");
    installed.value = result(response).mods || installed.value;
    message.success(copy.value.changed);
  } finally {
    busy.value = "";
  }
};

const remove = (mod) => {
  dialog.error({
    title: copy.value.remove,
    content: copy.value.removeConfirm,
    positiveText: copy.value.remove,
    negativeText: locale.value === "zh" ? "取消" : "Cancel",
    onPositiveClick: async () => {
      const response = await api.deleteWorkshopMod(mod.id);
      if (response.statusCode?.value >= 400)
        return fail(response, "Delete failed");
      installed.value = result(response).mods || [];
      message.success(copy.value.removed);
    },
  });
};

const saveConfig = async () => {
  busy.value = "config";
  try {
    const response = await api.updateWorkshopConfig(config.value);
    if (response.statusCode?.value >= 400) return fail(response, "Save failed");
    config.value = {
      ...config.value,
      ...result(response).config,
      steamApiKey: "",
      translationKey: "",
    };
    message.success(copy.value.saved);
  } finally {
    busy.value = "";
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
    class="workshop-modal"
    :title="copy.title"
    width="min(94vw, 1180px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <template #header-extra
      ><n-button quaternary :loading="loading" @click="load"
        ><template #icon
          ><n-icon><Refresh /></n-icon></template></n-button
    ></template>
    <p class="manager-intro">{{ copy.subtitle }}</p>
    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="search" :tab="copy.search">
        <div class="workshop-search">
          <n-input
            v-model:value="query"
            clearable
            :placeholder="copy.query"
            @keyup.enter="search"
            ><template #prefix
              ><n-icon><Search /></n-icon></template></n-input
          ><n-button
            type="primary"
            :loading="busy === 'search'"
            @click="search"
            >{{ copy.search }}</n-button
          >
        </div>
        <n-empty v-if="results.length === 0" :description="copy.noResults" />
        <div v-else class="workshop-results">
          <article v-for="item in results" :key="itemId(item)">
            <img :src="item.preview_url" :alt="item.title" loading="lazy" />
            <div class="workshop-copy">
              <strong>{{
                translation[itemId(item)]?.title || item.title
              }}</strong
              ><small
                >#{{ itemId(item) }} ·
                {{ item.subscriptions || 0 }} subscribers</small
              >
              <p>
                {{
                  translation[itemId(item)]?.description ||
                  item.short_description ||
                  item.description
                }}
              </p>
            </div>
            <div class="workshop-actions">
              <n-button
                size="small"
                :loading="busy === `translate:${itemId(item)}`"
                @click="translate(item)"
                ><template #icon
                  ><n-icon><Language /></n-icon></template
                >{{ copy.translate }}</n-button
              ><n-button
                size="small"
                type="primary"
                :loading="busy === `install:${itemId(item)}`"
                @click="install(item)"
                ><template #icon
                  ><n-icon><Download /></n-icon></template
                >{{ copy.install }}</n-button
              >
            </div>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="installed" :tab="copy.installed">
        <n-empty
          v-if="installed.length === 0"
          :description="copy.noInstalled"
        />
        <div class="installed-list">
          <article v-for="mod in installed" :key="mod.id">
            <img v-if="mod.previewUrl" :src="mod.previewUrl" :alt="mod.title" />
            <div>
              <strong>{{ mod.title }}</strong>
              <p>#{{ mod.id }}</p>
              <n-tag v-if="mod.pendingRestart" size="small" type="warning">{{
                copy.pendingRestart
              }}</n-tag>
            </div>
            <n-switch
              :value="mod.enabled"
              :loading="busy === `toggle:${mod.id}`"
              @update:value="toggle(mod, $event)"
            /><n-button
              quaternary
              circle
              type="error"
              :title="copy.remove"
              @click="remove(mod)"
              ><template #icon
                ><n-icon><Trash /></n-icon></template
            ></n-button>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="settings" :tab="copy.settings">
        <n-form label-placement="top" :model="config" class="workshop-settings">
          <n-form-item :label="copy.appId"
            ><n-input v-model:value="config.appId"
          /></n-form-item>
          <n-form-item :label="copy.steamKey"
            ><n-input
              v-model:value="config.steamApiKey"
              type="password"
              show-password-on="click"
              :placeholder="config.steamApiKeySet ? copy.steamKeyHint : ''"
          /></n-form-item>
          <n-divider />
          <n-form-item :label="copy.translationUrl"
            ><n-input
              v-model:value="config.translationUrl"
              placeholder="https://api.example.com/v1"
          /></n-form-item>
          <n-form-item :label="copy.translationModel"
            ><n-input v-model:value="config.translationModel"
          /></n-form-item>
          <n-form-item :label="copy.translationKey"
            ><n-input
              v-model:value="config.translationKey"
              type="password"
              show-password-on="click"
              :placeholder="
                config.translationKeySet ? copy.translationKeyHint : ''
              "
          /></n-form-item>
        </n-form>
        <div class="settings-actions">
          <n-button
            type="primary"
            :loading="busy === 'config'"
            @click="saveConfig"
            ><template #icon
              ><n-icon><Settings /></n-icon></template
            >{{ copy.save }}</n-button
          >
        </div>
      </n-tab-pane>
    </n-tabs>
  </tool-surface>
</template>

<style scoped>
:global(.workshop-modal) {
  width: min(1120px, 95vw);
}
.manager-intro {
  margin: 0 0 16px;
  color: var(--app-ink-muted);
  font-size: 13px;
}
.workshop-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-bottom: 16px;
}
.workshop-results {
  display: grid;
}
.workshop-results article {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  min-height: 112px;
  padding: 12px 0;
  border-bottom: 1px solid var(--app-border);
}
.workshop-results img,
.installed-list img {
  width: 120px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 6px;
}
.workshop-copy {
  min-width: 0;
}
.workshop-copy strong {
  color: var(--app-ink);
}
.workshop-copy small {
  display: block;
  margin-top: 3px;
  color: var(--app-ink-muted);
}
.workshop-copy p {
  display: -webkit-box;
  overflow: hidden;
  margin: 7px 0 0;
  color: var(--app-ink-muted);
  font-size: 12px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.workshop-actions {
  display: flex;
  gap: 6px;
}
.installed-list {
  display: grid;
}
.installed-list article {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  min-height: 82px;
  border-bottom: 1px solid var(--app-border);
}
.installed-list img {
  width: 90px;
}
.installed-list strong {
  color: var(--app-ink);
}
.installed-list p {
  margin: 3px 0;
  color: var(--app-ink-muted);
  font-size: 12px;
}
.workshop-settings {
  max-width: 720px;
  padding-top: 10px;
}
.settings-actions {
  display: flex;
  justify-content: flex-end;
  max-width: 720px;
}
@media (max-width: 720px) {
  :global(.workshop-modal) {
    width: 100vw;
    max-width: 100vw;
  }
  .workshop-results article {
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: start;
  }
  .workshop-results img {
    width: 92px;
  }
  .workshop-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
  .installed-list article {
    grid-template-columns: 70px minmax(0, 1fr) auto;
  }
  .installed-list img {
    width: 70px;
  }
  .installed-list article > .n-button {
    grid-column: 3;
  }
}
</style>
