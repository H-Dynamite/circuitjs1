import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = process.cwd();
const CASES = [
  { id: "normal", viewport: { width: 1280, height: 900 }, classes: [], menu: 30, toolbar: 40 },
  { id: "compact", viewport: { width: 1280, height: 900 }, classes: ["compact-menu"], menu: 20, toolbar: 40 },
  { id: "toolbar-hidden", viewport: { width: 1280, height: 900 }, classes: ["toolbar-hidden"], menu: 30, toolbar: 0 },
  { id: "compact-toolbar-hidden", viewport: { width: 1280, height: 900 }, classes: ["compact-menu", "toolbar-hidden"], menu: 20, toolbar: 0 },
  { id: "narrow", viewport: { width: 760, height: 900 }, classes: [], menu: 30, toolbar: 40 }
];

function approximately(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 0.01, `${message}: expected ${expected}, got ${actual}`);
}

async function snapshot(page, testCase) {
  await page.setViewportSize(testCase.viewport);
  await page.evaluate((classes) => {
    const app = document.querySelector(".native-app");
    const toolbar = document.querySelector(".tool-bar");
    app?.classList.remove("compact-menu");
    toolbar?.classList.remove("hidden");
    app?.classList.add(...classes.filter((name) => name !== "toolbar-hidden"));
    toolbar?.classList.toggle("hidden", classes.includes("toolbar-hidden"));
    window.CircuitJS1TS.setRunning(false);
  }, testCase.classes);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const value = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: value.x, y: value.y, width: value.width, height: value.height,
        display: style.display, background: style.backgroundColor,
        borderBottom: style.borderBottom, padding: style.padding,
        fontSize: style.fontSize, fontWeight: style.fontWeight,
        marginRight: style.marginRight, border: style.border,
        boxSizing: style.boxSizing
      };
    };
    const layout = window.CircuitJS1TS.getVisualRegressionLayout();
    return {
      menu: rect(".menu-bar"),
      summary: rect(".menu-bar summary"),
      popup: rect(".menu-popup"),
      toolbar: rect(".tool-bar"),
      tool: rect(".tool-bar .tool-button"),
      firstIcon: rect(".tool-bar .tool-button > :first-child"),
      canvas: rect("#circuit-canvas"),
      layout
    };
  });
}

function assertCase(testCase, value) {
  const expectedOrigin = testCase.menu + testCase.toolbar;
  approximately(value.menu.height, testCase.menu, `${testCase.id} menu height`);
  approximately(value.summary.height, testCase.menu, `${testCase.id} summary height`);
  approximately(value.popup.y, testCase.menu, `${testCase.id} popup y`);
  approximately(value.toolbar.height, testCase.toolbar, `${testCase.id} toolbar height`);
  approximately(value.canvas.y, expectedOrigin, `${testCase.id} canvas y`);
  approximately(value.layout.workspaceOrigin.y, expectedOrigin, `${testCase.id} layout workspace y`);
  approximately(value.layout.scopeY, value.canvas.y + value.canvas.height, `${testCase.id} scope y without scopes`);
  assert.equal(value.menu.background, "rgb(248, 248, 248)", `${testCase.id} legacy menu background`);
  assert.equal(value.toolbar.background, "rgb(248, 248, 248)", `${testCase.id} legacy toolbar background`);
  assert.match(value.toolbar.borderBottom, /1px solid rgb\(204, 204, 204\)/, `${testCase.id} legacy toolbar border`);
  assert.equal(value.summary.fontSize, "13px", `${testCase.id} menu font size`);
  assert.equal(value.summary.fontWeight, "600", `${testCase.id} menu font weight`);
  if (testCase.toolbar > 0) {
    assert.equal(value.tool.width, 26, `${testCase.id} tool outer width`);
    assert.equal(value.tool.height, 26, `${testCase.id} tool outer height`);
  }
  assert.equal(value.tool.padding, "1px", `${testCase.id} tool padding`);
  assert.equal(value.tool.marginRight, "5px", `${testCase.id} tool right margin`);
  assert.equal(value.tool.border, "0px none rgb(51, 51, 51)", `${testCase.id} tool border`);
  assert.equal(value.tool.boxSizing, "border-box", `${testCase.id} tool box model`);
  if (testCase.toolbar > 0) {
    assert.equal(value.firstIcon.width, 24, `${testCase.id} icon width`);
    assert.equal(value.firstIcon.height, 24, `${testCase.id} icon height`);
  }
  if (testCase.toolbar === 0) {
    assert.equal(value.toolbar.display, "none", `${testCase.id} toolbar hidden`);
    assert.equal(value.layout.toolbarVisible, false, `${testCase.id} layout toolbar visibility`);
  } else {
    assert.equal(value.layout.toolbarVisible, true, `${testCase.id} layout toolbar visibility`);
  }
}

