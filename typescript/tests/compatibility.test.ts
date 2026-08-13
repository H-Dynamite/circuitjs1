import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CircuitRunner } from "../src/core";
import { expect, it } from "vitest";

async function findCircuitFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await findCircuitFiles(path)));
    else if (entry.name.endsWith(".txt")) result.push(path);
  }
  return result;
}

async function resolveCircuitDirectory(): Promise<string> {
  const legacyDirectory = resolve(
    process.cwd(),
    "..",
    "src",
    "com",
    "lushprojects",
    "circuitjs1",
    "public",
    "circuits"
  );
  try {
    await access(legacyDirectory);
    return legacyDirectory;
  } catch {
    return resolve(process.cwd(), "src", "examples", "circuits");
  }
}

it(
  "constructs and analyzes every structurally supported original example",
  async () => {
    const circuitDirectory = await resolveCircuitDirectory();
    const files = await findCircuitFiles(circuitDirectory);
    const constructionFailures: string[] = [];
    const analysisFailures: string[] = [];
    const solveFailures: string[] = [];
    let supported = 0;

    for (const file of files) {
      const source = await readFile(file, "utf8");
      let runner: CircuitRunner;
      try {
        runner = source.trimStart().startsWith("<")
          ? CircuitRunner.fromXml(source)
          : CircuitRunner.fromText(source);
      } catch (error) {
        const message = String(error);
        if (message.includes("has not been migrated")) continue;
        constructionFailures.push(`${file}: ${message}`);
        continue;
      }
      supported += 1;
      if (runner.elements.length === 0) continue;
      try {
        runner.analyzeCircuit();
      } catch (error) {
        analysisFailures.push(`${file}: ${String(error)}`);
        continue;
      }
      try {
        runner.runCircuit(100);
      } catch (error) {
        solveFailures.push(`${file}: ${String(error)}`);
      }
    }

    expect(files).toHaveLength(366);
    expect(supported).toBe(files.length);
    expect(constructionFailures).toEqual([]);
    expect(analysisFailures).toEqual([]);
    expect(solveFailures).toEqual([]);
  },
  120_000
);
