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

test("Workshop settings validate Steam App IDs and Web API keys", () => {
  const { normalizeWorkshopConfig } = helpers();
  const key = "0123456789ABCDEF0123456789ABCDEF";
  assert.deepEqual(
    normalizeWorkshopConfig({ appId: "1623730", steamApiKey: key }),
    {
      appId: "1623730",
      steamApiKey: key,
      translationUrl: "",
      translationModel: "gpt-4.1-mini",
      translationKey: "",
    },
  );
  assert.equal(
    normalizeWorkshopConfig({ appId: "1623730", steamApiKey: "" }, { steamApiKey: key }).steamApiKey,
    key,
  );
  assert.throws(() => normalizeWorkshopConfig({ appId: "Palworld" }), /numeric/i);
  assert.throws(() => normalizeWorkshopConfig({ steamApiKey: "short" }), /32 hexadecimal/i);
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

test("failed background jobs preserve deployment logs and result details", async () => {
  const store = new Map();
  const features = createAdvancedFeatures({
    dataDir: path.join(os.tmpdir(), "palworld-panel-job-tests"),
    loadJsonFile: async (name, fallback) => store.has(name) ? store.get(name) : fallback,
    saveJsonFile: async (name, value) => {
      store.set(name, value);
      return value;
    },
  });
  const queued = await features.queueJob("server-deploy", "Deploy server", async (progress) => {
    await progress(42, "Installing server", { logs: ["[1/2] Prepare", "[2/2] Install"] });
    const error = new Error("Installation failed");
    error.logs = ["[1/2] Prepare", "[2/2] Install", "disk full"];
    error.result = { code: 1, stderr: "disk full" };
    throw error;
  });

  let failed;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    failed = (store.get("jobs.json") || []).find((job) => job.id === queued.id);
    if (failed?.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.logs, ["[1/2] Prepare", "[2/2] Install", "disk full"]);
  assert.equal(failed.result.stderr, "disk full");
});

test("Workshop item IDs must be numeric and cannot traverse paths", () => {
  const { safeWorkshopId } = helpers();
  assert.equal(safeWorkshopId("123456"), "123456");
  assert.throws(() => safeWorkshopId("../../etc"), /5-20 digit number/i);
  assert.throws(() => safeWorkshopId("abc"), /5-20 digit number/i);
  assert.throws(() => safeWorkshopId(""), /5-20 digit number/i);
});
