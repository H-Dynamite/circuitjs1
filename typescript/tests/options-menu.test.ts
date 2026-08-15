import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeCircuitApp } from "../src/app/NativeCircuitApp";
import {
  CircuitElm,
  CircuitRunner,
  CustomCompositeElm,
  TransistorElm,
  VoltageElm
} from "../src/core";

describe("options menu functionality", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  });

  it("exports text model definitions before their dependent elements", () => {
    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    const app = new NativeCircuitApp(root!);
    app.api.loadCircuit(readFileSync("src/examples/circuits/early.txt", "utf8"));

    const exported = app.api.exportCircuit();
    const modelIndex = exported.indexOf("\n32 early ");
    const firstTransistorIndex = exported.indexOf("\nt ");
    expect(modelIndex).toBeGreaterThan(0);
    expect(firstTransistorIndex).toBeGreaterThan(modelIndex);

    const reloadedRoot = document.createElement("div");
    document.body.append(reloadedRoot);
    const reloaded = new NativeCircuitApp(reloadedRoot);
    reloaded.api.loadCircuit(exported);
    const transistor = reloaded.api.getElements().find(
      (element): element is TransistorElm =>
        element instanceof TransistorElm && element.modelName === "early"
    );
    expect(transistor?.modelName).toBe("early");
    expect(transistor?.model?.invEarlyVoltF).toBeCloseTo(0.02);
  });

  it("keeps the legacy Options command path, circuit flags, and stored preferences", () => {
    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    const app = new NativeCircuitApp(root!);
    const actions = [...root!.querySelectorAll<HTMLButtonElement>(
      '.menu-bar > details > .option-menu > button'
    )].map((button) => button.dataset.action);
    expect(actions).toEqual([
      "toggle-current",
      "toggle-voltage",
      "toggle-power",
      "toggle-values",
      "toggle-small-grid",
      "toggle-toolbar",
      "toggle-crosshair",
      "toggle-euro-resistor",
      "toggle-iec-gates",
      "toggle-white-background",
      "toggle-current-convention",
      "toggle-disable-editing",
      "toggle-wheel-edit",
      "shortcuts",
      "other-options"
    ]);
    expect(actions).not.toContain("toggle-show-mode");
    expect(actions).not.toContain("modification-setup");
    expect(
      root!.querySelector('[data-action="subcircuits"]')
        ?.closest('details')?.dataset.menu
    ).toBe("tools");

    const action = (name: string) =>
      root!.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
    action("toggle-power").click();
    expect(action("toggle-power").getAttribute("aria-pressed")).toBe("true");
    expect(action("toggle-voltage").getAttribute("aria-pressed")).toBe("false");
    expect(app.api.exportCircuit()).toMatch(/^\$ 13 /);
    action("toggle-voltage").click();
    expect(action("toggle-voltage").getAttribute("aria-pressed")).toBe("true");
    expect(action("toggle-power").getAttribute("aria-pressed")).toBe("false");
    expect(app.api.exportCircuit()).toMatch(/^\$ 1 /);

    app.api.loadCircuit("$ 30 0.000005 10.2 50 5 43 5e-11");
    expect(action("toggle-current").getAttribute("aria-pressed")).toBe("false");
    expect(action("toggle-small-grid").getAttribute("aria-pressed")).toBe("true");
    expect(action("toggle-voltage").getAttribute("aria-pressed")).toBe("false");
    expect(action("toggle-power").getAttribute("aria-pressed")).toBe("true");
    expect(action("toggle-values").getAttribute("aria-pressed")).toBe("false");

    for (const name of [
      "toggle-iec-gates",
      "toggle-white-background",
      "toggle-current-convention",
      "toggle-wheel-edit"
    ]) {
      action(name).click();
    }
    const reloadedRoot = document.createElement("div");
    document.body.append(reloadedRoot);
    const reloaded = new NativeCircuitApp(reloadedRoot);
    expect(
      reloadedRoot
        .querySelector<HTMLButtonElement>('[data-action="toggle-iec-gates"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      reloadedRoot
        .querySelector<HTMLButtonElement>('[data-action="toggle-white-background"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      reloadedRoot
        .querySelector<HTMLButtonElement>('[data-action="toggle-current-convention"]')
        ?.getAttribute("aria-pressed")
    ).toBe("false");
    expect(
      reloadedRoot
        .querySelector<HTMLButtonElement>('[data-action="toggle-wheel-edit"]')
        ?.getAttribute("aria-pressed")
    ).toBe("false");
    // Keep the object alive so the test covers an actual app reload, not a
    // hand-written DOM state.
    expect(reloaded.api.getElements().length).toBeGreaterThan(0);
  });

  it("round-trips every legacy display flag and voltage range through text and XML", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new NativeCircuitApp(root);
    const flagsToCheck = [1, 2, 4, 8, 16, 128, 159];
    const action = (target: HTMLElement, name: string) =>
      target.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
    const expectFlags = (target: HTMLElement, flags: number) => {
      expect(action(target, "toggle-current").getAttribute("aria-pressed")).toBe(
        String((flags & 1) !== 0)
      );
      expect(action(target, "toggle-small-grid").getAttribute("aria-pressed")).toBe(
        String((flags & 2) !== 0)
      );
      expect(action(target, "toggle-voltage").getAttribute("aria-pressed")).toBe(
        String((flags & 4) === 0)
      );
      expect(action(target, "toggle-power").getAttribute("aria-pressed")).toBe(
        String((flags & 8) !== 0)
      );
      expect(action(target, "toggle-values").getAttribute("aria-pressed")).toBe(
        String((flags & 16) === 0)
      );
    };

    // Direct core coverage ensures CircuitRunner.fromText itself applies `$`
    // voltageRange before NativeCircuitApp has a chance to render anything.
    CircuitRunner.fromText("$ 1 0.000005 10.2 50 17.5 43 5e-11");
    expect(CircuitElm.voltageRange).toBe(17.5);

    for (const flags of flagsToCheck) {
      const text = `$ ${flags} 0.000005 10.2 50 17.5 43 5e-11`;
      app.api.loadCircuit(text);
      expectFlags(root, flags);
      expect(
        root.querySelector<HTMLInputElement>('[data-control="power-brightness"]')?.value
      ).toBe("43");
      const textExport = app.api.exportCircuit();
      // UIManager serializes the quantized speed-bar value, not the incoming
      // decimal.  10.2 maps to bar 117, then back to this legacy value.
      expect(textExport).toMatch(new RegExp(`^\\$ ${flags} 0\\.000005 10\\.20027730826997 50 17\\.5 43 5e-11$`));

      const textReloadRoot = document.createElement("div");
      document.body.append(textReloadRoot);
      const textReload = new NativeCircuitApp(textReloadRoot);
      textReload.api.loadCircuit(textExport);
      expectFlags(textReloadRoot, flags);
      expect(
        textReloadRoot.querySelector<HTMLInputElement>('[data-control="power-brightness"]')?.value
      ).toBe("43");
      expect(textReload.api.exportCircuit()).toBe(textExport);

      const xml = `<cir f="${flags}" ts="0.000005" mts="5e-11" vr="17.5" pb="41"/>`;
      app.api.loadCircuit(xml);
      expectFlags(root, flags);
      expect(
        root.querySelector<HTMLInputElement>('[data-control="power-brightness"]')?.value
      ).toBe("41");
      const xmlExport = app.api.exportCircuit();
      expect(xmlExport).toContain(`f="${flags}"`);
      expect(xmlExport).toContain('vr="17.5"');
      expect(xmlExport).toContain('pb="41"');

      const xmlReloadRoot = document.createElement("div");
      document.body.append(xmlReloadRoot);
      const xmlReload = new NativeCircuitApp(xmlReloadRoot);
      xmlReload.api.loadCircuit(xmlExport);
      expectFlags(xmlReloadRoot, flags);
      expect(
        xmlReloadRoot.querySelector<HTMLInputElement>('[data-control="power-brightness"]')?.value
      ).toBe("41");
      expect(xmlReload.api.exportCircuit()).toContain(`f="${flags}"`);
      expect(xmlReload.api.exportCircuit()).toContain('vr="17.5"');
      expect(xmlReload.api.exportCircuit()).toContain('pb="41"');
    }
  });

  it("applies mode, shortcut, simulator, subcircuit and UI settings", () => {
    const scopedRunner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "r 0 0 32 0 0 10",
        "o 0 64 0 4099 20 0.05 2 2 0 3"
      ].join("\n")
    );
    expect(scopedRunner.scopePlots).toEqual([
      { elementIndex: 0, value: 0, panel: 2, scale: 20, scopeId: 0 },
      { elementIndex: 0, value: 3, panel: 2, scale: 0.05, scopeId: 0 }
    ]);

    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    const app = new NativeCircuitApp(root!);
    const defaultSource = app.api
      .getElements()
      .find((element) => element instanceof VoltageElm);
    expect(defaultSource).toBeInstanceOf(VoltageElm);
    expect((defaultSource as VoltageElm).waveform).toBe(VoltageElm.WF_DC);

    root!
      .querySelector<HTMLButtonElement>('[data-action="shortcuts"]')
      ?.click();
    const wireShortcut = root!.querySelector<HTMLInputElement>(
      '[data-shortcut-tool="wire"]'
    );
    expect(wireShortcut).not.toBeNull();
    wireShortcut!.value = "q";
    wireShortcut!.dispatchEvent(new Event("input", { bubbles: true }));
    root!.querySelector<HTMLButtonElement>("#shortcut-apply")?.click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
    expect(
      root!
        .querySelector<HTMLButtonElement>('.tool-bar [data-tool="wire"]')
        ?.classList.contains("active")
    ).toBe(true);
    expect(JSON.parse(localStorage.getItem("circuitjs1-ts-shortcuts") ?? "{}"))
      .toMatchObject({ q: "wire" });

    root!
      .querySelector<HTMLButtonElement>('[data-action="other-options"]')
      ?.click();
    const timeStep = root!.querySelector<HTMLInputElement>(
      "#option-max-time-step"
    );
    expect(timeStep).not.toBeNull();
    timeStep!.value = "0.00001";
    root!.querySelector<HTMLButtonElement>("#options-apply")?.click();
    expect(app.api.exportCircuit()).toMatch(/^\$ 1 0\.00001 /);

    root!
      .querySelector<HTMLButtonElement>('[data-action="other-options"]')
      ?.click();
    root!
      .querySelector<HTMLButtonElement>("#open-modification-setup")
      ?.click();
    root!.querySelector<HTMLSelectElement>("#mod-menu-size")!.value =
      "small";
    root!.querySelector<HTMLInputElement>("#mod-hide-buttons")!.checked =
      true;
    root!.querySelector<HTMLInputElement>("#mod-show-mode")!.checked = false;
    root!
      .querySelector<HTMLButtonElement>("#modification-apply")
      ?.click();
    expect(
      root!.querySelector(".native-app")?.classList.contains("compact-menu")
    ).toBe(true);
    expect(
      root!
        .querySelector(".native-app")
        ?.classList.contains("hide-run-buttons")
    ).toBe(true);
    expect(
      root!.querySelector("#tool-mode-label")?.classList.contains("hidden")
    ).toBe(true);

    app.api.loadCircuit(
      '<cir ts="0.000005"><ccm nm="demo" f="0" sx="1" sy="1">' +
        '<ext nm="a" nd="0" ps="0" sd="0"/></ccm></cir>'
    );
    root!
      .querySelector<HTMLButtonElement>('[data-action="subcircuits"]')
      ?.click();
    expect(
      root!.querySelector<HTMLOptionElement>(
        '#subcircuit-list option[value="demo"]'
      )
    ).not.toBeNull();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    root!.querySelector<HTMLButtonElement>("#subcircuit-delete")?.click();
    expect(app.api.exportCircuit()).not.toContain('<ccm nm="demo"');
  });

  it("creates a file-menu subcircuit and makes the Dropbox gap explicit", () => {
    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    const app = new NativeCircuitApp(root!);
    app.api.loadCircuit(
      '<cir ts="0.000005">' +
        '<r x="0 0 64 0" f="0" r="100"/>' +
        '<ln x="0 0 0 -32" f="0" te="input"/>' +
        '<ln x="64 0 64 32" f="0" te="output"/>' +
      "</cir>"
    );

    root!
      .querySelector<HTMLButtonElement>('[data-action="create-subcircuit"]')
      ?.click();
    expect(
      root!.querySelector<HTMLDialogElement>("#subcircuit-create-dialog")
        ?.hasAttribute("open")
    ).toBe(true);
    root!.querySelector<HTMLInputElement>("#subcircuit-name")!.value = "divider";
    root!.querySelector<HTMLButtonElement>("#subcircuit-create")?.click();
    expect(app.api.exportCircuit()).toContain('<ccm nm="divider"');
    expect(app.api.exportCircuit()).toContain('<ext nm="input"');
    expect(app.api.exportCircuit()).toContain('<ext nm="output"');

    const exported = app.api.exportCircuit();
    const reloadedRoot = document.createElement("div");
    document.body.append(reloadedRoot);
    const reloaded = new NativeCircuitApp(reloadedRoot);
    reloaded.api.loadCircuit(
      exported.replace(
        "</cir>",
        '<cc x="128 0 160 0" f="0" mo="divider"/></cir>'
      )
    );
    expect(
      reloaded.api.getElements().some(
        (element) => element instanceof CustomCompositeElm
      )
    ).toBe(true);
    expect(() => reloaded.api.stepSimulation(1)).not.toThrow();

    root!
      .querySelector<HTMLButtonElement>('[data-action="import-dropbox"]')
      ?.click();
    expect(root!.querySelector("#dialog-title")?.textContent).toBe(
      "Dropbox 导入不可用"
    );
    expect(root!.querySelector<HTMLTextAreaElement>("#circuit-text")?.value)
      .toContain("不会把此菜单伪装成云端导入");
  });

  it("rejects invalid external subcircuit pins instead of silently changing them", () => {
    const create = (source: string, name: string) => {
      const root = document.createElement("div");
      document.body.append(root);
      const app = new NativeCircuitApp(root);
      app.api.loadCircuit(source);
      root
        .querySelector<HTMLButtonElement>('[data-action="create-subcircuit"]')
        ?.click();
      root.querySelector<HTMLInputElement>("#subcircuit-name")!.value = name;
      root.querySelector<HTMLButtonElement>("#subcircuit-create")?.click();
      return root.querySelector("#subcircuit-create-error")?.textContent;
    };
    const root = '<cir ts="0.000005">';
    const close = "</cir>";
    expect(
      create(
        root +
          '<r x="0 0 64 0" f="0" r="100"/>' +
          '<ln x="0 0 0 -32" f="0" te="one"/>' +
          '<ln x="0 0 32 0" f="0" te="two"/>' +
        close,
        "duplicate-node"
      )
    ).toContain("同一节点");
    expect(
      create(
        root +
          '<r x="0 0 64 0" f="0" r="100"/>' +
          '<g x="0 0 0 32" f="0"/>' +
          '<ln x="0 0 0 -32" f="0" te="grounded"/>' +
        close,
        "grounded-node"
      )
    ).toContain("不能连接到地");
    expect(
      create(
        root +
          '<r x="0 0 64 0" f="0" r="100"/>' +
          '<ln x="128 0 128 -32" f="0" te="unused"/>' +
        close,
        "unused-node"
      )
    ).toContain("未连接");
  });

  it("keeps scope and plot ownership when arranging, combining, and separating scopes", async () => {
    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    const app = new NativeCircuitApp(root!);
    app.api.loadCircuit("$ 1 0.000005 10.2 50 5 43 5e-11");
    const scopeActions = [
      "scope-stack",
      "scope-unstack",
      "scope-combine",
      "scope-separate"
    ] as const;
    for (const action of scopeActions) {
      expect(
        root!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
          ?.disabled
      ).toBe(true);
    }

    app.api.loadCircuit(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "r 0 0 32 0 0 10",
        "r 64 0 96 0 0 20",
        "o 0 64 0 0 20 0 0",
        "o 1 64 3 0 0.05 1 1"
      ].join("\n")
    );
    // ScopePopupMenu enables Stack/Unstack from the final scope position,
    // rather than treating every pair of scopes as both actions being ready.
    expect(
      root!.querySelector<HTMLButtonElement>('[data-action="scope-stack"]')
        ?.disabled
    ).toBe(false);
    expect(
      root!.querySelector<HTMLButtonElement>('[data-action="scope-unstack"]')
        ?.disabled
    ).toBe(true);
    expect(
      root!.querySelector<HTMLButtonElement>('[data-action="scope-combine"]')
        ?.disabled
    ).toBe(false);
    expect(
      root!.querySelector<HTMLButtonElement>('[data-action="scope-separate"]')
        ?.disabled
    ).toBe(false);

    const scopePanels = () =>
      app.api.getDynamicSnapshot().scopes.map((scope) => scope.panel);
    const scopeIds = () =>
      app.api.getDynamicSnapshot().scopes.map((scope) => scope.scopeId);
    expect(scopePanels()).toEqual([0, 1]);
    expect(scopeIds()).toEqual([0, 1]);
    expect(app.api.getDynamicSnapshot().scopeCount).toBe(2);

    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-stack"]')
      ?.click();
    expect(scopePanels()).toEqual([0, 0]);
    expect(
      root!
        .querySelector<HTMLButtonElement>('[data-action="scope-stack"]')
        ?.disabled
    ).toBe(true);
    expect(
      root!
        .querySelector<HTMLButtonElement>('[data-action="scope-unstack"]')
        ?.disabled
    ).toBe(false);

    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-unstack"]')
      ?.click();
    expect(scopePanels()).toEqual([0, 1]);

    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-combine"]')
      ?.click();
    expect(app.api.getDynamicSnapshot().scopeCount).toBe(1);
    expect(scopeIds()).toEqual([0, 0]);
    expect(app.api.getDynamicSnapshot().scopes.map((scope) => scope.plotCount)).toEqual([2, 2]);

    expect(
      root!
        .querySelector<HTMLButtonElement>('[data-action="scope-unstack"]')
        ?.disabled
    ).toBe(true);
    expect(scopePanels()).toEqual([0, 0]);
    expect(app.api.getDynamicSnapshot().scopeCount).toBe(1);
    expect(
      root!
        .querySelector<HTMLButtonElement>('[data-action="scope-separate"]')
        ?.disabled
    ).toBe(false);

    app.api.stepSimulation(1);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectUrl = vi.fn(() => "blob:scope-export");
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: vi.fn()
    });
    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-export-csv"]')
      ?.click();
    const csvBlob = createObjectUrl.mock.calls[0]?.[0];
    expect(csvBlob).toBeInstanceOf(Blob);
    expect((csvBlob as Blob).type).toContain("text/csv");
    expect((csvBlob as Blob).size).toBeGreaterThan(20);
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(csvBlob as Blob);
    });
    expect(csv.split("\n")[0]).toContain("Resistor");
    expect(csv.split("\n")[0].split(",")).toHaveLength(3);

    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-separate"]')
      ?.click();
    expect(app.api.getDynamicSnapshot().scopeCount).toBe(2);
    expect(scopeIds()).toEqual([0, 1]);
    expect(scopePanels()).toEqual([0, 1]);

    const reloadedRoot = document.createElement("div");
    document.body.append(reloadedRoot);
    const reloaded = new NativeCircuitApp(reloadedRoot);
    reloaded.api.loadCircuit(app.api.exportCircuit());
    expect(reloaded.api.getDynamicSnapshot().scopeCount).toBe(2);
    expect(reloaded.api.getDynamicSnapshot().scopes.map((scope) => scope.panel)).toEqual([0, 1]);
  });

  it("does not reserve a bottom scope panel until the circuit owns a scope", () => {
    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    const app = new NativeCircuitApp(root!);
    app.api.loadCircuit("$ 1 0.000005 10.2 50 5 43 5e-11");
    const scopeCanvas = root!.querySelector<HTMLCanvasElement>("#scope-canvas");
    const canvasColumn = root!.querySelector<HTMLElement>(".canvas-column");
    expect(scopeCanvas?.hidden).toBe(true);
    expect(scopeCanvas?.getAttribute("aria-hidden")).toBe("true");
    expect(canvasColumn?.classList.contains("has-scopes")).toBe(false);

    app.api.loadCircuit(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "r 0 0 32 0 0 10",
        "o 0 64 0 0 20 0 0"
      ].join("\n")
    );
    expect(scopeCanvas?.hidden).toBe(false);
    expect(scopeCanvas?.getAttribute("aria-hidden")).toBe("false");
    expect(canvasColumn?.classList.contains("has-scopes")).toBe(true);

    app.api.loadCircuit("$ 1 0.000005 10.2 50 5 43 5e-11");
    expect(app.api.getDynamicSnapshot().scopeCount).toBe(0);
    expect(scopeCanvas?.hidden).toBe(true);
    expect(canvasColumn?.classList.contains("has-scopes")).toBe(false);
  });

  it("restores the scope layout when the user chooses to view a selected element in the scope", () => {
    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    const app = new NativeCircuitApp(root!);
    app.api.loadCircuit(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "r 0 0 32 0 0 10"
      ].join("\n")
    );
    const state = app as unknown as {
      selectedIndex: number | null;
      selectedIndices: Set<number>;
    };
    state.selectedIndex = 0;
    state.selectedIndices.add(0);
    const scopeCanvas = root!.querySelector<HTMLCanvasElement>("#scope-canvas");
    const canvasColumn = root!.querySelector<HTMLElement>(".canvas-column");
    expect(scopeCanvas?.hidden).toBe(true);
    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-selected"]')
      ?.click();
    expect(app.api.getDynamicSnapshot().scopeCount).toBe(1);
    expect(scopeCanvas?.hidden).toBe(false);
    expect(canvasColumn?.classList.contains("has-scopes")).toBe(true);
  });

  it("keeps the narrow layout single-row until a scope is present", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.canvas-column \{\s*grid-template-rows: minmax\(200px, min\(665px, 100%\)\);/u
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.canvas-column\.has-scopes \{\s*grid-template-rows: minmax\(200px, 1fr\) 130px;/u
    );
  });

  it("synchronizes Edit availability with history, selection, flip capability, and Disable Editing", () => {
    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    const app = new NativeCircuitApp(root!);
    const action = (name: string) =>
      root!.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;

    for (const name of ["undo", "redo", "paste", "cut", "copy"]) {
      expect(action(name).disabled).toBe(true);
    }
    action("select-all").click();
    expect(action("cut").disabled).toBe(false);
    expect(action("copy").disabled).toBe(false);
    action("copy").click();
    expect(action("paste").disabled).toBe(false);

    app.api.loadCircuit(readFileSync("src/examples/circuits/3motor.txt", "utf8"));
    // With no explicit selection the legacy MouseManager checks every element.
    expect(action("flip-x").disabled).toBe(true);
    expect(action("flip-y").disabled).toBe(true);
    expect(action("flip-xy").disabled).toBe(true);

    action("toggle-disable-editing").click();
    expect(
      root!.querySelector('.menu-bar > details[data-menu="edit"] > summary')
        ?.getAttribute("aria-disabled")
    ).toBeNull();
    expect(
      root!.querySelector('.menu-bar > details[data-menu="draw"] > summary')
        ?.getAttribute("aria-disabled")
    ).toBeNull();
    expect(action("select-all").disabled).toBe(false);
    action("select-all").click();
    expect(root!.querySelector("#native-status")).toBeNull();
    expect(
      (app as unknown as { errorMessage: string | null }).errorMessage
    ).toContain("Editing disabled");
    action("toggle-disable-editing").click();
    expect(
      (app as unknown as { errorMessage: string | null }).errorMessage
    ).toBeNull();
  });

  it("keeps a voltage/current pair together when separating a combined scope", () => {
    const root = document.querySelector<HTMLElement>("#app");
    const app = new NativeCircuitApp(root!);
    app.api.loadCircuit(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "r 0 0 32 0 0 10",
        "r 64 0 96 0 0 20",
        "o 0 64 0 4096 20 0.05 0 2 0 3",
        "o 1 64 0 0 20 0 1"
      ].join("\n")
    );
    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-combine"]')
      ?.click();
    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-separate"]')
      ?.click();
    const snapshot = app.api.getDynamicSnapshot();
    expect(snapshot.scopeCount).toBe(2);
    expect(snapshot.scopes.map((scope) => scope.plotCount)).toEqual([2, 2, 1]);
    expect(snapshot.scopes.map((scope) => scope.panel)).toEqual([0, 0, 1]);
  });

  it("writes ScopeGroup changes to XML export and restores them on reload", () => {
    const root = document.querySelector<HTMLElement>("#app");
    const app = new NativeCircuitApp(root!);
    app.api.loadCircuit(
      '<cir ts="0.000005"><r x="0 0 32 0" f="0" r="10"/>' +
        '<r x="64 0 96 0" f="0" r="20"/>' +
        '<o en="0" p="0"><p v="0" sc="20"/></o>' +
        '<o en="1" p="1"><p v="3" sc="0.05"/></o></cir>'
    );
    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-combine"]')
      ?.click();
    const exported = app.api.exportCircuit();
    expect((exported.match(/<o\b/g) ?? [])).toHaveLength(1);
    expect((exported.match(/<p\b/g) ?? [])).toHaveLength(2);

    const reloadedRoot = document.createElement("div");
    document.body.append(reloadedRoot);
    const reloaded = new NativeCircuitApp(reloadedRoot);
    reloaded.api.loadCircuit(exported);
    const snapshot = reloaded.api.getDynamicSnapshot();
    expect(snapshot.scopeCount).toBe(1);
    expect(snapshot.scopes.map((scope) => scope.plotCount)).toEqual([2, 2]);
    expect(snapshot.scopes.map((scope) => scope.panel)).toEqual([0, 0]);

    root!
      .querySelector<HTMLButtonElement>('[data-action="scope-separate"]')
      ?.click();
    root!
      .querySelector<HTMLButtonElement>('[data-action="undo"]')
      ?.click();
    expect(app.api.getDynamicSnapshot().scopeCount).toBe(1);
  });
});
