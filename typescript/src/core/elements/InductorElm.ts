import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Inductor } from "./Inductor";

/** Electrical and serialization port of InductorElm.java. */
export class InductorElm extends CircuitElm {
  public readonly ind: Inductor;
  public inductance: number;
  public initialCurrent = 0;
  public saturationCurrent = 0;

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
    this.ind = new Inductor(CircuitElm.sim);
    this.inductance =
      tokenizer === undefined ? 1 : Number(tokenizer.nextToken());
    if (tokenizer !== undefined) {
      this.current = Number(tokenizer.nextToken());
      if (tokenizer.hasMoreTokens()) {
        this.initialCurrent = Number(tokenizer.nextToken());
      }
      if (tokenizer.hasMoreTokens()) {
        this.saturationCurrent = Number(tokenizer.nextToken());
      }
    }
    this.ind.setup(
      this.inductance,
      this.current,
      this.flags,
      this.saturationCurrent
    );
  }

  public override getDumpType(): number {
    return "l".charCodeAt(0);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.inductance} ${this.current} ` +
      `${this.initialCurrent} ${this.saturationCurrent}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "l", this.inductance);
    XMLSerializer.dumpAttr(element, "ic", this.initialCurrent);
    if (this.saturationCurrent !== 0) {
      XMLSerializer.dumpAttr(element, "isat", this.saturationCurrent);
    }
  }

  public dumpXmlState(_document: Document, element: Element): void {
    XMLSerializer.dumpAttr(element, "i", this.current);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.inductance = xml.parseDoubleAttr("l", this.inductance);
    this.initialCurrent = xml.parseDoubleAttr("ic", this.initialCurrent);
    this.current = xml.parseDoubleAttr("i", this.current);
    this.saturationCurrent = xml.parseDoubleAttr("isat", 0);
    this.ind.setup(
      this.inductance,
      this.current,
      this.flags,
      this.saturationCurrent
    );
  }

  public override reset(): void {
    this.volts.fill(0);
    this.curcount = 0;
    this.current = this.initialCurrent;
    this.ind.resetTo(this.initialCurrent);
  }

  public override stamp(): void {
    this.ind.stamp(this.nodes[0], this.nodes[1]);
  }

  public override startIteration(): void {
    this.ind.startIteration(this.volts[0] - this.volts[1]);
  }

  public override nonLinear(): boolean {
    return this.ind.nonLinear();
  }

  public override calculateCurrent(): void {
    this.current = this.ind.calculateCurrent(
      this.volts[0] - this.volts[1]
    );
  }

  public override doStep(): void {
    this.ind.doStep(this.volts[0] - this.volts[1]);
  }

  public getInductance(): number {
    return this.inductance;
  }

  public setInductance(inductance: number): void {
    this.inductance = inductance;
    this.updateInductor();
  }

  public setSaturationCurrent(current: number): void {
    this.saturationCurrent = current;
    this.updateInductor();
  }

  public getSaturationCurrent(): number {
    return this.saturationCurrent;
  }

  private updateInductor(): void {
    this.ind.setup(
      this.inductance,
      this.current,
      this.flags,
      this.saturationCurrent
    );
  }
}
