import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBaseWorkSuitabilityAuras,
  filterAndSortPals,
  makeMetadataContext,
  normalizeInventory,
  normalizePal,
  workSuitabilityCondensationBonus,
} from "./gameDataCore.js";

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
  assert.equal(pal.workSuitabilities[0].level, 6);
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

test("replays single- and two-work condensation cycles", () => {
  assert.deepEqual(
    workSuitabilityCondensationBonus([{ id: "Collection", level: 2 }], 4),
    { Collection: 4 },
  );
  assert.deepEqual(
    workSuitabilityCondensationBonus([
      { id: "Watering", level: 3 },
      { id: "Transport", level: 2 },
    ], 3),
    { Watering: 2, Transport: 1 },
  );
});

test("uses Farming catch-up and the third-turn lowest-level rule", () => {
  assert.deepEqual(
    workSuitabilityCondensationBonus([
      { id: "Watering", level: 2 },
      { id: "Mining", level: 2 },
      { id: "Transport", level: 1 },
      { id: "MonsterFarm", level: 1 },
    ], 3),
    { MonsterFarm: 2, Transport: 1 },
  );
  assert.deepEqual(
    workSuitabilityCondensationBonus([
      { id: "Seeding", level: 4 },
      { id: "Handcraft", level: 4 },
      { id: "Collection", level: 4 },
      { id: "Deforest", level: 3 },
      { id: "ProductMedicine", level: 4 },
    ], 3),
    { Seeding: 1, Handcraft: 1, Deforest: 1 },
  );
});

test("breaks equal work levels in the in-game panel order", () => {
  assert.deepEqual(
    workSuitabilityCondensationBonus([
      { id: "Transport", level: 2 },
      { id: "Cool", level: 2 },
      { id: "ProductMedicine", level: 2 },
      { id: "OilExtraction", level: 2 },
    ], 1),
    { OilExtraction: 1 },
  );
});

test("applies a non-stacking Base aura only to other Pals and caps at ten", () => {
  const provider = {
    workSuitabilityAura: "Mining",
    workSuitabilitySource: "species-base",
    workSuitabilities: [{ id: "Mining", level: 4 }],
  };
  const worker = {
    workSuitabilitySource: "save-bonus",
    workSuitabilities: [{ id: "Mining", level: 9 }],
  };
  const cappedWorker = {
    workSuitabilitySource: "save-bonus",
    workSuitabilities: [{ id: "Mining", level: 10 }],
  };
  const once = applyBaseWorkSuitabilityAuras([provider, worker, cappedWorker]);
  assert.equal(once[0].workSuitabilities[0].level, 4);
  assert.equal(once[1].workSuitabilities[0].level, 10);
  assert.deepEqual(once[1].workSuitabilityBaseAuraBonus, { Mining: 1 });
  assert.equal(once[1].workSuitabilitySource, "base-current");
  assert.equal(once[2].workSuitabilities[0].level, 10);
  assert.deepEqual(once[2].workSuitabilityBaseAuraBonus, {});

  const twice = applyBaseWorkSuitabilityAuras(once);
  assert.equal(twice[1].workSuitabilities[0].level, 10);
  assert.deepEqual(twice[1].workSuitabilityBaseAuraBonus, { Mining: 1 });

  const withDuplicateProvider = applyBaseWorkSuitabilityAuras([provider, provider, worker]);
  assert.equal(withDuplicateProvider[2].workSuitabilities[0].level, 10);
  assert.deepEqual(withDuplicateProvider[2].workSuitabilityBaseAuraBonus, { Mining: 1 });
});
