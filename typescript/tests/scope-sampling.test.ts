import { describe, expect, it } from "vitest";
import { ScopeSampler } from "../src/app/ScopeSampling";
import { scopeValueMapping } from "../src/app/NativeCircuitApp";
import {
  CapacitorElm,
  LampElm,
  MemristorElm,
  OhmMeterElm,
  TransistorElm
} from "../src/core";

describe("ScopeSampler", () => {
  it("preserves extrema in each simulation-time bucket", () => {
    const sampler = new ScopeSampler();
    sampler.reset(4, 2, 0);
    sampler.record(0, 1, 1);
    sampler.record(0.5, 1, -3);
    sampler.record(1, 1, 5);
    sampler.record(1.5, 1, 2);
    sampler.record(2, 1, -4);
    expect(sampler.latest()).toEqual({ minimum: -4, maximum: 0 });
    // ScopePlot updates the current extrema before advancing into the next
    // bucket, so the boundary sample is represented at both positions.
    expect(sampler.values()).toEqual([-4, 5, -4, 0]);
  });

  it("uses a power-of-two ring and advances at the configured scope speed", () => {
    const sampler = new ScopeSampler();
    sampler.reset(5, 4, 0);
    expect(sampler.capacity).toBe(8);
    sampler.record(3.9, 1, 1);
    expect(sampler.sampleCount).toBe(1);
    sampler.record(4, 1, 2);
    expect(sampler.sampleCount).toBe(2);
  });

  it("zero-initializes first buckets and retains the newest tail on resize", () => {
    const sampler = new ScopeSampler();
    sampler.reset(2, 1, 0);
    sampler.record(0, 1, 3);
    expect(sampler.latest()).toEqual({ minimum: 0, maximum: 3 });
    sampler.record(1, 1, -2);
    expect(sampler.latest()).toEqual({ minimum: -2, maximum: 0 });
    sampler.resize(8);
    expect(sampler.values()).toEqual([-2, 3, -2, 0]);
  });

  it("maps capacitor charge and transistor scope values with their legacy units", () => {
    const capacitor = Object.create(CapacitorElm.prototype) as CapacitorElm;
    capacitor.capacitance = 2;
    capacitor.getVoltageDiff = () => 3;
    const charge = scopeValueMapping(capacitor, 8);
    expect([charge.unit, charge.read()]).toEqual(["C", 6]);

    const transistor = Object.create(TransistorElm.prototype) as TransistorElm;
    transistor.ib = 0.001;
    transistor.ic = 0.02;
    transistor.ie = -0.021;
    transistor.getPostVoltage = (index) => [4, 3, 1][index] ?? 0;
    expect(scopeValueMapping(transistor, 1).unit).toBe("A");
    expect(scopeValueMapping(transistor, 2).read()).toBe(0.02);
    expect(scopeValueMapping(transistor, 6).read()).toBe(2);
  });

  it("maps Lamp, Memristor and OhmMeter VAL_R to ohms", () => {
    const lamp = Object.create(LampElm.prototype) as LampElm;
    lamp.resistance = 12;
    const memristor = Object.create(MemristorElm.prototype) as MemristorElm;
    memristor.resistance = 34;
    const meter = Object.create(OhmMeterElm.prototype) as OhmMeterElm;
    meter.getResistance = () => 56;
    for (const [element, expected] of [[lamp, 12], [memristor, 34], [meter, 56]] as const) {
      const mapped = scopeValueMapping(element, 2);
      expect(mapped.unit).toBe("Ω");
      expect(mapped.suffix).toBe("电阻");
      expect(mapped.read()).toBe(expected);
    }
  });
});


