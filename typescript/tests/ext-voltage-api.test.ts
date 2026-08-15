import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeCircuitApp } from "../src/app/NativeCircuitApp";
import { ExtVoltageElm } from "../src/core";

const SHARED_EXT_VOLTAGE_CIRCUIT =
  '<cir ts="0.000005"><ExtVoltage x="0 0 0 64" f="0" nm="shared"/>' +
  '<ExtVoltage x="128 0 128 64" f="0" nm="shared"/></cir>';

describe("External Voltage JavaScript API", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  });

  it("keeps ExtVoltageElm's legacy NaN-only value guard", () => {
    const source = new ExtVoltageElm(0, 0);
    source.setVoltage(3.5);
    source.setVoltage(Number.NaN);
    expect(source.getVoltage()).toBe(3.5);

    source.setVoltage(Number.POSITIVE_INFINITY);
    expect(source.getVoltage()).toBe(Number.POSITIVE_INFINITY);
  });

  it("updates all same-named external sources, steps them, and preserves their XML structure", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new NativeCircuitApp(root);
    app.api.loadCircuit(SHARED_EXT_VOLTAGE_CIRCUIT);
    app.api.setRunning(false);

    app.api.setExtVoltage("shared", 3.75);
    expect(app.api.stepSimulation(2).steps).toBe(2);

    const sources = app.api.getElements().filter(
      (element): element is ExtVoltageElm => element instanceof ExtVoltageElm
    );
    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.getVoltage())).toEqual([3.75, 3.75]);
    expect(sources.map((source) => source.volts[0])).toEqual([3.75, 3.75]);

    const beforeUnknown = sources.map((source) => source.getVoltage());
    app.api.setExtVoltage("missing", 9);
    app.api.setExtVoltage("shared", Number.NaN);
    expect(sources.map((source) => source.getVoltage())).toEqual(beforeUnknown);

    const exported = app.api.exportCircuit();
    expect((exported.match(/<ExtVoltage\b/g) ?? [])).toHaveLength(2);
    expect((exported.match(/nm="shared"/g) ?? [])).toHaveLength(2);

    const reloadedRoot = document.createElement("div");
    document.body.append(reloadedRoot);
    const reloaded = new NativeCircuitApp(reloadedRoot);
    reloaded.api.loadCircuit(exported);
    const restored = reloaded.api.getElements().filter(
      (element): element is ExtVoltageElm => element instanceof ExtVoltageElm
    );
    expect(restored).toHaveLength(2);
    expect(restored.map((source) => source.getName())).toEqual([
      "shared",
      "shared"
    ]);
  });
});
