<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import {
  ArrowsShuffle,
  DeviceFloppy,
  Dna,
  History,
  PlayerPause,
  PlayerPlay,
  Plus,
  Refresh,
  Target,
  Trash,
  X,
} from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";

const props = defineProps({ show: { type: Boolean, default: false }, embedded: { type: Boolean, default: false } });
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const message = useMessage();

const loading = ref(false);
const busy = ref("");
const activeTab = ref("planner");
const pals = ref([]);
const presets = ref([]);
const jobs = ref([]);
const historyRows = ref([]);
const containers = ref([]);
const parentPairs = ref([]);
const plan = ref(null);
const presetName = ref("");
const direct = ref({
  parent1: "",
  parent2: "",
  parent1Gender: "WILDCARD",
  parent2Gender: "WILDCARD",
});
const child = ref(null);
const criteria = ref({
  target: "",
  targetGender: "WILDCARD",
  requiredPassives: "",
  optionalPassives: "",
  minIV: { health: 0, attack: 0, defense: 0 },
  maxSteps: 4,
  maxIterations: 10000,
  threads: 4,
  allowWild: false,
  ignoreIrrelevantPassives: true,
  allowSurgery: false,
  customContainerIds: [],
});
const containerDraft = ref({ name: "", pals: [] });
const palDraft = ref({
  type: "",
  nickname: "",
  gender: "WILDCARD",
  melee: 0,
  ranged: 0,
  defense: 0,
  skills: "",
});
let pollTimer;

const copy = computed(() =>
  locale.value === "zh"
    ? {
        title: "配种实验室",
        subtitle: "PalCalc v1.17.6 数据、存档素材、自定义素材库和可控制任务集中在同一个工作台。",
        planner: "路线规划",
        direct: "双亲速查",
        jobs: "计算任务",
        history: "结果历史",
        materials: "自定义素材",
        target: "目标帕鲁",
        targetGender: "目标性别",
        required: "必须被动",
        optional: "可选被动",
        passiveHint: "用逗号或换行分隔",
        iv: "最低 IV",
        health: "生命",
        attack: "攻击",
        defense: "防御",
        maxSteps: "最多代数",
        iterations: "最大迭代",
        threads: "线程",
        allowWild: "允许野生素材",
        ignoreIrrelevant: "忽略无关词条",
        allowSurgery: "允许手术词条",
        containers: "素材库",
        findParents: "查亲本",
        quickSolve: "立即计算",
        queue: "加入任务队列",
        savePreset: "保存预设",
        presetName: "预设名称",
        presets: "已保存预设",
        noPresets: "暂无预设",
        load: "载入",
        pairs: "亲本组合",
        route: "候选路线",
        noRoute: "指定代数内没有找到路线。",
        owned: "存档已拥有",
        probability: "估算成功率",
        eggs: "估算蛋数",
        time: "估算时间",
        materialsCount: "素材数量",
        matching: "满足筛选",
        parent1: "亲本 A",
        parent2: "亲本 B",
        any: "不限",
        male: "雄性",
        female: "雌性",
        calculate: "计算子代",
        result: "子代",
        status: "状态",
        progress: "进度",
        pause: "暂停",
        resume: "继续",
        cancel: "取消",
        noJobs: "暂无计算任务",
        stale: "存档已变化",
        current: "当前结果",
        noHistory: "暂无历史结果",
        containerName: "素材库名称",
        addPal: "添加帕鲁",
        saveContainer: "保存素材库",
        noContainers: "暂无自定义素材库",
        passives: "被动词条",
        saved: "已保存。",
        queued: "任务已加入队列。",
        removed: "已删除。",
      }
    : {
        title: "Breeding lab",
        subtitle: "PalCalc v1.17.6 data, save materials, custom pools, and controllable jobs in one workspace.",
        planner: "Route planner",
        direct: "Parent lookup",
        jobs: "Solve jobs",
        history: "History",
        materials: "Custom pools",
        target: "Target Pal",
        targetGender: "Target gender",
        required: "Required passives",
        optional: "Optional passives",
        passiveHint: "Separate with commas or new lines",
        iv: "Minimum IV",
        health: "Health",
        attack: "Attack",
        defense: "Defense",
        maxSteps: "Max generations",
        iterations: "Max iterations",
        threads: "Threads",
        allowWild: "Allow wild materials",
        ignoreIrrelevant: "Ignore irrelevant passives",
        allowSurgery: "Allow surgery traits",
        containers: "Material pools",
        findParents: "Find parents",
        quickSolve: "Solve now",
        queue: "Queue solve",
        savePreset: "Save preset",
        presetName: "Preset name",
        presets: "Saved presets",
        noPresets: "No presets",
        load: "Load",
        pairs: "Parent pairs",
        route: "Candidate route",
        noRoute: "No route was found within the generation limit.",
        owned: "Already owned",
        probability: "Estimated success",
        eggs: "Estimated eggs",
        time: "Estimated time",
        materialsCount: "Materials",
        matching: "Matching filters",
        parent1: "Parent A",
        parent2: "Parent B",
        any: "Any",
        male: "Male",
        female: "Female",
        calculate: "Calculate child",
        result: "Child",
        status: "Status",
        progress: "Progress",
        pause: "Pause",
        resume: "Resume",
        cancel: "Cancel",
        noJobs: "No solve jobs",
        stale: "Save changed",
        current: "Current result",
        noHistory: "No result history",
        containerName: "Pool name",
        addPal: "Add Pal",
        saveContainer: "Save pool",
        noContainers: "No custom pools",
        passives: "Passives",
        saved: "Saved.",
        queued: "Solve queued.",
        removed: "Removed.",
      },
);

