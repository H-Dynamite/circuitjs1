/**
 * One-time/build-time migration helper for the two internal composite models
 * embedded by Legacy CustomCompositeModel.loadInternalModels().  Its output is
 * committed as TypeScript data; the shipped browser bundle never reads Java or
 * legacy public assets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const source = readFileSync(
  resolve(root, "src/com/lushprojects/circuitjs1/client/CustomCompositeModel.java"),
  "utf8"
);
const names = ["lm317", "tl431"];
const models = {};
for (const name of names) {
  const match = source.match(
    new RegExp(`String\\s+${name}\\s*=\\s*\\\"((?:[^\\\"\\\\]|\\\\.)*)\\\";`)
  );
  if (!match) throw new Error(`Could not find legacy ${name} definition`);
  // The Java literals only use JSON-compatible escapes (notably \\\\ for a
  // model-format backslash), so JSON parsing gives the runtime legacy text.
  models[name] = JSON.parse(`\"${match[1]}\"`);
}
const output = [
  "// Generated from CustomCompositeModel.loadInternalModels(); do not edit by hand.",
  "// The values are embedded migration data, not a runtime Java dependency.",
  `export const LEGACY_INTERNAL_COMPOSITE_MODELS = ${JSON.stringify(models, null, 2)} as const;`,
  ""
].join("\n");
writeFileSync(
  resolve(root, "typescript/src/core/BuiltinCompositeModels.generated.ts"),
  output
);
