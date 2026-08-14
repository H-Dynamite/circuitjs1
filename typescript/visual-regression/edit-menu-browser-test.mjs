import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = process.cwd();

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

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

  const edit = page.locator('.menu-bar > details[data-menu="edit"]');
  const action = (name) => edit.locator(`[data-action="${name}"]`);
  const draw = page.locator('.menu-bar > details[data-menu="draw"]');
  const open = async (menu) => {
    await page.locator(".menu-bar > details[open]").evaluateAll((items) => {
      items.forEach((item) => { item.open = false; });
    });
    await menu.locator(":scope > summary").click();
    assert.equal(await menu.getAttribute("open"), "", "menu opens by a visible summary click");
  };
  const enabled = async (name) => !(await action(name).isDisabled());
  const readCircuit = async (name) =>
    (await page.request.get(`${origin}/src/examples/circuits/${name}`)).text();

  // Initial state mirrors Menus.init(): history and paste unavailable, and no
  // element means Cut/Copy are unavailable even when a circuit is loaded.
  await open(edit);
  for (const name of ["undo", "redo", "paste", "cut", "copy"]) {
    assert.equal(await enabled(name), false, `initial ${name} is disabled`);
  }
  assert.equal(await edit.locator('.edit-extension-menu [data-action="delete"]').count(), 1, "native Delete is isolated from the legacy Edit path");

  // All interaction below uses visible menu controls; the bridge only loads
  // fixtures and observes click coordinates.
  const logic = await readCircuit("3-cgand.txt");
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), logic);
  const beforeFlip = await page.evaluate(() => ({
    source: window.CircuitJS1TS.exportCircuit(),
    geometry: window.CircuitJS1TS.getElements().map((element) => [
      element.x, element.y, element.x2, element.y2
    ])
  }));
  await open(edit);
  assert.equal(await enabled("flip-x"), true, "Flip X enables for a flippable unselected circuit");
  await action("flip-x").click();
  const afterFlip = await page.evaluate(() => ({
    source: window.CircuitJS1TS.exportCircuit(),
    geometry: window.CircuitJS1TS.getElements().map((element) => [
      element.x, element.y, element.x2, element.y2
    ])
  }));
  assert.notEqual(afterFlip.source, beforeFlip.source, "unselected Flip X changes serialized circuit");
  assert.notDeepEqual(afterFlip.geometry, beforeFlip.geometry, "unselected Flip X changes model geometry");
  await open(edit);
  assert.equal(await enabled("undo"), true, "unselected Flip X enters undo history");
  await action("undo").click();
  assert.equal(
    await page.evaluate(() => window.CircuitJS1TS.exportCircuit()),
    beforeFlip.source,
    "Undo restores the unselected Flip X circuit"
  );
  await open(edit);
  await action("select-all").click();
  await open(edit);
  assert.equal(await enabled("cut"), true, "Cut enables after real Select All");
  assert.equal(await enabled("copy"), true, "Copy enables after real Select All");
  await action("copy").click();
  await open(edit);
  assert.equal(await enabled("paste"), true, "Paste enables after visible Copy");

  // Center Circuit must translate only. Wheel zoom is real pointer input;
  // proportional element distance is an observable scale invariant.
  const canvas = page.locator("#circuit-canvas");
  await canvas.hover({ position: { x: 200, y: 200 } });
  await page.mouse.wheel(0, -300);
  const before = await page.evaluate(() => [
    window.CircuitJS1TS.getElementClickPoint(0),
    window.CircuitJS1TS.getElementClickPoint(1)
  ]);
  await open(edit);
  await action("fit").click();
  const after = await page.evaluate(() => [
    window.CircuitJS1TS.getElementClickPoint(0),
    window.CircuitJS1TS.getElementClickPoint(1)
  ]);
  assert.ok(Math.abs(distance(...before) - distance(...after)) < 0.001, "Center Circuit does not change zoom scale");

  // ThreePhaseMotor explicitly rejects both flips. MouseManager checks all
  // elements when no specific selection exists; Select All gives the same
  // result through the normal visible Edit action.
  const motor = await readCircuit("3motor.txt");
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), motor);
  await open(edit);
  for (const name of ["flip-x", "flip-y", "flip-xy"]) {
    assert.equal(await enabled(name), false, `${name} follows canFlip capability without a selection`);
  }
  await action("select-all").click();
  await open(edit);
  for (const name of ["flip-x", "flip-y", "flip-xy"]) {
    assert.equal(await enabled(name), false, `${name} follows canFlip capability with a selection`);
  }

  // Construct an Optocoupler via the real Draw menu and canvas gesture. It
  // supports independent X/Y flips but explicitly rejects the axis-exchange
  // Flip XY, as does legacy OptocouplerElm.
  await page.evaluate(() => window.CircuitJS1TS.loadCircuit("$ 1 0.000005 10.2 50 5 43 5e-11"));
  await open(draw);
  const optocouplerTool = draw.locator('[data-tool="optocoupler"]');
  await optocouplerTool.locator("xpath=../..").hover();
  await optocouplerTool.click();
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox, "canvas is visible for optocoupler construction");
  await page.mouse.move(canvasBox.x + 180, canvasBox.y + 180);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 260, canvasBox.y + 180);
  await page.mouse.up();
  assert.equal(
    await page.evaluate(() => window.CircuitJS1TS.getElements()[0]?.getClassName()),
    "OptocouplerElm",
    "Draw menu constructs OptocouplerElm"
  );
  await open(edit);
  assert.equal(await enabled("flip-x"), true, "Optocoupler keeps Flip X");
  assert.equal(await enabled("flip-y"), true, "Optocoupler keeps Flip Y");
  assert.equal(await enabled("flip-xy"), false, "Optocoupler disables Flip XY");

  const options = page.locator(".menu-bar > details").nth(4);
  await open(options);
  await options.locator('[data-action="toggle-disable-editing"]').click();
  const sourceBeforeReadOnlyAction = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  await open(edit);
  assert.equal(await edit.getAttribute("open"), "", "Disable Editing keeps Edit menu operable");
  assert.equal(await enabled("copy"), true, "Disable Editing does not silently disable Edit action");
  await action("copy").click();
  assert.equal(
    await page.evaluate(() => window.CircuitJS1TS.exportCircuit()),
    sourceBeforeReadOnlyAction,
    "read-only Edit action leaves circuit unchanged"
  );
  assert.match(
    await page.locator("#native-status").textContent(),
    /Editing disabled/u,
    "read-only Edit action reports visible feedback"
  );
  await open(draw);
  assert.equal(await draw.getAttribute("open"), "", "Disable Editing keeps Draw menu operable");
  await draw.locator('[data-tool="wire"]').first().click();
  assert.match(
    await page.locator("#native-status").textContent(),
    /Editing disabled/u,
    "read-only Draw action reports visible feedback"
  );

  console.log("Edit menu browser state matrix and Center Circuit action passed.");
} finally {
  await browser.close();
  await server.close();
}
