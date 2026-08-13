import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Diode } from "./Diode";

/** Bidirectional latching thyristor ported from TriacElm.java. */
export class TriacElm extends CircuitElm {
  public holdingCurrent = 0.0082;
  public triggerCurrent = 0.01;
  public controlResistance = 100;
  public state = false;
  public mainResistance = 1e6;
  public mt1Current = 0;
  public mt2Current = 0;
  public gateCurrent = 0;
  private gatePost = new Point();
  private readonly forwardDiode = new Diode(CircuitElm.sim);
  private readonly reverseDiode = new Diode(CircuitElm.sim);

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
    super(x, y, x2, y2, flags);
    const values: string[] = [];
    while (tokenizer?.hasMoreTokens() && values.length < 4) {
      values.push(tokenizer.nextToken());
    }
    if (Number.isFinite(Number(values[0]))) {
      this.triggerCurrent = Number(values[0]);
    }
    if (Number.isFinite(Number(values[1]))) {
      this.holdingCurrent = Number(values[1]);
    }
    if (Number.isFinite(Number(values[2]))) {
      this.controlResistance = Number(values[2]);
    }
    if (values[3] !== undefined) this.state = values[3] === "true";
    this.forwardDiode.setupForDefaultModel();
    this.reverseDiode.setupForDefaultModel();
  }

  public override getDumpType(): number {
    return 206;
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
    let direction =
      Math.abs(this.dx) > Math.abs(this.dy)
        ? -CircuitElm.sign(this.dx) * CircuitElm.sign(this.dy)
        : CircuitElm.sign(this.dy) * CircuitElm.sign(this.dx);
    if (direction === 0) direction = 1;
    if (Math.abs(this.dx) > Math.abs(this.dy)) {
      this.dn = Math.abs(this.dx);
      this.point2.y = this.point1.y;
    } else {
      this.dn = Math.abs(this.dy);
      this.point2.x = this.point1.x;
    }
    this.calcLeads(16);
    const leadLength = (this.dn - 16) / 2;
    const gateLength = 16 + (leadLength % 16);
    this.gatePost = this.interpPoint(
      this.lead2,
      this.point2,
      gateLength / Math.max(leadLength, 1),
      32 * direction
    );
    this.gatePost.x = Math.round(this.gatePost.x / 16) * 16;
    this.gatePost.y = Math.round(this.gatePost.y / 16) * 16;
  }

  public override getPost(index: number): Point {
    return index === 0
      ? this.point1
      : index === 1
        ? this.point2
        : this.gatePost;
  }

  public override stamp(): void {
    for (const node of this.nodes) CircuitElm.sim.stampNonLinear(node);
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[1],
      this.controlResistance
    );
    this.forwardDiode.stamp(this.nodes[0], this.nodes[3]);
    this.reverseDiode.stamp(this.nodes[3], this.nodes[0]);
  }

  public override startIteration(): void {
    if (Math.abs(this.mt2Current) < this.holdingCurrent) {
      this.state = false;
    }
    if (Math.abs(this.gateCurrent) > this.triggerCurrent) {
      this.state = true;
    }
    this.mainResistance = this.state ? 0.01 : 1e6;
  }

  public override doStep(): void {
    this.forwardDiode.doStep(this.volts[0] - this.volts[3]);
    this.reverseDiode.doStep(this.volts[3] - this.volts[0]);
    CircuitElm.sim.stampResistor(
      this.nodes[3],
      this.nodes[1],
      this.mainResistance
    );
  }

  public override calculateCurrent(): void {
    this.mt2Current =
      (this.volts[3] - this.volts[1]) / this.mainResistance;
    this.gateCurrent =
      -(this.volts[1] - this.volts[2]) / this.controlResistance;
    this.mt1Current = -this.mt2Current - this.gateCurrent;
    this.current = this.mt2Current;
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 0) return -this.mt2Current;
    if (index === 1) return -this.mt1Current;
    return -this.gateCurrent;
  }

  public override getVoltageDiff(): number {
    return this.volts[0] - this.volts[1];
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ti", this.triggerCurrent);
    XMLSerializer.dumpAttr(element, "hi", this.holdingCurrent);
    XMLSerializer.dumpAttr(element, "cr", this.controlResistance);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.triggerCurrent = xml.parseDoubleAttr("ti", this.triggerCurrent);
    this.holdingCurrent = xml.parseDoubleAttr("hi", this.holdingCurrent);
    this.controlResistance = xml.parseDoubleAttr(
      "cr",
      this.controlResistance
    );
    this.state = xml.parseBooleanAttr("st", this.state);
  }
}
