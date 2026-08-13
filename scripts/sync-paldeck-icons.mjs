#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const upstreamRevision = "d0167e16a3fd5e640d35366c40b991f80c2b14df";

const sourceRoot = resolve(process.argv[2] || "");
if (!process.argv[2]) {
  throw new Error(
    "Usage: node scripts/sync-paldeck-icons.mjs <palworld-paldeck-cn checkout>",
  );
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const palSourceRoot = join(
  sourceRoot,
  "assets",
  "paldb",
  "image",
  "Pal",
  "Texture",
  "PalIcon",
  "Normal",
);
const workSourceRoot = join(
  sourceRoot,
  "assets",
  "paldb",
  "image",
  "Pal",
  "Texture",
  "UI",
  "InGame",
);
const palFallbackRoot = join(
  repositoryRoot,
  "upstream-web",
  "src",
  "assets",
  "pals",
);
const palTargetRoot = join(
  repositoryRoot,
  "upstream-web",
  "src",
  "assets",
  "pals-hd",
);
const workTargetRoot = join(
  repositoryRoot,
  "upstream-web",
  "src",
  "assets",
  "work-suitability",
);

if (!existsSync(palSourceRoot) || !existsSync(workSourceRoot)) {
  throw new Error(`The supplied checkout does not contain the expected assets: ${sourceRoot}`);
}

let sourceRevision;
try {
  ({ stdout: sourceRevision } = await execFileAsync(
    "git",
    ["-C", sourceRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ));
} catch {
  throw new Error("The supplied source must be a Git checkout of palworld-paldeck-cn.");
}
if (sourceRevision.trim() !== upstreamRevision) {
  throw new Error(
    `Expected palworld-paldeck-cn revision ${upstreamRevision}, found ${sourceRevision.trim()}.`,
  );
}

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else files.push(entryPath);
  }
  return files;
};

const sha256 = async (filePath) =>
  createHash("sha256").update(await readFile(filePath)).digest("hex");

await mkdir(palTargetRoot, { recursive: true });
await mkdir(workTargetRoot, { recursive: true });

const directSources = new Map();
for (const source of await walk(palSourceRoot)) {
  const match = /^T_(.+)_icon_normal\.webp$/i.exec(parse(source).base);
  if (!match) continue;
  const palId = match[1].toLowerCase();
  if (existsSync(join(palFallbackRoot, `${palId}.png`))) {
    directSources.set(palId, source);
  }
}

if (directSources.size !== 299) {
  throw new Error(`Expected 299 direct Pal portrait matches, found ${directSources.size}.`);
}

// The existing 64 px set contains verified aliases for Boss, raid, quest,
// tower, and oil-rig variants. Byte-identical originals let those aliases use
// the same upstream portrait without guessing from their names.
const sourceByExistingHash = new Map();
for (const [palId, source] of directSources) {
  const existingHash = await sha256(join(palFallbackRoot, `${palId}.png`));
  const previousSource = sourceByExistingHash.get(existingHash);
  if (previousSource && (await sha256(previousSource)) !== (await sha256(source))) {
    throw new Error(`Ambiguous portrait alias detected for ${palId}.`);
  }
  sourceByExistingHash.set(existingHash, source);
}

const portraits = [];
for (const entry of await readdir(palFallbackRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) continue;
  const existingPath = join(palFallbackRoot, entry.name);
  const source = sourceByExistingHash.get(await sha256(existingPath));
  if (!source) continue;
  portraits.push({ source, targetName: `${parse(entry.name).name}.webp` });
}

if (portraits.length !== 396) {
  throw new Error(`Expected 396 Pal portrait targets, found ${portraits.length}.`);
}

const portraitTargetNames = new Set(portraits.map(({ targetName }) => targetName));
for (const entry of await readdir(palTargetRoot, { withFileTypes: true })) {
  if (
    entry.isFile() &&
    entry.name.toLowerCase().endsWith(".webp") &&
    !portraitTargetNames.has(entry.name)
  ) {
    await unlink(join(palTargetRoot, entry.name));
  }
}
for (const { source, targetName } of portraits) {
  await copyFile(source, join(palTargetRoot, targetName));
}

const workNumbers = ["00", "01", "02", "03", "04", "05", "06", "07", "08", "10", "11", "12"];
const workTargetNames = new Set(workNumbers.map((number) => `palwork_${number}.webp`));
for (const entry of await readdir(workTargetRoot, { withFileTypes: true })) {
  if (
    entry.isFile() &&
    entry.name.toLowerCase().endsWith(".webp") &&
    !workTargetNames.has(entry.name)
  ) {
    await unlink(join(workTargetRoot, entry.name));
  }
}
for (const number of workNumbers) {
  await copyFile(
    join(workSourceRoot, `T_icon_palwork_${number}.webp`),
    join(workTargetRoot, `palwork_${number}.webp`),
  );
}

console.log(
  `Updated ${portraits.length} Pal portraits and ${workNumbers.length} work suitability icons from ${upstreamRevision}.`,
);
