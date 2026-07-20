const test = require("node:test");
const assert = require("node:assert/strict");
const { renderSettings, toIniValue } = require("../src/palworld-settings");

test("Palworld INI renderer respects complete generator field types", () => {
  assert.equal(toIniValue("Difficulty", "None"), "None");
  assert.equal(toIniValue("CrossplayPlatforms", "Steam,PS5"), "(Steam,PS5)");
  assert.equal(toIniValue("ServerName", 'A "quoted" server'), '"A \\"quoted\\" server"');
  assert.equal(toIniValue("RCONEnabled", true), "True");
  assert.equal(toIniValue("PublicPort", 8211), "8211");

  const ini = renderSettings({
    Difficulty: "None",
    CrossplayPlatforms: "Steam,PS5",
    ServerName: "Test server",
  });
  assert.match(ini, /Difficulty=None/);
  assert.match(ini, /CrossplayPlatforms=\(Steam,PS5\)/);
  assert.match(ini, /ServerName="Test server"/);
});
