import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = process.cwd(), DEFAULT_OUTPUT = resolve(ROOT, "visual-regression", "artifacts");
const CIRCUITS = resolve(ROOT, "src", "examples", "circuits"), VIEWPORT = { width: 1280, height: 900 };
const REVIEW_DIFF_PIXEL_RATIO = 0.01, REVIEW_MAE = 0.002;
const MENU_STRIP_GATE_ID = "3-cgand.txt", MENU_STRIP_MAE = 0.03;
const MENU_CAPTURE_TIMEOUT_MS = 60_000;
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
  const result = { output: DEFAULT_OUTPUT, limit: undefined, only: undefined, keepOutput: false, diff: true, headed: false, strict: false, menuStripGate: false };
  for (const arg of args) {
    if (arg === "--help") { console.log("Options: --limit=N --only=id[,id] --output=PATH --headed --no-diff --keep-output --menu-strip-gate"); process.exit(0); }
    if (arg === "--keep-output") result.keepOutput = true;
    else if (arg === "--strict") result.strict = true;
    else if (arg === "--no-diff") result.diff = false;
    else if (arg === "--headed") result.headed = true;
    else if (arg === "--menu-strip-gate") result.menuStripGate = true;
    else if (arg.startsWith("--output=")) result.output = resolve(ROOT, arg.slice(9));
    else if (arg.startsWith("--limit=")) { result.limit = Number(arg.slice(8)); if (!Number.isInteger(result.limit) || result.limit < 1) throw new Error("--limit must be a positive integer"); }
    else if (arg.startsWith("--only=")) { result.only = new Set(arg.slice(7).split(",").filter(Boolean)); if (result.only.size === 0) throw new Error("--only must name at least one fixture"); }
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
async function deadline(label, milliseconds, task) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
function sameGeometry(left, right, tolerance = 1) {
  return Math.abs(left - right) <= tolerance;
}
function visualLayoutStatus(layout) {
  const values = [layout?.canvas?.width, layout?.canvas?.height, layout?.canvas?.cssWidth, layout?.canvas?.cssHeight, layout?.workspaceOrigin?.x, layout?.workspaceOrigin?.y, layout?.sidebarX, layout?.scopeY];
  return values.every(Number.isFinite) && layout.toolbarVisible === true;
}
function comparableLayout(legacy, ts) {
  const checks = {
    toolbarVisible: legacy.toolbarVisible === ts.toolbarVisible,
    canvasWidth: sameGeometry(legacy.canvas.width, ts.canvas.width),
    canvasHeight: sameGeometry(legacy.canvas.height, ts.canvas.height),
    cssWidth: sameGeometry(legacy.canvas.cssWidth, ts.canvas.cssWidth),
    cssHeight: sameGeometry(legacy.canvas.cssHeight, ts.canvas.cssHeight),
    workspaceOriginX: sameGeometry(legacy.workspaceOrigin.x, ts.workspaceOrigin.x),
    // The two real products currently keep a 3px menu/tool-strip offset.
    // Normalize its *coordinate frame* in the report/crops; do not move or
    // hide either UI merely to make screenshots look alike.
    workspaceOriginY: Number.isFinite(legacy.workspaceOrigin.y) && Number.isFinite(ts.workspaceOrigin.y),
    sidebarX: sameGeometry(legacy.sidebarX, ts.sidebarX),
    scopeY: sameGeometry(legacy.scopeY - legacy.workspaceOrigin.y, ts.scopeY - ts.workspaceOrigin.y)
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}
function visualRegions(layout) {
  const width = VIEWPORT.width, height = VIEWPORT.height;
  const workspaceX = Math.max(0, Math.round(layout.workspaceOrigin.x)), workspaceY = Math.max(0, Math.round(layout.workspaceOrigin.y));
  const sidebarX = Math.min(width, Math.max(workspaceX, Math.round(layout.sidebarX))), scopeY = Math.min(height, Math.max(workspaceY, Math.round(layout.scopeY)));
  return {
    top: { x: 0, y: 0, width, height: workspaceY },
    workspace: { x: workspaceX, y: workspaceY, width: sidebarX - workspaceX, height: scopeY - workspaceY },
    right: { x: sidebarX, y: workspaceY, width: width - sidebarX, height: height - workspaceY },
    bottom: { x: workspaceX, y: scopeY, width: sidebarX - workspaceX, height: height - scopeY }
  };
}
function normalizedVisualRegions(legacy, ts) {
  const workspaceY = Math.max(legacy.workspaceOrigin.y, ts.workspaceOrigin.y);
  const sidebarX = Math.min(legacy.sidebarX, ts.sidebarX);
  const width = VIEWPORT.width, height = VIEWPORT.height;
  // Keep the menu-strip comparison out of the right-side controls.  The
  // canvas is the stable common width of the two applications (1106px in the
  // normalized desktop baseline), while the full viewport includes product-
  // specific sidebar content that is intentionally reviewed elsewhere.
  const menuStripWidth = Math.min(width, Math.max(0, Math.round(Math.min(
    legacy.canvas.cssWidth,
    ts.canvas.cssWidth
  ))));
  const scopeY = workspaceY + Math.min(
    legacy.scopeY - legacy.workspaceOrigin.y,
    ts.scopeY - ts.workspaceOrigin.y
  );
  return {
    menuStrip: { x: 0, y: 0, width: menuStripWidth, height: Math.min(30, height) },
    top: { x: 0, y: 0, width, height: workspaceY },
    workspace: { x: 0, y: workspaceY, width: sidebarX, height: scopeY - workspaceY },
    right: { x: sidebarX, y: workspaceY, width: width - sidebarX, height: height - workspaceY },
    bottom: { x: 0, y: scopeY, width: sidebarX, height: height - scopeY }
  };
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
    if (typeof window.CircuitJS1?.setVisualRegressionLayout !== "function") throw new Error("Legacy visual layout bridge missing; rebuild the GWT baseline");
    // 1280px viewport - 174px TS sidebar = 1106px. The GWT layout API does
    // the real backing-store resize; do not alter canvas CSS from the test.
    window.CircuitJS1.setVisualRegressionLayout(174, 665, true);
  });
  await stableCanvas(page);
  const layout = await page.evaluate(() => window.CircuitJS1.getVisualRegressionLayout?.());
  if (!visualLayoutStatus(layout)) throw new Error(`Invalid legacy visual layout: ${JSON.stringify(layout)}`);
  return { requestedPath: expectedPath, sourceSha256: sha(actual), paused: true, canvas: layout.canvas, visualLayout: layout };
}
function textElementsIn(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const type = line.trim().split(/\s+/, 1)[0] ?? "";
      return !["", "$", "o", "h", "!", ".", '"', "&", "%", "?", "B"].includes(type);
    }).length;
}
async function expectedElementsIn(page, source) {
  if (!source.trimStart().startsWith("<")) return textElementsIn(source);
  return page.evaluate((input) => {
    const document = new DOMParser().parseFromString(input, "application/xml");
    if (document.querySelector("parsererror") !== null) {
      throw new Error("Invalid XML fixture");
    }
    // CircuitRunner creates one top-level element for every direct <cir>
    // child with an x position. Nested <ccm> model definitions, <o>/<p>
    // scope data and text contents are state, not runner elements.
    return [...document.documentElement.children].filter((element) =>
      element.hasAttribute("x")
    ).length;
  }, source);
}
async function tsLoad(page, baseUrl, source) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => typeof window.CircuitJS1TS?.loadCircuit === "function", undefined, { timeout: 20_000 });
  await page.evaluate((input) => window.CircuitJS1TS.loadCircuit(input), source);
  const state = await page.evaluate(() => { window.CircuitJS1TS.setRunning(false); const exported = window.CircuitJS1TS.exportCircuit(); return { elementCount: window.CircuitJS1TS.getElements().length, exportedLength: exported.length, exportedPrefix: exported.slice(0, 160), exportedCircuit: exported }; });
  const expectedElementCount = await expectedElementsIn(page, source); if (state.elementCount !== expectedElementCount) throw new Error(`TS element count mismatch: expected ${expectedElementCount}, got ${state.elementCount}`);
  await stableCanvas(page);
  const { exportedCircuit, ...summary } = state;
  const canvas = await page.locator("canvas").evaluateAll((items) => {
    const item = items.filter((candidate) => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0)
      .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    if (!(item instanceof HTMLCanvasElement)) throw new Error("No visible TypeScript canvas");
    const box = item.getBoundingClientRect(); return { width: item.width, height: item.height, cssWidth: box.width, cssHeight: box.height };
  });
  const visualLayout = await page.evaluate(() => window.CircuitJS1TS.getVisualRegressionLayout?.());
  if (!visualLayoutStatus(visualLayout)) throw new Error(`Invalid TypeScript visual layout: ${JSON.stringify(visualLayout)}`);
  return { inputSha256: sha(source), expectedElementCount, ...summary, exportedSha256: sha(exportedCircuit), paused: true, canvas, visualLayout };
}
async function verifyMenu(page, app, entry, index) {
  const [id, legacyText, tsText, key] = entry;
  if (app === "ts") {
    const summaries = page.locator(".menu-bar > details > summary"), texts = (await summaries.allTextContents()).map((text) => text.trim());
    if (texts.length !== MENUS.length || texts[index] !== tsText) throw new Error(`TS menu order/text mismatch: ${JSON.stringify(texts)}`);
    // A prior native <details> toggle can remain open while the application
    // initializes. Close it before exercising the requested menu so a popup
    // does not cover its own summary and turn the run into a silent retry.
    await page.locator(".menu-bar > details[open]").evaluateAll((items) => items.forEach((item) => { item.open = false; }));
    // The app can initially render the first popup over its summary. Invoke
    // the native summary click after proving the element exists; Playwright's
    // pointer action rightly refuses an obscured target and otherwise spends
    // 30 seconds retrying. This exercises the same browser toggle event.
    await summaries.nth(index).evaluate((summary) => summary.click()); const menu = page.locator(".menu-bar > details").nth(index);
    if (await menu.getAttribute("open") === null) throw new Error(`TS ${id} menu did not open`);
    const item = key === "tool" ? menu.locator("[data-tool]").first() : menu.locator(`[data-action="${key}"]`);
    await item.waitFor({ state: "visible", timeout: 10_000 }); return { labels: texts, keyItem: (await item.textContent())?.trim() ?? "" };
  }
  const menus = page.locator(".gwt-MenuBar-horizontal .gwt-MenuItem"), texts = (await menus.allTextContents()).map((text) => text.trim());
  if (texts.length < MENUS.length || texts[index] !== legacyText) throw new Error(`Legacy menu order/text mismatch: ${JSON.stringify(texts)}`);
  await menus.nth(index).click(); const popup = page.locator(".gwt-MenuBarPopup:visible, .gwt-PopupPanel:visible").filter({ has: page.locator(".gwt-MenuItem") }).last();
  await popup.waitFor({ state: "visible", timeout: 10_000 }); const keyItem = (await popup.locator(".gwt-MenuItem").first().textContent())?.trim() ?? "";
  if (!keyItem) throw new Error(`Legacy ${id} menu has no visible key item`); return { labels: texts, keyItem };
}
async function diff(context, legacyPath, tsPath, outputPath, crop = undefined, offsets = undefined) {
  const [legacy, ts] = await Promise.all([readFile(legacyPath), readFile(tsPath)]), page = await context.newPage({ viewport: VIEWPORT });
  await page.setContent(`<!doctype html><canvas></canvas><script type="module">const a=new Image(),b=new Image(),crop=${JSON.stringify(crop)},offsets=${JSON.stringify(offsets)};a.src=${JSON.stringify(`data:image/png;base64,${legacy.toString("base64")}`)};b.src=${JSON.stringify(`data:image/png;base64,${ts.toString("base64")}`)};await Promise.all([a.decode(),b.decode()]);const c=document.querySelector('canvas'),x=c.getContext('2d',{willReadFrequently:true}),left=crop?.x??0,top=crop?.y??0,width=crop?.width??Math.max(a.width,b.width),height=crop?.height??Math.max(a.height,b.height),legacyY=top+(offsets?.legacyY??0),tsY=top+(offsets?.tsY??0);c.width=width;c.height=height;x.drawImage(a,left,legacyY,width,height,0,0,width,height);const l=x.getImageData(0,0,c.width,c.height);x.clearRect(0,0,c.width,c.height);x.drawImage(b,left,tsY,width,height,0,0,width,height);const r=x.getImageData(0,0,c.width,c.height),o=x.createImageData(c.width,c.height);let changed=0,sum=0;for(let i=0;i<o.data.length;i+=4){let any=false;for(let j=0;j<3;j++){const d=Math.abs(l.data[i+j]-r.data[i+j]);o.data[i+j]=d;sum+=d;any||=d!==0}o.data[i+3]=255;changed+=Number(any)}x.putImageData(o,0,0);document.body.dataset.metrics=JSON.stringify({pixelCount:c.width*c.height,changedPixels:changed,diffPixelRatio:changed/(c.width*c.height),mae:sum/(c.width*c.height*3*255),crop,offsets})</script>`);
  await page.waitForFunction(() => Boolean(document.body.dataset.metrics)); const metrics = await page.evaluate(() => JSON.parse(document.body.dataset.metrics)); await shot(page, outputPath); await page.close(); return metrics;
}
async function previous(output, id, files) {
  try { const value = JSON.parse(await readFile(join(output, "metadata", `${nameFor(id)}.json`), "utf8")); await Promise.all(Object.values(files).map(readFile)); return value.captureStatus === "passed" ? value : undefined; } catch { return undefined; }
}
function addMonitorFailures(result, monitors) { const failures = monitors.flatMap((item) => item.take()); if (failures.length) { result.status = "failed"; result.captureStatus = "failed"; result.error = [result.error, ...failures].filter(Boolean).join("\n"); } }
function applyMenuStripGate(result, enabled) {
  if (!enabled || result.id !== MENU_STRIP_GATE_ID) return;
  const metric = result.regionMetrics?.menuStrip;
  if (!result.baseline?.valid || metric === undefined) {
    result.status = "failed";
    result.error = [result.error, `Menu-strip gate requires a comparable ${MENU_STRIP_GATE_ID} baseline and metric.`].filter(Boolean).join("\n");
  } else if (metric.mae > MENU_STRIP_MAE) {
    result.status = "failed";
    result.error = [result.error, `Menu-strip MAE ${metric.mae} exceeds ${MENU_STRIP_MAE}.`].filter(Boolean).join("\n");
  }
}
async function diffRegions(context, files, legacyLayout, tsLayout) {
  const regions = normalizedVisualRegions(legacyLayout, tsLayout), metrics = {};
  // `crop.y` is expressed in the legacy page's physical coordinates.  Move
  // the TypeScript source upward by the known chrome-origin delta so both
  // crops start at their actual workspace/scope edge.
  const offsets = { legacyY: 0, tsY: tsLayout.workspaceOrigin.y - legacyLayout.workspaceOrigin.y };
  for (const [name, crop] of Object.entries(regions)) {
    const path = files.diff.replace(/\.png$/, `-${name}.png`);
    const regionOffsets = name === "top" || name === "menuStrip" ? undefined : offsets;
    metrics[name] = { crop, file: path, ...(await diff(context, files.legacy, files.ts, path, crop, regionOffsets)) };
  }
  return metrics;
}
function html(results, output) { const image = (result, kind) => result.files?.[kind] ? `<a href="${relative(output,result.files[kind]).split(sep).join("/")}"><img src="${relative(output,result.files[kind]).split(sep).join("/")}"></a>` : "-"; const regions=(result)=>result.regionMetrics?Object.entries(result.regionMetrics).map(([name,value])=>`${name}: ${(value.diffPixelRatio*100).toFixed(2)}% / ${(value.mae*100).toFixed(3)}%`).join("<br>"):"-"; return `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px;vertical-align:top}img{width:200px}</style><p>Review when changed pixels > ${REVIEW_DIFF_PIXEL_RATIO * 100}% or MAE > ${REVIEW_MAE * 100}%. Full-page metrics are diagnostic; region metrics localize menu chrome, workspace, and sidebar differences.</p><table><tr><th>Scenario</th><th>Status</th><th>Baseline</th><th>Full diff</th><th>Menu strip / top / workspace / right / bottom</th><th>Legacy</th><th>TS</th><th>Diff</th><th>Error</th></tr>${results.map((r)=>`<tr><td>${r.id}</td><td>${r.status}</td><td>${r.baseline?.valid===false?"invalid-baseline":r.baseline?.valid===true?"comparable":"-"}</td><td>${r.metrics ? `${(r.metrics.diffPixelRatio*100).toFixed(2)}% / ${(r.metrics.mae*100).toFixed(3)}%` : "-"}</td><td>${regions(r)}</td><td>${image(r,"legacy")}</td><td>${image(r,"ts")}</td><td>${image(r,"diff")}</td><td>${r.error??""}</td></tr>`).join("")}</table>`; }

