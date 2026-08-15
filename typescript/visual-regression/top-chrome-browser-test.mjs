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
    // Test each responsive geometry as a settled layout; do not sample the
    // optional sidebar animation between two viewport configurations.
    app?.style.setProperty("--sidebar-duration", "0ms");
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
        backgroundImage: style.backgroundImage,
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
      menuLabels: Array.from(document.querySelectorAll(".menu-bar > details > summary"), (summary) => {
        const range = document.createRange();
        range.selectNodeContents(summary);
        const text = range.getBoundingClientRect();
        const box = summary.getBoundingClientRect();
        return {
          text: summary.textContent?.trim(), x: box.x, width: box.width,
          textX: text.x, padding: getComputedStyle(summary).padding
        };
      }),
      popup: rect(".menu-popup"),
      toolbar: rect(".tool-bar"),
      tool: rect(".tool-bar .tool-button"),
      firstIcon: rect(".tool-bar .tool-button > :first-child"),
      fontTools: Array.from(document.querySelectorAll(".tool-bar .tool-button:has(.legacy-toolbar-icon)"), (element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, width: rect.width, marginRight: getComputedStyle(element).marginRight };
      }),
      fontIcons: Array.from(document.querySelectorAll(".tool-bar .legacy-toolbar-icon"), (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, transform: style.transform };
      }),
      canvas: rect("#circuit-canvas"),
      layout
    };
  });
}

