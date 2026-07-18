const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createUpstreamCompatibility,
  normalizePlayer,
  sameStablePlayer,
} = require("../src/upstream-compat");

test("players with the same nickname do not share online state without a stable ID match", () => {
  const saved = { player_uid: "100", nickname: "SameName", ip: "10.0.0.1" };
  const online = { player_uid: "200", nickname: "SameName", ip: "10.0.0.2" };
  const normalized = normalizePlayer(saved, [online]);

  assert.equal(sameStablePlayer(saved, online), false);
  assert.equal(normalized.ip, "10.0.0.1");
  assert.equal(normalized.player_uid, "100");
});

test("clearing save data invalidates stale cached players immediately", async () => {
  let synced = {
    players: [{ player_uid: "100", nickname: "OldPlayer" }],
    guilds: [],
    source: "sync",
  };
  const compatibility = createUpstreamCompatibility({
    loadSyncedSaveData: async () => synced,
    saveSyncedSaveData: async (value) => {
      synced = value;
      return value;
    },
    managedCall: async (_operation, _payload, localCall) => localCall(),
    querySaveData: async () => ({ players: [], guilds: [], source: "parser" }),
    liveServerData: async () => ({ players: [] }),
    listRconTemplates: async () => [],
    saveRconTemplates: async () => {},
    listRconTasks: async () => [],
  });

  assert.equal((await compatibility.__test.getPlayers({})).length, 1);
  await compatibility.clearSaveData("server-uninstall");
  assert.deepEqual(await compatibility.__test.getPlayers({}), []);
  assert.equal(synced.reason, "server-uninstall");
});

test("live players from a new world are added without inheriting stale nickname records", async () => {
  const compatibility = createUpstreamCompatibility({
    loadSyncedSaveData: async () => ({
      players: [{ player_uid: "100", nickname: "SameName", ip: "10.0.0.1" }],
      guilds: [],
      source: "sync",
    }),
    saveSyncedSaveData: async (value) => value,
    managedCall: async (_operation, _payload, localCall) => localCall(),
    querySaveData: async () => ({ players: [], guilds: [], source: "parser" }),
    liveServerData: async () => ({
      players: [{ player_uid: "200", nickname: "SameName", ip: "10.0.0.2" }],
    }),
    listRconTemplates: async () => [],
    saveRconTemplates: async () => {},
    listRconTasks: async () => [],
  });

  const players = await compatibility.__test.getPlayers({});
  assert.equal(players.length, 2);
  assert.equal(players.find((player) => player.player_uid === "100").ip, "10.0.0.1");
  assert.equal(players.find((player) => player.player_uid === "200").ip, "10.0.0.2");
});