const result = (response) => response?.data?.value || {};
const fail = (response, fallback) => message.error(result(response).error || fallback);
const palLabel = (pal) => (locale.value === "zh" ? pal?.zh || pal?.name || pal?.internal : pal?.name || pal?.internal);
const palOptions = computed(() =>
  pals.value
    .map((pal) => ({ label: `#${pal.dex}${pal.variant ? "B" : ""} ${palLabel(pal)}`, value: pal.internal }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);
const genderOptions = computed(() => [
  { label: copy.value.any, value: "WILDCARD" },
  { label: copy.value.male, value: "MALE" },
  { label: copy.value.female, value: "FEMALE" },
]);
const containerOptions = computed(() => containers.value.map((row) => ({ label: `${row.name} (${row.pals?.length || 0})`, value: row.id })));
const byInternal = computed(() => new Map(pals.value.map((pal) => [pal.internal, pal])));
const activeJobs = computed(() => jobs.value.filter((job) => ["queued", "running", "paused", "cancelling"].includes(job.status)));
const flattenTree = computed(() => {
  const rows = [];
  const visit = (node, depth = 0) => {
    if (!node?.pal) return;
    rows.push({ ...node, depth });
    if (node.parent1) visit(node.parent1, depth + 1);
    if (node.parent2) visit(node.parent2, depth + 1);
  };
  if (plan.value?.tree) visit(plan.value.tree);
  return rows;
});

const payload = () => ({
  ...criteria.value,
  requiredPassives: criteria.value.requiredPassives,
  optionalPassives: criteria.value.optionalPassives,
});

const loadJobs = async () => {
  const response = await api.getBreedingJobs();
  jobs.value = result(response).jobs || [];
};

const load = async () => {
  loading.value = true;
  try {
    const [catalogResponse, presetResponse, jobsResponse, historyResponse, containersResponse] = await Promise.all([
      api.getBreedingCatalog(),
      api.getBreedingPresets(),
      api.getBreedingJobs(),
      api.getBreedingHistory(),
      api.getBreedingContainers(),
    ]);
    pals.value = result(catalogResponse).pals || [];
    presets.value = result(presetResponse).presets || [];
    jobs.value = result(jobsResponse).jobs || [];
    historyRows.value = result(historyResponse).history || [];
    containers.value = result(containersResponse).containers || [];
  } finally {
    loading.value = false;
  }
};

const calculate = async () => {
  if (!direct.value.parent1 || !direct.value.parent2) return;
  busy.value = "direct";
  try {
    const response = await api.getBreedingResult(direct.value);
    if (response.statusCode?.value >= 400) return fail(response, "Calculation failed");
    child.value = result(response).result?.child || null;
  } finally {
    busy.value = "";
  }
};

const findParents = async () => {
  if (!criteria.value.target) return;
  busy.value = "parents";
  try {
    const response = await api.getBreedingParents(criteria.value.target);
    parentPairs.value = result(response).parents || [];
  } finally {
    busy.value = "";
  }
};

const solve = async () => {
  if (!criteria.value.target) return;
  busy.value = "solve";
  try {
    const response = await api.solveBreeding(payload());
    if (response.statusCode?.value >= 400) return fail(response, "Solve failed");
    plan.value = result(response).result || null;
  } finally {
    busy.value = "";
  }
};

const queueSolve = async () => {
  if (!criteria.value.target) return;
  busy.value = "queue";
  try {
    const response = await api.createBreedingJob(payload());
    if (response.statusCode?.value >= 400) return fail(response, "Queue failed");
    await loadJobs();
    activeTab.value = "jobs";
    message.success(copy.value.queued);
  } finally {
    busy.value = "";
  }
};

const controlJob = async (job, action) => {
  busy.value = `${action}:${job.id}`;
  try {
    const response = await api.controlBreedingJob(job.id, action);
    if (response.statusCode?.value >= 400) return fail(response, "Job action failed");
    await loadJobs();
  } finally {
    busy.value = "";
  }
};

const savePreset = async () => {
  if (!criteria.value.target) return;
  const response = await api.saveBreedingPreset({
    ...payload(),
    name: presetName.value || palLabel(byInternal.value.get(criteria.value.target)),
  });
  presets.value = result(response).presets || presets.value;
  presetName.value = "";
  message.success(copy.value.saved);
};

const loadPreset = async (preset) => {
  criteria.value = {
    ...criteria.value,
    ...preset,
    minIV: { ...criteria.value.minIV, ...(preset.minIV || {}) },
    requiredPassives: (preset.requiredPassives || []).join?.(", ") || preset.requiredPassives || "",
    optionalPassives: (preset.optionalPassives || []).join?.(", ") || preset.optionalPassives || "",
  };
  activeTab.value = "planner";
};

const removePreset = async (id) => {
  const response = await api.deleteBreedingPreset(id);
  presets.value = result(response).presets || [];
  message.success(copy.value.removed);
};

const addPal = () => {
  if (!palDraft.value.type) return;
  containerDraft.value.pals.push({ ...palDraft.value, id: crypto?.randomUUID?.() || `${Date.now()}` });
  palDraft.value = { type: "", nickname: "", gender: "WILDCARD", melee: 0, ranged: 0, defense: 0, skills: "" };
};

const saveContainer = async () => {
  if (!containerDraft.value.name || !containerDraft.value.pals.length) return;
  busy.value = "container";
  try {
    const response = await api.saveBreedingContainer(containerDraft.value);
    if (response.statusCode?.value >= 400) return fail(response, "Save failed");
    containers.value = result(response).containers || containers.value;
    containerDraft.value = { name: "", pals: [] };
    message.success(copy.value.saved);
  } finally {
    busy.value = "";
  }
};

const removeContainer = async (id) => {
  const response = await api.deleteBreedingContainer(id);
  containers.value = result(response).containers || [];
  criteria.value.customContainerIds = criteria.value.customContainerIds.filter((value) => value !== id);
  message.success(copy.value.removed);
};

const useHistory = (row) => {
  plan.value = row.result;
  if (row.input) loadPreset(row.input);
  activeTab.value = "planner";
};

watch(
  () => props.show,
  (show) => {
    clearInterval(pollTimer);
    if (show) {
      load();
      pollTimer = setInterval(() => {
        if (activeJobs.value.length) loadJobs();
      }, 1500);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(pollTimer));
</script>

<template>
  <tool-surface :show="show" class="breeding-modal" :title="copy.title" width="min(94vw, 1180px)" :embedded="embedded" @update:show="emit('update:show', $event)">
    <template #header-extra>
      <n-button quaternary circle :loading="loading" :aria-label="copy.title" @click="load"><template #icon><n-icon><Refresh /></n-icon></template></n-button>
    </template>
    <p class="manager-intro">{{ copy.subtitle }}</p>
    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="planner" :tab="copy.planner">
        <div class="planner-layout">
          <section class="criteria-panel">
            <div class="section-heading"><strong>{{ copy.target }}</strong><span>PalCalc 1.17.6</span></div>
            <n-select v-model:value="criteria.target" filterable :options="palOptions" :placeholder="copy.target" />
            <div class="field-grid field-grid--2">
              <n-form-item :label="copy.targetGender"><n-select v-model:value="criteria.targetGender" :options="genderOptions" /></n-form-item>
              <n-form-item :label="copy.containers"><n-select v-model:value="criteria.customContainerIds" multiple clearable :options="containerOptions" /></n-form-item>
            </div>
            <div class="field-grid field-grid--2">
              <n-form-item :label="copy.required"><n-input v-model:value="criteria.requiredPassives" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" :placeholder="copy.passiveHint" /></n-form-item>
              <n-form-item :label="copy.optional"><n-input v-model:value="criteria.optionalPassives" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" :placeholder="copy.passiveHint" /></n-form-item>
            </div>
            <div class="iv-band">
              <strong>{{ copy.iv }}</strong>
              <n-input-number v-model:value="criteria.minIV.health" :min="0" :max="100"><template #prefix>{{ copy.health }}</template></n-input-number>
              <n-input-number v-model:value="criteria.minIV.attack" :min="0" :max="100"><template #prefix>{{ copy.attack }}</template></n-input-number>
              <n-input-number v-model:value="criteria.minIV.defense" :min="0" :max="100"><template #prefix>{{ copy.defense }}</template></n-input-number>
            </div>
            <div class="field-grid field-grid--3">
              <n-form-item :label="copy.maxSteps"><n-input-number v-model:value="criteria.maxSteps" :min="1" :max="8" /></n-form-item>
              <n-form-item :label="copy.iterations"><n-input-number v-model:value="criteria.maxIterations" :min="100" :max="500000" :step="1000" /></n-form-item>
              <n-form-item :label="copy.threads"><n-input-number v-model:value="criteria.threads" :min="1" :max="32" /></n-form-item>
            </div>
            <div class="switch-row">
              <n-checkbox v-model:checked="criteria.allowWild">{{ copy.allowWild }}</n-checkbox>
              <n-checkbox v-model:checked="criteria.ignoreIrrelevantPassives">{{ copy.ignoreIrrelevant }}</n-checkbox>
              <n-checkbox v-model:checked="criteria.allowSurgery">{{ copy.allowSurgery }}</n-checkbox>
            </div>
            <div class="planner-actions">
              <n-button :loading="busy === 'parents'" @click="findParents"><template #icon><n-icon><ArrowsShuffle /></n-icon></template>{{ copy.findParents }}</n-button>
              <n-button :loading="busy === 'solve'" @click="solve"><template #icon><n-icon><Target /></n-icon></template>{{ copy.quickSolve }}</n-button>
              <n-button type="primary" :loading="busy === 'queue'" @click="queueSolve"><template #icon><n-icon><Dna /></n-icon></template>{{ copy.queue }}</n-button>
            </div>
            <div class="preset-band">
              <n-input v-model:value="presetName" :placeholder="copy.presetName" />
              <n-button :disabled="!criteria.target" @click="savePreset"><template #icon><n-icon><DeviceFloppy /></n-icon></template>{{ copy.savePreset }}</n-button>
            </div>
            <div class="preset-strip">
              <n-empty v-if="presets.length === 0" size="small" :description="copy.noPresets" />
              <article v-for="preset in presets" :key="preset.id">
                <button type="button" @click="loadPreset(preset)"><strong>{{ preset.name }}</strong><span>{{ palLabel(byInternal.get(preset.target) || { internal: preset.target }) }}</span></button>
                <n-button quaternary circle size="small" type="error" @click="removePreset(preset.id)"><template #icon><n-icon><Trash /></n-icon></template></n-button>
              </article>
            </div>
          </section>

          <section class="result-panel">
            <div class="result-summary" v-if="plan">
              <div><span>{{ copy.materialsCount }}</span><strong>{{ plan.materialCount ?? "-" }}</strong></div>
              <div><span>{{ copy.matching }}</span><strong>{{ plan.matchingMaterialCount ?? "-" }}</strong></div>
              <div><span>{{ copy.probability }}</span><strong>{{ plan.probability ? `${Math.round(plan.probability * 100)}%` : "-" }}</strong></div>
              <div><span>{{ copy.eggs }}</span><strong>{{ plan.estimatedEggs ?? "-" }}</strong></div>
              <div><span>{{ copy.time }}</span><strong>{{ plan.estimatedMinutes ? `${plan.estimatedMinutes} min` : "-" }}</strong></div>
            </div>
            <div class="split-results">
              <div>
                <div class="section-heading"><strong>{{ copy.pairs }}</strong><span>{{ parentPairs.length }}</span></div>
                <div class="pair-list">
                  <article v-for="(pair, index) in parentPairs" :key="index"><strong>{{ palLabel(pair.parent1) }}</strong><n-icon><ArrowsShuffle /></n-icon><strong>{{ palLabel(pair.parent2) }}</strong></article>
                  <n-empty v-if="parentPairs.length === 0" size="small" :description="copy.findParents" />
                </div>
              </div>
              <div>
                <div class="section-heading"><strong>{{ copy.route }}</strong><span>{{ plan?.steps ?? "-" }}</span></div>
                <n-empty v-if="plan && !plan.owned && !plan.tree" :description="copy.noRoute" />
                <div class="plan-tree">
                  <article v-for="(row, index) in flattenTree" :key="index" :style="{ paddingLeft: `${row.depth * 18}px` }">
                    <strong>{{ palLabel(row.pal) }}</strong><n-tag v-if="row.owned" size="small" type="success">{{ copy.owned }}</n-tag><n-tag v-else size="small">{{ row.step }}</n-tag>
                  </article>
                </div>
              </div>
            </div>
          </section>
        </div>
      </n-tab-pane>

      <n-tab-pane name="direct" :tab="copy.direct">
        <div class="parent-grid">
          <section><strong>{{ copy.parent1 }}</strong><n-select v-model:value="direct.parent1" filterable :options="palOptions" /><n-select v-model:value="direct.parent1Gender" :options="genderOptions" /></section>
          <n-icon class="breeding-symbol"><ArrowsShuffle /></n-icon>
          <section><strong>{{ copy.parent2 }}</strong><n-select v-model:value="direct.parent2" filterable :options="palOptions" /><n-select v-model:value="direct.parent2Gender" :options="genderOptions" /></section>
        </div>
        <div class="center-actions"><n-button type="primary" :loading="busy === 'direct'" @click="calculate"><template #icon><n-icon><Dna /></n-icon></template>{{ copy.calculate }}</n-button></div>
        <div v-if="child" class="child-result"><span>{{ copy.result }}</span><strong>{{ palLabel(child) }}</strong><small>{{ child.internal }} · #{{ child.dex }}{{ child.variant ? "B" : "" }}</small></div>
      </n-tab-pane>

      <n-tab-pane name="jobs" :tab="`${copy.jobs} (${activeJobs.length})`">
        <n-empty v-if="jobs.length === 0" :description="copy.noJobs" />
        <div class="job-list">
          <article v-for="job in jobs" :key="job.id">
            <div class="job-head"><div><strong>{{ palLabel(byInternal.get(job.input?.target) || { internal: job.input?.target }) }}</strong><span>{{ new Date(job.createdAt).toLocaleString() }}</span></div><n-tag size="small" :type="job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : job.status === 'paused' ? 'warning' : 'info'">{{ job.status }}</n-tag></div>
            <n-progress type="line" :percentage="job.progress || 0" :show-indicator="false" />
            <div class="job-foot"><span>{{ job.message }}<template v-if="job.error"> · {{ job.error }}</template></span><div>
              <n-button v-if="job.status === 'running' || job.status === 'queued'" size="small" :loading="busy === `pause:${job.id}`" @click="controlJob(job, 'pause')"><template #icon><n-icon><PlayerPause /></n-icon></template>{{ copy.pause }}</n-button>
              <n-button v-if="job.status === 'paused'" size="small" :loading="busy === `resume:${job.id}`" @click="controlJob(job, 'resume')"><template #icon><n-icon><PlayerPlay /></n-icon></template>{{ copy.resume }}</n-button>
              <n-button v-if="['queued','running','paused'].includes(job.status)" size="small" type="error" secondary :loading="busy === `cancel:${job.id}`" @click="controlJob(job, 'cancel')"><template #icon><n-icon><X /></n-icon></template>{{ copy.cancel }}</n-button>
            </div></div>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="history" :tab="copy.history">
        <n-empty v-if="historyRows.length === 0" :description="copy.noHistory" />
        <div class="history-list">
          <article v-for="row in historyRows" :key="row.id">
            <div><strong>{{ palLabel(byInternal.get(row.input?.target) || { internal: row.input?.target }) }}</strong><p>{{ new Date(row.updatedAt || row.createdAt).toLocaleString() }} · {{ row.result?.steps ?? "-" }} {{ copy.maxSteps }}</p></div>
            <n-tag v-if="row.stale" size="small" type="warning">{{ copy.stale }}</n-tag>
            <n-button size="small" @click="useHistory(row)"><template #icon><n-icon><History /></n-icon></template>{{ copy.load }}</n-button>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="materials" :tab="copy.materials">
        <div class="materials-layout">
          <section>
            <n-form-item :label="copy.containerName"><n-input v-model:value="containerDraft.name" /></n-form-item>
            <div class="pal-entry-grid">
              <n-select v-model:value="palDraft.type" filterable :options="palOptions" :placeholder="copy.target" />
              <n-select v-model:value="palDraft.gender" :options="genderOptions" />
              <n-input v-model:value="palDraft.nickname" :placeholder="locale === 'zh' ? '备注名' : 'Nickname'" />
              <n-input-number v-model:value="palDraft.melee" :min="0" :max="100"><template #prefix>{{ copy.health }}</template></n-input-number>
              <n-input-number v-model:value="palDraft.ranged" :min="0" :max="100"><template #prefix>{{ copy.attack }}</template></n-input-number>
              <n-input-number v-model:value="palDraft.defense" :min="0" :max="100"><template #prefix>{{ copy.defense }}</template></n-input-number>
              <n-input v-model:value="palDraft.skills" :placeholder="copy.passives" />
              <n-button type="primary" secondary @click="addPal"><template #icon><n-icon><Plus /></n-icon></template>{{ copy.addPal }}</n-button>
            </div>
            <div class="draft-list"><article v-for="(pal, index) in containerDraft.pals" :key="pal.id"><div><strong>{{ palLabel(byInternal.get(pal.type) || { internal: pal.type }) }}</strong><span>{{ pal.skills || "-" }}</span></div><n-button quaternary circle size="small" @click="containerDraft.pals.splice(index, 1)"><template #icon><n-icon><X /></n-icon></template></n-button></article></div>
            <div class="right-actions"><n-button type="primary" :disabled="!containerDraft.name || !containerDraft.pals.length" :loading="busy === 'container'" @click="saveContainer"><template #icon><n-icon><DeviceFloppy /></n-icon></template>{{ copy.saveContainer }}</n-button></div>
          </section>
          <section>
            <n-empty v-if="containers.length === 0" :description="copy.noContainers" />
            <div class="container-list"><article v-for="container in containers" :key="container.id"><div><strong>{{ container.name }}</strong><span>{{ container.pals?.length || 0 }} Pals</span></div><n-button quaternary circle type="error" @click="removeContainer(container.id)"><template #icon><n-icon><Trash /></n-icon></template></n-button></article></div>
          </section>
        </div>
      </n-tab-pane>
    </n-tabs>
  </tool-surface>
</template>

<style scoped>
:global(.breeding-modal) { width: min(1380px, 96vw); }
.manager-intro { margin: 0 0 16px; color: var(--app-ink-muted); font-size: 13px; }
.planner-layout { display: grid; grid-template-columns: minmax(420px, .85fr) minmax(520px, 1.15fr); gap: 28px; }
.criteria-panel, .result-panel { min-width: 0; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.section-heading strong { color: var(--app-ink); font-size: 14px; }
.section-heading span { color: var(--app-ink-muted); font-family: var(--app-font-data); font-size: 12px; }
.field-grid { display: grid; gap: 12px; }
.field-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.iv-band { display: grid; grid-template-columns: auto repeat(3, minmax(0, 1fr)); align-items: center; gap: 8px; padding: 12px 0 16px; border-top: 1px solid var(--app-border); border-bottom: 1px solid var(--app-border); }
.iv-band strong { margin-right: 4px; font-size: 13px; }
.switch-row { display: flex; flex-wrap: wrap; gap: 12px 20px; padding: 2px 0 16px; }
.planner-actions, .center-actions, .right-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.preset-band { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-top: 14px; }
.preset-strip { display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; padding-bottom: 4px; }
.preset-strip article { display: flex; min-width: 180px; align-items: center; border: 1px solid var(--app-border); border-radius: 7px; }
.preset-strip article > button:first-child { display: grid; min-width: 0; flex: 1; gap: 2px; padding: 8px 10px; color: var(--app-ink); background: transparent; border: 0; cursor: pointer; text-align: left; }
.preset-strip span { overflow: hidden; color: var(--app-ink-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.result-summary { display: grid; grid-template-columns: repeat(5, 1fr); margin-bottom: 18px; border-top: 1px solid var(--app-border); border-bottom: 1px solid var(--app-border); }
.result-summary div { display: grid; gap: 4px; padding: 12px; border-right: 1px solid var(--app-border); }
.result-summary div:last-child { border-right: 0; }
.result-summary span { color: var(--app-ink-muted); font-size: 11px; }
.result-summary strong { font-family: var(--app-font-data); font-size: 14px; }
.split-results { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 24px; }
.pair-list, .plan-tree { max-height: 520px; overflow: auto; border-top: 1px solid var(--app-border); }
.pair-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; min-height: 42px; border-bottom: 1px solid var(--app-border); font-size: 12px; }
.pair-list article strong:last-child { text-align: right; }
.plan-tree article { display: flex; min-height: 42px; align-items: center; gap: 8px; border-bottom: 1px solid var(--app-border); }
.parent-grid { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; max-width: 900px; margin: 28px auto 20px; }
.parent-grid section { display: grid; gap: 10px; }
.breeding-symbol { color: var(--app-accent); font-size: 34px; }
.child-result { display: grid; justify-items: center; gap: 4px; margin-top: 20px; padding: 20px; border-top: 1px solid var(--app-border); }
.child-result span, .child-result small { color: var(--app-ink-muted); }
.child-result strong { color: var(--app-accent); font-size: 24px; }
.job-list, .history-list, .container-list, .draft-list { display: grid; }
.job-list > article { display: grid; gap: 10px; padding: 14px 0; border-bottom: 1px solid var(--app-border); }
.job-head, .job-foot, .history-list article, .container-list article, .draft-list article { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.job-head > div, .history-list article > div, .container-list article > div, .draft-list article > div { display: grid; min-width: 0; gap: 2px; }
.job-head span, .job-foot > span, .history-list p, .container-list span, .draft-list span { color: var(--app-ink-muted); font-size: 12px; }
.job-foot > div { display: flex; gap: 6px; }
.history-list article, .container-list article, .draft-list article { min-height: 58px; border-bottom: 1px solid var(--app-border); }
.materials-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr); gap: 28px; }
.pal-entry-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.pal-entry-grid > :first-child, .pal-entry-grid > :nth-child(7) { grid-column: span 2; }
.right-actions { margin-top: 14px; }
@media (max-width: 1050px) {
  .planner-layout, .materials-layout { grid-template-columns: 1fr; }
  .result-summary { grid-template-columns: repeat(3, 1fr); }
  .split-results { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  :global(.breeding-modal) { width: 100vw; max-width: 100vw; }
  :global(.breeding-modal .n-tabs-nav--segment-type) { overflow-x: auto; }
  :global(.breeding-modal .n-tabs) { min-width: 0; max-width: 100%; overflow-x: hidden; }
  :global(.breeding-modal .n-tabs-rail) { width: max-content; min-width: 100%; }
  :global(.breeding-modal .n-tabs-capsule) { width: auto; flex: 0 0 auto; }
  :global(.breeding-modal .n-tabs-tab) { min-width: 104px; padding-inline: 12px; }
  .field-grid--2, .field-grid--3, .parent-grid, .pal-entry-grid { grid-template-columns: 1fr; }
  .iv-band { grid-template-columns: 1fr; }
  .result-summary { grid-template-columns: repeat(2, 1fr); }
  .preset-band { grid-template-columns: 1fr; }
  .parent-grid { margin-top: 12px; }
  .breeding-symbol { margin: 0 auto; transform: rotate(90deg); }
  .pal-entry-grid > :first-child, .pal-entry-grid > :nth-child(7) { grid-column: auto; }
  .job-foot { align-items: flex-start; flex-direction: column; }
}
</style>
