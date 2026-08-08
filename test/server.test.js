const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createBackup,
  decodeRconResponse,
  encodeRconCommand,
  exec,
  formatPlayerMessage,
  isDue,
  isWhitelisted,
  issueAuthToken,
  decodeAuthToken,
  normalizeLivePlayers,
  normalizeServerUpdateCheckIntervalHours,
  nativeServerExecutablePaths,
  normalizeNetServerMaxTickRate,
  parseDfOutput,
  parseEngineNetServerMaxTickRate,
  parsePsOutput,
  parseRconInfo,
  parseShowPlayers,
  parseSteamPublicBuild,
  playerUidFromId,
  productionInventoryDiff,
  productionInventorySnapshot,
  publicOfflineProductionState,
  readInstalledServerBuild,
  staticCacheControl,
  systemdUpdaterInvocation,
  testSaveSource,
  testRestConnection,
  trimBackups,
  verifyAuthToken,
  permissionsForRole,
  principalCan,
  watchdogSettings,
  updateEngineNetServerMaxTickRate,
  writeSettingsFile
} = require("../src/server");

test("backup publication is atomic and failed archives are removed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "palworld-backup-atomic-"));
  const source = path.join(root, "save");
  const backupDir = path.join(root, "backups");
  const config = {
    server: { saveDir: source, backupDir },
    automation: { saveSourceMode: "directory" }
  };
  try {
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "Level.sav"), "save-data");
    const created = await createBackup(config);
    assert.equal(created.ok, true, created.stderr);
    assert.match(path.basename(created.backup), /^palworld-save-.*\.tar\.gz$/);
    assert.deepEqual((await fs.readdir(backupDir)).filter((name) => name.endsWith(".partial")), []);

    await fs.rm(source, { recursive: true, force: true });
    const failed = await createBackup(config);
    assert.equal(failed.ok, false);
    assert.equal(failed.backup, undefined);
    assert.deepEqual((await fs.readdir(backupDir)).filter((name) => name.endsWith(".partial")), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("server settings can be rewritten after the game process has stopped", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "palworld-settings-sync-"));
  const settingsPath = path.join(root, "Pal", "Saved", "Config", "LinuxServer", "PalWorldSettings.ini");
  try {
    await writeSettingsFile({
      server: { settingsPath },
      settings: {
        BaseCampMaxNumInGuild: 50,
        MaxBuildingLimitNum: 0,
      },
    });
    const ini = await fs.readFile(settingsPath, "utf8");
    assert.match(ini, /BaseCampMaxNumInGuild=50/);
    assert.match(ini, /MaxBuildingLimitNum=0/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Engine.ini tick rate parsing only reads the IpNetDriver section", () => {
  assert.equal(parseEngineNetServerMaxTickRate("[Core.System]\nNetServerMaxTickRate=120\n"), null);
  assert.equal(parseEngineNetServerMaxTickRate([
    "[Core.System]",
    "Paths=../../../Engine/Content",
    "",
    "[/Script/OnlineSubsystemUtils.IpNetDriver]",
    "NetServerMaxTickRate=90",
  ].join("\n")), 90);
});

test("Engine.ini tick rate updates preserve unrelated sections", () => {
  const source = "[Core.System]\r\nPaths=../../../Engine/Content\r\n";
  const updated = updateEngineNetServerMaxTickRate(source, 60);
  assert.match(updated, /\[Core\.System\]\r\nPaths=\.\.\/\.\.\/\.\.\/Engine\/Content/);
  assert.match(updated, /\[\/Script\/OnlineSubsystemUtils\.IpNetDriver\]\r\nNetServerMaxTickRate=60/);
});

test("Engine.ini tick rate updates replace existing values without duplicates", () => {
  const updated = updateEngineNetServerMaxTickRate([
    "[/Script/OnlineSubsystemUtils.IpNetDriver]",
    "NetServerMaxTickRate = 30",
    "NetServerMaxTickRate=45",
    "",
    "[Other.Section]",
    "Enabled=True",
  ].join("\n"), 120);
  assert.equal((updated.match(/NetServerMaxTickRate/gi) || []).length, 1);
  assert.match(updated, /NetServerMaxTickRate\s*=\s*120/);
  assert.match(updated, /\[Other\.Section\]\nEnabled=True/);
});

test("server tick rate validation accepts only integer values from 30 through 120", () => {
  assert.equal(normalizeNetServerMaxTickRate(30), 30);
  assert.equal(normalizeNetServerMaxTickRate("120"), 120);
  for (const value of [29, 121, 59.5, "fast", null]) {
    assert.throws(() => normalizeNetServerMaxTickRate(value), /integer between 30 and 120/);
  }
});

