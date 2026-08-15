<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, X } from "@vicons/tabler";
import PalPassiveBadge from "@/components/PalPassiveBadge.vue";
import PalWorkBadge from "@/components/PalWorkBadge.vue";
import unknownPal from "@/assets/pals/unknown.png";
import { palPortrait } from "@/utils/gameData";

const props = defineProps({
  pal: { type: Object, required: true },
  show: { type: Boolean, default: true },
  context: { type: String, default: "archive" },
});
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();

const asArray = (value) => (Array.isArray(value) ? value : []);
const arrayValue = (value) => value == null || value === "" ? [] : (Array.isArray(value) ? value : [value]);
const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
const numberOrNull = (...values) => {
  const value = firstValue(...values);
  return value === undefined ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
};
const humanize = (value) => String(value || "")
  .replace(/^EPalWorkSuitability::/i, "")
  .replace(/^PalWorkDef_/i, "")
  .replace(/_/g, " ")
  .trim();

const zh = computed(() => String(locale.value).toLowerCase().startsWith("zh"));
const descriptionExpanded = ref(false);
// Desktop keeps the species pane visible; on narrow screens it starts
// collapsed so the save-specific facts remain the primary content.
const speciesExpanded = ref(false);
const copied = ref(false);
const copy = computed(() => zh.value ? {
  title: "帕鲁详情", close: "关闭帕鲁详情", individual: "存档个体", species: "物种图鉴",
  level: "等级", exp: "经验值", gender: "性别", stars: "凝结星级", owner: "归属", location: "位置", status: "当前状态",
  hp: "生命值", maxHpUnavailable: "最大生命值未在存档中持久化", hunger: "饱食度", sanity: "SAN", sickness: "异常状态", healthy: "正常",
  iv: "个体值", hpIv: "生命", attackIv: "攻击", defenseIv: "防御", averageIv: "平均",
  rankBoosts: "强化等级", attack: "攻击", defense: "防御", workSpeed: "工作速度",
  passives: "被动词条", equipped: "已装备主动技能", mastered: "已掌握主动技能", disabledWork: "已禁用工作",
  number: "图鉴编号", rarity: "稀有度", elements: "属性", food: "食量", description: "图鉴描述",
  baseStats: "物种基础数据", movement: "移动与耐力", walk: "步行", run: "奔跑", ride: "骑乘", swim: "游泳", transport: "搬运", stamina: "耐力",
  work: "当前工作能力", workExplicitHint: "读取存档中该只帕鲁直接记录的工作等级", workBonusHint: "当前实际等级，已计入物种基础、凝结和技能书等个体加成", workBaseCurrentHint: "当前据点实际等级，已计入凝结、个体加成和据点队友提供的 +1 加成", workBaseHint: "该只帕鲁没有个体加成，当前等级等于物种基础等级", workUnknownHint: "存档未提供工作能力数据", partner: "伙伴技能", levelSkills: "等级技能", drops: "掉落物",
  power: "威力", cooldown: "冷却", unlockLevel: "解锁等级", rate: "概率", amount: "数量",
  lucky: "闪光", alpha: "头目", tower: "高塔", male: "雄性", female: "雌性", unknown: "未知", empty: "暂无记录",
  instanceId: "实例 ID", copyId: "复制实例 ID", copied: "已复制", friendship: "好感度", favorite: "收藏", awakening: "觉醒", skin: "外观",
  rankUpExp: "凝结经验", favoriteIndex: "收藏位", physicalHealth: "身体状态", reviveTimer: "复活倒计时", workBonus: "工作适应性加成",
  yes: "是", no: "否", showSpecies: "展开物种图鉴", hideSpecies: "收起物种图鉴", showMore: "展开全文", showLess: "收起全文",
} : {
  title: "Pal details", close: "Close Pal details", individual: "Save individual", species: "Species Paldeck",
  level: "Level", exp: "Experience", gender: "Gender", stars: "Condensation stars", owner: "Owner", location: "Location", status: "Current status",
  hp: "HP", maxHpUnavailable: "Maximum HP is not persisted in the save", hunger: "Hunger", sanity: "SAN", sickness: "Conditions", healthy: "Healthy",
  iv: "Individual values", hpIv: "HP", attackIv: "Attack", defenseIv: "Defense", averageIv: "Average",
  rankBoosts: "Stat enhancements", attack: "Attack", defense: "Defense", workSpeed: "Work speed",
  passives: "Passives", equipped: "Equipped active skills", mastered: "Mastered active skills", disabledWork: "Disabled work",
  number: "Paldeck number", rarity: "Rarity", elements: "Elements", food: "Food", description: "Paldeck description",
  baseStats: "Species base stats", movement: "Movement and stamina", walk: "Walk", run: "Run", ride: "Ride", swim: "Swim", transport: "Transport", stamina: "Stamina",
  work: "Current work suitability", workExplicitHint: "Read directly from this Pal's saved work levels", workBonusHint: "Current effective level, including the species base, condensation, and individual bonuses such as work books", workBaseCurrentHint: "Current Base level, including condensation, individual bonuses, and the +1 supplied by a Base Pal", workBaseHint: "This Pal has no individual bonus, so its current level equals the species base level", workUnknownHint: "The save does not provide work suitability data", partner: "Partner skill", levelSkills: "Level-up skills", drops: "Drops",
  power: "Power", cooldown: "Cooldown", unlockLevel: "Unlock level", rate: "Rate", amount: "Amount",
  lucky: "Lucky", alpha: "Alpha", tower: "Tower", male: "Male", female: "Female", unknown: "Unknown", empty: "No record",
  instanceId: "Instance ID", copyId: "Copy instance ID", copied: "Copied", friendship: "Friendship", favorite: "Favorite", awakening: "Awakening", skin: "Skin",
  rankUpExp: "Condensation experience", favoriteIndex: "Favorite slot", physicalHealth: "Physical health", reviveTimer: "Revive timer", workBonus: "Work suitability bonuses",
  yes: "Yes", no: "No", showSpecies: "Show species Paldeck", hideSpecies: "Hide species Paldeck", showMore: "Show full text", showLess: "Show less",
});

