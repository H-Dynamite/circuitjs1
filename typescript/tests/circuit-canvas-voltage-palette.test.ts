import { describe, expect, it } from "vitest";
import { CircuitElm } from "../src/core";
import { CircuitCanvasRenderer } from "../src/ui/CircuitCanvasRenderer";

function voltageColor(renderer: CircuitCanvasRenderer, voltage: number): string {
  return (
    renderer as unknown as { voltageColor(voltage: number): string }
  ).voltageColor(voltage);
}

describe("legacy 201-entry voltage palette", () => {
  it("uses CircuitElm's red/gray/green defaults and clipped endpoints", () => {
    const renderer = new CircuitCanvasRenderer();
    const range = CircuitElm.voltageRange;

    expect(voltageColor(renderer, -range)).toBe("rgb(255, 0, 0)");
    // Legacy zero maps to palette index 100 (just below the gray center).
    expect(voltageColor(renderer, 0)).toBe("rgb(128, 127, 127)");
    expect(voltageColor(renderer, range)).toBe("rgb(1, 253, 1)");
    expect(voltageColor(renderer, -range * 2)).toBe("rgb(255, 0, 0)");
    expect(voltageColor(renderer, range * 2)).toBe("rgb(1, 253, 1)");
    expect(voltageColor(renderer, Number.NEGATIVE_INFINITY)).toBe(
      "rgb(255, 0, 0)"
    );
    expect(voltageColor(renderer, Number.POSITIVE_INFINITY)).toBe(
      "rgb(1, 253, 1)"
    );
  });

  it("interpolates channels with Java integer truncation", () => {
    const renderer = new CircuitCanvasRenderer();
    const range = CircuitElm.voltageRange;

    expect(voltageColor(renderer, -range / 2)).toBe("rgb(191, 63, 63)");
    expect(voltageColor(renderer, range / 2)).toBe("rgb(64, 190, 64)");
  });

  it("keeps the voltage palette independent from background and display state", () => {
    const renderer = new CircuitCanvasRenderer();
    const voltage = CircuitElm.voltageRange / 3;
    const expected = voltageColor(renderer, voltage);

    renderer.whiteBackground = true;
    renderer.showVoltage = false;
    expect(voltageColor(renderer, voltage)).toBe(expected);
    expect(voltageColor(renderer, Number.NaN)).toBe("rgb(128, 127, 127)");
  });

  it("reindexes the same voltage when CircuitElm.voltageRange changes", () => {
    const originalRange = CircuitElm.voltageRange;
    const renderer = new CircuitCanvasRenderer();
    try {
      CircuitElm.voltageRange = 10;
      expect(voltageColor(renderer, 5)).toBe("rgb(64, 190, 64)");
      CircuitElm.voltageRange = 2.5;
      expect(voltageColor(renderer, 5)).toBe("rgb(1, 253, 1)");
    } finally {
      CircuitElm.voltageRange = originalRange;
    }
  });
});
