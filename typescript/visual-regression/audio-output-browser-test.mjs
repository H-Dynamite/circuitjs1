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
    window.__audioOutputBlobs = [];
    window.__audioOutputPlayCount = 0;
    window.__audioOutputPauseCount = 0;
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__audioOutputBlobs.push(blob); return createObjectURL(blob); };
    HTMLMediaElement.prototype.play = () => { window.__audioOutputPlayCount += 1; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = () => { window.__audioOutputPauseCount += 1; };
  });
  const source = "$ 1 0.000005 10 50 5\n211 64 64 144 64 0 1 11025 2";
  await page.evaluate((circuit) => window.CircuitJS1TS.loadCircuit(circuit), source);
  await page.evaluate(() => window.CircuitJS1TS.setRunning(false));
  const selectAudioOutput = async () => {
    const point = await page.evaluate(() => window.CircuitJS1TS.getElementClickPoint(0));
    await page.mouse.click(point.x, point.y, { button: "right" });
  };
  await selectAudioOutput();
  const play = page.locator('[data-action="play-audio-output"]');
  const download = page.locator('[data-action="download-audio-output"]');
  assert.equal(await play.isVisible(), true);
  assert.equal(await play.textContent(), "▶ Play Audio 2");
  assert.equal(await download.count(), 0);
  let notReadyMessage = "";
  page.once("dialog", async (alert) => { notReadyMessage = alert.message(); await alert.accept(); });
  await play.click();
  assert.match(notReadyMessage, /Audio data is not ready yet/u);
  await page.evaluate(() => {
    const output = window.CircuitJS1TS.getElements()[0];
    output.data = Array.from({ length: 552 }, (_, index) => index % 2 === 0 ? -1 : 1);
    output.dataPtr = 552;
    output.dataFull = false;
  });
  await play.click();
  assert.equal(await download.isVisible(), true);
  const wav = await page.evaluate(async () => {
    const blob = window.__audioOutputBlobs.at(-1);
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const bytes = Uint8Array.from(wav);
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(view.getUint32(4, true), 1119);
  assert.equal(view.getUint32(24, true), 11025);
  assert.equal(view.getUint32(42, true), 1104);
  assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(48, true), 14);
  assert.equal(view.getInt16(46 + 29 * 2, true), 431);
  await play.click();
  assert.deepEqual(await page.evaluate(() => ({ played: window.__audioOutputPlayCount, paused: window.__audioOutputPauseCount })), { played: 2, paused: 1 });
  const downloadEvent = page.waitForEvent("download");
  await download.click();
  assert.match((await downloadEvent).suggestedFilename(), /^audio-\d{8}-\d{4}\.circuitjs\.wav$/u);
  const exported = await page.evaluate(() => window.CircuitJS1TS.exportCircuit());
  await page.evaluate((circuit) => window.CircuitJS1TS.loadCircuit(circuit), exported);
  await selectAudioOutput();
  assert.equal(await play.textContent(), "▶ Play Audio 2");
  assert.equal(await download.isVisible(), true);
  assert.deepEqual(await page.evaluate(() => {
    const output = window.CircuitJS1TS.getElements()[0];
    return { className: output.getClassName(), duration: output.duration,
      samplingRate: output.samplingRate, labelNum: output.labelNum };
  }), { className: "AudioOutputElm", duration: 1, samplingRate: 11025, labelNum: 2 });
  console.log("AudioOutput visible playback and WAV download passed.");
} finally {
  await browser.close(); await server.close();
}
