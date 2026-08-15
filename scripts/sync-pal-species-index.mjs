#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PALDECK_REVISION = "d0167e16a3fd5e640d35366c40b991f80c2b14df";
const ATLAS_REVISION = "add14423f623c45836ed31f4a180c2adfa8b0ab7";
const ATLAS_BUILD = "24088465";
const PALCALC_REVISION = "c59712e24b839a0bedef16b06a1a0117e8741fe3";
const PALCALC_VERSION = "v27";

const [, , paldeckArgument, atlasArgument, palcalcArgument] = process.argv;
if (!paldeckArgument || !atlasArgument || !palcalcArgument) {
  throw new Error(
    "Usage: node scripts/sync-pal-species-index.mjs <palworld-paldeck-cn checkout> <palworld-atlas-data checkout> <PalCalc checkout>",
  );
}

const paldeckRoot = resolve(paldeckArgument);
const atlasRoot = resolve(atlasArgument);
const palcalcRoot = resolve(palcalcArgument);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = join(
  repositoryRoot,
  "upstream-web",
  "src",
  "assets",
  "game-data",
  "pal_species_index.json",
);
const portraitRoot = join(repositoryRoot, "upstream-web", "src", "assets", "pals");
const workerIndexPath = join(
  repositoryRoot,
  "upstream-web",
  "src",
  "assets",
  "game-data",
  "worker_pal_index.json",
);
const gameIndexPath = join(
  repositoryRoot,
  "upstream-web",
  "src",
  "assets",
  "game-data",
  "game_index.json",
);
const workIndexPath = join(
  repositoryRoot,
  "upstream-web",
  "src",
  "assets",
  "game-data",
  "pal_work_index.json",
);
const paldeckDataPath = join(paldeckRoot, "src", "js", "data", "pals.js");
const atlasBuildRoot = join(atlasRoot, "published", "v1", "builds", ATLAS_BUILD);
const atlasPalsRoot = join(atlasBuildRoot, "pals");
const palcalcDatabasePath = join(palcalcRoot, "PalCalc.Model", "db.json");

for (const requiredPath of [
  paldeckDataPath,
  atlasPalsRoot,
  join(atlasBuildRoot, "manifest.json"),
  portraitRoot,
  workerIndexPath,
  gameIndexPath,
  workIndexPath,
  palcalcDatabasePath,
]) {
  if (!existsSync(requiredPath)) throw new Error(`Required input does not exist: ${requiredPath}`);
}

const verifyRevision = async (root, expected, project) => {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }));
  } catch {
    throw new Error(`${project} source must be a Git checkout.`);
  }
  const revision = stdout.trim();
  if (revision !== expected) {
    throw new Error(`${project}: expected revision ${expected}, found ${revision}.`);
  }
};

await verifyRevision(paldeckRoot, PALDECK_REVISION, "palworld-paldeck-cn");
await verifyRevision(atlasRoot, ATLAS_REVISION, "palworld-atlas-data");
await verifyRevision(palcalcRoot, PALCALC_REVISION, "PalCalc");

const manifest = JSON.parse(await readFile(join(atlasBuildRoot, "manifest.json"), "utf8"));
if (String(manifest.steamBuildId) !== ATLAS_BUILD || manifest.counts?.pals !== 289) {
  throw new Error(`Unexpected palworld-atlas-data manifest for build ${ATLAS_BUILD}.`);
}

const { PALS } = await import(`${pathToFileURL(paldeckDataPath).href}?revision=${PALDECK_REVISION}`);
if (!Array.isArray(PALS) || PALS.length !== 299) {
  throw new Error(`Expected 299 palworld-paldeck-cn records, found ${PALS?.length ?? 0}.`);
}

const atlasPals = new Map();
for (const filename of await readdir(atlasPalsRoot)) {
  if (!filename.endsWith(".json") || filename === "index.json") continue;
  const record = JSON.parse(await readFile(join(atlasPalsRoot, filename), "utf8"));
  if (record.id) atlasPals.set(record.id, record);
}
if (atlasPals.size !== 289) {
  throw new Error(`Expected 289 palworld-atlas-data Pal records, found ${atlasPals.size}.`);
}

