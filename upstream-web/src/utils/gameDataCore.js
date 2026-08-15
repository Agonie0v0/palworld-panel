const asArray = (value) => (Array.isArray(value) ? value : []);
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const optionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
};
const lastToken = (value) => String(value || "").split("::").at(-1);
const arrayValue = (value) => value == null || value === "" ? [] : (Array.isArray(value) ? value : [value]);
const WORK_NAME_TO_ID = {
  "\u751f\u706b": "EmitFlame",
  "\u6d47\u6c34": "Watering",
  "\u64ad\u79cd": "Seeding",
  "\u53d1\u7535": "GenerateElectricity",
  "\u624b\u5de5\u4f5c\u4e1a": "Handcraft",
  "\u91c7\u96c6": "Collection",
  "\u4f10\u6728": "Deforest",
  "\u91c7\u77ff": "Mining",
  "\u5236\u836f": "ProductMedicine",
  "\u51b7\u5374": "Cool",
  "\u642c\u8fd0": "Transport",
  "\u7267\u573a": "MonsterFarm",
  Kindling: "EmitFlame",
  Watering: "Watering",
  Planting: "Seeding",
  Electricity: "GenerateElectricity",
  Handiwork: "Handcraft",
  Gathering: "Collection",
  Lumbering: "Deforest",
  Mining: "Mining",
  Medicine: "ProductMedicine",
  Cooling: "Cool",
  Transporting: "Transport",
  Farming: "MonsterFarm",
};
const normalizeWorkId = (value) => {
  const token = String(value || "").replace(/^EPalWorkSuitability::/i, "");
  return WORK_NAME_TO_ID[token] || token;
};

const MAX_WORK_SUITABILITY_LEVEL = 10;
const WORK_SUITABILITY_TIE_ORDER = [
  "MonsterFarm",
  "EmitFlame",
  "Watering",
  "Seeding",
  "GenerateElectricity",
  "Handcraft",
  "Collection",
  "Deforest",
  "Mining",
  "OilExtraction",
  "ProductMedicine",
  "Cool",
  "Transport",
];
const WORK_SUITABILITY_TIE_RANK = new Map(
  WORK_SUITABILITY_TIE_ORDER.map((id, index) => [id, index]),
);
const WORK_SUITABILITY_AURA_NAMES = {
  EmitFlame: ["生火", "Kindling"],
  Watering: ["浇水", "Watering"],
  Seeding: ["播种", "Planting"],
  GenerateElectricity: ["发电", "Generating Electricity"],
  Handcraft: ["手工作业", "Handiwork"],
  Collection: ["采集", "Gathering"],
  Deforest: ["伐木", "Lumbering"],
  Mining: ["采矿", "Mining"],
  ProductMedicine: ["制药", "Medicine Production"],
  Cool: ["冷却", "Cooling"],
  Transport: ["搬运", "Transporting"],
  MonsterFarm: ["牧场", "Farming", "Ranch"],
};

const firstPopulatedWorkValue = (...values) => {
  const populated = values.find((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value && typeof value === "object" && Object.keys(value).length > 0;
  });
  return populated ?? values.find((value) => value !== null && value !== undefined);
};

const detectWorkSuitabilityAura = (...sources) => {
  for (const source of sources.filter(Boolean)) {
    const structured = normalizeWorkId(
      source.workSuitabilityAura || source.work_suitability_aura,
    );
    if (structured) return structured;
  }
  const description = sources
    .filter(Boolean)
    .map((source) => source.description || source.summary || "")
    .join(" ");
  if (!/(?:其他据点帕鲁|other\s+(?:base\s+)?pals?)/i.test(description)) return "";
  const match = Object.entries(WORK_SUITABILITY_AURA_NAMES)
    .find(([, names]) => names.some((name) => description.toLowerCase().includes(name.toLowerCase())));
  return match?.[0] || "";
};

