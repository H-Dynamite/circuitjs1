import { describe, expect, it } from "vitest";
import { WireElm } from "../src/core";
import { CircuitCanvasRenderer } from "../src/ui/CircuitCanvasRenderer";

function strokeTrackingContext(): {
  context: CanvasRenderingContext2D;
  strokeWidths: number[];
} {
  const strokeWidths: number[] = [];
  const context = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    setLineDash() {},
    strokeRect() {},
    stroke() {
      strokeWidths.push(this.lineWidth);
    }
  } as unknown as CanvasRenderingContext2D;
  return { context, strokeWidths };
}

describe("legacy model-space element line width", () => {
  for (const scale of [0.5, 1, 1.5]) {
    for (const selected of [false, true]) {
      it(`uses ${selected ? "selected" : "normal"} model width at ${scale}x`, () => {
        const renderer = new CircuitCanvasRenderer();
        renderer.viewport.scale = scale;
        const wire = new WireElm(0, 0);
        wire.setPosition(0, 0, 32, 0);
        const { context, strokeWidths } = strokeTrackingContext();
        const privateRenderer = renderer as unknown as {
          drawElement(
            context: CanvasRenderingContext2D,
            element: WireElm,
            selected: boolean,
            currentAnimationElapsedMs: number,
            currentSpeed: number
          ): void;
        };

        privateRenderer.drawElement(context, wire, selected, 0, 50);

        expect(strokeWidths[0]).toBe((selected ? 4 : 3) * scale);
      });
    }
  }
});
