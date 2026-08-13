import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { SwitchElm } from "./SwitchElm";

/** Coupled two-pole crossover switch ported from CrossSwitchElm.java. */
export class CrossSwitchElm extends SwitchElm {
  public readonly voltageSources: Array<VoltageSource | null> = [
    null,
    null
  ];
  public readonly currents = [0, 0];
  private polePosts: Point[] = [];
  private crossPoints: Point[] = [];

  public constructor(x: number, y: number);
  public constructor(
    x: number,
    y: number,
    x2: number,
    y2: number,
    flags: number,
    tokenizer: StringTokenizer
  );
  public constructor(
    x: number,
    y: number,
    x2 = x,
    y2 = y,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    super(
      x,
      y,
      x2,
      y2,
      flags,
      tokenizer ?? new StringTokenizer("0 false")
    );
    this.noDiagonal = true;
  }

  public override getDumpType(): number {
    return 430;
  }

  public override getPostCount(): number {
    return 4;
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.polePosts = [
      this.point1,
      this.interpPoint(this.point1, this.point2, 0, -48)
    ];
    const length = this.dn || 1;
    this.crossPoints = Array.from({ length: 6 }, () => new Point());
    this.crossPoints[2] = this.interpPoint(
      this.point1,
      this.point2,
      1 + 48 / length,
      16
    );
    this.crossPoints[5] = this.interpPoint(
      this.point1,
      this.point2,
      1 + 48 / length,
      -64
    );
  }

  public override getPost(index: number): Point {
    if (index === 0 || index === 2) {
      return this.polePosts[index / 2] ?? this.point1;
    }
    return index === 1
      ? this.crossPoints[2] ?? this.point2
      : this.crossPoints[5] ?? this.point2;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    source.setNodes(this.nodes[index * 2], this.nodes[index * 2 + 1]);
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    const index = this.voltageSources.indexOf(source);
    if (index >= 0) this.currents[index] = current;
  }

  public override stamp(): void {
    for (let pole = 0; pole < 2; pole += 1) {
      const source = this.voltageSources[pole];
      if (source === null) {
        throw new Error("Cross switch voltage source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(
        this.nodes[pole * 2],
        this.nodes[
          this.position === 0 ? pole * 2 + 1 : 3 - pole * 2
        ],
        source,
        0
      );
    }
  }

  public override getConnection(first: number, second: number): boolean {
    return this.position === 0
      ? this.comparePair(first, second, 0, 1) ||
          this.comparePair(first, second, 2, 3)
      : this.comparePair(first, second, 0, 3) ||
          this.comparePair(first, second, 2, 1);
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 0 || index === 2) return -this.currents[index / 2];
    return this.position === 0
      ? this.currents[Math.floor(index / 2)]
      : this.currents[1 - Math.floor(index / 2)];
  }

  public override isWireEquivalent(): boolean {
    return true;
  }

  public override isRemovableWire(): boolean {
    return false;
  }
}
