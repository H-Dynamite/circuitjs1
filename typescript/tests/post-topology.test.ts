import { describe, expect, it, vi } from "vitest";
import {
  CircuitRunner,
  Point,
  ResistorElm,
  StringTokenizer,
  WireElm
} from "../src/core";
import { CircuitCanvasRenderer } from "../src/ui/CircuitCanvasRenderer";

describe("post topology", () => {
  it("hides a two-post series coordinate and keeps endpoints", () => {
    const runner = CircuitRunner.fromText(
      "$ 1 0.000005 10.2 50 5 43\n" +
        "r 0 0 16 0 0 100\n" +
        "r 16 0 32 0 0 100"
    );

    expect(runner.getPostDrawList()).toEqual([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 32, y: 0 })
    ]);
  });

  it("counts physical coordinates instead of merged wire node links", () => {
    const runner = CircuitRunner.fromText(
      "$ 1 0.000005 10.2 50 5 43\n" +
        "w 0 0 16 0 0\n" +
        "r 16 0 32 0 0 100"
    );
    runner.analyzeCircuit();

    expect(runner.getCircuitNode(1)?.links).toHaveLength(3);
    expect(runner.getPostDrawList()).toEqual([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 32, y: 0 })
    ]);
  });

  it("keeps a branch coordinate once when three posts overlap", () => {
    const runner = CircuitRunner.fromText(
      "$ 1 0.000005 10.2 50 5 43\n" +
        "r 16 16 0 16 0 100\n" +
        "r 16 16 32 16 0 100\n" +
        "r 16 16 16 32 0 100"
    );

    const posts = runner.getPostDrawList();
    expect(
      posts.filter((point) => point.x === 16 && point.y === 16)
    ).toHaveLength(1);
    expect(posts).toHaveLength(4);
  });

  it("counts coincident xy coordinates independently by z layer", () => {
    const busWire = new WireElm(
      0,
      0,
      16,
      0,
      0,
      new StringTokenizer("")
    );
    busWire.setBusWidth(2);
    busWire.setPoints();
    const resistor = new ResistorElm(
      0,
      0,
      0,
      16,
      0,
      new StringTokenizer("100")
    );
    resistor.setPoints();
    const runner = new CircuitRunner([busWire, resistor]);

    const posts = runner.getPostDrawList();
    expect(posts).not.toContainEqual(new Point(0, 0, 0));
    expect(posts).toContainEqual(new Point(0, 0, 1));
  });

  it("invalidates analyzed topology and isolates caches between runners", () => {
    const runner = CircuitRunner.fromText(
      "$ 1 0.000005 10.2 50 5 43\n" + "r 0 0 16 0 0 100"
    );
    runner.analyzeCircuit();
    expect(runner.getPostDrawList()).toContainEqual(
      expect.objectContaining({ x: 16, y: 0 })
    );

    runner.elements[0].setPosition(0, 0, 32, 0);
    runner.analyzed = false;
    expect(runner.getPostDrawList()).toEqual([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 32, y: 0 })
    ]);

    const extension = CircuitRunner.fromText(
      "$ 1 0.000005 10.2 50 5 43\n" + "r 32 0 48 0 0 100"
    ).elements[0];
    runner.elements.push(extension);
    runner.analyzed = false;
    expect(runner.getPostDrawList()).toEqual([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 48, y: 0 })
    ]);

    runner.elements.pop();
    runner.analyzed = false;
    expect(runner.getPostDrawList()).toEqual([
      expect.objectContaining({ x: 0, y: 0 }),
      expect.objectContaining({ x: 32, y: 0 })
    ]);

    const freshRunner = CircuitRunner.fromText(
      "$ 1 0.000005 10.2 50 5 43\n" + "r 80 0 96 0 0 100"
    );
    freshRunner.analyzeCircuit();
    expect(freshRunner.getPostDrawList()).toEqual([
      expect.objectContaining({ x: 80, y: 0 }),
      expect.objectContaining({ x: 96, y: 0 })
    ]);
  });

  it("renders only the supplied unique post coordinates", () => {
    const renderer = new CircuitCanvasRenderer();
    const arcs: Array<[number, number]> = [];
    const context = {
      arc: vi.fn((x: number, y: number) => arcs.push([x, y])),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
      restore: vi.fn(),
      save: vi.fn()
    } as unknown as CanvasRenderingContext2D;

    renderer.render(
      context,
      100,
      100,
      [],
      [new Point(0, 0), new Point(16, 0)],
      new Set(),
      0,
      50,
      null,
      null
    );

    expect(arcs).toHaveLength(2);
    expect(context.fill).toHaveBeenCalledTimes(2);
  });
});