// Palworld 1.0 grants one work point on each of the first three condensation
// ranks, then grants one point to every natural suitability at maximum rank.
// The first three points are selected in cycles: Farming catches up first;
// otherwise the first two turns choose the highest unused suitability and the
// third chooses the lowest. Ties prefer Farming, then the in-game work order.
export const workSuitabilityCondensationBonus = (workSuitabilities = [], rawStars = 0) => {
  const natural = asArray(workSuitabilities)
    .map((item, index) => ({
      id: normalizeWorkId(item?.id || item?.name),
      level: number(item?.level ?? item?.rank),
      index,
    }))
    .filter((item) => item.id && item.level > 0);
  const stars = Math.max(0, Math.min(4, number(rawStars)));
  if (!natural.length || !stars) return {};

  const levels = new Map(natural.map((item) => [item.id, item.level]));
  const originalIndex = new Map(natural.map((item) => [item.id, item.index]));
  const bonuses = {};
  const usedThisCycle = new Set();
  let cycleTurn = 0;

  const tieRank = (id) => WORK_SUITABILITY_TIE_RANK.get(id) ??
    WORK_SUITABILITY_TIE_ORDER.length + (originalIndex.get(id) ?? natural.length);
  const choose = (ids, lowest) => ids.reduce((best, id) => {
    if (!best) return id;
    const level = levels.get(id) || 0;
    const bestLevel = levels.get(best) || 0;
    if (level !== bestLevel) return lowest
      ? (level < bestLevel ? id : best)
      : (level > bestLevel ? id : best);
    return tieRank(id) < tieRank(best) ? id : best;
  }, "");
  const addPoint = (id) => {
    levels.set(id, (levels.get(id) || 0) + 1);
    bonuses[id] = (bonuses[id] || 0) + 1;
  };

  for (let star = 0; star < Math.min(3, stars); star += 1) {
    const ids = natural.map((item) => item.id);
    const farmingLevel = levels.get("MonsterFarm");
    const highestLevel = Math.max(...levels.values());
    if (farmingLevel !== undefined && farmingLevel < highestLevel) {
      // Catch-up points do not consume Farming's normal turn in this cycle.
      addPoint("MonsterFarm");
    } else {
      let candidates = ids.filter((id) => !usedThisCycle.has(id));
      if (!candidates.length) {
        usedThisCycle.clear();
        candidates = ids;
      }
      const chosen = choose(candidates, cycleTurn === 2);
      addPoint(chosen);
      usedThisCycle.add(chosen);
    }
    cycleTurn += 1;
    if (cycleTurn >= natural.length) {
      cycleTurn = 0;
      usedThisCycle.clear();
    }
  }

  if (stars >= 4) natural.forEach(({ id }) => addPoint(id));
  return bonuses;
};

export const applyBaseWorkSuitabilityAuras = (pals = []) => {
  const rows = asArray(pals);
  const providers = new Map();
  rows.forEach((pal, index) => {
    const id = normalizeWorkId(pal?.workSuitabilityAura);
    if (!id) return;
    providers.set(id, [...(providers.get(id) || []), index]);
  });

  return rows.map((pal, index) => {
    const previousBonuses = pal?.workSuitabilityBaseAuraBonus || {};
    const bonuses = {};
    const workSuitabilities = asArray(pal?.workSuitabilities).map((item) => {
      const personalLevel = Math.max(0, number(item?.level) - number(previousBonuses[item?.id]));
      const active = asArray(providers.get(item?.id)).some((provider) => provider !== index);
      if (active && personalLevel < MAX_WORK_SUITABILITY_LEVEL) bonuses[item.id] = 1;
      return {
        ...item,
        level: Math.min(MAX_WORK_SUITABILITY_LEVEL, personalLevel + (active ? 1 : 0)),
      };
    });
    const hasAura = Object.keys(bonuses).length > 0;
    const personalSource = pal.workSuitabilityPersonalSource || pal.workSuitabilitySource;
    return {
      ...pal,
      workSuitabilities,
      workSuitabilityBaseAuraBonus: bonuses,
      workSuitabilityPersonalSource: personalSource,
      workSuitabilitySource: hasAura ? "base-current" : personalSource,
    };
  });
};