function assertCase(testCase, value) {
  const expectedOrigin = testCase.menu + testCase.toolbar;
  approximately(value.menu.height, testCase.menu, `${testCase.id} menu height`);
  approximately(value.summary.height, testCase.menu - 2, `${testCase.id} summary content height`);
  approximately(value.popup.y, testCase.menu, `${testCase.id} popup y`);
  approximately(value.toolbar.height, testCase.toolbar, `${testCase.id} toolbar height`);
  approximately(value.canvas.y, expectedOrigin, `${testCase.id} canvas y`);
  approximately(value.layout.workspaceOrigin.y, expectedOrigin, `${testCase.id} layout workspace y`);
  approximately(value.layout.scopeY, value.canvas.y + value.canvas.height, `${testCase.id} scope y without scopes`);
  assert.match(value.menu.backgroundImage, /linear-gradient/, `${testCase.id} legacy menu gradient`);
  assert.equal(value.toolbar.background, "rgb(248, 248, 248)", `${testCase.id} legacy toolbar background`);
  assert.match(value.toolbar.borderBottom, /1px solid rgb\(204, 204, 204\)/, `${testCase.id} legacy toolbar border`);
  assert.equal(value.summary.fontSize, "13px", `${testCase.id} menu font size`);
  assert.equal(value.summary.fontWeight, "600", `${testCase.id} menu font weight`);
  assert.equal(value.summary.padding, testCase.menu === 30 ? "5px 10px 5px 12px" : "2px 10px 2px 12px", `${testCase.id} first menu item padding`);
  if (testCase.id === "normal") {
    const expectedMenuTextX = [13, 59, 105, 150, 209, 255, 300];
    const expectedMenuWidth = [48, 46, 45, 59, 46, 45, 46];
    const expectedMenuPadding = [
      "5px 10px 5px 12px", "5px 10px", "5px 9px 5px 10px",
      "5px 10px", "5px 10px", "5px 9px 5px 10px", "5px 10px"
    ];
    assert.equal(value.menuLabels.length, expectedMenuTextX.length, "normal top-level menu count");
    value.menuLabels.forEach((label, index) => {
      approximately(label.textX, expectedMenuTextX[index], `normal menu ${label.text} text x`);
      approximately(label.width, expectedMenuWidth[index], `normal menu ${label.text} width`);
      assert.equal(label.padding, expectedMenuPadding[index], `normal menu ${label.text} padding`);
    });
  }
  if (testCase.toolbar > 0) {
    approximately(value.tool.width, 35.59375, `${testCase.id} first Fontello tool outer width`);
    assert.equal(value.tool.height, 26, `${testCase.id} tool outer height`);
  }
  assert.equal(value.tool.padding, "1px", `${testCase.id} tool padding`);
  assert.equal(value.tool.marginRight, "5px", `${testCase.id} tool right margin`);
  assert.equal(value.tool.border, "0px none rgb(51, 51, 51)", `${testCase.id} tool border`);
  assert.equal(value.tool.boxSizing, "border-box", `${testCase.id} tool box model`);
  if (testCase.toolbar > 0) {
    assert.equal(value.firstIcon.width, 24, `${testCase.id} icon width`);
    assert.equal(value.firstIcon.height, 24, `${testCase.id} icon height`);
    const expectedFontelloX = Array.from({ length: 10 }, (_, index) => 3 + index * 40.59375);
    assert.equal(value.fontTools.length, 10, `${testCase.id} exactly ten Fontello toolbar tools`);
    assert.equal(value.fontIcons.length, 10, `${testCase.id} exactly ten Fontello glyphs`);
    value.fontTools.forEach((tool, index) => {
      approximately(tool.x, expectedFontelloX[index], `${testCase.id} Fontello tool ${index + 1} x`);
      approximately(tool.width, 35.59375, `${testCase.id} Fontello tool ${index + 1} width`);
      assert.equal(tool.marginRight, "5px", `${testCase.id} Fontello tool ${index + 1} margin`);
    });
    value.fontIcons.forEach((icon, index) => {
      assert.equal(icon.transform, "matrix(1, 0, 0, 1, 0, 2)", `${testCase.id} Fontello glyph ${index + 1} 2px baseline transform`);
      approximately(icon.y, value.tool.y + 3, `${testCase.id} Fontello glyph ${index + 1} rendered baseline`);
    });
  }
  if (testCase.id === "normal") {
    approximately(value.layout.sidebarX, 1106, "normal sidebar x");
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

  // The regression baseline's 665px workspace is the real 3-cgand circuit
  // state (including its restored scopes), rather than a manufactured canvas
  // size.  Load it through the public app bridge before checking that layout.
  const baselineCircuit = await (await fetch(new URL("src/examples/circuits/3-cgand.txt", `http://127.0.0.1:${address.port}/`))).text();
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), baselineCircuit);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const baselineLayout = await snapshot(page, CASES[0]);
  approximately(baselineLayout.layout.sidebarX, 1106, "3-cgand normal sidebar x");
  approximately(baselineLayout.canvas.height, 665, "3-cgand normal canvas height");
  approximately(baselineLayout.layout.scopeY, 735, "3-cgand normal scope y");

  await page.setViewportSize(CASES[0].viewport);
  await page.evaluate(() => {
    document.querySelector(".native-app")?.classList.remove("compact-menu");
    document.querySelector(".tool-bar")?.classList.remove("hidden");
  });

  // UIManager.centerCircuit() reserves its default 20% scope band while a
  // scope-less circuit is initially framed below 800px wide.  Use a tall
  // circuit so height, rather than the 1.5 scale cap, proves that branch.
  const tallCircuit = "$ 1 0.000005 10 50 5\nw 0 0 100 1000 0";
  await page.setViewportSize({ width: 760, height: 600 });
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), tallCircuit);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const narrowViewport = await page.evaluate(() => window.CircuitJS1TS.getVisualRegressionLayout().viewport);
  approximately(narrowViewport.scale, 424 / 1101, "narrow scope-less framing reserves the legacy scope band");
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const wideViewport = await page.evaluate(() => window.CircuitJS1TS.getVisualRegressionLayout().viewport);
  approximately(wideViewport.scale, 530 / 1101, "wide framing stops reserving the narrow scope band");
  await page.setViewportSize(CASES[0].viewport);
  await page.evaluate((source) => window.CircuitJS1TS.loadCircuit(source), baselineCircuit);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

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
  const reset = page.locator('.run-row [data-action="reset"]');
  // Tool variants are intentionally hover-revealed, just like Toolbar.java.
  // Move to the actual control panel so the palette cannot cover the Run
  // button before asserting a real user click.
  await page.mouse.move(1270, 880);
  await page.evaluate(() => window.CircuitJS1TS.setRunning(false));
  assert.equal(await run.innerHTML(), "运行&nbsp;/&nbsp;<strong>停止</strong>", "stopped run label");
  assert.equal(await run.evaluate((element) => element.classList.contains("topButton-red")), true, "stopped run color");
  const stoppedControl = await page.evaluate(() => {
    const element = document.querySelector("#run-toggle");
    if (!(element instanceof HTMLButtonElement)) throw new Error("Missing Run/Stop control");
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: box.x, y: box.y, width: box.width, height: box.height, color: style.color, background: style.backgroundColor, font: style.font, padding: style.padding, margin: style.margin, boxSizing: style.boxSizing };
  });
  approximately(stoppedControl.x, 1166, "stopped Run/Stop x");
  approximately(stoppedControl.y, 35, "stopped Run/Stop y");
  approximately(stoppedControl.width, 78.84375, "stopped Run/Stop width");
  assert.equal(stoppedControl.height, 30, "stopped Run/Stop height");
  assert.equal(stoppedControl.background, "rgb(255, 0, 0)", "stopped Run/Stop red background");
  assert.equal(stoppedControl.color, "rgb(255, 255, 255)", "stopped Run/Stop white text");
  assert.equal(stoppedControl.font, '13px "Arial Unicode MS", Arial, sans-serif', "stopped Run/Stop font");
  assert.equal(stoppedControl.padding, "5px 7px", "stopped Run/Stop padding");
  assert.equal(stoppedControl.margin, "5px 0px 5px 5px", "stopped Run/Stop margin");
  assert.equal(stoppedControl.boxSizing, "border-box", "stopped Run/Stop box model");
  await run.click();
  assert.equal(await run.innerHTML(), "<strong>运行</strong>&nbsp;/&nbsp;停止", "running run label");
  assert.equal(await run.evaluate((element) => element.classList.contains("topButton")), true, "running button style");
  const runningControls = await page.evaluate(() => Array.from(document.querySelectorAll(".run-row button"), (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { text: element.textContent, x: box.x, y: box.y, width: box.width, height: box.height, color: style.color, background: style.backgroundColor, font: style.font, padding: style.padding, margin: style.margin, boxSizing: style.boxSizing };
  }));
  assert.deepEqual(runningControls, [
    { text: "重置", x: 1119, y: 35, width: 42, height: 30, color: "rgb(0, 0, 0)", background: "rgb(231, 231, 231)", font: '13px "Arial Unicode MS", Arial, sans-serif', padding: "5px 7px", margin: "5px 0px 5px 5px", boxSizing: "border-box" },
    { text: "运行 / 停止", x: 1166, y: 35, width: 78.84375, height: 30, color: "rgb(0, 0, 0)", background: "rgb(231, 231, 231)", font: '13px "Arial Unicode MS", Arial, sans-serif', padding: "5px 7px", margin: "5px 0px 5px 5px", boxSizing: "border-box" }
  ], "legacy-equivalent running control geometry and style");
  await page.evaluate(() => window.CircuitJS1TS.stepSimulation(4));
  assert.ok((await page.evaluate(() => window.CircuitJS1TS.getDynamicSnapshot().time)) > 0, "simulation advances before reset");
  await reset.click();
  assert.deepEqual(
    await page.evaluate(() => ({ time: window.CircuitJS1TS.getDynamicSnapshot().time, running: window.CircuitJS1TS.getDynamicSnapshot().running, resetFocused: document.activeElement === document.querySelector('.run-row [data-action="reset"]') })),
    { time: 0, running: true, resetFocused: true },
    "Reset is a visible, focused control that restores the running simulation"
  );

  // Use a real summary click.  The native popup must start below the title
  // (rather than covering it) and retain the compact GWT File MenuBar row
  // geometry at the 3-cgand desktop baseline.
  const fileMenu = page.locator(".menu-bar > details").first();
  await fileMenu.evaluate((element) => { element.open = false; });
  const fileSummary = fileMenu.locator("summary");
  await fileSummary.click();
  assert.equal(await fileMenu.getAttribute("open"), "", "File menu opens through its visible summary");
  const filePopup = await fileMenu.locator(".menu-popup").evaluate((element) => {
    const box = element.getBoundingClientRect();
    const summary = element.parentElement?.querySelector("summary")?.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, summaryBottom: summary?.bottom };
  });
  approximately(filePopup.x, 0, "File popup x");
  approximately(filePopup.y, 30, "File popup y");
  approximately(filePopup.width, 197, "File popup width");
  approximately(filePopup.height, 345, "File popup height");
  assert.equal(filePopup.y >= (filePopup.summaryBottom ?? Infinity), true, "File popup does not cover its summary");
  console.log(`Top chrome browser layout: ${CASES.map((testCase) => testCase.id).join(", ")} passed.`);
} finally {
  await browser.close();
  await server.close();
}
