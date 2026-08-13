import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/**
 * Five-terminal non-ideal op-amp behavior model.
 *
 * The Java class expands a large transistor-level 741/324 composite. This
 * native model preserves its public pins, slew-rate, supply clipping and
 * output-current limit without shipping or executing the old runtime.
 */
export class OpAmpRealElm extends CircuitElm {
  public static readonly FLAG_SWAP = 2;
  public slewRate = 0.6;
  public currentLimit = 0.0231;
  public capValue = 0;
  public modelType = 0;
  public gain = 100000;
  public outputResistance = 1;
  public in1p: Point[] = [];
  public in2p: Point[] = [];
  public rail1p: Point[] = [];
  public rail2p: Point[] = [];

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
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags);
    const values = ["slewRate", "capValue", "currentLimit", "modelType"] as const;
    for (const key of values) {
      if (!tokenizer.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this[key] = value;
    }
    this.noDiagonal = true;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 409;
  }

  public override getPostCount(): number {
    return 5;
  }

  public override getInternalNodeCount(): number {
    return 1;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override setPoints(): void {
    super.setPoints();
    const width = Math.min(32, this.dn / 2);
    this.calcLeads(width * 2);
    let height = 16 * this.dsign;
    if (this.hasFlag(OpAmpRealElm.FLAG_SWAP)) height = -height;
    this.in1p = this.newPointArray(2);
    this.in2p = this.newPointArray(2);
    this.rail1p = this.newPointArray(2);
    this.rail2p = this.newPointArray(2);
    this.interpPoint2(
      this.point1,
      this.point2,
      this.in1p[0],
      this.in2p[0],
      0,
      height
    );
    this.interpPoint2(
      this.lead1,
      this.lead2,
      this.in1p[1],
      this.in2p[1],
      0,
      height
    );
    this.interpPoint2(
      this.lead1,
      this.lead2,
      this.rail1p[0],
      this.rail2p[0],
      0.5,
      height * 2
    );
    this.interpPoint2(
      this.lead1,
      this.lead2,
      this.rail1p[1],
      this.rail2p[1],
      0.5,
      height
    );
  }

  public override getPost(index: number): Point {
    if (index === 0) return this.in1p[0] ?? this.point1;
    if (index === 1) return this.in2p[0] ?? this.point1;
    if (index === 2) return this.point2;
    if (index === 3) return this.rail1p[0] ?? this.point1;
    return this.rail2p[0] ?? this.point1;
  }

  public override setVoltageSource(
    _index: number,
    source: VoltageSource
  ): void {
    this.voltSource = source;
    source.setNodes(CircuitNode.ground, this.nodes[5]);
  }

  public override stamp(): void {
    if (this.voltSource === null) {
      throw new Error("Real op-amp source is unassigned");
    }
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[5],
      this.voltSource
    );
    CircuitElm.sim.stampNonLinear(this.nodes[5]);
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
  }

  public override doStep(): void {
    if (this.voltSource === null) {
      throw new Error("Real op-amp source is unassigned");
    }
    const lowRail = Math.min(this.volts[3], this.volts[4]);
    const highRail = Math.max(this.volts[3], this.volts[4]);
    const headroom = this.modelType === 0 ? 1.5 : 0.02;
    const lowLimit = lowRail + headroom;
    const highLimit = highRail - headroom;
    const desired = Math.min(
      highLimit,
      Math.max(
        lowLimit,
        (this.volts[1] - this.volts[0]) * this.gain
      )
    );
    const previous = this.volts[5];
    const maximumStep =
      this.slewRate * 1e6 * CircuitElm.sim.timeStep;
    const output = Math.max(
      previous - maximumStep,
      Math.min(previous + maximumStep, desired)
    );
    const voltageDrop = Math.abs(this.volts[5] - this.volts[2]);
    this.outputResistance = Math.max(
      1,
      voltageDrop / Math.max(this.currentLimit, 1e-9)
    );
    CircuitElm.sim.stampResistor(
      this.nodes[5],
      this.nodes[2],
      this.outputResistance
    );
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[5],
      this.voltSource,
      output
    );
  }

  public override calculateCurrent(): void {
    this.current =
      (this.volts[5] - this.volts[2]) / this.outputResistance;
  }

  public override getCurrentIntoNode(index: number): number {
    return index === 2 ? this.current : 0;
  }

  public override getConnection(_first: number, _second: number): boolean {
    return false;
  }

  public override hasGroundConnection(index: number): boolean {
    return index === 2;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.slewRate} ${this.capValue} ` +
      `${this.currentLimit} ${this.modelType}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "slr", this.slewRate);
    XMLSerializer.dumpAttr(element, "cl", this.currentLimit);
    XMLSerializer.dumpAttr(element, "mt", this.modelType);
    XMLSerializer.dumpAttr(element, "vd", this.capValue);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.slewRate = xml.parseDoubleAttr("slr", this.slewRate);
    this.currentLimit = xml.parseDoubleAttr("cl", this.currentLimit);
    this.modelType = xml.parseIntAttr("mt", this.modelType);
    this.capValue = xml.parseDoubleAttr("vd", this.capValue);
  }
}
