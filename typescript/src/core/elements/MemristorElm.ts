import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** HP linear-drift memristor model. */
export class MemristorElm extends CircuitElm {
  public rOn = 100;
  public rOff = 16000;
  public dopeWidth = 0;
  public totalWidth = 10e-9;
  public mobility = 1e-10;
  public resistance = 100;

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
    const targets: Array<keyof MemristorElm> = [
      "rOn",
      "rOff",
      "dopeWidth",
      "totalWidth",
      "mobility",
      "current"
    ];
    for (const target of targets) {
      if (!tokenizer?.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) {
        (this[target] as number) = value;
      }
    }
  }

  public override getDumpType(): number {
    return "m".charCodeAt(0);
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.rOn} ${this.rOff} ${this.dopeWidth} ` +
      `${this.totalWidth} ${this.mobility} ${this.current}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ron", this.rOn);
    XMLSerializer.dumpAttr(element, "rof", this.rOff);
    XMLSerializer.dumpAttr(element, "do", this.dopeWidth);
    XMLSerializer.dumpAttr(element, "to", this.totalWidth);
    XMLSerializer.dumpAttr(element, "mo", this.mobility);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.rOn = xml.parseDoubleAttr("ron", this.rOn);
    this.rOff = xml.parseDoubleAttr("rof", this.rOff);
    this.dopeWidth = xml.parseDoubleAttr("do", this.dopeWidth);
    this.totalWidth = xml.parseDoubleAttr("to", this.totalWidth);
    this.mobility = xml.parseDoubleAttr("mo", this.mobility);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override calculateCurrent(): void {
    this.current =
      (this.volts[0] - this.volts[1]) / this.resistance;
  }

  public override reset(): void {
    this.dopeWidth = 0;
    super.reset();
  }

  public override startIteration(): void {
    const fraction = this.dopeWidth / this.totalWidth;
    this.dopeWidth +=
      (CircuitElm.sim.timeStep *
        this.mobility *
        this.rOn *
        this.current) /
      (this.totalWidth || Number.EPSILON);
    this.dopeWidth = Math.max(
      0,
      Math.min(this.totalWidth, this.dopeWidth)
    );
    this.resistance =
      this.rOn * fraction + this.rOff * (1 - fraction);
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
  }

  public override doStep(): void {
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.resistance
    );
  }
}