const model = computed(() => {
  const raw = props.pal || {};
  const species = raw.species || {};
  const palId = firstValue(raw.palId, raw.type, raw.pal_id, species.id, "");
  const maxHpValue = raw.maxHp != null
    ? numberOrNull(raw.maxHp)
    : (raw.max_hp == null ? null : numberOrNull(Number(raw.max_hp) / 1000));
  const maxHp = maxHpValue !== null && maxHpValue > 0 ? maxHpValue : null;
  const currentHp = numberOrNull(raw.currentHp, raw.current_hp, raw.hp == null ? undefined : Number(raw.hp) / 1000);
  const iv = raw.iv || {
    hp: numberOrNull(raw.melee), attack: numberOrNull(raw.ranged), defense: numberOrNull(raw.defense),
  };
  const ivValues = [iv.hp, iv.attack, iv.defense].map((value) => numberOrNull(value));
  const ivAverage = numberOrNull(iv.average) ?? (ivValues.every((value) => value !== null)
    ? Math.round(ivValues.reduce((sum, value) => sum + value, 0) / ivValues.length) : null);
  const rawGender = String(firstValue(raw.gender, ""));
  const maxFullStomach = numberOrNull(raw.maxFullStomach, raw.max_full_stomach);
  const fullStomach = raw.fullStomach != null
    ? numberOrNull(raw.fullStomach)
    : (maxFullStomach !== null ? numberOrNull(raw.full_stomach) : null);
  return {
    raw, species, palId,
    name: firstValue(raw.name, raw.nickname, raw.speciesName, species.name, palId, "-"),
    speciesName: firstValue(raw.speciesName, species.name, palId, "-"),
    englishName: firstValue(species.englishName, species.english_name),
    instanceId: firstValue(raw.instanceId, raw.instance_id),
    level: numberOrNull(raw.level), exp: numberOrNull(raw.exp), currentHp, maxHp,
    gender: rawGender.toLowerCase() === "male" ? copy.value.male : rawGender.toLowerCase() === "female" ? copy.value.female : (rawGender || copy.value.unknown),
    lucky: Boolean(raw.lucky ?? raw.is_lucky), alpha: Boolean(raw.alpha ?? raw.is_boss), tower: Boolean(raw.tower ?? raw.is_tower),
    stars: numberOrNull(raw.stars) ?? Math.max(0, (numberOrNull(raw.rank) || 1) - 1),
    ownerName: firstValue(raw.ownerName, raw.owner_name, raw.baseName, raw.base_name, raw.owner_uid),
    locationLabel: firstValue(raw.locationLabel, raw.location_label, raw.location),
    currentWork: firstValue(raw.currentWork, raw.activityLabel, raw.activity?.label, raw.current_work_suitability),
    attack: numberOrNull(raw.attack),
    defense: numberOrNull(raw.defenseStat, raw.defense_stat, raw.defense),
    workSpeed: numberOrNull(raw.workSpeed, raw.workspeed, raw.work_speed),
    fullStomach,
    maxFullStomach,
    hungerPercent: numberOrNull(raw.hungerPercent, raw.hunger_percent, raw.hunger),
    sanity: numberOrNull(raw.sanity),
    sickness: arrayValue(firstValue(raw.sickness, raw.conditions, raw.diseases, [])).filter(Boolean),
    friendship: numberOrNull(raw.friendship, raw.friendshipPoint, raw.friendship_point),
    favorite: firstValue(raw.favorite, raw.isFavorite, raw.is_favorite, raw.is_favorite_pal),
    favoriteIndex: numberOrNull(raw.favoriteIndex, raw.favorite_index),
    awakening: firstValue(raw.awakening, raw.isAwakening, raw.awakeningRank, raw.awakening_rank, raw.is_awakening),
    skin: firstValue(raw.skin, raw.skinName, raw.skin_name),
    rankUpExp: numberOrNull(raw.rankUpExp, raw.rank_up_exp),
    physicalHealth: firstValue(raw.physicalHealth, raw.physical_health),
    reviveTimer: numberOrNull(raw.reviveTimer, raw.pal_revive_timer),
    workSuitabilityAddRank: raw.workSuitabilityAddRank || raw.work_suitability_add_rank || {},
    workSuitabilitySource: firstValue(raw.workSuitabilitySource, raw.work_suitability_source, "unknown"),
    rankBoosts: raw.rankBoosts || { hp: numberOrNull(raw.rank_hp), attack: numberOrNull(raw.rank_attack), defense: numberOrNull(raw.rank_defence), workSpeed: numberOrNull(raw.rank_craftspeed) },
    iv: { hp: ivValues[0], attack: ivValues[1], defense: ivValues[2], average: ivAverage },
    passives: asArray(firstValue(raw.passives, raw.skills, [])).map((skill) => typeof skill === "string" ? { id: skill, name: skill, description: "" } : skill),
    equippedSkills: asArray(firstValue(raw.equippedSkills, raw.equipped_skills, [])),
    masteredSkills: asArray(firstValue(raw.masteredSkills, raw.mastered_skills, [])),
    disabledWork: asArray(firstValue(raw.disabledWork, raw.disabled_work, [])).map(humanize),
    // The individual save record must win. Species metadata is only a
    // fallback for legacy payloads that predate per-Pal work fields.
    workSuitabilities: asArray(firstValue(raw.workSuitabilities, raw.work_suitabilities, species.workSuitabilities, [])),
    partnerSkill: (() => {
      const partner = firstValue(species.partnerSkill, raw.partnerSkill);
      return partner ? { ...partner, description: partner.description || partner.summary || "" } : null;
    })(),
    levelSkills: asArray(species.levelSkills), drops: asArray(species.drops),
    elements: asArray(species.elements).filter(Boolean), rarity: numberOrNull(species.rarity), food: numberOrNull(species.food),
    number: firstValue(species.no, species.number), description: firstValue(species.description, raw.speciesDescription),
    baseStats: species.baseStats || {}, movement: species.movement || {},
  };
});

