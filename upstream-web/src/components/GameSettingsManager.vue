<script setup>
import { computed, ref, watch } from "vue";
import { DocumentImport } from "@vicons/carbon";
import { useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";
import {
  formatPalworldSetting,
  parsePalworldSettings,
} from "@/utils/palworldSettings";

const props = defineProps({ show: Boolean, embedded: { type: Boolean, default: false } });
const emit = defineEmits(["update:show", "saved"]);
const { t } = useI18n();
const message = useMessage();
const api = new ApiService();

const knownKeys = new Set([
  "ServerName",
  "ServerDescription",
  "AdminPassword",
  "ServerPassword",
  "PublicPort",
  "RCONEnabled",
  "RCONPort",
  "RESTAPIEnabled",
  "RESTAPIPort",
  "Difficulty",
  "DayTimeSpeedRate",
  "NightTimeSpeedRate",
  "ExpRate",
  "PalCaptureRate",
  "DeathPenalty",
]);

const settings = ref({});
const extraRows = ref([]);
const loading = ref(false);
const saving = ref(false);
const importVisible = ref(false);
const importText = ref("");
const importResult = ref(null);
const importError = ref("");

const difficultyOptions = [
  { label: "None", value: "None" },
  { label: "Normal", value: "Normal" },
  { label: "Hard", value: "Hard" },
];

const deathPenaltyOptions = [
  { label: "None", value: "None" },
  { label: "Item", value: "Item" },
  { label: "ItemAndEquipment", value: "ItemAndEquipment" },
  { label: "All", value: "All" },
];

const typeOptions = () => [
  { label: t("gameSettings.string"), value: "string" },
  { label: t("gameSettings.number"), value: "number" },
  { label: t("gameSettings.boolean"), value: "boolean" },
];

const inferType = (value) => {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
};

const assignSettings = (current) => {
  settings.value = { ...current };
  extraRows.value = Object.entries(current)
    .filter(([key]) => !knownKeys.has(key))
    .map(([key, value]) => ({ key, type: inferType(value), value }));
};

const load = async () => {
  loading.value = true;
  try {
    const { data, statusCode } = await api.getPanelStatus();
    if (statusCode.value !== 200) throw new Error(data.value?.error || "Request failed");
    const current = data.value?.config?.settings || {};
    assignSettings(current);
  } catch (error) {
    message.error(`${t("gameSettings.loadFailed")} ${error.message}`);
  } finally {
    loading.value = false;
  }
};

const sensitiveKey = (key) => /password|token|secret/i.test(key);
const previewValue = (key, value) => {
  if (sensitiveKey(key) && String(value ?? "")) return "••••••••";
  const formatted = formatPalworldSetting(value);
  return formatted || t("gameSettings.emptyValue");
};

const importRows = computed(() =>
  (importResult.value?.entries || []).map((entry) => {
    const exists = Object.prototype.hasOwnProperty.call(settings.value, entry.key);
    const current = settings.value[entry.key];
    const status = !exists
      ? "added"
      : Object.is(current, entry.value)
        ? "unchanged"
        : "changed";
    return {
      ...entry,
      status,
      current: exists ? previewValue(entry.key, current) : t("gameSettings.notSet"),
      imported: previewValue(entry.key, entry.value),
    };
  }),
);

const importSummary = computed(() => ({
  total: importRows.value.length,
  changed: importRows.value.filter((row) => row.status === "changed").length,
  added: importRows.value.filter((row) => row.status === "added").length,
  unchanged: importRows.value.filter((row) => row.status === "unchanged").length,
}));

const parseImport = () => {
  importError.value = "";
  importResult.value = null;
  if (!importText.value.trim()) return;
  try {
    importResult.value = parsePalworldSettings(importText.value);
  } catch (error) {
    const knownErrors = new Set([
      "empty",
      "unclosed",
      "unclosedQuote",
      "missingOptionSettings",
      "invalidAssignment",
      "invalidKey",
    ]);
    importError.value = t(
      `gameSettings.importError.${knownErrors.has(error.message) ? error.message : "unknown"}`,
    );
  }
};

const openImport = () => {
  importText.value = "";
  importResult.value = null;
  importError.value = "";
  importVisible.value = true;
};

const applyImport = () => {
  if (!importResult.value) return;
  assignSettings({ ...settings.value, ...importResult.value.settings });
  const count = importResult.value.entries.length;
  importVisible.value = false;
  message.success(t("gameSettings.importApplied", { count }));
};

const createExtra = () => ({ key: "", type: "string", value: "" });

const normalizedExtraValue = (row) => {
  if (row.type === "boolean") return Boolean(row.value);
  if (row.type === "number") return Number(row.value || 0);
  return String(row.value ?? "");
};

const save = async () => {
  const keys = extraRows.value.map((row) => row.key.trim()).filter(Boolean);
  if (new Set(keys).size !== keys.length || keys.some((key) => knownKeys.has(key))) {
    message.error(t("gameSettings.duplicateKey"));
    return;
  }
  saving.value = true;
  try {
    const next = {};
    for (const key of knownKeys) {
      if (settings.value[key] !== undefined) next[key] = settings.value[key];
    }
    for (const row of extraRows.value) {
      const key = row.key.trim();
      if (key) next[key] = normalizedExtraValue(row);
    }
    const { data, statusCode } = await api.updateGameSettings(next);
    if (statusCode.value !== 200) throw new Error(data.value?.error || "Request failed");
    settings.value = { ...data.value.settings };
    message.success(t("gameSettings.saved"));
    emit("saved", settings.value);
    emit("update:show", false);
  } catch (error) {
    message.error(`${t("gameSettings.saveFailed")} ${error.message}`);
  } finally {
    saving.value = false;
  }
};

watch(() => props.show, (show) => show && load(), { immediate: true });
watch(importText, parseImport);
</script>

<template>
  <tool-surface
    :show="show"
    :title="$t('gameSettings.title')"
    width="min(94vw, 920px)"
    :embedded="embedded"
    @update:show="emit('update:show', $event)"
  >
    <n-spin :show="loading">
      <n-alert type="info" :bordered="false" class="mb-4">
        {{ $t("gameSettings.restartHint") }}
      </n-alert>
      <n-scrollbar :style="embedded ? undefined : 'max-height: 66vh'" trigger="none">
        <n-form label-placement="top" class="pr-3">
          <n-collapse :default-expanded-names="['basic', 'network', 'rates']">
            <n-collapse-item :title="$t('gameSettings.basic')" name="basic">
              <n-grid cols="1 720:2" :x-gap="16">
                <n-form-item-gi :label="$t('gameSettings.serverName')">
                  <n-input v-model:value="settings.ServerName" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.description')">
                  <n-input v-model:value="settings.ServerDescription" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.adminPassword')">
                  <n-input v-model:value="settings.AdminPassword" type="password" show-password-on="click" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.serverPassword')">
                  <n-input v-model:value="settings.ServerPassword" type="password" show-password-on="click" />
                </n-form-item-gi>
              </n-grid>
            </n-collapse-item>

            <n-collapse-item :title="$t('gameSettings.network')" name="network">
              <n-grid cols="1 720:3" :x-gap="16">
                <n-form-item-gi :label="$t('gameSettings.publicPort')">
                  <n-input-number v-model:value="settings.PublicPort" :min="1" :max="65535" class="w-full" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.rconPort')">
                  <n-input-number v-model:value="settings.RCONPort" :min="1" :max="65535" class="w-full" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.restPort')">
                  <n-input-number v-model:value="settings.RESTAPIPort" :min="1" :max="65535" class="w-full" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.rconEnabled')">
                  <n-switch v-model:value="settings.RCONEnabled" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.restEnabled')">
                  <n-switch v-model:value="settings.RESTAPIEnabled" />
                </n-form-item-gi>
              </n-grid>
            </n-collapse-item>

            <n-collapse-item :title="$t('gameSettings.world')" name="world">
              <n-grid cols="1 720:2" :x-gap="16">
                <n-form-item-gi :label="$t('gameSettings.difficulty')">
                  <n-select v-model:value="settings.Difficulty" :options="difficultyOptions" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.deathPenalty')">
                  <n-select v-model:value="settings.DeathPenalty" :options="deathPenaltyOptions" />
                </n-form-item-gi>
              </n-grid>
            </n-collapse-item>

            <n-collapse-item :title="$t('gameSettings.rates')" name="rates">
              <n-grid cols="1 560:2 820:3" :x-gap="16">
                <n-form-item-gi :label="$t('gameSettings.dayRate')">
                  <n-input-number v-model:value="settings.DayTimeSpeedRate" :min="0.1" :step="0.1" class="w-full" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.nightRate')">
                  <n-input-number v-model:value="settings.NightTimeSpeedRate" :min="0.1" :step="0.1" class="w-full" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.expRate')">
                  <n-input-number v-model:value="settings.ExpRate" :min="0.1" :step="0.1" class="w-full" />
                </n-form-item-gi>
                <n-form-item-gi :label="$t('gameSettings.captureRate')">
                  <n-input-number v-model:value="settings.PalCaptureRate" :min="0.1" :step="0.1" class="w-full" />
                </n-form-item-gi>
              </n-grid>
            </n-collapse-item>

            <n-collapse-item :title="$t('gameSettings.advanced')" name="advanced">
              <n-text depth="3" class="block mb-3">{{ $t("gameSettings.advancedHint") }}</n-text>
              <n-dynamic-input v-model:value="extraRows" :on-create="createExtra">
                <template #default="{ value }">
                  <n-flex :wrap="false" class="advanced-row">
                    <n-input v-model:value="value.key" :placeholder="$t('gameSettings.key')" />
                    <n-select v-model:value="value.type" :options="typeOptions()" class="type-select" />
                    <n-switch v-if="value.type === 'boolean'" v-model:value="value.value" class="boolean-value" />
                    <n-input-number v-else-if="value.type === 'number'" v-model:value="value.value" class="value-input" />
                    <n-input v-else v-model:value="value.value" :placeholder="$t('gameSettings.value')" />
                  </n-flex>
                </template>
              </n-dynamic-input>
            </n-collapse-item>
          </n-collapse>
        </n-form>
      </n-scrollbar>
    </n-spin>
    <div class="settings-footer">
      <n-flex justify="space-between" align="center" class="settings-footer">
        <n-button secondary @click="openImport">
          <template #icon><n-icon><DocumentImport /></n-icon></template>
          {{ $t("gameSettings.importConfig") }}
        </n-button>
        <n-flex>
          <n-button @click="emit('update:show', false)">{{ $t("button.cancel") }}</n-button>
          <n-button type="primary" :loading="saving" @click="save">{{ $t("button.save") }}</n-button>
        </n-flex>
      </n-flex>
    </div>
  </tool-surface>

  <n-drawer
    v-model:show="importVisible"
    placement="right"
    width="min(620px, 100vw)"
    :mask-closable="false"
  >
    <n-drawer-content :title="$t('gameSettings.importTitle')" closable>
      <n-space vertical :size="16">
        <n-alert type="info" :bordered="false">
          {{ $t("gameSettings.importMergeHint") }}
        </n-alert>
        <n-input
          v-model:value="importText"
          type="textarea"
          :autosize="{ minRows: 8, maxRows: 14 }"
          :placeholder="$t('gameSettings.importPlaceholder')"
          class="import-input"
        />
        <n-alert v-if="importError" type="error" :title="$t('gameSettings.importFailed')">
          {{ importError }}
        </n-alert>
        <template v-if="importResult">
          <n-alert
            v-if="importResult.duplicateKeys.length"
            type="warning"
            :title="$t('gameSettings.duplicateImportTitle')"
          >
            {{ importResult.duplicateKeys.join(", ") }}
          </n-alert>
          <n-flex align="center" :wrap="true" class="import-summary">
            <n-text strong>
              {{ $t("gameSettings.importDetected", { count: importSummary.total }) }}
            </n-text>
            <n-tag size="small" type="warning">
              {{ $t("gameSettings.importChanged", { count: importSummary.changed }) }}
            </n-tag>
            <n-tag size="small" type="success">
              {{ $t("gameSettings.importAdded", { count: importSummary.added }) }}
            </n-tag>
            <n-tag size="small">
              {{ $t("gameSettings.importUnchanged", { count: importSummary.unchanged }) }}
            </n-tag>
          </n-flex>
          <div class="import-preview" role="table" :aria-label="$t('gameSettings.importPreview')">
            <div class="import-preview-header" role="row">
              <span role="columnheader">{{ $t("gameSettings.key") }}</span>
              <span role="columnheader">{{ $t("gameSettings.currentValue") }}</span>
              <span role="columnheader">{{ $t("gameSettings.importedValue") }}</span>
            </div>
            <div v-for="row in importRows" :key="row.key" class="import-preview-row" role="row">
              <code role="cell" :data-label="$t('gameSettings.key')">{{ row.key }}</code>
              <span role="cell" class="preview-value" :data-label="$t('gameSettings.currentValue')">
                {{ row.current }}
              </span>
              <span
                role="cell"
                class="preview-value"
                :class="`is-${row.status}`"
                :data-label="$t('gameSettings.importedValue')"
              >
                {{ row.imported }}
              </span>
            </div>
          </div>
        </template>
      </n-space>
      <template #footer>
        <n-flex justify="end">
          <n-button @click="importVisible = false">{{ $t("button.cancel") }}</n-button>
          <n-button type="primary" :disabled="!importResult" @click="applyImport">
            {{ $t("gameSettings.applyImport") }}
          </n-button>
        </n-flex>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.advanced-row {
  width: 100%;
  align-items: center;
}

.type-select {
  width: 132px;
  flex: 0 0 132px;
}

.value-input {
  width: 100%;
}

.boolean-value {
  min-width: 52px;
}

.settings-footer {
  width: 100%;
}

.import-input :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  line-height: 1.55;
}

