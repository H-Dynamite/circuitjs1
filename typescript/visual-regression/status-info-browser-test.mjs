import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("Vite did not expose a TCP address");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    window.__statusPaint = { texts: [], rects: [] };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      window.__statusPaint.texts.push({ canvas: this.canvas?.id, text: String(text), x, y, color: String(this.fillStyle), font: this.font });
      return fillText.call(this, text, x, y, ...rest);
    };
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
      window.__statusPaint.rects.push({ canvas: this.canvas?.id, x, y, width, height, color: String(this.fillStyle) });
      return fillRect.call(this, x, y, width, height);
    };
  });
  const origin = `http://127.0.0.1:${address.port}`;
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function");
  const readCircuit = async (name) => (await page.request.get(`${origin}/src/examples/circuits/${name}`)).text();
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const clearPaint = () => page.evaluate(() => { window.__statusPaint.texts.length = 0; window.__statusPaint.rects.length = 0; });
  const snapshot = () => page.evaluate(() => {
    const circuit = document.querySelector("#circuit-canvas");
    const scope = document.querySelector("#scope-canvas");
    return {
      circuit: { width: circuit.clientWidth, height: circuit.clientHeight },
      scope: { width: scope.clientWidth, height: scope.clientHeight },
      scopeBottomRight: scope.clientWidth > 1 && scope.clientHeight > 1
        ? Array.from(scope.getContext("2d").getImageData(scope.clientWidth - 2, scope.clientHeight - 2, 1, 1).data)
        : null,
      paint: structuredClone(window.__statusPaint),
      layout: window.CircuitJS1TS.getVisualRegressionLayout(),
      dynamic: window.CircuitJS1TS.getDynamicSnapshot()
    };
  });
  const lastText = (shot, canvas, prefix) => shot.paint.texts.findLast((entry) => entry.canvas === canvas && entry.text.startsWith(prefix));

  assert.equal(await page.locator("#native-status").count(), 0);
  for (const circuit of ["grid2.txt", "3-cgand.txt"]) {
    await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), await readCircuit(circuit));
    await clearPaint(); await frames();
    const shot = await snapshot();
    const time = lastText(shot, "circuit-canvas", "t = ");
    const step = lastText(shot, "circuit-canvas", "时间步长 = ");
    const left = Math.max(shot.circuit.width - 160, 0), top = Math.max(shot.circuit.height - 70, 0);
    assert.deepEqual([time?.x, time?.y, step?.x, step?.y], [left + 5, top + 15, left + 5, top + 30]);
    assert.ok(shot.paint.rects.some((rect) => rect.canvas === "circuit-canvas" && rect.x === left && rect.y === top && rect.width === shot.circuit.width - left && rect.height === shot.circuit.height - top && rect.color === "#111111"), `${circuit} paints the Legacy 160x70 dark information backing`);
    assert.equal(shot.paint.texts.some((entry) => entry.text.includes("TypeScript")), false);
  }

  await page.locator('[data-action="toggle-white-background"]').evaluate((button) => button.click());
  await clearPaint(); await frames();
  let shot = await snapshot();
  assert.ok(shot.paint.rects.some((rect) => rect.canvas === "circuit-canvas" && rect.color === "#eeeeee" && rect.width === Math.min(160, shot.circuit.width) && rect.height === Math.min(70, shot.circuit.height)), "printable mode paints the Legacy #eee information backing");
  assert.equal(lastText(shot, "circuit-canvas", "t = ")?.color, "#111111");
  await page.locator('[data-action="toggle-white-background"]').evaluate((button) => button.click());

  await page.setViewportSize({ width: 250, height: 240 });
  await clearPaint(); await frames();
  shot = await snapshot();
  const narrowTime = lastText(shot, "circuit-canvas", "t = ");
  assert.equal(narrowTime?.x, Math.max(shot.circuit.width - 160, 0) + 5);
  assert.ok(shot.paint.rects.some((rect) => rect.canvas === "circuit-canvas" && rect.x === Math.max(shot.circuit.width - 160, 0) && rect.width === Math.min(160, shot.circuit.width)), "narrow screens clamp the backing to available width");
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), await readCircuit("555int.txt"));
  await clearPaint(); await frames();
  shot = await snapshot();
  const scopeTime = lastText(shot, "scope-canvas", "t = ");
  const scopeStep = lastText(shot, "scope-canvas", "时间步长 = ");
  const lastScope = shot.dynamic.scopes.at(-1);
  assert.ok(lastScope, "555int owns a visible scope");
  const columnCount = Math.max(...shot.dynamic.scopes.map((scope) => scope.panel + 1));
  const infoWidth = columnCount <= 2 ? 240 : 160;
  const panelWidth = Math.max(20, (shot.scope.width - infoWidth) / columnCount);
  const lastRight = lastScope.panel * panelWidth + panelWidth - 10;
  assert.deepEqual([scopeTime?.x, scopeTime?.y, scopeStep?.x, scopeStep?.y], [lastRight + 20, 15, lastRight + 20, 30]);
  assert.equal(lastText(shot, "circuit-canvas", "t = "), undefined);

  await page.locator('[data-action="toggle-white-background"]').evaluate((button) => button.click());
  await clearPaint(); await frames();
  shot = await snapshot();
  assert.ok(shot.paint.rects.some((rect) => rect.canvas === "scope-canvas" && rect.x === 0 && rect.y === 0 && rect.width === shot.scope.width && rect.height === shot.scope.height && rect.color === "#eeeeee"), "white 555int scope paints one Legacy #eee canvas backing");
  assert.deepEqual(shot.scopeBottomRight, [238, 238, 238, 255], "white 555int info surface has #eee canvas pixels");
  await page.locator('[data-action="toggle-white-background"]').evaluate((button) => button.click());

  // Re-enabling editing clears only its own non-fatal notice.
  await page.locator('[data-action="toggle-disable-editing"]').evaluate((button) => button.click());
  await page.locator('[data-action="select-all"]').evaluate((button) => button.click());
  await clearPaint(); await frames();
  shot = await snapshot();
  assert.ok(lastText(shot, "scope-canvas", "Editing disabled."));
  await page.locator('[data-action="toggle-disable-editing"]').evaluate((button) => button.click());
  await clearPaint(); await frames();
  shot = await snapshot();
  assert.equal(lastText(shot, "scope-canvas", "Editing disabled."), undefined);
  assert.ok(lastText(shot, "scope-canvas", "t = "));

  await page.evaluate(() => {
    window.CircuitJS1TS.setRunning(false);
    const element = window.CircuitJS1TS.getElements()[0];
    element.__statusTestDoStep = element.doStep;
    element.doStep = () => { throw new Error("RUN status test failure"); };
  });
  await clearPaint();
  await page.locator('[data-action="run"]').click();
  await page.waitForFunction(() => !window.CircuitJS1TS.getDynamicSnapshot().running);
  await clearPaint();
  await frames(); await frames();
  shot = await snapshot();
  const failure = lastText(shot, "scope-canvas", "RUN status test failure");
  assert.deepEqual([failure?.x, failure?.y], [10, Math.max(15, shot.scope.height - 10)]);
  assert.equal(lastText(shot, "scope-canvas", "t = "), undefined);
  assert.equal(shot.paint.texts.some((entry) => entry.canvas === "scope-canvas" && entry.text.startsWith("Max=")), false, "error suppresses scope plots and ordinary information");
  assert.ok(shot.paint.rects.some((rect) => rect.canvas === "scope-canvas" && rect.y === Math.max(shot.scope.height - 30, 0) && rect.width === shot.scope.width && rect.height === Math.min(30, shot.scope.height) && rect.color === "#111111"), "error uses Legacy 30px bottom strip");
  await page.locator('[data-action="toggle-disable-editing"]').evaluate((button) => button.click());
  await page.locator('[data-action="toggle-disable-editing"]').evaluate((button) => button.click());
  await clearPaint(); await frames();
  shot = await snapshot();
  assert.ok(lastText(shot, "scope-canvas", "RUN status test failure"), "re-enabling editing never clears a solver error");
  await page.evaluate(() => {
    const element = window.CircuitJS1TS.getElements()[0];
    element.doStep = element.__statusTestDoStep;
    delete element.__statusTestDoStep;
  });
  await page.locator('[data-action="reset"]').click();
  await clearPaint();
  await frames();
  shot = await snapshot();
  assert.equal(lastText(shot, "scope-canvas", "RUN status test failure"), undefined);
  assert.ok(lastText(shot, "scope-canvas", "t = "), "Reset explicitly clears the stop/error message");
  console.log("status info browser checks passed");
} finally {
  await browser.close();
  await server.close();
}
