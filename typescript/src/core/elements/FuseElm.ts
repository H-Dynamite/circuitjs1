import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** I²t fuse model with cooling and persistent blown state. */
export class FuseElm extends CircuitElm {
  public static readonly FLAG_IEC_SYMBOL = 1;
  public readonly blownResistance = 1e9;
  public resistance = 0.0613;
  public heat = 0;
  public i2t = 6.73;
  public blown = false;

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
    const numericKeys = ["resistance", "i2t", "heat"] as const;
    for (const key of numericKeys) {
      if (!tokenizer.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this[key] = value;
    }
    if (tokenizer.hasMoreTokens()) {
      this.blown = tokenizer.nextToken().toLowerCase() === "true";
    }
  }

  public override getDumpType(): number {
    return 404;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.resistance} ${this.i2t} ` +
      `${this.heat} ${this.blown}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "re", this.resistance);
    XMLSerializer.dumpAttr(element, "i2", this.i2t);
    XMLSerializer.dumpAttr(element, "he", this.heat);
    XMLSerializer.dumpAttr(element, "bl", this.blown);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.resistance = xml.parseDoubleAttr("re", this.resistance);
    this.i2t = xml.parseDoubleAttr("i2", this.i2t);
    this.heat = xml.parseDoubleAttr("he", this.heat);
    this.blown = xml.parseBooleanAttr("bl", this.blown);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(this.hasFlag(FuseElm.FLAG_IEC_SYMBOL) ? 32 : 16);
  }

  public override reset(): void {
    super.reset();
    this.heat = 0;
    this.blown = false;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override calculateCurrent(): void {
    this.current =
      (this.volts[0] - this.volts[1]) /
      (this.blown ? this.blownResistance : this.resistance);
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
  }

  public override startIteration(): void {
    this.heat += this.current * this.current * CircuitElm.sim.timeStep;
    this.heat -= (CircuitElm.sim.timeStep * this.i2t) / 3;
    this.heat = Math.max(0, this.heat);
    if (this.heat > this.i2t) this.blown = true;
  }

  public override doStep(): void {
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.blown ? this.blownResistance : this.resistance
    );
  }
}