.import-summary {
  min-height: 28px;
}

.import-preview {
  overflow: auto;
  max-height: 42vh;
  border-block: 1px solid var(--n-border-color);
}

.import-preview-header,
.import-preview-row {
  display: grid;
  grid-template-columns: minmax(170px, 1.2fr) minmax(150px, 1fr) minmax(150px, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 560px;
  padding: 10px 4px;
}

.import-preview-header {
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--n-text-color-2);
  font-size: 12px;
  font-weight: 600;
  background: var(--n-color);
  border-bottom: 1px solid var(--n-border-color);
}

.import-preview-row + .import-preview-row {
  border-top: 1px solid var(--n-divider-color);
}

.import-preview-row code,
.preview-value {
  overflow-wrap: anywhere;
}

.preview-value {
  color: var(--n-text-color-2);
}

.preview-value.is-added,
.preview-value.is-changed {
  color: var(--n-text-color-1);
  font-weight: 600;
}

@media (max-width: 640px) {
  .settings-footer {
    align-items: stretch !important;
  }

  .settings-footer > :last-child {
    margin-left: auto;
  }

  .advanced-row {
    flex-wrap: wrap !important;
  }

  .type-select {
    width: 100%;
    flex-basis: 100%;
  }

  .import-preview-header {
    display: none;
  }

  .import-preview {
    max-height: none;
    overflow: visible;
  }

  .import-preview-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-width: 0;
    gap: 10px 14px;
    padding: 12px 4px;
  }

  .import-preview-row code {
    grid-column: 1 / -1;
  }

  .import-preview-row [data-label] {
    display: block;
    min-width: 0;
  }

  .import-preview-row [data-label]::before {
    display: block;
    margin-bottom: 4px;
    color: var(--n-text-color-3);
    font-family: var(--n-font-family);
    font-size: 12px;
    font-weight: 400;
    content: attr(data-label);
  }
}
</style>