export const normalizePalId = (value = "") =>
  String(value).replace(/^boss_/i, "").trim();

export const makeMetadataContext = ({
  game = {},
  work = {},
  detail = {},
  partner = {},
  species = {},
  workers = {},
} = {}) => {
  const palMeta = new Map(
    Object.entries(game.pals || {}).map(([id, value]) => [id.toLowerCase(), { id, ...value }]),
  );
  return {
    items: new Map(
      Object.entries(game.items || {}).map(([id, value]) => [id.toLowerCase(), value]),
    ),
    passives: game.passives || {},
    work: new Map(Object.entries(work).map(([id, value]) => [id.toLowerCase(), value])),
    palMeta,
    activeDetails: detail.active_skills || {},
    passiveDetails: detail.passives || {},
    palDetails: new Map(Object.entries(detail.pals || {}).map(([id, value]) => [id.toLowerCase(), value])),
    partners: new Map(Object.entries(partner).map(([id, value]) => [id.toLowerCase(), value])),
    species: new Map(
      Object.entries(species.pals || species).map(([id, value]) => [id.toLowerCase(), { id, ...value }]),
    ),
    speciesAliases: new Map(
      Object.entries(species.aliases || {}).map(([id, value]) => [id.toLowerCase(), String(value).toLowerCase()]),
    ),
    workers: new Map(Object.entries(workers).map(([id, value]) => [id.toLowerCase(), value])),
  };
};

const skillInfo = (id, names, details) => ({
  id,
  name: details?.[id]?.name || names?.[id] || id,
  description: details?.[id]?.description || "",
  rank: details?.[id]?.rank,
  element: details?.[id]?.element || "",
  power: details?.[id]?.power,
  cooldown: details?.[id]?.cooldown,
});

