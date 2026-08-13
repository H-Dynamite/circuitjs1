import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Digital buffer with a configurable propagation delay. */
export class DelayBufferElm extends CircuitElm {
  public delay = 0;
  public threshold = 2.5;
  public highVoltage = 5;
  public delayEndTime = 0;

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
    this.noDiagonal = true;
    if (tokenizer.hasMoreTokens()) {
      const delay = Number(tokenizer.nextToken());
      if (Number.isFinite(delay)) this.delay = delay;
    }
    if (tokenizer.hasMoreTokens()) {
      const threshold = Number(tokenizer.nextToken());
      if (Number.isFinite(threshold)) this.threshold = threshold;
    }
    if (tokenizer.hasMoreTokens()) {
      const highVoltage = Number(tokenizer.nextToken());
      if (Number.isFinite(highVoltage)) this.highVoltage = highVoltage;
    }
  }

  public override getDumpType(): number {
    return 422;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.delay} ${this.threshold} ` +
      `${this.highVoltage}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "dl", this.delay);
    XMLSerializer.dumpAttr(element, "th", this.threshold);
    XMLSerializer.dumpAttr(element, "hv", this.highVoltage);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.delay = xml.parseDoubleAttr("dl", this.delay);
    this.threshold = xml.parseDoubleAttr("th", this.threshold);
    this.highVoltage = xml.parseDoubleAttr("hv", this.highVoltage);
  }

  public override setPoints(): void {
    super.setPoints();
    const width = Math.min(14, this.dn / 2);
    const distance = this.dn || 1;
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      0.5 - width / distance
    );
    this.lead2 = this.interpPoint(
      this.point1,
      this.point2,
      0.5 + width / distance
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
    if (this.voltSource === null) {
      throw new Error("Delay buffer source is unassigned");
    }
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[1],
      this.voltSource
    );
  }

  public override doStep(): void {
    if (this.voltSource === null) {
      throw new Error("Delay buffer source is unassigned");
    }
    const inputState = this.volts[0] > this.threshold;
    let outputState = this.volts[1] > this.threshold;
    if (inputState !== outputState) {
      if (CircuitElm.sim.t >= this.delayEndTime) {
        outputState = inputState;
      }
    } else {
      this.delayEndTime = CircuitElm.sim.t + this.delay;
    }
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[1],
      this.voltSource,
      outputState ? this.highVoltage : 0
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
