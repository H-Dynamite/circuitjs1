import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Hysteretic spark-gap switch model. */
export class SparkGapElm extends CircuitElm {
  public onResistance = 1e3;
  public offResistance = 1e9;
  public breakdown = 1e3;
  public holdCurrent = 0.001;
  public resistance = this.offResistance;
  public state = false;

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
    if (tokenizer?.hasMoreTokens()) {
      this.onResistance = Number(tokenizer.nextToken());
      this.offResistance = Number(tokenizer.nextToken());
      this.breakdown = Number(tokenizer.nextToken());
      this.holdCurrent = Number(tokenizer.nextToken());
    }
    this.resistance = this.offResistance;
  }

  public override getDumpType(): number {
    return 187;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.onResistance} ${this.offResistance} ` +
      `${this.breakdown} ${this.holdCurrent}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "on", this.onResistance);
    XMLSerializer.dumpAttr(element, "of", this.offResistance);
    XMLSerializer.dumpAttr(element, "br", this.breakdown);
    XMLSerializer.dumpAttr(element, "ho", this.holdCurrent);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.onResistance = xml.parseDoubleAttr("on", this.onResistance);
    this.offResistance = xml.parseDoubleAttr("of", this.offResistance);
    this.breakdown = xml.parseDoubleAttr("br", this.breakdown);
    this.holdCurrent = xml.parseDoubleAttr("ho", this.holdCurrent);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(24);
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override reset(): void {
    super.reset();
    this.state = false;
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
  }

  public override startIteration(): void {
    if (Math.abs(this.current) < this.holdCurrent) this.state = false;
    if (Math.abs(this.volts[0] - this.volts[1]) > this.breakdown) {
      this.state = true;
    }
  }

  public override doStep(): void {
    this.resistance = this.state
      ? this.onResistance
      : this.offResistance;
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.resistance
    );
  }

  public override calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.resistance;
  }
}
