import { CircuitElm } from "../CircuitElm";
import { DiodeModel } from "../DiodeModel";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { Diode } from "./Diode";

/**
 * Unijunction transistor represented by its interbase channel and emitter
 * junction. This preserves the relaxation-oscillator behavior without the
 * Java CompositeElm wrapper.
 */
export class UnijunctionElm extends CircuitElm {
  public static readonly FLAG_FLIP = 2;
  public base1Resistance = 1000;
  public base2Resistance = 1500;
  public b1: Point[] = [];
  public b2: Point[] = [];
  public emitter: Point[] = [];
  public channelPolygon: Point[] = [];
  public curcounts = Array<number>(3).fill(0);
  public terminalCurrents = Array<number>(3).fill(0);
  private readonly emitterDiode = new Diode(CircuitElm.sim);

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
    _tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    this.noDiagonal = true;
    this.emitterDiode.setup(
      new DiodeModel(2.13e-11, 0, 1.8, 0, "2N2646 emitter")
    );
    CircuitElm.sim.adjustTimeStep = true;
  }

  public override getDumpType(): number {
    return 417;
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getInternalNodeCount(): number {
    return 1;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override setPoints(): void {
    super.setPoints();
    const flip = this.hasFlag(UnijunctionElm.FLAG_FLIP) ? -1 : 1;
    const halfSpacing = 16;
    const spacing = halfSpacing * this.dsign * flip;
    const first = this.interpPoint(
      this.point1,
      this.point2,
      0,
      -spacing
    );
    const second = this.interpPoint(
      this.point1,
      this.point2,
      1,
      -spacing
    );
    this.b1 = this.newPointArray(3);
    this.b2 = this.newPointArray(3);
    this.emitter = this.newPointArray(3);
    this.interpPoint2(
      first,
      second,
      this.b1[0],
      this.b2[0],
      1,
      -spacing
    );
    this.interpPoint2(
      first,
      second,
      this.b1[1],
      this.b2[1],
      1,
      -spacing / 2
    );
    this.interpPoint2(
      first,
      second,
      this.b1[2],
      this.b2[2],
      1 - 10 / Math.max(this.dn, 1),
      -spacing / 2
    );
    this.interpPoint(first, second, this.emitter[0], 0, spacing);
    this.interpPoint(
      first,
      second,
      this.emitter[1],
      1 - 28 / Math.max(this.dn, 1),
      spacing
    );
    this.emitter[2] = this.interpPoint(
      first,
      second,
      1 - 14 / Math.max(this.dn, 1)
    );

    const channel = this.newPointArray(4);
    this.interpPoint2(
      first,
      second,
      channel[0],
      channel[1],
      1 - 13 / Math.max(this.dn, 1),
      halfSpacing
    );
    this.interpPoint2(
      first,
      second,
      channel[2],
      channel[3],
      1 - 10 / Math.max(this.dn, 1),
      halfSpacing
    );
    this.channelPolygon = [
      channel[0],
      channel[1],
      channel[3],
      channel[2]
    ];
    const points = [
      ...this.b1,
      ...this.b2,
      ...this.emitter,
      ...this.channelPolygon
    ];
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    this.boundingBox.setBounds(left, top, right - left + 1, bottom - top + 1);
  }

  public override getPost(index: number): Point {
    return index === 0
      ? (this.emitter[0] ?? this.point1)
      : index === 1
        ? (this.b1[0] ?? this.point2)
        : (this.b2[0] ?? this.point2);
  }

  public override reset(): void {
    super.reset();
    this.emitterDiode.reset();
    this.curcounts.fill(0);
    this.terminalCurrents.fill(0);
  }

  public override stamp(): void {
    CircuitElm.sim.stampResistor(
      this.nodes[1],
      this.nodes[3],
      this.base1Resistance
    );
    CircuitElm.sim.stampResistor(
      this.nodes[3],
      this.nodes[2],
      this.base2Resistance
    );
    this.emitterDiode.stamp(this.nodes[0], this.nodes[3]);
  }

  public override doStep(): void {
    this.emitterDiode.doStep(this.volts[0] - this.volts[3]);
  }

  public override calculateCurrent(): void {
    this.current = this.emitterDiode.calculateCurrent(
      this.volts[0] - this.volts[3]
    );
    this.terminalCurrents[0] = -this.current;
    this.terminalCurrents[1] =
      (this.volts[3] - this.volts[1]) / this.base1Resistance;
    this.terminalCurrents[2] =
      (this.volts[3] - this.volts[2]) / this.base2Resistance;
  }

  public override getCurrentIntoNode(index: number): number {
    return this.terminalCurrents[index] ?? 0;
  }

  public override getPower(): number {
    return -this.terminalCurrents.reduce(
      (power, current, index) => power + current * (this.volts[index] ?? 0),
      0
    );
  }

  public override getConnection(first: number, second: number): boolean {
    return first !== 0 && second !== 0;
  }

  public override flipX(center2: number, count = 1): void {
    if (this.dx === 0) this.flags ^= UnijunctionElm.FLAG_FLIP;
    super.flipX(center2, count);
  }

  public override flipY(center2: number, count = 1): void {
    if (this.dy === 0) this.flags ^= UnijunctionElm.FLAG_FLIP;
    super.flipY(center2, count);
  }

  public override flipXY(xMinusY: number, count = 1): void {
    this.flags ^= UnijunctionElm.FLAG_FLIP;
    super.flipXY(xMinusY, count);
  }
}
