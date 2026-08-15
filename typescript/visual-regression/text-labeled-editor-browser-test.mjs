import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({
  root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 }
});
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("Vite did not expose a TCP address");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

const openPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function");
  return page;
};

const expectVisibleEnabled = async (locator, description) => {
  assert.equal(await locator.isVisible(), true, `${description} is visible`);
  assert.equal(await locator.isDisabled(), false, `${description} is enabled`);
};

const drawAndEdit = async (page, tool, start, end) => {
  const draw = page.locator('.menu-bar > details[data-menu="draw"]');
  await draw.locator(":scope > summary").click();
  const item = draw.locator(`[data-tool="${tool}"]`);
  await item.locator("xpath=../..").hover();
  await item.click();
  const canvas = page.locator("#circuit-canvas");
  const box = await canvas.boundingBox();
  assert.ok(box, `${tool} canvas is visible`);
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + end.x, box.y + end.y);
  await page.mouse.up();
  const index = await page.evaluate(() => window.CircuitJS1TS.getElements().length - 1);
  const point = await page.evaluate((i) => window.CircuitJS1TS.getElementClickPoint(i), index);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const edit = page.locator('#element-context-menu [data-action="edit-selected"]');
  await expectVisibleEnabled(edit, `${tool} context Edit`);
  await edit.click();
  await page.locator("#element-edit-dialog[open]").waitFor();
};

const editText = async (format) => {
  const page = await openPage();
  const empty = format === "xml" ? '<cir ts="0.000005"/>' : "$ 1 0.000005 10 50 5";
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), empty);
  await drawAndEdit(page, "text", { x: 220, y: 220 }, { x: 300, y: 220 });
  const dialog = page.locator("#element-edit-dialog");
  const text = dialog.locator('textarea[data-edit-switch="text"]');
  const size = dialog.locator('input[data-edit-switch="size"]');
  const bar = dialog.locator('input[data-edit-switch="bar"]');
  await expectVisibleEnabled(text, `${format} Text multiline editor`);
  assert.equal(await text.getAttribute("rows"), "5");
  await text.fill("alpha\nbeta");
  await size.fill("36");
  await bar.check();
  await dialog.locator('button[type="submit"]').click();
  const edited = await page.evaluate(() => {
    const element = window.CircuitJS1TS.getElements()[0];
    return { className: element.getClassName(), lines: element.lines, size: element.size,
      flags: element.flags, source: window.CircuitJS1TS.exportCircuit() };
  });
  assert.equal(edited.className, "TextElm");
  assert.deepEqual(edited.lines, ["alpha", "beta"]);
  assert.equal(edited.size, 36);
  assert.notEqual(edited.flags & 2, 0);
  const fresh = await openPage();
  const reloaded = await fresh.evaluate((source) => {
    window.CircuitJS1TS.loadCircuit(source);
    const element = window.CircuitJS1TS.getElements()[0];
    return { className: element?.getClassName(), lines: element?.lines,
      size: element?.size, flags: element?.flags };
  }, edited.source);
  assert.equal(reloaded.className, "TextElm");
  assert.deepEqual(reloaded.lines, ["alpha", "beta"]);
  assert.equal(reloaded.size, 36);
  assert.notEqual(reloaded.flags & 2, 0);
  await fresh.close();
  await page.close();
};

const editLabeledNode = async (format) => {
  const page = await openPage();
  const empty = format === "xml" ? '<cir ts="0.000005"/>' : "$ 1 0.000005 10 50 5";
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), empty);
  await drawAndEdit(page, "labeled-node", { x: 360, y: 260 }, { x: 440, y: 260 });
  const dialog = page.locator("#element-edit-dialog");
  const name = dialog.locator('input[data-edit-switch="name"]');
  const internal = dialog.locator('input[data-edit-switch="internal"]');
  const rotate = dialog.locator('input[data-edit-switch="rotateText"]');
  await expectVisibleEnabled(name, `${format} LabeledNode name editor`);
  await expectVisibleEnabled(internal, `${format} LabeledNode internal flag`);
  await expectVisibleEnabled(rotate, `${format} LabeledNode rotate flag`);
  assert.equal(await dialog.locator('input[data-edit-switch="busWidth"]').count(), 0);
  await name.fill("data-bus");
  await internal.check();
  await rotate.check();
  await dialog.locator('button[type="submit"]').click();
  const edited = await page.evaluate(() => {
    const element = window.CircuitJS1TS.getElements()[0];
    return { className: element.getClassName(), text: element.text,
      internal: element.isInternal(), rotate: element.isRotateText(),
      busWidth: element.busWidth, steps: window.CircuitJS1TS.stepSimulation(1).steps,
      source: window.CircuitJS1TS.exportCircuit() };
  });
  assert.deepEqual({ ...edited, source: undefined }, {
    className: "LabeledNodeElm", text: "data-bus", internal: true,
    rotate: true, busWidth: 1, steps: 1, source: undefined
  });
  const fresh = await openPage();
  const reloaded = await fresh.evaluate((source) => {
    window.CircuitJS1TS.loadCircuit(source);
    const element = window.CircuitJS1TS.getElements()[0];
    return { className: element?.getClassName(), text: element?.text,
      internal: element?.isInternal(), rotate: element?.isRotateText(),
      busWidth: element?.busWidth, steps: window.CircuitJS1TS.stepSimulation(1).steps };
  }, edited.source);
  assert.deepEqual(reloaded, { className: "LabeledNodeElm", text: "data-bus",
    internal: true, rotate: true, busWidth: 1, steps: 1 });
  await fresh.close();
  await page.close();
};

try {
  await editText("text");
  await editText("xml");
  await editLabeledNode("text");
  await editLabeledNode("xml");
  console.log("Text and LabeledNode visible element editors passed.");
} finally {
  await browser.close();
  await server.close();
}
