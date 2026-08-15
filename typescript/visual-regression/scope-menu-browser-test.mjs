import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = process.cwd();

function panels(snapshot) {
  return [...new Set(snapshot.scopes.map((scope) => scope.panel))].sort((a, b) => a - b);
}

const server = await createServer({
  root: ROOT,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 }
});
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("Vite did not expose a TCP address");
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.getDynamicSnapshot === "function");

  const menu = page.locator(".menu-bar > details").nth(3);
  const button = (action) => page.locator(`[data-action="${action}"]`);
  const openScopes = async () => {
    await page.locator(".menu-bar > details[open]").evaluateAll((items) => {
      items.forEach((item) => { item.open = false; });
    });
    await menu.locator(":scope > summary").click();
    assert.equal(await menu.getAttribute("open"), "", "Scope menu opens by visible summary click");
  };
  const enabled = async (action) => !(await button(action).isDisabled());
  const state = () => page.evaluate(() => window.CircuitJS1TS.getDynamicSnapshot());

  // On an empty circuit ScopePopupMenu disables every original action.
  const noScopeSource = await (await page.request.get(`http://127.0.0.1:${address.port}/src/examples/circuits/3-cgand.txt`)).text();
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), noScopeSource);
  await openScopes();
  assert.deepEqual(
    await page.locator(".scope-menu > button").evaluateAll((items) => items.map((item) => item.dataset.action)),
    ["scope-stack", "scope-unstack", "scope-combine", "scope-separate"],
    "ScopePopupMenu keeps exactly the four legacy actions first and in order"
  );
  assert.equal(await page.locator(".scope-menu > .scope-extension-menu").count(), 1, "native utilities are in an explicit second-level menu");
  for (const action of ["scope-stack", "scope-unstack", "scope-combine", "scope-separate"]) {
    assert.equal(await enabled(action), false, `${action} disabled with zero scopes`);
  }

  // 555int has two persisted scopes in positions 0 and 1.  All transformations
  // below use the visible Scope and Edit menu buttons; the bridge only observes
  // state and performs the public export/reload compatibility check.
  const source = await (await page.request.get(`http://127.0.0.1:${address.port}/src/examples/circuits/555int.txt`)).text();
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), source);
  const scopedLayout = await page.evaluate(() => window.CircuitJS1TS.getVisualRegressionLayout());
  assert.equal(scopedLayout.canvas.height, 665, "scopes retain the legacy-sized main workspace at the standard viewport");
  assert.equal(scopedLayout.scopeY, 735, "scope panel starts after the legacy-sized main workspace");
  await openScopes();
  assert.deepEqual(panels(await state()), [0, 1], "fixture restores its original scope positions");
  assert.equal(await enabled("scope-stack"), true, "Stack enabled iff final scope position is nonzero");
  assert.equal(await enabled("scope-unstack"), false, "Unstack disabled iff final scope is already unstacked");
  assert.equal(await enabled("scope-combine"), true, "Combine enabled with two scopes");
  assert.equal(await enabled("scope-separate"), true, "Separate enabled with at least one scope");

  await button("scope-stack").click();
  await openScopes();
  assert.deepEqual(panels(await state()), [0], "Stack writes position zero for every scope");
  assert.equal(await enabled("scope-stack"), false, "Stack disabled after scopes share position zero");
  assert.equal(await enabled("scope-unstack"), true, "Unstack enabled while positions are stacked");

  const editMenu = page.locator(".menu-bar > details").nth(1);
  await menu.evaluate((element) => { element.open = false; });
  await editMenu.locator(":scope > summary").click();
  await editMenu.locator('[data-action="undo"]').click();
  await openScopes();
  assert.deepEqual(panels(await state()), [0, 1], "Undo restores the persisted pre-stack positions");

  await button("scope-combine").click();
  await openScopes();
  const combined = await state();
  assert.equal(combined.scopeCount, 1, "Combine joins scope groups");
  assert.equal(await enabled("scope-combine"), false, "Combine disabled with one group");
  assert.equal(await enabled("scope-separate"), true, "Separate remains enabled with one group, as in ScopePopupMenu");

  const exported = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  assert.equal((exported.match(/^o /gm) ?? []).length, 1, "combined state exports one text scope record");
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), exported);
  const reloaded = await state();
  assert.equal(reloaded.scopeCount, 1, "export/reload preserves combined ScopeGroup state");
  assert.deepEqual(panels(reloaded), [0], "export/reload preserves combined position");

  await openScopes();
  await button("scope-separate").click();
  assert.deepEqual(panels(await state()), [0, 1], "Separate restores independently positioned plots");
  console.log("Scope menu browser state matrix, click, undo, and export/reload passed.");
} finally {
  await browser.close();
  await server.close();
}
