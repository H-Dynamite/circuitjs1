import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Temperature-dependent incandescent lamp ported from LampElm.java. */
export class LampElm extends CircuitElm {
  public readonly roomTemp = 300;
  public resistance = 1;
  public temp = this.roomTemp;
  public nomPow = 100;
  public nomV = 120;
  public warmTime = 0.4;
  public coolTime = 0.4;

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
    while (tokenizer?.hasMoreTokens() && values.length < 5) {
      values.push(Number(tokenizer.nextToken()));
    }
    if (Number.isFinite(values[0])) this.temp = values[0];
    if (Number.isFinite(values[1])) this.nomPow = values[1];
    if (Number.isFinite(values[2])) this.nomV = values[2];
    if (Number.isFinite(values[3])) this.warmTime = values[3];
    if (Number.isFinite(values[4])) this.coolTime = values[4];
    if (!Number.isFinite(this.temp)) this.temp = this.roomTemp;
    this.updateResistanceAndTemperature(false);
  }

  public override getDumpType(): number {
    return 181;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.temp} ${this.nomPow} ${this.nomV} ` +
      `${this.warmTime} ${this.coolTime}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "te", this.temp);
    XMLSerializer.dumpAttr(element, "np", this.nomPow);
    XMLSerializer.dumpAttr(element, "nv", this.nomV);
    XMLSerializer.dumpAttr(element, "wa", this.warmTime);
    XMLSerializer.dumpAttr(element, "co", this.coolTime);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.temp = xml.parseDoubleAttr("te", this.temp);
    this.nomPow = xml.parseDoubleAttr("np", this.nomPow);
    this.nomV = xml.parseDoubleAttr("nv", this.nomV);
    this.warmTime = xml.parseDoubleAttr("wa", this.warmTime);
    this.coolTime = xml.parseDoubleAttr("co", this.coolTime);
    this.updateResistanceAndTemperature(false);
  }

  public override reset(): void {
    super.reset();
    this.temp = this.roomTemp;
    this.updateResistanceAndTemperature(false);
  }

  public override calculateCurrent(): void {
    this.current =
      this.resistance === 0
        ? 0
        : (this.volts[0] - this.volts[1]) / this.resistance;
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override startIteration(): void {
    this.updateResistanceAndTemperature(true);
  }

  public override doStep(): void {
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      Math.max(this.resistance, 1e-9)
    );
  }

  private updateResistanceAndTemperature(advance: boolean): void {
    const nominalResistance =
      (this.nomV * this.nomV) / Math.max(this.nomPow, 1e-12);
    const effectiveTemp = Math.min(this.temp, 5390);
    this.resistance =
      nominalResistance *
      (1.26104 -
        4.90662 *
          Math.sqrt(
            Math.max(17.1839 / effectiveTemp - 0.00318794, 0)
          ) -
        7.8569 / (effectiveTemp - 187.56));
    this.resistance = Math.max(this.resistance, 1e-9);
    if (!advance) return;
    const heatCapacity = 1.57e-4 * this.nomPow;
    const warmCapacity =
      heatCapacity * Math.max(this.warmTime, 1e-12) / 0.4;
    const coolCapacity =
      heatCapacity * Math.max(this.coolTime, 1e-12) / 0.4;
    this.temp +=
      (this.getPower() * CircuitElm.sim.timeStep) / warmCapacity;
    const coolResistance = 2600 / Math.max(this.nomPow, 1e-12);
    this.temp -=
      CircuitElm.sim.timeStep *
      (this.temp - this.roomTemp) /
      (coolCapacity * coolResistance);
  }
}
