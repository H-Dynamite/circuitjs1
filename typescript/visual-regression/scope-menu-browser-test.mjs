import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = process.cwd();

function panels(snapshot) {
  return [...new Set(snapshot.scopes.map((scope) => scope.panel))].sort((a, b) => a - b);
}

async function xyCanvasAfterFixedSteps(page, steps = 2048) {
  return page.evaluate(async (fixedSteps) => {
    const canvas = document.querySelector("#scope-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const context = canvas.getContext("2d");
    if (context === null) return null;
    window.CircuitJS1TS.setVisualRegressionSchedulerHold(true);
    window.CircuitJS1TS.setRunning(false);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const baseline = new Uint8ClampedArray(
      context.getImageData(0, 0, canvas.width, canvas.height).data
    );
    window.CircuitJS1TS.stepSimulation(fixedSteps);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0;
    let colored = 0;
    let changed = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      if (red > 180 || green > 180 || blue > 180) bright += 1;
      if (red !== green || green !== blue) colored += 1;
      if (red !== baseline[index] || green !== baseline[index + 1] || blue !== baseline[index + 2]) changed += 1;
    }
    return { bright, colored, changed };
  }, steps);
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

  // Existing legacy fixtures exercise VAL_R=2 on the Lamp and Memristor.
  // Their scopes must stay in ohms rather than being silently treated as V.
  for (const fixture of ["lightbulb.txt", "mr.txt"]) {
    const source = await (await page.request.get(`http://127.0.0.1:${address.port}/src/examples/circuits/${fixture}`)).text();
    await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), source);
    const resistanceScope = (await state()).scopes.find((scope) => scope.unit === "Ω");
    assert.ok(resistanceScope, `${fixture} restores its VAL_R scope in ohms`);
    assert.match(resistanceScope.name, /电阻/, `${fixture} labels VAL_R as resistance`);
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
  // ScopePlot samples by simulation time, not requestAnimationFrame: after 32
  // real solver steps make the two speed-16 channels advance one bucket ahead
  // of the speed-32 scope.  The initial count can include a real pre-test UI
  // frame, so assert their deterministic relative time-base rather than a
  // frame-rate-dependent absolute count.
  await page.evaluate(() => window.CircuitJS1TS.stepSimulation(32));
  const sampled = await state();
  const counts = sampled.scopes.map((scope) => scope.sampleCount);
  assert.equal(counts[0], counts[1], "paired speed-16 plots share a bucket clock");
  assert.equal(counts[0], (counts[2] ?? 0) + 1,
    "scope speed advances min/max ring buckets on simulation time");
  assert.ok(sampled.scopes.every((scope) => scope.minimum !== null && scope.maximum !== null),
    "scope snapshots retain finite extrema rather than one frame value");
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
  // native renderer must both retain the advanced fields and draw its real
  // continuous XY trajectory from solver samples.
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
  const xyCanvas = await xyCanvasAfterFixedSteps(page);
  assert.ok(xyCanvas !== null && xyCanvas.bright > 100,
    "plot2d-checker paints a real XY Canvas path after exactly 2048 solver steps");
  assert.ok(xyCanvas !== null && xyCanvas.colored > 100,
    "plot2d-checker preserves its green reference axes / XY color path");
  assert.ok(xyCanvas !== null && xyCanvas.changed > 500,
    "2048 deterministic solver samples change the Canvas by a continuous XY trail, not just status text");

  // ScopePlot2d writes automatic X/Y scale back into its plots before XML
  // export.  Start from a deliberately stale persisted scale to prove this is
  // a state mutation, not merely a renderer-local scale.
  const autoScaleSource = xySource
    .replace('f="x2000d3"', 'f="x2000c3"')
    .replace('v="0" sc="6.4"', 'v="0" sc="0.5"');
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), autoScaleSource);
  await xyCanvasAfterFixedSteps(page);
  const autoScale = await page.evaluate(() => {
    const xml = new DOMParser().parseFromString(window.CircuitJS1TS.exportCircuit(), "application/xml");
    return xml.querySelector("o > p")?.getAttribute("sc") ?? null;
  });
  assert.notEqual(autoScale, "0.5",
    "automatic XY scale updates the serializable X/Y plot scale");

  for (const [fixture, expected] of [
    ["plot2d-color.txt", ["6", "4", "10", "8"]],
    ["plot2d-smile.txt", ["4", "6", "8", "10"]]
  ]) {
    const fixtureSource = await (await page.request.get(
      `http://127.0.0.1:${address.port}/src/examples/circuits/${fixture}`
    )).text();
    await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), fixtureSource);
    const evidence = await xyCanvasAfterFixedSteps(page);
    assert.ok(evidence !== null && evidence.changed > 500,
      `${fixture} paints a real continuous XY trail after 2048 fixed solver steps`);
    const attrs = await page.evaluate(() => {
      const xml = new DOMParser().parseFromString(window.CircuitJS1TS.exportCircuit(), "application/xml");
      const scope = xml.querySelector("o");
      return ["xy2br", "xy2r", "xy2g", "xy2b"].map((name) => scope?.getAttribute(name) ?? null);
    });
    assert.deepEqual(attrs, expected,
      `${fixture} preserves XY brightness/RGB settings after rendering`);
  }

  // Regression for a previously lossy path: combine temporarily owns several
  // records, then Separate must restore each record's own advanced state.
  const advancedXml = '<cir ts="0.000005">' +
    '<r x="0 0 64 0" f="0" r="10"/><r x="96 0 160 0" f="0" r="20"/>' +
    '<o en="0" sp="32" f="x2000d3" p="0" md="9" tp="7" triggerMode="2" triggerEdge="1" triggerLevel="1.25" xy2x="0" xy2y="1" xy2br="2" xy2r="3" xy2g="0" xy2b="4"><p f="1" v="0" sc="4" ms="2" mp="-8"/></o>' +
    '<o en="1" sp="96" f="x2000d3" p="1" md="11" tp="0" triggerMode="1" triggerEdge="0" triggerLevel="-0.5" xy2x="1" xy2y="0" xy2br="3" xy2r="0" xy2g="2" xy2b="1"><p f="2" v="0" sc="8" ms="3" mp="14"/></o>' +
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
    { attrs: { en: "0", sp: "32", f: "x2000d3", p: "0", md: "9", tp: "7", triggerMode: "2", triggerEdge: "1", triggerLevel: "1.25", xy2x: "0", xy2y: "1", xy2br: "2", xy2r: "3", xy2g: "0", xy2b: "4" }, plot: { f: "1", v: "0", sc: "4", ms: "2", mp: "-8" } },
    { attrs: { en: "1", sp: "96", f: "x2000d3", p: "1", md: "11", tp: "0", triggerMode: "1", triggerEdge: "0", triggerLevel: "-0.5", xy2x: "1", xy2y: "0", xy2br: "3", xy2r: "0", xy2g: "2", xy2b: "1" }, plot: { f: "2", v: "0", sc: "8", ms: "3", mp: "14" } }
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

  // Legacy Text has only global V/A scope-scale fields.  An auto XY update
  // must patch the raw-text fast path too, otherwise export/reload silently
  // restores the stale input scale even though the live renderer changed it.
  const autoScaleText = '$ 1 0.000005 10.2 50 5 43 5e-11\n' +
    'r 0 0 64 0 0 10\nr 96 0 160 0 0 20\n' +
    'o 0 64 0 4288 0.5 0.1 0 2 1 0';
  await page.evaluate((text) => {
    window.CircuitJS1TS.loadCircuit(text);
    window.CircuitJS1TS.setVisualRegressionSchedulerHold(true);
    window.CircuitJS1TS.stepSimulation(8);
  }, autoScaleText);
  const autoScaleTextExport = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  assert.match(autoScaleTextExport, /^o 0 64 0 4288 0\.1 0\.1 0 2 1 0$/m,
    "Text XY auto-scale writes the current X/Y scale through its raw-text export path");
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), autoScaleTextExport);
  assert.equal((await state()).scopeCount, 1, "Text XY auto-scale export reloads its persisted scope");

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