const identityMeta = computed(() => [
  model.value.speciesName,
  model.value.level == null ? "" : `Lv.${model.value.level}`,
  model.value.stars ? "★".repeat(Math.min(4, model.value.stars)) : "",
].filter(Boolean).join(" · "));
const individualFacts = computed(() => [
  { label: copy.value.level, value: model.value.level },
  { label: copy.value.exp, value: model.value.exp?.toLocaleString?.() ?? model.value.exp },
  { label: copy.value.gender, value: model.value.gender },
  { label: copy.value.stars, value: model.value.stars },
  { label: copy.value.owner, value: model.value.ownerName },
  { label: copy.value.location, value: model.value.locationLabel },
  { label: copy.value.status, value: model.value.currentWork },
  { label: copy.value.attack, value: model.value.attack },
  { label: copy.value.defense, value: model.value.defense },
  { label: copy.value.workSpeed, value: model.value.workSpeed },
  { label: copy.value.friendship, value: model.value.friendship },
  { label: copy.value.favorite, value: model.value.favorite === undefined ? undefined : (model.value.favorite ? copy.value.yes : copy.value.no) },
  { label: copy.value.favoriteIndex, value: model.value.favoriteIndex },
  { label: copy.value.awakening, value: model.value.awakening },
  { label: copy.value.rankUpExp, value: model.value.rankUpExp },
  { label: copy.value.skin, value: model.value.skin },
  { label: copy.value.physicalHealth, value: model.value.physicalHealth },
  { label: copy.value.reviveTimer, value: model.value.reviveTimer == null ? null : `${model.value.reviveTimer}s` },
].filter((item) => item.value !== undefined && item.value !== null && item.value !== ""));
const speciesFacts = computed(() => [
  { label: copy.value.number, value: model.value.number },
  { label: copy.value.rarity, value: model.value.rarity },
  { label: copy.value.elements, value: model.value.elements.join(" / ") },
  { label: copy.value.food, value: model.value.food },
].filter((item) => item.value !== undefined && item.value !== null && item.value !== ""));
const statRows = computed(() => [
  { label: copy.value.hp, value: numberOrNull(model.value.baseStats.hp) },
  { label: copy.value.attack, value: model.value.attack ?? numberOrNull(model.value.baseStats.attack) },
  { label: copy.value.defense, value: model.value.defense ?? numberOrNull(model.value.baseStats.defense) },
  { label: copy.value.workSpeed, value: model.value.workSpeed ?? numberOrNull(model.value.baseStats.workSpeed) },
].filter((item) => item.value !== null));
const movementRows = computed(() => [
  [copy.value.walk, "walk"], [copy.value.run, "run"], [copy.value.ride, "ride"],
  [copy.value.swim, "swim"], [copy.value.transport, "transport"], [copy.value.stamina, "stamina"],
].map(([label, key]) => ({ label, value: numberOrNull(model.value.movement[key]) })).filter((item) => item.value !== null));
const rankRows = computed(() => [
  { label: copy.value.hp, value: numberOrNull(model.value.rankBoosts.hp) },
  { label: copy.value.attack, value: numberOrNull(model.value.rankBoosts.attack) },
  { label: copy.value.defense, value: numberOrNull(model.value.rankBoosts.defense) },
  { label: copy.value.workSpeed, value: numberOrNull(model.value.rankBoosts.workSpeed) },
].filter((item) => item.value !== null));
const workBonusRows = computed(() => Object.entries(model.value.workSuitabilityAddRank)
  .map(([id, value]) => ({ id, label: humanize(id), value: numberOrNull(value) }))
  .filter((item) => item.value !== null && item.value !== 0));
