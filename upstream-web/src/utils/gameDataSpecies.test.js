import test from "node:test";
import assert from "node:assert/strict";
import { makeMetadataContext, normalizePal } from "./gameDataCore.js";

const context = makeMetadataContext({
  game: { pals: { Anubis: { name: "Anubis", rarity: 10 } } },
  work: { Anubis: { Handcraft: 4, Mining: 3 } },
  detail: { pals: { Anubis: { attack: 130, defense: 100 } } },
  partner: { Anubis: { name: "Guardian of the Desert" } },
  workers: { Anubis: { max_full_stomach: 540 } },
  species: {
    pals: {
      Anubis: {
        no: "139",
        name: "Anubis",
        elements: ["Earth"],
        food: 6,
        baseStats: { hp: 120, attack: 130, defense: 100, workSpeed: 100 },
        movement: { walk: 80, run: 800, stamina: 100 },
        levelSkills: [{ id: "GroundPunch", level: 1, name: "Ground Punch" }],
        drops: [{ id: "Bone", name: "Bone" }],
      },
    },
    aliases: { Raid_Anubis: "Anubis" },
  },
});

test("merges catalog data without presenting species stats as current stats", () => {
  const pal = normalizePal({
    type: "Raid_Anubis",
    hp: 123450,
    max_hp: 0,
    full_stomach: 270,
    sanity: 88,
    rank_hp: 2,
    rank_attack: 3,
    attack: 142,
    defense_stat: 119,
    workspeed: 137,
    work_suitability_add_rank: { Mining: 2, Collection: 1 },
    current_work_suitability: "EPalWorkSuitability::Mining",
    disabled_work: ["EPalWorkSuitability::Transport"],
  }, context);

  assert.equal(pal.speciesId, "Anubis");
  assert.equal(pal.species.no, "139");
  assert.deepEqual(pal.species.elements, ["Earth"]);
  assert.equal(pal.species.baseStats.attack, 130);
  assert.equal(pal.currentHp, 123.45);
  assert.equal(pal.maxHp, null);
  assert.equal(pal.hungerPercent, 50);
  assert.equal(pal.rankBoosts.hp, 2);
  assert.equal(pal.attack, 142);
  assert.equal(pal.defenseStat, 119);
  assert.equal(pal.workSpeed, 137);
  assert.equal(pal.workSuitabilitySource, "save-bonus");
  assert.deepEqual(
    pal.workSuitabilities.map(({ id, level }) => ({ id, level })),
    [{ id: "Handcraft", level: 4 }, { id: "Mining", level: 5 }, { id: "Collection", level: 1 }],
  );
  assert.deepEqual(pal.species.workSuitabilities.map(({ id, level }) => ({ id, level })), [
    { id: "Handcraft", level: 4 }, { id: "Mining", level: 3 },
  ]);
  assert.equal(pal.currentWork, "Mining");
  assert.deepEqual(pal.disabledWork, ["Transport"]);
  assert.equal(pal.species.levelSkills[0].level, 1);
});

test("preserves missing IVs instead of fabricating zero values", () => {
  const pal = normalizePal({ type: "Anubis" }, context);
  assert.equal(pal.iv.hp, null);
  assert.equal(pal.iv.attack, null);
  assert.equal(pal.iv.defense, null);
  assert.equal(pal.iv.average, null);
});

test("prefers explicit saved work levels over the species baseline", () => {
  const pal = normalizePal({
    type: "Anubis",
    work_suitabilities: { Mining: 5, Handcraft: 2 },
  }, context);

  assert.deepEqual(
    pal.workSuitabilities.map(({ id, level }) => ({ id, level })),
    [{ id: "Mining", level: 5 }, { id: "Handcraft", level: 2 }],
  );
  assert.equal(pal.workSuitabilitySource, "save-explicit");
});

test("applies omitted condensation work bonuses to natural suitabilities", () => {
  const maxRank = normalizePal({ type: "Anubis", rank: 5 }, context);
  assert.deepEqual(
    maxRank.workSuitabilities.map(({ id, level }) => ({ id, level })),
    [{ id: "Handcraft", level: 7 }, { id: "Mining", level: 5 }],
  );
  assert.deepEqual(maxRank.workSuitabilityRankBonus, { Handcraft: 3, Mining: 2 });

  const midRank = normalizePal({ type: "Anubis", rank: 3 }, context);
  assert.deepEqual(
    midRank.workSuitabilities.map(({ id, level }) => ({ id, level })),
    [{ id: "Handcraft", level: 5 }, { id: "Mining", level: 4 }],
  );
});

test("accepts direct stars, preserves camelCase values, and caps combined bonuses", () => {
  const directStars = normalizePal({ type: "Anubis", stars: 3 }, context);
  assert.deepEqual(
    directStars.workSuitabilities.map(({ id, level }) => ({ id, level })),
    [{ id: "Handcraft", level: 6 }, { id: "Mining", level: 4 }],
  );

  const camelExplicit = normalizePal({
    type: "Anubis",
    work_suitabilities: {},
    workSuitabilities: [{ id: "Mining", level: 8 }],
  }, context);
  assert.deepEqual(
    camelExplicit.workSuitabilities.map(({ id, level }) => ({ id, level })),
    [{ id: "Mining", level: 8 }],
  );

  const combined = normalizePal({
    type: "Anubis",
    rank: 5,
    work_suitability_add_rank: {},
    workSuitabilityAddRank: { Handcraft: 8, Mining: 6 },
  }, context);
  assert.deepEqual(
    combined.workSuitabilities.map(({ id, level }) => ({ id, level })),
    [{ id: "Handcraft", level: 10 }, { id: "Mining", level: 10 }],
  );
});

test("detects a work-suitability aura from the partner skill description", () => {
  const auraContext = makeMetadataContext({
    species: {
      pals: {
        Provider: {
          name: "Provider",
          partnerSkill: {
            description: "若它在据点里，其他据点帕鲁的采矿工作适应性等级+1。（不可叠加）",
          },
          workSuitabilities: [{ id: "Mining", level: 4 }],
        },
      },
    },
  });
  assert.equal(normalizePal({ type: "Provider" }, auraContext).workSuitabilityAura, "Mining");
});

test("does not rescale an already normalized maxHp value", () => {
  const pal = normalizePal({ type: "Anubis", maxHp: 987.5 }, context);
  assert.equal(pal.maxHp, 987.5);
});
