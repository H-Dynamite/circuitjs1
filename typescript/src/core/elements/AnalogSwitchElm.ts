import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Voltage-controlled SPST switch, ported from AnalogSwitchElm.java. */
export class AnalogSwitchElm extends CircuitElm {
  public static readonly FLAG_INVERT = 1;
  public static readonly FLAG_PULLDOWN = 2;
  public static readonly FLAG_FLIPPED_X = 4;
  public static readonly FLAG_FLIPPED_Y = 8;
  public static readonly FLAG_FLIPPED = 16;

  public resistance = 0;
  public rOn = 20;
  public rOff = 1e10;
  public threshold = 2.5;
  public open = false;
  public openhs = 16;
  public point3 = new Point();
  public lead3 = new Point();

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
    flags = AnalogSwitchElm.FLAG_PULLDOWN,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    this.noDiagonal = true;
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.rOn = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.rOff = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.threshold = value;
    }
  }

  public override getDumpType(): number {
    return 159;
  }

  public override getXmlDumpType(): string {
    return "as";
  }

  public override dump(): string {
    return `${super.dump()} ${this.rOn} ${this.rOff} ${this.threshold}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ron", this.rOn);
    XMLSerializer.dumpAttr(element, "roff", this.rOff);
    XMLSerializer.dumpAttr(element, "th", this.threshold);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.rOn = xml.parseDoubleAttr("ron", this.rOn);
    this.rOff = xml.parseDoubleAttr("roff", this.rOff);
    this.threshold = xml.parseDoubleAttr("th", this.threshold);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    const flipped =
      this.hasFlag(AnalogSwitchElm.FLAG_FLIPPED_X) !==
      this.hasFlag(AnalogSwitchElm.FLAG_FLIPPED_Y);
    this.openhs =
      flipped !== this.hasFlag(AnalogSwitchElm.FLAG_FLIPPED) ? -16 : 16;
    this.point3 = this.interpPoint(
      this.lead1,
      this.lead2,
      0.5,
      -this.openhs
    );
    this.lead3 = this.interpPoint(
      this.lead1,
      this.lead2,
      0.5,
      -this.openhs / 2
    );
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getPost(index: number): Point {
    return index === 0
      ? this.point1
      : index === 1
        ? this.point2
        : this.point3;
  }

  public needsPulldown(): boolean {
    return this.hasFlag(AnalogSwitchElm.FLAG_PULLDOWN);
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
    if (this.needsPulldown()) {
      CircuitElm.sim.stampResistor(
        this.nodes[0],
        CircuitNode.ground,
        this.rOff
      );
      CircuitElm.sim.stampResistor(
        this.nodes[1],
        CircuitNode.ground,
        this.rOff
      );
    }
  }

  public override doStep(): void {
    this.open = this.volts[2] < this.threshold;
    if (this.hasFlag(AnalogSwitchElm.FLAG_INVERT)) {
      this.open = !this.open;
    }
    if (!(this.needsPulldown() && this.open)) {
      this.resistance = this.open ? this.rOff : this.rOn;
      CircuitElm.sim.stampResistor(
        this.nodes[0],
        this.nodes[1],
        this.resistance
      );
    }
  }

  public override calculateCurrent(): void {
    if (this.resistance === 0 || (this.needsPulldown() && this.open)) {
      this.current = 0;
    } else {
      this.current =
        (this.volts[0] - this.volts[1]) / this.resistance;
    }
  }

  public override getConnection(first: number, second: number): boolean {
    return first !== 2 && second !== 2;
  }

  public override hasGroundConnection(node: number): boolean {
    return this.needsPulldown() && node < 2;
  }

  public override getCurrentIntoNode(node: number): number {
    return node === 2 ? 0 : node === 0 ? -this.current : this.current;
  }
}
