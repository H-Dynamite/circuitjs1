import { describe, expect, it } from "vitest";
import { Rectangle, TextElm, XorGateElm } from "../src/core";
import { StringTokenizer } from "../src/core/StringTokenizer";
import { CircuitCanvasRenderer } from "../src/ui/CircuitCanvasRenderer";

describe("legacy GateElm and TextElm bounding boxes", () => {
  it("uses the Java perpendicular inclusive bbox for horizontal and vertical gates", () => {
    const horizontal = new XorGateElm(-16, 720, 112, 720, 0, new StringTokenizer(""));
    horizontal.setPoints();
    expect(horizontal.boundingBox).toEqual(new Rectangle(-16, 692, 129, 56));
    const vertical = new XorGateElm(100, 10, 100, 138, 0, new StringTokenizer(""));
    vertical.setPoints();
    expect(vertical.boundingBox).toEqual(new Rectangle(72, 10, 56, 129));
  });

  it("uses truncated measured widths and baseline-driven multiline text bounds", () => {
    const text = new TextElm(100, 200, 116, 200, 0, new StringTokenizer("12 alpha\\nbeta"));
    text.updateBoundingBox([31.9, 12.1]);
    expect(text.boundingBox).toEqual(new Rectangle(100, 188, 31, 30));
    expect([text.x2, text.y2]).toEqual([131, 218]);
  });

  it("converts screen text metrics to model units before Legacy truncation", () => {
    for (const scale of [0.5, 1.5]) {
      const text = new TextElm(100, 200, 116, 200, 0, new StringTokenizer("12 label"));
      text.setPoints();
      const renderer = new CircuitCanvasRenderer();
      renderer.viewport.scale = scale;
      const context = {
        font: "10px Arial", fillStyle: "#000", strokeStyle: "#000",
        textAlign: "left", textBaseline: "alphabetic", save() {}, restore() {}, fillText() {},
        measureText: () => ({ width: 31.9 * scale } as TextMetrics)
      } as unknown as CanvasRenderingContext2D;
      (renderer as unknown as { drawTextElement(c: CanvasRenderingContext2D, e: TextElm): void })
        .drawTextElement(context, text);
      expect(text.boundingBox).toEqual(new Rectangle(100, 188, 31, 15));
      expect([text.x2, text.y2]).toEqual([131, 203]);
    }
  });
});
