import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("No Vite TCP address");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

const openPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function");
  return page;
};

const drawOnly = async (page, tool, y = 220) => {
  const draw = page.locator('.menu-bar > details[data-menu="draw"]');
  await page.locator(".menu-bar > details[open]").evaluateAll((items) => items.forEach((item) => { item.open = false; }));
  await draw.locator(":scope > summary").click();
  await draw.locator('[data-tool="select"]').click();
  await draw.locator(":scope > summary").click();
  const item = draw.locator(`[data-tool="${tool}"]`);
  await item.locator("xpath=../..").hover();
  await item.click();
  const canvas = page.locator("#circuit-canvas");
  const box = await canvas.boundingBox();
  assert.ok(box, `${tool} canvas is visible`);
  await page.mouse.move(box.x + 260, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + y);
  await page.mouse.up();
  return page.evaluate(() => window.CircuitJS1TS.getElements().length - 1);
};

const drawAndEdit = async (page, tool) => {
  const index = await drawOnly(page, tool);
  const point = await page.evaluate((i) => window.CircuitJS1TS.getElementClickPoint(i), index);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const edit = page.locator('#element-context-menu [data-action="edit-selected"]');
  assert.equal(await edit.isVisible(), true);
  assert.equal(await edit.isDisabled(), false);
  await edit.click();
  await page.locator("#element-edit-dialog[open]").waitFor();
};

const sourceFor = (kind, format) => {
  if (kind === "gate") return format === "xml" ? '<cir ts="0.000005"/>' : "$ 1 0.000005 10 50 5";
  return format === "xml"
    ? '<cir ts="0.000005"><clm nm="default" f="0" in="A" o="Q" if="default">0=1\n1=0</clm></cir>'
    : "$ 1 0.000005 10 50 5\n! default 0 A Q default 0\\q1\\n1\\q0";
};

const checkGate = async (format) => {
  const page = await openPage();
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), sourceFor("gate", format));
  await drawAndEdit(page, "and-gate");
  const dialog = page.locator("#element-edit-dialog");
  await dialog.locator('input[data-edit-switch="gateInputCount"]').fill("3");
  const high = dialog.locator('input[data-edit-switch="gateHighVoltage"]');
  await high.fill("6.25");
  assert.equal(await high.getAttribute("min"), "1");
  assert.equal(await high.getAttribute("max"), "10");
  await dialog.locator('input[data-edit-switch="gateSchmitt"]').check();
  await dialog.locator('input[data-edit-switch="gateInvertInputs"]').check();
  await dialog.locator('input[data-edit-switch="gatePropagationDelay"]').fill("2u");
  await dialog.locator('button[type="submit"]').click();
  await drawOnly(page, "or-gate", 340);
  const edited = await page.evaluate(() => {
    const element = window.CircuitJS1TS.getElements()[0];
    const inherited = window.CircuitJS1TS.getElements()[1];
    return { type: element.getClassName(), inputs: element.inputCount, high: element.highVoltage,
      schmitt: element.hasSchmittInputs(), invert: element.hasFlag(4), delay: element.propagationDelay,
      inheritedHigh: inherited.highVoltage, inheritedSchmitt: inherited.hasSchmittInputs(),
      steps: window.CircuitJS1TS.stepSimulation(1).steps, source: window.CircuitJS1TS.exportCircuit() };
  });
  assert.deepEqual({ ...edited, source: undefined }, { type: "AndGateElm", inputs: 3, high: 6.25,
    schmitt: true, invert: true, delay: 2e-6, inheritedHigh: 6.25,
    inheritedSchmitt: true, steps: 1, source: undefined });
  const fresh = await openPage();
  const reloaded = await fresh.evaluate((source) => {
    window.CircuitJS1TS.loadCircuit(source);
    const element = window.CircuitJS1TS.getElements()[0];
    return { type: element.getClassName(), inputs: element.inputCount, high: element.highVoltage,
      schmitt: element.hasSchmittInputs(), invert: element.hasFlag(4), delay: element.propagationDelay,
      steps: window.CircuitJS1TS.stepSimulation(1).steps };
  }, edited.source);
  assert.deepEqual(reloaded, { type: "AndGateElm", inputs: 3, high: 6.25,
    schmitt: true, invert: true, delay: 2e-6, steps: 1 });
  await fresh.close(); await page.close();
};

const checkCustomLogic = async (format) => {
  const page = await openPage();
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), sourceFor("custom", format));
  await drawAndEdit(page, "custom-logic");
  const dialog = page.locator("#element-edit-dialog");
  assert.equal(await dialog.getByRole("button", { name: "Edit Model" }).count(), 0);
  await dialog.locator('input[data-edit-switch="customLogicHighVoltage"]').fill("6");
  await dialog.locator('input[data-edit-switch="customLogicModelName"]').fill("alt-copy");
  await dialog.locator('button[type="submit"]').click();
  await drawOnly(page, "custom-logic", 340);
  const edited = await page.evaluate(() => {
    const element = window.CircuitJS1TS.getElements()[0];
    const inherited = window.CircuitJS1TS.getElements()[1];
    return { type: element.getClassName(), modelName: element.modelName, high: element.highVoltage,
      inputs: element.inputCount, outputs: element.outputCount, rules: element.model.rules,
      modelInputs: element.model.inputs, modelOutputs: element.model.outputs,
      inheritedModelName: inherited.modelName, inheritedInputs: inherited.inputCount,
      inheritedOutputs: inherited.outputCount, steps: window.CircuitJS1TS.stepSimulation(1).steps,
      source: window.CircuitJS1TS.exportCircuit() };
  });
  assert.deepEqual({ ...edited, source: undefined }, { type: "CustomLogicElm", modelName: "alt-copy",
    high: 6, inputs: 1, outputs: 1, rules: "0=1\n1=0", modelInputs: ["A"], modelOutputs: ["Q"],
    inheritedModelName: "alt-copy", inheritedInputs: 1, inheritedOutputs: 1,
    steps: 1, source: undefined });
  const fresh = await openPage();
  const reloaded = await fresh.evaluate((source) => {
    window.CircuitJS1TS.loadCircuit(source);
    const element = window.CircuitJS1TS.getElements()[0];
    return { type: element.getClassName(), modelName: element.modelName, high: element.highVoltage,
      inputs: element.inputCount, outputs: element.outputCount, rules: element.model.rules,
      modelInputs: element.model.inputs, modelOutputs: element.model.outputs,
      steps: window.CircuitJS1TS.stepSimulation(1).steps };
  }, edited.source);
  assert.deepEqual(reloaded, { type: "CustomLogicElm", modelName: "alt-copy", high: 6,
    inputs: 1, outputs: 1, rules: "0=1\n1=0", modelInputs: ["A"], modelOutputs: ["Q"], steps: 1 });
  await fresh.close(); await page.close();
};

try {
  await checkGate("text"); await checkGate("xml");
  await checkCustomLogic("text"); await checkCustomLogic("xml");
  console.log("Gate and CustomLogic visible editors passed.");
} finally {
  await browser.close(); await server.close();
}
