<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Launch, Renew } from "@vicons/carbon";
import { useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";
import palConfSchema from "@/assets/pal-conf-schema.json";
import {
  parsePalworldSettings,
  serializePalworldSettings,
} from "@/utils/palworldSettings";

const props = defineProps({ show: Boolean, embedded: { type: Boolean, default: false } });
const emit = defineEmits(["update:show", "saved"]);
const { locale, t } = useI18n();
const dialog = useDialog();
const message = useMessage();
const api = new ApiService();

const frame = ref(null);
const loading = ref(false);
const saving = ref(false);
const ready = ref(false);
const currentSettings = ref({});
let pendingIniResolver = null;

const language = computed(() => {
  const value = String(locale.value || "").toLowerCase();
  if (value.startsWith("zh")) return "zh_CN";
  if (value.startsWith("ja")) return "ja_JP";
  return "en_US";
});
const frameSource = computed(() => `./pal-conf/index.html?embedded=1&lng=${language.value}`);

const postToGenerator = (payload) => {
  frame.value?.contentWindow?.postMessage(payload, window.location.origin);
};

const loadCurrentSettings = async ({ notify = false } = {}) => {
  loading.value = true;
  try {
    const { data, statusCode } = await api.getPanelStatus();
    if (statusCode.value !== 200) throw new Error(data.value?.error || "Request failed");
    currentSettings.value = { ...(data.value?.config?.settings || {}) };
    if (ready.value) {
      postToGenerator({
        type: "PALWORLD_PANEL_LOAD_INI",
        ini: serializePalworldSettings(currentSettings.value, palConfSchema),
      });
      if (notify) message.success(t("gameSettings.generatorLoaded"));
    }
  } catch (error) {
    message.error(`${t("gameSettings.loadFailed")} ${error.message}`);
  } finally {
    loading.value = false;
  }
};

const requestGeneratedIni = () => new Promise((resolve, reject) => {
  const timeout = window.setTimeout(() => {
    pendingIniResolver = null;
    reject(new Error(t("gameSettings.generatorTimeout")));
  }, 5000);
  pendingIniResolver = (ini) => {
    window.clearTimeout(timeout);
    pendingIniResolver = null;
    resolve(ini);
  };
  postToGenerator({ type: "PALWORLD_PANEL_REQUEST_INI" });
});

const persistGeneratedSettings = async () => {
  saving.value = true;
  try {
    const ini = await requestGeneratedIni();
    const generated = parsePalworldSettings(ini).settings;
    const preservedUnknown = Object.fromEntries(
      Object.entries(currentSettings.value).filter(([key]) => !palConfSchema[key]),
    );
    const nextSettings = { ...preservedUnknown, ...generated };
    const changed = Object.keys(nextSettings).filter(
      (key) => !Object.is(nextSettings[key], currentSettings.value[key]),
    ).length;
    const removed = Object.keys(currentSettings.value).filter(
      (key) => !Object.prototype.hasOwnProperty.call(nextSettings, key),
    ).length;

    dialog.warning({
      title: t("gameSettings.generatorSaveTitle"),
      content: t("gameSettings.generatorSaveConfirm", { changed, removed }),
      positiveText: t("button.confirm"),
      negativeText: t("button.cancel"),
      onPositiveClick: async () => {
        saving.value = true;
        try {
          const { data, statusCode } = await api.updateGameSettings(nextSettings);
          if (statusCode.value !== 200) throw new Error(data.value?.error || "Request failed");
          currentSettings.value = { ...data.value.settings };
          emit("saved", currentSettings.value);
          message.success(t("gameSettings.generatorSaved"));
        } catch (error) {
          message.error(`${t("gameSettings.saveFailed")} ${error.message}`);
          return false;
        } finally {
          saving.value = false;
        }
        return true;
      },
    });
  } catch (error) {
    message.error(`${t("gameSettings.saveFailed")} ${error.message}`);
  } finally {
    saving.value = false;
  }
};

const handleMessage = (event) => {
  if (event.origin !== window.location.origin || event.source !== frame.value?.contentWindow) return;
  if (event.data?.type === "PAL_CONF_READY") {
    ready.value = true;
    nextTick(() => loadCurrentSettings());
  }
  if (event.data?.type === "PAL_CONF_INI" && typeof event.data.ini === "string") {
    pendingIniResolver?.(event.data.ini);
  }
};

const reloadGenerator = () => {
  ready.value = false;
  if (frame.value) frame.value.src = frameSource.value;
};

watch(() => props.show, (show) => show && loadCurrentSettings(), { immediate: true });
onMounted(() => window.addEventListener("message", handleMessage));
onBeforeUnmount(() => window.removeEventListener("message", handleMessage));
</script>

<template>
  <tool-surface
    :show="show"
    :title="$t('gameSettings.title')"
    width="min(96vw, 1240px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <template #description>
      {{ $t("gameSettings.generatorDescription") }}
    </template>
    <template #header-extra>
      <n-button secondary :loading="loading" @click="loadCurrentSettings({ notify: true })">
        <template #icon><n-icon><Renew /></n-icon></template>
        {{ $t("gameSettings.generatorReload") }}
      </n-button>
      <n-button type="primary" :loading="saving" :disabled="!ready" @click="persistGeneratedSettings">
        <template #icon><n-icon><Launch /></n-icon></template>
        {{ $t("gameSettings.generatorSave") }}
      </n-button>
    </template>

    <n-alert type="warning" :bordered="false" class="generator-notice">
      {{ $t("gameSettings.restartHint") }}
    </n-alert>
    <div class="generator-frame-shell" :class="{ 'is-loading': !ready }">
      <n-skeleton v-if="!ready" text :repeat="8" class="generator-skeleton" />
      <iframe
        ref="frame"
        :src="frameSource"
        :title="$t('gameSettings.generatorFrameTitle')"
        class="generator-frame"
        allow="clipboard-read; clipboard-write"
        @error="reloadGenerator"
      />
    </div>
    <footer class="generator-credit">
      <span>{{ $t("gameSettings.generatorCredit") }}</span>
      <a href="https://github.com/Bluefissure/pal-conf" target="_blank" rel="noreferrer">
        Bluefissure/pal-conf
      </a>
      <span>· MIT</span>
    </footer>
  </tool-surface>
</template>

<style scoped>
.generator-notice { margin-bottom: 16px; }

.generator-frame-shell {
  position: relative;
  min-height: 960px;
  overflow: hidden;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 12px;
}

.generator-skeleton {
  position: absolute;
  inset: 24px;
  z-index: 1;
}

.generator-frame {
  display: block;
  width: 100%;
  height: 1160px;
  border: 0;
  background: transparent;
}

.generator-frame-shell.is-loading .generator-frame { opacity: 0; }

.generator-credit {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
  padding-top: 12px;
  color: var(--app-ink-muted);
  font-size: 12px;
}

.generator-credit a { color: var(--app-primary); }

@media (max-width: 700px) {
  .generator-frame-shell { min-height: 820px; }
  .generator-frame { height: 980px; }
  .generator-credit { justify-content: flex-start; }
}
</style>
