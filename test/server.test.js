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
  normalizeLivePlayers,
  playerUidFromId,
  testSaveSource,
  trimBackups,
  verifyAuthToken
} = require("../src/server");

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
