import test from "node:test";
import assert from "node:assert/strict";
import {
  passiveTier,
  passiveTierLabel,
  workSuitabilityTone,
} from "./palPresentation.js";

test("maps Palworld passive ranks to their visible rarity tiers", () => {
  assert.equal(passiveTier(-3), "negative");
  assert.equal(passiveTier(0), "common");
  assert.equal(passiveTier(1), "common");
  assert.equal(passiveTier(2), "gold");
  assert.equal(passiveTier(3), "gold");
  assert.equal(passiveTier(4), "rainbow");
  assert.equal(passiveTier(5), "rainbow");
  assert.equal(passiveTier(undefined), "common");
});

test("localizes passive tier labels", () => {
  assert.equal(passiveTierLabel(3, "zh-CN"), "金色");
  assert.equal(passiveTierLabel(4, "en-US"), "Rainbow");
  assert.equal(passiveTierLabel(-1, "zh"), "负面");
});

test("provides stable visual tones for work suitability icons", () => {
  assert.equal(workSuitabilityTone("EmitFlame"), "flame");
  assert.equal(
    workSuitabilityTone("EPalWorkSuitability::GenerateElectricity"),
    "electric",
  );
  assert.equal(workSuitabilityTone("FutureWorkType"), "neutral");
});