const workLabel = (work) => work?.name || humanize(work?.id) || "-";
const workHint = computed(() => ({
  "save-explicit": copy.value.workExplicitHint,
  "save-bonus": copy.value.workBonusHint,
  "base-current": copy.value.workBaseCurrentHint,
  "species-base": copy.value.workBaseHint,
  unknown: copy.value.workUnknownHint,
}[model.value.workSuitabilitySource] || copy.value.workUnknownHint));
const skillName = (skill) => typeof skill === "string" ? humanize(skill) : firstValue(skill?.name, skill?.id, "-");
const skillMeta = (skill) => typeof skill === "string" ? "" : [
  skill?.element,
  skill?.power != null ? `${copy.value.power} ${skill.power}` : "",
  skill?.cooldown != null ? `${copy.value.cooldown} ${skill.cooldown}s` : "",
].filter(Boolean).join(" · ");
const dropMeta = (drop) => {
  const amount = drop?.amount ?? (drop?.min != null || drop?.max != null
    ? `${drop?.min ?? drop?.max}-${drop?.max ?? drop?.min}` : null);
  const chance = drop?.chance ?? (drop?.rate != null ? `${drop.rate}%` : null);
  return [amount != null ? `${copy.value.amount} ${amount}` : "", chance != null ? `${copy.value.rate} ${chance}` : ""]
    .filter(Boolean).join(" · ");
};
const percent = (value, max = 100) => value == null ? null : Math.min(100, Math.max(0, (Number(value) / Math.max(1, Number(max || 100))) * 100));
const healthText = computed(() => model.value.currentHp == null ? "-" : model.value.maxHp == null
  ? `${Math.round(model.value.currentHp).toLocaleString()} · ${copy.value.maxHpUnavailable}`
  : `${Math.round(model.value.currentHp).toLocaleString()} / ${Math.round(model.value.maxHp).toLocaleString()}`);
const hunger = computed(() => {
  if (model.value.fullStomach !== null) {
    return {
      value: model.value.fullStomach,
      max: model.value.maxFullStomach,
      meter: percent(model.value.fullStomach, model.value.maxFullStomach || 100),
      label: model.value.maxFullStomach
        ? `${Math.round(model.value.fullStomach)} / ${Math.round(model.value.maxFullStomach)}`
        : String(Math.round(model.value.fullStomach)),
    };
  }
  if (model.value.hungerPercent !== null) {
    return { value: model.value.hungerPercent, max: 100, meter: percent(model.value.hungerPercent), label: `${Math.round(model.value.hungerPercent)}%` };
  }
  return null;
});
const hasLongDescription = computed(() => Array.from(String(model.value.description || "")).length > 150);
const close = () => emit("update:show", false);
const copyInstanceId = async () => {
  if (!model.value.instanceId || !navigator?.clipboard) return;
  await navigator.clipboard.writeText(String(model.value.instanceId));
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1600);
};
const useFallback = (event) => {
  const image = event.currentTarget;
  if (image.dataset.fallback === "true") return;
  image.dataset.fallback = "true";
  image.src = unknownPal;
};
</script>

