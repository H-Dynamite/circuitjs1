import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Digital inverter with slew limiting, ported from InverterElm.java. */
export class InverterElm extends CircuitElm {
  public slewRate = 0.5;
  public highVoltage = 5;
  public lastOutputVoltage = 0;

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
    this.noDiagonal = true;
    if (tokenizer?.hasMoreTokens()) {
      const slewRate = Number(tokenizer.nextToken());
      if (Number.isFinite(slewRate)) {
        this.slewRate = slewRate;
      }
    }
    if (tokenizer?.hasMoreTokens()) {
      const highVoltage = Number(tokenizer.nextToken());
      if (Number.isFinite(highVoltage)) {
        this.highVoltage = highVoltage;
      }
    }
  }

  public override getDumpType(): number {
    return "I".charCodeAt(0);
  }

  public override dump(): string {
    return `${super.dump()} ${this.slewRate} ${this.highVoltage}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "sl", this.slewRate);
    XMLSerializer.dumpAttr(element, "hi", this.highVoltage);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.slewRate = xml.parseDoubleAttr("sl", this.slewRate);
    this.highVoltage = xml.parseDoubleAttr("hi", this.highVoltage);
  }

  public override setPoints(): void {
    super.setPoints();
    const width = Math.min(16, this.dn / 2);
    const denominator = this.dn === 0 ? 1 : this.dn;
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      0.5 - width / denominator
    );
    this.lead2 = this.interpPoint(
      this.point1,
      this.point2,
      0.5 + (width + 2) / denominator
    );
    this.setBoundingBoxAroundPoints(this.point1, this.point2, 16);
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override setVoltageSource(
    _index: number,
    source: VoltageSource
  ): void {
    this.voltSource = source;
    source.setNodes(CircuitNode.ground, this.nodes[1]);
  }

  public override stamp(): void {
    if (this.voltSource === null) {
      throw new Error("Inverter voltage source has not been assigned");
    }
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[1],
      this.voltSource
    );
  }

  public override startIteration(): void {
    this.lastOutputVoltage = this.volts[1];
  }

  public override doStep(): void {
    if (this.voltSource === null) {
      throw new Error("Inverter voltage source has not been assigned");
    }
    const desired =
      this.volts[0] > this.highVoltage * 0.5 ? 0 : this.highVoltage;
    const maximumStep =
      this.slewRate * CircuitElm.sim.timeStep * 1e9;
    const output = Math.max(
      Math.min(this.lastOutputVoltage + maximumStep, desired),
      this.lastOutputVoltage - maximumStep
    );
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[1],
      this.voltSource,
      output
    );
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override getConnection(_first: number, _second: number): boolean {
    return false;
  }

  public override hasGroundConnection(node: number): boolean {
    return node === 1;
  }

  public override getCurrentIntoNode(node: number): number {
    return node === 1 ? this.current : 0;
  }
}
