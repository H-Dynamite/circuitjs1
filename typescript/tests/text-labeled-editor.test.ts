import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeCircuitApp } from "../src/app/NativeCircuitApp";
import { LabeledNodeElm, TextElm } from "../src/core";

describe("TextElm and LabeledNodeElm visible editors", () => {
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

  const drawAndOpenEditor = (
    root: HTMLElement,
    app: NativeCircuitApp,
    tool: "text" | "labeled-node"
  ) => {
    const canvas = root.querySelector<HTMLCanvasElement>("#circuit-canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 800, height: 600 })
    });
    Object.defineProperty(canvas, "setPointerCapture", { value: () => {} });
    root.querySelector<HTMLButtonElement>(`[data-tool="${tool}"]`)!.click();
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: 120
      }) as PointerEvent;
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event;
    };
    canvas.dispatchEvent(pointer("pointerdown", 120));
    canvas.dispatchEvent(pointer("pointermove", 200));
    canvas.dispatchEvent(pointer("pointerup", 200));
    const point = app.api.getElementClickPoint(0);
    canvas.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      clientX: point.x,
      clientY: point.y
    }));
    const edit = root.querySelector<HTMLButtonElement>(
      '#element-context-menu [data-action="edit-selected"]'
    )!;
    expect(edit.disabled).toBe(false);
    edit.click();
    expect(root.querySelector("#element-edit-dialog")?.hasAttribute("open"))
      .toBe(true);
  };

  it("applies the legacy Text fields after a real Draw and context Edit path", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new NativeCircuitApp(root);
    app.api.loadCircuit("$ 1 0.000005 10 50 5");
    drawAndOpenEditor(root, app, "text");

    const text = root.querySelector<HTMLTextAreaElement>(
      'textarea[data-edit-switch="text"]'
    )!;
    const size = root.querySelector<HTMLInputElement>(
      'input[data-edit-switch="size"]'
    )!;
    const bar = root.querySelector<HTMLInputElement>(
      'input[data-edit-switch="bar"]'
    )!;
    text.value = "first\nsecond";
    size.value = "42";
    bar.checked = true;
    root.querySelector<HTMLButtonElement>(
      '#element-edit-form button[type="submit"]'
    )!.click();

    const element = app.api.getElements()[0] as TextElm;
    expect(element.text).toBe("first\\nsecond");
    expect(element.lines).toEqual(["first", "second"]);
    expect(element.size).toBe(42);
    expect(element.hasFlag(TextElm.FLAG_BAR)).toBe(true);
  });

  it("applies the legacy LabeledNode fields through the same visible path", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const app = new NativeCircuitApp(root);
    app.api.loadCircuit("$ 1 0.000005 10 50 5");
    drawAndOpenEditor(root, app, "labeled-node");

    root.querySelector<HTMLInputElement>('input[data-edit-switch="name"]')!.value = "address";
    root.querySelector<HTMLInputElement>('input[data-edit-switch="internal"]')!.checked = true;
    root.querySelector<HTMLInputElement>('input[data-edit-switch="rotateText"]')!.checked = true;
    root.querySelector<HTMLButtonElement>(
      '#element-edit-form button[type="submit"]'
    )!.click();

    const element = app.api.getElements()[0] as LabeledNodeElm;
    expect(element.text).toBe("address");
    expect(element.isInternal()).toBe(true);
    expect(element.isRotateText()).toBe(true);
    expect(root.querySelector('input[data-edit-switch="busWidth"]')).toBeNull();
    expect(app.api.stepSimulation(1).steps).toBe(1);
  });
});