export const normalizePal = (pal = {}, context) => {
  const rawId = String(pal.type || pal.pal_id || "");
  const palId = normalizePalId(rawId);
  const key = palId.toLowerCase();
  const speciesKey = context.speciesAliases?.get(rawId.toLowerCase()) ||
    context.speciesAliases?.get(key) || key;
  const speciesMeta = context.species?.get(speciesKey) || {};
  const resolvedId = speciesMeta.id || context.palMeta.get(speciesKey)?.id || palId;
  const resolvedKey = String(resolvedId).toLowerCase();
  const meta = context.palMeta.get(resolvedKey) || context.palMeta.get(key) || {};
  const details = context.palDetails.get(resolvedKey) || context.palDetails.get(key) || {};
  const worker = context.workers?.get(resolvedKey) || context.workers?.get(key) || {};
  const passiveIds = asArray(pal.skills || pal.passives).map((skill) =>
    typeof skill === "string" ? skill.split("::").at(-1) : skill.id,
  );
  const passives = passiveIds.filter(Boolean).map((id) =>
    skillInfo(id, context.passives, context.passiveDetails),
  );
  const active = (values) => asArray(values).map((skill) => {
    const id = typeof skill === "string" ? skill.split("::").at(-1) : skill.id;
    return skillInfo(id, {}, context.activeDetails);
  });
  const catalogWork = speciesMeta.workSuitabilities || speciesMeta.work ||
    context.work.get(resolvedKey) || context.work.get(key) || {};
  const workEntries = Array.isArray(catalogWork)
    ? catalogWork.map((item) => [normalizeWorkId(item.id || item.name), item.level, item.name])
    : Object.entries(catalogWork).map(([id, level]) => [normalizeWorkId(id), level, ""]);
  const speciesWorkSuitabilities = workEntries
    .filter(([, level]) => number(level) > 0)
    .map(([id, level, name]) => ({ id, name: name || "", level: number(level) }));
  // GotWorkSuitabilityAddRankList contains permanent individual bonuses, not
  // the final levels. Merge those deltas into the catalog baseline; the
  // catalog remains available separately as species reference data.
  const individualWork = new Map(speciesWorkSuitabilities.map((item) => [item.id, { ...item }]));
  const individualWorkSource = firstPopulatedWorkValue(
    pal.work_suitabilities,
    pal.workSuitabilities,
  );
  const savedWorkBonuses = firstPopulatedWorkValue(
    pal.work_suitability_add_rank,
    pal.workSuitabilityAddRank,
  ) || {};
  const explicitWork = new Map();
  let appliedSavedWorkBonus = false;
  if (Array.isArray(individualWorkSource)) {
    individualWorkSource.forEach((item) => {
      const id = normalizeWorkId(item?.id || item?.name);
      const level = number(item?.level ?? item?.rank);
      if (id && level > 0) explicitWork.set(id, { id, name: item?.name || "", level });
    });
  } else if (individualWorkSource && typeof individualWorkSource === "object") {
    Object.entries(individualWorkSource).forEach(([rawId, value]) => {
      const id = normalizeWorkId(rawId);
      const level = number(value?.level ?? value?.rank ?? value);
      if (id && level > 0) explicitWork.set(id, { id, name: value?.name || "", level });
    });
  }
  if (explicitWork.size) {
    individualWork.clear();
    explicitWork.forEach((item, id) => individualWork.set(id, item));
  } else {
    Object.entries(savedWorkBonuses).forEach(([rawId, rawBonus]) => {
      const id = normalizeWorkId(rawId);
      const bonus = number(rawBonus);
      if (!id || bonus <= 0) return;
      appliedSavedWorkBonus = true;
      const item = individualWork.get(id);
      if (item) item.level += bonus;
      else individualWork.set(id, { id, name: "", level: bonus });
    });
  }
  // Rank is persisted separately from GotWorkSuitabilityAddRankList. Rebuild
  // its deterministic 1.0 work-point allocation only when the save did not
  // already provide a complete final list.
  const condensationStars = Math.max(
    0,
    Math.min(4, pal.stars == null ? number(pal.rank) - 1 : number(pal.stars)),
  );
  const condensationWorkBonus = explicitWork.size
    ? {}
    : workSuitabilityCondensationBonus(speciesWorkSuitabilities, condensationStars);
  if (!explicitWork.size && condensationStars > 0) {
    Object.entries(condensationWorkBonus).forEach(([id, bonus]) => {
      const item = individualWork.get(id);
      if (!item) return;
      item.level += bonus;
    });
  }
  const workSuitabilities = [...individualWork.values()].map((item) => ({
    ...item,
    level: Math.min(MAX_WORK_SUITABILITY_LEVEL, item.level),
  }));
  const workSuitabilitySource = explicitWork.size
    ? "save-explicit"
    : appliedSavedWorkBonus || Object.keys(condensationWorkBonus).length
      ? "save-bonus"
      : speciesWorkSuitabilities.length
        ? "species-base"
        : "unknown";
  const iv = {
    hp: optionalNumber(pal.iv?.hp ?? pal.melee),
    attack: optionalNumber(pal.iv?.attack ?? pal.ranged),
    defense: optionalNumber(pal.iv?.defense ?? pal.defense),
  };
  iv.average = Object.values(iv).every((value) => value !== null)
    ? Math.round((iv.hp + iv.attack + iv.defense) / 3)
    : null;
  const rawHp = optionalNumber(pal.hp);
  const maxHpRaw = optionalNumber(pal.max_hp ?? pal.maxHp);
  const normalizedMaxHp = pal.max_hp != null
    ? (maxHpRaw === null ? null : maxHpRaw / 1000)
    : maxHpRaw;
  const foodCapacity = optionalNumber(
    speciesMeta.maxFullStomach ?? speciesMeta.max_full_stomach ?? worker.max_full_stomach,
  );
  const fullStomach = optionalNumber(pal.full_stomach ?? pal.fullStomach ?? pal.hunger);
  const partnerSource = speciesMeta.partnerSkill ||
    context.partners.get(resolvedKey) || context.partners.get(key) || null;
  const partnerSkill = partnerSource ? {
    ...partnerSource,
    description: partnerSource.description || partnerSource.summary || "",
  } : null;
  const workSuitabilityAura = detectWorkSuitabilityAura(
    speciesMeta,
    speciesMeta.partnerSkill,
    partnerSource,
  );
  const speciesBaseStats = speciesMeta.baseStats || {};
  const speciesMovement = speciesMeta.movement || {};
  const species = {
    ...speciesMeta,
    id: resolvedId,
    no: speciesMeta.no ?? speciesMeta.paldexNumber ?? null,
    name: speciesMeta.name || meta.name || resolvedId || "-",
    englishName: speciesMeta.englishName || "",
    elements: arrayValue(speciesMeta.elements || speciesMeta.element),
    rarity: optionalNumber(speciesMeta.rarity ?? meta.rarity),
    description: speciesMeta.description || "",
    food: optionalNumber(speciesMeta.food),
    maxFullStomach: foodCapacity,
    baseStats: {
      hp: optionalNumber(speciesBaseStats.hp ?? speciesMeta.hp),
      attack: optionalNumber(speciesBaseStats.attack ?? speciesMeta.attack ?? details.attack),
      defense: optionalNumber(speciesBaseStats.defense ?? speciesMeta.defense ?? details.defense),
      workSpeed: optionalNumber(
        speciesBaseStats.workSpeed ?? speciesBaseStats.work_speed ??
        speciesMeta.workSpeed ?? speciesMeta.work_speed,
      ),
    },
    movement: {
      walk: optionalNumber(speciesMovement.walk ?? speciesMeta.walk),
      run: optionalNumber(speciesMovement.run ?? speciesMeta.runSpeed ?? speciesMeta.run),
      ride: optionalNumber(speciesMovement.ride ?? speciesMeta.rideSpeed),
      swim: optionalNumber(speciesMovement.swim ?? speciesMeta.swimSpeed),
      transport: optionalNumber(speciesMovement.transport ?? speciesMeta.transportSpeed),
      stamina: optionalNumber(speciesMovement.stamina ?? speciesMeta.stamina),
    },
    partnerSkill,
    workSuitabilities: speciesWorkSuitabilities,
    levelSkills: asArray(speciesMeta.levelSkills || speciesMeta.skills),
    drops: asArray(speciesMeta.drops),
  };
  return {
    ...pal,
    palId,
    speciesId: resolvedId,
    name: pal.nickname || species.name,
    speciesName: species.name,
    species,
    lucky: Boolean(pal.lucky ?? pal.is_lucky),
    alpha: Boolean(pal.alpha ?? pal.is_boss ?? /^boss_/i.test(rawId)),
    tower: Boolean(pal.tower ?? pal.is_tower ?? /^gym_/i.test(rawId)),
    stars: condensationStars,
    currentHp: rawHp === null ? null : rawHp / 1000,
    maxHp: normalizedMaxHp && normalizedMaxHp > 0 ? normalizedMaxHp : null,
    attack: optionalNumber(pal.attack),
    defenseStat: optionalNumber(pal.defense_stat),
    workSpeed: optionalNumber(pal.work_speed ?? pal.workspeed),
    fullStomach,
    maxFullStomach: foodCapacity,
    hungerPercent: fullStomach === null || !foodCapacity
      ? null
      : Math.max(0, Math.min(100, (fullStomach / foodCapacity) * 100)),
    sanity: optionalNumber(pal.sanity),
    rankBoosts: {
      hp: optionalNumber(pal.rank_hp),
      attack: optionalNumber(pal.rank_attack),
      defense: optionalNumber(pal.rank_defence ?? pal.rank_defense),
      workSpeed: optionalNumber(pal.rank_craftspeed),
    },
    rankUpExp: optionalNumber(pal.rank_up_exp),
    friendshipPoint: optionalNumber(pal.friendship_point),
    awakening: pal.is_awakening ?? null,
    favorite: pal.is_favorite_pal ?? null,
    favoriteIndex: optionalNumber(pal.favorite_index),
    physicalHealth: pal.physical_health || null,
    reviveTimer: optionalNumber(pal.pal_revive_timer),
    skinName: pal.skin_name || null,
    workSuitabilityAddRank: savedWorkBonuses,
    iv,
    passives,
    equippedSkills: active(pal.equipped_skills),
    masteredSkills: active(pal.mastered_skills),
    workSuitabilities,
    partnerSkill,
    currentWork: lastToken(pal.current_work_suitability),
    workerEvent: lastToken(pal.base_worker_event),
    sickness: lastToken(pal.worker_sick),
    disabledWork: asArray(pal.disabled_work).map(lastToken).filter(Boolean),
    ownerName: pal.base_name || pal.owner_name || pal.owner_uid || "-",
    ownerKind: pal.location_kind === "base" ? "base" : "player",
    locationKind: pal.location_kind || "player",
    locationLabel: pal.facility || pal.activity?.label || pal.base_name || pal.owner_name || "-",
    workSuitabilityAura,
    workSuitabilitySource,
    workSuitabilityPersonalSource: pal.workSuitabilityPersonalSource || workSuitabilitySource,
    workSuitabilityRankBonus: condensationWorkBonus,
  };
};

