const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "vendor", "pal-conf", "dist");
const destination = path.join(root, "upstream-web", "public", "pal-conf");
const entriesSource = path.join(root, "vendor", "pal-conf", "src", "consts", "entries.tsx");

if (!fs.existsSync(path.join(source, "index.html"))) {
  throw new Error("pal-conf build is missing. Run its build before syncing assets.");
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const destinationPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, destinationPath);
    else fs.copyFileSync(sourcePath, destinationPath);
  }
}

fs.rmSync(destination, { recursive: true, force: true });
copyTree(source, destination);
fs.copyFileSync(
  path.join(root, "vendor", "pal-conf", "LICENSE"),
  path.join(destination, "LICENSE.txt"),
);

const sourceText = fs.readFileSync(entriesSource, "utf8");
const schema = {};
for (const match of sourceText.matchAll(/id:\s*"([A-Za-z][A-Za-z0-9_]*)"[\s\S]*?type:\s*"(string|integer|float|boolean|select|array)"/g)) {
  schema[match[1]] = match[2];
}
if (Object.keys(schema).length < 100) {
  throw new Error(`Only ${Object.keys(schema).length} pal-conf fields were discovered.`);
}
const schemaJson = `${JSON.stringify(schema, null, 2)}\n`;
fs.writeFileSync(path.join(root, "src", "pal-conf-schema.json"), schemaJson);
fs.writeFileSync(path.join(root, "upstream-web", "src", "assets", "pal-conf-schema.json"), schemaJson);

console.log(`Synced pal-conf and ${Object.keys(schema).length} field definitions.`);