<template>
  <n-modal :show="show" :mask-closable="true" @update:show="$event || close()">
    <article class="pal-detail-inspector" role="dialog" aria-modal="true" :aria-label="copy.title">
      <div class="pal-detail-inspector__toolbar" aria-label="详情操作">
        <button type="button" class="pal-detail-inspector__close" :aria-label="copy.close" @click="close"><n-icon><X /></n-icon></button>
      </div>
      <header class="pal-detail-inspector__hero">
        <div class="pal-detail-inspector__portrait"><img :src="palPortrait(model.palId)" :alt="model.speciesName" @error="useFallback" /></div>
        <div class="pal-detail-inspector__identity">
          <span>{{ copy.title }}</span><h2>{{ model.name }}</h2><p>{{ identityMeta }}</p>
          <n-flex><n-tag v-if="model.lucky" type="warning">{{ copy.lucky }}</n-tag><n-tag v-if="model.alpha" type="error">{{ copy.alpha }}</n-tag><n-tag v-if="model.tower" type="info">{{ copy.tower }}</n-tag></n-flex>
          <div v-if="model.instanceId" class="pal-detail-instance">
            <span><b>{{ copy.instanceId }}</b><code>{{ model.instanceId }}</code></span>
            <button type="button" :aria-label="copied ? copy.copied : copy.copyId" @click="copyInstanceId">
              <n-icon><Check v-if="copied" /><Copy v-else /></n-icon>
              <span>{{ copied ? copy.copied : copy.copyId }}</span>
            </button>
          </div>
        </div>
      </header>

      <div class="pal-detail-inspector__columns">
        <section class="pal-detail-pane" aria-labelledby="pal-individual-title">
          <header><span>{{ copy.individual }}</span><h3 id="pal-individual-title">{{ model.name }}</h3></header>
          <section class="pal-detail-section"><h4>{{ copy.work }}</h4><p class="pal-detail-source-note">{{ workHint }}</p><div v-if="model.workSuitabilities.length" class="pal-detail-work"><pal-work-badge v-for="work in model.workSuitabilities" :key="work.id" :work="work" :label="workLabel(work)" /></div><p v-else class="pal-detail-empty">{{ copy.empty }}</p></section>
          <dl v-if="individualFacts.length" class="pal-detail-facts"><div v-for="item in individualFacts" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>

          <section class="pal-detail-section"><h4>{{ copy.hp }}</h4><strong class="pal-detail-health">{{ healthText }}</strong></section>
          <section v-if="hunger || model.sanity != null || model.sickness.length" class="pal-detail-section">
            <h4>{{ copy.status }}</h4>
            <div class="pal-detail-meters">
              <div v-if="hunger"><span><b>{{ copy.hunger }}</b><em>{{ hunger.label }}</em></span><i><b :style="{ width: `${hunger.meter}%` }" /></i></div>
              <div v-if="model.sanity != null"><span><b>{{ copy.sanity }}</b><em>{{ Math.round(model.sanity) }}%</em></span><i><b :style="{ width: `${percent(model.sanity)}%` }" /></i></div>
            </div>
            <div v-if="model.sickness.length" class="pal-detail-tags"><n-tag v-for="condition in model.sickness" :key="condition" type="warning">{{ condition }}</n-tag></div>
          </section>
          <section class="pal-detail-section"><h4>{{ copy.iv }}</h4><div class="pal-detail-stat-grid"><div><span>{{ copy.hpIv }}</span><strong>{{ model.iv.hp ?? '-' }}</strong></div><div><span>{{ copy.attackIv }}</span><strong>{{ model.iv.attack ?? '-' }}</strong></div><div><span>{{ copy.defenseIv }}</span><strong>{{ model.iv.defense ?? '-' }}</strong></div><div><span>{{ copy.averageIv }}</span><strong>{{ model.iv.average ?? '-' }}</strong></div></div></section>
          <section v-if="rankRows.length" class="pal-detail-section"><h4>{{ copy.rankBoosts }}</h4><dl class="pal-detail-inline-stats"><div v-for="item in rankRows" :key="item.label"><dt>{{ item.label }}</dt><dd>+{{ item.value }}</dd></div></dl></section>
          <section v-if="workBonusRows.length" class="pal-detail-section"><h4>{{ copy.workBonus }}</h4><dl class="pal-detail-inline-stats"><div v-for="item in workBonusRows" :key="item.id"><dt>{{ item.label }}</dt><dd>+{{ item.value }}</dd></div></dl></section>
          <section class="pal-detail-section"><h4>{{ copy.passives }}</h4><div v-if="model.passives.length" class="pal-detail-passives"><pal-passive-badge v-for="skill in model.passives" :key="skill.id || skill.name" :skill="skill" /></div><p v-else class="pal-detail-empty">{{ copy.empty }}</p></section>
          <section class="pal-detail-section"><h4>{{ copy.equipped }}</h4><div v-if="model.equippedSkills.length" class="pal-detail-skill-list"><article v-for="skill in model.equippedSkills" :key="skill.id || skill.name || skill"><strong>{{ skillName(skill) }}</strong><small v-if="skillMeta(skill)">{{ skillMeta(skill) }}</small><p v-if="skill.description">{{ skill.description }}</p></article></div><p v-else class="pal-detail-empty">{{ copy.empty }}</p></section>
          <section class="pal-detail-section"><h4>{{ copy.mastered }}</h4><div v-if="model.masteredSkills.length" class="pal-detail-skill-list"><article v-for="skill in model.masteredSkills" :key="skill.id || skill.name || skill"><strong>{{ skillName(skill) }}</strong><small v-if="skillMeta(skill)">{{ skillMeta(skill) }}</small><p v-if="skill.description">{{ skill.description }}</p></article></div><p v-else class="pal-detail-empty">{{ copy.empty }}</p></section>
          <section v-if="model.disabledWork.length" class="pal-detail-section"><h4>{{ copy.disabledWork }}</h4><div class="pal-detail-tags"><n-tag v-for="work in model.disabledWork" :key="work" type="warning">{{ work }}</n-tag></div></section>
        </section>

        <button
          type="button"
          class="pal-detail-species-toggle"
          :aria-expanded="speciesExpanded"
          aria-controls="pal-species-pane"
          @click="speciesExpanded = !speciesExpanded"
        >{{ speciesExpanded ? copy.hideSpecies : copy.showSpecies }}</button>
        <section id="pal-species-pane" class="pal-detail-pane pal-detail-pane--species" :class="{ 'is-expanded': speciesExpanded }" aria-labelledby="pal-species-title">
          <header><span>{{ copy.species }}</span><h3 id="pal-species-title">{{ model.speciesName }}</h3><p v-if="model.englishName">{{ model.englishName }}</p></header>
          <dl v-if="speciesFacts.length" class="pal-detail-facts"><div v-for="item in speciesFacts" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
          <section v-if="model.description" class="pal-detail-section"><h4>{{ copy.description }}</h4><p class="pal-detail-description" :class="{ 'is-clamped': hasLongDescription && !descriptionExpanded }">{{ model.description }}</p><button v-if="hasLongDescription" type="button" class="pal-detail-text-toggle" :aria-expanded="descriptionExpanded" @click="descriptionExpanded = !descriptionExpanded">{{ descriptionExpanded ? copy.showLess : copy.showMore }}</button></section>
          <section v-if="statRows.length" class="pal-detail-section"><h4>{{ copy.baseStats }}</h4><dl class="pal-detail-inline-stats"><div v-for="item in statRows" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl></section>
          <section v-if="movementRows.length" class="pal-detail-section"><h4>{{ copy.movement }}</h4><dl class="pal-detail-inline-stats"><div v-for="item in movementRows" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl></section>
          <section class="pal-detail-section"><h4>{{ copy.partner }}</h4><article v-if="model.partnerSkill" class="pal-detail-partner"><strong>{{ model.partnerSkill.name || model.partnerSkill.id }}</strong><p v-if="model.partnerSkill.description">{{ model.partnerSkill.description }}</p></article><p v-else class="pal-detail-empty">{{ copy.empty }}</p></section>
          <section class="pal-detail-section"><h4>{{ copy.levelSkills }}</h4><div v-if="model.levelSkills.length" class="pal-detail-skill-list"><article v-for="skill in model.levelSkills" :key="`${skill.level}-${skill.id}`"><strong>{{ skill.name || skill.id }}</strong><small>{{ copy.unlockLevel }} {{ skill.level }}<template v-if="skillMeta(skill)"> · {{ skillMeta(skill) }}</template></small><p v-if="skill.description">{{ skill.description }}</p></article></div><p v-else class="pal-detail-empty">{{ copy.empty }}</p></section>
          <section class="pal-detail-section"><h4>{{ copy.drops }}</h4><div v-if="model.drops.length" class="pal-detail-drop-list"><article v-for="drop in model.drops" :key="drop.id || drop.name"><strong>{{ drop.name || drop.id }}</strong><small v-if="dropMeta(drop)">{{ dropMeta(drop) }}</small></article></div><p v-else class="pal-detail-empty">{{ copy.empty }}</p></section>
        </section>
      </div>
    </article>
  </n-modal>
