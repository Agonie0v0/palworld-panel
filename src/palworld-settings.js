const palConfSchema = require("./pal-conf-schema.json");

function toIniValue(key, value) {
  const type = palConfSchema[key];
  if (type === "array") return `(${String(value).trim().replace(/^\(|\)$/g, "")})`;
  if (type === "select") return String(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderSettings(settings) {
  const pairs = Object.entries(settings)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${toIniValue(key, value)}`)
    .join(",");
  return `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(${pairs})\n`;
}

module.exports = { renderSettings, toIniValue };
