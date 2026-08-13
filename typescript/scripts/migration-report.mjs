import { readdir, stat } from "fs/promises";
import { extname, relative, resolve } from "path";
import { fileURLToPath } from "url";

const migrationRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(migrationRoot, "..");
const javaRoot = resolve(
  repositoryRoot,
  "src",
  "com",
  "lushprojects",
  "circuitjs1"
);
const typescriptRoot = resolve(migrationRoot, "src");

async function filesBelow(root, extension) {
  const result = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await filesBelow(path, extension)));
    } else if (extname(entry.name) === extension) {
      result.push(path);
    }
  }
  return result;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function baseName(path) {
  const name = path.replaceAll("\\", "/").split("/").at(-1);
  return name?.replace(/\.[^.]+$/, "") ?? "";
}

const sourceAvailable = await exists(javaRoot);
const [javaFiles, typescriptFiles] = await Promise.all([
  sourceAvailable ? filesBelow(javaRoot, ".java") : Promise.resolve([]),
  filesBelow(typescriptRoot, ".ts")
]);
const typescriptNames = new Set(typescriptFiles.map(baseName));
const matched = javaFiles.filter((path) =>
  typescriptNames.has(baseName(path))
);
const pending = javaFiles.filter(
  (path) => !typescriptNames.has(baseName(path))
);

console.log(`TypeScript source files: ${typescriptFiles.length}`);
if (!sourceAvailable) {
  console.log(
    "Java source reference: unavailable (standalone TypeScript copy)"
  );
} else {
  console.log(`Java source files: ${javaFiles.length}`);
}
console.log(`Direct filename ports: ${matched.length}`);
console.log(`Pending direct ports: ${pending.length}`);
if (sourceAvailable) {
  console.log("");
  console.log("Next pending Java files:");
  for (const path of pending.slice(0, 20)) {
    console.log(`- ${relative(repositoryRoot, path)}`);
  }
}
