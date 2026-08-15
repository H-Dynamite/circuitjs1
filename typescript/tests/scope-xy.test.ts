import { describe, expect, it } from "vitest";
import { ScopeXYTrajectory, type ScopeXYChannel, type ScopeXYSettings } from "../src/app/ScopeXY";

const settings = (overrides: Partial<ScopeXYSettings> = {}): ScopeXYSettings => ({
  xy: true,
  x: 0,
  y: 1,
  brightness: -1,
  red: -1,
  green: -1,
  blue: -1,
  trailPersistence: 0,
  manual: false,
  manualDivisions: 8,
  ...overrides
});

const channel = (value: () => number, manualScale: number | null = null,
  manualPosition: number | null = null): ScopeXYChannel => ({
  read: value,
  manualScale,
  manualPosition
});

describe("ScopeXYTrajectory", () => {
  it("uses zero as a real XY axis/modulator index and keeps the first point segment-free", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(100, 80);
    let x = 0;
    let y = 0;
    const channels = [channel(() => x), channel(() => y)];
    const xy = settings({ x: 0, y: 1, brightness: 0 });
    plot.record(channels, xy, 0);
    expect(plot.frame(0, 1).segments).toHaveLength(0);
    x = 5;
    y = 0.1;
    plot.record(channels, xy, 1);
    const [segment] = plot.frame(1, 1).segments;
    expect(segment).toMatchObject({ fromX: 49, fromY: 39, toX: 99, toY: 0, alpha: 1 });
  });

  it("keeps xy2y=0 as a real Y channel instead of replacing it with channel one", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(100, 100);
    let primary = 0.01;
    const channels = [channel(() => primary), channel(() => 0)];
    const xy = settings({ x: 0, y: 0 });
    plot.record(channels, xy, 0);
    primary = 0.1;
    plot.record(channels, xy, 1);
    expect(plot.frame(1, 1).segments[0]).toMatchObject({
      fromX: 49,
      fromY: 44,
      toX: 50,
      toY: 0
    });
  });

  it("calculates RGB and brightness from real channel reads", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(100, 100);
    const values = [0, 0, 2.5, 5, 1.25, 0];
    const channels = values.map((_value, index) => channel(() => values[index] as number));
    const xy = settings({ x: 0, y: 1, brightness: 2, red: 3, green: 4, blue: 5 });
    plot.record(channels, xy, 0);
    values[0] = 1;
    plot.record(channels, xy, 1);
    expect(plot.frame(1, 1).segments[0]).toMatchObject({
      color: "rgb(255,63,0)",
      alpha: 0.5
    });
  });

  it("clears the old continuous trace when automatic scale expands", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(100, 100);
    let x = 0;
    const channels = [channel(() => x), channel(() => 0)];
    plot.record(channels, settings(), 0);
    x = 1;
    plot.record(channels, settings(), 1);
    const before = plot.frame(1, 1);
    expect(before.segments).toHaveLength(1);
    x = 20; // exceeds the legacy initial 5 V scale twice
    plot.record(channels, settings(), 2);
    const after = plot.frame(2, 1);
    expect(after.segments).toHaveLength(0);
    expect(after.scaleX).toBe(20);
    expect(after.clearGeneration).toBeGreaterThan(before.clearGeneration);
  });

  it("uses manual scale/position and clears the trail on resize/reset", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(200, 100);
    let x = 1;
    const channels = [channel(() => x, 2, 10), channel(() => -1, 1, -20)];
    const xy = settings({ manual: true, manualDivisions: 8, trailPersistence: 7 });
    plot.record(channels, xy, 0);
    x = 2;
    plot.record(channels, xy, 1);
    expect(plot.frame(1, 1).segments).toHaveLength(1);
    plot.resize(201, 100);
    expect(plot.frame(1, 1).segments).toHaveLength(0);
    plot.record(channels, xy, 2);
    plot.reset();
    expect(plot.frame(2, 1)).toMatchObject({ segments: [], cursor: null, scaleX: 5, scaleY: 0.1 });
  });

  it("retains the real zero-persistence trail through a 2048-step capture", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(100, 100);
    let value = 0;
    const channels = [channel(() => value), channel(() => 0)];
    for (let index = 0; index < 2048; index += 1) {
      value = (index % 10) / 10;
      plot.record(channels, settings({ trailPersistence: 0 }), index);
    }
    expect(plot.frame(2048, 1).segments).toHaveLength(2047);
  });
});


