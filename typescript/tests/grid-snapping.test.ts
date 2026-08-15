import { describe, expect, it } from "vitest";
import {
  circuitGridSize,
  snapToCircuitGrid
} from "../src/app/NativeCircuitApp";

describe("legacy grid snapping", () => {
  it("uses 16 model units normally and 8 for Small Grid", () => {
    expect(circuitGridSize(false)).toBe(16);
    expect(circuitGridSize(true)).toBe(8);
  });

  it("matches Java integer masking on the normal 16-unit grid", () => {
    expect(snapToCircuitGrid(11, false)).toBe(16);
    expect(snapToCircuitGrid(7, false)).toBe(0);
    expect(snapToCircuitGrid(-11, false)).toBe(-16);
    expect(snapToCircuitGrid(8, false)).toBe(0);
    expect(snapToCircuitGrid(-8, false)).toBe(-16);
    expect(snapToCircuitGrid(8.9, false)).toBe(0);
    expect(snapToCircuitGrid(9.1, false)).toBe(16);
    expect(snapToCircuitGrid(-7.9, false)).toBe(0);
    expect(snapToCircuitGrid(-8.1, false)).toBe(-16);
  });

  it("matches Java integer masking on the small 8-unit grid", () => {
    expect(snapToCircuitGrid(11, true)).toBe(8);
    expect(snapToCircuitGrid(13, true)).toBe(16);
    expect(snapToCircuitGrid(-11, true)).toBe(-8);
    expect(snapToCircuitGrid(4, true)).toBe(0);
    expect(snapToCircuitGrid(-4, true)).toBe(-8);
    expect(snapToCircuitGrid(4.9, true)).toBe(0);
    expect(snapToCircuitGrid(5.1, true)).toBe(8);
    expect(snapToCircuitGrid(-3.9, true)).toBe(0);
    expect(snapToCircuitGrid(-4.1, true)).toBe(-8);
  });
});

