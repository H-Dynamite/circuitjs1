import { describe, expect, it } from "vitest";
import {
  CircuitRunner,
  ThreePhaseMotorElm
} from "../src/core";

const MOTOR_CIRCUIT = [
  "$ 1 0.000005 173.42552219524063 20 220 50 5e-11",
  "R 608 192 544 192 0 1 50 220 0 0 0.5",
  "R 608 224 496 224 0 1 50 220 0 -2.0943951023931953 0.5",
  "R 608 256 544 256 0 1 50 220 0 2.0943951023931953 0.5",
  "427 608 224 752 224 0 0.067 0.032 0.0294 0.0297 0.0287 0.05 0.067",
  "w 752 192 768 192 0",
  "w 752 224 768 224 0",
  "w 768 192 768 224 0",
  "w 752 256 768 256 0",
  "w 768 224 768 256 0"
].join("\n");

describe("three-phase motor parity", () => {
  it("uses the original six posts and six short lead geometry", () => {
    const runner = CircuitRunner.fromText(MOTOR_CIRCUIT);
    const motor = runner.elements[3] as ThreePhaseMotorElm;

    expect(motor.posts.map((point) => [point.x, point.y])).toEqual([
      [608, 192],
      [752, 256],
      [608, 224],
      [752, 224],
      [608, 256],
      [752, 192]
    ]);
    expect(motor.leads.map((point) => [point.x, point.y])).toEqual([
      [673, 192],
      [687, 256],
      [673, 224],
      [687, 224],
      [673, 256],
      [687, 192]
    ]);
    expect([motor.motorCenter.x, motor.motorCenter.y]).toEqual([680, 224]);
    expect(motor.canFlipX()).toBe(false);
    expect(motor.canFlipY()).toBe(false);
  });

  it("preserves all motor parameters in text exports", () => {
    const runner = CircuitRunner.fromText(MOTOR_CIRCUIT);
    const dump = runner.elements[3].dump();
    expect(dump).toBe(
      "427 608 224 752 224 0 0.067 0.032 0.0294 0.0297 0.0287 0.05 0.067"
    );
    const restored = CircuitRunner.fromText(`$ 1 0.000005 10 50 5\n${dump}`);
    const motor = restored.elements[0] as ThreePhaseMotorElm;
    expect(motor.statorResistance).toBe(0.067);
    expect(motor.rotorResistance).toBe(0.032);
    expect(motor.inertia).toBe(0.067);
  });

  it("analyzes and advances the original motor circuit with finite state", () => {
    const runner = CircuitRunner.fromText(MOTOR_CIRCUIT);
    runner.analyzeCircuit();
    for (let index = 0; index < 20; index += 1) {
      runner.runCircuit();
    }
    const motor = runner.elements[3] as ThreePhaseMotorElm;
    expect(Number.isFinite(motor.speed)).toBe(true);
    expect(motor.coilCurrents.every(Number.isFinite)).toBe(true);
  });
});
