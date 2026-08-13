import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { DiodeElm } from "./DiodeElm";

/** Reverse-voltage-dependent junction capacitance in parallel with a diode. */
export class VaractorElm extends DiodeElm {
  public baseCapacitance = 4e-12;
  public capacitance = this.baseCapacitance;
  public capCurrent = 0;
  public capVoltageDifference = 0;
  public compResistance = 0;
  public voltageSourceValue = 0;

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
    const tokens = tokenizer ?? new StringTokenizer("");
    super(x, y, x2, y2, flags, tokens);
    if (tokens.hasMoreTokens()) {
      this.capVoltageDifference = Number(tokens.nextToken());
    }
    if (tokens.hasMoreTokens()) {
      this.baseCapacitance = Number(tokens.nextToken());
      this.capacitance = this.baseCapacitance;
    }
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 176;
  }

  public override getInternalNodeCount(): number {
    return 1;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.capVoltageDifference} ` +
      `${this.baseCapacitance}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ca", this.capVoltageDifference);
    XMLSerializer.dumpAttr(element, "ba", this.baseCapacitance);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.capVoltageDifference = xml.parseDoubleAttr(
      "ca",
      this.capVoltageDifference
    );
    this.baseCapacitance = xml.parseDoubleAttr(
      "ba",
      this.baseCapacitance
    );
    this.allocNodes();
  }

  public override reset(): void {
    super.reset();
    this.capVoltageDifference = 0;
    this.capCurrent = 0;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    source.setNodes(this.nodes[0], this.nodes[2]);
  }

  public override setCurrent(_source: VoltageSource, current: number): void {
    this.capCurrent = current;
  }

  public override stamp(): void {
    super.stamp();
    if (this.voltSource === null) {
      throw new Error("Varactor capacitor source is unassigned");
    }
    CircuitElm.sim.stampVoltageSource(
      this.nodes[0],
      this.nodes[2],
      this.voltSource
    );
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
  }

  public override startIteration(): void {
    const forwardDrop = this.model?.fwdrop ?? 0.805904783;
    this.capacitance =
      this.capVoltageDifference > 0
        ? this.baseCapacitance
        : this.baseCapacitance /
          Math.sqrt(1 - this.capVoltageDifference / forwardDrop);
    this.compResistance =
      CircuitElm.sim.timeStep / (2 * this.capacitance);
    this.voltageSourceValue =
      -this.capVoltageDifference -
      this.capCurrent * this.compResistance;
  }

  public override doStep(): void {
    super.doStep();
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[1],
      this.compResistance
    );
    if (this.voltSource === null) {
      throw new Error("Varactor capacitor source is unassigned");
    }
    CircuitElm.sim.updateVoltageSource(
      this.nodes[0],
      this.nodes[2],
      this.voltSource,
      this.voltageSourceValue
    );
  }

  public override calculateCurrent(): void {
    super.calculateCurrent();
    this.current += this.capCurrent;
  }

  public override stepFinished(): void {
    this.capVoltageDifference = this.volts[0] - this.volts[1];
  }
}
