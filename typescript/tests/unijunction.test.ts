import { describe, expect, it } from "vitest";
import {
  CircuitRunner,
  UnijunctionElm
} from "../src/core";

const UJT_OSCILLATOR = [
  "$ 65 0.000005 0.23988752939670982 62 5 50 5e-11",
  "r 496 176 496 48 0 470",
  "r 352 48 352 176 0 100000",
  "c 352 176 352 304 0 1e-8 5.060465273168598 0.001",
  "r 496 208 496 384 0 47",
  "g 496 384 496 400 0 0",
  "g 352 368 352 400 0 0",
  "R 352 48 272 48 0 0 40 10 0 0 0.5",
  "w 352 48 496 48 0",
  "r 352 304 352 368 0 1",
  "417 416 176 496 176 1",
  "r 352 176 416 176 0 10"
].join("\n");

describe("unijunction transistor parity", () => {
  it("uses the original B1, B2, emitter, arrow and channel geometry", () => {
    const runner = CircuitRunner.fromText(UJT_OSCILLATOR);
    const ujt = runner.elements[9] as UnijunctionElm;

    expect(ujt.b1.map((point) => [point.x, point.y])).toEqual([
      [496, 208],
      [496, 200],
      [486, 200]
    ]);
    expect(ujt.b2.map((point) => [point.x, point.y])).toEqual([
      [496, 176],
      [496, 184],
      [486, 184]
    ]);
    expect(ujt.emitter.map((point) => [point.x, point.y])).toEqual([
      [416, 176],
      [468, 176],
      [482, 192]
    ]);
    expect(ujt.channelPolygon.map((point) => [point.x, point.y])).toEqual([
      [483, 176],
      [483, 208],
      [486, 208],
      [486, 176]
    ]);
  });

  it("reports separate finite currents for all three terminals", () => {
    const runner = CircuitRunner.fromText(UJT_OSCILLATOR);
    runner.analyzeCircuit();
    for (let index = 0; index < 20; index += 1) runner.runCircuit();
    const ujt = runner.elements[9] as UnijunctionElm;
    expect(ujt.terminalCurrents.every(Number.isFinite)).toBe(true);
    expect(
      Math.abs(ujt.terminalCurrents.reduce((sum, current) => sum + current, 0))
    ).toBeLessThan(1e-6);
  });

  it("keeps the symbol side correct when flipped", () => {
    const runner = CircuitRunner.fromText(UJT_OSCILLATOR);
    const ujt = runner.elements[9] as UnijunctionElm;
    const flags = ujt.flags;
    ujt.flipY(352);
    expect(ujt.flags).toBe(flags ^ UnijunctionElm.FLAG_FLIP);
    expect(ujt.getPost(0).y).toBe(176);
  });
});
