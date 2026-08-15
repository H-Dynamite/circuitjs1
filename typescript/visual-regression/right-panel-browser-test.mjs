import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 }
});
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") {
  throw new Error("Vite did not expose a TCP address");
}
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const origin = `http://127.0.0.1:${address.port}`;
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function");
  const source = await (await page.request.get(`${origin}/src/examples/circuits/3-cgand.txt`)).text();
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(text), source);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const panel = page.locator(".control-panel");
  assert.equal(await panel.locator("#element-inspector").isHidden(), true, "unselected circuit hides the TS inspector");
  assert.equal(await panel.locator("[data-parameter]").count(), 3, "inspector fields remain available for a selected element");
  assert.equal(await panel.locator(".native-note").count(), 0, "default panel has no TS-only note");
  assert.equal(await panel.locator(".panel-rule").count(), 0, "default panel has no non-legacy divider");
  assert.equal(await panel.locator("#current-circuit-title").textContent(), "CGAND", "known circuit uses its legacy menu title");

  const simulation = panel.locator('[data-control="simulation-speed"]');
  const current = panel.locator('[data-control="current-speed"]');
  const power = panel.locator('[data-control="power-brightness"]');
  assert.deepEqual(
    await Promise.all([simulation, current, power].map(async (control) => ({ min: await control.getAttribute("min"), max: await control.getAttribute("max") }))),
    [{ min: "0", max: "260" }, { min: "1", max: "100" }, { min: "1", max: "100" }],
    "right panel retains the three UIManager slider ranges"
  );
  assert.equal(await power.isDisabled(), true, "Power Brightness is disabled unless Show Power is active");

  const options = page.locator(".menu-bar > details").filter({ has: page.locator(":scope > summary", { hasText: "选项" }) });
  await options.locator(":scope > summary").evaluate((summary) => summary.click());
  await options.locator('[data-action="toggle-power"]').click();
  assert.equal(await power.isDisabled(), false, "real Options click enables Power Brightness");
  await power.focus();
  await power.press("End");
  assert.equal((await page.evaluate(() => window.CircuitJS1TS.exportCircuit())).split("\n", 1)[0].split(/\s+/)[6], "100", "visible Power Brightness interaction is serialized");

  const assertPowerBrightnessReload = async (text, format) => {
    await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), text);
    assert.equal(await power.inputValue(), "77", `${format} loads pb=77 into the visible panel`);
    const exported = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
    await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), exported);
    assert.equal(await power.inputValue(), "77", `${format} export/reload retains pb=77`);
  };
  await assertPowerBrightnessReload("$ 1 0.000005 10.2 50 5 77 5e-11\nr 0 0 32 0 0 10", "$ text");
  await assertPowerBrightnessReload('<cir f="1" ts="0.000005" ic="10.2" cb="50" pb="77" vr="5" mts="5e-11"><r x="0 0 32 0" f="0" r="10"/></cir>', "XML");

  const gateSource = await (await page.request.get(`${origin}/src/examples/circuits/555missing.txt`)).text();
  await page.evaluate((text) => window.CircuitJS1TS.loadCircuit(`${text}\nl 800 100 800 132 0 0.01 0 0`), gateSource);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const point = await page.evaluate(() => {
    const index = window.CircuitJS1TS.getElements().findIndex((element) => /GateElm$/.test(element.getClassName()));
    if (index < 0) throw new Error("Expected a real logic gate");
    return window.CircuitJS1TS.getElementClickPoint(index);
  });
  await page.mouse.click(point.x, point.y);
  assert.equal(await panel.locator("#element-inspector").isVisible(), true, "selecting an element restores the editable inspector");
  assert.notEqual(await panel.locator("#selected-title").textContent(), "", "selected inspector identifies the element");
  assert.deepEqual(
    await panel.locator("[data-parameter]").evaluateAll((inputs) => inputs.map((input) => ({ disabled: input.disabled, value: input.value }))),
    [{ disabled: true, value: "3" }, { disabled: true, value: "-6" }, { disabled: true, value: "-2" }],
    "a logic gate cannot edit unrelated R/C/L values"
  );
  assert.deepEqual(await panel.locator("[data-parameter-value]").allTextContents(), ["—", "—", "—"], "a logic gate clears all unrelated R/C/L outputs");
  console.log("Right panel legacy default, controls, power state, and selected inspector passed.");
} finally {
  await browser.close();
  await server.close();
}
