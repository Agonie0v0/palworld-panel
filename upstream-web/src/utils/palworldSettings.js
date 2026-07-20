const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const keyPattern = /^[A-Za-z][A-Za-z0-9_]*$/;

const findClosingParenthesis = (text, openingIndex) => {
  let quoted = false;
  let escaped = false;
  let depth = 0;
  for (let index = openingIndex; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quoted) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const extractSettingsBody = (input) => {
  const text = String(input || "").replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("empty");

  const optionMatch = /OptionSettings\s*=\s*\(/i.exec(text);
  if (optionMatch) {
    const openingIndex = text.indexOf("(", optionMatch.index);
    const closingIndex = findClosingParenthesis(text, openingIndex);
    if (closingIndex < 0) throw new Error("unclosed");
    return text.slice(openingIndex + 1, closingIndex);
  }

  if (text.startsWith("(")) {
    const closingIndex = findClosingParenthesis(text, 0);
    if (closingIndex < 0) throw new Error("unclosed");
    return text.slice(1, closingIndex);
  }

  if (text.includes("[/Script/Pal.PalGameWorldSettings]")) throw new Error("missingOptionSettings");
  return text;
};

const splitAssignments = (body) => {
  const assignments = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  let nestedDepth = 0;

  for (const character of body) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quoted) {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }
    if (!quoted && character === "(") nestedDepth += 1;
    if (!quoted && character === ")") nestedDepth = Math.max(0, nestedDepth - 1);
    if (!quoted && nestedDepth === 0 && character === ",") {
      if (current.trim()) assignments.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  if (quoted) throw new Error("unclosedQuote");
  if (current.trim()) assignments.push(current.trim());
  return assignments;
};

const findEquals = (assignment) => {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < assignment.length; index += 1) {
    const character = assignment[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quoted) {
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "=") return index;
  }
  return -1;
};

const parseQuotedValue = (value) => {
  const inner = value.slice(1, -1);
  let parsed = "";
  let escaped = false;
  for (const character of inner) {
    if (escaped) {
      parsed += character === '"' || character === "\\" ? character : `\\${character}`;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else {
      parsed += character;
    }
  }
  if (escaped) parsed += "\\";
  return parsed;
};

const parseValue = (rawValue) => {
  const value = rawValue.trim();
  if (value.startsWith('"') || value.endsWith('"')) {
    if (!(value.startsWith('"') && value.endsWith('"'))) throw new Error("unclosedQuote");
    return { value: parseQuotedValue(value), type: "string" };
  }
  if (/^true$/i.test(value)) return { value: true, type: "boolean" };
  if (/^false$/i.test(value)) return { value: false, type: "boolean" };
  if (numberPattern.test(value)) return { value: Number(value), type: "number" };
  return { value, type: "string" };
};

export const parsePalworldSettings = (input) => {
  const body = extractSettingsBody(input);
  const assignments = splitAssignments(body);
  if (assignments.length === 0) throw new Error("empty");

  const settings = {};
  const entries = [];
  const duplicateKeys = [];
  for (const assignment of assignments) {
    const equalsIndex = findEquals(assignment);
    if (equalsIndex < 1) throw new Error("invalidAssignment");
    const key = assignment.slice(0, equalsIndex).trim();
    if (!keyPattern.test(key)) throw new Error("invalidKey");
    const parsed = parseValue(assignment.slice(equalsIndex + 1));
    if (Object.prototype.hasOwnProperty.call(settings, key)) duplicateKeys.push(key);
    settings[key] = parsed.value;
    const existingIndex = entries.findIndex((entry) => entry.key === key);
    const entry = { key, ...parsed };
    if (existingIndex >= 0) entries[existingIndex] = entry;
    else entries.push(entry);
  }

  return { settings, entries, duplicateKeys: [...new Set(duplicateKeys)] };
};

export const formatPalworldSetting = (value) => {
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  return String(value ?? "");
};

export const serializePalworldSettings = (settings, schema = {}) => {
  const pairs = Object.entries(settings || {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const type = schema[key];
      if (type === "array") {
        const arrayValue = String(value).trim().replace(/^\(|\)$/g, "");
        return `${key}=(${arrayValue})`;
      }
      if (type === "select") return `${key}=${String(value)}`;
      if (typeof value === "boolean") return `${key}=${value ? "True" : "False"}`;
      if (typeof value === "number") return `${key}=${value}`;
      const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `${key}="${escaped}"`;
    })
    .join(",");
  return `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(${pairs})`;
};
