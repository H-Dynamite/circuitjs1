import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = process.cwd();
const DEFAULT_OUTPUT = resolve(ROOT, "visual-regression", "artifacts", "dynamic");
const MANIFEST = resolve(ROOT, "visual-regression", "dynamic-scenarios.json");
const CONTRACT = resolve(ROOT, "visual-regression", "dynamic-acceptance-contract.json");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const errorText = (error) => error instanceof Error ? error.message : String(error);

function optionsFrom(args) {
  const result = { output: DEFAULT_OUTPUT, scenario: undefined, headed: false, strict: false, diagnostic: false };
  for (const arg of args) {
    if (arg === "--headed") result.headed = true;
    else if (arg === "--strict") result.strict = true;
    else if (arg === "--diagnostic") result.diagnostic = true;
    else if (arg.startsWith("--output=")) result.output = resolve(ROOT, arg.slice(9));
    else if (arg.startsWith("--scenario=")) result.scenario = arg.slice(11);
    else if (arg === "--help") {
      console.log("Usage: node visual-regression/dynamic-runner.mjs [--scenario=id] [--headed] [--strict] [--diagnostic] [--output=PATH]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function legacyPlugin() {
  const root = resolve(ROOT, "public");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2" };
  return { name: "dynamic-regression-legacy", configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!pathname.startsWith("/legacy/")) return next();
    const file = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(`${root}${sep}`)) return next();
    try { response.setHeader("Content-Type", types[file.slice(file.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream"); response.end(await readFile(file)); } catch { next(); }
  }); }};
}

async function waitForCanvas(page) {
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(async () => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return [...document.querySelectorAll("canvas")].some((item) => item.getBoundingClientRect().width > 0);
  });
}
async function screenshot(page, file) { await mkdir(dirname(file), { recursive: true }); await page.screenshot({ path: file, animations: "disabled", caret: "hide" }); }
async function canvasLocator(page) {
  const index = await page.locator("canvas").evaluateAll((items) => {
    const candidates = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0)
      .sort((left, right) => right.item.getBoundingClientRect().width * right.item.getBoundingClientRect().height - left.item.getBoundingClientRect().width * left.item.getBoundingClientRect().height);
    return candidates[0]?.index ?? -1;
  });
  if (index < 0) throw new Error("no visible interactive canvas");
  return page.locator("canvas").nth(index);
}
async function diff(context, legacyFile, tsFile, output) {
  const [legacy, ts] = await Promise.all([readFile(legacyFile), readFile(tsFile)]);
  const page = await context.newPage();
  await page.setContent(`<!doctype html><canvas></canvas><script type="module">const a=new Image(),b=new Image();a.src=${JSON.stringify(`data:image/png;base64,${legacy.toString("base64")}`)};b.src=${JSON.stringify(`data:image/png;base64,${ts.toString("base64")}`)};await Promise.all([a.decode(),b.decode()]);const c=document.querySelector("canvas"),x=c.getContext("2d",{willReadFrequently:true});c.width=Math.max(a.width,b.width);c.height=Math.max(a.height,b.height);x.drawImage(a,0,0);const l=x.getImageData(0,0,c.width,c.height);x.clearRect(0,0,c.width,c.height);x.drawImage(b,0,0);const r=x.getImageData(0,0,c.width,c.height),o=x.createImageData(c.width,c.height);let changed=0,sum=0;for(let i=0;i<o.data.length;i+=4){let any=false;for(let j=0;j<3;j++){const d=Math.abs(l.data[i+j]-r.data[i+j]);o.data[i+j]=d;sum+=d;any||=d!==0}o.data[i+3]=255;changed+=Number(any)}x.putImageData(o,0,0);document.body.dataset.metrics=JSON.stringify({pixelCount:c.width*c.height,changedPixels:changed,diffPixelRatio:changed/(c.width*c.height),mae:sum/(c.width*c.height*3*255)})</script>`);
  await page.waitForFunction(() => Boolean(document.body.dataset.metrics));
  const metrics = await page.evaluate(() => JSON.parse(document.body.dataset.metrics));
  await screenshot(page, output); await page.close(); return metrics;
}
function apiExpression(app) { return app === "legacy" ? "window.CircuitJS1" : "window.CircuitJS1TS"; }
async function loadLegacy(page, baseUrl, source, diagnostic) {
  await page.goto(new URL("/legacy/circuitjs.html", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => typeof window.CircuitJS1 !== "undefined", undefined, { timeout: 20_000 });
  await waitForCanvas(page);
  const bridge = await page.evaluate((diagnosticMode) => Object.fromEntries(["getElementClickPoint", "getElementControl", "getElementDynamicState", "stepSimulation", "getSwitchPosition", "getElementPower", "getTimeStep", "getSubIterations", ...(diagnosticMode ? ["beginDynamicTrace", "recordDynamicTraceSnapshot", "consumeDynamicTrace"] : [])].map((name) => [name, typeof window.CircuitJS1?.[name]])), diagnostic);
  if (Object.values(bridge).some((type) => type !== "function")) return { status: "capability-missing", reason: `legacy bridge missing: ${JSON.stringify(bridge)}` };
  await page.evaluate((input) => { window.CircuitJS1.importCircuit(input, false); window.CircuitJS1.setSimRunning(false); }, source);
  await waitForCanvas(page); return { status: "ready" };
}
async function loadTs(page, baseUrl, source) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function", undefined, { timeout: 20_000 });
  await page.evaluate((input) => { window.CircuitJS1TS.loadCircuit(input); window.CircuitJS1TS.setRunning(false); }, source);
  await waitForCanvas(page); return { status: "ready" };
}
async function findTarget(page, app, target) {
  return page.evaluate(({ appName, dumpType, ordinal }) => {
    const api = appName === "legacy" ? window.CircuitJS1 : window.CircuitJS1TS;
    const classForDumpType = { s: "SwitchElm", S: "Switch2Elm", L: "LogicInputElm", "172": "VarRailElm", "174": "PotElm" };
    const matches = api.getElements().map((element, index) => ({ element, index })).filter(({ element }) => {
      const type = element.getClassName?.() ?? element.getType?.();
      return type === classForDumpType[dumpType];
    });
    const found = matches[ordinal];
    if (!found) throw new Error(`target ${dumpType}[${ordinal}] was not found`);
    return { index: found.index, type: found.element.getClassName?.() ?? found.element.getType?.() };
  }, { appName: app, dumpType: target.dumpType, ordinal: target.ordinal });
}
async function pointFor(page, app, index) { return page.evaluate(({ appName, elementIndex }) => (appName === "legacy" ? window.CircuitJS1 : window.CircuitJS1TS).getElementClickPoint(elementIndex), { appName: app, elementIndex: index }); }
async function selectTargetForRange(page, app, target, point, trace) {
  if (app !== "ts") return;
  const rangePoint = target.type === "PotElm"
    ? await page.evaluate((index) => window.CircuitJS1TS.getElementRangeClickPoint(index), target.index)
    : point;
  const canvas = await canvasLocator(page);
  await canvas.dispatchEvent("pointerdown", { clientX: rangePoint.x, clientY: rangePoint.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse" });
  await canvas.dispatchEvent("pointerup", { clientX: rangePoint.x, clientY: rangePoint.y, button: 0, pointerId: 1, pointerType: "mouse" });
  trace.push({ app, frame: "F1", eventType: "click", targetElementIndex: target.index, targetElementType: target.type, canvasPoint: point, timestamp: new Date().toISOString(), trustedUiRoute: "Canvas pointer selection for visible HTML range" });
}
async function controlFor(page, app, index) {
  if (app === "legacy") {
    return page.evaluate((elementIndex) => window.CircuitJS1.getElementControl(elementIndex), index);
  }
  return { controlType: "html-range" };
}
async function step(page, app, count) { if (count > 0) await page.evaluate(({ appName, steps }) => (appName === "legacy" ? window.CircuitJS1 : window.CircuitJS1TS).stepSimulation(steps), { appName: app, steps: count }); }
async function diagnosticCall(page, app, method) {
  const legacyName = { begin: "beginDynamicTrace", snapshot: "recordDynamicTraceSnapshot", consume: "consumeDynamicTrace" }[method];
  const tsName = { begin: "beginDiagnosticTrace", snapshot: "recordDiagnosticTraceSnapshot", consume: "consumeDiagnosticTrace" }[method];
  return page.evaluate(({ appName, name }) => (appName === "legacy" ? window.CircuitJS1 : window.CircuitJS1TS)[name](), { appName: app, name: app === "legacy" ? legacyName : tsName });
}
async function snapshot(page, app, target, simulationStepCount) {
  return page.evaluate(({ appName, index, simulationStepCount }) => {
    const api = appName === "legacy" ? window.CircuitJS1 : window.CircuitJS1TS;
    const exported = api.exportCircuit();
    if (appName === "ts") {
      const snapshot = api.getDynamicSnapshot(); const element = snapshot.elements[index];
      const state = element.type === "VarRailElm"
        ? { sliderValue: element.sliderValue, voltage: element.voltage }
        : element.type === "PotElm"
          ? { position: element.position }
          : { position: element.switchPosition, momentary: element.switchMomentary };
      return { simulationTime: snapshot.time, timeStep: snapshot.timeStep, subIterations: snapshot.subIterations, running: snapshot.running, simulationStepCount, serializedCircuitSha256: exported, scopeSummary: snapshot.scopes, target: { index, type: element.type, state, volts: element.volts, current: element.current, power: element.power } };
    }
    const element = api.getElements()[index];
    const dynamicState = api.getElementDynamicState(index);
    return { simulationTime: api.getTime(), timeStep: api.getTimeStep(), subIterations: api.getSubIterations(), running: api.isRunning(), simulationStepCount, serializedCircuitSha256: exported, scopeSummary: [], target: { index, type: element.getType(), state: dynamicState ?? { position: api.getSwitchPosition(index) }, volts: Array.from({ length: element.getPostCount() }, (_, node) => element.getVoltage(node)), current: element.getCurrent(), power: api.getElementPower(index) } };
  }, { appName: app, index: target.index, simulationStepCount }).then((state) => {
    const numericStatus = simulationStepCount === 0 ? "uncomputed" : "solved";
    const serializedCircuitSha256 = sha(state.serializedCircuitSha256);
    if (numericStatus === "uncomputed") {
      // Paused circuit import and UI input are intentionally not a solver
      // result.  Nulls make that distinction auditable without inventing zero.
      return { ...state, numericStatus, numericValidity: { volts: false, current: false, power: false }, serializedCircuitSha256, scopeSummary: state.scopeSummary.map((scope) => ({ ...scope, lastSample: null, minimum: null, maximum: null })), target: { ...state.target, volts: state.target.volts.map(() => null), current: null, power: null } };
    }
    return { ...state, numericStatus, numericValidity: { volts: state.target.volts.every(Number.isFinite), current: Number.isFinite(state.target.current), power: Number.isFinite(state.target.power) }, serializedCircuitSha256 };
  });
}
async function action(page, app, operation, point, frame, trace, target) {
  const canvas = await canvasLocator(page);
  const record = async (eventType) => { trace.push({ app, frame, eventType, targetElementIndex: target.index, targetElementType: target.type, canvasPoint: point, timestamp: new Date().toISOString(), trustedUiRoute: app === "legacy" ? "Canvas mouse dispatch" : "Canvas pointer dispatch" }); };
  if (operation.kind === "click-element") {
    if (app === "legacy") { await canvas.dispatchEvent("mousedown", { clientX: point.x, clientY: point.y, button: 0, buttons: 1 }); await record("pointerdown"); await canvas.dispatchEvent("mouseup", { clientX: point.x, clientY: point.y, button: 0 }); await record("pointerup"); }
    else { await canvas.dispatchEvent("pointerdown", { clientX: point.x, clientY: point.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse" }); await record("pointerdown"); await canvas.dispatchEvent("pointerup", { clientX: point.x, clientY: point.y, button: 0, pointerId: 1, pointerType: "mouse" }); await record("pointerup"); }
  } else if (operation.kind === "hold-element") {
    if (frame === "F2") { await canvas.dispatchEvent(app === "legacy" ? "mousedown" : "pointerdown", { clientX: point.x, clientY: point.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse" }); await record("pointerdown"); }
    if (frame === "F4") { await canvas.dispatchEvent(app === "legacy" ? "mouseup" : "pointerup", { clientX: point.x, clientY: point.y, button: 0, pointerId: 1, pointerType: "mouse" }); await record("pointerup"); }
  } else if (operation.kind === "set-element-slider") {
    const control = await controlFor(page, app, target.index);
    if (control === null) throw new Error(`no visible slider control for ${target.type}`);
    if (app === "legacy") {
      const scrollbar = page.locator(`[data-dynamic-control="${control.controlId}"]`);
      await scrollbar.waitFor({ state: "visible", timeout: 5_000 });
      const box = await scrollbar.boundingBox();
      if (box === null) throw new Error(`legacy slider ${control.controlId} has no box`);
      const sliderTrackStart = control.trackStart;
      const sliderTrackEnd = control.trackEnd;
      const controlValue = target.type === "VarRailElm"
        ? operation.value / 100
        : operation.value;
      const x = box.x + sliderTrackStart + (sliderTrackEnd - sliderTrackStart) * controlValue;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y);
      await page.mouse.up();
      trace.push({ app, frame, eventType: "pointerdown", targetElementIndex: target.index, targetElementType: target.type, canvasPoint: { x, y }, controlType: control.controlType, timestamp: new Date().toISOString(), trustedUiRoute: "Visible GWT Scrollbar mouse drag" });
      trace.push({ app, frame, eventType: "pointerup", targetElementIndex: target.index, targetElementType: target.type, canvasPoint: { x, y }, controlType: control.controlType, timestamp: new Date().toISOString(), trustedUiRoute: "Visible GWT Scrollbar mouse drag" });
    } else {
      const input = page.locator(`[data-element-range="${target.type === "VarRailElm" ? "var-rail-voltage" : "potentiometer"}"]`);
      await input.evaluate((element, value) => {
        const inputElement = element;
        inputElement.value = String(value);
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      }, target.type === "VarRailElm" ? operation.value : operation.value * 100);
      trace.push({ app, frame, eventType: "input", targetElementIndex: target.index, targetElementType: target.type, controlType: control.controlType, timestamp: new Date().toISOString(), trustedUiRoute: "Visible HTML range input" });
      trace.push({ app, frame, eventType: "change", targetElementIndex: target.index, targetElementType: target.type, controlType: control.controlType, timestamp: new Date().toISOString(), trustedUiRoute: "Visible HTML range input" });
    }
  } else throw new Error(`operation ${operation.kind} is not implemented for the P0 runner`);
}
function sameState(left, right) {
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) <= 1e-9;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return left === right;
  const leftKeys = Object.keys(left), rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key) && sameState(left[key], right[key]));
}
function matchesExpectedState(actual, expected) {
  return Object.entries(expected).every(([key, value]) =>
    Object.hasOwn(actual, key) && sameState(actual[key], value)
  );
}
function numericComparison(legacy, ts) {
  const sameTarget = legacy.target.type === ts.target.type && sameState(legacy.target.state, ts.target.state);
  if (legacy.numericStatus === "uncomputed" && ts.numericStatus === "uncomputed") {
    return { numericStatus: "uncomputed", compared: false, finite: null, sameTargetState: sameTarget, maxAbsoluteDelta: null };
  }
  const values = [...legacy.target.volts, legacy.target.current, legacy.target.power, ...ts.target.volts, ts.target.current, ts.target.power];
  return { numericStatus: "solved", compared: true, finite: legacy.numericStatus === "solved" && ts.numericStatus === "solved" && values.every(Number.isFinite), sameTargetState: sameTarget, maxAbsoluteDelta: Math.max(Math.abs((legacy.target.current ?? 0) - (ts.target.current ?? 0)), Math.abs((legacy.target.power ?? 0) - (ts.target.power ?? 0)), ...legacy.target.volts.map((value, index) => Math.abs(value - (ts.target.volts[index] ?? 0))) ) };
}
function expectedTargetState(scenario, frame) {
  if (frame === "F0" || frame === "F1") return scenario.target.expectedInitial;
  if (scenario.operation.kind === "hold-element") return frame === "F2" || frame === "F3" ? scenario.operation.expectedDuringHold : scenario.operation.expectedAfterRelease;
  return scenario.operation.expectedAfterInput;
}
function evaluateInvariants(apps, frames, scenario) {
  const expectedSteps = { F0: 0, F1: 0, F2: 0, F3: 1, F4: 10, F5: 100 };
  const expectedStatus = { F0: "uncomputed", F1: "uncomputed", F2: "uncomputed", F3: "solved", F4: "solved", F5: "solved" };
  const perApp = Object.fromEntries(Object.entries(apps).map(([app, result]) => {
    const byFrame = Object.fromEntries(result.frames.map((item) => [item.frame, item]));
    const uncomputedValuesNull = ["F0", "F1", "F2"].every((frame) => {
      const item = byFrame[frame];
      return item.target.volts.every((value) => value === null) && item.target.current === null && item.target.power === null;
    });
    return [app, {
      paused: frames.every((frame) => byFrame[frame].running === false),
      stepCounts: frames.every((frame) => byFrame[frame].simulationStepCount === expectedSteps[frame]),
      numericStatuses: frames.every((frame) => byFrame[frame].numericStatus === expectedStatus[frame]),
      uncomputedValuesNull,
      declaredTargetStates: frames.every((frame) => matchesExpectedState(byFrame[frame].target.state, expectedTargetState(scenario, frame))),
      f0f1Stable: sameState(byFrame.F0.target.state, byFrame.F1.target.state) && byFrame.F0.serializedCircuitSha256 === byFrame.F1.serializedCircuitSha256,
      f3AfterF2: byFrame.F3.simulationStepCount === byFrame.F2.simulationStepCount + 1,
      f4AfterF3: byFrame.F4.simulationStepCount === byFrame.F3.simulationStepCount + 9,
      f5AfterF4: byFrame.F5.simulationStepCount === byFrame.F4.simulationStepCount + 90,
    }];
  }));
  return { perApp, passed: Object.values(perApp).every((entry) => Object.values(entry).every(Boolean)) };
}
async function captureFrame({ page, app, output, scenario, target, frame, trace, point, simulationStepCount, diagnostic }) {
  const instruction = scenario.frames[frame];
  if (diagnostic && frame === "F2") await diagnosticCall(page, app, "begin");
  if (frame === "F1" && scenario.operation.kind === "set-element-slider") await selectTargetForRange(page, app, target, point, trace);
  if (instruction.after) await action(page, app, scenario.operation, point, frame, trace, target);
  if (diagnostic && frame === "F2") await diagnosticCall(page, app, "snapshot");
  const contractSteps = { F0: 0, F1: 0, F2: 0, F3: 1, F4: 9, F5: 90 };
  await step(page, app, contractSteps[frame]);
  const data = await snapshot(page, app, target, simulationStepCount);
  const base = join(output, scenario.id, app, frame);
  await screenshot(page, `${base}.png`);
  await writeFile(`${base}.json`, JSON.stringify({ frame, ...data }, null, 2));
  const diagnosticTrace = diagnostic && frame === "F3"
    ? await diagnosticCall(page, app, "consume")
    : undefined;
  return { frame, screenshot: `${base}.png`, snapshot: `${base}.json`, ...(diagnosticTrace === undefined ? {} : { diagnosticTrace }), ...data };
}
export async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const [manifest, contract] = await Promise.all([readFile(MANIFEST, "utf8").then(JSON.parse), readFile(CONTRACT, "utf8").then(JSON.parse)]);
  const candidates = manifest.scenarios.filter((scenario) => scenario.priority === 0 && ["click-element", "hold-element"].includes(scenario.operation.kind));
  const scenario = options.scenario ? manifest.scenarios.find((item) => item.id === options.scenario) : candidates[0];
  if (!scenario) throw new Error("no requested P0 dynamic scenario");
  if (!contract.p0ScenarioIds.includes(scenario.id)) throw new Error("runner currently accepts only P0 manifest scenarios");
  await rm(options.output, { recursive: true, force: true }); await mkdir(options.output, { recursive: true });
  const source = await readFile(join(ROOT, "src", "examples", "circuits", scenario.circuit), "utf8");
  const server = await createServer({ root: ROOT, logLevel: "error", plugins: [legacyPlugin()], server: { host: "127.0.0.1", port: 0 } }); await server.listen();
  const address = server.httpServer.address(); if (!address || typeof address === "string") throw new Error("Vite did not expose a TCP address");
  const browser = await chromium.launch({ headless: !options.headed }); const context = await browser.newContext({ viewport: manifest.captureContract.viewport, deviceScaleFactor: 1, serviceWorkers: "block" });
  const report = { generatedAt: new Date().toISOString(), scenarioId: scenario.id, sourceSha256: sha(source), status: "failed", apps: {}, numericComparison: {}, invariants: null, actionTrace: [], contract: relative(ROOT, CONTRACT).split(sep).join("/"), error: null };
  try {
    for (const app of ["legacy", "ts"]) {
      const page = await context.newPage();
      const loaded = app === "legacy" ? await loadLegacy(page, `http://127.0.0.1:${address.port}/`, source, options.diagnostic) : await loadTs(page, `http://127.0.0.1:${address.port}/`, source);
      if (loaded.status !== "ready") { report.status = "capability-missing"; report.apps[app] = loaded; await page.close(); break; }
      const target = await findTarget(page, app, scenario.target); const point = await pointFor(page, app, target.index); const frames = [];
      let simulationStepCount = 0;
      for (const frame of contract.requiredFrameIds) {
        simulationStepCount += ({ F0: 0, F1: 0, F2: 0, F3: 1, F4: 9, F5: 90 })[frame];
        frames.push(await captureFrame({ page, app, output: options.output, scenario, target, frame, trace: report.actionTrace, point, simulationStepCount, diagnostic: options.diagnostic }));
      }
      report.apps[app] = { status: "completed", target, frames }; await page.close();
    }
    if (report.status !== "capability-missing" && report.apps.legacy?.status === "completed" && report.apps.ts?.status === "completed") {
      let visualReview = false;
      for (const frame of contract.requiredFrameIds) {
        const legacy = report.apps.legacy.frames.find((item) => item.frame === frame), ts = report.apps.ts.frames.find((item) => item.frame === frame);
        const diffFile = join(options.output, scenario.id, "diff", `${frame}.png`); const visual = await diff(context, legacy.screenshot, ts.screenshot, diffFile); const numeric = numericComparison(legacy, ts);
        report.numericComparison[frame] = { ...numeric, visual, diff: diffFile };
        visualReview ||= visual.diffPixelRatio > 0 || visual.mae > 0;
      }
      report.invariants = evaluateInvariants(report.apps, contract.requiredFrameIds, scenario);
      const comparisonsPass = Object.values(report.numericComparison).every((result) => result.numericStatus === "uncomputed" ? result.sameTargetState : result.finite && result.sameTargetState && result.maxAbsoluteDelta <= 1e-6);
      report.status = report.invariants.passed && comparisonsPass ? (visualReview ? "review" : "passed") : "failed";
    }
  } catch (error) { report.status = "failed"; report.error = errorText(error); }
  finally { await context.close(); await browser.close(); await server.close(); }
  await writeFile(join(options.output, "report.json"), JSON.stringify(report, null, 2)); console.log(`Dynamic report: ${join(options.output, "report.json")}`);
  if (report.status !== "passed" && (report.status !== "review" || options.strict)) process.exitCode = 1;
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
