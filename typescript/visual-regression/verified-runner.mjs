import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = process.cwd(), DEFAULT_OUTPUT = resolve(ROOT, "visual-regression", "artifacts");
const CIRCUITS = resolve(ROOT, "src", "examples", "circuits"), VIEWPORT = { width: 1280, height: 900 };
const REVIEW_DIFF_PIXEL_RATIO = 0.01, REVIEW_MAE = 0.002;
const MENUS = [
  ["file", "\u6587\u4ef6", "\u6587\u4ef6", "new"], ["edit", "\u7f16\u8f91", "\u7f16\u8f91", "undo"],
  ["draw", "\u7ed8\u5236", "\u7ed8\u5236", "tool"], ["scopes", "\u793a\u6ce2\u5668", "\u793a\u6ce2\u5668", "scope-reset"],
  ["options", "\u9009\u9879", "\u9009\u9879", "toggle-current"], ["tools", "\u5de5\u5177", "\u5de5\u5177", "reset"],
  ["circuits", "\u7535\u8def", "\u7535\u8def", "examples"]
];
const sha = (value) => createHash("sha256").update(value).digest("hex");
const nameFor = (id) => id.split("/").map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_")).join(sep);
const errorText = (error) => error instanceof Error ? error.message : String(error);
const filesFor = (output, stem) => ({ legacy: join(output, "legacy", `${stem}.png`), ts: join(output, "ts", `${stem}.png`), diff: join(output, "diff", `${stem}.png`) });

function optionsFrom(args) {
  const result = { output: DEFAULT_OUTPUT, limit: undefined, keepOutput: false, diff: true, headed: false, strict: false };
  for (const arg of args) {
    if (arg === "--help") { console.log("Options: --limit=N --output=PATH --headed --no-diff --keep-output"); process.exit(0); }
    if (arg === "--keep-output") result.keepOutput = true;
    else if (arg === "--strict") result.strict = true;
    else if (arg === "--no-diff") result.diff = false;
    else if (arg === "--headed") result.headed = true;
    else if (arg.startsWith("--output=")) result.output = resolve(ROOT, arg.slice(9));
    else if (arg.startsWith("--limit=")) { result.limit = Number(arg.slice(8)); if (!Number.isInteger(result.limit) || result.limit < 1) throw new Error("--limit must be a positive integer"); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}
async function findCircuits(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async (entry) => {
    const path = join(dir, entry.name); return entry.isDirectory() ? findCircuits(path) : entry.isFile() && entry.name.endsWith(".txt") ? [path] : [];
  }))).flat().sort((a, b) => a.localeCompare(b));
}
async function prepare(output, keep) {
  await mkdir(output, { recursive: true });
  if (!keep) for (const entry of await readdir(output, { withFileTypes: true })) if (entry.name !== ".gitignore") await rm(join(output, entry.name), { recursive: true, force: true });
  for (const part of ["legacy", "ts", "diff", "metadata"]) await mkdir(join(output, part), { recursive: true });
}
async function shot(page, path) { await mkdir(dirname(path), { recursive: true }); await page.screenshot({ path, animations: "disabled", caret: "hide" }); }

