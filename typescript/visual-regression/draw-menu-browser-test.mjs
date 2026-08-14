import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: ROOT,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 }
});
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") {
  throw new Error("Vite did not expose a TCP address");
}
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function");

  const draw = page.locator('.menu-bar > details[data-menu="draw"]');
  const openDraw = async () => {
    await page.locator(".menu-bar > details[open]").evaluateAll((items) => {
      items.forEach((item) => { item.open = false; });
    });
    await draw.locator(":scope > summary").click();
    assert.equal(await draw.getAttribute("open"), "", "Draw opens through its visible summary");
  };
  const outputSubmenu = draw.locator(".component-submenu").filter({ hasText: "输出和标签" });
  const activeBuildingBlocks = draw.locator(".component-submenu").filter({ hasText: "有源集成电路" });

  await openDraw();
  assert.deepEqual(
    await draw.locator(":scope > .menu-popup > button[data-tool]").evaluateAll((buttons) =>
      buttons.slice(0, 3).map((button) => button.dataset.tool)
    ),
    ["wire", "routed-wire", "resistor"],
    "Draw retains legacy direct Wire, Routed Wire, Resistor order"
  );
  assert.equal(
    await outputSubmenu.locator('[data-tool="scope-element"]').count(),
    0,
    "embedded ScopeElm does not pollute legacy Outputs and Labels"
  );
  assert.equal(
    await draw.locator('.draw-extension-submenu [data-tool="scope-element"]').count(),
    1,
    "embedded ScopeElm remains available only under a secondary extension path"
  );
  for (const id of ["lm317", "tl431"]) {
    const item = draw.locator(`[data-tool="${id}"]`);
    assert.equal(await item.isDisabled(), false, `${id} uses its native migrated built-in composite model`);
  }
  assert.equal(
    await draw.locator('[data-tool="subcircuit-instance"]').isDisabled(),
    true,
    "generic Add Subcircuit Instance remains unavailable without a user model"
  );

  // Exercise the real visible Draw commands, not a registry mutation.  The
  // built-in model definitions must remain available after XML export/reload
  // without exporting Java-era <ccm> data into the user circuit.
  for (const [tool, model] of [["lm317", "~LM317-v2"], ["tl431", "~TL431"]]) {
    await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), '<cir ts="0.000005"/>');
    await openDraw();
    await activeBuildingBlocks.locator(":scope > .component-submenu-label").hover();
    await draw.locator(`[data-tool="${tool}"]`).click();
    const builtinCanvas = page.locator("#circuit-canvas");
    const builtinBox = await builtinCanvas.boundingBox();
    assert.ok(builtinBox, `${tool} canvas is visible`);
    await page.mouse.move(builtinBox.x + 300, builtinBox.y + 250);
    await page.mouse.down();
    await page.mouse.move(builtinBox.x + 390, builtinBox.y + 250);
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => window.CircuitJS1TS.getElements()[0]?.modelName),
      model,
      `${tool} Draw command creates its original named composite model`
    );
    const builtinExport = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
    assert.match(builtinExport, new RegExp(`<cc\\b[^>]*mo="${model}"`, "u"), `${tool} instance exports by model name`);
    assert.doesNotMatch(builtinExport, /<ccm\b/u, `${tool} does not leak an internal model definition into export`);
    await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), builtinExport);
    const builtinSolved = await page.evaluate(() => {
      try {
        return window.CircuitJS1TS.stepSimulation(1).steps;
      } catch (error) {
        return String(error);
      }
    });
    assert.equal(builtinSolved, 1, `${tool} exports, reloads, and participates in a real solver step`);
  }

  // This is an imported XML model, not a test-only registry mutation.  It is
  // intentionally simple so a fresh instance can be solved after export/reload.
  const fixture = [
    '<cir f="0" ts="0.000005" mts="5e-11">',
    '  <ccm nm="menu-divider" f="0" sx="2" sy="1">',
    '    <ext nm="in" nd="1" ps="0" sd="2"/>',
    '    <ext nm="out" nd="2" ps="0" sd="3"/>',
    '    <r x="0 0 64 0" f="0" nn="1 2"/>',
    '  </ccm>',
    '</cir>'
  ].join("\n");
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), fixture);
  await openDraw();
  assert.equal(
    await draw.locator('[data-tool="subcircuit-instance"]').isDisabled(),
    false,
    "legacy Add Subcircuit Instance enables once a current-circuit model exists"
  );
  const subcircuits = draw.locator("#draw-subcircuit-items").locator("xpath=../..");
  await subcircuits.locator(":scope > .component-submenu-label").hover();
  const instance = subcircuits.locator('[data-tool="subcircuit:menu-divider"]');
  await instance.click();

  const canvas = page.locator("#circuit-canvas");
  const box = await canvas.boundingBox();
  assert.ok(box, "canvas is visible for a genuine Draw interaction");
  await page.mouse.move(box.x + 300, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 390, box.y + 250);
  await page.mouse.up();
  assert.equal(
    await page.evaluate(() => window.CircuitJS1TS.getElements()[0]?.getClassName()),
    "CustomCompositeElm",
    "Draw menu selection creates a real composite simulation element"
  );
  assert.equal(
    await page.evaluate(() => window.CircuitJS1TS.getElements()[0]?.modelName),
    "menu-divider",
    "the selected Draw model name reaches the solver element"
  );
  const exported = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  assert.match(exported, /<ccm\b[^>]*nm="menu-divider"/u, "model definition exports with its instance");
  assert.match(exported, /<cc\b[^>]*mo="menu-divider"/u, "new instance exports with the chosen model name");
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), exported);
  const solved = await page.evaluate(() => {
    try {
      return window.CircuitJS1TS.stepSimulation(1).steps;
    } catch (error) {
      return String(error);
    }
  });
  assert.equal(solved, 1, "exported/reloaded Draw instance participates in a solver step");

  // The shared model registry is replaced on load, then changed again through
  // the visible File and Tools workflows.  Verify Draw never retains a stale
  // model name after either mutation.
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), [
    '<cir ts="0.000005">',
    '  <r x="0 0 64 0" f="0" r="100"/>',
    '  <ln x="0 0 0 -32" f="0" te="input"/>',
    '  <ln x="64 0 64 32" f="0" te="output"/>',
    '</cir>'
  ].join("\n"));
  await openDraw();
  assert.equal(
    await draw.locator('[data-tool="subcircuit:menu-divider"]').count(),
    0,
    "loading a circuit without models removes the prior Draw subcircuit entry"
  );
  assert.equal(
    await draw.locator('[data-tool="subcircuit-instance"]').isDisabled(),
    true,
    "generic Add Subcircuit Instance becomes unavailable when load clears models"
  );

  const file = page.locator(".menu-bar > details").nth(0);
  await page.locator(".menu-bar > details[open]").evaluateAll((items) => {
    items.forEach((item) => { item.open = false; });
  });
  await file.locator(":scope > summary").click();
  await file.locator('[data-action="create-subcircuit"]').click();
  await page.locator("#subcircuit-name").fill("created-divider");
  await page.locator("#subcircuit-create").click();
  assert.equal(
    await draw.locator('[data-tool="subcircuit:created-divider"]').count(),
    1,
    "creating a model through File immediately refreshes Draw > Subcircuits"
  );
  assert.equal(
    await draw.locator('[data-tool="subcircuit-instance"]').isDisabled(),
    false,
    "generic Add Subcircuit Instance enables after an in-app create"
  );

  await page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#subcircuit-delete").click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await openDraw();
  assert.equal(
    await draw.locator('[data-tool="subcircuit:created-divider"]').count(),
    0,
    "deleting a model through the manager immediately removes it from Draw"
  );
  assert.equal(
    await draw.locator('[data-tool="subcircuit-instance"]').isDisabled(),
    true,
    "generic Add Subcircuit Instance disables after the last model is deleted"
  );

  console.log("Draw legacy paths and imported subcircuit instantiation passed.");
} finally {
  await browser.close();
  await server.close();
}
