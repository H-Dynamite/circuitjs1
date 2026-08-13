import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Contact controlled by a RelayCoilElm with the same label. */
export class RelayContactElm extends CircuitElm {
  public static readonly FLAG_NORMALLY_CLOSED = 2;
  public static readonly FLAG_IEC = 4;

  public rOn = 0.05;
  public rOff = 1e6;
  public label = "label";
  public type = 0;
  public iPosition = 0;
  public switchCurrent = 0;
  public swposts: Point[] = [];
  public swpoles: Point[] = [];
  public ptSwitch = new Point();

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
    flags = RelayContactElm.FLAG_IEC,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      this.label = CustomLogicModel.unescape(tokenizer.nextToken());
      this.rOn = Number(tokenizer.nextToken());
      this.rOff = Number(tokenizer.nextToken());
      if (tokenizer.hasMoreTokens()) {
        this.iPosition = Number.parseInt(tokenizer.nextToken(), 10) || 0;
      }
    }
    this.noDiagonal = true;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 426;
  }

  public override getPostCount(): number {
    return 2;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${CustomLogicModel.escape(this.label)} ` +
      `${this.rOn} ${this.rOff} ${this.iPosition}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "lb", this.label);
    XMLSerializer.dumpAttr(element, "ron", this.rOn);
    XMLSerializer.dumpAttr(element, "roff", this.rOff);
    XMLSerializer.dumpAttr(element, "ip", this.iPosition);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.label = xml.parseStringAttr("lb", this.label) ?? this.label;
    this.rOn = xml.parseDoubleAttr("ron", this.rOn);
    this.rOff = xml.parseDoubleAttr("roff", this.rOff);
    this.iPosition = xml.parseIntAttr("ip", this.iPosition);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    const openSpacing = this.dsign * 16;
    this.swposts = this.newPointArray(3);
    this.swpoles = this.newPointArray(3);
    this.interpPoint(this.lead1, this.lead2, this.swpoles[0], 0, 0);
    this.interpPoint(this.lead1, this.lead2, this.swpoles[1], 1, 0);
    this.interpPoint(
      this.lead1,
      this.lead2,
      this.swpoles[2],
      1,
      openSpacing
    );
    this.interpPoint(this.point1, this.point2, this.swposts[0], 0, 0);
    this.interpPoint(this.point1, this.point2, this.swposts[1], 1, 0);
    this.interpPoint(
      this.point1,
      this.point2,
      this.swposts[2],
      1,
      openSpacing
    );
  }

  public override getPost(index: number): Point {
    return this.swposts[index] ?? this.point1;
  }

  public setRelayPosition(position: number, type: number): void {
    this.iPosition = this.isNormallyClosed() ? 1 - position : position;
    this.type = type;
  }

  public isNormallyClosed(): boolean {
    return this.hasFlag(RelayContactElm.FLAG_NORMALLY_CLOSED);
  }

  public override reset(): void {
    super.reset();
    this.switchCurrent = 0;
    this.iPosition = 0;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
  }

  public override doStep(): void {
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.iPosition === 0 ? this.rOn : this.rOff
    );
  }

  public override calculateCurrent(): void {
    this.switchCurrent =
      this.iPosition === 1
        ? 0
        : (this.volts[0] - this.volts[1]) / this.rOn;
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 0) return -this.switchCurrent;
    return this.iPosition === 0 ? this.switchCurrent : 0;
  }

  public override getConnection(_first: number, _second: number): boolean {
    return true;
  }
}