export const filterAndSortPals = (pals, filters = {}) => {
  const query = String(filters.query || "").trim().toLowerCase();
  const selectedWork = asArray(filters.work);
  const selectedPassives = asArray(filters.passives);
  const minWorkLevel = number(filters.minWorkLevel || 1);
  const rows = asArray(pals).filter((pal) => {
    if (filters.owner && filters.owner !== "all" && pal.location_key !== filters.owner) return false;
    if (filters.flag === "lucky" && !pal.lucky) return false;
    if (filters.flag === "alpha" && !pal.alpha) return false;
    if (number(pal.level) < number(filters.minLevel)) return false;
    if (number(pal.stars) < number(filters.minStars)) return false;
    if (pal.iv.hp < number(filters.minIvHp)) return false;
    if (pal.iv.attack < number(filters.minIvAttack)) return false;
    if (pal.iv.defense < number(filters.minIvDefense)) return false;
    if (pal.iv.average < number(filters.minIvAverage)) return false;
    const works = new Map(pal.workSuitabilities.map((item) => [item.id, item.level]));
    if (!selectedWork.every((id) => number(works.get(id)) >= minWorkLevel)) return false;
    const passives = new Set(pal.passives.map((item) => item.id));
    if (!selectedPassives.every((id) => passives.has(id))) return false;
    return !query || [pal.name, pal.speciesName, pal.palId, pal.ownerName, pal.guild_name]
      .join(" ").toLowerCase().includes(query);
  });
  if (filters.sort === "level") return rows.sort((a, b) => b.level - a.level || b.iv.average - a.iv.average);
  if (filters.sort === "iv") return rows.sort((a, b) => b.iv.average - a.iv.average || b.level - a.level);
  return rows.sort((a, b) => {
    const score = (pal) => pal.workSuitabilities.reduce((sum, item) => sum + item.level, 0);
    return score(b) - score(a) || b.level - a.level;
  });
};

export const normalizeInventory = (items = [], context = {}) =>
  asArray(items).map((item) => {
    const itemId = String(item.item_id || item.ItemId || "").toLowerCase();
    const meta = context.items?.get?.(itemId) || {};
    return {
      ...item,
      itemId,
      name: meta.name || itemId,
      category: meta.category || "未知物品",
      count: number(item.count ?? item.StackCount),
      locations: asArray(item.locations),
      known: Boolean(meta.name),
    };
  });
