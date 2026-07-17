const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createAdvancedFeatures } = require("../src/advanced-features");

function helpers() {
  return createAdvancedFeatures({
    dataDir: path.join(os.tmpdir(), "palworld-panel-tests"),
    loadJsonFile: async (_name, fallback) => fallback,
    saveJsonFile: async (_name, value) => value,
  }).__test;
}

test("archive names reject absolute paths and traversal", () => {
  const { validArchiveName } = helpers();
  assert.equal(validArchiveName("SaveGames/0/Level.sav"), true);
  assert.equal(validArchiveName("../Level.sav"), false);
  assert.equal(validArchiveName("SaveGames/../../etc/passwd"), false);
  assert.equal(validArchiveName("C:/Windows/System32/file"), false);
  assert.equal(validArchiveName("/etc/passwd"), false);
});

test("ZIP inspection rejects traversal entries and symbolic links", async () => {
  const { inspectZip } = helpers();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "palworld-zip-test-"));
  const traversal = path.join(directory, "traversal.zip");
  const symlink = path.join(directory, "symlink.zip");
  try {
    await fs.writeFile(
      traversal,
      Buffer.from(
        "UEsDBBQAAAAIAOuN8Vz7OSuCBQAAAAMAAAANAAAALi4vZXNjYXBlLnR4dEtKTAEAUEsBAhQAFAAAAAgA643xXPs5K4IFAAAAAwAAAA0AAAAAAAAAAAAAAIABAAAAAC4uL2VzY2FwZS50eHRQSwUGAAAAAAEAAQA7AAAAMAAAAAAA",
        "base64",
      ),
    );
    await fs.writeFile(
      symlink,
      Buffer.from(
        "UEsDBBQAAAAAAAAAIQD8L29GBgAAAAYAAAAEAAAAbGlua3RhcmdldFBLAQIUAxQAAAAAAAAAIQD8L29GBgAAAAYAAAAEAAAAAAAAAAAAAAD/oQAAAABsaW5rUEsFBgAAAAABAAEAMgAAACgAAAAAAA==",
        "base64",
      ),
    );
    await assert.rejects(inspectZip(traversal), /unsafe|excessive|relative path/i);
    await assert.rejects(inspectZip(symlink), /unsafe or excessive/i);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("WebDAV permits private HTTP endpoints but requires HTTPS for public hosts", () => {
  const { normalizeWebDavConfig } = helpers();
  assert.equal(
    normalizeWebDavConfig({ url: "http://192.168.31.10/dav" }).url,
    "http://192.168.31.10/dav",
  );
  assert.equal(
    normalizeWebDavConfig({ url: "https://dav.example.com/root/" }).url,
    "https://dav.example.com/root",
  );
  assert.throws(
    () => normalizeWebDavConfig({ url: "http://dav.example.com/root" }),
    /must use HTTPS/i,
  );
  assert.throws(
    () => normalizeWebDavConfig({ url: "file:///tmp/backups" }),
    /HTTP or HTTPS/i,
  );
});

test("schedule timing handles intervals, daily rollover, and invalid daily values", () => {
  const { nextScheduleRun } = helpers();
  const from = new Date(2026, 6, 17, 3, 30, 0, 0).getTime();
  assert.equal(
    nextScheduleRun({ mode: "interval", intervalMinutes: 15, lastRun: from }, from),
    from + 15 * 60 * 1000,
  );
  assert.equal(
    nextScheduleRun({ mode: "daily", time: "04:00" }, from),
    new Date(2026, 6, 17, 4, 0, 0, 0).getTime(),
  );
  assert.equal(
    nextScheduleRun({ mode: "daily", time: "03:00" }, from),
    new Date(2026, 6, 18, 3, 0, 0, 0).getTime(),
  );
  assert.equal(
    nextScheduleRun({ mode: "daily", time: "invalid", intervalMinutes: 5 }, from),
    from + 5 * 60 * 1000,
  );
});

test("managed mod paths cannot escape the server installation", () => {
  const { assertModPath } = helpers();
  const config = { server: { installDir: path.resolve("/srv/palworld") } };
  assert.doesNotThrow(() =>
    assertModPath(config, path.resolve("/srv/palworld/Pal/Content/Paks/~mods/example.pak")),
  );
  assert.throws(
    () => assertModPath(config, path.resolve("/srv/other/example.pak")),
    /outside managed directories/i,
  );
});

test("bundled PalCalc data contains the complete pair matrix", async () => {
  const file = path.join(__dirname, "..", "resources", "palcalc", "catalog.json");
  const catalog = JSON.parse(await fs.readFile(file, "utf8"));
  const matrix = Buffer.from(catalog.matrix, "base64");
  const index = new Map(catalog.pals.map((pal, palIndex) => [pal.internal, palIndex]));
  const anubis = index.get("Anubis");
  const child = matrix.readUInt16LE((anubis * catalog.pals.length + anubis) * 2) - 1;
  assert.equal(catalog.source, "PalCalc v1.17.6");
  assert.equal(catalog.pals.length, 299);
  assert.equal(catalog.pals[child].internal, "Anubis");
  assert.equal(matrix.length, catalog.pals.length * catalog.pals.length * 2);
});

test("advanced breeding requests clamp resources and normalize trait lists", () => {
  const { normalizeBreedingInput } = helpers();
  const input = normalizeBreedingInput({
    target: " Anubis ",
    requiredPassives: "Legend, Swift，Legend\nRunner",
    optionalPassives: ["Lucky", "Lucky"],
    minIV: { health: 120, attack: -5, defense: 88 },
    maxSteps: 99,
    maxIterations: 1,
    threads: 999,
  });
  assert.equal(input.target, "Anubis");
  assert.deepEqual(input.requiredPassives, ["Legend", "Swift", "Runner"]);
  assert.deepEqual(input.optionalPassives, ["Lucky"]);
  assert.deepEqual(input.minIV, { health: 100, attack: 0, defense: 88 });
  assert.equal(input.maxSteps, 8);
  assert.equal(input.maxIterations, 100);
  assert.equal(input.threads, 32);
});

test("custom breeding materials are normalized and save hashes are deterministic", () => {
  const { normalizeCustomBreedingPal, breedingSourceHash } = helpers();
  const pal = normalizeCustomBreedingPal({
    type: "Anubis",
    ivHealth: 101,
    ivAttack: 77,
    ivDefense: -1,
    passives: "Legend, Swift, Legend",
  });
  assert.equal(pal.melee, 100);
  assert.equal(pal.ranged, 77);
  assert.equal(pal.defense, 0);
  assert.deepEqual(pal.skills, ["Legend", "Swift"]);
  assert.equal(
    breedingSourceHash([pal, { type: "Lamball" }]),
    breedingSourceHash([{ type: "Lamball" }, pal]),
  );
});
