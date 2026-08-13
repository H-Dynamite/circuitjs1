import { readFile, readdir, stat } from "fs/promises";
import { relative, resolve } from "path";
import { fileURLToPath } from "url";

const typescriptRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const repositoryRoot = resolve(typescriptRoot, "..");
const circuitRoot = resolve(
  repositoryRoot,
  "src",
  "com",
  "lushprojects",
  "circuitjs1",
  "public",
  "circuits"
);
const factoryPath = resolve(
  typescriptRoot,
  "src",
  "core",
  "ElementFactory.ts"
);

const metadataTypes = new Set([
  "$",
  "o",
  "h",
  "!",
  ".",
  '"',
  "&",
  "32",
  "38",
  "%",
  "?",
  "B"
]);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function textFilesBelow(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await textFilesBelow(path)));
    } else if (entry.name.endsWith(".txt")) {
      result.push(path);
    }
  }
  return result;
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function normalizedTextType(type) {
  if (!/^\d+$/.test(type)) return type;
  const value = Number.parseInt(type, 10);
  return value > 0 && value < 127 ? String.fromCharCode(value) : type;
}

if (!(await exists(circuitRoot))) {
  console.log(
    "Circuit corpus: unavailable (standalone TypeScript copy)"
  );
  process.exit(0);
}

const factorySource = await readFile(factoryPath, "utf8");
const supportedTypes = new Set(
  Array.from(
    factorySource.matchAll(/this\.register\("([^"]+)"/g),
    (match) => match[1]
  )
);
const supportedXmlTypes = new Set(
  Array.from(
    factorySource.matchAll(/this\.registerXml\("([^"]+)"/g),
    (match) => match[1]
  )
);
const files = await textFilesBelow(circuitRoot);
const typeFrequency = new Map();
const typeFileFrequency = new Map();
const blockedFiles = [];
let elementRecords = 0;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const typesInFile = new Set();
  const xmlFormat = source.trimStart().startsWith("<");
  if (xmlFormat) {
    for (const match of source.matchAll(
      /<([A-Za-z][A-Za-z0-9]*)\b[^>]*\bx="[^"]+"/g
    )) {
      const type = `xml:${match[1]}`;
      if (type === "xml:o") continue;
      elementRecords += 1;
      increment(typeFrequency, type);
      typesInFile.add(type);
    }
  } else {
    for (const rawLine of source.split(/\r\n|\r|\n/)) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }
      const [type] = line.split(/[ +\t]+/);
      if (metadataTypes.has(type)) {
        continue;
      }
      elementRecords += 1;
      increment(typeFrequency, type);
      typesInFile.add(type);
    }
  }
  for (const type of typesInFile) {
    increment(typeFileFrequency, type);
  }
  const missing = [...typesInFile]
    .filter((type) =>
      type.startsWith("xml:")
        ? !supportedXmlTypes.has(type.slice(4))
        : !supportedTypes.has(normalizedTextType(type))
    )
    .sort();
  if (missing.length > 0) {
    blockedFiles.push({
      file: relative(circuitRoot, file),
      missing
    });
  }
}

const unsupported = [...typeFrequency]
  .filter(([type]) =>
    type.startsWith("xml:")
      ? !supportedXmlTypes.has(type.slice(4))
      : !supportedTypes.has(normalizedTextType(type))
  )
  .sort((first, second) => second[1] - first[1]);
const compatibleFiles = files.length - blockedFiles.length;
const compatibility =
  files.length === 0 ? 0 : (compatibleFiles / files.length) * 100;

console.log(`Circuit example files: ${files.length}`);
console.log(`Element records: ${elementRecords}`);
console.log(`Element types used: ${typeFrequency.size}`);
console.log(`Registered element types: ${supportedTypes.size}`);
console.log(`Registered XML element tags: ${supportedXmlTypes.size}`);
console.log(
  `Structurally loadable files: ${compatibleFiles}/${files.length} ` +
    `(${compatibility.toFixed(1)}%)`
);
console.log(`Unsupported element types: ${unsupported.length}`);

if (unsupported.length > 0) {
  console.log("");
  console.log("Unsupported types by usage:");
  for (const [type, count] of unsupported.slice(0, 40)) {
    console.log(
      `- ${type}: ${count} records in ${typeFileFrequency.get(type)} files`
    );
  }
}

if (process.argv.includes("--blocked-files")) {
  console.log("");
  console.log("Blocked example files:");
  for (const entry of blockedFiles) {
    console.log(`- ${entry.file}: ${entry.missing.join(", ")}`);
  }
}
