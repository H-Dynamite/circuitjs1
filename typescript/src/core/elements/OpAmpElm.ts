import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Saturating nonlinear operational amplifier port from OpAmpElm.java. */
export class OpAmpElm extends CircuitElm {
  public static readonly FLAG_SWAP = 1;
  public static readonly FLAG_SMALL = 2;
  public static readonly FLAG_LOWGAIN = 4;
  public static readonly FLAG_GAIN = 8;

  public opSize = 2;
  public opHeight = 16;
  public opWidth = 26;
  public maxOut = 15;
  public minOut = -15;
  public gain = 100000;
  public gbw = 1e6;
  public lastvd = 0;
  public in1p: Point[] = [];
  public in2p: Point[] = [];

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
    flags = OpAmpElm.FLAG_GAIN,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    this.noDiagonal = true;
    if (tokenizer !== undefined) {
      const values = tokenizer.toArray().map(Number);
      if (values.length > 0) this.maxOut = values[0];
      if (values.length > 1) this.minOut = values[1];
      if (values.length > 2) this.gbw = values[2];
      if (values.length > 3) this.volts[0] = values[3];
      if (values.length > 4) this.volts[1] = values[4];
      if (values.length > 5) this.gain = values[5];
    }
    this.setSize(
      (this.flags & OpAmpElm.FLAG_SMALL) !== 0 ? 1 : 2
    );
    this.setGain();
  }

  public setGain(): void {
    if (this.hasFlag(OpAmpElm.FLAG_GAIN)) {
      return;
    }
    this.gain = this.hasFlag(OpAmpElm.FLAG_LOWGAIN) ? 1000 : 100000;
  }

  public setSize(size: number): void {
    this.opSize = size;
    this.opHeight = 8 * size;
    this.opWidth = 13 * size;
    this.flags =
      (this.flags & ~OpAmpElm.FLAG_SMALL) |
      (size === 1 ? OpAmpElm.FLAG_SMALL : 0);
  }

  public override getDumpType(): number {
    return "a".charCodeAt(0);
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override getPost(index: number): Point {
    if (index === 0) {
      return this.in1p[0] ?? this.point1;
    }
    if (index === 1) {
      return this.in2p[0] ?? this.point1;
    }
    return this.point2;
  }

  public override setPoints(): void {
    super.setPoints();
    const width = Math.min(this.opWidth, this.dn / 2);
    this.calcLeads(width * 2);
    let halfHeight = this.opHeight * this.dsign;
    if (this.hasFlag(OpAmpElm.FLAG_SWAP)) {
      halfHeight = -halfHeight;
    }
    this.in1p = this.newPointArray(2);
    this.in2p = this.newPointArray(2);
    this.interpPoint2(
      this.point1,
      this.point2,
      this.in1p[0],
      this.in2p[0],
      0,
      halfHeight
    );
    this.interpPoint2(
      this.lead1,
      this.lead2,
      this.in1p[1],
      this.in2p[1],
      0,
      halfHeight
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ma", this.maxOut);
    XMLSerializer.dumpAttr(element, "mi", this.minOut);
    XMLSerializer.dumpAttr(element, "ga", this.gain);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    this.flags = 0;
    super.undumpXml(xml);
    this.maxOut = xml.parseDoubleAttr("ma", this.maxOut);
    this.minOut = xml.parseDoubleAttr("mi", this.minOut);
    this.gain = xml.parseDoubleAttr("ga", this.gain);
    this.setSize(
      this.hasFlag(OpAmpElm.FLAG_SMALL) ? 1 : 2
    );
  }

  public override stamp(): void {
    if (this.voltSource === null) {
      throw new Error("Op-amp voltage source has not been assigned");
    }
    CircuitElm.sim.stampNonLinear(this.voltSource);
    CircuitElm.sim.stampMatrix(
      this.nodes[2],
      this.voltSource,
      1
    );
  }

  public override doStep(): void {
    if (this.voltSource === null) {
      throw new Error("Op-amp voltage source has not been assigned");
    }
    const differentialVoltage = this.volts[1] - this.volts[0];
    const midpoint = (this.maxOut + this.minOut) / 2;
    if (Math.abs(this.lastvd - differentialVoltage) > 0.1) {
      CircuitElm.sim.converged = false;
    } else if (
      this.volts[2] > this.maxOut + 0.1 ||
      this.volts[2] < this.minOut - 0.1
    ) {
      CircuitElm.sim.converged = false;
    }

    let slope: number;
    let intercept: number;
    const maximumAdjusted = this.maxOut - midpoint;
    const minimumAdjusted = this.minOut - midpoint;
    if (
      differentialVoltage >= maximumAdjusted / this.gain &&
      (this.lastvd >= 0 || Math.floor(Math.random() * 4) === 1)
    ) {
      slope = 1e-4;
      intercept =
        this.maxOut -
        (slope * maximumAdjusted) / this.gain;
    } else if (
      differentialVoltage <= minimumAdjusted / this.gain &&
      (this.lastvd <= 0 || Math.floor(Math.random() * 4) === 1)
    ) {
      slope = 1e-4;
      intercept =
        this.minOut -
        (slope * minimumAdjusted) / this.gain;
    } else {
      slope = this.gain;
      intercept = midpoint;
    }

    CircuitElm.sim.stampMatrix(
      this.voltSource,
      this.nodes[0],
      slope
    );
    CircuitElm.sim.stampMatrix(
      this.voltSource,
      this.nodes[1],
      -slope
    );
    CircuitElm.sim.stampMatrix(
      this.voltSource,
      this.nodes[2],
      1
    );
    CircuitElm.sim.stampRightSide(this.voltSource, intercept);
    this.lastvd = differentialVoltage;
  }

  public override getPower(): number {
    return this.volts[2] * this.current;
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return false;
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override hasGroundConnection(node: number): boolean {
    return node === 2;
  }

  public override getVoltageDiff(): number {
    return this.volts[2] - this.volts[1];
  }

  public override getCurrentIntoNode(node: number): number {
    return node === 2 ? -this.current : 0;
  }

  public override flipX(center2: number, count = 1): void {
    if (this.dx === 0) {
      this.flags ^= OpAmpElm.FLAG_SWAP;
    }
    super.flipX(center2, count);
  }

  public override flipY(center2: number, count = 1): void {
    if (this.dy === 0) {
      this.flags ^= OpAmpElm.FLAG_SWAP;
    }
    super.flipY(center2, count);
  }

  public override flipXY(xMinusY: number, count = 1): void {
    this.flags ^= OpAmpElm.FLAG_SWAP;
    super.flipXY(xMinusY, count);
  }
}
