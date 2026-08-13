import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeCircuitApp } from "../src/app/NativeCircuitApp";
import { CircuitRunner, VoltageElm } from "../src/core";

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

  it("applies mode, shortcut, simulator, subcircuit and UI settings", () => {
    const scopedRunner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "r 0 0 32 0 0 10",
        "o 0 64 0 4099 20 0.05 2 2 0 3"
      ].join("\n")
    );
    expect(scopedRunner.scopePlots).toEqual([
      { elementIndex: 0, value: 0, panel: 2, scale: 20 },
      { elementIndex: 0, value: 3, panel: 2, scale: 0.05 }
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
      .querySelector<HTMLButtonElement>('[data-action="toggle-show-mode"]')
      ?.click();
    expect(
      root!.querySelector("#tool-mode-label")?.classList.contains("hidden")
    ).toBe(true);

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
      .querySelector<HTMLButtonElement>(
        '[data-action="modification-setup"]'
      )
      ?.click();
    root!.querySelector<HTMLSelectElement>("#mod-menu-size")!.value =
      "small";
    root!.querySelector<HTMLInputElement>("#mod-hide-buttons")!.checked =
      true;
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
});