const palcalcDatabase = JSON.parse(await readFile(palcalcDatabasePath, "utf8"));
if (palcalcDatabase.Version !== PALCALC_VERSION || palcalcDatabase.Pals?.length !== 299) {
  throw new Error(`Expected PalCalc ${PALCALC_VERSION} with 299 Pal records.`);
}
const palcalcPals = new Map(palcalcDatabase.Pals.map((pal) => [pal.InternalName, pal]));

const characterIdFromPortrait = (pal) => {
  const match = /T_(.+)_icon_normal\.webp$/i.exec(pal.image || "");
  if (!match) throw new Error(`Cannot determine CharacterID for ${pal.id}.`);
  return match[1];
};

const splitElements = (value) =>
  String(value || "")
    .split("/")
    .map((element) => element.trim())
    .filter(Boolean);

const statsMap = (stats) => Object.fromEntries((stats || []).map(([name, value]) => [name, Number(value)]));
const compactWork = (work, idsByLevel) => {
  return (work || []).map(({ name, level }) => {
    const matchingIds = Object.entries(idsByLevel || {})
      .filter(([, candidateLevel]) => Number(candidateLevel) === Number(level))
      .map(([id]) => id);
    const nameToId = {
      生火: "EmitFlame",
      浇水: "Watering",
      播种: "Seeding",
      发电: "GenerateElectricity",
      手工作业: "Handcraft",
      采集: "Collection",
      伐木: "Deforest",
      采矿: "Mining",
      制药: "ProductMedicine",
      冷却: "Cool",
      搬运: "Transport",
      牧场: "MonsterFarm",
    };
    const id = nameToId[name];
    if (!id) throw new Error(`Cannot match work suitability: ${name} ${level}.`);
    return { id, name, level };
  });
};
const compactDrops = (drops) =>
  (drops || []).map(({ name, amount, chance }) => ({ name, amount, chance }));
const compactSkills = (skills) =>
  (skills || []).map(({ level, name, element, power, cooldown, description }) => ({
    level,
    name,
    element,
    power,
    cooldown,
    description,
  }));

const workerIndex = JSON.parse(await readFile(workerIndexPath, "utf8"));
const workerIndexByLowercase = new Map(
  Object.entries(workerIndex).map(([id, value]) => [id.toLowerCase(), value]),
);
const workIndex = JSON.parse(await readFile(workIndexPath, "utf8"));
const activeSkillIdsBySignature = new Map();
for (const skill of palcalcDatabase.ActiveSkills) {
  const signature = `${skill.LocalizedNames?.["zh-Hans"]}|${skill.Power}|${skill.CooldownSeconds}`;
  activeSkillIdsBySignature.set(signature, [
    ...(activeSkillIdsBySignature.get(signature) || []),
    skill.InternalName,
  ]);
}
const pals = {};
const baseIdsByLowercase = new Map();
for (const pal of PALS) {
  const characterId = characterIdFromPortrait(pal);
  if (pals[characterId]) throw new Error(`Duplicate CharacterID: ${characterId}.`);
  baseIdsByLowercase.set(characterId.toLowerCase(), characterId);

  const atlasPal = atlasPals.get(characterId);
  const palcalcPal = palcalcPals.get(characterId);
  const displayStats = statsMap(pal.stats);
  pals[characterId] = {
    no: pal.no || null,
    name: pal.name,
    englishName: pal.englishName,
    elements: splitElements(pal.element),
    rarity: palcalcPal?.Rarity ?? atlasPal?.rarity ?? null,
    description: pal.description || null,
    partnerSkill: pal.partnerSkill
      ? { name: pal.partnerSkill.name, description: pal.partnerSkill.summary }
      : null,
    workSuitabilities: compactWork(pal.work, workIndex[characterId]),
    food: palcalcPal?.FoodAmount ?? atlasPal?.food ?? null,
    maxFullStomach:
      palcalcPal?.MaxFullStomach ??
      workerIndexByLowercase.get(characterId.toLowerCase())?.max_full_stomach ??
      null,
    baseStats: {
      hp: palcalcPal?.Hp ?? atlasPal?.hp ?? null,
      attack: palcalcPal?.Attack ?? atlasPal?.attack ?? null,
      defense: palcalcPal?.Defense ?? atlasPal?.defense ?? null,
      workSpeed: displayStats["工作速度"] ?? null,
    },
    movement: {
      walk: palcalcPal?.WalkSpeed ?? null,
      run: palcalcPal?.RunSpeed ?? atlasPal?.runSpeed ?? null,
      ride: palcalcPal?.RideSprintSpeed ?? null,
      swim: null,
      transport: palcalcPal?.TransportSpeed ?? null,
      stamina: palcalcPal?.Stamina ?? atlasPal?.stamina ?? null,
    },
    levelSkills: compactSkills(pal.skills).map((skill) => {
      const candidates = activeSkillIdsBySignature.get(
        `${skill.name}|${skill.power}|${skill.cooldown}`,
      ) || [];
      const comparableCharacterId = characterId.toLowerCase().replace(/_ice$/, "");
      const id =
        candidates.length === 1
          ? candidates[0]
          : candidates.find((candidate) =>
              candidate.toLowerCase().includes(comparableCharacterId),
            );
      if (!id) throw new Error(`Cannot uniquely match active skill: ${skill.name}.`);
      return { id, ...skill };
    }),
    drops: compactDrops(pal.drops),
  };
}