export async function run() {
  try {
    await access(resolve(ROOT, "public", "legacy", "circuitjs.html"));
  } catch {
    throw new Error("Visual regression requires an external legacy baseline at public/legacy/circuitjs.html. Run it from the migration checkout, not the standalone TypeScript release.");
  }
  const options = optionsFrom(process.argv.slice(2)); await prepare(options.output, options.keepOutput);
  const all = await findCircuits(CIRCUITS), candidates = options.only ? all.filter((file) => options.only.has(relative(CIRCUITS, file).split(sep).join("/"))) : all, selected = (options.limit ? candidates.slice(0, options.limit) : candidates).map((file) => ({ file, id: relative(CIRCUITS, file).split(sep).join("/") }));
  if (!selected.length) throw new Error("No circuit fixtures found");
  if (options.menuStripGate && (selected.length !== 1 || selected[0].id !== MENU_STRIP_GATE_ID)) throw new Error(`--menu-strip-gate requires --only=${MENU_STRIP_GATE_ID}`);
  console.log(`Capturing ${selected.length}/${all.length} static circuit scenarios.`);
  const server = await createServer({ root: ROOT, logLevel: "error", plugins: [legacyPlugin()], server: { host: "127.0.0.1", port: 0 } }); await server.listen(); const address = server.httpServer.address(); if (!address || typeof address === "string") throw new Error("Vite did not expose a TCP address"); const baseUrl = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ headless: !options.headed }), context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, serviceWorkers: "block" }), legacyPage = await context.newPage(), tsPage = await context.newPage(), legacyWatch = watch(legacyPage,"legacy"), tsWatch = watch(tsPage,"ts"); const results=[];
  try {
    const first = selected[0], firstSource = await readFile(first.file,"utf8");
    for (const [index, entry] of MENUS.entries()) {
      const id=`__menu__${entry[0]}`, files=filesFor(options.output,`menu-${entry[0]}`), old=options.keepOutput && await previous(options.output,id,files);
      if(old){results.push(old);continue}
      // Menus, especially the legacy cascading circuit picker, keep popup DOM
      // state. Isolate every capture so a hidden popup cannot poison a later
      // selector or prevent the report from being written.
      const menuLegacyPage = await context.newPage(), menuTsPage = await context.newPage();
      const menuLegacyWatch = watch(menuLegacyPage,"legacy menu"), menuTsWatch = watch(menuTsPage,"ts menu");
      const result={id,status:"passed",captureStatus:"passed",files,error:undefined,menu:{}};
      try {
        await deadline(`Menu ${entry[0]} capture`, MENU_CAPTURE_TIMEOUT_MS, async () => {
          result.source={legacy:await legacyLoad(menuLegacyPage,baseUrl,first.id,firstSource)};
          result.menu.legacy=await verifyMenu(menuLegacyPage,"legacy",entry,index);
          await shot(menuLegacyPage,files.legacy);
          result.source.ts=await tsLoad(menuTsPage,baseUrl,firstSource);
          result.menu.ts=await verifyMenu(menuTsPage,"ts",entry,index);
          await shot(menuTsPage,files.ts);
          result.baseline=comparableLayout(result.source.legacy.visualLayout,result.source.ts.visualLayout);
          if(!result.baseline.valid){result.status="invalid-baseline"}
          else if(options.diff){result.metrics=await diff(context,files.legacy,files.ts,files.diff);result.regionMetrics=await diffRegions(context,files,result.source.legacy.visualLayout,result.source.ts.visualLayout);if(result.metrics.diffPixelRatio>REVIEW_DIFF_PIXEL_RATIO||result.metrics.mae>REVIEW_MAE)result.status="review"}
        });
      } catch(error) { result.status="failed";result.captureStatus="failed";result.error=errorText(error) }
      finally { addMonitorFailures(result,[menuLegacyWatch,menuTsWatch]); await menuLegacyPage.close().catch(() => {}); await menuTsPage.close().catch(() => {}); }
      await writeFile(join(options.output,"metadata",`${nameFor(id)}.json`),JSON.stringify(result,null,2));results.push(result);console.log(`[${result.status}] menu ${entry[0]}`);
    }
    for(const scenario of selected){const files=filesFor(options.output,nameFor(scenario.id)),old=options.keepOutput&&await previous(options.output,scenario.id,files);if(old){applyMenuStripGate(old,options.menuStripGate);results.push(old);console.log(`[resumed] ${scenario.id}`);continue}const source=await readFile(scenario.file,"utf8"),result={id:scenario.id,status:"passed",captureStatus:"passed",files,error:undefined,source:{inputSha256:sha(source)}};legacyWatch.reset();tsWatch.reset();try{result.source.legacy=await legacyLoad(legacyPage,baseUrl,scenario.id,source);await shot(legacyPage,files.legacy);result.source.ts=await tsLoad(tsPage,baseUrl,source);await shot(tsPage,files.ts);result.baseline=comparableLayout(result.source.legacy.visualLayout,result.source.ts.visualLayout);if(!result.baseline.valid){result.status="invalid-baseline"}else if(options.diff){result.metrics=await diff(context,files.legacy,files.ts,files.diff);result.regionMetrics=await diffRegions(context,files,result.source.legacy.visualLayout,result.source.ts.visualLayout);if(result.metrics.diffPixelRatio>REVIEW_DIFF_PIXEL_RATIO||result.metrics.mae>REVIEW_MAE)result.status="review"}}catch(error){result.status="failed";result.captureStatus="failed";result.error=errorText(error)}addMonitorFailures(result,[legacyWatch,tsWatch]);applyMenuStripGate(result,options.menuStripGate);await writeFile(join(options.output,"metadata",`${nameFor(scenario.id)}.json`),JSON.stringify(result,null,2));results.push(result);console.log(`[${result.status}] ${scenario.id}`)}
  } finally { await context.close();await browser.close();await server.close(); }
  const summary={passed:results.filter((r)=>r.status==="passed").length,review:results.filter((r)=>r.status==="review").length,invalidBaseline:results.filter((r)=>r.status==="invalid-baseline").length,failed:results.filter((r)=>r.status==="failed").length}; const report={generatedAt:new Date().toISOString(),viewport:VIEWPORT,thresholds:{REVIEW_DIFF_PIXEL_RATIO,REVIEW_MAE,MENU_STRIP_MAE:options.menuStripGate?MENU_STRIP_MAE:undefined},execution:{mode:options.menuStripGate?"menu-strip-gate":options.strict?"strict-gate":"review-collection",strict:options.strict,menuStripGate:options.menuStripGate,exitNonZeroWhen:options.strict?"review, invalid-baseline, or failed":"invalid-baseline or failed"},source:{totalScenarios:all.length,capturedScenarios:selected.length},summary,results}; await writeFile(join(options.output,"report.json"),JSON.stringify(report,null,2));await writeFile(join(options.output,"report.html"),html(results,options.output));console.log(`Report: ${join(options.output,"report.html")}`);if(summary.failed||summary.invalidBaseline||(options.strict&&summary.review))process.exitCode=1;
}
