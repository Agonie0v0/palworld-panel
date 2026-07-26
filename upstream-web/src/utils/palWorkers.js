const asArray = (value) => (Array.isArray(value) ? value : []);

const clampPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, number));
};

export const palAssetKey = (type = "") => String(type).trim().toLowerCase();

export const buildPalWorkerRows = (bases = [], palNames = {}) =>
  asArray(bases).flatMap((base, baseIndex) => {
    const baseId = String(base?.id || `base-${baseIndex + 1}`);
    const baseName =
      base?.display_name || base?.name || base?.id || `Base ${baseIndex + 1}`;

    return asArray(base?.workers).map((worker, workerIndex) => {
      const type = String(
        worker?.palId || worker?.type || worker?.pal_id || worker?.name || "",
      );
      const conditions = asArray(worker?.conditions || worker?.diseases).filter(
        Boolean,
      );
      const hunger = clampPercent(
        worker?.hunger_percent ?? worker?.full_stomach,
      );
      const sanity = clampPercent(worker?.sanity);

      return {
        id: worker?.instance_id || `${baseId}:${workerIndex}`,
        baseId,
        baseName,
        guildName: worker?.guild_name || "",
        type,
        assetKey: palAssetKey(type),
        name: worker?.name || worker?.nickname || palNames[type] || type || "-",
        speciesName: worker?.speciesName || palNames[type] || type || "-",
        level: Number(worker?.level || 0),
        stars: Number(worker?.stars || 0),
        lucky: Boolean(worker?.lucky ?? worker?.is_lucky),
        alpha: Boolean(worker?.alpha ?? worker?.is_boss),
        gender: worker?.gender || "",
        hp: Number(worker?.hp || 0),
        maxHp: Number(worker?.max_hp || 0),
        workSpeed: Number(worker?.workSpeed ?? worker?.workspeed ?? 0),
        iv: worker?.iv || { hp: 0, attack: 0, defense: 0, average: 0 },
        passives: asArray(worker?.passives),
        equippedSkills: asArray(worker?.equippedSkills),
        masteredSkills: asArray(worker?.masteredSkills),
        partnerSkill: worker?.partnerSkill || null,
        workSuitabilities: asArray(worker?.workSuitabilities),
        disabledWork: asArray(worker?.disabled_work || worker?.disabledWork),
        activityKind: worker?.activity?.kind || "autonomous",
        activityLabel:
          worker?.activity?.label || worker?.current_work_suitability || "-",
        activityDetail: worker?.activity?.detail || "",
        workSuitability: worker?.current_work_suitability || "",
        facility: worker?.facility || worker?.activity?.facility || "",
        hunger,
        sanity,
        conditions,
        attention: Boolean(worker?.needs_attention || conditions.length),
        raw: worker,
      };
    });
  });

export const filterPalWorkerRows = (
  rows = [],
  {
    baseId = "all",
    search = "",
    attentionOnly = false,
    work = [],
    passives = [],
  } = {},
) => {
  const query = String(search).trim().toLowerCase();
  const selectedWork = asArray(work);
  const selectedPassives = asArray(passives);
  return asArray(rows).filter((row) => {
    if (baseId !== "all" && row.baseId !== String(baseId)) return false;
    if (attentionOnly && !row.attention) return false;
    const workIds = new Set(asArray(row.workSuitabilities).map((item) => item.id));
    if (!selectedWork.every((id) => workIds.has(id))) return false;
    const passiveIds = new Set(asArray(row.passives).map((item) => item.id));
    if (!selectedPassives.every((id) => passiveIds.has(id))) return false;
    if (!query) return true;
    return [
      row.name,
      row.speciesName,
      row.type,
      row.baseName,
      row.guildName,
      row.activityLabel,
      row.facility,
      ...asArray(row.conditions),
      ...asArray(row.workSuitabilities).map((item) => item.id),
      ...asArray(row.passives).flatMap((item) => [item.id, item.name]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
};
