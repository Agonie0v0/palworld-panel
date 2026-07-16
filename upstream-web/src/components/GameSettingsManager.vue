<script setup>
import { ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ApiService from "@/service/api";

const props = defineProps({ show: Boolean });
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

const load = async () => {
  loading.value = true;
  try {
    const { data, statusCode } = await api.getPanelStatus();
    if (statusCode.value !== 200) throw new Error(data.value?.error || "Request failed");
    const current = data.value?.config?.settings || {};
    settings.value = { ...current };
    extraRows.value = Object.entries(current)
      .filter(([key]) => !knownKeys.has(key))
      .map(([key, value]) => ({ key, type: inferType(value), value }));
  } catch (error) {
    message.error(`${t("gameSettings.loadFailed")} ${error.message}`);
  } finally {
    loading.value = false;
  }
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
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 94%; max-width: 920px"
    :title="$t('gameSettings.title')"
    @update:show="emit('update:show', $event)"
  >
    <n-spin :show="loading">
      <n-alert type="info" :bordered="false" class="mb-4">
        {{ $t("gameSettings.restartHint") }}
      </n-alert>
      <n-scrollbar style="max-height: 66vh" trigger="none">
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
    <template #footer>
      <n-flex justify="end">
        <n-button @click="emit('update:show', false)">{{ $t("button.cancel") }}</n-button>
        <n-button type="primary" :loading="saving" @click="save">{{ $t("button.save") }}</n-button>
      </n-flex>
    </template>
  </n-modal>
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

@media (max-width: 640px) {
  .advanced-row {
    flex-wrap: wrap !important;
  }

  .type-select {
    width: 100%;
    flex-basis: 100%;
  }
}
</style>