const server = await createServer({ root: ROOT, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("Vite did not expose a TCP address");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: CASES[0].viewport });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.getVisualRegressionLayout === "function");
  const fontUrl = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules ?? [])) {
        if (rule instanceof CSSFontFaceRule && rule.style.fontFamily.includes("CircuitJS1LegacyFontello")) {
          const match = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.src);
          if (match) return new URL(match[1], document.baseURI).href;
        }
      }
    }
    throw new Error("Missing native Fontello @font-face rule");
  });
  const fontResponse = await page.request.get(fontUrl);
  assert.equal(fontResponse.status(), 200, "native Fontello asset is served");
  assert.match(fontResponse.headers()["content-type"] ?? "", /font|octet-stream/, "native Fontello MIME type");
  assert.equal((await fontResponse.body()).subarray(0, 4).toString("ascii"), "wOF2", "native Fontello WOFF2 signature");
  assert.match(
    await page.locator(".legacy-toolbar-icon").first().evaluate((element) => getComputedStyle(element).fontFamily),
    /CircuitJS1LegacyFontello/,
    "toolbar glyph is bound to the native Fontello face"
  );
  for (const testCase of CASES) assertCase(testCase, await snapshot(page, testCase));

  await page.setViewportSize(CASES[0].viewport);
  await page.evaluate(() => {
    document.querySelector(".native-app")?.classList.remove("compact-menu");
    document.querySelector(".tool-bar")?.classList.remove("hidden");
  });

  // Exercise the visible controls rather than app-private state: Toolbar.java
  // returns to Select on a repeated tool click, and UIManager switches the
  // Run/Stop emphasis on every click.
  const modeText = () => page.locator("#tool-mode-label").textContent();
  await page.locator('.tool-bar [data-tool="wire"]').click();
  assert.equal(await modeText(), "模式：导线", "wire mode label");
  await page.locator('.tool-bar [data-tool="wire"]').click();
  assert.equal(await modeText(), "模式：选择", "repeated tool returns to select");
  await page.locator('.tool-bar [data-tool="resistor"]').click();
  assert.equal(await modeText(), "模式：电阻", "resistor mode label");

  const run = page.locator("#run-toggle");
  // Tool variants are intentionally hover-revealed, just like Toolbar.java.
  // Move to the actual control panel so the palette cannot cover the Run
  // button before asserting a real user click.
  await page.mouse.move(1270, 880);
  await page.evaluate(() => window.CircuitJS1TS.setRunning(false));
  assert.equal(await run.innerHTML(), "Run&nbsp;/&nbsp;<strong>STOP</strong>", "stopped run label");
  assert.equal(await run.evaluate((element) => element.classList.contains("topButton-red")), true, "stopped run color");
  await run.click();
  assert.equal(await run.innerHTML(), "<strong>RUN</strong>&nbsp;/&nbsp;Stop", "running run label");
  assert.equal(await run.evaluate((element) => element.classList.contains("topButton")), true, "running button style");
  console.log(`Top chrome browser layout: ${CASES.map((testCase) => testCase.id).join(", ")} passed.`);
} finally {
  await browser.close();
  await server.close();
}
