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
    current_work_suitability: "EPalWorkSuitability::Mining",
    disabled_work: ["EPalWorkSuitability::Transport"],
  }, context);

  assert.equal(pal.speciesId, "Anubis");
  assert.equal(pal.species.no, "139");
  assert.deepEqual(pal.species.elements, ["Earth"]);
  assert.equal(pal.species.baseStats.attack, 130);
  assert.equal(pal.attack, null);
  assert.equal(pal.currentHp, 123.45);
  assert.equal(pal.maxHp, null);
  assert.equal(pal.hungerPercent, 50);
  assert.equal(pal.rankBoosts.hp, 2);
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

test("does not rescale an already normalized maxHp value", () => {
  const pal = normalizePal({ type: "Anubis", maxHp: 987.5 }, context);
  assert.equal(pal.maxHp, 987.5);
});
