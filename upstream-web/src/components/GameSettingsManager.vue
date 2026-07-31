<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Launch, Renew, Save } from "@vicons/carbon";
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
const fpsSaving = ref(false);
const ready = ref(false);
const currentSettings = ref({});
const fpsRate = ref(60);
const loadedFpsRate = ref(60);
const fpsOptions = [30, 60, 90, 120];
let pendingIniResolver = null;

const language = computed(() => {
  const value = String(locale.value || "").toLowerCase();
  if (value.startsWith("zh")) return "zh_CN";
  if (value.startsWith("ja")) return "ja_JP";
  return "en_US";
});
const frameSource = computed(() => `./pal-conf/index.html?embedded=1&lng=${language.value}`);
const fpsDirty = computed(() => fpsRate.value !== loadedFpsRate.value);

const postToGenerator = (payload) => {
  frame.value?.contentWindow?.postMessage(payload, window.location.origin);
};

const loadCurrentSettings = async ({ notify = false } = {}) => {
  loading.value = true;
  try {
    const { data, statusCode } = await api.getPanelStatus();
    if (statusCode.value !== 200) throw new Error(data.value?.error || "Request failed");
    currentSettings.value = { ...(data.value?.config?.settings || {}) };
    const engineResponse = await api.getServerEngineSettings();
    if (engineResponse.statusCode.value !== 200) {
      throw new Error(engineResponse.data.value?.error || "Request failed");
    }
    const currentFps = Number(engineResponse.data.value?.settings?.netServerMaxTickRate || 60);
    fpsRate.value = currentFps;
    loadedFpsRate.value = currentFps;
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

const persistFpsSettings = async () => {
  const value = Number(fpsRate.value);
  if (!Number.isInteger(value) || value < 30 || value > 120) {
    message.error(t("gameSettings.fpsInvalid"));
    return;
  }
  fpsSaving.value = true;
  try {
    const { data, statusCode } = await api.updateServerEngineSettings(value);
    if (statusCode.value !== 200) throw new Error(data.value?.error || "Request failed");
    const savedValue = Number(data.value?.settings?.netServerMaxTickRate || value);
    fpsRate.value = savedValue;
    loadedFpsRate.value = savedValue;
    message.success(t("gameSettings.fpsSaved", { value: savedValue }));
    window.setTimeout(offerRestart, 0);
  } catch (error) {
    message.error(`${t("gameSettings.fpsSaveFailed")} ${error.message}`);
  } finally {
    fpsSaving.value = false;
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

const offerRestart = () => {
  dialog.warning({
    title: t("gameSettings.restartAfterSaveTitle"),
    content: t("gameSettings.restartAfterSaveContent"),
    positiveText: t("gameSettings.restartNow"),
    negativeText: t("gameSettings.restartLater"),
    maskClosable: false,
    onPositiveClick: async () => {
      try {
        const { data, statusCode } = await api.runServerAction("restart", true);
        if (![200, 202].includes(statusCode.value) || data.value?.ok === false) {
          message.error(data.value?.error || t("gameSettings.restartFailed"));
          return false;
        }
        message.success(t("gameSettings.restartQueued"));
        return true;
      } catch (error) {
        message.error(`${t("gameSettings.restartFailed")} ${error.message}`);
        return false;
      }
    },
    onNegativeClick: () => message.info(t("gameSettings.restartDeferred")),
  });
};

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
          window.setTimeout(offerRestart, 0);
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
        <span class="generator-header-action-label">{{ $t("gameSettings.generatorReload") }}</span>
      </n-button>
      <n-button type="primary" :loading="saving" :disabled="!ready" @click="persistGeneratedSettings">
        <template #icon><n-icon><Launch /></n-icon></template>
        <span class="generator-header-action-label">{{ $t("gameSettings.generatorSave") }}</span>
      </n-button>
    </template>

    <section class="performance-settings" aria-labelledby="server-fps-title">
      <div class="performance-copy">
        <div class="performance-heading">
          <h3 id="server-fps-title">{{ $t("gameSettings.fpsTitle") }}</h3>
          <n-tag size="small" :bordered="false" type="info">
            {{ $t("gameSettings.fpsCurrent", { value: loadedFpsRate }) }}
          </n-tag>
        </div>
        <p>{{ $t("gameSettings.fpsDescription") }}</p>
        <small>{{ $t("gameSettings.fpsArmHint") }}</small>
      </div>
      <div class="performance-controls">
        <n-radio-group v-model:value="fpsRate" class="fps-presets" size="small">
          <n-radio-button v-for="option in fpsOptions" :key="option" :value="option">
            {{ option }} FPS
          </n-radio-button>
        </n-radio-group>
        <n-button
          type="primary"
          :loading="fpsSaving"
          :disabled="!fpsDirty || loading"
          @click="persistFpsSettings"
        >
          <template #icon><n-icon><Save /></n-icon></template>
          {{ $t("gameSettings.fpsSave") }}
        </n-button>
      </div>
    </section>

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

.performance-settings {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.performance-copy { min-width: 0; }

.performance-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.performance-heading h3 {
  margin: 0;
  color: var(--app-ink);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
}

.performance-copy p {
  max-width: 65ch;
  margin: 5px 0 0;
  color: var(--app-ink-muted);
  font-size: 12px;
  line-height: 1.55;
}

.performance-copy small {
  display: block;
  margin-top: 5px;
  color: var(--app-ink);
  font-size: 11px;
  line-height: 1.5;
}

.performance-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.fps-presets { display: flex; }

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
  .performance-settings {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }
  .performance-controls {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }
  :deep(.fps-presets.n-radio-group) {
    display: grid !important;
    width: 100%;
    height: auto !important;
    overflow: hidden;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  :deep(.fps-presets .n-radio-button) {
    width: 100%;
    justify-content: center;
    text-align: center;
  }
  :deep(.fps-presets .n-radio-group__splitor) { display: none; }
  :deep(.fps-presets .n-radio-button__state-border) { border-radius: 0; }
  .generator-header-action-label { display: none; }
  .generator-frame-shell { min-height: 820px; }
  .generator-frame { height: 980px; }
  .generator-credit { justify-content: flex-start; }
}
</style>
