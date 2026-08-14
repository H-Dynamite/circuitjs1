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

  const tools = page.locator('.menu-bar > details[data-menu="tools"]');
  const open = async () => {
    await page.locator(".menu-bar > details[open]").evaluateAll((items) => {
      items.forEach((item) => { item.open = false; });
    });
    await tools.locator(":scope > summary").click();
    assert.equal(await tools.getAttribute("open"), "", "Tools opens through its visible summary");
  };
  const toolActions = async () =>
    tools.locator(":scope > .menu-popup > button").evaluateAll((buttons) =>
      buttons.map((button) => button.dataset.action)
    );
  const convert = tools.locator('[data-action="convert-wires"]');
  const manager = tools.locator('[data-action="subcircuits"]');

  // Production legacy builds expose exactly these two direct Tools entries;
  // centring lives in Edit and resetting remains the run-control action.
  await page.evaluate(() => window.CircuitJS1TS.loadCircuit("$ 1 0.000005 10.2 50 5 43 5e-11"));
  await open();
  assert.deepEqual(
    await toolActions(),
    ["convert-wires", "subcircuits"],
    "Tools restores the legacy two-command path without TS-only commands"
  );
  assert.equal(await convert.isDisabled(), true, "Convert is disabled without a convertible wire");
  assert.equal(await manager.isDisabled(), false, "Subcircuit Manager stays available");
  assert.equal(await tools.locator('[data-action="fit"], [data-action="reset"]').count(), 0);

  // Load an ordinary text wire, invoke the visible menu command, then prove
  // the XML representation survives a normal app export/reload cycle.
  await page.evaluate(() => window.CircuitJS1TS.loadCircuit("$ 1 0.000005 10.2 50 5 43 5e-11\nw 0 0 80 0 0"));
  await open();
  assert.equal(await convert.isDisabled(), false, "Convert enables for a plain wire");
  await convert.click();
  assert.equal(
    await page.evaluate(() => window.CircuitJS1TS.getElements()[0]?.getClassName()),
    "RoutedWireElm",
    "Convert Wires replaces the simulation element rather than only changing menu state"
  );
  const routedExport = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  assert.match(routedExport, /<rw\b/u, "converted wire exports as an XML routed wire");
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), routedExport);
  assert.equal(
    await page.evaluate(() => window.CircuitJS1TS.getElements()[0]?.getClassName()),
    "RoutedWireElm",
    "export/reload preserves the routed wire model"
  );
  await open();
  assert.equal(await convert.isDisabled(), true, "Convert disables after every plain wire has been routed");

  // The manager is reachable from Tools and uses the existing model registry,
  // not a decorative dialog.  A model-bearing fixture must remain visible
  // after export/reload as legacy subcircuit definitions do.
  const fixture = await (await page.request.get(`${origin}/src/examples/circuits/adder4-sc.txt`)).text();
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), fixture);
  await open();
  await manager.click();
  const dialog = page.locator("#subcircuit-dialog");
  assert.equal(await dialog.evaluate((element) => element.open), true, "Tools opens the real Subcircuit Manager");
  assert.ok(await dialog.locator("#subcircuit-list option").count() > 0, "manager lists models parsed from the circuit");
  assert.match(await dialog.textContent(), /Subcircuit Manager/u);
  await dialog.getByRole("button", { name: "完成" }).click();
  const modelExport = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  assert.match(modelExport, /<ccm\b/u, "subcircuit definitions are retained in normal export");
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), modelExport);
  await open();
  await manager.click();
  assert.ok(await dialog.locator("#subcircuit-list option").count() > 0, "manager sees models after export/reload");

  console.log("Tools menu legacy path, routing action, and subcircuit manager passed.");
} finally {
  await browser.close();
  await server.close();
}
