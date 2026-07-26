const asArray = (value) => (Array.isArray(value) ? value : []);
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const normalizePalId = (value = "") =>
  String(value).replace(/^boss_/i, "").trim();

export const makeMetadataContext = ({ game = {}, work = {}, detail = {}, partner = {} } = {}) => {
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
  const meta = context.palMeta.get(key) || {};
  const details = context.palDetails.get(key) || {};
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
  const workSuitabilities = Object.entries(context.work.get(key) || {})
    .filter(([, level]) => number(level) > 0)
    .map(([id, level]) => ({ id, level: number(level) }));
  const iv = {
    hp: number(pal.iv?.hp ?? pal.melee),
    attack: number(pal.iv?.attack ?? pal.ranged),
    defense: number(pal.iv?.defense ?? pal.defense),
  };
  iv.average = Math.round((iv.hp + iv.attack + iv.defense) / 3);
  return {
    ...pal,
    palId,
    name: pal.nickname || meta.name || palId || "-",
    speciesName: meta.name || palId || "-",
    lucky: Boolean(pal.lucky ?? pal.is_lucky),
    alpha: Boolean(pal.alpha ?? pal.is_boss ?? /^boss_/i.test(rawId)),
    stars: Math.max(0, number(pal.stars ?? pal.rank) - (pal.stars == null ? 1 : 0)),
    attack: number(pal.attack ?? details.attack),
    defenseStat: number(pal.defense_stat ?? details.defense),
    workSpeed: number(pal.work_speed ?? pal.workspeed ?? 70),
    iv,
    passives,
    equippedSkills: active(pal.equipped_skills),
    masteredSkills: active(pal.mastered_skills),
    workSuitabilities,
    partnerSkill: context.partners.get(key) || null,
    ownerName: pal.base_name || pal.owner_name || pal.owner_uid || "-",
    ownerKind: pal.location_kind === "base" ? "base" : "player",
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
