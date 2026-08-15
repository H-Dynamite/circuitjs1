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
const origin = `http://127.0.0.1:${address.port}`;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function");

  const options = page.locator(".menu-bar > details").filter({
    has: page.locator(":scope > summary", { hasText: "选项" })
  });
  const open = async (menu) => {
    await page.locator(".menu-bar > details[open]").evaluateAll((items) => {
      items.forEach((item) => { item.open = false; });
    });
    await menu.locator(":scope > summary").click();
    assert.equal(await menu.getAttribute("open"), "", "visible menu summary opens Options");
  };
  const option = (name) => options.locator(`[data-action="${name}"]`);

  await open(options);
  assert.deepEqual(
    await options.locator(":scope > .option-menu > button").evaluateAll((items) =>
      items.map((item) => item.dataset.action)
    ),
    [
      "toggle-current", "toggle-voltage", "toggle-power", "toggle-values",
      "toggle-small-grid", "toggle-toolbar", "toggle-crosshair",
      "toggle-euro-resistor", "toggle-iec-gates", "toggle-white-background",
      "toggle-current-convention", "toggle-disable-editing", "toggle-wheel-edit",
      "shortcuts", "other-options"
    ],
    "Options uses the complete legacy command order with no TS-only primary item"
  );
  assert.equal(await option("toggle-show-mode").count(), 0, "Show Mode is not a legacy Options item");
  assert.equal(await option("modification-setup").count(), 0, "Modification Setup is not a legacy Options item");
  assert.equal(
    await page.locator('[data-action="subcircuits"]').evaluate((item) => item.closest("details")?.dataset.menu),
    "tools",
    "Subcircuit Manager remains under Tools only"
  );

  await option("toggle-power").click();
  assert.equal(await option("toggle-power").getAttribute("aria-pressed"), "true", "Show Power enables");
  assert.equal(await option("toggle-voltage").getAttribute("aria-pressed"), "false", "Show Power clears Show Voltage");
  await open(options);
  await option("toggle-voltage").click();
  assert.equal(await option("toggle-voltage").getAttribute("aria-pressed"), "true", "Show Voltage enables");
  assert.equal(await option("toggle-power").getAttribute("aria-pressed"), "false", "Show Voltage clears Show Power");

  for (const name of [
    "toggle-iec-gates", "toggle-white-background",
    "toggle-current-convention", "toggle-wheel-edit"
  ]) {
    await open(options);
    await option(name).click();
  }
  const edit = page.locator('.menu-bar > details[data-menu="edit"]');
  await open(edit);
  await edit.locator('[data-action="select-all"]').click();
  await open(options);
  await option("toggle-disable-editing").click();
  await open(edit);
  assert.equal(await edit.locator('[data-action="copy"]').isDisabled(), false, "read-only mode keeps a previously valid Edit action available");
  await edit.locator('[data-action="copy"]').click();
  assert.equal(await page.locator("#native-status").count(), 0, "Disable Editing feedback no longer uses a TS-only DOM badge");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function");
  await open(options);
  assert.equal(await option("toggle-iec-gates").getAttribute("aria-pressed"), "true", "IEC setting persists across reload");
  assert.equal(await option("toggle-white-background").getAttribute("aria-pressed"), "true", "white background persists across reload");
  assert.equal(await option("toggle-current-convention").getAttribute("aria-pressed"), "false", "current convention persists across reload");
  assert.equal(await option("toggle-wheel-edit").getAttribute("aria-pressed"), "false", "wheel edit setting persists across reload");
  assert.equal(await option("toggle-disable-editing").getAttribute("aria-pressed"), "false", "Disable Editing remains a session/read-only state");

  console.log("Options menu legacy path, real click state, and reload persistence passed.");
} finally {
  await browser.close();
  await server.close();
}
