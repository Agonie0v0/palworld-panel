import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPalWorkerRows,
  filterPalWorkerRows,
  palAssetKey,
} from "./palWorkers.js";

const bases = [
  {
    id: "base-a",
    display_name: "据点 1",
    workers: [
      {
        instance_id: "pal-a",
        type: "SheepBall",
        level: 12,
        full_stomach: 18.4,
        sanity: 45,
        activity: { kind: "working", label: "正在采矿" },
        facility: "StonePit",
        workSuitabilities: [{ id: "Mining", level: 2 }],
        passives: [{ id: "Artisan", name: "工匠精神" }],
        conditions: ["饱食度偏低", "SAN 偏低"],
        needs_attention: true,
      },
    ],
  },
  { id: "base-b", display_name: "据点 2", workers: [] },
];

test("maps base workers into visual status records", () => {
  const rows = buildPalWorkerRows(bases, { SheepBall: "棉悠悠" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "棉悠悠");
  assert.equal(rows[0].assetKey, "sheepball");
  assert.equal(rows[0].hunger, 18.4);
  assert.equal(rows[0].attention, true);
  assert.equal(rows[0].workSuitabilities[0].level, 2);
  assert.equal(rows[0].passives[0].name, "工匠精神");
});

test("filters workers by base, attention, and searchable status fields", () => {
  const rows = buildPalWorkerRows(bases, { SheepBall: "棉悠悠" });
  assert.equal(filterPalWorkerRows(rows, { baseId: "base-a" }).length, 1);
  assert.equal(filterPalWorkerRows(rows, { baseId: "base-b" }).length, 0);
  assert.equal(filterPalWorkerRows(rows, { attentionOnly: true }).length, 1);
  assert.equal(filterPalWorkerRows(rows, { search: "采矿" }).length, 1);
  assert.equal(filterPalWorkerRows(rows, { search: "伐木" }).length, 0);
  assert.equal(filterPalWorkerRows(rows, { work: ["Mining"] }).length, 1);
  assert.equal(filterPalWorkerRows(rows, { passives: ["Artisan"] }).length, 1);
  assert.equal(filterPalWorkerRows(rows, { work: ["Watering"] }).length, 0);
});

test("normalizes Pal type names for portrait assets", () => {
  assert.equal(palAssetKey("BOSS_Anubis"), "boss_anubis");
});
