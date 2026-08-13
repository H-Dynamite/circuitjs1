import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

export class AMElm extends CircuitElm {
  public static readonly FLAG_COS = 2;
  public carrierFrequency = 1000;
  public signalFrequency = 40;
  public maxVoltage = 5;
  public freqTimeZero = 0;

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
    if (tokenizer !== undefined) {
      this.carrierFrequency = Number(tokenizer.nextToken());
      this.signalFrequency = Number(tokenizer.nextToken());
      this.maxVoltage = Number(tokenizer.nextToken());
    }
    this.flags &= ~AMElm.FLAG_COS;
    this.reset();
  }

  public override getDumpType(): number {
    return 200;
  }

  public override getPostCount(): number {
    return 1;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    source.setNodes(CircuitNode.ground, this.nodes[0]);
  }

  public override reset(): void {
    this.freqTimeZero = 0;
    this.curcount = 0;
  }

  public override stamp(): void {
    if (this.voltSource === null) {
      throw new Error("AM voltage source has not been assigned");
    }
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[0],
      this.voltSource
    );
  }

  public override doStep(): void {
    if (this.voltSource === null) {
      throw new Error("AM voltage source has not been assigned");
    }
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[0],
      this.voltSource,
      this.getVoltage()
    );
  }

  public getVoltage(): number {
    const angle =
      2 * Math.PI * (CircuitElm.sim.t - this.freqTimeZero);
    return (
      ((Math.sin(angle * this.signalFrequency) + 1) / 2) *
      Math.sin(angle * this.carrierFrequency) *
      this.maxVoltage
    );
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override hasGroundConnection(_node: number): boolean {
    return true;
  }

  public override getPower(): number {
    return -this.getVoltageDiff() * this.current;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "cf", this.carrierFrequency);
    XMLSerializer.dumpAttr(element, "sf", this.signalFrequency);
    XMLSerializer.dumpAttr(element, "mv", this.maxVoltage);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.carrierFrequency = xml.parseDoubleAttr(
      "cf",
      this.carrierFrequency
    );
    this.signalFrequency = xml.parseDoubleAttr(
      "sf",
      this.signalFrequency
    );
    this.maxVoltage = xml.parseDoubleAttr("mv", this.maxVoltage);
    this.reset();
  }
}
