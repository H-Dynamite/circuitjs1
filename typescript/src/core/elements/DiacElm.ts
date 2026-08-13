import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Diode } from "./Diode";

/** Bidirectional trigger diode ported from DiacElm.java. */
export class DiacElm extends CircuitElm {
  public onResistance = 500;
  public offResistance = 1e8;
  public breakdown = 30;
  public holdCurrent = 0.01;
  public state = false;
  private readonly diode1 = new Diode(CircuitElm.sim);
  private readonly diode2 = new Diode(CircuitElm.sim);

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
    const values: number[] = [];
    while (tokenizer?.hasMoreTokens() && values.length < 4) {
      values.push(Number(tokenizer.nextToken()));
    }
    if (Number.isFinite(values[0])) this.onResistance = values[0];
    if (Number.isFinite(values[1])) this.offResistance = values[1];
    if (Number.isFinite(values[2])) this.breakdown = values[2];
    if (Number.isFinite(values[3])) this.holdCurrent = values[3];
    this.diode1.setupForDefaultModel();
    this.diode2.setupForDefaultModel();
  }

  public override getDumpType(): number {
    return 203;
  }

  public override getInternalNodeCount(): number {
    return 2;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
    this.diode1.stamp(this.nodes[2], this.nodes[1]);
    this.diode2.stamp(this.nodes[1], this.nodes[3]);
  }

  public override startIteration(): void {
    if (Math.abs(this.current) < this.holdCurrent) this.state = false;
    if (Math.abs(this.volts[0] - this.volts[1]) > this.breakdown) {
      this.state = true;
    }
  }

  public override doStep(): void {
    const resistance = this.state
      ? this.onResistance
      : this.offResistance;
    CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[2], resistance);
    CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[3], resistance);
    this.diode1.doStep(this.volts[2] - this.volts[1]);
    this.diode2.doStep(this.volts[1] - this.volts[3]);
  }

  public override calculateCurrent(): void {
    const resistance = this.state
      ? this.onResistance
      : this.offResistance;
    this.current =
      (this.volts[0] - this.volts[2]) / resistance +
      (this.volts[0] - this.volts[3]) / resistance;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.onResistance} ${this.offResistance} ` +
      `${this.breakdown} ${this.holdCurrent}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ron", this.onResistance);
    XMLSerializer.dumpAttr(element, "roff", this.offResistance);
    XMLSerializer.dumpAttr(element, "bd", this.breakdown);
    XMLSerializer.dumpAttr(element, "hc", this.holdCurrent);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.onResistance = xml.parseDoubleAttr("ron", this.onResistance);
    this.offResistance = xml.parseDoubleAttr("roff", this.offResistance);
    this.breakdown = xml.parseDoubleAttr("bd", this.breakdown);
    this.holdCurrent = xml.parseDoubleAttr("hc", this.holdCurrent);
  }
}