test("Steam public branch metadata exposes the latest build and Linux manifest", () => {
  assert.deepEqual(parseSteamPublicBuild({
    data: {
      "2394010": {
        depots: {
          branches: { public: { buildid: "24370498", timeupdated: "1785294122" } },
          "2394012": { manifests: { public: { gid: "1078324976643066553" } } },
        },
      },
    },
  }), {
    buildId: "24370498",
    manifestId: "1078324976643066553",
    publishedAt: "2026-07-29T03:02:02.000Z",
  });
});

test("server update check intervals support disabling and clamp unsafe values", () => {
  assert.equal(normalizeServerUpdateCheckIntervalHours(undefined), 24);
  assert.equal(normalizeServerUpdateCheckIntervalHours(0), 0);
  assert.equal(normalizeServerUpdateCheckIntervalHours(6.4), 6);
  assert.equal(normalizeServerUpdateCheckIntervalHours(10000), 720);
});

test("DepotDownloader installs use the newest Linux depot manifest", async () => {
  const installDir = await fs.mkdtemp(path.join(os.tmpdir(), "palworld-update-manifest-"));
  try {
    const depotDir = path.join(installDir, ".DepotDownloader");
    await fs.mkdir(depotDir);
    const oldManifest = path.join(depotDir, "2394012_111.manifest");
    const currentManifest = path.join(depotDir, "2394012_222.manifest");
    await fs.writeFile(oldManifest, "old");
    await fs.writeFile(currentManifest, "current");
    const now = Date.now();
    await fs.utimes(oldManifest, new Date(now - 5000), new Date(now - 5000));
    await fs.utimes(currentManifest, new Date(now), new Date(now));
    assert.deepEqual(await readInstalledServerBuild({ server: { installDir } }), {
      buildId: "",
      manifestId: "222",
      source: "depotdownloader",
      path: currentManifest,
    });
  } finally {
    await fs.rm(installDir, { recursive: true, force: true });
  }
});

test("native updates run as the systemd service user and repair launchers", () => {
  const config = {
    server: {
      installDir: "/opt/palworld/server",
      steamcmdPath: "/opt/depotdownloader/DepotDownloader",
    },
  };
  assert.deepEqual(
    systemdUpdaterInvocation(config, ["-app", "2394010"], "palworld"),
    {
      command: "runuser",
      args: ["-u", "palworld", "--", "/opt/depotdownloader/DepotDownloader", "-app", "2394010"],
    },
  );
  assert.deepEqual(nativeServerExecutablePaths(config), [
    path.resolve("/opt/palworld/server/Pal/Binaries/Linux/PalServer-Linux-Shipping"),
    path.resolve("/opt/palworld/server/PalServer.sh"),
  ]);
});

test("offline production snapshots only include base and guild inventory", () => {
  const snapshot = productionInventorySnapshot({
    inventory: [
      {
        item_id: "Wood",
        locations: [
          { kind: "player", count: 40 },
          { kind: "base", count: 120 },
          { kind: "guild", count: 30 },
        ],
      },
      { item_id: "Stone", locations: [{ kind: "base", count: 75 }] },
    ],
  });
  assert.deepEqual(snapshot, { wood: 150, stone: 75 });
});

test("offline production diffs separate gains from inventory withdrawals", () => {
  const diff = productionInventoryDiff(
    { wood: 100, stone: 80 },
    { wood: 145, stone: 50, fiber: 20 },
  );
  assert.equal(diff.totalGain, 65);
  assert.equal(diff.totalLoss, 30);
  assert.deepEqual(diff.gains.map((row) => [row.item_id, row.delta]), [
    ["wood", 45],
    ["fiber", 20],
  ]);
  assert.deepEqual(diff.losses.map((row) => [row.item_id, row.delta]), [
    ["stone", -30],
  ]);
});

test("offline production public state does not expose raw inventory baselines", () => {
  const value = publicOfflineProductionState({
    current: {
      id: "window-1",
      startedAt: "2026-07-26T10:00:00.000Z",
      lastSampleAt: "2026-07-26T11:00:00.000Z",
      baseline: { wood: 100 },
      latest: { wood: 130 },
    },
    history: [],
  });
  assert.equal(value.current.totalGain, 30);
  assert.equal("baseline" in value.current, false);
  assert.equal("latest" in value.current, false);
});