function legacyPlugin() {
  const root = resolve(ROOT, "public"), types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2" };
  return { name: "visual-regression-legacy", configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!pathname.startsWith("/legacy/")) return next();
    const file = resolve(root, `.${decodeURIComponent(pathname)}`); if (!file.startsWith(`${root}${sep}`)) return next();
    try { const data = await readFile(file); response.setHeader("Content-Type", types[file.slice(file.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream"); response.end(data); } catch { next(); }
  }); }};
}
function watch(page, app) {
  let failures = [];
  page.on("pageerror", (error) => failures.push(`${app} pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`${app} request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${app} HTTP ${response.status()}: ${response.url()}`); });
  return { reset: () => { failures = []; }, take: () => [...new Set(failures)] };
}
async function stableCanvas(page) {
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(async () => {
    const canvas = document.querySelector("canvas"); if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) return false;
    await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    return document.fonts.status === "loaded" && canvas.getBoundingClientRect().width > 0;
  }, undefined, { timeout: 10_000 });
}
async function legacyLoad(page, baseUrl, id, source) {
  const expectedPath = `/legacy/circuitjs1/circuits/${id}`;
  const requested = page.waitForResponse((response) => new URL(response.url()).pathname === expectedPath, { timeout: 20_000 });
  const url = new URL("/legacy/circuitjs.html", baseUrl); url.searchParams.set("startCircuit", id);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  const response = await requested; if (!response.ok()) throw new Error(`Legacy circuit request failed: ${response.status()} ${id}`);
  const actual = await response.text(); if (sha(actual) !== sha(source)) throw new Error(`Legacy source hash mismatch: ${id}`);
  await page.evaluate(() => {
    // GWT exposes the animation control as a checkbox; leave every capture in
    // the stopped state even when its implementation details change.
    const pause = [...document.querySelectorAll("input[type=checkbox]")]
      .find((input) => /pause|stop/i.test(input.getAttribute("title") ?? ""));
    if (pause instanceof HTMLInputElement && !pause.checked) pause.click();
    // The native layout reserves its sidebar and exposes a 1106x665 drawing
    // surface at the standard 1280x900 viewport. Capture the GWT canvas in
    // that same CSS box so page screenshots compare the same drawing region.
    const canvases = [...document.querySelectorAll("canvas")];
    const canvas = canvases.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    if (canvas instanceof HTMLCanvasElement) { canvas.style.width = "1106px"; canvas.style.height = "665px"; }
  });
  await stableCanvas(page);
  return { requestedPath: expectedPath, sourceSha256: sha(actual), paused: true, canvas: await page.locator("canvas").evaluateAll((items) => {
    const canvas = items.filter((item) => item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0)
      .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("No visible legacy canvas");
    const box = canvas.getBoundingClientRect(); return { width: canvas.width, height: canvas.height, cssWidth: box.width, cssHeight: box.height, normalizedCssSize: "1106x665" };
  }) };
}
function elementsIn(source) { return source.split(/\r?\n/).filter((line) => !["", "$", "o", "#"].includes(line.trim().charAt(0))).length; }
async function tsLoad(page, baseUrl, source) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function", undefined, { timeout: 20_000 });
  await page.evaluate((input) => window.CircuitJS1TS.loadCircuit(input), source);
  const state = await page.evaluate(() => { window.CircuitJS1TS.setRunning(false); const exported = window.CircuitJS1TS.exportCircuit(); return { elementCount: window.CircuitJS1TS.getElements().length, exportedLength: exported.length, exportedPrefix: exported.slice(0, 160), exportedCircuit: exported }; });
  const expectedElementCount = elementsIn(source); if (state.elementCount !== expectedElementCount) throw new Error(`TS element count mismatch: expected ${expectedElementCount}, got ${state.elementCount}`);
  await stableCanvas(page);
  const { exportedCircuit, ...summary } = state;
  const canvas = await page.locator("canvas").evaluateAll((items) => {
    const item = items.filter((candidate) => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0)
      .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    if (!(item instanceof HTMLCanvasElement)) throw new Error("No visible TypeScript canvas");
    const box = item.getBoundingClientRect(); return { width: item.width, height: item.height, cssWidth: box.width, cssHeight: box.height };
  });
  return { inputSha256: sha(source), expectedElementCount, ...summary, exportedSha256: sha(exportedCircuit), paused: true, canvas };
}
async function verifyMenu(page, app, entry, index) {
  const [id, legacyText, tsText, key] = entry;
  if (app === "ts") {
    const summaries = page.locator(".menu-bar > details > summary"), texts = (await summaries.allTextContents()).map((text) => text.trim());
    if (texts.length !== MENUS.length || texts[index] !== tsText) throw new Error(`TS menu order/text mismatch: ${JSON.stringify(texts)}`);
    await summaries.nth(index).click(); const menu = page.locator(".menu-bar > details").nth(index);
    if (await menu.getAttribute("open") === null) throw new Error(`TS ${id} menu did not open`);
    const item = key === "tool" ? menu.locator("[data-tool]").first() : menu.locator(`[data-action="${key}"]`);
    await item.waitFor({ state: "visible", timeout: 10_000 }); return { labels: texts, keyItem: (await item.textContent())?.trim() ?? "" };
  }
  const menus = page.locator(".gwt-MenuBar-horizontal .gwt-MenuItem"), texts = (await menus.allTextContents()).map((text) => text.trim());
  if (texts.length < MENUS.length || texts[index] !== legacyText) throw new Error(`Legacy menu order/text mismatch: ${JSON.stringify(texts)}`);
  await menus.nth(index).click(); const popup = page.locator(".gwt-MenuBarPopup, .gwt-PopupPanel").filter({ has: page.locator(".gwt-MenuItem") }).last();
  await popup.waitFor({ state: "visible", timeout: 10_000 }); const keyItem = (await popup.locator(".gwt-MenuItem").first().textContent())?.trim() ?? "";
  if (!keyItem) throw new Error(`Legacy ${id} menu has no visible key item`); return { labels: texts, keyItem };
}
async function diff(context, legacyPath, tsPath, outputPath) {
  const [legacy, ts] = await Promise.all([readFile(legacyPath), readFile(tsPath)]), page = await context.newPage({ viewport: VIEWPORT });
  await page.setContent(`<!doctype html><canvas></canvas><script type="module">const a=new Image(),b=new Image();a.src=${JSON.stringify(`data:image/png;base64,${legacy.toString("base64")}`)};b.src=${JSON.stringify(`data:image/png;base64,${ts.toString("base64")}`)};await Promise.all([a.decode(),b.decode()]);const c=document.querySelector('canvas'),x=c.getContext('2d',{willReadFrequently:true});c.width=Math.max(a.width,b.width);c.height=Math.max(a.height,b.height);x.drawImage(a,0,0);const l=x.getImageData(0,0,c.width,c.height);x.clearRect(0,0,c.width,c.height);x.drawImage(b,0,0);const r=x.getImageData(0,0,c.width,c.height),o=x.createImageData(c.width,c.height);let changed=0,sum=0;for(let i=0;i<o.data.length;i+=4){let any=false;for(let j=0;j<3;j++){const d=Math.abs(l.data[i+j]-r.data[i+j]);o.data[i+j]=d;sum+=d;any||=d!==0}o.data[i+3]=255;changed+=Number(any)}x.putImageData(o,0,0);document.body.dataset.metrics=JSON.stringify({pixelCount:c.width*c.height,changedPixels:changed,diffPixelRatio:changed/(c.width*c.height),mae:sum/(c.width*c.height*3*255)})</script>`);
  await page.waitForFunction(() => Boolean(document.body.dataset.metrics)); const metrics = await page.evaluate(() => JSON.parse(document.body.dataset.metrics)); await shot(page, outputPath); await page.close(); return metrics;
}
async function previous(output, id, files) {
  try { const value = JSON.parse(await readFile(join(output, "metadata", `${nameFor(id)}.json`), "utf8")); await Promise.all(Object.values(files).map(readFile)); return value.captureStatus === "passed" ? value : undefined; } catch { return undefined; }
}
function addMonitorFailures(result, monitors) { const failures = monitors.flatMap((item) => item.take()); if (failures.length) { result.status = "failed"; result.captureStatus = "failed"; result.error = [result.error, ...failures].filter(Boolean).join("\n"); } }
function html(results, output) { const image = (result, kind) => result.files?.[kind] ? `<a href="${relative(output,result.files[kind]).split(sep).join("/")}"><img src="${relative(output,result.files[kind]).split(sep).join("/")}"></a>` : "-"; return `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}img{width:200px}</style><p>Review when changed pixels > ${REVIEW_DIFF_PIXEL_RATIO * 100}% or MAE > ${REVIEW_MAE * 100}%.</p><table>${results.map((r)=>`<tr><td>${r.id}</td><td>${r.status}</td><td>${r.metrics ? `${(r.metrics.diffPixelRatio*100).toFixed(2)}% / ${(r.metrics.mae*100).toFixed(3)}%` : "-"}</td><td>${image(r,"legacy")}</td><td>${image(r,"ts")}</td><td>${image(r,"diff")}</td><td>${r.error??""}</td></tr>`).join("")}</table>`; }

export async function run() {
  try {
    await access(resolve(ROOT, "public", "legacy", "circuitjs.html"));
  } catch {
    throw new Error("Visual regression requires an external legacy baseline at public/legacy/circuitjs.html. Run it from the migration checkout, not the standalone TypeScript release.");
  }
  const options = optionsFrom(process.argv.slice(2)); await prepare(options.output, options.keepOutput);
  const all = await findCircuits(CIRCUITS), selected = (options.limit ? all.slice(0, options.limit) : all).map((file) => ({ file, id: relative(CIRCUITS, file).split(sep).join("/") }));
  if (!selected.length) throw new Error("No circuit fixtures found"); console.log(`Capturing ${selected.length}/${all.length} static circuit scenarios.`);
  const server = await createServer({ root: ROOT, logLevel: "error", plugins: [legacyPlugin()], server: { host: "127.0.0.1", port: 0 } }); await server.listen(); const address = server.httpServer.address(); if (!address || typeof address === "string") throw new Error("Vite did not expose a TCP address"); const baseUrl = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ headless: !options.headed }), context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, serviceWorkers: "block" }), legacyPage = await context.newPage(), tsPage = await context.newPage(), legacyWatch = watch(legacyPage,"legacy"), tsWatch = watch(tsPage,"ts"); const results=[];
  try {
    const first = selected[0], firstSource = await readFile(first.file,"utf8");
    for (const [index, entry] of MENUS.entries()) { const id=`__menu__${entry[0]}`, files=filesFor(options.output,`menu-${entry[0]}`), old=options.keepOutput && await previous(options.output,id,files); if(old){results.push(old);continue} const result={id,status:"passed",captureStatus:"passed",files,error:undefined,menu:{}}; legacyWatch.reset();tsWatch.reset();try{await legacyLoad(legacyPage,baseUrl,first.id,firstSource);result.menu.legacy=await verifyMenu(legacyPage,"legacy",entry,index);await shot(legacyPage,files.legacy);await tsLoad(tsPage,baseUrl,firstSource);result.menu.ts=await verifyMenu(tsPage,"ts",entry,index);await shot(tsPage,files.ts);if(options.diff){result.metrics=await diff(context,files.legacy,files.ts,files.diff);if(result.metrics.diffPixelRatio>REVIEW_DIFF_PIXEL_RATIO||result.metrics.mae>REVIEW_MAE)result.status="review"}}catch(error){result.status="failed";result.captureStatus="failed";result.error=errorText(error)}addMonitorFailures(result,[legacyWatch,tsWatch]);await writeFile(join(options.output,"metadata",`${nameFor(id)}.json`),JSON.stringify(result,null,2));results.push(result);}
    for(const scenario of selected){const files=filesFor(options.output,nameFor(scenario.id)),old=options.keepOutput&&await previous(options.output,scenario.id,files);if(old){results.push(old);console.log(`[resumed] ${scenario.id}`);continue}const source=await readFile(scenario.file,"utf8"),result={id:scenario.id,status:"passed",captureStatus:"passed",files,error:undefined,source:{inputSha256:sha(source)}};legacyWatch.reset();tsWatch.reset();try{result.source.legacy=await legacyLoad(legacyPage,baseUrl,scenario.id,source);await shot(legacyPage,files.legacy);result.source.ts=await tsLoad(tsPage,baseUrl,source);await shot(tsPage,files.ts);if(options.diff){result.metrics=await diff(context,files.legacy,files.ts,files.diff);if(result.metrics.diffPixelRatio>REVIEW_DIFF_PIXEL_RATIO||result.metrics.mae>REVIEW_MAE)result.status="review"}}catch(error){result.status="failed";result.captureStatus="failed";result.error=errorText(error)}addMonitorFailures(result,[legacyWatch,tsWatch]);await writeFile(join(options.output,"metadata",`${nameFor(scenario.id)}.json`),JSON.stringify(result,null,2));results.push(result);console.log(`[${result.status}] ${scenario.id}`)}
  } finally { await context.close();await browser.close();await server.close(); }
  const summary={passed:results.filter((r)=>r.status==="passed").length,review:results.filter((r)=>r.status==="review").length,failed:results.filter((r)=>r.status==="failed").length}; const report={generatedAt:new Date().toISOString(),viewport:VIEWPORT,thresholds:{REVIEW_DIFF_PIXEL_RATIO,REVIEW_MAE},execution:{mode:options.strict?"strict-gate":"review-collection",strict:options.strict,exitNonZeroWhen:options.strict?"review or failed":"failed only"},source:{totalScenarios:all.length,capturedScenarios:selected.length},summary,results}; await writeFile(join(options.output,"report.json"),JSON.stringify(report,null,2));await writeFile(join(options.output,"report.html"),html(results,options.output));console.log(`Report: ${join(options.output,"report.html")}`);if(summary.failed||(options.strict&&summary.review))process.exitCode=1;
}
