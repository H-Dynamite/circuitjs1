import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { Diode } from "./Diode";
import { MosfetElm } from "./MosfetElm";

/** JFET specialization of the migrated MOSFET channel model. */
export class JfetElm extends MosfetElm {
  public readonly diode: Diode;
  public gateCurrent = 0;
  public gatePoint = new Point();

  public constructor(x: number, y: number, pnp: boolean);
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
    x2OrPnp: number | boolean,
    y2?: number,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    super(
      x,
      y,
      typeof x2OrPnp === "boolean" ? x : x2OrPnp,
      typeof x2OrPnp === "boolean" ? y : (y2 ?? y),
      typeof x2OrPnp === "boolean"
        ? x2OrPnp
          ? MosfetElm.FLAG_PNP
          : 0
        : flags,
      typeof x2OrPnp === "boolean"
        ? new StringTokenizer("")
        : (tokenizer ?? new StringTokenizer(""))
    );
    this.noDiagonal = true;
    this.diode = new Diode(CircuitElm.sim);
    this.diode.setupForDefaultModel();
  }

  public override reset(): void {
    super.reset();
    this.diode.reset();
  }

  public override setPoints(): void {
    super.setPoints();
    const halfSize = 16 * this.dsign;
    this.src = this.newPointArray(3);
    this.drn = this.newPointArray(3);
    this.interpPoint2(
      this.point1,
      this.point2,
      this.src[0],
      this.drn[0],
      1,
      -halfSize
    );
    this.interpPoint2(
      this.point1,
      this.point2,
      this.src[1],
      this.drn[1],
      1,
      -halfSize / 2
    );
    this.interpPoint2(
      this.point1,
      this.point2,
      this.src[2],
      this.drn[2],
      this.dn === 0 ? 1 : 1 - 10 / this.dn,
      -halfSize / 2
    );
    this.gatePoint = this.interpPoint(
      this.point1,
      this.point2,
      this.dn === 0 ? 1 : 1 - 14 / this.dn
    );
  }

  public override stamp(): void {
    super.stamp();
    if (this.pnp < 0) {
      this.diode.stamp(this.nodes[1], this.nodes[0]);
    } else {
      this.diode.stamp(this.nodes[0], this.nodes[1]);
    }
  }

  public override doStep(): void {
    super.doStep();
    this.diode.doStep(
      this.pnp * (this.volts[0] - this.volts[1])
    );
  }

  public override calculateCurrent(): void {
    this.gateCurrent =
      this.pnp *
      this.diode.calculateCurrent(
        this.pnp * (this.volts[0] - this.volts[1])
      );
  }

  public override showBulk(): boolean {
    return false;
  }

  public override getDumpType(): number {
    return "j".charCodeAt(0);
  }

  public override getDefaultThreshold(): number {
    return -4;
  }

  public override getDefaultBeta(): number {
    return 0.00125;
  }

  public override getBackwardCompatibilityBeta(): number {
    return this.getDefaultBeta();
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override getCurrentIntoNode(node: number): number {
    if (node === 0) {
      return -this.gateCurrent;
    }
    if (node === 1) {
      return this.gateCurrent + this.ids;
    }
    return -this.ids;
  }
}
