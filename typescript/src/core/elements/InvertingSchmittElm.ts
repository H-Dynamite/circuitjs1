import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Hysteretic inverting logic buffer ported from InvertingSchmittElm.java. */
export class InvertingSchmittElm extends CircuitElm {
  public slewRate = 0.5;
  public lowerTrigger = 1.66;
  public upperTrigger = 3.33;
  public state = false;
  public logicOnLevel = 5;
  public logicOffLevel = 0;
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
    const values: number[] = [];
    while (tokenizer?.hasMoreTokens() && values.length < 5) {
      values.push(Number(tokenizer.nextToken()));
    }
    if (Number.isFinite(values[0])) this.slewRate = values[0];
    if (Number.isFinite(values[1])) this.lowerTrigger = values[1];
    if (Number.isFinite(values[2])) this.upperTrigger = values[2];
    if (Number.isFinite(values[3])) this.logicOnLevel = values[3];
    if (Number.isFinite(values[4])) this.logicOffLevel = values[4];
  }

  public override getDumpType(): number {
    return 183;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.slewRate} ${this.lowerTrigger} ` +
      `${this.upperTrigger} ${this.logicOnLevel} ${this.logicOffLevel}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "slr", this.slewRate);
    XMLSerializer.dumpAttr(element, "lt", this.lowerTrigger);
    XMLSerializer.dumpAttr(element, "ut", this.upperTrigger);
    XMLSerializer.dumpAttr(element, "lon", this.logicOnLevel);
    XMLSerializer.dumpAttr(element, "loff", this.logicOffLevel);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.slewRate = xml.parseDoubleAttr("slr", this.slewRate);
    this.lowerTrigger = xml.parseDoubleAttr("lt", this.lowerTrigger);
    this.upperTrigger = xml.parseDoubleAttr("ut", this.upperTrigger);
    this.logicOnLevel = xml.parseDoubleAttr("lon", this.logicOnLevel);
    this.logicOffLevel = xml.parseDoubleAttr("loff", this.logicOffLevel);
  }

  public override setPoints(): void {
    super.setPoints();
    const width = Math.min(16, this.dn / 2);
    const length = this.dn || 1;
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      0.5 - width / length
    );
    this.lead2 = this.interpPoint(
      this.point1,
      this.point2,
      0.5 + (width + 2) / length
    );
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
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[1],
      this.requireVoltageSource()
    );
  }

  public override startIteration(): void {
    this.lastOutputVoltage = this.volts[1];
  }

  protected getDesiredOutput(input: number): number {
    if (this.state) {
      if (input > this.upperTrigger) this.state = false;
    } else if (input < this.lowerTrigger) {
      this.state = true;
    }
    return this.state ? this.logicOnLevel : this.logicOffLevel;
  }

  public override doStep(): void {
    const desired = this.getDesiredOutput(this.volts[0]);
    const maximumStep =
      this.slewRate * CircuitElm.sim.timeStep * 1e9;
    const output = Math.max(
      Math.min(this.lastOutputVoltage + maximumStep, desired),
      this.lastOutputVoltage - maximumStep
    );
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[1],
      this.requireVoltageSource(),
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

  protected requireVoltageSource(): VoltageSource {
    if (this.voltSource === null) {
      throw new Error("Schmitt trigger voltage source is unassigned");
    }
    return this.voltSource;
  }
}
