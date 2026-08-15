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
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function");
  await page.evaluate(() => {
    window.__exportedSvgBlobs = [];
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__exportedSvgBlobs.push(blob); return createObjectURL(blob); };
  });
  const source = ["$ 1 0.000005 10 50 5", "r 64 96 192 96 0 1000",
    "c 192 96 192 192 0 0.000001 0", "w 192 192 64 192 0", "w 64 192 64 96 0",
    "x 80 64 96 64 0 18 vector\\ntest"].join("\n");
  await page.evaluate((circuit) => { window.CircuitJS1TS.loadCircuit(circuit); window.CircuitJS1TS.setRunning(false); }, source);
  const exportSvg = async () => {
    const file = page.locator(".menu-bar > details").filter({ has: page.locator(":scope > summary", { hasText: "文件" }) });
    await file.locator(":scope > summary").click();
    const downloadEvent = page.waitForEvent("download");
    const fontParity = await page.evaluate(() => {
      const context = document.querySelector("#circuit-canvas").getContext("2d");
      context.font = "17px serif";
      const before = context.font;
      document.querySelector('[data-action="export-svg"]').click();
      return { before, after: context.font };
    });
    assert.equal((await downloadEvent).suggestedFilename(), "circuit.svg");
    assert.equal(fontParity.after, fontParity.before);
    return page.evaluate(async () => window.__exportedSvgBlobs.at(-1).text());
  };
  const darkSvg = await exportSvg();
  assert.doesNotMatch(darkSvg, /<image\b/iu);
  assert.match(darkSvg, /<path\b/iu);
  assert.match(darkSvg, /<text\b/iu);
  assert.match(darkSvg, /<rect[^>]+fill="#000000"/iu);
  const parsed = await page.evaluate((svg) => {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml"), root = doc.documentElement;
    return { root: root.localName, errors: doc.querySelectorAll("parsererror").length,
      width: Number(root.getAttribute("width")), height: Number(root.getAttribute("height")),
      viewBox: root.getAttribute("viewBox") };
  }, darkSvg);
  assert.equal(parsed.root, "svg"); assert.equal(parsed.errors, 0);
  assert.ok(parsed.width > 140 && parsed.height > 100);
  assert.equal(parsed.viewBox, `0 0 ${parsed.width} ${parsed.height}`);
  const options = page.locator(".menu-bar > details").filter({ has: page.locator(":scope > summary", { hasText: "选项" }) });
  await options.locator(":scope > summary").click();
  await options.locator('[data-action="toggle-white-background"]').click();
  const lightSvg = await exportSvg();
  assert.match(lightSvg, /<rect[^>]+fill="#ffffff"/iu);
  assert.doesNotMatch(lightSvg, /<image\b/iu);
  console.log("True vector SVG export, dimensions, theme, and download passed.");
} finally { await browser.close(); await server.close(); }