</template>

<style scoped>
.pal-detail-inspector { position: relative; width: min(1180px, 96vw); max-height: 92dvh; overflow-x: hidden; overflow-y: auto; padding: 30px; color: var(--app-ink); background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 16px; box-shadow: 0 8px 8px rgb(0 0 0 / 22%); }
.pal-detail-inspector__toolbar { position: sticky; z-index: 10; top: 0; display: flex; height: 0; align-items: flex-start; justify-content: flex-end; margin: 0 0 0; pointer-events: none; }
.pal-detail-inspector__close { display: grid; width: 44px; height: 44px; place-items: center; color: var(--app-ink); background: color-mix(in srgb, var(--app-surface-muted) 92%, transparent); border: 1px solid var(--app-border); border-radius: 50%; cursor: pointer; font-size: 20px; pointer-events: auto; }
.pal-detail-inspector__close:focus-visible { outline: 3px solid var(--app-accent); outline-offset: 2px; }
.pal-detail-inspector__hero { display: grid; grid-template-columns: 176px minmax(0, 1fr); align-items: center; gap: 28px; padding-right: 56px; }
.pal-detail-inspector__portrait { display: grid; width: 176px; height: 176px; place-items: center; overflow: hidden; background: var(--app-surface-muted); border-radius: 14px; }
.pal-detail-inspector__portrait img { width: 160px; height: 160px; object-fit: contain; filter: drop-shadow(0 12px 10px rgb(0 0 0 / 16%)); }
.pal-detail-inspector__identity { min-width: 0; }.pal-detail-inspector__identity > span,.pal-detail-pane > header > span { color: var(--app-accent); font: 700 11px var(--app-font-data); }.pal-detail-inspector__identity h2 { margin: 7px 0 0; overflow-wrap: anywhere; font-size: 34px; line-height: 1.12; }.pal-detail-inspector__identity > p { margin: 7px 0 12px; color: var(--app-ink-muted); font-size: 14px; }
.pal-detail-instance { display: flex; max-width: 680px; align-items: center; gap: 8px; margin-top: 12px; }.pal-detail-instance > span { display: grid; min-width: 0; gap: 2px; }.pal-detail-instance b { color: var(--app-ink-muted); font-size: 10px; }.pal-detail-instance code { overflow: hidden; color: var(--app-ink-secondary); font: 11px var(--app-font-data); text-overflow: ellipsis; white-space: nowrap; }.pal-detail-instance button,.pal-detail-species-toggle { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px; color: var(--app-accent); background: transparent; border: 1px solid color-mix(in srgb, var(--app-accent) 35%, var(--app-border)); border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 700; }.pal-detail-instance button { flex: 0 0 auto; }.pal-detail-instance button:focus-visible,.pal-detail-species-toggle:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }.pal-detail-species-toggle { display: none; }
.pal-detail-inspector__columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 18px; margin-top: 26px; }
.pal-detail-pane { min-width: 0; }.pal-detail-pane > header { padding: 0 2px 12px; border-bottom: 1px solid var(--app-border); }.pal-detail-pane > header h3 { margin: 3px 0 0; font-size: 20px; }.pal-detail-pane > header p { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; }
.pal-detail-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 12px 0 0; overflow: hidden; background: var(--app-border); border: 1px solid var(--app-border); border-radius: 10px; gap: 1px; }.pal-detail-facts > div { min-width: 0; padding: 10px 12px; background: var(--app-surface); }.pal-detail-facts dt,.pal-detail-inline-stats dt { color: var(--app-ink-muted); font-size: 10px; }.pal-detail-facts dd { margin: 3px 0 0; overflow-wrap: anywhere; font-size: 12px; font-weight: 700; }
.pal-detail-section { min-width: 0; margin-top: 10px; padding: 14px; background: var(--app-surface-muted); border-radius: 10px; }.pal-detail-section h4 { margin: 0 0 10px; font-size: 13px; }.pal-detail-health { display: block; overflow-wrap: anywhere; font: 700 13px var(--app-font-data); }
.pal-detail-source-note { margin: -4px 0 9px; color: var(--app-ink-muted); font-size: 10px; line-height: 1.45; }
.pal-detail-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; background: var(--app-border); border-radius: 8px; gap: 1px; }.pal-detail-stat-grid > div { min-width: 0; padding: 9px; background: var(--app-surface); text-align: center; }.pal-detail-stat-grid span,.pal-detail-stat-grid strong { display: block; }.pal-detail-stat-grid span { color: var(--app-ink-muted); font-size: 9px; }.pal-detail-stat-grid strong { margin-top: 3px; font: 700 16px var(--app-font-data); }
.pal-detail-inline-stats { display: flex; flex-wrap: wrap; gap: 1px; overflow: hidden; background: var(--app-border); border-radius: 8px; }.pal-detail-inline-stats > div { min-width: 86px; flex: 1 1 86px; padding: 9px 10px; background: var(--app-surface); }.pal-detail-inline-stats dd { margin: 3px 0 0; font: 700 14px var(--app-font-data); }
.pal-detail-meters { display: grid; gap: 10px; }.pal-detail-meters > div > span { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; }.pal-detail-meters em { font: 700 10px var(--app-font-data); font-style: normal; }.pal-detail-meters i { display: block; height: 6px; margin-top: 5px; overflow: hidden; background: var(--app-surface); border-radius: 6px; }.pal-detail-meters i b { display: block; height: 100%; background: var(--app-accent); border-radius: inherit; }
.pal-detail-passives,.pal-detail-work { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 7px; }.pal-detail-passives { grid-auto-rows: 94px; }.pal-detail-passives :deep(.pal-passive-badge) { box-sizing: border-box; height: 94px; min-height: 94px; max-height: 94px; align-content: center; overflow: hidden; text-align: left; }.pal-detail-passives :deep(.pal-passive-badge p) { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }.pal-detail-work :deep(.pal-work-badge) { min-width: 0; }
.pal-detail-skill-list,.pal-detail-drop-list { display: grid; gap: 7px; }.pal-detail-skill-list article,.pal-detail-drop-list article,.pal-detail-partner { min-width: 0; padding: 10px 11px; background: var(--app-surface); border-radius: 8px; }.pal-detail-skill-list strong,.pal-detail-skill-list small,.pal-detail-drop-list strong,.pal-detail-drop-list small { display: block; overflow-wrap: anywhere; }.pal-detail-skill-list small,.pal-detail-drop-list small { margin-top: 3px; color: var(--app-ink-muted); font-size: 10px; }.pal-detail-skill-list p,.pal-detail-partner p { margin: 5px 0 0; overflow-wrap: anywhere; color: var(--app-ink-muted); font-size: 11px; line-height: 1.5; }
.pal-detail-description { margin: 0; overflow-wrap: anywhere; color: var(--app-ink-secondary); font-size: 12px; line-height: 1.65; white-space: pre-line; }.pal-detail-description.is-clamped { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }.pal-detail-text-toggle { min-height: 44px; margin: 4px 0 -8px; padding: 8px 0; color: var(--app-accent); background: transparent; border: 0; cursor: pointer; font-size: 12px; font-weight: 700; }.pal-detail-text-toggle:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }.pal-detail-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }.pal-detail-empty { margin: 0; color: var(--app-ink-muted); font-size: 11px; }
@media (max-width: 760px) { .pal-detail-inspector { width: 100vw; max-height: 100dvh; padding: 20px 14px 30px; border-radius: 0; }.pal-detail-inspector__toolbar { top: -20px; }.pal-detail-inspector__hero { grid-template-columns: 1fr; justify-items: center; gap: 14px; padding: 0 40px 0; text-align: center; }.pal-detail-inspector__portrait { width: 144px; height: 144px; }.pal-detail-inspector__portrait img { width: 134px; height: 134px; }.pal-detail-inspector__identity h2 { font-size: 25px; }.pal-detail-inspector__identity .n-flex { justify-content: center; }.pal-detail-instance { max-width: 100%; flex-direction: column; }.pal-detail-instance > span { width: 100%; }.pal-detail-instance button { width: 100%; }.pal-detail-inspector__columns { grid-template-columns: 1fr; }.pal-detail-species-toggle { display: inline-flex; width: 100%; }.pal-detail-pane--species { display: none; }.pal-detail-pane--species.is-expanded { display: block; }.pal-detail-facts { grid-template-columns: 1fr 1fr; }.pal-detail-passives,.pal-detail-work { grid-template-columns: 1fr; } }
@media (max-width: 380px) { .pal-detail-facts,.pal-detail-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
