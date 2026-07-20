import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPalworldSetting,
  parsePalworldSettings,
  serializePalworldSettings,
} from "./palworldSettings.js";

test("parses a complete PalWorldSettings.ini document", () => {
  const parsed = parsePalworldSettings(`
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(ServerName="Agonie, Palworld",ExpRate=2.5,RCONEnabled=True,Difficulty=None)
  `);
  assert.deepEqual(parsed.settings, {
    ServerName: "Agonie, Palworld",
    ExpRate: 2.5,
    RCONEnabled: true,
    Difficulty: "None",
  });
});

test("supports a bare OptionSettings body and escaped quoted values", () => {
  const parsed = parsePalworldSettings('ServerDescription="Say \\"hello\\"",ServerPassword="a\\\\b",LogPath="C:\\Pal\\Saved",RESTAPIEnabled=False');
  assert.equal(parsed.settings.ServerDescription, 'Say "hello"');
  assert.equal(parsed.settings.ServerPassword, "a\\b");
  assert.equal(parsed.settings.LogPath, "C:\\Pal\\Saved");
  assert.equal(parsed.settings.RESTAPIEnabled, false);
});

test("keeps the last duplicate value and reports the duplicate key", () => {
  const parsed = parsePalworldSettings("(ExpRate=1,ExpRate=3)");
  assert.equal(parsed.settings.ExpRate, 3);
  assert.deepEqual(parsed.duplicateKeys, ["ExpRate"]);
  assert.equal(parsed.entries.length, 1);
});

test("rejects malformed generated configuration", () => {
  assert.throws(() => parsePalworldSettings("OptionSettings=(ExpRate=2"), /unclosed/);
  assert.throws(() => parsePalworldSettings("OptionSettings=(Bad-Key=2)"), /invalidKey/);
  assert.throws(() => parsePalworldSettings("[/Script/Pal.PalGameWorldSettings]"), /missingOptionSettings/);
});

test("formats preview values without INI quoting noise", () => {
  assert.equal(formatPalworldSetting(true), "True");
  assert.equal(formatPalworldSetting(2.5), "2.5");
  assert.equal(formatPalworldSetting("None"), "None");
});

test("serializePalworldSettings respects pal-conf field types", () => {
  const output = serializePalworldSettings(
    {
      Difficulty: "None",
      CrossplayPlatforms: "Steam,PS5",
      ServerName: 'A "quoted" server',
      RCONEnabled: true,
      PublicPort: 8211,
    },
    {
      Difficulty: "select",
      CrossplayPlatforms: "array",
      ServerName: "string",
      RCONEnabled: "boolean",
      PublicPort: "integer",
    },
  );

  assert.match(output, /Difficulty=None/);
  assert.match(output, /CrossplayPlatforms=\(Steam,PS5\)/);
  assert.match(output, /ServerName="A \\"quoted\\" server"/);
  assert.match(output, /RCONEnabled=True/);
  assert.match(output, /PublicPort=8211/);
});