// Existing portrait aliases are verified byte-for-byte. This covers Boss,
// raid, quest, tower and oil-rig CharacterIDs without guessing from names.
const sha256 = async (filePath) =>
  createHash("sha256").update(await readFile(filePath)).digest("hex");
const baseIdByPortraitHash = new Map();
for (const characterId of Object.keys(pals)) {
  const portraitPath = join(portraitRoot, `${characterId.toLowerCase()}.png`);
  if (!existsSync(portraitPath)) throw new Error(`Missing base portrait: ${portraitPath}`);
  const hash = await sha256(portraitPath);
  if (baseIdByPortraitHash.has(hash)) throw new Error(`Ambiguous base portrait: ${characterId}.`);
  baseIdByPortraitHash.set(hash, characterId);
}

const gameIndex = JSON.parse(await readFile(gameIndexPath, "utf8"));
const knownCasing = new Map(
  [...Object.keys(gameIndex.pals || {}), ...Object.keys(workerIndex)].map((id) => [id.toLowerCase(), id]),
);
const aliases = {};
for (const filename of await readdir(portraitRoot)) {
  if (!filename.toLowerCase().endsWith(".png")) continue;
  const lowercaseId = basename(filename, ".png").toLowerCase();
  if (baseIdsByLowercase.has(lowercaseId)) continue;
  const baseId = baseIdByPortraitHash.get(await sha256(join(portraitRoot, filename)));
  if (!baseId) continue;
  aliases[knownCasing.get(lowercaseId) || basename(filename, ".png")] = baseId;
}

const atlasCoverage = Object.keys(pals).filter((id) => atlasPals.has(id)).length;
const palcalcCoverage = Object.keys(pals).filter((id) => palcalcPals.has(id)).length;
if (
  Object.keys(pals).length !== 299 ||
  atlasCoverage !== 288 ||
  palcalcCoverage !== 298 ||
  Object.keys(aliases).length !== 97
) {
  throw new Error(
    `Integrity check failed: pals=${Object.keys(pals).length}, atlas=${atlasCoverage}, PalCalc=${palcalcCoverage}, aliases=${Object.keys(aliases).length}.`,
  );
}

const result = {
  version: 1,
  sources: {
    paldeck: { revision: PALDECK_REVISION },
    atlas: { revision: ATLAS_REVISION, steamBuildId: ATLAS_BUILD },
    palcalc: { revision: PALCALC_REVISION, version: PALCALC_VERSION },
  },
  pals,
  aliases,
};
await writeFile(targetPath, `${JSON.stringify(result)}\n`, "utf8");

const skills = Object.values(pals).reduce((count, pal) => count + pal.levelSkills.length, 0);
const drops = Object.values(pals).reduce((count, pal) => count + pal.drops.length, 0);
console.log(
  `Updated ${Object.keys(pals).length} Pal species (${palcalcCoverage} with complete base/movement stats), ${Object.keys(aliases).length} CharacterID aliases, ${skills} skills and ${drops} drops.`,
);
