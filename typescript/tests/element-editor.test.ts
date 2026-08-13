import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NativeCircuitApp,
  parseEditableNumber
} from "../src/app/NativeCircuitApp";
import { PotElm, Switch2Elm, SwitchElm, VarRailElm } from "../src/core";

describe("element property editor", () => {
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

  it("accepts the original engineering-number notation", () => {
    expect(parseEditableNumber("2k2")).toBe(2200);
    expect(parseEditableNumber("15u")).toBeCloseTo(15e-6, 15);
    expect(parseEditableNumber("4.7M")).toBe(4.7e6);
    expect(parseEditableNumber("4.416e-8")).toBe(4.416e-8);
    expect(parseEditableNumber("bad")).toBeNull();
  });

  it("opens a real dialog and applies linked SPDT switch properties", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new NativeCircuitApp(root);
    app.api.loadCircuit(
      [
        "$ 1 0.000005 10 50 5",
        "S 0 96 0 0 0 false false 1"
      ].join("\n")
    );
    const state = app as unknown as {
      selectedIndex: number | null;
      selectedIndices: Set<number>;
    };
    state.selectedIndex = 0;
    state.selectedIndices.add(0);

    root
      .querySelector<HTMLButtonElement>('[data-action="edit-selected"]')!
      .click();
    expect(root.querySelector("#element-edit-dialog")?.hasAttribute("open"))
      .toBe(true);

    const link = root.querySelector<HTMLInputElement>(
      'input[data-edit-switch="link"]'
    )!;
    const throws = root.querySelector<HTMLInputElement>(
      'input[data-edit-switch="throwCount"]'
    )!;
    const momentary = root.querySelector<HTMLInputElement>(
      'input[data-edit-switch="momentary"]'
    )!;
    link.value = "7";
    throws.value = "3";
    momentary.checked = true;
    root
      .querySelector<HTMLButtonElement>(
        "#element-edit-form button[type=submit]"
      )!
      .click();

    const switchElement = app.api.getElements()[0] as Switch2Elm;
    expect(switchElement.link).toBe(7);
    expect(switchElement.throwCount).toBe(3);
    expect(switchElement.momentary).toBe(false);
    expect(root.querySelector("#element-edit-dialog")?.hasAttribute("open"))
      .toBe(false);
  });

  it("keeps the element context-menu order aligned with the original", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    new NativeCircuitApp(root);
    const actions = Array.from(
      root.querySelectorAll<HTMLButtonElement>(
        "#element-context-menu button"
      )
    ).map((button) => button.dataset.action);
    expect(actions).toEqual([
      "edit-selected",
      "scope-selected",
      "cut",
      "copy",
      "duplicate",
      "delete",
      "swap-terminals",
      "flip-x",
      "flip-y",
      "split-wire"
    ]);
  });

  it("uses real canvas pointer events for momentary switch press and release", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new NativeCircuitApp(root);
    app.api.loadCircuit(
      [
        "$ 1 0.000005 10 50 5",
        "s 0 0 64 0 0 1 true"
      ].join("\n")
    );

    const element = app.api.getElements()[0] as SwitchElm;
    expect(element.momentary).toBe(true);
    expect(element.position).toBe(1);
    const canvas = root.querySelector<HTMLCanvasElement>("#circuit-canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 })
    });
    Object.defineProperty(canvas, "setPointerCapture", { value: () => {} });
    const point = app.api.getElementClickPoint(0);
    const pointer = (type: string) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: point.x,
        clientY: point.y
      }) as PointerEvent;
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event;
    };
    canvas.dispatchEvent(
      pointer("pointerdown")
    );
    expect(element.position).toBe(0);
    canvas.dispatchEvent(
      pointer("pointerup")
    );
    expect(element.position).toBe(1);

    const stepped = app.api.stepSimulation(1);
    const snapshot = app.api.getDynamicSnapshot();
    expect(stepped.steps).toBe(1);
    expect(snapshot.running).toBe(false);
    expect(snapshot.time).toBeGreaterThanOrEqual(0);
    expect(snapshot.elements).toEqual([
      expect.objectContaining({
        index: 0,
        type: "SwitchElm",
        switchPosition: 1,
        volts: expect.any(Array),
        current: expect.any(Number),
        power: expect.any(Number)
      })
    ]);
  });

  it("changes variable rails and potentiometers through visible range inputs", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new NativeCircuitApp(root);
    const state = app as unknown as {
      selectedIndex: number | null;
      selectedIndices: Set<number>;
      updateInspector(): void;
    };

    app.api.loadCircuit(
      [
        "$ 1 0.000005 10 50 5",
        "172 0 0 0 64 0 6 5 5 0 0 0.5 Voltage"
      ].join("\n")
    );
    state.selectedIndex = 0;
    state.selectedIndices.add(0);
    state.updateInspector();
    const railRange = root.querySelector<HTMLInputElement>(
      'input[type="range"][data-element-range="var-rail-voltage"]'
    )!;
    railRange.value = "25";
    railRange.dispatchEvent(new Event("input", { bubbles: true }));
    expect((app.api.getElements()[0] as VarRailElm).sliderValue).toBe(25);

    app.api.loadCircuit(
      ["$ 1 0.000005 10 50 5", "174 0 0 64 0 0 1000 0.5 Resistance"].join(
        "\n"
      )
    );
    state.selectedIndex = 0;
    state.selectedIndices.add(0);
    state.updateInspector();
    const potRange = root.querySelector<HTMLInputElement>(
      'input[type="range"][data-element-range="potentiometer"]'
    )!;
    potRange.value = "75";
    potRange.dispatchEvent(new Event("input", { bubbles: true }));
    expect((app.api.getElements()[0] as PotElm).position).toBeCloseTo(0.7475);
  });
});
