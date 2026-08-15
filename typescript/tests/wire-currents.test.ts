import {
  CircuitRunner,
  LDRElm,
  PotElm,
  RailElm,
  StringTokenizer,
  Switch2Elm,
  SwitchElm,
  ThermistorNTCElm,
  WireElm
} from "../src/core";
import {
  calculateCurrentDotAdvance,
  CircuitCanvasRenderer,
  currentDotDistances,
  currentDotLocation,
  currentDotScreenLocation,
  getCurrentDotAnimationCurrent,
  getSwitchInteractionBounds,
  legacyResistorGeometry,
  potWiperContinuationPhase,
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

  it("proves a scheduler-held zero-elapsed render cannot initialize dots", () => {
    expect(calculateCurrentDotAdvance(0.05, 0, 50)).toBe(0);
    expect(shouldDrawCurrentDots(0.05, 0)).toBe(false);
  });

  it("truncates dot coordinates like CircuitElm.drawDots", () => {
    expect(
      currentDotLocation({ x: 1.9, y: -1.9 }, { x: 5.9, y: -5.9 }, 1.5)
    ).toEqual({ x: 2, y: -2 });
  });

  it("truncates negative model coordinates before a 1.5x viewport transform", () => {
    expect(
      currentDotScreenLocation(
        { x: -5, y: -5 },
        { x: 3, y: -1 },
        1.5,
        { scale: 1.5, offsetX: 10, offsetY: 20 }
      )
    ).toEqual({ x: 5.5, y: 14 });
  });

  it("keeps dots on segments shorter than the 16-unit spacing", () => {
    expect(currentDotDistances(6, 1.25)).toEqual([1.25]);
    expect(currentDotDistances(6, -1.25)).toEqual([]);
  });

  it("keeps PotElm wiper phase in model units at 1.5x scale", () => {
    const phase = potWiperContinuationPhase(
      5,
      { x: 0, y: 0 },
      { x: 0, y: 12 }
    );
    expect(phase).toBe(17);
    expect(currentDotDistances(8, phase)).toEqual([1]);
    expect(
      currentDotScreenLocation(
        { x: 0, y: 12 },
        { x: 0, y: 20 },
        1,
        { scale: 1.5, offsetX: 10, offsetY: 20 }
      )
    ).toEqual({ x: 10, y: 39.5 });
  });
});

describe("legacy resistor geometry", () => {
  it("uses ResistorElm's four 1/16-to-3/16 zigzag pairs and fixed half-size", () => {
    expect(legacyResistorGeometry(32, 64)).toEqual({
      halfSize: 6,
      zigzag: [
        { x: 0, y: 0 }, { x: 2, y: 6 }, { x: 6, y: -6 },
        { x: 10, y: 6 }, { x: 14, y: -6 }, { x: 18, y: 6 },
        { x: 22, y: -6 }, { x: 26, y: 6 }, { x: 30, y: -6 },
        { x: 32, y: 0 }
      ]
    });
    expect(legacyResistorGeometry(24, 16).halfSize).toBe(2);
  });

  it("loads real text records for pot, LDR, and thermistor geometry", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10 50 5",
        "174 0 0 64 0 1 1000 0.5 Resistance",
        "374 0 32 64 32 0 0.5 Light",
        "350 0 64 64 64 0 10000 3000 -40 150 0.5 Temperature"
      ].join("\n")
    );

    expect(runner.elements[0]).toBeInstanceOf(PotElm);
    expect(runner.elements[1]).toBeInstanceOf(LDRElm);
    expect(runner.elements[2]).toBeInstanceOf(ThermistorNTCElm);
    for (const element of runner.elements) {
      expect(Math.hypot(
        element.lead2.x - element.lead1.x,
        element.lead2.y - element.lead1.y
      )).toBeCloseTo(32, 8);
    }
  });
});

describe("switch interaction area", () => {
  it("uses the legacy initial-centering geometry", () => {
    const runner = CircuitRunner.fromText(
      ["$ 1 0.000005 10 50 5", "w 0 0 100 50 0"].join("\n")
    );
    const renderer = new CircuitCanvasRenderer();
    renderer.fit(runner.elements, 1106, 665);

    // UIManager.centerCircuit(): min(view/(bounds + margin), 1.5).
    expect(renderer.viewport.scale).toBe(1.5);
    // WireElm's legacy-compatible bounding box is inclusive at both ends.
    expect(renderer.viewport.offsetX).toBe(477.25);
    expect(renderer.viewport.offsetY).toBe(294.25);
  });

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
