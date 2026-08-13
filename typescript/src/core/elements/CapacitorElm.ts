import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Electrical and serialization port of CapacitorElm.java. */
export class CapacitorElm extends CircuitElm {
  public static readonly FLAG_BACK_EULER = 2;
  public static readonly FLAG_RESISTANCE = 4;

  public capacitance: number;
  public compResistance = 0;
  public voltdiff = 0;
  public seriesResistance = 0;
  public initialVoltage: number;
  public capNode2 = 1;
  public curSourceValue = 0;

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
    this.capacitance =
      tokenizer === undefined ? 1e-5 : Number(tokenizer.nextToken());
    this.initialVoltage = 1e-3;
    if (tokenizer !== undefined) {
      this.voltdiff = Number(tokenizer.nextToken());
      if (tokenizer.hasMoreTokens()) {
        this.initialVoltage = Number(tokenizer.nextToken());
      }
      if (
        (this.flags & CapacitorElm.FLAG_RESISTANCE) !== 0 &&
        tokenizer.hasMoreTokens()
      ) {
        this.seriesResistance = Number(tokenizer.nextToken());
      }
      this.allocNodes();
    }
  }

  public isTrapezoidal(): boolean {
    return (this.flags & CapacitorElm.FLAG_BACK_EULER) === 0;
  }

  public override reset(): void {
    super.reset();
    this.current = 0;
    this.curcount = 0;
    this.curSourceValue = 0;
    this.voltdiff = this.initialVoltage;
  }

  public shorted(): void {
    super.reset();
    this.voltdiff = 0;
    this.current = 0;
    this.curcount = 0;
    this.curSourceValue = 0;
  }

  public override getDumpType(): number {
    return "c".charCodeAt(0);
  }

  public override dump(): string {
    this.flags |= CapacitorElm.FLAG_RESISTANCE;
    return (
      `${super.dump()} ${this.capacitance} ${this.voltdiff} ` +
      `${this.initialVoltage} ${this.seriesResistance}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "c", this.capacitance);
    XMLSerializer.dumpAttr(element, "iv", this.initialVoltage);
    XMLSerializer.dumpAttr(element, "sr", this.seriesResistance);
  }

  public dumpXmlState(_document: Document, element: Element): void {
    XMLSerializer.dumpAttr(element, "vd", this.voltdiff);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.capacitance = xml.parseDoubleAttr("c", this.capacitance);
    this.initialVoltage = xml.parseDoubleAttr("iv", this.initialVoltage);
    this.seriesResistance = xml.parseDoubleAttr(
      "sr",
      this.seriesResistance
    );
    this.voltdiff = xml.parseDoubleAttr("vd", this.voltdiff);
    this.allocNodes();
  }

  public override setPoints(): void {
    super.setPoints();
    if (this.dn === 0) {
      this.lead1 = this.point1;
      this.lead2 = this.point2;
      return;
    }
    const plateFraction = (this.dn / 2 - 4) / this.dn;
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      plateFraction
    );
    this.lead2 = this.interpPoint(
      this.point1,
      this.point2,
      1 - plateFraction
    );
  }

  public override stamp(): void {
    if (this.doDcAnalysis()) {
      CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], 1e8);
      this.curSourceValue = 0;
      this.capNode2 = 1;
      return;
    }

    this.capNode2 = this.seriesResistance > 0 ? 2 : 1;
    this.compResistance = this.isTrapezoidal()
      ? CircuitElm.sim.timeStep / (2 * this.capacitance)
      : CircuitElm.sim.timeStep / this.capacitance;
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[this.capNode2],
      this.compResistance
    );
    CircuitElm.sim.stampRightSide(this.nodes[0]);
    CircuitElm.sim.stampRightSide(this.nodes[this.capNode2]);
    if (this.seriesResistance > 0) {
      CircuitElm.sim.stampResistor(
        this.nodes[1],
        this.nodes[2],
        this.seriesResistance
      );
    }
  }

  public override startIteration(): void {
    this.curSourceValue = this.isTrapezoidal()
      ? -this.voltdiff / this.compResistance - this.current
      : -this.voltdiff / this.compResistance;
  }

  public override stepFinished(): void {
    this.voltdiff = this.volts[0] - this.volts[this.capNode2];
    this.calculateCurrent();
  }

  public override setNodeVoltage(index: number, voltage: number): void {
    this.volts[index] = voltage;
  }

  public override calculateCurrent(): void {
    const voltageDifference = this.volts[0] - this.volts[this.capNode2];
    if (this.doDcAnalysis()) {
      this.current = voltageDifference / 1e8;
    } else if (this.compResistance > 0) {
      this.current =
        voltageDifference / this.compResistance + this.curSourceValue;
    }
  }

  public override doStep(): void {
    if (!this.doDcAnalysis()) {
      CircuitElm.sim.stampCurrentSource(
        this.nodes[0],
        this.nodes[this.capNode2],
        this.curSourceValue
      );
    }
  }

  public override getInternalNodeCount(): number {
    return !this.doDcAnalysis() && this.seriesResistance > 0 ? 1 : 0;
  }

  public getCapacitance(): number {
    return this.capacitance;
  }

  public getSeriesResistance(): number {
    return this.seriesResistance;
  }

  public setCapacitance(capacitance: number): void {
    this.capacitance = capacitance;
  }

  public setSeriesResistance(resistance: number): void {
    this.seriesResistance = resistance;
    this.allocNodes();
  }

  public override isIdealCapacitor(): boolean {
    return this.seriesResistance === 0;
  }
}
