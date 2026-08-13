import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NativeCircuitApp,
  parseEditableNumber
} from "../src/app/NativeCircuitApp";
import { Switch2Elm } from "../src/core";

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
});
