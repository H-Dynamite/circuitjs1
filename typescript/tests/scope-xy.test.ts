import { describe, expect, it } from "vitest";
import { ScopeXYFadeClock, ScopeXYTrajectory, type ScopeXYChannel, type ScopeXYSettings } from "../src/app/ScopeXY";

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
  it("fades the persistent backing image every third draw frame", () => {
    const fade = new ScopeXYFadeClock();
    expect([fade.tick(0, 0, 1), fade.tick(0, 0, 1), fade.tick(0, 0, 1)]).toEqual([0, 0, 0.01]);
    // Nonzero persistence advances by simulation time, and only commits the
    // last fade time once a Canvas-visible (>= 3/255) alpha is available.
    fade.reset();
    expect([fade.tick(4, 0, 1), fade.tick(4, 0, 1), fade.tick(4, 0, 1)]).toEqual([0, 0, 0]);
    expect([fade.tick(4, 1, 1), fade.tick(4, 1, 1), fade.tick(4, 1, 1)][2]).toBeCloseTo(1 - Math.exp(-0.25));
  });

  it("uses zero as a real XY axis/modulator index and keeps the first point segment-free", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(100, 80);
    let x = 0;
    let y = 0;
    const channels = [channel(() => x), channel(() => y)];
    const xy = settings({ x: 0, y: 1, brightness: 0 });
    expect(plot.record(channels, xy, 0)?.segment).toBeNull();
    x = 5;
    y = 0.1;
    const segment = plot.record(channels, xy, 1)?.segment;
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
    expect(plot.record(channels, xy, 1)?.segment).toMatchObject({
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
    expect(plot.record(channels, xy, 1)?.segment).toMatchObject({
      color: "rgb(255,63,0)",
      alpha: 0.5
    });
  });

  it("clears the old continuous trace when automatic scale expands", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(100, 100);
    let x = 0;
    const channels = [channel(() => x), channel(() => 0)];
    const first = plot.record(channels, settings(), 0);
    x = 1;
    const before = plot.record(channels, settings(), 1);
    expect(before?.segment).not.toBeNull();
    x = 20; // exceeds the legacy initial 5 V scale twice
    const after = plot.record(channels, settings(), 2);
    expect(after?.segment).toBeNull();
    expect(after?.scaleX).toBe(20);
    expect(after?.clearGeneration).toBeGreaterThan(before?.clearGeneration ?? first?.clearGeneration ?? -1);
  });

  it("uses manual scale/position and clears the trail on resize/reset", () => {
    const plot = new ScopeXYTrajectory();
    plot.resize(200, 100);
    let x = 1;
    const channels = [channel(() => x, 2, 10), channel(() => -1, 1, -20)];
    const xy = settings({ manual: true, manualDivisions: 8, trailPersistence: 7 });
    plot.record(channels, xy, 0);
    x = 2;
    expect(plot.record(channels, xy, 1)?.segment).not.toBeNull();
    plot.resize(201, 100);
    expect(plot.record(channels, xy, 2)?.segment).toBeNull();
    plot.reset();
    expect(plot.currentCursor).toBeNull();
    const reset = plot.record(channels, xy, 3);
    expect(reset).toMatchObject({ segment: null, scaleX: 5, scaleY: 0.1 });
  });
});
