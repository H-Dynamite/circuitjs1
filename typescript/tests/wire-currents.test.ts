import {
  CircuitRunner,
  RailElm,
  StringTokenizer,
  Switch2Elm,
  SwitchElm,
  WireElm
} from "../src/core";
import {
  calculateCurrentDotAdvance,
  CircuitCanvasRenderer,
  getCurrentDotAnimationCurrent,
  getSwitchInteractionBounds,
  shouldDrawCurrentDots
} from "../src/ui/CircuitCanvasRenderer";
import { describe, expect, it } from "vitest";

const RESISTORS_EXAMPLE = [
  "$ 1 5.0E-6 10 50 5.0",
  "v 96 368 96 48 0 0 40.0 5.0 0.0",
  "w 96 48 192 48 1",
  "w 192 48 288 48 0",
  "w 288 48 384 48 0",
  "s 192 48 192 128 0 false false",
  "s 288 48 288 128 0 true false",
  "s 384 48 384 128 0 false false",
  "r 192 128 192 192 0 100.0",
  "r 288 128 288 192 0 400.0",
  "r 384 128 384 192 0 800.0",
  "w 192 192 288 192 0",
  "w 288 192 384 192 0",
  "w 288 224 288 192 0",
  "w 288 224 384 224 0",
  "w 288 224 192 224 0",
  "s 288 224 288 304 0 false false",
  "s 192 224 192 304 0 true false",
  "r 192 304 192 368 0 600.0",
  "r 288 304 288 368 0 200.0",
  "s 384 224 384 368 0 true false",
  "w 96 368 192 368 0",
  "w 192 368 288 368 0",
  "w 288 368 384 368 0"
].join("\n");

describe("wire current reconstruction", () => {
  it("propagates branch current through closed switches in the resistor example", () => {
    const runner = CircuitRunner.fromText(RESISTORS_EXAMPLE);
    runner.analyzeCircuit();
    runner.runCircuit();

    const currentAt = (index: number): number =>
      runner.elements[index].getCurrent();

    expect(runner.elements[3]).toBeInstanceOf(WireElm);
    expect(Math.abs(currentAt(3))).toBeCloseTo(0.0019230769, 8);

    expect(runner.elements[4]).toBeInstanceOf(SwitchElm);
    expect(Math.abs(currentAt(4))).toBeCloseTo(0.0153846154, 8);

    expect(runner.elements[6]).toBeInstanceOf(SwitchElm);
    expect(Math.abs(currentAt(6))).toBeCloseTo(0.0019230769, 8);

    expect(runner.elements[15]).toBeInstanceOf(SwitchElm);
    expect(Math.abs(currentAt(15))).toBeCloseTo(0.0173076923, 8);

    expect(Math.abs(currentAt(5))).toBeLessThan(1e-12);
    expect(Math.abs(currentAt(16))).toBeLessThan(1e-12);
    expect(Math.abs(currentAt(19))).toBeLessThan(1e-12);
  });
});

describe("current dot animation", () => {
  it("reverses the MNA current for one-terminal rail drawing", () => {
    const rail = new RailElm(0, 0);
    rail.current = 0.005;

    expect(getCurrentDotAnimationCurrent(rail)).toBe(-0.005);
  });

  it("keeps the last dots visible after current reaches zero", () => {
    expect(shouldDrawCurrentDots(0, 4.5)).toBe(true);
    expect(shouldDrawCurrentDots(0, 0)).toBe(false);
  });

  it("moves proportionally faster as current magnitude increases", () => {
    const elapsedMilliseconds = 16;
    const slow = calculateCurrentDotAdvance(
      0.005,
      elapsedMilliseconds,
      50
    );
    const fast = calculateCurrentDotAdvance(
      0.05,
      elapsedMilliseconds,
      50
    );

    expect(fast).toBeCloseTo(slow * 10, 12);
    expect(
      calculateCurrentDotAdvance(-0.05, elapsedMilliseconds, 50)
    ).toBeCloseTo(-fast, 12);
    expect(
      calculateCurrentDotAdvance(0.05, elapsedMilliseconds, 70)
    ).toBeGreaterThan(fast);
  });
});

describe("switch interaction area", () => {
  it("includes both throws of an SPDT switch", () => {
    const switchElement = new Switch2Elm(
      0,
      96,
      0,
      0,
      0,
      new StringTokenizer("0 false 0 2")
    );
    switchElement.setPoints();
    const bounds = getSwitchInteractionBounds(switchElement);
    expect(bounds.left).toBeLessThanOrEqual(-16);
    expect(bounds.right).toBeGreaterThanOrEqual(16);

    const renderer = new CircuitCanvasRenderer();
    expect(renderer.hitTest([switchElement], 16, 32)).toBe(0);
    expect(renderer.hitTest([switchElement], 30, 32)).toBeNull();
  });

  it("synchronizes SPDT switches with the same nonzero link number", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10 50 5",
        "S 0 96 0 0 0 false false 1",
        "S 64 96 64 0 0 false false 1"
      ].join("\n")
    );
    const first = runner.elements[0] as Switch2Elm;
    const second = runner.elements[1] as Switch2Elm;

    first.toggle();
    expect(first.position).toBe(1);
    expect(second.position).toBe(1);

    second.toggle();
    expect(first.position).toBe(0);
    expect(second.position).toBe(0);
  });

  it("reverses linked positions when one SPDT switch is flipped", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10 50 5",
        "S 0 96 0 0 0 false false 1",
        "S 64 96 64 0 0 false false 1"
      ].join("\n")
    );
    const first = runner.elements[0] as Switch2Elm;
    const second = runner.elements[1] as Switch2Elm;

    second.flipX(128);
    first.toggle();

    expect(first.position).toBe(1);
    expect(second.position).toBe(0);
  });
});
