import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Diode } from "./Diode";

/** Silicon-controlled rectifier using the original latching model. */
export class SCRElm extends CircuitElm {
  public static readonly FLAG_GATE_FIX = 1;
  public triggerCurrent = 0.01;
  public holdingCurrent = 0.0082;
  public gateResistance = 50;
  public anodeResistance = 1;
  public anodeCurrent = 0;
  public cathodeCurrent = 0;
  public gateCurrent = 0;
  private lastVac = 0;
  private lastVag = 0;
  private gatePost = new Point();
  private readonly diode = new Diode(CircuitElm.sim);

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
    flags = SCRElm.FLAG_GATE_FIX,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    const values: number[] = [];
    while (tokenizer?.hasMoreTokens() && values.length < 5) {
      values.push(Number(tokenizer.nextToken()));
    }
    if (Number.isFinite(values[0])) this.lastVac = values[0];
    if (Number.isFinite(values[1])) this.lastVag = values[1];
    if (Number.isFinite(values[2])) this.triggerCurrent = values[2];
    if (Number.isFinite(values[3])) this.holdingCurrent = values[3];
    if (Number.isFinite(values[4])) this.gateResistance = values[4];
    this.diode.setupForDefaultModel();
  }

  public override getDumpType(): number {
    return 177;
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
    let gateLength = 16 + (leadLength % 16);
    if (gateLength <= 0) gateLength = 16;
    const gateAnchor = this.interpPoint(
      this.lead2,
      this.point2,
      gateLength / Math.max(leadLength, 1),
      gateLength * direction
    );
    this.gatePost = this.interpPoint(
      this.lead2,
      this.point2,
      gateLength / Math.max(leadLength, 1),
      32 * direction
    );
    this.gatePost.x = Math.round(this.gatePost.x / 16) * 16;
    this.gatePost.y = Math.round(this.gatePost.y / 16) * 16;
    void gateAnchor;
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
      this.gateResistance
    );
    this.diode.stamp(this.nodes[3], this.nodes[1]);
  }

  public override doStep(): void {
    const vac = this.volts[0] - this.volts[1];
    const vag = this.volts[0] - this.volts[2];
    if (
      Math.abs(vac - this.lastVac) > 0.01 ||
      Math.abs(vag - this.lastVag) > 0.01
    ) {
      CircuitElm.sim.converged = false;
    }
    this.lastVac = vac;
    this.lastVag = vag;
    this.diode.doStep(this.volts[3] - this.volts[1]);
    const cathodeMultiplier = 1 / this.triggerCurrent;
    const anodeMultiplier =
      1 / this.holdingCurrent - cathodeMultiplier;
    this.anodeResistance =
      -cathodeMultiplier * this.cathodeCurrent +
        this.anodeCurrent * anodeMultiplier >
      1
        ? 0.0105
        : 1e6;
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[3],
      this.anodeResistance
    );
  }

  public override calculateCurrent(): void {
    this.gateCurrent =
      (this.volts[2] - this.volts[1]) / this.gateResistance;
    this.anodeCurrent =
      (this.volts[0] - this.volts[3]) / this.anodeResistance;
    this.cathodeCurrent = -this.gateCurrent - this.anodeCurrent;
    this.current = this.anodeCurrent;
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 0) return -this.anodeCurrent;
    if (index === 1) return -this.cathodeCurrent;
    return -this.gateCurrent;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "tr", this.triggerCurrent);
    XMLSerializer.dumpAttr(element, "ho", this.holdingCurrent);
    XMLSerializer.dumpAttr(element, "gr", this.gateResistance);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.triggerCurrent = xml.parseDoubleAttr("tr", this.triggerCurrent);
    this.holdingCurrent = xml.parseDoubleAttr("ho", this.holdingCurrent);
    this.gateResistance = xml.parseDoubleAttr("gr", this.gateResistance);
  }
}
