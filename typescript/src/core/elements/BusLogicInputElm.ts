import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Multi-bit interactive logic source ported from BusLogicInputElm.java. */
export class BusLogicInputElm extends CircuitElm {
  public busWidth = 4;
  public value = 0;
  public highVoltage = 5;
  public lowVoltage = 0;
  public voltageSources: Array<VoltageSource | null> = [];
  public currents: number[] = [];

  public constructor(x: number, y: number) {
    super(x, y);
    this.noDiagonal = true;
  }

  public override getXmlDumpType(): string {
    return "bli";
  }

  public override getPostCount(): number {
    return this.busWidth;
  }

  public override getPostWidth(_index: number): number {
    return this.busWidth;
  }

  public override getPost(index: number): Point {
    return new Point(this.x, this.y, index);
  }

  public override getVoltageSourceCount(): number {
    return this.busWidth;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    this.currents[index] = 0;
    source.setNodes(CircuitNode.ground, this.nodes[index]);
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    const index = this.voltageSources.indexOf(source);
    if (index >= 0) {
      this.currents[index] = current;
      this.current = current;
    }
  }

  public override getCurrentIntoNode(index: number): number {
    return this.currents[index] ?? 0;
  }

  public override stamp(): void {
    for (let bit = 0; bit < this.busWidth; bit += 1) {
      const source = this.voltageSources[bit];
      if (source === null || source === undefined) {
        throw new Error("Bus input voltage source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[bit],
        source,
        (this.value & (1 << bit)) !== 0
          ? this.highVoltage
          : this.lowVoltage
      );
    }
  }

  public toggle(): void {
    this.value = (this.value + 1) % (1 << this.busWidth);
  }

  public override hasGroundConnection(_index: number): boolean {
    return true;
  }

  public override isWireEquivalent(): boolean {
    return false;
  }

  public override isRemovableWire(): boolean {
    return false;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "bw", this.busWidth);
    if (this.value !== 0) XMLSerializer.dumpAttr(element, "va", this.value);
    if (this.highVoltage !== 5) {
      XMLSerializer.dumpAttr(element, "hi", this.highVoltage);
    }
    if (this.lowVoltage !== 0) {
      XMLSerializer.dumpAttr(element, "lo", this.lowVoltage);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.busWidth = xml.parseIntAttr("bw", this.busWidth);
    this.value = xml.parseIntAttr("va", 0);
    this.highVoltage = xml.parseDoubleAttr("hi", this.highVoltage);
    this.lowVoltage = xml.parseDoubleAttr("lo", this.lowVoltage);
    this.allocNodes();
    this.voltageSources = Array(this.busWidth).fill(null);
    this.currents = Array(this.busWidth).fill(0);
  }
}