test("static cache policy refreshes the app shell while retaining hashed assets", () => {
  assert.equal(
    staticCacheControl("/app/upstream-web/dist/index.html"),
    "no-cache, no-store, must-revalidate",
  );
  assert.equal(
    staticCacheControl("/app/upstream-web/dist/assets/index-BV_v5gyY.js"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(
    staticCacheControl("/app/upstream-web/public/map/tiles/0/0/0.png"),
    "public, max-age=3600",
  );
});

test("external commands can return save parser payloads larger than Node's default buffer", async () => {
  const bytes = 2 * 1024 * 1024;
  const result = await exec(process.execPath, ["-e", `process.stdout.write("x".repeat(${bytes}))`]);

  assert.equal(result.ok, true);
  assert.equal(result.stdout.length, bytes);
  assert.equal(result.stderr, "");
});

test("ShowPlayers fallback parses Steam64 IDs and quoted nicknames", () => {
  const players = parseShowPlayers([
    "name,playeruid,steamid",
    '"Player, One",3882655113,76561198841027010',
    "Agonie,2941574151,76561198000000001",
  ].join("\n"));
  assert.equal(players.length, 2);
  assert.equal(players[0].nickname, "Player, One");
  assert.equal(players[0].player_uid, "3882655113");
  assert.equal(players[0].steam_id, "76561198841027010");
  assert.equal(players[0].user_id, "steam_76561198841027010");
});

test("Info fallback extracts the Palworld version and server name", () => {
  assert.deepEqual(
    parseRconInfo("Welcome to Pal Server[v0.7.0.0] Green Grass", "Fallback"),
    { version: "v0.7.0.0", name: "Green Grass" },
  );
});

test("REST requests recover from stale dedicated REST credentials", async (t) => {
  const expected = `Basic ${Buffer.from("admin:current-admin-password").toString("base64")}`;
  const restServer = http.createServer((request, response) => {
    if (request.headers.authorization !== expected) {
      response.writeHead(401, { "content-type": "text/plain" });
      response.end("Unauthorized");
      return;
    }
    const payload = request.url.includes("players")
      ? { players: [] }
      : request.url.includes("metrics")
        ? { serverfps: 60, currentplayernum: 0 }
        : { version: "v0.7.0.0", servername: "Test server" };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => restServer.listen(0, "127.0.0.1", resolve));
  t.after(() => restServer.close());
  const address = restServer.address();
  const live = await testRestConnection({
    server: {
      restHost: "127.0.0.1",
      restPort: address.port,
      restProtocol: "http:",
      restUser: "stale-user",
      restPassword: "stale-password",
    },
    settings: { AdminPassword: "current-admin-password" },
    automation: { restTimeout: 2 },
  });
  assert.equal(live.info.ok, true);
  assert.equal(live.players.ok, true);
  assert.equal(live.metrics.ok, true);
  assert.equal(live.info.credentialSource, "admin-password");
});

function authConfig(passwordHash = "password-hash") {
  return {
    panel: {
      adminInitialized: true,
      adminUser: "admin",
      adminPasswordHash: passwordHash,
      token: "static-token"
    }
  };
}

test("JWT tokens expire and are invalidated when the password changes", () => {
  const now = Date.parse("2026-07-16T00:00:00Z");
  const config = authConfig();
  const token = issueAuthToken(config, now);
  assert.equal(verifyAuthToken(config, token, now + 1000), true);
  assert.equal(verifyAuthToken(config, `${token.slice(0, -1)}x`, now + 1000), false);
  assert.equal(verifyAuthToken(config, token, now + 25 * 60 * 60 * 1000), false);
  assert.equal(verifyAuthToken(authConfig("new-password-hash"), token, now + 1000), false);
});

test("JWT tokens preserve user role and permission checks", () => {
  const config = authConfig();
  const now = Date.now();
  const token = issueAuthToken(config, now, {
    id: "operator-1",
    name: "operator",
    role: "operator",
    tokenVersion: 4,
  });
  const payload = decodeAuthToken(config, token, now + 1000);
  assert.equal(payload.uid, "operator-1");
  assert.equal(payload.sub, "operator");
  assert.equal(payload.role, "operator");
  assert.equal(payload.ver, 4);
  assert.equal(principalCan({ permissions: permissionsForRole("viewer") }, "read"), true);
  assert.equal(principalCan({ permissions: permissionsForRole("viewer") }, "server:write"), false);
  assert.equal(principalCan({ permissions: permissionsForRole("admin") }, "security:write"), true);
});

test("RCON Base64 mode encodes commands and decodes valid responses", () => {
  const command = "Broadcast 服务器维护";
  const encoded = encodeRconCommand(command, true);
  assert.equal(Buffer.from(encoded, "base64").toString("utf8"), command);
  assert.equal(decodeRconResponse(Buffer.from("执行成功", "utf8").toString("base64"), true), "执行成功");
  assert.equal(decodeRconResponse("not-base64", true), "not-base64");
  assert.equal(encodeRconCommand(command, false), command);
});

test("player automation formats messages and matches both whitelist identifiers", () => {
  const player = { nickname: "Agonie", player_uid: "123", steam_id: "456" };
  assert.equal(formatPlayerMessage("{username} joined ({online_num})", player, 2), "Agonie joined (2)");
  assert.equal(isWhitelisted(player, [{ player_uid: "123" }]), true);
  assert.equal(isWhitelisted(player, [{ steam_id: "456" }]), true);
  assert.equal(isWhitelisted(player, [{ player_uid: "999" }]), false);
});

test("official REST player IDs are normalized like the reference project", () => {
  assert.equal(playerUidFromId("0000000affffffff"), "10");
  const players = normalizeLivePlayers({
    players: {
      ok: true,
      data: {
        players: [{ playerId: "0000000affffffff", userId: "steam_456", name: "Agonie", accountName: "A" }]
      }
    }
  });
  assert.deepEqual({
    player_uid: players[0].player_uid,
    user_id: players[0].user_id,
    steam_id: players[0].steam_id,
    nickname: players[0].nickname,
    account_name: players[0].account_name
  }, {
    player_uid: "10",
    user_id: "steam_456",
    steam_id: "456",
    nickname: "Agonie",
    account_name: "A"
  });
});

test("scheduler due checks honor disabled and elapsed intervals", () => {
  assert.equal(isDue(0, 0, 10000), false);
  assert.equal(isDue(1000, 10, 10999), false);
  assert.equal(isDue(1000, 10, 11000), true);
});

test("Linux host metrics parsers normalize disk and process readings", () => {
  assert.deepEqual(parseDfOutput([
    "Filesystem 1024-blocks Used Available Capacity Mounted on",
    "/dev/sda1 100000 75000 25000 75% /"
  ].join("\n")), {
    filesystem: "/dev/sda1",
    total: 102400000,
    used: 76800000,
    available: 25600000,
    usedPercent: 75,
    mount: "/"
  });
  assert.deepEqual(parsePsOutput("12.5 8.4 524288 3661 PalServer"), {
    cpuPercent: 12.5,
    memoryPercent: 8.4,
    memoryBytes: 536870912,
    uptimeSeconds: 3661,
    command: "PalServer"
  });
});

test("watchdog settings stay disabled by default and clamp unsafe values", () => {
  assert.deepEqual(watchdogSettings({}), {
    watchdogEnabled: false,
    watchdogCheckIntervalSeconds: 30,
    watchdogAutoRestart: false,
    watchdogFailureThreshold: 3,
    watchdogMemoryThresholdPercent: 0,
    watchdogMemoryBreachChecks: 2,
    watchdogRestartCooldownMinutes: 15,
    scheduledRestartIntervalHours: 0,
    maintenanceWarningSeconds: 60,
    maintenanceWarningMessage: "Server maintenance restart in {seconds} seconds."
  });
  const settings = watchdogSettings({
    watchdogEnabled: true,
    watchdogCheckIntervalSeconds: 1,
    watchdogFailureThreshold: 99,
    watchdogMemoryThresholdPercent: 120,
    maintenanceWarningSeconds: -1
  });
  assert.equal(settings.watchdogCheckIntervalSeconds, 10);
  assert.equal(settings.watchdogFailureThreshold, 20);
  assert.equal(settings.watchdogMemoryThresholdPercent, 100);
  assert.equal(settings.maintenanceWarningSeconds, 0);
  assert.equal(watchdogSettings({ maintenanceWarningMessage: "" }).maintenanceWarningMessage, "");
});

test("reference PST Agent sources are accepted through the /sync HTTP flow", async () => {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, "/sync");
    response.writeHead(200, { "content-type": "application/zip" });
    response.end("zip-content");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const result = await testSaveSource("agent", `http://127.0.0.1:${address.port}/sync`);
    assert.equal(result.status, "normal");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("backup cleanup applies retention days before the count limit", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "palworld-panel-backups-"));
  try {
    const files = ["old.tar.gz", "newest.tar.gz", "second.zip"];
    for (const file of files) await fs.writeFile(path.join(directory, file), file);
    const now = Date.now();
    await fs.utimes(path.join(directory, "old.tar.gz"), new Date(now - 10 * 86400000), new Date(now - 10 * 86400000));
    await fs.utimes(path.join(directory, "newest.tar.gz"), new Date(now), new Date(now));
    await fs.utimes(path.join(directory, "second.zip"), new Date(now - 1000), new Date(now - 1000));

    const removed = await trimBackups({
      server: { backupDir: directory },
      automation: { backupKeepDays: 7, keepBackups: 1 }
    });
    assert.deepEqual(removed.map((backup) => backup.name).sort(), ["old.tar.gz", "second.zip"]);
    assert.deepEqual(await fs.readdir(directory), ["newest.tar.gz"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("deployment service command binds Palworld to the selected game port", async () => {
  const script = await fs.readFile(
    path.join(__dirname, "..", "scripts", "deploy-palworld-server.sh"),
    "utf8",
  );
  assert.match(script, /EXEC_START="\$BOX64_BIN \$PAL_BINARY Pal -port=\$PUBLIC_PORT/);
  assert.match(script, /PalServer\.sh -port=\$PUBLIC_PORT/);
});
