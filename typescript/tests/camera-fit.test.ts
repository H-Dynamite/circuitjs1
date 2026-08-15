import { describe, expect, it } from "vitest";
import { XorGateElm } from "../src/core";
import { StringTokenizer } from "../src/core/StringTokenizer";
import { CircuitCanvasRenderer } from "../src/ui/CircuitCanvasRenderer";

describe("legacy centerCircuit camera fit", () => {
  it("keeps Java's identity transform when the circuit has no bounds", () => {
    const renderer = new CircuitCanvasRenderer();

    renderer.fit([], 1106, 665);

    expect(renderer.viewport).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0
    });
  });

  it("reads GateElm's Java hs2 bbox expansion from the element", () => {
    const gate = new XorGateElm(
      -16,
      720,
      112,
      720,
      0,
      new StringTokenizer("")
    );
    gate.setPoints();
    expect(gate.boundingBox).toEqual({ x: -16, y: 692, width: 129, height: 56 });

    const renderer = new CircuitCanvasRenderer();
    renderer.fit([gate], 1106, 665);

    // Java bounds: x=-16..113 and y=692..748. The +1 horizontal
    // endpoint comes from CircuitElm.setBbox; hs2=28 supplies y extent.
    expect(renderer.viewport).toEqual({
      scale: 1.5,
      offsetX: 480.25,
      offsetY: -747.5
    });
  });

  it("uses the effective fit height supplied by centerCircuit", () => {
    const gate = new XorGateElm(
      0,
      0,
      128,
      0,
      0,
      new StringTokenizer("")
    );
    gate.setPoints();

    const full = new CircuitCanvasRenderer();
    full.fit([gate], 640, 500);
    const narrowReserved = new CircuitCanvasRenderer();
    narrowReserved.fit([gate], 640, 400);

    expect(full.viewport.offsetY).toBe(250);
    expect(narrowReserved.viewport.offsetY).toBe(200);
    expect(full.viewport.scale).toBe(1.5);
    expect(narrowReserved.viewport.scale).toBe(1.5);
  });
});
