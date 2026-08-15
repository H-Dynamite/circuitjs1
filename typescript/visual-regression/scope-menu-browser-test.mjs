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
  const initialExport = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  assert.match(initialExport, /^o 23 16 0 4099 10 0\.0015625 0 2 23 3$/m,
    "555 scope 1 retains speed, flags, scales, position and plot list on no-op export");
  assert.match(initialExport, /^o 31 32 0 4106 10 0\.00009765625 1 1$/m,
    "555 scope 2 retains its independent persisted state on no-op export");
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

  // XML scope state has attributes that do not exist in old text dumps.  The
  // native first stage must keep XY channels, manual per-plot scaling and
  // brightness state even though XY trace drawing is a later migration phase.
  const xySource = await (await page.request.get(`http://127.0.0.1:${address.port}/src/examples/circuits/plot2d-checker.txt`)).text();
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), xySource);
  const xyExport = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  const xy = await page.evaluate((text) => {
    const scope = new DOMParser().parseFromString(text, "application/xml").querySelector("o");
    if (scope === null) return null;
    return {
      speed: scope.getAttribute("sp"),
      flags: scope.getAttribute("f"),
      xy: [scope.getAttribute("xy2x"), scope.getAttribute("xy2y"), scope.getAttribute("xy2br")],
      plots: [...scope.querySelectorAll(":scope > p")].map((plot) => [plot.getAttribute("ms"), plot.getAttribute("mp")])
    };
  }, xyExport);
  assert.ok(xy, "plot2d fixture exports its scope");
  assert.equal(xy.speed, "64", "XY scope retains sampling speed");
  assert.equal(xy.flags, "x2000d3", "XY/manual-scale flags survive export");
  assert.deepEqual(
    xy.xy,
    ["2", "0", "4"],
    "XY axis and brightness selections survive export"
  );
  assert.deepEqual(
    xy.plots,
    [["0.75", "-85"], ["0.000049999999999999996", "0"], ["0.5", "-126"], ["0.000049999999999999996", "0"], ["2", "0"], ["0.000049999999999999996", "0"]],
    "per-plot manual scales and positions survive XML export"
  );

  // Regression for a previously lossy path: combine temporarily owns several
  // records, then Separate must restore each record's own advanced state.
  const advancedXml = '<cir ts="0.000005">' +
    '<r x="0 0 64 0" f="0" r="10"/><r x="96 0 160 0" f="0" r="20"/>' +
    '<o en="0" sp="32" f="x2000d3" p="0" md="9" tp="7" triggerMode="2" triggerEdge="1" triggerLevel="1.25" xy2x="0" xy2y="1" xy2br="2"><p f="1" v="0" sc="4" ms="2" mp="-8"/></o>' +
    '<o en="1" sp="96" f="x2000d3" p="1" md="11" tp="5" triggerMode="1" triggerEdge="0" triggerLevel="-0.5" xy2x="1" xy2y="0" xy2br="3"><p f="2" v="0" sc="8" ms="3" mp="14"/></o>' +
    '</cir>';
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), advancedXml);
  await openScopes();
  await button("scope-combine").click();
  await openScopes();
  await button("scope-separate").click();
  const advancedXmlExport = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  const advancedXmlState = await page.evaluate((text) => [...new DOMParser()
    .parseFromString(text, "application/xml").querySelectorAll("o")]
    .map((scope) => ({ attrs: Object.fromEntries([...scope.attributes].map((attr) => [attr.name, attr.value])), plot: Object.fromEntries([...scope.querySelector("p").attributes].map((attr) => [attr.name, attr.value])) })), advancedXmlExport);
  assert.deepEqual(advancedXmlState, [
    { attrs: { en: "0", sp: "32", f: "x2000d3", p: "0", md: "9", tp: "7", triggerMode: "2", triggerEdge: "1", triggerLevel: "1.25", xy2x: "0", xy2y: "1", xy2br: "2" }, plot: { f: "1", v: "0", sc: "4", ms: "2", mp: "-8" } },
    { attrs: { en: "1", sp: "96", f: "x2000d3", p: "1", md: "11", tp: "5", triggerMode: "1", triggerEdge: "0", triggerLevel: "-0.5", xy2x: "1", xy2y: "0", xy2br: "3" }, plot: { f: "2", v: "0", sc: "8", ms: "3", mp: "14" } }
  ], "combine → separate preserves every XML scope's advanced state");
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), advancedXmlExport);
  assert.equal((await state()).scopeCount, 2, "advanced XML scopes reload after combine/separate");

  const advancedText = '$ 1 0.000005 10.2 50 5 43 5e-11\n' +
    'r 0 0 64 0 0 10\nr 96 0 160 0 0 20\n' +
    'o 0 32 0 2887683 10 0.05 0 1 8 1 2.5 -7\n' +
    'o 1 96 0 2887683 20 0.1 1 1 9 2 3.5 14';
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), advancedText);
  await openScopes();
  await button("scope-combine").click();
  await openScopes();
  await button("scope-separate").click();
  const advancedTextExport = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  assert.match(advancedTextExport, /^o 0 32 0 2887683 10 0\.05 0 1 8 1 2\.5 -7$/m,
    "combine → separate retains Text flags, speed, divisions, plot flags and manual scale");
  assert.match(advancedTextExport, /^o 1 96 0 2887683 20 0\.1 1 1 9 2 3\.5 14$/m,
    "combine → separate restores independent Text scope state");
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), advancedTextExport);
  assert.equal((await state()).scopeCount, 2, "advanced Text scopes reload after combine/separate");

  await page.setViewportSize({ width: 700, height: 900 });
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), source);
  const narrow = await page.evaluate(() => window.CircuitJS1TS.getVisualRegressionLayout());
  assert.equal(narrow.scopeInfoWidth, 240, "narrow two-column scope layout reserves legacy 240px info area");
  assert.equal(narrow.scopeRects.length, 2, "narrow viewport exposes both persisted scope rectangles");
  assert.ok(narrow.scopeRects.every((rect) => rect.x + rect.width <= narrow.scope.width - narrow.scopeInfoWidth),
    "narrow scope rectangles do not overlap the legacy info column");
  await openScopes();
  await button("scope-stack").click();
  const stackedNarrow = await page.evaluate(() => window.CircuitJS1TS.getVisualRegressionLayout());
  assert.deepEqual(stackedNarrow.scopeRects.map((rect) => rect.position), [0, 0],
    "narrow stack keeps both scopes in their persisted position column");
  assert.ok(stackedNarrow.scopeRects[1].y > stackedNarrow.scopeRects[0].y,
    "narrow stacked scopes are vertically divided rather than overdrawn");
  console.log("Scope menu browser state matrix, click, undo, and export/reload passed.");
} finally {
  await browser.close();
  await server.close();
}
