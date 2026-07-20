const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  decodeRconResponse,
  encodeRconCommand,
  formatPlayerMessage,
  isDue,
  isWhitelisted,
  issueAuthToken,
  decodeAuthToken,
  normalizeLivePlayers,
  parseDfOutput,
  parsePsOutput,
  parseRconInfo,
  parseShowPlayers,
  playerUidFromId,
  testSaveSource,
  testRestConnection,
  trimBackups,
  verifyAuthToken,
  permissionsForRole,
  principalCan,
  watchdogSettings
} = require("../src/server");

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
    maintenanceWarningMessage: "Server maintenance restart in {seconds} seconds.",
    backupBeforeManagedRestart: true
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
