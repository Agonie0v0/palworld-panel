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
      const type = String(worker?.type || worker?.pal_id || worker?.name || "");
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
        name: worker?.nickname || palNames[type] || type || "-",
        speciesName: palNames[type] || type || "-",
        level: Number(worker?.level || 0),
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
      };
    });
  });

export const filterPalWorkerRows = (
  rows = [],
  { baseId = "all", search = "", attentionOnly = false } = {},
) => {
  const query = String(search).trim().toLowerCase();
  return asArray(rows).filter((row) => {
    if (baseId !== "all" && row.baseId !== String(baseId)) return false;
    if (attentionOnly && !row.attention) return false;
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
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
};
