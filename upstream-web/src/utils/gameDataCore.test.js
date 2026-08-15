import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortPals, makeMetadataContext, normalizeInventory, normalizePal } from "./gameDataCore.js";

const context = makeMetadataContext({
  game: { pals: { Anubis: { name: "阿努比斯" } }, items: { wood: { name: "木材", category: "资源" } }, passives: { Rare: "稀有" } },
  work: { Anubis: { Handcraft: 4, Mining: 3 } },
  detail: { pals: { Anubis: { attack: 130, defense: 100 } }, passives: { Rare: { name: "稀有", rank: 3 } } },
  partner: { Anubis: { name: "沙漠守护神" } },
});

test("normalizes Pal metadata and archive fields", () => {
  const pal = normalizePal({ type: "BOSS_Anubis", level: 55, rank: 4, melee: 90, ranged: 80, defense: 70, skills: ["Rare"] }, context);
  assert.equal(pal.speciesName, "阿努比斯");
  assert.equal(pal.alpha, true);
  assert.equal(pal.stars, 3);
  assert.equal(pal.iv.average, 80);
  assert.equal(pal.workSuitabilities[0].level, 5);
  assert.equal(pal.workSuitabilitySource, "save-bonus");
  assert.equal(pal.partnerSkill.name, "沙漠守护神");
});

test("filters Pals by work, passives, and IV", () => {
  const pal = normalizePal({ type: "Anubis", level: 55, melee: 90, ranged: 80, defense: 70, skills: ["Rare"] }, context);
  assert.equal(filterAndSortPals([pal], { work: ["Handcraft"], minWorkLevel: 4, passives: ["Rare"], minIvAverage: 75 }).length, 1);
  assert.equal(filterAndSortPals([pal], { work: ["Handcraft"], minWorkLevel: 5 }).length, 0);
});

test("normalizes inventory metadata without losing locations", () => {
  const [item] = normalizeInventory([{ item_id: "wood", count: 30, locations: [{ slot: 2, count: 30 }] }], context);
  assert.equal(item.name, "木材");
  assert.equal(item.category, "资源");
  assert.equal(item.locations[0].slot, 2);
});
