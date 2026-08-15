import { describe, expect, it } from "vitest";
import { ChipElm, ChipPin } from "../src/core";
import { CircuitCanvasRenderer } from "../src/ui/CircuitCanvasRenderer";

type StrokeCall = {
  kind: "line" | "body";
  color: string;
  width: number;
};

class RenderTestChip extends ChipElm {
  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = [
      new ChipPin(0, ChipElm.SIDE_W, "A"),
      new ChipPin(1, ChipElm.SIDE_E, "B")
    ];
    this.pins[0].busWidth = 4;
  }

  public override getChipName(): string {
    return "render test";
  }
}

function recordingContext(initialColor = "#000000"): {
  context: CanvasRenderingContext2D;
  strokes: StrokeCall[];
  order: Array<"line" | "text" | "body">;
} {
  const strokes: StrokeCall[] = [];
  const order: Array<"line" | "text" | "body"> = [];
  const stack: Array<{ strokeStyle: string; lineWidth: number }> = [];
  const context = {
    fillStyle: "#000000",
    strokeStyle: initialColor,
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    save() {
      stack.push({
        strokeStyle: String(this.strokeStyle),
        lineWidth: this.lineWidth
      });
    },
    restore() {
      const state = stack.pop();
      if (state !== undefined) {
        this.strokeStyle = state.strokeStyle;
        this.lineWidth = state.lineWidth;
      }
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    stroke() {
      order.push("line");
      strokes.push({
        kind: "line",
        color: String(this.strokeStyle),
        width: this.lineWidth
      });
    },
    strokeRect() {
      order.push("body");
      strokes.push({
        kind: "body",
        color: String(this.strokeStyle),
        width: this.lineWidth
      });
    },
    measureText() {
      return { width: 0 } as TextMetrics;
    },
    fillText() {
      order.push("text");
    }
  } as unknown as CanvasRenderingContext2D;
  return { context, strokes, order };
}

function renderChip(
  renderer: CircuitCanvasRenderer,
  initialColor = "#000000"
): { strokes: StrokeCall[]; order: Array<"line" | "text" | "body"> } {
  const chip = new RenderTestChip(0, 0);
  chip.setPoints();
  chip.volts = [5, -5];
  const { context, strokes, order } = recordingContext(initialColor);
  const privateRenderer = renderer as unknown as {
    drawChip(context: CanvasRenderingContext2D, element: ChipElm): void;
  };
  privateRenderer.drawChip(context, chip);
  return { strokes, order };
}

describe("legacy ChipElm rendering", () => {
  it("colors each pin from its voltage and scales bus and ordinary widths", () => {
    const renderer = new CircuitCanvasRenderer();
    renderer.viewport.scale = 1.5;
    const privateRenderer = renderer as unknown as {
      voltageColor(voltage: number): string;
    };
    const { strokes } = renderChip(renderer);

    expect(strokes.slice(0, 2)).toEqual([
      { kind: "line", color: privateRenderer.voltageColor(5), width: 7.5 },
      { kind: "line", color: privateRenderer.voltageColor(-5), width: 4.5 }
    ]);
    expect(strokes.at(-1)).toEqual({
      kind: "body",
      color: "#c0c0c0",
      width: 4.5
    });
  });

  it("uses foreground leads when voltage coloring is disabled", () => {
    const renderer = new CircuitCanvasRenderer();
    renderer.showVoltage = false;

    expect(renderChip(renderer).strokes.slice(0, 2).map((stroke) => stroke.color))
      .toEqual(["#e5e7eb", "#e5e7eb"]);
  });

  it("draws a selected chip's leads and final body in the selection color", () => {
    const renderer = new CircuitCanvasRenderer();
    const { strokes } = renderChip(renderer, renderer.selectionColor);

    expect(strokes.map((stroke) => stroke.color)).toEqual([
      renderer.selectionColor,
      renderer.selectionColor,
      renderer.selectionColor
    ]);
    expect(strokes.at(-1)?.kind).toBe("body");
  });

  it("draws the body last in black on a white background", () => {
    const renderer = new CircuitCanvasRenderer();
    renderer.whiteBackground = true;
    const { strokes, order } = renderChip(renderer);

    expect(strokes.at(-1)).toEqual({
      kind: "body",
      color: "#000000",
      width: 3
    });
    expect(order.at(-1)).toBe("body");
    expect(order).toContain("text");
  });
});
