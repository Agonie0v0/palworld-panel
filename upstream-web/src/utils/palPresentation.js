const WORK_TONES = {
  EmitFlame: "flame",
  Watering: "water",
  Seeding: "plant",
  GenerateElectricity: "electric",
  Handcraft: "handcraft",
  Collection: "gathering",
  Deforest: "lumbering",
  Mining: "mining",
  ProductMedicine: "medicine",
  Cool: "cooling",
  Transport: "transport",
  MonsterFarm: "farming",
};

export const workSuitabilityTone = (id = "") =>
  WORK_TONES[String(id).replace(/^EPalWorkSuitability::/i, "")] || "neutral";

// Palworld's metadata ranks group into the same visual tiers used in-game.
export const passiveTier = (rank) => {
  const value = Number(rank);
  if (!Number.isFinite(value)) return "common";
  if (value < 0) return "negative";
  if (value >= 4) return "rainbow";
  if (value >= 2) return "gold";
  return "common";
};

const PASSIVE_TIER_LABELS = {
  zh: {
    negative: "负面",
    common: "普通",
    gold: "金色",
    rainbow: "彩色",
  },
  en: {
    negative: "Negative",
    common: "Common",
    gold: "Gold",
    rainbow: "Rainbow",
  },
};

export const passiveTierLabel = (rank, locale = "en") => {
  const language = String(locale).toLowerCase().startsWith("zh") ? "zh" : "en";
  return PASSIVE_TIER_LABELS[language][passiveTier(rank)];
};
